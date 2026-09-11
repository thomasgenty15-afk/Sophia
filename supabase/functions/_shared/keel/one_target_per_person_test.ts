/**
 * ══════════════════════════════════════════════════════════════════════════
 * UNE SEULE CIBLE PAR PERSONNE, UNE SEULE BANDE DE GRAMMES PAR REPAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ce fichier tient le contrat du lot du 2026-09-10, et rien d'autre:
 *
 *   ① une cible du jour calculée depuis TOUT ce que la personne a renseigné —
 *      âge, sexe, taille, poids, activité (cran + les deux axes), objectif et
 *      son rythme;
 *   ② la MÊME cible sur les deux lanes, à ±1 kcal;
 *   ③ une part par moment au prorata de `SLOT_DAY_WEIGHT`, sur les moments
 *      DÉCLARÉS — cinq moments ne pèsent pas comme trois;
 *   ④ une bande de grammes par repas DÉRIVÉE de cette part;
 *   ⑤ deux crans qui s'appliquent UNE fois chacun, et PAS au même endroit:
 *      le retour « trop / pas assez » sur la CIBLE (il répond à « la portion
 *      servie était-elle trop grosse ? »), l'appétit sur les BORNES DE MASSE
 *      (⟳ 2026-09-10: il décrit un volume d'assiette, pas une dépense).
 *
 * ── CE QUE CHACUN DE CES TESTS FAISAIT AVANT LE LOT ───────────────────────
 * Aucun n'est décoratif; le motif est écrit au-dessus de chaque `Deno.test`.
 * Un test qui n'a jamais été rouge ne prouve rien.
 *
 * ── LES QUATRE MUTATIONS, MESURÉES LE 2026-09-10 ──────────────────────────
 * Chacune remet en place UNE moitié de l'état d'avant le lot, et chacune fait
 * rougir exactement les tests qui décrivent cette moitié-là:
 *
 *   `APPETITE_FACTORS.large` → 1,00 ............... 1 rouge (⑤ appétit)
 *   `maintenanceKcalOf` → le raccourci au poids ... 5 rouges (① ×2, ② ×2, ⑤ appétit)
 *   `dayTargetFor` cesse de lire le cran ......... 2 rouges (②, ⑤ retour)
 *   `plateBoundsFor` → la table seule ............ 3 rouges (④, ⑤ ×2)
 *
 * ⚠️ AUCUNE NE FAIT ROUGIR TOUT LE FICHIER, et c'est la propriété qu'on
 * cherche: des tests qui tombent tous ensemble ne mesurent qu'une chose.
 */

import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  adultMaintenanceKcal,
  APPETITE_FACTORS,
  type MouthBody,
  PORTION_ADJUST_STEP,
  dayTargetKcalOf,
  envelopeFor,
} from "./meal_envelope.ts";
import { type AnchorMouth, slotPlanTargets, SLOT_DAY_WEIGHT, withPortionCran } from "./mouth_anchor.ts";
import { dayTargetFor, densityCorridorFor, plateBoundsFor } from "./portion_sizing.ts";
import { envelopeDirectionFor } from "./weight_pace.ts";
import { portionIndexFor } from "./feedback_index.ts";
import { parseRetainedItem, type PortionAdjustItem } from "./retained_item.ts";
import type { MealBodyContext } from "./meal_body.ts";
import type { AppetiteLevel } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LA MÊME PERSONNE, DÉCRITE UNE FOIS, RENDUE DANS LES DEUX FORMES
// ---------------------------------------------------------------------------
//
// ⛔ UNE SEULE SOURCE POUR LES DEUX LANES. Deux fixtures écrites à la main
// finiraient par décrire deux personnes, et le test « même cible » deviendrait
// un test sur la discipline de qui l'a écrit.

const PERSON = {
  heightCm: 178,
  weightKg: 76,
  gender: "male" as const,
  ageYears: 37,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
};

/** La forme que la lane FOYER lit: une ligne de `household_member_bodies`. */
function mouthBody(over: { appetite?: AppetiteLevel | null } = {}): MouthBody {
  return { ...PERSON, appetite: over.appetite ?? null };
}

