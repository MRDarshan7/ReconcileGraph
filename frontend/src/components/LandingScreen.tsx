import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

interface LandingScreenProps {
  onEnter: () => void;
  isExiting?: boolean;
}

type ShowcaseTabId = "workspace" | "logic" | "audit";
type CalloutKey = "A" | "B" | "C";

interface CalloutItem {
  key: CalloutKey;
  title: string;
  description: string;
}

interface ShowcaseTabConfig {
  id: ShowcaseTabId;
  label: string;
  windowTitle: string;
  windowStatus: string;
  callouts: CalloutItem[];
}

const SHOWCASE_TABS: ShowcaseTabConfig[] = [
  {
    id: "workspace",
    label: "Evidence Workspace",
    windowTitle: "ReconcileGraph // Plant Line-4 Review",
    windowStatus: "ECO-01 · 6 OPEN CONFLICTS",
    callouts: [
      {
        key: "A",
        title: "Anchor every flagged claim",
        description:
          "Agents flag contradictions and anchor every claim to exact source bytes.",
      },
      {
        key: "B",
        title: "Inspect Pint unit diffs",
        description:
          "Engineers inspect side-by-side Pint unit diffs and record a rationale.",
      },
      {
        key: "C",
        title: "Verify byte-level provenance",
        description:
          "Inspect byte offsets and SHA-256 span proofs directly inside source records.",
      },
    ],
  },
  {
    id: "logic",
    label: "Deterministic Logic",
    windowTitle: "ReconcileGraph // Guardrail Pipeline",
    windowStatus: "PINNED TOOLS ACTIVE",
    callouts: [
      {
        key: "A",
        title: "Exclude superseded specs",
        description:
          "Structured extraction proposes claims while superseded Rev A specs are excluded.",
      },
      {
        key: "B",
        title: "Normalize tags and units",
        description:
          "Python guardrails normalize units, resolve tag aliases, and retry missing slots.",
      },
      {
        key: "C",
        title: "Evaluate downstream boundaries",
        description:
          "Trace downstream pressure and interlock limits across connected plant assets.",
      },
    ],
  },
  {
    id: "audit",
    label: "Fail-Closed Audit",
    windowTitle: "ReconcileGraph // Auditor Gate",
    windowStatus: "HTTP 409 LOCK ENFORCED",
    callouts: [
      {
        key: "A",
        title: "Inspect every agent step",
        description:
          "Audit every executed agent step, rule ID, and rejected ungrounded claim.",
      },
      {
        key: "B",
        title: "Enforce human-in-the-loop gate",
        description:
          "Approval stays locked (HTTP 409) until every open conflict is resolved.",
      },
      {
        key: "C",
        title: "Bind decisions to sign-off",
        description:
          "An immutable trace links each engineer decision to final ECO sign-off.",
      },
    ],
  },
];

const BENCHMARK_METRICS = [
  {
    label: "Evidence traceability",
    rag: 0.4,
    graph: 0.55,
    ours: 1.0,
    note: "Naive RAG and static graphs cite coarse chunks without exact offsets; ReconcileGraph enforces SHA-256 [char_start:char_end] span verification.",
  },
  {
    label: "Revision resolution",
    rag: 0.33,
    graph: 0.5,
    ours: 1.0,
    note: "Vector search retrieves superseded Rev A specs (8.5 bar) alongside Rev B; RevisionComparator filters obsolete revisions deterministically.",
  },
  {
    label: "Conflict detection",
    rag: 0.0,
    graph: 0.25,
    ours: 1.0,
    note: "Baselines miss alias 'P101 rev. 2' at 175 psi vs 10.0 bar; AliasResolver + Pint normalize units to flag the +2.07 bar mismatch.",
  },
  {
    label: "Impact correctness",
    rag: 0.25,
    graph: 0.75,
    ours: 1.0,
    note: "Naive RAG misses downstream SOP-7 and INSP-04 hops; bounded 3-hop BFS evaluates every rated limit against the proposed ECO pressure.",
  },
  {
    label: "Escalation precision",
    rag: 0.33,
    graph: 0.5,
    ours: 1.0,
    note: "Single-pass prompts gloss over omitted vibration baselines; ReconcileGraph runs 2 bounded retries and opens MISSING_EVIDENCE explicitly.",
  },
  {
    label: "Audit faithfulness",
    rag: 0.45,
    graph: 0.6,
    ours: 1.0,
    note: "Unverified summaries leak into reports without span checks; AuditorAgent rejects ungrounded claims and locks HTTP 409 sign-off.",
  },
];

const BENCHMARK_SUMMARY = [
  { name: "Retrieval-Only RAG", score: "0.29", pct: 29, highlight: false, delta: null },
  { name: "Static Dependency Graph", score: "0.53", pct: 53, highlight: false, delta: null },
  {
    name: "ReconcileGraph",
    score: "1.00",
    pct: 100,
    highlight: true,
    delta: "+47 pts vs. Static Graph",
  },
];

const ARCHITECTURE_FOOTER_STRIP = [
  { label: "Backend store", value: "FastAPI + SQLite WAL" },
  { label: "Deterministic core", value: "Pint + SHA-256" },
  { label: "Resilient routing", value: "Gemini -> Groq -> Offline" },
  { label: "Approval gate", value: "Fail-Closed HTTP 409" },
];

const STATEMENT_WORDS =
  "Plant truth hides across revisions, units, and limits. ReconcileGraph verifies every claim before human sign-off.".split(
    " "
  );

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function HeroDepthCanvas({ reducedMotion }: { reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let pointerX = 0.5;
    let pointerY = 0.5;
    let rafId = 0;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const offsetX = reducedMotion ? 0 : (pointerX - 0.5) * 28;
      const offsetY = reducedMotion ? 0 : (pointerY - 0.5) * 20;

      // Orthogonal hairline coordinate grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      const step = 80;

      for (let x = ((offsetX % step) + step) % step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
      }

      for (let y = ((offsetY % step) + step) % step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }

      // Architectural radial perspective depth lines converging toward horizon
      const vanishX = width * 0.72 + offsetX * 1.4;
      const vanishY = height * 0.44 + offsetY * 1.4;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.075)";

      const rays = 10;
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2;
        const r = Math.max(width, height);
        ctx.beginPath();
        ctx.moveTo(vanishX + Math.cos(angle) * 48, vanishY + Math.sin(angle) * 48);
        ctx.lineTo(vanishX + Math.cos(angle) * r, vanishY + Math.sin(angle) * r);
        ctx.stroke();
      }

      // Fine crosshair at convergence origin
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.beginPath();
      ctx.moveTo(vanishX - 18, vanishY);
      ctx.lineTo(vanishX + 18, vanishY);
      ctx.moveTo(vanishX, vanishY - 18);
      ctx.lineTo(vanishX, vanishY + 18);
      ctx.stroke();

      // Concentric architectural range rings
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      [120, 240, 380].forEach((radius) => {
        ctx.beginPath();
        ctx.arc(vanishX, vanishY, radius, 0, Math.PI * 2);
        ctx.stroke();
      });
    };

    draw();

    const onMove = (e: MouseEvent) => {
      if (reducedMotion) return;
      pointerX = e.clientX / Math.max(window.innerWidth, 1);
      pointerY = e.clientY / Math.max(window.innerHeight, 1);
      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          rafId = 0;
          draw();
        });
      }
    };

    const onResize = () => draw();
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none h-full w-full"
    />
  );
}

function ScrollWord({
  word,
  index,
  total,
  progress,
}: {
  word: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / total;
  const end = Math.min(1, start + 1.8 / total);
  const opacity = useTransform(progress, [start, end], [0, 1]);

  return (
    <span className="relative mr-[0.26em] inline-block">
      <span className="text-[#2A2A2E]">{word}</span>
      <motion.span
        style={{ opacity }}
        aria-hidden="true"
        className="absolute inset-0 text-white"
      >
        {word}
      </motion.span>
    </span>
  );
}

function CalloutPin({
  letter,
  active,
  onClick,
  className = "",
}: {
  letter: CalloutKey;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Highlight callout ${letter}`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-[2px] border font-mono-code text-xs font-semibold transition-[background-color,color,border-color,transform] duration-150 ease-out ${
        active
          ? "border-white bg-white text-black scale-105"
          : "border-white/40 bg-black text-white hover:border-white"
      } ${className}`}
    >
      {letter}
    </button>
  );
}

