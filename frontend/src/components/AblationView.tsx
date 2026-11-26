import { useState } from "react";
import {
  BarChart3,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Terminal,
} from "lucide-react";
import type { AblationResponse, AuditEvent, RunState } from "../types";
import { formatDocLabel } from "../utils/docNames";

interface AblationViewProps {
  runState: RunState;
  ablation: AblationResponse | null;
}

const METRIC_LABELS: Array<{
  key: keyof AblationResponse["systems"][number]["metrics"];
  label: string;
}> = [
  { key: "evidence_traceability", label: "Evidence traceability" },
  { key: "revision_resolution", label: "Revision resolution" },
  { key: "conflict_detection", label: "Conflict detection" },
  { key: "impact_correctness", label: "Impact correctness" },
  { key: "escalation_precision", label: "Escalation precision" },
  { key: "audit_faithfulness", label: "Audit faithfulness" },
  { key: "overall_score", label: "Overall score" },
];

const AGENT_BADGE_STYLES: Record<string, { label: string; style: string }> = {
  ExtractionAgent: {
    label: "ExtractionAgent",
    style: "border-[#E5E5E5] bg-[#F7F7F8] text-[#0A0A0A]",
  },
  ReconciliationAgent: {
    label: "ReconciliationAgent",
    style: "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]",
  },
  ImpactAgent: {
    label: "ImpactAgent",
    style: "border-[#E5E5E5] bg-[#F7F7F8] text-[#0A0A0A]",
  },
  AuditorAgent: {
    label: "AuditorAgent",
    style: "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]",
  },
  ReviewGate: {
    label: "ReviewGate",
    style: "border-[#059669]/30 bg-[#059669]/10 text-[#059669]",
  },
};

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  const parsed = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) {
    return ts;
  }
  return parsed.toISOString().slice(11, 19) + " UTC";
}

function formatNarrative(evt: AuditEvent): { summary: string; badge: string; tone: string } {
  const detail = evt.detail;

  if (evt.rule_id === "RULE_UNIT_CONFLICT") {
    return {
      summary: `Converted ${String(detail.claim_b ?? "175 psi")} and flagged mismatch against ${String(detail.claim_a ?? "10.0 bar")} Spec Rev B.`,
      badge: "CONFLICT FLAGGED",
      tone: "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]",
    };
  }
  if (evt.rule_id.startsWith("RULE_BOUNDED_RETRY")) {
    const docLabel = formatDocLabel(String(detail.doc_id ?? "doc4_maint_log.md"));
    return {
      summary: `Re-checked ${docLabel} (attempt ${String(detail.attempt ?? 1)}) for missing '${String(detail.slot ?? "vibration_baseline")}' and confirmed absent.`,
      badge: "BOUNDED RETRY",
      tone: "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]",
    };
  }
  if (evt.rule_id === "RULE_AUDIT_REJECT_UNGROUNDED") {
    return {
      summary: "Rejected an ungrounded candidate finding lacking a verified SHA-256 source span.",
      badge: "BLOCKED",
      tone: "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626]",
    };
  }
  if (evt.action === "decision re-checks impact") {
    return {
      summary: `Recorded engineering decision '${String(detail.resolution_choice ?? "")}' for ${String(detail.entity_id ?? "")} and re-verified downstream impact.`,
      badge: "RE-VERIFIED",
      tone: "border-[#059669]/30 bg-[#059669]/10 text-[#059669]",
    };
  }
  if (evt.rule_id === "RULE_BFS_BLAST_RADIUS") {
    return {
      summary: `Traversed ${String(detail.node_count ?? 5)} connected plant assets and procedures across ${String(detail.edge_count ?? 5)} dependencies from ${String(detail.target_entity ?? "P-101")}.`,
      badge: "IMPACT MAPPED",
      tone: "border-[#E5E5E5] bg-[#F7F7F8] text-[#0A0A0A]",
    };
  }
  if (evt.rule_id === "RULE_RECONCILE_NORMALIZE") {
    return {
      summary: `Normalized ${String(detail.total_claims ?? 0)} extracted claims across equipment tags, Pint units, and revisions (excluded ${String(detail.superseded_claims ?? 0)} superseded claims).`,
      badge: "RECONCILED",
      tone: "border-[#059669]/30 bg-[#059669]/10 text-[#059669]",
    };
  }
  if (evt.rule_id === "RULE_AUDIT_COMPLETE") {
    return {
      summary: `Completed fail-closed audit: ${String(detail.verified ?? 0)} verified, ${String(detail.escalated ?? 0)} escalated, ${String(detail.rejected ?? 0)} rejected.`,
      badge: "AUDIT COMPLETE",
      tone: "border-[#059669]/30 bg-[#059669]/10 text-[#059669]",
    };
  }
  if (evt.rule_id === "RULE_ECO_SIGNOFF") {
    return {
      summary: `ECO approved and signed off: ${String(detail.sign_off_note ?? "All conflicts resolved.")}`,
      badge: "APPROVED",
      tone: "border-[#059669]/35 bg-[#059669]/10 text-[#059669]",
    };
  }
  if (evt.rule_id === "RULE_LLM_FALLBACK") {
    return {
      summary: `Activated deterministic guardrail fallback (${String(detail.summary ?? "offline mode")}).`,
      badge: "OFFLINE FALLBACK",
      tone: "border-[#D97706]/35 bg-[#D97706]/10 text-[#D97706]",
    };
  }
  return {
    summary: evt.action,
    badge: "COMPLETED",
    tone: "border-[#E5E5E5] bg-[#F7F7F8] text-[#666666]",
  };
}

