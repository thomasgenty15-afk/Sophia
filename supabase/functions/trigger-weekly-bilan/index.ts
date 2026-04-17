/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import {
  type ActiveTransformationRuntime,
  getActiveTransformationRuntime,
  getScopedPlanItemRuntime,
  type PlanItemRuntimeRow,
} from "../_shared/v2-runtime.ts";
import {
  buildWeeklyRecalibrageUserPrompt,
  WEEKLY_RECALIBRAGE_SYSTEM_PROMPT,
} from "../_shared/v2-prompts/weekly-recalibrage.ts";
import { materializeWeeklyAdjustments } from "../_shared/v2-weekly-bilan-engine.ts";
import type {
  ConversationPulse,
  MomentumStateV2,
  WeeklyConversationDigest,
} from "../_shared/v2-types.ts";
import { logMomentumObservabilityEvent } from "../_shared/momentum-observability.ts";
import { hasActiveStateMachine } from "../trigger-daily-bilan/state_machine_check.ts";
import { decideMomentumProactive } from "../sophia-brain/momentum_proactive_selector.ts";
import {
  readMomentumStateV2,
  toPublicMomentumV2,
} from "../sophia-brain/momentum_state.ts";
import { buildWeeklyConversationDigest } from "../sophia-brain/weekly_conversation_digest_builder.ts";
import {
  assembleWeeklyBilanV2Input,
  buildWeeklyBilanDecisionBullets,
  prepareWeeklyBilanV2Checkin,
  WEEKLY_BILAN_ACTIVE_STATUSES,
  WEEKLY_BILAN_V2_EVENT_CONTEXT,
} from "./v2_weekly_bilan.ts";

function envInt(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function ymdInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoWeekStartYmdInTz(d: Date, timeZone: string): string {
  const ymd = ymdInTz(d, timeZone);
  const [y, m, day] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1));
  const isoDayIndex = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - isoDayIndex);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

