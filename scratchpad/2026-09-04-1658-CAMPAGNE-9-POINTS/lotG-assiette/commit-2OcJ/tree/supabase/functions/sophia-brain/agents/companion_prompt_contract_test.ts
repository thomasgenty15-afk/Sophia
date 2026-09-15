import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildCompanionSystemPrompt,
  parseCompanionDeliveryDirective,
} from "./companion.ts";

Deno.test("companion normal reply prompt stays conversation-first and product-thin", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  // W9: le bloc RESPONSE_LANGUAGE (~220 caractères) est désormais ajouté en
  // queue de TOUS les prompts composés. La ceinture de budget porte sur le
  // corps composé — c'est lui qui grossit à chaque nouvelle règle — et non sur
  // ce bloc de langue de taille fixe. Seuil inchangé: 13000.
  const bodyWithoutLanguageBlock = prompt.slice(
    0,
    prompt.indexOf("RESPONSE_LANGUAGE:"),
  );
  assert(prompt.includes("RESPONSE_LANGUAGE:"));
  assert(bodyWithoutLanguageBlock.length < 13000);
  assert(prompt.includes("CORE_COMPANION"));
  assert(prompt.includes("OUTPUT_STYLE"));
  assert(prompt.includes("NORMAL_REPLY_POLICY"));
  assert(prompt.includes("LOOP_RECOVERY"));
  assert(prompt.includes("CONTEXT_RULES"));
  assert(prompt.includes("TASK_OVERLAYS"));
  assert(prompt.includes("SILENCE_AND_REACTIONS"));
  assert(prompt.includes("Reconstruis le fil depuis le fil rouge/contexte"));
  assert(prompt.includes("PLATFORM_SKETCH_FOR_NORMAL_REPLY"));
  // Retrait résidus 2026-08-08: Ressources (cartes/potions) et Initiatives
  // (messages récurrents) n'existent plus — le contrat vérifie leur ABSENCE.
  assert(prompt.includes("Sections à nommer: Plan, Inspirations"));
  assert(!prompt.includes("Plan, Ressources, Inspirations, Initiatives"));
  assert(!prompt.includes("Pour ce cas, dis Initiatives"));
  assert(
    prompt.includes(
      "Ne présente pas Soutien, Missions ou Habitudes comme des sections de destination",
    ),
  );
  assert(
    prompt.includes(
      "Ce n'est pas du coaching par défaut",
    ),
  );
  assert(
    prompt.includes(
      "amie intelligente + IA experte",
    ),
  );
  assert(prompt.includes("Interdiction des choix A/B non demandés"));
  assert(
    prompt.includes(
      "Interdiction des relances coaching non demandées",
    ),
  );
  assert(prompt.includes("présence d'esprit conversationnelle"));
  assert(prompt.includes("réponse tourne en rond"));
  assert(prompt.includes("reconnais une possible perte de fil côté Sophia"));
  assert(prompt.includes("reprends le dernier point certain"));
  // Politique default-deny (chantier O5): la vérité des écritures est le
  // contrat d'outcome, jamais l'intuition conversationnelle.
  assert(
    prompt.includes(
      "DIRECT_EFFECT_CONFIRMATION_CONTEXT est la seule vérité",
    ),
  );
  assert(
    prompt.includes(
      'jamais "c\'est fait/noté/enregistré/programmé/corrigé"',
    ),
  );
  assert(prompt.includes("pose clarify_question si présente"));
  assert(prompt.includes("sophia_delivery:reaction_only"));
  assert(prompt.includes("sophia_delivery:no_response"));
  assert(prompt.includes('"exactement"'));
  assert(
    prompt.includes(
      "Jamais réaction seule si question",
    ),
  );
  assert(
    prompt.includes(
      "nouveau plan Sophia",
    ),
  );
  assert(
    prompt.includes(
      "accorde les adjectifs et participes au féminin",
    ),
  );
  assert(
    prompt.includes(
      "applique-le au dernier contenu actif",
    ),
  );
  assert(
    prompt.includes(
      "garde le référent sauf changement clair",
    ),
  );
  assert(
    prompt.includes(
      "Mentionner une action, fatigue, résistance, réussite ou routine ne veut pas dire demander à agir",
    ),
  );
  assert(
    prompt.includes(
      "pas de micro-action immédiate",
    ),
  );
  assert(
    prompt.includes(
      "Chat normal ne crée, configure, active, prépare, lance ni modifie rien",
    ),
  );
  assert(prompt.includes("Frontière plateforme"));
  // Retrait résidus 2026-08-08: cartes, potions et rappels récurrents n'existent
  // plus — le contrat vérifie désormais leur ABSENCE du prompt.
  assert(!prompt.includes("cartes de défense/attaque actives"));
  assert(!prompt.includes("potion active"));
  assert(
    prompt.includes("Ne propose pas automatiquement un outil Sophia"),
  );
  assert(prompt.includes("Priorité au dernier message"));
  assert(prompt.includes("accueille l'émotion d'abord"));
  assert(
    prompt.includes(
      "sans la réinterpréter en question produit ni prolonger le sujet précédent",
    ),
  );
  assert(prompt.includes("Point/récap léger"));
  assert(prompt.includes("Date/heure"));
  assert(prompt.includes("Âge"));
  assert(prompt.includes("Sexe/genre"));
  assert(prompt.includes("Mémoire"));
  assert(prompt.includes("Questions sur fonctionnalités"));
  // nina-r3 B03: pont émotionnel au tour qui suit une détresse.
  assert(prompt.includes("Pont post-détresse"));
  assert(prompt.includes("jamais de réponse 100% transactionnelle"));
  // eva-r5 B03 / paul-r5 B04: adhérence des préférences de session à tous les tours.
  assert(prompt.includes("Une préférence de style exprimée en session"));
  assert(prompt.includes("y compris en mode soutien"));
  // eva-r7 B01: la contrainte de style prime sur le reflexe de warmth.
  assert(prompt.includes("Une contrainte de style acceptée en session"));
  assert(prompt.includes("zéro emoji tant qu'elle tient"));
  assertEquals(prompt.includes("préparer une nouvelle version"), false);
  assertEquals(prompt.includes("POLYVALENCE ET ASSISTANCE"), false);
  assertEquals(prompt.includes("STYLE ET RYTHME"), false);
  assertEquals(prompt.includes("CONSIGNES CONTEXTUELLES ET ADD-ONS"), false);
  assertEquals(prompt.includes(["status", "recap"].join("_")), false);
  assertEquals(prompt.includes(["emotional", "repair"].join("_")), false);
  assertEquals(prompt.includes(["demotivation", "repair"].join("_")), false);
});

