import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
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
  revealCard?: boolean;
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
    label: "Main Feed Pump",
    subtitle: "Centriflo-400 • ANSI Class 150",
    baseline: "10.0 bar spec (175 psi logged) • 120 m3/h",
  },
  {
    id: "V-12",
    label: "Isolation Check Valve",
    subtitle: "Velan-CV2 • Downstream of P-101",
    baseline: "12.0 bar MAWP • Governed by SOP-7",
  },
  {
    id: "PRV-04",
    label: "Pressure Relief Valve",
    subtitle: "Spring-Loaded Relief • Line-4 Header",
    baseline: "11.5 bar Set Pressure • Protects Header",
  },
];

interface ExamplePreset {
  id: string;
  code: string;
  shortTitle: string;
  summary: string;
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
    code: "ECO-01",
    shortTitle: "Pump Upgrade (14.0 bar)",
    summary: "Flags Rev A, 175 psi mismatch, missing vibration & 4 overloads.",
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
    code: "ECO-02",
    shortTitle: "Mechanical Seal Swap",
    summary: "Same 10.0 bar rating; catches baseline 175 psi mismatch.",
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
    code: "ECO-03",
    shortTitle: "Valve V-12 Class 300",
    summary: "25.0 bar MAWP upgrade compatible with P-101; clean sign-off.",
    scenarioId: "eco_03_valve_upgrade",
    targetEntityId: "V-12",
    title: "ECO-03: Valve V-12 Class 300 Upgrade",
    proposedModel: "Velan-CV2 Class 300",
    proposedPressureBar: "25.0",
    proposedSpecText:
      "Proposed Replacement Valve: Velan-CV2 ANSI Class 300\nTarget Asset: V-12 (Downstream of P-101)\nMax Allowable Working Pressure (MAWP): 25.0 bar\nGoverning Procedure: SOP-7 (update valve rating reference)",
  },
];

