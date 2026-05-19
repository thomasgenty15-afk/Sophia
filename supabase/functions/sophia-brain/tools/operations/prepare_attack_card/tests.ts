import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import {
  loadReplayFixtures,
  runReplayFixtures,
} from "../../../test_harness/conversation_route_replay/runner.ts";
import { runPrepareAttackCardAiIntake } from "./ai_intake.ts";
import { executePrepareAttackCard } from "./executor.ts";
import {
  readyAttackCardStatePatch,
  structuredAttackCardDraftGenerator,
  structuredAttackCardSlotFiller,
} from "./test_helpers.ts";

const SECRET = "s5-test-secret";

Deno.test("prepare_attack_card AI flow only advances from structured slots", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais-moi une carte d'attaque texte magique pour ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-ai-no-fallback",
    safety_pregate_risk_band: "none",
    slot_filler: structuredAttackCardSlotFiller({
      target: {
        status: "missing",
        confidence: "low",
        evidence: ["AI did not identify target"],
      },
      technique: {
        status: "missing",
        confidence: "low",
        evidence: ["AI did not identify technique"],
      },
    }, ["target", "technique"]),
    draft_generator: structuredAttackCardDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.state_patch.missing_slots, ["target"]);
  assertEquals(
    (output.state_patch.intake_state as any)?.target.status,
    "missing",
  );
  assertEquals((output.state_patch.operation_input as any)?.target, undefined);
});

Deno.test("prepare_attack_card AI flow drafts from structured state and executor writes only after token", async () => {
  resetConsumedConfirmationTokensForTest();
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ça",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-ai-ready",
    safety_pregate_risk_band: "none",
    slot_filler: structuredAttackCardSlotFiller(readyAttackCardStatePatch()),
    draft_generator: structuredAttackCardDraftGenerator,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.technique, "texte_recadrage");
  assertEquals(
    (output.pending_confirmation as any)?.intake_state?.target.plan_item_id,
    "walk",
  );
  assertStringIncludes(output.confirmation?.message ?? "", "Je crée");

  let writes = 0;
  const blocked = await executePrepareAttackCard({
    operation_id: String(output.pending_confirmation?.operation_id),
    user_id: "u1",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: output.draft!,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_attack_card: async () => {
      writes++;
      return { attack_card_id: "attack" };
    },
    secret: SECRET,
  });
  assertEquals(blocked.status, "blocked");
  assertEquals(writes, 0);

  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(output.pending_confirmation?.operation_id),
    operation_type: "prepare_attack_card",
    draft: output.draft,
    source_message_id: "yes-attack",
    pending_confirmation_id: "pending-attack",
    secret: SECRET,
  });
  const executed = await executePrepareAttackCard({
    operation_id: String(output.pending_confirmation?.operation_id),
    user_id: "u1",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: output.draft!,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_attack_card: async () => ({ attack_card_id: "attack-1" }),
    secret: SECRET,
  });
  assertEquals(executed.status, "executed");
  assertStringIncludes(executed.ack, "Ressources > Cartes d'attaque du plan");
  assertEquals(executed.ack.includes("ne se modifie pas directement"), false);

  const freeToken = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-free-attack",
    operation_type: "prepare_attack_card",
    draft: output.draft,
    source_message_id: "yes-free-attack",
    pending_confirmation_id: "pending-free-attack",
    secret: SECRET,
  });
  const freeExecuted = await executePrepareAttackCard({
    operation_id: "op-free-attack",
    user_id: "u1",
    target: { kind: "personal_action", title: "poser le telephone" },
    draft: output.draft!,
    token: freeToken,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_attack_card: async () => ({ attack_card_id: "attack-free-1" }),
    secret: SECRET,
  });
  assertEquals(freeExecuted.status, "executed");
  assertStringIncludes(freeExecuted.ack, "Ressources > Cartes d'attaque");
  assertEquals(
    freeExecuted.ack.includes("Ressources > Cartes d'attaque du plan"),
    false,
  );
});

Deno.test("prepare_attack_card AI flow stops on slot filler failure without regex fallback", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais-moi une carte d'attaque preparer le terrain pour ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-ai-failure",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    draft_generator: structuredAttackCardDraftGenerator,
  });

  assertEquals(output.status, "fallback_dashboard");
  assertEquals(output.readiness.reason, "ai_slot_filler_unavailable");
  assertEquals(output.state_patch.missing_slots, []);
});

Deno.test("prepare_attack_card AI flow keeps deterministic safety and DB guards", async () => {
  const safety = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux me faire du mal, fais une carte",
    trigger_message_id: "m-safety",
    safety_pregate_risk_band: "critical",
    slot_filler: structuredAttackCardSlotFiller(readyAttackCardStatePatch()),
    draft_generator: structuredAttackCardDraftGenerator,
  });
  assertEquals(safety.status, "blocked_by_safety");

  const invalidTarget = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ça",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-invalid-target",
    safety_pregate_risk_band: "none",
    slot_filler: structuredAttackCardSlotFiller(
      readyAttackCardStatePatch({ planItemId: "missing-id" }),
    ),
    draft_generator: structuredAttackCardDraftGenerator,
  });
  assertEquals(invalidTarget.status, "fallback_dashboard");
  assertEquals(invalidTarget.readiness.reason, "ai_slot_question_missing");
});

Deno.test("prepare_attack_card AI flow rejects occupied mot de bascule deterministically", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je choisis PAUSE",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-keyword-occupied",
    safety_pregate_risk_band: "none",
    operation_input: {
      occupied_activation_keywords: [{
        activation_keyword: "PAUSE",
        activation_keyword_normalized: "pause",
      }],
    },
    slot_filler: structuredAttackCardSlotFiller(
      readyAttackCardStatePatch({
        technique: "pre_engagement",
        activationKeyword: "PAUSE",
      }),
    ),
    draft_generator: structuredAttackCardDraftGenerator,
  });

  assertEquals(output.status, "fallback_dashboard");
  assertEquals(output.readiness.reason, "ai_slot_question_missing");
});

Deno.test("S5 route replay covers the three implemented tool skill starts", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  );
  const results = await runReplayFixtures(fixtures);
  assertEquals(results.every((result) => result.passed), true);
  assertEquals(results.length >= 3, true);
});
