import { CalendarDays, Gauge, Loader2, Sparkles, VenusAndMars } from "lucide-react";

import type {
  MinimalProfileDraft,
  QuestionnaireSchemaV2,
} from "../../lib/onboardingV2";
import type { PlanTypeClassificationV1 } from "../../types/v2";

type MinimalProfileProps = {
  value: MinimalProfileDraft;
  onChange: (value: MinimalProfileDraft) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  currentTransformationTitle?: string | null;
  planTypeClassification?: PlanTypeClassificationV1 | null;
  questionnaireSchema?: QuestionnaireSchemaV2 | null;
  questionnaireAnswers?: Record<string, unknown> | null;
  hasStoredBirthDate?: boolean;
  hasStoredGender?: boolean;
};

function monthLabel(value: number) {
  return value <= 1 ? "~1 mois" : `~${value} mois`;
}

function getAnswerForCaptureGoal(
  schema: QuestionnaireSchemaV2 | null,
  answers: Record<string, unknown> | null,
  captureGoal: string,
): unknown {
  if (!answers) return null;
  if (captureGoal in answers) return answers[captureGoal];
  const question = schema?.questions.find((candidate) =>
    candidate.capture_goal === captureGoal
  );
  return question && question.id in answers ? answers[question.id] : null;
}

function formatMetricValue(value: unknown, unit: string | null): string | null {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar === "number" && Number.isFinite(scalar)) {
    return unit ? `${scalar} ${unit}` : String(scalar);
  }
  if (typeof scalar === "string" && scalar.trim()) {
    return unit && !scalar.includes(unit) ? `${scalar.trim()} ${unit}` : scalar.trim();
  }
  return null;
}

