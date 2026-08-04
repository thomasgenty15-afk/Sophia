import { generateQuestionnaireDraft } from "../supabase/functions/generate-questionnaire-v2/index.ts";

type Question = {
  id: string;
  kind: string;
  question: string;
  capture_goal: string;
  options?: Array<{ id: string; label: string }>;
};

function textOf(question: Question): string {
  const options = (question.options ?? []).map((option) => option.label).join(" ");
  return `${question.question} ${options}`.toLowerCase();
}

function includesAny(source: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

const schema = await generateQuestionnaireDraft({
  requestId: `qa-unclear-subject-${Date.now()}`,
  userId: "qa-unclear-subject",
  transformationId: crypto.randomUUID(),
  title: "Vivre de ma passion",
  internalSummary:
    "La personne dit vouloir vivre de sa passion, mais la passion n'est pas identifiée. Le plan serait fragile si Sophia ne comprend pas d'abord de quelle passion il s'agit, sous quelle forme elle existe aujourd'hui, et ce que la personne imagine comme première activité rémunératrice.",
  userSummary:
    "Tu veux vivre de ta passion, mais on n'a pas encore précisé de quelle passion il s'agit ni à quoi ressemblerait concrètement le fait d'en vivre.",
  questionnaireContext: [
    "Clarifier l'objet concret de la passion avant de construire le plan.",
    "Comprendre la forme actuelle de cette passion dans la vie de la personne.",
    "Garder au moins une question qui aide à transformer cette clarification en plan d'action.",
  ],
  existingAnswers: {},
});

const custom = schema.questions.filter((question) => question.id === "q1" || question.id === "q2" || question.id === "q3") as Question[];
const [q1, q2, q3] = custom;

const q1Text = textOf(q1);
const q2Text = textOf(q2);
const q3Text = textOf(q3);

const checks = {
  q1ClarifiesObject: includesAny(q1Text, [
    /quelle? passion/,
    /de quelle passion/,
    /passion.*concr/,
    /objet.*concret/,
    /domaine/,
    /activit/,
  ]),
  q2DeepensUnderstanding: includesAny(q2Text, [
    /aujourd'hui/,
    /actuelle?/,
    /forme/,
    /niveau/,
    /comp[ée]tence/,
    /exp[ée]rience/,
    /contrainte/,
    /temps/,
  ]),
  q3OptimizesPlan: includesAny(q3Text, [
    /premier/,
    /r[ée]sultat/,
    /objectif/,
    /priorit/,
    /r[ée]aliste/,
    /action/,
    /revenu/,
    /r[ée]mun/,
    /mon[ée]tis/,
  ]),
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  pass,
  checks,
  custom_questions: custom.map((question) => ({
    id: question.id,
    kind: question.kind,
    capture_goal: question.capture_goal,
    question: question.question,
    options: question.options ?? [],
  })),
  metric: schema.metadata.measurement_hints,
}, null, 2));

if (!pass) {
  Deno.exit(1);
}
