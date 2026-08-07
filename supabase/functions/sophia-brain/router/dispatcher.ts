import type {
  DispatcherMemoryPlan,
  DispatcherResearchSignal,
} from "../contracts/turn_frame.v1.ts";

export type { DispatcherMemoryPlan, DispatcherResearchSignal };

export type DispatcherModelTierHint = "lite" | "standard" | "deep";

export type DispatcherSignals = {
  safety: { level: "NONE" | "SENTRY"; confidence: number };
  interrupt: { kind: "NONE" | "EXPLICIT_STOP" | "BORED"; confidence: number };
  risk_score: number;
  needs_research: DispatcherResearchSignal;
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
};