export function AblationView({ runState, ablation }: AblationViewProps) {
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="grid grid-cols-1 divide-y divide-[#E5E5E5] bg-white lg:h-[calc(100vh-52px)] lg:grid-cols-12 lg:divide-x lg:divide-y-0 lg:overflow-hidden">
      {/* Left Column: Chronological Verification Trace */}
      <section className="flex min-h-[460px] flex-col lg:col-span-6 lg:min-h-0">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E5E5] bg-[#FAFAFB] px-5">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-[#0A0A0A]" />
            <h2 className="text-xs font-medium text-[#0A0A0A]">
              Chronological verification trace
            </h2>
          </div>
          <span className="font-mono-code text-[11px] text-[#666666]">
            {runState.audit_events.length} steps
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="relative space-y-3 pl-7 before:absolute before:top-2 before:bottom-2 before:left-[10px] before:w-px before:bg-[#E5E5E5]">
            {runState.audit_events.map((evt) => {
              const narrative = formatNarrative(evt);
              const isRetry = evt.rule_id.startsWith("RULE_BOUNDED_RETRY");
              const isRejected = evt.rule_id === "RULE_AUDIT_REJECT_UNGROUNDED";
              const isRecheck = evt.action === "decision re-checks impact";
              const isExpanded = Boolean(expandedPayloads[evt.id]);
              const agentInfo = AGENT_BADGE_STYLES[evt.agent_name] ?? {
                label: evt.agent_name,
                style: "border-[#E5E5E5] bg-[#F7F7F8] text-[#0A0A0A]",
              };

              return (
                <div key={evt.id} className="relative">
                  <span
                    className={`absolute -left-7 top-3 flex h-[21px] w-[21px] items-center justify-center rounded-[2px] border font-mono-code text-[10px] font-medium ${
                      isRejected
                        ? "border-[#DC2626]/40 bg-[#DC2626]/10 text-[#DC2626]"
                        : isRecheck
                          ? "border-[#059669]/40 bg-[#059669]/10 text-[#059669]"
                          : isRetry
                            ? "border-[#D97706]/40 bg-[#D97706]/10 text-[#D97706]"
                            : "border-[#E5E5E5] bg-white text-[#0A0A0A]"
                    }`}
                  >
                    {String(evt.step_order).padStart(2, "0")}
                  </span>

                  <div className="rounded-[2px] border border-[#E5E5E5] bg-white p-3.5 transition-[border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#0A0A0A]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 font-mono-code text-[10px] font-medium ${agentInfo.style}`}
                        >
                          {isRetry ? (
                            <RefreshCw className="h-3 w-3" />
                          ) : isRejected ? (
                            <ShieldX className="h-3 w-3" />
                          ) : isRecheck ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : (
                            <Bot className="h-3 w-3" />
                          )}
                          {agentInfo.label}
                        </span>

                        <span className="rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFB] px-1.5 py-0.5 font-mono-code text-[10px] text-[#666666]">
                          {evt.rule_id}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-[2px] border px-1.5 py-0.5 font-mono-code text-[9px] font-medium ${narrative.tone}`}
                        >
                          {narrative.badge}
                        </span>
                        <span className="font-mono-code text-[10px] text-[#666666]">
                          {formatTimestamp(evt.timestamp)}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[#333333]">
                      {formatDocLabel(narrative.summary)}
                    </p>

                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() => togglePayload(evt.id)}
                        className="inline-flex items-center gap-1 font-mono-code text-[10px] font-medium text-[#666666] transition-[color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[#0A0A0A]"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <Terminal className="h-3 w-3" />
                        <span>Inspect raw trace JSON</span>
                      </button>
                    </div>

                    {isExpanded && (
                      <pre className="mt-2 overflow-x-auto rounded-[2px] border border-[#E5E5E5] bg-[#0A0A0A] p-3 font-mono-code text-[11px] leading-relaxed text-[#E5E5E5]">
                        {JSON.stringify(
                          {
                            step_order: evt.step_order,
                            agent: evt.agent_name,
                            rule_id: evt.rule_id,
                            timestamp: evt.timestamp,
                            detail: evt.detail,
                          },
                          null,
                          2
                        )}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Right Column: 3-Way System Benchmark Scorecard */}
      <section className="flex min-h-[460px] flex-col lg:col-span-6 lg:min-h-0">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E5E5] bg-[#FAFAFB] px-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-[#0A0A0A]" />
            <h2 className="text-xs font-medium text-[#0A0A0A]">
              3-way benchmark scorecard
            </h2>
          </div>
          <span className="font-mono-code text-[11px] text-[#666666]">
            {ablation ? `${ablation.scenario_count} scenarios` : "Loading"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {ablation ? (
            <>
              <div className="overflow-x-auto rounded-[2px] border border-[#E5E5E5]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E5E5] bg-[#FAFAFB] font-mono-code text-[10px] font-medium text-[#666666] uppercase">
                      <th className="px-3.5 py-2.5">Metric</th>
                      {ablation.systems.map((sys) => {
                        const isOurs = sys.name.includes("ReconcileGraph");
                        return (
                          <th
                            key={sys.name}
                            className={`px-3.5 py-2.5 ${
                              isOurs ? "bg-[#059669]/10 text-[#059669]" : ""
                            }`}
                          >
                            {sys.name}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {METRIC_LABELS.map(({ key, label }) => {
                      const isOverall = key === "overall_score";
                      return (
                        <tr
                          key={key}
                          className={
                            isOverall
                              ? "border-t border-[#E5E5E5] bg-[#FAFAFB] font-medium"
                              : ""
                          }
                        >
                          <td className="px-3.5 py-2.5 text-xs text-[#0A0A0A]">
                            {label}
                          </td>
                          {ablation.systems.map((sys) => {
                            const score = sys.metrics[key];
                            const pct = Math.round(score * 100);
                            const isOurs = sys.name.includes("ReconcileGraph");
                            return (
                              <td
                                key={sys.name}
                                className={`px-3.5 py-2.5 ${
                                  isOurs ? "bg-[#059669]/[0.04]" : ""
                                }`}
                              >
                                <div className="flex items-baseline justify-between gap-2 font-mono-code">
                                  <span
                                    className={`text-xs font-medium ${
                                      isOurs ? "text-[#059669]" : "text-[#0A0A0A]"
                                    }`}
                                  >
                                    {pct}%
                                  </span>
                                  <span className="text-[10px] text-[#666666]">
                                    {score.toFixed(2)}
                                  </span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[1px] bg-[#E5E5E5]">
                                  <div
                                    className={`h-full rounded-[1px] ${
                                      isOurs
                                        ? "bg-[#059669]"
                                        : pct >= 50
                                          ? "bg-[#666666]"
                                          : "bg-[#A3A3A3]"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 space-y-2.5">
                {ablation.systems.map((sys) => {
                  const isOurs = sys.name.includes("ReconcileGraph");
                  const overallScore = sys.metrics.overall_score;
                  const overallPct = Math.round(overallScore * 100);
                  return (
                    <div
                      key={sys.name}
                      className={`rounded-[2px] border border-[#E5E5E5] p-3.5 text-xs ${
                        isOurs
                          ? "border-l-2 border-l-[#059669] bg-[#FAFAFB]"
                          : "bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[#0A0A0A]">{sys.name}</span>
                        <span
                          className={`rounded-[2px] border px-2 py-0.5 font-mono-code text-[10px] font-medium ${
                            isOurs
                              ? "border-[#059669]/30 bg-[#059669]/10 text-[#059669]"
                              : "border-[#E5E5E5] bg-[#F7F7F8] text-[#666666]"
                          }`}
                        >
                          {overallPct}% ({overallScore.toFixed(2)})
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-[#666666]">
                        {sys.notes}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFB] p-4 font-mono-code text-xs text-[#666666]">
              Fetching 3-way benchmark scorecard from /api/ablation...
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
