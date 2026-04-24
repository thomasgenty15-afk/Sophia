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
  primaryMetricLabel?: string | null;
}): LevelReviewQuestion[] {
  const questions: LevelReviewQuestion[] = [
    {
      id: "global_metric_state",
      label: `Où est-ce que ça en est sur ${
        args.primaryMetricLabel?.trim() || "la métrique globale"
      } ?`,
      helper_text: "Même une estimation suffit: l'objectif est de situer le cap réel avant la suite.",
      input_type: "single_select",
      options: [
        { value: "strong_progress", label: "Net progrès" },
        { value: "slight_progress", label: "Léger progrès" },
        { value: "stable", label: "Plutôt stable" },
        { value: "regressed", label: "Ça a reculé" },
        { value: "unclear", label: "Difficile à dire" },
      ],
      required: true,
    },
    {
      id: "next_plan_coherence",
      label: "Est-ce que la suite du plan te paraît cohérente ?",
      helper_text: "Sophia décidera si le prochain niveau et les niveaux suivants doivent rester tels quels ou changer.",
      input_type: "single_select",
      options: [
        { value: "yes", label: "Oui, ça reste cohérent" },
        { value: "mostly", label: "Globalement oui" },
        { value: "no", label: "Non, ça ne colle pas" },
        { value: "not_sure", label: "Je ne sais pas encore" },
      ],
      required: true,
    },
    {
      id: "coherence_reason",
      label: "Si ce n'est pas cohérent, qu'est-ce qui ne l'est pas ?",
      helper_text: null,
      input_type: "free_text",
      options: [],
      placeholder: "Exemple: le prochain niveau va trop vite, ou il ne répond plus au vrai blocage.",
      required: false,
    },
    {
      id: "difficulty_signal",
      label: "Est-ce qu'il y a eu des difficultés importantes sur ce niveau ?",
      helper_text: "On distingue un frottement normal d'un vrai signal d'ajustement.",
      input_type: "single_select",
      options: [
        { value: "no", label: "Non, rien de majeur" },
        { value: "minor", label: "Oui, mais gérable" },
        { value: "blocking", label: "Oui, ça a vraiment bloqué" },
      ],
      required: true,
    },
    {
      id: "difficulty_details",
      label: "Si oui, qu'est-ce qui a été difficile ?",
      helper_text: null,
      input_type: "free_text",
      options: [],
      placeholder: `Exemple: dans "${args.title}", j'ai décroché quand...`,
      required: false,
    },
    {
      id: "pride",
      label: "De quoi tu es fier avec ce niveau ?",
      helper_text: "Ce point sert aussi à garder ce qui marche dans le prochain niveau.",
      input_type: "free_text",
      options: [],
      placeholder: "Exemple: j'ai tenu le cap même quand c'était imparfait.",
      required: true,
    },
  ];

  return questions;
}
