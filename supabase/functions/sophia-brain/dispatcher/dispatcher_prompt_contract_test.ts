import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";

Deno.test("dispatcher prompt contract is minimal V1", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Contrat effectif unique"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("skill_signals.product_help"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Daily/weekly ne sont pas routes"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "ancien champ de scoring est toujours present",
    ),
    false,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("opportunite de flow signale"),
    false,
  );
});

Deno.test("dispatcher prompt separates product help from coaching recommendation", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "product_help repond aux questions produit",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "coaching_recommendation n'est pas un clarificateur generique",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "follow-up immediat d'une explication/comparaison produit",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "blocage personnel identifiable",
    ),
    true,
  );
});

Deno.test("dispatcher prompt defines feature opportunity entry signals", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Axes coach_preferences supportes: coach.tone",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "des qu'il y a une frustration sur le style de Sophia",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "un soutien recurrent, un message regulier",
    ),
    true,
  );

  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      user_message: string;
      expected: {
        skill_signals?: {
          feature_opportunity?: {
            detected?: boolean;
            context?: {
              feature?: string;
              priority_reason?: string;
            };
          };
        };
      };
    }>;
  };
  const recurring = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("un truc recurrent de Sophia pourrait m'aider")
  );
  const tone = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("Sophia soit trop douce")
  );
  const challenge = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("challenges trop fort")
  );

  assertEquals(recurring?.expected.skill_signals?.feature_opportunity?.context
    ?.feature, "initiatives");
  assertEquals(tone?.expected.skill_signals?.feature_opportunity?.context
    ?.feature, "coach_preferences");
  assertEquals(challenge?.expected.skill_signals?.feature_opportunity?.context
    ?.feature, "coach_preferences");
});

Deno.test("dispatcher prompt enforces feature_opportunity negative boundary and current-turn priority", () => {
  // feature_opportunity must not swallow plan restructuring nor emotional distress.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Frontiere feature_opportunity (exclusions strictes)",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "n'est jamais feature_opportunity: c'est plan_realignment",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "n'est jamais feature_opportunity: laisse la reponse normale accueillir",
    ),
    true,
  );
  // Current-turn intent overrides prior product/feature momentum (recent_messages / previous_turn_frame).
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "prime sur la dynamique des tours precedents",
    ),
    true,
  );
});

Deno.test("dispatcher prompt defines plan realignment and boundaries", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("skill_signals.plan_realignment"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "product_execution_allowed=false",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "ne s'active pas pour une action precise bloquee",
    ),
    true,
  );

  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      user_message: string;
      expected: {
        skill_signals?: {
          plan_realignment?: {
            detected?: boolean;
            context?: {
              drift_type?: string;
              scope?: string;
              product_execution_allowed?: boolean;
            };
          };
          coaching_recommendation?: { detected?: boolean };
          product_help?: { detected?: boolean };
        };
      };
    }>;
  };
  const drift = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("pas du tout suivi mon plan")
  );
  const late = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("pris trop de retard sur mon plan")
  );
  const action = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("Cette action est trop lourde")
  );
  const product = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("C'est quoi une carte de defense")
  );

  assertEquals(drift?.expected.skill_signals?.plan_realignment?.context
    ?.drift_type, "lost_rhythm");
  assertEquals(late?.expected.skill_signals?.plan_realignment?.context
    ?.product_execution_allowed, false);
  assertEquals(action?.expected.skill_signals?.coaching_recommendation
    ?.detected, true);
  assertEquals(product?.expected.skill_signals?.product_help?.detected, true);
});

Deno.test("dispatcher prompt preserves product help plus one-shot reminder multi-intent", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "question produit et une demande explicite de rappel ponctuel",
    ),
    true,
  );

  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: Array<Record<string, unknown>>;
        skill_signals?: Record<string, unknown>;
      };
    }>;
  };
  const example = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("Question produit") &&
    item.user_message.includes("rappelle-moi demain a 9h")
  );

  assertEquals(Boolean(example), true);
  assertEquals(
    example?.expected.direct_effects?.[0]?.effect_type,
    "create_one_shot_reminder",
  );
  assertEquals(
    (example?.expected.skill_signals?.product_help as { detected?: boolean })
      ?.detected,
    true,
  );
});

Deno.test("dispatcher prompt uses canonical one-shot reminder rules", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "direct_effects.create_one_shot_reminder",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.instruction_hint doit contenir uniquement ce qu'il faut rappeler",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "la lane globale gere le direct effect",
    ),
    true,
  );
});

