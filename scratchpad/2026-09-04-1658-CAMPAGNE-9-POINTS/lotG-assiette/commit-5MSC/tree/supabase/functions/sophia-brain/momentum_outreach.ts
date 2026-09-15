import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  getActiveTransformationRuntime,
  getPlanItemRuntime,
  type PlanItemRuntimeRow,
} from "../_shared/v2-runtime.ts";
import type { PlanDimension } from "../_shared/v2-types.ts";
import { getMomentumPolicyDefinition } from "./momentum_policy.ts";
import {
  readMomentumStateV2,
  type StoredMomentumV2,
} from "./momentum_state.ts";

export type MomentumOutreachState =
  | "friction_legere"
  | "evitement"
  | "soutien_emotionnel"
  | "reactivation";

export interface MomentumOutreachPlan {
  state: MomentumOutreachState;
  event_context: string;
  fallback_text: string;
  instruction: string;
  event_grounding: string;
  confidence: StoredMomentumV2["assessment"]["confidence"];
  plan_item_ids_targeted: string[];
  plan_item_titles_targeted: string[];
  strategy:
    | "diagnose_blocker"
    | "confirm_known_blocker"
    | "prepare_dashboard_redirect"
    | "reduce_pressure"
    | "support"
    | "reopen";
}

export interface MomentumOutreachDecision {
  decision: "scheduled" | "skip";
  state?: string;
  event_context?: string;
  reason: string;
  scheduled_for?: string;
  scheduled_checkin_id?: string;
}

const MOMENTUM_OUTREACH_EVENT_CONTEXTS = {
  friction_legere: "momentum_friction_legere",
  evitement: "momentum_evitement",
  soutien_emotionnel: "momentum_soutien_emotionnel",
  reactivation: "momentum_reactivation",
} as const satisfies Record<MomentumOutreachState, string>;

const OUTREACH_ACTIVE_STATUSES = [
  "pending",
  "retrying",
  "awaiting_user",
  "sent",
];
const FUTURE_PENDING_STATUSES = ["pending", "retrying", "awaiting_user"];

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => cleanText(item)).filter(Boolean))];
}

