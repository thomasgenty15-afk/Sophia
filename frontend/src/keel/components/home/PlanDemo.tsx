import React from "react";

import { aisleLabel, dishDayLabel, dishSlotLabel, mealCopy } from "../../api/mealLabels";
import { SHOPPING_AISLE_ORDER } from "../../api/mealLabels";
import { plural } from "../../i18n/plural";
import { t, type MessageKey } from "../../i18n/t";
import { Card } from "../ui/Card";
import PlanStoryStage from "./PlanStoryStage";
import {
  boxLinesForDish,
  boxLinesForSession,
  boxPartsFor,
  DEMO_DAYS,
  DEMO_DISHES,
  DEMO_GROCERIES,
  DEMO_PREPS,
  DEMO_SESSIONS,
  DEMO_SLOTS,
  type DemoBoxLine,
  type DemoBoxPart,
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
 * Les repères de la session de dimanche, en minutes depuis le début. Ils
 * tiennent dans ses 50 minutes: le poulet entre au four à 5 min pour 45, le
 * boulgour démarre à 30 pour 20 — tout est prêt à 50.
 */
const COOK_STEPS = [
  { at: 0, text: "home.flow.cook.step_1" },
  { at: 5, text: "home.flow.cook.step_2" },
  { at: 30, text: "home.flow.cook.step_3" },
  { at: 50, text: "home.flow.cook.step_4" },
] as const satisfies ReadonlyArray<{ at: number; text: MessageKey }>;

/** Libellé court d'une ligne de boîte, par le rôle de sa casserole. */
const PART_LABEL = {
  main: "home.demo.box.main",
  separable_side: "home.demo.box.side",
} as const satisfies Record<DemoBoxPart["role"], MessageKey>;

/**
 * « Exemple de repas » — LA BOÎTE, LIGNE PAR CASSEROLE (2026-09-23).
 *
 * Deux lignes, comme le produit les rendra (chantier « féculent à côté »,
 * lot C): la casserole principale avec sa répartition exacte, puis le
 * féculent cuit à part. Les grammes viennent de la fixture partagée.
 */
export function MealPreview({ goal }: PlanDemoProps) {
  const dish = DEMO_DISHES[0];
  const parts = boxPartsFor(dish, goal);
  return <div className="w-full rounded-fiche border border-line bg-paper p-5 sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-wide text-fig-700">{t("home.preview.label")}</p>
    <p className="mt-3 font-display text-[1.35rem] leading-snug text-ink">{t(dish.titleKey)}</p>
    <ul className="mt-4 divide-y divide-line">
      {parts.map((part) => <li key={part.prepId} className="py-2.5">
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-ink">{t(PART_LABEL[part.role])}</span>
          <strong className="shrink-0 font-semibold tabular-nums text-ink">{part.grams} g</strong>
        </p>
        {part.items.length > 1 && <p className="mt-0.5 text-[13px] tabular-nums text-ink-soft">
          {part.items.map((item) => `${item.term} ${item.grams} g`).join(" · ")}
        </p>}
      </li>)}
    </ul>
    <p className="mt-3 text-xs leading-5 text-ink-soft">{t("home.preview.note")}</p>
  </div>;
}

/**
 * LES QUATRE ÉTAPES — courses, cuisine, boîtes, repas (2026-09-23).
 *
 * ⚠️ « TES BOÎTES » EST NÉE CE JOUR-LÀ: la page ne disait nulle part ce
 * qu'est une boîte ni pourquoi on pèse à ce moment-là, alors que c'est le
 * cœur du protocole (`BoxTable`: « on pèse UNE fois, au moment de la mise en
 * boîtes »). La numérotation est légitime ici: c'est un ordre vécu.
 *
 * La scène 3D (`PlanStoryStage`) se colle à côté de la liste et avance avec
 * elle. La liste porte TOUT le contenu; la scène n'en ajoute aucun.
 */
export default function PlanDemo({ goal }: PlanDemoProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const stepRefs = React.useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = React.useState(0);
  // ⚠️ OPTIMISTE: la liste prend ses hauteurs de récit DÈS LE PREMIER RENDU.
  // Les appliquer quand la 3D a fini de charger faisait sauter la page sous
  // les yeux de qui était déjà dans la section. Elles ne tombent que si WebGL
  // échoue; l'estompe des étapes inactives, elle, attend la scène.
  const [story, setStory] = React.useState<"pending" | "ready" | "failed">("pending");
  const onStoryStatus = React.useCallback((ready: boolean) => setStory(ready ? "ready" : "failed"), []);
  const tall = story !== "failed";
  const dinner = DEMO_DISHES.find((dish) => dish.id === "sun_dinner")!;
  const nextDish = DEMO_DISHES.find((dish) => dish.id === "mon_lunch")!;
  const groceries = DEMO_GROCERIES.filter((item) => ["chicken_thighs", "bulgur", "carrots"].includes(item.id));

  const steps: ReadonlyArray<{ key: string; title: MessageKey; when: MessageKey | null; body: React.ReactNode }> = [
    {
      key: "shop",
      title: "home.how.shop.title",
      when: "home.flow.sunday",
      body: <>
        <ul className="mt-4 space-y-2">
          {groceries.map((item) => <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-soft">{t(item.termKey)}</span><span className="shrink-0 tabular-nums text-ink">{item.quantity[goal]}</span>
          </li>)}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">{t("home.flow.more", { count: DEMO_GROCERIES.length - groceries.length })}</p>
      </>,
    },
    {
      key: "cook",
      title: "home.how.cook.title",
      when: "home.flow.sunday",
      // ⟳ 2026-09-23 — LA RECETTE, ÉTOFFÉE: le déroulé de la session, repère
      // par repère, au lieu de deux noms de plats. C'est ce qu'on a sous les
      // yeux en cuisinant.
      body: <>
        <p className="mt-3 text-sm font-medium text-ink">{DEMO_PREPS.map((prep) => t(prep.titleKey)).join(" · ")}</p>
        <ol className="mt-4 space-y-3 border-l border-line pl-4">
          {COOK_STEPS.map((step) => <li key={step.text} className="relative text-sm leading-6 text-ink-soft">
            <span aria-hidden="true" className="absolute -left-[1.3rem] top-2 size-2 rounded-full bg-fig-700" />
            <span className="mr-2 font-semibold tabular-nums text-ink">{t("home.flow.step_at", { minutes: step.at })}</span>
            {t(step.text)}
          </li>)}
        </ol>
        <p className="mt-4 border-t border-line pt-3 text-sm font-medium text-ink">{t("home.flow.cooking_time", { minutes: DEMO_SESSIONS[0].totalMinutes })}</p>
      </>,
    },
    {
      key: "box",
      title: "home.how.box.title",
      when: "home.flow.boxing",
      body: <>
        <p className="mt-4 text-sm font-medium text-ink">{t("home.flow.box_count")}</p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{t("home.flow.box_side")}</p>
        <p className="mt-3 border-t border-line pt-3 text-sm leading-6 text-ink-soft">{t("home.flow.box_weigh")}</p>
      </>,
    },
    {
      key: "eat",
      title: "home.how.eat.title",
      when: null,
      // ⚠️ LE KCAL EST LE CHIFFRE QUE L'ÉTAPE VEND, DONC IL EST LU AVANT LA
      // phrase: il vient des grammes de la fixture (`DemoDish.kcal`), et il se
      // déplace avec l'objectif comme les grammes. Sa BASE est la ligne du bas
      // (`home.plan.summary.energy`) — les deux sont dans ce même bloc, et un
      // chiffre d'énergie sans sa base est exactement ce que
      // `energyBasis.int.test.ts` existe pour empêcher.
      body: <>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink">{t("home.flow.dinner")}</span>
              <strong className="shrink-0 rounded-full bg-fig-100 px-2.5 py-1 text-[15px] font-semibold tabular-nums text-fig-700">
                {t("home.flow.energy", { kcal: dinner.kcal![goal] })}
              </strong>
            </dt>
            <dd className="mt-1 text-ink-soft">{t("home.flow.serve")}</dd>
          </div>
          <div>
            <dt className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink">{t("home.flow.lunch")}</span>
              <strong className="shrink-0 rounded-full bg-fig-100 px-2.5 py-1 text-[15px] font-semibold tabular-nums text-fig-700">
                {t("home.flow.energy", { kcal: nextDish.kcal![goal] })}
              </strong>
            </dt>
            <dd className="mt-1 text-ink-soft">{t("home.flow.reheat", { minutes: nextDish.sameDay!.minutes })}</dd>
          </div>
        </dl>
        <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-ink-soft">{t("home.plan.summary.energy")}</p>
      </>,
    },
  ];

  return <div>
    <p className="text-sm text-ink-soft">{t("home.plan.window")}</p>
    <div className="mt-4 grid items-start lg:mt-2 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
      <PlanStoryStage goal={goal} stepRefs={stepRefs} onActive={setActive} onStatus={onStoryStatus} />
      {/* ⚠️ LES HAUTEURS MINIMALES donnent au défilement le temps de raconter.
          Sans 3D, la liste redevient compacte. */}
      <ol className={tall ? "lg:py-[18svh]" : "mt-2 space-y-4"}>
        {steps.map((step, i) => <li
          key={step.key}
          ref={(el) => { stepRefs.current[i] = el; }}
          className={`transition-opacity duration-500 motion-reduce:transition-none ${tall ? "flex min-h-[48svh] flex-col pt-6 lg:min-h-[58svh] lg:justify-center lg:pt-0" : ""} ${story === "ready" && active !== i ? "lg:opacity-40" : ""}`}
        >
          <div className="rounded-fiche border border-line bg-paper p-5 sm:p-6">
            <div className="flex items-baseline gap-3">
              <span aria-hidden="true" className="font-display text-lg tabular-nums text-fig-700">{i + 1}</span>
              <h3 className="font-display text-xl text-ink">{t(step.title)}</h3>
            </div>
            {step.when && <p className="mt-1 text-xs text-fig-700">{t(step.when)}</p>}
            {step.body}
          </div>
        </li>)}
      </ol>
    </div>
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}
      className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-fig-700 underline underline-offset-4 hover:text-fig-800">
      {t(open ? "home.plan.close" : "home.plan.open")}
    </button>
    <div id={panelId} hidden={!open}>{open && <PlanDemoBody goal={goal} />}</div>
  </div>;
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

/** Le bloc d'un jour: courses, cuisine, repas. Un moment sans plat ne se rend pas. */
function DayBlock({ day, goal, chain }: { day: DemoDay; goal: DemoGoal; chain: Chain }) {
  const wave = waveOn(day);
  const session = sessionOn(day);
  const dishes = DEMO_DISHES.filter((d) => d.day === day);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{dishDayLabel(day)}</h3>
      <div className="space-y-3">
        {wave && <DayGroceriesCard wave={wave} goal={goal} chain={chain} />}
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
      </div>
    </div>
  );
}

