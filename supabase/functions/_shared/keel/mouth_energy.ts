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

import type { CompositionIndex } from "./food_composition.ts";
import {
  type DishEnergy,
  dishEnergy,
  UNRESOLVED_ENERGY_TOLERANCE,
  type EnergyIngredient,
  type EnergyPreparation,
  PLAN_ENERGY_BASIS,
  type PlanEnergyBasis,
} from "./plan_energy.ts";
// LE PLIAGE EST IMPORTÉ, JAMAIS RECOPIÉ. 51 % de la protéine restait hors du
// verdict avant qu'il existe; une seconde écriture du prorata divergerait de
// celle-ci au premier ajustement, et c'est celle qu'on relit le moins qui
// rendrait un chiffre faux.
import { foldPreparationsIntoDishes } from "./meal_verdict.ts";
// ⟳ LOT 0 (2026-09-06) — LA MÊME MASSE PRÊTE QUE LE DENSIFIEUR ET LA CROISSANCE
// DES CASSEROLES (eau de cuisson exclue quand un grain absorbe). Une casserole
// doit avoir UNE densité dans tout le moteur ; la recalculer ici avec une autre
// règle en ferait deux.
// ⟳ 2026-09-11 · LOT B — ET CETTE RÈGLE VIT MAINTENANT DANS `preparation_mass.ts`,
// où elle décide PAR UNITÉ DE CUISSON. `weighedReadyGrams` y délègue ; on lit
// la source plutôt que son alias.
import {
  measureFresh,
  measurePreparation,
  proteinOfUnit,
  readyGramsOfUnit,
} from "./preparation_mass.ts";

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
  /**
   * ⟳ L17 — `EnergyIngredient` ET PAS `CompositionInput`, et ce n'est pas
   * cosmétique. La lane foyer passe ici les objets d'ingrédient SORTIS DU
   * PARSEUR (`meal.dishes[].ingredients`), qui portent déjà la clé `group`
   * déclarée par le modèle. Avec le type étroit, ce champ traversait quand même
   * — les propriétés en trop survivent à l'affectation — mais **en silence**:
   * le jour où quelqu'un recopie ces objets champ par champ, la borne de groupe
   * meurt sans qu'aucun compilateur ne le dise. C'est très exactement ce que
   * `ingredientPayload()` a fait pendant trois générations.
   */
  ingredients: readonly EnergyIngredient[];
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
    /**
     * ⟳ LOT 0 (2026-09-06) — `preparationId` OUVRE L'ATTRIBUTION PAR GRAMMES
     * TIRÉS. Un item qui cite une casserole vaut `grams × densité(casserole)` ;
     * un item sans casserole (`null`) est une part du frais du plat. Quand
     * AUCUN item ne porte la clé (`undefined` partout : archives d'avant v4,
     * bancs anciens), le pliage par `uses.servings` s'applique comme avant.
     */
    items: readonly { grams: number; preparationId?: string | null }[];
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
   * LES MOMENTS DE CE JOUR OÙ CETTE BOUCHE EST **SEULE SUR UN COUVERCLE**.
   *
   * ⛔ SOUS-ENSEMBLE DE `slots`, ET LA DIFFÉRENCE EST LE SUJET. `slots` dit ce
   * que le plan a composé POUR elle; `ownSlots` dit ce dont il peut rendre
   * compte — un bac partagé nourrit sans qu'on sache combien.
   *
   * C'est le dénominateur honnête de `anchorFactorFor`: comparer une cible de
   * JOURNÉE ENTIÈRE à ce qu'un seul moment livre rend un facteur absurde (6,28
   * mesuré, c'est-à-dire une assiette de deux kilos). Réduire la cible aux
   * moments dont on sait lire le livré fait baisser les DEUX côtés du rapport
   * ensemble — le même argument qui a exempté `no_box`.
   *
   * `[]` = toute sa journée est en bac commun. L'ancrage s'abstient alors, et le
   * dit (`common_pot_day`).
   */
  ownSlots: string[];
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

