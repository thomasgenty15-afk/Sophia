export type ActiveMachineCheck = {
  active: boolean;
  machineLabel: string | null;
  interruptible: boolean;
};

const HARD_MACHINE_TTL_MS_DEFAULT = 4 * 60 * 60 * 1000; // 4 hours

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isOlderThan(value: unknown, nowMs: number, ttlMs: number): boolean {
  const ts = parseTimestampMs(value);
  if (!Number.isFinite(ts)) return false;
  return nowMs - (ts as number) > ttlMs;
}

function isInvestigationActive(inv: any): boolean {
  if (!inv || typeof inv !== "object") return false;
  const status = String(inv.status ?? "");
  return Boolean(status) && status !== "post_checkup" && status !== "post_checkup_done";
}

function pushUnique(arr: string[], value: string) {
  if (!arr.includes(value)) arr.push(value);
}

export function isMachineInterruptible(machineLabel: string | null): boolean {
  if (!machineLabel) return false;
  // Never force-interrupt safety or an ongoing bilan.
  if (machineLabel === "safety_sentry" || machineLabel === "safety_firefighter") return false;
  if (machineLabel === "bilan_in_progress") return false;
  return true;
}

/**
 * Lightweight check for active state machines from raw user_chat_states data.
 * Mirrors router behavior enough to prevent proactive daily bilan from interrupting
 * an in-flight machine or pending confirmation turn.
 */
export function hasActiveStateMachine(chatState: any): ActiveMachineCheck {
  if (!chatState) return { active: false, machineLabel: null, interruptible: false };

  // 1. Investigation (bilan) already in progress
  const inv = chatState.investigation_state;
  if (isInvestigationActive(inv)) {
    const machineLabel = "bilan_in_progress";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }

  // 2. Check temp_memory for active flows
  const tm = chatState.temp_memory;
  if (!tm || typeof tm !== "object") {
    return { active: false, machineLabel: null, interruptible: false };
  }

  // Pending confirmations/questions from previous turn (avoid proactive overlap).
  if (tm.__checkup_entry_pending) {
    const machineLabel = "checkup_entry_pending";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.__bilan_already_done_pending) {
    const machineLabel = "bilan_done_pending";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.__pending_dual_tool) {
    const machineLabel = "dual_tool_pending";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.__router_resume_prompt_v1) {
    const machineLabel = "resume_prompt_pending";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }

  // Safety flows
  if (tm.__safety_sentry_flow && tm.__safety_sentry_flow.phase !== "resolved") {
    const machineLabel = "safety_sentry";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (
    tm.__safety_firefighter_flow &&
    tm.__safety_firefighter_flow.phase !== "resolved"
  ) {
    const machineLabel = "safety_firefighter";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }

  // Onboarding flow
  if (tm.__onboarding_flow) {
    const machineLabel = "onboarding";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }

  // Legacy tool flow keys (pre-supervisor)
  if (tm.create_action_flow) {
    const machineLabel = "create_action";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.update_action_flow) {
    const machineLabel = "update_action";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.breakdown_action_flow) {
    const machineLabel = "breakdown_action";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.activate_action_flow) {
    const machineLabel = "activate_action";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.delete_action_flow) {
    const machineLabel = "delete_action";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.deactivate_action_flow) {
    const machineLabel = "deactivate_action";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }
  if (tm.track_progress_flow) {
    const machineLabel = "track_progress";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
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
        const machineLabel = t;
        return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
      }
    }
  }

  // Legacy update flow stage (awaiting consent)
  if (tm.__update_flow_stage?.stage === "awaiting_consent") {
    const machineLabel = "update_consent";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }

  // Deep reasons (legacy key)
  if (tm.deep_reasons_state) {
    const machineLabel = "deep_reasons";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }

  // Pending relaunch consent
  if (tm.__pending_relaunch_consent) {
    const machineLabel = "relaunch_consent";
    return { active: true, machineLabel, interruptible: isMachineInterruptible(machineLabel) };
  }

  return { active: false, machineLabel: null, interruptible: false };
}