/** La forme que la lane SOLO lit: `profiles` + la série de pesées. */
function soloBody(): MealBodyContext {
  return {
    heightCm: PERSON.heightCm,
    ageBand: "30_44",
    gender: PERSON.gender,
    latestWeight: { weekStart: "2026-09-07", value: PERSON.weightKg },
    latestWaist: null,
    declaredWeightKg: null,
    restrictionFlag: false,
  };
}

const TROIS_MOMENTS = ["breakfast", "lunch", "dinner"];
const CINQ_MOMENTS = ["breakfast", "lunch", "snack_pm", "dinner", "before_bed"];

function mouth(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-1",
    ageState: "adult",
    restriction: "clear",
    body: mouthBody(),
    direction: "down",
    paceKgPerWeek: 0.25,
    declaredSlots: TROIS_MOMENTS,
    conditionRefs: [],
    portionIndex: null,
    ...over,
  };
}

function directionFor(appetite: AppetiteLevel | null) {
  return envelopeDirectionFor({
    goal: "fat_loss",
    // ⟳ 2026-09-11 — REQUIS depuis que la garde de condition vit DANS la
    // fonction. `false` = aucune condition n'annule l'écart, ce que ces
    // décors décrivent. Le cas qui MORD est éprouvé à part.
    deficitCancelled: false,
    subject: { body: mouthBody({ appetite }), isMinor: false },
    paceKgPerWeek: 0.25,
  });
}

/** La bande du moteur solo, telle que `generate-meal-v1` la construit. */
function soloBand(over: {
  appetite?: AppetiteLevel | null;
  items?: PortionAdjustItem[];
} = {}) {
  const env = envelopeFor(
    "fat_loss",
    soloBody(),
    "30_44",
    false,
    null,
    PERSON.activityLevel,
    PERSON.activityAxes,
    over.appetite ?? null,
    over.items === undefined
      ? null
      : { mouth: { memberId: "m-1", ageState: "adult" }, items: over.items },
    directionFor(over.appetite ?? null),
  );
  assert(env.mode === "per_kg" && env.energy !== null);
  return env.energy!;
}

const midOf = (band: { low: number; high: number }) => (band.low + band.high) / 2;

/** Un `portion.adjust` passé par le PARSEUR — jamais un `as`. */
function adjust(direction: "up" | "down", magnitude: "slight" | "clear"): PortionAdjustItem {
  const parsed = parseRetainedItem({
    kind: "portion.adjust",
    scope: "durable",
    subject: "household",
    text: "les portions étaient trop petites",
    value: { direction, magnitude },
    source: "questionnaire",
    at: "2026-09-09",
    item: "",
    confidence: null,
  });
  if (parsed === null || parsed.kind !== "portion.adjust") {
    throw new Error("fixture illisible — le parseur a refusé l'item");
  }
  return parsed;
}

const indexOf = (items: PortionAdjustItem[]) =>
  portionIndexFor({ mouth: { memberId: "m-1", ageState: "adult" }, items });

// ═══════════════════════════════════════════════════════════════════════════
// ① LA CIBLE LIT TOUT CE QUE LA PERSONNE A RENSEIGNÉ
// ═══════════════════════════════════════════════════════════════════════════

// ⛔ ROUGE AVANT LE LOT. `maintenanceKcalOf` passait par `maintenanceMidKcal`
// (`poids × kcal/kg`): la taille, la bande d'âge, le sexe et les deux axes
// n'atteignaient PAS la journée d'un adulte. Deux corps de même poids et de
// tailles très différentes recevaient exactement la même cible.
Deno.test("① la cible lit la TAILLE — deux corps de même poids ne visent pas pareil", () => {
  const petit = dayTargetFor(mouth({ body: { ...mouthBody(), heightCm: 158 } }), "no_position");
  const grand = dayTargetFor(mouth({ body: { ...mouthBody(), heightCm: 195 } }), "no_position");
  assert(petit.kcal !== null && grand.kcal !== null);
  // Mifflin: 6,25 kcal par centimètre, × le facteur d'activité (1,80).
  //   (195 − 158) × 6,25 × 1,80 = 416,25 kcal/jour d'écart.
  assertAlmostEquals(grand.kcal! - petit.kcal!, 416.25, 1);
});