/** CE QU'UN CONTENANT PORTE — son poids, son énergie, et ses mangeurs. */
// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT 0 (2026-09-06) — L'ÉNERGIE D'UNE BOÎTE SUIT SES GRAMMES TIRÉS, PAS
// `uses.servings`
// ═══════════════════════════════════════════════════════════════════════════
//
// Mesuré sur la campagne du 2026-09-05 (lot 1, M07, cinq bouches) : les boîtes
// tiraient 34 417 g des casseroles pendant que le pliage n'en attribuait que
// 5 826 g aux plats (×5,9). Le modèle écrit `uses.servings: 1` sur des
// casseroles de 10–15 parts, quel que soit le nombre de bouches (36/39 plats de
// M05, 44/44 de M06, 11/11 de M11, 19/19 de M12), et `share = servings /
// servingsMade` donnait 1/15 de casserole à un repas de 3 kg — 0,2 kcal/g lu.
// L'ancre lisait ce chiffre (`day.kcal`), rabotait ×3 partout, et le
// densifieur ne trouvait « rien de dense ». Le déficit était une convention
// d'écriture du modèle, pas l'assiette.
//
// ── LA RÈGLE ──────────────────────────────────────────────────────────────
//   · un item de boîte qui cite une casserole vaut `grams × kcal/g de la
//     casserole` — la densité est `dishEnergy(casserole) / weighedReadyGrams`,
//     la MÊME que celle du densifieur (`densityFromComposition`) et de la
//     croissance des casseroles ;
//   · un item sans casserole est une part du FRAIS du plat (`dish.ingredients`),
//     partagée entre les boîtes au prorata de leurs grammes frais — et, si
//     aucune boîte ne porte de frais (mangé à table, jamais mis en boîte), au
//     prorata des grammes totaux, comme avant ;
//   · une casserole dont la densité est illisible rend `dish_incomplete` sur
//     les boîtes qui la citent — jamais zéro (voir « un plat dont l'énergie
//     est inconnue N'EST PAS compté comme zéro »).
//
// ⚠️ LE PLIAGE RESTE POUR CE QUI N'A PAS D'ITEM CITANT : archives d'avant v4 et
// bancs qui ne posent pas `preparationId`. La bascule est décidée par la
// PRÉSENCE de la clé, pas par sa valeur : `null` = frais, `undefined` = legacy.
//
// ⛔ `uses.servings` N'EST PAS RÉÉCRIT ICI. Le verdict de plan (`meal_verdict`)
// le lit toujours ; le compteur `potAttributionGap` dit de combien il se
// trompe, plan par plan, et c'est ce compteur qui décidera s'il faut le
// dériver des boîtes.

/**
 * kcal PAR GRAMME PRÊT de chaque casserole, ou `null` quand le référentiel ne
 * sait pas la lire (énergie incomplète ou masse prête inconnue).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potDensities(
  index: CompositionIndex,
  preparations: readonly EnergyPreparation[],
): ReadonlyMap<string, number | null> {
  const out = new Map<string, number | null>();
  for (const prep of preparations) {
    // ⟳ 2026-09-11 · LOT B — UNE SEULE MESURE POUR LES DEUX MOITIÉS. L'énergie
    // et la masse prête sortaient de deux appels; `measurePreparation` les rend
    // ensemble, sous la même règle d'eau que `standardPortionOf`,
    // `densityFromComposition` et `applySizing`. C'est ce qui garantit que
    // « mesurer l'assiette » et « mesurer les composants appliqués » rendent le
    // même nombre — le critère de fin du lot.
    const m = measurePreparation(index, prep);
    out.set(
      prep.id,
      m.kcal !== null && m.readyG !== null && m.readyG > 0 ? m.kcal / m.readyG : null,
    );
  }
  return out;
}

/**
 * ⟳ 2026-09-11 · LOT B — LA PROTÉINE DE CHAQUE CASSEROLE, par gramme PRÊT.
 *
 * ⛔ ELLE EXISTE PARCE QU'UNE BOÎTE TIRE DES GRAMMES, PAS DES PARTS. La protéine
 * d'un contenant se calcule comme son énergie: `grammes tirés × la valeur au
 * gramme de la casserole`. Sans ce lecteur, la seule façon d'avoir la protéine
 * d'une boîte serait `uses.servings / servingsMade` — le prorata dont ce dépôt
 * a mesuré qu'il se trompe d'un facteur 5,9 (M07, 2026-09-05).
 *
 * `null` quand la casserole ne rend pas de protéine (une borne de groupe donne
 * une densité d'énergie, jamais des grammes de protéine).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potProteinPerGram(
  index: CompositionIndex,
  preparations: readonly EnergyPreparation[],
): ReadonlyMap<string, number | null> {
  const out = new Map<string, number | null>();
  for (const prep of preparations) {
    const m = measurePreparation(index, prep);
    out.set(
      prep.id,
      m.proteinG !== null && m.readyG !== null && m.readyG > 0 ? m.proteinG / m.readyG : null,
    );
  }
  return out;
}

/** Une boîte porte-t-elle la clé `preparationId` (v4) ? `undefined` partout = legacy. */
function boxesCarryPreparationIds(dish: MouthEnergyDish): boolean {
  return dish.boxes.some((box) => box.items.some((item) => item.preparationId !== undefined));
}

