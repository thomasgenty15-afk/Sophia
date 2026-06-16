/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  buildOnboardingWeek1ValidationPromptMessage,
  loadOnboardingWeek1Planning,
  ONBOARDING_WEEK1_PROMPT_DELAY_MS,
  ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT,
} from "../_shared/onboarding_week1_validation.ts";

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function hasActiveCheckinForPlan(args: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  planId: string;
  eventContext: string;
  targetWeekStartDate?: string | null;
}): Promise<boolean> {
  const { data, error } = await args.admin
    .from("scheduled_checkins")
    .select("id,message_payload")
    .eq("user_id", args.userId)
    .eq("event_context", args.eventContext)
    .filter("message_payload->>plan_id", "eq", args.planId)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .limit(20);
  if (error) throw error;
  const targetWeekStartDate = cleanText(args.targetWeekStartDate);
  if (targetWeekStartDate) {
    return ((data ?? []) as Array<Record<string, unknown>>).some((row) => {
      const payload = (row as any)?.message_payload ?? {};
      return cleanText(payload?.target_week_start_date) ===
          targetWeekStartDate ||
        cleanText(payload?.week_start_date) === targetWeekStartDate;
    });
  }
  return (data ?? []).length > 0;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const userId = cleanText(body.user_id);
    const planId = cleanText(body.plan_id);
    const activatedAtIso = cleanText(body.activated_at);
    const targetWeekStartDate = cleanText(body.target_week_start_date);
    if (!userId || !planId) {
      return jsonResponse(req, {
        ok: false,
        error: "missing_user_or_plan",
        request_id: requestId,
      }, { status: 400, includeCors: false });
    }

    const admin = adminClient();
    const [
      { data: profile, error: profileError },
      { data: plan, error: planError },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id,timezone,whatsapp_opted_in")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("user_plans_v2")
        .select("id,user_id,status,title,activated_at")
        .eq("id", planId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (planError) throw planError;
    if (!profile || !plan) {
      return jsonResponse(req, {
        ok: true,
        scheduled: 0,
        skipped: true,
        reason: "profile_or_plan_missing",
        request_id: requestId,
      }, { includeCors: false });
    }
    if (cleanText((plan as any).status) !== "active") {
      return jsonResponse(req, {
        ok: true,
        scheduled: 0,
        skipped: true,
        reason: "plan_not_active",
        request_id: requestId,
      }, { includeCors: false });
    }
    if ((profile as any).whatsapp_opted_in !== true) {
      return jsonResponse(req, {
        ok: true,
        scheduled: 0,
        skipped: true,
        reason: "whatsapp_not_opted_in",
        request_id: requestId,
      }, { includeCors: false });
    }

    const planning = await loadOnboardingWeek1Planning(admin as any, {
      userId,
      planId,
      targetWeekStartDate,
    });
    if (planning.already_confirmed) {
      return jsonResponse(req, {
        ok: true,
        scheduled: 0,
        skipped: true,
        reason: "week1_already_confirmed",
        request_id: requestId,
      }, { includeCors: false });
    }

    const timezone = cleanText((profile as any).timezone, "Europe/Paris");
    const activatedAt = new Date(
      activatedAtIso || cleanText((plan as any).activated_at) ||
        new Date().toISOString(),
    );
    const activatedAtSafe = Number.isFinite(activatedAt.getTime())
      ? activatedAt
      : new Date();
    const validationScheduledFor = new Date(
      activatedAtSafe.getTime() + ONBOARDING_WEEK1_PROMPT_DELAY_MS,
    ).toISOString();

    let scheduled = 0;
    const commonPayload = {
      source: "schedule_onboarding_week1_validation",
      version: 1,
      user_id: userId,
      plan_id: planId,
      plan_title: cleanText((plan as any).title, "ton plan"),
      timezone,
      week_start_date: planning.week_start_date,
      week_end_date: planning.week_end_date,
      target_week_start_date: targetWeekStartDate || planning.week_start_date,
      summary_lines: planning.summary_lines,
      created_from: "plan_activation",
      planning_available_at_schedule_time: planning.has_planning,
      generated_at: new Date().toISOString(),
    };

    if (
      !await hasActiveCheckinForPlan({
        admin,
        userId,
        planId,
        eventContext: ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT,
        targetWeekStartDate,
      })
    ) {
      const { error } = await admin.from("scheduled_checkins").insert({
        user_id: userId,
        origin: "weekly_planning",
        event_context: ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT,
        draft_message: buildOnboardingWeek1ValidationPromptMessage(),
        message_mode: "static",
        message_payload: {
          ...commonPayload,
          prompt_kind: "validation_prompt",
        },
        scheduled_for: validationScheduledFor,
        status: "pending",
      } as never);
      if (error) throw error;
      scheduled++;
    }

    return jsonResponse(req, {
      ok: true,
      scheduled,
      week_start_date: planning.week_start_date,
      validation_scheduled_for: validationScheduledFor,
      auto_validation_scheduled_for: null,
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "schedule-onboarding-week1-validation",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500, includeCors: false });
  }
});