function ProductViewportContent({
  tab,
  activeCallout,
  onSelectCallout,
  tab1Resolved,
  onSetTab1Resolved,
  reducedMotion,
}: {
  tab: ShowcaseTabId;
  activeCallout: CalloutKey;
  onSelectCallout: (key: CalloutKey) => void;
  tab1Resolved: boolean;
  onSetTab1Resolved: (val: boolean) => void;
  reducedMotion: boolean;
}) {
  const [flash409, setFlash409] = useState<boolean>(false);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  const triggerPrematureSignoffTest = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCallout("B");
    setFlash409(false);
    window.requestAnimationFrame(() => {
      setFlash409(true);
    });
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setFlash409(false);
    }, 950);
  };

  const panelClass = (key: CalloutKey) =>
    `relative border p-4 transition-[opacity,border-color,background-color] duration-200 ease-out ${
      activeCallout === key
        ? "border-white/75 bg-[#111114] opacity-100"
        : "border-white/10 bg-[#0B0B0D] opacity-40 hover:opacity-75"
    }`;

  if (tab === "workspace") {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Pane A: Findings Queue */}
        <div
          onClick={() => onSelectCallout("A")}
          className={`cursor-pointer lg:col-span-3 ${panelClass("A")}`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <span className="font-mono-code text-[12px] text-neutral-300">Findings Queue</span>
            <CalloutPin letter="A" active={activeCallout === "A"} onClick={() => onSelectCallout("A")} />
          </div>

          <div className="mt-3 space-y-2">
            <div
              className={`border-l-2 bg-white/[0.04] p-2.5 transition-[border-color] duration-200 ease-out ${
                tab1Resolved ? "border-[#10B981]" : "border-[#D97706]"
              }`}
            >
              <div className="flex items-center justify-between font-mono-code text-[11px]">
                <span className={tab1Resolved ? "text-[#10B981]" : "text-[#D97706]"}>
                  {tab1Resolved ? "RESOLVED" : "NEEDS DECISION"}
                </span>
                <span className="text-neutral-400">P-101</span>
              </div>
              <div className="mt-1 text-xs font-medium text-white">
                Active Baseline Conflict: Discharge Pressure
              </div>
            </div>

            <div className="border-l-2 border-[#DC2626] bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between font-mono-code text-[11px]">
                <span className="text-[#DC2626]">OVERLOAD</span>
                <span className="text-neutral-400">PRV-04</span>
              </div>
              <div className="mt-1 text-xs text-neutral-300">
                14.0 bar exceeds 11.5 bar set limit
              </div>
            </div>

            <div className="border-l-2 border-neutral-500 bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between font-mono-code text-[11px]">
                <span className="text-neutral-400">EXCLUDED</span>
                <span className="text-neutral-500">REV A</span>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                Superseded spec SPEC-P101-A retired
              </div>
            </div>

            <div className="border-l-2 border-[#DC2626] bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between font-mono-code text-[11px]">
                <span className="text-[#DC2626]">BLOCKED</span>
                <span className="text-neutral-500">AUDIT</span>
              </div>
              <div className="mt-1 text-xs text-neutral-500 line-through">
                Ungrounded candidate claim
              </div>
            </div>
          </div>
        </div>

        {/* Pane C: Document Reader with Byte Highlight */}
        <div
          onClick={() => onSelectCallout("C")}
          className={`cursor-pointer lg:col-span-5 ${panelClass("C")}`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <span className="font-mono-code text-[12px] text-neutral-300">
              MNT-2026-09 · OFFSET [512:519]
            </span>
            <CalloutPin letter="C" active={activeCallout === "C"} onClick={() => onSelectCallout("C")} />
          </div>

          <div className="mt-3 border border-white/10 bg-black p-3.5 font-mono-code text-[12px] leading-relaxed">
            <div className="text-neutral-500">013 - Observed Asset Tag: P101 rev. 2</div>
            <div className="text-neutral-500">014 - Service Status: Normal Line-4 load</div>
            <div className="my-1 bg-white/[0.06] py-1 text-neutral-200">
              015 - Field Discharge Pressure:{" "}
              <span className="border border-white bg-white/15 px-1.5 py-0.5 text-white">
                175 psi
              </span>
            </div>
            <div className="text-neutral-500">016 - Bearing Housing Temp: 62°C</div>
            <div className="text-neutral-500">021 - Vibration baseline omitted from entry</div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black px-3 py-2 font-mono-code text-[11px]">
            <span className="text-neutral-300">SHA-256 VERIFIED</span>
            <span className="text-neutral-400">9f4b2c8e1d7a...a730</span>
          </div>
        </div>

        {/* Pane B: Side-by-Side Diff & Resolve */}
        <div
          onClick={() => onSelectCallout("B")}
          className={`cursor-pointer lg:col-span-4 ${panelClass("B")}`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <span className="font-mono-code text-[12px] text-neutral-300">
              Evidence &amp; Unit Check
            </span>
            <CalloutPin letter="B" active={activeCallout === "B"} onClick={() => onSelectCallout("B")} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 font-mono-code text-[12px]">
            <div className="border border-white/15 bg-black p-3">
              <div className="text-[11px] text-neutral-500">SOURCE A · REV B</div>
              <div className="mt-1.5 text-base text-white">10.00 bar</div>
              <div className="mt-1 text-[11px] text-neutral-400">SPEC-P101-B</div>
            </div>

            <div
              className={`border bg-black p-3 transition-[border-color] duration-200 ease-out ${
                tab1Resolved ? "border-[#10B981]" : "border-[#D97706]"
              }`}
            >
              <div
                className={`text-[11px] ${
                  tab1Resolved ? "text-[#10B981]" : "text-[#D97706]"
                }`}
              >
                SOURCE B · LOG
              </div>
              <div className="mt-1.5 text-base text-white">12.07 bar</div>
              <div className="mt-1 text-[11px] text-neutral-400">raw 175 psi</div>
            </div>
          </div>

          <div className="mt-3 border border-white/15 bg-black p-3">
            <div className="flex items-center justify-between font-mono-code text-[11px]">
              <span className={tab1Resolved ? "text-[#10B981]" : "text-[#D97706]"}>
                {tab1Resolved ? "✓ RESOLVED" : "DELTA +2.07 bar"}
              </span>
              <span className={tab1Resolved ? "text-[#10B981]" : "text-neutral-400"}>
                {tab1Resolved ? "RE-CHECK PASSED" : "OPEN CONFLICT"}
              </span>
            </div>
            <div className="mt-2.5 border border-white/15 bg-[#0B0B0C] px-2.5 py-2 text-xs text-neutral-300">
              Rationale: Derate pump envelope to 11.0 bar and verify gauge PG-104.
            </div>
            {tab1Resolved ? (
              <div className="mt-2.5 flex items-center justify-between gap-2 border border-[#10B981]/50 bg-[#10B981]/10 px-3 py-1.5 font-mono-code text-[11px] text-[#10B981]">
                <span>✓ Decision recorded</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetTab1Resolved(false);
                  }}
                  className="border border-white/25 bg-black px-2 py-0.5 text-white transition-[background-color,color] duration-150 ease-out hover:bg-white hover:text-black"
                >
                  Reset preview
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCallout("B");
                  onSetTab1Resolved(true);
                }}
                className="mt-2.5 w-full bg-white px-3 py-1.5 text-center text-xs font-medium text-black transition-[background-color] duration-150 ease-out hover:bg-neutral-200"
              >
                Record Decision &amp; Re-Check Impact
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (tab === "logic") {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Stage A: Extraction + Revision Filter */}
        <div
          onClick={() => onSelectCallout("A")}
          className={`cursor-pointer lg:col-span-4 ${panelClass("A")}`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <span className="font-mono-code text-[12px] text-neutral-300">
              Extraction &amp; Revision Filter
            </span>
            <CalloutPin letter="A" active={activeCallout === "A"} onClick={() => onSelectCallout("A")} />
          </div>

          <div className="mt-3 space-y-2.5 font-mono-code text-[12px]">
            <div className="border border-white/15 bg-black p-3">
              <div className="text-[11px] text-neutral-500">RULE_REV_PRECEDENCE</div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-neutral-400">SPEC-P101-A (8.5 bar)</span>
                <span className="text-[#DC2626]">SUPERSEDED</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-white">SPEC-P101-B (10.0 bar)</span>
                <span className="text-neutral-200">RELEASED</span>
              </div>
            </div>

            <div className="border border-white/15 bg-black p-3">
              <div className="text-[11px] text-neutral-500">RULE_SPAN_HASH_PROV</div>
              <div className="mt-1 text-neutral-300">14 assertions anchored verbatim</div>
            </div>
          </div>
        </div>

        {/* Stage B: Pint + Alias + Bounded Retry */}
        <div
          onClick={() => onSelectCallout("B")}
          className={`cursor-pointer lg:col-span-4 ${panelClass("B")}`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <span className="font-mono-code text-[12px] text-neutral-300">
              Deterministic Guardrails
            </span>
            <CalloutPin letter="B" active={activeCallout === "B"} onClick={() => onSelectCallout("B")} />
          </div>

          <div className="mt-3 space-y-2.5 font-mono-code text-[12px]">
            <div className="border border-white/15 bg-black p-3">
              <div className="text-[11px] text-neutral-500">RULE_ALIAS_NORM</div>
              <div className="mt-1 text-white">P101 rev. 2 → P-101 (conf 0.95)</div>
            </div>

            <div className="border border-white/15 bg-black p-3">
              <div className="text-[11px] text-neutral-500">RULE_UNIT_PINT</div>
              <div className="mt-1 text-[#D97706]">175 psi → 12.07 bar != 10.00 bar</div>
            </div>

            <div className="border border-white/15 bg-black p-3">
              <div className="text-[11px] text-neutral-500">RULE_BOUNDED_RETRY_1..2</div>
              <div className="mt-1 text-neutral-300">vibration_baseline → MISSING_EVIDENCE</div>
            </div>
          </div>
        </div>

        {/* Stage C: Downstream BFS Matrix */}
        <div
          onClick={() => onSelectCallout("C")}
          className={`cursor-pointer lg:col-span-4 ${panelClass("C")}`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <span className="font-mono-code text-[12px] text-neutral-300">
              Impact BFS (max_hops=3)
            </span>
            <CalloutPin letter="C" active={activeCallout === "C"} onClick={() => onSelectCallout("C")} />
          </div>

          <div className="mt-3 border border-white/15 bg-black font-mono-code text-[12px]">
            <div className="grid grid-cols-3 border-b border-white/10 px-3 py-2 text-[11px] text-neutral-500">
              <span>Asset</span>
              <span>Limit</span>
              <span className="text-right">Delta</span>
            </div>
            {[
              { id: "V-12", lim: "12.0 bar", delta: "-2.0 bar" },
              { id: "PRV-04", lim: "11.5 bar", delta: "-2.5 bar" },
              { id: "SOP-7", lim: "11.0 bar", delta: "-3.0 bar" },
              { id: "INSP-04", lim: "12.0 bar", delta: "RE-CERTIFY" },
            ].map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-3 border-b border-white/10 px-3 py-2 last:border-b-0"
              >
                <span className="text-white">{row.id}</span>
                <span className="text-neutral-400">{row.lim}</span>
                <span className="text-right text-[#DC2626]">{row.delta}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Pane A: Chronological Trace */}
      <div
        onClick={() => onSelectCallout("A")}
        className={`cursor-pointer lg:col-span-4 ${panelClass("A")}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <span className="font-mono-code text-[12px] text-neutral-300">
            Execution Trace Log
          </span>
          <CalloutPin letter="A" active={activeCallout === "A"} onClick={() => onSelectCallout("A")} />
        </div>

        <div className="mt-3 space-y-2 font-mono-code text-[11px]">
          {[
            { step: "01", agent: "ExtractionAgent", rule: "RULE_LLM_EXTRACT" },
            { step: "02", agent: "ReconciliationAgent", rule: "RULE_UNIT_CONFLICT" },
            { step: "03", agent: "ImpactAgent", rule: "RULE_BFS_BLAST_RADIUS" },
            { step: "04", agent: "AuditorAgent", rule: "RULE_AUDIT_REJECT_UNGROUNDED", bad: true },
          ].map((item) => (
            <div key={item.step} className="border border-white/15 bg-black p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">
                  {item.step} · {item.agent}
                </span>
                <span className={item.bad ? "text-[#DC2626]" : "text-neutral-200"}>
                  {item.bad ? "REJECTED" : "OK"}
                </span>
              </div>
              <div className="mt-1 text-neutral-500">{item.rule}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pane B: HTTP 409 Sign-Off Gate */}
      <div
        onClick={() => onSelectCallout("B")}
        className={`cursor-pointer lg:col-span-4 ${panelClass("B")}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <span className="font-mono-code text-[12px] text-neutral-300">
            Sign-Off Gate Control
          </span>
          <CalloutPin letter="B" active={activeCallout === "B"} onClick={() => onSelectCallout("B")} />
        </div>

        <div className="mt-3 space-y-3 font-mono-code text-[12px]">
          <motion.div
            animate={
              flash409 && !reducedMotion
                ? { x: [0, -6, 6, -4, 4, 0] }
                : { x: 0 }
            }
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className={`border p-3.5 transition-[border-color,background-color] duration-150 ease-out ${
              flash409
                ? "border-[#DC2626] bg-[#DC2626]/15"
                : "border-[#DC2626]/80 bg-black"
            }`}
          >
            <div className="flex items-center justify-between text-[#DC2626]">
              <span>HTTP 409 // SIGN-OFF BLOCKED</span>
              {flash409 && <span>REJECTED</span>}
            </div>
            <div className="mt-1.5 text-neutral-300">
              6 OPEN CONFLICTS remain unresolved.
            </div>
          </motion.div>

          <button
            type="button"
            onClick={triggerPrematureSignoffTest}
            className="w-full border border-white/30 bg-black px-3 py-2 text-center text-xs font-medium text-white transition-[background-color,color,border-color] duration-150 ease-out hover:border-white hover:bg-white hover:text-black"
          >
            Test Premature Sign-Off
          </button>

          <div className="border border-white/20 bg-black p-3">
            <div className="text-[11px] text-neutral-400">AFTER ENGINEER RESOLUTION</div>
            <div className="mt-1 text-white">0 OPEN CONFLICTS · UNLOCKED</div>
          </div>
        </div>
      </div>

      {/* Pane C: Immutable Decision Receipt */}
      <div
        onClick={() => onSelectCallout("C")}
        className={`cursor-pointer lg:col-span-4 ${panelClass("C")}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <span className="font-mono-code text-[12px] text-neutral-300">
            Approval Audit Receipt
          </span>
          <CalloutPin letter="C" active={activeCallout === "C"} onClick={() => onSelectCallout("C")} />
        </div>

        <div className="mt-3 border border-white/15 bg-black p-3.5 font-mono-code text-[11px] leading-relaxed">
          <div className="text-neutral-400">POST /api/runs/run_5ac3/sign-off</div>
          <div className="mt-2 text-neutral-200">status: 200 OK</div>
          <div className="text-neutral-200">signed_off: true</div>
          <div className="text-neutral-400">rule_id: RULE_ECO_SIGNOFF</div>
          <div className="mt-2 border-t border-white/10 pt-2 text-neutral-300">
            "A. Sharma: All 6 conflicts resolved and downstream limits mitigated."
          </div>
        </div>
      </div>
    </div>
  );
}

function ChapterOneShowcase({ reducedMotion }: { reducedMotion: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(containerRef, { amount: 0.25 });
  const [scanStep, setScanStep] = useState<number>(0);
  const [autoPaused, setAutoPaused] = useState<boolean>(false);

  const auditRows = [
    {
      id: "span_8a41c2d0",
      doc: "doc4_maint_log.md",
      lineIdx: 1,
      span: "[512:519]",
      excerpt: "175 psi [512:519]",
      hash: "9f4b2c8e1d7a...a730",
      status: "Verified",
      rejected: false,
    },
    {
      id: "span_3f19b04a",
      doc: "doc3_pump_spec_revB.md",
      lineIdx: 2,
      span: "[418:426]",
      excerpt: "10.0 bar [418:426]",
      hash: "4c10e771f28b...91d2",
      status: "Verified",
      rejected: false,
    },
    {
      id: "span_71c0e82b",
      doc: "doc5_valve_sop_insp.md",
      lineIdx: 3,
      span: "[310:323]",
      excerpt: "12.0 bar MAWP [310:323]",
      hash: "b291fa08c304...e41c",
      status: "Verified",
      rejected: false,
    },
    {
      id: "span_ungrounded",
      doc: "unanchored_output",
      lineIdx: -1,
      span: "NONE",
      excerpt: "no verbatim source slice",
      hash: "NO MATCH IN CORPUS",
      status: "Rejected",
      rejected: true,
    },
  ];

  useEffect(() => {
    if (reducedMotion || !inView || autoPaused) return;
    const timer = window.setInterval(() => {
      setScanStep((prev) => (prev + 1) % 3);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [reducedMotion, inView, autoPaused]);

  const docLines = [
    { num: "013", text: "- Observed Asset Tag: P101 rev. 2", span: "[458:488]", slice: null },
    {
      num: "015",
      text: "- Field Discharge Pressure: ",
      slice: "175 psi",
      span: "[512:519]",
    },
    {
      num: "016",
      text: "- Spec Rev B Discharge Rating: ",
      slice: "10.0 bar",
      span: "[418:426]",
    },
    {
      num: "017",
      text: "- V-12 Check Valve Limit: ",
      slice: "12.0 bar MAWP",
      span: "[310:323]",
    },
  ];

  const activeClaim = auditRows[scanStep];
  const isRejectedSelected = activeClaim.rejected;

  return (
    <div ref={containerRef} className="border border-white/15 bg-[#0B0B0C]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/12 px-5 py-3 font-mono-code text-xs text-neutral-400">
        <span>PLANT LINE-4 // SPAN EXTRACTION STREAM</span>
        <div className="flex items-center gap-3">
          <span>{activeClaim.doc} · SHA-256 VERIFIER</span>
          {autoPaused && (
            <button
              type="button"
              onClick={() => setAutoPaused(false)}
              className="border border-white/25 bg-black px-2 py-0.5 text-[11px] text-white transition-[background-color,color] duration-150 ease-out hover:bg-white hover:text-black"
            >
              Resume scan
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-white/12 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left: Source Document Viewer */}
        <div className="p-5 sm:p-7 lg:col-span-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono-code text-xs text-neutral-400">
            <span>SOURCE DOCUMENT</span>
            <span className={isRejectedSelected ? "text-[#DC2626]" : "text-neutral-300"}>
              {isRejectedSelected
                ? "OFFSET NONE"
                : `CURSOR OFFSET ${activeClaim.span}`}
            </span>
          </div>

          {isRejectedSelected && (
            <div className="mb-3 border border-[#DC2626] bg-[#DC2626]/10 px-3 py-2 font-mono-code text-xs text-[#DC2626]">
              REJECTED // NO EXACT BYTE MATCH IN CORPUS
            </div>
          )}

          <div className="space-y-1.5 border border-white/12 bg-black p-4 font-mono-code text-[13px]">
            {docLines.map((line, idx) => {
              const isScanned = !isRejectedSelected && idx === activeClaim.lineIdx;
              return (
                <div
                  key={line.num}
                  className={`flex items-center justify-between gap-3 px-2.5 py-2 transition-[background-color,border-color] duration-200 ease-out ${
                    isScanned
                      ? "border-l-2 border-white bg-white/[0.08] text-white"
                      : "border-l-2 border-transparent text-neutral-500"
                  }`}
                >
                  <span className="truncate">
                    <span className="mr-3 text-neutral-600">{line.num}</span>
                    <span>{line.text}</span>
                    {line.slice && (
                      <span
                        className={
                          isScanned
                            ? "border border-white bg-white/15 px-1.5 py-0.5 text-white"
                            : "text-neutral-400"
                        }
                      >
                        {line.slice}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-neutral-400">{line.span}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border border-white/12 bg-black px-4 py-2.5 font-mono-code text-xs">
            <span className="text-neutral-400">
              {isRejectedSelected ? "SHA-256 verification" : "SHA-256 digest check"}
            </span>
            <span className={isRejectedSelected ? "text-[#DC2626]" : "text-white"}>
              {isRejectedSelected ? "FAILED · UNGROUNDED" : activeClaim.hash}
            </span>
          </div>
        </div>

        {/* Right: Clickable Anchored Claim Ledger */}
        <div className="p-5 sm:p-7 lg:col-span-6">
          <div className="mb-3 flex items-center justify-between font-mono-code text-xs text-neutral-400">
            <span>PROVENANCE LEDGER (CLICK ROW TO INSPECT)</span>
            <span>3 VERIFIED · 1 REJECTED</span>
          </div>

          <div className="border border-white/12 bg-black font-mono-code text-xs">
            {auditRows.map((row, idx) => {
              const isSelected = idx === scanStep;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setAutoPaused(true);
                    setScanStep(idx);
                  }}
                  className={`grid w-full grid-cols-12 items-center gap-2 border-b border-white/10 px-4 py-3 text-left transition-[background-color,border-color] duration-150 ease-out last:border-b-0 ${
                    isSelected
                      ? "border-l-2 border-l-white bg-white/[0.06]"
                      : "border-l-2 border-l-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="col-span-4 truncate text-neutral-200">{row.id}</span>
                  <span
                    className={`col-span-5 truncate ${
                      row.rejected ? "text-neutral-500 line-through" : "text-neutral-400"
                    }`}
                  >
                    {row.excerpt}
                  </span>
                  <span
                    className={`col-span-3 text-right font-medium ${
                      row.rejected ? "text-[#DC2626]" : "text-white"
                    }`}
                  >
                    {row.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChapterTwoTopology({ reducedMotion }: { reducedMotion: boolean }) {
  const [proposedBar, setProposedBar] = useState<number>(14.0);

  const hop1Nodes = [
    { y: 14, id: "V-12", sub: "Isolation Valve", rated: 12.0, path: "M210 155 L340 155 L340 54 L410 54" },
    { y: 115, id: "PRV-04", sub: "Relief Valve", rated: 11.5, path: "M210 155 L410 155" },
    { y: 216, id: "SOP-7", sub: "Shutdown Interlock", rated: 11.0, path: "M210 155 L340 155 L340 256 L410 256" },
  ];

  const inspRated = 12.0;
  const inspMargin = inspRated - proposedBar;
  const inspBreached = inspMargin < 0;

  const breachedCount =
    hop1Nodes.filter((n) => n.rated - proposedBar < 0).length + (inspBreached ? 1 : 0);

  const formatMargin = (margin: number) => {
    const rounded = Math.round(margin * 10) / 10;
    return rounded >= 0 ? `+${rounded.toFixed(1)} bar OK` : `${rounded.toFixed(1)} bar`;
  };

  return (
    <div className="border border-white/15 bg-[#0B0B0C]">
      {/* Interactive Monochrome Pressure Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/12 px-5 py-3.5 font-mono-code text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-neutral-400">PROPOSED P-101 PRESSURE</span>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={9.0}
              max={15.5}
              step={0.5}
              value={proposedBar}
              aria-label="Proposed P-101 discharge pressure in bar"
              onChange={(e) => setProposedBar(Number.parseFloat(e.target.value))}
              className="rg-range-slider w-32 sm:w-44"
            />
            <span className="w-16 text-right text-white">{proposedBar.toFixed(1)} bar</span>
          </div>

          <div className="flex items-center gap-1.5">
            {[10.0, 11.5, 14.0].map((preset) => {
              const active = Math.abs(proposedBar - preset) < 0.01;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setProposedBar(preset)}
                  className={`border px-2 py-1 text-[11px] transition-[background-color,color,border-color] duration-150 ease-out ${
                    active
                      ? "border-white bg-white text-black"
                      : "border-white/25 bg-black text-neutral-300 hover:border-white"
                  }`}
                >
                  {preset.toFixed(1)} bar
                </button>
              );
            })}
          </div>
        </div>

        <span className={breachedCount > 0 ? "text-[#DC2626]" : "text-white"}>
          {breachedCount} {breachedCount === 1 ? "LIMIT" : "LIMITS"} EXCEEDED
        </span>
      </div>

      <div className="p-4 sm:p-8">
        <svg
          viewBox="0 0 920 310"
          className="h-auto w-full select-none"
          role="img"
          aria-label="Interactive Plant Line-4 blast radius topology"
        >
          {/* Base Static Edges */}
          <g stroke="rgba(255,255,255,0.16)" strokeWidth="1.25" fill="none">
            {hop1Nodes.map((n) => (
              <path key={`base-${n.id}`} d={n.path} />
            ))}
            <path d="M620 54 L665 54 L665 155 L700 155" />
            <path d="M620 155 L700 155" />
            <path d="M620 256 L665 256 L665 155" />
          </g>

          {/* Animated Blast-Radius Trace Edges on Breached Paths */}
          {hop1Nodes.map((n) => {
            const breached = n.rated - proposedBar < 0;
            if (!breached) return null;
            return (
              <path
                key={`trace-${n.id}`}
                d={n.path}
                stroke="#DC2626"
                strokeWidth="1.5"
                fill="none"
                className={reducedMotion ? undefined : "rg-trace-line"}
              />
            );
          })}

          {inspBreached && (
            <path
              d="M620 155 L700 155"
              stroke="#DC2626"
              strokeWidth="1.5"
              fill="none"
              className={reducedMotion ? undefined : "rg-trace-line"}
            />
          )}

          {/* Relation Labels */}
          <text x="230" y="144" fill="#737373" fontSize="10" fontFamily="JetBrains Mono, monospace">
            CONNECTS_TO
          </text>
          <text x="230" y="244" fill="#737373" fontSize="10" fontFamily="JetBrains Mono, monospace">
            GOVERNED_BY
          </text>
          <text x="630" y="144" fill="#737373" fontSize="10" fontFamily="JetBrains Mono, monospace">
            INSP
          </text>

          {/* Hop 0: P-101 */}
          <g>
            <rect x="20" y="105" width="190" height="100" fill="#000000" stroke="#FFFFFF" strokeWidth="1.25" />
            <text x="36" y="132" fill="#A3A3A3" fontSize="10.5" fontFamily="JetBrains Mono, monospace">
              HOP 0 · SOURCE
            </text>
            <text x="36" y="158" fill="#FFFFFF" fontSize="16" fontWeight="500" fontFamily="JetBrains Mono, monospace">
              P-101
            </text>
            <text x="36" y="184" fill="#D4D4D4" fontSize="12" fontFamily="JetBrains Mono, monospace">
              ECO {proposedBar.toFixed(1)} bar
            </text>
          </g>

          {/* Hop 1 Nodes */}
          {hop1Nodes.map((node) => {
            const margin = node.rated - proposedBar;
            const breached = margin < 0;
            return (
              <g key={node.id}>
                <rect
                  x="410"
                  y={node.y}
                  width="210"
                  height="80"
                  fill="#000000"
                  stroke={breached ? "#DC2626" : "rgba(255,255,255,0.28)"}
                  strokeWidth="1.25"
                />
                <text x="426" y={node.y + 24} fill="#FFFFFF" fontSize="14" fontFamily="JetBrains Mono, monospace">
                  {node.id}
                </text>
                <text x="498" y={node.y + 24} fill="#737373" fontSize="10.5" fontFamily="Inter, sans-serif">
                  {node.sub}
                </text>
                <text x="426" y={node.y + 52} fill="#A3A3A3" fontSize="11.5" fontFamily="JetBrains Mono, monospace">
                  Rated {node.rated.toFixed(1)}
                </text>
                <text
                  x="530"
                  y={node.y + 52}
                  fill={breached ? "#DC2626" : "#D4D4D4"}
                  fontSize="11.5"
                  fontWeight="600"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatMargin(margin)}
                </text>
              </g>
            );
          })}

          {/* Hop 2: INSP-04 */}
          <g>
            <rect
              x="700"
              y="105"
              width="200"
              height="100"
              fill="#000000"
              stroke={inspBreached ? "#DC2626" : "rgba(255,255,255,0.28)"}
              strokeWidth="1.25"
            />
            <text x="716" y="132" fill="#A3A3A3" fontSize="10.5" fontFamily="JetBrains Mono, monospace">
              HOP 2 · COMPLIANCE
            </text>
            <text x="716" y="158" fill="#FFFFFF" fontSize="15" fontFamily="JetBrains Mono, monospace">
              INSP-04
            </text>
            <text
              x="716"
              y="184"
              fill={inspBreached ? "#DC2626" : "#D4D4D4"}
              fontSize="12"
              fontWeight="600"
              fontFamily="JetBrains Mono, monospace"
            >
              12.0 · {formatMargin(inspMargin)}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}

function ChapterThreeBenchmark() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const [selectedMetricIdx, setSelectedMetricIdx] = useState<number>(0);

  const selectedMetric = BENCHMARK_METRICS[selectedMetricIdx];

  const chartBars = [
    {
      name: "Naive RAG",
      val: selectedMetric.rag,
      pct: Math.round(selectedMetric.rag * 100),
      barClass: "bg-neutral-600",
      textClass: "text-neutral-400",
    },
    {
      name: "Static Graph",
      val: selectedMetric.graph,
      pct: Math.round(selectedMetric.graph * 100),
      barClass: "bg-neutral-400",
      textClass: "text-neutral-300",
    },
    {
      name: "ReconcileGraph",
      val: selectedMetric.ours,
      pct: Math.round(selectedMetric.ours * 100),
      barClass: "bg-white",
      textClass: "text-white",
    },
  ];

  return (
    <div ref={ref} className="space-y-8">
      <div className="border border-white/15 bg-[#0B0B0C]">
        {/* Top Architectural KPI Band (3-Column Visual Summary) */}
        <div className="grid grid-cols-1 divide-y divide-white/12 border-b border-white/12 md:grid-cols-3 md:divide-x md:divide-y-0">
          {BENCHMARK_SUMMARY.map((sys) => (
            <div
              key={sys.name}
              className={`p-6 sm:p-7 ${
                sys.highlight
                  ? "border-white/25 bg-white/[0.04]"
                  : "bg-black/40"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-neutral-400">{sys.name}</span>
                {sys.delta && (
                  <span className="font-mono-code text-xs text-[#10B981]">
                    {sys.delta}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline gap-3">
                <span
                  className={`font-mono-code text-4xl font-light ${
                    sys.highlight
                      ? "text-white"
                      : sys.pct >= 50
                        ? "text-neutral-300"
                        : "text-neutral-400"
                  }`}
                >
                  {sys.pct}%
                </span>
                <span className="font-mono-code text-sm text-neutral-500">
                  ({sys.score})
                </span>
              </div>

              <div className="mt-4 h-[3px] w-full bg-white/10">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: inView ? `${sys.pct}%` : "0%" }}
                  transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                  className={
                    sys.highlight
                      ? "h-full bg-white"
                      : sys.pct >= 50
                        ? "h-full bg-neutral-400"
                        : "h-full bg-neutral-600"
                  }
                />
              </div>
            </div>
          ))}
        </div>

        {/* Main Interactive Split Visual */}
        <div className="grid grid-cols-1 divide-y divide-white/12 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
          {/* Left: Clean 6-Metric Selector List */}
          <div className="divide-y divide-white/10 lg:col-span-5">
            {BENCHMARK_METRICS.map((row, idx) => {
              const isSelected = idx === selectedMetricIdx;
              return (
                <button
                  key={row.label}
                  type="button"
                  onMouseEnter={() => setSelectedMetricIdx(idx)}
                  onFocus={() => setSelectedMetricIdx(idx)}
                  onClick={() => setSelectedMetricIdx(idx)}
                  className={`flex w-full items-center justify-between gap-4 border-l-2 px-5 py-4 text-left transition-[background-color,border-color] duration-150 ease-out ${
                    isSelected
                      ? "border-l-white bg-white/[0.04]"
                      : "border-l-transparent hover:bg-white/[0.02]"
                  }`}
                >
                  <span
                    className={`text-sm ${
                      isSelected ? "font-medium text-white" : "text-neutral-400"
                    }`}
                  >
                    {row.label}
                  </span>

                  <span className="shrink-0 font-mono-code text-xs">
                    <span className={isSelected ? "text-white" : "text-neutral-300"}>
                      {row.ours.toFixed(2)}
                    </span>
                    <span className="mx-1.5 text-neutral-600">vs</span>
                    <span className="text-neutral-500">{row.rag.toFixed(2)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Live Comparative Bar Chart + Why It Matters */}
          <div className="flex flex-col justify-between bg-black p-6 sm:p-8 lg:col-span-7">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-medium text-white">
                  {selectedMetric.label}
                </span>
                <span className="font-mono-code text-xs text-neutral-500">
                  METRIC {selectedMetricIdx + 1} OF {BENCHMARK_METRICS.length}
                </span>
              </div>

              {/* Vertical Bar Chart with 0%..100% Gridlines */}
              <div className="relative mt-8 h-56 border-b border-white/20 pl-10">
                {[100, 75, 50, 25, 0].map((tick) => (
                  <div
                    key={tick}
                    style={{ bottom: `${tick}%` }}
                    className="pointer-events-none absolute right-0 left-0 flex items-center"
                  >
                    <span className="w-10 -translate-x-0 font-mono-code text-[11px] text-neutral-600">
                      {tick}%
                    </span>
                    <div className="h-[1px] flex-1 bg-white/[0.08]" />
                  </div>
                ))}

                <div className="relative z-10 grid h-full grid-cols-3 items-end gap-6 px-4 sm:gap-10 sm:px-8">
                  {chartBars.map((bar) => (
                    <div key={bar.name} className="flex h-full flex-col justify-end">
                      <div className={`mb-2 text-center font-mono-code text-lg ${bar.textClass}`}>
                        {bar.pct}%
                      </div>
                      <motion.div
                        initial={{ height: "0%" }}
                        animate={{ height: inView ? `${Math.max(bar.pct, 2)}%` : "0%" }}
                        transition={{ type: "spring", stiffness: 170, damping: 24 }}
                        className={`w-full ${bar.barClass}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-6 pl-10 pr-4 text-center font-mono-code text-xs text-neutral-400 sm:gap-10 sm:pr-8">
                {chartBars.map((bar) => (
                  <span key={bar.name} className={bar.name === "ReconcileGraph" ? "text-white" : ""}>
                    {bar.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Why It Matters Engineering Callout */}
            <div className="mt-7 border-t border-white/12 pt-4">
              <div className="font-mono-code text-xs text-neutral-500">WHY IT MATTERS</div>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-200">
                {selectedMetric.note}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4-Column Architecture Strip */}
      <div className="grid grid-cols-1 border-t border-b border-white/15 md:grid-cols-4 md:divide-x md:divide-white/15">
        {ARCHITECTURE_FOOTER_STRIP.map((item) => (
          <div
            key={item.label}
            className="border-b border-white/15 py-6 last:border-b-0 md:border-b-0 md:px-6 md:first:pl-0 md:last:pr-0"
          >
            <div className="text-sm text-neutral-500">{item.label}</div>
            <div className="mt-2 font-mono-code text-sm text-white">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScrollExpandingInterlude({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });
  const clipPath = useTransform(
    smooth,
    [0, 1],
    ["inset(6% 7% 6% 7%)", "inset(0% 0% 0% 0%)"]
  );
  const imageScale = useTransform(smooth, [0, 1], [1.14, 1.0]);

  return (
    <section ref={ref} className="bg-black py-12 md:py-20">
      <div className="mx-auto max-w-[1380px] px-5 sm:px-10">
        <motion.div
          style={reducedMotion ? undefined : { clipPath }}
          className="relative h-[52vh] w-full overflow-hidden rounded-none border border-white/15 md:h-[68vh]"
        >
          <motion.img
            src="/images/piping-valves.jpg"
            alt="Industrial stainless steel control valves and flanged process piping"
            style={reducedMotion ? undefined : { scale: imageScale }}
            className="rg-photo-feature h-full w-full object-cover object-center"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.34) 48%, rgba(0,0,0,0.12) 100%)",
            }}
          />

          <div className="absolute right-6 bottom-6 left-6 z-10 max-w-2xl border-l border-white pl-4 sm:bottom-10 sm:left-10">
            <div className="font-mono-code text-xs tracking-[0.04em] text-neutral-300">
              PLANT LINE-4 · FEED &amp; RELIEF ARCHITECTURE
            </div>
            <p className="mt-2 text-base font-light leading-relaxed text-white sm:text-lg">
              One unverified pressure rating cascades across valves, interlocks, and certificates.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ScrollChapter({
  id,
  reducedMotion,
  header,
  zoomFrame = true,
  children,
}: {
  id?: string;
  reducedMotion: boolean;
  header: React.ReactNode;
  zoomFrame?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 0.55"],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 145, damping: 28, restDelta: 0.001 });
  const headerY = useTransform(smooth, [0, 1], [32, 0]);
  const headerOpacity = useTransform(smooth, [0, 1], [0.35, 1]);
  const frameScale = useTransform(smooth, [0, 1], [0.92, 1]);
  const frameClip = useTransform(
    smooth,
    [0, 1],
    ["inset(3% 3% 0% 3%)", "inset(0% 0% 0% 0%)"]
  );

  return (
    <div id={id} ref={ref} className="border-t border-white/15 pt-12">
      <motion.div style={reducedMotion ? undefined : { y: headerY, opacity: headerOpacity }}>
        {header}
      </motion.div>

      <motion.div
        style={
          reducedMotion
            ? undefined
            : zoomFrame
              ? { scale: frameScale, clipPath: frameClip }
              : { scale: frameScale }
        }
        className="origin-center"
      >
        {children}
      </motion.div>
    </div>
  );
}

function ArchitecturalFilmstrip({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 });
  const clipPath = useTransform(
    smooth,
    [0, 1],
    ["inset(7% 6% 7% 6%)", "inset(0% 0% 0% 0%)"]
  );
  const imageScale = useTransform(smooth, [0, 1], [1.18, 1.02]);

  return (
    <div ref={ref} className="py-2">
      <motion.div
        style={reducedMotion ? undefined : { clipPath }}
        className="relative h-[28vh] w-full overflow-hidden rounded-none border border-white/15 bg-black md:h-[36vh]"
      >
        <motion.img
          src="/images/control-engineering.jpg"
          alt="Industrial power and turbine engineering hall"
          style={reducedMotion ? undefined : { scale: imageScale }}
          className="rg-photo-backdrop h-full w-full object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.75) 100%)",
          }}
        />
        <div className="relative z-10 flex h-full items-end justify-between p-5 sm:p-8">
          <div className="border-l border-white pl-4">
            <div className="font-mono-code text-xs tracking-[0.04em] text-neutral-300">
              LOCAL-FIRST DEPLOYMENT · ZERO EXTERNAL DATA EGRESS REQUIRED
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ShowcasePanelCard({
  tabConfig,
  activeCallout,
  onSelectCallout,
  tab1Resolved,
  onSetTab1Resolved,
  reducedMotion,
  compact = false,
}: {
  tabConfig: ShowcaseTabConfig;
  activeCallout: CalloutKey;
  onSelectCallout: (key: CalloutKey) => void;
  tab1Resolved: boolean;
  onSetTab1Resolved: (val: boolean) => void;
  reducedMotion: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      <div
        className={`rounded-[2px] border border-black/15 bg-[#09090B] text-white ${
          compact ? "min-h-[410px]" : "min-h-[460px]"
        }`}
      >
        {/* Application Window Chrome */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-black px-5 py-2.5">
          <span className="font-mono-code text-xs text-neutral-300">
            {tabConfig.windowTitle}
          </span>
          <span className="font-mono-code text-xs text-neutral-400">
            {tabConfig.id === "workspace"
              ? tab1Resolved
                ? "ECO-01 · 5 OPEN CONFLICTS"
                : "ECO-01 · 6 OPEN CONFLICTS"
              : tabConfig.windowStatus}
          </span>
        </div>

        <div className={compact ? "p-4" : "p-4 sm:p-6"}>
          <ProductViewportContent
            tab={tabConfig.id}
            activeCallout={activeCallout}
            onSelectCallout={onSelectCallout}
            tab1Resolved={tab1Resolved}
            onSetTab1Resolved={onSetTab1Resolved}
            reducedMotion={reducedMotion}
          />
        </div>
      </div>

      {/* Bottom 3-Column A / B / C Selector Strip */}
      <div
        className={`grid grid-cols-1 border-t border-b border-black/10 md:grid-cols-3 md:divide-x md:divide-black/10 ${
          compact ? "mt-4" : "mt-6"
        }`}
      >
        {tabConfig.callouts.map((callout) => {
          const active = callout.key === activeCallout;
          return (
            <button
              key={callout.key}
              type="button"
              onClick={() => onSelectCallout(callout.key)}
              className={`relative border-b border-black/10 text-left transition-[background-color,opacity] duration-150 ease-out last:border-b-0 md:border-b-0 ${
                compact ? "p-4" : "p-6"
              } ${
                active ? "bg-[#F5F5F7] opacity-100" : "bg-white opacity-65 hover:opacity-100"
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 right-0 left-0 h-[2px] bg-black"
                />
              )}
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-[2px] font-mono-code text-xs font-semibold ${
                    active
                      ? "bg-black text-white"
                      : "border border-black/20 text-neutral-700"
                  }`}
                >
                  {callout.key}
                </span>
                <span className="text-sm font-medium text-black sm:text-base">
                  {callout.title}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {callout.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LandingScreen({ onEnter, isExiting = false }: LandingScreenProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ShowcaseTabId>("workspace");
  const [scrollActivePanel, setScrollActivePanel] = useState<number>(0);
  const [calloutByTab, setCalloutByTab] = useState<Record<ShowcaseTabId, CalloutKey>>({
    workspace: "A",
    logic: "A",
    audit: "A",
  });
  const [tab1Resolved, setTab1Resolved] = useState<boolean>(false);

  const triggeredRef = useRef<boolean>(false);
  const heroRef = useRef<HTMLElement | null>(null);
  const statementRef = useRef<HTMLElement | null>(null);
  const platformTrackRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef<HTMLElement | null>(null);

  // Hero dual-layer parallax
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const smoothHeroScroll = useSpring(heroScroll, { stiffness: 120, damping: 24, mass: 0.3 });
  const heroPhotoScale = useTransform(smoothHeroScroll, [0, 1], [1.03, 1.15]);
  const heroPhotoY = useTransform(smoothHeroScroll, [0, 1], [0, 90]);
  const heroBgScale = useTransform(smoothHeroScroll, [0, 1], [1, 1.08]);
  const heroTextY = useTransform(smoothHeroScroll, [0, 1], [0, -55]);
  const heroTextOpacity = useTransform(smoothHeroScroll, [0, 0.78], [1, 0.15]);

  // Statement word illumination
  const { scrollYProgress: statementScroll } = useScroll({
    target: statementRef,
    offset: ["start 0.85", "end 0.42"],
  });
  const smoothStatementScroll = useSpring(statementScroll, {
    stiffness: 110,
    damping: 26,
    mass: 0.35,
  });

  // Band 3 Apple-style sticky horizontal showcase scroll
  const { scrollYProgress: platformScroll } = useScroll({
    target: platformTrackRef,
    offset: ["start 64px", "end end"],
  });
  const smoothPlatformScroll = useSpring(platformScroll, {
    stiffness: 140,
    damping: 26,
    mass: 0.35,
  });
  const trackX = useTransform(smoothPlatformScroll, [0, 1], ["0%", "-66.6667%"]);

  const panel0Scale = useTransform(smoothPlatformScroll, [0, 0.5, 1], [1, 0.96, 0.96]);
  const panel0Opacity = useTransform(smoothPlatformScroll, [0, 0.5, 1], [1, 0.65, 0.65]);
  const panel1Scale = useTransform(smoothPlatformScroll, [0, 0.5, 1], [0.96, 1, 0.96]);
  const panel1Opacity = useTransform(smoothPlatformScroll, [0, 0.5, 1], [0.65, 1, 0.65]);
  const panel2Scale = useTransform(smoothPlatformScroll, [0, 0.5, 1], [0.96, 0.96, 1]);
  const panel2Opacity = useTransform(smoothPlatformScroll, [0, 0.5, 1], [0.65, 0.65, 1]);

  useMotionValueEvent(smoothPlatformScroll, "change", (latest) => {
    const idx = latest < 0.33 ? 0 : latest < 0.66 ? 1 : 2;
    setScrollActivePanel((prev) => (prev === idx ? prev : idx));
  });

  // Band 5 closing typographic assembly
  const { scrollYProgress: closingScroll } = useScroll({
    target: closingRef,
    offset: ["start end", "end end"],
  });
  const smoothClosingScroll = useSpring(closingScroll, {
    stiffness: 130,
    damping: 26,
    restDelta: 0.001,
  });
  const closingLine1X = useTransform(smoothClosingScroll, [0, 1], [-24, 0]);
  const closingLine2X = useTransform(smoothClosingScroll, [0, 1], [24, 0]);
  const closingOpacity = useTransform(smoothClosingScroll, [0, 1], [0.2, 1]);

  const triggerEnter = useCallback(() => {
    if (triggeredRef.current || isExiting) return;
    triggeredRef.current = true;
    onEnter();
  }, [isExiting, onEnter]);

  useEffect(() => {
    if (isExiting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "BUTTON" ||
        tag === "A" ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      triggerEnter();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExiting, triggerEnter]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const currentTabConfig =
    SHOWCASE_TABS.find((t) => t.id === activeTab) ?? SHOWCASE_TABS[0];

  const handleSelectTab = (tabId: ShowcaseTabId) => {
    setActiveTab(tabId);
    setCalloutByTab((prev) => ({ ...prev, [tabId]: "A" }));
  };

  const handleSelectCalloutForTab = (tabId: ShowcaseTabId, key: CalloutKey) => {
    setCalloutByTab((prev) => ({ ...prev, [tabId]: key }));
  };

  const scrollToPanel = (panelIdx: number) => {
    const el = platformTrackRef.current;
    if (!el) return;
    const trackTop = el.getBoundingClientRect().top + window.scrollY;
    const startY = trackTop - 64;
    const endY = trackTop + el.offsetHeight - window.innerHeight;
    const ratio = panelIdx === 0 ? 0 : panelIdx === 1 ? 0.5 : 1;
    window.scrollTo({
      top: startY + (endY - startY) * ratio,
      behavior: "smooth",
    });
  };

  const panelTransforms = [
    { scale: panel0Scale, opacity: panel0Opacity },
    { scale: panel1Scale, opacity: panel1Opacity },
    { scale: panel2Scale, opacity: panel2Opacity },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`min-h-screen overflow-x-clip bg-black text-white transition-[opacity] duration-200 ease-out ${
          isExiting ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {/* 0. Minimal Fixed Navigation Bar (64px) */}
        <header
          className={`fixed top-0 right-0 left-0 z-50 h-16 transition-[background-color,border-color] duration-200 ease-out ${
            isScrolled
              ? "border-b border-white/12 bg-black/90 backdrop-blur-md"
              : "border-b border-transparent bg-transparent"
          }`}
        >
          <div className="mx-auto flex h-full max-w-[1380px] items-center justify-between gap-4 px-5 sm:px-10">
            <a
              href="#top"
              className="whitespace-nowrap text-lg font-medium tracking-[-0.02em] text-white"
            >
              ReconcileGraph
            </a>

            <nav className="hidden items-center gap-8 text-sm text-neutral-300 md:flex">
              <a
                href="#platform"
                className="whitespace-nowrap transition-colors duration-150 ease-out hover:text-white"
              >
                Platform
              </a>
              <a
                href="#capabilities"
                className="whitespace-nowrap transition-colors duration-150 ease-out hover:text-white"
              >
                Capabilities
              </a>
              <a
                href="#benchmarks"
                className="whitespace-nowrap transition-colors duration-150 ease-out hover:text-white"
              >
                Benchmarks
              </a>
            </nav>

            <button
              type="button"
              onClick={triggerEnter}
              className="whitespace-nowrap rounded-none border border-white px-4 py-2 text-sm font-normal text-white transition-[background-color,color] duration-150 ease-out hover:bg-white hover:text-black"
            >
              Launch workbench ↗
            </button>
          </div>
        </header>

        <main id="top">
          {/* 1. Band 1: Full-Viewport Cinematic Hero */}
          <section
            ref={heroRef}
            className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-black px-5 pt-28 pb-8 sm:px-10"
          >
            {/* Atmospheric Hero Photography Layer */}
            <motion.div
              style={reducedMotion ? undefined : { scale: heroPhotoScale, y: heroPhotoY }}
              className="pointer-events-none absolute inset-0 origin-center"
            >
              <img
                src="/images/hero-plant.jpg"
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover object-center opacity-35 grayscale contrast-125"
              />
            </motion.div>

            {/* Radial Dark Vignette for Crisp Typography Contrast */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 38% 48%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.78) 55%, rgba(0,0,0,0.94) 100%)",
              }}
            />

            <motion.div
              style={reducedMotion ? undefined : { scale: heroBgScale }}
              className="pointer-events-none absolute inset-0 origin-center"
            >
              <HeroDepthCanvas reducedMotion={reducedMotion} />
            </motion.div>

            <motion.div
              style={reducedMotion ? undefined : { y: heroTextY, opacity: heroTextOpacity }}
              className="relative z-10 mx-auto flex w-full max-w-[1380px] flex-1 flex-col justify-center py-12"
            >
              <p className="text-sm font-normal text-neutral-400">
                ReconcileGraph Platform
              </p>

              <h1 className="mt-5 max-w-[15ch] text-[clamp(3rem,7vw,6.25rem)] font-light leading-[1.02] tracking-[-0.04em] text-white">
                Integrate AI into industrial change verification.
              </h1>

              <p className="mt-7 max-w-xl text-lg font-light leading-relaxed text-neutral-400 md:text-xl">
                Reconcile fragmented plant records, trace blast radii, and gate every change on human proof.
              </p>

              <div className="mt-10">
                <button
                  type="button"
                  onClick={triggerEnter}
                  className="rounded-none bg-white px-8 py-4 text-sm font-medium text-black transition-[background-color] duration-150 ease-out hover:bg-neutral-200"
                >
                  Launch workbench →
                </button>
              </div>
            </motion.div>

            <div className="relative z-10 mx-auto flex w-full max-w-[1380px] items-center justify-between gap-4 border-t border-white/12 pt-5 text-sm text-neutral-400">
              <a
                href="#statement"
                className="inline-flex items-center gap-3 transition-colors duration-150 ease-out hover:text-white"
              >
                <span className="inline-block h-4 w-[1px] bg-white/40" />
                <span>Scroll to explore ↓</span>
              </a>
              <span className="hidden font-mono-code text-xs text-neutral-500 sm:inline">
                PLANT LINE-4 · DETERMINISTIC GUARDRAILS
              </span>
            </div>
          </section>

          {/* 2. Band 2: Kinetic Scroll-Reveal Statement */}
          <section
            id="statement"
            ref={statementRef}
            className="bg-[#0B0B0C] px-5 py-32 text-white sm:px-10 sm:py-44"
          >
            <div className="mx-auto max-w-[1380px]">
              <p className="max-w-[26ch] text-[clamp(2rem,4.8vw,4.25rem)] font-light leading-[1.1] tracking-[-0.03em]">
                {STATEMENT_WORDS.map((word, idx) => (
                  <ScrollWord
                    key={`${word}-${idx}`}
                    word={word}
                    index={idx}
                    total={STATEMENT_WORDS.length}
                    progress={smoothStatementScroll}
                  />
                ))}
              </p>
            </div>
          </section>

          {/* Scroll-Expanding Piping & Valves Photo Interlude */}
          <ScrollExpandingInterlude reducedMotion={reducedMotion} />

          {/* 3. Band 3: Apple-Style Scroll-Linked Horizontal Showcase */}
          <section id="platform" className="bg-white text-black">
            {/* Desktop Scroll-Linked Horizontal Track (hidden when reducedMotion or < lg) */}
            {!reducedMotion && (
              <div ref={platformTrackRef} className="relative hidden lg:block lg:h-[300vh]">
                <div className="sticky top-[64px] flex h-[calc(100vh-64px)] flex-col justify-center overflow-hidden">
                  {/* Top Mode Header Row */}
                  <div className="mx-auto mb-5 w-full max-w-[1380px] px-10">
                    <div className="flex items-end justify-between gap-6 border-b border-black/10">
                      <div className="flex items-center gap-8" role="tablist">
                        {SHOWCASE_TABS.map((tab, idx) => {
                          const active = scrollActivePanel === idx;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => scrollToPanel(idx)}
                              className={`relative pb-3.5 text-sm font-medium transition-colors duration-150 ease-out ${
                                active ? "text-black" : "text-neutral-400 hover:text-black"
                              }`}
                            >
                              <span className="mr-2 font-mono-code text-xs">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                              <span>{tab.label}</span>
                              {active && (
                                <motion.span
                                  layoutId="rg-horizontal-tab-underline"
                                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                  className="absolute right-0 bottom-0 left-0 h-[2px] bg-black"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <span className="pb-3.5 font-mono-code text-xs text-neutral-500">
                        {String(scrollActivePanel + 1).padStart(2, "0")} / 03 · SCROLL TO EXPLORE
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Motion Track */}
                  <motion.div
                    style={{ x: trackX }}
                    className="flex w-[300%] items-center will-change-transform"
                  >
                    {SHOWCASE_TABS.map((tab, idx) => (
                      <motion.div
                        key={tab.id}
                        style={panelTransforms[idx]}
                        className="w-1/3 shrink-0 px-6 md:px-12"
                      >
                        <div className="mx-auto max-w-[1380px]">
                          <ShowcasePanelCard
                            tabConfig={tab}
                            activeCallout={calloutByTab[tab.id]}
                            onSelectCallout={(key) => handleSelectCalloutForTab(tab.id, key)}
                            tab1Resolved={tab1Resolved}
                            onSetTab1Resolved={setTab1Resolved}
                            reducedMotion={reducedMotion}
                            compact
                          />
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              </div>
            )}

            {/* Mobile (< lg) & Reduced-Motion Clickable 3-Tab Fallback */}
            <div className={`px-5 py-24 sm:px-10 ${reducedMotion ? "block" : "lg:hidden"}`}>
              <div className="mx-auto max-w-[1380px]">
                <div className="flex flex-wrap items-end justify-between gap-6 border-b border-black/10">
                  <div className="flex flex-wrap items-center gap-6 sm:gap-8" role="tablist">
                    {SHOWCASE_TABS.map((tab, idx) => {
                      const active = tab.id === activeTab;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => handleSelectTab(tab.id)}
                          className={`relative pb-4 text-sm font-medium transition-colors duration-150 ease-out sm:text-base ${
                            active ? "text-black" : "text-neutral-500 hover:text-black"
                          }`}
                        >
                          <span className="mr-2 font-mono-code text-xs">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span>{tab.label}</span>
                          {active && (
                            <motion.span
                              layoutId="rg-showcase-tab-underline"
                              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                              className="absolute right-0 bottom-0 left-0 h-[2px] bg-black"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <span className="pb-4 font-mono-code text-xs text-neutral-500">
                    SELECT A / B / C TO INSPECT REGION
                  </span>
                </div>

                <div className="mt-8">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <ShowcasePanelCard
                        tabConfig={currentTabConfig}
                        activeCallout={calloutByTab[activeTab]}
                        onSelectCallout={(key) => handleSelectCalloutForTab(activeTab, key)}
                        tab1Resolved={tab1Resolved}
                        onSetTab1Resolved={setTab1Resolved}
                        reducedMotion={reducedMotion}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Band 4: Numbered 0.1 / 0.2 / 0.3 Full-Bleed Capability Chapters */}
          <section id="capabilities" className="bg-black px-5 py-32 text-white sm:px-10">
            <div className="mx-auto max-w-[1380px] space-y-32">
              {/* Chapter 0.1 */}
              <ScrollChapter
                reducedMotion={reducedMotion}
                header={
                  <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="font-mono-code text-2xl font-light text-neutral-400 lg:col-span-3">
                      0.1
                    </div>
                    <div className="lg:col-span-9">
                      <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-light leading-[1.06] tracking-[-0.035em] text-white">
                        Anchor every claim to verifiable source bytes.
                      </h2>
                      <p className="mt-3 max-w-xl text-base leading-relaxed text-neutral-400">
                        Every extracted value is sliced from source text and verified by SHA-256 hash.
                      </p>
                    </div>
                  </div>
                }
              >
                <ChapterOneShowcase reducedMotion={reducedMotion} />
              </ScrollChapter>

              {/* Chapter 0.2 */}
              <ScrollChapter
                reducedMotion={reducedMotion}
                header={
                  <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="font-mono-code text-2xl font-light text-neutral-400 lg:col-span-3">
                      0.2
                    </div>
                    <div className="lg:col-span-9">
                      <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-light leading-[1.06] tracking-[-0.035em] text-white">
                        Trace physical and compliance ripple effects before approval.
                      </h2>
                      <p className="mt-3 max-w-xl text-base leading-relaxed text-neutral-400">
                        Bounded multi-hop traversal evaluates proposed operating loads against downstream limits.
                      </p>
                    </div>
                  </div>
                }
              >
                <ChapterTwoTopology reducedMotion={reducedMotion} />
              </ScrollChapter>

              {/* Architectural Filmstrip Divider */}
              <ArchitecturalFilmstrip reducedMotion={reducedMotion} />

              {/* Chapter 0.3 */}
              <ScrollChapter
                id="benchmarks"
                reducedMotion={reducedMotion}
                zoomFrame={false}
                header={
                  <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="font-mono-code text-2xl font-light text-neutral-400 lg:col-span-3">
                      0.3
                    </div>
                    <div className="lg:col-span-9">
                      <h2 className="text-[clamp(2rem,4vw,3.5rem)] font-light leading-[1.06] tracking-[-0.035em] text-white">
                        Outperform retrieval-only RAG and static graphs on industrial audits.
                      </h2>
                      <p className="mt-3 max-w-xl text-base leading-relaxed text-neutral-400">
                        Evaluated across Plant Line-4 scenarios covering revisions, unit drift, and overloads.
                      </p>
                    </div>
                  </div>
                }
              >
                <ChapterThreeBenchmark />
              </ScrollChapter>
            </div>
          </section>

          {/* 5. Band 5: Monumental Kinetic Closing Band */}
          <section ref={closingRef} className="overflow-hidden bg-white px-5 pt-36 pb-12 text-black sm:px-10 sm:pt-44">
            <div className="mx-auto max-w-[1380px]">
              <h2 className="max-w-[14ch] text-[clamp(3.25rem,8vw,7.5rem)] font-light leading-[0.96] tracking-[-0.045em] text-black">
                <motion.span
                  style={
                    reducedMotion
                      ? undefined
                      : { x: closingLine1X, opacity: closingOpacity }
                  }
                  className="block"
                >
                  Verify now
                </motion.span>
                <motion.span
                  style={
                    reducedMotion
                      ? undefined
                      : { x: closingLine2X, opacity: closingOpacity }
                  }
                  className="block"
                >
                  with ReconcileGraph.
                </motion.span>
              </h2>

              <div className="mt-12 flex flex-wrap items-center gap-6">
                <button
                  type="button"
                  onClick={triggerEnter}
                  className="rounded-none bg-black px-9 py-4 text-sm font-medium text-white transition-[background-color] duration-150 ease-out hover:bg-neutral-800"
                >
                  Enter verification workbench →
                </button>
                <span className="font-mono-code text-sm text-neutral-500">
                  Press Enter to launch
                </span>
              </div>

              <footer className="mt-28 flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-6 text-sm text-neutral-500">
                <span className="font-medium text-black">ReconcileGraph</span>
                <span>Local-first industrial change verification</span>
              </footer>
            </div>
          </section>
        </main>
      </div>
    </MotionConfig>
  );
}
