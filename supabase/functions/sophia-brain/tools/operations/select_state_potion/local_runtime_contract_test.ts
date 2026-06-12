import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runSelectStatePotionHandoffSkill } from "./handoff.ts";
import { loadStatePotionHandoffStateFromTempMemory } from "./state.ts";
import { structuredStatePotionSlotFiller } from "./test_helpers.ts";
import { statePotionSubskillId } from "./contract.ts";
import { createInitialStatePotionSubskillState } from "./subskills/state_potion_subskill_flow.ts";

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
  reason_code: "test_select_state_potion_entry",
  direct_effects_to_run: [],
  blocked_paths: [],
  memory_used_for_route: false,
  memory_item_ids_used_for_route: [],
  memory_use_kind: "none",
} as any;

Deno.test("select_state_potion hands off to clarté subskill when clarté is identified", async () => {
  const result = await runSelectStatePotionHandoffSkill({
    supabase: fakeSupabase,
    userId: "u-clarte-baton",
    userMessage:
      "C'est surtout retrouver le sens de mes efforts et le lien avec mon pourquoi.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyContextOutput: fakeSafetyContext,
    sourceMessageId: "m-clarte-baton",
    requestId: "r-clarte-baton",
    history: [],
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "confusion_overload",
      selected_potion: "clarte",
      omit_detail_answers: true,
    }),
    clarteLocalDispatcherOverride: async () => ({
      flow_action: "answer_current_field",
      confidence: "high",
      selected_potion: "clarte",
      field_id: "plan_meaning_loss_reason",
      field_state: {
        status: "proposed",
        candidate_value:
          "Je ne vois plus le lien entre mes efforts quotidiens et mon pourquoi profond.",
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "proposition clarté",
      },
      revision: {
        is_revision: false,
        replacement_value: null,
        replaces_previous_value: false,
      },
      visible_task: {
        kind: "confirm_proposal",
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
      evidence: ["test baton"],
    }),
    visibleAgentOverride: async () => "Est-ce que cette formulation te va ?",
  });

  assert(result);
  assertEquals(
    (result.toolSkillRun as any).selected_handler,
    "select_state_potion.clarte",
  );
  assertEquals((result.toolSkillRun as any).status, "clarifying");
  assertEquals(
    (result.toolSkillRun as any).reason_code,
    "clarte_field_proposed",
  );
  const nextState = loadStatePotionHandoffStateFromTempMemory(
    result.nextTempMemory,
  );
  assertEquals(nextState?.skill_id, "select_state_potion");
  assertEquals(nextState?.active_subskill_id, "select_state_potion.clarte");
  assertEquals(nextState?.clarte_state?.selected_potion, "clarte");
  assertEquals(
    nextState?.clarte_state?.field_state.status,
    "proposed",
  );
  assertEquals(
    (result.toolSkillRun as any).note_information?.target_dispatcher,
    "other_local",
  );
  assertEquals(
    (result.toolSkillRun as any).note_information?.target_local_dispatcher_hint,
    "select_state_potion.clarte",
  );
  assert(
    ((result.toolSkillRun as any).runtime_trace as any[]).some((event) =>
      event.event === "note_information_created" &&
      event.target_local_dispatcher_hint === "select_state_potion.clarte"
    ),
  );
  assertEquals(result.executedTools, []);
});

