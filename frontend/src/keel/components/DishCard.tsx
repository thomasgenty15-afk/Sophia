import React from "react";

import { type GeneratedDish } from "../api/mealGeneration";
import { type DishEnergyView } from "../api/mealEnergy";
import { dishDayLabel, dishSlotLabel, mealCopy } from "../api/mealLabels";
import { type DishTick } from "../lib/useMealTicks";
import { DishEnergyLine } from "./plan/EnergyReadout";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";

// UN PLAT, RENDU UNE SEULE FOIS.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Le plat était rendu dans `MealBuilder` (« ce que je viens de composer ») et
// devait l'être une seconde fois dans `/app/today` (« ce que je mange
// aujourd'hui »). Deux rendus du même objet finissent par diverger, et ici la
// divergence se paierait sur la seule chose qui compte: l'élève lirait des
// ingrédients sur un écran et pas sur l'autre, sans aucun moyen de savoir
// lequel des deux ment.
//
// LE PLAT ENTIER, PAS SON TITRE. Le titre seul (« Chicken thighs, rice,
// spinach ») oblige à rouvrir un autre écran pour cuisiner. Un plat se lit là
// où on le mange: les ingrédients avec leurs quantités, et la méthode.
//
// ── LA DOCTRINE NE S'AFFICHE JAMAIS ────────────────────────────────────────
// Même règle que le moteur: les convictions du coach ENTRENT dans la
// composition et n'en RESSORTENT pas. `GeneratedDish` ne porte même pas
// `honours_belief_keys` (le client `api/mealGeneration.ts` refuse de le
// recopier), donc ce composant n'a rien à afficher par accident.
//
// C'est l'inverse d'une ligne de semaine (`WeekPlanItem.source_belief_claim`),
// qui cite la conviction exprès — et ce n'est pas une incohérence: une ligne de
// méthode est une LECTURE de la conviction, qu'il faut pouvoir juger; un plat
// est un dîner que la méthode a servi à composer, et l'annoter de la méthode
// transformerait un repas en leçon.
//
// ── UNE SEULE CASE, ET ELLE NE MESURE PAS L'OBÉISSANCE ─────────────────────
// `tick` est OPTIONNEL, et son absence est le défaut: un `DishCard` sans lui
// est strictement en lecture. C'est ce qui garde la règle d'origine vraie là où
// elle l'était — aucun statut, aucune série, aucun « l'a-t-il suivi », parce
// que personne n'a rien prescrit.
//
// Ce que la case dit, quand elle est là: « j'ai mangé ça ». Un fait rapporté
// par l'élève, pas une consigne validée. Elle n'ouvre aucun score et ne crédite
// aucune ligne de plan (`_shared/keel/meal_tick.ts`: sans référence
// structurée, l'évaluateur ne crédite rien); elle compte pour la COUVERTURE —
// « cet élève rapporte ce qu'il mange » — et strictement rien d'autre.
//
// QUI DÉCIDE DE L'AFFICHER: l'appelant, et seulement sur les plats
// d'aujourd'hui. Le pourquoi de cette borne est dans `lib/useMealTicks.ts`
// (une coche est datée du jour où on tape, donc elle n'a de sens que sur ce
// qu'on mange ce jour-là).

/**
 * CE JOUR-CI EST-IL LE JOUR DE CUISSON, OU UN JOUR DE RESTES ?
 *
 * Défaut mesuré, et il est grossier: un plat en lot est placé sur chaque jour
 * qu'il couvre, et il y répétait ses quantités ENTIÈRES. « chicken thighs
 * 1,200 g » apparaissait lundi, mardi, mercredi et jeudi — quatre fois. Un
 * élève qui lit ça comprend qu'il doit acheter et cuire 4,8 kg de poulet.
 * (La liste de courses, elle, était juste: 2 kg au total.)
 *
 * `null` = ce plat se cuisine ici, ou ne se cuisine qu'une fois: quantités et
 * méthode complètes. Un jeton de jour = on mange le lot cuit CE jour-là, et la
 * carte se replie sur ce qu'il faut vraiment faire — sortir la boîte.
 */
export type ServedFrom = string | null;

/** La préparation dans laquelle ce plat puise, résolue par l'appelant. */
export interface DishSource {
  title: string;
  cookOn: string | null;
}

