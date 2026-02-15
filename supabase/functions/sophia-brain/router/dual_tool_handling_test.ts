import {
  applyDualToolDecision,
  clearBothToolSignals,
  clearPendingDualTool,
  clearToolSignal,
  type DualToolEntry,
  extractDualToolIntent,
  getPendingDualTool,
  handleDualToolNoMachine,
  handleDualToolWithMachine,
  isDualToolClear,
  isToolMotherSignal,
  type PendingDualTool,
  processPendingDualToolResponse,
  reactivateToolSignal,
  toolVerbLabel,
} from "./dual_tool_handling.ts";
import type { DispatcherSignals } from "./dispatcher.ts";
import { DEFAULT_SIGNALS } from "./dispatcher.ts";
import type { MotherSignalType } from "./deferral_handling.ts";
import type { PendingResolutionSignal } from "./pending_resolution.ts";

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

function assertNotNull(val: unknown, msg?: string) {
  if (val === null || val === undefined) {
    throw new Error(
      `${msg ?? "Assertion failed"}: expected non-null but got ${val}`,
    );
  }
}

function assertNull(val: unknown, msg?: string) {
  if (val !== null && val !== undefined) {
    throw new Error(
      `${msg ?? "Assertion failed"}: expected null but got ${
        JSON.stringify(val)
      }`,
    );
  }
}

/** Build signals with specific overrides. */
function makeSignals(
  overrides: Partial<DispatcherSignals> = {},
): DispatcherSignals {
  return { ...DEFAULT_SIGNALS, ...overrides };
}

// ═══════════════════════════════════════════════════════════════════════════════
// isToolMotherSignal
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("isToolMotherSignal: tool signals return true", () => {
  const tools: MotherSignalType[] = [
    "create_action",
    "update_action",
    "delete_action",
    "deactivate_action",
    "activate_action",
    "breakdown_action",
  ];
  for (const t of tools) {
    assertEquals(isToolMotherSignal(t), true, t);
  }
});

Deno.test("isToolMotherSignal: non-tool signals return false", () => {
  const nonTools: MotherSignalType[] = [
    "topic_exploration",
    "deep_reasons",
    "checkup",
    "track_progress",
  ];
  for (const t of nonTools) {
    assertEquals(isToolMotherSignal(t), false, t);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// toolVerbLabel
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("toolVerbLabel: maps tool signals to French verbs", () => {
  assertEquals(toolVerbLabel("create_action"), "créer");
  assertEquals(toolVerbLabel("delete_action"), "supprimer");
  assertEquals(toolVerbLabel("update_action"), "modifier");
  assertEquals(toolVerbLabel("deactivate_action"), "désactiver");
  assertEquals(toolVerbLabel("activate_action"), "activer");
  assertEquals(toolVerbLabel("breakdown_action"), "simplifier");
});

// ═══════════════════════════════════════════════════════════════════════════════
// extractDualToolIntent
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("extractDualToolIntent: returns null when no primary", () => {
  const signals = makeSignals();
  const result = extractDualToolIntent(null, [], signals);
  assertNull(result);
});

Deno.test("extractDualToolIntent: returns null when primary is not a tool", () => {
  const signals = makeSignals();
  const result = extractDualToolIntent(
    "topic_exploration",
    ["create_action"],
    signals,
  );
  assertNull(result);
});

Deno.test("extractDualToolIntent: returns null when filtered has no tool signal", () => {
  const signals = makeSignals({
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.9,
    },
  });
  const result = extractDualToolIntent(
    "create_action",
    ["deep_reasons"],
    signals,
  );
  assertNull(result);
});

Deno.test("extractDualToolIntent: returns null when same signal type", () => {
  const signals = makeSignals({
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.9,
    },
  });
  const result = extractDualToolIntent(
    "create_action",
    ["create_action"],
    signals,
  );
  assertNull(result);
});

Deno.test("extractDualToolIntent: returns null when confidence too low", () => {
  const signals = makeSignals({
    delete_action: {
      ...DEFAULT_SIGNALS.delete_action,
      detected: true,
      confidence: 0.3,
      target_hint: "méditation",
    },
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.9,
      action_label_hint: "sport",
    },
  });
  const result = extractDualToolIntent(
    "delete_action",
    ["create_action"],
    signals,
  );
  assertNull(result, "low confidence should return null");
});

