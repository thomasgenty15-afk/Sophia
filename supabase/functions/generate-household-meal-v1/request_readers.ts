// ═══════════════════════════════════════════════════════════════════════════
// GENERATE-HOUSEHOLD-MEAL-V1 — LES LECTEURS DÉFENSIFS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `index.ts` (découpage des gros fichiers,
// lot 3a). Aucune logique changée. Seul `index.ts` l'importe; ce module
// n'importe jamais `index.ts`, et il n'a aucun effet au chargement.
//
// Ce qui est ici : `readWindowRequest` (la fenêtre demandée),
// `readCookingCapacity` (la colonne `practical_constraints`) et `num` (un
// nombre rendu par PostgREST). `num` était plus bas dans `index.ts`, entre
// `LoadedMember` et `RosterRow`.

import type { MealWindowRequest } from "../_shared/keel/meal_plan_window.ts";
import { usableBudget } from "../_shared/keel/meal_generation.ts";
import { readCookingStyle, readGroceryRuns } from "../_shared/keel/cooking_plan.ts";

/** Même lecture défensive que le chemin individuel. */
function readWindowRequest(raw: unknown): MealWindowRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;
  const kind = String(w.kind ?? "").trim();
  if (kind === "until_sunday") return { kind: "until_sunday" };
  if (kind === "days") {
    const count = Number(w.count);
    return Number.isFinite(count) ? { kind: "days", count } : null;
  }
  if (kind === "exact") {
    const startsOn = String(w.starts_on ?? "").trim();
    const durationDays = Number(w.duration_days);
    if (!startsOn || !Number.isFinite(durationDays)) return null;
    return { kind: "exact", startsOn, durationDays };
  }
  return null;
}

function readCookingCapacity(pc: Record<string, unknown> | null) {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const pick = (value: unknown, allowed: readonly string[]): string | null => {
    const raw = String(value ?? "").trim();
    return allowed.includes(raw) ? raw : null;
  };
  const time = Number(pc?.cooking_time_min);
  return {
    cookDays: Array.isArray(pc?.cook_days)
      ? (pc!.cook_days as unknown[]).map(String).filter((d) => DAYS.includes(d))
      : [],
    cookingTimeMin: Number.isFinite(time) && time > 0 ? Math.min(240, Math.round(time)) : null,
    recipeDifficulty: pick(pc?.recipe_difficulty, ["simple", "normal", "keen"]),
    variety: pick(pc?.variety, ["repeat", "some", "varied"]),
    // LE BUDGET EST UN MONTANT, ET IL EST RELU ICI PLUTÔT QUE REÇU DANS LA
    // REQUÊTE. L'écran qui compose l'écrit dans `practical_constraints`
    // juste avant d'appeler — la même route que le rythme et les jours de
    // cuisine. Deux chemins pour un seul chiffre, et c'est toujours celui
    // que l'écran ne montre pas qui gagne.
    //
    // `null` quand il est absent, à zéro, illisible ou absurde: aucune de
    // ces formes ne devient une consigne. `Number(null)` vaut 0 ET est
    // fini — un `!= null` laisserait passer « budget: 0 ».
    budgetAmount: usableBudget(pc?.budget_amount),
    // ⟳ A2 — LUES ICI, RÉSOLUES AILLEURS. Cette fonction ne fait que LIRE la
    // colonne; la dérivation (sessions, jours, minutes) vit dans
    // `resolveCookingCapacity` (`_shared/keel/cooking_plan.ts`), appelée par
    // les DEUX lanes. `readCookingCapacity`, elle, est dupliquée entre les deux
    // fichiers depuis toujours et sans test qui les compare — la dérivation ne
    // le sera pas, et un test lit les deux sources pour le prouver.
    //
    // ⛔ `null` = LA QUESTION N'A JAMAIS ÉTÉ POSÉE, jamais « le moins
    // possible »: cicatrice `20260818110000:48-51`.
    cookingStyle: readCookingStyle(pc),
    groceryRuns: readGroceryRuns(pc),
  };
}

/**
 * Un nombre de PostgREST, ou `null`.
 *
 * `numeric` arrive en CHAÎNE (« 26.5 ») par la couche JSON de PostgREST, pas en
 * nombre: un `typeof === "number"` aurait rendu `null` sur chaque corps saisi,
 * et le lot serait inerte sans qu'aucun test de module ne le voie.
 */
function num(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export { num, readCookingCapacity, readWindowRequest };
