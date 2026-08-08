/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import {
  ACTION_LATE_AFTERNOON_EVENT_CONTEXT,
  ACTION_MORNING_EVENT_CONTEXT,
  ACTION_NIGHT_PREP_EVENT_CONTEXT,
  buildLightMorningFallbackMessage,
  buildLightMorningInstruction,
  localDateYmdInTimezone,
  MORNING_LIGHT_GREETING_EVENT_CONTEXT,
  shouldScheduleLightMorningGreeting,
} from "../_shared/action_occurrences.ts";
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts";
import { classifyProvisioningTimezones } from "./timezone_gate.ts";
import {
  randomMorningEncouragementLocalTime,
} from "../_shared/proactive_checkin_timing.ts";
import { provisionKeelDayForUser } from "../_shared/keel/provision_day.ts";
import { tierGrantsProtocolExecution } from "../_shared/billing-tier.ts";
import {
  BIRTHDAY_GREETING_EVENING_LOCAL_TIME,
  BIRTHDAY_GREETING_MORNING_LOCAL_TIME,
  birthdayGreetingEventContext,
  birthdayGreetingScheduledFor,
  birthdayMatchesLocalDate,
  buildBirthdayGreetingMessage,
} from "../_shared/birthday_checkins.ts";
import {
  listMorningNudgeEventContexts,
} from "../sophia-brain/momentum_morning_nudge.ts";
// RETRAIT RÉSIDUS (2026-08-08): la revue hebdo du plan V2 est partie avec
// le système de plan. Les deux contexts restent pour que les annulations
// (pause, mute, reset) continuent de drainer les lignes encore en base.
const WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT = "weekly_progress_review_v2";
const WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT =
  "weekly_planning_validation_prompt";

const MORNING_PENDING_STATUSES = ["pending", "retrying", "awaiting_user"];
const LEGACY_ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT =
  "action_morning_followup_v2";

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}


function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// Imported for the KEEL provisioning gate below (W10). Kept as a named import
// rather than re-implemented here: the tier vocabulary has four hard-coded
// sites already and this file is not going to be a fifth.
function isWhatsappSchedulingTierEligible(
  accessTierRaw: unknown,
  trialEndRaw?: unknown,
): boolean {
  const tier = cleanText(accessTierRaw).toLowerCase();
  // W10 (MEGA_REVIEW B6): 'coach' and 'student' are KEEL tiers. The student
  // never subscribes — their coach pays the seat — so a predicate that only
  // knew the legacy B2C tiers answered "not eligible" for every KEEL student
  // on the platform and cancelled their pending check-ins every hour.
  if (tier === "coach" || tier === "student") return true;
  if (tier === "alliance" || tier === "architecte") return true;
  if (tier !== "trial") return false;

  const trialEnd = cleanText(trialEndRaw);
  if (!trialEnd) return true;
  const trialEndMs = new Date(trialEnd).getTime();
  return Number.isFinite(trialEndMs) && trialEndMs > Date.now();
}

function getSiteUrl(): string {
  // APP_BASE_URL is the canonical frontend URL (required by the Stripe
  // functions, so it is always set per-project). Prefer it so WhatsApp links
  // never silently fall back to the hardcoded prod domain on staging.
  return cleanText(
    Deno.env.get("APP_BASE_URL") ?? Deno.env.get("SITE_URL") ??
      Deno.env.get("PUBLIC_SITE_URL"),
    "https://app.sophia.app",
  );
}

async function hasActiveBirthdayGreetingForEvent(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  eventContext: string;
}): Promise<boolean> {
  const { data, error } = await params.supabaseAdmin
    .from("scheduled_checkins")
    .select("id")
    .eq("user_id", params.userId)
    .eq("event_context", params.eventContext)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function cancelFutureMorningCheckins(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  nowIso: string;
  untilIso?: string | null;
}): Promise<void> {
  let query = params.supabaseAdmin
    .from("scheduled_checkins")
    .delete()
    .eq("user_id", params.userId)
    .in("event_context", [
      ...listMorningNudgeEventContexts(),
      ACTION_MORNING_EVENT_CONTEXT,
      LEGACY_ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT,
      MORNING_LIGHT_GREETING_EVENT_CONTEXT,
    ])
    .in("status", MORNING_PENDING_STATUSES)
    .gte("scheduled_for", params.nowIso);

  if (params.untilIso) {
    query = query.lt("scheduled_for", params.untilIso);
  }

  const { error } = await query;
  if (error) throw error;
}

