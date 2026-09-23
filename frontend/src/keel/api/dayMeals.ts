// ⟳ 2026-09-23 — LE « NON » DE LA QUESTION DU SOIR, CÔTÉ ÉCRAN.
//
// Miroir de `_shared/keel/day_meals_ask.ts :: parseDayMealsButton`, réduit à ce
// que l'écran en fait: reconnaître « Non » et lire la date qu'il porte, pour
// ouvrir la fenêtre « Suivi des repas » sur CE jour-là. Le tap part AUSSI au
// serveur, qui répond par une phrase — l'écran ne remplace pas la réponse.
//
// ⚠️ ANCRÉ, PAS PRÉFIXÉ: la charge doit être exactement celle que le serveur
// fabrique. `dayMeals.int.test.ts` relit le module Deno pour que les deux
// motifs ne divergent pas.

const DAY_MEALS_NO = /^KEEL_DAYMEALS_no\|(\d{4}-\d{2}-\d{2})$/;

/** La date du « Non », ou `null` si la charge n'est pas celle-là. */
export function dayMealsMissedDate(payload: unknown): string | null {
  const m = DAY_MEALS_NO.exec(String(payload ?? "").trim());
  return m ? m[1] : null;
}
