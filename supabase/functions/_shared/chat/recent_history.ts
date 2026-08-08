/**
 * FF-023 — L'HISTORIQUE RÉCENT DU FIL, DONNÉ AU TOUR EN COURS.
 *
 * ── LE TROU QUE CE MODULE BOUCHE ─────────────────────────────────────────────
 * `chat-inbound-v1` — la SEULE porte de production de la conversation in-app —
 * appelait `processMessage(…, history: [])`. Conséquence mesurée en run réel le
 * 2026-08-08 : les blocs « RECENT VISIBLE HISTORY » (companion) et
 * « HISTORIQUE RÉCENT » (context loader) étaient TOUJOURS vides, et le tour 2
 * d'une conversation n'avait aucun référent. Sur « and so, what do you think
 * about it ? » juste après un tour sur le déménagement d'un frère, la réponse
 * réelle était :
 *
 *   « About the lunch setup: it's clean and simple — protein first… »
 *
 * — c'est-à-dire une CONFABULATION sur un sujet jamais abordé. C'est le défaut
 * « pas humain » n°1 de la fiche FF-023, et il ne se répare qu'au CHARGEMENT :
 * aucune consigne de prompt (« souviens-toi de la conversation ») ne donne à un
 * modèle une donnée qu'on ne lui a pas passée — elle transforme seulement
 * l'aveu en invention.
 *
 * ── CE QUE CE MODULE GARANTIT ────────────────────────────────────────────────
 *   1. BORNÉ. `RECENT_HISTORY_MESSAGE_LIMIT` messages au plus, chacun tronqué à
 *      `RECENT_HISTORY_CONTENT_MAX_CHARS`. Un historique sans borne pousse la
 *      doctrine hors du budget de prompt (troncature par la queue) — le
 *      rabbit hole §9 de la fiche.
 *   2. FRAIS. `filterFreshMessages` (12 h + plancher « dernier tour »): après
 *      trois jours d'absence, « les derniers messages » datent d'un autre
 *      contexte. Le plancher garde toujours le dernier échange, pour qu'une
 *      réponse tardive à un bilan ne perde pas la question posée.
 *   3. LE TOUR EN COURS EN EST EXCLU. `chat-inbound-v1` journalise le message
 *      entrant AVANT d'exécuter le moteur (garde 4) : sans exclusion, le
 *      message courant apparaîtrait DEUX fois au modèle (une fois comme
 *      historique, une fois comme message du tour), ce qui fabrique une fausse
 *      répétition — et le companion a un détecteur de répétition
 *      conversationnelle qui s'y serait accroché.
 *   4. FAIL-OPEN, ET BRUYANT. Une lecture en panne rend `[]` avec son motif :
 *      le tour continue sans historique (§7 de la fiche), et le motif est
 *      journalisé. Faire échouer la réception d'un message parce que son
 *      contexte n'a pas pu être lu serait strictement pire.
 *
 * ── CE QU'IL N'EST PAS ───────────────────────────────────────────────────────
 * Ce n'est pas de la mémoire. La mémoire longue (memorizer, topics) et les
 * préférences vivent ailleurs et ont leur propre cycle de vie. Ceci est la
 * fenêtre COURTE — ce qui vient d'être dit, y compris les échanges photo, dont
 * les lignes `chat_messages` sont écrites par `meal-photo-upload-v1` et sont
 * déjà conformes (rôle `user` pour la bulle image, rôle `assistant` pour
 * l'accusé).
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { filterFreshMessages } from "../message_freshness.ts";

/**
 * Combien de messages au plus entrent dans le tour.
 *
 * 20, comme les deux autres appelants de `processMessage` qui chargeaient déjà
 * un historique (`sophia-brain/index.ts`, `test-send-message/index.ts`) : une
 * borne différente par porte d'entrée aurait fait diverger le comportement
 * observé en QA de celui du produit. Les consommateurs recoupent ensuite selon
 * leur profil (companion 15, dispatcher 8, bloc visible du companion 6) — cette
 * borne-ci est le PLAFOND, pas la fenêtre.
 */
export const RECENT_HISTORY_MESSAGE_LIMIT = 20;

/** Troncature PAR MESSAGE. Un pavé de 4 000 caractères ne mange pas le budget. */
export const RECENT_HISTORY_CONTENT_MAX_CHARS = 1200;

/**
 * On lit un peu plus large que la borne: le tour courant est déjà journalisé et
 * sera retiré, et une ligne au rôle inattendu (`system`…) est jetée au filtre.
 * Sans cette marge, exclure le message courant rendrait 19 messages là où 20
 * sont disponibles.
 */
const FETCH_LIMIT = RECENT_HISTORY_MESSAGE_LIMIT + 5;

export type RecentHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string | null;
};

export type RecentHistoryDiagnostics = {
  /** Lignes rendues par la base. */
  rows_read: number;
  /** Lignes écartées parce qu'elles SONT le tour en cours. */
  excluded_current: number;
  /** Messages coupés par la fenêtre de fraîcheur. */
  stale_dropped: number;
  /** Messages finalement passés au moteur. */
  kept: number;
  /** Motif de panne de lecture, ou `null`. */
  error: string | null;
};

export type RecentHistoryResult = {
  messages: RecentHistoryMessage[];
  diagnostics: RecentHistoryDiagnostics;
};

type RawRow = {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  created_at?: unknown;
  metadata?: unknown;
};

function clientMessageIdOf(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const raw = (metadata as Record<string, unknown>).client_message_id;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Lignes brutes → messages, dans l'ordre chronologique (anciens d'abord).
 *
 * L'EXCLUSION EST DOUBLE, et les deux moitiés servent. `logInboundMessage`
 * rend l'`id` de la ligne écrite, mais il rend `null` quand l'insertion n'a
 * pas pu relire sa ligne — auquel cas le `client_message_id` (unique par
 * message entrant, c'est la clé d'idempotence) est le seul repère restant.
 */
