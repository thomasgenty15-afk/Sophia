import type { ReactNode } from "react";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t } from "../i18n/t";

/**
 * /coaches — LA PAGE DU PRATICIEN QUI VEND UNE FORMATION.
 *
 * Elle vient de `/` (`LandingPage.tsx`, 979 lignes) : même acheteur, même
 * argument central, un tiers de la longueur, et les murs de texte sont devenus
 * des figures. Le namespace `landing` disparaît, son contenu vit dans `coaches`.
 * L'acheteur paie et décide ; un élève n'arrive jamais ici.
 *
 * ── LES SILENCES DÉLIBÉRÉS, REPRIS TELS QUELS (AUDIT §9) ────────────────
 * Chacun a coûté un incident. « Ça ne se voit pas » n'en lève aucun.
 *
 *  S1  Aucun canal 1:1 élève vers coach, et cette absence EST le produit : rien
 *      ici n'évoque une boîte, une file de réponses, un « il te répondra ».
 *  S2  ⚠️ RÈGLE AMENDÉE LE 2026-08-13 — LIS-LA AVANT DE « RÉPARER » UN MOT.
 *      Elle disait: « élèves / cohorte / ta méthode / ta voix. JAMAIS *ton
 *      client*, JAMAIS *suivi personnalisé* ». Les deux interdits n'avaient
 *      pas la même valeur, et un seul survit.
 *
 *      « SUIVI PERSONNALISÉ » RESTE INTERDIT, partout, sans exception: le
 *      produit ne suit personne individuellement, et le promettre est le
 *      mensonge le plus coûteux du lot.
 *
 *      « CLIENT » EST DÉSORMAIS LE MOT JUSTE — SAUF ICI. La règle a été
 *      écrite quand le seul acheteur était un coach qui vend une formation.
 *      La vitrine en a trois, et deux n'enseignent rien: une SALLE a des
 *      clients qui paient un abonnement, pas des élèves, et écrire « tes
 *      élèves » sur `/gyms` décrit une relation qui n'existe pas — c'est ce
 *      qui a fait écrire une douleur fausse pendant toute la première version
 *      (« après mes trois heures de coaching », alors que la plupart de ces
 *      gens n'ont jamais eu de coach).
 *
 *      DONC: `/gyms` et `/pro` disent CLIENTS. Cette page-ci garde ÉLÈVES,
 *      parce qu'ici ils ont choisi quelqu'un pour apprendre de lui — et c'est
 *      exactement ce qu'elle vend.
 *  S3  L'espace de l'élève est en PULL : il compose quand il l'ouvre.
 *  S4  NE JAMAIS réintroduire un « rien à ouvrir / rien à installer » : trois
 *      brouillons l'ont posé une rangée au-dessus de ce qu'il niait.
 *  S5  NE JAMAIS écrire « rien n'arrive la nuit » — faux : les heures calmes
 *      (21 h-8 h) ne couvrent que la relance ; le tap du soir tombe à 21 h 50.
 *  S6  Rien ne promet ce qui n'est pas PROUVÉ : silence tenu sur le suivi de
 *      poids (chemins d'écriture et de lecture en désaccord).
 *  S8  Un chiffre vient d'une source qu'on peut montrer, ou il n'apparaît pas.
 *  S9  Aucune bande de risque ni tuile « on track » : elles viennent de
 *      l'évaluateur d'adhérence, débranché du 1:N par `20260803200000`.
 *  S10 Une maquette reprend le vrai champ MOT POUR MOT, ou ce n'est pas une
 *      maquette. Deux citations rétablies : `MondayFigure` et `ChatFigure`.
 *  S11 `docs/keel/LEGAL.md` §6.4 : jamais de comptage calorique par photo.
 *  S12 Aucun SKU élève : d'où « nous ne facturons jamais ton élève ».
 *
 * S7 est le seul silence RENVERSÉ, en connaissance de cause : « aucune teinte
 * d'accent ». La vitrine a `fig-700` (325°). Ce que la règle protégeait reste
 * vrai — la figue N'ENTRE JAMAIS DANS UNE PASTILLE, et aucune figure n'emploie
 * émeraude, ambre, rouge ni bleu. Ne retire pas la couleur en croyant réparer.
 * Autorité : `site/design/CHARTE.md` §2.
 *
 * ── ET TROIS CHOSES QU'ELLE NE FAIT PLUS, VOLONTAIREMENT ────────────────
 * · Aucune redirection d'un visiteur connecté : `LandingPage` la portait parce
 *   qu'elle était `/`, et l'adresse d'arrivée d'un compte n'est plus ici.
 * · Un seul CTA, répété : `/start` vend une autre offre à un autre acheteur.
 * · Le « double verrou » n'est plus symétrique : l'injection est une CONSIGNE,
 *   la relecture un MÉCANISME, dans cet ordre (B7/B8 → B8b). L'aveu est ce qui
 *   rend la garantie croyable ; la sur-vendre la ruinait.
 */
