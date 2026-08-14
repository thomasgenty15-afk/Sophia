import React from "react";

import type {
  AwayDay,
  CookingSession,
  EatingOccasionSlot,
  GeneratedDish,
  MealPreparation,
  PlanDayProperty,
  PlanFixedIntake,
} from "../../api/mealGeneration";
import type { DayEnergyView, DishEnergyView } from "../../api/mealEnergy";
import { dishDayLabel, mealCopy } from "../../api/mealLabels";
import { DayEnergyLine, EnergyBasisNote } from "./EnergyReadout";
import { groupByDay } from "../../lib/mealBuilderModel";
import { dishDate } from "../../api/mealStretch";
import { windowDates, windowDayOrder } from "../../api/mealWindow";
import DishCard from "../DishCard";
import PlanGrid from "./PlanGrid";
import { buildPlanGrid } from "../../lib/planGridModel";
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
   * LES LIGNES DE LA GRILLE — les moments d'une journée normale.
   *
   * Vide = pas de grille. On ne devine pas un rythme: une grille à six lignes
   * fixes ferait relire chaque semaine des moments que l'élève a déjà dit ne
   * pas prendre.
   */
  rhythm?: readonly EatingOccasionSlot[];
  /**
   * CE QUI EXPLIQUE UNE CASE VIDE (FF-053 R3).
   *
   * Les trois viennent de la RÉPONSE de la fonction, jamais d'une relecture de
   * `practical_constraints` par l'écran: elle seule sait ce qu'elle a réellement
   * lu, entrées malformées écartées.
   */
  awayDays?: readonly AwayDay[];
  fixedIntakes?: readonly PlanFixedIntake[];
  dayProperties?: readonly PlanDayProperty[];
  /**
   * LA COCHE D'UN PLAT, quand l'appelant en fournit une.
   *
   * `undefined` = aucune case, et c'est le cas du brouillon: on ne rapporte pas
   * avoir mangé un plat qui n'existe pas encore. La règle de QUI est cochable
   * (aujourd'hui et le passé, jamais l'avenir) vit dans `useMealTicks`, pas ici.
   */
  tick?: (dish: GeneratedDish, date: string | null) => DishTick | null;
  /**
   * FF-059 — L'ÉNERGIE D'UN PLAT, quand les quatre portes sont ouvertes.
   *
   * MÊME FORME QUE `tick`, et pour la même raison: ce composant ne sait pas
   * QUI regarde. La chaîne de gardes est décidée par `meal-energy-v1`, côté
   * serveur; quand elle ferme, l'appelant n'a rien à passer et ces deux
   * fonctions restent `undefined`. Il n'y a donc aucun droit à tester ici — et
   * donc aucun droit à oublier de tester.
   */
  energy?: (dish: GeneratedDish) => DishEnergyView | null;
  /** Le total d'un jour. `null` = pas de chiffre pour ce jour. */
  dayEnergy?: (day: string | null) => DayEnergyView | null;
}

export default function PlanResult(props: PlanResultProps) {
  const dayDates = windowDates(props.startsOn, props.durationDays);
  // L'ordre du PLAN, pas celui du calendrier (FF-053 R1).
  const groups = groupByDay(
    props.dishes,
    windowDayOrder(props.startsOn, props.durationDays),
  );

  // LA GRILLE, sur la MÊME donnée que les sections: elle lit `groups`, donc
  // l'expansion des lots par jour est déjà faite et les deux ne peuvent pas se
  // contredire. Deux dérivations du même plan finiraient par diverger.
  const grid = buildPlanGrid({
    days: windowDayOrder(props.startsOn, props.durationDays),
    rhythm: props.rhythm ?? [],
    groups,
    awayDays: props.awayDays ?? [],
    fixedIntakes: props.fixedIntakes ?? [],
    dayProperties: props.dayProperties ?? [],
  });

  if (groups.length === 0) {
    return (
      <Card tone="dashed">
        <p className="text-sm text-ink-soft">{props.emptyLabel}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* NIVEAU 1 — la semaine d'un coup d'œil. */}
      <PlanGrid
        grid={grid}
        // `windowDates` est une TABLE jeton→date, pas une liste: on la lit dans
        // l'ordre des colonnes pour que les deux ne puissent pas se décaler.
        dates={grid.days.map((d) => dayDates[d] ?? "")}
        today={props.today}
      />
      {/* ── LE NIVEAU 2 EST PARTI LE 2026-08-14 ─────────────────────────────
          `KitchenBlock` (« ce que tu cuisines ») listait les préparations et
          les jours qu'elles nourrissent. « Tes sessions de cuisine » porte la
          même information PLUS le temps de session, les portions faites et le
          travail actif — deux blocs pour une chose, dont le plus pauvre était
          celui qu'on lisait en premier.
          La seule ligne qu'il portait seul — les jours qu'une casserole
          nourrit — a été portée dans la fenêtre des sessions AVANT ce retrait,
          et pas après: elle y était impossible (aucun plat n'y arrivait). */}
      {/* NIVEAU 2 — le détail, jour par jour. */}
      {groups.map((group) => {
        // LA DATE DE CE GROUPE. C'est le groupe qui porte le jour où le plat se
        // MANGE — un plat en lot est déjà placé sur chacun des siens — donc
        // c'est lui qui tranche, jamais `dish.day` qui ne nomme que la cuisson.
        const date = dishDate(group.day, dayDates, props.today);
        return (
          <div key={group.day ?? "undated"}>
            {group.day && (
              <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
                {dishDayLabel(group.day)}
                {/* OÙ ON EN EST DANS LE PLAN. Sans repère, une semaine qui
                    commence mercredi se lit comme une semaine en retard: on ne
                    sait pas si le premier jour affiché est passé, courant ou à
                    venir. */}
                {/* ⛔ « AUJOURD'HUI » EST UNE POSITION, PAS UN ÉTAT. L'émeraude
                    était ici un faux état: dans tout le produit elle dit « ok »,
                    et un jour n'est ni réussi ni raté. Elle volait en plus la
                    teinte de l'accusé d'enregistrement, qui vit à quelques
                    lignes. Le repère passe donc à la forme — le cran
                    `text-label` de la charte, en encre pleine, contre l'encre
                    secondaire du jour passé juste en dessous. */}
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
                />
              ))}
            </div>
          </div>
        );
      })}
      {/* D'OÙ VIENT LE CHIFFRE — une fois, en bas, et seulement s'il y en a un.
          Sans cette ligne, rien ne distingue à l'écran ce CALCUL d'une
          estimation par photo, que le produit refuse précisément d'afficher
          (−26,6 % de biais, systématique). */}
      {props.energy && <EnergyBasisNote />}
    </div>
  );
}
