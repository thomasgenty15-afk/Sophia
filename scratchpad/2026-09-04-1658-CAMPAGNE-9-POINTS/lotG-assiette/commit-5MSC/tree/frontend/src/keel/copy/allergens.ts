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

import { t, type MessageKey } from "../i18n/t";

export interface AllergenOption {
  slug: string;
  /**
   * La clé du libellé, PAS le libellé.
   *
   * ⚠️ C'ÉTAIT `label: string`, ET LE CHANGEMENT N'EST PAS COSMÉTIQUE. Cette
   * table est un `const` de module: une phrase écrite ici est figée à la langue
   * du bundle, et treize cases à cocher en anglais au milieu d'un formulaire
   * français est exactement la couture que ce chantier ferme. Une clé, elle, se
   * résout à l'APPEL (`allergenLabel`), donc elle suit la langue courante.
   *
   * Le slug reste ce qu'il a toujours été: une DONNÉE, jamais traduite. C'est
   * lui que le verrou de sortie compare, et le renommer casserait la protection
   * d'un élève anaphylactique — d'où le test de parité qui lit les slugs du
   * moteur DANS L'ORDRE.
   */
  labelKey: MessageKey;
}

/** Miroir de `ALLERGEN_CATALOG`. Même ordre, mêmes slugs. */
export const ALLERGEN_OPTIONS: readonly AllergenOption[] = [
  { slug: "peanut", labelKey: "allergen.peanut" },
  { slug: "tree_nut", labelKey: "allergen.tree_nut" },
  { slug: "gluten", labelKey: "allergen.gluten" },
  { slug: "wheat", labelKey: "allergen.wheat" },
  { slug: "dairy", labelKey: "allergen.dairy" },
  { slug: "egg", labelKey: "allergen.egg" },
  { slug: "fish", labelKey: "allergen.fish" },
  { slug: "shellfish", labelKey: "allergen.shellfish" },
  { slug: "mollusc", labelKey: "allergen.mollusc" },
  { slug: "sesame", labelKey: "allergen.sesame" },
  { slug: "soy", labelKey: "allergen.soy" },
  { slug: "pork", labelKey: "allergen.pork" },
  { slug: "alcohol", labelKey: "allergen.alcohol" },
  // ── LES QUATRE MAJEURS RÉGLEMENTAIRES AJOUTÉS LE 2026-08-19 ──────────────
  // EN QUEUE, ET DANS CET ORDRE: le test de dérive compare les deux listes
  // POSITION PAR POSITION (`toEqual`, pas un ensemble). Les intercaler par
  // fréquence aurait déplacé douze cases sous les doigts des élèves existants.
  { slug: "celery", labelKey: "allergen.celery" },
  { slug: "mustard", labelKey: "allergen.mustard" },
  { slug: "sulphite", labelKey: "allergen.sulphite" },
  { slug: "lupin", labelKey: "allergen.lupin" },
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
  // Les six clés du lot du 2026-08-19. Quatre sont proposées à l'écran;
  // `celeriac` et `sulfite` ne le sont PAS — ce sont les graphies qu'un élève
  // tape en saisie libre, et sans elles il s'entendrait dire « reconnu
  // seulement sous ce mot » sur un slug que le verrou couvre largement.
  "celery",
  "celeriac",
  "mustard",
  "sulphite",
  "sulfite",
  "lupin",
  // LA CLÉ DU LOT `S1b` (2026-08-22), et elle N'EST PAS proposée à l'écran non
  // plus. `fruits_de_mer` est le slug de DEUX lignes réelles de
  // `student_safety_constraints`, écrites le 2026-08-04 en saisie libre —
  // c'est-à-dire avant que la table d'alias ne ramène ce mot sur `shellfish`.
  // Rien ne les réécrit (une allergie déclarée appartient à la personne), donc
  // la couverture leur vient de la clé miroir côté moteur, et l'écran doit dire
  // la même chose que le verrou: reconnu SOUS SES AUTRES NOMS.
  "fruits_de_mer",
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
  if (known) return t(known.labelKey);
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
 * ⚠️ SON CORPS A DÉMÉNAGÉ DANS `api/allergenSlug.ts` LE 2026-08-14, ET CETTE
 * RÉEXPORTATION EST CE QUI REND LE DÉMÉNAGEMENT GRATUIT POUR SES LECTEURS.
 *
 * Pourquoi il a bougé: ce fichier-ci porte treize littéraux `allergen.*`, et
 * `api/onboarding.ts` importait la fonction. Le scanner de
 * `i18n/pageSeams.int.test.ts` suit les IMPORTS et pas les appels, donc
 * `/app/plan`, `/app/household` et `/join-household` — qui atteignent
 * `onboarding.ts` via `api/household.ts` — entraient dans le périmètre du
 * namespace `allergen` sans jamais rendre un seul de ses libellés. Même règle,
 * même geste et même explication que `api/planRouting.ts`.
 *
 * Pourquoi le chemin reste ouvert ici: `copy/allergens.ts ::
 * normalizeAllergenInput` est nommé mot pour mot par
 * `supabase/functions/_shared/keel/allergen_catalog.ts`, et
 * `allergens.int.test.ts` l'importe de ce module pour le confronter au corps de
 * la fonction moteur sur un corpus. Ce pont entre les deux langages est la
 * garde qui empêche un même mot de devenir deux contraintes selon l'écran par
 * lequel il a été déclaré; il ne se déplace pas pour une question de couture.
 *
 * ⚠️ UN NOUVEL APPELANT IMPORTE `api/allergenSlug.ts`, PAS CE FICHIER — sauf
 * s'il rend déjà des libellés d'allergènes, auquel cas il est de toute façon
 * dans le périmètre.
 */
export { normalizeAllergenInput } from "../api/allergenSlug";
