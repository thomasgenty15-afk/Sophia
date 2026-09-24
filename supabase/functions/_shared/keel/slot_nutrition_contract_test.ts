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
 * **841,40 kcal** pour le dimensionnement et **2 404,00** pour le couloir
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
 *     Dpréf = arrondi(Dmin × 1,10), projeté dans [Dmin, Dmax]   (collation)
 *     Dpréf = arrondi(max(125 ; 100 × E / Gmax)), projeté       (repas)
 *
 * ⟳ 2026-09-23 — LE PLAT ADULTE EST BORNÉ À 550 g (700 avant), l'adolescent
 * aussi (650 avant), et la visée d'un REPAS est la densité du gabarit (125)
 * ou le besoin s'il est plus haut. Tous les nombres de ce fichier qui en
 * dépendent ont été refaits à la main sur ces valeurs.
 *
 * ⟳ 2026-09-23 — ET LES CIBLES DE JOURNÉE SUIVENT L'ÂGE EXACT (flux D du même
 * chantier) au lieu du milieu de la tranche: Paul (36 ans) passe de 2 404 à
 * **2 413**, Max (28 ans) de 2 912 à **2 879** au cran 0,25 et de 3 132 à
 * **3 099** au cran 0,45. Le premier test épingle ces prémisses; s'il rougit,
 * tout le reste mesure autre chose.
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE GÉNÉRATION, AUCUNE ÉCRITURE.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  contractKey,
  mergeSlotContractSets,
  type SlotContractSet,
  requiredDensityFor,
  requiredDensityFromContracts,
  type ContractDay,
  type SlotNutritionContract,
  slotContractsFor,
} from "./slot_nutrition_contract.ts";
import {
  infeasibleDemands,
  MAX_RHYTHM_SLOTS_FOR_ADVICE,
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
    // ⟳ 2026-09-23 — le contrat d'avant: aucun à-côté. Les tests des à-côtés
    // le remplacent par une `Map`.
    sides: null,
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

Deno.test("les deux cibles de journée des fixtures (Paul : 2 413 à l'âge exact, 2 404 au milieu de tranche, 2 454 avant A1 = 880)", () => {
  // ⛔ LA PRÉMISSE DE TOUT CE FICHIER. Si ces deux nombres bougeaient, chaque
  // assertion ci-dessous mesurerait autre chose sans le dire.
  assertEquals(CIBLE_PAUL, 2413);
  assertEquals(CIBLE_MAX, 2879);
});

// ═══════════════════════════════════════════════════════════════════════════
// ① LA RÈGLE MÈRE — LE RYTHME FAIT LE DÉNOMINATEUR, LA FENÊTRE FAIT LA SOMME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — un dîner seul dans la grille garde sa PART de dîner (841,40 kcal)", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE CAS MESURÉ : `PERTE / 2026-09-11 / dinner`, prompt parti à 15 h locales.
  // La grille ne porte que le dîner (petit-déjeuner et déjeuner sont passés).
  //
  //   2 404 × 0,35 / (0,25 + 0,40 + 0,35) = 2 404 × 0,35 = **841,40 kcal**
  //   (⟳ 2026-09-23 — à l'âge exact: 2 413 × 0,35 = **844,55 kcal**)
  //
  // ⛔ CE QUE LE CODE FAISAIT : 2 404 × 0,35/0,35 = **2 404,00**, c'est-à-dire
  // la journée entière servie au seul repas restant. Facteur 2,86.
  // ══════════════════════════════════════════════════════════════════════════
  const set = contrats({
    days: [jour("fri", "2026-09-11", ["dinner"])],
  });
  const diner = caseDe(set, "fri", "dinner");
  assertAlmostEquals(diner.composeKcal!, 844.55, 0.01);
  assertEquals(diner.rhythmSlots, ["breakfast", "lunch", "dinner"]);
  assertEquals(diner.coveredSlots, ["dinner"]);
  // ⛔ ET LA JOURNÉE N'EST PAS FACTURÉE À CE SEUL REPAS.
  assertAlmostEquals(diner.coveredBudgetKcal!, 844.55, 0.01);
  assertEquals(diner.dayTargetKcal, 2413);
  assert(
    diner.coveredBudgetKcal! < diner.dayTargetKcal!,
    "un plan partiel doit la journée entière",
  );

  // ── LA MÊME CASE POUR MAX (GAIN) ────────────────────────────────────
  //   2 879 × 0,35 = **1 007,65 kcal** (1 019,20 au milieu de tranche)
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
  assertAlmostEquals(caseDe(setMax, "fri", "dinner").composeKcal!, 1007.65, 0.01);
});

Deno.test("⛔ LOT B — un VRAI rythme à un seul repas garde, lui, sa journée entière", () => {
  // ⚠️ C'EST LA MOITIÉ QUI DISTINGUE LES DEUX CAS, et sans elle le lot B
  // sous-nourrirait quelqu'un qui a déclaré ne manger que le soir. La personne
  // mange UNE fois par jour: son dîner porte 2 413 kcal, et c'est juste.
  const set = contrats({
    mouth: bouche({ declaredSlots: ["dinner"] }),
    rhythmSlots: ["dinner"],
    days: [jour("fri", "2026-09-11", ["dinner"])],
  });
  const diner = caseDe(set, "fri", "dinner");
  assertAlmostEquals(diner.composeKcal!, 2413, 0.01);
  assertEquals(diner.rhythmSlots, ["dinner"]);
  // ⛔ ET L'EXIGENCE DE DENSITÉ QUI EN DÉCOULE EST INTENABLE, ET LE DIT.
  //   Gmax = min(2 413 ; 550) = 550 ⇒ Dmin = ⌈241 300/550⌉ = ⌈438,73⌉ = 439 > 250
  //   (⟳ 2026-09-23 — 344 sous l'ancien plafond de 700 g.)
  assertEquals(diner.corridor!.neededMinPer100G, 439);
  assertEquals(diner.corridor!.minPer100G, MAX_ASKABLE_DENSITY_PER_100G);
  assertEquals(diner.corridor!.incompatible, "above_askable_cap");
  assertEquals(set.counters.capped, 1);
});

