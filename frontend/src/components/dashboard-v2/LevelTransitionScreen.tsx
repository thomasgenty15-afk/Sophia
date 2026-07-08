import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Gift, Loader2, X } from "lucide-react";

import { getDisplayPhaseOrder } from "../../lib/planPhases";
import {
  LEVEL_DESIGN_PROGRESS_INTERVAL_MS,
  LEVEL_DESIGN_PROGRESS_LABELS,
} from "./levelDesignProgress";

// Carte parrainage : au plus une fois par niveau complété, mémorisé en local.
const REFERRAL_PROMPT_SEEN_KEY = "sophia:referral_transition_prompt_seen:v1";
const REFERRAL_PROMPT_SEEN_MAX_ENTRIES = 100;

function readSeenReferralPrompts(): string[] {
  try {
    const raw = localStorage.getItem(REFERRAL_PROMPT_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function markReferralPromptSeen(levelKey: string): void {
  try {
    const seen = readSeenReferralPrompts().filter((key) => key !== levelKey);
    seen.push(levelKey);
    localStorage.setItem(
      REFERRAL_PROMPT_SEEN_KEY,
      JSON.stringify(seen.slice(-REFERRAL_PROMPT_SEEN_MAX_ENTRIES)),
    );
  } catch {
    // mode privé / quota : la carte sera juste re-proposée
  }
}

type LevelTransitionScreenProps = {
  isOpen: boolean;
  levelOrder: number | null;
  levelTitle: string;
  // Identifie le niveau complété (ex. `${planId}:${levelOrder}`) pour ne
  // proposer la carte parrainage qu'une fois par niveau.
  levelKey: string | null;
};

function TransitionProgressLabel() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setStep((current) =>
        Math.min(current + 1, LEVEL_DESIGN_PROGRESS_LABELS.length - 1)
      );
    }, LEVEL_DESIGN_PROGRESS_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <span className="text-sm font-medium text-[#52635b]">
      {LEVEL_DESIGN_PROGRESS_LABELS[step] ?? LEVEL_DESIGN_PROGRESS_LABELS[0]}
    </span>
  );
}

export function LevelTransitionScreen({
  isOpen,
  levelOrder,
  levelTitle,
  levelKey,
}: LevelTransitionScreenProps) {
  if (!isOpen) return null;

  return createPortal(
    <LevelTransitionScreenContent
      levelOrder={levelOrder}
      levelTitle={levelTitle}
      levelKey={levelKey}
    />,
    document.body,
  );
}

function LevelTransitionScreenContent({
  levelOrder,
  levelTitle,
  levelKey,
}: Omit<LevelTransitionScreenProps, "isOpen">) {
  const navigate = useNavigate();

  // Décision prise au montage : la carte n'apparaît que si ce niveau ne l'a
  // pas déjà montrée, et elle est marquée vue immédiatement (cap 1×/niveau).
  const [showReferralCard, setShowReferralCard] = useState(() => {
    if (!levelKey) return false;
    if (readSeenReferralPrompts().includes(levelKey)) return false;
    markReferralPromptSeen(levelKey);
    return true;
  });

  return (
    <div className="fixed inset-0 z-[96] flex flex-col items-center justify-center overflow-y-auto bg-[linear-gradient(180deg,#fbf7ef_0%,#f3f8f1_52%,#eef8f4_100%)] px-4 py-10 text-[#17211d]">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="rounded-full bg-[#e3f1e6] p-4 text-[#002d21] shadow-sm">
          <CheckCircle2 className="h-9 w-9" />
        </div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.24em] text-[#52635b]">
          {levelOrder
            ? `Niveau ${getDisplayPhaseOrder(levelOrder)} terminé`
            : "Niveau terminé"}
        </p>
        <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
          Bien joué. Ce niveau est derrière toi.
        </h2>
        {levelTitle ? (
          <p className="mt-3 text-sm leading-6 text-[#405148]">{levelTitle}</p>
        ) : null}

        <div className="mt-8 flex w-full flex-col items-center gap-3 rounded-[2rem] border border-[#eadfce] bg-white/72 px-6 py-6 shadow-sm backdrop-blur">
          <Loader2 className="h-6 w-6 animate-spin text-[#002d21]" />
          <p className="text-sm font-semibold text-[#17211d]">
            Sophia prépare ton prochain niveau…
          </p>
          <TransitionProgressLabel />
        </div>

        {showReferralCard ? (
          <div className="relative mt-6 w-full rounded-3xl border border-[#eadfce] bg-white/66 p-5 text-left shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => setShowReferralCard(false)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-[#52635b] transition-colors hover:bg-[#e3f1e6] hover:text-[#17211d]"
              aria-label="Masquer"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-full bg-[#e3f1e6] p-2 text-[#002d21]">
                <Gift className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm leading-6 text-[#405148]">
                  En attendant ton prochain niveau… tu connais quelqu'un que
                  Sophia pourrait aider ?
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/parrainage")}
                  className="mt-2 text-sm font-bold text-[#002d21] underline underline-offset-2 transition-colors hover:text-[#17211d]"
                >
                  Découvrir le parrainage
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
