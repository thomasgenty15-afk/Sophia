import type {
  LevelReviewQuestion,
  PlanDimension,
  PlanLevelWeek,
} from "../types/v2";

export function buildLevelReviewQuestions(args: {
  title: string;
  durationWeeks: number | null | undefined;
  weeks: PlanLevelWeek[];
  reviewFocus: string[];
  dimensions: PlanDimension[];
}): LevelReviewQuestion[] {
  const questions: LevelReviewQuestion[] = [
    {
      id: "pace_feel",
      label: "À la fin de ce niveau, comment tu as vécu le rythme ?",
      helper_text: "Ça nous aide à régler le dosage du niveau suivant.",
      input_type: "single_select",
      options: [
        { value: "too_light", label: "Trop léger" },
        { value: "balanced", label: "Bien dosé" },
        { value: "too_heavy", label: "Trop lourd" },
      ],
      required: true,
    },
    {
      id: "readiness",
      label: "Pour la suite, tu te sens comment ?",
      helper_text: null,
      input_type: "single_select",
      options: [
        { value: "need_more_time", label: "J'ai encore besoin d'un sas doux" },
        { value: "ready", label: "Je suis prêt pour la suite" },
        { value: "very_ready", label: "Je peux accélérer un peu" },
      ],
      required: true,
    },
  ];

  if ((args.durationWeeks ?? 0) > 1 || args.weeks.length > 1) {
    questions.push({
      id: "weekly_fit",
      label: "Le découpage semaine par semaine t'a aidé comment ?",
      helper_text: null,
      input_type: "single_select",
      options: [
        { value: "clear", label: "C'était clair et progressif" },
        { value: "uneven", label: "Certaines semaines étaient mal placées" },
        { value: "too_dense", label: "Le niveau restait trop dense" },
      ],
      required: true,
    });
  }

  if (args.dimensions.includes("missions")) {
    questions.push({
      id: "mission_fit",
      label: "Les missions de ce niveau étaient comment ?",
      helper_text: null,
      input_type: "single_select",
      options: [
        { value: "good", label: "Bien placées" },
        { value: "move_some", label: "Certaines étaient mal placées" },
        { value: "lighten_some", label: "Certaines étaient trop lourdes" },
      ],
      required: true,
    });
  }

  if (args.dimensions.includes("habits")) {
    questions.push({
      id: "habit_fit",
      label: "Et pour les habitudes de ce niveau ?",
      helper_text: null,
      input_type: "single_select",
      options: [
        { value: "keep", label: "Le dosage est bon" },
        { value: "lighten", label: "Il faudra les alléger un peu" },
        { value: "unstable", label: "Je n'ai pas réussi à les tenir" },
      ],
      required: true,
    });
  }

  questions.push({
    id: "support_need",
    label: "Pour le prochain niveau, tu as besoin de quoi ?",
    helper_text: args.reviewFocus.length > 0
      ? `Focus actuel: ${args.reviewFocus.slice(0, 3).join(" • ")}`
      : null,
    input_type: "single_select",
    options: [
      { value: "enough", label: "On peut garder le même cadre" },
      { value: "need_more", label: "J'ai besoin de plus de soutien" },
      { value: "need_less", label: "J'ai besoin de quelque chose de plus simple" },
    ],
    required: true,
  });

  questions.push({
    id: "free_text",
    label: "S'il y a un point à ne pas rater pour la suite, note-le ici.",
    helper_text: null,
    input_type: "free_text",
    options: [],
    placeholder: `Exemple: dans "${args.title}", le rythme du mardi me coupait l'élan.`,
    required: false,
  });

  return questions;
}
