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
 * ⟳ 2026-09-04 — C'EST ZÉRO. LA DÉCISION D'AVANT EST RENVERSÉE, MESURE À L'APPUI.
 *
 * ── CE QUI ÉTAIT ÉCRIT ICI, ET POURQUOI ÇA NE TIENT PLUS ──────────────────
 * « Une fiche muette ne dit pas *je ne prends rien à côté*: elle ne dit RIEN.
 * Retrancher zéro affirmerait que le plat porte 100 % du déjeuner. » Le
 * raisonnement est juste en logique. Il suppose que le silence est RARE — que
 * la valeur par défaut arbitre quelques cas pendant que la population répond.
 *
 * ⛔ MESURÉ LE 2026-09-04, EN BASE: **4 bouches sur 143** ont déclaré un extra
 * au déjeuner ou au dîner. 97 % de la population reçoit donc ce « repli ».
 * Quand une valeur par défaut couvre 97 % des cas, elle n'arbitre plus une
 * incertitude: **elle EST le produit**, et sa prudence devient la règle.
 *
 * ── CE QUE 58 % VOULAIT DIRE DANS UNE ASSIETTE ────────────────────────────
 * Le retrait était un POURCENTAGE de la cible, donc il grandissait avec le
 * corps. Traduit en pain blanc (278 kcal/100 g), sur des cibles réelles:
 *
 *     adulte à 2 400 kcal/j  →  376 g de pain/jour supposés hors plan
 *     corps à 4 501 kcal/j   →  704 g/jour, dont 376 g au seul déjeuner
 *
 * Une baguette pèse 250 g. Le produit supposait qu'un adulte ordinaire mangeait
 * une baguette et demie par jour à côté de ses plats, sans le lui avoir
 * demandé — et près de trois pour un grand gabarit.
 *
 * ⛔ ET L'UNITÉ ÉTAIT L'ERREUR DE FOND. Un extra DÉCLARÉ vaut un nombre de kcal
 * (`extrasOf`, additionné sur pain + fromage + yaourt + fruit + dessert). Un
 * extra SUPPOSÉ valait une fraction du besoin. Du pain reste du pain: sa
 * quantité ne dépend pas du gabarit de qui le mange. En pourcentage, le
 * mécanisme faisait l'inverse de la réalité — **plus quelqu'un a besoin de
 * manger, plus on supposait qu'il mangeait ailleurs, donc moins on le servait.**
 *
 * ── CE QUE ZÉRO DIT, ET CE QU'IL NE DIT PAS ───────────────────────────────
 * Il ne dit pas « cette personne ne prend rien à côté ». Il dit **« le plan
 * porte ce qu'il promet de porter »**. Rien de déclaré ⇒ rien à retrancher:
 * c'est la promesse du produit, et c'est déjà, mot pour mot, ce que fait la
 * lane SOLO — elle n'a jamais lu ce module (zéro occurrence). Les deux lanes
 * servaient deux promesses différentes à la même personne selon qu'elle
 * cuisinait seule ou en foyer; elles n'en servent plus qu'une.
 *
 * ⚠️ CE QUI EST GARDÉ, ET C'EST L'ESSENTIEL: **une fiche qui A répondu garde
 * son retrait, au kcal près**. `extrasOf` somme les portions réelles du
 * référentiel, extra par extra. Le renversement ne touche QUE le silence.
 *
 * ⚠️ ET LE GARDE-FOU CONTRE L'ASSIETTE ABSURDE N'EST PAS CELUI-CI. C'est
 * `MEAL_MAX_GRAMS_PER_KG` (8 g/kg par repas, `mouth_anchor.ts`), qui borne une
 * masse et non une cible — il tenait déjà, indépendamment de ce nombre.
 *
 * ── LA DÉCISION DU PROPRIÉTAIRE, 2026-09-04 ──────────────────────────────
 * **Rien d'indiqué ⇒ rien de retiré.** Le plan promet de nourrir; il porte donc
 * ce qu'il promet tant que personne n'a dit le contraire.
 *
 * ⚠️ CE QUE ÇA DÉPLACE, ÉCRIT ICI POUR QUE PERSONNE NE LE REDÉCOUVRE. Le
 * propriétaire avait noté le 2026-08-20, et c'était vérifié: sur le plan servi
 * ce jour-là, **neuf plats sur neuf sont des plats principaux — aucun pain,
 * aucun fromage, aucun dessert**. Le modèle ne compose pas les à-côtés. Sans
 * retrait, la cible d'un repas repose donc entièrement sur le plat, et c'est le
 * plafond de masse (`MEAL_MAX_GRAMS_PER_KG`) qui borne l'assiette.
 *
 * ⇒ LA SUITE COHÉRENTE, si l'assiette gonfle: demander au modèle de composer le
 * repas ENTIER (pain, dessert compris) plutôt que le seul plat. C'est le lot
 * qui rend cette décision complète; ce module ne le fait pas.
 */


