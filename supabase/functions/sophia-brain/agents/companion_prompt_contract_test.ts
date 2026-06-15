import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildCompanionSystemPrompt } from "./companion.ts";

Deno.test("companion normal reply prompt stays conversation-first and product-thin", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "Je te suis.",
    context: "",
    userState: { risk_level: 0, temp_memory: {} },
  });

  assert(prompt.includes("surtout les 5 derniers messages"));
  assert(prompt.includes("hyperfocus sur le dernier message utilisateur"));
  assert(
    prompt.includes(
      "ta posture par défaut ressemble davantage à une amie lucide",
    ),
  );
  assert(
    prompt.includes(
      "accorde les adjectifs et participes au féminin",
    ),
  );
  assert(
    prompt.includes(
      "applique cette demande au dernier contenu actif de la conversation",
    ),
  );
  assert(
    prompt.includes(
      "Garde le sujet/référent actif sauf changement clair de sujet",
    ),
  );
  assert(prompt.includes("CONVERSATION SIMPLE AVANT MICRO-ACTION"));
  assert(
    prompt.includes(
      "Mentionner une action ne veut pas dire demander à agir",
    ),
  );
  assert(
    prompt.includes(
      "ne propose pas de micro-action immédiate",
    ),
  );
  assert(
    prompt.includes(
      "ne propose pas de créer, configurer, activer, préparer ou lancer une surface Sophia",
    ),
  );
  assert(
    prompt.includes(
      "Si le user demande explicitement ce type d'action, le runtime fournira un add-on ou un owner spécialisé",
    ),
  );
  assertEquals(prompt.includes("carte d'attaque"), false);
  assertEquals(prompt.includes("carte de défense"), false);
  assertEquals(prompt.includes("préparer une nouvelle version"), false);
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