async function loadFreshConversationPulse(params: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  cycleId: string | null;
  transformationId: string | null;
  nowIso: string;
}): Promise<{ snapshotId: string | null; pulse: ConversationPulse | null }> {
  const freshnessHours = Math.max(
    0,
    envInt("CONVERSATION_PULSE_FRESHNESS_HOURS", 12),
  );
  const freshnessMs = freshnessHours * 60 * 60 * 1000;

  let query = params.admin
    .from("system_runtime_snapshots")
    .select("id, payload, created_at")
    .eq("user_id", params.userId)
    .eq("snapshot_type", "conversation_pulse")
    .order("created_at", { ascending: false })
    .limit(1);

  if (params.cycleId) {
    query = query.eq("cycle_id", params.cycleId);
  }
  if (params.transformationId) {
    query = query.eq("transformation_id", params.transformationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return { snapshotId: null, pulse: null };

  const createdAtMs = parseTimestampMs((data as any)?.created_at);
  const nowMs = parseTimestampMs(params.nowIso) ?? Date.now();
  if (
    createdAtMs == null ||
    (freshnessMs > 0 && nowMs - createdAtMs > freshnessMs)
  ) {
    return { snapshotId: null, pulse: null };
  }

  const payload = (data as any)?.payload;
  if (!payload || typeof payload !== "object") {
    return { snapshotId: null, pulse: null };
  }

  return {
    snapshotId: String((data as any)?.id ?? "").trim() || null,
    pulse: payload as ConversationPulse,
  };
}

async function hasWeeklyBilanMaterializedForLocalWeek(params: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  timezone: string;
  weekStart: string;
  nowIso: string;
}): Promise<boolean> {
  const { data: recap, error: recapError } = await params.admin
    .from("weekly_bilan_recaps")
    .select("id")
    .eq("user_id", params.userId)
    .eq("week_start", params.weekStart)
    .limit(1)
    .maybeSingle();

  if (recapError) throw recapError;
  if (recap) return true;

  const lookbackIso = new Date(
    (parseTimestampMs(params.nowIso) ?? Date.now()) - (9 * 24 * 60 * 60 * 1000),
  ).toISOString();

  const { data, error } = await params.admin
    .from("scheduled_checkins")
    .select("scheduled_for, status")
    .eq("user_id", params.userId)
    .eq("event_context", WEEKLY_BILAN_V2_EVENT_CONTEXT)
    .in("status", [...WEEKLY_BILAN_ACTIVE_STATUSES])
    .gte("scheduled_for", lookbackIso)
    .order("scheduled_for", { ascending: false })
    .limit(8);

  if (error) throw error;

  return (data ?? []).some((row: any) => {
    const scheduledFor = String(row?.scheduled_for ?? "").trim();
    if (!scheduledFor) return false;
    return isoWeekStartYmdInTz(new Date(scheduledFor), params.timezone) ===
      params.weekStart;
  });
}

async function persistWeeklyRecapV2(args: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  weekStart: string;
  runtime: ActiveTransformationRuntime;
  momentum: MomentumStateV2;
  planItemsRuntime: PlanItemRuntimeRow[];
  prepared: ReturnType<typeof prepareWeeklyBilanV2Checkin>;
  materializeResult: { applied: number; skipped: number; errors: string[] };
}) {
  const northStar = args.runtime.north_star
    ? {
      title: args.runtime.north_star.title,
      unit: args.runtime.north_star.unit,
      current: args.runtime.north_star.current_value,
      target: args.runtime.north_star.target_value,
    }
    : {};

  const execution = {
    items: args.prepared.input.items,
    momentum: args.prepared.input.momentum,
    pulse_summary: args.prepared.input.pulse_summary,
    retained_wins: args.prepared.output.retained_wins,
    retained_blockers: args.prepared.output.retained_blockers,
  };

  const actionLoad = {
    active_load: args.momentum.active_load,
    plan_item_counts: args.runtime.plan_item_counts,
    decision: args.prepared.output.decision,
    suggested_posture_next_week:
      args.prepared.output.suggested_posture_next_week,
    load_adjustments: args.prepared.output.load_adjustments,
    materialization: args.materializeResult,
  };

  const decisionsNextWeek = buildWeeklyBilanDecisionBullets({
    output: args.prepared.output,
    planItemsRuntime: args.planItemsRuntime,
  });

  const { error } = await args.admin
    .from("weekly_bilan_recaps")
    .upsert({
      user_id: args.userId,
      week_start: args.weekStart,
      execution,
      etoile_polaire: northStar,
      action_load: actionLoad,
      decisions_next_week: decisionsNextWeek,
      coach_note: args.prepared.output.coaching_note ?? null,
      raw_summary: args.prepared.draftMessage,
    } as any, { onConflict: "user_id,week_start" });

  if (error) throw error;
}

function normalizeLlmResponseText(
  raw: string | { tool: string; args: unknown },
): string {
  if (typeof raw === "string") return raw;
  return JSON.stringify((raw as any)?.args ?? raw);
}

