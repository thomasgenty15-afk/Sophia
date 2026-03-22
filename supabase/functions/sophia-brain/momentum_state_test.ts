import { assertEquals, assertMatch } from "jsr:@std/assert";

import type { DispatcherSignals } from "./router/dispatcher.ts";
import {
  applyRouterMomentumSignals,
  deriveMomentumFromSnapshot,
  readMomentumState,
  writeMomentumState,
} from "./momentum_state.ts";

function baseSignals(): DispatcherSignals {
  return {
    safety: { level: "NONE", confidence: 0 },
    interrupt: { kind: "NONE", confidence: 0 },
    needs_explanation: { value: false, confidence: 0 },
    needs_research: { value: false, confidence: 0 },
    checkup_intent: { detected: false, confidence: 0 },
    create_action: { detected: false },
    update_action: { detected: false },
    breakdown_action: { detected: false },
    track_progress_action: { detected: false },
    track_progress_vital_sign: { detected: false },
    track_progress_north_star: { detected: false },
    action_discussion: { detected: false },
    activate_action: { detected: false },
    delete_action: { detected: false },
    deactivate_action: { detected: false },
    dashboard_preferences_intent: { detected: false, confidence: 0 },
    dashboard_recurring_reminder_intent: { detected: false, confidence: 0 },
    risk_score: 0,
  };
}

Deno.test("applyRouterMomentumSignals: explicit stop closes consent and sets pause_consentie", () => {
  const signals = baseSignals();
  signals.interrupt = { kind: "EXPLICIT_STOP", confidence: 0.92 };

  const next = applyRouterMomentumSignals({
    tempMemory: {},
    userMessage: "Stop, pas maintenant.",
    dispatcherSignals: signals,
    nowIso: "2026-03-19T10:00:00.000Z",
  });

  assertEquals(next.dimensions.consent.level, "closed");
  assertEquals(next.current_state, "pause_consentie");
});

Deno.test("applyRouterMomentumSignals: emotional overload takes priority over other states", () => {
  const signals = baseSignals();

  const next = applyRouterMomentumSignals({
    tempMemory: {},
    userMessage: "J'en peux plus, je craque complet cette semaine.",
    dispatcherSignals: signals,
    nowIso: "2026-03-19T10:00:00.000Z",
  });

  assertEquals(next.dimensions.emotional_load.level, "high");
  assertEquals(next.current_state, "soutien_emotionnel");
});

Deno.test("deriveMomentumFromSnapshot: substantive recent messages plus completed actions => momentum", () => {
  const current = readMomentumState({});
  const next = deriveMomentumFromSnapshot({
    current,
    nowIso: "2026-03-19T10:00:00.000Z",
    snapshot: {
      profilePauseUntilIso: null,
      recentMessages: [
        {
          role: "assistant",
          content: "Comment avance ta semaine ?",
          created_at: "2026-03-18T08:00:00.000Z",
        },
        {
          role: "user",
          content: "J'ai fait mon footing et avancé sur mon rituel du soir.",
          created_at: "2026-03-18T08:15:00.000Z",
        },
        {
          role: "user",
          content: "Aujourd'hui j'ai aussi réussi a tenir ma routine du matin.",
          created_at: "2026-03-19T08:00:00.000Z",
        },
      ],
      activeActionsCount: 2,
      actionEntries: [
        { status: "completed", performed_at: "2026-03-18T07:30:00.000Z" },
        { status: "completed", performed_at: "2026-03-19T07:20:00.000Z" },
      ],
      activeVitals: [],
      vitalEntries: [],
    },
  });

  assertEquals(next.dimensions.engagement.level, "high");
  assertEquals(next.dimensions.progression.level, "up");
  assertEquals(next.dimensions.consent.level, "open");
  assertEquals(next.current_state, "momentum");
});

Deno.test("deriveMomentumFromSnapshot: active pause on profile => pause_consentie", () => {
  const current = readMomentumState({});
  const next = deriveMomentumFromSnapshot({
    current,
    nowIso: "2026-03-19T10:00:00.000Z",
    snapshot: {
      profilePauseUntilIso: "2026-03-22T10:00:00.000Z",
      recentMessages: [
        {
          role: "user",
          content: "On verra plus tard.",
          created_at: "2026-03-18T08:15:00.000Z",
        },
      ],
      activeActionsCount: 1,
      actionEntries: [],
      activeVitals: [],
      vitalEntries: [],
    },
  });

  assertEquals(next.dimensions.consent.level, "closed");
  assertEquals(next.current_state, "pause_consentie");
});

