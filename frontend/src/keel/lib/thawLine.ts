// ⟳ 2026-09-09 — LE GESTE DE LA VEILLE, DÉTERMINISTE, UNE SEULE FOIS.
//
// « La veille au soir, sors du congélateur : dinde hachée 450 g. » Rendue sur
// la carte de session du jour ET dans « Tes sessions de cuisine »: deux
// surfaces, une seule dérivation. Elle vient de la LISTE DE COURSES
// (`freeze_on_purchase`, posée par le moteur), jamais du déroulé écrit par le
// modèle — mesuré le 2026-09-08, le déroulé disait « acheter la dinde fraîche
// le jour même » sous une ligne congelée.
//
// La lecture est celle du serveur (`frozenLinesForPreparations`), réexportée
// par `api/groceryWaves`: le PDF et le rappel du chat lisent la même chose.
import type { CookingSession, MealPreparation, ShoppingItem } from "../api/mealGeneration";
import { frozenLinesForPreparations, wavePreparationsFromRows } from "../api/groceryWaves";
import { mealCopy } from "../api/mealLabels";

export function frozenLinesForSession(
  session: Pick<CookingSession, "preparation_ids">,
  preparations: readonly MealPreparation[],
  shoppingList: readonly ShoppingItem[],
): ShoppingItem[] {
  return frozenLinesForPreparations({
    shoppingList,
    preparations: wavePreparationsFromRows(preparations),
    preparationIds: session.preparation_ids,
  });
}

/** La phrase, ou `null` quand cette session ne sort rien du congélateur. */
export function thawLineFor(
  session: Pick<CookingSession, "preparation_ids">,
  preparations: readonly MealPreparation[],
  shoppingList: readonly ShoppingItem[],
): string | null {
  const lines = frozenLinesForSession(session, preparations, shoppingList);
  if (lines.length === 0) return null;
  const items = lines
    .map((l) => (l.quantity ? `${l.term} (${l.quantity})` : l.term))
    .join(", ");
  return mealCopy("meals.sessions.thaw_night_before", { items });
}
