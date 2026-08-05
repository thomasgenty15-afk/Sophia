import React from "react";

import {
  type CookingSession,
  type MealPreparation,
} from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
import { Card, SectionLabel } from "./ui/Card";

// LES SESSIONS DE CUISINE — quand on cuisine, et dans quel ordre.
//
// POURQUOI CETTE SECTION EXISTE
// -----------------------------
// Le plan disait QUOI manger et jamais QUAND cuisiner. « Make the whole batch
// once » apparaissait sur quatre jours différents sans qu'aucun ne soit le jour
// de la casserole, et l'élève devait deviner.
//
// LE DÉROULÉ EST LE CHAMP QUI COMPTE, et c'est le seul qu'un plat ne peut pas
// porter: l'ordre des gestes se joue ENTRE les préparations — le riz pendant
// que le four tourne, le chili qui mijote à côté. C'est ce qu'on lit le
// dimanche soir avant de commencer.
//
// ── LES QUANTITÉS VIVENT ICI, PAS DANS LES PLATS ───────────────────────────
// Une préparation porte les ingrédients de TOUT le lot: 600 g de poulet pour
// quatre portions. Les plats qui y puisent n'affichent plus que ce qu'on ajoute
// à l'assiette. C'est le correctif du défaut mesuré — « chicken thighs 1,200 g »
// répété sur quatre jours, qui se lisait comme 4,8 kg à acheter.

export default function CookingSessions(
  { sessions, preparations }: {
    sessions: readonly CookingSession[];
    preparations: readonly MealPreparation[];
  },
) {
  if (sessions.length === 0) return null;
  const byId = new Map(preparations.map((p) => [p.id, p]));

  return (
    <section>
      <SectionLabel>{mealCopy("meals.sessions.title")}</SectionLabel>
      <p className="mb-3 text-sm text-gray-600">
        {mealCopy("meals.sessions.subtitle")}
      </p>
      <div className="space-y-3">
        {sessions.map((session, index) => {
          const preps = session.preparation_ids
            .map((id) => byId.get(id))
            .filter((p): p is MealPreparation => p !== undefined);
          return (
            <Card key={`${session.day}-${index}`}>
              <h3 className="text-sm font-semibold text-gray-900">
                {dishDayLabel(session.day) ?? session.day}
              </h3>

              {session.run_through && (
                <p className="mt-2 text-sm leading-6 text-gray-700">
                  {session.run_through}
                </p>
              )}

              {preps.map((prep) => (
                <div
                  key={prep.id}
                  className="mt-4 border-t border-gray-100 pt-3 first:border-0"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {prep.title}
                    <span className="ml-2 font-normal text-gray-500">
                      {mealCopy("meals.sessions.makes").replace(
                        "{n}",
                        String(prep.servings_made),
                      )}
                    </span>
                  </p>
                  {prep.ingredients.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {prep.ingredients.map((ing, i) => (
                        <li
                          key={`${ing.term}-${i}`}
                          className="flex flex-wrap items-baseline gap-2 text-sm text-gray-800"
                        >
                          <span>{ing.term}</span>
                          {ing.quantity && (
                            <span className="text-gray-500">{ing.quantity}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {prep.method && (
                    <p className="mt-2 text-sm text-gray-700">{prep.method}</p>
                  )}
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
