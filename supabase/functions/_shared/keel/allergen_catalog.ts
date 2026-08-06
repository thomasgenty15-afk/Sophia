/**
 * KEEL — CE QUE L'ÉLÈVE PEUT CHOISIR, et ce que le verrou sait vraiment tenir.
 *
 * ── LE PROBLÈME QUE CE FICHIER TRANCHE ────────────────────────────────────
 * `student_safety_constraints.allergen_ref` est du TEXTE LIBRE: l'intake se
 * contente de le slugifier (`normalizeRef`: minuscules, `_`, rien d'autre).
 * C'était sans conséquence tant que les contraintes n'arrivaient que par la
 * conversation. Dès qu'un formulaire les collecte, la question devient
 * concrète: un élève qui tape « fruits de mer » crée une contrainte que le
 * verrou de sortie ne pourra pas honorer, et personne ne le saura.
 *
 * ── LA VÉRITÉ, ET ELLE EST GRADUÉE ────────────────────────────────────────
 * « Protégé / pas protégé » serait faux dans les deux sens. Le matcher
 * (`forbidden_matcher.ts`) compare TOUJOURS le token lui-même, avec ses
 * pluriels et ses séparateurs. Donc une contrainte hors catalogue EST matchée —
 * simplement, elle l'est sur son seul mot.
 *
 * Ce que le catalogue ajoute, c'est le reste du danger: `peanut` protège aussi
 * de « satay », « groundnut », « PB », « nut butter ». Le défaut mesuré du
 * 2026-08-03 est exactement là — un élève anaphylactique à l'arachide a reçu
 * « the nut butter option », `reason: "clean"`.
 *
 * D'où la formulation retenue partout dans le produit, et elle doit rester
 * celle-là: un allergène du catalogue est reconnu **sous ses autres noms**; un
 * allergène libre n'est reconnu **que sous celui que l'élève a écrit**.
 *
 * ── POURQUOI LE CATALOGUE EST DÉRIVÉ, ET PAS RÉÉCRIT ──────────────────────
 * Les slugs proposés sont ceux de `ALLERGEN_SURFACE_FORMS`, parce que c'est
 * cette table-là qui décide. Un catalogue écrit à la main à côté d'elle aurait
 * proposé un jour un allergène sans formes de surface, en promettant la
 * protection forte — le pire des deux mondes. Un test le vérifie dans les deux
 * sens.
 *
 * Les ALIAS de la table (`egg`/`eggs`, `soy`/`soya`, `dairy`/`milk`/`lactose`)
 * n'entrent pas tous dans le choix: proposer quatre entrées pour le lait
 * demanderait à l'élève un arbitrage clinique qui n'est pas le sien. Une entrée
 * par danger, le slug le plus couvrant, et les alias restent lisibles à
 * l'écriture conversationnelle.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

import { ALLERGEN_SURFACE_FORMS } from "./allergen_surface_forms.ts";

export interface AllergenCatalogEntry {
  /** Le slug écrit en base. DOIT être une clé de `ALLERGEN_SURFACE_FORMS`. */
  slug: string;
  /** Libellé anglais. Les surfaces KEEL sont anglaises (W9). */
  label: string;
}

/**
 * Ce qu'un formulaire propose. Ordre stable: le plus fréquent d'abord, ce qui
 * est aussi l'ordre où un élève cherche.
 *
 * `dairy` plutôt que `lactose`: une intolérance au lactose et une allergie aux
 * protéines de lait ne se distinguent pas dans une assiette, et les deux slugs
 * portent les mêmes formes de surface. Le `kind` (`allergy` vs `intolerance`),
 * lui, fait déjà la distinction que l'élève sait faire.
 *
 * `shellfish` plutôt que `crustacean` + `mollusc`: c'est le mot que les gens
 * utilisent, et c'est le slug dont la table couvre le plus de formes.
 */
export const ALLERGEN_CATALOG: readonly AllergenCatalogEntry[] = [
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
] as const;

/**
 * Le verrou de sortie reconnaît-il ce token sous d'AUTRES noms que lui-même ?
 *
 * C'est la seule question à laquelle ce module répond, et elle est volontairement
 * étroite. Elle ne dit PAS « cet élève est protégé »: un token hors table reste
 * matché littéralement. Elle dit « les synonymes et les plats qui en contiennent
 * sont couverts, ou non ».
 *
 * L'appelant qui la transforme en « protégé / non protégé » ment; celui qui la
 * transforme en « reconnu sous ses autres noms / seulement sous ce mot » dit ce
 * qui est vrai.
 *
 * APPELÉE AU MOMENT DE L'ÉCRITURE, sur la ligne RELUE — `declare_safety_
 * constraint/router.ts`. C'est le seul instant où l'élève est encore là pour
 * entendre la nuance: après, il ne lui reste que l'accusé, et un accusé qui
 * promet « je vérifierai tout ce que je te propose » sur un token hors table
 * promet plus que ce que le verrou tient.
 */
export function hasSurfaceFormCoverage(slug: string): boolean {
  const normalized = String(slug ?? "").trim().toLowerCase();
  if (normalized === "") return false;
  const forms = ALLERGEN_SURFACE_FORMS[normalized];
  return Array.isArray(forms) && forms.length > 0;
}

/**
 * LA règle de normalisation d'une saisie libre. Une seule, côté moteur.
 *
 * Dupliquer cette règle ailleurs ferait diverger le slug écrit par le
 * formulaire de celui écrit par la conversation, pour le même mot — deux
 * contraintes là où l'élève en a déclaré une, et un verrou qui n'en connaît
 * qu'une.
 *
 * Ce n'est plus une consigne, c'est le câblage: `declare_safety_constraint/
 * intake.ts` IMPORTE cette fonction (il en portait une copie nommée
 * `normalizeRef`, identique — donc inoffensive jusqu'au jour où l'une des deux
 * aurait bougé). Toute la lane conversationnelle passe désormais ici.
 *
 * LA SEULE COPIE QUI RESTE EST CELLE DU NAVIGATEUR, et elle est structurelle:
 * `frontend/src/keel/copy/allergens.ts :: normalizeAllergenInput` est du
 * Vite/TS qui ne peut pas charger ce module Deno/JSR. Elle n'est pas laissée à
 * la vigilance: `allergens.int.test.ts` extrait le CORPS de cette fonction-ci
 * et le fait tourner sur le même corpus que la copie du front — divergence de
 * comportement, test rouge.
 */
export function normalizeAllergenRef(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const slug = raw.replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  return slug || null;
}
