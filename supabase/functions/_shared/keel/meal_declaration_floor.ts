/**
 * LE PLANCHER DÉTERMINISTE DE LA DÉCLARATION DE REPAS.
 *
 * ── LE DÉFAUT MESURÉ (QA WEB L3-bis, run réel, 2026-08-04) ──────────────────
 * La MÊME phrase, jouée quatre fois sur quatre élèves neufs correctement
 * provisionnés (plan publié + engagements) :
 *
 *   « j'ai mangé du poulet »                              → [1, 1, 1, 1]  ✅
 *   « Poulet grillé, riz complet et brocolis à midi »     → [0, 3, 3, 0]  🔴
 *   « Grilled salmon with quinoa and green beans for dinner » → [0,0,0,0] 🔴
 *
 * Une déclaration COMPLÈTE, AU PASSÉ, SANS AMBIGUÏTÉ — la meilleure qu'un élève
 * puisse écrire — n'était enregistrée qu'une fois sur deux en français et
 * JAMAIS en anglais. Pendant ce temps la réponse confirmait le repas :
 * « That sounds like a solid dinner: protein from the salmon, carbs from the
 * quinoa, and veg from the green beans. »
 *
 * C'est l'accusé fantôme, sur la donnée qui FAIT le produit : tout ce que le
 * coach voit de la semaine de son élève est construit là-dessus. Un élève
 * assidu qui dîne tous les soirs apparaissait silencieux.
 *
 * ── POURQUOI UN PLANCHER, ET PAS UN MEILLEUR PROMPT ─────────────────────────
 * L'instabilité `[0, 3, 3, 0]` sur une phrase IDENTIQUE le tranche : ce n'est
 * pas une règle mal écrite, c'est un tirage. Ce dépôt a déjà mesuré que les
 * correctifs prompt-only régressent en run réel (`p8-revalidation-rose-reds`),
 * et il s'est déjà donné la règle : **ce qui OUVRE un effet durable ne transite
 * pas par le LLM du dispatcher** (plancher TCA, gate `plan_question`,
 * `keel_student`, et le plancher d'allergie posé le même jour).
 *
 * ── CE QU'IL FAIT, ET SURTOUT CE QU'IL NE FAIT PAS ──────────────────────────
 * Il ne remplace pas le dispatcher : il garantit un PLANCHER. Si le frame porte
 * déjà un `log_protocol_event`, ce module ne fait RIEN — le payload du modèle
 * est plus riche (quantités, notes, liaison à un engagement).
 *
 * Il ne DEVINE aucun aliment. Le lexique est une table FERMÉE, écrite à la
 * main, et un mot absent de la table ne devient pas un fait — exactement la
 * règle que `readComponents` énonce déjà : « only what the payload EXPLICITLY
 * names becomes a fact ». Un plancher qui inventerait un groupe alimentaire
 * serait pire que l'absence de plancher.
 *
 * Il ne lit PAS l'horloge, et ne déduit donc jamais un créneau de l'heure
 * qu'il est — c'est `slotKeyNamedIn` qui s'en charge, avec la même règle.
 *
 * ── L'ASYMÉTRIE ─────────────────────────────────────────────────────────────
 * Sur-déclarer écrit un fait de trop, que l'élève peut corriger (le flow de
 * correction existe et amende sans doubler). Sous-déclarer perd le repas en
 * silence pendant que la réponse affirme le contraire. Seul le premier est
 * récupérable — d'où un lexique large sur les aliments et une porte ÉTROITE
 * sur ce qui compte comme déclaration.
 */

import { type FoodGroupRef, parseFoodGroupRef } from "./tokens.ts";

/** Un aliment reconnu dans les mots de l'élève. */
export type DeclaredComponent = {
  food_group_ref: FoodGroupRef;
  /** Le terme exact qui a mordu, pour que le log soit lisible. */
  matched: string;
};

export type MealDeclarationHit = {
  components: DeclaredComponent[];
  /** Les mots de l'élève, tels quels. */
  studentNote: string;
  /** Ce qui a ouvert la porte: verbe au passé, ou groupe nominal + créneau. */
  gate: "past_tense_verb" | "noun_phrase_with_slot";
};

function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * LE LEXIQUE. Table FERMÉE, FR + EN, terme → groupe alimentaire.
 *
 * Chaque entrée est un mot que l'élève écrit vraiment. Aucune inférence : un
 * plat composé (« lasagnes », « couscous royal ») n'est PAS décomposé — on ne
 * sait pas ce qu'il y avait dedans, et un plancher qui le devinerait écrirait
 * un fait que personne n'a dit.
 *
 * L'ordre n'a pas d'importance ici : la recherche trie par longueur décroissante
 * pour que « brown rice » gagne sur « rice », et « green beans » sur « beans ».
 */