Deno.test("applyRouterMomentumSignals: one weak turn does not immediately degrade momentum", () => {
  const signals = baseSignals();
  const current = {
    ...readMomentumState({}),
    current_state: "momentum" as const,
    state_reason: "progression_up_and_open_consent",
    dimensions: {
      engagement: { level: "high" as const, reason: "multiple_substantive_recent_messages" },
      progression: { level: "flat" as const, reason: "mixed_or_stable_progression" },
      emotional_load: { level: "low" as const, reason: "no_recent_emotional_signal" },
      consent: { level: "open" as const, reason: "no_recent_decline" },
    },
    stability: {
      stable_since_at: "2026-03-18T10:00:00.000Z",
    },
    metrics: {
      last_user_turn_at: "2026-03-18T10:00:00.000Z",
      last_user_turn_quality: "substantive" as const,
      days_since_last_user_message: 0,
    },
  };

  const next = applyRouterMomentumSignals({
    tempMemory: writeMomentumState({}, current),
    userMessage: "ok",
    dispatcherSignals: signals,
    nowIso: "2026-03-19T10:00:00.000Z",
  });

  assertEquals(next.current_state, "momentum");
  assertEquals(next.stability.pending_transition?.target_state, "friction_legere");
  assertEquals(next.stability.pending_transition?.confirmations, 1);
});

Deno.test("applyRouterMomentumSignals: repeated weak turns can confirm momentum -> friction_legere", () => {
  const signals = baseSignals();
  const start = {
    ...readMomentumState({}),
    current_state: "momentum" as const,
    state_reason: "progression_up_and_open_consent",
    dimensions: {
      engagement: { level: "high" as const, reason: "multiple_substantive_recent_messages" },
      progression: { level: "flat" as const, reason: "mixed_or_stable_progression" },
      emotional_load: { level: "low" as const, reason: "no_recent_emotional_signal" },
      consent: { level: "open" as const, reason: "no_recent_decline" },
    },
    stability: {
      stable_since_at: "2026-03-18T10:00:00.000Z",
    },
    metrics: {
      last_user_turn_at: "2026-03-18T10:00:00.000Z",
      last_user_turn_quality: "substantive" as const,
      days_since_last_user_message: 0,
    },
  };

  const turn1 = applyRouterMomentumSignals({
    tempMemory: writeMomentumState({}, start),
    userMessage: "ok",
    dispatcherSignals: signals,
    nowIso: "2026-03-19T10:00:00.000Z",
  });
  const turn2 = applyRouterMomentumSignals({
    tempMemory: writeMomentumState({}, turn1),
    userMessage: "oui",
    dispatcherSignals: signals,
    nowIso: "2026-03-19T18:00:00.000Z",
  });

  assertEquals(turn2.current_state, "friction_legere");
  assertEquals(turn2.stability.pending_transition, undefined);
});

Deno.test("applyRouterMomentumSignals: strong completed-action turn can recover to momentum immediately", () => {
  const signals = baseSignals();
  signals.track_progress_action = {
    detected: true,
    status_hint: "completed",
  };

  const current = {
    ...readMomentumState({}),
    current_state: "friction_legere" as const,
    state_reason: "engaged_but_not_clearly_progressing",
    dimensions: {
      engagement: { level: "medium" as const, reason: "moderate_recent_interaction" },
      progression: { level: "flat" as const, reason: "mixed_or_stable_progression" },
      emotional_load: { level: "low" as const, reason: "no_recent_emotional_signal" },
      consent: { level: "open" as const, reason: "no_recent_decline" },
    },
    stability: {
      stable_since_at: "2026-03-18T10:00:00.000Z",
    },
    metrics: {
      last_user_turn_at: "2026-03-18T10:00:00.000Z",
      last_user_turn_quality: "brief" as const,
      days_since_last_user_message: 0,
    },
  };

  const next = applyRouterMomentumSignals({
    tempMemory: writeMomentumState({}, current),
    userMessage: "J'ai fait ma séance et mon rituel.",
    dispatcherSignals: signals,
    nowIso: "2026-03-19T10:00:00.000Z",
  });

  assertEquals(next.current_state, "momentum");
});

Deno.test("applyRouterMomentumSignals: missed action with blocker reason updates blocker memory", () => {
  const signals = baseSignals();
  signals.track_progress_action = {
    detected: true,
    target_hint: "Sport",
    status_hint: "missed",
  };

  const next = applyRouterMomentumSignals({
    tempMemory: {},
    userMessage: "J'ai pas fait le sport, j'ai pas eu le temps ce soir.",
    dispatcherSignals: signals,
    nowIso: "2026-03-19T10:00:00.000Z",
  });

  assertEquals(next.blocker_memory.actions.length, 1);
  assertEquals(next.blocker_memory.actions[0]?.action_title, "Sport");
  assertEquals(next.blocker_memory.actions[0]?.current_category, "time");
  assertEquals(next.metrics.active_blockers_count, 1);
});

