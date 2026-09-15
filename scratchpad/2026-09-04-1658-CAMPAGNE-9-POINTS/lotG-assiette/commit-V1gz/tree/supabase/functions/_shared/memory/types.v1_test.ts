import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  CHANGE_OPERATION_TYPES,
  MEMORY_ITEM_KINDS,
  MEMORY_ITEM_STATUSES,
  RETRIEVAL_HINTS,
  RETRIEVAL_MODES,
  SENSITIVITY_CATEGORIES,
  SENSITIVITY_LEVELS,
  TOPIC_DECISIONS,
} from "./types.v1.ts";

Deno.test("memory v1 canonical lists match Sprint 0 decisions", () => {
  assertEquals(MEMORY_ITEM_KINDS, [
    "fact",
    "statement",
    "event",
    "action_observation",
  ]);
  assertEquals(MEMORY_ITEM_STATUSES, [
    "candidate",
    "active",
    "superseded",
    "invalidated",
    "hidden_by_user",
    "deleted_by_user",
    "archived",
  ]);
  assertEquals(SENSITIVITY_LEVELS, ["normal", "sensitive", "safety"]);
  assertEquals(SENSITIVITY_CATEGORIES.length, 12);
  assertEquals(RETRIEVAL_MODES, [
    "topic_continuation",
    "cross_topic_lookup",
    "safety_first",
  ]);
  assertEquals(RETRIEVAL_HINTS, [
    "dated_reference",
    "correction",
    "action_related",
  ]);
  assertEquals(TOPIC_DECISIONS, [
    "stay",
    "switch",
    "create_candidate",
    "side_note",
  ]);
  assertEquals(CHANGE_OPERATION_TYPES.includes("redaction_propagated"), true);
});
