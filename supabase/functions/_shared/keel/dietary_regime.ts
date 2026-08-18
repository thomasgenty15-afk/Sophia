/**
 * KEEL — LES RÉGIMES ALIMENTAIRES : ce qu'un végétarien ne mange pas, et
 * comment ça s'ÉCRIT en prose.
 *
 * ── LE TROU QUE CE FICHIER BOUCHE ──────────────────────────────────────────
 * `safety_constraints` porte cinq catégories — `allergy`, `intolerance`,
 * `medical`, `religious`, `dislike` — et AUCUNE ne dit « je suis végétarien ».
 * Un végétarien n'est pas allergique, pas intolérant, pas malade, et son
 * régime n'est en général pas religieux. Le seul emplacement libre était
 * `dislike`, de sévérité `preference` — c'est-à-dire un classement, pas un
 * verrou. Autrement dit: aujourd'hui, un végan reçoit un plan avec de la
 * viande dedans, et rien dans le produit ne peut l'empêcher.
 *
 * `medical_condition_floor_test.ts:250` acte d'ailleurs « je suis végétarien »
 * comme un message qui ne doit RIEN déclencher — correct pour le plancher
 * médical, et il se trouve que rien d'autre ne le rattrape non plus.
 *
 * ── LA RÈGLE QUI GOUVERNE TOUT LE FICHIER ──────────────────────────────────
 * Un régime est un VERROU, pas une préférence. La différence n'est pas de
 * vocabulaire: une préférence CLASSE les plats (le modèle la respecte « à peu
 * près »), un verrou REJETTE le plat au parseur. Servir du poulet à un végan
 * n'est pas une maladresse de classement, c'est une réponse qui rend le
 * produit inutilisable pour lui — et, s'il l'a mangé sans le voir, une
 * trahison.
 *
 * ⚠️ ── LE JETON DU RÉGIME N'ENTRE JAMAIS DANS LA LISTE D'ÉVITEMENT ─────────
 * `dietRef` ne doit JAMAIS rejoindre `safetyConstraintTokens()`, pour
 * exactement la raison écrite au-dessus de `conditionRef` dans
 * `safety_constraints.ts` — et ce n'est pas théorique, ce dépôt l'a déjà payé.
 * Le 2026-08-06, des lignes difformes (`allergen_ref='diabetes'`) ont armé la
 * ceinture de sortie sur le mot « diabetes », et un message d'urgence a été
 * remplacé par un refus poli, en run réel.
 *
 * Le même piège attend ici, en pire: armer la ceinture sur « vegan » ferait
 * rejeter toute réponse qui décrit un plat comme végan — donc précisément les
 * bonnes réponses, et seulement pour les végans. La liste d'évitement doit
 * contenir CE QUI EST EXCLU (viande, poisson, œuf…), jamais le NOM du régime.
 * Ce module ne rend que l'expansion; il ne rend jamais le jeton lui-même.
 *
 * ── POURQUOI DES FORMES DE SURFACE, ET PAS DES GROUPES ─────────────────────
 * `allergen_surface_forms.ts` a mesuré la leçon: un slug nu ne matche pas la
 * prose réelle. « the nut butter option » est passé sur une allergie à
 * l'arachide parce que la ceinture ne connaissait que `peanut`. Ici c'est pire
 * encore, parce que les fautes d'un régime sont ORDINAIREMENT INVISIBLES:
 * personne n'appelle « viande » le nuoc-mâm d'un wok, la gélatine d'une
 * panna cotta, le saindoux d'une pâte brisée, les anchois d'une sauce
 * Worcestershire, ou le bouillon de volaille d'une soupe « de légumes ».
 * Ce sont ces cas-là que la table ci-dessous existe pour attraper, et c'est
 * pour eux qu'elle est écrite À LA MAIN et FERMÉE — jamais une inférence.
 *
 * ── CE QUE CE FICHIER NE COUVRE PAS, EXPRÈS ────────────────────────────────
 * Halal et casher restent sur la catégorie `religious` existante, avec leurs
 * substances. Ce ne sont pas des exclusions de groupes alimentaires au même
 * sens: la licéité y dépend autant du mode d'abattage et de la séparation des
 * ustensiles que de l'espèce. Prétendre les couvrir avec une liste d'aliments
 * exclus produirait une garantie fausse, ce qui est pire que pas de garantie.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { type FoodGroupRef } from "./tokens.ts";
import { normalizeForMatch } from "./forbidden_matcher.ts";

/**
 * Les régimes que le produit sait EXÉCUTER.
 *
 * Liste fermée, R1 (slugs ASCII). Un régime qui n'est pas ici n'est pas
 * proposé à l'écran: offrir une case qu'aucun verrou n'honore serait la
 * version cochable du mensonge que ce fichier corrige.
 */
