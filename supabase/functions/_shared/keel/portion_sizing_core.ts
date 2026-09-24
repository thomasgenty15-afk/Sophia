// ═══════════════════════════════════════════════════════════════════════════
// LA PART D'UNE PERSONNE — LA GARDE, LA PART STANDARD, LE DIMENSIONNEMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `portion_sizing.ts` (découpage des gros
// fichiers, lot 2e). Aucune logique changée. `portion_sizing.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// Ce module n'importe jamais `portion_sizing.ts`.
//
// Ce qui est ici : ① la garde (`sizingPathFor`), ② la part standard d'un
// plat (`standardPortionOf`), ④ le dimensionnement (`sizeDishForMouth`,
// `sizeDishForEaters`, `lidPlanFor`), ⑤ les compteurs. `potFactorOf`, qui
// était au début de ⑥, est en fin de fichier : `potFactorAcross` (④ bis)
// l'appelle, et l'application l'importe d'ici.

import type { CompositionIndex } from "./food_composition.ts";
// ⟳ 2026-09-11 · LOT B — LA MESURE D'UNE ASSIETTE VIT DANS `preparation_mass.ts`
// et elle décide de l'eau PAR UNITÉ DE CUISSON. Voir `standardPortionOf`.
import { measurePlate, POT_MISSING_PREPARATION_GAP } from "./preparation_mass.ts";
import type { PlateBounds } from "./portion_plate_bounds.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA GARDE — QUEL CHEMIN, ET POURQUOI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * COMBIEN DE BOUCHES CE CHEMIN SAIT DIMENSIONNER.
 *
 * ⛔ UNE. Ce n'est pas une timidité, c'est ce qui est éprouvé: la méthode est
 * écrite, calibrée et mesurée sur un foyer d'une personne. À plusieurs bouches,
 * une casserole est tirée par des parts DIFFÉRENTES et la somme n'est pas
 * écrite ici — `applySizing` (lot 4) prend déjà des lignes par (plat, bouche),
 * mais rien ne l'a mesuré.
 *
 * ⚠️ C'EST AUSSI LE BOUTON DE RETOUR ARRIÈRE. `0` désarme le chemin neuf
 * entièrement: tout retombe sur `legacy_measure`, sans toucher une ligne de
 * câblage. Un lot sans marche arrière d'un caractère est un lot qu'on ne peut
 * pas retirer un vendredi soir.
 */
// ══════════════════════════════════════════════════════════════════════════
// ⟳ BASCULE (2026-09-08) — LA TABLE ENTIÈRE PASSE SUR LE CHEMIN NEUF
// ══════════════════════════════════════════════════════════════════════════
//
// La borne valait `1` depuis le premier lot: le moteur dimensionnait une bouche
// seule, et toute table retombait sur le chemin où le MODÈLE écrit les grammes.
// Elle passe au plafond de la lane, mesuré sur deux foyers réels le 2026-09-08:
//
//                                  seuil    `quatre`     `cinq`
//   journée à ±5 % de la cible     ≥ 90 %   4/4 = 100 %  5/5 = 100 %
//   assiettes dans les bornes      ≥ 80 %   12/12 = 100% 12/15 = 80 %
//   bac à un seul nom                   0   0            0
//   mangeur non dimensionné             0   0            0
//
// ⚠️ ET C'EST LA RÉPARATION QUI A FAIT LA DIFFÉRENCE, pas la chance du jour.
// Le compteur `repair_effect` porte l'avant et l'après du MÊME plan:
//   `quatre` — 11 assiettes dans les bornes avant, 12 après;
//   `cinq`   —  6 avant, 12 après, sur quinze.
// Sans lui, « douze sur douze » n'aurait pas été distinguable d'un bon tirage.
//
// ⛔ LE RETOUR ARRIÈRE EST CETTE LIGNE, ET RIEN D'AUTRE. La remettre à `1`
// referme tout — prompt v34, couvercles autorés, réparation par mangeur — et
// rend à toute la population le chemin d'avant, en un commit. Le chemin legacy
// n'a pas été retiré: il est PRÉCÉDÉ, jamais remplacé.
// ⚠️ LE NOMBRE, ET PAS `HOUSEHOLD_MAX_MOUTHS`: celui-là est déclaré plus bas
// dans ce fichier, et une constante ne peut pas se lire avant sa ligne. Le lien
// entre les deux est tenu par une épreuve, pas par une référence.
export const PORTION_SIZING_MAX_MOUTHS = 12;

