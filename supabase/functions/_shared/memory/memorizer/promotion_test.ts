import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { decideCandidatePromotion } from "./promotion.ts";

const NOW = new Date("2026-05-15T00:00:00.000Z");

Deno.test("candidate promotion promotes reaffirmed and archives expired candidates", () => {
  assertEquals(
    decideCandidatePromotion({
      id: "c1",
      user_id: "u",
      confidence: 0.7,
      created_at: "2026-05-01T00:00:00.000Z",
      source_count: 2,
      link_count: 1,
    }, NOW).action,
    "promote",
  );
  assertEquals(
    decideCandidatePromotion({
      id: "c2",
      user_id: "u",
      confidence: 0.8,
      created_at: "2026-05-01T00:00:00.000Z",
      source_count: 1,
      link_count: 1,
    }, NOW).action,
    "archive",
  );
  assertEquals(
    decideCandidatePromotion({
      id: "c3",
      user_id: "u",
      confidence: 0.8,
      created_at: "2026-05-10T00:00:00.000Z",
      source_count: 1,
      link_count: 1,
    }, NOW).action,
    "keep_candidate",
  );
});
