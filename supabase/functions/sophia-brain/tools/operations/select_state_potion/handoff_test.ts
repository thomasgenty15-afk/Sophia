import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runSelectStatePotionHandoffSkill } from "./handoff.ts";
import { visiblePotionLabel } from "./labels.ts";
import { loadStatePotionHandoffStateFromTempMemory } from "./state.ts";
import { structuredStatePotionSlotFiller } from "./test_helpers.ts";
import {
  createInitialStatePotionSubskillState,
  type StatePotionLocalSubskillType,
} from "./subskills/state_potion_subskill_flow.ts";

const fakeSupabase = {} as any;
const fakeSafetyContext = {
  risk_band: "none",
  reason_codes: [],
  evidence: [],
} as any;
const selectPotionRouteDecision = {
  route_version: "v1",
  response_owner: "tool_skill",
  selected_handler: "select_state_potion",
  reason_code: "test_select_state_potion_handoff",
  direct_effects_to_run: [],
  blocked_paths: [],
  memory_used_for_route: false,
  memory_item_ids_used_for_route: [],
  memory_use_kind: "none",
} as any;

function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    supabase: fakeSupabase,
    userId: "u-handoff",
    userMessage: "Je veux préparer une potion d'état.",
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyContextOutput: fakeSafetyContext,
    sourceMessageId: "m-handoff",
    requestId: "r-handoff",
    history: [],
    ...overrides,
  };
}

function lockedFieldsForPotion(potionType: StatePotionLocalSubskillType) {
  const state = createInitialStatePotionSubskillState(potionType, null);
  return state.field_order.map((fieldId) => {
    const field = state.field_states[fieldId];
    const optionLabel = field.input_type === "single_select"
      ? `Option ${field.field_label}`
      : null;
    return {
      ...field,
      status: "locked" as const,
      candidate_value: null,
      locked_value: optionLabel ?? `Valeur ${field.field_label}`,
      option_value: optionLabel ? `option_${field.field_id}` : null,
      option_label: optionLabel,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "Fixture handoff verrouillée.",
      detail_sufficiency: {
        status: "sufficient" as const,
        reason: null,
        followup_question: null,
        followup_asked: false,
        followup_answered: false,
        evidence: ["test_locked_field"],
      },
    };
  });
}

Deno.test("potion handoff builds platform draft without chat mutation", async () => {
  const potionType = "apaisement" as const;
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Je veux une potion d'apaisement.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: potionType,
      omit_detail_answers: true,
    }),
    potionSubskillLocalDispatcherOverride: async () => ({
      flow_action: "answer_current_field",
      confidence: "high",
      selected_potion: potionType,
      current_field_id: null,
      field_states: lockedFieldsForPotion(potionType),
      revision: {
        is_revision: false,
        field_id: null,
        replacement_value: null,
        option_value: null,
        option_label: null,
        replaces_previous_value: false,
      },
      visible_task: {
        kind: "handoff_ready",
      },
      exit_memo: {
        needed: false,
        reason: "none",
        flow_summary: null,
        collected_value: null,
        handoff_hint_for_global_dispatcher: null,
      },
      no_chat_mutation: {
        potion_session_created: false,
        recurring_reminder_created: false,
        scheduled_checkin_created: false,
        executable_confirmation_generated: false,
      },
      risk_assessment: {
        risk_score: 0,
        risk_band: "none",
        safety_preempt: false,
        reason_codes: [],
      },
      evidence: ["test_handoff_ready"],
    }),
    visibleAgentOverride: async (input: any) => {
      assertEquals(Object.keys(input).sort(), [
        "request_id",
        "stage",
        "trace_event",
        "user_id",
        "visible_task",
      ]);
      assertEquals(input.stage, "potion_subskill_task");
      assertEquals(
        input.visible_task.conversation_context.handoff_data.potion_name,
        visiblePotionLabel(potionType),
      );
      return "Va dans État / Potions avec les champs exacts préparés.";
    },
  }));

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).status, "handoff_delivered");
  assertEquals((result.toolSkillRun as any).no_chat_mutation, true);
  assert((result.toolSkillRun as any).platform_handoff?.draft);
  assertStringIncludes(result.content, "État / Potions");
});

