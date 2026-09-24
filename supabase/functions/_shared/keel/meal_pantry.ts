// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LE GARDE-MANGER
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-1). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : `normalizePantryTerm` et `isInPantry`. La garde finale du
// plan (`final_plan_gate.ts`) importe `normalizePantryTerm` directement d'ici.

import { normalizeForMatch } from "./forbidden_matcher.ts";
import type { PantryItem } from "./meal_types.ts";

// ---------------------------------------------------------------------------
// Le garde-manger — la correspondance, déterministe
// ---------------------------------------------------------------------------

/**
 * Le normaliseur du GARDE-MANGER: celui des verrous, plus le dépliage des
 * ligatures.
 *
 * `normalizeForMatch` décompose en NFD et retire les diacritiques, ce qui règle
 * « oignôns » mais PAS « œufs »: `œ` (U+0153) est une ligature, pas une lettre
 * accentuée, et NFD ne la décompose pas. « œufs » et « oeufs » restaient donc
 * deux mots différents.
 *
 * Pourquoi la correction est ICI et pas dans `forbidden_matcher.ts`: ce
 * matcher-ci est un CONFORT (« as-tu déjà ça ? »), pas une ceinture. Élargir la
 * normalisation partagée changerait aussi ce que le verrou MÉDICAL reconnaît,
 * et on ne touche pas à un verrou médical pour faire plaisir à une liste de
 * courses. La couche est donc additive et locale, et le verrou continue de voir
 * exactement ce qu'il voyait.
 */
export function normalizePantryTerm(term: string): string {
  return normalizeForMatch(String(term ?? "").trim())
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

/**
 * L'ingrédient est-il dans le garde-manger de l'élève ?
 *
 * Correspondance TOLÉRANTE, et dans un seul sens: on accepte que « tomates »
 * couvre « tomates cerises », jamais l'inverse. Un élève qui a écrit
 * « tomates » a probablement de quoi faire; un élève qui n'a que des tomates
 * cerises n'a pas de quoi faire une sauce, et lui dire le contraire lui coûte
 * un aller-retour au magasin.
 */
export function isInPantry(
  ingredientTerm: string,
  pantry: readonly PantryItem[],
): boolean {
  const needle = normalizePantryTerm(ingredientTerm);
  if (!needle) return false;
  for (const item of pantry) {
    const have = normalizePantryTerm(String(item?.term ?? ""));
    if (!have) continue;
    if (needle === have) return true;
    // « j'ai des tomates » couvre « tomates cerises ».
    if (needle.includes(have) && have.length >= 3) return true;
  }
  return false;
}
