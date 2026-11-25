"""SQLite provenance schema, corpus seeder, and deterministic BFS graph traversal."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from collections import deque
from pathlib import Path
from typing import Any


def get_connection(db_path: str = "reconcilegraph.db") -> sqlite3.Connection:
    """Open a SQLite connection configured with WAL mode, busy timeout, and Row factory."""
    conn = sqlite3.connect(db_path, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    if db_path != ":memory:":
        conn.execute("PRAGMA busy_timeout=30000;")
        conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Create all 8 ReconcileGraph tables if they do not already exist."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            doc_type TEXT NOT NULL,
            rev_label TEXT NOT NULL,
            status TEXT NOT NULL,
            effective_date TEXT NOT NULL,
            authority_rank INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            raw_text TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS spans (
            id TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL,
            char_start INTEGER NOT NULL,
            char_end INTEGER NOT NULL,
            excerpt TEXT NOT NULL,
            text_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS entities (
            canonical_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            aliases_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS edges (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            relation TEXT NOT NULL,
            target_id TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS claims (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            parameter TEXT NOT NULL,
            raw_value TEXT NOT NULL,
            raw_unit TEXT,
            norm_value TEXT,
            norm_unit TEXT,
            rev_label TEXT NOT NULL,
            rev_status TEXT NOT NULL,
            span_id TEXT,
            confidence REAL NOT NULL,
            status TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conflicts (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            parameter TEXT NOT NULL,
            claim_a_id TEXT NOT NULL,
            claim_b_id TEXT NOT NULL,
            conflict_type TEXT NOT NULL,
            status TEXT NOT NULL,
            resolution_choice TEXT,
            reviewer_rationale TEXT
        );

        CREATE TABLE IF NOT EXISTS findings (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            span_id TEXT,
            claim_id TEXT,
            audit_status TEXT NOT NULL,
            rule_id TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            step_order INTEGER NOT NULL,
            agent_name TEXT NOT NULL,
            action TEXT NOT NULL,
            rule_id TEXT NOT NULL,
            detail_json TEXT NOT NULL,
            timestamp TEXT NOT NULL
        );
        """
    )
    conn.commit()


def _extract_field(text: str, pattern: str, default: str = "") -> str:
    """Return the first captured regex group from markdown metadata lines."""
    match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else default


