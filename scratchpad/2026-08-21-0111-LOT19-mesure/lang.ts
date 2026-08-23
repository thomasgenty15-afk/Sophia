/**
 * LOT 19 — LA LANGUE DE LA CHAÎNE, DÉCIDÉE À LA MAIN, UNE PAR UNE.
 *
 * ⛔ CE N'EST PAS UN DÉTECTEUR. Les 716 chaînes uniques du corpus ont été LUES;
 * celles qui sont françaises et celles qui s'écrivent PAREIL dans les deux
 * langues sont énumérées ici. Tout le reste est anglais.
 *
 * `profiles.locale` et `content_locale` ne servent PAS: le seul plan dont la
 * ligne dit `fr-US` est le seul qui écrive en français, et deux plans marqués
 * `en-GB` / `en` portent chacun un terme français. La fiche ne décide pas de la
 * langue de la chaîne.
 */

/** Chaînes FRANÇAISES (forme normalisée par `normalizeTerm`). */
export const FR_TERMS: readonly string[] = [
  "yaourt nature",
  "pain complet grille",
  "huile d'olive",
  "sel",
  "poivre",
  "citron",
  "pain complet",
  "oeufs",
  "tomates concassees",
  "oignon",
  "salade verte",
  "tomates",
  "hauts de cuisse de poulet",
  "riz basmati",
  "poivrons",
  "oignons rouges",
  "ail",
  "filets de saumon",
  "pommes de terre nouvelles",
  "haricots verts",
  "lentilles vertes",
  "epinards",
  "carottes",
  "dinde hachee",
  "cannelle",
  "persil",
  "pate brisee",
  "poireaux",
  "fromage de chevre",
  "lait",
  "haricots rouges",
  "boeuf hache",
  "oignons",
  "mais",
  "poivron",
  "paprika fume",
  "herbes de provence",
];

/**
 * Chaînes NEUTRES: la même suite de lettres en français et en anglais.
 * Les compter dans l'une des deux langues fausserait la comparaison — c'est
 * la même chaîne qui passerait l'épreuve des deux côtés.
 */
export const NEUTRAL_TERMS: readonly string[] = [
  "couscous",
  "quinoa",
  "feta",
  "granola",
  "muesli",
  "skyr",
  "passata",
  "pesto",
  "salsa",
  "polenta",
  "mozzarella",
  "parmesan",
  "ricotta",
  "halloumi",
  "tahini",
  "tzatziki",
  "farro",
  "orzo",
  "edamame",
  "paprika",
  "cumin",
  "garam masala",
  "ras el hanout",
  "steak",
  "steaks",
  "toast",
  "bagel",
  "baguette",
  "baguettes",
  "vinaigrette",
  "melon",
  "olives",
  "sardines",
  "pak choi",
  "bok choy",
  "aubergine",
  "aubergines",
  "courgette",
  "courgettes",
];

/** Chaînes MIXTES: une tête française sous un modificateur anglais. */
export const MIXED_TERMS: readonly string[] = [
  "dried herbes de provence",
  "comte or emmental cheese",
];

const FR = new Set(FR_TERMS);
const NEUTRAL = new Set(NEUTRAL_TERMS);
const MIXED = new Set(MIXED_TERMS);

export type Lang = "fr" | "en" | "neutre" | "mixte";

export function langOf(norm: string): Lang {
  if (FR.has(norm)) return "fr";
  if (MIXED.has(norm)) return "mixte";
  if (NEUTRAL.has(norm)) return "neutre";
  return "en";
}