export type SizingPath = "portion_v1" | "legacy_measure";

export const SIZING_PATH_REASONS = [
  "one_mouth",
  "several_mouths",
  "no_mouth",
  "merge_requested",
  "unmerge_requested",
  "composition_unavailable",
] as const;
export type SizingPathReason = (typeof SIZING_PATH_REASONS)[number];

/**
 * LE VERDICT EST CALCULÉ UNE FOIS, ET TOUT LE MONDE LE LIT.
 *
 * ⛔ AUCUN DRAPEAU DE REQUÊTE, AUCUNE VARIABLE D'ENVIRONNEMENT. Le chemin se
 * DÉRIVE de l'état du foyer. Un drapeau que l'appelant passe est un drapeau
 * qu'un appelant oublie, et on se retrouverait avec un prompt qui promet une
 * recette standard pendant qu'un moteur attend des boîtes — les deux moitiés
 * d'un même lot, désaccordées, en production.
 *
 * ⚠️ LA COMPOSITION EST UNE CONDITION, PAS UN CONFORT. Sans index de
 * composition il n'y a ni kcal ni masse cuite: on ne peut RIEN dimensionner, et
 * prétendre le contraire rendrait un facteur 1 déguisé en mesure.
 *
 * ⚠️ FUSION ET DÉFUSION FERMENT LE CHEMIN. Elles recomposent les assiettes
 * entre bouches; le dimensionnement par personne n'y a pas encore de sens
 * défini, et deviner en aurait un très visible dans l'assiette de quelqu'un.
 */
