import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";
import {
  activityPopulationVerdict,
  activitySourceCensus,
  censusMouthOf,
  crossedShareGate,
  histogramTotal,
  isNamedActivitySource,
  tallyActivitySource,
} from "./activity_population.ts";
import { ACTIVITY_FACTOR_SOURCES, activityFactorOf } from "./meal_envelope.ts";
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  DAY_ACTIVITY_LEVELS,
  SPORT_FREQUENCIES,
} from "./tokens.ts";

// ===========================================================================
// L16′ — CE QUE CE FICHIER GARDE, ET POURQUOI IL NE SUFFIT PAS DE LE RELIRE
//
// L'identité `crossed + legacy + assumed = bouches dimensionnées` TIENT
// aujourd'hui, sur 12 plans sur 12 (2026-08-22, millésime vivant
// `meal.en.v18_one_box_per_group+household.v21_one_box_per_group`). Un lot qui
// s'arrêterait là serait indiscernable d'un lot désarmé — c'est l'amendement
// du §⑨ n° 50, mesuré par `L-1-b`: sur le bon dénominateur, trois seuils
// étaient ATTEINTS AVANT le lot qui prétendait les atteindre.
//
// Ce fichier garde donc les CHEMINS PAR LESQUELS L'IDENTITÉ PEUT SE BRISER,
// pas le chiffre du jour:
//
//   ① une bouche comptée par un histogramme et pas par l'autre;
//   ② ⛔ une bouche perdue par LES DEUX — l'égalité `Σa == Σb` reste vraie,
//      et c'est le seul cas qu'une garde naïve laisse passer;
//   ③ un compteur qui n'a pas tourné, rendu comme « identité tenue »;
//   ④ une QUATRIÈME source rendue par `activityFactorOf` sans seau pour elle;
//   ⑤ une bouche SANS ligne de corps — `assumed` au runtime, INEXISTANTE pour
//      le compteur #6 du tableau de bord. 45 bouches sur 92, mesurées.
//
// ⚠️ ET IL PORTE SON CAS QUI PASSE, en premier et en toutes lettres. Une
// identité qui rougit toujours ressemble à une identité qui marche
// (cicatrice `guards-need-a-passing-case`).
// ===========================================================================

/** La forme de la fixture `V0-C`: 4 bouches, les deux axes saisis pour toutes. */
function fixtureMouths() {
  return [
    censusMouthOf({ dayActivity: "seated", sportFrequency: "3_4", activityLevel: null }),
    censusMouthOf({ dayActivity: "on_feet", sportFrequency: "none", activityLevel: "sedentary" }),
    censusMouthOf({ dayActivity: "physical_job", sportFrequency: "5_plus", activityLevel: null }),
    censusMouthOf({ dayActivity: "seated", sportFrequency: "none", activityLevel: null }),
  ];
}

// ── ① LE CAS QUI PASSE ─────────────────────────────────────────────────────

Deno.test("l'identité TIENT sur la forme mesurée le 2026-08-22 — 4 bouches, crossed 4", () => {
  const census = activitySourceCensus(fixtureMouths());
  assertEquals(census, { crossed: 4, legacy: 0, assumed: 0 });

  // `mouths` tel qu'il est persisté sur les 12 plans du millésime vivant.
  const verdict = activityPopulationVerdict({
    mouths: 4,
    activitySource: census,
    sizingReasons: { sized: 1, minor: 1, no_direction: 2, no_body: 0, no_pace: 0 },
  });
  assertEquals(verdict.bySource, 4);
  assertEquals(verdict.bySizing, 4);
  assertEquals(verdict.uncountedBySource, 0);
  assertEquals(verdict.uncountedBySizing, 0);
  assertEquals(verdict.holds, true);
});

// ── ⑤ LA BOUCHE SANS LIGNE DE CORPS — LE MOT `assumed` A DEUX LECTEURS ─────

Deno.test("une bouche SANS ligne de corps est `assumed`, et l'identité tient encore", () => {
  // ⛔ C'est la population que le compteur #6 de `V0-E′` ne voit pas: il part
  // de `household_member_bodies`, donc d'une LIGNE, pas d'une BOUCHE.
  // Mesuré le 2026-08-22 à 16:12 CEST: 47 corps, 92 bouches, 45 sans corps.
  const census = activitySourceCensus([
    ...fixtureMouths(),
    censusMouthOf(null),
    censusMouthOf(null),
  ]);
  assertEquals(census, { crossed: 4, legacy: 0, assumed: 2 });
  assertEquals(histogramTotal(census), 6);

  const verdict = activityPopulationVerdict({
    mouths: 6,
    activitySource: census,
    sizingReasons: { sized: 1, minor: 1, no_direction: 2, no_body: 2 },
  });
  assertEquals(verdict.holds, true);
});

