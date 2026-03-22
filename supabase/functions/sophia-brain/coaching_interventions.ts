export type CoachingBlockerType =
  | "startup_inertia"
  | "overwhelm_or_blur"
  | "craving_or_urge"
  | "emotional_avoidance"
  | "environment_mismatch"
  | "relapse_discouragement";

export type CoachingTechniqueId =
  | "three_second_rule"
  | "minimum_version"
  | "ten_minute_sprint"
  | "if_then_plan"
  | "environment_shift"
  | "urge_delay"
  | "immediate_replacement"
  | "contrast_visualization"
  | "precommitment"
  | "relapse_protocol";

export interface CoachingBlockerDefinition {
  id: CoachingBlockerType;
  label: string;
  summary: string;
  detection_hints: string[];
}

export interface CoachingTechniqueDefinition {
  id: CoachingTechniqueId;
  label: string;
  summary: string;
  primary_goal: string;
  use_when: CoachingBlockerType[];
  avoid_when: string[];
  example_prompt: string;
}

export interface CoachingTechniqueBundle {
  primary: CoachingTechniqueId[];
  secondary: CoachingTechniqueId[];
}

export const COACHING_BLOCKER_REGISTRY: Record<
  CoachingBlockerType,
  CoachingBlockerDefinition
> = {
  startup_inertia: {
    id: "startup_inertia",
    label: "Inertie de demarrage",
    summary: "La personne sait quoi faire, mais n'arrive pas a lancer le premier geste.",
    detection_hints: [
      "repousse le debut sans opposition claire a l'action",
      "negocie longtemps avant de commencer",
      "dit qu'elle pourrait le faire mais ne part jamais vraiment",
    ],
  },
  overwhelm_or_blur: {
    id: "overwhelm_or_blur",
    label: "Surcharge ou flou",
    summary: "La tache parait trop grosse, trop vague, ou mentalement brouillonne.",
    detection_hints: [
      "ne sait pas par quoi commencer",
      "dit que c'est trop, trop grand, trop flou",
      "reste bloquee face a une action non decoupee",
    ],
  },
  craving_or_urge: {
    id: "craving_or_urge",
    label: "Pulsion ou craving",
    summary: "Une envie forte monte et pousse vers un comportement automatique.",
    detection_hints: [
      "envie forte immediate",
      "cigarette, sucre, scroll, achat, consommation",
      "sent qu'elle va craquer ou a failli craquer",
    ],
  },
  emotional_avoidance: {
    id: "emotional_avoidance",
    label: "Evitement emotionnel",
    summary: "La tache active du stress, de la peur, de la honte ou un inconfort interne.",
    detection_hints: [
      "retarde une action car elle parait penible ou angoissante",
      "evite un appel, un mail, une discussion, une tache exposee",
      "le vrai frein semble emotionnel plus que logistique",
    ],
  },
  environment_mismatch: {
    id: "environment_mismatch",
    label: "Environnement defavorable",
    summary: "Le contexte, le lieu, l'heure ou les declencheurs rendent l'execution fragile.",
    detection_hints: [
      "craque surtout a un moment ou un lieu precis",
      "declencheurs materiels ou sociaux tres presents",
      "routine du contexte plus forte que l'intention",
    ],
  },
  relapse_discouragement: {
    id: "relapse_discouragement",
    label: "Rechute ou decouragement",
    summary: "Apres un ratage ou une rechute, la personne se demobilise ou se juge.",
    detection_hints: [
      "dit que c'est fichu ou qu'elle a encore rate",
      "baisse les bras apres un ecart",
      "confond un faux pas avec un abandon complet",
    ],
  },
};

export const COACHING_TECHNIQUE_REGISTRY: Record<
  CoachingTechniqueId,
  CoachingTechniqueDefinition
