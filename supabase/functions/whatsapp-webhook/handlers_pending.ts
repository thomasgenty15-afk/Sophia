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
  getUserState,
  updateUserState,
} from "../sophia-brain/state-manager.ts";
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
  type DailyActionAppliedOutcome,
  type DailyActionOutcome,
  type DailyActionReviewSkillResult,
  type DailyActionReviewTarget,
  dayLabel,
  isAppliedDailyOutcome,
  isHabitDimension,
  nextDayAfter,
  occurrenceStatusForDailyOutcome,
  runDailyActionReviewFollowupSkill,
  runDailyActionReviewSkill,
  stateFromUnknown,
} from "../_shared/daily_action_review.ts";

type DailyOccurrenceOutcomeApplyResult = {
  status: string;
  rescheduledTo: string | null;
  rescheduleDecision: string | null;
  dailyDecision: string | null;
  continuationPlanItemId: string | null;
  continuationOccurrenceId: string | null;
  continuationPlannedDay: string | null;
  continuationCardsDecision: string | null;
};

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

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

async function activateWeeklyAdaptiveReviewState(params: {
  admin: any;
  userId: string;
  payload: Record<string, unknown>;
  scheduledCheckinId?: unknown;
}) {
  const adaptiveReview = params.payload?.weekly_adaptive_review;
  const progressReview = params.payload?.weekly_progress_review;
  if (!adaptiveReview || typeof adaptiveReview !== "object") return;
  const state = await getUserState(params.admin, params.userId, "whatsapp");
  const tempMemory = state.temp_memory && typeof state.temp_memory === "object"
    ? state.temp_memory
    : {};
  await updateUserState(params.admin, params.userId, "whatsapp", {
    temp_memory: {
      ...tempMemory,
      __active_skill_state: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_progress_review: progressReview ?? null,
        weekly_adaptive_review: adaptiveReview,
        scheduled_checkin_id: cleanText(params.scheduledCheckinId) || null,
        status: "open",
        validation_unlock: {
          status: "locked_until_weekly_complete",
          meaning:
            "La validation de la semaine suivante se debloque quand le point weekly est termine; sinon le rappel du lundi matin sert de fallback.",
        },
        turn_count: 0,
        updated_at: new Date().toISOString(),
      },
    },
  });
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

function isMissionTarget(target: DailyActionReviewTarget): boolean {
  const dimension = String(target?.dimension ?? "").trim();
  const kind = String(target?.kind ?? "").trim();
  return dimension === "missions" || kind === "mission" || kind === "task";
}

function isClarificationTarget(target: DailyActionReviewTarget): boolean {
  const dimension = String(target?.dimension ?? "").trim();
  const kind = String(target?.kind ?? "").trim();
  return dimension === "clarifications" || kind === "clarification";
}

function actionTypeForDailyTarget(
  target: DailyActionReviewTarget,
): "habit" | "mission" | "clarification" {
  if (isHabitDimension(target.dimension)) return "habit";
  if (isClarificationTarget(target)) return "clarification";
  return "mission";
}

function buildClarificationPartialFollowup(
  parsed: DailyActionReviewSkillResult,
  targets: DailyActionReviewTarget[],
): DailyActionReviewSkillResult | null {
  const partialClarifications = targets.filter((target) =>
    isClarificationTarget(target) &&
    parsed.state.items[target.occurrence_id]?.outcome === "partial"
  );
  if (partialClarifications.length === 0) return null;

  const nextTargets = partialClarifications.slice(0, 2);
  const nextTargetIds = nextTargets.map((target) => target.occurrence_id);
  for (const target of partialClarifications) {
    const item = parsed.state.items[target.occurrence_id];
    if (!item) continue;
    item.outcome = "unclear";
    item.reason_category = null;
    item.still_relevant = "unknown";
    item.missing_slots = ["outcome"];
  }

  const labels = nextTargets.map((target) => `« ${target.title} »`);
  const subject = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
  const message = labels.length === 1
    ? `Pour ${subject}, je ne veux pas le noter à moitié : tu veux que je le compte fait ou pas fait ?`
    : `Pour ${subject}, je ne veux pas les noter à moitié : tu veux que je les compte faits ou pas faits ?`;

  parsed.state.status = "needs_clarification";
  parsed.state.should_apply_effects = false;
  parsed.state.stop_reason = null;
  parsed.state.current_focus_occurrence_ids = nextTargetIds;
  parsed.state.next_question_targets = nextTargetIds;
  parsed.state.remaining_occurrence_ids = [
    ...new Set([
      ...nextTargetIds,
      ...parsed.state.remaining_occurrence_ids.filter((id) =>
        !nextTargetIds.includes(id)
      ),
    ]),
  ];
  parsed.state.next_question = message;
  parsed.state.generated_user_message = message;
  return {
    ...parsed,
    missingOccurrenceIds: parsed.state.remaining_occurrence_ids,
    nextQuestion: message,
    generatedUserMessage: message,
    shouldApplyEffects: false,
  };
}

