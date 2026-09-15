/**
 * KEEL W4.4 — tests for the dispatcher's student plan context.
 *
 * Three things are pinned here:
 *   1. the fold — prescription + derived facts, with `unknown` surviving as
 *      `unknown` (a commitment with no evaluation row must NOT vanish);
 *   2. the block — what the LLM is told, and what it is forbidden to say;
 *   3. the branch — a KEEL student never receives the legacy `user_plan_items`
 *      projection, and a KEEL student whose context failed to load does not
 *      silently fall back to it.
 */

import { assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import {
  buildKeelPlanContext,
  type KeelCommitmentRow,
  type KeelEvaluationRow,
  isScheduledOn,
  keelPlanContextPromptBlock,
  loadKeelPlanContextSnapshot,
  selectDispatcherPlanContext,
} from "./keel_plan_context.ts";

function commitmentRow(patch: Partial<KeelCommitmentRow> = {}): KeelCommitmentRow {
  return {
    id: "c-1",
    plan_version_id: "v-1",
    title: "Cruciferous veg 2 servings/day",
    student_instruction: null,
    content_locale: "en",
    polarity: "do",
    activity_class: "nutrition",
    anchor_kind: "slot",
    slot_key: "any_meal",
    clock_local: null,
    window_start_local: null,
    window_end_local: null,
    measure: "serving",
    unit: "serving",
    target_op: ">=",
    target_min: 2,
    target_max: null,
    substance_ref: null,
    food_group_ref: "cruciferous_veg",
    evidence_kind: "photo",
    evidence_required: false,
    auto_source: null,
    counts_toward_adherence: true,
    evaluation_grain: "day",
    slot_kind: "nominal",
    scheduled_days: null,
    required_days_per_week: null,
    expected_occasions_per_day: 2,
    priority: "core",
    autonomy: "swap_within_policy",
    flex_eligible: false,
    status: "active",
    ...patch,
  };
}

function evaluationRow(patch: Partial<KeelEvaluationRow> = {}): KeelEvaluationRow {
  return {
    commitment_id: "c-1",
    local_date: "2026-07-27",
    slot_key: "any_meal",
    status: "met",
    timing_status: "on_time",
    observed_value: 2,
    evidence: "photo",
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// 1. The fold
// ---------------------------------------------------------------------------

Deno.test("a commitment with no evaluation row stays 'unknown' and stays visible", () => {
  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "v-1",
    commitments: [commitmentRow(), commitmentRow({ id: "c-2", title: "Berries" })],
    evaluations: [evaluationRow()],
  });

  assertEquals(context.counts.scheduled_today, 2);
  assertEquals(context.counts.resolved_today, 1);
  assertEquals(context.counts.remaining_today, 1);
  assertEquals(context.remaining.map((line) => line.commitment_id), ["c-2"]);
  // The unresolved line is `unknown`, not `missed`: a day not logged is not a
  // day failed, and an inner join would simply have dropped it.
  assertEquals(context.today.find((l) => l.commitment_id === "c-2")?.status, "unknown");
});

Deno.test("scheduling: a day token never resolves to silence", () => {
  assertEquals(isScheduledOn({ scheduled_days: null }, "mon"), true);
  assertEquals(isScheduledOn({ scheduled_days: ["mon", "wed"] }, "wed"), true);
  assertEquals(isScheduledOn({ scheduled_days: ["tue"] }, "wed"), false);
  // The legacy failure mode (`planSchedule.ts` before W1.3) was `[]`: a valid
  // day silently removed the line from the student's day. `parseDayToken`
  // carries documented FR aliases, so a French token still resolves to the
  // right day rather than dropping the line; the DB CHECK
  // (`scheduled_days <@ ARRAY['mon'..'sun']`) is what forbids storing one.
  assertEquals(isScheduledOn({ scheduled_days: ["mercredi"] }, "wed"), true);
  // R7: a token that maps to nothing throws here, it does not resolve to false.
  assertThrows(() => isScheduledOn({ scheduled_days: ["someday"] }, "wed"));

  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "sat",
    plan_version_id: "v-1",
    commitments: [commitmentRow({ scheduled_days: ["mon", "tue", "wed", "thu", "fri"] })],
    evaluations: [],
  });
  assertEquals(context.counts.scheduled_today, 0);
});

