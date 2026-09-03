/**
 * CE QU'ON PREND À CÔTÉ DU PLAT, ET QUE LE PLAN NE COMPOSE PAS. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE REMPLACE `composedDishShare`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'au 2026-09-01, ce que quelqu'un prenait à côté du plat était TROIS
 * BOOLÉENS PAR PERSONNE (`takes_dessert / cheese / bread`), transformés en un
 * ratio unique appliqué à la JOURNÉE ENTIÈRE:
 *
 *     raw = target × coverage × composedDishShare(structure) / delivered
 *                               ↑ un scalaire, pour tous les moments
 *
 * Deux choses y étaient fausses.
 *
 * ── ① ON NE SAVAIT PAS DE QUEL REPAS ON PARLAIT ───────────────────────────
 * « Je prends du pain » ne dit pas si c'est le midi, le soir, ou les deux. Le
 * même ratio partait sur les six moments.
 *
 * ── ② LE PETIT-DÉJEUNER ÉTAIT AMPUTÉ D'UNE CONVENTION DE DÎNER ────────────
 * `COMPOSED_DISH_MEAL_SHARE = 0,42` décrit un DÎNER FRANÇAIS: entrée, plat,
 * pain, fromage, dessert. Appliqué au petit-déjeuner et aux collations — que le
 * plan compose ENTIÈREMENT —, il retirait 58 % d'une cible que rien ne venait
 * compléter à côté.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA RÈGLE, ET ELLE TIENT EN UNE PHRASE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sur le **déjeuner et le dîner**, le plan compose LE PLAT et les extras sont à
 * côté: il faut donc les retrancher. Sur les autres moments, le plan compose
 * TOUT ce que la personne a déclaré (« chocolat chaud + tartines l'après-midi »
 * devient le contenu du moment): il n'y a rien à retrancher.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ AUCUN KCAL N'EST ÉCRIT ICI — ILS SONT DÉRIVÉS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `MEAL_COMPONENT_KCAL` (dessert 120 / fromage 120 / pain 80) était une
 * convention ASSUMÉE, et son propre commentaire disait pourquoi elle tenait:
 * « les trois nombres se simplifient dans le rapport — seul leur ordre de
 * grandeur relatif compte ». C'était vrai d'un RATIO.
 *
 * Un forfait, lui, est retranché EN VALEUR ABSOLUE. L'argument meurt avec le
 * ratio, et les nombres se mettraient à mentir. On lit donc le référentiel
 * vivant (CIQUAL) au lieu de les réécrire: `energyKcal` ET les macros, celles
 * que l'algorithme lit pour dimensionner.
 *
 * ⚠️ IL RESTE UNE CONVENTION, ET ELLE EST NOMMÉE: quel ALIMENT représente la
 * catégorie, et en quelle QUANTITÉ. On ne peut pas demander son grammage de
 * comté à quelqu'un qui coche « fromage » — ce serait rendre la question plus
 * chère que la réponse. La convention est donc ici, en un seul endroit,
 * révisable, et elle préfère TOUJOURS le référentiel quand il porte déjà un
 * poids unitaire (`unitGrams`).
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  type CompositionIndex,
  type CompositionRef,
  type Nutrients,
  type NutrientsOrUnknown,
  nutrientsOf,
  resolveIngredient,
} from "./food_composition.ts";

/**
 * LES CINQ EXTRAS, LISTE FERMÉE.
 *
 * ⚠️ `bread` EN FAIT PARTIE, ET C'EST UN RETOUR SUR LA TABLE DU 2026-08-21.
 * Celle-ci rangeait le pain avec l'entrée du côté COMPOSÉ (« il est dans ce
 * qu'on sert »), et le fromage et le dessert du côté forfaitaire. Décision du
 * 2026-09-01: les cinq se comportent pareil. Le motif est de lisibilité — une
 * bulle « + pain » qui ne ferait pas la même chose que ses quatre voisines
 * serait une règle que personne ne peut deviner à l'écran.
 *
 * ⛔ CETTE PHRASE REMPLACE LA TABLE DU 21, elle ne s'ajoute pas à côté: deux
 * consignes opposées dans le même dépôt se résolvent toujours en faveur de
 * celle que le lecteur trouve en premier.
 */
export const MEAL_EXTRAS = [
  "bread",
  "cheese",
  "yoghurt",
  "fruit",
  "dessert",
] as const;
export type MealExtra = (typeof MEAL_EXTRAS)[number];

