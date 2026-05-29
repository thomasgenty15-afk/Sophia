import type { RouteDecision } from "../contracts/route_decision.v1.ts";

function normalizeGuardText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function isConversationScopedRepereRequest(normalizedText: string): boolean {
  return /\b(pour cette conversation|dans cette conversation|comme repere|repere dans cette conversation|garde comme repere|garde ca comme repere)\b/
    .test(normalizedText) &&
    /\b(retiens|garde|repere|quand je dis|ca veut dire|cela veut dire)\b/.test(
      normalizedText,
    );
}

function isExplicitMemoryRetentionRequest(message: string): boolean {
  const text = normalizeGuardText(message);
  const asksRetention =
    /\b(retiens|retenir|memorise|memoriser|garde en tete|garder en tete|pour les prochaines fois|prochaines fois)\b/
      .test(text) || isConversationScopedRepereRequest(text);
  if (!asksRetention) return false;
  const coachPreference =
    /\b(preference|preferences|preference coach|preference de coaching|ton style|ta facon|ta maniere)\b/
      .test(text);
  return !coachPreference;
}

/**
 * Production guard.
 * Evite de transformer un repere conversationnel en promesse de memoire
 * durable quand aucun effet de mutation n'a ete engage.
 */
export function applyNonDurableMemoryPromiseGuard(args: {
  userMessage: string;
  responseContent: string;
  routeDecision?:
    | Pick<RouteDecision, "response_owner" | "direct_effects_to_run">
    | null;
}): string {
  if (!isExplicitMemoryRetentionRequest(args.userMessage)) {
    return args.responseContent;
  }
  if (
    args.routeDecision?.response_owner === "tool_skill" ||
    args.routeDecision?.response_owner === "pending_confirmation" ||
    (args.routeDecision?.direct_effects_to_run ?? []).length > 0
  ) {
    return args.responseContent;
  }
  let response = args.responseContent;
  response = response.replace(
    /^\s*ok,\s*not[eé]\s*(?:✅|☑️)?\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /^\s*(carr[eé]ment,\s*)?je (le |la |m'en )?retiens\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /\bje retiens que\b/gi,
    "je l'utilise ici comme repère :",
  );
  response = response.replace(
    /\bcomme repère pour la suite\b/gi,
    "comme repère dans cette conversation",
  );
  response = response.replace(
    /^\s*(oui,\s*)?c['’]?est not[eé]\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /^\s*bien\s+not[eé]\s*(?:✅|☑️)?\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /^\s*je note\.?\s*/i,
    "Je le garde comme repère dans cette conversation. ",
  );
  response = response.replace(
    /\bce que je garde en tête\b/gi,
    "le repère que j'utilise ici",
  );
  return response.trim();
}

/**
 * Production guard.
 * Defense finale contre un recap annonce mais vide ou interrompu.
 * Ne doit pas comprendre une intention metier nouvelle.
 */
export function applyIncompleteRecapGuard(args: {
  userMessage: string;
  responseContent: string;
}): string {
  const userText = normalizeGuardText(args.userMessage);
  if (!/\b(recap|recapitule|resume|synthese)\b/.test(userText)) {
    return args.responseContent;
  }
  const response = String(args.responseContent ?? "").trim();
  const normalized = normalizeGuardText(response);
  const announcesRecap = /\b(voici|voila|je recap|recap|recapitulatif)\b/.test(
    normalized,
  );
  const hasContentItem = /(^|\n)\s*(-|\d+[.)])\s+\S/.test(response) ||
    response.split(/\n+/).filter((line) => line.trim().length > 12).length >= 3;
  const endsAtIntro = /[:：]\s*(?:[🙂😊✅]*)$/.test(response);
  if (!announcesRecap || (hasContentItem && !endsAtIntro)) return response;
  return [
    "Je récapitule simplement :",
    "- Ce qui a été créé ou enregistré doit rester limité aux outils confirmés.",
    "- Ce qui était un conseil reste un repère de conversation, pas une écriture durable.",
    "- Pour maintenant : une seule prochaine action courte, sans lancer d'autre outil.",
  ].join("\n");
}

/**
 * Runtime policy.
 * Ramene une reponse trop large vers un format court quand le tour demande
 * explicitement un demarrage compact.
 */
export function applyCompactStartGuard(args: {
  userMessage: string;
  responseContent: string;
}): string {
  const user = normalizeGuardText(args.userMessage);
  const asksCompactStart =
    /\b(petit point d appui|demarrage compact|d[eé]marrage compact|juste demarrer|juste d[eé]marrer|juste debloquer|premier geste|premier pas|quoi faire maintenant)\b/
      .test(user);
  if (!asksCompactStart) return args.responseContent;
  const response = String(args.responseContent ?? "").trim();
  const looksTooWide = /(^|\n)\s*(?:a[.)]|b[.)]|\d+[.)]|-|•)\s+/i.test(
    response,
  ) ||
    /\b(option|choix|a\/b|a ou b|trois etapes|3 etapes|carte d attaque|potion)\b/i
      .test(response);
  const lineCount =
    response.split(/\n+/).filter((line) => line.trim().length > 0).length;
  if (!looksTooWide && lineCount <= 3) return response;
  return [
    "On fait compact : choisis une seule zone visible et ouvre-la.",
    "Premier geste : écris juste le titre du mini-pas suivant.",
  ].join("\n");
}

