// ═══════════════════════════════════════════════════════════════════════════
// LA PART D'UNE PERSONNE — LE COULOIR DE DENSITÉ (`densityCorridorFor`)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `portion_sizing.ts` (découpage des gros
// fichiers, lot 2e). Aucune logique changée. `portion_sizing.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// Ce module n'importe jamais `portion_sizing.ts`.
//
// Ce qui est ici : `densityCorridorFor` et les trois constantes qu'elle lit.
// Ces trois-là vivaient plus bas dans `portion_sizing.ts` :
// `REPAIR_DENSITY_HEADROOM` dans la réparation (⑦), `MAX_ASKABLE_DENSITY_PER_100G`
// et `DENSITY_INCOMPATIBILITIES` dans la densité requise (⑨). Elles sont ici
// parce que le couloir, la réparation, la densité requise et la
// redistribution les lisent toutes : les laisser chez l'un des quatre ferait
// une boucle d'imports entre modules.

import type { PlateBounds } from "./portion_plate_bounds.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ③ bis — LE COULOIR DE DENSITÉ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA DENSITÉ QU'UNE ASSIETTE DOIT AVOIR POUR QUE SA MASSE TIENNE DANS SES DEUX
 * BORNES — les deux bouts, et la visée.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI DEUX BOUTS, ET PAS UN PLANCHER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mesuré au tir SPLICE3 (2026-09-08): un adulte en perte de gras SOUS son
 * plancher d'assiette au petit-déjeuner a reçu, en consigne, « reste sous 145
 * kcal/100 g » — et un bouillon à **57,8** est revenu. Son assiette est passée
 * de trop petite à trop grosse. « Reste sous N » sans plancher laisse le modèle
 * diluer sans limite; « au moins N » sans plafond le laisse concentrer sans
 * limite. Les deux erreurs sont la même erreur.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * L'ARITHMÉTIQUE, ET ELLE EST LA MÊME QUE CELLE DU DIMENSIONNEMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     Dmin  = 100 × E / Gmax      sous Dmin, l'assiette dépasse son plafond
 *     Dmax  = 100 × E / Gmin      au-dessus, la part tient dans trois cuillères
 *     Dpréf = 100 × E / Gpréf     la visée, toujours à l'intérieur
 *
 * C'est `étape 10` (« cible ÷ densité ») écrite à l'envers, dite AVANT la
 * composition au lieu d'après. Elle ne coûte pas un appel.
 *
 * ⚠️ `E` EST L'ÉNERGIE À COMPOSER, apports fixes déjà retranchés — la même que
 * `slotPlanTargets` rend. Une seconde arithmétique de la cible d'un moment
 * ferait annoncer au modèle une densité que le moteur ne demanderait pas.
 *
 * ⛔ LE PLAFOND DE DEMANDE MORD SUR LES DEUX BORNES, ET IL SE NOMME. Un besoin
 * au-dessus de `MAX_ASKABLE_DENSITY_PER_100G` ne fait pas taire le couloir: il
 * le rabat à ce qui est tenable et pose `incompatible`, en gardant
 * `neededMinPer100G`. Un minimum tronqué en silence apprendrait au modèle que
 * ces nombres-là sont décoratifs — mesuré (389 demandés, 126,7 rendus).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export interface DensityCorridor {
  minPer100G: number;
  maxPer100G: number;
  preferredPer100G: number;
  /** Le besoin AVANT le plafond de demande. Égal à `minPer100G` sans plafond. */
  neededMinPer100G: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-11 · LOT B — `100 × E / Gpréf`: CE QUE LA CIBLE IMPLIQUERAIT.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ IL N'EST PAS LA CONSIGNE. `preferredPer100G` reste `Dmin × REPAIR_DENSITY_
   * HEADROOM`, projeté dans le couloir, et il ne bouge pas. La substitution a
   * été demandée (chantier, lot C.4) et elle est REFUSÉE par un arbitrage
   * mesuré — **A15**, `docs/keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md:573`:
   * `100 × E / Gpréf` rend **236 kcal/100 g** sur un déjeuner de 1 120 kcal,
   * alors que les plats réels de ce dépôt vivent entre **113 et 156**; on a
   * mesuré **389 demandés au dîner et 126,7 rendus**, consigne ignorée. Revenir
   * à cette formule réintroduirait un défaut déjà payé.
   *
   * ⚠️ CE QU'ON RETIENT DE LA DEMANDE, C'EST LE MOT « SILENCIEUSEMENT ». Les
   * deux nombres sortent donc côte à côte, et `anchorDivergencePer100G` dit de
   * combien ils s'écartent. Rien n'est substitué en silence, et la mesure qui a
   * fondé A15 n'est pas jetée.
   */
  targetAnchoredPer100G: number;
  /**
   * `targetAnchoredPer100G − preferredPer100G`, signé. `0` quand les deux
   * coïncident. ⛔ C'EST LE COMPTEUR DE DIVERGENCE, et il est PAR APPEL parce
   * que ce module est pur: l'appelant l'agrège (une somme, un maximum, un
   * histogramme) et le journalise. Un compteur global vivant ici ferait de
   * `densityCorridorFor` une fonction à mémoire, donc à deux réponses pour la
   * même entrée.
   */
  anchorDivergencePer100G: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1C ⑤ — LES BORNES EXACTES, NON ARRONDIES
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT ② DE LA CLÔTURE DU 2026-09-14, AVEC SON CHIFFRE. L'arrondi par
   * item rend **218 g** là où le partage décide 216, donc une densité de
   * **241,1** — jugée hors bornes contre un plafond ENTIER de **241**, alors
   * que le plafond EXACT vaut **241,27**. Le plan de bêta le dit en toutes
   * lettres: « garder les valeurs exactes pour les contraintes ; le test 241,1
   * contre un plafond affiché à 241 ne doit pas échouer si le plafond exact
   * applicable vaut 241,27. Inversement un dépassement réel ne disparaît pas
   * par l'arrondi de l'affichage. »
   *
   * ⚠️ LES ENTIERS RESTENT, ET ILS SONT POUR LE MODÈLE. On ne demande pas à
   * quelqu'un de viser 241,27 kcal/100 g; on ne JUGE pas non plus sur un
   * nombre qu'on a arrondi pour l'énoncer. Deux usages, deux nombres, et
   * aucun des deux ne remplace l'autre.
   *
   * ⚠️ ILS SONT PLAFONNÉS PAR `MAX_ASKABLE_DENSITY_PER_100G` COMME LES AUTRES:
   * la politique du moteur s'applique aux deux formes, sinon le verdict
   * jugerait contre une borne que la consigne n'a jamais portée.
   */
  minExactPer100G: number;
  maxExactPer100G: number;
  incompatible: DensityIncompatibility | null;
}

/**
 * ⟳ 2026-09-23 — LA DENSITÉ D'UNE PART DU GABARIT DE RECETTE, en kcal pour
 * 100 g. C'est la VISÉE d'un repas dans `densityCorridorFor`.
 *
 * ⛔ D'OÙ VIENT 125 (audit `docs/keel/AUDIT-DOSAGES-2026-09-23.md`, lot 3):
 * la part du gabarit — 110 à 130 g de protéine maigre crue, 180 à 200 g de
 * légumes, 10 ml d'huile, au plus 15 g de fromage, et 60 à 70 g de céréale
 * sèche à part — pèse environ 1,26 kcal/g avec le couscous, 1,225 pour la
 * casserole principale seule. 125 est ce plat-là, arrondi à 5.
 *
 * ⚠️ CE N'EST PAS UN PLANCHER. Le plancher d'un repas reste
 * `MEAL_KCAL_PER_G_FLOOR` (100 kcal/100 g), et le minimum du couloir reste le
 * besoin de la case. 125 est ce qu'on DEMANDE quand l'assiette le permet.
 *
 * ⚠️ LE SEUIL DE TABLE EN DÉRIVE: `SHARED_TABLE_MAX_ASK_PER_100G` vaut 115 =
 * 125 / 1,10 arrondi à 5 (`slot_nutrition_contract.ts`). Déplacer l'un sans
 * relire l'autre remet le plat plein au-dessus de ce que la table accepte.
 */
export const TEMPLATE_DISH_KCAL_PER_100G = 125;

export function densityCorridorFor(args: {
  targetKcal: number | null;
  bounds: PlateBounds;
}): DensityCorridor | null {
  const kcal = Number(args.targetKcal);
  if (args.targetKcal === null || !Number.isFinite(kcal) || kcal <= 0) {
    return null;
  }
  const { min: gMin, max: gMax, preferred: gPref } = args.bounds;
  if (!(gMax > 0) || !(gMin > 0)) return null;
  const neededMin = (kcal / gMax) * 100;
  const rawMax = (kcal / gMin) * 100;
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LA VISÉE N'EST PAS LE MILIEU DU COULOIR, ET C'EST MESURÉ
  // ══════════════════════════════════════════════════════════════════════
  //
  // `100 × E / Gpréf` — la densité de l'assiette de masse moyenne — donne des
  // nombres INTENABLES dès que le besoin est grand: sur un déjeuner de
  // 1 120 kcal, `Gpréf` vaut 475 g et la visée **236 kcal/100 g**. Or les plats
  // réels mesurés par ce dépôt vivent entre **113 et 156**; un gratin fait 180,
  // des lasagnes 150. On aurait redemandé exactement ce que
  // `MAX_ASKABLE_DENSITY_PER_100G` existe pour empêcher — et ce qui a été
  // mesuré: 389 demandés au dîner, **126,7 rendus**, la consigne ignorée.
  //
  // ⚠️ ET LE MILIEU EST FAUX DANS SA DIRECTION. Quand la masse plafonne, on
  // VEUT la grande assiette: moins dense, plus facile à composer, et c'est
  // exactement ce que `Dmin` décrit. La visée doit donc partir du BAS du
  // couloir, pas de son centre.
  //
  // Ce qui reste utile d'une marge, c'est d'éloigner de la borne: viser le
  // strict minimum revient à demander d'échouer, le moindre arrondi remettant
  // le plat dehors. D'où `Dmin × REPAIR_DENSITY_HEADROOM`, **projeté dans le
  // couloir** — la marge est intérieure, elle ne déplace plus la cible au-delà.
  //
  // ⚠️ `bounds.preferred` (une MASSE) garde, lui, le milieu de `[bmin, bmax]`:
  // les deux répondent à deux questions différentes — « quelle assiette vise-
  // t-on » et « quelle densité DEMANDE-T-ON à un modèle qui rend ±23 à +63 % ».
  //
  // ⟳ 2026-09-23 — ⛔ POUR UN REPAS, LA VISÉE EST LA DENSITÉ DU GABARIT
  // (`TEMPLATE_DISH_KCAL_PER_100G`), ou le besoin minimal s'il est plus haut,
  // ramenée dans le couloir par l'arrondi dirigé plus bas. « Viser la grande
  // assiette » (A15) poussait le plat vers 700 g et le féculent vers 150 g de
  // céréale sèche par part; le plat vise maintenant l'assiette ordinaire, et
  // c'est l'à-côté qui porte le reste du repas. Lot 3a de l'audit du
  // 2026-09-23: « visée = densité du gabarit, et non un calcul à part ».
  // ⚠️ LES COLLATIONS NE CHANGENT PAS: elles n'ont pas de gabarit de plat, et
  // elles reçoivent le débordement des repas; elles gardent `Dmin × marge`.
  const rawPref = args.bounds.slotClass === "meal"
    ? Math.max(TEMPLATE_DISH_KCAL_PER_100G, neededMin)
    : neededMin * REPAIR_DENSITY_HEADROOM;

  const cap = MAX_ASKABLE_DENSITY_PER_100G;
  const incompatible: DensityIncompatibility | null = neededMin > cap
    ? "above_askable_cap"
    : null;
  // ⛔ L'ARRONDI EST DIRIGÉ, ET DANS LE SENS QUI GARDE LE COULOIR HABITABLE.
  // Le plancher monte (`ceil`), le plafond descend (`floor`): l'inverse
  // élargirait la consigne d'un kcal de chaque côté à chaque tour, et la
  // consigne finirait par ne plus rien exiger.
  const minPer100G = Math.min(cap, Math.ceil(neededMin));
  const maxPer100G = Math.max(minPer100G, Math.min(cap, Math.floor(rawMax)));
  const preferredPer100G = Math.min(
    maxPer100G,
    Math.max(minPer100G, Math.round(rawPref)),
  );
  // ⟳ 2026-09-11 · LOT B — LE NOMBRE QUE LA CIBLE IMPLIQUERAIT, RENDU BRUT.
  // ⛔ NI RABATTU DANS LE COULOIR, NI PLAFONNÉ PAR `MAX_ASKABLE_DENSITY_PER_100G`:
  // c'est un TÉMOIN, pas une consigne. Le projeter le rendrait indiscernable de
  // `preferredPer100G` exactement dans les cas où il diverge le plus — les
  // grandes cibles, c'est-à-dire ceux qui ont fondé A15.
  const targetAnchoredPer100G = Math.round((kcal / gPref) * 100);
  // ⟳ 2026-09-14 · BÊTA 1C ⑤ — LES MÊMES DEUX NOMBRES, SANS L'ARRONDI DIRIGÉ.
  // Le plafond du moteur s'applique aux deux formes; ce qui disparaît ici est
  // seulement le `ceil`/`floor` qui rend la consigne énonçable.
  const minExact = Math.min(cap, neededMin);
  const maxExact = Math.max(minExact, Math.min(cap, rawMax));
  return {
    minPer100G,
    maxPer100G,
    preferredPer100G,
    neededMinPer100G: Math.ceil(neededMin),
    targetAnchoredPer100G,
    anchorDivergencePer100G: targetAnchoredPer100G - preferredPer100G,
    minExactPer100G: minExact,
    maxExactPer100G: maxExact,
    incompatible,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Constantes lues par le couloir ET par d'autres modules (voir l'en-tête).
// ───────────────────────────────────────────────────────────────────────────

/**
 * LA MARGE QU'ON DEMANDE AU-DELÀ DU STRICT NÉCESSAIRE.
 *
 * ⛔ ELLE EXISTE PARCE QUE DEMANDER LE STRICT MINIMUM REVIENT À DEMANDER
 * D'ÉCHOUER. Un plat qui atteint exactement la densité nécessaire tient tout
 * juste dans la borne; le moindre écart d'arrondi ou d'ingrédient le remet
 * dehors, et on aurait dépensé un appel pour rien. 10 % est assez pour absorber
 * ça et assez peu pour ne pas déformer le plat.
 */
export const REPAIR_DENSITY_HEADROOM = 1.10;

/**
 * LA DENSITÉ LA PLUS HAUTE QU'ON PUISSE DEMANDER À UN PLAT — 2026-09-08.
 *
 * ⛔ CONVENTION, ET ELLE VIENT D'UN TIR. Le second tir sur `qa-genty-clone` a
 * exigé **389 kcal/100 g** au dîner. Aucun plat ne tient ça: un gratin
 * dauphinois fait 180, des lasagnes 150, un parmentier de canard 230. À 389 on
 * ne demande plus un plat, on demande une pâte à tartiner — et le modèle a
 * rendu 126,7, c'est-à-dire qu'il a ignoré la consigne.
 *
 * ⛔ UNE CONSIGNE INTENABLE EST PIRE QU'UNE CONSIGNE ABSENTE. Elle apprend au
 * modèle que ces nombres-là sont décoratifs, sur toute la ligne — y compris aux
 * moments où l'exigence était atteignable.
 *
 * ── D'OÙ VENAIT LE 389, ET POURQUOI CE N'EST PAS UN BUG DE CALCUL ────────
 * Le `max` sur les jours: la veille de cuisine ne porte souvent qu'UN moment
 * pour cette bouche, donc ce moment-là pèse la journée entière, et sa densité
 * requise explose. Le calcul est juste; c'est ce qu'on en DEMANDE qui doit être
 * borné. Le besoin réel n'est pas perdu pour autant — il continue de sortir en
 * `unmet_kcal` quand l'assiette plafonne, ce qui est la réponse honnête: « ce
 * jour-là, un seul repas ne peut pas porter la journée ».
 *
 * ⚠️ ELLE DOIT MORDRE RAREMENT, ET DONC SE COMPTER (`counters.capped`). Une
 * borne qui mord sur la population entière n'est plus une borne, c'est le
 * calcul — ce dépôt l'a déjà mesuré trois fois (`ANCHOR_FACTOR_MAX`,
 * `BOX_FACTOR_MIN`, et le défunt `COMPOSED_DISH_MIN_MEAL_SHARE`, retiré le
 * 2026-09-10 avec les extras qu'il bornait).
 */
export const MAX_ASKABLE_DENSITY_PER_100G = 250;

/**
 * ⟳ 2026-09-10 — POURQUOI UNE INCOMPATIBILITÉ SE NOMME AU LIEU DE SE TAIRE.
 *
 * ⛔ « Une consigne intenable est pire qu'une consigne absente: elle apprend au
 * modèle que ces nombres-là sont décoratifs, sur toute la ligne. » C'est la
 * règle de `MAX_ASKABLE_DENSITY_PER_100G`, mesurée (389 demandés au dîner,
 * 126,7 rendus). Quand le besoin sort du couloir demandable, on ne rabote pas
 * le minimum en silence: on demande ce qui est tenable ET on écrit que le
 * besoin, lui, ne l'était pas. La différence continue de sortir en `unmet_kcal`.
 */
// ⟳ 2026-09-10 · LOT 4 — `empty_intersection` REJOINT LE VOCABULAIRE.
// ⛔ Deux jours qui partagent un moment peuvent avoir des couloirs disjoints:
// un lundi à [140, 160] et un jeudi à [100, 120] n'ont AUCUNE densité commune.
// Jusqu'ici la fusion gardait le couloir du jour le plus exigeant et taisait
// le conflit — le modèle recevait une bande tenable pour un jour et intenable
// pour l'autre, sans que rien ne le dise.
export const DENSITY_INCOMPATIBILITIES = [
  "above_askable_cap",
  "empty_intersection",
] as const;
export type DensityIncompatibility = (typeof DENSITY_INCOMPATIBILITIES)[number];