function buildDailyActionReviewMissingQuestion(
  parsed: DailyActionReviewSkillResult,
  targets: DailyActionReviewTarget[],
): string {
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
    return `Tu veux qu'on reporte « ${
      missingStillRelevantTargets[0].title
    } » à demain ?`;
  }
  if (missingStillRelevantTargets.length > 1) {
    const titles = missingStillRelevantTargets.map((target) =>
      `« ${target.title} »`
    ).join(" et ");
    return `Tu veux qu'on reporte ${titles} à demain ?`;
  }

  const missingOutcomeTargets = parsed.missingOccurrenceIds
    .map((id) => targetById.get(id))
    .filter((target): target is DailyActionReviewTarget => Boolean(target));
  if (missingOutcomeTargets.length === 1) {
    return `Pour « ${
      missingOutcomeTargets[0].title
    } », tu veux que je le compte fait ou pas fait ?`;
  }
  if (missingOutcomeTargets.length > 1) {
    const titles = missingOutcomeTargets.slice(0, 2).map((target) =>
      `« ${target.title} »`
    ).join(" et ");
    return `Pour ${titles}, tu veux que je les compte faits ou pas faits ?`;
  }

  return "Il me manque juste une info pour noter correctement le check. Tu peux me dire ce qui s'est passé ?";
}

function buildDailyActionReviewFallbackFinalMessage(params: {
  parsed: DailyActionReviewSkillResult;
  targets: DailyActionReviewTarget[];
  rescheduleByOccurrenceId: Map<string, string | null>;
  continuationPlanItemByOccurrenceId: Map<string, string | null>;
  continuationPlannedDayByOccurrenceId: Map<string, string | null>;
}): string {
  const lines = params.targets.flatMap((target) => {
    const state = params.parsed.state.items[target.occurrence_id];
    if (!isAppliedDailyOutcome(state?.outcome)) return [];
    const label = state.outcome === "completed"
      ? "fait"
      : state.outcome === "partial" && isHabitDimension(target.dimension)
      ? "partiellement fait, compté comme OK"
      : state.outcome === "partial" && isMissionTarget(target)
      ? "1ère partie faite"
      : state.outcome === "partial"
      ? "partiellement fait"
      : "pas fait";
    const rescheduledTo = params.rescheduleByOccurrenceId.get(
      target.occurrence_id,
    );
    const continuationPlannedDay = params.continuationPlannedDayByOccurrenceId
      .get(target.occurrence_id);
    const hasContinuation = Boolean(
      params.continuationPlanItemByOccurrenceId.get(target.occurrence_id),
    );
    const suffix = rescheduledTo
      ? `, reporté à ${dayLabel(rescheduledTo)}`
      : hasContinuation && continuationPlannedDay
      ? `, suite prévue ${dayLabel(continuationPlannedDay)}`
      : "";
    return [`- ${target.title}: ${label}${suffix}`];
  });
  if (lines.length === 0) return "C'est noté pour ce soir.";
  return ["C'est noté pour ce soir :", ...lines].join("\n");
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
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("whatsapp_pending_actions")
    .select("id,scheduled_checkin_id,status,payload,created_at,expires_at")
    .eq("user_id", userId)
    .eq("kind", "scheduled_checkin")
    .eq("status", "pending")
    .filter(
      "payload->>event_context",
      "eq",
      ACTION_EVENING_REVIEW_EVENT_CONTEXT,
    )
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = data ?? [];
  for (const row of rows) {
    const expiresAt = typeof row?.expires_at === "string"
      ? row.expires_at
      : null;
    if (expiresAt && expiresAt <= nowIso) {
      await admin.from("whatsapp_pending_actions").update({
        status: "expired",
        processed_at: nowIso,
      }).eq("id", row.id).eq("status", "pending");
      continue;
    }
    const scheduledId = String(row?.scheduled_checkin_id ?? "").trim();
    if (scheduledId) {
      const { data: checkin, error: checkinErr } = await admin
        .from("scheduled_checkins")
        .select("id,status")
        .eq("id", scheduledId)
        .maybeSingle();
      if (checkinErr) throw checkinErr;
      const checkinStatus = String(checkin?.status ?? "").trim();
      if (["cancelled", "expired", "failed"].includes(checkinStatus)) {
        await admin.from("whatsapp_pending_actions").update({
          status: "cancelled",
          processed_at: nowIso,
        }).eq("id", row.id).eq("status", "pending");
        continue;
      }
    }
    return row;
  }
  return null;
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
      plan_label:
        String(target?.plan_label ?? target?.plan_title ?? "").trim() ||
        null,
      plan_item_id: planItemId,
      title,
      dimension: String(target?.dimension ?? "").trim() || null,
      kind: String(target?.kind ?? "").trim() || null,
      tracking_type: String(target?.tracking_type ?? "").trim() || null,
      planned_day: String(target?.planned_day ?? "").trim() || null,
      original_planned_day: String(target?.original_planned_day ?? "").trim() ||
        null,
      week_start_date: String(target?.week_start_date ?? "").trim() || null,
      reviewed_local_date: String(target?.reviewed_local_date ?? "").trim() ||
        null,
    }];
  });
}

