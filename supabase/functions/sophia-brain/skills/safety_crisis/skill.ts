import {
  baseOutput,
  normalizeText,
  type RunSkillInput,
  statementCandidate,
} from "../_shared/skill_helpers.ts";

export function runSafetyCrisisSkill(input: RunSkillInput) {
  const text = normalizeText(input.user_message);
  const critical = input.context.turn_frame.safety.risk_band === "critical" ||
    /me faire du mal|suicid|en finir|mourir/.test(text);
  const clarifiedNonImmediate =
    /pas maintenant|je ne vais pas|je vais pas|pas en danger/.test(text);
  if (clarifiedNonImmediate) {
    return baseOutput("safety_crisis", {
      status: "exit",
      response_intent: "deescalate_and_exit",
      reply:
        "Je garde le point important: tu n'es pas en danger immediat. On peut repartir doucement, sans forcer.",
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["no_product_push_during_safety"],
      },
      operation_suggestions: [{
        operation_type: "select_state_potion",
        reason: "safety_clarified_non_immediate_state_support_possible",
        confidence_band: "low",
        urgency: "low",
        source_skill_id: "safety_crisis",
        operation_input_hint: {
          state: "stress_pressure",
          potion_type: "apaisement",
        },
        requires_user_consent: true,
      }],
      state_patch: { summary: "Safety clarified as non-immediate." },
    });
  }
  return baseOutput("safety_crisis", {
    status: "continue",
    response_intent: critical ? "ground_safety" : "validate_pain",
    reply: critical
      ? "La priorite est que tu ne restes pas seul avec ca. Pose ce que tu as autour de toi, eloigne-toi de ce qui pourrait te blesser, et appelle le 3114 ou une personne proche maintenant."
      : "Je te crois. On ralentit: une respiration, un geste simple, et on reste sur les prochaines minutes plutot que sur toute ta vie.",
    diagnosis: {
      critical,
      risk_band: input.context.turn_frame.safety.risk_band,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: ["no_product_push_during_safety"],
    },
    memory_write_candidates: [
      statementCandidate(
        input.user_message,
        input.context.turn_frame.source_message_id,
        critical ? 4 : 3,
        false,
      ),
    ],
    state_patch: {
      summary: critical
        ? "Critical safety support active."
        : "Safety support active.",
    },
  });
}
