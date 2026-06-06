import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runDispatcher } from "./dispatcher.v2.ts";

function baseInput(message: string) {
  return {
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "web" as const,
    plan_snapshot: {
      items: [
        { id: "walk", title: "marche", kind: "habit", dimension: "habits" },
        {
          id: "deck",
          title: "Préparer la présentation client",
          kind: "mission",
          dimension: "missions",
        },
      ],
    },
    safety_pregate_output: {
      detected: false,
      risk_band: "none" as const,
      reason_codes: [],
      evidence: [],
      layer_contributions: {
        lexical: false,
        heuristic: false,
        dispatcher_llm: false as const,
      },
      allow_side_effects: true,
    },
  };
}

Deno.test("dispatcher routes plan how-to to product_help without adjust tool skill", async () => {
  const frame = await runDispatcher(baseInput("comment ajuster mon plan ?"));

  assertEquals(frame.skill_signals.entry?.product_help?.detected, true);
  assertEquals(
    frame.skill_signals.entry?.product_help?.reason,
    "product_question",
  );
  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("dispatcher routes espace product wording to product_help", async () => {
  const frame = await runDispatcher(baseInput("mon espace sert a quoi ?"));

  assertEquals(frame.skill_signals.entry?.product_help?.detected, true);
  assertEquals(
    frame.skill_signals.entry?.product_help?.reason,
    "product_question",
  );
  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("dispatcher keeps dashboard explanation questions out of tool skills", async () => {
  const messages = [
    "dans l'espace Ressources, c'est quoi la difference entre carte d'attaque et carte de defense ?",
    "une carte de defense je peux la creer librement ou seulement depuis une action du plan ?",
    "donne-moi la difference simple entre valider une mission et ajuster le plan.",
    "si je veux que Sophia pose moins de questions, c'est dans quelle partie ?",
    "pour une carte d'attaque, je la vois aussi dans le Plan ou seulement dans Ressources ?",
    "et si elle est liee a une mission, je la retrouve ou apres generation ?",
    "est-ce que la Base de vie est un deuxieme plan actif ?",
    "si la suite est verrouillee, qu'est-ce que Sophia doit m'expliquer ?",
  ];

  for (const message of messages) {
    const frame = await runDispatcher(baseInput(message));
    assertEquals(
      frame.skill_signals.entry?.product_help?.detected,
      true,
      message,
    );
    assertEquals(frame.tool_skill_intents.length, 0, message);
  }
});

Deno.test("dispatcher treats product capability questions as product_help, not tool creation", async () => {
  const frame = await runDispatcher(
    baseInput("Est-ce que je peux créer une carte d'attaque ici ?"),
  );

  assertEquals(frame.skill_signals.entry?.product_help?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("dispatcher keeps product follow-up pronouns in product_help", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "quand je l'active, est-ce qu'elle fait juste une reponse maintenant ou autre chose apres ?",
    ),
    recent_messages: [
      {
        role: "user" as const,
        content: "a quoi sert une potion dans Sophia ?",
      },
      {
        role: "assistant" as const,
        content: "Une potion est dans Dashboard > Ressources.",
      },
    ],
  });

  assertEquals(frame.skill_signals.entry?.product_help?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 0);

  const cardFollowUp = await runDispatcher({
    ...baseInput(
      "si mon probleme c'est plutot un piege au moment ou je deraille, tu m'orientes vers quoi ?",
    ),
    recent_messages: [
      {
        role: "assistant" as const,
        content: "On parle des cartes dans Dashboard > Ressources.",
      },
    ],
  });

  assertEquals(cardFollowUp.skill_signals.entry?.product_help?.detected, true);
  assertEquals(cardFollowUp.tool_skill_intents.length, 0);

  const potionFollowUp = await runDispatcher({
    ...baseInput(
      "tu peux me dire clairement cette histoire de suivi 7 jours ?",
    ),
    recent_messages: [
      {
        role: "assistant" as const,
        content:
          "Une potion dans Dashboard > Ressources cree un suivi 7 jours.",
      },
    ],
  });

  assertEquals(
    potionFollowUp.skill_signals.entry?.product_help?.detected,
    true,
  );
  assertEquals(potionFollowUp.tool_skill_intents.length, 0);
});

Deno.test("dispatcher routes direct plan adjustment as adjust_plan_item", async () => {
  const frame = await runDispatcher({
    ...baseInput("ajuste ma marche"),
    llm_runner: async () => ({
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "adjust",
        explicitness: "explicit",
        target_hint: "marche",
        adjust_plan_scope: "specific_action",
        confidence_band: "high",
        ambiguity: "none",
      }],
    }),
  });

  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
  assertEquals(frame.tool_skill_intents[0]?.operation_type, "adjust_plan_item");
});

Deno.test("dispatcher routes natural structural trajectory request as whole-plan adjust_plan", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "En regardant la suite du plan, je trouve que la prochaine étape arrive trop vite. Avant les conversations sensibles, je voudrais une étape intermédiaire plus sécurisante.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [],
    }),
  });

  assertEquals(frame.tool_skill_intents[0]?.operation_type, "adjust_plan_item");
  assertEquals(frame.tool_skill_intents[0]?.adjust_plan_scope, "whole_plan");
  assertEquals(
    (frame.tool_skill_intents[0]?.operation_input as any)?.target_granularity
      ?.value,
    "whole_plan",
  );
  assertEquals(
    (frame.tool_skill_intents[0]?.operation_input as any)?.scope?.kind,
    "whole_plan",
  );
});

