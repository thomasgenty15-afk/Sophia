import {
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  VISIBLE_CONVERSATION_FLOW_RULES,
  VISIBLE_OUTPUT_STYLE_RULES,
  VISIBLE_SAFETY_CONVERSATION_FLOW_RULES,
} from "./response_style_policy.ts";

Deno.test("visible output style rules define shared conversation contract", () => {
  assertStringIncludes(
    VISIBLE_OUTPUT_STYLE_RULES,
    "VISIBLE_OUTPUT_STYLE_RULES",
  );
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "tutoiement");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "Format conversationnel");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "court par defaut");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "Proportionnalite d'accueil");
  assertStringIncludes(
    VISIBLE_OUTPUT_STYLE_RULES,
    "long, personnel, charge emotionnellement",
  );
  assertStringIncludes(
    VISIBLE_OUTPUT_STYLE_RULES,
    "reponds a minima proportionnellement",
  );
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "accorde les adjectifs");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "contente");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "une seule question");
  assertStringIncludes(
    VISIBLE_OUTPUT_STYLE_RULES,
    "contraintes explicites de forme du dernier message user",
  );
  assertStringIncludes(
    VISIBLE_OUTPUT_STYLE_RULES,
    "ne pas terminer par une question",
  );
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "internals");
});

Deno.test("visible conversation flow rules prioritize latest message without routing", () => {
  assertStringIncludes(
    VISIBLE_CONVERSATION_FLOW_RULES,
    "VISIBLE_CONVERSATION_FLOW_RULES",
  );
  assertStringIncludes(
    VISIBLE_CONVERSATION_FLOW_RULES,
    "dernier message utilisateur",
  );
  assertStringIncludes(VISIBLE_CONVERSATION_FLOW_RULES, "Accueille d'abord");
  assertStringIncludes(
    VISIBLE_CONVERSATION_FLOW_RULES,
    "avant de proposer une grille, une carte, un plan",
  );
  assertStringIncludes(VISIBLE_CONVERSATION_FLOW_RULES, "5 derniers messages");
  assertStringIncludes(
    VISIBLE_CONVERSATION_FLOW_RULES,
    "ponctuation d'interpellation",
  );
  assertStringIncludes(
    VISIBLE_CONVERSATION_FLOW_RULES,
    "réponds d'abord à cette demande",
  );
  assertStringIncludes(VISIBLE_CONVERSATION_FLOW_RULES, "router");
  assertStringIncludes(VISIBLE_CONVERSATION_FLOW_RULES, "conversation_context");
});

Deno.test("visible safety conversation flow rules keep raw messages blocked", () => {
  assertStringIncludes(
    VISIBLE_SAFETY_CONVERSATION_FLOW_RULES,
    "VISIBLE_SAFETY_CONVERSATION_FLOW_RULES",
  );
  assertStringIncludes(
    VISIBLE_SAFETY_CONVERSATION_FLOW_RULES,
    "dernier signal utilisateur résumé dans conversation_context",
  );
  assertStringIncludes(
    VISIBLE_SAFETY_CONVERSATION_FLOW_RULES,
    "sans utiliser de message brut ni de recent_messages",
  );
  assertStringIncludes(
    VISIBLE_SAFETY_CONVERSATION_FLOW_RULES,
    "ne doit jamais affaiblir la priorité safety",
  );
});
