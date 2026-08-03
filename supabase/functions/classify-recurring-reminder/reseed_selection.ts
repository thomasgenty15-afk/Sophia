/**
 * KEEL W1.3 bug 4 — selection rules for the weekly fleet re-seed.
 *
 * `seedReminderUntilNextSunday()` only seeds `scheduled_checkins` up to the
 * next Sunday, and its only caller was the frontend (RemindersSection.tsx).
 * No cron ever re-seeded, so a recurring reminder went silent the Sunday
 * after creation and stayed silent until the user re-saved it by hand.
 *
 * This module holds the part of the weekly pass that decides WHO gets
 * re-seeded, with no IO, so the rules are testable: RGPD exclusion, WhatsApp
 * tier gate, potion follow-ups, personalization level.
 *
 * W1.4 R1 — the pass also has to SURVIVE the fleet. `seedReminderUntilNextSunday`
 * spends one LLM generation per reminder (~3 s), so 500 reminders in one invoke
 * is ~25 min of wall clock: far past any edge budget. Worse, the first version
 * had no cursor (`order created_at asc` + `limit`), so a timeout replayed the
 * same first N rows forever and the tail of the fleet was structurally never
 * seeded. The cursor + chaining helpers below are the fix, and they are pure so
 * the paging arithmetic is tested without a network.
 */

export const RESEED_ALL_DEFAULT_LIMIT = 500;
export const RESEED_ALL_MAX_LIMIT = 2000;

/** Rows fetched per DB page. One page ~= one LLM burst; keep it small. */
export const RESEED_BATCH_DEFAULT_SIZE = 25;
export const RESEED_BATCH_MAX_SIZE = 200;
/**
 * Wall-clock budget of ONE invocation. Past it the pass stops mid-fleet and
 * hands the cursor to a fresh invocation instead of being killed with the
 * remainder unseeded.
 */
export const RESEED_TIME_BUDGET_MS = 60_000;
/**
 * Hard stop on self-invocation. 40 x 25 = 1000 reminders per weekly pass; past
 * that the chain refuses to continue and says so, loudly, in the response.
 * An unbounded self-invoking function is a billing incident, not a feature.
 */
export const RESEED_MAX_CHAIN_DEPTH = 40;

export const RESEED_SELECT_COLUMNS =
  "id,user_id,transformation_id,initiative_kind,source_potion_session_id,message_instruction,rationale,local_time_hhmm,scheduled_days,status,personalization_level,ends_at,archived_at,target_kind,target_plan_item_id,target_action_family_key,target_generated_temp_id,target_binding_policy,target_lifecycle_policy,initiative_metadata";

export type ReseedPersonalizationLevel = 1 | 2 | 3;

/**
 * Seeding horizon of `seedReminderUntilNextSunday`, in day offsets from today.
 *
 * W1.3 bug 4, second half: the horizon used to stop at `untilSunday - 1`, on
 * the assumption that the weekly re-seed always fires while it is still Sunday
 * locally. The cron ticks at Sunday 18:00 UTC, which is already MONDAY from
 * UTC+6 eastwards (Auckland = Monday 07:00). There `daysUntilNextSunday()`
 * returns 6, the old horizon covered Mon..Sat, and the following pass landed
 * on a Monday again: Sunday was structurally never seeded.
 *
 * No weekly UTC tick is Sunday everywhere (the -11..+14 span is 25h), so the
 * horizon includes the next Sunday instead. `cancelUntilDayOffset` is one day
 * further so the refresh window covers every slot the pass is about to write.
 */
export function reseedHorizon(untilSunday: number): {
  maxOffset: number;
  cancelUntilDayOffset: number;
} {
  if (!Number.isInteger(untilSunday) || untilSunday < 1 || untilSunday > 7) {
    // R7: a bad horizon is a silent week of missing nudges.
    throw new Error(`reseedHorizon: untilSunday out of range (${untilSunday})`);
  }
  return { maxOffset: untilSunday, cancelUntilDayOffset: untilSunday + 1 };
}

export type ReseedProfileRow = {
  id?: unknown;
  access_tier?: unknown;
  account_status?: unknown;
};

export type ReseedReminderRow = {
  id?: unknown;
  user_id?: unknown;
  initiative_kind?: unknown;
  message_instruction?: unknown;
  rationale?: unknown;
  personalization_level?: unknown;
};

