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
  /**
   * LOT 1 — CLIQUER UN JOUR FILTRE LE DÉTAIL. Optionnel: la grille reste
   * lisible seule, et un appelant qui n'a pas de vue jour n'a pas de faux
   * bouton. Quand il est fourni, le CONTENU du `<th>` devient un bouton — la
   * grille est le sélecteur naturel, pas un second rail concurrent.
   */
  onSelectDay?: (day: string) => void;
}

function occasionLabel(slot: EatingOccasion): string {
  return mealCopy(`meals.slot.${slot}` as Parameters<typeof mealCopy>[0]);
}

/**
 * Les titres en collision sur ce moment, pour le survol du badge.
 *
 * ⚠️ RENDU `undefined` QUAND IL N'Y A RIEN À DIRE, jamais la chaîne vide: un
 * `title=""` est un attribut présent, et le survol produirait une infobulle
 * vide — un cadre gris qui s'ouvre sur rien.
 *
 * ⚠️ CE REPLI N'EST PAS ATTEIGNABLE DEPUIS LE BADGE, dit franchement. Le badge
 * ne se rend que si `extraTableDishes > 0`, et ce compte comme `issues`
 * sortent des MÊMES `groups`: quand l'un est non nul, l'autre a sa ligne. Sa
 * mutation ne mord donc sur aucun test, et le prétendre gardé serait faux. Il
 * est là parce que la fonction est totale, pas parce qu'un rouge le tient.
 */
function issueTitles(
  grid: PlanGridModel,
  day: string | undefined,
  slot: EatingOccasion,
): string | undefined {
  if (!day) return undefined;
  const found = grid.issues.find((i) => i.day === day && i.slot === slot);
  return found ? found.titles.join(" · ") : undefined;
}

