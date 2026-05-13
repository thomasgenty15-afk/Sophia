import { fetchLatestPending, markPending } from "./wa_db.ts";
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts";
import {
  ACCESS_REACTIVATION_OFFER_KIND,
  buildAccessEndedNegativeReply,
  buildAccessEndedPositiveReply,
  classifyAccessEndedIntent,
  normalizeAccessEndedReason,
} from "../_shared/access_ended_whatsapp.ts";
import {
  applyWhatsappProactiveOpeningPolicy,
  generateDynamicWhatsAppCheckinMessage,
} from "../_shared/scheduled_checkins.ts";
import type { RendezVousKind } from "../_shared/v2-types.ts";
import { transitionRendezVous } from "../_shared/v2-rendez-vous.ts";
import { registerRendezVousRefusal } from "../sophia-brain/rendez_vous_decision.ts";
import {
  ACTION_EVENING_DONE_ID,
  ACTION_EVENING_MISSED_ID,
  ACTION_EVENING_PARTIAL_ID,
  ACTION_EVENING_REVIEW_EVENT_CONTEXT,
} from "../_shared/action_occurrences.ts";
import {
  loadMomentumSnapshotV2,
  persistMomentumSnapshotV2,
} from "../_shared/momentum_v2.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import {
  DAILY_ACTION_REVIEW_SOURCE,
  dayLabel,
  isHabitDimension,
  isAppliedDailyOutcome,
  nextDayAfter,
  occurrenceStatusForDailyOutcome,
  runDailyActionReviewSkill,
  stateFromUnknown,
  type DailyActionAppliedOutcome,
  type DailyActionOutcome,
  type DailyActionReviewSkillResult,
  type DailyActionReviewTarget,
} from "../_shared/daily_action_review.ts";

const RENDEZ_VOUS_KINDS = new Set([
  "pre_event_grounding",
  "post_friction_repair",
  "weekly_reset",
  "mission_preparation",
  "transition_handoff",
]);

function classifyRendezVousIntent(text: string) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return "unknown";
  if (
    /\b(pas maintenant|plus tard|une prochaine fois|une autre fois|pas dispo|pas cette fois|pas pour le moment|non merci)\b/
      .test(t)
  ) return "decline";
  if (/^(non|no)\b/.test(t)) return "decline";
  return "reply";
}

function asRendezVousKind(value: unknown): RendezVousKind | null {
  const raw = String(value ?? "").trim();
  return RENDEZ_VOUS_KINDS.has(raw) ? raw as RendezVousKind : null;
}

async function fetchLatestCheckinPending(admin: any, userId: string) {
  return await fetchLatestPending(admin, userId, "scheduled_checkin");
}

