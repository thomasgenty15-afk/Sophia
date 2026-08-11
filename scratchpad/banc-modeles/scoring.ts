// BANC D'ESSAI · LA NOTATION, en un seul endroit.
//
// Partagée par `run.ts` (en direct) et `rescore.ts` (hors ligne, depuis
// `brut/`). Deux copies de cette logique divergeraient au premier correctif —
// et c'est un correctif de notation qui a déjà coûté une campagne.
//
// ── LE MATCHER EST CELUI DU PRODUIT, PAS UN À MOI ──────────────────────────
// La première version cherchait des sous-chaînes à la main. Résultat mesuré sur
// les 46 premières générations: **les douze « violations » relevées étaient
// TOUTES des faux positifs.**
//
//   « laitue »                          → matché comme « lait »
//   « yaourt de soja »                  → matché comme « yaourt », pour un végan
//   « muesli sans miel »                → matché comme « miel »
//   « certified gluten-free seeded bread » → matché comme « bread », pour un cœliaque
//   « suitable for a peanut allergy »   → matché comme « peanut »
//
// Autrement dit: la colonne la plus discriminante du banc classait le modèle
// qui répond JUSTE en dessous de celui qui ne répond rien. Un banc dans cet
// état ne se corrige pas, il se jette.
//
// `forbidden_matcher.ts` résout les cinq cas, et il ne les résout pas par
// hasard: c'est LE matcher des deux verrous de sortie du produit, il pose des
// bornes de mot par lookaround (« peanut » ne matche pas dans un autre mot) et
// il porte une liste FERMÉE de constructions de négation — écrite, entre
// autres, pour « gluten-free bread » servi à un cœliaque, exactement le cas
// qu'on vient de rater.
//
// Le banc mesure donc désormais ce que le PRODUIT appellerait une violation.
// C'est la seule définition qui vaille: une faute que le verrou de sortie ne
// verrait pas n'est pas une faute qu'on peut reprocher au modèle ici.

import {
  findForbiddenMatches,
  normalizeForMatch,
} from "../../supabase/functions/_shared/keel/forbidden_matcher.ts";
import type { ForbiddenTerm } from "../../supabase/functions/_shared/keel/forbidden_matcher.ts";
import type { BenchFixture } from "./fixtures.ts";

export interface Hit {
  word: string;
  snippet: string;
}

/**
 * LE SEUL SEAU QUI COMPTE: CE QU'ON ACHÈTE ET CE QU'ON MET DANS L'ASSIETTE.
 *
 * ── LA DEUXIÈME CORRECTION, ET ELLE EST AUSSI GROSSE QUE LA PREMIÈRE ──────
 * Après être passé au matcher du produit, il restait neuf « violations ».
 * Vérifiées une par une sur les sorties brutes: **toutes celles de `yaourt` et
 * de `bread` étaient des RETOURS EN ARRIÈRE.** L'ingrédient acheté dit
 * « yaourt de soja » ou « Gluten-free bread »; c'est la MÉTHODE qui écrit
 * ensuite « verser le yaourt dans un bol » ou « toast the bread ».
 *
 * Une recette écrit toujours l'aliment en entier une fois, puis y renvoie en
 * abrégé. Punir l'abréviation, c'est punir la façon dont les recettes
 * s'écrivent — et, encore une fois, classer la bonne réponse sous l'absence de
 * réponse.
 *
 * La règle est donc positionnelle et elle tient en une phrase: **un `term`
 * d'ingrédient ou de liste de courses est une chose qu'on achète et qu'on
 * mange; un titre, une méthode, un `why` sont de la prose à son sujet.**
 * Le premier est une VIOLATION, le second au mieux un ÉCHO.
 *
 * Contre-épreuve gardée en test: « Beef and mushroom stir-fry » servi à un
 * végétarien reste attrapé — parce que le bœuf est AUSSI dans les ingrédients.
 * Une faute réelle laisse toujours une trace dans ce qu'on achète.
 */
