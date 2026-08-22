/**
 * LOT 2 — L'ANCRAGE ABSOLU : `facteur = cible / livré`.
 *
 * Chantier: `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`.
 *
 * ── CE QUI CHANGE, ET POURQUOI C'EST UN CHANGEMENT DE NATURE ──────────────
 * `bodyShareFactors` rend un RAPPORT: `entretien / moyenne(entretiens)`. La
 * somme des facteurs vaut le nombre de bouches, exprès, pour que la casserole
 * ne gonfle pas. Il déplace des grammes entre deux personnes et **ne décide
 * jamais du niveau** — mesuré sur le foyer `5600347f`: `450+450 = 900` avant,
 * `612+344 = 956` après.
 *
 * Ce module décide du niveau. Il compare ce que la journée LIVRE
 * (`mouthDayEnergy`, LOT 1) à ce que le corps DEMANDE (`executedPaceFor`), et
 * rend le facteur qui ferme l'écart.
 *
 * ── ⚠️ IL REND `bodyShareFactors` REDONDANT, ET IL FAUT LE RETIRER ────────
 * Le rapport des entretiens tombe NATURELLEMENT du rapport des cibles: deux
 * bouches ancrées chacune sur son propre entretien reçoivent déjà des grammes
 * dans le rapport de leurs entretiens. Garder les deux ferait DEUX couches qui
 * dimensionnent — très exactement le double comptage mesuré sur trois runs (le
 * modèle découpait par classe, le moteur multipliait par-dessus, et l'ado de
 * 70 kg dont le corps demande 2,03x la part de l'adulte de 47 kg en recevait
 * 1,02x). `docs`: voir le LOT 2 du chantier.
 *
 * ── LES PORTES SONT APPELÉES, JAMAIS RECOPIÉES ───────────────────────────
 * `energy_gate.ts` est en LECTURE SEULE pour ce chantier: il porte le seul
 * point d'écriture de la chaîne ①②③, et recopier ses trois `if` ici ferait les
 * deux points de décision que le module interdit en toutes lettres. On appelle
 * `energySafetyGates` + `canSizeFromTarget`, exactement comme
 * `bodyShareFactors`, et on dépasse les MÊMES deux portes (② et ③) pour la
 * MÊME raison, écrite là-bas: une maintenance pédiatrique n'est pas une cible,
 * et servir à un enfant la boîte d'un adulte AU NOM DE SA PROTECTION est le
 * contraire d'une protection.
 *
 * ⛔ MAIS L'ÉCART (déficit / surplus) RESTE GOUVERNÉ PAR ②③ EN ENTIER. C'est la
 * ligne: la position du coach et la minorité ferment une CIBLE D'ÉCART, elles
 * ne décident pas qui reçoit le plus grand creux de la même casserole.
 *
 * ── ⛔ ON N'ANCRE JAMAIS SUR UNE JOURNÉE INCOMPLÈTE ───────────────────────
 * C'est la garde la plus importante du fichier. Si un plat du jour n'a pas
 * rendu son énergie — terme inconnu, quantité absente, plat sans couvercle — le
 * `livré` est SOUS-ESTIMÉ, et un facteur `cible / livré` sous-estimé est un
 * facteur TROP GRAND: on servirait davantage à quelqu'un parce qu'on n'a pas su
 * lire son assiette. La direction de l'erreur n'est pas neutre, et elle va dans
 * le sens qui nourrit trop. Journée incomplète ⇒ facteur 1, motif nommé.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  canSizeFromTarget,
  type CountingStance,
  energySafetyGates,
} from "./energy_gate.ts";
import type { MouthBody } from "./meal_envelope.ts";
import type { MemberAgeState } from "./household.ts";
import {
  DEFAULT_PACE_KG_PER_WEEK,
  mouthAgeVerdict,
  type MouthRestrictionState,
  restrictionFlagOf,
} from "./household_portions.ts";
import {
  estimatedMaintenanceFor,
  executedPaceFor,
  type ScaleDirection,
} from "./weight_pace.ts";
import {
  conditionGatePopulationOf,
  conditionGateReason,
} from "./condition_energy_gate.ts";
import type { MouthDayEnergy } from "./mouth_energy.ts";
import type { MealComponent } from "./tokens.ts";

/**
 * POURQUOI UNE BOUCHE N'EST PAS ANCRÉE. Nommé, jamais un facteur `1` muet.
 *
 * ⚠️ TOUTES LES BOUCHES SONT COMPTÉES, y compris celles à `1`. Un compteur qui
 * ne nommerait que les refus ne distingue pas « la porte a laissé passer » de
 * « la porte n'a pas tourné », et c'est la confusion que ce chantier paie en
 * boucle.
 */
