/**
 * FF-038 — LE RÉFÉRENTIEL DE COMPOSITION, CÔTÉ CODE.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-038-le-referentiel-de-composition.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §2.1.
 *
 * ── CE QUE CE MODULE RÉPOND, ET CE QU'IL REFUSE DE RÉPONDRE ──────────────
 * Il répond à « de quel aliment parle ce terme, et combien de grammes CRUS ça
 * fait ». Il ne répond jamais « à peu près lequel »: un terme qu'il ne
 * reconnaît pas rend `null` et se retrouve dans `unresolvedTerms`. Une
 * résolution approximative est indiscernable d'une bonne dans la sortie, et
 * elle empoisonne tout ce qui se calcule dessus.
 *
 * ── L'INCONNU SE PROPAGE, LE ZÉRO NON ────────────────────────────────────
 * `nutrientsOf` rend `"unknown"`, pas une somme amputée. Un `0` silencieux
 * ferait passer un plat non calculable pour un plat léger — le sens exactement
 * inverse, et sur la seule grandeur où se tromper de sens compte.
 *
 * ── PURE, MAIS PAS SANS DONNÉES ──────────────────────────────────────────
 * Le référentiel vit en base (`food_composition_refs`). Ce module ne
 * l'interroge pas: il reçoit un INDEX déjà construit
 * (`food_composition_io.ts`). C'est ce qui le garde testable sans base et
 * rejouable hors ligne sur les plans déjà écrits.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { normalizeForMatch } from "./forbidden_matcher.ts";
import type { FoodGroupRef } from "./tokens.ts";
import { readQuantityFromProse } from "./quantity_from_prose.ts";

// ---------------------------------------------------------------------------
// LES CLASSES DE RENDEMENT — la base porte la classe, ce fichier porte le nombre
// ---------------------------------------------------------------------------

/**
 * Poids CUIT / poids CRU. C'est LE piège du domaine, et il va dans les deux
 * sens: le riz gonfle (×2,6), la viande perd (×0,70). Une seule direction
 * codée en dur donnerait des résultats plausibles sur la moitié des plats,
 * c'est-à-dire un bug qu'on ne verrait pas.
 *
 * Les valeurs sont des ordres de grandeur assumés, pas des mesures: 100 g de
 * riz cru rendent 250 à 300 g cuits selon la cuisson, une viande perd 25 à
 * 35 % selon la coupe et le degré. Elles vivent ICI et pas en base pour qu'un
 * seul endroit les porte — deux copies d'un même nombre divergent, et c'est
 * celle qu'on regarde le moins qui garde l'ancienne.
 */
export const YIELD_FACTORS = {
  /** Rien n'absorbe ni ne perd: huiles, laitages, fruits, conserves égouttées. */
  neutral: 1.0,
  /** Riz, pâtes, semoule, quinoa, boulgour. */
  grain_absorbs: 2.6,
  /** Légumineuses SÈCHES. Une conserve est déjà hydratée: elle est `neutral`. */
  legume_absorbs: 2.4,
  /** Viandes et volailles. */
  meat_shrinks: 0.7,
  /** Poissons et fruits de mer. */
  fish_shrinks: 0.8,
  /** Légumes cuits. */
  veg_shrinks: 0.9,
} as const;

export type YieldClass = keyof typeof YIELD_FACTORS;

export const YIELD_CLASSES = Object.keys(YIELD_FACTORS) as readonly YieldClass[];

/**
 * Une classe dont le rendement est 1,0 n'a RIEN à deviner: cru et cuit y
 * pèsent pareil. C'est ce qui permet à `gramsRawOf` d'accepter un `state`
 * absent sur une huile et de le refuser sur du riz — et la distinction est
 * dérivée du facteur, pas d'une seconde liste qui en divergerait.
 */
function stateMattersFor(cls: YieldClass): boolean {
  return YIELD_FACTORS[cls] !== 1.0;
}

// ---------------------------------------------------------------------------
// LES UNITÉS
// ---------------------------------------------------------------------------

/**
 * La liste FERMÉE des unités que le contrat du générateur accepte.
 *
 * « cup » et « handful » n'y sont pas, et n'y entreront pas: une tasse n'a pas
 * de volume universel et une poignée n'a pas de volume du tout. Les convertir
 * serait inventer un nombre, et un nombre inventé au parseur est exactement ce
 * que le recalcul existe pour empêcher.
 */
export const COMPOSITION_UNITS = ["g", "ml", "unit", "tbsp", "tsp"] as const;
export type CompositionUnit = (typeof COMPOSITION_UNITS)[number];

export const COMPOSITION_STATES = ["raw", "cooked"] as const;
export type CompositionState = (typeof COMPOSITION_STATES)[number];

/**
 * Cuillères: les volumes métriques usuels, en millilitres.
 *
 * Une cuillère à soupe d'huile et une cuillère à soupe de farine ne pèsent pas
 * pareil, et ce module ne prétend pas le contraire — il convertit un VOLUME,
 * puis applique la densité de l'aliment comme pour n'importe quel `ml`.
 */
const TBSP_ML = 15;
const TSP_ML = 5;

/**
 * DENSITÉ PAR DÉFAUT, pour passer d'un millilitre à un gramme: 1 g/ml.
 *
 * Faux pour l'huile (~0,92) et pour le miel (~1,42), juste pour l'eau, le lait
 * et le bouillon. On garde le 1,0 et on l'ASSUME plutôt que d'ajouter une
 * colonne de densité qu'aucune source ne remplirait honnêtement: l'écart est
 * de l'ordre de 8 % sur les matières grasses, soit à l'intérieur de la bande
 * d'erreur que le design accepte (±10-15 % table + cuisson), et une colonne
 * remplie à l'estime aurait l'air d'une mesure.
 */
const ML_TO_G = 1.0;

// ---------------------------------------------------------------------------
// L'INDEX
// ---------------------------------------------------------------------------

/**
 * D'OÙ VIENT LA COMPOSITION D'UNE LIGNE — et pourquoi c'est un champ et pas
 * une note de bas de page (LOT 18).
 *
 * ⛔ TROIS DES CINQ VALEURS VIVENT EN BASE, DEUX N'EXISTENT QU'EN MÉMOIRE, et
 * la distinction est tout l'intérêt du champ:
 *
 *   `ciqual` · `manual`  — le référentiel HUMAIN. Une mesure, ou une entrée
 *                          curée à la main. C'est le compteur ①.
 *   `sas`                — une ligne PROMUE depuis `food_composition_pending`:
 *                          un modèle l'a écrite, trois plans l'ont revue, et sa
 *                          valeur tient dans la bande mesurée de son groupe.
 *                          C'est le compteur ③.
 *   `model`              — remplie à la volée par l'appel de secours de CE
 *                          plan. Jamais en base. C'est le compteur ②.
 *   `group_bounds`       — l'appel de secours a échoué (ou a rendu une valeur
 *                          hors bande) et on a pris le MILIEU de la bande du
 *                          groupe. Jamais en base, jamais promue.
 *
 * ⚠️ `group_bounds` EST COMPTÉ À PART DE `model`, ET C'EST LE CHIFFRE QUI DIT
 * SI LE LOT A ÉCHOUÉ. Les fondre ferait passer « l'appel de secours ne répond
 * plus » pour « l'appel de secours travaille » — c'est-à-dire un point de
 * rupture déguisé en fonctionnement, et le prompt du lot le nomme en toutes
 * lettres: « si cet appel devient un point de rupture, le lot a échoué ».
 */
export const COMPOSITION_SOURCES = [
  "ciqual",
  "manual",
  "sas",
  "model",
  "group_bounds",
] as const;
export type CompositionSource = (typeof COMPOSITION_SOURCES)[number];