function boxGramsOf(box: MouthEnergyDish["boxes"][number]): number {
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
 * L'ÉNERGIE DE CHAQUE BOÎTE D'UN PLAT PAR SES ITEMS — ou `null` si le plat
 * n'a aucun item citant (legacy : l'appelant retombe sur le pliage).
 *
 * Rend une entrée PAR BOÎTE, dans l'ordre de `dish.boxes`.
 * PURE: no I/O, no clock, no randomness.
 */
export function boxKcalByItems(
  index: CompositionIndex,
  dish: MouthEnergyDish,
  densities: ReadonlyMap<string, number | null>,
): Array<{ kcal: number | null; gap: MouthEnergyGap | null }> | null {
  return boxNutritionByItems(index, dish, densities, null);
}

/**
 * ⟳ 2026-09-11 · LOT B — LA MÊME PASSE REND AUSSI LA PROTÉINE.
 *
 * ⛔ UNE SEULE ARITHMÉTIQUE DU PRORATA, PAS DEUX. La protéine d'un contenant se
 * calcule exactement comme son énergie: `grammes tirés × la valeur au gramme de
 * la casserole`, plus la part de frais au prorata des grammes frais. En écrire
 * une seconde version ailleurs la ferait diverger de celle-ci au premier
 * ajustement — c'est la raison d'être de ce fichier depuis sa première ligne.
 *
 * `proteins` à `null` = l'appelant ne demande pas la protéine; le champ sort
 * alors `null` sans qu'aucun référentiel ne soit interrogé pour rien.
 */
