/**
 * ══════════════════════════════════════════════════════════════════════════
 * L'ÉNERGIE RÉELLEMENT SERVIE — SUR LES BOÎTES FINALES, À-CÔTÉS COMPRIS.
 * ⟳ 2026-09-23 — chantier « assiettes normales », flux F (lot 0 de l'audit).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `~/.claude/plans/lexical-gliding-lamport.md`, flux F.
 * Audit à l'origine: `docs/keel/AUDIT-DOSAGES-2026-09-23.md`, § C6 et lot 0.
 *
 * ── LE DÉFAUT MESURÉ ──────────────────────────────────────────────────────
 * `day_kcal.per_mouth[].served` est calculé AVANT `fitPortionsToBounds`, et
 * jamais recalculé. Sur le plan `e0325544`, Thomas affichait 100 % de sa
 * cible (3 276 kcal) pendant que ses boîtes finales lui servaient 2 919 /
 * 3 097 / 3 120 / 3 267 / 2 816 kcal: le rabotage retirait jusqu'à 460 kcal
 * par jour, et aucun compteur ne disait combien.
 *
 * Et depuis le 2026-09-23, une partie de chaque déjeuner et de chaque dîner
 * n'est plus dans les boîtes: les à-côtés (entrée, fromage, dessert, pain)
 * vivent à part, dans `dishes[i].side_courses[]`. Une journée qui ne les
 * compte pas se lit « sous-nourrie » sur un plan juste.
 *
 * ── CE QUE CE MODULE REND ─────────────────────────────────────────────────
 * ① `measureSideCourses` — l'énergie et la protéine de chaque à-côté, par ses
 *   GRAMMES × le référentiel. UNE arithmétique, et trois lecteurs: l'audit du
 *   plan livrable (`final_plan_audit.ts`), l'énergie servie finale (ci-dessous)
 *   et `meal-energy-v1`.
 * ② `finalServedByMouthDay` — par personne et par jour: les boîtes finales,
 *   les parts de bac commun, les à-côtés; et l'écart avec ce qui était servi
 *   avant les bornes (`shavedKcal`).
 * ③ `plateLoadOf` — la charge de l'assiette de chacun: masse du plat, céréale
 *   sèche, légumes, part d'énergie du féculent, à-côtés, fruits.
 * ④ `sidesOnEmittedBoxes` et `viewerDayEnergy` — la part de `meal-energy-v1`,
 *   sortie de la fonction edge pour être testée.
 *
 * ── ⛔ AUCUNE ARITHMÉTIQUE N'EST RÉÉCRITE ICI ────────────────────────────
 * Les boîtes passent par `boxNutrition` (`mouth_energy.ts`, qui appelle
 * `boxNutritionByItems`), les casseroles par `measurePreparation`, les lignes
 * par `resolveIngredients` / `dishEnergy` / `nutrientsOf`. Une part de bac est
 * `kcal du bac / nombre de mangeurs`: la convention DÉJÀ employée par
 * `cellNutritionTable`, pas un partage inventé ici.
 *
 * ── ⛔ SOUS LE PLANCHER TCA, AUCUNE LIGNE ────────────────────────────────
 * `withheldMemberIds` est REQUIS dans les deux fonctions qui rendent un nombre
 * par personne. Une personne dont le plancher alimentaire est levé (ou
 * illisible) n'a AUCUNE ligne — pas une ligne à `null`: une ligne vide dit
 * encore « cette personne a été mesurée ». C'est la règle du générateur
 * (« ne pas produire un chiffre de calories pour cette personne »), pas une
 * règle d'affichage.
 *
 * PURE: no I/O, no clock, no randomness. Ne mute jamais son entrée.
 */

import {
  type CompositionIndex,
  type CompositionInput,
  nutrientsOf,
  type ResolvedIngredient,
  resolveIngredients,
} from "./food_composition.ts";
import { boxNutrition, potDensities, potProteinPerGram } from "./mouth_energy.ts";
import { dishEnergy, type EnergyPreparation, PLAN_ENERGY_BASIS } from "./plan_energy.ts";
import { measurePreparation, proteinOfUnit } from "./preparation_mass.ts";
import { foldPreparationsIntoDishes } from "./meal_verdict.ts";
import type { EnergyBoxDish, EnergySideCourse } from "./plan_energy_read.ts";
import type { SideCourseKind, SideCourseLedger } from "./side_courses_types.ts";
import { CEILING_STARCH_GROUPS } from "./protein_ceiling_adjust.ts";
import {
  FRUIT_GROUPS,
  MAIN_SLOTS,
  VEG_FLOOR_G_PER_MAIN_SERVING,
  VEGETABLE_GROUPS,
} from "./plan_food_quality.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① L'ÉNERGIE D'UN À-CÔTÉ — ses grammes × le référentiel
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ ELLE VIT ICI, ET L'AUDIT L'IMPORTE. Elle était d'abord dans
// `final_plan_audit.ts`; ce module-ci est celui de « l'énergie servie », et
// `meal-energy-v1` n'a pas à tirer l'audit du plan livrable (courses,
// tolérances, plancher protéique) pour lire trois à-côtés. L'audit importe ce
// module, jamais l'inverse: pas de cycle.

/**
 * POURQUOI UN À-CÔTÉ N'A PAS D'ÉNERGIE — nommé, jamais un `null` nu.
 *
 * Quatre causes, quatre corrections: le payload (`no_grams`), le référentiel
 * (`food_unreadable`), le lien vers la session (`preparation_missing`), la
 * casserole elle-même (`preparation_unreadable`).
 */
export const SIDE_MEASURE_GAPS = [
  /** Aucune masse lisible sur l'à-côté: rien à multiplier. */
  "no_grams",
  /** L'aliment ne se lit pas (slug refusé ou inconnu, terme non résolu). */
  "food_unreadable",
  /** `preparation_id` ne nomme aucune préparation du plan. */
  "preparation_missing",
  /** La préparation existe, sa densité ne se lit pas. */
  "preparation_unreadable",
] as const;
export type SideMeasureGap = (typeof SIDE_MEASURE_GAPS)[number];

export interface SideMeasure {
  /** `null` quand illisible — jamais 0: un à-côté servi n'est pas vide. */
  readonly kcal: number | null;
  /** `null` quand le référentiel ne donne pas la protéine — jamais 0. */
  readonly proteinG: number | null;
  readonly gap: SideMeasureGap | null;
}

