import React from "react";

import {
  type CookingSession,
  type MealPreparation,
} from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
import { Card } from "./ui/Card";
import Modal from "./ui/Modal";

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
// ── LE TEMPS, EN DEUX NOMBRES ──────────────────────────────────────────────
// Le plan ne disait NULLE PART combien de temps quoi que ce soit prenait. Un
// plat annonçait « From Turkey meatballs — cooked on Thursday » et l'élève
// n'avait aucun moyen de savoir si son jeudi y passait vingt minutes ou deux
// heures. Ce n'était pas un défaut d'affichage: la donnée n'existait pas.
//
// Elle existe maintenant, et en DEUX nombres parce qu'ils répondent à deux
// questions différentes: « les mains dessus » décide si on s'y met ce soir,
// « en tout » décide si on a la fenêtre. Un rôti fait 10 actives et 50 totales,
// et c'est précisément cet écart qui rend le lot possible.
//
// ── LA RECETTE SE DÉPLIE ───────────────────────────────────────────────────
// Ingrédients et méthode de chaque préparation étaient dépliés en permanence,
// donc la SECTION — qui répond à « quand est-ce que je cuisine » — faisait
// plusieurs écrans et noyait sa propre réponse. Ce qui reste toujours visible
// est ce qu'on lit pour PLANIFIER: le jour, le déroulé, ce que ça produit,
// combien de temps. La recette est ce qu'on ouvre une fois devant la casserole.
//
// ── LES QUANTITÉS VIVENT ICI, PAS DANS LES PLATS ───────────────────────────
// Une préparation porte les ingrédients de TOUT le lot: 600 g de poulet pour
// quatre portions. Les plats qui y puisent n'affichent plus que ce qu'on ajoute
// à l'assiette. C'est le correctif du défaut mesuré — « chicken thighs 1,200 g »
// répété sur quatre jours, qui se lisait comme 4,8 kg à acheter.

export default function CookingSessions(
  { sessions, preparations, open, onClose }: {
    sessions: readonly CookingSession[];
    preparations: readonly MealPreparation[];
    /**
     * DANS UNE FENÊTRE, comme la liste de courses, et ouverte depuis le même
     * rang de boutons.
     *
     * Cette section vivait dépliée en bas de l'écran, après sept jours de
     * plats. Elle répond pourtant à une question qu'on se pose AVANT de lire
     * les repas — « quand est-ce que je cuisine » — et il fallait faire défiler
     * toute la semaine pour la trouver.
     *
     * LE COMPOSANT RESTE MONTÉ QUAND ELLE EST FERMÉE (`Modal` rend `null`, il
     * ne démonte pas): les recettes qu'on a dépliées survivent à un
     * aller-retour vers un plat.
     */
    open: boolean;
    onClose: () => void;
  },
) {
  // Les recettes ouvertes, par `id` de préparation. Un `Set` et pas un booléen
  // par session: on ouvre la recette qu'on cuisine, pas toutes celles du jour.
  const [openPreps, setOpenPreps] = React.useState<Set<string>>(new Set());
  const togglePrep = (id: string) =>
    setOpenPreps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (sessions.length === 0) return null;
  const byId = new Map(preparations.map((p) => [p.id, p]));

  return (
    <Modal open={open} onClose={onClose} title={mealCopy("meals.sessions.title")}>
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
              <h3 className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-gray-900">
                {dishDayLabel(session.day) ?? session.day}
                {/* LA DURÉE DE LA SESSION, au mur — c'est ce qu'on regarde pour
                    savoir si on cale ça ce soir. Elle vient du modèle et n'est
                    PAS la somme des préparations: les cuissons se chevauchent,
                    et additionner transformerait un dimanche confortable en une
                    corvée de quatre heures que personne ne commence. */}
                {session.total_minutes !== null && (
                  <span className="text-xs font-normal tabular-nums text-gray-500">
                    {mealCopy("meals.sessions.session_time").replace(
                      "{n}",
                      String(session.total_minutes),
                    )}
                  </span>
                )}
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
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {prep.title}
                      <span className="ml-2 font-normal text-gray-500">
                        {mealCopy("meals.sessions.makes").replace(
                          "{n}",
                          String(prep.servings_made),
                        )}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => togglePrep(prep.id)}
                      aria-expanded={openPreps.has(prep.id)}
                      className="shrink-0 text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
                    >
                      {openPreps.has(prep.id)
                        ? mealCopy("meals.sessions.recipe_hide")
                        : mealCopy("meals.sessions.recipe_show")}
                    </button>
                  </div>

                  {/* LES DEUX TEMPS RESTENT VISIBLES, RECETTE FERMÉE: c'est
                      l'information qu'on lit pour planifier, pas pour cuisiner.
                      La replier avec la recette obligerait à ouvrir chaque
                      préparation pour savoir si le jeudi tient. */}
                  {(prep.active_minutes !== null || prep.total_minutes !== null) && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-gray-500">
                      {prep.active_minutes !== null && (
                        <span>
                          {mealCopy("meals.sessions.active").replace(
                            "{n}",
                            String(prep.active_minutes),
                          )}
                        </span>
                      )}
                      {prep.total_minutes !== null && (
                        <span>
                          {mealCopy("meals.sessions.total").replace(
                            "{n}",
                            String(prep.total_minutes),
                          )}
                        </span>
                      )}
                    </p>
                  )}

                  {openPreps.has(prep.id) && (
                    <>
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
                    </>
                  )}
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </Modal>
  );
}
