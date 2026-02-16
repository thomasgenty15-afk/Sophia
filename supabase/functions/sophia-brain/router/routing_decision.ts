import type { AgentMode } from "../state-manager.ts";
import type { BrainTracePhase } from "../../_shared/brain-trace.ts";
import type { DispatcherSignals, MachineSignals } from "./dispatcher.ts";

export async function applyDeterministicRouting(opts: {
  dispatcherSignals: DispatcherSignals;
  machineSignals?: MachineSignals;
  tempMemory: any;
  state: any;
  disableForcedRouting: boolean;
  forceMode?: AgentMode;
  trace: (
    event: string,
    phase: BrainTracePhase,
    payload?: Record<string, unknown>,
    level?: "debug" | "info" | "warn" | "error",
  ) => Promise<void>;
  traceV: (
    event: string,
    phase: BrainTracePhase,
    payload?: Record<string, unknown>,
    level?: "debug" | "info" | "warn" | "error",
  ) => Promise<void>;
}): Promise<{ targetMode: AgentMode; tempMemory: any }> {
  let targetMode: AgentMode = "companion";

  const stopCheckup =
    (opts.dispatcherSignals.interrupt.kind === "EXPLICIT_STOP" &&
      opts.dispatcherSignals.interrupt.confidence >= 0.6) ||
    (opts.dispatcherSignals.interrupt.kind === "BORED" &&
      opts.dispatcherSignals.interrupt.confidence >= 0.65);

  if (
    opts.dispatcherSignals.safety.level === "SENTRY" &&
    opts.dispatcherSignals.safety.confidence >= 0.75
  ) {
    targetMode = "sentry";
  } else if (
    (opts.dispatcherSignals.safety.level === "FIREFIGHTER" &&
      opts.dispatcherSignals.safety.confidence >= 0.75) ||
    (opts.dispatcherSignals.topic_depth?.value === "NEED_SUPPORT" &&
      opts.dispatcherSignals.topic_depth?.confidence >= 0.6 &&
      Number(opts.dispatcherSignals.risk_score ?? 0) >= 4)
  ) {
    targetMode = "firefighter";
  } else if (
    opts.state?.investigation_state &&
    opts.state?.investigation_state?.status !== "post_checkup" &&
    opts.state?.investigation_state?.status !== "post_checkup_done" &&
    !stopCheckup
  ) {
    targetMode = "investigator";
  } else {
    targetMode = "companion";
  }

  if (
    !opts.disableForcedRouting &&
    opts.forceMode &&
    targetMode !== "sentry" &&
    targetMode !== "firefighter"
  ) {
    await opts.traceV("brain:forced_routing_override", "routing", {
      from: targetMode,
      to: opts.forceMode,
      reason: "opts.forceMode",
    });
    targetMode = opts.forceMode;
  }

  return { targetMode, tempMemory: opts.tempMemory };
}