export function MinimalProfile({
  value,
  onChange,
  onSubmit,
  isSubmitting,
  currentTransformationTitle,
  planTypeClassification = null,
  questionnaireSchema = null,
  questionnaireAnswers = null,
  hasStoredBirthDate = false,
  hasStoredGender = false,
}: MinimalProfileProps) {
  const canSubmit = Boolean(value.birthDate) && Boolean(value.gender) &&
    Boolean(value.pace) && !isSubmitting;
  const transformationLabel = currentTransformationTitle?.trim() || null;
  const shouldAskBirthDate = !hasStoredBirthDate;
  const shouldAskGender = !hasStoredGender;
  const journeyStrategy = planTypeClassification?.journey_strategy ?? null;
  const splitMetricGuidance = planTypeClassification?.split_metric_guidance ?? null;
  const showsTwoTransformationSplit = journeyStrategy?.mode === "two_transformations";
  const metricLabel =
    splitMetricGuidance?.metric_label ??
    questionnaireSchema?.metadata.measurement_hints.metric_label ??
    null;
  const metricUnit = questionnaireSchema?.metadata.measurement_hints.unit ?? null;
  const currentBaseline = formatMetricValue(
    getAnswerForCaptureGoal(
      questionnaireSchema,
      questionnaireAnswers,
      "_system_metric_baseline",
    ),
    metricUnit,
  );
  const transformation1Baseline =
    splitMetricGuidance?.transformation_1.baseline_text ?? currentBaseline;
  const transformation1Target =
    splitMetricGuidance?.transformation_1.target_text ??
    journeyStrategy?.transformation_1_goal ??
    null;
  const transformation2Baseline =
    splitMetricGuidance?.transformation_2?.baseline_text ??
    transformation1Target ??
    null;
  const transformation2Target =
    splitMetricGuidance?.transformation_2?.target_text ??
    journeyStrategy?.transformation_2_goal ??
    null;

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm md:p-8">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 sm:text-xs">
          Profil
        </p>
        <h1 className="mb-3 font-serif text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
          {transformationLabel
            ? `Derniers réglages pour : ${transformationLabel}`
            : "Derniers réglages avant ta transformation."}
        </h1>
        <p className="mb-8 text-base leading-relaxed text-gray-600">
          Ces informations servent à personnaliser l’accompagnement. Elles ne changent
          pas ce que tu veux travailler, seulement la manière de te l’amener.
        </p>

        {transformationLabel && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">
              <Sparkles className="h-3.5 w-3.5" />
              Transformation sélectionnée
            </div>
            <div className="text-base font-semibold text-gray-900">
              {`Transformation : ${transformationLabel}`}
            </div>
          </div>
        )}

        {showsTwoTransformationSplit ? (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                  Parcours en 2 transformations
                </p>
                <h2 className="mt-1 text-xl font-semibold text-gray-900">
                  Sophia te propose de découper ce parcours
                </h2>
              </div>
              <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-800">
                Parcours estimé : {monthLabel(journeyStrategy.total_estimated_duration_months)}
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-gray-700">
              {journeyStrategy.rationale}
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-blue-100 bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
                  Transformation 1
                </p>
                <h3 className="mt-2 text-base font-semibold text-gray-900">
                  {journeyStrategy.transformation_1_title}
                </h3>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">
                  Objectif associé
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-700">
                  {journeyStrategy.transformation_1_goal}
                </p>
                {transformation1Target ? (
                  <div className="mt-4 rounded-lg bg-blue-50 px-3 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
                      Direction mesurable
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-700">
                      Départ : {transformation1Baseline ?? "Non renseigné"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-700">
                      Cible : {transformation1Target}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-700">
                      Mesuré par : {metricLabel ?? "Objectif de réussite"}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-blue-100 bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
                  Transformation 2
                </p>
                <h3 className="mt-2 text-base font-semibold text-gray-900">
                  {journeyStrategy.transformation_2_title}
                </h3>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">
                  Objectif associé
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-700">
                  {journeyStrategy.transformation_2_goal}
                </p>
                {transformation2Target ? (
                  <div className="mt-4 rounded-lg bg-blue-50 px-3 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
                      Direction mesurable
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-700">
                      Départ : {transformation2Baseline ?? "Non renseigné"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-700">
                      Cible : {transformation2Target}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-700">
                      Mesuré par : {metricLabel ?? "Objectif de réussite"}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-blue-900/80">
              On prépare uniquement la première transformation maintenant. La deuxième sera
              cadrée plus tard, avec des informations fraîches, une fois la première terminée.
            </p>
          </div>
        ) : null}

        {shouldAskBirthDate || shouldAskGender ? (
          <div className="grid gap-5 md:grid-cols-2">
            {shouldAskBirthDate ? (
              <label className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  Date de naissance
                </span>
                <input
                  type="date"
                  value={value.birthDate}
                  onChange={(event) =>
                    onChange({ ...value, birthDate: event.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <CalendarDays className="h-4 w-4" />
                  Date de naissance déjà enregistrée
                </span>
                <p className="text-sm leading-relaxed text-emerald-900/80">
                  On la réutilise automatiquement pour la suite.
                </p>
              </div>
            )}

            {shouldAskGender ? (
              <label className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <VenusAndMars className="h-4 w-4 text-blue-600" />
                  Comment te définis-tu ?
                </span>
                <select
                  value={value.gender}
                  onChange={(event) =>
                    onChange({ ...value, gender: event.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Sélectionner…</option>
                  <option value="male">Homme</option>
                  <option value="female">Femme</option>
                  <option value="other">Autre</option>
                </select>
              </label>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <VenusAndMars className="h-4 w-4" />
                  Sexe déjà enregistré
                </span>
                <p className="text-sm leading-relaxed text-emerald-900/80">
                  On le réutilise automatiquement pour personnaliser l&apos;accompagnement.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">
              Date de naissance et sexe déjà enregistrés
            </p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">
              On ne te les redemandera plus. Il reste juste à choisir le rythme de cette transformation.
            </p>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <span className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Gauge className="h-4 w-4 text-blue-600" />
            Quel rythme tu veux pour cette transformation ?
          </span>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                value: "intense",
                label: "Intense",
                description: "Plus soutenu, plus exigeant, plus rapide.",
              },
              {
                value: "normal",
                label: "Normal",
                description: "Un bon équilibre entre ambition et réalisme.",
              },
              {
                value: "cool",
                label: "Cool",
                description: "Plus doux, plus léger, plus facile à tenir.",
              },
            ].map((option) => {
              const selected = value.pace === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      pace: option.value as MinimalProfileDraft["pace"],
                    })}
                  className={`rounded-xl border px-4 py-4 text-left transition ${
                    selected
                      ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200"
                      : "border-gray-200 bg-white text-gray-900 hover:border-blue-200"
                  }`}
                >
                  <div className="mb-1 text-sm font-bold">{option.label}</div>
                  <div className={`text-sm leading-relaxed ${
                    selected ? "text-blue-50" : "text-gray-600"
                  }`}
                  >
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            Le rythme influence surtout la densité et la vitesse du plan. Il n&apos;écrase pas la
            réalité de l&apos;objectif: si Sophia estime qu&apos;il faut plus de temps pour garder un
            plan lisible et tenable, elle le gardera.
          </p>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-base font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Génération du plan…
            </>
          ) : (
            "Générer mon plan"
          )}
        </button>
      </div>
    </section>
  );
}