const FOOD_TERM_PARENTS = new Set(["ingredients", "shopping_list", "pantry"]);
const COMMENTARY_KEYS = new Set([
  "why",
  "note",
  "notes",
  "rationale",
  "explanation",
  "summary",
]);

export interface Buckets {
  /** Ce qu'on ACHÈTE et qu'on met dans l'assiette. */
  terms: string[];
  /** La prose qui PARLE de nourriture: titres, méthodes. */
  foodProse: string[];
  /** La prose adressée à l'élève: `why`. Jamais une faute. */
  commentary: string[];
}

export function collect(
  node: unknown,
  out: Buckets,
  parentKey = "",
  grandParentKey = "",
  inCommentary = false,
): void {
  if (typeof node === "string") {
    if (inCommentary) out.commentary.push(node);
    else if (parentKey === "term" && FOOD_TERM_PARENTS.has(grandParentKey)) {
      out.terms.push(node);
    } else out.foodProse.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collect(x, out, parentKey, grandParentKey, inCommentary);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      collect(v, out, k, parentKey, inCommentary || COMMENTARY_KEYS.has(k));
    }
  }
}

/**
 * LES QUALIFICATIFS QUI RENDENT UN ALIMENT INTERDIT LÉGITIME — liste FERMÉE.
 *
 * `forbidden_matcher` connaît les négations (« sans », « -free », « allergy »)
 * mais pas les SUBSTITUTIONS: « yaourt de soja » pour un végan et « soy yogurt »
 * pour un intolérant au lactose sont exactement les bonnes réponses, et aucune
 * négation ne les blanchit.
 *
 * La règle est POSITIONNELLE et volontairement étroite: le qualificatif doit
 * toucher le mot, avant ou après, dans la même chaîne. « lait de soja » et
 * « soy milk » passent; « du lait, et à côté du soja » ne passe pas.
 */
const PLANT_QUALIFIERS: readonly string[] = [
  // EN
  "soy",
  "soya",
  "almond",
  "oat",
  "coconut",
  "rice",
  "cashew",
  "hemp",
  "peanut",
  "cacahuete",
  "arachide",
  "sesame",
  "tahini",
  "plant",
  "plant-based",
  "vegan",
  "dairy-free",
  "dairy free",
  "lactose-free",
  "lactose free",
  "gluten-free",
  "gluten free",
  // « GF » est l'abréviation que les modèles écrivent réellement dans une
  // liste de courses (« GF pasta », « GF breadcrumbs »). L'ignorer punissait
  // exactement la substitution qu'on attend d'eux.
  "gf",
  "nut-free",
  "nut free",
  // FR
  "soja",
  "amande",
  "avoine",
  "coco",
  "riz",
  "vegetal",
  "vegetale",
  "vegetaux",
  "vegetales",
  "vegan",
  "vegane",
  "sans lactose",
  "sans gluten",
  "sans lait",
];

/** Le qualificatif touche-t-il le mot, dans un rayon de quelques mots ? */
function qualifiedNearby(normText: string, at: number, len: number): boolean {
  const before = normText.slice(Math.max(0, at - 28), at);
  const after = normText.slice(at + len, at + len + 28);
  return PLANT_QUALIFIERS.some((q) => before.includes(q) || after.includes(q));
}

function hitsIn(
  hay: readonly string[],
  words: readonly string[],
): Hit[] {
  // Un terme par mot interdit: `ruleId` porte le mot, ce qui rend la sortie
  // lisible sans table de correspondance.
  const terms: ForbiddenTerm[] = words.map((w) => ({
    ruleId: w,
    // `token` veut du snake_case (R1); les mots interdits sont de la prose, donc
    // ils passent par `surfaceForms`, que le matcher traite à l'identique.
    token: w.replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
    surfaceForms: [w],
  }));
  const out: Hit[] = [];
  for (const raw of hay) {
    if (!raw.trim()) continue;
    const norm = normalizeForMatch(raw);
    for (const m of findForbiddenMatches(raw, terms, { allowNegatedMentions: true })) {
      if (out.some((h) => h.word === m.ruleId)) continue;
      const at = norm.indexOf(normalizeForMatch(m.matchedText));
      if (at >= 0 && qualifiedNearby(norm, at, m.matchedText.length)) continue;
      const start = Math.max(0, (at >= 0 ? at : 0) - 45);
      out.push({
        word: m.ruleId,
        snippet: raw.slice(start, start + 130).trim(),
      });
    }
  }
  return out;
}

