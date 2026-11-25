import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
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

const DOC_TAB_LABELS: Record<string, string> = {
  "doc1_bom_revB.md": "BOM Rev B",
  "doc2_pump_spec_revA.md": "Spec Rev A (Old)",
  "doc3_pump_spec_revB.md": "Spec Rev B",
  "doc4_maint_log.md": "Maint Log",
  "doc5_valve_sop_insp.md": "Compliance",
};

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

function formatClaimLine(claim: ClaimRecord | null): string {
  if (!claim) return "—";
  if (
    claim.norm_value &&
    claim.raw_unit &&
    claim.norm_unit &&
    claim.raw_unit.toLowerCase() !== claim.norm_unit.toLowerCase()
  ) {
    return `${claim.norm_value} ${claim.norm_unit} [from ${claim.raw_value} ${claim.raw_unit}]`;
  }
  if (claim.norm_value && claim.norm_unit) {
    return `${claim.norm_value} ${claim.norm_unit}`;
  }
  return `${claim.raw_value}${claim.raw_unit ? ` ${claim.raw_unit}` : ""}`;
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

  const competingClaimA = selectedConflict
    ? claimMap.get(selectedConflict.claim_a_id) ?? null
    : null;
  const competingClaimB = selectedConflict
    ? claimMap.get(selectedConflict.claim_b_id) ?? null
    : null;

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
    return [
      { label: "Equipment tag matched", passed: !isRejected },
      { label: "Units normalized", passed: !isRejected },
      { label: "Revision currency verified", passed: !isRejected },
      {
        label: isRejected
          ? "Source citation missing (blocked)"
          : "Source citation verified",
        passed: !isRejected,
      },
    ];
  }, [selectedFinding]);

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 bg-slate-50 p-5 lg:grid-cols-[28fr_40fr_32fr]">
      {/* LEFT PANE (28%): Clean Scannable Findings List */}
      <section className="flex max-h-[calc(100vh-175px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
            Verification Findings
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono-code text-[11px] font-semibold text-slate-600">
            {runState.findings.length}
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
          {[
            {
              key: "needsDecision",
              label: "Needs Decision",
              items: findingGroups.needsDecision,
              variant: "escalated" as const,
            },
            {
              key: "resolved",
              label: "Resolved",
              items: findingGroups.resolved,
              variant: "resolved" as const,
            },
            {
              key: "verified",
              label: "Verified",
              items: findingGroups.verified,
              variant: "verified" as const,
            },
            {
              key: "rejected",
              label: "Blocked: Ungrounded",
              items: findingGroups.rejected,
              variant: "rejected" as const,
            },
          ].map((group) => {
            if (group.items.length === 0) return null;
            return (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    {group.label}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono-code text-[10px] font-semibold text-slate-600">
                    {group.items.length}
                  </span>
                </div>

                <div className="space-y-2">
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
                        className={`w-full rounded-xl border p-3.5 text-left transition ${
                          isResolved
                            ? isSelected
                              ? "border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700"
                              : "border-emerald-300 bg-emerald-50/70 hover:bg-emerald-50"
                            : isSelected
                              ? "border-slate-900 bg-slate-50/70 ring-1 ring-slate-900"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {isEscalated ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                              <AlertCircle className="h-3 w-3" />
                              Needs Decision
                            </span>
                          ) : isResolved ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              Resolved
                            </span>
                          ) : isRejected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                              <ShieldX className="h-3 w-3" />
                              Blocked: Ungrounded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              Verified
                            </span>
                          )}

                          <span className="rounded-md bg-white/80 px-2 py-0.5 font-mono-code text-[11px] font-semibold text-slate-700">
                            {finding.entity_id}
                          </span>
                        </div>

                        <div
                          className={`mt-2 text-xs font-bold ${
                            isRejected ? "text-slate-400 line-through" : "text-slate-900"
                          }`}
                        >
                          {formatDocLabel(finding.title)}
                        </div>

                        {isResolved && finding.resolution_choice ? (
                          <div className="mt-1 text-[11px] font-semibold text-emerald-800">
                            Decision: {finding.resolution_choice}
                          </div>
                        ) : (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                            {formatDocLabel(finding.summary)}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CENTER PANE (40%): Formatted Engineering Record & Span Viewer */}
      <section className="flex max-h-[calc(100vh-175px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-3">
          <div className="mb-2.5 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600" />
            <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
              Engineering Record
            </h2>
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
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                      : isSuperseded
                        ? "border-rose-200 bg-rose-50/60 text-rose-800 hover:bg-rose-100/70"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{DOC_TAB_LABELS[doc.id] ?? formatDocLabel(doc.id)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeDoc ? (
            <FormattedRecordViewer
              rawText={activeDoc.raw_text}
              activeSpan={activeDocSpan}
              highlightRef={highlightRef}
            />
          ) : (
            <p className="text-sm text-slate-500">No document selected.</p>
          )}
        </div>

        {activeDoc && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-2 text-[11px] text-slate-600">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 font-mono-code text-[10px] font-bold ${
                  activeDoc.status === "SUPERSEDED"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {activeDoc.rev_label} • {activeDoc.status}
              </span>
              <span className="font-medium text-slate-700">
                {formatDocLabel(activeDoc.id)}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono-code text-[10px] text-slate-500">
              {activeDocSpan && (
                <span>
                  Span [{activeDocSpan.char_start} : {activeDocSpan.char_end}]
                </span>
              )}
              <span>Checksum: {activeDoc.content_hash.slice(0, 14)}…</span>
            </div>
          </div>
        )}
      </section>

      {/* RIGHT PANE (32%): Evidence Comparison & Resolution */}
      <section className="flex max-h-[calc(100vh-175px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Scale className="h-4 w-4 text-slate-600" />
          <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
            Evidence &amp; Resolution
          </h2>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {selectedFinding ? (
            <>
              {/* Section 1: Evidence & Unit Check */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                    Evidence &amp; Unit Check
                  </span>
                  <span className="rounded-md bg-white px-2 py-0.5 font-mono-code text-[11px] font-bold text-slate-800 shadow-2xs">
                    {selectedEntityNode?.name ?? selectedFinding.entity_id}
                  </span>
                </div>

                {selectedEntityNode && selectedEntityNode.aliases.length > 0 && (
                  <p className="text-xs text-slate-600">
                    Component{" "}
                    <strong className="text-slate-900">{selectedEntityNode.canonical_id}</strong>{" "}
                    matched across plant tags:{" "}
                    <span className="font-mono-code text-[11px] text-slate-700">
                      {selectedEntityNode.aliases.join(", ")}
                    </span>
                  </p>
                )}

                {selectedConflict && competingClaimA ? (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">
                        Source A ({competingClaimA.rev_label})
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-900">
                        {formatClaimLine(competingClaimA)}
                      </div>
                      {competingClaimA.span_id && spanMap.get(competingClaimA.span_id) && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          {formatDocLabel(spanMap.get(competingClaimA.span_id)!.doc_id)}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                      <div className="text-[10px] font-bold text-amber-900 uppercase">
                        Source B (
                        {competingClaimB && competingClaimB.id !== competingClaimA.id
                          ? competingClaimB.rev_label
                          : "Plant Baseline"}
                        )
                      </div>
                      <div className="mt-1 text-xs font-semibold text-amber-950">
                        {competingClaimB && competingClaimB.id !== competingClaimA.id
                          ? formatClaimLine(competingClaimB)
                          : selectedConflict.conflict_type === "MISSING_EVIDENCE"
                            ? "Omitted from field log"
                            : "Exceeds operating limit"}
                      </div>
                      {competingClaimB?.span_id && spanMap.get(competingClaimB.span_id) && (
                        <div className="mt-1 text-[11px] text-amber-800">
                          {formatDocLabel(spanMap.get(competingClaimB.span_id)!.doc_id)}
                        </div>
                      )}
                    </div>
                  </div>
                ) : selectedClaim ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                    <div className="font-semibold text-slate-900">
                      {formatClaimLine(selectedClaim)}
                    </div>
                    <div className="mt-1 text-slate-500">
                      Revision {selectedClaim.rev_label} ({selectedClaim.rev_status})
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-slate-600">
                    {formatDocLabel(selectedFinding.summary)}
                  </p>
                )}
              </div>

              {/* Section 2: Resolve Conflict Action Card */}
              {selectedFinding.audit_status === "ESCALATED" &&
                selectedConflict &&
                selectedConflict.status === "OPEN" && (
                  <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-950">
                        Resolve Conflict — {CONFLICT_TYPE_LABELS[selectedConflict.conflict_type]}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_RESOLUTION_PRESETS.map((preset) => {
                        const activeChoice =
                          choiceByConflict[selectedConflict.id] ?? QUICK_RESOLUTION_PRESETS[0];
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
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                              activeChoice === preset
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-amber-300 bg-white text-slate-700 hover:bg-amber-100/70"
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
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:outline-none"
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
                      className="w-full rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {resolvingConflictId === selectedConflict.id
                        ? "Re-evaluating Impact..."
                        : "Confirm Resolution"}
                    </button>
                  </div>
                )}

              {selectedConflict && selectedConflict.status === "RESOLVED" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Resolved
                  </div>
                  <div className="mt-1.5 font-semibold">
                    {selectedConflict.resolution_choice}
                  </div>
                  <div className="mt-1 text-emerald-800">
                    {selectedConflict.reviewer_rationale}
                  </div>
                </div>
              )}

              {/* Section 3: Plain-English Verification Checks */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-600" />
                  Verification Checks
                </div>
                <ul className="space-y-2">
                  {verificationChecks.map((chk) => (
                    <li
                      key={chk.label}
                      className={`flex items-center gap-2 text-xs font-medium ${
                        chk.passed ? "text-slate-800" : "text-rose-800"
                      }`}
                    >
                      {chk.passed ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <ShieldX className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                      )}
                      <span>{chk.label}</span>
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
