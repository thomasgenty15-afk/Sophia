import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import {
  type ProductHelpIntakeModel,
  runProductHelpStructuredIntake,
} from "./intake.ts";
import {
  type ProductHelpLocalDispatcher,
  readProductHelpFlowState,
  reduceProductHelpLocalDispatcherOutput,
  runProductHelpLocalDispatcher,
} from "./local_flow.ts";
import { reduceProductHelpTurn } from "./reducer.ts";
import {
  choosePrimaryCatalogCandidate,
  getProductHelpFeature,
  pickCatalogFeatureForObject,
  retrieveProductHelpCandidates,
} from "./retrieval.ts";
import {
  type ProductHelpVisibleAgent,
  runProductHelpVisibleAgent,
} from "./visible_agent.ts";

export type ProductHelpRunSkillInput = RunSkillInput & {
  intake_model?: ProductHelpIntakeModel;
  local_dispatcher?: ProductHelpLocalDispatcher;
  visible_agent?: ProductHelpVisibleAgent;
};

function recentMessagesFromContext(input: ProductHelpRunSkillInput) {
  return Array.isArray(input.context.recent_messages)
    ? input.context.recent_messages.flatMap((message) => {
      const role = String((message as any)?.role ?? "");
      const content = String((message as any)?.content ?? "").trim();
      if ((role === "user" || role === "assistant") && content) {
        return [{ role: role as "user" | "assistant", content }];
      }
      return [];
    }).slice(-8)
    : [];
}

function compactActiveFlowContext(
  activeState: unknown,
): Record<string, unknown> | null {
  if (!activeState || typeof activeState !== "object") return null;
  const state = activeState as any;
  return {
    skill_id: String(state.skill_id ?? "").trim() || null,
    status: String(state.status ?? "").trim() || null,
    turn_count: Number(state.turn_count ?? 0) || 0,
    working_state:
      state.working_state && typeof state.working_state === "object"
        ? state.working_state
        : null,
  };
}

function recentCommittedEffects(turnFrame: unknown): unknown[] {
  const frame = turnFrame as any;
  const direct = Array.isArray(frame?.direct_effects)
    ? frame.direct_effects
    : [];
  return direct.filter((effect: any) => effect?.target_status === "identified")
    .slice(0, 8);
}

function fallbackSkillOutput(reason: string) {
  return baseOutput("product_help", {
    status: "complete",
    response_intent: "technical_fallback",
    reply:
      "Je peux t'aider sur le fonctionnement du produit, mais je préfère rester prudent sur ce tour: je n'exécute rien et je ne confirme aucun objet sans source fiable.",
    diagnosis: {
      local_flow: true,
      local_dispatcher_status: "failed",
      reason,
      operation_suggestions: [],
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "product_help_does_not_execute_operations",
        "technical_fallback_no_mutation",
      ],
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: {
      requested: [],
      allowed: [],
      blocked: [{
        type: "product_help",
        reason_code: "local_dispatcher_failed",
      }],
      committed: [],
    },
    state_patch: {
      product_help_local_flow: {
        status: "blocked",
        reason_code: reason,
      },
    },
  });
}

