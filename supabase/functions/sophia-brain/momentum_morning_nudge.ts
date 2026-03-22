import { getMomentumPolicyDefinition } from "./momentum_policy.ts";
import {
  getTopMomentumBlocker,
  readMomentumState,
  summarizeMomentumBlockersForPrompt,
  type MomentumMetrics,
  type MomentumStateLabel,
} from "./momentum_state.ts";

export const MORNING_ACTIVE_ACTIONS_EVENT_CONTEXT = "morning_active_actions_nudge";

export type MomentumMorningStrategy =
  | "generic_focus"
  | "focus_today"
  | "simplify_today"
  | "light_touch_today"
  | "support_softly"
  | "open_door_morning";

export interface MorningNudgePayloadSnapshot {
  slot_day_offset: number | null;
  slot_weekday: string | null;
  today_action_titles: string[];
  today_framework_titles: string[];
  today_vital_sign_titles: string[];
  today_item_titles: string[];
  active_action_titles: string[];
  active_framework_titles: string[];
  active_vital_sign_titles: string[];
  active_item_titles: string[];
  plan_deep_why?: string | null;
  plan_blockers?: string | null;
  plan_low_motivation_message?: string | null;
}

export interface MomentumMorningPlan {
  decision: "send" | "skip";
  reason: string;
  state: MomentumStateLabel | null;
  strategy: MomentumMorningStrategy | null;
  relevance: "high" | "medium" | "low" | "blocked";
  instruction?: string;
  event_grounding?: string;
  fallback_text?: string;
}

function cleanText(v: unknown): string {
  return String(v ?? "").trim();
}

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => cleanText(item)).filter(Boolean))];
}

function normalizeTitle(title: string): string {
  return cleanText(title).toLowerCase();
}

function formatMetricLine(label: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const text = cleanText(value);
  return text ? `${label}: ${text}` : null;
}

function listToText(items: string[], fallback: string): string {
  const clean = uniq(items);
  if (clean.length === 0) return fallback;
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} et ${clean[clean.length - 1]}`;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniq(value.map((item) => cleanText(item))) : [];
}

export function parseMorningNudgePayload(payload: unknown): MorningNudgePayloadSnapshot {
  const row = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    slot_day_offset: Number.isFinite(Number(row.slot_day_offset))
      ? Math.max(0, Math.floor(Number(row.slot_day_offset)))
      : null,
    slot_weekday: cleanText(row.slot_weekday) || null,
    today_action_titles: parseStringArray(row.today_action_titles),
    today_framework_titles: parseStringArray(row.today_framework_titles),
    today_vital_sign_titles: parseStringArray(row.today_vital_sign_titles),
    today_item_titles: parseStringArray(row.today_item_titles),
    active_action_titles: parseStringArray(row.active_action_titles),
    active_framework_titles: parseStringArray(row.active_framework_titles),
    active_vital_sign_titles: parseStringArray(row.active_vital_sign_titles),
    active_item_titles: parseStringArray(row.active_item_titles),
    plan_deep_why: cleanText(row.plan_deep_why) || null,
    plan_blockers: cleanText(row.plan_blockers) || null,
    plan_low_motivation_message: cleanText(row.plan_low_motivation_message) || null,
  };
}

function buildGrounding(args: {
  state: MomentumStateLabel | null;
  strategy: MomentumMorningStrategy;
  metrics: MomentumMetrics;
  payload: MorningNudgePayloadSnapshot;
  topBlockerSummary: string | null;
}): string {
  const primaryItems = args.payload.today_item_titles.length > 0
    ? args.payload.today_item_titles
    : args.payload.active_item_titles;
  const lines = [
    `event=morning_momentum_nudge`,
    `state=${args.state ?? "missing"}`,
    `strategy=${args.strategy}`,
    formatMetricLine("days_since_last_user_message", args.metrics.days_since_last_user_message),
    formatMetricLine("completed_actions_7d", args.metrics.completed_actions_7d),
    formatMetricLine("missed_actions_7d", args.metrics.missed_actions_7d),
    formatMetricLine("partial_actions_7d", args.metrics.partial_actions_7d),
    formatMetricLine("emotional_high_72h", args.metrics.emotional_high_72h),
    formatMetricLine("consent_explicit_stops_7d", args.metrics.consent_explicit_stops_7d),
    primaryItems.length > 0 ? `today_items=${primaryItems.join(" | ")}` : null,
    args.payload.active_item_titles.length > 0
      ? `active_items=${args.payload.active_item_titles.join(" | ")}`
      : null,
    args.topBlockerSummary ? `top_blocker=${args.topBlockerSummary}` : null,
    args.payload.plan_deep_why ? `deep_why=${args.payload.plan_deep_why}` : null,
    args.payload.plan_low_motivation_message
      ? `low_motivation_message=${args.payload.plan_low_motivation_message}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function sameTitle(a: string, b: string): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}

