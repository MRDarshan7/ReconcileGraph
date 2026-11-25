import { useCallback, useEffect, useRef } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

interface LandingScreenProps {
  onEnter: (brandRect: DOMRect) => void;
}

export function LandingScreen({ onEnter }: LandingScreenProps) {
  const brandRef = useRef<HTMLDivElement | null>(null);
  const triggeredRef = useRef(false);

  const triggerEnter = useCallback(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    const rect = brandRef.current?.getBoundingClientRect();
    if (rect) {
      onEnter(rect);
    } else {
      onEnter(new DOMRect(window.innerWidth / 2 - 200, window.innerHeight / 2 - 40, 400, 80));
    }
  }, [onEnter]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        triggerEnter();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [triggerEnter]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <div
        ref={brandRef}
        className="group flex cursor-default items-center gap-4 transition-all duration-300 ease-out hover:scale-[1.015]"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm transition-all duration-300 ease-out group-hover:-rotate-3 group-hover:bg-slate-800 group-hover:shadow-md sm:h-16 sm:w-16">
          <ShieldCheck className="h-8 w-8 sm:h-9 sm:w-9" />
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-slate-900 transition-all duration-300 ease-out select-none group-hover:tracking-normal group-hover:text-slate-800 sm:text-7xl">
          ReconcileGraph
        </h1>
      </div>

      <button
        type="button"
        onClick={triggerEnter}
        className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-8 py-3 text-sm font-medium tracking-wide text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md active:translate-y-0"
      >
        <span>Enter</span>
        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
