// Chantier réengagement (2026-07-19) — state du flow winback_reengagement_v1.
// Moule du sas potion (armement hors conversation, lecture défensive), mais
// contrairement au sas le flow reste collant après la première réponse : le
// state est relu et réécrit à chaque tour par le conversation-skill runtime
// (applyConversationSkillState) sous la clé working_state
// "winback_reengagement_local_state".

import { ACTIVE_CONVERSATION_SKILL_KEY } from "../_shared/active_skill_state.ts";

export const WINBACK_REENGAGEMENT_SKILL_ID = "winback_reengagement_v1" as const;

export type WinbackReengagementStage =
  | "opening"
  | "diagnose"
  | "reanchor"
  | "solution"
  | "closure";

export type WinbackReengagementGates = {
  reason_status: "missing" | "captured" | "declined";
  reanchor_status: "not_needed" | "pending" | "done";
  solution_status: "pending" | "offered" | "accepted" | "declined";
};

export type WinbackSolutionKind =
  | "adjust_plan"
  | "attack_card"
  | "defense_card"
  | "pause"
  | "talk_reminder"
  | "product_help"
  | "none";

export type WinbackStalledAction = {
  plan_item_id: string;
  title: string;
  why_it_matters: string | null;
};

export type WinbackPastEpisode = {
  closed_at: string;
  reason_category: string | null;
  episode_summary: string | null;
  solution_offered: string | null;
  solution_accepted: boolean | null;
};

export type WinbackReengagementLocalState = {
  version: 1;
  episode_id: string;
  winback_step: 1 | 2 | 3;
  days_inactive_at_send: number;
  awaiting_first_reply: boolean;
  turn_count: number;
  stage: WinbackReengagementStage;
  gates: WinbackReengagementGates;
  working_reason_note: string | null;
  solution_kind: WinbackSolutionKind | null;
  redirect_target: string | null;
  context: {
    stalled_actions: WinbackStalledAction[];
    past_episodes: WinbackPastEpisode[];
    recent_episode_confirmable: boolean;
  };
};

export const WINBACK_REENGAGEMENT_MAX_TURNS = 12;

const STAGES = new Set<WinbackReengagementStage>([
  "opening",
  "diagnose",
  "reanchor",
  "solution",
  "closure",
]);

