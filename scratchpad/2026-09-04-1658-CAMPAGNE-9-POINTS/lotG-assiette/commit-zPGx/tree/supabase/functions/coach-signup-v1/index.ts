/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";

/**
 * KEEL W6.1 — `coach-signup-v1`: turn a freshly authenticated user into a coach.
 *
 * Authority: docs/keel/BUILD_PLAN.md W6.1, docs/keel/SCHEMA.md (TENANCY),
 * migration 20260727120000_keel_tenancy.sql.
 *
 * ---------------------------------------------------------------------------
 * WHY A FUNCTION AND NOT A CLIENT-SIDE INSERT
 * ---------------------------------------------------------------------------
 * `public.coaches` has a SELECT policy and a column-scoped UPDATE policy
 * (display_name only). It has NO INSERT policy, deliberately: `credential_type`
 * and `status` are not client-writable, and a table whose rows grant read
 * access to other people's data does not get an open insert path. So the row is
 * created here, under the service role, from an identity proven by the caller's
 * own JWT.
 *
 * WHAT IT WRITES, AND WHY EACH FIELD
 *   profiles.keel_role = 'coach'  — routing only. It is NOT an entitlement:
 *     access to a student still derives exclusively from a consented
 *     `coach_clients` link (see coached_student_ids()).
 *   profiles.locale    = 'en-US' by default — KEEL ships in English (R1/R3:
 *     ui_locale is a per-user axis, and the legacy signup hard-locks 'fr-FR').
 *   profiles.country   — ISO 3166-1 alpha-2, from a SELECTOR, never guessed
 *     from the locale (W4.2 migration 20260727190000 states this at length:
 *     country is not a language, and the crisis resolver reads it first).
 *   coaches            — the row itself, `credential_type='none'` always.
 *     A self-declared 'rd' or 'clinician' is verified out of band; accepting it
 *     from a signup form would make a claim on a regulated title free.
 *
 * IDEMPOTENT. Signup pages retry: a second call returns the same coach row.
 *
 * REFUSES TO PROMOTE A STUDENT. A user who already carries
 * `keel_role='student'` is somebody's client; flipping them to coach would
 * leave a live `coach_clients` link pointing at a person the system now treats
 * as a prescriber. That is a support ticket, not a self-service action.
 */

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";

const FUNCTION_NAME = "coach-signup-v1";

/** KEEL ships in English. R3: this is `ui_locale`, not the content locale. */
const DEFAULT_COACH_LOCALE = "en-US";

/** Shape only, mirroring `profiles_country_iso3166_check`. Never a closed list. */
const COUNTRY_RE = /^[A-Z]{2}$/;

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
      key: `coach-signup-v1:${user.id}`,
      windows: [
        { limit: 10, windowSeconds: 600 },
        { limit: 40, windowSeconds: 86_400 },
      ],
    });
    if (rateRes) return rateRes;

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    const country = String(body.country ?? "").trim().toUpperCase();
    if (!COUNTRY_RE.test(country)) {
      // R7: a bad country fails at the write site. Silently storing NULL here
      // would push a coach onto the international crisis fallback forever, and
      // nothing downstream would ever say why.
      return jsonResponse(req, {
        error: "country must be an ISO 3166-1 alpha-2 code (e.g. US, GB, FR)",
        request_id: requestId,
      }, { status: 400 });
    }

    const displayNameRaw = body.display_name;
    const displayName = displayNameRaw === undefined || displayNameRaw === null
      ? null
      : String(displayNameRaw).trim() || null;

    const localeRaw = String(body.locale ?? "").trim();
    // BCP-47 shape check only; the tag itself is not a closed list.
    const locale = localeRaw && /^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/.test(localeRaw)
      ? localeRaw
      : DEFAULT_COACH_LOCALE;

    const admin = adminClient();

    // --- 1. The profile must exist (handle_new_user creates it on signup) ---
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, keel_role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile) {
      return jsonResponse(req, {
        error: "profile_not_found",
        request_id: requestId,
      }, { status: 409 });
    }
    if (String(profile.keel_role ?? "") === "student") {
      return jsonResponse(req, {
        error: "already_a_student",
        request_id: requestId,
        detail:
          "This account follows a coach's plan. A student account cannot be " +
          "converted to a coach account.",
      }, { status: 409 });
    }

    // --- 2. Role, locale, country --------------------------------------
    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        keel_role: "coach",
        locale,
        country,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (updateErr) throw updateErr;

    // --- 3. The coaches row (idempotent) --------------------------------
    const { data: existing, error: existingErr } = await admin
      .from("coaches")
      .select("id, display_name, credential_type, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingErr) throw existingErr;

    let coach = existing;
    if (!coach) {
      const { data: created, error: createErr } = await admin
        .from("coaches")
        .insert({
          user_id: user.id,
          display_name: displayName ?? String(profile.full_name ?? "") ?? null,
          // Never from the client: a regulated title is verified out of band.
          credential_type: "none",
          status: "active",
        })
        .select("id, display_name, credential_type, status")
        .single();
      if (createErr) throw createErr;
      coach = created;
    } else if (displayName && String(coach.display_name ?? "") !== displayName) {
      const { data: renamed, error: renameErr } = await admin
        .from("coaches")
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq("id", coach.id)
        .select("id, display_name, credential_type, status")
        .single();
      if (renameErr) throw renameErr;
      coach = renamed;
    }

    // Execution truth: everything below is a RE-READ row, not what we sent.
    const { data: readback, error: readbackErr } = await admin
      .from("profiles")
      .select("keel_role, locale, country")
      .eq("id", user.id)
      .single();
    if (readbackErr) throw readbackErr;

    return jsonResponse(req, {
      request_id: requestId,
      coach: {
        id: coach.id,
        display_name: coach.display_name,
        credential_type: coach.credential_type,
        status: coach.status,
      },
      profile: readback,
    });
  } catch (err) {
    await logEdgeFunctionError({
      functionName: FUNCTION_NAME,
      error: err,
      requestId,
    });
    return serverError(req, requestId, `${FUNCTION_NAME} failed`);
  }
});
