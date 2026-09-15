import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import type {
  ConfidenceLevel,
  MemoryLayerScope,
  MemoryRetrievalIntent,
  MetricKind,
  MomentumPosture,
  MomentumStateLabel,
  MorningNudgePosture,
  ProactiveBudgetClass,
  ProactiveWindowDecision,
  ProactiveWindowKind,
  RendezVousKind,
  RendezVousState,
  UserPlanItemEntryRow,
  WeeklyDecision,
} from "./v2-types.ts";

// ─── Event type constants (technical-schema section 6) ──

export const V2_EVENT_TYPES = {
  // 6.2 Lifecycle / onboarding / cycle
  CYCLE_CREATED: "cycle_created_v2",
  CYCLE_STRUCTURED: "cycle_structured_v2",
  CYCLE_PRIORITIZED: "cycle_prioritized_v2",
  CYCLE_PROFILE_COMPLETED: "cycle_profile_completed_v2",
  TRANSFORMATION_ACTIVATED: "transformation_activated_v2",
  TRANSFORMATION_COMPLETED: "transformation_completed_v2",
  TRANSFORMATION_HANDOFF_GENERATED: "transformation_handoff_generated_v2",
  PLAN_GENERATED: "plan_generated_v2",
  PLAN_ACTIVATED: "plan_activated_v2",

  // 6.3 Runtime
  CONVERSATION_PULSE_GENERATED: "conversation_pulse_generated_v2",
  WEEKLY_DIGEST_GENERATED: "weekly_digest_generated_v2",
  MOMENTUM_STATE_UPDATED: "momentum_state_updated_v2",
  ACTIVE_LOAD_RECOMPUTED: "active_load_recomputed_v2",
  DAILY_BILAN_DECIDED: "daily_bilan_decided_v2",
  DAILY_BILAN_COMPLETED: "daily_bilan_completed_v2",
  WEEKLY_BILAN_DECIDED: "weekly_bilan_decided_v2",
  WEEKLY_BILAN_COMPLETED: "weekly_bilan_completed_v2",
  PROACTIVE_WINDOW_DECIDED: "proactive_window_decided_v2",
  MORNING_NUDGE_GENERATED: "morning_nudge_generated_v2",
  RENDEZ_VOUS_STATE_CHANGED: "rendez_vous_state_changed_v2",
  REPAIR_MODE_ENTERED: "repair_mode_entered_v2",
  REPAIR_MODE_EXITED: "repair_mode_exited_v2",
  PLAN_ITEM_ENTRY_LOGGED: "plan_item_entry_logged_v2",
  METRIC_RECORDED: "metric_recorded_v2",

  // 6.4 Memory
  MEMORY_RETRIEVAL_EXECUTED: "memory_retrieval_executed_v2",
  MEMORY_PERSISTED: "memory_persisted_v2",
  MEMORY_HANDOFF: "memory_handoff_v2",

  // 6.5 Coaching
  COACHING_BLOCKER_DETECTED: "coaching_blocker_detected_v2",
  COACHING_INTERVENTION_PROPOSED: "coaching_intervention_proposed_v2",
  COACHING_INTERVENTION_RENDERED: "coaching_intervention_rendered_v2",
  COACHING_FOLLOW_UP_CAPTURED: "coaching_follow_up_captured_v2",
  COACHING_TECHNIQUE_DEPRIORITIZED: "coaching_technique_deprioritized_v2",

  // 6.7 Phase lifecycle
  PHASE_TRANSITION: "phase_transition_v2",
  PHASE_ITEMS_ACTIVATED: "phase_items_activated_v2",
} as const;

export type V2EventType = (typeof V2_EVENT_TYPES)[keyof typeof V2_EVENT_TYPES];

// ─── Payload types (technical-schema sections 6.2–6.6) ──

// 6.2 — Lifecycle events share this payload shape.
export type LifecycleEventPayload = {
  user_id: string;
  cycle_id: string;
  transformation_id?: string | null;
  plan_id?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

// 6.6 — conversation_pulse_generated_v2
export type ConversationPulseGeneratedPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  snapshot_id: string;
  dominant_tone: string;
  likely_need: string;
  proactive_risk: string;
};

// 6.6 — weekly_digest_generated_v2
export type WeeklyDigestGeneratedPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  snapshot_id: string;
  week_start: string;
  dominant_tone: string;
  confidence: ConfidenceLevel;
  message_count: number;
  active_days: number;
};

// 6.6 — momentum_state_updated_v2
export type MomentumStateUpdatedPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  current_state: MomentumStateLabel;
  posture: MomentumPosture;
  confidence: ConfidenceLevel;
  top_risk: string | null;
};

// 6.6 — proactive_window_decided_v2
export type ProactiveWindowDecidedPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  window_kind: ProactiveWindowKind;
  decision: ProactiveWindowDecision;
  budget_class: ProactiveBudgetClass;
  posture: MorningNudgePosture | null;
  confidence: ConfidenceLevel;
  reason: string;
};

// 6.6 — weekly_bilan_decided_v2
export type WeeklyBilanDecidedPayload = {
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  decision: WeeklyDecision;
  adjustment_count: number;
  suggested_posture_next_week: string | null;
  reasoning?: string | null;
  metadata?: Record<string, unknown>;
};

export type RendezVousStateChangedPayload = {
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  rendez_vous_id: string;
  kind: RendezVousKind;
  previous_state: RendezVousState | null;
  new_state: RendezVousState;
  budget_class: ProactiveBudgetClass;
  scheduled_for: string | null;
  trigger_reason: string;
  linked_checkin_id: string | null;
  metadata?: Record<string, unknown>;
};

