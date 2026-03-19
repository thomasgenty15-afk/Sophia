import type {
  DispatcherMemoryPlan,
  DispatcherSignals,
  DispatcherSurfaceCandidate,
  DispatcherSurfacePlan,
} from "./router/dispatcher.ts";
import {
  findExplicitSurfaceIdsByText,
  getSurfaceDefinition,
  getSurfaceLevelCap,
  type SurfaceId,
} from "./surface_registry.ts";

type SurfaceEngagement = "accepted" | "ignored" | "neutral";

export interface SurfaceStateEntry {
  surface_id: SurfaceId;
  latent_score: number;
  current_level: number;
  last_reason?: string;
  last_suggested_at?: string;
  last_explicit_accept_at?: string;
  last_explicit_ignore_at?: string;
  shown_count_recent: number;
  accepted_count: number;
  ignored_count: number;
  fatigue_score: number;
  cooldown_turns_remaining: number;
  active_topic?: string;
  last_content_id?: string;
  last_session_id?: string;
}

export interface SurfaceStateMemory {
  version: 1;
  updated_at?: string;
  entries: Record<string, SurfaceStateEntry>;
  last_presented_surface_id?: SurfaceId;
  last_presented_level?: number;
  last_presented_at?: string;
  turns_since_last_presented?: number;
}

export interface SurfaceRuntimeAddon {
  surface_id: SurfaceId;
  family: "utility" | "transformational";
  label: string;
  level: number;
  cta_style: "none" | "soft" | "direct";
  content_need: "none" | "light" | "ranked" | "full";
  reason: string;
  confidence: number;
  query_hint?: string;
  selected_at: string;
}

export interface SurfaceRuntimeDecision {
  addon?: SurfaceRuntimeAddon;
  state: SurfaceStateMemory;
}

const POSITIVE_ACCEPT_PATTERNS = [
  /\bvas[- ]?y\b/i,
  /\bgo\b/i,
  /\bok\b/i,
  /\boui\b/i,
  /\bchaud\b/i,
  /\bça m'intéresse\b/i,
  /\bje veux\b/i,
  /\bmontre\b/i,
  /\bexplique\b/i,
];

