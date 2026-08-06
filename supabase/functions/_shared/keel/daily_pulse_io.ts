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
  type AskCadenceInput,
  needsAxisFollowUp,
  type PulseAxis,
  type PulseLevel,
  PULSE_LEVELS,
} from "./daily_pulse.ts";
import { addDays, daysBetween } from "./local_date.ts";
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
 * LA CLÉ QUI SÉPARE « UN MESSAGE EST PARTI » DE « UNE QUESTION A ÉTÉ POSÉE ».
 *
 * ⚠️ ELLE EST LA CONDITION DE SURVIE DE TOUTE LA CADENCE, et son absence aurait
 * été invisible. Le message du soir porte maintenant un FAIT tous les jours et
 * la question tous les trois — sous le MÊME purpose `keel_daily_pulse`, parce
 * que c'est lui qui est dans `GUARANTEED_PURPOSES` et qu'un purpose neuf serait
 * silencieusement plafonné.
 *
 * Sans ce drapeau, `wasPulseAskedToday` — qui ne regarde que le purpose —
 * rendrait `true` tous les soirs à cause du simple récapitulatif, et
 * `daysSinceLastAsk` vaudrait éternellement 0: **la question ne serait plus
 * JAMAIS posée**, et le job compterait pourtant un envoi par élève et par jour.
 * Un produit qui ne mesure plus rien, avec un compte-rendu vert.
 */
export const PULSE_ASKED_METADATA_KEY = "pulse_asked";

/**
 * Cette ligne de ledger portait-elle une question ?
 *
 * L'ABSENCE DU DRAPEAU VAUT « OUI », et c'est le seul choix qui préserve
 * l'histoire: toutes les lignes antérieures à ce lot étaient des questions —
 * le message du soir n'était que ça. Lire l'absence comme « non » redémarrerait
 * la cadence de zéro pour toute la base au premier tick après déploiement.
 * C'est le même raisonnement que le repli de `metadata.local_date` plus bas.
 */
function rowCarriedAsk(metadata: unknown): boolean {
  const raw = (metadata as Record<string, unknown> | null)?.[PULSE_ASKED_METADATA_KEY];
  if (raw === undefined || raw === null) return true;
  return raw === true || String(raw) === "true";
}

/**
 * Le MESSAGE du soir est-il déjà parti dans le jour local de l'élève ?
 *
 * Renommé depuis `wasPulseAskedToday`: ce qu'il garde à un par jour est le
 * message, pas la question — celle-ci a désormais sa propre cadence
 * (`loadAskCadence`). Le corps de la garde est inchangé.
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
export async function wasPulseSentToday(
  db: Db,
  args: { userId: string; localDate: string; timezone: string | null; now: Date },
): Promise<boolean> {
  // LA JOURNÉE EST LUE SUR LA LIGNE, PAS RECALCULÉE DEPUIS SON HORODATAGE.
  //
  // `writeOutboundRow` écrit déjà `metadata.local_date`, calculée UNE fois par
  // `deliverChatMessage` à partir de l'horloge du tour. Re-dériver le jour
  // depuis `created_at` était donc la SECONDE implémentation du découpage des
  // jours — exactement le doublon que le commentaire d'origine disait vouloir
  // éviter, et il portait le défaut.
  //
  // MESURÉ (QA WEB): la ligne de `chat_messages` est estampillée à l'horloge du
  // job (correctif L0), mais la ligne de ledger l'est par `claim_in_app_outbound`
  // à `now()` — l'horloge RÉELLE. Sur un rejeu à 22h35 réelles avec une horloge
  // simulée à 18h30, les deux tombaient dans deux jours locaux différents:
  // `askedToday` rendait `false` et le cron REDEMANDAIT. Le test
  // « deux ticks, un seul message » l'a attrapé.
  //
  // La fenêtre sur `created_at` reste, élargie à 72 h: c'est un préfiltre
  // d'index, plus une règle de jour. Le jour, c'est `metadata.local_date`.
  const since = new Date(args.now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("outbound_messages")
    .select("created_at, metadata")
    .eq("user_id", args.userId)
    .eq("metadata->>purpose", PULSE_QUESTION_PURPOSE)
    .gte("created_at", since);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).some((row) => {
    const stamped = String(
      (row.metadata as { local_date?: unknown } | null)?.local_date ?? "",
    ).trim();
    // Repli sur l'ancien calcul UNIQUEMENT pour les lignes antérieures à
    // `metadata.local_date` — sans lui, une base existante oublierait tout son
    // historique et redemanderait une fois à tout le monde.
    if (!stamped) {
      return localDateFor(new Date(String(row.created_at)), args.timezone) ===
        args.localDate;
    }
    return stamped === args.localDate;
  });
}

/**
 * La fenêtre de lecture de la cadence, en jours locaux.
 *
 * Trois semaines: le repli le plus long fait sept jours, et il faut pouvoir
 * observer plusieurs de ses cycles pour que `unansweredStreak` soit juste. Plus
 * loin ne changerait aucune décision — au-delà du repli maximal, « posée il y a
 * 21 jours » et « posée il y a 200 jours » commandent la même chose.
 */
