import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t, type MessageKey } from "../i18n/t";

/**
 * /gyms — the owner of an independent gym. Box, strength hall, hybrid studio. His pain
 * is CHURN: the member joined to change their body, nothing changes on their plate, and
 * they leave. Rebuilt 2026-08-12 from `scratchpad/site/AUDIT-SITE.md`; the full
 * reasoning, claim by claim, is in `scratchpad/site/gyms/RAPPORT.md`.
 *
 * ── THREE CLAIMS WERE REMOVED FROM THIS PAGE. DO NOT WRITE THEM BACK ──────────────
 * B2 "6 € when your MEMBER has paid for their year" — FALSE, the annual interval is the
 * COACH's (`stripe-create-checkout-session:124-125` reads `body.interval`, set by the
 * coach's own billing buttons), so an owner would build an annual offer on a discount he
 * cannot trigger; replaced by B3 in `gyms.price.annual`. · B16 "which parts of your
 * method your members hold, which they drop, at what time of year" — NOTHING computes it;
 * `source_belief_key` has one front-end reader and it is the STUDENT's own week
 * (`weekPlan.ts:36-37`). Deleted, no replacement. · B18 "it is your name on the messages
 * your members read" — FALSE, the agent is called Sophia everywhere and there is NO brand
 * personalisation: no column, no screen, no string. The owner's name reaches a member in
 * one place, the lock-2 substitution (B9); and do not drift into white-label (B19) —
 * never claimed, and keeping it unclaimed is the point.
 *
 * ── THE SILENCES (audit §9). All twelve bind; three bite here ────────────────────
 * S5 never "nothing happens at night" — quiet hours cover the re-engagement nudge ONLY,
 * and the evening tap can land at ten to ten (B24). · S10 a mock quotes the real field
 * word for word, or it is not a mock. · S12 no member SKU in Stripe, and
 * `gyms.price.billing_note` says so out loud. The other nine are in the audit.
 *
 * B20 — a gym with three coaches is ONE coach account: no gym entity, no roster, the
 * tenancy is coach → coach_clients → student. `Fit` states it in as many words, which is
 * what stops "your team" appearing in a later edit.
 *
 * DESIGN — `scratchpad/site/design/CHARTE.md`, direction « la fiche ». Light ground, ONE
 * dark block (the double lock), the equerre opening anything SPECIFIED, one figure per
 * section: five, where the 1041-line version this replaces had zero. No photograph — the
 * product makes no images, so a plate here would be a plate nobody cooked. And `/gyms` is
 * a link somebody was SENT: no signed-in redirect, or the forwarded link looks broken.
 */

// Hoisted: `SEO` holds `structuredData` in a `useEffect` dependency array, so an inline
// literal would rebuild the <script> tags on every render.
const GYMS_STRUCTURED_DATA = [
  organizationStructuredData(),
  {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Sophia",
    applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "en-GB",
    url: `${LEGAL_ENTITY.siteUrl}/gyms`, description: t("gyms.seo_description"),
    publisher: organizationStructuredData(),
  },
];

export function GymsLandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO title={t("gyms.seo_title")} description={t("gyms.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/gyms`} structuredData={GYMS_STRUCTURED_DATA} />
      <PublicHeader />
      <main>
        <Hero />
        <Money />
        <Daily />
        <Monday />
        {/* ICI, ET PAS AILLEURS: le lecteur vient de voir ce que l'agent écrit, c'est le seul
            moment où « et celui qui l'a écrite, c'est TOI » est une condition, pas une clause. */}
        <Fit />
        <Lock />
        <Pricing />
        <Closing />
      </main>
      <PublicFooter />
    </div>
  );
}

/** ⚠️ Padding en propriétés SÉPARÉES, jamais en raccourci: mesuré à 320 px sur la maquette
 *  de la charte, `padding: 84px 0 76px` remet le padding horizontal à zéro. */
