import React from "react";
import { Navigate } from "react-router-dom";
import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { resolveHomePath, type HomePath } from "../api/postLogin";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Badge } from "../components/ui/Badge";
import { ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { t } from "../i18n/t";

/**
 * KEEL — the public landing. Written for the COACH: they pay, they decide.
 * A student never arrives here — they enter through their coach's invitation
 * (/join). So every section answers a practitioner's question, in order:
 * what is this, why do I care, how does it work, why you, what does it cost.
 *
 * A signed-in visitor does not belong on a sales page: they are routed to
 * their space (coach workspace / student app / legacy dashboard) the moment
 * their role resolves. The landing renders meanwhile so the redirect is a
 * navigation, never a blank screen.
 *
 * NOTHING here promises what the product refuses to do: no calorie analysis
 * (sold as a position, see the doctrine section), no integrations, no native
 * app. The product mocks below are schematic renderings of the real screens —
 * real labels from the app's own i18n, grey bars where a name would be.
 */

export function LandingPage() {
  const { user } = useAuth();
  const [dest, setDest] = React.useState<HomePath | null>(null);

  const userId = user?.id ?? null;
  React.useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setDest(null);
      return;
    }
    resolveHomePath(userId).then((path) => {
      if (!cancelled) setDest(path);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (userId && dest) {
    return <Navigate to={dest} replace />;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <SEO
        title={t("landing.seo_title")}
        description={t("landing.seo_description")}
        canonical="https://sophia-coach.ai/"
        lang="en"
        structuredData={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Sophia",
            url: "https://sophia-coach.ai/",
            logo: "https://sophia-coach.ai/apple-touch-icon.png",
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Sophia",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://sophia-coach.ai/",
            description: t("landing.seo_description"),
            inLanguage: "en-US",
          },
        ]}
      />

      <PublicHeader />

      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Difference />
        <Doctrine />
        <Pricing />
        <ClosingCall />
      </main>

      <PublicFooter />
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">
      {children}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
        <div>
          <Kicker>{t("landing.hero.kicker")}</Kicker>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t("landing.hero.title")}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-7 text-gray-600">
            {t("landing.hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
              {t("landing.hero.cta_trial")}
            </ButtonLink>
            <ButtonLink to="/auth" variant="secondary" className="px-6 py-3 text-base">
              {t("landing.hero.cta_signin")}
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-gray-500">{t("landing.hero.note")}</p>
        </div>
        <MondayMock />
      </div>
    </section>
  );
}

/**
 * Schematic rendering of the coach's Monday view. Labels are the product's own
 * (risk states, the insufficient-data gate); names are grey bars because no
 * client here is real and none is pretended to be.
 */
function MondayMock() {
  return (
    <Card padded={false} className="shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="text-sm font-semibold text-gray-900">
          {t("landing.mock.monday_title")}
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("landing.mock.needs_attention")}
        </div>
        <ul className="mt-2 divide-y divide-gray-100">
          <MockRow barWidth="w-28">
            <Badge tone="caution">{t("coach.dashboard.risk.at_risk")}</Badge>
          </MockRow>
          <MockRow barWidth="w-20">
            <Badge tone="neutral">{t("coach.dashboard.insufficient_data")}</Badge>
          </MockRow>
          <MockRow barWidth="w-24">
            <Badge tone="critical">{t("coach.dashboard.risk.disengaged")}</Badge>
          </MockRow>
        </ul>
      </div>
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("landing.mock.on_track")}
          </div>
          <Badge tone="positive">22</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Array.from({ length: 22 }).map((_, i) => (
            <span key={i} className="h-2 w-6 rounded-full bg-emerald-100" />
          ))}
        </div>
      </div>
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("landing.mock.student_today")}
        </div>
        <div className="mt-2 space-y-2">
          <div className="ml-8 rounded-lg rounded-br-sm bg-gray-900 p-2 text-xs leading-5 text-white">
            <MockPlatePhoto />
            <p className="mt-1.5 px-1">{t("landing.mock.chat_student")}</p>
          </div>
          <div className="mr-8 rounded-lg rounded-bl-sm border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-700">
            {t("landing.mock.chat_sophia")}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Schematic stand-in for the photo a client sends on WhatsApp. Deliberately NOT
 * a photograph: a real plate picture here would read as a customer's actual
 * meal, and we show no data we do not have. The two shapes are the two food
 * groups Sophia names back in the reply — greens and a protein — so the mock
 * and the answer describe the same plate.
 */
function MockPlatePhoto() {
  return (
    <div
      role="img"
      aria-label={t("landing.mock.photo_alt")}
      className="flex aspect-[4/3] w-40 max-w-full items-center justify-center rounded-md bg-gray-700"
    >
      <div className="relative h-20 w-20 rounded-full bg-gray-200">
        <span className="absolute left-2 top-4 h-12 w-7 rounded-full bg-emerald-300" />
        <span className="absolute right-2.5 top-6 h-8 w-8 rounded-md bg-amber-200" />
      </div>
    </div>
  );
}

