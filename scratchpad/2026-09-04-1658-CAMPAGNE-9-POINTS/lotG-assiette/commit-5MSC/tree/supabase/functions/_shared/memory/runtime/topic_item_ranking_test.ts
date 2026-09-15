import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import { rankTopicItemsForBudget } from "./loader.ts";
import type { MemoryV2Item } from "./loader.ts";

const NOW = Date.parse("2026-07-10T12:00:00Z");

function item(
  id: string,
  importance: number,
  observedDaysAgo: number,
): MemoryV2Item {
  return {
    id,
    status: "active",
    importance_score: importance,
    observed_at: new Date(NOW - observedDaysAgo * 86_400_000).toISOString(),
  } as unknown as MemoryV2Item;
}

Deno.test("high-importance objective survives the budget cut", () => {
  // Reproduit le rouge QA: 8 items, budget 3, l'objectif (importance 0.7)
  // noyé parmi des items anodins plus "anciens en position de requete".
  const items = [
    item("casual-1", 0.4, 1),
    item("casual-2", 0.4, 1),
    item("casual-3", 0.4, 1),
    item("casual-4", 0.35, 2),
    item("objectif-10km", 0.75, 3),
    item("casual-5", 0.3, 4),
    item("casual-6", 0.3, 5),
    item("casual-7", 0.3, 6),
  ];
  const ranked = rankTopicItemsForBudget(items, 3, NOW);
  assert(ranked.some((entry) => entry.id === "objectif-10km"));
});

Deno.test("fresh updates are not starved by old important facts", () => {
  // Anti-faux-positif: un vieux fait tres important ne doit pas evincer
  // toutes les updates fraiches du theme.
  const items = [
    item("vieux-important-1", 0.9, 120),
    item("vieux-important-2", 0.9, 150),
    item("vieux-important-3", 0.85, 180),
    item("update-fraiche", 0.5, 0),
  ];
  const ranked = rankTopicItemsForBudget(items, 3, NOW);
  assert(ranked.some((entry) => entry.id === "update-fraiche"));
});

Deno.test("ranking respects the budget and tolerates missing fields", () => {
  const bare = [{ id: "sans-champs", status: "active" }] as unknown as
    MemoryV2Item[];
  assertEquals(rankTopicItemsForBudget(bare, 3, NOW).length, 1);
  assertEquals(rankTopicItemsForBudget([], 3, NOW).length, 0);
});
