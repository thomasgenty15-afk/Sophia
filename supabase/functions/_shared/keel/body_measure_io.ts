/**
 * FF-031 — LA COUCHE I/O DES MESURES CORPORELLES DATÉES.
 *
 * Fiche: `docs/fonctionnalites/suivi-quotidien/FF-031-mesures-corporelles-datees.md`
 * Table: `20260810090000_student_body_measures.sql`
 *
 * Même partage que partout dans `_shared/keel/`: tout ce qui peut être FAUX
 * (SQL, fuseaux, lignes en double) vit ici; tout ce qui DÉCIDE vit dans
 * `body_measure_series.ts`, qui est pur et se teste sans base.
 *
 * ── CE MODULE N'EST PAS BEST-EFFORT, ET SON APPELANT NON PLUS ──────────────
 * L'écriture est RELUE (R8): une ligne qu'on n'a pas vue atterrir n'est pas une
 * ligne. Le chargeur, lui, ne rattrape rien — un chargeur qui avale son erreur
 * et rend « pas de mesure » raconte qu'un élève ne s'est jamais pesé alors
 * qu'on a échoué à le lire, et c'est exactement ainsi qu'une ceinture cesse de
 * mordre sans que personne ne le voie.
 *
 * L'arbitrage de l'APPELANT est différent, et il est écrit dans la fiche (R9):
 * tant que la double écriture dure, un échec ici ne doit pas emporter
 * l'écriture miroir dans `weekly_reviews.biofeedback`. Il se journalise
 * nommément et le produit dégrade au comportement d'avant ce chantier.
 */

import type { BodyMeasureKind } from "./body_measure_floor.ts";
import type { DatedBodyMeasure } from "./body_measure_series.ts";
import { localDateInZone } from "./local_date.ts";

// deno-lint-ignore no-explicit-any
type Db = { from(table: string): any };

export const BODY_MEASURES_TABLE = "student_body_measures";

/** Le geste d'où vient la mesure. Liste fermée, celle du CHECK SQL. */
export type BodyMeasureSource = "sunday_flow" | "plan_card" | "chat";

export interface BodyMeasureWrite {
  userId: string;
  kind: BodyMeasureKind;
  /** En SI: kg ou cm. La conversion est faite en amont, jamais ici. */
  valueSi: number;
  source: BodyMeasureSource;
  /** L'instant du geste, ISO, en heure LOCALE de l'élève. */
  measuredAt: string;
  /** Le jour de l'élève dans SON fuseau, YYYY-MM-DD. */
  localDate: string;
  contentLocale?: string | null;
  studentNote?: string | null;
}

export interface BodyMeasureWriteResult {
  written: number;
  ids: string[];
}