Deno.test("extractDualToolIntent: returns DualToolIntent for valid dual tool case", () => {
  const signals = makeSignals({
    delete_action: {
      ...DEFAULT_SIGNALS.delete_action,
      detected: true,
      confidence: 0.9,
      target_hint: "méditation",
    },
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.85,
      action_label_hint: "sport",
    },
  });
  const result = extractDualToolIntent(
    "delete_action",
    ["create_action"],
    signals,
  );
  assertNotNull(result);
  assertEquals(result!.tool1.signal_type, "delete_action");
  assertEquals(result!.tool1.verb, "supprimer");
  assertEquals(result!.tool1.target_hint, "méditation");
  assertEquals(result!.tool2.signal_type, "create_action");
  assertEquals(result!.tool2.verb, "créer");
  assertEquals(result!.tool2.target_hint, "sport");
});

// ═══════════════════════════════════════════════════════════════════════════════
// isDualToolClear
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("isDualToolClear: clear when both high confidence with targets", () => {
  const intent = {
    tool1: {
      signal_type: "delete_action" as MotherSignalType,
      verb: "supprimer",
      target_hint: "méditation",
      confidence: 0.9,
    },
    tool2: {
      signal_type: "create_action" as MotherSignalType,
      verb: "créer",
      target_hint: "sport",
      confidence: 0.85,
    },
  };
  assertEquals(isDualToolClear(intent), true);
});

Deno.test("isDualToolClear: not clear when low confidence", () => {
  const intent = {
    tool1: {
      signal_type: "delete_action" as MotherSignalType,
      verb: "supprimer",
      target_hint: "méditation",
      confidence: 0.6,
    },
    tool2: {
      signal_type: "create_action" as MotherSignalType,
      verb: "créer",
      target_hint: "sport",
      confidence: 0.85,
    },
  };
  assertEquals(isDualToolClear(intent), false);
});

Deno.test("isDualToolClear: not clear when neither has a target hint", () => {
  const intent = {
    tool1: {
      signal_type: "delete_action" as MotherSignalType,
      verb: "supprimer",
      confidence: 0.9,
    },
    tool2: {
      signal_type: "create_action" as MotherSignalType,
      verb: "créer",
      confidence: 0.85,
    },
  };
  assertEquals(isDualToolClear(intent), false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// getPendingDualTool / clearPendingDualTool
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("getPendingDualTool: returns null when no pending", () => {
  assertNull(getPendingDualTool({}));
});

Deno.test("getPendingDualTool: returns pending when set", () => {
  const pending: PendingDualTool = {
    tool1: {
      signal_type: "delete_action",
      verb: "supprimer",
      target_hint: "méditation",
      confidence: 0.9,
    },
    tool2: {
      signal_type: "create_action",
      verb: "créer",
      target_hint: "sport",
      confidence: 0.85,
    },
    turn_created: 7,
    created_at: new Date().toISOString(),
    reask_count: 0,
  };
  const tm = { __pending_dual_tool: pending };
  const result = getPendingDualTool(tm);
  assertNotNull(result);
  assertEquals(result!.tool1.signal_type, "delete_action");
});

Deno.test("clearPendingDualTool: removes pending", () => {
  const tm = { __pending_dual_tool: { tool1: {}, tool2: {} } };
  const result = clearPendingDualTool(tm);
  assertNull(getPendingDualTool(result));
});

// ═══════════════════════════════════════════════════════════════════════════════
// processPendingDualToolResponse
// ═══════════════════════════════════════════════════════════════════════════════

function makePending(overrides?: Partial<PendingDualTool>): PendingDualTool {
  return {
    tool1: {
      signal_type: "delete_action",
      verb: "supprimer",
      target_hint: "méditation",
      confidence: 0.9,
    },
    tool2: {
      signal_type: "create_action",
      verb: "créer",
      target_hint: "sport",
      confidence: 0.85,
    },
    turn_created: 10,
    created_at: new Date().toISOString(),
    reask_count: 0,
    ...overrides,
  };
}

function makeDualResolution(
  decision: PendingResolutionSignal["decision_code"],
  status: PendingResolutionSignal["status"] = "resolved",
  confidence = 0.9,
): PendingResolutionSignal {
  return {
    status,
    pending_type: "dual_tool",
    decision_code: decision,
    confidence,
    reason_short: "test",
  };
}

Deno.test("processPendingDualToolResponse: dual.confirm_both confirms both", () => {
  const pending = makePending();
  const tm = { __pending_dual_tool: pending };
  const { result } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "irrelevant in hybrid mode",
    pending,
    pendingResolutionSignal: makeDualResolution("dual.confirm_both"),
  });
  assertEquals(result.outcome, "confirmed_both");
});

Deno.test("processPendingDualToolResponse: dual.confirm_reversed swaps order", () => {
  const pending = makePending();
  const tm = { __pending_dual_tool: pending };
  const { result } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "irrelevant in hybrid mode",
    pending,
    pendingResolutionSignal: makeDualResolution("dual.confirm_reversed"),
  });
  assertEquals(result.outcome, "confirmed_reversed");
});

