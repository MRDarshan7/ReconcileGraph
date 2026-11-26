import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  ShieldCheck,
  ShieldX,
  X,
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

const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  VALUE_MISMATCH: "Value mismatch",
  DOWNSTREAM_OVERLOAD: "Downstream limit exceeded",
  MISSING_EVIDENCE: "Missing safety evidence",
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

function formatPrimaryValue(claim: ClaimRecord | null): string {
  if (!claim) return "N/A";
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

function sentenceCase(val: string): string {
  if (!val) return "";
  return val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
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
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [checksExpanded, setChecksExpanded] = useState<boolean>(false);
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
    if (!drawerOpen || !activeDocSpan) return;
    const timer = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [drawerOpen, activeDocSpan]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const openSourceDrawer = (docId?: string | null) => {
    if (docId) {
      onSelectDoc(docId);
    } else if (selectedSpan?.doc_id) {
      onSelectDoc(selectedSpan.doc_id);
    }
    setDrawerOpen(true);
  };

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
        [conflict.id]: "Please enter an engineering rationale before confirming.",
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
    const diff = b - a;
    const sign = diff > 0 ? "+" : "";
    const unit = competingClaimA.norm_unit || competingClaimB.norm_unit || "";
    return `Δ ${sign}${diff.toFixed(2)}${unit ? ` ${unit}` : ""}`;
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
    const isEscalated =
      selectedFinding.audit_status === "ESCALATED" && !selectedFinding.is_resolved;
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

  const checksSummaryText = useMemo(() => {
    const passed = verificationChecks.filter((c) => c.state === "passed").length;
    const escalated = verificationChecks.filter((c) => c.state === "escalated").length;
    const failed = verificationChecks.filter((c) => c.state === "failed").length;
    if (failed > 0) {
      return `${failed} check${failed === 1 ? "" : "s"} blocked ungrounded claim · Click to inspect`;
    }
    if (escalated > 0) {
      return `${passed} deterministic checks passed, ${escalated} escalated · Click to inspect`;
    }
    return `${passed} deterministic checks passed · Click to inspect`;
  }, [verificationChecks]);

  const focusDotColor = !selectedFinding
    ? "bg-[#94A3B8]"
    : selectedFinding.audit_status === "REJECTED"
      ? "bg-[#DC2626]"
      : selectedFinding.is_resolved
        ? "bg-[#059669]"
        : selectedFinding.severity === "CRITICAL"
          ? "bg-[#DC2626]"
          : selectedFinding.audit_status === "ESCALATED"
            ? "bg-[#D97706]"
            : "bg-[#94A3B8]";

  const focusStatusLabel = !selectedFinding
    ? ""
    : selectedFinding.is_resolved
      ? "Resolved"
      : sentenceCase(selectedFinding.audit_status);

  return (
    <div className="relative flex flex-col bg-white lg:h-[calc(100vh-52px)] lg:flex-row lg:overflow-hidden">
      {/* LEFT PANE (310px): Compact Linear Triage Queue */}
      <aside className="flex w-full shrink-0 flex-col border-b border-[#E5E5E5] bg-[#FAFAFB] lg:w-[310px] lg:border-r lg:border-b-0">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E5E5] px-3.5">
          <span className="text-xs font-medium text-[#0A0A0A]">Findings</span>
          <span className="font-mono-code text-[11px] text-[#737373]">
            {runState.findings.length} total
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {[
            {
              key: "needsDecision",
              label: "Needs decision",
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
              label: "Blocked: ungrounded",
              items: findingGroups.rejected,
              variant: "rejected" as const,
            },
          ].map((group) => {
            if (group.items.length === 0) return null;
            const isCollapsed = Boolean(collapsedGroups[group.key]);

            return (
              <div key={group.key} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between px-3.5 py-1.5 text-left transition-[background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/[0.03]"
                >
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#666666]">
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3 text-[#999999]" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-[#999999]" />
                    )}
                    <span>{group.label}</span>
                  </span>
                  <span className="font-mono-code text-[10px] text-[#737373]">
                    {group.items.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-[#F0F0F0]">
                    {group.items.map((finding) => {
                      const isSelected = selectedFinding?.id === finding.id;
                      const isRejected = group.variant === "rejected";
                      const isResolved = group.variant === "resolved";
                      const isEscalated = group.variant === "escalated";

                      const statusDotClass =
                        isRejected || (isEscalated && finding.severity === "CRITICAL")
                          ? "bg-[#DC2626]"
                          : isEscalated
                            ? "bg-[#D97706]"
                            : isResolved
                              ? "bg-[#059669]"
                              : "bg-[#94A3B8]";

                      const previewText =
                        isResolved && finding.resolution_choice
                          ? `Resolved · ${finding.resolution_choice}`
                          : isRejected
                            ? "Blocked · Missing SHA-256 span"
                            : formatDocLabel(finding.summary);

                      return (
                        <button
                          key={finding.id}
                          type="button"
                          onClick={() => handleFindingClick(finding)}
                          className={`w-full border-l-2 px-3.5 py-2.5 text-left transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            isSelected
                              ? "border-l-[#0A0A0A] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                              : "border-l-transparent bg-transparent hover:bg-black/[0.025]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className={`h-[6px] w-[6px] shrink-0 rounded-full ${statusDotClass}`}
                              />
                              <span
                                className={`truncate text-[13px] font-medium ${
                                  isRejected
                                    ? "text-[#999999] line-through decoration-[#DC2626]/60"
                                    : "text-[#0A0A0A]"
                                }`}
                              >
                                {formatDocLabel(finding.title)}
                              </span>
                            </div>
                            <span className="shrink-0 font-mono-code text-[11px] text-[#737373]">
                              {finding.entity_id}
                            </span>
                          </div>

                          <div
                            className={`mt-0.5 truncate pl-[14px] text-[12px] ${
                              isResolved
                                ? "text-[#059669]"
                                : isRejected
                                  ? "text-[#DC2626]"
                                  : "text-[#737373]"
                            }`}
                          >
                            {previewText}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* MAIN FOCUS PANE: Calm Evidence & Decision Stage */}
      <main className="min-w-0 flex-1 overflow-y-auto bg-white">
        <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
          {selectedFinding ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedFinding.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Calm Inline Metadata Strip */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#666666]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#0A0A0A]">
                    <span className={`h-[6px] w-[6px] rounded-full ${focusDotColor}`} />
                    {sentenceCase(selectedFinding.severity)}
                  </span>
                  <span className="text-[#CCCCCC]">·</span>
                  <span>{focusStatusLabel}</span>
                  <span className="text-[#CCCCCC]">·</span>
                  <span className="font-mono-code text-[11px] text-[#0A0A0A]">
                    {selectedFinding.entity_id}
                  </span>
                  {selectedEntityNode && (
                    <>
                      <span className="text-[#CCCCCC]">·</span>
                      <span>{selectedEntityNode.name}</span>
                    </>
                  )}
                </div>

                {/* Finding Title & Summary */}
                <h1 className="mt-3 text-xl font-medium tracking-[-0.02em] text-[#0A0A0A]">
                  {formatDocLabel(selectedFinding.title)}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-[#666666]">
                  {formatDocLabel(selectedFinding.summary)}
                </p>

                {/* Single-Row Sleek Source Provenance Bar */}
                <div className="mt-6 flex items-center justify-between gap-3 rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFB] px-3.5 py-2.5">
                  {selectedSpan ? (
                    <>
                      <div className="flex min-w-0 items-center gap-2 font-mono-code text-[11px]">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-[#666666]" />
                        <span className="truncate font-medium text-[#0A0A0A]">
                          {formatDocLabel(selectedSpan.doc_id)}
                        </span>
                        <span className="shrink-0 text-[#CCCCCC]">·</span>
                        <span className="shrink-0 text-[#0A0A0A]">
                          [{selectedSpan.char_start}:{selectedSpan.char_end}]
                        </span>
                        <span className="hidden shrink-0 items-center gap-1 text-[10px] text-[#059669] sm:inline-flex">
                          <ShieldCheck className="h-3 w-3" />
                          SHA-256 verified
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => openSourceDrawer(selectedSpan.doc_id)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs font-medium text-[#0A0A0A] transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#0A0A0A]"
                      >
                        <span>Inspect source record</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex min-w-0 items-center gap-2 font-mono-code text-[11px] text-[#DC2626]">
                        <ShieldX className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          Ungrounded finding · No verified SHA-256 byte offset
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openSourceDrawer(activeDoc?.id)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs font-medium text-[#0A0A0A] transition-[border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#0A0A0A]"
                      >
                        <span>Browse plant records</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Softened Side-by-Side Specification Comparison */}
                {selectedConflict && competingClaimA ? (
                  <div className="mt-6 rounded-[2px] border border-[#E5E5E5] bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E5E5] bg-[#FAFAFB] px-4 py-2.5">
                      <span className="text-xs font-medium text-[#0A0A0A]">
                        Side-by-side specification comparison
                      </span>
                      {numericDelta && (
                        <span className="rounded-[2px] border border-[#D97706]/30 bg-[#D97706]/10 px-2 py-0.5 font-mono-code text-[11px] font-medium text-[#D97706]">
                          {numericDelta}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 divide-y divide-[#E5E5E5] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                      {/* Source A */}
                      <div className="bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono-code text-[10px] font-medium text-[#737373] uppercase">
                            Source A
                          </span>
                          <span className="rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFB] px-1.5 py-0.5 font-mono-code text-[10px] text-[#0A0A0A]">
                            {competingClaimA.rev_label}
                          </span>
                        </div>
                        <div className="mt-2 font-mono-code text-base font-medium text-[#0A0A0A]">
                          {formatPrimaryValue(competingClaimA)}
                        </div>
                        {formatRawLine(competingClaimA) && (
                          <div className="mt-0.5 font-mono-code text-[11px] text-[#737373]">
                            ({formatRawLine(competingClaimA)})
                          </div>
                        )}
                        {competingClaimA.span_id && spanMap.get(competingClaimA.span_id) && (
                          <button
                            type="button"
                            onClick={() =>
                              openSourceDrawer(spanMap.get(competingClaimA.span_id!)!.doc_id)
                            }
                            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#666666] underline decoration-[#E5E5E5] underline-offset-4 transition-[color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[#0A0A0A]"
                          >
                            {formatDocLabel(spanMap.get(competingClaimA.span_id)!.doc_id)}
                          </button>
                        )}
                      </div>

                      {/* Source B */}
                      <div className="bg-[#FAFAFB] p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono-code text-[10px] font-medium text-[#737373] uppercase">
                            Source B
                          </span>
                          <span className="rounded-[2px] border border-[#E5E5E5] bg-white px-1.5 py-0.5 font-mono-code text-[10px] text-[#0A0A0A]">
                            {competingClaimB && competingClaimB.id !== competingClaimA.id
                              ? competingClaimB.rev_label
                              : "BASELINE"}
                          </span>
                        </div>
                        <div className="mt-2 font-mono-code text-base font-medium text-[#0A0A0A]">
                          {competingClaimB && competingClaimB.id !== competingClaimA.id
                            ? formatPrimaryValue(competingClaimB)
                            : selectedConflict.conflict_type === "MISSING_EVIDENCE"
                              ? "Omitted"
                              : "Limit exceeded"}
                        </div>
                        {competingClaimB &&
                          competingClaimB.id !== competingClaimA.id &&
                          formatRawLine(competingClaimB) && (
                            <div className="mt-0.5 font-mono-code text-[11px] text-[#737373]">
                              ({formatRawLine(competingClaimB)})
                            </div>
                          )}
                        {competingClaimB?.span_id && spanMap.get(competingClaimB.span_id) && (
                          <button
                            type="button"
                            onClick={() =>
                              openSourceDrawer(spanMap.get(competingClaimB.span_id!)!.doc_id)
                            }
                            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#666666] underline decoration-[#E5E5E5] underline-offset-4 transition-[color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[#0A0A0A]"
                          >
                            {formatDocLabel(spanMap.get(competingClaimB.span_id)!.doc_id)}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : selectedClaim ? (
                  <div className="mt-6 rounded-[2px] border border-[#E5E5E5] bg-white px-4 py-3">
                    <div className="text-[11px] font-medium text-[#737373]">
                      Extracted parameter
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-3">
                      <span className="font-mono-code text-base font-medium text-[#0A0A0A]">
                        {formatPrimaryValue(selectedClaim)}
                      </span>
                      <span className="font-mono-code text-[11px] text-[#737373]">
                        {selectedClaim.rev_label} · {selectedClaim.rev_status}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Calm Resolve Conflict Panel (OPEN) */}
                {selectedFinding.audit_status === "ESCALATED" &&
                  selectedConflict &&
                  selectedConflict.status === "OPEN" && (
                    <div className="mt-6 space-y-4 rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFB] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[#0A0A0A]">
                          Resolve conflict
                        </span>
                        <span className="rounded-[2px] border border-[#E5E5E5] bg-white px-2 py-0.5 font-mono-code text-[10px] font-medium text-[#666666]">
                          {CONFLICT_TYPE_LABELS[selectedConflict.conflict_type]}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {QUICK_RESOLUTION_PRESETS.map((preset) => {
                          const activeChoice =
                            choiceByConflict[selectedConflict.id] ??
                            QUICK_RESOLUTION_PRESETS[0];
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
                              className={`rounded-[2px] border px-3 py-2 text-left text-xs font-medium leading-snug transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                isChosen
                                  ? "border-[#0A0A0A] bg-[#0A0A0A] text-white"
                                  : "border-[#E5E5E5] bg-white text-[#0A0A0A] hover:border-[#0A0A0A]"
                              }`}
                            >
                              {preset}
                            </button>
                          );
                        })}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#0A0A0A]">
                          Engineering rationale
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Enter required verification or mitigation rationale..."
                          value={rationaleByConflict[selectedConflict.id] ?? ""}
                          onChange={(e) =>
                            setRationaleByConflict((prev) => ({
                              ...prev,
                              [selectedConflict.id]: e.target.value,
                            }))
                          }
                          className="mt-1.5 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2 text-xs text-[#0A0A0A] placeholder:text-[#999999] transition-[border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#D4D4D8] focus:border-[#0A0A0A] focus:outline-none"
                        />
                      </div>

                      {formErrorByConflict[selectedConflict.id] && (
                        <p className="text-xs text-[#DC2626]">
                          {formErrorByConflict[selectedConflict.id]}
                        </p>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={resolvingConflictId === selectedConflict.id}
                          onClick={() => handleConfirmResolution(selectedConflict)}
                          className="rounded-[2px] bg-[#0A0A0A] px-5 py-2 text-xs font-medium text-white transition-[background-color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#262626] disabled:opacity-50"
                        >
                          {resolvingConflictId === selectedConflict.id
                            ? "Re-evaluating impact..."
                            : "Record decision & re-check impact"}
                        </button>
                      </div>
                    </div>
                  )}

                {/* Resolved Decision Receipt */}
                {selectedConflict && selectedConflict.status === "RESOLVED" && (
                  <div className="mt-6 rounded-[2px] border border-[#E5E5E5] bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#059669]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Recorded engineer decision
                      </span>
                      <span className="rounded-[2px] border border-[#059669]/30 bg-[#059669]/10 px-1.5 py-0.5 font-mono-code text-[10px] text-[#059669]">
                        RESOLVED
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-medium text-[#0A0A0A]">
                      {selectedConflict.resolution_choice}
                    </div>
                    <p className="mt-1 text-xs text-[#666666]">
                      {selectedConflict.reviewer_rationale}
                    </p>
                  </div>
                )}

                {/* Collapsible Verification Checks Disclosure */}
                <div className="mt-6 rounded-[2px] border border-[#E5E5E5] bg-white">
                  <button
                    type="button"
                    onClick={() => setChecksExpanded((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-[background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#FAFAFB]"
                  >
                    <div className="flex items-center gap-2.5 text-xs">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#0A0A0A]" />
                      <span className="font-medium text-[#0A0A0A]">Verification checks</span>
                      <span className="text-[#666666]">· {checksSummaryText}</span>
                    </div>
                    {checksExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#666666]" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#666666]" />
                    )}
                  </button>

                  {checksExpanded && (
                    <ul className="divide-y divide-[#F0F0F0] border-t border-[#E5E5E5]">
                      {verificationChecks.map((chk) => (
                        <li
                          key={chk.label}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-[#0A0A0A]">
                            {chk.state === "passed" ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-[#059669]" />
                            ) : chk.state === "escalated" ? (
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#D97706]" />
                            ) : (
                              <ShieldX className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" />
                            )}
                            <span className="truncate">{chk.label}</span>
                          </span>
                          <span
                            className={`shrink-0 rounded-[2px] border px-1.5 py-0.5 font-mono-code text-[10px] ${
                              chk.state === "passed"
                                ? "border-[#059669]/30 bg-[#059669]/10 text-[#059669]"
                                : chk.state === "escalated"
                                  ? "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]"
                                  : "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]"
                            }`}
                          >
                            {chk.ruleId}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <p className="text-xs text-[#666666]">Select a finding to inspect evidence.</p>
          )}
        </div>
      </main>

      {/* RIGHT SLIDE-OVER SOURCE RECORD DRAWER (Attio-Style) */}
      <aside
        aria-hidden={!drawerOpen}
        className={`fixed top-[52px] right-0 bottom-0 z-40 flex w-full flex-col border-l border-[#E5E5E5] bg-white shadow-[-8px_0_30px_rgba(0,0,0,0.06)] transition-transform duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:w-[46%] sm:min-w-[420px] sm:max-w-[680px] ${
          drawerOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E5E5E5] bg-[#FAFAFB] px-4">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-[#0A0A0A]" />
            <span className="text-xs font-medium text-[#0A0A0A]">
              Controlled plant record
            </span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="hidden rounded-[2px] border border-[#E5E5E5] bg-white px-1.5 py-0.5 font-mono-code text-[10px] text-[#737373] sm:inline-block">
              Esc
            </kbd>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="inline-flex items-center gap-1 rounded-[2px] border border-[#E5E5E5] bg-white px-2.5 py-1 text-xs font-medium text-[#666666] transition-[border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
            >
              <span>Close</span>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Document Tab Switcher (doc1..doc5) */}
        <div className="border-b border-[#E5E5E5] bg-white px-4 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {runState.documents.map((doc) => {
              const isActive = activeDoc?.id === doc.id;
              const isSuperseded = doc.status === "SUPERSEDED";
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onSelectDoc(doc.id)}
                  className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[11px] font-medium transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isActive
                      ? "border-[#0A0A0A] bg-[#0A0A0A] text-white"
                      : "border-[#E5E5E5] bg-[#FAFAFB] text-[#0A0A0A] hover:border-[#0A0A0A]"
                  }`}
                >
                  <span className={isSuperseded && !isActive ? "line-through opacity-75" : ""}>
                    {formatDocLabel(doc.id)}
                  </span>
                  <span
                    className={`rounded-[2px] px-1 py-0.2 font-mono-code text-[9px] uppercase ${
                      isActive
                        ? "bg-white/15 text-white"
                        : isSuperseded
                          ? "bg-[#D97706]/15 text-[#D97706]"
                          : "bg-[#059669]/10 text-[#059669]"
                    }`}
                  >
                    {isSuperseded ? `${doc.rev_label} Old` : doc.rev_label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Span Offset Bar */}
        {activeDoc && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 font-mono-code text-[10px] ${
              activeDocSpan
                ? "border-[#D97706]/30 bg-[#FEF3C7]/60 text-[#0A0A0A]"
                : "border-[#E5E5E5] bg-[#FAFAFB] text-[#666666]"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-[#0A0A0A]">{activeDoc.id}</span>
              <span className="text-[#CCCCCC]">·</span>
              {activeDocSpan ? (
                <span className="font-medium text-[#D97706]">
                  [{activeDocSpan.char_start}:{activeDocSpan.char_end}]
                </span>
              ) : (
                <span>No active span in this record</span>
              )}
            </div>

            {activeDocSpan ? (
              <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#059669]/30 bg-white px-1.5 py-0.5 text-[9px] text-[#059669]">
                <ShieldCheck className="h-3 w-3" />
                SHA-256 · {activeDocSpan.text_hash.slice(0, 10)}
              </span>
            ) : (
              <span>SHA-256 · {activeDoc.content_hash.slice(0, 12)}</span>
            )}
          </div>
        )}

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
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
            <p className="text-xs text-[#666666]">No document selected.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

interface PlantRecordsViewProps {
  documents: DocumentRecord[];
  isLoading: boolean;
}

export function PlantRecordsView({ documents, isLoading }: PlantRecordsViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>(
    documents[0]?.id ?? "doc1_bom_revB.md"
  );
  const highlightRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (documents.length > 0 && !documents.some((d) => d.id === selectedDocId)) {
      setSelectedDocId(documents[0].id);
    }
  }, [documents, selectedDocId]);

  const activeDoc =
    documents.find((d) => d.id === selectedDocId) ?? documents[0] ?? null;

  return (
    <div className="flex flex-col bg-white lg:h-[calc(100vh-52px)] lg:flex-row lg:overflow-hidden">
      {/* Left List of Controlled Plant Records */}
      <aside className="flex w-full shrink-0 flex-col border-b border-[#E5E5E5] bg-[#FAFAFB] lg:w-[300px] lg:border-r lg:border-b-0">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E5E5] px-4">
          <span className="text-xs font-medium text-[#0A0A0A]">Plant records</span>
          <span className="font-mono-code text-[11px] text-[#737373]">
            {documents.length} files
          </span>
        </div>

        <div className="flex-1 divide-y divide-[#F0F0F0] overflow-y-auto">
          {isLoading && documents.length === 0 ? (
            <div className="p-4 font-mono-code text-xs text-[#666666]">
              Loading controlled records...
            </div>
          ) : (
            documents.map((doc) => {
              const isSelected = activeDoc?.id === doc.id;
              const isSuperseded = doc.status === "SUPERSEDED";
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`w-full border-l-2 px-4 py-3 text-left transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isSelected
                      ? "border-l-[#0A0A0A] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      : "border-l-transparent bg-transparent hover:bg-black/[0.025]"
                  }`}
                >
                  <div className="truncate text-[13px] font-medium text-[#0A0A0A]">
                    {formatDocLabel(doc.id)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 font-mono-code text-[10px]">
                    <span className="text-[#737373]">{doc.id}</span>
                    <span
                      className={`rounded-[2px] border px-1.5 py-0.2 ${
                        isSuperseded
                          ? "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]"
                          : "border-[#059669]/35 bg-[#059669]/10 text-[#059669]"
                      }`}
                    >
                      {doc.rev_label} · {isSuperseded ? "Superseded" : "Released"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Full-Width Document Viewer */}
      <main className="min-w-0 flex-1 overflow-y-auto bg-white">
        <div className="mx-auto max-w-4xl px-6 py-7 lg:px-10">
          {activeDoc ? (
            <FormattedRecordViewer
              rawText={activeDoc.raw_text}
              activeSpan={null}
              highlightRef={highlightRef}
              docId={activeDoc.id}
              docTitle={formatDocLabel(activeDoc.id)}
              revLabel={activeDoc.rev_label}
              docStatus={activeDoc.status}
            />
          ) : (
            <p className="text-xs text-[#666666]">
              No plant records loaded yet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
