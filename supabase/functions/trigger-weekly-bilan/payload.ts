import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
    import { generateWithGemini } from "../_shared/gemini.ts";
import {
  getTopMomentumBlocker,
  readMomentumState,
  summarizeMomentumBlockersForPrompt,
} from "../sophia-brain/momentum_state.ts";
import { readCoachingInterventionMemory } from "../sophia-brain/coaching_intervention_tracking.ts";
import type { CoachingInterventionOutcome } from "../sophia-brain/coaching_intervention_selector.ts";

export type ActionWeekSummary = {
  id: string;
  title: string;
  source: "plan" | "personal";
  target_reps: number;
  week_reps: number;
  completed_count: number;
  missed_count: number;
};

export type WeeklyPlanActionSnapshot = {
  plan_action_id: string;
  title: string;
  type: "habitude" | "mission" | "framework" | "unknown";
  quest_type: "main" | "side" | "unknown";
  phase_index: number;
  phase_title: string;
  phase_status: string;
  target_reps: number | null;
  current_reps: number | null;
  tracking_type: string | null;
  time_of_day: string | null;
  db_status: string | null;
  is_current_phase: boolean;
  is_next_phase: boolean;
  week_reps: number;
  missed_count: number;
};

export type WeeklySuggestionDecision = {
  action_title: string;
  action_type: WeeklyPlanActionSnapshot["type"];
  phase_scope: "current" | "next";
  recommendation: "keep_active" | "activate" | "deactivate" | "wait";
  reason: string;
  confidence: "low" | "medium" | "high";
  related_action_title?: string | null;
};

export type WeeklySuggestionState = {
  readiness: "hold" | "steady" | "expand";
  should_activate_next_phase: boolean;
  summary: string;
  suggestions: WeeklySuggestionDecision[];
};

export type WeeklyBlockerSnapshot = {
  action_title: string;
  category: string;
  stage: "new" | "recurrent" | "chronic";
  status: "active" | "cooling" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  mention_count_21d: number;
  reason_excerpt: string | null;
};

export type WeeklyBlockerState = {
  active_blockers_count: number;
  chronic_blockers_count: number;
  top_blocker_action: string | null;
  top_blocker_category: string | null;
  top_blocker_stage: "new" | "recurrent" | "chronic" | null;
  top_blocker_status: "active" | "cooling" | "resolved" | null;
  blocker_summary: string | null;
  blockers: WeeklyBlockerSnapshot[];
};

export type WeeklyCoachingInterventionSnapshot = {
  technique_id: string;
  blocker_type: string | null;
  outcome: CoachingInterventionOutcome;
  target_action_title: string | null;
  helpful: boolean | null;
  last_used_at: string | null;
};

export type WeeklyCoachingInterventionState = {
  proposed_count_7d: number;
  resolved_count_7d: number;
  helpful_count_7d: number;
  not_helpful_count_7d: number;
  behavior_change_count_7d: number;
  pending_technique_id: string | null;
  pending_blocker_type: string | null;
  top_helpful_technique: string | null;
  top_unhelpful_technique: string | null;
  recommendation: "none" | "keep_best" | "switch_technique" | "keep_testing";
  summary: string | null;
  recent_resolved: WeeklyCoachingInterventionSnapshot[];
};

export interface WeeklyReviewPayload {
  execution: {
    rate_pct: number;
    total: number;
    completed: number;
    top_action: string | null;
    blocker_action: string | null;
    details: ActionWeekSummary[];
  };
  etoile_polaire: {
    title: string;
    unit: string;
    start: number;
    current: number;
    target: number;
    delta_week: number;
    progression_pct: number;
  } | null;
  action_load: {
    active_count: number;
    verdict: "low" | "balanced" | "high";
    titles: string[];
  };
  previous_recap: {
    decisions: string[];
    coach_note: string | null;
  } | null;
  plan_window: {
    current_phase_index: number | null;
    current_phase_title: string | null;
    next_phase_index: number | null;
    next_phase_title: string | null;
    current_actions: WeeklyPlanActionSnapshot[];
    next_actions: WeeklyPlanActionSnapshot[];
    active_action_titles: string[];
  };
  suggestion_state: WeeklySuggestionState;
  blocker_state: WeeklyBlockerState;
  coaching_intervention_state: WeeklyCoachingInterventionState;
  week_iso: string;
  week_start: string;
}

export function buildWeeklyBlockerState(tempMemory: any): WeeklyBlockerState {
  const momentum = readMomentumState(tempMemory);
  const top = getTopMomentumBlocker(momentum);
  const blockers = (momentum.blocker_memory.actions ?? []).slice(0, 4).map((item) => ({
    action_title: item.action_title,
    category: item.current_category,
    stage: item.stage,
    status: item.status,
    first_seen_at: item.first_seen_at,
    last_seen_at: item.last_seen_at,
    mention_count_21d: item.mention_count_21d,
    reason_excerpt: item.last_reason_excerpt ?? null,
  }));
  const summaryLines = summarizeMomentumBlockersForPrompt(momentum, 3);
  return {
    active_blockers_count: momentum.metrics.active_blockers_count ?? 0,
    chronic_blockers_count: momentum.metrics.chronic_blockers_count ?? 0,
    top_blocker_action: top?.action_title ?? null,
    top_blocker_category: top?.current_category ?? null,
    top_blocker_stage: top?.stage ?? null,
    top_blocker_status: top?.status ?? null,
    blocker_summary: summaryLines.length > 0 ? summaryLines.join(" || ") : null,
    blockers,
  };
}