async function cancelFutureWeeklyCheckins(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  nowIso: string;
  untilIso?: string | null;
}): Promise<void> {
  let query = params.supabaseAdmin
    .from("scheduled_checkins")
    .delete()
    .eq("user_id", params.userId)
    .in("event_context", [
      // Legacy (W2.B): plus produit, mais des lignes existent encore en base —
      // on continue à les annuler quand le user coupe les envois hebdo.
      WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT,
      WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT,
    ])
    .in("status", MORNING_PENDING_STATUSES)
    .gte("scheduled_for", params.nowIso);

  if (params.untilIso) {
    query = query.lt("scheduled_for", params.untilIso);
  }

  const { error } = await query;
  if (error) throw error;
}

async function cancelPendingWhatsappCoachingCheckins(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  nowIso: string;
  reason: string;
}): Promise<void> {
  const { error } = await params.supabaseAdmin
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: params.nowIso,
      delivery_last_error: params.reason,
      delivery_last_error_at: params.nowIso,
    } as any)
    .eq("user_id", params.userId)
    .in("status", ["pending", "retrying", "awaiting_user"] as any)
    // Les rappels ponctuels demandés par le user (chat, tous canaux) ne sont
    // pas du coaching WhatsApp: l'inéligibilité ne doit jamais les annuler
    // (disparitions Nina/Rose/Eva du 12/07, chantier P0).
    .not("event_context", "like", "one_shot_reminder:%");
  if (error) throw error;

  const { error: pendingActionsError } = await params.supabaseAdmin
    .from("pending_actions")
    .update({
      status: "cancelled",
      processed_at: params.nowIso,
    } as any)
    .eq("user_id", params.userId)
    .in("kind", [
      "deferred_send",
      "scheduled_checkin",
      "proactive_template_candidate",
    ] as any)
    .eq("status", "pending");
  if (pendingActionsError) throw pendingActionsError;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const userIdFilter = cleanText(body.user_id);
    const fullReset = Boolean(body.full_reset);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // RGPD: accounts pending deletion are excluded from all proactive processing.
    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select(
        "id,full_name,locale,birth_date,timezone,proactive_muted_at,whatsapp_coaching_paused_until,access_tier,trial_start,trial_end",
      )
      .neq("account_status", "deletion_pending")
      .order("id", { ascending: true });

    if (userIdFilter) {
      profilesQuery = profilesQuery.eq("id", userIdFilter);
    }

    const { data: profiles, error: profilesErr } = await profilesQuery;
    if (profilesErr) throw profilesErr;

    // KEEL W1.3 bug 3: the daily 00:05 UTC pass provisioned New York on its
    // PREVIOUS local day, so the morning slot was already past and no US user
    // ever got a morning nudge. The cron is now hourly and each timezone is
    // provisioned once, when its own local day opens ([00:00, 01:00)).
    // Idempotence on a double pass is carried by the unique index
    // scheduled_checkins_user_event_time_unique. Targeted refreshes
    // (user_id / full_reset) are event-driven and bypass the gate.
    const timezoneGateEnabled = !userIdFilter && !fullReset &&
      body.ignore_timezone_gate !== true;

    // W1.4 R2: classified ALWAYS, gate or no gate. `profiles.timezone` has no
    // CHECK, and every downstream helper (localDateYmdInTimezone, the slot
    // computations…) goes through Intl too — so a single corrupted row used to
    // throw out of the user loop and 500 the entire pass, gate enabled or not.
    // Each parse is now isolated: the bad row's user is skipped, named and
    // counted; the rest of the fleet is provisioned.
    const timezoneClassification = classifyProvisioningTimezones(
      ((profiles ?? []) as Array<Record<string, unknown>>).map((profile) =>
        cleanText(profile.timezone, "Europe/Paris")
      ),
      new Date(),
    );
    const provisioningTimezones = timezoneGateEnabled
      ? timezoneClassification.eligible
      : null;

    let scheduled = 0;
    let timezoneGateSkipped = 0;
    let skippedInvalidTimezone = 0;
    let lightGreetingScheduled = 0;
    let birthdayGreetingScheduled = 0;
    let keelSlotRemindersScheduled = 0;
    let keelRestrictionFlagged = 0;
    let keelProvisioningFailed = 0;
    let skipped = 0;
    let candidates = 0;

    for (const profile of (profiles ?? []) as Array<Record<string, unknown>>) {
      const userId = cleanText(profile.id);
      if (!userId) continue;

      const now = new Date();
      const nowIso = now.toISOString();
      const timezone = cleanText(profile.timezone, "Europe/Paris");
      // W1.4 R2: this ONE row carries a timezone Intl cannot resolve. It is
      // skipped loudly and alone — it used to take the whole fleet's pass down
      // with it.
      if (timezoneClassification.invalid.has(timezone)) {
        console.warn(
          "[schedule-checkins-v2] skipped_invalid_timezone",
          { user_id: userId, timezone },
        );
        skippedInvalidTimezone++;
        continue;
      }
      // W1.3 bug 3: this user's local day has not just started — another
      // hourly tick owns them. Not a skip of the user, a skip of the tick.
      if (provisioningTimezones && !provisioningTimezones.has(timezone)) {
        timezoneGateSkipped++;
        continue;
      }
      const localDate = localDateYmdInTimezone(timezone, now);
      const trialStartIso = cleanText(profile.trial_start);
      const isAccountCreatedToday = trialStartIso
        ? localDateYmdInTimezone(timezone, new Date(trialStartIso)) ===
          localDate
        : false;

      // ---------------------------------------------------------------------
      // KEEL W4.6 + W10 — slot reminders, Sunday digest, AND the proactive
      // restriction floor.
      //
      // MOVED HERE IN W10, ABOVE THE TWO GATES BELOW (MEGA_REVIEW B6).
      // It used to sit ~90 lines further down, behind the opt-in gate and
      // behind `isWhatsappSchedulingTierEligible`. A student invited by their
      // coach, using the web app, cleared neither: their `access_tier` is
      // 'student' (paid by the coach, not by them) and they may never have
      // opted into WhatsApp at all. The consequence was not only "no
      // reminders" — the restriction floor is the ONLY path that both
      // suspends the nudges and writes the `contract_change_requests`
      // escalation to the coach, and it was never evaluated for them. The
      // safety half of this call is not a WhatsApp feature and must not be
      // gated on a WhatsApp opt-in (BUILD_PLAN arbitrage n3).
      //
      // `remindersEnabled` carries the opt-in: the floor and the escalation
      // always run; the `scheduled_checkins` writes only happen for a student
      // who can actually receive them.
      //
      // Its own try/catch, as before: a KEEL failure never takes down the
      // fleet's habit provisioning.
      // 🔴 QUATRIÈME INSTANCE DU MÊME DÉFAUT, trouvée au balayage final.
      //
      // La condition était `Boolean(profile.whatsapp_opted_in)`. Cette colonne
      // vaut `false` par défaut et plus personne ne la met à `true` depuis la
      // suppression de `whatsapp-optin`: **AUCUN rappel de créneau KEEL
      // n'était jamais provisionné**, pour aucun élève. Le plan du coach était
      // publié, l'élève l'avait accepté, et rien ne lui arrivait jamais.
      //
      // Le réglage produit est `proactive_muted_at`: son absence veut dire
      // « il accepte les relances ». Le gate de palier, lui, ne bouge pas.
      const keelRemindersEnabled = !profile.proactive_muted_at &&
        tierGrantsProtocolExecution(profile.access_tier);
      try {
        const keelResult = await provisionKeelDayForUser(supabaseAdmin as any, {
          userId,
          timezone,
          localDate,
          fullName: profile.full_name,
          // R3 — le digest et les rappels partent dans la langue de l'élève.
          locale: String(profile.locale ?? "") || null,
          now,
          remindersEnabled: keelRemindersEnabled,
        });
        if (keelResult.reason !== "no_published_plan") {
          keelSlotRemindersScheduled += keelResult.provisioned;
          if (keelResult.restrictionFlag) keelRestrictionFlagged++;
          console.log(
            `[schedule-checkins-v2] request_id=${requestId} keel_day_provisioned user_id=${userId} reason=${keelResult.reason} reminders_enabled=${keelRemindersEnabled} provisioned=${keelResult.provisioned} skipped_past=${keelResult.skippedPastTime} restriction_flag=${keelResult.restrictionFlag} restriction_escalated=${keelResult.restrictionEscalated} cancelled=${keelResult.cancelledByRestriction}`,
          );
        }
      } catch (error) {
        keelProvisioningFailed++;
        console.error(
          `[schedule-checkins-v2] request_id=${requestId} keel_provisioning_failed user_id=${userId}`,
          error,
        );
      }

      // Même correction: l'élève qui a coupé ses relances voit ses check-ins
      // en attente annulés. Celui qui n'a rien demandé les garde.
      if (profile.proactive_muted_at) {
        await cancelPendingWhatsappCoachingCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          reason: "proactive_muted",
        });
        skipped++;
        continue;
      }

      const pauseUntilIso = cleanText(profile.whatsapp_coaching_paused_until);
      const pauseUntilMs = pauseUntilIso
        ? new Date(pauseUntilIso).getTime()
        : NaN;
      if (Number.isFinite(pauseUntilMs) && pauseUntilMs > Date.now()) {
        await cancelPendingWhatsappCoachingCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          reason: "whatsapp_coaching_paused",
        });
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          untilIso: new Date(pauseUntilMs).toISOString(),
        });
        await cancelFutureWeeklyCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          untilIso: new Date(pauseUntilMs).toISOString(),
        });
        skipped++;
        continue;
      }

      if (fullReset) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
        await cancelFutureWeeklyCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });
      }

      if (
        !isWhatsappSchedulingTierEligible(
          profile.access_tier,
          profile.trial_end,
        )
      ) {
        await cancelPendingWhatsappCoachingCheckins({
          supabaseAdmin,
          userId,
          nowIso,
          reason: `whatsapp_coaching_access_paused:${
            cleanText(profile.access_tier).toLowerCase() || "none"
          }`,
        });
        skipped++;
        continue;
      }

      // (The KEEL provisioning used to sit here. It now runs ~90 lines above,
      // before the WhatsApp opt-in and tier gates — see the block there.)

      const allowsMorning = true;
      const allowsEvening = true;
      // RETRAIT RÉSIDUS (2026-08-08): les nudges d'action (matin, fin
      // d'après-midi, veille de nuit) et la revue hebdo sont partis avec le
      // plan V2. Survivent la salutation légère du matin et l'anniversaire.
      const morningEncouragementLocalTime = randomMorningEncouragementLocalTime({
        userId,
        localDate,
      });
      const morningScheduledFor = computeScheduledForFromLocal({
        timezone,
        dayOffset: 0,
        localTimeHHMM: morningEncouragementLocalTime,
        now,
      });
      const canScheduleMorningToday =
        new Date(morningScheduledFor).getTime() > now.getTime();
      const shouldSendLightGreeting = canScheduleMorningToday &&
        allowsMorning &&
        await shouldScheduleLightMorningGreeting(supabaseAdmin as any, {
          userId,
          timezone,
          localDate,
          now,
        });
      const birthdayMatch = birthdayMatchesLocalDate({
        birthDate: profile.birth_date,
        timezone,
        now,
      });
      const shouldTryBirthdayGreeting = birthdayMatch.matches &&
        (allowsMorning || allowsEvening);
      const hasAnyCandidate =
        (allowsMorning && shouldSendLightGreeting) ||
        shouldTryBirthdayGreeting;

      if (!hasAnyCandidate) {
        skipped++;
        continue;
      }

      candidates++;

      if (shouldTryBirthdayGreeting) {
        const birthdayEventContext = birthdayGreetingEventContext(
          birthdayMatch.localDate,
        );
        const alreadyScheduled = await hasActiveBirthdayGreetingForEvent({
          supabaseAdmin,
          userId,
          eventContext: birthdayEventContext,
        });
        if (!alreadyScheduled) {
          const birthdayLocalTime = allowsMorning
            ? BIRTHDAY_GREETING_MORNING_LOCAL_TIME
            : BIRTHDAY_GREETING_EVENING_LOCAL_TIME;
          const scheduledFor = birthdayGreetingScheduledFor({
            timezone,
            localTimeHHMM: birthdayLocalTime,
            now,
          });
          const draftMessage = buildBirthdayGreetingMessage({
            fullName: profile.full_name,
          });
          const { error: birthdayErr } = await supabaseAdmin
            .from("scheduled_checkins")
            .upsert(
              {
                user_id: userId,
                origin: "unknown",
                event_context: birthdayEventContext,
                draft_message: draftMessage,
                message_mode: "static",
                message_payload: {
                  source: "schedule_birthday_greeting_v1",
                  version: 1,
                  checkin_kind: "birthday_greeting",
                  timezone,
                  birthday_local_date: birthdayMatch.localDate,
                  birthday_local_time: birthdayLocalTime,
                  birth_month_day: birthdayMatch.birthMonthDay,
                  generated_at: nowIso,
                },
                scheduled_for: scheduledFor,
                status: "pending",
              } as any,
              { onConflict: "user_id,event_context,scheduled_for" },
            );
          if (birthdayErr) {
            console.error(
              `[schedule-checkins-v2] request_id=${requestId} birthday_upsert_failed user_id=${userId}`,
              birthdayErr,
            );
          } else {
            scheduled++;
            birthdayGreetingScheduled++;
          }
        }
      }

      if (allowsMorning && canScheduleMorningToday && shouldSendLightGreeting) {
        await cancelFutureMorningCheckins({
          supabaseAdmin,
          userId,
          nowIso,
        });

        const { error: upsertErr } = await supabaseAdmin
          .from("scheduled_checkins")
          .upsert(
            {
              user_id: userId,
              origin: "action_morning",
              event_context: MORNING_LIGHT_GREETING_EVENT_CONTEXT,
              draft_message: buildLightMorningFallbackMessage(),
              message_mode: "dynamic",
              message_payload: {
                source: "schedule_action_morning_v2",
                version: 1,
                checkin_kind: "morning_light_greeting",
                timezone,
                local_date: localDate,
                morning_encouragement_local_time: morningEncouragementLocalTime,
                instruction: buildLightMorningInstruction(),
                event_grounding:
                  `local_date=${localDate}\nno_confirmed_action_occurrence=true`,
                generated_at: nowIso,
              },
              scheduled_for: morningScheduledFor,
              status: "pending",
            } as any,
            { onConflict: "user_id,event_context,scheduled_for" },
          );
        if (upsertErr) {
          console.error(
            `[schedule-checkins-v2] request_id=${requestId} morning_upsert_failed user_id=${userId}`,
            upsertErr,
          );
        } else {
          scheduled++;
          lightGreetingScheduled++;
        }
      }


      // Créneau ~21h35-22h: actions de NUIT de ce soir (time_of_day=night) +
      // pré-engagement des actions au RÉVEIL de demain (time_of_day=wake_up).
      // Fenêtre volontairement après la fin de la review du soir (21h30).

    }

    return jsonResponse(
      req,
      {
        success: true,
        scheduled,
        light_greeting_scheduled: lightGreetingScheduled,
        birthday_greeting_scheduled: birthdayGreetingScheduled,
        keel_slot_reminders_scheduled: keelSlotRemindersScheduled,
        keel_restriction_flagged: keelRestrictionFlagged,
        keel_provisioning_failed: keelProvisioningFailed,
        skipped,
        candidates,
        // W1.3 bug 3 observability: how many users this hourly tick handed to
        // another tick, and which timezones it did own.
        timezone_gate_enabled: timezoneGateEnabled,
        timezone_gate_skipped: timezoneGateSkipped,
        provisioned_timezones: provisioningTimezones
          ? [...provisioningTimezones].sort()
          : null,
        // W1.4 R2: users excluded because THEIR timezone is unusable. A
        // non-zero count is a data-quality alert on profiles.timezone, not a
        // scheduler failure — and the pass now completes instead of 500-ing.
        skipped_invalid_timezone: skippedInvalidTimezone,
        invalid_timezones: [...timezoneClassification.invalid].sort(),
        request_id: requestId,
        user_id: userIdFilter || null,
        event_context: MORNING_LIGHT_GREETING_EVENT_CONTEXT,
      },
      { includeCors: false },
    );
  } catch (error) {
    console.error(
      `[schedule-checkins-v2] request_id=${requestId}`,
      error,
    );
    await logEdgeFunctionError({
      functionName: "schedule-checkins-v2",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(
      req,
      { error: errorToMessage(error), request_id: requestId },
      { status: 500, includeCors: false },
    );
  }
});