def _parse_document_metadata(
    file_path: Path, raw_text: str, authority_ranking: dict[str, int]
) -> dict[str, Any]:
    """Parse structured metadata from a corpus markdown document."""
    title = _extract_field(raw_text, r"^#\s+(.+)$", default=file_path.stem)

    doc_type_match = re.search(
        r"^\s*-\s*\*\*Document Type:\*\*.*?\(`([^`]+)`\)",
        raw_text,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    doc_type = doc_type_match.group(1).strip() if doc_type_match else "unknown"

    rev_raw = _extract_field(raw_text, r"^\s*-\s*\*\*Revision:\*\*\s*(.+)$", default="1")
    rev_label = rev_raw if rev_raw.lower().startswith("rev") else f"Rev {rev_raw}"

    status_raw = _extract_field(
        raw_text, r"^\s*-\s*\*\*Status:\*\*\s*(.+)$", default="RELEASED"
    ).upper()
    status = "SUPERSEDED" if "SUPERSEDED" in status_raw else "RELEASED"

    effective_date = _extract_field(
        raw_text,
        r"^\s*-\s*\*\*(?:Effective Date|Inspection Date|Date):\*\*\s*(.+)$",
        default="",
    )

    authority_rank = int(authority_ranking.get(doc_type, 99))
    content_hash = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()

    return {
        "id": file_path.name,
        "title": title,
        "doc_type": doc_type,
        "rev_label": rev_label,
        "status": status,
        "effective_date": effective_date,
        "authority_rank": authority_rank,
        "content_hash": content_hash,
        "raw_text": raw_text,
    }


def seed_corpus(conn: sqlite3.Connection, data_dir: str = "data") -> dict[str, int]:
    """Idempotently load corpus markdown files, canonical entities, and edges into SQLite."""
    base_dir = Path(data_dir)
    seed_path = base_dir / "graph_seed.json"
    corpus_dir = base_dir / "corpus"

    seed_data = json.loads(seed_path.read_text(encoding="utf-8"))
    authority_ranking: dict[str, int] = seed_data.get("authority_ranking", {})

    doc_count = 0
    for md_file in sorted(corpus_dir.glob("*.md")):
        raw_text = md_file.read_text(encoding="utf-8")
        meta = _parse_document_metadata(md_file, raw_text, authority_ranking)
        conn.execute(
            """
            INSERT OR REPLACE INTO documents
                (id, title, doc_type, rev_label, status, effective_date, authority_rank, content_hash, raw_text)
            VALUES
                (:id, :title, :doc_type, :rev_label, :status, :effective_date, :authority_rank, :content_hash, :raw_text)
            """,
            meta,
        )
        doc_count += 1

    entity_count = 0
    for ent in seed_data.get("entities", []):
        conn.execute(
            """
            INSERT OR REPLACE INTO entities (canonical_id, name, entity_type, aliases_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                ent["id"],
                ent["name"],
                ent["type"],
                json.dumps(ent.get("aliases", [])),
            ),
        )
        entity_count += 1

    edge_count = 0
    for edge in seed_data.get("edges", []):
        edge_id = f"{edge['source']}__{edge['relation']}__{edge['target']}"
        conn.execute(
            """
            INSERT OR REPLACE INTO edges (id, source_id, relation, target_id)
            VALUES (?, ?, ?, ?)
            """,
            (edge_id, edge["source"], edge["relation"], edge["target"]),
        )
        edge_count += 1

    conn.commit()
    return {"documents": doc_count, "entities": entity_count, "edges": edge_count}


def get_downstream_subgraph(
    conn: sqlite3.Connection, start_entity_id: str, max_hops: int = 3
) -> dict[str, list[dict[str, Any]]]:
    """Run deterministic BFS over directed edges from start_entity_id up to max_hops."""
    entity_rows = conn.execute(
        "SELECT canonical_id, name, entity_type, aliases_json FROM entities"
    ).fetchall()
    entity_map = {
        row["canonical_id"]: {
            "canonical_id": row["canonical_id"],
            "name": row["name"],
            "entity_type": row["entity_type"],
            "aliases": json.loads(row["aliases_json"]),
        }
        for row in entity_rows
    }

    if start_entity_id not in entity_map:
        return {"nodes": [], "edges": []}

    edge_rows = conn.execute(
        "SELECT id, source_id, relation, target_id FROM edges ORDER BY id"
    ).fetchall()

    adj: dict[str, list[dict[str, str]]] = {}
    for row in edge_rows:
        edge_dict = {
            "id": row["id"],
            "source_id": row["source_id"],
            "relation": row["relation"],
            "target_id": row["target_id"],
        }
        adj.setdefault(row["source_id"], []).append(edge_dict)

    visited_hop: dict[str, int] = {start_entity_id: 0}
    queue: deque[tuple[str, int]] = deque([(start_entity_id, 0)])

    while queue:
        current_id, current_hop = queue.popleft()
        if current_hop >= max_hops:
            continue
        for edge in adj.get(current_id, []):
            target_id = edge["target_id"]
            if target_id not in visited_hop:
                visited_hop[target_id] = current_hop + 1
                queue.append((target_id, current_hop + 1))

    nodes: list[dict[str, Any]] = []
    for entity_id, hop in sorted(visited_hop.items(), key=lambda item: (item[1], item[0])):
        if entity_id in entity_map:
            node = dict(entity_map[entity_id])
            node["hop"] = hop
            nodes.append(node)

    # Include all directed edges whose endpoints were reached within max_hops
    # and whose source is strictly before max_hops.
    subgraph_edges: list[dict[str, Any]] = []
    for row in edge_rows:
        src = row["source_id"]
        tgt = row["target_id"]
        if src in visited_hop and tgt in visited_hop and visited_hop[src] < max_hops:
            subgraph_edges.append(
                {
                    "id": row["id"],
                    "source_id": src,
                    "relation": row["relation"],
                    "target_id": tgt,
                    "source_hop": visited_hop[src],
                    "target_hop": visited_hop[tgt],
                }
            )

    return {"nodes": nodes, "edges": subgraph_edges}
