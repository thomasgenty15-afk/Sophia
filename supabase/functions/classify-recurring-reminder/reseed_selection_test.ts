import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  advanceReseedCursor,
  decideReseedChain,
  eligibleReseedUserIds,
  hasReseedBudgetLeft,
  parseReseedCursor,
  RESEED_ALL_DEFAULT_LIMIT,
  RESEED_ALL_MAX_LIMIT,
  RESEED_BATCH_DEFAULT_SIZE,
  RESEED_BATCH_MAX_SIZE,
  RESEED_MAX_CHAIN_DEPTH,
  RESEED_SELECT_COLUMNS,
  RESEED_TIME_BUDGET_MS,
  reseedCursorToBody,
  reseedHorizon,
  reseedLevelForRow,
  resolveChainDepth,
  resolveReseedBatchSize,
  resolveReseedLimit,
  selectReseedTargets,
  type ReseedCursor,
  type ReseedPersonalizationLevel,
} from "./reseed_selection.ts";

const heuristic = (
  instruction: string,
  _rationale: string,
): ReseedPersonalizationLevel => (instruction.includes("pourquoi") ? 2 : 1);

Deno.test("W1.3 bug 4: the select list carries every column seedReminderUntilNextSunday reads", () => {
  const columns = new Set(RESEED_SELECT_COLUMNS.split(","));
  for (
    const required of [
      "id",
      "user_id",
      "status",
      "local_time_hhmm",
      "scheduled_days",
      "message_instruction",
      "rationale",
      "transformation_id",
      "initiative_kind",
      "personalization_level",
      "target_kind",
      "target_plan_item_id",
      "target_action_family_key",
      "target_generated_temp_id",
      "target_binding_policy",
      "target_lifecycle_policy",
    ]
  ) {
    assertEquals(columns.has(required), true, `missing column ${required}`);
  }
});

Deno.test("W1.3 bug 4: resolveReseedLimit clamps, never returns 0 or unbounded", () => {
  assertEquals(resolveReseedLimit(undefined), RESEED_ALL_DEFAULT_LIMIT);
  assertEquals(resolveReseedLimit(null), RESEED_ALL_DEFAULT_LIMIT);
  assertEquals(resolveReseedLimit("nope"), RESEED_ALL_DEFAULT_LIMIT);
  assertEquals(resolveReseedLimit(0), RESEED_ALL_DEFAULT_LIMIT);
  assertEquals(resolveReseedLimit(-5), RESEED_ALL_DEFAULT_LIMIT);
  assertEquals(resolveReseedLimit(10), 10);
  assertEquals(resolveReseedLimit(10.9), 10);
  assertEquals(resolveReseedLimit(999999), RESEED_ALL_MAX_LIMIT);
});

Deno.test("W1.3 bug 4: eligibility = WhatsApp tier AND not pending deletion (RGPD)", () => {
  const eligible = eligibleReseedUserIds([
    { id: "u-trial", access_tier: "trial", account_status: "active" },
    { id: "u-alliance", access_tier: "alliance", account_status: null },
    { id: "u-architecte", access_tier: "architecte" },
    { id: "u-free", access_tier: "free", account_status: "active" },
    { id: "u-none", access_tier: null },
    { id: "u-deleting", access_tier: "alliance", account_status: "deletion_pending" },
    { id: "", access_tier: "alliance" },
  ]);
  assertEquals(
    [...eligible].sort(),
    ["u-alliance", "u-architecte", "u-trial"],
  );
});

Deno.test("W1.3 bug 4: level = stored classification, heuristic only for legacy rows", () => {
  assertEquals(reseedLevelForRow({ personalization_level: 3 }, heuristic), 3);
  assertEquals(reseedLevelForRow({ personalization_level: 2 }, heuristic), 2);
  assertEquals(reseedLevelForRow({ personalization_level: 1 }, heuristic), 1);
  assertEquals(
    reseedLevelForRow(
      { personalization_level: null, message_instruction: "rappelle-moi pourquoi" },
      heuristic,
    ),
    2,
  );
  assertEquals(
    reseedLevelForRow({ message_instruction: "bois de l'eau" }, heuristic),
    1,
  );
});

Deno.test("W1.3 bug 4: potion follow-ups and ineligible users are left alone", () => {
  const reminders = [
    { id: "r1", user_id: "u-ok", initiative_kind: "base_free", personalization_level: 2 },
    { id: "r2", user_id: "u-ok", initiative_kind: "potion_follow_up", personalization_level: 1 },
    { id: "r3", user_id: "u-free", initiative_kind: "base_free", personalization_level: 1 },
    { id: "r4", user_id: "u-ok", initiative_kind: "base_free", personalization_level: null,
      message_instruction: "bois de l'eau" },
  ];
  const selection = selectReseedTargets({
    reminders,
    eligibleUserIds: new Set(["u-ok"]),
    heuristic,
  });

  assertEquals(selection.targets.map((target) => target.row.id), ["r1", "r4"]);
  assertEquals(selection.targets.map((target) => target.level), [2, 1]);
  assertEquals(selection.skippedPotionFollowUp, 1);
  assertEquals(selection.skippedIneligible, 1);
});