// ⛔ ROUGE AVANT LE LOT, pour la même raison: `activityAxes` n'était lu par
// personne côté journée d'adulte. Les deux axes GOUVERNENT quand ils sont là —
// c'est `activityFactorOf`, et son résultat doit atteindre la cible.
Deno.test("① la cible lit LES DEUX AXES quand ils sont là, et le cran sinon", () => {
  const cran = dayTargetFor(mouth(), "no_position");
  const axes = dayTargetFor(
    mouth({
      body: {
        ...mouthBody(),
        activityAxes: { day: "physical_job", sport: "5_plus", asked: true },
      },
    }),
    "no_position",
  );
  assert(cran.kcal !== null && axes.kcal !== null);
  // `crossedActivityFactor("physical_job", "five_plus")` = 1,85 + 0,05×5 = 2,10,
  // contre 1,80 pour le cran `trains_some`. La cible DOIT monter.
  assert(
    axes.kcal! > cran.kcal! + 200,
    `les axes ne déplacent pas la cible: ${cran.kcal} → ${axes.kcal}`,
  );
});

// ⛔ LA MOITIÉ QUI PASSE, et sans elle la garde du dessus serait indiscernable
// d'une équation entièrement cassée: une fiche SANS taille garde une cible, par
// le repli nommé — celui-là même que l'écran applique.
Deno.test("① sans taille, le repli au poids gouverne — et il se NOMME", () => {
  const primitives = { ...PERSON, ageBand: "30_44" as const, appetite: null };
  const equation = adultMaintenanceKcal(primitives);
  assertEquals(equation.basis, "body_equation");
  const repli = adultMaintenanceKcal({ ...primitives, heightCm: null });
  assertEquals(repli.basis, "weight_shortcut");
  assert(repli.kcal !== null && repli.kcal! > 0);
  const rien = adultMaintenanceKcal({ ...primitives, weightKg: null, heightCm: null });
  assertEquals(rien, { kcal: null, basis: "none" });
});

// ═══════════════════════════════════════════════════════════════════════════
// ② MÊME PERSONNE, DEUX LANES, MÊME CIBLE
// ═══════════════════════════════════════════════════════════════════════════

// ⛔ ROUGE AVANT LE LOT, et l'écart n'était pas un arrondi: la lane solo
// composait contre `poids × kcal/kg` décalé (`plannedEnergyBand`), la lane
// foyer contre le milieu de la même fourchette. Aucune des deux ne lisait la
// taille ni les axes; celle qui les lit maintenant les lit des DEUX côtés.
Deno.test("② la même personne rend la même cible sur les deux lanes, à ±1 kcal", () => {
  const foyer = dayTargetFor(mouth(), "no_position");
  assert(foyer.kcal !== null);
  // ⛔ LA CIBLE, PAS LA BANDE. `dayTargetKcalOf` est le geste qu'`envelopeCore`
  // applique avant de poser une largeur autour; `maintenanceKcalOf` +
  // `goalGapKcalOf` est le geste que la lane foyer applique. Les deux doivent
  // rendre le même nombre — c'est ÇA, « une seule cible par personne ».
  const solo = dayTargetKcalOf(
    adultMaintenanceKcal({ ...PERSON, ageBand: "30_44", appetite: null }).kcal,
    directionFor(null),
  );
  assert(solo !== null);
  assertAlmostEquals(solo!, foyer.kcal!, 1);
  // ⚠️ ET LE MILIEU DE LA BANDE VAUT LA CIBLE **TANT QU'A1 NE MORD PAS**. Au
  // cran par défaut (0,25 kg/sem) l'écart exécuté vaut 275 kcal et le plafond de
  // déficit ne remonte rien; la bande est alors symétrique autour de la cible.
  assertAlmostEquals(midOf(soloBand()), foyer.kcal!, 1);
});

