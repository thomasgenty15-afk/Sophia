/**
 * FF-056 — LE DÉTECTEUR, ÉPROUVÉ SUR SÉRIES SYNTHÉTIQUES.
 *
 * Ce fichier a trois moitiés (le compte est faux, c'est voulu — la troisième
 * est celle qu'on oublie):
 *
 *   1. LES SEUILS SONT PINNÉS. Chaque constante exportée a un test qui la lit.
 *      Sans ça, un test « paramétré par sa propre constante » reste vert quand
 *      on change le calibrage — la cicatrice `test-parameterized-by-its-own-
 *      constant` de ce dépôt. Ici les séries sont écrites en KILOS LITTÉRAUX:
 *      baisser un seuil casse un test, ce qui est le but.
 *   2. LES VERDICTS, un par un, sur des séries construites à la main.
 *   3. LA SYMÉTRIE. Chaque cas de perte a son jumeau en prise de masse
 *      (fiche §11). Une branche qui ne servirait que `fat_loss` est une
 *      fonctionnalité qui présuppose la perte, et la fiche l'interdit.
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import type { DatedBodyMeasure } from "./body_measure_series.ts";
import {
  detectWeightDivergence,
  DIVERGENCE_FLAT_BAND_PCT,
  DIVERGENCE_LOOKBACK_DAYS,
  DIVERGENCE_MIN_MOVE_PCT,
  DIVERGENCE_MIN_STEP_PCT,
  DIVERGENCE_MIN_WEEKS_AWAY,
  DIVERGENCE_MIN_WEEKS_STALLED,
  DIVERGENCE_PROGRESS_OK_PCT,
  DIVERGENCE_STALE_DAYS,
  WEIGHT_DIVERGENCE_DETECTOR_VERSION,
  WEIGHT_DIVERGENCE_VERDICTS,
  weightGoalDirection,
} from "./weight_divergence.ts";

// ---------------------------------------------------------------------------
// LES FIXTURES — forme de PRODUCTION, pas une forme de commodité
// ---------------------------------------------------------------------------

/**
 * Une pesée, exactement comme `loadBodyMeasures` la rend.
 *
 * ⚠️ `measuredAt` est obligatoire et daté sur `localDate`. Le dépôt a déjà payé
 * une fixture qui parlait une autre langue que la production (`cookOn` vs
 * `cook_on`, quatorze tests verts et faux). Ici, `dailyValues` JETTE sur un
 * `measuredAt` absent — c'est ce qui garantit qu'une fixture bâclée échoue au
 * lieu de valider un détecteur imaginaire.
 */
function measure(
  localDate: string,
  valueSi: number,
  opts: { hour?: number; kind?: "weight" | "waist" } = {},
): DatedBodyMeasure {
  const hour = String(opts.hour ?? 8).padStart(2, "0");
  return {
    localDate,
    kind: opts.kind ?? "weight",
    valueSi,
    measuredAt: `${localDate}T${hour}:00:00.000Z`,
  };
}

