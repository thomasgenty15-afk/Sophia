import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Anchor,
  Brain,
  ChevronDown,
  ChevronUp,
  Check,
  Flame,
  FlaskConical,
  Heart,
  HeartPulse,
  Loader2,
  Map as MapIcon,
  Plus,
  Sparkles,
  Sword,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";

import type {
  AttackCardContent,
  PotionDefinition,
  PotionType,
  UserPotionSessionRow,
} from "../../types/v2";
import type {
  AttackTechniqueGeneratedResult,
  AttackTechniqueAdjustmentAnalysis,
  AttackTechniqueAdjustmentReasonKey,
  AttackTechniqueKey,
} from "../../hooks/useLabCards";

type LabCardsPanelProps = {
  loading: boolean;
  generatingAttack: boolean;
  generatingTechniqueKey: AttackTechniqueKey | null;
  analyzingTechniqueKey: AttackTechniqueKey | null;
  attackCard: AttackCardContent | null;
  onGenerateAttack: () => void;
  onRegenerateAttack: () => void;
  onGenerateTechnique: (
    techniqueKey: AttackTechniqueKey,
    answers: string[],
    options?: {
      adjustmentContext?: {
        currentTechniqueKey: AttackTechniqueKey;
        failureReasonKey: AttackTechniqueAdjustmentReasonKey;
        failureNotes: string;
        recommendationReason: string;
        diagnosticQuestions: string[];
        diagnosticAnswers: string[];
      };
    },
  ) => Promise<AttackTechniqueGeneratedResult | null>;
  onAnalyzeTechniqueAdjustment: (
    currentTechniqueKey: AttackTechniqueKey,
    failureReasonKey: AttackTechniqueAdjustmentReasonKey,
    failureNotes: string,
  ) => Promise<AttackTechniqueAdjustmentAnalysis | null>;
  potionsLoading: boolean;
  potionDefinitions: PotionDefinition[];
  potionLatestSessions: Partial<Record<PotionType, UserPotionSessionRow>>;
  potionUsageCount: Partial<Record<PotionType, number>>;
  activatingPotionType: PotionType | null;
  schedulingPotionSessionId: string | null;
  onActivatePotion: (
    potionType: PotionType,
    answers: Record<string, string>,
    freeText: string,
  ) => Promise<void>;
  onReactivatePotion: (
    definition: PotionDefinition,
    session: UserPotionSessionRow,
  ) => Promise<void>;
  onSchedulePotionFollowUp: (
    sessionId: string,
    localTimeHHMM: string,
    durationDays: number,
  ) => Promise<void>;
  planAttackCardsNode?: ReactNode;
  showPotions?: boolean;
};

type AttackTechniqueView = AttackCardContent["techniques"][number];

function getPotionRemainingDays(session: UserPotionSessionRow | null): number | null {
  if (!session) return null;

  const strategy = session.follow_up_strategy;
  if (
    strategy?.mode !== "scheduled_series" ||
    !strategy.scheduled_at ||
    !strategy.scheduled_duration_days
  ) {
    return null;
  }

  const scheduledAt = new Date(strategy.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime())) return null;

  const elapsedMs = Date.now() - scheduledAt.getTime();
  const elapsedDays = elapsedMs <= 0 ? 0 : Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

  return Math.max(0, strategy.scheduled_duration_days - elapsedDays);
}

const POTION_VISUALS: Record<
  PotionType,
  {
    icon: LucideIcon;
    badgeClass: string;
    iconWrapClass: string;
    iconClass: string;
    dotClass: string;
    hashtagClass: string;
  }
> = {
  rappel: {
    icon: Anchor,
    badgeClass: "bg-cyan-50 text-cyan-900",
    iconWrapClass: "border-cyan-200 bg-cyan-50",
    iconClass: "text-cyan-700",
    dotClass: "bg-cyan-300/70",
    hashtagClass: "text-cyan-700",
  },
  clarte: {
    icon: Brain,
    badgeClass: "bg-amber-50 text-amber-900",
    iconWrapClass: "border-amber-200 bg-amber-50",
    iconClass: "text-amber-700",
    dotClass: "bg-amber-300/70",
    hashtagClass: "text-amber-700",
  },
  courage: {
    icon: Flame,
    badgeClass: "bg-orange-50 text-orange-900",
    iconWrapClass: "border-orange-200 bg-orange-50",
    iconClass: "text-orange-700",
    dotClass: "bg-orange-300/70",
    hashtagClass: "text-orange-700",
  },
  guerison: {
    icon: HeartPulse,
    badgeClass: "bg-rose-50 text-rose-900",
    iconWrapClass: "border-rose-200 bg-rose-50",
    iconClass: "text-rose-700",
    dotClass: "bg-rose-300/70",
    hashtagClass: "text-rose-700",
  },
  amour: {
    icon: Heart,
    badgeClass: "bg-pink-50 text-pink-900",
    iconWrapClass: "border-pink-200 bg-pink-50",
    iconClass: "text-pink-700",
    dotClass: "bg-pink-300/70",
    hashtagClass: "text-pink-700",
  },
  apaisement: {
    icon: Wind,
    badgeClass: "bg-sky-50 text-sky-900",
    iconWrapClass: "border-sky-200 bg-sky-50",
    iconClass: "text-sky-700",
    dotClass: "bg-sky-300/70",
    hashtagClass: "text-sky-700",
  },
};