export type PlanItemEntryLoggedPayload = {
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  entry_id: string;
  entry_kind: UserPlanItemEntryRow["entry_kind"];
  effective_at: string;
  metadata?: Record<string, unknown>;
};

export type MetricRecordedPayload = {
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  metric_id: string;
  metric_kind: MetricKind;
  value: string | null;
  recorded_at: string;
  metadata?: Record<string, unknown>;
};

// 6.4 — memory_retrieval_executed_v2
export type MemoryRetrievalExecutedPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  intent: MemoryRetrievalIntent;
  layers_loaded: MemoryLayerScope[];
  tokens_used: number;
  hit_count: number;
  budget_tier: string;
};

// 6.4 — memory_persisted_v2
export type MemoryPersistedPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  layer: MemoryLayerScope;
  action: "create" | "enrich" | "update" | "noop";
  memory_type: "topic" | "global" | "event" | "core_identity";
  memory_id: string | null;
};

// 6.4 — memory_handoff_v2
export type MemoryHandoffPayload = {
  user_id: string;
  cycle_id: string;
  from_transformation_id: string;
  to_transformation_id: string;
  wins_count: number;
  supports_kept_count: number;
  techniques_failed_count: number;
};

// 6.6 — repair_mode_entered_v2
export type RepairModeEnteredPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  reason: string;
  source: "router" | "watcher" | "process_checkins" | "system";
  proactive_no_echo_count: number;
  consent_decline_count: number;
};

// 6.6 — repair_mode_exited_v2
export type RepairModeExitedPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  reason: string;
  reopen_signals_count: number;
  duration_ms: number;
};

// Coaching + runtime events without specific payloads yet.
// Lots 6A–6C will refine these as they implement the emitters.
export type GenericV2EventPayload = {
  user_id: string;
  cycle_id: string | null;
  transformation_id?: string | null;
  metadata?: Record<string, unknown>;
};

// ─── Event → Payload map (type-safe dispatch) ──────────

export type V2EventPayloadMap = {
  // Lifecycle (6.2)
  cycle_created_v2: LifecycleEventPayload;
  cycle_structured_v2: LifecycleEventPayload;
  cycle_prioritized_v2: LifecycleEventPayload;
  cycle_profile_completed_v2: LifecycleEventPayload;
  transformation_activated_v2: LifecycleEventPayload;
  transformation_completed_v2: LifecycleEventPayload;
  transformation_handoff_generated_v2: LifecycleEventPayload;
  plan_generated_v2: LifecycleEventPayload;
  plan_activated_v2: LifecycleEventPayload;

  // Runtime (6.3 + 6.6)
  conversation_pulse_generated_v2: ConversationPulseGeneratedPayload;
  weekly_digest_generated_v2: WeeklyDigestGeneratedPayload;
  momentum_state_updated_v2: MomentumStateUpdatedPayload;
  active_load_recomputed_v2: GenericV2EventPayload;
  daily_bilan_decided_v2: GenericV2EventPayload;
  daily_bilan_completed_v2: GenericV2EventPayload;
  weekly_bilan_decided_v2: WeeklyBilanDecidedPayload;
  weekly_bilan_completed_v2: GenericV2EventPayload;
  proactive_window_decided_v2: ProactiveWindowDecidedPayload;
  morning_nudge_generated_v2: GenericV2EventPayload;
  rendez_vous_state_changed_v2: RendezVousStateChangedPayload;
  repair_mode_entered_v2: RepairModeEnteredPayload;
  repair_mode_exited_v2: RepairModeExitedPayload;
  plan_item_entry_logged_v2: PlanItemEntryLoggedPayload;
  metric_recorded_v2: MetricRecordedPayload;

  // Memory (6.4)
  memory_retrieval_executed_v2: MemoryRetrievalExecutedPayload;
  memory_persisted_v2: MemoryPersistedPayload;
  memory_handoff_v2: MemoryHandoffPayload;

  // Coaching (6.5)
  coaching_blocker_detected_v2: GenericV2EventPayload;
  coaching_intervention_proposed_v2: GenericV2EventPayload;
  coaching_intervention_rendered_v2: GenericV2EventPayload;
  coaching_follow_up_captured_v2: GenericV2EventPayload;
  coaching_technique_deprioritized_v2: GenericV2EventPayload;

  // Phase lifecycle (6.7)
  phase_transition_v2: LifecycleEventPayload;
  phase_items_activated_v2: LifecycleEventPayload;
};

// ─── logV2Event helper ─────────────────────────────────
//
// Persists V2 events into `system_runtime_snapshots`.
// The CHECK constraint must stay aligned with `V2_EVENT_TYPES` and the
// additive `cooldown_entry` runtime snapshot introduced in Phase A.

export async function logV2Event<T extends keyof V2EventPayloadMap>(
  supabase: SupabaseClient,
  eventType: T,
  payload: V2EventPayloadMap[T],
  options?: { throwOnError?: boolean },
): Promise<void> {
  const p = payload as {
    user_id: string;
    cycle_id: string | null;
    transformation_id?: string | null;
  };

  try {
    const result = await supabase
      .from("system_runtime_snapshots")
      .insert({
        user_id: p.user_id,
        cycle_id: p.cycle_id ?? null,
        transformation_id: p.transformation_id ?? null,
        snapshot_type: eventType as string,
        payload: payload as unknown as Record<string, unknown>,
      });

    if (result.error) {
      if (options?.throwOnError) throw result.error;
      console.warn(
        `[logV2Event] failed to persist ${eventType}:`,
        result.error.message,
      );
    }
  } catch (err) {
    if (options?.throwOnError) throw err;
    console.warn(
      `[logV2Event] unexpected error for ${eventType}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
