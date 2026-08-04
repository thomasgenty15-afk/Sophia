/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";

import {
  type CardVariableValues,
  normalizeCardKeyword,
  parseCardTemplate,
  parseCardWinOutcome,
  parseCardWinSource,
  renderCard,
} from "./cards.ts";
import {
  type ArmableCard,
  type ArmingPlan,
  flattenArmableCard,
  planCardArmings,
  type UpcomingEvent,
  parseUpcomingEvent,
} from "./arming.ts";

/**
 * KEEL W8 — `keel-cards-v1`: the card runtime.
 *
 * Authority: docs/keel/CONTRACT.md, BUILD_PLAN W8.
 * Database side: supabase/migrations/20260727230000_keel_cards.sql
 *
 * SIX ACTIONS, TWO DOORS
 * ----------------------
 *   list_templates  (user)     the ONE catalogue: global rows + the coach's own
 *   create_card     (user)     fill a template; the DB renders and we re-read
 *   update_card     (user)     change the values; the DB re-renders
 *   log_win         (user)     append a card fact
 *   arm_sweep       (internal) cron ':20' — arm what the student declared
 *   due             (internal) armings whose moment has come
 *
 * User actions arrive with a JWT; `arm_sweep` and `due` arrive with
 * `x-internal-secret` from the cron. The door is chosen by the header, exactly
 * like coach-invite-student-v1, and neither door skips the ownership check.
 *
 * WRITE-THROUGH, ALWAYS
 * ---------------------
 * Every writer inserts and RE-READS the row, and returns what it read. This is
 * not defensive style: `rendered` is written by a database trigger, so the row
 * the caller sent is NOT the row that exists. Returning the payload we sent
 * would be the phantom-commit pattern in its purest form — announcing a card
 * whose actual text nobody has looked at.
 *
 * NO MODEL IS CALLED FROM THIS FUNCTION. There is no import for one. That is
 * the W8.3 requirement made checkable by grep (memory: defense-card-ui-qa).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** How far ahead the sweep looks. Two days covers "tomorrow evening" declared
 * tonight, without loading a month of contexts on every hourly tick. */
const ARMING_HORIZON_DAYS = 2;
const STUDENT_PAGE_SIZE = 200;
const DEFAULT_BUDGET_MS = 50_000;
const MAX_BUDGET_MS = 120_000;
const MAX_WARNINGS = 50;

type Action =
  | "list_templates"
  | "create_card"
  | "update_card"
  | "log_win"
  | "arm_sweep"
  | "due";

const USER_ACTIONS: Action[] = [
  "list_templates",
  "create_card",
  "update_card",
  "log_win",
];
const INTERNAL_ACTIONS: Action[] = ["arm_sweep", "due"];

function parseAction(value: unknown): Action {
  const raw = String(value ?? "").trim();
  const all = [...USER_ACTIONS, ...INTERNAL_ACTIONS];
  if ((all as string[]).includes(raw)) return raw as Action;
  // R7: no default action. A typo in a cron body must not silently become a
  // read, and a typo in the app must not silently become a write.
  throw new Error(
    `[keel-cards-v1] unknown action ${JSON.stringify(value)}. ` +
      `Expected one of: ${all.join(", ")}`,
  );
}

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const TEMPLATE_COLUMNS =
  "id, owner_scope, coach_id, template_key, card_kind, activity_class, " +
  "trigger_slot_key, trigger_contexts, trigger_time_bucket, arm_lead_minutes, " +
  "title, purpose, produces, usage, body_template, variables, content_locale, " +
  "legacy_technique_key, status";

const CARD_COLUMNS =
  "id, user_id, template_id, plan_version_id, commitment_id, variable_values, " +
  "rendered, rendered_at, render_engine_version, keyword, coach_approved, " +
  "content_locale, status, created_by, created_at, updated_at";

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function localDateInTimezone(timezone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    throw new Error(`[keel-cards-v1] unknown timezone ${JSON.stringify(timezone)}`);
  }
}