/**
 * LA LIGNE DE COMPOSITION D'UN À-CÔTÉ D'ALIMENT — la même pour l'énergie, les
 * courses et l'index de lecture de `meal-energy-v1`.
 *
 * ⛔ `state: "raw"` EST UNE AFFIRMATION, PAS UN DÉFAUT. Les grammes d'un
 * à-côté sont ce qui est dans l'assiette, d'un aliment qui ne se cuit pas
 * (fruit, laitage, fromage, pain, crudité). Une entrée CUITE est une
 * préparation de session: elle passe par `preparationId`, jamais par ici.
 *
 * ⚠️ LE TERME RETOMBE SUR LE SLUG QUAND IL EST VIDE. `dishEnergy` et
 * `resolveIngredients` jettent une ligne sans terme AVANT de lire son `ref`:
 * un à-côté écrit avec un slug et sans mot d'écran serait devenu illisible.
 * Le slug gagne de toute façon (`resolveCompositionLine`).
 *
 * ⚠️ `amount: null` QUAND LA MASSE MANQUE: la ligne reste un BESOIN non pesé
 * pour les courses, et `measureSideCourses` la refuse avant de la peser
 * (`no_grams`).
 */
export function sideCompositionLine(side: EnergySideCourse): CompositionInput {
  return {
    term: side.term !== "" ? side.term : (side.ref ?? ""),
    ref: side.ref,
    refRefused: false,
    amount: side.grams,
    unit: side.grams === null ? null : "g",
    state: "raw",
  };
}

/**
 * L'ÉNERGIE ET LA PROTÉINE DE CHAQUE À-CÔTÉ, DANS L'ORDRE DE `sides`.
 *
 * ⛔ LES GRAMMES, JAMAIS LE NOMBRE D'UNITÉS. « 1 yaourt nature » s'affiche à
 * l'unité, mais `plain_yogurt` n'a pas de `unit_grams` au référentiel (lu en
 * base le 2026-09-23): peser `unit_count` le rendrait non pesé, donc à ZÉRO
 * dans la journée. Le moteur a déjà converti en grammes (`grams`); c'est cette
 * masse qui pèse.
 *
 * ⚠️ UNE SOUPE PASSE PAR LA DENSITÉ DE SA CASSEROLE (`potDensities`), la même
 * que celle des boîtes: une casserole, une densité.
 *
 * ⛔ `dishEnergy` ET SA TOLÉRANCE DE 5 %: sur un plat d'UNE ligne, un terme
 * inconnu borné par son groupe pèse 100 % du plat, donc il éteint l'à-côté.
 * C'est voulu: une borne de groupe n'est pas l'énergie d'une pomme.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function measureSideCourses(args: {
  index: CompositionIndex;
  preparations: readonly EnergyPreparation[];
  sides: readonly EnergySideCourse[];
}): SideMeasure[] {
  // Seules les casseroles CITÉES par un à-côté sont mesurées: un plan de trente
  // plats n'a pas à payer la mesure de toutes ses casseroles pour deux soupes.
  const cited = new Set<string>();
  for (const side of args.sides) if (side.preparationId !== null) cited.add(side.preparationId);
  const pots = args.preparations.filter((p) => cited.has(p.id));
  const densities = pots.length === 0 ? new Map<string, number | null>() : potDensities(args.index, pots);
  const proteins = pots.length === 0 ? new Map<string, number | null>() : potProteinPerGram(args.index, pots);
  return args.sides.map((side): SideMeasure => {
    const grams = side.grams;
    if (grams === null || !Number.isFinite(grams) || grams <= 0) {
      return { kcal: null, proteinG: null, gap: "no_grams" };
    }
    if (side.preparationId !== null) {
      if (!densities.has(side.preparationId)) {
        return { kcal: null, proteinG: null, gap: "preparation_missing" };
      }
      const density = densities.get(side.preparationId);
      if (density === null || density === undefined) {
        return { kcal: null, proteinG: null, gap: "preparation_unreadable" };
      }
      const perG = proteins.get(side.preparationId);
      return {
        kcal: grams * density,
        proteinG: perG === null || perG === undefined ? null : round1(grams * perG),
        gap: null,
      };
    }
    const line = sideCompositionLine(side);
    const energy = dishEnergy(args.index, { method: "", ingredients: [line] });
    if (!energy.complete || energy.kcal === null) {
      return { kcal: null, proteinG: null, gap: "food_unreadable" };
    }
    const protein = proteinOfUnit(args.index, "", [line]);
    return {
      kcal: energy.kcal,
      proteinG: protein === null ? null : round1(protein),
      gap: null,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LES À-CÔTÉS D'UNE GÉNÉRATION — le registre en mémoire, ou le payload relu
// ═══════════════════════════════════════════════════════════════════════════

/**
 * D'OÙ VIENNENT LES À-CÔTÉS À COMPTER.
 *
 * `ledger`: pendant la génération, le registre du flux A
 *   (`SideCourseLedger`), avant que `attachSideCourses` ne les pose dans le
 *   payload.
 * `payload`: un plan écrit, relu par `readEnergySideCourses(dishes)`.
 *
 * ⛔ UNE UNION, PAS DEUX PARAMÈTRES FACULTATIFS. Deux `?` permettraient d'en
 * passer zéro — et une journée sans ses à-côtés est très exactement le défaut
 * que ce module ferme. Un plan sans à-côtés passe `{ from: "payload", sides:
 * [] }`, et le dit.
 */
export type FinalSideSource =
  | { readonly from: "ledger"; readonly ledger: SideCourseLedger }
  | { readonly from: "payload"; readonly sides: readonly EnergySideCourse[] };

/**
 * LE REGISTRE, RELU SOUS LA FORME DU PAYLOAD.
 *
 * ⚠️ `dishIndex: null`: le registre ne connaît que la personne, le jour et le
 * moment. L'énergie par jour n'a pas besoin du plat; le rattachement à une
 * boîte (`sidesOnEmittedBoxes`) si, et il ne lit que le payload.
 *
 * ⛔ LES KCAL DU REGISTRE NE SONT PAS REPRISES. `SideCourseServed.kcal` est ce
 * que le flux A a calculé; ici, l'énergie se relit par ses grammes et son
 * slug (`measureSideCourses`), comme `meal-energy-v1` la relira sur le plan
 * écrit. Deux arithmétiques du même à-côté divergeraient au premier
 * ajustement, et c'est celle de la lecture qui s'affiche.
 */
export function sidesFromLedger(ledger: SideCourseLedger): EnergySideCourse[] {
  return ledger.entries.map((e) => ({
    dishIndex: null,
    memberId: e.memberId,
    day: e.dayToken,
    slot: e.slot,
    kind: e.kind,
    term: e.term,
    ref: e.ref,
    preparationId: e.preparationId,
    grams: Number.isFinite(e.grams) && e.grams > 0 ? e.grams : null,
    unitCount: e.unitCount,
    source: e.source,
  }));
}