Deno.test("select_state_potion hands off to every potion detail subskill when selected", async () => {
  const cases = [
    "rappel",
    "courage",
    "guerison",
    "amour",
    "apaisement",
  ] as const;

  for (const potionType of cases) {
    const result = await runSelectStatePotionHandoffSkill({
      supabase: fakeSupabase,
      userId: `u-${potionType}-baton`,
      userMessage: `Je choisis ${potionType}.`,
      channel: "web",
      userTimezone: "Europe/Paris",
      tempMemory: {},
      turnFrame: null,
      routeDecision: selectPotionRouteDecision,
      safetyContextOutput: fakeSafetyContext,
      sourceMessageId: `m-${potionType}-baton`,
      requestId: `r-${potionType}-baton`,
      history: [],
      slotFillerOverride: structuredStatePotionSlotFiller({
        state_kind: "confusion_overload",
        selected_potion: potionType,
        omit_detail_answers: true,
        generated_user_message: "Question conversationnelle de test.",
      }),
      potionSubskillLocalDispatcherOverride: async (input) => {
        const state = createInitialStatePotionSubskillState(
          potionType,
          input.intake_state,
        );
        const currentField = state.current_field_id
          ? state.field_states[state.current_field_id]
          : null;
        return {
          flow_action: "answer_current_field",
          confidence: "high",
          selected_potion: potionType,
          current_field_id: state.current_field_id,
          field_states: currentField ? [currentField] : [],
          revision: {
            is_revision: false,
            field_id: null,
            replacement_value: null,
            option_value: null,
            option_label: null,
            replaces_previous_value: false,
          },
          visible_task: {
            kind: "ask_deeper",
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
          evidence: ["test local subskill"],
        };
      },
      visibleAgentOverride: async () => "Question conversationnelle de test.",
    });

    assert(result, `missing result for ${potionType}`);
    assertEquals(
      (result.toolSkillRun as any).selected_handler,
      statePotionSubskillId(potionType),
    );
    assertEquals((result.toolSkillRun as any).status, "clarifying");
    const nextState = loadStatePotionHandoffStateFromTempMemory(
      result.nextTempMemory,
    );
    assertEquals(
      nextState?.active_subskill_id,
      statePotionSubskillId(potionType),
    );
    assertEquals(
      nextState?.intake_state?.selected_potion.value,
      potionType,
    );
    assertEquals(
      nextState?.potion_subskill_state?.selected_potion,
      potionType,
    );
    assertEquals(
      (result.toolSkillRun as any).note_information?.target_dispatcher,
      "other_local",
    );
    assertEquals(
      (result.toolSkillRun as any).note_information
        ?.target_local_dispatcher_hint,
      statePotionSubskillId(potionType),
    );
    assertEquals(result.executedTools, []);
  }
});

Deno.test("active potion subskill delivers final handoff when remaining field is answered", async () => {
  const baseSubskillState = createInitialStatePotionSubskillState(
    "amour",
    null,
  );
  const previousSubskillState: typeof baseSubskillState = {
    ...baseSubskillState,
    field_states: {
      ...baseSubskillState.field_states,
      love_lack_context: {
        ...baseSubskillState.field_states.love_lack_context,
        status: "locked" as const,
        locked_value: "mon écriture",
        candidate_value: null,
        option_value: null,
        option_label: null,
        needs_user_confirmation: false,
        why_status: "Champ déjà verrouillé avant ce tour.",
      },
    },
    current_field_id: "love_state",
  };

  const result = await runSelectStatePotionHandoffSkill({
    supabase: fakeSupabase,
    userId: "u-amour-runtime-complete",
    userMessage: "Dans les faits, je me parle très durement.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        active_subskill_id: "select_state_potion.amour",
        mode: "platform_handoff",
        status: "clarifying",
        phase: "detail_intake",
        draft: null,
        intake_state: null,
        potion_subskill_state: previousSubskillState,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyContextOutput: fakeSafetyContext,
    sourceMessageId: "m-amour-runtime-complete",
    requestId: "r-amour-runtime-complete",
    history: [],
    potionSubskillLocalDispatcherOverride: async () => ({
      flow_action: "platform_destination_followup",
      confidence: "high",
      selected_potion: "amour",
      current_field_id: "love_state",
      field_states: [{
        ...previousSubskillState.field_states.love_state,
        status: "locked",
        locked_value: "Dur",
        candidate_value: null,
        option_value: "dur",
        option_label: "Dur",
        needs_user_confirmation: false,
        why_status:
          "Le user décrit explicitement une parole intérieure très dure.",
      }],
      revision: {
        is_revision: false,
        field_id: null,
        replacement_value: null,
        option_value: null,
        option_label: null,
        replaces_previous_value: false,
      },
      visible_task: {
        kind: "destination_short",
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
      evidence: ["je me parle très durement"],
    }),
    visibleAgentOverride: async (input: any) => {
      assertEquals(input.stage, "potion_subskill_task");
      assertEquals(Object.keys(input).sort(), [
        "request_id",
        "stage",
        "trace_event",
        "user_id",
        "visible_task",
      ]);
      assert(input.visible_task.conversation_context);
      assertEquals(input.visible_task.instruction.includes("handoff"), true);
      assert(
        input.visible_task.conversation_context.tone_constraints.includes(
          "répondre naturellement",
        ),
      );
      assert(
        input.visible_task.conversation_context.do_not_say.includes(
          "ne demande jamais de dire oui pour lancer depuis le chat",
        ),
      );
      assertEquals(
        input.visible_task.conversation_context.handoff_data.potion_name,
        "Potion d'amour",
      );
      assertEquals(
        input.visible_task.conversation_context.handoff_data.fields.map((
          field: any,
        ) => field.field_id),
        ["love_lack_context", "love_state"],
      );
      return "handoff complet mock";
    },
  });

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "handoff_delivered");
  assertEquals(
    (result.toolSkillRun as any).selected_handler,
    "select_state_potion.amour",
  );
  assertEquals(
    (result.toolSkillRun as any).reason_code,
    "amour_handoff_delivered_from_destination_followup",
  );
  assert((result.toolSkillRun as any).platform_handoff?.draft);
  assertEquals(result.content, "handoff complet mock");
  assertEquals(result.executedTools, []);

  const nextState = loadStatePotionHandoffStateFromTempMemory(
    result.nextTempMemory,
  );
  assertEquals(nextState?.status, "handoff_delivered");
  assertEquals(nextState?.active_subskill_id, "select_state_potion.amour");
  assert(nextState?.draft);
  assertEquals(
    nextState?.draft?.recommendation.platform_inputs?.answers.map((answer) =>
      answer.question_id
    ),
    ["love_lack_context", "love_state"],
  );
});

Deno.test("active clarté safety exits local flow and exposes local risk assessment", async () => {
  const result = await runSelectStatePotionHandoffSkill({
    supabase: fakeSupabase,
    userId: "u-local-risk",
    userMessage: "message safety dans le flow actif",
    channel: "web",
    userTimezone: "Europe/Paris",
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
          visible_task: "ask_deeper",
        },
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "select_state_potion",
      reason_code: "active_select_state_potion_local_dispatcher",
      direct_effects_to_run: [],
      blocked_paths: [],
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    safetyContextOutput: fakeSafetyContext,
    sourceMessageId: "m-local-risk",
    requestId: "r-local-risk",
    history: [],
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
        reason_codes: ["local_clarte_safety"],
      },
      evidence: ["local dispatcher output"],
    }),
    visibleAgentOverride: async () => "Ok, on met la potion de clarté de côté.",
  });

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "blocked");
  assertEquals(
    (result.toolSkillRun as any).selected_handler,
    "select_state_potion.clarte",
  );
  assertEquals((result.toolSkillRun as any).risk_assessment.risk_score, 9);
  assertEquals(
    (result.toolSkillRun as any).risk_assessment.safety_preempt,
    true,
  );
  assertEquals(
    (result.toolSkillRun as any).note_information?.target_dispatcher,
    "safety_crisis",
  );
  assertEquals(
    loadStatePotionHandoffStateFromTempMemory(result.nextTempMemory),
    null,
  );
  assertEquals(result.executedTools, []);
  const runtimeTrace = (result.toolSkillRun as any).runtime_trace;
  assert(Array.isArray(runtimeTrace));
  assert(
    runtimeTrace.some((event: any) =>
      event.component === "local_dispatcher" &&
      event.flow_action === "safety_preempt"
    ),
  );
  assert(
    runtimeTrace.some((event: any) =>
      event.component === "local_reducer" &&
      event.exit_to_global_dispatcher === false
    ),
  );
});