export function boxNutritionByItems(
  index: CompositionIndex,
  dish: MouthEnergyDish,
  densities: ReadonlyMap<string, number | null>,
  proteins: ReadonlyMap<string, number | null> | null,
): Array<{ kcal: number | null; proteinG: number | null; gap: MouthEnergyGap | null }> | null {
  if (dish.boxes.length === 0 || !boxesCarryPreparationIds(dish)) return null;
  const totalGrams = dish.boxes.reduce((n, b) => n + boxGramsOf(b), 0);
  const freshGrams = dish.boxes.map((box) =>
    box.items.reduce((n, item) => {
      const g = Number(item.grams);
      return item.preparationId === null && Number.isFinite(g) && g > 0 ? n + g : n;
    }, 0)
  );
  const freshTotal = freshGrams.reduce((a, b) => a + b, 0);
  // Le frais du plat : ses ingrédients PROPRES, jamais ceux des casseroles.
  //
  // ⟳ 2026-09-06 — LA TOLÉRANCE SE JUGE SUR LA BOÎTE, PAS SUR LE FRAIS SEUL.
  // `dishEnergy` refuse un plat dont les termes non résolus pèsent plus de 5 %
  // de son énergie. Jugée sur le frais seul (une vinaigrette, « poulet » sans
  // pièce, 60 g de galette), la borne mordait sur des boîtes dont la casserole
  // faisait 90 % de l'énergie : 188–342 g/jour rendus illisibles sur les tirs
  // du 06/09, alors que le pliage d'hier les diluait dans la casserole. On lit
  // donc le frais à tolérance pleine (borné par les bandes de groupe), et la
  // règle des 5 % s'applique à `casserole + frais` de CHAQUE boîte — même
  // seuil, même bande, dénominateur juste. Un frais sans borne ni quantité
  // reste illisible, comme avant.
  // ⟳ 2026-09-11 · LOT B — LE FRAIS PASSE PAR `measureFresh`, le même lecteur
  // que `measurePlate`. Les deux appliquaient déjà la même règle; une seule
  // écriture supprime la possibilité qu'elles divergent au premier ajustement.
  const own = dish.ingredients.length > 0 ? measureFresh(index, dish) : null;
  return dish.boxes.map((box, i) => {
    const grams = boxGramsOf(box);
    if (grams <= 0 || totalGrams <= 0) {
      return { kcal: null, proteinG: null, gap: "empty_box" as const };
    }
    let kcal = 0;
    // ⚠️ `null` DÈS QU'UNE CASSEROLE NE REND PAS SA PROTÉINE, et l'énergie
    // continue sans elle. Une borne de groupe donne une densité d'énergie,
    // jamais des grammes de protéine: compter la casserole à zéro rendrait une
    // somme amputée qui a l'air d'un résultat.
    let protein: number | null = proteins === null ? null : 0;
    for (const item of box.items) {
      const g = Number(item.grams);
      if (!Number.isFinite(g) || g <= 0) continue;
      if (typeof item.preparationId !== "string") continue;
      const density = densities.get(item.preparationId);
      if (density === null || density === undefined) {
        return { kcal: null, proteinG: null, gap: "dish_incomplete" as const };
      }
      kcal += g * density;
      if (protein !== null) {
        const perG = proteins?.get(item.preparationId);
        if (perG === null || perG === undefined) protein = null;
        else protein += g * perG;
      }
    }
    if (own !== null) {
      if (!own.complete || own.kcal === null) {
        return { kcal: null, proteinG: null, gap: "dish_incomplete" as const };
      }
      const share = freshTotal > 0 ? freshGrams[i] / freshTotal : grams / totalGrams;
      const ownShare = own.kcal * share;
      const boundedShare = (own.boundedKcal ?? 0) * share;
      if (boundedShare > UNRESOLVED_ENERGY_TOLERANCE * (kcal + ownShare)) {
        return { kcal: null, proteinG: null, gap: "dish_incomplete" as const };
      }
      kcal += ownShare;
      if (protein !== null) {
        if (own.proteinG === null) protein = null;
        else protein += own.proteinG * share;
      }
    }
    return {
      kcal,
      proteinG: protein === null ? null : Math.round(protein * 10) / 10,
      gap: null,
    };
  });
}

/** Les tranches par bouche à partir d'une énergie PAR BOÎTE (même forme que `dishSlices`). */
function slicesFromBoxKcal(
  dish: MouthEnergyDish,
  perBox: ReadonlyArray<{ kcal: number | null; gap: MouthEnergyGap | null }>,
): MouthSlice[] {
  const out: MouthSlice[] = [];
  for (const [i, box] of dish.boxes.entries()) {
    if (box.memberIds.length !== 1) {
      for (const memberId of box.memberIds) out.push({ memberId, kcal: null, gap: "common_pot" });
      continue;
    }
    out.push({ memberId: box.memberIds[0], kcal: perBox[i].kcal, gap: perBox[i].gap });
  }
  return out;
}

