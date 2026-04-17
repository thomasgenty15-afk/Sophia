/**
 * Outreach context helpers extracted from sophia-brain/momentum_outreach.ts
 * to resolve layering violation (_shared/ -> sophia-brain/).
 */

export type MomentumOutreachState =
  | "friction_legere"
  | "evitement"
  | "soutien_emotionnel"
  | "reactivation";

const MOMENTUM_OUTREACH_EVENT_CONTEXTS = {
  friction_legere: "momentum_friction_legere",
  evitement: "momentum_evitement",
  soutien_emotionnel: "momentum_soutien_emotionnel",
  reactivation: "momentum_reactivation",
} as const satisfies Record<MomentumOutreachState, string>;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function listMomentumOutreachEventContexts(): string[] {
  return Object.values(MOMENTUM_OUTREACH_EVENT_CONTEXTS);
}

export function isMomentumOutreachEventContext(eventContext: string): boolean {
  return listMomentumOutreachEventContexts().includes(cleanText(eventContext));
}

export function getMomentumOutreachStateFromEventContext(
  eventContext: string,
): MomentumOutreachState | null {
  const normalized = cleanText(eventContext);
  const entry = Object.entries(MOMENTUM_OUTREACH_EVENT_CONTEXTS).find((
    [, value],
  ) => value === normalized);
  return (entry?.[0] as MomentumOutreachState | undefined) ?? null;
}
