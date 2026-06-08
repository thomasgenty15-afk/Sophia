import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import {
  buildDemotivationRepairIntakeInput,
  type DemotivationRepairIntakeModel,
  hasDemotivationRepairIntakeRunnerForTest,
  runDemotivationRepairStructuredIntake,
} from "./intake.ts";
import {
  type DemotivationRepairLocalDispatcher,
  readDemotivationRepairLocalState,
  reduceDemotivationRepairLocalDispatcherOutput,
  runDemotivationRepairLocalDispatcher,
} from "./local_flow.ts";
import { reduceDemotivationRepairTurn } from "./reducer.ts";
import {
  type DemotivationRepairVisibleAgent,
  runDemotivationRepairVisibleAgent,
} from "./visible_agent.ts";

export type RunDemotivationRepairSkillInput = RunSkillInput & {
  intake_model?: DemotivationRepairIntakeModel;
  local_dispatcher?: DemotivationRepairLocalDispatcher;
  visible_agent?: DemotivationRepairVisibleAgent;
  request_id?: string | null;
  explicit_constraints?: string[];
};

function recentMessagesFromContext(input: RunDemotivationRepairSkillInput) {
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

function localFallbackOutput(reason: string): ConversationSkillOutput {
  return baseOutput("demotivation_repair", {
    status: "continue",
    response_intent: "technical_fallback",
    reply:
      "Je reste sur le décrochage prudemment, sans lancer d'outil ni conclure trop vite.",
    diagnosis: {
      local_flow: true,
      reason_code: reason,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: ["no_chat_mutation", "technical_fallback"],
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: {
      ...emptyConversationEffects(),
      blocked: [{ type: "demotivation_repair", reason_code: reason }],
    },
  });
}

export async function runDemotivationRepairSkill(
  input: RunDemotivationRepairSkillInput,
) {
  const useLegacyIntakePath = Boolean(input.intake_model) ||
    hasDemotivationRepairIntakeRunnerForTest();
  const safetyRisk = input.context.turn_frame.safety.risk_band;
  if (
    !useLegacyIntakePath &&
    (safetyRisk === "high" || safetyRisk === "critical")
  ) {
    return baseOutput("demotivation_repair", {
      status: "handoff",
      response_intent: "handoff_to_safety",
      reply: undefined,
      diagnosis: {
        local_flow: true,
        reason_code: "safety_preempt",
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["safety_preempt", "no_chat_mutation"],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: {
        ...emptyConversationEffects(),
        blocked: [{
          type: "demotivation_repair",
          reason_code: "safety_preempt",
        }],
      },
      state_patch: {
        demotivation_repair_local_state: null,
      },
    });
  }

  if (!useLegacyIntakePath) {
    const previous = readDemotivationRepairLocalState(
      input.context.active_skill_working_state,
    );
    const dispatcher = input.local_dispatcher ??
      runDemotivationRepairLocalDispatcher;
    console.info("[DemotivationRepair] local_dispatcher_called", {
      active_demotivation_repair: Boolean(previous),
      previous_visible_task: previous?.last_visible_task ?? null,
    });
    const decision = await dispatcher({
      user_id: input.context.user_id,
      request_id: input.request_id ??
        (input.context.turn_frame as any)?.source_message_id ?? null,
      user_message: input.user_message,
      recent_messages: recentMessagesFromContext(input),
      active_state: previous,
      previous_repair_summary: previous?.previous_repair_summary ?? null,
      previous_potion_bridge_offer: previous?.last_potion_bridge_offer ?? null,
      turn_frame: input.context.turn_frame,
      explicit_constraints: input.explicit_constraints ?? [],
    });
    if (!decision) return localFallbackOutput("local_dispatcher_failed");
    console.info("[DemotivationRepair] local_dispatcher_result", {
      flow_action: decision.flow_action,
      visible_task: decision.visible_task.kind,
      potion_bridge_status: decision.potion_bridge.status,
      selected_potion: decision.potion_bridge.selected_potion,
    });
    const reduced = reduceDemotivationRepairLocalDispatcherOutput({
      previous,
      output: decision,
      explicit_constraints: input.explicit_constraints ?? [],
      turn_frame: input.context.turn_frame,
    });
    console.info("[DemotivationRepair] reducer_result", {
      status: reduced.status,
      reason_code: reduced.reason_code,
      visible_task: reduced.visible_task.kind,
      handoff_to_potion: Boolean(reduced.potion_bridge_context),
    });
    if (reduced.potion_bridge_context && reduced.status === "handoff") {
      console.info("[DemotivationRepair] potion_bridge_confirmed", {
        selected_potion: reduced.potion_bridge_context.selected_potion,
        origin_flow: reduced.potion_bridge_context.origin_flow,
      });
      console.info("[DemotivationRepair] handoff_to_select_state_potion", {
        selected_potion: reduced.potion_bridge_context.selected_potion,
      });
    } else if (decision.flow_action === "potion_bridge_offer") {
      console.info("[DemotivationRepair] potion_bridge_offered", {
        selected_potion: decision.potion_bridge.selected_potion,
        blocked:
          reduced.reason_code === "demotivation_repair_potion_bridge_blocked",
      });
    }
    if (reduced.exit_to_global_dispatcher) {
      return baseOutput("demotivation_repair", {
        status: "exit",
        response_intent: "exit_to_global_dispatcher",
        reply: "",
        diagnosis: {
          local_flow: true,
          flow_action: decision.flow_action,
          exit_memo: decision.exit_memo,
          reason_code: reduced.reason_code,
          evidence: reduced.evidence,
        },
        recommendation_need: {
          needed: false,
          type: "none",
          urgency: "none",
          constraints: ["exit_to_global_dispatcher", "no_chat_mutation"],
        },
        operation_suggestions: [],
        memory_write_candidates: [],
        effects: emptyConversationEffects(),
        state_patch: {
          demotivation_repair_local_state: null,
          demotivation_repair_exit_memo: {
            ...decision.exit_memo,
            note_information: decision.exit_memo.note_information ?? {
              source_flow_presentation: decision.repair_state.summary,
              handoff_context_for_next_dispatcher: decision.exit_memo
                .handoff_hint_for_global_dispatcher ??
                decision.repair_state.summary,
              target_flow: "global",
              target_local_dispatcher_hint: null,
            },
          },
        },
      });
    }
    const visibleAgent = input.visible_agent ??
      runDemotivationRepairVisibleAgent;
    console.info("[DemotivationRepair] visible_prompt_called", {
      stage: reduced.visible_task.kind,
    });
    const visible = await visibleAgent({
      user_id: input.context.user_id,
      request_id: input.request_id ??
        (input.context.turn_frame as any)?.source_message_id ?? null,
      stage: reduced.visible_task.kind,
      user_message: input.user_message,
      recent_messages: recentMessagesFromContext(input),
      local_state: reduced.local_state,
      visible_task: reduced.visible_task,
      potion_bridge_context: reduced.potion_bridge_context,
      constraints: reduced.constraints,
      dispatcher_evidence: reduced.evidence,
    });
    const reply = String(visible ?? "").trim();
    if (!reply) return localFallbackOutput("visible_agent_failed");
    return baseOutput("demotivation_repair", {
      status: reduced.status === "safety" ? "handoff" : reduced.status,
      response_intent: reduced.response_intent,
      reply,
      diagnosis: {
        local_flow: true,
        flow_action: decision.flow_action,
        visible_task: reduced.visible_task.kind,
        potion_bridge_status: decision.potion_bridge.status,
        selected_potion: reduced.potion_bridge_context?.selected_potion ??
          decision.potion_bridge.selected_potion,
        reason_code: reduced.reason_code,
        evidence: reduced.evidence,
      },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["no_chat_mutation", ...reduced.constraints],
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: {
        ...emptyConversationEffects(),
        blocked: reduced.blocked_effects,
      },
      state_patch: {
        demotivation_repair_local_state: reduced.local_state,
        demotivation_repair_visible_task: reduced.visible_task,
        demotivation_repair_potion_handoff: reduced.potion_bridge_context
          ? {
            selected_potion: reduced.potion_bridge_context.selected_potion,
            potion_bridge_context: reduced.potion_bridge_context,
            note_information: reduced.potion_bridge_context.note_information,
            no_chat_mutation: true,
          }
          : null,
        summary: reduced.local_state?.previous_repair_summary ??
          decision.repair_state.summary,
      },
    });
  }

  const intakeInput = buildDemotivationRepairIntakeInput(
    input,
    input.request_id,
  );
  const intake = await runDemotivationRepairStructuredIntake({
    ...intakeInput,
    intake_model: input.intake_model,
  });
  return reduceDemotivationRepairTurn({ run_input: input, intake });
}