export const PULSE_CADENCE_LOOKBACK_DAYS = 21;

/**
 * De quoi décider la cadence de la question: quand a-t-elle été posée pour la
 * dernière fois, qu'a répondu l'élève, et combien de fois s'est-il tu depuis.
 *
 * ── LES JOURS SONT DES CHAÎNES, COMPARÉES COMME DES CHAÎNES ──────────────
 * Le jour vient de `metadata.local_date`, écrit UNE fois par
 * `deliverChatMessage`. On ne le recalcule pas: ce dépôt a déjà produit une clé
 * `(user_id, local_date)` qui ne se rejoignait jamais parce que deux endroits
 * découpaient les jours différemment, et le rejeu à horloge simulée fait
 * diverger l'horodatage de la ligne de ledger de celui du message.
 *
 * ── UNE LECTURE EN PANNE REDEMANDE, ELLE NE SE TAIT PAS ──────────────────
 * Le repli est `never_asked` — c'est-à-dire « pose la question ». C'est
 * l'inverse du repli de `loadDayFacts`, et c'est délibéré: perdre le FAIT d'un
 * soir coûte une phrase, perdre la MESURE indéfiniment sur une base illisible
 * coûte le produit. Chaque repli penche vers ce qu'on ne peut pas rattraper.
 */
export async function loadAskCadence(
  db: Db,
  args: { userId: string; localDate: string; timezone: string | null; now: Date },
): Promise<AskCadenceInput> {
  const NEVER: AskCadenceInput = {
    daysSinceLastAsk: null,
    lastAnsweredLevel: null,
    unansweredStreak: 0,
  };

  const earliest = addDays(args.localDate, -PULSE_CADENCE_LOOKBACK_DAYS);

  // ── LES JOURS OÙ UNE QUESTION EST PARTIE ──────────────────────────────
  const askDays = new Set<string>();
  try {
    // Le préfiltre reste sur `created_at` (c'est lui qui est indexé), élargi de
    // trois jours pour couvrir le fuseau le plus décalé — le JOUR, lui, se lit
    // sur la ligne.
    const since = new Date(
      args.now.getTime() - (PULSE_CADENCE_LOOKBACK_DAYS + 3) * 86_400_000,
    ).toISOString();
    const { data, error } = await db
      .from("outbound_messages")
      .select("created_at, metadata")
      .eq("user_id", args.userId)
      .eq("metadata->>purpose", PULSE_QUESTION_PURPOSE)
      .gte("created_at", since);
    if (error) throw error;
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      if (!rowCarriedAsk(row.metadata)) continue;
      const stamped = String(
        (row.metadata as { local_date?: unknown } | null)?.local_date ?? "",
      ).trim();
      const day = stamped ||
        localDateFor(new Date(String(row.created_at)), args.timezone);
      if (!day || day < earliest) continue;
      // Une question datée DEMAIN vient d'un rejeu à horloge simulée, pas de la
      // vie de l'élève. La compter rendrait `daysSinceLastAsk` négatif et
      // gèlerait la cadence pour toute la fenêtre.
      if (day > args.localDate) continue;
      askDays.add(day);
    }
  } catch (error) {
    console.error("[keel/pulse] ask history unreadable", error);
    return NEVER;
  }

  // ── LA DERNIÈRE RÉPONSE ───────────────────────────────────────────────
  let lastAnswerDay = "";
  let lastAnsweredLevel: PulseLevel | null = null;
  try {
    const { data, error } = await db
      .from("student_daily_checkins")
      .select("local_date, overall")
      .eq("user_id", args.userId)
      .gte("local_date", earliest)
      .lte("local_date", args.localDate)
      .order("local_date", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = ((data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
    if (row) {
      lastAnswerDay = String(row.local_date ?? "").trim();
      const level = String(row.overall ?? "").trim();
      lastAnsweredLevel = PULSE_LEVELS.includes(level as PulseLevel)
        ? (level as PulseLevel)
        : null;
    }
  } catch (error) {
    console.error("[keel/pulse] last answer unreadable", error);
    return NEVER;
  }

  if (askDays.size === 0) return { ...NEVER, lastAnsweredLevel };

  const sorted = [...askDays].sort();
  const lastAskDay = sorted[sorted.length - 1];

  return {
    daysSinceLastAsk: daysBetween(lastAskDay, args.localDate),
    lastAnsweredLevel,
    // Les questions posées APRÈS la dernière réponse. Sans réponse du tout, ce
    // sont toutes celles de la fenêtre — un élève qui n'a jamais répondu doit
    // atteindre le repli comme un autre, sinon on le sollicite tous les trois
    // jours pour toujours.
    unansweredStreak: lastAnswerDay
      ? sorted.filter((d) => d > lastAnswerDay).length
      : sorted.length,
  };
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