Deno.test("dispatcher preserves structured current-level adjust_plan operation_input", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Non, pas une carte. Je veux modifier le niveau du plan et réduire la charge du soir.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "adjust",
        explicitness: "explicit",
        target_hint: "niveau du soir",
        adjust_plan_scope: "current_level",
        rejected_operations: ["prepare_attack_card"],
        confidence_band: "high",
        ambiguity: "none",
        operation_input: {
          target_granularity: {
            status: "identified",
            value: "current_level",
            confidence: "high",
            evidence: ["modifier le niveau du plan"],
            negative_evidence: ["pas une carte"],
          },
          scope: {
            status: "identified",
            kind: "current_level",
            label: "niveau du soir",
            evidence: ["réduire la charge du soir"],
          },
        },
      }],
      tool_skill_opportunity: {
        type: "none",
        operation_type: null,
        surface_id: null,
        should_offer: false,
        confidence_band: "low",
        offer_timing: "never",
        must_not_execute: true,
      },
    }),
  });

  assertEquals(frame.tool_skill_intents[0]?.operation_type, "adjust_plan_item");
  assertEquals(frame.tool_skill_intents[0]?.adjust_plan_scope, "current_level");
  assertEquals(frame.tool_skill_intents[0]?.rejected_operations, [
    "prepare_attack_card",
  ]);
  assertEquals(
    (frame.tool_skill_intents[0]?.operation_input as any)?.scope?.kind,
    "current_level",
  );
});

Deno.test("dispatcher proposes attack card opportunity without executing it", async () => {
  const frame = await runDispatcher(
    baseInput(
      "J'ai fait ma marche, mais j'ai tourné autour pendant 45 minutes avant de commencer.",
    ),
  );

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "attack_card");
  assertEquals(
    frame.tool_skill_opportunity.operation_type,
    "prepare_attack_card",
  );
  assertEquals(frame.tool_skill_opportunity.should_offer, true);
  assertEquals(frame.tool_skill_opportunity.must_not_execute, true);
  assertEquals(
    frame.tool_skill_opportunity.suggested_question_intent,
    "offer_attack_card",
  );
});

Deno.test("dispatcher does not offer medium-confidence tool skill opportunity", async () => {
  const frame = await runDispatcher({
    ...baseInput("J'ai fait ma marche, mais le démarrage était un peu flou."),
    llm_runner: async () => ({
      tool_skill_opportunity: {
        type: "attack_card",
        operation_type: "prepare_attack_card",
        surface_id: "attack_card",
        confidence_band: "medium",
        should_offer: true,
        prop_reason: "startup friction is present but not strong enough",
        source_span: "démarrage était un peu flou",
        target_hint: "marche",
        target_status: "identified",
        suggested_question_intent: "offer_attack_card",
        offer_timing: "now",
        must_not_execute: true,
      },
    }),
  });

  assertEquals(frame.tool_skill_opportunity.type, "attack_card");
  assertEquals(frame.tool_skill_opportunity.should_offer, false);
  assertEquals(frame.tool_skill_opportunity.offer_timing, "never");
});

Deno.test("dispatcher suppresses tool skill opportunity during review data capture", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Pour le bilan de fin de semaine, note surtout que je complexifie trop la structure avant d'utiliser ma marche.",
    ),
    llm_runner: async () => ({
      tool_skill_opportunity: {
        type: "attack_card",
        operation_type: "prepare_attack_card",
        surface_id: "attack_card",
        confidence_band: "high",
        should_offer: true,
        prop_reason: "user mentions execution friction",
        source_span: "je complexifie trop la structure",
        target_hint: "marche",
        target_status: "identified",
        suggested_question_intent: "offer_attack_card",
        offer_timing: "now",
        must_not_execute: true,
      },
    }),
  });

  assertEquals(frame.tool_skill_opportunity.type, "attack_card");
  assertEquals(frame.tool_skill_opportunity.should_offer, false);
  assertEquals(frame.tool_skill_opportunity.offer_timing, "never");
});

Deno.test("dispatcher keeps explicit tool skill intent separate from opportunity", async () => {
  const frame = await runDispatcher(
    baseInput("Fais-moi une carte d'attaque pour ma marche."),
  );

  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "prepare_attack_card",
  );
  assertEquals(frame.tool_skill_opportunity.type, "none");
  assertEquals(frame.tool_skill_opportunity.should_offer, false);
});

