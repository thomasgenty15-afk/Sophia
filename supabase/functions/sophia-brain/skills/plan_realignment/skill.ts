import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { PlanRealignmentLocalState } from "./contract.ts";
import {
  type PlanRealignmentLocalDispatcher,
  readPlanRealignmentState,
  reducePlanRealignmentLocalDispatcherOutput,
  runPlanRealignmentLocalDispatcher,
} from "./local_flow.ts";
import {
  type PlanRealignmentVisibleAgent,
  runPlanRealignmentVisibleAgent,
} from "./visible_agent.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import { visibleRecentMessages } from "../_shared/visible_history.ts";
import { selectDirectEffectConfirmationContext } from "../../router/direct_effect_local_context.ts";
import {
  emptyLocalOneShotDirectEffectRequest,
  type LocalOneShotDirectEffectRequest,
} from "../../router/one_shot_local_direct_effect.ts";

export type PlanRealignmentRunSkillInput = RunSkillInput & {
  local_dispatcher?: PlanRealignmentLocalDispatcher;
  visible_agent?: PlanRealignmentVisibleAgent;
  direct_effect_executor?: (
    request: LocalOneShotDirectEffectRequest,
  ) => Promise<{ turn_frame: TurnFrame | null } | null>;
};

function dispatcherSignalContext(input: PlanRealignmentRunSkillInput) {
  return input.context.turn_frame.skill_signals.plan_realignment?.context ??
    null;
}

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function visibleRuntimeContext(
  input: PlanRealignmentRunSkillInput,
  isFlowEntry: boolean,
) {
  return {
    style_rules: VISIBLE_OUTPUT_STYLE_RULES,
    recent_messages: visibleRecentMessages({
      recent_messages: input.context.recent_messages,
      user_message: input.user_message,
      is_cold_entry: isFlowEntry,
    }),
    recent_effects_summary:
      input.context.runtime_context?.recent_effects_summary ?? null,
    user_identity: input.context.runtime_context?.user_identity ?? null,
  };
}

function directEffectConfirmationContext(
  turnFrame: TurnFrame | null,
  recentContext: unknown,
) {
  return selectDirectEffectConfirmationContext({
    turnFrame,
    recentContext,
  });
}

function initialStateFromDispatcherSignal(
  input: PlanRealignmentRunSkillInput,
): PlanRealignmentLocalState | null {
  const context = dispatcherSignalContext(input);
  if (!context) return null;
  return {
    drift_type: context.drift_type,
    scope: context.scope,
    explicit_adjust_request: context.explicit_adjust_request,
    product_execution_allowed: false,
    user_need_summary: context.reason || input.user_message,
    dispatcher_signal_context: context,
    turn_count: 0,
    max_turns: 4,
    last_visible_task_kind: null,
    last_answer_summary: null,
  };
}

function fallbackDecision(input: PlanRealignmentRunSkillInput) {
  const context = dispatcherSignalContext(input);
  return {
    flow_action: "support" as const,
    confidence: context ? "medium" as const : "low" as const,
    risk_score: 0,
    drift_type: context?.drift_type ?? "ambiguous" as const,
    scope: context?.scope ?? "unknown" as const,
    explicit_adjust_request: context?.explicit_adjust_request ?? false,
    user_need_summary: context?.reason ?? input.user_message,
    next_step:
      "ouvrir Dashboard > Plan > Ajuster mon plan et expliquer franchement ce qui n'a pas tenu, pourquoi, et ce que tu aimerais avoir a la place.",
    direct_effect_request: emptyLocalOneShotDirectEffectRequest(),
    state_updates: {
      status: "active" as const,
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "plan_realignment_support" as const,
      instruction: "Rassurer et rediriger vers le realignement du Plan.",
      conversation_context: {
        drift_type: context?.drift_type ?? "ambiguous" as const,
        scope: context?.scope ?? "unknown" as const,
        explicit_adjust_request: context?.explicit_adjust_request ?? false,
        product_execution_allowed: false as const,
        user_need_summary: context?.reason ?? input.user_message,
        recommended_surface: "Dashboard > Plan" as const,
        next_step:
          "ouvrir Dashboard > Plan > Ajuster mon plan et expliquer franchement ce qui n'a pas tenu, pourquoi, et ce que tu aimerais avoir a la place.",
        known_values: { dispatcher_signal_context: context },
        missing_or_weak_values: [],
        evidence_used: [input.user_message].filter(Boolean),
        tone_constraints: ["short", "reassuring"],
        do_not_say: [
          "Ne dis pas que Sophia ajuste le plan depuis le chat.",
        ],
      },
    },
    note_information: null,
    evidence: [input.user_message].filter(Boolean),
  };
}

