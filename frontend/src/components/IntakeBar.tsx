import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  GitBranch,
  Layers,
  Lock,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import type { RunState, ScenarioPreset, WorkbenchTab } from "../types";

interface IntakeBarProps {
  scenarios: ScenarioPreset[];
  selectedScenarioId: string;
  onScenarioChange: (id: string) => void;
  customPressure: string;
  onCustomPressureChange: (val: string) => void;
  onRunVerification: () => void;
  isRunning: boolean;
  runState: RunState | null;
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  onSignOff: (reviewerName: string, rationale: string) => Promise<void>;
  isSigningOff: boolean;
}

const SCENARIO_LABELS: Record<string, string> = {
  eco_01_pump_upgrade: "ECO-01: Pump P-101 High-Capacity Upgrade",
  eco_02_seal_swap: "ECO-02: Mechanical Seal Swap",
  eco_03_valve_upgrade: "ECO-03: Valve V-12 Class 300 Upgrade",
};

const AGENT_STEPS = [
  "1. Extraction",
  "2. Reconciliation",
  "3. Impact",
  "4. Auditor",
];

export function IntakeBar({
  scenarios,
  selectedScenarioId,
  onScenarioChange,
  customPressure,
  onCustomPressureChange,
  onRunVerification,
  isRunning,
  runState,
  activeTab,
  onTabChange,
  onSignOff,
  isSigningOff,
}: IntakeBarProps) {
  const [activeAgentStep, setActiveAgentStep] = useState<number>(0);
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [signOffRationale, setSignOffRationale] = useState("");
  const [signOffError, setSignOffError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRunning) {
      setActiveAgentStep(runState ? 4 : 0);
      return;
    }
    setActiveAgentStep(0);
    const timer = window.setInterval(() => {
      setActiveAgentStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 350);
    return () => window.clearInterval(timer);
  }, [isRunning, runState]);

  const openConflictsCount =
    runState?.conflicts.filter((c) => c.status === "OPEN").length ?? 0;
  const canSignOff = Boolean(runState?.can_sign_off && !runState?.signed_off);

  const handleConfirmSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerName.trim() || !signOffRationale.trim()) {
      setSignOffError("Reviewer name and rationale are required.");
      return;
    }
    setSignOffError(null);
    try {
      await onSignOff(reviewerName.trim(), signOffRationale.trim());
      setShowSignOffModal(false);
      setReviewerName("");
      setSignOffRationale("");
    } catch (err) {
      setSignOffError(err instanceof Error ? err.message : "Sign-off failed.");
    }
  };

  return (
    <header className="border-b border-slate-200 bg-white shadow-xs">
      <div className="mx-auto max-w-[1600px] px-4 py-3">
        {/* Top Row: Brand, Controls, Sign-Off */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-slate-900">
                  ReconcileGraph
                </h1>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono-code text-[11px] font-medium text-slate-600">
                  Line-4 ECO Workbench
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Span-Anchored Engineering Change Verification &amp; Provenance Graph
              </p>
            </div>
          </div>

          {/* Scenario & Run Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="ECO Scenario Preset"
              value={selectedScenarioId}
              onChange={(e) => onScenarioChange(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-slate-500 focus:outline-none"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {SCENARIO_LABELS[s.id] ?? s.title}
                </option>
              ))}
            </select>

            <div className="flex items-center rounded-md border border-slate-300 bg-slate-50 px-2 py-1">
              <label
                htmlFor="custom-pressure-input"
                className="mr-1.5 text-[11px] font-medium text-slate-500"
              >
                Override P (bar):
              </label>
              <input
                id="custom-pressure-input"
                type="number"
                step="0.1"
                min="0"
                placeholder="preset"
                value={customPressure}
                onChange={(e) => onCustomPressureChange(e.target.value)}
                className="w-18 bg-transparent font-mono-code text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={onRunVerification}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunning ? "Running Agents..." : "Run Verification"}
            </button>
          </div>

          {/* Execution Mode Pill + Sign-Off Gate */}
          <div className="flex items-center gap-2.5">
            {runState && runState.execution_mode === "LIVE_GEMINI" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <Cpu className="h-3.5 w-3.5" />
                LIVE GEMINI • {runState.active_key_slot ?? "Key #1"}
              </span>
            )}

            {runState && runState.execution_mode === "DETERMINISTIC_FALLBACK" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5" />
                DETERMINISTIC FALLBACK
              </span>
            )}

            {runState?.signed_off ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                <CheckCircle2 className="h-4 w-4" />
                ECO APPROVED
              </span>
            ) : (
              <button
                type="button"
                disabled={!canSignOff || isSigningOff}
                onClick={() => setShowSignOffModal(true)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  canSignOff
                    ? "bg-emerald-700 text-white hover:bg-emerald-800"
                    : "cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500"
                }`}
              >
                {canSignOff ? (
                  <ShieldCheck className="h-3.5 w-3.5" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                Approve &amp; Sign-Off ECO
                {!canSignOff && runState && (
                  <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 font-mono-code text-[10px] font-bold text-rose-800">
                    {openConflictsCount} Open {openConflictsCount === 1 ? "Conflict" : "Conflicts"}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Fallback Warning Banner */}
        {runState?.execution_mode === "DETERMINISTIC_FALLBACK" && runState.fallback_notice && (
          <div className="mt-2.5 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            <span>{runState.fallback_notice}</span>
          </div>
        )}

        {/* Bottom Row: 4-Agent Stepper + Navigation Tabs */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
          <nav className="flex items-center gap-1" aria-label="Workbench Views">
            <button
              type="button"
              onClick={() => onTabChange("review")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "review"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              3-Pane Review Workspace
            </button>
            <button
              type="button"
              onClick={() => onTabChange("graph")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "graph"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Blast-Radius Graph
            </button>
            <button
              type="button"
              onClick={() => onTabChange("ablation")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "ablation"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              Audit Trace &amp; Ablation
            </button>
          </nav>

          {/* 4-Agent Stepper */}
          <div className="flex items-center gap-1.5" aria-label="Agent Pipeline Progress">
            {AGENT_STEPS.map((label, idx) => {
              const isDone = !isRunning && runState !== null;
              const isActive = isRunning && idx === activeAgentStep;
              const isPassed = isDone || (isRunning && idx < activeAgentStep);
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
                      isActive
                        ? "border border-amber-300 bg-amber-50 text-amber-900"
                        : isPassed
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {isPassed && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                    {label}
                  </span>
                  {idx < AGENT_STEPS.length - 1 && (
                    <span className="text-xs text-slate-300">→</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sign-Off Modal */}
      {showSignOffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Approve &amp; Sign-Off Engineering Change Order
              </h2>
              <button
                type="button"
                onClick={() => setShowSignOffModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmSignOff} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Reviewer Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., A. Sharma, Lead Process Engineer"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Sign-Off Rationale
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Confirm all conflicts and downstream safeguards have been reviewed."
                  value={signOffRationale}
                  onChange={(e) => setSignOffRationale(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              {signOffError && (
                <p className="text-xs font-medium text-rose-700">{signOffError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSignOffModal(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSigningOff}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {isSigningOff ? "Signing Off..." : "Confirm Sign-Off"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
