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
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.length < 12800);
  assert(prompt.includes("CORE_COMPANION"));
  assert(prompt.includes("OUTPUT_STYLE"));
  assert(prompt.includes("NORMAL_REPLY_POLICY"));
  assert(prompt.includes("LOOP_RECOVERY"));
  assert(prompt.includes("CONTEXT_RULES"));
  assert(prompt.includes("TASK_OVERLAYS"));
  assert(prompt.includes("SILENCE_AND_REACTIONS"));
  assert(prompt.includes("Reconstruis le fil depuis le fil rouge/contexte"));
  assert(prompt.includes("PLATFORM_SKETCH_FOR_NORMAL_REPLY"));
  assert(prompt.includes("Plan, Ressources, Inspirations, Initiatives"));
  assert(
    prompt.includes(
      "Ne présente pas Soutien, Missions ou Habitudes comme des sections de destination",
    ),
  );
  assert(prompt.includes("Pour ce cas, dis Initiatives"));
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
  assert(prompt.includes('ne dis pas "c\'est fait"'));
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
  assert(prompt.includes("cartes de défense/attaque actives"));
  assert(prompt.includes("rappels récurrents actifs"));
  assert(prompt.includes("potion active"));
  assert(
    prompt.includes(
      "Ne propose pas automatiquement une carte, une potion ou un outil Sophia",
    ),
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
  assertEquals(prompt.includes("préparer une nouvelle version"), false);
  assertEquals(prompt.includes("POLYVALENCE ET ASSISTANCE"), false);
  assertEquals(prompt.includes("STYLE ET RYTHME"), false);
  assertEquals(prompt.includes("CONSIGNES CONTEXTUELLES ET ADD-ONS"), false);
  assertEquals(prompt.includes(["status", "recap"].join("_")), false);
  assertEquals(prompt.includes(["emotional", "repair"].join("_")), false);
  assertEquals(prompt.includes(["demotivation", "repair"].join("_")), false);
});

Deno.test("companion normal reply receives recent visible history for loop recovery", () => {
  const prompt = buildCompanionSystemPrompt({
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
  assert(prompt.includes("demain, ce soir, cette semaine"));
  assert(prompt.includes("j'ai quoi à faire ?"));
  assert(prompt.includes("je suis bloqué sur X"));
  assert(prompt.includes("Si une action active pertinente est listée"));
  assert(prompt.includes("Ne le mentionne pas sauf si pertinent ou demandé"));
  assert(prompt.includes("En cas de doute, reste neutre"));
  assert(prompt.includes('n\'écris pas "je sais que tu..."'));
});

Deno.test("companion normal reply requires platform fallback for non-injected Sophia objects", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("hors actions actives injectées"));
  assert(prompt.includes("cartes de défense/attaque actives"));
  assert(prompt.includes("rappels récurrents actifs"));
  assert(prompt.includes("préférences configurées"));
  assert(prompt.includes("vue complète dans la plateforme"));
  assert(prompt.includes("N'hallucine aucune liste"));
  assert(prompt.includes("ne dis jamais que tu vas vérifier ailleurs"));
});

Deno.test("companion visible-answer guard names all forbidden internals", () => {
  const prompt = buildCompanionSystemPrompt({
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
  assert(prompt.includes("environ 1 question tous les 4 tours"));
});

Deno.test("companion question rhythm reads coach question tendency from user facts", () => {
  const prompt = buildCompanionSystemPrompt({
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
  assert(prompt.includes("environ 1 question tous les 2 tours"));
});

Deno.test("companion question rhythm does not infer question tendency from other coach preferences", () => {
  const prompt = buildCompanionSystemPrompt({
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
  assert(prompt.includes("environ 1 question tous les 2 tours"));
});

Deno.test("companion normal reply acknowledges explicit memorization requests", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("Demande de retenir un fait personnel"));
  assert(prompt.includes("la mémorisation est automatique côté Sophia"));
  assert(
    prompt.includes("ne propose ni initiative, ni rappel, ni fonctionnalité"),
  );
  assert(prompt.includes("Cet accusé ne vaut jamais pour une action du plan"));
  assert(
    prompt.includes(
      "sans effet commis prouvé par le contexte, dis honnêtement que ce n'est pas encore enregistré",
    ),
  );
});
