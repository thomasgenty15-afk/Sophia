// @ts-nocheck
// Self-service account deletion (RGPD/CNIL) — T0 of the "supprimer mon compte" flow.
//
// Two-step contract (INV-5, reuses the destructive-operation confirmation tokens):
//   * action="prepare": fresh password re-auth, then returns a signed
//     ConfirmationToken (10 min TTL) bound to a pending-confirmation row.
//   * action="confirm": requires the token + the typed word "DELETE".
//     Executes T0: profile flagged deletion_pending (purge at J+7), Stripe
//     cancelled immediately (no proration refund), coaching links ended if the
//     user is a coach, WhatsApp shut down after a last sober confirmation
//     message, all sessions revoked.
//
// Restoration before J+7 is handled by account-restore-v1; the hard purge by
// the purge-deleted-accounts cron.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse, serverError } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import { stripeRequest } from "../_shared/stripe.ts";
import {
  createConfirmationToken,
  verifyConfirmationToken,
} from "../sophia-brain/confirmation/confirmation_token.ts";
import {
  ACCOUNT_STATUS_ACTIVE,
  ACCOUNT_STATUS_DELETION_PENDING,
  confirmationTokenSecret,
  DELETION_CONFIRMATION_WORD,
  DELETION_GRACE_DAYS,
  formatFrenchDate,
  sendInternalWhatsApp,
  verifyPasswordFresh,
} from "../_shared/account_lifecycle.ts";

const OPERATION_TYPE = "account_deletion";

