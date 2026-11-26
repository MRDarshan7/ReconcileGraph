import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, ChevronDown, Clock } from "lucide-react";
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

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  const parsed = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) {
    return ts;
  }
  return parsed.toISOString().slice(11, 19);
}

function formatNarrative(evt: AuditEvent): { summary: string; dotColor: string } {
  const detail = evt.detail;

  if (evt.rule_id === "RULE_UNIT_CONFLICT") {
    return {
      summary: `Converted ${String(detail.claim_b ?? "175 psi")} and flagged mismatch against ${String(detail.claim_a ?? "10.0 bar")} Spec Rev B.`,
      dotColor: "text-[#D97706] border-[#D97706]/40 bg-[#D97706]/10",
    };
  }
  if (evt.rule_id.startsWith("RULE_BOUNDED_RETRY")) {
    const docLabel = formatDocLabel(String(detail.doc_id ?? "doc4_maint_log.md"));
    return {
      summary: `Re-checked ${docLabel} (attempt ${String(detail.attempt ?? 1)}) for '${String(detail.slot ?? "vibration_baseline")}' and confirmed absent.`,
      dotColor: "text-[#D97706] border-[#D97706]/40 bg-[#D97706]/10",
    };
  }
  if (evt.rule_id === "RULE_AUDIT_REJECT_UNGROUNDED") {
    return {
      summary: "Rejected ungrounded candidate finding missing a verified SHA-256 source span.",
      dotColor: "text-[#DC2626] border-[#DC2626]/35 bg-[#DC2626]/10",
    };
  }
  if (evt.action === "decision re-checks impact") {
    return {
      summary: `Recorded decision '${String(detail.resolution_choice ?? "")}' on ${String(detail.entity_id ?? "")} and re-verified downstream impact.`,
      dotColor: "text-[#059669] border-[#059669]/35 bg-[#059669]/10",
    };
  }
  if (evt.rule_id === "RULE_BFS_BLAST_RADIUS") {
    return {
      summary: `Traversed ${String(detail.node_count ?? 5)} connected assets across ${String(detail.edge_count ?? 5)} edges from ${String(detail.target_entity ?? "P-101")}.`,
      dotColor: "text-[#0A0A0A] border-[#E5E5E5] bg-white",
    };
  }
  if (evt.rule_id === "RULE_RECONCILE_NORMALIZE") {
    return {
      summary: `Normalized ${String(detail.total_claims ?? 0)} claims across tags, Pint units, and revisions (excluded ${String(detail.superseded_claims ?? 0)} superseded).`,
      dotColor: "text-[#059669] border-[#059669]/35 bg-[#059669]/10",
    };
  }
  if (evt.rule_id === "RULE_AUDIT_COMPLETE") {
    return {
      summary: `Completed fail-closed audit: ${String(detail.verified ?? 0)} verified, ${String(detail.escalated ?? 0)} escalated, ${String(detail.rejected ?? 0)} rejected.`,
      dotColor: "text-[#059669] border-[#059669]/35 bg-[#059669]/10",
    };
  }
  if (evt.rule_id === "RULE_ECO_SIGNOFF") {
    return {
      summary: `ECO approved and signed off: ${String(detail.sign_off_note ?? "All conflicts resolved.")}`,
      dotColor: "text-[#059669] border-[#059669]/35 bg-[#059669]/10",
    };
  }
  if (evt.rule_id === "RULE_LLM_FALLBACK") {
    return {
      summary: `Activated deterministic fallback (${String(detail.summary ?? "offline mode")}).`,
      dotColor: "text-[#D97706] border-[#D97706]/40 bg-[#D97706]/10",
    };
  }
  return {
    summary: evt.action,
    dotColor: "text-[#0A0A0A] border-[#E5E5E5] bg-white",
  };
}

