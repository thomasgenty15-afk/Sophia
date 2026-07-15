import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_PROMPT_VERSION,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";
import { type DispatcherLlmRunner, runDispatcher } from "./dispatcher.v2.ts";

function baseInput(message: string, llm_runner?: DispatcherLlmRunner) {
  return {
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "web" as const,
    plan_snapshot: {
      items: [
        { id: "walk", title: "marche", kind: "habit", dimension: "habits" },
      ],
    },
    safety_context_output: {
      detected: false,
      risk_band: "none" as const,
      reason_codes: [],
      evidence: [],
      allow_side_effects: true,
      layer_contributions: {},
    } as any,
    source_message_id: "m1",
    turn_id: "t1",
    llm_runner,
  };
}

async function dispatch(message: string, raw: Record<string, unknown>) {
  return await runDispatcher(baseInput(message, async () => raw));
}

function assertNoLegacyRouteFields(frame: any) {
  const oldToolIntents = ["tool", "skill", "intents"].join("_");
  const oldOpportunity = ["flow", "opportunity"].join("_");
  const oldFitScore = ["normal", "reply", "fit", "score"].join("_");
  const oldFitEvidence = ["normal", "reply", "fit", "evidence"].join("_");
  assertEquals(oldToolIntents in frame, false);
  assertEquals(oldOpportunity in frame, false);
  assertEquals(oldFitScore in frame, false);
  assertEquals(oldFitEvidence in frame, false);
  assertEquals(frame.skill_signals.entry, undefined);
  assertEquals(frame.skill_signals.lifecycle, undefined);
  assertEquals(frame.skill_signals.exit, undefined);
}

Deno.test("dispatcher prompt is minimal and documents normal reply fallback", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Tu ne rediges pas la reponse finale"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("anciens flows locaux"),
    true,
  );
});

Deno.test("dispatcher prompt keeps action-linked emotion in action coaching", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Si la tension, peur, pression, boule au ventre",
    ),
    true,
  );
  const prompt = JSON.parse(buildDispatcherPrompt({
    user_message:
      "Le plus dur c'est le mail: je suis tendu avant de m'y mettre.",
    recent_messages: [],
    plan_snapshot: { items: [] },
  }));
  assertEquals(
    JSON.stringify(prompt).includes("action_linked_emotional_friction"),
    true,
  );
  assertEquals(
    JSON.stringify(prompt).includes(
      "The emotional friction is anchored to starting a concrete action",
    ),
    true,
  );
});

Deno.test("dispatcher prompt excludes active local runtime state from input", () => {
  const removedOperation = ["prepare", "attack", "card"].join("_");
  const prompt = JSON.parse(buildDispatcherPrompt({
    user_message: "ok",
    recent_messages: [],
    active_topic_state: { topic: "test" },
    flow_state_context: {
      last_local_flow_exit: {
        operation_type: removedOperation,
        target_dispatcher: removedOperation,
      },
    },
    plan_snapshot: { items: [] },
  }));

  assertEquals(prompt.prompt_version, DISPATCHER_V2_PROMPT_VERSION);
  assertEquals("active_skill_state" in prompt, false);
  assertEquals(
    ["active", "tool", "skill", "intake"].join("_") in prompt,
    false,
  );
  assertEquals(
    ["pending", "tool", "skill", "confirmation"].join("_") in prompt,
    false,
  );
});

