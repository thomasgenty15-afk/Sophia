import React from "react";
import { Link, Navigate } from "react-router-dom";
import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { LEGAL_ENTITY } from "../../lib/legalEntity";
import { localeHref } from "../i18n/links";
import { useSalesStructuredData } from "../seo/salesStructuredData";
import { resolveHomePath, type HomePath } from "../api/postLogin";
import { HomeCohabitationDemo } from "../components/HomeCohabitationDemo";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import ServerUnreachable from "../components/ServerUnreachable";
import { AccidentsFigure } from "../components/ui/AccidentsFigure";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, SectionTitle } from "../components/ui/Marketing";
import { OfferLines } from "../components/ui/OfferLines";
import { StickyCta } from "../components/ui/StickyCta";
import { t, type MessageKey } from "../i18n/t";

/**
 * `/` est un hall : il explique la promesse commune, puis oriente vers la page
 * qui développe la bonne situation. Les pages `/meal-prep`, `/couples` et
 * `/families` restent les pages de vente spécialisées.
 */


const DOORS: ReadonlyArray<{
  to: string;
  who: MessageKey;
  label: MessageKey;
  gain: MessageKey;
}> = [
  { to: "/meal-prep", who: "home.door.solo.who", label: "home.door.solo.label", gain: "home.door.solo.gain" },
  { to: "/couples", who: "home.door.pair.who", label: "home.door.pair.label", gain: "home.door.pair.gain" },
  { to: "/families", who: "home.door.family.who", label: "home.door.family.label", gain: "home.door.family.gain" },
];

const Section = ({ children, tone = "paper" }: { children: React.ReactNode; tone?: "paper" | "alt" }) => (
  <section className={tone === "alt" ? "bg-paper-2" : ""}>
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">{children}</div>
  </section>
);

function ArgumentHeading({ number, kicker, title, body }: {
  number: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-label font-semibold uppercase tracking-[0.12em] text-fig-700">{number} · {kicker}</p>
      <h3 className="mt-3 max-w-[20ch] text-balance font-display text-title text-ink">{title}</h3>
      <p className="mt-5 max-w-[58ch] text-[16px] leading-7 text-ink-soft">{body}</p>
    </div>
  );
}

