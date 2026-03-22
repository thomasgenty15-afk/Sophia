import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { getMomentumPolicyDefinition } from "./momentum_policy.ts";
import {
  getTopMomentumBlocker,
  readMomentumState,
  summarizeMomentumBlockersForPrompt,
  type MomentumMetrics,
  type MomentumStateLabel,
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
  strategy: "diagnose_blocker" | "confirm_known_blocker" | "prepare_dashboard_redirect" |
    "reduce_pressure" | "support" | "reopen";
}

export interface MomentumOutreachDecision {
  decision: "scheduled" | "skip";
  state?: MomentumStateLabel;
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

const OUTREACH_ACTIVE_STATUSES = ["pending", "retrying", "awaiting_user", "sent"];
const FUTURE_PENDING_STATUSES = ["pending", "retrying", "awaiting_user"];

function formatMetricLine(label: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  return text ? `${label}: ${text}` : null;
}

function buildMomentumGrounding(state: MomentumOutreachState, metrics: MomentumMetrics): string {
  const lines = [
    `state=${state}`,
    formatMetricLine("engagement_gap_days", metrics.days_since_last_user_message),
    formatMetricLine("completed_actions_7d", metrics.completed_actions_7d),
    formatMetricLine("missed_actions_7d", metrics.missed_actions_7d),
    formatMetricLine("partial_actions_7d", metrics.partial_actions_7d),
    formatMetricLine("improved_vitals_14d", metrics.improved_vitals_14d),
    formatMetricLine("worsened_vitals_14d", metrics.worsened_vitals_14d),
    formatMetricLine("emotional_high_72h", metrics.emotional_high_72h),
    formatMetricLine("emotional_medium_72h", metrics.emotional_medium_72h),
    formatMetricLine("consent_soft_declines_7d", metrics.consent_soft_declines_7d),
    formatMetricLine("consent_explicit_stops_7d", metrics.consent_explicit_stops_7d),
    formatMetricLine("last_gap_hours", metrics.last_gap_hours),
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildMomentumOutreachPlan(
  tempMemory: any,
  opts?: { sameStateOutreachCount7d?: number },
): MomentumOutreachPlan | null {
  const momentum = readMomentumState(tempMemory);
  const state = momentum.current_state;
  const metrics = momentum.metrics ?? {};
  const sameStateOutreachCount7d = Math.max(
    0,
    Math.floor(Number(opts?.sameStateOutreachCount7d ?? 0)),
  );
  const topBlocker = getTopMomentumBlocker(momentum);
  const blockerLines = summarizeMomentumBlockersForPrompt(momentum, 2);
  const blockerGrounding = blockerLines.length > 0
    ? `\nknown_blockers:\n- ${blockerLines.join("\n- ")}`
    : "";

  if (state === "friction_legere") {
    if (topBlocker?.status === "active" && topBlocker.stage === "chronic") {
      return {
        state,
        event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
        fallback_text:
          `Sur "${topBlocker.action_title}", on retombe souvent sur le meme frein. Le plus utile serait de clarifier ensemble la meilleure version ici, puis que tu l'ajustes dans le dashboard si on la valide.`,
        instruction:
          "Message WhatsApp court, naturel, utile. Tu ne fais pas un bilan global. Tu ne reposes pas la question du blocage si on connait deja le frein. Tu nommes sobrement que le blocage revient souvent sur cette action, puis tu proposes de clarifier ici la version la plus realiste AVANT redirection dashboard. Rappel fort: dans le chat, Sophia peut seulement comprendre, clarifier et tracker le progres. Elle ne cree pas, ne modifie pas et ne breakdown pas une action dans le chat. Si un changement d'action est necessaire, il doit etre fait par le user dans le dashboard apres clarification.",
        event_grounding: buildMomentumGrounding(state, metrics) + blockerGrounding,
        strategy: "prepare_dashboard_redirect",
      };
    }
    if (topBlocker?.status === "active") {
      return {
        state,
        event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
        fallback_text:
          `Sur "${topBlocker.action_title}", j'ai l'impression que le vrai frein tourne surtout autour de ${topBlocker.current_category}. C'est toujours ca, ou il y a autre chose a clarifier avant d'ajuster dans le dashboard ?`,
        instruction:
          "Message WhatsApp court, naturel, utile. Tu ne fais pas un bilan global et tu ne demandes jamais 'tu l'as fait ?'. Tu reutilises le blocker deja connu au lieu de redemander la question de zero. Une seule question max: verifier si ce frein est toujours le bon ou s'il faut clarifier autre chose. Si un ajustement d'action semble necessaire, tu prepares la clarification puis tu orientes vers le dashboard. Rappel fort: dans le chat, Sophia peut seulement comprendre, clarifier et tracker le progres. Elle ne cree pas, ne modifie pas et ne breakdown pas une action dans le chat.",
        event_grounding: buildMomentumGrounding(state, metrics) + blockerGrounding,
        strategy: "confirm_known_blocker",
      };
    }
    if (sameStateOutreachCount7d >= 1) {
      return {
        state,
        event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
        fallback_text:
          "Si ca coince encore, le plus utile est peut-etre qu'on clarifie ici ce qui rend l'action trop dure, puis que tu ajustes ensuite dans le dashboard plutot que de refaire un point identique.",
        instruction:
          "Message WhatsApp court, naturel, utile. Tu ne fais pas un bilan global. Tu ne reposes pas la question generique du blocage une deuxieme fois si elle a deja ete posee recemment sans nouvel element. Tu proposes plutot de clarifier ce qui rend l'action irrealisable, puis d'aller faire l'ajustement dans le dashboard si besoin. Rappel fort: dans le chat, Sophia peut seulement comprendre, clarifier et tracker le progres. Elle ne cree pas, ne modifie pas et ne breakdown pas une action dans le chat.",
        event_grounding: buildMomentumGrounding(state, metrics) + blockerGrounding,
        strategy: "prepare_dashboard_redirect",
      };
    }
    return {
      state,
      event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.friction_legere,
      fallback_text:
        "J'ai l'impression qu'il y a surtout un petit frein concret en ce moment. Le vrai blocage, ce serait plutot le temps, l'energie, l'oubli ou le cote flou ?",
      instruction:
        "Message WhatsApp court, naturel, utile. Tu ne fais pas un bilan global et tu ne demandes jamais 'tu l'as fait ?'. Tu aides a identifier le vrai frein concret du moment (temps, energie, oubli, clarte, taille de l'action). Une seule question max. Pas de culpabilisation. Si utile, la question peut preparer une future redirection dashboard, mais rappelle implicitement que le chat ne modifie pas l'action lui-meme.",
      event_grounding: buildMomentumGrounding(state, metrics) + blockerGrounding,
      strategy: "diagnose_blocker",
    };
  }

  if (state === "evitement") {
    return {
      state,
      event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.evitement,
      fallback_text:
        "J'ai l'impression que le format actuel ne t'aide peut-etre pas trop en ce moment. Tu preferes qu'on simplifie, qu'on change d'angle, ou qu'on mette un peu en pause ?",
      instruction:
        "Message tres leger, meta, sans pression. Tu peux nommer avec tact que le format actuel n'aide peut-etre pas beaucoup. Tu proposes une sortie simple: alleger, changer de format, ou mettre en pause. Une seule question max. Jamais de culpabilisation, jamais de rappel d'echec.",
      event_grounding: buildMomentumGrounding(state, metrics) + blockerGrounding,
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
        "Message de soutien uniquement. Aucune accountability, aucune logique de performance, aucun plan correctif. Tu accueilles la charge du moment avec douceur et tu laisses une porte simple pour repondre. Une seule question max, tres douce. Pas dramatique, pas clinique.",
      event_grounding: buildMomentumGrounding(state, metrics) + blockerGrounding,
      strategy: "support",
    };
  }

  if (state === "reactivation") {
    return {
      state,
      event_context: MOMENTUM_OUTREACH_EVENT_CONTEXTS.reactivation,
      fallback_text:
        "Je repasse juste te laisser une porte ouverte. Si tu veux reprendre le fil a ton rythme, je suis la.",
      instruction:
        "Message porte ouverte, tres leger. Tu n'evoques ni l'absence, ni le retard, ni l'echec. Pas de culpabilisation, pas de pression. Le but est juste de rouvrir le lien avec une invitation simple a reprendre si la personne en a envie.",
      event_grounding: buildMomentumGrounding(state, metrics) + blockerGrounding,
      strategy: "reopen",
    };
  }

  return null;
}

export function listMomentumOutreachEventContexts(): string[] {
  return Object.values(MOMENTUM_OUTREACH_EVENT_CONTEXTS);
}

export function isMomentumOutreachEventContext(eventContext: string): boolean {
  return listMomentumOutreachEventContexts().includes(String(eventContext ?? "").trim());
}

export function getMomentumOutreachStateFromEventContext(
  eventContext: string,
): MomentumOutreachState | null {
  const normalized = String(eventContext ?? "").trim();
  const entry = Object.entries(MOMENTUM_OUTREACH_EVENT_CONTEXTS).find(([, value]) =>
    value === normalized
  );
  return (entry?.[0] as MomentumOutreachState | undefined) ?? null;
}

export async function scheduleMomentumOutreach(args: {
  admin: SupabaseClient;
  userId: string;
  tempMemory: any;
  nowIso?: string;
  delayMinutes?: number;
}): Promise<MomentumOutreachDecision> {
  const nowIso = String(args.nowIso ?? new Date().toISOString());
  const nowMs = new Date(nowIso).getTime();
  const plan = buildMomentumOutreachPlan(args.tempMemory);
  const state = readMomentumState(args.tempMemory).current_state;

  if (!plan) {
    return {
      decision: "skip",
      state,
      reason: `momentum_outreach_not_applicable:${state ?? "unknown"}`,
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

  const rows = Array.isArray(recentRows) ? recentRows as Array<Record<string, unknown>> : [];
  const sameEventRows = rows.filter((row) =>
    String(row?.event_context ?? "") === plan.event_context
  );
  const planWithHistory = buildMomentumOutreachPlan(args.tempMemory, {
    sameStateOutreachCount7d: sameEventRows.length,
  }) ?? plan;
  const futurePending = rows.find((row) => {
    const status = String(row?.status ?? "");
    const scheduledFor = new Date(String(row?.scheduled_for ?? "")).getTime();
    return FUTURE_PENDING_STATUSES.includes(status) && Number.isFinite(scheduledFor) &&
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
    const lastScheduledMs = new Date(String(latestSameEvent?.scheduled_for ?? "")).getTime();
    const minGapMs = policy.min_gap_hours * 60 * 60 * 1000;
    if (Number.isFinite(lastScheduledMs) && nowMs - lastScheduledMs < minGapMs) {
      return {
        decision: "skip",
        state: plan.state,
        event_context: planWithHistory.event_context,
        reason: `momentum_outreach_min_gap:${plan.state}`,
      };
    }
  }

  const delayMinutes = Math.max(0, Math.min(30, Math.floor(Number(args.delayMinutes ?? 5))));
  const scheduledForIso = new Date(nowMs + delayMinutes * 60 * 1000).toISOString();
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
        momentum_state: planWithHistory.state,
        momentum_strategy: planWithHistory.strategy,
        instruction: planWithHistory.instruction,
        event_grounding: planWithHistory.event_grounding,
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
    reason: `momentum_outreach_scheduled:${planWithHistory.state}:${planWithHistory.strategy}`,
    scheduled_checkin_id: String((inserted as any)?.id ?? "").trim() || undefined,
    scheduled_for: String((inserted as any)?.scheduled_for ?? scheduledForIso),
  };
}
