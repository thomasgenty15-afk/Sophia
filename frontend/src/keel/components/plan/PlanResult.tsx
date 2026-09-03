import React from "react";

import type {
  AwayDay,
  CookingSession,
  EatingOccasionSlot,
  GeneratedDish,
  MealPreparation,
  MemberPortionView,
  PlanDayProperty,
  PlanTimingView,
  PlanFixedIntake,
  ShoppingItem,
} from "../../api/mealGeneration";
import type { DayEnergyView, DishEnergyView } from "../../api/mealEnergy";
import { waveAssignments } from "../../api/groceryWaves";
import { dishDayLabel, mealCopy } from "../../api/mealLabels";
import { EnergyBasisNote } from "./EnergyReadout";
import { groupByDay, withDaysThatCarry } from "../../lib/mealBuilderModel";
import {
  type DaySelection,
  dayMoments,
  defaultSelectedDay,
  effectiveSelectedDay,
  waveForDate,
} from "../../lib/planDayView";
import { dishDate } from "../../api/mealStretch";
import { dayTokenOf } from "../../api/dates";
import { windowDates, windowDayOrder } from "../../api/mealWindow";
import PlanDayBlock from "./PlanDayBlock";
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
  /**
   * LOT 1 — LA LISTE DE COURSES DU PLAN. Elle sert UNE chose ici: dire à
   * chaque jour la vague qui tombe chez lui. REQUISE, pas optionnelle: les
   * deux appelants l'ont déjà, et un `?` ferait du bloc courses une prop morte
   * chez celui qui oublie — l'aperçu et le validé doivent rendre le même corps.
   */
  shoppingList: readonly ShoppingItem[];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT 3 — LES PARTS PAR BOUCHE DE **CE** PLAN (`member_portions`).
   * ══════════════════════════════════════════════════════════════════════
   *
   * Elles servent DEUX choses, et une seule prop les porte parce qu'elles
   * viennent de la même ligne: le PRÉNOM d'une bouche à qui un plat est dédié
   * (`display_name`, recopié de la ligne membre par le moteur — F5), et sa
   * PART sous un plat commun (`preparation_shares`).
   *
   * REQUISE, pas optionnelle: les deux appelants les ont, et un `?` ferait de
   * la séparation par personne une prop morte chez celui qui oublie — le jour
   * se lirait exactement comme avant ce lot, sans un seul rouge. C'est la
   * cicatrice `shoppingList` du LOT 1, une prop plus loin.
   *
   * ⛔ QUI A LE DROIT DE LES VOIR — ET LA GARDE EST STRUCTURELLE AVANT D'ÊTRE
   * ÉCRITE. `member_portions` n'existe que sur un plan de FOYER: la lane
   * individuelle (`generate-meal-v1`) n'en écrit aucune. Et un plan de foyer
   * n'est chargé, sur les deux surfaces qui montent ce rendu, que par son
   * MAÎTRE — `loadMealPlans` filtre `user_id`, et un secondaire n'a que ses
   * propres lignes. `MyShareCard` reste donc la seule « part d'un autre »
   * qu'un secondaire puisse lire, et cette vue ne la contourne pas. Le
   * plancher de deux bouches, lui, est dans `groupDayBySlot`.
   */
  portions: readonly MemberPortionView[];
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A1 (2026-09-03) — QUAND LA CUISINE A LIEU, DIT PAR LE SERVEUR.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ⛔ RENDU EN TÊTE, DONC SUR LES DEUX SURFACES (C6/FF-053 C8): l'aperçu et
   * le plan validé montent ce MÊME composant, et la fenêtre qui a reculé d'un
   * jour est le fait le plus visible d'un plan — le taire à l'aperçu ferait
   * croire à une date perdue au moment précis où la personne décide.
   *
   * `undefined`/`null` = le serveur ne l'a pas dit (ligne d'avant ce lot):
   * aucune carte, exactement comme hier.
   *
   * ⚠️ L'ÉCRAN NE LE RECALCULE PAS. Le verdict a besoin de l'heure dans le
   * fuseau de la personne; le navigateur ne l'a pas.
   */
  timing?: PlanTimingView | null;
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
  /**
   * LOT 1 — LA VUE À L'OUVERTURE. `"day"` (le défaut) ouvre sur le jour
   * d'aujourd'hui — sur un brouillon, `today = startsOn`, donc sur son premier
   * jour. `"week"` ouvre la semaine entière: c'est l'aperçu, qu'on juge en
   * entier avant de l'adopter. UNE prop, pas un second rendu.
   */
  defaultView?: "week" | "day";
}

