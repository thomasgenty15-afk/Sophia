/**
 * FF-037 — L'ANCRE PROTÉIQUE : est-ce que ce plat porte de quoi tenir ?
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-037-l-ancre-proteique.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (§1 rang 2, §6 étape 1).
 *
 * ── LA QUESTION EXACTE, ET CELLE QU'ON NE POSE PAS ────────────────────────
 * On répond à « ce plat contient-il un aliment protéique ? ». On ne répond PAS
 * à « en contient-il assez ? » — cette seconde question demande un référentiel
 * de composition (FF-038) et se tranche en GRAMMES CALCULÉS dans le verdict de
 * FF-039. Ici, « deux œufs » et « une omelette de six » sont indiscernables, et
 * c'est assumé: mieux vaut une garantie grossière et vraie qu'une précision
 * inventée. Le produit refuse le chiffre sur la personne; il ne s'autorise pas
 * pour autant à l'estimer en silence.
 *
 * ── POURQUOI PAS DE SECOND MOTEUR DE MATCHING ─────────────────────────────
 * `findForbiddenMatches` / `normalizeForMatch` (`forbidden_matcher.ts`) sont LE
 * matcher du dépôt, et son en-tête documente ce qu'a coûté d'en avoir eu deux:
 * la liste qu'on édite le moins garde l'ancien comportement, et personne ne le
 * voit. On paie ici un léger inconfort (les formes de surface sont écrites pour
 * un matcher de PROSE, appliqué à des NOMS) plutôt que ce défaut-là.
 *
 * ── MODE AUDIT: LES NÉGATIONS NE SONT PAS BLANCHIES ───────────────────────
 * `allowNegatedMentions: false`. Les exceptions de négation de
 * `forbidden_matcher.ts` existent pour de la PROSE sur la méthode d'un coach
 * (« your coach doesn't do six small meals »). Un terme d'ingrédient est un
 * NOM — « blanc de poulet », « haricots rouges ». Y appliquer une grammaire de
 * phrase ferait blanchir des ingrédients réels sur des collisions de mots, et
 * blanchir un ingrédient réel ici veut dire nier une ancre qui est dans
 * l'assiette. Même posture que `sanitizePortionNote`.
 *
 * ── DEUX LANGUES, ET LE DÉPÔT SAIT POURQUOI ───────────────────────────────
 * Le produit compose en anglais et la base porte des plats français. Une garde
 * testée dans une seule langue est une garde à moitié armée: `forbidden_matcher`
 * a payé « `not` ne couvre pas `doesn't` », et le test qui l'épinglait
 * n'existait qu'en français. Les deux listes vivent donc côte à côte, et les
 * deux sont testées.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";
import {
  type FoodGroupRef,
  PROTEIN_SOURCES,
  type ProteinSourceGroup,
} from "./tokens.ts";
// ── IMPORT DE TYPE UNIQUEMENT, ET C'EST STRUCTUREL ────────────────────────
// `meal_generation.ts` importe CE module. Un import de VALEUR ici fermerait le
// cycle, et un cycle de modules ESM ne casse pas à la compilation: il casse au
// chargement, sur la première constante évaluée dans le mauvais ordre
// (« Cannot access 'EATING_OCCASIONS' before initialization »), c'est-à-dire en
// production, sur la lane qui compose les repas. Un `import type` est effacé à
// l'exécution: il n'y a plus de cycle, et la vérification de type reste.
import type { MealSlot } from "./meal_generation.ts";

/**
 * LES CRÉNEAUX OÙ L'ANCRE EST ATTENDUE.
 *
 * Les trois repas d'une journée, pas les faims d'entre-deux. Une collation sans
 * protéine est une collation; l'exiger transformerait « une pomme à 16h » en
 * anomalie, ce qui est faux et ce qui noierait les vrais constats.
 *
 * `before_bed` est traité comme une collation: ce que le produit propose là est
 * un en-cas, pas un quatrième repas, et le rythme le nomme « something before
 * bed ».
 *
 * ── UNE LISTE LITTÉRALE, PAS UN `EATING_OCCASIONS.filter(...)` ────────────
 * Le filtre aurait paru plus sûr et l'aurait été moins: un jeton renommé lui
 * fait rendre un tableau plus court, en silence, et la garde se désarme sans
 * que rien n'échoue. Le littéral typé `readonly MealSlot[]` fait échouer la
 * COMPILATION sur le même renommage. C'est la différence entre une garde qui
 * prévient et une garde qui s'éteint.
 */
export const MAIN_MEAL_SLOTS: readonly MealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
];