Deno.test("⛔ LOT B — un repas mangé DEHORS ne transfère pas son énergie", () => {
  // La personne mange trois fois; le plan ne compose que le matin et le soir
  // (déjeuner au restaurant). Ses deux cases gardent leur part ORDINAIRE.
  //
  //   petit-déjeuner  2 413 × 0,25 = 603,25
  //   dîner           2 413 × 0,35 = 844,55
  //   budget couvert  1 447,80  ( = 0,60 × 2 413 )
  const set = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "dinner"])],
  });
  assertAlmostEquals(caseDe(set, "sat", "breakfast").composeKcal!, 603.25, 0.01);
  assertAlmostEquals(caseDe(set, "sat", "dinner").composeKcal!, 844.55, 0.01);
  assertAlmostEquals(
    caseDe(set, "sat", "dinner").coveredBudgetKcal!,
    1447.8,
    0.01,
  );
  // ⛔ LE CAS QUI MORD: si le déjeuner avait transféré son énergie, les deux
  // cases vaudraient 0,25/0,60 et 0,35/0,60 de la journée, soit 1 005,42 et
  // 1 407,58 — et leur somme ferait la journée entière.
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
  // dîner vaut 844,55 dans les DEUX cas: l'heure de la demande ne change pas
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
  assertAlmostEquals(caseDe(matin, "fri", "dinner").coveredBudgetKcal!, 2413, 0.01);
  assertAlmostEquals(
    caseDe(apresMidi, "fri", "dinner").coveredBudgetKcal!,
    844.55,
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
  assertAlmostEquals(somme, 2413, 1e-9);
  assertAlmostEquals(
    caseDe(set, "sat", "breakfast").composeKcal!,
    603.25,
    1e-9,
  );
  assertAlmostEquals(caseDe(set, "sat", "lunch").composeKcal!, 965.2, 1e-9);
  assertAlmostEquals(caseDe(set, "sat", "dinner").composeKcal!, 844.55, 1e-9);
  // ⛔ ET LE BUDGET COUVERT VAUT LA CIBLE DU JOUR quand la fenêtre est pleine.
  assertAlmostEquals(
    caseDe(set, "sat", "lunch").coveredBudgetKcal!,
    2413,
    1e-9,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ APPORT FIXE — retranché UNE fois, jamais deux
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — l'apport fixe est retranché UNE fois, et la case le dit", () => {
  // Un shaker de 300 kcal au petit-déjeuner.
  //   part     2 413 × 0,25 = 603,25
  //   composer 603,25 − 300 = 303,25
  const set = contrats({
    days: [
      jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"], {
        fixedKcalBySlot: new Map([["breakfast", 300]]),
      }),
    ],
  });
  const pdj = caseDe(set, "sat", "breakfast");
  assertAlmostEquals(pdj.mealTargetKcal!, 603.25, 1e-9);
  assertEquals(pdj.fixedKcal, 300);
  assertAlmostEquals(pdj.composeKcal!, 303.25, 1e-9);
  // ⛔ LE CAS QUI MORD — AUCUNE DOUBLE SOUSTRACTION: la part, moins l'apport,
  // égale ce qu'on compose. Un second retrait ferait 3,25.
  assertAlmostEquals(pdj.mealTargetKcal! - pdj.fixedKcal, pdj.composeKcal!, 1e-9);
  assertEquals(pdj.status, "computed");
  // ⚠️ ET LES AUTRES CASES NE RÉCUPÈRENT PAS LES 300 kcal. Le shaker est avalé;
  // il ne se redistribue pas.
  assertAlmostEquals(caseDe(set, "sat", "lunch").composeKcal!, 965.2, 1e-9);
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
  //   dîner léger  2 413 × 0,20/0,85 = 567,76
  const set = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"])],
    lightSlots: ["dinner"],
  });
  const diner = caseDe(set, "sat", "dinner");
  assertAlmostEquals(diner.composeKcal!, 567.7647058823529, 1e-9);
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
  assertAlmostEquals(somme, 2413, 1e-9);
});

Deno.test("⛔ LOT B — petit et grand appétit déplacent la BORNE, donc le COULOIR de la case", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ OÙ L'APPÉTIT ENTRE, ET OÙ IL N'ENTRE PAS — MESURÉ, PAS SUPPOSÉ.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sur un corps MESURÉ (taille, poids, âge, activité connus), la cible de
  // journée vient de l'équation du corps : 2 413 kcal, appétit compris ou non.
  // `appetiteFactorOf` n'entre dans l'entretien que par
  // `estimatedMaintenanceKcal`, c'est-à-dire quand l'équation n'est pas
  // calculable. Ce qu'il déplace ICI, c'est la BANDE DE MASSE
  // (`plateBoundsFor`), et donc le couloir de densité de la case.
  //
  //   dîner  2 413 × 0,35 = 844,55 kcal
  //   ⟳ 2026-09-23 — le plafond de table est 550 g (700 avant):
  //   petit  Gmax = min(0,9 × 550 ; 550) = 495 ⇒ Dmin = ⌈84 455/495⌉ = ⌈170,62⌉ = 171
  //          Gmin = min(0,9 × 250 ; 495) = 225
  //   grand  Gmax = min(1,1 × 550 ; 550) = 550 ⇒ Dmin = ⌈84 455/550⌉ = ⌈153,55⌉ = 154
  //          Gmin = min(1,1 × 250 ; 550) = 275
  //   ⟳ 2026-09-24 — ⛔ ET LE PLANCHER PERSONNEL S'Y AJOUTE. Paul a un
  //          entretien de 2 963 kcal: plafond personnel min(550 ; 741) = 550,
  //          plancher min(250 ; 275) = 250 (`personalPlateBoundsFor`). Le
  //          plancher du grand appétit descend donc de 275 à 250 — le « Fabrice
  //          550 / 250 » du plan. Le petit appétit garde 225 (sous 250).
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
  assertAlmostEquals(dP.composeKcal!, 844.55, 0.01);
  assertAlmostEquals(dG.composeKcal!, 844.55, 0.01);
  assertEquals([dP.bounds!.min, dP.bounds!.max], [225, 495]);
  assertEquals([dG.bounds!.min, dG.bounds!.max], [250, 550]);
  assertEquals(dP.corridor!.minPer100G, 171);
  assertEquals(dG.corridor!.minPer100G, 154);
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
  assertAlmostEquals(caseDe(perte, "sat", "dinner").composeKcal!, 844.55, 0.01);
  assertAlmostEquals(caseDe(gain, "sat", "dinner").composeKcal!, 1007.65, 0.01);
  // ⛔ LES CLÉS PORTENT LA BOUCHE: le même jour et le même moment ne se
  // confondent pas d'une personne à l'autre.
  assert(perte.byKey.has(contractKey("m-paul", "2026-09-12", "dinner")));
  assert(!perte.byKey.has(contractKey("m-max", "2026-09-12", "dinner")));
  // ⛔ ET LEURS COULOIRS DIFFÈRENT.
  // ⟳ 2026-09-23 — sous 550 g, et la visée d'un repas vaut max(125 ; besoin):
  //   perte   84 455/550 = 153,55 ⇒ [154–250], visée arrondi(153,55) = 154
  //           (le besoin dépasse 125)
  //   gain   100 765/550 = 183,21 ⇒ [184–250], visée arrondi(183,21) = 183,
  //           ramenée dans le couloir ⇒ 184
  assertEquals(
    [
      caseDe(perte, "sat", "dinner").corridor!.minPer100G,
      caseDe(perte, "sat", "dinner").corridor!.preferredPer100G,
    ],
    [154, 154],
  );
  assertEquals(
    [
      caseDe(gain, "sat", "dinner").corridor!.minPer100G,
      caseDe(gain, "sat", "dinner").corridor!.preferredPer100G,
    ],
    [184, 184],
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
        personal: null,
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
  // ⟳ 2026-09-23 — [154, 154] sous 550 g (voir « deux bouches » ci-dessus).
  assertEquals(
    [ligne(avec, "dinner", "sat").minPer100G, ligne(avec, "dinner", "sat").preferredPer100G],
    [154, 154],
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
  //   déjeuner 2 413 × 0,40/0,75 = 1 286,93 ⇒ Dmin = ⌈128 693/550⌉ = 234 — tenable
  //   (⟳ 2026-09-23 — plafond de 550 g; 184 sous l'ancien plafond de 700.)
  // Il faut une cible plus grosse pour dépasser 250. On passe donc par le cas
  // RÉEL du rythme à un seul repas, où la relâche n'a nulle part où aller.
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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-12 · ÉTAPE C1 — LE BUDGET COUVERT BRUT, ET LE REPAS LÉGER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ C1 · le budget couvert sort en DEUX nombres: brut et net", () => {
  // Un shaker de 200 kcal au petit-déjeuner, fenêtre = les trois repas.
  // brut = 2 413 (la journée entière est couverte)
  // net  = 2 413 − 200 = 2 213
  const set = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"], {
      fixedKcalBySlot: new Map([["breakfast", 200]]),
    })],
  });
  const petitDej = caseDe(set, "sat", "breakfast");
  assertAlmostEquals(petitDej.coveredBudgetGrossKcal ?? -1, CIBLE_PAUL, 0.01);
  assertAlmostEquals(petitDej.coveredBudgetKcal ?? -1, CIBLE_PAUL - 200, 0.01);
  // ⛔ LE NET RESTE LE BUDGET À COMPOSER — rien n'est changé pour l'énergie.
  assertAlmostEquals(petitDej.fixedKcal, 200, 0.01);
  assertAlmostEquals(
    petitDej.mealTargetKcal! - petitDej.composeKcal!,
    200,
    0.01,
    "l'apport est retranché UNE fois, de SA case",
  );
});

