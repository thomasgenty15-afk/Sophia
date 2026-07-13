/**
 * Machine à états PURE du flow « Présence » (mode ami).
 *
 * Une conversation pure centrée sur un sujet de fond: AUCUNE offre produit n'y
 * vit. Aucune génération, aucun I/O ici: uniquement les transitions. Le flow
 * est collant contre l'ambiguïté et transparent à l'explicite (charte cmd 9):
 * seuls des signaux explicites (demande d'outil, changement de sujet, clôture)
 * ou l'expiration le ferment. Les tours ambigus (« oui mais... », « ? ») et
 * les demandes de méthode (« concrètement je fais quoi ? ») maintiennent —
 * la méthode se donne en conversation.
 *
 * L'entrée/sortie safety n'est PAS gérée ici: le routeur global met safety
 * au-dessus de tout flow avant même d'atteindre ce skill.
 */

import type { PresenceConversationKind } from "../../contracts/turn_frame.v1.ts";

// 6h d'inactivité éteignent le flow (anti trou-noir), en plus du changement
// de jour local.
export const PRESENCE_INACTIVITY_EXPIRY_MS = 6 * 60 * 60 * 1000;

export type PresenceFlowState = {
  version: 1;
  entered_at: string;
  entry_reason: string;
  turns_in_flow: number;
  topic_hint: string | null;
  last_activity_at: string;
  local_date: string;
  // Soupape de compression du fil: quand la discussion verbatim déborde le
  // budget, la partie la plus ancienne est pliée dans ce résumé riche
  // (faits livrés par le user, prises de conscience, positions déjà données,
  // arc d'évolution). null tant que tout tient en verbatim.
  thread_summary: string | null;
  // Nombre de messages déjà pliés dans thread_summary (curseur d'incrément).
  thread_summary_folded_count: number;
};

export type PresenceExitReason =
  | "tool_pull"
  | "topic_change"
  | "closure"
  | "expired";

export type PresenceStep =
  | {
    status: "continue";
    next_state: PresenceFlowState;
  }
  | {
    status: "exit";
    exit_reason: PresenceExitReason;
  };

export function enterPresenceFlow(input: {
  nowIso: string;
  localDate: string;
  topicHint?: string | null;
  entryReason: string;
}): PresenceFlowState {
  return {
    version: 1,
    entered_at: input.nowIso,
    entry_reason: input.entryReason,
    turns_in_flow: 1,
    topic_hint: input.topicHint ?? null,
    last_activity_at: input.nowIso,
    local_date: input.localDate,
    thread_summary: null,
    thread_summary_folded_count: 0,
  };
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * Le flow a-t-il expiré au moment `nowIso`/`localDate` ? Vrai si > 6h
 * d'inactivité OU si le jour local a changé depuis l'entrée/dernière activité.
 */
export function isPresenceExpired(input: {
  state: PresenceFlowState;
  nowIso: string;
  localDate: string;
}): boolean {
  if (input.state.local_date && input.localDate &&
    input.localDate !== input.state.local_date) {
    return true;
  }
  const lastMs = parseIsoMs(input.state.last_activity_at);
  const nowMs = parseIsoMs(input.nowIso);
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastMs > PRESENCE_INACTIVITY_EXPIRY_MS;
}

/**
 * Transition d'un tour quand le flow est actif.
 *
 * Priorité: expiration → sortie explicite (tool_pull / topic_change /
 * closure) → maintien.
 *
 * Les sorties dépendent UNIQUEMENT du `kind` classé par le dispatcher global
 * (charte cmd 0: l'intention est décidée sémantiquement en amont, pas par un
 * heuristique local). Une demande de MÉTHODE reste un maintain: elle se sert
 * en conversation; seule une acceptation/demande explicite d'un dispositif
 * produit (kind=tool_pull) rend la main au dispatcher global.
 */
export function stepPresenceFlow(input: {
  state: PresenceFlowState;
  kind: PresenceConversationKind;
  nowIso: string;
  localDate: string;
}): PresenceStep {
  if (
    isPresenceExpired({
      state: input.state,
      nowIso: input.nowIso,
      localDate: input.localDate,
    })
  ) {
    return { status: "exit", exit_reason: "expired" };
  }

  if (input.kind === "tool_pull") {
    return { status: "exit", exit_reason: "tool_pull" };
  }
  if (input.kind === "topic_change") {
    return { status: "exit", exit_reason: "topic_change" };
  }
  if (input.kind === "closure") {
    return { status: "exit", exit_reason: "closure" };
  }

  const next_state: PresenceFlowState = {
    ...input.state,
    turns_in_flow: input.state.turns_in_flow + 1,
    last_activity_at: input.nowIso,
    local_date: input.localDate,
  };
  return { status: "continue", next_state };
}

/**
 * Replie un nouveau segment du fil dans le résumé (soupape de compression).
 * Pure: le contenu du résumé est produit en amont (LLM), ici on ne fait que
 * poser le nouvel état.
 */
export function withThreadSummary(
  state: PresenceFlowState,
  summary: string,
  foldedCount: number,
): PresenceFlowState {
  return {
    ...state,
    thread_summary: summary,
    thread_summary_folded_count: Math.max(
      foldedCount,
      state.thread_summary_folded_count,
    ),
  };
}
