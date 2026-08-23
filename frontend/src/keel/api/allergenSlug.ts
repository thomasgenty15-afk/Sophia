// KEEL — LA RÈGLE DE SLUG DES ALLERGÈNES, SEULE, SANS UN SEUL IMPORT.
//
// ── POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST VIDE DE TOUT LE RESTE ───
//
// C'est le même geste que `api/planRouting.ts`, pour la même raison, et cette
// raison est écrite dans son en-tête: **le scanner de
// `i18n/pageSeams.int.test.ts` suit les IMPORTS, pas les appels.**
//
// La fonction ci-dessous vivait dans `copy/allergens.ts`, à côté de la table
// des treize dangers — donc à côté de treize littéraux `allergen.*`. Or
// `api/onboarding.ts` en a besoin, `api/household.ts` importe `onboarding.ts`
// pour `DIET_ANSWERS`, et trois pages importent `household.ts`. Le chemin
// complet, mesuré le 2026-08-14:
//
//   /join-household  → JoinHouseholdPage   ─┐
//   /app/household   → HouseholdPage        ├→ api/household.ts
//   /app/plan        → StudentWeekPlanPage ─┘      → api/onboarding.ts
//                                                     → copy/allergens.ts
//
// Ces trois pages entraient donc dans le périmètre du namespace `allergen`
// sans en rendre un seul libellé — `allergenLabel` n'est appelé que par
// `SetupPage`, `StudentHealthPage` et `StudentConstraintsCard`, et aucune de
// ces trois routes ne monte l'une d'elles.
//
// ── LA RÉPARATION QUI A ÉTÉ ÉCARTÉE ────────────────────────────────────────
//
// Déclarer `allergen` sur les trois pages aurait fait verdir le test en une
// ligne. C'est ce qu'il ne faut pas faire: une entrée de `PAGE_NAMESPACES` est
// une PROMESSE — « cette page peut rendre ces namespaces, et ils sont tous
// traduits ». Trois promesses fausses affaiblissent le seul détecteur qui voie
// les coutures avant l'utilisateur, et la prochaine vraie couture passerait
// sous une déclaration écrite pour faire taire un rouge.
//
// ── CE QUI NE CHANGE PAS ───────────────────────────────────────────────────
//
// `copy/allergens.ts` RÉEXPORTE ce symbole. Son chemin est nommé mot pour mot
// dans `supabase/functions/_shared/keel/allergen_catalog.ts` (« LA SEULE COPIE
// QUI RESTE EST CELLE DU NAVIGATEUR »), et `copy/allergens.int.test.ts`
// l'importe de là pour le confronter au corps de la fonction moteur. Déplacer
// le corps sans laisser la porte ouverte aurait cassé le pont entre les deux
// langages — c'est-à-dire la garde qui empêche « fruits de mer » de devenir
// deux contraintes différentes selon l'écran par lequel on l'a déclaré.
//
// ⚠️ N'AJOUTE AUCUN IMPORT ICI. Pas `t()`, pas un type venu d'un module qui
// en porte un: la valeur de ce fichier est exactement sa liste d'imports vide.

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
/**
 * ⚠️ MISE À JOUR DU 2026-08-19 — LES DEUX MOITIÉS DOIVENT BOUGER ENSEMBLE.
 * Le moteur a gagné le repli des accents ET la table d'alias français. Cette
 * copie les porte à l'identique. `allergens.int.test.ts` compare les deux
 * SORTIES sur un corpus: il a attrapé la divergence dans la minute où le
 * moteur a bougé seul — c'est exactement ce pour quoi il existe.
 *
 * Le défaut réparé, mesuré: « œuf » donnait `uf`, « blé » donnait `bl`, et un
 * identifiant propre mais inconnu du catalogue (`oeuf`) rendait **zéro forme de
 * surface**, c'est-à-dire aucune protection. Le produit est en `fr-FR`.
 */
const ALLERGEN_REF_ALIASES: Readonly<Record<string, string>> = {
  arachide: "peanut",
  arachides: "peanut",
  cacahuete: "peanut",
  cacahuetes: "peanut",
  fruits_a_coque: "tree_nut",
  fruit_a_coque: "tree_nut",
  noix: "tree_nut",
  ble: "wheat",
  froment: "wheat",
  lait: "dairy",
  produits_laitiers: "dairy",
  lactose: "dairy",
  oeuf: "egg",
  oeufs: "egg",
  poisson: "fish",
  poissons: "fish",
  crustaces: "shellfish",
  fruits_de_mer: "shellfish",
  mollusques: "mollusc",
  soja: "soy",
  celeri: "celery",
  moutarde: "mustard",
  sulfite: "sulphite",
  sulfites: "sulphite",
  anhydride_sulfureux: "sulphite",
  porc: "pork",
  alcool: "alcohol",
};

export function normalizeAllergenInput(value: string): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  // Les ligatures d'abord: `œ` et `æ` ne sont pas des accents composés et
  // survivent à `NFD` — sans cette ligne, « œuf » resterait `uf`.
  const unligatured = raw
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae");
  const folded = unligatured.normalize("NFD").replace(/\p{M}+/gu, "");
  const slug = folded.replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!slug) return null;
  return ALLERGEN_REF_ALIASES[slug] ?? slug;
}
