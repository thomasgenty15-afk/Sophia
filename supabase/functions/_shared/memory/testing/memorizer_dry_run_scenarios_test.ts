import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runMemorizerDryRun } from "../memorizer/dry_run.ts";
import { InMemoryMemorizerRepository } from "../memorizer/memory_repo_test_utils.ts";
import type {
  KnownEntity,
  KnownTopic,
  MemorizerMessage,
} from "../memorizer/types.ts";
import { loadScenarios } from "./scenario_loader.ts";
import type { ScenarioTurn } from "./types.ts";

const TARGETS = new Set([
  "04_reopen_dormant_cannabis",
  "06_dated_event_friday",
  "07_action_missed_walk",
  "08_strong_statement_self_blame",
  "12_entity_father_aliases",
]);

function fixtureExtractionForTurn(turn: ScenarioTurn, messageId: string): string {
  const memoryItems = (turn.expect.created_items ?? []).map((expected, index) => {
    const domainKey = expected.domain_keys_any_of?.[0] ?? "";
    const sensitiveByDomain = domainKey.startsWith("relations.") ||
      domainKey.startsWith("addictions.") ||
      domainKey.startsWith("psychologie.");
    const entityMention = expected.linked_entity_aliases_any_of?.[0] ?? null;
    return {
      kind: expected.kind,
      content_text: turn.user ?? "",
      normalized_summary: turn.user ?? "",
      domain_keys: domainKey ? [domainKey] : [],
      confidence: 0.82,
      importance_score: 0.68,
      sensitivity_level: expected.sensitivity_level ??
        (sensitiveByDomain ? "sensitive" : "normal"),
      sensitivity_categories: domainKey.startsWith("relations.")
        ? ["family"]
        : domainKey.startsWith("addictions.")
        ? ["addiction"]
        : domainKey.startsWith("psychologie.")
        ? ["mental_health"]
        : [],
      source_message_ids: [messageId],
      evidence_quote: turn.user ?? "",
      event_start_at: expected.kind === "event"
        ? "2026-05-06T00:00:00.000+02:00"
        : null,
      time_precision: expected.kind === "event" ? "day" : null,
      entity_mentions: entityMention ? [entityMention] : [],
      metadata: expected.linked_action
        ? { observation_role: "single" }
        : { fixture_index: index },
    };
  });
  const linkedEntityAliases = (turn.expect.created_items ?? [])
    .flatMap((item) => item.linked_entity_aliases_any_of ?? []);
  const entities = [
    ...(turn.expect.created_entities ?? []).map((expected, index) => ({
      entity_type: expected.entity_type ?? "person",
      display_name: expected.display_name ?? expected.aliases_any_of?.[0] ??
        `entity-${index}`,
      aliases: expected.aliases_any_of ?? [],
      relation_to_user: expected.relation_to_user ?? null,
      confidence: 0.82,
      metadata: {},
    })),
    ...linkedEntityAliases.map((alias) => ({
      entity_type: "person",
      display_name: alias,
      aliases: [alias],
      relation_to_user: alias.toLowerCase().includes("papa") ||
          alias.toLowerCase().includes("pere")
        ? "father"
        : null,
      confidence: 0.82,
      metadata: {},
    })),
  ];
  return JSON.stringify({
    memory_items: memoryItems,
    entities,
    corrections: [],
    rejected_observations: [],
  });
}

Deno.test("memorizer dry-run scenarios expose expected created items and no forbidden items", async () => {
  const scenarios = (await loadScenarios()).filter((s) => TARGETS.has(s.id));
  for (const scenario of scenarios) {
    const repo = new InMemoryMemorizerRepository();
    const topics: KnownTopic[] = (scenario.initial_state?.topics ?? []).map((
      t,
    ) => ({
      id: t.slug,
      slug: t.slug,
      title: t.title,
      lifecycle_stage: t.lifecycle_stage,
      search_doc: t.search_doc,
      domain_keys: t.domain_keys,
    }));
    const entities: KnownEntity[] = (scenario.initial_state?.entities ?? [])
      .map((e, i) => ({
        id: e.id ?? `entity-${i}`,
        entity_type: (e.entity_type ?? "person") as KnownEntity["entity_type"],
        display_name: e.display_name,
        aliases: e.aliases,
        relation_to_user: e.relation_to_user,
        status: e.status ?? "active",
      }));
    for (const [index, turn] of scenario.turns.entries()) {
      const message: MemorizerMessage = {
        id: `${scenario.id}-m${index}`,
        user_id: "u",
        role: "user",
        content: turn.user ?? "",
      };
      const result = await runMemorizerDryRun(repo, {
        user_id: "u",
        messages: [message],
        known_topics: topics,
        known_entities: entities,
        active_topic: topics[0] ?? null,
        plan_signals: [{
          plan_item_id: "walk-plan",
          title: "marche",
          occurrence_ids: ["occ-1"],
        }],
        llm_provider: async () => fixtureExtractionForTurn(turn, message.id),
      });
      for (const expected of turn.expect.created_items ?? []) {
        const found = result.dry_run_candidates.some((candidate) =>
          candidate.item.kind === expected.kind &&
          (expected.contains ?? []).every((needle) =>
            candidate.item.content_text.toLowerCase().includes(
              needle.toLowerCase(),
            )
          ) &&
          (!expected.linked_action || Boolean(candidate.action_link)) &&
          (!expected.linked_entity_aliases_any_of ||
            candidate.entity_links?.some((link) =>
              expected.linked_entity_aliases_any_of?.some((alias) =>
                link.mention.toLowerCase().includes(alias.toLowerCase())
              )
            ))
        );
        assertEquals(found, true, `${scenario.id} turn ${index + 1}`);
      }
      for (const forbidden of turn.expect.forbidden_items ?? []) {
        const found = result.dry_run_candidates.some((candidate) =>
          (!forbidden.kind || candidate.item.kind === forbidden.kind) &&
          (forbidden.contains ?? []).some((needle) =>
            candidate.item.content_text.toLowerCase().includes(
              needle.toLowerCase(),
            )
          )
        );
        assertEquals(
          found,
          false,
          `${scenario.id} forbidden turn ${index + 1}`,
        );
      }
      assertEquals(result.durable_writes.memory_items, 0);
    }
  }
});
