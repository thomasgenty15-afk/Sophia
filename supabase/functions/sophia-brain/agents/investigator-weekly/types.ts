import type { WeeklyReviewPayload } from "../../../trigger-weekly-bilan/payload.ts";

export type WeeklyPhase = "execution" | "etoile_polaire" | "action_load" | "closing";

export interface WeeklyRecapDraft {
  decisions_next_week: string[];
  coach_note?: string;
}

export interface WeeklyInvestigationState {
  mode: "weekly_bilan";
  status: "init" | "reviewing" | "closing";
  awaiting_start_consent?: boolean;
  weekly_phase: WeeklyPhase;
  weekly_payload: WeeklyReviewPayload;
  weekly_covered_topics: string[];
  weekly_stagnation_count: number;
  weekly_recap_draft: WeeklyRecapDraft;
  turn_count: number;
  started_at: string;
  updated_at?: string;
}

export function createWeeklyInvestigationState(
  payload: WeeklyReviewPayload,
): WeeklyInvestigationState {
  const now = new Date().toISOString();
  return {
    mode: "weekly_bilan",
    status: "init",
    awaiting_start_consent: false,
    weekly_phase: "execution",
    weekly_payload: payload,
    weekly_covered_topics: [],
    weekly_stagnation_count: 0,
    weekly_recap_draft: { decisions_next_week: [] },
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