export function sizingPathFor(args: {
  platedMouths: number;
  merge: boolean;
  unmerge: boolean;
  compositionLoaded: boolean;
}): { path: SizingPath; reason: SizingPathReason } {
  if (!args.compositionLoaded) {
    return { path: "legacy_measure", reason: "composition_unavailable" };
  }
  if (args.merge) return { path: "legacy_measure", reason: "merge_requested" };
  if (args.unmerge) {
    return { path: "legacy_measure", reason: "unmerge_requested" };
  }
  if (args.platedMouths <= 0) {
    return { path: "legacy_measure", reason: "no_mouth" };
  }
  if (args.platedMouths > PORTION_SIZING_MAX_MOUTHS) {
    return { path: "legacy_measure", reason: "several_mouths" };
  }
  return { path: "portion_v1", reason: "one_mouth" };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PART STANDARD D'UN PLAT
// ═══════════════════════════════════════════════════════════════════════════

/** Ce qu'un plat sert à UNE personne, avant toute multiplication. */
export interface StandardPortion {
  /** `null` quand `dishEnergy` s'abstient — jamais une somme amputée. */
  kcal: number | null;
  /** La masse SERVIE, en grammes. `null` si aucune ligne ne se pèse. */
  cookedG: number | null;
  /** kcal pour 100 g servis. `null` dès que l'un des deux manque. */
  densityPer100G: number | null;
  /**
   * ⟳ 2026-09-11 · LOT B — LA PROTÉINE DE CETTE PART, CASSEROLES PLIÉES.
   *
   * ⛔ ELLE EST MESURÉE AU PRORATA RÉELLEMENT SERVI DE CHAQUE CASSEROLE, jamais
   * sur le frais du plat seul. C'est la cicatrice
   * `preparations-must-be-folded-into-dishes`: sans le pliage, **51 % de la
   * protéine sort du verdict** — 111/32/26 g par jour mesurés sans lui,
   * 167/133/126 g avec.
   *
   * ⚠️ AUCUN SECOND BARÈME N'EST INVENTÉ ICI. Les planchers restent ceux de
   * `meal_envelope.ts` (`PROTEIN_FLOOR_G_PER_KG`, `proteinFloorG`); ce champ ne
   * fait que dire ce que la part CONTIENT, pour que la garde ait quelque chose
   * à comparer.
   *
   * `null` quand l'énergie se tait, et aussi quand un terme inconnu n'a été
   * admis que par sa borne de groupe: une borne donne une densité d'énergie,
   * jamais des grammes de protéine.
   */
  proteinG: number | null;
  /** Les casseroles tirées, et par combien de plats chacune est tirée. */
  pots: readonly { id: string; draws: number }[];
  /** Ce qui manque, quand `kcal` est nul. */
  gaps: readonly string[];
}

interface PortionIngredient {
  term: string;
  quantity?: string | null;
  amount?: number | null;
  unit?: string | null;
  state?: string | null;
  /**
   * ⟳ LOT A (2026-09-11) — L'IDENTIFIANT DE LA LIGNE, jusqu'à la part standard.
   *
   * `standardPortionOf` passe ces lignes à `measurePlate`, donc à
   * `resolveIngredients`. Sans ces deux champs, la part standard d'une assiette
   * se calculait sur le libellé pendant que `grams_raw` avait été pesé sur
   * l'identifiant — deux masses pour le même plat.
   */
  ref?: string | null;
  refRefused?: boolean;
}

/**
 * LA PART STANDARD = LE FRAIS DU PLAT + LA RECETTE DE CHAQUE CASSEROLE DIVISÉE
 * PAR LE NOMBRE DE PLATS QUI LA TIRENT.
 *
 * ⛔ PAS `servings_made`, ET C'EST MESURÉ. Le modèle écrit `servings: 1` sur des
 * pots que quinze plats tirent; s'en servir attribuerait la casserole entière à
 * chaque assiette. Le nombre de TIRAGES est une propriété du plan, observable,
 * et personne ne peut se tromper en la comptant.
 *
 * ⟳ 2026-09-11 · LOT B — LE BIAIS DE LA PINCÉE EST CORRIGÉ. Cette fonction
 * comptait ENTIÈRE, dans chaque part, toute ligne de casserole sans `amount`
 * (une pincée de sel, un brin de persil, pesés par `condimentMassFor`). Trois
 * parts de la casserole de couscous de GAIN `a18f522e` réclamaient ainsi
 * 997,5 g d'un pot qui en produit 986,5. La part est désormais `masse prête de
 * la casserole ÷ tirages` — la MÊME division que `applySizing` écrit dans la
 * boîte. Voir `shareOf` (`preparation_mass.ts`).
 */
/**
 * LE TROU D'UNE CASSEROLE CITÉE MAIS ABSENTE DU PLAN.
 *
 * ⚠️ NOMMÉ, ET ÉPINGLÉ, parce que c'est le seul trou qu'une RÉPARATION peut
 * créer: la fusion renomme les casseroles réécrites, et un plat non repris cite
 * encore l'ancien identifiant. Le lire dans `unmeasurable_by` est ce qui
 * distingue « le référentiel ne connaît pas cet aliment » de « la fusion a
 * cassé le plan ».
 */
/**
 * ⟳ 2026-09-11 · LOT B — LE JETON EST DÉCLARÉ UNE FOIS, DANS `preparation_mass.ts`,
 * et réexporté ici sous son nom historique. Le journal de la lane
 * (`unmeasurable_by`) le compte depuis le 2026-09-08; deux littéraux `"missing_
 * preparation"` dans deux fichiers auraient fini par diverger d'une lettre, et
 * c'est le compteur qu'on regarde le moins qui aurait gardé l'ancien.
 */
export const MISSING_PREPARATION_GAP = POT_MISSING_PREPARATION_GAP;

/**
 * LE TROU QU'ON N'A PAS SU NOMMER.
 *
 * ⛔ IL NE DOIT JAMAIS ÊTRE FRÉQUENT. Sa présence dans un journal dit que
 * `dishEnergy` a rendu `complete: false` sans dire de quoi il manquait — un
 * défaut de l'instrument, pas du plan. On préfère un nom laid à un compteur
 * vide: `unmeasurable_by: {}` sur huit assiettes s'est déjà lu comme « rien à
 * signaler ».
 */
export const UNNAMED_ENERGY_GAP = "energy_incomplete_unnamed";
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 · LOT B — PLUS D'APLATISSEMENT AVANT LA DÉCISION SUR L'EAU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CETTE FONCTION FAISAIT, ET CE QUE ÇA COÛTAIT. Elle empilait le frais
 * du plat et les ingrédients de TOUTES les casseroles dans une seule liste
 * `parts`, puis appelait `weighedReadyGrams(parts)` **une fois**. Or ce lecteur
 * décide de l'eau sur la liste qu'il reçoit: un couscous (`grain_absorbs`) dans
 * l'assiette effaçait l'eau de la casserole de lentilles, qui n'absorbe rien.
 *
 * Mesuré sur GAIN `a18f522e`, samedi déjeuner, après deuxième réparation:
 * 20 + 548,5 + 332,5 = **901 g** par composants, **811 g** aplati. Le moteur
 * dimensionnait sur 811, annonçait 657, et `applySizing` — qui mesure chaque
 * casserole SÉPARÉMENT — écrivait 727. Le même moteur, deux masses, le même
 * assemblage.
 *
 * La mesure vit désormais dans `preparation_mass.ts` (`measurePlate`), et cette
 * fonction n'est plus que l'adaptateur qui la met à la forme que la lane lit.
 * Les trois cicatrices de l'ancienne version sont conservées et TESTÉES:
 * `drawsByPreparation` (jamais `servings_made`), `MISSING_PREPARATION_GAP`,
 * `UNNAMED_ENERGY_GAP`.
 */
export function standardPortionOf(args: {
  index: CompositionIndex;
  dish: { method?: string | null; ingredients?: readonly PortionIngredient[] };
  /**
   * ⚠️ `preparationId`, EN CAMELCASE. C'est la forme PARSÉE (`GeneratedDish`),
   * pas celle du JSON du modèle (`preparation_id`). Les deux existent dans ce
   * dépôt et se ressemblent assez pour qu'un lecteur lise systématiquement des
   * casseroles vides — chaque plat vaudrait alors son seul frais.
   */
  uses: readonly { preparationId?: string | null }[];
  preparations: readonly {
    id: string;
    /**
     * ⟳ 2026-09-11 · LOT B — LA MÉTHODE DE LA CASSEROLE, quand l'appelant la
     * porte. Elle ne sert qu'à une chose: l'imputation d'huile de friture
     * (`isFriedMethod`, 12 % du poids cuit). Avant ce lot, la liste aplatie
     * faisait porter la méthode du PLAT à toutes les casseroles; désormais
     * chaque unité de cuisson répond de la sienne — comme `potDensities` le
     * fait déjà de son côté. Les deux appelants de production passent
     * `meal.preparations`, qui porte `method`.
     */
    method?: string | null;
    ingredients?: readonly PortionIngredient[];
  }[];
  drawsByPrep: ReadonlyMap<string, number>;
}): StandardPortion {
  const m = measurePlate({
    index: args.index,
    dish: args.dish,
    uses: args.uses,
    preparations: args.preparations,
    drawsByPrep: args.drawsByPrep,
  });
  // ⚠️ LE VOCABULAIRE DES TROUS NE CHANGE PAS. `unmeasurable_by` compte ces
  // jetons depuis des mois dans le journal de la lane; `measurePlate` rend
  // déjà ceux de `plan_energy.ts` (`unknown_ingredient`, `missing_quantity`,
  // `no_ingredients`) plus `missing_preparation`. On ne renomme rien ici.
  const named = m.gaps.map((g) => String(g));
  // ⛔ « IMMESURABLE SANS RAISON » NE DOIT PAS EXISTER. Mesuré au tir `IDENTITE`
  // du 2026-09-08: huit assiettes `unmeasurable` et `unmeasurable_by: {}` — le
  // compteur qui sert précisément à dire POURQUOI était vide, et rien ne le
  // signalait. Un trou sans nom se relit comme un trou qu'on n'a pas cherché.
  if (m.kcal === null && named.length === 0) named.push(UNNAMED_ENERGY_GAP);
  const cooked = m.readyG;
  return {
    kcal: m.kcal,
    cookedG: cooked === null ? null : Math.round(cooked),
    densityPer100G: m.kcal !== null && cooked !== null && cooked > 0
      ? Math.round((m.kcal / cooked) * 1000) / 10
      : null,
    proteinG: m.proteinG,
    pots: m.pots.map((p) => ({ id: p.id, draws: p.draws })),
    gaps: named,
  };
}

/**
 * COMBIEN DE PLATS TIRENT SUR CHAQUE CASSEROLE.
 *
 * Séparé de `standardPortionOf` parce que le compte se fait sur le plan ENTIER
 * et se lit ensuite plat par plat. Le calculer dans la boucle rendrait 1 partout.
 */
export function drawsByPreparation(
  dishes: readonly { uses?: readonly { preparationId?: string | null }[] }[],
): Map<string, number> {
  const draws = new Map<string, number>();
  for (const d of dishes) {
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (id) draws.set(id, (draws.get(id) ?? 0) + 1);
    }
  }
  return draws;
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE DIMENSIONNEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE FACTEUR D'UN PLAT QU'ON NE SAIT PAS MESURER.
 *
 * ⛔ `1`, C'EST-À-DIRE « LA RECETTE TELLE QUELLE ». Pas zéro (qui retirerait le
 * plat), pas une moyenne (qui inventerait une mesure). Un plat dont on ignore
 * l'énergie est servi tel que le modèle l'a écrit, et c'est COMPTÉ.
 */
