/**
 * FF-056 — LA COUCHE I/O DE L'ÉPISODE DE DIVERGENCE.
 *
 * Table: `20260811120000_weight_divergence_episodes.sql`
 *
 * Même partage que partout dans `_shared/keel/`: tout ce qui peut être FAUX
 * (SQL, dates, courses) vit ici; tout ce qui DÉCIDE vit dans
 * `weight_divergence.ts` (le constat) et dans le reducer du skill (le tour).
 *
 * ⚠️ CHAQUE LECTURE FILTRE SUR `user_id`, EXPLICITEMENT. Le runtime lit en
 * `service_role`, que RLS ne contraint pas: la policy de la table n'est PAS un
 * substitut au `.eq()` — cicatrice `rls-is-not-a-substitute-for-eq-user-id`,
 * payée par la ligne d'un élève rendue à son coach.
 *
 * ⚠️ L'ÉCRITURE EST RELUE. `.select()` n'est pas décoratif: sans lui PostgREST
 * rend 201 sans corps, et l'appelant journalise « écrit » sur une écriture
 * qu'il n'a pas vue atterrir. C'est l'accusé fantôme, le défaut le plus cher de
 * ce dépôt.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import type { WeightDivergenceShape, WeightGoalDirection } from "./weight_divergence.ts";

export const WEIGHT_DIVERGENCE_TABLE = "student_weight_divergence_episodes";

export const WEIGHT_DIVERGENCE_EPISODE_STATES = [
  "proposed",
  "in_flow",
  "acted",
  "nothing_to_change",
  "declined",
  "expired",
] as const;
export type WeightDivergenceEpisodeState =
  (typeof WEIGHT_DIVERGENCE_EPISODE_STATES)[number];

/** Les états qui occupent la place: un seul à la fois, garanti par l'index. */
export const LIVE_EPISODE_STATES: readonly WeightDivergenceEpisodeState[] =
  Object.freeze(["proposed", "in_flow"]);

export interface WeightDivergenceEpisodeRow {
  id: string;
  user_id: string;
  state: WeightDivergenceEpisodeState;
  category: string | null;
  detector_version: string;
  shape: WeightDivergenceShape;
  goal_direction: WeightGoalDirection;
  plan_fingerprint: string;
  opened_local_date: string;
  opened_at: string;
  last_turn_at: string | null;
  closed_at: string | null;
  turn_count: number;
  observation_opened_on: string | null;
  observation_ends_on: string | null;
  opening_chat_message_id: string | null;
  content_locale: string | null;
}

const COLUMNS =
  "id, user_id, state, category, detector_version, shape, goal_direction, " +
  "plan_fingerprint, opened_local_date, opened_at, last_turn_at, closed_at, " +
  "turn_count, observation_opened_on, observation_ends_on, " +
  "opening_chat_message_id, content_locale";

function fail(message: string): never {
  throw new Error(`[keel/weight_divergence_io] ${message}`);
}

// ---------------------------------------------------------------------------
// LES LECTURES
// ---------------------------------------------------------------------------

/** L'épisode vivant, s'il y en a un. Il ne peut y en avoir qu'un (index unique). */
export async function loadLiveEpisode(
  db: SupabaseClient,
  userId: string,
): Promise<WeightDivergenceEpisodeRow | null> {
  const { data, error } = await db
    .from(WEIGHT_DIVERGENCE_TABLE)
    .select(COLUMNS)
    .eq("user_id", userId)
    .in("state", [...LIVE_EPISODE_STATES])
    .order("opened_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as WeightDivergenceEpisodeRow[];
  return rows.length > 0 ? rows[0] : null;
}

export interface EpisodeHistory {
  /** Le dernier épisode, vivant ou non. */
  last: WeightDivergenceEpisodeRow | null;
  /** Le dernier épisode CLOS PAR UN REFUS — celui qui double le cooldown. */
  lastDeclined: WeightDivergenceEpisodeRow | null;
}

/**
 * L'HISTOIRE QUI GOUVERNE LE COOLDOWN.
 *
 * On lit les deux séparément et pas « le dernier, et on regarde son état »:
 * un refus suivi d'un épisode expiré doit continuer à compter DOUBLE. Sinon un
 * refus se ferait effacer par une question qu'on aurait posée trop tôt — ce qui
 * est exactement le mécanisme par lequel un « non » cesse d'être respecté.
 */
export async function loadEpisodeHistory(
  db: SupabaseClient,
  userId: string,
): Promise<EpisodeHistory> {
  const [all, declined] = await Promise.all([
    db.from(WEIGHT_DIVERGENCE_TABLE).select(COLUMNS).eq("user_id", userId)
      .order("opened_local_date", { ascending: false }).limit(1),
    db.from(WEIGHT_DIVERGENCE_TABLE).select(COLUMNS).eq("user_id", userId)
      .eq("state", "declined")
      .order("opened_local_date", { ascending: false }).limit(1),
  ]);
  if (all.error) throw all.error;
  if (declined.error) throw declined.error;
  const first = <T>(rows: unknown): T | null => {
    const list = (rows ?? []) as T[];
    return list.length > 0 ? list[0] : null;
  };
  return {
    last: first<WeightDivergenceEpisodeRow>(all.data),
    lastDeclined: first<WeightDivergenceEpisodeRow>(declined.data),
  };
}

// ---------------------------------------------------------------------------
// LES ÉCRITURES
// ---------------------------------------------------------------------------

export type OpenEpisodeResult =
  | { outcome: "opened"; row: WeightDivergenceEpisodeRow }
  /**
   * Une autre instance du job a gagné la course. Ce n'est PAS une panne: c'est
   * l'index unique qui arbitre, exactement comme FF-028. L'appelant se tait.
   */
  | { outcome: "already_live" };

export async function openEpisode(
  db: SupabaseClient,
  args: {
    userId: string;
    localDate: string;
    detectorVersion: string;
    shape: WeightDivergenceShape;
    goalDirection: WeightGoalDirection;
    planFingerprint: string;
    contentLocale: string | null;
  },
): Promise<OpenEpisodeResult> {
  const { data, error } = await db
    .from(WEIGHT_DIVERGENCE_TABLE)
    .insert({
      user_id: args.userId,
      state: "proposed",
      detector_version: args.detectorVersion,
      shape: args.shape,
      goal_direction: args.goalDirection,
      plan_fingerprint: args.planFingerprint,
      opened_local_date: args.localDate,
      content_locale: args.contentLocale,
    } as never)
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return { outcome: "already_live" };
    throw error;
  }
  if (!data) fail("openEpisode: insert sans ligne relue");
  return {
    outcome: "opened",
    row: data as unknown as WeightDivergenceEpisodeRow,
  };
}

