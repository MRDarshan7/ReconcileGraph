import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileSearch,
  GitBranch,
  Lock,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";

interface LandingScreenProps {
  onEnter: () => void;
  isExiting?: boolean;
}

type SimStage = 0 | 1 | 2 | 3;

interface SimStageInfo {
  id: SimStage;
  code: string;
  label: string;
  ruleId: string;
  statusText: string;
  tone: "cyan" | "amber" | "crimson";
}

const SIM_STAGES: SimStageInfo[] = [
  {
    id: 0,
    code: "01",
    label: "Ingest & Anchor",
    ruleId: "RULE_SPAN_HASH_PROV",
    statusText: "3 records anchored · SHA-256 [char_start:char_end] verified",
    tone: "cyan",
  },
  {
    id: 1,
    code: "02",
    label: "Reconcile Units",
    ruleId: "RULE_UNIT_PINT",
    statusText: "P101 rev. 2 -> P-101 · 175 psi -> 12.07 bar != 10.0 bar spec",
    tone: "amber",
  },
  {
    id: 2,
    code: "03",
    label: "Blast Radius",
    ruleId: "RULE_BFS_BLAST_RADIUS",
    statusText: "Proposed 14.0 bar exceeds PRV-04 (11.5 bar) & V-12 (12.0 bar)",
    tone: "amber",
  },
  {
    id: 3,
    code: "04",
    label: "Auditor Gate",
    ruleId: "RULE_AUDIT_ESCALATE_CONFLICT",
    statusText: "AUDITOR GATE: ESCALATED · Sign-off locked (HTTP 409)",
    tone: "crimson",
  },
];

interface AgentShowcaseItem {
  id: string;
  step: string;
  name: string;
  shortName: string;
  tagline: string;
  guardrail: string;
  ruleIds: string[];
  description: string;
  traceTitle: string;
  traceLines: Array<{ key: string; value: string; accent?: "cyan" | "amber" | "emerald" | "crimson" }>;
}

const AGENT_SHOWCASE: AgentShowcaseItem[] = [
  {
    id: "extraction",
    step: "01",
    name: "Extraction Agent",
    shortName: "Extraction",
    tagline: "Proposes structured assertions; rejects unanchored text.",
    guardrail: "SHA-256 SpanVerifier",
    ruleIds: ["RULE_LLM_EXTRACT", "RULE_SPAN_ANCHOR_REJECT"],
    description:
      "Reads fragmented BOMs, multi-revision datasheets, field maintenance logs, and compliance records. Every extracted parameter must match a verbatim substring in the stored source record before entering the pipeline.",
    traceTitle: "PLANT LINE-4 // SPAN ANCHORING TRACE",
    traceLines: [
      { key: "source_doc", value: "doc4_maint_log.md (MNT-2026-09)" },
      { key: "excerpt", value: '"175 psi" -> offset [512 : 519]' },
      { key: "sha256_hash", value: "9f4b2c8e1d...a730 (MATCH)", accent: "cyan" },
      { key: "gate_outcome", value: "ANCHORED -> span_8a41c2d09e12", accent: "emerald" },
    ],
  },
  {
    id: "reconciliation",
    step: "02",
    name: "Reconciliation Agent",
    shortName: "Reconciliation",
    tagline: "Normalizes aliases, units, and revision precedence.",
    guardrail: "AliasResolver + Pint + RevisionComparator",
    ruleIds: ["RULE_ALIAS_NORM", "RULE_UNIT_PINT", "RULE_REV_PRECEDENCE", "RULE_BOUNDED_RETRY_1"],
    description:
      "Resolves field aliases to canonical tags, converts engineering units via Pint, excludes SUPERSEDED revisions, and triggers a bounded 2-attempt re-extraction loop whenever a required safety slot is missing.",
    traceTitle: "PLANT LINE-4 // UNIT & REVISION TRACE",
    traceLines: [
      { key: "alias_norm", value: '"P101 rev. 2" -> canonical P-101 (conf 1.0)', accent: "cyan" },
      { key: "rev_filter", value: "SPEC-P101-A (8.5 bar) -> SUPERSEDED EXCLUDED" },
      { key: "pint_convert", value: "175 psi -> 12.07 bar vs 10.0 bar SPEC-P101-B", accent: "amber" },
      { key: "bounded_retry", value: "vibration_baseline missing after 2 retries -> OPEN", accent: "amber" },
    ],
  },
  {
    id: "impact",
    step: "03",
    name: "Impact-Assessment Agent",
    shortName: "Impact BFS",
    tagline: "Traces bounded multi-hop physical & compliance blast radius.",
    guardrail: "Deterministic BFS (max_hops=3)",
    ruleIds: ["RULE_BFS_BLAST_RADIUS", "RULE_DOWNSTREAM_OVERLOAD"],
    description:
      "Traverses directed plant topology edges from the target asset across valves, relief headers, operating procedures, and inspection certificates to expose every downstream limit exceeded by the proposed ECO.",
    traceTitle: "PLANT LINE-4 // 3-HOP BLAST RADIUS",
    traceLines: [
      { key: "target_eco", value: "P-101 -> Centriflo-550 @ 14.0 bar" },
      { key: "hop_1_assets", value: "V-12 (12.0 bar MAWP) · PRV-04 (11.5 bar set)", accent: "amber" },
      { key: "hop_1_2_sop", value: "SOP-7 (11.0 bar shutdown interlock)", accent: "amber" },
      { key: "hop_2_3_cert", value: "INSP-04 (12.0 bar hydro test -> RE-CERTIFY)", accent: "crimson" },
    ],
  },
  {
    id: "auditor",
    step: "04",
    name: "Auditor Agent & Sign-Off Gate",
    shortName: "Auditor Gate",
    tagline: "Fail-closed verification; hard-locks approval until resolved.",
    guardrail: "Span Re-Check + HTTP 409 Sign-Off Lock",
    ruleIds: ["RULE_AUDIT_REJECT_UNGROUNDED", "RULE_DECISION_RECHECK", "RULE_ECO_SIGNOFF"],
    description:
      "Re-verifies every candidate finding's SHA-256 span hash, drops ungrounded claims immediately, and blocks ECO sign-off with HTTP 409 until an engineer resolves every open conflict with a recorded rationale.",
    traceTitle: "PLANT LINE-4 // FAIL-CLOSED AUDIT GATE",
    traceLines: [
      { key: "ungrounded_chk", value: "span_ungrounded_nonexistent -> REJECTED", accent: "crimson" },
      { key: "open_conflicts", value: "6 OPEN -> POST /sign-off returns HTTP 409", accent: "amber" },
      { key: "human_decision", value: "decision re-checks impact -> VERIFIED" },
      { key: "signoff_gate", value: "0 OPEN conflicts -> ECO APPROVED (HTTP 200)", accent: "emerald" },
    ],
  },
];

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

