import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveEntity } from "./entity_resolver.ts";

Deno.test("entity resolver reuses father aliases and rejects noise", () => {
  const known = [{
    id: "father-1",
    entity_type: "person" as const,
    display_name: "pere",
    aliases: ["mon pere", "papa"],
    relation_to_user: "father",
    status: "active",
  }];
  assertEquals(
    resolveEntity({
      entity_type: "person",
      display_name: "papa",
      aliases: ["papa"],
      relation_to_user: "father",
      confidence: 0.8,
    }, known).entity_id,
    "father-1",
  );
  assertEquals(
    resolveEntity({
      entity_type: "place",
      display_name: "boulangerie",
      aliases: ["la boulangerie"],
      confidence: 0.8,
    }, []).decision,
    "reject_noise",
  );
});

Deno.test("entity resolver keeps multiple sisters distinct without alias evidence", () => {
  const decision = resolveEntity({
    entity_type: "person",
    display_name: "ma soeur",
    aliases: ["ma soeur"],
    relation_to_user: "sister",
    confidence: 0.8,
  }, [{
    id: "s1",
    entity_type: "person",
    display_name: "Sarah",
    aliases: ["Sarah"],
    relation_to_user: "sister",
    status: "active",
  }]);
  assertEquals(decision.decision, "create_candidate");
});
