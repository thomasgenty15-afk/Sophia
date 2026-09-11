import React from "react";

import { aisleLabel, dishDayLabel, dishSlotLabel, mealCopy } from "../../api/mealLabels";
import { SHOPPING_AISLE_ORDER } from "../../api/mealLabels";
import { plural } from "../../i18n/plural";
import { t } from "../../i18n/t";
import { Card } from "../ui/Card";
import {
  boxLinesForDish,
  boxLinesForSession,
  DEMO_DAYS,
  DEMO_DISHES,
  DEMO_SILENCES,
  DEMO_SLOTS,
  type DemoBoxLine,
  type DemoDay,
  type DemoDish,
  type DemoGoal,
  type DemoGrocery,
  type DemoNode,
  type DemoPrep,
  type DemoSession,
  type DemoWave,
  daysFedByPrep,
  groceriesOf,
  nodeKey,
  prepById,
  relatedTo,
  sessionOn,
  waveOn,
} from "./planDemoData";

// LA DÉMONSTRATION DU PLAN, SUR `/` — LE RENDU.
//
// ── UNE COPIE FIDÈLE, PAS UN REMONTAGE ─────────────────────────────────────
// Ce composant reprend la GÉOMÉTRIE et les LIBELLÉS du bloc d'un jour dans
// `PlanDayBlock`: les courses du jour, la session de cuisine avec ses
// casseroles et son Boxing (`BoxTable`), puis les plats moment par moment
// avec « Depuis … — cuisiné dimanche. » (`DishCard`). Tous les mots viennent
// de `meals.*`, le namespace du produit: la landing n'invente aucun libellé.
//
// ⚠️ RÉDUIT LE 2026-09-08: ni grille de la semaine, ni rail de jours. « Le
// planning de la semaine on s'en fout » — deux jours EMPILÉS, lisibles sans
// un clic, suffisent à montrer le mécanisme. Le produit, lui, garde sa grille.
//
// Pourquoi ne pas monter les vrais composants: ils lisent des `GeneratedDish`
// avec leurs `boxes[]`, `member_portions` et vues d'énergie — remplir tout ça
// à la main ferait une longue fixture pour rendre la même chose, et la page
// publique embarquerait `Modal`, les coches et le formulaire d'accident. Le
// test d'à côté épingle les libellés RENDUS sur ceux du produit.
//
// ── CE QUE LE VISITEUR PEUT FAIRE ──────────────────────────────────────────
// Survoler un article, une casserole ou un plat: tout ce qu'il relie s'allume,
// le reste s'efface. C'est ce qui rend lisibles « courses → cuisine → repas »
// au premier regard — la consigne n°5 du brief.

export interface PlanDemoProps {
  goal: DemoGoal;
}

const HIGHLIGHT = "ring-2 ring-fig-600 bg-fig-50";
const DIM = "opacity-40";

function useChain() {
  const [focus, setFocus] = React.useState<DemoNode | null>(null);
  const related = React.useMemo(() => (focus ? relatedTo(focus) : null), [focus]);
  const classFor = (node: DemoNode): string => {
    if (!related) return "";
    return related.has(nodeKey(node)) ? HIGHLIGHT : DIM;
  };
  const bind = (node: DemoNode) => ({
    onMouseEnter: () => setFocus(node),
    onMouseLeave: () => setFocus(null),
    onFocus: () => setFocus(node),
    onBlur: () => setFocus(null),
    tabIndex: 0,
  });
  return { focus, classFor, bind };
}

type Chain = ReturnType<typeof useChain>;

