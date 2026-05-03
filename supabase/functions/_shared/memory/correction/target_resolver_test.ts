import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveCorrectionTarget } from "./target_resolver.ts";

const candidates = [
  {
    id: "wrong_relation",
    user_id: "u",
    kind: "fact" as const,
    status: "active",
    content_text: "Tania est la soeur du user.",
    entity_aliases: ["Tania"],
    topic_ids: ["relations"],
  },
  {
    id: "other",
    user_id: "u",
    kind: "statement" as const,
    status: "active",
    content_text: "Le user dit avoir honte d'une rechute.",
    topic_ids: ["honte"],
  },
];

Deno.test("target resolver resolves scenario 09 by explicit entity and semantic overlap", () => {
  const result = resolveCorrectionTarget({
    user_message: "Non, Tania c'est mon ex, pas ma soeur.",
    candidates,
    mentioned_entities: ["Tania"],
  });
  assertEquals(result.target_item_id, "wrong_relation");
  assertEquals(result.needs_confirmation, false);
});

Deno.test("target resolver asks confirmation for ambiguous low-confidence correction", () => {
  const result = resolveCorrectionTarget({
    user_message: "corrige ca",
    candidates,
  });
  assertEquals(result.target_item_id, null);
  assertEquals(result.needs_confirmation, true);
});

Deno.test("target resolver prefers previous payload item", () => {
  const result = resolveCorrectionTarget({
    user_message: "efface ce souvenir",
    candidates,
    previous_payload_item_ids: ["other"],
  });
  assertEquals(result.target_item_id, "other");
});
