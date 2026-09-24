// ═══════════════════════════════════════════════════════════════════════════
// LA PART D'UNE PERSONNE — LA RÉPARATION, LE PLAT DÉDIÉ, LE COMPLÉMENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `portion_sizing.ts` (découpage des gros
// fichiers, lot 2e). Aucune logique changée. `portion_sizing.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// Ce module n'importe jamais `portion_sizing.ts`.
//
// Ce qui est ici : ⑦ la réparation (`repairDecision`, `repairDecisionForDish`,
// `repairInstruction`, la réparabilité), ⑪ le plat dédié et ⑬ le complément.
// `REPAIR_DENSITY_HEADROOM`, qui était dans ⑦, est dans
// `portion_density_corridor.ts` : le couloir la lit aussi.

import {
  type CompositionIndex,
  type CompositionRef,
  normalizeTerm,
} from "./food_composition.ts";
import type { PlateBounds } from "./portion_plate_bounds.ts";
import {
  type DensityCorridor,
  densityCorridorFor,
  REPAIR_DENSITY_HEADROOM,
} from "./portion_density_corridor.ts";
import type {
  SizedDish,
  SizingVerdict,
  StandardPortion,
} from "./portion_sizing_core.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LA RÉPARATION — lot 5
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UNE SEULE DEMANDE PAR PLAT, ET UN SEUL APPEL PAR PLAN.
 *
 * ⛔ LA VERSION D'AVANT DISAIT « PAS DE BOUCLE », ET ELLE AVAIT TORT SUR SA
 * PROPRE PRÉMISSE. Elle supposait qu'un refus veut dire « le modèle ne sait pas
 * rendre ce plat plus dense ». Mesuré le 2026-09-09, c'est faux dans trois cas
 * sur quatre :
 *
 *   · `title_changed` — il a composé un AUTRE plat. Il n'a pas échoué à
 *     densifier, il n'a pas fait l'exercice demandé.
 *   · `no_cell` — la case n'est pas revenue. Il n'a rien dit sur la densité.
 *   · `unparseable` — du JSON cassé, ou l'appel qui tombe.
 *
 * Dans les trois, la deuxième version n'est pas « une troisième version qu'on
 * bornera pareil » : c'est le premier essai réel. Seul le quatrième cas — une
 * recette rendue, lisible, plus dense, et toujours insuffisante — justifiait la
 * phrase d'origine, et celui-là ne repart pas (`still_out` le compte).
 *
 * ⚠️ DEUX, PAS TROIS. Le budget d'un plan reste ce qu'il était à un facteur
 * près, et le second appel ne part QUE sur un refus — un plan qui passe du
 * premier coup ne coûte rien de plus. Décision du propriétaire, 2026-09-09.
 */
export const REPAIR_CALLS_PER_DISH = 2;

/**
 * COMBIEN DE PLATS UN SEUL APPEL PEUT NOMMER.
 *
 * ⚠️ UN BUDGET, PAS UNE LIMITE TECHNIQUE. Au-delà de quatre plats hors bornes,
 * ce n'est plus un plat à réparer, c'est un plan à recomposer — et recomposer
 * n'est pas ce que cette relance fait. Les plats au-delà du budget sont bornés
 * et COMPTÉS (`skipped_budget`), jamais silencieusement laissés.
 */
export const REPAIR_MAX_DISHES_PER_PLAN = 4;

/**
 * CE QU'IL FAUT AVOIR PERDU POUR QUE RAPPELER LE MODÈLE AIT UN SENS.
 *
 * ⛔ « ENCORE HORS BORNES » NE VEUT PAS DIRE « ÇA VAUT UN APPEL ». Mesuré le
 * 2026-09-10 sur les dix tirs `qa-genty-clone`, les trois plats restés hors
 * bornes après une réparation acceptée :
 *
 *   · R5 — 701 g pour un plafond de 700 : **2 kcal** manquantes sur 3 080
 *     (0,06 %). Un gramme. C'est du bruit de référentiel, pas un défaut.
 *   · R3 — 708 g : **12 kcal** (0,4 %).
 *   · R6 — 758 g : **74 kcal** (2,4 %), et celui-là mérite un second essai.
 *
 * Un seuil à 25 kcal sépare les deux familles sans couper au milieu d'aucune:
 * en dessous, un appel modèle coûte du temps mur et de l'argent pour corriger
 * ce qu'on ne saurait même pas mesurer sur une balance de cuisine.
 *
 * ⚠️ CE N'EST PAS UNE TOLÉRANCE SUR LA BORNE. L'assiette est rabotée à 700 g
 * dans tous les cas, et le manque est compté dans tous les cas (`unmet_kcal`).
 * Ce seuil décide d'UNE chose: faut-il redemander au modèle.
 */
export const REPAIR_RETRY_MIN_UNMET_KCAL = 25;
export interface RepairAsk {
  /** `densify` = le plat est trop dilué; `lighten` = trop concentré. */
  direction: "densify" | "lighten";
  /** La densité actuelle, en kcal pour 100 g SERVIS. */
  currentPer100G: number;
  /**
   * ⟳ 2026-09-08 — LE PLANCHER D'UNE DEMANDE « ALLÉGER ». Mesuré au tir
   * SPLICE3 : un adulte en perte de gras SOUS son plancher d'assiette au
   * petit-déjeuner a reçu, en plat à son nom, un bouillon à 57,8 kcal/100 g —
   * et son assiette est passée d'« trop petite » à « trop grosse » (over_max).
   * « Reste sous N » sans plancher laisse le modèle diluer sans limite. Le
   * plancher est la densité en dessous de laquelle l'assiette dépasse son
   * plafond de masse : `max_i(target_i ÷ maxMass_i)`. `null` en densify.
   */
  floorPer100G: number | null;
  /**
   * ⟳ 2026-09-10 — LE HAUT DU COULOIR, ET IL EXISTE DANS LES DEUX SENS.
   *
   * ⛔ « AU MOINS N » N'A PAS DE HAUT. Sur 40 densités demandées puis pesées,
   * 23 étaient AU-DESSUS de la consigne, jusqu'à +63 %. Un plat trop dense
   * n'est pas un bonus: la part tient dans trois cuillères, passe sous le
   * plancher d'assiette, et déclenche une réparation « allège » qui coûte le
   * même appel. `null` = pas de couloir calculable (chemin legacy).
   */
  ceilingPer100G: number | null;
  /**
   * La densité à VISER, à l'intérieur du couloir.
   *
   * ⟳ 2026-09-10 — ce n'est plus « le nécessaire × 1,10 ». La marge poussait le
   * centre d'un tir déjà centré (médiane +3,1 %), alors que c'est la DISPERSION
   * qui coûtait. La visée est maintenant `100 × E / Gpréf`, projetée dans
   * `[min, max]`: la marge est INTÉRIEURE au couloir.
   */
  aimPer100G: number;
}