function OrganizationFigure() {
  const steps = [
    ["home.organize.figure.meals", "home.organize.figure.meals_note"],
    ["home.organize.figure.cooking", "home.organize.figure.cooking_note"],
    ["home.organize.figure.shopping", "home.organize.figure.shopping_note"],
  ] as const;

  return (
    <figure className="rounded-fiche border border-line bg-paper-2 p-5 sm:p-6">
      <figcaption className="eq text-label font-semibold uppercase text-ink-soft">{t("home.organize.figure.label")}</figcaption>
      <ol className="mt-6">
        {steps.map(([title, note], index) => (
          <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
            <span className="flex size-8 items-center justify-center rounded-full border border-fig-600 text-[13px] font-semibold text-fig-700">{index + 1}</span>
            <div className="min-w-0">
              <p className="font-medium text-ink">{t(title)}</p>
              <p className="mt-1 text-[13px] leading-5 text-ink-soft">{t(note)}</p>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function BalanceFigure() {
  const parts = [
    ["home.balance.figure.protein", "bg-fig-700 text-paper"],
    ["home.balance.figure.starch", "bg-fig-100 text-fig-900"],
    ["home.balance.figure.vegetables", "bg-paper-2 text-ink"],
  ] as const;

  return (
    <figure className="rounded-fiche border border-line bg-paper p-5 sm:p-6">
      <figcaption className="eq text-label font-semibold uppercase text-ink-soft">{t("home.balance.figure.label")}</figcaption>
      <div className="mt-6 overflow-hidden rounded border border-line sm:flex">
        {parts.map(([label, className]) => (
          <div key={label} className={`${className} flex min-h-24 flex-1 items-end border-t border-line p-4 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0`}>
            <span className="text-[13px] font-semibold uppercase tracking-[0.08em]">{t(label)}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] leading-5 text-ink-soft">{t("home.balance.figure.note")}</p>
    </figure>
  );
}

const BENEFITS = [
  { number: "01", kicker: "home.sessions.pain", title: "home.sessions.title", body: "home.sessions.body" },
  { number: "02", kicker: "home.balance.pain", title: "home.balance.title", body: "home.balance.body" },
  { number: "03", kicker: "home.cohabit.kicker", title: "home.cohabit.title", body: "home.cohabit.body" },
  { number: "04", kicker: "home.chat.pain", title: "home.chat.title", body: "home.chat.body" },
] as const satisfies ReadonlyArray<{
  number: string;
  kicker: MessageKey;
  title: MessageKey;
  body: MessageKey;
}>;

function BenefitVisual({ index }: { index: number }) {
  if (index === 0) return <OrganizationFigure />;
  if (index === 1) return <BalanceFigure />;
  if (index === 2) return <HomeCohabitationDemo />;
  return (
    <div className="fig-scroll" tabIndex={0} role="group" aria-labelledby="home-accidents-t">
      <AccidentsFigure
        idPrefix="home-accidents"
        label={t("home.adapt.figure.label")}
        title={t("home.adapt.figure.title")}
        desc={t("home.adapt.figure.desc")}
        mealLabel={t("home.adapt.figure.meal")}
        sessionLabel={t("home.adapt.figure.session")}
        shoppingLabel={t("home.adapt.figure.shopping")}
      />
    </div>
  );
}

function BenefitsExplorer() {
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);

  React.useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) setPaused(true);
  }, []);

  React.useEffect(() => {
    if (paused || hovered || focusWithin) return;
    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % BENEFITS.length);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [active, paused, hovered, focusWithin]);

  const moveSelection = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % BENEFITS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + BENEFITS.length) % BENEFITS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = BENEFITS.length - 1;
    else return;

    event.preventDefault();
    setActive(next);
    document.getElementById(`home-benefit-tab-${next}`)?.focus();
  };

  return (
    <Section tone="alt">
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Kicker>{t("home.fiche.kicker")}</Kicker>
          <div className="max-w-[46rem]"><SectionTitle>{t("home.arguments.title")}</SectionTitle></div>
        </div>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-fig-600 bg-paper px-4 py-2 text-[13px] font-semibold text-fig-900 transition-colors hover:bg-fig-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fig-700"
        >
          <span aria-hidden="true" className="text-[11px]">{paused ? "▶" : "Ⅱ"}</span>
          {t(paused ? "home.benefits.resume" : "home.benefits.pause")}
        </button>
      </div>

      <div
        className="mt-8 overflow-hidden rounded-fiche border border-line bg-paper shadow-[0_18px_50px_rgba(42,28,35,0.05)] sm:mt-10"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocusWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
        }}
      >
        <div role="tablist" aria-label={t("home.arguments.title")} className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-4">
          {BENEFITS.map((benefit, index) => {
            const selected = active === index;
            return (
              <button
                key={benefit.number}
                id={`home-benefit-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`home-benefit-panel-${index}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(index)}
                onKeyDown={(event) => moveSelection(event, index)}
                className={`group min-h-24 px-4 py-4 text-left transition-colors ${
                  selected ? "bg-fig-700 text-paper" : "bg-paper text-ink hover:bg-fig-50"
                }`}
              >
                <span className={`block text-[12px] font-semibold tracking-[0.14em] ${selected ? "text-fig-100" : "text-fig-700"}`}>
                  {benefit.number}
                </span>
                <span className="mt-2 block text-[13px] font-semibold uppercase leading-5 tracking-[0.08em]">
                  {t(benefit.kicker)}
                </span>
              </button>
            );
          })}
        </div>

        {BENEFITS.map((benefit, index) => (
          <div
            key={benefit.number}
            id={`home-benefit-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`home-benefit-tab-${index}`}
            hidden={active !== index}
            className="p-5 sm:p-8 lg:p-10"
          >
            {index === 2 ? (
              <>
                <ArgumentHeading number={benefit.number} kicker={t(benefit.kicker)} title={t(benefit.title)} body={t(benefit.body)} />
                <div className="mt-8"><BenefitVisual index={index} /></div>
              </>
            ) : (
              <div className="grid items-center gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12">
                <ArgumentHeading number={benefit.number} kicker={t(benefit.kicker)} title={t(benefit.title)} body={t(benefit.body)} />
                <BenefitVisual index={index} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [dest, setDest] = React.useState<HomePath | null>(null);
  const [unreachable, setUnreachable] = React.useState(false);
  const userId = user?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    setUnreachable(false);
    if (!userId) {
      setDest(null);
      return;
    }
    resolveHomePath(userId).then((path) => {
      if (cancelled) return;
      if (path === null) {
        setUnreachable(true);
        return;
      }
      setDest(path);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // ⚠️ AVANT LES DEUX RETOURS ANTICIPÉS: un hook appelé après un `return`
  // conditionnel ne s'exécute pas au même rendu, et React refuse.
  const structuredData = useSalesStructuredData("/", t("home.seo_description"));

  if (userId && unreachable) return <ServerUnreachable />;
  if (userId && dest) return <Navigate to={dest} replace />;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO title={t("home.seo_title")} description={t("home.seo_description")} canonical={`${LEGAL_ENTITY.siteUrl}/`} structuredData={structuredData} />
      <PublicHeader />

      <main>
        <Section>
          <div className="grid items-start gap-10 lg:grid-cols-[0.94fr_1.06fr] lg:gap-14">
            <div className="min-w-0 pt-1">
              <Kicker>{t("home.hero.kicker")}</Kicker>
              <h1 className="mt-4 max-w-[15ch] text-balance font-display text-hero">{t("home.hero.title")}</h1>
              <p className="mt-6 max-w-[48ch] text-lede text-ink-soft">{t("home.hero.lede")}</p>
            </div>

            <nav aria-label={t("home.doors.aria_label")} className="rounded-fiche border border-line bg-paper-2 p-4 sm:p-5">
              <p className="eq text-label font-semibold uppercase text-ink-soft">{t("home.doors.title")}</p>
              <ul className="mt-4 overflow-hidden rounded border border-line bg-paper">
                {DOORS.map((door) => (
                  <li key={door.to} className="border-t border-line first:border-t-0">
                    <Link to={localeHref(door.to)} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4 transition-colors hover:bg-fig-50 sm:p-5">
                      <span className="min-w-0">
                        <span className="block text-label font-semibold uppercase text-fig-700">{t(door.who)}</span>
                        <span className="mt-1 block font-display text-[1.15rem] leading-snug text-ink group-hover:underline">{t(door.label)}</span>
                        <span className="mt-1.5 block text-[13px] leading-5 text-ink-soft">{t(door.gain)}</span>
                      </span>
                      <span aria-hidden="true" className="text-xl text-fig-700 transition-transform group-hover:translate-x-1">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] leading-5 text-ink-soft">{t("home.doors.lede")}</p>
            </nav>
          </div>

        </Section>

        <BenefitsExplorer />

        <Section>
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_auto] lg:gap-14">
            <div>
              <SectionTitle>{t("home.close.title")}</SectionTitle>
              <p className="mt-5 max-w-[62ch] leading-7 text-ink-soft">{t("home.close.body")}</p>
              <OfferLines className="mt-6" />
            </div>
            <div className="lg:pt-2">
              <ButtonLink to="/start" variant="brand" className="px-6 py-3 text-[1rem]">{t("home.close.cta")}</ButtonLink>
            </div>
          </div>
        </Section>
      </main>

      <PublicFooter />
      <StickyCta label={t("home.hero.cta")} />
    </div>
  );
}

export default HomePage;
