import React from "react";
import { Link, Navigate } from "react-router-dom";
import SEO from "../../components/SEO";
import { useAuth } from "../../context/AuthContext";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { resolveHomePath, type HomePath } from "../api/postLogin";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import ServerUnreachable from "../components/ServerUnreachable";
import { ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
// Kicker / SectionTitle / PriceCard were defined in this file while it was the
// only sales page. `/gyms` is the second one, so they moved to the UI folder —
// one definition, two pages. See the header of `ui/Marketing.tsx`.
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t, type MessageKey } from "../i18n/t";

/**
 * KEEL — the public landing. Written for the COACH: they pay, they decide.
 * A student never arrives here — they enter through their coach's invitation
 * (/join). So every section answers a practitioner's question, in order:
 * what is this, why do I care, how does it work, why trust it, what does it cost.
 *
 * A signed-in visitor does not belong on a sales page: they are routed to
 * their space (coach workspace / student app / account) the moment their role
 * resolves. The landing renders meanwhile so the redirect is a navigation,
 * never a blank screen. If the role cannot be resolved AT ALL — the backend is
 * unreachable — they get the connection-lost screen instead: routing on no
 * facts is what once dropped a student into the legacy consumer account page.
 *
 * ── THE MODEL THIS PAGE SELLS (pivot nutrition, 2026-08-03) ───────────────
 * A masterclass, not a one-to-one practice: the coach teaches a method, the
 * student decides, nobody is graded. There is NO one-to-one channel from a
 * student back to their coach, and that absence is the product, not a gap —
 * so nothing here may hint at an inbox, a reply queue, or a "your coach will
 * get back to you". The vocabulary is students / cohort / your method / your
 * voice; never "your client", never "personalised follow-up".
 *
 * The student DOES have a web space, and it is not a detail: /app/plan is where
 * they compose their own week out of the coach's method (Sophia drafts, they
 * adopt), /app/progress is where they look back. It is PULL, never push.
 *
 * The daily step went through three drafts on this exact point, so the lesson
 * is written down rather than re-learnt: it said "no dashboard to open" (which
 * deleted the whole surface in five words), then "nothing they have to
 * remember to open" (which still read as a denial on first pass), and it now
 * says what is THERE instead of what is absent. Do not reintroduce a
 * "nothing to open / nothing to install" of any shape: that sentence sits one
 * row above a section describing the thing it would be denying.
 *
 * "Nothing that arrives at night" also went, and that one was a FACTUAL error,
 * not a framing one. Quiet hours (21h-8h) live in `reengagement.ts` and cover
 * the nudge only; the evening tap fires on a 20h-22h local window
 * (`PULSE_HOUR_LOCAL`), so a tap can legitimately land at 21h50.
 *
 * NOTHING here promises what the product refuses to do, and — the harder
 * discipline — nothing here promises what the product has not yet PROVEN.
 * Concretely, the copy stays silent on: weight tracking (the write path and the
 * read path disagree) and the coach-side one-to-one inbox (there is none, by
 * design). Two silences have LIFTED since the de-whatsapp change: delivery no
 * longer depends on Meta approving a template, and the weekly six-axis form now
 * exists in the app (`WeeklyCheckInDialog`) instead of being a Flow object that
 * had never been created at Meta.
 * A pilot coach who discovers that gap after paying is a pilot coach lost.
 *
 * ── DESIGN NOTES ─────────────────────────────────────────────────────────
 * Light only, like the rest of the product.
 *
 * ⚠️ CE FICHIER A PORTÉ « AUCUNE TEINTE D'ACCENT » — CETTE RÈGLE EST PÉRIMÉE.
 * Elle disait: toute couleur saturée de cette page est un ÉTAT (émeraude /
 * ambre / rouge du kit Badge), et un accent de marque rendrait la décoration
 * indistinguable du sens sur une page dont l'argument est qu'elle rapporte au
 * lieu de décorer. La refonte du 2026-08-12 la RENVERSE en connaissance de
 * cause: la vitrine a une teinte de marque, `fig-700` (#632C4C, 325°).
 *
 * CE QUE LA RÈGLE PROTÉGEAIT RESTE VRAI: dans l'app, la couleur saturée
 * appartient au sens. La figue ne s'y confond pas parce qu'elle est loin des
 * quatre familles d'état (35° du rouge, 73° de l'ambre, 101° du bleu, 165° de
 * l'émeraude) ET parce qu'elle N'ENTRE JAMAIS DANS UNE PASTILLE. Ne retire pas
 * la couleur en croyant réparer: réécris le commentaire qui l'interdit.
 * Autorité: `scratchpad/site/design/CHARTE.md` §2.
 *
 * L'emphase vient de l'échelle typographique et du bloc sombre unique, dépensé
 * sur le double verrou — l'argument le plus fort et le moins visible.
 *
 * The section grounds encode register rather than alternating for rhythm:
 * white = the argument, gray-950 = the guarantee, gray-50 = the commercial
 * terms. The "how it works" eyebrows are the CADENCE (once / every day / every
 * Monday) rather than 1-2-3, because the asymmetry between recording a method
 * once and having it answer daily IS the pitch — a numbered pill would only
 * have said "there are three of them".
 */

