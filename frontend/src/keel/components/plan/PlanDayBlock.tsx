import React from "react";

import type {
  CookingSession,
  GeneratedDish,
  MealPreparation,
  ShoppingItem,
} from "../../api/mealGeneration";
import type { DayEnergyView, DishEnergyView } from "../../api/mealEnergy";
import type { WaveAssignment } from "../../api/groceryWaves";
import { aisleLabel, dishDayLabel, dishSlotLabel, mealCopy } from "../../api/mealLabels";
import { DayEnergyLine } from "./EnergyReadout";
import { sessionForDish } from "../../lib/dishSession";
import { groupByAisle } from "../../lib/mealBuilderModel";
import { type DayMoment } from "../../lib/planDayView";
import DishCard from "../DishCard";
import { Card } from "../ui/Card";
import { type DishTick } from "../../lib/useMealTicks";

// LOT 1 — LE BLOC D'UN JOUR. Extrait de `PlanResult` pour être RENDU DEUX FOIS
// par le même parent: dans la vue « toute la semaine » et dans la vue « un
// jour ». Deux corps de jour écrits séparément divergeraient au premier
// correctif — c'est l'argument exact qui a sorti `PlanResult` de `MealBuilder`.
//
// ── UN JOUR PORTE TOUT CE QUI LUI ARRIVE ───────────────────────────────────
// La session de cuisine qui tombe ce jour-là, la vague de courses qui tombe ce
// jour-là, puis les plats. Rien de neuf n'est calculé: la session est déjà
// dans `cookingSessions` (elle n'était lue que par `sessionForDish`), la vague
// vient de `planGroceryWaves` (module serveur réexporté, résolue par le
// parent), le motif d'une case vide vient de la grille déjà construite.
// « Tes sessions de cuisine » et la liste de courses complète RESTENT — ce
// bloc est leur déclinaison au jour, pas leur remplaçant.
//
// ── LA FRONTIÈRE AVEC LE PARENT ────────────────────────────────────────────
// Ce bloc REND un jour; il ne résout aucune fenêtre. La date de son groupe, la
// jointure jeton→date (`windowDates`) et la sélection du jour vivent chez
// l'appelant: une seconde résolution ici serait la « seconde liste de jours »
// que le lot interdit (deux dérivations du même plan divergent).
//
// ── CE QUI N'ARRIVERA JAMAIS ICI ───────────────────────────────────────────
// Les mêmes interdits que `PlanResult`: pas de doctrine, pas de coche inventée,
// et AUCUNE durée de session sur la carte d'un PLAT (`active_minutes` /
// `total_minutes` appartiennent aux préparations et aux sessions — les
// recopier sous un plat donnerait à un assemblage le temps d'une cuisson).
// La durée qui s'affiche ici est celle de la CARTE DE SESSION, sa surface
// légitime — jamais celle d'un plat.

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
  /**
   * LA VAGUE DE COURSES QUI TOMBE CE JOUR — résolue par le parent
   * (`waveForDate`, jointure par DATE via `windowDates`). `null` = rien à
   * acheter ce jour-là, et le bloc se tait.
   */
  wave: WaveAssignment | null;
  /** La liste entière — la vague la désigne par INDEX, jamais par terme. */
  shoppingList: readonly ShoppingItem[];
  /**
   * LES MOMENTS DU JOUR, lus dans la grille (`dayMoments`). `[]` = on ne dit
   * rien — c'est le choix du parent: en vue semaine, la grille au-dessus porte
   * déjà ces silences, et les répéter sous sept jours ferait vingt lignes de
   * bruit. En vue jour, ils sont le détail qu'on est venu lire.
   */
  moments: readonly DayMoment[];
  tick?: (dish: GeneratedDish, date: string | null) => DishTick | null;
  energy?: (dish: GeneratedDish) => DishEnergyView | null;
  dayEnergy?: (day: string | null) => DayEnergyView | null;
}