export const ANCHOR_REASONS = Object.freeze(
  [
    /** Cible et livré tous deux connus: le facteur s'applique. */
    "anchored",
    /**
     * ⛔ LA GARDE PRINCIPALE. Un plat du jour n'a pas rendu son énergie, donc le
     * livré est sous-estimé, donc le facteur serait trop grand. On ne devine
     * pas dans le sens qui nourrit trop.
     */
    "day_incomplete",
    /** Aucun kcal livré calculable ce jour-là: il n'y a rien à comparer. */
    "no_delivery",
    /** ① le plancher TCA de CETTE bouche, réellement levé sur son compte. */
    "restriction_floor",
    /** ① bis on n'a pas su évaluer sa ceinture. Fail-closed, nommé. */
    "restriction_unknown",
    /** Pas de corps exploitable ⇒ pas d'entretien ⇒ pas de cible. */
    "no_body",
    /**
     * L'âge est inconnu. « Je ne sais pas » n'est pas « c'est un adulte », et la
     * seconde phrase choisit l'équation d'entretien de quelqu'un d'autre.
     */
    "age_unknown",
    /** Le facteur est sorti des bornes de plausibilité, et il a été raboté. */
    "clamped",
    /**
     * L0bis — CETTE BOUCHE A DÉCLARÉ UNE GROSSESSE, et le moteur n'exécute
     * donc AUCUN écart pour elle. Elle reçoit la boîte que le modèle a écrite.
     *
     * ⛔ ELLE NE S'ANCRE PAS NON PLUS SUR SA MAINTENANCE, ET C'EST L'ARBITRAGE.
     * `estimatedMaintenanceKcal` est une équation pour un corps qui ne nourrit
     * que lui-même: le besoin d'une grossesse la dépasse d'environ 340 kcal/j
     * au 2ᵉ trimestre et 450 au 3ᵉ. L'ancrer sur cette maintenance-là lui
     * PRESCRIRAIT une journée trop basse — le défaut même que ce lot ferme,
     * portant le masque d'un correctif. Le dépôt n'a ni trimestre ni équation
     * de grossesse; s'abstenir est la seule option honnête.
     */
    "pregnancy",
    /** L0bis — même geste, même raison, pour un allaitement déclaré (~+500 kcal/j). */
    "breastfeeding",
  ] as const,
);
export type AnchorReason = (typeof ANCHOR_REASONS)[number];

/**
 * LES BORNES DU FACTEUR ABSOLU.
 *
 * ⚠️ CE SONT DES CONVENTIONS DÉCLARÉES, PAS DES BORNES DÉRIVÉES — et c'est dit
 * ici parce que ce fichier documente ailleurs des bornes qui, elles, SE
 * CALCULENT (`BOX_FACTOR_MIN` sort d'un minimum structurel, et sa dérivation est
 * écrite au-dessus). Celles-ci ne le peuvent pas encore: dériver une borne
 * sur `cible / livré` demande de savoir comment le modèle plate en pratique, et
 * **aucun plan en base ne porte encore la nouvelle forme de boîte** (mesuré le
 * 2026-08-19: 136 plans de foyer, 0 avec boîte). Elles sont donc un premier
 * cran prudent, À REDÉRIVER sur les premiers runs réels.
 *
 * ── L'ARBITRAGE: ON RABOTE, ET ON LE COMPTE ──────────────────────────────
 * Le dépôt porte les deux arbitrages opposés, chacun justifié:
 *   · chaîne d'objectif — « un facteur hors bornes ne se rabote pas, il se
 *     refuse »: ramener 0,4 à 0,70 servirait un déficit que personne n'a validé;
 *   · part de fiche — il SE RABOTE: refuser rendrait la boîte de l'adulte de
 *     79 kg à l'enfant de 23 kg.
 *
 * Ici c'est le second qui gouverne, et pour la même raison mesurée: refuser
 * rend `1`, c'est-à-dire **le 450 g du modèle**, qui est très exactement le
 * produit que ce chantier existe pour corriger. Un rabotage compté vaut mieux
 * qu'un refus qui restaure le défaut.
 *
 * ⚠️ ET LE RÉSIDU N'EST PAS PERDU: `AnchorFactor.raw` porte le facteur AVANT
 * rabotage. C'est l'entrée du LOT 3, qui décidera si la casserole doit grossir
 * plutôt que la part être rabotée. Sans lui, l'aval serait un habillage.
 */
export const ANCHOR_FACTOR_MIN = 0.60;

/**
 * COMBIEN DE GRAMMES D'ALIMENT PRÊT UN CORPS PEUT MANGER EN UN SEUL REPAS,
 * par kilo.
 *
 * ── ⛔ LA BORNE JOURNALIÈRE (30 g/kg/jour) ÉTAIT FAUSSE, ET C'EST MESURÉ ──
 * Servie à l'écran du propriétaire le 2026-08-20: **1 232 g dans UNE boîte de
 * dîner**. La journée entière restait sous son plafond pendant qu'un seul
 * repas devenait inmangeable — la borne lisait le mauvais dénominateur. Le
 * produit sert des REPAS; c'est le repas qu'il faut borner.
 *
 * ── D'OÙ VIENT `8` ────────────────────────────────────────────────────────
 * Le plus gros repas d'une journée porte ~35 % de son énergie (le partage
 * FAO/WHO usuel, celui de `SLOT_DAY_WEIGHT`). Pour un entretien adulte de
 * 2 400–3 000 kcal, ça fait 850–1 050 kcal; un plat mixte cuisiné (protéine +
 * féculent + légumes) pèse 1,3–1,6 kcal/g. Le plus gros repas plausible pèse
 * donc ~550–700 g pour 70–80 kg — soit **~8 g/kg**. Pour ce foyer:
 *
 *     iku (73 kg)        584 g max par repas
 *     Christèle (59 kg)  472 g max par repas
 *
 * Deux corps, deux plafonds: ils ne peuvent pas fusionner en s'y collant —
 * c'est la propriété qui a manqué à TROIS ceintures successives de ce
 * chantier, et elle est testée.
 *
 * ⚠️ QUAND ELLE MORD, LA CIBLE D'ÉNERGIE N'EST PAS ATTEINTE, ET C'EST VOULU.
 * L'écart part dans `raw` et `pot_demand.unmetDemand`: la réparation d'un plan
 * trop peu dense est de composer PLUS DENSE (riz, pâtes, huile, oléagineux),
 * jamais de servir un volume que personne ne finit. La masse d'une assiette
 * n'est pas la variable d'ajustement de l'énergie.
 */