const COACHES_STRUCTURED_DATA = [
  organizationStructuredData(),
  {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Sophia",
    applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "en-GB",
    url: `${LEGAL_ENTITY.siteUrl}/coaches`, description: t("coaches.seo_description"),
    publisher: organizationStructuredData(),
  },
];

export function CoachesPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO
        title={t("coaches.seo_title")}
        description={t("coaches.seo_description")}
        canonical="https://sophia-coach.ai/coaches"
        structuredData={COACHES_STRUCTURED_DATA}
      />
      <PublicHeader />
      <main>
        <Hero />
        <Day />
        <Lock />
        <Monday />
        <Note />
        <Pricing />
        <Closing />
      </main>
      <PublicFooter />
    </div>
  );
}

/** Padding vertical par classes de bloc, jamais par le raccourci `padding` :
 *  `padding: 84px 0 76px` remet l'horizontal à zéro à 320 px (CHARTE §4). */
const Section = ({ children, dark = false }: { children: ReactNode; dark?: boolean }) => (
  <section className={dark ? "bg-fig-950 text-paper" : "border-b border-line"}>
    <div className="mx-auto max-w-[1200px] px-5 pt-11 pb-10 md:px-8 md:pt-21 md:pb-19">{children}</div>
  </section>
);

/** Le seul CTA de la page, répété trois fois. */
const Cta = ({ label }: { label: string }) => (
  <ButtonLink to="/auth?role=coach" variant="brand" className="px-6 py-3 text-base">{label}</ButtonLink>
);

/** Une figure et sa légende. `fig-scroll` donne au SVG un plancher de 380 px et
 *  laisse le CONTENEUR défiler dessous : sur les 280 px utiles d'un téléphone de
 *  320, son texte tomberait sinon à 5 px.
 *  ⚠️ `min-w-0` est la moitié manquante du plancher : sans lui, c'est la PAGE qui
 *  défile en largeur (mesuré à 320 px : 420 px de contenu). L'élément de grille
 *  est ce `<figure>`, dont le `min-width: auto` fait grandir la piste jusqu'au
 *  plancher du SVG. Même piège que `flex-1` sur un input. */
