import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDispatcherPrompt,
  buildDispatcherSystemPrompt,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";

Deno.test("dispatcher prompt contract is minimal V1", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Contrat effectif unique"),
    true,
  );
  // Demolition B2C (2026-08-06): la seule lane conversationnelle nommee au
  // contrat est `plan_question`. Les huit autres sont supprimees — voir la
  // garde inversee en fin de fichier.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("skill_signals.plan_question"),
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

// W2.B will delete this: la lane est désactivée en W2.A.
Deno.test({
  name:
    "dispatcher prompt defines feature opportunity entry signals",
  ignore: true,
}, () => {
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

// W2.B will delete this: la lane est désactivée en W2.A.
Deno.test({
  name:
    "dispatcher prompt enforces feature_opportunity negative boundary and current-turn priority",
  ignore: true,
}, () => {
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

// W2.B will delete this: la lane est désactivée en W2.A.
Deno.test({
  name:
    "dispatcher prompt keeps explicit memorization out of feature_opportunity",
  ignore: true,
}, () => {
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

// W2.B will delete this: la lane est désactivée en W2.A.
Deno.test({
  name:
    "dispatcher prompt routes recurring reminder requests to initiatives",
  ignore: true,
}, () => {
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

// W2.B will delete this: la lane est désactivée en W2.A.
Deno.test({
  name:
    "dispatcher prompt keeps initiatives away from active plan items and launch blockers",
  ignore: true,
}, () => {
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

Deno.test("dispatcher prompt re-arms a pending write clarification (chantier O4)", () => {
  // QA PHASE C — GARDE A DEUX SENS. Les regles 3g / 3g-ter decrivent comment
  // REPRENDRE une ecriture en suspens; elles ne partent plus que si l'etat
  // existe. Le test doit donc prouver les DEUX sens: presentes quand l'etat est
  // la, ABSENTES sinon. Un test qui ne verifierait que le premier passerait sur
  // un prompt qui les envoie toujours — c'est-a-dire le defaut d'avant.
  const armed = buildDispatcherSystemPrompt({
    keelStudent: true,
    pendingDirectEffectClarification: true,
  });
  assertEquals(armed.includes("pending_direct_effect_clarification"), true);
  assertEquals(armed.includes("target_switch_ambiguous"), true);

  const deferred = buildDispatcherSystemPrompt({
    keelStudent: true,
    pendingSafetyDeferredReminder: true,
  });
  assertEquals(deferred.includes("pending_safety_deferred_reminder"), true);

  // FAUSSE PREMISSE: sur un tour nominal, les deux reprises ne partent pas.
  const nominal = buildDispatcherSystemPrompt({ keelStudent: true });
  assertEquals(nominal.includes("pending_direct_effect_clarification"), false);
  assertEquals(nominal.includes("pending_safety_deferred_reminder"), false);
  // Et le gain est reel, pas cosmetique.
  assertEquals(armed.length - nominal.length > 3000, true);
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
      "session_style_commitment_hint est un champ RACINE du TurnFrame",
    ),
    true,
  );
  // W2.A: la règle ne dépend plus de feature_opportunity (lane supprimée) —
  // elle est portée par sa propre section TRANSVERSE, valable quel que soit
  // l'owner du tour.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "QUEL QUE SOIT l'owner du tour (presence active, reponse normale, coaching, safety)",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("feature_opportunity"),
    true,
    "le prompt garde l'interdiction explicite d'émettre ce signal",
  );
  // Session-only: jamais une préférence durable (BF-PREF-01).
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Session-only: ce n'est jamais une preference durable",
    ),
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

// W2.B will delete this: la lane est désactivée en W2.A.
Deno.test({
  name:
    "dispatcher prompt: capacite produit inexistante ⇒ feature_opportunity, zero speculation (P5-H, alex-untested20 T6)",
  ignore: true,
}, () => {
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

// ── P6-E (vague 21) ─────────────────────────────────────────────────────────

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

Deno.test("dispatcher prompt: jours nommes denombrables = fan-out once×N, jamais recurring (P12-B, nina-p10reval R1-B01)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "DISTINCTION JOURS NOMMES (nina-p10reval R1-B01",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "UN create_one_shot_reminder PAR jour nomme",
    ),
    true,
  );
  // Anti-faux-positif ancre: le marqueur d'habitude garde la recurrence.
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "'TOUS les jeudis et vendredis a 18h' reste recurring",
    ),
    true,
  );
});

Deno.test("dispatcher prompt: mention incidente d'un rappel existant = aucun effet (P12-B, eva-hard25 R1-B07)", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "MENTION INCIDENTE D'UN RAPPEL EXISTANT (eva-hard25 R1-B07",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "jamais infere d'une mention",
    ),
    true,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// ASSEMBLAGE CONDITIONNEL — ce qu'un ELEVE KEEL recoit, et ce qu'il ne recoit
// plus.
//
// Le prompt systeme part INTEGRALEMENT a chaque tour. Il portait la doctrine
// de trois lanes que `routers.ts` ferme a un eleve de coach
// (`product_help`, `coaching_recommendation`, `plan_realignment`) et celle
// d'un effet que KEEL n'utilise pas (`track_progress_plan_item`, regle 3k) —
// mesure du 06/08: 21 097 tokens de prompt systeme, dont ~6 300 inutilisables
// sur un tour KEEL, plus ~2 200 d'exemples et de forme attendue cote payload.
//
// Ces tests figent les DEUX cotes de la branche. Sans le second, la branche
// legacy derive en silence et casse le produit grand public, qui tourne
// encore depuis ce meme code sur un autre projet Supabase.
// ───────────────────────────────────────────────────────────────────────────

Deno.test("legacy assembly is the exported constant, unchanged", () => {
  assertEquals(
    buildDispatcherSystemPrompt({ keelStudent: false }),
    DISPATCHER_V2_SYSTEM_PROMPT,
  );
});

Deno.test("a payload built without the flag stays byte-identical to the legacy one", () => {
  const args = {
    user_message: "j'ai fait ma marche",
    recent_messages: [{ role: "user", content: "salut" }],
    plan_snapshot: { items: [] },
    keel_plan_context: null,
  };
  assertEquals(
    buildDispatcherPrompt(args),
    buildDispatcherPrompt({ ...args, keel_student: false }),
  );
});

// ── GARDE INVERSÉE (démolition B2C, 2026-08-06) ──────────────────────────────
//
// Les huit lanes conversationnelles du produit d'avant sont supprimées. Cette
// garde remplace les ~26 cas qui prouvaient leur doctrine : elle prouve
// désormais qu'elles ne REVIENNENT pas dans le prompt. Même forme que
// `turn_intent_arbitrator stays deleted` (router/user_facing_messages_
// architecture_test.ts), le précédent méthodologique du dépôt.
//
// CONDITION DE DÉSARMEMENT : si une de ces lanes est un jour réintroduite
// délibérément, ce test doit être amendé DANS LE MÊME LOT, jamais supprimé en
// silence.
Deno.test("deleted conversation lanes stay deleted — the prompt never names them again", () => {
  const prompt = buildDispatcherSystemPrompt({ keelStudent: true });
  const legacy = buildDispatcherSystemPrompt({ keelStudent: false });
  for (
    const lane of [
      "skill_signals.product_help",
      "skill_signals.coaching_recommendation",
      "skill_signals.plan_realignment",
      "presence_conversation = le user",
      "Categories coaching_recommendation",
    ]
  ) {
    assertEquals(prompt.includes(lane), false, `KEEL prompt names ${lane}`);
    assertEquals(legacy.includes(lane), false, `legacy prompt names ${lane}`);
  }
  // Les deux assemblages ont CONVERGÉ: il n'y a plus qu'une audience.
  assertEquals(prompt.length > 0, true);
});