Deno.test("dispatcher keeps one-shot reminder direct effect only", async () => {
  const frame = await dispatch("Rappelle-moi demain a 9h d'appeler Paul", {
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "demain a 9h appeler Paul" },
    }],
  });

  assertEquals(frame.direct_effects.map((effect) => effect.effect_type), [
    "create_one_shot_reminder",
  ]);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher keeps track progress direct effect only", async () => {
  const frame = await dispatch("J'ai fait ma marche", {
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { plan_item_id: "walk", status_hint: "done" },
    }],
  });

  assertEquals(frame.direct_effects.map((effect) => effect.effect_type), [
    "track_progress_plan_item",
  ]);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher routes product explanation to product_help only", async () => {
  const frame = await dispatch("C'est quoi une carte de defense ?", {
    skill_signals: {
      product_help: {
        detected: true,
        confidence_band: "high",
        reason: "product_help_question",
      },
    },
  });

  assertEquals(frame.skill_signals.product_help?.detected, true);
  assertEquals(frame.direct_effects, []);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher keeps coaching recommendation signal", async () => {
  const frame = await dispatch(
    "Je n'y arrive pas sur cette action, je fais quoi ?",
    {
      skill_signals: {
        coaching_recommendation: {
          detected: true,
          confidence_band: "high",
          reason: "stuck_action_feature_recommendation",
        },
      },
    },
  );

  assertEquals(frame.skill_signals.coaching_recommendation?.detected, true);
  assertEquals(frame.skill_signals.product_help, undefined);
  assertEquals(frame.direct_effects, []);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher keeps plan_too_light drift direction through runtime sanitizer (nina-r4 B03)", async () => {
  const frame = await dispatch("Mon plan est trop mou, corse-le", {
    skill_signals: {
      plan_realignment: {
        detected: true,
        confidence_band: "high",
        reason: "plan_too_light_realignment",
        context: {
          drift_type: "plan_too_light",
          scope: "whole_plan",
          explicit_adjust_request: true,
          product_execution_allowed: false,
          reason: "User says the plan is too easy and asks to raise the level.",
        },
      },
    },
  });

  // Regression: le sanitizer runtime rabattait toute valeur hors liste sur
  // "ambiguous" — la direction UP doit survivre jusqu'au turn frame.
  assertEquals(
    frame.skill_signals.plan_realignment?.context?.drift_type,
    "plan_too_light",
  );
});

Deno.test("dispatcher normalizes coaching recommendation activation context", async () => {
  const frame = await dispatch("J'oublie mon action du soir du plan", {
    skill_signals: {
      coaching_recommendation: {
        detected: true,
        confidence_band: "high",
        reason: "plan_action_coaching_need",
          context: {
            coaching_type: "plan_action",
            confidence: 0.88,
            activation_checks: {
            is_coaching_need: true,
            is_about_plan_action: true,
            is_about_non_plan_action: false,
            is_about_emotional_state: false,
            has_concrete_plan_action: true,
            needs_type_confirmation: false,
          },
          action_context: {
            source: "plan",
            plan_item_id: "walk",
            action_title: "marche",
            action_type: "habit",
          },
          emotional_state_context: null,
          category: "plan_action_coaching",
          failure_mode: "forgetting",
          priority_features: ["attack_card"],
          reason: "User asks for coaching on a concrete plan action.",
        },
      },
    },
  });

  const context = frame.skill_signals.coaching_recommendation?.context;
  assertEquals(context?.coaching_type, "plan_action");
  assertEquals(context?.confidence, 0.88);
  assertEquals(context?.action_context?.plan_item_id, "walk");
  assertEquals(Object.hasOwn(context ?? {}, "activation_checks"), false);
  assertEquals(Object.hasOwn(context ?? {}, "needs_type_confirmation"), false);
  assertEquals(Object.hasOwn(context ?? {}, "emotional_state_context"), false);
  assertEquals(Object.hasOwn(context ?? {}, "category"), false);
  assertEquals(Object.hasOwn(context ?? {}, "failure_mode"), false);
  assertEquals(Object.hasOwn(context ?? {}, "priority_features"), false);
  assertEquals(Object.hasOwn(context?.action_context ?? {}, "action_type"), false);
});

Deno.test("dispatcher preserves plan realignment signal context without execution", async () => {
  const frame = await dispatch(
    "J'ai pris trop de retard sur mon plan, je crois qu'il faut le revoir.",
    {
      skill_signals: {
        plan_realignment: {
          detected: true,
          confidence_band: "high",
          reason: "plan_realignment_explicit_adjust",
          context: {
            drift_type: "late_on_plan",
            scope: "whole_plan",
            explicit_adjust_request: true,
            product_execution_allowed: true,
            reason: "User reports plan-level delay and wants to review it.",
            action_patch: { unsafe: true },
          },
        },
      },
    },
  );

  const context = frame.skill_signals.plan_realignment?.context;
  assertEquals(frame.skill_signals.plan_realignment?.detected, true);
  assertEquals(context?.drift_type, "late_on_plan");
  assertEquals(context?.scope, "whole_plan");
  assertEquals(context?.explicit_adjust_request, true);
  assertEquals(context?.product_execution_allowed, false);
  assertEquals(Object.hasOwn(context ?? {}, "action_patch"), false);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher preserves feature opportunity signal context", async () => {
  const frame = await dispatch(
    "Avant chaque diner j'ai du mal a ne pas fumer",
    {
      skill_signals: {
        feature_opportunity: {
          detected: true,
          confidence_band: "high",
          reason: "initiative_opportunity",
          context: {
            feature: "initiatives",
            opportunity_kind: "recurring_context",
            trigger_context: "avant chaque diner",
            user_problem_summary:
              "Difficulty not smoking before a repeated dinner context.",
            priority_reason: "Repeated context fits initiatives.",
          },
        },
      },
    },
  );

  const context = frame.skill_signals.feature_opportunity?.context;
  assertEquals(context?.feature, "initiatives");
  assertEquals(context?.opportunity_kind, "recurring_context");
  assertEquals(context?.trigger_context, "avant chaque diner");
});

