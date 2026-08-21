/**
 * LOT 1 — CE QUE CHAQUE BOUCHE RECOIT VRAIMENT, PAR JOUR.
 *
 * Chantier: `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`.
 *
 * ── LA PIÈCE QUI MANQUAIT, ET LE DÉFAUT QU'ELLE FERME ─────────────────────
 * Le produit savait dire QUI mange le plus. Il ne savait pas dire COMBIEN.
 *
 * `bodyShareFactors` rend `entretien / moyenne(entretiens de la table)`: la
 * somme des facteurs vaut le nombre de bouches, exprès, pour que la casserole
 * ne gonfle pas. C'est un RAPPORT. Il déplace des grammes entre deux personnes
 * et ne décide jamais du niveau — mesuré sur le foyer `5600347f` le
 * 2026-08-19: `450 + 450 = 900` avant, `612 + 344 = 956` après. Le seul
 * ancrage du nombre 450 dans tout le produit était la locution « one plate's
 * worth » du prompt, c'est-à-dire une intuition du modèle.
 *
 * Ce module est la moitié qui manque: il rend l'énergie RÉELLEMENT servie à
 * une bouche, un jour donné, calculée sur les quantités que le produit a
 * écrites — pas sur une déclaration du modèle sur lui-même.
 *
 * ── CE QU'IL N'EST PAS ────────────────────────────────────────────────────
 * ⛔ Il ne décide RIEN. Il ne compare à aucune cible, n'applique aucun
 * facteur, ne touche à aucune part. La comparaison cible/livré est le LOT 2, et
 * la porte qui autorise à calculer une cible est `energy_gate.ts`, qui reste en
 * LECTURE SEULE pour tout ce chantier.
 *
 * ⛔ Aucun kcal d'ici ne s'énonce. Ni prompt, ni écran, ni réponse HTTP, ni log
 * nominatif. On calcule avec, on ne le dit jamais — c'est la ligne de partage
 * de `lineBodies` dans le générateur foyer, et elle vaut ici mot pour mot.
 *
 * ── POURQUOI LA PART VIENT DE LA BOÎTE, ET DE RIEN D'AUTRE ────────────────
 * Une boîte porte un REPAS entier depuis le 2026-08-19, avec une part par nom
 * sur le couvercle. La fraction qu'une bouche reçoit d'un plat est donc
 * exactement `sa part / le total du couvercle`. C'est le même prorata que
 * `sizeBoxesFromTarget` applique déjà casserole par casserole; on ne l'écrit
 * pas une seconde fois, on lit le couvercle.
 *
 * ⚠️ UN PLAT SANS BOÎTE N'EST ATTRIBUÉ À PERSONNE, ET LE JOUR LE DIT. Il est
 * mangé — mais par qui, et en quelle proportion, n'est écrit nulle part. Le
 * répartir « équitablement » fabriquerait un nombre que rien ne soutient, et
 * l'ignorer en silence rendrait une journée creuse qui a l'air complète. Il est
 * donc COMPTÉ, et il fait basculer `subject`: le total ne parle plus de la
 * journée, il parle de ce qui a pu être attribué. C'est le patron de `mealsOut`
 * dans `plan_energy.ts`, et c'est délibérément le même.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { CompositionIndex, CompositionInput } from "./food_composition.ts";
import {
  type DishEnergy,
  dishEnergy,
  type EnergyPreparation,
  PLAN_ENERGY_BASIS,
  type PlanEnergyBasis,
} from "./plan_energy.ts";
// LE PLIAGE EST IMPORTÉ, JAMAIS RECOPIÉ. 51 % de la protéine restait hors du
// verdict avant qu'il existe; une seconde écriture du prorata divergerait de
// celle-ci au premier ajustement, et c'est celle qu'on relit le moins qui
// rendrait un chiffre faux.
import { foldPreparationsIntoDishes } from "./meal_verdict.ts";

/**
 * POURQUOI UNE BOUCHE N'A PAS SON CHIFFRE SUR UN PLAT. Nommé, jamais un `null`
 * nu — les trois se réparent à trois endroits différents.
 */
