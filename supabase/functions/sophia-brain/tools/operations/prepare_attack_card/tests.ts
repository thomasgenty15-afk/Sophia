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
import type { AttackCardDraftGenerator } from "./ai_intake.ts";
import {
  normalizeAttackCardDraftForTest,
  runPrepareAttackCardAiIntake,
} from "./ai_intake.ts";
import { executePrepareAttackCard } from "./executor.ts";
import {
  detectExplicitlyNamedTechniqueForTest,
  enforceExplicitTechniqueRequestForTest,
  refineAttackCardTechniqueFitForTest,
} from "./slot_filler.ts";
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

// ===========================================================================
// CHANTIER C8 (2026-05-28) — Internals tool skill.
// 1) Préserver une technique nommée explicitement (A2-codex-r7 T5/T7).
// 2) Échec de génération = erreur technique propre + retry (A3-r8 T11).
// ===========================================================================

Deno.test("C8: detectExplicitlyNamedTechnique maps product titles to keys (A2-r7 T5)", () => {
  assertEquals(
    detectExplicitlyNamedTechniqueForTest(
      "Technique: ancre visuelle, avec le post-it 'payé fermé'",
    ),
    "ancre_visuelle",
  );
  assertEquals(
    detectExplicitlyNamedTechniqueForTest("je veux un mot de bascule: PAUSE"),
    "pre_engagement",
  );
  assertEquals(
    detectExplicitlyNamedTechniqueForTest("utilise Le texte magique stp"),
    "texte_recadrage",
  );
});

Deno.test("C8 anti-FP: no explicitly named technique returns null", () => {
  assertEquals(
    detectExplicitlyNamedTechniqueForTest(
      "crée-moi une carte d'attaque pour boucler la note de frais sans me disperser. Choisis la technique toi-même.",
    ),
    null,
  );
});

Deno.test("C8: enforceExplicitTechniqueRequest locks user-named 'ancre visuelle' over LLM pre_engagement (A2-r7 T5/T7)", () => {
  // Le slot filler (LLM) avait choisi pre_engagement à cause du post-it.
  const llmOutput = {
    current_step: "draft_generation" as const,
    missing_slots: [] as string[],
    confidence: "high" as const,
    generated_user_message: null,
    state_patch: {
      technique: {
        status: "identified" as const,
        value: "pre_engagement" as const,
        explicitly_requested: false,
        fit_warning: null,
        options: [],
        confidence: "high" as const,
        evidence: ["post-it 'payé fermé' interprété comme mot de bascule"],
      },
      missing_slots: [],
    },
  };
  const enforced = enforceExplicitTechniqueRequestForTest(llmOutput as any, {
    message:
      "crée-moi une carte d'attaque pour payer le parking. Technique: ancre visuelle, avec le post-it 'payé fermé'",
  });
  assertEquals(enforced.state_patch.technique?.value, "ancre_visuelle");
  assertEquals(enforced.state_patch.technique?.explicitly_requested, true);
});

Deno.test("C8: a generation failure retries once before falling back (A3-r8 T11)", async () => {
  let calls = 0;
  const flaky: AttackCardDraftGenerator = async (inp) => {
    calls += 1;
    if (calls === 1) throw new Error("transient_generation_failure");
    return structuredAttackCardDraftGenerator(inp);
  };
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "crée une carte d'attaque, choisis la technique toi-même",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-c8-retry",
    safety_pregate_risk_band: "none",
    slot_filler: structuredAttackCardSlotFiller(readyAttackCardStatePatch()),
    draft_generator: flaky,
  });
  assertEquals(calls, 2, "le générateur doit être retenté une fois");
  assertEquals(output.status, "pending_confirmation");
});

Deno.test("C8: persistent failure yields a clean technical error + retry invitation, not a vague refusal (A3-r8 T11)", async () => {
  const alwaysFails: AttackCardDraftGenerator = async () => {
    throw new Error("hard_generation_failure");
  };
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "crée une carte d'attaque, choisis la technique toi-même",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-c8-fallback",
    safety_pregate_risk_band: "none",
    slot_filler: structuredAttackCardSlotFiller(readyAttackCardStatePatch()),
    draft_generator: alwaysFails,
  });
  assertEquals(output.status, "fallback_dashboard");
  assertEquals(output.readiness.reason, "ai_draft_generator_error");
  // Erreur technique propre + invitation à relancer.
  assertStringIncludes(output.ack ?? "", "raté technique");
  // Plus de refus vague "deviner à ta place".
  assertEquals((output.ack ?? "").includes("deviner à ta place"), false);
});

