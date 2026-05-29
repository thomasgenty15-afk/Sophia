import { normalizeText } from "../_shared/skill_helpers.ts";
import { PRODUCT_HELP_FEATURES, type ProductHelpFeature } from "./knowledge.ts";

const GENERIC_FEATURE_IDS = new Set(["dashboard.plan", "resources.overview"]);

function includesAlias(text: string, alias: string): boolean {
  const normalized = normalizeText(alias);
  return Boolean(normalized) && text.includes(normalized);
}

function featureMatches(text: string, feature: ProductHelpFeature): boolean {
  if (feature.aliases.some((alias) => includesAlias(text, alias))) return true;
  return feature.operation_bridge?.trigger_phrases.some((phrase) =>
    includesAlias(text, phrase)
  ) ?? false;
}

function longestMatchedPhraseLength(
  text: string,
  feature: ProductHelpFeature,
): number {
  const phrases = [
    ...feature.aliases,
    ...(feature.operation_bridge?.trigger_phrases ?? []),
  ];
  return phrases.reduce((best, phrase) => {
    const normalized = normalizeText(phrase);
    if (!normalized || !text.includes(normalized)) return best;
    return Math.max(best, normalized.length);
  }, 0);
}

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
  const text = normalizeText(userMessage);
  const exact = PRODUCT_HELP_FEATURES
    .filter((feature) => featureMatches(text, feature))
    .sort((left, right) =>
      longestMatchedPhraseLength(text, right) -
      longestMatchedPhraseLength(text, left)
    );
  if (exact.length > 0) return exact;

  if (
    ["ressource", "carte", "potion", "labo"].some((word) => text.includes(word))
  ) {
    return PRODUCT_HELP_FEATURES.filter((feature) =>
      feature.id === "resources.overview"
    );
  }

  return PRODUCT_HELP_FEATURES.filter((feature) =>
    feature.id === "dashboard.plan"
  );
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
