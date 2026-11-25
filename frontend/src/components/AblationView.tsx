import { BarChart3, Clock, RefreshCw, ShieldAlert, ShieldX } from "lucide-react";
import type { AblationResponse, RunState } from "../types";

interface AblationViewProps {
  runState: RunState;
  ablation: AblationResponse | null;
}

const METRIC_LABELS: Array<{ key: keyof AblationResponse["systems"][number]["metrics"]; label: string }> = [
  { key: "evidence_traceability", label: "Evidence Traceability" },
  { key: "revision_resolution", label: "Revision Resolution" },
  { key: "conflict_detection", label: "Conflict Detection" },
  { key: "impact_correctness", label: "Impact Correctness" },
  { key: "escalation_precision", label: "Escalation Precision" },
  { key: "audit_faithfulness", label: "Audit Faithfulness" },
  { key: "overall_score", label: "Overall Score" },
];

export function AblationView({ runState, ablation }: AblationViewProps) {
  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-12">
      {/* Audit Event Timeline */}
      <section className="rounded-lg border border-slate-200 bg-white lg:col-span-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-700" />
            <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
              Chronological Agent &amp; Guardrail Audit Trace
            </h2>
          </div>
          <span className="font-mono-code text-[11px] text-slate-500">
            {runState.audit_events.length} events
          </span>
        </div>

        <div className="max-h-[600px] divide-y divide-slate-100 overflow-y-auto p-3">
          {runState.audit_events.map((evt) => {
            const isRetry = evt.rule_id.startsWith("RULE_BOUNDED_RETRY");
            const isRejected = evt.rule_id === "RULE_AUDIT_REJECT_UNGROUNDED";
            const isRecheck = evt.action === "decision re-checks impact";

            return (
              <div
                key={evt.id}
                className={`rounded-md px-3 py-2.5 ${
                  isRetry
                    ? "bg-amber-50/70"
                    : isRejected
                      ? "bg-rose-50/70"
                      : isRecheck
                        ? "bg-emerald-50/80"
                        : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 font-mono-code text-[10px] font-bold text-white">
                      {evt.step_order}
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {evt.agent_name}
                    </span>
                    {isRetry && <RefreshCw className="h-3.5 w-3.5 text-amber-700" />}
                    {isRejected && <ShieldX className="h-3.5 w-3.5 text-rose-700" />}
                    {isRecheck && <ShieldAlert className="h-3.5 w-3.5 text-emerald-700" />}
                  </div>
                  <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono-code text-[10px] font-semibold text-slate-700">
                    {evt.rule_id}
                  </span>
                </div>
                <div className="mt-1 text-xs font-medium text-slate-800">{evt.action}</div>
                <pre className="mt-1 overflow-x-auto rounded bg-slate-900/5 p-2 font-mono-code text-[10px] text-slate-600">
                  {JSON.stringify(evt.detail, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3-Way Ablation Benchmark Table */}
      <section className="rounded-lg border border-slate-200 bg-white lg:col-span-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-700" />
            <h2 className="text-xs font-bold tracking-wide text-slate-900 uppercase">
              3-Way Ablation Benchmark ({ablation?.scenario_count ?? 3} Scenarios)
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            Score range: 0.00 – 1.00
          </span>
        </div>

        <div className="p-4">
          {ablation ? (
            <>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="px-3 py-2.5">Metric</th>
                      {ablation.systems.map((sys) => (
                        <th key={sys.name} className="px-3 py-2.5">
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
                          className={isOverall ? "bg-slate-50 font-bold" : ""}
                        >
                          <td className="px-3 py-2.5 text-slate-800">{label}</td>
                          {ablation.systems.map((sys) => {
                            const val = sys.metrics[key];
                            const isOurs = sys.name.includes("ReconcileGraph");
                            return (
                              <td
                                key={sys.name}
                                className={`px-3 py-2.5 font-mono-code ${
                                  isOurs ? "font-bold text-emerald-700" : "text-slate-700"
                                }`}
                              >
                                {val.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-2">
                {ablation.systems.map((sys) => (
                  <div
                    key={sys.name}
                    className={`rounded-md border p-3 text-xs ${
                      sys.name.includes("ReconcileGraph")
                        ? "border-emerald-200 bg-emerald-50/60"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{sys.name}</div>
                    <p className="mt-0.5 text-slate-600">{sys.notes}</p>
                  </div>
                ))}
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
