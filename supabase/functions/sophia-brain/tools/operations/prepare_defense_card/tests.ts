import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { executePrepareDefenseCard } from "./executor.ts";
import { runPrepareDefenseCardIntake } from "./intake.ts";

const SECRET = "s6-test-secret";

Deno.test("prepare_defense_card pipeline covers 5 scenarios and differs from attack drafts", async () => {
  const scenarios = [
    {
      message: "cree une carte de defense pour quand j'ai envie de fumer",
      expected: "pending_confirmation",
    },
    {
      message:
        "cree une carte de defense pour ne pas sauter ma marche quand il pleut",
      plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
      expected: "pending_confirmation",
    },
    {
      message: "cree-moi une carte de defense",
      expected: "ask_question",
    },
    {
      message: "recommendation",
      source: "recommendation_tool" as const,
      operation_input: {
        attachment: { kind: "free_risk_context", title: "envie de fumer" },
        risk_situation: { label: "envie de fumer" },
      },
      expected: "pending_confirmation",
    },
    {
      message: "recommendation",
      source: "recommendation_tool" as const,
      operation_input: {
        attachment: { kind: "free_risk_context", title: "envie" },
      },
      expected: "invalid_recommendation_payload",
    },
  ];
  for (const scenario of scenarios) {
    resetConsumedConfirmationTokensForTest();
    const output = runPrepareDefenseCardIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: scenario.message,
      source: scenario.source,
      operation_input: scenario.operation_input,
      plan_snapshot: scenario.plan_snapshot,
      trigger_message_id: `m-${scenario.expected}`,
      safety_pregate_risk_band: "none",
    });
    assertEquals(output.status, scenario.expected, scenario.message);
    if (output.status === "ask_question") {
      assertEquals((output.next_question as any)?.question, undefined);
    }
    if (output.status === "pending_confirmation") {
      assertEquals(
        output.draft?.draft.defense_response.includes("4 minutes"),
        false,
      );
      const token = await createConfirmationToken({
        user_id: "u1",
        operation_id: String(output.pending_confirmation?.operation_id),
        operation_type: "prepare_defense_card",
        draft: output.draft,
        source_message_id: "yes",
        pending_confirmation_id: "pending",
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
        write_defense_card: async () => ({ defense_card_id: "defense" }),
        secret: SECRET,
      });
      assertEquals(executed.status, "executed");
      assertEquals(
        executed.ack.includes("Ressources > Cartes de defense"),
        true,
      );
      assertEquals(
        executed.ack.includes("l'ajuster depuis la plateforme"),
        true,
      );
      assertEquals(executed.ack.includes("Depuis le chat"), true);
      assertEquals(executed.ack.includes("sophia-coach.ai"), false);
    }
  }
});

Deno.test("prepare_defense_card blocks safety and no-token writes", async () => {
  const safety = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux me faire du mal, carte de defense",
    trigger_message_id: "m-safety",
    safety_pregate_risk_band: "critical",
  });
  assertEquals(safety.status, "blocked_by_safety");
  const ready = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "cree une carte de defense pour quand j'ai envie de fumer",
    trigger_message_id: "m-ready",
    safety_pregate_risk_band: "none",
  });
  if (ready.status !== "pending_confirmation") {
    throw new Error("expected_pending");
  }
  let writes = 0;
  const blocked = await executePrepareDefenseCard({
    operation_id: String(ready.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: ready.draft!,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_defense_card: async () => {
      writes++;
      return { defense_card_id: "bad" };
    },
    secret: SECRET,
  });
  assertEquals(blocked.status, "blocked");
  assertEquals(writes, 0);
});

Deno.test("prepare_defense_card resolves fuzzy attachments and uses structured slots", () => {
  const planSnapshot = {
    items: [
      { id: "sas", title: "Faire le sas de déchargement" },
      { id: "zone", title: "Préparer ta zone de déchargement" },
      { id: "sleep", title: "Préparer le rituel de sommeil" },
    ],
  };

  const fuzzy = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Crée une carte de défense pour ne pas sauter mon sas de dechargement quand je suis fatigue",
    trigger_message_id: "m-defense-fuzzy",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(fuzzy.status, "pending_confirmation");
  assertEquals(
    (fuzzy.pending_confirmation?.attachment as any)?.plan_item_id,
    "sas",
  );

  const vague = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Crée une carte de défense parce que je risque de commander",
    trigger_message_id: "m-defense-vague",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(vague.status, "ask_question");
  assertEquals((vague.next_question as any)?.question, undefined);
  assertEquals((vague.next_question as any)?.slot, "attachment");

  const candidate = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Crée une défense pour le sommeil quand je scroll",
    trigger_message_id: "m-defense-candidate",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(candidate.status, "ask_question");
  assertEquals(
    (candidate.next_question as any)?.status,
    "candidate_needs_confirmation",
  );
  assertEquals(
    (candidate.next_question as any)?.candidate?.plan_item_id,
    "sleep",
  );
  assertEquals((candidate.next_question as any)?.question, undefined);

  const correction = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Non pas de preparer la zone, je parle du sas de dechargement, pour ne pas le sauter quand je fatigue",
    trigger_message_id: "m-defense-correction",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(correction.status, "pending_confirmation");
  assertEquals(
    (correction.pending_confirmation?.attachment as any)?.plan_item_id,
    "sas",
  );
});

Deno.test("prepare_defense_card checks attack-vs-defense fit and keeps corrections", () => {
  const planSnapshot = {
    items: [
      { id: "sas", title: "Faire le sas de déchargement" },
      { id: "zone", title: "Préparer ta zone de déchargement" },
    ],
  };

  const attackLike = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Fais une carte de défense pour préparer ma zone carnet stylo avant le soir.",
    trigger_message_id: "m-defense-fit",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(attackLike.status, "ask_question");
  assertEquals(attackLike.next_question?.slot, "tool_fit");
  assertEquals(
    attackLike.next_question?.known_slots?.tool_fit_warning?.includes(
      "carte d'attaque",
    ),
    true,
  );

  const riskReady = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Crée une carte de défense pour Faire le sas de déchargement quand je risque de rallumer le téléphone après le sas.",
    trigger_message_id: "m-defense-risk",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(riskReady.status, "pending_confirmation");
  assertEquals(
    (riskReady.pending_confirmation?.attachment as any)?.plan_item_id,
    "sas",
  );
  assertEquals(
    riskReady.draft?.draft.risk_situation,
    "rallumer l'ecran dans le moment fragile",
  );

  const corrected = runPrepareDefenseCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Non, le risque c'est plutôt quand je suis fatigué, et je veux quitter la pièce 3 minutes.",
    trigger_message_id: "m-defense-corrected",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: {
      attachment: riskReady.pending_confirmation?.attachment,
      risk_situation: riskReady.pending_confirmation?.risk_situation,
    },
  });
  assertEquals(corrected.status, "pending_confirmation");
  assertEquals(
    (corrected.pending_confirmation?.attachment as any)?.plan_item_id,
    "sas",
  );
  assertEquals(
    corrected.draft?.draft.risk_situation,
    "fatigue qui fragilise l'action",
  );
  assertEquals(
    corrected.draft?.draft.defense_response.includes("quitter la pièce"),
    true,
  );
});