/** N semaines consécutives, une pesée le lundi de chacune. */
function weeklySeries(firstMonday: string, values: readonly number[]): DatedBodyMeasure[] {
  return values.map((value, index) => measure(shift(firstMonday, index * 7), value));
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 2026-08-03 est un LUNDI. Toutes les séries de ce fichier partent de là. */
const MONDAY = "2026-08-03";

// ---------------------------------------------------------------------------
// 1. LES SEUILS SONT PINNÉS
// ---------------------------------------------------------------------------

Deno.test("FF-056 · les seuils exportés sont ceux du rapport", () => {
  assertEquals(DIVERGENCE_LOOKBACK_DAYS, 56);
  assertEquals(DIVERGENCE_MIN_WEEKS_AWAY, 3);
  assertEquals(DIVERGENCE_MIN_WEEKS_STALLED, 5);
  assertEquals(DIVERGENCE_MIN_MOVE_PCT, 1.2);
  assertEquals(DIVERGENCE_MIN_STEP_PCT, 0.1);
  assertEquals(DIVERGENCE_PROGRESS_OK_PCT, 0.5);
  assertEquals(DIVERGENCE_FLAT_BAND_PCT, 0.5);
  assertEquals(DIVERGENCE_STALE_DAYS, 10);
  assertEquals(WEIGHT_DIVERGENCE_DETECTOR_VERSION, "ff056.v1");
});

Deno.test("FF-056 · la stagnation exige STRICTEMENT plus de semaines que l'éloignement", () => {
  // Ce n'est pas un détail de calibrage: c'est ce qui empêche un plateau de
  // trois semaines — événement normal sous un plan de perte — de convoquer.
  if (DIVERGENCE_MIN_WEEKS_STALLED <= DIVERGENCE_MIN_WEEKS_AWAY) {
    throw new Error(
      "un plateau ne doit jamais déclencher aussi vite qu'un éloignement",
    );
  }
});

Deno.test("FF-056 · la liste des verdicts est fermée et contient la bonne fin", () => {
  assertEquals(WEIGHT_DIVERGENCE_VERDICTS.length, 8);
  assertEquals(WEIGHT_DIVERGENCE_VERDICTS.includes("divergence_established"), true);
  assertEquals(WEIGHT_DIVERGENCE_VERDICTS.includes("aligned"), true);
});

// ---------------------------------------------------------------------------
// LA DIRECTION DE L'OBJECTIF
// ---------------------------------------------------------------------------

Deno.test("FF-056 · seuls fat_loss et muscle_gain portent une direction", () => {
  assertEquals(weightGoalDirection("fat_loss"), "down");
  assertEquals(weightGoalDirection("muscle_gain"), "up");
  // La troisième valeur du CHECK `student_goals_goal_check`.
  assertEquals(weightGoalDirection("maintenance"), null);
  // ⚠️ ET LES TROIS RETIRÉES LE 2026-08-18, QUI RESTENT ICI EXPRÈS. La base
  // ne les accepte plus, mais cette fonction lit un `string` venu d'ailleurs
  // (un jsonb, un client plus vieux). Les retirer du banc rendrait le jour où
  // quelqu'un ajoute un repli muet indiscernable du jour d'avant.
  assertEquals(weightGoalDirection("recomposition"), null);
  assertEquals(weightGoalDirection("performance"), null);
  assertEquals(weightGoalDirection("health"), null);
  // Et tout ce qui n'existe pas.
  assertEquals(weightGoalDirection(null), null);
  assertEquals(weightGoalDirection(undefined), null);
  assertEquals(weightGoalDirection(""), null);
  assertEquals(weightGoalDirection("constructor"), null);
  assertEquals(weightGoalDirection("__proto__"), null);
});

Deno.test("FF-056 · un maintien qui stagne n'est JAMAIS une divergence", () => {
  // Le mode de défaillance le plus indéfendable de cette fonctionnalité: poser
  // la question à quelqu'un dont le plan se déroule exactement comme prévu.
  const flat = weeklySeries(MONDAY, [80.0, 80.0, 80.1, 79.9, 80.0, 80.0]);
  const result = detectWeightDivergence({
    measures: flat,
    goal: "maintenance",
    todayLocalDate: shift(MONDAY, 36),
  });
  assertEquals(result.verdict, "no_directional_goal");
  assertEquals(result.direction, null);
  assertEquals(result.shape, null);
});

// ---------------------------------------------------------------------------
// 2. LES VERDICTS
// ---------------------------------------------------------------------------

Deno.test("FF-056 · aucune mesure ⇒ insufficient_data, jamais une exception", () => {
  const result = detectWeightDivergence({
    measures: [],
    goal: "fat_loss",
    todayLocalDate: MONDAY,
  });
  assertEquals(result.verdict, "insufficient_data");
  assertEquals(result.window.length, 0);
  assertEquals(result.daysSinceLastMeasure, null);
});

Deno.test("FF-056 · LE CAS FONDATEUR — trois semaines qui montent sous un plan de perte", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 80.5, 81.2]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(result.verdict, "divergence_established");
  assertEquals(result.shape, "moving_away");
  assertEquals(result.direction, "down");
  assertEquals(result.progressPct, -1.5);
  assertEquals(result.window.length, 3);
  assertEquals(result.detectorVersion, "ff056.v1");
});

Deno.test("FF-056 · §8 — UNE SEULE pesée en hausse dans une série stable ⇒ rien", () => {
  // 80,0 / 80,0 / 80,0 / 81,0. L'amplitude totale des trois derniers points
  // FRANCHIT le seuil (-1,25 % ≤ -1,2 %) — c'est exactement le piège. Ce qui
  // sauve, c'est le test pas à pas: le premier pas est plat, donc la série
  // n'est pas un éloignement, c'est un saut.
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 80.0, 80.0, 81.0]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 22),
  });
  assertEquals(result.verdict, "noisy");
  assertEquals(result.shape, null);
});

Deno.test("FF-056 · bruit hydrique sans tendance ⇒ noisy", () => {
  // Oscillation ±1 kg, la signature de l'eau et du sel. Aucun déclenchement.
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 80.9, 80.1, 80.8, 80.2]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 29),
  });
  assertEquals(result.verdict, "noisy");
  assertEquals(result.shape, null);
});

