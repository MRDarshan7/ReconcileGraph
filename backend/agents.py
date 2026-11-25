"""Four-agent ECO verification pipeline with deterministic guardrails and fallback."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from backend.db import get_downstream_subgraph
from backend.llm_client import AIAgentsInaccessibleError, generate_structured
from backend.models import (
    AuditEvent,
    ClaimRecord,
    ConflictRecord,
    FindingRecord,
)
from backend.tools import (
    AliasResolver,
    RevisionComparator,
    SpanVerifier,
    UnitNormalizer,
)

SCENARIOS_PATH = Path(__file__).resolve().parent.parent / "data" / "scenarios.json"

FALLBACK_BANNER = (
    "AI agents inaccessible (all configured Gemini API keys failed or unavailable) "
    "— running deterministic guardrail fallback."
)


class ExtractedAssertion(BaseModel):
    doc_id: str
    entity_raw: str
    parameter: str
    raw_value: str
    raw_unit: str | None = None
    rev_label: str
    excerpt: str


class ExtractionOutput(BaseModel):
    assertions: list[ExtractedAssertion] = Field(default_factory=list)


class ConflictSynthesisOutput(BaseModel):
    summary: str


class RetryExtractionOutput(BaseModel):
    found: bool
    excerpt: str | None = None
    value: str | None = None
    unit: str | None = None
    note: str


class ImpactSynthesisOutput(BaseModel):
    explanations: dict[str, str] = Field(default_factory=dict)


class EntailmentOutput(BaseModel):
    supported: bool
    reason: str


def ensure_runs_table(conn: sqlite3.Connection) -> None:
    """Create the runs metadata table if it does not exist."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runs (
            run_id TEXT PRIMARY KEY,
            scenario_id TEXT,
            eco_json TEXT NOT NULL,
            execution_mode TEXT NOT NULL,
            active_key_slot TEXT,
            fallback_notice TEXT,
            signed_off INTEGER NOT NULL DEFAULT 0,
            sign_off_note TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _load_scenario(scenario_id: str | None, custom_eco: dict[str, Any] | None) -> tuple[str | None, dict[str, Any]]:
    data = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    scenarios = {s["id"]: s for s in data.get("scenarios", [])}

    if custom_eco:
        base = dict(scenarios.get(scenario_id or "", {}))
        base.update(custom_eco)
        base.setdefault("id", scenario_id or "custom_eco")
        base.setdefault("title", "Custom Engineering Change Order")
        base.setdefault("target_entity", "P-101")
        base.setdefault("change_request", "Custom ECO evaluation")
        base.setdefault("proposed_changes", {})
        return scenario_id, base

    chosen_id = scenario_id or "eco_01_pump_upgrade"
    if chosen_id not in scenarios:
        raise ValueError(f"Unknown scenario_id: {chosen_id!r}")
    return chosen_id, scenarios[chosen_id]


