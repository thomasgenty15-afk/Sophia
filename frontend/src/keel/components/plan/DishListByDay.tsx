import React from "react";

import { dishDayLabel, dishSlotLabel } from "../../api/mealLabels";
import type { DayListGroup } from "../../lib/dishListByDay";
import type { DishTick } from "../../lib/useMealTicks";
import { UntickForm } from "../DishCard";
import { t } from "../../i18n/t";

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
// ⟳ A8.1 (2026-09-03) — UNE CASE PEUT S'AJOUTER, ET RIEN D'AUTRE. Un profil
// réclamé déclare ce qu'il a mangé; c'est un fait sur LUI, pas un
// enrichissement du plat. La garde ci-dessus tient toujours: aucune recette,
// aucun « pourquoi », aucune cuisine n'entre ici.
//
// ── LES GROUPES SONT DÉJÀ FAITS ────────────────────────────────────────────
// Le composant REND; la découpe par jour vit dans `lib/dishListByDay`
// (`groupDishListByDay`) ou dans `buildPersonWeek` — jamais ici. Un rendu qui
// regrouperait lui-même referait le travail différemment chez chaque monteur.

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A8.1 — QUI COCHE, ET QUI NE COCHE PAS. LA DÉCISION EST AU SITE DE MONTAGE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ `bindTick` EST REQUIS, ET `null` EST UNE RÉPONSE À ÉCRIRE. Un `?` aurait
 * donné « pas de case » par défaut à trois montages dont un DOIT en avoir —
 * et le montage qui l'oublierait aurait l'air de marcher (cicatrice
 * `optional-gate-params-are-disarmed-gates`). Pire dans l'autre sens: rendre
 * la case partout mettrait une case sous les plats d'un AUTRE dans la vue par
 * personne du maître, c'est-à-dire le maître cochant pour un profil réclamé —
 * l'interdit de FF-058 R11.
 *
 * Les trois montages, et leur réponse:
 *   · `MyShareCard`       → le binder. C'est SA part, ce sont SES faits.
 *   · `HouseholdPlanCard` → `null`. « Ce que la maison cuisine » est une
 *     lecture; ses coches à lui vivent sur `/app/plan`, dans sa part. Deux
 *     surfaces de coche pour le même fait divergeraient à l'écran.
 *   · `PlanByPerson.OnePerson` → `null` par construction: `buildPersonWeek`
 *     n'émet aucune position (`dishIndex: null`), et le dit là-bas.
 *
 * ⚠️ UNE POSITION MANQUANTE FERME LA CASE, MÊME AVEC UN BINDER. C'est la
 * seconde moitié: `dishIndex === null` veut dire « cette liste ne sait pas où
 * ce plat vit dans le plan », et une case sans position écrirait un fait sur
 * un plat au hasard.
 */
export default function DishListByDay(props: {
  groups: readonly DayListGroup[];
  bindTick: ((dishIndex: number) => DishTick | null) | null;
}): React.ReactElement | null {
  const { bindTick } = props;
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
              const tick = bindTick !== null && dish.dishIndex !== null
                ? bindTick(dish.dishIndex)
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
                  {tick ? <DishTickBox tick={tick} /> : null}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * LA CASE, ET LE FORMULAIRE QUI SUIT UNE DÉCOCHE.
 *
 * ⚠️ `UntickForm` EST CELUI DE `DishCard`, IMPORTÉ. Les motifs sont une liste
 * FERMÉE alignée sur le serveur et sur la CHECK de la table
 * (`mealTicks.int.test.ts` tient les deux côtés): une seconde copie
 * divergerait, et la divergence s'écrirait en base avant qu'on la voie.
 *
 * ⚠️ ET AUCUNE ÉCRITURE ICI. `onToggle` et `onPick` viennent de `useMealTicks`,
 * la liaison unique. Un `tickMeal` appelé depuis un rendu serait le second
 * câblage que ce dépôt paie en boucle.
 *
 * Sous-composant plutôt que du JSX en ligne: `React.useId` est un hook, il ne
 * peut pas vivre dans un `.map`.
 */
function DishTickBox({ tick }: { tick: DishTick }): React.ReactElement {
  const tickId = React.useId();
  return (
    <>
      {/* SUR SA PROPRE LIGNE, et pas à droite du titre comme dans `DishCard`:
          à 320 px un titre long pousserait la case hors du conteneur. La
          cible ≥ 24 px est tenue par le couple case + libellé, cliquables
          ensemble par le `htmlFor`. */}
      <span className="mt-1 flex items-center gap-2 pl-4">
        <input
          id={tickId}
          type="checkbox"
          className="h-4 w-4 rounded-part border-line-strong text-ink focus:ring-fig-600 disabled:opacity-50"
          checked={tick.checked}
          disabled={tick.busy}
          onChange={tick.onToggle}
        />
        <label
          htmlFor={tickId}
          className={`text-sm ${tick.checked ? "text-ink" : "text-ink-soft"}`}
        >
          {t("meals.tick.label")}
        </label>
      </span>
      {tick.untickPrompt ? <UntickForm prompt={tick.untickPrompt} /> : null}
    </>
  );
}
