import React from "react";

import type {
  CookingSession,
  GeneratedDish,
  MealPreparation,
} from "../../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../../api/mealLabels";
import { groupByDay } from "../../lib/mealBuilderModel";
import { dishDate } from "../../api/mealStretch";
import { windowDates, windowDayOrder } from "../../api/mealWindow";
import DishCard from "../DishCard";
import { type DishTick } from "../../lib/useMealTicks";
import { Card } from "../ui/Card";

// FF-053 — LE RENDU D'UN PLAN. Un seul, monté à deux endroits.
//
// ── POURQUOI IL EST SORTI DE `MealBuilder` ─────────────────────────────────
// Pas pour la longueur, même si `MealBuilder` en faisait mille. Parce que ce
// rendu doit exister **deux fois**: sur `/app/plan`, pour le plan adopté, et
// dans la pop-up du brouillon (FF-054). Deux rendus d'un même plan divergent au
// premier correctif, et c'est celui qu'on regarde le moins qui garde l'ancien
// comportement — ce dépôt a déjà payé cette phrase ailleurs.
//
// ── LA FRONTIÈRE AVEC L'APPELANT ───────────────────────────────────────────
// Ce composant **rend** un plan. Il n'en déclenche aucun: pas de bouton de
// régénération, pas de fenêtre de courses, pas de grille de créneaux. Tout ce
// qui AGIT reste chez l'appelant, parce que le brouillon et le plan adopté
// n'agissent pas pareil — l'un se retravaille, l'autre se consomme.
//
// ── CE QUI N'ARRIVERA JAMAIS ICI ───────────────────────────────────────────
// La doctrine ne s'affiche pas. C'est la règle de cet écran, écrite en tête de
// `MealBuilder`: les convictions du coach ENTRENT dans la composition et n'en
// RESSORTENT pas. Trois niveaux d'affichage sont trois occasions de l'oublier,
// et `GeneratedDish.honours_belief_keys` n'est même pas recopié par le client.
//
// Rien ne se coche non plus, sauf la case d'aujourd'hui que l'appelant fournit:
// il n'y a rien à TERMINER, personne n'a rien prescrit.

export interface PlanResultProps {
  dishes: readonly GeneratedDish[];
  preparations: readonly MealPreparation[];
  cookingSessions: readonly CookingSession[];
  /** Le premier jour de la fenêtre, en date locale. */
  startsOn: string;
  durationDays: number;
  /** Aujourd'hui, dans l'horloge du navigateur. */
  today: string;
  /**
   * CE QU'ON DIT QUAND IL N'Y A RIEN — un texte de l'APPELANT, pas du rendu.
   *
   * L'écran du plan dit « dis-moi par où commencer ci-dessus »; une pop-up qui
   * n'a pas de formulaire au-dessus ne peut pas dire ça. Un texte partagé serait
   * faux pour l'un des deux, et c'est le genre de phrase qu'on ne relit jamais.
   */
  emptyLabel: string;
  /**
   * LA COCHE D'UN PLAT, quand l'appelant en fournit une.
   *
   * `undefined` = aucune case, et c'est le cas du brouillon: on ne rapporte pas
   * avoir mangé un plat qui n'existe pas encore. La règle de QUI est cochable
   * (aujourd'hui et le passé, jamais l'avenir) vit dans `useMealTicks`, pas ici.
   */
  tick?: (dish: GeneratedDish, date: string | null) => DishTick | null;
}

export default function PlanResult(props: PlanResultProps) {
  const dayDates = windowDates(props.startsOn, props.durationDays);
  // L'ordre du PLAN, pas celui du calendrier (FF-053 R1).
  const groups = groupByDay(
    props.dishes,
    windowDayOrder(props.startsOn, props.durationDays),
  );

  if (groups.length === 0) {
    return (
      <Card tone="dashed">
        <p className="text-sm text-gray-500">{props.emptyLabel}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        // LA DATE DE CE GROUPE. C'est le groupe qui porte le jour où le plat se
        // MANGE — un plat en lot est déjà placé sur chacun des siens — donc
        // c'est lui qui tranche, jamais `dish.day` qui ne nomme que la cuisson.
        const date = dishDate(group.day, dayDates, props.today);
        return (
          <div key={group.day ?? "undated"}>
            {group.day && (
              <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-gray-900">
                {dishDayLabel(group.day)}
                {/* OÙ ON EN EST DANS LE PLAN. Sans repère, une semaine qui
                    commence mercredi se lit comme une semaine en retard: on ne
                    sait pas si le premier jour affiché est passé, courant ou à
                    venir. */}
                {date === props.today && (
                  <span className="text-[11px] font-normal uppercase tracking-wide text-emerald-700">
                    {mealCopy("meals.result.today")}
                  </span>
                )}
                {date !== null && date < props.today && (
                  <span className="text-[11px] font-normal uppercase tracking-wide text-gray-400">
                    {mealCopy("meals.result.past")}
                  </span>
                )}
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
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