Deno.test("processPendingDualToolResponse: dual.only_first returns only_first", () => {
  const pending = makePending();
  const tm = { __pending_dual_tool: pending };
  const { result } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "irrelevant in hybrid mode",
    pending,
    pendingResolutionSignal: makeDualResolution("dual.only_first"),
  });
  assertEquals(result.outcome, "only_first");
});

Deno.test("processPendingDualToolResponse: dual.only_second returns only_second", () => {
  const pending = makePending();
  const tm = { __pending_dual_tool: pending };
  const { result } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "irrelevant in hybrid mode",
    pending,
    pendingResolutionSignal: makeDualResolution("dual.only_second"),
  });
  assertEquals(result.outcome, "only_second");
});

Deno.test("processPendingDualToolResponse: dual.decline_all drops", () => {
  const pending = makePending();
  const tm = { __pending_dual_tool: pending };
  const { result } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "irrelevant in hybrid mode",
    pending,
    pendingResolutionSignal: makeDualResolution("dual.decline_all"),
  });
  assertEquals(result.outcome, "dropped");
});

Deno.test("processPendingDualToolResponse: unresolved signal triggers reask", () => {
  const pending = makePending();
  const tm = { __pending_dual_tool: pending };
  const { result, tempMemory } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "irrelevant in hybrid mode",
    pending,
    pendingResolutionSignal: makeDualResolution(
      "common.unclear",
      "unresolved",
      0.8,
    ),
  });
  assertEquals(result.outcome, "unclear");
  assertEquals((result as any).reask, true);
  const p = getPendingDualTool(tempMemory);
  assertNotNull(p);
  assertEquals(p!.reask_count, 1);
});

Deno.test("processPendingDualToolResponse: low-confidence pending signal triggers reask", () => {
  const pending = makePending();
  const tm = { __pending_dual_tool: pending };
  const { result, tempMemory } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "irrelevant in hybrid mode",
    pending,
    pendingResolutionSignal: makeDualResolution(
      "dual.confirm_both",
      "resolved",
      0.4,
    ),
  });
  assertEquals(result.outcome, "unclear");
  const p = getPendingDualTool(tempMemory);
  assertNotNull(p);
  assertEquals(p!.reask_count, 1);
});

Deno.test("processPendingDualToolResponse: missing pending signal triggers reask", () => {
  const pending = makePending();
  const tm = { __pending_dual_tool: pending };
  const { result, tempMemory } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "hmm je sais pas trop quoi faire",
    pending,
  });
  assertEquals(result.outcome, "unclear");
  assertEquals((result as any).reask, true);
  // Pending should still exist with reask_count = 1
  const p = getPendingDualTool(tempMemory);
  assertNotNull(p);
  assertEquals(p!.reask_count, 1);
});

Deno.test("processPendingDualToolResponse: unclear drops on second attempt", () => {
  const pending = makePending({ reask_count: 1 });
  const tm = { __pending_dual_tool: pending };
  const { result } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "hmm pas sûr",
    pending,
  });
  assertEquals(result.outcome, "dropped");
});

Deno.test("processPendingDualToolResponse: turn-based TTL drops after 2 turns", () => {
  const pending = makePending({ turn_created: 3, created_at: undefined });
  const tm = { __pending_dual_tool: pending };
  const { result } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "oui",
    pending,
    currentTurn: 5,
  });
  assertEquals(result.outcome, "dropped");
});

Deno.test("processPendingDualToolResponse: legacy timestamp TTL still drops silently", () => {
  const pending = makePending({
    turn_created: undefined,
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
  });
  const tm = { __pending_dual_tool: pending };
  const { result } = processPendingDualToolResponse({
    tempMemory: tm,
    userMessage: "oui",
    pending,
  });
  assertEquals(result.outcome, "dropped");
});

