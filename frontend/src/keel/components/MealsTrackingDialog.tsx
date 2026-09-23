import React from "react";

import { dishSlotLabel, mealCopy } from "../api/mealLabels";
import {
  loadWeekMeals,
  weekMealDate,
  type WeekMealDish,
  type WeekMealsView,
} from "../api/weekMeals";
import { formatWeekday } from "../i18n/format";
import { t } from "../i18n/t";
import { browserLocalDate, type DishTick, useMealTicks } from "../lib/useMealTicks";
import { UntickForm } from "./DishCard";
import { Button, ButtonLink } from "./ui/Button";
import Modal from "./ui/Modal";

// ⟳ 2026-09-23 — « SUIVI DES REPAS », EN FENÊTRE.
//
// Un planning simple de la semaine du plan: les jours en haut, les repas du jour
// choisi en dessous. La consigne tient en une ligne: on COCHE les repas qu'on n'a
// pas mangés, le reste est compté automatiquement (`tracking_v2.ts` présume
// mangé tout repas prévu passé sans « pas mangé »).
//
// ── LES TROIS PORTES ────────────────────────────────────────────────────────
// Elle vit dans `/app/chat`, et elle s'ouvre:
//   · par le « + » du champ de message;
//   · par le « + » de la barre du bas, qui arme l'intention `meals` et vient
//     sur la conversation (`lib/quickAdd.ts`), comme ses trois autres gestes;
//   · par le « Non » de la question du soir, ouverte sur CE jour-là.
//
// ⛔ AUCUNE ÉCRITURE ICI. La case passe par `useMealTicks`, la liaison unique de
// toutes les surfaces: un second câblage écrirait un fait que les autres ne
// savent pas lire.
//
// ⚠️ UN JOUR À VENIR MONTRE SES CASES, GRISÉES. C'est l'inverse de `/app/plan`
// (qui n'en rend aucune), et c'est voulu: cette fenêtre existe pour que le
// geste se voie. La note dit quand il deviendra possible.

/**
 * Le jour ouvert: celui demandé s'il est dans le plan; sinon aujourd'hui s'il a
 * des repas; sinon le dernier jour passé qui en a; sinon le premier qui en a.
 *
 * Exportée pour `mealsTrackingDialog.int.test.ts`, qui l'importe d'ici. Si
 * elle gagne un second lecteur, sa place est dans `keel/lib/`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function pickInitialDay(
  view: WeekMealsView,
  asked: string | null,
  today: string,
): string {
  const days = view.order.map((token) => view.dates[token]).filter(Boolean);
  if (asked && days.includes(asked)) return asked;
  const withMeals = days.filter((date) =>
    view.dishes.some((dish) => weekMealDate(view, dish.day) === date)
  );
  if (withMeals.includes(today)) return today;
  const past = withMeals.filter((date) => date < today);
  if (past.length > 0) return past[past.length - 1];
  if (withMeals.length > 0) return withMeals[0];
  if (days.includes(today)) return today;
  return days[0] ?? today;
}

function MealRow({
  dish,
  tick,
}: {
  dish: WeekMealDish;
  /** `null` = repas à venir: la case est montrée, grisée. */
  tick: DishTick | null;
}) {
  const id = React.useId();
  const slot = dish.slot ? dishSlotLabel(dish.slot) ?? dish.slot : null;
  const missed = tick?.missed ?? false;
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {/* Cible ≥ 24 px: la case ET son libellé, liés par `htmlFor`. Bordure
            `line-strong` (3,84:1) — un contrôle doit tenir WCAG 1.4.11. */}
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 rounded-part border-line-strong text-ink focus:ring-fig-600 disabled:opacity-40"
          checked={missed}
          disabled={!tick || tick.busy}
          onChange={() => tick?.onToggle()}
        />
        <label htmlFor={id} className="min-w-0 flex-1 break-words">
          {slot && (
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {slot}
            </span>
          )}
          <span className={`block text-sm ${missed ? "text-ink-soft line-through" : "text-ink"}`}>
            {dish.title}
          </span>
        </label>
        {missed && (
          <span className="shrink-0 text-xs font-medium text-ink">
            {mealCopy("meals.tick.label")}
          </span>
        )}
      </div>
      {tick?.untickPrompt ? <UntickForm prompt={tick.untickPrompt} /> : null}
    </li>
  );
}