export const MEAL_MAX_GRAMS_PER_KG = 8;

/**
 * QUELLE PART D'UN REPAS LE PLAT COMPOSÉ PORTE VRAIMENT.
 *
 * ── ⛔ LE DÉFAUT, NOMMÉ PAR LE PROPRIÉTAIRE LE 2026-08-20 ─────────────────
 * « Christèle mange du fromage et un dessert, on est con de pas avoir pris ça
 * en compte. » Il a raison, et c'est vérifiable: sur le plan servi ce jour-là,
 * **neuf plats sur neuf sont des plats principaux**. Aucun fromage, aucun
 * dessert, aucun pain, aucun fruit.
 *
 * Le moteur faisait donc porter au SEUL plat principal l'énergie du repas
 * ENTIER. C'est exactement l'erreur déjà corrigée deux crans plus haut
 * (`dayCoverageOf`: une cible de journée confrontée à un seul dîner), et elle
 * se rejouait un cran plus bas — repas contre plat.
 *
 * ── D'OÙ VIENT `0,42` ────────────────────────────────────────────────────
 * Un dîner français ordinaire, décomposé:
 *
 *     soupe / entrée    100 kcal
 *     PLAT PRINCIPAL    300 kcal   <- le seul que le plan compose
 *     pain               80 kcal
 *     fromage           120 kcal
 *     dessert / fruit   120 kcal
 *     ───────────────────────────
 *     TOTAL             720 kcal   ->  le plat = 42 %
 *
 * ⚠️ C'EST UNE CONVENTION DÉCLARÉE, ET ELLE A UNE DATE DE PÉREMPTION. Elle
 * n'existe que parce que le plan ne compose QUE le plat. Le jour où il composera
 * le repas entier (fromage, dessert, pain), cette constante doit passer à `1` —
 * et non être « ajustée ». Une convention qui survit à sa cause est le mode
 * d'échec que ce dépôt documente ailleurs en toutes lettres.
 *
 * ── LA VÉRIFICATION QUI L'A FIXÉE ────────────────────────────────────────
 * Christèle (169 cm, 58 kg, 56 ans, stabilisation), avec cette part et un cran
 * d'activité sédentaire: **226 g** de plat principal. Le propriétaire, qui la
 * connaît, annonçait 225 g. Les deux chemins se rejoignent à un gramme.
 */
export const COMPOSED_DISH_MEAL_SHARE = 0.42;

// ---------------------------------------------------------------------------
// LA PART DU PLAT, CALCULÉE PAR PERSONNE (2026-08-20)
// ---------------------------------------------------------------------------
//
// ── ⛔ CE QUE `COMPOSED_DISH_MEAL_SHARE` NE POUVAIT PAS FAIRE ─────────────
// C'est une MOYENNE française, et une moyenne se trompe dans les deux sens à
// la fois. Mesuré sur le foyer `5600347f`:
//
//     Christèle  plat 300 + pain 80 + fromage 120 + dessert 120 = 620 -> 48 %
//     iku        plat 300 + pain 80                             = 380 -> 79 %
//
// Le moteur appliquait 42 % aux deux. Christèle était à peu près juste PAR
// ACCIDENT; iku recevait environ la moitié de ce qu'il lui faut — et c'est lui
// qui cuisine et qui mange exactement ce que le plan compose.
//
// ── ⚠️ LA DATE DE PÉREMPTION N'EST PAS SUPPRIMÉE, ELLE EST DÉPLACÉE ──────
// La phrase écrite au-dessus de `COMPOSED_DISH_MEAL_SHARE` reste vraie et vaut
// pour les DEUX: la moyenne comme le calcul n'existent que parce que le plan ne
// compose QUE le plat. Le jour où il composera le repas entier (fromage,
// dessert, pain), les deux disparaissent ENSEMBLE — la constante ne « s'ajuste »
// pas, et la table ci-dessous ne se « recalibre » pas. Une convention qui
// survit à sa cause est le mode d'échec que ce dépôt documente en toutes
// lettres.
//
// ⚠️ ET LA MOYENNE NE MEURT PAS AUJOURD'HUI: elle devient le repli des fiches
// muettes, et le compteur dit combien de bouches sont dans ce cas.

