/**
 * L'ANCRE DE PORTION — combien pèse une part, pour CETTE personne.
 *
 * ── LE DÉFAUT MESURÉ (run réel, 2026-08-11) ────────────────────────────────
 * Trois campagnes de génération, énergie et protéines recalculées ingrédient
 * par ingrédient contre le référentiel, à 100 % de résolution:
 *
 *     CIBLE     2354–2426 kcal · protéines ≥ 184 g
 *     SERVI     1140 kcal · 34 g
 *
 * Le plan servait moins de la moitié de l'énergie et un cinquième de la
 * protéine. Sur les trois gabarits testés, sans exception.
 *
 * ── POURQUOI LA BOUCLE DE CORRECTION NE SUFFIT PAS ─────────────────────────
 * Mesuré aussi, et c'est ce qui a décidé de ce module. Une relance avec
 * `raise_energy` + `raise_protein_component`:
 *
 *     PASSE 1   1140 kcal · 34 g
 *     PASSE 2   1374 kcal · 46 g      rendement: énergie ×1,21 · protéine ×1,35
 *
 * Il faudrait ×2,1 en énergie et ×5,4 en protéine. « Make portions more
 * generous » est une instruction qualitative: elle déplace de 20 à 35 %, pas
 * de 200 %. Et la boucle est délibérément limitée à UNE relance. Aucun nombre
 * de relances raisonnable ne referme cet écart.
 *
 * ── LA CAUSE, ET ELLE EST STRUCTURELLE ─────────────────────────────────────
 * L'enveloppe n'entre jamais dans la consigne — c'est le contrat: « les
 * nombres vivent dans la boucle, le prompt ne reçoit que des mots ». Le modèle
 * reçoit taille, poids, âge et sexe avec l'instruction « ceci sert à UNE
 * chose: la TAILLE d'une portion », mais AUCUNE CALIBRATION. Il ignore qu'un
 * homme de 92 kg vise 2 390 kcal, et compose donc des assiettes d'allure
 * raisonnable, systématiquement légères.
 *
 * ── CE QUE CE MODULE DIT, ET LA FRONTIÈRE QU'IL NE FRANCHIT PAS ────────────
 * La règle du produit n'a jamais été « pas de chiffres ». Elle est écrite dans
 * le prompt système lui-même:
 *
 *     « A quantity says how much to buy or use; a target claims a measurement
 *       of the person. Put quantities on ingredients, never on the student. »
 *
 *   ✅ « à un repas principal, une part de protéine pèse environ 220 g crus »
 *   ❌ « ton objectif est de 2 390 kcal par jour »
 *
 * Le premier est une quantité D'ALIMENT, de la même famille que « 400 g de
 * cuisses de poulet » sur une liste de courses. Le second est une mesure DE LA
 * PERSONNE. Ce module ne rend jamais que des grammes d'aliment.
 *
 * Aucune kcal, aucun nom de macro, aucun total journalier ne sort d'ici — et
 * un test le vérifie sur toutes les sorties possibles.
 *
 * ── SOUS LE PLANCHER TCA, IL N'Y A PAS D'ANCRE ────────────────────────────
 * `per_portion` ne porte pas d'enveloppe: il n'y a rien à dériver, et c'est
 * exactement ce qu'on veut. Une ancre calculée depuis un poids serait un
 * chiffre dérivé du corps d'un élève sous plancher. `null`, pas des valeurs
 * par défaut.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { Envelope } from "./meal_envelope.ts";

/**
 * LES DENSITÉS DE RÉFÉRENCE, pour convertir une cible en grammes d'aliment.
 *
 * Valeurs usuelles pour 100 g, volontairement rondes: on cherche un ORDRE DE
 * GRANDEUR de portion, pas une pesée. Les affiner donnerait une précision que
 * la suite (le modèle compose ce qu'il veut) ne conserve pas.
 */
const PROTEIN_PER_100G_OF_PROTEIN_FOOD = 24; // viande, poisson, volaille maigres
const KCAL_PER_100G_DRY_STARCH = 350; // riz, pâtes, couscous, semoule
const KCAL_PER_G_ADDED_FAT = 9;

/** La part de l'énergie du repas laissée aux légumes et au reste. */
const VEG_AND_REST_SHARE = 0.12;

export interface PortionAnchor {
  /** Grammes CRUS d'un aliment protéique, à un repas principal. */
  proteinFoodG: number;
  /** Grammes SECS de féculent, à un repas principal. */
  starchDryG: number;
  /** Grammes de matière grasse ajoutée, à un repas principal. */
  addedFatG: number;
  /** Grammes de légumes, à un repas principal. */
  vegetableG: number;
}

