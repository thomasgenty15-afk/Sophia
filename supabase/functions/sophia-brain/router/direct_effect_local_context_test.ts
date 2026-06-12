import { assertEquals } from "jsr:@std/assert@1";
import {
  activeActionCandidatesForDirectEffects,
  dailyTargetsToActiveActionCandidates,
  withDirectEffectLocalContext,
} from "./direct_effect_local_context.ts";

Deno.test("activeActionCandidatesForDirectEffects exposes plan item ids only from snapshot", () => {
  const candidates = activeActionCandidatesForDirectEffects({
    items: [
      {
        id: "plan-item-1",
        title: "Faire le sas",
        status: "active",
        plan_id: "plan-1",
        item_type: "habit",
        dimension: "habits",
      },
      { id: "deleted", title: "Supprime", status: "deleted" },
      { title: "Sans id", status: "active" },
    ],
  });

  assertEquals(candidates, [{
    plan_item_id: "plan-item-1",
    title: "Faire le sas",
    status: "active",
    plan_id: "plan-1",
    tracking_type: "habit",
    dimension: "habits",
    aliases: [],
    occurrence_id: null,
  }]);
});

Deno.test("daily targets keep occurrence id separate from track progress target id", () => {
  const candidates = dailyTargetsToActiveActionCandidates([{
    occurrence_id: "occ-1",
    plan_item_id: "plan-item-1",
    title: "Marcher 10 minutes",
  }]);

  assertEquals(candidates[0]?.plan_item_id, "plan-item-1");
  assertEquals(candidates[0]?.occurrence_id, "occ-1");
});

Deno.test("withDirectEffectLocalContext dedupes explicit candidates before snapshot candidates", () => {
  const enriched = withDirectEffectLocalContext(
    { channel: "whatsapp" },
    { items: [{ id: "plan-item-1", title: "Titre snapshot" }] },
    [{
      plan_item_id: "plan-item-1",
      title: "Titre direct",
      status: "active",
      plan_id: null,
      tracking_type: null,
      dimension: null,
      aliases: [],
      occurrence_id: null,
    }],
  );

  assertEquals(enriched.active_action_candidates_for_direct_effects[0], {
    plan_item_id: "plan-item-1",
    title: "Titre direct",
    status: "active",
    plan_id: null,
    tracking_type: null,
    dimension: null,
    aliases: [],
    occurrence_id: null,
  });
  assertEquals(enriched.direct_effect_tools, [
    "create_one_shot_reminder",
    "track_progress_plan_item",
  ]);
});
