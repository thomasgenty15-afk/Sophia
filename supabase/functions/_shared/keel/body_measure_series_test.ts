/**
 * FF-031 — LA DÉRIVATION, ET LA PREUVE QU'ELLE NE DÉSARME RIEN.
 *
 * Ce fichier a deux moitiés, et la seconde est celle qui compte.
 *
 *   1. LA DÉRIVATION EN ELLE-MÊME — dernier du jour, moyenne des jours, union
 *      des deux sources, et tout ce qui est incohérent qui jette.
 *   2. LA PARITÉ AVEC LE PLANCHER TCA — les fixtures de
 *      `restriction_guard_test.ts` sont REJOUÉES à travers la dérivation, et
 *      doivent produire le même verdict. C'est la seule façon d'affirmer
 *      « le contrat du garde ne bouge pas » (FF-031 R2) autrement qu'en le
 *      croyant: le garde ici est le VRAI, pas un double.
 *
 * Le mode de défaillance que ces cas existent pour attraper est nommé dans
 * FF-031 §7 — « le plancher TCA ne mord plus et personne ne le voit ». Il est
 * silencieux par construction: une série tronquée ne lève rien, elle rend
 * `restriction_flag: false`.
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  type DatedBodyMeasure,
  dailyValues,
  deriveWeeklyOutcomeSamples,
  isoWeekStartOf,
  weeklyBodyPoints,
  type WeeklyContextRow,
} from "./body_measure_series.ts";
import {
  evaluateRestrictionGuard,
  type WeeklyOutcomeSample,
} from "./restriction_guard.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function m(
  localDate: string,
  valueSi: number,
  patch: Partial<DatedBodyMeasure> = {},
): DatedBodyMeasure {
  return {
    localDate,
    kind: "weight",
    valueSi,
    measuredAt: `${localDate}T07:00:00+02:00`,
    ...patch,
  };
}

function ctx(
  weekStartDate: string,
  selfRatedAdherence: number | null = null,
  loggingCoverageDays: number | null = null,
): WeeklyContextRow {
  return { weekStartDate, selfRatedAdherence, loggingCoverageDays };
}

function guard(weekly_outcomes: WeeklyOutcomeSample[]) {
  return evaluateRestrictionGuard({
    as_of_local_date: "2026-08-03",
    weekly_outcomes,
    energy_days: [],
    texts: [],
  });
}

// ---------------------------------------------------------------------------
// Le lundi — la clé de semaine, fabriquée à un seul endroit
// ---------------------------------------------------------------------------

Deno.test("isoWeekStartOf — chaque jour de la semaine retombe sur SON lundi", () => {
  // 2026-08-03 est un lundi; 2026-08-09 le dimanche qui le suit.
  for (const day of [
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ]) {
    assertEquals(isoWeekStartOf(day), "2026-08-03");
  }
  // Le lundi suivant est bien un autre lundi, à sept jours.
  assertEquals(isoWeekStartOf("2026-08-10"), "2026-08-10");
});

Deno.test("isoWeekStartOf — une date illisible JETTE, elle ne vaut pas aujourd'hui", () => {
  assertThrows(() => isoWeekStartOf("03/08/2026"));
  assertThrows(() => isoWeekStartOf("2026-02-30"));
  assertThrows(() => isoWeekStartOf(""));
});

// ---------------------------------------------------------------------------
// TEMPS 1 — par jour, la dernière gagne
// ---------------------------------------------------------------------------

Deno.test("un jour = une valeur, et c'est la DERNIÈRE mesure du jour", () => {
  const days = dailyValues([
    m("2026-08-05", 87.0, { measuredAt: "2026-08-05T08:00:00+02:00" }),
    m("2026-08-05", 78.0, { measuredAt: "2026-08-05T08:02:00+02:00" }),
  ], "weight");
  assertEquals(days, [{ localDate: "2026-08-05", value: 78.0 }]);
});

Deno.test("LA CORRECTION NE SE MOYENNE PAS AVEC CE QU'ELLE CORRIGE", () => {
  // « 87… pardon, 78 ». Moyenner les mesures BRUTES donnerait 82,5 — la moyenne
  // d'un chiffre et de son démenti. C'est ce cas qui impose les deux temps.
  const points = weeklyBodyPoints([
    m("2026-08-05", 87.0, { measuredAt: "2026-08-05T08:00:00+02:00" }),
    m("2026-08-05", 78.0, { measuredAt: "2026-08-05T08:02:00+02:00" }),
  ], "weight");
  assertEquals(points.length, 1);
  assertEquals(points[0].value, 78.0);
  assertEquals(points[0].days, 1);
});

Deno.test("à instant ÉGAL, la dernière de la liste gagne (ordre stable de l'appelant)", () => {
  const days = dailyValues([
    m("2026-08-05", 87.0, { measuredAt: "2026-08-05T08:00:00Z" }),
    m("2026-08-05", 78.0, { measuredAt: "2026-08-05T08:00:00Z" }),
  ], "weight");
  assertEquals(days[0].value, 78.0);
});

Deno.test("une mesure ARRIVÉE dans le désordre ne gagne pas parce qu'elle est arrivée après", () => {
  const days = dailyValues([
    m("2026-08-05", 78.0, { measuredAt: "2026-08-05T20:00:00+02:00" }),
    m("2026-08-05", 87.0, { measuredAt: "2026-08-05T08:00:00+02:00" }),
  ], "weight");
  assertEquals(days[0].value, 78.0);
});

Deno.test("les grandeurs ne se mélangent pas — un tour de taille n'est pas un poids", () => {
  const measures = [
    m("2026-08-05", 78.0),
    m("2026-08-05", 84.0, { kind: "waist" }),
  ];
  assertEquals(dailyValues(measures, "weight"), [
    { localDate: "2026-08-05", value: 78.0 },
  ]);
  assertEquals(dailyValues(measures, "waist"), [
    { localDate: "2026-08-05", value: 84.0 },
  ]);
});

// ---------------------------------------------------------------------------
// TEMPS 2 — par semaine, la moyenne des jours
// ---------------------------------------------------------------------------

Deno.test("une semaine = la MOYENNE de ses jours, au dixième", () => {
  const points = weeklyBodyPoints([
    m("2026-08-03", 98.5),
    m("2026-08-05", 98.1),
    m("2026-08-07", 97.9),
  ], "weight");
  assertEquals(points, [{
    weekStart: "2026-08-03",
    value: 98.2, // (98.5 + 98.1 + 97.9) / 3 = 98.1666… -> 98.2
    days: 3,
    lastLocalDate: "2026-08-07",
  }]);
});

Deno.test("PARITÉ — une semaine à UNE mesure rend exactement cette mesure", () => {
  // La garantie qui rend ce chantier sûr: là où rien n'a changé, rien ne change.
  for (const value of [70.0, 68.7, 97.9, 25, 400]) {
    const points = weeklyBodyPoints([m("2026-08-06", value)], "weight");
    assertEquals(points[0].value, value);
    assertEquals(points[0].days, 1);
  }
});

Deno.test("la date rendue est celle du DERNIER jour mesuré, pas le lundi", () => {
  // Le défaut nommé en FF-031 §1: « week of 3 Aug » affiché sur une mesure du
  // vendredi.
  const points = weeklyBodyPoints([m("2026-08-03", 98.5), m("2026-08-07", 97.9)], "weight");
  assertEquals(points[0].weekStart, "2026-08-03");
  assertEquals(points[0].lastLocalDate, "2026-08-07");
});

Deno.test("les semaines sortent ascendantes, sans doublon, toutes lundi", () => {
  const points = weeklyBodyPoints([
    m("2026-08-09", 97.0), // dimanche de la semaine du 03
    m("2026-07-22", 99.0), // mercredi de la semaine du 20
    m("2026-08-04", 98.0), // mardi de la semaine du 03
  ], "weight");
  assertEquals(points.map((p) => p.weekStart), ["2026-07-20", "2026-08-03"]);
  // L'invariant que `restriction_guard` exige: des écarts multiples de 7.
  const days = points.map((p) => Date.parse(`${p.weekStart}T00:00:00Z`) / 86_400_000);
  assertEquals((days[1] - days[0]) % 7, 0);
});

// ---------------------------------------------------------------------------
// L'UNION — l'endroit où ça casse
// ---------------------------------------------------------------------------

Deno.test("UNION — une semaine qui porte une mesure ENTRE, même sans ligne de revue", () => {
  // L'élève qui ne fait que parler à Sophia. Sans cette union, sa pesée est
  // invisible au plancher TCA — et rien ne le dit.
  const series = deriveWeeklyOutcomeSamples({
    measures: [m("2026-08-05", 78.0)],
    weeks: [],
  });
  assertEquals(series, [{
    week_start_date: "2026-08-03",
    weight_7d_avg_kg: 78.0,
    self_rated_adherence: null,
    logging_coverage_days: null,
  }]);
});

Deno.test("UNION — une semaine qui porte une revue mais aucune mesure entre avec null", () => {
  const series = deriveWeeklyOutcomeSamples({
    measures: [],
    weeks: [ctx("2026-08-03", 9, 2)],
  });
  assertEquals(series, [{
    week_start_date: "2026-08-03",
    weight_7d_avg_kg: null, // « pas reporté » — jamais 0
    self_rated_adherence: 9,
    logging_coverage_days: 2,
  }]);
});

Deno.test("UNION — les deux sources se rejoignent sur la même semaine", () => {
  const series = deriveWeeklyOutcomeSamples({
    measures: [m("2026-08-04", 70.0), m("2026-08-06", 69.0)],
    weeks: [ctx("2026-08-03", 8, 1)],
  });
  assertEquals(series.length, 1);
  assertEquals(series[0], {
    week_start_date: "2026-08-03",
    weight_7d_avg_kg: 69.5,
    self_rated_adherence: 8,
    logging_coverage_days: 1,
  });
});

Deno.test("UNION — semaines disjointes: la série reste ascendante et sans doublon", () => {
  const series = deriveWeeklyOutcomeSamples({
    measures: [m("2026-07-22", 71.0)],
    weeks: [ctx("2026-08-03", 9, 2), ctx("2026-07-06", 5, 6)],
  });
  assertEquals(series.map((s) => s.week_start_date), [
    "2026-07-06",
    "2026-07-20",
    "2026-08-03",
  ]);
  assertEquals(series.map((s) => s.weight_7d_avg_kg), [null, 71.0, null]);
  // Et le garde l'accepte: c'est ça, l'invariant de série hebdomadaire.
  assertEquals(guard(series).restriction_flag, false);
});

Deno.test("UNION — une clé de semaine mal posée est RECALÉE sur son lundi, pas refusée", () => {
  // Une ceinture qui JETTE sur une donnée héritée est une ceinture qui ne mord
  // pas. Le lundi de la semaine est la seule lecture défendable.
  const series = deriveWeeklyOutcomeSamples({
    measures: [],
    weeks: [ctx("2026-08-09", 7, 4)], // un dimanche
  });
  assertEquals(series.length, 1);
  assertEquals(series[0].week_start_date, "2026-08-03");
  assertEquals(series[0].self_rated_adherence, 7);
});

Deno.test("UNION — deux lignes de revue sur le même lundi ne font pas un doublon", () => {
  const series = deriveWeeklyOutcomeSamples({
    measures: [],
    weeks: [ctx("2026-08-03", 4, 1), ctx("2026-08-05", 9, 2)],
  });
  assertEquals(series.length, 1);
  // La dernière gagne: l'appelant a déjà trié et dédoublonné par created_at.
  assertEquals(series[0].self_rated_adherence, 9);
  // Et surtout: le garde ne jette pas sur un doublon qui n'existe pas.
  assertEquals(guard(series).restriction_flag, false);
});

// ---------------------------------------------------------------------------
// PARITÉ AVEC LE PLANCHER TCA — le garde ici est le VRAI
// ---------------------------------------------------------------------------

Deno.test("PARITÉ — le déclencheur 1 mord à travers la dérivation (une pesée/semaine)", () => {
  // Fixture de `restriction_guard_test.ts`: 70,0 -> 68,0 kg en 14 jours =
  // 1,43 %/semaine. Rejouée en mesures datées, elle doit mordre pareil.
  const series = deriveWeeklyOutcomeSamples({
    measures: [m("2026-07-20", 70.0), m("2026-08-03", 68.0)],
    weeks: [],
  });
  const result = guard(series);
  assertEquals(result.triggers.map((t) => t.code), ["rapid_weight_loss"]);
  assertEquals(result.triggers[0].evidence.weekly_loss_pct, 1.43);
});

Deno.test("PARITÉ — le déclencheur 1 reste DÉSARMÉ juste sous le seuil", () => {
  // 70,0 -> 68,6 = 1,0 %/semaine. Sous 1,2: rien.
  const series = deriveWeeklyOutcomeSamples({
    measures: [m("2026-07-20", 70.0), m("2026-08-03", 68.6)],
    weeks: [],
  });
  assertEquals(guard(series).restriction_flag, false);
});

Deno.test("PARITÉ — le déclencheur 4 mord: la dérivation ne perd pas l'adhérence", () => {
  // OVERCLAIM_WEEKS de `restriction_guard_test.ts`, réparti sur les deux
  // sources: le POIDS vient des mesures, l'AUTO-ÉVALUATION et la COUVERTURE
  // viennent de `weekly_reviews`. C'est exactement le partage que la production
  // aura, et c'est lui que l'union existe pour recoudre.
  const series = deriveWeeklyOutcomeSamples({
    measures: [
      m("2026-07-20", 70.0),
      m("2026-07-27", 69.5),
      m("2026-08-03", 68.7),
    ],
    weeks: [ctx("2026-07-20", 9, 2), ctx("2026-07-27", 9, 2), ctx("2026-08-03", 9, 2)],
  });
  const result = guard(series);
  assertEquals(result.triggers.map((t) => t.code), [
    "overclaimed_adherence_with_hidden_logging",
  ]);
  const evidence = result.triggers[0].evidence;
  assertEquals(evidence.latest_weekly_loss_pct, 1.15);
  assertEquals(evidence.previous_weekly_loss_pct, 0.71);
});

Deno.test("LA MOITIÉ QUI EST LE CHANTIER — une perte quotidienne est vue", () => {
  // Un élève qui se pèse tous les jours et perd vite. AVANT ce chantier, une
  // seule de ces quatorze pesées survivait — celle du dernier geste — et la
  // ceinture comparait deux jours pris au hasard du calendrier.
  const measures: DatedBodyMeasure[] = [];
  const start = Date.parse("2026-07-20T00:00:00Z") / 86_400_000;
  for (let i = 0; i < 15; i++) {
    const day = new Date((start + i) * 86_400_000).toISOString().slice(0, 10);
    // 80 kg qui descendent de 200 g par jour = 1,75 %/semaine.
    measures.push(m(day, Math.round((80 - i * 0.2) * 10) / 10));
  }
  const series = deriveWeeklyOutcomeSamples({ measures, weeks: [] });
  assertEquals(series.map((s) => s.week_start_date), [
    "2026-07-20",
    "2026-07-27",
    "2026-08-03",
  ]);
  const result = guard(series);
  assertEquals(result.triggers.map((t) => t.code), ["rapid_weight_loss"]);
});

Deno.test("LE BRUIT D'UN SEUL JOUR NE FABRIQUE PLUS UNE ALERTE", () => {
  // Poids stable à 80 kg, sauf un lendemain de repas salé (+1,4 kg) au départ
  // et un matin creux (−1,2 kg) à l'arrivée. Sur UNE pesée par semaine, cette
  // paire-là donne 1,6 %/semaine — au-dessus du seuil, sur un poids qui n'a pas
  // bougé. Moyennée sur la semaine, elle ne dit plus rien.
  const noisy = deriveWeeklyOutcomeSamples({
    measures: [m("2026-07-20", 81.4), m("2026-08-03", 78.8)],
    weeks: [],
  });
  assertEquals(guard(noisy).triggers.map((t) => t.code), ["rapid_weight_loss"]);

  const averaged = deriveWeeklyOutcomeSamples({
    measures: [
      m("2026-07-20", 81.4),
      m("2026-07-21", 80.0),
      m("2026-07-22", 79.8),
      m("2026-07-23", 80.2),
      m("2026-08-03", 78.8),
      m("2026-08-04", 80.1),
      m("2026-08-05", 80.0),
      m("2026-08-06", 79.9),
    ],
    weeks: [],
  });
  assertEquals(averaged.map((s) => s.weight_7d_avg_kg), [80.4, 79.7]);
  assertEquals(guard(averaged).restriction_flag, false);
});

Deno.test("la série dérivée est TOUJOURS acceptée par le garde (aucun R7 en aval)", () => {
  // Une dérivation qui ferait jeter le garde éteindrait la ceinture aussi
  // sûrement qu'une série vide, et plus bruyamment. Cas pathologiques exprès:
  // désordre, doublons de jour, deux grandeurs, semaines à trous.
  const series = deriveWeeklyOutcomeSamples({
    measures: [
      m("2026-08-09", 97.0),
      m("2026-06-30", 99.5, { kind: "waist" }),
      m("2026-06-30", 99.0),
      m("2026-08-09", 96.5, { measuredAt: "2026-08-09T21:00:00+02:00" }),
      m("2026-07-15", 98.0),
    ],
    weeks: [ctx("2026-08-09"), ctx("2026-07-13", 3, 0)],
  });
  const result = guard(series);
  assertEquals(result.guard_version, "restriction_guard.v1");
  assertEquals(
    series.map((s) => s.week_start_date),
    ["2026-06-29", "2026-07-13", "2026-08-03"],
  );
});

// ---------------------------------------------------------------------------
// R7 — tout ce qui est incohérent JETTE
// ---------------------------------------------------------------------------

Deno.test("R7 — une date de mesure illisible jette", () => {
  assertThrows(
    () => weeklyBodyPoints([m("05/08/2026", 78)], "weight"),
    Error,
    "localDate",
  );
});

Deno.test("R7 — un measured_at illisible jette au lieu de perdre le départage", () => {
  assertThrows(
    () => weeklyBodyPoints([m("2026-08-05", 78, { measuredAt: "hier matin" })], "weight"),
    Error,
    "measuredAt",
  );
  assertThrows(
    () => weeklyBodyPoints([m("2026-08-05", 78, { measuredAt: "" })], "weight"),
    Error,
    "measuredAt",
  );
});

Deno.test("R7 — une valeur non numérique jette, elle ne vaut pas zéro", () => {
  assertThrows(
    () => weeklyBodyPoints([m("2026-08-05", Number.NaN)], "weight"),
    Error,
    "valueSi",
  );
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => weeklyBodyPoints([m("2026-08-05", "" as any)], "weight"),
    Error,
    "valueSi",
  );
});

Deno.test("R7 — une grandeur inconnue jette, y compris quand on lit l'AUTRE grandeur", () => {
  // Sinon le défaut serait intermittent: visible en lisant le poids, invisible
  // en lisant le tour de taille, sur exactement la même ligne cassée.
  // deno-lint-ignore no-explicit-any
  const broken = [m("2026-08-05", 78, { kind: "hips" as any })];
  assertThrows(() => weeklyBodyPoints(broken, "weight"), Error, "kind");
  assertThrows(() => weeklyBodyPoints(broken, "waist"), Error, "kind");
});

Deno.test("R7 — des entrées absentes jettent au lieu de valoir « pas de mesure »", () => {
  // deno-lint-ignore no-explicit-any
  assertThrows(() => dailyValues(null as any, "weight"), Error, "measures");
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => deriveWeeklyOutcomeSamples({ measures: [], weeks: null as any }),
    Error,
    "weeks",
  );
});

Deno.test("FAUSSE PRÉMISSE — aucune mesure, aucune revue: une série vide, pas une erreur", () => {
  const series = deriveWeeklyOutcomeSamples({ measures: [], weeks: [] });
  assertEquals(series, []);
  assertEquals(guard(series).restriction_flag, false);
});
