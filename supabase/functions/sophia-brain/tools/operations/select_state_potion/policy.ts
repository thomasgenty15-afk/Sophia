import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { PotionSessionDraftV1 } from "./generator.ts";

/**
 * Policy split:
 * - hardConsentGuards are deterministic consent/safety guarantees. They can stay
 *   regex-based because they only block or suppress durable effects.
 */

function normalizePotionPolicyText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ")
    .toLowerCase()
    .trim();
}

export function detectsPotionFollowUpRefusal(
  message: string,
): boolean {
  const text = normalizePotionPolicyText(message);
  return [
    /\b(ne|n)\s+(?:me\s+)?(?:programme|programmes|planifie|planifies|mets|met|cree|crees)\s+(?:rien|aucun|pas)\b/,
    /\b(?:ne|n)\s+(?:me\s+)?(?:relance|relances|rappelle|rappelles)\s+pas\b/,
    /\b(?:pas|aucun|zero)\s+(?:de\s+)?(?:rappel|relance|suivi|check[- ]?in|routine|rituel)\b/,
    /\bsans\s+(?:rappel|relance|suivi|check[- ]?in|routine|rituel|semaine)\b/,
    /\b(?:pas|non)\s+(?:de\s+)?(?:recurrent|recurrence|hebdo|quotidien|routine|rituel)\b/,
    /\b(?:rien|aucun\w*)\s+(?:de\s+|d\s+)?(?:recurrent|recurrence|rituel|routine)\b/,
    /\bnon\s+(?:pour\s+|a\s+|au\s+)?(?:le\s+)?suivi\b/,
    /\b(?:rien d autre|rien d'autre)\b/,
    /\b(?:une seule fois|juste maintenant|juste pour maintenant|maintenant seulement)\b/,
  ].some((pattern) => pattern.test(text));
}

export function detectsExplicitStatePotionExit(
  message: string,
): boolean {
  const text = normalizePotionPolicyText(message);
  const targetsPotionOrMode =
    /\b(potion|mode|ce truc|ce machin|tout ca|tout ceci)\b/.test(text);
  if (!targetsPotionOrMode) return false;
  return /\b(stop|arrete|annule|coupe|laisse tomber|desactive|desamorcer|oublie)\b/
    .test(text);
}

export function detectsExplicitNoPotionRequest(
  message: string,
): boolean {
  const text = normalizePotionPolicyText(message);
  if (!/\bpotion\b/.test(text)) return false;
  return /\bpas de potion\b/.test(text) ||
    /\bsans potion\b/.test(text) ||
    /\baucune potion\b/.test(text) ||
    /\bpas (?:besoin )?de potion\b/.test(text) ||
    /\bne (?:me )?(?:propose|proposes|lance|lances|relance|relances|donne|donnes|fais|sors|ressors)\b[\s\S]{0,40}\bpotion\b/
      .test(text) ||
    /\b(?:stop|arrete|annule|coupe|oublie)\b[\s\S]{0,20}\bpotion\b/.test(
      text,
    );
}

export function statePotionDeclineReply(message: string): string {
  const text = normalizePotionPolicyText(message);
  const lines = ["Ok, je ne lance pas de potion."];
  if (
    /\b(slack|message|conversation|conversations|recherche|pile temporaire|facture|app)\b/
      .test(text)
  ) {
    lines.push(
      "Pour rester concret: quitte l'app ou la recherche ouverte, reviens a l'objet exact, puis fais seulement la prochaine action visible.",
    );
  }
  return lines.join("\n");
}

export function detectsExplicitConcreteDeliverableRequest(
  message: string,
): boolean {
  const text = normalizePotionPolicyText(message);
  return /\b(phrase|micro[- ]?action|reset|2 minutes|deux minutes|geste concret|juste un conseil|sans question)\b/
    .test(text);
}

export function buildExplicitNoPotionConcreteReply(
  message: string,
): string {
  const text = normalizePotionPolicyText(message);
  const asksForSinglePhrase =
    /\b(juste une phrase|une seule phrase|phrase courte|phrase douce|parle moi doucement|doucement|sans protocole|pas de protocole|sans question|pas de question|ne pas me juger|me juger)\b/
      .test(text);
  const asksForMicroAction =
    /\bmicro[- ]?action\b/.test(text) &&
    !/\b(sans protocole|pas de protocole|juste une phrase|une seule phrase)\b/
      .test(text);

  if (/\breset\b/.test(text) || /\b2 minutes\b/.test(text)) {
    return [
      "Reset 2 minutes - sans potion, sans question :",
      "Minute 1 : pose les deux pieds au sol, expire lentement, et nomme l'objet exact a reprendre.",
      "Minute 2 : ouvre seulement cet objet, fais le premier geste visible, puis stop.",
    ].join("\n");
  }
  if (
    asksForSinglePhrase && !asksForMicroAction
  ) {
    if (/\b(juger|nulle|nul|honte|doucement)\b/.test(text)) {
      return 'Phrase de réparation : "Ce que je ressens est lourd, mais ce n\'est pas un verdict sur moi."';
    }
    return 'Phrase de réparation : "Je peux me poser maintenant, sans devoir tout résoudre."';
  }
  if (asksForMicroAction) {
    return [
      'Phrase de réparation : "Je reviens au prochain geste, pas a toute la montagne."',
      "Micro-action : ferme ce qui attire ton attention, rouvre seulement la tâche utile, et fais 90 secondes dessus.",
    ].join("\n");
  }
  return [
    'Phrase de réparation : "Je reviens au prochain geste, pas a toute la montagne."',
    "Micro-action : ferme ce qui attire ton attention, rouvre seulement la tâche utile, et fais 90 secondes dessus.",
  ].join("\n");
}

export function noPotionReply(message: string): string {
  if (
    detectsExplicitConcreteDeliverableRequest(message)
  ) {
    return buildExplicitNoPotionConcreteReply(message);
  }
  return statePotionDeclineReply(message);
}

export const hardConsentGuards = {
  detectsExplicitNoPotionRequest: detectsExplicitNoPotionRequest,
  detectsPotionFollowUpRefusal: detectsPotionFollowUpRefusal,
  detectsExplicitStatePotionExit: detectsExplicitStatePotionExit,
};

export function isPendingStatePotionOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "select_state_potion";
  draft: PotionSessionDraftV1;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "select_state_potion" &&
      record.draft?.operation_type === "select_state_potion" &&
      record.draft?.draft?.potion_type,
  );
}