Deno.test("⛔ C1 · sans apport fixe, brut et net sont le MÊME nombre", () => {
  // La propriété qui rend ce champ ajoutable sans déplacer un plan existant.
  const set = contrats();
  for (const c of set.contracts) {
    assertEquals(
      c.coveredBudgetGrossKcal,
      c.coveredBudgetKcal,
      "brut = net quand personne ne déclare rien",
    );
  }
});

Deno.test("⛔ C1 · un moment « léger » est PRÉSENT dans le contrat, et il pèse moins", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE DÉFAUT DE LA CAMPAGNE: le tir n° 5 déclarait son déjeuner léger par
  // `eating_rhythm[].size = "small"` — que RIEN ne lit pour le poids d'un
  // moment. `light_slots` valait `[]`, et le contrat n'a jamais porté `light`.
  //
  // L'arithmétique, à la main:
  //   ordinaire : 2 413 × 0,40 / (0,25+0,40+0,35)        = 965,20
  //   léger     : 2 413 × 0,25 / (0,25+0,25+0,35)        = 709,71…
  const ordinaire = contrats();
  const leger = contrats({ lightSlots: ["lunch"] });

  assertEquals(caseDe(ordinaire, "sat", "lunch").light, false);
  assertEquals(caseDe(leger, "sat", "lunch").light, true, "⛔ le contrat le PORTE");

  const avant = caseDe(ordinaire, "sat", "lunch").composeKcal!;
  const apres = caseDe(leger, "sat", "lunch").composeKcal!;
  assertAlmostEquals(avant, CIBLE_PAUL * 0.40, 0.01);
  assertAlmostEquals(apres, CIBLE_PAUL * (0.25 / 0.85), 0.01);
  assert(apres < avant, "un déjeuner léger pèse moins qu'un déjeuner ordinaire");

  // ⛔ ET LA JOURNÉE NE MAIGRIT PAS: ce que le déjeuner rend, les autres
  // moments le reprennent — les parts sont renormalisées.
  const sommeAvant = ["breakfast", "lunch", "dinner"]
    .reduce((n, s) => n + caseDe(ordinaire, "sat", s).composeKcal!, 0);
  const sommeApres = ["breakfast", "lunch", "dinner"]
    .reduce((n, s) => n + caseDe(leger, "sat", s).composeKcal!, 0);
  assertAlmostEquals(sommeApres, sommeAvant, 0.01);

  // ET LES BORNES SUIVENT: `plateBoundsFor` reçoit `light`, et c'est le
  // PLANCHER DE DENSITÉ qui bouge (1,00 → 0,60 kcal/g). Le plafond de masse,
  // lui, reste celui de la table — un déjeuner léger reste une assiette
  // d'adulte, il est simplement moins dense.
  const bornesAvant = caseDe(ordinaire, "sat", "lunch").bounds!;
  const bornesApres = caseDe(leger, "sat", "lunch").bounds!;
  assertEquals(bornesAvant.densityFloorPerG, 1);
  assertEquals(bornesApres.densityFloorPerG, 0.6);
  // Et le couloir transmis au modèle descend avec lui. ⟳ 2026-09-23 — sous
  // 550 g (138 → 102 sous l'ancien plafond de 700):
  //   ordinaire  96 520/550 = 175,49 ⇒ 176
  //   léger      70 970,59/550 = 129,04 ⇒ 130
  assertEquals(caseDe(ordinaire, "sat", "lunch").corridor?.minPer100G, 176);
  assertEquals(caseDe(leger, "sat", "lunch").corridor?.minPer100G, 130);
});

