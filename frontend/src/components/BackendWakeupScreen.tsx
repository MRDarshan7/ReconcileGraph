import { useEffect, useState } from "react";

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

  let statusMessage = "Polling FastAPI verification engine.";
  if (elapsedSeconds >= 20) {
    statusMessage = "Mounting Plant Line-4 corpus and provenance store.";
  } else if (elapsedSeconds >= 8) {
    statusMessage = "Initializing Pint unit normalizer and SQLite WAL runtime.";
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-5 py-8 text-white">
      <main
        className={`w-full max-w-md border border-[#262626] bg-[#0A0A0A] transition-[opacity,transform] duration-200 ease-out ${
          revealCard ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#262626] px-6 py-4 font-mono-code text-[13px]">
          <span className="text-neutral-300">GET /api/health</span>
          <span className="tabular-nums text-neutral-400">
            {String(elapsedSeconds).padStart(2, "0")}s
          </span>
        </div>

        <div className="px-6 py-8">
          <h2 className="text-2xl font-light tracking-[-0.03em] text-white">
            Starting verification engine
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            {statusMessage}
          </p>

          <div className="mt-7 h-[1px] w-full overflow-hidden bg-[#262626]">
            <div className="animate-indeterminate h-full w-1/3 bg-white" />
          </div>

          <p className="mt-5 text-sm text-neutral-500">
            Checking runtime health every 2.5 seconds.
          </p>
        </div>
      </main>
    </div>
  );
}
