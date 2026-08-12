import React from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t } from "../i18n/t";

/**
 * KEEL — `/communities`. Le créateur d'une COMMUNAUTÉ PAYANTE, qui a déjà le récurrent.
 * Refonte 2026-08-12 : 1007 lignes et zéro figure avant, une figure par section ici. Le
 * raisonnement complet est dans `scratchpad/site/communities/RAPPORT.md`.
 *
 * SA DOULEUR EST UNE ARCHITECTURE, PAS UNE CHARGE DE TRAVAIL : un fil ne répond pas à une
 * personne. « Tu es débordé » est faux, et vaguement insultant pour qui tient cinq cents
 * membres. Deux règles en découlent. (1) On ne dénigre pas sa communauté et on n'en est pas
 * le remplaçant : son objection n°1 est « si un bot répond, plus personne ne se répond entre
 * membres », et la réponse est une ABSENCE DE SURFACE (B33), pas une promesse. ⚠️ Ne jamais
 * élargir en « personne ne partage jamais d'espace » : `/app/household` en est un, mais
 * c'est la famille. (2) On ne lui demande rien de refaire : les quatre bornes sont DANS la
 * section du palier et AVANT le prix — un « non » après le chiffre annule le chiffre.
 *
 * ⛔ SUPPRIMÉ, ET NE DOIT PAS REVENIR. Le bloc « no calories »
 * (`communities.doctrine.no_calories_*`) : seul claim FAUX du site DÉJÀ EN LIGNE — le
 * produit affiche des kcal (`plan/EnergyReadout.tsx:42-45`) depuis FF-059, et les deux
 * autres pages ont abandonné ce cadrage le 2026-08-06 (AUDIT §8 n°2, D4). Ce qui survit
 * est C15, borne n°4 : chiffres éteints par défaut, chaîne de gardes pour les allumer —
 * et S11 tient toujours, dans les deux sens. · « aucun score d'adhérence » : vrai en
 * pratique, VIVANT EN CODE (B15). · « la doctrine entre à chaque message » et « chaque
 * message sortant est scanné » : faux tous les deux (B7, B8) ; c'est B8b qui est écrit.
 *
 * SILENCES QUI MORDENT ICI : S1 aucune boîte de réception qui vous revient · S5 jamais « rien
 * n'arrive la nuit » (le tap du soir peut tomber à 21 h 50 ; les heures calmes ne couvrent QUE
 * la relance) · S8 aucun chiffre sans source · S9 aucune bande de risque · S10 une maquette
 * reprend le vrai champ · S12 aucun SKU membre. Vocabulaire S2 : membres / votre méthode /
 * votre voix. UN SEUL CTA : `/auth?role=coach`, 14 jours / 3 membres (B5) — le lien `/start`
 * a sauté, c'est une seconde offre pour un autre acheteur.
 */
// Hoisté hors du rendu : `SEO` garde `structuredData` dans un tableau de dépendances de
// `useEffect`, donc un littéral inline reconstruirait les <script> à chaque rendu.
const COMMUNITIES_STRUCTURED_DATA = [organizationStructuredData(), {
  "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Sophia",
  applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "en-GB",
  url: `${LEGAL_ENTITY.siteUrl}/communities`, description: t("communities.seo_description"),
  publisher: organizationStructuredData(),
}];

// Les cinq jetons d'illustration, pas un de plus (F7), écrits avec leur repli : une figure copiée hors de la page reste lisible seule.
const INK = "var(--ill-ink, #23191F)";
const SOFT = "var(--ill-ink-soft, #6A5A64)";
const PAPER = "var(--ill-paper, #FBF8FA)";
const WASH = "var(--ill-wash, #EFE0E9)";
const FIG = "var(--ill-fig, #632C4C)";
const SPLIT = "mt-8 grid gap-11 lg:grid-cols-2 lg:items-start lg:gap-16";
const BODY = "max-w-[62ch] leading-relaxed text-ink-soft";
const CLOSE = "max-w-[62ch] font-medium leading-relaxed text-ink";