export default function DishCard(
  { dish, tick, servedFrom = null, sources = [], energy = null }: {
    dish: GeneratedDish;
    tick?: DishTick | null;
    servedFrom?: ServedFrom;
    /** Les préparations que ce plat consomme. Vide = il se fait de zéro. */
    sources?: readonly DishSource[];
    /**
     * FF-059 — L'ÉNERGIE DE CE PLAT, quand les quatre portes sont ouvertes.
     *
     * `null` est le défaut ET le cas le plus fréquent: un élève sous plancher
     * TCA, un mineur, un élève dont le coach ne compte pas, un élève qui a
     * éteint — pour tous ceux-là, la réponse du serveur ne contient AUCUN
     * chiffre, donc l'appelant n'a rien à passer. La carte ne teste aucun droit:
     * elle ne peut pas afficher ce qui n'existe pas dans son arbre de props.
     *
     * C'est ce qui répond à l'angle adversarial « une prop React qui fuit »:
     * la prop existe, la donnée non.
     */
    energy?: DishEnergyView | null;
  },
) {
  // Un plat qui PUISE dans une préparation n'affiche ni sa recette ni ses
  // quantités: elles vivent dans la session de cuisine, et les répéter ici
  // ferait racheter et recuire ce qui est déjà au frigo. C'est le correctif du
  // défaut mesuré (« 1,200 g de cuisses » sur quatre jours).
  const leftover = servedFrom !== null || sources.length > 0;
  // Une case a besoin d'un libellé qui lui appartient: le même plat est rendu
  // sur `/app/plan` et `/app/today`, et un `id` en dur ferait pointer deux
  // libellés vers la même case.
  const tickId = React.useId();
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-900">{dish.title}</span>
        {dish.slot && <Badge tone="neutral">{dishSlotLabel(dish.slot)}</Badge>}
        {/* FF-059 — LE CHIFFRE, à côté du plat et pas au-dessus. C'est un fait
            SUR CE PLAT, du même rang que son créneau: le mettre en tête de
            carte en ferait le sujet, et le sujet reste le dîner. */}
        <DishEnergyLine energy={energy} />
        {tick && (
          <span className="ml-auto flex items-center gap-2">
            <input
              id={tickId}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 disabled:opacity-50"
              checked={tick.checked}
              disabled={tick.busy}
              onChange={tick.onToggle}
            />
            <label
              htmlFor={tickId}
              className={`text-sm ${tick.checked ? "text-gray-900" : "text-gray-500"}`}
            >
              {mealCopy("meals.tick.label")}
            </label>
          </span>
        )}
      </div>
      {dish.why && <p className="mt-1 text-sm text-gray-600">{dish.why}</p>}

      {/* LE JOUR DE CUISSON, QUAND CE N'EST PAS AUJOURD'HUI. C'est la seule
          chose à faire ce jour-là, donc c'est la seule chose affichée. */}
      {sources.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg bg-gray-50 px-3 py-2">
          {sources.map((source, i) => (
            <p key={`${source.title}-${i}`} className="text-sm text-gray-700">
              {mealCopy("meals.result.from_prep")
                .replace("{title}", source.title)
                .replace(
                  "{day}",
                  (source.cookOn ? dishDayLabel(source.cookOn) : null) ??
                    source.cookOn ?? "—",
                )}
            </p>
          ))}
        </div>
      )}
      {sources.length === 0 && servedFrom !== null && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {mealCopy("meals.result.from_batch").replace(
            "{day}",
            dishDayLabel(servedFrom) ?? servedFrom,
          )}
        </p>
      )}

      {dish.ingredients.length > 0 && (
        <ul className="mt-3 space-y-1">
          {dish.ingredients.map((ing, i) => (
            <li
              key={`${ing.term}-${i}`}
              className="flex flex-wrap items-baseline gap-2 text-sm text-gray-800"
            >
              <span>{ing.term}</span>
              {ing.quantity && <span className="text-gray-500">{ing.quantity}</span>}
              {ing.in_pantry && (
                <Badge tone="positive">{mealCopy("meals.result.in_pantry")}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {!leftover && dish.method && (
        <p className="mt-3 text-sm text-gray-700">
          <span className="font-medium text-gray-900">
            {mealCopy("meals.result.method")}:
          </span>{" "}
          {dish.method}
        </p>
      )}
    </Card>
  );
}