/**
 * LES MOMENTS QUI PORTENT DES EXTRAS.
 *
 * ⛔ DEUX, ET PAS SIX. Sur les autres, le plan compose ce que la personne a
 * déclaré: retrancher quoi que ce soit y compterait deux fois. C'est très
 * exactement le défaut ② que ce module ferme — la convention du dîner
 * appliquée au petit-déjeuner.
 */
export const EXTRA_BEARING_SLOTS = ["lunch", "dinner"] as const;
export type ExtraBearingSlot = (typeof EXTRA_BEARING_SLOTS)[number];

/**
 * D'OÙ VIENT CE QU'UNE BOUCHE PREND À CÔTÉ — LE COMPTEUR DE MIGRATION.
 *
 * ⚠️ CE N'EST PAS `MEAL_STRUCTURE_STATES`, ET LES DEUX SONT NÉCESSAIRES.
 * Celui-là dit ce que la fiche a RÉPONDU (`answered` / `partial` / …); celui-ci
 * dit QUELLE COLONNE a fourni la réponse. Une bouche peut être `answered` en
 * étant encore entièrement portée par les trois booléens par personne — et
 * c'est très exactement ce qu'un seul histogramme rendrait invisible.
 *
 * ⛔ IL EXISTE PARCE QUE `takes_bread / takes_cheese / takes_dessert` SURVIVENT
 * À CE LOT. Les supprimer est une migration à part, et elle n'est légitime que
 * le jour où `legacy_booleans` ET `mixed` valent zéro sur la population. Sans
 * ce compte, on supprimerait les colonnes sous quelqu'un — ou, plus probable,
 * on ne les supprimerait jamais faute de savoir.
 *
 *   · `per_slot`        — les deux moments viennent de la fiche par moment.
 *   · `legacy_booleans` — aucun; tout vient des trois booléens reportés.
 *   · `mixed`           — un moment de chaque source. C'EST LE CAS QUI INTERDIT
 *                         de trancher trop tôt: il prouve qu'une bouche peut
 *                         avoir migré à moitié.
 *   · `none`            — ni l'un ni l'autre: la question n'a pas été posée.
 */
export const MEAL_EXTRAS_SOURCES = [
  "per_slot",
  "legacy_booleans",
  "mixed",
  "none",
] as const;
export type MealExtrasSource = (typeof MEAL_EXTRAS_SOURCES)[number];

export function slotBearsExtras(slot: string): boolean {
  return (EXTRA_BEARING_SLOTS as readonly string[]).includes(slot);
}

/**
 * L'ALIMENT QUI REPRÉSENTE CHAQUE CATÉGORIE, ET SA PORTION.
 *
 * ⚠️ `grams` N'EST LU QUE SI LE RÉFÉRENTIEL N'A PAS DE `unitGrams`. Quand il en
 * a un (`white_bread` 40 g, `apple` 150 g), c'est LUI qui gagne: une convention
 * écrite ici et un poids écrit là-bas divergeraient au premier ajustement du
 * référentiel, et c'est celui qu'on regarde le moins qui garderait l'ancien.
 *
 * ⛔ POURQUOI CES ALIMENTS-LÀ, ET CE QUE ÇA COÛTE. Aucune des cinq catégories
 * n'a d'entrée « moyenne » au référentiel — il n'existe pas de `cheese`
 * générique, seulement du cheddar, de la feta, de la mozzarella. Choisir, c'est
 * donc arbitrer, et l'arbitrage est ici plutôt que dilué:
 *
 *   · `white_bread`  — le référentiel le décrit lui-même comme « the bread most
 *                      people are actually eating ».
 *   · `cheddar`      — un fromage à pâte dure ordinaire. Le camembert ou la
 *                      mozzarella descendraient le forfait de moitié; c'est la
 *                      direction qui sur-nourrit, donc on ne la prend pas.
 *   · `plain_yogurt` — nature, sans sucre: un yaourt sucré est un dessert, et
 *                      il a sa propre case.
 *   · `apple`        — le fruit le plus banal du référentiel, et il porte déjà
 *                      son poids unitaire.
 *   · `biscuits`     — « biscuit sec nature ». Le chocolat noir doublerait le
 *                      forfait, la glace à l'eau le diviserait par cinq.
 *
 * ⚠️ CES CINQ CHOIX SONT RÉVISABLES, ET C'EST LEUR SEULE PROPRIÉTÉ IMPORTANTE.
 * Ils vivent dans une table, pas dans une formule.
 */