Deno.test("W1.3 bug 4: an empty fleet selects nothing and throws nothing", () => {
  const empty = selectReseedTargets({
    reminders: null,
    eligibleUserIds: new Set<string>(),
    heuristic,
  });
  assertEquals(empty.targets.length, 0);
  assertEquals(empty.skippedIneligible, 0);
  assertEquals(empty.skippedPotionFollowUp, 0);
});

// --- horizon (W1.3 bug 4, second half) --------------------------------------

/** Weekday index (0 = Sunday) reached from `todayIdx` after `offset` days. */
function weekdayAt(todayIdx: number, offset: number): number {
  return (todayIdx + offset) % 7;
}

Deno.test("W1.3 bug 4: the horizon always reaches the next Sunday", () => {
  // untilSunday = daysUntilNextSunday(): 7 on a Sunday, 1 on a Saturday.
  for (let untilSunday = 1; untilSunday <= 7; untilSunday++) {
    const { maxOffset, cancelUntilDayOffset } = reseedHorizon(untilSunday);
    // The regression: maxOffset used to be untilSunday - 1, which stopped the
    // day BEFORE the next Sunday.
    if (maxOffset < untilSunday) {
      throw new Error(`horizon stops short of Sunday for untilSunday=${untilSunday}`);
    }
    // The cancel window must cover every slot the pass writes.
    if (cancelUntilDayOffset <= maxOffset) {
      throw new Error(`cancel window does not cover the last slot (${untilSunday})`);
    }
  }
});

Deno.test("W1.3 bug 4 (regression): a Monday pass still covers Sunday", () => {
  // The weekly cron fires Sunday 18:00 UTC, which is Monday 07:00 in Auckland.
  // Monday => daysUntilNextSunday() = 6. The old horizon (6 - 1 = 5) covered
  // Mon..Sat and Sunday was never seeded, week after week.
  const mondayIdx = 1;
  const { maxOffset } = reseedHorizon(6);
  const covered = new Set<number>();
  for (let offset = 0; offset <= maxOffset; offset++) {
    covered.add(weekdayAt(mondayIdx, offset));
  }
  assertEquals(covered.size, 7);
  assertEquals(covered.has(0), true); // Sunday
});

Deno.test("W1.3 bug 4: a Sunday pass covers the full week", () => {
  const sundayIdx = 0;
  const { maxOffset } = reseedHorizon(7);
  const covered = new Set<number>();
  for (let offset = 0; offset <= maxOffset; offset++) {
    covered.add(weekdayAt(sundayIdx, offset));
  }
  assertEquals(covered.size, 7);
});

Deno.test("W1.3 bug 4: an out-of-range horizon throws (R7)", () => {
  assertThrows(() => reseedHorizon(0));
  assertThrows(() => reseedHorizon(8));
  assertThrows(() => reseedHorizon(Number.NaN));
});

// --- W1.4 R1: cursor + chaining ---------------------------------------------

Deno.test("W1.4 R1: resolveReseedBatchSize clamps, never 0, never unbounded", () => {
  assertEquals(resolveReseedBatchSize(undefined), RESEED_BATCH_DEFAULT_SIZE);
  assertEquals(resolveReseedBatchSize(0), RESEED_BATCH_DEFAULT_SIZE);
  assertEquals(resolveReseedBatchSize(-3), RESEED_BATCH_DEFAULT_SIZE);
  assertEquals(resolveReseedBatchSize("nope"), RESEED_BATCH_DEFAULT_SIZE);
  assertEquals(resolveReseedBatchSize(10), 10);
  assertEquals(resolveReseedBatchSize(10.9), 10);
  assertEquals(resolveReseedBatchSize(10_000), RESEED_BATCH_MAX_SIZE);
});

Deno.test("W1.4 R1: no cursor in the body = start of the fleet", () => {
  assertEquals(parseReseedCursor({}), null);
  assertEquals(parseReseedCursor({ action: "reseed_all" }), null);
  assertEquals(parseReseedCursor(null), null);
  assertEquals(parseReseedCursor({ after_id: null }), null);
});

Deno.test("W1.4 R1: a malformed cursor throws instead of restarting at the head (R7)", () => {
  // The whole point: silently falling back to "no cursor" re-seeds the first
  // page forever and never reaches the tail of the fleet.
  assertThrows(
    () => parseReseedCursor({ after_id: "   " }),
    Error,
    "after_id is empty",
  );
  assertThrows(
    () => parseReseedCursor({ after_id: 42 }),
    Error,
    "must be a string",
  );
});