/**
 * LE COMPTEUR DU LOT 0 : ce que les boîtes TIRENT des casseroles, contre ce que
 * le pliage par `uses.servings` leur ATTRIBUE — en grammes prêts, par plan.
 *
 * `ratio` = tiré / attribué ; `null` quand l'un des deux est nul. Sur M07 il
 * valait 5,9 ; sur M05 1,1. C'est ce nombre qui dit si `uses.servings` ment,
 * et de combien — avant de décider s'il faut le dériver des boîtes.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potAttributionGap(args: {
  index: CompositionIndex;
  dishes: readonly MouthEnergyDish[];
  preparations: readonly EnergyPreparation[];
}): { drawnGrams: number; attributedGrams: number; ratio: number | null; potsUnreadable: number } {
  const ready = new Map<string, { grams: number | null; servingsMade: number }>();
  let potsUnreadable = 0;
  for (const prep of args.preparations) {
    const g = readyGramsOfUnit(args.index, prep.ingredients);
    if (g === null) potsUnreadable++;
    ready.set(prep.id, { grams: g, servingsMade: Math.max(1, Number(prep.servingsMade) || 1) });
  }
  let drawn = 0;
  let attributed = 0;
  for (const dish of args.dishes) {
    for (const box of dish.boxes) {
      for (const item of box.items) {
        const g = Number(item.grams);
        if (typeof item.preparationId === "string" && Number.isFinite(g) && g > 0) drawn += g;
      }
    }
    for (const use of dish.uses) {
      const pot = ready.get(use.preparationId);
      if (!pot || pot.grams === null) continue;
      attributed += pot.grams * ((Number(use.servings) || 1) / pot.servingsMade);
    }
  }
  return {
    drawnGrams: Math.round(drawn),
    attributedGrams: Math.round(attributed),
    ratio: drawn > 0 && attributed > 0 ? Math.round((drawn / attributed) * 100) / 100 : null,
    potsUnreadable,
  };
}

export interface BoxEnergy {
  boxId: string;
  day: string | null;
  slot: string | null;
  memberIds: readonly string[];
  /** La somme de ses composants, ou son total v2 replié. */
  grams: number;
  /** `null` quand le plat n'est pas lisible, ou quand le contenant ne pèse rien. */
  kcal: number | null;
  /** Le motif NOMMÉ du silence. `null` = un chiffre est sorti. */
  gap: MouthEnergyGap | null;
}

/**
 * ⟳ 2026-09-11 · LOT B — CE QUE LE CONTENANT PORTE **AUSSI** EN PROTÉINE.
 *
 * ⛔ UN TYPE À PART, ET PAS UN CHAMP DE PLUS SUR `BoxEnergy`. `box_energy_
 * decision.ts` et son test construisent des `BoxEnergy` littéraux; ajouter un
 * champ obligatoire là-bas casserait un fichier qui n'a rien à voir avec la
 * protéine. `BoxNutrition` ÉTEND `BoxEnergy`, donc `boxEnergies` reste
 * exactement ce qu'elle était pour ses cinq appelants.
 */
export interface BoxNutrition extends BoxEnergy {
  /** `null` quand la protéine n'est pas mesurable — jamais zéro. */
  proteinG: number | null;
}

/**
 * L'ÉNERGIE DE CHAQUE CONTENANT DU PLAN — LE RÉCIPIENT, JAMAIS L'ASSIETTE.
 *
 * ── ⛔ CE QU'ELLE EST, ET CE QU'ELLE N'EST PAS ────────────────────────────
 * Elle rend UN nombre par contenant, quel que soit le nombre de noms sur son
 * couvercle. Sur un bac, ce nombre est ce que le RÉCIPIENT contient — jamais une
 * part par personne, et il ne se divise pas par le nombre de mangeurs. C'est la
 * v4 mot pour mot: « les grammes d'un bac disent combien il en va DANS le bac
 * pour tous ensemble; ce nombre ne vise personne ».
 *
 * ⚠️ ELLE NE REMPLACE PAS `dishSlices`, ET LES DEUX RESTENT VRAIES ENSEMBLE.
 * `dishSlices` répond « combien cette BOUCHE a-t-elle mangé » et se tait sur un
 * bac (`common_pot`), pour toujours. `boxEnergies` répond « combien y a-t-il
 * dans ce RÉCIPIENT » — une question qui a une réponse même quand la première
 * n'en a pas. Elles ne se contredisent pas: elles ne portent pas sur le même
 * objet.
 *
 * ⚠️ LE PRORATA EST CELUI DE `dishSlices`, RÉÉCRIT NULLE PART. Même `gramsOf`,
 * même dénominateur (le plat entier), même pliage des préparations. Deux
 * arithmétiques du même partage divergeraient au premier ajustement.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * Un plat dont les contenants portent leur `id` — ce que l'écran a besoin de
 * relier. ⟳ LOT 0 : un type nommé plutôt qu'une intersection de tableaux, qui
 * perdait la face `{ id }` à l'itération et refusait `preparationId` aux items.
 */
export interface BoxedMouthEnergyDish extends MouthEnergyDish {
  boxes: readonly {
    id: string;
    memberIds: readonly string[];
    items: readonly { grams: number; preparationId?: string | null }[];
    legacyTotalGrams: number | null;
  }[];
}