// ⛔ LE CAS QU'IL FAUT NOMMER, ET IL EST MESURÉ EN RUN RÉEL. Sur un cran de
// 0,5 kg/sem, A1 écrête l'écart à 500 kcal et remonte le BAS de la bande à
// `M − 500` — c'est-à-dire exactement à la cible. La bande devient asymétrique,
// et le milieu cesse de valoir la cible. Mesuré le 2026-09-10 sur la fixture S2
// du banc (78 kg, 165 cm, `on_feet`, perte 0,5 kg/sem): cible 1 918, bande
// 1 918–2 039, milieu 1 978,5.
//
// ⚠️ CE N'EST PAS UNE DÉRIVE ENTRE LES DEUX LANES: les deux visent 1 918. C'est
// la CEINTURE qui déforme la bande, et un test qui comparerait des milieux
// prendrait cette ceinture pour un désaccord.
Deno.test("② quand A1 mord, la bande est asymétrique — et la CIBLE reste la même", () => {
  const vite = { direction: "down" as const, paceKgPerWeek: 0.5 };
  const foyer = dayTargetFor(mouth({ ...vite }), "no_position");
  assert(foyer.kcal !== null);
  const M = adultMaintenanceKcal({ ...PERSON, ageBand: "30_44", appetite: null }).kcal!;
  // 0,5 kg/sem = 550 kcal/j, ÉCRÊTÉ à 500: la cible est `M − 500`.
  assertAlmostEquals(foyer.kcal!, M - 500, 1);

  const env = envelopeFor(
    "fat_loss",
    soloBody(),
    "30_44",
    false,
    null,
    PERSON.activityLevel,
    PERSON.activityAxes,
    null,
    null,
    envelopeDirectionFor({
      goal: "fat_loss",
      // ⟳ 2026-09-11 — REQUIS depuis que la garde de condition vit DANS la
      // fonction. `false` = aucune condition n'annule l'écart, ce que ces
      // décors décrivent. Le cas qui MORD est éprouvé à part.
      deficitCancelled: false,
      subject: { body: mouthBody(), isMinor: false },
      paceKgPerWeek: 0.5,
    }),
  );
  assert(env.mode === "per_kg" && env.energy !== null);
  assertEquals(env.energy!.low, Math.round(M - 500), "le bas de bande EST A1");
  assert(midOf(env.energy!) > foyer.kcal!, "la bande n'est plus symétrique");
});

