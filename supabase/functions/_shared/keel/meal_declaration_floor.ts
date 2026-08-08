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

/**
 * LA RELATION AU PLAN (FF-009). `null` = inconnu, et c'est un ÉTAT.
 *
 * `off_plan` est la seule valeur que ce plancher produit. `as_planned` est
 * délibérément hors de sa portée: il n'existe que là où l'élève désigne
 * lui-même une ligne du plan — la coche d'un plat prévu, ou une liaison
 * explicite à un engagement. Le déduire d'un silence (« il a déclaré un repas
 * et n'a pas dit qu'il était hors plan, donc il était prévu ») fabriquerait de
 * l'adhérence à partir de rien, ce que FF-007 interdit globalement (« aucune
 * coche automatique, rien n'est jamais inféré d'un silence ») et que R5 de
 * FF-009 interdit nommément pour cette colonne.
 */
export type DeclaredPlanRelation = "off_plan";

export type MealDeclarationHit = {
  components: DeclaredComponent[];
  /** Les mots de l'élève, tels quels. */
  studentNote: string;
  /** Ce qui a ouvert la porte: verbe au passé, groupe nominal + créneau, ou marqueur hors-plan. */
  gate: "past_tense_verb" | "noun_phrase_with_slot" | "off_plan_marker";
  /**
   * FF-009 — `off_plan` si le message porte un marqueur de hors-plan, `null`
   * sinon. `null` ne devient JAMAIS `as_planned`.
   */
  planRelation: DeclaredPlanRelation | null;
  /** Le marqueur exact qui a mordu, pour que le log soit lisible. */
  offPlanMatched: string | null;
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
  // QUELQU'UN D'AUTRE — MAIS PAS QUAND C'EST UN LIEU (FF-009).
  //
  // ⚠️ La négation en tête est une CORRECTION, et elle vient d'un cas mesuré:
  // « j'ai mangé chez ma mère hier soir » était désarmé par ce motif, alors
  // que c'est l'élève qui a mangé — sa mère est l'adresse, pas le mangeur.
  // Le désarme visait « ma mère a mangé du poulet » et attrapait aussi le
  // hors-plan le plus courant de la fiche.
  //
  // La distinction est structurelle et pas heuristique: après « chez » (FR) ou
  // « at » (EN), un proche est un LIEU. Partout ailleurs, il reste un sujet et
  // le désarme mord comme avant — les deux directions sont testées.
  /(?<!at )\b(my|his|her|their|our) (son|daughter|child|kid|wife|husband|partner|mother|father|mum|mom|dad|friend|colleague)\b/,
  /(?<!chez )\b(mon|ma|mes) (fils|fille|enfant|femme|mari|conjoint|mere|pere|ami|amie|collegue)\b/,
  // HYPOTHÈSE.
  /\b(if i|si je|suppose|imagine)\b/,
  // CONSIGNE DU COACH rapportée, pas un repas mangé.
  /\b(you said|tu as dit|le coach|my coach) /,
  // FF-009 — QUELQU'UN D'AUTRE, la forme sans possessif. « On a commandé pour
  // les enfants » ne dit pas que l'élève a mangé. Le désarme « quelqu'un
  // d'autre » ci-dessus ne couvrait QUE les possessifs (`mes enfants`), donc
  // pas la formulation la plus courante quand on commande pour la maisonnée.
  /\bpour (les|mes|ses|leurs|nos) (enfants|petits|gosses|filles|garcons)\b/,
  /\bfor (the|my|our|their) (kids|children|kid|child|little ones)\b/,
];

// ---------------------------------------------------------------------------
// FF-009 — LE MARQUEUR DE HORS-PLAN
// ---------------------------------------------------------------------------

/**
 * LES MARQUEURS QUI SE SUFFISENT À EUX-MÊMES.
 *
 * Ils portent leur propre verbe au passé, donc ils ouvrent la porte SEULS —
 * y compris sans aucun aliment reconnu. C'est la différence de fond avec
 * `detectDeclaredMeal`, qui exige un composant, et c'est le CAS NOMINAL de
 * FF-009: « j'ai commandé » est très exactement ce qu'on cherche à capter, et
 * exiger un aliment le perdrait (R2).
 */
