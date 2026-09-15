import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { logPlanItemProgressV2, planItemPatchForCompletedEntry } from "./db.ts";

Deno.test("planItemPatchForCompletedEntry mirrors the dashboard write contract", () => {
  const now = "2026-07-02T12:00:00.000Z";

  // Habit en construction: +1, reste active_building sous la cible.
  assertEquals(
    planItemPatchForCompletedEntry({
      dimension: "habits",
      tracking_type: "boolean",
      status: "active",
      current_habit_state: "active_building",
      target_reps: 3,
      current_reps: 0,
      activated_at: "2026-06-01T00:00:00.000Z",
    } as any, now),
    {
      current_reps: 1,
      status: "active",
      current_habit_state: "active_building",
      activated_at: "2026-06-01T00:00:00.000Z",
      completed_at: null,
    },
  );

  // Habit qui atteint la cible: in_maintenance + completed_at.
  assertEquals(
    planItemPatchForCompletedEntry({
      dimension: "habits",
      tracking_type: "boolean",
      status: "active",
      current_habit_state: "active_building",
      target_reps: 3,
      current_reps: 2,
      activated_at: "2026-06-01T00:00:00.000Z",
    } as any, now),
    {
      current_reps: 3,
      status: "in_maintenance",
      current_habit_state: "in_maintenance",
      activated_at: "2026-06-01T00:00:00.000Z",
      completed_at: now,
    },
  );

  // Mission boolean: completed des la premiere completion.
  const mission = planItemPatchForCompletedEntry({
    dimension: "missions",
    tracking_type: "boolean",
    status: "active",
    current_habit_state: null,
    target_reps: 1,
    current_reps: 0,
    activated_at: null,
  } as any, now);
  assertEquals(mission?.status, "completed");
  assertEquals(mission?.current_reps, 1);
  assertEquals(mission?.completed_at, now);
  assertEquals(mission?.activated_at, now);

  // Item sans compteur ni tracking boolean: aucun patch.
  assertEquals(
    planItemPatchForCompletedEntry({
      dimension: "clarifications",
      tracking_type: "count",
      status: "active",
      current_habit_state: null,
      target_reps: null,
      current_reps: null,
      activated_at: null,
    } as any, now),
    null,
  );
});

function makeFakeSupabaseForLog(opts: {
  item: Record<string, unknown>;
  existingEntries?: Array<Record<string, unknown>>;
  onItemUpdate?: (patch: Record<string, unknown>) => void;
}) {
  const inserts: Record<string, unknown[]> = {};
  return {
    inserts,
    from(table: string) {
      if (table === "user_plan_items") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          limit: () => chain,
          maybeSingle: () =>
            Promise.resolve({ data: opts.item, error: null }),
          update(patch: Record<string, unknown>) {
            opts.onItemUpdate?.(patch);
            return {
              eq: () => Promise.resolve({ error: null }),
            };
          },
        };
        return chain;
      }
      // user_plan_item_entries + system_runtime_snapshots (analytics)
      const chain: any = {
        insert(row: unknown) {
          (inserts[table] ??= []).push(row);
          return Promise.resolve({ error: null });
        },
        // Garde d'idempotence journaliere: lecture des entries du jour.
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        gte: () => chain,
        lt: () => chain,
        order: () => chain,
        limit: () =>
          Promise.resolve({ data: opts.existingEntries ?? [], error: null }),
      };
      return chain;
    },
  };
}

const FAKE_RUNTIME = {
  cycle: { id: "cycle-1" },
  transformation: { id: "transfo-1" },
  plan: { id: "plan-1" },
} as any;

