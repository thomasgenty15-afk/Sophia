import {
  type AwayDay,
  EATING_OCCASIONS,
  type EatingOccasion,
  type EatingOccasionSlot,
  parseAwayDays,
} from "../api/mealGeneration";

// L3 — « DEHORS » N'EST PAS « ABSENT », CÔTÉ NAVIGATEUR.
//
// Spec: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2, §2.2 bis.
//
// ⚠️ L'AUTORITÉ EST `supabase/functions/_shared/keel/household_presence.ts`.
// Le navigateur et Deno ne partagent aucun module dans ce dépôt; ce fichier en
// est le JUMEAU, écrit de la même façon et dans le même ordre, exactement comme
// `parseAwayDays` l'est déjà de son homologue moteur. La copie qui compte est
// celle du serveur: c'est elle qui décide ce qui entre dans la composition, et
// un client plus permissif ne peut rien faire passer.
//
// ── LES TROIS ÉTATS, ET CE QUI LES SÉPARE ─────────────────────────────────
//
//   À TABLE   le plan compose une part.
//   DEHORS    le plan ne compose rien, MAIS il a le droit de dire un nombre.
//   ABSENT    le plan ne compose rien ET ne dit rien.
//
// Les deux derniers se ressemblent (aucune part dans les deux cas) et ne sont
// pas la même chose: ce qui les sépare est ce que le produit DIT. Les
// confondre ferait taire le conseil du midi de quelqu'un qui déjeune dehors
// tous les jours, ou le ferait apparaître pendant ses vacances.
//
// ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────────
// Aucun chiffre, aucune phrase, aucune cible. Il rend la distinction lisible et
// écrivable; le conseil appartient à qui sait le calculer.

/**
 * CE QU'UNE BOUCHE FAIT D'UN CRÉNEAU. Liste FERMÉE, miroir de
 * `PRESENCE_STATES` côté moteur.
 *
 * `at_table` ne s'écrit NULLE PART: c'est l'absence d'entrée. Lui donner un
 * jeton ferait deux façons de dire « il mange ici ».
 */