// Hoisted out of the render: SEO holds `structuredData` in a useEffect
// dependency array, so an inline literal rebuilt the <script> tags on every
// render. t() is a static table lookup, so module scope is safe.
//
// The Organization node comes from `lib/legalEntity` rather than being spelled
// out here, because it is the SAME declaration /legal makes to humans. A store
// or registry verifier that lands on "/" must be able to read the company
// behind the domain without a second page load, and two hand-written copies of
// a VAT number is how they end up disagreeing.
const LANDING_STRUCTURED_DATA = [
  organizationStructuredData(),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Sophia",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${LEGAL_ENTITY.siteUrl}/`,
    description: t("landing.seo_description"),
    inLanguage: "en-GB",
    publisher: organizationStructuredData(),
  },
];

export function LandingPage() {
  const { user } = useAuth();
  const [dest, setDest] = React.useState<HomePath | null>(null);
  // `resolveHomePath` returning null means it read NOTHING — the backend is
  // unreachable. We must not navigate on that: the destination would be the
  // fallback page, which needs the same backend and renders empty. Say it
  // instead. A signed-out visitor never reaches this state; the sales page
  // below is static and stays served.
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
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (userId && unreachable) {
    return <ServerUnreachable />;
  }

  if (userId && dest) {
    return <Navigate to={dest} replace />;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <SEO
        title={t("landing.seo_title")}
        description={t("landing.seo_description")}
        canonical="https://sophia-coach.ai/"
        structuredData={LANDING_STRUCTURED_DATA}
      />

      <PublicHeader />

      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        {/*
          ICI, ET PAS AILLEURS. `HowItWorks` vient d'installer la cadence 1:N —
          « recorded once, answering all week », le coach n'écrit jamais par
          élève. La note est l'EXCEPTION à ce « once », donc elle se lit juste
          après, pendant que la règle est encore fraîche. Plus bas, elle
          ressemblerait à une feature de plus; plus haut, elle affaiblirait la
          promesse qu'elle nuance.

          Elle reste AVANT `DoubleLock`, qui garde son rôle de sommet: la
          section ci-dessous ajoute une entrée dans le prompt, et le lecteur
          doit rencontrer la garantie APRÈS avoir vu tout ce qui y entre.
        */}
        <OneToOneNote />
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
          <Kicker>{t("landing.hero.kicker")}</Kicker>
          <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            {t("landing.hero.title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600">
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
          <p className="mt-4 max-w-md text-sm leading-6 text-gray-500">
            {t("landing.hero.note")}
          </p>
          {/* LA PORTE LIBRE, ET ELLE EST DÉLIBÉRÉMENT DISCRÈTE.
              Cette page vend au COACH, qui paie: mettre « essayez
              gratuitement » à côté de « démarrez votre essai » ferait hésiter
              l'acheteur entre deux offres dont une seule le concerne. Mais un
              coach qui évalue le produit veut le VOIR avant d'inviter un client,
              et un testeur envoyé ici a besoin d'une porte. Une ligne de texte
              sous la note, pas un troisième bouton. */}
          <p className="mt-3 max-w-md text-sm leading-6 text-gray-500">
            {t("landing.hero.try_prompt")}{" "}
            <Link to="/start" className="font-medium text-gray-900 underline">
              {t("landing.hero.try_cta")}
            </Link>
          </p>
        </div>
        <MondayPanel />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Monday panel — the hero's thesis object
// ---------------------------------------------------------------------------

/**
 * Schematic of the coach's Monday page, in the order the synthesis itself
 * renders (`_shared/keel/coach_synthesis.ts`): CONTACT, then LIVABILITY, then
 * what the students set themselves.
 *
 * WHAT THIS PANEL USED TO SHOW, AND WHY IT HAD TO GO: risk bands ("at risk",
 * "disengaged") and an "on track: 22" tile. Those come from the adherence
 * evaluator, which migration 20260803200000 unplugged from the 1:N path — the
 * page's first visual was advertising a grade nobody computes any more, on a
 * compliance dashboard we deliberately removed.
 *
 * The labels are LANDING-scoped rather than borrowed from `coach.dashboard.*`.
 * That screen still carries the pre-pivot adherence vocabulary; pointing the
 * sales page at it would mean the landing silently changes meaning the day
 * someone fixes those keys.
 */
function MondayPanel() {
  return (
    <div>
      <Card padded={false} className="shadow-sm">
        <header className="border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">
            {t("landing.mock.monday_title")}
          </div>
          <div className="text-xs text-gray-500">{t("landing.mock.monday_subtitle")}</div>
        </header>

        <PanelBlock label={t("landing.mock.contact_label")}>
          <ul className="divide-y divide-gray-100">
            <ContactRow
              tone="positive"
              label={t("landing.mock.contact_responsive")}
              hint={t("landing.mock.contact_responsive_hint")}
              count={25}
            />
            <ContactRow
              tone="caution"
              label={t("landing.mock.contact_slipping")}
              hint={t("landing.mock.contact_slipping_hint")}
              count={6}
            />
            <ContactRow
              tone="critical"
              label={t("landing.mock.contact_silent")}
              hint={t("landing.mock.contact_silent_hint")}
              count={3}
            />
          </ul>
        </PanelBlock>

        <PanelBlock label={t("landing.mock.felt_label")}>
          <LivabilityUnits />
          <p className="mt-3 text-xs leading-5 text-gray-500">
            {t("landing.mock.felt_caption")}
          </p>
        </PanelBlock>

        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
            {t("landing.mock.intent_label")}
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            {t("landing.mock.intent_line")}
          </p>
        </div>
      </Card>
      <p className="mt-3 text-xs leading-5 text-gray-500">{t("landing.mock.caption")}</p>
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
 * The week's livability, one cell per student.
 *
 * WHY CELLS AND NOT A PROPORTIONAL BAR: a stacked bar's grammar is share, and
 * a share is one short step from the percentage this product refuses to print.
 * Cells are countable, so `unknown` reads as five people we will not vouch for
 * rather than as a thin slice of nothing. Cohort of 34, so counting still works.
 *
 * Colour is state (Badge tones) and never travels alone — every group is
 * direct-labelled underneath with its word and its count.
 */
const LIVABILITY: { key: string; label: MessageKey; count: number; cell: string }[] = [
  {
    key: "sustainable",
    label: "landing.mock.felt_sustainable",
    count: 18,
    cell: "bg-emerald-500",
  },
  { key: "strained", label: "landing.mock.felt_strained", count: 8, cell: "bg-amber-500" },
  { key: "hard", label: "landing.mock.felt_hard", count: 3, cell: "bg-red-500" },
  {
    key: "unknown",
    label: "landing.mock.felt_unknown",
    count: 5,
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
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
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
// Problem
// ---------------------------------------------------------------------------

/**
 * The three questions replace three "statistics" that stood here before
 * (client logging drop-off by week 10, days logged per week, shame as churn
 * cause). None of them was sourced anywhere in this repo, and all three
 * described one-to-one adherence tracking — the model we no longer sell. A
 * figure on this page now comes from a source we can point at, or it does not
 * appear.
 */
function Problem() {
  const questions = [
    t("landing.problem.q1"),
    t("landing.problem.q2"),
    t("landing.problem.q3"),
  ];
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("landing.problem.kicker")}</Kicker>
        <SectionTitle>{t("landing.problem.title")}</SectionTitle>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <p className="max-w-xl text-base leading-7 text-gray-600">
            {t("landing.problem.body")}
          </p>
          <ul className="max-w-xl border-t border-gray-200">
            {questions.map((q) => (
              <li
                key={q}
                className="border-b border-gray-200 py-4 text-lg leading-8 text-gray-900"
              >
                {q}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 max-w-2xl text-base font-medium leading-7 text-gray-900">
          {t("landing.problem.close")}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

function HowItWorks() {
  return (
    <section className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("landing.how.kicker")}</Kicker>
        <SectionTitle>{t("landing.how.title")}</SectionTitle>

        <ol className="mt-10 border-t border-gray-200">
          <Step
            when={t("landing.how.step1_when")}
            title={t("landing.how.step1_title")}
            body={t("landing.how.step1_body")}
          />
          <Step
            when={t("landing.how.step2_when")}
            title={t("landing.how.step2_title")}
            body={t("landing.how.step2_body")}
          >
            <ChatMock />
          </Step>
          {/*
            The student's web space is a cadence of its own — theirs, on pull,
            not on push — which is why it earns a row instead of a clause. It is
            also where the doctrine's "every line names the conviction it came
            from" becomes something a student actually sees, so the two sections
            hold each other up.
          */}
          <Step
            when={t("landing.how.space_when")}
            title={t("landing.how.space_title")}
            body={t("landing.how.space_body")}
          />
          <Step
            when={t("landing.how.step3_when")}
            title={t("landing.how.step3_title")}
            body={t("landing.how.step3_body")}
          >
            {/*
              The two lines the synthesis renderer actually emits, first and
              second, verbatim from `renderSynthesisText`. Quoted rather than
              paraphrased: this is the artefact the coach is buying, and no
              paraphrase of ours beats "how the week felt".
            */}
            <blockquote className="w-full border-l-2 border-gray-900 pl-4 lg:w-80">
              <p className="text-base leading-7 text-gray-900">
                {t("landing.mock.contact_line")}
              </p>
              <p className="mt-2 text-base leading-7 text-gray-900">
                {t("landing.mock.felt_line")}
              </p>
            </blockquote>
          </Step>
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The 1:1 note
// ---------------------------------------------------------------------------

/**
 * LE MODE 1:1, NOMMÉ COMME TEL — `student_coach_notes` sur la page de vente.
 *
 * Le produit vendu au-dessus est 1:N: une méthode, N élèves, aucun geste par
 * élève. Un coach qui en a dix et les connaît lit ça comme un refus de le
 * servir, alors que la fonctionnalité EXISTE (migration 20260805180000, câblée
 * aux trois points d'injection). Cette section la nomme.
 *
 * ── CE QUE LA SECTION DOIT FAIRE, ET DANS CET ORDRE ──────────────────────
 * 1. dire que ça existe;  2. dire jusqu'où ça va — les quatre bornes;
 * 3. refermer la tension avec le hero (« no one-to-one inbox »).
 *
 * Les quatre bornes NE SONT PAS des précautions juridiques: ce sont les
 * arguments. Un coach 1:1 confie une observation sur une personne à une
 * machine qui parlera en son nom; ce qu'il achète, c'est de savoir ce qu'elle
 * ne fera pas avec. « Elle ne la cite jamais » vend mieux que « elle la lit ».
 *
 * ── LE MOCK EST LE VRAI CHAMP ────────────────────────────────────────────
 * Titre et exemple sont repris mot pour mot de `CoachNoteCard`. C'est la même
 * règle que le panneau du lundi: on ne montre pas un écran qu'on n'a pas.
 */
function OneToOneNote() {
  const rules: { title: string; body: string }[] = [
    { title: t("landing.note.rule1_title"), body: t("landing.note.rule1_body") },
    { title: t("landing.note.rule2_title"), body: t("landing.note.rule2_body") },
    { title: t("landing.note.rule3_title"), body: t("landing.note.rule3_body") },
    { title: t("landing.note.rule4_title"), body: t("landing.note.rule4_body") },
  ];
  return (
    <section className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Kicker>{t("landing.note.kicker")}</Kicker>
        <SectionTitle>{t("landing.note.title")}</SectionTitle>

        {/*
          Le mock est apparié à l'INTRO, pas à la section entière. Apparié aux
          quatre bornes, il laissait une colonne droite vide sur les deux tiers
          de la hauteur — le mock fait cinq lignes, les bornes en font vingt.
          Les bornes passent donc en pleine largeur en dessous, comme les trois
          règles de `Doctrine`.
        */}
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16">
          <p className="max-w-xl text-base leading-7 text-gray-600">
            {t("landing.note.body")}
          </p>
          <NoteMock />
        </div>

        <dl className="mt-10 grid gap-8 border-t border-gray-200 pt-8 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-4">
          {rules.map((rule) => (
            <div key={rule.title}>
              <dt className="text-base font-semibold leading-6 text-gray-900">
                {rule.title}
              </dt>
              <dd className="mt-2 text-sm leading-6 text-gray-600">{rule.body}</dd>
            </div>
          ))}
        </dl>

        {/*
          La phrase qui referme la contradiction apparente avec le hero. Elle
          est en bas et pleine largeur parce qu'elle conclut la section entière,
          pas l'une des quatre bornes.
        */}
        <p className="mt-10 max-w-3xl border-t border-gray-200 pt-6 text-base leading-7 text-gray-900">
          {t("landing.note.close")}
        </p>
      </div>
    </section>
  );
}

/**
 * Le champ, schématique. Fond BLANC sur une section grise — l'inverse du
 * `ChatMock`, dont le gris se détache d'une section blanche. Dans les deux cas
 * le mock doit se lire comme une surface posée sur la page, pas comme un bloc
 * de la page.
 */
function NoteMock() {
  return (
    <div className="w-full lg:w-80">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
        {t("landing.mock.note_label")}
      </div>
      <div className="mt-2 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("landing.mock.note_heading")}
        </p>
        {/*
          Le texte est rendu dans un bloc bordé qui IMITE le textarea sans en
          être un: un vrai <textarea> sur une page de vente s'invite au focus,
          se remplit, et ne mène nulle part.
        */}
        <div className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs leading-5 text-gray-700">
          {t("landing.mock.note_body")}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500">
        {t("landing.mock.note_caption")}
      </p>
    </div>
  );
}

/**
 * A step is a row, not a card: the eyebrow carries a CADENCE, and a cadence is
 * a schedule. Three identical cards would have flattened "once" and "every
 * day" into two equal things, which is the one thing they are not.
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
 * The daily surface, schematic. Two exchanges because they are the two halves
 * of the day the product actually owns: a meal answered in the coach's method,
 * and the evening tap that the Monday page is built out of.
 *
 * The three buttons are literal: the pulse has three levels and not a 0-10
 * scale (`_shared/keel/daily_pulse.ts`). The cap came from WhatsApp originally
 * and survives the move in-app, because three buttons is the right shape for a
 * tired student at 8pm.
 */
function ChatMock() {
  return (
    <div className="w-full lg:w-80">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
        {t("landing.mock.wa_label")}
      </div>
      <div className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="ml-8 rounded-lg rounded-br-sm bg-gray-900 p-2 text-xs leading-5 text-white">
          <MockPlatePhoto />
          <p className="mt-1.5 px-1">{t("landing.mock.chat_student")}</p>
        </div>
        <div className="mr-8 rounded-lg rounded-bl-sm border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-700">
          {t("landing.mock.chat_sophia")}
        </div>
        <div className="mr-8 rounded-lg rounded-bl-sm border border-gray-200 bg-white px-3 py-2">
          <p className="text-xs leading-5 text-gray-700">{t("landing.mock.chat_evening")}</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {[
              t("landing.mock.chat_tap_good"),
              t("landing.mock.chat_tap_mixed"),
              t("landing.mock.chat_tap_hard"),
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
        {t("landing.mock.chat_tap_caption")}
      </p>
    </div>
  );
}

/**
 * Schematic stand-in for the photo a student sends in chat. Deliberately
 * NOT a photograph: a real plate picture here would read as someone's actual
 * meal, and we show no data we do not have. The two shapes are the two food
 * groups named back in the reply — greens and a protein — so the mock and the
 * answer describe the same plate.
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

// ---------------------------------------------------------------------------
// The double lock — the page's one dark block
// ---------------------------------------------------------------------------

/**
 * The strongest argument on the page and, until now, the least visible one: a
 * coach's first fear is an AI contradicting them in front of their own cohort,
 * and the answer to it is structural rather than a promise
 * (`_shared/keel/doctrine.ts`).
 *
 * The trace shows the mechanism instead of asserting it. Badge is not used
 * here: its tones are built for light surfaces, and a `bg-red-50` chip on
 * gray-950 would be a bright block. Same semantics, restated for this ground.
 */
function DoubleLock() {
  return (
    <section className="border-b border-gray-200 bg-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {t("landing.diff.kicker")}
        </p>
        <h2 className="mt-2 max-w-3xl text-balance text-2xl font-semibold leading-tight sm:text-3xl">
          {t("landing.diff.title")}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
          {t("landing.diff.body")}
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
                  {t("landing.diff.lock1_tag")}
                </dt>
                <dd className="mt-2 text-base leading-7 text-gray-200">
                  {t("landing.diff.lock1")}
                </dd>
              </div>
              <div className="border-l-2 border-emerald-400 pl-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
                  {t("landing.diff.lock2_tag")}
                </dt>
                <dd className="mt-2 text-base leading-7 text-white">
                  {t("landing.diff.lock2")}
                </dd>
              </div>
            </dl>
            <p className="mt-2 max-w-md text-balance text-lg font-medium leading-8 text-white">
              {t("landing.diff.close")}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              {t("landing.diff.trace_label")}
            </div>
            <p className="mt-1 text-xs text-gray-500">{t("landing.diff.trace_example")}</p>

            <ol className="mt-4 grid gap-3">
              <TraceStep label={t("landing.diff.trace_ask")} tone="neutral">
                {t("landing.diff.trace_ask_text")}
              </TraceStep>
              <TraceStep
                label={t("landing.diff.trace_draft")}
                tone="held"
                chip={t("landing.diff.trace_held")}
              >
                {t("landing.diff.trace_draft_text")}
              </TraceStep>
              <TraceStep label={t("landing.diff.trace_sent")} tone="sent">
                {t("landing.diff.trace_sent_text")}
              </TraceStep>
            </ol>

            <p className="mt-4 text-sm leading-6 text-gray-400">
              {t("landing.diff.trace_note")}
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
  // whole point is that the coach can see what was about to go out.
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
            {t("landing.doctrine.no_calories_title")}
          </h3>
          <div className="mt-3 grid max-w-4xl gap-4 text-sm leading-6 text-gray-600 sm:grid-cols-2 sm:gap-8">
            <p>{t("landing.doctrine.no_calories_body")}</p>
            <p>{t("landing.doctrine.no_calories_body2")}</p>
          </div>
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
        {/*
          UNE SEULE CARTE, ET C'EST LE MESSAGE.
          Il y en avait deux — un forfait de plateforme et un prix par siège.
          Deux cartes obligent le prospect à faire une addition, et cette
          addition avait un point mort à ~13 élèves. Le forfait est supprimé
          (voir l'en-tête de `landing.pricing.*`): il ne reste qu'un chiffre, et
          une grille qu'on ne peut pas mal lire.

          Prix, puis période, puis ce que ça achète — empilés. La carte reste à
          demi-largeur: un seul poste étalé sur toute la page se lirait comme un
          argument qu'on force.
        */}
        <div className="mt-8 sm:max-w-sm">
          <PriceCard
            price={t("landing.pricing.seat")}
            period={t("landing.pricing.seat_period")}
            label={t("landing.pricing.seat_label")}
          />
        </div>
        <p className="mt-6 max-w-2xl text-base leading-7 text-gray-600">
          {t("landing.pricing.why")}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ButtonLink to="/auth?role=coach" variant="primary" className="px-6 py-3 text-base">
            {t("landing.pricing.cta")}
          </ButtonLink>
          <span className="text-sm text-gray-500">{t("landing.pricing.trial_note")}</span>
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