function countTechniqueOutcomes(
  rows: Array<{ technique_id: string; outcome: CoachingInterventionOutcome }>,
  targetOutcomes: CoachingInterventionOutcome[],
): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!targetOutcomes.includes(row.outcome)) continue;
    counts.set(row.technique_id, (counts.get(row.technique_id) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

export function buildWeeklyCoachingInterventionState(
  tempMemory: any,
): WeeklyCoachingInterventionState {
  const memory = readCoachingInterventionMemory(tempMemory);
  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentHistory = memory.history.filter((item) => {
    const ts = new Date(String(item.resolved_at ?? item.proposed_at ?? "")).getTime();
    return Number.isFinite(ts) && nowMs - ts <= sevenDaysMs;
  });
  const resolved = recentHistory.filter((item) => item.status === "resolved");
  const helpfulCount = resolved.filter((item) =>
    item.outcome === "tried_helpful" || item.outcome === "behavior_changed"
  ).length;
  const notHelpfulCount = resolved.filter((item) =>
    item.outcome === "tried_not_helpful"
  ).length;
  const behaviorChangeCount = resolved.filter((item) =>
    item.outcome === "behavior_changed"
  ).length;
  const topHelpfulTechnique = countTechniqueOutcomes(
    resolved.map((item) => ({
      technique_id: item.technique_id,
      outcome: item.outcome,
    })),
    ["tried_helpful", "behavior_changed"],
  );
  const topUnhelpfulTechnique = countTechniqueOutcomes(
    resolved.map((item) => ({
      technique_id: item.technique_id,
      outcome: item.outcome,
    })),
    ["tried_not_helpful"],
  );

  let recommendation: WeeklyCoachingInterventionState["recommendation"] = "none";
  let summary: string | null = null;
  if (memory.pending) {
    recommendation = "keep_testing";
    summary = `Une technique est encore en cours de test: ${memory.pending.technique_id}.`;
  } else if (helpfulCount > 0 && notHelpfulCount === 0 && topHelpfulTechnique) {
    recommendation = "keep_best";
    summary =
      `La technique ${topHelpfulTechnique} semble utile cette semaine. On peut la garder comme reflexe prioritaire.`;
  } else if (notHelpfulCount > 0 && helpfulCount === 0 && topUnhelpfulTechnique) {
    recommendation = "switch_technique";
    summary =
      `La technique ${topUnhelpfulTechnique} n'a pas assez aide. Mieux vaut changer d'approche sur le prochain blocage.`;
  } else if (helpfulCount > 0 || notHelpfulCount > 0) {
    recommendation = "keep_testing";
    summary =
      "Les essais de techniques coach sont mitiges cette semaine. On garde ce qui aide et on change ce qui ne prend pas.";
  }

  return {
    proposed_count_7d: recentHistory.length,
    resolved_count_7d: resolved.length,
    helpful_count_7d: helpfulCount,
    not_helpful_count_7d: notHelpfulCount,
    behavior_change_count_7d: behaviorChangeCount,
    pending_technique_id: memory.pending?.technique_id ?? null,
    pending_blocker_type: memory.pending?.blocker_type ?? null,
    top_helpful_technique: topHelpfulTechnique,
    top_unhelpful_technique: topUnhelpfulTechnique,
    recommendation,
    summary,
    recent_resolved: resolved.slice(-3).map((item) => ({
      technique_id: item.technique_id,
      blocker_type: item.blocker_type ?? null,
      outcome: item.outcome,
      target_action_title: item.target_action_title ?? null,
      helpful: item.helpful ?? null,
      last_used_at: item.resolved_at ?? item.proposed_at ?? null,
    })),
  };
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
  const dt = new Date(Date.UTC((y ?? 1970), (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoWeekStartYmdInTz(d: Date, timeZone: string): string {
  const ymd = ymdInTz(d, timeZone);
  const [y, m, dd] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, dd ?? 1));
  const isoDayIndex = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - isoDayIndex);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const ddd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${ddd}`;
}

function isoWeekLabelFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const year = dt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function parseNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseHistoryValue(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") return null;
  const value = parseNumber((entry as any).value, NaN);
  return Number.isFinite(value) ? value : null;
}

function computeProgressionPct(start: number, current: number, target: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(current) || !Number.isFinite(target)) {
    return 0;
  }
  if (target === start) return current >= target ? 100 : 0;
  const pct = ((current - start) / (target - start)) * 100;
  return Math.max(-100, Math.min(300, Math.round(pct)));
}

function safeJsonParse(raw: unknown): any {
  const text = String(raw ?? "")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeActionType(v: unknown): WeeklyPlanActionSnapshot["type"] {
  const raw = String(v ?? "").toLowerCase().trim();
  if (raw === "habit" || raw === "habitude") return "habitude";
  if (raw === "mission") return "mission";
  if (raw === "framework") return "framework";
  return "unknown";
}

function normalizeQuestType(v: unknown): WeeklyPlanActionSnapshot["quest_type"] {
  const raw = String(v ?? "").toLowerCase().trim();
  if (raw === "main" || raw === "side") return raw;
  return "unknown";
}

function normalizeStatus(v: unknown): string | null {
  const raw = String(v ?? "").toLowerCase().trim();
  return raw || null;
}

function normalizedFamilyTokens(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b\d+(?:[.,]\d+)?\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) =>
      token.length >= 3 &&
      ![
        "les",
        "des",
        "une",
        "dans",
        "pour",
        "avec",
        "sur",
        "sans",
        "par",
        "min",
        "mins",
      ].includes(token)
    );
}

function overlapScore(a: string, b: string): number {
  const left = new Set(normalizedFamilyTokens(a));
  const right = new Set(normalizedFamilyTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let inter = 0;
  for (const token of left) {
    if (right.has(token)) inter += 1;
  }
  return inter / Math.max(left.size, right.size);
}

function findWeekSummary(
  details: ActionWeekSummary[],
  title: string,
): ActionWeekSummary | null {
  const normalized = String(title ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return details.find((row) => String(row.title ?? "").trim().toLowerCase() === normalized) ?? null;
}

function findRelatedCurrentHabit(
  currentActions: WeeklyPlanActionSnapshot[],
  candidate: WeeklyPlanActionSnapshot,
): WeeklyPlanActionSnapshot | null {
  if (candidate.type !== "habitude") return null;
  let best: WeeklyPlanActionSnapshot | null = null;
  let bestScore = 0;
  for (const current of currentActions) {
    if (current.type !== "habitude") continue;
    const score = overlapScore(current.title, candidate.title);
    if (score > bestScore) {
      best = current;
      bestScore = score;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

function parseSuggestionDecision(raw: any): WeeklySuggestionDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const recommendationRaw = String(raw.recommendation ?? "").trim();
  const recommendation = recommendationRaw === "activate" || recommendationRaw === "deactivate" ||
      recommendationRaw === "wait" || recommendationRaw === "keep_active"
    ? recommendationRaw
    : null;
  const phaseScopeRaw = String(raw.phase_scope ?? "").trim();
  const phaseScope = phaseScopeRaw === "current" || phaseScopeRaw === "next" ? phaseScopeRaw : null;
  const confidenceRaw = String(raw.confidence ?? "").trim();
  const confidence = confidenceRaw === "low" || confidenceRaw === "high" ? confidenceRaw : "medium";
  const actionTitle = String(raw.action_title ?? "").trim();
  const reason = String(raw.reason ?? "").trim();
  if (!recommendation || !phaseScope || !actionTitle || !reason) return null;
  return {
    action_title: actionTitle,
    action_type: normalizeActionType(raw.action_type),
    phase_scope: phaseScope,
    recommendation,
    reason: reason.slice(0, 220),
    confidence,
    related_action_title: String(raw.related_action_title ?? "").trim() || null,
  };
}

function buildSnapshotStatusMap(
  snapshots: WeeklyPlanActionSnapshot[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of snapshots) {
    const title = String(row?.title ?? "").trim().toLowerCase();
    const status = String(row?.db_status ?? "").trim().toLowerCase();
    if (!title || !status) continue;
    out.set(title, status);
  }
  return out;
}

function normalizeSuggestedActionRecommendation(params: {
  suggestion: WeeklySuggestionDecision;
  statusByTitle: Map<string, string>;
}): WeeklySuggestionDecision {
  const { suggestion, statusByTitle } = params;
  const normalizedTitle = String(suggestion.action_title ?? "").trim().toLowerCase();
  const dbStatus = normalizedTitle ? statusByTitle.get(normalizedTitle) ?? null : null;

  if (suggestion.recommendation === "activate" && (dbStatus === "active" || dbStatus === "completed" || dbStatus === "deactivated")) {
    return {
      ...suggestion,
      recommendation: dbStatus === "active" ? "keep_active" : "wait",
      reason: dbStatus === "active"
        ? "Cette action est deja active dans le plan actuel."
        : dbStatus === "completed"
        ? "Cette action est deja realisee dans le plan, inutile de la reactiver."
        : "Cette action a ete desactivee manuellement, on ne la repropose pas automatiquement.",
      related_action_title: suggestion.related_action_title ?? null,
    };
  }

  if (suggestion.recommendation === "deactivate" && dbStatus !== "active") {
    return {
      ...suggestion,
      recommendation: dbStatus === "completed" ? "wait" : "keep_active",
      reason: dbStatus === "completed"
        ? "Cette action est deja realisee, il n'y a rien a mettre en pause."
        : dbStatus === "deactivated"
        ? "Cette action est deja desactivee, il n'y a rien a mettre en pause."
        : "Cette action n'est pas active actuellement, donc elle ne peut pas etre mise en pause.",
      related_action_title: suggestion.related_action_title ?? null,
    };
  }

  return suggestion;
}

function normalizeDecisionReason(reason: string, fallback: string): string {
  const text = String(reason ?? "").trim();
  return (text || fallback).slice(0, 220);
}

function isStrongBlockerPressure(params: {
  blockerState: WeeklyBlockerState;
  execution: WeeklyReviewPayload["execution"];
  currentActions: WeeklyPlanActionSnapshot[];
}): boolean {
  const blocker = params.blockerState;
  const topAction = String(blocker.top_blocker_action ?? "").trim().toLowerCase();
  const topOnCurrentAction = Boolean(
    topAction &&
      params.currentActions.some((item) => String(item.title ?? "").trim().toLowerCase() === topAction),
  );
  if (blocker.chronic_blockers_count > 0 && topOnCurrentAction) return true;
  if (
    blocker.top_blocker_status === "active" &&
    blocker.top_blocker_stage === "recurrent" &&
    topOnCurrentAction &&
    params.execution.completed <= 2
  ) return true;
  if (blocker.active_blockers_count >= 2 && params.execution.rate_pct < 70) return true;
  return false;
}

export function applyBlockerPolicyToSuggestionState(params: {
  suggestionState: WeeklySuggestionState;
  blockerState: WeeklyBlockerState;
  execution: WeeklyReviewPayload["execution"];
  currentActions: WeeklyPlanActionSnapshot[];
}): WeeklySuggestionState {
  const { suggestionState, blockerState, execution, currentActions } = params;
  if (
    blockerState.active_blockers_count <= 0 &&
    blockerState.chronic_blockers_count <= 0
  ) {
    return suggestionState;
  }

  const topBlockerAction = String(blockerState.top_blocker_action ?? "").trim();
  const topBlockerCategory = String(blockerState.top_blocker_category ?? "").trim();
  const topBlockerStage = String(blockerState.top_blocker_stage ?? "").trim();
  const topActionLower = topBlockerAction.toLowerCase();
  const currentTitles = new Set(
    currentActions.map((item) => String(item.title ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const topOnCurrentAction = topActionLower ? currentTitles.has(topActionLower) : false;
  const strongPressure = isStrongBlockerPressure({
    blockerState,
    execution,
    currentActions,
  });

  const adjustedSuggestions = suggestionState.suggestions.map((item) => {
    if (
      strongPressure &&
      item.phase_scope === "next" &&
      item.recommendation === "activate"
    ) {
      return {
        ...item,
        recommendation: "wait" as const,
        confidence: "high" as const,
        reason: normalizeDecisionReason(
          item.reason,
          topBlockerAction
            ? `Le blocage ${topBlockerStage || "actif"} sur "${topBlockerAction}" suggere de consolider avant d'ouvrir une nouvelle action.`
            : "Les blocages actifs de la semaine appellent d'abord a consolider avant d'ouvrir une nouvelle action.",
        ),
      };
    }
    if (
      strongPressure &&
      item.recommendation === "deactivate" &&
      item.related_action_title &&
      topOnCurrentAction
    ) {
      return {
        ...item,
        recommendation: "keep_active" as const,
        confidence: "high" as const,
        reason: normalizeDecisionReason(
          item.reason,
          topBlockerAction
            ? `On evite un remplacement trop vite tant que "${topBlockerAction}" bloque encore de maniere ${topBlockerStage || "active"}.`
            : "On evite un remplacement trop vite tant que le blocage principal n'est pas stabilise.",
        ),
      };
    }
    return item;
  });

  const summaryPrefix = topBlockerAction
    ? `Blocage ${topBlockerStage || "actif"} sur "${topBlockerAction}"${
      topBlockerCategory ? ` (${topBlockerCategory})` : ""
    }: `
    : "Blocages actifs cette semaine: ";

  return {
    ...suggestionState,
    readiness: strongPressure
      ? (execution.completed <= 0 ? "hold" : "steady")
      : suggestionState.readiness,
    should_activate_next_phase: strongPressure
      ? false
      : suggestionState.should_activate_next_phase,
    summary: strongPressure
      ? normalizeDecisionReason(
        `${summaryPrefix}on privilegie d'abord la consolidation et un ajustement realiste avant toute expansion.`,
        suggestionState.summary,
      )
      : suggestionState.summary,
    suggestions: adjustedSuggestions,
  };
}

