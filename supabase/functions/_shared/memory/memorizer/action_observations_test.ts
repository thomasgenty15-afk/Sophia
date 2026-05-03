import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildActionLinkFromOccurrences,
  buildActionObservationItem,
  buildPossiblePatternObservation,
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
  assertEquals(
    pattern?.canonical_key,
    "action_possible_pattern:plan-walk:2026-W16",
  );
});