Deno.test("dispatcher blocks tool skills and opportunities under high safety", async () => {
  const frame = await runDispatcher({
    ...baseInput("J'ai envie de disparaître, aide-moi à alléger le plan."),
    safety_pregate_output: {
      detected: true,
      risk_band: "high" as const,
      reason_codes: ["self_harm_ideation"],
      evidence: ["envie de disparaître"],
      layer_contributions: {
        lexical: true,
        heuristic: true,
        dispatcher_llm: false as const,
      },
      allow_side_effects: false,
    },
    llm_runner: async () => ({
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "adjust",
        explicitness: "explicit",
        target_hint: "plan",
        confidence_band: "high",
        ambiguity: "none",
        operation_input: {
          target_granularity: {
            status: "ambiguous",
            value: "whole_plan",
            confidence: "medium",
            evidence: ["alléger le plan"],
            negative_evidence: [],
          },
        },
      }],
      tool_skill_opportunity: {
        type: "plan_adjustment",
        operation_type: "adjust_plan_item",
        surface_id: "plan.adjust",
        confidence_band: "high",
        should_offer: true,
        prop_reason: "plan adjustment mentioned",
        source_span: "alléger le plan",
        target_hint: "plan",
        target_status: "ambiguous",
        suggested_question_intent: "offer_plan_adjustment",
        offer_timing: "now",
        must_not_execute: true,
      },
    }),
  });

  assertEquals(frame.safety.risk_band, "high");
  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "none");
  assertEquals(frame.tool_skill_opportunity.should_offer, false);
});

Deno.test("dispatcher treats explicit attack card creation as tool skill even with product words", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Je veux une carte d'attaque pour le sas du soir, avec un signal tres simple.",
    ),
  );

  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "prepare_attack_card",
  );
});

Deno.test("dispatcher routes explicit defense card creation despite product-surface words", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Prépare une carte de défense pour ce soir quand je risque de craquer sur Instagram.",
    ),
  );

  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "prepare_defense_card",
  );
});

Deno.test("dispatcher proposes plan adjustment when an action no longer fits", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Cette marche n'a plus de sens dans ma semaine, je n'arrive pas à l'intégrer.",
    ),
  );

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "plan_adjustment");
  assertEquals(frame.tool_skill_opportunity.operation_type, "adjust_plan_item");
  assertEquals(
    frame.tool_skill_opportunity.suggested_question_intent,
    "offer_plan_adjustment",
  );
  assertEquals(frame.tool_skill_opportunity.must_not_execute, true);
});

Deno.test("dispatcher demotes plan difficulty sharing from adjust intent to opportunity", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Cette semaine mon plan est trop lourd, je n'arrive pas à tenir les actions prévues et je décroche.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "adjust",
        explicitness: "explicit",
        target_hint: "plan de la semaine",
        confidence_band: "high",
        ambiguity: "none",
      }],
      tool_skill_opportunity: {
        type: "none",
        operation_type: null,
        surface_id: null,
        confidence_band: "low",
        should_offer: false,
        prop_reason: null,
        source_span: null,
        target_hint: null,
        target_status: "none",
        suggested_question_intent: null,
        offer_timing: "never",
        must_not_execute: true,
      },
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "portion");
  assertEquals(frame.tool_skill_opportunity.operation_type, "adjust_plan_item");
  assertEquals(frame.tool_skill_opportunity.must_not_execute, true);
});

Deno.test("dispatcher turns coach style sharing into coach preferences opportunity", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Quand tu me poses trop de questions d'affilée, je me ferme un peu ; j'avance mieux avec une seule question courte.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [{
        operation_type: "update_coach_preferences",
        user_intent: "update",
        explicitness: "explicit",
        target_hint: "style de communication",
        confidence_band: "high",
        ambiguity: "none",
      }],
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "coach_preferences");
  assertEquals(
    frame.tool_skill_opportunity.operation_type,
    "update_coach_preferences",
  );
  assertEquals(
    frame.tool_skill_opportunity.surface_id,
    "dashboard.preferences",
  );
  assertEquals(frame.tool_skill_opportunity.must_not_execute, true);
});

Deno.test("dispatcher keeps corrected final tool intent when LLM emits two intents", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "J'aimerais bien créer une carte d'attaque, mais en vrai c'est mieux d'ajuster la semaine.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [
        {
          operation_type: "prepare_attack_card",
          user_intent: "create",
          explicitness: "explicit",
          target_hint: "carte d'attaque",
          confidence_band: "high",
          ambiguity: "none",
          operation_input: {
            target_action: {
              status: "identified",
              value: "semaine",
            },
          },
        },
        {
          operation_type: "adjust_plan_item",
          user_intent: "adjust",
          explicitness: "explicit",
          target_hint: "semaine",
          confidence_band: "high",
          ambiguity: "none",
          rejected_operations: ["prepare_attack_card"],
          adjust_plan_scope: "current_level",
          operation_input: {
            target_granularity: {
              status: "identified",
              value: "current_level",
            },
            scope: {
              status: "identified",
              kind: "current_level",
            },
          },
        },
      ],
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 1);
  assertEquals(frame.tool_skill_intents[0]?.operation_type, "adjust_plan_item");
  assertEquals(frame.tool_skill_intents[0]?.rejected_operations, [
    "prepare_attack_card",
  ]);
});

