// KEEL — le message de cohorte du coach: décisions pures d'un côté, appels de
// l'autre. Même partage que `coachSeat.ts` et `freeSignup.ts`.
//
// LA DÉCISION QUI MÉRITE UN TEST tient en une fonction — `broadcastGate`. Elle
// répond à « ce coach peut-il écrire maintenant, et sinon pourquoi ». Trois
// entrées indépendantes s'y combinent (a-t-il des élèves, a-t-il déjà écrit
// cette semaine, le brouillon est-il valide), et un écran qui recalculerait ça
// à la main afficherait tôt ou tard un bouton actif sur un envoi que la base
// refuse — c'est-à-dire un coach qui clique et ne comprend pas.

import { formatDateLong } from "../i18n/format";
import { supabase } from "../../lib/supabase";

/** ⚠️ COPIE DE CONFORT. L'autorité est la CHECK `coach_broadcasts_body_length`
 *  (migration 20260806180500). Sert au compteur de caractères de l'écran. */
export const BROADCAST_MAX_CHARS = 1000;

export interface BroadcastLast {
  id: string;
  body: string;
  created_at: string;
  finished_at: string | null;
  delivered_count: number;
  skipped_count: number;
}

export interface BroadcastState {
  recipients: number;
  canSendNow: boolean;
  nextWindowOpensAt: string | null;
  last: BroadcastLast | null;
}

/** Pourquoi le bouton est fermé — ou `null` quand il est ouvert. */
export type BroadcastBlock =
  | "no_recipients"
  | "already_sent_this_week"
  | "empty_body"
  | "body_too_long";

/**
 * PURE. L'ordre des refus est le contrat, et il va du plus structurel au plus
 * corrigeable: un coach sans élève n'a pas à découvrir que son texte est trop
 * long. Il apprend d'abord ce qu'il ne peut pas changer en réécrivant.
 */
export function broadcastGate(
  state: BroadcastState | null,
  draft: string,
): BroadcastBlock | null {
  if (!state || state.recipients <= 0) return "no_recipients";
  if (!state.canSendNow) return "already_sent_this_week";
  const body = draft.trim();
  if (body.length === 0) return "empty_body";
  if (body.length > BROADCAST_MAX_CHARS) return "body_too_long";
  return null;
}

/**
 * La date à laquelle la fenêtre se rouvre, formatée. `null` quand il n'y a rien
 * à annoncer — on n'affiche pas « prochaine fenêtre: — » à un coach qui peut
 * écrire maintenant.
 */
export function formatNextWindow(value: string | null): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return formatDateLong(at);
}

function parseState(raw: unknown): BroadcastState | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return null;
  const last = (row.last ?? null) as Record<string, unknown> | null;
  return {
    recipients: Number(row.recipients ?? 0) || 0,
    canSendNow: row.can_send_now === true,
    nextWindowOpensAt: typeof row.next_window_opens_at === "string"
      ? row.next_window_opens_at
      : null,
    last: last
      ? {
        id: String(last.id ?? ""),
        body: String(last.body ?? ""),
        created_at: String(last.created_at ?? ""),
        finished_at: typeof last.finished_at === "string" ? last.finished_at : null,
        delivered_count: Number(last.delivered_count ?? 0) || 0,
        skipped_count: Number(last.skipped_count ?? 0) || 0,
      }
      : null,
  };
}

export async function loadBroadcastState(): Promise<BroadcastState | null> {
  const { data, error } = await supabase.rpc("keel_coach_broadcast_state");
  if (error) throw new Error(error.message);
  return parseState(data);
}

export interface SendBroadcastResult {
  ok: boolean;
  reason: string;
  recipients?: number;
}

export async function sendBroadcast(
  body: string,
  contentLocale = "en-US",
): Promise<SendBroadcastResult> {
  const { data, error } = await supabase.rpc("keel_coach_send_broadcast", {
    p_body: body,
    p_content_locale: contentLocale,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    reason: String(row.reason ?? "unknown"),
    recipients: Number(row.recipients ?? 0) || undefined,
  };
}
