import { PRODUCT_HELP_FEATURES, type ProductHelpFeature } from "./knowledge.ts";

const GENERIC_FEATURE_IDS = new Set(["dashboard.plan", "resources.overview"]);

export function getProductHelpFeature(
  featureId: string | undefined,
): ProductHelpFeature | null {
  if (!featureId) return null;
  return PRODUCT_HELP_FEATURES.find((feature) => feature.id === featureId) ??
    null;
}

export function retrieveProductHelpCandidates(
  userMessage: string,
): ProductHelpFeature[] {
  void userMessage;
  return PRODUCT_HELP_FEATURES;
}

export function pickCatalogFeatureForObject(
  objectType: string | undefined,
): ProductHelpFeature | null {
  if (objectType === "attack_card") {
    return getProductHelpFeature("resources.attack_card");
  }
  if (objectType === "defense_card") {
    return getProductHelpFeature("resources.defense_card");
  }
  if (
    objectType === "one_shot_reminder" ||
    objectType === "recurring_reminder" ||
    objectType === "initiative"
  ) {
    return getProductHelpFeature("initiatives");
  }
  if (objectType === "potion") {
    return getProductHelpFeature("resources.potions");
  }
  if (objectType === "plan_item") {
    return getProductHelpFeature("plan.adjustment");
  }
  if (objectType === "preference") {
    return getProductHelpFeature("coach_preferences");
  }
  return null;
}

export function choosePrimaryCatalogCandidate(
  candidates: ProductHelpFeature[],
): ProductHelpFeature {
  const nonGeneric = candidates.find((feature) =>
    !GENERIC_FEATURE_IDS.has(feature.id)
  );
  return nonGeneric ?? candidates[0] ??
    PRODUCT_HELP_FEATURES.find((feature) => feature.id === "dashboard.plan")!;
}

export function catalogFeatureIds(
  features: Array<ProductHelpFeature | null | undefined>,
): string[] {
  return [...new Set(features.filter(Boolean).map((feature) => feature!.id))];
}