Deno.test("un axe seul ne suffit PAS — la source retombe sur le cran, sinon sur l'hypothèse", () => {
  // ⚠️ La cascade est celle d'`activityFactorOf`; ce test refuse qu'une
  // recopie ici la desserre (« un axe sur deux, on croise quand même »).
  assertEquals(
    activitySourceCensus([
      censusMouthOf({ dayActivity: "seated", sportFrequency: null, activityLevel: "trains_some" }),
      censusMouthOf({ dayActivity: null, sportFrequency: "3_4", activityLevel: null }),
      censusMouthOf({ dayActivity: null, sportFrequency: null, activityLevel: "on_feet" }),
    ]),
    { crossed: 0, legacy: 2, assumed: 1 },
  );
});

// ── ① UNE BOUCHE COMPTÉE D'UN CÔTÉ ET PAS DE L'AUTRE ──────────────────────

Deno.test("une bouche que `activity_source` ne compte pas ROUGIT", () => {
  const verdict = activityPopulationVerdict({
    mouths: 4,
    activitySource: { crossed: 3, legacy: 0, assumed: 0 },
    sizingReasons: { sized: 1, minor: 1, no_direction: 2 },
  });
  assertEquals(verdict.uncountedBySource, 1);
  assertEquals(verdict.holds, false);
});

Deno.test("une bouche que `box_sizing.mouths` ne compte pas ROUGIT", () => {
  // C'est le `if (!sizing) continue;` d'`index.ts`, le jour où il mord.
  const verdict = activityPopulationVerdict({
    mouths: 4,
    activitySource: { crossed: 4, legacy: 0, assumed: 0 },
    sizingReasons: { sized: 1, minor: 1, no_direction: 1 },
  });
  assertEquals(verdict.uncountedBySizing, 1);
  assertEquals(verdict.holds, false);
});

// ── ② ⛔ LE CAS QU'UNE GARDE NAÏVE LAISSE PASSER ──────────────────────────

Deno.test("⛔ les DEUX histogrammes perdent la même bouche: `Σa == Σb` est VRAI, l'identité est FAUSSE", () => {
  const activitySource = { crossed: 3, legacy: 0, assumed: 0 };
  const sizingReasons = { sized: 1, minor: 1, no_direction: 1 };
  // L'égalité naïve — celle qu'on écrirait par réflexe — ne voit RIEN.
  assertEquals(histogramTotal(activitySource), histogramTotal(sizingReasons));
  // Le témoin indépendant (`member_count`) la voit.
  const verdict = activityPopulationVerdict({ mouths: 4, activitySource, sizingReasons });
  assertEquals(verdict.uncountedBySource, 1);
  assertEquals(verdict.uncountedBySizing, 1);
  assertEquals(verdict.holds, false);
});

// ── ③ LE COMPTEUR QUI N'A PAS TOURNÉ N'EST PAS UNE IDENTITÉ TENUE ─────────

Deno.test("compteur absent ⇒ `holds` FAUX et `uncounted` NUL — jamais zéro", () => {
  // 46 plans foyer d'avant le 2026-08-20 portent `mouths` sans
  // `activity_source`; les 79 plans solo ne portent aucun `box_sizing`.
  const sansSource = activityPopulationVerdict({
    mouths: 4,
    activitySource: null,
    sizingReasons: { sized: 1, minor: 1, no_direction: 2 },
  });
  assertEquals(sansSource.bySource, null);
  assertEquals(sansSource.uncountedBySource, null);
  assertEquals(sansSource.holds, false);

  const solo = activityPopulationVerdict({ mouths: 1, activitySource: null, sizingReasons: null });
  assertEquals(solo.holds, false);
  assertEquals(solo.uncountedBySizing, null);
});

// ── ④ LA QUATRIÈME SOURCE — SUR LA VRAIE FONCTION, PAS SUR UNE MAQUETTE ───