const NEGATIVE_IGNORE_PATTERNS = [
  /\bpas besoin\b/i,
  /\bpas maintenant\b/i,
  /\bplus tard\b/i,
  /\blaisse\b/i,
  /\bnon merci\b/i,
  /\bpas envie\b/i,
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function createDefaultEntry(surfaceId: SurfaceId): SurfaceStateEntry {
  return {
    surface_id: surfaceId,
    latent_score: 0,
    current_level: 0,
    shown_count_recent: 0,
    accepted_count: 0,
    ignored_count: 0,
    fatigue_score: 0,
    cooldown_turns_remaining: 0,
  };
}

export function readSurfaceState(tempMemory: any): SurfaceStateMemory {
  const raw = tempMemory?.__surface_state;
  const entriesRaw = raw && typeof raw === "object" && raw.entries &&
      typeof raw.entries === "object"
    ? raw.entries as Record<string, any>
    : {};
  const entries: Record<string, SurfaceStateEntry> = {};
  for (const [key, value] of Object.entries(entriesRaw)) {
    if (!getSurfaceDefinition(key)) continue;
    entries[key] = {
      surface_id: key as SurfaceId,
      latent_score: round2(clamp(Number(value?.latent_score ?? 0), 0, 5)),
      current_level: clamp(Math.round(Number(value?.current_level ?? 0)), 0, 5),
      last_reason: typeof value?.last_reason === "string"
        ? value.last_reason.slice(0, 200)
        : undefined,
      last_suggested_at: typeof value?.last_suggested_at === "string"
        ? value.last_suggested_at
        : undefined,
      last_explicit_accept_at: typeof value?.last_explicit_accept_at === "string"
        ? value.last_explicit_accept_at
        : undefined,
      last_explicit_ignore_at: typeof value?.last_explicit_ignore_at === "string"
        ? value.last_explicit_ignore_at
        : undefined,
      shown_count_recent: round2(clamp(Number(value?.shown_count_recent ?? 0), 0, 10)),
      accepted_count: clamp(Math.round(Number(value?.accepted_count ?? 0)), 0, 100),
      ignored_count: clamp(Math.round(Number(value?.ignored_count ?? 0)), 0, 100),
      fatigue_score: round2(clamp(Number(value?.fatigue_score ?? 0), 0, 5)),
      cooldown_turns_remaining: clamp(
        Math.round(Number(value?.cooldown_turns_remaining ?? 0)),
        0,
        10,
      ),
      active_topic: typeof value?.active_topic === "string"
        ? value.active_topic.slice(0, 120)
        : undefined,
      last_content_id: typeof value?.last_content_id === "string"
        ? value.last_content_id.slice(0, 120)
        : undefined,
      last_session_id: typeof value?.last_session_id === "string"
        ? value.last_session_id.slice(0, 120)
        : undefined,
    };
  }
  return {
    version: 1,
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : undefined,
    entries,
    last_presented_surface_id: getSurfaceDefinition(raw?.last_presented_surface_id)
      ? raw.last_presented_surface_id as SurfaceId
      : undefined,
    last_presented_level: clamp(
      Math.round(Number(raw?.last_presented_level ?? 0)),
      0,
      5,
    ) || undefined,
    last_presented_at: typeof raw?.last_presented_at === "string"
      ? raw.last_presented_at
      : undefined,
    turns_since_last_presented: clamp(
      Math.round(Number(raw?.turns_since_last_presented ?? 0)),
      0,
      20,
    ) || undefined,
  };
}

function detectEngagement(
  userMessage: string,
  lastPresentedSurfaceId?: SurfaceId,
  lastPresentedLevel?: number,
): SurfaceEngagement {
  const text = String(userMessage ?? "").trim();
  if (!text || !lastPresentedSurfaceId) return "neutral";
  const matchedSurfaceIds = new Set(findExplicitSurfaceIdsByText(text));
  const mentionsLastSurface = matchedSurfaceIds.has(lastPresentedSurfaceId);
  const isShortReply = text.length <= 40;
  const lastSurfaceWasStronglyVisible = Number(lastPresentedLevel ?? 0) >= 4;
  if (
    (mentionsLastSurface || lastSurfaceWasStronglyVisible) &&
    NEGATIVE_IGNORE_PATTERNS.some((pattern) => pattern.test(text)) &&
    isShortReply
  ) {
    return "ignored";
  }
  if (
    mentionsLastSurface ||
    (
      lastSurfaceWasStronglyVisible &&
      POSITIVE_ACCEPT_PATTERNS.some((pattern) => pattern.test(text)) &&
      isShortReply
    )
  ) {
    return "accepted";
  }
  return "neutral";
}

function decayEntries(state: SurfaceStateMemory): void {
  for (const entry of Object.values(state.entries)) {
    entry.latent_score = round2(entry.latent_score * 0.82);
    entry.shown_count_recent = round2(entry.shown_count_recent * 0.65);
    entry.fatigue_score = round2(entry.fatigue_score * 0.82);
    if (entry.cooldown_turns_remaining > 0) {
      entry.cooldown_turns_remaining -= 1;
    }
    if (entry.current_level > 0) {
      entry.current_level = Math.max(0, entry.current_level - 1);
    }
  }
}

function shouldSuppressSurface(
  surfaceId: SurfaceId,
  dispatcherSignals: DispatcherSignals,
): boolean {
  if (
    surfaceId === "dashboard.personal_actions" &&
    (
      dispatcherSignals.create_action?.detected ||
      dispatcherSignals.update_action?.detected ||
      dispatcherSignals.breakdown_action?.detected ||
      dispatcherSignals.activate_action?.detected ||
      dispatcherSignals.deactivate_action?.detected ||
      dispatcherSignals.delete_action?.detected ||
      dispatcherSignals.action_discussion?.detected
    )
  ) {
    return true;
  }
  if (
    surfaceId === "dashboard.preferences" &&
    dispatcherSignals.dashboard_preferences_intent?.detected
  ) {
    return true;
  }
  if (
    surfaceId === "dashboard.reminders" &&
    dispatcherSignals.dashboard_recurring_reminder_intent?.detected
  ) {
    return true;
  }
  return false;
}

function hasCompetingDashboardOrActionIntent(
  dispatcherSignals: DispatcherSignals,
): boolean {
  return Boolean(
    dispatcherSignals.create_action?.detected ||
      dispatcherSignals.update_action?.detected ||
      dispatcherSignals.breakdown_action?.detected ||
      dispatcherSignals.action_discussion?.detected ||
      dispatcherSignals.activate_action?.detected ||
      dispatcherSignals.deactivate_action?.detected ||
      dispatcherSignals.delete_action?.detected ||
      dispatcherSignals.dashboard_preferences_intent?.detected ||
      dispatcherSignals.dashboard_recurring_reminder_intent?.detected,
  );
}

function scoreCandidate(params: {
  candidate: DispatcherSurfaceCandidate;
  entry: SurfaceStateEntry;
  directSurfaceMentions: Set<SurfaceId>;
}): number {
  const { candidate, entry, directSurfaceMentions } = params;
  let score = Number(candidate.confidence ?? 0.5) * 1.4 + entry.latent_score;
  score += (Math.max(1, candidate.suggested_level) - 1) * 0.18;
  if (directSurfaceMentions.has(candidate.surface_id as SurfaceId)) score += 0.7;
  if (candidate.evidence_window === "both") score += 0.15;
  score -= entry.fatigue_score * 0.55;
  if (entry.cooldown_turns_remaining > 0) score -= 0.8;
  if (entry.shown_count_recent >= 1.4) score -= 0.25;
  return round2(score);
}

function deriveFinalLevel(params: {
  candidate: DispatcherSurfaceCandidate;
  plan: DispatcherSurfacePlan;
  entry: SurfaceStateEntry;
  directMention: boolean;
  explicitAccepted: boolean;
  repeatedSameSurface: boolean;
  recentlyPresentedDifferentSurface: boolean;
}): number {
  const {
    candidate,
    plan,
    entry,
    directMention,
    explicitAccepted,
    repeatedSameSurface,
    recentlyPresentedDifferentSurface,
  } = params;
  let level = clamp(Math.round(candidate.suggested_level ?? 2), 1, 5);

  if (entry.latent_score >= 1.8) level += 1;
  if (entry.latent_score >= 2.8) level += 1;
  if (entry.current_level > 0) level = Math.max(level, entry.current_level + 1);
  if (entry.fatigue_score >= 1.5) level -= 1;
  if (entry.cooldown_turns_remaining > 0 && !directMention && !explicitAccepted) {
    level = Math.min(level, 2);
  }
  if (directMention) level = Math.max(level, 4);
  if (explicitAccepted) level = Math.max(level, 4);
  if (plan.surface_mode === "light") level = Math.min(level, 2);
  if (plan.surface_mode === "opportunistic") level = Math.min(level, 3);
  if (plan.surface_mode === "guided") level = Math.min(level, 4);
  if (plan.surface_mode === "none") level = 1;
  if (repeatedSameSurface && !directMention && !explicitAccepted) level = 1;
  if (recentlyPresentedDifferentSurface && !directMention && !explicitAccepted) {
    level = 1;
  }

  return clamp(level, 1, getSurfaceLevelCap(candidate.surface_id));
}

function touchEntryFromCandidate(
  entry: SurfaceStateEntry,
  candidate: DispatcherSurfaceCandidate,
  nowIso: string,
): void {
  const boost = 0.45 + Number(candidate.confidence ?? 0.5) * 0.7 +
    (Math.max(1, candidate.suggested_level) - 1) * 0.1;
  entry.latent_score = round2(clamp(entry.latent_score + boost, 0, 5));
  entry.last_reason = String(candidate.reason ?? "").trim().slice(0, 200) ||
    entry.last_reason;
  entry.active_topic = String(candidate.content_query_hint ?? "").trim().slice(0, 120) ||
    entry.active_topic;
  entry.last_session_id = nowIso;
}

function clearSurfaceAddon(tempMemory: any): void {
  try {
    delete tempMemory.__surface_opportunity_addon;
  } catch {
    // best effort
  }
}

function normalizeRuntimeCtaStyle(
  ctaStyle: DispatcherSurfaceCandidate["cta_style"],
  finalLevel: number,
): SurfaceRuntimeAddon["cta_style"] {
  if (finalLevel <= 2) return "none";
  if (finalLevel === 3 && ctaStyle === "direct") return "soft";
  return ctaStyle;
}

function normalizeRuntimeContentNeed(
  contentNeed: DispatcherSurfaceCandidate["content_need"],
  finalLevel: number,
  surfaceId: SurfaceId,
): SurfaceRuntimeAddon["content_need"] {
  const surface = getSurfaceDefinition(surfaceId);
  if (!surface || surface.contentSource === "none") return "none";
  if (finalLevel <= 2) return "none";
  if (finalLevel === 3) {
    if (contentNeed === "full" || contentNeed === "ranked") return "light";
    return contentNeed === "none" ? "none" : "light";
  }
  return contentNeed;
}

export function buildSurfaceRuntimeDecision(args: {
  tempMemory: any;
  memoryPlan?: DispatcherMemoryPlan | null;
  surfacePlan?: DispatcherSurfacePlan | null;
  dispatcherSignals: DispatcherSignals;
  userMessage: string;
  targetMode: string;
  nowIso?: string;
}): SurfaceRuntimeDecision {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const state = readSurfaceState(args.tempMemory);
  decayEntries(state);
  if (state.last_presented_surface_id) {
    state.turns_since_last_presented = clamp(
      Number(state.turns_since_last_presented ?? 0) + 1,
      0,
      20,
    );
  } else {
    state.turns_since_last_presented = undefined;
  }

  const engagement = detectEngagement(
    args.userMessage,
    state.last_presented_surface_id,
    state.last_presented_level,
  );
  if (state.last_presented_surface_id) {
    const previous = state.entries[state.last_presented_surface_id] ??
      createDefaultEntry(state.last_presented_surface_id);
    state.entries[state.last_presented_surface_id] = previous;
    if (engagement === "accepted") {
      previous.accepted_count += 1;
      previous.last_explicit_accept_at = nowIso;
      previous.latent_score = round2(clamp(previous.latent_score + 0.8, 0, 5));
      previous.fatigue_score = round2(clamp(previous.fatigue_score - 0.6, 0, 5));
      previous.cooldown_turns_remaining = 0;
    } else if (engagement === "ignored") {
      previous.ignored_count += 1;
      previous.last_explicit_ignore_at = nowIso;
      previous.fatigue_score = round2(clamp(previous.fatigue_score + 1.1, 0, 5));
      previous.cooldown_turns_remaining = 3;
    }
  }

  if (args.targetMode !== "companion") {
    clearSurfaceAddon(args.tempMemory);
    args.tempMemory.__surface_state = { ...state, updated_at: nowIso };
    return { state };
  }

  const memoryIntent = String(args.memoryPlan?.response_intent ?? "").trim();
  const memoryContextNeed = String(args.memoryPlan?.context_need ?? "").trim();
  const competingDashboardOrActionIntent = hasCompetingDashboardOrActionIntent(
    args.dispatcherSignals,
  );

  const candidates = Array.isArray(args.surfacePlan?.candidates)
    ? args.surfacePlan!.candidates
    : [];
  const directSurfaceMentions = new Set(findExplicitSurfaceIdsByText(args.userMessage));
  const scored: Array<{
    candidate: DispatcherSurfaceCandidate;
    entry: SurfaceStateEntry;
    score: number;
  }> = [];

  if (
    args.surfacePlan?.surface_mode === "none" ||
    Number(args.surfacePlan?.plan_confidence ?? 0) < 0.55
  ) {
    clearSurfaceAddon(args.tempMemory);
    state.updated_at = nowIso;
    args.tempMemory.__surface_state = state;
    return { state };
  }

  for (const candidate of candidates) {
    const surface = getSurfaceDefinition(candidate.surface_id);
    if (!surface) continue;
    if (shouldSuppressSurface(surface.id, args.dispatcherSignals)) continue;
    if (
      memoryIntent === "inventory" &&
      memoryContextNeed === "dossier" &&
      !directSurfaceMentions.has(surface.id)
    ) {
      continue;
    }
    if (
      memoryIntent === "tooling" &&
      !directSurfaceMentions.has(surface.id)
    ) {
      continue;
    }
    if (
      competingDashboardOrActionIntent &&
      !directSurfaceMentions.has(surface.id)
    ) {
      continue;
    }
    const entry = state.entries[surface.id] ?? createDefaultEntry(surface.id);
    touchEntryFromCandidate(entry, candidate, nowIso);
    state.entries[surface.id] = entry;
    scored.push({
      candidate,
      entry,
      score: scoreCandidate({
        candidate,
        entry,
        directSurfaceMentions,
      }),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  if (!winner || winner.score < 1.05) {
    clearSurfaceAddon(args.tempMemory);
    state.updated_at = nowIso;
    args.tempMemory.__surface_state = state;
    return { state };
  }

  const directMention = directSurfaceMentions.has(
    winner.candidate.surface_id as SurfaceId,
  );
  const explicitAccepted = engagement === "accepted" &&
    state.last_presented_surface_id === winner.candidate.surface_id;
  const repeatedSameSurface = state.last_presented_surface_id ===
    winner.candidate.surface_id &&
    (winner.entry.shown_count_recent >= 0.5 || winner.entry.current_level >= 1);
  const recentlyPresentedDifferentSurface = Boolean(
    state.last_presented_surface_id &&
      state.last_presented_surface_id !== winner.candidate.surface_id &&
      Number(state.turns_since_last_presented ?? 99) <= 1,
  );
  const finalLevel = deriveFinalLevel({
    candidate: winner.candidate,
    plan: args.surfacePlan ?? {
      surface_mode: "none",
      planning_horizon: "watch_next_turns",
      candidates: [],
      plan_confidence: 0,
    },
    entry: winner.entry,
    directMention,
    explicitAccepted,
    repeatedSameSurface,
    recentlyPresentedDifferentSurface,
  });

  if (finalLevel < 2) {
    clearSurfaceAddon(args.tempMemory);
    state.updated_at = nowIso;
    args.tempMemory.__surface_state = state;
    return { state };
  }

  winner.entry.current_level = finalLevel;
  winner.entry.last_suggested_at = nowIso;
  winner.entry.last_reason = String(winner.candidate.reason ?? "").trim().slice(0, 200);
  winner.entry.shown_count_recent = round2(
    clamp(winner.entry.shown_count_recent + 1, 0, 10),
  );
  winner.entry.fatigue_score = round2(
    clamp(winner.entry.fatigue_score + (finalLevel >= 4 ? 0.55 : 0.28), 0, 5),
  );
  if (winner.entry.shown_count_recent >= 2.2 && finalLevel >= 4 && !directMention) {
    winner.entry.cooldown_turns_remaining = Math.max(
      winner.entry.cooldown_turns_remaining,
      2,
    );
  }

  const surface = getSurfaceDefinition(winner.candidate.surface_id)!;
  const normalizedCtaStyle = normalizeRuntimeCtaStyle(
    winner.candidate.cta_style,
    finalLevel,
  );
  const normalizedContentNeed = normalizeRuntimeContentNeed(
    winner.candidate.content_need,
    finalLevel,
    surface.id,
  );
  const addon: SurfaceRuntimeAddon = {
    surface_id: surface.id,
    family: surface.family,
    label: surface.label,
    level: finalLevel,
    cta_style: normalizedCtaStyle,
    content_need: normalizedContentNeed,
    reason: String(winner.candidate.reason ?? "").trim().slice(0, 200),
    confidence: clamp(Number(winner.candidate.confidence ?? 0.5), 0, 1),
    query_hint: normalizedContentNeed !== "none"
      ? String(winner.candidate.content_query_hint ?? "").trim().slice(0, 140) ||
        undefined
      : undefined,
    selected_at: nowIso,
  };

  args.tempMemory.__surface_opportunity_addon = addon;
  state.last_presented_surface_id = surface.id;
  state.last_presented_level = finalLevel;
  state.last_presented_at = nowIso;
  state.turns_since_last_presented = 0;
  state.updated_at = nowIso;
  args.tempMemory.__surface_state = state;
  return {
    addon,
    state,
  };
}