// ═══════════════════════════════════════════════════════════════════════════════
// handleDualToolNoMachine
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("handleDualToolNoMachine: clear intent defers secondary and launches primary", () => {
  const signals = makeSignals({
    delete_action: {
      ...DEFAULT_SIGNALS.delete_action,
      detected: true,
      confidence: 0.9,
      target_hint: "méditation",
    },
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.85,
      action_label_hint: "sport",
    },
  });
  const intent = extractDualToolIntent(
    "delete_action",
    ["create_action"],
    signals,
  )!;
  assertNotNull(intent);

  const result = handleDualToolNoMachine({
    tempMemory: {},
    intent,
    signals,
    userMessage: "supprime méditation et crée sport",
  });

  assertEquals(result.action, "launch_primary_defer_secondary");
  assertEquals(
    result.addon.includes("DOUBLE ACTION"),
    true,
    "addon should mention double action",
  );
  // Should NOT have pending dual tool (clear case)
  assertNull(getPendingDualTool(result.tempMemory));
});

Deno.test("handleDualToolNoMachine: ambiguous intent asks for confirmation", () => {
  const signals = makeSignals({
    delete_action: {
      ...DEFAULT_SIGNALS.delete_action,
      detected: true,
      confidence: 0.6,
      target_hint: "méditation",
    },
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.6,
    },
  });
  const intent = extractDualToolIntent(
    "delete_action",
    ["create_action"],
    signals,
  )!;
  assertNotNull(intent);

  const result = handleDualToolNoMachine({
    tempMemory: {},
    intent,
    signals,
    userMessage: "change ça et fais un truc",
  });

  assertEquals(result.action, "ask_confirmation");
  assertEquals(
    result.addon.includes("confirmation nécessaire"),
    true,
    "addon should ask for confirmation",
  );
  // Should have pending dual tool
  const pending = getPendingDualTool(result.tempMemory);
  assertNotNull(pending);
  assertEquals(pending!.tool1.signal_type, "delete_action");
  assertEquals(pending!.tool2.signal_type, "create_action");
});

// ═══════════════════════════════════════════════════════════════════════════════
// handleDualToolWithMachine
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("handleDualToolWithMachine: defers both and generates notification", () => {
  const signals = makeSignals({
    delete_action: {
      ...DEFAULT_SIGNALS.delete_action,
      detected: true,
      confidence: 0.9,
      target_hint: "méditation",
    },
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.85,
      action_label_hint: "sport",
    },
  });
  const intent = extractDualToolIntent(
    "delete_action",
    ["create_action"],
    signals,
  )!;
  assertNotNull(intent);

  const result = handleDualToolWithMachine({
    tempMemory: {},
    intent,
    signals,
    userMessage: "supprime méditation et crée sport",
    currentMachineType: "update_action_flow",
    currentMachineTarget: "lecture",
    isBilan: false,
  });

  assertEquals(
    result.addon.includes("DOUBLE ACTION NOTÉE"),
    true,
    "addon should notify",
  );
  assertEquals(
    result.addon.includes("méditation"),
    true,
    "addon should mention first target",
  );
  assertEquals(
    result.addon.includes("sport"),
    true,
    "addon should mention second target",
  );
  assertEquals(
    result.addon.includes("update_action_flow"),
    true,
    "addon should mention active machine",
  );
});

