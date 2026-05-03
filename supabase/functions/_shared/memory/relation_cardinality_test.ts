import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  getRelationCardinality,
  RELATION_CARDINALITY_V1,
  RELATION_CARDINALITY_V1_VERSION,
} from "./relation_cardinality.ts";

Deno.test("relation cardinality v1 exposes the locked registry", () => {
  assertEquals(RELATION_CARDINALITY_V1_VERSION, 1);
  assertEquals(Object.keys(RELATION_CARDINALITY_V1).length, 21);
});

Deno.test("getRelationCardinality returns expected cardinalities", () => {
  assertEquals(getRelationCardinality("father"), "usually_single");
  assertEquals(getRelationCardinality("sister"), "multiple");
  assertEquals(getRelationCardinality("manager"), "time_scoped");
});

Deno.test("getRelationCardinality returns null for unknown roles", () => {
  assertEquals(getRelationCardinality("neighbor"), null);
  assertEquals(getRelationCardinality(""), null);
});