export async function runProductHelpSkill(input: ProductHelpRunSkillInput) {
  const candidates = retrieveProductHelpCandidates(input.user_message);
  if (!input.intake_model) {
    const previous = readProductHelpFlowState(
      input.context.active_skill_working_state,
    );
    const activeFlow = compactActiveFlowContext(
      input.context.active_skill_working_state,
    );
    const mode = activeFlow && activeFlow.skill_id !== "product_help"
      ? "inline"
      : "standalone";
    const dispatcher = input.local_dispatcher ?? runProductHelpLocalDispatcher;
    console.info("[ProductHelp] local_dispatcher_called", {
      mode,
      active_product_help: Boolean(previous),
      parent_skill_id: mode === "inline" ? activeFlow?.skill_id ?? null : null,
    });
    const decision = await dispatcher({
      user_id: input.context.user_id,
      request_id: (input.context.turn_frame as any)?.source_message_id ?? null,
      user_message: input.user_message,
      recent_messages: recentMessagesFromContext(input),
      product_help_state: previous,
      parent_flow_context: mode === "inline" ? activeFlow : null,
      catalog_candidates: candidates,
      product_surface_registry: input.context.product_surfaces ?? [],
      recent_committed_effects: recentCommittedEffects(
        input.context.turn_frame,
      ),
      db_projection_sources: [],
      active_flow_context: activeFlow,
      mode,
      turn_frame: input.context.turn_frame,
    });
    if (!decision) {
      return fallbackSkillOutput("product_help_local_dispatcher_failed");
    }
    console.info("[ProductHelp] local_dispatcher_result", {
      flow_action: decision.flow_action,
      mode: decision.mode,
      visible_task: decision.visible_task.kind,
      return_to_parent: decision.return_to_parent.needed,
      exit_to_global_dispatcher:
        decision.flow_action === "exit_to_global_dispatcher",
    });
    if (decision.flow_action === "apply_attempt") {
      console.info("[ProductHelp] apply_attempt_no_mutation", {
        bridge: decision.bridge,
      });
    }
    const reduced = reduceProductHelpLocalDispatcherOutput({
      previous,
      output: decision,
      catalogCandidates: candidates,
      parentFlowContext: mode === "inline" ? activeFlow : null,
      productSurfaces: input.context.product_surfaces ?? [],
      recentCommittedEffects: recentCommittedEffects(input.context.turn_frame),
    });
    if (reduced.exit_to_global_dispatcher) {
      console.info("[ProductHelp] exit_to_global_dispatcher", {
        exit_reason: decision.exit_memo.reason,
        likely_intent:
          decision.exit_memo.handoff_hint_for_global_dispatcher.likely_intent,
      });
      return baseOutput("product_help", {
        status: "exit",
        response_intent: "exit_to_global_dispatcher",
        reply: "",
        diagnosis: {
          local_flow: true,
          flow_action: decision.flow_action,
          mode: decision.mode,
          exit_memo: decision.exit_memo,
          reason_code: reduced.reason_code,
        },
        recommendation_need: {
          needed: false,
          type: "none",
          urgency: "none",
          constraints: [
            "product_help_does_not_execute_operations",
            "exit_to_global_dispatcher_with_memo",
          ],
        },
        operation_suggestions: [],
        memory_write_candidates: [],
        effects: {
          requested: [],
          allowed: [],
          blocked: [],
          committed: [],
        },
        state_patch: {
          product_help_local_state: reduced.local_state,
          product_help_exit_memo: {
            ...decision.exit_memo,
            at: new Date().toISOString(),
            reducer_reason_code: reduced.reason_code,
          },
          summary: decision.exit_memo.user_intent_summary ??
            "Product help exited to global dispatcher.",
        },
      });
    }
    const visibleAgent = input.visible_agent ?? runProductHelpVisibleAgent;
    console.info("[ProductHelp] visible_prompt_called", {
      mode,
      stage: reduced.visible_task,
    });
    const visible = await visibleAgent({
      user_id: input.context.user_id,
      request_id: (input.context.turn_frame as any)?.source_message_id ?? null,
      stage: reduced.visible_task,
      user_message: input.user_message,
      recent_messages: recentMessagesFromContext(input),
      mode,
      local_state: reduced.local_state,
      visible_facts_json: reduced.visible_facts_json,
      dispatcher_instruction: decision.visible_task.instruction,
    });
    const reply = String(visible ?? "").trim();
    if (!reply) return fallbackSkillOutput("product_help_visible_agent_failed");
    if (mode === "inline") {
      console.info("[ProductHelp] inline_called_from_parent", {
        parent_skill_id: activeFlow?.skill_id ?? null,
      });
      console.info("[ProductHelp] returned_to_parent_flow", {
        parent_skill_id: activeFlow?.skill_id ?? null,
        returned_to_parent: true,
      });
    }
    return baseOutput("product_help", {
      status: reduced.status === "closing" || mode === "inline"
        ? "complete"
        : "continue",
      response_intent: decision.product_help_intent.kind,
      reply,
      diagnosis: {
        local_flow: true,
        flow_action: decision.flow_action,
        mode: decision.mode,
        target: decision.target,
        grounding: decision.grounding,
        bridge: decision.bridge,
        visible_task: reduced.visible_task,
        return_to_parent_flow: reduced.return_to_parent_flow,
        reason_code: reduced.reason_code,
        evidence: reduced.evidence,
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: [
          "product_help_does_not_execute_operations",
          "operation_suggestions_always_empty",
          "requested_allowed_committed_effects_empty",
        ],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: {
        requested: [],
        allowed: [],
        blocked: reduced.blocked_effects,
        committed: [],
      },
      state_patch: {
        product_help_local_state: reduced.local_state,
        product_help_subskill_trace: mode === "inline"
          ? {
            subskill: "product_help",
            mode: "inline",
            answered_intent: decision.product_help_intent.kind,
            returned_to_parent: true,
            parent_skill_id: activeFlow?.skill_id ?? null,
          }
          : null,
        summary: reduced.answer_summary ??
          `Product help answered: ${decision.flow_action}.`,
      },
    });
  }

  const intakeResult = await runProductHelpStructuredIntake({
    user_message: input.user_message,
    recent_messages: input.context.recent_messages,
    active_skill_working_state: input.context.active_skill_working_state,
    turn_frame: input.context.turn_frame,
    product_surfaces: input.context.product_surfaces,
    catalog_candidates: candidates,
    intake_model: input.intake_model,
  });
  const decision = intakeResult.decision;
  const feature = decision.target.feature_id === "one_shot_reminder.chat"
    ? getProductHelpFeature("initiatives")!
    : getProductHelpFeature(decision.target.feature_id) ??
      pickCatalogFeatureForObject(decision.target.object_type) ??
      choosePrimaryCatalogCandidate(candidates);
  return reduceProductHelpTurn({
    decision,
    feature,
    intake_errors: intakeResult.errors,
  });
}