/** Le contenu, sans le chargement. Exporté pour `mealsTrackingDialog.int.test.ts`. */
export function MealsTrackingBody({
  view,
  userId,
  askedDay,
}: {
  view: WeekMealsView;
  userId: string;
  askedDay: string | null;
}) {
  const today = browserLocalDate();
  const [selected, setSelected] = React.useState(() =>
    pickInitialDay(view, askedDay, today)
  );
  React.useEffect(() => {
    setSelected(pickInitialDay(view, askedDay, browserLocalDate()));
  }, [view, askedDay]);

  // La position est DONNÉE (`bindAt`): la liste est filtrée par jour et par
  // bouche, et `bind` résout par identité d'objet contre un tableau complet.
  const ticks = useMealTicks({ userId, mealId: view.mealId, dishes: [] });

  const dayDishes = view.dishes
    .filter((dish) => weekMealDate(view, dish.day) === selected)
    .sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const future = selected > today;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-ink">{t("meals.week.lead")}</p>

      {/* LES JOURS DU PLAN. `flex-wrap`: à 320 px, sept pastilles tiennent sur
          deux lignes plutôt que de faire défiler la fenêtre de côté. */}
      <div
        role="group"
        aria-label={t("meals.week.days_label")}
        className="flex flex-wrap gap-2"
      >
        {view.order.map((token) => {
          const date = view.dates[token];
          if (!date) return null;
          const active = date === selected;
          return (
            <button
              key={token}
              type="button"
              aria-pressed={active}
              aria-current={date === today ? "date" : undefined}
              onClick={() => setSelected(date)}
              className={[
                "flex min-w-[3.25rem] flex-col items-center rounded-card border px-2 py-1.5 text-xs text-ink transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-fig-600",
                active
                  ? "border-fig-700 bg-fig-100"
                  : "border-line-strong bg-paper hover:bg-fig-50",
              ].join(" ")}
            >
              <span className="font-semibold uppercase">{formatWeekday(date)}</span>
              <span className={date === today ? "font-semibold underline" : ""}>
                {Number(date.slice(8, 10))}
              </span>
            </button>
          );
        })}
      </div>

      {/* ⛔ UN FAIT. Rouge = échec; `red-700` est la valeur du produit. */}
      {ticks.error && (
        <p className="text-sm text-red-700">{mealCopy("meals.tick.failed")}</p>
      )}

      {dayDishes.length > 0
        ? (
          <ul className="divide-y divide-line rounded-card border border-line bg-paper px-3">
            {dayDishes.map((dish) => (
              <MealRow
                key={dish.dishIndex}
                dish={dish}
                tick={ticks.bindAt(
                  { slot: dish.slot, title: dish.title },
                  dish.dishIndex,
                  weekMealDate(view, dish.day),
                )}
              />
            ))}
          </ul>
        )
        : <p className="text-sm text-ink-soft">{t("meals.week.day_empty")}</p>}

      {future && dayDishes.length > 0 && (
        <p className="text-xs leading-5 text-ink-soft">{t("meals.week.future_note")}</p>
      )}
    </div>
  );
}

const SLOT_ORDER = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
];

function slotRank(slot: string | null): number {
  const at = slot ? SLOT_ORDER.indexOf(slot) : -1;
  return at < 0 ? SLOT_ORDER.length : at;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; view: WeekMealsView | null };

export default function MealsTrackingDialog({
  open,
  onClose,
  userId,
  day,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  /** Le jour à ouvrir (le « Non » du soir), ou `null` pour le choix par défaut. */
  day: string | null;
}) {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  const load = React.useCallback(async () => {
    if (!userId) return;
    setState({ kind: "loading" });
    try {
      // ⚠️ LA DATE EST RELUE À CHAQUE OUVERTURE, jamais figée au montage.
      const today = browserLocalDate();
      const view = await loadWeekMeals({ userId, today, date: day ?? today });
      setState({ kind: "ready", view });
    } catch {
      setState({ kind: "error" });
    }
  }, [userId, day]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Modal open={open} onClose={onClose} title={t("meals.week.title")} closeAsIcon>
      {state.kind === "loading" && (
        <p className="text-sm text-ink-soft">{t("meals.week.loading")}</p>
      )}
      {state.kind === "error" && (
        <div className="space-y-3">
          <p className="rounded-card bg-red-50 p-3 text-sm text-red-700">
            {t("meals.week.error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t("meals.week.retry")}
          </Button>
        </div>
      )}
      {state.kind === "ready" && state.view === null && (
        // Un écran vide porte la sortie: c'est sur `/app/plan` que la semaine
        // se compose (ou, pour un profil réclamé, que sa part se lit).
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">{t("meals.week.empty_title")}</p>
          <p className="text-sm leading-6 text-ink-soft">{t("meals.week.empty_body")}</p>
          <ButtonLink to="/app/plan" variant="primary">
            {t("meals.week.empty_cta")}
          </ButtonLink>
        </div>
      )}
      {state.kind === "ready" && state.view !== null && userId && (
        <MealsTrackingBody view={state.view} userId={userId} askedDay={day} />
      )}
    </Modal>
  );
}