function MockRow({
  barWidth,
  children,
}: {
  barWidth: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 rounded-full bg-gray-200" />
        <span className={`h-2.5 ${barWidth} rounded-full bg-gray-200`} />
      </div>
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Problem
// ---------------------------------------------------------------------------

function Problem() {
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("landing.problem.kicker")}</Kicker>
        <SectionTitle>{t("landing.problem.title")}</SectionTitle>
        <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
          {t("landing.problem.body")}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            value={t("landing.problem.stat1_value")}
            label={t("landing.problem.stat1_label")}
          />
          <StatCard
            value={t("landing.problem.stat2_value")}
            label={t("landing.problem.stat2_label")}
          />
          <StatCard
            value={t("landing.problem.stat3_value")}
            label={t("landing.problem.stat3_label")}
          />
        </div>
        <p className="mt-8 max-w-2xl text-base font-medium leading-7 text-gray-900">
          {t("landing.problem.close")}
        </p>
      </div>
    </section>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <Card>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <p className="mt-2 text-sm leading-6 text-gray-600">{label}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

function HowItWorks() {
  const steps: { title: string; body: string }[] = [
    { title: t("landing.how.step1_title"), body: t("landing.how.step1_body") },
    { title: t("landing.how.step2_title"), body: t("landing.how.step2_body") },
    { title: t("landing.how.step3_title"), body: t("landing.how.step3_body") },
  ];
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("landing.how.kicker")}</Kicker>
        <SectionTitle>{t("landing.how.title")}</SectionTitle>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title}>
              <Card className="h-full">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                  {i + 1}
                </div>
                <h3 className="mt-3 text-base font-semibold text-gray-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Difference
// ---------------------------------------------------------------------------

function Difference() {
  const points: string[] = [
    t("landing.diff.point1"),
    t("landing.diff.point2"),
    t("landing.diff.point3"),
  ];
  return (
    <section className="border-b border-gray-200 bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {t("landing.diff.kicker")}
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">
          {t("landing.diff.title")}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
          {t("landing.diff.body")}
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3">
          {points.map((point) => (
            <li
              key={point}
              className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm leading-6 text-gray-200"
            >
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Doctrine
// ---------------------------------------------------------------------------

function Doctrine() {
  const rules: { title: string; body: string }[] = [
    {
      title: t("landing.doctrine.rule1_title"),
      body: t("landing.doctrine.rule1_body"),
    },
    {
      title: t("landing.doctrine.rule2_title"),
      body: t("landing.doctrine.rule2_body"),
    },
    {
      title: t("landing.doctrine.rule3_title"),
      body: t("landing.doctrine.rule3_body"),
    },
  ];
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("landing.doctrine.kicker")}</Kicker>
        <SectionTitle>{t("landing.doctrine.title")}</SectionTitle>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {rules.map((rule) => (
            <Card key={rule.title} className="h-full">
              <h3 className="text-base font-semibold text-gray-900">{rule.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{rule.body}</p>
            </Card>
          ))}
        </div>
        <Card tone="dashed" className="mt-4">
          <h3 className="text-base font-semibold text-gray-900">
            {t("landing.doctrine.no_calories_title")}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            {t("landing.doctrine.no_calories_body")}
          </p>
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function Pricing() {
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("landing.pricing.kicker")}</Kicker>
        <SectionTitle>{t("landing.pricing.title")}</SectionTitle>
        <div className="mt-8 grid gap-4 sm:max-w-2xl sm:grid-cols-2">
          <Card>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold text-gray-900">
                {t("landing.pricing.base")}
              </span>
              <span className="text-sm text-gray-500">
                {t("landing.pricing.base_period")}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-900">
              {t("landing.pricing.base_label")}
            </p>
          </Card>
          <Card>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold text-gray-900">
                {t("landing.pricing.seat")}
              </span>
              <span className="text-sm text-gray-500">
                {t("landing.pricing.seat_period")}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-900">
              {t("landing.pricing.seat_label")}
            </p>
          </Card>
        </div>
        <p className="mt-6 max-w-2xl text-base leading-7 text-gray-600">
          {t("landing.pricing.why")}
        </p>
        <div className="mt-8">
          <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
            {t("landing.pricing.cta")}
          </ButtonLink>
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
        <h2 className="mx-auto max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">
          {t("landing.closing.title")}
        </h2>
        <div className="mt-8 flex justify-center">
          <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
            {t("landing.closing.cta")}
          </ButtonLink>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          {t("landing.closing.signin_prompt")}{" "}
          <a href="/auth" className="font-medium text-gray-900 underline">
            {t("landing.closing.signin_link")}
          </a>
        </p>
      </div>
    </section>
  );
}

export default LandingPage;