const OFF_PLAN_PAST_MARKERS: readonly RegExp[] = [
  // FR
  /\b(j ai|on a) commande[es]?\b/,
  /\bon s est fait livrer\b/,
  // ⚠️ « chez » N'EST PAS UN MARQUEUR À LUI SEUL. « J'ai mangé chez moi » est
  // le contraire d'un hors-plan, et c'est la frontière que la fiche nomme
  // explicitement. Le lieu doit donc ne PAS être la maison de l'élève, et
  // c'est dit par exclusion plutôt que par une liste de proches — une liste se
  // serait fait déborder au premier « chez ma tante ».
  /\b(j ai|on a) (dine|dejeune|mange|grignote) (?:au |a la |dehors\b|chez (?!moi\b|nous\b))/,
  /\bon est (alles?|allees?|sortis|sorties) (au|a la|manger|diner|dejeuner)\b/,
  /\b(j ai|on a) fait (un|une) (resto|restau|restaurant)\b/,
  // EN
  /\b(i|we) ordered\b/,
  /\b(i|we) (had|got|grabbed) (some )?(takeout|takeaway|delivery|a takeaway|a takeout)\b/,
  /\b(i|we) (ate|dined) out\b/,
  /\b(i|we) went (out to eat|out for dinner|out for lunch|to a restaurant)\b/,
];

/**
 * LES MARQUEURS DE LIEU, qui ont besoin d'une porte de `detectDeclaredMeal`.
 *
 * Ils disent OÙ, pas QUAND: « au resto » tout seul peut être un projet. Ils ne
 * qualifient donc un fait que si le message porte par ailleurs un verbe au
 * passé ou un mot de créneau.
 *
 * ── LA FRONTIÈRE, ET ELLE EST FINE ────────────────────────────────────────
 * « Chez ma mère » est hors plan, « chez moi » ne l'est pas: la liste ne nomme
 * QUE des lieux qui ne sont pas la cuisine de l'élève, donc « chez moi » ne
 * peut pas y mordre, par construction et pas par chance.
 * « On est sortis » est ambigu et reste dehors — il n'y entre qu'accompagné
 * d'un mot de repas, ce que porte la liste des marqueurs au passé.
 */
const OFF_PLAN_PLACE_MARKERS: readonly RegExp[] = [
  // FR
  /\bau (resto|restau|restaurant)\b/,
  /\ba emporter\b/,
  /\ben livraison\b/,
  /\bchez (des amis|des potes|un ami|une amie|ma mere|mon pere|mes parents|ma belle mere|mes beaux parents)\b/,
  /\bau (mariage|bapteme|anniversaire)\b/,
  /\ba la cantine\b/,
  /\bau (mcdo|kebab|fast food)\b/,
  // EN
  /\bat (a|the) restaurant\b/,
  /\bat (a )?(wedding|birthday|christening)\b/,
  /\bat (my )?(mum s|mom s|parents|friends|a friend s)\b/,
  /\b(takeout|takeaway)\b/,
  /\bat the canteen\b/,
  /\bat (mcdonalds|kfc|a fast food place)\b/,
];

export type OffPlanMarkerHit = {
  /** Le marqueur exact qui a mordu. */
  matched: string;
  /** `true` si le marqueur porte son propre passé et n'a besoin d'aucune autre porte. */
  selfSufficient: boolean;
};

// ---------------------------------------------------------------------------
// FF-009 §7 — « ON A COMMANDÉ POUR LES ENFANTS » → RIEN
// ---------------------------------------------------------------------------

/**
 * LE REPAS DE QUELQU'UN D'AUTRE, reconnu sur le MESSAGE et sans le modèle.
 *
 * ── LE DÉFAUT MESURÉ (run réel, 2026-08-08, 1 tour sur 3) ───────────────────
 *   élève  : « on a commandé pour les enfants »
 *   base   : une ligne `protocol_events` (aucun aliment, aucun créneau)
 *   attendu: RIEN (FF-009 §7)
 * Le plancher, lui, avait bien désarmé — son `DISARM` porte le motif depuis
 * FF-009. Mais désarmer le plancher n'empêche pas le dispatcher d'écrire: le
 * plancher est un MINIMUM, pas un veto. Le fait écrit dit « l'élève a mangé »
 * là où le message dit le contraire, dans une table APPEND-ONLY que le chat ne
 * sait pas rétracter, et l'évaluateur le comptera ce soir.
 *
 * Même forme, même place et même raison que la ceinture d'intention future
 * (`isTrackProgressFutureIntent`), qui a été posée pour l'exact symétrique:
 * une règle de prompt est une intention, pas une garantie.
 *
 * ── CONDITION DE DÉSARMEMENT (P9), et elle est la moitié de la ceinture ─────
 * Un message MIXTE — « j'ai mangé du poulet et on a commandé pour les
 * enfants » — porte un repas de l'élève ET un repas des enfants. La ceinture
 * se retire dès que l'élève dit, au passé et à la première personne, qu'il a
 * mangé: perdre son repas pour protéger celui des enfants coûterait plus cher
 * que le faux positif qu'on ferme.
 */
