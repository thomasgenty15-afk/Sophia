export type ActiveMachineCheck = {
  active: boolean;
  machineLabel: string | null;
};

/**
 * Lightweight check for active state machines from raw user_chat_states data.
 * Mirrors router behavior enough to prevent proactive daily bilan from interrupting
 * an in-flight machine or pending confirmation turn.
 */
export function hasActiveStateMachine(chatState: any): ActiveMachineCheck {
  if (!chatState) return { active: false, machineLabel: null };

  // 1. Investigation (bilan) already in progress
  const inv = chatState.investigation_state;
  if (
    inv &&
    inv.status &&
    inv.status !== "post_checkup" &&
    inv.status !== "post_checkup_done"
  ) {
    return { active: true, machineLabel: "bilan_in_progress" };
  }

  // 2. Check temp_memory for active flows
  const tm = chatState.temp_memory;
  if (!tm || typeof tm !== "object") {
    return { active: false, machineLabel: null };
  }

  // Pending confirmations/questions from previous turn (avoid proactive overlap).
  if (tm.__checkup_entry_pending) {
    return { active: true, machineLabel: "checkup_entry_pending" };
  }
  if (tm.__bilan_already_done_pending) {
    return { active: true, machineLabel: "bilan_done_pending" };
  }
  if (tm.__pending_dual_tool) {
    return { active: true, machineLabel: "dual_tool_pending" };
  }
  if (tm.__router_resume_prompt_v1) {
    return { active: true, machineLabel: "resume_prompt_pending" };
  }

  // Safety flows
  if (tm.__safety_sentry_flow && tm.__safety_sentry_flow.phase !== "resolved") {
    return { active: true, machineLabel: "safety_sentry" };
  }
  if (
    tm.__safety_firefighter_flow &&
    tm.__safety_firefighter_flow.phase !== "resolved"
  ) {
    return { active: true, machineLabel: "safety_firefighter" };
  }

  // Onboarding flow
  if (tm.__onboarding_flow) return { active: true, machineLabel: "onboarding" };

  // Legacy tool flow keys (pre-supervisor)
  if (tm.create_action_flow) {
    return { active: true, machineLabel: "create_action" };
  }
  if (tm.update_action_flow) {
    return { active: true, machineLabel: "update_action" };
  }
  if (tm.breakdown_action_flow) {
    return { active: true, machineLabel: "breakdown_action" };
  }
  if (tm.activate_action_flow) {
    return { active: true, machineLabel: "activate_action" };
  }
  if (tm.delete_action_flow) {
    return { active: true, machineLabel: "delete_action" };
  }
  if (tm.deactivate_action_flow) {
    return { active: true, machineLabel: "deactivate_action" };
  }
  if (tm.track_progress_flow) {
    return { active: true, machineLabel: "track_progress" };
  }

  // Supervisor stack flows (only ACTIVE sessions should block proactive sends)
  const supervisorStack = tm.supervisor?.stack;
  if (Array.isArray(supervisorStack)) {
    for (const session of supervisorStack) {
      const t = session?.type;
      const status = String(session?.status ?? "");
      if (status !== "active") continue;
      if (
        t === "create_action_flow" ||
        t === "update_action_flow" ||
        t === "breakdown_action_flow" ||
        t === "activate_action_flow" ||
        t === "delete_action_flow" ||
        t === "deactivate_action_flow" ||
        t === "track_progress_flow" ||
        t === "topic_serious" ||
        t === "topic_light" ||
        t === "deep_reasons_exploration"
      ) {
        return { active: true, machineLabel: t };
      }
    }
  }

  // Legacy update flow stage (awaiting consent)
  if (tm.__update_flow_stage?.stage === "awaiting_consent") {
    return { active: true, machineLabel: "update_consent" };
  }

  // Deep reasons (legacy key)
  if (tm.deep_reasons_state) {
    return { active: true, machineLabel: "deep_reasons" };
  }

  // Profile confirmation
  const profileConfirm = tm.__profile_confirmation_state ??
    tm.profile_confirmation_state;
  if (profileConfirm?.status === "confirming") {
    return { active: true, machineLabel: "profile_confirmation" };
  }

  // Pending relaunch consent
  if (tm.__pending_relaunch_consent) {
    return { active: true, machineLabel: "relaunch_consent" };
  }

  return { active: false, machineLabel: null };
}
