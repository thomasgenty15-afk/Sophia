// KEEL — LE PLAN DE CUISINE (style + courses), côté écran. AUCUNE RÈGLE ICI.
//
// Chantier: scratchpad/2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md §5.6 (P2)
//
// ── POURQUOI CE FICHIER EST UNE RÉEXPORTATION ET RIEN D'AUTRE ─────────────
// `groceryWaves.ts` a été un JUMEAU jusqu'au 2026-08-10: il recopiait
// l'algorithme du serveur et redéclarait `MAX_FRIDGE_DAYS = 3` en dur. Deux
// définitions d'une même règle sont une divergence en attente, et c'est l'écran
// — jamais relu — qui garde l'ancienne. Ce module-ci naît du bon côté.
//
// L'écran a besoin d'UNE chose de ce module: les VOCABULAIRES (les trois
// styles, les trois cadences) pour poser ses boutons, et le rang d'un style
// pour les ordonner. Il n'a besoin d'AUCUNE dérivation: `deriveCookingPlan`
// tourne côté serveur, à la composition, et son résultat revient dans la
// rationale. Un aperçu de sessions calculé au navigateur serait une seconde
// autorité sur le nombre de vagues de courses.
//
// ⛔ SI TU AJOUTES UNE RÈGLE ICI, TU AS RECRÉÉ LE JUMEAU.
//
// ⚠️ LES JETONS SONT ICI, LES MOTS SONT DANS LE COMPOSANT. `pageSeams` rougit
// si une chaîne visible traverse `api/` — les libellés des trois styles vivent
// dans `CookingStyleField`, avec leurs clés i18n.

export {
  COOKING_STYLE_PROFILE,
  COOKING_STYLES,
  type CookingPlan,
  type CookingPlanNote,
  type CookingStyle,
  cookingStyleRank,
  deriveCookingPlan,
  GROCERY_RUNS,
  type GroceryRuns,
  MAX_COOKING_SESSIONS,
  oneStyleLower,
  readCookingStyle,
  readGroceryRuns,
  unusedGroceryRuns,
} from "../../../../supabase/functions/_shared/keel/cooking_plan.ts";