Deno.test("companion normal reply keeps social register after a closed flow", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Le bilan de la semaine est clos.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  // Invariant registre post-flow: politesse/au revoir apres un flow terminé
  // -> reponse sociale breve, sans re-annonce de cloture ni re-synthese du bilan.
  assert(prompt.includes("Après un flow terminé"));
  assert(prompt.includes("rends la politesse en une phrase courte"));
  assert(
    prompt.includes(
      "sans ré-annoncer la clôture ni re-synthétiser le bilan terminé",
    ),
  );
});

Deno.test("companion normal reply receives recent visible history for loop recovery", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: true,
    lastAssistantMessage: "Parfait, on continue ?",
    history: [
      { role: "system", content: "internal state" },
      { role: "assistant", content: "Parfait, on continue ?" },
      { role: "user", content: "oui" },
      { role: "assistant", content: "Ok, on continue ?" },
      { role: "user", content: "go" },
    ],
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("HISTORIQUE RECENT VISIBLE"));
  assert(prompt.includes("détection de répétition conversationnelle"));
  assert(prompt.includes("- Sophia: Parfait, on continue ?"));
  assert(prompt.includes("- User: oui"));
  assert(prompt.includes("- Sophia: Ok, on continue ?"));
  assert(prompt.includes("- User: go"));
  assertEquals(prompt.includes("internal state"), false);
  assert(
    prompt.includes(
      "Ne les utilise pas pour inventer un effet produit",
    ),
  );
});

Deno.test("companion normal reply explains active action and platform context usage", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: [
      "=== REPÈRES TEMPORELS ===",
      "Nous sommes mercredi 17 juin 2026, 18:20, Europe/Paris.",
      "=== SNAPSHOT COURT PLAN / ACTIONS ACTIVES (TOUJOURS DISPONIBLE) ===",
      "Actions actives/disponibles:",
      "- Session focus courte (mission; status=active; cadence_cette_semaine=1 fois)",
      "=== USER MODEL (FACTS) ===",
      'coach.message_length = {"label":"Courte","value":"short"} (scope=global, conf=1.00, src=system_default)',
      "age = 17",
      "genre = feminin",
    ].join("\n"),
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("Session focus courte"));
  assert(prompt.includes("repères temporels injectés"));
  assert(prompt.includes("j'ai quoi à faire ?"));
  assert(prompt.includes("je suis bloqué"));
  assert(prompt.includes("Action active pertinente listée"));
  assert(prompt.includes("ne le mentionne que si pertinent"));
  assert(prompt.includes("En cas de doute, reste neutre"));
  assert(prompt.includes('"je sais que tu..." seulement si naturel et utile'));
});

