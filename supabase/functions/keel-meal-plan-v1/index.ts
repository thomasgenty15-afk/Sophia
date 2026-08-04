/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

/**
 * KEEL — `keel-meal-plan-v1`: the coach composes the student's week of meals.
 *
 * Authority: docs/keel/Q6_NUTRITION_LAYER.md §2.3 and §2.4,
 * docs/keel/CONTRACT.md. Database side:
 * supabase/migrations/20260728120000_keel_meal_scaffolding.sql
 *
 * THE ONE THING TO KNOW BEFORE EDITING THIS FILE
 * ----------------------------------------------
 * THE COACH IS THE AUTHOR. NO MODEL IS CALLED FROM HERE, and there is no
 * import for one — the same grep-checkable property `keel-cards-v1` carries.
 * `meal_ideas.author_kind` has two legal values, 'coach' and 'keel_library';
 * there is no 'ai', because a model that writes what a student eats is the one
 * thing this product exists not to be.
 *
 * AND THE SECOND THING: NOTHING HERE SCORES.
 * A meal is scaffolding. It helps the student know what to eat; it is never
 * graded, and adherence stays computed from `plan_commitments` and nothing
 * else. Two structural facts, not two habits:
 *   - `commitment_evaluations.commitment_id` references `plan_commitments`.
 *     A meal id cannot satisfy that foreign key.
 *   - This function writes to `meal_ideas` and `meal_plan_entries` and to no
 *     other table. In particular it NEVER writes a `protocol_event`: two
 *     events on four days is the entire display gate on the coach's weekly
 *     read, and a suggested dish that logged itself would lift that gate on
 *     its own (Q6 §2.4).
 *
 * ACTIONS (all coach-gated, all under the caller's OWN identity)
 *   vocabulary    slot_vocabulary + food_groups — the grid's columns
 *   week          the composed week of one student + what it covers
 *   list_ideas    the coach's library
 *   create_idea   write a dish
 *   update_idea   edit a dish
 *   archive_idea  retire a dish (placements are removed with it)
 *   place         put ONE dish on ONE slot across N days — the fan-out
 *   unplace       take entries back off the week
 *
 * WHY AN EDGE FUNCTION AND NOT POSTGREST. Two reasons, and the first is the
 * real one: `place` fans out over several days and must report the CARDINALITY
 * it actually wrote, read back from the table. The repo has paid for the
 * opposite shape — announcing N effects after committing one. The second is
 * that the coach identity is re-derived from the JWT here and never read from
 * the body, so no caller can compose into somebody else's student's week.
 *
 * The STUDENT does not call this function at all. They read their own week
 * straight through PostgREST under RLS (`meal_plan_entries_student_read`),
 * exactly like the rest of the student app: if a policy would not return the
 * row, no code path here can produce it either.
 */

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  computeWeekCoverage,
  type CoverageCommitment,
  DAY_TOKENS,
  type PlacedMeal,
} from "./coverage.ts";

const FUNCTION_NAME = "keel-meal-plan-v1";

const IDEA_COLUMNS =
  "id, author_kind, coach_id, student_id, title, description, slot_key, " +
  "food_group_refs, content_locale, status, created_at, updated_at";

const ENTRY_COLUMNS =
  "id, plan_version_id, coach_id, student_id, day_token, slot_key, " +
  "meal_idea_id, note, sort_order, created_at";

const COMMITMENT_COLUMNS =
  "id, title, polarity, activity_class, status, slot_key, food_group_ref, " +
  "measure, target_op, target_min, target_max, scheduled_days, " +
  "expected_occasions_per_day";

const ACTIONS = [
  "vocabulary",
  "week",
  "list_ideas",
  "create_idea",
  "update_idea",
  "archive_idea",
  "place",
  "unplace",
] as const;
type Action = (typeof ACTIONS)[number];

/** Caller mistakes: 400 with the reason. Everything else is a logged 500. */
const CALLER_ERRORS = new Set([
  "not_a_coach",
  "coach_suspended",
  "unknown_plan_version",
  "not_your_plan",
  "unknown_idea",
  "not_your_idea",
  "unknown_slot",
  "unknown_day",
  "unknown_food_group",
  "nothing_to_update",
  "nothing_to_place",
  "too_many_days",
  "unknown_entry",
]);

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FUNCTION_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An id that is not a uuid is a CALLER mistake, not a server fault. Checking
 * the shape here rather than letting Postgres raise 22P02 is what turns
 * "invalid input syntax for type uuid" — a database sentence, in a coach's
 * face — into the named 400 the screen already knows how to render.
 */
