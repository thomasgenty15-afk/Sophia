/**
 * PIVOT NUTRITION — N2 : la coquille d'I/O du tap du soir.
 *
 * `daily_pulse.ts` DÉCIDE (pur, testé). Ce module LIT l'état du jour et ÉCRIT
 * la réponse.
 *
 * ── L'IDEMPOTENCE EST DANS LA BASE, PAS DANS LE CODE ─────────────────────
 * `student_daily_checkins` porte `unique (user_id, local_date)`. L'écriture
 * est donc un UPSERT sur cette clé : un double-tap, une re-livraison WhatsApp
 * ou un webhook rejoué mettent à jour la ligne du jour au lieu d'en créer une
 * seconde. On ne compte jamais deux fois la même journée.
 *
 * ── POURQUOI L'AXE S'ÉCRIT EN DEUXIÈME TEMPS ─────────────────────────────
 * Le niveau arrive au premier tap, l'axe (s'il y en a un) au second. La ligne
 * est donc écrite une première fois SANS axe, puis complétée. C'est voulu : si
 * l'élève ne répond jamais à la seconde question, on garde quand même son
 * niveau — perdre la journée entière parce qu'une question de suivi est restée
 * sans réponse serait absurde.
 */

import {
  needsAxisFollowUp,
  type PulseAxis,
  type PulseLevel,
} from "./daily_pulse.ts";
import { localDateFor } from "./reengagement_io.ts";

/** Le purpose des messages sortants qui PORTENT la question du soir. */
export const PULSE_QUESTION_PURPOSE = "keel_daily_pulse";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface PulseDayState {
  answeredToday: boolean;
  level: PulseLevel | null;
  axis: PulseAxis | null;
  /** Une réponse de niveau non-`good` sans axe: la question de suivi est en attente. */
  awaitingAxis: boolean;
}

export async function loadPulseDay(
  db: Db,
  args: { userId: string; localDate: string },
): Promise<PulseDayState> {
  const { data, error } = await db
    .from("student_daily_checkins")
    .select("overall, axis")
    .eq("user_id", args.userId)
    .eq("local_date", args.localDate)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row) {
    return { answeredToday: false, level: null, axis: null, awaitingAxis: false };
  }
  const level = String(row.overall ?? "") as PulseLevel;
  const axis = row.axis ? (String(row.axis) as PulseAxis) : null;
  return {
    answeredToday: true,
    level,
    axis,
    awaitingAxis: needsAxisFollowUp(level) && axis === null,
  };
}

/**
 * La question est-elle DÉJÀ PARTIE dans le jour local de l'élève ?
 *
 * ── POURQUOI ON INTERROGE LES SORTANTS ET PAS LES RÉPONSES ───────────────
 * La fenêtre du soir fait deux heures et le cron est horaire: il y a deux
 * ticks dedans. `already_answered_today` ne bouge que si l'élève RÉPOND —
 * l'élève silencieux recevait donc la même question à 20h10 puis à 21h10, et
 * c'est précisément celui qu'on ne veut pas relancer. La seule trace de « on
 * a demandé » quand personne ne répond, c'est le message sorti.
 *
 * ── POURQUOI AUCUN FILTRE SUR `status` ───────────────────────────────────
 * Un envoi `failed` reste une question POSÉE: la ligne existe, le worker de
 * retry la reprendra, et re-demander en parallèle produirait exactement le
 * doublon qu'on interdit. Perdre le tap d'un soir sur un échec dur est le
 * moindre mal, et l'échec est visible dans `failures[]` et dans la table. Les
 * refus de préflight (fenêtre 24h fermée, cap) n'écrivent AUCUNE ligne: ils ne
 * bloquent donc rien, ce qui est le comportement voulu.
 *
 * Fenêtre de lecture de 36h: elle couvre le jour local le plus décalé (UTC±14)
 * sans jamais scanner l'historique complet.
 */
export async function wasPulseAskedToday(
  db: Db,
  args: { userId: string; localDate: string; timezone: string | null; now: Date },
): Promise<boolean> {
  const since = new Date(args.now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("whatsapp_outbound_messages")
    .select("created_at")
    .eq("user_id", args.userId)
    .eq("metadata->>purpose", PULSE_QUESTION_PURPOSE)
    .gte("created_at", since);
  if (error) throw error;
  // Le rattachement au jour se fait ICI, dans le fuseau de l'élève, avec la
  // MÊME fonction que celle qui a calculé `localDate`. Un filtre SQL sur des
  // bornes UTC calculées à la main serait une deuxième implémentation du
  // découpage des jours, et c'est ce genre de doublon qui a produit le défaut.
  return ((data ?? []) as Array<Record<string, unknown>>).some((row) =>
    localDateFor(new Date(String(row.created_at)), args.timezone) === args.localDate
  );
}

export interface PulseWriteResult {
  written: boolean;
  /** Faut-il enchaîner sur la question d'axe ? */
  needsAxis: boolean;
  reason_code: string;
}

/** Écrit le NIVEAU (premier tap). WRITE-THROUGH: insert/upsert puis relecture. */
export async function writePulseLevel(
  db: Db,
  args: {
    userId: string;
    localDate: string;
    level: PulseLevel;
    source?: "whatsapp_button" | "app" | "chat";
  },
): Promise<PulseWriteResult> {
  try {
    const { data, error } = await db
      .from("student_daily_checkins")
      .upsert({
        user_id: args.userId,
        local_date: args.localDate,
        overall: args.level,
        // Un changement d'avis remet l'axe à zéro: garder l'axe d'un « dur »
        // sur une journée repassée à « ça roule » violerait le CHECK de
        // cohérence, et serait de toute façon faux.
        axis: null,
        source: args.source ?? "whatsapp_button",
      }, { onConflict: "user_id,local_date" })
      .select("id, overall")
      .single();
    if (error) throw error;
    const ok = Boolean((data as Record<string, unknown> | null)?.id);
    return {
      written: ok,
      needsAxis: ok && needsAxisFollowUp(args.level),
      reason_code: ok ? "written" : "missing_readback_row",
    };
  } catch (error) {
    console.error("[keel/pulse] level write failed", error);
    return { written: false, needsAxis: false, reason_code: "write_failed" };
  }
}

/**
 * Complète la ligne du jour avec l'AXE (second tap).
 *
 * Ne crée jamais la ligne: un axe sans niveau serait incohérent (et refusé par
 * le CHECK). Si la ligne n'existe pas, c'est que la question d'axe est arrivée
 * sans son niveau — un défaut à voir, pas à rattraper en inventant un niveau.
 */
export async function writePulseAxis(
  db: Db,
  args: { userId: string; localDate: string; axis: PulseAxis },
): Promise<{ written: boolean; reason_code: string }> {
  try {
    const { data, error } = await db
      .from("student_daily_checkins")
      .update({ axis: args.axis })
      .eq("user_id", args.userId)
      .eq("local_date", args.localDate)
      .neq("overall", "good")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    const ok = Boolean((data as Record<string, unknown> | null)?.id);
    return {
      written: ok,
      reason_code: ok ? "written" : "no_pending_level_for_today",
    };
  } catch (error) {
    console.error("[keel/pulse] axis write failed", error);
    return { written: false, reason_code: "write_failed" };
  }
}
