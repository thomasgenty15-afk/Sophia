import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { detectsExplicitNoStatusRequest } from "../../router/turn_intent_arbitrator.ts";
import { isOneShotReminderExactStatusRequest } from "../../tools/always_on/one_shot_reminder/router.ts";
import type {
  StatusRecapConstraint,
  StatusRecapDecisionDraft,
  StatusRecapIntent,
  StatusRecapObjectType,
  StatusRecapProjection,
} from "./contract.ts";

function normalizeStatusRecapText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function isRecapOnlyRequest(message: string): boolean {
  const text = normalizeStatusRecapText(message);
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

export function isStatusOnlyNoMutationRequest(message: string): boolean {
  const text = normalizeStatusRecapText(message);
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

export function isFaitPrevuFragileRecapRequest(message: string): boolean {
  const text = normalizeStatusRecapText(message);
  return /\bfait\s*[,\/]?\s*prevu\s*[,\/]?\s*fragile\b/.test(text);
}

export function isExplicitConversationalFormatRequest(
  message: string,
): boolean {
  const text = normalizeStatusRecapText(message);
  if (isFaitPrevuFragileRecapRequest(message)) return true;
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

function routeHasStatusSignal(routeDecision: RouteDecision | null): boolean {
  if (!routeDecision) return false;
  if (routeDecision.selected_handler === "status_only_no_mutation_check") {
    return true;
  }
  if (routeDecision.reason_code.includes("status_only")) return true;
  return routeDecision.blocked_paths.some((path) =>
    path.path.includes("status_only") ||
    path.reason_code.includes("status_only") ||
    path.reason_code.includes("recap")
  );
}

function projectionHasAnySource(projection: StatusRecapProjection): boolean {
  return projection.attack_cards.length > 0 ||
    projection.defense_cards.length > 0 ||
    projection.one_shot_reminders.pending.length > 0 ||
    projection.one_shot_reminders.cancelled_recent.length > 0 ||
    projection.recurring_reminders.length > 0 ||
    projection.potion_sessions.length > 0 ||
    projection.coach_preferences.length > 0;
}

function targetsFromMessage(message: string): StatusRecapObjectType[] {
  const text = normalizeStatusRecapText(message);
  const targets: StatusRecapObjectType[] = [];
  if (text.includes("carte d attaque") || text.includes("attaque")) {
    targets.push("attack_card");
  }
  if (text.includes("carte de defense") || text.includes("defense")) {
    targets.push("defense_card");
  }
  if (text.includes("rappel ponctuel") || text.includes("rappel")) {
    targets.push("one_shot_reminder");
  }
  if (text.includes("recurrent")) targets.push("recurring_reminder");
  if (text.includes("potion")) targets.push("potion");
  if (text.includes("preference") || text.includes("coach")) {
    targets.push("coach_preference");
  }
  return targets.length ? Array.from(new Set(targets)) : ["unknown"];
}

function intentFromMessage(args: {
  userMessage: string;
  routeDecision: RouteDecision | null;
}): StatusRecapIntent {
  const text = normalizeStatusRecapText(args.userMessage);
  if (isFaitPrevuFragileRecapRequest(args.userMessage)) {
    return "fait_prevu_fragile";
  }
  if (
    isExplicitConversationalFormatRequest(args.userMessage) &&
    !isStatusOnlyNoMutationRequest(args.userMessage)
  ) {
    return "human_recap_no_db";
  }
  if (text.includes("annule") || text.includes("cancelled")) {
    return "cancelled_objects";
  }
  if (text.includes("preference") || text.includes("coach.")) {
    return "coach_preferences_status";
  }
  if (isOneShotReminderExactStatusRequest(args.userMessage)) {
    return "object_status";
  }
  if (isRecapOnlyRequest(args.userMessage)) return "recent_effects_recap";
  if (
    shouldRenderStatusOnlyNoMutation(args.userMessage) ||
    routeHasStatusSignal(args.routeDecision)
  ) {
    return targetsFromMessage(args.userMessage).length === 1 &&
        targetsFromMessage(args.userMessage)[0] !== "unknown"
      ? "object_status"
      : "durable_status";
  }
  return "unclear";
}

export function decideStatusRecap(args: {
  userMessage: string;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  projection: StatusRecapProjection;
}): StatusRecapDecisionDraft {
  const intent = intentFromMessage({
    userMessage: args.userMessage,
    routeDecision: args.routeDecision,
  });
  const constraints: StatusRecapConstraint[] = [
    "non_mutating",
    "db_grounded",
    "do_not_execute_tool",
    "do_not_claim_without_source",
    "do_not_render_product_how_to",
    "do_not_preempt_explicit_tool_command",
    "short_reply",
  ];
  if (intent === "fait_prevu_fragile") {
    constraints.push("format_fait_prevu_fragile");
  }
  const projectionUsed = intent !== "human_recap_no_db" && intent !== "unclear";
  const targetObjects = targetsFromMessage(args.userMessage);
  return {
    skill_id: "status_recap",
    intent,
    target_objects: targetObjects,
    constraints,
    projection_used: projectionUsed,
    missing_sources: projectionUsed && !projectionHasAnySource(args.projection)
      ? ["status_recap_projection"]
      : [],
    response_contract: {
      max_questions: 0,
      format: intent === "fait_prevu_fragile"
        ? "fait_prevu_fragile"
        : intent === "object_status" || intent === "coach_preferences_status"
        ? "object_answer"
        : intent === "recent_effects_recap" || intent === "cancelled_objects"
        ? "recap"
        : "compact",
      allow_human_context_lines: intent === "recent_effects_recap",
    },
    operation_suggestions: [],
  };
}