export const EXTRA_PORTION: Readonly<
  Record<MealExtra, { slug: string; grams: number }>
> = Object.freeze({
  bread: { slug: "white_bread", grams: 40 },
  cheese: { slug: "cheddar", grams: 30 },
  yoghurt: { slug: "plain_yogurt", grams: 125 },
  fruit: { slug: "apple", grams: 150 },
  dessert: { slug: "biscuits", grams: 30 },
});

/**
 * CE QU'UN EXTRA APPORTE — kcal ET macros, lus au référentiel.
 *
 * `"unknown"` quand le référentiel ne connaît pas l'aliment. ⛔ ET SURTOUT PAS
 * ZÉRO: un forfait manquant laisse la cible entière et sur-nourrit un peu; un
 * forfait inventé à zéro affirme « cette personne ne prend rien », ce qui est
 * un fait faux. L'appelant COMPTE les inconnus — voir `extrasOf`.
 */
export function extraNutrients(
  index: CompositionIndex,
  extra: MealExtra,
): NutrientsOrUnknown {
  const portion = EXTRA_PORTION[extra];
  const ref: CompositionRef | null = resolveIngredient(index, portion.slug);
  if (ref === null) return "unknown";
  // ⚠️ LE POIDS DU RÉFÉRENTIEL GAGNE. Voir `EXTRA_PORTION`.
  const grams = ref.unitGrams !== null && ref.unitGrams > 0
    ? ref.unitGrams
    : portion.grams;
  return nutrientsOf([{ ref, gramsRaw: grams }]);
}

/** Ce qu'un moment porte à côté du plat, et ce qu'on n'a pas su lire. */
export interface ExtrasTotal {
  /** La somme, jamais `null`: un inconnu ne contribue pas, il se compte. */
  nutrients: Nutrients;
  /** Les extras que le référentiel n'a pas su résoudre. Seuil: zéro. */
  unresolved: MealExtra[];
}

/**
 * LA SOMME DES EXTRAS D'UN MOMENT.
 *
 * ⚠️ `unresolved` N'EST PAS DÉCORATIF. Sans lui, « personne n'a coché d'extra »
 * et « le référentiel n'a résolu aucun des cinq » rendent le même zéro — et le
 * second est une panne qui sur-nourrit en silence. C'est la cicatrice
 * « un compteur sans dénominateur ment », appliquée à une somme.
 *
 * ⛔ LES DOUBLONS SONT ÉCARTÉS: cocher deux fois « pain » ne retranche pas deux
 * pains. La liste vient d'une saisie d'écran, pas d'une garantie de base.
 */
export function extrasOf(
  index: CompositionIndex,
  extras: readonly MealExtra[],
): ExtrasTotal {
  const total: Nutrients = {
    energyKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
  };
  const unresolved: MealExtra[] = [];
  for (const extra of new Set(extras)) {
    const got = extraNutrients(index, extra);
    if (got === "unknown") {
      unresolved.push(extra);
      continue;
    }
    total.energyKcal += got.energyKcal;
    // ⚠️ `null` SE PROPAGE, il ne devient pas zéro. Une macro absente sur UN
    // aliment rend la somme inconnue pour cette macro — même règle que
    // `nutrientsOf`, à qui on ne peut pas mentir sur ce qu'on a lu.
    total.proteinG = sum(total.proteinG, got.proteinG);
    total.carbsG = sum(total.carbsG, got.carbsG);
    total.fatG = sum(total.fatG, got.fatG);
    total.fiberG = sum(total.fiberG, got.fiberG);
  }
  return { nutrients: total, unresolved };
}

