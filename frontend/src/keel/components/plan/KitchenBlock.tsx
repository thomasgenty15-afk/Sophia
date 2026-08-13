import React from "react";

import type { GeneratedDish, MealPreparation } from "../../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../../api/mealLabels";
import { Card } from "../ui/Card";
import { daysFedBy } from "../../lib/planGridModel";

// FF-053 — CE QUI SE CUISINE, épinglé au-dessus des jours.
//
// ── POURQUOI IL EXISTE, ET POURQUOI EN HAUT ────────────────────────────────
// Un plat en lot est DÉJÀ placé sur chacun des jours qu'il couvre: le rôti du
// dimanche apparaît lundi, mardi, mercredi. Replier les jours casserait le lien
// — on ne verrait plus que c'est UNE SEULE casserole. Et depuis FF-052
// (`batch_cook` / `leftovers`), ce lien est le cœur du plan, pas un détail.
//
// Ce bloc est donc ce qui rend le repli des jours acceptable: le lien « une
// casserole → trois jours » ne dépend plus de voir les trois jours ensemble.
//
// ── AUCUNE PRÉPARATION ⇒ AUCUN BLOC ────────────────────────────────────────
// Pas de titre orphelin au-dessus d'un vide. Une semaine sans lot est une
// semaine ordinaire, pas une semaine incomplète.

export interface KitchenBlockProps {
  preparations: readonly MealPreparation[];
  /** Les plats, pour savoir QUELS JOURS chaque préparation nourrit. */
  dishes: readonly GeneratedDish[];
}

export default function KitchenBlock(props: KitchenBlockProps) {
  if (props.preparations.length === 0) return null;

  // Les cuissons d'abord, dans l'ordre où elles se font. Une préparation sans
  // jour de cuisson passe en dernier: on ne peut rien dire de quand elle arrive.
  const ordered = [...props.preparations].sort((a, b) => {
    if (a.cook_on === b.cook_on) return 0;
    if (!a.cook_on) return 1;
    if (!b.cook_on) return -1;
    return 0;
  });

  return (
    <section aria-label={mealCopy("meals.kitchen.title")}>
      <h3 className="mb-2 text-sm font-semibold text-ink">
        {mealCopy("meals.kitchen.title")}
      </h3>
      <Card>
        <ul className="space-y-2">
          {ordered.map((prep) => {
            const days = daysFedBy(prep.id, props.dishes);
            return (
              <li key={prep.id} className="text-sm leading-6">
                <span className="font-medium text-ink">{prep.title}</span>
                {prep.cook_on && (
                  <span className="text-ink-soft">
                    {" — "}
                    {mealCopy("meals.kitchen.cook_on").replace(
                      "{day}",
                      dishDayLabel(prep.cook_on) ?? prep.cook_on,
                    )}
                  </span>
                )}
                {/* CE QU'ELLE NOURRIT, et c'est toute la raison du bloc. Sans
                    cette ligne, « rôti du dimanche » ne dit pas qu'on en mange
                    lundi, mardi et mercredi. */}
                {days.length > 0 && (
                  <span className="block text-xs text-ink-soft">
                    {mealCopy("meals.kitchen.feeds").replace(
                      "{days}",
                      days
                        .map((d) => dishDayLabel(d) ?? d)
                        .join(", "),
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
