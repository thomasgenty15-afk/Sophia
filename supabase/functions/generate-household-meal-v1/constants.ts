// ═══════════════════════════════════════════════════════════════════════════
// GENERATE-HOUSEHOLD-MEAL-V1 — LES CONSTANTES DE MODULE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `index.ts` (découpage des gros fichiers,
// lot 3a). Aucune logique changée. Seul `index.ts` l'importe; ce module
// n'importe jamais `index.ts`, et il n'a aucun effet au chargement.
//
// Ce qui est ici : `FN_NAME` (le nom de la fonction, dans les journaux et
// les `source` d'appel modèle) et `DRAFT_ADOPTION_MODEL_TIMEOUT_MS`.
// `env.ts` et `index.ts` lisent `FN_NAME`.

const FN_NAME = "generate-household-meal-v1";
const DRAFT_ADOPTION_MODEL_TIMEOUT_MS = 100_000;

export { DRAFT_ADOPTION_MODEL_TIMEOUT_MS, FN_NAME };
