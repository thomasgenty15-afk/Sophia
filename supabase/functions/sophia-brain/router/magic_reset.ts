function normalizeAlphaToken(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectMagicResetCommand(
  userMessage: string,
): "abracadabra" | "abrakadabra" | null {
  const normalized = normalizeAlphaToken(userMessage);
  if (normalized === "abracadabra") return "abracadabra";
  if (normalized === "abrakadabra") return "abrakadabra";
  return null;
}

export function clearMachineStateTempMemory(opts: {
  tempMemory: any;
}): { tempMemory: any; clearedKeys: string[] } {
  const next = { ...(opts.tempMemory ?? {}) };
  const keysToClear = [
    // Canonical supervisor runtime
    "global_machine",
    "supervisor",
    // Pauses / pending runtime
    "__paused_machine_v2",
    "__pending_next_topic",
    "__pending_relaunch_consent",
    "__ask_relaunch_consent",
    "__pending_dual_tool",
    // One-off routing markers
    "__dual_tool_addon",
    "__resume_message_prefix",
    "__resume_safety_addon",
    "__router_resume_prompt_v1",
    "__router_safety_preempted_v1",
    "__flow_just_closed_normally",
    "__flow_just_closed_aborted",
    "__abandon_message",
    "__track_progress_parallel",
    // Onboarding runtime
    "__onboarding_flow",
    "__onboarding_active",
    "__onboarding_done_v2",
    // Legacy flow keys (defensive cleanup)
    "create_action_flow",
    "update_action_flow",
    "breakdown_action_flow",
    "deep_reasons_state",
    "__create_action_signal",
    "__update_action_signal",
    "__breakdown_action_signal",
    "__activate_action_signal",
    "__delete_action_signal",
    "__deactivate_action_signal",
    "__deep_reasons_opportunity",
  ];

  const clearedKeys: string[] = [];
  for (const key of keysToClear) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      delete (next as any)[key];
      clearedKeys.push(key);
    }
  }

  return { tempMemory: next, clearedKeys };
}
