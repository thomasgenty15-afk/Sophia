import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createEffectLedger } from "../../../router/effect_ledger.ts";
import { recordToolSkillEffectsInLedger } from "../../../router/effect_ledger_adapter.ts";
import {
  loadReplayFixtures,
  runReplayFixtures,
} from "../../../test_harness/conversation_route_replay/runner.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";
import type { AttackCardDraftGenerator } from "./ai_intake.ts";
import {
  normalizeAttackCardDraft,
  runPrepareAttackCardAiIntake,
} from "./ai_intake.ts";
import { decidePrepareAttackCardNextStep } from "./contract.ts";
import {
  detectExplicitlyNamedTechnique,
  enforceExplicitTechniqueRequest,
  normalizeAttackCardSlotFillerOutput,
  refineAttackCardTechniqueFit,
} from "./slot_filler.ts";
import {
  readyAttackCardStatePatch,
  structuredAttackCardDraftGenerator,
  structuredAttackCardSlotFiller,
} from "./test_helpers.ts";
import {
  applyAttackCardSingleTechniquePreference,
  loadRecentActiveAttackCardForUser,
  userExplicitlyAsksForNewAttackCard,
} from "./run_support.ts";
import {
  renderAttackCardDraftOnlyReply,
  renderAttackCardFailedReply,
  renderAttackCardPendingConfirmationReply,
  renderAttackCardPlatformHandoff,
} from "./renderer.ts";
import {
  applyPrepareAttackCardInitialDraftDecision,
  maybeRunPrepareAttackCardOperation,
} from "./router.ts";

const sampleAttackCardDraft = () => ({
  operation_type: "prepare_attack_card" as const,
  output_schema: "attack_card_draft_v1" as const,
  draft: {
    title: "Carte d'attaque - marche",
    target_label: "marche",
    technique: "texte_recadrage" as const,
    technique_title: "Le texte magique",
    instruction: "Reviens au premier geste.",
    generated_asset: "Quand je négocie, je reviens au premier geste minuscule.",
    activation_keyword: null,
    supporting_points: [],
    mode_emploi: "Lis-la au moment où la résistance monte.",
    why_it_helps: "Elle coupe le débat intérieur.",
  },
  confirmation_message:
    "Je ne crée pas la carte depuis le chat. Voici la version à reprendre dans la section Cartes / Attaque de la plateforme.",
  confirmation_actions: ["yes", "no"] as ["yes", "no"],
});