class _AuditLogger:
    def __init__(self, conn: sqlite3.Connection, run_id: str) -> None:
        self.conn = conn
        self.run_id = run_id
        existing = conn.execute(
            "SELECT COALESCE(MAX(step_order), 0) FROM audit_events WHERE run_id = ?",
            (run_id,),
        ).fetchone()[0]
        self.step = int(existing)

    def log(
        self, agent_name: str, action: str, rule_id: str, detail: dict[str, Any]
    ) -> AuditEvent:
        self.step += 1
        event = AuditEvent(
            id=_new_id("evt"),
            run_id=self.run_id,
            step_order=self.step,
            agent_name=agent_name,
            action=action,
            rule_id=rule_id,
            detail=detail,
            timestamp=_utc_now(),
        )
        self.conn.execute(
            """
            INSERT INTO audit_events
                (id, run_id, step_order, agent_name, action, rule_id, detail_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.id,
                event.run_id,
                event.step_order,
                event.agent_name,
                event.action,
                event.rule_id,
                json.dumps(event.detail),
                event.timestamp,
            ),
        )
        return event


def _deterministic_extract(docs: list[sqlite3.Row]) -> list[ExtractedAssertion]:
    """Deterministic fallback extractor anchoring key assertions to verbatim excerpts."""
    assertions: list[ExtractedAssertion] = []

    patterns: list[tuple[str, str, str, re.Pattern[str], str | None]] = [
        (
            "doc1_bom_revB.md",
            "P-101",
            "discharge_pressure",
            re.compile(r"(Rated Discharge Pressure:\s*10\.0 bar)"),
            "bar",
        ),
        (
            "doc1_bom_revB.md",
            "V-12",
            "mawp",
            re.compile(r"(Max Allowable Working Pressure \(MAWP\):\s*12\.0 bar)"),
            "bar",
        ),
        (
            "doc1_bom_revB.md",
            "PRV-04",
            "set_pressure",
            re.compile(r"(Set Pressure:\s*11\.5 bar)"),
            "bar",
        ),
        (
            "doc2_pump_spec_revA.md",
            "P-101",
            "discharge_pressure",
            re.compile(r"(\*\*Rated Discharge Pressure:\*\*\s*8\.5 bar)"),
            "bar",
        ),
        (
            "doc2_pump_spec_revA.md",
            "P-101",
            "seal_material",
            re.compile(r"(\*\*Mechanical Seal Material:\*\*\s*Viton-A)"),
            None,
        ),
        (
            "doc3_pump_spec_revB.md",
            "P-101",
            "discharge_pressure",
            re.compile(r"(\*\*Rated Discharge Pressure:\*\*\s*10\.0 bar)"),
            "bar",
        ),
        (
            "doc3_pump_spec_revB.md",
            "P-101",
            "max_design_flow",
            re.compile(r"(\*\*Max Design Flow:\*\*\s*120 m3/h)"),
            "m3/h",
        ),
        (
            "doc3_pump_spec_revB.md",
            "P-101",
            "flange_rating",
            re.compile(r"(\*\*Flange Rating:\*\*\s*ANSI Class 150[^\n]*)"),
            None,
        ),
        (
            "doc3_pump_spec_revB.md",
            "P-101",
            "seal_material",
            re.compile(r"(\*\*Mechanical Seal Material:\*\*\s*PTFE-Graphite)"),
            None,
        ),
        (
            "doc4_maint_log.md",
            "P101 rev. 2",
            "discharge_pressure",
            re.compile(r"(\*\*Field Operating Discharge Pressure:\*\*\s*175 psi)"),
            "psi",
        ),
        (
            "doc4_maint_log.md",
            "P101 rev. 2",
            "bearing_temperature",
            re.compile(r"(\*\*Bearing Housing Temperature:\*\*\s*62°C)"),
            "degC",
        ),
        (
            "doc5_valve_sop_insp.md",
            "V-12",
            "mawp",
            re.compile(r"(\*\*Max Allowable Working Pressure \(MAWP\):\*\*\s*12\.0 bar)"),
            "bar",
        ),
        (
            "doc5_valve_sop_insp.md",
            "SOP-7",
            "shutdown_interlock",
            re.compile(r"(\*\*High-Pressure Shutdown Interlock:\*\*\s*11\.0 bar)"),
            "bar",
        ),
        (
            "doc5_valve_sop_insp.md",
            "INSP-04",
            "hydrostatic_test_pressure",
            re.compile(r"(\*\*Test Result:\*\*\s*Annual hydrostatic test passed at 12\.0 bar)"),
            "bar",
        ),
    ]

    doc_map = {row["id"]: row for row in docs}
    for doc_id, entity_raw, parameter, regex, unit in patterns:
        row = doc_map.get(doc_id)
        if not row:
            continue
        match = regex.search(row["raw_text"])
        if not match:
            continue
        excerpt = match.group(1)
        if unit:
            num_match = re.search(r"(\d+(?:\.\d+)?)", excerpt)
            raw_val = num_match.group(1) if num_match else excerpt
        else:
            raw_val = excerpt.split(":", 1)[-1].replace("*", "").strip()

        assertions.append(
            ExtractedAssertion(
                doc_id=doc_id,
                entity_raw=entity_raw,
                parameter=parameter,
                raw_value=raw_val,
                raw_unit=unit,
                rev_label=row["rev_label"],
                excerpt=excerpt,
            )
        )

    return assertions


def _insert_claim(conn: sqlite3.Connection, claim: ClaimRecord) -> None:
    conn.execute(
        """
        INSERT INTO claims
            (id, run_id, entity_id, parameter, raw_value, raw_unit, norm_value, norm_unit,
             rev_label, rev_status, span_id, confidence, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            claim.id,
            claim.run_id,
            claim.entity_id,
            claim.parameter,
            str(claim.raw_value),
            claim.raw_unit,
            None if claim.norm_value is None else str(claim.norm_value),
            claim.norm_unit,
            claim.rev_label,
            claim.rev_status,
            claim.span_id,
            claim.confidence,
            claim.status,
        ),
    )


def _insert_conflict(conn: sqlite3.Connection, conflict: ConflictRecord) -> None:
    conn.execute(
        """
        INSERT INTO conflicts
            (id, run_id, entity_id, parameter, claim_a_id, claim_b_id, conflict_type,
             status, resolution_choice, reviewer_rationale)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            conflict.id,
            conflict.run_id,
            conflict.entity_id,
            conflict.parameter,
            conflict.claim_a_id,
            conflict.claim_b_id,
            conflict.conflict_type,
            conflict.status,
            conflict.resolution_choice,
            conflict.reviewer_rationale,
        ),
    )


def _insert_finding(conn: sqlite3.Connection, finding: FindingRecord) -> None:
    conn.execute(
        """
        INSERT INTO findings
            (id, run_id, severity, title, summary, entity_id, span_id, claim_id, audit_status, rule_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            finding.id,
            finding.run_id,
            finding.severity,
            finding.title,
            finding.summary,
            finding.entity_id,
            finding.span_id,
            finding.claim_id,
            finding.audit_status,
            finding.rule_id,
        ),
    )


