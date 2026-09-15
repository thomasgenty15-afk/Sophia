// LA TABLE DE CAS PARTAGÉE — ce qui empêche les deux fenêtres de diverger.
//
// `meal_plan_window.ts` (moteur, conversation, crons) et
// `frontend/src/keel/api/mealWindow.ts` (écrans) répondent à la même question:
// quel plan possède ce jour-là. Deux implémentations d'une même question
// divergent au premier ajustement, et personne ne sait alors laquelle ment —
// `following_io.ts` énonce exactement cette règle à propos de « courant ».
//
// Ce fichier est donc la SPÉCIFICATION, et les deux côtés l'exécutent. Il est
// délibérément recopié à l'identique depuis
// `supabase/functions/_shared/keel/meal_plan_window_fixtures.ts`:
// un import cross-runtime n'existe pas entre Deno et Vite, et une divergence
// entre les deux copies est immédiatement rouge des deux côtés.
//
// 2026-08-10 est un LUNDI. Toutes les dates ci-dessous en découlent.

export interface WindowFixtureRow {
  id: string;
  startsOn: string;
  durationDays: number;
  retiredAt?: string | null;
  createdAt?: string | null;
}

export interface WindowFixtureCase {
  name: string;
  rows: WindowFixtureRow[];
  today: string;
  /** `null` quand aucun plan ne possède ce jour. */
  expectCurrent: string | null;
  expectNext: string | null;
  expectElapsed: string[];
  expectAmbiguous: string[];
}

export const MEAL_WINDOW_FIXTURES: readonly WindowFixtureCase[] = [
  {
    name: "un seul plan, aujourd'hui dedans",
    rows: [{ id: "a", startsOn: "2026-08-10", durationDays: 7 }],
    today: "2026-08-12",
    expectCurrent: "a",
    expectNext: null,
    expectElapsed: [],
    expectAmbiguous: [],
  },
  {
    name: "courant et suivant coexistent",
    rows: [
      { id: "a", startsOn: "2026-08-10", durationDays: 4 },
      { id: "b", startsOn: "2026-08-14", durationDays: 3 },
    ],
    today: "2026-08-12",
    expectCurrent: "a",
    expectNext: "b",
    expectElapsed: [],
    expectAmbiguous: [],
  },
  {
    // LA PROPRIÉTÉ QUI PROUVE QU'AUCUN JOB N'EST NÉCESSAIRE. Mêmes lignes que
    // le cas précédent, `today` avancé de deux jours: les rôles s'échangent
    // tout seuls, sans que rien n'ait été écrit.
    name: "la bascule est gratuite: le suivant devient courant",
    rows: [
      { id: "a", startsOn: "2026-08-10", durationDays: 4 },
      { id: "b", startsOn: "2026-08-14", durationDays: 3 },
    ],
    today: "2026-08-14",
    expectCurrent: "b",
    expectNext: null,
    expectElapsed: ["a"],
    expectAmbiguous: [],
  },
  {
    // LE TROU DE LA SPEC: le courant est écoulé, le suivant n'a pas commencé.
    // Personne ne possède aujourd'hui. Sans branche propre, `/app/plan` serait
    // vide pour quelqu'un qui a pourtant un plan.
    name: "aucun courant, un suivant plus tard",
    rows: [
      { id: "a", startsOn: "2026-08-10", durationDays: 3 },
      { id: "b", startsOn: "2026-08-17", durationDays: 7 },
    ],
    today: "2026-08-14",
    expectCurrent: null,
    expectNext: "b",
    expectElapsed: ["a"],
    expectAmbiguous: [],
  },
  {
    name: "une ligne retirée ne concourt pas",
    rows: [
      { id: "a", startsOn: "2026-08-10", durationDays: 7, retiredAt: "2026-08-11T10:00:00Z" },
      { id: "b", startsOn: "2026-08-10", durationDays: 7 },
    ],
    today: "2026-08-12",
    expectCurrent: "b",
    expectNext: null,
    expectElapsed: [],
    expectAmbiguous: [],
  },
  {
    name: "tout est écoulé",
    rows: [
      { id: "a", startsOn: "2026-07-27", durationDays: 7 },
      { id: "b", startsOn: "2026-08-03", durationDays: 7 },
    ],
    today: "2026-08-12",
    expectCurrent: null,
    expectNext: null,
    expectElapsed: ["b", "a"],
    expectAmbiguous: [],
  },
  {
    // Donnée ANTÉRIEURE à la contrainte d'exclusion: deux fenêtres vivantes se
    // chevauchent. On en choisit une — la plus récemment démarrée — et on rend
    // l'autre dans `ambiguous` plutôt que de la faire disparaître.
    name: "chevauchement ancien: on tranche, on ne jette pas",
    rows: [
      { id: "vieux", startsOn: "2026-08-09", durationDays: 7, createdAt: "2026-08-09T08:00:00Z" },
      { id: "neuf", startsOn: "2026-08-11", durationDays: 5, createdAt: "2026-08-11T08:00:00Z" },
    ],
    today: "2026-08-12",
    expectCurrent: "neuf",
    expectNext: null,
    expectElapsed: [],
    expectAmbiguous: ["vieux"],
  },
  {
    name: "le premier jour compte comme dedans",
    rows: [{ id: "a", startsOn: "2026-08-12", durationDays: 1 }],
    today: "2026-08-12",
    expectCurrent: "a",
    expectNext: null,
    expectElapsed: [],
    expectAmbiguous: [],
  },
  {
    name: "le dernier jour compte comme dedans",
    rows: [{ id: "a", startsOn: "2026-08-10", durationDays: 3 }],
    today: "2026-08-12",
    expectCurrent: "a",
    expectNext: null,
    expectElapsed: [],
    expectAmbiguous: [],
  },
  {
    name: "le lendemain du dernier jour est écoulé",
    rows: [{ id: "a", startsOn: "2026-08-10", durationDays: 3 }],
    today: "2026-08-13",
    expectCurrent: null,
    expectNext: null,
    expectElapsed: ["a"],
    expectAmbiguous: [],
  },
];

