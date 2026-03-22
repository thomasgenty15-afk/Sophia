import { assertEquals } from "jsr:@std/assert@1";

import {
  buildWatcherScopePromptBlock,
  type CheckinExclusionSnapshot,
  sanitizeWatcherGrounding,
  textMentionsOwnedTopic,
  watcherEventContextTouchesExcludedScope,
  watcherGeneratedTextViolatesScope,
} from "./checkin_scope.ts";

const snapshot: CheckinExclusionSnapshot = {
  planActionTitles: ["60 pompes"],
  personalActionTitles: ["Envoyer le message a Julie"],
  frameworkTitles: ["Journal 3 lignes"],
  vitalSignTitles: ["Reactivite"],
  recurringReminderLabels: ["Prendre 5 minutes pour respirer"],
  ownedTitles: [
    "60 pompes",
    "Envoyer le message a Julie",
    "Journal 3 lignes",
    "Reactivite",
    "Prendre 5 minutes pour respirer",
  ],
};

Deno.test("textMentionsOwnedTopic matches owned titles with flexible normalization", () => {
  assertEquals(
    textMentionsOwnedTopic("J'ai repense a tes 60 pompes d'hier.", snapshot),
    true,
  );
  assertEquals(
    textMentionsOwnedTopic(
      "Tu te sens comment avant ce rendez-vous ?",
      snapshot,
    ),
    false,
  );
});

Deno.test("watcherEventContextTouchesExcludedScope rejects action-like contexts", () => {
  assertEquals(
    watcherEventContextTouchesExcludedScope(
      "Journal 3 lignes ce soir",
      snapshot,
    ),
    true,
  );
  assertEquals(
    watcherEventContextTouchesExcludedScope(
      "Rendez-vous amoureux important",
      snapshot,
    ),
    false,
  );
});

Deno.test("sanitizeWatcherGrounding removes clauses owned by other pipelines", () => {
  const raw =
    "L'utilisateur a un rendez-vous important. Il veut rester clean d'ici la. Pour le journal, on peut le rendre ultra court. Il s'inquiete de sa reactivite.";
  const cleaned = sanitizeWatcherGrounding(raw, snapshot);

  assertEquals(
    cleaned,
    "L'utilisateur a un rendez-vous important. Il veut rester clean d'ici la.",
  );
});

Deno.test("watcherGeneratedTextViolatesScope blocks simplification and owned items", () => {
  assertEquals(
    watcherGeneratedTextViolatesScope(
      "Pour le journal, on peut le rendre ultra court en 2 minutes si tu veux.",
      snapshot,
    ),
    true,
  );
  assertEquals(
    watcherGeneratedTextViolatesScope(
      "Je pense a ce moment important qui approche. Tu te sens comment a l'idee de le vivre ?",
      snapshot,
    ),
    false,
  );
});

Deno.test("buildWatcherScopePromptBlock mentions forbidden ownership model", () => {
  const block = buildWatcherScopePromptBlock(snapshot);

  assertEquals(
    block.includes("Ces sujets appartiennent a d'autres pipelines."),
    true,
  );
  assertEquals(block.includes("Journal 3 lignes"), true);
  assertEquals(
    block.includes("Ne fais jamais d'accountability d'execution"),
    true,
  );
});
