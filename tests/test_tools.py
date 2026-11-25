"""Unit tests for SQLite seeding, deterministic BFS, and engineering guardrail tools."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.db import get_connection, get_downstream_subgraph, init_db, seed_corpus
from backend.tools import (
    AliasResolver,
    RevisionComparator,
    SpanVerifier,
    UnitNormalizer,
)

DATA_DIR = str(Path(__file__).resolve().parent.parent / "data")


@pytest.fixture()
def seeded_conn():
    conn = get_connection(":memory:")
    init_db(conn)
    seed_corpus(conn, data_dir=DATA_DIR)
    yield conn
    conn.close()


def test_seed_corpus_loads_all_records(seeded_conn) -> None:
    doc_count = seeded_conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    entity_count = seeded_conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
    edge_count = seeded_conn.execute("SELECT COUNT(*) FROM edges").fetchone()[0]

    assert doc_count == 5
    assert entity_count == 5
    assert edge_count == 5

    # Verify idempotency on second seed call
    counts = seed_corpus(seeded_conn, data_dir=DATA_DIR)
    assert counts == {"documents": 5, "entities": 5, "edges": 5}
    assert seeded_conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0] == 5


def test_alias_resolver_maps_variants_to_canonical_p101(seeded_conn) -> None:
    resolver = AliasResolver(seeded_conn)

    res_maint = resolver.resolve("P101 rev. 2")
    assert res_maint["canonical_id"] == "P-101"
    assert res_maint["confidence"] >= 0.9
    assert res_maint["rule_id"] == "RULE_ALIAS_NORM"

    res_rev_b = resolver.resolve("P-101 Rev B")
    assert res_rev_b["canonical_id"] == "P-101"
    assert res_rev_b["rule_id"] == "RULE_ALIAS_NORM"

    res_unknown = resolver.resolve("UNKNOWN-999")
    assert res_unknown["canonical_id"] is None
    assert res_unknown["confidence"] == 0.0


def test_unit_normalizer_converts_pressure_flow_and_temperature() -> None:
    normalizer = UnitNormalizer()

    psi_result = normalizer.normalize(175, "psi")
    assert psi_result == {
        "norm_value": 12.07,
        "norm_unit": "bar",
        "rule_id": "RULE_UNIT_PINT",
    }

    bar_result = normalizer.normalize(10.0, "bar")
    assert bar_result == {
        "norm_value": 10.0,
        "norm_unit": "bar",
        "rule_id": "RULE_UNIT_PINT",
    }

    flow_result = normalizer.normalize(100, "gpm")
    assert flow_result["norm_unit"] == "m3/h"
    assert flow_result["norm_value"] == pytest.approx(22.71, abs=0.01)

    temp_result = normalizer.normalize(212, "degF")
    assert temp_result == {
        "norm_value": 100.0,
        "norm_unit": "degC",
        "rule_id": "RULE_UNIT_PINT",
    }


def test_revision_comparator_flags_superseded_rev_a(seeded_conn) -> None:
    doc_a = seeded_conn.execute(
        "SELECT rev_label, status, raw_text FROM documents WHERE id = ?",
        ("doc2_pump_spec_revA.md",),
    ).fetchone()
    assert doc_a is not None
    assert "8.5 bar" in doc_a["raw_text"]

    comparator = RevisionComparator()
    eval_a = comparator.evaluate(status=doc_a["status"], rev_label=doc_a["rev_label"])
    assert eval_a["is_current"] is False
    assert eval_a["rule_id"] == "RULE_REV_PRECEDENCE"

    doc_b = seeded_conn.execute(
        "SELECT rev_label, status FROM documents WHERE id = ?",
        ("doc3_pump_spec_revB.md",),
    ).fetchone()
    eval_b = comparator.evaluate(status=doc_b["status"], rev_label=doc_b["rev_label"])
    assert eval_b["is_current"] is True
    assert comparator.compare_revisions("Rev A", "Rev B") == -1
    assert comparator.compare_revisions("Rev 1", "Rev 2") == -1


def test_span_verifier_passes_valid_and_rejects_tampered_offsets(seeded_conn) -> None:
    verifier = SpanVerifier(seeded_conn)

    span = verifier.create_verified_span("doc4_maint_log.md", "175 psi")
    assert span.excerpt == "175 psi"

    valid_res = verifier.verify_span(
        doc_id=span.doc_id,
        char_start=span.char_start,
        char_end=span.char_end,
        excerpt=span.excerpt,
        expected_hash=span.text_hash,
    )
    assert valid_res["valid"] is True
    assert valid_res["text_hash"] == span.text_hash
    assert valid_res["rule_id"] == "RULE_SPAN_HASH_PROV"

    tampered_res = verifier.verify_span(
        doc_id=span.doc_id,
        char_start=span.char_start + 1,
        char_end=span.char_end + 1,
        excerpt=span.excerpt,
        expected_hash=span.text_hash,
    )
    assert tampered_res["valid"] is False
    assert tampered_res["rule_id"] == "RULE_SPAN_HASH_PROV"


def test_get_downstream_subgraph_bfs_from_p101(seeded_conn) -> None:
    subgraph = get_downstream_subgraph(seeded_conn, "P-101", max_hops=3)

    node_hops = {node["canonical_id"]: node["hop"] for node in subgraph["nodes"]}
    assert set(node_hops.keys()) == {"P-101", "V-12", "PRV-04", "SOP-7", "INSP-04"}
    assert node_hops["P-101"] == 0
    assert node_hops["V-12"] == 1
    assert node_hops["PRV-04"] == 1
    assert node_hops["SOP-7"] in (1, 2)
    assert node_hops["INSP-04"] == node_hops["SOP-7"] + 1

    edge_triples = {(e["source_id"], e["relation"], e["target_id"]) for e in subgraph["edges"]}
    assert edge_triples == {
        ("P-101", "CONNECTS_TO", "V-12"),
        ("P-101", "CONNECTS_TO", "PRV-04"),
        ("P-101", "GOVERNED_BY", "SOP-7"),
        ("V-12", "GOVERNED_BY", "SOP-7"),
        ("SOP-7", "INSPECTED_IN", "INSP-04"),
    }
