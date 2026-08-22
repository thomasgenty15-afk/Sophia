/**
 * LES DEUX FENÊTRES DE CONSERVATION. PUR.
 *
 * Lot `L0-a` du plan de mise en œuvre (2026-08-22).
 * Décision produit n° 14 du 2026-08-21 : **conservation = jour de cuisson + 2**.
 * Cuit vendredi ⇒ mangé vendredi, samedi, dimanche. Lundi est trop tard.
 *
 * ── IL Y A DEUX FENÊTRES, ET ELLES SE CHAÎNENT ───────────────────────────
 *
 *     achat ──[ FENÊTRE CRUE ]──► cuisson ──[ FENÊTRE CUITE ]──► dernière part
 *
 * `MAX_FRIDGE_DAYS` (dans `meal_generation.ts`) ne couvre que la SECONDE.
 * La première n'avait, jusqu'à ce lot, **aucune constante, aucune colonne,
 * aucun lecteur** — et elle a été mesurée sur le cas 04 : le poulet attendait
 * **trois jours cru**, alors qu'une volaille fraîche tient un à deux jours.
 * Le plan était déclaré valide et il ne l'était pas.
 *
 * ── POURQUOI CE MODULE EXISTE, PLUTÔT QU'UNE LIGNE DANS `meal_generation` ─
 * Parce que les deux fenêtres ont DEUX lecteurs qui ne se voient pas : le
 * parseur du plan (la fenêtre cuite, qui REFUSE un plat) et les vagues de
 * courses (la fenêtre crue, qui décide la DATE D'ACHAT). Écrire la règle aux
 * deux endroits, c'est la divergence en attente que ce dépôt paie en boucle —
 * « deux copies d'un même nombre divergent, et c'est celle qu'on regarde le
 * moins qui garde l'ancienne ».
 *
 * ⛔ CE MODULE NE DÉFINIT PAS `MAX_FRIDGE_DAYS`. Elle vit dans
 * `meal_generation.ts` depuis l'origine et cinq fichiers la ré-exportent ou
 * l'importent (`grocery_waves.ts`, `accident.ts`, `accident_io.ts`,
 * `chat/accident_tap.ts`, `frontend/src/keel/api/groceryWaves.ts`). La
 * déplacer ici en créerait une SECONDE, le temps que les cinq suivent — soit
 * exactement le défaut qu'on répare. Elle est donc PASSÉE à
 * `cookedWindowVerdict`, et la valeur est épinglée par un littéral côté test.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// ① LA FENÊTRE CUITE — celle qui REFUSE
// ---------------------------------------------------------------------------

/**
 * Ce qu'on peut dire d'un couple (casserole, repas) une fois les deux situés
 * dans la fenêtre du plan.
 *
 * ⚠️ TROIS VERDICTS, PAS DEUX, et `not_evaluated` est le troisième au niveau
 * du compteur. Un booléen `ok`/`pas ok` rendrait le même « faux » pour « le
 * lot est trop vieux » et pour « on n'a pas su placer les deux jours » — et
 * c'est la seconde qui coûte le plus cher, parce qu'elle ressemble à une
 * fenêtre qui a tourné.
 */
export type CookedWindowVerdict = "before_cooking" | "within" | "too_late";

/**
 * Ce lot, cuisiné au rang `cookAt` de la fenêtre, tient-il jusqu'au rang
 * `eatAt` ?
 *
 * ⛔ LA COMPARAISON EST `>=`, ET C'ÉTAIT LE DÉFAUT ①. Écrite `>`, elle laissait
 * passer « cuit dimanche, mangé mercredi » : `MAX_FRIDGE_DAYS = 3` annonçait
 * trois jours de conservation et le code en accordait quatre. La constante
 * compte les JOURS OÙ ÇA SE MANGE, jour de cuisson inclus — trois jours, donc
 * un écart de 0, 1 ou 2. Un écart de 3 est dehors.
 *
 * @param maxFridgeDays `MAX_FRIDGE_DAYS`. Passée, jamais importée : voir
 *   l'en-tête. Le test l'épingle par un littéral, sinon il serait paramétré
 *   par sa propre constante et resterait vert quand on la change.
 */
export function cookedWindowVerdict(
  cookAt: number,
  eatAt: number,
  maxFridgeDays: number,
): CookedWindowVerdict {
  const gap = eatAt - cookAt;
  if (gap < 0) return "before_cooking";
  return gap >= maxFridgeDays ? "too_late" : "within";
}