/**
 * CE QU'IL FAUT DEMANDER POUR CE PLAT — ou rien.
 *
 * ⛔ LE VERDICT SE TRADUIT EN DENSITÉ, ET C'EST TOUT LE LOT. La borne porte sur
 * une MASSE, la cible sur une ÉNERGIE; le modèle n'a ni l'une ni l'autre — il
 * n'a plus le corps de personne depuis v33. La seule grandeur qu'on puisse lui
 * donner sans lui rendre le corps est la DENSITÉ, qui est une propriété du plat:
 *
 *     pour que `cible` tienne dans `max` grammes, il faut `cible / max` kcal/g
 *     pour que `cible` remplisse `min` grammes, il faut au plus `cible / min`
 *
 * ⚠️ NI LA CIBLE NI LES BORNES NE SORTENT D'ICI. Un test lit l'instruction et
 * vérifie qu'elle ne porte ni kcal de journée, ni kg, ni prénom.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * LA VISÉE D'UNE RÉPARATION — elle dépend du CÔTÉ d'où l'on vient.
 *
 * ⛔ « LA MARGE ÉLOIGNE TOUJOURS DE LA BORNE, JAMAIS NE S'EN RAPPROCHE. » Un
 * plat trop dilué arrive par le BAS du couloir: sa visée monte au-dessus du
 * plancher (`min × 1,10`). Un plat trop dense arrive par le HAUT: sa visée
 * descend sous le plafond (`max ÷ 1,10`). Prendre la même visée des deux côtés
 * demanderait à un plat déjà trop dense de l'être ENCORE plus — c'est le piège
 * que le test « la marge va dans l'AUTRE SENS » garde depuis le lot 5.
 *
 * ⚠️ ET LES DEUX RESTENT DANS LE COULOIR. La marge est intérieure: sur un
 * couloir étroit, `min × 1,10` peut dépasser `max`, et c'est `max` qui gagne.
 *
 * ⟳ 2026-09-23 — ⛔ LA VISÉE DE LA CONSIGNE NE SUFFIT PLUS À UN PLAT TROP
 * DILUÉ. Jusqu'ici, `preferredPer100G` valait `Dmin × 1,10` partout, et la
 * réparation la reprenait telle quelle. Depuis que la visée d'un REPAS est
 * `max(TEMPLATE_DISH_KCAL_PER_100G ; Dmin)` (`densityCorridorFor`), un repas
 * qui a besoin de plus de 125 est visé AU PLANCHER — mesuré: 1 200 kcal dans
 * 550 g, visée 219 pour un plancher de 218,2. Un plat qui revient déjà trop
 * dilué et qu'on renvoie viser le strict minimum repart dehors au moindre
 * arrondi. La réparation garde donc la plus haute des deux: la visée de la
 * consigne (125 chez un petit repas, jamais moins) et `Dmin × 1,10`, la marge
 * d'avant. Une collation rend exactement le nombre d'avant.
 */
function repairAimFor(
  corridor: DensityCorridor,
  direction: RepairDirection,
): number {
  if (direction === "densify") {
    const withHeadroom = Math.round(
      corridor.minExactPer100G * REPAIR_DENSITY_HEADROOM,
    );
    return Math.min(
      corridor.maxPer100G,
      Math.max(corridor.preferredPer100G, withHeadroom),
    );
  }
  const down = Math.floor(corridor.maxPer100G / REPAIR_DENSITY_HEADROOM);
  return Math.min(corridor.maxPer100G, Math.max(corridor.minPer100G, down));
}

export function repairDecision(args: {
  sized: SizedDish;
  standard: StandardPortion;
  bounds: PlateBounds;
  targetKcal: number | null;
}): RepairAsk | null {
  const { sized, standard, bounds, targetKcal } = args;
  if (sized.verdict === "in_bounds" || sized.verdict === "unmeasurable") {
    return null;
  }
  if (targetKcal === null || !(targetKcal > 0)) return null;
  if (standard.densityPer100G === null || !(standard.densityPer100G > 0)) {
    return null;
  }
  // ⟳ 2026-09-10 — LE MÊME COULOIR QUE CELUI ANNONCÉ AVANT LA COMPOSITION.
  // ⛔ DEUX ARITHMÉTIQUES DE LA MÊME DENSITÉ FERAIENT DEMANDER À LA RÉPARATION
  // UN NOMBRE QUE LE BRIEF N'AVAIT PAS DIT — et le modèle lirait deux consignes
  // contradictoires sur le même plat.
  const corridor = densityCorridorFor({ targetKcal, bounds });
  if (corridor === null) return null;
  const current = Math.round(standard.densityPer100G);
  if (sized.verdict === "over_max") {
    return {
      direction: "densify",
      currentPer100G: current,
      floorPer100G: corridor.minPer100G,
      ceilingPer100G: corridor.maxPer100G,
      aimPer100G: repairAimFor(corridor, "densify"),
    };
  }
  return {
    direction: "lighten",
    currentPer100G: current,
    // ⛔ LE PLANCHER : la densité sous laquelle l'assiette dépasserait son
    // plafond de masse. Sans lui, un bouillon à 58 passe (tir SPLICE3).
    floorPer100G: corridor.minPer100G,
    ceilingPer100G: corridor.maxPer100G,
    aimPer100G: repairAimFor(corridor, "lighten"),
  };
}

/**
 * L'INSTRUCTION DE RELANCE — un fait sur chaque plat, jamais sur la personne.
 *
 * ⛔ « KEEP ITS IDENTITY » EST LA MOITIÉ QUI COMPTE. Sans elle, « rends ce plat
 * plus dense » se satisfait en remplaçant la soupe par un gratin: le plat
 * atteint la densité et la personne ne reçoit pas ce qu'elle avait demandé. La
 * relance répare une RECETTE, elle ne recompose pas un plan.
 */
export type RepairDirection = "densify" | "lighten";

/**
 * UNE UNITÉ DE RECETTE PEUT-ELLE ÊTRE RÉÉCRITE POUR CETTE PERSONNE ?
 *
 * ⛔ « UNITÉ » VEUT DIRE LE FRAIS DU PLAT **COMME** CHAQUE CASSEROLE, et les
 * traiter différemment était le défaut de la première version. Le frais d'un
 * plat partagé est mangé par tous ceux qui mangent le plat: le densifier pour
 * l'un le densifie pour l'autre, exactement comme une casserole.
 */
export type Repairability = "reworkable" | "frozen";

/** Un ingrédient tel que le modèle l'a écrit — sa quantité comprise. */
export interface RepairIngredient {
  term: string;
  /** La chaîne du modèle (« 250 g », « 2 c. à s. »). `null` = il n'en a pas mis. */
  quantity: string | null;
}

export interface RepairPot {
  id: string;
  title: string;
  ingredients: readonly RepairIngredient[];
  repairability: Repairability;
}

/** Ce qu'on rend au modèle pour qu'il réécrive UN plat: sa recette entière. */
export interface RepairDishInput {
  title: string;
  ask: RepairAsk;
  fresh: readonly RepairIngredient[];
  freshRepairability: Repairability;
  pots: readonly RepairPot[];
}