Deno.test("week-grain lines are separated from the day and never counted as remaining today", () => {
  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "v-1",
    commitments: [
      commitmentRow(),
      commitmentRow({
        id: "c-week",
        title: "Fatty fish 3x/week",
        evaluation_grain: "week",
        required_days_per_week: 3,
        food_group_ref: "fatty_fish",
      }),
    ],
    evaluations: [],
  });
  assertEquals(context.counts.week_grain, 1);
  assertEquals(context.counts.scheduled_today, 1);
  assertEquals(context.remaining.length, 1);
  assertStringIncludes(
    keelPlanContextPromptBlock(context),
    "satisfiable until the end of the week",
  );
});

Deno.test("paused and archived commitments leave the block entirely", () => {
  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "v-1",
    commitments: [
      commitmentRow({ id: "c-paused", status: "paused" }),
      commitmentRow({ id: "c-archived", status: "archived" }),
    ],
    evaluations: [],
  });
  assertEquals(context.counts.scheduled_today, 0);
  assertStringIncludes(keelPlanContextPromptBlock(context), "No active commitment");
});

Deno.test("a declared deviation is stated as not_applicable, not as a miss", () => {
  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "v-1",
    commitments: [commitmentRow()],
    evaluations: [],
    planned_deviations: [{ local_date: "2026-07-27", slot_key: null, kind: "restaurant" }],
  });
  assertEquals(context.deviation_declared, true);
  assertStringIncludes(
    keelPlanContextPromptBlock(context),
    "leave the denominator",
  );
});

// ---------------------------------------------------------------------------
// 2. The block
// ---------------------------------------------------------------------------

Deno.test("the block forbids exactly what a plan block has already confabulated here", () => {
  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "v-1",
    commitments: [
      commitmentRow(),
      commitmentRow({
        id: "c-oura",
        title: "Sleep 7-9 h",
        polarity: "capture",
        auto_source: "oura",
        counts_toward_adherence: false,
        measure: "duration",
        unit: "h",
        target_op: "between",
        target_min: 7,
        target_max: 9,
        anchor_kind: "free",
        slot_key: null,
        food_group_ref: null,
      }),
    ],
    evaluations: [evaluationRow()],
  });
  const block = keelPlanContextPromptBlock(context);

  // `unknown` is first class.
  assertStringIncludes(block, "'unknown' is first class");
  assertStringIncludes(block, "never rewritten to 'done'");
  // No invented line, no restated conversational completion.
  assertStringIncludes(block, "never invent a");
  // No number: coverage and adherence are computed elsewhere and gated.
  assertStringIncludes(block, "Never state a percentage");
  // The prescription belongs to the coach.
  assertStringIncludes(block, "You never author, edit, extend or soften");
  // The silent device feed does not become a miss, and stays out of adherence.
  assertStringIncludes(block, "device feed: oura - silence means unknown");
  assertStringIncludes(block, "outcome line - excluded from adherence");
  // The block carries no percentage of its own.
  assertEquals(/\d+\s*%/.test(block), false);
});

Deno.test("lines are grouped by slot in vocabulary order, free-anchored last", () => {
  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "v-1",
    commitments: [
      commitmentRow({ id: "c-free", title: "Water", slot_key: null, anchor_kind: "free", food_group_ref: "water" }),
      commitmentRow({ id: "c-dinner", title: "Dinner per plan", slot_key: "dinner" }),
      commitmentRow({ id: "c-wake", title: "Iron fasted", slot_key: "on_waking" }),
    ],
    evaluations: [],
  });
  assertEquals(
    context.today.map((line) => line.bucket),
    ["on_waking", "dinner", "free"],
  );
  const block = keelPlanContextPromptBlock(context);
  assertEquals(
    block.indexOf("SLOT on_waking") < block.indexOf("SLOT dinner"),
    true,
  );
  assertEquals(block.indexOf("SLOT dinner") < block.indexOf("ANY TIME:"), true);
});