function nextDateYmd(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function eveningReviewDecisionFromActionId(actionIdRaw: unknown):
  | { occurrenceStatus: "done"; entryOutcome: "completed" }
  | { occurrenceStatus: "partial"; entryOutcome: "partial" }
  | { occurrenceStatus: "missed"; entryOutcome: "missed" }
  | null {
  const actionId = String(actionIdRaw ?? "").trim();
  if (actionId === ACTION_EVENING_DONE_ID) {
    return { occurrenceStatus: "done", entryOutcome: "completed" };
  }
  if (actionId === ACTION_EVENING_PARTIAL_ID) {
    return { occurrenceStatus: "partial", entryOutcome: "partial" };
  }
  if (actionId === ACTION_EVENING_MISSED_ID) {
    return { occurrenceStatus: "missed", entryOutcome: "missed" };
  }
  return null;
}

function entryKindForEveningReview(target: any, outcome: string) {
  if (outcome === "missed") return "skip";
  if (outcome === "partial") return "partial";
  const kind = String(target?.kind ?? "").trim();
  const trackingType = String(target?.tracking_type ?? "").trim();
  return kind === "milestone" ||
      ["count", "scale", "milestone"].includes(trackingType)
    ? "progress"
    : "checkin";
}

function asPlanItemEntryKind(value: string):
  | "checkin"
  | "progress"
  | "skip"
  | "partial"
  | "blocker"
  | "support_feedback" {
  if (
    value === "progress" || value === "skip" || value === "partial" ||
    value === "blocker" || value === "support_feedback"
  ) {
    return value;
  }
  return "checkin";
}

async function fetchLatestActionEveningReviewPending(
  admin: any,
  userId: string,
) {
  const { data, error } = await admin
    .from("whatsapp_pending_actions")
    .select("id,scheduled_checkin_id,status,payload")
    .eq("user_id", userId)
    .eq("kind", "scheduled_checkin")
    .eq("status", "pending")
    .filter(
      "payload->>event_context",
      "eq",
      ACTION_EVENING_REVIEW_EVENT_CONTEXT,
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

function normalizeDailyTargets(value: unknown): DailyActionReviewTarget[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((target: any) => {
    const occurrenceId = String(target?.occurrence_id ?? "").trim();
    const planItemId = String(target?.plan_item_id ?? "").trim();
    const title = String(target?.title ?? "").trim();
    if (!occurrenceId || !planItemId || !title) return [];
    return [{
      occurrence_id: occurrenceId,
      cycle_id: String(target?.cycle_id ?? "").trim(),
      transformation_id: String(target?.transformation_id ?? "").trim(),
      plan_id: String(target?.plan_id ?? "").trim(),
      plan_label: String(target?.plan_label ?? target?.plan_title ?? "").trim() ||
        null,
      plan_item_id: planItemId,
      title,
      dimension: String(target?.dimension ?? "").trim() || null,
      kind: String(target?.kind ?? "").trim() || null,
      tracking_type: String(target?.tracking_type ?? "").trim() || null,
      planned_day: String(target?.planned_day ?? "").trim() || null,
      original_planned_day: String(target?.original_planned_day ?? "").trim() || null,
      week_start_date: String(target?.week_start_date ?? "").trim() || null,
      reviewed_local_date: String(target?.reviewed_local_date ?? "").trim() || null,
    }];
  });
}

async function sendDailyActionReviewAssistantMessage(params: {
  admin: any;
  requestId: string;
  userId: string;
  fromE164: string;
  body: string;
  source: string;
}) {
  const sendResp = await sendWhatsAppTextTracked({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    toE164: params.fromE164,
    body: params.body,
    purpose: "action_evening_review",
    isProactive: false,
  });
  const outId = sendResp?.messages?.[0]?.id ?? null;
  const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    scope: "whatsapp",
    role: "assistant",
    content: params.body,
    agent_used: "companion",
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: outId,
      outbound_tracking_id: outboundTrackingId,
      is_proactive: false,
      source: params.source,
      purpose: "action_evening_review",
      event_context: ACTION_EVENING_REVIEW_EVENT_CONTEXT,
    },
  });
}

async function findTomorrowRescheduleDay(params: {
  admin: any;
  userId: string;
  target: DailyActionReviewTarget;
}): Promise<string | null> {
  const currentDay = dayCodeForLocalDate(params.target.reviewed_local_date) ??
    String(params.target.planned_day ?? "").trim();
  const nextDay = nextDayAfter(currentDay);
  const weekStartDate = String(params.target.week_start_date ?? "").trim();
  if (!nextDay || !weekStartDate) return null;

  const { data: occurrences, error: occurrenceErr } = await params.admin
    .from("user_habit_week_occurrences")
    .select("id,plan_item_id,planned_day,status")
    .eq("user_id", params.userId)
    .eq("week_start_date", weekStartDate)
    .eq("planned_day", nextDay)
    .neq("id", params.target.occurrence_id)
    .in("status", ["planned", "rescheduled", "done", "partial"]);
  if (occurrenceErr) throw occurrenceErr;

  const rows = (occurrences ?? []) as Array<Record<string, unknown>>;
  const planItemIds = [
    ...new Set(rows.map((row) => String(row.plan_item_id ?? "").trim()).filter(Boolean)),
  ];
  if (planItemIds.length === 0) return nextDay;

  const { data: items, error: itemsErr } = await params.admin
    .from("user_plan_items")
    .select("id,dimension")
    .eq("user_id", params.userId)
    .in("id", planItemIds);
  if (itemsErr) throw itemsErr;

  const dimensionById = new Map(
    ((items ?? []) as Array<Record<string, unknown>>).map((item) => [
      String(item.id ?? "").trim(),
      String(item.dimension ?? "").trim(),
    ]),
  );
  const movingHabit = isHabitDimension(params.target.dimension);
  for (const row of rows) {
    const dimension = dimensionById.get(String(row.plan_item_id ?? "").trim());
    const rowIsHabit = isHabitDimension(dimension);
    if (movingHabit && rowIsHabit) return null;
    if (!movingHabit && !rowIsHabit) return null;
  }
  return nextDay;
}

