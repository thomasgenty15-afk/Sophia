// KEEL — le catalogue d'allergènes, côté navigateur.
//
// MIROIR, PAS SOURCE. La vérité vit dans
// `supabase/functions/_shared/keel/allergen_catalog.ts`, elle-même dérivée de
// `allergen_surface_forms.ts` — la table que le VERROU DE SORTIE consulte pour
// savoir sous quels autres noms un allergène peut apparaître dans une phrase.
// Le front est en Vite/TS et ne peut pas charger du Deno/JSR, d'où cette copie;
// `allergens.int.test.ts` lit le fichier moteur et casse si les deux divergent.
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
 * Ce slug est-il dans le catalogue — donc reconnu sous ses autres noms ?
 *
 * Ne PAS transformer en « protégé »: voir l'en-tête. Un token hors catalogue
 * reste matché sur son propre mot.
 */
export function isCatalogAllergen(slug: string): boolean {
  return BY_SLUG.has(String(slug ?? "").trim().toLowerCase());
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
 * Normalise une saisie libre EXACTEMENT comme l'intake conversationnel
 * (`declare_safety_constraint/intake.ts :: normalizeRef`) et comme
 * `normalizeAllergenRef` côté moteur.
 *
 * Une divergence ici écrirait « fruits de mer » d'un côté et « fruitsdemer » de
 * l'autre pour le même mot: deux contraintes là où l'élève en a déclaré une, et
 * un verrou qui n'en connaît qu'une.
 */
export function normalizeAllergenInput(value: string): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const slug = raw.replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  return slug || null;
}