/** Les courses du jour — le compte en tête, la liste par rayons dépliable (repliée, comme le produit). */
function DayGroceriesCard({ wave, goal, chain }: { wave: DemoWave; goal: DemoGoal; chain: Chain }) {
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
                {group.items.map((g) => <GroceryLine key={g.id} item={g} goal={goal} chain={chain} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GroceryLine({ item, goal, chain }: { item: DemoGrocery; goal: DemoGoal; chain: Chain }) {
  const node: DemoNode = { kind: "grocery", id: item.id };
  return (
    <li
      {...chain.bind(node)}
      className={`flex items-baseline gap-2 rounded-part px-1 text-sm text-ink transition-all ${chain.classFor(node)}`}
    >
      <span>{t(item.termKey)}</span>
      <span className="tabular-nums text-ink-soft">{item.quantity[goal]}</span>
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
      {preps.map((prep) => <PrepBlock key={prep.id} prep={prep} goal={goal} chain={chain} />)}
      <BoxingTable lines={boxes} />
    </Card>
  );
}

function PrepBlock({ prep, goal, chain }: { prep: DemoPrep; goal: DemoGoal; chain: Chain }) {
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
            <span className="tabular-nums text-ink-soft">{ing.quantity[goal]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{t(prep.methodKey)}</p>
    </div>
  );
}

/** Le Boxing — `BoxTable` en contexte `session`: le compte, les couvercles. */
function BoxingTable({ lines }: { lines: readonly DemoBoxLine[] }) {
  if (lines.length === 0) return null;
  const hasKcal = lines.some((l) => l.kcal !== null);
  return (
    <div className="mt-3 rounded-card border border-line bg-paper-2 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-label font-semibold uppercase tracking-wide text-ink-soft">{t("home.plan.boxes_label")}</p>
        <span className="text-label tabular-nums text-ink-soft">
          {lines.length === 1
            ? mealCopy("meals.boxes.count_one")
            : mealCopy("meals.boxes.count_many", { n: lines.length })}
        </span>
      </div>
      <ul className="mt-2 flex flex-col">
        {lines.map((line) => (
          <li key={line.id} className="border-t border-line py-2 first:border-t-0 first:pt-1">
            <p className="text-sm font-medium text-ink">{line.lid}</p>
            {/* Une ligne par casserole (lot C): la principale et sa répartition,
                puis le féculent à côté. Le total et le kcal ferment la boîte. */}
            <ul className="mt-0.5 flex flex-col gap-0.5 text-xs tabular-nums text-ink-soft">
              {line.parts.map((part) => (
                <li key={part.prepId}>
                  <span className="text-ink">{part.title}</span>{" "}
                  {mealCopy("meals.boxes.grams", { n: part.grams })}
                  {part.items.length > 1 && <span> ({part.items.map((it) => `${it.term} ${mealCopy("meals.boxes.grams", { n: it.grams })}`).join(" · ")})</span>}
                </li>
              ))}
            </ul>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs tabular-nums text-ink-soft">
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