const MEAL_FOR_SOMEONE_ELSE: readonly RegExp[] = [
  /\bpour (les|mes|ses|leurs|nos) (enfants|petits|gosses|filles|garcons)\b/,
  /\bfor (the|my|our|their) (kids|children|kid|child|little ones)\b/,
];

/** Ce qui désarme: l'élève dit qu'il a mangé, lui, et au passé. */
const FIRST_PERSON_ATE: readonly RegExp[] = [
  /\bi (had|ate|have eaten|just had|just ate)\b/,
  /\bfor (breakfast|lunch|dinner) i (had|ate)\b/,
  /\bj ai (mange|mangee|pris|prise|grignote|termine|fini|avale|degust)/,
  /\bje me suis (fait|prepare)\b/,
];

export function isMealForSomeoneElse(userMessage: unknown): boolean {
  const raw = String(userMessage ?? "").trim();
  if (!raw) return false;
  const text = ` ${normalize(raw)} `;
  if (!MEAL_FOR_SOMEONE_ELSE.some((re) => re.test(text))) return false;
  return !FIRST_PERSON_ATE.some((re) => re.test(text));
}

/**
 * Le marqueur de hors-plan, DÉTERMINISTE et sans le modèle.
 *
 * Il ne DÉSARME pas: cette fonction ne fait que reconnaître un marqueur. Les
 * désarmes (intention future, tiers, question, négation) restent portés par
 * `detectDeclaredMeal`, qui les applique sur le message entier AVANT d'appeler
 * celle-ci — une seule liste de désarmes pour les deux reconnaissances, sinon
 * elles divergeraient au premier ajout.
 */
export function detectOffPlanMarker(userMessage: unknown): OffPlanMarkerHit | null {
  const raw = String(userMessage ?? "").trim();
  if (!raw) return null;
  const text = ` ${normalize(raw)} `;
  for (const marker of OFF_PLAN_PAST_MARKERS) {
    const match = marker.exec(text);
    if (match) return { matched: match[0].trim(), selfSufficient: true };
  }
  for (const marker of OFF_PLAN_PLACE_MARKERS) {
    const match = marker.exec(text);
    if (match) return { matched: match[0].trim(), selfSufficient: false };
  }
  return null;
}

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

  // FF-009 — LA TROISIÈME PORTE. Un marqueur qui porte son propre passé
  // (« j'ai commandé ») ouvre SEUL, y compris sans aucun aliment reconnu: c'est
  // le cas nominal du hors-plan, et exiger un composant le perdrait (R2). Un
  // marqueur de LIEU, lui, n'ouvre rien tout seul — il qualifie une porte que
  // le message a par ailleurs.
  const offPlan = detectOffPlanMarker(raw);
  const offPlanOpensTheDoor = offPlan?.selfSufficient === true;

  if (!pastTense && !hasSlot && !offPlanOpensTheDoor) return null;

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

  // ⚠️ LA LIGNE QUI CHANGE AVEC FF-009. Sans marqueur, un message sans aliment
  // reconnu ne produit toujours RIEN — c'est la règle « seul ce qui est nommé
  // devient un fait ». Avec un marqueur, le fait existe SANS aliment: « j'ai
  // commandé » est une soirée, et la perdre était le défaut à corriger.
  if (components.length === 0 && offPlan === null) return null;

  return {
    components,
    studentNote: raw.slice(0, 2000),
    gate: offPlanOpensTheDoor && !pastTense && !hasSlot
      ? "off_plan_marker"
      : pastTense
      ? "past_tense_verb"
      : "noun_phrase_with_slot",
    // R3: un hors-plan sans détail n'invente AUCUN `food_group_ref`. La
    // relation au plan est la SEULE chose que le marqueur ajoute.
    planRelation: offPlan === null ? null : "off_plan",
    offPlanMatched: offPlan?.matched ?? null,
  };
}