function sidesOf(source: FinalSideSource): readonly EnergySideCourse[] {
  return source.from === "ledger" ? sidesFromLedger(source.ledger) : source.sides;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ L'ÉNERGIE SERVIE PAR PERSONNE ET PAR JOUR, APRÈS TOUTES LES MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/** POURQUOI UNE JOURNÉE N'A PAS SON CHIFFRE — nommé, jamais un `null` nu. */
export const FINAL_SERVED_GAPS = [
  /** Le référentiel n'est pas chargé: rien ne se mesure. */
  "no_index",
  /** Une boîte ou une part de bac de la journée ne se lit pas (`boxNutrition`). */
  "box_unreadable",
  /** Un à-côté de la journée ne se lit pas (`measureSideCourses`). */
  "side_unreadable",
] as const;
export type FinalServedGap = (typeof FINAL_SERVED_GAPS)[number];

/**
 * CE QUE LE MOTEUR SERVAIT AVANT LES BORNES, pour une personne et un jour.
 *
 * `dishKcal`: l'énergie des PLATS mesurée par la passe de dimensionnement
 *   (`acc.engine` dans `shadowSizing`, c'est-à-dire l'ancien
 *   `day_kcal.per_mouth[].served`). ⚠️ LES PLATS SEULS: les à-côtés ne sont
 *   pas dans les boîtes, et `fitPortionsToBounds` ne les rabote pas. Ils sont
 *   ajoutés ICI, aux deux côtés de l'écart, par la même mesure.
 * `targetKcal`: la cible COUVERTE du jour, plats + à-côtés (le budget couvert
 *   du contrat: `Σ composeKcal + Σ sideKcal`). `null` = pas de cible.
 */
export interface FinalServedBefore {
  readonly memberId: string;
  readonly day: string;
  readonly dishKcal: number;
  readonly targetKcal: number | null;
}

export interface FinalServedMouthDay {
  readonly memberId: string;
  /** Le jeton de jour du plan (`mon`…`sun`). */
  readonly day: string;
  /**
   * PLATS + PARTS DE BAC + À-CÔTÉS, en kcal entières: `dishKcal + sidesKcal`.
   * `null` dès qu'une part ne se lit pas (`gaps`) — une somme amputée se lirait
   * « cette journée la sous-nourrit ».
   */
  readonly servedKcal: number | null;
  /** Les boîtes à son nom + ses parts de bac (`kcal du bac / mangeurs`). */
  readonly dishKcal: number | null;
  /** Ses à-côtés. `0` = aucun à-côté ce jour-là. */
  readonly sidesKcal: number | null;
  /**
   * CE QUI ÉTAIT SERVI AVANT LES BORNES: `round(before.dishKcal) + sidesKcal`.
   * `null` quand la passe de dimensionnement n'a pas mesuré ce jour-là (aucune
   * ligne `before`), ou quand un à-côté est illisible.
   */
  readonly servedBeforeBoundsKcal: number | null;
  /**
   * `servedBeforeBoundsKcal − servedKcal`. Positif = de l'énergie retirée entre
   * la mesure et l'écriture (rabotage, rétrécissement de casserole). ⚠️ SIGNÉ,
   * et pas borné à zéro: un arrondi ou un regrammage qui ajoute se lit, lui
   * aussi — le borner cacherait l'écart dans un sens.
   */
  readonly shavedKcal: number | null;
  readonly targetKcal: number | null;
  /** `servedKcal / targetKcal × 100`, au dixième. */
  readonly pct: number | null;
  /** Protéine des boîtes, des parts de bac et des à-côtés; `null` si une manque. */
  readonly proteinG: number | null;
  /** Les boîtes à SON seul nom comptées ce jour-là. */
  readonly boxes: number;
  /** Les bacs communs dont une part lui est attribuée. */
  readonly tubShares: number;
  readonly sides: number;
  readonly gaps: readonly FinalServedGap[];
}

/**
 * LES COMPTEURS — TOUS ÉCRITS, MÊME À ZÉRO.
 *
 * ⛔ `withheld_mouth_days` DIT QU'UNE PERSONNE A ÉTÉ TUE, JAMAIS QUI. Sans lui,
 * « le plan n'a qu'une personne » et « la seconde est sous plancher » rendent
 * le même tableau.
 */
export interface FinalServedCounters {
  mouth_days: number;
  withheld_mouth_days: number;
  unreadable_mouth_days: number;
  boxes: number;
  tub_shares: number;
  /** Parts de bac réparties selon l'énergie prévue (le reste: part égale). */
  tub_shares_weighted: number;
  sides: number;
  sides_unreadable: number;
  /** Boîtes ou à-côtés sans jour: ils ne nourrissent aucune journée, et c'est compté. */
  no_day: number;
  /** Journées où `shavedKcal > 0`. */
  shaved_mouth_days: number;
  /** Σ `shavedKcal` sur les journées qui en ont un (hors personnes tues). */
  shaved_kcal: number;
}

export interface FinalServed {
  readonly rows: readonly FinalServedMouthDay[];
  readonly counters: FinalServedCounters;
}

/**
 * L'ÉNERGIE SERVIE À CHAQUE PERSONNE, JOUR PAR JOUR, SUR LE PLAN FINAL.
 *
 * ── ⛔ SA PLACE EST APRÈS `finalPortionCheck` ────────────────────────────
 * C'est-à-dire après le dernier geste qui touche un gramme servi. Plus haut,
 * elle mesurerait des boîtes qui ne sont pas celles qui partent en base — le
 * défaut exact qu'elle ferme.
 *
 * ── ⚠️ LES BACS COMMUNS ───────────────────────────────────────────────────
 * Un bac à plusieurs noms est une estimation, pas une pesée nominative, et
 * `tubShares` le rend visible.
 *
 * ⟳ 2026-09-23 — LE BAC SE PARTAGE COMME LE MOTEUR L'A DIMENSIONNÉ. Mesuré sur
 * la campagne (famille E: une adulte et un enfant de 8 ans au même bac): la
 * part ÉGALE faisait lire l'adulte à 92-97 % et l'enfant à 103-108 % de leur
 * cible, alors que le moteur avait servi chacun à 100 % avant les bornes. La
 * part de chacun suit donc son énergie de plats PRÉVUE ce jour-là
 * (`before.dishKcal`); sans ce prévu pour TOUS les mangeurs du bac, on retombe
 * sur la part égale (la convention de `cellNutritionTable`), et
 * `tub_shares_weighted` dit combien de parts ont été pondérées.
 *
 * Une ligne par couple (personne, jour) rencontré — boîtes, à-côtés ou ligne
 * `before` —, dans l'ordre de première apparition.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function finalServedByMouthDay(args: {
  /** `null` = le référentiel n'a pas été chargé: chaque journée sort `no_index`. */
  index: CompositionIndex | null;
  dishes: readonly EnergyBoxDish[];
  preparations: readonly EnergyPreparation[];
  sides: FinalSideSource;
  /**
   * ⛔ REQUIS, `[]` POUR « AUCUNE MESURE D'AVANT ». Sans lui, `shavedKcal` ne
   * s'écrit jamais — et « le rabotage n'a rien retiré » redeviendrait
   * indiscernable de « on n'a pas regardé ».
   */
  before: readonly FinalServedBefore[];
  /**
   * ⛔ REQUIS: les personnes dont AUCUN nombre de kcal ne doit sortir (plancher
   * TCA levé ou illisible). Un `Set` vide dit « personne », et le dit.
   */
  withheldMemberIds: ReadonlySet<string>;
}): FinalServed {
  const counters: FinalServedCounters = {
    mouth_days: 0,
    withheld_mouth_days: 0,
    unreadable_mouth_days: 0,
    boxes: 0,
    tub_shares: 0,
    tub_shares_weighted: 0,
    sides: 0,
    sides_unreadable: 0,
    no_day: 0,
    shaved_mouth_days: 0,
    shaved_kcal: 0,
  };
  interface Acc {
    memberId: string;
    day: string;
    dish: number | null;
    dishProtein: number | null;
    side: number | null;
    sideProtein: number | null;
    boxes: number;
    tubShares: number;
    sides: number;
    gaps: Set<FinalServedGap>;
  }
  const rows = new Map<string, Acc>();
  const withheldKeys = new Set<string>();
  const rowFor = (memberId: string, day: string): Acc | null => {
    const key = `${memberId}|${day}`;
    if (args.withheldMemberIds.has(memberId)) {
      withheldKeys.add(key);
      return null;
    }
    let row = rows.get(key);
    if (row === undefined) {
      row = {
        memberId,
        day,
        dish: 0,
        dishProtein: 0,
        side: 0,
        sideProtein: 0,
        boxes: 0,
        tubShares: 0,
        sides: 0,
        gaps: new Set(),
      };
      if (args.index === null) row.gaps.add("no_index");
      rows.set(key, row);
    }
    return row;
  };

  // ── LES BOÎTES FINALES ET LES PARTS DE BAC ──────────────────────────────
  const boxes = args.index === null ? null : boxNutrition({
    index: args.index,
    dishes: args.dishes,
    preparations: args.preparations,
  });
  // L'énergie de plats PRÉVUE par (personne, jour): le poids d'une part de bac.
  const plannedDish = new Map<string, number>();
  for (const b of args.before) plannedDish.set(`${b.memberId}|${b.day}`, b.dishKcal);
  let k = 0;
  for (const dish of args.dishes) {
    for (const box of dish.boxes) {
      const measured = boxes === null ? null : boxes[k];
      k += 1;
      const eaters = box.memberIds.length;
      if (eaters === 0) continue;
      if (dish.day === null) {
        counters.no_day += 1;
        continue;
      }
      // ⚠️ Les poids se lisent sur TOUS les mangeurs du bac, tus compris: la part
      // d'une personne ne dépend pas de qui a le droit de la lire.
      const day = dish.day;
      const weights = box.memberIds.map((id) => plannedDish.get(`${id}|${day}`));
      const weighted = eaters > 1 &&
        weights.every((w) => w !== undefined && Number.isFinite(w) && w > 0);
      const weightSum = weighted ? weights.reduce<number>((a, w) => a + (w as number), 0) : 0;
      box.memberIds.forEach((memberId, at) => {
        const row = rowFor(memberId, day);
        if (row === null) return;
        const share = weighted ? (weights[at] as number) / weightSum : 1 / eaters;
        if (eaters === 1) {
          row.boxes += 1;
          counters.boxes += 1;
        } else {
          row.tubShares += 1;
          counters.tub_shares += 1;
          if (weighted) counters.tub_shares_weighted += 1;
        }
        if (measured === null) return;
        if (measured.kcal === null) {
          row.dish = null;
          row.gaps.add("box_unreadable");
        } else if (row.dish !== null) {
          row.dish += measured.kcal * share;
        }
        if (measured.proteinG === null) row.dishProtein = null;
        else if (row.dishProtein !== null) row.dishProtein += measured.proteinG * share;
      });
    }
  }

  // ── LES À-CÔTÉS ─────────────────────────────────────────────────────────
  const sides = sidesOf(args.sides);
  const measures = args.index === null ? null : measureSideCourses({
    index: args.index,
    preparations: args.preparations,
    sides,
  });
  sides.forEach((side, i) => {
    if (side.day === null) {
      counters.no_day += 1;
      return;
    }
    const row = rowFor(side.memberId, side.day);
    if (row === null) return;
    row.sides += 1;
    counters.sides += 1;
    if (measures === null) return;
    const m = measures[i];
    if (m.kcal === null) {
      row.side = null;
      row.gaps.add("side_unreadable");
      counters.sides_unreadable += 1;
    } else if (row.side !== null) {
      row.side += m.kcal;
    }
    if (m.proteinG === null) row.sideProtein = null;
    else if (row.sideProtein !== null) row.sideProtein += m.proteinG;
  });

  // ── CE QUI ÉTAIT SERVI AVANT LES BORNES ─────────────────────────────────
  const beforeByKey = new Map<string, FinalServedBefore>();
  for (const b of args.before) {
    if (rowFor(b.memberId, b.day) === null) continue;
    beforeByKey.set(`${b.memberId}|${b.day}`, b);
  }

  const out: FinalServedMouthDay[] = [];
  for (const [key, row] of rows) {
    const blind = row.gaps.has("no_index");
    const dishKcal = blind || row.dish === null ? null : Math.round(row.dish);
    const sidesKcal = blind || row.side === null ? null : Math.round(row.side);
    const servedKcal = dishKcal === null || sidesKcal === null ? null : dishKcal + sidesKcal;
    const before = beforeByKey.get(key);
    const beforeDish = before === undefined ? NaN : Number(before.dishKcal);
    const servedBeforeBoundsKcal = !Number.isFinite(beforeDish) || sidesKcal === null
      ? null
      : Math.round(beforeDish) + sidesKcal;
    const shavedKcal = servedBeforeBoundsKcal === null || servedKcal === null
      ? null
      : servedBeforeBoundsKcal - servedKcal;
    const target = before === undefined ? null : before.targetKcal;
    const proteinG = blind || row.dishProtein === null || row.sideProtein === null
      ? null
      : round1(row.dishProtein + row.sideProtein);
    counters.mouth_days += 1;
    if (servedKcal === null) counters.unreadable_mouth_days += 1;
    if (shavedKcal !== null && shavedKcal > 0) {
      counters.shaved_mouth_days += 1;
      counters.shaved_kcal += shavedKcal;
    }
    out.push({
      memberId: row.memberId,
      day: row.day,
      servedKcal,
      dishKcal,
      sidesKcal,
      servedBeforeBoundsKcal,
      shavedKcal,
      targetKcal: target,
      pct: servedKcal !== null && target !== null && target > 0
        ? Math.round((servedKcal / target) * 1000) / 10
        : null,
      proteinG,
      boxes: row.boxes,
      tubShares: row.tubShares,
      sides: row.sides,
      gaps: FINAL_SERVED_GAPS.filter((g) => row.gaps.has(g)),
    });
  }
  counters.withheld_mouth_days = withheldKeys.size;
  return { rows: out, counters };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA CHARGE DE L'ASSIETTE — déjeuners et dîners, par personne
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UN PLAT « LOURD »: au-dessus de ce nombre de grammes, il est compté.
 *
 * ⚠️ C'EST UN SEUIL DE MESURE, PAS LA BORNE QUI RABOTE. La borne est
 * `PLATE_MASS_BOUNDS_G` (`portion_sizing.ts`, flux B, 550 g depuis le
 * 2026-09-23); ce nombre-ci dit combien d'assiettes l'ont dépassée à
 * l'écriture. Les deux valent 550 aujourd'hui par décision du propriétaire,
 * et un test épingle celui-ci pour que le bouger soit un geste visible.
 */
export const PLATE_LOAD_HEAVY_DISH_G = 550;

/**
 * LA CHARGE DE L'ASSIETTE D'UNE PERSONNE — sur ses déjeuners et dîners.
 *
 * ⚠️ EN snake_case: c'est une trace destinée à `generated_from.household.
 * plate_load`, comme `FoodQualityTrace`.
 *
 * ⛔ UN REPAS QUI PORTE UN BAC COMMUN N'EST PAS MESURÉ (`tub_meals`). Les
 * grammes d'un bac sont une quantité de récipient, pas la portion de
 * quelqu'un (v4): les diviser fabriquerait une masse d'assiette que personne
 * n'a servie. Les FRUITS du jour, eux, prennent la part du bac
 * (`/ mangeurs`), comme l'énergie servie: c'est un total de journée, pas une
 * assiette.
 */
export interface PlateLoadMember {
  member_id: string;
  /** Déjeuners et dîners mesurés: au moins une boîte à son seul nom, aucun bac. */
  meals: number;
  /** Déjeuners et dîners qui portent un bac commun: non mesurés. */
  tub_meals: number;
  /** Repas mesurés dont une casserole n'a pas de masse prête lisible: composition inconnue. */
  unreadable: number;
  dish_g_median: number | null;
  dish_g_max: number | null;
  /** Plats au-dessus de `PLATE_LOAD_HEAVY_DISH_G`. */
  dishes_over_heavy: number;
  /** La céréale SÈCHE (grammes crus des lignes `grain_absorbs`), par plat. */
  dry_grain_g_median: number | null;
  dry_grain_g_max: number | null;
  /** Les légumes CRUS du plat (`VEGETABLE_GROUPS`). */
  veg_raw_g_median: number | null;
  /** Plats sous `VEG_FLOOR_G_PER_MAIN_SERVING`. */
  veg_under_floor: number;
  /** Légumes du plat + de l'entrée (grille d'acceptation: « plat + entrée »). */
  meal_veg_raw_g_median: number | null;
  /** Σ kcal du féculent / Σ kcal du plat, sur ses plats mesurés, au centième. */
  starch_kcal_share: number | null;
  side_kcal_median: number | null;
  /** À-côtés / (plat + à-côtés), au centième. */
  side_share_median: number | null;
  side_share_max: number | null;
  /** Fruits par jour, TOUS moments et à-côtés compris. */
  fruit_g_per_day_median: number | null;
  fruit_g_per_day_min: number | null;
  /** Masse du repas complet: plat + à-côtés. */
  meal_g_median: number | null;
  meal_g_max: number | null;
}

export interface PlateLoadTrace {
  /** Le seuil voyage avec le nombre: un compte sans son seuil ne se relit pas. */
  heavy_dish_g: number;
  veg_floor_g: number;
  /** Personnes tues (plancher TCA): aucune ligne, et c'est compté. */
  withheld_members: number;
  members: PlateLoadMember[];
}

/** La composition d'une unité de cuisson (casserole, frais d'un plat, à-côté). */
interface UnitComp {
  grainG: number;
  vegG: number;
  fruitG: number;
  kcal: number;
  starchKcal: number;
}

const ZERO_COMP: UnitComp = Object.freeze({ grainG: 0, vegG: 0, fruitG: 0, kcal: 0, starchKcal: 0 });

/**
 * ⛔ PAR LE RÉSOLVEUR DE PRODUCTION, JAMAIS PAR UN MOT. Le groupe et la classe
 * de rendement viennent de la ligne du référentiel que `resolveIngredients` a
 * choisie (slug d'abord). Les kcal du féculent et du total passent par le même
 * `nutrientsOf`: leur rapport est cohérent même quand un terme ne se résout
 * pas (il manque aux deux côtés).
 */
function compOf(index: CompositionIndex, ingredients: readonly CompositionInput[]): UnitComp {
  if (ingredients.length === 0) return ZERO_COMP;
  const r = resolveIngredients(index, ingredients);
  let grainG = 0;
  let vegG = 0;
  let fruitG = 0;
  const starch: ResolvedIngredient[] = [];
  for (const line of r.resolved) {
    const g = line.gramsRaw;
    if (!(g > 0)) continue;
    const group = line.ref.foodGroupRef;
    if (line.ref.yieldClass === "grain_absorbs") grainG += g;
    if (VEGETABLE_GROUPS.includes(group)) vegG += g;
    if (FRUIT_GROUPS.includes(group)) fruitG += g;
    if (CEILING_STARCH_GROUPS.has(group)) starch.push(line);
  }
  const all = nutrientsOf(r.resolved);
  const st = nutrientsOf(starch);
  return {
    grainG,
    vegG,
    fruitG,
    kcal: all === "unknown" ? 0 : all.energyKcal,
    starchKcal: st === "unknown" ? 0 : st.energyKcal,
  };
}

function addScaled(into: UnitComp, c: UnitComp, share: number): void {
  into.grainG += c.grainG * share;
  into.vegG += c.vegG * share;
  into.fruitG += c.fruitG * share;
  into.kcal += c.kcal * share;
  into.starchKcal += c.starchKcal * share;
}

function boxGrams(box: EnergyBoxDish["boxes"][number]): number {
  let sum = 0;
  for (const item of box.items) {
    const g = Number(item.grams);
    if (Number.isFinite(g) && g > 0) sum += g;
  }
  if (sum > 0) return sum;
  const legacy = Number(box.legacyTotalGrams);
  return Number.isFinite(legacy) && legacy > 0 ? legacy : 0;
}

/**
 * LA CHARGE DE L'ASSIETTE DE CHACUN, SUR LE PLAN FINAL.
 *
 * ── ⛔ LA COMPOSITION SUIT LE MÊME PRORATA QUE L'ÉNERGIE ─────────────────
 * Un item tiré d'une casserole apporte `grammes / masse prête de la casserole`
 * de chacune de ses lignes (`measurePreparation`, la masse que
 * `potDensities` divise); le frais du plat se partage au prorata des grammes
 * frais de chaque boîte; un plat d'archive sans clé de casserole se plie
 * (`foldPreparationsIntoDishes`) et se partage au prorata des grammes. Ce sont
 * les trois chemins de `boxNutrition`, et aucun autre.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function plateLoadOf(args: {
  index: CompositionIndex;
  dishes: readonly EnergyBoxDish[];
  preparations: readonly EnergyPreparation[];
  sides: FinalSideSource;
  /** ⛔ REQUIS — même règle que `finalServedByMouthDay`: aucune ligne sous plancher. */
  withheldMemberIds: ReadonlySet<string>;
}): PlateLoadTrace {
  const index = args.index;
  const prepById = new Map(args.preparations.map((p) => [p.id, p] as const));
  const potCache = new Map<string, { readyG: number | null; comp: UnitComp } | null>();
  const potOf = (id: string) => {
    if (potCache.has(id)) return potCache.get(id) ?? null;
    const prep = prepById.get(id);
    const value = prep === undefined ? null : {
      readyG: measurePreparation(index, {
        id: prep.id,
        method: prep.method ?? null,
        ingredients: prep.ingredients,
      }).readyG,
      comp: compOf(index, prep.ingredients),
    };
    potCache.set(id, value);
    return value;
  };
  const folded = foldPreparationsIntoDishes({
    dishes: args.dishes.map((d) => ({
      slot: d.slot,
      method: d.method,
      ingredients: d.ingredients,
      uses: d.uses,
    })),
    preparations: args.preparations,
  });
  const kcalByBox = boxNutrition({ index, dishes: args.dishes, preparations: args.preparations });

  interface Meal {
    ownBoxes: number;
    tub: boolean;
    readable: boolean;
    grams: number;
    comp: UnitComp;
    dishKcal: number | null;
    sideKcal: number | null;
    sideGrams: number;
    sideVegG: number;
  }
  interface Member {
    meals: Map<string, Meal>;
    fruitByDay: Map<string, number>;
  }
  const members = new Map<string, Member>();
  const withheld = new Set<string>();
  const memberOf = (id: string): Member | null => {
    if (args.withheldMemberIds.has(id)) {
      withheld.add(id);
      return null;
    }
    let m = members.get(id);
    if (m === undefined) {
      m = { meals: new Map(), fruitByDay: new Map() };
      members.set(id, m);
    }
    return m;
  };
  const mealOf = (m: Member, day: string, slot: string): Meal => {
    const key = `${day}|${slot}`;
    let meal = m.meals.get(key);
    if (meal === undefined) {
      meal = {
        ownBoxes: 0,
        tub: false,
        readable: true,
        grams: 0,
        comp: { ...ZERO_COMP },
        dishKcal: 0,
        sideKcal: 0,
        sideGrams: 0,
        sideVegG: 0,
      };
      m.meals.set(key, meal);
    }
    return meal;
  };
  const addFruit = (m: Member, day: string, g: number) => {
    m.fruitByDay.set(day, (m.fruitByDay.get(day) ?? 0) + g);
  };

  let k = 0;
  args.dishes.forEach((dish, i) => {
    const carries = dish.boxes.some((b) => b.items.some((it) => it.preparationId !== undefined));
    const own = carries ? compOf(index, dish.ingredients) : ZERO_COMP;
    const legacy = carries ? ZERO_COMP : compOf(index, folded[i].ingredients);
    const dishGrams = dish.boxes.reduce((n, b) => n + boxGrams(b), 0);
    const freshTotal = dish.boxes.reduce(
      (n, b) =>
        n + b.items.reduce((s, it) => {
          const g = Number(it.grams);
          return it.preparationId === null && Number.isFinite(g) && g > 0 ? s + g : s;
        }, 0),
      0,
    );
    for (const box of dish.boxes) {
      const kcal = kcalByBox[k]?.kcal ?? null;
      k += 1;
      const grams = boxGrams(box);
      const comp: UnitComp = { ...ZERO_COMP };
      let readable = true;
      if (!carries) {
        if (dishGrams > 0) addScaled(comp, legacy, grams / dishGrams);
      } else {
        let fresh = 0;
        for (const item of box.items) {
          const g = Number(item.grams);
          if (!Number.isFinite(g) || g <= 0) continue;
          if (typeof item.preparationId === "string") {
            const pot = potOf(item.preparationId);
            if (pot === null || pot.readyG === null || !(pot.readyG > 0)) {
              readable = false;
              continue;
            }
            addScaled(comp, pot.comp, g / pot.readyG);
          } else if (item.preparationId === null) {
            fresh += g;
          }
        }
        if (fresh > 0 && freshTotal > 0) addScaled(comp, own, fresh / freshTotal);
      }
      const eaters = box.memberIds.length;
      if (eaters === 0 || dish.day === null) continue;
      const main = dish.slot !== null && MAIN_SLOTS.includes(dish.slot);
      for (const memberId of box.memberIds) {
        const m = memberOf(memberId);
        if (m === null) continue;
        addFruit(m, dish.day, comp.fruitG / eaters);
        if (!main || dish.slot === null) continue;
        const meal = mealOf(m, dish.day, dish.slot);
        if (eaters > 1) {
          meal.tub = true;
          continue;
        }
        meal.ownBoxes += 1;
        meal.grams += grams;
        meal.readable = meal.readable && readable;
        addScaled(meal.comp, comp, 1);
        meal.dishKcal = meal.dishKcal === null || kcal === null ? null : meal.dishKcal + kcal;
      }
    }
  });

  const sides = sidesOf(args.sides);
  const measures = measureSideCourses({ index, preparations: args.preparations, sides });
  sides.forEach((side, i) => {
    if (side.day === null) return;
    const m = memberOf(side.memberId);
    if (m === null) return;
    const grams = side.grams ?? 0;
    let comp: UnitComp = ZERO_COMP;
    if (side.preparationId !== null) {
      const pot = potOf(side.preparationId);
      if (pot !== null && pot.readyG !== null && pot.readyG > 0 && grams > 0) {
        comp = { ...ZERO_COMP };
        addScaled(comp, pot.comp, grams / pot.readyG);
      }
    } else if (grams > 0) {
      comp = compOf(index, [sideCompositionLine(side)]);
    }
    addFruit(m, side.day, comp.fruitG);
    if (side.slot === null || !MAIN_SLOTS.includes(side.slot)) return;
    const meal = mealOf(m, side.day, side.slot);
    const kcal = measures[i].kcal;
    meal.sideKcal = meal.sideKcal === null || kcal === null ? null : meal.sideKcal + kcal;
    meal.sideGrams += grams;
    meal.sideVegG += comp.vegG;
  });

  const out: PlateLoadMember[] = [];
  for (const [memberId, m] of members) {
    const dishG: number[] = [];
    const grain: number[] = [];
    const veg: number[] = [];
    const mealVeg: number[] = [];
    const sideK: number[] = [];
    const sideShare: number[] = [];
    const mealG: number[] = [];
    let measured = 0;
    let tubMeals = 0;
    let unreadable = 0;
    let over = 0;
    let underFloor = 0;
    let starchKcal = 0;
    let compKcal = 0;
    for (const meal of m.meals.values()) {
      if (meal.tub) {
        tubMeals += 1;
        continue;
      }
      if (meal.ownBoxes === 0) continue;
      measured += 1;
      dishG.push(meal.grams);
      if (meal.grams > PLATE_LOAD_HEAVY_DISH_G) over += 1;
      mealG.push(meal.grams + meal.sideGrams);
      if (meal.sideKcal !== null) sideK.push(meal.sideKcal);
      if (meal.sideKcal !== null && meal.dishKcal !== null && meal.dishKcal + meal.sideKcal > 0) {
        sideShare.push(meal.sideKcal / (meal.dishKcal + meal.sideKcal));
      }
      if (!meal.readable) {
        unreadable += 1;
        continue;
      }
      grain.push(meal.comp.grainG);
      veg.push(meal.comp.vegG);
      mealVeg.push(meal.comp.vegG + meal.sideVegG);
      if (meal.comp.vegG < VEG_FLOOR_G_PER_MAIN_SERVING) underFloor += 1;
      starchKcal += meal.comp.starchKcal;
      compKcal += meal.comp.kcal;
    }
    const fruit = [...m.fruitByDay.values()];
    out.push({
      member_id: memberId,
      meals: measured,
      tub_meals: tubMeals,
      unreadable,
      dish_g_median: roundOrNull(median(dishG)),
      dish_g_max: roundOrNull(maxOf(dishG)),
      dishes_over_heavy: over,
      dry_grain_g_median: roundOrNull(median(grain)),
      dry_grain_g_max: roundOrNull(maxOf(grain)),
      veg_raw_g_median: roundOrNull(median(veg)),
      veg_under_floor: underFloor,
      meal_veg_raw_g_median: roundOrNull(median(mealVeg)),
      starch_kcal_share: compKcal > 0 ? round2(starchKcal / compKcal) : null,
      side_kcal_median: roundOrNull(median(sideK)),
      side_share_median: round2OrNull(median(sideShare)),
      side_share_max: round2OrNull(maxOf(sideShare)),
      fruit_g_per_day_median: roundOrNull(median(fruit)),
      fruit_g_per_day_min: roundOrNull(fruit.length === 0 ? null : Math.min(...fruit)),
      meal_g_median: roundOrNull(median(mealG)),
      meal_g_max: roundOrNull(maxOf(mealG)),
    });
  }
  return {
    heavy_dish_g: PLATE_LOAD_HEAVY_DISH_G,
    veg_floor_g: VEG_FLOOR_G_PER_MAIN_SERVING,
    withheld_members: withheld.size,
    members: out,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ `meal-energy-v1` — LES À-CÔTÉS SOUS LA MÊME PORTE QUE LES BOÎTES
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ SORTI DE LA FONCTION EDGE POUR ÊTRE EXÉCUTÉ PAR UN TEST. La décision par
// boîte a déjà payé ce prix (`box_energy_decision.ts`, en-tête): une règle qui
// ne vit que dans `Deno.serve` n'est exécutée par aucun test, et quatre
// mutations y sont restées vertes.

/**
 * UN À-CÔTÉ TEL QU'IL SORT SOUS SA BOÎTE.
 *
 * `kcal: null` = l'à-côté est servi, son énergie ne se lit pas. Jamais 0: un
 * zéro se lirait « ce dessert ne compte pas ».
 */
export interface EmittedSide {
  kind: SideCourseKind | null;
  term: string;
  kcal: number | null;
  basis: string;
}

export type BoxWithSides<B> = B & { sides: EmittedSide[] };

/**
 * LE COMPTEUR DE L'ATTACHE — écrit même à zéro.
 *
 * `no_host`: l'à-côté n'a trouvé aucune boîte ÉMISE de sa personne sur son
 * plat (personne fermée par la porte, bac commun, lecteur hors du foyer). Il
 * ne sort pas — c'est la porte, pas une perte — et il est compté.
 */
export interface SideEmitCounts {
  sides: number;
  attached: number;
  unreadable: number;
  no_host: number;
}

/**
 * LES À-CÔTÉS DE CHAQUE BOÎTE ÉMISE, SOUS LA MÊME PORTE QU'ELLE.
 *
 * ⛔ UN À-CÔTÉ NE SORT QUE SOUS UNE BOÎTE ÉMISE DE SA PERSONNE, SUR SON PLAT.
 * La boîte a passé `decideBoxEnergy` (plancher TCA, âge, interrupteur,
 * appartenance du lecteur): son émission EST la preuve que cette personne a
 * droit à son chiffre. Aucune seconde porte n'est écrite ici — une seconde
 * porte finirait par ne plus dire la même chose que la première.
 *
 * ⚠️ UNE BOÎTE SANS À-CÔTÉ PORTE `sides: []`, ET SON `kcal` NE BOUGE PAS. Le
 * `kcal` d'une boîte reste le PLAT: un plan d'avant les à-côtés rend
 * exactement les mêmes nombres qu'avant ce lot.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sidesOnEmittedBoxes<B extends { box_id: string; member_id: string }>(args: {
  boxes: readonly B[];
  /** Les plats du payload (`readEnergyBoxDishes`), pour savoir sur quel plat vit chaque boîte. */
  dishes: readonly EnergyBoxDish[];
  /** `readEnergySideCourses` du même payload. */
  sides: readonly EnergySideCourse[];
  /** `measureSideCourses` sur ces `sides`, dans le même ordre. */
  measures: readonly SideMeasure[];
}): { boxes: BoxWithSides<B>[]; counts: SideEmitCounts } {
  if (args.measures.length !== args.sides.length) {
    throw new Error(
      `[keel/served_final] ${args.sides.length} à-côtés pour ${args.measures.length} mesures — les deux listes vont ensemble`,
    );
  }
  const dishOfBox = new Map<string, number>();
  args.dishes.forEach((dish, i) => {
    for (const box of dish.boxes) if (!dishOfBox.has(box.id)) dishOfBox.set(box.id, i);
  });
  const out: BoxWithSides<B>[] = args.boxes.map((b) => ({ ...b, sides: [] as EmittedSide[] }));
  /** `${dishIndex}|${memberId}` → la PREMIÈRE boîte émise de cette personne sur ce plat. */
  const host = new Map<string, BoxWithSides<B>>();
  for (const box of out) {
    const i = dishOfBox.get(box.box_id);
    if (i === undefined) continue;
    const key = `${i}|${box.member_id}`;
    if (!host.has(key)) host.set(key, box);
  }
  const counts: SideEmitCounts = { sides: 0, attached: 0, unreadable: 0, no_host: 0 };
  args.sides.forEach((side, i) => {
    counts.sides += 1;
    const box = side.dishIndex === null ? undefined : host.get(`${side.dishIndex}|${side.memberId}`);
    if (box === undefined) {
      counts.no_host += 1;
      return;
    }
    const kcal = args.measures[i].kcal;
    box.sides.push({
      kind: side.kind,
      term: side.term,
      kcal: kcal === null ? null : Math.round(kcal),
      basis: PLAN_ENERGY_BASIS,
    });
    counts.attached += 1;
    if (kcal === null) counts.unreadable += 1;
  });
  return { boxes: out, counts };
}

