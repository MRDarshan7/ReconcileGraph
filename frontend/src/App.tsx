import { useCallback, useEffect, useState } from "react";
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
import { ReviewWorkspace } from "./components/ReviewWorkspace";
import type {
  AblationResponse,
  CustomEcoInput,
  RunState,
  WorkbenchTab,
} from "./types";

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

  const isIntakeActive = showIntake || runState === null;

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
      />

      {isIntakeActive ? (
        <EcoIntakeScreen
          onSubmitEco={(scenarioId, customEco) => executeRun(scenarioId, customEco)}
          isRunning={isRunning}
          errorBanner={errorBanner}
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
  );
}