export const MOUTH_ENERGY_GAPS = Object.freeze(
  [
    /** Le plat n'a aucun contenant: personne ne sait qui en prend combien. */
    "no_box",
    /** Le contenant existe et ne pèse rien. Aucune fraction n'est calculable. */
    "empty_box",
    /** `dishEnergy` s'est abstenu sur ce plat (terme inconnu, ou non pesé). */
    "dish_incomplete",
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LE BAC COMMUN — UN SILENCE **NOMMÉ**, ET PAS UN `null` DE PLUS (v4).
     * ══════════════════════════════════════════════════════════════════════
     *
     * Le contenant porte PLUSIEURS noms: ses grammes sont une quantité de bac,
     * pas la portion de quelqu'un. Il n'y a donc pas de kcal par bouche à en
     * tirer, et ce n'est pas une lacune du plan — c'est qu'il n'y a rien à
     * savoir.
     *
     * ⛔ DIVISER LE BAC PAR LE NOMBRE DE MANGEURS FERAIT REVENIR PAR LA PORTE
     * DE L'ÉNERGIE la division exacte que v3 et v4 existent pour supprimer, et
     * le nombre aurait l'air personnel alors qu'il ne l'est pas.
     *
     * ⚠️ CE QUE ÇA COÛTE, ÉCRIT ICI POUR QUE PERSONNE NE LE REDÉCOUVRE: une
     * bouche en `maintenance` **perd sa lecture calorique**. C'est cohérent —
     * elle n'a demandé aucun chiffre — mais c'est une régression visible pour
     * qui la lisait. Ne la « répare » pas en divisant.
     *
     * ⛔ ET IL BLOQUE L'ANCRAGE (`mouth_anchor`), contrairement à `no_box`. Un
     * `no_box` retire aussi le MOMENT du plat de la couverture, donc les deux
     * côtés du rapport baissent ensemble; un bac commun laisse le moment dans
     * `slots` — la bouche a bien mangé ce midi — et sous-estimerait le livré
     * tout seul. On servirait davantage à quelqu'un parce qu'on a refusé de
     * lire son assiette.
     */
    "common_pot",
  ] as const,
);
export type MouthEnergyGap = (typeof MOUTH_ENERGY_GAPS)[number];

/** Un plat, réduit à ce dont ce module a besoin. */
export interface MouthEnergyDish {
  day: string | null;
  /**
   * LE MOMENT DE CE PLAT. `null` = non déclaré.
   *
   * ⚠️ IL N'EST PAS DÉCORATIF: sans lui, on ne peut pas dire QUELLE PART de la
   * journée d'une bouche le plan a composée, et comparer une cible de journée
   * entière à un seul dîner rend un facteur trois fois trop grand. Mesuré sur
   * le run du 2026-08-20: Christèle déclare `lunch`+`dinner`, le plan ne lui
   * compose que `dinner`, et son facteur brut sortait à 6,28.
   */
  slot: string | null;
  method: string;
  ingredients: readonly CompositionInput[];
  uses: readonly { preparationId: string; servings: number }[];
  /**
   * LES CONTENANTS DE CE PLAT. `[]` = rien n'a été pesé d'avance pour lui.
   *
   * ⚠️ AU PLURIEL DEPUIS v4: un repas produit un contenant par GROUPE de
   * mangeurs, et c'est le NOMBRE DE NOMS qui décide si ses grammes sont une
   * prescription (un seul) ou une quantité de bac (plusieurs).
   */
  boxes: readonly {
    memberIds: readonly string[];
    items: readonly { grams: number }[];
    /** La somme d'un `box` v2 replié. `null` sur v4 — le total vient des items. */
    legacyTotalGrams: number | null;
  }[];
}

export interface MouthDayEnergy {
  memberId: string;
  /** Jeton `mon`..`sun`, ou `null` pour un plat sans jour. */
  day: string | null;
  /**
   * L'ÉNERGIE SERVIE À CETTE BOUCHE CE JOUR-LÀ, arrondie.
   *
   * `null` quand AUCUN de ses plats n'est calculable — un `0` se lirait « cette
   * journée ne la nourrit pas », le sens exactement inverse. Même arbitrage que
   * `DayEnergy.kcal`.
   */
  kcal: number | null;
  basis: PlanEnergyBasis;
  /** Tous les plats où elle a une part ont été calculés, et le jour est entier. */
  complete: boolean;
  /** Les plats de ce jour où elle a une part, et qui ont rendu un chiffre. */
  dishesCounted: number;
  /** Les plats de ce jour où elle a une part. Le dénominateur. */
  dishesTotal: number;
  /**
   * Les plats de ce jour que le couvercle n'attribue à personne. `0` = nominal.
   *
   * ⚠️ IL EST À PART DE `dishesCounted`/`dishesTotal`, ET C'EST LE POINT. Les
   * deux incomplétudes ne se réparent pas au même endroit: l'une par le
   * référentiel, l'autre par le prompt des boîtes. Un compteur qui les fondrait
   * nommerait la mauvaise cause.
   */
  unattributedDishes: number;
  /**
   * DE QUOI CE NOMBRE PARLE. Nommé, jamais dérivé par l'appelant.
   *
   *   `the_day`                  — sa journée. `unattributedDishes === 0`.
   *   `what_could_be_attributed` — ce que les couvercles ont su lui attribuer.
   */
  subject: "the_day" | "what_could_be_attributed";
  /**
   * LES MOMENTS DE CE JOUR OÙ CETTE BOUCHE A UNE PART, dédupliqués et triés.
   *
   * C'est le dénominateur honnête de toute comparaison à une cible: le plan
   * n'est responsable que de ce qu'il a composé pour elle.
   */
  slots: string[];
  /**
   * LES GRAMMES QUE CETTE BOUCHE PREND CE JOUR-LÀ, tous plats confondus.
   *
   * Le dénominateur du plafond de PLAUSIBILITÉ PHYSIQUE: un facteur peut être
   * arithmétiquement juste et rendre une assiette que personne ne finit.
   */
  grams: number;
  /**
   * LA PLUS GROSSE PART D'UN SEUL REPAS de cette journée, en grammes.
   *
   * ⛔ C'EST ELLE QUE LE PLAFOND DE VRAISEMBLANCE DOIT LIRE, PAS LE TOTAL DU
   * JOUR. Mesuré le 2026-08-20 sur l'écran du propriétaire: une borne
   * JOURNALIÈRE (30 g/kg) laissait passer **1 232 g dans UNE boîte** — la
   * journée entière restait « plausible » pendant qu'un seul repas devenait
   * inmangeable. C'est le repas qu'on sert, c'est le repas qu'il faut borner.
   */
  maxMealGrams: number;
  gaps: MouthEnergyGap[];
}