/**
 * LES TROIS POPULATIONS DE LA FENÊTRE CUITE.
 *
 * ⛔ `within` N'EST PAS DÉCORATIF, c'est le point du lot. Sans lui, on ne
 * distingue pas « la fenêtre a tourné et rien n'a mordu » de « la fenêtre n'a
 * pas tourné » — les deux rendent `violations: 0`, et le second est un lot
 * désarmé qui ressemble à un lot qui marche.
 *
 * `not_evaluated` compte les couples dont un des deux jours n'a pas pu être
 * situé (jeton hors fenêtre ET hors calendrier). Son seuil est **zéro** : un
 * couple non évalué est un couple non gardé.
 *
 * ⚠️ Les occasions qui ne PUISENT dans aucune casserole n'entrent dans aucune
 * des trois : elles ne sont pas cuisinées à l'avance, la question ne se pose
 * pas pour elles. Sur cinq jours, cinq des quinze occasions sortent ainsi du
 * problème — les compter donnerait quinze là où dix sont en jeu.
 */
export interface FridgeWindowCounts {
  /** Couples refusés : le lot serait mangé au-delà de sa fenêtre. */
  violations: number;
  /** Couples évalués et tenus. */
  within: number;
  /** Couples dont un jour n'a pas pu être situé. Seuil : zéro. */
  not_evaluated: number;
}

export function emptyFridgeWindowCounts(): FridgeWindowCounts {
  return { violations: 0, within: 0, not_evaluated: 0 };
}

/**
 * `before_cooking` est compté à part par l'appelant (c'est une AUTRE règle,
 * « un lot mangé avant d'être cuisiné »), donc la somme des trois est le
 * nombre de couples que CETTE règle a regardés. Propriété testée.
 */
export function fridgeWindowChecked(counts: FridgeWindowCounts): number {
  return counts.violations + counts.within + counts.not_evaluated;
}

// ---------------------------------------------------------------------------
// ② LA FENÊTRE CRUE — celle qui décide la DATE D'ACHAT
// ---------------------------------------------------------------------------

/**
 * COMBIEN DE JOURS UN ALIMENT CRU PEUT ATTENDRE ENTRE L'ACHAT ET LA CUISSON.
 *
 * ── LE SENS, ÉCRIT UNE FOIS POUR TOUTES ─────────────────────────────────
 * C'est un ÉCART MAXIMAL, pas une durée de vie : `2` veut dire « acheté
 * lundi, cuisiné lundi, mardi ou mercredi ». `0` voudrait dire « le jour
 * même ». C'est exactement le sens qu'avait déjà `MAX_FRIDGE_DAYS` à
 * `grocery_waves.ts:211` (`earliest = cuisson − MAX_FRIDGE_DAYS`) : ce lot
 * remplace un nombre unique par un nombre PAR GROUPE, il ne change pas la
 * façon dont `:211` le lit.
 *
 * ── D'OÙ VIENNENT LES VALEURS ───────────────────────────────────────────
 * Des cinq familles écrites dans la fiche du lot — poisson ~1 j · volaille et
 * viande hachée ~2 j · viande en pièce ~3 j · légumes frais ~7 j · œufs, secs
 * et conserves ~très long — étendues aux trente groupes de `food_groups`.
 *
 * ⚠️ CE SONT DES ORDRES DE GRANDEUR ASSUMÉS, pas des mesures — même posture
 * que `YIELD_FACTORS` dans `food_composition.ts`, et elle est écrite pour que
 * personne ne les lise comme une donnée sourcée. Elles se révisent par une
 * migration `update` et un commit.
 *
 * ⚠️ AU-DELÀ DE SEPT, LA VALEUR NE MORD JAMAIS : une fenêtre de plan fait au
 * plus sept jours (`MAX_WINDOW_DAYS`), donc tout ce qui est « très long » est
 * écrit **21** — un seul nombre pour « ça ne contraint rien », plutôt que dix
 * valeurs inventées qu'on croirait mesurées.
 *
 * ⛔ CE TABLEAU EST LE MIROIR DE LA COLONNE `food_groups.raw_window_days`,
 * exactement comme `FOOD_GROUP_REFS` est le miroir du seed des trente lignes.
 * La base est la vérité ; ce tableau existe pour que le calcul soit testable
 * sans base et rejouable hors ligne sur les plans déjà écrits.
 */
