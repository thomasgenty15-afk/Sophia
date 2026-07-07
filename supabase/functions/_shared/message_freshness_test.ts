import { assertEquals } from "std/testing/asserts.ts";
import {
  filterFreshMessages,
  MESSAGE_FRESHNESS_WINDOW_MS,
} from "./message_freshness.ts";

const NOW_MS = Date.parse("2026-07-06T12:00:00.000Z");

function msg(role: string, hoursAgo: number, content = "x") {
  return {
    role,
    content,
    created_at: new Date(NOW_MS - hoursAgo * 60 * 60 * 1000).toISOString(),
  };
}

Deno.test("filterFreshMessages: garde tout quand tout est dans la fenêtre", () => {
  const messages = [msg("user", 3), msg("assistant", 2), msg("user", 1)];
  const out = filterFreshMessages(messages, { nowMs: NOW_MS });
  assertEquals(out, messages);
});

Deno.test("filterFreshMessages: coupe les messages plus vieux que 12h", () => {
  const messages = [
    msg("user", 30, "vieux"),
    msg("assistant", 29, "vieux"),
    msg("user", 2, "frais"),
    msg("assistant", 1, "frais"),
  ];
  const out = filterFreshMessages(messages, { nowMs: NOW_MS });
  assertEquals(out.map((m) => m.content), ["frais", "frais"]);
});

Deno.test("filterFreshMessages: plancher = dernier tour assistant→user conservé même vieux", () => {
  // Check-in envoyé il y a 20h, réponse user il y a 18h: le tour complet reste.
  const messages = [
    msg("user", 40, "tres vieux"),
    msg("assistant", 20, "check-in"),
    msg("user", 18, "reponse tardive"),
  ];
  const out = filterFreshMessages(messages, { nowMs: NOW_MS });
  assertEquals(out.map((m) => m.content), ["check-in", "reponse tardive"]);
});

Deno.test("filterFreshMessages: sans message assistant, garde le dernier message", () => {
  const messages = [msg("user", 40, "vieux"), msg("user", 30, "dernier")];
  const out = filterFreshMessages(messages, { nowMs: NOW_MS });
  assertEquals(out.map((m) => m.content), ["dernier"]);
});

Deno.test("filterFreshMessages: fail-open sur created_at manquant ou invalide", () => {
  const messages = [
    { role: "user", content: "sans date" },
    { role: "user", content: "date invalide", created_at: "n/a" },
    msg("assistant", 1, "frais"),
  ];
  const out = filterFreshMessages(messages, { nowMs: NOW_MS });
  assertEquals(out.map((m) => m.content), [
    "sans date",
    "date invalide",
    "frais",
  ]);
});

Deno.test("filterFreshMessages: liste vide et fenêtre custom", () => {
  assertEquals(filterFreshMessages([], { nowMs: NOW_MS }), []);
  const messages = [msg("user", 5, "vieux"), msg("assistant", 1, "frais")];
  const out = filterFreshMessages(messages, {
    nowMs: NOW_MS,
    windowMs: 2 * 60 * 60 * 1000,
  });
  assertEquals(out.map((m) => m.content), ["frais"]);
});

Deno.test("filterFreshMessages: la fenêtre par défaut vaut 12h", () => {
  assertEquals(MESSAGE_FRESHNESS_WINDOW_MS, 12 * 60 * 60 * 1000);
});
