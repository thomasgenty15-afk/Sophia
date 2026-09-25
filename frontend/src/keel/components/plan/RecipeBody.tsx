import type { DishIngredient } from "../../api/mealGeneration";
import { mealCopy } from "../../api/mealLabels";
import { ingredientQuantityText } from "../../lib/ingredientQuantity";

/**
 * ⟳ 2026-09-25 — LE CORPS D'UNE RECETTE DE SESSION: CE QU'ON MET, PUIS COMMENT.
 *
 * Demandé: « au niveau des sessions de cuisine, l'UI pourrait être beaucoup
 * plus cool ». Les ingrédients sortaient en liste nue (« saumon 236 g »), la
 * méthode en gris dessous: tout se lisait au même niveau, et la méthode — ce
 * qu'on vient chercher devant la casserole — avait l'air d'une note.
 *
 * Deux colonnes titrées dès que la largeur le permet (une sur téléphone): les
 * ingrédients à gauche, quantité alignée à droite en `tabular-nums` (la règle
 * de `BoxTable`: des nombres alignés se comparent d'un coup d'œil), la
 * préparation à droite, en encre pleine.
 *
 * ⚠️ LES QUANTITÉS SONT CELLES DE LA FOURNÉE ENTIÈRE, du CRU — voir
 * `PlanDayBlock`. Muet sans quantité, jamais « ? ».
 * ⛔ LA MÉTHODE N'EST PAS DÉCOUPÉE EN ÉTAPES: ce serait deviner des phrases
 * dans un texte de modèle, dans sa langue (« jamais de matcher maison »).
 *
 * Rendu par le bloc du jour (`PlanDayBlock`) et par la fenêtre « Tes sessions
 * de cuisine » (`CookingSessions`): deux rendus de la même recette divergeraient.
 */
export function RecipeBody(
  { ingredients, method }: { ingredients: readonly DishIngredient[]; method: string },
) {
  const hasIngredients = ingredients.length > 0;
  const hasMethod = method !== "";
  if (!hasIngredients && !hasMethod) return null;
  return (
    <div
      className={`mt-2 grid gap-4 ${
        hasIngredients && hasMethod ? "sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-6" : ""
      }`}
    >
      {hasIngredients && (
        <div className="min-w-0">
          <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
            {mealCopy("meals.sessions.ingredients")}
          </p>
          {/* `min-w-0` sur le terme: enfant de flex, un nom composé long
              pousserait sinon la quantité hors de la carte à 320 px. */}
          <ul className="mt-1 divide-y divide-line">
            {ingredients.map((ing, i) => {
              const quantity = ingredientQuantityText(ing);
              return (
                <li
                  key={`${ing.term}-${i}`}
                  className="flex items-baseline justify-between gap-3 py-1 text-sm"
                >
                  <span className="min-w-0 break-words text-ink">{ing.term}</span>
                  {quantity && (
                    <span className="shrink-0 tabular-nums text-ink-soft">{quantity}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {hasMethod && (
        <div className="min-w-0">
          <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">
            {mealCopy("meals.sessions.method")}
          </p>
          <p className="mt-1 break-words text-sm leading-6 text-ink">{method}</p>
        </div>
      )}
    </div>
  );
}