Deno.test("dispatcher keeps initiative product question as product_help", async () => {
  const frame = await dispatch("C'est quoi une initiative ?", {
    skill_signals: {
      product_help: {
        detected: true,
        confidence_band: "high",
        reason: "product_help_question",
      },
    },
  });

  assertEquals(frame.skill_signals.product_help?.detected, true);
  assertEquals(frame.skill_signals.feature_opportunity, undefined);
});

Deno.test("dispatcher normalizes legacy entry coaching signal", async () => {
  const frame = await dispatch(
    "Je ne sais pas si je dois changer l'action ou mettre un rappel",
    {
      skill_signals: {
        entry: {
          coaching_recommendation: {
            detected: true,
            confidence_band: "medium",
            reason: "feature_choice",
          },
        },
      },
    },
  );

  assertEquals(frame.skill_signals.coaching_recommendation?.detected, true);
  assertEquals(
    frame.skill_signals.coaching_recommendation?.confidence_band,
    "medium",
  );
  assertEquals((frame.skill_signals as any).entry, undefined);
});

Deno.test("dispatcher treats personal active-state requests as normal fallback", async () => {
  const frame = await dispatch("J'ai quelles cartes de defense actives ?", {
    skill_signals: {},
    memory_plan: {
      response_intent: "personal_state_question",
      reasoning_complexity: "medium",
      context_need: "targeted",
      memory_mode: "light",
      model_tier_hint: "standard",
      context_budget_tier: "small",
      targets: [{ type: "runtime_snapshot", key: "active_surfaces" }],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.8,
    },
  });

  assertEquals(frame.skill_signals.product_help, undefined);
  assertEquals(frame.direct_effects, []);
  assertEquals(frame.memory_plan.context_need, "targeted");
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher filters hostile legacy LLM output", async () => {
  const frame = await dispatch("Je suis degoute j'ai rien fait", {
    [["normal", "reply", "fit", "score"].join("_")]: 0.1,
    [["normal", "reply", "fit", "evidence"].join("_")]: ["legacy"],
    [["tool", "skill", "intents"].join("_")]: [{
      operation_type: "removed_operation",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      ambiguity: "none",
      user_intent: "create",
    }],
    [["flow", "opportunity"].join("_")]: {
      opportunity_id: "legacy",
      target_kind: "removed_operation",
      target_flow: "removed_operation",
      confidence: "high",
      priority: 99,
      reason: "legacy",
      evidence: ["legacy"],
      seed_context: {},
    },
    skill_signals: {
      entry: {
        removed_entry: { detected: true, confidence_band: "high" },
      },
      lifecycle: {
        removed_lifecycle: { detected: true, confidence_band: "high" },
      },
      exit: {
        product_help: { detected: true, confidence_band: "high" },
      },
    },
    direct_effects: [{
      effect_type: "removed_effect",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
  });

  assertEquals(frame.direct_effects, []);
  assertEquals(frame.skill_signals, {});
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher safety high clears product_help, research and direct effects", async () => {
  const frame = await runDispatcher({
    ...baseInput("Je veux me faire du mal"),
    safety_context_output: {
      detected: true,
      risk_band: "high" as const,
      reason_codes: ["self_harm"],
      evidence: ["Je veux me faire du mal"],
      allow_side_effects: false,
      layer_contributions: {},
    } as any,
    llm_runner: async () => ({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
      skill_signals: {
        product_help: { detected: true, confidence_band: "high" },
      },
      needs_research: { detected: true, value: true, confidence: 0.9 },
    }),
  });

  assertEquals(frame.safety.risk_band, "high");
  assertEquals(frame.direct_effects, []);
  assertEquals(frame.skill_signals, {});
  assertEquals(frame.needs_research?.value, false);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher preserves needs_research without creating a route", async () => {
  const frame = await dispatch("Cherche la derniere version de cette API", {
    needs_research: {
      detected: true,
      value: true,
      query: "derniere version API",
      domain_hint: "software",
      confidence: 0.9,
      reason: "fresh_information_requested",
    },
  });

  assertEquals(frame.needs_research?.value, true);
  assertEquals(frame.direct_effects, []);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher keeps presence_conversation signal with kind", async () => {
  const frame = await dispatch(
    "Ça fait 9 mois que je galère avec ce truc, et je me rends compte que...",
    {
      skill_signals: {
        presence_conversation: {
          detected: true,
          confidence_band: "high",
          reason: "vulnerable_personal_reflection",
          context: {
            kind: "maintain",
            topic_hint: "anxiété de performance",
            reason: "long vulnerable reflection, wants to process",
          },
        },
      },
    },
  );

  assertEquals(frame.skill_signals.presence_conversation?.detected, true);
  assertEquals(
    frame.skill_signals.presence_conversation?.context?.kind,
    "maintain",
  );
  assertEquals(
    frame.skill_signals.presence_conversation?.context?.topic_hint,
    "anxiété de performance",
  );
  assertEquals(frame.skill_signals.coaching_recommendation, undefined);
  assertNoLegacyRouteFields(frame);
});

Deno.test("dispatcher normalizes unknown presence kind to maintain", async () => {
  const frame = await dispatch("je réfléchis à voix haute", {
    skill_signals: {
      presence_conversation: {
        detected: true,
        confidence_band: "medium",
        context: { kind: "not_a_real_kind", reason: "x" },
      },
    },
  });
  assertEquals(
    frame.skill_signals.presence_conversation?.context?.kind,
    "maintain",
  );
});

Deno.test("dispatcher drops presence_conversation when not detected", async () => {
  const frame = await dispatch("où je trouve mes potions ?", {
    skill_signals: {
      presence_conversation: {
        detected: false,
        confidence_band: "low",
        context: { kind: "maintain", reason: "x" },
      },
    },
  });
  assertEquals(frame.skill_signals.presence_conversation, undefined);
});

Deno.test("dispatcher prompt documents presence_conversation + anti-false-positives", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("skill_signals.presence_conversation"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("presence_conversation ="),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("ANTI-FAUX-POSITIFS presence_conversation"),
    true,
  );
  // Une demande de méthode reste maintain; seule une demande explicite de
  // dispositif produit (tool_pull) fait sortir. Le dispatcher doit aussi être
  // informé quand un flow présence est actif (flag minimal, pas d'état).
  assertEquals(DISPATCHER_V2_SYSTEM_PROMPT.includes("tool_pull"), true);
  assertEquals(DISPATCHER_V2_SYSTEM_PROMPT.includes("pivot_action"), false);
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("presence_conversation_active"),
    true,
  );
});

