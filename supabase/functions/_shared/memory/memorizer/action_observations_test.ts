import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildActionLinkFromOccurrences,
  buildActionObservationItem,
  buildPossiblePatternObservation,
  buildStructuredActionObservationItems,
  detectActionObservationPattern,
  shouldMaterializePossiblePattern,
} from "./action_observations.ts";

const base = {
  plan_item_id: "plan-walk",
  title: "Marche du soir",
  week_start_date: "2026-04-06",
};

Deno.test("action observations classify single, week summary and streak summary", () => {
  assertEquals(
    detectActionObservationPattern([{
      ...base,
      id: "occ-1",
      status: "missed",
      validated_at: "2026-04-06T20:00:00Z",
    }]),
    "single_occurrence",
  );
  assertEquals(
    detectActionObservationPattern([
      {
        ...base,
        id: "occ-1",
        status: "missed",
        validated_at: "2026-04-06T20:00:00Z",
      },
      {
        ...base,
        id: "occ-2",
        status: "partial",
        validated_at: "2026-04-08T20:00:00Z",
      },
    ]),
    "week_summary",
  );
  assertEquals(
    detectActionObservationPattern([
      {
        ...base,
        id: "occ-1",
        status: "missed",
        validated_at: "2026-04-06T20:00:00Z",
      },
      {
        ...base,
        id: "occ-2",
        status: "missed",
        validated_at: "2026-04-08T20:00:00Z",
      },
      {
        ...base,
        id: "occ-3",
        status: "missed",
        validated_at: "2026-04-10T20:00:00Z",
      },
    ]),
    "streak_summary",
  );
});

Deno.test("action observation item links occurrences without materializing a pattern from one or two occurrences", () => {
  const occurrences = [{
    ...base,
    id: "occ-1",
    status: "missed",
    validated_at: "2026-04-06T20:00:00Z",
  }];
  const item = buildActionObservationItem({
    source_message_ids: ["msg-1"],
    plan_item_id: "plan-walk",
    title: "Marche du soir",
    occurrences,
  });
  assertEquals(item?.kind, "action_observation");
  assertEquals(item?.metadata?.observation_role, "single_occurrence");

  const link = buildActionLinkFromOccurrences({
    item: item!,
    plan_item_id: "plan-walk",
    occurrences,
  });
  assertEquals(link?.aggregation_kind, "single_occurrence");
  assertEquals(link?.occurrence_ids, ["occ-1"]);

  assertEquals(
    shouldMaterializePossiblePattern([
      {
        memory_item_id: "m1",
        plan_item_id: "plan-walk",
        observation_window_start: "2026-04-01T20:00:00Z",
        aggregation_kind: "single_occurrence",
      },
      {
        memory_item_id: "m2",
        plan_item_id: "plan-walk",
        observation_window_start: "2026-04-15T20:00:00Z",
        aggregation_kind: "single_occurrence",
      },
    ]),
    false,
  );
});

Deno.test("structured action observations are built from canonical daily entries", () => {
  const items = buildStructuredActionObservationItems({
    source_message_ids: ["msg-daily-1"],
    source: "daily_action_review_v1",
    plan_signals: [{
      plan_item_id: "plan-focus",
      title: "Session focus",
      kind: "habit",
      dimension: "habits",
      action_family_key: "habit:focus",
      occurrence_ids: ["entry-1"],
      observation_window_start: "2026-05-11T12:00:00Z",
      observation_window_end: "2026-05-11T12:00:00Z",
      action_variant: {
        recent_entry_outcomes: [{
          outcome: "missed",
          entry_kind: "habit_checkin",
          effective_at: "2026-05-11T12:00:00Z",
        }],
      },
    }],
  });

  assertEquals(items.length, 1);
  assertEquals(items[0].kind, "action_observation");
  assertEquals(items[0].metadata?.source_event_log, true);
  assertEquals(
    items[0].metadata?.structured_extraction_source,
    "daily_action_review_v1",
  );
  assertEquals(items[0].metadata?.action_family_key, "habit:focus");
  assertEquals(items[0].metadata?.occurrence_ids, ["entry-1"]);
});

Deno.test("possible_pattern needs at least three observations across two weeks", () => {
  const observations = [
    {
      memory_item_id: "m1",
      plan_item_id: "plan-walk",
      observation_window_start: "2026-04-01T20:00:00Z",
      aggregation_kind: "single_occurrence",
      domain_keys: ["habitudes.execution"],
    },
    {
      memory_item_id: "m2",
      plan_item_id: "plan-walk",
      observation_window_start: "2026-04-08T20:00:00Z",
      aggregation_kind: "week_summary",
      domain_keys: ["habitudes.execution"],
    },
    {
      memory_item_id: "m3",
      plan_item_id: "plan-walk",
      observation_window_start: "2026-04-15T20:00:00Z",
      aggregation_kind: "single_occurrence",
      domain_keys: ["habitudes.reprise_apres_echec"],
    },
  ];
  assertEquals(shouldMaterializePossiblePattern(observations), true);
  const pattern = buildPossiblePatternObservation({
    plan_item_id: "plan-walk",
    title: "Marche du soir",
    observations,
    iso_week_key: "2026-W16",
  });
  assertEquals(pattern?.metadata.observation_role, "possible_pattern");
  assertEquals(pattern?.metadata.memory_type, "action_execution_profile");
  assertEquals(
    pattern?.metadata.structured_extraction_source,
    "weekly_adaptive_review_v1",
  );
  assertEquals(
    pattern?.canonical_key,
    "action_possible_pattern:plan-walk:2026-W16",
  );
});