Deno.test("FF-056 · une perte réelle ⇒ aligned, et rien ne part", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 79.4, 78.9]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(result.verdict, "aligned");
  assertEquals(result.progressPct, 1.37);
});

Deno.test("FF-056 · deux points seulement ⇒ wrong_direction_but_single", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 81.5]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 8),
  });
  assertEquals(result.verdict, "wrong_direction_but_single");
  assertEquals(result.window.length, 2);
});

Deno.test("FF-056 · un seul point ⇒ insufficient_data", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 1),
  });
  assertEquals(result.verdict, "insufficient_data");
});

Deno.test("FF-056 · des semaines TROUÉES ⇒ irregular_measurements, jamais un constat", () => {
  // S1, S3, S4 mesurées; S2 sautée. Trois points dans la fenêtre, mais la
  // suite consécutive de fin n'en fait que deux. Comparer un poids de S1 à un
  // poids de S4 et appeler ça « trois mesures consécutives » serait le mensonge
  // le plus facile à commettre ici.
  const holed = [
    ...weeklySeries(MONDAY, [80.0]),
    ...weeklySeries(shift(MONDAY, 14), [80.6, 81.4]),
  ];
  const result = detectWeightDivergence({
    measures: holed,
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 22),
  });
  assertEquals(result.verdict, "irregular_measurements");
});

Deno.test("FF-056 · la dernière pesée trop vieille ⇒ stale_measurements", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 80.5, 81.2]),
    // 11 jours après la dernière pesée: DIVERGENCE_STALE_DAYS + 1.
    todayLocalDate: shift(MONDAY, 14 + DIVERGENCE_STALE_DAYS + 1),
    goal: "fat_loss",
  });
  assertEquals(result.verdict, "stale_measurements");
  assertEquals(result.daysSinceLastMeasure, DIVERGENCE_STALE_DAYS + 1);
  // ⚠️ Le constat existait pourtant. C'est délibéré: on ne parle jamais du
  // corps de quelqu'un sur des données périmées, et c'est aussi ce qui fait que
  // le flow se tait tout seul si la personne cesse de se peser (§10).
  const fresh = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 80.5, 81.2]),
    todayLocalDate: shift(MONDAY, 14 + DIVERGENCE_STALE_DAYS),
    goal: "fat_loss",
  });
  assertEquals(fresh.verdict, "divergence_established");
});

Deno.test("FF-056 · un plateau de TROIS semaines sous perte ⇒ rien", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 80.0, 80.0]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(result.verdict, "noisy");
});

Deno.test("FF-056 · un plateau de CINQ semaines sous perte ⇒ divergence stalled", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 80.1, 79.9, 80.0, 80.2]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 29),
  });
  assertEquals(result.verdict, "divergence_established");
  assertEquals(result.shape, "stalled");
  assertEquals(result.window.length, DIVERGENCE_MIN_WEEKS_STALLED);
});

Deno.test("FF-056 · cinq semaines qui SORTENT de la bande plate ⇒ noisy, pas stalled", () => {
  // 80,0 puis 80,7 (0,875 % > 0,5 %) puis retour: ce n'est pas un plateau,
  // c'est du bruit, et un plateau qui se laisse traverser n'en est pas un.
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [80.0, 80.7, 79.9, 80.0, 80.1]),
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 29),
  });
  assertEquals(result.verdict, "noisy");
});

// ---------------------------------------------------------------------------
// 3. LA SYMÉTRIE — fiche §11, « aucune formulation ne présuppose la perte »
// ---------------------------------------------------------------------------

Deno.test("FF-056 · SYMÉTRIE — sous muscle_gain, le poids qui DESCEND est la divergence", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [70.0, 69.6, 69.1]),
    goal: "muscle_gain",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(result.verdict, "divergence_established");
  assertEquals(result.shape, "moving_away");
  assertEquals(result.direction, "up");
});

Deno.test("FF-056 · SYMÉTRIE — sous muscle_gain, le poids qui MONTE est aligné", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [70.0, 70.5, 71.0]),
    goal: "muscle_gain",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(result.verdict, "aligned");
});

Deno.test("FF-056 · SYMÉTRIE — une prise de masse qui STAGNE cinq semaines diverge", () => {
  const result = detectWeightDivergence({
    measures: weeklySeries(MONDAY, [70.0, 70.1, 69.9, 70.0, 70.2]),
    goal: "muscle_gain",
    todayLocalDate: shift(MONDAY, 29),
  });
  assertEquals(result.verdict, "divergence_established");
  assertEquals(result.shape, "stalled");
});