export default function PlanResult(props: PlanResultProps) {
  const dayDates = windowDates(props.startsOn, props.durationDays);
  const dayOrder = windowDayOrder(props.startsOn, props.durationDays);
  // L'ordre du PLAN, pas celui du calendrier (FF-053 R1).
  const groups = groupByDay(props.dishes, dayOrder);

  // ── LOT 1 · QUEL JOUR ON LIT ──────────────────────────────────────────────
  // L'état est le JETON choisi (ou « all »); ce qui se REND passe par
  // `effectiveSelectedDay`: l'onglet « courant » → « suivant » garde ce
  // composant monté, et un jeton hors de la nouvelle fenêtre retomberait sur
  // un écran vide. La liste des jours reste `dayOrder` — aucune seconde
  // dérivation.
  const [selectedDay, setSelectedDay] = React.useState<DaySelection>(() =>
    defaultSelectedDay({
      view: props.defaultView ?? "day",
      order: dayOrder,
      dates: dayDates,
      today: props.today,
    })
  );
  const shown = effectiveSelectedDay({
    selected: selectedDay,
    order: dayOrder,
    dates: dayDates,
    today: props.today,
  });

  // LA GRILLE, sur la MÊME donnée que les sections: elle lit `groups`, donc
  // l'expansion des lots par jour est déjà faite et les deux ne peuvent pas se
  // contredire. Deux dérivations du même plan finiraient par diverger.
  const grid = buildPlanGrid({
    days: dayOrder,
    rhythm: props.rhythm ?? [],
    groups,
    awayDays: props.awayDays ?? [],
    fixedIntakes: props.fixedIntakes ?? [],
    dayProperties: props.dayProperties ?? [],
  });

  // LES VAGUES D'ACHAT — le module serveur réexporté (`api/groceryWaves`),
  // JAMAIS un calcul maison: y remettre une règle recréerait le jumeau
  // supprimé le 2026-08-10. Elles sont indexées par DATE; la jointure vers un
  // jour passe par `windowDates` (jeton → date), dans `waveForDate`.
  const waves = waveAssignments({
    startsOn: props.startsOn,
    durationDays: props.durationDays,
    shoppingList: props.shoppingList,
    preparations: props.preparations,
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * D3 — LA SEMAINE MONTRE AUSSI LES JOURS QUI NE PORTENT PAS DE REPAS.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `groupByDay` saute un jour sans plat, donc la vue SEMAINE ne rendait aucun
   * bloc pour lui — et avec lui disparaissaient SA SESSION DE CUISINE et SA
   * VAGUE DE COURSES. Le dimanche de grosse cuisson, celui qui remplit le
   * frigo de toute la semaine mais dont aucun repas n'est à lui, était
   * invisible sur l'écran qu'on ouvre pour savoir quoi faire.
   *
   * ⚠️ LA JOINTURE DE LA VAGUE EST CELLE DU RENDU, PAS UNE SECONDE. Même
   * `waveForDate` sur les mêmes `dayDates` que la prop `wave` du bloc jour
   * douze lignes plus bas, et même condition `indices.length > 0` que le rendu
   * de `PlanDayBlock`. Sans elle, un jour ouvert sur une vague sans article
   * rendrait un titre suivi de RIEN: `PlanDayBlock.quiet` teste
   * `wave === null`, donc la vague vide lui interdit même sa phrase de repli.
   *
   * ⚠️ CE TERME EST UN MIROIR, PAS UNE GARDE MESURÉE — dit franchement. Aucune
   * fixture ne sépare aujourd'hui les deux conditions: `waveAssignments` ne
   * construit ses vagues que depuis des seaux NON VIDES, et retrouve les index
   * par identité d'objet dans la liste même qui les a produits — une vague à
   * zéro index n'est donc pas atteignable, et sa mutation ne mord sur aucun
   * test. Il est gardé parce que c'est le rendu d'en face qui décide, pas
   * parce qu'un rouge le tient.
   */
  const carrying = withDaysThatCarry({
    groups,
    order: dayOrder,
    sessionDays: props.cookingSessions.map((s) => s.day),
    groceryDays: dayOrder.filter((day) => {
      const wave = waveForDate(waves, dayDates[day] ?? null);
      return wave !== null && wave.indices.length > 0;
    }),
  });

  // ⚠️ LE VIDE SE MESURE SUR `carrying`, PAS SUR `groups`. Un plan sans un seul
  // plat mais qui porte une session est un plan qui a quelque chose à dire.
  if (carrying.length === 0) {
    return (
      <Card tone="dashed">
        <p className="text-sm text-ink-soft">{props.emptyLabel}</p>
      </Card>
    );
  }

  // ── LOT 1 · CE QUE LA VUE JOUR REND ───────────────────────────────────────
  // Le groupe SANS jour n'est jamais perdu: il vaut pour la fenêtre entière,
  // donc il se rend dans les deux vues — le filtrer sur un jour le ferait
  // disparaître d'un plan qui le contient.
  const undated = groups.find((g) => g.day === null) ?? null;
  const shownGroups = shown === "all" ? carrying : [
    ...(undated ? [undated] : []),
    // Le jour choisi, MÊME sans plat: il peut porter une session, des courses
    // et des moments déclarés — un jour qui disparaît parce qu'il n'a pas de
    // plat se lirait comme un plan troué.
    { day: shown, dishes: groups.find((g) => g.day === shown)?.dishes ?? [] },
  ];

  // ── A1 · LA PHRASE DU TIMING, EN TÊTE ────────────────────────────────────
  // `dishDayLabel(dayTokenOf(leadDay))` et pas une date formatée: tout le reste
  // de ce rendu parle en jours de la semaine, et `toLocaleDateString` n'est pas
  // utilisé ici (voir `HouseholdMergeCard`, laissé exprès). Un jour de veille
  // sans jeton lisible retombe sur la phrase sans jour — jamais sur une date
  // brute au milieu d'une phrase.
  const timing = props.timing ?? null;
  const timingLine = timing === null ? null : timing.kind === "day_before"
    ? (() => {
      const label = timing.leadDay === null
        ? null
        : dishDayLabel(dayTokenOf(timing.leadDay));
      return label === null
        ? mealCopy("meals.timing.same_morning")
        : mealCopy("meals.timing.day_before", { day: label });
    })()
    : mealCopy("meals.timing.same_morning");

  return (
    <div className="space-y-6">
      {timingLine === null ? null : (
        <Card>
          <p className="break-words text-sm text-ink">{timingLine}</p>
        </Card>
      )}
      {/* NIVEAU 1 — la semaine d'un coup d'œil, et le SÉLECTEUR naturel de la
          vue jour: cliquer une colonne filtre le détail dessous. */}
      <PlanGrid
        grid={grid}
        // `windowDates` est une TABLE jeton→date, pas une liste: on la lit dans
        // l'ordre des colonnes pour que les deux ne puissent pas se décaler.
        dates={grid.days.map((d) => dayDates[d] ?? "")}
        today={props.today}
        onSelectDay={(day) => setSelectedDay(day)}
      />
      {/* ── LOT 1 · LE RAIL DES JOURS ──────────────────────────────────────
          Un bouton par jour de la fenêtre + « toute la semaine ». Le patron
          est le contrôle segmenté de `PlanByPerson` (deux `Button`
          `aria-pressed`, pas de primitive `Tabs`). Il défile DANS son
          conteneur: la contrainte qui gouverne est 320 px, et un rail qui
          déborde emporterait la page entière.
          ⛔ « AUJOURD'HUI » SE DIT PAR LA FORME (encre pleine + graisse),
          jamais par une couleur — même arbitrage que `PlanGrid`. */}
      <div className="overflow-x-auto">
        <div
          className="flex w-max gap-2"
          role="group"
          aria-label={mealCopy("meals.result.day_rail")}
        >
          <button
            type="button"
            aria-pressed={shown === "all"}
            onClick={() => setSelectedDay("all")}
            className={`min-h-6 rounded-part border px-2.5 py-0.5 text-xs ${
              shown === "all"
                ? "border-line-strong bg-fig-50 font-semibold text-ink"
                : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50"
            }`}
          >
            {mealCopy("meals.result.day_all")}
          </button>
          {dayOrder.map((day) => {
            const isToday = dayDates[day] === props.today;
            const on = shown === day;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedDay(day)}
                className={`min-h-6 rounded-part border px-2.5 py-0.5 text-left text-xs ${
                  on
                    ? "border-line-strong bg-fig-50 font-semibold text-ink"
                    : `border-line-strong bg-paper hover:bg-fig-50 ${
                      isToday ? "font-semibold text-ink" : "text-ink-soft"
                    }`
                }`}
              >
                {/* Le même contenu que les `<th>` de la grille: jour abrégé,
                    puis quantième — deux libellés pour un même jour
                    divergeraient. */}
                <span className="block">
                  {(dishDayLabel(day) ?? day).slice(0, 3)}
                </span>
                <span className="block font-normal text-ink-soft">
                  {dayDates[day]?.slice(8) ?? ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* ── LE NIVEAU 2 EST PARTI LE 2026-08-14 ─────────────────────────────
          `KitchenBlock` (« ce que tu cuisines ») listait les préparations et
          les jours qu'elles nourrissent. « Tes sessions de cuisine » porte la
          même information PLUS le temps de session, les portions faites et le
          travail actif — deux blocs pour une chose, dont le plus pauvre était
          celui qu'on lisait en premier.
          La seule ligne qu'il portait seul — les jours qu'une casserole
          nourrit — a été portée dans la fenêtre des sessions AVANT ce retrait,
          et pas après: elle y était impossible (aucun plat n'y arrivait). */}
      {/* NIVEAU 2 — le détail, jour par jour. LE BLOC EST EXTRAIT
          (`PlanDayBlock`) pour être rendu deux fois par ce même parent — la
          semaine entière, ou un seul jour — sans que les deux corps puissent
          diverger. La prop `cookingSessions` continue d'y descendre: elle a
          déjà été une prop morte une fois, et un test le verrouille. */}
      {shownGroups.map((group) => (
        <PlanDayBlock
          key={group.day ?? "undated"}
          group={group}
          // LA DATE DE CE GROUPE. C'est le groupe qui porte le jour où le plat
          // se MANGE — un plat en lot est déjà placé sur chacun des siens —
          // donc c'est lui qui tranche, jamais `dish.day` qui ne nomme que la
          // cuisson.
          date={dishDate(group.day, dayDates, props.today)}
          today={props.today}
          preparations={props.preparations}
          // ⛔ LES PLATS DU PLAN ENTIER, EN PLUS DE CEUX DU GROUPE, ET IL LE
          // FAUT. La carte de session liste les CONTENANTS qu'elle doit
          // remplir, et une session du dimanche nourrit des repas du mardi:
          // `group.dishes` ne contient que le jour rendu, donc elle n'y
          // trouverait qu'une partie de ce qu'elle a à peser.
          allDishes={props.dishes}
          cookingSessions={props.cookingSessions}
          // LA VAGUE DU JOUR — jointure par DATE, via `windowDates` et rien
          // d'autre. `dayDates[group.day]` et pas `dishDate(...)`: le repli
          // d'un groupe sans jour est « aujourd'hui », et une vague qui
          // tomberait aujourd'hui s'accrocherait au bloc sans jour.
          wave={group.day ? waveForDate(waves, dayDates[group.day] ?? null) : null}
          shoppingList={props.shoppingList}
          // LES MOTIFS DES MOMENTS VIDES, en vue JOUR seulement: en semaine,
          // la grille au-dessus porte déjà ces silences case par case, et les
          // répéter sous chaque jour ferait vingt lignes de bruit.
          moments={shown === "all" ? [] : dayMoments(grid, group.day)}
          // LOT 3 — LES PARTS DU PLAN RENDU, telles quelles. Le bloc jour ne
          // va PAS les chercher: elles arrivent avec le plan, sur la même
          // ligne que ses plats, donc elles ne peuvent pas être celles d'un
          // autre plan que celui qu'on regarde.
          portions={props.portions}
          tick={props.tick}
          energy={props.energy}
          dayEnergy={props.dayEnergy}
        />
      ))}
      {/* D'OÙ VIENT LE CHIFFRE — une fois, en bas, et seulement s'il y en a un.
          Sans cette ligne, rien ne distingue à l'écran ce CALCUL d'une
          estimation par photo, que le produit refuse précisément d'afficher
          (−26,6 % de biais, systématique). */}
      {props.energy && <EnergyBasisNote />}
    </div>
  );
}