// ⛔ ET LA PROPRIÉTÉ TIENT SOUS LES DEUX CRANS, sinon elle ne serait vraie que
// dans le cas nominal — c'est-à-dire nulle part où elle compte.
Deno.test("② elle tient AUSSI avec l'appétit et avec le retour", () => {
  for (const appetite of [null, "small", "large"] as const) {
    const foyer = dayTargetFor(mouth({ body: mouthBody({ appetite }) }), "no_position");
    assert(foyer.kcal !== null, `${appetite}`);
    assertAlmostEquals(midOf(soloBand({ appetite })), foyer.kcal!, 1, `${appetite}`);
  }
  const items = [adjust("up", "clear")];
  const foyer = dayTargetFor(mouth({ portionIndex: indexOf(items) }), "no_position");
  assert(foyer.kcal !== null);
  assertAlmostEquals(midOf(soloBand({ items })), foyer.kcal!, 1, "retour « pas assez »");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA PART PAR MOMENT — cinq moments ne pèsent pas comme trois
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ cinq moments ≠ trois moments — la part du déjeuner suit le dénominateur", () => {
  const cible = 2400;
  const part = (slots: readonly string[]) =>
    slotPlanTargets({
      targetKcal: cible,
      coveredSlots: ["lunch"],
      wholeSlots: slots,
      lightSlots: [],
      slotFixedKcal: null,
    }).bySlot.get("lunch")!;

  const trois = TROIS_MOMENTS.reduce((n, s) => n + SLOT_DAY_WEIGHT[s as "lunch"], 0);
  const cinq = CINQ_MOMENTS.reduce((n, s) => n + SLOT_DAY_WEIGHT[s as "lunch"], 0);
  assertAlmostEquals(trois, 1.00, 1e-9);
  assertAlmostEquals(cinq, 1.20, 1e-9);
  assertAlmostEquals(part(TROIS_MOMENTS), cible * (0.40 / 1.00), 0.5);
  assertAlmostEquals(part(CINQ_MOMENTS), cible * (0.40 / 1.20), 0.5);
  assert(part(CINQ_MOMENTS) < part(TROIS_MOMENTS));
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA BANDE DE GRAMMES DESCEND DE LA PART
// ═══════════════════════════════════════════════════════════════════════════

// ⛔ ROUGE AVANT LE LOT: `plateBoundsFor` rendait `PLATE_MASS_BOUNDS_G` — une
// table par tranche d'âge, sans le moindre lien avec la part kcal. Un adulte de
// 55 kg en perte et un adulte de 95 kg en prise recevaient le même plafond de
// 700 g au déjeuner.
Deno.test("④ la bande de grammes suit la part — et la table dit QUAND elle rabat", () => {
  const bandeDe = (m: AnchorMouth, slot: string) => {
    const day = dayTargetFor(m, "no_position");
    assert(day.kcal !== null);
    const part = slotPlanTargets({
      targetKcal: day.kcal!,
      coveredSlots: [slot],
      wholeSlots: m.declaredSlots,
      lightSlots: [],
      slotFixedKcal: null,
    }).bySlot.get(slot)!;
    return {
      part,
      ...plateBoundsFor({ ageYears: PERSON.ageYears, slot, slotTargetKcal: part, light: false, appetite: null }),
    };
  };

  // ── LÀ OÙ LA PART GOUVERNE ─────────────────────────────────────────────
  // Un goûter: sa part (~0,10/1,20 de la journée) reste bien sous ce qu'un
  // estomac accepte, donc c'est l'arithmétique qui décide, et deux corps
  // différents reçoivent deux bornes différentes.
  const petit = bandeDe(
    mouth({ body: { ...mouthBody(), weightKg: 55 }, declaredSlots: CINQ_MOMENTS }),
    "snack_pm",
  );
  const grand = bandeDe(
    mouth({ body: { ...mouthBody(), weightKg: 95 }, declaredSlots: CINQ_MOMENTS }),
    "snack_pm",
  );
  assertEquals(petit.boundSource, "target");
  assertEquals(grand.boundSource, "target");
  assert(
    grand.max > petit.max,
    `la bande ne suit pas le corps: ${petit.max} vs ${grand.max}`,
  );
  // Et elle la suit à la densité NOMMÉE, pas à un coefficient inventé ici.
  assertEquals(grand.max, Math.round(grand.part / 1.0));

  // ── ⛔ LÀ OÙ L'ESTOMAC GOUVERNE, ET IL FAUT LE DIRE ────────────────────
  // Le déjeuner d'un adulte pèse ~950 kcal: à la densité plancher, ça ferait
  // 950 g d'assiette. La table (700 g) rabat, et c'est JUSTE — c'est une
  // capacité d'estomac, pas une opinion sur l'énergie. Ce que le lot change,
  // c'est qu'on SAIT désormais laquelle des deux a décidé.
  const dejeuner = bandeDe(mouth(), "lunch");
  assert(dejeuner.part > 700, `prémisse: ${dejeuner.part} kcal au déjeuner`);
  assertEquals(dejeuner.boundSource, "table");
  assertEquals(dejeuner.max, 700);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES DEUX CRANS BOUGENT LA CIBLE **ET** LA BANDE DE GRAMMES
// ═══════════════════════════════════════════════════════════════════════════

/** La cible et le plafond de grammes du déjeuner, pour une bouche donnée. */
/**
 * La cible du jour et le plafond de grammes d'un MOMENT OÙ LA PART GOUVERNE.
 *
 * ⛔ LE GOÛTER, ET PAS LE DÉJEUNER — c'est une prémisse, pas un confort. Le
 * déjeuner d'un adulte est déjà rabattu par la capacité d'estomac (700 g, voir
 * le test ④): un plafond qui ne bouge pas y prouverait seulement que la table
 * est plate, pas que le cran est désarmé. On mesure donc là où la borne dérivée
 * décide, et le test ④ garde l'autre moitié.
 */
function cibleEtGrammes(m: AnchorMouth) {
  const day = dayTargetFor(m, "no_position");
  assert(day.kcal !== null);
  const part = slotPlanTargets({
    targetKcal: day.kcal!,
    coveredSlots: ["snack_pm"],
    wholeSlots: m.declaredSlots,
    lightSlots: [],
    slotFixedKcal: null,
  }).bySlot.get("snack_pm")!;
  const bounds = plateBoundsFor({
    ageYears: PERSON.ageYears,
    slot: "snack_pm",
    slotTargetKcal: part,
    light: false,
    // ⟳ 2026-09-10 — L'APPÉTIT DE CETTE BOUCHE-LÀ, et c'est le seul endroit où
    // il agit désormais. Écrire `null` ici rendrait le test de l'appétit
    // structurellement incapable de mesurer quoi que ce soit.
    appetite: m.body?.appetite ?? null,
  });
  return {
    kcal: day.kcal!,
    maxG: bounds.max,
    minG: bounds.min,
    prefG: bounds.preferred,
    boundSource: bounds.boundSource,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 — CE TEST A ÉTÉ RENVERSÉ, ET LE RENVERSEMENT EST LE LOT
// ══════════════════════════════════════════════════════════════════════════
//
// Il disait: « l'appétit bouge la cible ET le plafond de grammes ». La moitié
// « cible » était fausse, et elle se dit en une phrase:
//
//     ⛔ AVOIR BON APPÉTIT NE FAIT PAS DÉPENSER 10 % DE PLUS.
//
// Posé sur l'entretien, l'appétit ajoutait des CALORIES: il annulait une part
// du déficit de quelqu'un qui perd du poids parce qu'il aime manger, sans que
// rien ne le nomme. Il décrit un VOLUME d'assiette, pas une dépense — donc il
// vit sur les bornes de masse, à énergie constante.
//
// ⚠️ CE QUI RESTE VRAI DE L'ANCIEN TEST: l'appétit doit agir, et à un seul
// endroit. C'est ce que ce test-ci mesure, dans l'autre grandeur.
Deno.test("⑤ L'APPÉTIT NE BOUGE PAS LA CIBLE — il ouvre la MASSE, à énergie constante", () => {
  const cinq = (appetite: AppetiteLevel) =>
    cibleEtGrammes(mouth({
      body: mouthBody({ appetite }),
      declaredSlots: CINQ_MOMENTS,
      direction: null,
      paceKgPerWeek: null,
    }));
  const neutre = cinq("average");
  const gros = cinq("large");
  const petit = cinq("small");

  // ── ① L'ÉNERGIE NE BOUGE PAS D'UN KCAL ─────────────────────────────────
  assertEquals(gros.kcal, neutre.kcal, "un gros appétit a fait monter la CIBLE");
  assertEquals(petit.kcal, neutre.kcal, "un petit appétit a fait baisser la CIBLE");

  // ── ② LA MASSE BOUGE, ET DES DEUX BORNES ───────────────────────────────
  // ⛔ LE FACTEUR EST ÉCRIT EN DUR, PAS LU DEPUIS LA CONSTANTE. C'est ce qui
  // rend la MUTATION concluante: mettre `APPETITE_FACTORS.large` à 1,00 doit
  // faire rougir ce test, et un test qui dériverait son attente de la constante
  // resterait vert.
  assertEquals(neutre.boundSource, "target", "prémisse: la table ne doit pas rabattre ici");
  assertEquals(gros.boundSource, "target");
  assertAlmostEquals(gros.maxG / neutre.maxG, 1.10, 0.005);
  assertAlmostEquals(petit.maxG / neutre.maxG, 0.90, 0.005);
  assertAlmostEquals(gros.minG / neutre.minG, 1.10, 0.005);
  assertAlmostEquals(petit.minG / neutre.minG, 0.90, 0.005);
  assertAlmostEquals(gros.prefG / neutre.prefG, 1.10, 0.005);

  // ── ③ ET LA DENSITÉ DEMANDÉE BOUGE EN SENS INVERSE ─────────────────────
  // C'est la conséquence qu'on veut: même énergie, plus de masse ⇒ un plat
  // MOINS dense. Un gros appétit reçoit une assiette plus grande, pas plus de
  // calories.
  const couloirDe = (g: ReturnType<typeof cibleEtGrammes>, kcal: number) =>
    densityCorridorFor({
      targetKcal: kcal,
      bounds: {
        min: g.minG,
        max: g.maxG,
        preferred: g.prefG,
        appetiteFactor: 1,
        densityFloorPerG: 1,
        band: "adult",
        slotClass: "snack",
        source: "age_known",
        boundSource: g.boundSource,
        physicalMax: g.maxG,
      },
    })!;
  const partNeutre = neutre.maxG * 1.0; // la part kcal du goûter, à la densité plancher
  assert(
    couloirDe(gros, partNeutre).minPer100G < couloirDe(neutre, partNeutre).minPer100G,
    "un gros appétit devrait demander un plat MOINS dense",
  );

  // ── ④ LA LANE SOLO, SUR LA MÊME PERSONNE: MÊME CIBLE ───────────────────
  const soloNeutre = midOf(soloBand({ appetite: "average" }));
  assertAlmostEquals(midOf(soloBand({ appetite: "large" })), soloNeutre, 1);
  assertAlmostEquals(midOf(soloBand({ appetite: "small" })), soloNeutre, 1);
  // ⛔ ET LA LANE FOYER DIT LE MÊME NOMBRE. C'est ce qui interdit qu'une lane
  // garde l'appétit dans l'énergie pendant que l'autre l'en retire.
  const foyerPerte = (appetite: AppetiteLevel) =>
    dayTargetFor(mouth({ body: mouthBody({ appetite }) }), "no_position").kcal!;
  assertAlmostEquals(foyerPerte("large"), foyerPerte("average"), 1);
  assertAlmostEquals(foyerPerte("small"), foyerPerte("average"), 1);
});

// ⛔ ROUGE AVANT LE LOT, ET C'ÉTAIT UNE GARDE DÉSARMÉE. `dayTargetFor` —
// la fonction qui dimensionne réellement l'assiette sous `portion_v1` —
// RECEVAIT `portionIndex` et ne le lisait pas. Ses deux appelants le lui
// passaient sous un commentaire affirmant le contraire.
Deno.test("⑤ LE RETOUR « pas assez » bouge la cible ET le plafond de grammes", () => {
  const neutre = cibleEtGrammes(mouth({ declaredSlots: CINQ_MOMENTS }));
  const plus = cibleEtGrammes(
    mouth({ declaredSlots: CINQ_MOMENTS, portionIndex: indexOf([adjust("up", "clear")]) }),
  );
  // ⚠️ ICI LE RAPPORT EST BIEN 1,10, ET LA DIFFÉRENCE AVEC L'APPÉTIT EST LE
  // POINT: ce cran-là s'applique à la CIBLE ENTIÈRE (`withPortionCran`), écart
  // d'objectif compris — parce qu'il répond à « la portion SERVIE était-elle
  // trop grosse ? », pas à « ce corps dépense-t-il plus que la formule ne le
  // dit ? ». Deux questions, deux points d'application, et ils sont chacun
  // écrits une seule fois.
  // Deux crans à `PORTION_ADJUST_STEP.slight` = +10 % — la borne du module.
  assertAlmostEquals(plus.kcal / neutre.kcal, 1.10, 0.002);
  assertEquals(neutre.boundSource, "target");
  assertEquals(plus.boundSource, "target");
  assertAlmostEquals(plus.maxG / neutre.maxG, 1.10, 0.005);
});

// ⛔ LE CRAN N'A QU'UN SEUL TRADUCTEUR, et c'est ce qui garantit « pas de second
// facteur caché ailleurs ». `mouthTargetKcal` et `dayTargetFor` appellent la
// MÊME fonction; deux écritures du même adverbe divergeraient.
Deno.test("⑤ le cran est traduit à UN seul endroit, et il respecte le plancher", () => {
  const index = indexOf([adjust("down", "clear")]);
  assertAlmostEquals(withPortionCran({ kcal: 2000, portionIndex: index, floorKcal: null }), 1800, 1);
  // Le plancher rabat, et il n'invente rien: c'est `energyFloorFor(gender)`.
  assertEquals(withPortionCran({ kcal: 2000, portionIndex: index, floorKcal: 1900 }), 1900);
  // ⚠️ SANS CRAN, C'EST L'IDENTITÉ — pas un arrondi. Toute la base est dans ce
  // cas, et elle ne doit pas bouger d'un kcal en passant par ici.
  assertEquals(withPortionCran({ kcal: 2000.4, portionIndex: null, floorKcal: 1900 }), 2000.4);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA MUTATION — elle doit faire rougir les DEUX lanes
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("MUTATION — `APPETITE_FACTORS` est épinglé, et les deux lanes le lisent", () => {
  // ⛔ CETTE ASSERTION EST LA MOITIÉ QUI REND LA MUTATION LISIBLE. Les tests
  // d'appétit ci-dessus écrivent 1,10 et 0,90 en dur; celui-ci dit d'où ces
  // nombres viennent. Mettre `large` à 1,00 fait donc rougir TROIS tests, et
  // deux d'entre eux sont sur des lanes différentes.
  assertEquals(APPETITE_FACTORS, { small: 0.90, average: 1.00, large: 1.10 });
  assertEquals(PORTION_ADJUST_STEP.slight, 0.05);
});

// ═══════════════════════════════════════════════════════════════════════════
// LE CÂBLAGE — ce que les deux lanes passent réellement
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ UN TEST DE SOURCE, ET IL EST NÉCESSAIRE. Les tests ci-dessus prouvent que
// les FONCTIONS lisent ces champs; ils ne peuvent pas prouver que la lane les
// leur passe. C'est très exactement le trou par lequel ce lot est entré: le
// calcul était juste, `appetite: null` était écrit en dur au-dessus.

const SCREEN_SRC = Deno.readTextFileSync(new URL("./meal_energy_shared.ts", import.meta.url));

Deno.test("CÂBLAGE — l'écran lit le MÊME appétit que le moteur", () => {
  // ⛔ SANS CETTE LIGNE, LE LOT ROUVRE LE DÉFAUT DU 2026-09-09 À L'ENVERS: le
  // moteur lirait l'appétit (±10 %) et l'écran non, donc deux nombres pour la
  // même personne — plus difficiles à voir qu'un écart de 500 kcal, pas moins
  // faux.
  assert(SCREEN_SRC.includes("loadOwnMouthBody("));
  assertEquals(
    SCREEN_SRC.split("appetite: ownMouth.appetite").length - 1,
    2,
    "l'écran doit passer le même appétit à `mouthBody` ET à la bande du corps",
  );
  // ⛔ LA CONTRE-ÉPREUVE VISE LE LITTÉRAL PASSÉ, PAS LE MOT. « `appetite: null` »
  // apparaît légitimement dans la PROSE qui explique le repli; ce qu'on refuse,
  // c'est qu'il soit encore ARGUMENT. On compte donc les deux passages attendus
  // ci-dessus et on vérifie qu'aucune ligne de code n'en porte un troisième.
  const lignesDeCode = SCREEN_SRC.split("\n")
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"));
  assertEquals(
    lignesDeCode.filter((l) => l.includes("appetite: null")).length,
    0,
    "un `appetite: null` en dur subsiste dans le chargeur de l'écran",
  );
});