Deno.test("dispatcher lets explicit final card choice beat earlier plan adjustment", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "On pourrait ajuster la semaine, mais non, fais plutôt une carte d'attaque pour le dossier client.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [
        {
          operation_type: "adjust_plan_item",
          user_intent: "adjust",
          explicitness: "explicit",
          target_hint: "semaine",
          confidence_band: "high",
          ambiguity: "none",
          adjust_plan_scope: "current_level",
          operation_input: {
            target_granularity: {
              status: "identified",
              value: "current_level",
            },
            scope: {
              status: "identified",
              kind: "current_level",
            },
          },
        },
        {
          operation_type: "prepare_attack_card",
          user_intent: "create",
          explicitness: "explicit",
          target_hint: "dossier client",
          confidence_band: "high",
          ambiguity: "none",
          rejected_operations: ["adjust_plan_item"],
          operation_input: {
            target_action: {
              status: "identified",
              value: "dossier client",
            },
          },
        },
      ],
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 1);
  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "prepare_attack_card",
  );
  assertEquals(frame.tool_skill_intents[0]?.rejected_operations, [
    "adjust_plan_item",
  ]);
});

Deno.test("dispatcher chooses plan adjustment over card when both remain high confidence", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Je pense à une carte d'attaque, et aussi à rendre la semaine plus légère.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [
        {
          operation_type: "prepare_attack_card",
          user_intent: "create",
          explicitness: "explicit",
          target_hint: "carte d'attaque",
          confidence_band: "high",
          ambiguity: "none",
          operation_input: {
            target_action: {
              status: "identified",
              value: "semaine",
            },
          },
        },
        {
          operation_type: "adjust_plan_item",
          user_intent: "adjust",
          explicitness: "explicit",
          target_hint: "semaine",
          confidence_band: "high",
          ambiguity: "none",
          adjust_plan_scope: "current_level",
          operation_input: {
            target_granularity: {
              status: "identified",
              value: "current_level",
            },
            scope: {
              status: "identified",
              kind: "current_level",
            },
          },
        },
      ],
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 1);
  assertEquals(frame.tool_skill_intents[0]?.operation_type, "adjust_plan_item");
});

Deno.test("dispatcher delays opportunity offer while an operation intake is active", async () => {
  const frame = await runDispatcher({
    ...baseInput("J'ai fait la marche mais le démarrage était dur."),
    active_tool_skill_intake: {
      operation_type: "create_recurring_reminder",
      phase: "time_resolution",
    },
  });

  assertEquals(frame.tool_skill_opportunity.type, "attack_card");
  assertEquals(
    frame.tool_skill_opportunity.offer_timing,
    "after_current_pending",
  );
  assertEquals(frame.tool_skill_opportunity.must_not_execute, true);
});

Deno.test("dispatcher rejects LLM recurring reminder false positive without explicit reminder ask", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "je suis rincée, même les petites actions donnent l'impression de recommencer tous les jours",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [{
        operation_type: "create_recurring_reminder",
        user_intent: "create",
        explicitness: "explicit",
        target_hint: "tous les jours",
        confidence_band: "high",
        ambiguity: "none",
      }],
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("dispatcher suppresses tool skill intents when acute emotional repair dominates", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Je me sens nul et complètement en vrac, j'ai envie de tout laisser tomber ; lance-moi une potion de clarté.",
    ),
    llm_runner: async () => ({
      skill_signals: {
        entry: {
          emotional_repair: {
            detected: true,
            confidence_band: "high",
            reason: "self_attack_or_shame",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "select_state_potion",
        user_intent: "select",
        explicitness: "explicit",
        target_hint: "potion de clarté",
        confidence_band: "high",
        ambiguity: "none",
        operation_input: {
          potion_type: "clarity",
        },
      }],
    }),
  });

  assertEquals(frame.skill_signals.entry?.emotional_repair?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "none");
});

Deno.test("dispatcher suppresses state potion opportunity for loss of meaning repair", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Je ne sais plus pourquoi je fais mes actions, ça n'a plus de sens.",
    ),
    llm_runner: async () => ({
      skill_signals: {
        entry: {
          demotivation_repair: {
            detected: true,
            confidence_band: "high",
            reason: "loss_of_meaning",
          },
        },
      },
      tool_skill_opportunity: {
        type: "state_potion",
        confidence_band: "high",
        should_offer: true,
        prop_reason: "user_mentions_state_regulation_need",
        target_status: "none",
        target_hint: null,
        offer_timing: "now",
      },
    }),
  });

  assertEquals(frame.skill_signals.entry?.demotivation_repair?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "none");
});

