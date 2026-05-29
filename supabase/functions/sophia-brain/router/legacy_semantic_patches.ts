import {
  detectsExplicitAttackCardCreationRequest,
  detectsExplicitNoStatusRequest,
} from "./turn_intent_arbitrator.ts";
import {
  isOneShotReminderExactStatusRequest,
  isOneShotReminderOperationCommand,
} from "../tools/always_on/one_shot_reminder/router.ts";

export type LegacySemanticPatch = {
  id: string;
  owner: "dispatcher" | "skill" | "tool_skill" | "status_recap";
  reason: string;
  qa_reference?: string;
  removal_condition: string;
};

function normalizePatchText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * LEGACY SEMANTIC PATCH - do not extend.
 * Owner target: dispatcher.
 * Reason: preserves explicit no-tool/no-mutation turns until TurnFrame carries
 * this constraint reliably.
 * Removal condition: dispatcher emits a structured no_mutation/no_tool
 * constraint for the covered QA turns.
 */
export function detectExplicitNoToolRequest(message: string): boolean {
  const text = normalizePatchText(message);
  const noTool =
    /\b(ne lance rien|ne lance rien d autre|ne lance pas|ne cree rien|ne demarre rien|ne declenche rien|sans lancer|sans outil|pas de potion|meme pas une potion|pas maintenant)\b/
      .test(text);
  if (!noTool) return false;
  return /\b(juste|seulement|mini action|prochaine action|recap|recapitule|resume|reponds|donne moi|en respectant|respecte)\b/
    .test(text);
}

/**
 * LEGACY SEMANTIC PATCH - do not extend.
 * Owner target: dispatcher/coach_preferences.
 * Reason: protects local copy-edit requests from being routed as durable coach
 * preference updates.
 * Removal condition: dispatcher and update_coach_preferences intake separate
 * local text revision from durable preference mutation.
 */
export function isLocalTextRevisionRequest(message: string): boolean {
  const text = normalizePatchText(message);
  const asksLocalText =
    /\b(formule|formuler|reformule|reformuler|version|rends|rendre|phrase|mantra|texte|ligne)\b/
      .test(text) &&
    /\b(court|courte|ultra|plus court|plus courte|resume|resumer|reutiliser|copier|coller)\b/
      .test(text);
  if (!asksLocalText) return false;
  const actualCoachPreference =
    /\b(pour la suite|a partir de maintenant|desormais|preference|preferences|ton style|ta facon|ta maniere|pose moi|moins de questions|plus de questions|plus direct|plus doux|challenge)\b/
      .test(text);
  return !actualCoachPreference;
}

/**
 * LEGACY SEMANTIC PATCH - do not extend.
 * Owner target: status_recap.
 * Reason: protects non-mutating recap/status rendering while dispatcher status
 * intent is still incomplete.
 * Removal condition: status_recap skill owns recap-only intent from structured
 * TurnFrame/skill intake.
 */
export function isRecapOnlyRequest(message: string): boolean {
  const text = normalizePatchText(message);
  if (
    /\bnote de synthese\b/.test(text) &&
    !/\b(recap|recapitule|recapitulatif|bilan)\b/.test(text)
  ) {
    return false;
  }
  const recapFraming =
    /\b(fais le recap|fais moi le recap|recapitule|recapitulatif|bilan|recap exact|recap final|recap tres court|resume en|on s arrete la)\b/
      .test(text) ||
    (/\b(recap|resume)\b/.test(text) &&
      /\b(sans modifier|carte|rappel|preference|en place|cree ou|creee ou)\b/
        .test(text));
  return recapFraming;
}

/**
 * LEGACY SEMANTIC PATCH - do not extend.
 * Owner target: status_recap.
 * Reason: preserves status-only/no-mutation turns until L1 exposes a durable
 * status intent and explicit no-mutation constraint.
 * Removal condition: status_recap receives structured status/no_mutation
 * signals without re-reading raw user text.
 */
