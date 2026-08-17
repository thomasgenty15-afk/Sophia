import React from "react";

import { dishDayLabel, dishSlotLabel } from "../../api/mealLabels";
import type { DayListGroup } from "../../lib/dishListByDay";

// LOT 1 — LA LISTE D'UN PLAN, PAR JOUR. Extraite du rendu par jour de
// `PlanByPerson.OnePerson`, pour être montée trois fois: la semaine d'une
// bouche (`OnePerson`), « ce que la maison cuisine » (`HouseholdPlanCard`) et
// les plats communs de « ta part » (`MyShareCard`). Trois listes plates
// écrites séparément divergeraient au premier correctif.
//
// ── ⛔ SANS ENRICHISSEMENT, ET C'EST UNE GARDE PRODUIT ─────────────────────
// Un jour, un moment, un titre, une part — RIEN d'autre. Un secondaire ne voit
// ni la recette ni la raison d'un plat du foyer (`HouseholdDishView` ne les
// porte même pas), et cette liste ne montre aucune cuisine du jour: ces
// surfaces sont des lectures à voix haute, pas le plan du maître. Le détail
// vit sur `/app/plan`, chez qui compose.
//
// ── LES GROUPES SONT DÉJÀ FAITS ────────────────────────────────────────────
// Le composant REND; la découpe par jour vit dans `lib/dishListByDay`
// (`groupDishListByDay`) ou dans `buildPersonWeek` — jamais ici. Un rendu qui
// regrouperait lui-même referait le travail différemment chez chaque monteur.

export default function DishListByDay(props: {
  groups: readonly DayListGroup[];
}): React.ReactElement | null {
  if (props.groups.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {props.groups.map((group) => (
        <li key={group.day ?? "undated"}>
          {/* Le groupe SANS jour n'a pas de titre: lui inventer « lundi »
              serait une prescription d'horaire que le moteur n'a pas faite. */}
          {group.day && (
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {dishDayLabel(group.day) ?? group.day}
            </p>
          )}
          <ul className="mt-1 flex flex-col gap-1">
            {group.dishes.map((dish, i) => {
              const slot = dish.slot
                ? dishSlotLabel(dish.slot) ?? dish.slot
                : null;
              return (
                // La clé porte l'INDEX en plus du reste: deux jours peuvent
                // servir le même plat, et deux `<li>` de même clé perdent
                // l'un des deux au rendu.
                <li
                  key={`${group.day ?? ""}:${dish.slot ?? ""}:${dish.title}:${i}`}
                  className="text-sm leading-6 break-words"
                >
                  {slot
                    ? (
                      <>
                        <span className="text-ink-soft">{slot}</span>
                        {" — "}
                      </>
                    )
                    : null}
                  <span className="text-ink">{dish.title}</span>
                  {/* SA PART SOUS LE PLAT, jamais à la place: le plat est
                      commun, la part ne l'est pas. Rien quand il n'y a pas de
                      part — on n'invente pas une phrase pour remplir. */}
                  {dish.note
                    ? <span className="block pl-4 text-ink-soft">{dish.note}</span>
                    : null}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
