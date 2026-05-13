import {
  baseOutput,
  normalizeText,
  type RunSkillInput,
  statementCandidate,
} from "../_shared/skill_helpers.ts";

export function runEmotionalRepairSkill(input: RunSkillInput) {
  const text = normalizeText(input.user_message);
  const actionBlocked =
    /j'arrive pas|je bloque|comment faire|quoi faire|mail bloque|message bloque|premier pas|envoyer une ligne|version exacte|action concrete/
      .test(text);
  const emotionLower =
    /ca va mieux|je suis plus calme|ok je peux|m'aide un peu|descend un peu|je peux peut[- ]?etre|je peux essayer/
      .test(text);
  if (emotionLower && actionBlocked) {
    return baseOutput("emotional_repair", {
      status: "handoff",
      response_intent: "handoff_to_execution",
      handoff_request: {
        target_skill_id: "execution_breakdown",
        reason: "emotion_baisse_action_reste_bloquee",
        confidence_band: "high",
      },
      reply:
        "Ok, l'emotion est un peu redescendue. On peut maintenant regarder le blocage concret, sans te juger.",
      state_patch: { summary: "Emotion lowered; action remains blocked." },
    });
  }
  const needsRegulation = /honte|panique|angoisse|nul|culpabil/.test(text);
  const asksRecurringSupport =
    /tous les jours|chaque jour|tous les soirs|chaque soir|tous les matins|chaque matin|rappel recurrent|soutien recurrent/
      .test(text);
  return baseOutput("emotional_repair", {
    status: "continue",
    response_intent: "de_shame",
    reply:
      "Ce que tu viens de dire ressemble plus a une attaque contre toi qu'a une information fiable. On peut garder le fait concret, sans transformer ca en verdict sur qui tu es.",
    diagnosis: {
      pattern: /nul|honte|culp/.test(text) ? "self_attack" : "emotional_pain",
    },
    recommendation_need: {
      needed: needsRegulation,
      type: "state_regulation",
      urgency: "medium",
      constraints: ["no_solution_pushing"],
    },
    operation_suggestions: [
      ...(needsRegulation
        ? [{
          operation_type: "select_state_potion" as const,
          reason: "state_regulation_before_concrete_action",
          confidence_band: "medium" as const,
          urgency: "medium" as const,
          source_skill_id: "emotional_repair",
          operation_input_hint: {
            state: /honte|culpabil|nul/.test(text)
              ? "shame_guilt"
              : "stress_pressure",
            potion_type: /honte|culpabil|nul/.test(text)
              ? "guerison"
              : "apaisement",
          },
          requires_user_consent: true,
        }]
        : []),
      ...(asksRecurringSupport
        ? [{
          operation_type: "create_recurring_reminder" as const,
          reason: "user_mentions_recurring_emotional_support",
          confidence_band: "medium" as const,
          urgency: "medium" as const,
          source_skill_id: "emotional_repair",
          operation_input_hint: {
            frequency: "daily",
            message: "Faire une pause courte et revenir sans auto-attaque.",
          },
          requires_user_consent: true,
        }]
        : []),
    ],
    memory_write_candidates: [
      statementCandidate(
        input.user_message,
        input.context.turn_frame.source_message_id,
        /nul|honte|angoisse/.test(text) ? 3 : 2,
        false,
      ),
    ],
    state_patch: {
      summary:
        "Self-attack softened; keep concrete facts separate from identity.",
    },
  });
}