function fail(message: string): never {
  throw new Error(`[keel/body_measure_io] ${message}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// LA DATE LOCALE D'UNE MESURE SAISIE AU FORMULAIRE
// ---------------------------------------------------------------------------

/**
 * Le jour de l'élève pour une mesure envoyée par un formulaire.
 *
 * ── POURQUOI CE N'EST PAS JUSTE `localDateInZone` ──────────────────────────
 * Les deux formulaires (le point du dimanche, la carte des mesures) portent la
 * SEMAINE dans leur jeton, pas le jour. Le jour doit donc être résolu côté
 * serveur — et trois choses peuvent le faire dérailler: un fuseau absent sur
 * `profiles`, un fuseau inconnu d'`Intl`, et un jeton qui nomme une autre
 * semaine que celle où l'horloge se trouve (un onglet resté ouvert depuis
 * dimanche, un envoi rejoué).
 *
 * ── L'INVARIANT QUE CETTE FONCTION TIENT ──────────────────────────────────
 * La date rendue est TOUJOURS dans la semaine que le jeton nomme. C'est ce qui
 * garantit que la mesure retombe dans la même semaine dérivée que l'écriture
 * miroir de `weekly_reviews`: hors de cet intervalle, les deux chemins
 * rangeraient la même pesée dans deux semaines différentes, et la divergence
 * serait invisible jusqu'à ce qu'elle change un pourcentage de perte.
 *
 * ── ELLE NE JETTE PAS, ET C'EST DÉLIBÉRÉ ──────────────────────────────────
 * `localDateInZone` jette sur un fuseau vide ou inconnu, à raison: pour un
 * dîner, mieux vaut un tour qui échoue qu'un fait rangé la veille. Ici l'enjeu
 * s'inverse — jeter ferait PERDRE la mesure, alors que la semaine, elle, est
 * connue de façon certaine par le jeton. Le repli est le dimanche de la
 * semaine: le jour où le point est envoyé, et la borne haute de l'intervalle.
 */
export function resolveMeasureLocalDate(args: {
  weekStart: string;
  timezone: string | null | undefined;
  now: Date;
}): string {
  const weekStart = String(args.weekStart ?? "").trim();
  if (!ISO_DATE.test(weekStart)) {
    fail(`weekStart n'est pas au format YYYY-MM-DD: ${JSON.stringify(args.weekStart)}`);
  }
  const weekEnd = shiftIsoDate(weekStart, 6);

  let candidate: string | null = null;
  const zone = String(args.timezone ?? "").trim();
  if (zone) {
    try {
      candidate = localDateInZone(zone, args.now);
    } catch {
      candidate = null;
    }
  }
  if (candidate === null) {
    // Sans fuseau, la date UTC du jour est la moins mauvaise approximation —
    // et le clamp ci-dessous la ramène dans la semaine de toute façon.
    candidate = args.now.toISOString().slice(0, 10);
  }
  if (candidate < weekStart) return weekStart;
  if (candidate > weekEnd) return weekEnd;
  return candidate;
}

/** Décale une date de `days` jours. Ancrée à midi: voir `local_date.addDays`. */
function shiftIsoDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// L'ÉCRITURE — relue, jamais annoncée sur la foi d'un `insert` sans retour
// ---------------------------------------------------------------------------

/**
 * Écrit des mesures. APPEND-ONLY: aucun `upsert`, aucune lecture préalable.
 *
 * La table n'a pas de contrainte d'unicité (voir la migration), donc pas de
 * boucle SELECT-puis-UPDATE-ou-INSERT et pas de 23505 à rattraper: c'est le
 * bénéfice direct de l'append-only, et c'est ce qui rend cet écrivain trivial
 * là où celui de `weekly_reviews` a besoin de trente lignes de ceinture.
 *
 * `.select("id")` n'est pas décoratif: sans lui, PostgREST rend 201 sans corps
 * et l'appelant journaliserait « écrit » sur une écriture qu'il n'a pas
 * observée atterrir (R8). Un décompte qui ne correspond pas JETTE.
 */
export async function insertBodyMeasures(
  db: Db,
  rows: readonly BodyMeasureWrite[],
): Promise<BodyMeasureWriteResult> {
  const payload = rows.map((row, index) => {
    const field = `rows[${index}]`;
    const userId = String(row.userId ?? "").trim();
    if (!userId) fail(`${field}.userId est requis`);
    if (row.kind !== "weight" && row.kind !== "waist") {
      fail(`${field}.kind inconnu: ${JSON.stringify(row.kind)}`);
    }
    if (!Number.isFinite(row.valueSi)) {
      fail(`${field}.valueSi doit être un nombre fini, reçu ${JSON.stringify(row.valueSi)}`);
    }
    if (!ISO_DATE.test(String(row.localDate ?? ""))) {
      fail(`${field}.localDate n'est pas au format YYYY-MM-DD: ${JSON.stringify(row.localDate)}`);
    }
    const measuredAt = String(row.measuredAt ?? "").trim();
    if (!measuredAt || !Number.isFinite(Date.parse(measuredAt))) {
      fail(`${field}.measuredAt n'est pas un instant lisible: ${JSON.stringify(row.measuredAt)}`);
    }
    return {
      user_id: userId,
      measured_at: measuredAt,
      local_date: row.localDate,
      kind: row.kind,
      value_si: row.valueSi,
      source: row.source,
      content_locale: row.contentLocale ?? null,
      student_note: row.studentNote ?? null,
    };
  });
  if (payload.length === 0) return { written: 0, ids: [] };

  const { data, error } = await db
    .from(BODY_MEASURES_TABLE)
    .insert(payload)
    .select("id");
  if (error) throw error;
  const ids = ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);
  if (ids.length !== payload.length) {
    fail(
      `write-through violé: ${payload.length} mesures envoyées, ${ids.length} relues`,
    );
  }
  return { written: ids.length, ids };
}