export function sanitizeRecentHistoryRows(
  rows: unknown,
  opts?: {
    excludeMessageId?: string | null;
    excludeClientMessageId?: string | null;
  },
): { messages: RecentHistoryMessage[]; excludedCurrent: number } {
  if (!Array.isArray(rows)) return { messages: [], excludedCurrent: 0 };
  const excludeId = String(opts?.excludeMessageId ?? "").trim();
  const excludeClientId = String(opts?.excludeClientMessageId ?? "").trim();
  let excludedCurrent = 0;

  const messages: RecentHistoryMessage[] = [];
  for (const raw of rows as RawRow[]) {
    if (!raw || typeof raw !== "object") continue;
    const role = String(raw.role ?? "");
    if (role !== "user" && role !== "assistant") continue;

    const rowId = String(raw.id ?? "").trim();
    if (excludeId && rowId && rowId === excludeId) {
      excludedCurrent++;
      continue;
    }
    if (
      excludeClientId && role === "user" &&
      clientMessageIdOf(raw.metadata) === excludeClientId
    ) {
      excludedCurrent++;
      continue;
    }

    const content = String(raw.content ?? "").trim();
    if (!content) continue;
    messages.push({
      role,
      content: content.slice(0, RECENT_HISTORY_CONTENT_MAX_CHARS),
      created_at: typeof raw.created_at === "string" ? raw.created_at : null,
    });
  }
  return { messages, excludedCurrent };
}

/**
 * Borne + fraîcheur, dans cet ordre.
 *
 * La borne d'abord (les 20 plus récents), la fraîcheur ensuite: l'inverse
 * ferait décider le plancher « dernier tour » sur une fenêtre qui n'est pas
 * celle qu'on sert.
 */
export function boundRecentHistory(
  messages: RecentHistoryMessage[],
  opts?: { nowIso?: string | null; limit?: number },
): { messages: RecentHistoryMessage[]; staleDropped: number } {
  const limit = Math.max(0, Math.floor(opts?.limit ?? RECENT_HISTORY_MESSAGE_LIMIT));
  const bounded = messages.slice(-limit);
  const nowMs = Date.parse(String(opts?.nowIso ?? ""));
  const fresh = filterFreshMessages(bounded, {
    nowMs: Number.isFinite(nowMs) ? nowMs : undefined,
  });
  return { messages: fresh, staleDropped: bounded.length - fresh.length };
}

/**
 * L'historique récent du fil d'un élève, prêt à entrer dans `processMessage`.
 *
 * Ne throw JAMAIS: une panne de lecture rend `[]` et son motif.
 */
export async function loadRecentChatHistory(
  admin: SupabaseClient,
  args: {
    userId: string;
    scope: string;
    /** Ancre de la fenêtre de fraîcheur — l'horloge du message entrant. */
    nowIso?: string | null;
    excludeMessageId?: string | null;
    excludeClientMessageId?: string | null;
    limit?: number;
  },
): Promise<RecentHistoryResult> {
  const empty = (error: string | null, rowsRead = 0): RecentHistoryResult => ({
    messages: [],
    diagnostics: {
      rows_read: rowsRead,
      excluded_current: 0,
      stale_dropped: 0,
      kept: 0,
      error,
    },
  });

  try {
    const { data, error } = await admin
      .from("chat_messages")
      .select("id,role,content,created_at,metadata")
      .eq("user_id", args.userId)
      .eq("scope", args.scope)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      // ── LE DÉPARTAGE DES ÉGALITÉS, ET POURQUOI IL EXISTE ──────────────────
      // MESURÉ: deux messages envoyés en parallèle par le même élève reçoivent
      // le MÊME `created_at` à la milliseconde (`parseInboundMessage` prend
      // l'horloge à l'entrée de la requête), et le fil rendu inversait alors
      // les deux — différemment d'une requête à l'autre.
      //
      // `id` est un uuid ALÉATOIRE: il ne restitue PAS l'ordre d'insertion, et
      // ce tri secondaire ne prétend pas le faire. Il rend l'ordre STABLE, ce
      // qui est la propriété qui compte ici: un fil qui se réordonne tout seul
      // entre deux tours fait dire au modèle deux choses différentes du même
      // passé (même famille que la cicatrice `date-anchoring-instability`).
      .order("id", { ascending: false })
      .limit(FETCH_LIMIT);
    // LIRE `error`, PAS SEULEMENT ATTRAPER: le client PostgREST ne throw pas
    // sur une lecture refusée, il rend `{ error }`. Un `catch` seul aurait
    // rendu un historique vide en silence — exactement le défaut d'origine.
    if (error) return empty(String(error.message ?? error));

    const rows = (data ?? []) as RawRow[];
    const chronological = rows.slice().reverse();
    const { messages, excludedCurrent } = sanitizeRecentHistoryRows(
      chronological,
      {
        excludeMessageId: args.excludeMessageId,
        excludeClientMessageId: args.excludeClientMessageId,
      },
    );
    const { messages: fresh, staleDropped } = boundRecentHistory(messages, {
      nowIso: args.nowIso,
      limit: args.limit,
    });
    return {
      messages: fresh,
      diagnostics: {
        rows_read: rows.length,
        excluded_current: excludedCurrent,
        stale_dropped: staleDropped,
        kept: fresh.length,
        error: null,
      },
    };
  } catch (error) {
    return empty(error instanceof Error ? error.message : String(error));
  }
}