export const RAW_WINDOW_DAYS: Readonly<Record<FoodGroupRef, number>> = {
  // ── PROTÉINES ANIMALES : la famille qui a motivé le lot ────────────────
  /** Poisson : le jour même ou le lendemain. */
  fatty_fish: 1,
  white_fish: 1,
  /** Coquillages et crustacés : la plus courte de toutes. */
  shellfish: 1,
  /** Volaille fraîche : un à deux jours. C'est le cas 04, mot pour mot. */
  poultry: 2,
  /** Viande maigre et hachée — le haché s'oxyde comme la volaille. */
  lean_protein: 2,
  /** Viande en pièce : trois jours, la valeur historique de `MAX_FRIDGE_DAYS`. */
  red_meat: 3,
  /** Œufs : plusieurs semaines. */
  eggs: 21,
  /** Tofu et tempeh : sous vide, DLC courte mais pas celle d'une chair. */
  tofu_tempeh: 5,
  /** Légumineuses sèches ou en conserve. */
  legumes: 21,

  // ── LAITAGES ───────────────────────────────────────────────────────────
  dairy_yogurt: 7,
  dairy_cheese: 14,

  // ── CÉRÉALES : sec, donc hors sujet ────────────────────────────────────
  whole_grain: 21,
  refined_grain: 21,

  // ── LÉGUMES : « frais ~7 j », sauf la feuille, qui est le cas fragile ──
  /** Salades et herbes : trois jours, et c'est déjà optimiste. */
  leafy_greens: 3,
  cruciferous_veg: 7,
  non_starchy_veg: 7,
  /** Pomme de terre, patate douce, courge : semaines, pas jours. */
  starchy_veg: 14,

  // ── FRUITS ─────────────────────────────────────────────────────────────
  /** Fruits rouges : aussi fragiles qu'une salade. */
  berries: 3,
  citrus: 14,
  other_fruit: 7,

  // ── MATIÈRES GRASSES ───────────────────────────────────────────────────
  nuts_seeds: 21,
  olive_oil: 21,
  /** Beurre, crème : semaines au froid. */
  other_added_fat: 14,

  // ── DISCRÉTIONNAIRE ────────────────────────────────────────────────────
  sauce_dressing: 21,
  sugar_sweets: 21,
  /** Un fritté ne se garde pas : il se mange le jour où il est fait. */
  fried_food: 1,

  // ── BOISSONS ───────────────────────────────────────────────────────────
  alcohol: 21,
  sweetened_beverage: 21,
  water: 21,
  coffee_tea: 21,
};

/**
 * VALEUR AU-DELÀ DE LAQUELLE LA FENÊTRE NE PEUT PLUS MORDRE dans un plan.
 * Exportée pour que le test le DISE au lieu de le supposer.
 */
export const RAW_WINDOW_NEVER_BINDS_FROM = 7;

/**
 * Combien de jours ce groupe peut attendre cru ? `null` quand le groupe est
 * inconnu — jamais un défaut silencieux.
 *
 * ⛔ `null` PLUTÔT QU'UN REPLI ICI. Le repli appartient à l'appelant, et il
 * doit le COMPTER : un défaut posé dans cette fonction rendrait « groupe
 * inconnu » et « groupe résolu » indiscernables chez tous les lecteurs à la
 * fois, ce qui est le mode d'échec n° 1 de ce dépôt.
 */
export function rawWindowDaysFor(group: string | null | undefined): number | null {
  if (!group) return null;
  const days = (RAW_WINDOW_DAYS as Record<string, number | undefined>)[group];
  return typeof days === "number" ? days : null;
}

/**
 * CE QUE LA FENÊTRE CRUE A RÉELLEMENT GOUVERNÉ, sur une liste de courses.
 *
 * ⛔ MÊME RAISON QUE `within` AU-DESSUS : sans `unknown_group`, une liste dont
 * aucun terme n'a de groupe rend exactement la même chose qu'une liste
 * parfaitement routée — c'est-à-dire une fenêtre crue branchée et désarmée,
 * sans un seul rouge.
 *
 * ⚠️ LE COMPTEUR LUI-MÊME VIT DANS `grocery_waves.ts`, avec `WaveItem`. Le
 * poser ici obligerait ce module à importer la forme d'un article — donc à
 * dépendre du fichier qui dépend de lui. Seule la FORME du résultat est ici,
 * parce qu'elle est la promesse, pas le calcul.
 */
export interface RawWindowCounts {
  /** Articles dont le groupe est connu et la fenêtre appliquée. */
  routed: number;
  /** Articles sans groupe : l'appelant est retombé sur son repli. */
  unknown_group: number;
}
