export type CoachingBlockerType =
  | "start_friction"
  | "overwhelm"
  | "avoidance"
  | "urge"
  | "environment_mismatch"
  | "relapse"
  | "unknown";

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

export type CoachingTechniqueDefinition = {
  id: CoachingTechniqueId;
  label: string;
  primary_goal: string;
};

export type CoachingBlockerDefinition = {
  id: Exclude<CoachingBlockerType, "unknown">;
  label: string;
};

const TECHNIQUES: CoachingTechniqueDefinition[] = [
  { id: "three_second_rule", label: "Règle des 3 secondes", primary_goal: "Réduire l'inertie de démarrage." },
  { id: "minimum_version", label: "Version minimale", primary_goal: "Réduire la taille de l'action." },
  { id: "ten_minute_sprint", label: "Sprint 10 minutes", primary_goal: "Créer un démarrage court." },
  { id: "if_then_plan", label: "Plan si-alors", primary_goal: "Préparer une réponse au blocage." },
  { id: "environment_shift", label: "Changement d'environnement", primary_goal: "Modifier le contexte immédiat." },
  { id: "urge_delay", label: "Délai d'envie", primary_goal: "absorber la pulsion" },
  { id: "immediate_replacement", label: "Remplacement immédiat", primary_goal: "Substituer un geste utile." },
  { id: "contrast_visualization", label: "Visualisation contrastée", primary_goal: "Clarifier le coût et le gain." },
  { id: "precommitment", label: "Pré-engagement", primary_goal: "Préparer le terrain à l'avance." },
  { id: "relapse_protocol", label: "Protocole de reprise", primary_goal: "Repartir après un écart." },
];

const BLOCKERS: CoachingBlockerDefinition[] = [
  { id: "start_friction", label: "Friction de démarrage" },
  { id: "overwhelm", label: "Surcharge" },
  { id: "avoidance", label: "Evitement" },
  { id: "urge", label: "Pulsion" },
  { id: "environment_mismatch", label: "Environnement defavorable" },
  { id: "relapse", label: "Reprise apres ecart" },
];

export const COACHING_BLOCKER_TECHNIQUE_MATRIX: Record<
  Exclude<CoachingBlockerType, "unknown">,
  { primary: CoachingTechniqueId[]; secondary: CoachingTechniqueId[] }
> = {
  start_friction: {
    primary: ["three_second_rule", "minimum_version"],
    secondary: ["ten_minute_sprint", "precommitment"],
  },
  overwhelm: {
    primary: ["minimum_version", "ten_minute_sprint"],
    secondary: ["if_then_plan", "contrast_visualization"],
  },
  avoidance: {
    primary: ["if_then_plan", "contrast_visualization"],
    secondary: ["three_second_rule", "precommitment"],
  },
  urge: {
    primary: ["urge_delay", "immediate_replacement"],
    secondary: ["environment_shift", "contrast_visualization"],
  },
  environment_mismatch: {
    primary: ["environment_shift", "precommitment"],
    secondary: ["minimum_version", "if_then_plan"],
  },
  relapse: {
    primary: ["relapse_protocol", "minimum_version"],
    secondary: ["three_second_rule", "immediate_replacement"],
  },
};

export function listCoachingTechniques(): CoachingTechniqueDefinition[] {
  return [...TECHNIQUES];
}

export function listCoachingBlockers(): CoachingBlockerDefinition[] {
  return [...BLOCKERS];
}

export function getCoachingBlockerDefinition(
  id: Exclude<CoachingBlockerType, "unknown">,
): CoachingBlockerDefinition {
  return BLOCKERS.find((blocker) => blocker.id === id) ?? BLOCKERS[0];
}

export function getCoachingTechniqueDefinition(
  id: CoachingTechniqueId,
): CoachingTechniqueDefinition {
  return TECHNIQUES.find((technique) => technique.id === id) ?? TECHNIQUES[0];
}

export function getTechniqueCandidatesForBlocker(
  blocker: CoachingBlockerType | "unknown",
): { primary: CoachingTechniqueId[]; secondary: CoachingTechniqueId[] } {
  if (blocker !== "unknown") return COACHING_BLOCKER_TECHNIQUE_MATRIX[blocker];
  return { primary: ["minimum_version", "if_then_plan"], secondary: ["three_second_rule", "ten_minute_sprint"] };
}

export function listAllTechniqueIdsForBlocker(
  blocker: Exclude<CoachingBlockerType, "unknown">,
): CoachingTechniqueId[] {
  const bundle = getTechniqueCandidatesForBlocker(blocker);
  return [...bundle.primary, ...bundle.secondary];
}
