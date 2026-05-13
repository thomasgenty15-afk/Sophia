import type { DispatcherMemoryPlan } from "../contracts/turn_frame.v1.ts";

export type { DispatcherMemoryPlan };

export type DispatcherModelTierHint = "lite" | "standard" | "deep";

export type DispatcherSignals = {
  safety: { level: "NONE" | "SENTRY"; confidence: number };
  interrupt: { kind: "NONE" | "EXPLICIT_STOP" | "BORED"; confidence: number };
  risk_score: number;
  needs_research: {
    detected: boolean;
    value?: boolean;
    query?: string | null;
    domain_hint?: string | null;
    confidence?: number;
  };
  checkup_intent: {
    detected: boolean;
    confidence?: number;
    trigger_phrase?: string | null;
  };
  plan_item_discussion: {
    detected: boolean;
    item_hint?: string;
    target_item_id?: string | null;
  };
  plan_feedback: {
    detected: boolean;
    kind?: string | null;
    confidence?: number;
    target_item_id?: string | null;
    target_title?: string | null;
    detail?: string | null;
    sentiment?: string | null;
  };
  track_progress_plan_item: {
    detected: boolean;
    target_item_id?: string | null;
    target_title?: string | null;
    status_hint?: string | null;
    value_hint?: number | null;
    date_hint?: string | null;
  };
  dashboard_preferences_intent: {
    detected: boolean;
    confidence?: number;
    fields?: string[];
    preference_keys?: string[];
  };
  dashboard_recurring_reminder_intent: {
    detected: boolean;
    confidence?: number;
    fields?: string[];
    reminder_fields?: string[];
    from_bilan?: boolean;
  };
  defense_card_win: {
    detected: boolean;
    confidence?: number;
    card_id?: string | null;
    situation_hint?: string | null;
  };
};

export const DEFAULT_SIGNALS: DispatcherSignals = {
  safety: { level: "NONE", confidence: 0 },
  interrupt: { kind: "NONE", confidence: 0 },
  risk_score: 0,
  needs_research: { detected: false },
  checkup_intent: { detected: false },
  plan_item_discussion: { detected: false },
  plan_feedback: { detected: false },
  track_progress_plan_item: { detected: false },
  dashboard_preferences_intent: { detected: false },
  dashboard_recurring_reminder_intent: { detected: false },
  defense_card_win: { detected: false },
};

export async function analyzeSignalsV2(
  input: {
    userMessage?: string;
    lastAssistantMessage?: string;
    last5Messages?: Array<{ role: string; content: string }>;
    signalHistory?: unknown[];
    activeMachine?: string | null;
    stateSnapshot?: Record<string, unknown> | null;
  },
  _opts?: { requestId?: string },
): Promise<{ signals: DispatcherSignals }> {
  const text = String(input?.userMessage ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const safetyDetected =
    /\b(suicide|me suicider|mourir|me faire du mal|j'en peux plus|jen peux plus)\b/
      .test(text);
  const explicitStop = /\b(stop|arrete|arrête|pause|laisse tomber)\b/.test(text);
  return {
    signals: {
      ...DEFAULT_SIGNALS,
      safety: safetyDetected
        ? { level: "SENTRY", confidence: 0.85 }
        : DEFAULT_SIGNALS.safety,
      interrupt: explicitStop
        ? { kind: "EXPLICIT_STOP", confidence: 0.8 }
        : DEFAULT_SIGNALS.interrupt,
      risk_score: safetyDetected ? 8 : 0,
    },
  };
}
