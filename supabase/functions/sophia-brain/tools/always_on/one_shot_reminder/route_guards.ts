import { compactText, extractReminderClause } from "./instruction_parser.ts";
import { hasRecurringCadenceHint } from "./time_parser.ts";

export function normalizeOneShotReminderText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’'`-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isMemoryRecallReminderPhrase(message: string): boolean {
  const clause = extractReminderClause(message)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  if (!clause) return false;
  return /^(ce\s+(?:qui|que|qu['’]|dont)|quoi|comment|pourquoi|le\s+bon|la\s+bonne|les\s+bons?|les\s+bonnes)\b/
    .test(clause);
}

export function isExistingOneShotReminderReferenceOnly(
  message: string,
): boolean {
  const text = compactText(message, 500)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase();
  if (!/\brappel\b/.test(text)) return false;
  const referencesExisting =
    /\b(je parle|il s agit|c est|celui|celle|ce rappel|le rappel)\b[\s\S]{0,120}\b(viens de|deja|déjà|programme|programmé|programmee|programmer|cree|créé|crée)\b/
      .test(text) ||
    /\b(rappel ponctuel|ce rappel|le rappel)\b[\s\S]{0,120}\b(que tu viens|que tu as|deja|déjà)\b/
      .test(text);
  const managementQuestion =
    /\b(si|comment|ou|où|retrouve|retrouver|verifie|vérifie|verifier|vérifier|deplace|déplace|deplacer|déplacer|supprime|supprimer|annule|annuler|change|changer|modifie|modifier)\b/
      .test(text) &&
    /\b(rappel ponctuel|ce rappel|le rappel|rappel de demain)\b/.test(text);
  return referencesExisting || managementQuestion;
}

function isRecurringReminderRequest(message: string): boolean {
  const text = String(message ?? "").toLowerCase();
  if (!/\brappel|rappelle|remind\b/.test(text)) return false;
  return hasRecurringCadenceHint(text);
}

function hasResolvableOneShotTimeHint(message: string): boolean {
  const text = String(message ?? "");
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (
    /\b(nouveau rappel|rappel ponctuel|cree un nouveau rappel|creer un nouveau rappel|programme un rappel|programme moi|rappelle moi|mets moi un rappel)\b/
      .test(normalized) &&
    (/\b\d{1,2}\s*h\s*\d{2}\b/.test(normalized) ||
      /\b\d{1,2}:\d{2}\b/.test(normalized))
  ) return true;
  return /\bdans\s+un\s+quart\s+d['’]heure\b/i.test(text) ||
    /\bdans\s+une\s+demi(?:-|\s)heure\b/i.test(text) ||
    /\bdans\s+(?:une?|1)\s+(?:minutes?|min|heures?|h|jours?)\b/i.test(text) ||
    /\bdans\s+\d{1,3}\s*(?:minutes?|min|heures?|h|jours?)\b/i.test(text) ||
    /\b(aujourd['’]hui|ce\s+soir|cet\s+apr[eè]s-midi|demain|apr[eè]s-demain)\b/i
      .test(text);
}

// Guard transitionnel: conserve les comportements QA existants lorsque le
// dispatcher n'a pas encore fourni de direct_effect structuré. Ne pas étendre.
export function isLikelyOneShotReminderRequest(message: string): boolean {
  const text = compactText(message, 500);
  if (!text) return false;
  if (isExistingOneShotReminderReferenceOnly(text)) return false;
  if (isMemoryRecallReminderPhrase(text)) return false;
  if (
    /\b(sans modifier|ne modifie rien|ne change rien|dernier check|bien en place)\b/i
      .test(text)
  ) return false;
  const reminderClause = extractReminderClause(text);
  if (reminderClause) return !hasRecurringCadenceHint(reminderClause);
  if (isRecurringReminderRequest(text)) return false;
  if (
    !/\brappel|rappelle|remind|programme|programmer|planifie|planifier\b/i
      .test(text)
  ) return false;
  return hasResolvableOneShotTimeHint(text);
}

export function isProductHelpQuestion(normalizedText: string): boolean {
  if (!/\b(rappel|rappelle|reminder)\b/.test(normalizedText)) return false;
  return /\b(comment|ou est ce que|ou je|ou puis je|je vais ou|dans l app|dans l application|dans l interface|retrouver|gerer|consulter)\b/
    .test(normalizedText) &&
    /\b(annuler|supprimer|modifier|corriger|retrouver|voir|gerer|rappel)\b/
      .test(normalizedText);
}

export function isStatusQuestion(normalizedText: string): boolean {
  if (!/\b(rappel|rappelle|reminder)\b/.test(normalizedText)) return false;
  if (
    /\b(quelle heure|vraiment programme|vraiment enregistre|confirme|confirmee|non confirme|non confirmee|statut|status|recap|recapitule|bilan|resume|fais le point|sans modifier|sans rien modifier|sans rien changer)\b/
      .test(normalizedText)
  ) return true;
  return /\b(a ete|as tu|tu as|deja|viens d|vient d)\b[\s\S]{0,80}\b(annule|annulee|cree|cree|programme|programmee)\b/
    .test(normalizedText);
}

export function detectsExplicitOneShotReminderCancel(
  message: string,
): boolean {
  const normalizedText = normalizeOneShotReminderText(message);
  const referencesReminder = /\brappel\b/.test(normalizedText) ||
    /\bping\b/.test(normalizedText);
  if (!referencesReminder) return false;
  if (
    isStatusQuestion(normalizedText) || isProductHelpQuestion(normalizedText)
  ) return false;
  if (
    /\b(si je veux|si jamais|plus tard|sans le lancer|sans lancer|ne lance|ne cree rien|ne programme rien|ne fais rien|propose seulement|propose le seulement)\b/
      .test(normalizedText)
  ) return false;
  if (
    /\b(a ete|as ete|avait ete|deja|viens d|vient d)\s+(annule|coupe|supprime|desactive|retire|enleve)\b/
      .test(normalizedText)
  ) return false;
  if (
    !/\b(annule|annuler|supprime|supprimer|coupe|couper|desactive|desactiver|enleve|enlever|retire|retirer|stoppe|stopper)\b/
      .test(normalizedText)
  ) return false;
  return !/\bne\b[\s\S]{0,18}\b(annule|supprime|coupe|touche|change|desactive|enleve)\b[\s\S]{0,24}\bpas\b/
    .test(normalizedText);
}

export function looksLikeReminderSlotConfirmation(
  message: string,
): boolean {
  const text = String(message ?? "").toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  return /\b(oui|ouais|ok|d accord|c est ca|c est bien ca|exact|exactement|valide|confirme|unique|une seule fois|une fois|ponctuel|ponctuelle|recurrent|recurrente|chaque jour|tous les jours|repete)\b/
    .test(text);
}

export function looksLikeReminderExecutionConfirmation(
  message: string,
): boolean {
  const text = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’`]/g, " ");
  if (
    /\b(comment|ou est|ou je|ou puis|pourquoi|peux tu|tu peux|pourrais|est ce que|dans l app|dans l application|dans l interface)\b/
      .test(text)
  ) return false;
  const hasExecutionVerb =
    /\b(programme|programmes|programmer|planifie|planifier|lance|lances|lancer|cale|cales|caler|active|activer|mets|met|mettre)\b/
      .test(text);
  if (!hasExecutionVerb) return false;
  const hasObjectOrNow =
    /\b(le|la|ca|ce|ce rappel|le rappel|celui la|maintenant|tout de suite|des maintenant|la maintenant|vas y|go)\b/
      .test(text);
  return hasObjectOrNow;
}

export function isExplicitOneShotReminderModificationRequest(
  message: string,
): boolean {
  const text = normalizeOneShotReminderText(message);
  const existingReminder =
    /\b(ce rappel|le rappel|rappel ponctuel|rappel que tu viens|celui de|celui que tu)\b/
      .test(text);
  const modification =
    /\b(decale|decaler|deplace|deplacer|avance|avancer|repousse|repousser|change|changer|modifie|modifier|mets le|met le|remets le|remet le|reprogramme|reprogrammer)\b/
      .test(text);
  const timeHint =
    /\b(demain|apres demain|aujourd hui|ce soir|matin|midi|soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2})\b/
      .test(text);
  if (!(existingReminder && modification && timeHint)) return false;

  const negatedModification =
    /\b(ne change rien|ne touche (?:rien|pas)|sans (?:rien )?(?:modifier|changer|toucher)|sans parler (?:de|d) (?:le |la )?(?:modifier|changer)|pas (?:de )?(?:modification|changement))\b/
      .test(text);
  if (negatedModification) return false;
  const productLocationQuestion =
    /\b(ou (?:est ce que je|je vais|je peux|le|la|les)|je vais ou|(?:juste |seulement )?l emplacement|dans l app|dans l application|dans l interface|retrouver|verifier|consulter|voir|gerer)\b/
      .test(text);
  return !productLocationQuestion;
}

export function isOneShotReminderExactStatusRequest(
  message: string,
): boolean {
  const text = normalizeOneShotReminderText(message);
  if (!/\b(rappel|rappelle|reminder)\b/.test(text)) return false;
  return /\b(quelle heure|heure vraiment|vraiment enregistre|vraiment programme|confirme|confirmee|non confirme|non confirmee|distinguer|11h05 ou 11h20|\d{1,2}\s*h\s*\d{2}\s+ou\s+\d{1,2}\s*h\s*\d{2})\b/
    .test(text);
}

export function isOneShotReminderReprogrammingFollowup(
  message: string,
): boolean {
  const text = normalizeOneShotReminderText(message);
  return /\b(nouveau moment exact|meme texte|meme message|au nouvel horaire)\b/
    .test(text) &&
    /\b(aujourd hui|demain|ce soir|\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2})\b/
      .test(text) &&
    !/\b(cree|creer|programme|programmer|rappelle moi|mets moi|envoie moi|dis moi)\b/
      .test(text);
}

export function looksLikeReminderCreationCommand(
  message: string,
): boolean {
  const text = normalizeOneShotReminderText(message);
  if (!/\b(rappel|rappelle|reminder)\b/.test(text)) return false;
  if (isStatusQuestion(text) || isProductHelpQuestion(text)) return false;
  if (/\b(recap|recapitule|recapitulatif|bilan|fais le point|resume)\b/.test(text)) {
    return false;
  }
  return /\b(mets moi|mets|met moi|programme moi|programme|planifie moi|planifie|cree moi|cree|creer|ajoute moi|ajoute|rappelle moi|rappel moi|previens moi|envoie moi|dis moi)\b/
    .test(text);
}

export function oneShotReminderModificationRouteGuard(
  message: string,
): { blocked: boolean; reason_code: string } {
  const blocked =
    isExplicitOneShotReminderModificationRequest(message) ||
    isOneShotReminderReprogrammingFollowup(message);
  return {
    blocked,
    reason_code: blocked
      ? "one_shot_reminder_modification_not_adjust_plan"
      : "not_one_shot_reminder_modification",
  };
}

export function oneShotReminderStatusBlocksToolFlow(args: {
  message: string;
  routeIsProductHelp: boolean;
  explicitProductHelp: boolean;
  activeCardDrafting: boolean;
  explicitOperationCommand: boolean;
  statusOnlyNoMutation: boolean;
}): { blocked: boolean; reason_code: string } {
  if (args.routeIsProductHelp) return { blocked: false, reason_code: "product_help_route" };
  if (args.explicitProductHelp) return { blocked: false, reason_code: "product_help_request" };
  if (args.activeCardDrafting) return { blocked: false, reason_code: "active_card_drafting" };
  if (args.explicitOperationCommand) return { blocked: false, reason_code: "explicit_operation_command" };
  if (
    args.statusOnlyNoMutation ||
    isOneShotReminderExactStatusRequest(args.message)
  ) {
    return {
      blocked: true,
      reason_code: isOneShotReminderExactStatusRequest(args.message)
        ? "one_shot_reminder_exact_status_request"
        : "status_only_request_blocks_tool_start",
    };
  }
  return { blocked: false, reason_code: "not_status_only" };
}

export function oneShotReminderDirectEffectBlockForNonMutationContext(
  args: {
    message: string;
    routeIsProductHelp: boolean;
    statusOnlyNoMutation: boolean;
    recapOnly: boolean;
  },
): { blocked: boolean; reason_code: string } {
  if (args.routeIsProductHelp) {
    return {
      blocked: true,
      reason_code: "product_help_blocks_one_shot_direct_effect",
    };
  }
  if (
    args.statusOnlyNoMutation ||
    isOneShotReminderExactStatusRequest(args.message) ||
    args.recapOnly ||
    isExistingOneShotReminderReferenceOnly(args.message)
  ) {
    return {
      blocked: true,
      reason_code: "non_mutation_context_blocks_one_shot_direct_effect",
    };
  }
  return { blocked: false, reason_code: "mutation_allowed" };
}

export function shouldPreferOneShotReminderOverRecurring(
  message: string,
): boolean {
  const text = normalizeOneShotReminderText(message);
  if (
    /\b(pas recurrent|pas de recurrent|pas reccurent|un seul|unique|ponctuel|one shot|texte exact|aujourd hui|aujourdhui)\b/
      .test(text)
  ) return true;
  if (
    /\b\d{1,2}\s*h\s*\d{0,2}\b/.test(text) &&
    /\b(rappel|texte exact|relire|reprendre)\b/.test(text)
  ) return true;
  return false;
}

export function explicitlySafeWorkReminderRequest(
  message: string,
): boolean {
  const text = normalizeOneShotReminderText(message);
  const safetyNegated =
    /\b(je ne suis pas en danger|je suis pas en danger|pas en danger|je ne suis pas fragile|je suis pas fragile)\b/
      .test(text);
  const workReminder =
    /\b(rappel|rappelle|programme|programmer|planifie|planifier)\b/.test(text) &&
    /\b(travail|boulot|mail|mails|camille|nora|budget|recap|synthese|dossier|client|slack)\b/
      .test(text);
  return safetyNegated && workReminder &&
    !/\b(me faire du mal|suicid|mourir|en finir)\b/.test(text);
}

export function shouldOneShotReminderSupersedeToolFlow(args: {
  message: string;
  hasActiveOrPendingToolFlow: boolean;
  safetyBlocksTools?: boolean;
}): boolean {
  if (args.safetyBlocksTools) return false;
  if (!args.hasActiveOrPendingToolFlow) return false;
  return looksLikeReminderCreationCommand(args.message);
}

export function hasExplicitOneShotReminderDirectEffectOverride(args: {
  directEffectsToRun: string[];
  directEffects:
    | Array<{
      effect_type?: string;
      explicitness?: string;
      target_status?: string;
      confidence_band?: string;
    }>
    | null
    | undefined;
  pendingToolSkillConfirmation: unknown;
}): boolean {
  if (!args.pendingToolSkillConfirmation) return false;
  if (!args.directEffectsToRun.includes("create_one_shot_reminder")) return false;
  return (args.directEffects ?? []).some((effect) =>
    effect.effect_type === "create_one_shot_reminder" &&
    effect.explicitness === "explicit" &&
    effect.target_status === "identified" &&
    effect.confidence_band === "high"
  );
}

export function isOneShotReminderOperationCommand(
  message: string,
): boolean {
  return looksLikeReminderCreationCommand(message) ||
    detectsExplicitOneShotReminderCancel(message) ||
    isExplicitOneShotReminderModificationRequest(message);
}

export function isExplicitAllPendingCancel(message: string): boolean {
  const text = normalizeOneShotReminderText(message);
  return /\b(tous|toutes|tout|mes rappels|les rappels)\b/.test(text) &&
    detectsExplicitOneShotReminderCancel(message);
}