Deno.test("handleDualToolWithMachine: bilan case uses appropriate language", () => {
  const signals = makeSignals({
    deactivate_action: {
      ...DEFAULT_SIGNALS.deactivate_action,
      detected: true,
      confidence: 0.9,
      target_hint: "méditation",
    },
    update_action: {
      ...DEFAULT_SIGNALS.update_action,
      detected: true,
      confidence: 0.85,
      target_hint: "sport",
    },
  });
  const intent = extractDualToolIntent(
    "deactivate_action",
    ["update_action"],
    signals,
  )!;
  assertNotNull(intent);

  const result = handleDualToolWithMachine({
    tempMemory: {},
    intent,
    signals,
    userMessage: "désactive méditation et modifie sport",
    currentMachineType: "investigation",
    isBilan: true,
  });

  assertEquals(
    result.addon.includes("bilan sera terminé"),
    true,
    "addon should mention bilan completion",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// clearToolSignal / clearBothToolSignals
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("clearToolSignal: clears create_action signal", () => {
  const signals = makeSignals({
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.9,
      action_label_hint: "sport",
    },
  });
  clearToolSignal(signals, "create_action");
  assertEquals(signals.create_action.intent_strength, "none");
});

Deno.test("clearToolSignal: clears delete_action signal", () => {
  const signals = makeSignals({
    delete_action: {
      ...DEFAULT_SIGNALS.delete_action,
      detected: true,
      confidence: 0.9,
      target_hint: "méditation",
    },
  });
  clearToolSignal(signals, "delete_action");
  assertEquals(signals.delete_action.detected, false);
});

Deno.test("clearBothToolSignals: clears both signals", () => {
  const signals = makeSignals({
    delete_action: {
      ...DEFAULT_SIGNALS.delete_action,
      detected: true,
      confidence: 0.9,
      target_hint: "méditation",
    },
    create_action: {
      ...DEFAULT_SIGNALS.create_action,
      intent_strength: "explicit",
      confidence: 0.9,
      action_label_hint: "sport",
    },
  });
  const intent = {
    tool1: {
      signal_type: "delete_action" as MotherSignalType,
      verb: "supprimer",
      target_hint: "méditation",
      confidence: 0.9,
    },
    tool2: {
      signal_type: "create_action" as MotherSignalType,
      verb: "créer",
      target_hint: "sport",
      confidence: 0.9,
    },
  };
  clearBothToolSignals(signals, intent);
  assertEquals(signals.delete_action.detected, false);
  assertEquals(signals.create_action.intent_strength, "none");
});

// ═══════════════════════════════════════════════════════════════════════════════
// reactivateToolSignal
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("reactivateToolSignal: re-enables create_action", () => {
  const signals = makeSignals();
  const entry: DualToolEntry = {
    signal_type: "create_action",
    verb: "créer",
    target_hint: "sport",
    confidence: 0.85,
  };
  reactivateToolSignal(signals, entry);
  assertEquals(signals.create_action.intent_strength, "explicit");
  assertEquals(signals.create_action.confidence, 0.85);
  assertEquals(signals.create_action.action_label_hint, "sport");
});

Deno.test("reactivateToolSignal: re-enables delete_action", () => {
  const signals = makeSignals();
  const entry: DualToolEntry = {
    signal_type: "delete_action",
    verb: "supprimer",
    target_hint: "méditation",
    confidence: 0.9,
  };
  reactivateToolSignal(signals, entry);
  assertEquals(signals.delete_action.detected, true);
  assertEquals(signals.delete_action.confidence, 0.9);
  assertEquals(signals.delete_action.target_hint, "méditation");
});

// ═══════════════════════════════════════════════════════════════════════════════
// applyDualToolDecision
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("applyDualToolDecision: confirmed_both returns primary active and secondary to defer", () => {
  const tool1: DualToolEntry = {
    signal_type: "delete_action",
    verb: "supprimer",
    target_hint: "méditation",
    confidence: 0.9,
  };
  const tool2: DualToolEntry = {
    signal_type: "create_action",
    verb: "créer",
    target_hint: "sport",
    confidence: 0.85,
  };
  const result = applyDualToolDecision({
    result: { outcome: "confirmed_both", tool1, tool2 },
    signals: makeSignals(),
    tempMemory: {},
    userMessage: "oui",
  });
  assertEquals(result.activateSignal, "delete_action");
  assertNotNull(result.deferSignalType);
  assertEquals(result.deferSignalType!.signal_type, "create_action");
});

Deno.test("applyDualToolDecision: only_first returns only tool active, no defer", () => {
  const tool: DualToolEntry = {
    signal_type: "delete_action",
    verb: "supprimer",
    target_hint: "méditation",
    confidence: 0.9,
  };
  const result = applyDualToolDecision({
    result: { outcome: "only_first", tool },
    signals: makeSignals(),
    tempMemory: {},
    userMessage: "juste le premier",
  });
  assertEquals(result.activateSignal, "delete_action");
  assertNull(result.deferSignalType);
});

Deno.test("applyDualToolDecision: dropped returns no activation", () => {
  const result = applyDualToolDecision({
    result: { outcome: "dropped" },
    signals: makeSignals(),
    tempMemory: {},
    userMessage: "non",
  });
  assertNull(result.activateSignal);
  assertNull(result.deferSignalType);
});

