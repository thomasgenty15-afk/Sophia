import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// KEEL — coach-invite-student-v1 (BUILD_PLAN W6.5)
//
// A coach invites a student by email. This function mints the token, stores
// ONLY its sha256, and mails the /join link through the existing Resend
// pipeline. It creates no account, sends no magic link, and does NOT use
// `inviteUserByEmail` (SCHEMA, TENANCY: "accepted via the referral-attribution
// pattern in handle_new_user, NOT inviteUserByEmail").
//
// WHAT IT DELIBERATELY DOES NOT DO — create a `coach_clients` row. The partial
// unique index `one_live_coach_per_student` covers `status in ('invited',
// 'active')`, so a link materialised at invite time would let a forgotten,
// never-accepted invitation occupy the student's only live seat and lock them
// out of every other coach. The link is born at acceptance, inside
// `accept_coach_invitation_for_user` (migration 20260727200000). Full
// reasoning in that migration's header.
//
// AUTH, TWO DOORS, ONE RESULT:
//   * `x-internal-secret` present -> ensureInternalRequest() is the gate (same
//     guard as send-welcome-email), and the body must name `coach_user_id`.
//     This is the server-to-server / seeding / test path, and the ONLY path
//     that gets the clear join URL back in the response.
//   * otherwise -> a coach's own JWT. `coaches.status='active'` is re-read
//     server-side; a bearer token is an identity, never an entitlement.
// The coach's browser never receives the token: it goes to the invitee's
// mailbox and nowhere else.
//
// Reused verbatim from send-welcome-email/index.ts, per the lot's instruction:
// `ensureInternalRequest`, idempotence through `communication_logs`, the
// `@example.com` skip, and `sendResendEmail` with its MEGA_TEST_MODE skip and
// 429 backoff. No second email client exists in this repo.

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import {
  buildJoinUrl,
  generateInviteToken,
  hashInviteToken,
  INVITE_REUSE_WINDOW_SECONDS,
  INVITE_TTL_DAYS,
  isEphemeralTestEmail,
  normalizeInviteEmail,
  renderInviteEmail,
} from "./invite_token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") ?? "Sophia <sophia@sophia-coach.ai>";

const COMMUNICATION_TYPE = "coach_invite_email";

