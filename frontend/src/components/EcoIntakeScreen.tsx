import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  FileText,
  Loader2,
  Play,
  Sparkles,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import type { CustomEcoInput } from "../types";

interface EcoIntakeScreenProps {
  onSubmitEco: (scenarioId: string | null, customEco: CustomEcoInput) => Promise<void>;
  isRunning: boolean;
  errorBanner: string | null;
}

interface EquipmentOption {
  id: string;
  label: string;
  subtitle: string;
  baseline: string;
}

const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  {
    id: "P-101",
    label: "Pump P-101 (Main Feed Pump)",
    subtitle: "Centriflo-400 • ANSI Class 150",
    baseline: "10.0 bar spec (175 psi logged) • 120 m3/h",
  },
  {
    id: "V-12",
    label: "Valve V-12 (Isolation Check Valve)",
    subtitle: "Velan-CV2 • Downstream of P-101",
    baseline: "12.0 bar MAWP • Governed by SOP-7",
  },
  {
    id: "PRV-04",
    label: "PRV-04 (Pressure Relief Valve)",
    subtitle: "Spring-Loaded Safety Relief • Line-4 Header",
    baseline: "11.5 bar Set Pressure • Protects Header",
  },
];

interface ExamplePreset {
  id: string;
  buttonLabel: string;
  scenarioId: string;
  targetEntityId: string;
  title: string;
  proposedModel: string;
  proposedPressureBar: string;
  proposedSpecText: string;
}

const EXAMPLE_PRESETS: ExamplePreset[] = [
  {
    id: "eco_01",
    buttonLabel: "ECO-01: Swap P-101 -> Centriflo-550 (14.0 bar)",
    scenarioId: "eco_01_pump_upgrade",
    targetEntityId: "P-101",
    title: "ECO-01: High-Capacity Pump P-101 Upgrade",
    proposedModel: "Centriflo-550",
    proposedPressureBar: "14.0",
    proposedSpecText:
      "Proposed Replacement Pump: Centriflo-550\nTarget Asset: P-101 (Plant Line-4 Main Feed)\nProposed Discharge Pressure: 14.0 bar\nMax Design Flow: 145 m3/h\nFlange Rating: ANSI Class 150\nMechanical Seal: PTFE-Graphite",
  },
  {
    id: "eco_02",
    buttonLabel: "ECO-02: P-101 Kalrez Seal Swap (10.0 bar)",
    scenarioId: "eco_02_seal_swap",
    targetEntityId: "P-101",
    title: "ECO-02: Pump P-101 Mechanical Seal Upgrade",
    proposedModel: "Centriflo-400 (Kalrez-4079 Seal)",
    proposedPressureBar: "10.0",
    proposedSpecText:
      "Proposed Modification: Replace Pump P-101 mechanical seal with Kalrez-4079 elastomer\nTarget Asset: P-101\nRated Discharge Pressure: 10.0 bar (unchanged)\nMax Design Flow: 120 m3/h",
  },
  {
    id: "eco_03",
    buttonLabel: "ECO-03: Upgrade V-12 -> Class 300 (25.0 bar)",
    scenarioId: "eco_03_valve_upgrade",
    targetEntityId: "V-12",
    title: "ECO-03: Valve V-12 Class 300 Upgrade",
    proposedModel: "Velan-CV2 Class 300",
    proposedPressureBar: "25.0",
    proposedSpecText:
      "Proposed Replacement Valve: Velan-CV2 ANSI Class 300\nTarget Asset: V-12 (Downstream of P-101)\nMax Allowable Working Pressure (MAWP): 25.0 bar\nGoverning Procedure: SOP-7 (update valve rating reference)",
  },
];

const LIVE_PROGRESS_STEPS = [
  "Reading engineering records and replacement spec",
  "Reconciling units, equipment tags, and revisions",
  "Tracing downstream system impact",
  "Verifying source citations",
];

