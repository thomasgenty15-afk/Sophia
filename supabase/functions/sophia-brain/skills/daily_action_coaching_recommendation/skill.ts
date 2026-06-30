import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import {
  DAILY_ACTION_COACHING_SKILL_ID,
  type DailyActionCoachingVisibleOutput,
} from "./contract.ts";
import {
  initialDailyActionCoachingState,
  normalizeDailyActionCoachingHandoffContext,
  readDailyActionCoachingState,
  reduceDailyActionCoachingOutput,
  runDailyActionCoachingLocalDispatcher,
  type DailyActionCoachingLocalDispatcher,
} from "./local_flow.ts";
import {
  runDailyActionCoachingVisibleAgent,
} from "./visible_agent.ts";

export type DailyActionCoachingRunSkillInput = RunSkillInput & {
  local_dispatcher?: DailyActionCoachingLocalDispatcher;
  visible_agent?: typeof runDailyActionCoachingVisibleAgent;
};

function recentUserMessagesForVisible(input: DailyActionCoachingRunSkillInput) {
  const messages = [
    ...input.context.recent_messages,
    { role: "user" as const, content: input.user_message },
  ].filter((message) => message.role === "user" && message.content?.trim());
  return messages.slice(-5).map((message) => ({
    role: "user" as const,
    content: message.content.trim(),
    created_at: null,
  }));
}

function normalizeVisibleOutput(
  raw: DailyActionCoachingVisibleOutput | string | null,
): DailyActionCoachingVisibleOutput {
  if (typeof raw === "string") {
    return { message: raw.trim(), visible_decision: null };
  }
  return {
    message: String(raw?.message ?? "").trim(),
    visible_decision: raw?.visible_decision ?? null,
  };
}

function initialState(input: DailyActionCoachingRunSkillInput) {
  const active = readDailyActionCoachingState(
    input.context.active_skill_working_state,
  );
  if (active) return active;
  const signalContext = normalizeDailyActionCoachingHandoffContext(
    input.context.turn_frame.note_information?.structured_context,
  );
  return signalContext ? initialDailyActionCoachingState(signalContext) : null;
}

export async function runDailyActionCoachingRecommendationSkill(
  input: DailyActionCoachingRunSkillInput,
) {
  const previous = initialState(input);
  if (!previous) {
    return baseOutput(DAILY_ACTION_COACHING_SKILL_ID, {
      status: "exit",
      response_intent: "daily_action_coaching_missing_context",
      reply: "",
      diagnosis: {
        local_flow: true,
        reason_code: "daily_action_coaching_missing_context",
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: emptyConversationEffects(),
      state_patch: {
        daily_action_coaching_recommendation_state: null,
      },
    });
  }
  const dispatcher = input.local_dispatcher ??
    runDailyActionCoachingLocalDispatcher;
  const decision = await dispatcher({
    user_id: input.context.user_id,
    request_id: (input.context.turn_frame as any)?.source_message_id ?? null,
    user_message: input.user_message,
    previous_state: previous,
  });
  if (!decision) {
    return baseOutput(DAILY_ACTION_COACHING_SKILL_ID, {
      status: "continue",
      response_intent: "daily_action_coaching_dispatcher_empty",
      reply: "Tu veux de l’aide pour quelle action précise du daily ?",
      diagnosis: {
        local_flow: true,
        reason_code: "daily_action_coaching_dispatcher_empty",
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: emptyConversationEffects(),
      state_patch: {
        daily_action_coaching_recommendation_state: previous,
      },
    });
  }
  const reduced = reduceDailyActionCoachingOutput({
    previous,
    output: decision,
  });
  if (reduced.status === "exit") {
    return baseOutput(DAILY_ACTION_COACHING_SKILL_ID, {
      status: "exit",
      response_intent: reduced.reason_code,
      reply: "",
      diagnosis: {
        local_flow: true,
        reason_code: reduced.reason_code,
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: emptyConversationEffects(),
      state_patch: {
        daily_action_coaching_recommendation_state: null,
      },
    });
  }
  const visible = input.visible_agent ?? runDailyActionCoachingVisibleAgent;
  const visibleOutput = decision.flow_action === "recommend_and_return"
    ? normalizeVisibleOutput(
      await visible({
        user_id: input.context.user_id,
        request_id: (input.context.turn_frame as any)?.source_message_id ??
          null,
        recent_user_messages: recentUserMessagesForVisible(input),
        action: previous.action_context,
        recommendation: reduced.recommendation,
        evidence: decision.evidence ?? [],
      }),
    )
    : {
      message: decision.visible_task.instruction ||
        "Tu veux de l’aide pour quelle action précise du daily ?",
      visible_decision: null,
    };
  const status = reduced.status === "complete" ? "complete" : "continue";
  return baseOutput(DAILY_ACTION_COACHING_SKILL_ID, {
    status,
    response_intent: reduced.reason_code,
    reply: visibleOutput.message,
    diagnosis: {
      local_flow: true,
      reason_code: reduced.reason_code,
      visible_decision: visibleOutput.visible_decision,
      note_information: reduced.note_information,
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: emptyConversationEffects(),
    state_patch: {
      daily_action_coaching_recommendation_state: status === "continue"
        ? reduced.local_state
        : null,
      daily_action_coaching_recommendation_note_information:
        reduced.note_information,
    },
  });
}
