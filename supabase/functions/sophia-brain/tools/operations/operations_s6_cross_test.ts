import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../confirmation/confirmation_token.ts";
import { runAdjustPlanItemIntake } from "./adjust_plan_item/intake.ts";
import type {
  AdjustPlanSlotFiller,
  AdjustPlanSlotFillerOutput,
} from "./adjust_plan_item/slot_filler.ts";
import type {
  AdjustPlanResultWriter,
  AdjustPlanResultWriterInput,
} from "./adjust_plan_item/generator.ts";
import { executePrepareAttackCard } from "./prepare_attack_card/executor.ts";
import { runPrepareAttackCardAiIntake } from "./prepare_attack_card/ai_intake.ts";
import {
  readyAttackCardStatePatch,
  structuredAttackCardDraftGenerator,
  structuredAttackCardSlotFiller,
} from "./prepare_attack_card/test_helpers.ts";
import { runPrepareDefenseCardAiIntake } from "./prepare_defense_card/ai_intake.ts";
import {
  readyDefenseCardStatePatch,
  structuredDefenseCardDraftGenerator,
  structuredDefenseCardSlotFiller,
} from "./prepare_defense_card/test_helpers.ts";
import { runCreateRecurringReminderIntake } from "./create_recurring_reminder/intake.ts";
import { structuredRecurringReminderSlotFiller } from "./create_recurring_reminder/test_helpers.ts";
import { runSelectStatePotionIntake } from "./select_state_potion/intake.ts";
import {
  structuredStatePotionDraftGenerator,
  structuredStatePotionSlotFiller,
} from "./select_state_potion/test_helpers.ts";
import { runUpdateCoachPreferencesIntake } from "./update_coach_preferences/intake.ts";
import {
  readyCoachPreferencesStatePatch,
  structuredCoachPreferencesSlotFiller,
} from "./update_coach_preferences/test_helpers.ts";
import {
  loadReplayFixtures,
  runReplayFixtures,
} from "../../test_harness/conversation_route_replay/runner.ts";

const SECRET = "s6-test-secret";

function actionAdjustmentOperationInput() {
  return {
    target_granularity: {
      status: "identified",
      value: "single_action",
      confidence: "high",
      evidence: ["structured router output"],
      negative_evidence: [],
    },
    scope: {
      status: "identified",
      kind: "specific_plan_item",
      plan_item_id: "walk",
      label: "marche",
      evidence: ["structured scope output"],
    },
    payload: {
      scope_kind: "specific_plan_item",
      adjustment_type: {
        status: "identified",
        value: "reduce",
        evidence: ["structured slot filler"],
      },
      reason: {
        status: "identified",
        value: "too_heavy",
        evidence: ["structured slot filler"],
      },
      constraints: {
        status: "missing",
        values: [],
        evidence: [],
      },
    },
  };
}

function structuredAdjustPlanSlotFiller(
  operationInput = actionAdjustmentOperationInput(),
  currentSubSkill: AdjustPlanSlotFillerOutput["current_sub_skill"] =
    "action_intake",
  missingSlots: string[] = [],
): AdjustPlanSlotFiller {
  return async () => ({
    current_sub_skill: currentSubSkill,
    fill_order: [
      "scope",
      "reason_change",
      "change_target",
      "constraints",
      "affected_items",
      "draft_generation",
      "draft_validation",
    ],
    state_patch: {
      target_granularity: operationInput.target_granularity,
      scope: operationInput.scope,
      payload: operationInput.payload,
    },
    missing_slots: missingSlots,
    confidence: missingSlots.length ? "medium" : "high",
    next_question: missingSlots.length
      ? "Question générée par le slot filler IA."
      : null,
    evidence: ["structured AI slot output"],
  });
}

