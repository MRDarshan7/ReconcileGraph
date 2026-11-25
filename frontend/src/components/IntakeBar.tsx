import { useState, type RefObject } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cpu,
  GitBranch,
  Layers,
  Lock,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import type { RunState, WorkbenchTab } from "../types";

interface IntakeBarProps {
  onNewChangeRequest: () => void;
  isIntakeActive: boolean;
  isRunning: boolean;
  runState: RunState | null;
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  onSignOff: (reviewerName: string, rationale: string) => Promise<void>;
  isSigningOff: boolean;
  brandRef?: RefObject<HTMLDivElement | null>;
  hideBrand?: boolean;
  revealChrome?: boolean;
}

export function IntakeBar({
  onNewChangeRequest,
  isIntakeActive,
  isRunning,
  runState,
  activeTab,
  onTabChange,
  onSignOff,
  isSigningOff,
  brandRef,
  hideBrand = false,
  revealChrome = true,
}: IntakeBarProps) {
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [signOffRationale, setSignOffRationale] = useState("");
  const [signOffError, setSignOffError] = useState<string | null>(null);

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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1600px] px-5 py-3.5">
        {/* Row 1: Primary Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div
              ref={brandRef}
              className={`flex shrink-0 items-center gap-3 ${
                hideBrand ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                ReconcileGraph
              </h1>
            </div>

            <div
              className={`flex flex-wrap items-center gap-2.5 transition-all duration-500 ease-out ${
                revealChrome
                  ? "translate-y-0 opacity-100"
                  : "translate-y-2 opacity-0"
              }`}
            >
              <span className="text-xs font-medium text-slate-500">
                Engineering Change Verification
              </span>

              {runState &&
                !isIntakeActive &&
                (runState.execution_mode === "LIVE_GEMINI" ||
                  runState.execution_mode === "LIVE_GROQ") && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    <Cpu className="h-3.5 w-3.5" />
                    Live AI • {runState.active_key_slot ?? "Active"}
                  </span>
                )}

              {runState &&
                !isIntakeActive &&
                runState.execution_mode === "DETERMINISTIC_FALLBACK" && (
                  <span
                    title={runState.fallback_notice ?? "Running in offline verification mode"}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Offline Mode
                  </span>
                )}
            </div>
          </div>

          {/* Right Actions */}
          <div
            className={`flex items-center gap-2.5 transition-all duration-500 ease-out ${
              revealChrome
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={onNewChangeRequest}
              disabled={isRunning}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                isIntakeActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              New Change Request
            </button>

            {!isIntakeActive && runState && (
              runState.signed_off ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  ECO APPROVED
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!canSignOff || isSigningOff}
                  onClick={() => setShowSignOffModal(true)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    canSignOff
                      ? "bg-emerald-700 text-white shadow-xs hover:bg-emerald-800"
                      : "cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500"
                  }`}
                >
                  {canSignOff ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  Approve &amp; Sign-Off ECO
                  {!canSignOff && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 font-mono-code text-[10px] font-bold text-rose-800">
                      {openConflictsCount} Open{" "}
                      {openConflictsCount === 1 ? "Conflict" : "Conflicts"}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </div>

        {/* Concise Offline Mode Notice */}
        {runState &&
          !isIntakeActive &&
          runState.execution_mode === "DETERMINISTIC_FALLBACK" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                Running in offline verification mode — deterministic unit, revision, and citation checks remain active.
              </span>
            </div>
          )}

        {/* Row 2: Sub-navigation & Status */}
        {!isIntakeActive && runState && (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <nav className="flex flex-wrap items-center gap-1.5" aria-label="Workbench Views">
              <button
                type="button"
                onClick={() => onTabChange("review")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "review"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Evidence Review
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono-code text-[10px] ${
                    activeTab === "review"
                      ? "bg-white/20 text-white"
                      : "bg-white text-slate-700"
                  }`}
                >
                  {runState.findings.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange("graph")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "graph"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                }`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                Impact Map
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono-code text-[10px] ${
                    activeTab === "graph"
                      ? "bg-white/20 text-white"
                      : "bg-white text-slate-700"
                  }`}
                >
                  {runState.subgraph.nodes.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange("ablation")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "ablation"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Verification Log &amp; Benchmarks
              </button>
            </nav>

            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-xs font-medium text-emerald-900">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Verification Complete</span>
            </div>
          </div>
        )}
      </div>

      {/* Sign-Off Modal */}
      {showSignOffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
                />
              </div>
              {signOffError && (
                <p className="text-xs font-medium text-rose-700">{signOffError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSignOffModal(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSigningOff}
                  className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
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
