import { useEffect, useState } from "react";
import { Activity, Server } from "lucide-react";

interface BackendWakeupScreenProps {
  revealCard?: boolean;
}

export function BackendWakeupScreen({ revealCard = true }: BackendWakeupScreenProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  let statusMessage = "Polling FastAPI verification engine (/api/health)...";
  let stageLabel = "STAGE 01 // HANDSHAKE";
  if (elapsedSeconds >= 20) {
    statusMessage = "Almost ready — mounting Plant Line-4 corpus & provenance store...";
    stageLabel = "STAGE 03 // HYDRATING CORPUS";
  } else if (elapsedSeconds >= 8) {
    statusMessage = "Spinning up Pint unit normalizer & SQLite WAL engine...";
    stageLabel = "STAGE 02 // RUNTIME INIT";
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#07090D] px-4 py-8 text-[#F8FAFC]">
      <div className="rg-dot-grid pointer-events-none absolute inset-0 opacity-25" />

      <main
        className={`relative z-10 w-full max-w-lg transition-all duration-500 ease-out ${
          revealCard ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0E1219] shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
          {/* Header Telemetry Strip */}
          <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#0B0F15] px-5 py-3">
            <span className="inline-flex items-center gap-2 font-mono-code text-[11px] font-semibold text-slate-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400 shadow-[0_0_8px_#38BDF8]" />
              {stageLabel}
            </span>
            <span className="font-mono-code text-[11px] font-semibold text-sky-400">
              GET /api/health
            </span>
          </div>

          <div className="p-8 text-center">
            {/* Animated Telemetry Ring */}
            <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
              <svg
                viewBox="0 0 96 96"
                className="rg-spin-slow absolute inset-0 h-24 w-24 text-sky-400/35"
                fill="none"
              >
                <circle
                  cx="48"
                  cy="48"
                  r="43"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="10 6"
                />
              </svg>
              <svg
                viewBox="0 0 96 96"
                className="rg-spin-reverse absolute inset-0 h-24 w-24 text-sky-400"
                fill="none"
              >
                <circle
                  cx="48"
                  cy="48"
                  r="34"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeDasharray="48 165"
                  strokeLinecap="round"
                />
              </svg>
              <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-sky-400/30 bg-[#07090D] text-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.18)]">
                <Server className="h-5 w-5" />
              </div>
            </div>

            <h2 className="font-display mt-6 text-lg font-bold tracking-tight text-slate-50">
              Waking Verification Engine
            </h2>

            <p className="mt-2 text-sm text-slate-400">{statusMessage}</p>

            {/* Telemetry Progress Bar + Elapsed Clock */}
            <div className="mt-6 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="animate-indeterminate h-full w-1/3 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.6)]" />
              </div>
              <span className="w-11 text-right font-mono-code text-xs font-semibold text-sky-300">
                {String(elapsedSeconds).padStart(2, "0")}s
              </span>
            </div>

            <div className="mt-5 flex items-center justify-center gap-2 font-mono-code text-[11px] text-slate-500">
              <Activity className="h-3.5 w-3.5 text-slate-500" />
              <span>Polling every 2.5s · Transitioning automatically on 200 OK</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