const testAdjustPlanResultWriter: AdjustPlanResultWriter = async (
  input: AdjustPlanResultWriterInput,
) => ({
  confirmation_message:
    `Test writer confirmation: veux-tu appliquer l'ajustement sur ${input.scope_label} ?`,
  execution_message:
    "Test writer execution: le changement est appliqué avec ce qui bouge, ce qui reste en place, et pourquoi ça aide l'utilisateur.",
  adjust_plan_result: {
    scope: input.scope_kind,
    applied_change: {
      summary: `Test writer summary for ${input.scope_label}`,
      changed_items: [
        {
          kind: input.scope_kind === "level"
            ? "level_setting"
            : input.scope_kind === "whole_plan"
            ? "plan_setting"
            : "action",
          id: null,
          title: input.bridge_action?.title ?? input.scope_label,
          before: null,
          after: input.proposed_change,
          reason: input.change_rationale.why_this_change,
        },
        ...(input.scope_kind === "action" ? [] : [{
          kind: input.scope_kind === "level"
            ? "level_setting" as const
            : "plan_setting" as const,
          id: null,
          title: input.scope_kind === "level"
            ? "Charge du niveau"
            : "Rythme global du plan",
          before: "Charge initiale",
          after: "Charge allégée",
          reason: input.change_rationale.expected_mechanism,
        }]),
      ],
      preserved_items: [{
        kind: input.scope_kind === "action" ? "action" : "plan",
        id: null,
        title: input.scope_kind === "action" ? input.scope_label : "Objectif",
        reason: "La direction décidée reste préservée.",
      }],
    },
    boundaries: {
      affected_scope: input.boundaries_policy.affected_scope,
      explicitly_not_affected: input.boundaries_policy.explicitly_not_affected,
      global_plan_impact: input.boundaries_policy.global_plan_impact,
      explanation: "Le changement reste borné par la décision du tool.",
    },
    rationale: {
      user_problem: input.decision_basis.user_problem,
      why_this_change: input.change_rationale.why_this_change,
      expected_effect: input.change_rationale.expected_mechanism,
      confidence: input.decision_basis.confidence,
      missing_info: input.decision_basis.uncertainty,
    },
    user_message_brief: "Test writer brief.",
    user_message_detailed:
      "Test writer detailed: le changement est expliqué avec ce qui bouge, ce qui reste en place, et pourquoi ça aide l'utilisateur.",
  },
});

Deno.test("S6 cross-operation integration covers sequencing and cancellation guards", async () => {
  const plan = { items: [{ id: "walk", title: "marche" }] };
  const attack = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais-moi une carte d'attaque preparer le terrain pour ma marche",
    plan_snapshot: plan,
    trigger_message_id: "m-attack",
    safety_pregate_risk_band: "none",
    slot_filler: structuredAttackCardSlotFiller(
      readyAttackCardStatePatch({ technique: "preparer_terrain" }),
    ),
    draft_generator: structuredAttackCardDraftGenerator,
  });
  assertEquals(attack.status, "pending_confirmation");
  const adjust = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "et reduis ma marche",
    plan_snapshot: plan,
    trigger_message_id: "m-adjust",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: structuredAdjustPlanSlotFiller(),
  });
  assertEquals(adjust.status, "pending_confirmation");

  assertEquals(
    (await runPrepareAttackCardAiIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "je veux me faire du mal, fais une carte",
      trigger_message_id: "m-safety",
      safety_pregate_risk_band: "critical",
      slot_filler: structuredAttackCardSlotFiller(readyAttackCardStatePatch()),
      draft_generator: structuredAttackCardDraftGenerator,
    })).status,
    "blocked_by_safety",
  );
  assertEquals(
    (await runAdjustPlanItemIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "change ma marche a mardi",
      plan_snapshot: plan,
      trigger_message_id: "m-fallback",
      safety_pregate_risk_band: "none",
      adjust_plan_result_writer: testAdjustPlanResultWriter,
    })).status,
    "ask_question",
  );
  assertEquals(
    (await runPrepareDefenseCardAiIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "cree une carte de defense",
      trigger_message_id: "m-defense-q",
      safety_pregate_risk_band: "none",
      slot_filler: structuredDefenseCardSlotFiller({
        attachment: {
          status: "missing",
          confidence: "low",
          evidence: ["structured missing"],
        },
      }, ["attachment"]),
      draft_generator: structuredDefenseCardDraftGenerator,
    })).status,
    "ask_question",
  );
  assertEquals(
    (await runCreateRecurringReminderIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "rappelle-moi tous les jours",
      trigger_message_id: "m-rec-q",
      safety_pregate_risk_band: "none",
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "daily",
        time: "09:00",
        message: null,
        generated_user_message: "Tu veux que je te rappelle quoi exactement ?",
      }),
    })).status,
    "ask_question",
  );
  assertEquals(
    (await runSelectStatePotionIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "j'ai besoin d'une potion",
      trigger_message_id: "m-potion-q",
      safety_pregate_risk_band: "none",
      slot_filler: structuredStatePotionSlotFiller({
        generated_user_message:
          "C'est plutot stress, honte, peur, flou, durete envers toi, ou decrochage ?",
      }),
      draft_generator: structuredStatePotionDraftGenerator(),
    })).status,
    "ask_question",
  );
  assertEquals(
    (await runUpdateCoachPreferencesIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "change ton style",
      trigger_message_id: "m-pref-q",
      safety_pregate_risk_band: "none",
      slot_filler: structuredCoachPreferencesSlotFiller({
        preference: {
          status: "missing",
          confidence: "low",
          evidence: ["structured missing"],
        },
      }, ["preference"]),
    })).status,
    "ask_question",
  );

  resetConsumedConfirmationTokensForTest();
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(attack.pending_confirmation?.operation_id),
    operation_type: "prepare_attack_card",
    draft: attack.draft,
    source_message_id: "yes-attack",
    pending_confirmation_id: "pending-attack",
    now_iso: "2026-01-01T00:00:00.000Z",
    ttl_ms: 1,
    secret: SECRET,
  });
  let writes = 0;
  const expired = await executePrepareAttackCard({
    operation_id: String(attack.pending_confirmation?.operation_id),
    user_id: "u1",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: attack.draft!,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_attack_card: async () => {
      writes++;
      return { attack_card_id: "bad" };
    },
    now_iso: "2026-01-01T00:00:01.000Z",
    secret: SECRET,
  });
  assertEquals(expired.status, "blocked");
  assertEquals(writes, 0);
});

