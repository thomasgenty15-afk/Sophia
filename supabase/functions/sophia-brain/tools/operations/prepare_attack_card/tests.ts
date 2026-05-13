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
import { executePrepareAttackCard } from "./executor.ts";
import { runPrepareAttackCardAiIntake } from "./ai_intake.ts";
import { runPrepareAttackCardIntake } from "./intake.ts";
import type { AttackCardSlotFiller } from "./slot_filler.ts";
import type { AttackCardDraftGenerator } from "./ai_intake.ts";

const SECRET = "s5-test-secret";

const structuredSlotFiller = (
  statePatch: Record<string, unknown>,
  missingSlots: string[] = [],
): AttackCardSlotFiller =>
async () => ({
  current_step: missingSlots.includes("target")
    ? "target_intake"
    : missingSlots.includes("technique")
    ? "technique_selection"
    : missingSlots.includes("activation_keyword")
    ? "keyword_intake"
    : "draft_generation",
  state_patch: statePatch as any,
  missing_slots: missingSlots,
  confidence: "high",
  generated_user_message: missingSlots.length
    ? "Quelle action exacte tu veux viser ?"
    : null,
  evidence: ["structured test filler"],
});

const structuredDraftGenerator: AttackCardDraftGenerator = async (input) => {
  if (
    input.state.target.status !== "identified" || !input.state.technique.value
  ) {
    throw new Error("test_draft_missing_state");
  }
  return {
    operation_type: "prepare_attack_card",
    output_schema: "attack_card_draft_v1",
    draft: {
      title: `Carte d'attaque - ${input.state.target.title}`,
      target_label: input.state.target.title,
      technique: input.state.technique.value,
      technique_title: "Le texte magique",
      instruction: "Relis le texte puis fais le premier geste.",
      generated_asset:
        "Quand je commence à négocier, je reviens au premier geste minuscule.",
      activation_keyword: null,
      supporting_points: [],
      mode_emploi: "Lis-la au moment où la résistance monte.",
      why_it_helps: "Elle coupe le débat intérieur.",
    },
    confirmation_message: "Je crée cette carte ?",
    confirmation_actions: ["yes", "no"],
  };
};

Deno.test("prepare_attack_card pipeline covers 5 scenarios", async () => {
  const scenarios = [
    {
      name: "direct-plan-target",
      message:
        "fais-moi une carte d'attaque preparer le terrain pour ma marche",
      plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
      expected: "pending_confirmation",
    },
    {
      name: "missing-target",
      message: "cree-moi une carte d'attaque",
      plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
      expected: "ask_question",
    },
    {
      name: "fallback-after-question",
      message: "cree-moi une carte d'attaque",
      turn_count: 1,
      expected: "ask_question",
    },
    {
      name: "recommendation-full",
      message: "recommendation",
      source: "recommendation_tool" as const,
      operation_input: {
        target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
        blocker: { type: "avoidance" },
        desired_attack_angle: "preparer_terrain",
      },
      expected: "pending_confirmation",
    },
    {
      name: "recommendation-missing-target",
      message: "recommendation",
      source: "recommendation_tool" as const,
      operation_input: { blocker: { type: "avoidance" } },
      expected: "invalid_recommendation_payload",
    },
  ];
  assertEquals(scenarios.length, 5);
  for (const scenario of scenarios) {
    resetConsumedConfirmationTokensForTest();
    const output = runPrepareAttackCardIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: scenario.message,
      source: scenario.source,
      trigger_message_id: `m-${scenario.name}`,
      safety_pregate_risk_band: "none",
      turn_count: scenario.turn_count,
      plan_snapshot: scenario.plan_snapshot,
      operation_input: scenario.operation_input,
    });
    assertEquals(output.status, scenario.expected, scenario.name);
    if (output.status === "pending_confirmation") {
      const token = await createConfirmationToken({
        user_id: "u1",
        operation_id: String(output.pending_confirmation?.operation_id),
        operation_type: "prepare_attack_card",
        draft: output.draft,
        source_message_id: `yes-${scenario.name}`,
        pending_confirmation_id: `pending-${scenario.name}`,
        secret: SECRET,
      });
      const executed = await executePrepareAttackCard({
        operation_id: String(output.pending_confirmation?.operation_id),
        user_id: "u1",
        target: {
          kind: "plan_item",
          plan_item_id: "walk",
          title: "marche",
        },
        draft: output.draft!,
        token,
        safety_pregate_risk_band: "none",
        pending_confirmation_lookup: async () => ({ consumed: false }),
        token_consumption_check: async (tokenId) =>
          hasConsumedConfirmationTokenForTest(tokenId),
        write_attack_card: async () => ({ attack_card_id: "attack-1" }),
        secret: SECRET,
      });
      assertEquals(executed.status, "executed", scenario.name);
      assertEquals(
        executed.ack.includes("Ressources > Cartes d'attaque du plan"),
        true,
      );
      assertEquals(
        executed.ack.includes("le mot peut etre remplace"),
        true,
      );
      assertEquals(
        executed.ack.includes("ne se modifie pas directement"),
        false,
      );
    }
  }
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
    slot_filler: structuredSlotFiller({
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
    draft_generator: structuredDraftGenerator,
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.state_patch.missing_slots, ["target"]);
  assertEquals(
    (output.state_patch.intake_state as any)?.target.status,
    "missing",
  );
  assertEquals((output.state_patch.operation_input as any)?.target, undefined);
});