// ---------------------------------------------------------------------------
// 3. The branch
// ---------------------------------------------------------------------------

Deno.test("branch: a KEEL student never receives the legacy user_plan_items projection", () => {
  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "v-1",
    commitments: [commitmentRow()],
    evaluations: [],
  });
  const selection = selectDispatcherPlanContext({
    keel_role: "student",
    keel_context: context,
    legacy_plan_snapshot: { plan_items: [{ title: "legacy habit" }] },
    legacy_block: "=== SNAPSHOT COURT PLAN / ACTIONS ACTIVES (SOURCE DB) ===",
  });
  assertEquals(selection.kind, "keel_student");
  assertEquals(selection.legacy_plan_snapshot, null);
  assertEquals(selection.block?.includes("SNAPSHOT COURT PLAN"), false);
  assertStringIncludes(selection.block ?? "", "=== KEEL PLAN");
});

Deno.test("branch: a legacy user keeps the legacy block byte for byte", () => {
  const legacyBlock = "=== SNAPSHOT COURT PLAN / ACTIONS ACTIVES (SOURCE DB) ===\n- x";
  const selection = selectDispatcherPlanContext({
    keel_role: null,
    keel_context: null,
    legacy_plan_snapshot: { plan_items: [] },
    legacy_block: legacyBlock,
  });
  assertEquals(selection.kind, "legacy");
  assertEquals(selection.block, legacyBlock);
  assertEquals(selection.reason_code, "legacy_plan_snapshot");
});

Deno.test("branch: a KEEL student with no loaded context does NOT fall back to the legacy plan", () => {
  // The legacy block would describe `user_plan_items` — a plan this student no
  // longer has. Degrading to "no plan block" is honest; falling back is not.
  const selection = selectDispatcherPlanContext({
    keel_role: "student",
    keel_context: null,
    legacy_plan_snapshot: { plan_items: [{ title: "legacy habit" }] },
    legacy_block: "=== SNAPSHOT COURT PLAN / ACTIONS ACTIVES (SOURCE DB) ===",
  });
  assertEquals(selection.kind, "keel_student");
  assertEquals(selection.block, null);
  assertEquals(selection.legacy_plan_snapshot, null);
  assertEquals(selection.reason_code, "keel_context_unavailable_no_legacy_fallback");
});

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Chainable fake: `.eq()`/`.limit()` return the same thenable, so the fake does
 * not have to mirror the exact number of filters the loader applies. It also
 * RECORDS them, which is what lets the version-scoping test below assert the
 * filter is really sent rather than merely that the result looks right.
 */
function fakeDb(
  resultFor: (table: string) => { data: unknown[] | null; error: unknown },
  filters?: Array<{ table: string; column: string; value: string }>,
) {
  const query = (table: string) => {
    const q = {
      eq: (column: string, value: string) => {
        filters?.push({ table, column, value });
        return q;
      },
      limit: () => q,
      then: (
        resolve: (v: { data: unknown[] | null; error: unknown }) => unknown,
      ) => Promise.resolve(resultFor(table)).then(resolve),
    };
    return q;
  };
  return { from: (table: string) => ({ select: () => query(table) }) };
}

Deno.test("loader: a failed query throws instead of returning an empty plan", async () => {
  const db = fakeDb((table) =>
    table === "plan_commitments"
      ? { data: null, error: { message: "connection reset" } }
      : table === "plan_versions"
      ? { data: [{ id: "pv-1" }], error: null }
      : { data: [], error: null }
  );
  let thrown: unknown = null;
  try {
    await loadKeelPlanContextSnapshot(db as never, {
      user_id: "student-1",
      local_date: "2026-07-27",
      day: "mon",
    });
  } catch (error) {
    thrown = error;
  }
  assertEquals((thrown as Error)?.name, "KeelPlanContextLoadError");
  assertStringIncludes(
    (thrown as Error).message,
    "an empty plan and a failed query are not the same thing",
  );
});

