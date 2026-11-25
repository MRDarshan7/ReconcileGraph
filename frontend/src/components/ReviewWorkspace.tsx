import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  FileText,
  Scale,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import type {
  AuditStatus,
  ClaimRecord,
  ConflictRecord,
  DocumentRecord,
  FindingRecord,
  RunState,
  SpanRecord,
} from "../types";

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
  "doc2_pump_spec_revA.md": "Spec Rev A",
  "doc3_pump_spec_revB.md": "Spec Rev B",
  "doc4_maint_log.md": "Maint Log",
  "doc5_valve_sop_insp.md": "Compliance COMP-L4",
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

  const activeDoc =
    docMap.get(activeDocId) ?? runState.documents[0] ?? null;

  useEffect(() => {
    if (selectedSpan && selectedSpan.doc_id === activeDocId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedSpan, activeDocId]);

  const groupedFindings = useMemo(() => {
    const groups: Record<AuditStatus, FindingRecord[]> = {
      ESCALATED: [],
      VERIFIED: [],
      REJECTED: [],
    };
    for (const f of runState.findings) {
      groups[f.audit_status].push(f);
    }
    return groups;
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
        [conflict.id]: "Engineering rationale is required before resolving.",
      }));
      return;
    }
    setFormErrorByConflict((prev) => ({ ...prev, [conflict.id]: "" }));
    await onResolveConflict(conflict.id, choice, rationale);
  };

  // Render document text with exact [char_start : char_end] highlight
  const renderHighlightedText = (doc: DocumentRecord) => {
    if (!selectedSpan || selectedSpan.doc_id !== doc.id) {
      return (
        <pre className="whitespace-pre-wrap font-mono-code text-xs leading-6 text-slate-800">
          {doc.raw_text}
        </pre>
      );
    }

    const { char_start, char_end } = selectedSpan;
    if (char_start < 0 || char_end > doc.raw_text.length || char_start >= char_end) {
      return (
        <pre className="whitespace-pre-wrap font-mono-code text-xs leading-6 text-slate-800">
          {doc.raw_text}
        </pre>
      );
    }

    const before = doc.raw_text.slice(0, char_start);
    const match = doc.raw_text.slice(char_start, char_end);
    const after = doc.raw_text.slice(char_end);

    const isEscalated = selectedFinding?.audit_status === "ESCALATED";

    return (
      <pre className="whitespace-pre-wrap font-mono-code text-xs leading-6 text-slate-800">
        {before}
        <mark
          ref={highlightRef}
          className={`rounded px-1 py-0.5 font-semibold ring-2 ${
            isEscalated
              ? "bg-amber-200 text-amber-950 ring-amber-500"
              : "bg-emerald-200 text-emerald-950 ring-emerald-500"
          }`}
        >
          {match}
        </mark>
        {after}
      </pre>
    );
  };

  const renderGroupSection = (
    status: AuditStatus,
    label: string,
    items: FindingRecord[]
  ) => {
    if (items.length === 0) return null;

    return (
      <div key={status} className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            {label}
          </span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 font-mono-code text-[10px] font-semibold text-slate-700">
            {items.length}
          </span>
        </div>

        <div className="space-y-2">
          {items.map((finding) => {
            const isSelected = selectedFinding?.id === finding.id;
            const isRejected = finding.audit_status === "REJECTED";
            const linkedConflict = findLinkedConflict(finding, runState.conflicts);
            const showResolveCard =
              finding.audit_status === "ESCALATED" &&
              linkedConflict &&
              linkedConflict.status === "OPEN";

            return (
              <div
                key={finding.id}
                className={`rounded-lg border transition ${
                  isSelected
                    ? "border-slate-900 bg-white ring-1 ring-slate-900"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleFindingClick(finding)}
                  className="w-full p-3 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {finding.audit_status === "ESCALATED" && (
                        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      {finding.audit_status === "VERIFIED" && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      )}
                      {isRejected && (
                        <ShieldX className="h-4 w-4 shrink-0 text-rose-600" />
                      )}
                      <span
                        className={`text-xs font-semibold ${
                          isRejected ? "text-slate-500 line-through" : "text-slate-900"
                        }`}
                      >
                        {finding.title}
                      </span>
                    </div>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono-code text-[10px] font-semibold text-slate-700">
                      {finding.entity_id}
                    </span>
                  </div>

                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    {finding.summary}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {isRejected ? (
                      <span className="inline-flex items-center rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                        UNGROUNDED • BLOCKED BY AUDITOR
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          finding.severity === "CRITICAL"
                            ? "bg-rose-100 text-rose-800"
                            : finding.severity === "WARNING"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {finding.severity} • {finding.audit_status}
                      </span>
                    )}
                    <span className="font-mono-code text-[10px] text-slate-400">
                      {finding.rule_id}
                    </span>
                  </div>
                </button>

                {/* Inline Resolve Conflict Card */}
                {showResolveCard && linkedConflict && (
                  <div className="border-t border-amber-200 bg-amber-50/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-900">
                        Resolve Conflict ({linkedConflict.conflict_type})
                      </span>
                      <span className="font-mono-code text-[10px] text-amber-700">
                        {linkedConflict.id}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {QUICK_RESOLUTION_PRESETS.map((preset) => {
                        const activeChoice =
                          choiceByConflict[linkedConflict.id] ?? QUICK_RESOLUTION_PRESETS[0];
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setChoiceByConflict((prev) => ({
                                ...prev,
                                [linkedConflict.id]: preset,
                              }))
                            }
                            className={`rounded border px-2 py-0.5 text-[10px] font-medium transition ${
                              activeChoice === preset
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-amber-300 bg-white text-slate-700 hover:bg-amber-100"
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      placeholder="Required engineering rationale..."
                      value={rationaleByConflict[linkedConflict.id] ?? ""}
                      onChange={(e) =>
                        setRationaleByConflict((prev) => ({
                          ...prev,
                          [linkedConflict.id]: e.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-700 focus:outline-none"
                    />

                    {formErrorByConflict[linkedConflict.id] && (
                      <p className="mt-1 text-[11px] font-medium text-rose-700">
                        {formErrorByConflict[linkedConflict.id]}
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={resolvingConflictId === linkedConflict.id}
                      onClick={() => handleConfirmResolution(linkedConflict)}
                      className="mt-2 w-full rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {resolvingConflictId === linkedConflict.id
                        ? "Re-checking Impact..."
                        : "Confirm Resolution"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Competing claims for Right Pane inspector
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

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-12">
      {/* LEFT PANE: Findings & Conflict Queue */}
      <section className="flex max-h-[calc(100vh-180px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-100/70 lg:col-span-4">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-slate-700" />
            <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
              Findings &amp; Conflict Queue
            </h2>
          </div>
          <span className="font-mono-code text-[11px] text-slate-500">
            {runState.findings.length} total
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {renderGroupSection("ESCALATED", "Escalated (Action Required)", groupedFindings.ESCALATED)}
          {renderGroupSection("VERIFIED", "Verified Findings", groupedFindings.VERIFIED)}
          {renderGroupSection("REJECTED", "Rejected by Fail-Closed Auditor", groupedFindings.REJECTED)}
        </div>
      </section>

      {/* CENTER PANE: Provenance Document & Span Viewer */}
      <section className="flex max-h-[calc(100vh-180px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:col-span-5">
        <div className="border-b border-slate-200 bg-slate-50 px-3 pt-2.5">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-700" />
              <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
                Provenance Document &amp; Span Viewer
              </h2>
            </div>
            {activeDoc && (
              <span className="font-mono-code text-[10px] text-slate-500">
                SHA-256: {activeDoc.content_hash.slice(0, 14)}…
              </span>
            )}
          </div>

          <div className="flex gap-1 overflow-x-auto pb-2">
            {runState.documents.map((doc) => {
              const isActive = activeDoc?.id === doc.id;
              const isSuperseded = doc.status === "SUPERSEDED";
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onSelectDoc(doc.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{DOC_TAB_LABELS[doc.id] ?? doc.id}</span>
                  <span
                    className={`rounded px-1 py-0.2 font-mono-code text-[9px] font-bold ${
                      isSuperseded
                        ? "bg-rose-100 text-rose-800"
                        : isActive
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {doc.rev_label} • {doc.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Verified Span Metadata Strip */}
        {selectedSpan && activeDoc && selectedSpan.doc_id === activeDoc.id && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3.5 py-2 text-[11px] text-amber-950">
            <span className="font-semibold">
              Anchored Span [{selectedSpan.char_start} : {selectedSpan.char_end}]
            </span>
            <span className="font-mono-code text-[10px] text-amber-800">
              text_hash: {selectedSpan.text_hash.slice(0, 18)}…
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {activeDoc ? (
            renderHighlightedText(activeDoc)
          ) : (
            <p className="text-xs text-slate-500">No document selected.</p>
          )}
        </div>
      </section>

      {/* RIGHT PANE: Claim & Guardrail Inspector */}
      <section className="flex max-h-[calc(100vh-180px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:col-span-3">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <Scale className="h-4 w-4 text-slate-700" />
          <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
            Claim &amp; Guardrail Inspector
          </h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3.5">
          {selectedFinding ? (
            <>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase">
                  Canonical Entity
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono-code text-sm font-bold text-slate-900">
                    {selectedFinding.entity_id}
                  </span>
                  {selectedEntityNode && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      Hop {selectedEntityNode.hop} • {selectedEntityNode.entity_type}
                    </span>
                  )}
                </div>
                {selectedEntityNode && (
                  <p className="mt-1 text-xs text-slate-600">
                    Aliases: {selectedEntityNode.aliases.join(", ")}
                  </p>
                )}
              </div>

              {selectedClaim && (
                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    Extracted &amp; Normalized Claim
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-slate-50 p-2">
                      <div className="text-[10px] text-slate-500">Raw Value</div>
                      <div className="mt-0.5 font-mono-code font-semibold text-slate-900">
                        {selectedClaim.raw_value} {selectedClaim.raw_unit ?? ""}
                      </div>
                    </div>
                    <div className="rounded bg-emerald-50 p-2">
                      <div className="text-[10px] text-emerald-700">Pint Normalized</div>
                      <div className="mt-0.5 font-mono-code font-semibold text-emerald-950">
                        {selectedClaim.norm_value ?? "—"} {selectedClaim.norm_unit ?? ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>
                      Revision:{" "}
                      <strong className="font-mono-code text-slate-900">
                        {selectedClaim.rev_label}
                      </strong>
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        selectedClaim.rev_status === "SUPERSEDED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {selectedClaim.rev_status}
                    </span>
                  </div>
                </div>
              )}

              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase">
                  Fired Guardrail Rules
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    "RULE_ALIAS_NORM",
                    "RULE_UNIT_PINT",
                    "RULE_REV_PRECEDENCE",
                    "RULE_SPAN_HASH_PROV",
                    selectedFinding.rule_id,
                  ]
                    .filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i)
                    .map((rule) => (
                      <span
                        key={rule}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono-code text-[10px] font-semibold text-slate-700"
                      >
                        {rule}
                      </span>
                    ))}
                </div>
              </div>

              {selectedConflict && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-900 uppercase">
                      Side-by-Side Competing Claims
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        selectedConflict.status === "OPEN"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {selectedConflict.status}
                    </span>
                  </div>

                  {competingClaimA && (
                    <div className="rounded border border-slate-200 bg-white p-2 text-xs">
                      <div className="text-[10px] font-bold text-slate-500">
                        Claim A ({competingClaimA.rev_label})
                      </div>
                      <div className="font-mono-code font-semibold text-slate-900">
                        {competingClaimA.raw_value} {competingClaimA.raw_unit ?? ""} →{" "}
                        {competingClaimA.norm_value} {competingClaimA.norm_unit ?? ""}
                      </div>
                      {competingClaimA.span_id && spanMap.get(competingClaimA.span_id) && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Source: {spanMap.get(competingClaimA.span_id)?.doc_id}
                        </div>
                      )}
                    </div>
                  )}

                  {competingClaimB && competingClaimB.id !== competingClaimA?.id && (
                    <div className="rounded border border-slate-200 bg-white p-2 text-xs">
                      <div className="text-[10px] font-bold text-slate-500">
                        Claim B ({competingClaimB.rev_label})
                      </div>
                      <div className="font-mono-code font-semibold text-slate-900">
                        {competingClaimB.raw_value} {competingClaimB.raw_unit ?? ""} →{" "}
                        {competingClaimB.norm_value} {competingClaimB.norm_unit ?? ""}
                      </div>
                      {competingClaimB.span_id && spanMap.get(competingClaimB.span_id) && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Source: {spanMap.get(competingClaimB.span_id)?.doc_id}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedConflict.status === "RESOLVED" && (
                    <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-950">
                      <div className="font-semibold">
                        Decision: {selectedConflict.resolution_choice}
                      </div>
                      <div className="mt-0.5 text-emerald-800">
                        {selectedConflict.reviewer_rationale}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">Select a finding to inspect provenance.</p>
          )}
        </div>
      </section>
    </div>
  );
}