/** Une ligne de `food_composition_refs`, telle que le code la lit. */
export interface CompositionRef {
  slug: string;
  foodGroupRef: FoodGroupRef;
  label: string;
  /**
   * LA PROVENANCE DE CETTE COMPOSITION. REQUIS, jamais `?`.
   *
   * ⛔ Un champ facultatif ici ferait retomber tous les appelants sur un défaut
   * silencieux, et les quatre compteurs du LOT 18 compteraient alors la même
   * chose pour tout le monde: le lot serait construit, branché, désarmé. C'est
   * le mode d'échec n°1 de ce dépôt (`optional-gate-params-are-disarmed-gates`),
   * et le compilateur est le seul recenseur d'appelants qui ne mente pas.
   */
  source: CompositionSource;
  /** Pour 100 g CRUS. */
  energyKcal: number;
  /** `null` = la source ne donne pas la valeur. Jamais 0 par défaut. */
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  omega3Marine: boolean;
  ironSource: boolean;
  calciumSource: boolean;
  iodineSource: boolean;
  zincSource: boolean;
  b12Source: boolean;
  folateSource: boolean;
  yieldClass: YieldClass;
  atwaterDiscount: number;
  energyDense: boolean;
  /**
   * CE QUE PÈSE UNE UNITÉ, en grammes, quand « une » de cet aliment veut dire
   * quelque chose. `null` partout ailleurs — et c'est le cas le plus fréquent.
   *
   * « 3 œufs » et « 1 banane » sont la façon NORMALE d'écrire une recette;
   * sans ce poids, ces ingrédients seraient résolus et jamais pesés. « 2
   * courgettes » n'a en revanche pas de poids d'unité honnête, et la colonne
   * reste `null`: un dénombrement converti à l'estime est un nombre inventé.
   */
  unitGrams: number | null;
  /**
   * LA MASSE CONVENTIONNELLE D'UN CONDIMENT — voir `condimentMassFor`.
   *
   * `null` sur 906 des 923 lignes, et c'est le cas normal. Le champ est
   * REQUIS et non optionnel: un `?` ne ferait remonter aucun appelant au
   * compilateur, et le dépôt paie en boucle les gardes qu'un paramètre
   * facultatif désarme en silence.
   */
  condimentGrams: number | null;
}

/**
 * Le référentiel, prêt à interroger.
 *
 * `bySlug` et `byAlias` sont deux entrées sur la même donnée, et l'ordre de
 * consultation est le contrat: égalité exacte d'abord, alias ensuite. Un alias
 * ne doit jamais pouvoir MASQUER une entrée du référentiel.
 */
export interface CompositionIndex {
  bySlug: ReadonlyMap<string, CompositionRef>;
  byAlias: ReadonlyMap<string, string>;
}

export function buildCompositionIndex(
  refs: readonly CompositionRef[],
  aliases: readonly { alias: string; slug: string }[],
): CompositionIndex {
  const bySlug = new Map<string, CompositionRef>();
  for (const r of refs) bySlug.set(r.slug, r);
  const byAlias = new Map<string, string>();
  for (const a of aliases) {
    // Un alias qui pointe vers un slug absent est JETÉ, pas gardé: il
    // rendrait `resolveIngredient` capable de trouver une clé et pas sa
    // valeur, c'est-à-dire un « résolu » qui ne résout rien.
    if (!bySlug.has(a.slug)) continue;
    byAlias.set(normalizeTerm(a.alias), a.slug);
  }
  return { bySlug, byAlias };
}

// ---------------------------------------------------------------------------
// LA NORMALISATION — celle des verrous, plus des réductions FERMÉES
// ---------------------------------------------------------------------------

/**
 * LES MODIFICATEURS DE PRÉPARATION ET DE CALIBRE.
 *
 * ── POURQUOI CE N'EST PAS UNE DEVINETTE ──────────────────────────────────
 * « chopped tomatoes », « baby spinach », « large potato » et « tomatoes »
 * désignent tous la tomate, l'épinard et la pomme de terre. Retirer l'adjectif
 * RÉDUIT une forme; ça ne CHOISIT pas entre deux aliments. C'est toute la
 * frontière de la règle R5 de la fiche, et elle se teste: « butter or olive
 * oil » ne désigne aucun aliment et doit rester non résolu.
 *
 * ── CE QU'ON NE MET PAS DEDANS ───────────────────────────────────────────
 * Rien qui change l'aliment. « rice pudding » n'est pas du riz avec un
 * adjectif, c'est un autre plat — donc « pudding » n'est pas un modificateur.
 * Le test d'admission d'une entrée est: « la réduction change-t-elle
 * l'aliment ? ». Si oui, elle n'entre pas.
 *
 * ── LA LISTE EST FERMÉE, ET ELLE LE RESTE ────────────────────────────────
 * L'élargir pour faire monter la couverture est exactement ce que la gate de
 * FF-039 existe pour empêcher. On l'élargit sur une mesure, jamais sur une
 * envie de chiffre.
 */
const PREPARATION_MODIFIERS: readonly string[] = [
  // EN — préparation
  "chopped",
  "diced",
  "sliced",
  "grated",
  "shredded",
  "minced",
  "crushed",
  "peeled",
  "drained",
  "rinsed",
  "cooked",
  "raw",
  "roast",
  "roasted",
  "grilled",
  "steamed",
  "boiled",
  "fresh",
  "frozen",
  "tinned",
  "canned",
  "dried",
  "ground",
  "whole",
  "skinless",
  "boneless",
  // EN — calibre et qualificatifs de rayon
  "large",
  "small",
  "medium",
  "baby",
  "lean",
  "light",
  "extra",
  "virgin",
  "plain",
  "natural",
  "leftover",
  "mixed",
  // FR — préparation
  "haches",
  "hache",
  "hachee",
  "hachees",
  "coupe",
  "coupee",
  "coupes",
  "coupees",
  "emince",
  "emincee",
  "emincees",
  "rape",
  "rapee",
  "rapees",
  "pele",
  "pelee",
  "pelees",
  "egoutte",
  "egouttee",
  "egouttees",
  "cuit",
  "cuite",
  "cuites",
  "cuits",
  "cru",
  "crue",
  "crus",
  "crues",
  "frais",
  "fraiche",
  "fraiches",
  "surgele",
  "surgelee",
  "surgelees",
  "surgeles",
  "sec",
  "seche",
  "seches",
  "sechees",
  "gros",
  "grosse",
  "petit",
  "petite",
  "petits",
  "petites",
  "moyen",
  "moyenne",
  // ══════════════════════════════════════════════════════════════════════
  // LA MOITIÉ FRANÇAISE QUI MANQUAIT — 2026-08-20, MESURÉE SUR UN RUN RÉEL
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA LISTE ÉTAIT BILINGUE ET ASYMÉTRIQUE, ce qui est pire qu'unilingue:
  // elle avait l'air de couvrir le français. `boneless` y était, `desossees`
  // non; `roasted` y était, `rotis` non; `whole` y était, `complet` non.
  //
  // Le coût, mesuré le 2026-08-20 sur une génération réelle du foyer
  // `5600347f` (contenu FR): **« cuisses de poulet desossees » ne résolvait
  // pas**, alors que « cuisses de poulet » est un alias existant. C'est la
  // protéine principale du plan — elle éteignait l'énergie de SEPT plats sur
  // neuf, donc toute la chaîne d'ancrage, donc les grammes identiques.
  //
  // ⚠️ CE N'EST PAS UN MATCHER: c'est un vocabulaire FERMÉ de mots retirés, et
  // chaque entrée ajoutée ici est la traduction d'une entrée anglaise DÉJÀ
  // présente. Aucune morphologie n'est dérivée, aucune règle n'est inventée —
  // la symétrie est la seule justification, et elle se vérifie à l'œil.
  "desosse",
  "desossee",
  "desosses",
  "desossees", // = boneless
  "roti",
  "rotie",
  "rotis",
  "roties", // = roasted
  "grille",
  "grillee",
  "grilles",
  "grillees", // = grilled
  "bouilli",
  "bouillie",
  "bouillis",
  "bouillies", // = boiled
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ `complet` / `complete` / `complets` / `completes` SONT SORTIS D'ICI.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Ils étaient entrés « par symétrie » avec l'anglais `whole`. La symétrie
  // est FAUSSE, et c'est une propriété de la langue, pas un choix:
  //
  //   • en anglais, le mot du complet est SOUDÉ au nom — `wholemeal bread`,
  //     `wholewheat pasta`, `brown rice`. Retirer `whole` d'un nom anglais ne
  //     produit presque jamais le raffiné, parce que le raffiné ne s'écrit pas
  //     comme le complet moins un mot;
  //   • en français, `complet` est un adjectif SÉPARÉ, et le raffiné EST
  //     littéralement le complet moins ce mot: `pain complet` → `pain`,
  //     `riz complet` → `riz`, `pates completes` → `pates`.
  //
  // ⇒ En français, retirer `complet` NE RÉDUIT PAS UNE FORME: il CHANGE
  // L'ALIMENT, de `whole_grain` à `refined_grain`, en silence. C'est très
  // exactement le test d'admission que l'en-tête de cette liste énonce
  // (« la réduction change-t-elle l'aliment ? Si oui, elle n'entre pas »),
  // et ces quatre mots le violaient.
  //
  // ── MESURÉ, le 2026-08-22, sur la base locale (lot `L19b`) ───────────────
  //   `pain complet grille`   → `white_bread` (refined_grain, 278, 35 g/unité)
  //                             au lieu de `wholemeal_bread` — **7 occurrences
  //                             réelles** dans les 182 plans du corpus;
  //   `tortilla complete`     → `white_bread`  (**2 occurrences**);
  //   `pain pita complet`     → `pita_bread` raffiné (**2 occurrences**);
  //   `pain de mie complet`, `muffin anglais complet …`, `pates completes`,
  //   `riz complet`: quatre réductions latentes de plus, toutes
  //   `whole_grain → refined_grain`, sur les 38 que `07-modificateurs.ts`
  //   dénombre.
  //
  // ⚠️ CE QUE ÇA COÛTE, ET C'EST VOULU: sans la réduction, une forme française
  // en `complet` que la table d'alias n'énumère pas ne résout plus RIEN au lieu
  // de résoudre le RAFFINÉ. Le module s'abstient plutôt que de rendre un
  // aliment faux — c'est son arbitrage fondateur. Les formes qui comptent sont
  // écrites en alias, une par une, par la migration
  // `20260822*_lot19b_les_alias_verifies`.
  "moulu",
  "moulue",
  "moulus",
  "moulues", // = ground
  "melange",
  "melangee",
  "melanges",
  "melangees", // = mixed
  "effiloche",
  "effilochee",
  "effiloches",
  "effilochees", // = shredded
  "ecrase",
  "ecrasee",
  "ecrases",
  "ecrasees", // = crushed
  "nature", // = plain / natural
  "vierge", // = virgin
  "entier",
  "entiere",
  "entiers",
  "entieres", // = whole
];