export const PRESENCE_STATES = ["at_table", "eating_out", "away"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/** Le jeton porté par une entrée d'absence. Miroir de `AWAY_KINDS`. */
export const AWAY_KINDS = ["away", "eating_out"] as const;
export type AwayKind = (typeof AWAY_KINDS)[number];

/**
 * UNE ENTRÉE D'ABSENCE QUI DIT SON SENS.
 *
 * ⚠️ ELLE ÉTEND `AwayDay`, ELLE NE LE REMPLACE PAS. C'est ce qui permet de la
 * passer à tout ce qui attend des absences — la grille du plan, la porte
 * d'écriture, le moteur — sans toucher au type que quatorze fichiers importent.
 * Le jeton voyage dans le jsonb, invisible à `parseAwayDays`, exactement comme
 * `source`.
 */
export interface AwayMark extends AwayDay {
  kind: AwayKind;
}

/**
 * Le `kind` d'une entrée brute, ou `away`.
 *
 * ── L'ABSENCE DE JETON VAUT `away`, ET C'EST LA DIRECTION SÛRE ───────────
 * Les lignes écrites avant ce lot n'en portent pas. Les lire « dehors » ferait
 * apparaître un conseil chiffré sur des vacances déclarées il y a des jours.
 * Le silence est le repli — et c'est ce que le produit faisait hier.
 */
export function awayKindOf(entry: unknown): AwayKind {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "away";
  const raw = String((entry as Record<string, unknown>).kind ?? "")
    .trim().toLowerCase();
  return (AWAY_KINDS as readonly string[]).includes(raw)
    ? raw as AwayKind
    : "away";
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
 * `out` MOINS `blocked`, case par case — L'ARBITRAGE, jumeau de `withoutCells`.
 *
 * LE SILENCE GAGNE. La personne peut dire « je déjeune dehors le mardi »
 * pendant que le maître marque « elle est en vacances toute la semaine ». Les
 * deux retirent la part; elles ne se contredisent que sur un point — est-ce
 * qu'on dit un nombre ? On ne le dit pas: un conseil chiffré au milieu de
 * vacances s'écrit à l'écran, un conseil qui manque ne s'y voit pas.
 */
function withoutCells(
  out: readonly AwayDay[],
  blocked: readonly AwayDay[],
): AwayDay[] {
  const kept: AwayDay[] = [];
  for (const row of out) {
    const stop = blocked.find((b) => b.day === row.day);
    if (!stop) {
      kept.push({ day: row.day, slots: [...row.slots] });
      continue;
    }
    if (stop.slots.length === 0) continue;
    const outSlots: readonly EatingOccasion[] = row.slots.length > 0
      ? row.slots
      : EATING_OCCASIONS;
    const remaining = outSlots.filter((s) => !stop.slots.includes(s));
    if (remaining.length === 0) continue;
    kept.push({ day: row.day, slots: [...remaining] });
  }
  return kept;
}

/**
 * LA COLONNE BRUTE, RELUE À TROIS ÉTATS — le lecteur de l'écran.
 *
 * ⚠️ IL N'Y A QU'UN SEUL PARSEUR DE FORME, ET C'EST `parseAwayDays`. On filtre
 * par clé, puis on le laisse fusionner par jour, faire gagner la journée
 * entière et dédupliquer. Relire la forme ici ferait une seconde idée de
 * « quel jour, quel créneau », et c'est la lecture qu'on regarde le moins qui
 * garderait l'ancien état.
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

  const out = withoutCells(
    parseAwayDays(rows.filter((e) => awayKindOf(e) === "eating_out")),
    parseAwayDays(rows.filter((e) => awayKindOf(e) !== "eating_out")),
  );
  const marks: AwayMark[] = [];
  for (const row of parseAwayDays(rows)) {
    // ⚠️ ON PART DE L'EFFECTIF, PAS DES DEUX MOITIÉS. Une journée entière
    // écrite d'un côté et un créneau de l'autre se fusionnent DANS
    // `parseAwayDays`; recomposer à partir des sous-tableaux referait cette
    // fusion à la main, et elle a déjà un auteur.
    const slots = row.slots.length > 0 ? row.slots : EATING_OCCASIONS;
    const outHere = slots.filter((s) => coveredBy(out, row.day, s));
    if (outHere.length === 0) {
      marks.push({ day: row.day, slots: [...row.slots], kind: "away" });
      continue;
    }
    if (outHere.length === slots.length) {
      marks.push({ day: row.day, slots: [...row.slots], kind: "eating_out" });
      continue;
    }
    // Le jour porte les deux sens: DEUX entrées, une par sens. C'est la forme
    // que la base accepte (le parseur fusionne par jour) et la seule qui ne
    // perde pas la moitié de l'information.
    marks.push({ day: row.day, slots: [...outHere], kind: "eating_out" });
    marks.push({
      day: row.day,
      slots: slots.filter((s) => !outHere.includes(s)),
      kind: "away",
    });
  }
  return marks;
}

/**
 * L'ÉTAT D'UNE CASE — LA SEULE LECTURE À TROIS ÉTATS.
 *
 * L'ordre des tests EST la règle: pas d'entrée → à table; entrée « dehors » →
 * dehors; sinon absent. Le défaut est la table, et il ne s'écrit nulle part.
 */
export function presenceStateOf(
  marks: readonly AwayMark[],
  day: string,
  slot: EatingOccasion,
): PresenceState {
  const out = marks.filter((m) => m.kind === "eating_out");
  const shut = marks.filter((m) => m.kind !== "eating_out");
  if (coveredBy(shut, day, slot)) return "away";
  if (coveredBy(out, day, slot)) return "eating_out";
  return "at_table";
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
 * Tous les moments du rythme dans le même état = la journée entière, écrite
 * `slots: []`. C'est la forme de FF-002 §5, et elle survit à un changement de
 * rythme: ajouter un petit-déjeuner plus tard ne doit pas ressusciter un samedi
 * où personne n'est jamais là.
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
    .map((m) => ({ day: m.day, slots: [...m.slots], kind: m.kind }));

  const fresh: AwayMark[] = [];
  const slots = args.rhythm.map((r) => r.slot);
  for (const day of args.days) {
    for (const kind of ["eating_out", "away"] as const) {
      const hit = slots.filter((s) => args.cells.get(`${day}|${s}`) === kind);
      if (hit.length === 0) continue;
      fresh.push({
        day,
        slots: hit.length === slots.length ? [] : hit,
        kind,
      });
    }
  }
  return [...kept, ...fresh];
}

// ===========================================================================
// LA QUESTION HEBDOMADAIRE — « la semaine, mange-t-il/elle au bureau ? »
//
// ⚠️ ELLE PRÉ-REMPLIT, ELLE NE DÉCIDE PAS. La grille gagne toujours (§2.2 bis).
// Le pré-remplissage est APPLIQUÉ UNE FOIS, À L'ÉCRITURE, par la porte SQL
// `keel_household_set_member_work_lunch` — jamais re-dérivé à la lecture. Un
// pré-remplissage recalculé à chaque affichage remettrait « dehors » sur le
// midi qu'on vient de décocher, à chaque fois, et personne ne comprendrait
// pourquoi son geste ne tient pas.
//
// D'où ce que ce module donne ici: la DESCRIPTION de ce qui sera coché, pour
// que l'écran puisse le DIRE avant de le faire. Pas le geste.
// ===========================================================================

/** Gamelle ou dehors. Miroir de `WORK_LUNCH_MODES`. */
export const WORK_LUNCH_MODES = ["lunchbox", "outside"] as const;
export type WorkLunchMode = (typeof WORK_LUNCH_MODES)[number];

/** La réponse d'une bouche. Miroir de `WorkLunch` côté moteur. */
export interface WorkLunch {
  atWork: boolean;
  /** `null` tant que la question n'est pas descendue. */
  mode: WorkLunchMode | null;
  /**
   * `null` = pas demandé ou pas répondu, et ce n'est PAS « non »: sans
   * micro-ondes le repas doit être bon froid, ce qui est une contrainte réelle
   * qu'on n'invente pas sur un silence.
   */
  microwave: boolean | null;
}

/**
 * La colonne `household_members.work_lunch`, relue.
 *
 * `null` = LA QUESTION N'A JAMAIS ÉTÉ POSÉE, et c'est différent de « non ».
 * Un `at_work` qui n'est pas un booléen rend `null` — pas `false`: fabriquer
 * « elle ne mange pas au bureau » à partir d'une donnée illisible ferait
 * composer cinq déjeuners à quelqu'un qui n'en mange aucun ici.
 */
export function parseWorkLunch(raw: unknown): WorkLunch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.at_work !== "boolean") return null;
  if (!o.at_work) return { atWork: false, mode: null, microwave: null };
  const rawMode = String(o.mode ?? "").trim().toLowerCase();
  const mode = (WORK_LUNCH_MODES as readonly string[]).includes(rawMode)
    ? rawMode as WorkLunchMode
    : null;
  return {
    atWork: true,
    mode,
    microwave: mode === "lunchbox" && typeof o.microwave === "boolean"
      ? o.microwave
      : null,
  };
}