function sum(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'ON RETRANCHE QUAND PERSONNE N'A RÉPONDU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE N'EST PAS ZÉRO, ET C'EST LE NOMBRE LE PLUS DANGEREUX DE CE MODULE.
 *
 * Une fiche muette ne dit pas « je ne prends rien à côté »: elle ne dit RIEN.
 * Retrancher zéro affirmerait que le plat porte 100 % du déjeuner — c'est-à-dire
 * multiplier la cible par 1/0,42 ≈ 2,4 pour toute la population qui n'a jamais
 * vu la question. C'est la cicatrice « coche auto = faits faux indémentables »,
 * dans le sens qui nourrit trop.
 *
 * On garde donc la convention d'hier, EXACTEMENT: un déjeuner ou un dîner non
 * renseigné vaut `1 − 0,42 = 58 %` d'extras. `COMPOSED_DISH_MEAL_SHARE` ne
 * meurt pas, elle change de rôle — de clé de répartition appliquée à la journée
 * entière, elle devient le repli d'UN moment non renseigné.
 *
 * ⚠️ ET C'EST CE QUI REND LE LOT SANS RÉGRESSION POUR LA FICHE MUETTE SUR SES
 * DEUX REPAS: le déjeuner et le dîner d'une fiche vide gardent leur part au
 * bit près. Ce qui change pour elle est le petit-déjeuner, qui cesse d'être
 * amputé d'une convention de dîner — c'est le défaut ② de l'en-tête, et c'est
 * voulu.
 */
export const UNANSWERED_EXTRAS_SHARE = 0.58;

/** Ce que la précédence a tranché, moment par moment, et d'où ça vient. */
export interface ResolvedExtras {
  /**
   * UNIQUEMENT LES MOMENTS QUI ONT UNE RÉPONSE. Un moment absent d'ici doit
   * rester absent du `SlotExtraKcal` construit derrière: c'est ce qui fait
   * replier `extrasKcalFor` sur `UNANSWERED_EXTRAS_SHARE`.
   */
  bySlot: Record<string, MealExtra[]>;
  source: MealExtrasSource;
}

/**
 * QUI GAGNE ENTRE LA FICHE PAR MOMENT ET LES TROIS BOOLÉENS PAR PERSONNE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ L'ARBITRAGE EST ICI, ET PAS DANS LE HANDLER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Il a trois règles, et chacune peut se prouver fausse par un test — ce qui
 * est exactement pourquoi elle ne peut pas vivre dans une closure de 6 000
 * lignes qu'aucun test n'atteint.
 *
 *   ① CE QUI EST DÉCLARÉ PAR MOMENT GAGNE, toujours. C'est la réponse la plus
 *     précise: elle sait de quel repas on parle, ce que les booléens ignorent.
 *   ② LE REPORT SE FAIT MOMENT PAR MOMENT, JAMAIS EN BLOC. Une bouche qui a
 *     répondu pour le dîner seul garde ses booléens au déjeuner. Écraser le
 *     déjeuner avec « pas renseigné » RETIRERAIT une réponse existante; le
 *     remplir avec les extras du dîner en INVENTERAIT une.
 *   ③ RIEN NI D'UN CÔTÉ NI DE L'AUTRE ⇒ LA CLÉ RESTE ABSENTE. Poser `[]` dirait
 *     « je ne prends rien à côté du plat », c'est-à-dire ×2,4 sur la cible de
 *     toute la population qu'on n'a jamais interrogée. C'est la cicatrice
 *     « coche auto = faits faux indémentables », dans le sens qui sur-nourrit.
 *
 * ⚠️ `carried` EST `null`, PAS `[]`, QUAND LA QUESTION N'A PAS ÉTÉ POSÉE. Les
 * trois booléens d'une fiche jamais interrogée valent `null` en base; les
 * aplatir en tableau vide ferait entrer cette fiche dans le chemin ② et lui
 * ferait dire non.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function resolveSlotExtras(input: {
  /** `household_member_habits.slots[].extras`, par moment. REQUIS — `{}` si rien. */
  declared: Record<string, MealExtra[]>;
  /**
   * Le report des trois booléens par personne, DÉJÀ mis en panier.
   * `null` = la question n'a jamais été posée à cette fiche.
   */
  carried: readonly MealExtra[] | null;
}): ResolvedExtras {
  const declared = input?.declared ?? {};
  const carried = input?.carried ?? null;
  const bySlot: Record<string, MealExtra[]> = {};
  let fromSlots = 0;
  let fromCarried = 0;
  for (const slot of EXTRA_BEARING_SLOTS) {
    if (Object.prototype.hasOwnProperty.call(declared, slot)) {
      bySlot[slot] = [...declared[slot]];
      fromSlots += 1;
    } else if (carried !== null) {
      bySlot[slot] = [...carried];
      fromCarried += 1;
    }
  }
  const source: MealExtrasSource = fromSlots > 0 && fromCarried > 0
    ? "mixed"
    : fromSlots > 0
    ? "per_slot"
    : fromCarried > 0
    ? "legacy_booleans"
    : "none";
  return { bySlot, source };
}