export type ReseedSelection<Row> = {
  targets: Array<{ row: Row; level: ReseedPersonalizationLevel }>;
  skippedIneligible: number;
  skippedPotionFollowUp: number;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

/** Body `limit` — rows SCANNED by one invocation, all pages combined. */
export function resolveReseedLimit(raw: unknown): number {
  const requested = Number(raw);
  if (!Number.isFinite(requested) || requested <= 0) {
    return RESEED_ALL_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(requested), RESEED_ALL_MAX_LIMIT);
}

/** Body `batch_size` — rows per DB page. Never 0, never unbounded. */
export function resolveReseedBatchSize(raw: unknown): number {
  const requested = Number(raw);
  if (!Number.isFinite(requested) || requested <= 0) {
    return RESEED_BATCH_DEFAULT_SIZE;
  }
  return Math.min(Math.floor(requested), RESEED_BATCH_MAX_SIZE);
}

// --- W1.4 R1: cursor -------------------------------------------------------
//
// Keyset paging on the PRIMARY KEY `id`, not on `created_at`.
//
// `created_at` looks like the natural sweep order and is not a key: `now()` is
// TRANSACTION time in Postgres, so every row a bulk insert or a backfill writes
// carries the SAME timestamp to the microsecond. A page boundary landing inside
// such a block either repeats rows forever (inclusive bound) or skips the rest
// of the block (exclusive bound) — and a unit test of the full walk below
// caught exactly that starvation. Expressing a proper `(created_at, id)`
// composite keyset would need a second `or=` on a query that already carries
// one for `ends_at`, i.e. a bet on how PostgREST combines repeated logical
// operators.
//
// `id` is a uuid primary key: unique, totally ordered, backed by the pkey
// index. A fleet sweep needs "every row exactly once", not chronology, so the
// simple, provably-terminating key wins.
export type ReseedCursor = { afterId: string };

export type ReseedCursorBody = { after_id: string };

export type ReseedCursorRow = { id?: unknown };

/**
 * Reads the cursor out of a request body.
 *
 * R7: a cursor that cannot be understood THROWS. Falling back to "start from
 * the beginning" would silently re-seed the head of the fleet forever while the
 * tail stays dark — the exact bug this cursor exists to remove.
 */
export function parseReseedCursor(body: unknown): ReseedCursor | null {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.after_id === undefined || raw.after_id === null) return null;
  if (typeof raw.after_id !== "string") {
    throw new Error("reseed cursor: after_id must be a string");
  }
  const afterId = text(raw.after_id);
  if (!afterId) throw new Error("reseed cursor: after_id is empty");
  return { afterId };
}

/** Wire form of a cursor: snake_case ASCII tokens (R1). */
export function reseedCursorToBody(cursor: ReseedCursor): ReseedCursorBody {
  return { after_id: cursor.afterId };
}

/**
 * Cursor for the NEXT page. A short page means the fleet is exhausted: `null`,
 * and the caller stops instead of chaining onto an empty tail.
 */
export function advanceReseedCursor<Row extends ReseedCursorRow>(
  rows: readonly Row[] | null | undefined,
  batchSize: number,
): ReseedCursor | null {
  const page = [...(rows ?? [])];
  if (page.length === 0 || page.length < batchSize) return null;

  const afterId = text(page[page.length - 1].id);
  if (!afterId) {
    // R7: no id means no keyset, and paging blind replays the head of the
    // fleet forever.
    throw new Error("reseed cursor: last row of the page has no id");
  }
  return { afterId };
}

/** Chain depth carried across self-invocations; clamped, never negative. */
export function resolveChainDepth(raw: unknown): number {
  const requested = Number(raw);
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(Math.floor(requested), RESEED_MAX_CHAIN_DEPTH + 1);
}

export type ReseedChainDecision =
  | { chain: false; reason: "fleet_exhausted" | "max_chain_depth_reached" }
  | { chain: true; reason: "time_budget_reached" | "scan_limit_reached" };

/**
 * Whether this invocation must hand the remainder to a fresh one, and why.
 * Pure so the "runs forever" and "stops mid-fleet" failure modes are both
 * covered by a unit test rather than by a production incident.
 */
