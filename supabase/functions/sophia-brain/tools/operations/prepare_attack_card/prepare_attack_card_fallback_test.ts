import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type PrepareAttackCardOperationOutput,
  runPrepareAttackCardAiIntake,
} from "./ai_intake.ts";
import type { AttackCardDraftV1 } from "./generator.ts";
import { maybeRunPrepareAttackCardOperation } from "./router.ts";
import {
  readyAttackCardStatePatch,
  structuredAttackCardDraftGenerator,
  structuredAttackCardSlotFiller,
} from "./test_helpers.ts";

function sampleAttackDraft(): AttackCardDraftV1 {
  return {
    operation_type: "prepare_attack_card",
    output_schema: "attack_card_draft_v1",
    draft: {
      title: "Carte d'attaque - marche",
      target_label: "marche",
      technique: "texte_recadrage",
      technique_title: "Le texte magique",
      instruction: "Reviens au premier geste.",
      generated_asset:
        "Quand je negocie, je reviens au premier geste minuscule.",
      activation_keyword: null,
      supporting_points: [],
      mode_emploi: "Lis-la au moment ou la resistance monte.",
      why_it_helps: "Elle coupe le debat interieur.",
    },
    confirmation_message:
      "Voici ta carte. Quand je negocie, je reviens au premier geste minuscule. Je la cree ?",
    confirmation_actions: ["yes", "no"],
  };
}

function fakeAttackSupabase(counter: { attackWrites: number }) {
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
      if (table === "user_profile_facts") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      }
      if (table === "user_attack_cards") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit: async () => ({ data: [], error: null }),
          insert: () => {
            counter.attackWrites++;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "attack-1" },
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

function technicalAttackOutput(
  reasonCode = "ai_unavailable",
): PrepareAttackCardOperationOutput {
  return {
    operation_type: "prepare_attack_card",
    user_intent: "unknown",
    constraints: [],
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
    blocked_effects: [{ type: "prepare_attack_card", reason_code: reasonCode }],
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
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}

Deno.test("attack_intake_ai_unavailable_returns_technical_blocked", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "prepare une carte d'attaque",
    trigger_message_id: "m-ai-unavailable",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    draft_generator: structuredAttackCardDraftGenerator,
  });

  assertEquals(output.status, "technical_blocked");
  assertEquals(output.reason_code, "ai_unavailable");
  assertEquals(output.draft, undefined);
  assertEquals(output.pending_confirmation, undefined);
  assertEquals(output.committed_effects, []);
});

Deno.test("attack_generation_failed_no_pending_confirmation", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "prepare une carte d'attaque pour marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-generation-failed",
    safety_pregate_risk_band: "none",
    slot_filler: structuredAttackCardSlotFiller(readyAttackCardStatePatch()),
    draft_generator: async () => {
      throw new Error("generator_down");
    },
  });

  assertEquals(output.status, "technical_blocked");
  assertEquals(output.reason_code, "draft_generation_failed");
  assertEquals(
    (output.state_patch.operation_input as any)?.target.title,
    "marche",
  );
  assertEquals(output.pending_confirmation, undefined);
});

Deno.test("attack_pending_confirmation_approve_becomes_non_mutant_apply_attempt", async () => {
  const writes = { attackWrites: 0 };
  const result = await maybeRunPrepareAttackCardOperation({
    supabase: fakeAttackSupabase(writes),
    userId: "u1",
    userMessage: "oui",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-attack-approve",
        operation_type: "prepare_attack_card",
        target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
        draft: sampleAttackDraft(),
      },
    },
    turnFrame: {
      confirmation_response: { kind: "yes", confidence_band: "high" },
      safety: { risk_band: "none" },
    } as any,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-approve",
    requestId: "r-approve",
    runIntake: async () => {
      throw new Error("intake_should_not_run");
    },
  });

  assertEquals(result?.toolExecution, "platform_handoff");
  assertEquals(result?.executedTools, []);
  assertEquals((result?.toolSkillRun as any)?.status, "apply_attempt");
  assertEquals(
    (result?.toolSkillRun as any)?.committed_effects?.length,
    0,
  );
  assertEquals(writes.attackWrites, 0);
});

Deno.test("attack_pending_revision_ai_failure_preserves_pending_no_apply", async () => {
  const writes = { attackWrites: 0 };
  const pending = {
    operation_id: "op-attack-revise",
    operation_type: "prepare_attack_card",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: sampleAttackDraft(),
  };
  const result = await maybeRunPrepareAttackCardOperation({
    supabase: fakeAttackSupabase(writes),
    userId: "u1",
    userMessage: "change le texte",
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
    sourceMessageId: "m-revise",
    requestId: "r-revise",
    runIntake: async () => technicalAttackOutput("ai_unavailable"),
  });

  assertEquals(result?.toolExecution, "failed");
  assertEquals((result?.toolSkillRun as any)?.status, "technical_blocked");
  assertEquals(
    result?.nextTempMemory.__pending_tool_skill_confirmation,
    pending,
  );
  assertEquals(writes.attackWrites, 0);
});

Deno.test("attack_recommendation_ai_failure_preserves_recommendation", async () => {
  const recommendation = {
    operation_type: "prepare_attack_card",
    surface_id: "attack_card",
    recommendation_id: "rec-attack-1",
    operation_input: {
      target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    },
  };
  const result = await maybeRunPrepareAttackCardOperation({
    supabase: fakeAttackSupabase({ attackWrites: 0 }),
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
    sourceMessageId: "m-rec",
    requestId: "r-rec",
    runIntake: async () => ({
      ...technicalAttackOutput("ai_unavailable"),
      source: "recommendation_tool",
    }),
  });

  assertEquals((result?.toolSkillRun as any)?.status, "technical_blocked");
  assertEquals(
    result?.nextTempMemory.__pending_recommendation_operation,
    recommendation,
  );
});

Deno.test("attack_no_done_language_on_technical_block", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "prepare une carte d'attaque",
    trigger_message_id: "m-no-done",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    draft_generator: structuredAttackCardDraftGenerator,
  });
  const reply = output.ack ?? "";
  const lower = reply.toLowerCase();
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