/**
 * L'INSTRUCTION DE RELANCE — un fait sur chaque plat, jamais sur la personne.
 *
 * ⛔ « KEEP ITS IDENTITY » EST LA MOITIÉ QUI COMPTE. Sans elle, « rends ce plat
 * plus dense » se satisfait en remplaçant la soupe par un gratin: le plat
 * atteint la densité et la personne ne reçoit pas ce qu'elle avait demandé. La
 * relance répare une RECETTE, elle ne recompose pas un plan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-08 — LA RECETTE PART AVEC SES QUANTITÉS, ET C'EST LE LOT ENTIER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * L'instruction ne nommait que les INGRÉDIENTS (« poulet, riz, tomate ») et
 * demandait de changer « les PROPORTIONS ». Le message de relance, lui, est le
 * prompt d'ORIGINE plus cette consigne: le modèle n'y voit nulle part le plan
 * qu'il vient d'écrire. On lui demandait donc de re-proportionner une recette
 * qu'il ne relit pas — c'est-à-dire de la recomposer de mémoire.
 *
 * Mesuré le 2026-09-07 sur `qa-genty-clone`: deux plats demandés (114 → 182 et
 * 92 → 159 kcal/100 g), deux acceptés par la garde d'identité, **deux toujours
 * hors bornes** (142 et 113 rendus). Le modèle obéissait dans le bon sens et
 * s'arrêtait à mi-chemin, faute de savoir d'où il partait.
 *
 * ⛔ ET LE MOT « PROPORTIONS » DISPARAÎT. Il décrivait ce qu'on voulait obtenir
 * (« ne change pas les aliments »), mais il se lit comme « sers-en moins » —
 * ce qui laisse la personne avec la même assiette rabotée, par l'autre bout.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-08 SOIR — « THE PLATE STAYS THE SAME SIZE » EST RETIRÉE, ET C'EST
 * ELLE QUI FAISAIT ÉCHOUER LA RÉPARATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cette phrase disait « ne réponds pas en servant une plus petite portion »,
 * et c'était un vrai risque. Mais elle est FAUSSE ICI, et la contradiction se
 * lit dans la même consigne: on demande « moins d'eau et moins de légume
 * aqueux », puis on interdit de rétrécir. Or retirer les légumes aqueux, c'est
 * exactement rétrécir.
 *
 * ⛔ LA RECETTE N'EST PAS UNE ASSIETTE. Depuis v33, le modèle écrit une recette
 * STANDARD que le moteur multiplie ensuite (`applySizing`). Réduire la sauce
 * dans la recette est la manœuvre juste; c'est le facteur, pas le modèle, qui
 * décide de ce qui atterrit dans l'assiette. La phrase fermait la seule porte
 * praticable.
 *
 * MESURÉ le 2026-09-08 sur `qa-genty-clone`: « Pâtes, sauce de lentilles, feta
 * et noix » à 97 kcal/100 g, à porter à 159. Le plat pèse ~1 340 g dont 400 g
 * de tomates concassées et 200 g de carotte. À masse constante il aurait fallu
 * ajouter ~875 kcal — 100 g d'huile, ou tripler la feta et les noix. Le modèle
 * a fait la seule chose que la consigne lui laissait: il a composé un AUTRE
 * plat (« Poulet, pommes de terre, poivron et salade au yaourt », 111 g de
 * survie sur 1 341). La garde d'identité l'a refusé, et les 333 kcal sont
 * restées au plafond.
 *
 * Ce qui la remplace dit ce qu'on voulait vraiment: la recette a le droit de
 * maigrir, et la portion servie n'est pas son affaire.
 *
 * ── LES CASSEROLES GELÉES SE NOMMENT, ELLES NE SE TAISENT PAS ────────────
 * Une casserole que d'autres assiettes tirent ne peut pas bouger pour une
 * seule d'entre elles. Ne pas la mentionner ferait un plat dont la moitié des
 * ingrédients semble absente; la nommer INTOUCHABLE dit au modèle où il a le
 * droit de travailler. Solo, aucune ne l'est.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * ⛔ ON NE TIRE JAMAIS UN ENFANT VERS LE BAS SUR UN PLAT PARTAGÉ.
 *
 * Alléger un plat parce qu'un mineur y dépasse son plancher ferait servir à
 * TOUS une recette plus diluée — donc des assiettes plus grosses pour les
 * adultes, pour corriger la portion d'un enfant que son facteur suffit à
 * corriger. La borne individuelle et son `unmetKcal` disent le reste.
 */
export const REPAIR_MINOR_NEVER_LIGHTEN = true;

/**
 * ⛔ ON N'ALLÈGE QUE SI TOUT LE MONDE EST SOUS SON PLANCHER.
 *
 * Un seul mangeur `under_min` sur quatre veut dire que le plat convient aux
 * trois autres: l'alléger leur servirait un volume qu'ils n'ont pas demandé
 * pour régler le cas d'un seul. Densifier, à l'inverse, se décide sur UN seul
 * `over_max` — parce que là, quelqu'un ne peut pas manger sa part.
 */
export const REPAIR_SHARED_LIGHTEN_REQUIRES_ALL = true;

export const REPAIR_REASONS = [
  "over_max",
  "all_under_min",
  "conflict",
  "minor_blocks_lighten",
  "partial_under_min",
  "none",
] as const;
export type RepairReason = (typeof REPAIR_REASONS)[number];

export interface RepairAskForDish {
  ask: RepairAsk | null;
  reason: RepairReason;
  /** Les mangeurs que la borne va raboter si rien ne change. */
  clampedEaters: number;
}