async function logWeeklyBilanUserError(args: {
  userId: string;
  requestId: string;
  error: string;
  stage: string;
  metadata?: Record<string, unknown>;
}) {
  await logEdgeFunctionError({
    functionName: "trigger-weekly-bilan",
    error: args.error,
    requestId: args.requestId,
    userId: args.userId,
    source: "cron",
    metadata: {
      stage: args.stage,
      ...(args.metadata ?? {}),
    },
  });
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean))];
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({} as any)) as any;
    const userIdsOverride = Array.isArray(body?.user_ids)
      ? (body.user_ids as any[]).map((x) => String(x ?? "").trim()).filter(
        Boolean,
      )
      : [];

    const q = admin
      .from("profiles")
      .select(
        "id, timezone, access_tier, trial_end, whatsapp_last_inbound_at, whatsapp_last_outbound_at, whatsapp_bilan_paused_until, whatsapp_coaching_paused_until",
      )
      .eq("whatsapp_opted_in", true)
      .eq("phone_invalid", false)
      .not("phone_number", "is", null);

    const { data: profiles, error: profilesErr } = userIdsOverride.length > 0
      ? await q.in("id", userIdsOverride)
      : await q.limit(
        Math.max(0, Math.min(3000, envInt("WEEKLY_BILAN_PROFILE_LIMIT", 1200))),
      );

    if (profilesErr) throw profilesErr;

    const userIds = (profiles ?? []).map((p: any) => String(p.id)).filter(
      Boolean,
    );
    if (userIds.length === 0) {
      return jsonResponse(req, {
        success: true,
        sent: 0,
        skipped: 0,
        sent_user_ids: [],
        skipped_user_ids: [],
        errors: [],
        request_id: requestId,
      }, { includeCors: false });
    }

    const { data: plans, error: planErr } = await admin
      .from("user_plans_v2")
      .select("user_id")
      .in("user_id", userIds)
      .eq("status", "active");
    if (planErr) throw planErr;

    const planEligible = new Set(
      (plans ?? []).map((p: any) => String(p.user_id ?? "")),
    );
    const filtered = userIds.filter((id: string) => planEligible.has(id));
    if (filtered.length === 0) {
      return jsonResponse(req, {
        success: true,
        sent: 0,
        skipped: 0,
        sent_user_ids: [],
        skipped_user_ids: [],
        errors: [],
        request_id: requestId,
      }, { includeCors: false });
    }

    const paidEligible = new Set<string>();
    for (const p of (profiles ?? []) as any[]) {
      const userId = String(p?.id ?? "");
      const accessTier = String(p?.access_tier ?? "").toLowerCase().trim();
      const trialEndMs = parseTimestampMs(p?.trial_end);
      const inTrial = trialEndMs !== null && trialEndMs > Date.now();
      if (!userId) continue;
      if (
        (accessTier === "trial" && inTrial) ||
        accessTier === "alliance" ||
        accessTier === "architecte"
      ) {
        paidEligible.add(userId);
      }
    }

    const profilesById = new Map(
      (profiles ?? []).map((p: any) => [String(p.id), p]),
    );

    const { data: chatStates } = await admin
      .from("user_chat_states")
      .select("user_id, investigation_state, temp_memory")
      .eq("scope", "whatsapp")
      .in("user_id", filtered);

    const chatStatesById = new Map<string, any>();
    for (const cs of (chatStates ?? []) as any[]) {
      chatStatesById.set(String(cs.user_id), cs);
    }

    let sent = 0;
    let skipped = 0;
    const sentUserIds: string[] = [];
    const skippedUserIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    const errors: Array<{ user_id: string; error: string }> = [];
    const weeklyModel = (
      Deno.env.get("WEEKLY_BILAN_V2_MODEL") ??
        getGlobalAiModel("gemini-2.5-flash")
    ).trim() || "gemini-2.5-flash";

    for (const userId of filtered) {
      try {
        if (!paidEligible.has(userId)) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "not_paid_subscription";
          continue;
        }

        const chatState = chatStatesById.get(userId);
        const machineCheck = hasActiveStateMachine(chatState);
        if (machineCheck.active) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] =
            `active_state_machine:${machineCheck.machineLabel}`;
          continue;
        }

        const profile = profilesById.get(userId) as any;
        const pauseUntilMs = Math.max(
          parseTimestampMs(profile?.whatsapp_bilan_paused_until) ?? 0,
          parseTimestampMs(profile?.whatsapp_coaching_paused_until) ?? 0,
        ) || null;
        if (pauseUntilMs && pauseUntilMs > Date.now()) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "coaching_paused_until";
          continue;
        }

        const momentumDecision = decideMomentumProactive({
          kind: "weekly_bilan",
          tempMemory: chatState?.temp_memory ?? {},
        });
        await logMomentumObservabilityEvent({
          supabase: admin as any,
          userId,
          requestId,
          channel: "whatsapp",
          scope: "whatsapp",
          sourceComponent: "trigger_weekly_bilan",
          eventName: "weekly_bilan_momentum_decision",
          payload: {
            decision_kind: "momentum_policy_gate",
            target_kind: "weekly_bilan",
            state_at_decision: momentumDecision.state ?? null,
            decision: momentumDecision.decision,
            decision_reason: momentumDecision.reason,
            proactive_policy: momentumDecision.proactive_policy ?? null,
            policy_action: momentumDecision.policy_action ?? null,
          },
        });
        if (momentumDecision.decision === "skip") {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = momentumDecision.reason;
          continue;
        }

        const runtime = await getActiveTransformationRuntime(
          admin as any,
          userId,
        );
        if (!runtime.cycle || !runtime.transformation || !runtime.plan) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "active_v2_runtime_missing";
          continue;
        }

        const timezone = String(profile?.timezone ?? "").trim() ||
          "Europe/Paris";
        const nowIso = new Date().toISOString();
        const weekStart = isoWeekStartYmdInTz(new Date(nowIso), timezone);
        if (
          await hasWeeklyBilanMaterializedForLocalWeek({
            admin,
            userId,
            timezone,
            weekStart,
            nowIso,
          })
        ) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] =
            "weekly_bilan_already_materialized_this_week";
          continue;
        }

        const [scopedPlanRuntime, pulseResult] = await Promise.all([
          getScopedPlanItemRuntime(admin as any, runtime.plan.id, {
            maxEntriesPerItem: Number.MAX_SAFE_INTEGER,
            scope: "current_phase",
          }),
          loadFreshConversationPulse({
            admin,
            userId,
            cycleId: runtime.cycle.id,
            transformationId: runtime.transformation.id,
            nowIso,
          }),
        ]);

        const planItemsRuntime = scopedPlanRuntime.planItems;
        const phaseContext = scopedPlanRuntime.phaseContext;
        const momentum = toPublicMomentumV2(
          readMomentumStateV2(chatState?.temp_memory ?? {}),
        );
        let weeklyDigest: WeeklyConversationDigest | null = null;
        let weeklyDigestId: string | null = null;
        try {
          const digestResult = await buildWeeklyConversationDigest({
            supabase: admin as any,
            userId,
            weekStart,
            requestId,
            nowIso,
            runtime: {
              cycleId: runtime.cycle.id,
              transformationId: runtime.transformation.id,
            },
            source: "trigger_weekly_bilan:v2",
          });
          weeklyDigest = digestResult.digest;
          weeklyDigestId = digestResult.snapshotId;
        } catch (digestError) {
          const digestMessage = digestError instanceof Error
            ? digestError.message
            : String(digestError);
          console.warn(
            `[trigger-weekly-bilan] weekly digest fallback for user ${userId}: ${digestMessage}`,
          );
          await logWeeklyBilanUserError({
            userId,
            requestId,
            error: digestMessage,
            stage: "build_weekly_digest",
            metadata: { week_start: weekStart },
          });
        }

        const weeklyInput = {
          planItemsRuntime,
          phaseContext,
          momentum,
          conversationPulse: pulseResult.pulse,
          weeklyDigest,
          nowIso,
        };
        const assembledInput = assembleWeeklyBilanV2Input(weeklyInput);

        const llmRaw = await generateWithGemini(
          WEEKLY_RECALIBRAGE_SYSTEM_PROMPT.trim(),
          buildWeeklyRecalibrageUserPrompt(assembledInput).trim(),
          0.2,
          true,
          [],
          "auto",
          {
            requestId,
            userId,
            source: "trigger_weekly_bilan:v2",
            model: weeklyModel,
          },
        );

        const prepared = prepareWeeklyBilanV2Checkin({
          ...weeklyInput,
          conversationPulseId: pulseResult.snapshotId,
          weeklyDigestId,
          weekStart,
          llmResponseText: normalizeLlmResponseText(llmRaw),
        });

        await logV2Event(admin as any, V2_EVENT_TYPES.WEEKLY_BILAN_DECIDED, {
          user_id: userId,
          cycle_id: runtime.cycle.id,
          transformation_id: runtime.transformation.id,
          plan_id: runtime.plan.id,
          decision: prepared.output.decision,
          adjustment_count: prepared.output.load_adjustments.length,
          suggested_posture_next_week:
            prepared.output.suggested_posture_next_week,
          reasoning: prepared.output.reasoning,
          metadata: {
            week_start: weekStart,
            conversation_pulse_id: pulseResult.snapshotId,
            weekly_digest_id: weeklyDigestId,
            validation: prepared.validation.valid ? { valid: true } : {
              valid: false,
              violations: prepared.validation.violations,
            },
          },
        });

        const materializeResult = await materializeWeeklyAdjustments(
          admin as any,
          runtime.plan.id,
          prepared.output.load_adjustments,
          prepared.input.items,
        );

        if (materializeResult.errors.length > 0) {
          await logV2Event(
            admin as any,
            V2_EVENT_TYPES.WEEKLY_BILAN_COMPLETED,
            {
              user_id: userId,
              cycle_id: runtime.cycle.id,
              transformation_id: runtime.transformation.id,
              metadata: {
                plan_id: runtime.plan.id,
                week_start: weekStart,
                applied: materializeResult.applied,
                skipped: materializeResult.skipped,
                errors: materializeResult.errors,
              },
            },
          );
          throw new Error(
            `weekly adjustment materialization failed: ${
              materializeResult.errors.join(" | ")
            }`,
          );
        }

        await persistWeeklyRecapV2({
          admin,
          userId,
          weekStart,
          runtime,
          momentum,
          planItemsRuntime,
          prepared,
          materializeResult,
        });

        const messagePayload = {
          ...prepared.messagePayload,
          request_id: requestId,
          cycle_id: runtime.cycle.id,
          transformation_id: runtime.transformation.id,
          plan_id: runtime.plan.id,
          weekly_digest_id: weeklyDigestId,
          week_start_next: addDaysYmd(weekStart, 7),
          materialization: materializeResult,
        };

        const { data: inserted, error: insertErr } = await admin
          .from("scheduled_checkins")
          .insert({
            user_id: userId,
            origin: "rendez_vous",
            event_context: prepared.eventContext,
            draft_message: prepared.draftMessage,
            message_mode: "static",
            message_payload: messagePayload,
            scheduled_for: nowIso,
            status: "pending",
          } as any)
          .select("id, scheduled_for")
          .maybeSingle();

        if (insertErr) throw insertErr;

        await logV2Event(admin as any, V2_EVENT_TYPES.WEEKLY_BILAN_COMPLETED, {
          user_id: userId,
          cycle_id: runtime.cycle.id,
          transformation_id: runtime.transformation.id,
          metadata: {
            plan_id: runtime.plan.id,
            week_start: weekStart,
            scheduled_checkin_id: String((inserted as any)?.id ?? "").trim() ||
              null,
            scheduled_for: String((inserted as any)?.scheduled_for ?? nowIso),
            applied: materializeResult.applied,
            skipped: materializeResult.skipped,
            errors: materializeResult.errors,
            decision: prepared.output.decision,
            weekly_digest_id: weeklyDigestId,
            output: prepared.output,
          },
        });

        sent++;
        sentUserIds.push(userId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ user_id: userId, error: msg });
        await logWeeklyBilanUserError({
          userId,
          requestId,
          error: msg,
          stage: "process_user",
        });
      }
    }

    return jsonResponse(req, {
      success: true,
      sent,
      skipped,
      sent_user_ids: uniq(sentUserIds),
      skipped_user_ids: uniq(skippedUserIds),
      skipped_reasons: skippedReasons,
      errors,
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[trigger-weekly-bilan] request_id=${requestId}`, error);
    return jsonResponse(req, { error: message, request_id: requestId }, {
      status: 500,
      includeCors: false,
    });
  }
});