/**
 * Production guard.
 * Defense finale contre une reponse qui affirme un effet non execute.
 * Ne doit pas comprendre une intention metier nouvelle.
 */
export function applyUnexecutedEffectClaimGuard(args: {
  responseContent: string;
  intendedTools: string[];
  executedTools: string[];
}): string {
  const response = String(args.responseContent ?? "").trim();
  if (!response) return args.responseContent;

  const intended = new Set(
    (args.intendedTools ?? []).map((tool) => String(tool ?? "").trim()).filter(
      Boolean,
    ),
  );
  const executed = new Set(
    (args.executedTools ?? []).map((tool) => String(tool ?? "").trim()).filter(
      Boolean,
    ),
  );

  const reminderIntendedNotExecuted =
    intended.has("create_one_shot_reminder") &&
    !executed.has("create_one_shot_reminder");
  const cardIntendedNotExecuted = (intended.has("prepare_attack_card") &&
    !executed.has("prepare_attack_card")) ||
    (intended.has("prepare_defense_card") &&
      !executed.has("prepare_defense_card"));
  const preferenceIntendedNotExecuted =
    intended.has("update_coach_preferences") &&
    !executed.has("update_coach_preferences");

  if (
    !reminderIntendedNotExecuted && !cardIntendedNotExecuted &&
    !preferenceIntendedNotExecuted
  ) {
    return args.responseContent;
  }

  const normalized = normalizeGuardText(response);
  const alreadyHonest =
    /\b(je n ai (pas|rien)|je ne (peux|vais|pourrai) pas|je ne (re)?cree pas|je ne programme pas|pas encore (programme|cree|enregistre|en place)|n ai pas pu|souci technique|deja actif|deja programme|deja cree|existe deja|il me manque)\b/
      .test(normalized);
  if (alreadyHonest) return args.responseContent;

  const hasCheckmark = /✅/.test(response);
  const affirmsDone = hasCheckmark ||
    /\b(c est (bien )?(programme|programmee|enregistre|enregistree|cree|creee|prevu|planifie|planifiee|en place|fait)|est (bien )?(programme|programmee|enregistre|enregistree|prevu|planifie|planifiee|en place)|j ai (bien )?(programme|enregistre|cree|planifie|mis en place|ajoute)|correspond bien a ce que j ai|reste actif|deja indique|ca y est|voila c est)\b/
      .test(normalized);
  if (!affirmsDone) return args.responseContent;

  if (reminderIntendedNotExecuted) {
    return [
      "Je préfère être clair : je n'ai pas encore programmé ce rappel.",
      "Dis-moi le moment exact (et le texte) et je le programme tout de suite.",
    ].join(" ");
  }
  if (cardIntendedNotExecuted) {
    return "Je préfère être clair : je n'ai pas encore créé cette carte. Confirme-moi le moment précis et le geste, et je la prépare.";
  }
  return "Je préfère être clair : je n'ai pas encore enregistré cette préférence. Redis-la-moi simplement et je la garde.";
}