export function CommunitiesPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO title={t("communities.seo_title")} description={t("communities.seo_description")} canonical={`${LEGAL_ENTITY.siteUrl}/communities`} structuredData={COMMUNITIES_STRUCTURED_DATA} />
      <PublicHeader />
      <main>
        {/* L'ORDRE EST UN ARGUMENT, PAS UN SOMMAIRE : le revenu d'abord (personne n'écoute une promesse
            de rétention avant de savoir ce que ça rapporte), la rétention ensuite — son problème n°1 —,
            les données en troisième, puis sa voix et ce qui la protège. */}
        <HeroSection />
        <TierSection />
        <RolesSection />
        <MondaySection />
        <VoiceSection />
        <LockSection />
        <PricingSection />
      </main>
      <PublicFooter />
    </div>
  );
}

/** ⚠️ PIÈGE MESURÉ (CHARTE §4) : un élément qui porte le conteneur de page ET une classe de
 * section ne redéclare JAMAIS `padding` en raccourci — `84px 0 76px` remet le padding
 * horizontal à zéro, et à 320 px le titre sortait de l'écran des deux côtés. */
function Section({ tone = "paper", children }: { tone?: "paper" | "paper-2" | "dark"; children: React.ReactNode }) {
  const skin = tone === "dark" ? "bg-fig-950 text-paper on-dark" : tone === "paper-2" ? "bg-paper-2" : "bg-paper";
  return (
    <section className={`border-t border-line ${skin}`}>
      <div className="mx-auto max-w-[1200px] px-5 pt-11 pb-10 sm:px-8 sm:pt-[84px] sm:pb-[76px]">{children}</div>
    </section>
  );
}

/** `fig-scroll` donne une largeur PLANCHER et laisse le conteneur défiler dessous : sans
 * lui, étirée sur les 280 px utiles d'un 320, la figure rend son texte à 5-7 px. */
function Figure({ caption, dark, className = "", children }: { caption?: string; dark?: boolean; className?: string; children: React.ReactNode }) {
  const cls = `mt-4 max-w-[62ch] text-sm leading-6 ${dark ? "text-fig-300" : "text-ink-soft"}`;
  return (
    <figure className={className}>
      <div className="fig-scroll">{children}</div>
      {caption ? <figcaption className={cls}>{caption}</figcaption> : null}
    </figure>
  );
}

/** Le cadre commun aux six figures. ⚠️ L'ÉQUERRE COMPTE POUR UNE DES DEUX OCCURRENCES DE
 * `--ill-fig` AUTORISÉES PAR FIGURE (F8) : chacune n'en a donc qu'UNE autre, son sujet. */