/**
 * L'EXEMPLE, PLIÉ PAR DÉFAUT — décidé le 2026-09-08.
 *
 * ── POURQUOI PLIÉ, ET PAS SEULEMENT PLIABLE ───────────────────────────────
 * La section 02 se lit d'abord en une phrase (« Chaque repas prévu arrive avec
 * ses quantités »). L'exemple est la PREUVE de cette phrase: on va le chercher
 * quand on doute, pas avant. Déplié d'office, il pousse le foyer, l'imprévu et
 * l'offre sous mille pixels de grammes — c'est le reproche exact qui a fait
 * réduire la fixture (« vraiment énorme »).
 *
 * ⚠️ CE QUI RESTE VISIBLE PLIÉ EST CE QUI DÉCIDE DU CLIC: le badge, et ce que
 * l'exemple contient (« Deux jours, pour une personne »). Un bouton seul, sous
 * un titre, ne dit pas ce qu'on va ouvrir.
 *
 * ⚠️ LE PLIAGE EST L'IDIOME DU PRODUIT, pas une invention de la landing: les
 * courses du jour et la session de cuisine se replient de la même façon, avec
 * le même couple `aria-expanded` / `aria-controls`.
 */
export default function PlanDemo({ goal }: PlanDemoProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  return (
    <div className="rounded-fiche border border-line bg-paper p-4 shadow-[0_18px_50px_rgba(42,28,35,0.06)] sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-full bg-fig-700 px-3 py-1 text-label font-semibold uppercase text-paper">
          {t("home.plan.badge")}
        </span>
        <span className="text-[13px] text-ink-soft">
          {t("home.plan.window")} · {t("home.plan.household")}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto min-h-6 shrink-0 text-sm font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
        >
          {t(open ? "home.plan.close" : "home.plan.open")}
        </button>
      </div>
      {open && <div id={panelId}><PlanDemoBody goal={goal} /></div>}
    </div>
  );
}

/**
 * LE CORPS DE L'EXEMPLE — les deux jours, dans l'ordre de `PlanDayBlock`.
 *
 * ⚠️ EXPORTÉ POUR UNE SEULE RAISON, ET ELLE EST MÉCANIQUE: le pliage vit dans
 * un `useState`, et ce dépôt teste en environnement `node` avec
 * `renderToStaticMarkup` — qui ne rend que l'état INITIAL. Sans cette
 * extraction, la garde qui vérifie que l'exemple porte bien les libellés du
 * produit n'aurait plus rien à lire, et elle verdirait sur une carte pliée.
 */
export function PlanDemoBody({ goal }: PlanDemoProps) {
  const chain = useChain();
  return (
    <>
      <p className="mt-4 text-[13px] leading-5 text-ink-soft">{t("home.plan.chain_hint")}</p>
      {/* ── LES DEUX JOURS, EMPILÉS — chacun dans l'ordre de `PlanDayBlock` */}
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {DEMO_DAYS.map((day) => <DayBlock key={day} day={day} goal={goal} chain={chain} />)}
      </div>
      <p className="mt-4 text-[13px] leading-5 text-ink-soft">{t("home.plan.example_note")}</p>
    </>
  );
}