/**
 * CE QUE CHAQUE COMPOSANT PÈSE DANS UN REPAS, EN KCAL.
 *
 * ⚠️ C'EST UNE CONVENTION DÉCLARÉE, PAS UNE MESURE, et elle est écrite comme
 * telle — exactement comme la décomposition qui a produit `0,42`, dont elle
 * reprend les quatre nombres:
 *
 *     PLAT COMPOSÉ      300 kcal   le seul que le plan compose
 *     pain               80 kcal
 *     fromage           120 kcal
 *     dessert / fruit   120 kcal
 *
 * ⛔ ELLE NE PRESCRIT RIEN. Personne ne se voit dire de prendre un dessert: on
 * lit ce que la personne a déclaré prendre déjà, et on en déduit quelle part de
 * son repas le plat porte. Les trois nombres se simplifient dans le rapport —
 * seul leur ORDRE DE GRANDEUR RELATIF compte, et c'est pour ça qu'ils peuvent
 * être une convention sans que le produit mente.
 *
 * ⚠️ TROU NOMMÉ: L'ENTRÉE / LA SOUPE N'EST PAS DEMANDÉE. La décomposition de
 * `0,42` comptait 100 kcal d'entrée; la fiche ne pose que trois questions. Une
 * bouche qui coche les trois obtient donc 48 % et non 42 % — parce qu'on ne
 * fabrique pas une entrée que personne n'a déclarée. Direction assumée: la part
 * du plat monte, donc l'assiette aussi, et c'est le plafond par repas
 * (`MEAL_MAX_GRAMS_PER_KG`) qui reste la ceinture.
 */
export const MEAL_COMPONENT_KCAL: Readonly<Record<MealComponent, number>> =
  Object.freeze({
    dessert: 120,
    cheese: 120,
    bread: 80,
  });

/** LE PLAT LUI-MÊME, dans la même unité. Voir `MEAL_COMPONENT_KCAL`. */
export const COMPOSED_DISH_KCAL = 300;

/**
 * CE QU'UNE BOUCHE A DIT PRENDRE À CÔTÉ DU PLAT.
 *
 * ⛔ TROIS BOOLÉENS NULLABLES, PAS TROIS BOOLÉENS. `false` veut dire « non,
 * je n'en prends pas » — une RÉPONSE, qui fait MONTER la part du plat. `null`
 * veut dire « je n'ai pas répondu », et les deux ne peuvent pas partager une
 * case cochée ou non: une case vide au fond d'un formulaire qu'on enregistre
 * sans le lire ferait écrire « je ne prends ni pain ni fromage ni dessert »,
 * c'est-à-dire un plat qui porte 100 % du repas, c'est-à-dire deux fois et
 * demie la part d'aujourd'hui. C'est la cicatrice « coche auto = faits faux
 * indémentables », dans le sens qui nourrit trop.
 */
export interface MealStructure {
  dessert: boolean | null;
  cheese: boolean | null;
  bread: boolean | null;
}

/**
 * DANS QUEL ÉTAT SE TROUVE LA RÉPONSE D'UNE BOUCHE AUX TROIS CASES.
 *
 * ⛔ QUATRE ÉTATS, PAS DEUX. Sans `not_asked`, une fiche créée AVANT ce lot et
 * une fiche dont le maître a refusé de répondre rendraient le même silence — le
 * zéro ambigu que ce chantier paie en boucle. Voir `ACTIVITY_ANSWER_STATES`,
 * qui porte la même liste pour la même raison.
 *
 *   `answered`      les TROIS cases sont tranchées — le calcul gouverne
 *   `partial`       une ou deux — la moyenne 0,42 reprend la main
 *   `not_answered`  les trois questions ont été POSÉES, aucune tranchée
 *   `not_asked`     la fiche n'a jamais vu ces trois questions
 *
 * ⛔ ET `partial` NE COMPLÈTE RIEN. Traiter une case non répondue comme un
 * « non » ferait monter la part du plat sur une réponse que personne n'a
 * donnée, dans la direction qui nourrit trop.
 */
export const MEAL_STRUCTURE_STATES = [
  "answered",
  "partial",
  "not_answered",
  "not_asked",
] as const;
export type MealStructureState = (typeof MEAL_STRUCTURE_STATES)[number];