export function cleanupHardExpiredStateMachines(
  chatState: any,
  opts?: { hardTtlMs?: number; now?: Date },
): { chatState: any; changed: boolean; cleaned: string[] } {
  if (!chatState || typeof chatState !== "object") {
    return { chatState, changed: false, cleaned: [] };
  }

  const nowMs = (opts?.now ?? new Date()).getTime();
  const hardTtlMs = Math.max(5 * 60 * 1000, Math.floor(opts?.hardTtlMs ?? HARD_MACHINE_TTL_MS_DEFAULT));
  const cleaned: string[] = [];
  let changed = false;
  const nextState = { ...chatState };
  const tm = nextState.temp_memory && typeof nextState.temp_memory === "object"
    ? { ...nextState.temp_memory }
    : null;

  if (isInvestigationActive(nextState.investigation_state)) {
    const inv = nextState.investigation_state;
    const ref = inv?.started_at ?? inv?.updated_at ?? inv?.last_updated_at;
    if (isOlderThan(ref, nowMs, hardTtlMs)) {
      nextState.investigation_state = null;
      changed = true;
      pushUnique(cleaned, "investigation_state");
    }
  }

  if (!tm || typeof tm !== "object") {
    return { chatState: changed ? nextState : chatState, changed, cleaned };
  }

  const timedKeys = [
    "__checkup_entry_pending",
    "__bilan_already_done_pending",
    "__pending_dual_tool",
    "__router_resume_prompt_v1",
    "__pending_relaunch_consent",
    "create_action_flow",
    "update_action_flow",
    "breakdown_action_flow",
    "activate_action_flow",
    "delete_action_flow",
    "deactivate_action_flow",
    "track_progress_flow",
    "__update_flow_stage",
    "deep_reasons_state",
  ];
  for (const key of timedKeys) {
    const raw = (tm as any)[key];
    if (!raw || typeof raw !== "object") continue;
    const ref = raw.last_active_at ?? raw.last_updated_at ?? raw.updated_at ?? raw.created_at ?? raw.started_at ?? raw.asked_at;
    if (isOlderThan(ref, nowMs, hardTtlMs)) {
      delete (tm as any)[key];
      changed = true;
      pushUnique(cleaned, key);
    }
  }

  if (
    (tm as any).__safety_sentry_flow &&
    String((tm as any).__safety_sentry_flow?.phase ?? "") !== "resolved" &&
    isOlderThan(
      (tm as any).__safety_sentry_flow?.last_updated_at ?? (tm as any).__safety_sentry_flow?.started_at,
      nowMs,
      hardTtlMs,
    )
  ) {
    delete (tm as any).__safety_sentry_flow;
    changed = true;
    pushUnique(cleaned, "__safety_sentry_flow");
  }

  if (
    (tm as any).__safety_firefighter_flow &&
    String((tm as any).__safety_firefighter_flow?.phase ?? "") !== "resolved" &&
    isOlderThan(
      (tm as any).__safety_firefighter_flow?.last_updated_at ?? (tm as any).__safety_firefighter_flow?.started_at,
      nowMs,
      hardTtlMs,
    )
  ) {
    delete (tm as any).__safety_firefighter_flow;
    changed = true;
    pushUnique(cleaned, "__safety_firefighter_flow");
  }

  const supervisor = (tm as any).supervisor;
  const stack = supervisor?.stack;
  if (Array.isArray(stack)) {
    const before = stack.length;
    const filtered = stack.filter((session: any) => {
      const status = String(session?.status ?? "");
      if (status !== "active") return true;
      const ref = session?.last_active_at ?? session?.started_at;
      return !isOlderThan(ref, nowMs, hardTtlMs);
    });
    if (filtered.length !== before) {
      (tm as any).supervisor = {
        ...(supervisor && typeof supervisor === "object" ? supervisor : {}),
        stack: filtered,
        updated_at: new Date(nowMs).toISOString(),
      };
      changed = true;
      pushUnique(cleaned, "supervisor.stack");
    }
  }

  if (changed) nextState.temp_memory = tm;
  return { chatState: changed ? nextState : chatState, changed, cleaned };
}

export function clearActiveMachineForDailyBilan(
  chatState: any,
  machineLabel: string | null,
): { chatState: any; changed: boolean; cleared: string[] } {
  if (!chatState || typeof chatState !== "object" || !machineLabel) {
    return { chatState, changed: false, cleared: [] };
  }
  const nextState = { ...chatState };
  const tm = nextState.temp_memory && typeof nextState.temp_memory === "object"
    ? { ...nextState.temp_memory }
    : {};
  const cleared: string[] = [];
  let changed = false;

  const clearTmKey = (key: string) => {
    if ((tm as any)[key] !== undefined) {
      delete (tm as any)[key];
      changed = true;
      pushUnique(cleared, key);
    }
  };

  if (machineLabel === "bilan_in_progress") {
    if (nextState.investigation_state) {
      nextState.investigation_state = null;
      changed = true;
      pushUnique(cleared, "investigation_state");
    }
  }

  if (machineLabel === "checkup_entry_pending") clearTmKey("__checkup_entry_pending");
  if (machineLabel === "bilan_done_pending") clearTmKey("__bilan_already_done_pending");
  if (machineLabel === "dual_tool_pending") clearTmKey("__pending_dual_tool");
  if (machineLabel === "resume_prompt_pending") clearTmKey("__router_resume_prompt_v1");
  if (machineLabel === "update_consent") clearTmKey("__update_flow_stage");
  if (machineLabel === "deep_reasons") clearTmKey("deep_reasons_state");
  if (machineLabel === "relaunch_consent") clearTmKey("__pending_relaunch_consent");
  if (machineLabel === "create_action") clearTmKey("create_action_flow");
  if (machineLabel === "update_action") clearTmKey("update_action_flow");
  if (machineLabel === "breakdown_action") clearTmKey("breakdown_action_flow");
  if (machineLabel === "activate_action") clearTmKey("activate_action_flow");
  if (machineLabel === "delete_action") clearTmKey("delete_action_flow");
  if (machineLabel === "deactivate_action") clearTmKey("deactivate_action_flow");
  if (machineLabel === "track_progress") clearTmKey("track_progress_flow");

  // Supervisor sessions are identified by session type labels (e.g. create_action_flow).
  const supervisor = (tm as any).supervisor;
  if (supervisor && typeof supervisor === "object" && Array.isArray(supervisor.stack)) {
    const before = supervisor.stack.length;
    const filtered = supervisor.stack.filter((session: any) => {
      const status = String(session?.status ?? "");
      if (status !== "active") return true;
      return String(session?.type ?? "") !== machineLabel;
    });
    if (filtered.length !== before) {
      (tm as any).supervisor = {
        ...supervisor,
        stack: filtered,
        updated_at: new Date().toISOString(),
      };
      changed = true;
      pushUnique(cleared, "supervisor.stack");
    }
  }

  if (changed) nextState.temp_memory = tm;
  return { chatState: changed ? nextState : chatState, changed, cleared };
}
