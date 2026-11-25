import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  createRun,
  fetchAblation,
  resolveConflict,
  signOffRun,
} from "./api";
import { AblationView } from "./components/AblationView";
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

interface MorphState {
  firstRect: DOMRect;
  lastRect: DOMRect | null;
  playing: boolean;
}

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
  const [morphState, setMorphState] = useState<MorphState | null>(null);
  const [revealWorkspaceChrome, setRevealWorkspaceChrome] = useState<boolean>(false);
  const headerBrandRef = useRef<HTMLDivElement | null>(null);

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

  const handleEnterFromLanding = useCallback((firstRect: DOMRect) => {
    setRevealWorkspaceChrome(false);
    setMorphState({ firstRect, lastRect: null, playing: false });
    setEntryPhase("morphing");
  }, []);

  useLayoutEffect(() => {
    if (entryPhase !== "morphing" || !morphState || morphState.lastRect) {
      return;
    }
    const targetRect = headerBrandRef.current?.getBoundingClientRect();
    if (!targetRect) {
      setEntryPhase("entered");
      setMorphState(null);
      setRevealWorkspaceChrome(true);
      return;
    }

    setMorphState((prev) => (prev ? { ...prev, lastRect: targetRect } : null));

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setMorphState((prev) => (prev ? { ...prev, playing: true } : null));
        setRevealWorkspaceChrome(true);
      });
    });

    const timer = window.setTimeout(() => {
      setEntryPhase("entered");
      setMorphState(null);
    }, 680);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [entryPhase, morphState]);

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

  useEffect(() => {
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
  }, []);

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

  if (entryPhase === "landing") {
    return <LandingScreen onEnter={handleEnterFromLanding} />;
  }

  const isIntakeActive = showIntake || runState === null;

  // Compute FLIP transform from centered landing rect to docked top-left header rect
  let morphTransform = "translate3d(0px, 0px, 0) scale(1, 1)";
  if (morphState?.playing && morphState.lastRect) {
    const dx = morphState.lastRect.left - morphState.firstRect.left;
    const dy = morphState.lastRect.top - morphState.firstRect.top;
    const sx = morphState.lastRect.width / morphState.firstRect.width;
    const sy = morphState.lastRect.height / morphState.firstRect.height;
    morphTransform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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

      {isIntakeActive ? (
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

      {/* FLIP Shared-Element Morph Overlay */}
      {entryPhase === "morphing" && morphState && (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div
            className={`absolute inset-0 bg-slate-50 transition-opacity duration-400 ease-out ${
              morphState.playing ? "opacity-0" : "opacity-100"
            }`}
          />
          <div
            style={{
              position: "fixed",
              left: morphState.firstRect.left,
              top: morphState.firstRect.top,
              width: morphState.firstRect.width,
              height: morphState.firstRect.height,
              transformOrigin: "top left",
              transform: morphTransform,
              transition: "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
            className="flex items-center gap-4"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm sm:h-16 sm:w-16">
              <ShieldCheck className="h-8 w-8 sm:h-9 sm:w-9" />
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-slate-900 select-none sm:text-7xl">
              ReconcileGraph
            </h1>
          </div>
        </div>
      )}
    </div>
  );
}
