// KEEL — LE PLAN DE CUISINE (sessions, temps, courses), côté écran. AUCUNE RÈGLE ICI.
//
// Chantier: scratchpad/2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md §5.6 (P2);
// ⟳ 2026-09-25 — le style de cuisine est remplacé par « combien de fois tu
// veux cuisiner » et « temps par session de cuisine ».
//
// ── POURQUOI CE FICHIER EST UNE RÉEXPORTATION ET RIEN D'AUTRE ─────────────
// `groceryWaves.ts` a été un JUMEAU jusqu'au 2026-08-10: il recopiait
// l'algorithme du serveur et redéclarait `MAX_FRIDGE_DAYS = 3` en dur. Deux
// définitions d'une même règle sont une divergence en attente, et c'est l'écran
// — jamais relu — qui garde l'ancienne. Ce module-ci naît du bon côté.
//
// L'écran a besoin des VOCABULAIRES (nombres de sessions, plages de temps,
// cadences de courses) pour poser ses options, et des TROIS OFFRES
// (`offerableCookingSessions`, `offerableSessionTimes`, `offerableGroceryRuns`)
// qui disent CE QU'ON A LE DROIT DE PROPOSER.
//
// ⛔ ET « CE QU'ON PROPOSE » N'EST PAS « CE QUE LE PLAN FERA ». `deriveCooking-
// Plan` tourne côté serveur, à la composition, et son résultat revient dans la
// rationale. Les offres ne calculent aucun plan — elles grisent des options, et
// elles le font DEPUIS LE MODULE SERVEUR pour que les plafonds qu'elles
// reflètent soient littéralement les mêmes objets.
//
// ⛔ SI TU ÉCRIS UNE RÈGLE ICI PLUTÔT QUE LÀ-BAS, TU AS RECRÉÉ LE JUMEAU.
//
// ⚠️ LES JETONS SONT ICI, LES MOTS SONT DANS LES COMPOSANTS. `pageSeams` rougit
// si une chaîne visible traverse `api/` — les libellés vivent dans
// `CookingSessionsField` et `SessionTimeField`, avec leurs clés i18n.

export {
  COOKING_SESSION_COUNTS,
  type CookingPlan,
  type CookingPlanNote,
  type CookingSessionCount,
  type CookingSessionsOffer,
  cookedMealsPerDay,
  deriveCookingPlan,
  GROCERY_RUNS,
  GROCERY_RUNS_ANY,
  type GroceryRuns,
  type GroceryRunsAnswer,
  type GroceryRunsLimit,
  type GroceryRunsOffer,
  MAX_COOKING_SESSIONS,
  offerableCookingSessions,
  offerableGroceryRuns,
  offerableSessionTimes,
  readCookingSessions,
  readGroceryRuns,
  readGroceryRunsAnswer,
  readSessionTimeBound,
  resolveGroceryRunsAnswer,
  SESSION_TIME_BOUNDS,
  type SessionTimeBound,
  type SessionTimeOffer,
  sessionTimeBoundFor,
  unusedGroceryRuns,
} from "../../../../supabase/functions/_shared/keel/cooking_plan.ts";