Deno.test("dispatcher suppresses state potion opportunity for acute shame repair", async () => {
  const frame = await runDispatcher({
    ...baseInput("J'ai honte, je me déteste et je m'en veux tellement."),
    llm_runner: async () => ({
      skill_signals: {
        entry: {
          emotional_repair: {
            detected: true,
            confidence_band: "high",
            reason: "self_attack_or_shame",
          },
        },
      },
      tool_skill_opportunity: {
        type: "state_potion",
        confidence_band: "high",
        should_offer: true,
        prop_reason: "user_mentions_state_regulation_need",
        target_status: "none",
        target_hint: null,
        offer_timing: "now",
      },
    }),
  });

  assertEquals(frame.skill_signals.entry?.emotional_repair?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "none");
});

Deno.test("dispatcher suppresses implicit state potion opportunity without explicit potion request", async () => {
  const frame = await runDispatcher({
    ...baseInput("Je suis sous pression et complètement saturé ce soir."),
    llm_runner: async () => ({
      tool_skill_opportunity: {
        type: "state_potion",
        confidence_band: "high",
        should_offer: true,
        prop_reason: "user_mentions_state_regulation_need",
        target_status: "none",
        target_hint: null,
        offer_timing: "now",
      },
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "none");
});

Deno.test("dispatcher keeps explicit state potion request routeable", async () => {
  const frame = await runDispatcher({
    ...baseInput("Je veux une potion de clarté pour me recentrer."),
    llm_runner: async () => ({
      tool_skill_opportunity: {
        type: "state_potion",
        confidence_band: "high",
        should_offer: true,
        prop_reason: "explicit_state_potion_request",
        target_status: "none",
        target_hint: "potion de clarté",
        offer_timing: "now",
      },
    }),
  });

  assertEquals(frame.tool_skill_opportunity.type, "state_potion");
});

Deno.test("dispatcher keeps explicit clarity potion intent with plan meaning loss", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Je veux une potion de clarté. Mon plan commence à perdre son sens, je ne vois plus le lien entre mes actions et mon pourquoi profond.",
    ),
    llm_runner: async () => ({
      skill_signals: {
        entry: {
          demotivation_repair: {
            detected: true,
            confidence_band: "medium",
            reason: "loss_of_plan_meaning",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "select_state_potion",
        user_intent: "select",
        explicitness: "explicit",
        target_hint: "potion de clarté",
        confidence_band: "high",
        ambiguity: "none",
        operation_input: {
          potion_type: "clarte",
        },
      }],
    }),
  });

  assertEquals(frame.skill_signals.entry?.demotivation_repair?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 1);
  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "select_state_potion",
  );
  assertEquals(
    (frame.tool_skill_intents[0]?.operation_input as any)?.potion_type,
    "clarte",
  );
});

Deno.test("dispatcher removes card intent when acute emotional repair dominates", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Je me déteste quand je craque, prépare une carte pour ne pas replonger ce soir.",
    ),
    llm_runner: async () => ({
      skill_signals: {
        entry: {
          emotional_repair: {
            detected: true,
            confidence_band: "high",
            reason: "self_attack_or_shame",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        user_intent: "create",
        explicitness: "explicit",
        target_hint: "ce soir",
        confidence_band: "high",
        ambiguity: "none",
        operation_input: {
          risk_context: "ne pas replonger ce soir",
        },
      }],
    }),
  });

  assertEquals(frame.skill_signals.entry?.emotional_repair?.detected, true);
  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "none");
});

Deno.test("dispatcher respects explicit negation of state potion", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Ne lance pas de potion, aide-moi juste à comprendre par où commencer.",
    ),
    llm_runner: async () => ({
      skill_signals: {
        entry: {},
      },
      tool_skill_intents: [{
        operation_type: "select_state_potion",
        user_intent: "select",
        explicitness: "explicit",
        target_hint: "potion",
        confidence_band: "high",
        ambiguity: "none",
        operation_input: {
          potion_type: "clarity",
        },
      }],
    }),
  });

  assertEquals(
    frame.tool_skill_intents.some((intent) =>
      intent.operation_type === "select_state_potion"
    ),
    false,
  );
});

Deno.test("dispatcher routes send-me recurring content as recurring reminder", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Envoie-moi une phrase stoïcienne tous les matins à 7h30 pour commencer la journée.",
    ),
  );

  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(frame.tool_skill_intents[0]?.user_intent, "create");
  assertEquals(frame.direct_effects.length, 0);
});