Deno.test("dispatcher prompt examples do not teach legacy routing", () => {
  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as { doctrine_examples: Array<{ expected: Record<string, unknown> }> };

  for (const example of parsed.doctrine_examples) {
    assertEquals(
      ["tool", "skill", "intents"].join("_") in example.expected,
      false,
    );
    assertEquals(["flow", "opportunity"].join("_") in example.expected, false);
    assertEquals(
      ["normal", "reply", "fit", "score"].join("_") in example.expected,
      false,
    );
  }
});

Deno.test("dispatcher prompt caps substance urge below safety high", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "reserves au danger pour la vie ou l'integrite physique",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "urge de substance ou un risque de rechute",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "plafonne risk_band a medium",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "substance_use_urge, imminent_relapse_risk ou time_critical_urge",
    ),
    true,
  );
});

Deno.test("dispatcher prompt routes plan reading away from plan_realignment", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "n'est jamais plan_realignment: c'est une lecture, pas une rupture",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "rappelle-moi mes actions en cours",
    ),
    true,
  );
});

Deno.test("dispatcher prompt keeps explicit memorization out of feature_opportunity", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "demande explicite de memorisation",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "n'est jamais feature_opportunity, meme si elle decrit un moment recurrent",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "La memorisation est automatique cote Sophia; ne propose pas une initiative a la place.",
    ),
    true,
  );
});

Deno.test("dispatcher prompt keeps presence-first during acute craving windows", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Fenetre de rupture en cours"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "sans demander quel levier ou quelle methode utiliser, ce n'est pas coaching_recommendation",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "la reponse normale accueille d'abord (presence, co-regulation, ancrage court)",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Ne l'active pas sur la seule description d'un craving ou d'une urge aigu en cours sans demande de levier",
    ),
    true,
  );
});

Deno.test("dispatcher prompt teaches canonical track_progress payload contract", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.status_hint parmi completed|partial|missed uniquement",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.target_item_id (copie exacte de active_action_candidates_for_direct_effects[].plan_item_id)",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Le report de progres compte quel que soit le ton",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Un imperatif de log sur une action du plan n'est pas une demande de memorisation",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Ce direct effect est transverse",
    ),
    true,
  );
});

Deno.test("dispatcher prompt separates regret from report and teaches explicit correction", () => {
  // 3g: un enonce affectif/contrefactuel (regret, frustration, souhait
  // retrospectif) n'est jamais un report de progres (BF-INTAKE-04 R2-B01).
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Un enonce affectif ou contrefactuel sur une action n'est jamais un report de progres",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "revenir emotionnellement sur une action dont le resultat a deja ete rapporte dans la conversation ne produit aucun nouveau direct effect",
    ),
    true,
  );
  // 3h: la correction explicite d'un report deja fait passe par
  // payload_hint.correction=true (seule voie qui traverse le guard
  // contradicts_same_day_evidence).
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("payload_hint.correction=true"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "ne re-emets pas un statut oppose sur une action deja rapportee",
    ),
    true,
  );
});

Deno.test("dispatcher prompt track_progress examples use canonical status enum and item id", () => {
  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      expected: {
        direct_effects?: Array<{
          effect_type?: string;
          payload_hint?: Record<string, unknown>;
        }>;
      };
    }>;
  };

  const trackExamples = parsed.doctrine_examples
    .flatMap((example) => example.expected.direct_effects ?? [])
    .filter((effect) => effect.effect_type === "track_progress_plan_item");
  assertEquals(trackExamples.length >= 2, true);
  for (const effect of trackExamples) {
    const status = effect.payload_hint?.status_hint;
    assertEquals(
      status === "completed" || status === "partial" || status === "missed",
      true,
    );
    assertEquals(typeof effect.payload_hint?.target_item_id, "string");
  }
});

Deno.test("dispatcher prompt routes recurring reminder requests to initiatives", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "n'emet JAMAIS create_one_shot_reminder: c'est un signal skill_signals.feature_opportunity (initiatives)",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "le user demande une relance ou un rappel recurrent",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "c'est initiatives, jamais direct_effects.create_one_shot_reminder",
    ),
    true,
  );

  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: Array<{ effect_type?: string }>;
        skill_signals?: Record<string, { detected?: boolean }>;
      };
    }>;
  };
  const recurring = parsed.doctrine_examples.find((example) =>
    example.user_message.includes("relancer tous les soirs")
  );
  assertEquals(Boolean(recurring), true);
  assertEquals(recurring?.expected.direct_effects?.length ?? -1, 0);
  assertEquals(
    recurring?.expected.skill_signals?.feature_opportunity?.detected,
    true,
  );
});