/** Ce qu'une bouche prend d'un plat, et ce que ça coûte en énergie. */
export interface MouthSlice {
  memberId: string;
  kcal: number | null;
  gap: MouthEnergyGap | null;
}

/**
 * LA FRACTION DE CHAQUE BOUCHE SUR UN PLAT, ET SON ÉNERGIE.
 *
 * Exportée parce que le LOT 2 en aura besoin plat par plat, et qu'une seconde
 * écriture de ce prorata est très exactement ce que ce fichier existe pour
 * éviter.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dishSlices(
  energy: DishEnergy,
  dish: MouthEnergyDish,
): MouthSlice[] {
  if (dish.boxes.length === 0) return [];
  /** Ce que pèse un contenant: la somme de ses composants, ou son total v2. */
  const gramsOf = (box: MouthEnergyDish["boxes"][number]): number => {
    let sum = 0;
    for (const item of box.items) {
      const g = Number(item.grams);
      if (Number.isFinite(g) && g > 0) sum += g;
    }
    if (sum > 0) return sum;
    const legacy = Number(box.legacyTotalGrams);
    return Number.isFinite(legacy) && legacy > 0 ? legacy : 0;
  };
  // LE DÉNOMINATEUR EST LE PLAT ENTIER, pas un couvercle. `dishEnergy` rend
  // l'énergie de tout ce qui sort des casseroles de ce plat; ce qu'une bouche
  // reçoit est la fraction que SON contenant en porte.
  let total = 0;
  for (const box of dish.boxes) total += gramsOf(box);
  const out: MouthSlice[] = [];
  for (const box of dish.boxes) {
    // ⛔ UN KCAL PAR BOUCHE N'EXISTE QUE POUR UN CONTENANT À **UN** NOM (v4).
    // Plusieurs noms ⇒ les grammes décrivent un récipient, pas une assiette, et
    // les diviser par le nombre de mangeurs remettrait la division que ce
    // modèle existe pour supprimer. Un silence NOMMÉ, jamais un `null` nu.
    if (box.memberIds.length !== 1) {
      for (const memberId of box.memberIds) {
        out.push({ memberId, kcal: null, gap: "common_pot" as const });
      }
      continue;
    }
    const memberId = box.memberIds[0];
    if (total <= 0) {
      out.push({ memberId, kcal: null, gap: "empty_box" as const });
      continue;
    }
    if (!energy.complete || energy.kcal === null) {
      out.push({ memberId, kcal: null, gap: "dish_incomplete" as const });
      continue;
    }
    out.push({ memberId, kcal: energy.kcal * (gramsOf(box) / total), gap: null });
  }
  return out;
}

