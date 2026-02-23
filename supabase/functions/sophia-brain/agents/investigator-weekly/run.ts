import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { isExplicitStopBilan } from "../investigator/utils.ts";
import { weeklyInvestigatorSay } from "./copy.ts";
import { handleWeeklyTurn } from "./turn.ts";
import type { WeeklyInvestigationState } from "./types.ts";

type WeeklyTurnResult = {
  content: string;
  investigationComplete: boolean;
  newState: WeeklyInvestigationState | null;
};

export async function runInvestigatorWeekly(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  history: any[],
  state: WeeklyInvestigationState,
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
  },
): Promise<WeeklyTurnResult> {
  const currentState = state;

  if (!currentState?.weekly_payload) {
    return {
      content: "On a perdu le contexte du bilan hebdo. On le relance dimanche prochain.",
      investigationComplete: true,
      newState: null,
    };
  }

  if (isExplicitStopBilan(message)) {
    return {
      content: "Pas de souci, on coupe le bilan hebdo ici. On reprendra au prochain créneau.",
      investigationComplete: true,
      newState: null,
    };
  }

  if (currentState.status === "init") {
    const opening = await weeklyInvestigatorSay(
      "weekly_bilan_opening",
      {
        weekly_payload: currentState.weekly_payload,
        covered_topics: currentState.weekly_covered_topics,
        recent_history: (history ?? []).slice(-12),
      },
      meta,
    );

    const nextState: WeeklyInvestigationState = {
      ...currentState,
      status: "reviewing",
      weekly_phase: "execution",
      turn_count: Math.max(1, Number(currentState.turn_count ?? 0)),
      updated_at: new Date().toISOString(),
    };

    return {
      content: opening,
      investigationComplete: false,
      newState: nextState,
    };
  }

  return await handleWeeklyTurn({
    supabase,
    userId,
    message,
    history,
    state: currentState,
    meta,
  });
}