export const DIETARY_REGIMES = [
  "vegetarian",
  "vegan",
  "pescatarian",
] as const;
export type DietaryRegime = typeof DIETARY_REGIMES[number];

export function parseDietaryRegime(value: unknown): DietaryRegime | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return (DIETARY_REGIMES as readonly string[]).includes(slug)
    ? slug as DietaryRegime
    : null;
}

/**
 * Les groupes alimentaires structurellement exclus par un régime.
 *
 * ⚠️ CE FILET EST GROSSIER, ET C'EST ASSUMÉ. `lean_protein` n'y figure
 * volontairement PAS: le groupe désigne aussi bien un blanc de poulet qu'un
 * tofu, et l'exclure interdirait le tofu à un végétarien — l'exact contraire
 * du but. La garantie ne repose donc pas sur les groupes, elle repose sur les
 * formes de surface ci-dessous. Les groupes servent au choix EN AMONT (ne pas
 * aller chercher un plat dans `red_meat`), la prose sert au verrou EN AVAL.
 */
const EXCLUDED_GROUPS: Record<DietaryRegime, readonly FoodGroupRef[]> = {
  vegetarian: ["red_meat", "poultry", "fatty_fish", "white_fish", "shellfish"],
  vegan: [
    "red_meat",
    "poultry",
    "fatty_fish",
    "white_fish",
    "shellfish",
    "eggs",
    "dairy_yogurt",
    "dairy_cheese",
  ],
  pescatarian: ["red_meat", "poultry"],
};

export function excludedGroupsFor(
  regime: DietaryRegime,
): readonly FoodGroupRef[] {
  return EXCLUDED_GROUPS[regime];
}

// ---------------------------------------------------------------------------
// Les formes de surface — EN + FR, écrites à la main
// ---------------------------------------------------------------------------
//
// Le dépôt a déjà payé « la garde testée dans une seule langue » (`not` ne
// couvrait pas `doesn't`). Le contenu ici est en français ET en anglais parce
// que `content_locale` vaut fr-FR par défaut sur ce produit, et qu'un plan
// français rempli de « lardons » passerait une garde qui ne connaît que
// « bacon ».

/** Chairs terrestres, et les mots qui ne disent pas « viande ». */
const MEAT_FORMS = [
  // EN
  "meat", "beef", "steak", "pork", "lamb", "mutton", "veal", "venison",
  "bacon", "ham", "sausage", "salami", "chorizo", "pancetta", "prosciutto",
  "pepperoni", "charcuterie", "pate", "liver", "duck fat",
  "gelatin", "gelatine", "lard", "tallow", "suet", "bone broth",
  // FR
  "viande", "boeuf", "bœuf", "porc", "agneau", "mouton", "veau", "gibier",
  "lardons", "jambon", "saucisse", "saucisson", "chorizo", "poitrine fumee",
  "poitrine fumée", "rillettes", "foie", "graisse de canard",
  "gelatine", "gélatine", "saindoux", "bouillon de viande", "os a moelle",
] as const;

/** Volailles. Séparées de la viande pour le pescatarien, qui les exclut aussi. */
const POULTRY_FORMS = [
  // EN
  "chicken", "poultry", "turkey", "duck", "goose", "guinea fowl",
  "chicken stock", "chicken broth", "chicken bouillon",
  // FR
  "poulet", "volaille", "dinde", "canard", "oie", "pintade",
  "bouillon de volaille", "bouillon de poule", "fond de volaille",
] as const;

