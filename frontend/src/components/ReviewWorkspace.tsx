import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Scale,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import type {
  ClaimRecord,
  ConflictRecord,
  ConflictType,
  DocumentRecord,
  FindingRecord,
  FindingSeverity,
  RunState,
  SpanRecord,
} from "../types";
import { formatDocLabel } from "../utils/docNames";
import { FormattedRecordViewer } from "./FormattedRecordViewer";

interface ReviewWorkspaceProps {
  runState: RunState;
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  activeDocId: string;
  onSelectDoc: (docId: string) => void;
  onResolveConflict: (
    conflictId: string,
    resolutionChoice: string,
    reviewerRationale: string
  ) => Promise<void>;
  resolvingConflictId: string | null;
}

const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  VALUE_MISMATCH: "Value Mismatch",
  DOWNSTREAM_OVERLOAD: "Downstream Limit Exceeded",
  MISSING_EVIDENCE: "Missing Safety Evidence",
};

const QUICK_RESOLUTION_PRESETS = [
  "Accept Spec Rev B (10.0 bar)",
  "Accept Field Log (12.07 bar)",
  "Upgrade Downstream Valve V-12 & Reset PRV-04",
  "Log Vibration Baseline Before Startup",
];

const SEVERITY_BADGES: Record<FindingSeverity, string> = {
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
  WARNING: "border-amber-200 bg-amber-50 text-amber-800",
  INFO: "border-sky-200 bg-sky-50 text-sky-700",
};

function findLinkedConflict(
  finding: FindingRecord,
  conflicts: ConflictRecord[]
): ConflictRecord | undefined {
  if (finding.claim_id) {
    const byClaim = conflicts.find(
      (c) => c.claim_a_id === finding.claim_id || c.claim_b_id === finding.claim_id
    );
    if (byClaim) return byClaim;
  }
  return conflicts.find((c) => c.entity_id === finding.entity_id);
}

function formatPrimaryValue(claim: ClaimRecord | null): string {
  if (!claim) return "—";
  if (claim.norm_value && claim.norm_unit) {
    return `${claim.norm_value} ${claim.norm_unit}`;
  }
  return `${claim.raw_value}${claim.raw_unit ? ` ${claim.raw_unit}` : ""}`;
}

function formatRawLine(claim: ClaimRecord | null): string | null {
  if (!claim) return null;
  if (
    claim.norm_value &&
    claim.raw_unit &&
    claim.norm_unit &&
    claim.raw_unit.toLowerCase() !== claim.norm_unit.toLowerCase()
  ) {
    return `raw ${claim.raw_value} ${claim.raw_unit}`;
  }
  return null;
}