export function normalizeSuggestionDecisionsForPlan(
  suggestions: WeeklySuggestionDecision[],
  snapshots: WeeklyPlanActionSnapshot[],
): WeeklySuggestionDecision[] {
  const statusByTitle = buildSnapshotStatusMap(snapshots);
  return (Array.isArray(suggestions) ? suggestions : []).map((item) =>
    normalizeSuggestedActionRecommendation({
      suggestion: item,
      statusByTitle,
    })
  );
}

function fallbackSuggestionState(params: {
  execution: WeeklyReviewPayload["execution"];
  currentActions: WeeklyPlanActionSnapshot[];
  nextActions: WeeklyPlanActionSnapshot[];
  blockerState: WeeklyBlockerState;
}): WeeklySuggestionState {
  const { execution, currentActions, nextActions, blockerState } = params;
  const hasZeroMomentum = execution.completed <= 0 || execution.rate_pct <= 0;
  const strongBlockers = isStrongBlockerPressure({
    blockerState,
    execution,
    currentActions,
  });
  const shouldActivateNext = !hasZeroMomentum && !strongBlockers &&
    execution.rate_pct >= 60 && execution.completed >= 2;
  const readiness: WeeklySuggestionState["readiness"] = hasZeroMomentum
    ? "hold"
    : strongBlockers
    ? "steady"
    : shouldActivateNext
    ? "expand"
    : "steady";

  const suggestions: WeeklySuggestionDecision[] = [];

  for (const next of nextActions) {
    const relatedCurrent = findRelatedCurrentHabit(currentActions, next);
    if (relatedCurrent && relatedCurrent.type === "habitude") {
      if (shouldActivateNext) {
        suggestions.push({
          action_title: relatedCurrent.title,
          action_type: relatedCurrent.type,
          phase_scope: "current",
          recommendation: "deactivate",
          reason: "Cette habitude semble remplacée par une version plus avancée dans la phase suivante.",
          confidence: "medium",
          related_action_title: next.title,
        });
        suggestions.push({
          action_title: next.title,
          action_type: next.type,
          phase_scope: "next",
          recommendation: "activate",
          reason: "La progression de cette semaine permet probablement de passer à la version suivante.",
          confidence: "medium",
          related_action_title: relatedCurrent.title,
        });
      } else {
        suggestions.push({
          action_title: next.title,
          action_type: next.type,
          phase_scope: "next",
          recommendation: "wait",
          reason: "Pas assez d'élan cette semaine pour ajouter la version suivante de cette habitude.",
          confidence: "high",
          related_action_title: relatedCurrent.title,
        });
      }
      continue;
    }

    suggestions.push({
      action_title: next.title,
      action_type: next.type,
      phase_scope: "next",
      recommendation: shouldActivateNext ? "activate" : "wait",
      reason: shouldActivateNext
        ? "La charge semble compatible avec l'activation d'une action de la phase suivante."
        : "Mieux vaut stabiliser les actions actuelles avant d'ajouter cette action.",
      confidence: shouldActivateNext ? "medium" : "high",
      related_action_title: null,
    });
  }

  if (suggestions.length === 0 && currentActions.length > 0) {
    suggestions.push({
      action_title: currentActions[0].title,
      action_type: currentActions[0].type,
      phase_scope: "current",
      recommendation: "keep_active",
      reason: hasZeroMomentum
        ? "Cette semaine appelle surtout à reprendre de l'élan sur les actions déjà en cours."
        : "La priorité reste de consolider les actions déjà engagées.",
      confidence: "high",
      related_action_title: null,
    });
  }

  return applyBlockerPolicyToSuggestionState({
    blockerState,
    execution,
    currentActions,
    suggestionState: {
    readiness,
    should_activate_next_phase: shouldActivateNext,
    summary: hasZeroMomentum
      ? "Peu ou pas d'exécution cette semaine: on évite de proposer de nouvelles activations."
      : strongBlockers
      ? "La semaine montre encore une friction significative sur une action en cours: on consolide avant d'ouvrir plus large."
      : shouldActivateNext
      ? "La semaine montre assez de traction pour envisager une montée de phase ciblée."
      : "Il y a du mouvement, mais pas encore assez de stabilité pour ouvrir plus large.",
    suggestions: suggestions.slice(0, 6),
    },
  });
}

