import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

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

  let statusMessage = "Connecting to ReconcileGraph cloud server...";
  if (elapsedSeconds >= 20) {
    statusMessage = "Almost ready — loading Plant Line-4 engineering records...";
  } else if (elapsedSeconds >= 8) {
    statusMessage = "Spinning up verification & unit-reconciliation engine...";
  }

  return (
    <main
      className={`mx-auto flex min-h-[calc(100vh-110px)] max-w-xl items-center justify-center px-4 py-8 transition-all duration-[900ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${
        revealCard
          ? "translate-y-0 scale-100 opacity-100"
          : "translate-y-8 scale-[0.99] opacity-0"
      }`}
    >
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-2xl bg-slate-900/15" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xs">
            <ShieldCheck className="h-7 w-7" />
          </div>
        </div>

        <h2 className="mt-5 text-lg font-bold tracking-tight text-slate-900">
          Waking Up Verification Engine
        </h2>

        <p className="mt-2 text-sm text-slate-600">{statusMessage}</p>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div className="animate-indeterminate h-full w-1/3 rounded-full bg-slate-900" />
          </div>
          <span className="w-9 text-right font-mono-code text-xs font-semibold text-slate-600">
            {elapsedSeconds}s
          </span>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Free-tier cloud instance wakes automatically on first visit (~30s)
        </p>
      </div>
    </main>
  );
}
