import { assertEquals } from "jsr:@std/assert@1";

import {
  activateRepairMode,
  buildRepairModeEnteredPayload,
  buildRepairModeExitedPayload,
  CONSENT_DECLINE_THRESHOLD,
  deactivateRepairMode,
  evaluateRepairModeEntry,
  evaluateRepairModeExit,
  PROACTIVE_NO_ECHO_THRESHOLD,
  readRepairMode,
  recordSoftContact,
  REOPEN_SIGNALS_REQUIRED,
  REPAIR_MODE_KEY,
  type RepairModeEntrySignals,
  type RepairModeExitSignals,
  writeRepairMode,
} from "./repair_mode_engine.ts";
import type { RepairModeState } from "../_shared/v2-types.ts";
import type { StoredMomentumV2 } from "./momentum_state.ts";
import type { ProactiveHistoryEntry } from "./cooldown_engine.ts";

const NOW_ISO = "2026-03-25T10:00:00.000Z";

function defaultRepairState(
  overrides: Partial<RepairModeState> = {},
): RepairModeState {
  return {
    version: 1,
    active: false,
    entered_at: null,
    reason: null,
    source: "system",
    reopen_signals_count: 0,
    last_soft_contact_at: null,
    ...overrides,
  };
}

function defaultStoredMomentum(
  overrides: Partial<{
    consentEvents: Array<{ at: string; kind: string }>;
  }> = {},
): StoredMomentumV2 {
  return {
    version: 2,
    updated_at: NOW_ISO,
    current_state: "friction_legere",
    state_reason: "test",
    dimensions: {
      engagement: { level: "medium" },
      execution_traction: { level: "flat" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "good" },
      load_balance: { level: "balanced" },
    },
    assessment: { top_blocker: null, top_risk: null, confidence: "medium" },
    active_load: {
      current_load_score: 3,
      mission_slots_used: 1,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: false,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "simplify", confidence: "medium" },
    blockers: { blocker_kind: null, blocker_repeat_score: 0 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
    _internal: {
      signal_log: {
        emotional_turns: [],
        consent_events: (overrides.consentEvents ?? []) as any[],
        response_quality_events: [],
      },
      stability: {},
      sources: {},
      metrics_cache: {},
    },
  } as StoredMomentumV2;
}

function historyEntry(
  overrides: Partial<ProactiveHistoryEntry> = {},
): ProactiveHistoryEntry {
  return {
    event_context: "morning_nudge_v2",
    scheduled_for: NOW_ISO,
    status: "sent",
    posture: "focus_today",
    item_titles: [],
    user_reacted: false,
    window_kind: "morning_presence",
    ...overrides,
  };
}

function entrySignals(
  overrides: Partial<RepairModeEntrySignals> = {},
): RepairModeEntrySignals {
  return {
    proactiveHistory: [],
    momentumV2: defaultStoredMomentum(),
    conversationPulse: null,
    nowIso: NOW_ISO,
    ...overrides,
  };
}

// ── Read / Write ────────────────────────────────────────────────────────────

Deno.test("readRepairMode: empty temp_memory returns default", () => {
  const state = readRepairMode({});
  assertEquals(state.active, false);
  assertEquals(state.version, 1);
  assertEquals(state.reopen_signals_count, 0);
});

Deno.test("readRepairMode: null temp_memory returns default", () => {
  const state = readRepairMode(null);
  assertEquals(state.active, false);
});

Deno.test("readRepairMode: parses stored state", () => {
  const tm = {
    [REPAIR_MODE_KEY]: {
      version: 1,
      active: true,
      entered_at: NOW_ISO,
      reason: "test_reason",
      source: "router",
      reopen_signals_count: 1,
      last_soft_contact_at: null,
    },
  };
  const state = readRepairMode(tm);
  assertEquals(state.active, true);
  assertEquals(state.reason, "test_reason");
  assertEquals(state.source, "router");
  assertEquals(state.reopen_signals_count, 1);
});

Deno.test("writeRepairMode: persists to temp_memory", () => {
  const state = defaultRepairState({ active: true, reason: "activated" });
  const tm = writeRepairMode({}, state);
  assertEquals((tm as any)[REPAIR_MODE_KEY].active, true);
  assertEquals((tm as any)[REPAIR_MODE_KEY].reason, "activated");
});

Deno.test("writeRepairMode: preserves existing keys", () => {
  const state = defaultRepairState();
  const tm = writeRepairMode({ __other_key: "keep" }, state);
  assertEquals((tm as any).__other_key, "keep");
  assertEquals((tm as any)[REPAIR_MODE_KEY].version, 1);
});

// ── Entry Detection ─────────────────────────────────────────────────────────

Deno.test("entry: already active → no re-entry", () => {
  const current = defaultRepairState({ active: true });
  const result = evaluateRepairModeEntry(current, entrySignals());
  assertEquals(result.shouldEnter, false);
});

Deno.test("entry: proactives without echo triggers repair", () => {
  const noEchoHistory = Array.from(
    { length: PROACTIVE_NO_ECHO_THRESHOLD },
    () => historyEntry({ user_reacted: false }),
  );
  const current = defaultRepairState();
  const result = evaluateRepairModeEntry(
    current,
    entrySignals({ proactiveHistory: noEchoHistory }),
  );
  assertEquals(result.shouldEnter, true);
  assertEquals(
    result.reason,
    `proactives_without_echo:${PROACTIVE_NO_ECHO_THRESHOLD}`,
  );
});

Deno.test("entry: proactives with echo at end does not trigger", () => {
  const history = [
    historyEntry({ user_reacted: false }),
    historyEntry({ user_reacted: false }),
    historyEntry({ user_reacted: true }),
  ];
  const current = defaultRepairState();
  const result = evaluateRepairModeEntry(
    current,
    entrySignals({ proactiveHistory: history }),
  );
  assertEquals(result.shouldEnter, false);
});

Deno.test("entry: repeated consent declines triggers repair", () => {
  const declineEvents = Array.from(
    { length: CONSENT_DECLINE_THRESHOLD },
    (_, i) => ({ at: `2026-03-2${i}T12:00:00Z`, kind: "soft_decline" }),
  );
  const momentum = defaultStoredMomentum({ consentEvents: declineEvents });
  const current = defaultRepairState();
  const result = evaluateRepairModeEntry(
    current,
    entrySignals({ momentumV2: momentum }),
  );
  assertEquals(result.shouldEnter, true);
  assertEquals(
    result.reason,
    `repeated_consent_declines:${CONSENT_DECLINE_THRESHOLD}`,
  );
});

Deno.test("entry: mix of soft_decline and explicit_stop counts", () => {
  const declineEvents = [
    { at: "2026-03-20T12:00:00Z", kind: "soft_decline" },
    { at: "2026-03-21T12:00:00Z", kind: "explicit_stop" },
    { at: "2026-03-22T12:00:00Z", kind: "soft_decline" },
  ];
  const momentum = defaultStoredMomentum({ consentEvents: declineEvents });
  const current = defaultRepairState();
  const result = evaluateRepairModeEntry(
    current,
    entrySignals({ momentumV2: momentum }),
  );
  assertEquals(result.shouldEnter, true);
});

Deno.test("entry: pulse silence + high risk triggers repair", () => {
  const pulse = {
    version: 1 as const,
    generated_at: NOW_ISO,
    window_days: 7 as const,
    last_72h_weight: 0.6,
    tone: {
      dominant: "closed" as const,
      emotional_load: "low" as const,
      relational_openness: "closed" as const,
    },
    trajectory: {
      direction: "down" as const,
      confidence: "medium" as const,
      summary: "User pulling away",
    },
    highlights: {
      wins: [],
      friction_points: [],
      support_that_helped: [],
      unresolved_tensions: [],
    },
    signals: {
      top_blocker: null,
      likely_need: "silence" as const,
      upcoming_event: null,
      proactive_risk: "high" as const,
    },
    evidence_refs: { message_ids: [], event_ids: [] },
  };
  const current = defaultRepairState();
  const result = evaluateRepairModeEntry(
    current,
    entrySignals({ conversationPulse: pulse }),
  );
  assertEquals(result.shouldEnter, true);
  assertEquals(result.reason, "pulse_silence_high_risk");
});

Deno.test("entry: pulse silence + low risk does not trigger", () => {
  const pulse = {
    version: 1 as const,
    generated_at: NOW_ISO,
    window_days: 7 as const,
    last_72h_weight: 0.6,
    tone: {
      dominant: "steady" as const,
      emotional_load: "low" as const,
      relational_openness: "open" as const,
    },
    trajectory: {
      direction: "flat" as const,
      confidence: "medium" as const,
      summary: "Stable",
    },
    highlights: {
      wins: [],
      friction_points: [],
      support_that_helped: [],
      unresolved_tensions: [],
    },
    signals: {
      top_blocker: null,
      likely_need: "silence" as const,
      upcoming_event: null,
      proactive_risk: "low" as const,
    },
    evidence_refs: { message_ids: [], event_ids: [] },
  };
  const current = defaultRepairState();
  const result = evaluateRepairModeEntry(
    current,
    entrySignals({ conversationPulse: pulse }),
  );
  assertEquals(result.shouldEnter, false);
});

Deno.test("entry: no signals → no entry", () => {
  const current = defaultRepairState();
  const result = evaluateRepairModeEntry(current, entrySignals());
  assertEquals(result.shouldEnter, false);
  assertEquals(result.reason, null);
});

// ── Exit Detection ──────────────────────────────────────────────────────────

Deno.test("exit: not active → no-op", () => {
  const current = defaultRepairState();
  const signals: RepairModeExitSignals = {
    responseQuality: "substantive",
    consentLevel: "open",
  };
  const result = evaluateRepairModeExit(current, signals);
  assertEquals(result.shouldExit, false);
  assertEquals(result.updatedState, current);
});

Deno.test("exit: substantive + open accumulates reopen signal", () => {
  const current = defaultRepairState({ active: true });
  const signals: RepairModeExitSignals = {
    responseQuality: "substantive",
    consentLevel: "open",
  };
  const result = evaluateRepairModeExit(current, signals);
  assertEquals(result.updatedState.reopen_signals_count, 1);
  assertEquals(result.shouldExit, REOPEN_SIGNALS_REQUIRED <= 1);
});

Deno.test("exit: enough reopen signals triggers exit", () => {
  const current = defaultRepairState({
    active: true,
    reopen_signals_count: REOPEN_SIGNALS_REQUIRED - 1,
  });
  const signals: RepairModeExitSignals = {
    responseQuality: "substantive",
    consentLevel: "open",
  };
  const result = evaluateRepairModeExit(current, signals);
  assertEquals(result.shouldExit, true);
  assertEquals(result.updatedState.active, false);
  assertEquals(
    result.updatedState.reopen_signals_count,
    REOPEN_SIGNALS_REQUIRED,
  );
});

Deno.test("exit: minimal message does not accumulate signal", () => {
  const current = defaultRepairState({ active: true });
  const signals: RepairModeExitSignals = {
    responseQuality: "minimal",
    consentLevel: "open",
  };
  const result = evaluateRepairModeExit(current, signals);
  assertEquals(result.shouldExit, false);
  assertEquals(result.updatedState.reopen_signals_count, 0);
});

Deno.test("exit: brief + open accumulates signal", () => {
  const current = defaultRepairState({ active: true });
  const signals: RepairModeExitSignals = {
    responseQuality: "brief",
    consentLevel: "open",
  };
  const result = evaluateRepairModeExit(current, signals);
  assertEquals(result.updatedState.reopen_signals_count, 1);
});

Deno.test("exit: closed consent does not accumulate", () => {
  const current = defaultRepairState({ active: true });
  const signals: RepairModeExitSignals = {
    responseQuality: "substantive",
    consentLevel: "closed",
  };
  const result = evaluateRepairModeExit(current, signals);
  assertEquals(result.shouldExit, false);
  assertEquals(result.updatedState.reopen_signals_count, 0);
});

// ── Activate / Deactivate ───────────────────────────────────────────────────

Deno.test("activateRepairMode: produces active state", () => {
  const state = activateRepairMode({
    reason: "proactives_without_echo:3",
    source: "watcher",
    nowIso: NOW_ISO,
  });
  assertEquals(state.active, true);
  assertEquals(state.entered_at, NOW_ISO);
  assertEquals(state.source, "watcher");
  assertEquals(state.reopen_signals_count, 0);
});

Deno.test("deactivateRepairMode: produces inactive state", () => {
  const active = defaultRepairState({
    active: true,
    entered_at: NOW_ISO,
    reason: "test",
    source: "router",
    reopen_signals_count: 2,
  });
  const state = deactivateRepairMode(active);
  assertEquals(state.active, false);
  assertEquals(state.entered_at, null);
  assertEquals(state.reason, null);
  assertEquals(state.source, "router");
  assertEquals(state.reopen_signals_count, 0);
});

// ── Soft Contact ────────────────────────────────────────────────────────────

Deno.test("recordSoftContact: updates last_soft_contact_at when active", () => {
  const active = defaultRepairState({ active: true });
  const updated = recordSoftContact(active, NOW_ISO);
  assertEquals(updated.last_soft_contact_at, NOW_ISO);
});

Deno.test("recordSoftContact: no-op when not active", () => {
  const inactive = defaultRepairState();
  const updated = recordSoftContact(inactive, NOW_ISO);
  assertEquals(updated.last_soft_contact_at, null);
});

// ── Event Payloads ──────────────────────────────────────────────────────────

Deno.test("buildRepairModeEnteredPayload: includes all fields", () => {
  const payload = buildRepairModeEnteredPayload({
    userId: "user-1",
    cycleId: "cycle-1",
    transformationId: "t-1",
    reason: "proactives_without_echo:3",
    source: "watcher",
    proactiveNoEchoCount: 3,
    consentDeclineCount: 0,
  });
  assertEquals(payload.user_id, "user-1");
  assertEquals(payload.reason, "proactives_without_echo:3");
  assertEquals(payload.proactive_no_echo_count, 3);
});

Deno.test("buildRepairModeExitedPayload: includes duration", () => {
  const payload = buildRepairModeExitedPayload({
    userId: "user-1",
    cycleId: "cycle-1",
    transformationId: "t-1",
    reason: "reopen_signals_reached:2",
    reopenSignalsCount: 2,
    durationMs: 172800000,
  });
  assertEquals(payload.reopen_signals_count, 2);
  assertEquals(payload.duration_ms, 172800000);
});