const FOOD_LEXICON: Readonly<Record<string, readonly string[]>> = {
  poultry: [
    "chicken", "poulet", "turkey", "dinde", "chicken breast", "blanc de poulet",
    "escalope de poulet", "cuisse de poulet", "duck", "canard",
  ],
  red_meat: [
    "beef", "boeuf", "steak", "lamb", "agneau", "pork", "porc", "veal", "veau",
    "mince", "viande hachee", "entrecote", "bavette", "ham", "jambon", "bacon",
  ],
  fatty_fish: [
    "salmon", "saumon", "mackerel", "maquereau", "sardine", "sardines",
    "herring", "hareng", "trout", "truite", "anchovy", "anchois", "tuna", "thon",
  ],
  white_fish: [
    "cod", "cabillaud", "haddock", "eglefin", "sole", "hake", "merlu",
    "sea bass", "bar", "pollock", "colin", "white fish", "poisson blanc",
  ],
  shellfish: [
    "prawn", "prawns", "shrimp", "crevette", "crevettes", "crab", "crabe",
    "lobster", "homard", "mussel", "mussels", "moules", "oyster", "huitres",
    "scallop", "scallops", "saint jacques", "calamari", "calamars",
  ],
  eggs: ["egg", "eggs", "oeuf", "oeufs", "omelette", "omelet", "scrambled eggs", "oeufs brouilles"],
  legumes: [
    "lentil", "lentils", "lentille", "lentilles", "chickpea", "chickpeas",
    "pois chiche", "pois chiches", "bean", "beans", "haricot", "haricots",
    "black beans", "kidney beans", "haricots rouges", "pois casses", "hummus", "houmous",
  ],
  tofu_tempeh: ["tofu", "tempeh", "seitan"],
  dairy_yogurt: ["yogurt", "yoghurt", "yaourt", "greek yogurt", "yaourt grec", "skyr", "fromage blanc"],
  dairy_cheese: [
    "cheese", "fromage", "cheddar", "mozzarella", "feta", "parmesan",
    "comte", "gruyere", "chevre", "goat cheese", "cottage cheese",
  ],
  whole_grain: [
    "brown rice", "riz complet", "wholemeal bread", "whole grain bread",
    "pain complet", "wholewheat pasta", "pates completes", "quinoa", "oats",
    "oatmeal", "porridge", "flocons d avoine", "avoine", "bulgur", "boulgour",
    "buckwheat", "sarrasin", "spelt", "epeautre", "barley", "orge", "farro",
  ],
  refined_grain: [
    "rice", "riz", "white rice", "riz blanc", "pasta", "pates", "spaghetti",
    "penne", "tagliatelle", "bread", "pain", "baguette", "toast", "tortilla",
    "wrap", "noodles", "nouilles", "couscous", "semoule", "white bread", "pain blanc",
    "cereal", "cereales", "croissant", "brioche", "sandwich",
  ],
  starchy_veg: [
    "potato", "potatoes", "pomme de terre", "pommes de terre", "patate",
    "patates", "sweet potato", "patate douce", "mash", "puree", "corn", "mais",
    "peas", "petits pois", "parsnip", "panais", "butternut", "squash", "courge",
  ],
  cruciferous_veg: [
    "broccoli", "brocoli", "brocolis", "cauliflower", "chou fleur",
    "brussels sprouts", "choux de bruxelles", "cabbage", "chou", "kale",
    "chou kale", "bok choy", "pak choi",
  ],
  leafy_greens: [
    "spinach", "epinard", "epinards", "lettuce", "laitue", "salad", "salade",
    "green salad", "salade verte", "rocket", "roquette", "watercress",
    "cresson", "mache", "chard", "blette", "blettes",
  ],
  non_starchy_veg: [
    "vegetable", "vegetables", "legume", "legumes verts", "veggies",
    "green beans", "haricots verts", "courgette", "zucchini", "aubergine",
    "eggplant", "pepper", "peppers", "poivron", "poivrons", "tomato",
    "tomatoes", "tomate", "tomates", "cucumber", "concombre", "carrot",
    "carrots", "carotte", "carottes", "onion", "oignon", "mushroom",
    "mushrooms", "champignon", "champignons", "asparagus", "asperges",
    "leek", "poireau", "poireaux", "fennel", "fenouil", "celery", "celeri",
    "green vegetables", "crudites", "ratatouille",
  ],
  berries: [
    "berry", "berries", "blueberry", "blueberries", "myrtille", "myrtilles",
    "strawberry", "strawberries", "fraise", "fraises", "raspberry",
    "raspberries", "framboise", "framboises", "blackberry", "mure", "mures",
  ],
  citrus: ["orange", "oranges", "clementine", "clementines", "mandarin", "mandarine", "grapefruit", "pamplemousse", "lemon", "citron"],
  other_fruit: [
    "apple", "apples", "pomme", "pommes", "banana", "bananas", "banane",
    "bananes", "pear", "poire", "peach", "peche", "apricot", "abricot",
    "grape", "grapes", "raisin", "raisins", "kiwi", "mango", "mangue",
    "pineapple", "ananas", "melon", "watermelon", "pasteque", "plum", "prune",
    "fruit", "fruits", "compote",
  ],
  nuts_seeds: [
    "nut", "nuts", "almond", "almonds", "amande", "amandes", "walnut",
    "walnuts", "noix", "cashew", "cashews", "noix de cajou", "hazelnut",
    "noisette", "noisettes", "pistachio", "pistache", "pistaches", "peanut",
    "peanuts", "cacahuete", "cacahuetes", "nut butter", "peanut butter",
    "beurre de cacahuete", "seeds", "graines", "chia", "flaxseed", "lin",
    "sunflower seeds", "graines de tournesol",
  ],
  olive_oil: ["olive oil", "huile d olive"],
  other_added_fat: ["butter", "beurre", "cream", "creme", "creme fraiche", "mayonnaise", "margarine", "avocado", "avocat"],
  sauce_dressing: ["sauce", "dressing", "vinaigrette", "gravy", "pesto", "ketchup", "bearnaise", "beurre blanc"],
  sugar_sweets: [
    "chocolate", "chocolat", "cake", "gateau", "biscuit", "biscuits",
    "cookie", "cookies", "candy", "bonbons", "dessert", "ice cream",
    "glace", "pastry", "patisserie", "tarte", "muffin", "donut", "beignet",
    "sweets", "sucreries", "moelleux au chocolat",
  ],
  fried_food: ["chips", "fries", "frites", "crisps", "fried chicken", "poulet frit", "nuggets", "tempura", "beignets"],
  alcohol: ["wine", "vin", "beer", "biere", "whisky", "vodka", "gin", "rum", "rhum", "champagne", "cocktail", "aperitif"],
  sweetened_beverage: ["coke", "cola", "coca", "soda", "sodas", "fizzy drink", "boisson sucree", "orange juice", "jus d orange", "juice", "jus de fruit", "smoothie", "energy drink"],
  water: ["water", "eau", "sparkling water", "eau petillante", "glass of water", "verre d eau"],
  coffee_tea: ["coffee", "cafe", "tea", "the", "espresso", "latte", "cappuccino", "herbal tea", "infusion", "tisane"],
};