function FigSvg({ id, h = 240, title, desc, label, children }: { id: string; h?: 240 | 380; title: string; desc: string; label?: string; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 480 ${h}`} role="img" aria-labelledby={`${id}-t ${id}-d`} style={{ fontVariantNumeric: "tabular-nums" }}>
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      <path d={h === 380 ? "M 8 40 L 8 16 A 8 8 0 0 1 16 8 L 40 8" : "M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8"} fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
      {label ? <Tx x={44} y={26} s={11} ls={1.2} fill={SOFT}>{label}</Tx> : null}
      {children}
    </svg>
  );
}

/** Le texte d'une figure et ses trois seules tailles (F11) : 9 étiquette (`Key`, toujours capitales et `SOFT`), 11 ligne, 13 valeur. */
function Tx({ x, y, s = 13, fill = INK, ls, anchor, children }: { x: number; y: number; s?: number; fill?: string; ls?: number; anchor?: "middle" | "end"; children: string }) {
  return <text x={x} y={y} fontSize={s} fontWeight={ls ? 600 : undefined} letterSpacing={ls} textAnchor={anchor} fill={fill}>{children}</text>;
}

function Key({ x, y, ls = 0.9, children }: { x: number; y: number; ls?: number; children: string }) {
  return <Tx x={x} y={y} s={9} ls={ls} fill={SOFT}>{children}</Tx>;
}

function Cta({ label }: { label: string }) {
  return <ButtonLink to="/auth?role=coach" variant="brand" className="px-6 py-3 text-base">{label}</ButtonLink>;
}

function SignIn({ prompt, link }: { prompt: string; link: string }) {
  const cls = "font-medium text-fig-700 underline underline-offset-2";
  return <p className="mt-6 text-sm text-ink-soft">{prompt} <Link to="/auth" className={cls}>{link}</Link></p>;
}

/**
 * 1. LE HERO, et la FIGURE A. Le motif dont tout le reste hérite : le TRAIT DE 2 À GAUCHE
 * D'UNE RANGÉE = quelque chose qui s'adresse à cette rangée-là. C'est l'idiome de l'app
 * promu au rang de signature (`CoachWeeklyPage.tsx:243`), l'équerre à l'échelle d'une
 * ligne. Les quatre rangées sont IDENTIQUES des deux côtés : rien n'affirme une mesure
 * (F9), seule la relation change.
 */
function HeroSection() {
  const rows = [84, 112, 140, 168];
  return (
    <section className="bg-paper">
      <div className="mx-auto grid max-w-[1200px] gap-11 px-5 pt-11 pb-10 sm:px-8 sm:pt-[84px] sm:pb-[76px] lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <Kicker>{t("communities.hero.kicker")}</Kicker>
          <h1 className="mt-4 max-w-[18ch] text-balance font-display text-hero">{t("communities.hero.title")}</h1>
          <p className="mt-5 max-w-[62ch] text-lede text-ink-soft">{t("communities.hero.lede")}</p>
          <div className="mt-8"><Cta label={t("communities.hero.cta")} /></div>
          {/* fact: B5 — 14 jours, 3 membres · B32 — invitation e-mail, aucun lien à copier · S1 — aucune boîte de réception en retour. */}
          <p className="mt-4 max-w-[52ch] text-sm leading-6 text-ink-soft">{t("communities.hero.note")}</p>
          <SignIn prompt={t("communities.hero.signin_prompt")} link={t("communities.hero.signin_link")} />
        </div>
        <Figure>
          <FigSvg id="fig-lane" title={t("communities.fig_lane.alt_title")} desc={t("communities.fig_lane.alt_desc")} label={t("communities.fig_lane.label")}>
            {/* fact: B33 — dans un fil, une seule réponse ouvre tout le monde à la fois. */}
            <rect x="24" y="52" width="196" height="140" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
            <Key x={40} y={74} ls={1}>{t("communities.fig_lane.thread_label")}</Key>
            <path d="M 44 84 L 44 184" fill="none" stroke={SOFT} strokeWidth="2" strokeLinecap="round" />
            <rect x="252" y="52" width="204" height="140" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
            <Key x={268} y={74} ls={1}>{t("communities.fig_lane.tier_label")}</Key>
            {/* La seule autre pièce chaude du dessin : les quatre lignes privées. */}
            <g fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round">
              {rows.map((y) => <path key={y} d={`M 272 ${y} L 272 ${y + 16}`} />)}
            </g>
            <g fill={PAPER} stroke={SOFT} strokeWidth="1">
              {rows.map((y) => <rect key={y} x="58" y={y} width="146" height="16" rx="4" />)}
              {rows.map((y) => <rect key={`r${y}`} x="286" y={y} width="154" height="16" rx="4" />)}
            </g>
            <Tx x={24} y={216} s={11}>{t("communities.fig_lane.thread_caption")}</Tx>
            <Tx x={252} y={216} s={11}>{t("communities.fig_lane.tier_caption")}</Tx>
          </FigSvg>
        </Figure>
      </div>
    </section>
  );
}

/**
 * 2. LE PALIER, et la FIGURE B, dont la garde est dans la STRUCTURE DU FICHIER : les deux
 * offres sont le même `<g id="offer">`, appelé deux fois. On ne PEUT donc pas dessiner
 * « le palier est plus gros » (F9, le geste des deux assiettes de l'étalon). Les hauteurs
 * n'encodent aucun prix : l'écart se lit dans les valeurs écrites.
 */
function TierSection() {
  // Clés littérales, jamais construites par gabarit : un `as` sur une clé rend le renommage invisible au compilateur.
  const bounds: [string, string][] = [
    [t("communities.tier.not1_title"), t("communities.tier.not1_body")],
    [t("communities.tier.not2_title"), t("communities.tier.not2_body")],
    [t("communities.tier.not3_title"), t("communities.tier.not3_body")],
    [t("communities.tier.not4_title"), t("communities.tier.not4_body")],
  ];
  return (
    <Section tone="paper-2">
      <Kicker>{t("communities.tier.kicker")}</Kicker>
      <SectionTitle>{t("communities.tier.title")}</SectionTitle>
      <div className={SPLIT}>
        <div>
          <p className={BODY}>{t("communities.tier.body")}</p>
          {/* fact: B30 — 500 membres, 3 sur 10 : 150 × 12 € − 150 × 7 € = 750 €/mois. L'arithmétique est juste, et la légende l'étiquette « exemple ». */}
          <p className={`mt-6 ${CLOSE}`}>{t("communities.tier.example")}</p>
          <p className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-soft">{t("communities.tier.example_caption")}</p>
          {/* fact: S12 — aucun SKU membre dans `stripe-create-checkout-session`. */}
          <p className="mt-6 max-w-[62ch] border-t border-line pt-6 leading-relaxed text-ink">{t("communities.tier.billing")}</p>
        </div>
        <Figure>
          <FigSvg id="fig-tier" title={t("communities.fig_tier.alt_title")} desc={t("communities.fig_tier.alt_desc")} label={t("communities.fig_tier.label")}>
            <defs>
              <g id="offer">
                <rect x="0" y="0" width="200" height="68" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
                <g fill={WASH}>
                  {[[168, 16], [140, 32], [108, 48]].map(([w, y]) => <rect key={y} x="16" y={y} width={w} height="8" rx="4" />)}
                </g>
              </g>
            </defs>
            {/* La bande ajoutée : seule pièce chaude, et seule différence entre les deux appels. */}
            <rect x="140" y="38" width="200" height="22" rx="4" fill={WASH} stroke={FIG} strokeWidth="1" />
            <use href="#offer" x="140" y="60" />
            <use href="#offer" x="140" y="152" />
            <Tx x={156} y={53} s={11}>{t("communities.fig_tier.band")}</Tx>
            <Key x={24} y={52} ls={1}>{t("communities.fig_tier.tier_label")}</Key>
            <Tx x={24} y={74}>{t("communities.fig_tier.tier_value")}</Tx>
            <Key x={24} y={166} ls={1}>{t("communities.fig_tier.base_label")}</Key>
            <Tx x={24} y={188}>{t("communities.fig_tier.base_value")}</Tx>
            <Key x={352} y={52} ls={1}>{t("communities.fig_tier.cost_label")}</Key>
            <Tx x={352} y={74}>{t("communities.fig_tier.cost_value")}</Tx>
          </FigSvg>
        </Figure>
      </div>
      <h3 className="eq mt-12 text-label font-semibold uppercase text-ink-soft">{t("communities.tier.not_label")}</h3>
      {/* fact: C17/B1bis — aucune intégration Skool/Circle/Discord/Kajabi · B33 — aucune surface sociale · S12 — aucun encaissement du membre · C15 — chiffres d'énergie éteints par défaut. */}
      <dl className="mt-6 grid gap-8 border-t border-line pt-8 sm:grid-cols-2 sm:gap-x-16 lg:grid-cols-4">
        {bounds.map(([title, body]) => (
          <div key={title}>
            <dt className="font-display text-sub">{title}</dt>
            <dd className="mt-2 text-sm leading-6 text-ink-soft">{body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/**
 * 3. LES RÔLES, la section la plus facile à rater, et la FIGURE C. Chaque nombre dessiné
 * est un seuil du code : `REENGAGE_AFTER_HOURS = 72`, un message par épisode, écart
 * minimal d'une semaine (`reengagement.ts:45,53,211-213`) — la ligne qui repart nue après
 * le message est donc vérifiable.
 */
function RolesSection() {
  return (
    <Section>
      <Kicker>{t("communities.roles.kicker")}</Kicker>
      <SectionTitle>{t("communities.roles.title")}</SectionTitle>
      {/* fact: B33 — pas de fil, pas de salon, pas de commentaire : il n'y a nulle part où emmener sa couche sociale. */}
      <p className={`mt-6 ${BODY}`}>{t("communities.roles.body")}</p>
      <dl className="mt-10 grid gap-8 border-t border-line pt-8 sm:grid-cols-2 sm:gap-16">
        <div>
          <dt className="font-display text-sub">{t("communities.roles.group_title")}</dt>
          <dd className="mt-2 text-sm leading-6 text-ink-soft">{t("communities.roles.group_body")}</dd>
        </div>
        {/* fact: B24 — les heures calmes 21 h-8 h ne couvrent QUE la relance, et c'est d'elle seule que parle cette colonne. ⚠️ S5 : jamais « rien n'arrive la nuit ». */}
        <div className="border-l-2 border-fig-700 pl-6">
          <dt className="font-display text-sub">{t("communities.roles.agent_title")}</dt>
          <dd className="mt-2 text-sm leading-6 text-ink-soft">{t("communities.roles.agent_body")}</dd>
        </div>
      </dl>
      <Figure className="mt-10" caption={t("communities.roles.figure_caption")}>
        <FigSvg id="fig-third" title={t("communities.fig_third_day.alt_title")} desc={t("communities.fig_third_day.alt_desc")} label={t("communities.fig_third_day.label")}>
          <rect x="24" y="104" width="168" height="48" rx="4" fill={PAPER} stroke={SOFT} strokeWidth="1" />
          <Key x={40} y={124} ls={1}>{t("communities.fig_third_day.last_label")}</Key>
          <Tx x={40} y={142}>{t("communities.fig_third_day.last_value")}</Tx>
          {/* fact: B21 — 72 h de silence, un message, puis ça se tait. */}
          <g stroke={FIG}>
            <rect x="268" y="104" width="172" height="48" rx="4" fill={WASH} strokeWidth="1" />
            <path d="M 268 116 L 268 140" fill="none" strokeWidth="2" strokeLinecap="round" />
          </g>
          <Key x={284} y={124} ls={1}>{t("communities.fig_third_day.message_label")}</Key>
          <Tx x={284} y={142}>{t("communities.fig_third_day.message_value")}</Tx>
          <path d="M 40 172 L 440 172" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
            <path d="M 108 152 L 108 172" />
            <path d="M 354 152 L 354 172" />
            {[140, 240, 340].map((x) => <path key={x} d={`M ${x} 166 L ${x} 178`} />)}
          </g>
          <Tx x={232} y={200} s={11} fill={SOFT} anchor="middle">{t("communities.fig_third_day.silence")}</Tx>
          <Tx x={440} y={200} s={11} fill={SOFT} anchor="end">{t("communities.fig_third_day.after")}</Tx>
        </FigSvg>
      </Figure>
      <p className={`mt-10 ${CLOSE}`}>{t("communities.roles.close")}</p>
    </Section>
  );
}

/**
 * 4. LE LUNDI, et la FIGURE D — une MAQUETTE, sans chrome de navigateur ni cadre de
 * téléphone : il n'existe AUCUNE application mobile (C17). LES NOMBRES TOMBENT JUSTE, et
 * c'est la cohorte de l'exemple de revenu : 71+34+45 = 150, 58+26+11+55 = 150. ⚠️ La
 * dernière ligne dit « built », le mot du moteur (`coach_synthesis.ts:566-568`) — la page
 * précédente écrivait « wrote » en prétendant citer (B13). ⚠️ AUCUNE PASTILLE COLORÉE
 * (F10) : sur une page de vente il n'y a pas d'instant, donc le mot porte l'état. S9.
 */
function MondaySection() {
  const rows: [number, string, string, string][] = [
    [108, t("communities.fig_monday.in_touch"), t("communities.fig_monday.in_touch_hint"), "71"],
    [136, t("communities.fig_monday.slipping"), t("communities.fig_monday.slipping_hint"), "34"],
    [164, t("communities.fig_monday.silent"), t("communities.fig_monday.silent_hint"), "45"],
    [240, t("communities.fig_monday.holding"), "", "58"],
    [262, t("communities.fig_monday.strained"), "", "26"],
    [284, t("communities.fig_monday.hard"), "", "11"],
    [306, t("communities.fig_monday.unknown"), "", "55"],
  ];
  return (
    <Section tone="paper-2">
      <Kicker>{t("communities.monday.kicker")}</Kicker>
      <SectionTitle>{t("communities.monday.title")}</SectionTitle>
      <div className={SPLIT}>
        <div>
          {/* fact: B11 — cron hebdo, texte rendu par GABARIT (`renderSynthesisText` est pure), jamais narré par un modèle. */}
          <p className={BODY}>{t("communities.monday.body")}</p>
          <p className={`mt-6 ${CLOSE}`}>{t("communities.monday.close")}</p>
        </div>
        <Figure caption={t("communities.monday.figure_caption")}>
          <FigSvg id="fig-monday" h={380} title={t("communities.fig_monday.alt_title")} desc={t("communities.fig_monday.alt_desc")}>
            <rect x="8" y="8" width="464" height="364" rx="16" fill={WASH} stroke={SOFT} strokeWidth="1" />
            <text x="28" y="46" fontSize="15" fontWeight="600" fill={FIG}>{t("communities.fig_monday.screen_title")}</text>
            <g fill={PAPER} stroke={SOFT} strokeWidth="1">
              {[[60, 122], [194, 122], [328, 36]].map(([y, h]) => <rect key={y} x="24" y={y} width="432" height={h} rx="12" />)}
            </g>
            <Key x={40} y={82}>{t("communities.fig_monday.contact_label")}</Key>
            <Key x={40} y={216}>{t("communities.fig_monday.felt_label")}</Key>
            {rows.map(([y, label, hint, count]) => (
              <g key={y}>
                <Tx x={40} y={y} s={11}>{label}</Tx>
                {hint ? <Tx x={140} y={y} s={9} fill={SOFT}>{hint}</Tx> : null}
                <Tx x={440} y={y} anchor="end">{count}</Tx>
              </g>
            ))}
            <Tx x={40} y={352} s={11}>{t("communities.fig_monday.intent_line")}</Tx>
          </FigSvg>
        </Figure>
      </div>
    </Section>
  );
}

/**
 * 5. SA VOIX, et la FIGURE E — une MAQUETTE dont les quatre fiches sont les champs réels
 * de `doctrine.ts`. LA QUATRIÈME EST LA PREUVE, PAS LA TROISIÈME : une ligne rouge sans
 * son « à la place » n'est qu'une censure, et ce qui la rend vendable c'est que le membre
 * reçoive une réponse, celle du coach, dans ses mots (B9). D'où le trait qui ouvre la
 * dernière fiche et aucune autre. ⚠️ NI « votre marque » NI « votre nom sur les messages »
 * (B18) : zéro personnalisation existe. Ce qui suffit : ce sont SES MOTS qui sortent.
 */
function VoiceSection() {
  const fields: [number, number, string, string[]][] = [
    [60, 56, t("communities.fig_voice.address_label"), [t("communities.fig_voice.address_value")]],
    [124, 68, t("communities.fig_voice.term_label"), [t("communities.fig_voice.term_value1"), t("communities.fig_voice.term_value2")]],
    [200, 56, t("communities.fig_voice.line_label"), [t("communities.fig_voice.line_value")]],
    [264, 76, t("communities.fig_voice.instead_label"), [t("communities.fig_voice.instead_value1"), t("communities.fig_voice.instead_value2")]],
  ];
  return (
    <Section>
      <Kicker>{t("communities.voice.kicker")}</Kicker>
      <SectionTitle>{t("communities.voice.title")}</SectionTitle>
      <div className={SPLIT}>
        <div>
          <p className={BODY}>{t("communities.voice.body")}</p>
          {/* fact: B27 — le CHECK `student_week_plans_doctrine_traceable_check` REFUSE une ligne de semaine qui ne cite aucune conviction. Portée : la semaine seulement. */}
          <p className="mt-6 max-w-[62ch] leading-relaxed text-ink">{t("communities.voice.traceable")}</p>
          {/* fact: B28 — révision et rollback sans perdre l'historique. */}
          <p className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-soft">{t("communities.voice.revise")}</p>
        </div>
        <Figure>
          <FigSvg id="fig-voice" h={380} title={t("communities.fig_voice.alt_title")} desc={t("communities.fig_voice.alt_desc")}>
            <rect x="8" y="8" width="464" height="364" rx="16" fill={WASH} stroke={SOFT} strokeWidth="1" />
            <text x="28" y="46" fontSize="15" fontWeight="600" fill={FIG}>{t("communities.fig_voice.screen_title")}</text>
            {fields.map(([y, h, label, values]) => (
              <g key={y}>
                <rect x="24" y={y} width="432" height={h} rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
                <Key x={40} y={y + 20}>{label}</Key>
                {values.map((v, j) => <Tx key={v} x={40} y={y + 42 + j * 18}>{v}</Tx>)}
              </g>
            ))}
            <path d="M 24 280 L 24 324" fill="none" stroke={SOFT} strokeWidth="2" strokeLinecap="round" />
          </FigSvg>
        </Figure>
      </div>
      {/* La clôture ouvre sur le bloc sombre : la garantie arrive comme une réponse. */}
      <p className={`mt-10 border-t border-line pt-6 ${CLOSE}`}>{t("communities.voice.close")}</p>
    </Section>
  );
}

/**
 * 6. L'UNIQUE BLOC SOMBRE : le seul signal fort dont dispose une page de fiche, dépensé
 * sur l'argument qui en a besoin, et placé APRÈS la voix qu'il protège. ⚠️ FORMULATION
 * B8b : « la doctrine entre à chaque message » est faux (B7, un seul appelant) et « chaque
 * message sortant est scanné » est faux pour « chaque » (B8 : 4 surfaces scannées, 4 non).
 * FIGURE F — un CONCEPT, jamais une maquette : F12 interdit de poser une surface de
 * produit sur du sombre. `.on-dark` remonte `--ill-fig` et `--ill-ink-soft` à `fig-300`
 * mais NE touche pas `--ill-ink`, qui serait invisible — d'où l'absence totale de `INK`
 * ici. Et la pastille est CREUSE (F10) : le mot porte l'état, la couleur ne le porte pas.
 */
function LockSection() {
  return (
    <Section tone="dark">
      <Kicker onDark>{t("communities.lock.kicker")}</Kicker>
      <SectionTitle>{t("communities.lock.title")}</SectionTitle>
      <p className="mt-6 max-w-[62ch] leading-relaxed text-fig-300">{t("communities.lock.body")}</p>
      <div className="mt-10 grid gap-11 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <dl className="grid content-start gap-8">
          {/* fact: B10 — la doctrine atteint 4 points d'injection : chat, semaine, repas individuel, repas foyer. Sous-vendu partout ailleurs. */}
          <div className="border-l-2 border-fig-300 pl-6">
            <dt className="text-label font-semibold uppercase text-fig-300">{t("communities.lock.lock1_tag")}</dt>
            <dd className="mt-2 leading-relaxed">{t("communities.lock.lock1")}</dd>
          </div>
          {/* fact: B8b — ce que Sophia écrit dans le chat est relu contre les lignes rouges avant envoi, sans modèle dans cette boucle (`keel_output_locks.ts:307`). */}
          <div className="border-l-2 border-fig-300 pl-6">
            <dt className="text-label font-semibold uppercase text-fig-300">{t("communities.lock.lock2_tag")}</dt>
            <dd className="mt-2 leading-relaxed">{t("communities.lock.lock2")}</dd>
          </div>
          <p className="max-w-[42ch] text-balance text-lede font-medium">{t("communities.lock.close")}</p>
        </dl>
        <Figure dark caption={t("communities.lock.trace_note")}>
          <FigSvg id="fig-lock" title={t("communities.fig_lock.alt_title")} desc={t("communities.fig_lock.alt_desc")} label={t("communities.fig_lock.label")}>
            <g fill="none" stroke={SOFT} strokeWidth="1">
              <rect x="24" y="44" width="432" height="48" rx="12" />
              <rect x="24" y="100" width="432" height="48" rx="12" />
              <rect x="24" y="156" width="432" height="64" rx="12" />
              <rect x="380" y="110" width="60" height="18" rx="8" />
            </g>
            <Key x={40} y={64}>{t("communities.fig_lock.ask_label")}</Key>
            <Tx x={40} y={82} fill={PAPER}>{t("communities.fig_lock.ask_value")}</Tx>
            <Key x={40} y={120}>{t("communities.fig_lock.draft_label")}</Key>
            <Tx x={40} y={138} fill={SOFT}>{t("communities.fig_lock.draft_value")}</Tx>
            <Tx x={410} y={123} s={9} fill={SOFT} anchor="middle">{t("communities.fig_lock.held")}</Tx>
            <Key x={40} y={176}>{t("communities.fig_lock.sent_label")}</Key>
            <Tx x={40} y={194} fill={PAPER}>{t("communities.fig_lock.sent_value1")}</Tx>
            <Tx x={40} y={212} fill={PAPER}>{t("communities.fig_lock.sent_value2")}</Tx>
            {/* fact: B9 — chaque ligne rouge porte son `instead`, dans les mots du coach. Le trait ouvre la seule fiche que le membre reçoit. */}
            <path d="M 24 168 L 24 208" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
          </FigSvg>
        </Figure>
      </div>
    </Section>
  );
}

/**
 * 7. LE PRIX. UNE SEULE CARTE : deux cartes obligent à faire une addition, et une addition
 * sur une page de vente est un endroit où se tromper. ⚠️ « 6 € pour un SIÈGE payé à
 * l'année », jamais « quand votre membre a payé son année » : l'intervalle est celui du
 * COACH — formulation correcte (B3), c'est `/gyms` qui porte l'erreur (B2).
 */
function PricingSection() {
  return (
    <Section tone="paper-2">
      <Kicker>{t("communities.pricing.kicker")}</Kicker>
      <SectionTitle>{t("communities.pricing.title")}</SectionTitle>
      <div className="mt-8 grid gap-11 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-16">
        <div className="w-full sm:max-w-xs">
          {/* fact: B1 — 7 €/membre/mois, aucun forfait plateforme · B3 — 6 € pour un siège payé à l'année · B4 — on arrête de payer le mois où on éteint un siège. */}
          <PriceCard price={t("communities.pricing.seat")} period={t("communities.pricing.seat_period")} label={t("communities.pricing.seat_label")} />
          <p className="mt-3 text-sm leading-6 text-ink-soft">{t("communities.pricing.annual")}</p>
        </div>
        <div>
          <p className={BODY}>{t("communities.pricing.why")}</p>
          {/* fact: B31 — rien dans ce dépôt ne mesure le churn contre un témoin, et les taux qui circulent dans son écosystème sont des chiffres de blogs d'éditeurs. À conserver. */}
          <p className={`mt-6 ${CLOSE}`}>{t("communities.pricing.no_number")}</p>
        </div>
      </div>
      <div className="mt-12 border-t border-line pt-10">
        <h2 className="max-w-[28ch] text-balance font-display text-title">{t("communities.closing.title")}</h2>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Cta label={t("communities.closing.cta")} />
          <span className="text-sm text-ink-soft">{t("communities.pricing.trial_note")}</span>
        </div>
        <SignIn prompt={t("communities.closing.signin_prompt")} link={t("communities.closing.signin_link")} />
      </div>
    </Section>
  );
}

export default CommunitiesPage;
