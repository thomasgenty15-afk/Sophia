import {
  type AwayDay,
  type EatingOccasion,
  type EatingOccasionSlot,
  parseAwayDays,
} from "../api/mealGeneration";

// LA PRÉSENCE D'UNE BOUCHE, CÔTÉ NAVIGATEUR — À TABLE OU ABSENTE.
//
// ⚠️ L'AUTORITÉ EST `supabase/functions/_shared/keel/household_presence.ts`.
// Le navigateur et Deno ne partagent aucun module dans ce dépôt; ce fichier en
// est le JUMEAU, écrit de la même façon et dans le même ordre, exactement comme
// `parseAwayDays` l'est déjà de son homologue moteur. La copie qui compte est
// celle du serveur: c'est elle qui décide ce qui entre dans la composition, et
// un client plus permissif ne peut rien faire passer.
//
//   À TABLE   le plan compose une part. Aucune entrée dans `away_days`.
//   ABSENT    le plan ne compose rien. Une entrée `kind: "away"`.
//
// ⟳ 2026-09-24 — le troisième état « dehors » (`kind: "eating_out"`) est
// retiré, comme côté moteur. Une ancienne entrée qui le porterait encore se lit
// « absent » (`parseAwayDays` ignore `kind`) et repart `kind: "away"` au premier
// enregistrement.

/**
 * CE QU'UNE BOUCHE FAIT D'UN CRÉNEAU. Liste FERMÉE, miroir de
 * `PRESENCE_STATES` côté moteur.
 *
 * `at_table` ne s'écrit NULLE PART: c'est l'absence d'entrée. Lui donner un
 * jeton ferait deux façons de dire « il mange ici ».
 */
export const PRESENCE_STATES = ["at_table", "away"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/**
 * UNE ENTRÉE D'ABSENCE, TELLE QUE LA GRILLE L'ÉCRIT.
 *
 * Elle étend `AwayDay`: on peut la passer à tout ce qui attend des absences —
 * la grille du plan, la porte d'écriture, le moteur. Le jeton voyage dans le
 * jsonb, invisible à `parseAwayDays`, exactement comme `source`.
 */
export interface AwayMark extends AwayDay {
  kind: "away";
}

/** Ce moment-là, ce jour-là, est-il écarté ? Même règle que le moteur. */
function coveredBy(
  rows: readonly AwayDay[],
  day: string,
  slot: EatingOccasion,
): boolean {
  const row = rows.find((a) => a.day === day);
  if (!row) return false;
  // Liste vide = la journée entière (convention de FF-002, tenue des deux côtés).
  return row.slots.length === 0 || row.slots.includes(slot);
}

/**
 * LA COLONNE BRUTE, RELUE — le lecteur de l'écran.
 *
 * ⚠️ IL N'Y A QU'UN SEUL PARSEUR DE FORME, ET C'EST `parseAwayDays`. On filtre
 * par clé, puis on le laisse fusionner par jour, faire gagner la journée
 * entière et dédupliquer.
 *
 * `source` FILTRE AVANT LE RESTE, quand il est demandé. La grille du foyer ne
 * montre QUE la marque du maître (`awayHousehold`): lui montrer l'union ferait
 * recopier la déclaration de la personne dans la colonne du maître au premier
 * enregistrement, où elle survivrait à sa rétractation.
 */
export function parseAwayMarks(
  raw: unknown,
  source?: "self" | "household",
): AwayMark[] {
  if (!Array.isArray(raw)) return [];
  const rows = source === undefined ? raw : raw.filter((e) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) return false;
    const value = (e as Record<string, unknown>).source;
    return String(value ?? "").trim().toLowerCase() === source;
  });
  return parseAwayDays(rows).map((row) => ({
    day: row.day,
    slots: [...row.slots],
    kind: "away",
  }));
}

/**
 * L'ÉTAT D'UNE CASE. Pas d'entrée → à table; sinon absent. Le défaut est la
 * table, et il ne s'écrit nulle part.
 */
export function presenceStateOf(
  marks: readonly AwayMark[],
  day: string,
  slot: EatingOccasion,
): PresenceState {
  return coveredBy(marks, day, slot) ? "away" : "at_table";
}

/**
 * CE QUE LA GRILLE ÉCRIT — la liste COMPLÈTE, jours hors fenêtre compris.
 *
 * ── LA FUSION, ET ELLE N'EST PAS UN DÉTAIL ───────────────────────────────
 * La grille ne montre que les jours de CETTE fenêtre. Une fenêtre de trois
 * jours ne dit rien des quatre autres, et écraser avec ce qu'elle montre
 * effacerait « mardi midi » parce qu'on a composé un week-end. Les jours hors
 * fenêtre sont donc repris tels quels.
 *
 * ── LA FORME COURTE SURVIT ───────────────────────────────────────────────
 * Tous les moments du rythme absents = la journée entière, écrite `slots: []`.
 * C'est la forme de FF-002 §5, et elle survit à un changement de rythme:
 * ajouter un petit-déjeuner plus tard ne doit pas ressusciter un samedi où
 * personne n'est jamais là.
 */
export function mergeAwayMarks(args: {
  /** Les jours de la fenêtre montrée, en jetons (`mon`…`sun`). */
  days: readonly string[];
  /** Les moments d'une journée — les lignes de la grille. */
  rhythm: readonly EatingOccasionSlot[];
  /** Ce qui était enregistré, toutes semaines confondues. */
  existing: readonly AwayMark[];
  /** L'état de CHAQUE case montrée, en `jour|créneau`. */
  cells: ReadonlyMap<string, PresenceState>;
}): AwayMark[] {
  const inWindow = new Set(args.days);
  const kept = args.existing
    .filter((m) => !inWindow.has(m.day))
    .map((m): AwayMark => ({ day: m.day, slots: [...m.slots], kind: "away" }));

  const fresh: AwayMark[] = [];
  const slots = args.rhythm.map((r) => r.slot);
  for (const day of args.days) {
    const hit = slots.filter((s) => args.cells.get(`${day}|${s}`) === "away");
    if (hit.length === 0) continue;
    fresh.push({
      day,
      slots: hit.length === slots.length ? [] : hit,
      kind: "away",
    });
  }
  return [...kept, ...fresh];
}
