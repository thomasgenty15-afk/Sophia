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
// L'écran a besoin des VOCABULAIRES (les trois styles, les trois cadences)
// pour poser ses boutons, du rang d'un style pour les ordonner — et depuis le
// 2026-09-04 de `offerableGroceryRuns`, qui dit CE QU'ON A LE DROIT DE
// PROPOSER.
//
// ⛔ ET « CE QU'ON PROPOSE » N'EST PAS « CE QUE LE PLAN FERA ». `deriveCooking-
// Plan` tourne côté serveur, à la composition, et son résultat revient dans la
// rationale: un aperçu de sessions calculé au navigateur serait une seconde
// autorité sur le nombre de vagues de courses, et celle-là reste interdite.
// L'offre, elle, ne calcule aucun plan — elle raccourcit une liste d'options,
// et elle le fait DEPUIS LE MODULE SERVEUR pour que les plafonds qu'elle
// reflète soient littéralement les mêmes objets.
//
// ⛔ SI TU ÉCRIS UNE RÈGLE ICI PLUTÔT QUE LÀ-BAS, TU AS RECRÉÉ LE JUMEAU.
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
  GROCERY_RUNS_ANY,
  type GroceryRuns,
  type GroceryRunsAnswer,
  type GroceryRunsLimit,
  type GroceryRunsOffer,
  MAX_COOKING_SESSIONS,
  offerableGroceryRuns,
  oneStyleLower,
  readCookingStyle,
  readGroceryRuns,
  readGroceryRunsAnswer,
  resolveGroceryRunsAnswer,
  unusedGroceryRuns,
} from "../../../../supabase/functions/_shared/keel/cooking_plan.ts";
