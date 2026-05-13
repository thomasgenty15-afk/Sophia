import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const STARS = [
  { top: "10%",  left: "7%",  delay: "0s",    dur: "3.2s" },
  { top: "18%",  left: "91%", delay: "0.7s",  dur: "4.0s" },
  { top: "72%",  left: "4%",  delay: "1.1s",  dur: "3.6s" },
  { top: "82%",  left: "94%", delay: "0.3s",  dur: "2.9s" },
  { top: "47%",  left: "2%",  delay: "1.5s",  dur: "4.3s" },
  { top: "33%",  left: "96%", delay: "0.9s",  dur: "3.8s" },
  { top: "91%",  left: "28%", delay: "0.5s",  dur: "3.1s" },
  { top: "6%",   left: "58%", delay: "1.9s",  dur: "4.6s" },
  { top: "62%",  left: "88%", delay: "1.3s",  dur: "2.7s" },
  { top: "14%",  left: "38%", delay: "0.1s",  dur: "3.5s" },
  { top: "88%",  left: "62%", delay: "1.7s",  dur: "4.1s" },
  { top: "40%",  left: "98%", delay: "0.6s",  dur: "3.3s" },
];

const DEFAULT_STEPS = [
  "Analyse du profil",
  "Lecture des réponses",
  "Choix de la stratégie",
  "Construction du niveau de départ",
  "Organisation des actions",
  "Ajustement du rythme",
  "Vérification de cohérence",
  "Préparation de la prévisualisation",
];

type PlanGenerationScreenProps = {
  startedAt?: string | null;
  steps?: string[];
  durationPerStepMs?: number;
};

export function PlanGenerationScreen({
  startedAt = null,
  steps = DEFAULT_STEPS,
  durationPerStepMs = 14_000,
}: PlanGenerationScreenProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const currentStepIndex = useMemo(() => {
    const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
    if (Number.isNaN(startedAtMs)) return 0;
    const elapsed = Math.max(0, now - startedAtMs);
    return Math.min(
      Math.floor(elapsed / durationPerStepMs),
      Math.max(steps.length - 1, 0),
    );
  }, [durationPerStepMs, now, startedAt, steps.length]);

  return (
    <div className="relative mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">

      {/* Background — léger halo bleu */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_46%,rgba(37,99,235,0.08)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_50%_46%,rgba(59,130,246,0.05)_0%,transparent_60%)]" />

      {/* Particules discrètes */}
      {STARS.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-blue-300/80"
          style={{
            top: s.top,
            left: s.left,
            width: i % 3 === 0 ? "3px" : "2px",
            height: i % 3 === 0 ? "3px" : "2px",
            animation: `float-star ${s.dur} ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}

      {/* Content */}
      <div className="relative flex flex-col items-center gap-10 px-6 py-10 md:px-8 md:py-12">

        {/* ── Orbital system ───────────────────────────────────────── */}
        <div className="relative flex h-[300px] w-[300px] items-center justify-center">

          {/* Outer ambient glow (static, blurred) */}
          <div className="absolute h-40 w-40 rounded-full bg-blue-400/15 blur-3xl" />

          {/* Core */}
          <div
            className="absolute z-10 h-[52px] w-[52px] rounded-full bg-blue-600"
            style={{ animation: "glow-core 2.2s ease-in-out infinite" }}
          />
          <div className="absolute z-20 h-5 w-5 rounded-full bg-white" />

          {/* Ring 1 — bleu */}
          <div
            className="absolute h-[110px] w-[110px] rounded-full border border-blue-300/40"
            style={{ animation: "orbit-cw 3s linear infinite" }}
          >
            <div
              className="absolute -top-[7px] left-1/2 h-[14px] w-[14px] -translate-x-1/2 rounded-full bg-blue-500"
              style={{ boxShadow: "0 0 10px 4px rgba(37,99,235,0.45)" }}
            />
          </div>

          {/* Ring 2 — bleu clair */}
          <div
            className="absolute h-[190px] w-[190px] rounded-full border border-blue-200/50"
            style={{ animation: "orbit-ccw 5s linear infinite" }}
          >
            <div
              className="absolute -top-[8px] left-1/2 h-[16px] w-[16px] -translate-x-1/2 rounded-full bg-sky-400"
              style={{ boxShadow: "0 0 12px 5px rgba(56,189,248,0.5)" }}
            />
            <div
              className="absolute -bottom-[8px] left-1/2 h-[8px] w-[8px] -translate-x-1/2 rounded-full bg-blue-400/80"
              style={{ boxShadow: "0 0 6px 2px rgba(96,165,250,0.45)" }}
            />
          </div>

          {/* Ring 3 — gris-bleu */}
          <div
            className="absolute h-[290px] w-[290px] rounded-full border border-gray-200/80"
            style={{ animation: "orbit-cw 8s linear infinite" }}
          >
            <div
              className="absolute -top-[9px] left-1/2 h-[18px] w-[18px] -translate-x-1/2 rounded-full bg-blue-100"
              style={{ boxShadow: "0 0 16px 6px rgba(191,219,254,0.7)" }}
            />
            <div
              className="absolute left-[8%] top-[25%] h-[6px] w-[6px] rounded-full bg-blue-200/70"
              style={{ boxShadow: "0 0 5px 2px rgba(191,219,254,0.5)" }}
            />
            <div
              className="absolute bottom-[25%] right-[8%] h-[6px] w-[6px] rounded-full bg-blue-200/70"
              style={{ boxShadow: "0 0 5px 2px rgba(191,219,254,0.5)" }}
            />
          </div>
        </div>

        {/* ── Text section ─────────────────────────────────────────── */}
        <div className="text-center">
          <h2 className="font-serif text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Sophia assemble ton plan.
          </h2>
        </div>

        <div className="w-full max-w-md space-y-2">
          {steps.map((step, index) => {
            const isDone = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            return (
              <div
                key={step}
                className={`flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  isCurrent
                    ? "bg-blue-50 font-semibold text-blue-800"
                    : isDone
                    ? "text-gray-500"
                    : "text-gray-300"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-gray-200" />
                )}
                <span>{step}</span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
