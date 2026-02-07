import {
  upsertDeepReasonsExploration,
  getActiveDeepReasonsExploration,
  pauseMachineForSafety,
  resumePausedMachine,
  getPausedMachine,
} from "../supervisor.ts"

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`${msg ? msg + " — " : ""}Assertion failed.\nExpected: ${e}\nActual:   ${a}`)
  }
}

function assertTruthy(val: unknown, msg?: string) {
  if (!val) throw new Error(`${msg ? msg + " — " : ""}Expected truthy, got: ${JSON.stringify(val)}`)
}

const NOW = new Date("2026-02-06T12:00:00Z")

function setupActiveDeepReasons(): { tempMemory: any } {
  // 1. Create a deep_reasons session
  const result = upsertDeepReasonsExploration({
    tempMemory: {},
    topic: "peur de l'échec",
    phase: "hypotheses",
    pattern: "fear",
    actionTitle: "Postuler à un job",
    source: "direct",
    now: NOW,
  })
  // 2. Attach a deep_reasons_state (as would happen in real flow)
  const deepState = {
    phase: "hypotheses",
    detected_pattern: "fear",
    action_context: { title: "Postuler à un job" },
    user_words: "j'ai peur d'échouer",
    source: "direct",
    turn_count: 3,
  }
  const tempMemory = {
    ...result.tempMemory,
    deep_reasons_state: deepState,
  }
  return { tempMemory }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAUSE: deep_reasons snapshot is preserved in candidateSnapshot
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("pauseMachineForSafety: deep_reasons state is preserved as candidate_snapshot", () => {
  const { tempMemory } = setupActiveDeepReasons()
  const session = getActiveDeepReasonsExploration(tempMemory)
  assertTruthy(session, "session should exist")

  const { tempMemory: paused, pausedState } = pauseMachineForSafety({
    tempMemory,
    session: session!,
    reason: "firefighter",
    now: NOW,
  })

  // Paused state should exist
  assertTruthy(pausedState, "pausedState should exist")
  assertEquals(pausedState.machine_type, "deep_reasons_exploration", "machine_type")
  assertEquals(pausedState.reason, "firefighter", "reason")

  // candidate_snapshot should contain the deep_reasons_state
  assertTruthy(pausedState.candidate_snapshot, "candidate_snapshot should exist")
  assertEquals(pausedState.candidate_snapshot.phase, "hypotheses", "snapshot phase")
  assertEquals(pausedState.candidate_snapshot.detected_pattern, "fear", "snapshot pattern")
  assertEquals(pausedState.candidate_snapshot.action_context?.title, "Postuler à un job", "snapshot action title")

  // Active session should be gone
  const activeAfter = getActiveDeepReasonsExploration(paused)
  assertEquals(activeAfter, null, "no active session after pause")
})

// ═══════════════════════════════════════════════════════════════════════════════
// RESUME: deep_reasons is properly restored from snapshot
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("resumePausedMachine: deep_reasons session + state restored from snapshot", () => {
  const { tempMemory } = setupActiveDeepReasons()
  const session = getActiveDeepReasonsExploration(tempMemory)
  assertTruthy(session, "session should exist")

  // Pause
  const { tempMemory: paused } = pauseMachineForSafety({
    tempMemory,
    session: session!,
    reason: "firefighter",
    now: NOW,
  })

  // Resume
  const resumeTime = new Date("2026-02-06T12:15:00Z")
  const { tempMemory: resumed, resumed: didResume, machineType } = resumePausedMachine({
    tempMemory: paused,
    now: resumeTime,
  })

  assertEquals(didResume, true, "resumed flag")
  assertEquals(machineType, "deep_reasons_exploration", "machine type")

  // Session should be active again
  const restoredSession = getActiveDeepReasonsExploration(resumed)
  assertTruthy(restoredSession, "session should be active again")
  // Topic is resolved from action_context.title (priority) → "Postuler à un job"
  assertEquals(restoredSession!.topic, "Postuler à un job", "topic restored from action_context.title")
  assertEquals(restoredSession!.phase, "hypotheses", "phase restored to hypotheses")

  // deep_reasons_state should be restored on tempMemory
  const dr = (resumed as any).deep_reasons_state
  assertTruthy(dr, "deep_reasons_state should exist")
  assertEquals(dr.phase, "hypotheses", "state phase")
  assertEquals(dr.detected_pattern, "fear", "state pattern")
  assertEquals(dr.action_context?.title, "Postuler à un job", "state action title")
  assertEquals(dr.turn_count, 3, "state turn_count preserved")

  // Paused state should be cleared
  const pausedAfter = getPausedMachine(resumed)
  assertEquals(pausedAfter, null, "paused state cleared after resume")
})

// ═══════════════════════════════════════════════════════════════════════════════
// RESUME with corrupted phase → fallback to "clarify"
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("resumePausedMachine: corrupted phase falls back to clarify", () => {
  const { tempMemory } = setupActiveDeepReasons()
  const session = getActiveDeepReasonsExploration(tempMemory)
  assertTruthy(session, "session should exist")

  // Pause
  const { tempMemory: paused } = pauseMachineForSafety({
    tempMemory,
    session: session!,
    reason: "sentry",
    now: NOW,
  })

  // Corrupt the phase in the snapshot via the internal key
  const pausedState = getPausedMachine(paused)
  assertTruthy(pausedState, "paused state")
  const corruptedTm = {
    ...paused,
    __paused_machine_v2: {
      ...pausedState,
      candidate_snapshot: {
        ...pausedState!.candidate_snapshot,
        phase: "INVALID_PHASE",
      },
    },
  }

  // Resume
  const { tempMemory: resumed, resumed: didResume } = resumePausedMachine({
    tempMemory: corruptedTm,
    now: new Date("2026-02-06T12:20:00Z"),
  })

  assertEquals(didResume, true, "resumed")

  // Phase should have fallen back to "clarify"
  const restoredSession = getActiveDeepReasonsExploration(resumed)
  assertTruthy(restoredSession, "session exists")
  assertEquals(restoredSession!.phase, "clarify", "corrupted phase → fallback to clarify")
})

// ═══════════════════════════════════════════════════════════════════════════════
// RESUME with no snapshot → still creates session with defaults
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("resumePausedMachine: missing snapshot uses defaults", () => {
  // Manually create a paused state with no candidate_snapshot (internal key)
  const tempMemory = {
    __paused_machine_v2: {
      machine_type: "deep_reasons_exploration",
      session_id: "sess_deep_abc",
      action_target: "Mon sujet",
      candidate_snapshot: null,
      paused_at: NOW.toISOString(),
      reason: "firefighter",
      resume_context: "On explorait: Mon sujet",
    },
  }

  const { tempMemory: resumed, resumed: didResume } = resumePausedMachine({
    tempMemory,
    now: new Date("2026-02-06T12:25:00Z"),
  })

  assertEquals(didResume, true, "resumed")

  const restoredSession = getActiveDeepReasonsExploration(resumed)
  assertTruthy(restoredSession, "session exists")
  assertEquals(restoredSession!.topic, "Mon sujet", "topic from action_target")
  assertEquals(restoredSession!.phase, "clarify", "default phase clarify")

  // No deep_reasons_state since snapshot was null
  assertEquals((resumed as any).deep_reasons_state, undefined, "no state without snapshot")
})