export const UNMEASURABLE_PORTION_FACTOR = 1;

/**
 * LA TOLÉRANCE AU-DESSOUS DE LAQUELLE UNE LIGNE DE COURSES NE SE RÉÉCRIT PAS.
 *
 * ⚠️ ELLE EXISTAIT DÉJÀ EN DUR (`Math.abs(f - 1) <= 0.02`) dans le bloc des
 * courses; elle est nommée ici parce que le lot 4 la fait mordre sur une
 * population NEUVE — jusqu'ici seule une casserole qui grossit ou rétrécit
 * touchait la liste, maintenant chaque plan `portion_v1` la traverse.
 *
 * ⛔ 2 % SUR UNE LIGNE DE COURSES, PAS SUR UNE ASSIETTE. Réécrire « 1 kg de riz »
 * en « 1,01 kg » est du bruit qu'un humain lit comme une erreur; l'écart réel
 * qu'on veut suivre est celui d'un plan multiplié par 0,8 ou 1,6.
 */
export const SHOPPING_RESCALE_TOLERANCE = 0.02;

/**
 * ⟳ LU AU LOT 6. Sous plancher TCA (`restriction: "raised"`), la cible du jour
 * devient l'ENTRETIEN au lieu de se fermer. Le dimensionnement d'une assiette
 * n'est pas un conseil de perte de poids: refuser de dimensionner ne protège
 * personne, ça sert juste une assiette au hasard. La constante existe dès
 * maintenant pour que le lot 6 soit un branchement, pas une décision.
 */
