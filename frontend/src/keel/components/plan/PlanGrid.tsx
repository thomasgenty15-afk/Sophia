import React from "react";

import { dishDayLabel, mealCopy } from "../../api/mealLabels";
import type { EatingOccasion } from "../../api/mealGeneration";
import type { PlanGrid as PlanGridModel } from "../../lib/planGridModel";

// FF-053 — LA VUE GLOBALE. La semaine en un coup d'œil, un titre par case.
//
// ── CE QU'ELLE REND POSSIBLE, ET QUE LE DÉFILEMENT INTERDISAIT ─────────────
// « Il y a trop de poulet cette semaine » est une phrase qu'on n'écrit que si
// on a VU le poulet trois fois d'affilée. Vingt-et-une cartes empilées cachent
// la répétition; une grille l'expose. C'est ce qui fera du feedback (FF-054)
// autre chose qu'une case de commentaire qu'on ne remplit jamais.
//
// ── LE PIÈGE QU'ELLE TEND, ET LE DRAPEAU QUI LE DÉSAMORCE ─────────────────
// Trois cases identiques sont soit une casserole intelligente, soit un modèle
// paresseux. Non marquées, elles feraient juger comme un défaut le comportement
// même que FF-052 cherche à produire. `fromBatch` porte la distinction, et elle
// vient de la donnée (`uses` non vide), pas d'une heuristique.
//
// ── LA GÉOMÉTRIE VIENT DE `MealPickerGrid` ────────────────────────────────
// Table, colonne de créneaux collante, `overflow-x-auto`, `min-w`. Sept
// colonnes ne tiennent pas à 320 px, et laisser la page partir de travers
// emporterait tout l'écran. Le squelette n'est pas encore factorisé entre les
// deux (FF-053 A6): `MealPickerGrid` n'est pas commité et appartient à une
// autre lane. La duplication est ASSUMÉE et écrite ici, pas subie.

export interface PlanGridProps {
  grid: PlanGridModel;
  /** Les dates des colonnes, même longueur et même ordre que `grid.days`. */
  dates: readonly string[];
  /** Aujourd'hui, pour souligner sa colonne. */
  today: string;
}

function occasionLabel(slot: EatingOccasion): string {
  return mealCopy(`meals.slot.${slot}` as Parameters<typeof mealCopy>[0]);
}

export default function PlanGrid(props: PlanGridProps) {
  if (props.grid.days.length === 0 || props.grid.rows.length === 0) return null;

  return (
    <section aria-label={mealCopy("meals.grid.title")}>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">
        {mealCopy("meals.grid.title")}
      </h3>
      {/* La grille défile DANS son conteneur. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-white py-2 pr-3 text-left text-xs font-medium text-gray-500"
              >
                {mealCopy("meals.picker.meal")}
              </th>
              {props.grid.days.map((day, i) => {
                const isToday = props.dates[i] === props.today;
                return (
                  <th
                    key={`${day}-${i}`}
                    scope="col"
                    className={`px-2 py-2 text-left text-xs font-medium ${
                      isToday ? "text-emerald-700" : "text-gray-500"
                    }`}
                  >
                    <span className="block">
                      {(dishDayLabel(day) ?? day).slice(0, 3)}
                    </span>
                    <span className="block font-normal text-gray-400">
                      {props.dates[i]?.slice(8) ?? ""}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {props.grid.rows.map((row) => (
              <tr key={row.slot} className="border-t border-gray-100 align-top">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-white py-2 pr-3 text-left font-normal text-gray-900"
                >
                  {occasionLabel(row.slot)}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={`${row.slot}-${i}`} className="px-2 py-2">
                    {cell.kind === "dish" && (
                      <span className="block leading-snug text-gray-900">
                        {/* TRONQUÉ À DEUX LIGNES, et le titre entier reste au
                            survol. Sans ça, « Peanut butter toast and fruit »
                            prend trois lignes, la grille devient aussi haute
                            que la liste qu'elle résume, et elle ne résume plus
                            rien. */}
                        <span className="line-clamp-2 block" title={cell.title}>
                          {cell.title}
                        </span>
                        {cell.fromBatch && (
                          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-gray-400">
                            {mealCopy("meals.grid.from_batch")}
                          </span>
                        )}
                      </span>
                    )}
                    {/* LES TROIS SILENCES VOULUS. Ils se ressemblent entre eux —
                        ce sont tous des « rien à composer ici, et c'est normal »
                        — et ils ne ressemblent PAS au quatrième. */}
                    {cell.kind === "away" && (
                      <span className="text-xs italic text-gray-400">
                        {mealCopy("meals.grid.away")}
                      </span>
                    )}
                    {cell.kind === "fixed_intake" && (
                      <span className="text-xs italic text-gray-400">
                        {cell.label}
                      </span>
                    )}
                    {cell.kind === "leftovers" && (
                      <span className="text-xs italic text-gray-400">
                        {mealCopy("meals.grid.leftovers")}
                      </span>
                    )}
                    {/* LE QUATRIÈME, ET LE SEUL QUI SOIT UN DÉFAUT. Il ne doit
                        ressembler à aucun des trois autres: c'est la seule
                        anomalie que cet écran pouvait révéler. */}
                    {cell.kind === "empty" && (
                      <span
                        className="text-xs text-amber-700"
                        title={mealCopy("meals.grid.empty_hint")}
                      >
                        {mealCopy("meals.grid.empty")}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
