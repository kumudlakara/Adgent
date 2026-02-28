import { useState, useEffect } from "react";
import { Zap } from "lucide-react";

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"logo" | "fade-out">("logo");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fade-out"), 1400);
    const t2 = setTimeout(() => onComplete(), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-500 ${
        phase === "fade-out" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-4 animate-splash-in">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-glow-lg">
          <Zap className="w-8 h-8 text-primary-foreground" />
        </div>
        <span className="text-3xl font-bold text-foreground tracking-tight">Adgent</span>
        <div className="w-12 h-0.5 rounded-full bg-primary/50 animate-pulse" />
      </div>
    </div>
  );
}