export const RESTRICTION_FLOOR_SIZES_MAINTENANCE = true;

export const SIZING_VERDICTS = [
  "in_bounds",
  "over_max",
  "under_min",
  "unmeasurable",
] as const;
export type SizingVerdict = (typeof SIZING_VERDICTS)[number];

export interface SizedDish {
  factor: number;
  /** La masse servie à cette personne, après facteur. `null` si non mesurable. */
  personCookedG: number | null;
  verdict: SizingVerdict;
  /** Les kcal que la borne empêche de servir. `0` quand elle ne mord pas. */
  unmetKcal: number;
}

/**
 * facteur = cible du moment ÷ kcal de la part standard.
 *
 * ⛔ AUCUNE BORNE N'EST APPLIQUÉE ICI. `sizeDishForMouth` rend le facteur NU et
 * le verdict; `clampToBounds` raboté est un geste séparé et compté. Les fondre
 * rendrait impossible de savoir combien de fois la borne a mordu — et « la
 * borne mord toujours » est indistinguable de « la borne ne mord jamais » si
 * personne ne compte.
 */
export function sizeDishForMouth(args: {
  standard: StandardPortion;
  targetKcal: number | null;
  bounds: PlateBounds;
}): SizedDish {
  const { standard, targetKcal, bounds } = args;
  if (
    standard.kcal === null || !(standard.kcal > 0) ||
    targetKcal === null || !(targetKcal > 0)
  ) {
    return {
      factor: UNMEASURABLE_PORTION_FACTOR,
      personCookedG: standard.cookedG,
      verdict: "unmeasurable",
      unmetKcal: 0,
    };
  }
  const factor = targetKcal / standard.kcal;
  const cooked = standard.cookedG === null ? null : standard.cookedG * factor;
  let verdict: SizingVerdict = "in_bounds";
  if (cooked !== null) {
    if (cooked > bounds.max) verdict = "over_max";
    else if (cooked < bounds.min) verdict = "under_min";
  }
  return {
    factor,
    personCookedG: cooked === null ? null : Math.round(cooked),
    verdict,
    unmetKcal: 0,
  };
}