/**
 * CE QU'ON RETRANCHE À UN DÉJEUNER OU UN DÎNER NON RENSEIGNÉ : **RIEN**.
 *
 * ⛔ DÉCISION DU PROPRIÉTAIRE, 2026-09-04, ET ELLE EST SANS AMBIGUÏTÉ:
 * **rien d'indiqué ⇒ rien de retiré.** Le plan promet de nourrir; il porte donc
 * ce qu'il promet tant que personne n'a dit le contraire.
 *
 * ── CE QUI VIVAIT ICI, ET POURQUOI C'EST TOMBÉ ───────────────────────────
 * `UNANSWERED_EXTRAS_SHARE = 0,58`: une FRACTION de la cible, retranchée du
 * déjeuner et du dîner de qui n'avait rien déclaré. Deux défauts, mesurés:
 *
 *   ① **4 bouches sur 143** ont déclaré un extra à ces deux moments. Un
 *      « repli » qui couvre 97 % d'une population n'arbitre plus une
 *      incertitude — il EST le produit, et sa prudence devient la règle.
 *   ② **L'unité était fausse.** Un extra DÉCLARÉ vaut des kcal (`extrasOf`
 *      somme des portions réelles); un extra SUPPOSÉ valait une part du besoin.
 *      Du pain reste du pain. En pourcentage, plus quelqu'un avait besoin de
 *      manger, plus on supposait qu'il mangeait ailleurs — donc moins on le
 *      servait. Traduit: 376 g de pain/jour supposés hors plan pour un adulte à
 *      2 400 kcal, **704 g** pour un corps à 4 501. Une baguette pèse 250 g.
 *
 * ⚠️ CE QUI NE CHANGE PAS, ET C'EST L'ESSENTIEL: **une fiche qui A répondu garde
 * son retrait, au kcal près.** `extrasOf` somme pain + fromage + yaourt + fruit
 * + dessert sur des portions réelles du référentiel. Ce zéro ne touche QUE le
 * silence.
 *
 * ⚠️ ET CE QUE ÇA DÉPLACE, ÉCRIT POUR QUE PERSONNE NE LE REDÉCOUVRE. Le
 * propriétaire avait noté le 2026-08-20, vérifié: sur le plan servi ce jour-là,
 * **neuf plats sur neuf sont des plats principaux — aucun pain, aucun fromage,
 * aucun dessert**. Le modèle ne compose pas les à-côtés. La cible d'un repas
 * repose donc désormais entièrement sur le plat, et c'est le plafond de masse
 * (`MEAL_MAX_GRAMS_PER_KG`, 8 g/kg par repas) qui borne l'assiette.
 *
 * ⇒ LA SUITE COHÉRENTE, si l'assiette gonfle: demander au modèle de composer le
 * repas ENTIER, pain et dessert compris. C'est un lot à part; ce module ne le
 * fait pas et ne prétend pas le faire.
 *
 * ⚠️ LA CONSTANTE SURVIT À ZÉRO PLUTÔT QUE DE DISPARAÎTRE, pour que la décision
 * reste NOMMÉE et épinglable. Un `0` littéral au fond d'un `?:` serait la même
 * règle, illisible et non testable.
 */
export const UNANSWERED_EXTRAS_KCAL = 0;

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
