import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import type { UserRelationPreferencesRow } from "../_shared/v2-types.ts";
import {
  allowsContactWindow,
  buildRelationPreferencesPromptBlock,
  contactWindowFromIso,
  inferRelationPreferences,
  maxBudgetAllowedByRelationPreferences,
  type RelationPreferenceInferenceSignals,
} from "./relation_preferences_engine.ts";

const TIMEZONE = "Europe/Paris";

function observation(
  overrides: Partial<
    RelationPreferenceInferenceSignals["proactiveObservations"][number]
  > = {},
): RelationPreferenceInferenceSignals["proactiveObservations"][number] {
  return {
    scheduled_for: "2026-03-25T07:00:00.000Z",
    contact_window: "morning",
    tone: "gentle",
    budget_class: "light",
    user_reacted: true,
    reply_lengths: [120],
    decline_count: 0,
    ...overrides,
  };
}

Deno.test("contactWindowFromIso buckets local windows", () => {
  assertEquals(
    contactWindowFromIso("2026-03-25T07:00:00.000Z", TIMEZONE),
    "morning",
  );
  assertEquals(
    contactWindowFromIso("2026-03-25T13:00:00.000Z", TIMEZONE),
    "afternoon",
  );
  assertEquals(
    contactWindowFromIso("2026-03-25T18:00:00.000Z", TIMEZONE),
    "evening",
  );
});

Deno.test("inferRelationPreferences learns windows, tone, length and intensity conservatively", () => {
  const result = inferRelationPreferences({
    timezone: TIMEZONE,
    signals: {
      proactiveObservations: [
        observation({
          contact_window: "morning",
          tone: "gentle",
          budget_class: "light",
          user_reacted: false,
          reply_lengths: [],
        }),
        observation({
          contact_window: "morning",
          tone: "gentle",
          budget_class: "light",
          user_reacted: false,
          reply_lengths: [],
        }),
        observation({
          contact_window: "evening",
          tone: "gentle",
          budget_class: "light",
          user_reacted: true,
          reply_lengths: [180],
        }),
        observation({
          contact_window: "evening",
          tone: "gentle",
          budget_class: "light",
          user_reacted: true,
          reply_lengths: [170],
        }),
        observation({
          contact_window: "evening",
          tone: "gentle",
          budget_class: "notable",
          user_reacted: false,
          reply_lengths: [],
          decline_count: 1,
        }),
      ],
      recentUserMessages: [],
    },
    current: null,
  });

  assertEquals(result.changed, true);
  assertEquals(result.preferences.preferred_contact_windows, ["evening"]);
  assertEquals(result.preferences.disliked_contact_windows, ["morning"]);
  assertEquals(result.preferences.preferred_tone, "gentle");
  assertEquals(result.preferences.preferred_message_length, "medium");
  assertEquals(result.preferences.max_proactive_intensity, "low");
});

Deno.test("inferRelationPreferences preserves current values when evidence is too weak", () => {
  const result = inferRelationPreferences({
    timezone: TIMEZONE,
    signals: {
      proactiveObservations: [
        observation(),
        observation({ user_reacted: false, reply_lengths: [] }),
        observation({ tone: "direct", budget_class: "notable" }),
      ],
      recentUserMessages: [],
    },
    current: {
      user_id: "user-1",
      preferred_contact_windows: ["afternoon"],
      disliked_contact_windows: null,
      preferred_tone: "mixed",
      preferred_message_length: "short",
      max_proactive_intensity: "medium",
      soft_no_contact_rules: null,
      updated_at: "2026-03-24T00:00:00.000Z",
    },
  });

  assertEquals(result.changed, false);
  assertEquals(result.preferences.preferred_contact_windows, ["afternoon"]);
  assertEquals(result.preferences.preferred_tone, "mixed");
  assertEquals(result.preferences.preferred_message_length, "short");
  assertEquals(result.preferences.max_proactive_intensity, "medium");
});

Deno.test("allowsContactWindow respects preferred and disliked windows", () => {
  const prefs: Partial<UserRelationPreferencesRow> = {
    preferred_contact_windows: ["evening"],
    disliked_contact_windows: ["morning"],
    soft_no_contact_rules: { avoid_day_parts: ["morning"] },
  };

  assertEquals(allowsContactWindow(prefs, "morning"), false);
  assertEquals(allowsContactWindow(prefs, "evening"), true);
  assertEquals(allowsContactWindow(prefs, "afternoon"), false);
});

Deno.test("maxBudgetAllowedByRelationPreferences caps low intensity users to light", () => {
  assertEquals(
    maxBudgetAllowedByRelationPreferences({ max_proactive_intensity: "low" }),
    "light",
  );
  assertEquals(
    maxBudgetAllowedByRelationPreferences({
      max_proactive_intensity: "medium",
    }),
    null,
  );
});

Deno.test("buildRelationPreferencesPromptBlock renders compact preference hints", () => {
  const block = buildRelationPreferencesPromptBlock({
    preferred_contact_windows: ["evening"],
    preferred_tone: "gentle",
    preferred_message_length: "short",
    max_proactive_intensity: "low",
  });

  assertStringIncludes(block, "preferred_contact_windows=evening");
  assertStringIncludes(block, "preferred_tone=gentle");
  assertStringIncludes(block, "preferred_message_length=short");
  assertStringIncludes(block, "max_proactive_intensity=low");
});