/**
 * LA RÉPARATION D'UN PLAT QUE PLUSIEURS PERSONNES MANGENT.
 *
 * ⛔ ON DENSIFIE VERS LE PLUS EXIGEANT, ET C'EST DISSYMÉTRIQUE EXPRÈS. Un seul
 * `over_max` suffit à demander un plat plus dense: cette personne-là ne peut
 * pas manger sa part, et les autres n'y perdent rien — leur facteur baisse
 * d'autant. Alléger, à l'inverse, coûte à tout le monde, donc il faut
 * l'unanimité.
 *
 * ⚠️ `over_max` ET `under_min` SUR LE MÊME PLAT: on densifie, et on le compte
 * (`conflict`). Quelqu'un qui n'est pas nourri est un défaut plus grave qu'une
 * assiette qui paraît petite.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairDecisionForDish(args: {
  standard: StandardPortion;
  eaters: readonly {
    verdict: SizingVerdict;
    targetKcal: number | null;
    bounds: PlateBounds;
    isMinor: boolean;
  }[];
}): RepairAskForDish {
  const { standard, eaters } = args;
  const clampedEaters = eaters.filter(
    (e) => e.verdict === "over_max" || e.verdict === "under_min",
  ).length;
  const none = (reason: RepairReason): RepairAskForDish => ({
    ask: null,
    reason,
    clampedEaters,
  });
  if (standard.densityPer100G === null || !(standard.densityPer100G > 0)) {
    return none("none");
  }
  const current = Math.round(standard.densityPer100G);

  const over = eaters.filter((e) =>
    e.verdict === "over_max" && (e.targetKcal ?? 0) > 0
  );
  if (over.length > 0) {
    // ⛔ LE PLUS EXIGEANT: celui dont la cible rapportée à SON plafond réclame
    // la densité la plus haute. Prendre la moyenne laisserait le plus contraint
    // au-dessus de sa borne, c'est-à-dire non nourri.
    // ⟳ 2026-09-10 — L'INTERSECTION DES COULOIRS DE SES MANGEURS, pas une
    // moyenne. ⛔ « Ne pas moyenner les besoins » : la moyenne laisserait le
    // plus contraint au-dessus de sa borne, c'est-à-dire NON NOURRI.
    //   plancher = le PLUS HAUT des planchers (le plus exigeant décide)
    //   plafond  = le PLUS BAS des plafonds  (au-delà, quelqu'un a une part
    //              qui tient dans trois cuillères)
    const band = intersectCorridors(over, "densify");
    const under = eaters.some((e) => e.verdict === "under_min");
    return {
      ask: {
        direction: "densify",
        currentPer100G: current,
        floorPer100G: band.min,
        ceilingPer100G: band.max,
        aimPer100G: band.aim,
      },
      reason: under ? "conflict" : "over_max",
      clampedEaters,
    };
  }

  const under = eaters.filter((e) =>
    e.verdict === "under_min" && (e.targetKcal ?? 0) > 0
  );
  if (under.length === 0) return none("none");
  if (REPAIR_MINOR_NEVER_LIGHTEN && eaters.some((e) => e.isMinor)) {
    return none("minor_blocks_lighten");
  }
  if (REPAIR_SHARED_LIGHTEN_REQUIRES_ALL && under.length !== eaters.length) {
    return none("partial_under_min");
  }
  // Le moins exigeant décide: viser plus bas rendrait un plat trop dilué pour
  // celui qui en demandait encore le plus.
  const band = intersectCorridors(under, "lighten");
  return {
    ask: {
      direction: "lighten",
      currentPer100G: current,
      // ⛔ LE PLANCHER : la densité sous laquelle l'assiette de l'un d'eux
      // dépasserait son plafond de masse. Sans lui, un bouillon à 58 passe.
      floorPer100G: band.min,
      ceilingPer100G: band.max,
      aimPer100G: band.aim,
    },
    reason: "all_under_min",
    clampedEaters,
  };
}

/**
 * L'INTERSECTION DES COULOIRS D'UN PLAT PARTAGÉ.
 *
 * ⛔ JAMAIS UNE MOYENNE. Deux mangeurs aux besoins opposés n'ont pas un besoin
 * moyen: ils ont deux besoins, et une recette unique doit tenir les deux ou
 * aucun. Le plancher est le PLUS HAUT des planchers, le plafond le PLUS BAS des
 * plafonds.
 *
 * ⚠️ INTERSECTION VIDE ⇒ ON GARDE LE PLANCHER ET ON REMONTE LE PLAFOND SUR LUI.
 * On ne rabote pas le plancher: il est ce qui empêche quelqu'un d'avoir une
 * assiette de 1 100 g. Le conflit se lit alors au fait que `min === max`, et le
 * complément (`splitPlateWithComplement`) est la sortie prévue pour ce cas.
 */
function intersectCorridors(
  eaters: readonly {
    targetKcal: number | null;
    bounds: PlateBounds;
  }[],
  direction: RepairDirection,
): { min: number; max: number; aim: number } {
  const corridors = eaters
    .map((e) =>
      densityCorridorFor({ targetKcal: e.targetKcal, bounds: e.bounds })
    )
    .filter((c): c is DensityCorridor => c !== null);
  if (corridors.length === 0) return { min: 0, max: 0, aim: 0 };
  const min = Math.max(...corridors.map((c) => c.minPer100G));
  const max = Math.max(min, Math.min(...corridors.map((c) => c.maxPer100G)));
  // ⚠️ LA VISÉE SUIT LE CÔTÉ, comme pour une bouche seule — mais l'intersection
  // est déjà faite, donc on la recalcule sur la bande commune.
  const aim = direction === "densify"
    ? Math.min(max, Math.max(min, Math.ceil(min * REPAIR_DENSITY_HEADROOM)))
    : Math.min(max, Math.max(min, Math.floor(max / REPAIR_DENSITY_HEADROOM)));
  return { min, max, aim };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-13 · LOT 1 — LE BLOC D'**UN** PLAT, SANS AUCUN ORDRE GLOBAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI IL EST EXTRAIT. `repairInstruction` rend UNE consigne pour N
 * plats, terminée par « Return the full plan JSON… » et « do not touch any
 * other dish ». Sur le chemin de la réparation finale, les deux sont FAUX : le
 * modèle rend un PATCH, et le périmètre ouvre d'autres repas au même appel. Le
 * constat d'amont dépose donc CE bloc-ci, par plat, avec sa propre adresse ; la
 * consigne de sortie est décidée à un seul endroit
 * (`REPAIR_PATCH_SCHEMA_LINES` + `repairPatchScopeLines`).
 *
 * ⚠️ L'INTERDICTION **LOCALE** RESTE DEDANS. « FROZEN — return them unchanged »
 * porte sur une casserole partagée que d'autres assiettes mangent : elle n'est
 * pas un ordre global, c'est la dépendance à préserver.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairDishInstructionLines(
  d: RepairDishInput,
): string[] {
  const say = (ings: readonly RepairIngredient[]): string =>
    ings
      .map((g) => g.quantity === null ? g.term : `${g.quantity} ${g.term}`)
      .join(", ");
  return dishRepairBlock(d, say);
}

export function repairInstruction(
  asks: readonly RepairDishInput[],
): string | null {
  if (asks.length === 0) return null;
  const say = (ings: readonly RepairIngredient[]): string =>
    ings
      .map((g) => g.quantity === null ? g.term : `${g.quantity} ${g.term}`)
      .join(", ");
  const lines = asks.slice(0, REPAIR_MAX_DISHES_PER_PLAN).flatMap((d) =>
    dishRepairBlock(d, say)
  );
  return [
    "SOME DISHES DO NOT WORK AS A PLATE. Fix only these, and here is what you",
    "wrote for each one:",
    ...lines,
    "⛔ Keep each dish's identity: the same name, the same foods, the same cooking.",
    "A dish that comes back with different food is a REPLACEMENT, and it will be",
    "thrown away — the person asked for this dish.",
    "A FROZEN part comes back unchanged: reach the density through the dish's own",
    "fresh ingredients and its REWORKABLE preparations.",
  ].join("\n");
}

