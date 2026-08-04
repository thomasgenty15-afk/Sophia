import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildWeeklyPossiblePatternRows,
  isoWeekKeyForTimezone,
  isSundayEveningInTimezone,
  selectUsersDueForWeeklyReview,
  selectWeeklyReviewTopics,
} from "./weekly_review.ts";

Deno.test("weekly review derives timezone-aware Sunday evening and ISO week", () => {
  const now = new Date("2026-05-03T18:30:00Z");
  assertEquals(isSundayEveningInTimezone("Europe/Paris", now), true);
  const iso = isoWeekKeyForTimezone("Europe/Paris", now);
  assertEquals(iso.key, "2026-W18");
});

Deno.test("weekly review user selection respects local Sunday evening unless forced", () => {
  const users = [
    { id: "paris", timezone: "Europe/Paris" },
    { id: "la", timezone: "America/Los_Angeles" },
  ];
  const now = new Date("2026-05-03T18:30:00Z");
  assertEquals(selectUsersDueForWeeklyReview({ users, now }).map((u) => u.id), [
    "paris",
  ]);
  assertEquals(
    selectUsersDueForWeeklyReview({ users, now, force: true }).map((u) => u.id),
    ["paris", "la"],
  );
});

Deno.test("weekly review selects pending topics and builds possible_pattern rows", () => {
  const selected = selectWeeklyReviewTopics([
    {
      id: "t1",
      user_id: "u",
      title: "A",
      pending_changes_count: 1,
      status: "active",
      lifecycle_stage: "durable",
    },
    {
      id: "t2",
      user_id: "u",
      title: "B",
      pending_changes_count: 0,
      status: "active",
      lifecycle_stage: "durable",
    },
  ] as any);
  assertEquals(selected.map((t) => t.id), ["t1"]);

  const rows = buildWeeklyPossiblePatternRows({
    iso_week_key: "2026-W18",
    candidates: [{
      plan_item_id: "plan-walk",
      title: "Marche du soir",
      observations: [
        {
          memory_item_id: "m1",
          plan_item_id: "plan-walk",
          observation_window_start: "2026-04-12T20:00:00Z",
          aggregation_kind: "single_occurrence",
          domain_keys: ["habitudes.execution"],
        },
        {
          memory_item_id: "m2",
          plan_item_id: "plan-walk",
          observation_window_start: "2026-04-19T20:00:00Z",
          aggregation_kind: "week_summary",
          domain_keys: ["habitudes.execution"],
        },
        {
          memory_item_id: "m3",
          plan_item_id: "plan-walk",
          observation_window_start: "2026-04-26T20:00:00Z",
          aggregation_kind: "single_occurrence",
          domain_keys: ["habitudes.reprise_apres_echec"],
        },
      ],
    }],
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].metadata.observation_role, "possible_pattern");
});