function uuidOrThrow(value: unknown, notFoundError: string): string {
  const raw = cleanText(value);
  if (!UUID_RE.test(raw)) throw new Error(notFoundError);
  return raw;
}

/**
 * PostgREST rejects with a plain object, not an Error. Thrown as-is it reaches
 * the catch below as `[object Object]` — a 500 with no cause, which is the
 * shape of an outage nobody can diagnose. Every database call funnels through
 * here so the failure keeps its message and its code.
 */
function dbFail(error: { message?: string; code?: string }, what: string): Error {
  const code = error.code ? ` (${error.code})` : "";
  return new Error(`${what} failed${code}: ${error.message ?? "unknown database error"}`);
}

function parseAction(value: unknown): Action {
  const raw = cleanText(value);
  if ((ACTIONS as readonly string[]).includes(raw)) return raw as Action;
  // R7: no default action. A typo must not silently become a read OR a write.
  throw new Error(
    `[${FUNCTION_NAME}] unknown action ${JSON.stringify(value)}. ` +
      `Expected one of: ${ACTIONS.join(", ")}`,
  );
}

/**
 * The CALLER's coach row, from the JWT and nowhere else. A `coach_id` in the
 * body would be a tenancy hole: impersonation is refused on the record
 * (CONTRACT), and this is the function that enforces it.
 */
async function resolveCoach(
  req: Request,
  admin: SupabaseClient,
): Promise<{ coachId: string; userId: string } | Response> {
  const requestId = getRequestId(req);
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, {
      status: 401,
    });
  }
  const { data: coach, error: coachErr } = await admin
    .from("coaches")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (coachErr) throw dbFail(coachErr, "coaches read");
  if (!coach) throw new Error("not_a_coach");
  if ((coach as { status: string }).status !== "active") {
    throw new Error("coach_suspended");
  }
  return { coachId: (coach as { id: string }).id, userId: user.id };
}

