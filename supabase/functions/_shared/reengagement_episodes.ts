// Chantier réengagement (2026-07-19).
// Cycle de vie des épisodes de décrochage (table reengagement_episodes) :
// - ouverts/touchés par process-checkins à l'envoi des touches winback,
// - clos par whatsapp-webhook à la réponse utilisateur (chemin précis,
//   intent connu),
// - balayés par process-checkins pour les fins sans conversation (retour
//   plateforme, silence terminal post-step 3) et comme ceinture pour les
//   réponses que le webhook aurait ratées.
// L'épisode DB est la source de vérité du décrochage ; l'extraction de la
// raison et l'outcome J+7 sont des passes ultérieures (phase 3) — ici on ne
// remplit que les faits connus par le code. Les écritures sont best-effort :
// une panne de la couche data ne doit jamais bloquer l'envoi d'un winback ni
// la réponse à l'utilisateur.

import type { WinbackReplyIntent, WinbackStep } from "./whatsapp_winback.ts";

export const REENGAGEMENT_NO_REPLY_CLOSE_DAYS_AFTER_STEP3 = 7;
// Cap dur : un épisode jamais entré en conversation (pause posée en cours
// d'escalade, perte d'accès…) finit par se clore en no_reply plutôt que de
// rester ouvert indéfiniment.
export const REENGAGEMENT_STALE_OPEN_CLOSE_DAYS = 30;
// Un épisode entré en conversation (first_reply_at posé) mais jamais
// terminalisé par le flow (staleness 4h, sujet dévié…) est clos en
// abandoned_mid_flow après ce délai de silence — l'extraction tourne sur le
// transcript partiel.
export const REENGAGEMENT_ABANDONED_MID_FLOW_SILENCE_HOURS = 24;

export type ReengagementExitStatus =
  | "reengaged"
  | "paused"
  | "stopped"
  | "no_reply"
  | "abandoned_mid_flow"
  | "reactivated_via_platform"
  | "safety";

export type ReengagementEntryKind =
  | "replied_to_template"
  | "spontaneous_return"
  | "platform_return";

export interface ReengagementEpisodeSweepInput {
  last_touch_step: number;
  opened_at: string | null;
  touch1_sent_at: string | null;
  touch2_sent_at: string | null;
  touch3_sent_at: string | null;
  /** Posé quand l'épisode est entré en conversation (flow armé, réponse reçue). */
  first_reply_at: string | null;
}

export type ReengagementEpisodeSweepDecision =
  | { action: "keep" }
  | {
    action: "close";
    exit_status: ReengagementExitStatus;
    entry_kind: ReengagementEntryKind | null;
    replied_at_step: WinbackStep | null;
    first_reply_at: string | null;
    extraction_status: "pending" | "nothing_to_extract";
  };

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function clampStep(value: unknown): WinbackStep {
  const step = Math.max(1, Math.min(3, Math.floor(Number(value ?? 1)) || 1));
  return step as WinbackStep;
}

/** Dernière touche envoyée : référence pour savoir si un inbound est une réponse. */
function lastTouchSentMs(episode: ReengagementEpisodeSweepInput): number | null {
  return parseIsoMs(episode.touch3_sent_at) ??
    parseIsoMs(episode.touch2_sent_at) ??
    parseIsoMs(episode.touch1_sent_at) ??
    parseIsoMs(episode.opened_at);
}

/**
 * Mapping intent de réponse winback → fin d'épisode. Les pauses (courte,
 * semaine, "je reviendrai") sont des sorties consenties, pas des
 * réengagements ; tout le reste (resume, simplify, freeform) signifie que la
 * conversation est repartie.
 */
export function winbackReplyExitStatus(
  intent: WinbackReplyIntent,
): ReengagementExitStatus {
  if (
    intent === "pause_short" || intent === "pause_week" ||
    intent === "wait_for_user"
  ) {
    return "paused";
  }
  return "reengaged";
}