/**
 * LA BORNE, APPLIQUÉE — et ce qu'elle coûte, en kcal, dit à voix haute.
 *
 * ⚠️ `unmetKcal` EST LE PRIX DE LA BORNE, et il n'est jamais nul quand elle
 * mord. Une assiette rabotée à 700 g pour quelqu'un qui avait besoin de 900 g
 * de nourriture est une décision: elle ne le nourrit pas. Ce dépôt a déjà payé
 * deux bornes silencieuses (`ANCHOR_FACTOR_MAX`, `BOX_FACTOR_MIN`).
 *
 * ⚠️ `under_min` MONTE le facteur, et c'est le sens le moins intuitif: une
 * assiette au-dessous du plancher n'est pas une assiette qu'on économise, c'est
 * une assiette qui ne ressemble pas à un repas. `unmetKcal` y est NÉGATIF —
 * on sert PLUS que la cible — et il est compté à part.
 */
export function clampToBounds(args: {
  sized: SizedDish;
  standard: StandardPortion;
  bounds: PlateBounds;
}): SizedDish {
  const { sized, standard, bounds } = args;
  if (sized.verdict === "in_bounds" || sized.verdict === "unmeasurable") {
    return sized;
  }
  if (standard.cookedG === null || !(standard.cookedG > 0)) return sized;
  const limit = sized.verdict === "over_max" ? bounds.max : bounds.min;
  const factor = limit / standard.cookedG;
  const lostKcal = standard.kcal === null
    ? 0
    : Math.round((sized.factor - factor) * standard.kcal);
  return {
    factor,
    personCookedG: limit,
    verdict: sized.verdict,
    unmetKcal: lostKcal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ bis — PLUSIEURS MANGEURS SUR LA MÊME RECETTE (lot 10)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ UNE RECETTE, N FACTEURS. C'est toute la différence entre le solo et la
// table, et il n'y en a pas d'autre: chaque mangeur d'un plat a SA cible de
// moment, donc SON facteur sur la MÊME part standard. Rien dans le calcul
// d'un facteur ne regarde les autres mangeurs.
//
// ⚠️ ET SURTOUT PAS UNE MOYENNE. Servir à quatre personnes la moyenne de leurs
// besoins, c'est le défaut que tout ce chantier existe pour retirer — la
// portion unique que le modèle écrivait, sous un autre nom.

/**
 * LE PLAFOND DE BOUCHES QUE CETTE LANE SERT — nommé, plus déduit.
 *
 * ⚠️ C'EST LE `Math.min(12, …)` DE `presence.servings`, et il vivait en
 * littéral à quatre endroits de la lane. Le nommer ici ne change aucun
 * comportement; il donne à la bascule du lot 14 une constante à bouger, et à
 * `sizingPathFor` une borne haute qui ne soit pas un nombre nu.
 */
export const HOUSEHOLD_MAX_MOUTHS = 12;

/**
 * LE DIMENSIONNEMENT TOURNE-T-IL EN OMBRE À PLUSIEURS BOUCHES ?
 *
 * ⛔ « EN OMBRE » VEUT DIRE: calculé, journalisé, JAMAIS POSÉ. Les grammes
 * servis restent ceux du modèle, `applied: false`, et le chemin de la lane
 * reste `legacy_measure`. C'est la seule façon de comparer ce que le moteur
 * ferait à ce que le modèle fait, sur les MÊMES plans, sans variance de modèle
 * entre les deux — la leçon « journaliser le contrefactuel, pas deux runs ».
 *
 * ⚠️ À `false`, tout le bloc s'éteint et la lane redevient octet pour octet
 * celle d'avant le lot. C'est le retour arrière du lot 10, et il tient en une
 * constante.
 */
export const SHADOW_SIZING_AT_N = true;

/** Ce qu'un mangeur apporte à la table de calcul d'un plat. */
export interface EaterAtDish {
  memberId: string;
  /**
   * LE SEAU DU JOURNAL — jamais un `member_id` à côté d'un kcal.
   * `adult_fat_loss`, `minor_6_11`, `age_unknown`… L'appelant le nomme; ce
   * module ne fait que le recopier sur la ligne.
   */
  bucket: string;
  /** Sa cible pour CE moment, extras et apports fixes déjà retranchés. */
  targetKcal: number | null;
  bounds: PlateBounds;
}

export interface SizedForEater extends SizedDish {
  memberId: string;
  bucket: string;
}

/**
 * UNE RECETTE, UN FACTEUR PAR MANGEUR.
 *
 * ⛔ AUCUNE BORNE N'EST APPLIQUÉE ICI, exactement comme `sizeDishForMouth`
 * dont c'est la boucle: le facteur sort NU, le verdict l'accompagne, et
 * `clampToBounds` est un geste séparé et compté. Les fondre rendrait
 * impossible de savoir combien de fois la borne a mordu, et sur qui.
 *
 * ⚠️ UN MANGEUR SANS CIBLE NE BLOQUE PAS LA TABLE. Il reçoit
 * `UNMEASURABLE_PORTION_FACTOR` — la recette telle quelle — et il est compté.
 * Refuser de dimensionner tout le plat parce qu'une bouche n'a pas de corps
 * priverait les trois autres d'une portion juste, au nom de la quatrième.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sizeDishForEaters(args: {
  standard: StandardPortion;
  eaters: readonly EaterAtDish[];
}): SizedForEater[] {
  return args.eaters.map((e) => ({
    memberId: e.memberId,
    bucket: e.bucket,
    ...sizeDishForMouth({
      standard: args.standard,
      targetKcal: e.targetKcal,
      bounds: e.bounds,
    }),
  }));
}

/**
 * LE FACTEUR D'UNE CASSEROLE QUAND PLUSIEURS MANGEURS TIRENT SUR ELLE.
 *
 * ⛔ ON SOMME SUR LES MANGEURS D'UN PLAT, PUIS ON MOYENNE SUR LES PLATS. Les
 * deux opérations disent deux choses différentes et ne commutent pas:
 *
 *     un plat qui nourrit 4 bouches réclame la SOMME de leurs 4 parts;
 *     une casserole tirée par 3 plats a été écrite pour 3 tirages.
 *
 * D'où `Σ_plats (Σ_mangeurs f) ÷ nombre de tirages`, c'est-à-dire exactement
 * `potFactorOf` appliqué aux SOMMES PAR PLAT. Passer les facteurs à plat
 * moyennerait sur les (plat × mangeur) et diviserait la casserole par le
 * nombre de bouches — quatre personnes recevraient le quart de ce qu'il faut.
 *
 * ⚠️ LA CONTRE-ÉPREUVE: une bouche par plat rend `Σf / n`, qui est
 * `potFactorOf` mot pour mot. Le chemin solo ne bouge pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potFactorAcross(
  perDishEaterFactors: readonly (readonly number[])[],
): number {
  return potFactorOf(
    perDishEaterFactors.map((fs) => fs.reduce((a, b) => a + b, 0)),
  );
}

export const LID_KINDS = ["own", "tub"] as const;
export type LidKind = (typeof LID_KINDS)[number];

export interface LidPlan {
  /** Les couvercles à UN nom, et le facteur qui écrit leurs grammes. */
  own: { memberId: string; factor: number }[];
  /**
   * LE BAC PARTAGÉ, ou `null`. Son total est la SOMME des parts de ses
   * mangeurs — jamais une moyenne, jamais une division.
   */
  tub: { memberIds: string[]; factorSum: number } | null;
}

/**
 * QUI A UNE BOÎTE À SON NOM, ET QUI PARTAGE UN BAC.
 *
 * ⛔ LA RÈGLE PRODUIT EST INCHANGÉE, ET ELLE EST APPELÉE, PAS RECOPIÉE: un
 * objectif de poids ouvre une portion millimétrée (`weighedPortionMembers`,
 * `household_portions.ts`), rien d'autre ne la demande. Ce module reçoit
 * l'ensemble déjà résolu — le recalculer ici ferait deux lectures d'une même
 * décision produit.
 *
 * ⚠️ UN SEUL MANGEUR DANS LE BAC REÇOIT UNE BOÎTE À SON NOM, PAS UN BAC D'UN.
 * Deux raisons, et la seconde est mesurable: un contenant à un nom veut dire
 * « c'est ta portion » (v4), donc un bac d'un mentirait sur ses propres
 * grammes; et l'écran lit `memberIds.length > 1` pour dire « partagé », donc un
 * bac d'un s'afficherait comme un plat commun pour une personne seule.
 *
 * ⚠️ LES GRAMMES NE SONT PAS ÉCRITS ICI. Ce module rend des FACTEURS et des
 * noms; `applySizing` en fait des items. Séparer les deux est ce qui permet au
 * lot 10 de tourner en ombre sans toucher un plat.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function lidPlanFor(args: {
  rows: readonly SizedForEater[];
  /** Les bouches à qui un objectif de poids ouvre une boîte à elles. */
  weighed: ReadonlySet<string>;
}): LidPlan {
  const own: { memberId: string; factor: number }[] = [];
  const shared: SizedForEater[] = [];
  for (const r of args.rows) {
    if (args.weighed.has(r.memberId)) {
      own.push({ memberId: r.memberId, factor: r.factor });
    } else shared.push(r);
  }
  // ⛔ VOIR LE PAVÉ: un bac d'un nom n'existe pas.
  if (shared.length === 1) {
    own.push({ memberId: shared[0].memberId, factor: shared[0].factor });
    return { own: sortLids(own), tub: null };
  }
  if (shared.length === 0) return { own: sortLids(own), tub: null };
  return {
    own: sortLids(own),
    tub: {
      memberIds: shared.map((r) => r.memberId).sort(),
      factorSum: shared.reduce((a, r) => a + r.factor, 0),
    },
  };
}

