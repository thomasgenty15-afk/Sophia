import type {
  AdjustPlanCommittedEffect,
  AdjustPlanDecision,
} from "./contract.ts";

export type AdjustPlanEffectWriter = (effect: {
  type: "adjust_plan_item";
  operation_id: string;
  scope_kind: string;
  patch: Record<string, unknown>;
  requires_confirmation: true;
}) => Promise<{
  plan_patch_id: string;
  bridge_plan_item_id?: string | null;
}>;

export type AdjustPlanEffectMaterializationResult = {
  committed_effects: AdjustPlanCommittedEffect[];
  failed_effects: Array<{
    type: "adjust_plan_item";
    operation_id: string;
    reason_code: string;
  }>;
};

export async function applyAdjustPlanEffects(args: {
  effect_plan: AdjustPlanDecision["effect_plan"];
  writer: AdjustPlanEffectWriter;
}): Promise<AdjustPlanEffectMaterializationResult> {
  if (!args.effect_plan.allowed) {
    return { committed_effects: [], failed_effects: [] };
  }

  const committed_effects: AdjustPlanCommittedEffect[] = [];
  const failed_effects:
    AdjustPlanEffectMaterializationResult["failed_effects"] = [];
  for (const effect of args.effect_plan.effects) {
    try {
      const written = await args.writer(effect);
      committed_effects.push({
        type: "adjust_plan_item",
        operation_id: effect.operation_id,
        plan_patch_id: written.plan_patch_id,
        bridge_plan_item_id: written.bridge_plan_item_id ?? null,
        draft: {
          operation_type: "adjust_plan_item",
          output_schema: "plan_adjustment_draft_v1",
          draft: {
            title: "Applied adjust_plan_item effect",
            scope_label: effect.scope_kind,
            adjustment_type: "clarify",
            proposed_change: "Effect materialized from reducer patch.",
            why_it_helps: "The durable write succeeded.",
            confidence: "medium",
            decision_basis: {
              user_problem: "",
              inferred_need: "",
              confidence: "medium",
              evidence: [],
              uncertainty: [],
              must_preserve: [],
            },
            change_rationale: {
              why_this_change: "",
              expected_mechanism: "",
              success_condition: "",
            },
            ack_summary: {
              changed: [],
              unchanged: [],
              why_it_helps: "",
              confidence: "medium",
            },
            adjust_plan_result: {
              scope: effect.scope_kind === "whole_plan"
                ? "whole_plan"
                : effect.scope_kind === "current_level"
                ? "level"
                : "action",
              applied_change: {
                summary: "",
                changed_items: [],
                preserved_items: [],
              },
              boundaries: {
                affected_scope: effect.scope_kind,
                explicitly_not_affected: [],
                global_plan_impact: "none",
                explanation: "",
              },
              rationale: {
                user_problem: "",
                why_this_change: "",
                expected_effect: "",
                confidence: "medium",
                missing_info: [],
              },
              user_message_brief: "",
              user_message_detailed: "",
            },
            patch: effect.patch,
            allowed_patch_fields: Object.keys(effect.patch),
          },
          confirmation_message: "",
          execution_message: "",
          confirmation_actions: ["yes", "no"],
        },
      });
    } catch (error) {
      failed_effects.push({
        type: "adjust_plan_item",
        operation_id: effect.operation_id,
        reason_code: error instanceof Error
          ? error.message
          : "adjust_plan_effect_write_failed",
      });
    }
  }
  return { committed_effects, failed_effects };
}
