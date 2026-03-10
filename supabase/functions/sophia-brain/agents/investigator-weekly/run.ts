import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { isExplicitStopBilan } from "../investigator/utils.ts";
import { weeklyInvestigatorSay } from "./copy.ts";
import { handleWeeklyTurn } from "./turn.ts";
import { classifyWeeklyStartConsent } from "./consent_classifier.ts";
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
      content: "On a perdu le contexte du bilan hebdo, on le relance dimanche prochain 🙂",
      investigationComplete: true,
      newState: null,
    };
  }

  if (isExplicitStopBilan(message)) {
    return {
      content: "Pas de souci, on coupe le bilan hebdo ici 🙂 On reprendra au prochain créneau.",
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
        opening_context: currentState.opening_context ?? null,
        recent_history: (history ?? []).slice(-12),
      },
      meta,
    );

    const nextState: WeeklyInvestigationState = {
      ...currentState,
      status: "reviewing",
      awaiting_start_consent: true,
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

  if (currentState.awaiting_start_consent) {
    const decision = await classifyWeeklyStartConsent({ message, history, meta });

    if (decision === "cancel") {
      return {
        content: "Pas de souci, ce n'est pas grave 🙂 On fera le bilan hebdo la semaine prochaine.",
        investigationComplete: true,
        newState: null,
      };
    }
    if (decision === "go") {
      const nextState: WeeklyInvestigationState = {
        ...currentState,
        awaiting_start_consent: false,
        start_consent_clarify_count: 0,
        updated_at: new Date().toISOString(),
      };
      return await handleWeeklyTurn({
        supabase,
        userId,
        message,
        history,
        state: nextState,
        meta,
      });
    }
    const clarifyCount = Number(currentState.start_consent_clarify_count ?? 0);
    if (clarifyCount >= 1) {
      return {
        content: "Pas de souci, on laisse le bilan hebdo de cote pour l'instant 🙂",
        investigationComplete: true,
        newState: null,
      };
    }

    let reaskContent = "On peut faire le point hebdo maintenant, ou le laisser pour plus tard 🙂";
    try {
      reaskContent = await weeklyInvestigatorSay(
        "weekly_bilan_reask_consent",
        {
          user_message: message,
          weekly_payload: currentState.weekly_payload,
          covered_topics: currentState.weekly_covered_topics,
          opening_context: currentState.opening_context ?? null,
          recent_history: (history ?? []).slice(-12),
        },
        meta,
      );
    } catch {
      // Keep a deterministic fallback only if copy generation fails.
    }
    return {
      content: reaskContent,
      investigationComplete: false,
      newState: {
        ...currentState,
        start_consent_clarify_count: clarifyCount + 1,
        updated_at: new Date().toISOString(),
      },
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
