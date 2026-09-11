/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT B — LE CONTRAT DE BUDGET PAR PERSONNE, DATE ET CRÉNEAU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`,
 * section « Lot B ». Preuve du défaut :
 * `scratchpad/2026-09-11-FIABILITE-RECETTES/RAPPORT-MESURE-2026-09-11.md` § 4
 * et § 7, et la sonde `sonde-lot-B-avant-2026-09-11.txt`.
 *
 * ⛔ LE DÉFAUT, EN DEUX NOMBRES. La case `PERTE / 2026-09-11 / dinner` valait
 * **858,90 kcal** pour le dimensionnement et **2 454,00** pour le couloir
 * envoyé au modèle — facteur **2,86**. Et le vendredi partiel imposait son
 * [250–250] `above_askable_cap` aux dîners du samedi et du dimanche, qui
 * méritaient [123–250] visée 135.
 *
 * ⛔ LES NOMBRES SONT DÉRIVÉS À LA MAIN. Les poids de journée
 * (`SLOT_DAY_WEIGHT`) : petit-déjeuner 0,25 · déjeuner 0,40 · dîner 0,35 ·
 * collation 0,10. Les poids « léger » (`LIGHT_SLOT_WEIGHT`) : 0,15 · 0,25 ·
 * 0,20. L'arithmétique d'une case :
 *
 *     part(moment)  = poids[moment] / Σ poids[RYTHME]
 *     à composer    = cible_jour × part(moment) − apport fixe
 *     Gmax = min(E/ρ ; table.max)   Gmin = min(E/1,35 ; table.min)   ρ = 1,0
 *     Dmin = ⌈100 × E / Gmax⌉       Dmax = ⌊100 × E / Gmin⌋, rabattu à 250
 *     Dpréf = arrondi(Dmin × 1,10), projeté dans [Dmin, Dmax]
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE GÉNÉRATION, AUCUNE ÉCRITURE.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  contractKey,
  mergeSlotContractSets,
  requiredDensityFor,
  requiredDensityFromContracts,
  type ContractDay,
  type SlotNutritionContract,
  slotContractsFor,
} from "./slot_nutrition_contract.ts";
import {
  dayTargetFor,
  densityCorridorFor,
  MAX_ASKABLE_DENSITY_PER_100G,
  plateBoundsFor,
} from "./portion_sizing.ts";
import type { AnchorMouth } from "./mouth_anchor.ts";
import type { AppetiteLevel } from "./tokens.ts";

const FLOORS = { normal: 100, light: 60 } as const;

/** Le corps de Paul, fixture PERTE de la campagne : 178 cm, 88 kg, 36 ans. */
const PAUL = {
  heightCm: 178,
  weightKg: 88,
  gender: "male" as const,
  ageYears: 36,
  activityLevel: "trains_some" as const,
  activityAxes: { day: "seated" as const, sport: "3_4" as const, asked: true },
  appetite: "average" as AppetiteLevel | null,
};
/** Le corps de Max, fixture GAIN : 178 cm, 62 kg, 28 ans. */
const MAX = { ...PAUL, weightKg: 62, ageYears: 28 };

function bouche(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-paul",
    ageState: "adult",
    restriction: "clear",
    body: PAUL,
    direction: "down",
    paceKgPerWeek: 0.5,
    declaredSlots: [],
    conditionRefs: [],
    portionIndex: null,
    ...over,
  } as AnchorMouth;
}

function jour(
  dayToken: string,
  date: string,
  coveredSlots: readonly string[],
  over: Partial<ContractDay> = {},
): ContractDay {
  return {
    dayToken,
    date,
    coveredSlots,
    lockedSlots: [],
    fixedKcalBySlot: null,
    ...over,
  };
}

function contrats(over: Partial<Parameters<typeof slotContractsFor>[0]> = {}) {
  return slotContractsFor({
    mouth: bouche(),
    coachCounting: "no_position",
    rhythmSlots: [],
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])],
    lightSlots: [],
    ageYears: 36,
    ...over,
  });
}

function caseDe(
  set: { contracts: readonly SlotNutritionContract[] },
  dayToken: string,
  slot: string,
): SlotNutritionContract {
  const c = set.contracts.find((x) => x.dayToken === dayToken && x.slot === slot);
  assert(c !== undefined, `aucun contrat pour ${dayToken}/${slot}`);
  return c;
}

/** La cible de journée de Paul, par la fonction de production. */
const CIBLE_PAUL = dayTargetFor(bouche(), "no_position").kcal!;
const CIBLE_MAX = dayTargetFor(bouche({ body: MAX, direction: "up", paceKgPerWeek: 0.25 }), "no_position").kcal!;

Deno.test("les deux cibles de journée des fixtures sont celles du rapport du lot 0", () => {
  // ⛔ LA PRÉMISSE DE TOUT CE FICHIER. Si ces deux nombres bougeaient, chaque
  // assertion ci-dessous mesurerait autre chose sans le dire.
  assertEquals(CIBLE_PAUL, 2454);
  assertEquals(CIBLE_MAX, 2912);
});

// ═══════════════════════════════════════════════════════════════════════════
// ① LA RÈGLE MÈRE — LE RYTHME FAIT LE DÉNOMINATEUR, LA FENÊTRE FAIT LA SOMME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — un dîner seul dans la grille garde sa PART de dîner (858,90 kcal)", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE CAS MESURÉ : `PERTE / 2026-09-11 / dinner`, prompt parti à 15 h locales.
  // La grille ne porte que le dîner (petit-déjeuner et déjeuner sont passés).
  //
  //   2 454 × 0,35 / (0,25 + 0,40 + 0,35) = 2 454 × 0,35 = **858,90 kcal**
  //
  // ⛔ CE QUE LE CODE FAISAIT : 2 454 × 0,35/0,35 = **2 454,00**, c'est-à-dire
  // la journée entière servie au seul repas restant. Facteur 2,86.
  // ══════════════════════════════════════════════════════════════════════════
  const set = contrats({
    days: [jour("fri", "2026-09-11", ["dinner"])],
  });
  const diner = caseDe(set, "fri", "dinner");
  assertAlmostEquals(diner.composeKcal!, 858.9, 0.01);
  assertEquals(diner.rhythmSlots, ["breakfast", "lunch", "dinner"]);
  assertEquals(diner.coveredSlots, ["dinner"]);
  // ⛔ ET LA JOURNÉE N'EST PAS FACTURÉE À CE SEUL REPAS.
  assertAlmostEquals(diner.coveredBudgetKcal!, 858.9, 0.01);
  assertEquals(diner.dayTargetKcal, 2454);
  assert(
    diner.coveredBudgetKcal! < diner.dayTargetKcal!,
    "un plan partiel doit la journée entière",
  );

  // ── LA MÊME CASE POUR MAX (GAIN) ────────────────────────────────────
  //   2 912 × 0,35 = **1 019,20 kcal**
  const setMax = contrats({
    mouth: bouche({
      memberId: "m-max",
      body: MAX,
      direction: "up",
      paceKgPerWeek: 0.25,
    }),
    ageYears: 28,
    days: [jour("fri", "2026-09-11", ["dinner"])],
  });
  assertAlmostEquals(caseDe(setMax, "fri", "dinner").composeKcal!, 1019.2, 0.01);
});

Deno.test("⛔ LOT B — un VRAI rythme à un seul repas garde, lui, sa journée entière", () => {
  // ⚠️ C'EST LA MOITIÉ QUI DISTINGUE LES DEUX CAS, et sans elle le lot B
  // sous-nourrirait quelqu'un qui a déclaré ne manger que le soir. La personne
  // mange UNE fois par jour: son dîner porte 2 454 kcal, et c'est juste.
  const set = contrats({
    mouth: bouche({ declaredSlots: ["dinner"] }),
    rhythmSlots: ["dinner"],
    days: [jour("fri", "2026-09-11", ["dinner"])],
  });
  const diner = caseDe(set, "fri", "dinner");
  assertAlmostEquals(diner.composeKcal!, 2454, 0.01);
  assertEquals(diner.rhythmSlots, ["dinner"]);
  // ⛔ ET L'EXIGENCE DE DENSITÉ QUI EN DÉCOULE EST INTENABLE, ET LE DIT.
  //   Gmax = min(2 454 ; 700) = 700 ⇒ Dmin = ⌈245 400/700⌉ = 351 > 250
  assertEquals(diner.corridor!.neededMinPer100G, 351);
  assertEquals(diner.corridor!.minPer100G, MAX_ASKABLE_DENSITY_PER_100G);
  assertEquals(diner.corridor!.incompatible, "above_askable_cap");
  assertEquals(set.counters.capped, 1);
});

Deno.test("⛔ LOT B — un repas mangé DEHORS ne transfère pas son énergie", () => {
  // La personne mange trois fois; le plan ne compose que le matin et le soir
  // (déjeuner au restaurant). Ses deux cases gardent leur part ORDINAIRE.
  //
  //   petit-déjeuner  2 454 × 0,25 = 613,50
  //   dîner           2 454 × 0,35 = 858,90
  //   budget couvert  1 472,40  ( = 0,60 × 2 454 )
  const set = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "dinner"])],
  });
  assertAlmostEquals(caseDe(set, "sat", "breakfast").composeKcal!, 613.5, 0.01);
  assertAlmostEquals(caseDe(set, "sat", "dinner").composeKcal!, 858.9, 0.01);
  assertAlmostEquals(
    caseDe(set, "sat", "dinner").coveredBudgetKcal!,
    1472.4,
    0.01,
  );
  // ⛔ LE CAS QUI MORD: si le déjeuner avait transféré son énergie, les deux
  // cases vaudraient 0,25/0,60 et 0,35/0,60 de la journée, soit 1 022,50 et
  // 1 431,50 — et leur somme ferait la journée entière.
  assert(
    caseDe(set, "sat", "breakfast").composeKcal! < 1000,
    "le déjeuner sorti a transféré son énergie au petit-déjeuner",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA CLÉ EST DATÉE — horaire du matin, de l'après-midi, et fuseau
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — la clé porte la DATE LOCALE, pas le jeton de jour", () => {
  // ⛔ POURQUOI LA DATE ET PAS LE JETON. `fri` ne dit pas de quel vendredi il
  // parle: une fenêtre de sept jours ou deux plans voisins réutilisent le même
  // jeton. Le rapport du lot 0 a dû DÉRIVER les deux cases retirées de l'heure
  // locale, faute de grille persistée avec ses clés (défaut B3).
  const set = contrats({
    days: [
      jour("fri", "2026-09-11", ["dinner"]),
      jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"]),
    ],
  });
  assert(set.byKey.has(contractKey("m-paul", "2026-09-11", "dinner")));
  assert(set.byKey.has(contractKey("m-paul", "2026-09-12", "dinner")));
  assertEquals(set.byKey.size, 4);
  // ⛔ LE CAS QUI MORD: une clé sans date confondrait les deux dîners.
  assertEquals(
    set.byKey.get(contractKey("m-paul", "2026-09-11", "dinner"))!.dayToken,
    "fri",
  );
  assertEquals(
    set.byKey.get(contractKey("m-paul", "2026-09-12", "dinner"))!.dayToken,
    "sat",
  );
});

Deno.test("⛔ LOT B — matin ou après-midi: seule la GRILLE change, jamais les parts", () => {
  // Le même jour, demandé le matin (trois cases) et à 15 h (une case). Le
  // dîner vaut 858,90 dans les DEUX cas: l'heure de la demande ne change pas
  // ce que pèse un dîner.
  const matin = contrats({
    days: [jour("fri", "2026-09-11", ["breakfast", "lunch", "dinner"])],
  });
  const apresMidi = contrats({ days: [jour("fri", "2026-09-11", ["dinner"])] });
  assertAlmostEquals(
    caseDe(matin, "fri", "dinner").composeKcal!,
    caseDe(apresMidi, "fri", "dinner").composeKcal!,
    0.0001,
  );
  // ⛔ ET LE BUDGET COUVERT, LUI, CHANGE — c'est la seule chose qui doit bouger.
  assertAlmostEquals(caseDe(matin, "fri", "dinner").coveredBudgetKcal!, 2454, 0.01);
  assertAlmostEquals(
    caseDe(apresMidi, "fri", "dinner").coveredBudgetKcal!,
    858.9,
    0.01,
  );
});

Deno.test("⛔ LOT B — deux fuseaux, deux dates locales, deux contrats distincts", () => {
  // ⚠️ CE MODULE NE CALCULE AUCUN FUSEAU, et c'est voulu: la date locale lui
  // est DONNÉE (`ContractDay.date`, dérivée de `windowDates` chez l'appelant).
  // Ce que le test épingle, c'est que deux dates différentes ne se confondent
  // jamais — le mode d'échec d'une clé qui serait le jeton de jour.
  const paris = contrats({ days: [jour("fri", "2026-09-11", ["dinner"])] });
  const auckland = contrats({ days: [jour("fri", "2026-09-12", ["dinner"])] });
  assert(
    !paris.byKey.has(contractKey("m-paul", "2026-09-12", "dinner")),
    "deux fuseaux partagent une clé",
  );
  assert(auckland.byKey.has(contractKey("m-paul", "2026-09-12", "dinner")));
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA JOURNÉE COMPLÈTE — conservation des budgets AVANT arrondi
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — une journée complète somme EXACTEMENT sa cible, avant tout arrondi", () => {
  const set = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])],
  });
  const somme = set.contracts.reduce((n, c) => n + (c.composeKcal ?? 0), 0);
  // ⛔ `assertEquals` SUR DES FLOTTANTS, ET C'EST DÉLIBÉRÉ: 0,25 + 0,40 + 0,35
  // se recompose au bit près ici. Un arrondi intermédiaire casserait l'égalité,
  // et c'est très exactement ce que « conservation avant arrondi » veut dire.
  assertAlmostEquals(somme, 2454, 1e-9);
  assertAlmostEquals(
    caseDe(set, "sat", "breakfast").composeKcal!,
    613.5,
    1e-9,
  );
  assertAlmostEquals(caseDe(set, "sat", "lunch").composeKcal!, 981.6, 1e-9);
  assertAlmostEquals(caseDe(set, "sat", "dinner").composeKcal!, 858.9, 1e-9);
  // ⛔ ET LE BUDGET COUVERT VAUT LA CIBLE DU JOUR quand la fenêtre est pleine.
  assertAlmostEquals(
    caseDe(set, "sat", "lunch").coveredBudgetKcal!,
    2454,
    1e-9,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ APPORT FIXE — retranché UNE fois, jamais deux
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — l'apport fixe est retranché UNE fois, et la case le dit", () => {
  // Un shaker de 300 kcal au petit-déjeuner.
  //   part     2 454 × 0,25 = 613,50
  //   composer 613,50 − 300 = 313,50
  const set = contrats({
    days: [
      jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"], {
        fixedKcalBySlot: new Map([["breakfast", 300]]),
      }),
    ],
  });
  const pdj = caseDe(set, "sat", "breakfast");
  assertAlmostEquals(pdj.mealTargetKcal!, 613.5, 1e-9);
  assertEquals(pdj.fixedKcal, 300);
  assertAlmostEquals(pdj.composeKcal!, 313.5, 1e-9);
  // ⛔ LE CAS QUI MORD — AUCUNE DOUBLE SOUSTRACTION: la part, moins l'apport,
  // égale ce qu'on compose. Un second retrait ferait 13,50.
  assertAlmostEquals(pdj.mealTargetKcal! - pdj.fixedKcal, pdj.composeKcal!, 1e-9);
  assertEquals(pdj.status, "computed");
  // ⚠️ ET LES AUTRES CASES NE RÉCUPÈRENT PAS LES 300 kcal. Le shaker est avalé;
  // il ne se redistribue pas.
  assertAlmostEquals(caseDe(set, "sat", "lunch").composeKcal!, 981.6, 1e-9);
});

Deno.test("⛔ LOT B — une case entièrement couverte par un apport fixe n'est PAS une case oubliée", () => {
  const set = contrats({
    days: [
      jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"], {
        fixedKcalBySlot: new Map([["breakfast", 900]]),
      }),
    ],
  });
  const pdj = caseDe(set, "sat", "breakfast");
  assertEquals(pdj.status, "fixed_covered");
  assertEquals(pdj.composeKcal, 0);
  // ⛔ AUCUN COULOIR: fabriquer une densité pour 0 kcal à composer serait une
  // consigne intenable, et une consigne intenable apprend au modèle que ces
  // nombres-là sont décoratifs (mesuré: 389 demandés, 126,7 rendus).
  assertEquals(pdj.corridor, null);
  assertEquals(set.counters.fixed_covered, 1);
  // ⚠️ ET LA CASE EXISTE QUAND MÊME, avec sa clé. « Zéro à composer » et
  // « case oubliée » ne doivent pas rendre le même objet.
  assert(set.byKey.has(contractKey("m-paul", "2026-09-12", "breakfast")));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ REPAS LÉGER, PETITS ET GRANDS APPÉTITS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — un dîner LÉGER pèse moins, et son plancher de densité baisse", () => {
  // Poids légers: petit-déjeuner 0,25 · déjeuner 0,40 · dîner 0,20 ⇒ Σ = 0,85
  //   dîner léger  2 454 × 0,20/0,85 = 577,41
  const set = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])],
    lightSlots: ["dinner"],
  });
  const diner = caseDe(set, "sat", "dinner");
  assertAlmostEquals(diner.composeKcal!, 2454 * 0.20 / 0.85, 1e-9);
  assertEquals(diner.light, true);
  // ⛔ ET SON PLANCHER DE DENSITÉ EST CELUI D'UN REPAS LÉGER (0,6 kcal/g), pas
  // celui d'un repas ordinaire (1,0). Sans lui, un dîner léger serait jugé
  // contre une exigence qui n'est pas la sienne.
  assertEquals(diner.bounds!.densityFloorPerG, 0.6);
  // ⛔ LE CAS QUI MORD: le même dîner NON léger pèse plus.
  const ordinaire = caseDe(
    contrats({ days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])] }),
    "sat",
    "dinner",
  );
  assert(diner.composeKcal! < ordinaire.composeKcal!);
  assertEquals(ordinaire.bounds!.densityFloorPerG, 1);
  // ⚠️ ET LA JOURNÉE RESTE ENTIÈRE: ce que le soir retire, les autres moments
  // le reprennent. Un dîner léger déplace la journée, il ne la fait pas maigrir.
  const somme = set.contracts.reduce((n, c) => n + (c.composeKcal ?? 0), 0);
  assertAlmostEquals(somme, 2454, 1e-9);
});

Deno.test("⛔ LOT B — petit et grand appétit déplacent la BORNE, donc le COULOIR de la case", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ OÙ L'APPÉTIT ENTRE, ET OÙ IL N'ENTRE PAS — MESURÉ, PAS SUPPOSÉ.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sur un corps MESURÉ (taille, poids, âge, activité connus), la cible de
  // journée vient de l'équation du corps : 2 454 kcal, appétit compris ou non.
  // `appetiteFactorOf` n'entre dans l'entretien que par
  // `estimatedMaintenanceKcal`, c'est-à-dire quand l'équation n'est pas
  // calculable. Ce qu'il déplace ICI, c'est la BANDE DE MASSE
  // (`plateBoundsFor`), et donc le couloir de densité de la case.
  //
  //   dîner  2 454 × 0,35 = 858,90 kcal
  //   petit  Gmax = min(0,9 × 700 ; 700) = 630 ⇒ Dmin = ⌈85 890/630⌉ = 137
  //   grand  Gmax = min(1,1 × 700 ; 700) = 700 ⇒ Dmin = ⌈85 890/700⌉ = 123
  //
  // ⚠️ UN PETIT APPÉTIT DEMANDE DONC UN PLAT PLUS DENSE, pas une portion plus
  // maigre : la cible n'a pas bougé, c'est l'assiette qui a rétréci.
  const petit = contrats({
    mouth: bouche({ body: { ...PAUL, appetite: "small" } }),
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])],
  });
  const grand = contrats({
    mouth: bouche({ body: { ...PAUL, appetite: "large" } }),
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])],
  });
  const dP = caseDe(petit, "sat", "dinner");
  const dG = caseDe(grand, "sat", "dinner");
  assertAlmostEquals(dP.composeKcal!, 858.9, 0.01);
  assertAlmostEquals(dG.composeKcal!, 858.9, 0.01);
  assertEquals([dP.bounds!.min, dP.bounds!.max], [225, 630]);
  assertEquals([dG.bounds!.min, dG.bounds!.max], [275, 700]);
  assertEquals(dP.corridor!.minPer100G, 137);
  assertEquals(dG.corridor!.minPer100G, 123);
  // ⛔ LE CAS QUI MORD : une borne qui ne bougerait pas rendrait le même couloir
  // aux deux, et le cran d'appétit serait une case cochée pour rien.
  assert(
    dP.corridor!.minPer100G > dG.corridor!.minPer100G,
    "l'appétit n'atteint pas le couloir de la case",
  );
  assertEquals(dP.bounds!.appetiteFactor, 0.9);
  assertEquals(dG.bounds!.appetiteFactor, 1.1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ DEUX PERSONNES AUX OBJECTIFS DIFFÉRENTS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — deux bouches, deux contrats, aucune contamination", () => {
  const jours = [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])];
  const perte = contrats({ days: jours });
  const gain = contrats({
    mouth: bouche({
      memberId: "m-max",
      body: MAX,
      direction: "up",
      paceKgPerWeek: 0.25,
    }),
    ageYears: 28,
    days: jours,
  });
  assertAlmostEquals(caseDe(perte, "sat", "dinner").composeKcal!, 858.9, 0.01);
  assertAlmostEquals(caseDe(gain, "sat", "dinner").composeKcal!, 1019.2, 0.01);
  // ⛔ LES CLÉS PORTENT LA BOUCHE: le même jour et le même moment ne se
  // confondent pas d'une personne à l'autre.
  assert(perte.byKey.has(contractKey("m-paul", "2026-09-12", "dinner")));
  assert(!perte.byKey.has(contractKey("m-max", "2026-09-12", "dinner")));
  // ⛔ ET LEURS COULOIRS DIFFÈRENT: [123–250] visée 135 contre [146–250] visée 160.
  assertEquals(
    [
      caseDe(perte, "sat", "dinner").corridor!.minPer100G,
      caseDe(perte, "sat", "dinner").corridor!.preferredPer100G,
    ],
    [123, 135],
  );
  assertEquals(
    [
      caseDe(gain, "sat", "dinner").corridor!.minPer100G,
      caseDe(gain, "sat", "dinner").corridor!.preferredPer100G,
    ],
    [146, 160],
  );
  // ⚠️ ET ON NE RECOLLE JAMAIS DEUX BOUCHES PAR ERREUR.
  let refuse = false;
  try {
    mergeSlotContractSets([perte, gain]);
  } catch {
    refuse = true;
  }
  assert(refuse, "deux bouches se sont recollées en un seul jeu");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LE CONTRAT CAPTURÉ = LE CONTRAT CONSOMMÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — le couloir du prompt est celui que le dimensionnement calculerait", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ C'EST LE TEST QUI REMPLACE LA CONFIANCE. Le prompt lit
  // `requiredDensityFromContracts`; le dimensionnement lit `composeKcal` et
  // `bounds`. Si les deux divergeaient d'un kcal, la case recevrait deux
  // budgets — le défaut de départ, sous un autre nom.
  // ══════════════════════════════════════════════════════════════════════════
  const set = contrats({
    days: [
      jour("fri", "2026-09-11", ["dinner"]),
      jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"]),
      jour("sun", "2026-09-13", ["breakfast", "lunch", "dinner"]),
    ],
  });
  const densite = requiredDensityFromContracts(set, FLOORS);
  let verifies = 0;
  for (const c of set.contracts) {
    if (c.corridor === null) continue;
    // ① ce que le dimensionnement REFERAIT depuis la cible et les bornes
    const refait = densityCorridorFor({
      targetKcal: c.composeKcal,
      bounds: plateBoundsFor({
        ageYears: 36,
        slot: c.slot,
        slotTargetKcal: c.composeKcal,
        light: c.light,
        appetite: PAUL.appetite,
      }),
    })!;
    assertEquals(refait.minPer100G, c.corridor.minPer100G);
    assertEquals(refait.maxPer100G, c.corridor.maxPer100G);
    assertEquals(refait.preferredPer100G, c.corridor.preferredPer100G);
    // ② ce que le PROMPT reçoit pour cette date
    const ligne = densite.named.find((d) =>
      d.slot === c.slot && d.days.includes(c.dayToken)
    )!;
    assertEquals(ligne.minPer100G, c.corridor.minPer100G);
    assertEquals(ligne.maxPer100G, c.corridor.maxPer100G);
    assertEquals(ligne.preferredPer100G, c.corridor.preferredPer100G);
    verifies++;
  }
  // ⛔ LA PRÉMISSE: une boucle vide passerait toutes les assertions ci-dessus.
  assertEquals(verifies, 7);
});

Deno.test("⛔ LOT B — ajouter ou retirer le vendredi partiel ne déplace AUCUN contrat du week-end", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE TEST CENTRAL. Mesuré AVANT (sonde du 2026-09-11): retirer le vendredi
  // faisait passer le dîner du week-end de **[250–250] `above_askable_cap`** à
  // **[123–250] visée 135**. Un jour qu'on n'a pas touché changeait de consigne
  // parce qu'un AUTRE jour existait.
  // ══════════════════════════════════════════════════════════════════════════
  const weekEnd = [
    jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"]),
    jour("sun", "2026-09-13", ["breakfast", "lunch", "dinner"]),
  ];
  const sans = requiredDensityFromContracts(contrats({ days: weekEnd }), FLOORS);
  const avec = requiredDensityFromContracts(
    contrats({ days: [jour("fri", "2026-09-11", ["dinner"]), ...weekEnd] }),
    FLOORS,
  );
  const ligne = (r: typeof sans, slot: string, j: string) =>
    r.named.find((d) => d.slot === slot && d.days.includes(j))!;
  for (const j of ["sat", "sun"]) {
    for (const slot of ["breakfast", "lunch", "dinner"]) {
      const a = ligne(avec, slot, j);
      const b = ligne(sans, slot, j);
      assertEquals(
        [a.minPer100G, a.maxPer100G, a.preferredPer100G, a.incompatible],
        [b.minPer100G, b.maxPer100G, b.preferredPer100G, b.incompatible],
        `${j}/${slot} a bougé à cause du vendredi`,
      );
    }
  }
  assertEquals(
    [ligne(avec, "dinner", "sat").minPer100G, ligne(avec, "dinner", "sat").preferredPer100G],
    [123, 135],
  );

  // ⛔ LE CAS QUI MORD, GARDÉ. L'ancienne arithmétique — la grille prise pour
  // rythme, jour par jour — déplaçait bien le week-end. Sans elle, une fonction
  // qui rendrait la même chose pour TOUTE entrée passerait la boucle ci-dessus.
  const ancienAvec = requiredDensityFromContracts(
    mergeSlotContractSets(
      [jour("fri", "2026-09-11", ["dinner"]), ...weekEnd].map((d) =>
        contrats({ rhythmSlots: d.coveredSlots, days: [d] })
      ),
    ),
    FLOORS,
  );
  assertEquals(ligne(ancienAvec, "dinner", "sat").minPer100G, 250);
  assertEquals(ligne(ancienAvec, "dinner", "sat").incompatible, "above_askable_cap");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LA REDISTRIBUTION — dans la même personne, la même journée, la même fenêtre
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — la relâche conserve le budget COUVERT et ne sort pas de la fenêtre", () => {
  // Un rythme à deux repas, où le déjeuner ne tient pas dans son assiette.
  //   déjeuner 2 454 × 0,40/0,75 = 1 308,80 ⇒ Dmin = ⌈130 880/700⌉ = 187 — tenable
  // Il faut une cible plus grosse pour dépasser 250: Max en prise, rythme à un
  // seul repas plus un dîner ⇒ on force le cas par un apport fixe NÉGATIF?
  // Non — on prend le rythme [lunch, dinner] sur le corps de Paul et on lui
  // donne un déjeuner que la table borne: 2 454 × 0,40/0,75 = 1 308,80,
  // Gmax = 700 ⇒ 187. Toujours tenable. On passe donc par le cas RÉEL du
  // rythme à un seul repas, où la relâche n'a nulle part où aller.
  const seul = contrats({
    mouth: bouche({ declaredSlots: ["dinner"] }),
    rhythmSlots: ["dinner"],
    days: [jour("fri", "2026-09-11", ["dinner"])],
  });
  // ⛔ LE CONFLIT RESTE EXPLICITE: pas de rabotage, pas de moyenne, pas de
  // journée baissée en silence.
  assertEquals(seul.counters.relaxed_days, 0);
  assertEquals(Object.keys(seul.counters.relax_refused).length, 1);
  assertEquals(caseDe(seul, "fri", "dinner").corridor!.incompatible, "above_askable_cap");
  assertEquals(caseDe(seul, "fri", "dinner").redistributedKcal, 0);

  // ── LE CAS QUI PASSE: deux cases, et le déplacement reste dans la journée ──
  const deux = contrats({
    mouth: bouche({ declaredSlots: ["lunch", "dinner"] }),
    rhythmSlots: ["lunch", "dinner"],
    days: [jour("fri", "2026-09-11", ["lunch", "dinner"])],
  });
  const somme = deux.contracts.reduce((n, c) => n + (c.composeKcal ?? 0), 0);
  const budget = caseDe(deux, "fri", "lunch").coveredBudgetKcal!;
  assertAlmostEquals(somme, budget, 1e-6, "la relâche a créé ou perdu de l'énergie");
  const deplace = deux.contracts.reduce((n, c) => n + c.redistributedKcal, 0);
  assertAlmostEquals(deplace, 0, 1e-6, "un déplacement a quitté la journée");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ L'ABSTENTION SE NOMME, ET ELLE NE VAUT JAMAIS ZÉRO
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — sans cible de journée, chaque case sort ABSTENUE avec son motif", () => {
  const set = contrats({
    mouth: bouche({ body: null }),
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])],
  });
  assertEquals(set.contracts.length, 3);
  for (const c of set.contracts) {
    assertEquals(c.status, "no_day_target");
    // ⛔ `null`, JAMAIS `0`. « On n'a pas su » et « il n'y a rien à composer »
    // se réparent par des gestes opposés.
    assertEquals(c.composeKcal, null);
    assertEquals(c.coveredBudgetKcal, null);
    assert(c.abstainReason !== null, "l'abstention ne dit pas pourquoi");
  }
  assertEquals(set.counters.slots, 0);
  // ⛔ ET LE MOTIF REMONTE JUSQU'AU PROMPT: listes vides, mais `reason` lisible.
  const d = requiredDensityFromContracts(set, FLOORS);
  assertEquals(d.named, []);
  assert(d.reason !== "anchored");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ LA PORTE HÉRITÉE — `requiredDensityFor` passe par le contrat
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — `requiredDensityFor` rend EXACTEMENT le pli du contrat", () => {
  const days = [
    jour("fri", "2026-09-11", ["dinner"]),
    jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"]),
  ];
  const parContrat = requiredDensityFromContracts(contrats({ days }), FLOORS);
  const parPorte = requiredDensityFor({
    mouth: bouche(),
    coachCounting: "no_position",
    slotsByDay: new Map(days.map((d) => [d.dayToken, d.coveredSlots])),
    rhythmSlots: [],
    lightSlots: [],
    slotFixedKcalByDay: new Map(),
    ageYears: 36,
    floors: FLOORS,
  });
  assertEquals(parPorte.named, parContrat.named);
  assertEquals(parPorte.counters, parContrat.counters);
  // ⛔ LE CAS QUI MORD: un rythme DIFFÉRENT rend une autre réponse. Sans lui, le
  // test ci-dessus comparerait une constante à elle-même.
  const autre = requiredDensityFor({
    mouth: bouche({ declaredSlots: ["dinner"] }),
    coachCounting: "no_position",
    slotsByDay: new Map(days.map((d) => [d.dayToken, d.coveredSlots])),
    rhythmSlots: ["dinner"],
    lightSlots: [],
    slotFixedKcalByDay: new Map(),
    ageYears: 36,
    floors: FLOORS,
  });
  assert(
    autre.named.find((d) => d.slot === "dinner")!.minPer100G !==
      parPorte.named.find((d) => d.slot === "dinner")!.minPer100G,
    "le rythme ne change rien: le paramètre est désarmé",
  );
});