function makeFakeSupabaseAttackCardsTable(rows: unknown[]) {
  return {
    from(table: string) {
      assertEquals(table, "user_attack_cards");
      const builder: any = {
        select(_cols: string) {
          return this;
        },
        eq(_col: string, _val: unknown) {
          return this;
        },
        order(_col: string, _opts?: any) {
          return this;
        },
        limit(_n: number) {
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  } as any;
}

function makeFakeSupabaseForAttackRouter() {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        order() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as any;
}

function sampleAttackCardHandoffState() {
  return {
    skill_id: "prepare_attack_card",
    mode: "platform_handoff",
    status: "handoff_delivered",
    draft: {
      operation_type: "prepare_attack_card",
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      target_summary: "marche",
      blocker_summary: "négociation intérieure",
      recommendation: {
        technique_label: "Le texte magique",
        why_this_technique: "Elle coupe le débat intérieur.",
        card_draft_summary:
          "Carte d'attaque - marche\nQuand je négocie, je reviens au premier geste minuscule.",
        preserve: ["premier geste minuscule"],
        avoid: ["plusieurs propositions"],
        platform_destination: "Plateforme > Cartes / Attaque",
        platform_steps: [
          "Ouvre Cartes / Attaque.",
          "Choisis la cible.",
          "Copie le brouillon.",
        ],
      },
      missing_decisions: [],
    },
    source_draft: sampleAttackCardDraft(),
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    turn_count: 1,
    max_turns: 8,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    no_chat_mutation: true,
  };
}

Deno.test("prepare_attack_card contract normalizes user_intent=draft_only + no_create", () => {
  const output = normalizeAttackCardSlotFillerOutput({
    current_step: "draft_generation",
    user_intent: "draft_only",
    constraints: [{
      kind: "no_create",
      evidence: ["sans le créer"],
    }, {
      kind: "draft_only",
      evidence: ["brouillon complet"],
    }],
    state_patch: readyAttackCardStatePatch(),
    missing_slots: [],
    confidence: "high",
    generated_user_message: null,
    evidence: ["structured intent"],
  });

  assertEquals(output.user_intent, "draft_only");
  assertEquals(
    (output.constraints ?? []).map((constraint) => constraint.kind),
    ["no_create", "draft_only"],
  );
});

Deno.test("prepare_attack_card initial intake ignores draft_review_decision without previous draft", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Prépare-moi une carte d'attaque pour ouvrir mon carnet, sans la créer.",
    source: "direct_user_request",
    trigger_message_id: "m-initial-draft-review-noise",
    safety_pregate_risk_band: "none",
    slot_filler: async () => ({
      current_step: "draft_generation",
      user_intent: "draft_only",
      constraints: [{ kind: "no_create", evidence: ["sans la créer"] }],
      state_patch: {
        ...readyAttackCardStatePatch({ title: "ouvrir mon carnet" }),
        target: {
          status: "identified",
          kind: "personal_action",
          plan_item_id: null,
          title: "ouvrir mon carnet",
          confidence: "high",
          evidence: ["free action from user"],
        },
      } as any,
      draft_review_decision: {
        decision: "unclear",
        confidence: "high",
        evidence: ["slot filler defaulted draft validation"],
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["structured test filler"],
    }),
    draft_generator: structuredAttackCardDraftGenerator,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.target_label, "ouvrir mon carnet");
  assertEquals(output.state_patch.draft_review_decision, undefined);
});

Deno.test("prepare_attack_card initial intake accepts dispatcher aliases for target and technique", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Prépare une carte d'attaque en Ancre visuelle pour poser ma tenue de sport.",
    source: "direct_user_request",
    trigger_message_id: "m-dispatcher-aliases",
    safety_pregate_risk_band: "none",
    operation_input: {
      action_title: "Poser ma tenue de sport sur la chaise",
      technique_hint: "Ancre visuelle",
      obstacle_hint: "je repousse en disant que je verrai demain",
    },
    slot_filler: async () => ({
      current_step: "draft_generation",
      user_intent: "draft_only",
      constraints: [{ kind: "no_create", evidence: ["ne la crée pas"] }],
      state_patch: {
        target: {
          status: "missing",
          confidence: "low",
          evidence: [],
        },
        technique: {
          status: "missing",
          confidence: "low",
          evidence: [],
        },
      } as any,
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["structured test filler"],
    }),
    draft_generator: async (input) => ({
      ...sampleAttackCardDraft(),
      draft: {
        ...sampleAttackCardDraft().draft,
        target_label: input.state.target.status === "identified"
          ? input.state.target.title
          : "",
        technique: "ancre_visuelle",
        technique_title: "Ancre visuelle",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    output.draft?.draft.target_label,
    "Poser ma tenue de sport sur la chaise",
  );
  assertEquals(output.draft?.draft.technique, "ancre_visuelle");
  assertEquals(
    (output.pending_confirmation as any)?.intake_state?.blocker?.evidence,
    ["je repousse en disant que je verrai demain"],
  );
});

Deno.test("prepare_attack_card initial intake recommends technique when target and blocker are enough", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Prépare-moi une carte d'attaque pour envoyer mon dossier administratif avant 16h. Je bloque parce que je veux que ce soit parfait avant d'appuyer sur envoyer. Ne la crée pas, je veux seulement le brouillon.",
    source: "direct_user_request",
    trigger_message_id: "m-recommend-technique",
    safety_pregate_risk_band: "none",
    slot_filler: async () => ({
      current_step: "technique_selection",
      user_intent: "draft_only",
      constraints: [
        { kind: "draft_only", evidence: ["seulement le brouillon"] },
        { kind: "no_create", evidence: ["ne la crée pas"] },
      ],
      state_patch: {
        target: {
          status: "identified",
          kind: "personal_action",
          plan_item_id: null,
          title: "envoyer mon dossier administratif avant 16h",
          confidence: "high",
          evidence: ["envoyer mon dossier administratif avant 16h"],
        },
        blocker: {
          type: "avoidance",
          confidence: 0.9,
          evidence: ["je veux que ce soit parfait avant d'appuyer sur envoyer"],
        },
        technique: {
          status: "missing",
          value: null,
          explicitly_requested: false,
          fit_warning: null,
          options: [],
          confidence: "low",
          evidence: [],
        },
      } as any,
      missing_slots: ["technique"],
      confidence: "high",
      generated_user_message:
        "Je peux la créer, quelle technique préfères-tu ?",
      evidence: ["structured test filler"],
    }),
    draft_generator: async (input) => ({
      ...sampleAttackCardDraft(),
      draft: {
        ...sampleAttackCardDraft().draft,
        target_label: input.state.target.status === "identified"
          ? input.state.target.title
          : "",
        technique: input.state.technique.value ?? "texte_recadrage",
        technique_title: "Le texte magique",
        generated_asset:
          "Ce dossier n'a pas besoin d'être parfait, il a besoin d'être envoyé.",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.technique, "texte_recadrage");
  assertStringIncludes(
    output.confirmation?.message ?? "",
    "Je ne crée pas la carte depuis le chat",
  );
});

Deno.test("prepare_attack_card initial intake binds titled plan target without id as free action", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Je veux en préparer une pour mon action du matin : ouvrir mon carnet avant le café. Le piège, c'est que je regarderai après. Ne la crée pas depuis le chat.",
    source: "direct_user_request",
    trigger_message_id: "m-plan-title-no-id",
    safety_pregate_risk_band: "none",
    plan_snapshot: { items: [] },
    slot_filler: async () => ({
      current_step: "technique_selection",
      user_intent: "draft_only",
      constraints: [{ kind: "no_create", evidence: ["ne la crée pas"] }],
      state_patch: {
        target: {
          status: "identified",
          kind: "plan_item",
          plan_item_id: null,
          title: "ouvrir mon carnet avant le café",
          confidence: "high",
          evidence: ["action du matin"],
        },
        blocker: {
          type: "avoidance",
          confidence: 0.8,
          evidence: ["je regarderai après"],
        },
        technique: {
          status: "missing",
          value: null,
          explicitly_requested: false,
          fit_warning: null,
          options: [],
          confidence: "low",
          evidence: [],
        },
      } as any,
      missing_slots: ["technique"],
      confidence: "high",
      generated_user_message: null,
      evidence: ["structured test filler"],
    }),
    draft_generator: structuredAttackCardDraftGenerator,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    (output.pending_confirmation as any)?.intake_state?.target?.kind,
    "personal_action",
  );
  assertEquals(output.draft?.draft.technique, "texte_recadrage");
});

Deno.test("prepare_attack_card contract blocks draft-only create effects", () => {
  const pendingRaw = {
    operation_id: "op-draft-only",
    operation_type: "prepare_attack_card",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: sampleAttackCardDraft(),
  };
  const decision = decidePrepareAttackCardNextStep({
    pendingRaw,
    user_intent: "draft_only",
    constraints: [{
      kind: "no_create",
      evidence: ["sans créer"],
    }],
    draft_review_decision: {
      decision: "unclear",
      evidence: ["montre le brouillon"],
    },
  });

  assertEquals(decision.status, "draft_ready");
  assertEquals(decision.allowed_effects.length, 0);
  assertEquals(
    decision.blocked_effects[0]?.reason_code,
    "no_create_constraint",
  );
});

Deno.test("prepare_attack_card initial draft-only stores review draft, not executable pending", () => {
  const runtime = applyPrepareAttackCardInitialDraftDecision({
    output: {
      status: "pending_confirmation",
      pending_confirmation: {
        operation_id: "op-initial-draft-only",
        operation_type: "prepare_attack_card",
      },
      draft: sampleAttackCardDraft(),
      user_intent: "draft_only",
      constraints: [{ kind: "no_create", evidence: ["sans créer"] }],
      state_patch: { draft_review_decision: null },
    } as any,
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    tempMemory: {},
  });

  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.toolSkillRun.status, "handoff_delivered");
  assertEquals(
    runtime?.nextTempMemory.__pending_tool_skill_confirmation,
    undefined,
  );
  assertEquals(
    runtime?.nextTempMemory.__pending_attack_card_draft_review,
    undefined,
  );
  assertEquals(
    runtime?.nextTempMemory.__active_attack_card_handoff?.no_chat_mutation,
    true,
  );
  assertStringIncludes(runtime?.content ?? "", "Cible/action comprise");
  assertStringIncludes(runtime?.content ?? "", "Destination plateforme");
  assertStringIncludes(
    runtime?.content ?? "",
    "Je ne crée pas la carte depuis le chat",
  );
  assertEquals(
    (runtime?.content ?? "").includes("Confirme explicitement"),
    false,
  );
});

Deno.test("prepare_attack_card router forwards dispatcher operation_input into intake", async () => {
  let seenOperationInput: Record<string, unknown> | null = null;
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage:
      "Prépare-moi une carte d'attaque pour envoyer mon dossier administratif avant 16h. Ne la crée pas, je veux seulement le brouillon.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        target_hint: "envoyer mon dossier administratif avant 16h",
        operation_input: {
          action_title: "Envoyer le dossier administratif",
          deadline: "16h",
          friction_point: "perfectionnisme avant l'envoi",
        },
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
      reason_code: "tool_skill_intent_start",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-router-dispatcher-input",
    runIntake: async (input) => {
      seenOperationInput = input.operation_input ?? null;
      return {
        status: "pending_confirmation",
        user_intent: "draft_only",
        constraints: [{ kind: "no_create", evidence: ["ne la crée pas"] }],
        phase: "confirmation",
        draft: sampleAttackCardDraft(),
        pending_confirmation: {
          operation_id: "op-router-dispatcher-input",
          operation_type: "prepare_attack_card",
          target: {
            kind: "personal_action",
            title: "Envoyer le dossier administratif",
          },
          intake_state: {
            blocker: {
              type: "friction",
              evidence: ["perfectionnisme avant l'envoi"],
            },
          },
        },
        state_patch: {
          missing_slots: [],
          operation_input: input.operation_input,
        },
      } as any;
    },
  });

  assertEquals(runtime?.toolExecution, "platform_handoff");
  const observedOperationInput = seenOperationInput as
    | Record<string, unknown>
    | null;
  assertEquals(
    observedOperationInput?.action_title,
    "Envoyer le dossier administratif",
  );
  assertEquals(
    observedOperationInput?.friction_point,
    "perfectionnisme avant l'envoi",
  );
  assertEquals(observedOperationInput?.user_message !== undefined, true);
});

