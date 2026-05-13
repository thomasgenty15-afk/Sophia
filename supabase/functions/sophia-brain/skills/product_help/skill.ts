import {
  baseOutput,
  normalizeText,
  type RunSkillInput,
} from "../_shared/skill_helpers.ts";
import {
  PRODUCT_HELP_FEATURES,
  type ProductHelpFeature,
  type ProductHelpIntent,
} from "./knowledge.ts";

const GENERIC_FEATURE_IDS = new Set(["dashboard.plan", "resources.overview"]);

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(normalizeText(pattern)));
}

function detectIntent(text: string): ProductHelpIntent {
  if (
    includesAny(text, [
      "a quoi ca sert",
      "a quoi sert",
      "pourquoi",
      "benefice",
      "benefices",
      "interet",
      "utile",
    ])
  ) {
    return "benefits";
  }
  if (
    includesAny(text, [
      "comment",
      "ou",
      "où",
      "trouve",
      "trouver",
      "utilise",
      "utiliser",
      "creer",
      "ajouter",
      "je peux",
      "modifier",
      "ouvrir",
    ])
  ) {
    return "how_to";
  }
  return "explain";
}

function scoreFeature(text: string, feature: ProductHelpFeature): number {
  let score = 0;
  const idParts = feature.id.split(/[._-]/g);
  for (const part of idParts) {
    if (part.length > 2 && text.includes(normalizeText(part))) score += 1;
  }
  for (const alias of feature.aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) continue;
    if (text.includes(normalizedAlias)) {
      score += normalizedAlias.includes(" ") ? 6 : 3;
    }
  }
  if (feature.operation_bridge) {
    for (const phrase of feature.operation_bridge.trigger_phrases) {
      if (text.includes(normalizeText(phrase))) score += 8;
    }
  }
  if (GENERIC_FEATURE_IDS.has(feature.id)) score -= 1;
  return score;
}

