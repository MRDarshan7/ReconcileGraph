"""Integration tests for 3-key Gemini failover, deterministic fallback, and FastAPI ECO APIs."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

import backend.llm_client as llm_client
from backend.agents import run_verification_pipeline
from backend.db import get_connection, init_db, seed_corpus
from backend.main import DATA_DIR, app


class _DummySchema(BaseModel):
    message: str


def test_llm_client_failover_key1_429_to_key2(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEYS", "key-one,key-two,key-three")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.5-flash")

    calls: list[str] = []

    class _FakeModels:
        def __init__(self, api_key: str) -> None:
            self.api_key = api_key

        def generate_content(self, **kwargs):
            calls.append(self.api_key)
            if self.api_key == "key-one":
                raise RuntimeError("429 RESOURCE_EXHAUSTED: rate limit exceeded")
            return SimpleNamespace(parsed=_DummySchema(message="ok from key 2"))

    class _FakeClient:
        def __init__(self, api_key: str) -> None:
            self.models = _FakeModels(api_key)

    monkeypatch.setattr(llm_client.genai, "Client", _FakeClient)

    parsed, meta = llm_client.generate_structured("test prompt", _DummySchema, "TestStage")
    assert parsed.message == "ok from key 2"
    assert meta["mode"] == "LIVE_GEMINI"
    assert meta["key_slot"] == "Key #2"
    assert meta["attempts"] == 2
    assert calls == ["key-one", "key-two"]


def test_all_three_keys_fail_triggers_deterministic_fallback(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("GEMINI_API_KEYS", "k1,k2,k3")

    class _AlwaysFailModels:
        def __init__(self, api_key: str) -> None:
            self.api_key = api_key

        def generate_content(self, **kwargs):
            raise RuntimeError(f"429 quota exceeded for {self.api_key}")

    class _AlwaysFailClient:
        def __init__(self, api_key: str) -> None:
            self.models = _AlwaysFailModels(api_key)

    monkeypatch.setattr(llm_client.genai, "Client", _AlwaysFailClient)

    with pytest.raises(llm_client.AIAgentsInaccessibleError) as exc_info:
        llm_client.generate_structured("test", _DummySchema, "FailStage")
    assert "Key #1 failed" in str(exc_info.value)
    assert "Key #2 failed" in str(exc_info.value)
    assert "Key #3 failed" in str(exc_info.value)

    # Verify full pipeline handles AIAgentsInaccessibleError with explicit fallback notice
    db_file = str(tmp_path / "fallback_test.db")
    conn = get_connection(db_file)
    init_db(conn)
    seed_corpus(conn, data_dir=str(DATA_DIR))
    run_id = run_verification_pipeline(conn, scenario_id="eco_01_pump_upgrade")

    run_row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    assert run_row["execution_mode"] == "DETERMINISTIC_FALLBACK"
    assert run_row["fallback_notice"]
    assert "AI agents inaccessible" in run_row["fallback_notice"]
    conn.close()


def test_full_api_workflow_signoff_lock_and_ablation(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    # Force deterministic fallback cleanly without external network calls
    monkeypatch.setenv("GEMINI_API_KEYS", "")
    monkeypatch.delenv("GEMINI_API_KEY_1", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY_2", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY_3", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    app.state.db_path = str(tmp_path / "api_test.db")

    with TestClient(app) as client:
        health_res = client.get("/api/health")
        assert health_res.status_code == 200
        assert health_res.json()["status"] == "ok"

        scenarios_res = client.get("/api/scenarios")
        assert scenarios_res.status_code == 200
        assert len(scenarios_res.json()["scenarios"]) == 3

        docs_res = client.get("/api/documents")
        assert docs_res.status_code == 200
        assert len(docs_res.json()["documents"]) == 5

        # Create ECO-01 run
        run_res = client.post("/api/runs", json={"scenario_id": "eco_01_pump_upgrade"})
        assert run_res.status_code == 200
        run_data = run_res.json()
        run_id = run_data["run_id"]

        assert run_data["execution_mode"] == "DETERMINISTIC_FALLBACK"
        assert run_data["fallback_notice"]
        assert run_data["can_sign_off"] is False
        assert run_data["signed_off"] is False

        # Verify bounded retry events & ungrounded finding rejection
        rules = {evt["rule_id"] for evt in run_data["audit_events"]}
        assert "RULE_BOUNDED_RETRY_1" in rules
        assert "RULE_BOUNDED_RETRY_2" in rules
        assert "RULE_AUDIT_REJECT_UNGROUNDED" in rules

        audit_statuses = {f["audit_status"] for f in run_data["findings"]}
        assert "REJECTED" in audit_statuses
        assert "ESCALATED" in audit_statuses

        # Sign-off must return HTTP 409 while conflicts are OPEN
        locked_signoff = client.post(f"/api/runs/{run_id}/sign-off", json={"sign_off_note": "premature"})
        assert locked_signoff.status_code == 409

        # Resolve all OPEN conflicts
        open_conflicts = [c for c in run_data["conflicts"] if c["status"] == "OPEN"]
        assert len(open_conflicts) >= 5
        for cnf in open_conflicts:
            res = client.post(
                f"/api/runs/{run_id}/conflicts/{cnf['id']}/resolve",
                json={
                    "resolution_choice": "Accept engineering mitigation and re-test",
                    "reviewer_rationale": "Verified by senior process engineer.",
                },
            )
            assert res.status_code == 200
            run_data = res.json()

        assert run_data["can_sign_off"] is True
        assert any(evt["action"] == "decision re-checks impact" for evt in run_data["audit_events"])

        # Sign-off now succeeds with HTTP 200
        signoff_res = client.post(
            f"/api/runs/{run_id}/sign-off",
            json={"sign_off_note": "All conflicts resolved and re-verified."},
        )
        assert signoff_res.status_code == 200
        signed_data = signoff_res.json()
        assert signed_data["signed_off"] is True

        # Verify ablation benchmark endpoint
        ablation_res = client.get("/api/ablation")
        assert ablation_res.status_code == 200
        systems = ablation_res.json()["systems"]
        assert len(systems) == 3
        names = [s["name"] for s in systems]
        assert "Retrieval-Only (Naive RAG)" in names
        assert "Dependency-Graph-Only (Static Graph)" in names
        assert "ReconcileGraph (Ours)" in names
        assert systems[2]["metrics"]["overall_score"] == 1.0

        # Verify ECO-02 (seal swap): flags baseline conflict, zero downstream overloads
        eco2_res = client.post("/api/runs", json={"scenario_id": "eco_02_seal_swap"})
        assert eco2_res.status_code == 200
        eco2_data = eco2_res.json()
        eco2_conflict_types = {c["conflict_type"] for c in eco2_data["conflicts"]}
        assert "VALUE_MISMATCH" in eco2_conflict_types
        assert "DOWNSTREAM_OVERLOAD" not in eco2_conflict_types
        assert eco2_data["can_sign_off"] is False

        # Verify ECO-03 (valve upgrade): compatible with P-101, zero open conflicts
        eco3_res = client.post("/api/runs", json={"scenario_id": "eco_03_valve_upgrade"})
        assert eco3_res.status_code == 200
        eco3_data = eco3_res.json()
        assert eco3_data["conflicts"] == []
        assert eco3_data["can_sign_off"] is True

        # Verify custom_eco with attached/pasted spec text (psi parsed to bar)
        custom_res = client.post(
            "/api/runs",
            json={
                "scenario_id": None,
                "custom_eco": {
                    "target_entity_id": "P-101",
                    "title": "Custom Spec Upload Test",
                    "proposed_model": "Centriflo-600",
                    "proposed_spec_text": "Replacement Pump Centriflo-600, Proposed Discharge Pressure: 203 psi",
                },
            },
        )
        assert custom_res.status_code == 200
        custom_data = custom_res.json()
        assert custom_data["eco"]["target_entity"] == "P-101"
        assert custom_data["eco"]["proposed_changes"]["discharge_pressure_bar"] == 14.0
        assert custom_data["can_sign_off"] is False


def test_concurrent_ablation_and_runs_no_db_lock(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("GEMINI_API_KEYS", "")
    monkeypatch.delenv("GEMINI_API_KEY_1", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY_2", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY_3", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    app.state.db_path = str(tmp_path / "concurrent_test.db")

    with TestClient(app) as client:
        def call_ablation() -> int:
            return client.get("/api/ablation").status_code

        def call_run() -> int:
            return client.post("/api/runs", json={"scenario_id": "eco_01_pump_upgrade"}).status_code

        with ThreadPoolExecutor(max_workers=8) as pool:
            ablation_futures = [pool.submit(call_ablation) for _ in range(12)]
            run_futures = [pool.submit(call_run) for _ in range(4)]

            ablation_statuses = [f.result() for f in ablation_futures]
            run_statuses = [f.result() for f in run_futures]

        assert all(code == 200 for code in ablation_statuses)
        assert all(code == 200 for code in run_statuses)