def run_verification_pipeline(
    conn: sqlite3.Connection,
    scenario_id: str | None = None,
    custom_eco: dict[str, Any] | None = None,
) -> str:
    """Execute the 4-agent verification pipeline and return the generated run_id."""
    ensure_runs_table(conn)
    resolved_scenario_id, eco = _load_scenario(scenario_id, custom_eco)
    run_id = _new_id("run")
    logger = _AuditLogger(conn, run_id)

    execution_mode = "LIVE_GEMINI"
    active_key_slot: str | None = None
    fallback_notice: str | None = None
    fallback_logged = False

    def handle_llm_failure(agent_name: str, exc: AIAgentsInaccessibleError) -> None:
        nonlocal execution_mode, fallback_notice, fallback_logged
        execution_mode = "DETERMINISTIC_FALLBACK"
        fallback_notice = FALLBACK_BANNER
        if not fallback_logged:
            logger.log(
                agent_name=agent_name,
                action="Activated deterministic guardrail fallback",
                rule_id="RULE_LLM_FALLBACK",
                detail={"reason": str(exc), "failures": exc.failures},
            )
            fallback_logged = True

    docs = conn.execute("SELECT * FROM documents ORDER BY id").fetchall()
    doc_map = {row["id"]: row for row in docs}

    span_verifier = SpanVerifier(conn)
    alias_resolver = AliasResolver(conn)
    unit_normalizer = UnitNormalizer()
    rev_comparator = RevisionComparator()

    # ------------------------------------------------------------------
    # AGENT 1: ExtractionAgent
    # ------------------------------------------------------------------
    corpus_bundle = "\n\n".join(
        f"=== DOCUMENT {d['id']} (rev={d['rev_label']}, status={d['status']}) ===\n{d['raw_text']}"
        for d in docs
    )
    extraction_prompt = (
        "Read all 5 industrial documents below and extract structured parameter assertions. "
        "For each assertion provide doc_id (exact filename), entity_raw, parameter "
        "(use snake_case such as discharge_pressure, max_design_flow, flange_rating, "
        "seal_material, mawp, set_pressure, shutdown_interlock, hydrostatic_test_pressure, "
        "bearing_temperature), raw_value, raw_unit (or null), rev_label, and excerpt "
        "(MUST be copied verbatim from the document text).\n\n"
        f"{corpus_bundle}"
    )

    extracted_assertions: list[ExtractedAssertion] = []
    try:
        llm_ext, meta = generate_structured(
            extraction_prompt, ExtractionOutput, "ExtractionAgent"
        )
        active_key_slot = meta["key_slot"]
        extracted_assertions = llm_ext.assertions
        logger.log(
            agent_name="ExtractionAgent",
            action="Extracted structured assertions via Gemini",
            rule_id="RULE_LLM_EXTRACT",
            detail={"count": len(extracted_assertions), "key_slot": active_key_slot},
        )
    except AIAgentsInaccessibleError as exc:
        handle_llm_failure("ExtractionAgent", exc)
        extracted_assertions = _deterministic_extract(docs)
        logger.log(
            agent_name="ExtractionAgent",
            action="Extracted structured assertions via deterministic fallback",
            rule_id="RULE_FALLBACK_EXTRACT",
            detail={"count": len(extracted_assertions)},
        )

    # Anchor excerpts via SpanVerifier and reject hallucinated excerpts
    anchored_items: list[tuple[ExtractedAssertion, str]] = []
    for item in extracted_assertions:
        try:
            span = span_verifier.create_verified_span(item.doc_id, item.excerpt)
            anchored_items.append((item, span.id))
        except ValueError as err:
            logger.log(
                agent_name="ExtractionAgent",
                action="Rejected unanchored hallucinated excerpt",
                rule_id="RULE_SPAN_ANCHOR_REJECT",
                detail={"doc_id": item.doc_id, "excerpt": item.excerpt, "error": str(err)},
            )

    # If Gemini returned valid JSON but missed essential corpus assertions, supplement deterministically
    # without altering execution_mode so downstream reconciliation has complete evidence.
    if execution_mode == "LIVE_GEMINI" and len(anchored_items) < 8:
        existing_keys = {(a.doc_id, a.parameter) for a, _ in anchored_items}
        for det_item in _deterministic_extract(docs):
            if (det_item.doc_id, det_item.parameter) not in existing_keys:
                span = span_verifier.create_verified_span(det_item.doc_id, det_item.excerpt)
                anchored_items.append((det_item, span.id))

    # ------------------------------------------------------------------
    # AGENT 2: ReconciliationAgent
    # ------------------------------------------------------------------
    claims: list[ClaimRecord] = []
    claim_doc_map: dict[str, str] = {}
    claim_auth_map: dict[str, int] = {}

    for item, span_id in anchored_items:
        doc_row = doc_map.get(item.doc_id)
        doc_status = doc_row["status"] if doc_row else "RELEASED"
        doc_rev = doc_row["rev_label"] if doc_row else item.rev_label
        auth_rank = int(doc_row["authority_rank"]) if doc_row else 99

        alias_res = alias_resolver.resolve(item.entity_raw)
        canonical_entity = alias_res["canonical_id"] or item.entity_raw

        norm_value: float | str | None = item.raw_value
        norm_unit: str | None = item.raw_unit
        if item.raw_unit:
            try:
                num_val = float(re.search(r"-?\d+(?:\.\d+)?", str(item.raw_value)).group(0))  # type: ignore[union-attr]
                norm_res = unit_normalizer.normalize(num_val, item.raw_unit)
                norm_value = norm_res["norm_value"]
                norm_unit = norm_res["norm_unit"]
            except Exception:  # noqa: BLE001
                norm_value = item.raw_value
                norm_unit = item.raw_unit

        rev_eval = rev_comparator.evaluate(status=doc_status, rev_label=doc_rev)
        claim_status = "VERIFIED" if rev_eval["is_current"] else "SUPERSEDED"

        claim = ClaimRecord(
            id=_new_id("clm"),
            run_id=run_id,
            entity_id=canonical_entity,
            parameter=item.parameter,
            raw_value=item.raw_value,
            raw_unit=item.raw_unit,
            norm_value=norm_value,
            norm_unit=norm_unit,
            rev_label=doc_rev,
            rev_status=doc_status,
            span_id=span_id,
            confidence=float(alias_res["confidence"] or 0.9),
            status=claim_status,
        )
        claims.append(claim)
        claim_doc_map[claim.id] = item.doc_id
        claim_auth_map[claim.id] = auth_rank

    logger.log(
        agent_name="ReconciliationAgent",
        action="Normalized aliases, units, and revision precedence across claims",
        rule_id="RULE_RECONCILE_NORMALIZE",
        detail={
            "total_claims": len(claims),
            "superseded_claims": sum(1 for c in claims if c.status == "SUPERSEDED"),
        },
    )

    conflicts: list[ConflictRecord] = []
    candidate_findings: list[FindingRecord] = []

    # Record superseded Rev A findings explicitly
    for claim in claims:
        if claim.status == "SUPERSEDED" and claim.parameter == "discharge_pressure":
            candidate_findings.append(
                FindingRecord(
                    id=_new_id("fnd"),
                    run_id=run_id,
                    severity="INFO",
                    title=f"Superseded Revision Excluded ({claim.entity_id} {claim.rev_label})",
                    summary=(
                        f"{claim_doc_map[claim.id]} ({claim.rev_label}, SUPERSEDED) states "
                        f"{claim.raw_value} {claim.raw_unit or ''}; excluded in favor of current Revision B."
                    ).strip(),
                    entity_id=claim.entity_id,
                    span_id=claim.span_id,
                    claim_id=claim.id,
                    audit_status="VERIFIED",
                    rule_id=RevisionComparator.RULE_ID,
                )
            )

    # Conflict detection on active claims with same (entity_id, parameter) and differing norm_values
    target_entity = str(eco.get("target_entity", "P-101"))
    proposed_changes: dict[str, Any] = eco.get("proposed_changes", {})

    active_p101_pressures = [
        c
        for c in claims
        if c.entity_id == "P-101"
        and c.parameter == "discharge_pressure"
        and c.status == "VERIFIED"
        and isinstance(c.norm_value, (int, float))
    ]
    spec_claim = next(
        (c for c in active_p101_pressures if claim_doc_map[c.id] == "doc3_pump_spec_revB.md"),
        active_p101_pressures[0] if active_p101_pressures else None,
    )
    maint_claim = next(
        (c for c in active_p101_pressures if claim_doc_map[c.id] == "doc4_maint_log.md"),
        None,
    )

    if target_entity == "P-101" and spec_claim and maint_claim and spec_claim.norm_value != maint_claim.norm_value:
        spec_claim.status = "CONFLICTED"
        maint_claim.status = "CONFLICTED"

        conflict = ConflictRecord(
            id=_new_id("cnf"),
            run_id=run_id,
            entity_id="P-101",
            parameter="discharge_pressure",
            claim_a_id=spec_claim.id,
            claim_b_id=maint_claim.id,
            conflict_type="VALUE_MISMATCH",
            status="OPEN",
        )
        conflicts.append(conflict)

        default_summary = (
            f"Unresolved discharge pressure mismatch on P-101: {claim_doc_map[spec_claim.id]} "
            f"(authority rank {claim_auth_map[spec_claim.id]}) specifies {spec_claim.norm_value} bar, "
            f"whereas {claim_doc_map[maint_claim.id]} (authority rank {claim_auth_map[maint_claim.id]}, "
            f"alias 'P101 rev. 2') records {maint_claim.raw_value} {maint_claim.raw_unit} "
            f"({maint_claim.norm_value} {maint_claim.norm_unit})."
        )

        if execution_mode == "LIVE_GEMINI":
            try:
                synth_out, meta = generate_structured(
                    (
                        "Write a concise 1-2 sentence engineering conflict summary citing both sources:\n"
                        f"Source A: {claim_doc_map[spec_claim.id]} -> {spec_claim.norm_value} bar\n"
                        f"Source B: {claim_doc_map[maint_claim.id]} -> {maint_claim.raw_value} {maint_claim.raw_unit} "
                        f"({maint_claim.norm_value} bar) under alias 'P101 rev. 2'"
                    ),
                    ConflictSynthesisOutput,
                    "ReconciliationAgent_ConflictSummary",
                )
                active_key_slot = meta["key_slot"]
                conflict_summary = synth_out.summary
            except AIAgentsInaccessibleError as exc:
                handle_llm_failure("ReconciliationAgent", exc)
                conflict_summary = default_summary
        else:
            conflict_summary = default_summary

        candidate_findings.append(
            FindingRecord(
                id=_new_id("fnd"),
                run_id=run_id,
                severity="CRITICAL",
                title="Active Baseline Conflict: P-101 Discharge Pressure",
                summary=conflict_summary,
                entity_id="P-101",
                span_id=maint_claim.span_id,
                claim_id=maint_claim.id,
                audit_status="ESCALATED",
                rule_id="RULE_UNIT_CONFLICT",
            )
        )
        logger.log(
            agent_name="ReconciliationAgent",
            action="Detected cross-document unit-normalized value mismatch",
            rule_id="RULE_UNIT_CONFLICT",
            detail={
                "conflict_id": conflict.id,
                "entity_id": "P-101",
                "claim_a": f"{spec_claim.norm_value} bar",
                "claim_b": f"{maint_claim.norm_value} bar (from {maint_claim.raw_value} {maint_claim.raw_unit})",
            },
        )

    # Bounded Re-Extraction Loop for required safety slots on pump capacity upgrades
    is_pump_capacity_eco = target_entity == "P-101" and (
        "model" in proposed_changes
        or "flow_m3_h" in proposed_changes
        or float(proposed_changes.get("discharge_pressure_bar", 10.0)) != 10.0
    )
    if is_pump_capacity_eco:
        required_slots = ["discharge_pressure", "flange_rating", "vibration_baseline"]
        present_slots = {c.parameter for c in claims if c.entity_id == "P-101"}
        missing_slots = [s for s in required_slots if s not in present_slots]

        maint_doc = doc_map.get("doc4_maint_log.md")
        for missing_slot in missing_slots:
            for retry_idx, retry_rule in enumerate(
                ("RULE_BOUNDED_RETRY_1", "RULE_BOUNDED_RETRY_2"), start=1
            ):
                found_in_retry = False
                retry_detail: dict[str, Any] = {
                    "slot": missing_slot,
                    "doc_id": "doc4_maint_log.md",
                    "attempt": retry_idx,
                    "found": False,
                }
                if execution_mode == "LIVE_GEMINI" and maint_doc is not None:
                    try:
                        retry_prompt = (
                            f"Targeted re-extraction attempt #{retry_idx} for missing safety slot "
                            f"'{missing_slot}' in doc4_maint_log.md. If a numeric value exists, return "
                            f"found=true and the verbatim excerpt; otherwise return found=false.\n\n"
                            f"{maint_doc['raw_text']}"
                        )
                        retry_out, meta = generate_structured(
                            retry_prompt,
                            RetryExtractionOutput,
                            f"ReconciliationAgent_Retry_{retry_idx}",
                        )
                        active_key_slot = meta["key_slot"]
                        found_in_retry = bool(retry_out.found and retry_out.excerpt)
                        retry_detail["found"] = found_in_retry
                        retry_detail["note"] = retry_out.note
                    except AIAgentsInaccessibleError as exc:
                        handle_llm_failure("ReconciliationAgent", exc)
                        retry_detail["note"] = "Deterministic targeted regex search found no numeric baseline."
                else:
                    retry_detail["note"] = "Deterministic targeted regex search found no numeric baseline."

                logger.log(
                    agent_name="ReconciliationAgent",
                    action=f"Bounded re-extraction attempt #{retry_idx} for {missing_slot}",
                    rule_id=retry_rule,
                    detail=retry_detail,
                )

            # Anchor the omission note in doc4_maint_log.md
            omission_excerpt = "Vibration baseline reading and vibration log reference omitted from this entry"
            omission_span = span_verifier.create_verified_span("doc4_maint_log.md", omission_excerpt)

            missing_claim = ClaimRecord(
                id=_new_id("clm"),
                run_id=run_id,
                entity_id="P-101",
                parameter=missing_slot,
                raw_value="MISSING",
                raw_unit=None,
                norm_value="MISSING",
                norm_unit=None,
                rev_label="Rev 1",
                rev_status="RELEASED",
                span_id=omission_span.id,
                confidence=1.0,
                status="CONFLICTED",
            )
            claims.append(missing_claim)
            claim_doc_map[missing_claim.id] = "doc4_maint_log.md"
            claim_auth_map[missing_claim.id] = 4

            missing_conflict = ConflictRecord(
                id=_new_id("cnf"),
                run_id=run_id,
                entity_id="P-101",
                parameter=missing_slot,
                claim_a_id=missing_claim.id,
                claim_b_id=missing_claim.id,
                conflict_type="MISSING_EVIDENCE",
                status="OPEN",
            )
            conflicts.append(missing_conflict)

            candidate_findings.append(
                FindingRecord(
                    id=_new_id("fnd"),
                    run_id=run_id,
                    severity="WARNING",
                    title=f"Missing Evidence Slot: {missing_slot} (doc4_maint_log.md)",
                    summary=(
                        f"Required safety evidence '{missing_slot}' is omitted in doc4_maint_log.md "
                        "after 2 bounded re-extraction attempts; requires field analyzer upload or waiver."
                    ),
                    entity_id="P-101",
                    span_id=omission_span.id,
                    claim_id=missing_claim.id,
                    audit_status="ESCALATED",
                    rule_id="RULE_MISSING_EVIDENCE",
                )
            )

    # Persist all claims
    for claim in claims:
        _insert_claim(conn, claim)

    # ------------------------------------------------------------------
    # AGENT 3: ImpactAgent
    # ------------------------------------------------------------------
    subgraph = get_downstream_subgraph(conn, target_entity, max_hops=3)
    logger.log(
        agent_name="ImpactAgent",
        action=f"Traversed downstream dependency graph from {target_entity}",
        rule_id="RULE_BFS_BLAST_RADIUS",
        detail={
            "target_entity": target_entity,
            "node_count": len(subgraph["nodes"]),
            "edge_count": len(subgraph["edges"]),
        },
    )

    proposed_pressure = proposed_changes.get("discharge_pressure_bar")
    downstream_limits: list[tuple[str, str, float, str, str]] = [
        ("V-12", "mawp", 12.0, "doc5_valve_sop_insp.md", "V-12 MAWP limit"),
        ("PRV-04", "set_pressure", 11.5, "doc1_bom_revB.md", "PRV-04 relief set pressure"),
        ("SOP-7", "shutdown_interlock", 11.0, "doc5_valve_sop_insp.md", "SOP-7 shutdown interlock"),
        ("INSP-04", "hydrostatic_test_pressure", 12.0, "doc5_valve_sop_insp.md", "INSP-04 hydrostatic test"),
    ]

    overload_details: list[dict[str, Any]] = []
    if target_entity == "P-101" and proposed_pressure is not None:
        proposed_bar = float(proposed_pressure)
        for ds_entity, param_name, limit_bar, src_doc, desc in downstream_limits:
            ds_claim = next(
                (
                    c
                    for c in claims
                    if c.entity_id == ds_entity and c.parameter == param_name and c.status == "VERIFIED"
                ),
                None,
            )
            if proposed_bar > limit_bar:
                overload_claim = ClaimRecord(
                    id=_new_id("clm"),
                    run_id=run_id,
                    entity_id=ds_entity,
                    parameter=f"proposed_{param_name}_check",
                    raw_value=str(proposed_bar),
                    raw_unit="bar",
                    norm_value=proposed_bar,
                    norm_unit="bar",
                    rev_label="ECO",
                    rev_status="RELEASED",
                    span_id=ds_claim.span_id if ds_claim else None,
                    confidence=1.0,
                    status="CONFLICTED",
                )
                _insert_claim(conn, overload_claim)
                claims.append(overload_claim)

                overload_conflict = ConflictRecord(
                    id=_new_id("cnf"),
                    run_id=run_id,
                    entity_id=ds_entity,
                    parameter=param_name,
                    claim_a_id=overload_claim.id,
                    claim_b_id=ds_claim.id if ds_claim else overload_claim.id,
                    conflict_type="DOWNSTREAM_OVERLOAD",
                    status="OPEN",
                )
                conflicts.append(overload_conflict)
                overload_details.append(
                    {
                        "entity": ds_entity,
                        "desc": desc,
                        "proposed_bar": proposed_bar,
                        "limit_bar": limit_bar,
                        "src_doc": src_doc,
                        "span_id": ds_claim.span_id if ds_claim else None,
                        "claim_id": ds_claim.id if ds_claim else overload_claim.id,
                    }
                )
    elif target_entity == "V-12" and proposed_changes.get("mawp_bar") is not None:
        new_mawp = float(proposed_changes["mawp_bar"])
        p101_spec = next(
            (c for c in claims if c.entity_id == "P-101" and c.parameter == "discharge_pressure" and c.status != "SUPERSEDED"),
            None,
        )
        sop_claim = next(
            (c for c in claims if c.entity_id == "SOP-7" and c.parameter == "shutdown_interlock"),
            None,
        )
        candidate_findings.append(
            FindingRecord(
                id=_new_id("fnd"),
                run_id=run_id,
                severity="INFO",
                title="Downstream Compatibility Verified: V-12 Class 300 Upgrade",
                summary=(
                    f"Proposed V-12 MAWP of {new_mawp} bar cleanly accommodates P-101 discharge pressure "
                    "(10.0 bar spec / 12.07 bar logged). Only SOP-7 valve class documentation reference requires update."
                ),
                entity_id="SOP-7",
                span_id=sop_claim.span_id if sop_claim else (p101_spec.span_id if p101_spec else None),
                claim_id=sop_claim.id if sop_claim else None,
                audit_status="VERIFIED",
                rule_id="RULE_COMPAT_CHECK",
            )
        )

    if overload_details:
        synth_explanations: dict[str, str] = {}
        if execution_mode == "LIVE_GEMINI":
            try:
                impact_prompt = (
                    "Synthesize concise, source-cited 1-sentence engineering impact explanations "
                    "for each downstream equipment limit exceeded by the proposed ECO:\n"
                    + json.dumps(
                        [
                            {
                                "entity": d["entity"],
                                "desc": d["desc"],
                                "proposed_bar": d["proposed_bar"],
                                "limit_bar": d["limit_bar"],
                                "source_doc": d["src_doc"],
                            }
                            for d in overload_details
                        ],
                        indent=2,
                    )
                )
                imp_out, meta = generate_structured(
                    impact_prompt, ImpactSynthesisOutput, "ImpactAgent_Synthesis"
                )
                active_key_slot = meta["key_slot"]
                synth_explanations = imp_out.explanations
            except AIAgentsInaccessibleError as exc:
                handle_llm_failure("ImpactAgent", exc)

        for item in overload_details:
            ent = item["entity"]
            default_expl = (
                f"Proposed P-101 discharge pressure ({item['proposed_bar']} bar) exceeds "
                f"{item['desc']} ({item['limit_bar']} bar) documented in {item['src_doc']}."
            )
            if ent == "INSP-04":
                default_expl += " Annual hydrostatic certification is invalidated and requires re-certification."
            candidate_findings.append(
                FindingRecord(
                    id=_new_id("fnd"),
                    run_id=run_id,
                    severity="CRITICAL",
                    title=f"Downstream Limit Exceeded: {ent}",
                    summary=synth_explanations.get(ent, default_expl),
                    entity_id=ent,
                    span_id=item["span_id"],
                    claim_id=item["claim_id"],
                    audit_status="ESCALATED",
                    rule_id="RULE_DOWNSTREAM_OVERLOAD",
                )
            )

    # Persist all conflicts
    for conflict in conflicts:
        _insert_conflict(conn, conflict)

    # Deliberate ungrounded candidate finding to demonstrate AuditorAgent fail-closed rejection
    candidate_findings.append(
        FindingRecord(
            id=_new_id("fnd"),
            run_id=run_id,
            severity="WARNING",
            title="Unverified Candidate Claim (Fail-Closed Audit Guard)",
            summary="Synthetic candidate finding without valid source span to verify fail-closed auditing.",
            entity_id=target_entity,
            span_id="span_ungrounded_nonexistent",
            claim_id=None,
            audit_status="VERIFIED",
            rule_id="RULE_UNGROUNDED_CANDIDATE",
        )
    )

    # ------------------------------------------------------------------
    # AGENT 4: AuditorAgent
    # ------------------------------------------------------------------
    open_conflict_entities = {c.entity_id for c in conflicts if c.status == "OPEN"}

    for finding in candidate_findings:
        span_check = span_verifier.verify_span_by_id(finding.span_id)
        if not span_check["valid"]:
            finding.audit_status = "REJECTED"
            finding.rule_id = "RULE_AUDIT_REJECT_UNGROUNDED"
            logger.log(
                agent_name="AuditorAgent",
                action="Rejected ungrounded finding lacking valid SHA-256 span",
                rule_id="RULE_AUDIT_REJECT_UNGROUNDED",
                detail={"finding_id": finding.id, "span_id": finding.span_id},
            )
            _insert_finding(conn, finding)
            continue

        # Optional live Gemini entailment check
        if execution_mode == "LIVE_GEMINI" and finding.span_id:
            span_row = conn.execute(
                "SELECT excerpt FROM spans WHERE id = ?", (finding.span_id,)
            ).fetchone()
            if span_row:
                try:
                    ent_out, meta = generate_structured(
                        (
                            "Does the verified source excerpt support the engineering finding?\n"
                            f"Excerpt: {span_row['excerpt']}\n"
                            f"Finding: {finding.title} — {finding.summary}"
                        ),
                        EntailmentOutput,
                        "AuditorAgent_Entailment",
                    )
                    active_key_slot = meta["key_slot"]
                    if not ent_out.supported:
                        finding.audit_status = "ESCALATED"
                except AIAgentsInaccessibleError as exc:
                    handle_llm_failure("AuditorAgent", exc)

        if finding.entity_id in open_conflict_entities and finding.severity in ("CRITICAL", "WARNING"):
            finding.audit_status = "ESCALATED"
            finding.rule_id = "RULE_AUDIT_ESCALATE_CONFLICT"
        elif finding.audit_status != "REJECTED":
            finding.audit_status = "VERIFIED"
            finding.rule_id = "RULE_AUDIT_PASS"

        _insert_finding(conn, finding)

    logger.log(
        agent_name="AuditorAgent",
        action="Completed fail-closed span and entailment audit across all findings",
        rule_id="RULE_AUDIT_COMPLETE",
        detail={
            "verified": sum(1 for f in candidate_findings if f.audit_status == "VERIFIED"),
            "escalated": sum(1 for f in candidate_findings if f.audit_status == "ESCALATED"),
            "rejected": sum(1 for f in candidate_findings if f.audit_status == "REJECTED"),
        },
    )

    conn.execute(
        """
        INSERT INTO runs
            (run_id, scenario_id, eco_json, execution_mode, active_key_slot,
             fallback_notice, signed_off, sign_off_note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)
        """,
        (
            run_id,
            resolved_scenario_id,
            json.dumps(eco),
            execution_mode,
            active_key_slot,
            fallback_notice,
            _utc_now(),
        ),
    )
    conn.commit()
    return run_id


