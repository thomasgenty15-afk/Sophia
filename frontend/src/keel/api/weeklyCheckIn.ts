// KEEL — le contrat du point hebdomadaire, côté client.
//
// ── POURQUOI CES CONSTANTES SONT DUPLIQUÉES, ET CE QUI EMPÊCHE LA DÉRIVE ─────
// La vérité vit dans `supabase/functions/_shared/keel/weekly_flow.ts` : c'est
// ce module qui PARSE la réponse, et un axe que l'écran propose mais que le
// parseur ignore est une case que l'élève remplit dans le vide. Le front est en
// Vite/TS et le back en Deno : il n'y a pas d'import possible entre les deux.
//
// La copie est donc assumée, ET GARDÉE : `weeklyCheckIn.int.test.ts` lit le
// fichier Deno sur le disque et vérifie que les deux listes coïncident. Le test
// existe parce que « every axis the form asks for is an axis the parser reads »
// est déjà un test côté serveur — la même règle traverse maintenant la
// frontière des deux runtimes, là où elle peut réellement diverger.

export const WEEKLY_AXES = [
  "energy",
  "hunger",
  "sleep",
  "digestion",
  "mood",
  "training",
] as const;
export type WeeklyAxis = (typeof WEEKLY_AXES)[number];

export const WEEKLY_AXIS_LABELS: Record<WeeklyAxis, string> = {
  energy: "Day-to-day energy",
  hunger: "Hunger between meals",
  sleep: "Sleep quality",
  digestion: "Digestion",
  mood: "Mood",
  training: "Training quality",
};

/** Les cinq crans, nommés. Un chiffre nu invite chacun à sa propre échelle. */
export const WEEKLY_SCALE_LABELS: Record<number, string> = {
  1: "1 — bad",
  2: "2 — poor",
  3: "3 — ok",
  4: "4 — good",
  5: "5 — great",
};

// Bornes de plausibilité. Volontairement larges : il ne s'agit pas de juger un
// corps mais d'attraper une faute de frappe.
export const WEIGHT_KG_MIN = 25;
export const WEIGHT_KG_MAX = 400;
export const WAIST_CM_MIN = 30;
export const WAIST_CM_MAX = 250;

/** Le préfixe du jeton de semaine. Il ne porte QUE la semaine. */
export const WEEKLY_TOKEN_PREFIX = "KEEL_WEEKLY_";

/** `true` si ce payload de bouton ouvre le formulaire hebdomadaire. */
export function isWeeklyCheckInToken(payload: string): boolean {
  return /^KEEL_WEEKLY_\d{4}-\d{2}-\d{2}$/.test(String(payload ?? "").trim());
}