Deno.test("dispatcher prompt treats reminder verification questions as non-creation", () => {
  // Chantier P (2026-07-06): la regle couvre desormais verification, statut
  // ET recap, plus la re-emission depuis l'historique (message courant only).
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Une question de verification, de statut ou de RECAP sur les rappels",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "n'est jamais une demande de creation: n'emets pas create_one_shot_reminder",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "L'effet se rapporte au MESSAGE COURANT uniquement",
    ),
    true,
  );
});

Deno.test("dispatcher prompt treats track verification questions and vague targets as non-writes", () => {
  // Paul r1 T15 (question de statut re-committee) + T8 (anaphore committee
  // sans confirmation): la doctrine doit interdire l'emission sur une
  // question, et degrader la confiance sur une cible devinee.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Une question de verification ou de statut",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "n'est jamais un nouveau report: n'emets aucun track_progress_plan_item",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Un statut se lit dans le contexte, il ne se re-ecrit pas",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "sans referent clair dans le message ou le tour immediatement precedent",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "target_status=inferred et confidence_band=medium au plus",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Une cible devinee n'est jamais identified/high",
    ),
    true,
  );
});

Deno.test("dispatcher prompt keeps initiatives away from active plan items and launch blockers", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Si un item actif du plan couvre deja le sujet",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "laisse la reponse faire progresser l'item existant du plan",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Un blocage de demarrage sur une action active du plan",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "prime sur initiatives meme si le contexte est recurrent: priorise skill_signals.coaching_recommendation",
    ),
    true,
  );
});

Deno.test("dispatcher prompt carries night-time anchoring and cardinality contract", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Regle nocturne"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "'demain' designe strictement le jour civil suivant (J+1), jamais la date du jour",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.cardinality est obligatoire et vaut 'once'",
    ),
    true,
  );
});

Deno.test("dispatcher prompt keeps presence-first altitude on emotional lows (eva-r1 T1)", () => {
  // Charge emotionnelle basse sans demande de levier => reponse normale
  // d'accueil, pas de signal coaching par reflexe (generalisation de la
  // regle presence-first du craving aigu).
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Meme regle d'altitude pour un tour a charge emotionnelle basse",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "la reponse normale accueille et valide d'abord",
    ),
    true,
  );
});

Deno.test("dispatcher prompt re-arms a pending write clarification (chantier O4)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "pending_direct_effect_clarification",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "re-emets l'effet direct COMPLET correspondant avec le payload canonique",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "c'est la suite de la meme demande, pas une nouvelle intention",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Si le message courant passe a autre chose, ignore ce contexte",
    ),
    true,
  );
});

Deno.test("dispatcher prompt anchors retro-dated reports on a resolved ISO date_hint (eva-r2 B01, rose-r5 B06)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Format strict: date ISO locale YYYY-MM-DD du jour vise",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Jamais de mot relatif (\"hier\", \"ce soir\") dans date_hint",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Report d'aujourd'hui: omets date_hint",
    ),
    true,
  );
  // L'exemple doctrine n'enseigne plus le format relatif.
  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: Array<{ payload_hint?: { date_hint?: string } }>;
      };
    }>;
  };
  const retro = parsed.doctrine_examples.find((example) =>
    example.user_message.includes("fait hier soir")
  );
  assertEquals(Boolean(retro), true);
  const dateHint = retro?.expected.direct_effects?.[0]?.payload_hint
    ?.date_hint ?? "";
  assertEquals(dateHint.includes("YYYY-MM-DD"), true);
  assertEquals(dateHint === "hier soir", false);
});

Deno.test("dispatcher prompt requires a verbatim target_evidence quote and defines target retarget (G1/G2, alex-r5 T7/T8)", () => {
  // 3d-ter: la cible identifiee exige une citation verbatim du user.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.target_evidence: OBLIGATOIRE avec target_status=identified",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "CITATION EXACTE, copiee mot pour mot",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Si tu ne peux citer AUCUN mot qui nomme une action precise",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("n'invente pas de citation"),
    true,
  );
  // 3h-bis: correction de cible = retarget structurel, jamais un simple accuse.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Correction de CIBLE"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.retarget_from = plan_item_id de l'action erronee",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Ne reponds JAMAIS a une correction de cible par un simple accuse sans emettre cet effet",
    ),
    true,
  );
  // L'exemple doctrine porte la citation.
  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: Array<{ payload_hint?: { target_evidence?: string } }>;
      };
    }>;
  };
  const retro = parsed.doctrine_examples.find((example) =>
    example.user_message.includes("sas de decompression")
  );
  assertEquals(
    retro?.expected.direct_effects?.[0]?.payload_hint?.target_evidence,
    "sas de decompression sans fumer",
  );
});
