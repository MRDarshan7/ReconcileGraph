"""Pydantic v2 schemas for ReconcileGraph provenance, claims, conflicts, and audit logs."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class DocumentRecord(BaseModel):
    """Ingested source document with revision metadata and content hash."""

    id: str
    title: str
    doc_type: str
    rev_label: str
    status: Literal["RELEASED", "SUPERSEDED"]
    effective_date: str
    authority_rank: int
    content_hash: str
    raw_text: str


class SpanRecord(BaseModel):
    """Exact character-offset provenance span anchored to a source document."""

    id: str
    doc_id: str
    char_start: int
    char_end: int
    excerpt: str
    text_hash: str


class EntityRecord(BaseModel):
    """Canonical industrial asset, procedure, or inspection entity."""

    canonical_id: str
    name: str
    entity_type: str
    aliases: list[str] = Field(default_factory=list)


class EdgeRecord(BaseModel):
    """Directed dependency edge between canonical entities."""

    id: str
    source_id: str
    relation: str
    target_id: str


class ClaimRecord(BaseModel):
    """Extracted and normalized parameter claim anchored to a document span."""

    id: str
    run_id: str
    entity_id: str
    parameter: str
    raw_value: str | float
    raw_unit: str | None = None
    norm_value: float | str | None = None
    norm_unit: str | None = None
    rev_label: str
    rev_status: Literal["RELEASED", "SUPERSEDED"]
    span_id: str | None = None
    confidence: float = 1.0
    status: Literal["VERIFIED", "SUPERSEDED", "CONFLICTED", "UNGROUNDED"]


class ConflictRecord(BaseModel):
    """Detected cross-document conflict, downstream overload, or missing evidence."""

    id: str
    run_id: str
    entity_id: str
    parameter: str
    claim_a_id: str
    claim_b_id: str
    conflict_type: Literal["VALUE_MISMATCH", "DOWNSTREAM_OVERLOAD", "MISSING_EVIDENCE"]
    status: Literal["OPEN", "RESOLVED"]
    resolution_choice: str | None = None
    reviewer_rationale: str | None = None


class FindingRecord(BaseModel):
    """Audited ECO engineering finding linked to evidence and guardrail rule."""

    id: str
    run_id: str
    severity: Literal["CRITICAL", "WARNING", "INFO"]
    title: str
    summary: str
    entity_id: str
    span_id: str | None = None
    claim_id: str | None = None
    audit_status: Literal["VERIFIED", "ESCALATED", "REJECTED"]
    rule_id: str


class AuditEvent(BaseModel):
    """Immutable step-level trace event emitted during an ECO reconciliation run."""

    id: str
    run_id: str
    step_order: int
    agent_name: str
    action: str
    rule_id: str
    detail: dict[str, Any] = Field(default_factory=dict)
    timestamp: str