export async function runPlanRealignmentSkill(
  input: PlanRealignmentRunSkillInput,
) {
  const inboundNote = (input.context as any).note_information ?? null;
  // Entrée à froid = aucun état persisté d'un tour précédent de CE flow
  // (calculé avant le seed depuis le signal, qui n'est pas un signal fiable).
  const isFlowEntry = readPlanRealignmentState(
    input.context.active_skill_working_state,
  ) == null;
  const previous = readPlanRealignmentState(
    input.context.active_skill_working_state,
  ) ?? initialStateFromDispatcherSignal(input);
  const dispatcher = input.local_dispatcher ??
    runPlanRealignmentLocalDispatcher;
  const decision = await dispatcher({
    user_id: input.context.user_id,
    request_id: (input.context.turn_frame as any)?.source_message_id ?? null,
    user_message: input.user_message,
    recent_messages: input.context.recent_messages,
    previous_state: previous,
    inbound_note_information: inboundNote,
    turn_frame: input.context.turn_frame,
    dispatcher_signal_context: dispatcherSignalContext(input),
    is_flow_entry: isFlowEntry,
  }) ?? fallbackDecision(input);
  const reduced = reducePlanRealignmentLocalDispatcherOutput({
    previous,
    output: decision,
    userMessage: input.user_message,
  });
  if (reduced.status === "exit") {
    // P0-1 (ALEX-CPR-B01): la lane direct effect s'exécute AVANT le return de
    // sortie — sinon un rappel demandé au tour d'exit est perdu sans écriture
    // pendant que la confirmation re-présente un committed du ledger.
    if (
      input.direct_effect_executor && decision.direct_effect_request?.requested
    ) {
      await input.direct_effect_executor(decision.direct_effect_request);
    }
    return baseOutput("plan_realignment", {
      status: reduced.status,
      response_intent: reduced.reason_code,
      reply: "",
      diagnosis: {
        local_flow: true,
        reason_code: reduced.reason_code,
        note_information: reduced.note_information,
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: reduced.effects,
      state_patch: {
        plan_realignment_local_state: null,
        plan_realignment_note_information: reduced.note_information,
      },
    });
  }
  let turnFrameForVisible = input.context.turn_frame;
  if (
    input.direct_effect_executor && decision.direct_effect_request.requested
  ) {
    const directEffectResult = await input.direct_effect_executor(
      decision.direct_effect_request,
    );
    turnFrameForVisible = directEffectResult?.turn_frame ?? turnFrameForVisible;
  }
  const visibleAgent = input.visible_agent ??
    runPlanRealignmentVisibleAgent;
  const directEffectContext = directEffectConfirmationContext(
    turnFrameForVisible,
    input.context.runtime_context?.recent_direct_effect_confirmation_context ??
      null,
  );
  const reply = await visibleAgent({
    user_id: input.context.user_id,
    request_id: (input.context.turn_frame as any)?.source_message_id ?? null,
    stage: reduced.visible_task,
    visible_runtime_context: visibleRuntimeContext(input, isFlowEntry),
    conversation_context: {
      ...reduced.conversation_context,
      direct_effect_confirmation_context: directEffectContext,
      known_values: {
        ...reduced.conversation_context.known_values,
        direct_effect_confirmation_context: directEffectContext,
      },
    },
  });
  return baseOutput("plan_realignment", {
    status: reduced.status,
    response_intent: reduced.reason_code,
    reply: String(reply ?? "").trim(),
    diagnosis: {
      local_flow: true,
      reason_code: reduced.reason_code,
      visible_task: reduced.visible_task,
      note_information: reduced.note_information,
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: emptyConversationEffects(),
    state_patch: {
      plan_realignment_local_state: reduced.local_state,
      plan_realignment_note_information: reduced.note_information,
    },
  });
}
