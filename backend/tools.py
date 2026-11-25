"""Deterministic engineering guardrail tools for ReconcileGraph."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from typing import Any

import pint

from backend.models import SpanRecord


class AliasResolver:
    """Resolves raw equipment tags/aliases to canonical entity IDs deterministically."""

    RULE_ID = "RULE_ALIAS_NORM"
    _REV_SUFFIX_RE = re.compile(
        r"[\s\-_]*(?:rev(?:ision)?\.?\s*[a-z0-9]+)$", flags=re.IGNORECASE
    )

    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    @classmethod
    def _normalize(cls, text: str) -> str:
        stripped = cls._REV_SUFFIX_RE.sub("", text.strip())
        return re.sub(r"[^a-z0-9]", "", stripped.lower())

    def resolve(self, raw_tag: str) -> dict[str, Any]:
        """Resolve a raw equipment string to a canonical entity ID."""
        if not raw_tag or not raw_tag.strip():
            return {"canonical_id": None, "confidence": 0.0, "rule_id": self.RULE_ID}

        rows = self.conn.execute(
            "SELECT canonical_id, aliases_json FROM entities"
        ).fetchall()

        raw_clean = raw_tag.strip().lower()
        raw_norm = self._normalize(raw_tag)

        # Pass 1: exact case-insensitive match against canonical ID or explicit aliases
        for row in rows:
            canonical_id = row["canonical_id"]
            aliases = json.loads(row["aliases_json"])
            candidates = [canonical_id, *aliases]
            if any(raw_clean == cand.strip().lower() for cand in candidates):
                return {
                    "canonical_id": canonical_id,
                    "confidence": 1.0,
                    "rule_id": self.RULE_ID,
                }

        # Pass 2: normalized match (ignoring punctuation/spaces and trailing rev suffixes)
        for row in rows:
            canonical_id = row["canonical_id"]
            aliases = json.loads(row["aliases_json"])
            candidates = [canonical_id, *aliases]
            if any(raw_norm and raw_norm == self._normalize(cand) for cand in candidates):
                return {
                    "canonical_id": canonical_id,
                    "confidence": 0.95,
                    "rule_id": self.RULE_ID,
                }

        return {"canonical_id": None, "confidence": 0.0, "rule_id": self.RULE_ID}


class UnitNormalizer:
    """Converts engineering pressure, flow, and temperature values using Pint."""

    RULE_ID = "RULE_UNIT_PINT"

    _UNIT_MAP: dict[str, tuple[str, str]] = {
        # Pressure -> bar
        "psi": ("psi", "bar"),
        "bar": ("bar", "bar"),
        "kpa": ("kPa", "bar"),
        "mpa": ("MPa", "bar"),
        # Flow -> m3/h
        "m3/h": ("m**3/hour", "m3/h"),
        "m^3/h": ("m**3/hour", "m3/h"),
        "gpm": ("gallon/minute", "m3/h"),
        "l/min": ("liter/minute", "m3/h"),
        # Temperature -> degC
        "degc": ("degC", "degC"),
        "c": ("degC", "degC"),
        "°c": ("degC", "degC"),
        "degf": ("degF", "degC"),
        "f": ("degF", "degC"),
        "°f": ("degF", "degC"),
    }

    _TARGET_PINT_UNIT: dict[str, str] = {
        "bar": "bar",
        "m3/h": "m**3/hour",
        "degC": "degC",
    }

    def __init__(self) -> None:
        self.ureg = pint.UnitRegistry()

    def normalize(self, value: float, unit: str) -> dict[str, Any]:
        """Convert value and unit to canonical bar, m3/h, or degC rounded to 2 decimals."""
        key = unit.strip().lower()
        if key not in self._UNIT_MAP:
            raise ValueError(f"Unsupported unit: {unit!r}")

        src_pint_unit, canonical_unit = self._UNIT_MAP[key]
        dst_pint_unit = self._TARGET_PINT_UNIT[canonical_unit]

        quantity = self.ureg.Quantity(float(value), src_pint_unit)
        converted = quantity.to(dst_pint_unit)

        return {
            "norm_value": round(float(converted.magnitude), 2),
            "norm_unit": canonical_unit,
            "rule_id": self.RULE_ID,
        }


class RevisionComparator:
    """Evaluates document/claim currency and compares revision labels deterministically."""

    RULE_ID = "RULE_REV_PRECEDENCE"

    @staticmethod
    def _parse_rev_key(rev_label: str) -> tuple[int, int, str]:
        cleaned = re.sub(r"^(?:rev(?:ision)?\.?\s*)", "", rev_label.strip(), flags=re.IGNORECASE)
        if cleaned.isdigit():
            return (0, int(cleaned), "")
        upper = cleaned.upper()
        return (1, len(upper), upper)

    @classmethod
    def compare_revisions(cls, rev_a: str, rev_b: str) -> int:
        """Return -1 if rev_a < rev_b, 0 if equal, +1 if rev_a > rev_b."""
        key_a = cls._parse_rev_key(rev_a)
        key_b = cls._parse_rev_key(rev_b)
        if key_a < key_b:
            return -1
        if key_a > key_b:
            return 1
        return 0

    def evaluate(
        self,
        status: str,
        rev_label: str,
        peer_rev_labels: list[str] | None = None,
    ) -> dict[str, Any]:
        """Determine whether a revision is current based on status and peer revisions."""
        norm_status = status.strip().upper()
        if norm_status == "SUPERSEDED":
            return {
                "is_current": False,
                "reason": f"{rev_label} has status SUPERSEDED",
                "rule_id": self.RULE_ID,
            }

        if peer_rev_labels:
            higher = [
                peer
                for peer in peer_rev_labels
                if self.compare_revisions(rev_label, peer) < 0
            ]
            if higher:
                newest = max(higher, key=self._parse_rev_key)
                return {
                    "is_current": False,
                    "reason": f"{rev_label} is older than revision {newest}",
                    "rule_id": self.RULE_ID,
                }

        if norm_status == "RELEASED":
            return {
                "is_current": True,
                "reason": f"{rev_label} is RELEASED and current",
                "rule_id": self.RULE_ID,
            }

        return {
            "is_current": False,
            "reason": f"{rev_label} has non-released status {status!r}",
            "rule_id": self.RULE_ID,
        }


class SpanVerifier:
    """Verifies and creates SHA-256 character-offset provenance spans in source docs."""

    RULE_ID = "RULE_SPAN_HASH_PROV"

    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    @staticmethod
    def _compute_hash(excerpt: str) -> str:
        return hashlib.sha256(excerpt.encode("utf-8")).hexdigest()

    def verify_span(
        self,
        doc_id: str,
        char_start: int,
        char_end: int,
        excerpt: str,
        expected_hash: str | None = None,
    ) -> dict[str, Any]:
        """Verify that raw_text[char_start:char_end] == excerpt and matches SHA-256 hash."""
        row = self.conn.execute(
            "SELECT raw_text FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if row is None:
            return {
                "valid": False,
                "text_hash": self._compute_hash(excerpt),
                "rule_id": self.RULE_ID,
            }

        raw_text: str = row["raw_text"]
        if char_start < 0 or char_end > len(raw_text) or char_start >= char_end:
            return {
                "valid": False,
                "text_hash": self._compute_hash(excerpt),
                "rule_id": self.RULE_ID,
            }

        actual_slice = raw_text[char_start:char_end]
        actual_hash = self._compute_hash(actual_slice)
        matches_text = actual_slice == excerpt
        matches_hash = expected_hash is None or actual_hash == expected_hash

        return {
            "valid": bool(matches_text and matches_hash),
            "text_hash": actual_hash,
            "rule_id": self.RULE_ID,
        }

    def verify_span_by_id(self, span_id: str | None) -> dict[str, Any]:
        """Verify an existing span record by ID against its source document."""
        if not span_id:
            return {"valid": False, "text_hash": "", "rule_id": self.RULE_ID}

        row = self.conn.execute(
            "SELECT doc_id, char_start, char_end, excerpt, text_hash FROM spans WHERE id = ?",
            (span_id,),
        ).fetchone()
        if row is None:
            return {"valid": False, "text_hash": "", "rule_id": self.RULE_ID}

        return self.verify_span(
            doc_id=row["doc_id"],
            char_start=row["char_start"],
            char_end=row["char_end"],
            excerpt=row["excerpt"],
            expected_hash=row["text_hash"],
        )

    def create_verified_span(self, doc_id: str, excerpt: str) -> SpanRecord:
        """Locate excerpt in doc.raw_text, insert verified SpanRecord, and return it."""
        row = self.conn.execute(
            "SELECT raw_text FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if row is None:
            raise ValueError(f"Document not found: {doc_id!r}")

        raw_text: str = row["raw_text"]
        char_start = raw_text.find(excerpt)
        if char_start == -1:
            raise ValueError(f"Excerpt not found in document {doc_id!r}: {excerpt!r}")

        char_end = char_start + len(excerpt)
        text_hash = self._compute_hash(excerpt)
        span_id = f"span_{hashlib.sha256(f'{doc_id}:{char_start}:{char_end}'.encode('utf-8')).hexdigest()[:12]}"

        span = SpanRecord(
            id=span_id,
            doc_id=doc_id,
            char_start=char_start,
            char_end=char_end,
            excerpt=excerpt,
            text_hash=text_hash,
        )
        self.conn.execute(
            """
            INSERT OR REPLACE INTO spans (id, doc_id, char_start, char_end, excerpt, text_hash)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                span.id,
                span.doc_id,
                span.char_start,
                span.char_end,
                span.excerpt,
                span.text_hash,
            ),
        )
        self.conn.commit()
        return span