Deno.test("prepare_attack_card AI flow drafts from structured state", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "ok fais une carte pour ça",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-ai-ready",
    safety_pregate_risk_band: "none",
    slot_filler: structuredSlotFiller({
      target: {
        status: "identified",
        kind: "plan_item",
        plan_item_id: "walk",
        title: "marche",
        confidence: "high",
        evidence: ["structured target"],
      },
      technique: {
        status: "identified",
        value: "texte_recadrage",
        confidence: "high",
        evidence: ["structured technique"],
      },
      activation_keyword: {
        status: "not_applicable",
        confidence: "high",
        evidence: ["not a pre-engagement technique"],
      },
      blocker: {
        type: "avoidance",
        confidence: 0.8,
        evidence: ["structured blocker"],
      },
    }),
    draft_generator: structuredDraftGenerator,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.technique, "texte_recadrage");
  assertEquals(
    (output.pending_confirmation as any)?.intake_state?.target.plan_item_id,
    "walk",
  );
  assertStringIncludes(output.confirmation?.message ?? "", "Je crée");
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
    draft_generator: structuredDraftGenerator,
  });

  assertEquals(output.status, "fallback_dashboard");
  assertEquals(output.readiness.reason, "ai_slot_filler_unavailable");
  assertEquals(output.state_patch.missing_slots, []);
});

Deno.test("prepare_attack_card target resolver is strict and blocks writes without Oui", async () => {
  const vague = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais-moi une carte d'attaque pour me remettre au sport",
    trigger_message_id: "m-vague",
    safety_pregate_risk_band: "none",
  });
  assertEquals(vague.status, "ask_question");
  const safety = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux me faire du mal, fais une carte",
    trigger_message_id: "m-safety",
    safety_pregate_risk_band: "critical",
  });
  assertEquals(safety.status, "blocked_by_safety");
  const ready = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais-moi une carte d'attaque preparer le terrain pour ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-ready",
    safety_pregate_risk_band: "none",
  });
  if (ready.status !== "pending_confirmation") {
    throw new Error("expected_ready");
  }
  let writes = 0;
  const noToken = await executePrepareAttackCard({
    operation_id: String(ready.pending_confirmation?.operation_id),
    user_id: "u1",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: ready.draft!,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_attack_card: async () => {
      writes++;
      return { attack_card_id: "attack" };
    },
    secret: SECRET,
  });
  assertEquals(noToken.status, "blocked");
  assertEquals(writes, 0);
});