export function AblationView({ runState, ablation }: AblationViewProps) {
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="grid grid-cols-1 divide-y divide-[#E5E5E5] bg-white lg:h-[calc(100vh-52px)] lg:grid-cols-12 lg:divide-x lg:divide-y-0 lg:overflow-hidden">
      {/* Left Column: Sleek Linear Continuous Vertical Timeline */}
      <section className="flex min-h-[460px] flex-col lg:col-span-6 lg:min-h-0">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E5E5] bg-[#FAFAFB] px-5">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-[#0A0A0A]" />
            <h2 className="text-xs font-medium text-[#0A0A0A]">
              Chronological verification trace
            </h2>
          </div>
          <span className="font-mono-code text-[11px] text-[#737373]">
            {runState.audit_events.length} steps
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="ml-3 border-l border-[#E5E5E5] pl-5">
            {runState.audit_events.map((evt) => {
              const narrative = formatNarrative(evt);
              const isExpanded = Boolean(expandedPayloads[evt.id]);

              return (
                <div
                  key={evt.id}
                  className="relative border-b border-[#F0F0F0] py-2.5 last:border-b-0"
                >
                  {/* Mono Index Dot */}
                  <span
                    className={`absolute -left-[31px] top-3 flex h-[21px] w-[21px] items-center justify-center rounded-[3px] border font-mono-code text-[10px] font-medium ${narrative.dotColor}`}
                  >
                    {String(evt.step_order).padStart(2, "0")}
                  </span>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono-code text-[11px] font-medium text-[#0A0A0A]">
                          {evt.agent_name}
                        </span>
                        <span className="font-mono-code text-[10px] text-[#737373]">
                          {evt.rule_id}
                        </span>
                        <span className="font-mono-code text-[10px] text-[#999999]">
                          {formatTimestamp(evt.timestamp)}
                        </span>
                      </div>

                      <p className="mt-1 text-xs leading-5 text-[#52525B]">
                        {formatDocLabel(narrative.summary)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => togglePayload(evt.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-0.5 font-mono-code text-[10px] font-medium text-[#737373] transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/[0.04] hover:text-[#0A0A0A]"
                    >
                      <span>JSON</span>
                      <ChevronDown
                        className={`h-3 w-3 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Right Column: Clean 3-Way System Benchmark Scorecard */}
      <section className="flex min-h-[460px] flex-col lg:col-span-6 lg:min-h-0">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E5E5] bg-[#FAFAFB] px-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-[#0A0A0A]" />
            <h2 className="text-xs font-medium text-[#0A0A0A]">
              3-way benchmark scorecard
            </h2>
          </div>
          <span className="font-mono-code text-[11px] text-[#737373]">
            {ablation ? `${ablation.scenario_count} scenarios` : "Loading"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {ablation ? (
            <>
              <div className="overflow-x-auto rounded-[2px] border border-[#E5E5E5]">
                <table className="w-full border-collapse text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-[#E5E5E5] bg-[#FAFAFB] font-mono-code text-[10px] font-medium text-[#737373] uppercase">
                      <th className="px-3.5 py-2.5">Metric</th>
                      {ablation.systems.map((sys) => {
                        const isOurs = sys.name.includes("ReconcileGraph");
                        return (
                          <th
                            key={sys.name}
                            className={`px-3.5 py-2.5 ${
                              isOurs ? "bg-[#059669]/[0.06] text-[#059669]" : ""
                            }`}
                          >
                            {sys.name}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0]">
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
                                  isOurs ? "bg-[#059669]/[0.03]" : ""
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
                                  <span className="text-[10px] text-[#737373]">
                                    {score.toFixed(2)}
                                  </span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[1px] bg-[#E5E5E5]">
                                  <div
                                    className={`h-full rounded-[1px] ${
                                      isOurs
                                        ? "bg-[#059669]"
                                        : pct >= 50
                                          ? "bg-[#737373]"
                                          : "bg-[#B4B4BC]"
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

              {/* Clean 3-Row Hairline Summary Ledger */}
              <div className="mt-6 divide-y divide-[#F0F0F0] border-t border-b border-[#E5E5E5]">
                {ablation.systems.map((sys) => {
                  const isOurs = sys.name.includes("ReconcileGraph");
                  const overallScore = sys.metrics.overall_score;
                  const overallPct = Math.round(overallScore * 100);
                  return (
                    <div
                      key={sys.name}
                      className="flex flex-col gap-1 py-3.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 font-medium text-[#0A0A0A]">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isOurs ? "bg-[#059669]" : "bg-[#94A3B8]"
                            }`}
                          />
                          {sys.name}
                        </span>
                        <span
                          className={`font-mono-code text-[11px] font-medium tabular-nums ${
                            isOurs ? "text-[#059669]" : "text-[#666666]"
                          }`}
                        >
                          {overallPct}% ({overallScore.toFixed(2)})
                        </span>
                      </div>
                      <p className="pl-3.5 text-xs leading-5 text-[#737373]">
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