/**
 * Un plat de ce créneau doit-il porter une ancre ?
 *
 * `null` rend FALSE, et c'est un arbitrage: un plat dont le créneau n'est pas
 * nommé ne peut pas être PROUVÉ principal. Le pénaliser inventerait un fait, et
 * un fait inventé au parseur devient une relance facturée puis une issue que
 * personne ne sait interpréter. Le legacy `snack` rend false pour la même
 * raison qu'un `snack_pm`.
 */
export function isMainMealSlot(slot: MealSlot | null): boolean {
  if (slot === null) return false;
  return MAIN_MEAL_SLOTS.includes(slot);
}

/**
 * LES FORMES DE SURFACE, PAR GROUPE — EN puis FR.
 *
 * ── CE QUI DÉCIDE D'UNE ENTRÉE ────────────────────────────────────────────
 * Une forme entre ici quand elle désigne SANS AMBIGUÏTÉ un aliment du groupe.
 * « beans » tout court n'y est pas: « green beans » sont un légume, et la forme
 * nue ferait donc compter une poêlée de haricots verts comme une ancre. Idem
 * « haricot » en français. Les formes composées les couvrent (« kidney beans »,
 * « haricots rouges ») et les cas manquants ressortent comme issues — c'est-à-
 * dire visibles, ce qu'un faux positif n'est jamais.
 *
 * ── LA RÈGLE DE CROISSANCE ────────────────────────────────────────────────
 * On ajoute ce qu'une MESURE a montré absent (FF-037 §10, le taux de faux
 * positifs jugé à la main sur un échantillon), jamais ce qu'on imagine. Un
 * lexique gonflé à l'intuition finit par apparier des mots qui ne sont pas des
 * aliments.
 *
 * ── LE PLURIEL FRANÇAIS EST ÉCRIT À LA MAIN, ET IL LE FAUT ────────────────
 * `tokenPattern` tolère un `s` final — et UNIQUEMENT final: « kidney bean »
 * couvre « kidney beans » parce que l'anglais n'accorde que le dernier mot. Le
 * français accorde TOUS les mots: « haricots rouges » porte deux `s`, dont un
 * au milieu du motif, et « haricot rouge » ne le matche pas. Mesuré: le test
 * de ce module est tombé dessus au premier passage.
 *
 * Les deux formes sont donc écrites pour chaque locution française accordée.
 * Générer le pluriel serait écrire un second moteur de morphologie à côté du
 * matcher partagé — exactement ce que l'en-tête de ce fichier refuse.
 *
 * ── LES LIGATURES ─────────────────────────────────────────────────────────
 * `normalizeForMatch` décompose en NFD et retire les diacritiques; elle NE
 * décompose PAS `œ` (U+0153), qui est une ligature et non une lettre accentuée.
 * « œuf » et « oeuf » restent donc deux chaînes différentes, et les deux sont
 * écrites. C'est la même cicatrice que `normalizePantryTerm`, réglée ici sans
 * élargir la normalisation partagée — on ne touche pas au verrou médical pour
 * faire plaisir à un détecteur d'ancre.
 *
 * ── CE QUI N'Y EST DÉLIBÉRÉMENT PAS ───────────────────────────────────────
 * Le LAIT. Il ne relève d'aucun des trente groupes (`dairy_yogurt` et
 * `dairy_cheese` sont les deux seuls laitiers, et le lait n'est ni l'un ni
 * l'autre). L'y ranger serait mentir sur la taxonomie pour gagner un
 * appariement; un filet de lait dans des flocons d'avoine n'est de toute façon
 * pas une ancre.
 */