export function isStatusOnlyNoMutationRequest(message: string): boolean {
  const text = normalizePatchText(message);
  const explicitNoMutation =
    /\b(sans modifier|ne modifie rien|ne change rien|dernier check|bien en place|en place|verifie bien|verifie que|check final)\b/
      .test(text);
  const naturalDurableRecap =
    /\b(ce qui a (vraiment )?(ete )?(cree|creer|garde|gardee|gardes)|ce qui est (vraiment )?(cree|garde)|cree ou garde|crees ou gardes|vraiment ete cree|vraiment ete garde|juste pour la conversation|pour la conversation)\b/
      .test(text);
  const durableSurface =
    /\b(carte|carte d attaque|carte de defense|rappel|preference|preferences|cree|creer|garde|gardee|gardes|conversation)\b/
      .test(text);
  return (explicitNoMutation || naturalDurableRecap) && durableSurface;
}

/**
 * Runtime policy.
 * Format guard for the status recap renderer, not a new business intent.
 */
export function isExplicitConversationalFormatRequest(
  message: string,
): boolean {
  const text = normalizePatchText(message);
  if (
    /\bfait\s*,?\s*prevu\s*,?\s*fragile\b/.test(text) ||
    /\bfait\s*\/\s*prevu\s*\/\s*fragile\b/.test(text)
  ) return true;
  if (
    /\ben\s+(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?\b/.test(text) ||
    /\b(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?\s+(max|maximum|seulement)\b/
      .test(text) ||
    /\b(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?\s*,\s*sans\b/
      .test(text) ||
    /^(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?\b/.test(text)
  ) return true;
  if (
    /\ben\s+(une|1)\s+(seule\s+)?phrase\b/.test(text) ||
    /\b(une|1)\s+seule\s+phrase\b/.test(text)
  ) return true;
  if (
    /\bpas (le|de) (panneau|gabarit|format standard)\b|\bsans (le )?panneau\b/
      .test(text)
  ) return true;
  if (
    /\bpas de statut systeme\b|\bsans statut systeme\b|\bpas le statut systeme\b/
      .test(text)
  ) return true;
  if (
    /\b(recap|recapitule|resume) conversationnel\b|\brecap humain\b/.test(text)
  ) return true;
  return false;
}

export function shouldRenderStatusOnlyNoMutation(message: string): boolean {
  if (isExplicitConversationalFormatRequest(message)) return false;
  if (detectsExplicitNoStatusRequest(message)) return false;
  return (
    isStatusOnlyNoMutationRequest(message) ||
    isOneShotReminderExactStatusRequest(message) ||
    isRecapOnlyRequest(message)
  );
}

/**
 * Production invariant.
 * Identifie un flow de carte actif depuis l'etat runtime, sans relire le texte.
 */
export function isActiveCardDraftingOperation(activeIntake: unknown): boolean {
  const operationType = String((activeIntake as any)?.operation_type ?? "")
    .trim();
  return operationType === "prepare_attack_card" ||
    operationType === "prepare_defense_card";
}

/**
 * LEGACY SEMANTIC PATCH - do not extend.
 * Owner target: dispatcher/tool_skill.
 * Reason: prevents status-only rendering from swallowing explicit operation
 * commands until L1 reliably separates operation command vs status question.
 * Removal condition: TurnFrame exposes this split and QA confirms the status
 * redirections no longer need L4 text checks.
 */
export function isExplicitOperationCommand(message: string): boolean {
  return (
    isOneShotReminderOperationCommand(message) ||
    detectsExplicitAttackCardCreationRequest(message)
  );
}

/**
 * LEGACY SEMANTIC PATCH - do not extend.
 * Owner target: skill.
 * Reason: preserves a secondary conversation rendering addon for
 * minute-by-minute requests until owned by a conversation skill.
 * Removal condition: execution_breakdown or normal_reply skill owns this
 * request shape from structured intake.
 */
export function detectsMinuteByMinuteSequenceRequest(message: string): boolean {
  const text = normalizePatchText(message);
  return (
    /\b(sequence|minute par minute|\d+\s*minutes?)\b/.test(text) &&
    /\b(mails?|facture|traiter|faire|etapes?)\b/.test(text)
  );
}
