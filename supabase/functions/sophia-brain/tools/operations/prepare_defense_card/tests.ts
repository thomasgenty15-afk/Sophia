import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { runPrepareDefenseCardAiIntake } from "./ai_intake.ts";
import { executePrepareDefenseCard } from "./executor.ts";
import {
  readyDefenseCardStatePatch,
  structuredDefenseCardDraftGenerator,
  structuredDefenseCardSlotFiller,
} from "./test_helpers.ts";

const SECRET = "s5-test-secret";

Deno.test("prepare_defense_card AI flow only advances from structured slots", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais une carte de defense pour ma marche quand je rentre fatigue",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-no-fallback",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller({
      attachment: {
        status: "missing",
        confidence: "low",
        evidence: ["AI did not identify attachment"],
      },
      risk_situation: {
        status: "missing",
        confidence: "low",
        evidence: ["AI did not identify risk"],
      },
    }, ["attachment", "risk_situation"]),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.state_patch.missing_slots, [
    "attachment",
    "risk_situation",
    "trigger",
    "defense_goal",
  ]);
  assertEquals(
    (output.state_patch.intake_state as any)?.attachment.status,
    "missing",
  );
  assertEquals(
    (output.state_patch.operation_input as any)?.attachment,
    undefined,
  );
});

Deno.test("prepare_defense_card AI flow drafts from structured state and executor writes only after token", async () => {
  resetConsumedConfirmationTokensForTest();
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ce moment de risque",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-ready",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(readyDefenseCardStatePatch()),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.target_label, "marche");
  assertEquals(
    (output.pending_confirmation as any)?.intake_state?.attachment.plan_item_id,
    "walk",
  );
  assertEquals(
    output.confirmation?.message,
    [
      "Voici ta carte de défense :",
      "Le moment : je rentre fatigue et je pars scroller",
      "Le piège : moment de risque identifié",
      "Mon geste : Je pose le telephone loin de moi et j'attends 10 minutes avant de decider.",
      "Plan B : Si ca ne suffit pas, je reduis les degats et je reprends au prochain moment stable.",
      "On valide ?",
    ].join("\n"),
  );

  let writes = 0;
  const blocked = await executePrepareDefenseCard({
    operation_id: String(output.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: output.draft!,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_defense_card: async () => {
      writes++;
      return { defense_card_id: "defense" };
    },
    secret: SECRET,
  });
  assertEquals(blocked.status, "blocked");
  assertEquals(writes, 0);

  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: String(output.pending_confirmation?.operation_id),
    operation_type: "prepare_defense_card",
    draft: output.draft,
    source_message_id: "yes-defense",
    pending_confirmation_id: "pending-defense",
    secret: SECRET,
  });
  const executed = await executePrepareDefenseCard({
    operation_id: String(output.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: output.draft!,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_defense_card: async () => ({ defense_card_id: "defense-1" }),
    secret: SECRET,
  });
  assertEquals(executed.status, "executed");
  assertStringIncludes(executed.ack, "Ressources > Cartes de defense");
  assertStringIncludes(executed.ack, "l'ajuster depuis la plateforme");
});

Deno.test("prepare_defense_card AI flow stops on slot filler failure without regex fallback", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais une carte de defense pour ma marche quand je rentre fatigue",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-ai-failure",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "fallback_dashboard");
  assertEquals(output.readiness.reason, "ai_slot_filler_unavailable");
  assertEquals(output.state_patch.missing_slots, []);
});

Deno.test("prepare_defense_card AI flow keeps deterministic safety and DB guards", async () => {
  const safety = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux me faire du mal, fais une carte",
    trigger_message_id: "m-defense-safety",
    safety_pregate_risk_band: "critical",
    slot_filler: structuredDefenseCardSlotFiller(readyDefenseCardStatePatch()),
    draft_generator: structuredDefenseCardDraftGenerator,
  });
  assertEquals(safety.status, "blocked_by_safety");

  const invalidAttachment = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ça",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-invalid-target",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller(
      readyDefenseCardStatePatch({ planItemId: "missing-id" }),
    ),
    draft_generator: structuredDefenseCardDraftGenerator,
  });
  assertEquals(invalidAttachment.status, "fallback_dashboard");
  assertEquals(invalidAttachment.readiness.reason, "ai_slot_question_missing");
});

Deno.test("prepare_defense_card AI flow lets AI decide attack-vs-defense fit", async () => {
  const output = await runPrepareDefenseCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais un outil pour demarrer ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-defense-tool-fit",
    safety_pregate_risk_band: "none",
    slot_filler: structuredDefenseCardSlotFiller({
      tool_fit: {
        status: "attack_better",
        reason: "Le user parle de demarrer, pas d'un moment de rechute.",
        confidence: "high",
        evidence: ["structured fit"],
      },
      attachment: {
        status: "identified",
        kind: "plan_item",
        plan_item_id: "walk",
        title: "marche",
        confidence: "high",
        evidence: ["structured attachment"],
      },
      generated_user_message:
        "Là ça ressemble plutôt à une carte d'attaque pour démarrer. Tu veux bien ça, ou une défense pour un moment de dérapage ?",
    }, ["tool_fit"]),
    draft_generator: structuredDefenseCardDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.next_question?.slot, "tool_fit");
  assertStringIncludes(output.next_question?.question ?? "", "carte d'attaque");
});