const Figure = ({ children, caption }: { children: ReactNode; caption?: string }) => (
  <figure className="m-0 min-w-0">
    <div className="fig-scroll">{children}</div>
    {caption ? <figcaption className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-soft">{caption}</figcaption> : null}
  </figure>
);

const Hero = () => (
  <Section>
    <div className="grid gap-11 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
      <div>
        <Kicker>{t("coaches.hero.kicker")}</Kicker>
        <h1 className="mt-3 text-balance font-display text-hero">{t("coaches.hero.title")}</h1>
        <p className="mt-6 max-w-[62ch] text-lede text-ink-soft">{t("coaches.hero.lede")}</p>
        <div className="mt-8"><Cta label={t("coaches.hero.cta")} /></div>
        {/* fact: B5 — 20260727235000_keel_billing_seats.sql:110-136 · fact: B32 —
            coach-invite-student-v1:5-32 : invitation e-mail, aucun lien à copier,
            propriété de sécurité · S1 est dite à l'affirmative, parce qu'un coach
            cherche la boîte avant de la croire absente. */}
        <p className="mt-5 max-w-[52ch] text-sm leading-6 text-ink-soft">{t("coaches.hero.note")}</p>
      </div>
      {/* fact: B10 — 4 points d'injection : run.ts:1441,2503 ·
          generate-week-plan-v1:338,541 · generate-meal-v1:576,1038 ·
          generate-household-meal-v1:1602,2249 · fact: B28 — révision et
          rollback : doctrine.ts:38-43 · coach-doctrine-v1:1263. */}
      <Figure caption={t("coaches.hero.fig_caption")}><MethodFigure /></Figure>
    </div>
  </Section>
);

const Day = () => (
  <Section>
    <Kicker>{t("coaches.day.kicker")}</Kicker>
    <SectionTitle>{t("coaches.day.title")}</SectionTitle>
    <div className="mt-8 grid gap-11 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div>
        <p className="max-w-[62ch] leading-7 text-ink-soft">{t("coaches.day.body")}</p>
        {/* Trois QUESTIONS D'ÉLÈVE, pas trois arguments : elles se lisent en une
            seconde. Elles remplacent trois « statistiques » sans source (S8). */}
        <ul className="mt-6 max-w-[52ch] border-t border-line">
          {[t("coaches.day.q1"), t("coaches.day.q2"), t("coaches.day.q3")].map((q) => (
            <li key={q} className="border-b border-line py-4 text-lg leading-7">{q}</li>
          ))}
        </ul>
        <p className="mt-6 max-w-[62ch] font-medium leading-7">{t("coaches.day.close")}</p>
      </div>
      {/* fact: B22 — daily_pulse.ts : trois niveaux, fenêtre 20 h-22 h, un message
          par jour · fact: B23 — `needsAxisFollowUp(level) = level !== "good"`
          (:190-192) : la relance part AUSSI sur « mitigé », là où l'ancienne page
          écrivait « if it was hard ». */}
      <Figure caption={t("coaches.day.fig_caption")}><ChatFigure /></Figure>
    </div>
  </Section>
);

/** LE BLOC SOMBRE — un seul par page, dépensé ici : c'est l'argument le plus
 *  fort du produit et le seul du voisinage, personne n'y vend la relecture avant
 *  envoi. Les pages actuelles le sur-vendaient (« chaque message sortant est
 *  vérifié ») : faux pour « chaque », 4 surfaces scannées sur 8. */
const Lock = () => (
  <Section dark>
    <div className="on-dark">
      <Kicker onDark>{t("coaches.lock.kicker")}</Kicker>
      <h2 className="mt-3 max-w-[24ch] text-balance font-display text-title">{t("coaches.lock.title")}</h2>
      <div className="mt-8 grid gap-11 lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:gap-16">
        <div className="grid content-start gap-6">
          <p className="max-w-[62ch] leading-7 text-fig-300">{t("coaches.lock.body")}</p>
          {/* fact: B8b — l'injection est une CONSIGNE (`withKeelDoctrineBlock`
              n'a qu'un appelant, le composeur) ; la relecture est un MÉCANISME
              déterministe, sur le chat (keel_output_locks.ts:307). */}
          <p className="max-w-[62ch] text-lede">{t("coaches.lock.scope")}</p>
          {/* fact: B9 — keel_output_locks.ts:99-113 (`instead`) et :226-230
              (`signAsCoach`, en SUFFIXE : l'élève lit la phrase, puis de qui
              elle est ; en préfixe, un narrateur s'installe entre eux). */}
          <p className="max-w-[62ch] leading-7 text-fig-300">{t("coaches.lock.instead")}</p>
          <p className="max-w-[46ch] text-balance text-lede font-medium">{t("coaches.lock.close")}</p>
        </div>
        <Figure><LockFigure /></Figure>
      </div>
    </div>
  </Section>
);

const Monday = () => (
  <Section>
    <Kicker>{t("coaches.monday.kicker")}</Kicker>
    <SectionTitle>{t("coaches.monday.title")}</SectionTitle>
    <div className="mt-8 grid gap-11 lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-16">
      <div className="grid content-start gap-6">
        {/* fact: B11 — cron '0 6 * * 1' (20260803090000:90-116) et le rendu
            par gabarit `renderSynthesisText` (coach_synthesis.ts:516-641). */}
        <p className="max-w-[62ch] leading-7 text-ink-soft">{t("coaches.monday.body")}</p>
        {/* fact: B14 — 48 h et 120 h (coach_synthesis.ts:64-65), mesurés sur
            le dernier message ENTRANT.
            ⚠️ On n'écrit PAS « pas de score d'adhérence » : exagéré (B15), le
            moteur émet encore une moyenne dès qu'une ligne existe. On dit ce
            que la page FAIT : « no number to show » (CoachWeeklyPage.tsx:272). */}
        <p className="max-w-[62ch] leading-7">{t("coaches.monday.thresholds")}</p>
      </div>
      {/* fact: B12 — phrases verbatim (coach_synthesis.ts:538-556) · fact: B13
          — « BUILT themselves a week », pas « wrote » : l'ancienne page
          prétendait citer et paraphrasait. */}
      <Figure caption={t("coaches.monday.fig_caption")}><MondayFigure /></Figure>
    </div>
  </Section>
);

/** La note vient APRÈS la relecture : elle ajoute une entrée dans le prompt. */
const Note = () => (
  <Section>
    <Kicker>{t("coaches.note.kicker")}</Kicker>
    <SectionTitle>{t("coaches.note.title")}</SectionTitle>
    <div className="mt-8 grid gap-11 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-16">
      <div className="grid content-start gap-6">
        {/* fact: B26 — coach_note.ts:53,112-129 · account-export-v1:717,725
            (incluse à l'export RGPD) · fact: B27 — CHECK
            `student_week_plans_doctrine_traceable_check` (20260803210000:87-113) :
            la base refuse une ligne de semaine qui ne cite aucune conviction. */}
        <p className="max-w-[62ch] leading-7 text-ink-soft">{t("coaches.note.body")}</p>
        {/* ⚠️ « jamais citée » est une promesse de PROMPT sans vérificateur
            (coach_note.ts:126-128) : pas au rang des lignes rouges. */}
        <p className="max-w-[62ch] leading-7">{t("coaches.note.limit")}</p>
      </div>
      <NoteMock />
    </div>
  </Section>
);

/** Le champ, mot pour mot depuis `CoachNoteCard` (titre l.111). Une fiche HTML et
 *  non un SVG : un `<textarea>` ici s'invite au focus et ne mène nulle part. */
const NoteMock = () => (
  <figure className="m-0 w-full lg:w-80">
    <p className="eq text-label font-semibold uppercase text-ink-soft">{t("coaches.note.mock_label")}</p>
    <div className="mt-3 rounded-fiche border border-line-strong bg-paper-2 p-4">
      <p className="text-label font-semibold uppercase text-ink-soft">{t("coaches.note.mock_heading")}</p>
      <p className="mt-3 rounded-card border border-line-strong bg-paper px-3 py-2 text-sm leading-6">{t("coaches.note.mock_body")}</p>
    </div>
    <figcaption className="mt-3 text-sm leading-6 text-ink-soft">{t("coaches.note.mock_caption")}</figcaption>
  </figure>
);

const Pricing = () => (
  <Section>
    <Kicker>{t("coaches.pricing.kicker")}</Kicker>
    <SectionTitle>{t("coaches.pricing.title")}</SectionTitle>
    {/* UNE SEULE CARTE, ET C'EST LE MESSAGE : il y en avait deux, et
        l'addition avait un point mort à ~13 élèves que l'essai fait démarrer
        à 3. fact: B1 — stripe-create-checkout-session:120-125,443-450
        (`legacyTierPriceId = null`), le siège est le seul poste. */}
    <div className="mt-8 grid gap-11 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-16">
      <div className="sm:max-w-sm">
        <PriceCard
          price={t("coaches.pricing.seat")}
          period={t("coaches.pricing.seat_period")}
          label={t("coaches.pricing.seat_label")}
        />
      </div>
      <div className="grid content-start gap-6">
        {/* fact: B4 — stripe-reconcile-seats:18-35 (recalcul, jamais un
            incrément) · fact: B6 — zéro élève est refusé au checkout
            (`no_billable_seat`, :443-449) : « positif dès le premier » ne
            s'écrit pas sans cette réserve · S12 — aucun SKU élève. */}
        <p className="max-w-[62ch] leading-7 text-ink-soft">{t("coaches.pricing.body")}</p>
        {/* fact: B31 — rien ne mesure le churn contre un témoin. La meilleure
            ligne des trois pages actuelles ; conservée. */}
        <p className="max-w-[62ch] text-lede">{t("coaches.pricing.no_number")}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Cta label={t("coaches.pricing.cta")} />
          <span className="text-sm text-ink-soft">{t("coaches.pricing.trial_note")}</span>
        </div>
      </div>
    </div>
  </Section>
);

const Closing = () => (
  <Section>
    <div className="text-center">
      <h2 className="mx-auto max-w-[26ch] text-balance font-display text-title">{t("coaches.closing.title")}</h2>
      <div className="mt-8 flex justify-center"><Cta label={t("coaches.closing.cta")} /></div>
    </div>
  </Section>
);

// LES FIGURES — règles F1-F14 (`site/design/CHARTE.md` §6) ; ces quatre-là sont
// des copies adaptées des deux étalons. Deux épaisseurs et pas trois (2 = une
// chose réelle, 1 = une annotation), angles fermés, coordonnées entières, cinq
// jetons, UNE pièce chaude par figure. Une sixième couleur voudrait dire que la
// figure est fausse, pas la palette trop courte.
const INK = "var(--ill-ink, #23191F)";
const SOFT = "var(--ill-ink-soft, #6A5A64)";
const PAPER = "var(--ill-paper, #FBF8FA)";
const WASH = "var(--ill-wash, #EFE0E9)";
const FIG = "var(--ill-fig, #632C4C)";

/** L'équerre ET son libellé, indissociables : elle n'encadre pas, elle ouvre, et
 *  elle ne flotte jamais seule. Elle porte la première des deux occurrences de
 *  `--ill-fig` de la figure ; la seconde est le sujet. `inside` : sur une
 *  maquette elle ouvre le coin de la surface, et c'est le titre de l'écran réel
 *  qui porte la teinte. */
const EqLabel = (p: { d: string; x: number; y: number; inside?: boolean; children: string }) => (
  <>
    <path d={p.d} fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
    {p.inside
      ? <text x={p.x} y={p.y} fontSize="15" fontWeight="600" fill={FIG}>{p.children}</text>
      : <text x={p.x} y={p.y} fontSize="11" fontWeight="600" letterSpacing="1.2" fill={SOFT}>{p.children}</text>}
  </>
);

/** Trois tailles et pas une de plus (F11) : 13 = valeur, 11 = ligne, 9 = étiquette. */
const Tx = (p: { x: number; y: number; s: 9 | 11 | 13; fill?: string;
                 anchor?: "middle" | "end"; bold?: boolean; children: string }) => (
  <text x={p.x} y={p.y} fontSize={p.s} textAnchor={p.anchor} fill={p.fill ?? INK}
        fontWeight={p.s === 9 || p.bold ? 600 : undefined} letterSpacing={p.s === 9 ? 1 : undefined}>
    {p.children}
  </text>
);

/** La méthode et les quatre choses qu'elle compose. La distribution est un BUS
 *  à 0° et 90° : quatre obliques vers quatre hauteurs n'auraient pas pu tomber
 *  sur les angles fermés de F4. Les quatre sorties sont le même rectangle,
 *  quatre fois — une taille dessinée est une affirmation de mesure (F9). */
const MethodFigure = () => (
  <svg viewBox="0 0 480 240" className="h-auto w-full" role="img" aria-labelledby="fig-method-t fig-method-d">
    <title id="fig-method-t">{t("coaches.fig.method.title")}</title>
    <desc id="fig-method-d">{t("coaches.fig.method.desc")}</desc>
    <EqLabel d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" x={44} y={26}>{t("coaches.fig.method.eq")}</EqLabel>
    <rect x="24" y="56" width="192" height="160" rx="12" fill={WASH} stroke={FIG} strokeWidth="2" />
    <Tx x={40} y={80} s={9} fill={SOFT}>{t("coaches.fig.method.source")}</Tx>
    {(["l1", "l2", "l3", "l4"] as const).map((k, i) => <Tx key={k} x={40} y={106 + i * 24} s={13}>{t(`coaches.fig.method.${k}`)}</Tx>)}
    <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
      <path d="M 216 136 L 252 136" />
      <path d="M 252 64 L 252 208" />
      {[64, 112, 160, 208].map((y) => <path key={y} d={`M 252 ${y} L 284 ${y}`} />)}
    </g>
    {(["out1", "out2", "out3", "out4"] as const).map((k, i) => (
      <g key={k}>
        <rect x="284" y={44 + i * 48} width="172" height="40" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
        <Tx x={300} y={69 + i * 48} s={13}>{t(`coaches.fig.method.${k}`)}</Tx>
      </g>
    ))}
  </svg>
);

/** La journée, vue de face. Une maquette est une SURFACE, jamais un appareil :
 *  aucun cadre de téléphone — il n'existe aucune application mobile (C17), et le
 *  dessiner serait la promesse la plus facile à croire du site. Aucune photo
 *  d'assiette non plus : l'ancienne en dessinait une avec deux taches verte et
 *  ambre, soit de la couleur d'ÉTAT sur une page de vente. */
const ChatFigure = () => (
  <svg viewBox="0 0 480 300" className="h-auto w-full" role="img" aria-labelledby="fig-chat-t fig-chat-d">
    <title id="fig-chat-t">{t("coaches.fig.chat.title")}</title>
    <desc id="fig-chat-d">{t("coaches.fig.chat.desc")}</desc>
    <rect x="8" y="8" width="464" height="284" rx="16" fill={WASH} stroke={SOFT} strokeWidth="1" />
    <EqLabel d="M 8 40 L 8 16 A 8 8 0 0 1 16 8 L 40 8" x={28} y={46} inside>{t("coaches.fig.chat.heading")}</EqLabel>
    <Tx x={448} y={72} s={9} anchor="end" fill={SOFT}>{t("coaches.fig.chat.them")}</Tx>
    <rect x="152" y="80" width="296" height="36" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
    <Tx x={168} y={103} s={11}>{t("coaches.fig.chat.student")}</Tx>
    <Tx x={32} y={140} s={9} fill={SOFT}>{t("coaches.fig.chat.sophia")}</Tx>
    <rect x="32" y="148" width="328" height="52" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
    <Tx x={48} y={170} s={11}>{t("coaches.fig.chat.reply1")}</Tx>
    <Tx x={48} y={188} s={11}>{t("coaches.fig.chat.reply2")}</Tx>
    {/* Le soir, MOT POUR MOT (daily_pulse.ts:114 et :84-88). L'ancienne page
        écrivait « How did today go? / Good / Mixed / Hard » : une paraphrase
        présentée comme une capture, le défaut B13 sur une seconde surface. */}
    <Tx x={32} y={224} s={9} fill={SOFT}>{t("coaches.fig.chat.evening")}</Tx>
    <rect x="32" y="232" width="328" height="48" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
    <Tx x={48} y={252} s={11}>{t("coaches.fig.chat.question")}</Tx>
    {(["tap_good", "tap_mixed", "tap_rough"] as const).map((k, i) => (
      <g key={k}>
        <rect x={48 + i * 100} y="258" width="92" height="16" rx="8" fill="none" stroke={SOFT} strokeWidth="1" />
        <Tx x={94 + i * 100} y={269} s={9} anchor="middle" fill={SOFT}>{t(`coaches.fig.chat.${k}`)}</Tx>
      </g>
    ))}
  </svg>
);

/** La relecture, POSÉE SUR LE BLOC SOMBRE : permis à une figure de concept,
 *  interdit à une maquette (F12) — une surface d'app sur fond sombre montrerait
 *  un produit qui n'existe pas. Ceci est un mécanisme, pas une surface.
 *  ⚠️ `.on-dark` ne remappe que `--ill-fig` et `--ill-ink-soft` (vers fig-300) :
 *  `--ill-ink` y serait INVISIBLE. Le contenu des messages passe donc en
 *  `--ill-paper` (17,05:1), étiquettes et contours en `--ill-ink-soft`. */
const LockFigure = () => (
  <svg viewBox="0 0 480 288" className="h-auto w-full" role="img" aria-labelledby="fig-lock-t fig-lock-d">
    <title id="fig-lock-t">{t("coaches.fig.lock.title")}</title>
    <desc id="fig-lock-d">{t("coaches.fig.lock.desc")}</desc>
    <EqLabel d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" x={44} y={26}>{t("coaches.fig.lock.eq")}</EqLabel>
    <g fill="none" stroke={SOFT} strokeWidth="1">
      <rect x="24" y="44" width="432" height="44" rx="12" />
      <rect x="24" y="100" width="432" height="44" rx="12" />
      <rect x="24" y="200" width="432" height="76" rx="12" />
      {/* La pastille d'état est en contour sourd et c'est le MOT qui porte
          l'état : sur une page de vente il n'y a pas d'instant, donc une
          pastille colorée y serait de la décoration en costume de sens. */}
      <rect x="372" y="110" width="68" height="18" rx="9" />
      <path d="M 48 88 L 48 100" strokeLinecap="round" />
      <path d="M 48 144 L 48 156" strokeLinecap="round" />
      <path d="M 48 188 L 48 200" strokeLinecap="round" />
    </g>
    <Tx x={40} y={62} s={9} fill={SOFT}>{t("coaches.fig.lock.ask_label")}</Tx>
    <Tx x={40} y={82} s={13} fill={PAPER}>{t("coaches.fig.lock.ask")}</Tx>
    <Tx x={40} y={118} s={9} fill={SOFT}>{t("coaches.fig.lock.draft_label")}</Tx>
    <Tx x={40} y={138} s={13} fill={SOFT}>{t("coaches.fig.lock.draft")}</Tx>
    <text x="406" y="123" fontSize="9" textAnchor="middle" fill={SOFT}>{t("coaches.fig.lock.held")}</text>
    {/* La relecture : la seconde pièce chaude, avec l'équerre. */}
    <rect x="24" y="156" width="432" height="32" rx="12" fill="none" stroke={FIG} strokeWidth="2" />
    <Tx x={40} y={176} s={11} fill={PAPER}>{t("coaches.fig.lock.gate")}</Tx>
    <Tx x={440} y={176} s={9} anchor="end" fill={SOFT}>{t("coaches.fig.lock.gate_note")}</Tx>
    <Tx x={40} y={218} s={9} fill={SOFT}>{t("coaches.fig.lock.sent_label")}</Tx>
    <Tx x={40} y={240} s={13} fill={PAPER}>{t("coaches.fig.lock.sent1")}</Tx>
    <Tx x={40} y={256} s={13} fill={PAPER}>{t("coaches.fig.lock.sent2")}</Tx>
    <Tx x={40} y={270} s={11} fill={SOFT}>{t("coaches.fig.lock.sign")}</Tx>
  </svg>
);

/** La page du lundi — copiée sur `etalon-maquette.svg`, qui dessine cet écran
 *  exact. Chaque chaîne vient du code : « This week » (CoachWeeklyPage.tsx:192),
 *  les trois lignes de prose (coach_synthesis.ts:538-568), « Worth a message »
 *  (:231), « no number to show » (:272), « The numbers » (:282). La flèche de
 *  « Week of … » est DESSINÉE : U+2192 n'a de glyphe dans aucune des deux
 *  familles, et tapé il tomberait en repli système au milieu d'une citation. Les
 *  nombres tombent juste (25+6+3 = 34, 21+9+4 = 34) : une maquette dont les
 *  nombres sont faux est lue par un coach qui compte. */
function MondayFigure() {
  const rows = ([1, 2, 3] as const).map((i) => ({
    name: t(`coaches.fig.monday.s${i}_name`),
    reason: t(`coaches.fig.monday.s${i}_reason`),
    state: i === 3 ? null : t(`coaches.fig.monday.s${i}_state`),
  }));
  const nums = [{ k: "n1_label", v: "25", x: 40 }, { k: "n2_label", v: "6", x: 184 },
                { k: "n3_label", v: "3", x: 328 }] as const;
  return (
    <svg viewBox="0 0 480 380" className="h-auto w-full" role="img" aria-labelledby="fig-monday-t fig-monday-d">
      <title id="fig-monday-t">{t("coaches.fig.monday.title")}</title>
      <desc id="fig-monday-d">{t("coaches.fig.monday.desc")}</desc>
      <rect x="8" y="8" width="464" height="364" rx="16" fill={WASH} stroke={SOFT} strokeWidth="1" />
      <EqLabel d="M 8 40 L 8 16 A 8 8 0 0 1 16 8 L 40 8" x={28} y={46} inside>{t("coaches.fig.monday.app_title")}</EqLabel>
      <g fill={PAPER} stroke={SOFT} strokeWidth="1">
        <rect x="24" y="60" width="432" height="98" rx="12" />
        <rect x="24" y="172" width="432" height="128" rx="12" />
        <rect x="24" y="310" width="432" height="54" rx="12" />
      </g>
      <Tx x={40} y={82} s={9} fill={SOFT}>{t("coaches.fig.monday.week_label")}</Tx>
      <Tx x={178} y={82} s={9} fill={SOFT}>{t("coaches.fig.monday.week_to")}</Tx>
      <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 158 79 L 172 79" />
        <path d="M 167 75 L 172 79 L 167 83" />
      </g>
      <Tx x={40} y={104} s={11}>{t("coaches.fig.monday.line1")}</Tx>
      <Tx x={40} y={122} s={11}>{t("coaches.fig.monday.line2")}</Tx>
      <Tx x={40} y={140} s={11}>{t("coaches.fig.monday.line3")}</Tx>
      {/* Le filet vertical de 2 est l'idiome de l'app promu : `CoachWeeklyPage`
          borde déjà chaque élève signalé d'un `border-l-2`. */}
      <Tx x={40} y={194} s={9} fill={SOFT}>{t("coaches.fig.monday.flagged_label")}</Tx>
      {rows.map((row, i) => (
        <g key={row.name}>
          <path d={`M 40 ${206 + i * 32} L 40 ${222 + i * 32}`} stroke={SOFT} strokeWidth="2" strokeLinecap="round" />
          <Tx x={56} y={219 + i * 32} s={11} bold>{row.name}</Tx>
          <Tx x={140} y={219 + i * 32} s={11} fill={SOFT}>{row.reason}</Tx>
          {row.state ? (
            <>
              <rect x="286" y={208 + i * 32} width="52" height="16" rx="8" fill="none" stroke={SOFT} strokeWidth="1" />
              <Tx x={312} y={219 + i * 32} s={9} anchor="middle" fill={SOFT}>{row.state}</Tx>
            </>
          ) : (
            <Tx x={286} y={219 + i * 32} s={9} fill={SOFT}>{t("coaches.fig.monday.s3_none")}</Tx>
          )}
        </g>
      ))}
      {/* Les chiffres en dernier et en petit : c'est l'ordre de l'écran réel. */}
      <Tx x={40} y={330} s={9} fill={SOFT}>{t("coaches.fig.monday.numbers_label")}</Tx>
      {nums.map((n) => (
        <g key={n.k}>
          <Tx x={n.x} y={346} s={9} fill={SOFT}>{t(`coaches.fig.monday.${n.k}`)}</Tx>
          <text x={n.x} y="359" fontSize="12" fill={INK} style={{ fontVariantNumeric: "tabular-nums" }}>{n.v}</text>
        </g>
      ))}
    </svg>
  );
}

export default CoachesPage;