Deno.test("dispatcher routes weekday recurring reminders as recurring reminder", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Dans ma Base de vie, rappelle-moi les jours de semaine à 12h30 de respirer deux minutes avant de repartir.",
    ),
  );

  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(frame.tool_skill_intents[0]?.user_intent, "create");
  assertEquals(frame.direct_effects.length, 0);
});

Deno.test("dispatcher routes explicit weekday-list reminders as recurring reminder", async () => {
  const frame = await runDispatcher(
    baseInput(
      "A, aux moments prévus : lundi, mercredi et vendredi à 8h10. Rappelle-moi de faire Respiration 4-7-8.",
    ),
  );

  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(frame.tool_skill_intents[0]?.user_intent, "create");
  assertEquals(frame.direct_effects.length, 0);
});

Deno.test("dispatcher routes single weekday reminder even when LLM omits tool intent", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Le mercredi en fin d'aprem, j'oublie le petit message positif. Mets-moi un rappel à 17h55, tant que cette action existe dans mon plan.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [],
      skill_signals: {},
    }),
  });

  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(frame.tool_skill_intents[0]?.user_intent, "create");
  assertEquals(frame.direct_effects.length, 0);
});

Deno.test("dispatcher routes make-the-reminder wording with weekday list", async () => {
  const frame = await runDispatcher(
    baseInput(
      "B, adaptative. Fais le rappel lundi, mercredi et vendredi à 8h10.",
    ),
  );

  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(frame.tool_skill_intents[0]?.user_intent, "create");
  assertEquals(frame.direct_effects.length, 0);
});

Deno.test("dispatcher rejects LLM attack-card false positive without explicit card ask", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "J'ai fait ma marche, mais j'ai tourné autour avant de commencer. Ce soir je veux couper ce moment d'hésitation.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        user_intent: "create",
        explicitness: "explicit",
        target_hint: "couper le moment d'hésitation",
        confidence_band: "high",
        ambiguity: "none",
      }],
      tool_skill_opportunity: {
        type: "none",
        operation_type: null,
        surface_id: null,
        should_offer: false,
        confidence_band: "low",
        offer_timing: "never",
        must_not_execute: true,
      },
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.type, "attack_card");
  assertEquals(
    frame.tool_skill_opportunity.operation_type,
    "prepare_attack_card",
  );
  assertEquals(frame.tool_skill_opportunity.should_offer, true);
  assertEquals(frame.tool_skill_opportunity.must_not_execute, true);
});

Deno.test("dispatcher trusts structured LLM plan-adjust intents instead of regex filtering", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Hier j'ai fait ma marche, mais j'ai beaucoup hésité avant de démarrer. Ce soir je veux raccourcir ce passage.",
    ),
    llm_runner: async () => ({
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "adjust",
        explicitness: "explicit",
        target_hint: "raccourcir ce passage",
        adjust_plan_scope: "specific_action",
        operation_input: {
          target_granularity: {
            status: "identified",
            value: "single_action",
            confidence: "high",
            evidence: ["LLM structured intent"],
            negative_evidence: [],
          },
          scope: {
            status: "identified",
            kind: "specific_plan_item",
            plan_item_id: "walk",
            label: "marche",
            evidence: ["LLM matched plan item"],
          },
        },
        confidence_band: "high",
        ambiguity: "none",
      }],
      tool_skill_opportunity: {
        type: "none",
        operation_type: null,
        surface_id: null,
        should_offer: false,
        confidence_band: "low",
        offer_timing: "never",
        must_not_execute: true,
      },
    }),
  });

  assertEquals(frame.tool_skill_intents.length, 1);
  assertEquals(frame.tool_skill_intents[0]?.operation_type, "adjust_plan_item");
  assertEquals(
    frame.tool_skill_intents[0]?.adjust_plan_scope,
    "specific_action",
  );
  assertEquals(
    (frame.tool_skill_intents[0]?.operation_input as any)?.scope?.plan_item_id,
    "walk",
  );
  assertEquals(frame.tool_skill_opportunity.type, "none");
});

Deno.test("dispatcher accepts sanitized LLM memory_plan on turn_frame", async () => {
  const memoryPlan = {
    response_intent: "reflection",
    reasoning_complexity: "low" as const,
    context_need: "targeted" as const,
    memory_mode: "light" as const,
    model_tier_hint: "lite" as const,
    context_budget_tier: "small" as const,
    targets: [
      {
        type: "domain_key" as const,
        key: "relations.famille",
        retrieval_policy: "taxonomy_first" as const,
      },
    ],
    retrieval_policy: "taxonomy_first" as const,
    plan_confidence: 0.7,
  };
  const frame = await runDispatcher({
    ...baseInput("tu te souviens de ce qu'on disait sur mon père ?"),
    llm_runner: async () => ({
      memory_plan: memoryPlan,
    }),
  });

  assertEquals(frame.memory_plan.memory_mode, "light");
  assertEquals(frame.memory_plan.context_need, "targeted");
  assertEquals(frame.memory_plan.context_budget_tier, "small");
  assertEquals(frame.memory_plan.targets[0]?.type, "domain_key");
  assertEquals(frame.memory_plan.targets[0]?.key, "relations.famille");
});

