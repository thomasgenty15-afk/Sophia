import { handleSignalDeferral } from "./deferral_handling.ts";
import { DEFAULT_SIGNALS, type DispatcherSignals } from "./dispatcher.ts";
import { getDeferredTopicsV2 } from "./deferred_topics_v2.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `${
        msg ? `${msg} — ` : ""
      }Assertion failed.\nExpected: ${e}\nActual:   ${a}`,
    );
  }
}

function makeSignals(
  overrides: Partial<DispatcherSignals> = {},
): DispatcherSignals {
  return { ...DEFAULT_SIGNALS, ...overrides };
}

function makeActiveCreateFlowTempMemory(target = "sport"): Record<string, unknown> {
  const now = new Date().toISOString();
  const runtime = {
    v: 1 as const,
    stack: [{
      id: "sess_create_action_test",
      type: "create_action_flow",
      owner_mode: "architect",
      status: "active",
      started_at: now,
      last_active_at: now,
      topic: target,
      meta: {
        candidate: { label: target },
      },
    }],
    queue: [],
    updated_at: now,
  };

  return {
    global_machine: runtime,
    supervisor: runtime,
  };
}

Deno.test("handleSignalDeferral: same machine without target hint does not defer", async () => {
  const traceEvents: string[] = [];
  const tracePayloads: Array<{ event: string; payload?: Record<string, unknown> }> = [];
  const tempMemory = makeActiveCreateFlowTempMemory("sport");

  const dispatcherSignals = makeSignals({
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.92,
      action_label_hint: undefined,
    },
  });

  const result = await handleSignalDeferral({
    tempMemory,
    dispatcherSignals,
    userMessage: "oui crée l'action",
    profileConfirmDeferredKey: "__profile_deferred",
    trace: async (event, _phase, payload) => {
      traceEvents.push(event);
      tracePayloads.push({ event, payload });
    },
  });

  assertEquals(result.deferredAckPrefix, "", "deferredAckPrefix");
  assertEquals(result.deferredSignalAddon, "", "deferredSignalAddon");
  assertEquals(getDeferredTopicsV2(result.tempMemory).length, 0, "no deferred topics");
  assertEquals(traceEvents.includes("brain:signal_deferred"), false, "no signal_deferred trace");
  assertEquals(traceEvents.includes("brain:deferred_created"), false, "no deferred_created trace");
  const deferralDecision = tracePayloads.find((e) => e.event === "deferral_decision");
  assertEquals(deferralDecision?.payload?.deferred, false, "deferral=false");
  assertEquals(deferralDecision?.payload?.reason_code, "same_machine_same_action", "reason code");
});

Deno.test("handleSignalDeferral: same machine with different target is deferred", async () => {
  const traceEvents: string[] = [];
  const tracePayloads: Array<{ event: string; payload?: Record<string, unknown> }> = [];
  const tempMemory = makeActiveCreateFlowTempMemory("sport");

  const dispatcherSignals = makeSignals({
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.92,
      action_label_hint: "lecture",
    },
  });

  const result = await handleSignalDeferral({
    tempMemory,
    dispatcherSignals,
    userMessage: "finalement crée une action lecture",
    profileConfirmDeferredKey: "__profile_deferred",
    trace: async (event, _phase, payload) => {
      traceEvents.push(event);
      tracePayloads.push({ event, payload });
    },
  });

  const topics = getDeferredTopicsV2(result.tempMemory);
  assertEquals(topics.length, 1, "one deferred topic");
  assertEquals(topics[0]?.machine_type, "create_action", "deferred machine type");
  assertEquals(topics[0]?.action_target, "lecture", "deferred action target");
  assertEquals(traceEvents.includes("brain:signal_deferred"), true, "signal_deferred trace");
  const deferralDecision = tracePayloads.find((e) => e.event === "deferral_decision");
  assertEquals(deferralDecision?.payload?.deferred, true, "deferral=true");
  assertEquals(
    deferralDecision?.payload?.reason_code,
    "deferred_different_machine_or_action",
    "reason code",
  );
});
