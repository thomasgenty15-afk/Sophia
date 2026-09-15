/**
 * FF-023 R7 — L'ORDRE D'ASSEMBLAGE EST L'ORDRE DE SURVIE.
 *
 * Rendre l'historique au tour (FF-023 R1) ajoute de la matière au prompt le
 * plus fréquent du produit. La question qui compte n'est donc pas « est-ce que
 * l'historique arrive », mais « QUI SAUTE quand il arrive ». Le composeur
 * tronque PAR LA QUEUE à 8 000 tokens; la doctrine est écrite en TÊTE du
 * contexte par `withKeelDoctrineBlock` exactement pour ça.
 *
 * Ce test le vérifie sur le vrai assembleur (`buildCompanionSystemPrompt`,
 * importé, non modifié) avec un historique au plafond et un contexte qui
 * DÉBORDE volontairement: la doctrine doit survivre, et la fenêtre visible de
 * conversation aussi.
 */
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

import { buildCompanionSystemPrompt } from "../../sophia-brain/agents/companion.ts";
import {
  RECENT_HISTORY_CONTENT_MAX_CHARS,
  RECENT_HISTORY_MESSAGE_LIMIT,
  sanitizeRecentHistoryRows,
} from "./recent_history.ts";

const DOCTRINE_MARKER = "### COACH DOCTRINE";
const DOCTRINE_SENTENCE =
  "Every meal is built on a protein anchor — never count calories.";

/** Un historique AU PLAFOND: 20 messages, chacun à la troncature maximale. */
function maxedHistory() {
  const rows = Array.from({ length: RECENT_HISTORY_MESSAGE_LIMIT }, (_, i) => ({
    id: `m${i}`,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `TOUR${i} ` + "lorem ipsum ".repeat(400),
    created_at: new Date(Date.now() - (20 - i) * 60_000).toISOString(),
  }));
  return sanitizeRecentHistoryRows(rows).messages;
}

function contextThatOverflows(): string {
  return [
    DOCTRINE_MARKER,
    DOCTRINE_SENTENCE,
    "",
    "=== HISTORIQUE RÉCENT (15 DERNIERS MESSAGES) ===",
    "[2026-08-08T10:00:00Z] user: mon frère déménage à Lisbonne",
    "",
    "=== QUEUE DE CONTEXTE SACRIFIABLE ===",
    "filler ".repeat(9000),
  ].join("\n");
}

Deno.test("historique au plafond + contexte qui déborde ⇒ la doctrine survit", () => {
  const history = maxedHistory();
  for (const message of history) {
    assert(
      message.content.length <= RECENT_HISTORY_CONTENT_MAX_CHARS,
      "la troncature par message doit tenir avant même l'assemblage",
    );
  }

  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "ma dernière réponse",
    history,
    context: contextThatOverflows(),
    userState: { risk_level: 0 },
    responseLocale: "fr-FR",
  });

  assertStringIncludes(prompt, DOCTRINE_MARKER);
  assertStringIncludes(prompt, DOCTRINE_SENTENCE);
  // La queue, elle, est bien sacrifiée: c'est la preuve que la troncature a
  // réellement mordu (sinon le test ne prouverait rien sur l'ordre).
  assert(
    !prompt.includes("=== QUEUE DE CONTEXTE SACRIFIABLE ===") ||
      prompt.includes("CONTEXTE TRONQUE"),
    "le contexte devait déborder — sinon ce test ne mesure rien",
  );
});

Deno.test("la fenêtre visible de conversation entre dans le prompt (R1)", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "ma dernière réponse",
    history: maxedHistory(),
    context: contextThatOverflows(),
    userState: { risk_level: 0 },
    responseLocale: "fr-FR",
  });
  assertStringIncludes(prompt, "HISTORIQUE RECENT VISIBLE");
  // Le DERNIER tour est celui qui compte pour « et du coup ? ».
  assertStringIncludes(prompt, "TOUR19");
});

Deno.test("historique VIDE ⇒ aucun bloc de fenêtre visible (état d'avant FF-023)", () => {
  const prompt = buildCompanionSystemPrompt({
    isWhatsApp: false,
    lastAssistantMessage: "",
    history: [],
    context: `${DOCTRINE_MARKER}\n${DOCTRINE_SENTENCE}`,
    userState: { risk_level: 0 },
    responseLocale: "fr-FR",
  });
  assert(
    !prompt.includes("HISTORIQUE RECENT VISIBLE"),
    "sans historique, le bloc ne doit pas être annoncé vide",
  );
  assertStringIncludes(prompt, DOCTRINE_MARKER);
});
