// KEEL — le catalogue d'allergènes, côté navigateur.
//
// MIROIR, PAS SOURCE. La vérité vit dans
// `supabase/functions/_shared/keel/allergen_catalog.ts`, elle-même dérivée de
// `allergen_surface_forms.ts` — la table que le VERROU DE SORTIE consulte pour
// savoir sous quels autres noms un allergène peut apparaître dans une phrase.
// Le front est en Vite/TS et ne peut pas charger du Deno/JSR, d'où cette copie;
// `allergens.int.test.ts` lit les fichiers moteur et casse si l'un des trois
// miroirs dérive: la LISTE proposée (`ALLERGEN_OPTIONS`), les slugs à COUVERTURE
// LARGE (`WIDE_COVERAGE_SLUGS`), et la RÈGLE DE NORMALISATION
// (`normalizeAllergenInput`, dont le corps moteur est extrait et exécuté sur le
// même corpus).
//
// CE QUE CE CATALOGUE PROMET, EXACTEMENT
// --------------------------------------
// Choisir dans cette liste = être reconnu SOUS SES AUTRES NOMS. `peanut`
// protège aussi de « satay », « groundnut », « PB », « nut butter » — le défaut
// mesuré du 2026-08-03, où un élève anaphylactique a reçu « the nut butter
// option » avec `reason: "clean"`.
//
// Une saisie libre n'est PAS non protégée: le matcher compare toujours le token
// lui-même, pluriels et séparateurs compris. Elle est reconnue SEULEMENT sous le
// mot écrit. C'est cette nuance-là que l'écran doit dire, et pas « protégé /
// non protégé », qui serait faux dans les deux sens.

export interface AllergenOption {
  slug: string;
  label: string;
}

/** Miroir de `ALLERGEN_CATALOG`. Même ordre, mêmes slugs. */
export const ALLERGEN_OPTIONS: readonly AllergenOption[] = [
  { slug: "peanut", label: "Peanuts" },
  { slug: "tree_nut", label: "Tree nuts" },
  { slug: "gluten", label: "Gluten" },
  { slug: "wheat", label: "Wheat" },
  { slug: "dairy", label: "Dairy" },
  { slug: "egg", label: "Eggs" },
  { slug: "fish", label: "Fish" },
  { slug: "shellfish", label: "Shellfish" },
  { slug: "mollusc", label: "Molluscs" },
  { slug: "sesame", label: "Sesame" },
  { slug: "soy", label: "Soy" },
  { slug: "pork", label: "Pork" },
  { slug: "alcohol", label: "Alcohol" },
];

const BY_SLUG = new Map(ALLERGEN_OPTIONS.map((o) => [o.slug, o]));

/**
 * LES SLUGS QUE LE VERROU RECONNAÎT SOUS D'AUTRES NOMS — miroir des CLÉS de
 * `ALLERGEN_SURFACE_FORMS`, et surtout PAS du catalogue ci-dessus.
 *
 * POURQUOI LES DEUX LISTES NE SE CONFONDENT PAS. Le catalogue est ce que
 * l'écran PROPOSE; la table de surface est ce que le verrou TIENT. On ne
 * propose qu'une entrée par danger — `dairy` et pas `milk`/`lactose`/`casein`,
 * `egg` et pas `eggs`, `soy` et pas `soya` — parce que quatre cases pour le
 * lait demanderaient à l'élève un arbitrage clinique qui n'est pas le sien. La
 * table, elle, couvre les alias.
 *
 * Ces écrans lisaient la couverture dans le CATALOGUE. L'élève qui tapait
 * « milk » en saisie libre s'entendait donc dire « reconnu seulement sous ce
 * mot » alors que le verrou le couvre aussi sous « cream », « butter »,
 * « cheese ». L'erreur allait dans le sens prudent, mais elle reste une
 * information fausse sur une allergie — et un élève à qui on annonce une
 * protection étroite qu'il a large finit par ne plus croire l'étiquette.
 *
 * MIROIR, PAS SOURCE, comme `ALLERGEN_OPTIONS`: `allergens.int.test.ts` lit les
 * clés du fichier moteur et casse dans les DEUX sens — une clé manquante ici,
 * et une clé de trop, qui serait la panne grave (promettre large sur un slug
 * que le verrou ne connaît que nu).
 */
export const WIDE_COVERAGE_SLUGS: readonly string[] = [
  "peanut",
  "tree_nut",
  "gluten",
  "wheat",
  "lactose",
  "dairy",
  "milk",
  "casein",
  "egg",
  "eggs",
  "fish",
  "shellfish",
  "crustacean",
  "mollusc",
  "sesame",
  "soy",
  "soya",
  "alcohol",
  "pork",
  "shrimp",
];

const WIDE = new Set(WIDE_COVERAGE_SLUGS);

/**
 * Le verrou de sortie reconnaît-il ce slug sous d'AUTRES noms que lui-même ?
 *
 * Miroir navigateur de `allergen_catalog.ts :: hasSurfaceFormCoverage`, et la
 * même question exactement — étroite à dessein. Ne PAS transformer en
 * « protégé / non protégé »: voir l'en-tête. Un token hors table reste matché
 * sur son propre mot.
 */
export function hasWideCoverage(slug: string): boolean {
  return WIDE.has(String(slug ?? "").trim().toLowerCase());
}

/**
 * Le libellé lisible d'un slug, ou le slug rendu lisible.
 *
 * Contrairement à `labels.ts`, on ne JETTE PAS sur un token inconnu: ici les
 * tokens inconnus sont attendus et légitimes — ce sont les saisies libres des
 * élèves, et « fruits_de_mer » doit s'afficher, pas faire tomber l'écran. Une
 * allergie qu'on refuse d'afficher est une allergie que l'élève croit absente.
 */
export function allergenLabel(slug: string): string {
  const normalized = String(slug ?? "").trim().toLowerCase();
  const known = BY_SLUG.get(normalized);
  if (known) return known.label;
  if (!normalized) return "—";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((word, index) => index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)
    .join(" ");
}

/**
 * Normalise une saisie libre EXACTEMENT comme l'intake conversationnel.
 *
 * Côté moteur il n'y a plus qu'une implémentation, `allergen_catalog.ts ::
 * normalizeAllergenRef`, et `declare_safety_constraint/intake.ts` l'importe.
 * Celle-ci est la SEULE copie restante, et elle est structurelle: du Vite/TS ne
 * charge pas un module Deno/JSR.
 *
 * Une divergence ici écrirait « fruits de mer » d'un côté et « fruitsdemer » de
 * l'autre pour le même mot: deux contraintes là où l'élève en a déclaré une, et
 * un verrou qui n'en connaît qu'une. `allergens.int.test.ts` extrait le corps
 * de la fonction moteur et compare les DEUX SORTIES sur un corpus — c'est une
 * équivalence de comportement, pas une ressemblance de texte.
 */
export function normalizeAllergenInput(value: string): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const slug = raw.replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  return slug || null;
}