async function generateSuggestionState(params: {
  execution: WeeklyReviewPayload["execution"];
  currentActions: WeeklyPlanActionSnapshot[];
  nextActions: WeeklyPlanActionSnapshot[];
  activeActionTitles: string[];
  currentPhaseIndex: number | null;
  nextPhaseIndex: number | null;
  blockerState: WeeklyBlockerState;
}): Promise<WeeklySuggestionState> {
  const fallback = fallbackSuggestionState({
    execution: params.execution,
    currentActions: params.currentActions,
    nextActions: params.nextActions,
    blockerState: params.blockerState,
  });

  if (params.currentActions.length === 0 && params.nextActions.length === 0) {
    return fallback;
  }

  const prompt = [
    "Tu analyses le plan hebdomadaire d'un user Sophia pour produire un suggestion_state.",
    "Réponds UNIQUEMENT en JSON valide.",
    'Format: {"readiness":"hold|steady|expand","should_activate_next_phase":boolean,"summary":"string","suggestions":[{"action_title":"string","action_type":"habitude|mission|framework|unknown","phase_scope":"current|next","recommendation":"keep_active|activate|deactivate|wait","reason":"string","confidence":"low|medium|high","related_action_title":"string|null"}]}',
    "Règles métier obligatoires:",
    "- Base-toi sur l'exécution réelle de la semaine + actions actives + phase actuelle + phase suivante.",
    "- Base-toi AUSSI sur blocker_state: blockers actifs, recurrents ou chroniques doivent peser dans la recommandation.",
    "- Si le user est à 0 répétition utile cette semaine, ne propose PAS d'activer une nouvelle action de la phase suivante.",
    "- Si blocker_state.top_blocker_stage est recurrent ou chronic sur une action actuelle, privilégie la consolidation et évite d'ouvrir une nouvelle action de phase suivante.",
    "- Si blocker_state.chronic_blockers_count > 0, should_activate_next_phase doit rester false sauf cas exceptionnel tres clairement soutenu par l'exécution, ce qui est rare.",
    "- Si un blocage chronique touche une action actuelle, n'encourage pas un remplacement agressif par une version plus avancée la meme semaine.",
    "- Ne recommande jamais activate pour une action dont db_status est deja active, completed ou deactivated.",
    "- Une action db_status=completed est deja realisee dans le plan: ne la presente jamais comme a activer.",
    "- Une action db_status=deactivated a ete mise de cote manuellement: ne la repropose pas automatiquement.",
    "- Tu peux recommander deactivate UNIQUEMENT pour une habitude actuelle qui serait remplacée par une version plus avancée de la phase suivante.",
    "- Ne recommande jamais deactivate pour mission ou framework.",
    "- Si une action de phase suivante est cumulative/complementaire, garde l'actuelle et propose activate seulement si la semaine montre assez de traction.",
    "- Garde 6 suggestions max. Pas de blabla. Rationnels courts et concrets.",
    `execution=${JSON.stringify(params.execution)}`,
    `active_action_titles=${JSON.stringify(params.activeActionTitles)}`,
    `current_phase_index=${JSON.stringify(params.currentPhaseIndex)}`,
    `next_phase_index=${JSON.stringify(params.nextPhaseIndex)}`,
    `blocker_state=${JSON.stringify(params.blockerState)}`,
    `current_phase_actions=${JSON.stringify(params.currentActions)}`,
    `next_phase_actions=${JSON.stringify(params.nextActions)}`,
  ].join("\n");

  try {
    const raw = await generateWithGemini(
      prompt,
      "Génère le suggestion_state.",
      0.2,
      true,
      [],
      "auto",
      {
        source: "trigger-weekly-bilan:suggestion-state",
      },
    );
    const parsed = safeJsonParse(raw) ?? {};
    const readinessRaw = String(parsed?.readiness ?? "").trim();
    const readiness: WeeklySuggestionState["readiness"] = readinessRaw === "hold" || readinessRaw === "expand"
      ? readinessRaw
      : "steady";
    const summary = String(parsed?.summary ?? "").trim();
    const suggestions = Array.isArray(parsed?.suggestions)
      ? normalizeSuggestionDecisionsForPlan(
        parsed.suggestions
          .map(parseSuggestionDecision)
          .filter(Boolean) as WeeklySuggestionDecision[],
        [
          ...params.currentActions,
          ...params.nextActions,
        ],
      )
      : [];
    const shouldActivateNext = Boolean(parsed?.should_activate_next_phase);

    const normalized = applyBlockerPolicyToSuggestionState({
      blockerState: params.blockerState,
      execution: params.execution,
      currentActions: params.currentActions,
      suggestionState: {
      readiness,
      should_activate_next_phase: shouldActivateNext,
      summary: summary.slice(0, 280) || fallback.summary,
      suggestions: suggestions.slice(0, 6),
      },
    });

    if (!normalized.summary || normalized.suggestions.length === 0) return fallback;

    if (
      params.execution.completed <= 0 &&
      normalized.should_activate_next_phase
    ) {
      return {
        ...normalized,
        readiness: "hold",
        should_activate_next_phase: false,
        summary: "Peu ou pas d'exécution cette semaine: on reste sur la consolidation avant toute nouvelle activation.",
        suggestions: normalized.suggestions.map((item) =>
          item.phase_scope === "next" && item.recommendation === "activate"
            ? { ...item, recommendation: "wait", reason: "Pas assez d'exécution cette semaine pour ouvrir une nouvelle action." }
            : item
        ),
      };
    }

    return normalized;
  } catch {
    return fallback;
  }
}

