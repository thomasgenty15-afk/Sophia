import {
  baseOutput,
  normalizeText,
  type RunSkillInput,
  statementCandidate,
} from "../_shared/skill_helpers.ts";

export function runDemotivationRepairSkill(input: RunSkillInput) {
  const text = normalizeText(input.user_message);
  const concreteAction = /je peux faire|je vais faire|marche|routine|appel/
    .test(text);
  if (concreteAction) {
    return baseOutput("demotivation_repair", {
      status: "handoff",
      response_intent: "handoff_to_execution",
      handoff_request: {
        target_skill_id: "execution_breakdown",
        reason: "concrete_action_emerged",
        confidence_band: "medium",
      },
      reply:
        "Il y a une action concrete qui apparait. On peut quitter le debat sur la motivation et reduire la friction.",
      state_patch: { summary: "Concrete action emerged from demotivation." },
    });
  }
  const cause = /fatigue|epuise|vide/.test(text)
    ? "fatigue"
    : /sens|sert a rien|utile/.test(text)
    ? "loss_of_meaning"
    : /rate|echec|encore/.test(text)
    ? "failure_accumulation"
    : "unclear";
  const asksRecurringSupport =
    /tous les jours|chaque jour|tous les soirs|chaque soir|tous les matins|chaque matin|rappel recurrent|soutien recurrent/
      .test(text);
  return baseOutput("demotivation_repair", {
    status: "continue",
    response_intent: "motivation_diagnosis",
    reply:
      "On ne va pas modifier ton plan juste parce que tu as un moment de decrochage. D'abord, je veux comprendre ce qui bloque: energie trop basse, premiere etape floue, ou peur de refaire le meme schema ?",
    diagnosis: { motivation_state: cause },
    recommendation_need: {
      needed: true,
      type: "motivation_repair",
      urgency: "medium",
      constraints: [
        "no_moralizing",
        "prefer_attack_card_over_plan_edit",
        "understand_before_solution",
      ],
    },
    operation_suggestions: [
      {
        operation_type: "select_state_potion",
        reason: "demotivation_state_regulation_before_action",
        confidence_band: "medium",
        urgency: "medium",
        source_skill_id: "demotivation_repair",
        operation_input_hint: {
          state: cause === "fatigue" ? "decrochage" : "fear_avoidance",
          potion_type: cause === "fatigue" ? "rappel" : "courage",
        },
        requires_user_consent: true,
      },
      ...(asksRecurringSupport
        ? [{
          operation_type: "create_recurring_reminder" as const,
          reason: "user_mentions_recurring_motivation_support",
          confidence_band: "medium" as const,
          urgency: "medium" as const,
          source_skill_id: "demotivation_repair",
          operation_input_hint: {
            frequency: "daily",
            message: "Revenir au plus petit geste utile sans attendre l'elan.",
          },
          requires_user_consent: true,
        }]
        : []),
    ],
    memory_write_candidates: [
      statementCandidate(
        input.user_message,
        input.context.turn_frame.source_message_id,
        2,
        false,
      ),
    ],
    state_patch: { summary: `Demotivation diagnosis: ${cause}.` },
  });
}
