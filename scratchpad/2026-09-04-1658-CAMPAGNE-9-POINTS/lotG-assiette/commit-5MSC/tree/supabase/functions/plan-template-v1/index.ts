/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

/**
 * KEEL — plan-template-v1 (W6.4 + the server half of W6.3).
 *
 * `plan_templates` is where the coach actually works: the PDF is imported ONCE
 * into a template, and each student is a clone + diff (SCHEMA.md). This
 * function is the CRUD around that table, plus the two read-only derivations
 * the review screen needs before anything is persisted.
 *
 * WHY AN EDGE FUNCTION AND NOT POSTGREST. `plan_templates` has RLS enabled and
 * NO policy for `authenticated` (migration 20260727090000: "no policy here is
 * deliberate, not an omission" — the coaches table did not exist yet). The
 * table is therefore reachable only by the service role. This function holds
 * that role and re-derives the coach identity itself, from the caller's own
 * JWT: `auth.uid()` -> `coaches.user_id`, status 'active'. No `coach_id` is
 * ever read from the request body — that would let any caller write into
 * anybody's library.
 *
 * ACTIONS
 *   vocabulary     (no coach required) closed vocabularies + reference tables
 *   safety_review  (no coach required) coach-only reference notes, unsaved lines
 *   list | get | create | update | delete   (coach required)
 *
 * WRITE-THROUGH, ALWAYS. Every mutation re-reads the row it just wrote and
 * returns that row. Nothing here announces an effect it has not read back.
 */

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  getRequestId,
  jsonResponse,
  serverError,
} from "../_shared/http.ts";
import {
  COMMITMENT_ENUMS,
  validateTemplateCommitments,
} from "./commitment_rules.ts";
import {
  reviewSafety,
  type SafetyInput,
  type SubstanceInteractionRow,
  type SubstanceLimitRow,
} from "./safety.ts";

const FUNCTION_NAME = "plan-template-v1";

const TEMPLATE_COLUMNS =
  "id, coach_id, title, description, content_locale, default_swap_policy, " +
  "default_autonomy, default_flex_allowance, default_adherence_target_pct, " +
  "commitments, version, status, created_at, updated_at";

const TEMPLATE_STATUS = ["draft", "active", "archived"] as const;

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

/**
 * Resolve the CALLER's coach row. The coach identity comes from the JWT and
 * nowhere else: a `coach_id` in the body would be a tenancy hole, and
 * SCHEMA.md is explicit that impersonation is refused on the record.
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
    return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
  }
  const { data: coach, error: coachErr } = await admin
    .from("coaches")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (coachErr) throw coachErr;
  if (!coach) {
    return jsonResponse(
      req,
      { error: "not_a_coach", request_id: requestId },
      { status: 403 },
    );
  }
  if ((coach as { status: string }).status !== "active") {
    return jsonResponse(
      req,
      { error: "coach_suspended", request_id: requestId },
      { status: 403 },
    );
  }
  return { coachId: (coach as { id: string }).id, userId: user.id };
}

// ---------------------------------------------------------------------------
// vocabulary — reference data, one round trip
// ---------------------------------------------------------------------------
/**
 * Deliberately NOT coach-gated. Everything returned here is seeded reference
 * data already readable by every authenticated user (`slot_vocabulary`,
 * `food_groups`, `substances`, `substance_limits`, `substance_interactions`
 * all carry `for select to authenticated using (true)`), plus the token lists
 * of `_shared/keel/tokens.ts`. It carries no coach and no student row.
 *
 * The point of serving the ENUMS from here is R1/R7: the editor's selectors
 * are built from tokens.ts itself, so a vocabulary added in TypeScript cannot
 * be missing from the UI, and a token the UI offers cannot be one the parsers
 * reject.
 */