type LexiconEntry = { ref: FoodGroupRef; term: string };

function buildIndex(): LexiconEntry[] {
  const out: LexiconEntry[] = [];
  for (const [ref, terms] of Object.entries(FOOD_LEXICON)) {
    let parsed: FoodGroupRef;
    try {
      parsed = parseFoodGroupRef(ref);
    } catch {
      // R7: une clé qui n'est pas un groupe du vocabulaire fermé est IGNORÉE,
      // jamais rapprochée. Elle ne peut donc pas produire de fait.
      continue;
    }
    for (const term of terms) {
      const normalized = normalize(term);
      if (normalized) out.push({ ref: parsed, term: normalized });
    }
  }
  // Les termes LONGS d'abord: « brown rice » doit gagner sur « rice »,
  // « green beans » sur « beans », « nut butter » sur « nut ».
  return out.sort((a, b) => b.term.length - a.term.length);
}

const INDEX = buildIndex();

/**
 * LES DEUX PORTES, et elles sont étroites.
 *
 * (1) Un VERBE de consommation AU PASSÉ, dans les mots de l'élève.
 * (2) Un GROUPE NOMINAL accompagné d'un mot de CRÉNEAU — c'est la forme qui
 *     échouait le plus (« Poulet grillé, riz complet et brocolis à midi ») et
 *     c'est celle qu'un élève écrit quand il note vite.
 */
const PAST_TENSE_GATES: readonly RegExp[] = [
  // EN
  /\bi (had|ate|have eaten|had had|just had|just ate|finished)\b/,
  /\bi (was|we were) (eating|having)\b/,
  /\bfor (breakfast|lunch|dinner) i (had|ate)\b/,
  /\b(breakfast|lunch|dinner|snack) (was|has been)\b/,
  /\bwe (had|ate)\b/,
  // FR — passé composé, les deux auxiliaires courants
  /\bj ai (mange|mangee|pris|prise|grignote|termine|fini|avale|degust)/,
  /\bon a (mange|pris)\b/,
  /\bje me suis (fait|prepare)\b/,
  /\b(petit dejeuner|dejeuner|diner|gouter|repas) (etait|c etait)\b/,
];