Deno.test("dispatcher keeps session style hint at root even without a detected skill signal (P1-2, alex-cpr B04)", async () => {
  const frame = await dispatch(
    "Ce soir reponds plus court stp, et zero emojis",
    {
      session_style_commitment_hint: "reponses plus courtes ce soir, zero emojis",
      skill_signals: {
        feature_opportunity: {
          detected: false,
          confidence_band: "low",
          reason: "style_constraint_only",
        },
      },
    },
  );

  // Le hint survit à la normalisation (champ racine, pas un skill signal).
  assertEquals(
    frame.session_style_commitment_hint,
    "reponses plus courtes ce soir, zero emojis",
  );
  // Anti-effet-de-bord: le signal non-detected reste droppé — la contrainte
  // de style ne force aucun routing feature_opportunity.
  assertEquals(frame.skill_signals.feature_opportunity, undefined);
});

Deno.test("dispatcher leaves session style hint empty when no constraint is expressed (P1-2 anti-FP)", async () => {
  const frame = await dispatch("J'ai fait ma marche", {
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { plan_item_id: "walk", status_hint: "done" },
    }],
  });

  assertEquals(frame.session_style_commitment_hint ?? null, null);
});

Deno.test("dispatcher drops a bare create on a status_check turn (P2-1, paul-untested R1-B01)", async () => {
  const frame = await dispatch(
    "Mon rappel de demain matin 8h pour le sac, il est toujours bon hein ?",
    {
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text: "demain matin 8h preparer le sac",
          when_hint: "demain 8h",
        },
      }],
      memory_plan: {
        response_intent: "status_check_reminder",
        context_need: "targeted",
        memory_mode: "light",
        context_budget_tier: "small",
        targets: [],
        retrieval_policy: "taxonomy_first",
      },
    },
  );

  // Incohérence intra-frame résolue côté sûreté: le create pur est droppé,
  // la projection DB répond au statut.
  assertEquals(frame.direct_effects, []);
  assertEquals(frame.memory_plan.response_intent, "status_check_reminder");
});