Deno.test("prepare_attack_card renderer separates handoff and failed states", () => {
  const draft = sampleAttackCardDraft();
  const draftOnly = renderAttackCardDraftOnlyReply(draft);
  assertStringIncludes(draftOnly, "Je ne crée pas la carte depuis le chat");
  assertEquals(draftOnly.includes("Confirme explicitement"), false);

  const pending = renderAttackCardPendingConfirmationReply(draft);
  assertStringIncludes(
    pending,
    getHandoffTargetForOperation("prepare_attack_card")
      ?.user_facing_destination ?? "Cartes d’attaque",
  );

  const handoff = renderAttackCardPlatformHandoff({
    operation_type: "prepare_attack_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: "marche",
    blocker_summary: "négociation intérieure",
    recommendation: {
      technique_label: "Le texte magique",
      why_this_technique: "Elle coupe le débat intérieur.",
      card_draft_summary: "Quand je négocie, je reviens au premier geste.",
      preserve: ["premier geste"],
      avoid: ["plusieurs techniques"],
      platform_destination: "Plateforme > Cartes / Attaque",
      platform_steps: ["Ouvre Cartes / Attaque"],
    },
    platform_handoff: {
      flow_kind: "free_attack_card",
      surface_label: "Ressources > Attaque",
      destination: "Ressources > Attaque > Cartes d'attaque libres",
      steps: [
        "Ouvre Ressources.",
        "Ouvre Attaque.",
        "Dans Cartes d'attaque libres, clique Ajouter une carte.",
      ],
      technique_key: "texte_recadrage",
      technique_label: "Le texte magique",
      inputs: [
        {
          question:
            "Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?",
          suggested_answer: "marche",
        },
        {
          question:
            "Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?",
          suggested_answer: "négociation intérieure",
        },
      ],
      expected_result: {
        output_title: "Carte d'attaque - marche",
        generated_asset: "Quand je négocie, je reviens au premier geste.",
        supporting_points: ["premier geste"],
        mode_emploi: "Lire puis agir.",
      },
    },
    missing_decisions: [],
  });
  assertStringIncludes(handoff, "Cible/action comprise");
  assertStringIncludes(handoff, "Obstacle ou piège identifié");
  assertStringIncludes(handoff, "Champs à renseigner dans la plateforme");
  assertStringIncludes(handoff, "Question plateforme");
  assertStringIncludes(handoff, "Réponse proposée : marche");
  assertStringIncludes(handoff, "Aperçu du résultat attendu");
  assertStringIncludes(handoff, "Brouillon de carte");
  assertStringIncludes(handoff, "À préserver");
  assertStringIncludes(handoff, "À éviter");
  assertStringIncludes(handoff, "Destination plateforme");
  assertEquals(
    /c'est créé|j'ai créé|j'ai ajouté|c'est fait/i.test(handoff),
    false,
  );

  const failed = renderAttackCardFailedReply();
  assertEquals(failed.includes("C'est fait"), false);
});