/**
 * Décision pure du sweep pour un épisode ouvert.
 *
 * Principe (charte cmd 0/14 — pas d'inférence sémantique sur un signal
 * non sémantique) : le sweep ne CLASSE JAMAIS une réponse conversationnelle.
 * Un `whatsapp_last_inbound_at > touche` peut être un STOP, un vocal, une
 * réaction ou un message sans rapport ; en déduire `reengaged` mislabelle.
 * La clôture-réponse appartient donc aux closers qui voient le CONTENU :
 * le flow (winback_reengagement_v1, flag ON) et la branche webhook winback
 * (flag OFF, fenêtre 6h). Le sweep ne fait que des clôtures temps/activité
 * qui ne fabriquent aucune intention :
 *  - abandon en cours de flow (first_reply_at posé, 24h de silence),
 *  - retour plateforme,
 *  - silence terminal 7 jours après le step 3,
 *  - cap dur 30 jours après la dernière touche (pause posée en cours
 *    d'escalade, perte d'accès…).
 * Sinon on garde l'épisode ouvert (le closer content-aware le fermera).
 */
export function decideReengagementEpisodeSweep(args: {
  episode: ReengagementEpisodeSweepInput;
  lastInboundAtMs: number | null;
  platformActivityRecent: boolean;
  nowMs: number;
}): ReengagementEpisodeSweepDecision {
  const touchMs = lastTouchSentMs(args.episode);

  const firstReplyMs = parseIsoMs(args.episode.first_reply_at);
  if (firstReplyMs !== null) {
    const lastActivityMs = Math.max(firstReplyMs, args.lastInboundAtMs ?? 0);
    if (
      args.nowMs - lastActivityMs >=
        REENGAGEMENT_ABANDONED_MID_FLOW_SILENCE_HOURS * 60 * 60 * 1000
    ) {
      return {
        action: "close",
        exit_status: "abandoned_mid_flow",
        entry_kind: null,
        replied_at_step: null,
        first_reply_at: null,
        extraction_status: "pending",
      };
    }
    return { action: "keep" };
  }

  if (args.platformActivityRecent) {
    return {
      action: "close",
      exit_status: "reactivated_via_platform",
      entry_kind: "platform_return",
      replied_at_step: null,
      first_reply_at: null,
      extraction_status: "nothing_to_extract",
    };
  }

  const touch3Ms = parseIsoMs(args.episode.touch3_sent_at);
  if (
    clampStep(args.episode.last_touch_step) >= 3 && touch3Ms !== null &&
    args.nowMs - touch3Ms >=
      REENGAGEMENT_NO_REPLY_CLOSE_DAYS_AFTER_STEP3 * 24 * 60 * 60 * 1000
  ) {
    return {
      action: "close",
      exit_status: "no_reply",
      entry_kind: null,
      replied_at_step: null,
      first_reply_at: null,
      extraction_status: "nothing_to_extract",
    };
  }

  if (
    touchMs !== null &&
    args.nowMs - touchMs >=
      REENGAGEMENT_STALE_OPEN_CLOSE_DAYS * 24 * 60 * 60 * 1000
  ) {
    return {
      action: "close",
      exit_status: "no_reply",
      entry_kind: null,
      replied_at_step: null,
      first_reply_at: null,
      extraction_status: "nothing_to_extract",
    };
  }

  return { action: "keep" };
}

// deno-lint-ignore no-explicit-any
type AdminClient = any;