Deno.test("dispatcher suppresses action memory targets during daily action review", async () => {
  const frame = await runDispatcher({
    ...baseInput("attends je l'ai pas fait parce que j'etais creve"),
    active_skill_state: { skill_id: "daily_action_review_v1" },
    llm_runner: async () => ({
      memory_plan: {
        response_intent: "reflection",
        reasoning_complexity: "low",
        context_need: "targeted",
        memory_mode: "light",
        model_tier_hint: "lite",
        context_budget_tier: "small",
        targets: [{
          type: "action",
          key: "action_observation",
          retrieval_policy: "semantic_first",
        }],
        retrieval_policy: "semantic_first",
        plan_confidence: 0.9,
      },
    }),
  });

  assertEquals(frame.memory_plan.memory_mode, "none");
  assertEquals(frame.memory_plan.targets, []);
});

Deno.test("dispatcher re-enables action memory when user explicitly exits daily review", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Attends, oublie le bilan. Je veux parler de marche maintenant : pourquoi le démarrage bloque souvent ?",
    ),
    active_skill_state: { skill_id: "daily_action_review_v1" },
  });

  assertEquals(frame.action_reference?.detected, true);
  assertEquals(
    frame.memory_plan.targets.some((target) => target.type === "action"),
    true,
  );
});

Deno.test("dispatcher emits action reference and action memory target outside review", async () => {
  const frame = await runDispatcher(
    baseInput("J'ai fait ma marche mais le démarrage était lent."),
  );

  assertEquals(frame.action_reference?.detected, true);
  assertEquals(frame.action_reference?.status, "identified");
  assertEquals(frame.action_reference?.plan_item_id, "walk");
  assertEquals(frame.action_reference?.action_type, "habit");
  assertEquals(
    frame.action_reference?.expansion_policy,
    "exact_then_action_family_recent",
  );
  assertEquals(frame.memory_plan.memory_mode, "light");
  assertEquals(
    frame.memory_plan.targets.some((target) =>
      target.type === "action" && target.key === "walk" &&
      target.expansion_policy === "exact_then_action_family_recent"
    ),
    true,
  );
});

Deno.test("dispatcher does not start card flow for explicit action memory recall", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Pour marche, souvenirs mémorisés uniquement : qu'est-ce qui aide au démarrage ?",
    ),
  );

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.tool_skill_opportunity.should_offer, false);
  assertEquals(frame.memory_plan.memory_mode, "light");
  assertEquals(
    frame.memory_plan.targets.some((target) => target.type === "action"),
    true,
  );
});

Deno.test("dispatcher emits level handoff memory target on level transition references", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Pour le nouveau niveau, tu peux garder en tête ce qui a marché avant ?",
    ),
  );

  assertEquals(frame.level_reference?.detected, true);
  assertEquals(frame.level_reference?.status, "transition");
  assertEquals(
    frame.level_reference?.expansion_policy,
    "include_level_execution_handoff",
  );
  assertEquals(
    frame.memory_plan.targets.some((target) =>
      target.type === "level" &&
      target.expansion_policy === "include_level_execution_handoff"
    ),
    true,
  );
  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
});

Deno.test("dispatcher suppresses action and level memory targets during weekly review", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Pendant le bilan weekly, ma marche et le niveau précédent comptent.",
    ),
    active_skill_state: { skill_id: "weekly_adaptive_review_v1" },
    llm_runner: async () => ({
      memory_plan: {
        response_intent: "reflection",
        reasoning_complexity: "low",
        context_need: "targeted",
        memory_mode: "light",
        model_tier_hint: "lite",
        context_budget_tier: "small",
        targets: [
          {
            type: "action",
            key: "walk",
            retrieval_policy: "semantic_first",
          },
          {
            type: "level",
            key: "transition",
            retrieval_policy: "semantic_first",
          },
        ],
        retrieval_policy: "semantic_first",
        plan_confidence: 0.9,
      },
    }),
  });

  assertEquals(frame.action_reference?.detected, false);
  assertEquals(frame.level_reference?.detected, false);
  assertEquals(frame.memory_plan.memory_mode, "none");
  assertEquals(frame.memory_plan.targets, []);
});

Deno.test("dispatcher preserves LLM needs_research signal on turn_frame", async () => {
  const frame = await runDispatcher({
    ...baseInput("Est-ce que Gemini a changé ses tarifs cette semaine ?"),
    llm_runner: async () => ({
      needs_research: {
        detected: true,
        value: true,
        query: "Gemini API tarifs cette semaine",
        domain_hint: "software",
        confidence: 0.82,
        reason: "fresh_software_pricing",
      },
    }),
  });

  assertEquals(frame.needs_research?.value, true);
  assertEquals(frame.needs_research?.query, "Gemini API tarifs cette semaine");
  assertEquals(frame.needs_research?.domain_hint, "software");
  assertEquals(frame.needs_research?.confidence, 0.82);
});