Deno.test("⛔ AUCUNE quatrième source n'existe: tout le produit cartésien des entrées", () => {
  // Exhaustif, pas échantillonné: 3 crans de journée × 4 crans de sport,
  // chacun présent ou absent, × les 4 crans d'hier + `null`, × `asked`.
  const days = [null, ...DAY_ACTIVITY_LEVELS];
  const sports = [null, ...SPORT_FREQUENCIES];
  const legacies: readonly (ActivityLevel | null)[] = [null, ...ACTIVITY_LEVELS];
  let combinaisons = 0;
  for (const day of days) {
    for (const sport of sports) {
      for (const legacyLevel of legacies) {
        for (const asked of [false, true]) {
          const { source } = activityFactorOf({ day, sport, asked }, legacyLevel);
          combinaisons += 1;
          if (!isNamedActivitySource(source)) {
            throw new Error(`source hors vocabulaire: ${source}`);
          }
        }
      }
    }
  }
  assertEquals(combinaisons, days.length * sports.length * legacies.length * 2);
  // ⚠️ ET LES TROIS SEAUX SONT TOUS ATTEIGNABLES. Un vocabulaire dont un jeton
  // n'est jamais rendu est une population fantôme, l'inverse exact du défaut
  // gardé ici, et tout aussi invisible.
  const atteints = new Set<string>();
  for (const day of days) {
    for (const sport of sports) {
      for (const legacyLevel of legacies) {
        atteints.add(activityFactorOf({ day, sport, asked: false }, legacyLevel).source);
      }
    }
  }
  assertEquals([...atteints].sort(), [...ACTIVITY_FACTOR_SOURCES].slice().sort());
});

Deno.test("`isNamedActivitySource` — un cas qui PASSE et un cas qui MORD", () => {
  assertEquals(isNamedActivitySource("crossed"), true);
  assertEquals(isNamedActivitySource("legacy"), true);
  assertEquals(isNamedActivitySource("assumed"), true);
  assertEquals(isNamedActivitySource("not_asked"), false);
  assertEquals(isNamedActivitySource(""), false);
});

Deno.test("le seau LÈVE plutôt que de s'inventer — un cas qui PASSE, un cas qui MORD", () => {
  // ⛔ CE VERROU EST INATTEIGNABLE DEPUIS `activityFactorOf` AUJOURD'HUI, et le
  // test cartésien ci-dessus le prouve. C'est précisément pour ça qu'il est
  // exercé DIRECTEMENT: un verrou dont le cas mordant n'est jamais joué est un
  // verrou dont personne ne sait s'il ferme — la cicatrice
  // `guards-need-a-passing-case`, dans sa direction symétrique.
  const census: Record<string, number> = { crossed: 0, legacy: 0, assumed: 0 };

  // ① le cas qui PASSE — la porte s'ouvre, et elle compte.
  tallyActivitySource(census, "crossed");
  tallyActivitySource(census, "assumed");
  assertEquals(census, { crossed: 1, legacy: 0, assumed: 1 });

  // ② le cas qui MORD — une quatrième population n'entre pas en silence.
  assertThrows(() => tallyActivitySource(census, "crossed_v2"), Error, "hors vocabulaire");
  // ⚠️ ET L'HISTOGRAMME N'A PAS BOUGÉ: pas de quatrième clé, pas de NaN.
  assertEquals(census, { crossed: 1, legacy: 0, assumed: 1 });
  assertEquals(Object.keys(census).sort(), [...ACTIVITY_FACTOR_SOURCES].slice().sort());
});

// ── LA PORTE CONDITIONNELLE — MESURÉE, NON TRANCHÉE ───────────────────────

Deno.test("`crossedShareGate` rend un TAUX, jamais un verdict", () => {
  // ⛔ Le seuil `crossed ≥ 50 %` dépend d'une décision produit (vague D):
  // *l'activité doit-elle retenir l'entonnoir ?* Ce fichier la MESURE.
  // Les deux populations mesurées le 2026-08-22 à 16:12 CEST:
  //   · référentiel, dénominateur « lignes de corps » : 5 / 47
  //   · référentiel, dénominateur « bouches »         : 5 / 92
  const surLesCorps = crossedShareGate({ crossed: 5, legacy: 24, assumed: 18 });
  assertEquals(surLesCorps.total, 47);
  assertEquals(surLesCorps.share !== null && surLesCorps.share > 0.10, true);

  const surLesBouches = crossedShareGate({ crossed: 5, legacy: 24, assumed: 63 });
  assertEquals(surLesBouches.total, 92);
  assertEquals(surLesBouches.share !== null && surLesBouches.share < 0.06, true);

  // ⚠️ LE MÊME MOT, DEUX TAUX — c'est tout l'objet de la clause « les deux
  // dénominateurs sont publiés, toujours » (§⑨ n° 50 et son amendement).
  assertEquals(surLesCorps.crossed, surLesBouches.crossed);
  assertEquals(surLesCorps.share === surLesBouches.share, false);

  // Un histogramme vide ne rend PAS `0 %`: il rend « pas de population ».
  assertEquals(crossedShareGate({ crossed: 0, legacy: 0, assumed: 0 }).share, null);
});