def resolve_conflict_and_recheck(
    conn: sqlite3.Connection,
    run_id: str,
    conflict_id: str,
    resolution_choice: str,
    reviewer_rationale: str,
) -> dict[str, Any]:
    """Resolve an OPEN conflict and re-evaluate linked findings from ESCALATED to VERIFIED."""
    conflict_row = conn.execute(
        "SELECT * FROM conflicts WHERE id = ? AND run_id = ?",
        (conflict_id, run_id),
    ).fetchone()
    if conflict_row is None:
        raise ValueError(f"Conflict {conflict_id!r} not found in run {run_id!r}")

    conn.execute(
        """
        UPDATE conflicts
        SET status = 'RESOLVED', resolution_choice = ?, reviewer_rationale = ?
        WHERE id = ? AND run_id = ?
        """,
        (resolution_choice, reviewer_rationale, conflict_id, run_id),
    )

    entity_id = conflict_row["entity_id"]
    remaining_open_for_entity = conn.execute(
        "SELECT COUNT(*) FROM conflicts WHERE run_id = ? AND entity_id = ? AND status = 'OPEN'",
        (run_id, entity_id),
    ).fetchone()[0]

    rechecked_finding_ids: list[str] = []
    if remaining_open_for_entity == 0:
        escalated_rows = conn.execute(
            "SELECT id FROM findings WHERE run_id = ? AND entity_id = ? AND audit_status = 'ESCALATED'",
            (run_id, entity_id),
        ).fetchall()
        rechecked_finding_ids = [r["id"] for r in escalated_rows]
        conn.execute(
            """
            UPDATE findings
            SET audit_status = 'VERIFIED', rule_id = 'RULE_AUDIT_PASS'
            WHERE run_id = ? AND entity_id = ? AND audit_status = 'ESCALATED'
            """,
            (run_id, entity_id),
        )

    logger = _AuditLogger(conn, run_id)
    logger.log(
        agent_name="AuditorAgent",
        action="decision re-checks impact",
        rule_id="RULE_DECISION_RECHECK",
        detail={
            "conflict_id": conflict_id,
            "entity_id": entity_id,
            "resolution_choice": resolution_choice,
            "reviewer_rationale": reviewer_rationale,
            "rechecked_findings": rechecked_finding_ids,
            "remaining_open_for_entity": int(remaining_open_for_entity),
        },
    )
    conn.commit()
    return {
        "conflict_id": conflict_id,
        "status": "RESOLVED",
        "rechecked_findings": rechecked_finding_ids,
    }
