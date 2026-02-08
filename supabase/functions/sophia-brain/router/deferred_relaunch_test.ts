import {
  getPendingRelaunchConsent,
  processRelaunchConsentResponse,
  setPendingRelaunchConsent,
} from "./deferred_relaunch.ts";
import type { DeferredTopicV2 } from "./deferred_topics_v2.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `${
        msg ? msg + " — " : ""
      }Assertion failed.\nExpected: ${e}\nActual:   ${a}`,
    );
  }
}

function makeTopic(overrides?: Partial<DeferredTopicV2>): DeferredTopicV2 {
  return {
    id: "test-topic-1",
    machine_type: "deep_reasons",
    action_target: "Faire du sport",
    signal_summaries: [{
      summary: "flemme chronique",
      created_at: new Date().toISOString(),
    }],
    trigger_count: 1,
    created_at: new Date().toISOString(),
    last_triggered_at: new Date().toISOString(),
    ...overrides,
  } as DeferredTopicV2;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNCLEAR CONSENT: first unclear → re-ask
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("processRelaunchConsentResponse: first unclear schedules re-ask", () => {
  const topic = makeTopic();
  const { tempMemory: tm0 } = setPendingRelaunchConsent({
    tempMemory: {},
    topic,
  });

  const result = processRelaunchConsentResponse({
    tempMemory: tm0,
    userMessage: "hmm je sais pas trop",
    profileConfirmDeferredKey: "__profile_deferred",
    pendingResolutionSignal: {
      status: "unresolved",
      pending_type: "relaunch_consent",
      decision_code: "common.unclear",
      confidence: 0.8,
      reason_short: "ambiguous",
    },
  });

  // Should be handled
  assertEquals(result.handled, true, "handled");
  assertEquals(result.shouldInitMachine, false, "no machine init");
  assertEquals(result.unclearReaskScheduled, true, "reask scheduled");
  assertEquals(result.droppedAfterUnclear, undefined, "not dropped");
  assertEquals(result.declineMessage, undefined, "no decline message");

  // Pending consent should still be there with count=1
  const pending = getPendingRelaunchConsent(result.tempMemory);
  assertEquals(pending !== null, true, "pending still exists");
  assertEquals(pending!.unclear_reask_count, 1, "unclear count incremented");

  // __ask_relaunch_consent flag should be re-set for the agent addon
  const askFlag = (result.tempMemory as any).__ask_relaunch_consent;
  assertEquals(askFlag?.machine_type, "deep_reasons", "ask flag machine_type");
  assertEquals(
    askFlag?.action_target,
    "Faire du sport",
    "ask flag action_target",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// UNCLEAR CONSENT: second unclear → drop with decline message
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("processRelaunchConsentResponse: second unclear drops gracefully", () => {
  const topic = makeTopic();
  let { tempMemory } = setPendingRelaunchConsent({ tempMemory: {}, topic });

  // Simulate first unclear (count goes from 0 to 1)
  const first = processRelaunchConsentResponse({
    tempMemory,
    userMessage: "bof",
    profileConfirmDeferredKey: "__profile_deferred",
    pendingResolutionSignal: {
      status: "unresolved",
      pending_type: "relaunch_consent",
      decision_code: "common.unclear",
      confidence: 0.9,
      reason_short: "ambiguous",
    },
  });
  tempMemory = first.tempMemory;

  // Simulate second unclear (count is already 1 → should drop)
  const second = processRelaunchConsentResponse({
    tempMemory,
    userMessage: "euh",
    profileConfirmDeferredKey: "__profile_deferred",
    pendingResolutionSignal: {
      status: "unresolved",
      pending_type: "relaunch_consent",
      decision_code: "common.unclear",
      confidence: 0.9,
      reason_short: "ambiguous",
    },
  });

  assertEquals(second.handled, true, "handled");
  assertEquals(second.shouldInitMachine, false, "no machine init");
  assertEquals(second.unclearReaskScheduled, undefined, "no reask this time");
  assertEquals(second.droppedAfterUnclear, true, "dropped after unclear");
  assertEquals(typeof second.declineMessage, "string", "has decline message");
  assertEquals(
    second.declineMessage!.length > 0,
    true,
    "decline message not empty",
  );

  // Pending consent should be cleared
  const pending = getPendingRelaunchConsent(second.tempMemory);
  assertEquals(pending, null, "pending cleared after drop");
});

// ═══════════════════════════════════════════════════════════════════════════════
// YES after first unclear → still works
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("processRelaunchConsentResponse: yes after first unclear initializes machine", () => {
  const topic = makeTopic();
  let { tempMemory } = setPendingRelaunchConsent({ tempMemory: {}, topic });

  // First: unclear
  const first = processRelaunchConsentResponse({
    tempMemory,
    userMessage: "bof",
    profileConfirmDeferredKey: "__profile_deferred",
    pendingResolutionSignal: {
      status: "unresolved",
      pending_type: "relaunch_consent",
      decision_code: "common.unclear",
      confidence: 0.9,
      reason_short: "ambiguous",
    },
  });
  tempMemory = first.tempMemory;

  // Second: user says yes
  const second = processRelaunchConsentResponse({
    tempMemory,
    userMessage: "oui vas-y",
    profileConfirmDeferredKey: "__profile_deferred",
    pendingResolutionSignal: {
      status: "resolved",
      pending_type: "relaunch_consent",
      decision_code: "relaunch.accept",
      confidence: 0.95,
      reason_short: "accepted",
    },
  });

  assertEquals(second.handled, true, "handled");
  assertEquals(second.shouldInitMachine, true, "machine initialized");
  assertEquals(second.machineType, "deep_reasons", "correct machine type");
  assertEquals(second.nextMode, "architect", "next mode is architect");

  // Pending consent should be cleared
  const pending = getPendingRelaunchConsent(second.tempMemory);
  assertEquals(pending, null, "pending cleared after accept");
});

Deno.test("processRelaunchConsentResponse: checkup accept does not recreate entry pending", () => {
  const topic = makeTopic({
    machine_type: "checkup",
    action_target: undefined,
  });
  const { tempMemory: tm0 } = setPendingRelaunchConsent({
    tempMemory: {
      __checkup_entry_pending: true,
      __ask_checkup_confirmation: true,
    },
    topic,
  });

  const result = processRelaunchConsentResponse({
    tempMemory: tm0,
    userMessage: "oui vas-y",
    profileConfirmDeferredKey: "__profile_deferred",
    pendingResolutionSignal: {
      status: "resolved",
      pending_type: "relaunch_consent",
      decision_code: "relaunch.accept",
      confidence: 0.95,
      reason_short: "accepted",
    },
  });

  assertEquals(result.handled, true, "handled");
  assertEquals(result.shouldInitMachine, true, "machine initialized");
  assertEquals(result.machineType, "checkup", "correct machine type");
  assertEquals(
    result.nextMode,
    "investigator",
    "checkup routes to investigator",
  );
  assertEquals(
    (result.tempMemory as any).__checkup_entry_pending,
    undefined,
    "entry pending cleared",
  );
  assertEquals(
    (result.tempMemory as any).__ask_checkup_confirmation,
    undefined,
    "entry ask flag cleared",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// NO after first unclear → decline
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("processRelaunchConsentResponse: no after first unclear declines", () => {
  const topic = makeTopic();
  let { tempMemory } = setPendingRelaunchConsent({ tempMemory: {}, topic });

  // First: unclear
  const first = processRelaunchConsentResponse({
    tempMemory,
    userMessage: "bof",
    profileConfirmDeferredKey: "__profile_deferred",
    pendingResolutionSignal: {
      status: "unresolved",
      pending_type: "relaunch_consent",
      decision_code: "common.unclear",
      confidence: 0.9,
      reason_short: "ambiguous",
    },
  });
  tempMemory = first.tempMemory;

  // Second: user says no
  const second = processRelaunchConsentResponse({
    tempMemory,
    userMessage: "non laisse",
    profileConfirmDeferredKey: "__profile_deferred",
    pendingResolutionSignal: {
      status: "resolved",
      pending_type: "relaunch_consent",
      decision_code: "relaunch.decline",
      confidence: 0.95,
      reason_short: "declined",
    },
  });

  assertEquals(second.handled, true, "handled");
  assertEquals(second.shouldInitMachine, false, "no machine init");
  assertEquals(typeof second.declineMessage, "string", "has decline message");
  assertEquals(
    second.droppedAfterUnclear,
    undefined,
    "not dropped-after-unclear (clean decline)",
  );

  const pending = getPendingRelaunchConsent(second.tempMemory);
  assertEquals(pending, null, "pending cleared");
});

// ═══════════════════════════════════════════════════════════════════════════════
// No structured/legacy signal: defaults to unclear handling
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("processRelaunchConsentResponse: no signal schedules unclear re-ask", () => {
  const topic = makeTopic();
  const { tempMemory: tm0 } = setPendingRelaunchConsent({
    tempMemory: {},
    topic,
  });

  const result = processRelaunchConsentResponse({
    tempMemory: tm0,
    userMessage: "je vais au cinéma ce soir",
    profileConfirmDeferredKey: "__profile_deferred",
  });

  assertEquals(result.handled, true, "handled");
  assertEquals(result.unclearReaskScheduled, true, "reask scheduled");
});
