import type {
  EmotionalRepairConstraint,
  EmotionalRepairIntent,
  EmotionalRepairPhase,
  EmotionalRepairSkillDecision,
} from "./contract.ts";

export type EmotionalRepairSafeRenderInput = {
  decision?: EmotionalRepairSkillDecision | null;
  constraints?: EmotionalRepairConstraint[];
  reason: "intake_failure" | "validation_failure" | "technical_fallback";
};

function intentFromDecision(
  decision: EmotionalRepairSkillDecision | null | undefined,
): EmotionalRepairIntent {
  return decision?.intent ?? "unclear";
}

function phaseFromIntent(intent: EmotionalRepairIntent): EmotionalRepairPhase {
  switch (intent) {
    case "anxiety_or_panic":
    case "asks_regulation_without_potion":
      return "stabilize";
    case "relational_repair":
    case "asks_concrete_phrase":
      return "repair_relationship";
    case "emotion_lowered_action_blocked":
    case "action_card_ready":
      return "action_card_ready";
    case "acute_self_attack":
      return "separate_fact_from_identity";
    case "shame_or_guilt":
    default:
      return "de_shame";
  }
}

function requiresSoftPresenceOnly(
  input: EmotionalRepairSafeRenderInput,
): boolean {
  const decision = input.decision ?? null;
  const constraints = input.constraints ?? [];
  return Boolean(
    decision?.constraints.includes("soft_support_only") ||
      decision?.constraints.includes("no_technique") ||
      decision?.constraints.includes("no_protocol") ||
      constraints.includes("soft_support_only") ||
      constraints.includes("no_technique") ||
      constraints.includes("no_protocol") ||
      decision?.response_contract.allow_concrete_action === false,
  );
}

export function renderSafeEmotionalRepairReply(
  input: EmotionalRepairSafeRenderInput,
): string {
  const decision = input.decision ?? null;
  const intent = intentFromDecision(decision);
  if (requiresSoftPresenceOnly(input)) {
    switch (intent) {
      case "acute_self_attack":
        return "Je reste doucement avec toi: ce moment est douloureux, mais il ne dit pas qui tu es.";
      case "anxiety_or_panic":
      case "asks_regulation_without_potion":
        return "Je reste là doucement avec toi; tu n'as rien à réussir maintenant.";
      case "relational_repair":
      case "asks_concrete_phrase":
        return "Je reste avec la part tendre du lien, sans te pousser à réparer tout de suite.";
      case "shame_or_guilt":
      default:
        return "Je reste avec toi doucement: le raté est réel, mais il ne mérite pas de devenir un verdict contre toi.";
    }
  }
  if (decision?.constraints.includes("no_potion")) {
    return "D'accord, sans outil de régulation. Pose les pieds au sol et reviens à une seule expiration lente.";
  }
  switch (intent) {
    case "acute_self_attack":
      return "Ce verdict contre toi n'est pas une information fiable. On garde seulement le fait concret, sans te réduire à ça.";
    case "shame_or_guilt":
      return "Je prends la honte au sérieux, sans la transformer en verdict sur toi. On reste sur un fait à la fois.";
    case "anxiety_or_panic":
      return "On commence par redescendre d'un cran: pose les pieds au sol et laisse passer une expiration lente.";
    case "relational_repair":
    case "asks_concrete_phrase":
      return 'Tu peux réparer sobrement: "Je suis désolé de t\'avoir parlé sèchement. Tu ne méritais pas ça."';
    case "asks_regulation_without_potion":
      return "D'accord, sans outil. Pose les pieds au sol et reviens à une seule expiration lente.";
    case "emotion_lowered_action_blocked":
    case "action_card_ready":
      return "L'émotion a l'air assez redescendue pour regarder le blocage concret, sans revenir au verdict contre toi.";
    case "status_or_meta_question":
      return "Je reste dans la réponse courte et non mutante: aucun effet durable n'est lancé, on garde seulement un repère de conversation.";
    case "asks_recurring_support":
      return "Je peux rester sur le soutien ici, sans activer quoi que ce soit tant que tu ne le confirmes pas explicitement.";
    case "unclear":
    default:
      return "Je reste avec toi sur ce qui est là, sans lancer d'outil ni conclure quoi que ce soit sur toi.";
  }
}

export function buildFallbackEmotionalRepairDecision(
  input: EmotionalRepairSafeRenderInput,
): EmotionalRepairSkillDecision {
  const source = input.decision ?? null;
  const intent = intentFromDecision(source);
  const phase = source?.phase ?? phaseFromIntent(intent);
  const constraints = new Set<EmotionalRepairConstraint>(
    source?.constraints ?? input.constraints ?? [
      "no_tool",
      "no_plan",
      "no_questions",
      "do_not_persist_identity_attack",
    ],
  );
  constraints.add("no_tool");
  constraints.add("no_plan");
  constraints.add("no_questions");
  if (source?.constraints.includes("no_protocol")) {
    constraints.add("no_protocol");
  }
  if (source?.constraints.includes("no_technique")) {
    constraints.add("no_technique");
  }
  if (source?.constraints.includes("soft_support_only")) {
    constraints.add("soft_support_only");
  }
  const softPresenceOnly = constraints.has("no_protocol") ||
    constraints.has("no_technique") ||
    constraints.has("soft_support_only");
  return {
    skill_id: "emotional_repair",
    intent,
    phase,
    emotional_dominance: source?.emotional_dominance ?? "medium",
    context_domain: source?.context_domain ?? "unknown",
    constraints: [...constraints],
    response_contract: {
      max_questions: 0,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_concrete_action: softPresenceOnly
        ? false
        : source?.response_contract.allow_concrete_action ?? true,
      tone: source?.response_contract.tone ?? "grounded",
    },
    reply: renderSafeEmotionalRepairReply(input),
    state_patch: {
      ...(source?.state_patch ?? {}),
      summary: "Emotional repair safe fallback rendered a non-mutating reply.",
      fallback_reason: input.reason,
    },
  };
}
