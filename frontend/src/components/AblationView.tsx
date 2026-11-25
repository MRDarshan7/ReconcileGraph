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
} from "lucide-react";
import type { AblationResponse, AuditEvent, RunState } from "../types";

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

function formatNarrative(evt: AuditEvent): { summary: string; badge: string; tone: string } {
  const detail = evt.detail;

  if (evt.rule_id === "RULE_UNIT_CONFLICT") {
    return {
      summary: `Converted ${String(detail.claim_b ?? "175 psi")} and flagged value mismatch against ${String(detail.claim_a ?? "10.0 bar")} Spec Rev B.`,
      badge: "Conflict Flagged",
      tone: "bg-amber-100 text-amber-900",
    };
  }
  if (evt.rule_id.startsWith("RULE_BOUNDED_RETRY")) {
    return {
      summary: `Targeted re-extraction attempt #${String(detail.attempt ?? 1)} checked ${String(detail.doc_id ?? "doc4_maint_log.md")} for missing '${String(detail.slot ?? "vibration_baseline")}' — confirmed absent.`,
      badge: "Bounded Retry",
      tone: "bg-amber-100 text-amber-900",
    };
  }
  if (evt.rule_id === "RULE_AUDIT_REJECT_UNGROUNDED") {
    return {
      summary: `Blocked ungrounded candidate finding (${String(detail.span_id ?? "missing span")}) lacking a verified SHA-256 source excerpt.`,
      badge: "Blocked",
      tone: "bg-rose-100 text-rose-800",
    };
  }
  if (evt.action === "decision re-checks impact") {
    return {
      summary: `Recorded decision '${String(detail.resolution_choice ?? "")}' on ${String(detail.entity_id ?? "")} and re-checked downstream impact.`,
      badge: "Re-checked",
      tone: "bg-emerald-100 text-emerald-800",
    };
  }
  if (evt.rule_id === "RULE_BFS_BLAST_RADIUS") {
    return {
      summary: `Traversed ${String(detail.node_count ?? 5)} connected equipment/SOP nodes across ${String(detail.edge_count ?? 5)} dependency edges from ${String(detail.target_entity ?? "P-101")}.`,
      badge: "Graph BFS",
      tone: "bg-slate-100 text-slate-700",
    };
  }
  if (evt.rule_id === "RULE_RECONCILE_NORMALIZE") {
    return {
      summary: `Normalized ${String(detail.total_claims ?? 0)} claims via AliasResolver, Pint, and RevisionComparator (excluded ${String(detail.superseded_claims ?? 0)} superseded claims).`,
      badge: "Reconciled",
      tone: "bg-emerald-100 text-emerald-800",
    };
  }
  if (evt.rule_id === "RULE_AUDIT_COMPLETE") {
    return {
      summary: `Completed fail-closed audit: ${String(detail.verified ?? 0)} verified, ${String(detail.escalated ?? 0)} escalated for decision, ${String(detail.rejected ?? 0)} rejected.`,
      badge: "Audit Complete",
      tone: "bg-emerald-100 text-emerald-800",
    };
  }
  if (evt.rule_id === "RULE_ECO_SIGNOFF") {
    return {
      summary: `ECO approved and signed off: ${String(detail.sign_off_note ?? "All conflicts resolved.")}`,
      badge: "Approved",
      tone: "bg-emerald-100 text-emerald-800",
    };
  }
  return {
    summary: evt.action,
    badge: evt.rule_id,
    tone: "bg-slate-100 text-slate-700",
  };
}

export function AblationView({ runState, ablation }: AblationViewProps) {
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 bg-slate-50 p-5 lg:grid-cols-12">
      {/* Left Column: Agent Execution Story */}
      <section className="flex max-h-[calc(100vh-175px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-700" />
            <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
              Agent Execution Story
            </h2>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono-code text-[11px] font-semibold text-slate-600">
            {runState.audit_events.length} steps
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {runState.audit_events.map((evt) => {
            const narrative = formatNarrative(evt);
            const isRetry = evt.rule_id.startsWith("RULE_BOUNDED_RETRY");
            const isRejected = evt.rule_id === "RULE_AUDIT_REJECT_UNGROUNDED";
            const isRecheck = evt.action === "decision re-checks impact";
            const isExpanded = Boolean(expandedPayloads[evt.id]);

            return (
              <div
                key={evt.id}
                className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 font-mono-code text-[11px] font-bold text-white">
                      {evt.step_order}
                    </span>
                    {isRetry ? (
                      <RefreshCw className="h-4 w-4 text-amber-600" />
                    ) : isRejected ? (
                      <ShieldX className="h-4 w-4 text-rose-600" />
                    ) : isRecheck ? (
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Bot className="h-4 w-4 text-slate-600" />
                    )}
                    <span className="text-xs font-bold text-slate-900">
                      {evt.agent_name}
                    </span>
                  </div>

                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${narrative.tone}`}>
                    {narrative.badge}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-700">
                  {narrative.summary}
                </p>

                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => togglePayload(evt.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Show technical payload
                  </button>
                  <span className="font-mono-code text-[10px] text-slate-400">
                    {evt.rule_id}
                  </span>
                </div>

                {isExpanded && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono-code text-[11px] text-slate-100">
                    {JSON.stringify(evt.detail, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Right Column: 3-Way Ablation Benchmark with Visual Progress Bars */}
      <section className="flex max-h-[calc(100vh-175px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-700" />
            <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
              3-Way Ablation Benchmark ({ablation?.scenario_count ?? 3} Scenarios)
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500">0% – 100%</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {ablation ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="px-3.5 py-3">Metric</th>
                      {ablation.systems.map((sys) => (
                        <th key={sys.name} className="px-3.5 py-3">
                          {sys.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {METRIC_LABELS.map(({ key, label }) => {
                      const isOverall = key === "overall_score";
                      return (
                        <tr
                          key={key}
                          className={isOverall ? "bg-slate-50/90 font-bold" : ""}
                        >
                          <td className="px-3.5 py-3 text-slate-800">{label}</td>
                          {ablation.systems.map((sys) => {
                            const pct = Math.round(sys.metrics[key] * 100);
                            const isOurs = sys.name.includes("ReconcileGraph");
                            return (
                              <td key={sys.name} className="px-3.5 py-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={`font-mono-code text-xs ${
                                      isOurs ? "font-bold text-emerald-700" : "text-slate-700"
                                    }`}
                                  >
                                    {pct}%
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className={`h-full rounded-full ${
                                      isOurs
                                        ? "bg-emerald-600"
                                        : pct >= 50
                                          ? "bg-amber-500"
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
                  const overallPct = Math.round(sys.metrics.overall_score * 100);
                  return (
                    <div
                      key={sys.name}
                      className={`rounded-xl border p-3.5 text-xs ${
                        isOurs
                          ? "border-emerald-200 bg-emerald-50/60"
                          : "border-slate-200 bg-slate-50/70"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{sys.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono-code text-[11px] font-bold ${
                            isOurs
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {overallPct}%
                        </span>
                      </div>
                      <p className="mt-1 leading-5 text-slate-600">{sys.notes}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">Loading ablation benchmark...</p>
          )}
        </div>
      </section>
    </div>
  );
}