/** Poissons, fruits de mer, et les condiments qui en contiennent sans le dire. */
const SEAFOOD_FORMS = [
  // EN
  "fish", "seafood", "salmon", "tuna", "cod", "haddock", "hake", "sea bass",
  "mackerel", "herring", "sardine", "anchovy", "anchovies", "trout",
  "shrimp", "prawn", "crab", "lobster", "mussel", "clam", "oyster",
  "scallop", "squid", "calamari", "octopus", "surimi",
  "fish sauce", "worcestershire", "oyster sauce", "fish stock",
  // FR
  "poisson", "fruits de mer", "saumon", "thon", "cabillaud", "morue",
  "colin", "merlu", "bar", "maquereau", "hareng", "sardine", "anchois",
  "truite", "crevette", "gambas", "crabe", "homard", "moule", "palourde",
  "huitre", "huître", "saint-jacques", "calamar", "encornet", "poulpe",
  "nuoc-mam", "nuoc mam", "sauce de poisson", "fumet de poisson",
] as const;

/** Œufs, et ce qui en est fait. */
const EGG_FORMS = [
  // EN
  "egg", "eggs", "omelette", "omelet", "frittata", "mayonnaise", "mayo",
  "aioli", "meringue", "custard", "hollandaise",
  // FR
  "oeuf", "œuf", "oeufs", "œufs", "omelette", "mayonnaise", "aioli", "aïoli",
  "meringue", "creme anglaise", "crème anglaise", "hollandaise",
] as const;

/** Produits laitiers, et le miel — que le véganisme exclut aussi. */
const DAIRY_AND_HONEY_FORMS = [
  // EN
  "milk", "cream", "butter", "ghee", "cheese", "parmesan", "mozzarella",
  "feta", "yogurt", "yoghurt", "creme fraiche", "mascarpone", "ricotta",
  "whey", "casein", "honey",
  // FR
  "lait", "creme", "crème", "beurre", "fromage", "parmesan", "mozzarella",
  "feta", "yaourt", "creme fraiche", "crème fraîche", "mascarpone",
  "ricotta", "petit-lait", "caseine", "caséine", "miel",
] as const;

const REGIME_FORMS: Record<DietaryRegime, readonly (readonly string[])[]> = {
  vegetarian: [MEAT_FORMS, POULTRY_FORMS, SEAFOOD_FORMS],
  vegan: [
    MEAT_FORMS,
    POULTRY_FORMS,
    SEAFOOD_FORMS,
    EGG_FORMS,
    DAIRY_AND_HONEY_FORMS,
  ],
  pescatarian: [MEAT_FORMS, POULTRY_FORMS],
};

/**
 * LES ANALOGUES VÉGÉTAUX — et le défaut qu'ils gardent.
 *
 * ── MESURÉ EN RUN RÉEL, 2026-08-11 ─────────────────────────────────────────
 * Génération pour un élève végan: le modèle a composé trois plats au
 * « unsweetened soy yogurt » — exactement ce qu'il fallait faire. La garde a
 * mordu dessus, parce que `yogurt` est dans les formes laitières et que
 * « soy yogurt » le contient.
 *
 * Conséquence si on ne corrige pas: le verrou, une fois câblé en REJET DUR,
 * viderait les plans des végans — les seuls qu'il existe pour protéger. Une
 * garde qui casse précisément sur sa population cible est pire qu'une garde
 * absente, parce qu'elle a l'air de marcher.
 *
 * C'est la famille « laitue ≠ lait », prise par l'autre bout: ici le terme
 * animal est bien présent, mais un marqueur le désamorce.
 *
 * ── LA RÈGLE ───────────────────────────────────────────────────────────────
 * Un ingrédient qui porte un marqueur d'origine végétale n'est JAMAIS une
 * violation d'origine animale. Vaut pour toutes les familles, pas seulement le
 * laitier: « vegan chicken », « soy sausage » et « fromage végétal » tombent
 * sous la même règle.
 *
 * Liste FERMÉE et écrite à la main, comme le reste du fichier. Un marqueur
 * absent laisse le comportement d'avant (le terme mord), donc l'ajout ne peut
 * pas ÉLARGIR une faille — il ne peut que rendre un faux positif au silence.
 */