function dayCodeForLocalDate(localDateRaw: unknown): string | null {
  const localDate = String(localDateRaw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const date = new Date(`${localDate}T12:00:00.000Z`);
  const day = date.getUTCDay();
  if (day === 0) return "sun";
  return ["mon", "tue", "wed", "thu", "fri", "sat"][day - 1] ?? null;
}

async function applyDailyOccurrenceOutcome(params: {
  admin: any;
  userId: string;
  target: DailyActionReviewTarget;
  outcome: DailyActionAppliedOutcome;
  stillRelevant: boolean | null;
  nowIso: string;
}): Promise<{
  status: string;
  rescheduledTo: string | null;
  rescheduleDecision: string | null;
}> {
  if (params.outcome !== "missed") {
    const status = occurrenceStatusForDailyOutcome(params.outcome);
    await params.admin
      .from("user_habit_week_occurrences")
      .update({
        status,
        validated_at: params.nowIso,
        updated_at: params.nowIso,
      })
      .eq("user_id", params.userId)
      .eq("id", params.target.occurrence_id)
      .in("status", ["planned", "rescheduled"]);
    return { status, rescheduledTo: null, rescheduleDecision: null };
  }

  if (params.stillRelevant !== true) {
    await params.admin
      .from("user_habit_week_occurrences")
      .update({
        status: "missed",
        validated_at: params.nowIso,
        updated_at: params.nowIso,
      })
      .eq("user_id", params.userId)
      .eq("id", params.target.occurrence_id)
      .in("status", ["planned", "rescheduled"]);
    return {
      status: "missed",
      rescheduledTo: null,
      rescheduleDecision: params.stillRelevant === false
        ? "not_rescheduled_not_relevant"
        : "not_rescheduled_unconfirmed",
    };
  }

  const rescheduledTo = await findTomorrowRescheduleDay({
    admin: params.admin,
    userId: params.userId,
    target: params.target,
  });
  if (rescheduledTo) {
    await params.admin
      .from("user_habit_week_occurrences")
      .update({
        status: "rescheduled",
        planned_day: rescheduledTo,
        original_planned_day: String(
          params.target.original_planned_day ?? params.target.planned_day ?? "",
        ).trim() || null,
        actual_day: null,
        source: "auto_rescheduled",
        validated_at: null,
        updated_at: params.nowIso,
      })
      .eq("user_id", params.userId)
      .eq("id", params.target.occurrence_id)
      .in("status", ["planned", "rescheduled"]);
    return {
      status: "rescheduled",
      rescheduledTo,
      rescheduleDecision: "rescheduled_tomorrow",
    };
  }

  await params.admin
    .from("user_habit_week_occurrences")
    .update({
      status: "missed",
      validated_at: params.nowIso,
      updated_at: params.nowIso,
    })
    .eq("user_id", params.userId)
    .eq("id", params.target.occurrence_id)
    .in("status", ["planned", "rescheduled"]);
  return {
    status: "missed",
    rescheduledTo: null,
    rescheduleDecision: "not_rescheduled_no_slot",
  };
}

function buildDailyActionReviewClarificationQuestion(
  parsed: DailyActionReviewSkillResult,
  targets: DailyActionReviewTarget[],
): string | null {
  const targetById = new Map(targets.map((target) => [
    target.occurrence_id,
    target,
  ]));
  const missingStillRelevantTargets = parsed.missingOccurrenceIds
    .map((id) => targetById.get(id))
    .filter((target): target is DailyActionReviewTarget => Boolean(target))
    .filter((target) => {
      const item = parsed.state.items[target.occurrence_id];
      return item?.outcome === "missed" &&
        item.missing_slots.includes("still_relevant");
    });
  if (missingStillRelevantTargets.length === 1) {
    return `Tu veux qu'on reporte "${
      missingStillRelevantTargets[0].title
    }" à demain ?`;
  }
  if (missingStillRelevantTargets.length > 1) {
    const titles = missingStillRelevantTargets.map((target) =>
      `"${target.title}"`
    ).join(" et ");
    return `Tu veux qu'on reporte ${titles} à demain ?`;
  }
  return null;
}

async function handleActionEveningReviewReply(params: {
  admin: any;
  userId: string;
  fromE164: string;
  requestId: string;
  actionId?: string | null;
  inboundText?: string | null;
}) {
  const decision = eveningReviewDecisionFromActionId(params.actionId);
  const inboundText = String(params.inboundText ?? "").trim();
  if (!decision && !inboundText) return false;

  const pending = await fetchLatestActionEveningReviewPending(
    params.admin,
    params.userId,
  );
  if (!pending) return false;

  const payload = pending?.payload ?? {};
  const targets = normalizeDailyTargets(payload?.targets);
  const occurrenceIds = Array.isArray(payload?.occurrence_ids)
    ? payload.occurrence_ids.map((id: unknown) => String(id ?? "").trim())
      .filter(Boolean)
    : targets.map((target: any) => String(target?.occurrence_id ?? "").trim())
      .filter(Boolean);
  const effectiveTargets = targets;
  if (occurrenceIds.length === 0 || effectiveTargets.length === 0) {
    await markPending(params.admin, pending.id, "cancelled");
    return false;
  }

  const nowIso = new Date().toISOString();
  const localDate = String(payload?.local_date ?? "").trim() ||
    nowIso.slice(0, 10);
  const effectiveAt = `${localDate}T12:00:00.000Z`;
  const dayStartIso = `${localDate}T00:00:00.000Z`;
  const dayEndIso = `${nextDateYmd(localDate)}T00:00:00.000Z`;

  const parsed: DailyActionReviewSkillResult = decision
    ? (() => {
      const state = stateFromUnknown(payload?.review_state, effectiveTargets);
      for (const target of effectiveTargets) {
        const item = state.items[target.occurrence_id];
        if (!item) continue;
        item.outcome = decision.entryOutcome as DailyActionOutcome;
        item.reason_category = decision.entryOutcome === "completed"
          ? "none"
          : "unclear";
        item.reason_text = null;
        item.still_relevant = "unknown";
        item.evidence_text = String(params.actionId ?? "").trim();
        item.matched_user_text = String(params.actionId ?? "").trim();
        item.confidence = "high";
        item.missing_slots = decision.entryOutcome === "missed"
          ? ["still_relevant"]
          : [];
      }
      const missingOccurrenceIds = effectiveTargets
        .filter((target) =>
          (state.items[target.occurrence_id]?.missing_slots ?? []).length > 0
        )
        .map((target) => target.occurrence_id);
      state.status = missingOccurrenceIds.length > 0
        ? "needs_clarification"
        : "complete";
      state.should_apply_effects = missingOccurrenceIds.length === 0;
      state.stop_reason = missingOccurrenceIds.length === 0
        ? "all_required_slots_filled"
        : null;
      state.next_question = null;
      state.next_question_targets = missingOccurrenceIds.slice(0, 2);
      state.remaining_occurrence_ids = missingOccurrenceIds;
      return {
        state,
        missingOccurrenceIds,
        stillRelevantByOccurrenceId: Object.fromEntries(
          effectiveTargets.map((target) => [target.occurrence_id, null]),
        ) as Record<string, boolean | null>,
        nextQuestion: null,
        shouldApplyEffects: missingOccurrenceIds.length === 0,
      };
    })()
    : await runDailyActionReviewSkill({
      text: inboundText,
      targets: effectiveTargets,
      previousState: payload?.review_state,
      requestId: params.requestId,
      userId: params.userId,
    });

  if (!decision && !parsed.shouldApplyEffects) {
    const updatedPayload = {
      ...payload,
      message_mode: "conversation",
      chat_capability: "daily_action_review",
      review_state: parsed.state,
      missing_occurrence_ids: parsed.missingOccurrenceIds,
      last_user_text: inboundText,
    };
    await params.admin
      .from("whatsapp_pending_actions")
      .update({ payload: updatedPayload })
      .eq("id", pending.id);
    const txt = parsed.nextQuestion ||
      buildDailyActionReviewClarificationQuestion(parsed, effectiveTargets) ||
      "Il me manque juste une info pour noter correctement le check. Tu peux me dire ce qui s'est passe ?";
    await sendDailyActionReviewAssistantMessage({
      admin: params.admin,
      requestId: params.requestId,
      userId: params.userId,
      fromE164: params.fromE164,
      body: txt,
      source: "daily_action_review_clarification",
    });
    return true;
  }

  const rescheduleByOccurrenceId = new Map<string, string | null>();
  const rescheduleDecisionByOccurrenceId = new Map<string, string | null>();
  const statusByOccurrenceId = new Map<string, string>();
  for (const target of effectiveTargets) {
    const itemState = parsed.state.items[target.occurrence_id];
    if (!isAppliedDailyOutcome(itemState?.outcome)) continue;
    const result = await applyDailyOccurrenceOutcome({
      admin: params.admin,
      userId: params.userId,
      target,
      outcome: itemState.outcome,
      stillRelevant: parsed.stillRelevantByOccurrenceId[target.occurrence_id] ??
        null,
      nowIso,
    });
    statusByOccurrenceId.set(target.occurrence_id, result.status);
    rescheduleByOccurrenceId.set(target.occurrence_id, result.rescheduledTo);
    rescheduleDecisionByOccurrenceId.set(
      target.occurrence_id,
      result.rescheduleDecision,
    );
  }

  const uniqueTargetsByItem = new Map<string, any>();
  for (const target of effectiveTargets) {
    const planItemId = String(target?.plan_item_id ?? "").trim();
    if (planItemId && !uniqueTargetsByItem.has(planItemId)) {
      uniqueTargetsByItem.set(planItemId, target);
    }
  }
  const planItemIds = [...uniqueTargetsByItem.keys()];
  if (planItemIds.length === 0) {
    await markPending(params.admin, pending.id, "cancelled");
    return false;
  }
  const { data: existingEntries, error: existingEntriesErr } = await params
    .admin
    .from("user_plan_item_entries")
    .select("plan_item_id")
    .eq("user_id", params.userId)
    .in("plan_item_id", planItemIds)
    .gte("effective_at", dayStartIso)
    .lt("effective_at", dayEndIso);
  if (existingEntriesErr) throw existingEntriesErr;
  const alreadyLogged = new Set(
    ((existingEntries ?? []) as any[]).map((row) =>
      String(row?.plan_item_id ?? "").trim()
    ),
  );

  const entries = [...uniqueTargetsByItem.values()]
    .filter((target) =>
      !alreadyLogged.has(String(target?.plan_item_id ?? "").trim())
    )
    .flatMap((target) => {
      const itemState = parsed.state.items[String(target?.occurrence_id ?? "").trim()];
      const outcome = itemState?.outcome;
      if (!isAppliedDailyOutcome(outcome)) return [];
      return [{
        id: crypto.randomUUID(),
        user_id: params.userId,
        cycle_id: String(target?.cycle_id ?? "").trim(),
        transformation_id: String(target?.transformation_id ?? "").trim(),
        plan_id: String(target?.plan_id ?? "").trim(),
        plan_item_id: String(target?.plan_item_id ?? "").trim(),
        entry_kind: entryKindForEveningReview(target, outcome),
        outcome,
        value_numeric: null,
        value_text: itemState?.reason_text ?? null,
        difficulty_level: itemState?.reason_category === "too_hard" ? "high" : null,
        blocker_hint: itemState?.reason_category &&
            itemState.reason_category !== "none"
          ? itemState.reason_category
          : null,
        created_at: nowIso,
        effective_at: effectiveAt,
        metadata: {
          source: DAILY_ACTION_REVIEW_SOURCE,
          legacy_source: "action_evening_review_v2",
          channel: "whatsapp",
          action_id: String(params.actionId ?? "").trim() || null,
          outcome_source: decision ? "interactive_button" : "free_text",
          pending_action_id: pending.id,
          scheduled_checkin_id: pending.scheduled_checkin_id ?? null,
          local_date: localDate,
          occurrence_id: String(target?.occurrence_id ?? "").trim(),
          dimension: String(target?.dimension ?? "").trim() || null,
          reason_category: itemState?.reason_category ?? null,
          reason_text: itemState?.reason_text ?? null,
          matched_user_text: itemState?.matched_user_text ?? null,
          still_relevant: parsed.stillRelevantByOccurrenceId[
            String(target?.occurrence_id ?? "").trim()
          ] ?? null,
          confidence: itemState?.confidence ?? "low",
          occurrence_status: statusByOccurrenceId.get(
            String(target?.occurrence_id ?? "").trim(),
          ) ?? null,
          reschedule_decision: rescheduleDecisionByOccurrenceId.get(
            String(target?.occurrence_id ?? "").trim(),
          ) ?? null,
          rescheduled_to: rescheduleByOccurrenceId.get(
            String(target?.occurrence_id ?? "").trim(),
          ) ?? null,
        },
      }];
    });

  if (entries.length > 0) {
    const { error: insertErr } = await params.admin
      .from("user_plan_item_entries")
      .insert(entries);
    if (insertErr) throw insertErr;
    for (const entry of entries) {
      await logV2Event(params.admin, V2_EVENT_TYPES.PLAN_ITEM_ENTRY_LOGGED, {
        user_id: params.userId,
        cycle_id: entry.cycle_id,
        transformation_id: entry.transformation_id,
        plan_id: entry.plan_id,
        plan_item_id: entry.plan_item_id,
        entry_id: entry.id,
        entry_kind: asPlanItemEntryKind(entry.entry_kind),
        effective_at: entry.effective_at,
        metadata: entry.metadata,
      }).catch((error) => {
        console.warn(
          "[handlers_pending] action evening v2 event failed",
          error,
        );
      });
    }
  }

  await params.admin
    .from("whatsapp_pending_actions")
    .update({
      payload: {
        ...payload,
        message_mode: "conversation",
        chat_capability: "daily_action_review",
        review_state: parsed.state,
        completed_at: nowIso,
      },
    })
    .eq("id", pending.id);

  if (pending.scheduled_checkin_id) {
    await params.admin.from("scheduled_checkins").update({
      status: "sent",
      processed_at: nowIso,
      delivery_last_error: null,
      delivery_last_error_at: null,
      delivery_last_request_id: params.requestId,
    }).eq("id", pending.scheduled_checkin_id);
  }
  await markPending(params.admin, pending.id, "done");

  try {
    const { snapshot, cycleId } = await loadMomentumSnapshotV2(params.admin, {
      userId: params.userId,
      timezone: String(payload?.timezone ?? "").trim() || "Europe/Paris",
      now: new Date(nowIso),
    });
    await persistMomentumSnapshotV2(params.admin, {
      userId: params.userId,
      cycleId,
      snapshot,
    });
  } catch (error) {
    console.warn(
      "[handlers_pending] momentum_state_v2 snapshot refresh failed",
      error,
    );
  }

  const actionCount = planItemIds.length;
  const lines = effectiveTargets.flatMap((target) => {
    const state = parsed.state.items[target.occurrence_id];
    if (!isAppliedDailyOutcome(state?.outcome)) return [];
    const label = state?.outcome === "completed"
      ? "faite"
      : state?.outcome === "partial"
      ? "commencee, pas terminee"
      : "non faite";
    const rescheduledTo = rescheduleByOccurrenceId.get(target.occurrence_id);
    const suffix = rescheduledTo
      ? `, reportee a ${dayLabel(rescheduledTo)}`
      : "";
    return [`- ${target.title}: ${label}${suffix}`];
  });
  const txt = actionCount > 1
    ? ["C'est note pour ce soir :", ...lines].join("\n")
    : `C'est note : ${lines[0]?.replace(/^- /, "") ?? "action enregistree"}.`;
  await sendDailyActionReviewAssistantMessage({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    fromE164: params.fromE164,
    body: txt,
    source: "daily_action_review",
  });
  return true;
}

export async function maybeCompletePendingRendezVous(params: {
  admin: any;
  userId: string;
  inboundText: string;
  nowIso: string;
  requestId: string;
}) {
  const pending = await fetchLatestPending(
    params.admin,
    params.userId,
    "rendez_vous",
  );
  if (!pending) return false;

  const intent = classifyRendezVousIntent(params.inboundText);
  if (intent !== "reply") return false;

  const rendezVousId = String(pending?.payload?.rendez_vous_id ?? "").trim();
  if (!rendezVousId) {
    await markPending(params.admin, pending.id, "cancelled");
    return false;
  }

  try {
    await transitionRendezVous(params.admin, rendezVousId, "completed", {
      nowIso: params.nowIso,
      eventMetadata: {
        source: "whatsapp_inbound_reply",
        request_id: params.requestId,
      },
    });
    await markPending(params.admin, pending.id, "done");
    return true;
  } catch (error) {
    console.warn(
      `[handlers_pending] pending rendez-vous completion failed rendez_vous_id=${rendezVousId}`,
      error,
    );
    return false;
  }
}

export async function handlePendingActions(params: {
  admin: any;
  userId: string;
  fromE164: string;
  requestId: string;
  siteUrl?: string;
  isOptInYes?: boolean;
  isCheckinYes?: boolean;
  isCheckinLater?: boolean;
  actionId?: string | null;
  inboundText: string;
}) {
  const { admin, userId, fromE164, requestId } = params;
  const handledActionEveningReview = await handleActionEveningReviewReply({
    admin,
    userId,
    fromE164,
    requestId,
    actionId: params.actionId,
    inboundText: params.inboundText,
  });
  if (handledActionEveningReview) return true;

  const accessPending = await fetchLatestPending(
    admin,
    userId,
    ACCESS_REACTIVATION_OFFER_KIND,
  );
  if (accessPending && !params.isOptInYes) {
    const reason = normalizeAccessEndedReason(
      accessPending?.payload?.ended_reason,
    );
    const intent = classifyAccessEndedIntent(params.inboundText);
    if (reason && intent === "accept") {
      await markPending(admin, accessPending.id, "done");
      const upgradePath = String(
        accessPending?.payload?.upgrade_path ?? "/upgrade",
      );
      const upgradeUrl = `${String(params.siteUrl ?? "").replace(/\/+$/, "")}${
        upgradePath.startsWith("/") ? upgradePath : `/${upgradePath}`
      }`;
      const txt = buildAccessEndedPositiveReply({ reason, upgradeUrl });
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "whatsapp_access_reactivation_positive",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "access_ended",
          ended_reason: reason,
        },
      });
      return true;
    }
    if (reason && intent === "decline") {
      await markPending(admin, accessPending.id, "cancelled");
      const txt = buildAccessEndedNegativeReply();
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "whatsapp_access_reactivation_decline",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "access_ended",
          ended_reason: reason,
        },
      });
      return true;
    }
  }
  const rendezVousPending = await fetchLatestPending(
    admin,
    userId,
    "rendez_vous",
  );
  if (rendezVousPending && !params.isOptInYes) {
    const intent = params.isCheckinLater
      ? "decline"
      : classifyRendezVousIntent(params.inboundText);
    if (intent === "decline") {
      const rendezVousId = String(
        rendezVousPending?.payload?.rendez_vous_id ?? "",
      ).trim();
      const rendezVousKind = asRendezVousKind(
        rendezVousPending?.payload?.rendez_vous_kind,
      );
      const cycleId = String(rendezVousPending?.payload?.cycle_id ?? "").trim();
      const transformationId = String(
        rendezVousPending?.payload?.transformation_id ?? "",
      ).trim() || null;
      const nowIso = new Date().toISOString();

      if (rendezVousId) {
        await transitionRendezVous(admin, rendezVousId, "skipped", {
          nowIso,
          eventMetadata: {
            source: "whatsapp_pending_decline",
            request_id: requestId,
          },
        }).catch((error) => {
          console.warn(
            `[handlers_pending] rendez-vous skip transition failed rendez_vous_id=${rendezVousId}`,
            error,
          );
        });
      }

      if (rendezVousId && rendezVousKind && cycleId) {
        await registerRendezVousRefusal(
          admin,
          rendezVousId,
          rendezVousKind,
          cycleId,
          transformationId,
          userId,
          nowIso,
        ).catch((error) => {
          console.warn(
            `[handlers_pending] rendez-vous refusal cooldown failed rendez_vous_id=${rendezVousId}`,
            error,
          );
        });
      }

      await markPending(admin, rendezVousPending.id, "done");
      const txt = "Ok, on laisse ce rendez-vous pour plus tard 🙂";
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "rendez_vous",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "rendez_vous",
          purpose: "rendez_vous",
        },
      });
      return true;
    }
  }
  // If user accepts a scheduled check-in template, send the actual draft_message immediately.
  if (params.isCheckinYes && !params.isOptInYes) {
    const pending = await fetchLatestCheckinPending(admin, userId);
    // Don't swallow generic "oui" messages if there is no pending scheduled_checkin.
    if (!pending) return false;
    // If linked to a scheduled_checkins row and marked as dynamic, generate the text right now.
    const scheduledId = pending?.scheduled_checkin_id ?? null;
    const payload = pending?.payload ?? {};
    const mode = String(payload?.message_mode ?? "static").trim().toLowerCase();
    const payloadEventContext = String(payload?.event_context ?? "");
    let outboundEventContext = payloadEventContext;
    const outboundPurpose = "scheduled_checkin";
    const draft = payload?.draft_message;
    let textToSend = typeof draft === "string" ? draft.trim() : "";
    if (scheduledId && mode === "dynamic") {
      try {
        const { data: row } = await admin.from("scheduled_checkins").select(
          "event_context,message_payload,draft_message,scheduled_for",
        ).eq("id", scheduledId).maybeSingle();
        const p2 = row?.message_payload ?? {};
        const rowEventContext = String(
          row?.event_context ?? payloadEventContext,
        );
        outboundEventContext = rowEventContext || payloadEventContext;
        const persistedDraft = typeof row?.draft_message === "string"
          ? row.draft_message.trim()
          : "";
        if (persistedDraft) {
          textToSend = persistedDraft;
        } else {
          textToSend = await generateDynamicWhatsAppCheckinMessage({
            admin,
            userId,
            eventContext: rowEventContext || "check-in",
            scheduledFor: String(row?.scheduled_for ?? ""),
            instruction: String(
              p2?.instruction ?? payload?.message_payload?.instruction ?? "",
            ),
            eventGrounding: String(
              p2?.event_grounding ??
                payload?.message_payload?.event_grounding ?? "",
            ),
            source: String(
              p2?.source ?? payload?.message_payload?.source ?? "",
            ),
          });
        }
      } catch {
        // best-effort fallback
        textToSend = textToSend || "Comment ça va depuis tout à l’heure ?";
      }
    }
    if (!textToSend.trim()) {
      textToSend = "Comment ça va depuis tout à l'heure ?";
    }
    textToSend = applyWhatsappProactiveOpeningPolicy({
      text: textToSend,
      allowRelaunchGreeting: false,
      fallback: "Comment ça va depuis tout à l'heure ?",
    });
    if (textToSend.trim()) {
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: textToSend,
        purpose: outboundPurpose,
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: textToSend,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "scheduled_checkin",
          purpose: outboundPurpose,
          event_context: outboundEventContext || null,
        },
      });
    }
    // mark scheduled_checkin as sent
    if (pending.scheduled_checkin_id) {
      await admin.from("scheduled_checkins").update({
        status: "sent",
        processed_at: new Date().toISOString(),
        delivery_last_error: null,
        delivery_last_error_at: null,
        delivery_last_request_id: requestId,
      }).eq("id", pending.scheduled_checkin_id);
    }
    // Any explicit user response to recurring reminder probe resets unanswered counter.
    if (String(outboundEventContext).startsWith("recurring_reminder:")) {
      const recurringReminderId = String(outboundEventContext).slice(
        "recurring_reminder:".length,
      ).trim();
      if (recurringReminderId) {
        await admin.from("user_recurring_reminders").update({
          unanswered_probe_count: 0,
          probe_paused_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", recurringReminderId).eq("user_id", userId);
      }
    }
    await markPending(admin, pending.id, "done");
    return true;
  }
  // If user says later for check-in, cancel and reschedule in 10 minutes.
  if (params.isCheckinLater && !params.isOptInYes) {
    const pending = await fetchLatestCheckinPending(admin, userId);
    // Don't swallow generic "plus tard" messages if there is no pending scheduled_checkin.
    if (!pending) return false;
    if (pending?.scheduled_checkin_id) {
      await admin.from("scheduled_checkins").update({
        status: "pending",
        scheduled_for: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        processed_at: null,
        delivery_last_error: null,
        delivery_last_error_at: null,
        delivery_last_request_id: requestId,
      }).eq("id", pending.scheduled_checkin_id);
    }
    const payloadEventContext = String(pending?.payload?.event_context ?? "");
    if (payloadEventContext.startsWith("recurring_reminder:")) {
      const recurringReminderId = payloadEventContext.slice(
        "recurring_reminder:".length,
      ).trim();
      if (recurringReminderId) {
        await admin.from("user_recurring_reminders").update({
          unanswered_probe_count: 0,
          probe_paused_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", recurringReminderId).eq("user_id", userId);
      }
    }
    await markPending(admin, pending.id, "cancelled");
    const okMsg = "Ok, je te relance un peu plus tard 🙂";
    const sendResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: okMsg,
      purpose: "scheduled_checkin",
      isProactive: false,
    });
    const outId = sendResp?.messages?.[0]?.id ?? null;
    const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        wa_outbound_message_id: outId,
        outbound_tracking_id: outboundTrackingId,
        is_proactive: false,
      },
    });
    return true;
  }
  return false;
}