/** Le corps d'un plat : sa bande de densité, son frais, ses casseroles. */
function dishRepairBlock(
  d: RepairDishInput,
  say: (ings: readonly RepairIngredient[]) => string,
): string[] {
  {
    // ⟳ 2026-09-10 — LA CONSIGNE DIT UNE BANDE, PAS UN SEUL BOUT.
    // ⛔ « Reste sous N » sans plancher a rendu un bouillon à 57,8 (tir SPLICE3):
    // l'assiette est passée de trop petite à trop grosse. « Au moins N » sans
    // plafond fait l'erreur miroir — 23 densités sur 40 sont revenues AU-DESSUS
    // de la consigne, jusqu'à +63 %. Les deux bords, et la visée au milieu.
    const band = d.ask.ceilingPer100G !== null && d.ask.floorPer100G !== null
      ? `between ${d.ask.floorPer100G} and ${d.ask.ceilingPer100G} kcal per 100 g ` +
        `as served, aiming for ${d.ask.aimPer100G}`
      : `at least ${d.ask.aimPer100G} kcal per 100 g as served`;
    const head = d.ask.direction === "densify"
      ? `- "${d.title}" serves ${d.ask.currentPer100G} kcal per 100 g; it has to land ` +
        `${band}. Rewrite the recipe, ` +
        `keeping its identity: more of the starch, the protein or the fat it ` +
        `already contains, less water and less watery vegetable. The recipe may end ` +
        `up smaller, and that is fine — the app decides how much of it goes on a ` +
        `plate, you do not.`
      : `- "${d.title}" serves ${d.ask.currentPer100G} kcal per 100 g; it has to land ` +
        `${band}. Rewrite the recipe, ` +
        `keeping its identity: less of the fat and the dense starch it already ` +
        `contains, more vegetable. The recipe may end up bigger, and that is fine — ` +
        `the app decides how much of it goes on a plate, you do not.`;
    const out = [head];
    // ⛔ CE QU'IL A ÉCRIT, AVEC SES QUANTITÉS. Voir le pavé: sans elles, la
    // relance demande de re-proportionner une recette que le modèle ne relit
    // nulle part.
    if (d.fresh.length > 0) {
      out.push(
        d.freshRepairability === "reworkable"
          ? `  Its own fresh ingredients, REWORKABLE: ${say(d.fresh)}.`
          : `  Its own fresh ingredients, FROZEN — return them unchanged: ${
            say(d.fresh)
          }.`,
      );
    }
    for (const pot of d.pots) {
      out.push(
        pot.repairability === "reworkable"
          ? `  Preparation ${pot.id} "${pot.title}", REWORKABLE: ${
            say(pot.ingredients)
          }.`
          : `  Preparation ${pot.id} "${pot.title}", FROZEN — other plates draw on it ` +
            `as it is, return it unchanged: ${say(pot.ingredients)}.`,
      );
    }
    return out;
  }
}

/**
 * CE QU'UNE UNITÉ APPREND D'UN PLAT QUI LA TIRE.
 *
 * ⛔ EXTRAITE LE 2026-09-08 POUR QUE LE FRAIS ET LA CASSEROLE SOIENT TRAITÉS
 * PAREIL, ce que la règle des mangeurs exige mot pour mot: « une unité, c'est
 * soit les ingrédients frais d'un plat, soit une casserole; les deux se
 * traitent pareil ».
 *
 * ⛔ MESURÉ AVANT L'EXTRACTION: la lane déclarait `freshRepairability:
 * "reworkable"` EN DUR. Sur un plat partagé, le frais est mangé par toute la
 * table: le densifier pour celui qui dépasse enrichit l'assiette de celui qui
 * était dans ses bornes, et celui-là ne le saura jamais — sa boîte est juste
 * plus riche. C'est très exactement le défaut que cette règle existe pour
 * empêcher, et il n'était gardé que sur les casseroles.
 *
 * ⚠️ « PAS BESOIN » N'EST PAS « BESOIN DU CONTRAIRE ». Un mangeur déjà dans ses
 * bornes n'inscrit aucune direction, donc il DISSENT dans les deux sens. C'est
 * `repairabilityOf` qui en tire la conséquence.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function absorbDishInto(
  unit: { eaters: Set<string>; needs: Map<string, Set<RepairDirection>> },
  dish: {
    eaters: ReadonlySet<string>;
    verdicts: ReadonlyMap<string, SizingVerdict>;
  },
): void {
  for (const eater of dish.eaters) {
    unit.eaters.add(eater);
    const verdict = dish.verdicts.get(eater);
    const direction: RepairDirection | null = verdict === "over_max"
      ? "densify"
      : verdict === "under_min"
      ? "lighten"
      : null;
    if (direction === null) continue;
    const set = unit.needs.get(eater) ?? new Set<RepairDirection>();
    set.add(direction);
    unit.needs.set(eater, set);
  }
}

/**
 * L'UNITÉ QUE FORMENT LES INGRÉDIENTS FRAIS D'UN PLAT.
 *
 * Ses mangeurs sont ceux du plat, et rien d'autre: le frais n'appartient qu'à
 * lui. C'est ce qui la distingue d'une casserole, tirée par plusieurs plats et
 * donc mangée par leur union.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function freshUnitOf(dish: {
  eaters: ReadonlySet<string>;
  verdicts: ReadonlyMap<string, SizingVerdict>;
}): { eaters: Set<string>; needs: Map<string, Set<RepairDirection>> } {
  const unit = {
    eaters: new Set<string>(),
    needs: new Map<string, Set<RepairDirection>>(),
  };
  absorbDishInto(unit, dish);
  return unit;
}

/**
 * QUI MANGE CHAQUE UNITÉ, ET DE QUOI CHACUN A BESOIN.
 *
 * ⛔ L'APPELANT PASSE LES MANGEURS, ON NE LES DÉDUIT PAS. Solo, c'est la bouche
 * unique; à N ≥ 2 c'est `eatersByDish(...).fedByDish[i]` — la même liste que le
 * reste du moteur, appelée et pas recopiée. Une seconde idée de « qui mange ce
 * plat » finirait par contredire la première, et c'est la dette que ce dépôt a
 * déjà payée quatre fois.
 *
 * La clé `""` désigne le FRAIS du plat: il est une unité comme une autre (voir
 * `Repairability`), et lui donner une clé le fait passer par la même règle.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potRepairability(args: {
  dishes: readonly {
    eaters: ReadonlySet<string>;
    uses: readonly { preparationId?: string | null }[];
    /** Le verdict de CHAQUE mangeur sur CE plat. */
    verdicts: ReadonlyMap<string, SizingVerdict>;
  }[];
}): Map<
  string,
  { eaters: Set<string>; needs: Map<string, Set<RepairDirection>> }
> {
  const out = new Map<
    string,
    { eaters: Set<string>; needs: Map<string, Set<RepairDirection>> }
  >();
  const unit = (id: string) => {
    const found = out.get(id);
    if (found) return found;
    const fresh = {
      eaters: new Set<string>(),
      needs: new Map<string, Set<RepairDirection>>(),
    };
    out.set(id, fresh);
    return fresh;
  };
  for (const dish of args.dishes) {
    const ids = [
      ...new Set(
        dish.uses
          .map((u) => String(u.preparationId ?? ""))
          .filter((x) => x.length > 0),
      ),
    ];
    for (const id of ids) {
      const u = unit(id);
      absorbDishInto(u, dish);
    }
  }
  return out;
}