Deno.test("companion normal reply requires platform fallback for non-injected Sophia objects", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("hors éléments injectés"));
  assert(!prompt.includes("cartes de défense/attaque actives"));
  assert(prompt.includes("préférences, objets Sophia"));
  assert(prompt.includes("vue complète dans la plateforme"));
  assert(prompt.includes("Aucune liste inventée"));
  assert(prompt.includes('jamais "je vais vérifier ailleurs"'));
});

Deno.test("companion visible-answer guard names all forbidden internals", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  for (
    const term of [
      "dispatcher",
      "route",
      "JSON",
      "memory_plan",
      "prompt",
      "tool",
      "DB/table",
      "handler",
      "skill",
    ]
  ) {
    assert(prompt.includes(term), term);
  }
});

Deno.test("companion delivery directive parser extracts reaction without visible text", () => {
  const parsed = parseCompanionDeliveryDirective(
    '<!--sophia_delivery:reaction_only emoji="✅" reason="short_ack"-->',
  );

  assertEquals(parsed.visibleText, "");
  assertEquals(parsed.delivery, {
    mode: "reaction_only",
    emoji: "✅",
    reason: "short_ack",
  });
});

Deno.test("companion delivery directive parser strips unsupported reaction emoji", () => {
  const parsed = parseCompanionDeliveryDirective(
    '<!--sophia_delivery:reaction_only emoji="🔥" reason="short_ack"-->',
  );

  assertEquals(parsed.visibleText, "");
  assertEquals(parsed.delivery, {
    mode: "reaction_only",
    emoji: "✅",
    reason: "short_ack",
  });
});

Deno.test("companion prompt removes empty module context blocks", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: true,
    lastAssistantMessage: "Je te suis.",
    context: [
      "=== CONTEXTE MODULE (UI) ===",
      "=== SNAPSHOT COURT PLAN / ACTIONS ACTIVES (TOUJOURS DISPONIBLE) ===",
      "Actions actives/disponibles:",
      "- Session focus courte",
    ].join("\n"),
    userState: { risk_level: 0, temp_memory: {} },
  });

  assertEquals(prompt.includes("CONTEXTE MODULE (UI) ===\n==="), false);
  assert(prompt.includes("Session focus courte"));
});

Deno.test("companion prompt compacts user model facts to useful style preferences", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: true,
    lastAssistantMessage: "Je te suis.",
    context: [
      "=== USER MODEL (FACTS) ===",
      'coach.tone = {"label":"Très direct","value":"direct"} (scope=global, conf=1.00, src=explicit_user)',
      'coach.challenge_level = {"label":"Équilibré","value":"balanced"} (scope=global, conf=1.00, src=system_default)',
      'coach.feedback_style = {"label":"Positif puis amélioration","value":"positive_then_fix"} (scope=global, conf=1.00, src=system_default)',
      'coach.talk_propensity = {"label":"Équilibrée","value":"balanced"} (scope=global, conf=1.00, src=system_default)',
      'coach.message_length = {"label":"Courte","value":"short"} (scope=global, conf=1.00, src=system_default)',
      'coach.question_tendency = {"label":"Peu de questions","value":"low"} (scope=global, conf=1.00, src=explicit_user)',
      "=== AUTRE CONTEXTE ===",
      "A garder.",
    ].join("\n"),
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("Préférences utiles, à appliquer sans les nommer"));
  assert(prompt.includes("coach.tone"));
  assert(prompt.includes("coach.message_length"));
  assert(prompt.includes("coach.question_tendency"));
  assertEquals(prompt.includes("coach.feedback_style"), false);
  assertEquals(prompt.includes("coach.talk_propensity"), false);
  assert(prompt.includes("A garder."));
});

