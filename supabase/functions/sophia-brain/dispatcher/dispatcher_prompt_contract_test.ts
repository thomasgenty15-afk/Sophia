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
  const tooLight = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("trop mou, corse-le")
  );
  const tooHeavy = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("Le plan est trop lourd cette semaine")
  );

  // paul-r7 B04: qui declenche decide la route (user → coaching, Sophia → initiatives).
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("QUI DECLENCHE decide la route"),
    true,
  );

  // nina-r4 B03 / paul-r6 B03: la doctrine de direction est ancree et les deux
  // exemples opposes ne collapsent jamais l'un sur l'autre.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "drift_type suit la DIRECTION reelle exprimee",
    ),
    true,
  );
  assertEquals(
    tooLight?.expected.skill_signals?.plan_realignment?.context?.drift_type,
    "plan_too_light",
  );
  assertEquals(
    tooHeavy?.expected.skill_signals?.plan_realignment?.context?.drift_type,
    "plan_too_heavy",
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

Deno.test("dispatcher prompt keeps coaching out of ungrounded emotional confessions (rose-multiflow B01)", () => {
  // Positif: la cue de vulnerabilite prime sur le moment concret d'echec.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "La cue de VULNERABILITE prime sur le contenu concret",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "un moment/mission concret d'echec",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "le user ne doit jamais avoir a recadrer pour etre entendu",
    ),
    true,
  );
  // Anti-faux-positif: le pull explicite garde l'entree coaching.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      'un pull explicite ("je suis preneuse"',
    ),
    true,
  );
});

Deno.test("dispatcher prompt exits presence flow on transactional read (paul-triflow15 T10)", () => {
  // Positif: une lecture d'etat pendant un flow presence actif est un topic_change,
  // jamais un maintain — la reponse normale possede la projection plan/rappels.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Y COMPRIS une demande d'INFORMATION ou de LECTURE transactionnelle",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes('"c\'est quoi mes actions en cours ?"'),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "JAMAIS un maintain, meme a conversation_risk=0",
    ),
    true,
  );
  // Anti-faux-positif: la demande de methode et le retour emotionnel restent maintain.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "une demande de METHODE sur le sujet en cours ou un retour emotionnel au meme sujet reste maintain",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      'une demande de METHODE ("concretement je fais quoi',
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
      "Une question de VERIFICATION, de STATUT ou de RECAP sur les rappels",
    ),
    true,
  );
  // R-1 (BF-STATUS-01): la question de statut devient un intent 'status'
  // execute par le runtime (lecture DB) — plus jamais un tour muet ni un
  // create nu. Ancre mise a jour deliberement.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "emets create_one_shot_reminder avec payload_hint.intent='status'",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "il est bien enregistre ?",
    ),
    true,
  );
  // R-2 (eva-g16 B01): regle du pronom sur le decalage + replace explicite.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("REGLE DU PRONOM (eva-g16 B01"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.intent='replace'",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.replace_target_label",
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

Deno.test("dispatcher prompt: demande explicite de potion = coaching_recommendation, jamais un rappel substitue (P8-B, eva-hard23 T6/T7)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("DEMANDE EXPLICITE DE POTION"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "n'emets JAMAIS create_one_shot_reminder comme substitut d'une potion",
    ),
    true,
  );
  // Anti-faux-positif: la vraie co-demande de rappel reste servie.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "'et rappelle-moi a 22h de la faire') garde son create normal",
    ),
    true,
  );
});

Deno.test("dispatcher prompt: co-demande de N rappels = N entrees direct_effects (P8-A, rose-p7verify T13/T14)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("CO-DEMANDE DE N RAPPELS"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "emets UNE entree direct_effects.create_one_shot_reminder PAR rappel",
    ),
    true,
  );
  // Anti-faux-positif dans le contrat: alternative « jeudi ou samedi » = UNE
  // entree; recurrence = zero entree.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "reste UNE entree (clarify du choix)",
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

Deno.test("dispatcher prompt: un fragment temporel incident dans une recherche n'est jamais un rappel (eva-r9 B02)", () => {
  // Positif: la definition d'explicite exige un acte de rappel adresse a Sophia.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "EXPLICITE = un acte de rappel adresse a Sophia",
    ),
    true,
  );
  // Contre-exemple verbatim: recherche + « ce soir » incident → aucun effet.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "que je puisse tester ce soir",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "decrit le moment ou le USER agira, pas une notification a programmer",
    ),
    true,
  );
  // Anti-faux-positif: la demande imperative reste couverte par le bloc.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("'rappelle-moi'"),
    true,
  );
});

Deno.test("dispatcher prompt: un recall de session n'est jamais product_help (alex-r3 B01)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "c'etait quoi deja la potion que tu m'avais conseillee ?",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "la reponse vient des decisions de session, pas d'une explication produit",
    ),
    true,
  );
  // Anti-faux-positif: comprendre le produit reste product_help.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "\"a quoi sert une potion ?\" / \"ou je trouve mes potions ?\" restent product_help",
    ),
    true,
  );
});