/** Rattache le message d'ouverture. Best-effort NOMMÉ: l'épisode existe déjà. */
export async function attachOpeningMessage(
  db: SupabaseClient,
  args: { id: string; chatMessageId: string | null },
): Promise<void> {
  if (!args.chatMessageId) return;
  const { error } = await db
    .from(WEIGHT_DIVERGENCE_TABLE)
    .update({ opening_chat_message_id: args.chatMessageId } as never)
    .eq("id", args.id);
  if (error) {
    console.warn(JSON.stringify({
      tag: "weight_divergence_attach_message_failed",
      episode_id: args.id,
      error: error.message,
    }));
  }
}

export interface AdvanceEpisodeArgs {
  id: string;
  /** Toujours passé: le filtre appartient à l'appelant, pas à RLS. */
  userId: string;
  state: WeightDivergenceEpisodeState;
  category: string | null;
  turnCount: number;
  observationOpenedOn?: string | null;
  observationEndsOn?: string | null;
}

/**
 * Fait avancer l'épisode. RELU: `updated` compte les lignes REVUES.
 *
 * ⚠️ UN UPDATE À ZÉRO LIGNE REND 204 SANS ERREUR. Sans la relecture, un épisode
 * qu'on croit clos resterait vivant et bloquerait tous les suivants par l'index
 * unique — en silence, et pour toujours.
 */
export async function advanceEpisode(
  db: SupabaseClient,
  args: AdvanceEpisodeArgs,
): Promise<{ updated: number }> {
  const closing = !(LIVE_EPISODE_STATES as readonly string[]).includes(args.state);
  const patch: Record<string, unknown> = {
    state: args.state,
    category: args.category,
    turn_count: args.turnCount,
    last_turn_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // Le CHECK `weight_divergence_closed_at_matches_state` refuse l'incohérence
    // en base; on la rend impossible ici plutôt que de la rattraper.
    closed_at: closing ? new Date().toISOString() : null,
  };
  if (args.observationOpenedOn !== undefined) {
    patch.observation_opened_on = args.observationOpenedOn;
  }
  if (args.observationEndsOn !== undefined) {
    patch.observation_ends_on = args.observationEndsOn;
  }
  const { data, error } = await db
    .from(WEIGHT_DIVERGENCE_TABLE)
    .update(patch as never)
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .select("id");
  if (error) throw error;
  return { updated: ((data ?? []) as unknown[]).length };
}

/**
 * Fait expirer les questions restées sans réponse.
 *
 * « La personne ignore la question ⇒ expiration silencieuse, cooldown normal,
 * aucune relance » (§7). Le mot qui compte est SILENCIEUSE: cette fonction
 * n'envoie rien, ne marque rien à dire au tour suivant, et ne laisse aucune
 * trace dans le contexte de conversation.
 */
export async function expireLapsedEpisodes(
  db: SupabaseClient,
  args: { userId: string; todayLocalDate: string; openForDays: number },
): Promise<{ expired: number }> {
  const cutoff = shiftDate(args.todayLocalDate, -args.openForDays);
  const { data, error } = await db
    .from(WEIGHT_DIVERGENCE_TABLE)
    .update({
      state: "expired",
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("user_id", args.userId)
    .in("state", [...LIVE_EPISODE_STATES])
    .lt("opened_local_date", cutoff)
    .select("id");
  if (error) throw error;
  return { expired: ((data ?? []) as unknown[]).length };
}

/** `YYYY-MM-DD` + n jours, sans dépendre d'un fuseau (ancré à midi UTC). */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) fail(`date illisible: ${JSON.stringify(date)}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Écart en jours entiers entre deux dates locales. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    fail(`dates illisibles: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  }
  return Math.round((b - a) / 86_400_000);
}
