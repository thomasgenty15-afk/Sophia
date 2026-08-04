import { assertEquals } from "jsr:@std/assert@1";

import {
  computeCurrentWeekOrder,
  firstAssignedWeekForTempId,
  firstAssignedWeekOrderByTempId,
  isWeekUnlocked,
  readGeneratedTempId,
  resolveScheduleAnchor,
} from "./v2-week-activation.ts";

function makeContent(overrides?: {
  anchorWeekStart?: string;
  timezone?: string;
  weeks?: Array<Record<string, unknown>>;
}) {
  return {
    metadata: {
      schedule_anchor: {
        timezone: overrides?.timezone ?? "Europe/Paris",
        anchor_week_start: overrides?.anchorWeekStart ?? "2026-07-06",
        anchor_week_end: "2026-07-12",
      },
    },
    current_level_runtime: {
      phase_id: "phase-1",
      weeks: overrides?.weeks ?? [
        {
          week_order: 1,
          item_assignments: [
            { temp_id: "gen-p1-habits-001" },
            { temp_id: "gen-p1-missions-001" },
          ],
        },
        {
          week_order: 2,
          item_assignments: [
            { temp_id: "gen-p1-habits-001" },
            { temp_id: "gen-p1-missions-002" },
          ],
        },
        {
          week_order: 3,
          item_assignments: [{ temp_id: "gen-p1-missions-003" }],
        },
      ],
    },
  };
}

Deno.test("resolveScheduleAnchor reads content.metadata.schedule_anchor", () => {
  const anchor = resolveScheduleAnchor(makeContent());
  assertEquals(anchor, {
    timezone: "Europe/Paris",
    anchor_week_start: "2026-07-06",
  });
  assertEquals(resolveScheduleAnchor({}), null);
  assertEquals(resolveScheduleAnchor(null), null);
});

Deno.test("computeCurrentWeekOrder derives the week from the anchor calendar", () => {
  const content = makeContent();
  // Lundi 2026-07-06 = début de semaine 1.
  assertEquals(
    computeCurrentWeekOrder(content, new Date("2026-07-06T08:00:00Z")),
    1,
  );
  // Dimanche de la semaine 1.
  assertEquals(
    computeCurrentWeekOrder(content, new Date("2026-07-12T20:00:00Z")),
    1,
  );
  // Lundi suivant = semaine 2.
  assertEquals(
    computeCurrentWeekOrder(content, new Date("2026-07-13T08:00:00Z")),
    2,
  );
  // Trois semaines plus tard = semaine 4 (au-delà du niveau: tout est dû).
  assertEquals(
    computeCurrentWeekOrder(content, new Date("2026-07-27T08:00:00Z")),
    4,
  );
  // Avant l'ancre: 0 (aucune semaine commencée).
  assertEquals(
    computeCurrentWeekOrder(content, new Date("2026-06-29T08:00:00Z")),
    0,
  );
  // Sans ancre: null (fail-open côté appelants).
  assertEquals(computeCurrentWeekOrder({}, new Date()), null);
});

Deno.test("firstAssignedWeekOrderByTempId keeps the earliest week per temp_id", () => {
  const map = firstAssignedWeekOrderByTempId(makeContent(), "phase-1");
  assertEquals(map.get("gen-p1-habits-001"), 1);
  assertEquals(map.get("gen-p1-missions-001"), 1);
  assertEquals(map.get("gen-p1-missions-002"), 2);
  assertEquals(map.get("gen-p1-missions-003"), 3);
  assertEquals(map.get("gen-p1-ghost"), undefined);
});

Deno.test("isWeekUnlocked unlocks past/current weeks and fails open on missing info", () => {
  // Semaine 2 pendant la semaine 3 → débloqué (rattrapage des orphelins).
  assertEquals(
    isWeekUnlocked({ firstAssignedWeekOrder: 2, currentWeekOrder: 3 }),
    true,
  );
  assertEquals(
    isWeekUnlocked({ firstAssignedWeekOrder: 2, currentWeekOrder: 2 }),
    true,
  );
  assertEquals(
    isWeekUnlocked({ firstAssignedWeekOrder: 2, currentWeekOrder: 1 }),
    false,
  );
  // Semaine 1 toujours débloquée, même si le plan n'a pas commencé (0).
  assertEquals(
    isWeekUnlocked({ firstAssignedWeekOrder: 1, currentWeekOrder: 0 }),
    true,
  );
  // Informations manquantes → fail-open.
  assertEquals(
    isWeekUnlocked({ firstAssignedWeekOrder: null, currentWeekOrder: 1 }),
    true,
  );
  assertEquals(
    isWeekUnlocked({ firstAssignedWeekOrder: 3, currentWeekOrder: null }),
    true,
  );
});

Deno.test("readGeneratedTempId reads payload._generation.temp_id", () => {
  assertEquals(
    readGeneratedTempId({
      payload: { _generation: { temp_id: "gen-p1-missions-002" } },
    }),
    "gen-p1-missions-002",
  );
  assertEquals(
    readGeneratedTempId({ payload: { generation: { temp_id: "gen-x" } } }),
    "gen-x",
  );
  assertEquals(readGeneratedTempId({ payload: {} }), null);
  assertEquals(readGeneratedTempId({}), null);
});

Deno.test("firstAssignedWeekForTempId resolves via the map", () => {
  const map = new Map([["gen-a", 2]]);
  assertEquals(firstAssignedWeekForTempId("gen-a", map), 2);
  assertEquals(firstAssignedWeekForTempId("gen-b", map), null);
  assertEquals(firstAssignedWeekForTempId(null, map), null);
});
