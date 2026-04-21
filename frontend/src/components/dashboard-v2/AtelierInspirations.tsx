import { BookOpen, Compass, Target, ChevronDown, Loader2, Pencil, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type {
  Phase1DeepWhyState,
  Phase1StoryPrincipleSection,
  Phase1StoryState,
} from "../../types/v2";

type PrincipleKey =
  | "kaizen"
  | "ikigai"
  | "hara_hachi_bu"
  | "wabi_sabi"
  | "gambaru"
  | "shoshin"
  | "kintsugi"
  | "ma"
  | "zanshin"
  | "mottainai"
  | "sunao"
  | "fudoshin";

type PrincipleInfo = {
  key: PrincipleKey;
  titleJp: string;
  titleKanji: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
};

const PRINCIPLES: PrincipleInfo[] = [
  {
    key: "kaizen",
    titleJp: "Kaizen",
    titleKanji: "改善",
    description: "Un pas à la fois. Pas de révolution, juste 1% par jour.",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  {
    key: "ikigai",
    titleJp: "Ikigai",
    titleKanji: "生き甲斐",
    description:
      "Ta raison profonde. Ce qui te pousse quand la motivation s'éteint.",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  {
    key: "hara_hachi_bu",
    titleJp: "Hara Hachi Bu",
    titleKanji: "腹八分目",
    description: "La modération. Pas tout, pas rien — juste assez.",
    color: "text-sky-700",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
  },
  {
    key: "wabi_sabi",
    titleJp: "Wabi-sabi",
    titleKanji: "侘寂",
    description:
      "La beauté de l'imperfection. Tu as trébuché, pas échoué.",
    color: "text-rose-700",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-200",
  },
  {
    key: "gambaru",
    titleJp: "Gambaru",
    titleKanji: "頑張る",
    description: "Persévérer malgré tout. Le chemin continue.",
    color: "text-violet-700",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
  },
  {
    key: "shoshin",
    titleJp: "Shoshin",
    titleKanji: "初心",
    description: "Repartir simple. Regarder le chemin avec l'esprit du débutant.",
    color: "text-cyan-700",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
  },
  {
    key: "kintsugi",
    titleJp: "Kintsugi",
    titleKanji: "金継ぎ",
    description: "Faire de ses cassures un point d'appui, pas une condamnation.",
    color: "text-yellow-800",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
  },
  {
    key: "ma",
    titleJp: "Ma",
    titleKanji: "間",
    description: "Créer une pause, un espace, avant que l'automatisme reprenne la main.",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  {
    key: "zanshin",
    titleJp: "Zanshin",
    titleKanji: "残心",
    description: "Rester présent après l'effort. La vigilance calme qui évite la rechute.",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
  },
  {
    key: "mottainai",
    titleJp: "Mottainai",
    titleKanji: "もったいない",
    description: "Ne pas gaspiller ce qui a de la valeur: ton énergie, ton souffle, ton temps.",
    color: "text-lime-700",
    bgColor: "bg-lime-50",
    borderColor: "border-lime-200",
  },
  {
    key: "sunao",
    titleJp: "Sunao",
    titleKanji: "素直",
    description: "Se regarder honnêtement, sans se mentir ni se juger plus que nécessaire.",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  {
    key: "fudoshin",
    titleJp: "Fudoshin",
    titleKanji: "不動心",
    description: "Garder un centre stable quand l'envie, le stress ou la pression montent.",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
];

type AtelierInspirationsProps = {
  inspirationNarrative: string;
  unlockedPrinciples: Record<string, boolean>;
  transformationTitle?: string | null;
  phase1Story?: Phase1StoryState | null;
  phase1DeepWhy?: Phase1DeepWhyState | null;
  storyPreparing?: boolean;
  deepWhyPreparing?: boolean;
  savingDeepWhy?: boolean;
  onPrepareStory?: (detailsAnswer?: string | null) => void;
  onPrepareDeepWhy?: () => void;
  onSaveDeepWhyAnswers?: (
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => void;
};

const STORY_INTRO_HELPER =
  "Sophia a ecrit cette histoire a partir de ce qu'elle a compris de toi. Elle est la pour t'aider a retrouver du sens, du recul et de la force quand le chemin devient plus exigeant.";

function appendSuggestedAnswer(currentValue: string, suggestion: string) {
  const trimmedCurrent = currentValue.trim();
  const trimmedSuggestion = suggestion.trim();
  if (!trimmedSuggestion) return currentValue;
  if (!trimmedCurrent) return trimmedSuggestion;
  if (trimmedCurrent.includes(trimmedSuggestion)) return currentValue;
  return `${trimmedCurrent}\n\n${trimmedSuggestion}`;
}

function normalizeAnswer(value: string | null | undefined) {
  return (value ?? "").trim();
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

export function AtelierInspirations({
  inspirationNarrative,
  unlockedPrinciples: _unlockedPrinciples,
  transformationTitle,
  phase1Story,
  phase1DeepWhy,
  storyPreparing = false,
  deepWhyPreparing = false,
  savingDeepWhy = false,
  onPrepareStory,
  onPrepareDeepWhy,
  onSaveDeepWhyAnswers,
}: AtelierInspirationsProps) {
  const [storyDetailsAnswer, setStoryDetailsAnswer] = useState("");
  const [deepWhyDrafts, setDeepWhyDrafts] = useState<Record<string, string>>({});
  const [deepWhyEditing, setDeepWhyEditing] = useState<Record<string, boolean>>({});

  const [isStoryExpanded, setIsStoryExpanded] = useState(false);
  const [isDeepWhyExpanded, setIsDeepWhyExpanded] = useState(true);
  const [isPrinciplesExpanded, setIsPrinciplesExpanded] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);

  useEffect(() => {
    setStoryDetailsAnswer(phase1Story?.details_answer ?? "");
  }, [phase1Story?.details_answer, phase1Story?.status]);

  useEffect(() => {
    setDeepWhyEditing({});
  }, [phase1DeepWhy?.answers]);

  const deepWhyQuestions = phase1DeepWhy?.questions ?? [];
  const savedDeepWhyAnswers = phase1DeepWhy?.answers ?? [];
  const savedDeepWhyMap = new Map(
    savedDeepWhyAnswers.map((item) => [item.question_id, item.answer]),
  );
  const getDeepWhyDraftValue = (questionId: string) =>
    Object.prototype.hasOwnProperty.call(deepWhyDrafts, questionId)
      ? deepWhyDrafts[questionId] ?? ""
      : savedDeepWhyMap.get(questionId) ?? "";
  const hasPendingDeepWhyChanges = deepWhyQuestions.some((question) =>
    getDeepWhyDraftValue(question.id) !== (savedDeepWhyMap.get(question.id) ?? "")
  );
  const hasDeepWhyQuestions = deepWhyQuestions.length > 0;
  const deepWhySavedComplete = hasDeepWhyQuestions &&
    deepWhyQuestions.every((question) => Boolean(savedDeepWhyMap.get(question.id)?.trim()));
  const principleInfoByKey = new Map(
    PRINCIPLES.map((principle) => [principle.key, principle] as const),
  );
  const storySections = phase1Story?.principle_sections ?? [];

  const orderedStorySections = PRINCIPLES.flatMap((principle) => {
    const section = storySections.find((item) => item.principle_key === principle.key);
    return section ? [section] : [];
  });

  return (
    <div className="space-y-5">
      <section className="rounded-[30px] border border-violet-200 bg-white px-5 py-5 shadow-sm">
        <button
          type="button"
          onClick={() => setIsUsageOpen((value) => !value)}
          className="flex w-full items-center justify-center gap-2 text-center text-xs font-bold uppercase tracking-widest text-violet-700 transition-colors hover:text-violet-900"
        >
          {isUsageOpen ? "Masquer les explications" : "Comment utiliser cet espace"}
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${isUsageOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isUsageOpen ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 px-5 py-5 text-left text-sm leading-7 text-stone-700 animate-fade-in">
            Cet espace est la pour te recentrer. Reviens-y quand le doute monte, quand tu te
            disperses, ou quand tu veux retrouver le fil interieur de ta transformation. Tu y
            retrouveras ton pourquoi profond, ton histoire et tes principes pour remettre du sens,
            de la clarte et de l'elan dans ton chemin.
          </div>
        ) : null}
      </section>

      <CardShell
        title="Ton pourquoi profond"
        subtitle="Quand tout se brouille, reviens ici pour te rappeler ce que tu veux vraiment proteger, retrouver et faire grandir."
        icon={<Target className="h-5 w-5 text-violet-700" />}
        accentClass="bg-violet-50"
        isOpen={isDeepWhyExpanded}
        onToggle={() => setIsDeepWhyExpanded((v) => !v)}
      >
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-4">
            <div className="flex flex-wrap items-center justify-end gap-3">
              {!hasDeepWhyQuestions && onPrepareDeepWhy ? (
                <button
                  type="button"
                  onClick={onPrepareDeepWhy}
                  disabled={deepWhyPreparing}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-semibold text-violet-900 disabled:opacity-60"
                >
                  {deepWhyPreparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Activer
                </button>
              ) : null}
            </div>

            {!hasDeepWhyQuestions ? (
              <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-white/70 px-4 py-4 text-sm leading-6 text-violet-950/75">
                Active cet espace quand tu veux aller au-dela du plan et remettre des mots sur ce
                qui t'appelle vraiment.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {deepWhyQuestions.map((question, index) => {
                  const savedAnswer = savedDeepWhyMap.get(question.id);
                  const currentValue = getDeepWhyDraftValue(question.id);
                  const savedAnswerNormalized = normalizeAnswer(savedAnswer);
                  const currentValueNormalized = normalizeAnswer(currentValue);
                  const hasSavedAnswer = Boolean(savedAnswerNormalized);
                  const isEditing = Boolean(deepWhyEditing[question.id]);
                  const isDirty = currentValue !== (savedAnswer ?? "");
                  const showEditor = !hasSavedAnswer || isEditing;

                  return (
                    <div key={question.id} className="rounded-2xl border border-white/80 bg-white/80 px-4 py-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold leading-6 text-stone-900">
                              {question.question}
                            </p>
                            {isEditing ? (
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                isDirty
                                  ? "bg-violet-100 text-violet-900"
                                  : "bg-stone-100 text-stone-600"
                              }`}>
                                {isDirty ? "A enregistrer" : "Modification"}
                              </span>
                            ) : null}
                            {hasSavedAnswer && !isEditing ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setDeepWhyEditing((current) => ({
                                    ...current,
                                    [question.id]: true,
                                  }))}
                                className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1 text-[11px] font-semibold text-violet-900 transition-colors hover:bg-violet-50"
                                aria-label={`Modifier la reponse pour ${question.question}`}
                              >
                                <Pencil className="h-3 w-3" />
                                Modifier
                              </button>
                            ) : null}
                          </div>
                          {showEditor ? (
                            <>
                              <p className="mt-2 text-xs leading-5 text-stone-500">
                                {isDirty
                                  ? "Ta modification n'est pas encore enregistree."
                                  : hasSavedAnswer
                                  ? "Tu peux ajuster cette reponse puis enregistrer."
                                  : "Une reponse sincere suffit. Pas besoin d'ecrire beaucoup."}
                              </p>
                              <textarea
                                value={currentValue}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setDeepWhyDrafts((current) => ({
                                    ...current,
                                    [question.id]: nextValue,
                                  }));
                                }}
                                rows={3}
                                placeholder="Une reponse sincere suffit. Pas besoin d'ecrire beaucoup."
                                className="mt-3 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100/50"
                              />
                            </>
                          ) : (
                            <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm leading-6 text-stone-700">
                              {currentValueNormalized}
                            </div>
                          )}
                          {showEditor && !hasSavedAnswer && question.suggested_answers.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {question.suggested_answers.map((suggestion) => (
                                <button
                                  key={`${question.id}-${suggestion}`}
                                  type="button"
                                  onClick={() => {
                                    setDeepWhyDrafts((current) => ({
                                      ...current,
                                      [question.id]: appendSuggestedAnswer(
                                        Object.prototype.hasOwnProperty.call(current, question.id)
                                          ? current[question.id] ?? ""
                                          : savedDeepWhyMap.get(question.id) ?? "",
                                        suggestion,
                                      ),
                                    }));
                                  }}
                                  className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100"
                                >
                                  <span className="text-sm leading-none">+</span>
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {onSaveDeepWhyAnswers && hasPendingDeepWhyChanges ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/70 px-4 py-4">
                    <p className="text-sm text-violet-950/80">
                      Tu as des modifications non enregistrees.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onSaveDeepWhyAnswers(
                          deepWhyQuestions.map((question) => ({
                            questionId: question.id,
                            question: question.question,
                            answer: getDeepWhyDraftValue(question.id),
                          })),
                        )}
                      disabled={savingDeepWhy}
                      className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {savingDeepWhy ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        "Enregistrer"
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
      </CardShell>

      <CardShell
        title="Ton histoire"
        subtitle="A relire quand tu as besoin de reprendre de la force et de te souvenir du chemin que tu es en train d'ouvrir."
        icon={<BookOpen className="h-5 w-5 text-rose-700" />}
        accentClass="bg-rose-50"
        isOpen={isStoryExpanded}
        onToggle={() => setIsStoryExpanded((v) => !v)}
      >
          <div className="rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 px-5 py-5">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600">
                {phase1Story?.status === "generated"
                  ? "Prete"
                  : phase1Story?.status === "needs_details"
                  ? "Besoin de details"
                  : "En attente du pourquoi profond"}
              </span>
            </div>
            {transformationTitle ? (
              <h3 className="mt-2 text-xl font-semibold text-stone-900">
                {transformationTitle}
              </h3>
            ) : null}
            <p className="mt-4 text-sm italic leading-relaxed text-stone-700">
              {phase1Story?.intro ||
                inspirationNarrative ||
                "Relis cette histoire quand tu as besoin de retrouver du souffle, du recul et le sens de ton chemin."}
            </p>
            {phase1Story?.status === "generated" ? (
              <p className="mt-3 text-sm leading-6 text-stone-600">
                {STORY_INTRO_HELPER}
              </p>
            ) : null}

            {!deepWhySavedComplete && hasDeepWhyQuestions ? (
              <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 px-4 py-4 text-sm leading-6 text-stone-700">
                Complete et enregistre d&apos;abord ton pourquoi profond. Sophia s&apos;en sert comme matière pour écrire une histoire plus juste.
              </div>
            ) : null}

            {phase1Story?.status === "needs_details" ? (
              <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Ce qu'il manque pour l'affiner
                </p>
                <div className="mt-3 space-y-2">
                  {phase1Story.detail_questions.map((question) => (
                    <div key={question} className="rounded-xl bg-white px-3 py-2 text-sm text-stone-700">
                      {question}
                    </div>
                  ))}
                </div>
                <textarea
                  value={storyDetailsAnswer}
                  onChange={(event) => setStoryDetailsAnswer(event.target.value)}
                  rows={4}
                  placeholder="Réponds en quelques phrases. Sophia s'en servira pour générer une histoire plus juste."
                  className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-amber-300"
                />
                {onPrepareStory ? (
                  <button
                    type="button"
                    onClick={() => onPrepareStory(storyDetailsAnswer)}
                    disabled={storyPreparing || !storyDetailsAnswer.trim()}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {storyPreparing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generation...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Generer mon histoire
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            ) : phase1Story?.status !== "generated" && onPrepareStory && deepWhySavedComplete ? (
              <button
                type="button"
                onClick={() => onPrepareStory(null)}
                disabled={storyPreparing}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {storyPreparing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Preparation...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generer mon histoire
                  </>
                )}
              </button>
            ) : null}

            {phase1Story?.status === "generated" && phase1Story.story ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-4">
                  <p className="whitespace-pre-line text-sm leading-7 text-stone-700">
                    {phase1Story.story}
                  </p>
                </div>
                {phase1Story.key_takeaway ? (
                  <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Ce qu'il faut retenir
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-700">
                      {phase1Story.key_takeaway}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
      </CardShell>

      <CardShell
        title="Les 5 principes de ton histoire"
        subtitle="Tes 5 reperes interieurs pour garder le cap et savoir comment avancer, meme dans les jours flous."
        icon={<Compass className="h-5 w-5 text-emerald-700" />}
        accentClass="bg-emerald-50"
        isOpen={isPrinciplesExpanded}
        onToggle={() => setIsPrinciplesExpanded((v) => !v)}
      >
          <div className="rounded-2xl border border-stone-200 bg-stone-50/50 px-5 py-5">
            {orderedStorySections.length > 0 ? (
              <div className="space-y-3">
                {orderedStorySections.map((section) => {
                  const principle = principleInfoByKey.get(section.principle_key);
                  if (!principle) return null;

                  return (
                    <StoryPrincipleCard
                      key={section.principle_key}
                      principle={principle}
                      section={section}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-white/70 px-4 py-4 text-sm leading-6 text-stone-600">
                Les principes apparaîtront ici une fois l'histoire générée.
              </div>
            )}
          </div>
      </CardShell>
    </div>
  );
}

function StoryPrincipleCard({
  principle,
  section,
}: {
  principle: PrincipleInfo;
  section: Phase1StoryPrincipleSection;
}) {
  return (
    <article className={`rounded-2xl border ${principle.borderColor} ${principle.bgColor} px-4 py-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-sm font-semibold ${principle.color}`}>
          {principle.titleJp}
        </span>
        <span className="text-xs text-stone-400">{principle.titleKanji}</span>
      </div>
      <h4 className="mt-2 text-base font-semibold text-stone-900">
        {section.title}
      </h4>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white/80 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Ce que cela veut dire
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {section.meaning}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Dans ton histoire
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {section.in_your_story}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Exemple concret
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {section.concrete_example}
          </p>
        </div>
      </div>
    </article>
  );
}