/** The audit/idempotence surface of one invite: never the raw email (SEC-13). */
function logLine(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "coach_invite", ...fields }));
}

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

  const usesInternalSecret = Boolean(req.headers.get("x-internal-secret"));
  if (usesInternalSecret) {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // ---------------------------------------------------------------------
    // 1. WHO IS ASKING. Both doors converge on one `coachUserId`; everything
    //    downstream is identical, so there is no privileged behaviour hiding
    //    behind the internal path other than the join-URL echo.
    // ---------------------------------------------------------------------
    let coachUserId: string;
    if (usesInternalSecret) {
      const raw = body?.coach_user_id;
      if (typeof raw !== "string" || raw.trim() === "") {
        return jsonResponse(req, {
          error: "coach_user_id is required on the internal path",
          request_id: requestId,
        }, { status: 400 });
      }
      coachUserId = raw.trim();
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
      coachUserId = userData.user.id;
    }

    // Abuse gate: this endpoint sends email on demand. Keyed by coach so one
    // account cannot be used as a mailer, and low enough that a human coach
    // onboarding a cohort still gets through.
    const limited = await enforceRateLimit(req, requestId, {
      key: `coach-invite:${coachUserId}`,
      windows: [
        { limit: 10, windowSeconds: 600 },
        { limit: 60, windowSeconds: 86_400 },
      ],
    });
    if (limited) return limited;

    // ---------------------------------------------------------------------
    // 2. IS THE CALLER AN ACTIVE COACH. Re-read from the table: `keel_role`
    //    on profiles is self-declared and grants nothing (tenancy migration).
    // ---------------------------------------------------------------------
    const { data: coachRow, error: coachError } = await admin
      .from("coaches")
      .select("id, user_id, display_name, status")
      .eq("user_id", coachUserId)
      .maybeSingle();
    if (coachError) throw new Error(`coaches lookup failed: ${coachError.message}`);
    if (!coachRow || coachRow.status !== "active") {
      return jsonResponse(req, {
        error: "not_an_active_coach",
        request_id: requestId,
      }, { status: 403 });
    }
    const coachId = coachRow.id as string;

    // ---------------------------------------------------------------------
    // 3. THE INVITEE.
    // ---------------------------------------------------------------------
    let email: string;
    try {
      email = normalizeInviteEmail(body?.email);
    } catch (err) {
      return jsonResponse(req, {
        error: "invalid_email",
        detail: err instanceof Error ? err.message : String(err),
        request_id: requestId,
      }, { status: 400 });
    }

    const { data: coachProfile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", coachUserId)
      .maybeSingle();
    if (
      coachProfile?.email &&
      String(coachProfile.email).trim().toLowerCase() === email
    ) {
      return jsonResponse(req, { error: "self_invitation", request_id: requestId }, {
        status: 400,
      });
    }

    // A student already LIVE with another coach is refused HERE, before an
    // email goes out promising a space they cannot join. The same rule is
    // re-checked inside accept_coach_invitation_for_user, because the state
    // can change between the invitation and the click: this check exists to
    // avoid a misleading email, the RPC's exists to keep the invariant.
    // `.eq` and not `.ilike`: PostgREST has no ESCAPE clause, so an address
    // containing `_` or `%` — both legal in a local part — would be sent as a
    // LIKE wildcard and match a DIFFERENT account. Emails reach profiles
    // already lowercased (GoTrue normalises, handle_new_user copies), so exact
    // match is the correct comparison, not an approximation of one.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile?.id) {
      const { data: liveLinks, error: linkError } = await admin
        .from("coach_clients")
        .select("id, coach_id, status")
        .eq("student_user_id", existingProfile.id)
        .in("status", ["invited", "active"]);
      if (linkError) throw new Error(`coach_clients lookup failed: ${linkError.message}`);
      const live = (liveLinks ?? [])[0] as { coach_id: string } | undefined;
      if (live && live.coach_id !== coachId) {
        logLine({ request_id: requestId, coach_id: coachId, outcome: "student_already_coached" });
        return jsonResponse(req, {
          error: "student_already_coached",
          request_id: requestId,
        }, { status: 409 });
      }
      if (live && live.coach_id === coachId) {
        return jsonResponse(req, {
          error: "already_your_student",
          request_id: requestId,
        }, { status: 409 });
      }
    }

    // ---------------------------------------------------------------------
    // 4. THE INVITATION ROW.
    //
    // A repeat POST inside the reuse window must not mint a second token — but
    // "there is a recent pending row" is NOT enough to conclude the first
    // attempt reached anybody. The reuse condition is therefore a fresh pending
    // invitation THAT WAS ACTUALLY MAILED, evidenced by its `communication_logs`
    // line. Anything else (the send raised, the process died between the insert
    // and the send) is treated as never sent: the orphan is revoked and a fresh
    // token goes out.
    //
    // The first version of this function reused on freshness alone, and a real
    // run caught it: the send failed on a missing Resend key, the retry found
    // the 12-second-old row, reused it, held no clear token, and answered
    // `ok: true`. A coach would have watched an invitation "succeed" that no
    // mailbox ever received — the announce-what-was-not-committed class this
    // repo keeps paying for. There is now no code path that reports success
    // without either a send or the proof of a previous one.
    //
    // Outside the window the coach is genuinely re-inviting: the previous
    // pending row is revoked (the partial unique index allows exactly one
    // pending per (coach, email)) and a fresh token is minted. The old link
    // stops working, which is the correct behaviour for a resend.
    // ---------------------------------------------------------------------
    const nowMs = Date.now();
    const { data: pendingRows, error: pendingError } = await admin
      .from("coach_invitations")
      .select("id, created_at, expires_at")
      .eq("coach_id", coachId)
      .eq("email", email)
      .eq("status", "pending");
    if (pendingError) {
      throw new Error(`coach_invitations lookup failed: ${pendingError.message}`);
    }

    const fresh = (pendingRows ?? []).find((row) => {
      const created = Date.parse(String((row as { created_at: string }).created_at));
      const expires = Date.parse(String((row as { expires_at: string }).expires_at));
      return (
        Number.isFinite(created) &&
        nowMs - created < INVITE_REUSE_WINDOW_SECONDS * 1000 &&
        Number.isFinite(expires) &&
        expires > nowMs
      );
    }) as { id: string } | undefined;

    if (fresh) {
      const { data: freshLog } = await admin
        .from("communication_logs")
        .select("id")
        .eq("user_id", coachUserId)
        .eq("type", COMMUNICATION_TYPE)
        .eq("metadata->>invitation_id", fresh.id)
        .limit(1);
      if (freshLog && freshLog.length > 0) {
        logLine({
          request_id: requestId,
          coach_id: coachId,
          invitation_id: fresh.id,
          outcome: "already_sent",
        });
        return jsonResponse(req, {
          ok: true,
          request_id: requestId,
          invitation_id: fresh.id,
          email,
          send_state: "already_sent",
        });
      }
    }

    if ((pendingRows ?? []).length > 0) {
      const { error: revokeError } = await admin
        .from("coach_invitations")
        .update({ status: "revoked" })
        .eq("coach_id", coachId)
        .eq("email", email)
        .eq("status", "pending");
      if (revokeError) {
        throw new Error(`revoking previous invitation failed: ${revokeError.message}`);
      }
    }

    const clearToken = generateInviteToken();
    const expiresAt = new Date(nowMs + INVITE_TTL_DAYS * 86_400_000).toISOString();
    const { data: inserted, error: insertError } = await admin
      .from("coach_invitations")
      .insert({
        coach_id: coachId,
        email,
        invite_token_hash: await hashInviteToken(clearToken),
        expires_at: expiresAt,
        status: "pending",
      })
      .select("id, email, expires_at, status")
      .single();
    // WRITE-THROUGH: the row is re-read, and only the re-read row is
    // announced. Nothing below claims an invitation that is not on file.
    if (insertError || !inserted) {
      throw new Error(
        `creating the invitation failed: ${insertError?.message ?? "no row returned"}`,
      );
    }
    const invitationId = (inserted as { id: string }).id;
    logLine({ request_id: requestId, coach_id: coachId, invitation_id: invitationId, outcome: "created" });

    // ---------------------------------------------------------------------
    // 5. THE EMAIL. A failure here throws: the caller gets a 500 and no
    //    `communication_logs` line exists, so the next attempt is a clean
    //    re-mint rather than a false "already sent".
    // ---------------------------------------------------------------------
    const joinUrl = buildJoinUrl(
      Deno.env.get("APP_BASE_URL") ?? Deno.env.get("SITE_URL") ??
        Deno.env.get("PUBLIC_SITE_URL"),
      clearToken,
    );

    let sendState: "sent" | "skipped_ephemeral";

    if (isEphemeralTestEmail(email)) {
      sendState = "skipped_ephemeral";
      logLine({ request_id: requestId, invitation_id: invitationId, outcome: "skipped_ephemeral" });
    } else {
      const { subject, html } = renderInviteEmail({
        coachName: (coachRow.display_name as string | null) ??
          (coachProfile?.full_name as string | null) ?? null,
        joinUrl,
      });
      const out = await sendResendEmail({
        to: email,
        subject,
        html,
        from: SENDER_EMAIL,
        maxAttempts: 6,
      });
      if (!out.ok) {
        throw new Error(`Resend failed: ${(out as { error: string }).error}`);
      }
      sendState = "sent";
      await admin.from("communication_logs").insert({
        user_id: coachUserId,
        channel: "email",
        type: COMMUNICATION_TYPE,
        status: "sent",
        metadata: {
          invitation_id: invitationId,
          resend_id: (out as { data?: { id?: string } }).data?.id ?? null,
          skipped: Boolean((out as { skipped?: boolean }).skipped),
        },
      });
    }

    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
      invitation_id: invitationId,
      email,
      send_state: sendState,
      // The clear join URL is echoed ONLY to a caller who proved possession of
      // the internal secret (server-to-server, seeding, local end-to-end
      // tests). A coach's browser never sees the token.
      ...(usesInternalSecret ? { join_url: joinUrl } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[coach-invite-student-v1] request_id=${requestId} error=${message}`);
    await logEdgeFunctionError({
      functionName: "coach-invite-student-v1",
      error,
      requestId,
      source: "edge",
    });
    return jsonResponse(req, { error: "invite_failed", request_id: requestId }, {
      status: 500,
    });
  }
});