export function buildMomentumMorningPlan(args: {
  tempMemory: any;
  payload: unknown;
}): MomentumMorningPlan {
  const momentum = readMomentumState(args.tempMemory);
  const state = momentum.current_state ?? null;
  const payload = parseMorningNudgePayload(args.payload);
  const metrics = momentum.metrics ?? {};
  const primaryItems = payload.today_item_titles.length > 0
    ? payload.today_item_titles
    : payload.active_item_titles;
  const topBlocker = getTopMomentumBlocker(momentum);
  const blockerPrompt = summarizeMomentumBlockersForPrompt(momentum, 1)[0] ?? null;
  const blockerHitsToday = Boolean(
    topBlocker &&
      primaryItems.some((item) => sameTitle(item, topBlocker.action_title)),
  );

  if (primaryItems.length === 0) {
    return {
      decision: "skip",
      reason: "momentum_morning_nudge_no_items",
      state,
      strategy: null,
      relevance: "blocked",
    };
  }

  if (state === "pause_consentie") {
    return {
      decision: "skip",
      reason: "momentum_morning_nudge_pause_consentie",
      state,
      strategy: null,
      relevance: "blocked",
    };
  }

  if (state) {
    const policy = getMomentumPolicyDefinition(state);
    if (policy.proactive_policy === "none" || policy.max_proactive_per_7d <= 0) {
      return {
        decision: "skip",
        reason: `momentum_morning_nudge_blocked:${state}:no_proactive`,
        state,
        strategy: null,
        relevance: "blocked",
      };
    }
  }

  if (state === "soutien_emotionnel" || Number(metrics.emotional_high_72h ?? 0) > 0) {
    const strategy: MomentumMorningStrategy = "support_softly";
    return {
      decision: "send",
      reason: state === "soutien_emotionnel"
        ? "momentum_morning_nudge_support:soutien_emotionnel"
        : "momentum_morning_nudge_support:recent_high_emotion",
      state,
      strategy,
      relevance: "medium",
      fallback_text:
        "Je te laisse juste un message doux ce matin. Pas besoin de performer quoi que ce soit la tout de suite, tu peux deja prendre soin de toi aujourd'hui.",
      instruction:
        "Message WhatsApp du matin, tres court, tres doux. Tu n'es PAS dans un nudge d'actions. Tu n'insistes sur aucune action du jour. Tu reconnais sobrement que le contexte recent peut demander de la douceur, puis tu laisses une ouverture simple et non pressante. Aucune accountability, aucune culpabilisation, aucune logique de performance.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerPrompt,
      }),
    };
  }

  if (state === "reactivation") {
    const strategy: MomentumMorningStrategy = "open_door_morning";
    return {
      decision: "send",
      reason: "momentum_morning_nudge_open_door",
      state,
      strategy,
      relevance: "low",
      fallback_text:
        "Je passe juste te laisser un point d'appui tres simple pour aujourd'hui. Si tu veux reprendre un petit cap a ton rythme, je suis la.",
      instruction:
        "Message WhatsApp du matin, tres leger, porte ouverte. Tu n'evoques ni absence, ni retard, ni echec. Tu peux mentionner un cap simple pour aujourd'hui, mais sans pression et sans ton de pilotage. Une seule question max, optionnelle.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerPrompt,
      }),
    };
  }

  if (state === "evitement") {
    const strategy: MomentumMorningStrategy = "light_touch_today";
    return {
      decision: "send",
      reason: "momentum_morning_nudge_light_touch",
      state,
      strategy,
      relevance: "low",
      fallback_text:
        `Ce matin, garde juste un cap tres simple si tu peux: ${listToText(primaryItems, "un pas leger")}. L'idee, c'est juste de te laisser une version tres faisable aujourd'hui.`,
      instruction:
        "Message WhatsApp du matin, tres basse pression. Tu peux mentionner les items du jour, mais comme un cap leger et non comme une exigence. Pas de culpabilisation, pas de 'n'oublie pas', pas de ton de suivi. Une seule question max, tres douce, ou aucune question si le message fonctionne sans.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerPrompt,
      }),
    };
  }

  if (state === "friction_legere") {
    const strategy: MomentumMorningStrategy = "simplify_today";
    const blockerHint = blockerHitsToday && topBlocker
      ? `Sur "${topBlocker.action_title}", le frein recent tourne plutot autour de ${topBlocker.current_category}.`
      : blockerPrompt;
    return {
      decision: "send",
      reason: blockerHitsToday
        ? "momentum_morning_nudge_simplify:blocker_today"
        : "momentum_morning_nudge_simplify:generic",
      state,
      strategy,
      relevance: "high",
      fallback_text: blockerHitsToday && topBlocker
        ? `Ce matin, pas besoin de tout porter d'un coup. Si "${topBlocker.action_title}" coince encore, vise juste sa version la plus simple aujourd'hui.`
        : `Ce matin, le plus utile c'est peut-etre de garder ${listToText(primaryItems, "un cap simple")} en version tres faisable plutot que parfaite.`,
      instruction:
        "Message WhatsApp du matin, court et utile. Tu tiens compte de la friction recente. Si un blocker connu touche un item du jour, tu peux le nommer sobrement et encourager une version plus simple ou plus legere aujourd'hui. Tu ne demandes jamais 'tu l'as fait ?' et tu ne parles pas de modifier l'action. Tu aides juste a viser faisable aujourd'hui.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerHint ?? blockerPrompt,
      }),
    };
  }

  if (state === "momentum") {
    const strategy: MomentumMorningStrategy = "focus_today";
    return {
      decision: "send",
      reason: "momentum_morning_nudge_focus_today",
      state,
      strategy,
      relevance: "high",
      fallback_text:
        `Ce matin, ton cap du jour peut rester tres simple: ${listToText(primaryItems, "un pas concret")}. C'est deja une vraie facon d'avancer dans le bon sens.`,
      instruction:
        "Message WhatsApp du matin, energisant mais sobre. Tu aides la personne a entrer dans sa journee avec un cap clair sur les items du jour. Tu peux rappeler pourquoi c'est important pour elle, a partir du deep why si present, puis finir sur une phrase d'elan. Pas de pression inutile, pas de bilan, pas de culpabilisation.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerPrompt,
      }),
    };
  }

  const strategy: MomentumMorningStrategy = "generic_focus";
  return {
    decision: "send",
    reason: "momentum_morning_nudge_generic_fallback",
    state,
    strategy,
    relevance: "medium",
    fallback_text:
      `Ce matin, tu peux juste garder en tete ${listToText(primaryItems, "un petit pas concret")} pour donner une bonne direction a ta journee.`,
    instruction:
      "Message WhatsApp du matin, simple, chaleureux, oriente cap du jour. Tu cites les items du jour sans ton mecanique. Tu aides a demarrer la journee sans pression. Une seule question max.",
    event_grounding: buildGrounding({
      state,
      strategy,
      metrics,
      payload,
      topBlockerSummary: blockerPrompt,
    }),
  };
}
