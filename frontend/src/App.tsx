import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  checkBackendHealth,
  createRun,
  fetchAblation,
  resolveConflict,
  signOffRun,
} from "./api";
import { AblationView } from "./components/AblationView";
import { BackendWakeupScreen } from "./components/BackendWakeupScreen";
import { EcoIntakeScreen } from "./components/EcoIntakeScreen";
import { ImpactGraph } from "./components/ImpactGraph";
import { IntakeBar } from "./components/IntakeBar";
import { LandingScreen } from "./components/LandingScreen";
import { ReviewWorkspace } from "./components/ReviewWorkspace";
import type {
  AblationResponse,
  CustomEcoInput,
  RunState,
  WorkbenchTab,
} from "./types";

type EntryPhase = "landing" | "morphing" | "entered";

function selectDefaultFinding(run: RunState): { findingId: string | null; docId: string } {
  const firstEscalated =
    run.findings.find((f) => f.audit_status === "ESCALATED") ?? run.findings[0] ?? null;
  const span = firstEscalated?.span_id
    ? run.spans.find((s) => s.id === firstEscalated.span_id)
    : undefined;
  return {
    findingId: firstEscalated?.id ?? null,
    docId: span?.doc_id ?? run.documents[0]?.id ?? "doc1_bom_revB.md",
  };
}