/** Résolution d'intention: le même tableau des deux côtés. */
export interface RequestFixtureCase {
  name: string;
  today: string;
  request:
    | { kind: "until_sunday" }
    | { kind: "days"; count: number }
    | { kind: "exact"; startsOn: string; durationDays: number };
  /** `null` = doit jeter. */
  expect: { startsOn: string; durationDays: number } | null;
}

export const MEAL_WINDOW_REQUEST_FIXTURES: readonly RequestFixtureCase[] = [
  {
    name: "until sunday un jeudi: 4 jours",
    today: "2026-08-13",
    request: { kind: "until_sunday" },
    expect: { startsOn: "2026-08-13", durationDays: 4 },
  },
  {
    name: "until sunday un lundi: la semaine entière",
    today: "2026-08-10",
    request: { kind: "until_sunday" },
    expect: { startsOn: "2026-08-10", durationDays: 7 },
  },
  {
    // AFFIRMÉ EXPLICITEMENT, pas laissé au hasard: `daysUntilSunday` ne déborde
    // pas volontairement sur la semaine suivante, et le sélecteur doit le dire
    // plutôt que d'avoir l'air cassé.
    name: "until sunday un dimanche: UN jour",
    today: "2026-08-16",
    request: { kind: "until_sunday" },
    expect: { startsOn: "2026-08-16", durationDays: 1 },
  },
  {
    name: "7 jours depuis aujourd'hui",
    today: "2026-08-13",
    request: { kind: "days", count: 7 },
    expect: { startsOn: "2026-08-13", durationDays: 7 },
  },
  {
    name: "8 jours: refusé, un jeton désignerait deux dates",
    today: "2026-08-13",
    request: { kind: "days", count: 8 },
    expect: null,
  },
  {
    name: "zéro jour: refusé",
    today: "2026-08-13",
    request: { kind: "days", count: 0 },
    expect: null,
  },
  {
    name: "exact dans le futur: accepté",
    today: "2026-08-13",
    request: { kind: "exact", startsOn: "2026-08-17", durationDays: 7 },
    expect: { startsOn: "2026-08-17", durationDays: 7 },
  },
  {
    name: "exact aujourd'hui: accepté",
    today: "2026-08-13",
    request: { kind: "exact", startsOn: "2026-08-13", durationDays: 2 },
    expect: { startsOn: "2026-08-13", durationDays: 2 },
  },
  {
    name: "exact dans le passé: refusé",
    today: "2026-08-13",
    request: { kind: "exact", startsOn: "2026-08-12", durationDays: 2 },
    expect: null,
  },
];