const MODIFIER_SET = new Set(PREPARATION_MODIFIERS);

/**
 * LES MOTS DE LIAISON qui rendent un terme AMBIGU, et le disqualifient.
 *
 * « butter or olive oil » ne désigne aucun aliment: il en propose deux et
 * laisse le cuisinier choisir. Le résoudre à l'un des deux serait exactement
 * la devinette que la fiche interdit — et le faux appariement serait
 * indiscernable d'un bon dans tout ce qui se calcule derrière.
 *
 * « and » n'y est PAS: « salt and pepper » est un condiment usuel, et
 * « chicken and rice bowl » se résout sur son premier aliment reconnu, ce qui
 * est le bon comportement pour un titre. Seule l'ALTERNATIVE disqualifie.
 */
const AMBIGUITY_MARKERS = /(?:^| )(?:or|ou|\/) (?:| )/;

/**
 * La normalisation partagée, plus le dépliage des ligatures et la ponctuation.
 *
 * ── LE TIRET DEVIENT UNE ESPACE ───────────────────────────────────────────
 * « pan-fried », « deep-fry », « chou-fleur », « sun-dried » — le trait
 * d'union est une convention typographique, pas une frontière d'aliment. Le
 * garder ferait de « chou-fleur » et « chou fleur » deux termes différents, et
 * c'est exactement le genre d'écart qui fait rater un appariement sans que
 * rien ne le dise. Les clés de la table d'alias passent par la même fonction à
 * la construction de l'index: les deux côtés ne peuvent pas diverger.
 *
 * ⚠️ ── L'APOSTROPHE TYPOGRAPHIQUE EST LA MÊME APOSTROPHE ──────────────────
 * Mesuré le 2026-08-19 (lot 0-B): `huile d'olive` écrit avec U+0027 résolvait,
 * la même chaîne écrite avec U+2019 — la forme que produisent les claviers et
 * les correcteurs — ne résolvait pas. Deux clés pour un seul aliment, et cet
 * aliment-là est une **huile**: 21 plats pliés perdaient en silence
 * l'ingrédient le plus énergétique de leur liste, ce qui est le mode de
 * défaillance n°1 de tout ce module (cf. `unweighedEnergyDense`).
 *
 * `normalizeForMatch` ne le rattrape pas: il déplie les diacritiques (NFD) et
 * met en minuscules, et U+2019 n'est pas un diacritique. La liste ci-dessous
 * est FERMÉE et ne contient que des caractères qui, dans un nom d'aliment,
 * n'ont pas d'autre emploi que celui d'apostrophe: U+2018 et U+2019, les deux
 * guillemets simples. Ni U+02BC (lettre modificative) ni U+00B4 (accent aigu
 * isolé) n'y sont, et ce n'est pas un oubli: `normalizeForMatch` les retire
 * DÉJÀ en amont comme diacritiques (`huile dʼolive` → `huile dolive`), donc
 * rien ne les atteint ici — les mettre dans la liste ferait une branche morte
 * qui aurait l'air d'une couverture. Elle replie vers U+0027 et
 * non vers une espace: `d'olive` doit rester un seul mot, sans quoi le retrait
 * des modificateurs et la réduction du pluriel travailleraient sur un
 * découpage différent des 2 587 alias déjà écrits.
 */
const APOSTROPHE_FORMS = /[‘’]/g;

