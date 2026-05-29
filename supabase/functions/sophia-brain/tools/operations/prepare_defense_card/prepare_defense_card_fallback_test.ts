import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type PrepareDefenseCardOperationOutput,
  runPrepareDefenseCardAiIntake,
} from "./ai_intake.ts";
import type { DefenseCardDraftV1 } from "./generator.ts";
import { maybeRunPrepareDefenseCardOperation } from "./router.ts";
import {
  readyDefenseCardStatePatch,
  structuredDefenseCardDraftGenerator,
  structuredDefenseCardSlotFiller,
} from "./test_helpers.ts";

function sampleDefenseDraft(): DefenseCardDraftV1 {
  return {
    operation_type: "prepare_defense_card",
    output_schema: "defense_card_draft_v1",
    draft: {
      title: "Carte de défense - scroll",
      impulse_label: "scroll fatigue",
      target_label: "marche",
      situation: "je rentre fatigue",
      signal: "j'ouvre le telephone",
      risk_situation: "je rentre fatigue",
      trigger: "fatigue",
      defense_response: "Je pose le telephone loin de moi.",
      plan_b: "Je reduis les degats.",
      fallback_plan: "Je reduis les degats.",
      why_it_helps: "Le geste est decide avant le moment fragile.",
      generic_defense: "Je pose le telephone loin de moi.",
    },
    confirmation_message:
      "Voici ta carte de défense :\nLe moment : je rentre fatigue\nLe piège : j'ouvre le telephone\nMon geste : Je pose le telephone loin de moi.\nPlan B : Je reduis les degats.\nOn valide ?",
    confirmation_actions: ["yes", "no"],
  };
}

function fakeDefenseSupabase(counter: { defenseWrites: number }) {
  return {
    from(table: string) {
      if (table === "user_cycles") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { id: "cycle-1" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "user_defense_cards") {
        return {
          insert: () => {
            counter.defenseWrites++;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "defense-1" },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "user_plan_items") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected_table:${table}`);
    },
  } as any;
}

function technicalDefenseOutput(
  reasonCode = "ai_unavailable",
): PrepareDefenseCardOperationOutput {
  return {
    operation_type: "prepare_defense_card",
    status: "technical_blocked",
    source: "direct_user_request",
    phase: "exit",
    ack:
      "Je n'arrive pas à préparer cette carte proprement là. On peut reprendre dans un instant.",
    reason_code: reasonCode as any,
    technical_source: "ai_unavailable",
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [{
      type: "prepare_defense_card",
      reason_code: reasonCode,
    }],
    should_preserve_pending: true,
    retryable: true,
    readiness: {
      ready_to_generate: false,
      fallback_to_dashboard: false,
      invalid_recommendation_payload: false,
      missing_required_slots: [],
      reason: "ai_slot_filler_unavailable",
    },
    state_patch: {
      summary: "technical",
      phase: "exit",
      user_intent: "unknown",
      constraints: [],
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}

Deno.test("defense_intake_ai_unavailable_returns_technical_blocked", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "prepare une carte de defense",
    trigger_message_id: "m-defense-ai-unavailable",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "technical_blocked");
  assertEquals(output.reason_code, "ai_unavailable");
  assertEquals(output.draft, undefined);
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.committed_effects, []);
});

Deno.test("defense_generation_failed_no_pending_confirmation", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "prepare une carte de defense pour marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-generation-failed",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(readyDefenseCardStatePatch()),
    draft_generator: async () => {
      throw new Error("generator_down");
    },
  });

  assertEquals(output.status, "technical_blocked");
  assertEquals(output.reason_code, "draft_generation_failed");
  assertEquals(
    (output.state_patch.operation_input as any)?.attachment.title,
    "marche",
  );
  assertEquals(output.pending_confirmation, undefined);
});

Deno.test("defense_pending_confirmation_approve_does_not_need_ai", async () => {
  const writes = { defenseWrites: 0 };
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseSupabase(writes),
    userId: "u1",
    userMessage: "oui",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-defense-approve",
        operation_type: "prepare_defense_card",
        draft: sampleDefenseDraft(),
        attachment: {
          kind: "plan_item",
          plan_item_id: "walk",
          title: "marche",
        },
        risk_situation: { label: "je rentre fatigue" },
      },
    },
    turnFrame: {
      confirmation_response: { kind: "yes", confidence_band: "high" },
      safety: { risk_band: "none" },
    } as any,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-defense-approve",
    requestId: "r-defense-approve",
    runIntake: async () => {
      throw new Error("intake_should_not_run");
    },
  });

  assertEquals(result?.toolExecution, "success");
  assertEquals(result?.executedTools, ["prepare_defense_card"]);
  assertEquals((result?.toolSkillRun as any)?.status, "executed");
  assertEquals(writes.defenseWrites, 1);
});

Deno.test("defense_pending_revision_ai_failure_preserves_pending_no_apply", async () => {
  const writes = { defenseWrites: 0 };
  const pending = {
    operation_id: "op-defense-revise",
    operation_type: "prepare_defense_card",
    draft: sampleDefenseDraft(),
    attachment: {
      kind: "plan_item",
      plan_item_id: "walk",
      title: "marche",
    },
    risk_situation: { label: "je rentre fatigue" },
  };
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseSupabase(writes),
    userId: "u1",
    userMessage: "change le geste",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: { __pending_tool_skill_confirmation: pending },
    turnFrame: {
      confirmation_response: {
        kind: "correction_to_pending",
        confidence_band: "high",
      },
      safety: { risk_band: "none" },
    } as any,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-defense-revise",
    requestId: "r-defense-revise",
    runIntake: async () => technicalDefenseOutput("ai_unavailable"),
  });

  assertEquals(result?.toolExecution, "failed");
  assertEquals((result?.toolSkillRun as any)?.status, "technical_blocked");
  assertEquals(
    result?.nextTempMemory.__pending_tool_skill_confirmation,
    pending,
  );
  assertEquals(writes.defenseWrites, 0);
});

Deno.test("defense_recommendation_ai_failure_preserves_recommendation", async () => {
  const recommendation = {
    operation_type: "prepare_defense_card",
    surface_id: "defense_card",
    recommendation_id: "rec-defense-1",
    operation_input: {
      attachment: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    },
  };
  const result = await maybeRunPrepareDefenseCardOperation({
    supabase: fakeDefenseSupabase({ defenseWrites: 0 }),
    userId: "u1",
    userMessage: "oui",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: { __pending_recommendation_operation: recommendation },
    turnFrame: {
      confirmation_response: { kind: "yes", confidence_band: "high" },
      safety: { risk_band: "none" },
    } as any,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-defense-rec",
    requestId: "r-defense-rec",
    runIntake: async () => ({
      ...technicalDefenseOutput("ai_unavailable"),
      source: "recommendation_tool",
    }),
  });

  assertEquals((result?.toolSkillRun as any)?.status, "technical_blocked");
  assertEquals(
    result?.nextTempMemory.__pending_recommendation_operation,
    recommendation,
  );
});

Deno.test("defense_no_done_language_on_technical_block", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "prepare une carte de defense",
    trigger_message_id: "m-defense-no-done",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    draft_generator: structuredDefenseCardDraftGenerator,
  });
  const lower = (output.ack ?? "").toLowerCase();
  assertEquals(
    [
      "créé",
      "cree",
      "prête",
      "prete",
      "enregistrée",
      "enregistree",
      "c'est fait",
    ]
      .some((term) => lower.includes(term)),
    false,
  );
});
