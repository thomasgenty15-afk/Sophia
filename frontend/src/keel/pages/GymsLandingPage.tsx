import React from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t, type MessageKey } from "../i18n/t";

/**
 * /gyms — the second sales page. Same product as `/`, different buyer, so a
 * different argument order, a different vocabulary and different numbers.
 *
 * ── WHY IT IS A SECOND PAGE AND NOT A PARAGRAPH ON `/` ────────────────────
 * `/` sells to someone who SELLS A COURSE: their pain is that a course is paid
 * once, and Sophia's gain is a recurring line where there was none. A gym
 * already has the recurring line — that IS the business — and its pain is
 * churn. The two pages therefore lead with different sentences and close with
 * different fears, and folding them together would produce a page that opens on
 * whichever half the reader isn't.
 *
 * ── THE BUYER, AND HE IS NARROW ON PURPOSE ───────────────────────────────
 * The OWNER-COACH: a box, a strength hall, a hybrid studio, 100–300 members,
 * one person with a stated position on how people should eat. He is the one who
 * sits the doctrine interview, and it is his name signing the messages.
 *
 * NOT the chain that appoints a nutritionist. Whoever fills in the doctrine has
 * to be whoever benefits from it, or the doctrine is filled out under duress and
 * the agent comes out generic — which is this product's FAILURE MODE, not a
 * lesser version of it. `Fit` says that out loud and turns that reader away
 * rather than taking his money; it is the only section on the page whose job is
 * to lose a sale.
 *
 * ── THE THREE AXES, IN THIS ORDER, AND THE ORDER IS THE ARGUMENT ─────────
 *   1. REVENUE leads (`Hero` + the worked example). A cost argument caps at the
 *      owner's own hours and lands us next to gym-management software; a revenue
 *      argument doesn't cap. Same reasoning as the header of `landing.hero.*`.
 *   2. RETENTION second (`Churn`) — the argument that speaks loudest to a gym,
 *      but it reads better once the margin is already banked.
 *   3. DATA last (`MondayRead`) — the part he doesn't see coming. Framed as an
 *      EARLY CHURN WARNING: a "slipping" member is still reachable, where the
 *      access log only names them six weeks later, when they are gone.
 *
 * ── WHAT THIS PAGE MAY NOT PROMISE (checked in the code, 2026-08-06) ──────
 *   * No member payment inside Sophia — `stripe-create-checkout-session` has no
 *     member SKU. The owner bills his members with his own tools, and
 *     `gyms.pricing.billing_note` says so on the pricing section rather than
 *     leaving it to be discovered after signature.
 *   * No native app, therefore NO PUSH NOTIFICATION anywhere in this copy. The
 *     channel is the web and the in-app thread (`/app/chat`).
 *   * The protocol is NUTRITIONAL. No supplements, no sleep, no training load —
 *     the schema would carry them, the capture surface does not expose them, and
 *     a gym is exactly the buyer who would assume otherwise.
 *   * No integration with gym-management software. `gyms.hero.note` states it
 *     the right way round ("nothing to connect") instead of hiding it.
 *   * NO RETENTION FIGURE. We have not measured one. The retention section asks
 *     the question — what is a member who stays three months longer worth? —
 *     exactly as `landing.pricing.why` does, and says in as many words that we
 *     will not invent the number.
 *
 * ── DESIGN ───────────────────────────────────────────────────────────────
 * Identical to `/`, deliberately: light only, no brand accent, every saturated
 * colour is a STATE from the Badge kit's tones, and the single dark block is
 * spent on the double lock. A second sales page that invented its own palette
 * would read as a different company's site one click from the first.
 *
 * ── NO SIGNED-IN REDIRECT, UNLIKE `/` ────────────────────────────────────
 * The landing bounces a signed-in visitor to their space because `/` is where
 * everything defaults to. `/gyms` is a link somebody was SENT; bouncing the
 * signed-in owner who forwards it to a partner would make the link look broken.
 * `PublicHeader` already swaps its CTAs for a way back into the app.
 */