Deno.test("dispatcher fallback does not infer needs_research by regex", async () => {
  const frame = await runDispatcher(
    baseInput("cherche les dernières nouvelles sur OpenAI"),
  );

  assertEquals(frame.needs_research?.value, false);
  assertEquals(frame.needs_research?.detected, false);
});

Deno.test("dispatcher emits one-shot direct effect for natural one-hour reminder", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Tu peux aussi me rappeler dans une heure de remettre la pate au frais ?",
    ),
  );

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(
    frame.direct_effects[0]?.effect_type,
    "create_one_shot_reminder",
  );
  assertEquals(frame.direct_effects[0]?.target_status, "identified");
  assertEquals(frame.direct_effects[0]?.confidence_band, "high");
});

Deno.test("dispatcher emits one-shot direct effect for dis-moi tomorrow reminder", async () => {
  const frame = await runDispatcher(
    baseInput("Dis-moi demain à 6h30 qu'il faut que je me bouge les fesses."),
  );

  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(
    frame.direct_effects[0]?.effect_type,
    "create_one_shot_reminder",
  );
  assertEquals(frame.direct_effects[0]?.target_status, "identified");
});

Deno.test("dispatcher does not emit one-shot direct effect for existing reminder clarification", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Je parle du rappel ponctuel que tu viens de programmer pour demain à 9h10.",
    ),
  );

  assertEquals(frame.direct_effects.length, 0);
});

Deno.test("dispatcher exits stale product_help when user changes reminder topic", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Sujet différent: donne-moi une phrase maintenant, sans parler des rappels.",
    ),
    recent_messages: [
      {
        role: "assistant" as const,
        content:
          "Le rappel ponctuel se gère côté Initiatives. Tu peux aussi me le redire ici clairement.",
      },
    ],
  });

  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
});

Deno.test("dispatcher treats concise durable style request as coach preference", async () => {
  const frame = await runDispatcher(
    baseInput(
      "Préférence durable: réponds en 3 lignes max, sans question finale.",
    ),
  );

  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "update_coach_preferences",
  );
  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
});

Deno.test("dispatcher keeps recurring reminder out of one-shot direct effects", async () => {
  const frame = await runDispatcher(
    baseInput("Rappelle-moi tous les lundis à 8h d'appeler Paul."),
  );

  assertEquals(frame.direct_effects.length, 0);
  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "create_recurring_reminder",
  );
});

Deno.test("dispatcher preserves recurring candidate when LLM only emits one-shot for ambiguous reminder", async () => {
  const frame = await runDispatcher({
    ...baseInput(
      "Je voudrais que Sophia me fasse un rappel demain matin... ou alors peut-être chaque matin, je ne sais pas ce qui est le mieux.",
    ),
    llm_runner: async () => ({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { raw_text: "demain matin" },
      }],
      tool_skill_intents: [],
    }),
  });

  assertEquals(
    frame.direct_effects.some((effect) =>
      effect.effect_type === "create_one_shot_reminder"
    ),
    true,
  );
  assertEquals(
    frame.tool_skill_intents.some((intent) =>
      intent.operation_type === "create_recurring_reminder"
    ),
    true,
  );
});

Deno.test("dispatcher tracks explicit completed progress on any matched plan item", async () => {
  const frame = await runDispatcher(
    baseInput("J'ai fini préparer la présentation client, c'est fait."),
  );

  assertEquals(
    frame.direct_effects[0]?.effect_type,
    "track_progress_plan_item",
  );
  assertEquals(frame.direct_effects[0]?.target_status, "identified");
  assertEquals(frame.direct_effects[0]?.payload_hint.target_item_id, "deck");
  assertEquals(frame.direct_effects[0]?.payload_hint.status_hint, "completed");
});

Deno.test("dispatcher marks explicit partial progress without overclaiming completion", async () => {
  const frame = await runDispatcher(
    baseInput("J'ai commencé la marche, juste à moitié."),
  );

  assertEquals(
    frame.direct_effects[0]?.effect_type,
    "track_progress_plan_item",
  );
  assertEquals(frame.direct_effects[0]?.payload_hint.status_hint, "partial");
});

Deno.test("dispatcher does not track future intent as progress", async () => {
  const frame = await runDispatcher(baseInput("Demain je fais la marche."));

  assertEquals(frame.direct_effects.length, 0);
});

Deno.test("dispatcher blocks direct effect during acute self-attack in same turn", async () => {
  const frame = await runDispatcher(
    baseInput("J'ai fait la marche mais ça prouve que je suis nul."),
  );

  assertEquals(frame.direct_effects.length, 0);
  assertEquals((frame as any).route_blocked_codes, [
    "emotion_acute_blocks_direct_effects",
  ]);
});