export default function PlanGrid(props: PlanGridProps) {
  if (props.grid.days.length === 0 || props.grid.rows.length === 0) return null;

  return (
    <section aria-label={mealCopy("meals.grid.title")}>
      <h3 className="mb-2 text-sm font-semibold text-ink">
        {mealCopy("meals.grid.title")}
      </h3>
      {/* La grille défile DANS son conteneur. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-paper py-2 pr-3 text-left text-xs font-medium text-ink-soft"
              >
                {mealCopy("meals.picker.meal")}
              </th>
              {props.grid.days.map((day, i) => {
                const isToday = props.dates[i] === props.today;
                // LE CONTENU DU `<th>`, une seule fois: il sert nu, ou dans le
                // bouton de sélection — deux copies divergeraient.
                const label = (
                  <>
                    <span className="block">
                      {(dishDayLabel(day) ?? day).slice(0, 3)}
                    </span>
                    <span className="block font-normal text-ink-soft">
                      {props.dates[i]?.slice(8) ?? ""}
                    </span>
                  </>
                );
                return (
                  <th
                    key={`${day}-${i}`}
                    scope="col"
                    // ⛔ AUJOURD'HUI EST UNE POSITION, PAS UN ÉTAT — et c'est
                    // pour ça que l'émeraude est partie d'ici. Dans tout le
                    // produit, émeraude = « ok » : un jour peint en vert
                    // affirmait qu'être aujourd'hui est une réussite, ce qui ne
                    // veut rien dire, et volait la teinte dont un
                    // enregistrement confirmé a besoin juste à côté.
                    // La position se dit donc par la FORME: encre pleine et
                    // graisse contre encre secondaire. `ink` sur `paper` =
                    // 16,18:1, `ink-soft` = 6,11:1.
                    className={`px-2 py-2 text-left text-xs ${
                      isToday
                        ? "font-semibold text-ink"
                        : "font-medium text-ink-soft"
                    }`}
                  >
                    {props.onSelectDay
                      ? (
                        // LOT 1 — le jour se CHOISIT ici. Le soulignement au
                        // survol porte l'affordance (l'idiome du kit pour un
                        // contrôle discret); `min-h-6` est le plancher tactile
                        // de 24 px, que deux lignes de `text-xs` n'atteignent
                        // pas seules. La graisse et l'encre restent celles du
                        // `<th>`: la position d'aujourd'hui ne bouge pas.
                        <button
                          type="button"
                          onClick={() => props.onSelectDay?.(day)}
                          className="min-h-6 text-left underline-offset-2 hover:underline"
                        >
                          {label}
                        </button>
                      )
                      : label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {props.grid.rows.map((row) => (
              <tr key={row.slot} className="border-t border-line align-top">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-paper py-2 pr-3 text-left font-normal text-ink"
                >
                  {occasionLabel(row.slot)}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={`${row.slot}-${i}`} className="px-2 py-2">
                    {cell.kind === "dish" && (
                      <span className="block leading-snug text-ink">
                        {/* TRONQUÉ À DEUX LIGNES, et le titre entier reste au
                            survol. Sans ça, « Peanut butter toast and fruit »
                            prend trois lignes, la grille devient aussi haute
                            que la liste qu'elle résume, et elle ne résume plus
                            rien.
                            ⛔ PAS DE `block` ICI. `line-clamp-2` pose
                            `display:-webkit-box`, et `block` le REMPLACE —
                            la paire `line-clamp-2 block` est inerte, la
                            troncature ne s'applique jamais, et ça ne se voit
                            que sur un titre assez long pour déborder. */}
                        <span className="line-clamp-2" title={cell.title}>
                          {cell.title}
                        </span>
                        {cell.fromBatch && (
                          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-ink-soft">
                            {mealCopy("meals.grid.from_batch")}
                          </span>
                        )}
                        {/* ── D3b · CE QUE LA CASE TAISAIT ─────────────────
                            Une case étroite ne peut pas lister les assiettes;
                            elle peut dire QU'IL Y EN A D'AUTRES. Sans ça, le
                            seul moment où le foyer ne mange pas la même chose
                            est justement celui où la grille l'affirme uni.
                            Un seul badge: `titleIsOwn` REMPLACE le compte —
                            « rien pour la table » est le fait le plus fort,
                            et deux lignes de badge doubleraient la hauteur. */}
                        {(cell.titleIsOwn || cell.ownMouths > 0) && (
                          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-ink-soft">
                            {cell.titleIsOwn
                              ? mealCopy("meals.grid.own_only")
                              : cell.ownMouths === 1
                              ? mealCopy("meals.grid.own_one")
                              : mealCopy("meals.grid.own_many", {
                                n: cell.ownMouths,
                              })}
                          </span>
                        )}
                        {/* Le second plat de TABLE du même moment. Compté et
                            nommé, jamais jeté: le moteur a peut-être raison,
                            et c'est à l'humain de trancher.
                            ⚠️ LE SURVOL NOMME LES PLATS EN COLLISION, et c'est
                            ce qui donne un LECTEUR à `grid.issues`. Sans lui,
                            l'écran ne dirait QUE le nombre, et la liste des
                            titres serait un champ calculé que personne
                            n'affiche — le defaut d'à côté. */}
                        {cell.extraTableDishes > 0 && (
                          <span
                            className="mt-0.5 block text-[10px] uppercase tracking-wide text-ink-soft"
                            title={issueTitles(props.grid, props.grid.days[i], row.slot)}
                          >
                            {cell.extraTableDishes === 1
                              ? mealCopy("meals.grid.extra_one")
                              : mealCopy("meals.grid.extra_many", {
                                n: cell.extraTableDishes,
                              })}
                          </span>
                        )}
                      </span>
                    )}
                    {/* LES QUATRE SILENCES VOULUS. Ils se ressemblent entre eux —
                        ce sont tous des « rien à composer ici, et c'est normal »
                        — et ils ne ressemblent PAS au cinquième. */}
                    {cell.kind === "away" && (
                      <span className="text-xs italic text-ink-soft">
                        {mealCopy("meals.grid.away")}
                      </span>
                    )}
                    {/* ⛔ CE `<td>` ÉTAIT VIDE, ET C'EST LE DÉFAUT QUE LE LOT DU
                        DÉJEUNER DEHORS EXISTAIT POUR LEVER. Le modèle produisait
                        l'état (`kind: "eating_out"`, rangé AU MÊME RANG que
                        `away` exprès), la traduction existait dans les deux
                        langues — et la grille ne rendait RIEN: pas le mot, pas
                        même le marqueur d'anomalie. Une case muette au milieu de
                        cases qui parlent se lit comme un moment que le plan a
                        oublié, c'est-à-dire exactement la confusion entre
                        « dehors » et « le plan est cassé ».
                        ⚠️ ELLE PORTE LE TON DES SILENCES, PAS L'AMBRE. « Dehors »
                        est une déclaration de la personne, pas un défaut du
                        plan: la peindre en ambre accuserait quelqu'un d'avoir
                        déjeuné au restaurant. */}
                    {cell.kind === "eating_out" && (
                      <span className="text-xs italic text-ink-soft">
                        {mealCopy("meals.grid.eating_out")}
                      </span>
                    )}
                    {cell.kind === "fixed_intake" && (
                      <span className="text-xs italic text-ink-soft">
                        {cell.label}
                      </span>
                    )}
                    {cell.kind === "leftovers" && (
                      <span className="text-xs italic text-ink-soft">
                        {mealCopy("meals.grid.leftovers")}
                      </span>
                    )}
                    {/* LE CINQUIÈME, ET LE SEUL QUI SOIT UN DÉFAUT. Il ne doit
                        ressembler à aucun des quatre autres: c'est la seule
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