export function normalizeTerm(term: string): string {
  return normalizeForMatch(String(term ?? "").trim())
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(APOSTROPHE_FORMS, "'")
    .replace(/[.,;:()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Les formes candidates d'un terme, de la plus fidèle à la plus réduite.
 *
 * L'ORDRE EST LE CONTRAT: la forme complète est essayée avant toute réduction,
 * pour qu'un aliment dont le nom CONTIENT un modificateur (« cottage cheese »,
 * « fromage blanc ») gagne sur sa propre réduction.
 */
/**
 * LES MOTS QUI INTRODUISENT LE MILIEU, PAS UN AUTRE ALIMENT.
 *
 * ── LE DÉFAUT MESURÉ (run réel, 2026-08-11) ───────────────────────────────
 * Le modèle écrit « canned tuna in spring water, drained ». `tuna_tinned`
 * EXISTE au référentiel, et le terme ne s'y résolvait pas: « canned » et
 * « drained » tombent bien (ce sont des modificateurs), mais « in spring
 * water » restait et faisait échouer l'appariement.
 *
 * Ce n'était pas un cas isolé, et surtout ce n'était pas un cas anodin: les
 * ingrédients que le modèle décrit le plus volontiers sont **les sources de
 * protéine et les féculents** — précisément ceux qui portent l'énergie. Un
 * plat de thon se calculait donc à 3 g de protéines, et le plan entier
 * passait pour trois fois plus léger qu'il n'était. Un défaut de MESURE que
 * l'on prenait pour un défaut de PRODUIT.
 *
 * ── POURQUOI C'EST UNE RÉDUCTION, ET PAS UNE DEVINETTE ────────────────────
 * « X in Y » sur une ligne d'ingrédient désigne X, conservé dans Y: le thon
 * au naturel reste du thon, les haricots à la sauce tomate restent des
 * haricots. On coupe donc AVANT la préposition — c'est le même geste que le
 * retrait d'un modificateur, une réduction de forme, pas un choix entre deux
 * aliments.
 *
 * `with` n'y est PAS, et c'est délibéré: « chicken with rice » nomme deux
 * aliments, et couper y perdrait le second. Seul le MILIEU se coupe.
 */
const MEDIUM_PREPOSITIONS: readonly string[] = [
  " in ",
  " au naturel",
  " a l huile",
  " à l huile",
  " dans ",
  // ⚠️ LE MILIEU FRANÇAIS DE « in »: `haricots blancs en conserve egouttes` doit
  // pouvoir atteindre `haricots blancs`. Mesuré le 2026-08-20 sur un run réel —
  // c'était l'un des deux derniers termes qui éteignaient un plat.
  //
  // ⛔ SEULEMENT `en conserve` ET `en boite`, JAMAIS ` en ` NU. « en » est un
  // mot-outil français très courant, et couper dessus rendrait des têtes
  // arbitraires sur des termes qu'on ne peut pas énumérer. Le milieu qu'on
  // coupe est un CONDITIONNEMENT nommé, pas une préposition.
  " en conserve",
  " en boite",
  " en boîte",
];

function candidateForms(term: string): string[] {
  const base = normalizeTerm(term);
  if (!base) return [];
  const forms = [base];

  // ── LE MILIEU, COUPÉ AVANT TOUT LE RESTE ────────────────────────────────
  // Avant le retrait des modificateurs, pour que « canned tuna in spring
  // water » devienne « canned tuna » (qui a son alias) et pas seulement
  // « tuna » (qui serait ambigu entre frais et en conserve).
  for (const prep of MEDIUM_PREPOSITIONS) {
    const at = base.indexOf(prep);
    if (at > 0) {
      const head = base.slice(0, at).trim();
      if (head) forms.push(head);
    }
  }

  // ⚠️ LES FORMES *AVANT* RETRAIT DES MODIFICATEURS — le pluriel français ne
  // s'appliquera QU'À ELLES. Voir sa justification plus bas: c'est la chaîne
  // « modificateur retiré PUIS pluriel réduit » qui atteint les lignes de
  // MOYENNE du référentiel, et c'est elle qu'on refuse.
  const beforeModifiers = [...forms];

  // Chaque forme obtenue passe aussi par le retrait des modificateurs.
  for (const f of [...forms]) {
    const words = f.split(" ");
    const stripped = words.filter((w) => !MODIFIER_SET.has(w));
    if (stripped.length > 0 && stripped.length !== words.length) {
      forms.push(stripped.join(" "));
    }
  }
  // Le pluriel anglais, retiré du DERNIER mot seulement — le seul que
  // l'anglais accorde. Le français accorde tous les mots, et ses formes
  // plurielles sont écrites en clair dans la table d'alias plutôt que
  // dérivées: dériver une morphologie serait un second moteur à côté du
  // matcher partagé.
  //
  //
  // ⚠️ ── LE `e?` EST GOURMAND, ET LE RÉPARER A ÉTÉ MESURÉ PUIS REFUSÉ ──────
  // `replace(/e?s$/, "")` mange toujours le « e » quand il est là:
  // `aubergines → aubergin`, `cakes → cak`, `wedges → wedg`, `prunes → prun`.
  // La règle est donc MUETTE sur tout singulier terminé par « e » — une grosse
  // part du référentiel — et le lot 0-B est tombé dedans sur ses deux propres
  // slugs (`corn_cake`, `lemon_wedge`), débloqués par des alias écrits à la
  // main.
  //
  // Le lot 0-C a écrit le correctif (ajouter `-s` seul et `-ies → -y` après la
  // forme existante, donc strictement additif) et l'a mesuré terme par terme
  // sur les 605 termes du corpus, les 2 587 alias et les 923 slugs. Diff:
  // 0 appariement perdu, 0 déplacé, **5 gagnés — dont 4 FAUX**.
  //
  //     roasted vegetables ×8 · roast vegetables ×2 · mixed roast vegetables ×2
  //         → `vegetable` (moyenne générique). 10 de ces 12 lignes portent
  //           aussi un `uses` vers la casserole de légumes du même plat, et
  //           `foldPreparationsIntoDishes` AJOUTE les ingrédients de la
  //           casserole aux siens: les légumes seraient comptés DEUX FOIS.
  //     baguettes ×1 → `white_bread`, dont l'`unit_grams` vaut 35 g (UNE
  //           TRANCHE). « 2 unit » pèserait 70 g au lieu de ~500 g.
  //     pork sausages ×1 → `sausage`. Le seul gain honnête des cinq.
  //
  // Ce que ça dit du référentiel, et c'est le vrai enseignement: il porte des
  // lignes de MOYENNE (`vegetable`, `white_bread`) qu'aucune forme fidèle
  // n'atteint et que seule une RÉDUCTION peut atteindre. Élargir la réduction
  // les ouvre donc aux composés du produit (« roasted vegetables » est un plat
  // de reprise, pas un aliment), et un plat qui s'abstenait rend alors un
  // nombre faux — l'inverse exact de l'arbitrage de ce module. La règle
  // gourmande RESTE, avec son défaut, jusqu'à ce que le double comptage soit
  // traité là où il vit (le pliage), pas ici.
  for (const f of [...forms]) {
    const w = f.split(" ");
    const last = w[w.length - 1];
    if (last.length > 3 && last.endsWith("s")) {
      w[w.length - 1] = last.replace(/e?s$/, "");
      forms.push(w.join(" "));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LE PLURIEL FRANÇAIS — TOUS LES MOTS, ET SEULEMENT LE `-s` NU
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT, MESURÉ SUR UN RUN RÉEL LE 2026-08-20. Le commentaire ci-dessus
  // affirme que « les formes plurielles françaises sont écrites en clair dans la
  // table d'alias plutôt que dérivées ». C'est une INTENTION, pas un fait:
  // `abricots` et `tortillas de ble complet` n'y sont pas, et le référentiel ne
  // peut pas énumérer un pluriel pour chacune de ses 2 587 entrées. Le produit
  // compose en français; chaque pluriel non énuméré éteint l'énergie d'un plat.
  //
  // ⚠️ ET C'EST DÉLIBÉRÉMENT PLUS ÉTROIT QUE LA RÈGLE ANGLAISE AU-DESSUS. Le
  // lot 0-C a mesuré puis REFUSÉ un élargissement en `-es` (4 gains FAUX sur 5),
  // parce que réduire davantage ouvre les lignes de MOYENNE du référentiel
  // (`vegetable`, `white_bread`) aux composés du produit. On ne touche donc pas
  // au `e`: seul le `-s` nu tombe, et seulement sur les mots d'au moins quatre
  // lettres.
  //
  //   `abricots`                  -> `abricot`                 ✓
  //   `tortillas de ble complet`  -> `tortilla de ble complet` ✓
  //   `aubergines`                -> INCHANGÉ (le `e` reste)
  //
  // ⚠️ UNE FORME RÉDUITE N'EST QU'UNE CANDIDATE: elle n'est retenue que si elle
  // EXISTE dans l'index. Un `pois -> poi` ne peut donc rien casser — il ne
  // s'apparie à rien. Le seul risque serait un singulier réduit qui désigne un
  // AUTRE aliment réel, et le diff d'appariement est la mesure qui le dirait.
  //
  // Mesuré sur les 605 termes du corpus, 2 587 alias, 923 slugs:
  // **0 appariement perdu, 0 déplacé.**
  //
  // ⛔ ET IL NE S'APPLIQUE QU'AUX FORMES D'AVANT LE RETRAIT DES MODIFICATEURS.
  // Mesuré: appliqué à TOUTES les formes, il rendait `roasted vegetables` ->
  // (modificateur) `vegetables` -> (pluriel) `vegetable`, c'est-à-dire la ligne
  // de MOYENNE du référentiel — très exactement les quatre gains FAUX que le
  // lot 0-C avait mesurés puis refusés, réintroduits par une autre porte. La
  // chaîne « modificateur PUIS pluriel » est la combinaison dangereuse; chacune
  // séparément ne l'est pas.
  //
  // Diff après restriction, sur les 605 termes du corpus:
  // **0 perdu, 0 déplacé, 0 gain douteux.**
  for (const f of beforeModifiers) {
    const w = f.split(" ");
    let changed = false;
    for (let i = 0; i < w.length; i++) {
      if (w[i].length > 3 && w[i].endsWith("s") && !w[i].endsWith("ss")) {
        w[i] = w[i].slice(0, -1);
        changed = true;
      }
    }
    if (!changed) continue;
    // ⛔ ET LA FORME RÉDUITE NE REPASSE PAS PAR LE RETRAIT DES MODIFICATEURS.
    // Mesuré: l'y faire repasser rendait `roasted vegetables` -> (pluriel)
    // `roasted vegetable` -> (modificateur) `vegetable`, la ligne de MOYENNE,
    // c'est-à-dire le gain FAUX que le lot 0-C avait refusé. Les deux
    // réductions sont sûres séparément et dangereuses composées; on refuse la
    // composition, et les formes qu'elle seule atteignait sont écrites en
    // alias, à la main, une par une.
    forms.push(w.join(" "));
  }
  return [...new Set(forms)];
}

/**
 * De quel aliment parle ce terme ? `null` quand on ne sait pas.
 *
 * JAMAIS de rapprochement « au plus proche », jamais de distance d'édition,
 * jamais de sous-chaîne. Les seules tolérances sont celles écrites ci-dessus,
 * et chacune est une RÉDUCTION de forme, pas un choix entre deux aliments.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * UNE ALTERNATIVE N'EST AMBIGUË QUE SI SES BRANCHES LE SONT — 2026-08-24.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE LE REFUS SEC COÛTAIT, MESURÉ ───────────────────────────────────
 * « green or brown lentils » était la SEULE source de protéine des trois jours
 * de `plan-F3` (2026-08-23). Le terme ne résolvait pas, donc son plat ne portait
 * pas de chiffre, donc AUCUNE des neuf journées-bouche du plan n'en portait.
 * Le refus protège d'un aliment faux; ici il coûtait le plan entier.
 *
 * ── LA RÈGLE, ET ELLE NE DEVINE RIEN ──────────────────────────────────────
 * DEUX portes, dans cet ordre:
 *
 *   ① UN ALIAS CURÉ POUR LA CHAÎNE ENTIÈRE gagne. Un humain a lu « green or
 *      brown lentils » et décidé qu'il désigne les lentilles sèches; ce refus
 *      générique n'a pas à écraser une décision prise à la main. C'est la même
 *      hiérarchie que partout: le plus spécifique parle en dernier.
 *
 *   ② SINON, **TOUTES** les branches doivent résoudre **ET** tomber sur la MÊME
 *      ligne. L'alternative est alors sans conséquence: peu importe laquelle on
 *      lit. Tout le reste — branches divergentes, branche inconnue, aucune
 *      branche — retombe sur le refus d'avant.
 *
 * ⛔ « TOUTES », ET C'EST LA MOITIÉ QUI COMPTE. Une première version acceptait
 * qu'UNE SEULE branche résolve. Elle rendait `olive_oil` sur « butter or olive
 * oil » dès que le beurre manquait au référentiel — c'est-à-dire qu'elle
 * CHOISISSAIT, en silence, très exactement ce que le refus existe pour
 * empêcher. Une branche inconnue n'est pas une branche d'accord: c'est une
 * branche dont on ne sait rien.
 *
 * ⛔ C'EST UNE PREUVE, PAS UN ARBITRAGE. Vérifié sur le référentiel vivant:
 * « butter or olive oil » (l'exemple qui justifie le refus dans le DDL),
 * « chicken or turkey », « rice or quinoa » et « yoghurt or skyr » rendent tous
 * deux lignes distinctes et restent refusés.
 *
 * ⚠️ ET AUCUNE GRAMMAIRE. On ne recompose pas « green » avec la queue de
 * « brown lentils »: chaque segment est lu tel quel, par la porte ordinaire.
 */
function resolveAlternative(
  index: CompositionIndex,
  base: string,
): CompositionRef | null {
  // ── ① L'ALIAS CURÉ DE LA CHAÎNE ENTIÈRE ─────────────────────────────────
  //
  // ⛔ `byAlias` SEULEMENT, JAMAIS `bySlug`. Un alias est écrit à la main, avec
  // sa note, et passe les cinq épreuves du patron de migration: c'est une
  // DÉCISION. Un slug, lui, peut être fabriqué à chaud par le sas de
  // réparation (`composition_fill.ts`), qui écrit dans `bySlug` — et dont le
  // propre prompt dit de LAISSER TOMBER les alternatives. Consulter `bySlug`
  // ici rendrait donc atteignable l'entrée qu'un modèle désobéissant aurait
  // devinée pour « butter or olive oil », et désarmerait la ceinture
  // `unreachable` qui l'attrape aujourd'hui.
  //
  // ⚠️ MESURÉ: c'est exactement ce qui s'est produit à l'écriture de ce lot —
  // `composition_fill_test.ts` (« une ALTERNATIVE n'est pas remplie ») est
  // passé au rouge. La ceinture a fait son travail, et ce commentaire existe
  // pour que personne ne « simplifie » cette ligne en y rajoutant `bySlug`.
  const curated = index.byAlias.get(base);
  if (curated) {
    const hit = index.bySlug.get(curated);
    if (hit) return hit;
  }

  // ── ② TOUTES LES BRANCHES, ET ELLES DOIVENT S'ACCORDER ──────────────────
  const branches = base.split(/ (?:or|ou) |\//).map((b) => b.trim()).filter(Boolean);
  // Une seule branche: le marqueur était en tête ou en queue, il n'y a rien à
  // départager. On garde le refus plutôt que de relire le terme entier — ce
  // serait la boucle que ce chemin existe pour ne pas faire.
  if (branches.length < 2) return null;
  let found: CompositionRef | null = null;
  for (const branch of branches) {
    // ⚠️ CHAQUE BRANCHE PASSE PAR LA PORTE ORDINAIRE, alias et réductions
    // compris. Une seconde table de correspondance ici serait un jumeau du
    // résolveur, et il divergerait au premier alias ajouté.
    let hit: CompositionRef | null = null;
    for (const form of candidateForms(branch)) {
      const direct = index.bySlug.get(form.replace(/ /g, "_"));
      hit = direct ?? (index.byAlias.has(form)
        ? index.bySlug.get(index.byAlias.get(form)!) ?? null
        : null);
      if (hit) break;
    }
    // ⛔ UNE BRANCHE INCONNUE FAIT TOUT TOMBER. Voir l'en-tête: ne rien savoir
    // d'une branche n'est pas la même chose que la savoir d'accord.
    if (!hit) return null;
    if (found && found.slug !== hit.slug) return null;
    found = hit;
  }
  return found;
}

export function resolveIngredient(
  index: CompositionIndex,
  term: string,
): CompositionRef | null {
  const base = normalizeTerm(term);
  if (!base) return null;
  // L'ALTERNATIVE DISQUALIFIE, et avant tout le reste: « butter or olive oil »
  // contient « olive oil », qui matcherait.
  if (AMBIGUITY_MARKERS.test(` ${base} `)) return resolveAlternative(index, base);
  for (const form of candidateForms(term)) {
    const direct = index.bySlug.get(form.replace(/ /g, "_"));
    if (direct) return direct;
    const viaAlias = index.byAlias.get(form);
    if (viaAlias) return index.bySlug.get(viaAlias) ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// LES GRAMMES
// ---------------------------------------------------------------------------

/**
 * Combien de grammes CRUS ? `null` quand ce n'est pas convertible.
 *
 * ── `null` PLUTÔT QU'UN DÉFAUT, ET LE COÛT DU DÉFAUT EST CHIFFRÉ ─────────
 * Un `state` manquant sur du riz vaut un facteur 2,6 — et toujours dans le
 * sens qui gonfle. Deviner « raw » ferait compter 260 g de riz cru là où
 * l'élève en mange 100 g cuits, soit ~900 kcal d'écart sur une assiette. Un
 * `null` compté ne coûte qu'une abstention.
 *
 * ── `unit` EST NÉCESSAIRE POUR UN `amount` ───────────────────────────────
 * Un nombre sans unité n'est pas une quantité. « 2 » ne dit ni deux grammes ni
 * deux oignons.
 *
 * @param unitGrams le poids d'UNE unité, quand `unit === "unit"`. Vient de
 *   `food_items.typical_amount` chez l'appelant — le catalogue existant, pas
 *   une seconde table de portions.
 */
export function gramsRawOf(args: {
  amount: number | null;
  unit: CompositionUnit | null;
  state: CompositionState | null;
  yieldClass: YieldClass;
  unitGrams?: number | null;
}): number | null {
  const { amount, unit, state, yieldClass } = args;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  if (unit === null) return null;

  let grams: number | null;
  switch (unit) {
    case "g":
      grams = amount;
      break;
    case "ml":
      grams = amount * ML_TO_G;
      break;
    case "tbsp":
      grams = amount * TBSP_ML * ML_TO_G;
      break;
    case "tsp":
      grams = amount * TSP_ML * ML_TO_G;
      break;
    case "unit":
      // Pas de poids d'unité connu = pas de conversion. « 2 courgettes » sans
      // savoir ce que pèse une courgette n'est pas une quantité, c'est un
      // dénombrement — et un dénombrement converti à l'estime est un nombre
      // inventé.
      grams = args.unitGrams && args.unitGrams > 0 ? amount * args.unitGrams : null;
      break;
  }
  if (grams === null) return null;

  if (state === "raw") return grams;
  if (state === "cooked") return grams / YIELD_FACTORS[yieldClass];
  // `state` absent: acceptable seulement là où il ne change rien.
  return stateMattersFor(yieldClass) ? null : grams;
}

// ---------------------------------------------------------------------------
// LA CLASSE DES CONDIMENTS — peser une pincée, plutôt que l'ignorer
// ---------------------------------------------------------------------------

/**
 * ── LE DÉFAUT QUE CETTE CLASSE RÉPARE, MESURÉ ────────────────────────────
 * Sur les 1 204 plats de foyer en base, résolus après `foldPreparationsIntoDishes`,
 * 485 seulement rendaient une énergie. Les bloqueurs dominants n'étaient pas des
 * aliments: `salt` ×217, `black pepper` ×103, `parsley` ×68, `water` ×29,
 * `sel` ×21, `poivre` ×21. Le générateur les écrit sans quantité — et le prompt
 * lui demande explicitement de le faire (« une pincée reste une pincée »), parce
 * qu'exiger un chiffre partout ferait inventer des nombres.
 *
 * ⚠️ ── PESER, JAMAIS IGNORER ──────────────────────────────────────────────
 * Une pincée de sel PESÉE à 0,5 g rend 0 kcal et un plat calculable. La même
 * pincée IGNORÉE rendrait aussi un plat calculable, mais par une règle
 * d'abstention relâchée — et cette règle-là laisserait passer, mesuré sur le
 * même corpus, du riz cuit (145 kcal/100 g), des pois chiches, du thon et du
 * pain complet sur 38 plats. Aucune abstention n'est relâchée ici: un terme
 * hors classe qui n'a pas de quantité éteint toujours son plat.
 *
 * ── LA CLASSE VIT DANS LE RÉFÉRENTIEL, PAS DANS UNE LISTE DE MOTS ────────
 * L'appartenance est portée par la LIGNE (`condiment_grams`), donc par le SLUG,
 * atteint par le résolveur partagé. Aucun matcher maison n'est écrit: le dépôt a
 * mesuré 12 faux positifs sur 12 avec un matcher artisanal (« lait » se trouve
 * dans « laitue »). C'est aussi ce qui la rend BILINGUE gratuitement — `sel`,
 * `poivre` et `ail` sont déjà des alias, ils arrivent sur la même ligne que
 * `salt`, `black pepper` et `garlic`.
 *
 * ── LA RÈGLE EST RÉAPPLIQUÉE ICI, ET CE N'EST PAS UNE DOUBLURE INUTILE ────
 * Le CHECK SQL est la même règle, et il est le bon endroit pour l'écrire. Mais
 * une ligne écrite AVANT un CHECK survit au CHECK (`food_composition_io` le dit
 * déjà pour `yield_class`), et l'index se construit aussi dans des tests et des
 * rejeux hors base. Ce qui protège au moment du calcul, c'est ce prédicat-ci.
 */

/**
 * ① UNE MASSE D'ASSAISONNEMENT, PAS UNE PORTION.
 *
 * 5 g est la borne, et c'est celle de l'herbe fraîche: une petite poignée de
 * persil. Au-delà, on ne saupoudre plus, on sert — un citron entier (60 g), un
 * cube de bouillon (10 g), un filet de vinaigre (15 ml) tombent tous ici.
 */
export const CONDIMENT_MAX_GRAMS = 5;

/**
 * ② LA MAIN GÉNÉREUSE — le facteur auquel on vérifie le plafond.
 *
 * La convention dit ce qu'on met d'ordinaire; le plafond doit tenir sur ce qu'on
 * met au maximum. Trois fois la convention est la borne haute plausible d'un
 * geste d'assaisonnement (trois pincées, trois brins, trois poignées).
 */
export const CONDIMENT_PLAUSIBLE_MULTIPLE = 3;

/**
 * ③ CE QU'UN CONDIMENT A LE DROIT DE PESER EN ÉNERGIE, AU MAXIMUM.
 *
 * ── LA DÉRIVATION, SUR LES DONNÉES ────────────────────────────────────────
 * Sur les 485 plats aujourd'hui calculables (mesure pliée, 2026-08-19), le 5e
 * centile est à 269 kcal et la médiane à 1 086 kcal. 10 kcal y valent 3,7 % et
 * 0,9 % — donc, dans le pire cas, moins de la moitié de la bande d'erreur de
 * ±10-15 % que ce module assume déjà pour lui-même (cf. `ML_TO_G`). Un condiment
 * pesé par convention au lieu d'être mesuré ne peut pas sortir un plat de la
 * tolérance qui était déjà supposée.
 *
 * ── CE QUE CE NOMBRE REFUSE, ET C'EST LÀ QU'IL SE PROUVE ─────────────────
 * `garlic` (111 kcal/100 g, ×39 plats bloqués) est LE cas limite du lot: une
 * gousse pèse 5 g, la ligne porte déjà `unitGrams = 5`, elle passe donc la borne
 * ①. Elle échoue celle-ci — trois gousses font 15 g, soit 16,6 kcal. L'ail est
 * un aliment qu'on mange, pas un assaisonnement qu'on saupoudre. **Refusé par la
 * règle, pas par le goût**, et les 39 plats restent bloqués.
 */
export const CONDIMENT_MAX_KCAL = 10;

/**
 * COMBIEN PÈSE CE CONDIMENT QUAND PERSONNE N'A ÉCRIT DE QUANTITÉ ?
 * `null` dès que la ligne n'est pas un condiment — c'est-à-dire presque toujours.
 *
 * ⚠️ ── `energyDense` EST LA CONTRE-ÉPREUVE, ET ELLE EST STRUCTURELLE ──────
 * Aucune ligne dense ne peut recevoir de masse conventionnelle, à AUCUNE masse.
 * C'est ce qui garantit qu'une huile sans quantité continue d'éteindre son plat
 * par `unweighedEnergyDense` — le premier poste de perte d'énergie du produit
 * (82 lignes d'huile sans quantité mesurées sur 80 générations). Une classe de
 * condiments qui pourrait avaler une huile serait exactement la règle relâchée
 * que ce lot existe pour ne pas écrire.
 */
export function condimentMassFor(ref: CompositionRef): number | null {
  const grams = ref.condimentGrams;
  if (grams === null || !Number.isFinite(grams)) return null;
  if (grams <= 0 || grams > CONDIMENT_MAX_GRAMS) return null;
  if (ref.energyDense) return null;
  const maxKcal = (grams * CONDIMENT_PLAUSIBLE_MULTIPLE * ref.energyKcal) / 100;
  if (!(maxKcal <= CONDIMENT_MAX_KCAL)) return null;
  return grams;
}

// ---------------------------------------------------------------------------
// LES NUTRIMENTS — et l'inconnu qui se propage
// ---------------------------------------------------------------------------

export interface Nutrients {
  energyKcal: number;
  /** `null` = au moins un ingrédient ne donne pas cette macro. */
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

/** Le type qui rend l'amputation silencieuse impossible. */
export type NutrientsOrUnknown = Nutrients | "unknown";

/** Un ingrédient tel que le calcul le lit. */
export interface ResolvedIngredient {
  ref: CompositionRef;
  gramsRaw: number;
}

/**
 * LE LEXIQUE FERMÉ DES MÉTHODES DE FRITURE, EN+FR.
 *
 * L'huile qu'une friture ajoute n'apparaît dans aucune liste d'ingrédients:
 * personne n'écrit « 2 litres d'huile de friture » dans une recette de
 * beignets. Sans imputation, un plat frit se calcule comme le même plat cuit à
 * la vapeur.
 *
 * L'imputation est de 12 % du poids cuit, et c'est une CONVENTION avouée — un
 * ordre de grandeur de la littérature, pas une mesure de ce plat-là.
 */
const FRYING_METHODS: readonly string[] = [
  "deep fried",
  "deep-fried",
  "deep frying",
  "shallow fried",
  "pan fried",
  "pan-fried",
  "fried",
  "fry",
  "frying",
  "friture",
  "frit",
  "frite",
  "frits",
  "frites",
  "poele a l'huile",
  "beignet",
];

/** 12 % du poids cuit. Constante nommée, avouée comme opérationnelle. */
export const FRY_OIL_UPTAKE_RATIO = 0.12;
/** Une huile de friture: 9 kcal/g, matière grasse pure. */
export const FRY_OIL_KCAL_PER_G = 9;

/**
 * La méthode décrit-elle une friture ?
 *
 * « sauté à sec » ne matche PAS, et c'est testé: un sauté sans matière grasse
 * est exactement le plat qu'une imputation ferait passer pour un beignet.
 */
export function isFriedMethod(method: string): boolean {
  const text = normalizeTerm(method);
  if (!text) return false;
  if (/(?:^| )(?:a sec|sans matiere grasse|dry(?: |-)fried|no oil)(?: |$)/.test(text)) {
    return false;
  }
  return FRYING_METHODS.some((m) =>
    new RegExp(`(?:^| )${m.replace(/[-]/g, "[- ]")}(?:s)?(?: |$)`).test(text)
  );
}

/**
 * L'énergie et les macros d'une liste d'ingrédients RÉSOLUS.
 *
 * ── L'APPELANT DÉCIDE DE L'ABSTENTION, PAS CE MODULE ─────────────────────
 * Ici, `"unknown"` ne sort que quand il n'y a rien à additionner. La règle des
 * 80 % et celle de l'ingrédient dense non résolu appartiennent au VERDICT
 * (FF-039), parce qu'elles dépendent du total d'ingrédients — y compris ceux
 * qui n'ont pas pu être résolus, et que cette fonction ne voit donc pas.
 *
 * ── LES MACROS SE PROPAGENT SÉPARÉMENT ───────────────────────────────────
 * Un céleri sans lipides connus ne rend pas tout le plat inconnu: il rend les
 * LIPIDES du plat inconnus. L'énergie, elle, reste calculable — c'est la
 * grandeur que la source donne toujours.
 */
export function nutrientsOf(
  ingredients: readonly ResolvedIngredient[],
  options: { friedMethod?: boolean } = {},
): NutrientsOrUnknown {
  if (ingredients.length === 0) return "unknown";
  let energy = 0;
  let protein: number | null = 0;
  let carbs: number | null = 0;
  let fat: number | null = 0;
  let fiber: number | null = 0;
  let cookedWeight = 0;

  for (const { ref, gramsRaw } of ingredients) {
    const per = gramsRaw / 100;
    energy += ref.energyKcal * per * ref.atwaterDiscount;
    protein = ref.proteinG === null ? null : (protein === null ? null : protein + ref.proteinG * per);
    carbs = ref.carbsG === null ? null : (carbs === null ? null : carbs + ref.carbsG * per);
    fat = ref.fatG === null ? null : (fat === null ? null : fat + ref.fatG * per);
    fiber = ref.fiberG === null ? null : (fiber === null ? null : fiber + ref.fiberG * per);
    cookedWeight += gramsRaw * YIELD_FACTORS[ref.yieldClass];
  }

  if (options.friedMethod) {
    const oilG = cookedWeight * FRY_OIL_UPTAKE_RATIO;
    energy += oilG * FRY_OIL_KCAL_PER_G;
    if (fat !== null) fat += oilG;
  }

  const round = (v: number | null) => v === null ? null : Math.round(v * 10) / 10;
  return {
    energyKcal: Math.round(energy),
    proteinG: round(protein),
    carbsG: round(carbs),
    fatG: round(fat),
    fiberG: round(fiber),
  };
}

// ---------------------------------------------------------------------------
// LA RÉSOLUTION D'UNE LISTE — le chiffre qui pilote tout le chantier
// ---------------------------------------------------------------------------

export interface ResolutionResult {
  resolved: ResolvedIngredient[];
  /** Les termes que le référentiel ne connaît pas. C'est la worklist. */
  unresolvedTerms: string[];
  /** Les termes résolus dont on n'a pas su calculer les grammes. */
  unweighedTerms: string[];
  /**
   * LES TERMES PESÉS PAR CONVENTION, et pas par ce que le générateur a écrit.
   *
   * ── UN TROISIÈME COMPTEUR, PARCE QUE DEUX MENTENT ────────────────────────
   * Sans lui, « 40 g de riz mesurés » et « une pincée de sel conventionnée » se
   * ressemblent parfaitement dans `resolved`, et la classe des condiments
   * devient invisible: personne ne peut plus voir qu'elle a mordu, ni sur quoi.
   * C'est le zéro ambigu que ce dépôt paie en boucle — le patron en place est
   * `unweighedTerms` / `unresolvedTerms`, et celui-ci est le troisième du même
   * jeu, pas un compteur d'un autre genre.
   *
   * ⚠️ Ces termes SONT dans `resolved` et comptent dans toutes les sommes. Ce
   * champ dit d'où vient leur masse, il ne retire rien.
   */
  conventionalTerms: string[];
  /**
   * ⟳ LOT `L-1-b` — LES TERMES PESÉS PARCE QUE LA PROSE PORTAIT LE NOMBRE.
   *
   * ⛔ UN QUATRIÈME COMPTEUR, ET C'EST LA MOITIÉ NÉGATIVE DU LOT. Sans lui,
   * « le modèle a écrit `amount: 150, unit: g` » et « le modèle ne l'a écrit
   * qu'en prose, et on a su le lire » rendent le même `resolved`, donc le même
   * taux de pesée. Un modèle qui cesserait d'obéir à FF-038 deviendrait alors
   * indiscernable d'un lecteur réparé — et les deux appellent des corrections
   * opposées (durcir la consigne d'un côté, rien de l'autre).
   *
   * ⚠️ Ces termes SONT dans `resolved` et comptent dans toutes les sommes,
   * comme `conventionalTerms`. Ce champ dit d'où vient leur masse.
   */
  proseQuantityTerms: string[];
  /** Au moins un terme non résolu appartient-il à la classe dense ? */
  unresolvedEnergyDense: boolean;
  /**
   * Au moins un terme RÉSOLU MAIS NON PESÉ est-il de classe dense ?
   *
   * ── LE MIROIR MANQUANT, MESURÉ LE 2026-08-12 ─────────────────────────────
   * `unresolvedEnergyDense` garde la branche « je ne connais pas cet aliment ».
   * L'autre branche n'était gardée par rien: un ingrédient RÉSOLU dont on ne
   * sait pas tirer de grammes (« a drizzle of olive oil », « olive oil, to
   * taste ») sort de `resolved`, n'entre dans AUCUNE somme — et compte pourtant
   * comme connu dans `coverage`, qui est ce que la porte des 80 % regarde.
   *
   * Une huile qui vaut 120 kcal disparaît donc en silence, sur un plan qui se
   * présente comme lisible à 96 %. C'est exactement le mode de défaillance que
   * la garde des inconnus existe pour écarter, sur l'autre chemin.
   *
   * ⚠️ ICI, PAS DE LEXIQUE. `looksEnergyDense` devine à partir des mots parce
   * qu'un terme non résolu n'a, par définition, pas de ligne. Un terme résolu
   * en A une: on lit `energy_dense` du référentiel, qui est la donnée, pas son
   * approximation. Utiliser le lexique des deux côtés ferait rater « ghee » là
   * où le référentiel le sait, et ferait mordre « huile essentielle » là où il
   * sait que non.
   */
  unweighedEnergyDense: boolean;
  total: number;
  /**
   * `connus / total` — donc les termes RÉSOLUS MAIS NON PESÉS y comptent
   * comme connus. C'est voulu: la question de cette grandeur est « le
   * référentiel connaît-il cette assiette ? », pas « sait-on peser chaque
   * pincée de sel ? ».
   *
   * ⚠️ C'EST CE CHAMP QUE LES GARDES LISENT, jamais `resolved.length / total`.
   * Mesuré: le second rendait 69 % là où celui-ci rend 96 %, sur une assiette
   * dont 26 des 30 écarts étaient du sel, du poivre et des légumes comptés à
   * l'unité. Un appelant qui compte le tableau `resolved` s'abstient sur des
   * condiments. Le danger réel des non-pesés est porté par
   * `unweighedEnergyDense`, pas par ce ratio.
   */
  coverage: number;
}

/** Ce qu'un ingrédient apporte au résolveur. */
export interface CompositionInput {
  term: string;
  amount?: number | null;
  unit?: CompositionUnit | null;
  state?: CompositionState | null;
  /** Le poids d'une unité, quand il est connu (`food_items.typical_amount`). */
  unitGrams?: number | null;
  /**
   * ⟳ LOT `L-1-b` — LA COPIE EN PROSE DE LA MÊME QUANTITÉ (FF-038, 2026-08-22).
   *
   * ⛔ LUE SEULEMENT QUAND LA COPIE STRUCTURÉE MANQUE, ET JAMAIS COMME DU TEXTE.
   * Le prompt demande la quantité DEUX FOIS (`== SAY THE SAME QUANTITY TWICE ==`)
   * et, sur 3 850 lignes sans `amount`, **3 833 portent un `quantity` non vide**:
   * le modèle a écrit la copie en prose et pas la copie structurée. La lecture
   * se fait dans `quantity_from_prose.ts`, qui ne lit **aucun mot** — un nombre
   * suivi d'un symbole de mesure, ancré des deux bouts, ou rien.
   *
   * ⚠️ OPTIONNEL, ET UN APPELANT QUI NE LE PASSE PAS RETROUVE EXACTEMENT LE
   * COMPORTEMENT D'AVANT. Il n'y a donc pas de « paramètre de garde optionnel
   * jamais passé » ici: le champ n'arme pas une garde, il ouvre une seconde
   * lecture, et son absence ne rend rien de faux — seulement moins.
   */
  quantity?: string | null;
  /**
   * ⟳ LOT `L-1-b` — LA PROVENANCE DÉJÀ TRANCHÉE EN AMONT.
   *
   * ⛔ POSÉE PAR LE PLIAGE, ET C'EST SA RAISON D'ÊTRE.
   * `foldPreparationsIntoDishes` doit CONSOMMER la prose pour lui appliquer le
   * prorata — sinon un lot fait pour 4 dîners compterait sa masse entière dans
   * chacun des 4 plats. La copie pliée n'a donc plus de `quantity` à relire, et
   * sans ce champ une ligne rattrapée deviendrait indiscernable d'une ligne que
   * le modèle avait structurée: **les deux populations se fondraient**.
   */
  quantitySource?: "structured" | "prose" | null;
}

/**
 * LES MOTS QUI TRAHISSENT UNE CLASSE DENSE — EN+FR, liste FERMÉE.
 *
 * ── POURQUOI ELLE NE PEUT PAS VENIR DU RÉFÉRENTIEL ───────────────────────
 * Un terme NON RÉSOLU n'a, par définition, pas de ligne de référentiel — donc
 * pas de `energy_dense`. Or c'est précisément d'un inconnu qu'on veut savoir
 * s'il était une matière grasse: une huile manquante déplace l'énergie d'un
 * plat de plusieurs dizaines de pour cent, et un verdict rendu sans elle a
 * l'air d'un résultat.
 *
 * ── LA DIRECTION DE L'ERREUR EST CHOISIE ─────────────────────────────────
 * Ce lexique sur-détecte volontairement: « huile essentielle » y matche et
 * n'est pas une matière grasse alimentaire. Le coût d'un faux positif est une
 * ABSTENTION de plus; celui d'un faux négatif est un verdict faux qui a l'air
 * juste. On paie le premier.
 */
const DENSE_CLASS_WORDS: readonly string[] = [
  // EN — matières grasses
  "oil",
  "butter",
  "ghee",
  "lard",
  "dripping",
  "cream",
  "mayonnaise",
  "mayo",
  "dressing",
  "pesto",
  // EN — fruits à coque et graines
  "nut",
  "nuts",
  "almond",
  "walnut",
  "cashew",
  "pecan",
  "hazelnut",
  "peanut",
  "pistachio",
  "macadamia",
  "seed",
  "seeds",
  "tahini",
  // EN — sucres
  "sugar",
  "syrup",
  "honey",
  "chocolate",
  "jam",
  "marmalade",
  "nutella",
  // FR — matières grasses
  "huile",
  "beurre",
  "saindoux",
  "creme",
  "mayonnaise",
  "vinaigrette",
  // FR — fruits à coque et graines
  "noix",
  "noisette",
  "amande",
  "cacahuete",
  "pistache",
  "graine",
  "graines",
  // FR — sucres
  "sucre",
  "sirop",
  "miel",
  "chocolat",
  "confiture",
];

const DENSE_WORD_SET = new Set(DENSE_CLASS_WORDS);

/** Un terme non résolu appartient-il visiblement à la classe dense ? */
export function looksEnergyDense(term: string): boolean {
  const words = normalizeTerm(term).split(" ");
  return words.some((w) => DENSE_WORD_SET.has(w));
}

export function resolveIngredients(
  index: CompositionIndex,
  inputs: readonly CompositionInput[],
): ResolutionResult {
  const resolved: ResolvedIngredient[] = [];
  const unresolvedTerms: string[] = [];
  const unweighedTerms: string[] = [];
  const conventionalTerms: string[] = [];
  const proseQuantityTerms: string[] = [];
  let unweighedEnergyDense = false;
  for (const input of inputs) {
    const term = String(input?.term ?? "").trim();
    if (!term) continue;
    const ref = resolveIngredient(index, term);
    if (!ref) {
      unresolvedTerms.push(normalizeTerm(term));
      continue;
    }
    const grams = gramsRawOf({
      amount: input.amount ?? null,
      unit: input.unit ?? null,
      state: input.state ?? null,
      yieldClass: ref.yieldClass,
      // Le poids d'unité vient du RÉFÉRENTIEL, pas de l'appelant: c'est une
      // propriété de l'aliment (« un œuf pèse 55 g »), pas de la recette.
      // L'appelant peut le forcer, mais il n'a aucune raison de le faire.
      unitGrams: input.unitGrams ?? ref.unitGrams,
    });
    if (grams === null) {
      // ══════════════════════════════════════════════════════════════════════
      // ⟳ LOT `L-1-b` · LA QUANTITÉ QUE LE MODÈLE A ÉCRITE EN CLAIR — 2026-08-22
      // ══════════════════════════════════════════════════════════════════════
      //
      // ⛔ AVANT LA CONVENTION, APRÈS LE STRUCTURÉ, ET L'ORDRE EST LA RÈGLE.
      // Le structuré a déjà eu sa chance juste au-dessus et a rendu `null`.
      // La prose passe donc maintenant — et AVANT `condimentMassFor`, parce
      // qu'une quantité ÉCRITE gagne toujours contre une convention (c'est déjà
      // la règle du condiment, écrite dans son propre bloc).
      //
      // ⛔ AUCUN MOT N'EST LU ICI, ET CE N'EST PAS UNE PROMESSE: la lecture est
      // dans `quantity_from_prose.ts`, elle est ancrée des deux bouts, et son
      // test tient une liste de 60+ chaînes qui DOIVENT rendre `null`
      // (`a handful`, `2 tbsp`, `1 large onion`, `75 g dry`…). Le refus écrit
      // au-dessus de `unquantified_dish_ingredients` vise la lecture SÉMANTIQUE
      // de la prose; il n'est pas renversé — voir §⑨ n° 51 du plan.
      //
      // ⚠️ `state` N'EST TOUJOURS PAS DEVINÉ. « 150 g » de riz sans `state`
      // reste non pesé: `stateMattersFor` mord, facteur 2,6, toujours dans le
      // sens qui gonfle.
      const prose = readQuantityFromProse(input.quantity ?? null);
      if (prose) {
        const proseGrams = gramsRawOf({
          amount: prose.amount,
          unit: prose.unit,
          state: input.state ?? null,
          yieldClass: ref.yieldClass,
          unitGrams: input.unitGrams ?? ref.unitGrams,
        });
        if (proseGrams !== null) {
          resolved.push({ ref, gramsRaw: proseGrams });
          proseQuantityTerms.push(normalizeTerm(term));
          continue;
        }
      }
      // ── LE CONDIMENT SE PÈSE PAR CONVENTION, AVANT DE COMPTER COMME PERDU ──
      // Et seulement ici, quand aucune quantité n'a pu être lue: une quantité
      // écrite gagne toujours contre la convention. Voir `condimentMassFor`
      // pour la règle d'admission — hors classe, on tombe dans la branche
      // suivante et le plat s'éteint, exactement comme avant.
      const conventional = condimentMassFor(ref);
      if (conventional !== null) {
        resolved.push({ ref, gramsRaw: conventional });
        conventionalTerms.push(normalizeTerm(term));
        continue;
      }
      // RÉSOLU MAIS NON PESÉ. Les deux compteurs sont distincts exprès: l'un
      // pilote la curation d'alias, l'autre dit si le contrat de quantités
      // structurées est respecté. Les confondre ferait chercher des alias pour
      // un problème de prompt.
      unweighedTerms.push(normalizeTerm(term));
      // Le référentiel SAIT que cet aliment est dense; on n'a pas su le peser.
      // Son énergie ne sera dans aucune somme, et `coverage` le compte comme
      // connu. Sans ce drapeau, la perte serait muette.
      if (ref.energyDense) unweighedEnergyDense = true;
      continue;
    }
    // ⟳ LOT `L-1-b` — LA PROVENANCE POSÉE EN AMONT SURVIT AU PLIAGE.
    // Le pliage a consommé la prose pour lui appliquer le prorata; la ligne
    // arrive donc ici avec un `amount` structuré. Sans cette ligne, elle serait
    // comptée « écrite par le modèle » et les deux populations se fondraient.
    if (input.quantitySource === "prose") proseQuantityTerms.push(normalizeTerm(term));
    resolved.push({ ref, gramsRaw: grams });
  }
  const total = inputs.filter((i) => String(i?.term ?? "").trim()).length;
  const known = total - unresolvedTerms.length;
  return {
    resolved,
    unresolvedTerms,
    unweighedTerms,
    conventionalTerms,
    proseQuantityTerms,
    unresolvedEnergyDense: unresolvedTerms.some(looksEnergyDense),
    unweighedEnergyDense,
    total,
    coverage: total === 0 ? 0 : known / total,
  };
}