/**
 * CETTE UNITÉ PEUT-ELLE ÊTRE RÉÉCRITE DANS CETTE DIRECTION ?
 *
 * ⛔ IL FAUT QUE **CHAQUE** MANGEUR EN AIT BESOIN, et c'est la décision produit
 * du 2026-09-08. « Au moins un dépasse son plafond ⇒ on densifie » densifie
 * aussi l'assiette de celui qui était dans ses bornes: on répare quelqu'un en
 * cassant son voisin, et le voisin ne le saura jamais — sa boîte est juste plus
 * riche. Quand les mangeurs divergent, la casserole est GELÉE, et celui qui
 * reste hors bornes reçoit un plat à lui (voir `dedicatedRepairFor`).
 *
 * ⚠️ « BESOIN DE D » N'EST PAS « PAS BESOIN DU CONTRAIRE ». Un mangeur dans ses
 * bornes n'a besoin de RIEN: il compte comme dissident. Sans ça, la règle se
 * réduirait à « personne ne veut l'inverse », qui est presque toujours vrai.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairabilityOf(
  unit: {
    eaters: ReadonlySet<string>;
    needs: ReadonlyMap<string, ReadonlySet<RepairDirection>>;
  },
  direction: RepairDirection,
): { repairability: Repairability; dissenting: number } {
  let dissenting = 0;
  for (const eater of unit.eaters) {
    if (!(unit.needs.get(eater)?.has(direction) ?? false)) dissenting += 1;
  }
  return {
    repairability: dissenting === 0 && unit.eaters.size > 0
      ? "reworkable"
      : "frozen",
    dissenting,
  };
}

/**
 * QUELLE PART DE LA NOURRITURE D'UN PLAT DOIT SURVIVRE À SA RÉPARATION.
 *
 * ⛔ PLUS DE LA MOITIÉ DE SA MASSE — pas de ses termes, et la différence est
 * tout le lot. Écrite en comptant les TERMES, cette garde refusait la bonne
 * réparation autant que la mauvaise, et c'est un test qui l'a dit avant qu'un
 * run ne le fasse:
 *
 *     « poulet, riz, tomate, concombre » → « poulet, riz, laitue, avocat »
 *     2 termes sur 4 survivent = la moitié exactement, donc REFUSÉ.
 *
 * Or le poulet et le riz SONT ce plat; la tomate et le concombre en sont la
 * garniture — et c'est très exactement la garniture qu'on avait demandé de
 * remplacer (« moins de légume aqueux »). Compter les termes donne le même
 * poids à un blanc de poulet et à une rondelle de concombre.
 *
 * ⚠️ LA MASSE, ELLE, DIT LE BON MOT: sur ce plat, poulet + riz pèsent bien plus
 * que la moitié. Sur le remplacement mesuré au même jour — « poulet, quinoa,
 * légumes, feta » → « thon, haricots blancs, pain, avocat » — rien ne survit,
 * ni en termes ni en grammes.
 *
 * ⛔ ET CE N'EST PAS UN MATCHER MAISON. L'appariement est une INTERSECTION
 * EXACTE sur les jetons du modèle, passés par `normalizeTerm` — le normaliseur
 * du produit, celui qui résout déjà chaque ingrédient. Les grammes viennent de
 * `weighedReadyGrams`, l'arithmétique du moteur. Aucune similarité, aucune
 * distance, aucun mot deviné: « laitue » ne compte jamais pour « lait ».
 */
export const REPAIR_MIN_MASS_SURVIVAL = 0.5;

