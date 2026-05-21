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
import { refineAttackCardTechniqueFitForTest } from "./slot_filler.ts";
import {
  readyAttackCardStatePatch,
  structuredAttackCardDraftGenerator,
  structuredAttackCardSlotFiller,
} from "./test_helpers.ts";

const SECRET = "s5-test-secret";

Deno.test("prepare_attack_card technique fit prefers ancre visuelle over mot de bascule for perfectionism start blocker", () => {
  const refined = refineAttackCardTechniqueFitForTest({
    current_step: "technique_selection",
    missing_slots: ["technique"],
    confidence: "high",
    generated_user_message:
      "Je te propose Le texte magique ou Mot de bascule. Qu'est-ce qui te semble le plus efficace ?",
    state_patch: {
      current_step: "technique_selection",
      target: {
        status: "identified",
        kind: "personal_action",
        plan_item_id: null,
        title: "Relire deux pages de compte rendu",
        confidence: "high",
        evidence: ["relire deux pages de compte rendu"],
      },
      blocker: {
        type: "avoidance",
        confidence: 0.9,
        evidence: [
          "attendre d'avoir tout compris avant d'écrire une ligne",
        ],
      },
      technique: {
        status: "ambiguous",
        value: null,
        explicitly_requested: false,
        fit_warning: null,
        confidence: "medium",
        evidence: ["attendre d'avoir tout compris"],
        options: [
          {
            technique_key: "texte_recadrage",
            title: "Le texte magique",
            description: "recadrage",
            reason: "recadrer le perfectionnisme",
            example: "texte court",
            recommended: true,
          },
          {
            technique_key: "pre_engagement",
            title: "Mot de bascule",
            description: "mot court",
            reason: "signaler le blocage",
            example: "BASCULE",
            recommended: false,
          },
        ],
      },
      activation_keyword: {
        status: "not_applicable",
        value: null,
        options: [],
        rejected_value: null,
        confidence: "low",
        evidence: [],
      },
      constraints: ["version minimale"],
      missing_slots: ["technique"],
      confidence: "high",
      generated_user_message:
        "Je te propose Le texte magique ou Mot de bascule. Qu'est-ce qui te semble le plus efficace ?",
    },
  }, {
    message:
      "Le boulot c'est relire deux pages de compte rendu; mon réflexe c'est d'attendre d'avoir tout compris avant d'écrire une ligne.",
  });

  const options = refined.state_patch.technique?.options ?? [];
  assertEquals(
    options.some((option) => option.technique_key === "pre_engagement"),
    false,
  );
  assertEquals(
    options.some((option) => option.technique_key === "ancre_visuelle"),
    true,
  );
  assertEquals(
    /Mot de bascule/i.test(refined.generated_user_message ?? ""),
    false,
  );
  assertStringIncludes(refined.generated_user_message ?? "", "Ancre visuelle");
});

Deno.test("prepare_attack_card technique fit keeps mot de bascule for impulse risk", () => {
  const refined = refineAttackCardTechniqueFitForTest({
    current_step: "technique_selection",
    missing_slots: ["technique"],
    confidence: "high",
    generated_user_message:
      "Je te propose Mot de bascule. Qu'est-ce qui te semble le plus utile ?",
    state_patch: {
      current_step: "technique_selection",
      blocker: {
        type: "avoidance",
        confidence: 0.9,
        evidence: ["je risque de craquer a chaud"],
      },
      technique: {
        status: "ambiguous",
        value: null,
        explicitly_requested: false,
        fit_warning: null,
        confidence: "medium",
        evidence: ["risque de craquer"],
        options: [
          {
            technique_key: "pre_engagement",
            title: "Mot de bascule",
            description: "mot court",
            reason: "moment fragile",
            example: "BASCULE",
            recommended: true,
          },
        ],
      },
      missing_slots: ["technique"],
      confidence: "high",
    },
  }, {
    message:
      "Quand je suis a chaud je risque de craquer et d'envoyer un message impulsif.",
  });

  assertEquals(
    (refined.state_patch.technique?.options ?? []).some((option) =>
      option.technique_key === "pre_engagement"
    ),
    true,
  );
});

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