async function fetchOpenEpisode(
  admin: AdminClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("reengagement_episodes")
    .select(
      "id,user_id,opened_at,last_touch_step,touch1_sent_at,touch2_sent_at,touch3_sent_at,first_reply_at",
    )
    .eq("user_id", userId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * À l'envoi d'une touche winback : ouvre l'épisode (step 1, ou steps 2/3 si
 * l'escalade était déjà en cours avant la table — cas legacy) ou enregistre
 * la touche sur l'épisode ouvert. Le timestamp d'une touche déjà posée n'est
 * jamais écrasé. Retourne l'id d'épisode (pour la traçabilité outbound) ou
 * null en cas d'échec — sans jamais faire échouer l'envoi du winback.
 */
export async function openOrTouchReengagementEpisode(args: {
  admin: AdminClient;
  userId: string;
  step: WinbackStep;
  inactivityDays: number | null;
  nowIso: string;
  requestId: string;
}): Promise<string | null> {
  const touchColumn = `touch${args.step}_sent_at`;
  try {
    const existing = await fetchOpenEpisode(args.admin, args.userId);
    if (existing) {
      const patch: Record<string, unknown> = {
        last_touch_step: Math.max(
          clampStep(existing.last_touch_step),
          args.step,
        ),
        updated_at: args.nowIso,
      };
      if (!existing[touchColumn]) patch[touchColumn] = args.nowIso;
      const { error } = await args.admin
        .from("reengagement_episodes")
        .update(patch)
        .eq("id", existing.id)
        .is("closed_at", null);
      if (error) throw error;
      return String(existing.id);
    }

    const { data, error } = await args.admin
      .from("reengagement_episodes")
      .insert({
        user_id: args.userId,
        opened_at: args.nowIso,
        days_inactive_at_open: Math.max(
          0,
          Math.floor(Number(args.inactivityDays ?? 0)) || 0,
        ),
        last_touch_step: args.step,
        [touchColumn]: args.nowIso,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      // Course entre deux crons : l'index partiel unique a tranché, on
      // retombe sur l'épisode gagnant.
      if (String((error as { code?: unknown }).code ?? "") === "23505") {
        const winner = await fetchOpenEpisode(args.admin, args.userId);
        return winner ? String(winner.id) : null;
      }
      throw error;
    }
    return String((data as { id?: unknown } | null)?.id ?? "") || null;
  } catch (error) {
    console.warn(
      `[reengagement] request_id=${args.requestId} episode_open_or_touch_failed user_id=${args.userId} step=${args.step}`,
      error,
    );
    return null;
  }
}

/**
 * Flow réengagement actif : la réponse utilisateur marque l'entrée en
 * conversation SANS clore l'épisode — c'est le flow qui le terminalisera
 * (ou le sweep en abandoned_mid_flow). Retourne l'id d'épisode ou null.
 */
export async function markReengagementEpisodeEntered(args: {
  admin: AdminClient;
  userId: string;
  nowIso: string;
  requestId: string;
}): Promise<string | null> {
  try {
    const episode = await fetchOpenEpisode(args.admin, args.userId);
    if (!episode) return null;
    if (episode.first_reply_at) return String(episode.id);
    const { error } = await args.admin
      .from("reengagement_episodes")
      .update({
        first_reply_at: args.nowIso,
        replied_at_step: clampStep(episode.last_touch_step),
        entry_kind: "replied_to_template",
        updated_at: args.nowIso,
      })
      .eq("id", episode.id)
      .is("closed_at", null);
    if (error) throw error;
    return String(episode.id);
  } catch (error) {
    console.warn(
      `[reengagement] request_id=${args.requestId} episode_mark_entered_failed user_id=${args.userId}`,
      error,
    );
    return null;
  }
}

/**
 * À la réponse utilisateur sur le chemin winback du webhook : clôt l'épisode
 * ouvert avec les faits précis (touche à laquelle il a répondu, intent).
 * No-op s'il n'y a pas d'épisode ouvert (winback antérieur à la table).
 */
export async function closeReengagementEpisodeOnWinbackReply(args: {
  admin: AdminClient;
  userId: string;
  intent: WinbackReplyIntent;
  nowIso: string;
  requestId: string;
}): Promise<void> {
  try {
    const episode = await fetchOpenEpisode(args.admin, args.userId);
    if (!episode) return;
    const { error } = await args.admin
      .from("reengagement_episodes")
      .update({
        first_reply_at: episode.first_reply_at ?? args.nowIso,
        replied_at_step: clampStep(episode.last_touch_step),
        entry_kind: "replied_to_template",
        exit_status: winbackReplyExitStatus(args.intent),
        closed_at: args.nowIso,
        updated_at: args.nowIso,
      })
      .eq("id", episode.id)
      .is("closed_at", null);
    if (error) throw error;
  } catch (error) {
    console.warn(
      `[reengagement] request_id=${args.requestId} episode_close_on_reply_failed user_id=${args.userId}`,
      error,
    );
  }
}

/**
 * Clôture par le flow winback_reengagement_v1 (run.ts) : le flow connaît
 * l'issue précise (reengaged/paused/stopped/safety) et la solution proposée.
 * Best-effort : un échec laisse l'épisode ouvert (le sweep le rattrapera en
 * abandoned_mid_flow) et ne bloque jamais le tour.
 */
export async function closeReengagementEpisodeFromFlow(args: {
  admin: AdminClient;
  userId: string;
  episodeId: string;
  exitStatus: "reengaged" | "paused" | "stopped" | "safety";
  solutionOffered: string | null;
  redirectTarget: string | null;
  nowIso: string;
  requestId: string;
}): Promise<boolean> {
  try {
    if (!args.episodeId) return false;
    const { data, error } = await args.admin
      .from("reengagement_episodes")
      .update({
        exit_status: args.exitStatus,
        solution_offered: args.solutionOffered,
        redirect_target: args.redirectTarget,
        // Un épisode clos en crise ne part JAMAIS à l'extraction LLM : le
        // transcript de crise ne doit être ni analysé ni ré-servi en
        // grounding d'un décrochage futur (doctrine zéro-effet-durable en
        // crise, chantiers P3/P5).
        ...(args.exitStatus === "safety"
          ? { extraction_status: "nothing_to_extract" }
          : {}),
        closed_at: args.nowIso,
        updated_at: args.nowIso,
      })
      .eq("id", args.episodeId)
      .eq("user_id", args.userId)
      .is("closed_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean((data as { id?: unknown } | null)?.id);
  } catch (error) {
    console.warn(
      `[reengagement] request_id=${args.requestId} episode_close_from_flow_failed user_id=${args.userId} episode_id=${args.episodeId}`,
      error,
    );
    return false;
  }
}

/**
 * Backstop safety fin de tour : ferme l'épisode de réengagement ouvert d'un
 * utilisateur (par user_id — le chemin de préemption safety ne consulte pas
 * le flow, donc on ne dispose pas de l'episode_id). Idempotent, best-effort,
 * ne bloque jamais la réponse de crise. Le désarmement du state
 * conversationnel est fait séparément (en mémoire) par l'appelant.
 */
export async function closeOpenReengagementEpisodeForSafety(args: {
  admin: AdminClient;
  userId: string;
  nowIso: string;
  requestId: string;
}): Promise<boolean> {
  try {
    const episode = await fetchOpenEpisode(args.admin, args.userId);
    if (!episode) return false;
    const { error } = await args.admin
      .from("reengagement_episodes")
      .update({
        exit_status: "safety",
        extraction_status: "nothing_to_extract",
        closed_at: args.nowIso,
        updated_at: args.nowIso,
      })
      .eq("id", episode.id)
      .is("closed_at", null);
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn(
      `[reengagement] request_id=${args.requestId} episode_close_for_safety_failed user_id=${args.userId}`,
      error,
    );
    return false;
  }
}

/**
 * Clôture générique (sweep). Les champs d'entrée (entry_kind,
 * replied_at_step, first_reply_at) ne sont patchés que s'ils sont fournis :
 * une clôture abandoned_mid_flow ne doit pas écraser ce que l'entrée en
 * conversation a déjà posé. Lève en cas d'erreur : le runner du sweep loggue.
 */
export async function closeReengagementEpisode(args: {
  admin: AdminClient;
  episodeId: string;
  decision: Extract<ReengagementEpisodeSweepDecision, { action: "close" }>;
  nowIso: string;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    exit_status: args.decision.exit_status,
    extraction_status: args.decision.extraction_status,
    closed_at: args.nowIso,
    updated_at: args.nowIso,
  };
  if (args.decision.entry_kind !== null) {
    patch.entry_kind = args.decision.entry_kind;
  }
  if (args.decision.replied_at_step !== null) {
    patch.replied_at_step = args.decision.replied_at_step;
  }
  if (args.decision.first_reply_at !== null) {
    patch.first_reply_at = args.decision.first_reply_at;
  }
  const { error } = await args.admin
    .from("reengagement_episodes")
    .update(patch)
    .eq("id", args.episodeId)
    .is("closed_at", null);
  if (error) throw error;
}