function listToText(items: string[], fallback: string): string {
  const clean = uniq(items);
  if (clean.length === 0) return fallback;
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} et ${clean[clean.length - 1]}`;
}

function formatMetricLine(label: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const text = cleanText(value);
  return text ? `${label}: ${text}` : null;
}

function isActivePlanItem(item: PlanItemRuntimeRow): boolean {
  return item.status === "active" || item.status === "in_maintenance" ||
    item.status === "stalled";
}

function blockerDimensionFromKind(
  blockerKind: StoredMomentumV2["blockers"]["blocker_kind"],
): PlanDimension | null {
  switch (blockerKind) {
    case "mission":
      return "missions";
    case "habit":
      return "habits";
    case "support":
      return "support";
    default:
      return null;
  }
}

function priorityPlanItems(
  momentum: StoredMomentumV2,
  planItems: PlanItemRuntimeRow[],
): PlanItemRuntimeRow[] {
  const activeItems = planItems.filter(isActivePlanItem);
  if (activeItems.length === 0) return [];

  const stalledItems = activeItems.filter((item) => item.status === "stalled");
  if (stalledItems.length > 0) return stalledItems;

  const blockerDimension = blockerDimensionFromKind(
    momentum.blockers.blocker_kind,
  );
  if (blockerDimension) {
    const dimensionItems = activeItems.filter((item) =>
      item.dimension === blockerDimension
    );
    if (dimensionItems.length > 0) return dimensionItems;
  }

  if (momentum.dimensions.load_balance.level === "overloaded") {
    const missionItems = activeItems.filter((item) =>
      item.dimension === "missions"
    );
    if (missionItems.length > 0) return missionItems;
  }

  return activeItems;
}

function buildItemFocus(planItems: PlanItemRuntimeRow[]): {
  ids: string[];
  titles: string[];
  focusText: string;
} {
  const items = planItems.slice(0, 2);
  const ids = items.map((item) => item.id);
  const titles = uniq(items.map((item) => item.title));
  return {
    ids,
    titles,
    focusText: listToText(titles, "ce qui coince en ce moment"),
  };
}

function buildMomentumGrounding(
  state: MomentumOutreachState,
  momentum: StoredMomentumV2,
  planItems: PlanItemRuntimeRow[],
): string {
  const focus = buildItemFocus(priorityPlanItems(momentum, planItems));
  const lines = [
    `state=${state}`,
    `plan_fit=${momentum.dimensions.plan_fit.level}`,
    `load_balance=${momentum.dimensions.load_balance.level}`,
    `execution_traction=${momentum.dimensions.execution_traction.level}`,
    `blocker_kind=${momentum.blockers.blocker_kind ?? "none"}`,
    `recommended_posture=${momentum.posture.recommended_posture}`,
    `needs_reduce=${momentum.active_load.needs_reduce ? "yes" : "no"}`,
    formatMetricLine(
      "engagement_gap_days",
      momentum._internal.metrics_cache.days_since_last_user_message,
    ),
    focus.titles.length > 0 ? `plan_items=${focus.titles.join(" | ")}` : null,
    momentum.assessment.top_blocker
      ? `top_blocker=${momentum.assessment.top_blocker}`
      : null,
    momentum.assessment.top_risk
      ? `top_risk=${momentum.assessment.top_risk}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildMomentumOutreachPlan(
  tempMemory: any,
  opts?: {
    sameStateOutreachCount7d?: number;
    planItems?: PlanItemRuntimeRow[];
  },
): MomentumOutreachPlan | null {
  const momentum = readMomentumStateV2(tempMemory);
  const state = momentum.current_state;
  const sameStateOutreachCount7d = Math.max(
    0,
    Math.floor(Number(opts?.sameStateOutreachCount7d ?? 0)),
  );
  const targetedItems = priorityPlanItems(momentum, opts?.planItems ?? []);
  const focus = buildItemFocus(targetedItems);
  const grounding = buildMomentumGrounding(
    state as MomentumOutreachState,
    momentum,
    opts?.planItems ?? [],
  );

  if (state === "pause_consentie" || state === "momentum") {
    return null;
  }

  if (state === "friction_legere") {
    if (
      momentum.active_load.needs_reduce ||
      momentum.dimensions.load_balance.level === "overloaded"
    ) {
      return {
        state,
        event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
        fallback_text: focus.titles.length > 0
          ? `J'ai l'impression qu'il y a un peu trop a porter autour de ${focus.focusText}. Le plus utile serait peut-etre de viser plus leger pour l'instant, plutot que de forcer.`
          : "J'ai l'impression qu'il y a un peu trop a porter en ce moment. Le plus utile serait peut-etre de viser plus leger pour l'instant, plutot que de forcer.",
        instruction:
          "Message WhatsApp court, naturel, utile. Tu pars d'une surcharge probable. Tu n'ouvres pas un bilan global. Tu proposes d'alleger la pression ou de viser une version plus simple, sans culpabilisation. Une seule question max.",
        event_grounding: grounding,
        confidence: momentum.assessment.confidence,
        plan_item_ids_targeted: focus.ids,
        plan_item_titles_targeted: focus.titles,
        strategy: "reduce_pressure",
      };
    }

    if (momentum.dimensions.plan_fit.level === "poor") {
      return {
        state,
        event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
        fallback_text: focus.titles.length > 0
          ? `Sur ${focus.focusText}, j'ai l'impression que le format actuel ne colle peut-etre pas tres bien a la vraie vie. Tu veux qu'on clarifie ce qui coince avant d'ajuster dans le dashboard ?`
          : "J'ai l'impression que le format actuel ne colle peut-etre pas tres bien a la vraie vie. Tu veux qu'on clarifie ce qui coince avant d'ajuster dans le dashboard ?",
        instruction:
          "Message WhatsApp court, naturel, utile. Tu pars d'un mauvais plan fit probable. Tu ne demandes pas 'tu l'as fait ?'. Tu proposes de clarifier ce qui est irrealiste ou mal calibre, puis tu prefigures un ajustement dans le dashboard si besoin.",
        event_grounding: grounding,
        confidence: momentum.assessment.confidence,
        plan_item_ids_targeted: focus.ids,
        plan_item_titles_targeted: focus.titles,
        strategy: "prepare_dashboard_redirect",
      };
    }

    if (momentum.blockers.blocker_kind || momentum.assessment.top_blocker) {
      return {
        state,
        event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
        fallback_text: focus.titles.length > 0
          ? `J'ai l'impression qu'il y a un vrai point de friction autour de ${focus.focusText}. C'est toujours surtout ca qui bloque, ou il y a autre chose a clarifier ?`
          : "J'ai l'impression qu'il y a un vrai point de friction concret en ce moment. C'est toujours surtout ca qui bloque, ou il y a autre chose a clarifier ?",
        instruction:
          "Message WhatsApp court, naturel, utile. Tu reutilises le signal deja connu sur le type de blocage ou le top blocker. Tu ne repars pas de zero et tu ne fais pas de bilan global. Une seule question max, pour confirmer le vrai frein du moment.",
        event_grounding: grounding,
        confidence: momentum.assessment.confidence,
        plan_item_ids_targeted: focus.ids,
        plan_item_titles_targeted: focus.titles,
        strategy: "confirm_known_blocker",
      };
    }

    if (sameStateOutreachCount7d >= 1) {
      return {
        state,
        event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
        fallback_text:
          "Si ca coince encore, le plus utile est peut-etre qu'on clarifie ce qui rend le plan difficile en vrai, puis que tu ajustes ensuite dans le dashboard plutot que de refaire le meme point.",
        instruction:
          "Message WhatsApp court, naturel, utile. Tu ne reposes pas la meme question generique une deuxieme fois. Tu proposes plutot une clarification plus precise de ce qui rend le plan difficile, avant une redirection dashboard si necessaire.",
        event_grounding: grounding,
        confidence: momentum.assessment.confidence,
        plan_item_ids_targeted: focus.ids,
        plan_item_titles_targeted: focus.titles,
        strategy: "prepare_dashboard_redirect",
      };
    }

    return {
      state,
      event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
      fallback_text: focus.titles.length > 0
        ? `J'ai l'impression qu'il y a un petit frein concret autour de ${focus.focusText}. Le vrai blocage, ce serait plutot le temps, l'energie, le cote flou ou la charge du moment ?`
        : "J'ai l'impression qu'il y a surtout un petit frein concret en ce moment. Le vrai blocage, ce serait plutot le temps, l'energie, le cote flou ou la charge du moment ?",
      instruction:
        "Message WhatsApp court, naturel, utile. Tu aides a identifier le vrai frein concret du moment. Une seule question max. Pas de culpabilisation, pas de bilan global.",
      event_grounding: grounding,
      confidence: momentum.assessment.confidence,
      plan_item_ids_targeted: focus.ids,
      plan_item_titles_targeted: focus.titles,
      strategy: "diagnose_blocker",
    };
  }

  if (state === "evitement") {
    return {
      state,
      event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.evitement,
      fallback_text: momentum.dimensions.load_balance.level === "overloaded" ||
          momentum.dimensions.plan_fit.level === "poor"
        ? "J'ai l'impression que le format actuel en demande peut-etre un peu trop ou tombe pas tout a fait juste en ce moment. Tu preferes qu'on simplifie, qu'on change d'angle, ou qu'on mette un peu en pause ?"
        : "J'ai l'impression que le format actuel ne t'aide peut-etre pas trop en ce moment. Tu preferes qu'on simplifie, qu'on change d'angle, ou qu'on mette un peu en pause ?",
      instruction:
        "Message tres leger, meta, sans pression. Tu peux nommer avec tact que le format actuel n'aide peut-etre pas beaucoup ou qu'il est trop lourd. Tu proposes une sortie simple: alleger, changer d'angle, ou mettre en pause. Une seule question max.",
      event_grounding: grounding,
      confidence: momentum.assessment.confidence,
      plan_item_ids_targeted: focus.ids,
      plan_item_titles_targeted: focus.titles,
      strategy: "reduce_pressure",
    };
  }

  if (state === "soutien_emotionnel") {
    return {
      state,
      event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.soutien_emotionnel,
      fallback_text:
        "Je te laisse un message tout doux: pas besoin de performer quoi que ce soit la tout de suite. Si tu veux, tu peux juste me dire comment tu te sens aujourd'hui.",
      instruction:
        "Message de soutien uniquement. Aucune accountability, aucune logique de performance, aucun plan correctif. Tu accueilles la charge du moment avec douceur et tu laisses une porte simple pour repondre. Une seule question max, tres douce.",
      event_grounding: grounding,
      confidence: momentum.assessment.confidence,
      plan_item_ids_targeted: focus.ids,
      plan_item_titles_targeted: focus.titles,
      strategy: "support",
    };
  }

  if (state === "reactivation") {
    return {
      state,
      event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.reactivation,
      fallback_text: focus.titles.length > 0
        ? `Je repasse juste te laisser une porte ouverte. Si tu veux reprendre un petit fil autour de ${focus.focusText}, je suis la.`
        : "Je repasse juste te laisser une porte ouverte. Si tu veux reprendre le fil a ton rythme, je suis la.",
      instruction:
        "Message porte ouverte, tres leger. Tu n'evoques ni l'absence, ni le retard, ni l'echec. Pas de culpabilisation, pas de pression. Le but est juste de rouvrir le lien avec une invitation simple a reprendre si la personne en a envie.",
      event_grounding: grounding,
      confidence: momentum.assessment.confidence,
      plan_item_ids_targeted: focus.ids,
      plan_item_titles_targeted: focus.titles,
      strategy: "reopen",
    };
  }

  return null;
}