Deno.test("prepare_attack_card renderer handles plan action handoff without manual fields", () => {
  const handoff = renderAttackCardPlatformHandoff({
    operation_type: "prepare_attack_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: "ouvrir mon carnet avant le café",
    blocker_summary: "je me dis que je regarderai plus tard",
    recommendation: {
      technique_label: "Meditation de 5 minutes",
      why_this_technique: "Elle prépare le geste avant la friction.",
      card_draft_summary:
        "Me voir ouvrir le carnet avant que la journée démarre.",
      preserve: ["agir avant le café"],
      avoid: ["ajouter une deuxième technique"],
      platform_destination: "Ressources > Attaque > Cartes d'attaque du plan",
      platform_steps: ["Ouvre le bloc Ressources de l'action."],
    },
    platform_handoff: {
      flow_kind: "plan_action_cards",
      surface_label: "Plan > Action > Ressources > Attaque",
      destination: "Ressources > Attaque > Cartes d'attaque du plan",
      steps: [
        'Ouvre ton plan puis l\'action "ouvrir mon carnet avant le café".',
        "Dans le bloc Ressources, clique Générer.",
      ],
      technique_key: "visualisation_matinale",
      technique_label: "Meditation de 5 minutes",
      inputs: [],
      expected_result: {
        output_title: "Ouvrir mon carnet",
        generated_asset:
          "Visualise-toi en train d'ouvrir le carnet avant le café.",
        supporting_points: ["agir avant la négociation"],
        mode_emploi: "Prendre cinq minutes le matin.",
      },
      plan_action_note:
        "Pour une action du plan, la plateforme prépare les cartes depuis le bloc Ressources de l'action.",
    },
    missing_decisions: [],
  });

  assertStringIncludes(handoff, "Plan > Action > Ressources > Attaque");
  assertStringIncludes(handoff, "Aucun champ manuel à remplir");
  assertStringIncludes(handoff, "Générer");
  assertStringIncludes(handoff, "Aperçu du résultat attendu");
  assertStringIncludes(handoff, "Je ne crée pas la carte depuis le chat");
});

Deno.test("prepare_attack_card contract maps approve to non-mutant apply_attempt", () => {
  const pendingRaw = {
    operation_id: "op-approve",
    operation_type: "prepare_attack_card",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: sampleAttackCardDraft(),
  };
  const allowed = decidePrepareAttackCardNextStep({
    pendingRaw,
    user_intent: "create",
    constraints: [],
    draft_review_decision: {
      decision: "approve",
      evidence: ["ok crée-la"],
    },
  });
  assertEquals(allowed.status, "apply_attempt");
  assertEquals(allowed.allowed_effects.length, 0);
  assertEquals(
    allowed.blocked_effects[0]?.reason_code,
    "chat_creation_disabled_platform_handoff",
  );

  const incompatible = decidePrepareAttackCardNextStep({
    pendingRaw: {
      ...pendingRaw,
      target: { kind: "plan_item", title: "marche" },
    },
    user_intent: "create",
    constraints: [],
    draft_review_decision: {
      decision: "approve",
      evidence: ["ok crée-la"],
    },
  });
  assertEquals(incompatible.status, "apply_attempt");
  assertEquals(incompatible.allowed_effects.length, 0);
});

Deno.test("prepare_attack_card contract keeps show/reject/revise/topic_change away from DB effects", () => {
  const pendingRaw = {
    operation_id: "op-review",
    operation_type: "prepare_attack_card",
    target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
    draft: sampleAttackCardDraft(),
  };

  const show = decidePrepareAttackCardNextStep({
    pendingRaw,
    user_intent: "draft_only",
    constraints: [{ kind: "draft_only", evidence: ["montre-moi"] }],
  });
  assertEquals(show.allowed_effects.length, 0);

  const reject = decidePrepareAttackCardNextStep({
    pendingRaw,
    user_intent: "reject",
    constraints: [],
    draft_review_decision: { decision: "reject", evidence: ["finalement non"] },
  });
  assertEquals(reject.status, "cancelled");
  assertEquals(reject.allowed_effects.length, 0);

  const revise = decidePrepareAttackCardNextStep({
    pendingRaw,
    user_intent: "revise",
    constraints: [],
    draft_review_decision: { decision: "revise", evidence: ["corrige"] },
  });
  assertEquals(revise.status, "revised");
  assertEquals(revise.allowed_effects.length, 0);

  const topicChange = decidePrepareAttackCardNextStep({
    pendingRaw,
    user_intent: "topic_change",
    constraints: [],
    draft_review_decision: {
      decision: "topic_change",
      evidence: ["parlons d'autre chose"],
    },
  });
  assertEquals(topicChange.handled, false);
  assertEquals(topicChange.allowed_effects.length, 0);
});