const SHELL = "mx-auto max-w-[1200px] px-5 pb-10 pt-11 sm:px-8 sm:pb-[76px] sm:pt-[84px]";
const BODY = "text-base leading-[1.6]";
const TWO_COL = "mt-8 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16";

function Section({ alt = false, children }: { alt?: boolean; children: React.ReactNode }) {
  return (
    <section className={alt ? "bg-paper-2" : "bg-paper"}>
      <div className={SHELL}>{children}</div>
    </section>
  );
}

/** Sur les 280 px utiles d'un 320, le texte d'une figure tombe à 5-7 px: `fig-scroll` lui
 *  donne une largeur plancher et fait défiler SON conteneur, jamais la page. */
function Figure({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <div className={dark ? "fig-scroll on-dark" : "fig-scroll"}>{children}</div>;
}

/** Un seul CTA sur la page, répété trois fois, sans offre concurrente à côté. */
function Cta({ labelKey }: { labelKey: MessageKey }) {
  const cls =
    "inline-flex items-center justify-center rounded-full bg-fig-700 px-6 py-3 text-base font-medium text-paper transition-colors hover:bg-fig-800";
  return <Link to="/auth?role=coach" className={cls}>{t(labelKey)}</Link>;
}

function Hero() {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div>
          <Kicker>{t("gyms.hero.eyebrow")}</Kicker>
          <h1 className="mt-4 max-w-[16ch] text-balance font-display text-hero">{t("gyms.hero.title")}</h1>
          <p className="mt-6 max-w-[62ch] text-lede text-ink-soft">{t("gyms.hero.lede")}</p>
          <div className="mt-8"><Cta labelKey="gyms.hero.cta" /></div>
          {/* fact: B5 — 20260727235000_keel_billing_seats.sql:110-136 */}
          <p className="mt-4 max-w-[52ch] text-sm text-ink-soft">{t("gyms.hero.trial_note")}</p>
          {/* fact: B32 — coach-invite-student-v1:5-32 ; C17 — aucune intégration n'existe */}
          <p className="mt-2 max-w-[52ch] text-sm text-ink-soft">{t("gyms.hero.note")}</p>
        </div>
        <Figure><FigWeek /></Figure>
      </div>
    </Section>
  );
}

function Money() {
  return (
    <Section alt>
      <Kicker>{t("gyms.money.eyebrow")}</Kicker>
      <SectionTitle>{t("gyms.money.title")}</SectionTitle>
      <div className="mt-8 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:gap-16">
        <div className="max-w-[62ch]">
          {/* fact: B1 — stripe-create-checkout-session:120-125 ; B4 — stripe-reconcile-seats:18-35 */}
          <p className={`${BODY} text-ink-soft`}>{t("gyms.money.body")}</p>
          {/* fact: B31 — rien dans le dépôt ne mesure le churn contre un témoin */}
          <p className={`mt-6 ${BODY}`}>{t("gyms.money.close")}</p>
        </div>
        <div>
          {/* fact: B30 — juste ET étiqueté « exemple »: c'est la paire qui rend crédible */}
          <Figure><FigMoney /></Figure>
          <p className="mt-3 max-w-[62ch] text-sm text-ink-soft">{t("gyms.money.caption")}</p>
        </div>
      </div>
    </Section>
  );
}

function Daily() {
  return (
    <Section>
      <Kicker>{t("gyms.daily.eyebrow")}</Kicker>
      <SectionTitle>{t("gyms.daily.title")}</SectionTitle>
      <div className={TWO_COL}>
        <div className="max-w-[62ch]">
          {/* fact: B22 — daily_pulse.ts, 3 niveaux ; B23 — level !== "good": « So-so » relance */}
          <p className={`${BODY} text-ink-soft`}>{t("gyms.daily.body")}</p>
          <div className="mt-8 border-t border-line pt-6">
            <h3 className="font-display text-sub">{t("gyms.daily.quiet_title")}</h3>
            {/* fact: B21 — reengagement.ts:45,53,211-213 ; B24 — les heures calmes ne valent
                que pour la relance, le tap du soir peut tomber à 21 h 50 (S5) */}
            <p className={`mt-3 ${BODY} text-ink-soft`}>{t("gyms.daily.quiet_body")}</p>
          </div>
        </div>
        <div className="lg:w-[420px]">
          {/* fact: S10 — mot pour mot: daily_pulse.ts:85-92,114-115 · chat.title/subtitle/send */}
          <Figure><FigThread /></Figure>
          <p className="mt-3 text-sm text-ink-soft">{t("gyms.daily.fig_caption")}</p>
        </div>
      </div>
    </Section>
  );
}