Deno.test("companion question rhythm reads coach question tendency from runtime preferences", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: [
      "=== PREFERENCES COACH UTILISATEUR (réglages UI) ===",
      "- Préférence coach: poser moins de questions; privilégier une réponse plus directe et limiter les relances interrogatives.",
      "Ces contraintes viennent uniquement des trois réglages visibles: ton, niveau de challenge, tendance à poser des questions.",
      "=== FIN PREFERENCES COACH UTILISATEUR ===",
    ].join("\n"),
    userState: {
      risk_level: 0,
      temp_memory: {
        companion_question_rhythm: {
          preference: "normal",
          recent_turns: [0, 0, 0],
          turns_since_last_question: 3,
        },
      },
    },
  });

  assert(prompt.includes("Préférence user: low"));
  // FF-012: la préférence du coach reste LUE, mais elle s'exprime en PLAFOND
  // et plus en cible. « Environ 1 question tous les 4 tours » était un quota à
  // atteindre; « au plus 1 sur 6 tours » est une retenue.
  assert(prompt.includes("max 1 question / 6 tours"));
  assertEquals(prompt.includes("environ 1 question"), false);
});

Deno.test("companion question rhythm reads coach question tendency from user facts", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: [
      "=== USER MODEL (FACTS) ===",
      '- coach.question_tendency = {"value":"high","label":"Très questionnant"} (scope=global, conf=1.00, src=explicit_user)',
      "=== CONSIGNE PERSONNALISATION FACTS ===",
      "- Utilise ces facts comme support.",
    ].join("\n"),
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("Préférence user: high"));
  assert(prompt.includes("max 3 questions / 6 tours"));
});

Deno.test("companion question rhythm does not infer question tendency from other coach preferences", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: [
      "=== PREFERENCES COACH UTILISATEUR (réglages UI) ===",
      "- Préférence coach: challenge équilibré; combiner soutien et exigence sans surpression.",
      "=== FIN PREFERENCES COACH UTILISATEUR ===",
    ].join("\n"),
    userState: {
      risk_level: 0,
      temp_memory: {
        companion_question_rhythm: {
          preference: "high",
          recent_turns: [0, 1],
          turns_since_last_question: 1,
        },
      },
    },
  });

  assert(prompt.includes("Préférence user: high"));
  assert(prompt.includes("max 3 questions / 6 tours"));
});

Deno.test("companion normal reply acknowledges explicit memorization requests", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("Fait personnel explicitement confié à retenir"));
  assert(prompt.includes("mémorisation automatique"));
  assert(
    prompt.includes("ni initiative ni rappel à la place"),
  );
  assert(prompt.includes("Jamais cet accusé pour une action du plan"));
  // V5-3 (rose-r7 B01): la preuve committed prime — l'accusé positif vient
  // AVANT le default-deny, toute lane confondue (success comme logged).
  assert(
    prompt.includes(
      "un outcome committed (toute lane) s'accuse POSITIVEMENT",
    ),
  );
  assert(
    prompt.includes(
      "sans committed, dis que ce n'est pas enregistré",
    ),
  );
});

Deno.test("companion normal reply clarifies ambiguous follow-ups instead of guessing", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });
  assert(prompt.includes("Follow-up ambigu"));
  assert(prompt.includes("clarifie en une phrase au lieu de choisir"));
  assert(prompt.includes("sinon réponds direct"));
});

// ---------------------------------------------------------------------------
// W9 — pack ANGLAIS + bloc RESPONSE_LANGUAGE (CONTRACT R3)
//
// Les ceintures FR ci-dessus restent armées: elles passent désormais
// `responseLocale: "fr-FR"`, qui rend le pack français GELÉ, byte-identique.
// Les ceintures ci-dessous prouvent que le pack anglais porte les MÊMES
// invariants métier, redérivés en anglais — jamais des regex françaises
// traduites (doctrine SURFACE_FORM / BUSINESS_INVARIANT de BELT_AUDIT.md).
// ---------------------------------------------------------------------------

const EN_STATE = { risk_level: 0, temp_memory: {} };

