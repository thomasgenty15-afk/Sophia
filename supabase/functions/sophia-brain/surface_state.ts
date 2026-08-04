export type SurfaceRuntimeState = {
  last_selected_surface_id?: string | null;
  last_selected_at?: string | null;
};

export type SurfaceRuntimeAddon = {
  surface_id: string;
  level: number;
  cta_style: string;
  content_need: string;
  confidence: number;
  reason?: string | null;
  query_hint?: string | null;
};

export function readSurfaceState(tempMemory: any): SurfaceRuntimeState {
  const raw = tempMemory?.__surface_runtime_state;
  return raw && typeof raw === "object" ? raw as SurfaceRuntimeState : {};
}

export function buildSurfaceRuntimeDecision(args: {
  previousState?: SurfaceRuntimeState | null;
  tempMemory?: unknown;
  surfacePlan?: unknown;
  targetMode?: string;
  [key: string]: unknown;
}): { state: SurfaceRuntimeState; addon: SurfaceRuntimeAddon | null } {
  return {
    state: args.previousState ?? {},
    addon: null,
  };
}