Deno.test("W1.4 R1: a well-formed cursor round-trips through the wire form", () => {
  const cursor = parseReseedCursor({ after_id: "r2" });
  assertEquals(cursor, { afterId: "r2" });
  assertEquals(reseedCursorToBody(cursor!), { after_id: "r2" });
  assertEquals(parseReseedCursor(reseedCursorToBody(cursor!)), cursor);
});

Deno.test("W1.4 R1: a full page hands over a cursor, a short page ends the pass", () => {
  const page = [{ id: "r1" }, { id: "r2" }];
  assertEquals(advanceReseedCursor(page, 2), { afterId: "r2" });
  // Short page = fleet exhausted; chaining here would loop on an empty tail.
  assertEquals(advanceReseedCursor(page, 3), null);
  assertEquals(advanceReseedCursor([], 3), null);
  assertEquals(advanceReseedCursor(null, 3), null);
});

Deno.test("W1.4 R1: a row without an id throws (no keyset, no blind paging)", () => {
  assertThrows(
    () => advanceReseedCursor([{ id: "r1" }, { id: "  " }], 2),
    Error,
    "has no id",
  );
});

Deno.test("W1.4 R1: a whole fleet is walked exactly once, ties included", () => {
  // The regression this replaces: with no cursor at all, every retry replayed
  // page 1 and the tail was never seeded.
  //
  // The second regression, caught by this very test on the first draft: a
  // `created_at` keyset starves when rows share a timestamp, which is the
  // NORMAL case for a bulk insert (now() is transaction time). Hence the pkey.
  const fleet = [
    { id: "a", created_at: "2026-07-01T00:00:00Z" },
    { id: "b", created_at: "2026-07-02T00:00:00Z" },
    { id: "c", created_at: "2026-07-02T00:00:00Z" }, // same transaction as b
    { id: "d", created_at: "2026-07-02T00:00:00Z" }, // ...and as c
    { id: "e", created_at: "2026-07-02T00:00:00Z" }, // a whole page of ties
    { id: "f", created_at: "2026-07-04T00:00:00Z" },
    { id: "g", created_at: "2026-07-05T00:00:00Z" },
  ];
  const batchSize = 2;
  const processed: string[] = [];
  let cursor: ReseedCursor | null = null;

  for (let guard = 0; guard < 50; guard++) {
    // What the DB returns: id > cursor, ordered by id, limit batchSize.
    const page = fleet
      .filter((row) => !cursor || row.id > cursor.afterId)
      .slice(0, batchSize);
    for (const row of page) processed.push(row.id);
    cursor = advanceReseedCursor(page, batchSize);
    if (!cursor) break;
  }

  assertEquals(processed, ["a", "b", "c", "d", "e", "f", "g"]);
  assertEquals(cursor, null);
});

Deno.test("W1.4 R1: chaining is decided on cursor + depth, never on hope", () => {
  const cursor = { afterId: "r2" };

  assertEquals(
    decideReseedChain({ nextCursor: null, chainDepth: 0, elapsedMs: 90_000 }),
    { chain: false, reason: "fleet_exhausted" },
  );
  assertEquals(
    decideReseedChain({ nextCursor: cursor, chainDepth: 0, elapsedMs: 61_000 }),
    { chain: true, reason: "time_budget_reached" },
  );
  assertEquals(
    decideReseedChain({ nextCursor: cursor, chainDepth: 3, elapsedMs: 1_000 }),
    { chain: true, reason: "scan_limit_reached" },
  );
  // Hard stop: a self-invoking function with no depth ceiling is a billing
  // incident waiting to happen.
  assertEquals(
    decideReseedChain({
      nextCursor: cursor,
      chainDepth: RESEED_MAX_CHAIN_DEPTH,
      elapsedMs: 1_000,
    }),
    { chain: false, reason: "max_chain_depth_reached" },
  );
  assertEquals(resolveChainDepth(undefined), 0);
  assertEquals(resolveChainDepth(-4), 0);
  assertEquals(resolveChainDepth(3.9), 3);
  assertEquals(resolveChainDepth(10_000), RESEED_MAX_CHAIN_DEPTH + 1);
});

Deno.test("W1.4 R1: one invocation stops on wall clock OR scan limit", () => {
  assertEquals(
    hasReseedBudgetLeft({ elapsedMs: 0, scanned: 0, limit: 500 }),
    true,
  );
  assertEquals(
    hasReseedBudgetLeft({ elapsedMs: RESEED_TIME_BUDGET_MS, scanned: 0, limit: 500 }),
    false,
  );
  assertEquals(
    hasReseedBudgetLeft({ elapsedMs: 0, scanned: 500, limit: 500 }),
    false,
  );
});