/**
 * LE TOTAL DE CHAQUE JOUR DU LECTEUR: SES BOÎTES + LEURS À-CÔTÉS.
 *
 * ⛔ LE LECTEUR, ET PERSONNE D'AUTRE. Les boîtes émises sont celles de TOUTES
 * les personnes du foyer qui ont droit à leur chiffre: sommer sans filtrer
 * donnerait la journée de la table.
 *
 * `complete: false` quand un à-côté d'une de ses boîtes ne se lit pas: le
 * total manque alors une part, et le dire vaut mieux que de l'additionner à
 * zéro. Sans à-côté, `complete` vaut `true` et `kcal` est exactement la somme
 * des boîtes — le comportement d'avant ce lot.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function viewerDayEnergy(args: {
  boxes: readonly {
    day: string | null;
    member_id: string;
    kcal: number;
    sides: readonly EmittedSide[];
  }[];
  viewerMemberId: string | null;
}): Map<string, { kcal: number; boxes: number; sides: number; complete: boolean }> {
  const byDay = new Map<string, { kcal: number; boxes: number; sides: number; complete: boolean }>();
  for (const box of args.boxes) {
    if (args.viewerMemberId === null || box.member_id !== args.viewerMemberId) continue;
    if (box.day === null) continue;
    const cur = byDay.get(box.day) ?? { kcal: 0, boxes: 0, sides: 0, complete: true };
    cur.kcal += box.kcal;
    cur.boxes += 1;
    for (const side of box.sides) {
      cur.sides += 1;
      if (side.kcal === null) cur.complete = false;
      else cur.kcal += side.kcal;
    }
    byDay.set(box.day, cur);
  }
  return byDay;
}

/**
 * ⟳ 2026-09-24 — LE TOTAL DE CHAQUE JOUR, POUR CHAQUE PERSONNE DONT LES BOÎTES
 * SORTENT — le tableau de la semaine, en tête du plan.
 *
 * ⛔ UNE SOMME DE BOÎTES DÉJÀ ÉMISES, ET RIEN D'AUTRE. Chaque boîte reçue ici a
 * passé `decideBoxEnergy` (plancher TCA, âge, doctrine, interrupteur,
 * appartenance du lecteur): la somme ne fait sortir aucun chiffre que la
 * réponse ne portait pas déjà, boîte par boîte. Une personne sans boîte émise
 * (enfant, sans objectif, interrupteur éteint) n'a AUCUNE ligne — pas un zéro.
 *
 * ⚠️ `viewerDayEnergy` N'EST PAS RÉÉCRITE sur celle-ci: son filtre est épinglé
 * (`energy_gate_mouth_test.ts`), et le total du jour du LECTEUR reste son
 * affaire. Les deux sommes sont les mêmes pour le lecteur, par construction.
 *
 * `meals_total` = les plats de ce jour dont UNE boîte nomme la personne, bac
 * commun compris; `meals_counted` = ceux qui ont sa boîte ÉMISE. Un repas pris
 * dans un bac commun ne se chiffre pas pour elle (le bac est une quantité de
 * table, pas sa portion): le total est alors vrai sur ce qu'il couvre, et
 * `complete` le dit. Un à-côté illisible le dit aussi.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export interface MemberDayEnergyRow {
  member_id: string;
  day: string;
  kcal: number;
  meals_counted: number;
  meals_total: number;
  complete: boolean;
}

export function memberDayEnergy(args: {
  boxes: readonly {
    box_id: string;
    day: string | null;
    member_id: string;
    kcal: number;
    sides: readonly EmittedSide[];
  }[];
  /** Les plats du payload (`readEnergyBoxDishes`) — pour le dénominateur. */
  dishes: readonly { day: string | null; boxes: readonly { id: string; memberIds: readonly string[] }[] }[];
}): MemberDayEnergyRow[] {
  const keyOf = (member: string, day: string) => `${member} ${day}`;
  // LE DÉNOMINATEUR — les repas du jour où une boîte nomme la personne.
  const total = new Map<string, number>();
  for (const dish of args.dishes) {
    if (dish.day === null) continue;
    const named = new Set<string>();
    for (const box of dish.boxes) for (const m of box.memberIds) named.add(m);
    for (const m of named) total.set(keyOf(m, dish.day), (total.get(keyOf(m, dish.day)) ?? 0) + 1);
  }
  const rows = new Map<string, MemberDayEnergyRow>();
  for (const box of args.boxes) {
    if (box.day === null) continue;
    const key = keyOf(box.member_id, box.day);
    const row = rows.get(key) ?? {
      member_id: box.member_id,
      day: box.day,
      kcal: 0,
      meals_counted: 0,
      meals_total: 0,
      complete: true,
    };
    row.kcal += box.kcal;
    row.meals_counted += 1;
    for (const side of box.sides) {
      if (side.kcal === null) row.complete = false;
      else row.kcal += side.kcal;
    }
    rows.set(key, row);
  }
  const out: MemberDayEnergyRow[] = [];
  for (const [key, row] of rows) {
    // Au moins les repas comptés: un plat sans jour lisible au dénominateur ne
    // doit pas rendre un « 3 sur 2 ».
    row.meals_total = Math.max(row.meals_counted, total.get(key) ?? 0);
    if (row.meals_counted < row.meals_total) row.complete = false;
    row.kcal = Math.round(row.kcal);
    out.push(row);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTILS
// ═══════════════════════════════════════════════════════════════════════════

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function maxOf(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function round2OrNull(value: number | null): number | null {
  return value === null ? null : round2(value);
}
