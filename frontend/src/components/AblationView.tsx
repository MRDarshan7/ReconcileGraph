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
  { key: "evidence_traceability", label: "Evidence Traceability" },
  { key: "revision_resolution", label: "Revision Resolution" },
  { key: "conflict_detection", label: "Conflict Detection" },
  { key: "impact_correctness", label: "Impact Correctness" },
  { key: "escalation_precision", label: "Escalation Precision" },
  { key: "audit_faithfulness", label: "Audit Faithfulness" },
  { key: "overall_score", label: "Overall Score" },
];

const AGENT_BADGE_STYLES: Record<string, { label: string; style: string }> = {
  ExtractionAgent: {
    label: "ExtractionAgent",
    style: "border-sky-200 bg-sky-50 text-sky-800",
  },
  ReconciliationAgent: {
    label: "ReconciliationAgent",
    style: "border-amber-200 bg-amber-50 text-amber-900",
  },
  ImpactAgent: {
    label: "ImpactAgent",
    style: "border-indigo-200 bg-indigo-50 text-indigo-800",
  },
  AuditorAgent: {
    label: "AuditorAgent",
    style: "border-rose-200 bg-rose-50 text-rose-800",
  },
  ReviewGate: {
    label: "ReviewGate",
    style: "border-emerald-200 bg-emerald-50 text-emerald-800",
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
      tone: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  if (evt.rule_id.startsWith("RULE_BOUNDED_RETRY")) {
    const docLabel = formatDocLabel(String(detail.doc_id ?? "doc4_maint_log.md"));
    return {
      summary: `Re-checked ${docLabel} (attempt ${String(detail.attempt ?? 1)}) for missing '${String(detail.slot ?? "vibration_baseline")}' — confirmed absent.`,
      badge: "BOUNDED RETRY",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  if (evt.rule_id === "RULE_AUDIT_REJECT_UNGROUNDED") {
    return {
      summary: "Rejected an ungrounded candidate finding lacking a verified SHA-256 source span.",
      badge: "BLOCKED",
      tone: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }
  if (evt.action === "decision re-checks impact") {
    return {
      summary: `Recorded engineering decision '${String(detail.resolution_choice ?? "")}' for ${String(detail.entity_id ?? "")} and re-verified downstream impact.`,
      badge: "RE-VERIFIED",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (evt.rule_id === "RULE_BFS_BLAST_RADIUS") {
    return {
      summary: `Traversed ${String(detail.node_count ?? 5)} connected plant assets and procedures across ${String(detail.edge_count ?? 5)} dependencies from ${String(detail.target_entity ?? "P-101")}.`,
      badge: "IMPACT MAPPED",
      tone: "border-sky-200 bg-sky-50 text-sky-800",
    };
  }
  if (evt.rule_id === "RULE_RECONCILE_NORMALIZE") {
    return {
      summary: `Normalized ${String(detail.total_claims ?? 0)} extracted claims across equipment tags, Pint units, and revisions (excluded ${String(detail.superseded_claims ?? 0)} superseded claims).`,
      badge: "RECONCILED",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (evt.rule_id === "RULE_AUDIT_COMPLETE") {
    return {
      summary: `Completed fail-closed audit: ${String(detail.verified ?? 0)} verified, ${String(detail.escalated ?? 0)} escalated, ${String(detail.rejected ?? 0)} rejected.`,
      badge: "AUDIT COMPLETE",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (evt.rule_id === "RULE_ECO_SIGNOFF") {
    return {
      summary: `ECO approved and signed off: ${String(detail.sign_off_note ?? "All conflicts resolved.")}`,
      badge: "APPROVED",
      tone: "border-emerald-300 bg-emerald-100 text-emerald-900",
    };
  }
  if (evt.rule_id === "RULE_LLM_FALLBACK") {
    return {
      summary: `Activated deterministic guardrail fallback (${String(detail.summary ?? "offline mode")}).`,
      badge: "OFFLINE FALLBACK",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  return {
    summary: evt.action,
    badge: "COMPLETED",
    tone: "border-slate-200 bg-slate-100 text-slate-700",
  };
}

export function AblationView({ runState, ablation }: AblationViewProps) {
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 bg-slate-50 p-4 lg:h-[calc(100vh-118px)] lg:min-h-[600px] lg:grid-cols-12">
      {/* Left Column: Chronological Verification Trace */}
      <section className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs lg:col-span-6 lg:min-h-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-600" />
            <h2 className="font-mono-code text-[11px] font-bold tracking-wider text-slate-800 uppercase">
              Chronological Verification Trace
            </h2>
          </div>
          <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono-code text-[10px] font-bold text-slate-700">
            {runState.audit_events.length} STEPS
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="relative space-y-3 pl-5 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-slate-200">
            {runState.audit_events.map((evt) => {
              const narrative = formatNarrative(evt);
              const isRetry = evt.rule_id.startsWith("RULE_BOUNDED_RETRY");
              const isRejected = evt.rule_id === "RULE_AUDIT_REJECT_UNGROUNDED";
              const isRecheck = evt.action === "decision re-checks impact";
              const isExpanded = Boolean(expandedPayloads[evt.id]);
              const agentInfo = AGENT_BADGE_STYLES[evt.agent_name] ?? {
                label: evt.agent_name,
                style: "border-slate-200 bg-slate-100 text-slate-700",
              };

              return (
                <div key={evt.id} className="relative">
                  {/* Timeline Step Circle */}
                  <span
                    className={`absolute -left-5 top-3.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border font-mono-code text-[10px] font-bold shadow-2xs ${
                      isRejected
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : isRecheck
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : isRetry
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-slate-300 bg-white text-slate-800"
                    }`}
                  >
                    {String(evt.step_order).padStart(2, "0")}
                  </span>

                  <div className="rounded-lg border border-slate-200 bg-white p-3.5 transition hover:border-slate-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono-code text-[10px] font-bold ${agentInfo.style}`}
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

                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono-code text-[10px] font-semibold text-slate-700">
                          {evt.rule_id}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono-code text-[9px] font-bold ${narrative.tone}`}
                        >
                          {narrative.badge}
                        </span>
                        <span className="font-mono-code text-[10px] text-slate-400">
                          {formatTimestamp(evt.timestamp)}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-slate-700">
                      {formatDocLabel(narrative.summary)}
                    </p>

                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => togglePayload(evt.id)}
                        className="inline-flex items-center gap-1 font-mono-code text-[10px] font-semibold text-slate-500 transition hover:text-slate-900"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <Terminal className="h-3 w-3" />
                        Inspect Raw Trace JSON
                      </button>
                    </div>

                    {isExpanded && (
                      <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono-code text-[11px] leading-relaxed text-slate-200">
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
      <section className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs lg:col-span-6 lg:min-h-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-slate-600" />
            <h2 className="font-mono-code text-[11px] font-bold tracking-wider text-slate-800 uppercase">
              System Benchmark Scorecard
            </h2>
          </div>
          <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono-code text-[10px] font-bold text-slate-700">
            {ablation ? `${ablation.scenario_count} SCENARIOS` : "GET /api/ablation"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {ablation ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-mono-code text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                      <th className="px-3.5 py-2.5">Metric</th>
                      {ablation.systems.map((sys) => {
                        const isOurs = sys.name.includes("ReconcileGraph");
                        return (
                          <th
                            key={sys.name}
                            className={`px-3.5 py-2.5 ${
                              isOurs ? "bg-emerald-50/80 text-emerald-900" : ""
                            }`}
                          >
                            {sys.name}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {METRIC_LABELS.map(({ key, label }) => {
                      const isOverall = key === "overall_score";
                      return (
                        <tr
                          key={key}
                          className={
                            isOverall
                              ? "border-t border-slate-200 bg-slate-50/90 font-bold"
                              : ""
                          }
                        >
                          <td className="px-3.5 py-2.5 text-xs font-medium text-slate-800">
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
                                  isOurs ? "bg-emerald-50/45" : ""
                                }`}
                              >
                                <div className="flex items-baseline justify-between gap-2 font-mono-code">
                                  <span
                                    className={`text-xs font-bold ${
                                      isOurs ? "text-emerald-700" : "text-slate-800"
                                    }`}
                                  >
                                    {pct}%
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {score.toFixed(2)}
                                  </span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                                  <div
                                    className={`h-full rounded-full ${
                                      isOurs
                                        ? "bg-emerald-600"
                                        : pct >= 50
                                          ? "bg-sky-500"
                                          : "bg-slate-400"
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

              <div className="mt-4 space-y-2.5">
                {ablation.systems.map((sys) => {
                  const isOurs = sys.name.includes("ReconcileGraph");
                  const overallScore = sys.metrics.overall_score;
                  const overallPct = Math.round(overallScore * 100);
                  return (
                    <div
                      key={sys.name}
                      className={`rounded-lg border p-3.5 text-xs ${
                        isOurs
                          ? "border-emerald-200 bg-emerald-50/55"
                          : "border-slate-200 bg-slate-50/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-slate-900">
                          {sys.name}
                        </span>
                        <span
                          className={`rounded border px-2 py-0.5 font-mono-code text-[10px] font-bold ${
                            isOurs
                              ? "border-emerald-300 bg-white text-emerald-800"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          {overallPct}% ({overallScore.toFixed(2)})
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11.5px] leading-5 text-slate-600">
                        {sys.notes}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono-code text-xs text-slate-500">
                Fetching 3-way benchmark scorecard from /api/ablation...
              </div>
              <div className="h-44 animate-pulse rounded-lg border border-slate-200 bg-slate-100/70" />
              <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100/70" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