Deno.test("prepare_attack_card resolves fuzzy plan targets and rejects vague holes", () => {
  const planSnapshot = {
    items: [
      { id: "sas", title: "Faire le sas de déchargement" },
      { id: "zone", title: "Préparer ta zone de déchargement" },
    ],
  };
  const fuzzy = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Fais-moi une carte d'attaque pour lancer mon sas de dechargement ce soir",
    trigger_message_id: "m-fuzzy",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(fuzzy.status, "ask_question");
  assertEquals(
    (fuzzy.next_question?.known_slots?.target as any)?.plan_item_id,
    "sas",
  );
  assertEquals((fuzzy.next_question as any)?.slot, "technique");

  const vague = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Fais-moi une carte d'attaque pour ce soir, pour demarrer le truc du sommeil",
    trigger_message_id: "m-vague-hole",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(vague.status, "ask_question");
  assertEquals((vague.next_question as any)?.question, undefined);
  assertEquals((vague.next_question as any)?.status, "missing");

  const rankedVague = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Fais-moi une carte d'attaque pour ce soir, pour demarrer le truc du sommeil",
    trigger_message_id: "m-ranked-vague-hole",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [
        {
          id: "zone",
          title: "Préparer ta zone de déchargement",
          description: "Mettre le carnet au bon endroit avant la nuit.",
          item_type: "task",
          status: "active",
        },
        {
          id: "bilan",
          title: "Bilan et ajustement du sas",
          description: "Relire ce qui a marche apres plusieurs soirs.",
          item_type: "task",
          status: "pending",
        },
        {
          id: "sas",
          title: "Faire le sas de déchargement",
          description: "Rituel actif du sommeil avec carnet et transition.",
          item_type: "habit",
          status: "active",
        },
      ],
    },
  });
  assertEquals(rankedVague.status, "ask_question");
  assertEquals((rankedVague.next_question as any)?.status, "missing");
  assertEquals(
    (rankedVague.next_question as any)?.candidates?.[0]?.plan_item_id,
    "sas",
  );

  const correction = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Non pas de preparer la zone, je parle du sas de dechargement",
    trigger_message_id: "m-correction",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(correction.status, "ask_question");
  assertEquals(
    (correction.next_question?.known_slots?.target as any)?.plan_item_id,
    "sas",
  );
  assertEquals((correction.next_question as any)?.slot, "technique");

  const negatedBilan = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Le sas, pas le bilan ni ton truc de zone. Fais l'attaque la-dessus.",
    trigger_message_id: "m-negated-bilan",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [
        { id: "sas", title: "Faire le sas de déchargement" },
        { id: "zone", title: "Préparer ta zone de déchargement" },
        { id: "bilan", title: "Bilan et ajustement du sas" },
      ],
    },
  });
  assertEquals(negatedBilan.status, "ask_question");
  assertEquals(
    (negatedBilan.next_question?.known_slots?.target as any)?.plan_item_id,
    "sas",
  );
  assertEquals((negatedBilan.next_question as any)?.slot, "technique");

  const candidate = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Fais-moi une carte pour le sommeil",
    trigger_message_id: "m-candidate",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [
        { id: "sleep", title: "Préparer le rituel de sommeil" },
        { id: "walk", title: "Marcher dix minutes" },
      ],
    },
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
});

Deno.test("prepare_attack_card preserves concrete user constraints in draft", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je parle du sas de dechargement. C'est le moment ou j'ouvre le carnet. Je veux une carte tres petite: deux minutes, poser le telephone loin, ouvrir le carnet, ecrire une ligne.",
    trigger_message_id: "m-human-constraints",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [
        { id: "sas", title: "Faire le sas de déchargement" },
        { id: "zone", title: "Préparer ta zone de déchargement" },
      ],
    },
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.technique, "preparer_terrain");
  assertEquals(output.draft?.draft.technique_title, "Preparer le terrain");
  const instruction = output.draft?.draft.instruction ?? "";
  assertEquals(
    instruction,
    "En 2 minutes max : poser le téléphone loin, puis ouvrir le carnet, puis écrire une ligne.",
  );
  assertStringIncludes(instruction, "2 minutes max");
  assertStringIncludes(instruction, "poser le téléphone loin");
  assertStringIncludes(instruction, "ouvrir le carnet");
  assertStringIncludes(instruction, "écrire une ligne");
  assertStringIncludes(
    output.draft?.draft.generated_asset ?? "",
    "poser le téléphone loin",
  );
  assertEquals(
    (output.pending_confirmation?.target as any)?.plan_item_id,
    "sas",
  );
});