// ---------------------------------------------------------------------------
// Regression: the plan block is scoped to the PUBLISHED version, and every
// line carries its id
// ---------------------------------------------------------------------------

Deno.test("loader: commitments are filtered on the PUBLISHED plan version", async () => {
  // The defect this pins: `plan-publish-v1` supersedes the plan_version but
  // leaves the old version's commitments at status='active' (they are still
  // referenced by commitment_evaluations). Filtering on status alone returned
  // every version the student ever had — measured at 8 lines for a 4-line plan.
  const filters: Array<{ table: string; column: string; value: string }> = [];
  const db = fakeDb(
    (table) =>
      table === "plan_versions"
        ? { data: [{ id: "pv-live" }], error: null }
        : { data: [], error: null },
    filters,
  );
  const snapshot = await loadKeelPlanContextSnapshot(db as never, {
    user_id: "student-1",
    local_date: "2026-07-27",
    day: "mon",
  });
  assertEquals(snapshot.plan_version_id, "pv-live");

  const commitmentFilters = filters.filter((f) => f.table === "plan_commitments");
  // The assertion that matters: the version is part of the WHERE clause. A test
  // that only checked the returned rows would pass against the broken loader
  // whenever the fixture happened to hold a single version.
  assertEquals(
    commitmentFilters.some((f) => f.column === "plan_version_id" && f.value === "pv-live"),
    true,
    "plan_commitments must be scoped to the published plan_version_id",
  );
  assertEquals(
    commitmentFilters.some((f) => f.column === "status" && f.value === "active"),
    true,
  );
});

Deno.test("loader: no published version yields an empty plan, not superseded rows", async () => {
  const filters: Array<{ table: string; column: string; value: string }> = [];
  const db = fakeDb(
    (table) =>
      table === "plan_versions"
        ? { data: [], error: null }
        // If the loader ever queried commitments here, these superseded rows
        // would be the ones it rendered as "today's plan".
        : { data: [{ id: "c-superseded" }], error: null },
    filters,
  );
  const snapshot = await loadKeelPlanContextSnapshot(db as never, {
    user_id: "student-1",
    local_date: "2026-07-27",
    day: "mon",
  });
  assertEquals(snapshot.commitments, []);
  assertEquals(snapshot.plan_version_id, null);
  assertEquals(
    filters.some((f) => f.table === "plan_commitments"),
    false,
    "with no published version the loader must not read commitments at all",
  );
});

Deno.test("prompt block: every line exposes its commitment id verbatim", () => {
  // `log_protocol_event.commitment_id` is the ONLY handle on a line that
  // carries neither substance_ref nor food_group_ref (movement, light, sleep,
  // breathing, screens). Dispatcher rule 3-bis forbids emitting an id that does
  // not appear LITERALLY in this block, so an unrendered id makes those lines
  // permanently unloggable — measured at 4 runs out of 4 before the fix, with
  // the line closing the day as `missed` and the reply saying "c'est pris en
  // compte".
  const context = buildKeelPlanContext({
    local_date: "2026-07-27",
    day: "mon",
    plan_version_id: "v-1",
    commitments: [
      commitmentRow({
        id: "11110000-0000-0000-0000-000000000003",
        title: "A 30 minute walk",
        activity_class: "movement",
        anchor_kind: "free",
        slot_key: null,
        measure: "duration",
        unit: "min",
        target_op: ">=",
        target_min: 30,
        substance_ref: null,
        food_group_ref: null,
        evaluation_grain: "day",
        slot_kind: null,
      }),
    ],
    evaluations: [],
  });
  const block = keelPlanContextPromptBlock(context);
  assertStringIncludes(block, "id:11110000-0000-0000-0000-000000000003");
  assertStringIncludes(block, "A 30 minute walk");
  // ...and the block must SAY what the id is for, or the model has a uuid and
  // no instruction to copy it.
  assertStringIncludes(block, "log_protocol_event.commitment_id");
});
