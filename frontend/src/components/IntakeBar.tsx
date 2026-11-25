import { useState, type RefObject } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
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
  const resolvedConflictsCount =
    runState?.conflicts.filter((c) => c.status === "RESOLVED").length ?? 0;
  const canSignOff = Boolean(runState?.can_sign_off && !runState?.signed_off);

  const handleConfirmSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerName.trim() || !signOffRationale.trim()) {
      setSignOffError("Reviewer name and sign-off rationale are required.");
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

  const breadcrumbLabel = isIntakeActive
    ? "NEW CHANGE REQUEST"
    : runState?.eco.title || runState?.eco.target_entity || "ACTIVE VERIFICATION";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1600px] px-5">
        {/* Row 1: Compact Enterprise Top Bar (~52px) */}
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <div
              ref={brandRef}
              className={`flex shrink-0 items-center gap-2.5 ${
                hideBrand ? "invisible" : "visible"
              }`}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-800 bg-slate-950 text-sky-400 shadow-2xs">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="6" cy="12" r="2.2" className="fill-sky-400/20" />
                  <circle cx="18" cy="6.5" r="2.2" className="fill-sky-400/20" />
                  <circle cx="18" cy="17.5" r="2.2" className="fill-amber-400/25 stroke-amber-400" />
                  <path d="M8.1 11L15.9 7.4M8.1 13L15.9 16.6" strokeLinecap="round" />
                </svg>
              </div>
              <h1 className="font-display text-sm font-bold tracking-tight text-slate-950">
                ReconcileGraph
              </h1>
            </div>

            <span className="text-slate-300 select-none">/</span>

            <div
              className={`flex min-w-0 items-center gap-2 transition-opacity duration-300 ${
                revealChrome ? "opacity-100" : "opacity-0"
              }`}
            >
              <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono-code text-[10px] font-semibold tracking-wide text-slate-700">
                PLANT LINE-4
              </span>
              <span className="max-w-[320px] truncate font-mono-code text-[11px] font-medium text-slate-600">
                {breadcrumbLabel}
              </span>
            </div>
          </div>

          {/* Right Status & Action Cluster */}
          <div
            className={`flex flex-wrap items-center gap-2 transition-opacity duration-300 ${
              revealChrome ? "opacity-100" : "opacity-0"
            }`}
          >
            {runState &&
              !isIntakeActive &&
              (runState.execution_mode === "LIVE_GEMINI" ||
                runState.execution_mode === "LIVE_GROQ") && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 font-mono-code text-[11px] font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  LIVE AI • {runState.active_key_slot ?? "ACTIVE"}
                </span>
              )}

            {runState &&
              !isIntakeActive &&
              runState.execution_mode === "DETERMINISTIC_FALLBACK" && (
                <span
                  title={
                    runState.fallback_notice ??
                    "AI keys unavailable — running deterministic unit, revision, and span checks."
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono-code text-[11px] font-semibold text-slate-700"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  OFFLINE DETERMINISTIC
                </span>
              )}

            <button
              type="button"
              onClick={onNewChangeRequest}
              disabled={isRunning}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                isIntakeActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              New Change Request
            </button>

            {!isIntakeActive && runState && (
              runState.signed_off ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-600 px-3 py-1.5 font-mono-code text-[11px] font-semibold text-white shadow-2xs">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  ECO APPROVED // SIGNED OFF
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!canSignOff || isSigningOff}
                  onClick={() => setShowSignOffModal(true)}
                  title={
                    canSignOff
                      ? "All conflicts resolved. Click to sign off this ECO."
                      : `Approval locked: ${openConflictsCount} OPEN conflict(s) must be resolved with a rationale before sign-off.`
                  }
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    canSignOff
                      ? "bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700"
                      : "cursor-not-allowed border border-amber-300/80 bg-amber-50/70 text-slate-700"
                  }`}
                >
                  {canSignOff ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-amber-700" />
                  )}
                  <span>Approve &amp; Sign-Off ECO</span>
                  {!canSignOff && (
                    <span className="rounded bg-amber-200/80 px-1.5 py-0.5 font-mono-code text-[10px] font-bold text-amber-950">
                      {openConflictsCount} OPEN{" "}
                      {openConflictsCount === 1 ? "CONFLICT" : "CONFLICTS"}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </div>

        {/* Concise Offline Deterministic Banner */}
        {runState &&
          !isIntakeActive &&
          runState.execution_mode === "DETERMINISTIC_FALLBACK" && (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-[11px] font-medium text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                Offline deterministic mode active — Pint unit conversion, revision precedence,
                BFS blast radius, and SHA-256 span gates remain enforced.
              </span>
            </div>
          )}

        {/* Row 2: Linear-Style Underline Tab Bar */}
        {!isIntakeActive && runState && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
            <nav className="-mb-px flex items-center gap-5" aria-label="Workbench Views">
              <button
                type="button"
                onClick={() => onTabChange("review")}
                className={`inline-flex items-center gap-2 border-b-2 py-2.5 text-xs font-semibold transition ${
                  activeTab === "review"
                    ? "border-slate-900 text-slate-950"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Evidence Review</span>
                {openConflictsCount > 0 ? (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.2 font-mono-code text-[10px] font-bold text-amber-800">
                    {openConflictsCount} open
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.2 font-mono-code text-[10px] font-semibold text-slate-600">
                    {runState.findings.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onTabChange("graph")}
                className={`inline-flex items-center gap-2 border-b-2 py-2.5 text-xs font-semibold transition ${
                  activeTab === "graph"
                    ? "border-slate-900 text-slate-950"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                }`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span>Impact Map</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 font-mono-code text-[10px] font-semibold text-slate-600">
                  {runState.subgraph.nodes.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange("ablation")}
                className={`inline-flex items-center gap-2 border-b-2 py-2.5 text-xs font-semibold transition ${
                  activeTab === "ablation"
                    ? "border-slate-900 text-slate-950"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Verification Log &amp; Benchmarks</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 font-mono-code text-[10px] font-semibold text-slate-600">
                  {runState.audit_events.length}
                </span>
              </button>
            </nav>

            <div className="hidden items-center gap-2 py-2 font-mono-code text-[11px] text-slate-500 md:flex">
              <span>RUN {runState.run_id.slice(-8).toUpperCase()}</span>
              <span className="text-slate-300">•</span>
              <span>TARGET {runState.eco.target_entity ?? "P-101"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Engineering Sign-Off Gate Modal */}
      {showSignOffModal && runState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h2 className="font-display text-sm font-bold text-slate-950">
                  Engineering Sign-Off Gate
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSignOffModal(false)}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-slate-100 bg-emerald-50/50 px-5 py-3">
              <div className="text-xs font-semibold text-slate-900">
                {runState.eco.title || `ECO for ${runState.eco.target_entity ?? "P-101"}`}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono-code text-[10px] font-semibold">
                <span className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-emerald-800">
                  {resolvedConflictsCount} RESOLVED
                </span>
                <span className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-emerald-800">
                  0 OPEN CONFLICTS
                </span>
                <span className="rounded border border-sky-200 bg-white px-2 py-0.5 text-sky-800">
                  SHA-256 SPAN AUDIT PASSED
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmSignOff} className="space-y-4 p-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Approving Engineer
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., A. Sharma, Lead Process Engineer"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Sign-Off Rationale
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Confirm all conflicts, mitigation steps, and downstream safeguards have been verified."
                  value={signOffRationale}
                  onChange={(e) => setSignOffRationale(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
              </div>

              {signOffError && (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {signOffError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSignOffModal(false)}
                  className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSigningOff}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {isSigningOff ? "Recording Sign-Off..." : "Confirm ECO Approval"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
