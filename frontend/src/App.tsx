import { useCallback, useEffect, useState } from "react";
import {
  createRun,
  fetchAblation,
  fetchScenarios,
  resolveConflict,
  signOffRun,
} from "./api";
import { AblationView } from "./components/AblationView";
import { ImpactGraph } from "./components/ImpactGraph";
import { IntakeBar } from "./components/IntakeBar";
import { ReviewWorkspace } from "./components/ReviewWorkspace";
import type {
  AblationResponse,
  RunState,
  ScenarioPreset,
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
  const [scenarios, setScenarios] = useState<ScenarioPreset[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("eco_01_pump_upgrade");
  const [customPressure, setCustomPressure] = useState<string>("");
  const [runState, setRunState] = useState<RunState | null>(null);
  const [ablation, setAblation] = useState<AblationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("review");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string>("doc1_bom_revB.md");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [isSigningOff, setIsSigningOff] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const executeRun = useCallback(
    async (scenarioId: string, pressureOverride: string) => {
      setIsRunning(true);
      setErrorBanner(null);
      try {
        let customEco: Record<string, unknown> | null = null;
        const parsedPressure = Number.parseFloat(pressureOverride);
        if (pressureOverride.trim() !== "" && Number.isFinite(parsedPressure)) {
          const preset = scenarios.find((s) => s.id === scenarioId);
          customEco = {
            target_entity: preset?.target_entity ?? "P-101",
            title: `${preset?.title ?? scenarioId} (Custom ${parsedPressure} bar)`,
            proposed_changes: {
              ...(preset?.proposed_changes ?? {}),
              discharge_pressure_bar: parsedPressure,
            },
          };
        }

        const nextRun = await createRun(scenarioId, customEco);
        setRunState(nextRun);
        const defaults = selectDefaultFinding(nextRun);
        setSelectedFindingId(defaults.findingId);
        setActiveDocId(defaults.docId);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : "Verification run failed.");
      } finally {
        setIsRunning(false);
      }
    },
    [scenarios]
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [scenRes, ablRes] = await Promise.all([
          fetchScenarios(),
          fetchAblation(),
        ]);
        if (cancelled) return;
        setScenarios(scenRes.scenarios);
        setAblation(ablRes);

        setIsRunning(true);
        const initialRun = await createRun("eco_01_pump_upgrade");
        if (cancelled) return;
        setRunState(initialRun);
        const defaults = selectDefaultFinding(initialRun);
        setSelectedFindingId(defaults.findingId);
        setActiveDocId(defaults.docId);
      } catch (err) {
        if (!cancelled) {
          setErrorBanner(err instanceof Error ? err.message : "Failed to initialize workbench.");
        }
      } finally {
        if (!cancelled) setIsRunning(false);
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <IntakeBar
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        onScenarioChange={setSelectedScenarioId}
        customPressure={customPressure}
        onCustomPressureChange={setCustomPressure}
        onRunVerification={() => executeRun(selectedScenarioId, customPressure)}
        isRunning={isRunning}
        runState={runState}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSignOff={handleSignOff}
        isSigningOff={isSigningOff}
      />

      {errorBanner && (
        <div className="mx-auto mt-3 max-w-[1600px] px-4">
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            {errorBanner}
          </div>
        </div>
      )}

      {!runState ? (
        <div className="mx-auto flex max-w-[1600px] items-center justify-center p-16 text-sm text-slate-500">
          {isRunning
            ? "Running 4-agent verification pipeline on ECO-01..."
            : "Select an ECO scenario and click Run Verification."}
        </div>
      ) : activeTab === "review" ? (
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
    </div>
  );
}