Deno.test("prepare_attack_card asks for front technique when target is known but technique is not explicit", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais-moi une carte d'attaque pour ma marche",
    trigger_message_id: "m-technique-choice",
    safety_pregate_risk_band: "none",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
  });
  assertEquals(output.status, "ask_question");
  assertEquals(output.next_question?.slot, "technique");
  assertEquals(output.next_question?.known_slots?.target?.plan_item_id, "walk");
  assertEquals(
    output.next_question?.technique_options?.every((option) =>
      Boolean(
        option.title && option.description && option.reason && option.example,
      )
    ),
    true,
  );
  assertEquals(
    output.next_question?.technique_options?.every((option) =>
      [
        "texte_recadrage",
        "mantra_force",
        "ancre_visuelle",
        "visualisation_matinale",
        "preparer_terrain",
        "pre_engagement",
      ].includes(option.technique_key)
    ),
    true,
  );
});

Deno.test("prepare_attack_card recommendation with identified target asks technique instead of losing target", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "oui",
    source: "recommendation_tool",
    trigger_message_id: "m-reco-target-no-technique",
    safety_pregate_risk_band: "none",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "walk",
        title: "marche",
      },
    },
  });
  assertEquals(output.status, "ask_question");
  assertEquals(output.next_question?.slot, "technique");
  assertEquals(output.state_patch.missing_slots, ["technique"]);
  assertEquals(output.next_question?.known_slots?.target?.plan_item_id, "walk");
});

Deno.test("prepare_attack_card invalid recommendation reports actual missing slots", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "recommendation",
    source: "recommendation_tool",
    trigger_message_id: "m-reco-invalid-slots",
    safety_pregate_risk_band: "none",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    operation_input: { blocker: { type: "avoidance" } },
  });
  assertEquals(output.status, "invalid_recommendation_payload");
  assertEquals(output.state_patch.missing_slots.includes("target"), true);
  assertStringIncludes(output.state_patch.summary, "target");
});

Deno.test("prepare_attack_card accepts ordinal technique choice from previous options", () => {
  const first = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "fais-moi une carte d'attaque pour ma marche, je repousse et je negocie",
    trigger_message_id: "m-technique-first",
    safety_pregate_risk_band: "none",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
  });
  assertEquals(first.status, "ask_question");
  assertEquals(first.next_question?.slot, "technique");

  const second = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "la premiere",
    trigger_message_id: "m-technique-second",
    safety_pregate_risk_band: "none",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    operation_input: first.next_question?.known_slots,
  });
  assertEquals(second.status, "pending_confirmation");
  assertEquals(
    second.draft?.draft.technique,
    first.next_question?.technique_options?.[0]?.technique_key,
  );
  assertStringIncludes(
    second.draft?.draft.generated_asset ?? "",
    `negocier avec l'idee de faire "marche"`,
  );
  assertEquals(
    (second.draft?.draft.generated_asset ?? "").includes("negocier marche"),
    false,
  );
});