// ---------------------------------------------------------------------------
// LA LECTURE
// ---------------------------------------------------------------------------

/**
 * Les mesures d'un élève sur une fenêtre de jours locaux.
 *
 * L'ORDRE EST UN CONTRAT, pas une commodité. `dailyValues` départage deux
 * mesures du même jour par `measured_at`, et « à instant égal, la dernière de
 * la liste gagne ». Un tri instable ferait donc gagner tantôt l'une tantôt
 * l'autre sur deux lectures de la même base — le genre de non-déterminisme qui
 * ne se voit que sur un chiffre, et jamais sur une erreur. D'où le tri final
 * sur `id`.
 */
export async function loadBodyMeasures(
  db: Db,
  params: {
    userId: string;
    sinceLocalDate: string;
    untilLocalDate: string;
    kinds?: readonly BodyMeasureKind[];
  },
): Promise<DatedBodyMeasure[]> {
  const userId = String(params.userId ?? "").trim();
  if (!userId) fail("userId est requis");
  for (const [field, value] of [
    ["sinceLocalDate", params.sinceLocalDate],
    ["untilLocalDate", params.untilLocalDate],
  ] as const) {
    if (!ISO_DATE.test(String(value ?? ""))) {
      fail(`${field} n'est pas au format YYYY-MM-DD: ${JSON.stringify(value)}`);
    }
  }

  let query = db
    .from(BODY_MEASURES_TABLE)
    .select("local_date, kind, value_si, measured_at")
    .eq("user_id", userId)
    .gte("local_date", params.sinceLocalDate)
    .lte("local_date", params.untilLocalDate);
  if (params.kinds && params.kinds.length > 0) {
    query = query.in("kind", [...params.kinds]);
  }
  const { data, error } = await query
    .order("local_date", { ascending: true })
    .order("measured_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row, index) => {
    const kind = String(row.kind ?? "");
    if (kind !== "weight" && kind !== "waist") {
      fail(`ligne ${index}: kind inconnu en base: ${JSON.stringify(row.kind)}`);
    }
    return {
      localDate: String(row.local_date ?? ""),
      kind,
      valueSi: numericFromDb(row.value_si, `ligne ${index}.value_si`),
      measuredAt: String(row.measured_at ?? ""),
    };
  });
}

/**
 * Un `numeric` de PostgREST, en nombre — et `""` NE VAUT PAS ZÉRO.
 *
 * Le cast `row.value_si as number` aurait compilé et menti: ce dépôt a déjà
 * mesuré qu'« un `as` sur un type étranger désarme le typecheck ». Selon le
 * client et la version, `numeric` arrive en nombre ou en chaîne; la seule
 * chose qui ne doit jamais arriver est qu'une absence devienne un poids de
 * zéro kilo dans une moyenne qui arme une ceinture.
 */
function numericFromDb(value: unknown, field: string): number {
  const usable = typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "");
  const n = usable ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) {
    fail(`${field} n'est pas un nombre lisible: ${JSON.stringify(value)}`);
  }
  return n;
}