Deno.test("⛔ C1 · `eating_rhythm[].size` ne rend RIEN léger — c'est la garde", () => {
  // LE CAS QUI MORD, et c'est exactement la faute du harnais au tir n° 5:
  // déclarer `{"slot":"lunch","size":"small"}` et ne rien poser dans les
  // habitudes laisse le contrat ordinaire. Le rythme dit QUAND on mange et
  // avec quelle taille de PROSE; « léger » est une déclaration d'HABITUDE
  // (`household_member_habits.slots[].light`), et c'est elle qui pèse.
  const parLeRythme = contrats({
    // `rhythmSlots` ne porte que des jetons de moment: la taille n'y entre même
    // pas. C'est la preuve structurelle qu'elle ne peut pas alléger une case.
    rhythmSlots: ["breakfast", "lunch", "dinner"],
    lightSlots: [],
  });
  assertEquals(caseDe(parLeRythme, "sat", "lunch").light, false);
  assertAlmostEquals(
    caseDe(parLeRythme, "sat", "lunch").composeKcal!,
    CIBLE_PAUL * 0.40,
    0.01,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 1B ③/⑤ — « CALCULÉ » ET « CALCULÉ MAIS IMPOSSIBLE »
//
// ⛔ POINT ⑨ DE LA CLÔTURE DU 2026-09-14. Une part qui ne tient pas dans
// l'assiette sortait avec le statut `computed` et un couloir dont les DEUX
// extrémités avaient été rabattues sur `MAX_ASKABLE_DENSITY_PER_100G`: le
// prompt emportait un point unique parfaitement tenable en apparence, le
// produit servait bien au-delà, et la garde écrivait `conforme`.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("BÊTA 1B ③ — LE CAS QUI PASSE: trois repas, la journée tient, statut `computed`", () => {
  // ⛔ D'ABORD LE CAS NOMINAL. Sans lui, l'épreuve suivante serait vraie d'un
  // statut posé sur tout le monde.
  const set = contrats();
  for (const c of set.contracts) {
    assertEquals(c.status, "computed", `${c.slot}: ${c.status}`);
  }
  assertEquals(set.counters.density_infeasible, 0);
  assertEquals(
    infeasibleDemands({
      sets: [set],
      appetiteByMouth: new Map([["m-paul", "average"]]),
    }),
    [],
  );
});

/** La même journée, resserrée sur UN seul repas: 2 413 kcal dans une assiette. */
function journeeEtranglee() {
  return contrats({
    days: [jour("sat", "2026-09-12", ["lunch"])],
    rhythmSlots: ["lunch"],
  });
}

Deno.test("BÊTA 1B ③ — toute la journée sur un repas: la part NE TIENT PAS, et ça se dit", () => {
  const set = journeeEtranglee();
  const midi = caseDe(set, "sat", "lunch");
  // ⛔ LE STATUT, ET C'EST LUI QUI COMPTE: `computed` aurait laissé tout l'aval
  // croire que la consigne était tenable.
  assertEquals(midi.status, "density_infeasible");
  assertEquals(set.counters.density_infeasible, 1);
  // ⚠️ ET LE COULOIR GARDE SON MOTIF: on ne le retire pas, on le LIT.
  assertEquals(midi.corridor?.incompatible, "above_askable_cap");
  // ⛔ LE PIÈGE NOMMÉ PAR LE PLAN: les deux extrémités sont bien rabattues sur
  // le plafond. C'est précisément pour ça que le nombre seul ne suffit pas.
  assertEquals(midi.corridor?.minPer100G, MAX_ASKABLE_DENSITY_PER_100G);
  assertEquals(midi.corridor?.maxPer100G, MAX_ASKABLE_DENSITY_PER_100G);
});

Deno.test("BÊTA 1B ⑤ — le geste proposé est un réglage que la personne a déjà", () => {
  const demandes = infeasibleDemands({
    sets: [journeeEtranglee()],
    appetiteByMouth: new Map([["m-paul", "average"]]),
  });
  assertEquals(demandes.length, 1);
  assertEquals(demandes[0].slot, "lunch");
  assertEquals(demandes[0].dayToken, "sat");
  // ⛔ L'ORDRE EST CELUI DU MOINDRE RENONCEMENT: ajouter un moment ne retire
  // rien à personne; monter l'appétit défait une déclaration.
  assertEquals(demandes[0].actions, ["add_slot", "raise_appetite"]);
  // ⚠️ AUCUN CHIFFRE DANS LA SORTIE. Les calories et l'objectif de quelqu'un
  // sont protégés à l'écran, et cette liste y va.
  assertEquals(
    Object.keys(demandes[0]).filter((k) => k === "targetKcal" || k === "density"),
    [],
  );
});

Deno.test("BÊTA 1B ⑤ — « repas léger » déclaré ⇒ le retirer est proposé", () => {
  const set = contrats({
    days: [jour("sat", "2026-09-12", ["lunch"])],
    rhythmSlots: ["lunch"],
    lightSlots: ["lunch"],
  });
  const demandes = infeasibleDemands({
    sets: [set],
    appetiteByMouth: new Map([["m-paul", "large"]]),
  });
  assertEquals(demandes.length, 1);
  // ⚠️ `raise_appetite` A DISPARU, et c'est le point: proposer de monter un
  // appétit déjà au maximum enverrait la personne chercher un bouton qui ne
  // changerait rien.
  assertEquals(demandes[0].actions, ["add_slot", "unset_light"]);
});

Deno.test("BÊTA 1B ⑤ — à six moments, « ajoute un créneau » n'est plus proposé", () => {
  // ⛔ LE GESTE N'EXISTE PAS AU-DELÀ DE CE QUE L'ÉCRAN PROPOSE. `SLOT_DAY_WEIGHT`
  // couvre six moments; en suggérer un septième enverrait la personne chercher
  // un bouton absent.
  assertEquals(MAX_RHYTHM_SLOTS_FOR_ADVICE, 6);
  // ⚠️ LE DÉCOR EST CONSTRUIT À LA MAIN, ET C'EST DÉLIBÉRÉ. Un décor calculé à
  // six moments n'est pas forcément intenable — sa journée se divise — et le
  // test serait alors passé sans rien exercer. Ce dépôt appelle ça un test qui
  // ment; on pose donc directement le seul état que la règle lit.
  const six = [
    "breakfast",
    "lunch",
    "dinner",
    "snack_morning",
    "snack_afternoon",
    "snack_evening",
  ];
  const base = caseDe(journeeEtranglee(), "sat", "lunch");
  const large: SlotContractSet = {
    memberId: "m-paul",
    contracts: [{ ...base, rhythmSlots: six }],
    byKey: new Map(),
    dayTargetKcal: base.dayTargetKcal,
    reason: "anchored",
    gapClosed: "none",
    counters: {
      slots: 1,
      fixed_covered: 0,
      capped: 1,
      density_infeasible: 1,
      relaxed_days: 0,
      relax_refused: {},
      shared_slots: 0,
      shared_relaxed_days: 0,
      shared_moved_kcal: 0,
      shared_relax_refused: {},
      side_slots: 0,
      side_refused_slots: 0,
      side_base_kcal: 0,
      side_grown_kcal: 0,
      side_capped: 0,
      overflow_to_snacks_kcal: 0,
      overflow_to_dish: 0,
    },
  };
  const demandes = infeasibleDemands({
    sets: [large],
    appetiteByMouth: new Map([["m-paul", "large"]]),
  });
  // ⛔ LA DEMANDE EXISTE BIEN — sans ça, l'assertion suivante serait vraie par
  // vacuité, ce qui est exactement le défaut qu'on vient d'éviter.
  assertEquals(demandes.length, 1);
  assertEquals(demandes[0].actions.includes("add_slot"), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-21 — LA RELÂCHE DE TABLE : le surplus d'une case PARTAGÉE part
// vers les cases où la bouche mange SEULE, jamais dans la casserole des autres
// ═══════════════════════════════════════════════════════════════════════════
//
// Le décor est le plan `60c457cd` : un homme en prise de masse, cinq moments,
// petit-déjeuner / déjeuner / dîner partagés avec deux autres bouches, deux
// collations où il mange seul. Les nombres sont écrits en dur.
//
// ⟳ 2026-09-23 — LE SEUIL EST 115 (140 avant) ET L'ASSIETTE 550 g (700
// avant): un plat plein vaut 550 × 1,15 = 632,5 kcal. La relâche prend un
// argument de plus, `receivers`: `own_slots` est la règle d'avant (jour sans
// à-côtés), `snacks` celle d'un jour qui en porte (les collations seules
// reçoivent).
import {
  relaxSharedForTable,
  SHARED_TABLE_MAX_ASK_PER_100G,
  SLOT_OVERFLOWS,
  TABLE_RELAX_RECEIVERS,
} from "./slot_nutrition_contract.ts";
import type { SideCourseSlot, SideCourseSlotInput } from "./side_courses_types.ts";

const CINQ = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"] as const;

Deno.test("TABLE — épinglage: un plat partagé ne se demande jamais au-dessus de 115", () => {
  // 115 = 125 (densité du gabarit) ÷ 1,10, arrondi à 5.
  assertEquals(SHARED_TABLE_MAX_ASK_PER_100G, 115);
  assert(SHARED_TABLE_MAX_ASK_PER_100G < MAX_ASKABLE_DENSITY_PER_100G);
  assertEquals(TABLE_RELAX_RECEIVERS, ["own_slots", "snacks"]);
  assertEquals(SLOT_OVERFLOWS, ["none", "snacks", "hard_ceiling"]);
});

Deno.test("TABLE — le module pur: le surplus des cases partagées va aux collations, somme conservée", () => {
  // La journée de Thomas à 3 386 kcal, SANS à-côté. Plafond de table
  // 550 × 1,15 = 632,5 ; surplus: petit-déjeuner 705 − 632,5 = 72,5 ; déjeuner
  // 1 129 − 632,5 = 496,5 ; dîner 988 − 632,5 = 355,5 ⇒ 924,5, réparti au
  // prorata sur deux collations à 282 (300 g, place 300 × 2,5 − 282 = 468
  // chacune) ⇒ 462,25 chacune.
  const out = relaxSharedForTable({
    targets: new Map([
      ["breakfast", 705],
      ["snack_am", 282],
      ["lunch", 1129],
      ["snack_pm", 282],
      ["dinner", 988],
    ]),
    maxGramsBySlot: new Map([
      ["breakfast", 550],
      ["snack_am", 300],
      ["lunch", 550],
      ["snack_pm", 300],
      ["dinner", 550],
    ]),
    overflowSlots: ["breakfast", "lunch", "dinner"],
    lockedSlots: [],
    lightSlots: [],
    receivers: "own_slots",
  });
  assertEquals(out.refusal, null);
  assertAlmostEquals(out.moved, 924.5, 0.01);
  assertAlmostEquals(out.targets.get("breakfast")!, 632.5, 0.01);
  assertAlmostEquals(out.targets.get("lunch")!, 632.5, 0.01);
  assertAlmostEquals(out.targets.get("dinner")!, 632.5, 0.01);
  assertAlmostEquals(out.targets.get("snack_am")!, 744.25, 0.01);
  assertAlmostEquals(out.targets.get("snack_pm")!, 744.25, 0.01);
  const apres = [...out.targets.values()].reduce((n, v) => n + v, 0);
  assertAlmostEquals(apres, 3386, 0.01, "la relâche a créé ou perdu de l'énergie");
});

Deno.test("TABLE — sans case où manger seul, rien ne bouge et le refus est nommé", () => {
  const out = relaxSharedForTable({
    targets: new Map([["breakfast", 548], ["lunch", 1129], ["dinner", 767]]),
    maxGramsBySlot: new Map([["breakfast", 550], ["lunch", 550], ["dinner", 550]]),
    overflowSlots: ["breakfast", "lunch", "dinner"],
    lockedSlots: [],
    lightSlots: [],
    receivers: "own_slots",
  });
  assertEquals(out.refusal, "no_own_slot");
  assertEquals(out.moved, 0);
  assertEquals(out.targets.get("lunch"), 1129, "la cible n'a pas été rabotée en silence");
});

Deno.test("TABLE — une table qui tient sous 115 n'est pas touchée", () => {
  // Fabrice, exemple du plan: repas de midi 723 kcal, à-côté 140 ⇒ plat 583
  // kcal dans 550 g ⇒ 106. Rien à déplacer.
  const out = relaxSharedForTable({
    targets: new Map([["breakfast", 452], ["lunch", 583], ["dinner", 540]]),
    maxGramsBySlot: new Map([["breakfast", 550], ["lunch", 550], ["dinner", 550]]),
    overflowSlots: ["breakfast", "lunch", "dinner"],
    lockedSlots: [],
    lightSlots: [],
    receivers: "snacks",
  });
  assertEquals(out.refusal, "no_shared_surplus");
  assertEquals(out.moved, 0);
});

Deno.test("TABLE — la collation qui sature prend sa place, le reste va à l'autre", () => {
  // Deux collations: l'une déjà pleine (300 g × 2,5 = 750, cible 740 ⇒ place 10),
  // l'autre à 282 (place 468). Déjeuner 900 ⇒ surplus 900 − 632,5 = 267,5
  // ⇒ 10 à la première, 257,5 à la seconde.
  const out = relaxSharedForTable({
    targets: new Map([["snack_am", 740], ["lunch", 900], ["snack_pm", 282]]),
    maxGramsBySlot: new Map([["snack_am", 300], ["lunch", 550], ["snack_pm", 300]]),
    overflowSlots: ["lunch"],
    lockedSlots: [],
    lightSlots: [],
    receivers: "snacks",
  });
  assertAlmostEquals(out.moved, 267.5, 0.01);
  assertAlmostEquals(out.targets.get("snack_am")!, 750, 0.01);
  assertAlmostEquals(out.targets.get("snack_pm")!, 539.5, 0.01);
  assertAlmostEquals(out.targets.get("lunch")!, 632.5, 0.01);
});

Deno.test("⟳ 2026-09-23 — TABLE: en mode `snacks`, un petit-déjeuner ne reçoit plus rien", () => {
  // Petit-déjeuner 400 (550 g), déjeuner 800 (550 g), goûter 150 (300 g).
  // Surplus du déjeuner: 800 − 632,5 = 167,5.
  const base = {
    maxGramsBySlot: new Map([["breakfast", 550], ["lunch", 550], ["snack_pm", 300]]),
    overflowSlots: ["lunch"],
    lockedSlots: [],
    lightSlots: [],
  };
  const cibles = new Map([["breakfast", 400], ["lunch", 800], ["snack_pm", 150]]);
  // ── LE CAS QUI PASSE: tout va au goûter (place 750 − 150 = 600).
  const snacks = relaxSharedForTable({ ...base, targets: cibles, receivers: "snacks" });
  assertAlmostEquals(snacks.moved, 167.5, 0.01);
  assertEquals(snacks.targets.get("breakfast"), 400);
  assertAlmostEquals(snacks.targets.get("snack_pm")!, 317.5, 0.01);
  assertAlmostEquals(snacks.targets.get("lunch")!, 632.5, 0.01);
  // ── LE CAS QUI MORD: la règle d'avant donne au petit-déjeuner, au prorata
  // de la cible: 167,5 × 400/550 = 121,82 et 167,5 × 150/550 = 45,68.
  const avant = relaxSharedForTable({ ...base, targets: cibles, receivers: "own_slots" });
  assertAlmostEquals(avant.targets.get("breakfast")!, 521.82, 0.01);
  assertAlmostEquals(avant.targets.get("snack_pm")!, 195.68, 0.01);
  // ⚠️ SANS COLLATION, le refus garde son nom: il n'y a personne pour recevoir.
  const sansGouter = relaxSharedForTable({
    ...base,
    targets: new Map([["breakfast", 400], ["lunch", 800]]),
    receivers: "snacks",
  });
  assertEquals(sansGouter.refusal, "no_own_slot");
  assertEquals(sansGouter.moved, 0);
  assertEquals(sansGouter.targets.get("breakfast"), 400);
  assertEquals(sansGouter.targets.get("lunch"), 800);
});

Deno.test("⛔ TABLE — dans le contrat, jour SANS à-côtés: les cases partagées descendent à 115, les collations montent, le budget couvert est conservé", () => {
  // Max en prise à 0,45 kg/sem, âge exact: 3 099 kcal ; Σ poids = 1,20.
  //   petit-déjeuner 3 099 × 0,25/1,20 =   645,625 ⇒ 117,4 pour 100 g > 115
  //   déjeuner       3 099 × 0,40/1,20 = 1 033,000 ⇒ 187,8 pour 100 g > 115
  //   dîner          3 099 × 0,35/1,20 =   903,875 ⇒ 164,3 pour 100 g > 115
  //   collations     3 099 × 0,10/1,20 =   258,250 chacune (plafond 258 g)
  // Surplus: 13,125 + 400,5 + 271,375 = 685 ; place de chaque collation
  // 258 × 2,5 − 258,25 = 386,75 ⇒ tout passe, 342,5 chacune.
  const set = contrats({
    mouth: bouche({
      memberId: "m-max",
      body: MAX,
      direction: "up",
      paceKgPerWeek: 0.45,
      declaredSlots: [...CINQ],
    }),
    ageYears: 28,
    rhythmSlots: [...CINQ],
    days: [jour("sat", "2026-09-12", [...CINQ], {
      sharedSlots: ["breakfast", "lunch", "dinner"],
    })],
  });
  assertEquals(caseDe(set, "sat", "lunch").dayTargetKcal, 3099);
  assertEquals(set.counters.shared_slots, 3);
  assertEquals(set.counters.shared_relaxed_days, 1);
  assertEquals(set.counters.shared_moved_kcal, 685);
  // ⚠️ `overflow_to_snacks_kcal` NE COMPTE QUE LE MODE À-CÔTÉS: ce jour-ci
  // porte `sides: null`, sa relâche est celle d'avant.
  assertEquals(set.counters.overflow_to_snacks_kcal, 0);
  const dej = caseDe(set, "sat", "lunch");
  assertAlmostEquals(dej.composeKcal!, 632.5, 0.01);
  assertEquals(dej.corridor!.minPer100G, 115);
  assertAlmostEquals(dej.redistributedKcal, -400.5, 0.01);
  // Les deux collations reçoivent le surplus, au prorata (égales ⇒ moitié).
  const am = caseDe(set, "sat", "snack_am");
  const pm = caseDe(set, "sat", "snack_pm");
  assertAlmostEquals(am.composeKcal!, 600.75, 0.01);
  assertAlmostEquals(pm.composeKcal!, 600.75, 0.01);
  assertAlmostEquals(am.redistributedKcal, 342.5, 0.01);
  // ⟳ 2026-09-23 — le dîner (164 pour 100 g) ne tient plus sous 115: il
  // descend aussi. Le petit-déjeuner aussi, de 13,125.
  assertAlmostEquals(caseDe(set, "sat", "dinner").redistributedKcal, -271.375, 0.01);
  assertAlmostEquals(caseDe(set, "sat", "breakfast").redistributedKcal, -13.125, 0.01);
  const somme = set.contracts.reduce((n, c) => n + (c.composeKcal ?? 0), 0);
  assertAlmostEquals(somme, dej.coveredBudgetKcal!, 1e-6, "le budget couvert a bougé");
  // ⛔ ET RIEN N'EST UN À-CÔTÉ: un jour `sides: null` n'en porte aucun.
  for (const c of set.contracts) {
    assertEquals([c.sideKcal, c.sideCourses.length, c.overflow], [0, 0, "none"]);
  }
  // ── LE CAS QUI PASSE: la même journée sans case partagée ne bouge pas ──
  const seul = contrats({
    mouth: bouche({
      memberId: "m-max",
      body: MAX,
      direction: "up",
      paceKgPerWeek: 0.45,
      declaredSlots: [...CINQ],
    }),
    ageYears: 28,
    rhythmSlots: [...CINQ],
    days: [jour("sat", "2026-09-12", [...CINQ])],
  });
  assertEquals(seul.counters.shared_slots, 0);
  assertEquals(seul.counters.shared_relaxed_days, 0);
  assertAlmostEquals(caseDe(seul, "sat", "lunch").composeKcal!, 1033, 0.01);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-23 — LES À-CÔTÉS DANS LE CONTRAT (chantier « assiettes normales »)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ `composeKcal` EST LE PLAT SEUL, `sideKcal` L'À-CÔTÉ. L'invariant de chaque
// journée: Σ composeKcal + Σ sideKcal = coveredBudgetKcal, au centième.
// Les entrées d'à-côté sont écrites à la main (ce que `planSideCourses`
// rendrait), jamais lues dans les constantes du socle: un test qui les lirait
// resterait vert quand elles changent.

/** Le corps de Thomas: 187 cm, 72 kg, 28 ans, prise de masse. */
const THOMAS = {
  heightCm: 187,
  weightKg: 72,
  gender: "male" as const,
  ageYears: 28,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
/**
 * ⚠️ LE CRAN QUI REND 3 386 kcal SUR CE CORPS, à l'âge exact: entretien
 * 1 753,75 × 1,80 = 3 157, plus 0,208 × 1 100 = 228,8 ⇒ 3 386 — la journée
 * de l'audit du 2026-09-23. Ce n'est pas un cran de l'écran: c'est une
 * fixture qui fabrique la journée mesurée.
 */
const THOMAS_PACE = 0.208;

/** Prise de masse: fromage 130 + dessert 180, le pain en croissance. */
const PRISE: SideCourseSlotInput = {
  courses: [{ kind: "cheese", baseKcal: 130 }, { kind: "dessert", baseKcal: 180 }],
  growKinds: ["bread", "cheese", "dessert"],
  refused: false,
  capShare: 0.35,
  light: false,
};
/** La personne refuse tous les à-côtés à ce moment. */
const REFUS: SideCourseSlotInput = {
  courses: [],
  growKinds: [],
  refused: true,
  capShare: 0.35,
  light: false,
};

function sides(
  entries: [SideCourseSlot, SideCourseSlotInput][],
): ReadonlyMap<SideCourseSlot, SideCourseSlotInput> {
  return new Map(entries);
}

function journeeThomas(sidesDuJour: ContractDay["sides"], date = "2026-09-12", tok = "sat") {
  return contrats({
    mouth: bouche({
      memberId: "m-thomas",
      body: THOMAS,
      direction: "up",
      paceKgPerWeek: THOMAS_PACE,
      declaredSlots: [...CINQ],
    }),
    ageYears: 28,
    rhythmSlots: [...CINQ],
    days: [jour(tok, date, [...CINQ], { sides: sidesDuJour })],
  });
}

/** Σ plat + Σ à-côté d'une journée — le repas entier. */
function repasEntiers(set: { contracts: readonly SlotNutritionContract[] }): number {
  return set.contracts.reduce((n, c) => n + (c.composeKcal ?? 0) + c.sideKcal, 0);
}

Deno.test("⛔ À-CÔTÉS — la journée de Thomas: plat plein à 632,5, l'à-côté à 35 %, le reste aux collations", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // 3 386 kcal, cinq moments (Σ poids 1,20), à-côtés au déjeuner seulement.
  //   déjeuner  3 386 × 0,40/1,20 = 1 128,667
  //   à-côté    plafond 0,35 × 1 128,667 = 395,033 ; base 130 + 180 = 310
  //   plat plein 550 × 1,15 = 632,5 ; besoin 1 128,667 − 310 − 632,5 = 186,167
  //   place     395,033 − 310 = 85,033 ≥ 50 ⇒ le PAIN, 85,033
  //   plat      1 128,667 − 395,033 = 733,633 ⇒ débordement 101,133
  //   collations 3 386 × 0,10/1,20 = 282,167 chacune ; plafond 282 g, place
  //             282 × 2,5 − 282,167 = 422,83 ⇒ +50,567 chacune
  // ══════════════════════════════════════════════════════════════════════════
  const set = journeeThomas(sides([["lunch", PRISE]]));
  assertEquals(set.dayTargetKcal, 3386);
  const dej = caseDe(set, "sat", "lunch");
  assertAlmostEquals(dej.mealTargetKcal!, 1128.667, 0.01);
  assertAlmostEquals(dej.composeKcal!, 632.5, 0.01);
  assertAlmostEquals(dej.sideKcal, 395.033, 0.01);
  assertAlmostEquals(dej.sideGrowthKcal, 85.033, 0.01);
  assertEquals(dej.sideRefused, false);
  assertEquals(dej.overflow, "snacks");
  assertEquals(dej.sideCourses.map((c) => c.kind), ["cheese", "dessert", "bread"]);
  assertAlmostEquals(dej.sideCourses[2].kcal, 85.033, 0.01);
  // ⛔ LE DÉPLACEMENT SE LIT SUR LE PLAT, pas sur le repas: 632,5 − 733,633.
  assertAlmostEquals(dej.redistributedKcal, -101.133, 0.01);
  // Le plat tient dans 550 g à 115 pour 100 g; la visée est le gabarit.
  assertEquals([dej.bounds!.max, dej.corridor!.minPer100G, dej.corridor!.preferredPer100G], [550, 115, 125]);
  for (const slot of ["snack_am", "snack_pm"]) {
    const c = caseDe(set, "sat", slot);
    assertAlmostEquals(c.composeKcal!, 332.733, 0.01);
    assertAlmostEquals(c.redistributedKcal, 50.567, 0.01);
  }
  // ⚠️ LE PETIT-DÉJEUNER ET LE DÎNER NE BOUGENT PAS: aucun des deux n'est dans
  // l'ensemble qui déborde (pas d'entrée `sides`, pas de case partagée).
  assertAlmostEquals(caseDe(set, "sat", "breakfast").composeKcal!, 705.417, 0.01);
  assertAlmostEquals(caseDe(set, "sat", "dinner").composeKcal!, 987.583, 0.01);
  // ⛔ L'INVARIANT: plats + à-côtés = budget couvert.
  assertAlmostEquals(repasEntiers(set), dej.coveredBudgetKcal!, 0.01);
  assertAlmostEquals(dej.coveredBudgetKcal!, 3386, 0.01);
  assertAlmostEquals(set.contracts.reduce((n, c) => n + c.redistributedKcal, 0), 0, 1e-6);
  assertEquals(set.counters.side_slots, 1);
  assertEquals(set.counters.side_refused_slots, 0);
  assertEquals(set.counters.side_base_kcal, 310);
  assertEquals(set.counters.side_grown_kcal, 85);
  assertEquals(set.counters.side_capped, 1);
  assertEquals(set.counters.overflow_to_snacks_kcal, 101);
  assertEquals(set.counters.overflow_to_dish, 0);
});

Deno.test("⛔ À-CÔTÉS — `sides: null` rend le contrat d'avant: le déjeuner garde tout, rien ne bouge", () => {
  // LE CAS QUI MORD du test précédent: la même journée, sans à-côté. Le
  // déjeuner n'est pas partagé, donc il ne déborde pas: 1 128,667 kcal dans
  // son assiette, et les collations restent à 282,167.
  const set = journeeThomas(null);
  const dej = caseDe(set, "sat", "lunch");
  assertAlmostEquals(dej.composeKcal!, 1128.667, 0.01);
  assertEquals([dej.sideKcal, dej.sideGrowthKcal, dej.sideCourses.length], [0, 0, 0]);
  assertEquals([dej.sideRefused, dej.overflow], [false, "none"]);
  assertEquals(dej.redistributedKcal, 0);
  assertAlmostEquals(caseDe(set, "sat", "snack_am").composeKcal!, 282.167, 0.01);
  // ⛔ TOUS LES COMPTEURS NEUFS EXISTENT, À ZÉRO: absent ≠ zéro.
  assertEquals(
    [
      set.counters.side_slots,
      set.counters.side_refused_slots,
      set.counters.side_base_kcal,
      set.counters.side_grown_kcal,
      set.counters.side_capped,
      set.counters.overflow_to_snacks_kcal,
      set.counters.overflow_to_dish,
    ],
    [0, 0, 0, 0, 0, 0, 0],
  );
});

/**
 * Une femme en perte: 170 cm, 56 kg, 40 ans, 0,25 kg/sem ⇒ **1 781 kcal**. Le
 * corps est choisi pour que le déjeuner (0,40 × 1 781 = 712,4) dépasse le plat
 * plein de 632,5 et que le dîner (0,35 × 1 781 = 623,35) n'y arrive pas.
 */
const LEGERE = {
  heightCm: 170,
  weightKg: 56,
  gender: "female" as const,
  ageYears: 40,
  activityLevel: "trains_some" as const,
  activityAxes: { day: "seated" as const, sport: "3_4" as const, asked: true },
  appetite: "average" as AppetiteLevel | null,
};

function journeeLegere(slots: readonly string[]) {
  return contrats({
    mouth: bouche({
      memberId: "m-legere",
      body: LEGERE,
      direction: "down",
      paceKgPerWeek: 0.25,
      declaredSlots: slots,
    }),
    // ⟳ 2026-09-24 — ⚠️ ÂGE INCONNU DU CONTRAT ⇒ LA TABLE D'ÂGE SEULE, sans
    // plafond personnel (`personalPlateBoundsFor` rend `null`). Ces tests
    // portent sur le débordement sous le plat plein de la TABLE (632,5), et
    // le corps a été choisi pour lui; son plafond personnel (entretien 2 056,
    // 514 g ⇒ 591,1 kcal) ferait déborder le dîner aussi. La cible de journée
    // ne bouge pas: elle lit l'âge du corps, pas ce paramètre.
    ageYears: null,
    rhythmSlots: slots,
    days: [jour("sat", "2026-09-12", slots, {
      sides: sides([["lunch", REFUS], ["dinner", REFUS]]),
    })],
  });
}

Deno.test("⛔ À-CÔTÉS — elle refuse tout, trois repas sans collation: le déjeuner monte au repli de 700 g", () => {
  // Décision n° 1: « le surplus va d'abord à ses collations, sinon le plat
  // monte jusqu'à 700 g ».
  //   petit-déjeuner 0,25 × 1 781 = 445,25 ; déjeuner 712,4 ; dîner 623,35
  //   déjeuner: aucun receveur ⇒ le débordement (79,9) reste dans le plat
  //   bornes du repli: Gmax = min(712,4 ; 700) = 700 ; Dmin = ⌈71 240/700⌉ = 102
  const set = journeeLegere(["breakfast", "lunch", "dinner"]);
  assertEquals(set.dayTargetKcal, 1781);
  const dej = caseDe(set, "sat", "lunch");
  assertAlmostEquals(dej.composeKcal!, 712.4, 0.01);
  assertEquals([dej.sideKcal, dej.sideRefused, dej.overflow], [0, true, "hard_ceiling"]);
  assertEquals([dej.bounds!.min, dej.bounds!.max, dej.bounds!.physicalMax], [250, 700, 700]);
  assertEquals(dej.corridor!.minPer100G, 102);
  assertEquals(dej.redistributedKcal, 0);
  // ⛔ LE DÎNER TIENT SOUS 632,5: refusé aussi, mais il garde 550 g.
  const diner = caseDe(set, "sat", "dinner");
  assertEquals([diner.sideRefused, diner.overflow, diner.bounds!.max], [true, "none", 550]);
  // ⛔ LE PETIT-DÉJEUNER NE REÇOIT RIEN, même avec toute la place du monde.
  assertAlmostEquals(caseDe(set, "sat", "breakfast").composeKcal!, 445.25, 0.01);
  assertEquals(caseDe(set, "sat", "breakfast").redistributedKcal, 0);
  assertEquals(set.counters.overflow_to_dish, 1);
  assertEquals(set.counters.side_slots, 2);
  assertEquals(set.counters.side_refused_slots, 2);
  assertEquals(set.counters.shared_relax_refused, { no_own_slot: 1 });
  assertAlmostEquals(repasEntiers(set), 1781, 0.01);
});

Deno.test("⛔ À-CÔTÉS — elle refuse tout, déjeuner seul et un goûter: le surplus part au goûter", () => {
  // Quatre moments (Σ poids 1,10):
  //   déjeuner 1 781 × 0,40/1,10 = 647,636 ⇒ débordement 15,136
  //   goûter   1 781 × 0,10/1,10 = 161,909 ; plafond 162 g, place
  //            162 × 2,5 − 161,909 = 243,09 ⇒ tout passe
  // ⛔ LE DÉJEUNER N'EST PAS PARTAGÉ: sous la règle d'avant, il ne débordait
  // jamais. C'est l'entrée `sides` — refus compris — qui le fait déborder.
  const quatre = ["breakfast", "lunch", "snack_pm", "dinner"];
  const set = journeeLegere(quatre);
  const dej = caseDe(set, "sat", "lunch");
  assertAlmostEquals(dej.composeKcal!, 632.5, 0.01);
  assertEquals([dej.overflow, dej.bounds!.max], ["snacks", 550]);
  assertAlmostEquals(dej.redistributedKcal, -15.136, 0.01);
  assertAlmostEquals(caseDe(set, "sat", "snack_pm").composeKcal!, 177.045, 0.01);
  assertAlmostEquals(caseDe(set, "sat", "breakfast").composeKcal!, 404.773, 0.01);
  assertEquals(set.counters.overflow_to_dish, 0);
  assertEquals(set.counters.overflow_to_snacks_kcal, 15);
  assertAlmostEquals(repasEntiers(set), 1781, 0.01);
});

Deno.test("⛔ À-CÔTÉS — un jour qui en porte ne donne plus au petit-déjeuner: `null` contre une `Map` vide", () => {
  // Paul, trois repas, déjeuner PARTAGÉ (965,2 kcal ⇒ surplus 332,7).
  //   `null`  la règle d'avant: petit-déjeuner et dîner, seuls, reçoivent au
  //           prorata de leur cible — 332,7 × 603,25/1 447,8 = 138,625 et
  //           332,7 × 844,55/1 447,8 = 194,075;
  //   `Map`   même vide, les receveurs ne sont plus que les collations: il
  //           n'y en a pas, le déjeuner garde tout et passe au repli.
  const avant = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"], {
      sharedSlots: ["lunch"],
    })],
  });
  assertAlmostEquals(caseDe(avant, "sat", "breakfast").redistributedKcal, 138.625, 0.01);
  assertAlmostEquals(caseDe(avant, "sat", "dinner").redistributedKcal, 194.075, 0.01);
  assertAlmostEquals(caseDe(avant, "sat", "lunch").composeKcal!, 632.5, 0.01);
  assertEquals(caseDe(avant, "sat", "lunch").overflow, "none");

  const apres = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"], {
      sharedSlots: ["lunch"],
      sides: sides([]),
    })],
  });
  assertEquals(caseDe(apres, "sat", "breakfast").redistributedKcal, 0);
  assertEquals(caseDe(apres, "sat", "dinner").redistributedKcal, 0);
  const dej = caseDe(apres, "sat", "lunch");
  assertAlmostEquals(dej.composeKcal!, 965.2, 0.01);
  // Repli: Gmax = min(965,2 ; 700) = 700 ; Dmin = ⌈96 520/700⌉ = ⌈137,89⌉ = 138
  assertEquals([dej.overflow, dej.bounds!.max, dej.corridor!.minPer100G], ["hard_ceiling", 700, 138]);
  assertEquals(apres.counters.overflow_to_dish, 1);
  assertEquals(apres.counters.side_slots, 0);
});