/**
 * LE PLAT RÉPARÉ EST-IL ENCORE LE MÊME PLAT ?
 *
 * ⛔ LA LISTE COMPARÉE EST CELLE QU'ON A NOMMÉE AU MODÈLE. `repairInstruction`
 * lui rend ses propres aliments (« Its ingredients, to be re-proportioned: … »)
 * et cette garde vérifie qu'ils sont revenus. La promesse et le contrôle lisent
 * la MÊME liste — c'est ce qui empêche de demander une chose et d'en vérifier
 * une autre.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairIdentityHeld(args: {
  /** Les ingrédients d'AVANT, avec leur masse servie. */
  before: readonly { term: string; grams: number }[];
  /** Les termes rendus par la relance — leur masse n'entre pas dans le verdict. */
  after: readonly string[];
}): { held: boolean; survivedGrams: number; ofGrams: number } {
  const after = new Set(
    args.after.map(normalizeTerm).filter((t) => t.length > 0),
  );
  let ofGrams = 0;
  let survivedGrams = 0;
  for (const b of args.before) {
    const t = normalizeTerm(b.term);
    if (t.length === 0 || !(b.grams > 0)) continue;
    ofGrams += b.grams;
    if (after.has(t)) survivedGrams += b.grams;
  }
  // ⚠️ UN PLAT DONT AUCUN INGRÉDIENT NE SE PÈSE NE PEUT PAS ÊTRE JUGÉ. On
  // REFUSE — le repli est l'abstention, et un plat non jugeable qu'on
  // accepterait serait la porte grande ouverte à un remplacement.
  if (ofGrams <= 0) return { held: false, survivedGrams: 0, ofGrams: 0 };
  return {
    held: survivedGrams / ofGrams > REPAIR_MIN_MASS_SURVIVAL,
    survivedGrams: Math.round(survivedGrams),
    ofGrams: Math.round(ofGrams),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ LE PLAT DÉDIÉ — quand tout ce que la bouche mange est gelé (2026-09-08)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ IL NE SE DÉCLENCHE JAMAIS À UNE BOUCHE, ET C'EST STRUCTUREL. Une bouche
// seule ne contredit personne: `repairabilityOf` rend `reworkable` sur chaque
// unité de son plat, donc il y a toujours quelque chose à réécrire. Ce bloc est
// écrit ici, avec ses tests, parce que la RÈGLE des mangeurs est décidée ici —
// et parce qu'une décision qui vit dans la tête de celui qui l'a prise se perd.
// Son CÂBLAGE appartient à la lane du foyer (lot 14 du plan foyer): il demande
// que la bouche soit dans `dishBearerIds` (sans quoi le parseur refuse
// `for_member_id`) et que la fusion ne perde pas le plat dédié de la case.
//
// ── LA SYMÉTRIE N'EST PAS DÉCORATIVE ──────────────────────────────────────
// « Trop dense » et « trop maigre » ne sont pas l'un le cas normal et l'autre
// l'exception. Un plat riche servi à quelqu'un qui perd du poids passe SOUS son
// plancher d'assiette — sa part de ce plat tient dans trois cuillères — et il a
// besoin de volume, exactement comme l'autre a besoin de densité. Le même
// mécanisme, en miroir.

/** Ce qu'on demande au modèle d'ajouter, pour une bouche et un moment. */
export interface DedicatedRepair {
  memberId: string;
  day: string;
  slot: string;
  direction: RepairDirection;
  /** La densité que ce plat À ELLE doit porter. */
  aimPer100G: number;
  /** Plancher d\'une demande « alléger » (voir `RepairAsk.floorPer100G`) ; `null` en densify. */
  floorPer100G: number | null;
}

/**
 * COMBIEN D'ENTRÉES DE DERNIER RECOURS PAR PLAN, AU PLUS.
 *
 * ⛔ ÉPINGLÉ. C'est UN appel modèle de plus par plan quand il se déclenche —
 * quel que soit le nombre d'entrées demandées — et il ne se déclenche que pour
 * les BLOQUÉS, ceux qu'aucune réécriture ne pouvait servir. Au-delà, on compte
 * (`skipped_budget`).
 *
 * ⟳ 2026-09-09 — DE DEUX À QUATRE. Mesuré au tir COMP2 (cinq bouches, un
 * jour) : quatre bloqués sur le plan final — deux « trop petit » au
 * petit-déjeuner, deux « trop gros » (1 021 g, 879 g) pour l'adulte en prise —
 * et le budget de deux servait les premiers dans l'ordre des plats. Depuis que
 * l'entrée COMPLÈTE la part rabotée, une entrée par bloqué est la réponse
 * juste, et elle ne coûte pas un appel de plus.
 */
export const DEDICATED_REPAIR_MAX_PER_PLAN = 4;

/**
 * FAUT-IL UN PLAT À ELLE ? — seulement si tout le reste est gelé.
 *
 * ⛔ « TOUT », C'EST LE FRAIS **ET** CHAQUE CASSEROLE. Tant qu'une seule unité
 * bouge, on répare la recette: ajouter un plat pendant qu'on pouvait réécrire
 * celui qui existe fait deux plats là où la personne en attendait un, et le
 * second n'a été demandé par personne.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dedicatedRepairFor(args: {
  memberId: string;
  day: string;
  slot: string;
  ask: RepairAsk;
  freshRepairability: Repairability;
  pots: readonly { id: string; repairability: Repairability }[];
}): DedicatedRepair | null {
  if (args.freshRepairability === "reworkable") return null;
  if (args.pots.some((p) => p.repairability === "reworkable")) return null;
  return {
    memberId: args.memberId,
    day: args.day,
    slot: args.slot,
    direction: args.ask.direction,
    aimPer100G: args.ask.aimPer100G,
    floorPer100G: args.ask.floorPer100G,
  };
}

/**
 * CE QU'ON DEMANDE AU MODÈLE — un plat de plus, au nom de quelqu'un.
 *
 * ⛔ AUCUN PRÉNOM, AUCUNE CIBLE DE JOURNÉE, AUCUN KG. Le `for_member_id` est un
 * identifiant, pas une personne: le modèle n'apprend rien de qui il nourrit. La
 * seule grandeur qui sort est la densité, qui est une propriété du plat — même
 * règle que `repairInstruction`, et un test la lit.
 *
 * ⚠️ ON NOMME DES ALIMENTS, PAS UNE CONSIGNE ABSTRAITE. « Rends ce plat dense »
 * a déjà été mesuré comme insuffisant le 2026-09-07: le modèle obéit dans le bon
 * sens et s'arrête à mi-chemin. « Des noix, du fromage, de l'huile, du pain »
 * lui donne des ordres de grandeur qu'il connaît.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dedicatedDishInstruction(
  asks: readonly DedicatedRepair[],
): string | null {
  if (asks.length === 0) return null;
  return [
    ...DEDICATED_DISH_HEAD,
    ...asks.map(dedicatedDishLine),
  ].join("\n");
}

/**
 * L'EN-TÊTE D'UNE DEMANDE DE COMPLÉMENT — et elle ne porte AUCUN ordre global.
 *
 * ⟳ 2026-09-13 · LOT 1 — DEUX LIGNES ONT ÉTÉ RETIRÉES D'ICI, et elles sont
 * archivées dans la requête `perte-h4n4` du 2026-09-11 :
 *
 *   · « ⛔ Do not touch any other dish, any preparation, or anyone else's
 *     plate. » — FAUX dès que le périmètre du même appel ouvre sept repas et
 *     quatre créations. Le modèle devait choisir laquelle des deux consignes
 *     appliquer ;
 *   · « Return the full plan JSON with only these dishes added. » — un SECOND
 *     schéma de sortie, à côté de `{"repair":{…}}`. Un seul endroit décide de
 *     la forme de la réponse : `REPAIR_PATCH_SCHEMA_LINES` (système) et
 *     `repairPatchScopeLines()` (utilisateur).
 *
 * ⚠️ CE QUI RESTE EST LOCAL, ET C'EST LA CONTRAINTE VRAIE : les casseroles
 * partagées ne bougent pas, parce que d'autres bouches en mangent.
 */
export const DEDICATED_DISH_HEAD: readonly string[] = [
  "ONE PERSON CANNOT BE SERVED FROM THE SHARED POTS ALONE. The pots are eaten",
  "by others too, so they stay as they are — give that person a side dish of",
  "their own, eaten WITH the shared dish:",
];

/**
 * LA DEMANDE D'**UNE** BOUCHE, À **UN** MOMENT.
 *
 * ⟳ 2026-09-09 — UN COMPLÉMENT, PAS UN REMPLACEMENT. La personne GARDE le plat
 * partagé : le moteur rabote sa part à la borne et dimensionne ce plat-ci à la
 * différence (`splitPlateWithComplement`). Le texte le dit au modèle pour qu'il
 * écrive une entrée, pas un repas — mesuré avant : « beside the shared dish »
 * seul rendait des plats entiers, et le moteur retirait la personne de la table.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dedicatedDishLine(a: DedicatedRepair): string {
  return a.direction === "densify"
    ? `- On ${a.day} at ${a.slot}, add ONE small side dish with for_member_id ` +
      `"${a.memberId}". That person keeps eating the ` +
      `shared dish: the app cuts their share of it and sizes this side dish to ` +
      `the difference. It has to carry at least ${a.aimPer100G} kcal per 100 g ` +
      `as served: nuts, cheese, oil, bread, a spoon of nut butter — small and rich.`
    : `- On ${a.day} at ${a.slot}, add ONE side dish with for_member_id ` +
      `"${a.memberId}". That person keeps eating the ` +
      `shared dish: the app cuts their share of it and sizes this side dish to ` +
      `the difference. ` +
      (a.floorPer100G === null
        ? `It has to stay at or under ${a.aimPer100G} kcal per 100 g as served — `
        : `It has to land between ${a.floorPer100G} and ${a.aimPer100G} kcal per 100 g as served — `) +
      `bulky and light (vegetables, a salad, a soup WITH something in it).` +
      (a.floorPer100G === null
        ? ""
        : ` Below ${a.floorPer100G} the plate becomes enormous.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑬ LE COMPLÉMENT — raboter la part gelée à la borne, l'entrée porte le reste
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-09 — DÉCISION DU PROPRIÉTAIRE : « dans le cas où tout est gelé,
// on diminue la portion et on ajoute de la calorie dans l'entrée ». Avant, la
// table ne rabotait JAMAIS (`served_over_max` compté, rien de fait) et le plat
// ajouté REMPLAÇAIT l'assiette partagée (`mouthsFedByDish` retirait la personne
// de la table), dimensionné à sa cible ENTIÈRE : « une petite entrée riche » de
// 700 kcal, ou un bouillon accepté parce qu'il ne dégradait rien.
//
// ⛔ DEUX INCONNUES, DEUX ÉQUATIONS, ET RIEN D'AUTRE. Pour une personne dont la
// part du plat partagé (densité ρs) sort de sa borne, et un complément de
// densité ρc :
//
//     masse   : gS + gC = borne         (max si trop gros, min si trop petit)
//     énergie : gS·ρs + gC·ρc = cible
//
//     ⇒ gC = (cible − borne·ρs) ÷ (ρc − ρs),   gS = borne − gC
//
// Trop gros ⇒ le numérateur est positif, donc il faut ρc > ρs (plus dense) ;
// trop petit ⇒ négatif, donc ρc < ρs (plus léger). Un complément du mauvais
// côté, ou qui prendrait toute l'assiette (gC ≥ borne), ne résout rien : on
// rend `null`, l'appelant retire le plat et le compte. Pas de « presque ».

/**
 * LA PART DE L'ASSIETTE QUE LE COMPLÉMENT PEUT PRENDRE, quand le modèle atteint
 * exactement la densité demandée — c'est ce qui fait une ENTRÉE et pas un
 * second plat. 0,2 × 700 g = 140 g de pain-fromage à côté de 560 g de plat.
 *
 * ⚠️ C'EST LA DEMANDE, PAS UNE BORNE : plus dense que demandé ⇒ plus petit ;
 * moins dense ⇒ plus gros, tant que `splitPlateWithComplement` résout.
 */
export const COMPLEMENT_PLATE_SHARE = 0.2;

/**
 * LA DENSITÉ À DEMANDER POUR UN COMPLÉMENT — celle qui lui donne
 * `COMPLEMENT_PLATE_SHARE` de l'assiette.
 *
 * ⛔ CE N'EST PAS `repairDecisionForDish` SUR UNE LIGNE : celle-là rend la
 * densité qu'il faudrait à l'ASSIETTE ENTIÈRE (cible ÷ plafond), ce qui, pour
 * un complément, donne un plat qui déplace la moitié de la table. Ici :
 *
 *     trop gros  : ρc = ρs + (cible − max·ρs) ÷ (part·max)
 *     trop petit : ρc = ρs ÷ 2   (⇒ gC = 2 × la masse qui manque)
 *
 * Ni cible, ni borne, ni prénom ne sortent : une densité, propriété du plat.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function complementAskFor(args: {
  shared: StandardPortion;
  targetKcal: number | null;
  bounds: PlateBounds;
  verdict: SizingVerdict;
}): RepairAsk | null {
  const { shared, targetKcal, bounds, verdict } = args;
  if (targetKcal === null || !(targetKcal > 0)) return null;
  if (shared.densityPer100G === null || !(shared.densityPer100G > 0)) {
    return null;
  }
  const rhoS = shared.densityPer100G / 100;
  const current = Math.round(shared.densityPer100G);
  if (verdict === "over_max") {
    const missing = targetKcal - bounds.max * rhoS;
    if (!(missing > 0)) return null;
    const rhoC = rhoS + missing / (COMPLEMENT_PLATE_SHARE * bounds.max);
    return {
      direction: "densify",
      currentPer100G: current,
      floorPer100G: null,
      // ⛔ UN COMPLÉMENT N'A PAS DE COULOIR, et c'est structurel: sa densité
      // sort d'une ÉQUATION à deux inconnues (masse totale = borne, énergie
      // totale = cible), pas d'un intervalle de plausibilité. Lui poser un
      // plafond de couloir demanderait « entre A et B » là où une seule valeur
      // résout — et un modèle à qui on donne une bande vise le milieu.
      ceilingPer100G: null,
      aimPer100G: Math.ceil(rhoC * 100),
    };
  }
  if (verdict === "under_min") {
    const excess = bounds.min * rhoS - targetKcal;
    if (!(excess > 0)) return null;
    return {
      direction: "lighten",
      currentPer100G: current,
      floorPer100G: null,
      ceilingPer100G: null,
      aimPer100G: Math.max(1, Math.floor(shared.densityPer100G / 2)),
    };
  }
  return null;
}

export interface PlateSplit {
  /** Le facteur de la personne sur le plat partagé, raboté. */
  sharedFactor: number;
  /** Le facteur de la personne sur le complément. */
  complementFactor: number;
  sharedG: number;
  complementG: number;
  /** Ce que le complément porte, en kcal — ce que le rabotage a retiré. */
  complementKcal: number;
  bound: "max" | "min";
}

/**
 * RABOTER LA PART PARTAGÉE À LA BORNE, ET FAIRE PORTER LE RESTE AU COMPLÉMENT.
 *
 * Voir le pavé ⑬. `null` quand il n'y a rien à compléter (`in_bounds`,
 * `unmeasurable`), quand une masse ou une énergie manque, ou quand le
 * complément ne peut pas résoudre (mauvais côté, ou toute l'assiette).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function splitPlateWithComplement(args: {
  shared: StandardPortion;
  complement: StandardPortion;
  targetKcal: number | null;
  bounds: PlateBounds;
  verdict: SizingVerdict;
}): PlateSplit | null {
  const { shared, complement, targetKcal, bounds, verdict } = args;
  if (verdict !== "over_max" && verdict !== "under_min") return null;
  if (targetKcal === null || !(targetKcal > 0)) return null;
  const S = { kcal: shared.kcal, g: shared.cookedG };
  const C = { kcal: complement.kcal, g: complement.cookedG };
  if (S.kcal === null || S.g === null || !(S.kcal > 0) || !(S.g > 0)) {
    return null;
  }
  if (C.kcal === null || C.g === null || !(C.kcal > 0) || !(C.g > 0)) {
    return null;
  }
  const rhoS = S.kcal / S.g;
  const rhoC = C.kcal / C.g;
  const bound = verdict === "over_max" ? bounds.max : bounds.min;
  const denom = rhoC - rhoS;
  if (Math.abs(denom) < 1e-9) return null;
  const gC = (targetKcal - bound * rhoS) / denom;
  if (!(gC > 0) || !(gC < bound)) return null;
  const gS = bound - gC;
  return {
    sharedFactor: gS / S.g,
    complementFactor: gC / C.g,
    sharedG: Math.round(gS),
    complementG: Math.round(gC),
    complementKcal: Math.round(gC * rhoC),
    bound: verdict === "over_max" ? "max" : "min",
  };
}

/**
 * ABSORBER UN INDEX RÉPARÉ DANS L'INDEX VIVANT — en place, sans réassigner.
 *
 * ⟳ 2026-09-09 — L'entrée de dernier recours passe par le sas de remplissage
 * APRÈS que la lane a fermé `composition` dans une dizaine de fermetures
 * (`shadowSizing`, les demandes). Réassigner la variable ferait perdre son
 * rétrécissement à toutes ces fermetures (le compilateur le refuse, à juste
 * titre : une fermeture créée avant une réassignation ne peut plus supposer
 * `non null`). On copie donc les entrées NEUVES dans les tables existantes.
 *
 * ⚠️ `ReadonlyMap` est le contrat de LECTURE ; l'objet est un `Map` construit
 * par `buildCompositionIndex`. Le seul écrivain est ici, et il n'ajoute jamais
 * une entrée qui écraserait une entrée présente.
 *
 * PURE hors de la mutation demandée: no I/O, no clock, no randomness.
 */
export function absorbIndexInto(
  target: CompositionIndex,
  source: CompositionIndex,
): { slugs_added: number; aliases_added: number } {
  const bySlug = target.bySlug as Map<string, CompositionRef>;
  const byAlias = target.byAlias as Map<string, string>;
  let slugsAdded = 0;
  let aliasesAdded = 0;
  for (const [slug, ref] of source.bySlug) {
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, ref);
    slugsAdded++;
  }
  for (const [alias, slug] of source.byAlias) {
    if (byAlias.has(alias) || !bySlug.has(slug)) continue;
    byAlias.set(alias, slug);
    aliasesAdded++;
  }
  return { slugs_added: slugsAdded, aliases_added: aliasesAdded };
}
