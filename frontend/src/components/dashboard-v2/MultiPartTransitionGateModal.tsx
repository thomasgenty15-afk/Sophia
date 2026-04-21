import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Flag, X } from "lucide-react";

type MultiPartTransitionGateModalProps = {
  mode: "multi_part" | "simple";
  isOpen: boolean;
  canEvaluateTarget: boolean;
  busy: boolean;
  currentTransformationTitle: string;
  nextTransformationTitle: string | null;
  targetLabel: string | null;
  targetValue: string | null;
  globalObjective: string | null;
  onClose: () => void;
  onConfirmReached: () => Promise<void> | void;
  onAdjustPlan: (reason: string | null) => Promise<void> | void;
  onLetGoAndContinue?: (reason: string) => Promise<void> | void;
};

type ModalStep = "not_ready" | "target_gate" | "blocked";
type SimpleBlockedMode = "choice" | "adjust" | "let_go";

const SIMPLE_LET_GO_REASONS = [
  "Ce sujet n'est plus prioritaire pour moi maintenant.",
  "L'objectif visé ne me correspond plus vraiment.",
  "Le plan demande trop d'énergie par rapport à ma réalité actuelle.",
  "J'ai compris l'essentiel, même si je n'ai pas tout terminé.",
  "Je préfère concentrer mes efforts sur une autre transformation.",
  "Le bon rythme pour moi aujourd'hui est d'avancer autrement.",
] as const;

function buildTargetSummary(targetLabel: string | null, targetValue: string | null) {
  if (targetLabel && targetValue) return `${targetLabel} : ${targetValue}`;
  if (targetValue) return targetValue;
  if (targetLabel) return targetLabel;
  return "l'objectif de cette 1re partie";
}

