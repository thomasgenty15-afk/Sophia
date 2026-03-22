import {
  getCoachingTechniqueDefinition,
  getTechniqueCandidatesForBlocker,
  type CoachingBlockerType,
  type CoachingTechniqueId,
} from "./coaching_interventions.ts";
import type {
  CoachingInterventionRuntimeAddon,
  CoachingInterventionSelectorInput,
  CoachingInterventionTechniqueHistory,
} from "./coaching_intervention_selector.ts";
import type {
  CoachingInterventionHistoryEntry,
  CoachingInterventionPendingState,
} from "./coaching_intervention_tracking.ts";
import type { WeeklyCoachingInterventionState } from "../trigger-weekly-bilan/payload.ts";

type CoachingMemorySnapshot = {
  history: CoachingInterventionHistoryEntry[];
  pending: CoachingInterventionPendingState | null;
};

type RenderConfidence = "low" | "medium" | "high";

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function truncate(value: unknown, maxLen: number): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function latestTechniqueEntry(
  history: CoachingInterventionTechniqueHistory[],
  techniqueId: CoachingTechniqueId,
) {
  return history
    .filter((item) => item.technique_id === techniqueId)
    .sort((a, b) => parseIsoMs(b.last_used_at ?? null) - parseIsoMs(a.last_used_at ?? null))[0] ??
    null;
}

function techniqueSignalPattern(techniqueId: CoachingTechniqueId): RegExp {
  switch (techniqueId) {
    case "three_second_rule":
      return /\b3 secondes\b|premier geste|tout de suite|maintenant/i;
    case "minimum_version":
      return /version minimale|minimale|une ligne|2 minutes|juste commencer/i;
    case "ten_minute_sprint":
      return /\b10 minutes\b|\bdix minutes\b|pendant 10 minutes/i;
    case "if_then_plan":
      return /\bsi\b.{0,40}\balors\b/i;
    case "environment_shift":
      return /change.*piece|change.*pi[eè]ce|change d'environnement|sors de la piece|bouge de place/i;
    case "urge_delay":
      return /attends? 10 minutes|reporte.*10 minutes|repousse juste la decision/i;
    case "immediate_replacement":
      return /remplace|a la place|substitut|autre geste tout de suite/i;
    case "contrast_visualization":
      return /visualis|ce que tu gagnes|ce que tu paies|cout de ne pas/i;
    case "precommitment":
      return /prepare.*maintenant|a l'avance|pre-engage|rendre plus facile plus tard/i;
    case "relapse_protocol":
      return /prochaine repetition|prochain geste|ce n'est pas foutu|on repart/i;
  }
}

export function buildCoachingHistorySnapshot(
  history: CoachingInterventionTechniqueHistory[] | undefined,
  limit = 6,
) {
  return (Array.isArray(history) ? history : []).slice(-limit).map((item) => ({
    technique_id: item.technique_id,
    blocker_type: item.blocker_type ?? null,
    outcome: item.outcome,
    helpful: typeof item.helpful === "boolean" ? item.helpful : null,
    last_used_at: item.last_used_at ?? null,
  }));
}

export function buildCoachingCustomizationContext(
  input: CoachingInterventionSelectorInput,
  addon?: CoachingInterventionRuntimeAddon | null,
) {
  return {
    last_user_message_excerpt: truncate(input.last_user_message, 240),
    recent_context_summary: truncate(input.recent_context_summary, 420),
    target_action_title: truncate(input.target_action_title, 120),
    explicit_help_request: Boolean(input.explicit_help_request),
    trigger_kind: input.trigger_kind,
    message_angle: addon?.message_angle ?? null,
    intensity: addon?.intensity ?? null,
    coach_preferences: input.coach_preferences ?? null,
  };
}

export function findCoachingDeprioritizedTechniques(args: {
  blocker_type: CoachingBlockerType | "unknown";
  technique_history?: CoachingInterventionTechniqueHistory[];
  recommended_technique?: CoachingTechniqueId | null;
}) {
  if (args.blocker_type === "unknown" || !args.recommended_technique) return [];
  const bundle = getTechniqueCandidatesForBlocker(args.blocker_type);
  const candidates = [...bundle.primary, ...bundle.secondary];
  const history = Array.isArray(args.technique_history) ? args.technique_history : [];

  return candidates
    .filter((techniqueId) => techniqueId !== args.recommended_technique)
    .map((techniqueId) => {
      const latest = latestTechniqueEntry(history, techniqueId);
      if (!latest) return null;
      if (latest.outcome !== "tried_not_helpful" && latest.outcome !== "not_tried") {
        return null;
      }
      return {
        technique_id: techniqueId,
        blocker_type: latest.blocker_type ?? null,
        outcome: latest.outcome,
        helpful: typeof latest.helpful === "boolean" ? latest.helpful : null,
        last_used_at: latest.last_used_at ?? null,
        reason: latest.outcome === "tried_not_helpful"
          ? "recently_not_helpful"
          : "recently_proposed_without_try",
      };
    })
    .filter(Boolean);
}