Deno.test("deriveMomentumFromSnapshot: watcher keeps blocker evolution over time", () => {
  const current = readMomentumState(writeMomentumState({}, {
    version: 1,
    current_state: "friction_legere",
    dimensions: {
      engagement: { level: "medium" },
      progression: { level: "flat" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
    },
    metrics: {},
    blocker_memory: {
      updated_at: "2026-03-15T10:00:00.000Z",
      actions: [{
        action_key: "routine du soir",
        action_title: "Routine du soir",
        current_category: "energy",
        first_seen_at: "2026-03-15T10:00:00.000Z",
        last_seen_at: "2026-03-15T10:00:00.000Z",
        status: "active",
        stage: "new",
        mention_count_total: 1,
        mention_count_21d: 1,
        last_reason_excerpt: "J'etais fatigue",
        history: [{
          at: "2026-03-15T10:00:00.000Z",
          category: "energy",
          source: "router",
          reason_excerpt: "J'etais fatigue",
          evidence_kind: "missed",
        }],
      }],
    },
    signal_log: {
      emotional_turns: [],
      consent_events: [],
      response_quality_events: [],
    },
    stability: {},
    sources: {},
  }));

  const next = deriveMomentumFromSnapshot({
    current,
    nowIso: "2026-03-19T10:00:00.000Z",
    snapshot: {
      profilePauseUntilIso: null,
      recentMessages: [],
      activeActionsCount: 1,
      actionEntries: [],
      blockerEntries: [{
        action_title: "Routine du soir",
        note: "Encore trop fatigue le soir",
        status: "missed",
        performed_at: "2026-03-18T20:00:00.000Z",
      }],
      activeVitals: [],
      vitalEntries: [],
    },
  });

  assertEquals(next.blocker_memory.actions[0]?.stage, "recurrent");
  assertEquals(next.blocker_memory.actions[0]?.current_category, "energy");
  assertMatch(String(next.blocker_memory.actions[0]?.last_reason_excerpt ?? ""), /fatigue/i);
});

Deno.test("applyRouterMomentumSignals: pause_consentie is sticky on weak reopen signal", () => {
  const signals = baseSignals();
  const current = {
    ...readMomentumState({}),
    current_state: "pause_consentie" as const,
    state_reason: "consent_closed",
    dimensions: {
      engagement: { level: "low" as const, reason: "recent_silence_or_weak_responses" },
      progression: { level: "unknown" as const, reason: "no_progression_data" },
      emotional_load: { level: "low" as const, reason: "no_recent_emotional_signal" },
      consent: { level: "closed" as const, reason: "recent_explicit_stop_without_reaccept" },
    },
    stability: {
      stable_since_at: "2026-03-18T10:00:00.000Z",
    },
    metrics: {
      last_user_turn_at: "2026-03-18T10:00:00.000Z",
      last_user_turn_quality: "brief" as const,
      days_since_last_user_message: 1,
    },
  };

  const next = applyRouterMomentumSignals({
    tempMemory: writeMomentumState({}, current),
    userMessage: "ok",
    dispatcherSignals: signals,
    nowIso: "2026-03-19T10:00:00.000Z",
  });

  assertEquals(next.current_state, "pause_consentie");
  assertEquals(next.stability.pending_transition?.confirmations, 1);
});

Deno.test("deriveMomentumFromSnapshot: watcher can commit evitement -> reactivation on prolonged silence", () => {
  const current = {
    ...readMomentumState({}),
    current_state: "evitement" as const,
    state_reason: "default_gray_zone_state",
    dimensions: {
      engagement: { level: "low" as const, reason: "recent_silence_or_weak_responses" },
      progression: { level: "flat" as const, reason: "mixed_or_stable_progression" },
      emotional_load: { level: "low" as const, reason: "no_recent_emotional_signal" },
      consent: { level: "fragile" as const, reason: "recent_soft_decline_or_old_stop" },
    },
    stability: {
      stable_since_at: "2026-03-10T10:00:00.000Z",
    },
    metrics: {
      last_user_turn_at: "2026-03-14T10:00:00.000Z",
      last_user_turn_quality: "minimal" as const,
      days_since_last_user_message: 5,
    },
  };

  const next = deriveMomentumFromSnapshot({
    current,
    nowIso: "2026-03-19T10:00:00.000Z",
    snapshot: {
      profilePauseUntilIso: null,
      recentMessages: [
        {
          role: "user",
          content: "oui oui",
          created_at: "2026-03-14T10:00:00.000Z",
        },
        {
          role: "assistant",
          content: "Tu veux qu'on reprenne ?",
          created_at: "2026-03-15T08:00:00.000Z",
        },
      ],
      activeActionsCount: 1,
      actionEntries: [],
      activeVitals: [],
      vitalEntries: [],
    },
  });

  assertEquals(next.current_state, "reactivation");
});