Deno.test("prepare_attack_card preserves alternative technique signals across target clarification", () => {
  const planSnapshot = {
    items: [
      { id: "sas", title: "Faire le sas de déchargement" },
      { id: "bilan", title: "Bilan et ajustement du sas" },
    ],
  };
  const first = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux une carte d'attaque. Quand je vais craquer, il me faut un signal de secours rapide sans lire un long texte.",
    trigger_message_id: "m-alt-tech-first",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(first.status, "ask_question");
  assertEquals(
    first.next_question?.known_slots?.technique_options?.[0]?.technique_key,
    "pre_engagement",
  );

  const second = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Le sas de dechargement, pas le bilan.",
    trigger_message_id: "m-alt-tech-second",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: first.next_question?.known_slots,
  });
  assertEquals(second.status, "ask_question");
  assertEquals(second.next_question?.slot, "activation_keyword");
  assertEquals(second.next_question?.known_slots?.technique, "pre_engagement");
  assertEquals(
    second.next_question?.known_slots?.technique_options?.[0]?.technique_key,
    "pre_engagement",
  );

  const third = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je sais pas le nom. Choisis ce qui colle a un signal de secours quand je sens que je vais craquer.",
    trigger_message_id: "m-alt-tech-third",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: second.next_question?.known_slots,
  });
  assertEquals(third.status, "ask_question");
  assertEquals(third.next_question?.slot, "activation_keyword");
  assertEquals(third.next_question?.known_slots?.technique, "pre_engagement");
  assertEquals(third.draft, undefined);

  const fourth = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "PAUSE",
    trigger_message_id: "m-alt-tech-fourth",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: third.next_question?.known_slots,
  });
  assertEquals(fourth.status, "pending_confirmation");
  assertEquals(fourth.draft?.draft.technique, "pre_engagement");
  assertEquals(fourth.draft?.draft.activation_keyword, "PAUSE");
  assertStringIncludes(fourth.draft?.draft.generated_asset ?? "", "PAUSE");
  assertEquals(
    (fourth.draft?.draft.generated_asset ?? "").includes("BASCULE"),
    false,
  );

  const occupied = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Je veux PAUSE comme mot.",
    trigger_message_id: "m-alt-tech-occupied",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
      technique: "pre_engagement",
      occupied_activation_keywords: [{
        activation_keyword: "PAUSE",
        activation_keyword_normalized: "pause",
      }],
    },
  });
  assertEquals(occupied.status, "ask_question");
  assertEquals(occupied.next_question?.slot, "activation_keyword");
  assertEquals(
    occupied.next_question?.known_slots?.rejected_activation_keyword,
    "PAUSE",
  );
  assertEquals(
    occupied.next_question?.activation_keyword_options?.includes("PAUSE"),
    false,
  );
  assertEquals(
    occupied.next_question?.activation_keyword_options?.some((keyword) =>
      ["SAS", "VIDE", "NUIT"].includes(keyword)
    ),
    true,
  );

  const visual = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je ne connais pas les techniques. Choisis celle qui marche avec un rappel visuel, un repere que je vois avant de zapper.",
    trigger_message_id: "m-alt-tech-visual",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: second.next_question?.known_slots,
  });
  assertEquals(visual.status, "pending_confirmation");
  assertEquals(visual.draft?.draft.technique, "ancre_visuelle");
});

Deno.test("prepare_attack_card checks technique fit before accepting mot de bascule", () => {
  const planSnapshot = {
    items: [{ id: "hyper", title: "Repérer les pièges de l'hypervigilance" }],
  };

  const vagueKeyword = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux une carte d'attaque pour reperer les pieges de l'hypervigilance. Quand je pars en alerte et que je scanne tout, il me faut un mot de secours tres court.",
    trigger_message_id: "m-fit-vague-keyword",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(vagueKeyword.status, "ask_question");
  assertEquals(vagueKeyword.next_question?.slot, "technique");
  assertEquals(
    vagueKeyword.next_question?.technique_options?.[0]?.technique_key,
    "ancre_visuelle",
  );
  assertEquals(
    vagueKeyword.next_question?.technique_options?.some((option) =>
      option.technique_key === "pre_engagement"
    ),
    false,
  );

  const explicitMismatch = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux le mot de bascule pour reperer les pieges de l'hypervigilance quand je pars en alerte et je scanne tout.",
    trigger_message_id: "m-fit-explicit-mismatch",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(explicitMismatch.status, "ask_question");
  assertEquals(explicitMismatch.next_question?.slot, "technique");
  assertStringIncludes(
    explicitMismatch.next_question?.known_slots?.technique_fit_warning ?? "",
    "Mot de bascule",
  );
  assertEquals(
    explicitMismatch.next_question?.known_slots?.technique,
    undefined,
  );

  const ruptureKeyword = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux une carte d'attaque pour reperer les pieges de l'hypervigilance. Quand je vais craquer et abandonner, il me faut un mot de secours tres court.",
    trigger_message_id: "m-fit-rupture-keyword",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(ruptureKeyword.status, "ask_question");
  assertEquals(ruptureKeyword.next_question?.slot, "activation_keyword");
  assertEquals(
    ruptureKeyword.next_question?.known_slots?.technique,
    "pre_engagement",
  );
});

