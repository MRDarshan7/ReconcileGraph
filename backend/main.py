"""FastAPI server exposing ReconcileGraph verification, conflict resolution, and ablation APIs."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.agents import (
    ensure_runs_table,
    resolve_conflict_and_recheck,
    run_verification_pipeline,
)
from backend.db import get_connection, get_downstream_subgraph, init_db, seed_corpus
from backend.evaluator import run_ablation_benchmark
from backend.llm_client import get_configured_keys, get_model_name

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DEFAULT_DB_PATH = str(BASE_DIR / "reconcilegraph.db")


class CreateRunRequest(BaseModel):
    scenario_id: str | None = None
    custom_eco: dict[str, Any] | None = None


class ResolveConflictRequest(BaseModel):
    resolution_choice: str
    reviewer_rationale: str


class SignOffRequest(BaseModel):
    sign_off_note: str | None = None


def _get_db(app_instance: FastAPI) -> sqlite3.Connection:
    db_path = getattr(app_instance.state, "db_path", None) or os.getenv(
        "RECONCILEGRAPH_DB", DEFAULT_DB_PATH
    )
    conn = get_connection(db_path)
    init_db(conn)
    ensure_runs_table(conn)
    return conn


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    conn = _get_db(app_instance)
    try:
        seed_corpus(conn, data_dir=str(DATA_DIR))
    finally:
        conn.close()
    yield


app = FastAPI(title="ReconcileGraph API", version="0.1.0", lifespan=lifespan)
app.state.db_path = os.getenv("RECONCILEGRAPH_DB", DEFAULT_DB_PATH)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_run_payload(conn: sqlite3.Connection, run_id: str) -> dict[str, Any]:
    run_row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    if run_row is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

    eco = json.loads(run_row["eco_json"])
    target_entity = eco.get("target_entity", "P-101")

    claims = [
        dict(r)
        for r in conn.execute("SELECT * FROM claims WHERE run_id = ?", (run_id,)).fetchall()
    ]
    conflicts = [
        dict(r)
        for r in conn.execute("SELECT * FROM conflicts WHERE run_id = ?", (run_id,)).fetchall()
    ]
    findings = [
        dict(r)
        for r in conn.execute("SELECT * FROM findings WHERE run_id = ?", (run_id,)).fetchall()
    ]
    audit_events = []
    for r in conn.execute(
        "SELECT * FROM audit_events WHERE run_id = ? ORDER BY step_order ASC", (run_id,)
    ).fetchall():
        evt = dict(r)
        evt["detail"] = json.loads(evt.pop("detail_json"))
        audit_events.append(evt)

    span_ids = sorted(
        {
            s
            for s in ([c["span_id"] for c in claims] + [f["span_id"] for f in findings])
            if s
        }
    )
    spans = []
    if span_ids:
        placeholders = ",".join("?" for _ in span_ids)
        spans = [
            dict(r)
            for r in conn.execute(
                f"SELECT * FROM spans WHERE id IN ({placeholders})", span_ids
            ).fetchall()
        ]

    documents = [
        dict(r) for r in conn.execute("SELECT * FROM documents ORDER BY id").fetchall()
    ]
    subgraph = get_downstream_subgraph(conn, target_entity, max_hops=3)

    open_conflicts = sum(1 for c in conflicts if c["status"] == "OPEN")

    return {
        "run_id": run_row["run_id"],
        "scenario_id": run_row["scenario_id"],
        "eco": eco,
        "execution_mode": run_row["execution_mode"],
        "active_key_slot": run_row["active_key_slot"],
        "fallback_notice": run_row["fallback_notice"],
        "can_sign_off": open_conflicts == 0,
        "signed_off": bool(run_row["signed_off"]),
        "sign_off_note": run_row["sign_off_note"],
        "created_at": run_row["created_at"],
        "findings": findings,
        "conflicts": conflicts,
        "claims": claims,
        "spans": spans,
        "documents": documents,
        "subgraph": subgraph,
        "audit_events": audit_events,
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    keys = get_configured_keys()
    return {
        "status": "ok",
        "configured_gemini_keys": len(keys),
        "model": get_model_name(),
    }


@app.get("/api/scenarios")
def get_scenarios() -> dict[str, Any]:
    return json.loads((DATA_DIR / "scenarios.json").read_text(encoding="utf-8"))


@app.get("/api/documents")
def get_documents() -> dict[str, Any]:
    conn = _get_db(app)
    try:
        if conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0] == 0:
            seed_corpus(conn, data_dir=str(DATA_DIR))
        rows = conn.execute("SELECT * FROM documents ORDER BY id").fetchall()
        return {"documents": [dict(r) for r in rows]}
    finally:
        conn.close()


@app.post("/api/runs")
def create_run(payload: CreateRunRequest | None = None) -> dict[str, Any]:
    req = payload or CreateRunRequest()
    conn = _get_db(app)
    try:
        if conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0] == 0:
            seed_corpus(conn, data_dir=str(DATA_DIR))
        run_id = run_verification_pipeline(
            conn, scenario_id=req.scenario_id, custom_eco=req.custom_eco
        )
        return _build_run_payload(conn, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    conn = _get_db(app)
    try:
        return _build_run_payload(conn, run_id)
    finally:
        conn.close()


@app.post("/api/runs/{run_id}/conflicts/{conflict_id}/resolve")
def resolve_conflict(
    run_id: str, conflict_id: str, payload: ResolveConflictRequest
) -> dict[str, Any]:
    conn = _get_db(app)
    try:
        resolve_conflict_and_recheck(
            conn,
            run_id=run_id,
            conflict_id=conflict_id,
            resolution_choice=payload.resolution_choice,
            reviewer_rationale=payload.reviewer_rationale,
        )
        return _build_run_payload(conn, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        conn.close()


@app.post("/api/runs/{run_id}/sign-off")
def sign_off_run(run_id: str, payload: SignOffRequest | None = None) -> dict[str, Any]:
    conn = _get_db(app)
    try:
        run_row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if run_row is None:
            raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

        open_count = conn.execute(
            "SELECT COUNT(*) FROM conflicts WHERE run_id = ? AND status = 'OPEN'",
            (run_id,),
        ).fetchone()[0]
        if open_count > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot sign off ECO while {open_count} OPEN conflict(s) remain.",
            )

        note = (payload.sign_off_note if payload else None) or "Approved after conflict resolution."
        conn.execute(
            "UPDATE runs SET signed_off = 1, sign_off_note = ? WHERE run_id = ?",
            (note, run_id),
        )
        max_step = conn.execute(
            "SELECT COALESCE(MAX(step_order), 0) FROM audit_events WHERE run_id = ?",
            (run_id,),
        ).fetchone()[0]
        conn.execute(
            """
            INSERT INTO audit_events
                (id, run_id, step_order, agent_name, action, rule_id, detail_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                f"evt_signoff_{run_id[-6:]}",
                run_id,
                int(max_step) + 1,
                "ReviewGate",
                "ECO signed off cleanly",
                "RULE_ECO_SIGNOFF",
                json.dumps({"sign_off_note": note}),
            ),
        )
        conn.commit()
        return _build_run_payload(conn, run_id)
    finally:
        conn.close()


@app.get("/api/ablation")
def get_ablation() -> dict[str, Any]:
    return run_ablation_benchmark()