/**
 * L'ÉNERGIE SERVIE À CHAQUE BOUCHE, JOUR PAR JOUR.
 *
 * Une ligne par couple (bouche, jour) rencontré, dans l'ordre de première
 * apparition. Une bouche qui n'a de part nulle part n'a aucune ligne — elle
 * n'est pas « à zéro », elle est absente de ce plan.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function mouthDayEnergy(args: {
  index: CompositionIndex;
  dishes: readonly MouthEnergyDish[];
  preparations: readonly EnergyPreparation[];
}): MouthDayEnergy[] {
  // ── ① LES PRÉPARATIONS PLIÉES DANS LEURS PLATS ──────────────────────────
  const folded = foldPreparationsIntoDishes({
    dishes: args.dishes.map((d) => ({
      slot: d.slot,
      method: d.method,
      ingredients: d.ingredients,
      uses: d.uses,
    })),
    preparations: args.preparations,
  });

  const out: MouthDayEnergy[] = [];
  const byKey = new Map<string, MouthDayEnergy>();
  /** Les plats non attribués, par jour: ils touchent TOUTES les bouches du jour. */
  const unattributedByDay = new Map<string, number>();

  const rowFor = (memberId: string, day: string | null): MouthDayEnergy => {
    const key = `${memberId} ${day ?? ""}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        memberId,
        day,
        kcal: null,
        basis: PLAN_ENERGY_BASIS,
        complete: true,
        dishesCounted: 0,
        dishesTotal: 0,
        unattributedDishes: 0,
        subject: "the_day",
        slots: [],
        grams: 0,
        maxMealGrams: 0,
        gaps: [],
      };
      byKey.set(key, row);
      out.push(row);
    }
    return row;
  };

  for (const [i, dish] of args.dishes.entries()) {
    const dayKey = dish.day ?? "";
    // ⚠️ `folded[i]` — LES INDEX SE CORRESPONDENT, c'est le contrat de
    // `foldPreparationsIntoDishes` (un `map`, jamais un filtre).
    const energy = dishEnergy(args.index, {
      method: dish.method,
      ingredients: folded[i].ingredients,
    });
    const slices = dishSlices(energy, dish);
    if (slices.length === 0) {
      unattributedByDay.set(dayKey, (unattributedByDay.get(dayKey) ?? 0) + 1);
      continue;
    }
    for (const slice of slices) {
      const row = rowFor(slice.memberId, dish.day);
      row.dishesTotal++;
      // ⚠️ COMPTÉS MÊME QUAND L'ÉNERGIE MANQUE: les grammes sont sur le
      // couvercle, ils ne dépendent pas du référentiel.
      //
      // ⛔ MAIS SEULEMENT SUR UN CONTENANT À UN SEUL NOM. Les grammes d'un bac
      // commun ne sont la portion de personne: les recopier sur chacun de ses
      // mangeurs ferait lire « 1 200 g dans une boîte » à quatre personnes et
      // ferait mordre le plafond de vraisemblance sur une assiette qui n'existe
      // pas. `maxMealGrams` borne un REPAS SERVI, et un bac n'en est pas un.
      for (const box of dish.boxes) {
        if (box.memberIds.length !== 1 || box.memberIds[0] !== slice.memberId) continue;
        let g = 0;
        for (const item of box.items) {
          const n = Number(item.grams);
          if (Number.isFinite(n) && n > 0) g += n;
        }
        if (g <= 0) {
          const legacy = Number(box.legacyTotalGrams);
          if (Number.isFinite(legacy) && legacy > 0) g = legacy;
        }
        if (g > 0) {
          row.grams += g;
          if (g > row.maxMealGrams) row.maxMealGrams = g;
        }
      }
      // ⚠️ LE MOMENT EST ENREGISTRÉ MÊME QUAND L'ÉNERGIE MANQUE: « le plan a
      // composé son déjeuner » et « on a su le peser » sont deux faits
      // différents, et confondre les deux ferait croire qu'un moment composé
      // mais illisible n'a pas été composé du tout.
      if (dish.slot !== null && !row.slots.includes(dish.slot)) {
        row.slots.push(dish.slot);
        row.slots.sort();
      }
      if (slice.gap !== null) {
        row.complete = false;
        if (!row.gaps.includes(slice.gap)) row.gaps.push(slice.gap);
        continue;
      }
      row.dishesCounted++;
      row.kcal = (row.kcal ?? 0) + (slice.kcal ?? 0);
    }
  }

  // ── ② CE QUE LE COUVERCLE N'A ATTRIBUÉ À PERSONNE ───────────────────────
  // ⚠️ APPLIQUÉ APRÈS, ET À TOUTES LES BOUCHES DU JOUR. Un plat sans couvercle
  // ne nomme personne: il rend le total de CHACUN partiel, pas celui d'un seul.
  for (const row of out) {
    const n = unattributedByDay.get(row.day ?? "") ?? 0;
    if (n === 0) continue;
    row.unattributedDishes = n;
    row.subject = "what_could_be_attributed";
    row.complete = false;
    if (!row.gaps.includes("no_box")) row.gaps.push("no_box");
  }

  for (const row of out) {
    if (row.kcal !== null) row.kcal = Math.round(row.kcal);
  }
  return out;
}