/**
 * `null` = la fiche n'a jamais vu les trois questions (`not_asked`).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function mealStructureState(
  structure: MealStructure | null,
): MealStructureState {
  if (structure === null) return "not_asked";
  const answers = [structure.dessert, structure.cheese, structure.bread];
  const known = answers.filter((a) => a !== null).length;
  if (known === answers.length) return "answered";
  if (known === 0) return "not_answered";
  return "partial";
}

/**
 * QUELLE PART DE SON REPAS LE PLAT COMPOSÉ PORTE, POUR CETTE BOUCHE-LÀ.
 *
 *     part = 300 / (300 + 80 x pain + 120 x fromage + 120 x dessert)
 *
 * Rien coché du tout ⇒ `1`, et ce n'est pas une borne: c'est la définition. Une
 * personne qui ne prend ni pain ni fromage ni dessert mange le plat, et le plat
 * porte alors tout le repas. La ceinture qui empêche une assiette inmangeable
 * est ailleurs, et elle est PHYSIQUE (`MEAL_MAX_GRAMS_PER_KG`).
 *
 * ⛔ LE REPLI EST LA MOYENNE, ET IL EST NEUTRE À L'OCTET PRÈS. Tout état autre
 * qu'`answered` rend `COMPOSED_DISH_MEAL_SHARE` — c'est-à-dire exactement le
 * produit d'avant ce lot pour toute la base existante. C'est la propriété que
 * la contre-épreuve « fiches vides » vérifie, et un repli qui déplacerait le
 * produit de ceux qui n'ont rien répondu serait pire que le défaut qu'il
 * corrige.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function composedDishShare(
  structure: MealStructure | null,
): { share: number; state: MealStructureState } {
  const state = mealStructureState(structure);
  if (state !== "answered" || structure === null) {
    return { share: COMPOSED_DISH_MEAL_SHARE, state };
  }
  let whole = COMPOSED_DISH_KCAL;
  if (structure.dessert) whole += MEAL_COMPONENT_KCAL.dessert;
  if (structure.cheese) whole += MEAL_COMPONENT_KCAL.cheese;
  if (structure.bread) whole += MEAL_COMPONENT_KCAL.bread;
  return { share: COMPOSED_DISH_KCAL / whole, state };
}
/**
 * ⚠️ RELEVÉ DE 1,60 À 3,00 LE 2026-08-20, ET CE N'EST PAS UN DESSERRAGE DE
 * CONFORT — c'est le seul moyen que la borne cesse d'être LA VALEUR OPÉRANTE.
 *
 * Mesuré sur un run réel du foyer `5600347f`: les trois bouches-jours ancrées
 * sortaient à `1,600` **exactement**, c'est-à-dire au plafond, toutes les
 * trois. Deux cibles différentes (3 925 et 2 205 kcal) rendaient donc le MÊME
 * facteur, et l'écran gardait ses grammes identiques — le défaut que tout ce
 * chantier existe pour corriger, reproduit par sa propre ceinture.
 *
 * ⛔ UNE BORNE QUI MORD SUR LA POPULATION ENTIÈRE N'EST PLUS UNE BORNE DE
 * PLAUSIBILITÉ, C'EST LE CALCUL. C'est la troisième fois que ce dépôt le
 * mesure (`BOX_FACTOR_MIN`: « 0,75 était trop serré »), et le patron est
 * toujours le même: la ceinture se referme d'abord sur le cas qu'elle était
 * censée servir.
 *
 * `3,00` reste une CONVENTION, pas une dérivation: elle laisse passer les
 * facteurs réellement mesurés (2,28 à 2,94 sur ce foyer) et refuse encore
 * l'ordre de grandeur absurde. Le résidu part dans `raw`, pour la casserole.
 */
export const ANCHOR_FACTOR_MAX = 3.00;

/**
 * CE QUE CHAQUE MOMENT PÈSE DANS UNE JOURNÉE — pour savoir quelle PART de la
 * journée d'une bouche le plan a réellement composée.
 *
 * ⛔ LE DÉFAUT QUE CES TROIS NOMBRES FERMENT, MESURÉ LE 2026-08-20. Christèle
 * déclare `lunch` + `dinner`; le plan ne lui compose que `dinner`. Comparer sa
 * cible de JOURNÉE ENTIÈRE (2 205 kcal) à ce seul dîner rendait un facteur
 * brut de **6,28** — c'est-à-dire une assiette de deux kilos, ou, une fois
 * rabotée, la même que celle de tout le monde.
 *
 * ⚠️ CE N'EST PAS UNE RECOMMANDATION NUTRITIONNELLE, c'est une clé de
 * répartition, et elle est ordinaire: un petit-déjeuner pèse moins qu'un
 * déjeuner. Elle ne sert qu'à normaliser, jamais à prescrire — les trois
 * nombres se simplifient dans le rapport.
 */
export const SLOT_DAY_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  breakfast: 0.25,
  lunch: 0.40,
  dinner: 0.35,
});

