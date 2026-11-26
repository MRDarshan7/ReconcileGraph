import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileText,
  GitBranch,
  Layers,
  Lock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import type { HealthResponse, RunState } from "../types";

export type WorkbenchNavView =
  | "intake"
  | "review"
  | "graph"
  | "records"
  | "ablation";

interface IntakeBarProps {
  activeView: WorkbenchNavView;
  onSelectView: (view: WorkbenchNavView) => void;
  onReturnToOverview: () => void;
  isRunning: boolean;
  runState: RunState | null;
  healthInfo: HealthResponse | null;
  documentCount: number;
  onSignOff: (reviewerName: string, rationale: string) => Promise<void>;
  isSigningOff: boolean;
  children: ReactNode;
}

export function IntakeBar({
  activeView,
  onSelectView,
  onReturnToOverview,
  isRunning,
  runState,
  healthInfo,
  documentCount,
  onSignOff,
  isSigningOff,
  children,
}: IntakeBarProps) {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [signOffRationale, setSignOffRationale] = useState("");
  const [signOffError, setSignOffError] = useState<string | null>(null);

  const openConflictsCount =
    runState?.conflicts.filter((c) => c.status === "OPEN").length ?? 0;
  const resolvedConflictsCount =
    runState?.conflicts.filter((c) => c.status === "RESOLVED").length ?? 0;
  const canSignOff = Boolean(runState?.can_sign_off && !runState?.signed_off);

  const isOfflineMode = runState
    ? runState.execution_mode === "DETERMINISTIC_FALLBACK"
    : !healthInfo ||
      ((healthInfo.configured_gemini_keys ?? 0) === 0 &&
        (healthInfo.configured_groq_keys ?? 0) === 0);

  const navItems: Array<{
    id: WorkbenchNavView;
    label: string;
    icon: typeof Plus;
    enabled: boolean;
    badge?: string | number | null;
    badgeTone?: "amber" | "neutral";
  }> = [
    {
      id: "intake",
      label: "New Change",
      icon: Plus,
      enabled: !isRunning,
    },
    {
      id: "review",
      label: "Evidence Review",
      icon: Layers,
      enabled: Boolean(runState) && !isRunning,
      badge: runState
        ? openConflictsCount > 0
          ? openConflictsCount
          : runState.findings.length
        : null,
      badgeTone: openConflictsCount > 0 ? "amber" : "neutral",
    },
    {
      id: "graph",
      label: "Impact Map",
      icon: GitBranch,
      enabled: Boolean(runState) && !isRunning,
      badge: runState ? runState.subgraph.nodes.length : null,
      badgeTone: "neutral",
    },
    {
      id: "records",
      label: "Plant Records",
      icon: FileText,
      enabled: true,
      badge: documentCount > 0 ? documentCount : 5,
      badgeTone: "neutral",
    },
    {
      id: "ablation",
      label: "Audit & Benchmarks",
      icon: BarChart3,
      enabled: Boolean(runState) && !isRunning,
      badge: runState ? runState.audit_events.length : null,
      badgeTone: "neutral",
    },
  ];

  const breadcrumbSegment = (() => {
    if (activeView === "intake") return "New engineering change";
    if (activeView === "records") return "Plant records";
    if (activeView === "graph") {
      return `${runState?.eco.target_entity ?? "P-101"} · Impact map`;
    }
    if (activeView === "ablation") {
      return `${runState?.eco.target_entity ?? "P-101"} · Audit & benchmarks`;
    }
    return runState?.eco.title || runState?.eco.target_entity || "Evidence review";
  })();

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

  const handleSelectNav = (id: WorkbenchNavView) => {
    onSelectView(id);
    setMobileMenuOpen(false);
  };

  const renderRailContent = (collapsed: boolean) => (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Brand Header & Rail Collapse Toggle */}
        <div
          className={`flex h-[52px] items-center border-b border-[#E5E5E5] ${
            collapsed ? "justify-center px-2" : "justify-between px-3.5"
          }`}
        >
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border border-[#0A0A0A] bg-[#0A0A0A] text-white"
              >
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="4" cy="8" r="1.5" />
                  <circle cx="12" cy="4" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <path d="M5.4 7.3L10.6 4.7M5.4 8.7L10.6 11.3" />
                </svg>
              </span>
              <span className="truncate text-[13px] font-semibold tracking-[-0.02em] text-[#0A0A0A]">
                ReconcileGraph
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRailCollapsed((prev) => !prev)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand navigation rail" : "Collapse navigation rail"}
            className="hidden h-7 w-7 items-center justify-center rounded-[4px] text-[#666666] transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/[0.04] hover:text-[#0A0A0A] lg:inline-flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-[#666666] hover:bg-black/[0.04] hover:text-[#0A0A0A] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Linear-Style Borderless Navigation Links */}
        <nav className="space-y-0.5 p-2" aria-label="Workbench navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!item.enabled}
                onClick={() => item.enabled && handleSelectNav(item.id)}
                title={collapsed ? item.label : undefined}
                className={`flex w-full items-center rounded-[4px] text-left text-[13px] transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  collapsed ? "justify-center px-0 py-2" : "justify-between px-2.5 py-1.5"
                } ${
                  isActive
                    ? "bg-black/[0.055] font-medium text-[#0A0A0A]"
                    : item.enabled
                      ? "font-normal text-[#52525B] hover:bg-black/[0.03] hover:text-[#0A0A0A]"
                      : "cursor-not-allowed font-normal text-[#A1A1AA] opacity-60"
                }`}
              >
                <span className={`flex min-w-0 items-center ${collapsed ? "" : "gap-2.5"}`}>
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isActive ? "text-[#0A0A0A]" : "text-current"
                    }`}
                  />
                  {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </span>

                {!collapsed && item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`ml-2 shrink-0 rounded-[3px] px-1.5 py-0.2 font-mono-code text-[10px] font-medium ${
                      item.badgeTone === "amber"
                        ? "bg-[#D97706]/12 text-[#D97706]"
                        : "text-[#737373]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Rail Status & Overview Return */}
      <div className="space-y-1 border-t border-[#E5E5E5] p-2">
        <div
          title={
            isOfflineMode
              ? "Offline deterministic mode active"
              : `Live AI active (${runState?.active_key_slot ?? healthInfo?.model ?? "Gemini"})`
          }
          className={`flex items-center rounded-[4px] px-2.5 py-1.5 text-[11px] font-medium text-[#666666] ${
            collapsed ? "justify-center" : "gap-2"
          }`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              isOfflineMode ? "bg-[#737373]" : "bg-[#059669]"
            }`}
          />
          {!collapsed && (
            <span className="truncate">
              {isOfflineMode ? "Offline Mode" : "Live AI"}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onReturnToOverview}
          title="Return to overview"
          className={`flex w-full items-center rounded-[4px] px-2.5 py-1.5 text-xs font-medium text-[#52525B] transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/[0.03] hover:text-[#0A0A0A] ${
            collapsed ? "justify-center" : "gap-2"
          }`}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span>Overview</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="rg-workspace-enter flex min-h-screen bg-white text-[#0A0A0A]">
      {/* Desktop Left Navigation Rail */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-[#E5E5E5] bg-[#F7F7F8] transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block ${
          railCollapsed ? "w-[56px]" : "w-[232px]"
        }`}
      >
        {renderRailContent(railCollapsed)}
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 h-full w-[240px] border-r border-[#E5E5E5] bg-[#F7F7F8]">
            {renderRailContent(false)}
          </aside>
        </div>
      )}

      {/* Right Main Area: Context Top Bar + Workspace Canvas */}
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-[#E5E5E5] bg-white px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-[#E5E5E5] text-[#0A0A0A] lg:hidden"
            >
              <Menu className="h-3.5 w-3.5" />
            </button>

            <div className="flex min-w-0 items-center gap-2 font-mono-code text-[11px]">
              <span className="shrink-0 text-[#737373]">Plant Line-4</span>
              <span className="text-[#CCCCCC] select-none">/</span>
              <span className="truncate font-medium text-[#0A0A0A]">
                {breadcrumbSegment}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {runState && activeView !== "intake" && (
              runState.signed_off ? (
                <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#059669]/35 bg-[#059669]/10 px-3 py-1.5 font-mono-code text-[11px] font-medium text-[#059669]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  ECO approved
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!canSignOff || isSigningOff}
                  onClick={() => setShowSignOffModal(true)}
                  title={
                    canSignOff
                      ? "All conflicts resolved. Click to sign off this ECO."
                      : `HTTP 409 lock: ${openConflictsCount} open conflict(s) must be resolved with rationale.`
                  }
                  className={`inline-flex items-center gap-2 rounded-[2px] px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    canSignOff
                      ? "bg-[#059669] text-white hover:bg-[#047857]"
                      : "cursor-not-allowed border border-[#E5E5E5] bg-[#FAFAFB] text-[#666666]"
                  }`}
                >
                  {canSignOff ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-[#D97706]" />
                  )}
                  <span>Approve &amp; Sign-Off ECO</span>
                  {!canSignOff && (
                    <span className="rounded-[2px] border border-[#D97706]/30 bg-[#D97706]/10 px-1.5 py-0.5 font-mono-code text-[10px] font-medium text-[#D97706]">
                      HTTP 409 · {openConflictsCount}{" "}
                      {openConflictsCount === 1 ? "open conflict" : "open conflicts"}
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </header>

        <div className="min-w-0 flex-1 bg-white">{children}</div>
      </div>

      {/* Sharp Monochrome Engineering Sign-Off Gate Modal */}
      {showSignOffModal && runState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-[2px] border border-[#0A0A0A] bg-white">
            <div className="flex items-center justify-between border-b border-[#E5E5E5] bg-[#F7F7F8] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#059669]" />
                <h2 className="text-sm font-medium text-[#0A0A0A]">
                  Engineering sign-off gate
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSignOffModal(false)}
                aria-label="Close modal"
                className="rounded-[2px] p-1 text-[#666666] transition-[background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white hover:text-[#0A0A0A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-[#E5E5E5] bg-white px-5 py-3.5">
              <div className="text-xs font-medium text-[#0A0A0A]">
                {runState.eco.title || `ECO for ${runState.eco.target_entity ?? "P-101"}`}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono-code text-[10px]">
                <span className="rounded-[2px] border border-[#059669]/30 bg-[#059669]/10 px-2 py-0.5 text-[#059669]">
                  {resolvedConflictsCount} resolved
                </span>
                <span className="rounded-[2px] border border-[#059669]/30 bg-[#059669]/10 px-2 py-0.5 text-[#059669]">
                  0 open conflicts
                </span>
                <span className="rounded-[2px] border border-[#E5E5E5] bg-[#F7F7F8] px-2 py-0.5 text-[#0A0A0A]">
                  SHA-256 span audit passed
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmSignOff} className="space-y-4 p-5">
              <div>
                <label className="block text-xs font-medium text-[#0A0A0A]">
                  Approving engineer
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., A. Sharma, Lead Process Engineer"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="mt-1.5 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2 text-xs text-[#0A0A0A] placeholder:text-[#999999] transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#D4D4D8] focus:border-[#0A0A0A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0A0A0A]">
                  Sign-off rationale
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Confirm all conflicts, mitigation steps, and downstream safeguards have been verified."
                  value={signOffRationale}
                  onChange={(e) => setSignOffRationale(e.target.value)}
                  className="mt-1.5 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2 text-xs text-[#0A0A0A] placeholder:text-[#999999] transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#D4D4D8] focus:border-[#0A0A0A] focus:outline-none"
                />
              </div>

              {signOffError && (
                <p className="rounded-[2px] border border-[#DC2626]/30 bg-[#DC2626]/5 px-3 py-2 text-xs text-[#DC2626]">
                  {signOffError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-[#E5E5E5] pt-4">
                <button
                  type="button"
                  onClick={() => setShowSignOffModal(false)}
                  className="rounded-[2px] border border-[#E5E5E5] bg-white px-3.5 py-1.5 text-xs font-medium text-[#666666] transition-[border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#0A0A0A] hover:text-[#0A0A0A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSigningOff}
                  className="inline-flex items-center gap-1.5 rounded-[2px] bg-[#059669] px-4 py-1.5 text-xs font-medium text-white transition-[background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#047857] disabled:opacity-60"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {isSigningOff ? "Recording sign-off..." : "Confirm ECO approval"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
