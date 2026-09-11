import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { answerLandedAfter } from "./ChatPage";
import type { ChatMessage } from "../api/chat";

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ « SOPHIA ÉCRIT… » RESTAIT ALLUMÉ SOUS UNE RÉPONSE DÉJÀ AFFICHÉE
//
// Vu en capture le 2026-09-09, sur la conversation de poul: la réponse est là,
// lisible, et l'indicateur tourne en dessous. Cause: `setThinking(false)` ne
// vivait QUE dans l'écouteur Realtime, alors que l'envoi finit toujours par un
// `refetch()` — le filet posé pour le cas où l'abonnement est tombé. Une
// réponse arrivée par le filet n'éteignait rien, et rien d'autre ne la
// rattrapait: l'écran disait « elle écrit » à côté de ce qu'elle venait
// d'écrire, jusqu'au rechargement de la page.
// ═══════════════════════════════════════════════════════════════════════════

function msg(over: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role">): ChatMessage {
  return {
    content: "",
    createdAt: "2026-09-09T17:00:00.000Z",
    buttons: [],
    proactive: false,
    ...over,
  } as ChatMessage;
}

describe("l'indicateur s'éteint quand la réponse est arrivée", () => {
  const SENT = "cid-1";

  it("⛔ LE CAS VU EN CAPTURE — une réponse SOUS le message envoyé l'éteint", () => {
    const list = [
      msg({ id: "a", role: "assistant", createdAt: "2026-09-09T06:25:00.000Z" }),
      msg({ id: "u", role: "user", clientMessageId: SENT, createdAt: "2026-09-09T17:32:59.000Z" }),
      msg({ id: "r", role: "assistant", createdAt: "2026-09-09T17:33:05.000Z" }),
    ];
    expect(answerLandedAfter(list, SENT)).toBe(true);
  });

  it("⛔ ET UNE BULLE PLUS ANCIENNE NE L'ÉTEINT PAS", () => {
    // La relance du matin est une bulle d'assistant, et elle est DÉJÀ là quand
    // on tape. Un prédicat qui cherche « une bulle d'assistant quelque part »
    // éteindrait l'indicateur à la milliseconde de l'envoi — c'est-à-dire ne
    // l'allumerait jamais. La position est la règle.
    const list = [
      msg({ id: "a", role: "assistant", createdAt: "2026-09-09T06:25:00.000Z" }),
      msg({ id: "u", role: "user", clientMessageId: SENT, createdAt: "2026-09-09T17:32:59.000Z" }),
    ];
    expect(answerLandedAfter(list, SENT)).toBe(false);
  });

  it("le message envoyé pas encore fusionné = on attend toujours", () => {
    const list = [msg({ id: "a", role: "assistant" })];
    expect(answerLandedAfter(list, SENT)).toBe(false);
  });

  it("une réponse à un AUTRE envoi ne compte pas pour celui-ci", () => {
    const list = [
      msg({ id: "u0", role: "user", clientMessageId: "cid-0", createdAt: "2026-09-09T10:00:00.000Z" }),
      msg({ id: "r0", role: "assistant", createdAt: "2026-09-09T10:00:05.000Z" }),
      msg({ id: "u1", role: "user", clientMessageId: SENT, createdAt: "2026-09-09T17:32:59.000Z" }),
    ];
    expect(answerLandedAfter(list, SENT)).toBe(false);
  });
});

describe("câblage — une seule règle, et elle est sur l'état", () => {
  const src = readFileSync(resolve(__dirname, "./ChatPage.tsx"), "utf8");

  it("⛔ L'EXTINCTION N'EST PLUS DANS L'ÉCOUTEUR REALTIME", () => {
    // C'est la forme du défaut: une extinction par CHEMIN laisse le chemin
    // qu'on oublie sans extinction. Il y en avait deux, l'un des deux l'avait.
    const listener = src.slice(src.indexOf("onMessage: (message) => {"));
    const untilNext = listener.slice(0, listener.indexOf("onResubscribed"));
    expect(untilNext, untilNext).not.toContain("setThinking(false)");
  });

  it("l'effet lit `messages` et passe par le prédicat mesuré", () => {
    expect(src).toContain("if (!answerLandedAfter(messages, waiting)) return;");
    expect(src).toContain("}, [messages]);");
    // Le jeton est armé aux DEUX envois (texte et photo) et purgé sur échec.
    expect(src.split("waitingForRef.current = clientMessageId;").length - 1).toBe(2);
    expect(src).toContain("waitingForRef.current = null;");
  });
});
