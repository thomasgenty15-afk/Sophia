import { assertEquals } from "jsr:@std/assert@1";

import {
  buildWatcherScopePromptBlock,
  type CheckinExclusionSnapshot,
  sanitizeWatcherGrounding,
  textMentionsOwnedTopic,
  watcherCandidateCoveredByExistingFollowUp,
  watcherEventContextTouchesExcludedScope,
  watcherGeneratedTextViolatesScope,
} from "./checkin_scope.ts";

const snapshot: CheckinExclusionSnapshot = {
  planActionTitles: ["60 pompes"],
  planActionDetails: ["60 pompes | dimension=habits | kind=habit"],
  personalActionTitles: ["Envoyer le message a Julie"],
  frameworkTitles: ["Journal 3 lignes"],
  vitalSignTitles: ["Reactivite"],
  ownedFollowUps: [],
  ownedTitles: [
    "60 pompes",
    "Envoyer le message a Julie",
    "Journal 3 lignes",
    "Reactivite",
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
  assertEquals(
    block.includes("Si le besoin est deja handle par un one-shot reminder"),
    true,
  );
});

Deno.test("watcherCandidateCoveredByExistingFollowUp blocks one-shot duplicate", () => {
  const result = watcherCandidateCoveredByExistingFollowUp({
    event_context: "Appeler Paul",
    event_grounding: "L'utilisateur veut appeler Paul demain.",
    scheduled_for: "2026-05-20T10:00:00.000Z",
    now_iso: "2026-05-19T12:00:00.000Z",
  }, {
    ...snapshot,
    ownedFollowUps: [{
      source: "one_shot",
      label: "appeler Paul",
      message_instruction: "appeler Paul",
      event_context: "one_shot_reminder:appeler_paul",
      scheduled_for: "2026-05-20T09:45:00.000Z",
      created_at: "2026-05-19T11:30:00.000Z",
      updated_at: null,
      source_potion_session_id: null,
      target_kind: null,
      target_plan_item_id: null,
      target_action_family_key: null,
      initiative_kind: null,
      source_kind: "rendez_vous",
    }],
  });

  assertEquals(result.covered, true);
  assertEquals(result.reason, "strong_text_match");
});

Deno.test("watcherCandidateCoveredByExistingFollowUp allows distinct event", () => {
  const result = watcherCandidateCoveredByExistingFollowUp({
    event_context: "Entretien logement",
    event_grounding: "L'utilisateur a une visite pour un appartement.",
    scheduled_for: "2026-05-21T14:00:00.000Z",
    now_iso: "2026-05-19T12:00:00.000Z",
  }, {
    ...snapshot,
    ownedFollowUps: [{
      source: "one_shot",
      label: "appeler Paul",
      message_instruction: "appeler Paul",
      event_context: "one_shot_reminder:appeler_paul",
      scheduled_for: "2026-05-20T09:45:00.000Z",
      created_at: "2026-05-19T11:30:00.000Z",
      updated_at: null,
      source_potion_session_id: null,
      target_kind: null,
      target_plan_item_id: null,
      target_action_family_key: null,
      initiative_kind: null,
      source_kind: "rendez_vous",
    }],
  });

  assertEquals(result.covered, false);
});