export function MultiPartTransitionGateModal({
  mode,
  isOpen,
  canEvaluateTarget,
  busy,
  currentTransformationTitle,
  nextTransformationTitle,
  targetLabel,
  targetValue,
  globalObjective,
  onClose,
  onConfirmReached,
  onAdjustPlan,
  onLetGoAndContinue,
}: MultiPartTransitionGateModalProps) {
  const [step, setStep] = useState<ModalStep>(canEvaluateTarget ? "target_gate" : "not_ready");
  const [reason, setReason] = useState("");
  const [simpleBlockedMode, setSimpleBlockedMode] = useState<SimpleBlockedMode>("choice");
  const [selectedLetGoReason, setSelectedLetGoReason] = useState("");

  const targetSummary = useMemo(
    () => buildTargetSummary(targetLabel, targetValue),
    [targetLabel, targetValue],
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[98] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={busy ? undefined : onClose} />

      <div className="relative z-[1] w-full max-w-2xl overflow-hidden rounded-[30px] border border-blue-100 bg-white shadow-[0_36px_120px_-48px_rgba(17,24,39,0.55)]">
        <div className="border-b border-blue-100 bg-[linear-gradient(180deg,rgba(239,246,255,1),rgba(255,255,255,1))] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-700">
                Suite du parcours
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-stone-950">
                {mode === "multi_part"
                  ? "Avant de passer à l'étape 2 de la transformation"
                  : "Avant de passer à la prochaine transformation"}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
                {currentTransformationTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition hover:text-stone-900 disabled:opacity-50"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          {step === "not_ready" ? (
            <>
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <p className="text-sm font-semibold text-amber-950">
                      {mode === "multi_part"
                        ? "L'étape 2 s'ouvre dès que l'objectif de cette 1re partie est atteint."
                        : "Ce n'est pas encore le bon moment pour passer à la suite."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-amber-900">
                      {mode === "multi_part"
                        ? "Si tu as vraiment atteint ce cap, tu peux confirmer et passer à la suite. Sinon, le plus juste est de continuer cette 1re partie ou d'ajuster la fin du plan pour qu'elle colle mieux à ta réalité."
                        : "Vérifie d'abord si cette transformation a vraiment atteint son objectif global. Sinon, le plus utile est d'ajuster le plan ou de choisir consciemment de passer à autre chose."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-stone-200 bg-stone-50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Cap attendu avant la suite
                </p>
                <p className="mt-2 text-sm font-semibold text-stone-950">{targetSummary}</p>
                {globalObjective ? (
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Objectif global visé ensuite : {globalObjective}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {step === "target_gate" ? (
            <>
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <Flag className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-950">
                      {mode === "multi_part"
                        ? "L'étape 2 se débloque seulement si la target de la 1re partie est atteinte."
                        : "Tu peux passer à la prochaine transformation seulement si l'objectif global de celle-ci est vraiment atteint."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-emerald-900">
                      {mode === "multi_part"
                        ? "Vérifie d'abord que ce cap est vraiment acquis avant d'ouvrir la suite."
                        : "Si oui, tu peux ouvrir la suite. Sinon, choisis soit d'ajuster le plan, soit de laisser tomber ce chantier pour avancer."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-stone-200 bg-stone-50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Target à valider
                </p>
                <p className="mt-2 text-sm font-semibold text-stone-950">{targetSummary}</p>
                {globalObjective ? (
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Objectif global final : {globalObjective}
                  </p>
                ) : null}
              </div>

              {nextTransformationTitle ? (
                <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                    {mode === "multi_part" ? "Étape suivante" : "Transformation suivante proposée"}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-stone-950">
                    {nextTransformationTitle}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}

          {step === "blocked" ? (
            <>
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4">
                <p className="text-sm font-semibold text-amber-950">
                  {mode === "multi_part"
                    ? "Le plus utile maintenant est d'ajuster la fin de la 1re partie."
                    : simpleBlockedMode === "adjust"
                      ? "On va ajuster le plan actuel pour t'aider à atteindre l'objectif avant de passer à la suite."
                      : simpleBlockedMode === "let_go"
                        ? "Tu peux laisser tomber ce plan ici et passer à la transformation suivante."
                        : "L'objectif n'est pas atteint. Tu as maintenant 2 options claires : ajuster le plan actuel, ou laisser tomber ce plan et passer à la transformation suivante."}
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  {mode === "multi_part"
                    ? "Dis ce qui te pousse à vouloir passer à la suite malgré ça. Sophia utilisera ce contexte pour te proposer une fin de plan plus juste."
                    : simpleBlockedMode === "adjust"
                      ? "Décris ce qui ne colle plus dans le plan actuel ou pourquoi tu veux l'arrêter avant la fin. Sophia s'appuiera dessus pour te proposer un ajustement."
                      : simpleBlockedMode === "let_go"
                        ? "Choisis la raison qui correspond le mieux à ton abandon assumé de ce plan. Sophia enregistrera ce choix avant de te laisser passer à la suite."
                        : "Si tu ajustes le plan, Sophia te proposera une version plus juste pour continuer. Si tu laisses tomber, ce plan s'arrête ici et tu passes à la transformation suivante."}
                </p>
              </div>

              {mode === "multi_part" ? (
                <label className="block">
                  <span className="mb-0 block text-[11px] font-semibold uppercase tracking-[0.18em] leading-none text-stone-500">
                    Ce qui te pousse à vouloir passer quand même
                  </span>
                  <textarea
                    rows={5}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Exemple : j'ai progressé, mais pas assez vite. La fin du plan n'est plus adaptée à mon rythme actuel."
                    className="mt-3 w-full rounded-[24px] border border-stone-200 bg-stone-50 px-4 pb-3 pt-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              ) : simpleBlockedMode === "adjust" ? (
                <label className="block">
                  <span className="mb-0 block text-[11px] font-semibold uppercase tracking-[0.18em] leading-6 text-stone-500">
                    Dis ce qu'il manque ou ne va pas dans le plan pour que tu aies envie d'aller jusqu'au bout ?
                  </span>
                  <textarea
                    rows={5}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Exemple : j'ai progressé, mais pas assez vite. La fin du plan n'est plus adaptée à mon rythme actuel."
                    className="mt-3 w-full rounded-[24px] border border-stone-200 bg-stone-50 px-4 pb-3 pt-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              ) : simpleBlockedMode === "let_go" ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Pourquoi tu veux laisser tomber ce plan
                  </p>
                  <div className="grid gap-2">
                    {SIMPLE_LET_GO_REASONS.map((option) => {
                      const isSelected = selectedLetGoReason === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setSelectedLetGoReason(option)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            isSelected
                              ? "border-blue-300 bg-blue-50 text-blue-950"
                              : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {step === "target_gate" ? (
              <>
                <button
                  type="button"
                  onClick={() => setStep("blocked")}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950 disabled:opacity-50"
                >
                  Pas encore
                </button>
                <button
                  type="button"
                  onClick={() => void onConfirmReached()}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                    {busy
                      ? "Préparation..."
                      : mode === "multi_part"
                      ? "Oui, passer à l'étape 2"
                      : "Oui, passer à la prochaine transformation"}
                </button>
              </>
            ) : null}

            {step === "not_ready" ? (
              <div className={`grid w-full gap-3 ${mode === "multi_part" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950 disabled:opacity-50"
                >
                  Continuer le plan actuel
                </button>
                <button
                  type="button"
                  onClick={() => void onAdjustPlan(null)}
                  disabled={busy}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
                >
                  <ArrowRight className="h-4 w-4" />
                  Ajuster mon plan
                </button>
                {mode === "multi_part" ? (
                  <button
                    type="button"
                    onClick={() => void onConfirmReached()}
                    disabled={busy}
                    className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {busy ? "Préparation..." : "J'ai atteint l'objectif global"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {step === "blocked" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (mode === "simple" && simpleBlockedMode !== "choice") {
                      setSimpleBlockedMode("choice");
                      return;
                    }
                    setStep("target_gate");
                  }}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950 disabled:opacity-50"
                >
                  Retour
                </button>
                {mode === "multi_part" ? (
                  <button
                    type="button"
                    onClick={() => void onAdjustPlan(reason.trim() || null)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Ajuster mon plan
                  </button>
                ) : simpleBlockedMode === "choice" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setReason("");
                        setSimpleBlockedMode("adjust");
                      }}
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
                    >
                      <ArrowRight className="h-4 w-4" />
                      Ajuster le plan
                    </button>
                    {onLetGoAndContinue ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLetGoReason("");
                          setSimpleBlockedMode("let_go");
                        }}
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950 disabled:opacity-50"
                      >
                        Laisser tomber et passer à la suite
                      </button>
                    ) : null}
                  </>
                ) : simpleBlockedMode === "adjust" ? (
                  <button
                    type="button"
                    onClick={() => void onAdjustPlan(reason.trim() || null)}
                    disabled={busy || reason.trim().length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Ajuster mon plan
                  </button>
                ) : onLetGoAndContinue ? (
                  <button
                    type="button"
                    onClick={() => void onLetGoAndContinue(selectedLetGoReason)}
                    disabled={busy || selectedLetGoReason.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-950 disabled:opacity-50"
                  >
                    Laisser tomber et passer à la suite
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