export async function buildWeeklyReviewPayload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  opts?: { tempMemory?: any },
): Promise<WeeklyReviewPayload> {
  const { data: profile } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  const tz = String((profile as any)?.timezone ?? "").trim() || "Europe/Paris";
  const weekStart = isoWeekStartYmdInTz(new Date(), tz);
  const weekEnd = addDaysYmd(weekStart, 7);
  const previousWeekStart = addDaysYmd(weekStart, -7);

  const { data: activePlan } = await admin
    .from("user_plans")
    .select("id, submission_id, current_phase, content")
    .eq("user_id", userId)
    .in("status", ["active", "in_progress", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planId = String((activePlan as any)?.id ?? "").trim();
  const submissionId = String((activePlan as any)?.submission_id ?? "").trim();
  const planContent = ((activePlan as any)?.content && typeof (activePlan as any).content === "object")
    ? (activePlan as any).content
    : null;
  const rawCurrentPhase = Number((activePlan as any)?.current_phase);
  const currentPhaseIndex = Number.isFinite(rawCurrentPhase) && rawCurrentPhase >= 1 ? Math.floor(rawCurrentPhase) : null;

  const planActionsQuery = admin
    .from("user_actions")
    .select("id,title,target_reps,current_reps,last_performed_at,status,type,tracking_type,time_of_day")
    .eq("user_id", userId)
    .eq("status", "active");

  const { data: planActions } = planId
    ? await planActionsQuery.eq("plan_id", planId)
    : await planActionsQuery;

  const { data: personalActions } = await admin
    .from("user_personal_actions")
    .select("id,title,target_reps,current_reps,last_performed_at")
    .eq("user_id", userId)
    .eq("status", "active");

  const [{ data: allPlanActions }, { data: planFrameworks }] = planId
    ? await Promise.all([
      admin
        .from("user_actions")
        .select("id,title,target_reps,current_reps,last_performed_at,status,type,tracking_type,time_of_day")
        .eq("user_id", userId)
        .eq("plan_id", planId),
      admin
        .from("user_framework_tracking")
        .select("id,action_id,title,target_reps,current_reps,last_performed_at,status,type")
        .eq("user_id", userId)
        .eq("plan_id", planId),
    ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  const planActionIds = (planActions ?? []).map((a: any) => String(a.id)).filter(Boolean);

  const { data: weekEntries } = planActionIds.length > 0
    ? await admin
      .from("user_action_entries")
      .select("action_id,status")
      .eq("user_id", userId)
      .gte("performed_at", `${weekStart}T00:00:00`)
      .lt("performed_at", `${weekEnd}T00:00:00`)
      .in("action_id", planActionIds)
    : { data: [] as any[] };

  const completedByAction = new Map<string, number>();
  const missedByAction = new Map<string, number>();

  for (const row of (weekEntries ?? []) as any[]) {
    const actionId = String(row?.action_id ?? "");
    if (!actionId) continue;
    const status = String(row?.status ?? "").toLowerCase();
    if (status === "completed" || status === "partial") {
      completedByAction.set(actionId, (completedByAction.get(actionId) ?? 0) + 1);
    } else if (status === "missed") {
      missedByAction.set(actionId, (missedByAction.get(actionId) ?? 0) + 1);
    }
  }

  const details: ActionWeekSummary[] = [];

  for (const action of (planActions ?? []) as any[]) {
    const id = String(action?.id ?? "");
    if (!id) continue;
    const completed = completedByAction.get(id) ?? 0;
    const missed = missedByAction.get(id) ?? 0;
    details.push({
      id,
      title: String(action?.title ?? "Action").trim() || "Action",
      source: "plan",
      target_reps: Math.max(1, Math.floor(parseNumber(action?.target_reps, 1))),
      week_reps: completed,
      completed_count: completed,
      missed_count: missed,
    });
  }

  for (const action of (personalActions ?? []) as any[]) {
    const id = String(action?.id ?? "");
    if (!id) continue;
    const lastPerformed = String(action?.last_performed_at ?? "").trim();
    const lastInWeek = lastPerformed >= `${weekStart}T00:00:00` && lastPerformed < `${weekEnd}T00:00:00`;
    const weekReps = lastInWeek ? Math.max(0, Math.floor(parseNumber(action?.current_reps, 0))) : 0;
    details.push({
      id,
      title: String(action?.title ?? "Action perso").trim() || "Action perso",
      source: "personal",
      target_reps: Math.max(1, Math.floor(parseNumber(action?.target_reps, 1))),
      week_reps: weekReps,
      completed_count: weekReps,
      missed_count: 0,
    });
  }

  const completedTotal = details.reduce((sum, d) => sum + d.completed_count, 0);
  const missedTotal = details.reduce((sum, d) => sum + d.missed_count, 0);
  const total = completedTotal + missedTotal;
  const ratePct = total > 0 ? Math.round((completedTotal / total) * 100) : 0;

  const topAction = details
    .slice()
    .sort((a, b) => b.completed_count - a.completed_count)[0] ?? null;
  const blockerAction = details
    .slice()
    .sort((a, b) => b.missed_count - a.missed_count)[0] ?? null;

  let etoile: WeeklyReviewPayload["etoile_polaire"] = null;

  let nsQuery = admin
    .from("user_north_stars")
    .select("title,unit,start_value,current_value,target_value,history,updated_at,status")
    .eq("user_id", userId)
    .in("status", ["active", "completed"]) as any;

  if (submissionId) {
    nsQuery = nsQuery.eq("submission_id", submissionId);
  }

  const { data: northStar } = await nsQuery
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (northStar) {
    const start = parseNumber((northStar as any).start_value, 0);
    const current = parseNumber((northStar as any).current_value, 0);
    const target = parseNumber((northStar as any).target_value, 0);
    const history = Array.isArray((northStar as any).history) ? (northStar as any).history : [];
    const prevEntry = history.length > 0 ? history[history.length - 1] : null;
    const prevValue = parseHistoryValue(prevEntry);
    const deltaWeek = current - (prevValue ?? start);

    etoile = {
      title: String((northStar as any).title ?? "Etoile Polaire").trim() || "Etoile Polaire",
      unit: String((northStar as any).unit ?? "").trim(),
      start,
      current,
      target,
      delta_week: Math.round(deltaWeek * 100) / 100,
      progression_pct: computeProgressionPct(start, current, target),
    };
  }

  const activeCount = details.length;
  const verdict: "low" | "balanced" | "high" = activeCount <= 1
    ? "low"
    : activeCount >= 6
    ? "high"
    : "balanced";

  const { data: previousRecap } = await admin
    .from("weekly_bilan_recaps")
    .select("decisions_next_week,coach_note")
    .eq("user_id", userId)
    .eq("week_start", previousWeekStart)
    .maybeSingle();

  const phases = Array.isArray((planContent as any)?.phases) ? (planContent as any).phases : [];
  let resolvedCurrentPhaseIndex = currentPhaseIndex;
  if (resolvedCurrentPhaseIndex === null && phases.length > 0) {
    const phaseFromStatus = phases.findIndex((phase: any) => String(phase?.status ?? "").toLowerCase() === "active");
    resolvedCurrentPhaseIndex = phaseFromStatus >= 0 ? phaseFromStatus + 1 : 1;
  }
  const resolvedNextPhaseIndex = resolvedCurrentPhaseIndex !== null && resolvedCurrentPhaseIndex < phases.length
    ? resolvedCurrentPhaseIndex + 1
    : null;

  const actionRowsByTitle = new Map<string, any>();
  const frameworkRowsById = new Map<string, any>();
  const frameworkRowsByTitle = new Map<string, any>();
  for (const row of (allPlanActions ?? []) as any[]) {
    const title = String(row?.title ?? "").trim().toLowerCase();
    if (title) actionRowsByTitle.set(title, row);
  }
  for (const row of (planFrameworks ?? []) as any[]) {
    const actionId = String(row?.action_id ?? "").trim();
    const title = String(row?.title ?? "").trim().toLowerCase();
    if (actionId) frameworkRowsById.set(actionId, row);
    if (title) frameworkRowsByTitle.set(title, row);
  }

  const buildPlanActionSnapshot = (phase: any, phaseIndex: number, action: any): WeeklyPlanActionSnapshot => {
    const type = normalizeActionType(action?.type);
    const planActionId = String(action?.id ?? "").trim();
    const title = String(action?.title ?? "Action").trim() || "Action";
    const actionRow = type === "framework"
      ? frameworkRowsById.get(planActionId) ?? frameworkRowsByTitle.get(title.toLowerCase()) ?? null
      : actionRowsByTitle.get(title.toLowerCase()) ?? null;
    const weekSummary = findWeekSummary(details, title);
    return {
      plan_action_id: planActionId,
      title,
      type,
      quest_type: normalizeQuestType(action?.questType),
      phase_index: phaseIndex,
      phase_title: String(phase?.title ?? `Phase ${phaseIndex}`).trim() || `Phase ${phaseIndex}`,
      phase_status: String(phase?.status ?? "").trim(),
      target_reps: actionRow
        ? Math.max(1, Math.floor(parseNumber(actionRow?.target_reps, parseNumber(action?.targetReps, 1))))
        : (typeof action?.targetReps === "number" ? Math.max(1, Math.floor(action.targetReps)) : null),
      current_reps: actionRow ? Math.max(0, Math.floor(parseNumber(actionRow?.current_reps, 0))) : null,
      tracking_type: actionRow?.tracking_type ? String(actionRow.tracking_type) : String(action?.tracking_type ?? "").trim() || null,
      time_of_day: actionRow?.time_of_day ? String(actionRow.time_of_day) : String(action?.time_of_day ?? "").trim() || null,
      db_status: normalizeStatus(actionRow?.status),
      is_current_phase: phaseIndex === resolvedCurrentPhaseIndex,
      is_next_phase: phaseIndex === resolvedNextPhaseIndex,
      week_reps: Math.max(0, weekSummary?.week_reps ?? 0),
      missed_count: Math.max(0, weekSummary?.missed_count ?? 0),
    };
  };

  const currentActions = resolvedCurrentPhaseIndex === null
    ? []
    : ((phases[resolvedCurrentPhaseIndex - 1]?.actions ?? []) as any[]).map((action: any) =>
      buildPlanActionSnapshot(phases[resolvedCurrentPhaseIndex - 1], resolvedCurrentPhaseIndex!, action)
    );
  const nextActions = resolvedNextPhaseIndex === null
    ? []
    : ((phases[resolvedNextPhaseIndex - 1]?.actions ?? []) as any[]).map((action: any) =>
      buildPlanActionSnapshot(phases[resolvedNextPhaseIndex - 1], resolvedNextPhaseIndex!, action)
    );
  const activeActionTitles = [
    ...((planActions ?? []) as any[]).map((row: any) => String(row?.title ?? "").trim()),
    ...((personalActions ?? []) as any[]).map((row: any) => String(row?.title ?? "").trim()),
    ...((planFrameworks ?? []) as any[])
      .filter((row: any) => String(row?.status ?? "").toLowerCase() === "active")
      .map((row: any) => String(row?.title ?? "").trim()),
  ].filter(Boolean);

  const executionPayload: WeeklyReviewPayload["execution"] = {
    rate_pct: ratePct,
    total,
    completed: completedTotal,
    top_action: (topAction && topAction.completed_count > 0) ? topAction.title : null,
    blocker_action: (blockerAction && blockerAction.missed_count > 0) ? blockerAction.title : null,
    details,
  };
  const blockerState = buildWeeklyBlockerState(opts?.tempMemory ?? {});
  const coachingInterventionState = buildWeeklyCoachingInterventionState(
    opts?.tempMemory ?? {},
  );

  const suggestionState = await generateSuggestionState({
    execution: executionPayload,
    currentActions,
    nextActions,
    activeActionTitles,
    currentPhaseIndex: resolvedCurrentPhaseIndex,
    nextPhaseIndex: resolvedNextPhaseIndex,
    blockerState,
  });

  return {
    execution: executionPayload,
    etoile_polaire: etoile,
    action_load: {
      active_count: activeCount,
      verdict,
      titles: details.map((d) => d.title),
    },
    previous_recap: previousRecap
      ? {
        decisions: Array.isArray((previousRecap as any).decisions_next_week)
          ? (previousRecap as any).decisions_next_week.map((x: unknown) => String(x)).filter(Boolean)
          : [],
        coach_note: typeof (previousRecap as any).coach_note === "string"
          ? (previousRecap as any).coach_note
          : null,
      }
      : null,
    plan_window: {
      current_phase_index: resolvedCurrentPhaseIndex,
      current_phase_title: resolvedCurrentPhaseIndex !== null
        ? String(phases[resolvedCurrentPhaseIndex - 1]?.title ?? "").trim() || null
        : null,
      next_phase_index: resolvedNextPhaseIndex,
      next_phase_title: resolvedNextPhaseIndex !== null
        ? String(phases[resolvedNextPhaseIndex - 1]?.title ?? "").trim() || null
        : null,
      current_actions: currentActions,
      next_actions: nextActions,
      active_action_titles: [...new Set(activeActionTitles)],
    },
    suggestion_state: suggestionState,
    blocker_state: blockerState,
    coaching_intervention_state: coachingInterventionState,
    week_iso: isoWeekLabelFromYmd(weekStart),
    week_start: weekStart,
  };
}