Deno.test("logPlanItemProgressV2 patches the counter on completed and never on missed", async () => {
  const item = {
    id: "item-1",
    plan_id: "plan-1",
    title: "Faire un sas de décompression (sans fumer)",
    dimension: "habits",
    kind: "habit",
    tracking_type: "boolean",
    status: "active",
    current_habit_state: "active_building",
    target_reps: 3,
    current_reps: 0,
    activated_at: "2026-06-01T00:00:00.000Z",
  };

  // Positif: completed => entry + patch compteur.
  const patches: Record<string, unknown>[] = [];
  const supabase = makeFakeSupabaseForLog({
    item,
    onItemUpdate: (patch) => patches.push(patch),
  });
  const logged = await logPlanItemProgressV2({
    supabase: supabase as any,
    userId: "user-1",
    planItemId: "item-1",
    status: "completed",
    source: "web",
    sourceMessageId: "msg-1",
    runtime: FAKE_RUNTIME,
  });
  assertEquals(logged.mode, "logged");
  assert(logged.logged_progress_id);
  assertEquals(supabase.inserts["user_plan_item_entries"]?.length, 1);
  assertEquals(patches.length, 1);
  assertEquals(patches[0].current_reps, 1);
  assertEquals(patches[0].status, "active");

  // Anti-faux-positif: missed => entry skip, compteur jamais touche.
  const missedPatches: Record<string, unknown>[] = [];
  const supabaseMissed = makeFakeSupabaseForLog({
    item,
    onItemUpdate: (patch) => missedPatches.push(patch),
  });
  const missed = await logPlanItemProgressV2({
    supabase: supabaseMissed as any,
    userId: "user-1",
    planItemId: "item-1",
    status: "missed",
    source: "web",
    sourceMessageId: "msg-2",
    runtime: FAKE_RUNTIME,
  });
  assertEquals(missed.mode, "logged");
  assertEquals(missedPatches.length, 0);
});

Deno.test("logPlanItemProgressV2 same-day guard: re-entrance converges, foreign duplicate blocks (paul-r1 T15)", async () => {
  const item = {
    id: "item-1",
    plan_id: "plan-1",
    title: "Faire 10 min de mouvement en rentrant",
    dimension: "habits",
    kind: "habit",
    tracking_type: "boolean",
    status: "active",
    current_habit_state: "active_building",
    target_reps: 3,
    current_reps: 1,
    activated_at: "2026-06-01T00:00:00.000Z",
  };
  const existing = {
    id: "entry-earlier",
    outcome: "completed",
    created_at: "2026-07-03T01:03:34.000Z",
    metadata: { source_message_id: "msg-earlier" },
  };

  // Re-entrance meme tour (meme source_message_id): commit existant re-renvoye,
  // aucune 2e ecriture.
  const reentrant = makeFakeSupabaseForLog({
    item,
    existingEntries: [{
      ...existing,
      metadata: { source_message_id: "msg-1" },
    }],
  });
  const reentrantResult = await logPlanItemProgressV2({
    supabase: reentrant as any,
    userId: "user-1",
    planItemId: "item-1",
    status: "completed",
    source: "web",
    sourceMessageId: "msg-1",
    runtime: FAKE_RUNTIME,
  });
  assertEquals(reentrantResult.mode, "logged");
  assertEquals(reentrantResult.logged_progress_id, "entry-earlier");
  assertEquals(reentrant.inserts["user_plan_item_entries"], undefined);

  // Autre message, meme (item, jour, outcome): already_logged, zero re-write.
  const duplicate = makeFakeSupabaseForLog({
    item,
    existingEntries: [existing],
  });
  const duplicateResult = await logPlanItemProgressV2({
    supabase: duplicate as any,
    userId: "user-1",
    planItemId: "item-1",
    status: "completed",
    source: "web",
    sourceMessageId: "msg-later",
    runtime: FAKE_RUNTIME,
  });
  assertEquals(duplicateResult.mode, "already_logged");
  assertEquals(duplicateResult.logged_progress_id, "entry-earlier");
  assertEquals(duplicate.inserts["user_plan_item_entries"], undefined);

  // Anti-faux-positif: outcome different le meme jour (completed apres
  // missed) reste un vrai write.
  const differentOutcome = makeFakeSupabaseForLog({
    item,
    existingEntries: [],
  });
  const written = await logPlanItemProgressV2({
    supabase: differentOutcome as any,
    userId: "user-1",
    planItemId: "item-1",
    status: "completed",
    source: "web",
    sourceMessageId: "msg-later",
    runtime: FAKE_RUNTIME,
  });
  assertEquals(written.mode, "logged");
  assertEquals(
    differentOutcome.inserts["user_plan_item_entries"]?.length,
    1,
  );
});