const ATTACK_TECHNIQUE_PREVIEWS: AttackTechniqueView[] = [
  {
    technique_key: "texte_recadrage",
    title: "Le texte magique",
    pour_quoi: "Faire disparaitre le combat interieur quand tu commences a te trouver des excuses ou a negocier avec toi-meme.",
    objet_genere: "Un texte a ecrire jusqu'a ce que le combat baisse et que l'action redevienne evidente.",
    questions: [
      "Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?",
      "Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?",
      "Dans quel etat tu veux te remettre en ecrivant ce texte ?",
    ],
    mode_emploi: "Ecris-le au moment ou tu sens la resistance monter, jusqu'a ce que ce soit moins un combat.",
    generated_result: null,
  },
  {
    technique_key: "mantra_force",
    title: "Mantra de force",
    pour_quoi: "Installer doucement plus de force interieure face a ce que tu as a faire, au lieu d'attendre d'etre fort sur le moment.",
    objet_genere: "Une phrase a te repeter pour faire evoluer peu a peu ton rapport a l'action.",
    questions: [
      "Par rapport a quelle action ou quel effort tu veux devenir plus solide ?",
      "Pourquoi c'est important pour toi d'arreter de reculer la-dessus ?",
      "Tu veux un mantra plutot calme, noble ou percutant ?",
    ],
    mode_emploi: "Repete-le trois fois le matin, ou matin midi et soir si tu veux l'ancrer plus fort.",
    generated_result: null,
  },
  {
    technique_key: "ancre_visuelle",
    title: "Ancre visuelle",
    pour_quoi: "Utiliser ton environnement consciemment pour qu'il te rappelle les engagements que tu as pris envers toi-meme.",
    objet_genere: "Un repere visuel simple a utiliser, avec une phrase a te dire quand tu le vois.",
    questions: [
      "Quel engagement envers toi-meme tu veux garder vivant ?",
      "Dans quel lieu ou sur quel objet tu pourrais l'accrocher a ton quotidien ?",
      "Quelle phrase courte devrait revenir quand tu le vois ?",
    ],
    mode_emploi: "Place-la dans ton environnement pour qu'elle te recadre naturellement quand ton regard tombe dessus.",
    generated_result: null,
  },
  {
    technique_key: "visualisation_matinale",
    title: "Meditation de 5 minutes",
    pour_quoi: "Rendre le demarrage tellement simple que tu passes a l'action avant que la resistance ait le temps de grossir.",
    objet_genere: "Une courte meditation guidee pour te visualiser en train de faire l'action avant que la journee parte dans tous les sens.",
    questions: [
      "Quelle action ou habitude tu veux te voir faire naturellement ?",
      "A quel moment du matin pourrais-tu prendre 5 minutes pour te projeter calmement ?",
      "Quelles sensations ou images t'aideraient a te voir deja en train de faire l'action ?",
    ],
    mode_emploi: "Prends 5 minutes le matin pour te visualiser en train de faire l'action de facon calme, concrete et deja normale pour toi.",
    generated_result: null,
  },
  {
    technique_key: "preparer_terrain",
    title: "Preparer le terrain",
    pour_quoi: "Installer les bonnes conditions avant que la friction n'arrive.",
    objet_genere: "Un environnement qui t'invite a faire la bonne chose quand le moment arrive.",
    questions: [
      "Par rapport a quelle action tu veux te rendre la vie plus simple ?",
      "Qu'est-ce que tu pourrais preparer en avance pour enlever de la friction ?",
      "Quand le moment arrive, qu'est-ce qui devrait deja etre pret autour de toi ?",
    ],
    mode_emploi: "Prepare le terrain suffisamment tot pour que le bon geste devienne plus simple.",
    generated_result: null,
  },
  {
    technique_key: "pre_engagement",
    title: "Mot de bascule",
    pour_quoi: "Avoir un mot simple a envoyer pour que Sophia comprenne tout de suite que tu es dans un moment ou tu peux craquer et t'aide a tenir.",
    objet_genere: "Un mot-cle memorisable et un mini protocole de bascule a envoyer seul quand la tension monte.",
    questions: [
      "Dans quelle situation precise tu sens que tu vas craquer ou perdre le controle ?",
      "Quand tu tiens bon dans ce moment-la, qu'est-ce que tu proteges de vraiment important chez toi ?",
    ],
    mode_emploi: "Des que tu sens que ca devient tendu, envoie seulement le mot-cle. Sophia recupere le contexte et t'aide immediatement a tenir.",
    generated_result: null,
  },
];

const ATTACK_TECHNIQUE_ADJUSTMENT_REASONS: Array<{
  key: AttackTechniqueAdjustmentReasonKey;
  label: string;
}> = [
  { key: "forgot", label: "Je n'y pensais pas au bon moment" },
  { key: "too_abstract", label: "C'etait trop abstrait" },
  { key: "too_hard", label: "C'etait trop dur a faire" },
  { key: "did_not_resonate", label: "Ca ne me parlait pas" },
  { key: "wrong_problem", label: "Le vrai probleme n'etait pas celui-la" },
  { key: "other", label: "Autre" },
];

function getAttackTechniques(content: AttackCardContent): AttackTechniqueView[] {
  if (!Array.isArray(content.techniques)) return [];

  const defaultsByKey = new Map(
    ATTACK_TECHNIQUE_PREVIEWS.map((technique) => [technique.technique_key, technique]),
  );

  return content.techniques.map((technique) => {
    const defaults = defaultsByKey.get(technique.technique_key);
    if (!defaults) return technique;
    return {
      ...defaults,
      ...technique,
      questions: defaults.questions,
      generated_result: technique.generated_result ?? null,
    };
  });
}