function Monday() {
  return (
    <Section alt>
      <Kicker>{t("gyms.monday.eyebrow")}</Kicker>
      <SectionTitle>{t("gyms.monday.title")}</SectionTitle>
      <div className={TWO_COL}>
        <div className="max-w-[62ch]">
          {/* fact: B11 — cron '0 6 * * 1', renderSynthesisText pur ; B14 — coach_synthesis:64-65 */}
          <p className={`${BODY} text-ink-soft`}>{t("gyms.monday.body")}</p>
          <p className={`mt-6 ${BODY}`}>{t("gyms.monday.close")}</p>
          {/* fact: B17 — coach_synthesis_io.ts:171-187 */}
          <p className={`eq mt-8 border-t border-line pt-6 ${BODY}`}>{t("gyms.monday.scope")}</p>
        </div>
        <div className="lg:w-[420px]">
          {/* fact: S10 — CoachWeeklyPage.tsx:192,231,272,282 · copy/flagReasons.ts */}
          <Figure><FigMonday /></Figure>
          <p className="mt-3 text-sm text-ink-soft">{t("gyms.monday.fig_caption")}</p>
        </div>
      </div>
    </Section>
  );
}

/** La section dont le travail est de PERDRE une vente: qui délègue l'entretien récupère
 *  une doctrine remplie sous contrainte, donc un agent générique — le mode d'échec. */
function Fit() {
  return (
    <Section>
      <Kicker>{t("gyms.fit.eyebrow")}</Kicker>
      <SectionTitle>{t("gyms.fit.title")}</SectionTitle>
      {/* fact: B28 — doctrine.ts:38-43 (cache = hash) · coach-doctrine-v1:1263 (rollback) */}
      <p className={`mt-6 max-w-[62ch] ${BODY} text-ink-soft`}>{t("gyms.fit.body")}</p>
      <dl className="mt-10 grid gap-8 border-t border-line pt-8 sm:grid-cols-2 sm:gap-12">
        {/* fact: B20 — tenancy coach → coach_clients → student, ni entité salle ni roster */}
        <div>
          <dt className="font-display text-sub">{t("gyms.fit.one_title")}</dt>
          <dd className={`mt-3 max-w-[52ch] ${BODY} text-ink-soft`}>{t("gyms.fit.one_body")}</dd>
        </div>
        <div>
          <dt className="font-display text-sub">{t("gyms.fit.no_title")}</dt>
          <dd className={`mt-3 max-w-[52ch] ${BODY} text-ink-soft`}>{t("gyms.fit.no_body")}</dd>
        </div>
      </dl>
    </Section>
  );
}

/** ⚠️ FORMULATION B8b, ET PAS CELLE DES PAGES EN LIGNE, qui sur-vendent les deux.
 *  `withKeelDoctrineBlock` n'a QU'UN appelant, le composeur (run.ts:2348,7261): les lanes de
 *  skill rendent avant lui et ne le lisent pas (B7). Et « chaque message sortant » est faux —
 *  quatre surfaces sont scannées (chat, repas, semaines, reco du jour), quatre ne le sont pas
 *  (relance, récap du soir, bilan du dimanche, broadcast coach). */