Deno.test("dispatcher keeps cancel/status intents on a status_check turn (P2-1 anti-FP, rose T14 multi-intention)", async () => {
  const frame = await dispatch(
    "Annule le rappel de 12h30 et dis-moi ce qui reste de prévu.",
    {
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { intent: "cancel", when_hint: "12h30" },
      }],
      memory_plan: {
        response_intent: "status_check_reminder",
        context_need: "targeted",
        memory_mode: "light",
        context_budget_tier: "small",
        targets: [],
        retrieval_policy: "taxonomy_first",
      },
    },
  );

  // Le cancel du même tour SURVIT — seule la création pure est incohérente
  // avec un tour statut.
  assertEquals(frame.direct_effects.length, 1);
  assertEquals(
    (frame.direct_effects[0].payload_hint as { intent?: string }).intent,
    "cancel",
  );
});

Deno.test("dispatcher keeps a bare create when the turn is a real request (P2-1 anti-FP)", async () => {
  const frame = await dispatch("Rappelle-moi demain a 9h d'appeler Paul", {
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { raw_text: "demain a 9h appeler Paul" },
    }],
    memory_plan: {
      response_intent: "confirm_reminder_created",
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "taxonomy_first",
    },
  });

  assertEquals(frame.direct_effects.length, 1);
});

Deno.test("conversation_risk porte une traîne décroissante après un tour chargé (P3-A, alex-safety R1-B03)", async () => {
  // Tour précédent en crise (score 10) → traîne 6 ce tour, band plancher low.
  const frame = await dispatch("bon sinon, ma journée s'est bien passée", {});
  assertEquals(frame.conversation_risk?.score, 0);

  const trailed = await runDispatcher({
    ...baseInput("bon sinon, ma journée s'est bien passée", async () => ({})),
    conversation_risk_history: [10],
  });
  assertEquals(trailed.conversation_risk?.score, 6);
  assertEquals(
    trailed.conversation_risk?.reason_codes.includes("previous_risk_trail"),
    true,
  );
  // Plancher de traçabilité: none → low pendant la traîne (non bloquant).
  assertEquals(trailed.safety.risk_band, "low");

  // Décroissance: medium (6) → 2 → 0 (anti-FP: pas de traîne infinie).
  const fading = await runDispatcher({
    ...baseInput("ok", async () => ({})),
    conversation_risk_history: [6, 2],
  });
  assertEquals(fading.conversation_risk?.score, 0);
  assertEquals(fading.safety.risk_band, "none");
});

Deno.test("le sanitizer conserve deux effets de TYPES distincts dans un tour (P3-D, eva-global18 T9)", async () => {
  const frame = await dispatch(
    "Marque la marche comme ratée pour hier, et rappelle-moi demain à 18h d'appeler le kiné.",
    {
      direct_effects: [
        {
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            target_item_id: "walk",
            status_hint: "missed",
            date_hint: "2026-07-12",
            target_evidence: "la marche",
          },
        },
        {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text: "rappelle-moi demain à 18h d'appeler le kiné",
            when_hint: "demain à 18h",
            UTC_time: "2026-07-14T16:00:00.000Z",
            local_label: "demain à 18h",
            instruction_hint: "appeler le kiné",
          },
        },
      ],
    },
  );

  assertEquals(
    frame.direct_effects.map((effect) => effect.effect_type).sort(),
    ["create_one_shot_reminder", "track_progress_plan_item"],
  );
});