// Hoisted: `SEO` holds `structuredData` in a `useEffect` dependency array, so an
// inline literal would rebuild the <script> tags on every render.
//
// The Organization node is the shared declaration from `lib/legalEntity` — the
// same one `/` and `/legal` make. The SoftwareApplication node carries THIS
// page's url and description; the canonical below keeps the two pages from
// reading as duplicates of each other.
const GYMS_STRUCTURED_DATA = [
  organizationStructuredData(),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Sophia",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${LEGAL_ENTITY.siteUrl}/gyms`,
    description: t("gyms.seo_description"),
    inLanguage: "en-GB",
    publisher: organizationStructuredData(),
  },
];

export function GymsLandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <SEO
        title={t("gyms.seo_title")}
        description={t("gyms.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/gyms`}
        structuredData={GYMS_STRUCTURED_DATA}
      />

      <PublicHeader />

      <main>
        <Hero />
        <Churn />
        <HowItWorks />
        {/*
          ICI, ET PAS AILLEURS. `HowItWorks` vient de dire « you record your
          method » — le lecteur a donc en tête, à cette seconde précise, que
          quelqu'un doit s'asseoir et le faire. C'est le seul moment où « et ce
          quelqu'un, c'est TOI » se lit comme une condition du produit plutôt
          que comme une clause de réserve.

          Elle reste AVANT `MondayRead` et `DoubleLock`: les deux sections
          suivantes décrivent ce qu'on fait de la méthode, et un lecteur qui
          n'est pas le bon acheteur doit l'avoir appris avant de les lire.
        */}
        <Fit />
        <MondayRead />
        <DoubleLock />
        <Doctrine />
        <Pricing />
        <ClosingCall />
      </main>

      <PublicFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div>
          <Kicker>{t("gyms.hero.kicker")}</Kicker>
          <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            {t("gyms.hero.title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600">
            {t("gyms.hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
              {t("gyms.hero.cta_trial")}
            </ButtonLink>
            <ButtonLink to="/auth" variant="secondary" className="px-6 py-3 text-base">
              {t("gyms.hero.cta_signin")}
            </ButtonLink>
          </div>
          <p className="mt-4 max-w-md text-sm leading-6 text-gray-500">
            {t("gyms.hero.note")}
          </p>
          {/* Même porte discrète que sur `/`, et pour la même raison: un gérant
              qui évalue veut voir le produit du côté du membre avant d'y
              inviter qui que ce soit. Une ligne de texte, pas un troisième
              bouton — cette page vend à celui qui PAIE. */}
          <p className="mt-3 max-w-md text-sm leading-6 text-gray-500">
            {t("gyms.hero.try_prompt")}{" "}
            <Link to="/start" className="font-medium text-gray-900 underline">
              {t("gyms.hero.try_cta")}
            </Link>
          </p>
        </div>
        <MoneyPanel />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The worked example — the hero's thesis object
// ---------------------------------------------------------------------------

/**
 * The hero panel on `/` is the Monday page, because a course seller buys the
 * artefact. A gym owner buys the ARITHMETIC, and he should be able to read it
 * in thirty seconds without scrolling: members, take-up, in, out, kept.
 *
 * IT IS LABELLED AN EXAMPLE IN THREE PLACES — the panel title, the subtitle,
 * and the caption underneath, which names the two numbers we do not know (his
 * take-up and his price) and the one that isn't an estimate (our 7 €). This
 * page's whole credibility rests on the reader believing the pricing section
 * later; a number here that quietly pretends to be a forecast spends that.
 *
 * The figures live in `gyms.money.*` rather than in this file: they are copy,
 * they are checked as a set (the arithmetic is spelled out in the i18n header),
 * and a page that hardcodes "925 €" in JSX is a page where the total and the
 * caption drift apart on the first edit.
 */
function MoneyPanel() {
  return (
    <div>
      <Card padded={false} className="shadow-sm">
        <header className="border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">
            {t("gyms.money.title")}
          </div>
          <div className="text-xs text-gray-500">{t("gyms.money.subtitle")}</div>
        </header>

        <PanelBlock label={t("gyms.money.uptake_label")}>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums leading-none text-gray-900">
              {t("gyms.money.uptake_value")}
            </span>
            <span className="text-sm text-gray-600">{t("gyms.money.uptake_unit")}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {t("gyms.money.uptake_hint")}
          </p>
        </PanelBlock>

        <PanelBlock label={t("gyms.money.month_label")}>
          <dl className="divide-y divide-gray-100">
            <MoneyRow label={t("gyms.money.in_label")} value={t("gyms.money.in_value")} />
            <MoneyRow label={t("gyms.money.out_label")} value={t("gyms.money.out_value")} />
            {/*
              La ligne qui porte l'argument, donc la seule en gras et en corps
              supérieur. Pas de couleur: sur cette page toute couleur saturée est
              un ÉTAT (les tons du Badge kit), et un total en vert se lirait
              comme un statut « bon » calculé par le produit alors que c'est une
              soustraction dans un exemple.
            */}
            <MoneyRow
              label={t("gyms.money.keep_label")}
              value={t("gyms.money.keep_value")}
              hint={t("gyms.money.keep_hint")}
              strong
            />
          </dl>
        </PanelBlock>

        <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
            {t("gyms.money.hours_label")}
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {t("gyms.money.hours_value")}
          </div>
        </div>
      </Card>
      <p className="mt-3 text-xs leading-5 text-gray-500">{t("gyms.money.caption")}</p>
    </div>
  );
}

function PanelBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-200 px-4 py-3 first-of-type:border-t-0">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * One line of the month. The amount is `shrink-0` and the label `min-w-0`, so
 * at 320px the sentence wraps and the number never does: a euro figure broken
 * across two lines is a euro figure the reader re-reads instead of believing.
 */
function MoneyRow({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="min-w-0 text-sm leading-6 text-gray-600">
        <span className={strong ? "font-semibold text-gray-900" : undefined}>{label}</span>
        {hint ? <span className="block text-xs text-gray-500">{hint}</span> : null}
      </dt>
      <dd
        className={`shrink-0 tabular-nums text-gray-900 ${
          strong ? "text-xl font-semibold" : "text-base font-medium"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * The argument a gym feels hardest, and the one place on this page where it
 * would be easy to lie. Every claim here is either about the world (a member
 * who plateaus drifts) or about a mechanism we can point at:
 *
 *   p2 — `REENGAGE_AFTER_HOURS = 72` and `REENGAGE_MIN_GAP_HOURS`, in
 *        `_shared/keel/reengagement.ts`. The "one nudge, then quiet" is a bound
 *        in that module, not an intention, and the 72h threshold carries its own
 *        measured justification (at 48h you fire inside normal rhythm).
 *   p3 — asks what a retained member is WORTH instead of asserting a retention
 *        lift, and says we have no such figure. We don't: nothing in this repo
 *        measures churn against a control.
 */
function Churn() {
  const points: { title: string; body: string }[] = [
    { title: t("gyms.churn.p1_title"), body: t("gyms.churn.p1_body") },
    { title: t("gyms.churn.p2_title"), body: t("gyms.churn.p2_body") },
    { title: t("gyms.churn.p3_title"), body: t("gyms.churn.p3_body") },
  ];
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("gyms.churn.kicker")}</Kicker>
        <SectionTitle>{t("gyms.churn.title")}</SectionTitle>
        <p className="mt-6 max-w-2xl text-base leading-7 text-gray-600">
          {t("gyms.churn.body")}
        </p>
        <dl className="mt-10 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-3 sm:gap-10">
          {points.map((point) => (
            <div key={point.title}>
              <dt className="text-base font-semibold leading-6 text-gray-900">
                {point.title}
              </dt>
              <dd className="mt-2 text-sm leading-6 text-gray-600">{point.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 max-w-2xl text-base font-medium leading-7 text-gray-900">
          {t("gyms.churn.close")}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

/**
 * Three cadences, not 1-2-3: the asymmetry between recording a method ONCE and
 * having it answer EVERY DAY is the pitch, and a numbered pill would only have
 * said "there are three of them".
 *
 * The Monday step that closes this list on `/` is not here — it has its own
 * section below, because for a gym it is an argument (an early churn warning)
 * rather than the last step of a setup.
 */
function HowItWorks() {
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("gyms.how.kicker")}</Kicker>
        <SectionTitle>{t("gyms.how.title")}</SectionTitle>

        <ol className="mt-10 border-t border-gray-200">
          <Step
            when={t("gyms.how.step1_when")}
            title={t("gyms.how.step1_title")}
            body={t("gyms.how.step1_body")}
          />
          <Step
            when={t("gyms.how.step2_when")}
            title={t("gyms.how.step2_title")}
            body={t("gyms.how.step2_body")}
          >
            <ChatMock />
          </Step>
          <Step
            when={t("gyms.how.space_when")}
            title={t("gyms.how.space_title")}
            body={t("gyms.how.space_body")}
          />
        </ol>
      </div>
    </section>
  );
}

/**
 * A step is a row, not a card: the eyebrow carries a CADENCE, and a cadence is a
 * schedule. Three identical cards would have flattened "once" and "every day"
 * into two equal things, which is the one thing they are not.
 */
function Step({
  when,
  title,
  body,
  children,
}: {
  when: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="grid gap-3 border-b border-gray-200 py-8 sm:grid-cols-[8rem_1fr] sm:gap-8">
      <div className="pt-0.5 text-xs font-semibold uppercase tracking-widest text-gray-900">
        {when}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-12">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-2 max-w-xl text-base leading-7 text-gray-600">{body}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

/**
 * The daily surface, schematic. Two exchanges, because they are the two halves
 * of the day the product actually owns: a meal answered in the owner's method,
 * and the evening tap the Monday page is built out of.
 *
 * Three buttons and not a 0-10 scale: the pulse has three levels
 * (`_shared/keel/daily_pulse.ts`), and three is the right shape for a member who
 * has trained, worked and eaten before being asked.
 */
function ChatMock() {
  return (
    <div className="w-full lg:w-80">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
        {t("gyms.mock.chat_label")}
      </div>
      <div className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="ml-8 rounded-lg rounded-br-sm bg-gray-900 p-2 text-xs leading-5 text-white">
          <MockPlatePhoto />
          <p className="mt-1.5 px-1">{t("gyms.mock.chat_member")}</p>
        </div>
        <div className="mr-8 rounded-lg rounded-bl-sm border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-700">
          {t("gyms.mock.chat_sophia")}
        </div>
        <div className="mr-8 rounded-lg rounded-bl-sm border border-gray-200 bg-white px-3 py-2">
          <p className="text-xs leading-5 text-gray-700">{t("gyms.mock.chat_evening")}</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {[
              t("gyms.mock.chat_tap_good"),
              t("gyms.mock.chat_tap_mixed"),
              t("gyms.mock.chat_tap_hard"),
            ].map((label) => (
              <span
                key={label}
                className="rounded border border-gray-300 px-1 py-1 text-center text-[0.6875rem] font-medium text-gray-700"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500">
        {t("gyms.mock.chat_caption")}
      </p>
    </div>
  );
}

/**
 * Schematic stand-in for the photo a member sends. Deliberately NOT a
 * photograph: a real plate picture would read as somebody's actual meal, and we
 * show no data we do not have. The two shapes are the two food groups named back
 * in the reply — greens and a protein — so the mock and the answer describe the
 * same plate.
 */
function MockPlatePhoto() {
  return (
    <div
      role="img"
      aria-label={t("gyms.mock.photo_alt")}
      className="flex aspect-[4/3] w-40 max-w-full items-center justify-center rounded-md bg-gray-700"
    >
      <div className="relative h-20 w-20 rounded-full bg-gray-200">
        <span className="absolute left-2 top-4 h-12 w-7 rounded-full bg-emerald-300" />
        <span className="absolute right-2.5 top-6 h-8 w-8 rounded-md bg-amber-200" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Who this is for
// ---------------------------------------------------------------------------

/**
 * THE SECTION WHOSE JOB IS TO LOSE A SALE.
 *
 * A chain that appoints a nutritionist to sit the doctrine interview is a
 * customer we do not want: the person doing the work gets none of the benefit,
 * so the doctrine comes out thin, so the agent comes out generic — and a generic
 * agent is the failure mode of this product. He churns in month two and tells
 * the room it didn't work.
 *
 * Two columns rather than a paragraph, because the reader has to be able to find
 * himself in one of them at a glance. The "not for you" column is the same size
 * and weight as the other one: a disqualification set in small grey text is a
 * disqualification written to be skipped.
 *
 * ⚠️ LA SECTION S'ARRÊTE SUR LES DEUX COLONNES. Elle se terminait par « si tu
 * n'as pas de position sur la façon dont tes membres devraient manger, ce n'est
 * pas encore pour toi ». RETIRÉE, et ne pas la réécrire: la question ici est
 * QUI s'assied à l'entretien, pas si le propriétaire pense correctement. Même
 * dérive que la ligne « macro-first » retirée de `Doctrine` — cette page vend un
 * produit, elle ne décide pas qui a le droit de l'acheter.
 */
function Fit() {
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("gyms.fit.kicker")}</Kicker>
        <SectionTitle>{t("gyms.fit.title")}</SectionTitle>
        <p className="mt-6 max-w-2xl text-base leading-7 text-gray-600">
          {t("gyms.fit.body")}
        </p>

        <dl className="mt-10 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-2 sm:gap-12">
          <div>
            <dt className="text-base font-semibold leading-6 text-gray-900">
              {t("gyms.fit.yes_title")}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-gray-600">{t("gyms.fit.yes_body")}</dd>
          </div>
          <div>
            <dt className="text-base font-semibold leading-6 text-gray-900">
              {t("gyms.fit.no_title")}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-gray-600">{t("gyms.fit.no_body")}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Monday read — the data axis
// ---------------------------------------------------------------------------

function MondayRead() {
  const points: { title: string; body: string }[] = [
    { title: t("gyms.data.p1_title"), body: t("gyms.data.p1_body") },
    { title: t("gyms.data.p2_title"), body: t("gyms.data.p2_body") },
    { title: t("gyms.data.p3_title"), body: t("gyms.data.p3_body") },
  ];
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("gyms.data.kicker")}</Kicker>
        <SectionTitle>{t("gyms.data.title")}</SectionTitle>

        {/*
          Le panneau est apparié à l'INTRO, pas à la section entière — même
          arbitrage que `OneToOneNote` sur `/`, et pour la même raison mesurée:
          apparié aux trois points, il laissait ~350px de colonne gauche vide,
          parce que la maquette du lundi est plus haute que les trois
          paragraphes. Les points passent donc en pleine largeur en dessous.
        */}
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16">
          <p className="max-w-xl text-base leading-7 text-gray-600">
            {t("gyms.data.body")}
          </p>
          <MondayPanel />
        </div>

        <dl className="mt-10 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-3 sm:gap-10">
          {points.map((point) => (
            <div key={point.title}>
              <dt className="text-base font-semibold leading-6 text-gray-900">
                {point.title}
              </dt>
              <dd className="mt-2 text-sm leading-6 text-gray-600">{point.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/**
 * Schematic of the Monday page, in the order the synthesis itself renders
 * (`_shared/keel/coach_synthesis.ts`): CONTACT, then LIVABILITY, then what the
 * members set themselves.
 *
 * NO RISK BANDS AND NO "ON TRACK: 22" TILE. Those came from the adherence
 * evaluator, which migration 20260803200000 unplugged from the 1:N path —
 * showing them would advertise a grade nobody computes, on a compliance
 * dashboard we deliberately removed, to the one buyer most likely to want one.
 *
 * The labels are `gyms.*`-scoped rather than borrowed from `coach.dashboard.*`
 * or from `landing.mock.*`: the first still carries pre-pivot adherence
 * vocabulary, and the second belongs to a page that will be edited by somebody
 * who is not thinking about this one.
 */
function MondayPanel() {
  return (
    <div className="w-full lg:w-80">
      <Card padded={false} className="shadow-sm">
        <header className="border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">
            {t("gyms.mock.monday_title")}
          </div>
          <div className="text-xs text-gray-500">{t("gyms.mock.monday_subtitle")}</div>
        </header>

        <PanelBlock label={t("gyms.mock.contact_label")}>
          <ul className="divide-y divide-gray-100">
            <ContactRow
              tone="positive"
              label={t("gyms.mock.contact_responsive")}
              hint={t("gyms.mock.contact_responsive_hint")}
              count={26}
            />
            <ContactRow
              tone="caution"
              label={t("gyms.mock.contact_slipping")}
              hint={t("gyms.mock.contact_slipping_hint")}
              count={7}
            />
            <ContactRow
              tone="critical"
              label={t("gyms.mock.contact_silent")}
              hint={t("gyms.mock.contact_silent_hint")}
              count={4}
            />
          </ul>
          {/* L'ALERTE PRÉCOCE, DITE SUR LA LIGNE ELLE-MÊME. C'est le seul
              endroit de la page où le chiffre du milieu devient une action, et
              il doit se lire sans quitter le panneau. */}
          <p className="mt-3 text-xs leading-5 text-gray-500">
            {t("gyms.mock.slipping_note")}
          </p>
        </PanelBlock>

        <PanelBlock label={t("gyms.mock.felt_label")}>
          <LivabilityUnits />
          <p className="mt-3 text-xs leading-5 text-gray-500">
            {t("gyms.mock.felt_caption")}
          </p>
        </PanelBlock>

        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
            {t("gyms.mock.intent_label")}
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            {t("gyms.mock.intent_line")}
          </p>
        </div>
      </Card>
      <p className="mt-3 text-xs leading-5 text-gray-500">{t("gyms.mock.caption")}</p>
    </div>
  );
}

/** Tones are the Badge kit's, used here as a stripe: state read before it is read. */
const STRIPE: Record<string, string> = {
  positive: "bg-emerald-500",
  caution: "bg-amber-500",
  critical: "bg-red-500",
  neutral: "bg-gray-300",
};

function ContactRow({
  tone,
  label,
  hint,
  count,
}: {
  tone: keyof typeof STRIPE;
  label: string;
  hint: string;
  count: number;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={`h-8 w-1 shrink-0 rounded-full ${STRIPE[tone]}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
      <span className="text-base font-semibold tabular-nums text-gray-900">{count}</span>
    </li>
  );
}

/**
 * The week's livability, one cell per member.
 *
 * WHY CELLS AND NOT A PROPORTIONAL BAR: a stacked bar's grammar is share, and a
 * share is one short step from the percentage this product refuses to print.
 * Cells are countable, so `unknown` reads as six people we will not vouch for
 * rather than as a thin slice of nothing.
 *
 * Colour is state (Badge tones) and never travels alone — every group is
 * direct-labelled underneath with its word and its count. The counts sum to the
 * same 37 as the contact block above and as the hero's worked example: a
 * schematic that disagrees with itself is read as a mock-up, which is exactly
 * what we are trying not to look like.
 */
const LIVABILITY: { key: string; label: MessageKey; count: number; cell: string }[] = [
  {
    key: "sustainable",
    label: "gyms.mock.felt_sustainable",
    count: 20,
    cell: "bg-emerald-500",
  },
  { key: "strained", label: "gyms.mock.felt_strained", count: 8, cell: "bg-amber-500" },
  { key: "hard", label: "gyms.mock.felt_hard", count: 3, cell: "bg-red-500" },
  {
    key: "unknown",
    label: "gyms.mock.felt_unknown",
    count: 6,
    // Not a colour with an opinion: we are declining to say, so the cell is a
    // hollow ring rather than a filled state. Solid, not dashed — a dashed
    // border on a 10px circle renders as fuzz, which reads as a rendering bug
    // rather than as a deliberate absence.
    cell: "border-2 border-gray-400 bg-white",
  },
];

function LivabilityUnits() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {LIVABILITY.map((band) => (
          <div
            key={band.key}
            className="flex flex-wrap gap-1"
            role="img"
            aria-label={`${band.count} ${t(band.label)}`}
          >
            {Array.from({ length: band.count }).map((_, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${band.cell}`} />
            ))}
          </div>
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1">
        {LIVABILITY.map((band) => (
          <div key={band.key} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${band.cell}`} aria-hidden="true" />
            <dt className="min-w-0 flex-1 truncate text-xs text-gray-600">{t(band.label)}</dt>
            <dd className="text-xs font-semibold tabular-nums text-gray-900">{band.count}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The double lock — the page's one dark block
// ---------------------------------------------------------------------------

/**
 * The strongest argument the product has, and the only one a competitor cannot
 * copy in a weekend: the method is injected into the prompt AND verified
 * deterministically on every outgoing message (`_shared/keel/doctrine.ts`).
 *
 * ONE THING IS SAID DIFFERENTLY HERE THAN ON `/`, and it is the close. There,
 * the argument is that "ask your coach" points at a door which doesn't exist —
 * a masterclass has no one-to-one channel. In a gym that door EXISTS: the coach
 * is in the room, forty hours a week. So the close is about the hour instead of
 * the door — 9pm on a Tuesday, when the member is in their kitchen and the owner
 * is at home. Reusing the masterclass sentence here would have been an argument
 * this reader can refute from his own front desk.
 *
 * The trace shows the mechanism instead of asserting it. Badge is not used: its
 * tones are built for light surfaces, and a `bg-red-50` chip on gray-950 would
 * be a bright block. Same semantics, restated for this ground.
 */
function DoubleLock() {
  return (
    <section className="border-b border-gray-200 bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {t("gyms.diff.kicker")}
        </p>
        <h2 className="mt-2 max-w-3xl text-balance text-2xl font-semibold leading-tight sm:text-3xl">
          {t("gyms.diff.title")}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
          {t("gyms.diff.body")}
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          {/*
            The closing line lives in this column rather than full-width under
            both: the trace is a good deal taller than the two locks, and a
            full-width close left a void the size of a paragraph under them.
          */}
          <div className="grid content-start gap-6">
            <dl className="grid gap-6">
              <div className="border-l-2 border-gray-700 pl-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {t("gyms.diff.lock1_tag")}
                </dt>
                <dd className="mt-2 text-base leading-7 text-gray-200">
                  {t("gyms.diff.lock1")}
                </dd>
              </div>
              <div className="border-l-2 border-emerald-400 pl-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
                  {t("gyms.diff.lock2_tag")}
                </dt>
                <dd className="mt-2 text-base leading-7 text-white">
                  {t("gyms.diff.lock2")}
                </dd>
              </div>
            </dl>
            <p className="mt-2 max-w-md text-balance text-lg font-medium leading-8 text-white">
              {t("gyms.diff.close")}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              {t("gyms.diff.trace_label")}
            </div>
            <p className="mt-1 text-xs text-gray-500">{t("gyms.diff.trace_example")}</p>

            <ol className="mt-4 grid gap-3">
              <TraceStep label={t("gyms.diff.trace_ask")} tone="neutral">
                {t("gyms.diff.trace_ask_text")}
              </TraceStep>
              <TraceStep
                label={t("gyms.diff.trace_draft")}
                tone="held"
                chip={t("gyms.diff.trace_held")}
              >
                {t("gyms.diff.trace_draft_text")}
              </TraceStep>
              <TraceStep label={t("gyms.diff.trace_sent")} tone="sent">
                {t("gyms.diff.trace_sent_text")}
              </TraceStep>
            </ol>

            <p className="mt-4 text-sm leading-6 text-gray-400">
              {t("gyms.diff.trace_note")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TraceStep({
  label,
  tone,
  chip,
  children,
}: {
  label: string;
  tone: "neutral" | "held" | "sent";
  chip?: string;
  children: React.ReactNode;
}) {
  const frame =
    tone === "held"
      ? "border-red-500/60 bg-red-500/5"
      : tone === "sent"
        ? "border-emerald-400/60 bg-emerald-400/5"
        : "border-gray-800 bg-gray-900";
  // The held draft is struck through, but it still has to be READABLE — the
  // whole point is that the owner can see what was about to go out under his
  // name.
  const body =
    tone === "held" ? "text-gray-400 line-through decoration-red-400/70" : "text-gray-100";
  return (
    <li className={`rounded-xl border-l-2 border-y border-r ${frame} px-4 py-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
        {chip ? (
          <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[0.6875rem] font-medium text-red-300">
            {chip}
          </span>
        ) : null}
      </div>
      <p className={`mt-1.5 text-base leading-7 ${body}`}>{children}</p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Doctrine
// ---------------------------------------------------------------------------

/**
 * The three rules, and then the refusal.
 *
 * THE CALORIE CARD MATTERS MORE ON THIS PAGE THAN ON `/`: a gym is the buyer
 * most likely to arrive expecting macros on a scale, so he has to meet the
 * refusal before he pays rather than after.
 *
 * ⚠️ ET IL S'ARRÊTE LÀ. Une version de cette carte se terminait par « si ta
 * méthode est macro-first, on n'est pas faits l'un pour l'autre ». RETIRÉE, et
 * ne pas la réécrire: elle confondait une LIMITE DE L'OUTIL avec un jugement
 * sur la méthode du coach. Sophia ne sait pas compter les calories depuis une
 * photo — c'est mesuré, c'est notre problème, et ça ne dit rien de ce que le
 * propriétaire a le droit de croire. S'il pèse ses grammes, c'est SA méthode;
 * cette page n'a aucune autorité pour l'en disqualifier, et la carte dit déjà
 * exactement ce que le produit fait et ne fait pas.
 */
function Doctrine() {
  const rules: { title: string; body: string }[] = [
    { title: t("gyms.doctrine.rule1_title"), body: t("gyms.doctrine.rule1_body") },
    { title: t("gyms.doctrine.rule2_title"), body: t("gyms.doctrine.rule2_body") },
    { title: t("gyms.doctrine.rule3_title"), body: t("gyms.doctrine.rule3_body") },
  ];
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("gyms.doctrine.kicker")}</Kicker>
        <SectionTitle>{t("gyms.doctrine.title")}</SectionTitle>
        <dl className="mt-8 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-3 sm:gap-10">
          {rules.map((rule) => (
            <div key={rule.title}>
              <dt className="text-base font-semibold leading-6 text-gray-900">{rule.title}</dt>
              <dd className="mt-2 text-sm leading-6 text-gray-600">{rule.body}</dd>
            </div>
          ))}
        </dl>
        <Card tone="dashed" className="mt-10 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {t("gyms.doctrine.no_calories_title")}
          </h3>
          <div className="mt-3 grid max-w-4xl gap-4 text-sm leading-6 text-gray-600 sm:grid-cols-2 sm:gap-8">
            <p>{t("gyms.doctrine.no_calories_body")}</p>
            <p>{t("gyms.doctrine.no_calories_body2")}</p>
          </div>
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * ONE CARD, AND THAT IS THE MESSAGE — same call as `/` since migration
 * 20260806170000 made the billable seat the ENROLLED member rather than the
 * active one. Two cards force the prospect to do arithmetic, and arithmetic on a
 * pricing section is where a deal goes to think about it.
 *
 * The annual rate is a line under the card, not a second card: it is a one-euro
 * discount on the same product, and a "Plans" grid built around it would suggest
 * there is a decision to make here.
 *
 * `billing_note` is not fine print. There is no member SKU in
 * `stripe-create-checkout-session`, so Sophia cannot take the member's money and
 * never will on this path — the owner charges them himself. A gym that assumed
 * otherwise from the worked example finds out at setup, and that is a pilot
 * lost.
 */
function Pricing() {
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("gyms.pricing.kicker")}</Kicker>
        <SectionTitle>{t("gyms.pricing.title")}</SectionTitle>
        <div className="mt-8 sm:max-w-sm">
          <PriceCard
            price={t("gyms.pricing.seat")}
            period={t("gyms.pricing.seat_period")}
            label={t("gyms.pricing.seat_label")}
          />
          <p className="mt-3 text-sm leading-6 text-gray-600">{t("gyms.pricing.annual")}</p>
        </div>
        <p className="mt-6 max-w-2xl text-base leading-7 text-gray-600">
          {t("gyms.pricing.why")}
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-500">
          {t("gyms.pricing.billing_note")}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
            {t("gyms.pricing.cta")}
          </ButtonLink>
          <span className="text-sm text-gray-500">{t("gyms.pricing.trial_note")}</span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Closing call
// ---------------------------------------------------------------------------

function ClosingCall() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="mx-auto max-w-2xl text-balance text-2xl font-semibold leading-tight sm:text-3xl">
          {t("gyms.closing.title")}
        </h2>
        <div className="mt-8 flex justify-center">
          <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
            {t("gyms.closing.cta")}
          </ButtonLink>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          {t("gyms.closing.signin_prompt")}{" "}
          <Link to="/auth" className="font-medium text-gray-900 underline">
            {t("gyms.closing.signin_link")}
          </Link>
        </p>
      </div>
    </section>
  );
}

export default GymsLandingPage;