export default function App() {
  const [entryPhase, setEntryPhase] = useState<EntryPhase>("landing");
  const [revealWorkspaceChrome, setRevealWorkspaceChrome] = useState<boolean>(false);
  const [backendReady, setBackendReady] = useState<boolean>(false);

  const headerBrandRef = useRef<HTMLDivElement | null>(null);
  const floatingBrandRef = useRef<HTMLDivElement | null>(null);
  const firstRectRef = useRef<DOMRect | null>(null);
  const morphStartedRef = useRef<boolean>(false);
  const failsafeTimerRef = useRef<number | null>(null);

  const [runState, setRunState] = useState<RunState | null>(null);
  const [showIntake, setShowIntake] = useState<boolean>(true);
  const [ablation, setAblation] = useState<AblationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("review");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string>("doc1_bom_revB.md");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [isSigningOff, setIsSigningOff] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const finishMorph = useCallback(() => {
    if (failsafeTimerRef.current !== null) {
      window.clearTimeout(failsafeTimerRef.current);
      failsafeTimerRef.current = null;
    }
    setRevealWorkspaceChrome(true);
    setEntryPhase("entered");
  }, []);

  const handleEnterFromLanding = useCallback(
    (firstRect: DOMRect) => {
      firstRectRef.current = firstRect;
      morphStartedRef.current = false;
      setRevealWorkspaceChrome(false);
      setEntryPhase("morphing");

      if (failsafeTimerRef.current !== null) {
        window.clearTimeout(failsafeTimerRef.current);
      }
      failsafeTimerRef.current = window.setTimeout(finishMorph, 1150);
    },
    [finishMorph]
  );

  useLayoutEffect(() => {
    if (entryPhase !== "morphing" || morphStartedRef.current) {
      return;
    }
    morphStartedRef.current = true;

    const firstRect = firstRectRef.current;
    const floatingEl = floatingBrandRef.current;
    if (!firstRect || !floatingEl) {
      finishMorph();
      return;
    }

    const measured = headerBrandRef.current?.getBoundingClientRect();
    const lastRect =
      measured && measured.width > 0
        ? measured
        : { left: 24, top: 14, width: 185, height: 32 };

    const dx = firstRect.left - lastRect.left;
    const dy = firstRect.top - lastRect.top;
    const scaleRatio = firstRect.width / lastRect.width;

    floatingEl.style.left = `${lastRect.left}px`;
    floatingEl.style.top = `${lastRect.top}px`;
    floatingEl.style.transition = "none";
    floatingEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scaleRatio})`;

    // Single rAF (not cancelled in StrictMode cleanup) forces reflow and plays morph.
    window.requestAnimationFrame(() => {
      const el = floatingBrandRef.current;
      if (!el) return;
      void el.offsetWidth;
      el.style.transition = "transform 1100ms cubic-bezier(0.16, 1, 0.3, 1)";
      el.style.transform = "translate3d(0px, 0px, 0) scale(1)";
      setRevealWorkspaceChrome(true);
    });
  }, [entryPhase, finishMorph]);

  const executeRun = useCallback(
    async (
      scenarioId: string | null,
      customEco?: CustomEcoInput | Record<string, unknown> | null
    ) => {
      setIsRunning(true);
      setErrorBanner(null);
      try {
        const nextRun = await createRun(scenarioId, customEco ?? null);
        setRunState(nextRun);
        const defaults = selectDefaultFinding(nextRun);
        setSelectedFindingId(defaults.findingId);
        setActiveDocId(defaults.docId);
        setShowIntake(false);
        setActiveTab("review");
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : "Verification run failed.");
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  // Background pre-warm loop: wake up Render backend immediately on mount.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;

    async function ping() {
      const ok = await checkBackendHealth(4000);
      if (cancelled) return;
      if (ok) {
        setBackendReady(true);
        return;
      }
      pollTimer = window.setTimeout(ping, 2500);
    }

    ping();

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (!backendReady) return;
    let cancelled = false;
    async function bootstrap() {
      try {
        const ablRes = await fetchAblation();
        if (!cancelled) {
          setAblation(ablRes);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorBanner(err instanceof Error ? err.message : "Failed to initialize workbench.");
        }
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [backendReady]);

  const handleResolveConflict = async (
    conflictId: string,
    resolutionChoice: string,
    reviewerRationale: string
  ) => {
    if (!runState) return;
    setResolvingConflictId(conflictId);
    setErrorBanner(null);
    try {
      const updated = await resolveConflict(
        runState.run_id,
        conflictId,
        resolutionChoice,
        reviewerRationale
      );
      setRunState(updated);

      const currentStillPending = updated.findings.some(
        (f) =>
          f.id === selectedFindingId &&
          f.audit_status === "ESCALATED" &&
          !f.is_resolved
      );
      if (!currentStillPending) {
        const nextPending = updated.findings.find(
          (f) => f.audit_status === "ESCALATED" && !f.is_resolved
        );
        if (nextPending) {
          setSelectedFindingId(nextPending.id);
          const span = nextPending.span_id
            ? updated.spans.find((s) => s.id === nextPending.span_id)
            : undefined;
          if (span) {
            setActiveDocId(span.doc_id);
          }
        }
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Conflict resolution failed.");
    } finally {
      setResolvingConflictId(null);
    }
  };

  const handleSignOff = async (reviewerName: string, rationale: string) => {
    if (!runState) return;
    setIsSigningOff(true);
    try {
      const updated = await signOffRun(
        runState.run_id,
        `${reviewerName}: ${rationale}`
      );
      setRunState(updated);
    } finally {
      setIsSigningOff(false);
    }
  };

  const handleSelectEntityFromGraph = (entityId: string) => {
    if (!runState) return;
    const match =
      runState.findings.find(
        (f) => f.entity_id === entityId && f.audit_status === "ESCALATED"
      ) ?? runState.findings.find((f) => f.entity_id === entityId);

    if (match) {
      setSelectedFindingId(match.id);
      if (match.span_id) {
        const span = runState.spans.find((s) => s.id === match.span_id);
        if (span) setActiveDocId(span.doc_id);
      }
    }
    setActiveTab("review");
  };

  const isIntakeActive = showIntake || runState === null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {entryPhase !== "landing" && (
        <div className="opacity-100">
          <IntakeBar
            onNewChangeRequest={() => {
              setErrorBanner(null);
              setShowIntake(true);
            }}
            isIntakeActive={isIntakeActive}
            isRunning={isRunning}
            runState={runState}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onSignOff={handleSignOff}
            isSigningOff={isSigningOff}
            brandRef={headerBrandRef}
            hideBrand={entryPhase === "morphing"}
            revealChrome={entryPhase === "entered" || revealWorkspaceChrome}
          />

          {!backendReady ? (
            <BackendWakeupScreen
              revealCard={entryPhase === "entered" || revealWorkspaceChrome}
            />
          ) : isIntakeActive ? (
            <EcoIntakeScreen
              onSubmitEco={(scenarioId, customEco) => executeRun(scenarioId, customEco)}
              isRunning={isRunning}
              errorBanner={errorBanner}
              revealCard={entryPhase === "entered" || revealWorkspaceChrome}
            />
          ) : (
            <>
              {errorBanner && (
                <div className="mx-auto mt-4 max-w-[1600px] px-5">
                  <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800">
                    {errorBanner}
                  </div>
                </div>
              )}

              {activeTab === "review" ? (
                <ReviewWorkspace
                  runState={runState}
                  selectedFindingId={selectedFindingId}
                  onSelectFinding={setSelectedFindingId}
                  activeDocId={activeDocId}
                  onSelectDoc={setActiveDocId}
                  onResolveConflict={handleResolveConflict}
                  resolvingConflictId={resolvingConflictId}
                />
              ) : activeTab === "graph" ? (
                <ImpactGraph
                  runState={runState}
                  onSelectEntity={handleSelectEntityFromGraph}
                />
              ) : (
                <AblationView runState={runState} ablation={ablation} />
              )}
            </>
          )}
        </div>
      )}

      {entryPhase !== "entered" && (
        <LandingScreen
          onEnter={handleEnterFromLanding}
          isExiting={entryPhase === "morphing"}
        />
      )}

      {entryPhase === "morphing" && (
        <div
          ref={floatingBrandRef}
          onTransitionEnd={(e) => {
            if (e.propertyName === "transform") {
              finishMorph();
            }
          }}
          style={{
            position: "fixed",
            zIndex: 50,
            transformOrigin: "top left",
            willChange: "transform",
            pointerEvents: "none",
          }}
          className="flex shrink-0 items-center gap-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="text-base font-bold tracking-tight text-slate-900 select-none">
            ReconcileGraph
          </h1>
        </div>
      )}
    </div>
  );
}