const PIPELINE_STAGES = [
  {
    agent: "ExtractionAgent",
    label: "Span-Anchored Extraction",
    detail: "Locates [char_start:char_end] excerpts across 5 plant records",
  },
  {
    agent: "ReconciliationAgent",
    label: "Pint Unit & Revision Reconciliation",
    detail: "Resolves aliases, filters SUPERSEDED specs, runs bounded retries",
  },
  {
    agent: "ImpactAgent",
    label: "3-Hop Impact BFS",
    detail: "Traverses downstream valves, relief limits, SOPs & inspections",
  },
  {
    agent: "AuditorAgent",
    label: "Fail-Closed Audit",
    detail: "Re-verifies SHA-256 spans and locks ECO sign-off on open conflicts",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function parsePressureToBar(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(bar|psi|kpa|mpa)\b/i);
  if (!match) return null;
  const val = Number.parseFloat(match[1]);
  if (!Number.isFinite(val)) return null;
  const unit = match[2].toLowerCase();
  if (unit === "psi") return (val * 0.0689476).toFixed(2);
  if (unit === "kpa") return (val / 100).toFixed(2);
  if (unit === "mpa") return (val * 10).toFixed(2);
  return val.toString();
}

export function EcoIntakeScreen({
  onSubmitEco,
  isRunning,
  errorBanner,
  revealCard = true,
}: EcoIntakeScreenProps) {
  const [targetEntityId, setTargetEntityId] = useState<string>("P-101");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [linkedScenarioId, setLinkedScenarioId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [proposedModel, setProposedModel] = useState<string>("");
  const [proposedPressureBar, setProposedPressureBar] = useState<string>("");
  const [proposedSpecText, setProposedSpecText] = useState<string>("");
  const [attachedFileMeta, setAttachedFileMeta] = useState<{
    name: string;
    size: number;
    detectedPressure: string | null;
  } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
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
    setSelectedPresetId(preset.id);
    setLinkedScenarioId(preset.scenarioId);
    setTitle(preset.title);
    setProposedModel(preset.proposedModel);
    setProposedPressureBar(preset.proposedPressureBar);
    setProposedSpecText(preset.proposedSpecText);
    setAttachedFileMeta(null);
    setValidationError(null);
  };

  const handleClearForm = () => {
    setSelectedPresetId(null);
    setLinkedScenarioId(null);
    setTitle("");
    setProposedModel("");
    setProposedPressureBar("");
    setProposedSpecText("");
    setAttachedFileMeta(null);
    setValidationError(null);
  };

  const handleSelectEquipment = (id: string) => {
    setTargetEntityId(id);
    setSelectedPresetId(null);
    setLinkedScenarioId(null);
  };

  const ingestFile = async (file: File) => {
    const text = await file.text();
    const detectedPressure = parsePressureToBar(text);
    setAttachedFileMeta({
      name: file.name,
      size: file.size,
      detectedPressure,
    });
    setProposedSpecText(text);
    setSelectedPresetId(null);
    setLinkedScenarioId(null);

    if (detectedPressure !== null) {
      setProposedPressureBar(detectedPressure);
    }
    if (!title.trim()) {
      setTitle(`ECO from ${file.name}`);
    }
    setValidationError(null);
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestFile(file);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (isRunning) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await ingestFile(file);
  };

  const canSubmit =
    proposedPressureBar.trim() !== "" || proposedSpecText.trim() !== "";

  const hasAnyInput = Boolean(
    selectedPresetId ||
      title.trim() ||
      proposedModel.trim() ||
      proposedPressureBar.trim() ||
      proposedSpecText.trim() ||
      attachedFileMeta
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setValidationError(
        "Attach a replacement spec or enter proposed pressure/specification details before running verification."
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
    <main
      className={`mx-auto max-w-[1440px] px-5 py-6 transition-all duration-500 ease-out ${
        revealCard ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      {/* Top Quick-Load Strip: Reference Scenarios */}
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-mono-code text-[11px] font-bold tracking-wider text-slate-700 uppercase">
              Reference Scenarios // Quick-Load
            </span>
          </div>
          {hasAnyInput && (
            <button
              type="button"
              disabled={isRunning}
              onClick={handleClearForm}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Form
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {EXAMPLE_PRESETS.map((preset) => {
            const active = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={isRunning}
                onClick={() => handleLoadPreset(preset)}
                className={`group rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                    : "border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono-code text-[10px] font-bold ${
                        active
                          ? "bg-sky-400/20 text-sky-300"
                          : "border border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {preset.code}
                    </span>
                    <span className="text-xs font-bold">{preset.shortTitle}</span>
                  </div>
                  <span
                    className={`font-mono-code text-[10px] font-semibold ${
                      active ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {preset.targetEntityId}
                  </span>
                </div>
                <p
                  className={`mt-1.5 text-[11px] leading-4 ${
                    active ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {preset.summary}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main 2-Column ECO Intake Command Center */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Column: Target Asset & Change Parameters */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-2xs lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-950">
                Target Asset &amp; Change Parameters
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Select the Plant Line-4 component and specify proposed operating deltas.
              </p>
            </div>
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono-code text-[10px] font-semibold text-slate-600">
              5 RECORDS LINKED
            </span>
          </div>

          <div className="space-y-5 p-5">
            {/* Equipment Selector Cards */}
            <div>
              <label className="mb-2 block font-mono-code text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                01 // Target Equipment Tag
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {EQUIPMENT_OPTIONS.map((eq) => {
                  const selected = targetEntityId === eq.id;
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      disabled={isRunning}
                      onClick={() => handleSelectEquipment(eq.id)}
                      className={`rounded-lg border p-3 text-left transition ${
                        selected
                          ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-mono-code text-xs font-bold text-slate-950">
                          <Wrench className="h-3.5 w-3.5 text-slate-500" />
                          {eq.id}
                        </span>
                        {selected && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        )}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-800">
                        {eq.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{eq.subtitle}</div>
                      <div className="mt-2 rounded bg-slate-100 px-2 py-1 font-mono-code text-[10px] text-slate-600">
                        {eq.baseline}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Structured Inputs */}
            <div>
              <label className="mb-2 block font-mono-code text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                02 // Proposed Engineering Delta
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Change Title
                  </label>
                  <input
                    type="text"
                    disabled={isRunning}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Pump P-101 Upgrade"
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Proposed Model
                  </label>
                  <input
                    type="text"
                    disabled={isRunning}
                    value={proposedModel}
                    onChange={(e) => {
                      setProposedModel(e.target.value);
                      setSelectedPresetId(null);
                      setLinkedScenarioId(null);
                    }}
                    placeholder="e.g., Centriflo-550"
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Target Pressure (bar)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={isRunning}
                    value={proposedPressureBar}
                    onChange={(e) => {
                      setProposedPressureBar(e.target.value);
                      setSelectedPresetId(null);
                      setLinkedScenarioId(null);
                    }}
                    placeholder="e.g., 14.0"
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono-code text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Specification Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">
                Specification Notes (supports bar, psi, kPa, MPa, flow &amp; seal material)
              </label>
              <textarea
                rows={6}
                disabled={isRunning}
                value={proposedSpecText}
                onChange={(e) => {
                  setProposedSpecText(e.target.value);
                  setSelectedPresetId(null);
                  setLinkedScenarioId(null);
                }}
                placeholder="Enter or paste replacement datasheet excerpts (e.g., discharge pressure in bar or psi, flow rate in m3/h, flange class, elastomer seal)..."
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-slate-50/50 p-3 font-mono-code text-xs leading-5 text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            {(validationError || errorBanner) && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                {validationError || errorBanner}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Supplemental Spec Dropzone & Pre-Flight Summary */}
        <aside className="flex flex-col gap-5 lg:col-span-5">
          {/* Dropzone Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono-code text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                03 // Replacement Spec Attachment
              </span>
              <span className="font-mono-code text-[10px] text-slate-400">.MD / .TXT</span>
            </div>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (!isRunning) setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition ${
                isDraggingFile
                  ? "border-sky-500 bg-sky-50/70"
                  : "border-slate-300 bg-slate-50/70 hover:border-slate-400 hover:bg-slate-100/70"
              }`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-2xs">
                <Upload className="h-4 w-4" />
              </div>
              <span className="mt-2.5 text-xs font-semibold text-slate-800">
                Drop replacement datasheet here or click to browse
              </span>
              <span className="mt-1 text-[11px] text-slate-500">
                Auto-populates spec text and converts psi / kPa / MPa to bar
              </span>
              <input
                type="file"
                accept=".md,.txt"
                disabled={isRunning}
                onChange={handleFileAttach}
                className="hidden"
              />
            </label>

            {attachedFileMeta && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    <span className="truncate font-mono-code">{attachedFileMeta.name}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono-code text-[10px] text-emerald-800">
                    <span>{formatBytes(attachedFileMeta.size)}</span>
                    {attachedFileMeta.detectedPressure && (
                      <>
                        <span>•</span>
                        <span>EXTRACTED {attachedFileMeta.detectedPressure} BAR</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedFileMeta(null)}
                  className="rounded p-1 text-emerald-700 transition hover:bg-emerald-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </section>

          {/* Pre-Flight Checklist OR Live 4-Stage Pipeline Tracker */}
          <section className="flex flex-1 flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            {isRunning ? (
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="inline-flex items-center gap-2 font-mono-code text-[11px] font-bold tracking-wider text-slate-900 uppercase">
                    <Cpu className="h-4 w-4 text-sky-600" />
                    Live Verification Telemetry
                  </span>
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-mono-code text-[10px] font-bold text-amber-900">
                    EXECUTING
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {PIPELINE_STAGES.map((stage, idx) => {
                    const done = idx < activeProgressStep;
                    const active = idx === activeProgressStep;
                    return (
                      <div
                        key={stage.agent}
                        className={`rounded-lg border px-3 py-2.5 transition ${
                          active
                            ? "border-sky-300 bg-sky-50/70"
                            : done
                              ? "border-emerald-200 bg-emerald-50/60"
                              : "border-slate-200 bg-slate-50/60 opacity-65"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {done ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            ) : active ? (
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" />
                            ) : (
                              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300" />
                            )}
                            <span className="text-xs font-bold text-slate-900">
                              {stage.label}
                            </span>
                          </div>
                          <span
                            className={`font-mono-code text-[10px] font-semibold ${
                              done
                                ? "text-emerald-700"
                                : active
                                  ? "text-sky-700"
                                  : "text-slate-400"
                            }`}
                          >
                            {done ? "VERIFIED" : active ? "RUNNING" : "QUEUED"}
                          </span>
                        </div>
                        <div className="mt-1 pl-6 font-mono-code text-[10px] text-slate-500">
                          {stage.agent} — {stage.detail}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="inline-flex items-center gap-2 font-mono-code text-[11px] font-bold tracking-wider text-slate-700 uppercase">
                      <ShieldCheck className="h-4 w-4 text-slate-700" />
                      What Will Run // Pre-Flight
                    </span>
                    <span className="font-mono-code text-[10px] font-semibold text-slate-500">
                      TARGET: {targetEntityId}
                    </span>
                  </div>

                  <ol className="mt-3.5 space-y-2.5">
                    {PIPELINE_STAGES.map((stage, idx) => (
                      <li key={stage.agent} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 font-mono-code text-[10px] font-bold text-slate-700">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            {stage.label}
                          </div>
                          <div className="text-[11px] text-slate-500">{stage.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono-code text-[11px] text-slate-500">
                    <span>
                      ASSET: <strong className="text-slate-900">{targetEntityId}</strong>
                    </span>
                    <span>
                      PRESSURE:{" "}
                      <strong className="text-slate-900">
                        {proposedPressureBar ? `${proposedPressureBar} bar` : "from spec text"}
                      </strong>
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={!canSubmit || isRunning}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span>Run Verification Pipeline</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                </div>
              </>
            )}
          </section>
        </aside>
      </form>
    </main>
  );
}
