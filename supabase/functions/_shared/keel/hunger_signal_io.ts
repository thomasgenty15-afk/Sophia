/**
 * FF-027 — LES LECTURES ET L'ÉCRITURE DU SIGNAL DE FAIM.
 *
 * La décision vit dans `hunger_signal.ts` (module pur). Ici il n'y a que de la
 * plomberie, et une seule idée à tenir:
 *
 *   ── ON RAMÈNE DES JOURS, PAS UN NOMBRE ───────────────────────────────────
 *   Ce module ne compte RIEN. Il rend des faits datés et laisse `countHungerDays`
 *   fenêtrer et dédupliquer. C'est ce qui rend R4 vraie sur le disque comme dans
 *   le code: aucun compteur n'existe, donc aucun compteur ne peut diverger de sa
 *   fenêtre. Un `select count(*)` ici aurait été plus court et aurait recréé
 *   exactement le défaut que la fiche interdit — deux lectures de la fenêtre, à
 *   tenir d'accord.
 *
 * LES DEUX SOURCES, un seul signal (fiche §3):
 *   — l'axe `hunger` du tap du soir (`student_daily_checkins`), qui existe;
 *   — la faim déclarée en conversation (`student_hunger_reports`), écrite par le
 *     plancher déterministe.
 */

import {
  type HungerDay,
  HUNGER_WINDOW_DAYS,
  hungerWindowStart,
} from "./hunger_signal.ts";

/** Le minimum de client Supabase dont ce module a besoin. */
type Db = {
  from(table: string): any;
};

/**
 * COMBIEN DE JOURS ON GARDE SUR LE DISQUE.
 *
 * La fenêtre de LECTURE fait 7 jours; celle-ci fait 60, et l'écart est
 * délibéré. Une purge calée sur la fenêtre effacerait la matière avant qu'on
 * puisse relire un incident (« pourquoi ce plan a-t-il grossi la semaine du
 * 12 ? »), et la fiche demande une mesure — la faim rapportée à S+1 après une
 * adaptation (§10) — qui a besoin de deux semaines au moins.
 *
 * 60 jours est ce qui rend l'éphémère vrai AUSSI sur le disque: sans purge, une
 * table de faits datés devient un historique, et un historique devient un jour
 * un trait de personnalité. C'est le rabbit hole nommé §9.
 */
export const HUNGER_REPORT_RETENTION_DAYS = 60;

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * LES JOURS DE FAIM DE LA FENÊTRE — les deux sources, fusionnées.
 *
 * ⚠️ ELLE JETTE plutôt que de rendre `[]` sur une panne de lecture. « Aucun
 * signal » et « je n'ai pas pu lire » ne sont pas la même chose: le premier
 * compose la semaine comme d'habitude, le second devrait le dire. L'appelant
 * décide quoi faire du silence (les générateurs le journalisent et composent
 * sans bloc), mais il le décide EXPLICITEMENT au lieu de recevoir un tableau
 * vide qui ment.
 */
export async function loadHungerDays(
  db: Db,
  args: { userId: string; todayLocalDate: string },
): Promise<HungerDay[]> {
  const from = hungerWindowStart(args.todayLocalDate);
  const to = args.todayLocalDate;

  const tap = await db
    .from("student_daily_checkins")
    .select("local_date")
    .eq("user_id", args.userId)
    // `axis = 'hunger'` SEUL suffit: la base garantit déjà qu'un axe n'existe
    // que sur une journée non-`good` (`student_daily_checkins_axis_coherent_
    // check`). Ajouter `overall <> 'good'` ici serait une deuxième expression
    // de la même règle, à tenir d'accord avec la première.
    .eq("axis", "hunger")
    .gte("local_date", from)
    .lte("local_date", to);
  if (tap.error) {
    throw new Error(`[keel/hunger_signal_io] taps: ${tap.error.message}`);
  }

  const chat = await db
    .from("student_hunger_reports")
    .select("local_date")
    .eq("user_id", args.userId)
    .gte("local_date", from)
    .lte("local_date", to);
  if (chat.error) {
    throw new Error(`[keel/hunger_signal_io] reports: ${chat.error.message}`);
  }

  const days: HungerDay[] = [];
  for (const row of (tap.data ?? []) as Array<{ local_date: string }>) {
    days.push({ localDate: String(row.local_date), source: "evening_tap" });
  }
  for (const row of (chat.data ?? []) as Array<{ local_date: string }>) {
    days.push({ localDate: String(row.local_date), source: "chat" });
  }
  return days;
}

export type HungerReportWrite = {
  /** `inserted` = un jour de faim de plus. `existing` = ce jour en portait déjà un. */
  outcome: "inserted" | "existing";
};

