import React from "react";

import type {
  CookingSession,
  GeneratedDish,
  MealPreparation,
} from "../../api/mealGeneration";
import type { DayEnergyView, DishEnergyView } from "../../api/mealEnergy";
import { dishDayLabel, mealCopy } from "../../api/mealLabels";
import { DayEnergyLine } from "./EnergyReadout";
import { sessionForDish } from "../../lib/dishSession";
import DishCard from "../DishCard";
import { type DishTick } from "../../lib/useMealTicks";

// LOT 1 — LE BLOC D'UN JOUR. Extrait de `PlanResult` pour être RENDU DEUX FOIS
// par le même parent: dans la vue « toute la semaine » et dans la vue « un
// jour ». Deux corps de jour écrits séparément divergeraient au premier
// correctif — c'est l'argument exact qui a sorti `PlanResult` de `MealBuilder`.
//
// ── LA FRONTIÈRE AVEC LE PARENT ────────────────────────────────────────────
// Ce bloc REND un jour; il ne résout aucune fenêtre. La date de son groupe, la
// jointure jeton→date (`windowDates`) et la sélection du jour vivent chez
// l'appelant: une seconde résolution ici serait la « seconde liste de jours »
// que le lot interdit (deux dérivations du même plan divergent).
//
// ── CE QUI N'ARRIVERA JAMAIS ICI ───────────────────────────────────────────
// Les mêmes interdits que `PlanResult`: pas de doctrine, pas de coche inventée,
// et AUCUNE durée de session sur la carte d'un plat (`active_minutes` /
// `total_minutes` appartiennent aux préparations et aux sessions — les
// recopier sous un plat donnerait à un assemblage le temps d'une cuisson).

export interface PlanDayBlockProps {
  /** Le groupe de `groupByDay` — le jour, et ses plats. `day: null` = sans jour. */
  group: { day: string | null; dishes: readonly GeneratedDish[] };
  /**
   * La date de ce groupe, résolue par l'APPELANT (`dishDate` sur
   * `windowDates`). `null` = jeton hors fenêtre.
   */
  date: string | null;
  today: string;
  preparations: readonly MealPreparation[];
  cookingSessions: readonly CookingSession[];
  tick?: (dish: GeneratedDish, date: string | null) => DishTick | null;
  energy?: (dish: GeneratedDish) => DishEnergyView | null;
  dayEnergy?: (day: string | null) => DayEnergyView | null;
}

export default function PlanDayBlock(props: PlanDayBlockProps) {
  const { group, date } = props;
  return (
    <div>
      {group.day && (
        <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
          {dishDayLabel(group.day)}
          {/* OÙ ON EN EST DANS LE PLAN. Sans repère, une semaine qui
              commence mercredi se lit comme une semaine en retard: on ne
              sait pas si le premier jour affiché est passé, courant ou à
              venir. */}
          {/* ⛔ « AUJOURD'HUI » EST UNE POSITION, PAS UN ÉTAT. L'émeraude
              était ici un faux état: dans tout le produit elle dit « ok »,
              et un jour n'est ni réussi ni raté. Le repère passe donc à la
              forme — le cran `text-label` de la charte, en encre pleine,
              contre l'encre secondaire du jour passé juste en dessous. */}
          {date === props.today && (
            <span className="text-label font-semibold text-ink">
              {mealCopy("meals.result.today")}
            </span>
          )}
          {date !== null && date < props.today && (
            <span className="text-label font-normal text-ink-soft">
              {mealCopy("meals.result.past")}
            </span>
          )}
          {/* FF-059 · SURFACE B — LA SOMME DU JOUR, sur le titre du jour.
              `ml-auto` la pousse à droite: elle accompagne le jour, elle
              ne le remplace pas. */}
          <span className="ml-auto">
            <DayEnergyLine energy={props.dayEnergy?.(group.day) ?? null} />
          </span>
        </h3>
      )}
      <div className="space-y-3">
        {group.dishes.map((dish, index) => (
          <DishCard
            key={`${group.day}-${index}-${dish.title}`}
            dish={dish}
            // LES PRÉPARATIONS QUE CE PLAT CONSOMME, résolues ici: le plat
            // ne porte que des `id`, et une carte qui irait les chercher
            // elle-même dupliquerait la résolution sur les deux écrans qui
            // la montent.
            sources={dish.uses
              .map((u) =>
                props.preparations.find((p) => p.id === u.preparation_id)
              )
              .filter((p): p is NonNullable<typeof p> => Boolean(p))
              .map((p) => ({ title: p.title, cookOn: p.cook_on }))}
            tick={props.tick?.(dish, date)}
            energy={props.energy?.(dish) ?? null}
            // ── LA SESSION QUI A FAIT SON LOT (2026-08-14) ───────────────
            // RÉSOLUE ICI, comme `sources` juste au-dessus, et pour la même
            // raison: le plat ne porte que des `id`, et une carte qui irait
            // chercher les sessions elle-même dupliquerait la résolution sur
            // les deux écrans qui la montent.
            session={sessionForDish(dish, props.cookingSessions, props.preparations)}
          />
        ))}
      </div>
    </div>
  );
}
