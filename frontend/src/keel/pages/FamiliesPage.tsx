import React from "react";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t } from "../i18n/t";

/**
 * KEEL — `/families`, la porte de vente du FOYER. Namespace i18n: `families`.
 *
 * L'ACHETEUR. Une personne qui nourrit trois bouches ou plus, aux besoins
 * différents. Le voisinage lui vend un FILTRE de recettes, et personne n'écrit
 * ce qui se passe quand la contrainte n'est PAS lisible. Son objection réelle
 * n'est donc pas le prix, c'est « je ne délègue pas ça à une application » — et
 * elle ne se lève pas avec un adjectif, elle se lève avec un COMPORTEMENT.
 * D'où l'argument central: le produit REFUSE. `generate-household-meal-v1:
 * 1643-1648,1674-1680` rend 503 `safety_constraints_unreadable` quand l'union
 * des contraintes du foyer ne peut pas être lue, et ne compose rien.
 *
 * LE MOT QUI N'APPARAÎT NULLE PART: « PARTOUT ». La garde couvre ce qui se
 * FABRIQUE (la semaine, le repas); une réponse écrite dans le chat ne recharge
 * pas l'union du foyer (`run.ts:2211`, FF-046 §7 trou n°8). Le trou est NOMMÉ
 * dans le bloc sombre plutôt que recouvert: sur un sujet d'allergie, une
 * promesse trop large fabrique un faux sentiment de sécurité — c'est le
 * reproche que le monde de l'allergie alimentaire fait au mot
 * « allergy-friendly ». Même raison: cette page n'écrit jamais « sûr », « sans
 * risque » ni « safe ». Elle décrit ce que le produit fait, et ce qu'il refuse.
 *
 * TROIS INTERDITS PROPRES À CETTE PAGE. (1) Aucune durée — « 90 secondes » n'est
 * mesuré nulle part dans le dépôt (C14, règle S8), on dit les quatre CHAMPS.
 * (2) Aucun vocabulaire de régime autour d'un enfant: ni poids, ni chiffre, ni
 * corps — le produit tient la règle en structure (C10), la copie la tient en
 * registre. (3) Aucune promesse médicale, dite en toutes lettres dans le sombre.
 *
 * CE QU'ON NE VEND PAS PARCE QUE C'EST MORT: le « conseil de famille ». FF-050
 * §3 — aucune récolte par membre, aucun arbitrage en code, `envy_line_used`
 * jamais rendu. Ce qui existe est UNE ligne, écrite par le maître, lue par le
 * générateur: c'est tout ce que `Envy` promet.
 *
 * LE PRIX. 12,99 € le foyer entier, le maître jamais compté, plafond 8 bouches.
 * Le prix est DIT (FF-049); la durée d'essai et le geste d'achat ne le sont pas
 * — le tunnel ne peut pas encaisser aujourd'hui (AUDIT §8 n°1). CTA unique et
 * répété: `/start`, dont la branche `family` attend cette page.
 */

const FAMILIES_STRUCTURED_DATA = [organizationStructuredData(), {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Sophia",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  url: `${LEGAL_ENTITY.siteUrl}/families`,
  description: t("families.seo_description"),
  publisher: organizationStructuredData(),
}];

export function FamiliesPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO title={t("families.seo_title")} description={t("families.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/families`} structuredData={FAMILIES_STRUCTURED_DATA} />
      <PublicHeader />
      <main>
        <Hero />
        <Refusal />
        <Mouths />
        <Portions />
        <Envy />
        <Pricing />
        <NotPromised />
        <Closing />
      </main>
      <PublicFooter />
    </div>
  );
}

const INK = "var(--ill-ink, #23191F)", SOFT = "var(--ill-ink-soft, #6A5A64)";
const PAPER = "var(--ill-paper, #FBF8FA)", WASH = "var(--ill-wash, #EFE0E9)";
const FIG = "var(--ill-fig, #632C4C)";

/* Le gabarit d'une section. Padding horizontal et vertical en classes SÉPARÉES:
   un raccourci `padding` remet l'horizontal à zéro et sort le titre de l'écran
   à 320 px (CHARTE §4, mesuré). */