async function handleVocabulary(req: Request, admin: SupabaseClient): Promise<Response> {
  const [slots, foodGroups, substances, limits, interactions] = await Promise.all([
    admin.from("slot_vocabulary").select("key, label_i18n_key, default_local_time, sort_order")
      .order("sort_order", { ascending: true }),
    admin.from("food_groups").select("slug, class, typical_portion, unit, label_i18n_key")
      .order("slug", { ascending: true }),
    admin.from("substances").select("slug, kind, label_i18n_key")
      .order("slug", { ascending: true }),
    admin.from("substance_limits").select("substance_ref, ul_amount, ul_unit, per"),
    admin.from("substance_interactions").select("substance_ref, medication_class, severity, note"),
  ]);
  for (const res of [slots, foodGroups, substances, limits, interactions]) {
    if (res.error) throw res.error;
  }
  return jsonResponse(req, {
    request_id: getRequestId(req),
    enums: COMMITMENT_ENUMS,
    template_status: TEMPLATE_STATUS,
    slot_vocabulary: slots.data,
    food_groups: foodGroups.data,
    substances: substances.data,
    substance_limits: limits.data,
    substance_interactions: interactions.data,
  });
}

// ---------------------------------------------------------------------------
// safety_review — coach-only reference notes on lines that are not saved yet.
// READ-ONLY IN BOTH DIRECTIONS: it reads two seeded reference tables and returns
// facts. It changes no line, refuses no publish, and produces nothing a student
// could ever read (safety.ts header, 2026-07-28).
// ---------------------------------------------------------------------------
async function handleSafetyReview(
  req: Request,
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const requestId = getRequestId(req);
  const raw = body.commitments;
  if (!Array.isArray(raw)) {
    return badRequest(req, requestId, "commitments must be an array");
  }
  if (raw.length > 300) {
    return badRequest(req, requestId, "commitments: at most 300 lines per review");
  }
  const inputs: SafetyInput[] = raw.map((r) => {
    const c = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    const num = (v: unknown) =>
      v === null || v === undefined || v === "" ? null : Number(v);
    return {
      title: String(c.title ?? ""),
      substance_ref: c.substance_ref == null || c.substance_ref === ""
        ? null
        : String(c.substance_ref),
      // `provenance` is deliberately NOT forwarded: the notes below are the
      // same whatever it holds, and re-reading it here is how a gate grows back.
      measure: String(c.measure ?? ""),
      unit: c.unit == null || c.unit === "" ? null : String(c.unit),
      target_op: String(c.target_op ?? "any"),
      target_min: num(c.target_min),
      target_max: num(c.target_max),
    };
  });

  const [limits, interactions] = await Promise.all([
    admin.from("substance_limits").select("substance_ref, ul_amount, ul_unit, per"),
    admin.from("substance_interactions").select("substance_ref, medication_class, severity, note"),
  ]);
  if (limits.error) throw limits.error;
  if (interactions.error) throw interactions.error;

  const findings = reviewSafety(
    inputs,
    limits.data as unknown as SubstanceLimitRow[],
    interactions.data as unknown as SubstanceInteractionRow[],
  );
  return jsonResponse(req, {
    request_id: requestId,
    findings,
    noted_count: findings.filter((f) => f.coach_notes.length > 0).length,
  });
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

interface TemplatePatch {
  title?: string;
  description?: string | null;
  content_locale?: string;
  default_swap_policy?: Record<string, unknown>;
  default_autonomy?: string;
  default_flex_allowance?: number;
  default_adherence_target_pct?: number;
  commitments?: unknown[];
  status?: string;
}

/**
 * `default_swap_policy` must land in the shape the EVALUATOR will later read
 * back out of `content.swap_policy` (`extractSwapPolicy`, evaluate-adherence-v1):
 * `{class_equivalent: boolean, allowed_groups: string[]|null}`. A shape it does
 * not recognize is read as "no policy" — silently stricter, and invisible. So
 * the write is refused here instead.
 */
function normalizeSwapPolicy(raw: unknown, issues: string[]): Record<string, unknown> {
  if (raw === null || raw === undefined) return { class_equivalent: false, allowed_groups: null };
  if (typeof raw !== "object") {
    issues.push("default_swap_policy: must be an object");
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const classEquivalent = obj.class_equivalent;
  if (typeof classEquivalent !== "boolean") {
    issues.push("default_swap_policy.class_equivalent: must be a boolean");
  }
  const groups = obj.allowed_groups;
  if (groups !== null && groups !== undefined && !Array.isArray(groups)) {
    issues.push("default_swap_policy.allowed_groups: must be an array of food_groups slugs or null");
  }
  return {
    class_equivalent: classEquivalent === true,
    allowed_groups: Array.isArray(groups) && groups.length > 0
      ? groups.map((g) => String(g))
      : null,
  };
}

function buildPatch(
  body: Record<string, unknown>,
  issues: string[],
  { forCreate }: { forCreate: boolean },
): TemplatePatch {
  const patch: TemplatePatch = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (forCreate || has("title")) {
    const title = String(body.title ?? "").trim();
    if (title === "") issues.push("title: required");
    if (title.length > 200) issues.push("title: at most 200 characters");
    patch.title = title;
  }
  if (has("description")) {
    patch.description = body.description == null ? null : String(body.description);
  }
  if (forCreate || has("content_locale")) {
    const locale = String(body.content_locale ?? "").trim();
    // R2: a row of prose carries its locale. A default here would be a guess.
    if (!/^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/.test(locale)) {
      issues.push("content_locale: required, BCP-47 (R2)");
    }
    patch.content_locale = locale;
  }
  if (forCreate || has("default_swap_policy")) {
    patch.default_swap_policy = normalizeSwapPolicy(body.default_swap_policy, issues);
  }
  if (forCreate || has("default_autonomy")) {
    const autonomy = String(body.default_autonomy ?? "strict");
    if (!(COMMITMENT_ENUMS.autonomy as readonly string[]).includes(autonomy)) {
      issues.push(`default_autonomy: expected one of ${COMMITMENT_ENUMS.autonomy.join(", ")}`);
    }
    patch.default_autonomy = autonomy;
  }
  if (has("default_flex_allowance")) {
    const n = Number(body.default_flex_allowance);
    if (!Number.isInteger(n) || n < 0 || n > 7) {
      issues.push("default_flex_allowance: integer between 0 and 7 (per week)");
    }
    patch.default_flex_allowance = n;
  }
  if (has("default_adherence_target_pct")) {
    const n = Number(body.default_adherence_target_pct);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      issues.push("default_adherence_target_pct: integer between 1 and 100");
    }
    patch.default_adherence_target_pct = n;
  }
  if (has("status")) {
    const status = String(body.status);
    if (!(TEMPLATE_STATUS as readonly string[]).includes(status)) {
      issues.push(`status: expected one of ${TEMPLATE_STATUS.join(", ")}`);
    }
    patch.status = status;
  }
  if (forCreate || has("commitments")) {
    const commitments = body.commitments ?? [];
    const perLine = validateTemplateCommitments(commitments);
    for (const { index, issues: lineIssues } of perLine) {
      for (const issue of lineIssues) {
        issues.push(`commitments[${index}] ${issue}`);
      }
    }
    patch.commitments = commitments as unknown[];
  }
  return patch;
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  if (req.method !== "POST") {
    return jsonResponse(
      req,
      { error: "Method Not Allowed", request_id: requestId },
      { status: 405 },
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return badRequest(req, requestId, "body must be a JSON object");
    }
    const action = String(body.action ?? "");
    const admin = adminClient();

    // Read-only reference derivations: no coach identity involved.
    if (action === "vocabulary") return await handleVocabulary(req, admin);
    if (action === "safety_review") return await handleSafetyReview(req, admin, body);

    const coach = await resolveCoach(req, admin);
    if (coach instanceof Response) return coach;

    const rate = await enforceRateLimit(req, requestId, {
      key: `plan-template:${coach.coachId}`,
      windows: [{ limit: 120, windowSeconds: 60 }],
    });
    if (rate) return rate;

    if (action === "list") {
      const { data, error } = await admin
        .from("plan_templates")
        .select(TEMPLATE_COLUMNS)
        .eq("coach_id", coach.coachId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return jsonResponse(req, { request_id: requestId, templates: data });
    }

    if (action === "get") {
      const id = String(body.id ?? "");
      if (!id) return badRequest(req, requestId, "id: required");
      const { data, error } = await admin
        .from("plan_templates")
        .select(TEMPLATE_COLUMNS)
        .eq("id", id)
        .eq("coach_id", coach.coachId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return jsonResponse(req, { error: "not_found", request_id: requestId }, { status: 404 });
      }
      return jsonResponse(req, { request_id: requestId, template: data });
    }

    if (action === "create") {
      const issues: string[] = [];
      const patch = buildPatch(body, issues, { forCreate: true });
      if (issues.length > 0) {
        return badRequest(req, requestId, "validation_failed", { issues });
      }
      const { data, error } = await admin
        .from("plan_templates")
        .insert({ ...patch, coach_id: coach.coachId })
        .select(TEMPLATE_COLUMNS)
        .single();
      if (error) throw error;
      // Write-through: `data` is the row Postgres actually holds, not the payload.
      return jsonResponse(req, { request_id: requestId, template: data }, { status: 201 });
    }

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return badRequest(req, requestId, "id: required");
      const issues: string[] = [];
      const patch = buildPatch(body, issues, { forCreate: false });
      if (issues.length > 0) {
        return badRequest(req, requestId, "validation_failed", { issues });
      }
      if (Object.keys(patch).length === 0) {
        return badRequest(req, requestId, "update: nothing to change");
      }
      const { data, error } = await admin
        .from("plan_templates")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("coach_id", coach.coachId)
        .select(TEMPLATE_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return jsonResponse(req, { error: "not_found", request_id: requestId }, { status: 404 });
      }
      return jsonResponse(req, { request_id: requestId, template: data });
    }

    if (action === "delete") {
      const id = String(body.id ?? "");
      if (!id) return badRequest(req, requestId, "id: required");
      const { data: existing, error: readErr } = await admin
        .from("plan_templates")
        .select("id, status")
        .eq("id", id)
        .eq("coach_id", coach.coachId)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!existing) {
        return jsonResponse(req, { error: "not_found", request_id: requestId }, { status: 404 });
      }
      // A published clone keeps `plan_versions.template_id` pointing here
      // (ON DELETE SET NULL). Hard-deleting a template that has ever been
      // active would silently orphan those versions — the trace of what a
      // student was actually prescribed. Only a draft is erasable.
      if ((existing as { status: string }).status !== "draft") {
        return jsonResponse(
          req,
          {
            error: "delete_refused_not_draft",
            request_id: requestId,
            details: {
              message:
                "Only a draft template can be deleted. Archive it instead — published " +
                "plan_versions still reference it.",
            },
          },
          { status: 409 },
        );
      }
      const { error } = await admin
        .from("plan_templates")
        .delete()
        .eq("id", id)
        .eq("coach_id", coach.coachId);
      if (error) throw error;
      // Write-through on a delete = re-read and confirm the absence.
      const { data: after, error: afterErr } = await admin
        .from("plan_templates")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (afterErr) throw afterErr;
      if (after) {
        return serverError(req, requestId, "delete did not take effect");
      }
      return jsonResponse(req, { request_id: requestId, deleted_id: id });
    }

    return badRequest(
      req,
      requestId,
      `unknown action ${JSON.stringify(action)}. Expected one of: ` +
        "vocabulary, safety_review, list, get, create, update, delete",
    );
  } catch (err) {
    await logEdgeFunctionError({ functionName: FUNCTION_NAME, error: err, requestId });
    return serverError(req, requestId, `${FUNCTION_NAME} failed`);
  }
});