function Lock() {
  return (
    <section className="bg-fig-950 text-paper">
      <div className={SHELL}>
        <Kicker onDark>{t("gyms.lock.eyebrow")}</Kicker>
        <h2 className="mt-3 max-w-2xl text-balance font-display text-title">{t("gyms.lock.title")}</h2>
        <p className={`mt-6 max-w-[62ch] ${BODY} text-fig-300`}>{t("gyms.lock.body")}</p>
        <div className="mt-10 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <dl className="grid content-start gap-8">
            {/* fact: B10 — run.ts:1441,2503 · week-plan:338,541 · meal:576,1038 · household:1602 */}
            <div className="border-l-2 border-fig-300 pl-4">
              <dt className="text-label font-semibold uppercase text-fig-300">{t("gyms.lock.l1_tag")}</dt>
              <dd className={`mt-2 ${BODY}`}>{t("gyms.lock.l1")}</dd>
            </div>
            {/* fact: B8b — findDoctrineViolations sur le chat, keel_output_locks.ts:307 */}
            <div className="border-l-2 border-paper pl-4">
              <dt className="text-label font-semibold uppercase text-fig-300">{t("gyms.lock.l2_tag")}</dt>
              <dd className={`mt-2 ${BODY}`}>{t("gyms.lock.l2")}</dd>
            </div>
            {/* fact: B9 — keel_output_locks.ts:99-113 · run.ts:2825-2834 */}
            <p className={`${BODY} text-fig-300`}>{t("gyms.lock.instead")}</p>
          </dl>
          <div>
            <Figure dark><FigTrace /></Figure>
            <p className="mt-3 text-sm text-fig-300">{t("gyms.lock.trace_example")}</p>
            {/* fact: B27 — CHECK …_doctrine_traceable_check ; portée: la SEMAINE seulement */}
            <p className={`mt-6 border-t border-fig-700 pt-6 ${BODY}`}>{t("gyms.lock.traceable")}</p>
          </div>
        </div>
        <p className="mt-10 max-w-[52ch] text-balance font-display text-sub">{t("gyms.lock.close")}</p>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <Section alt>
      <Kicker>{t("gyms.price.eyebrow")}</Kicker>
      <SectionTitle>{t("gyms.price.title")}</SectionTitle>
      <div className="mt-8 grid gap-10 lg:grid-cols-[auto_1fr] lg:gap-16">
        <div className="sm:max-w-sm">
          {/* fact: B1 — 7 €/membre/mois, aucun forfait plateforme */}
          <PriceCard price={t("gyms.price.seat")} period={t("gyms.price.seat_period")} label={t("gyms.price.seat_label")} />
          {/* fact: B3 — un SIÈGE payé à l'année. ⚠️ Correction du claim FAUX B2, qui était ici */}
          <p className="mt-3 text-sm text-ink-soft">{t("gyms.price.annual")}</p>
        </div>
        <div className="max-w-[62ch]">
          {/* fact: B4 — on cesse de payer au siège éteint ; B6 — zéro élève = `no_billable_seat` */}
          <p className={`${BODY} text-ink-soft`}>{t("gyms.price.why")}</p>
          {/* fact: S12 — aucun SKU membre dans stripe-create-checkout-session */}
          <p className="mt-4 text-sm text-ink-soft">{t("gyms.price.billing_note")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Cta labelKey="gyms.price.cta" />
            {/* fact: B5 — 14 jours, 3 élèves, puis ça s'arrête */}
            <span className="text-sm text-ink-soft">{t("gyms.price.trial_note")}</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Closing() {
  return (
    <Section>
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-balance font-display text-title">{t("gyms.close.title")}</h2>
        <div className="mt-8 flex justify-center"><Cta labelKey="gyms.close.cta" /></div>
        {/* fact: B5 — la porte « Sign in » est déjà dans PublicHeader: un second lien ici
            serait une seconde offre à côté du seul CTA de la page. */}
        <p className="mt-4 text-sm text-ink-soft">{t("gyms.close.trial_note")}</p>
      </div>
    </Section>
  );
}

// LES FIGURES — F1-F14. Deux épaisseurs (2 = le contour d'une chose réelle, 1 = une annotation),
// angles fermés, coordonnées entières, cinq jetons, `FIG` exactement DEUX fois par figure
// (l'équerre et un seul objet), ni dégradé ni ombre ni `opacity`, et jamais émeraude, ambre,
// rouge ni bleu — ces quatre familles appartiennent aux ÉTATS du produit.

const FONT = "var(--font-sans)";
const INK = "var(--ill-ink, #23191F)";
const SOFT = "var(--ill-ink-soft, #6A5A64)";
const PAPER = "var(--ill-paper, #FBF8FA)";
const WASH = "var(--ill-wash, #EFE0E9)";
const FIG = "var(--ill-fig, #632C4C)";

/** L'équerre n'encadre jamais, elle ouvre, et ne flotte JAMAIS seule: il y a toujours un mot à
 *  sa droite. Sans `label` — les deux maquettes — c'est le titre de l'app à l'intérieur de la
 *  surface dont elle ouvre le coin, et le bras passe de 32 à 40. */
function Eq({ label }: { label?: MessageKey }) {
  const arm = label ? 32 : 40;
  return (
    <>
      <path d={`M 8 ${arm} L 8 16 A 8 8 0 0 1 16 8 L ${arm} 8`} fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
      {label ? <text x="44" y="26" fontSize="11" fontWeight="600" letterSpacing="1.2" fill={SOFT}>{t(label)}</text> : null}
    </>
  );
}

/** Figure 1 — la semaine d'un membre. Concept, 480×240. Les 21 repas sont LA pièce chaude;
 *  COMPTABLES et non proportionnels — aucune forme n'affirme une mesure que le produit ne
 *  calcule pas (F9), et 3 × 7 est l'arithmétique du monde, pas un chiffre du dépôt. */
function FigWeek() {
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="fw-t fw-d" fontFamily={FONT}>
      <title id="fw-t">{t("gyms.fig.week_t")}</title>
      <desc id="fw-d">{t("gyms.fig.week_d")}</desc>
      <Eq label="gyms.fig.week_label" />
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="40" y="68">{t("gyms.fig.week_row1")}</text>
        <text x="40" y="148">{t("gyms.fig.week_row2")}</text>
      </g>
      {/* Trois choses réelles, contour de 2, sur trois des sept colonnes: à droite, le week-end. */}
      <g fill={PAPER} stroke={INK} strokeWidth="2" strokeLinejoin="round">
        {[40, 160, 280].map((x) => <rect key={x} x={x} y={80} width={56} height={32} rx={4} />)}
      </g>
      <g fill={FIG}>
        {[0, 1, 2, 3, 4, 5, 6].map((c) =>
          [0, 1, 2].map((r) => (
            <rect key={`${c}-${r}`} x={61 + c * 60} y={160 + r * 24} width={14} height={14} rx={4} />
          )),
        )}
      </g>
    </svg>
  );
}

/** Figure 2 — l'exemple chiffré (B30). Document vu de face, 480×240. Ce n'est PAS une
 *  maquette: aucun écran ne rend cette addition, et la parer de la surface de l'app en
 *  ferait un écran qu'on n'a pas. */
function FigMoney() {
  const row = (y: number, label: MessageKey, value: MessageKey, total = false) => (<>
    <text x="44" y={y} fontSize={total ? 13 : 11} fill={INK}>{t(label)}</text>
    <text x="436" y={y} fontSize="13" textAnchor="end" fill={total ? FIG : INK}>{t(value)}</text>
  </>);
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="fm-t fm-d" fontFamily={FONT}>
      <title id="fm-t">{t("gyms.fig.money_t")}</title>
      <desc id="fm-d">{t("gyms.fig.money_d")}</desc>
      <Eq label="gyms.fig.money_label" />
      <rect x="24" y="48" width="432" height="176" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      {row(80, "gyms.fig.money_uptake_label", "gyms.fig.money_uptake_value")}
      {row(134, "gyms.fig.money_in_label", "gyms.fig.money_in_value")}
      {row(162, "gyms.fig.money_out_label", "gyms.fig.money_out_value")}
      {row(200, "gyms.fig.money_keep_label", "gyms.fig.money_keep_value", true)}
      <g fontSize="9" fill={SOFT}>
        <text x="44" y="96">{t("gyms.fig.money_uptake_hint")}</text>
        <text x="44" y="216">{t("gyms.fig.money_keep_hint")}</text>
      </g>
      <g stroke={SOFT} strokeWidth="1">
        <path d="M 44 110 L 436 110" />
        <path d="M 44 176 L 436 176" />
      </g>
    </svg>
  );
}

/** Figure 3 — le fil du soir. MAQUETTE DE PRODUIT, 480×320, chaque chaîne citée mot pour mot
 *  (S10). Une maquette est une SURFACE, jamais un appareil: ni chrome de navigateur ni cadre
 *  de téléphone (F12 — il n'existe aucune application mobile, C17). */
function FigThread() {
  const pills = (y: number, keys: MessageKey[]) =>
    keys.map((key, i) => (
      <g key={key}>
        <rect x={24 + i * 112} y={y} width="104" height="26" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
        <text x={76 + i * 112} y={y + 17} fontSize="11" textAnchor="middle" fill={INK}>{t(key)}</text>
      </g>
    ));
  return (
    <svg viewBox="0 0 480 320" role="img" aria-labelledby="ft-t ft-d" fontFamily={FONT}>
      <title id="ft-t">{t("gyms.fig.thread_t")}</title>
      <desc id="ft-d">{t("gyms.fig.thread_d")}</desc>
      <Eq />
      <rect x="8" y="8" width="464" height="304" rx="16" fill={WASH} stroke={SOFT} strokeWidth="1" />
      <text x="28" y="46" fontSize="15" fontWeight="600" fill={FIG}>{t("gyms.fig.thread_app")}</text>
      <text x="28" y="64" fontSize="9" fill={SOFT}>{t("gyms.fig.thread_sub")}</text>
      <path d="M 24 78 L 456 78" stroke={SOFT} strokeWidth="1" />
      <g fill={PAPER} stroke={SOFT} strokeWidth="1">
        <rect x="24" y="94" width="270" height="34" rx="12" />
        <rect x="24" y="180" width="270" height="34" rx="12" />
        <rect x="24" y="266" width="344" height="32" rx="16" />
        <rect x="380" y="266" width="76" height="32" rx="16" />
      </g>
      <g fontSize="11" fill={INK}>
        <text x="40" y="116">{t("gyms.fig.thread_q1")}</text>
        <text x="40" y="202">{t("gyms.fig.thread_q2")}</text>
        <text x="418" y="286" textAnchor="middle">{t("gyms.fig.thread_send")}</text>
      </g>
      <text x="40" y="286" fontSize="11" fill={SOFT}>{t("gyms.fig.thread_composer")}</text>
      {pills(138, ["gyms.fig.thread_b1", "gyms.fig.thread_b2", "gyms.fig.thread_b3"])}
      {pills(224, ["gyms.fig.thread_a1", "gyms.fig.thread_a2", "gyms.fig.thread_a3"])}
    </svg>
  );
}

/** Figure 4 — le lundi. MAQUETTE DE PRODUIT, 480×248; le filet de 2 est l'idiome de l'app
 *  (`border-l-2`, CoachWeeklyPage.tsx:243). Les pastilles d'état sont en CONTOUR SOURD et
 *  jamais dans leur couleur (F10): pas d'instant sur une page de vente, le MOT porte l'état. */
function FigMonday() {
  const rows: [MessageKey, MessageKey, MessageKey, boolean][] = [
    ["gyms.fig.monday_n1", "gyms.fig.monday_r1", "gyms.fig.monday_s1", true],
    ["gyms.fig.monday_n2", "gyms.fig.monday_r2", "gyms.fig.monday_s2", true],
    ["gyms.fig.monday_n3", "gyms.fig.monday_r3", "gyms.fig.monday_s3", false],
  ];
  return (
    <svg viewBox="0 0 480 248" role="img" aria-labelledby="fk-t fk-d" fontFamily={FONT}>
      <title id="fk-t">{t("gyms.fig.monday_t")}</title>
      <desc id="fk-d">{t("gyms.fig.monday_d")}</desc>
      <Eq />
      <rect x="8" y="8" width="464" height="232" rx="16" fill={WASH} stroke={SOFT} strokeWidth="1" />
      <text x="28" y="46" fontSize="15" fontWeight="600" fill={FIG}>{t("gyms.fig.monday_app")}</text>
      <rect x="24" y="64" width="432" height="158" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      <text x="40" y="88" fontSize="9" fontWeight="600" letterSpacing="0.9" fill={SOFT}>
        {t("gyms.fig.monday_worth")}
      </text>
      {rows.map(([name, reason, state, pill], i) => {
        const y = 118 + i * 42;
        return (
          <g key={name}>
            <path d={`M 40 ${y - 13} L 40 ${y + 5}`} stroke={SOFT} strokeWidth="2" strokeLinecap="round" />
            <text x="56" y={y} fontSize="11" fontWeight="600" fill={INK}>{t(name)}</text>
            <text x="140" y={y} fontSize="11" fill={SOFT}>{t(reason)}</text>
            {pill ? <rect x="286" y={y - 11} width="52" height="16" rx="8" fill="none" stroke={SOFT} strokeWidth="1" /> : null}
            <text x={pill ? 312 : 286} y={y} fontSize="9" textAnchor={pill ? "middle" : "start"} fill={SOFT}>{t(state)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Figure 5 — la trace. CONCEPT sur fond sombre, 480×240: une maquette de produit ne se pose
 *  JAMAIS sur du sombre (F12), le produit est en clair et un écran sombre montrerait un
 *  produit qui n'existe pas. `.on-dark` remonte l'équerre de 2,4:1 à 8,06:1. */
function FigTrace() {
  const step = (y: number, label: MessageKey, text: MessageKey, held = false, x = 40) => (<>
    <text x={x} y={y + 20} fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t(label)}</text>
    <text x={x} y={y + 38} fontSize="11" fill={held ? SOFT : PAPER} textDecoration={held ? "line-through" : undefined}>{t(text)}</text>
  </>);
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="fc-t fc-d" fontFamily={FONT}>
      <title id="fc-t">{t("gyms.fig.trace_t")}</title>
      <desc id="fc-d">{t("gyms.fig.trace_d")}</desc>
      <Eq label="gyms.fig.trace_label" />
      <g fill="none" stroke={SOFT} strokeWidth="1">
        <rect x="24" y="44" width="432" height="48" rx="12" />
        <rect x="24" y="104" width="432" height="48" rx="12" />
        {/* La pastille « held »: contour sourd, et le mot réel dedans (F10). */}
        <rect x="380" y="113" width="52" height="16" rx="8" />
      </g>
      <text x="406" y="124" fontSize="9" textAnchor="middle" fill={SOFT}>{t("gyms.fig.trace_held")}</text>
      {step(44, "gyms.fig.trace_s1", "gyms.fig.trace_t1")}
      {step(104, "gyms.fig.trace_s2", "gyms.fig.trace_t2", true)}
      {/* Ce qui est parti: contour de 2, et le filet de l'app DEDANS — sous le contour, invisible. */}
      <rect x="24" y="164" width="432" height="52" rx="12" fill="none" stroke={PAPER} strokeWidth="2" />
      <path d="M 40 172 L 40 208" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
      {step(164, "gyms.fig.trace_s3", "gyms.fig.trace_t3", false, 56)}
    </svg>
  );
}

export default GymsLandingPage;