function Section(
  { tone = "paper", children }: { tone?: "paper" | "paper-2" | "dark"; children: React.ReactNode },
) {
  const skin = tone === "dark" ? "on-dark bg-fig-950 text-paper" : tone === "paper-2" ? "bg-paper-2" : "bg-paper";
  return (
    <section className={skin}>
      <div className="mx-auto max-w-[1200px] px-5 pt-11 pb-10 sm:px-8 sm:pt-[84px] sm:pb-[76px]">{children}</div>
    </section>
  );
}

/* Le gabarit d'une figure. Toute figure porte du sens, donc AUCUNE n'est
   `aria-hidden` (F13). L'équerre et son libellé sont ici: elle ne flotte jamais
   seule. Largeur plancher 380 px et défilement borné: `.fig-scroll`. */
function Fig(
  { id, label, title, desc, children }: {
    id: string; label: string; title: string; desc: string; children: React.ReactNode;
  },
) {
  return (
    <div className="fig-scroll">
      <svg viewBox="0 0 480 240" role="img" aria-labelledby={`${id}-t ${id}-d`}
        className="h-auto w-full max-w-[480px] font-sans">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        <path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
        <text x="44" y="26" fontSize="11" fontWeight="600" letterSpacing="1.2" fill={SOFT}>{label}</text>
        {children}
      </svg>
    </div>
  );
}

/** Le CTA de la page. Un seul geste, répété: `/start` (AUDIT §10). */
function StartLink() {
  // Mesuré: `text-base` PERD contre le `text-sm` de `buttonClass` (14 px rendu),
  // la valeur arbitraire passe, et le padding gagne sans artifice.
  const c = "px-5 py-2.5 text-[1rem]";
  return <ButtonLink to="/start" variant="brand" className={c}>{t("families.hero.cta")}</ButtonLink>;
}

/* ═══ 1. LE HÉROS ═══════════════════════════════════════════════════════════
   La thèse en une image: quatre bouches, une seule contrainte, et c'est TOUTE la
   casserole qui la porte. Elle est dessinée VIDE — une figure qui dessinerait un
   plat promettrait une assiette que personne n'a cuisinée (CHARTE §8). */
