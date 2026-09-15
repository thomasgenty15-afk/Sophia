import type {
  LevelToolRecommendationState,
  ToolRecommendationCategoryKey,
  ToolRecommendationStatus,
  ToolRecommendationType,
} from "../types/v2";

const CATEGORY_LABELS: Record<ToolRecommendationCategoryKey, string> = {
  measurement_tracking: "Mesure",
  symptom_tracking: "Suivi de symptomes",
  sleep_support: "Sommeil",
  nutrition_prep: "Preparation nutrition",
  hydration_support: "Hydratation",
  movement_training: "Mouvement",
  recovery_mobility: "Recuperation",
  pain_relief_support: "Soulagement",
  distraction_blocking: "Anti-distraction",
  reproductive_health: "Sante reproductive",
  consumption_reduction: "Reduction",
  workspace_ergonomics: "Ergonomie",
};

export function extractLevelToolRecommendationState(
  handoffPayload: Record<string, unknown> | null,
): LevelToolRecommendationState | null {
  const onboardingV2 = (handoffPayload?.onboarding_v2 as
    | Record<string, unknown>
    | undefined) ?? null;
  const raw = onboardingV2?.level_tool_recommendations;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const candidate = raw as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.plan_id !== "string" ||
    typeof candidate.plan_version !== "number" ||
    typeof candidate.plan_updated_at !== "string" ||
    typeof candidate.generated_at !== "string" ||
    !Array.isArray(candidate.levels)
  ) {
    return null;
  }

  return candidate as unknown as LevelToolRecommendationState;
}

export function getToolRecommendationCategoryLabel(key: ToolRecommendationCategoryKey) {
  return CATEGORY_LABELS[key];
}

export function getToolRecommendationTypeLabel(type: ToolRecommendationType) {
  return type === "app" ? "App" : "Produit";
}

export function getToolRecommendationStatusLabel(status: ToolRecommendationStatus) {
  switch (status) {
    case "installed":
      return "Installé";
    case "purchased":
      return "Acheté";
    case "already_owned":
      return "Déjà eu";
    case "not_relevant":
      return "Pas pertinent";
    case "recommended":
    default:
      return "Recommandé";
  }
}