export function EcoIntakeScreen({
  onSubmitEco,
  isRunning,
  errorBanner,
}: EcoIntakeScreenProps) {
  const [targetEntityId, setTargetEntityId] = useState<string>("P-101");
  const [linkedScenarioId, setLinkedScenarioId] = useState<string | null>(
    "eco_01_pump_upgrade"
  );
  const [title, setTitle] = useState<string>(EXAMPLE_PRESETS[0].title);
  const [proposedModel, setProposedModel] = useState<string>(
    EXAMPLE_PRESETS[0].proposedModel
  );
  const [proposedPressureBar, setProposedPressureBar] = useState<string>(
    EXAMPLE_PRESETS[0].proposedPressureBar
  );
  const [proposedSpecText, setProposedSpecText] = useState<string>(
    EXAMPLE_PRESETS[0].proposedSpecText
  );
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [activeProgressStep, setActiveProgressStep] = useState<number>(0);

  useEffect(() => {
    if (!isRunning) {
      setActiveProgressStep(0);
      return;
    }
    setActiveProgressStep(0);
    const timer = window.setInterval(() => {
      setActiveProgressStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 650);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const handleLoadPreset = (preset: ExamplePreset) => {
    setTargetEntityId(preset.targetEntityId);
    setLinkedScenarioId(preset.scenarioId);
    setTitle(preset.title);
    setProposedModel(preset.proposedModel);
    setProposedPressureBar(preset.proposedPressureBar);
    setProposedSpecText(preset.proposedSpecText);
    setAttachedFileName(null);
    setValidationError(null);
  };

  const handleSelectEquipment = (id: string) => {
    setTargetEntityId(id);
    setLinkedScenarioId(null);
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setAttachedFileName(file.name);
    setProposedSpecText(text);
    setLinkedScenarioId(null);

    const pressureMatch = text.match(/(\d+(?:\.\d+)?)\s*(bar|psi)\b/i);
    if (pressureMatch) {
      const val = Number.parseFloat(pressureMatch[1]);
      const unit = pressureMatch[2].toLowerCase();
      const barVal = unit === "psi" ? (val * 0.0689476).toFixed(2) : val.toString();
      setProposedPressureBar(barVal);
    }
    if (!title.trim()) {
      setTitle(`ECO from ${file.name}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposedSpecText.trim() && !proposedPressureBar.trim()) {
      setValidationError(
        "Attach a specification file or enter proposed spec details before submitting."
      );
      return;
    }
    setValidationError(null);

    const parsedPressure =
      proposedPressureBar.trim() !== "" &&
      Number.isFinite(Number.parseFloat(proposedPressureBar))
        ? Number.parseFloat(proposedPressureBar)
        : null;

    await onSubmitEco(linkedScenarioId, {
      target_entity_id: targetEntityId,
      title: title.trim() || `Change Request for ${targetEntityId}`,
      proposed_model: proposedModel.trim() || undefined,
      proposed_pressure_bar: parsedPressure,
      proposed_spec_text: proposedSpecText.trim(),
      change_request: proposedSpecText.trim(),
    });
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Engineer Change Request (ECO) Intake
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Select the Plant Line-4 component to modify, attach or edit the replacement
                specification, and launch the verification.
              </p>
            </div>
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
              Plant Line-4 Records Linked
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {/* Step 1: Select Target Equipment */}
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 font-mono-code text-[11px] font-bold text-white">
                1
              </span>
              <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                Select Target Equipment to Swap / Modify
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {EQUIPMENT_OPTIONS.map((eq) => {
                const selected = targetEntityId === eq.id;
                return (
                  <button
                    key={eq.id}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleSelectEquipment(eq.id)}
                    className={`rounded-lg border p-3.5 text-left transition ${
                      selected
                        ? "border-slate-900 bg-slate-900/5 ring-1 ring-slate-900"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <Wrench className="h-3.5 w-3.5 text-slate-600" />
                        {eq.label}
                      </span>
                      {selected && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                      )}
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-slate-600">
                      {eq.subtitle}
                    </div>
                    <div className="mt-1.5 font-mono-code text-[10px] text-slate-500">
                      {eq.baseline}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2: Attach or Enter Proposed Replacement Specification */}
          <section>
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 font-mono-code text-[11px] font-bold text-white">
                  2
                </span>
                <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                  Attach or Enter Proposed Replacement Specification
                </h3>
              </div>

              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />
                Attach .md / .txt Spec
                <input
                  type="file"
                  accept=".md,.txt"
                  disabled={isRunning}
                  onChange={handleFileAttach}
                  className="hidden"
                />
              </label>
            </div>

            {/* Quick Example Presets (Populate without auto-submitting) */}
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                Reference Templates:
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleLoadPreset(preset)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                      linkedScenarioId === preset.scenarioId
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {preset.buttonLabel}
                  </button>
                ))}
              </div>
            </div>

            {attachedFileName && (
              <div className="mb-3 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <FileText className="h-3.5 w-3.5" />
                  Attached spec file: <strong className="font-mono-code">{attachedFileName}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedFileName(null)}
                  className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Change Request Title
                </label>
                <input
                  type="text"
                  disabled={isRunning}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Replace Pump P-101 with Centriflo-550"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Replacement Model
                </label>
                <input
                  type="text"
                  disabled={isRunning}
                  value={proposedModel}
                  onChange={(e) => {
                    setProposedModel(e.target.value);
                    setLinkedScenarioId(null);
                  }}
                  placeholder="e.g., Centriflo-550"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Proposed Pressure (bar)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isRunning}
                  value={proposedPressureBar}
                  onChange={(e) => {
                    setProposedPressureBar(e.target.value);
                    setLinkedScenarioId(null);
                  }}
                  placeholder="Parsed from spec if blank"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono-code text-xs text-slate-900 focus:border-slate-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[11px] font-semibold text-slate-600">
                Proposed Replacement Specification Text (supports bar, psi, flow rate, seal material)
              </label>
              <textarea
                rows={5}
                disabled={isRunning}
                value={proposedSpecText}
                onChange={(e) => {
                  setProposedSpecText(e.target.value);
                  setLinkedScenarioId(null);
                }}
                placeholder="Paste or type replacement datasheet parameters (e.g. Proposed Discharge Pressure: 14.0 bar or 203 psi, Flow: 145 m3/h)..."
                className="mt-1 w-full rounded-md border border-slate-300 p-3 font-mono-code text-xs leading-5 text-slate-900 focus:border-slate-600 focus:outline-none"
              />
            </div>
          </section>

          {(validationError || errorBanner) && (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
              {validationError || errorBanner}
            </div>
          )}

          {/* Step 3: Live 4-Agent Progress View + Submit */}
          {isRunning ? (
            <section className="rounded-lg border border-slate-300 bg-slate-900 p-4 text-white">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
                <Cpu className="h-4 w-4 text-emerald-400" />
                Executing ReconcileGraph
              </div>
              <div className="mt-3 space-y-2">
                {LIVE_PROGRESS_STEPS.map((label, idx) => {
                  const done = idx < activeProgressStep;
                  const active = idx === activeProgressStep;
                  return (
                    <div
                      key={label}
                      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-xs ${
                        active
                          ? "bg-white/10 font-semibold text-amber-300"
                          : done
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "text-slate-400"
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : active ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-300" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-slate-600" />
                      )}
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <div className="text-xs text-slate-500">
                Target:{" "}
                <strong className="font-mono-code text-slate-800">{targetEntityId}</strong>
                {proposedPressureBar && (
                  <>
                    {" "}
                    • Proposed Pressure:{" "}
                    <strong className="font-mono-code text-slate-800">
                      {proposedPressureBar} bar
                    </strong>
                  </>
                )}
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800"
              >
                <Play className="h-3.5 w-3.5" />
                Submit &amp; Run Verification
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
