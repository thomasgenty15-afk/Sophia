import { Check, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { isPhase1DeepWhyComplete } from "../../lib/phase1";
import type {
  Phase1Payload,
} from "../../types/v2";

type Phase1KickoffFlowProps = {
  phase1: Phase1Payload | null;
  transformationTitle?: string | null;
  preparingStart?: boolean;
  deepWhyPreparing?: boolean;
  storyPreparing?: boolean;
  savingDeepWhy?: boolean;
  onPrepareStart: () => void;
  onPrepareStory?: () => void;
  onRevealStory: () => void;
  onSaveDeepWhyAnswers: (
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => void;
};

const STORY_INTRO_HELPER =
  "Sophia t'a ecrit cette histoire, ou plutot l'histoire de ta transformation, a partir des informations qu'elle a sur toi. Elle espere que cela pourra t'aider a te projeter dans les vertus, les difficultes et l'etat d'esprit que cette transformation demande.";

function appendSuggestedAnswer(currentValue: string, suggestion: string) {
  const trimmedCurrent = currentValue.trim();
  const trimmedSuggestion = suggestion.trim();
  if (!trimmedSuggestion) return currentValue;
  if (!trimmedCurrent) return trimmedSuggestion;
  if (trimmedCurrent.includes(trimmedSuggestion)) return currentValue;
  return `${trimmedCurrent}\n\n${trimmedSuggestion}`;
}

export function Phase1KickoffFlow({
  phase1,
  transformationTitle,
  preparingStart = false,
  deepWhyPreparing = false,
  storyPreparing = false,
  savingDeepWhy = false,
  onPrepareStart,
  onPrepareStory,
  onRevealStory,
  onSaveDeepWhyAnswers,
}: Phase1KickoffFlowProps) {
  const [storyRevealedLocally, setStoryRevealedLocally] = useState(false);
  const [deepWhyDrafts, setDeepWhyDrafts] = useState<Record<string, string>>({});

  const story = phase1?.story ?? null;
  const deepWhy = phase1?.deep_why ?? null;
  const deepWhyReady = Boolean(deepWhy && deepWhy.questions.length > 0);
  const deepWhyCompleted = isPhase1DeepWhyComplete(phase1);
  const deepWhyAnswerMap = new Map(
    (deepWhy?.answers ?? []).map((item) => [item.question_id, item.answer]),
  );
  const storyReady = story?.status === "generated" &&
    Boolean(
      story.story?.trim() ||
        story.intro?.trim() ||
        story.key_takeaway?.trim() ||
        story.principle_sections.length > 0,
    );
  const storyVisible = storyRevealedLocally || Boolean(phase1?.runtime.story_viewed_or_validated);
  const isPreparingDeepWhy = preparingStart || deepWhyPreparing;
  const getDeepWhyDraftValue = (questionId: string) =>
    Object.prototype.hasOwnProperty.call(deepWhyDrafts, questionId)
      ? deepWhyDrafts[questionId] ?? ""
      : deepWhyAnswerMap.get(questionId) ?? "";
  const allDeepWhyQuestionsAnswered =
    deepWhy != null &&
    deepWhy.questions.length > 0 &&
    deepWhy.questions.every((question) => Boolean(getDeepWhyDraftValue(question.id).trim()));

  const currentStep = useMemo(() => {
    if (!deepWhyReady) return "prepare";
    if (!deepWhyCompleted) return "deep_why";
    if (!storyReady) return "story_prepare";
    if (!phase1?.runtime.story_viewed_or_validated) return "story";
    return "done";
  }, [
    deepWhyCompleted,
    deepWhyReady,
    phase1?.runtime.story_viewed_or_validated,
    storyReady,
  ]);
  const headerDescription = useMemo(() => {
    if (currentStep === "prepare" && isPreparingDeepWhy) {
      return "Sophia prepare ton pourquoi profond. Les questions arrivent, puis tu pourras les remplir juste ici.";
    }
    if (currentStep === "prepare") {
      return "On commence par preparer ton pourquoi profond, pour faire emerger ce qui compte vraiment avant la suite.";
    }
    if (currentStep === "deep_why") {
      return "Ton pourquoi profond est pret. Prends quelques minutes pour le remplir, puis on passera a ton histoire.";
    }
    if (currentStep === "story_prepare" && storyPreparing) {
      return "Sophia est en train de construire ton histoire a partir de ce que tu viens de clarifier.";
    }
    if (currentStep === "story_prepare") {
      return "Ton pourquoi profond est en place. Il ne reste plus qu'a generer ton histoire.";
    }
    if (currentStep === "story") {
      return "C'est maintenant le moment de decouvrir l'histoire du futur chemin que tu vas parcourir.";
    }
    return "Sophia te guide dans les premieres briques du plan.";
  }, [currentStep, isPreparingDeepWhy, storyPreparing]);

  if (currentStep === "done") return null;

  return (
    <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)] md:p-8">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
          Debut du plan
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
          {transformationTitle || "Ton plan"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {headerDescription}
        </p>
      </div>

      {currentStep === "prepare" ? (
        <div className="mt-8 rounded-3xl border border-violet-100 bg-violet-50/30 p-6">
          {isPreparingDeepWhy ? (
            <div className="rounded-[28px] border border-violet-200 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.96),rgba(245,243,255,0.95)_42%,rgba(23ede9,0.92)_100%)] p-6 shadow-[0_18px_48px_-30px_rgba(124,58,237,0.35)]">
              <div className="flex items-start gap-4">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-[0_12px_30px_-18px_rgba(124,58,237,0.55)]">
                  <span className="absolute inset-0 rounded-full border-2 border-violet-200/80" />
                  <span className="absolute inset-[5px] rounded-full border-2 border-dashed border-violet-400/80 animate-spin" />
                  <Sparkles className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-800">
                    Pourquoi profond en preparation
                  </p>
                  <p className="mt-2 text-sm leading-6 text-violet-950/85">
                    Sophia prépare quelques questions courtes pour faire ressortir ce qui compte
                    vraiment pour toi. Des qu'elles sont pretes, tu pourras les remplir ici.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/90 px-4 py-2 text-xs font-semibold text-violet-900">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                    Generation en cours...
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm leading-6 text-violet-950/80">
                Sophia prépare d'abord les questions de ton pourquoi profond. Ton histoire viendra juste après, avec ce que tu auras formulé dedans.
              </p>
              <button
                type="button"
                onClick={onPrepareStart}
                disabled={isPreparingDeepWhy}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200 transition-all hover:bg-violet-700 disabled:opacity-60"
              >
                {isPreparingDeepWhy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isPreparingDeepWhy ? "Preparation..." : "Preparer mon pourquoi profond"}
              </button>
            </>
          )}
        </div>
      ) : null}

      {currentStep === "story_prepare" ? (
        <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6">
          {storyPreparing ? (
            <div className="flex items-start gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-[0_12px_30px_-18px_rgba(217,119,6,0.45)]">
                <span className="absolute inset-0 rounded-full border-2 border-amber-200/80" />
                <span className="absolute inset-[5px] rounded-full border-2 border-dashed border-amber-400/80 animate-spin" />
                <Sparkles className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-800">
                  Histoire en preparation
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-950/85">
                  Sophia relit ce que tu as formule dans ton pourquoi profond pour en tirer une
                  histoire plus claire, plus concrete et plus utile pour la suite.
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/90 px-4 py-2 text-xs font-semibold text-amber-900">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  Generation en cours...
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm leading-6 text-amber-950/80">
                Ton pourquoi profond est pret. Tu peux maintenant lancer ton histoire a partir de
                ce que tu viens de clarifier.
              </p>
              {onPrepareStory ? (
                <button
                  type="button"
                  onClick={onPrepareStory}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white"
                >
                  <Sparkles className="h-4 w-4" />
                  Generer mon histoire
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {currentStep === "story" && storyReady && story ? (
        <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6">
          {!storyVisible ? (
            <>
              <p className="text-sm leading-6 text-amber-950/80">
                Ton histoire est prete. Tu peux maintenant la decouvrir avant de terminer ce niveau.
              </p>
              <button
                type="button"
                onClick={() => setStoryRevealedLocally(true)}
                disabled={storyPreparing}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {storyPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Reveler mon histoire
              </button>
            </>
          ) : (
            <div className="space-y-4">
              {story.intro ? (
                <p className="text-base leading-7 text-stone-800">{story.intro}</p>
              ) : null}
              <p className="text-sm leading-6 text-stone-600">
                {STORY_INTRO_HELPER}
              </p>
              {story.story ? (
                <div className="whitespace-pre-line rounded-2xl border border-white/70 bg-white/80 px-5 py-4 text-sm leading-7 text-stone-700">
                  {story.story}
                </div>
              ) : null}
              <button
                type="button"
                onClick={onRevealStory}
                className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white"
              >
                Terminer le niveau 1
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : null}

      {currentStep === "deep_why" && deepWhy ? (
        <div className="mt-8 space-y-6">
          {deepWhy.questions.map((question, index) => (
            <div key={question.id} className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm shadow-violet-100/50 transition-all hover:shadow-md hover:shadow-violet-100">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                  {index + 1}
                </span>
                <p className="mt-0.5 text-base font-semibold leading-relaxed text-violet-950">
                  {question.question}
                </p>
              </div>
              <div className="mt-5">
                <textarea
                  value={getDeepWhyDraftValue(question.id)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setDeepWhyDrafts((current) => ({
                      ...current,
                      [question.id]: nextValue,
                    }));
                  }}
                  rows={3}
                  className="w-full rounded-2xl border border-violet-100 bg-violet-50/30 px-5 py-4 text-sm text-stone-800 outline-none transition-all placeholder:text-violet-300 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100/50"
                  placeholder="Ta réponse..."
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2.5">
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
                            : deepWhyAnswerMap.get(question.id) ?? "",
                          suggestion,
                        ),
                      }));
                    }}
                    className="rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-2.5 text-left text-xs font-medium text-violet-800 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-100"
                  >
                    <span className="mr-1.5 font-bold text-violet-400">+</span>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={() =>
                onSaveDeepWhyAnswers(
                  deepWhy.questions.map((question) => ({
                    questionId: question.id,
                    question: question.question,
                    answer: getDeepWhyDraftValue(question.id),
                  })),
                )}
              disabled={savingDeepWhy || !allDeepWhyQuestionsAnswered}
              className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-violet-200 transition-all hover:bg-violet-700 disabled:opacity-50"
            >
              {savingDeepWhy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer et continuer
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
