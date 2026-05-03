import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { linkMemoryItemToAction } from "./link_action.ts";
import { linkMemoryItemToEntities } from "./link_entity.ts";
import { linkMemoryItemToTopic } from "./link_topic.ts";
import type { ValidatedMemoryItem } from "./types.ts";

const item: ValidatedMemoryItem = {
  kind: "action_observation",
  content_text: "J'ai pas fait ma marche hier soir.",
  normalized_summary: "marche ratee",
  domain_keys: ["habitudes.execution"],
  confidence: 0.8,
  sensitivity_level: "normal",
  source_message_ids: ["m1"],
  canonical_key: "habitudes.execution.action_observation.marche",
  topic_hint: "marche soir",
  entity_mentions: ["papa"],
  metadata: { observation_role: "single" },
};

Deno.test("linkers resolve topic/entity/action without LLM UUID invention", () => {
  assertEquals(
    linkMemoryItemToTopic({
      item,
      known_topics: [{
        id: "t1",
        slug: "marche_soir",
        title: "Marche du soir",
      }],
    }).topic_slug,
    "marche_soir",
  );
  assertEquals(
    linkMemoryItemToEntities({
      item,
      resolved_entities: [{
        extracted: {
          entity_type: "person",
          display_name: "papa",
          aliases: ["papa"],
          confidence: 0.8,
        },
        decision: "reuse",
        entity_id: "e1",
        normalized_key: "papa",
        aliases: ["papa"],
        reason: "exact",
      }],
    })[0].entity_id,
    "e1",
  );
  const action = linkMemoryItemToAction({
    item,
    plan_signals: [{
      plan_item_id: "plan-walk",
      title: "marche",
      occurrence_ids: ["occ-1"],
    }],
  });
  assertEquals(action?.plan_item_id, "plan-walk");
  assertEquals(action?.occurrence_ids, ["occ-1"]);
});