export function isPendingStatePotionRecommendationOperation(
  value: unknown,
): value is {
  operation_type: "select_state_potion";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "select_state_potion" &&
      (record.surface_id === "potion.state" ||
        record.surface_id === "state_potions"),
  );
}

function pendingOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : typeof record.draft?.operation_type === "string"
    ? record.draft.operation_type
    : null;
}

export function selectStatePotionRouteIsSelected(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
  userMessage: string;
}): boolean {
  const pending = args.tempMemory?.pending_tool_skill_confirmation ??
    args.tempMemory?.__pending_tool_skill_confirmation ??
    null;
  const pendingType = pendingOperationType(pending);
  if (pendingType === "select_state_potion") return true;
  if (pendingType) return false;

  const activeIntake = args.tempMemory?.__active_tool_skill_intake ??
    args.tempMemory?.active_tool_skill_intake ??
    null;
  const activeType = String((activeIntake as any)?.operation_type ?? "");
  if (activeType === "select_state_potion") return true;
  if (activeType) return false;

  const pendingRecommendation = args.tempMemory
    ?.__pending_recommendation_operation;
  if (isPendingStatePotionRecommendationOperation(pendingRecommendation)) {
    return true;
  }

  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "select_state_potion"
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== "select_state_potion"
  ) return false;

  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === "select_state_potion" &&
    intent.confidence_band !== "low"
  );
}