/** Arrondi au multiple de 10 le plus proche: une portion n'est pas une pesée. */
function round10(n: number): number {
  return Math.max(10, Math.round(n / 10) * 10);
}

/**
 * L'ancre pour cette enveloppe, ou `null` quand il n'y a rien à ancrer.
 *
 * `mainMeals` est le nombre de repas PRINCIPAUX de la journée, tel que le
 * rythme déclaré par l'élève le donne — pas une constante. Un élève à deux
 * repas doit voir des parts plus grandes, pas la même part servie deux fois.
 *
 * ── POURQUOI `null` PLUTÔT QU'UNE ANCRE PAR DÉFAUT ────────────────────────
 * Sans enveloppe (mode `per_portion`, corps inconnu, plancher TCA), il n'y a
 * aucun corps d'où dériver une part. Rendre une valeur « moyenne » ferait
 * exactement ce que ce module existe pour corriger, à l'envers: servir la même
 * assiette à tout le monde, en ayant l'air de personnaliser.
 */
export function portionAnchorFor(
  envelope: Envelope,
  mainMeals: number,
): PortionAnchor | null {
  if (envelope.mode !== "per_kg") return null;
  if (envelope.energy === null) return null;
  const meals = Math.max(1, Math.floor(mainMeals));

  // La protéine d'abord: c'est le plancher, et il gouverne la part de viande,
  // de poisson ou d'œufs. Le reste du repas se construit autour.
  const proteinPerMealG = envelope.proteinFloorG / meals;
  const proteinFoodG = round10(
    (proteinPerMealG * 100) / PROTEIN_PER_100G_OF_PROTEIN_FOOD,
  );

  // L'énergie ensuite, au centre de la bande.
  const kcalPerMeal = ((envelope.energy.low + envelope.energy.high) / 2) / meals;
  const kcalFromProtein = (proteinFoodG / 100) *
    (PROTEIN_PER_100G_OF_PROTEIN_FOOD * 4 + 60); // ~4 kcal/g de protéine + le gras du morceau
  const kcalForVeg = kcalPerMeal * VEG_AND_REST_SHARE;
  const remaining = Math.max(0, kcalPerMeal - kcalFromProtein - kcalForVeg);

  // Le reste se partage entre féculent et matière grasse ajoutée. Deux tiers /
  // un tiers: un repas dont le tiers de l'énergie vient de l'huile ajoutée
  // n'est pas une assiette, c'est une friture — et le plafond de densité de
  // `fat_loss` le rejetterait derrière.
  const starchDryG = round10((remaining * 0.7) / KCAL_PER_100G_DRY_STARCH * 100);
  const addedFatG = round10((remaining * 0.3) / KCAL_PER_G_ADDED_FAT);

  // Les légumes ne se dérivent pas d'une cible: ils sont le volume de
  // l'assiette. Une part fixe et généreuse, la même pour tous — c'est la seule
  // ligne de ce module qui ne dépend pas du corps, et c'est voulu.
  const vegetableG = 200;

  return { proteinFoodG, starchDryG, addedFatG, vegetableG };
}

/**
 * L'ancre, en une ligne de consigne — en anglais, le modèle lit de l'anglais.
 *
 * ── LE CADRAGE COMPTE AUTANT QUE LES CHIFFRES ─────────────────────────────
 * « environ », « a repère », « ajuste si le plat le demande »: une ancre trop
 * ferme produirait des assiettes identiques et mécaniques, ce qui est l'autre
 * façon de rater. On donne un ordre de grandeur, pas un gabarit.
 *
 * Et on dit POURQUOI c'est là — sinon le modèle traite ces nombres comme des
 * cibles à afficher, et ils ressortiraient dans le texte lu par l'élève.
 */
export function portionAnchorPromptLine(anchor: PortionAnchor): string {
  return [
    "-- HOW BIG A PORTION IS FOR THIS PERSON --",
    `At a main meal, for this person, a portion is roughly:`,
    `- a protein food: about ${anchor.proteinFoodG} g raw`,
    `- a starch: about ${anchor.starchDryG} g dry (before cooking)`,
    `- added fat: about ${anchor.addedFatG} g`,
    `- vegetables: about ${anchor.vegetableG} g`,
    "These are ORDERS OF MAGNITUDE for the food, not targets for the person.",
    "Adjust them up or down when a dish calls for it — but a main meal that " +
      "lands far under these is too small for them, and that is the most " +
      "common way to get this wrong.",
    "Never write these numbers back to the student as goals, never total them, " +
      "and never turn them into calories or macros. They size a plate.",
  ].join("\n");
}