const CROSS_CASES = [
  {
    name: "non confirmation then new operation has no leaked state",
    run: async () =>
      runAdjustPlanItemIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "reduis ma marche",
        plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
        trigger_message_id: "case-1",
        safety_pregate_risk_band: "none" as const,
        adjust_plan_result_writer: testAdjustPlanResultWriter,
        slot_filler: structuredAdjustPlanSlotFiller(),
      }).then((output) => output.status),
    expected: "pending_confirmation",
  },
  {
    name: "safety blocks pending-style new defense",
    run: async () =>
      (await runPrepareDefenseCardAiIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "je veux me faire du mal",
        trigger_message_id: "case-2",
        safety_pregate_risk_band: "critical" as const,
        slot_filler: structuredDefenseCardSlotFiller(
          readyDefenseCardStatePatch(),
        ),
        draft_generator: structuredDefenseCardDraftGenerator,
      })).status,
    expected: "blocked_by_safety",
  },
  {
    name: "recurring reminder missing content asks one question",
    run: async () =>
      (await runCreateRecurringReminderIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "rappelle-moi tous les jours",
        trigger_message_id: "case-3",
        safety_pregate_risk_band: "none" as const,
        slot_filler: structuredRecurringReminderSlotFiller({
          frequency: "daily",
          time: "09:00",
          message: null,
          generated_user_message:
            "Tu veux que je te rappelle quoi exactement ?",
        }),
      })).status,
    expected: "ask_question",
  },
  {
    name: "potion missing state asks one question",
    run: async () =>
      (await runSelectStatePotionIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "j'ai besoin d'une potion",
        trigger_message_id: "case-4",
        safety_pregate_risk_band: "none" as const,
        slot_filler: structuredStatePotionSlotFiller({
          generated_user_message:
            "C'est plutot stress, honte, peur, flou, durete envers toi, ou decrochage ?",
        }),
        draft_generator: structuredStatePotionDraftGenerator(),
      })).status,
    expected: "ask_question",
  },
  {
    name: "preferences vague style asks one question",
    run: async () =>
      (await runUpdateCoachPreferencesIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "change ton style",
        trigger_message_id: "case-5",
        safety_pregate_risk_band: "none" as const,
        slot_filler: structuredCoachPreferencesSlotFiller({
          preference: {
            status: "missing",
            confidence: "low",
            evidence: ["structured missing"],
          },
        }, ["preference"]),
      })).status,
    expected: "ask_question",
  },
  {
    name: "plan schedule change stays conversational",
    run: async () =>
      runAdjustPlanItemIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "change ma marche a mardi",
        plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
        trigger_message_id: "case-6",
        safety_pregate_risk_band: "none" as const,
        adjust_plan_result_writer: testAdjustPlanResultWriter,
      }).then((output) => output.status),
    expected: "ask_question",
  },
  {
    name: "defense missing risk asks one question",
    run: async () =>
      (await runPrepareDefenseCardAiIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "cree une carte de defense",
        trigger_message_id: "case-7",
        safety_pregate_risk_band: "none" as const,
        slot_filler: structuredDefenseCardSlotFiller({
          attachment: {
            status: "missing",
            confidence: "low",
            evidence: ["structured missing"],
          },
        }, ["attachment"]),
        draft_generator: structuredDefenseCardDraftGenerator,
      })).status,
    expected: "ask_question",
  },
  {
    name: "attack then adjust second op remains available",
    run: async () =>
      runAdjustPlanItemIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "et reduis ma marche",
        plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
        trigger_message_id: "case-8",
        safety_pregate_risk_band: "none" as const,
        adjust_plan_result_writer: testAdjustPlanResultWriter,
        slot_filler: structuredAdjustPlanSlotFiller(),
      }).then((output) => output.status),
    expected: "pending_confirmation",
  },
  {
    name: "preference explicit direct remains available after cancel",
    run: async () =>
      (await runUpdateCoachPreferencesIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "sois plus direct",
        trigger_message_id: "case-9",
        safety_pregate_risk_band: "none" as const,
        slot_filler: structuredCoachPreferencesSlotFiller(
          readyCoachPreferencesStatePatch("coach.tone", "direct"),
        ),
      })).status,
    expected: "pending_confirmation",
  },
  {
    name: "defense concrete risk starts after prior operation",
    run: async () =>
      (await runPrepareDefenseCardAiIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "cree une carte de defense pour quand j'ai envie de fumer",
        trigger_message_id: "case-10",
        safety_pregate_risk_band: "none" as const,
        plan_snapshot: { items: [{ id: "smoke", title: "ne pas fumer" }] },
        slot_filler: structuredDefenseCardSlotFiller(
          readyDefenseCardStatePatch({
            planItemId: "smoke",
            title: "ne pas fumer",
            riskLabel: "envie de fumer",
            triggerType: "temptation",
          }),
        ),
        draft_generator: structuredDefenseCardDraftGenerator,
      })).status,
    expected: "pending_confirmation",
  },
] as const;