export function decideReseedChain(params: {
  nextCursor: ReseedCursor | null;
  chainDepth: number;
  elapsedMs: number;
  timeBudgetMs?: number;
  maxChainDepth?: number;
}): ReseedChainDecision {
  if (!params.nextCursor) return { chain: false, reason: "fleet_exhausted" };
  if (params.chainDepth >= (params.maxChainDepth ?? RESEED_MAX_CHAIN_DEPTH)) {
    return { chain: false, reason: "max_chain_depth_reached" };
  }
  return {
    chain: true,
    reason: params.elapsedMs >= (params.timeBudgetMs ?? RESEED_TIME_BUDGET_MS)
      ? "time_budget_reached"
      : "scan_limit_reached",
  };
}

/** True while this invocation may still open another page. */
export function hasReseedBudgetLeft(params: {
  elapsedMs: number;
  scanned: number;
  limit: number;
  timeBudgetMs?: number;
}): boolean {
  if (params.scanned >= params.limit) return false;
  return params.elapsedMs < (params.timeBudgetMs ?? RESEED_TIME_BUDGET_MS);
}

/** Same tier gate as the single-reminder path: WhatsApp scheduling tiers. */
export function isWhatsappReseedTier(accessTierRaw: unknown): boolean {
  const tier = text(accessTierRaw).toLowerCase();
  // W10 (MEGA_REVIEW B6): the KEEL tiers. Their absence here meant a coach-paid
  // student's reminders were never re-seeded for the coming week.
  return tier === "trial" || tier === "alliance" || tier === "architecte" ||
    tier === "coach" || tier === "student";
}

/**
 * Users whose reminders may be re-seeded: WhatsApp-eligible tier AND not
 * pending deletion (RGPD: accounts pending deletion are excluded from all
 * proactive processing, same rule as schedule-whatsapp-v2-checkins).
 */
export function eligibleReseedUserIds(
  profiles: readonly ReseedProfileRow[] | null | undefined,
): Set<string> {
  const eligible = new Set<string>();
  for (const profile of profiles ?? []) {
    const id = text(profile.id);
    if (!id) continue;
    if (text(profile.account_status) === "deletion_pending") continue;
    if (!isWhatsappReseedTier(profile.access_tier)) continue;
    eligible.add(id);
  }
  return eligible;
}

/**
 * Personalization level to re-seed with. The stored classification wins; a
 * legacy row with no usable level falls back to the caller's heuristic. The
 * weekly pass never re-runs the LLM classifier — it already spends one
 * generation per reminder on the messages themselves.
 */
export function reseedLevelForRow(
  row: ReseedReminderRow,
  heuristic: (instruction: string, rationale: string) => ReseedPersonalizationLevel,
): ReseedPersonalizationLevel {
  const stored = Number(row.personalization_level);
  if (stored === 3) return 3;
  if (stored === 2) return 2;
  if (stored === 1) return 1;
  return heuristic(text(row.message_instruction), text(row.rationale));
}

/**
 * Splits the loaded reminders into what the weekly pass will actually seed
 * and what it deliberately leaves alone.
 *
 * Potion follow-ups are pre-scheduled at creation (the single-reminder path
 * returns `potion_follow_up_prescheduled` and seeds nothing); re-seeding them
 * would duplicate their timeline.
 */
export function selectReseedTargets<Row extends ReseedReminderRow>(params: {
  reminders: readonly Row[] | null | undefined;
  eligibleUserIds: ReadonlySet<string>;
  heuristic: (instruction: string, rationale: string) => ReseedPersonalizationLevel;
}): ReseedSelection<Row> {
  const targets: Array<{ row: Row; level: ReseedPersonalizationLevel }> = [];
  let skippedIneligible = 0;
  let skippedPotionFollowUp = 0;

  for (const row of params.reminders ?? []) {
    if (text(row.initiative_kind) === "potion_follow_up") {
      skippedPotionFollowUp++;
      continue;
    }
    if (!params.eligibleUserIds.has(text(row.user_id))) {
      skippedIneligible++;
      continue;
    }
    targets.push({ row, level: reseedLevelForRow(row, params.heuristic) });
  }

  return { targets, skippedIneligible, skippedPotionFollowUp };
}