function CardShell({
  title,
  subtitle,
  icon,
  accentClass,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  accentClass: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left"
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${accentClass}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-h-10 items-center">
              <h3
                className="text-xl font-semibold tracking-[0.01em] text-stone-950"
                style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif' }}
              >
                {title}
              </h3>
            </div>
            <p className="mt-1 text-sm leading-6 text-stone-600">{subtitle}</p>
          </div>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  );
}

function AttackTechniquePreviewCard({
  technique,
}: {
  technique: AttackTechniqueView;
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
        {technique.title}
      </p>
      <p className="mt-3 text-sm leading-6 text-stone-800">
        {technique.pour_quoi}
      </p>
      <p className="mt-3 text-xs font-medium text-stone-500">
        Genere: {technique.objet_genere}
      </p>
    </article>
  );
}

function GeneratedAttackCard({
  technique,
  analyzing,
  onAdjust,
}: {
  technique: AttackTechniqueView;
  analyzing: boolean;
  onAdjust: (techniqueKey: AttackTechniqueKey) => void;
}) {
  if (!technique.generated_result) return null;

  return (
    <article className="rounded-[26px] border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            {technique.title}
          </p>
          <h4 className="mt-2 text-lg font-semibold text-amber-950">
            {technique.generated_result.output_title}
          </h4>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
          Creee
        </span>
      </div>

      {technique.generated_result.keyword_trigger?.activation_keyword ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full bg-stone-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
            Mot-cle
          </span>
          <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
            {technique.generated_result.keyword_trigger.activation_keyword}
          </span>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-amber-200 bg-white px-4 py-4">
        <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">
          {technique.generated_result.generated_asset}
        </p>
      </div>

      {technique.generated_result.supporting_points?.length ? (
        <div className="mt-4 rounded-2xl bg-white px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
            Points d'appui
          </p>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-stone-700">
            {technique.generated_result.supporting_points.map((point, index) => (
              <li key={`${technique.technique_key}-support-${index}`}>
                {index + 1}. {point}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-white px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
          Mode d'emploi
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-950">
          {technique.generated_result.mode_emploi}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onAdjust(technique.technique_key)}
          disabled={analyzing}
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-700 disabled:opacity-60"
        >
          {analyzing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyse...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              J'ai essaye, ca ne marche pas
            </>
          )}
        </button>
      </div>
    </article>
  );
}

function AttackTechniqueFlowModal({
  isOpen,
  techniques,
  generatingTechniqueKey,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  techniques: AttackTechniqueView[];
  generatingTechniqueKey: AttackTechniqueKey | null;
  onClose: () => void;
  onSubmit: (
    techniqueKey: AttackTechniqueKey,
    answers: string[],
  ) => Promise<AttackTechniqueGeneratedResult | null>;
}) {
  const [step, setStep] = useState<"choose" | "questions" | "result">("choose");
  const [selectedTechniqueKey, setSelectedTechniqueKey] = useState<AttackTechniqueKey | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<AttackTechniqueGeneratedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep("choose");
      setSelectedTechniqueKey(null);
      setAnswers([]);
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedTechnique = selectedTechniqueKey
    ? techniques.find((technique) => technique.technique_key === selectedTechniqueKey) ?? null
    : null;
  const questions = selectedTechnique?.questions ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-amber-100 bg-amber-50 px-5 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              Carte d'attaque
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              {step === "choose"
                ? "Choisis la technique"
                : step === "questions"
                ? selectedTechnique?.title ?? "Questionnaire"
                : "Ta carte est prete"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {step === "choose"
                ? "Choisis une technique parmi les 6, puis suis son mini-parcours."
                : step === "questions"
                ? "Reponds aux questions pour personnaliser la carte."
                : "Tu peux fermer. La carte se retrouve maintenant dans ton espace."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-400 transition-colors hover:bg-white hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {step === "choose" ? (
            techniques.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-3">
                {techniques.map((technique) => (
                  <button
                    key={technique.technique_key}
                    type="button"
                    onClick={() => {
                      setSelectedTechniqueKey(technique.technique_key);
                      setAnswers((technique.questions ?? []).map(() => ""));
                      setError(null);
                      setStep("questions");
                    }}
                    className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      {technique.title}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-stone-800">
                      {technique.pour_quoi}
                    </p>
                    <p className="mt-3 text-xs font-medium text-stone-500">
                      Genere: {technique.objet_genere}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-600">
                Les 6 cartes d'attaque sont deja creees pour cet espace.
              </div>
            )
          ) : null}

          {step === "questions" && selectedTechnique ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-sm leading-6 text-amber-950">
                  {selectedTechnique.pour_quoi}
                </p>
              </div>

              {questions.map((question, index) => (
                <label key={`${selectedTechnique.technique_key}-${index}`} className="block">
                  <p className="text-sm font-semibold text-stone-900">{question}</p>
                  <textarea
                    value={answers[index] ?? ""}
                    onChange={(event) => {
                      const next = [...answers];
                      next[index] = event.target.value;
                      setAnswers(next);
                    }}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                  />
                </label>
              ))}

              {error ? (
                <p className="text-xs text-rose-600">{error}</p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("choose");
                    setError(null);
                  }}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700"
                >
                  Changer de technique
                </button>
                <button
                  type="button"
                  disabled={generatingTechniqueKey === selectedTechnique.technique_key}
                  onClick={() => void handleGenerate()}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {generatingTechniqueKey === selectedTechnique.technique_key ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generation...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Generer la carte
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {step === "result" && result ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Carte generee
                </p>
                <p className="mt-2 text-lg font-semibold text-amber-950">
                  {result.output_title}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">
                  {result.generated_asset}
                </p>
              </div>

              {result.supporting_points?.length ? (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Points d'appui
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-stone-700">
                    {result.supporting_points.map((point, index) => (
                      <li key={`result-point-${index}`}>
                        {index + 1}. {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                  Mode d'emploi
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-950">
                  {result.mode_emploi}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 md:flex-row md:justify-end">
          {step === "result" ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-xs font-semibold text-white"
            >
              <Check className="h-4 w-4" />
              Fermer
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-700"
            >
              Annuler
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );

async function handleGenerate() {
    if (!selectedTechnique) return;
    if (answers.length < questions.length || answers.some((answer) => !answer.trim())) {
      setError("Remplis les questions pour generer cette carte.");
      return;
    }

    const generated = await onSubmit(
      selectedTechnique.technique_key,
      answers.map((answer) => answer.trim()),
    );

    if (!generated) {
      setError("Impossible de generer cette carte pour le moment.");
      return;
    }

    setError(null);
    setResult(generated);
    setStep("result");
  }
}

function AttackTechniqueAdjustmentModal({
  isOpen,
  currentTechniqueKey,
  techniques,
  analyzingTechniqueKey,
  generatingTechniqueKey,
  onClose,
  onAnalyze,
  onSubmit,
}: {
  isOpen: boolean;
  currentTechniqueKey: AttackTechniqueKey | null;
  techniques: AttackTechniqueView[];
  analyzingTechniqueKey: AttackTechniqueKey | null;
  generatingTechniqueKey: AttackTechniqueKey | null;
  onClose: () => void;
  onAnalyze: (
    currentTechniqueKey: AttackTechniqueKey,
    failureReasonKey: AttackTechniqueAdjustmentReasonKey,
    failureNotes: string,
  ) => Promise<AttackTechniqueAdjustmentAnalysis | null>;
  onSubmit: (
    techniqueKey: AttackTechniqueKey,
    answers: string[],
    options?: {
      adjustmentContext?: {
        currentTechniqueKey: AttackTechniqueKey;
        failureReasonKey: AttackTechniqueAdjustmentReasonKey;
        failureNotes: string;
        recommendationReason: string;
        diagnosticQuestions: string[];
        diagnosticAnswers: string[];
      };
    },
  ) => Promise<AttackTechniqueGeneratedResult | null>;
}) {
  const [step, setStep] = useState<"feedback" | "choose" | "questions" | "result">("feedback");
  const [reasonKey, setReasonKey] = useState<AttackTechniqueAdjustmentReasonKey>("too_hard");
  const [failureNotes, setFailureNotes] = useState("");
  const [analysis, setAnalysis] = useState<AttackTechniqueAdjustmentAnalysis | null>(null);
  const [selectedTechniqueKey, setSelectedTechniqueKey] = useState<AttackTechniqueKey | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<AttackTechniqueGeneratedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep("feedback");
      setReasonKey("too_hard");
      setFailureNotes("");
      setAnalysis(null);
      setSelectedTechniqueKey(null);
      setQuestionAnswers([]);
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const selectedTechnique = selectedTechniqueKey
    ? techniques.find((technique) => technique.technique_key === selectedTechniqueKey) ?? null
    : null;
  const baseQuestions = selectedTechnique?.questions ?? [];
  const diagnosticQuestions = analysis?.diagnosticQuestions ?? [];
  const allQuestions = [...baseQuestions, ...diagnosticQuestions];

  useEffect(() => {
    if (step !== "questions") return;
    setQuestionAnswers((current) => {
      const next = Array.from({ length: allQuestions.length }, (_, index) => current[index] ?? "");
      return next;
    });
  }, [allQuestions.length, step, selectedTechniqueKey]);

  if (!isOpen || !currentTechniqueKey) return null;

  const currentTechnique = techniques.find((technique) => technique.technique_key === currentTechniqueKey) ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-amber-100 bg-amber-50 px-5 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              Ajuster une carte d'attaque
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              {step === "feedback"
                ? "Qu'est-ce qui n'a pas pris ?"
                : step === "choose"
                ? "Nouvelle direction proposee"
                : step === "questions"
                ? selectedTechnique?.title ?? "Questionnaire"
                : "Ta nouvelle version est prete"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {step === "feedback"
                ? "On garde le contexte, on comprend ce qui a coince, puis on affine ou on change de technique."
                : step === "choose"
                ? "Sophia te propose la direction la plus adaptee, mais tu peux la changer si tu veux."
                : step === "questions"
                ? "Quelques reponses de plus pour generer quelque chose de plus fin."
                : "La carte a ete recalibree a partir de ton retour."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-400 transition-colors hover:bg-white hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {step === "feedback" ? (
            <div className="space-y-4">
              {currentTechnique ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Technique actuelle
                  </p>
                  <p className="mt-2 text-sm font-semibold text-amber-950">{currentTechnique.title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{currentTechnique.pour_quoi}</p>
                </div>
              ) : null}

              <div>
                <p className="text-sm font-semibold text-stone-900">
                  Pourquoi tu as l'impression que ca n'a pas marche ?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ATTACK_TECHNIQUE_ADJUSTMENT_REASONS.map((reason) => {
                    const selected = reason.key === reasonKey;
                    return (
                      <button
                        key={reason.key}
                        type="button"
                        onClick={() => setReasonKey(reason.key)}
                        className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                          selected
                            ? "border-stone-900 bg-stone-900 text-white"
                            : "border-stone-200 bg-white text-stone-700"
                        }`}
                      >
                        {reason.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <p className="text-sm font-semibold text-stone-900">
                  Tu peux ajouter d'autres infos si tu veux
                </p>
                <textarea
                  value={failureNotes}
                  onChange={(event) => setFailureNotes(event.target.value)}
                  rows={4}
                  className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                />
              </label>
            </div>
          ) : null}

          {step === "choose" && analysis ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Proposition Sophia
                </p>
                <p className="mt-2 text-sm font-semibold text-amber-950">
                  {analysis.decision === "change"
                    ? "Je te propose de changer de technique."
                    : "Je pense qu'il vaut mieux affiner cette technique."}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  {analysis.recommendationReason}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {techniques.map((technique) => {
                  const selected = technique.technique_key === selectedTechniqueKey;
                  return (
                    <button
                      key={technique.technique_key}
                      type="button"
                      onClick={() => {
                        setSelectedTechniqueKey(technique.technique_key);
                        setError(null);
                      }}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        selected
                          ? "border-amber-400 bg-amber-50"
                          : "border-stone-200 bg-stone-50 hover:border-amber-300 hover:bg-amber-50"
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        {technique.title}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-stone-800">
                        {technique.pour_quoi}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === "questions" && selectedTechnique ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-sm leading-6 text-amber-950">
                  {analysis?.recommendationReason}
                </p>
              </div>

              {allQuestions.map((question, index) => (
                <label key={`${selectedTechnique.technique_key}-adjust-${index}`} className="block">
                  <p className="text-sm font-semibold text-stone-900">{question}</p>
                  <textarea
                    value={questionAnswers[index] ?? ""}
                    onChange={(event) => {
                      const next = [...questionAnswers];
                      next[index] = event.target.value;
                      setQuestionAnswers(next);
                    }}
                    rows={3}
                    className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                  />
                </label>
              ))}

              {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            </div>
          ) : null}

          {step === "result" && result ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Nouvelle version
                </p>
                <p className="mt-2 text-lg font-semibold text-amber-950">
                  {result.output_title}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">
                  {result.generated_asset}
                </p>
              </div>

              {result.supporting_points?.length ? (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                    Points d'appui
                  </p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-stone-700">
                    {result.supporting_points.map((point, index) => (
                      <li key={`adjust-result-point-${index}`}>
                        {index + 1}. {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                  Mode d'emploi
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-950">
                  {result.mode_emploi}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 md:flex-row md:justify-between">
          <div className="flex flex-wrap gap-3">
            {step !== "feedback" && step !== "result" ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep((current) => current === "questions" ? "choose" : "feedback");
                }}
                className="rounded-full border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-700"
              >
                Retour
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-700"
            >
              {step === "result" ? "Fermer" : "Annuler"}
            </button>
          </div>

          {step === "feedback" ? (
            <button
              type="button"
              disabled={analyzingTechniqueKey === currentTechniqueKey}
              onClick={() => void handleAnalyze()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              {analyzingTechniqueKey === currentTechniqueKey ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyse...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Continuer
                </>
              )}
            </button>
          ) : null}

          {step === "choose" ? (
            <button
              type="button"
              disabled={!selectedTechniqueKey}
              onClick={() => {
                setError(null);
                setStep("questions");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              Continuer
            </button>
          ) : null}

          {step === "questions" && selectedTechniqueKey ? (
            <button
              type="button"
              disabled={generatingTechniqueKey === selectedTechniqueKey}
              onClick={() => void handleGenerate()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-700 px-5 py-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              {generatingTechniqueKey === selectedTechniqueKey ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regeneration...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Regenerer quelque chose de plus adapte
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );

  async function handleAnalyze() {
    if (!currentTechniqueKey) return;
    const nextAnalysis = await onAnalyze(currentTechniqueKey, reasonKey, failureNotes);
    if (!nextAnalysis) {
      setError("Impossible d'analyser cette carte pour le moment.");
      return;
    }

    setAnalysis(nextAnalysis);
    setSelectedTechniqueKey(nextAnalysis.recommendedTechniqueKey);
    setQuestionAnswers([]);
    setError(null);
    setStep("choose");
  }

  async function handleGenerate() {
    if (!selectedTechnique || !analysis || !currentTechniqueKey) return;
    if (allQuestions.some((_, index) => !String(questionAnswers[index] ?? "").trim())) {
      setError("Remplis les questions pour recalibrer cette carte.");
      return;
    }

    const diagnosticAnswers = questionAnswers.slice(baseQuestions.length);
    const generated = await onSubmit(
      selectedTechnique.technique_key,
      questionAnswers.map((answer) => answer.trim()),
      {
        adjustmentContext: {
          currentTechniqueKey,
          failureReasonKey: reasonKey,
          failureNotes,
          recommendationReason: analysis.recommendationReason,
          diagnosticQuestions,
          diagnosticAnswers: diagnosticAnswers.map((answer) => answer.trim()),
        },
      },
    );

    if (!generated) {
      setError("Impossible de regenerer cette carte pour le moment.");
      return;
    }

    setError(null);
    setResult(generated);
    setStep("result");
  }
}

function PotionCard({
  definition,
  latestSession,
  usageCount,
  activating,
  schedulingSessionId,
  loading,
  onActivate,
  onReactivate,
  onSchedule,
}: {
  definition: PotionDefinition;
  latestSession: UserPotionSessionRow | null;
  usageCount: number;
  activating: boolean;
  schedulingSessionId: string | null;
  loading: boolean;
  onActivate: (
    potionType: PotionType,
    answers: Record<string, string>,
    freeText: string,
  ) => Promise<void>;
  onReactivate: (
    definition: PotionDefinition,
    session: UserPotionSessionRow,
  ) => Promise<void>;
  onSchedule: (
    sessionId: string,
    localTimeHHMM: string,
    durationDays: number,
  ) => Promise<void>;
}) {
  const visual = POTION_VISUALS[definition.type];
  const PotionIcon = visual.icon;
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
  const [followUpTime, setFollowUpTime] = useState("09:00");
  const [followUpDuration, setFollowUpDuration] = useState("7");

  useEffect(() => {
    if (!latestSession) return;
    const time = latestSession.follow_up_strategy?.scheduled_local_time_hhmm;
    const duration = latestSession.follow_up_strategy?.scheduled_duration_days ??
      latestSession.follow_up_strategy?.suggested_duration_days;
    if (time) setFollowUpTime(time);
    if (duration) setFollowUpDuration(String(duration));
  }, [latestSession]);

  const canSubmit = definition.questionnaire.every((question) => {
    if (!question.required) return true;
    const value = answers[question.id] ?? "";
    return question.input_type === "free_text" ? value.trim().length > 0 : Boolean(value);
  }) && (!definition.free_text_required || freeText.trim().length > 0);

  const lastUsedLabel = latestSession
    ? new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
    }).format(new Date(latestSession.generated_at))
    : null;
  const followUpProposal = latestSession?.content.follow_up_proposal ?? null;
  const followUpStrategy = latestSession?.follow_up_strategy ?? null;
  const isScheduling = latestSession ? schedulingSessionId === latestSession.id : false;
  const isSeriesScheduled = followUpStrategy?.mode === "scheduled_series";
  const potionName = latestSession?.content.potion_name?.trim() || definition.title;
  const remainingDays = getPotionRemainingDays(latestSession);
  const remainingLabel = remainingDays == null
    ? "Inactive"
    : remainingDays > 0
    ? `${remainingDays} jour${remainingDays > 1 ? "s" : ""}`
    : "Terminee";
  const scheduledSummary = isSeriesScheduled
    ? `${followUpStrategy.scheduled_message_count ?? followUpStrategy.scheduled_duration_days ?? 0} message${
      (followUpStrategy.scheduled_message_count ?? followUpStrategy.scheduled_duration_days ?? 0) > 1 ? "s" : ""
    } prevu${(followUpStrategy.scheduled_message_count ?? followUpStrategy.scheduled_duration_days ?? 0) > 1 ? "s" : ""}${
      followUpStrategy.scheduled_local_time_hhmm ? ` a ${followUpStrategy.scheduled_local_time_hhmm}` : ""
    }`
    : null;

  async function handleActivateSubmit() {
    await onActivate(definition.type, answers, freeText);
    setIsModalOpen(false);
    setAnswers({});
    setFreeText("");
  }

  async function handleReactivate() {
    if (!latestSession) return;
    await onReactivate(definition, latestSession);
  }

  return (
    <>
      <section className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-1 items-start gap-3">
            <div className="relative shrink-0">
              <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border ${visual.iconWrapClass}`}>
                <PotionIcon className={`h-5 w-5 ${visual.iconClass}`} />
              </div>
              <span className={`absolute -left-1 top-1 h-2.5 w-2.5 rounded-full ${visual.dotClass}`} />
              <span className={`absolute -right-1 bottom-1 h-2 w-2 rounded-full ${visual.dotClass}`} />
              <span className={`absolute right-1 -top-1 h-1.5 w-1.5 rounded-full ${visual.dotClass}`} />
            </div>
            <div className="min-w-0 flex-1">
              {latestSession ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {definition.title}
                </p>
              ) : null}
              <h4 className="text-lg font-semibold text-stone-950">{potionName}</h4>
              <p className="mt-2 text-sm leading-6 text-stone-600">{definition.short_description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700"
                >
                  {isOpen ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Replier
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Deplier
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => latestSession ? void handleReactivate() : setIsModalOpen(true)}
                  disabled={latestSession ? isScheduling : activating}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-4 py-2 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-200 disabled:opacity-60"
                >
                  {latestSession ? (
                    isScheduling ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Reactivation...
                      </>
                    ) : (
                      <>
                        <FlaskConical className="h-3.5 w-3.5" />
                        Reactiver
                      </>
                    )
                  ) : activating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Activation...
                    </>
                  ) : (
                    <>
                      <FlaskConical className="h-3.5 w-3.5" />
                      Activer la potion
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className={`rounded-2xl px-3 py-2 text-right ${visual.badgeClass}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
              Etat
            </p>
            <p className="mt-1 text-lg font-semibold">{remainingLabel}</p>
            <p className="mt-1 text-[11px] font-medium opacity-80">
              {usageCount} usage{usageCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {isOpen ? (
          <div className="mt-5 space-y-4 rounded-[24px] border border-stone-200 bg-stone-50 p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Quand tu te dis
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {definition.state_trigger.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {latestSession ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                    Ton texte
                  </p>
                  {lastUsedLabel ? (
                    <span className="text-[11px] font-medium text-emerald-700">
                      {lastUsedLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-emerald-950">
                  {latestSession.content.instant_response}
                </p>
                {latestSession.content.suggested_next_step ? (
                  <p className="mt-3 text-sm font-medium text-emerald-900">
                    Prochain geste: {latestSession.content.suggested_next_step}
                  </p>
                ) : null}
                {followUpProposal ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-white/70 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                      Proposition d'initiative
                    </p>
                    <h5 className="mt-2 text-sm font-semibold text-emerald-950">
                      {followUpProposal.title}
                    </h5>
                    <p className="mt-2 text-sm leading-6 text-emerald-900">
                      {followUpProposal.description}
                    </p>
                    <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
                      {followUpProposal.message_text}
                    </div>
                    {followUpProposal.cadence_hint ? (
                      <p className="mt-2 text-xs text-emerald-700">
                        {followUpProposal.cadence_hint}
                      </p>
                    ) : null}

                    {scheduledSummary ? (
                      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                          <Check className="h-4 w-4" />
                          Initiatives programmees
                        </div>
                        <p className="mt-2 text-sm text-emerald-800">{scheduledSummary}</p>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_140px]">
                        <label className="text-sm text-stone-700">
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                            Heure
                          </span>
                          <input
                            type="time"
                            value={followUpTime}
                            onChange={(event) => setFollowUpTime(event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
                          />
                        </label>
                        <label className="text-sm text-stone-700">
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                            Duree
                          </span>
                          <select
                            value={followUpDuration}
                            onChange={(event) => setFollowUpDuration(event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
                          >
                            {[3, 5, 7, 10, 14].map((value) => (
                              <option key={value} value={String(value)}>
                                {value} jours
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            disabled={isScheduling || !latestSession}
                            onClick={() =>
                              latestSession
                                ? void onSchedule(latestSession.id, followUpTime, Number(followUpDuration))
                                : undefined}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {isScheduling ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Programmation...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                Programmer
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-sm leading-6 text-stone-600">
                  Active cette potion une premiere fois pour avoir ton texte, puis tu pourras le retrouver ici et la reactiver sans le changer.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {loading && !latestSession ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </div>
        ) : null}
      </section>

      {isModalOpen
        ? createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-stone-950/55 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-5">
                <div className="flex items-start gap-3">
                  <div className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border ${visual.iconWrapClass}`}>
                    <PotionIcon className={`h-5 w-5 ${visual.iconClass}`} />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-stone-950">{definition.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-stone-600">{definition.short_description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                {definition.questionnaire.map((question) => (
                  <div key={question.id}>
                    <p className="text-sm font-semibold text-stone-900">{question.label}</p>
                    {question.helper_text ? (
                      <p className="mt-1 text-xs text-stone-500">{question.helper_text}</p>
                    ) : null}
                    {question.input_type === "free_text" ? (
                      <textarea
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                        placeholder={question.placeholder ?? ""}
                        className="mt-3 min-h-[96px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                      />
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {question.options.map((option) => {
                          const selected = answers[question.id] === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.value }))}
                              className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                                selected
                                  ? "border-stone-900 bg-stone-900 text-white"
                                  : "border-stone-200 bg-white text-stone-700"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}

                <div>
                  <label className="text-sm font-semibold text-stone-900">
                    {definition.free_text_label}
                  </label>
                  <textarea
                    value={freeText}
                    onChange={(event) => setFreeText(event.target.value)}
                    placeholder={definition.free_text_placeholder}
                    className="mt-3 min-h-[110px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none ring-0 placeholder:text-stone-400"
                  />
                  <p className="mt-2 text-xs text-stone-500">
                    {definition.free_text_required
                      ? "Ce champ fait partie de la potion."
                      : "Ce champ reste optionnel."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-stone-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit || activating}
                    onClick={() => void handleActivateSubmit()}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {activating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Activation...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Lancer la potion
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}

export function LabCardsPanel({
  loading,
  generatingAttack,
  generatingTechniqueKey,
  analyzingTechniqueKey,
  attackCard,
  onGenerateTechnique,
  onAnalyzeTechniqueAdjustment,
  potionsLoading,
  potionDefinitions,
  potionLatestSessions,
  potionUsageCount,
  activatingPotionType,
  schedulingPotionSessionId,
  onActivatePotion,
  onReactivatePotion,
  onSchedulePotionFollowUp,
  planAttackCardsNode,
  showPotions = true,
}: LabCardsPanelProps) {
  const [isAttackFlowOpen, setIsAttackFlowOpen] = useState(false);
  const [adjustingTechniqueKey, setAdjustingTechniqueKey] = useState<AttackTechniqueKey | null>(null);
  const [isAttackExpanded, setIsAttackExpanded] = useState(false);
  const [isAttackIntroOpen, setIsAttackIntroOpen] = useState(true);
  const [isAttackTechniquesOpen, setIsAttackTechniquesOpen] = useState(false);
  const [isAttackFreeSectionOpen, setIsAttackFreeSectionOpen] = useState(true);
  const [isPlanAttackSectionOpen, setIsPlanAttackSectionOpen] = useState(true);
  const [isPotionsExpanded, setIsPotionsExpanded] = useState(false);

  const storedTechniques = attackCard ? getAttackTechniques(attackCard) : [];
  const techniques = storedTechniques.length > 0
    ? storedTechniques
    : ATTACK_TECHNIQUE_PREVIEWS;
  const generatedTechniques = techniques.filter((technique) => technique.generated_result);
  const remainingTechniques = techniques.filter((technique) => !technique.generated_result);

  return (
    <div className="space-y-5">
      <div className="grid gap-5">
        <CardShell
          title="Attaque"
          subtitle="Des cartes pour rendre l'action plus naturelle, moins difficile, et moins dependante de la volonte brute. C'est vraiment magique."
          icon={<Sword className="h-5 w-5 text-amber-700" />}
          accentClass="bg-amber-50"
          isOpen={isAttackExpanded}
          onToggle={() => setIsAttackExpanded((value) => !value)}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <button
                type="button"
                onClick={() => setIsAttackIntroOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                  Comment ca marche ?
                </span>
                {isAttackIntroOpen ? (
                  <ChevronUp className="h-4 w-4 text-amber-700" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-amber-700" />
                )}
              </button>
              {isAttackIntroOpen ? (
                <p className="mt-2 text-sm leading-6 text-amber-950">
                  Une carte d'attaque ne sert pas a te pousser plus fort au dernier moment. Elle sert a agir en amont,
                  pour que le bon comportement devienne plus naturel quand le moment arrive. En pratique, tu prepares
                  ton terrain psychologique ou materiel pour reduire la friction, diminuer l'hesitation, et avoir besoin
                  de moins de force sur le moment. Par exemple, une ancre visuelle peut te remettre dans le bon axe
                  sans avoir a renegocier avec toi-meme, et un rituel de depart peut rendre le passage a l'action beaucoup
                  plus simple au moment de commencer.
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <button
                type="button"
                onClick={() => setIsAttackTechniquesOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                  Quelles techniques ?
                </span>
                {isAttackTechniquesOpen ? (
                  <ChevronUp className="h-4 w-4 text-amber-700" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-amber-700" />
                )}
              </button>
              {isAttackTechniquesOpen ? (
                remainingTechniques.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {remainingTechniques.map((technique) => (
                      <AttackTechniquePreviewCard
                        key={technique.technique_key}
                        technique={technique}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-amber-950">
                    Toutes les techniques ont deja ete creees.
                  </p>
                )
              ) : null}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50">
              <button
                type="button"
                onClick={() => setIsAttackFreeSectionOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                    <Sparkles className="h-4 w-4 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-950">Cartes d'attaque libres</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      Pour des actions qui peuvent t'aider, mais qui ne sont pas dans le plan.
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                    isAttackFreeSectionOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isAttackFreeSectionOpen ? (
                <div className="space-y-4 border-t border-stone-200 px-4 py-4">
                  {loading ? (
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement...
                    </div>
                  ) : generatedTechniques.length > 0 ? (
                    <>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setIsAttackFlowOpen(true)}
                          disabled={remainingTechniques.length === 0 || generatingAttack}
                          className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60"
                        >
                          {generatingAttack ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Preparation...
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              Ajouter une carte
                            </>
                          )}
                        </button>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        {generatedTechniques.map((technique) => (
                          <GeneratedAttackCard
                            key={technique.technique_key}
                            technique={technique}
                            analyzing={analyzingTechniqueKey === technique.technique_key}
                            onAdjust={(techniqueKey) => setAdjustingTechniqueKey(techniqueKey)}
                          />
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {remainingTechniques.length === 0 ? (
                          <p className="text-xs text-stone-500">
                            Les 6 cartes ont deja ete creees.
                          </p>
                        ) : (
                          <p className="text-xs text-stone-500">
                            {remainingTechniques.length} technique{remainingTechniques.length > 1 ? "s" : ""} restante{remainingTechniques.length > 1 ? "s" : ""}.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-6 text-center">
                      <p className="text-sm leading-6 text-stone-600">
                        Tu n'as pas encore de carte d'attaque libre dans cette section.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsAttackFlowOpen(true)}
                        disabled={generatingAttack}
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {generatingAttack ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Preparation...
                          </>
                        ) : (
                          "Creer ma premiere carte"
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {planAttackCardsNode ? (
            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50">
              <button
                type="button"
                onClick={() => setIsPlanAttackSectionOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-50">
                    <MapIcon className="h-4 w-4 text-sky-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-950">Cartes d'attaque du plan</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      Elles se rangent ici, par niveau, quand tu choisis de les preparer pour une action du plan.
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                    isPlanAttackSectionOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isPlanAttackSectionOpen ? (
                <div className="border-t border-stone-200 px-4 py-4">
                  {planAttackCardsNode}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardShell>
      </div>

      <AttackTechniqueFlowModal
        isOpen={isAttackFlowOpen}
        techniques={remainingTechniques}
        generatingTechniqueKey={generatingTechniqueKey}
        onClose={() => setIsAttackFlowOpen(false)}
        onSubmit={onGenerateTechnique}
      />

      <AttackTechniqueAdjustmentModal
        isOpen={adjustingTechniqueKey !== null}
        currentTechniqueKey={adjustingTechniqueKey}
        techniques={techniques}
        analyzingTechniqueKey={analyzingTechniqueKey}
        generatingTechniqueKey={generatingTechniqueKey}
        onClose={() => setAdjustingTechniqueKey(null)}
        onAnalyze={onAnalyzeTechniqueAdjustment}
        onSubmit={onGenerateTechnique}
      />

      {showPotions ? (
        <CardShell
          title="Potion"
          subtitle="Des potions pour t'aider a traverser un etat emotionnel difficile sans te laisser embarquer. Un petit parcours, une reponse immediate, et parfois une initiative pour t'aider a tenir."
          icon={<FlaskConical className="h-5 w-5 text-emerald-700" />}
          accentClass="bg-emerald-50"
          isOpen={isPotionsExpanded}
          onToggle={() => setIsPotionsExpanded((value) => !value)}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {potionDefinitions.map((definition) => (
              <PotionCard
                key={definition.type}
                definition={definition}
                latestSession={potionLatestSessions[definition.type] ?? null}
                usageCount={potionUsageCount[definition.type] ?? 0}
                activating={activatingPotionType === definition.type}
                schedulingSessionId={schedulingPotionSessionId}
                loading={potionsLoading}
                onActivate={onActivatePotion}
                onReactivate={onReactivatePotion}
                onSchedule={onSchedulePotionFollowUp}
              />
            ))}
          </div>
        </CardShell>
      ) : null}
    </div>
  );
}