const PROTEIN_SURFACE_FORMS: Record<ProteinSourceGroup, readonly string[]> = {
  lean_protein: [
    // EN
    "turkey breast",
    "pork loin",
    "pork tenderloin",
    "whey protein",
    "protein powder",
    "ham",
    "gammon",
    // FR
    "blanc de dinde",
    "blancs de dinde",
    "filet mignon",
    "filets mignons",
    "jambon",
    "proteine en poudre",
    "whey",
  ],
  fatty_fish: [
    // EN
    "salmon",
    "mackerel",
    "sardine",
    "trout",
    "herring",
    "anchovy",
    "anchovies",
    // FR
    "saumon",
    "maquereau",
    "truite",
    "hareng",
    "anchois",
  ],
  white_fish: [
    // EN
    "cod",
    "haddock",
    "sea bass",
    "pollock",
    "hake",
    "plaice",
    "tuna",
    "white fish",
    // FR
    "cabillaud",
    "morue",
    "eglefin",
    "bar",
    "colin",
    "merlu",
    "lieu noir",
    "lieux noirs",
    "thon",
    "poisson blanc",
    "poissons blancs",
  ],
  shellfish: [
    // EN
    "prawn",
    "shrimp",
    "mussel",
    "squid",
    "calamari",
    "scallop",
    "crab",
    "lobster",
    // FR
    "crevette",
    "moule",
    "calamar",
    "encornet",
    "saint jacques",
    "noix de saint jacques",
    "crabe",
    "homard",
  ],
  poultry: [
    // EN
    "chicken",
    "turkey",
    "duck breast",
    "poultry",
    // FR
    "poulet",
    "volaille",
    "dinde",
    "magret",
    "escalope de dinde",
    "escalopes de dinde",
  ],
  red_meat: [
    // EN
    "beef",
    "steak",
    "lamb",
    "pork chop",
    "mince",
    "veal",
    // FR
    "boeuf",
    "bœuf",
    "agneau",
    "cote de porc",
    "cotes de porc",
    "porc",
    "veau",
    "steak hache",
    "steaks haches",
    "viande hachee",
    "viandes hachees",
  ],
  eggs: [
    // EN
    "egg",
    "omelette",
    "omelet",
    "frittata",
    // FR
    "oeuf",
    "œuf",
  ],
  legumes: [
    // EN — jamais « beans » nu: voir l'en-tête de cette table.
    "lentil",
    "chickpea",
    "chick pea",
    "kidney bean",
    "black bean",
    "white bean",
    "cannellini bean",
    "borlotti bean",
    "butter bean",
    "haricot bean",
    "baked bean",
    "pinto bean",
    "broad bean",
    "soy bean",
    "soya bean",
    "split pea",
    "edamame",
    "hummus",
    "houmous",
    // FR
    "lentille",
    "pois chiche",
    "haricot rouge",
    "haricots rouges",
    "haricot blanc",
    "haricots blancs",
    "haricot noir",
    "haricots noirs",
    "flageolet",
    "feve",
    "houmous",
  ],
  tofu_tempeh: [
    // EN + FR (les trois mots s'écrivent pareil)
    "tofu",
    "tempeh",
    "seitan",
    "soya chunk",
    "proteine de soja",
    "soja texture",
    "soja texturee",
  ],
  dairy_yogurt: [
    // EN
    "yogurt",
    "yoghurt",
    "greek yogurt",
    "skyr",
    "kefir",
    "cottage cheese",
    "quark",
    // FR
    "yaourt",
    "yogourt",
    "fromage blanc",
    "faisselle",
    "petit suisse",
    "petits suisses",
    "kefir",
  ],
};

/**
 * LES FORMES QUI PORTENT UN MOT DE PROTÉINE ET NE SONT PAS UNE ANCRE.
 *
 * Liste FERMÉE, et elle gagne sur tout: un terme qui matche ici est disqualifié
 * avant même qu'on cherche une ancre dedans.
 *
 * ── POURQUOI ELLE EXISTE, MESURÉ SUR LA BASE ──────────────────────────────
 * « egg noodles » apparaît cinq fois dans les plats déjà générés. Sans cette
 * liste, un plat de nouilles aux œufs et légumes compterait comme porteur d'une
 * ancre — et le plat qui avait le plus besoin de la consigne serait exactement
 * celui qui y échapperait. Même mécanique pour les fonds et les bouillons: un
 * cube de bouillon de volaille n'a jamais nourri personne.
 *
 * Elle reste petite EXPRÈS. Chaque entrée est un cas où le mot ment sur
 * l'aliment; ce n'est pas un endroit où ranger les aliments faibles en
 * protéine, qui sont l'affaire du calcul en grammes de FF-039.
 */
const NON_ANCHOR_SURFACE_FORMS: readonly string[] = [
  // EN
  "stock",
  "broth",
  "gravy",
  "fish sauce",
  "oyster sauce",
  "worcestershire",
  "egg noodle",
  "egg wash",
  // FR
  "bouillon",
  "fond de veau",
  "fond de volaille",
  "fumet",
  "nuoc mam",
  "nouille aux oeufs",
  "nouilles aux oeufs",
  "nouille aux œufs",
  "nouilles aux œufs",
];

const NON_ANCHOR_TERMS: readonly ForbiddenTerm[] = [
  { ruleId: "non_anchor", token: "non_anchor", surfaceForms: NON_ANCHOR_SURFACE_FORMS },
];