Deno.test("le sanitizer conserve N creates de rappel a payloads DISTINCTS (P8-A, rose-p7verify T13/T14)", async () => {
  const reminderEffect = (payload: Record<string, unknown>) => ({
    effect_type: "create_one_shot_reminder",
    explicitness: "explicit",
    target_status: "identified",
    confidence_band: "high",
    payload_hint: payload,
  });
  // Positif: co-demande de 2 rappels → les 2 entrées survivent au frame.
  const frame = await dispatch(
    "Pose-moi deux rappels d'un coup : jeudi 18h pour le médecin et samedi 10h pour les courses.",
    {
      direct_effects: [
        reminderEffect({
          raw_text: "jeudi 18h pour le médecin",
          when_hint: "jeudi à 18h",
          UTC_time: "2026-07-16T16:00:00.000Z",
          local_label: "jeudi à 18h",
          instruction_hint: "appeler le médecin",
        }),
        reminderEffect({
          raw_text: "samedi 10h pour les courses",
          when_hint: "samedi à 10h",
          UTC_time: "2026-07-18T08:00:00.000Z",
          local_label: "samedi à 10h",
          instruction_hint: "faire les courses",
        }),
      ],
    },
  );
  assertEquals(frame.direct_effects.length, 2);
  assertEquals(
    frame.direct_effects.map((effect) =>
      String((effect.payload_hint as Record<string, unknown>).local_label)
    ),
    ["jeudi à 18h", "samedi à 10h"],
  );

  // Anti-faux-positif: un payload strictement IDENTIQUE reste dédupé.
  const duplicated = await dispatch("Rappelle-moi jeudi 18h le médecin", {
    direct_effects: [
      reminderEffect({
        raw_text: "jeudi 18h le médecin",
        UTC_time: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        instruction_hint: "appeler le médecin",
      }),
      reminderEffect({
        raw_text: "jeudi 18h le médecin",
        UTC_time: "2026-07-16T16:00:00.000Z",
        local_label: "jeudi à 18h",
        instruction_hint: "appeler le médecin",
      }),
    ],
  });
  assertEquals(duplicated.direct_effects.length, 1);

  // Invariant: borne fan-out — 4 payloads distincts → 3 max au frame; et le
  // type track reste mono-entrée (cap inchangé hors rappels).
  const overflow = await dispatch("Pose-moi quatre rappels", {
    direct_effects: [1, 2, 3, 4].map((n) =>
      reminderEffect({
        raw_text: `rappel ${n}`,
        UTC_time: `2026-07-2${n}T08:00:00.000Z`,
        local_label: `jour ${n}`,
        instruction_hint: `tâche ${n}`,
      })
    ),
  });
  assertEquals(overflow.direct_effects.length, 3);
});

Deno.test("un tour de VERIFY ne porte jamais une requête track nue (P8-D, nina-hard23 R1-B02)", async () => {
  // Positif: question de vérif de coche → le track nu est droppé au frame.
  const frame = await dispatch(
    "j'ai bien coché mon eau aujourd'hui ?",
    {
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "water",
          status_hint: "completed",
          target_evidence: "mon eau",
        },
      }],
      memory_plan: {
        response_intent: "verify_tracking_status",
        context_need: "targeted",
        memory_mode: "light",
        context_budget_tier: "small",
        targets: [],
        retrieval_policy: "taxonomy_first",
      },
    },
  );
  assertEquals(frame.direct_effects, []);

  // Anti-faux-positif: une CORRECTION explicite du même tour survit (P3-C).
  const correction = await dispatch(
    "vérifie — en fait c'était pas l'eau mais la marche, corrige",
    {
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "walk",
          status_hint: "completed",
          correction: true,
          target_evidence: "la marche",
        },
      }],
      memory_plan: {
        response_intent: "verify_tracking_status",
        context_need: "targeted",
        memory_mode: "light",
        context_budget_tier: "small",
        targets: [],
        retrieval_policy: "taxonomy_first",
      },
    },
  );
  assertEquals(correction.direct_effects.length, 1);

  // Anti-faux-positif: un vrai report de complétion (intent non-verify) passe.
  const report = await dispatch(
    "j'ai fait mon eau aujourd'hui",
    {
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "water",
          status_hint: "completed",
          target_evidence: "mon eau",
        },
      }],
      memory_plan: {
        response_intent: "confirm_progress_logged",
        context_need: "targeted",
        memory_mode: "light",
        context_budget_tier: "small",
        targets: [],
        retrieval_policy: "taxonomy_first",
      },
    },
  );
  assertEquals(report.direct_effects.length, 1);
});