const SOLUTION_KINDS = new Set<WinbackSolutionKind>([
  "adjust_plan",
  "attack_card",
  "defense_card",
  "pause",
  "talk_reminder",
  "product_help",
  "none",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function coerceWinbackStage(value: unknown): WinbackReengagementStage {
  const stage = cleanText(value, 40) as WinbackReengagementStage;
  return STAGES.has(stage) ? stage : "opening";
}

export function coerceWinbackSolutionKind(
  value: unknown,
): WinbackSolutionKind | null {
  const kind = cleanText(value, 40) as WinbackSolutionKind;
  return SOLUTION_KINDS.has(kind) ? kind : null;
}

export function coerceWinbackGates(value: unknown): WinbackReengagementGates {
  const raw = isRecord(value) ? value : {};
  const reason = cleanText(raw.reason_status, 20);
  const reanchor = cleanText(raw.reanchor_status, 20);
  const solution = cleanText(raw.solution_status, 20);
  return {
    reason_status: reason === "captured" || reason === "declined"
      ? reason
      : "missing",
    reanchor_status:
      reanchor === "not_needed" || reanchor === "pending" || reanchor === "done"
        ? reanchor
        : "pending",
    solution_status: solution === "offered" || solution === "accepted" ||
        solution === "declined"
      ? solution
      : "pending",
  };
}

function stalledActions(value: unknown): WinbackStalledAction[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((item) => {
    if (!isRecord(item)) return [];
    const planItemId = cleanText(item.plan_item_id, 160);
    const title = cleanText(item.title, 200);
    if (!planItemId || !title) return [];
    return [{
      plan_item_id: planItemId,
      title,
      why_it_matters: cleanText(item.why_it_matters, 320) || null,
    }];
  });
}

function pastEpisodes(value: unknown): WinbackPastEpisode[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((item) => {
    if (!isRecord(item)) return [];
    const closedAt = cleanText(item.closed_at, 80);
    if (!closedAt) return [];
    return [{
      closed_at: closedAt,
      reason_category: cleanText(item.reason_category, 40) || null,
      episode_summary: cleanText(item.episode_summary, 800) || null,
      solution_offered: cleanText(item.solution_offered, 40) || null,
      solution_accepted: typeof item.solution_accepted === "boolean"
        ? item.solution_accepted
        : null,
    }];
  });
}

export function normalizeWinbackReengagementLocalState(
  value: unknown,
): WinbackReengagementLocalState | null {
  if (!isRecord(value)) return null;
  const episodeId = cleanText(value.episode_id, 160);
  if (!episodeId) return null;
  const context = isRecord(value.context) ? value.context : {};
  const step = Math.max(1, Math.min(3, Number(value.winback_step ?? 1) || 1));
  return {
    version: 1,
    episode_id: episodeId,
    winback_step: step as 1 | 2 | 3,
    days_inactive_at_send: Math.max(
      0,
      Number(value.days_inactive_at_send ?? 0) || 0,
    ),
    awaiting_first_reply: value.awaiting_first_reply === true,
    turn_count: Math.max(0, Number(value.turn_count ?? 0) || 0),
    stage: coerceWinbackStage(value.stage),
    gates: coerceWinbackGates(value.gates),
    working_reason_note: cleanText(value.working_reason_note, 500) || null,
    solution_kind: coerceWinbackSolutionKind(value.solution_kind),
    redirect_target: cleanText(value.redirect_target, 120) || null,
    context: {
      stalled_actions: stalledActions(context.stalled_actions),
      past_episodes: pastEpisodes(context.past_episodes),
      recent_episode_confirmable: context.recent_episode_confirmable === true,
    },
  };
}

/** Lit le state du flow depuis un active_skill_state quelconque. */
export function readWinbackReengagementLocalState(
  activeSkillState: unknown,
): WinbackReengagementLocalState | null {
  if (!isRecord(activeSkillState)) return null;
  if (
    cleanText(activeSkillState.skill_id) !== WINBACK_REENGAGEMENT_SKILL_ID
  ) return null;
  const working = isRecord(activeSkillState.working_state)
    ? activeSkillState.working_state
    : {};
  return normalizeWinbackReengagementLocalState(
    working.winback_reengagement_local_state,
  );
}

/**
 * Armement hors conversation (process-checkins à l'envoi d'une touche, ou
 * ceinture webhook). Ré-armement idempotent : si un state winback du même
 * épisode existe déjà en awaiting_first_reply, seul winback_step est bumpé.
 */
export function armWinbackReengagement(input: {
  tempMemory: Record<string, unknown>;
  nowIso: string;
  context: {
    episode_id: string;
    winback_step: 1 | 2 | 3;
    days_inactive_at_send: number;
    stalled_actions: WinbackStalledAction[];
    past_episodes: WinbackPastEpisode[];
    recent_episode_confirmable: boolean;
  };
}): Record<string, unknown> {
  const existing = readWinbackReengagementLocalState(
    input.tempMemory[ACTIVE_CONVERSATION_SKILL_KEY] ??
      input.tempMemory.__active_skill_state,
  );
  const localState: WinbackReengagementLocalState =
    existing && existing.awaiting_first_reply &&
      existing.episode_id === input.context.episode_id
      ? { ...existing, winback_step: input.context.winback_step }
      : {
        version: 1,
        episode_id: input.context.episode_id,
        winback_step: input.context.winback_step,
        days_inactive_at_send: input.context.days_inactive_at_send,
        awaiting_first_reply: true,
        turn_count: 0,
        stage: "opening",
        gates: {
          reason_status: "missing",
          reanchor_status: "pending",
          solution_status: "pending",
        },
        working_reason_note: null,
        solution_kind: null,
        redirect_target: null,
        context: {
          stalled_actions: input.context.stalled_actions.slice(0, 3),
          past_episodes: input.context.past_episodes.slice(0, 3),
          recent_episode_confirmable: input.context.recent_episode_confirmable,
        },
      };
  const state = {
    version: 1,
    skill_id: WINBACK_REENGAGEMENT_SKILL_ID,
    status: "active",
    turn_count: localState.turn_count,
    started_at: input.nowIso,
    updated_at: input.nowIso,
    working_state: {
      winback_reengagement_local_state: localState,
    },
  };
  const next = { ...input.tempMemory };
  next[ACTIVE_CONVERSATION_SKILL_KEY] = state;
  next.__active_skill_state = state;
  delete next.active_skill_state;
  return next;
}

/** Désarme le flow si (et seulement si) c'est lui qui est actif. */
export function disarmWinbackReengagement(
  tempMemory: Record<string, unknown>,
): Record<string, unknown> {
  const active = tempMemory[ACTIVE_CONVERSATION_SKILL_KEY] ??
    tempMemory.__active_skill_state;
  if (!isRecord(active)) return tempMemory;
  if (cleanText(active.skill_id) !== WINBACK_REENGAGEMENT_SKILL_ID) {
    return tempMemory;
  }
  const next = { ...tempMemory };
  delete next[ACTIVE_CONVERSATION_SKILL_KEY];
  delete next.__active_skill_state;
  delete next.active_skill_state;
  return next;
}