Deno.test("Confirmation contract: pending attack card preview does not create", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "montre-moi d'abord le brouillon",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-attack-preview",
        operation_type: "prepare_attack_card",
        target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
        draft: sampleAttackCardDraft(),
        draft_review_decision: {
          decision: "preview",
          confidence: "high",
          evidence: ["montre-moi d'abord le brouillon"],
        },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-attack-preview",
  });
  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.status, "draft_ready");
  assertEquals(
    (runtime?.toolSkillRun as any)?.confirmation_decision?.decision,
    "explain",
  );
});

Deno.test("Confirmation contract: pending attack card ignores reminder command", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "programme le rappel",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-attack-unrelated",
        operation_type: "prepare_attack_card",
        target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
        draft: sampleAttackCardDraft(),
        draft_review_decision: {
          decision: "topic_change",
          confidence: "high",
          evidence: ["programme le rappel"],
        },
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-attack-unrelated",
  });
  assertEquals(runtime, null);
});

Deno.test("prepare_attack_card apply_attempt does not execute from active handoff", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "ok crée-la",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_attack_card_handoff: sampleAttackCardHandoffState(),
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-apply-attempt",
    runIntake: async () =>
      ({
        status: "draft_review_decision",
        user_intent: "create",
        constraints: [],
        phase: "confirmation",
        state_patch: {
          missing_slots: [],
          draft_review_decision: {
            decision: "approve",
            confidence: "high",
            evidence: ["ok crée-la"],
          },
        },
      }) as any,
  });
  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.status, "apply_attempt");
  assertEquals(
    (runtime?.toolSkillRun as any)?.committed_effects?.length,
    0,
  );
  assertStringIncludes(
    runtime?.content ?? "",
    "Je ne crée pas la carte depuis le chat",
  );
  assertStringIncludes(
    runtime?.content ?? "",
    getHandoffTargetForOperation("prepare_attack_card")
      ?.user_facing_destination ?? "Cartes d’attaque",
  );
});

Deno.test("prepare_attack_card active handoff captures redis-moi as repeat_handoff", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "redis-moi quoi mettre",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_attack_card_handoff: sampleAttackCardHandoffState(),
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-repeat",
    runIntake: async () =>
      ({
        status: "draft_review_decision",
        user_intent: "explain",
        constraints: [],
        phase: "confirmation",
        state_patch: {
          missing_slots: [],
          draft_review_decision: {
            decision: "explain",
            confidence: "high",
            evidence: ["redis-moi"],
          },
        },
      }) as any,
  });
  assertEquals((runtime?.toolSkillRun as any)?.status, "repeat_handoff");
  assertEquals(
    (runtime?.toolSkillRun as any)?.platform_handoff?.reason_code,
    "repeat_platform_handoff",
  );
  const ledger = createEffectLedger("turn_repeat_platform_handoff");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: runtime?.toolExecution ?? "platform_handoff",
    toolSkillRun: runtime?.toolSkillRun,
  });
  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].kind, "platform_handoff");
  assertEquals(ledger.entries[0].status, "delivered");
  assertEquals(
    ledger.entries[0].reason_code,
    "repeat_platform_handoff",
  );
  assertStringIncludes(runtime?.content ?? "", "Brouillon de carte");
});

Deno.test("prepare_attack_card active handoff forces plus simple to revise_handoff", async () => {
  const revisedDraft = {
    ...sampleAttackCardDraft(),
    draft: {
      ...sampleAttackCardDraft().draft,
      generated_asset: "J'envoie le dossier maintenant, imparfait mais envoyé.",
    },
  };
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "rends-la plus simple, une seule proposition",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_attack_card_handoff: sampleAttackCardHandoffState(),
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-force-revise",
    runIntake: async () =>
      ({
        status: "pending_confirmation",
        user_intent: "explain",
        constraints: [],
        phase: "confirmation",
        draft: revisedDraft,
        pending_confirmation: {
          operation_id: "op-force-revised",
          operation_type: "prepare_attack_card",
          target: {
            kind: "plan_item",
            plan_item_id: "admin",
            title: "dossier",
          },
          intake_state: {
            blocker: {
              type: "avoidance",
              evidence: ["perfectionnisme avant envoi"],
            },
          },
        },
        state_patch: {
          missing_slots: [],
          draft_review_decision: {
            decision: "explain",
            confidence: "high",
            evidence: ["misclassified by ai"],
          },
        },
      }) as any,
  });

  assertEquals((runtime?.toolSkillRun as any)?.status, "revise_handoff");
  assertEquals(
    (runtime?.toolSkillRun as any)?.platform_handoff?.reason_code,
    "revised_platform_handoff",
  );
  assertStringIncludes(
    runtime?.content ?? "",
    "J'envoie le dossier maintenant",
  );
});

Deno.test("prepare_attack_card active handoff forces ok cree-la to apply_attempt", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "ok crée-la",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_attack_card_handoff: sampleAttackCardHandoffState(),
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-force-apply",
    runIntake: async () =>
      ({
        status: "ask_question",
        user_intent: "clarify",
        constraints: [],
        phase: "technique_selection",
        next_question: { question: "Quelle technique préfères-tu ?" },
        state_patch: {
          missing_slots: ["technique"],
        },
      }) as any,
  });

  assertEquals((runtime?.toolSkillRun as any)?.status, "apply_attempt");
  assertEquals(runtime?.executedTools, []);
  assertStringIncludes(
    runtime?.content ?? "",
    "Je ne crée pas la carte depuis le chat",
  );
  assertEquals(
    /je vais la cr[eé]er directement/i.test(runtime?.content ?? ""),
    false,
  );
});