/**
 * ── POURQUOI DEUX LISTES ET PAS UNE INFÉRENCE ──────────────────────────────
 * La première version de cette garde cherchait des MARQUEURS (« soja »,
 * « riz », « amande ») en mot entier. Le test symétrique l'a tuée en une
 * ligne: **« riz au lait » contient le mot « riz »** et devenait un analogue
 * végétal — alors que c'est un dessert laitier. Le français fait la
 * différence par la seule préposition (« lait de riz » ≠ « riz au lait »), ce
 * qu'aucune heuristique de mots ne rattrapera.
 *
 * On revient donc à la doctrine du fichier, la même que
 * `allergen_surface_forms.ts`: **liste plate, fermée, écrite à la main. Jamais
 * une inférence.**
 */

/**
 * Les mots qui, SEULS, suffisent — parce qu'aucun produit animal ne les porte.
 * « vegan cheese » est végétal quoi qu'il suive; « tofu » n'a pas d'ambiguïté.
 */
const UNAMBIGUOUS_PLANT_WORDS = [
  "vegan", "vegane", "veganes", "vegetal", "vegetale", "vegetaux", "vegetales",
  "plant based", "plantbased", "dairy free", "meat free", "tofu", "seitan",
  "tempeh", "sans lait", "sans viande", "sans produits laitiers",
] as const;

/**
 * Les analogues nommés, un par un. Une entrée absente laisse le comportement
 * d'avant (le terme mord) — l'ajout ne peut donc pas ÉLARGIR une faille, il ne
 * peut que rendre un faux positif au silence.
 */
const PLANT_ANALOGUE_PHRASES = [
  // laits et boissons
  "soy milk", "soya milk", "almond milk", "oat milk", "rice milk",
  "coconut milk", "cashew milk", "hemp milk", "nut milk",
  "lait de soja", "lait d amande", "lait d amandes", "lait d avoine",
  "lait de riz", "lait de coco", "lait de cajou", "lait de chanvre",
  "boisson au soja", "boisson a l avoine", "boisson d amande",
  // yaourts
  "soy yogurt", "soya yogurt", "soy yoghurt", "coconut yogurt",
  "almond yogurt", "oat yogurt",
  "yaourt de soja", "yaourt au soja", "yaourt de coco", "yaourt vegetal",
  // crèmes et beurres
  "soy cream", "oat cream", "coconut cream", "cashew cream",
  "creme de soja", "creme d avoine", "creme de coco",
  "peanut butter", "almond butter", "cashew butter", "nut butter",
  "beurre de cacahuete", "beurre d amande", "purée d amande",
  // fromages et œufs
  "nutritional yeast", "levure maltee", "levure nutritionnelle",
  "faux mage", "fromage de noix",
  // simili-carnés
  "soy sausage", "soy mince", "soy chunks", "textured soy",
  "saucisse de soja", "protéines de soja", "proteines de soja",
] as const;

/**
 * Ce terme est-il un analogue végétal ?
 *
 * Normalisation par `normalizeForMatch` — le moteur du dépôt, jamais une
 * seconde.
 */
export function isPlantAnalogue(term: string): boolean {
  const hay = canonical(term);
  if (!hay) return false;

  const words = new Set(hay.split(" ").filter(Boolean));
  for (const w of UNAMBIGUOUS_PLANT_WORDS) {
    const n = canonical(w);
    if (!n) continue;
    if (n.includes(" ") ? hay.includes(n) : words.has(n)) return true;
  }
  for (const phrase of PLANT_ANALOGUE_PHRASES) {
    const n = canonical(phrase);
    if (n && hay.includes(n)) return true;
  }
  return false;
}