export default function PlanDayBlock(props: PlanDayBlockProps) {
  const { group, date } = props;
  // LA SESSION DU JOUR. La donnée arrive déjà ici (elle n'était lue que par
  // `sessionForDish`); un jour sans session rend simplement rien. `group.day`
  // et `session.day` sont tous deux des JETONS — aucune conversion, donc
  // aucune divergence possible.
  const sessions = props.cookingSessions.filter((s) => s.day === group.day);
  // LES SILENCES DU JOUR — tout moment dont la case n'est pas un plat. Les
  // plats, eux, sont déjà les cartes dessous: les redire ici les doublerait.
  const silences = props.moments.filter((m) => m.cell.kind !== "dish");
  const quiet = group.dishes.length === 0 && sessions.length === 0 &&
    props.wave === null && silences.length === 0;
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
        {/* ── LA SESSION DE CUISINE DU JOUR, EN TÊTE ─────────────────────────
            C'est la première chose qu'on fait ce jour-là — avant de manger, on
            cuisine. Carte compacte, dépliable vers le déroulé; la fenêtre
            « tes sessions de cuisine » reste la vue d'ensemble. */}
        {sessions.map((session, index) => (
          <DaySessionCard
            key={`${session.day}-${index}`}
            session={session}
            preparations={props.preparations}
          />
        ))}
        {/* ── LES COURSES DU JOUR ────────────────────────────────────────────
            La vague qui TOMBE ce jour-là, dépliable vers sa liste par rayons.
            La fenêtre de courses complète reste — et c'est elle qui porte les
            ratures: en tenir un second jeu ici ferait deux mémoires pour la
            même liste, et c'est celle qu'on ne regarde pas qui gagnerait. */}
        {props.wave && props.wave.indices.length > 0 && (
          <DayGroceriesCard wave={props.wave} shoppingList={props.shoppingList} />
        )}
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
        {/* ── LES MOMENTS SANS PLAT, ET LEUR MOTIF ───────────────────────────
            Les trois silences voulus se ressemblent entre eux (« rien ici, et
            c'est normal ») et ne ressemblent PAS au quatrième — même règle et
            mêmes textes que la grille, dont ces lignes sont la lecture. */}
        {silences.length > 0 && (
          <ul className="flex flex-col gap-1">
            {silences.map(({ slot, cell }) => (
              <li key={slot} className="text-xs text-ink-soft">
                <span className="font-medium">{dishSlotLabel(slot) ?? slot}</span>
                {" — "}
                {cell.kind === "away" && (
                  <span className="italic">{mealCopy("meals.grid.away")}</span>
                )}
                {cell.kind === "fixed_intake" && (
                  <span className="italic">{cell.label}</span>
                )}
                {cell.kind === "leftovers" && (
                  <span className="italic">{mealCopy("meals.grid.leftovers")}</span>
                )}
                {/* LE SEUL QUI SOIT UN DÉFAUT — il ne doit ressembler à aucun
                    des trois autres. Même ambre que la grille. */}
                {cell.kind === "empty" && (
                  <span
                    className="text-amber-700"
                    title={mealCopy("meals.grid.empty_hint")}
                  >
                    {mealCopy("meals.grid.empty")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* UN JOUR OÙ IL N'Y A VRAIMENT RIEN LE DIT — sans rythme déclaré, la
            grille ne sait rien motiver, et un bloc muet sous un titre de jour
            se lirait comme une panne. */}
        {quiet && (
          <p className="text-sm text-ink-soft">
            {mealCopy("meals.result.day_nothing")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * LA CARTE DE SESSION DU JOUR — compacte, dépliable vers le déroulé.
 *
 * ⚠️ COMPOSANT À PART, ET PAS UN `useState` DANS LE BLOC (patron
 * `SessionLink`): l'état d'ouverture n'existe que là où il y a quelque chose à
 * ouvrir.
 *
 * LA DURÉE AFFICHÉE EST CELLE DE LA SESSION, SUR LA CARTE DE LA SESSION — sa
 * surface légitime, comme dans « tes sessions de cuisine ». Elle ne descend
 * jamais sur la carte d'un plat.
 */
function DaySessionCard(props: {
  session: CookingSession;
  preparations: readonly MealPreparation[];
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const { session } = props;
  // LES `id` INCONNUS SONT ÉCARTÉS, PAS RENDUS TELS QUELS — même règle que
  // `sessionForDish`: un slug de lot ne veut rien dire à table.
  const titles = session.preparation_ids
    .map((id) => props.preparations.find((p) => p.id === id)?.title ?? "")
    .filter((title) => title !== "");
  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-semibold text-ink">
          {mealCopy("meals.result.day_session")}
        </p>
        {session.total_minutes !== null && (
          <span className="text-xs font-normal tabular-nums text-ink-soft">
            {mealCopy("meals.sessions.session_time").replace(
              "{n}",
              String(session.total_minutes),
            )}
          </span>
        )}
        {session.run_through && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            // L'idiome du kit pour déplier (patron `CookingSessions`): le
            // soulignement porte l'affordance, la teinte ne la porte pas.
            // `min-h-6` = plancher tactile de 24 px.
            className="ml-auto min-h-6 shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            {mealCopy(
              open
                ? "meals.result.day_session_hide"
                : "meals.result.day_session_show",
            )}
          </button>
        )}
      </div>
      {/* CE QU'ON Y CUIT, toujours visible: c'est ce qui dit pourquoi ce jour
          compte. Muet quand la session ne nomme aucune préparation connue. */}
      {titles.length > 0 && (
        <p className="mt-1 text-sm text-ink-soft">{titles.join(" · ")}</p>
      )}
      {open && session.run_through && (
        <p id={panelId} className="mt-2 text-sm leading-6 text-ink">
          {session.run_through}
        </p>
      )}
    </Card>
  );
}

/**
 * LES COURSES DU JOUR — le compte, dépliable vers la liste de LA vague, par
 * rayons (même découpe que la fenêtre de courses, même accesseur `groupByAisle`
 * sur les INDEX d'origine).
 *
 * ⛔ AUCUNE CASE À COCHER ICI. Les ratures vivent dans la fenêtre de courses,
 * en mémoire chez elle: un second jeu de coches serait une seconde mémoire
 * pour la même liste, et les deux divergeraient au premier aller-retour.
 */
function DayGroceriesCard(props: {
  wave: WaveAssignment;
  shoppingList: readonly ShoppingItem[];
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const count = props.wave.indices.length;
  const inWave = new Set(props.wave.indices);
  const groups = groupByAisle(props.shoppingList)
    .map((g) => ({
      aisle: g.aisle,
      items: g.items.filter((entry) => inWave.has(entry.index)),
    }))
    .filter((g) => g.items.length > 0);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-semibold text-ink">
          {count === 1
            ? mealCopy("meals.result.day_groceries_one")
            : mealCopy("meals.result.day_groceries_many", { n: count })}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto min-h-6 shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {mealCopy(
            open
              ? "meals.result.day_groceries_hide"
              : "meals.result.day_groceries_show",
          )}
        </button>
      </div>
      {open && (
        <div id={panelId} className="mt-2">
          {groups.map((g) => (
            <div key={g.aisle} className="mt-2 first:mt-0">
              {/* Le cran d'étiquette de la charte, comme la fenêtre de
                  courses — même rayon, même mot, même forme. */}
              <h4 className="text-label font-semibold uppercase text-ink-soft">
                {aisleLabel(g.aisle)}
              </h4>
              <ul className="mt-1 flex flex-col gap-0.5">
                {g.items.map(({ item, index }) => (
                  <li
                    key={`${item.term}-${index}`}
                    className="flex flex-wrap items-baseline gap-2 text-sm text-ink"
                  >
                    <span className="break-words">{item.term}</span>
                    {item.quantity && (
                      <span className="text-ink-soft">{item.quantity}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
