import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../confirmation/confirmation_token.ts";
import { executeAdjustPlanItem } from "./adjust_plan_item/executor.ts";
import type {
  AdjustPlanResultWriter,
  AdjustPlanResultWriterInput,
} from "./adjust_plan_item/generator.ts";
import { runAdjustPlanItemIntake } from "./adjust_plan_item/intake.ts";
import { executePrepareDefenseCard } from "./prepare_defense_card/executor.ts";
import { runPrepareDefenseCardAiIntake } from "./prepare_defense_card/ai_intake.ts";
import {
  readyDefenseCardStatePatch,
  structuredDefenseCardDraftGenerator,
  structuredDefenseCardSlotFiller,
} from "./prepare_defense_card/test_helpers.ts";
import { executeUpdateCoachPreferences } from "./update_coach_preferences/executor.ts";
import { runUpdateCoachPreferencesIntake } from "./update_coach_preferences/intake.ts";
import {
  readyCoachPreferencesStatePatch,
  structuredCoachPreferencesSlotFiller,
} from "./update_coach_preferences/test_helpers.ts";

const SECRET = "s6-test-secret";

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

Deno.test("S6 operations latency smoke measures intake to generator to ack under 4s average", async () => {
  const started = Date.now();
  let completed = 0;

  resetConsumedConfirmationTokensForTest();
  const pref = await runUpdateCoachPreferencesIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "sois plus direct",
    trigger_message_id: "lat-pref",
    safety_pregate_risk_band: "none",
    slot_filler: structuredCoachPreferencesSlotFiller(
      readyCoachPreferencesStatePatch("coach.tone", "direct"),
    ),
  });
  if (pref.status !== "pending_confirmation") throw new Error("pref_not_ready");
  const prefToken = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(pref.pending_confirmation?.operation_id),
    operation_type: "update_coach_preferences",
    draft: pref.draft,
    source_message_id: "yes-pref",
    pending_confirmation_id: "pending-pref",
    secret: SECRET,
  });
  assertEquals(
    (await executeUpdateCoachPreferences({
      operation_id: String(pref.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: pref.draft!,
      token: prefToken,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_preferences_patch: async () => ({ preferences_update_id: "pref" }),
      secret: SECRET,
    })).status,
    "executed",
  );
  completed++;

  resetConsumedConfirmationTokensForTest();
  const adjust = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "reduis ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "lat-adjust",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
  });
  if (adjust.status !== "pending_confirmation") {
    throw new Error("adjust_not_ready");
  }
  const adjustToken = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(adjust.pending_confirmation?.operation_id),
    operation_type: "adjust_plan_item",
    draft: adjust.draft,
    source_message_id: "yes-adjust",
    pending_confirmation_id: "pending-adjust",
    secret: SECRET,
  });
  assertEquals(
    (await executeAdjustPlanItem({
      operation_id: String(adjust.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: adjust.draft!,
      token: adjustToken,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_plan_patch: async () => ({ plan_patch_id: "patch" }),
      secret: SECRET,
    })).status,
    "executed",
  );
  completed++;

  resetConsumedConfirmationTokensForTest();
  const defense = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "cree une carte de defense pour quand j'ai envie de fumer",
    trigger_message_id: "lat-defense",
    safety_pregate_risk_band: "none",
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
  });
  if (defense.status !== "pending_confirmation") {
    throw new Error("defense_not_ready");
  }
  const defenseToken = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(defense.pending_confirmation?.operation_id),
    operation_type: "prepare_defense_card",
    draft: defense.draft,
    source_message_id: "yes-defense",
    pending_confirmation_id: "pending-defense",
    secret: SECRET,
  });
  assertEquals(
    (await executePrepareDefenseCard({
      operation_id: String(defense.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: defense.draft!,
      token: defenseToken,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_defense_card: async () => ({ defense_card_id: "defense" }),
      secret: SECRET,
    })).status,
    "executed",
  );
  completed++;

  assertEquals((Date.now() - started) / completed < 4000, true);
});
