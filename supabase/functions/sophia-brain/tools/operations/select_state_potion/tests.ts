import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
import {
  buildStatePotionCatalogPrompt,
  STATE_POTION_TYPES,
} from "./catalog.ts";
import { runSelectStatePotionHandoffSkill } from "./handoff.ts";
import { visiblePotionLabel } from "./labels.ts";
import { renderSelectStatePotionHandoffDraft } from "./renderer.ts";
import { statePotionSubskillId } from "./contract.ts";
import { loadStatePotionHandoffStateFromTempMemory } from "./state.ts";
import { structuredStatePotionSlotFiller } from "./test_helpers.ts";
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

function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    supabase: fakeSupabase,
    userId: "u-legacy-modern",
    userMessage: "J'ai besoin d'une potion d'état.",
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyContextOutput: fakeSafetyContext,
    sourceMessageId: "m-legacy-modern",
    requestId: "r-legacy-modern",
    history: [],
    ...overrides,
  };
}

Deno.test("select_state_potion catalog keeps exact potion names and product context", () => {
  const catalog = buildStatePotionCatalogPrompt();
  assertStringIncludes(catalog, "Catalogue canonique des potions d'etat");
  assertStringIncludes(
    catalog,
    "Le suivi par defaut est un reminder court sur 7 jours",
  );
  for (const potionType of STATE_POTION_TYPES) {
    const definition = POTION_DEFINITIONS[potionType];
    assertStringIncludes(catalog, `${definition.type} - ${definition.title}`);
    assertStringIncludes(catalog, definition.short_description);
    assertStringIncludes(catalog, visiblePotionLabel(potionType));
  }
});

Deno.test("select_state_potion legacy renderer remains disabled", () => {
  const error = assertThrows(
    () => renderSelectStatePotionHandoffDraft({} as any),
    Error,
    "select_state_potion_visible_renderer_legacy_disabled",
  );
  assertStringIncludes(error.message, "visible_agents/agent.ts");
});

Deno.test("select_state_potion clarté handoff uses strict visible_task context", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userId: "u-clarte-modern",
    userMessage:
      "Je ne vois plus le lien entre mes efforts et mon pourquoi profond.",
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
        status: "locked",
        candidate_value: null,
        locked_value:
          "Je ne vois plus le lien entre mes efforts et mon pourquoi profond.",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "valeur claire",
      },
      revision: {
        is_revision: false,
        replacement_value: null,
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
      evidence: ["test_clarte"],
    }),
    visibleAgentOverride: async (input: any) => {
      assertEquals(Object.keys(input).sort(), [
        "request_id",
        "stage",
        "trace_event",
        "user_id",
        "visible_task",
      ]);
      assertEquals(input.stage, "clarte_task");
      assertEquals(
        input.visible_task.conversation_context.handoff_data.potion_name,
        "Potion de clarté",
      );
      assertEquals(
        input.visible_task.conversation_context.handoff_data.fields[0]
          .field_id,
        "plan_meaning_loss_reason",
      );
      return "Va dans État / Potions avec la Potion de clarté.";
    },
  }));

  assert(result);
  assertEquals(
    (result.toolSkillRun as any).selected_handler,
    "select_state_potion.clarte",
  );
  assertEquals((result.toolSkillRun as any).status, "handoff_delivered");
  assertEquals(result.executedTools, []);
  assertEquals(
    (result.toolSkillRun as any).note_information?.target_local_dispatcher_hint,
    "select_state_potion.clarte",
  );
});

Deno.test("select_state_potion routes every non-clarté potion to its local subskill", async () => {
  const cases = [
    "rappel",
    "courage",
    "guerison",
    "amour",
    "apaisement",
  ] as const;

  for (const potionType of cases) {
    const result = await runSelectStatePotionHandoffSkill(baseArgs({
      userId: `u-${potionType}-modern`,
      userMessage: `Je choisis ${visiblePotionLabel(potionType)}.`,
      slotFillerOverride: structuredStatePotionSlotFiller({
        state_kind: "confusion_overload",
        selected_potion: potionType,
        omit_detail_answers: true,
      }),
      potionSubskillLocalDispatcherOverride: async (input: any) => {
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
          evidence: ["test_subskill"],
        };
      },
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
        return "Question conversationnelle de test.";
      },
    }));

    assert(result, `missing result for ${potionType}`);
    assertEquals(
      (result.toolSkillRun as any).selected_handler,
      statePotionSubskillId(potionType),
    );
    assertEquals(result.executedTools, []);
    const nextState = loadStatePotionHandoffStateFromTempMemory(
      result.nextTempMemory,
    );
    assertEquals(
      nextState?.active_subskill_id,
      statePotionSubskillId(potionType),
    );
  }
});

Deno.test("select_state_potion apply_attempt remains no-chat-mutation", async () => {
  const baseSubskillState = createInitialStatePotionSubskillState(
    "amour",
    null,
  );
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userId: "u-apply-modern",
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
        potion_subskill_state: baseSubskillState,
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
      selected_potion: "amour",
      current_field_id: baseSubskillState.current_field_id,
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
      assertEquals(
        input.visible_task.conversation_context.handoff_data.potion_name,
        "Potion d'amour",
      );
      return "Je ne peux pas la lancer depuis le chat; va dans État / Potions.";
    },
  }));

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals((result.toolSkillRun as any).no_chat_mutation, true);
  assertEquals(result.executedTools, []);
});