Deno.test("W9 — en-US composer emits the English voice pack, zero French persona", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "en-US",
    isWhatsApp: false,
    lastAssistantMessage: "Got it.",
    context: "",
    userState: EN_STATE,
  });

  // Le persona est RÉÉCRIT: le runtime exécute le protocole du coach, il ne
  // l'écrit pas. C'est le défaut D5 visible en démo: un coach anglophone
  // recevait « Tu es Sophia, partenaire conversationnelle ».
  //
  // ⚠️ L'IDENTITÉ NOMME « Sophia » ET PLUS « KEEL ». Le nom de code interne
  // n'a rien à faire dans un prompt: il suffit que le modèle se présente une
  // fois pour qu'un élève lise un mot absent de tout son produit. Ce que ce
  // test épingle reste le même fait — l'anglais a SON persona, pas une
  // traduction du français — mais il l'épingle sur le bon nom.
  assert(prompt.includes("You are the conversational runtime of Sophia"));
  assertEquals(prompt.includes("runtime of KEEL"), false);
  assert(prompt.includes("execute it faithfully, not to rewrite it"));
  assert(prompt.includes("never write the plan"));
  assertEquals(prompt.includes("Tu es Sophia"), false);
  assertEquals(prompt.includes("partenaire conversationnelle"), false);
  assertEquals(prompt.includes("amie intelligente"), false);

  // Les sections structurantes survivent au changement de langue: ce sont des
  // en-têtes machine, pas de la prose (R1).
  for (
    const section of [
      "CORE_COMPANION",
      "OUTPUT_STYLE",
      "NORMAL_REPLY_POLICY",
      "LOOP_RECOVERY",
      "CONTEXT_RULES",
      "TASK_OVERLAYS",
      "SILENCE_AND_REACTIONS",
      "VISIBLE_OUTPUT_STYLE_RULES",
      "VISIBLE_CONVERSATION_FLOW_RULES",
    ]
  ) {
    assert(prompt.includes(section), `section absente du pack EN: ${section}`);
  }

  // Jetons machine: identiques dans les deux langues, sinon le parseur de
  // delivery ne reconnaît plus la directive et le message part en clair.
  assert(prompt.includes("sophia_delivery:reaction_only"));
  assert(prompt.includes("sophia_delivery:no_response"));
  assert(prompt.includes("DIRECT_EFFECT_CONFIRMATION_CONTEXT is the ONLY truth"));
});

Deno.test("W9 — the RESPONSE_LANGUAGE block is the LAST instruction", () => {
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "en-US",
    isWhatsApp: false,
    lastAssistantMessage: "Got it.",
    context: "=== USER MODEL (FACTS) ===\ncoach.tone=direct src=explicit_user",
    userState: EN_STATE,
  });

  assert(prompt.includes("RESPONSE_LANGUAGE:"));
  assert(prompt.includes("You MUST write your entire visible reply in English"));
  // La POSITION est le mécanisme: la récence gagne chez les LLM.
  assert(
    prompt.trimEnd().endsWith(
      "slot keys, day tokens, units, or any machine-read identifier (R1).",
    ),
    "RESPONSE_LANGUAGE n'est pas la dernière instruction",
  );
});

Deno.test("W9 — the language block survives the prompt budget (tail truncation)", () => {
  // Le composeur tronque par la QUEUE. Un bloc ajouté AVANT la troncature
  // disparaît précisément sur les tours à contexte riche, sans aucune erreur.
  const hugeContext = `=== CONTEXTE OPERATIONNEL PLAN ACTIF ===\n${
    "- magnesium glycinate 400 mg at bedtime, evidence self_report\n".repeat(
      2000,
    )
  }`;
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "en-US",
    isWhatsApp: false,
    lastAssistantMessage: "Got it.",
    context: hugeContext,
    userState: EN_STATE,
  });

  assert(prompt.length > 30000, "le contexte n'a pas déclenché la troncature");
  assert(prompt.includes("RESPONSE_LANGUAGE:"));
  assert(
    prompt.trimEnd().endsWith(
      "slot keys, day tokens, units, or any machine-read identifier (R1).",
    ),
  );
});

Deno.test("W9 — a fr-FR thread still gets a French RESPONSE_LANGUAGE block", () => {
  // La ceinture anti-oscillation vaut dans les DEUX sens: le pack français
  // gelé nomme lui aussi sa langue, sinon un prompt FR peut dériver en EN.
  const prompt = buildCompanionSystemPrompt({
    responseLocale: "fr-FR",
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: EN_STATE,
  });
  assert(prompt.includes("Tu es Sophia, partenaire conversationnelle"));
  assert(prompt.includes("You MUST write your entire visible reply in French"));
  assertEquals(
    prompt.includes("You are the conversational runtime of Sophia"),
    false,
  );
});
