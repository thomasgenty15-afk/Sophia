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

  assert(prompt.length < 9000);
  assert(prompt.includes("CORE_COMPANION"));
  assert(prompt.includes("OUTPUT_STYLE"));
  assert(prompt.includes("NORMAL_REPLY_POLICY"));
  assert(prompt.includes("CONTEXT_RULES"));
  assert(prompt.includes("TASK_OVERLAYS"));
  assert(prompt.includes("SILENCE_AND_REACTIONS"));
  assert(prompt.includes("surtout les 5 derniers messages"));
  assert(prompt.includes("hyperfocus sur le dernier message utilisateur"));
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
  assertEquals(prompt.includes("carte d'attaque"), false);
  assertEquals(prompt.includes("carte de défense"), false);
  assertEquals(prompt.includes("préparer une nouvelle version"), false);
  assertEquals(prompt.includes("POLYVALENCE ET ASSISTANCE"), false);
  assertEquals(prompt.includes("STYLE ET RYTHME"), false);
  assertEquals(prompt.includes("CONSIGNES CONTEXTUELLES ET ADD-ONS"), false);
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