/**
 * `normalizeForMatch` conserve tirets et apostrophes (« plant-based butter »,
 * « lait d'amande »). Pour comparer des LOCUTIONS, on les réduit d'abord à des
 * mots séparés par une seule espace — sinon « plant based » ne trouve jamais
 * « plant-based ». La normalisation de fond reste celle du dépôt; ceci n'est
 * qu'un aplatissement de ponctuation par-dessus, pas un second normaliseur.
 */
function canonical(text: string): string {
  return normalizeForMatch(String(text ?? ""))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Tout ce qu'un régime exclut, en formes de prose, dédupliqué et trié.
 *
 * C'est CETTE sortie qui alimente la liste d'évitement et le matcher — jamais
 * le jeton du régime lui-même (voir l'avertissement en tête de fichier).
 *
 * Trié pour que la sortie soit stable: une consigne dont l'ordre bouge à
 * chaque appel casse le cache de prompt et rend les tests d'égalité de chaînes
 * impossibles à écrire.
 */
export function excludedSurfaceFormsFor(regime: DietaryRegime): string[] {
  const seen = new Set<string>();
  for (const family of REGIME_FORMS[regime]) {
    for (const form of family) seen.add(form);
  }
  return [...seen].sort();
}

/**
 * La ligne de consigne d'un régime, en anglais (le modèle lit de l'anglais).
 *
 * EN NÉGATIF EXPLICITE ET NOMMÉ. Une consigne qui dirait seulement « this
 * student is vegan » compte sur la culture du modèle pour dériver la liste —
 * et c'est exactement là que passent le nuoc-mâm et la gélatine. On nomme les
 * familles, et on dit que la règle vaut jusque dans les fonds, sauces et
 * garnitures, parce que c'est là qu'elle se perd.
 */
export function dietaryRegimePromptLine(regime: DietaryRegime): string {
  const head: Record<DietaryRegime, string> = {
    vegetarian:
      "This student is VEGETARIAN: no meat, no poultry, no fish and no seafood — ever.",
    vegan:
      "This student is VEGAN: no meat, no poultry, no fish, no seafood, no eggs, " +
      "no dairy and no honey — ever.",
    pescatarian:
      "This student is PESCATARIAN: no meat and no poultry. Fish and seafood are fine.",
  };
  return `${head[regime]} This holds for stocks, sauces, fats and garnishes too — ` +
    `fish sauce, anchovy in a dressing, gelatine in a dessert, lard in a pastry ` +
    `and chicken stock in a "vegetable" soup all break it. If a dish only works ` +
    `with one of these, choose a different dish rather than a version that omits it.`;
}

/**
 * Ce qu'un régime rend structurellement incouvrable par l'aliment seul.
 *
 * ── POURQUOI CETTE FONCTION EXISTE ─────────────────────────────────────────
 * Un plan végan sans B12 n'est pas un plan médiocre, c'est un plan carencé —
 * la B12 n'existe pas dans le règne végétal en quantité utile. Le produit ne
 * peut pas la mettre dans l'assiette, et il ne doit pas non plus faire comme
 * si de rien n'était: se taire ici reviendrait à livrer une carence en
 * silence.
 *
 * Ce que le produit fait, et la limite: il SIGNALE (drapeau de couverture),
 * il ne prescrit pas. Recommander une supplémentation est un acte que
 * `CONTRACT.md` réserve au clinicien — la frontière est la même que pour les
 * maladies déclarées: on nomme, on n'ordonne pas.
 *
 * Rendu en jetons de sentinelle, consommés par le système de couverture.
 */
export function uncoverableSentinelsFor(regime: DietaryRegime): string[] {
  switch (regime) {
    case "vegan":
      // La B12 seule est catégorique. Le fer et le zinc végétaux sont moins
      // biodisponibles mais restent atteignables par l'aliment — les mettre
      // ici crierait au loup sur des trous que le plan sait combler.
      return ["b12_source"];
    case "vegetarian":
      // Œufs et laitages portent la B12. Rien d'incouvrable.
      return [];
    case "pescatarian":
      return [];
  }
}