// ===========================================================================
// CHANTIER D0 (2026-05-28) — Régression carte one-shot "ancre visuelle".
// Le verrou de technique C8 pouvait désynchroniser le draft LLM (confirmation
// construite pour une autre technique, ou title absent) et faire échouer TOUTE
// la carte en fallback_dashboard. normalizeDraft répare désormais ces champs
// secondaires au lieu de jeter. Voir A2-codex-r8 T5/T6, A3-r9 T13.
// ===========================================================================

const ancreVisuelleLockedState = () =>
  ({
    skill_id: "prepare_attack_card",
    current_step: "draft_generation",
    target: {
      status: "identified",
      kind: "personal_action",
      plan_item_id: null,
      title: "payer le parking",
      confidence: "high",
      evidence: ["payer le parking"],
    },
    technique: {
      status: "identified",
      value: "ancre_visuelle",
      explicitly_requested: true,
      fit_warning: null,
      options: [],
      confidence: "high",
      evidence: ["technique nommée: ancre visuelle"],
    },
    activation_keyword: {
      status: "not_applicable",
      value: null,
      options: [],
      rejected_value: null,
      confidence: "low",
      evidence: [],
    },
    blocker: { type: "avoidance", confidence: 0.8, evidence: [] },
    constraints: [],
    missing_slots: [],
    confidence: "high",
    generated_user_message: null,
  }) as any;

Deno.test("D0: a desynced LLM draft (confirmation ne cite pas l'asset, technique dérivée) ne fait plus échouer la carte (A2-r8 T5)", () => {
  const raw = {
    operation_type: "prepare_attack_card",
    output_schema: "attack_card_draft_v1",
    draft: {
      // Le LLM a dérivé vers pre_engagement malgré le verrou: on doit reprendre.
      technique: "pre_engagement",
      title: "Carte d'attaque - payer le parking",
      target_label: "payer le parking",
      instruction: "Regarde le post-it puis paie en une fois.",
      generated_asset: "Post-it 'paye, je ferme' collé sur l'écran.",
      activation_keyword: "FERME",
      supporting_points: [],
      mode_emploi: "",
      why_it_helps: "",
    },
    // Confirmation construite SANS citer generated_asset → cassait tout avant D0.
    confirmation_message: "Je crée cette carte ?",
  };
  const normalized = normalizeAttackCardDraftForTest(
    raw,
    ancreVisuelleLockedState(),
  );
  // Technique verrouillée préservée + activation_keyword neutralisé.
  assertEquals(normalized.draft.technique, "ancre_visuelle");
  assertEquals(normalized.draft.activation_keyword, null);
  // Confirmation reconstruite déterministe et fidèle (cite l'asset réel).
  assertStringIncludes(
    normalized.confirmation_message,
    "Post-it 'paye, je ferme'",
  );
});

Deno.test("D0: un title manquant est défaillé déterministe au lieu de jeter", () => {
  const raw = {
    draft: {
      technique: "ancre_visuelle",
      title: "",
      generated_asset: "Post-it visuel sur l'écran.",
      instruction: "",
      mode_emploi: "",
      why_it_helps: "",
    },
    confirmation_message: "",
  };
  const normalized = normalizeAttackCardDraftForTest(
    raw,
    ancreVisuelleLockedState(),
  );
  assertStringIncludes(normalized.draft.title, "payer le parking");
  // instruction défaillée sur le mode d'emploi de la technique (non vide).
  assertEquals(normalized.draft.instruction.length > 0, true);
  assertStringIncludes(normalized.confirmation_message, "Post-it visuel");
});

Deno.test("D0 anti-régression: un generated_asset manquant reste une vraie erreur technique", () => {
  const raw = {
    draft: {
      technique: "ancre_visuelle",
      title: "Carte d'attaque",
      generated_asset: "",
      instruction: "x",
    },
    confirmation_message: "Je crée cette carte ?",
  };
  let threw = false;
  try {
    normalizeAttackCardDraftForTest(raw, ancreVisuelleLockedState());
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("S5 route replay covers the three implemented tool skill starts", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  );
  const results = await runReplayFixtures(fixtures);
  assertEquals(results.every((result) => result.passed), true);
  assertEquals(results.length >= 3, true);
});