export function listMomentumOutreachEventContexts(): string[] {
  return Object.values(MOMENTUM_OUTREACH_EVENT_CONTEXTS);
}

export function isMomentumOutreachEventContext(eventContext: string): boolean {
  return listMomentumOutreachEventContexts().includes(cleanText(eventContext));
}

export function getMomentumOutreachStateFromEventContext(
  eventContext: string,
): MomentumOutreachState | null {
  const normalized = cleanText(eventContext);
  const entry = Object.entries(MOMENTUM_OUTREACH_EVENT_CONTEXTS).find((
    [, value],
  ) => value === normalized);
  return (entry?.[0] as MomentumOutreachState | undefined) ?? null;
}

export async function scheduleMomentumOutreach(args: {
  admin: SupabaseClient;
  userId: string;
  tempMemory: any;
  nowIso?: string;
  delayMinutes?: number;
  planItems?: PlanItemRuntimeRow[];
}): Promise<MomentumOutreachDecision> {
  const nowIso = String(args.nowIso ?? new Date().toISOString());
  const nowMs = new Date(nowIso).getTime();
  const momentum = readMomentumStateV2(args.tempMemory);

  let planItems = args.planItems ?? [];
  if (planItems.length === 0) {
    const runtime = await getActiveTransformationRuntime(
      args.admin,
      args.userId,
    );
    if (runtime.plan) {
      planItems = await getPlanItemRuntime(args.admin, runtime.plan.id);
    }
  }

  const plan = buildMomentumOutreachPlan(args.tempMemory, { planItems });
  if (!plan) {
    return {
      decision: "skip",
      state: momentum.current_state,
      reason: `momentum_outreach_not_applicable:${momentum.current_state}`,
    };
  }

  const policy = getMomentumPolicyDefinition(plan.state);
  const lookbackIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRows, error: recentErr } = await args.admin
    .from("scheduled_checkins")
    .select("event_context,scheduled_for,status")
    .eq("user_id", args.userId)
    .in("event_context", listMomentumOutreachEventContexts())
    .in("status", OUTREACH_ACTIVE_STATUSES)
    .gte("scheduled_for", lookbackIso)
    .order("scheduled_for", { ascending: false });
  if (recentErr) throw recentErr;

  const rows = Array.isArray(recentRows)
    ? recentRows as Array<Record<string, unknown>>
    : [];
  const sameEventRows = rows.filter((row) =>
    cleanText(row.event_context) === plan.event_context
  );
  const planWithHistory = buildMomentumOutreachPlan(args.tempMemory, {
    sameStateOutreachCount7d: sameEventRows.length,
    planItems,
  }) ?? plan;

  const futurePending = rows.find((row) => {
    const status = cleanText(row.status);
    const scheduledFor = new Date(cleanText(row.scheduled_for)).getTime();
    return FUTURE_PENDING_STATUSES.includes(status) &&
      Number.isFinite(scheduledFor) &&
      scheduledFor >= nowMs;
  });
  if (futurePending) {
    return {
      decision: "skip",
      state: plan.state,
      event_context: planWithHistory.event_context,
      reason: `momentum_outreach_pending:${plan.state}`,
    };
  }

  if (sameEventRows.length >= policy.max_proactive_per_7d) {
    return {
      decision: "skip",
      state: plan.state,
      event_context: planWithHistory.event_context,
      reason: `momentum_outreach_weekly_cap:${plan.state}`,
    };
  }

  const latestSameEvent = sameEventRows[0];
  if (latestSameEvent) {
    const lastScheduledMs = new Date(cleanText(latestSameEvent.scheduled_for))
      .getTime();
    const minGapMs = policy.min_gap_hours * 60 * 60 * 1000;
    if (
      Number.isFinite(lastScheduledMs) && nowMs - lastScheduledMs < minGapMs
    ) {
      return {
        decision: "skip",
        state: plan.state,
        event_context: planWithHistory.event_context,
        reason: `momentum_outreach_min_gap:${plan.state}`,
      };
    }
  }

  const delayMinutes = Math.max(
    0,
    Math.min(30, Math.floor(Number(args.delayMinutes ?? 5))),
  );
  const scheduledForIso = new Date(nowMs + delayMinutes * 60 * 1000)
    .toISOString();
  const { data: inserted, error: insertErr } = await args.admin
    .from("scheduled_checkins")
    .insert({
      user_id: args.userId,
      origin: "rendez_vous",
      event_context: planWithHistory.event_context,
      draft_message: planWithHistory.fallback_text,
      message_mode: "dynamic",
      message_payload: {
        source: "trigger_daily_bilan:momentum_outreach",
        version: 2,
        momentum_state: planWithHistory.state,
        momentum_strategy: planWithHistory.strategy,
        instruction: planWithHistory.instruction,
        event_grounding: planWithHistory.event_grounding,
        confidence: planWithHistory.confidence,
        blocker_kind: momentum.blockers.blocker_kind,
        plan_fit: momentum.dimensions.plan_fit.level,
        load_balance: momentum.dimensions.load_balance.level,
        plan_item_ids_targeted: planWithHistory.plan_item_ids_targeted,
        plan_item_titles_targeted: planWithHistory.plan_item_titles_targeted,
        chat_capability: "track_progress_only",
      },
      scheduled_for: scheduledForIso,
      status: "pending",
    } as any)
    .select("id,scheduled_for")
    .maybeSingle();
  if (insertErr) throw insertErr;

  return {
    decision: "scheduled",
    state: planWithHistory.state,
    event_context: planWithHistory.event_context,
    reason:
      `momentum_outreach_scheduled:${planWithHistory.state}:${planWithHistory.strategy}`,
    scheduled_checkin_id: cleanText((inserted as any)?.id) || undefined,
    scheduled_for: cleanText((inserted as any)?.scheduled_for) ||
      scheduledForIso,
  };
}