// ---------------------------------------------------------------------------
// USER ACTIONS
// ---------------------------------------------------------------------------

/**
 * The catalogue. Global rows plus the templates of the coach who is actually
 * coaching this student — the single source that replaces the three hardcoded
 * copies (generate-attack-card-v1, attackTechniquePreviews.ts, AttackCards.tsx).
 *
 * Every row is passed through `parseCardTemplate`, which re-validates the
 * variable descriptors and asserts the body is renderable. A malformed row
 * fails HERE, on the server, with its template_key named — not three layers
 * later inside a React render (the D2 lesson from W1).
 */
async function listTemplates(args: {
  admin: SupabaseClient;
  userId: string;
  cardKind: string | null;
}) {
  const { data: coachLinks, error: linkError } = await args.admin
    .from("coach_clients")
    .select("coach_id")
    .eq("student_user_id", args.userId)
    .eq("status", "active");
  if (linkError) throw new Error(`coach_clients lookup failed: ${linkError.message}`);
  const coachIds = ((coachLinks ?? []) as Array<Record<string, unknown>>)
    .map((row) => String(row.coach_id));

  const { data: coachOwn } = await args.admin
    .from("coaches")
    .select("id")
    .eq("user_id", args.userId)
    .eq("status", "active")
    .maybeSingle();
  if (coachOwn?.id) coachIds.push(String(coachOwn.id));

  let query = args.admin
    .from("card_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("status", "active");
  query = coachIds.length > 0
    ? query.or(`owner_scope.eq.global,coach_id.in.(${coachIds.join(",")})`)
    : query.eq("owner_scope", "global");
  if (args.cardKind) query = query.eq("card_kind", args.cardKind);

  const { data, error } = await query.order("card_kind", { ascending: true })
    .order("template_key", { ascending: true });
  if (error) throw new Error(`card_templates read failed: ${error.message}`);

  const templates = [];
  const rejected: Array<{ template_key: string; reason: string }> = [];
  for (const row of data ?? []) {
    try {
      templates.push(parseCardTemplate(row));
    } catch (err) {
      rejected.push({
        template_key: cleanText((row as Record<string, unknown>).template_key, "?"),
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { templates, rejected };
}

/**
 * Fill a template. The render is checked HERE too, before the insert, purely so
 * the caller gets a named error instead of a Postgres exception string — the
 * database remains the authority and rewrites `rendered` regardless.
 */
async function createCard(args: {
  admin: SupabaseClient;
  userId: string;
  body: Record<string, unknown>;
}) {
  const templateId = cleanText(args.body.template_id);
  if (!templateId) throw new Error("template_id is required");

  const { data: templateRow, error: templateError } = await args.admin
    .from("card_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .maybeSingle();
  if (templateError) throw new Error(`template read failed: ${templateError.message}`);
  if (!templateRow) throw new Error("unknown_template");
  if (cleanText(templateRow.status) !== "active") throw new Error("archived_template");

  const template = parseCardTemplate(templateRow);
  const values = (args.body.variable_values ?? {}) as CardVariableValues;
  // Throws with the offending variable named; the message is safe to show.
  const preview = renderCard(template, values);
  const keyword = normalizeCardKeyword(args.body.keyword);

  const { data, error } = await args.admin
    .from("student_cards")
    .insert({
      user_id: args.userId,
      template_id: template.id,
      plan_version_id: cleanText(args.body.plan_version_id) || null,
      commitment_id: cleanText(args.body.commitment_id) || null,
      variable_values: values,
      keyword,
      content_locale: cleanText(args.body.content_locale, template.content_locale),
      status: cleanText(args.body.status, "active"),
      created_by: cleanText(args.body.created_by, "student"),
    })
    .select(CARD_COLUMNS)
    .single();
  if (error) throw new Error(`student_cards insert failed: ${error.message}`);

  // Execution truth. The trigger is the renderer; if what came back is not what
  // we previewed, the two renderers have diverged and we say so LOUDLY rather
  // than showing the student a card we did not compute.
  if (data.rendered !== preview) {
    throw new Error(
      "render_parity_violation: the database render differs from the preview",
    );
  }
  return data;
}

async function updateCard(args: {
  admin: SupabaseClient;
  userId: string;
  body: Record<string, unknown>;
}) {
  const cardId = cleanText(args.body.card_id);
  if (!cardId) throw new Error("card_id is required");

  const { data: existing, error: readError } = await args.admin
    .from("student_cards")
    .select("id, user_id, template_id, status")
    .eq("id", cardId)
    .maybeSingle();
  if (readError) throw new Error(`student_cards read failed: ${readError.message}`);
  if (!existing) throw new Error("unknown_card");
  // Ownership is checked here because this path holds the service role: RLS is
  // not in front of us, so the predicate has to be.
  if (String(existing.user_id) !== args.userId) throw new Error("not_your_card");

  const patch: Record<string, unknown> = {};
  if (args.body.variable_values !== undefined) {
    const { data: templateRow, error: templateError } = await args.admin
      .from("card_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("id", existing.template_id)
      .maybeSingle();
    if (templateError) throw new Error(`template read failed: ${templateError.message}`);
    if (!templateRow) throw new Error("unknown_template");
    const template = parseCardTemplate(templateRow);
    renderCard(template, args.body.variable_values as CardVariableValues);
    patch.variable_values = args.body.variable_values;
  }
  if (args.body.keyword !== undefined) {
    patch.keyword = normalizeCardKeyword(args.body.keyword);
  }
  if (args.body.status !== undefined) {
    patch.status = cleanText(args.body.status);
  }
  if (Object.keys(patch).length === 0) throw new Error("nothing_to_update");

  const { data, error } = await args.admin
    .from("student_cards")
    .update(patch)
    .eq("id", cardId)
    .eq("user_id", args.userId)
    .select(CARD_COLUMNS)
    .single();
  if (error) throw new Error(`student_cards update failed: ${error.message}`);
  return data;
}

/**
 * A card fact. NOT an adherence input — `card_wins` is never read by the
 * evaluator (CONTRACT non-inputs, restated in the migration header). "I held
 * the line" and "I followed the prescription" are two different sentences and
 * merging them would let willpower score.
 */
async function logWin(args: {
  admin: SupabaseClient;
  userId: string;
  body: Record<string, unknown>;
}) {
  const cardId = cleanText(args.body.student_card_id);
  if (!cardId) throw new Error("student_card_id is required");

  const { data: card, error: cardError } = await args.admin
    .from("student_cards")
    .select("id, user_id")
    .eq("id", cardId)
    .maybeSingle();
  if (cardError) throw new Error(`student_cards read failed: ${cardError.message}`);
  if (!card) throw new Error("unknown_card");
  if (String(card.user_id) !== args.userId) throw new Error("not_your_card");

  const armingId = cleanText(args.body.arming_id) || null;
  if (armingId) {
    const { data: arming } = await args.admin
      .from("card_armings")
      .select("id, user_id, student_card_id")
      .eq("id", armingId)
      .maybeSingle();
    if (!arming || String(arming.user_id) !== args.userId) {
      throw new Error("unknown_arming");
    }
  }

  const { data, error } = await args.admin
    .from("card_wins")
    .insert({
      user_id: args.userId,
      student_card_id: cardId,
      arming_id: armingId,
      local_date: cleanText(args.body.local_date),
      slot_key: cleanText(args.body.slot_key) || null,
      outcome: parseCardWinOutcome(args.body.outcome),
      source: parseCardWinSource(args.body.source),
      source_message_id: cleanText(args.body.source_message_id) || null,
      note: cleanText(args.body.note) || null,
      content_locale: cleanText(args.body.content_locale, "en"),
    })
    .select("id, student_card_id, arming_id, local_date, slot_key, outcome, source, occurred_at")
    .single();
  if (error) {
    // Idempotence: one inbound message writes one win, and replaying it is a
    // no-op rather than a duplicate the coach has to interpret.
    if (error.code === "23505") {
      const { data: existing } = await args.admin
        .from("card_wins")
        .select("id, student_card_id, arming_id, local_date, slot_key, outcome, source, occurred_at")
        .eq("user_id", args.userId)
        .eq("source_message_id", cleanText(args.body.source_message_id))
        .maybeSingle();
      if (existing) return existing;
    }
    throw new Error(`card_wins insert failed: ${error.message}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// INTERNAL ACTIONS
// ---------------------------------------------------------------------------

interface SweepTotals {
  students_scanned: number;
  students_with_events: number;
  events_read: number;
  cards_considered: number;
  armings_written: number;
  armings_already_present: number;
  armings_skipped_event_passed: number;
  armings_skipped_no_match: number;
  errored_students: number;
}

async function armStudent(args: {
  admin: SupabaseClient;
  userId: string;
  timezone: string;
  now: Date;
  slotDefaultLocalTimes: Record<string, string | null>;
  totals: SweepTotals;
}): Promise<void> {
  const today = localDateInTimezone(args.timezone, args.now);
  const horizonEnd = addDays(today, ARMING_HORIZON_DAYS);

  const [deviations, contexts] = await Promise.all([
    args.admin
      .from("planned_deviations")
      .select("id, local_date, slot_key, kind")
      .eq("user_id", args.userId)
      .gte("local_date", today)
      .lte("local_date", horizonEnd),
    args.admin
      .from("upcoming_contexts")
      .select("id, local_date, slot_key, kind")
      .eq("user_id", args.userId)
      .gte("local_date", today)
      .lte("local_date", horizonEnd),
  ]);
  if (deviations.error) throw new Error(deviations.error.message);
  if (contexts.error) throw new Error(contexts.error.message);

  const events: UpcomingEvent[] = [
    ...((deviations.data ?? []) as unknown[]).map((row) =>
      parseUpcomingEvent(row, "planned_deviation")
    ),
    ...((contexts.data ?? []) as unknown[]).map((row) =>
      parseUpcomingEvent(row, "upcoming_context")
    ),
  ];
  args.totals.events_read += events.length;
  if (events.length === 0) return;
  args.totals.students_with_events++;

  const { data: cardRows, error: cardError } = await args.admin
    .from("student_cards")
    .select(
      "id, user_id, template_id, status, " +
        "card_templates!inner(trigger_slot_key, trigger_contexts, trigger_time_bucket, arm_lead_minutes)",
    )
    .eq("user_id", args.userId)
    .eq("status", "active");
  if (cardError) throw new Error(cardError.message);

  const cards: ArmableCard[] = (cardRows ?? []).map(flattenArmableCard);
  args.totals.cards_considered += cards.length;
  if (cards.length === 0) return;

  const { armings, skipped } = planCardArmings({
    timezone: args.timezone,
    now: args.now,
    events,
    cards,
    slotDefaultLocalTimes: args.slotDefaultLocalTimes,
  });
  for (const skip of skipped) {
    if (skip.reason === "event_already_passed") {
      args.totals.armings_skipped_event_passed++;
    } else {
      args.totals.armings_skipped_no_match++;
    }
  }
  if (armings.length === 0) return;

  await writeArmings({ admin: args.admin, armings, totals: args.totals });
}

/**
 * Idempotent by construction: the unique index
 * (student_card_id, trigger_kind, trigger_ref_id, local_date, slot_key) IS the
 * key, so the hourly tick can run twice on the same declared dinner without
 * arming it twice. `ignoreDuplicates` counts the collisions instead of hiding
 * them — a sweep that writes 0 and collided 40 times is healthy; a sweep that
 * writes 0 and collided 0 times is a bug.
 */
async function writeArmings(args: {
  admin: SupabaseClient;
  armings: ArmingPlan[];
  totals: SweepTotals;
}): Promise<void> {
  const rows = args.armings.map((arming) => ({
    user_id: arming.user_id,
    student_card_id: arming.student_card_id,
    trigger_kind: arming.trigger_kind,
    trigger_ref_id: arming.trigger_ref_id,
    local_date: arming.local_date,
    slot_key: arming.slot_key,
    event_at: arming.event_at,
    arm_at: arming.arm_at,
    status: "pending",
  }));

  const { data, error } = await args.admin
    .from("card_armings")
    .upsert(rows, {
      onConflict:
        "student_card_id,trigger_kind,trigger_ref_id,local_date,slot_key",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) throw new Error(`card_armings upsert failed: ${error.message}`);

  const written = (data ?? []).length;
  args.totals.armings_written += written;
  args.totals.armings_already_present += rows.length - written;
}

async function armSweep(args: {
  admin: SupabaseClient;
  now: Date;
  budgetMs: number;
  afterUserId: string;
}) {
  const startedAt = Date.now();
  const totals: SweepTotals = {
    students_scanned: 0,
    students_with_events: 0,
    events_read: 0,
    cards_considered: 0,
    armings_written: 0,
    armings_already_present: 0,
    armings_skipped_event_passed: 0,
    armings_skipped_no_match: 0,
    errored_students: 0,
  };
  const warnings: string[] = [];

  const { data: slotRows, error: slotError } = await args.admin
    .from("slot_vocabulary")
    .select("key, default_local_time");
  if (slotError) throw new Error(`slot_vocabulary read failed: ${slotError.message}`);
  const slotDefaultLocalTimes: Record<string, string | null> = {};
  for (const row of slotRows ?? []) {
    slotDefaultLocalTimes[String(row.key)] = row.default_local_time
      ? String(row.default_local_time)
      : null;
  }

  let cursor = args.afterUserId;
  let exhausted = false;

  while (true) {
    let query = args.admin
      .from("plan_versions")
      .select("student_id, timezone")
      .eq("status", "published")
      .order("student_id", { ascending: true })
      .limit(STUDENT_PAGE_SIZE);
    if (cursor) query = query.gt("student_id", cursor);

    const { data: planRows, error: planError } = await query;
    if (planError) throw new Error(`plan_versions read failed: ${planError.message}`);
    if ((planRows ?? []).length === 0) {
      exhausted = true;
      break;
    }

    for (const row of planRows ?? []) {
      const userId = String(row.student_id);
      cursor = userId;
      totals.students_scanned++;
      try {
        await armStudent({
          admin: args.admin,
          userId,
          // A student with a broken timezone is skipped BY NAME, and the sweep
          // continues. One bad row never silences the fleet (W1.4 R2).
          timezone: cleanText(row.timezone, "Europe/Paris"),
          now: args.now,
          slotDefaultLocalTimes,
          totals,
        });
      } catch (err) {
        totals.errored_students++;
        if (warnings.length < MAX_WARNINGS) {
          warnings.push(
            `${userId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (Date.now() - startedAt > args.budgetMs) break;
    }
    if (Date.now() - startedAt > args.budgetMs) break;
  }

  return {
    ...totals,
    exhausted,
    next_after_user_id: exhausted ? null : cursor || null,
    warnings,
  };
}

/**
 * Armings whose moment has come: `arm_at <= now < event_at`, still pending.
 *
 * `event_at > now` is in the predicate, not only in the sweep, because an
 * arming can sit in the table across a delivery outage. Serving it late is the
 * exact failure this feature exists to prevent, so the read refuses it too.
 */
async function dueArmings(args: {
  admin: SupabaseClient;
  now: Date;
  limit: number;
  userId: string | null;
}) {
  let query = args.admin
    .from("card_armings")
    .select(
      "id, user_id, student_card_id, trigger_kind, trigger_ref_id, local_date, " +
        "slot_key, event_at, arm_at, status, " +
        "student_cards!inner(rendered, keyword, status)",
    )
    .eq("status", "pending")
    .lte("arm_at", args.now.toISOString())
    .gt("event_at", args.now.toISOString())
    .order("arm_at", { ascending: true })
    .limit(args.limit);
  if (args.userId) query = query.eq("user_id", args.userId);

  const { data, error } = await query;
  if (error) throw new Error(`card_armings read failed: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsBlocked = enforceCors(req);
  if (corsBlocked) return corsBlocked;

  const requestId = getRequestId(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, {
      status: 405,
    });
  }

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = parseAction(body.action);
    const usesInternalSecret = Boolean(req.headers.get("x-internal-secret"));

    if (INTERNAL_ACTIONS.includes(action)) {
      // These two touch the whole fleet. There is no JWT path to them at all:
      // a student token cannot ask for the fleet's armings by guessing a body.
      const guard = ensureInternalRequest(req);
      if (guard) return guard;
    }

    const admin = adminClient();

    let userId = "";
    if (USER_ACTIONS.includes(action)) {
      if (usesInternalSecret) {
        const guard = ensureInternalRequest(req);
        if (guard) return guard;
        userId = cleanText(body.user_id);
        if (!userId) {
          return jsonResponse(req, {
            error: "user_id is required on the internal path",
            request_id: requestId,
          }, { status: 400 });
        }
      } else {
        const authHeader = req.headers.get("Authorization") ?? "";
        const jwt = authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        if (!jwt) {
          return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, {
            status: 401,
          });
        }
        const { data: userData, error: userError } = await admin.auth.getUser(jwt);
        if (userError || !userData?.user) {
          return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, {
            status: 401,
          });
        }
        userId = userData.user.id;
      }
    }

    const nowRaw = cleanText(body.now);
    const nowCandidate = nowRaw ? new Date(nowRaw) : new Date();
    const now = Number.isFinite(nowCandidate.getTime()) ? nowCandidate : new Date();

    switch (action) {
      case "list_templates": {
        const result = await listTemplates({
          admin,
          userId,
          cardKind: cleanText(body.card_kind) || null,
        });
        return jsonResponse(req, {
          ok: true,
          templates: result.templates,
          rejected: result.rejected,
          request_id: requestId,
        });
      }
      case "create_card": {
        const card = await createCard({ admin, userId, body });
        return jsonResponse(req, { ok: true, card, request_id: requestId });
      }
      case "update_card": {
        const card = await updateCard({ admin, userId, body });
        return jsonResponse(req, { ok: true, card, request_id: requestId });
      }
      case "log_win": {
        const win = await logWin({ admin, userId, body });
        return jsonResponse(req, { ok: true, win, request_id: requestId });
      }
      case "arm_sweep": {
        const budgetRaw = Number(body.budget_ms);
        const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0
          ? Math.min(budgetRaw, MAX_BUDGET_MS)
          : DEFAULT_BUDGET_MS;
        const result = await armSweep({
          admin,
          now,
          budgetMs,
          afterUserId: cleanText(body.after_user_id),
        });
        return jsonResponse(req, { ok: true, ...result, request_id: requestId }, {
          includeCors: false,
        });
      }
      case "due": {
        const limitRaw = Number(body.limit);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.trunc(limitRaw), 200)
          : 50;
        const armings = await dueArmings({
          admin,
          now,
          limit,
          userId: cleanText(body.user_id) || null,
        });
        return jsonResponse(req, {
          ok: true,
          armings,
          request_id: requestId,
        }, { includeCors: false });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Caller errors are 400 with their reason; everything else is a 500 that
    // gets logged. The list is explicit so a new failure mode cannot quietly
    // inherit a 400 and look like the user's fault.
    const isCallerError = /^(unknown_template|archived_template|unknown_card|not_your_card|unknown_arming|nothing_to_update)$/
      .test(message) || message.startsWith("[keel/cards]") ||
      message.startsWith("[keel/arming]") ||
      message.startsWith("[keel-cards-v1]") ||
      message.endsWith("is required");
    if (!isCallerError) {
      await logEdgeFunctionError({
        functionName: "keel-cards-v1",
        requestId,
        error,
        metadata: { source: "edge" },
      });
    }
    return jsonResponse(req, {
      ok: false,
      error: message,
      request_id: requestId,
    }, { status: isCallerError ? 400 : 500 });
  }
});