Deno.test("⛔ À-CÔTÉS — un mineur: la part de l'à-côté est bornée à 25 %, par l'âge OU par l'état", () => {
  // Un adolescent de 16 ans, 170 cm, 60 kg, sans objectif ⇒ 2 831 kcal.
  //   déjeuner 0,40 × 2 831 = 1 132,4 ; plafond de part 0,25 (et non 0,35)
  //   ⇒ 283,1 < base 310 ⇒ rabotée au prorata: fromage 130 × 283,1/310 =
  //   118,72, dessert 164,38 ; plat 849,3.
  const ado = { ...PAUL, ageYears: 16, weightKg: 60, heightCm: 170 };
  const mineur = (ageState: "minor" | "adult", ageYears: number | null) =>
    contrats({
      mouth: bouche({ memberId: "m-ado", ageState, body: ado, direction: null, paceKgPerWeek: null }),
      ageYears,
      days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"], {
        sides: sides([["lunch", PRISE]]),
      })],
    });
  const ado16 = mineur("minor", 16);
  assertEquals(ado16.dayTargetKcal, 2831);
  const dej = caseDe(ado16, "sat", "lunch");
  assertAlmostEquals(dej.sideKcal, 283.1, 0.01);
  assertAlmostEquals(dej.sideCourses[0].kcal, 118.723, 0.01);
  assertAlmostEquals(dej.composeKcal!, 849.3, 0.01);
  assertEquals(ado16.counters.side_capped, 1);
  // ⚠️ PAS DE REPLI CHEZ L'ADOLESCENT: le débordement reste dans le plat, et
  // ses bornes restent celles de sa table (550 g).
  assertEquals([dej.overflow, dej.bounds!.max], ["hard_ceiling", 550]);
  // ⛔ L'ÉTAT SEUL SUFFIT: âge inconnu (bornes d'adulte), mais mineur déclaré.
  const parEtat = caseDe(mineur("minor", null), "sat", "lunch");
  assertAlmostEquals(parEtat.sideKcal, 283.1, 0.01);
  assertEquals(parEtat.bounds!.max, 700);
  // ⛔ L'ÂGE SEUL SUFFIT AUSSI: une fiche dite adulte, mais 16 ans connus.
  // Journée 1 900 (équation adulte) ⇒ déjeuner 760 ⇒ plafond 0,25 × 760 = 190
  // (et non 0,35 × 760 = 266).
  const parAge = mineur("adult", 16);
  assertEquals(parAge.dayTargetKcal, 1900);
  assertAlmostEquals(caseDe(parAge, "sat", "lunch").sideKcal, 190, 0.01);
  // ── LE CAS QUI MORD: Paul adulte, même entrée. Plafond 0,35 × 965,2 =
  // 337,82 ; besoin 965,2 − 310 − 632,5 = 22,7 < 50 ⇒ pas de pain, le fromage
  // s'étend: 130 + 22,7. Plat 632,5 pile, rien ne déborde.
  const adulte = contrats({
    days: [jour("sat", "2026-09-12", ["breakfast", "lunch", "dinner"], {
      sides: sides([["lunch", PRISE]]),
    })],
  });
  const dejA = caseDe(adulte, "sat", "lunch");
  assertAlmostEquals(dejA.sideKcal, 332.7, 0.01);
  assertEquals(dejA.sideCourses.map((c) => [c.kind, Math.round(c.kcal * 10) / 10]), [["cheese", 152.7], ["dessert", 180]]);
  assertAlmostEquals(dejA.composeKcal!, 632.5, 0.01);
  assertEquals([dejA.overflow, adulte.counters.side_capped], ["none", 0]);
});

