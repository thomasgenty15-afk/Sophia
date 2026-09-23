/**
 * DU TEXTE LIBRE AUX ALIMENTS — le prompt et la relecture. **Rien d'autre.**
 * Chantier « allergies et dégoûts en texte libre », 2026-09-20.
 *
 * L'appel modèle, le JWT et le dépôt au sas vivent dans
 * `food-terms-extract-v1/index.ts`. Ce module ne fait ni réseau ni horloge.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CE MODULE EXISTE POUR PERMETTRE
 * ═══════════════════════════════════════════════════════════════════════════
 * Demandé à l'écran: « j'aime pas champignons, thon et mangue » doit devenir
 * trois bulles, déjà cochées; « j'ai des réactions quand je mange des
 * cacahuètes » doit devenir UNE bulle, `cacahuète`. La liste de treize
 * pastilles et le bouton « Ajouter » un mot à la fois faisaient perdre du temps
 * à qui n'a rien à déclarer, et forçaient qui a trois dégoûts à trois gestes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ LE MODÈLE EXTRAIT, IL NE FILTRE PAS — ET IL A UN REPLI SANS MODÈLE
 * ═══════════════════════════════════════════════════════════════════════════
 * Une bulle est ce qui sera ENREGISTRÉ (une allergie part dans l'union de
 * sécurité fail-closed). Le texte tapé, lui, n'est jamais perdu:
 *
 *   · le modèle a RÉPONDU (JSON lisible) → sa liste fait foi, même vide. Une
 *     liste vide veut dire « aucun aliment dans cette phrase », et l'écran
 *     garde alors le texte dans le champ au lieu de l'effacer;
 *   · le modèle N'A PAS RÉPONDU (timeout, panne, sortie illisible) →
 *     `splitFoodTerms` découpe le texte sur ses séparateurs, et CES morceaux
 *     deviennent les bulles. Une panne dégrade vers « chaque morceau tel
 *     quel », jamais vers « rien ».
 *
 * La différence entre les deux est NOMMÉE dans la réponse (`via`): un banc qui
 * lirait des bulles sans savoir d'où elles viennent ne saurait pas si le modèle
 * a tourné.
 *
 * ⚠️ LA PROMESSE ET LA CLÉ DE SCHÉMA SE TOUCHENT. Cicatrice chiffrée du dépôt:
 * 0 % de conformité quand elles sont éloignées. `foods` est nommée dans la
 * phrase même qui dit ce qu'on y met, et un test mesure la distance.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

export type FoodTermsKind = "allergy" | "dislike";
export const FOOD_TERMS_KINDS: readonly FoodTermsKind[] = ["allergy", "dislike"];

/** Au-delà, ce n'est plus une liste de courses, c'est un texte collé. */
export const FOOD_TERMS_TEXT_MAX = 400;
/** Plus de vingt bulles d'un coup n'est pas une saisie, c'est un import. */
export const FOOD_TERMS_MAX = 20;
/** La longueur d'une forme dans le sas (`food_composition_pending_aliases`). */
export const FOOD_TERM_MAX_LENGTH = 80;

/**
 * UN TERME, NETTOYÉ — jamais « corrigé ». Minuscules, espaces repliés,
 * ponctuation de bord retirée. Les accents RESTENT: la ceinture d'exclusion
 * compare des mots de la personne à des mots de plat, et « cacahuète » est
 * son mot.
 */
export function cleanFoodTerm(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’.,;:!?()-]+|[\s"'“”‘’.,;:!?()-]+$/g, "")
    .trim()
    .toLowerCase()
    .slice(0, FOOD_TERM_MAX_LENGTH);
}

function dedupeTerms(terms: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of terms) {
    const term = cleanFoodTerm(raw);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= FOOD_TERMS_MAX) break;
  }
  return out;
}

/**
 * LE REPLI SANS MODÈLE — le texte découpé sur ses séparateurs.
 *
 * Virgules, points-virgules, retours à la ligne, barres, « et » / « and » /
 * « & » entourés d'espaces. Rien d'autre: pas de lemmatisation, pas de
 * dictionnaire, aucune ressemblance (`never-hand-roll-a-matcher-here`). Ce
 * repli rend des MORCEAUX, et un morceau peut être une phrase entière — c'est
 * accepté, la ceinture sait lire une phrase (`isBarePhrase`).
 */
export function splitFoodTerms(text: string): string[] {
  return dedupeTerms(
    String(text ?? "").split(/[,;\n\/|]+|\s+(?:et|and|&)\s+/i),
  );
}

export const FOOD_TERMS_EXTRACT_SYSTEM_PROMPT = [
  "You extract FOOD NAMES from a short free-text note written by a person",
  "about what they are allergic to, or what they do not like to eat.",
  "",
  "Rules:",
  "- Return ONLY the foods, ingredients or dishes the note names. Never add",
  "  foods the note does not mention. Never generalise (\"salmon\" is not",
  "  \"fish\").",
  "- Keep each food in the language it was written in, lowercase, singular,",
  "  without articles or quantities (\"des cacahuètes\" → \"cacahuète\").",
  "- Ignore everything that is not a food: feelings, symptoms, verbs, people.",
  "- If the note names no food at all, return an empty list.",
  "",
  "Answer with a JSON object and nothing else. Its single key is \"foods\":",
  "the list of food names you extracted, in the order they appear.",
  "Example: {\"foods\": [\"champignon\", \"thon\", \"mangue\"]}",
].join("\n");

export function buildFoodTermsExtractPrompt(args: {
  text: string;
  kind: FoodTermsKind;
  locale: string;
}): string {
  const purpose = args.kind === "allergy"
    ? "The person is listing what they are ALLERGIC to."
    : "The person is listing what they DO NOT LIKE to eat.";
  return [
    purpose,
    `Note language hint: ${String(args.locale ?? "").trim() || "unknown"}.`,
    "",
    "Note:",
    String(args.text ?? "").trim().slice(0, FOOD_TERMS_TEXT_MAX),
  ].join("\n");
}

export interface FoodTermsAnswer {
  /** `true` = le modèle a rendu un JSON lisible; sa liste fait foi, même vide. */
  readonly parsed: boolean;
  readonly terms: readonly string[];
}

/**
 * LA RÉPONSE DU MODÈLE, LUE. Jamais `throw`.
 *
 * `parsed: false` sur tout ce qui n'est pas `{ "foods": [string…] }`: c'est
 * l'appelant qui décide alors du repli (`splitFoodTerms`), et il le NOMME.
 * Une liste vide LISIBLE est `parsed: true` avec `terms: []` — ce n'est pas
 * une panne, c'est une réponse.
 */
export function parseFoodTermsAnswer(raw: unknown): FoodTermsAnswer {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { parsed: false, terms: [] };
    }
  }
  const foods = (parsed as { foods?: unknown } | null)?.foods;
  if (!Array.isArray(foods)) return { parsed: false, terms: [] };
  if (!foods.every((f) => typeof f === "string")) {
    return { parsed: false, terms: [] };
  }
  return { parsed: true, terms: dedupeTerms(foods as string[]) };
}

/**
 * LES BULLES, ET D'OÙ ELLES VIENNENT — la décision complète, sans réseau.
 *
 *   `model` = le modèle a répondu, sa liste fait foi (même vide);
 *   `split` = il n'a pas répondu, le texte est découpé tel quel.
 */
export function foodTermsFrom(
  text: string,
  answer: FoodTermsAnswer | null,
): { via: "model" | "split"; terms: string[] } {
  if (answer && answer.parsed) return { via: "model", terms: [...answer.terms] };
  return { via: "split", terms: splitFoodTerms(text) };
}