/**
 * LA PART DE LA JOURNÉE D'UNE BOUCHE QUE LE PLAN PORTE.
 *
 * `1` = le plan compose tous les moments qu'elle a déclarés — le cas nominal.
 * `0,47` = il n'en compose qu'un sur deux, et sa cible doit être réduite
 * d'autant, sinon on demande à un dîner de porter une journée.
 *
 * ⚠️ UN MOMENT COMPOSÉ QU'ELLE N'A PAS DÉCLARÉ COMPTE QUAND MÊME. Le plan le
 * lui sert, donc il la nourrit; l'ignorer sous-estimerait ce qu'elle reçoit et
 * gonflerait sa part.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dayCoverageOf(
  declaredSlots: readonly string[],
  composedSlots: readonly string[],
): number {
  const weight = (slot: string) => SLOT_DAY_WEIGHT[slot] ?? 0;
  const declared = new Set(declaredSlots.length > 0 ? declaredSlots : Object.keys(SLOT_DAY_WEIGHT));
  for (const slot of composedSlots) declared.add(slot);
  let whole = 0;
  for (const slot of declared) whole += weight(slot);
  if (whole <= 0) return 1;
  let covered = 0;
  for (const slot of new Set(composedSlots)) covered += weight(slot);
  if (covered <= 0) return 1;
  return Math.min(1, covered / whole);
}

/** Ce que l'ancrage lit d'une bouche. Rien d'autre n'entre. */
export interface AnchorMouth {
  memberId: string;
  ageState: MemberAgeState;
  restriction: MouthRestrictionState;
  /** Le corps de sa FICHE (`household_member_bodies`), mineurs compris. */
  body: MouthBody | null;
  /** La direction dérivée de son objectif. `null` = ni perte ni prise. */
  direction: ScaleDirection | null;
  /** Le cran réglé, ou `null` — le défaut de la direction s'applique alors. */
  paceKgPerWeek: number | null;
  /**
   * LES MOMENTS QU'ELLE A DÉCLARÉS (`eating_rhythm`). Vide = les moments de la
   * maison, c'est-à-dire les trois.
   *
   * ⛔ REQUIS, jamais `?`. Un défaut à « tous les moments » ferait de la
   * couverture totale la réponse silencieuse de tous les appelants, et le
   * facteur d'une bouche à moitié composée redeviendrait trois fois trop grand
   * sans que rien ne le dise.
   */
  declaredSlots: readonly string[];
  /**
   * CE QU'ELLE PREND À CÔTÉ DU PLAT (2026-08-20) — dessert, fromage, pain.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. `null` veut dire « sa fiche n'a jamais
   * vu ces trois questions », et il retombe sur la moyenne `0,42`. Un champ
   * facultatif aurait fait de ce repli la réponse SILENCIEUSE de tous les
   * appelants: le lot serait construit, branché, désarmé — le mode d'échec
   * n°1 de ce dépôt, et le compteur ne pourrait plus distinguer « pas posé »
   * de « pas câblé ».
   */
  structure: MealStructure | null;
  /**
   * L0bis — LES `condition_ref` QUE CETTE BOUCHE A DÉCLARÉS.
   *
   * ⛔ REQUIS ET NON OPTIONNEL, jamais `?`. « Paramètre de garde optionnel =
   * garde désarmée » est une leçon déjà payée par ce dépôt (`safetyBand: null`,
   * jamais passé). Un `?` ici aurait laissé le tableau vide être la réponse
   * SILENCIEUSE de tous les appelants: la garde de grossesse serait écrite,
   * testée, branchée nulle part — et un lot désarmé ressemble trait pour trait
   * à un lot qui marche. `[]` = cette bouche n'a rien déclaré, et il faut
   * l'écrire.
   *
   * ⚠️ SOURCE: `student_safety_constraints.condition_ref`, et ELLE SEULE. Il
   * n'existe pas de `household_member_conditions`, donc une bouche SANS COMPTE
   * ne peut porter aucune condition aujourd'hui — c'est un trou nommé, pas un
   * oubli. Voir la fiche `L0bis-a` du plan.
   */
  conditionRefs: readonly string[];
}

export interface AnchorFactor {
  /** Ce qui est réellement multiplié. Raboté, jamais brut. */
  factor: number;
  /**
   * LE FACTEUR AVANT RABOTAGE — l'entrée du LOT 3.
   *
   * `null` quand rien n'a été calculé. Quand il diffère de `factor`, la
   * casserole ne suit pas ce que le corps demande, et c'est en AMONT (les
   * quantités des préparations) que ça se répare, pas ici.
   */
  raw: number | null;
  reason: AnchorReason;
  /** La cible du jour, en kcal. `null` si aucune n'a pu être calculée. */
  targetKcal: number | null;
  /** Ce que la journée livre à cette bouche, en kcal. `null` si inconnu. */
  deliveredKcal: number | null;
  /**
   * D'OÙ VIENT LA PART DU PLAT — le compteur du LOT ①, rendu par bouche-jour.
   *
   * ⚠️ RENDU MÊME QUAND LE FACTEUR N'EST PAS CALCULÉ. Un compteur qui ne
   * parlerait que sur les journées ancrées ferait lire « personne n'a répondu »
   * sur un foyer où tout le monde a répondu et où toutes les journées sont
   * incomplètes.
   */
  structureState: MealStructureState;
}

