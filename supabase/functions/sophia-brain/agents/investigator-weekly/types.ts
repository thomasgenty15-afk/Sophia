import type {
  WeeklyReviewPayload,
  WeeklySuggestionDecision,
} from "../../../trigger-weekly-bilan/payload.ts";

export type WeeklyPhase = "execution" | "etoile_polaire" | "action_load" | "closing";

export interface WeeklyRecapDraft {
  decisions_next_week: string[];
  coach_note?: string;
}

export interface WeeklySuggestionProposal {
  id: string;
  recommendation: "activate" | "deactivate" | "swap";
  prompt: string;
  decisions: WeeklySuggestionDecision[];
}

export interface WeeklySuggestionOutcome {
  proposal_id: string;
  outcome: "accepted" | "rejected" | "applied" | "failed";
  summary: string;
  applied_changes?: string[];
  created_at: string;
}

export interface WeeklyOpeningContext {
  mode: "cold_relaunch" | "ongoing_conversation";
  allow_relaunch_greeting: boolean;
  hours_since_last_message: number | null;
  last_message_at: string | null;
}

export interface WeeklyInvestigationState {
  mode: "weekly_bilan";
  status: "init" | "reviewing" | "closing";
  awaiting_start_consent?: boolean;
  start_consent_clarify_count?: number;
  opening_context?: WeeklyOpeningContext | null;
  weekly_phase: WeeklyPhase;
  weekly_payload: WeeklyReviewPayload;
  weekly_covered_topics: string[];
  weekly_stagnation_count: number;
  weekly_recap_draft: WeeklyRecapDraft;
  weekly_suggestion_queue?: WeeklySuggestionProposal[];
  weekly_pending_suggestion?: WeeklySuggestionProposal | null;
  weekly_suggestion_outcomes?: WeeklySuggestionOutcome[];
  turn_count: number;
  started_at: string;
  updated_at?: string;
}

export function createWeeklyInvestigationState(
  payload: WeeklyReviewPayload,
  openingContext?: WeeklyOpeningContext | null,
): WeeklyInvestigationState {
  const now = new Date().toISOString();
  return {
    mode: "weekly_bilan",
    status: "init",
    awaiting_start_consent: false,
    start_consent_clarify_count: 0,
    opening_context: openingContext ?? null,
    weekly_phase: "execution",
    weekly_payload: payload,
    weekly_covered_topics: [],
    weekly_stagnation_count: 0,
    weekly_recap_draft: { decisions_next_week: [] },
    weekly_suggestion_queue: [],
    weekly_pending_suggestion: null,
    weekly_suggestion_outcomes: [],
    turn_count: 0,
    started_at: now,
    updated_at: now,
  };
}

export function isWeeklyInvestigationState(
  state: unknown,
): state is WeeklyInvestigationState {
  return Boolean(
    state &&
      typeof state === "object" &&
      String((state as any).mode ?? "") === "weekly_bilan" &&
      (state as any).weekly_payload,
  );
}