Deno.test("apply_attempt does not execute potion writers", async () => {
  const potionType = "amour" as const;
  const state = createInitialStatePotionSubskillState(potionType, null);
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Ok lance-la.",
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        active_subskill_id: "select_state_potion.amour",
        mode: "platform_handoff",
        status: "clarifying",
        phase: "detail_intake",
        draft: null,
        intake_state: null,
        potion_subskill_state: state,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    potionSubskillLocalDispatcherOverride: async () => ({
      flow_action: "apply_attempt",
      confidence: "high",
      selected_potion: potionType,
      current_field_id: state.current_field_id,
      field_states: [],
      revision: {
        is_revision: false,
        field_id: null,
        replacement_value: null,
        option_value: null,
        option_label: null,
        replaces_previous_value: false,
      },
      visible_task: {
        kind: "apply_attempt",
      },
      exit_memo: {
        needed: false,
        reason: "none",
        flow_summary: null,
        collected_value: null,
        handoff_hint_for_global_dispatcher: null,
      },
      no_chat_mutation: {
        potion_session_created: false,
        recurring_reminder_created: false,
        scheduled_checkin_created: false,
        executable_confirmation_generated: false,
      },
      risk_assessment: {
        risk_score: 0,
        risk_band: "none",
        safety_preempt: false,
        reason_codes: [],
      },
      evidence: ["test_apply_attempt"],
    }),
    visibleAgentOverride: async (input: any) => {
      assertEquals(input.stage, "potion_subskill_task");
      return "Je ne peux pas la lancer depuis le chat; va dans État / Potions.";
    },
  }));

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals((result.toolSkillRun as any).requested_effects, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
});

Deno.test("exit_to_global_dispatcher clears active handoff without global reroute", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Laisse tomber la potion.",
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "clarifying",
        phase: "potion_choice",
        draft: null,
        intake_state: null,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    localFlowDispatcherOverride: async () => ({
      flow_action: "exit_to_global_dispatcher",
      confidence: "high",
      target_stage: "potion_choice",
      slot_interpretation: {
        answers_current_field: false,
        confirms_proposed_field: false,
        corrects_existing_field: false,
        asks_platform_destination: false,
        asks_chat_creation: false,
        gives_future_field_candidates: false,
      },
      field_pointer: {
        likely_field_id: null,
        raw_user_text: null,
        relation_to_field: "not_applicable",
        needs_specialized_interpretation: false,
      },
      revision_pointer: {
        candidate_field_ids: [],
        raw_revision_text: null,
        revision_intent: "not_applicable",
      },
      exit_memo_request: {
        needed: false,
        exit_reason: "none",
        handoff_hint_for_global_dispatcher: null,
      },
      risk_assessment: {
        risk_score: 0,
        risk_band: "none",
        safety_preempt: false,
        reason_codes: [],
      },
      evidence: ["test_exit_global"],
    }),
    visibleAgentOverride: async (input: any) => {
      assertEquals(input.stage, "cancel");
      return "Ok, on met la potion de côté.";
    },
  }));

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "cancelled");
  assertEquals(
    (result.toolSkillRun as any).reason_code,
    "state_potion_local_flow_cancelled",
  );
  assertEquals(
    loadStatePotionHandoffStateFromTempMemory(result.nextTempMemory),
    null,
  );
  assertEquals(
    ((result.toolSkillRun as any).runtime_trace as any[]).some((event) =>
      event.event === "exit_to_global_dispatcher"
    ),
    false,
  );
});

Deno.test("local safety preempt creates note_information for safety_crisis", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "message safety dans le flow actif",
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "clarifying",
        phase: "detail_intake",
        draft: null,
        intake_state: null,
        clarte_state: {
          flow_id: "select_state_potion.clarte",
          selected_potion: "clarte",
          field_id: "plan_meaning_loss_reason",
          field_label:
            "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?",
          potion_name: "Potion de clarté",
          platform_destination: "section État / Potions",
          field_state: {
            status: "missing",
            candidate_value: null,
            locked_value: null,
            previous_value: null,
            needs_user_confirmation: false,
            why_status: "test",
          },
          last_visible_task: "ask_deeper",
          last_handoff_delivered: false,
          subskill_history: [],
        },
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    clarteLocalDispatcherOverride: async () => ({
      flow_action: "safety_preempt",
      confidence: "high",
      selected_potion: "clarte",
      field_id: "plan_meaning_loss_reason",
      field_state: {
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "safety",
      },
      revision: {
        is_revision: false,
        replacement_value: null,
        replaces_previous_value: false,
      },
      visible_task: {
        kind: "safety",
      },
      exit_memo: {
        needed: true,
        reason: "safety",
        flow_summary: "safety local",
        collected_value: null,
        handoff_hint_for_global_dispatcher: null,
      },
      no_chat_mutation: {
        potion_session_created: false,
        recurring_reminder_created: false,
        scheduled_checkin_created: false,
        executable_confirmation_generated: false,
      },
      risk_assessment: {
        risk_score: 9,
        risk_band: "high",
        safety_preempt: true,
        reason_codes: ["local_safety"],
      },
      evidence: ["test_safety"],
    }),
    visibleAgentOverride: async () => "On met la potion de côté.",
  }));

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "blocked");
  assertEquals(
    (result.toolSkillRun as any).note_information?.target_dispatcher,
    "safety_crisis",
  );
  assertEquals(
    loadStatePotionHandoffStateFromTempMemory(result.nextTempMemory),
    null,
  );
});