Deno.test("active parent exit_to_global_dispatcher cancels locally without global dispatcher exit", async () => {
  const result = await runSelectStatePotionHandoffSkill({
    supabase: fakeSupabase,
    userId: "u-local-stop",
    userMessage: "laisse tomber la potion finalement",
    channel: "web",
    userTimezone: "Europe/Paris",
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
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyContextOutput: fakeSafetyContext,
    sourceMessageId: "m-local-stop",
    requestId: "r-local-stop",
    history: [],
    localFlowDispatcherOverride: async () => ({
      flow_action: "exit_to_global_dispatcher",
      confidence: "high",
      target_stage: "detail_intake",
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
      evidence: ["explicit local stop"],
    }),
    visibleAgentOverride: async (input: any) => {
      assertEquals(input.stage, "cancel");
      assert(input.visible_task.conversation_context);
      assertEquals(Object.keys(input).sort(), [
        "request_id",
        "stage",
        "trace_event",
        "user_id",
        "visible_task",
      ]);
      return "Ok, on met la potion de côté.";
    },
  });

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "cancelled");
  assertEquals(
    loadStatePotionHandoffStateFromTempMemory(result.nextTempMemory),
    null,
  );
  assertEquals(
    Boolean(
      (result.nextTempMemory as any).__last_select_state_potion_exit_memo,
    ),
    false,
  );
  assertEquals((result.toolSkillRun as any).note_information, null);
  assert(
    !((result.toolSkillRun as any).runtime_trace as any[]).some((event) =>
      event.event === "exit_to_global_dispatcher"
    ),
  );
});
