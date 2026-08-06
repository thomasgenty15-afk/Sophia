/**
 * LES PACKS D'ALIMENTS — un point de départ pour « Recommended food ».
 * ===========================================================================
 *
 * Autorité: `20260805140000_coach_food_items.sql` (grammaire vs opinion),
 * `coach-protocol-v1/index.ts` (le modèle n'écrit jamais de nutrition).
 *
 * ── LE PROBLÈME ─────────────────────────────────────────────────────────
 * 127 aliments, aucun coché, et un coach qui n'a pas dix minutes. L'écran est
 * juste, et il est vide — donc il le reste.
 *
 * ── LA RÈGLE QUI NE SE NÉGOCIE PAS: UN STYLE, JAMAIS UN RÉSULTAT ────────
 * Un pack se nomme par une FAÇON DE MANGER (« méditerranéen », « cuisine
 * minimale »), jamais par un RÉSULTAT (« pack perte de gras »).
 *
 * Ce n'est pas une préférence de vocabulaire, c'est la ligne exacte où KEEL
 * deviendrait l'autorité nutritionnelle. « Ces aliments font perdre du gras »
 * est une affirmation sur un corps, sur un produit qui n'est pas médical, et
 * elle serait affichée sous le nom du coach. « Ces aliments composent une
 * assiette méditerranéenne » est une description, vérifiable, qui n'engage
 * aucun résultat sur personne.
 *
 * ⚠️ CONSÉQUENCE VOLONTAIRE: aucun pack n'est indexé par `GoalToken`. Le geste
 * existe déjà ailleurs et il est correct là-bas — `AXES_BY_GOAL` propose des
 * SUJETS par objectif (« matières grasses ajoutées », « volume de légumes ») et
 * laisse le coach répondre. Proposer des ALIMENTS par objectif serait la même
 * façade avec la réponse déjà écrite dedans.
 *
 * ── QUE DES `encouraged`, ET C'EST DÉLIBÉRÉ ─────────────────────────────
 * L'écran s'appelle « les aliments avec lesquels tu construis ». Ce qu'un coach
 * garde HORS de l'assiette est une affirmation bien plus personnelle — c'est
 * souvent le cœur de sa méthode, et c'est ce que le verrou déterministe fera
 * respecter mot pour mot. Ça reste un geste manuel.
 *
 * Corollaire pratique: un pack ne peut pas créer de conflit de groupe
 * (`deriveFoodRules` ne rend « AUCUNE règle » que quand un même groupe porte du
 * pour ET du contre). Un pack ne peut donc jamais désarmer une règle existante.
 *
 * ── LE « POURQUOI » NE VIENT PAS D'ICI ──────────────────────────────────
 * Il vient de `food_items.default_why`, déjà écrit, déjà passé au filtre « rôle
 * dans l'assiette, jamais allégation de santé », et il s'écrit avec
 * `why_source: 'seeded'` — exactement ce que fait déjà l'ajout manuel. Un pack
 * est un ajout manuel en gros, pas un nouveau genre d'écriture.
 *
 * PUR: aucune I/O. Les slugs sont vérifiés contre le catalogue par
 * `food_packs_test.ts`, qui lit la migration.
 */

/** Un pack ne pose que des `encouraged` — voir l'en-tête. */
export interface FoodPack {
  key: string;
  /** Un STYLE. Jamais un résultat. */
  label: string;
  /** Ce que le coach lit avant de cliquer: à qui ça ressemble, pas ce que ça fait. */
  blurb: string;
  /** Slugs de `food_items`. Vérifiés contre la migration par le test. */
  slugs: readonly string[];
}