Deno.test("⛔ À-CÔTÉS — l'invariant tient sur une journée chargée: partage, refus, léger, apport fixe", () => {
  // Thomas, cinq moments, table partagée matin-midi-soir, goûter du matin
  // léger, un shaker de 150 kcal au petit-déjeuner, à-côtés au déjeuner,
  // refus au dîner. ⚠️ Une clé `breakfast` glissée par un transtypage n'est
  // JAMAIS lue: seuls le déjeuner et le dîner portent un à-côté.
  const entree = new Map<SideCourseSlot, SideCourseSlotInput>([
    ["lunch", PRISE],
    ["dinner", REFUS],
    ["breakfast" as unknown as SideCourseSlot, PRISE],
  ]);
  const set = contrats({
    mouth: bouche({
      memberId: "m-thomas",
      body: THOMAS,
      direction: "up",
      paceKgPerWeek: THOMAS_PACE,
      declaredSlots: [...CINQ],
    }),
    ageYears: 28,
    rhythmSlots: [...CINQ],
    lightSlots: ["snack_am"],
    days: [jour("sat", "2026-09-12", [...CINQ], {
      sharedSlots: ["breakfast", "lunch", "dinner"],
      fixedKcalBySlot: new Map([["breakfast", 150]]),
      sides: entree,
    })],
  });
  const couvert = caseDe(set, "sat", "lunch").coveredBudgetKcal!;
  assertAlmostEquals(repasEntiers(set), couvert, 0.01, "plats + à-côtés ≠ budget couvert");
  assertAlmostEquals(set.contracts.reduce((n, c) => n + c.redistributedKcal, 0), 0, 1e-6);
  assertEquals(set.counters.side_slots, 2);
  assertEquals(caseDe(set, "sat", "breakfast").sideKcal, 0);
  assert(caseDe(set, "sat", "lunch").sideKcal > 0);
  assertEquals(caseDe(set, "sat", "dinner").sideRefused, true);
  for (const c of set.contracts) assert(SLOT_OVERFLOWS.includes(c.overflow), c.overflow);
});

Deno.test("⛔ À-CÔTÉS — recoller deux journées additionne les compteurs neufs", () => {
  const sam = journeeThomas(sides([["lunch", PRISE]]), "2026-09-12", "sat");
  const dim = journeeThomas(sides([["lunch", PRISE]]), "2026-09-13", "sun");
  const tout = mergeSlotContractSets([sam, dim]);
  assertEquals(tout.counters.side_slots, 2);
  assertEquals(tout.counters.side_base_kcal, 620);
  assertEquals(tout.counters.side_grown_kcal, 170);
  assertEquals(tout.counters.side_capped, 2);
  assertEquals(tout.counters.overflow_to_snacks_kcal, 202);
  assertEquals(tout.counters.overflow_to_dish, 0);
});