Deno.test("prepare_attack_card revise_handoff regenerates recommendation", async () => {
  const revisedDraft = {
    ...sampleAttackCardDraft(),
    draft: {
      ...sampleAttackCardDraft().draft,
      generated_asset: "Je fais seulement le premier pas, sans débattre.",
    },
  };
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "rends-la plus simple",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_attack_card_handoff: sampleAttackCardHandoffState(),
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-revise",
    runIntake: async () =>
      ({
        status: "pending_confirmation",
        user_intent: "revise",
        constraints: [{ kind: "single_proposal", evidence: ["plus simple"] }],
        phase: "confirmation",
        draft: revisedDraft,
        pending_confirmation: {
          operation_id: "op-revised",
          operation_type: "prepare_attack_card",
          target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
          intake_state: {
            blocker: {
              type: "avoidance",
              evidence: ["je négocie au démarrage"],
            },
          },
        },
        state_patch: {
          missing_slots: [],
          draft_review_decision: {
            decision: "revise",
            confidence: "high",
            evidence: ["plus simple"],
          },
        },
      }) as any,
  });
  assertEquals((runtime?.toolSkillRun as any)?.status, "revise_handoff");
  assertEquals(
    (runtime?.toolSkillRun as any)?.platform_handoff?.reason_code,
    "revised_platform_handoff",
  );
  assertEquals(runtime?.executedTools, []);
  assertStringIncludes(
    runtime?.content ?? "",
    "Je fais seulement le premier pas",
  );
});

Deno.test("prepare_attack_card revise_handoff preserves blocker when revision intake is generic", async () => {
  const revisedDraft = {
    ...sampleAttackCardDraft(),
    draft: {
      ...sampleAttackCardDraft().draft,
      generated_asset: "Je fais une seule action maintenant.",
    },
  };
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "rends-la plus simple, une seule proposition",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_attack_card_handoff: sampleAttackCardHandoffState(),
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-revise-preserve-blocker",
    runIntake: async () =>
      ({
        status: "pending_confirmation",
        user_intent: "revise",
        constraints: [{ kind: "single_proposal", evidence: ["plus simple"] }],
        phase: "confirmation",
        draft: revisedDraft,
        pending_confirmation: {
          operation_id: "op-revised-generic-blocker",
          operation_type: "prepare_attack_card",
          target: { kind: "plan_item", plan_item_id: "walk", title: "marche" },
          intake_state: {
            blocker: {
              type: "mixed",
              evidence: [],
            },
          },
        },
        state_patch: {
          missing_slots: [],
          draft_review_decision: {
            decision: "revise",
            confidence: "high",
            evidence: ["plus simple"],
          },
        },
      }) as any,
  });

  assertEquals((runtime?.toolSkillRun as any)?.status, "revise_handoff");
  assertStringIncludes(runtime?.content ?? "", "négociation intérieure");
  assertEquals(
    (runtime?.content ?? "").includes(
      "Piège de démarrage ou d'évitement identifié pendant l'intake.",
    ),
    false,
  );
});

Deno.test("prepare_attack_card active handoff cancellation clears state", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage: "pas de carte finalement",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_attack_card_handoff: sampleAttackCardHandoffState(),
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-cancel-handoff",
    runIntake: async () =>
      ({
        status: "draft_review_decision",
        user_intent: "reject",
        constraints: [],
        phase: "confirmation",
        state_patch: {
          missing_slots: [],
          draft_review_decision: {
            decision: "reject",
            confidence: "high",
            evidence: ["pas de carte"],
          },
        },
      }) as any,
  });
  assertEquals((runtime?.toolSkillRun as any)?.status, "cancelled");
  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(
    (runtime?.toolSkillRun as any)?.platform_handoff?.status,
    "cancelled",
  );
  assertEquals(runtime?.nextTempMemory.__active_attack_card_handoff, undefined);
});

Deno.test("prepare_attack_card active intake continuation can deliver initial handoff", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: makeFakeSupabaseForAttackRouter(),
    userId: "u1",
    userMessage:
      "Je veux en préparer une pour mon action du matin : ouvrir mon carnet avant le café. Le piège, c'est que je me dis que je regarderai après. Ne la crée pas depuis le chat.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_attack_card",
        phase: "intent_clarification",
        missing_slots: ["target"],
        operation_input: {},
        turn_count: 1,
      },
    },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-active-continuation",
    runIntake: async () =>
      ({
        status: "pending_confirmation",
        user_intent: "draft_only",
        constraints: [{ kind: "no_create", evidence: ["ne la crée pas"] }],
        phase: "draft_generation",
        draft: {
          ...sampleAttackCardDraft(),
          draft: {
            ...sampleAttackCardDraft().draft,
            target_label: "ouvrir mon carnet avant le café",
          },
        },
        pending_confirmation: {
          operation_id: "op-active-continuation",
          operation_type: "prepare_attack_card",
          target: {
            kind: "personal_action",
            title: "ouvrir mon carnet avant le café",
          },
          intake_state: {
            blocker: {
              type: "avoidance",
              evidence: ["je regarderai après"],
            },
          },
        },
        state_patch: {
          missing_slots: [],
        },
      }) as any,
  });

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals((runtime?.toolSkillRun as any)?.status, "handoff_delivered");
  assertEquals(
    (runtime?.toolSkillRun as any)?.platform_handoff?.reason_code,
    "attack_card_platform_handoff",
  );
  assertStringIncludes(runtime?.content ?? "", "Cible/action comprise");
  assertStringIncludes(
    runtime?.content ?? "",
    "Champs à renseigner dans la plateforme",
  );
  assertStringIncludes(
    runtime?.content ?? "",
    "Je ne crée pas la carte depuis le chat",
  );
});