export function boxEnergies(args: {
  index: CompositionIndex;
  dishes: readonly BoxedMouthEnergyDish[];
  preparations: readonly EnergyPreparation[];
}): BoxEnergy[] {
  return boxNutrition(args);
}

/**
 * ⟳ 2026-09-11 · LOT B — LA MESURE DU CONTENANT ÉCRIT: grammes, kcal, protéine.
 *
 * ⛔ C'EST LE LECTEUR DE LA **MESURE FINALE** du chantier: « calories, protéines
 * et grammes des items effectivement enregistrés dans chaque portion ».
 * `boxEnergies` n'en est que la projection sans protéine — une seule passe,
 * deux vues, aucune chance de divergence.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function boxNutrition(args: {
  index: CompositionIndex;
  dishes: readonly BoxedMouthEnergyDish[];
  preparations: readonly EnergyPreparation[];
}): BoxNutrition[] {
  const folded = foldPreparationsIntoDishes({
    dishes: args.dishes.map((d) => ({
      slot: d.slot,
      method: d.method,
      ingredients: d.ingredients,
      uses: d.uses,
    })),
    preparations: args.preparations,
  });
  const out: BoxNutrition[] = [];
  const densities = potDensities(args.index, args.preparations);
  const proteins = potProteinPerGram(args.index, args.preparations);
  for (const [i, dish] of args.dishes.entries()) {
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
    let total = 0;
    for (const box of dish.boxes) total += gramsOf(box);
    const energy = dishEnergy(args.index, {
      method: dish.method,
      ingredients: folded[i].ingredients,
    });
    // ⟳ LOT 0 — par items quand la boîte cite ses casseroles, pliage sinon.
    const byItems = boxNutritionByItems(args.index, dish, densities, proteins);
    for (const [j, box] of dish.boxes.entries()) {
      const grams = gramsOf(box);
      const common = {
        boxId: box.id,
        day: dish.day,
        slot: dish.slot,
        memberIds: box.memberIds,
        grams,
      };
      if (total <= 0 || grams <= 0) {
        out.push({ ...common, kcal: null, proteinG: null, gap: "empty_box" as const });
        continue;
      }
      if (byItems !== null) {
        out.push({
          ...common,
          kcal: byItems[j].kcal,
          proteinG: byItems[j].proteinG,
          gap: byItems[j].gap,
        });
        continue;
      }
      if (!energy.complete || energy.kcal === null) {
        out.push({ ...common, kcal: null, proteinG: null, gap: "dish_incomplete" as const });
        continue;
      }
      // ⚠️ LE CHEMIN LEGACY (aucun item ne cite sa casserole) GARDE SON PRORATA
      // DE GRAMMES, protéine comprise: une seconde règle ici ferait lire deux
      // valeurs différentes du même contenant selon son âge.
      const foldedProtein = proteinOfUnit(args.index, dish.method, folded[i].ingredients);
      out.push({
        ...common,
        kcal: energy.kcal * (grams / total),
        proteinG: foldedProtein === null
          ? null
          : Math.round(foldedProtein * (grams / total) * 10) / 10,
        gap: null,
      });
    }
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
  const densities = potDensities(args.index, args.preparations);
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
        ownSlots: [],
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
    // ⟳ LOT 0 — par items quand la boîte cite ses casseroles, pliage sinon.
    const byItems = boxKcalByItems(args.index, dish, densities);
    const slices = byItems !== null ? slicesFromBoxKcal(dish, byItems) : dishSlices(energy, dish);
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
        // ⚠️ UN MOMENT « À ELLE », ET C'EST LA MÊME CONDITION QUE LES GRAMMES —
        // un seul nom sur le couvercle. Elle est ici, dans la boucle qui
        // distingue déjà ce cas, plutôt qu'ailleurs: deux lectures de « ce
        // contenant est-il sa portion » finiraient par diverger, et c'est le
        // dénominateur d'un ancrage qui se tromperait.
        if (dish.slot !== null && !row.ownSlots.includes(dish.slot)) {
          row.ownSlots.push(dish.slot);
          row.ownSlots.sort();
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