export const FOOD_PACKS: readonly FoodPack[] = [
  {
    key: "mediterranean",
    label: "Mediterranean-leaning",
    blurb: "Olive oil, oily fish, pulses and a lot of vegetables. The plates most people picture when they think of eating well without eating strangely.",
    slugs: [
      "extra_virgin_olive_oil",
      "salmon",
      "sardines",
      "mackerel",
      "prawns",
      "mussels",
      "whole_eggs",
      "lentils",
      "chickpeas",
      "white_beans",
      "tomato",
      "courgette",
      "bell_pepper",
      "cucumber",
      "onion",
      "spinach",
      "rocket",
      "brown_rice",
      "wholemeal_bread",
      "quinoa",
      "almonds",
      "walnuts",
      "greek_yogurt",
      "feta",
      "orange",
      "lemon",
    ],
  },
  {
    key: "simple_high_protein",
    label: "Simple and high-protein",
    blurb: "A protein on every plate, a starch that survives being cooked plainly, and vegetables that do not need a recipe. Built for people who cook the same six things.",
    slugs: [
      "chicken_breast",
      "chicken_thigh",
      "turkey_mince",
      "beef_mince",
      "beef_steak",
      "whole_eggs",
      "greek_yogurt",
      "cottage_cheese",
      "skyr",
      "whey_protein",
      "cod",
      "salmon",
      "prawns",
      "potato",
      "sweet_potato",
      "white_rice",
      "oats",
      "broccoli",
      "green_beans",
      "carrot",
      "bell_pepper",
      "spinach",
    ],
  },
  {
    key: "minimal_cooking",
    label: "Minimal cooking",
    blurb: "Tins, jars and things that need three minutes or none. For students whose real obstacle is the stove, not the willpower.",
    slugs: [
      "sardines",
      "mackerel",
      "prawns",
      "whole_eggs",
      "greek_yogurt",
      "cottage_cheese",
      "skyr",
      "chickpeas",
      "lentils",
      "black_beans",
      "oats",
      "wholemeal_bread",
      "peanut_butter",
      "almonds",
      "banana",
      "apple",
      "cucumber",
      "tomato",
      "rocket",
      "lettuce",
      "extra_virgin_olive_oil",
    ],
  },
  {
    key: "plant_forward",
    label: "Plant-forward",
    blurb: "Pulses, soy and grains carry the plate; eggs and dairy still have a place. Not a vegan list — a list where the vegetables are not a side.",
    slugs: [
      "lentils",
      "chickpeas",
      "black_beans",
      "white_beans",
      "kidney_beans",
      "green_peas",
      "edamame",
      "tofu",
      "tempeh",
      "quinoa",
      "oats",
      "brown_rice",
      "buckwheat",
      "spinach",
      "kale",
      "broccoli",
      "cauliflower",
      "cabbage",
      "tomato",
      "bell_pepper",
      "mushroom",
      "walnuts",
      "almonds",
      "pumpkin_seeds",
      "chia_seeds",
      "extra_virgin_olive_oil",
      "whole_eggs",
      "greek_yogurt",
    ],
  },
] as const;

/** R7: une clé inconnue jette, elle ne rend pas `undefined`. */
export function foodPackByKey(key: string): FoodPack {
  const found = FOOD_PACKS.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown food pack: ${JSON.stringify(key)}`);
  return found;
}

/**
 * Ce qu'un pack AJOUTE réellement, sachant ce que le coach a déjà.
 *
 * ── POURQUOI CE N'EST PAS UN SIMPLE `insert` DE LA LISTE ────────────────
 * `coach_food_items_unique_per_protocol_idx` refuse un aliment déjà présent, et
 * un coach qui a coché trois aliments avant de cliquer sur un pack ne doit pas
 * voir l'opération échouer en bloc à cause d'eux. Surtout: sa posture à LUI ne
 * doit pas être écrasée. S'il a marqué le beurre `excluded` et qu'un pack le
 * propose, c'est lui qui gagne — un pack n'a pas d'avis contre le coach.
 *
 * Le nombre rendu est ce que l'écran annonce AVANT de cliquer. Un bouton qui
 * dit « ajoute 26 aliments » et qui en ajoute 4 est un bouton qui ment; ici il
 * dit 4.
 */
export function packAdditions(
  pack: FoodPack,
  alreadyPickedSlugs: readonly (string | null | undefined)[],
): string[] {
  const owned = new Set(
    alreadyPickedSlugs.map((s) => String(s ?? "").trim()).filter(Boolean),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of pack.slugs) {
    if (owned.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
