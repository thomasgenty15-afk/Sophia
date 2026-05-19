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
  recurringReminderLabels: ["Prendre 5 minutes pour respirer"],
  ownedFollowUps: [],
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
      recurring_reminder_id: null,
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

Deno.test("watcherCandidateCoveredByExistingFollowUp blocks recent potion overlap", () => {
  const result = watcherCandidateCoveredByExistingFollowUp({
    event_context: "Appel client important",
    event_grounding: "Le user a une peur du regard avant l'appel client.",
    scheduled_for: "2026-05-20T08:30:00.000Z",
    now_iso: "2026-05-19T12:00:00.000Z",
  }, {
    ...snapshot,
    ownedFollowUps: [{
      source: "potion",
      label: "Appel client",
      message_instruction:
        "Un petit mot pour garder l'elan avant l'appel client.",
      event_context: null,
      scheduled_for: null,
      created_at: "2026-05-19T10:30:00.000Z",
      updated_at: "2026-05-19T10:30:00.000Z",
      recurring_reminder_id: "rr-potion",
      source_potion_session_id: "potion-1",
      target_kind: "transformation",
      target_plan_item_id: null,
      target_action_family_key: null,
      initiative_kind: "potion_follow_up",
      source_kind: "potion_generated",
    }],
  });

  assertEquals(result.covered, true);
});

Deno.test("watcherCandidateCoveredByExistingFollowUp blocks same action family", () => {
  const result = watcherCandidateCoveredByExistingFollowUp({
    event_context: "Course hebdomadaire",
    event_grounding: "La course revient cette semaine.",
    scheduled_for: "2026-05-20T08:30:00.000Z",
    target_action_family_key: "run_weekly",
    now_iso: "2026-05-19T12:00:00.000Z",
  }, {
    ...snapshot,
    ownedFollowUps: [{
      source: "recurring_reminder",
      label: "Courir",
      message_instruction: "Te rappeler de courir.",
      event_context: null,
      scheduled_for: null,
      created_at: "2026-05-10T10:30:00.000Z",
      updated_at: "2026-05-10T10:30:00.000Z",
      recurring_reminder_id: "rr-run",
      source_potion_session_id: null,
      target_kind: "action_family",
      target_plan_item_id: null,
      target_action_family_key: "run_weekly",
      initiative_kind: "base_free",
      source_kind: "user_created",
    }],
  });

  assertEquals(result.covered, true);
  assertEquals(result.reason, "same_target_action_family");
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
      recurring_reminder_id: null,
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