Deno.test("prepare_attack_card technique fit prefers ancre visuelle over mot de bascule for perfectionism start blocker", () => {
  const refined = refineAttackCardTechniqueFit({
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
      constraints: [{
        kind: "style",
        value: "version minimale",
        evidence: ["version minimale"],
      }],
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
  const refined = refineAttackCardTechniqueFit({
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

Deno.test("prepare_attack_card AI flow drafts from structured state without creating an executable token", async () => {
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
  assertStringIncludes(output.confirmation?.message ?? "", "Je ne crée pas");
  assertEquals((output.pending_confirmation as any)?.executable, undefined);
});

Deno.test("prepare_attack_card AI flow preserves single_proposal constraint into operation_input", async () => {
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "une seule proposition, pas trois options",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-single-proposal",
    safety_pregate_risk_band: "none",
    slot_filler: async () => ({
      current_step: "draft_generation",
      user_intent: "draft_only",
      constraints: [{
        kind: "single_proposal",
        value: 1,
        evidence: ["une seule proposition"],
      }, {
        kind: "no_extra_options",
        evidence: ["pas trois options"],
      }],
      state_patch: readyAttackCardStatePatch() as any,
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["constraint test"],
    }),
    draft_generator: structuredAttackCardDraftGenerator,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    (output.state_patch.operation_input as any)?.constraints?.map((
      constraint: any,
    ) => constraint.kind),
    ["single_proposal", "no_extra_options"],
  );
});

Deno.test("prepare_attack_card single-technique preference collapses technique choices", () => {
  const guarded = applyAttackCardSingleTechniquePreference({
    needed: true,
    slot: "technique",
    status: "missing",
    reason: "structured_ai_missing_technique",
    technique_options: [
      {
        technique_key: "preparer_terrain",
        title: "Preparer le terrain",
        description: "micro-setup",
        reason: "réduit la friction",
        example: "ouvrir le dossier",
      },
      {
        technique_key: "texte_recadrage",
        title: "Le texte magique",
        description: "phrase courte",
        reason: "coupe la négociation interne",
        example: "je commence par une facture",
        recommended: true,
      },
      {
        technique_key: "ancre_visuelle",
        title: "Ancre visuelle",
        description: "signal physique",
        reason: "déclenche le départ",
        example: "post-it",
      },
    ],
    known_slots: { target: { kind: "personal_action", title: "admin" } },
  }, { preferSingleTechnique: true }) as any;
  assertEquals(guarded.technique_options.length, 1);
  assertEquals(guarded.technique_options[0].technique_key, "texte_recadrage");
  assertEquals(guarded.question.includes("On part là-dessus"), true);
  assertEquals(
    guarded.known_slots.suggested_attack_technique,
    "texte_recadrage",
  );
});

Deno.test("prepare_attack_card detects explicit request for another/new card", () => {
  assertEquals(
    userExplicitlyAsksForNewAttackCard(
      "Cree-moi une nouvelle carte pour la session de travail du soir.",
    ),
    true,
  );
  assertEquals(
    userExplicitlyAsksForNewAttackCard(
      "Fais-moi une autre carte pour le rangement du sas.",
    ),
    true,
  );
  assertEquals(
    userExplicitlyAsksForNewAttackCard(
      "Encore une carte stp, pour la facture cette fois.",
    ),
    true,
  );
});

Deno.test("prepare_attack_card new-card detector stays false on existing-card references", () => {
  assertEquals(
    userExplicitlyAsksForNewAttackCard(
      "Je ne parle pas du rappel, je parle de la carte d'attaque que tu viens de créer. Donne juste l'emplacement.",
    ),
    false,
  );
  assertEquals(
    userExplicitlyAsksForNewAttackCard(
      "Crée-moi une carte d'attaque pour le mail à Lina.",
    ),
    false,
  );
});

Deno.test("prepare_attack_card loads recent active card within the configured window", async () => {
  const recentIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const result = await loadRecentActiveAttackCardForUser({
    supabase: makeFakeSupabaseAttackCardsTable([{
      id: "card-1",
      generated_at: recentIso,
      content: {
        operation_draft: {
          title: "Payer la facture une fois pour toutes",
          technique: "ancre_visuelle",
        },
      },
    }]),
    userId: "u1",
  });
  if (!result) throw new Error("expected a card");
  assertEquals(result.id, "card-1");
  assertEquals(result.title, "Payer la facture une fois pour toutes");
  assertEquals(result.technique, "ancre_visuelle");
  assertEquals(result.ageSeconds >= 100 && result.ageSeconds <= 200, true);
});

Deno.test("prepare_attack_card recent active card loader returns null outside window or on DB issues", async () => {
  const oldIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const tooOld = await loadRecentActiveAttackCardForUser({
    supabase: makeFakeSupabaseAttackCardsTable([{
      id: "card-old",
      generated_at: oldIso,
      content: { operation_draft: { title: "Carte ancienne" } },
    }]),
    userId: "u1",
  });
  assertEquals(tooOld, null);

  const noRows = await loadRecentActiveAttackCardForUser({
    supabase: makeFakeSupabaseAttackCardsTable([]),
    userId: "u1",
  });
  assertEquals(noRows, null);

  const dbError = await loadRecentActiveAttackCardForUser({
    supabase: {
      from(_table: string) {
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
          limit() {
            return Promise.resolve({
              data: null,
              error: { message: "DB down" },
            });
          },
        };
      },
    } as any,
    userId: "u1",
  });
  assertEquals(dbError, null);
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

  assertEquals(output.status, "technical_blocked");
  assertEquals(output.reason_code, "ai_unavailable");
  assertEquals(output.readiness.fallback_to_dashboard, false);
  assertEquals(output.pending_confirmation, undefined);
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
  assertEquals(invalidTarget.status, "technical_blocked");
  assertEquals(invalidTarget.reason_code, "invalid_ai_output");
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

  assertEquals(output.status, "technical_blocked");
  assertEquals(output.reason_code, "invalid_ai_output");
  assertEquals(output.readiness.reason, "ai_slot_question_missing");
});

// ===========================================================================
// CHANTIER C8 (2026-05-28) — Internals tool skill.
// 1) Préserver une technique nommée explicitement (A2-codex-r7 T5/T7).
// 2) Échec de génération = erreur technique propre + retry (A3-r8 T11).
// ===========================================================================

Deno.test("C8: detectExplicitlyNamedTechnique maps product titles to keys (A2-r7 T5)", () => {
  assertEquals(
    detectExplicitlyNamedTechnique(
      "Technique: ancre visuelle, avec le post-it 'payé fermé'",
    ),
    "ancre_visuelle",
  );
  assertEquals(
    detectExplicitlyNamedTechnique("je veux un mot de bascule: PAUSE"),
    "pre_engagement",
  );
  assertEquals(
    detectExplicitlyNamedTechnique("utilise Le texte magique stp"),
    "texte_recadrage",
  );
});

Deno.test("C8 anti-FP: no explicitly named technique returns null", () => {
  assertEquals(
    detectExplicitlyNamedTechnique(
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
  const enforced = enforceExplicitTechniqueRequest(llmOutput as any, {
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
  assertEquals(output.status, "technical_blocked");
  assertEquals(output.reason_code, "draft_generation_failed");
  assertEquals(output.readiness.reason, "ai_draft_generator_error");
  // Erreur technique propre + invitation à relancer.
  assertStringIncludes(output.ack ?? "", "reprendre dans un instant");
  // Plus de refus vague "deviner à ta place".
  assertEquals((output.ack ?? "").includes("deviner à ta place"), false);
});

Deno.test("prepare_attack_card no_create draft generator failure falls back to no-mutation handoff draft", async () => {
  const alwaysFails: AttackCardDraftGenerator = async () => {
    throw new Error("hard_generation_failure");
  };
  const output = await runPrepareAttackCardAiIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Prépare une carte d'attaque pour envoyer mon dossier administratif avant 16h, technique Ancre visuelle, mais ne la crée pas.",
    plan_snapshot: { items: [] },
    trigger_message_id: "m-no-create-fallback",
    safety_pregate_risk_band: "none",
    operation_input: {
      user_intent: "draft_only",
      constraints: [{ kind: "no_create", evidence: ["ne la crée pas"] }],
    },
    slot_filler: structuredAttackCardSlotFiller({
      current_step: "draft_generation" as const,
      target: {
        status: "identified" as const,
        kind: "free_text_action" as const,
        plan_item_id: null,
        title: "envoyer mon dossier administratif avant 16h",
        confidence: "high" as const,
        evidence: ["envoyer mon dossier administratif avant 16h"],
      },
      blocker: {
        status: "identified" as const,
        type: "perfectionism" as const,
        confidence: "medium" as const,
        evidence: ["je veux trop bien faire"],
      },
      technique: {
        status: "identified" as const,
        value: "ancre_visuelle" as const,
        explicitly_requested: true,
        fit_warning: null,
        options: [],
        confidence: "high" as const,
        evidence: ["Ancre visuelle"],
      },
      missing_slots: [],
      confidence: "high" as const,
      generated_user_message: null,
    }),
    draft_generator: alwaysFails,
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.technique, "ancre_visuelle");
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "Je ne cree pas la carte depuis le chat",
  );
  assertEquals(output.committed_effects, undefined);
});

// ===========================================================================
// CHANTIER D0 (2026-05-28) — Régression carte one-shot "ancre visuelle".
// Le verrou de technique C8 pouvait désynchroniser le draft LLM (confirmation
// construite pour une autre technique, ou title absent) et faire échouer TOUTE
// la carte en technical_blocked. normalizeDraft répare désormais ces champs
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
    confirmation_message: "Ancien message incomplet.",
  };
  const normalized = normalizeAttackCardDraft(
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
  const normalized = normalizeAttackCardDraft(
    raw,
    ancreVisuelleLockedState(),
  );
  assertStringIncludes(normalized.draft.title, "payer le parking");
  // instruction défaillée sur le mode d'emploi de la technique (non vide).
  assertEquals(normalized.draft.instruction.length > 0, true);
  assertStringIncludes(normalized.confirmation_message, "Post-it visuel");
});

Deno.test("prepare_attack_card normalized draft confirmation stays no-mutation", () => {
  const normalized = normalizeAttackCardDraft(
    {
      draft: {
        technique: "ancre_visuelle",
        title: "Carte d'attaque",
        generated_asset: "Carnet ouvert sur la table.",
        instruction: "Pose le carnet ce soir.",
      },
      confirmation_message: "Je l'ai préparé dans Cartes / Attaque.",
    },
    ancreVisuelleLockedState(),
  );

  assertStringIncludes(
    normalized.confirmation_message,
    "Je ne crée pas la carte depuis le chat",
  );
  assertEquals(
    normalized.confirmation_message.includes("Je l'ai préparé"),
    false,
  );
});

Deno.test("D0 anti-régression: un generated_asset manquant reste une vraie erreur technique", () => {
  const raw = {
    draft: {
      technique: "ancre_visuelle",
      title: "Carte d'attaque",
      generated_asset: "",
      instruction: "x",
    },
    confirmation_message: "Ancien message incomplet.",
  };
  let threw = false;
  try {
    normalizeAttackCardDraft(raw, ancreVisuelleLockedState());
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