function useRevealOnScroll(reducedMotion: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState<boolean>(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.14 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return { ref, visible };
}

function BrandMark({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  return (
    <div
      className={`relative flex ${dim} shrink-0 items-center justify-center border border-white/15 bg-[#0E1219] text-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.12)]`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
        <circle cx="6" cy="12" r="2.2" className="fill-sky-400/20" />
        <circle cx="18" cy="6.5" r="2.2" className="fill-sky-400/20" />
        <circle cx="18" cy="17.5" r="2.2" className="fill-amber-400/25 stroke-amber-400" />
        <path d="M8.1 11L15.9 7.4M8.1 13L15.9 16.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function LiveOntologyVisualizer({ reducedMotion }: { reducedMotion: boolean }) {
  const [stage, setStage] = useState<SimStage>(1);
  const [userPaused, setUserPaused] = useState<boolean>(false);
  const [packetT, setPacketT] = useState<number>(0.45);

  useEffect(() => {
    if (reducedMotion || userPaused) return;
    const interval = window.setInterval(() => {
      setStage((prev) => ((prev + 1) % 4) as SimStage);
    }, 2900);
    return () => window.clearInterval(interval);
  }, [reducedMotion, userPaused]);

  useEffect(() => {
    if (reducedMotion) {
      setPacketT(0.5);
      return;
    }
    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) / 2200;
      setPacketT(elapsed % 1);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [reducedMotion]);

  const activeStage = SIM_STAGES[stage];

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const docPackets = [
    { x1: 118, y1: 68, x2: 196, y2: 146, offset: 0.0, color: "#38BDF8" },
    { x1: 118, y1: 152, x2: 196, y2: 152, offset: 0.33, color: "#F59E0B" },
    { x1: 118, y1: 236, x2: 196, y2: 158, offset: 0.66, color: "#38BDF8" },
  ];

  const dsPackets = [
    { x1: 294, y1: 144, x2: 374, y2: 68, offset: 0.1 },
    { x1: 294, y1: 152, x2: 374, y2: 152, offset: 0.4 },
    { x1: 294, y1: 160, x2: 374, y2: 236, offset: 0.7 },
  ];

  const p101Hot = stage === 1 || stage === 3;
  const downstreamHot = stage === 2 || stage === 3;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0E1219]/95 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
      {/* Top Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0B0F15] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38BDF8]" />
          <span className="font-mono-code text-[11px] font-semibold tracking-wider text-slate-300">
            PLANT LINE-4 // ONTOLOGY TOPOLOGY
          </span>
        </div>

        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono-code text-[10px] font-semibold transition-colors duration-300 ${
            stage === 3
              ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
              : stage >= 1
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-sky-500/30 bg-sky-500/10 text-sky-300"
          }`}
        >
          {stage === 3 ? (
            <>
              <Lock className="h-3 w-3" />
              AUDITOR GATE: ESCALATED
            </>
          ) : stage === 2 ? (
            <>
              <AlertTriangle className="h-3 w-3" />
              BLAST RADIUS: 4 LIMITS EXCEEDED
            </>
          ) : stage === 1 ? (
            <>
              <Scale className="h-3 w-3" />
              CONFLICT: 175 psi → 12.07 bar
            </>
          ) : (
            <>
              <ShieldCheck className="h-3 w-3" />
              SPAN VERIFIER: ACTIVE
            </>
          )}
        </div>
      </div>

      {/* Interactive SVG Blueprint Canvas */}
      <div className="relative bg-[#080B10] px-3 py-3">
        <div className="rg-dot-grid pointer-events-none absolute inset-0 opacity-45" />

        <svg
          viewBox="0 0 600 308"
          className="relative z-10 h-auto w-full select-none"
          role="img"
          aria-label="Live Plant Line-4 ontology reconciliation visualizer"
        >
          <defs>
            <filter id="rg-glow-cyan" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Column Labels */}
          <text x="16" y="24" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono, monospace" letterSpacing="1.2">
            SOURCE RECORDS
          </text>
          <text x="205" y="24" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono, monospace" letterSpacing="1.2">
            TARGET ASSET
          </text>
          <text x="382" y="24" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono, monospace" letterSpacing="1.2">
            DOWNSTREAM BLAST RADIUS
          </text>

          {/* Incoming Record Edges */}
          <g stroke="rgba(148,163,184,0.22)" strokeWidth="1.25" fill="none">
            <path d="M118 68 L196 146" className={stage === 0 ? "rg-edge-flow stroke-sky-400/70" : ""} />
            <path d="M118 152 L196 152" className={stage <= 1 ? "rg-edge-flow stroke-amber-400/70" : ""} />
            <path d="M118 236 L196 158" className={stage === 0 ? "rg-edge-flow stroke-sky-400/70" : ""} />
          </g>

          {/* Downstream Graph Edges */}
          <g strokeWidth="1.4" fill="none">
            <path
              d="M294 144 C332 144, 336 68, 374 68"
              stroke={downstreamHot ? "rgba(245,158,11,0.75)" : "rgba(56,189,248,0.3)"}
              className={downstreamHot ? "rg-edge-flow" : ""}
            />
            <path
              d="M294 152 L374 152"
              stroke={downstreamHot ? "rgba(245,158,11,0.75)" : "rgba(56,189,248,0.3)"}
              className={downstreamHot ? "rg-edge-flow" : ""}
            />
            <path
              d="M294 160 C332 160, 336 236, 374 236"
              stroke={downstreamHot ? "rgba(245,158,11,0.75)" : "rgba(56,189,248,0.3)"}
              className={downstreamHot ? "rg-edge-flow" : ""}
            />
            <path
              d="M466 152 L500 152"
              stroke={downstreamHot ? "rgba(239,68,68,0.8)" : "rgba(56,189,248,0.3)"}
              className={downstreamHot ? "rg-edge-flow" : ""}
            />
          </g>

          {/* Animated Light Packets: Docs -> P-101 */}
          {docPackets.map((p, idx) => {
            const t = (packetT + p.offset) % 1;
            const cx = lerp(p.x1, p.x2, t);
            const cy = lerp(p.y1, p.y2, t);
            return (
              <circle
                key={`doc-pkt-${idx}`}
                cx={cx}
                cy={cy}
                r={stage === 0 ? 3.2 : 2.3}
                fill={p.color}
                opacity={stage === 0 ? 0.95 : 0.45}
                filter="url(#rg-glow-cyan)"
              />
            );
          })}

          {/* Animated Light Packets: P-101 -> Downstream */}
          {dsPackets.map((p, idx) => {
            const t = (packetT + p.offset) % 1;
            const cx = lerp(p.x1, p.x2, t);
            const cy = lerp(p.y1, p.y2, t);
            return (
              <circle
                key={`ds-pkt-${idx}`}
                cx={cx}
                cy={cy}
                r={downstreamHot ? 3.2 : 2.2}
                fill={downstreamHot ? "#F59E0B" : "#38BDF8"}
                opacity={downstreamHot ? 0.95 : 0.4}
                filter="url(#rg-glow-cyan)"
              />
            );
          })}

          {/* Incoming Document Chips */}
          <g>
            {/* SPEC-P101-B */}
            <rect x="14" y="48" width="104" height="40" rx="7" fill="#0E1219" stroke="rgba(56,189,248,0.38)" />
            <text x="23" y="65" fill="#F8FAFC" fontSize="10" fontWeight="600" fontFamily="JetBrains Mono, monospace">
              SPEC-P101-B
            </text>
            <text x="23" y="79" fill="#38BDF8" fontSize="8.5" fontFamily="JetBrains Mono, monospace">
              REV B · 10.0 bar
            </text>

            {/* MNT-2026-09 */}
            <rect
              x="14"
              y="132"
              width="104"
              height="40"
              rx="7"
              fill="#0E1219"
              stroke={stage >= 1 ? "rgba(245,158,11,0.7)" : "rgba(255,255,255,0.14)"}
            />
            <text x="23" y="149" fill="#F8FAFC" fontSize="10" fontWeight="600" fontFamily="JetBrains Mono, monospace">
              MNT-2026-09
            </text>
            <text x="23" y="163" fill="#F59E0B" fontSize="8.5" fontFamily="JetBrains Mono, monospace">
              P101 rev. 2 · 175 psi
            </text>

            {/* BOM-L4-001 */}
            <rect x="14" y="216" width="104" height="40" rx="7" fill="#0E1219" stroke="rgba(255,255,255,0.14)" />
            <text x="23" y="233" fill="#F8FAFC" fontSize="10" fontWeight="600" fontFamily="JetBrains Mono, monospace">
              BOM-L4-001
            </text>
            <text x="23" y="247" fill="#94A3B8" fontSize="8.5" fontFamily="JetBrains Mono, monospace">
              RELEASED · 3 tags
            </text>
          </g>

          {/* Superseded Pill */}
          <g opacity="0.72">
            <rect x="14" y="268" width="148" height="24" rx="5" fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.28)" />
            <text x="22" y="283" fill="#FCA5A5" fontSize="8.5" fontFamily="JetBrains Mono, monospace">
              SPEC-P101-A · SUPERSEDED
            </text>
          </g>

          {/* Target Node: P-101 */}
          <g>
            {p101Hot && (
              <rect
                x="192"
                y="112"
                width="106"
                height="80"
                rx="12"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.5"
                className="rg-conflict-pulse"
              />
            )}
            <rect
              x="196"
              y="116"
              width="98"
              height="72"
              rx="10"
              fill="#111722"
              stroke={p101Hot ? "#F59E0B" : "#38BDF8"}
              strokeWidth="1.6"
            />
            <text x="206" y="136" fill="#F8FAFC" fontSize="12" fontWeight="700" fontFamily="JetBrains Mono, monospace">
              P-101
            </text>
            <text x="206" y="150" fill="#94A3B8" fontSize="8.5" fontFamily="Inter, sans-serif">
              Main Feed Pump
            </text>
            <rect
              x="206"
              y="160"
              width="78"
              height="18"
              rx="4"
              fill={p101Hot ? "rgba(245,158,11,0.16)" : "rgba(56,189,248,0.14)"}
            />
            <text
              x="212"
              y="172"
              fill={p101Hot ? "#FBBF24" : "#7DD3FC"}
              fontSize="8.5"
              fontWeight="600"
              fontFamily="JetBrains Mono, monospace"
            >
              {stage >= 1 ? "12.07 vs 10.0" : "ECO: 14.0 bar"}
            </text>
          </g>

          {/* Downstream Nodes */}
          {/* PRV-04 */}
          <g>
            <rect
              x="374"
              y="44"
              width="92"
              height="48"
              rx="8"
              fill="#0E1219"
              stroke={downstreamHot ? "#F59E0B" : "rgba(255,255,255,0.16)"}
              strokeWidth={downstreamHot ? "1.5" : "1.1"}
            />
            <text x="383" y="63" fill="#F8FAFC" fontSize="10.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
              PRV-04
            </text>
            <text
              x="383"
              y="79"
              fill={downstreamHot ? "#FBBF24" : "#94A3B8"}
              fontSize="8.5"
              fontFamily="JetBrains Mono, monospace"
            >
              {downstreamHot ? "14.0 > 11.5 bar" : "Set: 11.5 bar"}
            </text>
          </g>

          {/* SOP-7 */}
          <g>
            <rect
              x="374"
              y="128"
              width="92"
              height="48"
              rx="8"
              fill="#0E1219"
              stroke={downstreamHot ? "#F59E0B" : "rgba(255,255,255,0.16)"}
              strokeWidth={downstreamHot ? "1.5" : "1.1"}
            />
            <text x="383" y="147" fill="#F8FAFC" fontSize="10.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
              SOP-7
            </text>
            <text
              x="383"
              y="163"
              fill={downstreamHot ? "#FBBF24" : "#94A3B8"}
              fontSize="8.5"
              fontFamily="JetBrains Mono, monospace"
            >
              {downstreamHot ? "14.0 > 11.0 trip" : "Trip: 11.0 bar"}
            </text>
          </g>

          {/* V-12 */}
          <g>
            <rect
              x="374"
              y="212"
              width="92"
              height="48"
              rx="8"
              fill="#0E1219"
              stroke={downstreamHot ? "#F59E0B" : "rgba(255,255,255,0.16)"}
              strokeWidth={downstreamHot ? "1.5" : "1.1"}
            />
            <text x="383" y="231" fill="#F8FAFC" fontSize="10.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
              V-12
            </text>
            <text
              x="383"
              y="247"
              fill={downstreamHot ? "#FBBF24" : "#94A3B8"}
              fontSize="8.5"
              fontFamily="JetBrains Mono, monospace"
            >
              {downstreamHot ? "14.0 > 12.0 MAWP" : "MAWP: 12.0 bar"}
            </text>
          </g>

          {/* INSP-04 */}
          <g>
            <rect
              x="500"
              y="128"
              width="88"
              height="48"
              rx="8"
              fill="#0E1219"
              stroke={downstreamHot ? "#EF4444" : "rgba(255,255,255,0.16)"}
              strokeWidth={downstreamHot ? "1.5" : "1.1"}
            />
            <text x="508" y="147" fill="#F8FAFC" fontSize="10.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
              INSP-04
            </text>
            <text
              x="508"
              y="163"
              fill={downstreamHot ? "#FCA5A5" : "#94A3B8"}
              fontSize="8.5"
              fontFamily="JetBrains Mono, monospace"
            >
              {downstreamHot ? "RE-CERTIFY" : "Hydro: 12.0"}
            </text>
          </g>
        </svg>
      </div>

      {/* Interactive Micro-Cycle Stepper & Live Rule Readout */}
      <div className="border-t border-white/[0.08] bg-[#0B0F15] px-4 py-3">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {SIM_STAGES.map((s) => {
            const active = s.id === stage;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setUserPaused(true);
                  setStage(s.id);
                }}
                className={`rounded-md border px-2.5 py-1.5 text-left transition ${
                  active
                    ? "border-sky-400/40 bg-sky-400/10 text-slate-100"
                    : "border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/[0.14] hover:text-slate-200"
                }`}
              >
                <div className="font-mono-code text-[9px] font-semibold text-slate-500">
                  STEP {s.code}
                </div>
                <div className="truncate text-[11px] font-semibold">{s.label}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#07090D] px-3 py-2 font-mono-code text-[11px]">
          <span
            className={
              activeStage.tone === "crimson"
                ? "text-rose-300"
                : activeStage.tone === "amber"
                  ? "text-amber-300"
                  : "text-sky-300"
            }
          >
            {activeStage.statusText}
          </span>
          <span className="text-[10px] text-slate-500">{activeStage.ruleId}</span>
        </div>
      </div>
    </div>
  );
}

export function LandingScreen({ onEnter, isExiting = false }: LandingScreenProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [selectedAgentIdx, setSelectedAgentIdx] = useState<number>(0);
  const [agentCyclePaused, setAgentCyclePaused] = useState<boolean>(false);
  const triggeredRef = useRef<boolean>(false);

  const section2Reveal = useRevealOnScroll(reducedMotion);
  const section3Reveal = useRevealOnScroll(reducedMotion);
  const section4Reveal = useRevealOnScroll(reducedMotion);

  const triggerEnter = useCallback(() => {
    if (triggeredRef.current || isExiting) return;
    triggeredRef.current = true;
    onEnter();
  }, [isExiting, onEnter]);

  // Enter-key launch when focus is not inside an interactive control
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

  // Auto-cycle interactive 4-agent showcase until user selects a card
  useEffect(() => {
    if (reducedMotion || agentCyclePaused) return;
    const timer = window.setInterval(() => {
      setSelectedAgentIdx((prev) => (prev + 1) % AGENT_SHOWCASE.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [reducedMotion, agentCyclePaused]);

  const activeAgent = AGENT_SHOWCASE[selectedAgentIdx];

  return (
    <div
      className={`min-h-screen bg-[#07090D] text-[#F8FAFC] transition-all duration-300 ease-out ${
        isExiting ? "pointer-events-none scale-[0.99] opacity-0" : "opacity-100"
      }`}
    >
      {/* Ambient Blueprint Grid */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="rg-dot-grid rg-grid-drift absolute inset-0 opacity-[0.22]" />
        <div
          className="absolute -top-48 left-1/2 h-[540px] w-[960px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(56,189,248,0.22) 0%, rgba(16,185,129,0.06) 45%, transparent 72%)",
          }}
        />
      </div>

      {/* Sticky Minimal Top Nav */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#07090D]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <span className="font-display text-base font-bold tracking-tight text-slate-50">
              ReconcileGraph
            </span>
            <span className="hidden rounded border border-white/[0.1] bg-white/[0.03] px-2 py-0.5 font-mono-code text-[10px] font-medium text-slate-400 sm:inline-block">
              v2 // LOCAL-FIRST
            </span>
          </div>

          <nav className="hidden items-center gap-7 text-xs font-medium text-slate-400 md:flex">
            <a href="#architecture" className="transition hover:text-slate-100">
              Architecture
            </a>
            <a href="#how-it-works" className="transition hover:text-slate-100">
              How It Works
            </a>
            <a href="#guardrails" className="transition hover:text-slate-100">
              Guardrails
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden font-mono-code text-[11px] text-slate-500 lg:inline-block">
              Press ↵ to launch
            </span>
            <button
              type="button"
              onClick={triggerEnter}
              className="group inline-flex items-center gap-2 rounded-lg border border-sky-400/40 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-sky-100"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* SECTION 1 — Full-Viewport Editorial Hero */}
        <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-7xl flex-col justify-center px-5 py-12 sm:px-8 lg:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Hero Left */}
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 font-mono-code text-[11px] font-semibold tracking-wider text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                INDUSTRIAL CHANGE VERIFICATION // PROVENANCE-FIRST AI
              </div>

              <h1 className="font-display mt-5 text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl lg:text-[3.35rem] lg:leading-[1.07]">
                Verify industrial engineering changes before they fail in the field.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-[17px]">
                ReconcileGraph reconciles conflicting specs, superseded revisions, and downstream
                safety limits across fragmented plant records—anchoring every claim to exact
                source offsets before unlocking human ECO sign-off.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={triggerEnter}
                  className="group inline-flex items-center gap-2.5 rounded-lg bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.28)] transition hover:bg-sky-300"
                >
                  <span>Enter Verification Workspace</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>

                <a
                  href="#architecture"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.14] bg-[#0E1219] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/[0.06]"
                >
                  <span>Explore Architecture</span>
                  <ArrowDown className="h-4 w-4 text-slate-400" />
                </a>
              </div>

              {/* Telemetry Strip */}
              <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/[0.08] pt-6 sm:grid-cols-4">
                {[
                  { label: "4 Specialized Agents", icon: Cpu },
                  { label: "SHA-256 Span Anchoring", icon: FileSearch },
                  { label: "Pint Unit Guardrails", icon: Scale },
                  { label: "Fail-Closed ECO Sign-Off", icon: Lock },
                ].map(({ label, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-2 text-xs text-slate-300">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                    <span className="leading-snug font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Right: Live Ontology & Reconciliation Visualizer */}
            <div className="lg:col-span-6">
              <LiveOntologyVisualizer reducedMotion={reducedMotion} />
            </div>
          </div>
        </section>

        {/* SECTION 2 — Why Retrieval-Only AI Fails */}
        <section
          id="architecture"
          ref={section2Reveal.ref}
          className={`mx-auto max-w-7xl border-t border-white/[0.08] px-5 py-20 sm:px-8 ${
            section2Reveal.visible ? "rg-reveal rg-reveal-visible" : "rg-reveal"
          }`}
        >
          <div className="max-w-2xl">
            <div className="font-mono-code text-[11px] font-semibold tracking-widest text-sky-400 uppercase">
              01 // WHY RETRIEVAL-ONLY AI FAILS
            </div>
            <h2 className="font-display mt-3 text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
              Naive RAG retrieves text. Industrial engineering requires reconciliation.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:text-base">
              Vector similarity alone collapses when equipment tags drift across field logs,
              obsolete revisions remain indexed, and upstream upgrades violate downstream limits.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {/* Card 1 */}
            <article className="group rounded-xl border border-white/[0.08] bg-[#0E1219] p-6 transition hover:border-white/[0.18]">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-semibold text-rose-400">
                  01 / SUPERSEDED REVISIONS
                </span>
                <ShieldAlert className="h-4 w-4 text-rose-400" />
              </div>
              <h3 className="font-display mt-4 text-base font-bold text-slate-100">
                Obsolete datasheets pollute answers
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                Standard RAG retrieves <code className="font-mono-code text-rose-300">SPEC-P101-A</code>{" "}
                (<code className="font-mono-code">8.5 bar</code>, <code className="font-mono-code">SUPERSEDED</code>)
                alongside active <code className="font-mono-code text-emerald-300">Rev B</code> specs (
                <code className="font-mono-code">10.0 bar</code>).
              </p>
              <div className="mt-5 rounded-lg border border-white/[0.06] bg-[#07090D] px-3 py-2 font-mono-code text-[11px] text-slate-300">
                <span className="text-sky-400">RevisionComparator</span> → excludes Rev A before reasoning
              </div>
            </article>

            {/* Card 2 */}
            <article className="group rounded-xl border border-white/[0.08] bg-[#0E1219] p-6 transition hover:border-white/[0.18]">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-semibold text-amber-400">
                  02 / SILENT UNIT &amp; VALUE CONFLICTS
                </span>
                <Scale className="h-4 w-4 text-amber-400" />
              </div>
              <h3 className="font-display mt-4 text-base font-bold text-slate-100">
                Hidden cross-document contradictions
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                Field logs cite <code className="font-mono-code text-amber-300">P101 rev. 2</code> at{" "}
                <code className="font-mono-code text-amber-300">175 psi</code>—masking a live{" "}
                <code className="font-mono-code">12.07 bar</code> vs.{" "}
                <code className="font-mono-code">10.0 bar</code> design discrepancy.
              </p>
              <div className="mt-5 rounded-lg border border-white/[0.06] bg-[#07090D] px-3 py-2 font-mono-code text-[11px] text-slate-300">
                <span className="text-amber-400">Pint Normalizer</span> → 175 psi = 12.07 bar (CONFLICT)
              </div>
            </article>

            {/* Card 3 */}
            <article className="group rounded-xl border border-white/[0.08] bg-[#0E1219] p-6 transition hover:border-white/[0.18]">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-semibold text-sky-400">
                  03 / UNTRACED DOWNSTREAM OVERLOADS
                </span>
                <GitBranch className="h-4 w-4 text-sky-400" />
              </div>
              <h3 className="font-display mt-4 text-base font-bold text-slate-100">
                Multi-hop safety boundaries missed
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                Upgrading <code className="font-mono-code">P-101</code> to{" "}
                <code className="font-mono-code">14.0 bar</code> breaches downstream valve MAWP,
                relief set points, interlocks, and hydrostatic certification.
              </p>
              <div className="mt-5 rounded-lg border border-white/[0.06] bg-[#07090D] px-3 py-2 font-mono-code text-[11px] text-slate-300">
                <span className="text-sky-400">BFS Traversal</span> → P-101 → V-12 → PRV-04 → SOP-7
              </div>
            </article>
          </div>
        </section>

        {/* SECTION 3 — Interactive 4-Agent Architecture Showcase */}
        <section
          id="how-it-works"
          ref={section3Reveal.ref}
          className={`mx-auto max-w-7xl border-t border-white/[0.08] px-5 py-20 sm:px-8 ${
            section3Reveal.visible ? "rg-reveal rg-reveal-visible" : "rg-reveal"
          }`}
        >
          <div id="guardrails" className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <div className="font-mono-code text-[11px] font-semibold tracking-widest text-sky-400 uppercase">
                02 // ARCHITECTURE &amp; DETERMINISTIC GUARDRAILS
              </div>
              <h2 className="font-display mt-3 text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
                Agents Propose. Deterministic Tools Verify.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:text-base">
                LLM extraction and synthesis are bounded by deterministic verification tools and a
                fail-closed audit gate. Select any stage to inspect its guardrail contract.
              </p>
            </div>

            <span className="rounded-md border border-white/[0.08] bg-[#0E1219] px-3 py-1.5 font-mono-code text-[11px] text-slate-400">
              {agentCyclePaused ? "MANUAL INSPECTION" : "AUTO-CYCLING PIPELINE"}
            </span>
          </div>

          {/* 4-Step Interactive Strip */}
          <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {AGENT_SHOWCASE.map((agent, idx) => {
              const isSelected = idx === selectedAgentIdx;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setAgentCyclePaused(true);
                    setSelectedAgentIdx(idx);
                  }}
                  className={`rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? "border-sky-400/50 bg-[#121926] shadow-[0_0_32px_rgba(56,189,248,0.1)]"
                      : "border-white/[0.08] bg-[#0E1219] hover:border-white/[0.18]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono-code text-[11px] font-bold ${
                        isSelected ? "text-sky-400" : "text-slate-500"
                      }`}
                    >
                      AGENT {agent.step}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isSelected ? "bg-sky-400" : "bg-slate-700"
                      }`}
                    />
                  </div>
                  <div className="font-display mt-2 text-sm font-bold text-slate-100">
                    {agent.name}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{agent.tagline}</div>
                </button>
              );
            })}
          </div>

          {/* Active Agent Preview Panel */}
          <div className="mt-5 grid grid-cols-1 gap-6 rounded-2xl border border-white/[0.09] bg-[#0E1219] p-6 lg:grid-cols-12 lg:p-7">
            <div className="flex flex-col justify-between lg:col-span-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 font-mono-code text-[11px] font-semibold text-sky-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  GUARDRAIL: {activeAgent.guardrail}
                </div>

                <h3 className="font-display mt-4 text-xl font-bold text-slate-50">
                  {activeAgent.step} // {activeAgent.name}
                </h3>

                <p className="mt-2.5 text-sm leading-relaxed text-slate-300">
                  {activeAgent.description}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {activeAgent.ruleIds.map((rule) => (
                  <span
                    key={rule}
                    className="rounded border border-white/[0.08] bg-[#07090D] px-2.5 py-1 font-mono-code text-[11px] text-slate-300"
                  >
                    {rule}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#07090D] p-5 lg:col-span-6">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <span className="inline-flex items-center gap-2 font-mono-code text-[11px] font-semibold text-slate-300">
                  <Terminal className="h-3.5 w-3.5 text-sky-400" />
                  {activeAgent.traceTitle}
                </span>
                <span className="font-mono-code text-[10px] text-emerald-400">VERIFIED TRACE</span>
              </div>

              <div className="mt-4 space-y-2.5 font-mono-code text-xs">
                {activeAgent.traceLines.map((line) => {
                  const accentClass =
                    line.accent === "cyan"
                      ? "text-sky-300"
                      : line.accent === "amber"
                        ? "text-amber-300"
                        : line.accent === "emerald"
                          ? "text-emerald-300"
                          : line.accent === "crimson"
                            ? "text-rose-300"
                            : "text-slate-200";
                  return (
                    <div
                      key={line.key}
                      className="flex flex-col gap-0.5 rounded-md border border-white/[0.05] bg-white/[0.02] px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span className="text-[11px] text-slate-500">{line.key}</span>
                      <span className={`text-[11px] font-medium ${accentClass}`}>
                        {line.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4 — Compact Final CTA Footer */}
        <section
          ref={section4Reveal.ref}
          className={`mx-auto max-w-7xl border-t border-white/[0.08] px-5 py-16 sm:px-8 ${
            section4Reveal.visible ? "rg-reveal rg-reveal-visible" : "rg-reveal"
          }`}
        >
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-white/[0.09] bg-[#0E1219] px-6 py-8 sm:flex-row sm:items-center sm:px-8">
            <div>
              <div className="font-mono-code text-[11px] font-semibold tracking-wider text-sky-400 uppercase">
                ECO REVIEW WORKBENCH
              </div>
              <h2 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-slate-50">
                Ready to inspect Plant Line-4?
              </h2>
              <p className="mt-2 font-mono-code text-xs text-slate-400">
                FastAPI + SQLite WAL · React 19 · Local-First &amp; Offline-Capable
              </p>
            </div>

            <button
              type="button"
              onClick={triggerEnter}
              className="group inline-flex shrink-0 items-center gap-2.5 rounded-lg bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(56,189,248,0.24)] transition hover:bg-sky-300"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
