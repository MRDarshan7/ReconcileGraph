import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Paperclip, RotateCcw, X } from "lucide-react";
import { fetchScenarios } from "../api";
import type { CustomEcoInput, ScenarioPreset } from "../types";

interface EcoIntakeScreenProps {
  onSubmitEco: (scenarioId: string | null, customEco: CustomEcoInput) => Promise<void>;
  isRunning: boolean;
  errorBanner: string | null;
}

interface EquipmentOption {
  id: string;
  label: string;
  baselineBar: number;
  baselineLine: string;
}

const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  {
    id: "P-101",
    label: "Main Feed Pump",
    baselineBar: 10.0,
    baselineLine: "Baseline: 10.0 bar · 120 m3/h · ANSI Class 150 · 5 records linked",
  },
  {
    id: "V-12",
    label: "Isolation Check Valve",
    baselineBar: 12.0,
    baselineLine: "Baseline: 12.0 bar MAWP · Velan-CV2 · Governed by SOP-7 · 5 records linked",
  },
  {
    id: "PRV-04",
    label: "Pressure Relief Valve",
    baselineBar: 11.5,
    baselineLine: "Baseline: 11.5 bar set pressure · Line-4 header · 5 records linked",
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
    label: "Span-anchored extraction",
    detail: "Locates [char_start:char_end] excerpts across 5 controlled records",
  },
  {
    agent: "ReconciliationAgent",
    label: "Pint unit & revision reconciliation",
    detail: "Normalizes units, filters superseded Rev A claims, runs bounded retries",
  },
  {
    agent: "ImpactAgent",
    label: "3-hop impact traversal",
    detail: "Evaluates downstream valve ratings, relief thresholds, SOPs & certificates",
  },
  {
    agent: "AuditorAgent",
    label: "Fail-closed SHA-256 audit",
    detail: "Verifies source byte spans and locks ECO sign-off on open conflicts",
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
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState<boolean>(false);
  const [apiScenarios, setApiScenarios] = useState<ScenarioPreset[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchScenarios()
      .then((res) => {
        if (!cancelled && Array.isArray(res.scenarios)) {
          setApiScenarios(res.scenarios);
        }
      })
      .catch(() => {
        // Fallback silently to bundled preset definitions
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scenarioMenuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setScenarioMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setScenarioMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [scenarioMenuOpen]);

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
    const matchedBackend = apiScenarios.find((s) => s.id === preset.scenarioId);
    setTargetEntityId(matchedBackend?.target_entity ?? preset.targetEntityId);
    setSelectedPresetId(preset.id);
    setLinkedScenarioId(preset.scenarioId);
    setTitle(matchedBackend?.title ?? preset.title);
    setProposedModel(preset.proposedModel);
    setProposedPressureBar(preset.proposedPressureBar);
    setProposedSpecText(matchedBackend?.change_request ?? preset.proposedSpecText);
    setAttachedFileMeta(null);
    setValidationError(null);
    setScenarioMenuOpen(false);
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
    setScenarioMenuOpen(false);
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

  const handleComposerDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (isRunning) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await ingestFile(file);
  };

  const selectedEquipment =
    EQUIPMENT_OPTIONS.find((eq) => eq.id === targetEntityId) ?? EQUIPMENT_OPTIONS[0];

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

  const preflightDeltaLabel = (() => {
    const parsed = Number.parseFloat(proposedPressureBar);
    if (proposedPressureBar.trim() !== "" && Number.isFinite(parsed)) {
      const delta = parsed - selectedEquipment.baselineBar;
      const sign = delta >= 0 ? "+" : "";
      return `${selectedEquipment.id} · ${selectedEquipment.baselineBar.toFixed(1)} bar -> ${parsed.toFixed(1)} bar (${sign}${delta.toFixed(1)} bar)`;
    }
    if (proposedSpecText.trim() !== "") {
      return `${selectedEquipment.id} · Pressure parsed from specification notes`;
    }
    return `${selectedEquipment.id} · Awaiting pressure delta`;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setValidationError(
        "Attach a replacement datasheet or enter a target pressure or specification excerpt before running verification."
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
      title: title.trim() || `Change request for ${targetEntityId}`,
      proposed_model: proposedModel.trim() || undefined,
      proposed_pressure_bar: parsedPressure,
      proposed_spec_text: proposedSpecText.trim(),
      change_request: proposedSpecText.trim(),
    });
  };

  if (isRunning) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-[2px] border border-[#E5E5E5] bg-white p-6">
          <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-4">
            <div>
              <h1 className="text-lg font-medium tracking-[-0.02em] text-[#0A0A0A]">
                Running verification pipeline
              </h1>
              <p className="mt-1 font-mono-code text-xs text-[#666666]">
                {preflightDeltaLabel}
              </p>
            </div>
            <span className="rounded-[2px] border border-[#0A0A0A] bg-[#0A0A0A] px-2.5 py-1 font-mono-code text-[10px] font-medium text-white uppercase">
              Executing
            </span>
          </div>

          <div className="mt-5 h-[2px] w-full overflow-hidden bg-[#E5E5E5]">
            <div className="animate-indeterminate h-full w-1/3 bg-[#0A0A0A]" />
          </div>

          <ol className="mt-6 divide-y divide-[#E5E5E5] border border-[#E5E5E5]">
            {PIPELINE_STAGES.map((stage, idx) => {
              const done = idx < activeProgressStep;
              const active = idx === activeProgressStep;
              return (
                <li
                  key={stage.agent}
                  className={`flex items-start justify-between gap-4 px-4 py-3.5 transition-[background-color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    active ? "bg-[#F7F7F8]" : done ? "bg-white" : "bg-white opacity-50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-[1px] ${
                          done
                            ? "bg-[#059669]"
                            : active
                              ? "bg-[#0A0A0A]"
                              : "bg-[#D4D4D8]"
                        }`}
                      />
                      <span className="text-xs font-medium text-[#0A0A0A]">
                        {stage.label}
                      </span>
                    </div>
                    <p className="mt-1 pl-4.5 font-mono-code text-[11px] text-[#666666]">
                      {stage.agent} · {stage.detail}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono-code text-[10px] font-medium uppercase ${
                      done
                        ? "text-[#059669]"
                        : active
                          ? "text-[#0A0A0A]"
                          : "text-[#999999]"
                    }`}
                  >
                    {done ? "Verified" : active ? "Running" : "Queued"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </main>
    );
  }

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleComposerDrop}
      className="mx-auto max-w-2xl px-6 py-10 sm:py-12"
    >
      {/* Header Row with Reference Scenarios Dropdown */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E5E5] pb-5">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#0A0A0A]">
            New engineering change
          </h1>
          <p className="mt-1 text-xs text-[#666666]">
            Select a Plant Line-4 asset, specify operating changes, and run deterministic verification.
          </p>
        </div>

        <div ref={menuContainerRef} className="relative">
          <button
            type="button"
            onClick={() => setScenarioMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs font-medium text-[#0A0A0A] transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#0A0A0A] hover:bg-[#F7F7F8]"
          >
            <span>
              {selectedPresetId
                ? `Loaded: ${EXAMPLE_PRESETS.find((p) => p.id === selectedPresetId)?.code ?? "Scenario"}`
                : "Load reference scenario"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#666666]" />
          </button>

          {scenarioMenuOpen && (
            <div className="absolute right-0 z-30 mt-1.5 w-80 rounded-[2px] border border-[#0A0A0A] bg-white py-1">
              <div className="border-b border-[#E5E5E5] px-3 py-1.5 text-[11px] font-medium text-[#666666]">
                Reference scenarios
              </div>
              {EXAMPLE_PRESETS.map((preset) => {
                const active = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleLoadPreset(preset)}
                    className={`flex w-full items-start justify-between gap-2 border-b border-[#E5E5E5] px-3 py-2.5 text-left last:border-b-0 transition-[background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#F7F7F8] ${
                      active ? "bg-[#F7F7F8]" : "bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-code text-[11px] font-medium text-[#0A0A0A]">
                          {preset.code}
                        </span>
                        <span className="text-xs font-medium text-[#0A0A0A]">
                          {preset.shortTitle}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-[#666666]">
                        {preset.summary}
                      </p>
                    </div>
                    {active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0A0A0A]" />}
                  </button>
                );
              })}

              {hasAnyInput && (
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="flex w-full items-center gap-1.5 border-t border-[#E5E5E5] px-3 py-2 text-left text-xs text-[#666666] hover:bg-[#F7F7F8] hover:text-[#0A0A0A]"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset form</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Composer Form */}
      <form
        onSubmit={handleSubmit}
        className={`mt-7 space-y-6 transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDraggingFile ? "rounded-[2px] border border-dashed border-[#0A0A0A] bg-[#F7F7F8] p-4" : ""
        }`}
      >
        {/* Step 1: Target Equipment 3-Segment Hairline Strip */}
        <div>
          <label className="block text-xs font-medium text-[#666666]">
            Target equipment
          </label>
          <div className="mt-2 grid grid-cols-1 divide-y divide-[#E5E5E5] rounded-[2px] border border-[#E5E5E5] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {EQUIPMENT_OPTIONS.map((eq) => {
              const selected = targetEntityId === eq.id;
              return (
                <button
                  key={eq.id}
                  type="button"
                  onClick={() => handleSelectEquipment(eq.id)}
                  className={`relative px-3.5 py-2.5 text-left transition-[background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    selected
                      ? "bg-[#F7F7F8] ring-1 ring-inset ring-[#0A0A0A]"
                      : "bg-white hover:bg-[#FAFAFB]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-code text-xs font-semibold text-[#0A0A0A]">
                      {eq.id}
                    </span>
                    {selected && (
                      <span className="h-1.5 w-1.5 rounded-[1px] bg-[#0A0A0A]" />
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[#666666]">
                    {eq.label}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border border-t-0 border-[#E5E5E5] bg-[#F7F7F8] px-3.5 py-2 font-mono-code text-[11px] text-[#666666]">
            {selectedEquipment.baselineLine}
          </div>
        </div>

        {/* Step 2: Proposed Change Inputs */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[#0A0A0A]">
                Change title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Pump P-101 Upgrade"
                className="mt-1.5 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2 text-xs text-[#0A0A0A] placeholder:text-[#999999] focus:border-[#0A0A0A] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0A0A0A]">
                Proposed model
              </label>
              <input
                type="text"
                value={proposedModel}
                onChange={(e) => {
                  setProposedModel(e.target.value);
                  setSelectedPresetId(null);
                  setLinkedScenarioId(null);
                }}
                placeholder="e.g., Centriflo-550"
                className="mt-1.5 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2 text-xs text-[#0A0A0A] placeholder:text-[#999999] focus:border-[#0A0A0A] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0A0A0A]">
                Target pressure (bar)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={proposedPressureBar}
                onChange={(e) => {
                  setProposedPressureBar(e.target.value);
                  setSelectedPresetId(null);
                  setLinkedScenarioId(null);
                }}
                placeholder="e.g., 14.0"
                className="mt-1.5 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2 font-mono-code text-xs text-[#0A0A0A] placeholder:text-[#999999] focus:border-[#0A0A0A] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0A0A0A]">
              Specification notes
            </label>
            <textarea
              rows={5}
              value={proposedSpecText}
              onChange={(e) => {
                setProposedSpecText(e.target.value);
                setSelectedPresetId(null);
                setLinkedScenarioId(null);
              }}
              placeholder="Paste replacement datasheet excerpts (supports bar, psi, kPa, MPa, flow rate, flange class, or drop a .md / .txt file anywhere here)..."
              className="mt-1.5 w-full rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFB] p-3 font-mono-code text-xs leading-5 text-[#0A0A0A] placeholder:text-[#999999] focus:border-[#0A0A0A] focus:bg-white focus:outline-none"
            />

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] transition-[color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[#0A0A0A]"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span>+ Attach replacement datasheet (.md, .txt)</span>
              </button>

              {hasAnyInput && (
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="text-xs text-[#666666] hover:text-[#0A0A0A]"
                >
                  Clear form
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt"
                onChange={handleFileAttach}
                className="hidden"
              />
            </div>

            {attachedFileMeta && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-[2px] border border-[#059669]/30 bg-[#059669]/5 px-3 py-2 font-mono-code text-[11px] text-[#0A0A0A]">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{attachedFileMeta.name}</span>
                  <span className="text-[#666666]">·</span>
                  <span className="text-[#666666]">
                    {formatBytes(attachedFileMeta.size)}
                  </span>
                  {attachedFileMeta.detectedPressure && (
                    <>
                      <span className="text-[#666666]">·</span>
                      <span className="text-[#059669]">
                        parsed {attachedFileMeta.detectedPressure} bar
                      </span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedFileMeta(null)}
                  aria-label="Remove attached file"
                  className="p-0.5 text-[#666666] hover:text-[#0A0A0A]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {(validationError || errorBanner) && (
          <div className="rounded-[2px] border border-[#DC2626]/35 bg-[#DC2626]/5 px-3.5 py-2.5 text-xs text-[#DC2626]">
            {validationError || errorBanner}
          </div>
        )}

        {/* Step 3: Compact Live Pre-Flight Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E5E5E5] pt-5">
          <span className="font-mono-code text-xs text-[#666666]">
            {preflightDeltaLabel}
          </span>

          <button
            type="submit"
            disabled={!canSubmit || isRunning}
            className="inline-flex items-center gap-2 rounded-[2px] bg-[#0A0A0A] px-6 py-2.5 text-xs font-medium text-white transition-[background-color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>Run verification</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </main>
  );
}
