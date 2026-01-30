export type GuestPlanFlowState = Record<string, any>;

const KEY = "sophia:guest_plan_flow_state:v1";

export function saveGuestPlanFlowState(state: GuestPlanFlowState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state ?? null));
  } catch {
    // ignore (Safari private mode, quota, etc.)
  }
}

export function loadGuestPlanFlowState(): GuestPlanFlowState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as GuestPlanFlowState;
  } catch {
    return null;
  }
}

export function clearGuestPlanFlowState() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}