/** Les mots de créneau qui, seuls, suffisent à faire d'un groupe nominal une déclaration. */
const SLOT_MARKERS: readonly RegExp[] = [
  /\bfor (breakfast|lunch|dinner|brunch)\b/,
  /\bat (breakfast|lunch|dinner)\b/,
  /\b(this|last) (morning|lunchtime|evening|night)\b/,
  /\byesterday\b/,
  /\bce (matin|midi|soir)\b/,
  /\ba midi\b/,
  /\bau (petit dejeuner|dejeuner|diner|gouter)\b/,
  /\bhier (soir|midi)?\b/,
  /\ben (collation|entree)\b/,
  /\bpour le (petit dejeuner|dejeuner|diner|gouter)\b/,
];

/**
 * CE QUI DÉSARME LE PLANCHER, vérifié sur le message entier.
 *
 * Condition de désarmement explicite (doctrine P9): une ceinture sans elle est
 * une ceinture qu'on ne sait pas retirer. Chacune ferme un faux positif nommé.
 */
const DISARM: readonly RegExp[] = [
  // INTENTION FUTURE. Le prompt et la lane d'écriture l'excluent déjà; le
  // plancher doit l'exclure aussi, sinon il écrit ce qu'ils refusent.
  /\b(i m going to|i am going to|i ll|i will|later i|tonight i ll|tomorrow i)\b/,
  /\bi (plan|want|intend|was thinking)\b/,
  /\bje vais\b/,
  /\bje (compte|prevois|pense|voudrais|aimerais)\b/,
  /\bdemain\b/,
  /\bce soir je\b/,
  // QUESTION. « what should I eat for dinner? » nomme des aliments sans en
  // déclarer aucun.
  /\?/,
  /\b(what|which|should i|can i|could i|is it ok|how about)\b/,
  /\b(qu est ce que|est ce que|je peux|puis je|c est quoi|combien)\b/,
  // NÉGATION.
  /\bi (didn t|did not|haven t|have not|couldn t) (eat|have)\b/,
  /\bje n ai (pas|rien) (mange|pris)\b/,
  /\brien mange\b/,
  // QUELQU'UN D'AUTRE.
  /\b(my|his|her|their|our) (son|daughter|child|kid|wife|husband|partner|mother|father|mum|mom|dad|friend|colleague)\b/,
  /\b(mon|ma|mes) (fils|fille|enfant|femme|mari|conjoint|mere|pere|ami|amie|collegue)\b/,
  // HYPOTHÈSE.
  /\b(if i|si je|suppose|imagine)\b/,
  // CONSIGNE DU COACH rapportée, pas un repas mangé.
  /\b(you said|tu as dit|le coach|my coach) /,
];

/**
 * Le plancher. Rend `null` dès qu'il n'est pas SÛR — jamais une approximation.
 *
 * @param userMessage le message BRUT de l'élève.
 * @param slotNamed le créneau que `slotKeyNamedIn` a déjà lu, s'il y en a un.
 */
export function detectDeclaredMeal(
  userMessage: unknown,
  slotNamed: string | null = null,
): MealDeclarationHit | null {
  const raw = String(userMessage ?? "").trim();
  if (!raw) return null;
  // Un copier-coller n'est pas une déclaration de repas.
  if (raw.length > 600) return null;
  const text = ` ${normalize(raw)} `;
  if (!text.trim()) return null;

  for (const disarm of DISARM) {
    if (disarm.test(text)) return null;
  }

  const pastTense = PAST_TENSE_GATES.some((re) => re.test(text));
  const hasSlot = slotNamed !== null || SLOT_MARKERS.some((re) => re.test(text));
  if (!pastTense && !hasSlot) return null;

  // Les aliments, terme le plus long d'abord, sans chevauchement: une fois
  // « brown rice » consommé, « rice » ne peut plus mordre sur les mêmes
  // caractères.
  let remaining = text;
  const components: DeclaredComponent[] = [];
  const seen = new Set<string>();
  for (const entry of INDEX) {
    const boundary = new RegExp(`(^|\\s)${entry.term}(\\s|$)`);
    if (!boundary.test(remaining)) continue;
    remaining = remaining.replace(new RegExp(`(^|\\s)${entry.term}(\\s|$)`, "g"), " ");
    if (seen.has(entry.ref)) continue;
    seen.add(entry.ref);
    components.push({ food_group_ref: entry.ref, matched: entry.term });
  }

  if (components.length === 0) return null;

  return {
    components,
    studentNote: raw.slice(0, 2000),
    gate: pastTense ? "past_tense_verb" : "noun_phrase_with_slot",
  };
}