Deno.test("prepare_attack_card respects negated technique and keeps content corrections", () => {
  const planSnapshot = {
    items: [{ id: "sas", title: "Faire le sas de déchargement" }],
  };
  const first = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "fais-moi une carte d'attaque pour Faire le sas de dechargement",
    trigger_message_id: "m-negated-tech-first",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
  });
  assertEquals(first.status, "ask_question");

  const second = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Pas preparer le terrain, le truc contre mes excuses et ma negociation.",
    trigger_message_id: "m-negated-tech-second",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: first.next_question?.known_slots,
  });
  assertEquals(second.status, "pending_confirmation");
  assertEquals(second.draft?.draft.technique, "texte_recadrage");

  const secondWithoutOptions = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Pas preparer le terrain. Je veux le truc qui coupe mes excuses quand je commence a negocier.",
    trigger_message_id: "m-negated-tech-no-options",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
    },
  });
  assertEquals(secondWithoutOptions.status, "pending_confirmation");
  assertEquals(secondWithoutOptions.draft?.draft.technique, "texte_recadrage");

  const correctedContent = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Ajoute que le premier geste c'est ouvrir le carnet et noter une ligne.",
    trigger_message_id: "m-content-correction",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
      technique: "texte_recadrage",
    },
  });
  assertEquals(correctedContent.status, "pending_confirmation");
  assertEquals(
    (correctedContent.pending_confirmation?.target as any)?.plan_item_id,
    "sas",
  );
  assertStringIncludes(
    correctedContent.draft?.draft.generated_asset ?? "",
    "ouvrir le carnet",
  );
  assertStringIncludes(
    correctedContent.draft?.draft.generated_asset ?? "",
    "noter une ligne",
  );
  assertEquals(
    (correctedContent.draft?.draft.generated_asset ?? "").includes(
      "puis ouvrir le carnet",
    ),
    false,
  );

  const duplicateRiskCorrection = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Non attends, ajoute le premier geste exact: ouvrir le carnet puis noter une ligne. Sans ca je ne l'utiliserai pas.",
    trigger_message_id: "m-duplicate-risk-correction",
    safety_pregate_risk_band: "none",
    plan_snapshot: planSnapshot,
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
      technique: "texte_recadrage",
    },
  });
  assertEquals(duplicateRiskCorrection.status, "pending_confirmation");
  assertStringIncludes(
    duplicateRiskCorrection.draft?.draft.generated_asset ?? "",
    "ouvrir le carnet, puis noter une ligne",
  );
  assertEquals(
    (duplicateRiskCorrection.draft?.draft.generated_asset ?? "").includes(
      "puis ouvrir le carnet",
    ),
    false,
  );
});

Deno.test("prepare_attack_card regenerated draft includes multiple new correction constraints", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Corrige la carte: je veux que ce soit sans telephone et avant 9h, avec le premier geste ouvrir le carnet.",
    trigger_message_id: "m-two-new-constraints",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [{ id: "sas", title: "Faire le sas de déchargement" }],
    },
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
      technique: "preparer_terrain",
    },
  });
  assertEquals(output.status, "pending_confirmation");
  const draftText = [
    output.draft?.draft.instruction ?? "",
    output.draft?.draft.generated_asset ?? "",
    output.draft?.confirmation_message ?? "",
  ].join("\n");
  assertStringIncludes(draftText, "sans téléphone");
  assertStringIncludes(draftText, "avant 9h");
  assertStringIncludes(draftText, "ouvrir le carnet");
});

Deno.test("prepare_attack_card correction keeps write-one-line and decide-after constraints", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Corrige avant de créer: je veux un texte magique court contre le marchandage, avec ouvrir le carnet, écrire une seule ligne, puis décider seulement après si je continue.",
    trigger_message_id: "m-decide-after-correction",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [{ id: "sas", title: "Faire le sas de déchargement" }],
    },
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
      technique: "texte_recadrage",
    },
  });
  assertEquals(output.status, "pending_confirmation");
  const draftText = [
    output.draft?.draft.instruction ?? "",
    output.draft?.draft.generated_asset ?? "",
    output.draft?.confirmation_message ?? "",
  ].join("\n");
  assertStringIncludes(draftText, "ouvrir le carnet");
  assertStringIncludes(draftText, "écrire une seule ligne");
  assertStringIncludes(draftText, "décider après si je continue");
  assertEquals(draftText.includes("avant de créer"), false);
  assertEquals(draftText.includes("Contraintes: après si je continue"), false);
});

