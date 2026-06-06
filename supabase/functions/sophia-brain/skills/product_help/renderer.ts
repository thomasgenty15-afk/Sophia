import type {
  ProductHelpBridgeOperationType,
  ProductHelpDecision,
} from "./contract.ts";
import type { ProductHelpFeature } from "./knowledge.ts";

function formatList(items: string[], maxItems = 3) {
  return items.slice(0, maxItems).map((item) => `- ${item}`).join("\n");
}

function formatLocations(feature: ProductHelpFeature, exact = false) {
  if (feature.id === "resources.attack_card" && exact) {
    return "- Dashboard > Ressources > Cartes d'attaque du plan: quand une carte d'attaque du plan a ete generee.";
  }
  return feature.locations.slice(0, exact ? 1 : 2).map((location) => {
    const actions = location.user_can_do.length > 0
      ? ` Tu peux y ${location.user_can_do.slice(0, 3).join(", ")}.`
      : "";
    return `- ${location.surface}: ${location.when_visible}${actions}`;
  }).join("\n");
}

function bridgeLabel(operationType: ProductHelpBridgeOperationType): string {
  if (operationType === "prepare_attack_card") return "Carte d'attaque";
  if (operationType === "prepare_defense_card") return "Carte de defense";
  if (operationType === "select_state_potion") return "Potion";
  if (operationType === "create_recurring_reminder") return "Initiatives";
  if (operationType === "one_shot_reminder") return "rappel ponctuel";
  if (operationType === "adjust_plan_item") return "Ajuster le plan";
  return "Preferences";
}

function bridgeSentence(decision: ProductHelpDecision) {
  if (!decision.bridge) return "";
  return `\n\nJe peux t'expliquer le fonctionnement ici. Pour le faire, il faut passer par le flow ${
    bridgeLabel(decision.bridge.operation_type)
  } avec confirmation.`;
}

function cardImmutabilityNote(feature: ProductHelpFeature): string {
  if (feature.id === "resources.attack_card") {
    return "\n\nImportant: une carte d'attaque generee ne se modifie pas librement; seul le mot peut etre remplace sur une carte Mot de bascule depuis Ressources. Pour changer le contexte, la technique ou le contenu, il faut preparer une nouvelle carte apres confirmation.";
  }
  if (feature.id === "resources.defense_card") {
    return "\n\nImportant: une carte de defense peut etre ajustee depuis la plateforme/Ressources quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, on peut en preparer une nouvelle version apres confirmation.";
  }
  if (feature.id === "resources.plan_cards") {
    return "\n\nImportant: les cartes se modifient depuis la plateforme quand l'interface le permet. Depuis le chat, si une carte ne convient plus, on peut preparer une nouvelle version apres confirmation.";
  }
  return "";
}

function hasCommittedSource(decision: ProductHelpDecision): boolean {
  return decision.grounding.db_sources_used.some((source) =>
    source.source_type === "recent_effect" ||
    source.source_type === "db_projection"
  );
}

function renderMissingSource(decision: ProductHelpDecision) {
  if (decision.target.object_type === "one_shot_reminder") {
    return "Je ne vois pas assez de source ici pour confirmer le rappel exact. Cote produit, un rappel ponctuel se gere depuis le chat: pour le modifier ou l'annuler, le plus fiable est de me le redire clairement ici.";
  }
  if (
    decision.target.object_type === "recurring_reminder" ||
    decision.target.object_type === "initiative"
  ) {
    return "Je ne vois pas assez de source ici pour confirmer l'initiative exacte. Cote produit, les initiatives recurrentes se retrouvent dans l'onglet Initiatives.";
  }
  if (decision.target.object_type === "attack_card") {
    return "Je ne vois pas assez de source ici pour confirmer la carte exacte. Cote produit, une carte d'attaque generee se retrouve dans Dashboard > Ressources > Cartes d'attaque du plan. Limite: seul le mot peut etre remplace sur une carte Mot de bascule depuis Ressources; pour changer le contexte, la technique ou le contenu, il faut preparer une nouvelle carte apres confirmation.";
  }
  return "Je ne vois pas assez de source ici pour confirmer l'objet exact. Je peux expliquer ou ca se gere dans le produit, mais je ne peux pas affirmer son etat sans projection ou effet recent.";
}

function renderOneShotReminder(decision: ProductHelpDecision) {
  if (!hasCommittedSource(decision)) return renderMissingSource(decision);
  return [
    "Le rappel ponctuel que tu viens de creer se gere côté Initiatives, dans les rappels côté chat pour ce type-la.",
    "",
    'Pour le modifier ou l\'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain a 9h" ou "annule le rappel de demain".',
  ].join("\n");
}

function renderToolBridge(
  decision: ProductHelpDecision,
  feature: ProductHelpFeature,
) {
  const bridge = decision.bridge;
  if (!bridge) {
    return [
      `${feature.label}: ${feature.explain}`,
      "",
      "Je peux t'expliquer comment ca marche, mais pour le faire il faut passer par le flow adapte avec confirmation.",
      "",
      `Limites importantes:\n${formatList(feature.limits, 2)}`,
    ].join("\n");
  }
  return [
    `${feature.label}: ${feature.explain}`,
    "",
    `Je peux t'expliquer comment ca marche, mais pour le faire il faut passer par le flow ${
      bridgeLabel(bridge.operation_type)
    } avec confirmation.`,
    "",
    `Limites importantes:\n${formatList(feature.limits, 2)}`,
  ].join("\n");
}