const ANCHOR_TERMS: readonly ForbiddenTerm[] = PROTEIN_SOURCES.map((group) => ({
  ruleId: group,
  // Le slug lui-même n'est PAS une aiguille utile ("lean_protein" n'apparaît
  // dans aucune recette) mais `ForbiddenTerm` l'exige, et le passer garantit
  // qu'un groupe sans forme de surface serait visible plutôt que silencieux.
  token: group,
  surfaceForms: PROTEIN_SURFACE_FORMS[group],
}));

/** Le groupe protéique d'un terme d'ingrédient, ou `null`. */
export function proteinGroupOf(term: string): FoodGroupRef | null {
  const text = String(term ?? "").trim();
  if (!text) return null;
  // La disqualification passe AVANT la recherche: « egg noodles » ne doit pas
  // avoir l'occasion de matcher `eggs`.
  if (findForbiddenMatches(text, NON_ANCHOR_TERMS, { allowNegatedMentions: false }).length > 0) {
    return null;
  }
  const matches = findForbiddenMatches(text, ANCHOR_TERMS, {
    allowNegatedMentions: false,
  });
  if (matches.length === 0) return null;
  // `findForbiddenMatches` trie par offset puis par `ruleId`: la première
  // occurrence dans le terme gagne. Un terme qui nomme deux groupes
  // (« chicken and chickpea stew ») en porte bien deux, et n'importe lequel
  // suffit à répondre à la question posée.
  return matches[0].ruleId as FoodGroupRef;
}

/**
 * Ce plat porte-t-il une ancre protéique ?
 *
 * L'appelant décide de ce qu'il passe. `parseGeneratedMeal` passe l'UNION des
 * ingrédients du plat et de ceux des préparations qu'il consomme: un plat qui
 * puise dans un rôti de cuisses n'a pas à relister le poulet — c'est même
 * l'architecture qu'on lui a demandée (« a dish that draws on a preparation
 * does NOT repeat its recipe »).
 */
export function detectProteinAnchor(
  ingredients: readonly { term: string }[],
): boolean {
  for (const ing of ingredients ?? []) {
    if (proteinGroupOf(ing?.term ?? "") !== null) return true;
  }
  return false;
}

/**
 * LA LIGNE DE CONSIGNE, dans le prompt système.
 *
 * QUALITATIVE, et aucun chiffre — ni « 30-40 g », ni « un quart de l'énergie »,
 * ni « une palme ». Le gramme de nutriment est du mauvais côté de la frontière
 * aliment/personne, et un prompt qui en porte un le fait ressortir dans les
 * `why` visibles.
 *
 * Exportée comme constante nommée pour que le test du registre puisse la
 * passer au filtre numérique du produit: une règle qu'on vérifie à la main est
 * une règle qui dérive à la prochaine retouche.
 */
export const PROTEIN_ANCHOR_PROMPT_LINE =
  `== EVERY MAIN MEAL IS BUILT AROUND A PROTEIN FOOD ==

Breakfast, lunch and dinner each carry one whole protein food as their anchor:
meat, poultry, fish, seafood, eggs, pulses, tofu or tempeh, or a protein-carrying
dairy like yogurt, skyr or cottage cheese. It is the thing the rest of the plate
is built around, not a garnish on top of it.

Snacks are snacks. They do not need one.

Never write a figure for it. No grams of protein, no share of the plate, no
target of any kind — you are choosing a food, not measuring a person.`;

/**
 * L'INSTRUCTION DE RELANCE, quand au moins un repas principal n'a pas d'ancre.
 *
 * Patron `doctrineRetryInstruction` (`doctrine.ts`): une relance qui ne NOMME
 * pas ce qui a manqué est une relance qui rejoue le même dé. On nomme donc les
 * plats, par leur titre — jamais un chiffre, jamais un nom de nutriment
 * quantifié, jamais le vocabulaire du régime.
 *
 * La sortie de cette relance repasse par `parseGeneratedMeal` EN ENTIER
 * (verrous de sécurité, doctrine, filtres numériques, plafonds). Une sortie de
 * relance acceptée sur bonne mine est une sortie non vérifiée.
 */
export function proteinAnchorRetryInstruction(
  dishTitles: readonly string[],
): string {
  const bullets = [...new Set(dishTitles.map((t) => String(t ?? "").trim()).filter(Boolean))]
    .map((title) => `- "${title}"`);
  return [
    "Your previous answer left main meals without a protein anchor:",
    ...bullets,
    "Answer again, keeping everything else. Give each main meal a full protein " +
    "food as its anchor — meat, poultry, fish, seafood, eggs, pulses, tofu or " +
    "tempeh, or a protein-carrying dairy. Do not write any figure for it.",
  ].join("\n");
}