/** Ce que la réponse écrit en base. L'inverse exact de `parseWorkLunch`. */
export function workLunchPayload(answer: WorkLunch): Record<string, unknown> {
  if (!answer.atWork) return { at_work: false };
  return {
    at_work: true,
    mode: answer.mode,
    // On n'émet le micro-ondes QUE pour la gamelle: le garder sur « dehors »
    // laisserait traîner une contrainte de réchauffage sur un repas que le plan
    // ne compose pas, et un lecteur finirait par la lire.
    microwave: answer.mode === "lunchbox" ? answer.microwave : null,
  };
}

/**
 * « LA SEMAINE » — les cinq jours que la question désigne. Miroir de
 * `WORK_WEEK_DAYS`, et le SQL du pré-remplissage porte la même liste.
 */
export const WORK_WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;

/** Le créneau concerné. La question porte sur le DÉJEUNER, et sur lui seul. */
export const WORK_LUNCH_SLOT: EatingOccasion = "lunch";

/**
 * LES CASES QUE LE PRÉ-REMPLISSAGE VA COCHER — la description, pas le geste.
 *
 * Vide dès que la réponse ne produit aucun « dehors »: pas au bureau, gamelle,
 * ou question non descendue. `lunchbox` en fait partie et c'est le point le
 * plus facile à rater — une gamelle est un repas COMPOSÉ, pas un repas manqué.
 */
export function workLunchPrefillCells(
  answer: WorkLunch | null,
): ReadonlyArray<{ day: string; slot: EatingOccasion }> {
  if (!answer || !answer.atWork || answer.mode !== "outside") return [];
  return WORK_WEEK_DAYS.map((day) => ({ day, slot: WORK_LUNCH_SLOT }));
}