/**
 * ÉCRIRE LE FAIT DU SPONTANÉ.
 *
 * ── IDEMPOTENT PAR LA BASE, PAS PAR UNE LECTURE PRÉALABLE ──────────────────
 * `on conflict do nothing` sur `(user_id, local_date)`. Un « select puis insert »
 * aurait une fenêtre de course entre les deux, et ce dépôt a déjà payé des
 * doublons nés exactement là. Trois phrases sur la faim le même soir = un jour.
 *
 * ── ELLE NE REND AUCUN TEXTE, ET C'EST LA FICHE ────────────────────────────
 * Aucun accusé de réception, aucune mention. §3: « pas de conversation sur la
 * faim ». R5: sous plancher de restriction, ça s'enregistre et rien ne
 * s'affiche — ce qui est vrai ici pour TOUT LE MONDE, donc vrai sans branche.
 */
export async function writeHungerReport(
  db: Db,
  args: {
    userId: string;
    localDate: string;
    matched: string;
    studentNote: string;
    contentLocale: string | null;
  },
): Promise<HungerReportWrite> {
  const { data, error } = await db
    .from("student_hunger_reports")
    .upsert(
      {
        user_id: args.userId,
        local_date: args.localDate,
        source: "chat",
        matched: args.matched.slice(0, 200),
        // Borné: la table garde un fait, pas une conversation.
        student_note: args.studentNote.slice(0, 500),
        content_locale: args.contentLocale,
      },
      { onConflict: "user_id,local_date", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    throw new Error(`[keel/hunger_signal_io] write: ${error.message}`);
  }
  const inserted = Array.isArray(data) && data.length > 0;

  // LA PURGE, ici et pas dans un cron. Best-effort et bruyante: une table de
  // faits éphémères qu'aucun chemin n'élague devient un historique, et
  // l'accrocher à un cron neuf ferait dépendre l'éphémérité d'un job de plus à
  // surveiller. L'écriture est rare (un plancher, quelques fois par semaine),
  // donc le coût est nul et le nettoyage suit l'usage.
  try {
    await db
      .from("student_hunger_reports")
      .delete()
      .eq("user_id", args.userId)
      .lt(
        "local_date",
        shiftDate(args.localDate, -HUNGER_REPORT_RETENTION_DAYS),
      );
  } catch (error) {
    console.warn("[keel] hunger report retention purge failed", error);
  }

  return { outcome: inserted ? "inserted" : "existing" };
}

/**
 * COMBIEN DE COMPOSITIONS RÉCENTES ONT DÉJÀ CONSOMMÉ LE SIGNAL.
 *
 * ── À QUOI ÇA SERT, ET À QUI ───────────────────────────────────────────────
 * À FF-028, et à elle seule. §10 (contre-mesure) dit qu'une faim qui persiste
 * MALGRÉ deux adaptations n'appelle pas un troisième agrandissement mais un
 * changement de STRUCTURE — un vrai petit-déjeuner, une collation. Répondre à
 * « malgré deux adaptations » demande de savoir combien de plans sont partis
 * avec le bloc satiété.
 *
 * ── POURQUOI ÇA SE LIT ET NE SE COMPTE PAS ─────────────────────────────────
 * La provenance est archivée AVEC chaque plan (`generated_from.satiety_priority`,
 * voir `hungerSignalProvenance`). Un compteur sur l'élève aurait été le trait
 * durable que R4 interdit; ici on compte des lignes de plan, qui s'effacent avec
 * les plans. Même posture que le décompte de faim: dérivé à la lecture.
 *
 * ⚠️ CE MODULE NE DÉCIDE RIEN AVEC. Le bloc satiété n'escalade pas et ne
 * s'éteint pas non plus au bout de deux adaptations — l'éteindre reviendrait à
 * REPRENDRE de la nourriture à quelqu'un qui a faim, ce que R2 interdit. Il
 * plafonne, c'est tout. Ce nombre est une entrée d'ANALYSE, pas de composition.
 */
export async function countSatietyAdaptations(
  db: Db,
  args: { userId: string; sinceLocalDate: string },
): Promise<number> {
  const { data, error } = await db
    .from("student_week_plans")
    .select("week_start, generated_from")
    .eq("user_id", args.userId)
    .gte("week_start", args.sinceLocalDate);
  if (error) {
    throw new Error(`[keel/hunger_signal_io] adaptations: ${error.message}`);
  }
  let n = 0;
  for (
    const row of (data ?? []) as Array<{ generated_from: unknown }>
  ) {
    const gf = row.generated_from;
    if (gf && typeof gf === "object" && !Array.isArray(gf)) {
      if ((gf as Record<string, unknown>).satiety_priority === true) n += 1;
    }
  }
  return n;
}

/** La fenêtre de lecture, rendue pour les logs et pour FF-028. */
export const HUNGER_SIGNAL_WINDOW_DAYS = HUNGER_WINDOW_DAYS;