Deno.test("prepare_attack_card correction keeps write-one-phrase step", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Avant de créer, change le draft: je veux que ça dise ouvrir le carnet, écrire seulement une phrase, puis décider après si je continue.",
    trigger_message_id: "m-write-phrase-correction",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [{ id: "sas", title: "Faire le sas de déchargement" }],
    },
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
      technique: "preparer_terrain",
    },
  });
  assertEquals(output.status, "pending_confirmation");
  const draftText = [
    output.draft?.draft.instruction ?? "",
    output.draft?.draft.generated_asset ?? "",
    output.draft?.confirmation_message ?? "",
  ].join("\n");
  assertStringIncludes(draftText, "ouvrir le carnet");
  assertStringIncludes(draftText, "écrire une phrase");
  assertStringIncludes(draftText, "décider après si je continue");
});

Deno.test("prepare_attack_card correction treats choose-after as decide-after", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Avant création, ajuste le contenu: ouvrir le carnet, écrire seulement une phrase, puis seulement après choisir si je continue.",
    trigger_message_id: "m-choose-after-correction",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [{ id: "sas", title: "Faire le sas de déchargement" }],
    },
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
      technique: "preparer_terrain",
    },
  });
  assertEquals(output.status, "pending_confirmation");
  const draftText = [
    output.draft?.draft.instruction ?? "",
    output.draft?.draft.generated_asset ?? "",
    output.draft?.confirmation_message ?? "",
  ].join("\n");
  assertStringIncludes(draftText, "ouvrir le carnet");
  assertStringIncludes(draftText, "écrire une phrase");
  assertStringIncludes(draftText, "décider après si je continue");
  assertEquals(draftText.includes("Contraintes: après choisir"), false);
});

Deno.test("prepare_attack_card acceptance keeps write-first-phrase step", () => {
  const output = runPrepareAttackCardIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui, prépare cette carte d'attaque pour le sas. Je choisis écrire la première phrase comme démarrage.",
    trigger_message_id: "m-write-first-phrase-acceptance",
    safety_pregate_risk_band: "none",
    plan_snapshot: {
      items: [{ id: "sas", title: "Faire le sas de déchargement" }],
    },
    operation_input: {
      target: {
        kind: "plan_item",
        plan_item_id: "sas",
        title: "Faire le sas de déchargement",
      },
      technique: "preparer_terrain",
    },
  });
  assertEquals(output.status, "pending_confirmation");
  const draftText = [
    output.draft?.draft.instruction ?? "",
    output.draft?.draft.generated_asset ?? "",
    output.draft?.confirmation_message ?? "",
  ].join("\n");
  assertStringIncludes(draftText, "écrire la première phrase");
});

Deno.test("S5 route replay covers the three implemented tool skill starts", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  );
  const g8 = fixtures.find((fixture) => fixture.fixture_id === "G8");
  if (!g8) throw new Error("missing_g8");
  const synthetic = [
    g8,
    {
      fixture_id: "S5-recurring",
      description: "recurring reminder tool skill starts",
      input: {
        user_message: "rappelle-moi tous les jours de marcher",
        recent_messages: [],
        memory_payload_fixture: {},
      },
      expected: {
        safety_pregate_risk_band: "none" as const,
        response_owner: "tool_skill" as const,
        selected_handler: "create_recurring_reminder",
        operation_type_started: "create_recurring_reminder",
      },
    },
    {
      fixture_id: "S5-potion",
      description: "state potion tool skill starts",
      input: {
        user_message: "active une potion d'apaisement",
        recent_messages: [],
        memory_payload_fixture: {},
      },
      expected: {
        safety_pregate_risk_band: "none" as const,
        response_owner: "tool_skill" as const,
        selected_handler: "select_state_potion",
        operation_type_started: "select_state_potion",
      },
    },
  ];
  const results = await runReplayFixtures(synthetic, { mode: "s2" });
  assertEquals(results.every((result) => result.passed), true);
});