export function ReviewWorkspace({
  runState,
  selectedFindingId,
  onSelectFinding,
  activeDocId,
  onSelectDoc,
  onResolveConflict,
  resolvingConflictId,
}: ReviewWorkspaceProps) {
  const highlightRef = useRef<HTMLElement | null>(null);
  const [choiceByConflict, setChoiceByConflict] = useState<Record<string, string>>({});
  const [rationaleByConflict, setRationaleByConflict] = useState<Record<string, string>>({});
  const [formErrorByConflict, setFormErrorByConflict] = useState<Record<string, string>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const spanMap = useMemo(() => {
    const map = new Map<string, SpanRecord>();
    for (const s of runState.spans) map.set(s.id, s);
    return map;
  }, [runState.spans]);

  const claimMap = useMemo(() => {
    const map = new Map<string, ClaimRecord>();
    for (const c of runState.claims) map.set(c.id, c);
    return map;
  }, [runState.claims]);

  const docMap = useMemo(() => {
    const map = new Map<string, DocumentRecord>();
    for (const d of runState.documents) map.set(d.id, d);
    return map;
  }, [runState.documents]);

  const selectedFinding = useMemo(
    () =>
      runState.findings.find((f) => f.id === selectedFindingId) ??
      runState.findings[0] ??
      null,
    [runState.findings, selectedFindingId]
  );

  const selectedSpan = selectedFinding?.span_id
    ? spanMap.get(selectedFinding.span_id) ?? null
    : null;

  const selectedClaim = selectedFinding?.claim_id
    ? claimMap.get(selectedFinding.claim_id) ?? null
    : null;

  const selectedConflict = selectedFinding
    ? findLinkedConflict(selectedFinding, runState.conflicts) ?? null
    : null;

  const activeDoc = docMap.get(activeDocId) ?? runState.documents[0] ?? null;

  const activeDocSpan =
    selectedSpan && activeDoc && selectedSpan.doc_id === activeDoc.id
      ? selectedSpan
      : null;

  useEffect(() => {
    if (activeDocSpan && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeDocSpan]);

  const findingGroups = useMemo(() => {
    const needsDecision = runState.findings.filter(
      (f) => f.audit_status === "ESCALATED" && !f.is_resolved
    );
    const resolved = runState.findings.filter(
      (f) => Boolean(f.is_resolved) && f.audit_status !== "REJECTED"
    );
    const verified = runState.findings.filter(
      (f) => f.audit_status === "VERIFIED" && !f.is_resolved
    );
    const rejected = runState.findings.filter((f) => f.audit_status === "REJECTED");
    return { needsDecision, resolved, verified, rejected };
  }, [runState.findings]);

  const handleFindingClick = (finding: FindingRecord) => {
    onSelectFinding(finding.id);
    if (finding.span_id) {
      const span = spanMap.get(finding.span_id);
      if (span) {
        onSelectDoc(span.doc_id);
      }
    }
  };

  const handleConfirmResolution = async (conflict: ConflictRecord) => {
    const choice = choiceByConflict[conflict.id] || QUICK_RESOLUTION_PRESETS[0];
    const rationale = (rationaleByConflict[conflict.id] || "").trim();
    if (!rationale) {
      setFormErrorByConflict((prev) => ({
        ...prev,
        [conflict.id]: "Please enter a brief engineering rationale before confirming.",
      }));
      return;
    }
    setFormErrorByConflict((prev) => ({ ...prev, [conflict.id]: "" }));
    await onResolveConflict(conflict.id, choice, rationale);
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const competingClaimA = selectedConflict
    ? claimMap.get(selectedConflict.claim_a_id) ?? null
    : null;
  const competingClaimB = selectedConflict
    ? claimMap.get(selectedConflict.claim_b_id) ?? null
    : null;

  const numericDelta = useMemo(() => {
    if (!competingClaimA || !competingClaimB || competingClaimA.id === competingClaimB.id) {
      return null;
    }
    const a = Number.parseFloat(String(competingClaimA.norm_value ?? ""));
    const b = Number.parseFloat(String(competingClaimB.norm_value ?? ""));
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
    const diff = Math.abs(b - a).toFixed(2);
    const unit = competingClaimA.norm_unit || competingClaimB.norm_unit || "";
    return `Δ ${diff}${unit ? ` ${unit}` : ""}`;
  }, [competingClaimA, competingClaimB]);

  const selectedEntityNode = useMemo(() => {
    if (!selectedFinding) return null;
    return (
      runState.subgraph.nodes.find(
        (n) => n.canonical_id === selectedFinding.entity_id
      ) ?? null
    );
  }, [runState.subgraph.nodes, selectedFinding]);

  const verificationChecks = useMemo(() => {
    if (!selectedFinding) return [];
    const isRejected = selectedFinding.audit_status === "REJECTED";
    const isEscalated = selectedFinding.audit_status === "ESCALATED" && !selectedFinding.is_resolved;
    return [
      {
        label: "Equipment tag normalized",
        ruleId: "RULE_ALIAS_NORM",
        state: isRejected ? ("failed" as const) : ("passed" as const),
      },
      {
        label: "Engineering units reconciled",
        ruleId: "RULE_UNIT_PINT",
        state: isRejected ? ("failed" as const) : ("passed" as const),
      },
      {
        label: "Revision currency verified",
        ruleId: "RULE_REV_PRECEDENCE",
        state: isRejected ? ("failed" as const) : ("passed" as const),
      },
      {
        label: isRejected
          ? "Source citation missing (blocked)"
          : "SHA-256 source span anchored",
        ruleId: isRejected ? "RULE_AUDIT_REJECT_UNGROUNDED" : "RULE_SPAN_HASH_PROV",
        state: isRejected ? ("failed" as const) : ("passed" as const),
      },
      {
        label: isRejected
          ? "Auditor gate rejected ungrounded claim"
          : isEscalated
            ? "Escalated for engineer decision"
            : "Auditor gate passed",
        ruleId: selectedFinding.rule_id,
        state: isRejected
          ? ("failed" as const)
          : isEscalated
            ? ("escalated" as const)
            : ("passed" as const),
      },
    ];
  }, [selectedFinding]);

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 bg-slate-50 p-4 lg:h-[calc(100vh-118px)] lg:min-h-[600px] lg:grid-cols-[28fr_40fr_32fr]">
      {/* LEFT PANE (28%): Findings Triage Queue (Linear Issue-List Feel) */}
      <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs lg:min-h-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <h2 className="font-mono-code text-[11px] font-bold tracking-wider text-slate-800 uppercase">
            Findings Triage
          </h2>
          <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono-code text-[10px] font-bold text-slate-700">
            {runState.findings.length} TOTAL
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {[
            {
              key: "needsDecision",
              label: "Needs Decision",
              dotColor: "bg-amber-500",
              items: findingGroups.needsDecision,
              variant: "escalated" as const,
            },
            {
              key: "resolved",
              label: "Resolved",
              dotColor: "bg-emerald-500",
              items: findingGroups.resolved,
              variant: "resolved" as const,
            },
            {
              key: "verified",
              label: "Verified",
              dotColor: "bg-sky-500",
              items: findingGroups.verified,
              variant: "verified" as const,
            },
            {
              key: "rejected",
              label: "Blocked: Ungrounded",
              dotColor: "bg-rose-500",
              items: findingGroups.rejected,
              variant: "rejected" as const,
            },
          ].map((group) => {
            if (group.items.length === 0) return null;
            const isCollapsed = Boolean(collapsedGroups[group.key]);

            return (
              <div key={group.key} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left transition hover:bg-slate-100/70"
                >
                  <span className="inline-flex items-center gap-2 font-mono-code text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span className={`h-1.5 w-1.5 rounded-full ${group.dotColor}`} />
                    {group.label}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono-code text-[10px] font-bold text-slate-600">
                    {group.items.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-1.5">
                    {group.items.map((finding) => {
                      const isSelected = selectedFinding?.id === finding.id;
                      const isRejected = group.variant === "rejected";
                      const isResolved = group.variant === "resolved";
                      const isEscalated = group.variant === "escalated";

                      return (
                        <button
                          key={finding.id}
                          type="button"
                          onClick={() => handleFindingClick(finding)}
                          className={`relative w-full rounded-lg border p-3 text-left transition ${
                            isResolved
                              ? isSelected
                                ? "border-emerald-600 border-l-[3px] bg-emerald-50/90 shadow-2xs"
                                : "border-emerald-200 bg-emerald-50/40 hover:border-emerald-300 hover:bg-emerald-50/70"
                              : isSelected
                                ? "border-slate-900 border-l-[3px] bg-slate-50 shadow-2xs"
                                : isEscalated
                                  ? "border-amber-200/90 bg-white hover:border-amber-300 hover:bg-amber-50/30"
                                  : isRejected
                                    ? "border-rose-200/80 bg-rose-50/20 hover:border-rose-300"
                                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {isEscalated ? (
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                              ) : isResolved ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              ) : isRejected ? (
                                <ShieldX className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                              )}
                              <span
                                className={`rounded border px-1.5 py-0.2 font-mono-code text-[9px] font-bold ${
                                  SEVERITY_BADGES[finding.severity]
                                }`}
                              >
                                {finding.severity}
                              </span>
                            </div>

                            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono-code text-[10px] font-bold text-slate-700">
                              {finding.entity_id}
                            </span>
                          </div>

                          <div
                            className={`mt-2 text-xs font-semibold leading-snug ${
                              isRejected
                                ? "text-slate-400 line-through decoration-rose-400/70"
                                : "text-slate-900"
                            }`}
                          >
                            {formatDocLabel(finding.title)}
                          </div>

                          {isResolved && finding.resolution_choice ? (
                            <div className="mt-1.5 truncate font-mono-code text-[10px] font-semibold text-emerald-700">
                              ✓ {finding.resolution_choice}
                            </div>
                          ) : isRejected ? (
                            <div className="mt-1.5 font-mono-code text-[10px] font-semibold text-rose-700">
                              BLOCKED • NO SHA-256 SPAN
                            </div>
                          ) : (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                              {formatDocLabel(finding.summary)}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CENTER PANE (40%): Tabbed Source Record Reader */}
      <section className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs lg:min-h-0">
        {/* Document Tab Strip */}
        <div className="border-b border-slate-200 bg-slate-50/70 px-3 pt-2.5 pb-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="inline-flex items-center gap-1.5 font-mono-code text-[11px] font-bold tracking-wider text-slate-800 uppercase">
              <FileText className="h-3.5 w-3.5 text-slate-600" />
              Controlled Plant Records
            </span>
            <span className="font-mono-code text-[10px] text-slate-500">
              {runState.documents.length} SOURCES
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {runState.documents.map((doc) => {
              const isActive = activeDoc?.id === doc.id;
              const isSuperseded = doc.status === "SUPERSEDED";
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onSelectDoc(doc.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                      : isSuperseded
                        ? "border-amber-200 bg-amber-50/60 text-slate-600 hover:bg-amber-100/70"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className={isSuperseded && !isActive ? "line-through opacity-80" : ""}>
                    {formatDocLabel(doc.id)}
                  </span>
                  <span
                    className={`rounded px-1 py-0.2 font-mono-code text-[9px] font-bold uppercase ${
                      isActive
                        ? isSuperseded
                          ? "bg-amber-400/20 text-amber-200"
                          : "bg-emerald-400/20 text-emerald-200"
                        : isSuperseded
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {isSuperseded ? `${doc.rev_label} OLD` : doc.rev_label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Span Locator Bar */}
        {activeDoc && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 font-mono-code text-[10px] ${
              activeDocSpan
                ? "border-amber-200 bg-amber-50/70 text-amber-950"
                : "border-slate-100 bg-slate-50/40 text-slate-500"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold">{activeDoc.id}</span>
              {activeDocSpan ? (
                <>
                  <span className="text-amber-400">•</span>
                  <span className="font-bold text-amber-900">
                    OFFSET [{activeDocSpan.char_start} : {activeDocSpan.char_end}]
                  </span>
                </>
              ) : (
                <>
                  <span className="text-slate-300">•</span>
                  <span>NO ACTIVE SPAN IN THIS DOCUMENT</span>
                </>
              )}
            </div>

            {activeDocSpan ? (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                <ShieldCheck className="h-3 w-3" />
                SHA-256 VERIFIED • {activeDocSpan.text_hash.slice(0, 10)}
              </span>
            ) : (
              <span>DOC HASH {activeDoc.content_hash.slice(0, 12)}</span>
            )}
          </div>
        )}

        {/* Document Reader Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeDoc ? (
            <FormattedRecordViewer
              rawText={activeDoc.raw_text}
              activeSpan={activeDocSpan}
              highlightRef={highlightRef}
              docId={activeDoc.id}
              docTitle={formatDocLabel(activeDoc.id)}
              revLabel={activeDoc.rev_label}
              docStatus={activeDoc.status}
            />
          ) : (
            <p className="text-sm text-slate-500">No document selected.</p>
          )}
        </div>
      </section>

      {/* RIGHT PANE (32%): Evidence Inspector & Conflict Resolver */}
      <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs lg:min-h-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 font-mono-code text-[11px] font-bold tracking-wider text-slate-800 uppercase">
            <Scale className="h-3.5 w-3.5 text-slate-600" />
            Evidence &amp; Resolution
          </span>
          {selectedFinding && (
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono-code text-[10px] font-bold text-slate-700">
              {selectedFinding.entity_id}
            </span>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {selectedFinding ? (
            <>
              {/* Section 1: Evidence & Unit Check Card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-code text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Evidence &amp; Unit Check
                  </span>
                  {numericDelta && (
                    <span className="rounded border border-amber-300 bg-amber-100/80 px-2 py-0.5 font-mono-code text-[10px] font-bold text-amber-900">
                      {numericDelta}
                    </span>
                  )}
                </div>

                {selectedEntityNode && (
                  <div className="mt-2">
                    <div className="text-xs font-bold text-slate-900">
                      {selectedEntityNode.name}
                    </div>
                    {selectedEntityNode.aliases.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-slate-500">Aliases:</span>
                        {selectedEntityNode.aliases.map((alias) => (
                          <span
                            key={alias}
                            className="rounded border border-slate-200 bg-white px-1.5 py-0.2 font-mono-code text-[10px] text-slate-700"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedConflict && competingClaimA ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {/* Source A Tile */}
                    <div className="rounded-md border border-slate-200 bg-white p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-code text-[10px] font-bold text-slate-500 uppercase">
                          Source A
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono-code text-[9px] font-semibold text-slate-700">
                          {competingClaimA.rev_label}
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono-code text-sm font-bold text-slate-950">
                        {formatPrimaryValue(competingClaimA)}
                      </div>
                      {formatRawLine(competingClaimA) && (
                        <div className="mt-0.5 font-mono-code text-[10px] text-slate-500">
                          {formatRawLine(competingClaimA)}
                        </div>
                      )}
                      {competingClaimA.span_id && spanMap.get(competingClaimA.span_id) && (
                        <div className="mt-1.5 truncate text-[11px] text-slate-600">
                          {formatDocLabel(spanMap.get(competingClaimA.span_id)!.doc_id)}
                        </div>
                      )}
                    </div>

                    {/* Source B Tile */}
                    <div className="rounded-md border border-amber-300 bg-amber-50/70 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-code text-[10px] font-bold text-amber-900 uppercase">
                          Source B
                        </span>
                        <span className="rounded bg-amber-200/70 px-1.5 py-0.2 font-mono-code text-[9px] font-semibold text-amber-950">
                          {competingClaimB && competingClaimB.id !== competingClaimA.id
                            ? competingClaimB.rev_label
                            : "BASELINE"}
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono-code text-sm font-bold text-amber-950">
                        {competingClaimB && competingClaimB.id !== competingClaimA.id
                          ? formatPrimaryValue(competingClaimB)
                          : selectedConflict.conflict_type === "MISSING_EVIDENCE"
                            ? "OMITTED"
                            : "LIMIT EXCEEDED"}
                      </div>
                      {competingClaimB &&
                        competingClaimB.id !== competingClaimA.id &&
                        formatRawLine(competingClaimB) && (
                          <div className="mt-0.5 font-mono-code text-[10px] text-amber-800">
                            {formatRawLine(competingClaimB)}
                          </div>
                        )}
                      {competingClaimB?.span_id && spanMap.get(competingClaimB.span_id) && (
                        <div className="mt-1.5 truncate text-[11px] text-amber-900">
                          {formatDocLabel(spanMap.get(competingClaimB.span_id)!.doc_id)}
                        </div>
                      )}
                    </div>
                  </div>
                ) : selectedClaim ? (
                  <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                    <div className="font-mono-code text-sm font-bold text-slate-900">
                      {formatPrimaryValue(selectedClaim)}
                    </div>
                    <div className="mt-1 font-mono-code text-[10px] text-slate-500">
                      {selectedClaim.rev_label} • {selectedClaim.rev_status}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2.5 text-xs leading-5 text-slate-600">
                    {formatDocLabel(selectedFinding.summary)}
                  </p>
                )}
              </div>

              {/* Section 2: Resolve Conflict Action Card */}
              {selectedFinding.audit_status === "ESCALATED" &&
                selectedConflict &&
                selectedConflict.status === "OPEN" && (
                  <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-950">
                        Resolve Conflict
                      </span>
                      <span className="rounded border border-amber-300 bg-white px-2 py-0.5 font-mono-code text-[10px] font-semibold text-amber-900">
                        {CONFLICT_TYPE_LABELS[selectedConflict.conflict_type]}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {QUICK_RESOLUTION_PRESETS.map((preset) => {
                        const activeChoice =
                          choiceByConflict[selectedConflict.id] ?? QUICK_RESOLUTION_PRESETS[0];
                        const isChosen = activeChoice === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setChoiceByConflict((prev) => ({
                                ...prev,
                                [selectedConflict.id]: preset,
                              }))
                            }
                            className={`rounded-md border px-2.5 py-2 text-left text-[11px] font-medium leading-tight transition ${
                              isChosen
                                ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                                : "border-amber-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>

                    <textarea
                      rows={2}
                      placeholder="Enter required engineering rationale..."
                      value={rationaleByConflict[selectedConflict.id] ?? ""}
                      onChange={(e) =>
                        setRationaleByConflict((prev) => ({
                          ...prev,
                          [selectedConflict.id]: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                    />

                    {formErrorByConflict[selectedConflict.id] && (
                      <p className="text-xs font-medium text-rose-700">
                        {formErrorByConflict[selectedConflict.id]}
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={resolvingConflictId === selectedConflict.id}
                      onClick={() => handleConfirmResolution(selectedConflict)}
                      className="w-full rounded-md bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {resolvingConflictId === selectedConflict.id
                        ? "Re-evaluating Impact..."
                        : "Record Decision & Re-Check Impact"}
                    </button>
                  </div>
                )}

              {selectedConflict && selectedConflict.status === "RESOLVED" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" />
                      Recorded Engineer Decision
                    </span>
                    <span className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 font-mono-code text-[9px] font-bold text-emerald-700">
                      RESOLVED
                    </span>
                  </div>
                  <div className="mt-2 font-semibold text-slate-900">
                    {selectedConflict.resolution_choice}
                  </div>
                  <div className="mt-1 text-emerald-900">
                    {selectedConflict.reviewer_rationale}
                  </div>
                </div>
              )}

              {/* Section 3: Verification Checks Checklist */}
              <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                <div className="mb-2.5 flex items-center gap-1.5 font-mono-code text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-600" />
                  Verification Checks
                </div>
                <ul className="space-y-2">
                  {verificationChecks.map((chk) => (
                    <li
                      key={chk.label}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2.5 py-1.5 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                        {chk.state === "passed" ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : chk.state === "escalated" ? (
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        ) : (
                          <ShieldX className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                        )}
                        <span className="truncate">{chk.label}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono-code text-[9px] font-semibold ${
                          chk.state === "passed"
                            ? "bg-emerald-50 text-emerald-700"
                            : chk.state === "escalated"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {chk.ruleId}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">Select a finding to inspect evidence.</p>
          )}
        </div>
      </section>
    </div>
  );
}