function renderCompareFeatures(feature: ProductHelpFeature) {
  if (feature.id === "resources.attack_vs_defense_cards") {
    return [
      "Pour choisir: si ton besoin est surtout de te mettre a l'action, pars sur une carte d'attaque. Elle sert a demarrer, preparer le terrain et rendre le premier geste plus simple.",
      "",
      "La carte de defense sert plutot quand tu risques de derailer pendant l'action: evitement, impulsion, pression, fatigue ou autre moment de risque. Les deux peuvent coexister, mais elles ne repondent pas au meme probleme.",
    ].join("\n");
  }
  return `${feature.label}: ${feature.explain}`;
}

function renderWhereIsIt(
  decision: ProductHelpDecision,
  feature: ProductHelpFeature,
) {
  const locationText = formatLocations(feature, true);
  const existenceLimit =
    "Je ne peux pas confirmer qu'elle existe sans source recente ou projection; si elle existe, c'est l'endroit a verifier.";

  if (feature.id === "resources.attack_card") {
    return [
      "Si une carte d'attaque a ete generee, tu la retrouves ici:",
      locationText,
      "",
      existenceLimit,
      "Limite: seul le mot peut etre remplace sur une carte Mot de bascule depuis Ressources; pour changer le contexte, la technique ou le contenu, il faut preparer une nouvelle carte apres confirmation.",
    ].join("\n");
  }

  if (feature.id === "resources.defense_card") {
    return [
      "Si une carte de defense existe, tu la retrouves ici:",
      locationText,
      "",
      existenceLimit,
      "Limite: depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, il faut en preparer une nouvelle version apres confirmation.",
    ].join("\n");
  }

  return [
    `${feature.label}: voici ou verifier dans le produit.`,
    locationText,
    "",
    decision.grounding.db_sources_required && !hasCommittedSource(decision)
      ? "Je ne peux pas confirmer l'etat exact sans source recente ou projection."
      : "Si l'objet existe, c'est l'endroit a verifier.",
  ].join("\n");
}

export function renderCatalog(
  decision: ProductHelpDecision,
  feature: ProductHelpFeature,
) {
  const locationText = formatLocations(
    feature,
    decision.constraints.includes("exact_location_requested"),
  );

  if (decision.intent === "benefits") {
    return `${feature.label}: ${feature.explain}\n\nCe que ca apporte:\n${
      formatList(feature.benefits)
    }\n\nOu ca se trouve:\n${locationText}${cardImmutabilityNote(feature)}${
      bridgeSentence(decision)
    }`;
  }

  if (decision.intent === "compare_features") {
    return `${renderCompareFeatures(feature)}${bridgeSentence(decision)}`;
  }

  if (decision.intent === "where_is_it") {
    return `${renderWhereIsIt(decision, feature)}${bridgeSentence(decision)}`;
  }

  if (
    decision.intent === "how_to" ||
    decision.intent === "modify_or_cancel_where" ||
    decision.intent === "can_i_do_x"
  ) {
    return `${feature.label}: ${feature.how_to}\n\nOu ca se trouve:\n${locationText}\n\nLimites importantes:\n${
      formatList(feature.limits, 3)
    }${cardImmutabilityNote(feature)}${bridgeSentence(decision)}`;
  }

  return `${feature.label}: ${feature.explain}\n\nComment l'utiliser: ${feature.how_to}\n\nCe que ca apporte:\n${
    formatList(feature.benefits, 2)
  }${cardImmutabilityNote(feature)}${bridgeSentence(decision)}`;
}

export function renderProductHelpReply(
  decision: ProductHelpDecision,
  feature: ProductHelpFeature,
) {
  if (
    decision.grounding.db_sources_required &&
    !hasCommittedSource(decision) &&
    decision.target.kind !== "feature_catalog"
  ) {
    return renderMissingSource(decision);
  }

  if (decision.target.feature_id === "one_shot_reminder.chat") {
    return renderOneShotReminder(decision);
  }

  if (decision.intent === "object_status_question") {
    return renderMissingSource(decision);
  }

  if (decision.intent === "tool_action_request") {
    return renderToolBridge(decision, feature);
  }

  return renderCatalog(decision, feature);
}

export function enforceProductHelpReplyInvariants(
  reply: string,
  decision: ProductHelpDecision,
  feature: ProductHelpFeature,
) {
  let next = reply;
  const committed = hasCommittedSource(decision);
  if (!committed) {
    next = next
      .replace(/j'ai créé/gi, "je peux aider a creer")
      .replace(/j'ai annulé/gi, "je peux aider a annuler")
      .replace(/c'est programmé/gi, "la programmation passe par confirmation")
      .replace(/j'ai modifié/gi, "je peux aider a modifier")
      .replace(/j'ai enregistré/gi, "je peux aider a enregistrer")
      .replace(/c'est appliqué/gi, "l'application passe par confirmation");
  }
  for (const claim of feature.sophia_must_not_claim) {
    if (
      claim.includes("librement") &&
      /peut etre modifiee librement|modifier librement/i.test(next)
    ) {
      next = next.replace(
        /peut etre modifiee librement/gi,
        "ne se modifie pas librement",
      );
      next = next.replace(
        /modifier librement/gi,
        "modifier dans les limites disponibles",
      );
    }
  }
  return next;
}