/** Le bloc d'un jour: courses, cuisine, repas — puis les moments sans plat. */
function DayBlock({ day, goal, chain }: { day: DemoDay; goal: DemoGoal; chain: Chain }) {
  const wave = waveOn(day);
  const session = sessionOn(day);
  const dishes = DEMO_DISHES.filter((d) => d.day === day);
  const silences = DEMO_SILENCES.filter((s) => s.day === day);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{dishDayLabel(day)}</h3>
      <div className="space-y-3">
        {wave && <DayGroceriesCard wave={wave} chain={chain} />}
        {session && <DaySessionCard session={session} goal={goal} chain={chain} />}
        {DEMO_SLOTS.map((slot) => {
          const here = dishes.filter((d) => d.slot === slot);
          if (here.length === 0) return null;
          return (
            <section key={slot}>
              <h4 className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-soft">
                {dishSlotLabel(slot)}
              </h4>
              <div className="space-y-2">
                {here.map((dish) => <DemoDishCard key={dish.id} dish={dish} goal={goal} chain={chain} />)}
              </div>
            </section>
          );
        })}
        {silences.length > 0 && (
          <ul className="flex flex-col gap-1">
            {silences.map((s) => (
              <li key={s.slot} className="text-xs text-ink-soft">
                <span className="font-medium">{dishSlotLabel(s.slot)}</span>
                {" — "}
                <span className="italic">{mealCopy("meals.grid.eating_out")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Les courses du jour — le compte en tête, la liste par rayons dépliable (repliée, comme le produit). */
function DayGroceriesCard({ wave, chain }: { wave: DemoWave; chain: Chain }) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const items = groceriesOf(wave);
  const byAisle = SHOPPING_AISLE_ORDER
    .map((aisle) => ({ aisle, items: items.filter((g) => g.aisle === aisle) }))
    .filter((g) => g.items.length > 0);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-semibold text-ink">
          {items.length === 1
            ? mealCopy("meals.result.day_groceries_one")
            : mealCopy("meals.result.day_groceries_many", { n: items.length })}
        </p>
        <span className="text-xs text-ink-soft">
          {mealCopy("meals.shopping.wave_now")}
          {" · "}
          {mealCopy("meals.shopping.wave_serves", { day: dishDayLabel(wave.servesCookOn) ?? wave.servesCookOn })}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto min-h-6 shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {mealCopy(open ? "meals.result.day_groceries_hide" : "meals.result.day_groceries_show")}
        </button>
      </div>
      {open && (
        <div id={panelId} className="mt-3 grid gap-3 sm:grid-cols-2">
          {byAisle.map((group) => (
            <div key={group.aisle}>
              <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">{aisleLabel(group.aisle)}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {group.items.map((g) => <GroceryLine key={g.id} item={g} chain={chain} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GroceryLine({ item, chain }: { item: DemoGrocery; chain: Chain }) {
  const node: DemoNode = { kind: "grocery", id: item.id };
  return (
    <li
      {...chain.bind(node)}
      className={`flex items-baseline gap-2 rounded-part px-1 text-sm text-ink transition-all ${chain.classFor(node)}`}
    >
      <span>{t(item.termKey)}</span>
      <span className="tabular-nums text-ink-soft">{item.quantity}</span>
    </li>
  );
}

/** La session du jour — ses casseroles, son déroulé, son Boxing. */
function DaySessionCard({ session, goal, chain }: { session: DemoSession; goal: DemoGoal; chain: Chain }) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const preps = session.prepIds.map(prepById).filter((p): p is DemoPrep => p !== undefined);
  const boxes = boxLinesForSession(session, goal);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-semibold text-ink">{mealCopy("meals.result.day_session")}</p>
        <span className="text-xs font-normal tabular-nums text-ink-soft">
          {mealCopy("meals.sessions.session_time", { n: session.totalMinutes })}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto min-h-6 shrink-0 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {mealCopy(open ? "meals.result.day_session_hide" : "meals.result.day_session_show")}
        </button>
      </div>
      {open && (
        <p id={panelId} className="mt-2 text-sm leading-6 text-ink">{t(session.runThroughKey)}</p>
      )}
      {preps.map((prep) => <PrepBlock key={prep.id} prep={prep} chain={chain} />)}
      <BoxingTable lines={boxes} />
    </Card>
  );
}

function PrepBlock({ prep, chain }: { prep: DemoPrep; chain: Chain }) {
  const node: DemoNode = { kind: "prep", id: prep.id };
  const feeds = daysFedByPrep(prep.id).map((d) => dishDayLabel(d) ?? d);
  return (
    <div {...chain.bind(node)} className={`mt-3 rounded-card px-2 py-1 transition-all ${chain.classFor(node)}`}>
      <p className="text-sm font-semibold text-ink">
        {t(prep.titleKey)}
        <span className="ml-2 font-normal text-ink-soft">
          {plural(
            prep.servings,
            mealCopy("meals.sessions.makes_one", { n: prep.servings }),
            mealCopy("meals.sessions.makes", { n: prep.servings }),
          )}
        </span>
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-ink-soft">
        <span>{mealCopy("meals.sessions.active", { n: prep.activeMinutes })}</span>
        <span>{mealCopy("meals.sessions.total", { n: prep.totalMinutes })}</span>
        {feeds.length > 0 && <span>{mealCopy("meals.result.batch_covers", { days: feeds.join(", ") })}</span>}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {prep.ingredients.map((ing) => (
          <li key={ing.termKey} className="flex items-baseline gap-1.5 text-sm text-ink">
            <span>{t(ing.termKey)}</span>
            <span className="tabular-nums text-ink-soft">{ing.quantity}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{t(prep.methodKey)}</p>
    </div>
  );
}

/** Le Boxing — `BoxTable` en contexte `session`: le compte, la clé de lecture, les couvercles. */
function BoxingTable({ lines }: { lines: readonly DemoBoxLine[] }) {
  if (lines.length === 0) return null;
  const hasKcal = lines.some((l) => l.kcal !== null);
  return (
    <div className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">{mealCopy("meals.boxes.title")}</p>
        <span className="text-label tabular-nums text-ink-soft">
          {lines.length === 1
            ? mealCopy("meals.boxes.count_one")
            : mealCopy("meals.boxes.count_many", { n: lines.length })}
        </span>
      </div>
      <p className="mt-1 max-w-[52ch] break-words text-xs leading-5 text-ink-soft">{mealCopy("meals.boxes.ready_not_raw")}</p>
      <ul className="mt-2 flex flex-col">
        {lines.map((line) => (
          <li key={line.id} className="border-t border-line py-2 first:border-t-0 first:pt-1">
            <p className="text-sm font-medium text-ink">{line.lid}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs tabular-nums text-ink-soft">
              {line.items.map((it) => (
                <span key={it.term}>{it.term} {mealCopy("meals.boxes.grams", { n: it.grams })}</span>
              ))}
              <span className="font-medium text-ink">{mealCopy("meals.boxes.grams", { n: line.total })}</span>
              {line.kcal !== null && <span>{mealCopy("meals.boxes.energy", { n: line.kcal })}</span>}
            </p>
          </li>
        ))}
      </ul>
      {hasKcal && <p className="mt-2 text-xs leading-5 text-ink-soft">{mealCopy("meals.energy.basis")}</p>}
    </div>
  );
}

/** Un plat du jour — `DishCard`: le titre, le geste du jour, la provenance, la boîte à sortir. */
function DemoDishCard({ dish, goal, chain }: { dish: DemoDish; goal: DemoGoal; chain: Chain }) {
  const node: DemoNode = { kind: "dish", id: dish.id };
  const sources = dish.prepIds.map(prepById).filter((p): p is DemoPrep => p !== undefined);
  const boxes = boxLinesForDish(dish, goal);
  return (
    <div {...chain.bind(node)} className={`rounded-card transition-all ${chain.classFor(node)}`}>
      <Card>
        <span className="font-medium text-ink">{t(dish.titleKey)}</span>
        {dish.sameDay && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm text-ink">
            <span className="font-medium">{mealCopy(`meals.same_day.${dish.sameDay.kind}`)}</span>
            <span className="tabular-nums text-ink-soft">{mealCopy("meals.same_day.minutes", { n: dish.sameDay.minutes })}</span>
          </p>
        )}
        {sources.length > 0 && (
          <div className="mt-3 space-y-1 rounded-card border border-line bg-paper-2 px-3 py-2">
            {sources.map((prep) => (
              <p key={prep.id} className="text-sm text-ink">
                {mealCopy("meals.result.from_prep", { title: t(prep.titleKey), day: dishDayLabel(prep.cookOn) ?? prep.cookOn })}
              </p>
            ))}
          </div>
        )}
        {boxes.length > 0 && (
          <div className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2">
            <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">{mealCopy("meals.boxes.title_dish")}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {boxes.map((line) => (
                <li key={line.id} className="text-sm text-ink">{line.lid}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