export function detectCoachingInterventionRender(args: {
  addon: CoachingInterventionRuntimeAddon | null | undefined;
  responseContent: string;
}): {
  rendered: boolean;
  render_confidence: RenderConfidence;
  render_signal: string;
  technique_signal_detected: boolean;
  response_excerpt: string | null;
} {
  const addon = args.addon;
  const response = String(args.responseContent ?? "").trim();
  if (!addon || !response) {
    return {
      rendered: false,
      render_confidence: "low",
      render_signal: "no_response_or_addon",
      technique_signal_detected: false,
      response_excerpt: truncate(response, 220),
    };
  }

  if (addon.decision === "clarify") {
    const askedQuestion = response.includes("?");
    return {
      rendered: askedQuestion,
      render_confidence: askedQuestion ? "high" : "low",
      render_signal: askedQuestion ? "clarifying_question_detected" : "clarify_signal_missing",
      technique_signal_detected: false,
      response_excerpt: truncate(response, 220),
    };
  }

  const technique = addon.recommended_technique
    ? getCoachingTechniqueDefinition(addon.recommended_technique)
    : null;
  const labelMentioned = technique
    ? response.toLowerCase().includes(technique.label.toLowerCase())
    : false;
  const keywordHit = addon.recommended_technique
    ? techniqueSignalPattern(addon.recommended_technique).test(response)
    : false;

  if (labelMentioned || keywordHit) {
    return {
      rendered: true,
      render_confidence: labelMentioned ? "high" : "medium",
      render_signal: labelMentioned ? "technique_label_detected" : "technique_pattern_detected",
      technique_signal_detected: true,
      response_excerpt: truncate(response, 220),
    };
  }

  return {
    rendered: response.length >= 24,
    render_confidence: response.length >= 80 ? "low" : "low",
    render_signal: "generic_response_after_addon",
    technique_signal_detected: false,
    response_excerpt: truncate(response, 220),
  };
}

export function deriveCoachingFollowUpAudit(args: {
  before: CoachingMemorySnapshot;
  after: CoachingMemorySnapshot;
}) {
  const previousPending = args.before.pending;
  if (!previousPending) return null;
  const beforeEntry = args.before.history.find((item) =>
    item.intervention_id === previousPending.intervention_id
  );
  const afterEntry = args.after.history.find((item) =>
    item.intervention_id === previousPending.intervention_id
  );
  if (!afterEntry) return null;

  const statusChanged = beforeEntry?.status !== afterEntry.status;
  const outcomeChanged = beforeEntry?.outcome !== afterEntry.outcome;
  if (!statusChanged && !outcomeChanged) return null;

  return {
    intervention_id: previousPending.intervention_id,
    technique_id: previousPending.technique_id,
    blocker_type: previousPending.blocker_type,
    follow_up_outcome: afterEntry.outcome,
    helpful: afterEntry.helpful ?? null,
    previous_status: beforeEntry?.status ?? "pending",
    next_status: afterEntry.status,
    outcome_reason: afterEntry.outcome_reason ?? null,
    selector_source: afterEntry.selector_source ?? previousPending.selector_source ?? null,
    proposed_at: afterEntry.proposed_at ?? previousPending.proposed_at,
    resolved_at: afterEntry.resolved_at ?? null,
    target_action_title: afterEntry.target_action_title ?? previousPending.target_action_title ?? null,
  };
}

export function buildWeeklyCoachingSummaryAuditPayload(
  state: WeeklyCoachingInterventionState,
) {
  return {
    weekly_recommendation: state.recommendation,
    summary: state.summary ?? null,
    proposed_count_7d: state.proposed_count_7d,
    resolved_count_7d: state.resolved_count_7d,
    helpful_count_7d: state.helpful_count_7d,
    not_helpful_count_7d: state.not_helpful_count_7d,
    behavior_change_count_7d: state.behavior_change_count_7d,
    pending_technique_id: state.pending_technique_id ?? null,
    pending_blocker_type: state.pending_blocker_type ?? null,
    top_helpful_technique: state.top_helpful_technique ?? null,
    top_unhelpful_technique: state.top_unhelpful_technique ?? null,
    recent_resolved: (state.recent_resolved ?? []).slice(-3).map((item) => ({
      technique_id: item.technique_id,
      blocker_type: item.blocker_type ?? null,
      outcome: item.outcome,
      target_action_title: item.target_action_title ?? null,
      helpful: item.helpful ?? null,
      last_used_at: item.last_used_at ?? null,
    })),
  };
}
