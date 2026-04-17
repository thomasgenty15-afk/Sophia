/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type InvestigatorResult = {
  investigationComplete: boolean;
  content: string;
  newState: Record<string, unknown>;
};

function isWeeklyMode(state: unknown): boolean {
  return String((state as Record<string, unknown> | null)?.mode ?? "") ===
    "weekly_bilan";
}

function normalizeState(
  state: unknown,
  now: string,
): Record<string, unknown> {
  const base = state && typeof state === "object"
    ? { ...(state as Record<string, unknown>) }
    : {};
  const startedAt = String(base.started_at ?? "").trim() || now;
  const turnCount = Number(base.turn_count ?? 0);

  return {
    ...base,
    status: "in_progress",
    started_at: startedAt,
    updated_at: now,
    turn_count: Number.isFinite(turnCount) ? Math.max(0, turnCount) : 0,
  };
}

function shouldCloseFallbackBilan(
  userMessage: string,
  turnCount: number,
): boolean {
  const text = userMessage.trim();
  if (!text) return turnCount >= 1;
  if (text.length >= 24) return true;
  return turnCount >= 1;
}

export async function runInvestigator(
  _supabase: SupabaseClient,
  _userId: string,
  userMessage: string,
  _history: Array<Record<string, unknown>>,
  investigationState: unknown,
  _meta?: Record<string, unknown>,
): Promise<InvestigatorResult> {
  const now = new Date().toISOString();
  const state = normalizeState(investigationState, now);
  const weekly = isWeeklyMode(state);
  const turnCount = Number(state.turn_count ?? 0) || 0;
  const complete = shouldCloseFallbackBilan(userMessage, turnCount);

  if (complete) {
    return {
      investigationComplete: true,
      content: weekly
        ? "Merci, je garde l'essentiel de ta semaine. On s'appuie dessus pour la suite."
        : "Merci, je garde l'essentiel du jour. On s'appuie dessus pour la suite.",
      newState: {
        ...state,
        status: "post_checkup_done",
        updated_at: now,
      },
    };
  }

  return {
    investigationComplete: false,
    content: weekly
      ? "On peut faire simple: qu'est-ce qui a le plus compté cette semaine, et qu'est-ce qui t'a freine ?"
      : "On peut faire simple: qu'est-ce qui a avance aujourd'hui, et qu'est-ce qui a coince ?",
    newState: {
      ...state,
      status: "in_progress",
      updated_at: now,
      turn_count: turnCount + 1,
      last_user_message: userMessage,
    },
  };
}
