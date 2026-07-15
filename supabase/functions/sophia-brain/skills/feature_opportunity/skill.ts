import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { FeatureOpportunityLocalState } from "./contract.ts";
import {
  type FeatureOpportunityLocalDispatcher,
  readFeatureOpportunityState,
  reduceFeatureOpportunityLocalDispatcherOutput,
  runFeatureOpportunityLocalDispatcher,
} from "./local_flow.ts";
import {
  type FeatureOpportunityVisibleAgent,
  runFeatureOpportunityVisibleAgent,
} from "./visible_agent.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import { visibleRecentMessages } from "../_shared/visible_history.ts";
import { selectDirectEffectConfirmationContext } from "../../router/direct_effect_local_context.ts";
import {
  emptyLocalOneShotDirectEffectRequest,
  type LocalOneShotDirectEffectRequest,
} from "../../router/one_shot_local_direct_effect.ts";

export type FeatureOpportunityRunSkillInput = RunSkillInput & {
  local_dispatcher?: FeatureOpportunityLocalDispatcher;
  visible_agent?: FeatureOpportunityVisibleAgent;
  direct_effect_executor?: (
    request: LocalOneShotDirectEffectRequest,
  ) => Promise<{ turn_frame: TurnFrame | null } | null>;
};

function dispatcherSignalContext(input: FeatureOpportunityRunSkillInput) {
  return input.context.turn_frame.skill_signals.feature_opportunity?.context ??
    null;
}

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function visibleRuntimeContext(
  input: FeatureOpportunityRunSkillInput,
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
  input: FeatureOpportunityRunSkillInput,
): FeatureOpportunityLocalState | null {
  const context = dispatcherSignalContext(input);
  if (!context) return null;
  return {
    feature: context.feature,
    opportunity_kind: context.opportunity_kind,
    user_problem_summary: context.user_problem_summary,
    trigger_context: context.trigger_context ?? null,
    dispatcher_signal_context: context,
    turn_count: 0,
    max_turns: 3,
  };
}

function fallbackDecision(input: FeatureOpportunityRunSkillInput) {
  const context = dispatcherSignalContext(input);
  const feature = context?.feature ?? null;
  return {
    flow_action: feature
      ? "recommend_feature" as const
      : "clarify_opportunity" as const,
    confidence: feature ? "medium" as const : "low" as const,
    risk_score: 0,
    feature,
    opportunity_kind: context?.opportunity_kind ?? null,
    user_problem_summary: context?.user_problem_summary ??
      input.user_message,
    trigger_context: context?.trigger_context ?? null,
    recommendation: {
      feature,
      why: context?.priority_reason ?? null,
      user_facing_next_step: feature === "initiatives"
        ? "ouvre les initiatives et formule le moment recurrent a soutenir."
        : feature === "coach_preferences"
        ? "ouvre les preferences de coaching et choisis le style qui te convient."
        : null,
    },
    state_updates: {
      status: "active" as const,
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: feature
        ? "recommend_feature" as const
        : "ask_opportunity_clarification" as const,
      instruction: feature
        ? "Recommander la surface produit pertinente."
        : "Clarifier l'opportunite produit.",
      conversation_context: {
        feature,
        user_problem_summary: context?.user_problem_summary ??
          input.user_message,
        trigger_context: context?.trigger_context ?? null,
        known_values: { dispatcher_signal_context: context },
        missing_or_weak_values: feature ? [] : ["feature"],
        recommendation: {
          feature,
          why: context?.priority_reason ?? null,
          user_facing_next_step: feature === "initiatives"
            ? "ouvre les initiatives et formule le moment recurrent a soutenir."
            : feature === "coach_preferences"
            ? "ouvre les preferences de coaching et choisis le style qui te convient."
            : null,
        },
        evidence_used: [input.user_message].filter(Boolean),
        tone_constraints: ["short"],
        do_not_say: ["noms internes des anciennes surfaces de rappel"],
      },
    },
    direct_effect_request: emptyLocalOneShotDirectEffectRequest(),
    note_information: null,
    evidence: [input.user_message].filter(Boolean),
  };
}

export async function runFeatureOpportunitySkill(
  input: FeatureOpportunityRunSkillInput,
) {
  const inboundNote = (input.context as any).note_information ?? null;
  // Entrée à froid = aucun état persisté d'un tour précédent de CE flow
  // (calculé avant le seed depuis le signal, qui n'est pas un signal fiable).
  const isFlowEntry = readFeatureOpportunityState(
    input.context.active_skill_working_state,
  ) == null;
  const previous = readFeatureOpportunityState(
    input.context.active_skill_working_state,
  ) ?? initialStateFromDispatcherSignal(input);
  const dispatcher = input.local_dispatcher ??
    runFeatureOpportunityLocalDispatcher;
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
  const reduced = reduceFeatureOpportunityLocalDispatcherOutput({
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
    return baseOutput("feature_opportunity", {
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
        feature_opportunity_local_state: null,
        feature_opportunity_note_information: reduced.note_information,
        session_style_commitment:
        ("session_style_commitment" in decision
          ? decision.session_style_commitment
          : null) ?? null,
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
    runFeatureOpportunityVisibleAgent;
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
  return baseOutput("feature_opportunity", {
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
      feature_opportunity_local_state: reduced.local_state,
      feature_opportunity_note_information: reduced.note_information,
      session_style_commitment:
        ("session_style_commitment" in decision
          ? decision.session_style_commitment
          : null) ?? null,
    },
  });
}
