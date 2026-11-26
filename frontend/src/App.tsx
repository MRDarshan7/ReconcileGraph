import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  checkBackendHealth,
  createRun,
  fetchAblation,
  fetchDocuments,
  fetchHealth,
  resolveConflict,
  signOffRun,
} from "./api";
import { AblationView } from "./components/AblationView";
import { BackendWakeupScreen } from "./components/BackendWakeupScreen";
import { EcoIntakeScreen } from "./components/EcoIntakeScreen";
import { ImpactGraph } from "./components/ImpactGraph";
import { IntakeBar, type WorkbenchNavView } from "./components/IntakeBar";
import { LandingScreen } from "./components/LandingScreen";
import { PlantRecordsView, ReviewWorkspace } from "./components/ReviewWorkspace";
import type {
  AblationResponse,
  CustomEcoInput,
  DocumentRecord,
  HealthResponse,
  RunState,
} from "./types";

type EntryPhase = "landing" | "exiting" | "entered";

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
  const [backendReady, setBackendReady] = useState<boolean>(false);
  const exitTimerRef = useRef<number | null>(null);

  const [runState, setRunState] = useState<RunState | null>(null);
  const [navView, setNavView] = useState<WorkbenchNavView>("intake");
  const [ablation, setAblation] = useState<AblationResponse | null>(null);
  const [healthInfo, setHealthInfo] = useState<HealthResponse | null>(null);
  const [plantDocuments, setPlantDocuments] = useState<DocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState<boolean>(false);

  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string>("doc1_bom_revB.md");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [isSigningOff, setIsSigningOff] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const handleEnterFromLanding = useCallback(() => {
    setEntryPhase((prev) => {
      if (prev !== "landing") return prev;
      exitTimerRef.current = window.setTimeout(() => {
        setEntryPhase("entered");
        exitTimerRef.current = null;
      }, 260);
      return "exiting";
    });
  }, []);

  const handleReturnToOverview = useCallback(() => {
    setEntryPhase("landing");
    window.scrollTo({ top: 0 });
  }, []);

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
        setNavView("review");
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : "Verification run failed.");
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  // Background pre-warm loop: wake up backend immediately on mount.
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
    setDocsLoading(true);
    async function bootstrap() {
      try {
        const [ablRes, docsRes, healthRes] = await Promise.all([
          fetchAblation(),
          fetchDocuments(),
          fetchHealth(),
        ]);
        if (!cancelled) {
          setAblation(ablRes);
          setPlantDocuments(docsRes.documents);
          setHealthInfo(healthRes);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorBanner(err instanceof Error ? err.message : "Failed to initialize workbench.");
        }
      } finally {
        if (!cancelled) {
          setDocsLoading(false);
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
    setNavView("review");
  };

  if (entryPhase !== "entered") {
    return (
      <LandingScreen
        onEnter={handleEnterFromLanding}
        isExiting={entryPhase === "exiting"}
      />
    );
  }

  if (!backendReady) {
    return <BackendWakeupScreen revealCard />;
  }

  const effectiveView: WorkbenchNavView =
    runState === null && navView !== "records" ? "intake" : navView;

  const documentsForLibrary =
    runState?.documents && runState.documents.length > 0
      ? runState.documents
      : plantDocuments;

  return (
    <MotionConfig reducedMotion="user">
      <IntakeBar
        activeView={effectiveView}
        onSelectView={(view) => {
          setErrorBanner(null);
          setNavView(view);
        }}
        onReturnToOverview={handleReturnToOverview}
        isRunning={isRunning}
        runState={runState}
        healthInfo={healthInfo}
        documentCount={documentsForLibrary.length}
        onSignOff={handleSignOff}
        isSigningOff={isSigningOff}
      >
        {errorBanner && effectiveView !== "intake" && (
          <div className="border-b border-[#DC2626]/30 bg-[#DC2626]/5 px-6 py-2.5 text-xs text-[#DC2626]">
            {errorBanner}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={effectiveView}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            {effectiveView === "intake" ? (
              <EcoIntakeScreen
                onSubmitEco={(scenarioId, customEco) => executeRun(scenarioId, customEco)}
                isRunning={isRunning}
                errorBanner={errorBanner}
              />
            ) : effectiveView === "records" ? (
              <PlantRecordsView documents={documentsForLibrary} isLoading={docsLoading} />
            ) : runState && effectiveView === "review" ? (
              <ReviewWorkspace
                runState={runState}
                selectedFindingId={selectedFindingId}
                onSelectFinding={setSelectedFindingId}
                activeDocId={activeDocId}
                onSelectDoc={setActiveDocId}
                onResolveConflict={handleResolveConflict}
                resolvingConflictId={resolvingConflictId}
              />
            ) : runState && effectiveView === "graph" ? (
              <ImpactGraph
                runState={runState}
                onSelectEntity={handleSelectEntityFromGraph}
              />
            ) : runState ? (
              <AblationView runState={runState} ablation={ablation} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </IntakeBar>
    </MotionConfig>
  );
}