function retrieveFeature(text: string, contextText = ""): ProductHelpFeature {
  const lookupText = `${text}\n${contextText}`.trim();
  const scored = PRODUCT_HELP_FEATURES
    .map((feature) => ({ feature, score: scoreFeature(lookupText, feature) }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (best && best.score > 0) return best.feature;

  if (includesAny(lookupText, ["ressource", "carte", "potion", "labo"])) {
    return PRODUCT_HELP_FEATURES.find((feature) =>
      feature.id === "resources.overview"
    )!;
  }
  return PRODUCT_HELP_FEATURES.find((feature) =>
    feature.id === "dashboard.plan"
  )!;
}

function recentProductContext(input: RunSkillInput, text: string): string {
  if (
    !includesAny(text, [
      "elle",
      "la",
      "il",
      "ca",
      "ce suivi",
      "cette histoire",
      "apres",
      "ensuite",
      "la suite",
      "verrouille",
      "programme",
      "active",
    ])
  ) {
    return "";
  }
  return input.context.recent_messages
    .slice(-4)
    .map((turn) => normalizeText(turn.content))
    .join("\n")
    .slice(-1200);
}

function formatList(items: string[], maxItems = 3) {
  return items.slice(0, maxItems).map((item) => `- ${item}`).join("\n");
}

function formatLocations(feature: ProductHelpFeature) {
  return feature.locations.slice(0, 2).map((location) => {
    const actions = location.user_can_do.length > 0
      ? ` Tu peux y ${location.user_can_do.slice(0, 3).join(", ")}.`
      : "";
    return `- ${location.surface}: ${location.when_visible}${actions}`;
  }).join("\n");
}

function bridgeSentence(feature: ProductHelpFeature) {
  const bridge = feature.operation_bridge;
  if (!bridge) return "";
  return `\n\nSi tu veux vraiment le faire, ce n'est pas product_help qui execute: il faut passer par le flow ${bridge.skill_or_operation}, avec confirmation.`;
}

function cardImmutabilityNote(feature: ProductHelpFeature): string {
  if (
    feature.id !== "resources.attack_card" &&
    feature.id !== "resources.defense_card" &&
    feature.id !== "resources.plan_cards"
  ) return "";
  if (feature.id === "resources.attack_card") {
    return "\n\nImportant: une carte d'attaque generee ne se modifie pas librement. Seul le mot d'une carte Mot de bascule peut etre remplace depuis Ressources; pour changer le contexte, la technique ou le contenu, il faut preparer une nouvelle carte apres confirmation.";
  }
  if (feature.id === "resources.defense_card") {
    return "\n\nImportant: une carte de defense peut etre ajustee depuis la plateforme/Ressources quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, on peut aussi en preparer une nouvelle version apres confirmation.";
  }
  return "\n\nImportant: les cartes se modifient depuis la plateforme quand l'interface le permet. Depuis le chat, si une carte ne convient plus, on peut preparer une nouvelle version apres confirmation.";
}

function directAttackCardLocationReply(
  text: string,
  contextText = "",
): string | null {
  const lookupText = `${text}\n${contextText}`.trim();
  const asksLocation = includesAny(text, [
    "ou",
    "où",
    "retrouve",
    "retrouver",
    "trouve",
    "trouver",
    "ressources",
    "modifier",
    "imprimer",
  ]);
  const asksAttackCard = includesAny(lookupText, [
    "carte d'attaque",
    "cartes d'attaque",
    "attaque",
    "sas de dechargement",
    "sas de déchargement",
  ]);
  if (!asksLocation || !asksAttackCard) return null;
  return [
    "Tu la retrouves dans Dashboard > Ressources > Cartes d'attaque du plan.",
    "",
    "Cherche la carte liee a l'action concernee. Tu peux la consulter et l'utiliser. Si c'est une carte Mot de bascule, seul le mot peut etre remplace depuis Ressources; pour changer le contexte, la technique ou le contenu, on prepare une nouvelle carte apres confirmation.",
  ].join("\n");
}

function renderReply(feature: ProductHelpFeature, intent: ProductHelpIntent) {
  const locationText = formatLocations(feature);
  if (intent === "benefits") {
    return `${feature.label}: ${feature.explain}\n\nCe que ca apporte:\n${
      formatList(feature.benefits)
    }\n\nOu ca se trouve:\n${locationText}${cardImmutabilityNote(feature)}${
      bridgeSentence(feature)
    }`;
  }
  if (intent === "how_to") {
    return `${feature.label}: ${feature.how_to}\n\nOu ca se trouve:\n${locationText}\n\nLimites importantes:\n${
      formatList(feature.limits, 2)
    }${cardImmutabilityNote(feature)}${bridgeSentence(feature)}`;
  }
  return `${feature.label}: ${feature.explain}\n\nComment l'utiliser: ${feature.how_to}\n\nCe que ca apporte:\n${
    formatList(feature.benefits, 2)
  }${cardImmutabilityNote(feature)}${bridgeSentence(feature)}`;
}

function operationTypeFromBridge(
  bridge: ProductHelpFeature["operation_bridge"],
) {
  if (!bridge) return null;
  if (bridge.skill_or_operation === "adjust_plan") return "adjust_plan_item";
  if (bridge.skill_or_operation === "activate_potion") {
    return "select_state_potion";
  }
  if (bridge.skill_or_operation === "create_or_update_initiative") {
    return null;
  }
  return bridge.skill_or_operation;
}

export function runProductHelpSkill(input: RunSkillInput) {
  const text = normalizeText(input.user_message);
  const contextText = input.context.recent_messages
    .slice(-6)
    .map((turn) => normalizeText(turn.content))
    .join("\n")
    .slice(-1600);
  const directAttackLocation = directAttackCardLocationReply(text, contextText);
  if (directAttackLocation) {
    const feature = PRODUCT_HELP_FEATURES.find((item) =>
      item.id === "resources.attack_card"
    )!;
    return baseOutput("product_help", {
      status: "complete",
      response_intent: "how_to",
      reply: directAttackLocation,
      diagnosis: {
        feature_id: feature.id,
        feature_label: feature.label,
        operation_bridge: feature.operation_bridge ?? null,
        locations: ["Dashboard > Ressources"],
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: [
          "product_help_does_not_execute_operations",
          "operation_bridge_requires_confirmation_when_present",
        ],
      },
      operation_suggestions: [],
      state_patch: {
        summary: "Product help answered for attack card location.",
      },
    });
  }
  const feature = retrieveFeature(text, recentProductContext(input, text));
  const intent = detectIntent(text);
  const bridge = feature.operation_bridge;
  const operationType = operationTypeFromBridge(bridge);

  return baseOutput("product_help", {
    status: "complete",
    response_intent: intent,
    reply: renderReply(feature, intent),
    diagnosis: {
      feature_id: feature.id,
      feature_label: feature.label,
      operation_bridge: feature.operation_bridge ?? null,
      locations: feature.locations.map((location) => location.surface),
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "product_help_does_not_execute_operations",
        "operation_bridge_requires_confirmation_when_present",
      ],
    },
    operation_suggestions: operationType
      ? [{
        operation_type: operationType,
        reason: "product_help_operation_bridge_available",
        confidence_band: "medium",
        urgency: "medium",
        source_skill_id: "product_help",
        operation_input_hint: {},
        requires_user_consent: true,
      }]
      : [],
    state_patch: {
      summary: `Product help answered for ${feature.id}.`,
    },
  });
}
