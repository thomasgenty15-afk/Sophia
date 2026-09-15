/**
 * FF-029 — LA LECTURE QUI ALIMENTE L'ADHÉRENCE. Aucune décision ici.
 *
 * `daily_practice_adherence.ts` DÉCIDE (pur, testé). Ce module LIT, et il lit
 * deux choses qui existent déjà:
 *
 *   1. LE LEDGER (`outbound_messages`) — les soirs où une QUESTION de pratique
 *      est partie, et laquelle. C'est un fait écrit au moment de l'envoi, pas
 *      un score: la ligne existe parce que le message est parti.
 *   2. LES MESSAGES DE L'ÉLÈVE (`chat_messages`, `role='user'`) — a-t-il écrit
 *      quelque chose après.
 *
 * ── POURQUOI LE LEDGER ET PAS LA BULLE ─────────────────────────────────────
 * `deliverChatMessage` écrit la métadonnée à DEUX endroits, et les deux n'ont
 * pas les mêmes lecteurs. `chat_messages.metadata` est la bulle;
 * `outbound_messages.metadata` est le LEDGER, et c'est lui que lisent déjà
 * `wasPulseSentToday`, `loadAskCadence` et le plafond quotidien. Une cadence
 * lue dans la bulle serait la seconde définition de « on a déjà parlé
 * aujourd'hui » — la cicatrice `chat-metadata-has-two-destinations`, dont le
 * symptôme mesuré était une question du soir partie UNE fois en sept soirs.
 *
 * ── AUCUNE TABLE NEUVE, ET C'EST UNE DÉCISION ──────────────────────────────
 * §5 de FF-029: « l'adhérence fenêtrée est DÉRIVÉE à la lecture, jamais un
 * score stocké ». Une table `practice_answers` porterait un compteur par élève
 * et par pratique — c'est-à-dire, littéralement, `adherence_score`, l'une des
 * quatre surfaces que `PRACTICE_BLOCKING_SURFACES` refuse à une pratique. On
 * refuse de la fabriquer nous-mêmes sous un autre nom.
 */

import {
  PRACTICE_ADHERENCE_WINDOW_DAYS,
  type PracticeAskRecord,
} from "./daily_practice_adherence.ts";
import { addDays } from "./local_date.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

/** Le purpose sous lequel le message du soir part. Une seule chaîne citée. */
const PULSE_PURPOSE = "keel_daily_pulse";

/**
 * LES DEUX CLÉS QUE LE MESSAGE DU SOIR PORTE À PROPOS DE SA PRATIQUE.
 *
 * Elles voyagent dans `metadata` de la livraison, donc dans le ledger ET dans
 * la bulle. Exportées pour que l'écrivain (`keel-daily-pulse-v1`) et le lecteur
 * (ce module) citent LA MÊME constante: deux chaînes recopiées à la main sont
 * la façon dont ce dépôt a déjà perdu `pulse_asked`.
 */
export const PRACTICE_MODE_METADATA_KEY = "keel_practice_mode";
export const PRACTICE_KEY_METADATA_KEY = "keel_practice_key";

/**
 * COMBIEN DE TEMPS UNE RÉPONSE COMPTE ENCORE COMME UNE RÉPONSE.
 *
 * Quatorze heures: un message parti entre 20 h et 22 h locales reste
 * « répondu » si la personne écrit jusqu'au milieu de la matinée suivante.
 * Au-delà, on ne saurait plus distinguer une réponse tardive d'un message
 * spontané — et surtout, la fenêtre doit rester STRICTEMENT sous les 24 h qui
 * séparent deux messages du soir, sinon la réponse d'un soir se ferait compter
 * pour la question du lendemain.
 */
export const PRACTICE_ANSWER_WINDOW_HOURS = 14;

/**
 * Les soirs où une question de pratique est partie, et ce qu'elle a reçu.
 *
 * ── ELLE NE REMONTE JAMAIS ────────────────────────────────────────────────
 * Une lecture en panne rend une liste VIDE, donc « aucune pratique ignorée »,
 * donc la rotation d'avant FF-029 — exactement. La direction d'échec est celle
 * qui laisse le produit se comporter comme s'il ne savait rien, plutôt que
 * celle qui retire une pratique à un élève sur une lecture qu'on n'a pas su
 * faire. C'est le même arbitrage que `loadDayFacts`.
 */
export async function loadPracticeAskRecords(
  db: Db,
  args: { userId: string; todayLocalDate: string },
): Promise<readonly PracticeAskRecord[]> {
  const userId = String(args.userId ?? "").trim();
  const today = String(args.todayLocalDate ?? "").trim();
  if (!userId || !today) return [];

  const windowStart = addDays(today, -PRACTICE_ADHERENCE_WINDOW_DAYS);

  let rows: Array<Record<string, unknown>> = [];
  try {
    const { data, error } = await db
      .from("outbound_messages")
      .select("created_at, metadata")
      .eq("user_id", userId)
      // `sent` seulement: une ligne `skipped` dit qu'on a DÉCIDÉ de ne pas
      // livrer (mute, plafond). Compter son silence reprocherait à l'élève un
      // message qu'il n'a jamais reçu.
      .eq("status", "sent")
      .filter("metadata->>purpose", "eq", PULSE_PURPOSE)
      .filter(`metadata->>${PRACTICE_MODE_METADATA_KEY}`, "eq", "ask")
      .gte("metadata->>local_date", windowStart)
      .order("created_at", { ascending: true });
    if (error) throw error;
    rows = (data ?? []) as Array<Record<string, unknown>>;
  } catch (error) {
    console.warn("[keel/practice_adherence] ledger unreadable", error);
    return [];
  }
  if (rows.length === 0) return [];

  // Les messages de l'élève, en UNE lecture bornée par le plus ancien envoi.
  // Une requête par soir donnerait vingt et un allers-retours par élève et par
  // soir, pour une décision qui n'en vaut pas un.
  const firstSentAt = new Date(String(rows[0].created_at ?? ""));
  if (!Number.isFinite(firstSentAt.getTime())) return [];
  let replies: number[] = [];
  try {
    const { data, error } = await db
      .from("chat_messages")
      .select("created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", firstSentAt.toISOString())
      .order("created_at", { ascending: true });
    if (error) throw error;
    replies = ((data ?? []) as Array<Record<string, unknown>>)
      .map((r) => new Date(String(r.created_at ?? "")).getTime())
      .filter((t) => Number.isFinite(t));
  } catch (error) {
    console.warn("[keel/practice_adherence] student messages unreadable", error);
    return [];
  }

  const windowMs = PRACTICE_ANSWER_WINDOW_HOURS * 3_600_000;
  const out: PracticeAskRecord[] = [];
  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const key = String(metadata[PRACTICE_KEY_METADATA_KEY] ?? "").trim();
    // Une question de pratique sans identité de pratique ne peut être imputée à
    // aucune: on la laisse tomber plutôt que de l'attribuer au hasard.
    if (!key) continue;
    const localDate = String(metadata.local_date ?? "").trim();
    if (!localDate) continue;
    const sentAt = new Date(String(row.created_at ?? "")).getTime();
    if (!Number.isFinite(sentAt)) continue;
    const answered = replies.some((t) => t > sentAt && t <= sentAt + windowMs);
    out.push({ localDate, practiceKey: key, answered });
  }
  return out;
}