Deno.test("dispatcher prompt forbids memory_none on confided-fact recall", () => {
  // Positif: la regle de restitution existe et interdit memory_none.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("RESTITUTION DE FAIT CONFIE"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("memory_mode=none est INTERDIT"),
    true,
  );
  // La regle exige un chargement large de la memoire durable.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "mets au minimum memory_mode=broad avec context_need=broad",
    ),
    true,
  );
  // Anti-faux-positif: les questions produit ne forcent pas la memoire.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "ne s'applique pas aux questions sur le produit",
    ),
    true,
  );
});

Deno.test("dispatcher prompt captures session style constraints at the turn frame root (P1-2, alex-cpr B04 / eva-cpr B03)", () => {
  // La regle vit au champ RACINE: un signal skill non-detected est droppé par
  // la normalisation, la contrainte de style doit survivre sans lui.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "session_style_commitment_hint (champ RACINE du TurnFrame",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "MEME si aucun signal feature_opportunity n'est detecte",
    ),
    true,
  );
  // Session-only: jamais une préférence durable (BF-PREF-01).
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Ce hint est session-only"),
    true,
  );
});

// ── P5-H (vague 13/07 soir bis) ─────────────────────────────────────────────

Deno.test("dispatcher prompt: mise en doute factuelle sante ⇒ needs_research (P5-H, nina-global20 T2)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Une MISE EN DOUTE explicite d'une affirmation factuelle en domaine sante/nutrition/science",
    ),
    true,
  );
  // Anti-faux-positif conservé: question personnelle/coaching → false.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "ou de coaching sans besoin d'infos externes → value=false",
    ),
    true,
  );
});

Deno.test("dispatcher prompt: depot reflexif sans pull ⇒ rester, jamais proposer (P5-H, alex-untested20 T8)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Un depot reflexif auto-derisoire",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "le doute bascule vers rester (presence/accueil), jamais vers proposer",
    ),
    true,
  );
  // Anti-faux-positif conservé: pull explicite → coaching.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      'un pull explicite ("je suis preneuse", "tu ferais quoi ?", "aide-moi") route coaching_recommendation normalement',
    ),
    true,
  );
});

Deno.test("dispatcher prompt: capacite produit inexistante ⇒ feature_opportunity, zero speculation (P5-H, alex-untested20 T6)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Une demande de CAPACITE produit qui n'existe pas",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "JAMAIS une reponse normale qui specule sur des integrations",
    ),
    true,
  );
});

Deno.test("dispatcher prompt: devalorisation implicite ⇒ accueil d'abord, pas de pitch (P5-H, rose-hard17 T1)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "La devalorisation IMPLICITE compte aussi",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "aucun pitch de dispositif dans la meme reponse",
    ),
    true,
  );
});

// ── P6-E (vague 21) ─────────────────────────────────────────────────────────

Deno.test("dispatcher prompt: recap read-only jamais plan_realignment, mutation exigee (P6-E, alex-untested21 R1-B01)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "plan_realignment exige une intention de MUTATION du plan",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "l'expression d'un FLOU n'en est pas une",
    ),
    true,
  );
  // Anti-faux-positif conservé.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      '"allege mon plan, c\'est devenu trop lourd" reste plan_realignment',
    ),
    true,
  );
});

Deno.test("dispatcher prompt: retractation d'un fait confie = accuse d'oubli, jamais plan_realignment (P6-E, eva-hard21 R1-B02)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Une RETRACTATION d'un fait confie",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "JAMAIS plan_realignment quand le fait retire n'est pas un item du plan actif",
    ),
    true,
  );
});

Deno.test("dispatcher prompt: capacite produit explicite preempte presence pour le FAIT (P6-E, paul-hard21 R1-B03)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "question de CAPACITE PRODUIT explicite",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "La detresse PURE sans question produit reste presence",
    ),
    true,
  );
});

// ── P7-A (vague 22) ─────────────────────────────────────────────────────────

Deno.test("dispatcher prompt: risque de rechute en plan de sevrage jamais classe ideation (P7-A, rose-hard19 R1-B02)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("RISQUE DE RECHUTE ≠ IDEATION"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "designent la SUBSTANCE, pas la vie",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "JAMAIS suicidal_ideation_passive",
    ),
    true,
  );
});

Deno.test("dispatcher prompt: clause produit desambiguise « tout arreter / supprimer mon compte » (P7-A, rose-untested22 R1-B01)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("CLAUSE PRODUIT DESAMBIGUISANTE"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "l'ideation exige un referent VIE/soi, pas un artefact produit",
    ),
    true,
  );
  // Anti-faux-positif ancre: « tout arreter » sans referent produit garde le
  // traitement detresse normal.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "SEUL, sans referent produit",
    ),
    true,
  );
});
