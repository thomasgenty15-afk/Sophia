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
  return Boolean(status) && status !== "post_checkup" &&
    status !== "post_checkup_done";
}

function pushUnique(arr: string[], value: string) {
  if (!arr.includes(value)) arr.push(value);
}

export function isMachineInterruptible(machineLabel: string | null): boolean {
  if (!machineLabel) return false;
  if (
    machineLabel === "safety_sentry" || machineLabel === "safety_firefighter" ||
    machineLabel === "bilan_in_progress"
  ) return false;
  return true;
}

/**
 * Simplified gating for cron-driven bilan.
 * Blocks launch only when:
 * - bilan already active
 * - safety flow active
 * - onboarding active
 */
export function hasActiveStateMachine(chatState: any): ActiveMachineCheck {
  if (!chatState) {
    return { active: false, machineLabel: null, interruptible: false };
  }

  const inv = chatState.investigation_state;
  if (isInvestigationActive(inv)) {
    const machineLabel = "bilan_in_progress";
    return {
      active: true,
      machineLabel,
      interruptible: isMachineInterruptible(machineLabel),
    };
  }

  const tm = chatState.temp_memory;
  if (!tm || typeof tm !== "object") {
    return { active: false, machineLabel: null, interruptible: false };
  }

  if (tm.__safety_sentry_flow && tm.__safety_sentry_flow.phase !== "resolved") {
    const machineLabel = "safety_sentry";
    return {
      active: true,
      machineLabel,
      interruptible: isMachineInterruptible(machineLabel),
    };
  }

  if (
    tm.__safety_firefighter_flow &&
    tm.__safety_firefighter_flow.phase !== "resolved"
  ) {
    const machineLabel = "safety_firefighter";
    return {
      active: true,
      machineLabel,
      interruptible: isMachineInterruptible(machineLabel),
    };
  }

  if (tm.__onboarding_active || tm.__onboarding_flow) {
    const machineLabel = "onboarding";
    return {
      active: true,
      machineLabel,
      interruptible: isMachineInterruptible(machineLabel),
    };
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
  const hardTtlMs = Math.max(
    5 * 60 * 1000,
    Math.floor(opts?.hardTtlMs ?? HARD_MACHINE_TTL_MS_DEFAULT),
  );
  const cleaned: string[] = [];
  let changed = false;
  const nextState = { ...chatState };

  if (isInvestigationActive(nextState.investigation_state)) {
    const inv = nextState.investigation_state;
    const ref = inv?.started_at ?? inv?.updated_at ?? inv?.last_updated_at;
    if (isOlderThan(ref, nowMs, hardTtlMs)) {
      nextState.investigation_state = null;
      changed = true;
      pushUnique(cleaned, "investigation_state");
    }
  }

  const tm = nextState.temp_memory && typeof nextState.temp_memory === "object"
    ? { ...nextState.temp_memory }
    : null;
  if (!tm) return { chatState: changed ? nextState : chatState, changed, cleaned };

  if (
    (tm as any).__safety_sentry_flow &&
    String((tm as any).__safety_sentry_flow?.phase ?? "") !== "resolved" &&
    isOlderThan(
      (tm as any).__safety_sentry_flow?.last_updated_at ??
        (tm as any).__safety_sentry_flow?.started_at,
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
      (tm as any).__safety_firefighter_flow?.last_updated_at ??
        (tm as any).__safety_firefighter_flow?.started_at,
      nowMs,
      hardTtlMs,
    )
  ) {
    delete (tm as any).__safety_firefighter_flow;
    changed = true;
    pushUnique(cleaned, "__safety_firefighter_flow");
  }

  if (
    (tm as any).__onboarding_active &&
    isOlderThan(
      (tm as any).__onboarding_active?.last_updated_at ??
        (tm as any).__onboarding_active?.started_at,
      nowMs,
      hardTtlMs,
    )
  ) {
    delete (tm as any).__onboarding_active;
    changed = true;
    pushUnique(cleaned, "__onboarding_active");
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

  if (machineLabel === "bilan_in_progress" && nextState.investigation_state) {
    nextState.investigation_state = null;
    changed = true;
    pushUnique(cleared, "investigation_state");
  }

  if (machineLabel === "safety_sentry") clearTmKey("__safety_sentry_flow");
  if (machineLabel === "safety_firefighter") {
    clearTmKey("__safety_firefighter_flow");
  }
  if (machineLabel === "onboarding") {
    clearTmKey("__onboarding_active");
    clearTmKey("__onboarding_flow");
  }

  if (changed) nextState.temp_memory = tm;
  return { chatState: changed ? nextState : chatState, changed, cleared };
}