function sortLids(
  lids: { memberId: string; factor: number }[],
): { memberId: string; factor: number }[] {
  return lids.sort((a, b) => a.memberId.localeCompare(b.memberId));
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES COMPTEURS — TOUS PRÉSENTS, MÊME À ZÉRO
// ═══════════════════════════════════════════════════════════════════════════

export interface SizingCounters {
  dishes: number;
  measured: number;
  unmeasurable_by: Record<string, number>;
  verdicts: Record<SizingVerdict, number>;
  bounds_source: Record<"age_known" | "age_unknown", number>;
  clamped: { max: number; min: number };
  unmet_band: { lt_200: number; gte_200: number };
  pot_ingredients_without_amount: number;
}

/**
 * ⛔ TOUTES LES CLÉS, MÊME À ZÉRO. Un compteur absent et un compteur à zéro se
 * relisent pareil dans un journal, et ne veulent pas du tout dire la même chose:
 * « aucun plat n'a débordé » et « le comptage n'est pas branché » sont
 * exactement le genre de paire que ce dépôt confond en boucle.
 */
export function sizingCounters(): SizingCounters {
  return {
    dishes: 0,
    measured: 0,
    unmeasurable_by: {},
    verdicts: { in_bounds: 0, over_max: 0, under_min: 0, unmeasurable: 0 },
    bounds_source: { age_known: 0, age_unknown: 0 },
    clamped: { max: 0, min: 0 },
    unmet_band: { lt_200: 0, gte_200: 0 },
    pot_ingredients_without_amount: 0,
  };
}

/**
 * LE FACTEUR D'UNE CASSEROLE = Σ DES FACTEURS DE SES TIRAGES ÷ LE NOMBRE DE TIRAGES.
 *
 * ⛔ ET PAS « Σ DES FACTEURS », que le plan de chantier écrivait. La démonstration
 * tient en trois lignes, et se trompe d'un facteur `n` si on la saute:
 *
 *     la recette écrite `R` sert `n` tirages, donc UN tirage vaut `R / n`;
 *     le plat `i`, multiplié par `fᵢ`, en réclame `(R / n) × fᵢ`;
 *     la casserole doit donc contenir `Σᵢ (R / n) × fᵢ` = `R × (Σfᵢ) / n`.
 *
 * Avec `Σfᵢ` on cuisinerait `n` fois trop — sur trois plats à facteur 1, une
 * casserole de trois portions deviendrait neuf. ⚠️ Et le cas où tous les
 * facteurs valent `f` rend `n·f / n = f`, ce qui est la contre-épreuve: le
 * chemin nominal ne bouge pas.
 */
export function potFactorOf(factors: readonly number[]): number {
  if (factors.length === 0) return 1;
  return factors.reduce((a, b) => a + b, 0) / factors.length;
}