/**
 * LA CIBLE D'UNE BOUCHE, EN KCAL/JOUR — entretien, plus l'écart EXÉCUTABLE.
 *
 * ── DEUX PORTES, DEUX PORTÉES, ET C'EST TOUTE LA FINESSE ─────────────────
 *   · L'ENTRETIEN traverse ② et ③ (comme `bodyShareFactors`): ce n'est pas une
 *     cible, c'est ce que ce corps dépense. Le refuser à un mineur lui servirait
 *     la part d'un adulte au nom de sa protection.
 *   · L'ÉCART (déficit ou surplus) est fermé par ② et ③ EN ENTIER: c'est un
 *     objectif, et un coach qui ne compte pas garde exactement ce qu'il a
 *     demandé — aucun déficit, aucun surplus, pour personne de sa cohorte.
 *
 * ⛔ ① (le plancher TCA) ferme les DEUX, et il est évalué en premier dans les
 * deux passes. C'est ce qui rend le dépassement de ②③ sûr.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function mouthTargetKcal(
  mouth: AnchorMouth,
  coachCounting: CountingStance,
): { kcal: number | null; reason: AnchorReason } {
  // ── ①②③, LA CHAÎNE ENTIÈRE, APPELÉE ET PAS RECOPIÉE ────────────────────
  const full = canSizeFromTarget({
    safety: energySafetyGates({
      restrictionFlag: restrictionFlagOf(mouth.restriction),
      ageVerdict: mouthAgeVerdict(mouth.ageState),
      coachCounting,
    }),
  });
  // ① seul, pour l'ENTRETIEN: on rejoue la MÊME chaîne avec un verdict de
  // majeur et sans position de coach, ce qui est la seule façon de dépasser ②
  // et ③ sans recopier leurs `if`. Un plancher levé sort `restriction_floor` à
  // la PREMIÈRE passe, donc la seconde ne le desserre jamais.
  const floorOnly = canSizeFromTarget({
    safety: energySafetyGates({
      restrictionFlag: restrictionFlagOf(mouth.restriction),
      ageVerdict: mouthAgeVerdict("adult"),
      coachCounting: "no_position",
    }),
  });
  if (!floorOnly.size) {
    return {
      kcal: null,
      reason: mouth.restriction === "unreadable"
        ? "restriction_unknown"
        : "restriction_floor",
    };
  }
  if (mouth.ageState === "unknown") return { kcal: null, reason: "age_unknown" };
  if (mouth.body === null) return { kcal: null, reason: "no_body" };

  const isMinor = mouth.ageState === "minor";
  const subject = { body: mouth.body, isMinor };
  const maintenance = estimatedMaintenanceFor(subject);
  if (maintenance === null || !Number.isFinite(maintenance) || maintenance <= 0) {
    return { kcal: null, reason: "no_body" };
  }
  // Pas de direction, ou porte ②③ fermée: la cible EST l'entretien. Aucun écart
  // n'est ouvert, et c'est exactement ce qu'un coach qui ne compte pas demande.
  if (mouth.direction === null || !full.size) {
    return { kcal: maintenance, reason: "anchored" };
  }
  // ── L0bis — LE GARDE DE GROSSESSE, POSÉ SUR LE DÉFICIT ET PAS SUR LA PERSONNE ──
  //
  // ⚠️ IL EST ICI ET PAS PLUS HAUT, ET LA POSITION EST L'ARBITRAGE. Placé en
  // tête, il aurait effacé du journal `restriction_floor`, `age_unknown` et
  // `no_body` de toute bouche enceinte — trois motifs qui disent chacun une
  // chose vraie et différente. Placé ICI, à l'endroit exact où l'écart va se
  // calculer, il ne change le verdict que des bouches qui allaient RECEVOIR un
  // déficit. Toutes les autres restent octet pour octet celles d'hier.
  //
  // ⛔ `direction === "down"` ET RIEN D'AUTRE. Sur une PRISE, ce garde ne mord
  // pas: rabattre un surplus retirerait de l'énergie à une femme enceinte qui
  // en demande, sous le nom d'une protection. Ce module retire des déficits.
  if (mouth.direction === "down") {
    const population = conditionGatePopulationOf(mouth.conditionRefs);
    const reason = conditionGateReason(population);
    if (reason !== null) return { kcal: null, reason };
  }
  const pace = mouth.paceKgPerWeek !== null && Number.isFinite(mouth.paceKgPerWeek) &&
      mouth.paceKgPerWeek > 0
    ? mouth.paceKgPerWeek
    : DEFAULT_PACE_KG_PER_WEEK;
  const executed = executedPaceFor(mouth.direction, subject, pace);
  if (executed === null) return { kcal: maintenance, reason: "anchored" };
  const signed = mouth.direction === "up"
    ? executed.dailyDeltaKcal
    : -executed.dailyDeltaKcal;
  return { kcal: executed.maintenanceKcal + signed, reason: "anchored" };
}

function clampAnchor(factor: number): { factor: number; clamped: boolean } {
  if (factor < ANCHOR_FACTOR_MIN) return { factor: ANCHOR_FACTOR_MIN, clamped: true };
  if (factor > ANCHOR_FACTOR_MAX) return { factor: ANCHOR_FACTOR_MAX, clamped: true };
  return { factor, clamped: false };
}

/**
 * LE FACTEUR ABSOLU D'UNE BOUCHE, POUR UN JOUR — `cible / livré`.
 *
 * ⛔ `day` EST REQUIS ET N'A PAS DE DÉFAUT. Un paramètre facultatif ferait de
 * « la journée entière » le repli silencieux de tous les appelants, et le lot
 * serait construit, branché, désarmé — le mode d'échec n°1 de ce dépôt.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function anchorFactorFor(
  mouth: AnchorMouth,
  day: MouthDayEnergy | null,
  coachCounting: CountingStance,
): AnchorFactor {
  const target = mouthTargetKcal(mouth, coachCounting);
  // ⚠️ LU AVANT TOUTE SORTIE, ET RENDU SUR TOUTES. Le compteur du LOT ① dit ce
  // que la FICHE porte, pas ce que la journée a permis: le calculer seulement
  // sur le chemin ancré ferait lire « personne n'a répondu » sur un foyer où
  // tout le monde a répondu et où chaque journée est incomplète.
  const structure = composedDishShare(mouth.structure);
  if (target.kcal === null) {
    return {
      factor: 1,
      raw: null,
      reason: target.reason,
      targetKcal: null,
      deliveredKcal: day?.kcal ?? null,
      structureState: structure.state,
    };
  }
  if (day === null || day.kcal === null || day.kcal <= 0) {
    return {
      factor: 1,
      raw: null,
      reason: "no_delivery",
      targetKcal: target.kcal,
      deliveredKcal: null,
      structureState: structure.state,
    };
  }
  // ⛔ LA GARDE PRINCIPALE — MAIS PAS SUR N'IMPORTE QUELLE LACUNE.
  //
  // Ce qui doit bloquer est ce qui SOUS-ESTIME le livré **sans réduire la
  // cible en face**: un plat dont la boîte existe et dont l'énergie n'a pas pu
  // être lue (`dish_incomplete`), ou une boîte qui ne pèse rien
  // (`empty_box`). Là, `cible / livré` devient trop grand, et on servirait
  // davantage à quelqu'un parce qu'on n'a pas su lire son assiette.
  //
  // ⚠️ `no_box` NE BLOQUE PAS, ET C'EST UNE CORRECTION MESURÉE DU 2026-08-20.
  // Un plat sans couvercle n'entre pas dans `day.slots` — donc `dayCoverageOf`
  // a DÉJÀ retiré son moment de la cible. Les deux côtés du rapport sont
  // réduits ensemble, et le facteur reste juste.
  //
  // Le coût de l'avoir bloqué: sur six runs réels consécutifs, tout plan
  // contenant un seul plat cuisiné le jour même — c'est-à-dire presque tous —
  // sortait `day_incomplete` sur TOUTES ses bouches, et l'ancrage absolu ne
  // s'appliquait jamais. Une garde qui se referme sur la population entière
  // n'est plus une garde, c'est un interrupteur ouvert.
  //
  // ⛔ `common_pot` BLOQUE, LUI, ET C'EST L'INVERSE EXACT DE `no_box` (v4,
  // 2026-08-20). Un bac commun laisse le MOMENT du plat dans `day.slots` — la
  // bouche a bien mangé ce midi — pendant qu'il ne rend aucun kcal. Un seul des
  // deux côtés du rapport baisse, donc `cible / livré` gonfle, et on servirait
  // davantage à quelqu'un parce que ses grammes décrivaient un récipient.
  // Il tombe donc dans `blocking` par simple absence de l'exemption, et ce
  // commentaire est là pour que personne ne l'y « ajoute » par symétrie.
  const blocking = day.gaps.filter((g) => g !== "no_box");
  if (blocking.length > 0) {
    return {
      factor: 1,
      raw: null,
      reason: "day_incomplete",
      targetKcal: target.kcal,
      deliveredKcal: day.kcal,
      structureState: structure.state,
    };
  }
  // ⛔ LA CIBLE EST RÉDUITE À CE QUE LE PLAN PORTE POUR ELLE. Sans ça, un dîner
  // seul se voit demander une journée entière — 6,28 mesuré sur Christèle le
  // 2026-08-20, c'est-à-dire une assiette de deux kilos.
  const coverage = dayCoverageOf(mouth.declaredSlots, day.slots);
  // ⛔ ET LE PLAT NE PORTE PAS LE REPAS ENTIER. Le plan ne compose que le plat
  // principal (mesuré: 9 plats sur 9); le pain, le fromage et le dessert
  // existent quand même dans l'assiette. Faire porter au plat l'énergie du repas
  // entier, c'est très exactement servir 1,2 kg de poulet à quelqu'un qui prend
  // aussi un yaourt.
  //
  // ⚠️ LA PART EST CELLE DE CETTE BOUCHE-LÀ DEPUIS LE 2026-08-20, plus la
  // moyenne de tout le monde. `composedDishShare` rend `COMPOSED_DISH_MEAL_SHARE`
  // — au bit près — pour toute fiche qui n'a pas répondu aux trois cases.
  const raw = (target.kcal * coverage * structure.share) / day.kcal;
  // ── LE PLAFOND DE VRAISEMBLANCE, PAR REPAS ET PAR CORPS ─────────────────
  // Le facteur est UN par bouche et s'applique à toutes ses parts: c'est donc
  // sa PLUS GROSSE part qui décide du plafond. Borner le total du jour a été
  // mesuré faux (1 232 g dans une boîte, journée « plausible »).
  const weightKg = Number(mouth.body?.weightKg ?? 0);
  const physicalMax = weightKg > 0 && day.maxMealGrams > 0
    ? (MEAL_MAX_GRAMS_PER_KG * weightKg) / day.maxMealGrams
    : Infinity;
  const bounded = Math.min(raw, physicalMax);
  const { factor, clamped } = clampAnchor(bounded);
  return {
    factor,
    raw,
    reason: clamped || bounded !== raw ? "clamped" : "anchored",
    // ⚠️ LA CIBLE RENDUE EST CELLE QUI A SERVI AU CALCUL — donc réduite. Rendre
    // la cible de journée entière à côté d'un livré partiel ferait lire un
    // manque qui n'existe pas, et c'est `pot_demand` qui la relit.
    targetKcal: Math.round(target.kcal * coverage * structure.share),
    deliveredKcal: day.kcal,
    structureState: structure.state,
  };
}

/**
 * L'ANCRAGE DE TOUTE LA TABLE, bouche par bouche et jour par jour.
 *
 * La clé est `<memberId> <day>` — la même que `mouthDayEnergy`, pour qu'aucun
 * appelant n'ait à en fabriquer une seconde.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function householdAnchors(
  mouths: readonly AnchorMouth[],
  days: readonly MouthDayEnergy[],
  coachCounting: CountingStance,
): Map<string, AnchorFactor> {
  const byMouth = new Map(mouths.map((m) => [m.memberId, m]));
  const out = new Map<string, AnchorFactor>();
  for (const day of days) {
    const mouth = byMouth.get(day.memberId);
    if (!mouth) continue;
    out.set(`${day.memberId} ${day.day ?? ""}`, anchorFactorFor(mouth, day, coachCounting));
  }
  return out;
}
