import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  deleteMemoryItem,
  supersedeMemoryItem,
} from "../correction/operations.ts";
import { redactTopicSurface } from "../correction/redaction.ts";
import { resolveCorrectionTarget } from "../correction/target_resolver.ts";
import { InMemoryCorrectionRepository } from "../correction/test_repo.ts";
import { purgeMemoryPayloadItems } from "../runtime/payload_state.ts";
import { loadScenarios } from "./scenario_loader.ts";

Deno.test("scenario 09 correction supersedes wrong Tania sister memory", async () => {
  const scenario = (await loadScenarios()).find((s) =>
    s.id === "09_correction_wrong_memory"
  )!;
  const seed = scenario.initial_state!.memory_items![0];
  const target = resolveCorrectionTarget({
    user_message: scenario.turns[0].user ?? "",
    mentioned_entities: ["Tania"],
    candidates: [{
      id: seed.id!,
      user_id: "u",
      kind: seed.kind,
      status: seed.status ?? "active",
      content_text: seed.content_text,
      entity_aliases: seed.entity_aliases,
    }],
  });
  assertEquals(target.target_item_id, "wrong_relation");
  const repo = new InMemoryCorrectionRepository();
  repo.topicIdsByItem.set("wrong_relation", ["topic-rel"]);
  const result = await supersedeMemoryItem(repo, {
    user_id: "u",
    item_id: "wrong_relation",
    replacement_item_id: "new_tania_ex",
    reason: "user_corrected_relation",
    source_message_id: "m1",
  });
  assertEquals(result.operation_type, "supersede");
  assertEquals(repo.items.get("wrong_relation")?.status, "superseded");
  assertEquals(repo.changeLogs[0].operation_type, "supersede");
});

Deno.test("scenario 10 forget redacts item, sources, topic text and payload", async () => {
  const scenario = (await loadScenarios()).find((s) =>
    s.id === "10_forget_sensitive_item"
  )!;
  const seed = scenario.initial_state!.memory_items![0];
  const repo = new InMemoryCorrectionRepository();
  repo.topicIdsByItem.set(seed.id!, ["topic-honte"]);
  const result = await deleteMemoryItem(repo, {
    user_id: "u",
    item_id: seed.id!,
    reason: "user_forget_request",
    source_message_id: "m1",
    now_iso: "2026-05-01T00:00:00.000Z",
  });
  assertEquals(result.status, "deleted_by_user");
  assertEquals(repo.items.get(seed.id!)?.content_text, "");
  assertEquals(repo.sourceRedactions, [seed.id]);

  const redactedTopic = redactTopicSurface(
    {
      id: "topic-honte",
      synthesis: "Le user dit avoir tres honte d'une rechute.",
      search_doc: "honte rechute sensible",
      pending_changes_count: 0,
      metadata: {},
    },
    {
      id: seed.id!,
      user_id: "u",
      status: "deleted_by_user",
      content_text: seed.content_text,
      normalized_summary: seed.content_text,
    },
    "2026-05-01T00:00:00.000Z",
  );
  assertEquals(redactedTopic.synthesis.includes("honte"), false);
  assertEquals(redactedTopic.search_doc.includes("rechute"), false);

  const temp = purgeMemoryPayloadItems({
    __memory_payload_state_v2: {
      version: 2,
      last_turn_id: "t1",
      active_topic_id: "topic-honte",
      items: [{
        memory_item_id: seed.id!,
        reason: "active_topic_core",
        ttl_turns_remaining: 3,
        sensitivity_level: "sensitive",
        last_injected_at: "2026-05-01T00:00:00.000Z",
      }],
      entities: [],
      modules: {},
      budget: { max_items: 12, max_entities: 5, tokens_target: 1800 },
    },
  }, [seed.id!]);
  assertEquals((temp as any).__memory_payload_state_v2.items, []);
});
