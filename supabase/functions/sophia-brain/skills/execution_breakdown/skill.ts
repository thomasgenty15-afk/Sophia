import {
  baseOutput,
  normalizeText,
  type RunSkillInput,
  statementCandidate,
} from "../_shared/skill_helpers.ts";

export function runExecutionBreakdownSkill(input: RunSkillInput) {
  const text = normalizeText(input.user_message);
  if (/je suis nul|honte|incapable/.test(text)) {
    return baseOutput("execution_breakdown", {
      status: "handoff",
      response_intent: "handoff_to_emotional_repair",
      handoff_request: {
        target_skill_id: "emotional_repair",
        reason: "auto_attack_dominates_execution_block",
        confidence_band: "high",
      },
      reply:
        "Avant de decouper l'action, il faut enlever le verdict contre toi. Sinon on va construire sur de la honte.",
      state_patch: { summary: "Auto-attack dominates execution blocker." },
    });
  }
  const hasTarget = /marche|pompes|dossier|appel|routine/.test(text) ||
    input.context.plan_items.length > 0;
  const target = input.context.plan_items[0] as
    | Record<string, unknown>
    | undefined;
  const targetHint = target
    ? {
      target: {
        kind: "plan_item",
        plan_item_id: String(target.id ?? ""),
        title: String(target.title ?? ""),
      },
      scope: {
        kind: "plan_item",
        plan_item_id: String(target.id ?? ""),
        title: String(target.title ?? ""),
      },
    }
    : {};
  const wantsPlanReduction =
    /trop lourd|alleger|all[eé]ger|reduire|réduire|plus petit/
      .test(text);
  const recurrentRisk = /rechute|tentation|craque|risque|declencheur/.test(
    text,
  );
  return baseOutput("execution_breakdown", {
    status: "continue",
    response_intent: hasTarget ? "diagnose_blocker" : "target_resolution",
    reply: hasTarget
      ? "On ne cherche pas encore la solution parfaite. On cherche le point exact ou ca bloque: demarrage, energie, flou, peur, ou environnement."
      : "Avant de reparer, il me faut la cible: quelle action precise bloque la maintenant ?",
    diagnosis: {
      stage: hasTarget ? "diagnosis" : "target_resolution",
      blocker_candidates: ["flou", "energie", "friction_demarrage"],
    },
    recommendation_need: {
      needed: hasTarget,
      type: "execution_repair",
      urgency: "medium",
      constraints: ["understand_before_solution"],
    },
    operation_suggestions: hasTarget
      ? [{
        operation_type: recurrentRisk
          ? "prepare_defense_card"
          : wantsPlanReduction
          ? "adjust_plan_item"
          : "prepare_attack_card",
        reason: recurrentRisk
          ? "execution_block_has_recurrent_risk"
          : wantsPlanReduction
          ? "action_looks_too_large"
          : "clear_execution_block_can_use_attack_card",
        confidence_band: "medium",
        urgency: "medium",
        source_skill_id: "execution_breakdown",
        operation_input_hint: recurrentRisk
          ? {
            attachment: targetHint.target,
            risk_situation: { label: "risque recurrent" },
          }
          : wantsPlanReduction
          ? { ...targetHint, adjustment_type: "reduce" }
          : {
            ...targetHint,
            blocker: { type: "execution_block" },
          },
        requires_user_consent: true,
      }]
      : [],
    memory_write_candidates: [
      statementCandidate(
        input.user_message,
        input.context.turn_frame.source_message_id,
        1,
        false,
      ),
    ],
    state_patch: {
      summary: hasTarget
        ? "Execution blocker diagnosis in progress."
        : "Need concrete target.",
    },
  });
}