function requireEnv(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function deletionDraft(userId: string) {
  // The draft binds the token to this exact operation for this exact user.
  return { operation: OPERATION_TYPE, user_id: userId };
}

type CancelOutcome = { cancelled: string[]; failed: string[] };

async function cancelActiveStripeSubscriptions(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestId: string,
): Promise<CancelOutcome> {
  const stripeSecretKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id,status")
    .eq("user_id", userId);
  if (error) throw error;

  const outcome: CancelOutcome = { cancelled: [], failed: [] };
  for (const sub of subs ?? []) {
    const subId = String(sub?.stripe_subscription_id ?? "").trim();
    const status = String(sub?.status ?? "").toLowerCase();
    if (!subId) continue;
    if (status === "canceled" || status === "cancelled") continue;
    try {
      if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");
      // Immediate cancellation, no proration refund (stated in the UI).
      await stripeRequest({
        method: "DELETE",
        path: `/v1/subscriptions/${encodeURIComponent(subId)}`,
        secretKey: stripeSecretKey,
      });
      outcome.cancelled.push(subId);
      await admin
        .from("subscriptions")
        .update({
          status: "canceled",
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("stripe_subscription_id", subId);
    } catch (err) {
      // A subscription already gone on Stripe's side is a success for us.
      const stripeStatus = (err as any)?.status;
      const alreadyGone = stripeStatus === 404 ||
        String((err as any)?.stripe?.error?.code ?? "") === "resource_missing";
      if (alreadyGone) {
        outcome.cancelled.push(subId);
        continue;
      }
      console.error(`[account-deletion-v1] stripe cancel failed for ${subId}`, err);
      await logEdgeFunctionError({
        functionName: "account-deletion-v1",
        error: err,
        severity: "error",
        title: "stripe_cancel_failed",
        requestId,
        userId,
        source: "stripe",
        metadata: { stripe_subscription_id: subId },
      });
      outcome.failed.push(subId);
    }
  }
  return outcome;
}

async function shutDownWhatsApp(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  // Cancel everything scheduled; the account must go fully silent after the
  // final confirmation message.
  await admin
    .from("scheduled_checkins")
    .update({ status: "cancelled", processed_at: nowIso })
    .eq("user_id", userId)
    .in("status", ["pending", "retrying", "awaiting_user"]);
  await admin
    .from("whatsapp_pending_actions")
    .update({ status: "cancelled", processed_at: nowIso })
    .eq("user_id", userId)
    .eq("status", "pending");
  await admin
    .from("profiles")
    .update({
      whatsapp_opted_in: false,
      whatsapp_opted_out_at: nowIso,
      whatsapp_optout_reason: "account_deletion",
    })
    .eq("id", userId);
}

// KEEL W1.2 — a COACH deletes their account.
//
// The student's data is the STUDENT's property: nothing of theirs is touched
// here. What must end is the LINK, and it must end now rather than at J+7:
// `coach_clients.status='active'` is the billable seat (W10) and the access
// grant read by `coached_student_ids()`, and the partial unique index
// `one_live_coach_per_student` blocks a new coach from picking the student up
// while a live link sits there.
//
// The link would disappear anyway at J+7 (coach_clients.coach_id -> coaches.id
// ON DELETE CASCADE, and coaches.user_id -> auth.users ON DELETE CASCADE), but
// that is seven days of a coach who is leaving still holding a seat and a read
// grant. Marking it 'ended' closes both immediately.
//
// Not reversed by account-restore-v1, on purpose: consent to be coached is not
// something a restore should resurrect. A coach who comes back re-invites, and
// the student consents again (`consent_granted_at`).
type EndedCoachLinks = {
  /** -1 = the tenancy tables were unreachable. Never a fake 0. */
  ended: number;
  coachId: string | null;
  studentUserIds: string[];
};

async function endCoachClientLinks(
  admin: ReturnType<typeof createClient>,
  userId: string,
  nowIso: string,
): Promise<EndedCoachLinks> {
  try {
    const { data: coach, error: coachErr } = await admin
      .from("coaches")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (coachErr) throw coachErr;
    if (!coach?.id) return { ended: 0, coachId: null, studentUserIds: [] };

    const { data: ended, error: endErr } = await admin
      .from("coach_clients")
      .update({ status: "ended", ended_at: nowIso, updated_at: nowIso })
      .eq("coach_id", coach.id)
      .neq("status", "ended")
      // student_user_id is null on an invitation never accepted: nobody to warn.
      .select("id,student_user_id");
    if (endErr) throw endErr;

    const studentUserIds = [
      ...new Set(
        (ended ?? [])
          .map((row: any) => String(row?.student_user_id ?? "").trim())
          .filter(Boolean),
      ),
    ];
    return {
      ended: ended?.length ?? 0,
      coachId: String(coach.id),
      studentUserIds,
    };
  } catch (err) {
    // The tenancy tables (W1.1) are not on every stack yet, and a function
    // deploy is a separate gate from a migration. A missing table must not
    // wedge a deletion the user has already confirmed — but it is logged, and
    // the count comes back through the response as null, never as a fake 0.
    console.warn("[account-deletion-v1] coach link teardown skipped", err);
    return { ended: -1, coachId: null, studentUserIds: [] };
  }
}

// KEEL W1.4 R4 — the student must be TOLD.
//
// `endCoachClientLinks` closes the seat and the read grant, but until now it
// warned nobody: a student simply stopped having a coach, with no event, no
// message, and an app that would keep showing a protocol authored by an account
// that no longer exists. BUILD_PLAN W1.2 requires the notice.
//
// Three properties, in order of importance:
//   1. It NEVER blocks the deletion. The user already confirmed; an email
//      provider having a bad day is not a reason to keep their account open.
//      Every failure is caught, per student and globally.
//   2. It is idempotent. `communication_logs` is keyed on
//      (user_id, type, metadata->>coach_id) so a retried confirm — or a second
//      coach leaving later — does not double-send, and does not suppress a
//      legitimate second notice either.
//   3. It states what is true: the student's plan and data are THEIRS, and stay.
const COACH_DEPARTURE_NOTICE_TYPE = "coach_departure_notice";
// A pilot coach holds a handful of seats (W10). A four-figure fan-out here
// would be a data anomaly, not a use case: it is truncated and SAID.
const COACH_DEPARTURE_MAX_STUDENTS = 200;

function coachDepartureEmailHtml(firstName: string): string {
  const hello = firstName ? `Hi ${firstName},` : "Hi,";
  return `
    <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
      <p>${hello}</p>
      <p>Your coach has closed their Sophia account, so your coaching link has ended.</p>
      <p><strong>Your plan and your data belong to you.</strong> They stay in your
      account and remain accessible exactly as before &mdash; nothing has been
      deleted, and you can export everything at any time.</p>
      <p>Your coach no longer has access to your space. If you work with another
      coach later on, they can invite you and you will be asked to consent
      again.</p>
      <p>Sophia</p>
    </div>
  `;
}

async function notifyStudentsOfCoachDeparture(
  admin: ReturnType<typeof createClient>,
  links: EndedCoachLinks,
  requestId: string,
): Promise<{ notified: number; failed: number; truncated: boolean }> {
  const outcome = { notified: 0, failed: 0, truncated: false };
  if (!links.coachId || links.studentUserIds.length === 0) return outcome;

  const senderEmail = (Deno.env.get("SENDER_EMAIL") ?? "").trim() ||
    "Sophia <sophia@sophia-coach.ai>";
  let studentIds = links.studentUserIds;
  if (studentIds.length > COACH_DEPARTURE_MAX_STUDENTS) {
    outcome.truncated = true;
    studentIds = studentIds.slice(0, COACH_DEPARTURE_MAX_STUDENTS);
  }

  const { data: students, error: studentsErr } = await admin
    .from("profiles")
    .select("id,email,full_name")
    .in("id", studentIds);
  if (studentsErr) throw studentsErr;

  for (const student of students ?? []) {
    const studentId = String((student as any)?.id ?? "").trim();
    if (!studentId) continue;
    try {
      const { data: already } = await admin
        .from("communication_logs")
        .select("id")
        .eq("user_id", studentId)
        .eq("type", COACH_DEPARTURE_NOTICE_TYPE)
        .eq("metadata->>coach_id", links.coachId)
        .limit(1);
      if (already && already.length > 0) continue;

      let email = String((student as any)?.email ?? "").trim();
      if (!email) {
        const { data: authUser } = await admin.auth.admin.getUserById(studentId);
        email = String(authUser?.user?.email ?? "").trim();
      }
      if (!email) {
        // No address is not a silent success: it is a failure we can count.
        console.warn(
          `[account-deletion-v1] request_id=${requestId} coach_departure_no_email user_id=${studentId}`,
        );
        outcome.failed++;
        continue;
      }
      // Ephemeral QA users: same rule as send-welcome-email.
      if (email.toLowerCase().endsWith("@example.com")) continue;

      const firstName = String((student as any)?.full_name ?? "").trim()
        .split(" ")[0] ?? "";
      const sent = await sendResendEmail({
        to: email,
        subject: "Your coach has closed their Sophia account",
        html: coachDepartureEmailHtml(firstName),
        from: senderEmail,
        maxAttempts: 3,
      });
      if (!(sent as any).ok) {
        outcome.failed++;
        console.warn(
          `[account-deletion-v1] request_id=${requestId} coach_departure_email_failed user_id=${studentId}`,
          (sent as any).error,
        );
        continue;
      }

      await admin.from("communication_logs").insert({
        user_id: studentId,
        channel: "email",
        type: COACH_DEPARTURE_NOTICE_TYPE,
        status: "sent",
        metadata: {
          coach_id: links.coachId,
          resend_id: (sent as any).data?.id ?? null,
          skipped: Boolean((sent as any).skipped),
        },
      });
      outcome.notified++;
    } catch (err) {
      outcome.failed++;
      console.warn(
        `[account-deletion-v1] request_id=${requestId} coach_departure_notice_error user_id=${studentId}`,
        err,
      );
    }
  }
  return outcome;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  let currentUserId: string | null = null;

  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnon = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    currentUserId = user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim();
    const admin = createClient(supabaseUrl, supabaseServiceRole);
    const nowIso = new Date().toISOString();

    if (action === "prepare") {
      // Password attempts are rate-limited to keep this endpoint from becoming
      // a credential oracle.
      const rateRes = await enforceRateLimit(req, requestId, {
        key: `account-deletion-auth:${user.id}`,
        windows: [
          { limit: 5, windowSeconds: 3600 },
          { limit: 10, windowSeconds: 86_400 },
        ],
      });
      if (rateRes) return rateRes;

      const password = String(body?.password ?? "");
      const passwordOk = await verifyPasswordFresh({
        createClient,
        email: user.email ?? "",
        password,
      });
      if (!passwordOk) {
        return jsonResponse(
          req,
          { error: "invalid_password", request_id: requestId },
          { status: 403 },
        );
      }

      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { data: pending, error: pendingErr } = await admin
        .from("account_security_confirmations")
        .insert({
          user_id: user.id,
          operation_type: OPERATION_TYPE,
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (pendingErr) throw pendingErr;

      const token = await createConfirmationToken({
        user_id: user.id,
        operation_id: `${OPERATION_TYPE}:${pending.id}`,
        operation_type: OPERATION_TYPE,
        draft: deletionDraft(user.id),
        source_message_id: requestId,
        pending_confirmation_id: pending.id,
        secret: confirmationTokenSecret(),
      });

      const { data: subRow } = await admin
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      const subStatus = String(subRow?.status ?? "").toLowerCase();
      const hasActiveSubscription = subStatus === "active" || subStatus === "trialing" ||
        subStatus === "past_due";

      const purgePreviewIso = new Date(
        Date.now() + DELETION_GRACE_DAYS * 24 * 3600 * 1000,
      ).toISOString();

      return jsonResponse(req, {
        ok: true,
        token,
        confirmation_word: DELETION_CONFIRMATION_WORD,
        purge_at_preview: purgePreviewIso,
        has_active_subscription: hasActiveSubscription,
        request_id: requestId,
      });
    }

    if (action === "confirm") {
      const typed = String(body?.typed_confirmation ?? "").trim();
      if (typed !== DELETION_CONFIRMATION_WORD) {
        return jsonResponse(
          req,
          { error: "confirmation_word_mismatch", request_id: requestId },
          { status: 400 },
        );
      }

      const token = body?.token;
      if (!token || typeof token !== "object") {
        return jsonResponse(req, { error: "missing_token", request_id: requestId }, { status: 400 });
      }

      const verify = await verifyConfirmationToken({
        token,
        draft: deletionDraft(user.id),
        user_id: user.id,
        pending_confirmation_lookup: async (id: string) => {
          const { data } = await admin
            .from("account_security_confirmations")
            .select("id,consumed_at,expires_at")
            .eq("id", id)
            .eq("user_id", user.id)
            .eq("operation_type", OPERATION_TYPE)
            .maybeSingle();
          if (!data) return null;
          const expired = new Date(String(data.expires_at)).getTime() <= Date.now();
          return { consumed: Boolean(data.consumed_at) || expired };
        },
        token_consumption_check: async () => false,
        // Web account-management flow: no live conversation, no safety context.
        safety_context_risk_band: "none",
        secret: confirmationTokenSecret(),
      });
      if (!verify.ok) {
        return jsonResponse(
          req,
          { error: "confirmation_invalid", reason: verify.reason_code, request_id: requestId },
          { status: 403 },
        );
      }

      // Atomic claim of the pending confirmation: replays across isolates lose here.
      const { data: claimed, error: claimErr } = await admin
        .from("account_security_confirmations")
        .update({ consumed_at: nowIso })
        .eq("id", String(token.pending_confirmation_id))
        .is("consumed_at", null)
        .select("id");
      if (claimErr) throw claimErr;
      if (!claimed?.length) {
        return jsonResponse(
          req,
          { error: "confirmation_already_used", request_id: requestId },
          { status: 409 },
        );
      }

      const { data: profile, error: profErr } = await admin
        .from("profiles")
        .select("account_status,whatsapp_opted_in,timezone,purge_at")
        .eq("id", user.id)
        .maybeSingle();
      if (profErr) throw profErr;
      if (!profile) {
        return jsonResponse(req, { error: "profile_not_found", request_id: requestId }, { status: 404 });
      }
      if (profile.account_status === ACCOUNT_STATUS_DELETION_PENDING) {
        return jsonResponse(req, {
          ok: true,
          already_pending: true,
          purge_at: profile.purge_at,
          request_id: requestId,
        });
      }

      const purgeAtIso = new Date(
        Date.now() + DELETION_GRACE_DAYS * 24 * 3600 * 1000,
      ).toISOString();
      const wasOptedIn = Boolean(profile.whatsapp_opted_in);

      // 1) Flag deletion_pending FIRST so the stripe-webhook triggered by the
      //    cancellation below stays silent (no "abonnement annulé" WhatsApp).
      const { error: flagErr } = await admin
        .from("profiles")
        .update({
          account_status: ACCOUNT_STATUS_DELETION_PENDING,
          purge_at: purgeAtIso,
          deletion_requested_at: nowIso,
          pre_deletion_whatsapp_opted_in: wasOptedIn,
        })
        .eq("id", user.id);
      if (flagErr) throw flagErr;

      // 2) Cancel Stripe immediately. If Stripe is unreachable we roll back:
      //    an account must never sit in deletion_pending while still billed.
      const cancelOutcome = await cancelActiveStripeSubscriptions(admin, user.id, requestId);
      if (cancelOutcome.failed.length > 0) {
        await admin
          .from("profiles")
          .update({
            account_status: ACCOUNT_STATUS_ACTIVE,
            purge_at: null,
            deletion_requested_at: null,
            pre_deletion_whatsapp_opted_in: null,
          })
          .eq("id", user.id);
        return jsonResponse(
          req,
          { error: "subscription_cancel_failed", request_id: requestId },
          { status: 502 },
        );
      }

      // 3) Coach case: end every coaching link. Placed after the Stripe step so
      //    it is never undone by the rollback above — past this point the
      //    deletion is committed.
      const endedCoachLinks = await endCoachClientLinks(admin, user.id, nowIso);

      // 3-bis) W1.4 R4: tell each student their coach is gone and that their
      //        plan and data stay theirs. BEST-EFFORT, always: this whole block
      //        cannot throw, and cannot stop a deletion the user confirmed.
      let studentNotice = { notified: 0, failed: 0, truncated: false };
      try {
        studentNotice = await notifyStudentsOfCoachDeparture(
          admin,
          endedCoachLinks,
          requestId,
        );
      } catch (err) {
        console.warn(
          `[account-deletion-v1] request_id=${requestId} coach_departure_notice_pass_failed`,
          err,
        );
        await logEdgeFunctionError({
          functionName: "account-deletion-v1",
          error: err,
          severity: "warn",
          title: "coach_departure_notice_failed",
          requestId,
          userId: user.id,
          source: "email",
        });
      }

      // 4) Last sober WhatsApp confirmation, then full silence.
      let whatsappNotified = false;
      if (wasOptedIn) {
        const purgeDateFr = formatFrenchDate(purgeAtIso, profile.timezone);
        whatsappNotified = await sendInternalWhatsApp({
          user_id: user.id,
          purpose: "account_deletion_confirmed",
          body:
            `C'est fait. Ton compte sera définitivement supprimé le ${purgeDateFr}. ` +
            `Reconnecte-toi avant cette date si tu veux annuler la suppression. ` +
            `D'ici là, tu ne recevras plus aucun message.`,
          metadata_extra: { account_deletion: true },
        });
      }

      // 5) WhatsApp shutdown: opt-out + cancel everything scheduled.
      await shutDownWhatsApp(admin, user.id);

      // 6) Revoke every session (the current one included). The server-side
      //    user client has no stored session, so revoke through the admin API
      //    with the caller's raw JWT.
      try {
        const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (jwt) await admin.auth.admin.signOut(jwt, "global");
      } catch (err) {
        console.warn("[account-deletion-v1] global sign-out failed (non-blocking)", err);
      }

      return jsonResponse(req, {
        ok: true,
        purge_at: purgeAtIso,
        cancelled_subscriptions: cancelOutcome.cancelled.length,
        // null = the tenancy tables were unreachable, not "zero students".
        ended_coach_links: endedCoachLinks.ended < 0 ? null : endedCoachLinks.ended,
        // W1.4 R4, execution truth: what was actually delivered, not what was
        // attempted. `students_notify_failed > 0` means students were left in
        // the dark — the deletion still went through, on purpose.
        students_notified: studentNotice.notified,
        students_notify_failed: studentNotice.failed,
        students_notify_truncated: studentNotice.truncated,
        whatsapp_notified: whatsappNotified,
        request_id: requestId,
      });
    }

    return jsonResponse(req, { error: "unknown_action", request_id: requestId }, { status: 400 });
  } catch (err) {
    console.error("[account-deletion-v1] error", err);
    await logEdgeFunctionError({
      functionName: "account-deletion-v1",
      error: err,
      severity: "error",
      title: "account_deletion_failed",
      requestId,
      userId: currentUserId,
      source: "edge",
    });
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    if (msg.startsWith("Missing env var:")) return serverError(req, requestId, msg);
    return serverError(req, requestId);
  }
});
