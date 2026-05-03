import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runMemorizerDryRun } from "../memorizer/dry_run.ts";
import { heuristicExtractionProvider } from "../memorizer/heuristic_extract.ts";
import { InMemoryMemorizerRepository } from "../memorizer/memory_repo_test_utils.ts";
import type {
  KnownEntity,
  KnownTopic,
  MemorizerMessage,
} from "../memorizer/types.ts";
import { loadScenarios } from "./scenario_loader.ts";

const TARGETS = new Set([
  "04_reopen_dormant_cannabis",
  "06_dated_event_friday",
  "07_action_missed_walk",
  "08_strong_statement_self_blame",
  "12_entity_father_aliases",
]);

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
        llm_provider: async ({ user_payload }) =>
          heuristicExtractionProvider(user_payload),
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