function Hero() {
  return (
    <Section>
      <div className="grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <div>
          <Kicker>{t("families.hero.kicker")}</Kicker>
          {/* fact: C9 — generate-household-meal-v1:1643-1648 · household_safety.ts:201 */}
          <h1 className="mt-3 text-balance font-display text-hero">{t("families.hero.title")}</h1>
          <p className="mt-5 max-w-[62ch] text-lede text-ink-soft">{t("families.hero.lede")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <StartLink />
            {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250 */}
            <p className="text-sm text-ink-soft">{t("families.hero.price_note")}</p>
          </div>
        </div>
        <PotFigure />
      </div>
    </Section>
  );
}

function PotFigure() {
  return (
    <Fig id="fig_pot" label={t("families.fig_pot.label")}
      title={t("families.fig_pot.a11y_title")} desc={t("families.fig_pot.a11y_desc")}>
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="24" y="52">{t("families.fig_pot.col_mouths")}</text>
        <text x="140" y="52">{t("families.fig_pot.col_allergies")}</text>
      </g>
      <g fill={PAPER} stroke={SOFT} strokeWidth="1">
        <rect x="24" y="60" width="200" height="28" rx="4" /><rect x="24" y="96" width="200" height="28" rx="4" />
        <rect x="24" y="132" width="200" height="28" rx="4" /><rect x="24" y="168" width="200" height="28" rx="4" />
      </g>
      <g fontSize="11" fill={INK}>
        <text x="36" y="79">{t("families.fig_pot.m1")}</text>
        <text x="36" y="115">{t("families.fig_pot.m2")}</text>
        <text x="36" y="151">{t("families.fig_pot.m3")}</text>
        <text x="36" y="187">{t("families.fig_pot.m4")}</text>
        <text x="140" y="115">{t("families.fig_pot.m2_allergy")}</text>
      </g>
      <g fontSize="11" fill={SOFT}>
        <text x="140" y="79">{t("families.fig_pot.none")}</text>
        <text x="140" y="151">{t("families.fig_pot.none")}</text>
        <text x="140" y="187">{t("families.fig_pot.none")}</text>
      </g>
      {/* Quatre lignes, un seul trait: l'union est DESSINÉE, pas écrite. */}
      <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
        <path d="M 240 74 L 240 182" /><path d="M 224 74 L 240 74" /><path d="M 224 110 L 240 110" />
        <path d="M 224 146 L 240 146" /><path d="M 224 182 L 240 182" /><path d="M 240 128 L 292 128" />
      </g>
      <g stroke={FIG} strokeWidth="2" strokeLinejoin="round" fill={PAPER}>
        <rect x="296" y="119" width="30" height="18" rx="9" /><rect x="426" y="119" width="30" height="18" rx="9" />
        <circle cx="376" cy="128" r="52" />
      </g>
      <circle cx="376" cy="128" r="40" fill={WASH} />
      <text x="376" y="204" textAnchor="middle" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_pot.pot_label")}</text>
      <text x="376" y="222" textAnchor="middle" fontSize="13" fill={INK}>{t("families.fig_pot.pot_value")}</text>
    </Fig>
  );
}

/* ═══ 2. LE REFUS — seule section où la figure passe AVANT le texte: ce
   mécanisme-là se voit plus vite qu'il ne se lit. ═════════════════════════ */
function Refusal() {
  return (
    <Section tone="paper-2">
      <Kicker>{t("families.refusal.kicker")}</Kicker>
      <SectionTitle>{t("families.refusal.title")}</SectionTitle>
      <div className="mt-9 grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <GateFigure />
        <div>
          {/* fact: C9 — generate-household-meal-v1:1674-1680 (503 safety_constraints_unreadable) */}
          <p className="max-w-[62ch] text-ink-soft">{t("families.refusal.body")}</p>
          <p className="mt-6 max-w-[62ch] border-l-2 border-fig-700 pl-4 font-display text-sub">
            {t("families.refusal.line")}
          </p>
        </div>
      </div>
    </Section>
  );
}

function GateFigure() {
  return (
    <Fig id="fig_gate" label={t("families.fig_gate.label")}
      title={t("families.fig_gate.a11y_title")} desc={t("families.fig_gate.a11y_desc")}>
      <rect x="24" y="100" width="152" height="56" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      <text x="40" y="124" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_gate.in_label")}</text>
      <text x="40" y="142" fontSize="11" fill={INK}>{t("families.fig_gate.in_value")}</text>
      {/* Les deux branches partent à 45° — angles fermés (CHARTE F4). */}
      <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
        <path d="M 176 128 L 196 128 L 236 88 L 260 88" /><path d="M 176 128 L 196 128 L 236 168 L 260 168" />
      </g>
      <rect x="260" y="64" width="196" height="48" rx="12" fill={WASH} stroke={SOFT} strokeWidth="1" />
      <text x="276" y="84" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_gate.ok_label")}</text>
      <text x="276" y="102" fontSize="11" fill={INK}>{t("families.fig_gate.ok_value")}</text>
      {/* La boîte du refus reste VIDE quand celle du haut est pleine: ici le
          lavis porte « ce qui a été composé », donc son absence porte le reste. */}
      <rect x="260" y="144" width="196" height="64" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      <path d="M 268 158 L 268 194" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
      <text x="284" y="164" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_gate.no_label")}</text>
      <text x="284" y="182" fontSize="11" fill={INK}>{t("families.fig_gate.no_value")}</text>
      <text x="284" y="198" fontSize="9" fill={SOFT}>{t("families.fig_gate.code")}</text>
    </Fig>
  );
}

/* ═══ 3. LES BOUCHES SANS COMPTE ════════════════════════════════════════════ */
function Mouths() {
  return (
    <Section>
      <div className="grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <div>
          <Kicker>{t("families.mouths.kicker")}</Kicker>
          {/* fact: C8 — FF-044 · 20260810260000_household_billable_profiles.sql:179-190 (user_id = null) */}
          <SectionTitle>{t("families.mouths.title")}</SectionTitle>
          {/* fact: C14 — onboarding.ts:650-662 (prénom, date de naissance, objectif, allergies) */}
          <p className="mt-5 max-w-[62ch] text-ink-soft">{t("families.mouths.body")}</p>
        </div>
        <SheetFigure />
      </div>
    </Section>
  );
}

function SheetFigure() {
  return (
    <Fig id="fig_sheet" label={t("families.fig_sheet.label")}
      title={t("families.fig_sheet.a11y_title")} desc={t("families.fig_sheet.a11y_desc")}>
      <rect x="24" y="56" width="196" height="148" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      <text x="40" y="80" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_sheet.asked")}</text>
      <g fontSize="11" fill={INK}>
        <text x="40" y="106">{t("families.fig_sheet.f1")}</text>
        <text x="40" y="130">{t("families.fig_sheet.f2")}</text>
        <text x="40" y="154">{t("families.fig_sheet.f3")}</text>
        <text x="40" y="178">{t("families.fig_sheet.f4")}</text>
      </g>
      <g fill="none" stroke={SOFT} strokeWidth="1">
        <path d="M 40 112 L 204 112" /><path d="M 40 136 L 204 136" />
        <path d="M 40 160 L 204 160" /><path d="M 40 184 L 204 184" />
      </g>
      <g fill={PAPER} stroke={SOFT} strokeWidth="1">
        <rect x="244" y="56" width="212" height="44" rx="12" /><rect x="244" y="108" width="212" height="44" rx="12" />
        <rect x="244" y="160" width="212" height="44" rx="12" />
      </g>
      <path d="M 260 68 L 260 88" fill="none" stroke={SOFT} strokeWidth="2" strokeLinecap="round" />
      {/* Le filet chaud marque exactement les bouches sans compte: un seul `<g>`,
          donc une seule occurrence de `--ill-fig` — F8 compte les occurrences de
          l'attribut, pas les traits. */}
      <g fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round">
        <path d="M 260 120 L 260 140" /><path d="M 260 172 L 260 192" />
      </g>
      <g fontSize="13" fill={INK}>
        <text x="276" y="80">{t("families.fig_sheet.m1")}</text>
        <text x="276" y="132">{t("families.fig_sheet.m2")}</text>
        <text x="276" y="184">{t("families.fig_sheet.m3")}</text>
      </g>
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="276" y="94">{t("families.fig_sheet.has_account")}</text>
        <text x="276" y="146">{t("families.fig_sheet.no_account")}</text>
        <text x="276" y="198">{t("families.fig_sheet.no_account")}</text>
      </g>
      <text x="24" y="228" fontSize="11" fill={SOFT}>{t("families.fig_sheet.caption")}</text>
    </Fig>
  );
}

/* ═══ 4. LES PARTS ══════════════════════════════════════════════════════════
   ⚠️ Les deux assiettes sont le MÊME élément, appelé deux fois par `<use>`. En
   dessiner une plus petite pour l'enfant affirmerait une mesure qui n'atteint
   aucun écran — ici, ça ressemblerait à un régime d'enfant (CHARTE F9). */
function Portions() {
  return (
    <Section tone="paper-2">
      <div className="grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <AgeFigure />
        <div>
          <Kicker>{t("families.portions.kicker")}</Kicker>
          {/* fact: C10 — student_age.ts:199-202 · generate-week-plan-v1:435-457 (409 minor_student) */}
          <SectionTitle>{t("families.portions.title")}</SectionTitle>
          {/* fact: C10 — household.ts:115-121 goalApplies · energy_gate.ts:239 */}
          <p className="mt-5 max-w-[62ch] text-ink-soft">{t("families.portions.body")}</p>
        </div>
      </div>
    </Section>
  );
}

function AgeFigure() {
  return (
    <Fig id="fig_age" label={t("families.fig_age.label")}
      title={t("families.fig_age.a11y_title")} desc={t("families.fig_age.a11y_desc")}>
      <defs>
        <g id="fam-part" fill={WASH} stroke={SOFT} strokeWidth="1" strokeLinejoin="round">
          <g transform="rotate(-30)"><rect x="-18" y="-14" width="22" height="10" rx="4" /></g>
          <circle cx="13" cy="-4" r="6" /><circle cx="14" cy="9" r="4" />
        </g>
      </defs>
      <g fill={PAPER} stroke={INK} strokeWidth="2">
        <circle cx="88" cy="100" r="34" /><circle cx="88" cy="180" r="34" />
      </g>
      <g fill="none" stroke={SOFT} strokeWidth="1">
        <circle cx="88" cy="100" r="25" /><circle cx="88" cy="180" r="25" />
      </g>
      <use href="#fam-part" x="88" y="100" /><use href="#fam-part" x="88" y="180" />
      <path d="M 150 68 L 150 124" fill="none" stroke={SOFT} strokeWidth="2" strokeLinecap="round" />
      <path d="M 150 148 L 150 204" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="166" y="80">{t("families.fig_age.adult_label")}</text>
        <text x="166" y="160">{t("families.fig_age.minor_label")}</text>
      </g>
      <g fontSize="13" fill={INK}>
        <text x="166" y="102">{t("families.fig_age.adult_value")}</text>
        <text x="166" y="182">{t("families.fig_age.minor_value")}</text>
      </g>
      <g fontSize="11" fill={SOFT}>
        <text x="166" y="122">{t("families.fig_age.adult_note")}</text>
        <text x="166" y="202">{t("families.fig_age.minor_note")}</text>
      </g>
    </Fig>
  );
}

/* ═══ 5. L'ENVIE DE LA SEMAINE ══════════════════════════════════════════════
   UNE ligne, écrite par le maître, lue par le générateur. Rien de plus: ni
   récolte par membre, ni vote, ni retour de la semaine vers la ligne —
   l'arbitrage n'est jamais restitué à l'écran (AUDIT §5.2). */
function Envy() {
  return (
    <Section>
      <div className="max-w-[62ch]">
        <Kicker>{t("families.envy.kicker")}</Kicker>
        {/* fact: C12 — keel_household_submit_envy · generate-household-meal-v1:1579-1589 */}
        <SectionTitle>{t("families.envy.title")}</SectionTitle>
        <p className="mt-5 text-ink-soft">{t("families.envy.body")}</p>
      </div>
      <div className="mt-9"><EnvyFigure /></div>
    </Section>
  );
}

function EnvyFigure() {
  return (
    <Fig id="fig_envy" label={t("families.fig_envy.label")}
      title={t("families.fig_envy.a11y_title")} desc={t("families.fig_envy.a11y_desc")}>
      <rect x="24" y="56" width="432" height="64" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      <path d="M 40 72 L 40 104" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
      <text x="56" y="80" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_envy.field_label")}</text>
      <text x="56" y="104" fontSize="13" fill={INK}>{t("families.fig_envy.line")}</text>
      <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
        <path d="M 240 120 L 240 140" /><path d="M 48 140 L 432 140" /><path d="M 48 140 L 48 164" />
        <path d="M 112 140 L 112 164" /><path d="M 176 140 L 176 164" /><path d="M 240 140 L 240 164" />
        <path d="M 304 140 L 304 164" /><path d="M 368 140 L 368 164" /><path d="M 432 140 L 432 164" />
      </g>
      <g fill={WASH} stroke={SOFT} strokeWidth="1">
        <rect x="22" y="164" width="52" height="44" rx="12" /><rect x="86" y="164" width="52" height="44" rx="12" />
        <rect x="150" y="164" width="52" height="44" rx="12" /><rect x="214" y="164" width="52" height="44" rx="12" />
        <rect x="278" y="164" width="52" height="44" rx="12" /><rect x="342" y="164" width="52" height="44" rx="12" />
        <rect x="406" y="164" width="52" height="44" rx="12" />
      </g>
      <text x="24" y="230" fontSize="11" fill={SOFT}>{t("families.fig_envy.caption")}</text>
    </Fig>
  );
}

/* ═══ 6. LE PRIX — dit, jamais vendu ici (ni durée d'essai, ni bouton). ══════ */
function Pricing() {
  return (
    <Section tone="paper-2">
      <div className="grid gap-11 lg:grid-cols-2 lg:gap-16">
        <div>
          <Kicker>{t("families.price.kicker")}</Kicker>
          {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250 · :101-105 (plafond 8) */}
          <SectionTitle>{t("families.price.title")}</SectionTitle>
          <p className="mt-5 max-w-[62ch] text-ink-soft">{t("families.price.body")}</p>
          <div className="mt-7"><StartLink /></div>
        </div>
        <div className="grid gap-6">
          <PriceCard price={t("families.price.amount")} period={t("families.price.period")}
            label={t("families.price.label")} />
          <PriceFigure />
        </div>
      </div>
    </Section>
  );
}

function PriceFigure() {
  return (
    <Fig id="fig_price" label={t("families.fig_price.label")}
      title={t("families.fig_price.a11y_title")} desc={t("families.fig_price.a11y_desc")}>
      <rect x="22" y="64" width="44" height="44" rx="12" fill={WASH} stroke={FIG} strokeWidth="2" />
      <g fill={WASH} stroke={SOFT} strokeWidth="1">
        <rect x="78" y="64" width="44" height="44" rx="12" /><rect x="134" y="64" width="44" height="44" rx="12" />
        <rect x="190" y="64" width="44" height="44" rx="12" />
      </g>
      <g fill={PAPER} stroke={SOFT} strokeWidth="1">
        <rect x="246" y="64" width="44" height="44" rx="12" /><rect x="302" y="64" width="44" height="44" rx="12" />
        <rect x="358" y="64" width="44" height="44" rx="12" /><rect x="414" y="64" width="44" height="44" rx="12" />
      </g>
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="22" y="128">{t("families.fig_price.you")}</text>
        <text x="22" y="152">{t("families.fig_price.not_counted")}</text>
        <text x="320" y="152">{t("families.fig_price.cap")}</text>
      </g>
      <path d="M 22 170 L 458 170" fill="none" stroke={SOFT} strokeWidth="1" />
      <text x="22" y="198" fontSize="13" fill={INK}>{t("families.fig_price.amount")}</text>
      <text x="22" y="222" fontSize="11" fill={SOFT}>{t("families.fig_price.note")}</text>
    </Fig>
  );
}

/* ═══ 7. CE QU'ON NE PROMET PAS ═════════════════════════════════════════════
   Le seul bloc sombre, dépensé ici: sur un sujet d'allergie, la limite nommée
   rend le reste croyable. Aucune figure — un manque ne se dessine pas (F12). */
function NotPromised() {
  const items = [
    /* fact: C9 trou nommé — run.ts:2211 (plan_question recharge sans l'union foyer), FF-046 §7 n°8 */
    t("families.limits.i1"),
    /* fact: C16 — household_member_bodies, 20260812220000:118 (une ligne écrasée, ni date ni série) */
    t("families.limits.i2"),
    /* fact: C15 — energy_display_enabled default false (20260812230000:60) · energy_gate.ts:228-249 */
    t("families.limits.i3"),
    /* fact: C11 — FF-050 §3 (aucune récolte par membre, aucun arbitrage en code) */
    t("families.limits.i4"),
    /* fact: C17 — aucune app native dans le dépôt (ni capacitor.config, ni app.json, ni android/) */
    t("families.limits.i5"),
    /* non-claim délibéré: aucune promesse médicale, la lecture d'étiquette reste au foyer */
    t("families.limits.i6"),
  ];
  return (
    <Section tone="dark">
      <Kicker onDark>{t("families.limits.kicker")}</Kicker>
      <h2 className="mt-3 max-w-2xl text-balance font-display text-title">{t("families.limits.title")}</h2>
      <ul className="mt-9 grid gap-7 sm:grid-cols-2 sm:gap-x-16">
        {items.map((item) => (
          <li key={item} className="max-w-[62ch] border-l-2 border-fig-300 pl-4 text-fig-300">{item}</li>
        ))}
      </ul>
    </Section>
  );
}

/* ═══ 8. LA SORTIE — `/start`, dont la branche `family` attend cette page
   (AUDIT C13, onboarding.ts:84). ══════════════════════════════════════════ */
function Closing() {
  return (
    <Section>
      <div className="max-w-[62ch]">
        <Kicker>{t("families.closing.kicker")}</Kicker>
        <SectionTitle>{t("families.closing.title")}</SectionTitle>
        {/* fact: C14 — onboarding.ts:650-662 */}
        <p className="mt-5 text-lede text-ink-soft">{t("families.closing.body")}</p>
        <div className="mt-8"><StartLink /></div>
      </div>
    </Section>
  );
}

export default FamiliesPage;