Deno.test("FF-056 · SYMÉTRIE — la même série rend des verdicts OPPOSÉS selon l'objectif", () => {
  const rising = weeklySeries(MONDAY, [80.0, 80.5, 81.2]);
  const today = shift(MONDAY, 15);
  assertEquals(
    detectWeightDivergence({ measures: rising, goal: "fat_loss", todayLocalDate: today })
      .verdict,
    "divergence_established",
  );
  assertEquals(
    detectWeightDivergence({ measures: rising, goal: "muscle_gain", todayLocalDate: today })
      .verdict,
    "aligned",
  );
});

// ---------------------------------------------------------------------------
// LES ENTRÉES QUI MENTENT
// ---------------------------------------------------------------------------

Deno.test("FF-056 · la CORRECTION du même jour gagne (87 puis « pardon, 78 »)", () => {
  // `dailyValues` fait déjà ce départage; le test existe pour que la
  // dépendance soit VÉRIFIÉE ici et pas supposée. Sans lui, moyenner les brutes
  // écrirait 82,5 dans la semaine — la moyenne d'un chiffre et de son démenti.
  const withTypo = [
    ...weeklySeries(MONDAY, [80.0, 80.5]),
    measure(shift(MONDAY, 14), 87.0, { hour: 8 }),
    measure(shift(MONDAY, 14), 81.2, { hour: 9 }),
  ];
  const result = detectWeightDivergence({
    measures: withTypo,
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(result.verdict, "divergence_established");
  assertEquals(result.window[2].value, 81.2);
});

Deno.test("FF-056 · le tour de taille n'entre PAS dans le constat de poids", () => {
  const mixed = [
    ...weeklySeries(MONDAY, [80.0, 80.5, 81.2]),
    measure(MONDAY, 95, { kind: "waist" }),
    measure(shift(MONDAY, 7), 60, { kind: "waist" }),
  ];
  const result = detectWeightDivergence({
    measures: mixed,
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(result.verdict, "divergence_established");
  assertEquals(result.window.every((p) => p.value > 79), true);
});

Deno.test("FF-056 · une pesée HORS fenêtre de rétrospection n'est pas la base", () => {
  // Une pesée d'il y a un trimestre, plus légère, ferait de toute la série une
  // « divergence » si elle servait de référence. La fenêtre la jette.
  const old = measure(shift(MONDAY, -(DIVERGENCE_LOOKBACK_DAYS + 7)), 70.0);
  const result = detectWeightDivergence({
    measures: [old, ...weeklySeries(MONDAY, [80.0, 79.4, 78.9])],
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(result.verdict, "aligned");
});

Deno.test("FF-056 · une date malformée JETTE — elle ne dégrade pas en « pas de mesure »", () => {
  assertThrows(
    () =>
      detectWeightDivergence({
        measures: [{
          localDate: "03/08/2026",
          kind: "weight",
          valueSi: 80,
          measuredAt: `${MONDAY}T08:00:00Z`,
        }],
        goal: "fat_loss",
        todayLocalDate: MONDAY,
      }),
    Error,
    "localDate",
  );
  assertThrows(
    () =>
      detectWeightDivergence({
        measures: [],
        goal: "fat_loss",
        todayLocalDate: "pas-une-date",
      }),
    Error,
    "todayLocalDate",
  );
});

Deno.test("FF-056 · un `measuredAt` absent JETTE (la fixture doit parler production)", () => {
  assertThrows(
    () =>
      detectWeightDivergence({
        measures: [
          { localDate: MONDAY, kind: "weight", valueSi: 80 } as DatedBodyMeasure,
        ],
        goal: "fat_loss",
        todayLocalDate: MONDAY,
      }),
    Error,
  );
});

// ---------------------------------------------------------------------------
// LA PURETÉ — aucune horloge, aucun effet de bord
// ---------------------------------------------------------------------------

Deno.test("FF-056 · le détecteur est pur: même entrée, même sortie, entrée intacte", () => {
  const measures = weeklySeries(MONDAY, [80.0, 80.5, 81.2]);
  const snapshot = JSON.stringify(measures);
  const a = detectWeightDivergence({
    measures,
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  const b = detectWeightDivergence({
    measures,
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  assertEquals(JSON.stringify(measures), snapshot);
});

Deno.test("FF-056 · le verdict change avec `todayLocalDate`, jamais avec l'horloge", () => {
  const measures = weeklySeries(MONDAY, [80.0, 80.5, 81.2]);
  const near = detectWeightDivergence({
    measures,
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 15),
  });
  const far = detectWeightDivergence({
    measures,
    goal: "fat_loss",
    todayLocalDate: shift(MONDAY, 60),
  });
  assertEquals(near.verdict, "divergence_established");
  assertEquals(far.verdict, "stale_measurements");
});