/** Ce mot apparaît-il, QUALIFIÉ, dans ce qu'on achète ? */
function explainedByATerm(terms: readonly string[], word: string): boolean {
  const t: ForbiddenTerm[] = [{
    ruleId: word,
    token: word.replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
    surfaceForms: [word],
  }];
  for (const raw of terms) {
    const norm = normalizeForMatch(raw);
    for (const m of findForbiddenMatches(raw, t, { allowNegatedMentions: false })) {
      const at = norm.indexOf(normalizeForMatch(m.matchedText));
      if (at >= 0 && qualifiedNearby(norm, at, m.matchedText.length)) return true;
    }
  }
  return false;
}

/**
 * LA RÈGLE, EN DEUX CLAUSES — et la seconde est celle qui distingue le retour
 * en arrière de la faute.
 *
 *   (a) le mot est dans un `term` acheté, sans qualificatif → VIOLATION. C'est
 *       ce qu'on met dans le caddie;
 *   (b) le mot est dans un TITRE ou une MÉTHODE, sans qualificatif, ET aucun
 *       ingrédient qualifié ne l'explique → VIOLATION aussi.
 *
 * La clause (b) est ce qui sépare « verser le yaourt dans un bol » — légitime,
 * parce que l'ingrédient dit « yaourt de soja » — de « Top with crushed
 * peanut » servi à un anaphylactique, que RIEN n'explique. Sans elle, un
 * allergène nommé nulle part ailleurs que dans la méthode passerait; avec elle
 * seule, on punirait la façon dont les recettes s'écrivent.
 *
 * Le `why` n'est jamais une faute: c'est de la prose adressée à l'élève.
 */
export function scoreNegativeAdherence(
  payload: unknown,
  fixture: BenchFixture,
): { violations: Hit[]; echoes: Hit[] } {
  const b: Buckets = { terms: [], foodProse: [], commentary: [] };
  collect(payload, b);

  const inTerms = hitsIn(b.terms, fixture.mustNotContain);
  const inProse = hitsIn(b.foodProse, fixture.mustNotContain);
  const violations: Hit[] = [...inTerms];
  for (const h of inProse) {
    if (violations.some((v) => v.word === h.word)) continue;
    if (explainedByATerm(b.terms, h.word)) continue;
    violations.push(h);
  }
  const echoes = hitsIn(b.commentary, fixture.mustNotContain)
    .filter((e) => !violations.some((v) => v.word === e.word));
  return { violations, echoes };
}

/** Le MOTIF d'une issue, pas son texte: `dishes[3]` et `dishes[5]` sont la même faute. */
export function issueKind(i: string): string {
  if (i.includes("numeric target")) return "numeric_target";
  if (i.includes("they are away")) return "away_day_violated";
  if (i.includes("fixed intake")) return "fixed_intake_violated";
  if (i.includes("leftovers day")) return "leftovers_violated";
  if (i.includes("batch-cooking")) return "batch_cook_missing";
  if (i.includes("cap for") || (i.includes("over the") && i.includes("cap"))) return "dish_cap";
  if (i.includes("unknown slot") || i.includes("unknown day")) return "bad_token";
  if (i.includes("unknown preparation")) return "dangling_uses";
  if (i.includes("structured_quantity_missing")) return "unstructured_quantity";
  if (i.includes("after the meal")) return "eaten_before_cooked";
  if (i.includes("days in the fridge")) return "fridge_overrun";
  if (i.includes("aisle")) return "bad_aisle";
  if (i.includes("servings_made")) return "bad_preparation";
  if (i.includes("belief")) return "belief_key";
  return "other";
}