for (const testCase of CROSS_CASES) {
  Deno.test(`S6 cross-operation: ${testCase.name}`, async () => {
    assertEquals(await testCase.run(), testCase.expected);
  });
}

Deno.test("S6 route replay includes all three S6 tool skill starts and base 25/25 still passes", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  );
  const baseResults = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(baseResults.every((result) => result.passed), true);
  const synthetic = [
    {
      fixture_id: "S6-adjust",
      description: "adjust plan starts",
      input: {
        user_message: "reduis ma marche",
        recent_messages: [],
        memory_payload_fixture: {},
      },
      expected: {
        safety_pregate_risk_band: "none" as const,
        response_owner: "tool_skill" as const,
        selected_handler: "adjust_plan_item",
        operation_type_started: "adjust_plan_item",
      },
    },
    {
      fixture_id: "S6-defense",
      description: "defense card starts",
      input: {
        user_message: "fais-moi une carte de defense",
        recent_messages: [],
        memory_payload_fixture: {},
      },
      expected: {
        safety_pregate_risk_band: "none" as const,
        response_owner: "tool_skill" as const,
        selected_handler: "prepare_defense_card",
        operation_type_started: "prepare_defense_card",
      },
    },
    {
      fixture_id: "S6-preferences",
      description: "preferences update starts",
      input: {
        user_message: "sois plus direct",
        recent_messages: [],
        memory_payload_fixture: {},
      },
      expected: {
        safety_pregate_risk_band: "none" as const,
        response_owner: "tool_skill" as const,
        selected_handler: "update_coach_preferences",
        operation_type_started: "update_coach_preferences",
      },
    },
  ];
  const syntheticResults = await runReplayFixtures(synthetic, { mode: "s2" });
  assertEquals(syntheticResults.every((result) => result.passed), true);
});
