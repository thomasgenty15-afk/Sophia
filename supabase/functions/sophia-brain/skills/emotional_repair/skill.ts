import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import {
  type EmotionalRepairIntakeModel,
  runEmotionalRepairStructuredIntake,
} from "./intake.ts";
import {
  type EmotionalRepairLocalDispatcher,
  readEmotionalRepairLocalState,
  reduceEmotionalRepairLocalDispatcherOutput,
  runEmotionalRepairLocalDispatcher,
} from "./local_flow.ts";
import {
  reduceEmotionalRepairTurn,
  safetyHandoffEmotionalRepairOutput,
} from "./reducer.ts";
import {
  type EmotionalRepairVisibleAgent,
  runEmotionalRepairVisibleAgent,
} from "./visible_agent.ts";

export type RunEmotionalRepairSkillInput = RunSkillInput & {
  intake_model?: EmotionalRepairIntakeModel;
  local_dispatcher?: EmotionalRepairLocalDispatcher;
  visible_agent?: EmotionalRepairVisibleAgent;
  request_id?: string | null;
  explicit_constraints?: string[];
};

function recentMessagesFromContext(input: RunEmotionalRepairSkillInput) {
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
  return baseOutput("emotional_repair", {
    status: "continue",
    response_intent: "technical_fallback",
    reply:
      "Je reste avec toi prudemment sur ce tour, sans lancer d'outil ni conclure quoi que ce soit.",
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
      blocked: [{ type: "emotional_repair", reason_code: reason }],
    },
  });
}

export async function runEmotionalRepairSkill(
  input: RunEmotionalRepairSkillInput,
): Promise<ConversationSkillOutput> {
  const safetyRisk = input.context.turn_frame.safety.risk_band;
  if (safetyRisk === "high" || safetyRisk === "critical") {
    return safetyHandoffEmotionalRepairOutput(input);
  }

  if (!input.intake_model) {
    const previous = readEmotionalRepairLocalState(
      input.context.active_skill_working_state,
    );
    const dispatcher = input.local_dispatcher ??
      runEmotionalRepairLocalDispatcher;
    console.info("[EmotionalRepair] local_dispatcher_called", {
      active_emotional_repair: Boolean(previous),
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
    console.info("[EmotionalRepair] local_dispatcher_result", {
      flow_action: decision.flow_action,
      visible_task: decision.visible_task.kind,
      potion_bridge_status: decision.potion_bridge.status,
      selected_potion: decision.potion_bridge.selected_potion,
    });
    const reduced = reduceEmotionalRepairLocalDispatcherOutput({
      previous,
      output: decision,
      explicit_constraints: input.explicit_constraints ?? [],
      turn_frame: input.context.turn_frame,
    });
    console.info("[EmotionalRepair] reducer_result", {
      status: reduced.status,
      reason_code: reduced.reason_code,
      visible_task: reduced.visible_task.kind,
      handoff_to_potion: Boolean(reduced.potion_bridge_context),
    });
    if (reduced.potion_bridge_context && reduced.status === "handoff") {
      console.info("[EmotionalRepair] potion_bridge_confirmed", {
        selected_potion: reduced.potion_bridge_context.selected_potion,
        origin_flow: reduced.potion_bridge_context.origin_flow,
      });
      console.info("[EmotionalRepair] handoff_to_select_state_potion", {
        selected_potion: reduced.potion_bridge_context.selected_potion,
      });
    } else if (decision.flow_action === "potion_bridge_offer") {
      console.info("[EmotionalRepair] potion_bridge_offered", {
        selected_potion: decision.potion_bridge.selected_potion,
        blocked:
          reduced.reason_code === "emotional_repair_potion_bridge_blocked",
      });
    }
    if (reduced.exit_to_global_dispatcher) {
      return baseOutput("emotional_repair", {
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
          emotional_repair_local_state: null,
          emotional_repair_exit_memo: {
            ...decision.exit_memo,
            information_note: {
              departed_flow_summary: decision.repair_state.summary,
              context_for_next_dispatcher: decision.exit_memo
                .handoff_hint_for_global_dispatcher,
            },
          },
        },
      });
    }
    const visibleAgent = input.visible_agent ?? runEmotionalRepairVisibleAgent;
    console.info("[EmotionalRepair] visible_prompt_called", {
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
    return baseOutput("emotional_repair", {
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
        emotional_repair_local_state: reduced.local_state,
        emotional_repair_visible_task: reduced.visible_task,
        emotional_repair_potion_handoff: reduced.potion_bridge_context
          ? {
            selected_potion: reduced.potion_bridge_context.selected_potion,
            potion_bridge_context: reduced.potion_bridge_context,
            information_note: reduced.potion_bridge_context.information_note,
            no_chat_mutation: true,
          }
          : null,
        summary: reduced.local_state?.previous_repair_summary ??
          decision.repair_state.summary,
      },
    });
  }

  const intake = await runEmotionalRepairStructuredIntake({
    user_message: input.user_message,
    context: input.context,
    intake_model: input.intake_model,
    request_id: input.request_id,
    explicit_constraints: input.explicit_constraints,
  });
  return reduceEmotionalRepairTurn({
    run_input: input,
    intake_decision: intake.decision,
    intake_errors: intake.errors,
    intake_trace: intake.trace,
    explicit_constraints: input.explicit_constraints,
  });
}
