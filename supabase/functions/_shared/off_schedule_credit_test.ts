import { assertEquals } from "jsr:@std/assert@1";

import { creditCompletedEntryToWeekOccurrence } from "./off_schedule_credit.ts";

type OccRow = {
  id: string;
  planned_day: string;
  actual_day: string | null;
  status: string;
};

/** Stub minimal du client supabase pour le chemin select + update du module. */
function makeStubClient(rows: OccRow[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          const chain = {
            eq: () => chain,
            in: () => Promise.resolve({ data: rows, error: null }),
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          let targetId: string | null = null;
          const chain = {
            eq: (col: string, value: string) => {
              if (col === "id") targetId = value;
              return chain;
            },
            in: () => {
              if (targetId) updates.push({ id: targetId, patch });
              return Promise.resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, updates };
}

Deno.test("credit prefers the exact-day open occurrence", async () => {
  const { client, updates } = makeStubClient([
    { id: "occ-mon", planned_day: "mon", actual_day: null, status: "planned" },
    { id: "occ-wed", planned_day: "wed", actual_day: null, status: "planned" },
  ]);

  // 2026-04-29 = mercredi.
  const result = await creditCompletedEntryToWeekOccurrence({
    supabase: client,
    userId: "user-1",
    planItemId: "item-1",
    effectiveLocalDate: "2026-04-29",
    nowIso: "2026-04-29T12:00:00.000Z",
  });

  assertEquals(result.credited, "exact_day");
  assertEquals(result.occurrence_id, "occ-wed");
  assertEquals(updates.length, 1);
  assertEquals(updates[0].id, "occ-wed");
  assertEquals(updates[0].patch.status, "done");
  assertEquals(updates[0].patch.actual_day, "wed");
});

Deno.test("credit falls back to the earliest open occurrence of the week", async () => {
  const { client, updates } = makeStubClient([
    { id: "occ-fri", planned_day: "fri", actual_day: null, status: "planned" },
    { id: "occ-sat", planned_day: "sat", actual_day: null, status: "planned" },
  ]);

  // Fait mardi alors que les occurrences sont vendredi/samedi.
  const result = await creditCompletedEntryToWeekOccurrence({
    supabase: client,
    userId: "user-1",
    planItemId: "item-1",
    effectiveLocalDate: "2026-04-28",
    nowIso: "2026-04-28T12:00:00.000Z",
  });

  assertEquals(result.credited, "same_week");
  assertEquals(result.occurrence_id, "occ-fri");
  assertEquals(updates[0].patch.actual_day, "tue");
});

Deno.test("credit is a no-op when no open occurrence exists", async () => {
  const { client, updates } = makeStubClient([]);

  const result = await creditCompletedEntryToWeekOccurrence({
    supabase: client,
    userId: "user-1",
    planItemId: "item-1",
    effectiveLocalDate: "2026-04-28",
  });

  assertEquals(result.credited, "none");
  assertEquals(result.occurrence_id, null);
  assertEquals(updates.length, 0);
});

Deno.test("credit rejects an invalid effective date without touching anything", async () => {
  const { client, updates } = makeStubClient([
    { id: "occ-mon", planned_day: "mon", actual_day: null, status: "planned" },
  ]);

  const result = await creditCompletedEntryToWeekOccurrence({
    supabase: client,
    userId: "user-1",
    planItemId: "item-1",
    effectiveLocalDate: "pas-une-date",
  });

  assertEquals(result.credited, "none");
  assertEquals(Boolean(result.warning), true);
  assertEquals(updates.length, 0);
});