/** The plan the coach is composing for, checked to be theirs. */
async function resolvePlanVersion(
  admin: SupabaseClient,
  coachId: string,
  planVersionId: string,
): Promise<{ id: string; student_id: string; title: string | null; status: string }> {
  if (!planVersionId) throw new Error("plan_version_id is required");
  const id = uuidOrThrow(planVersionId, "unknown_plan_version");
  const { data, error } = await admin
    .from("plan_versions")
    .select("id, coach_id, student_id, title, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbFail(error, "plan_versions read");
  if (!data) throw new Error("unknown_plan_version");
  if (String((data as { coach_id: string }).coach_id) !== coachId) {
    throw new Error("not_your_plan");
  }
  return data as { id: string; student_id: string; title: string | null; status: string };
}

// ---------------------------------------------------------------------------
// Vocabulary — the grid's columns come from the database, never from a list
// typed into a React file. Adding a slot to slot_vocabulary adds a row to the
// grid; that is the whole reason this action exists.
// ---------------------------------------------------------------------------

async function readVocabulary(admin: SupabaseClient) {
  const [slots, groups] = await Promise.all([
    admin.from("slot_vocabulary")
      .select("key, label_i18n_key, default_local_time, sort_order")
      .order("sort_order", { ascending: true }),
    admin.from("food_groups")
      .select("slug, class, typical_portion, unit, label_i18n_key")
      .order("slug", { ascending: true }),
  ]);
  if (slots.error) throw dbFail(slots.error, "slot_vocabulary read");
  if (groups.error) throw dbFail(groups.error, "food_groups read");
  return {
    slots: slots.data ?? [],
    food_groups: groups.data ?? [],
    day_tokens: DAY_TOKENS,
  };
}

// ---------------------------------------------------------------------------
// Validation of the two vocabularies a dish carries
// ---------------------------------------------------------------------------

async function assertKnownSlot(admin: SupabaseClient, slotKey: string | null) {
  if (slotKey === null) return;
  const { data, error } = await admin
    .from("slot_vocabulary")
    .select("key")
    .eq("key", slotKey)
    .maybeSingle();
  if (error) throw dbFail(error, "slot_vocabulary read");
  if (!data) throw new Error("unknown_slot");
}

/**
 * Food groups are validated here AND by a trigger on the table. The trigger is
 * the authority (it is what makes a bad slug impossible); this check exists so
 * the coach gets "unknown_food_group" instead of a Postgres exception string.
 */
async function normalizeFoodGroups(
  admin: SupabaseClient,
  raw: unknown,
): Promise<string[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("food_group_refs must be an array");
  const slugs = [...new Set(raw.map((v) => cleanText(v)).filter(Boolean))];
  if (slugs.length === 0) return [];
  const { data, error } = await admin
    .from("food_groups")
    .select("slug")
    .in("slug", slugs);
  if (error) throw dbFail(error, "food_groups read");
  const known = new Set((data ?? []).map((r) => String((r as { slug: string }).slug)));
  const bad = slugs.find((s) => !known.has(s));
  if (bad) throw new Error("unknown_food_group");
  return slugs;
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

async function listIdeas(args: {
  admin: SupabaseClient;
  coachId: string;
  studentId: string | null;
  includeArchived: boolean;
}) {
  let query = args.admin
    .from("meal_ideas")
    .select(IDEA_COLUMNS)
    .eq("coach_id", args.coachId);
  if (!args.includeArchived) query = query.eq("status", "active");
  // A library idea (student_id null) is offered on every student's week; a
  // student-specific dish only on theirs. `or` rather than two round trips.
  if (args.studentId) {
    query = query.or(`student_id.is.null,student_id.eq.${args.studentId}`);
  }
  const { data, error } = await query
    .order("slot_key", { ascending: true, nullsFirst: true })
    .order("title", { ascending: true });
  if (error) throw dbFail(error, "meal_ideas read");
  return data ?? [];
}

async function createIdea(args: {
  admin: SupabaseClient;
  coachId: string;
  body: Record<string, unknown>;
}) {
  const title = cleanText(args.body.title);
  if (!title) throw new Error("title is required");
  const slotKey = cleanText(args.body.slot_key) || null;
  await assertKnownSlot(args.admin, slotKey);
  const foodGroups = await normalizeFoodGroups(args.admin, args.body.food_group_refs);

  const { data, error } = await args.admin
    .from("meal_ideas")
    .insert({
      // NOT read from the body. The author of a dish in this product is the
      // human holding the JWT; 'keel_library' rows are seeded server-side.
      author_kind: "coach",
      coach_id: args.coachId,
      student_id: cleanText(args.body.student_id) || null,
      title,
      description: cleanText(args.body.description) || null,
      slot_key: slotKey,
      food_group_refs: foodGroups,
      content_locale: cleanText(args.body.content_locale, "en"),
    })
    .select(IDEA_COLUMNS)
    .single();
  if (error) throw dbFail(error, "meal_ideas insert");
  // Write-through: the row returned is the row that exists. The trigger may
  // have normalised `food_group_refs`, so echoing the payload would announce a
  // dish nobody has looked at.
  return data;
}

async function ownedIdea(admin: SupabaseClient, coachId: string, ideaId: string) {
  if (!ideaId) throw new Error("meal_idea_id is required");
  const { data, error } = await admin
    .from("meal_ideas")
    .select("id, coach_id, slot_key, status")
    .eq("id", uuidOrThrow(ideaId, "unknown_idea"))
    .maybeSingle();
  if (error) throw dbFail(error, "meal_ideas read");
  if (!data) throw new Error("unknown_idea");
  if (String((data as { coach_id: string }).coach_id) !== coachId) {
    throw new Error("not_your_idea");
  }
  return data as { id: string; slot_key: string | null; status: string };
}

async function updateIdea(args: {
  admin: SupabaseClient;
  coachId: string;
  body: Record<string, unknown>;
}) {
  const idea = await ownedIdea(
    args.admin,
    args.coachId,
    cleanText(args.body.meal_idea_id),
  );

  const patch: Record<string, unknown> = {};
  if (args.body.title !== undefined) {
    const title = cleanText(args.body.title);
    if (!title) throw new Error("title is required");
    patch.title = title;
  }
  if (args.body.description !== undefined) {
    patch.description = cleanText(args.body.description) || null;
  }
  if (args.body.slot_key !== undefined) {
    const slotKey = cleanText(args.body.slot_key) || null;
    await assertKnownSlot(args.admin, slotKey);
    patch.slot_key = slotKey;
  }
  if (args.body.food_group_refs !== undefined) {
    patch.food_group_refs = await normalizeFoodGroups(
      args.admin,
      args.body.food_group_refs,
    );
  }
  if (Object.keys(patch).length === 0) throw new Error("nothing_to_update");

  const { data, error } = await args.admin
    .from("meal_ideas")
    .update(patch)
    .eq("id", idea.id)
    .eq("coach_id", args.coachId)
    .select(IDEA_COLUMNS)
    .single();
  if (error) throw dbFail(error, "meal_ideas update");
  return data;
}

async function archiveIdea(args: {
  admin: SupabaseClient;
  coachId: string;
  body: Record<string, unknown>;
}) {
  const idea = await ownedIdea(
    args.admin,
    args.coachId,
    cleanText(args.body.meal_idea_id),
  );
  // The placements go with it. A week showing a dish the coach retired would
  // be a suggestion nobody stands behind any more.
  const { count, error: delErr } = await args.admin
    .from("meal_plan_entries")
    .delete({ count: "exact" })
    .eq("meal_idea_id", idea.id)
    .eq("coach_id", args.coachId);
  if (delErr) throw dbFail(delErr, "meal_plan_entries delete");

  const { data, error } = await args.admin
    .from("meal_ideas")
    .update({ status: "archived" })
    .eq("id", idea.id)
    .eq("coach_id", args.coachId)
    .select(IDEA_COLUMNS)
    .single();
  if (error) throw dbFail(error, "meal_ideas archive");
  return { idea: data, entries_removed: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Composing the week
// ---------------------------------------------------------------------------

/**
 * ONE dish, ONE slot, N days — the fan-out.
 *
 * This is the shape that makes "put this breakfast on five days" two clicks
 * instead of ten, and it is also the shape this repo has been burned by: a
 * fan-out that says "done" after writing one row. So the response carries what
 * was RE-READ from the table, split into `placed` and `already_present`, and
 * the caller renders that. `upsert(ignoreDuplicates)` against the
 * (plan, day, slot, idea) unique index makes a replay a no-op rather than a
 * duplicate the coach has to clean up.
 */
async function place(args: {
  admin: SupabaseClient;
  coachId: string;
  body: Record<string, unknown>;
}) {
  const plan = await resolvePlanVersion(
    args.admin,
    args.coachId,
    cleanText(args.body.plan_version_id),
  );
  const idea = await ownedIdea(
    args.admin,
    args.coachId,
    cleanText(args.body.meal_idea_id),
  );
  if (idea.status !== "active") throw new Error("unknown_idea");

  const slotKey = cleanText(args.body.slot_key);
  if (!slotKey) throw new Error("slot_key is required");
  await assertKnownSlot(args.admin, slotKey);

  const rawDays = Array.isArray(args.body.day_tokens)
    ? args.body.day_tokens
    : [args.body.day_token];
  const days = [...new Set(rawDays.map((d) => cleanText(d)).filter(Boolean))];
  if (days.length === 0) throw new Error("nothing_to_place");
  if (days.length > DAY_TOKENS.length) throw new Error("too_many_days");
  for (const day of days) {
    if (!(DAY_TOKENS as readonly string[]).includes(day)) throw new Error("unknown_day");
  }

  const note = cleanText(args.body.note) || null;
  const rows = days.map((day) => ({
    plan_version_id: plan.id,
    coach_id: args.coachId,
    student_id: plan.student_id,
    day_token: day,
    slot_key: slotKey,
    meal_idea_id: idea.id,
    note,
  }));

  const { data, error } = await args.admin
    .from("meal_plan_entries")
    .upsert(rows, {
      onConflict: "plan_version_id,day_token,slot_key,meal_idea_id",
      ignoreDuplicates: true,
    })
    .select(ENTRY_COLUMNS);
  if (error) throw dbFail(error, "meal_plan_entries upsert");

  const written = data ?? [];
  return {
    requested: days.length,
    placed: written,
    already_present: days.length - written.length,
  };
}

async function unplace(args: {
  admin: SupabaseClient;
  coachId: string;
  body: Record<string, unknown>;
}) {
  const raw = Array.isArray(args.body.entry_ids)
    ? args.body.entry_ids
    : [args.body.entry_id];
  const ids = [...new Set(raw.map((v) => cleanText(v)).filter(Boolean))]
    .map((v) => uuidOrThrow(v, "unknown_entry"));
  if (ids.length === 0) throw new Error("entry_id is required");

  // `.eq('coach_id')` is the ownership predicate: this path holds the service
  // role, so RLS is not in front of us and the predicate has to be.
  const { data, error } = await args.admin
    .from("meal_plan_entries")
    .delete()
    .in("id", ids)
    .eq("coach_id", args.coachId)
    .select("id");
  if (error) throw dbFail(error, "meal_plan_entries delete");
  return { removed: (data ?? []).map((r) => String((r as { id: string }).id)) };
}

/**
 * The composed week, plus what it covers of the coach's own nutrition lines.
 *
 * The coverage block is INFORMATION FOR THE COACH. It is computed from the
 * prescription and from the dishes placed — never from anything the student
 * did — and it is not returned to the student's screen by any path: the
 * student reads `meal_plan_entries` directly under RLS and this function is
 * not in their code path at all.
 */
async function readWeek(args: {
  admin: SupabaseClient;
  coachId: string;
  body: Record<string, unknown>;
}) {
  const plan = await resolvePlanVersion(
    args.admin,
    args.coachId,
    cleanText(args.body.plan_version_id),
  );

  const [entriesRes, commitmentsRes, ideas, vocabulary] = await Promise.all([
    args.admin
      .from("meal_plan_entries")
      .select(ENTRY_COLUMNS)
      .eq("plan_version_id", plan.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    args.admin
      .from("plan_commitments")
      .select(COMMITMENT_COLUMNS)
      .eq("plan_version_id", plan.id),
    listIdeas({
      admin: args.admin,
      coachId: args.coachId,
      studentId: plan.student_id,
      includeArchived: false,
    }),
    readVocabulary(args.admin),
  ]);
  if (entriesRes.error) throw dbFail(entriesRes.error, "meal_plan_entries read");
  if (commitmentsRes.error) throw dbFail(commitmentsRes.error, "plan_commitments read");

  const entries = (entriesRes.data ?? []) as Array<Record<string, unknown>>;
  const ideaById = new Map(
    (ideas as Array<Record<string, unknown>>).map((i) => [String(i.id), i]),
  );

  // A dish archived between two loads leaves its entries behind for one beat;
  // treating it as carrying no food group is the honest read (we no longer
  // know what it put on the plate) rather than dropping the cell silently.
  const meals: PlacedMeal[] = entries.map((e) => {
    const idea = ideaById.get(String(e.meal_idea_id));
    const refs = idea ? (idea.food_group_refs as string[] | null) ?? [] : [];
    return {
      day_token: String(e.day_token),
      slot_key: String(e.slot_key),
      food_group_refs: refs,
    };
  });

  // slug -> class, straight from the seeded vocabulary. Used ONLY to report
  // "plus one similar dish" beside a count, never to raise one.
  const classByGroup: Record<string, string> = {};
  for (const row of vocabulary.food_groups as Array<Record<string, unknown>>) {
    classByGroup[String(row.slug)] = String(row.class);
  }

  const coverage = computeWeekCoverage({
    commitments: (commitmentsRes.data ?? []) as unknown as CoverageCommitment[],
    meals,
    classByGroup,
  });

  return {
    plan_version: {
      id: plan.id,
      student_id: plan.student_id,
      title: plan.title,
      status: plan.status,
    },
    entries,
    ideas,
    coverage,
    vocabulary,
  };
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
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = parseAction(body.action);
    const admin = adminClient();

    // Every action is coach-gated, including `vocabulary`: this function has
    // no anonymous surface at all, which is one fewer thing to reason about.
    const coach = await resolveCoach(req, admin);
    if (coach instanceof Response) return coach;

    switch (action) {
      case "vocabulary": {
        const vocabulary = await readVocabulary(admin);
        return jsonResponse(req, { ok: true, ...vocabulary, request_id: requestId });
      }
      case "week": {
        const week = await readWeek({ admin, coachId: coach.coachId, body });
        return jsonResponse(req, { ok: true, ...week, request_id: requestId });
      }
      case "list_ideas": {
        const ideas = await listIdeas({
          admin,
          coachId: coach.coachId,
          studentId: cleanText(body.student_id) || null,
          includeArchived: body.include_archived === true,
        });
        return jsonResponse(req, { ok: true, ideas, request_id: requestId });
      }
      case "create_idea": {
        const idea = await createIdea({ admin, coachId: coach.coachId, body });
        return jsonResponse(req, { ok: true, idea, request_id: requestId });
      }
      case "update_idea": {
        const idea = await updateIdea({ admin, coachId: coach.coachId, body });
        return jsonResponse(req, { ok: true, idea, request_id: requestId });
      }
      case "archive_idea": {
        const result = await archiveIdea({ admin, coachId: coach.coachId, body });
        return jsonResponse(req, { ok: true, ...result, request_id: requestId });
      }
      case "place": {
        const result = await place({ admin, coachId: coach.coachId, body });
        return jsonResponse(req, { ok: true, ...result, request_id: requestId });
      }
      case "unplace": {
        const result = await unplace({ admin, coachId: coach.coachId, body });
        return jsonResponse(req, { ok: true, ...result, request_id: requestId });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isCallerError = CALLER_ERRORS.has(message) ||
      message.startsWith(`[${FUNCTION_NAME}]`) ||
      message.endsWith("is required") ||
      message.endsWith("must be an array");
    if (!isCallerError) {
      await logEdgeFunctionError({
        functionName: FUNCTION_NAME,
        requestId,
        error,
        metadata: { source: "edge" },
      });
    }
    return jsonResponse(req, { ok: false, error: message, request_id: requestId }, {
      status: isCallerError ? 400 : 500,
    });
  }
});