function isDailyReviewRecapRequest(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(récap|recap|bilan|résumé|resume|retenu|noté|gardé|enregistré)\b/
      .test(t) ||
    /\bce qu['’]?on vient de faire\b/.test(t) ||
    /\b(tu\s+as|t['’]?as|vous avez)\s+(mis|marqué|marque)\s+quoi\b/.test(t) ||
    /\b(qu['’]?est-ce que|ce que)\s+(tu\s+as|t['’]?as|vous avez)\s+(mis|marqué|marque)\b/
      .test(t) ||
    /\bréussite nickel\b|\breussite nickel\b/.test(t) ||
    /\b(transformé|transforme)\s+.*\b(réussite|reussite|fait|validé|valide)\b/
      .test(t) ||
    (/\b(report|reporté|reporte|reportée|reportee|demain)\b/.test(t) &&
      /\b(rien|aucun|pas|vérifier|verifier|d['’]?accord|accord)\b/.test(t)) ||
    /\bqu['’]?est-ce que tu as (retenu|noté|note|gardé|garde|enregistré|enregistre)\b/
      .test(t) ||
    /\btu as (retenu|noté|note|gardé|garde|enregistré|enregistre) quoi\b/
      .test(t)
  );
}

function dailyOutcomeLabel(outcome: unknown): string {
  const raw = String(outcome ?? "").trim();
  if (raw === "completed") return "fait";
  if (raw === "partial") return "partiellement fait";
  if (raw === "missed") return "pas fait";
  return "non clarifié";
}

function isDailyReportCheck(text: string): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  return /\b(report|reporté|reporte|reportée|reportee|demain)\b/.test(t);
}

function buildDailyReviewRecapMessage(
  payload: any,
  inboundText = "",
): string | null {
  const targets = normalizeDailyTargets(payload?.targets);
  const state = stateFromUnknown(payload?.review_state, targets);
  const lines = targets.flatMap((target) => {
    const item = state.items[target.occurrence_id];
    if (!item) return [];
    const label = dailyOutcomeLabel(item.outcome);
    const detail = String(item.reason_text ?? "").trim();
    const reason = String(item.reason_category ?? "").trim();
    const suffix = detail
      ? ` (${detail})`
      : reason && !["none", "unclear"].includes(reason)
      ? ` (${reason})`
      : "";
    return [`- ${target.title} : ${label}${suffix}`];
  });
  if (lines.length === 0) return null;
  const hasMissedStillRelevant = Object.values(state.items ?? {}).some((
    item: any,
  ) => item?.outcome === "missed" && item?.still_relevant === true);
  const reportLine = isDailyReportCheck(inboundText) && !hasMissedStillRelevant
    ? ["Je n'ai noté aucun report à demain dans ce bilan."]
    : [];
  return [
    "Voilà ce que j'ai noté pour le bilan qu'on vient de faire :",
    ...lines,
    ...reportLine,
    "Je ne change rien d'autre dans ton plan.",
  ].join("\n");
}

async function buildDailyReviewFollowupContext(params: {
  admin: any;
  userId: string;
  pending: any;
}) {
  const payload = params.pending?.payload ?? {};
  const targets = normalizeDailyTargets(payload?.targets);
  const alreadyResolvedTargets = normalizeDailyTargets(
    payload?.already_resolved_targets,
  );
  const state = stateFromUnknown(payload?.review_state, targets);
  const allTargets = [...targets, ...alreadyResolvedTargets];
  const planItemIds = [
    ...new Set(
      allTargets.map((target) => target.plan_item_id).filter(Boolean),
    ),
  ];
  const entries = planItemIds.length > 0
    ? (await params.admin
      .from("user_plan_item_entries")
      .select(
        "id,plan_item_id,outcome,entry_kind,value_text,metadata,created_at,effective_at",
      )
      .eq("user_id", params.userId)
      .in("plan_item_id", planItemIds)
      .order("created_at", { ascending: false })
      .limit(40)).data ?? []
    : [];
  const entryByPlanItemId = new Map<string, any>();
  for (const entry of entries) {
    const planItemId = String(entry?.plan_item_id ?? "").trim();
    if (!planItemId || entryByPlanItemId.has(planItemId)) continue;
    entryByPlanItemId.set(planItemId, entry);
  }

  const continuationIds = [
    ...new Set(
      entries.map((entry: any) =>
        String(entry?.metadata?.continuation_plan_item_id ?? "").trim()
      ).filter(Boolean),
    ),
  ];
  const continuationItems = continuationIds.length > 0
    ? (await params.admin
      .from("user_plan_items")
      .select(
        "id,title,dimension,kind,status,payload,defense_card_id,attack_card_id",
      )
      .eq("user_id", params.userId)
      .in("id", continuationIds)).data ?? []
    : [];
  const continuationOccurrences = continuationIds.length > 0
    ? (await params.admin
      .from("user_habit_week_occurrences")
      .select("id,plan_item_id,planned_day,status,week_start_date")
      .eq("user_id", params.userId)
      .in("plan_item_id", continuationIds)).data ?? []
    : [];
  const defenseCards = continuationIds.length > 0
    ? (await params.admin
      .from("user_defense_cards")
      .select("id,plan_item_id,metadata")
      .eq("user_id", params.userId)
      .in("plan_item_id", continuationIds)).data ?? []
    : [];
  const attackCards = continuationIds.length > 0
    ? (await params.admin
      .from("user_attack_cards")
      .select("id,plan_item_id,metadata")
      .eq("user_id", params.userId)
      .in("plan_item_id", continuationIds)).data ?? []
    : [];
  const continuationById = new Map(
    continuationItems.map((item: any) => [String(item.id), item]),
  );
  const continuationOccurrenceByPlanItemId = new Map(
    continuationOccurrences.map((occurrence: any) => [
      String(occurrence.plan_item_id),
      occurrence,
    ]),
  );
  const defenseCountByPlanItemId = new Map<string, number>();
  for (const card of defenseCards) {
    const key = String(card?.plan_item_id ?? "").trim();
    if (!key) continue;
    defenseCountByPlanItemId.set(
      key,
      (defenseCountByPlanItemId.get(key) ?? 0) + 1,
    );
  }
  const attackCountByPlanItemId = new Map<string, number>();
  for (const card of attackCards) {
    const key = String(card?.plan_item_id ?? "").trim();
    if (!key) continue;
    attackCountByPlanItemId.set(
      key,
      (attackCountByPlanItemId.get(key) ?? 0) + 1,
    );
  }

  function actionContext(
    target: DailyActionReviewTarget,
    source: "reviewed" | "already_resolved",
  ) {
    const item = state.items[target.occurrence_id];
    const entry = entryByPlanItemId.get(target.plan_item_id);
    const continuationId = String(
      entry?.metadata?.continuation_plan_item_id ?? "",
    ).trim();
    const continuation = continuationId
      ? continuationById.get(continuationId) as any
      : null;
    const continuationOccurrence = continuationId
      ? continuationOccurrenceByPlanItemId.get(continuationId) as any
      : null;
    const outcome = source === "already_resolved"
      ? String(
        (target as any)?.resolved_status ?? entry?.outcome ?? "completed",
      )
      : String(item?.outcome ?? entry?.outcome ?? "unknown");
    return {
      source,
      title: target.title,
      plan_id: target.plan_id,
      plan_label: target.plan_label ?? null,
      plan_item_id: target.plan_item_id,
      occurrence_id: target.occurrence_id,
      action_type: source === "already_resolved"
        ? actionTypeForDailyTarget(target)
        : item?.action_type ?? actionTypeForDailyTarget(target),
      outcome,
      human_label: dailyOutcomeLabel(outcome),
      reason_text: String(
        item?.reason_text ?? entry?.metadata?.reason_text ?? "",
      ).trim() || null,
      daily_decision: String(entry?.metadata?.daily_decision ?? "").trim() ||
        null,
      entry_kind: String(entry?.entry_kind ?? "").trim() || null,
      continuation: continuation
        ? {
          title: String(continuation.title ?? "").trim(),
          plan_item_id: continuationId,
          occurrence_id: String(
            entry?.metadata?.continuation_occurrence_id ??
              continuationOccurrence?.id ?? "",
          ).trim() || null,
          planned_day: String(
            entry?.metadata?.continuation_planned_day ??
              continuationOccurrence?.planned_day ?? "",
          ).trim() || null,
          planned_day_label: dayLabel(
            String(
              entry?.metadata?.continuation_planned_day ??
                continuationOccurrence?.planned_day ?? "",
            ).trim(),
          ),
          defense_cards_duplicated:
            defenseCountByPlanItemId.get(continuationId) ??
              0,
          attack_cards_duplicated:
            attackCountByPlanItemId.get(continuationId) ??
              0,
        }
        : null,
    };
  }

  return {
    source: DAILY_ACTION_REVIEW_SOURCE,
    pending_action_id: String(params.pending?.id ?? "").trim(),
    scheduled_checkin_id:
      String(params.pending?.scheduled_checkin_id ?? "").trim() || null,
    processed_at: params.pending?.processed_at ?? null,
    local_date: String(payload?.local_date ?? "").trim() || null,
    actions: [
      ...alreadyResolvedTargets.map((target) =>
        actionContext(target, "already_resolved")
      ),
      ...targets.map((target) => actionContext(target, "reviewed")),
    ],
  };
}

async function maybeHandleRecentDailyReviewRecap(params: {
  admin: any;
  userId: string;
  fromE164: string;
  requestId: string;
  inboundText: string;
}) {
  const sinceIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data, error } = await params.admin
    .from("whatsapp_pending_actions")
    .select("id,scheduled_checkin_id,status,payload,processed_at,created_at")
    .eq("user_id", params.userId)
    .eq("kind", "scheduled_checkin")
    .eq("status", "done")
    .filter(
      "payload->>event_context",
      "eq",
      ACTION_EVENING_REVIEW_EVENT_CONTEXT,
    )
    .gte("processed_at", sinceIso)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const dailyContext = await buildDailyReviewFollowupContext({
    admin: params.admin,
    userId: params.userId,
    pending: data,
  });
  const recentMessages = await params.admin
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", params.userId)
    .eq("scope", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(8);
  const result = await runDailyActionReviewFollowupSkill({
    text: params.inboundText,
    dailyContext,
    recentMessages: ((recentMessages.data ?? []) as any[])
      .reverse()
      .map((message) => ({
        role: String(message.role ?? ""),
        content: String(message.content ?? ""),
      })),
    requestId: params.requestId,
    userId: params.userId,
  });
  const txt = result.generatedUserMessage;
  if (!result.shouldHandle || !txt) return false;
  await sendDailyActionReviewAssistantMessage({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    fromE164: params.fromE164,
    body: txt,
    source: "daily_action_review_recap",
  });
  return true;
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

async function markDailyActionReviewStructuredExtraction(params: {
  admin: any;
  userId: string;
  chatMessageId?: string | null;
  pending: any;
  parsedState: any;
  complete: boolean;
}) {
  const chatMessageId = String(params.chatMessageId ?? "").trim();
  if (!chatMessageId) return;
  const occurrenceIds = Object.keys(params.parsedState?.items ?? {});
  const metadataPatch = {
    structured_extraction_source: DAILY_ACTION_REVIEW_SOURCE,
    structured_extraction_id: String(params.pending?.id ?? "").trim() || null,
    daily_action_review_v1: {
      structured_extraction_id: String(params.pending?.id ?? "").trim() || null,
      structured_extraction_status: params.complete ? "complete" : "partial",
      pending_action_id: String(params.pending?.id ?? "").trim() || null,
      scheduled_checkin_id: params.pending?.scheduled_checkin_id ?? null,
      occurrence_ids: occurrenceIds,
      skill_status: params.parsedState?.status ?? null,
      stop_reason: params.parsedState?.stop_reason ?? null,
    },
  };
  const { data } = await params.admin
    .from("chat_messages")
    .select("metadata")
    .eq("user_id", params.userId)
    .eq("id", chatMessageId)
    .maybeSingle();
  const existing = data?.metadata && typeof data.metadata === "object"
    ? data.metadata
    : {};
  const { error } = await params.admin
    .from("chat_messages")
    .update({
      metadata: {
        ...existing,
        ...metadataPatch,
      },
    })
    .eq("user_id", params.userId)
    .eq("id", chatMessageId);
  if (error) {
    console.warn(
      "[handlers_pending] daily_action_review_metadata_patch_failed",
      error,
    );
  }
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
    ...new Set(
      rows.map((row) => String(row.plan_item_id ?? "").trim()).filter(Boolean),
    ),
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

function titleForMissionContinuation(title: unknown): string {
  const raw = String(title ?? "").trim() || "mission";
  if (/\b(2e|2eme|deuxieme|deuxième)\s+partie\b/i.test(raw)) return raw;
  return `Terminer ${raw} (2e partie)`;
}

async function cloneDailySplitCard(params: {
  admin: any;
  table: "user_attack_cards" | "user_defense_cards";
  cardId: string | null;
  userId: string;
  continuationPlanItemId: string;
  sourcePlanItemId: string;
  sourceOccurrenceId: string;
  nowIso: string;
}): Promise<string | null> {
  if (!params.cardId) return null;
  const { data: sourceCard, error: sourceErr } = await params.admin
    .from(params.table)
    .select("*")
    .eq("user_id", params.userId)
    .eq("id", params.cardId)
    .maybeSingle();
  if (sourceErr) throw sourceErr;
  if (!sourceCard) return null;

  const metadata =
    sourceCard.metadata && typeof sourceCard.metadata === "object"
      ? sourceCard.metadata
      : {};
  const cloned = {
    ...sourceCard,
    id: crypto.randomUUID(),
    plan_item_id: params.continuationPlanItemId,
    metadata: {
      ...metadata,
      duplicated_for_daily_split: true,
      duplicated_from_card_id: params.cardId,
      daily_split_source_plan_item_id: params.sourcePlanItemId,
      daily_split_source_occurrence_id: params.sourceOccurrenceId,
    },
    generated_at: params.nowIso,
    last_updated_at: params.nowIso,
  };
  const { error: insertErr } = await params.admin
    .from(params.table)
    .insert(cloned);
  if (insertErr) throw insertErr;
  return cloned.id;
}

async function ensureMissionPartialContinuation(params: {
  admin: any;
  userId: string;
  target: DailyActionReviewTarget;
  nowIso: string;
}): Promise<{
  planItemId: string | null;
  occurrenceId: string | null;
  plannedDay: string | null;
  cardsDecision: string | null;
  decision: string;
}> {
  const plannedDay = await findTomorrowRescheduleDay({
    admin: params.admin,
    userId: params.userId,
    target: params.target,
  });
  if (!plannedDay) {
    return {
      planItemId: null,
      occurrenceId: null,
      plannedDay: null,
      cardsDecision: null,
      decision: "mission_partial_completed_no_continuation_slot",
    };
  }

  const { data: existingContinuation, error: existingErr } = await params.admin
    .from("user_plan_items")
    .select("id,defense_card_id,attack_card_id,cards_status")
    .eq("user_id", params.userId)
    .filter(
      "payload->>daily_split_from_occurrence_id",
      "eq",
      params.target.occurrence_id,
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw existingErr;

  let continuationPlanItemId = String(existingContinuation?.id ?? "").trim();
  let cardsDecision = continuationPlanItemId
    ? "existing_continuation_reused"
    : null;

  if (!continuationPlanItemId) {
    const { data: sourceItem, error: sourceErr } = await params.admin
      .from("user_plan_items")
      .select(
        "id,user_id,cycle_id,transformation_id,plan_id,dimension,kind,status,title,description,tracking_type,activation_order,activation_condition,current_habit_state,support_mode,support_function,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,start_after_item_id,payload,phase_id,phase_order,defense_card_id,attack_card_id,cards_status,cards_generated_at",
      )
      .eq("user_id", params.userId)
      .eq("id", params.target.plan_item_id)
      .maybeSingle();
    if (sourceErr) throw sourceErr;
    if (!sourceItem) {
      return {
        planItemId: null,
        occurrenceId: null,
        plannedDay,
        cardsDecision: null,
        decision: "mission_partial_completed_source_item_missing",
      };
    }

    continuationPlanItemId = crypto.randomUUID();
    const sourcePayload = sourceItem.payload &&
        typeof sourceItem.payload === "object"
      ? sourceItem.payload
      : {};
    const { error: insertItemErr } = await params.admin
      .from("user_plan_items")
      .insert({
        id: continuationPlanItemId,
        user_id: params.userId,
        cycle_id: String(sourceItem.cycle_id ?? "").trim(),
        transformation_id: String(sourceItem.transformation_id ?? "").trim(),
        plan_id: String(sourceItem.plan_id ?? "").trim(),
        dimension: sourceItem.dimension,
        kind: sourceItem.kind,
        status: "active",
        title: titleForMissionContinuation(sourceItem.title),
        description: sourceItem.description ?? null,
        tracking_type: sourceItem.tracking_type,
        activation_order: typeof sourceItem.activation_order === "number"
          ? sourceItem.activation_order + 1
          : null,
        activation_condition: sourceItem.activation_condition ?? null,
        current_habit_state: null,
        support_mode: null,
        support_function: null,
        target_reps: sourceItem.target_reps ?? null,
        current_reps: 0,
        cadence_label: sourceItem.cadence_label ?? null,
        scheduled_days: [plannedDay],
        time_of_day: sourceItem.time_of_day ?? null,
        start_after_item_id: sourceItem.id,
        phase_id: sourceItem.phase_id ?? null,
        phase_order: sourceItem.phase_order ?? null,
        cards_status: "not_required",
        payload: {
          ...sourcePayload,
          daily_split_continuation: true,
          daily_split_part: "2e_partie",
          daily_split_from_plan_item_id: params.target.plan_item_id,
          daily_split_from_occurrence_id: params.target.occurrence_id,
          daily_split_created_at: params.nowIso,
          daily_split_planned_day: plannedDay,
        },
        created_at: params.nowIso,
        updated_at: params.nowIso,
        activated_at: params.nowIso,
        completed_at: null,
      });
    if (insertItemErr) throw insertItemErr;

    const clonedDefenseCardId = await cloneDailySplitCard({
      admin: params.admin,
      table: "user_defense_cards",
      cardId: String(sourceItem.defense_card_id ?? "").trim() || null,
      userId: params.userId,
      continuationPlanItemId,
      sourcePlanItemId: params.target.plan_item_id,
      sourceOccurrenceId: params.target.occurrence_id,
      nowIso: params.nowIso,
    });
    const clonedAttackCardId = await cloneDailySplitCard({
      admin: params.admin,
      table: "user_attack_cards",
      cardId: String(sourceItem.attack_card_id ?? "").trim() || null,
      userId: params.userId,
      continuationPlanItemId,
      sourcePlanItemId: params.target.plan_item_id,
      sourceOccurrenceId: params.target.occurrence_id,
      nowIso: params.nowIso,
    });

    const hasClonedCards = Boolean(clonedDefenseCardId || clonedAttackCardId);
    cardsDecision = hasClonedCards
      ? "cards_duplicated"
      : "no_cards_to_duplicate";
    const { error: updateItemErr } = await params.admin
      .from("user_plan_items")
      .update({
        defense_card_id: clonedDefenseCardId,
        attack_card_id: clonedAttackCardId,
        cards_status: hasClonedCards
          ? "ready"
          : String(sourceItem.cards_status ?? "").trim() || "not_required",
        cards_generated_at: hasClonedCards
          ? params.nowIso
          : sourceItem.cards_generated_at ?? null,
        updated_at: params.nowIso,
      })
      .eq("user_id", params.userId)
      .eq("id", continuationPlanItemId);
    if (updateItemErr) throw updateItemErr;
  }

  const { data: existingOccurrence, error: existingOccurrenceErr } =
    await params
      .admin
      .from("user_habit_week_occurrences")
      .select("id")
      .eq("user_id", params.userId)
      .eq("plan_item_id", continuationPlanItemId)
      .eq("week_start_date", params.target.week_start_date)
      .limit(1)
      .maybeSingle();
  if (existingOccurrenceErr) throw existingOccurrenceErr;

  let continuationOccurrenceId = String(existingOccurrence?.id ?? "").trim();
  if (!continuationOccurrenceId) {
    continuationOccurrenceId = crypto.randomUUID();
    const ordinal = Math.max(
      1,
      [
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
        "sun",
      ].indexOf(plannedDay) + 1,
    );
    const { error: insertOccurrenceErr } = await params.admin
      .from("user_habit_week_occurrences")
      .insert({
        id: continuationOccurrenceId,
        user_id: params.userId,
        cycle_id: params.target.cycle_id,
        transformation_id: params.target.transformation_id,
        plan_id: params.target.plan_id,
        plan_item_id: continuationPlanItemId,
        week_start_date: params.target.week_start_date,
        ordinal,
        default_day: plannedDay,
        planned_day: plannedDay,
        original_planned_day: plannedDay,
        actual_day: null,
        status: "planned",
        source: "manual_change",
        validated_at: null,
        created_at: params.nowIso,
        updated_at: params.nowIso,
      });
    if (insertOccurrenceErr) throw insertOccurrenceErr;
  }

  return {
    planItemId: continuationPlanItemId,
    occurrenceId: continuationOccurrenceId,
    plannedDay,
    cardsDecision,
    decision: "mission_partial_split_continuation_created",
  };
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
}): Promise<DailyOccurrenceOutcomeApplyResult> {
  if (params.outcome !== "missed") {
    let status = occurrenceStatusForDailyOutcome(params.outcome);
    let continuation:
      | Awaited<
        ReturnType<typeof ensureMissionPartialContinuation>
      >
      | null = null;
    let dailyDecision = params.outcome === "partial"
      ? "partial_recorded"
      : "completed";
    if (
      params.outcome === "partial" && isHabitDimension(params.target.dimension)
    ) {
      dailyDecision = "habit_partial_counted_positive";
    }
    if (params.outcome === "partial" && isMissionTarget(params.target)) {
      status = "done";
      continuation = await ensureMissionPartialContinuation({
        admin: params.admin,
        userId: params.userId,
        target: params.target,
        nowIso: params.nowIso,
      });
      dailyDecision = continuation.decision;
    }
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
    return {
      status,
      rescheduledTo: null,
      rescheduleDecision: null,
      dailyDecision,
      continuationPlanItemId: continuation?.planItemId ?? null,
      continuationOccurrenceId: continuation?.occurrenceId ?? null,
      continuationPlannedDay: continuation?.plannedDay ?? null,
      continuationCardsDecision: continuation?.cardsDecision ?? null,
    };
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
      dailyDecision: "missed_not_rescheduled",
      continuationPlanItemId: null,
      continuationOccurrenceId: null,
      continuationPlannedDay: null,
      continuationCardsDecision: null,
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
      dailyDecision: "missed_rescheduled_tomorrow",
      continuationPlanItemId: null,
      continuationOccurrenceId: null,
      continuationPlannedDay: null,
      continuationCardsDecision: null,
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
    dailyDecision: "missed_not_rescheduled_no_slot",
    continuationPlanItemId: null,
    continuationOccurrenceId: null,
    continuationPlannedDay: null,
    continuationCardsDecision: null,
  };
}

async function handleActionEveningReviewReply(params: {
  admin: any;
  userId: string;
  fromE164: string;
  requestId: string;
  actionId?: string | null;
  inboundText?: string | null;
  inboundChatMessageId?: string | null;
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

  let parsed: DailyActionReviewSkillResult = decision
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
        generatedUserMessage: state.generated_user_message,
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
  parsed = buildClarificationPartialFollowup(parsed, effectiveTargets) ??
    parsed;
  await markDailyActionReviewStructuredExtraction({
    admin: params.admin,
    userId: params.userId,
    chatMessageId: params.inboundChatMessageId,
    pending,
    parsedState: parsed.state,
    complete: parsed.shouldApplyEffects,
  });

  if (!parsed.shouldApplyEffects) {
    const txt = parsed.generatedUserMessage ||
      buildDailyActionReviewMissingQuestion(parsed, effectiveTargets);
    parsed.state.next_question = parsed.state.next_question || txt;
    parsed.state.generated_user_message = parsed.state.generated_user_message ||
      txt;
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
  const dailyDecisionByOccurrenceId = new Map<string, string | null>();
  const continuationPlanItemByOccurrenceId = new Map<string, string | null>();
  const continuationOccurrenceByOccurrenceId = new Map<string, string | null>();
  const continuationPlannedDayByOccurrenceId = new Map<string, string | null>();
  const continuationCardsDecisionByOccurrenceId = new Map<
    string,
    string | null
  >();
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
    dailyDecisionByOccurrenceId.set(target.occurrence_id, result.dailyDecision);
    continuationPlanItemByOccurrenceId.set(
      target.occurrence_id,
      result.continuationPlanItemId,
    );
    continuationOccurrenceByOccurrenceId.set(
      target.occurrence_id,
      result.continuationOccurrenceId,
    );
    continuationPlannedDayByOccurrenceId.set(
      target.occurrence_id,
      result.continuationPlannedDay,
    );
    continuationCardsDecisionByOccurrenceId.set(
      target.occurrence_id,
      result.continuationCardsDecision,
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
      const itemState =
        parsed.state.items[String(target?.occurrence_id ?? "").trim()];
      const outcome = itemState?.outcome;
      if (!isAppliedDailyOutcome(outcome)) return [];
      const occurrenceId = String(target?.occurrence_id ?? "").trim();
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
        difficulty_level: itemState?.reason_category === "too_hard"
          ? "high"
          : null,
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
          occurrence_id: occurrenceId,
          dimension: String(target?.dimension ?? "").trim() || null,
          daily_decision: dailyDecisionByOccurrenceId.get(occurrenceId) ??
            null,
          completed_part_label: outcome === "partial" &&
              isMissionTarget(target as DailyActionReviewTarget)
            ? "1ere_partie"
            : null,
          reason_category: itemState?.reason_category ?? null,
          reason_text: itemState?.reason_text ?? null,
          matched_user_text: itemState?.matched_user_text ?? null,
          still_relevant: outcome === "missed"
            ? parsed.stillRelevantByOccurrenceId[
              String(target?.occurrence_id ?? "").trim()
            ] ?? null
            : null,
          confidence: itemState?.confidence ?? "low",
          occurrence_status: statusByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          reschedule_decision: rescheduleDecisionByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          rescheduled_to: rescheduleByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          continuation_plan_item_id: continuationPlanItemByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          continuation_occurrence_id: continuationOccurrenceByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          continuation_planned_day: continuationPlannedDayByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          continuation_cards_decision:
            continuationCardsDecisionByOccurrenceId.get(occurrenceId) ?? null,
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

  const completedState = {
    ...parsed.state,
    status: "complete",
    remaining_occurrence_ids: [],
    next_question: null,
    next_question_targets: [],
    should_apply_effects: true,
    stop_reason: parsed.state.stop_reason ?? "all_required_slots_filled",
  };
  await params.admin
    .from("whatsapp_pending_actions")
    .update({
      payload: {
        ...payload,
        message_mode: "conversation",
        chat_capability: "daily_action_review",
        review_state: completedState,
        missing_occurrence_ids: [],
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

  const txt = parsed.generatedUserMessage ||
    buildDailyActionReviewFallbackFinalMessage({
      parsed,
      targets: effectiveTargets,
      rescheduleByOccurrenceId,
      continuationPlanItemByOccurrenceId,
      continuationPlannedDayByOccurrenceId,
    });
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
  inboundChatMessageId?: string | null;
}) {
  const { admin, userId, fromE164, requestId } = params;
  const handledRecentDailyRecap = await maybeHandleRecentDailyReviewRecap({
    admin,
    userId,
    fromE164,
    requestId,
    inboundText: params.inboundText,
  });
  if (handledRecentDailyRecap) return true;

  const handledActionEveningReview = await handleActionEveningReviewReply({
    admin,
    userId,
    fromE164,
    requestId,
    actionId: params.actionId,
    inboundText: params.inboundText,
    inboundChatMessageId: params.inboundChatMessageId,
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
    let resolvedMessagePayload = (payload?.message_payload ?? {}) as Record<
      string,
      unknown
    >;
    const outboundPurpose = "scheduled_checkin";
    const draft = payload?.draft_message;
    let textToSend = typeof draft === "string" ? draft.trim() : "";
    if (scheduledId && mode === "dynamic") {
      try {
        const { data: row } = await admin.from("scheduled_checkins").select(
          "event_context,message_payload,draft_message,scheduled_for",
        ).eq("id", scheduledId).maybeSingle();
        const p2 = row?.message_payload ?? {};
        resolvedMessagePayload = p2 && typeof p2 === "object"
          ? p2 as Record<string, unknown>
          : resolvedMessagePayload;
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
      if (outboundEventContext === "weekly_progress_review_v2") {
        await activateWeeklyAdaptiveReviewState({
          admin,
          userId,
          payload: resolvedMessagePayload,
          scheduledCheckinId: scheduledId,
        }).catch((error) => {
          console.warn(
            `[handlers_pending] weekly_active_state_persist_failed scheduled_checkin_id=${scheduledId}`,
            error,
          );
        });
      }
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
