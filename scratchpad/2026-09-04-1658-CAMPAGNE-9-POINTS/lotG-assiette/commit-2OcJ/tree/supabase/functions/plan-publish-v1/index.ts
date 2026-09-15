/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";

/**
 * KEEL W6.2 — `plan-publish-v1`: the coach publishes a plan to ONE student.
 *
 * Authority: docs/keel/BUILD_PLAN.md W6.2, docs/keel/SCHEMA.md, CONTRACT.md.
 * The ordering doctrine and the compensation live in `publish.ts`; this file is
 * the HTTP shell and, above all, THE TENANCY GATE.
 *
 * ---------------------------------------------------------------------------
 * WHY A SERVICE-ROLE FUNCTION AND NOT A DIRECT WRITE FROM THE COACH'S CLIENT
 * ---------------------------------------------------------------------------
 * CONTRACT: "No write policy anywhere: the coach is structurally read-only."
 * The coach's JWT cannot insert a `plan_versions` row, by design — a coach
 * writing student rows through PostgREST would be one policy mistake away from
 * writing ANY student's rows. So the write happens here, under the service
 * role, and the tenancy check is explicit.
 *
 * THE GATE IS NOT RE-IMPLEMENTED, IT IS CALLED.
 * The student must appear in `public.coached_student_ids()` — executed under
 * the COACH'S OWN JWT, not the service role. That is the same function every
 * Tier A policy uses, so "who may this coach touch" has exactly one definition
 * in the system. A second, hand-written `select from coach_clients where ...`
 * would be a copy that drifts: it would keep working the day the consent rule
 * changes, and that is precisely how a coach ends up publishing into the space
 * of a student who revoked them.
 *
 * Consent is inside that gate: `coach_clients` cannot be `active` without
 * `consent_granted_at` (CHECK), and `coached_student_ids()` only returns
 * `active` links of an `active` coach.
 */

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { reseedOnPublish } from "../provision-day-v1/reseed_on_publish.ts";
import { supabaseProvisioningPorts } from "../provision-day-v1/ports.ts";
import { supabasePublishPorts } from "./ports.ts";
import {
  PostPublishError,
  publishPlan,
  PublishValidationError,
  type SectionApproval,
} from "./publish.ts";

const FUNCTION_NAME = "plan-publish-v1";

function requireEnv(name: string): string {
  const value = (Deno.env.get(name) ?? "").trim();
  if (!value) throw new Error(`${FUNCTION_NAME}: missing env ${name}`);
  return value;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const requestId = getRequestId(req);

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  if (req.method !== "POST") {
    return jsonResponse(req, {
      error: "Method Not Allowed",
      request_id: requestId,
    }, { status: 405 });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");

    // --- 1. WHO IS CALLING ------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse(req, {
        error: "Unauthorized",
        request_id: requestId,
      }, { status: 401 });
    }

    const rateRes = await enforceRateLimit(req, requestId, {
      key: `plan-publish-v1:${user.id}`,
      windows: [
        { limit: 20, windowSeconds: 300 },
        { limit: 200, windowSeconds: 86_400 },
      ],
    });
    if (rateRes) return rateRes;

    const admin = adminClient();

    // --- 2. IS THE CALLER AN ACTIVE COACH ---------------------------------
    const { data: coachRow, error: coachErr } = await admin
      .from("coaches")
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (coachErr) throw coachErr;
    if (!coachRow || String(coachRow.status) !== "active") {
      return jsonResponse(req, {
        error: "not_an_active_coach",
        request_id: requestId,
      }, { status: 403 });
    }
    const coachId = String(coachRow.id);

    // --- 3. THE BODY -------------------------------------------------------
    const body = await req.json().catch(() => null) as
      | Record<string, unknown>
      | null;
    if (!body || typeof body !== "object") {
      return jsonResponse(req, {
        error: "Invalid JSON body",
        request_id: requestId,
      }, { status: 400 });
    }

    const studentId = String(body.student_id ?? "");
    if (!UUID_RE.test(studentId)) {
      return jsonResponse(req, {
        error: "student_id must be a uuid",
        request_id: requestId,
      }, { status: 400 });
    }

    // --- 4. THE TENANCY GATE ----------------------------------------------
    // Executed under the COACH's JWT. See the header: one definition of "who
    // may this coach touch", shared with every RLS policy.
    const { data: coachedRaw, error: coachedErr } = await userClient.rpc(
      "coached_student_ids",
    );
    if (coachedErr) throw coachedErr;
    const coached = new Set(
      (Array.isArray(coachedRaw) ? coachedRaw : []).map((v) => String(v)),
    );
    if (!coached.has(studentId)) {
      // Same answer whether the student does not exist, is not this coach's,
      // or revoked consent: this endpoint is not a directory oracle.
      return jsonResponse(req, {
        error: "not_your_student",
        request_id: requestId,
      }, { status: 403 });
    }

    // --- 5. PUBLISH --------------------------------------------------------
    const provisioningPorts = supabaseProvisioningPorts(admin);
    const ports = supabasePublishPorts(
      admin,
      ({ planVersionId, now }) =>
        reseedOnPublish({ ports: provisioningPorts, planVersionId, now }),
    );

    const result = await publishPlan({
      ports,
      request: {
        coachId,
        studentId,
        plan: (body.plan ?? {}) as never,
        templateId: body.template_id ? String(body.template_id) : null,
        sourceDocumentId: body.source_document_id
          ? String(body.source_document_id)
          : null,
        commitments: Array.isArray(body.commitments)
          ? body.commitments as unknown[]
          : undefined,
        diff: (body.diff ?? null) as never,
        approvals: (Array.isArray(body.approvals)
          ? body.approvals
          : []) as SectionApproval[],
      },
    });

    return jsonResponse(req, {
      request_id: requestId,
      plan_version: result.planVersion,
      superseded_version_id: result.supersededVersionId,
      summary: {
        commitments: result.commitments.length,
        approvals_recorded: result.approvalsRecorded,
        evaluations_invalidated: result.reseed.evaluationsInvalidated,
        checkins_cancelled: result.reseed.checkinsCancelled,
        rows_seeded: result.reseed.rowsSeeded,
        same_day_seed_skipped_reason: result.reseed.sameDaySeedSkippedReason,
      },
      commitments: result.commitments,
    });
  } catch (err) {
    if (err instanceof PublishValidationError) {
      return jsonResponse(req, {
        error: "publish_refused",
        request_id: requestId,
        issues: err.issues,
      }, { status: 400 });
    }
    if (err instanceof PostPublishError) {
      // 500, but NOT "nothing happened". The plan is live; saying otherwise
      // would make the coach republish and create a second version.
      await logEdgeFunctionError({
        functionName: FUNCTION_NAME,
        error: err,
        requestId,
      });
      return jsonResponse(req, {
        error: "published_but_post_step_failed",
        request_id: requestId,
        published_plan_version_id: err.planVersionId,
        failed_stage: err.stage,
        remediation: err.stage === "reseed"
          ? "re-run provision-day-v1 with mode=reseed_on_publish and this " +
            "plan_version_id; do NOT republish"
          : "the audit trace is incomplete for this publish; do NOT republish",
      }, { status: 500 });
    }
    await logEdgeFunctionError({
      functionName: FUNCTION_NAME,
      error: err,
      requestId,
    });
    return serverError(req, requestId, `${FUNCTION_NAME} failed`);
  }
});