> = {
  three_second_rule: {
    id: "three_second_rule",
    label: "Regle des 3 secondes",
    summary: "Couper la negotiation mentale et lancer un premier geste immediat.",
    primary_goal: "demarrer",
    use_when: ["startup_inertia"],
    avoid_when: [
      "charge emotionnelle haute",
      "la personne a besoin d'abord de clarifier la tache",
    ],
    example_prompt:
      "Au lieu d'y penser encore, lance juste le premier geste dans les 3 prochaines secondes.",
  },
  minimum_version: {
    id: "minimum_version",
    label: "Version minimale",
    summary: "Ramener l'action a une version presque trop facile pour reduire la resistance.",
    primary_goal: "reduire la friction",
    use_when: [
      "startup_inertia",
      "overwhelm_or_blur",
      "emotional_avoidance",
      "relapse_discouragement",
    ],
    avoid_when: [
      "la personne vient de demander une strategie plus ambitieuse",
    ],
    example_prompt:
      "On oublie la version ideale. Quelle est la version minimale que tu peux faire sans te battre ?",
  },
  ten_minute_sprint: {
    id: "ten_minute_sprint",
    label: "Sprint 10 minutes",
    summary: "Se donner un cadre court et ferme pour enclencher sans viser la perfection.",
    primary_goal: "passer a l'action",
    use_when: [
      "startup_inertia",
      "overwhelm_or_blur",
      "emotional_avoidance",
    ],
    avoid_when: [
      "la personne est tres fatiguee ou debordee",
      "le probleme principal est une pulsion immediate",
    ],
    example_prompt:
      "Tu ne t'engages pas pour plus. Juste 10 minutes propres, puis tu reevalues.",
  },
  if_then_plan: {
    id: "if_then_plan",
    label: "Plan si-alors",
    summary: "Pre-decider la reponse au moment ou le blocage se presente.",
    primary_goal: "preparer la reponse",
    use_when: [
      "overwhelm_or_blur",
      "craving_or_urge",
      "emotional_avoidance",
      "environment_mismatch",
    ],
    avoid_when: [
      "la personne a besoin d'abord d'une action immediate tres simple",
    ],
    example_prompt:
      "Si le moment critique arrive, quelle reponse simple veux-tu executer sans renegocier ?",
  },
  environment_shift: {
    id: "environment_shift",
    label: "Changement d'environnement",
    summary: "Sortir du contexte qui maintient la friction ou la pulsion.",
    primary_goal: "casser le contexte declencheur",
    use_when: [
      "craving_or_urge",
      "emotional_avoidance",
      "environment_mismatch",
    ],
    avoid_when: [
      "la contrainte reelle est purement organisationnelle",
    ],
    example_prompt:
      "Quand ca monte, change tout de suite de piece, d'activite ou de decor avant de decider.",
  },
  urge_delay: {
    id: "urge_delay",
    label: "Retard de pulsion",
    summary: "Reporter volontairement la decision pour laisser redescendre l'envie.",
    primary_goal: "absorber la pulsion",
    use_when: ["craving_or_urge"],
    avoid_when: [
      "la personne est deja dans une rechute emotionnelle lourde",
    ],
    example_prompt:
      "Quand l'envie monte, tu ne dis ni oui ni non tout de suite: tu reportes juste de 10 minutes.",
  },
  immediate_replacement: {
    id: "immediate_replacement",
    label: "Remplacement immediat",
    summary: "Substituer un comportement concret au comportement automatique.",
    primary_goal: "remplacer le reflexe",
    use_when: [
      "craving_or_urge",
      "environment_mismatch",
    ],
    avoid_when: [
      "aucun substitut concret n'est disponible ou acceptable",
    ],
    example_prompt:
      "Au moment du reflexe, tu remplaces tout de suite par une action precise deja choisie.",
  },
  contrast_visualization: {
    id: "contrast_visualization",
    label: "Visualisation contrastree",
    summary: "Mettre cote a cote le benefice de l'action et le cout concret de l'inaction.",
    primary_goal: "reactiver l'intention",
    use_when: [
      "emotional_avoidance",
      "relapse_discouragement",
    ],
    avoid_when: [
      "la personne est submergee emotionnellement",
    ],
    example_prompt:
      "Avant de choisir, visualise 30 secondes ce que tu gagnes si tu tiens, et ce que tu paies si tu laisses filer.",
  },
  precommitment: {
    id: "precommitment",
    label: "Pre-engagement",
    summary: "Modifier le terrain a l'avance pour rendre la bonne option plus probable.",
    primary_goal: "fiabiliser l'execution",
    use_when: [
      "environment_mismatch",
      "relapse_discouragement",
    ],
    avoid_when: [
      "la personne n'a pas encore clarifie le vrai moment critique",
    ],
    example_prompt:
      "Qu'est-ce que tu peux preparer maintenant pour rendre la bonne action plus facile plus tard ?",
  },
  relapse_protocol: {
    id: "relapse_protocol",
    label: "Protocole de rechute",
    summary: "Eviter le tout-ou-rien apres un ecart et repartir sur la repetition suivante.",
    primary_goal: "reprendre vite sans auto-saboter",
    use_when: ["relapse_discouragement"],
    avoid_when: [
      "la personne nie encore ce qui s'est passe et n'est pas disponible pour repartir",
    ],
    example_prompt:
      "Le plus important n'est pas de refaire le match: c'est de proteger la prochaine repetition.",
  },
};

export const COACHING_BLOCKER_TECHNIQUE_MATRIX: Record<
  CoachingBlockerType,
  CoachingTechniqueBundle
> = {
  startup_inertia: {
    primary: ["three_second_rule", "minimum_version"],
    secondary: ["ten_minute_sprint", "if_then_plan"],
  },
  overwhelm_or_blur: {
    primary: ["minimum_version", "ten_minute_sprint"],
    secondary: ["if_then_plan", "precommitment"],
  },
  craving_or_urge: {
    primary: ["urge_delay", "environment_shift"],
    secondary: ["immediate_replacement", "if_then_plan"],
  },
  emotional_avoidance: {
    primary: ["minimum_version", "if_then_plan"],
    secondary: ["ten_minute_sprint", "contrast_visualization"],
  },
  environment_mismatch: {
    primary: ["environment_shift", "precommitment"],
    secondary: ["immediate_replacement", "if_then_plan"],
  },
  relapse_discouragement: {
    primary: ["relapse_protocol", "contrast_visualization"],
    secondary: ["minimum_version", "precommitment"],
  },
};

export function listCoachingBlockers(): CoachingBlockerDefinition[] {
  return Object.values(COACHING_BLOCKER_REGISTRY);
}

export function listCoachingTechniques(): CoachingTechniqueDefinition[] {
  return Object.values(COACHING_TECHNIQUE_REGISTRY);
}

export function getCoachingBlockerDefinition(
  blocker: CoachingBlockerType,
): CoachingBlockerDefinition {
  return COACHING_BLOCKER_REGISTRY[blocker];
}

export function getCoachingTechniqueDefinition(
  technique: CoachingTechniqueId,
): CoachingTechniqueDefinition {
  return COACHING_TECHNIQUE_REGISTRY[technique];
}

export function getTechniqueCandidatesForBlocker(
  blocker: CoachingBlockerType,
): CoachingTechniqueBundle {
  return COACHING_BLOCKER_TECHNIQUE_MATRIX[blocker];
}

export function listAllTechniqueIdsForBlocker(
  blocker: CoachingBlockerType,
): CoachingTechniqueId[] {
  const bundle = getTechniqueCandidatesForBlocker(blocker);
  return [...bundle.primary, ...bundle.secondary];
}
