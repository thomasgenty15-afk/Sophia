import React from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t } from "../i18n/t";

/**
 * `/couples` — LE COUPLE À OBJECTIFS DIVERGENTS. Namespace `couples`.
 *
 * ── POURQUOI C'EST LA PAGE QUI DOIT ÊTRE LA MEILLEURE ──────────────────────
 * Tout le voisinage met à l'échelle une QUANTITÉ pour N personnes. Aucun ne
 * réconcilie deux CIBLES opposées sortant de la même casserole — Eat This Much
 * le dit dans son aide (« This won't automatically handle multiple people's
 * different nutrition targets »). C'est le seul endroit du marché où ce
 * produit est seul.
 *
 * ── L'ORDRE DES SECTIONS EST LE TRAJET D'UN DOUTE, PAS UN SOMMAIRE ─────────
 * 1. « On va devoir cuisiner deux fois. » → le hero et sa figure, avant tout
 *    texte: une casserole, deux parts décrites.
 * 2. « Mon partenaire ne s'en servira pas. » → `OtherProfile`. Les concurrents
 *    supposent deux comptes actifs alors qu'un seul des deux est motivé; ici
 *    l'autre est une bouche du foyer, avec ou sans compte (C8).
 * 3. « On tiendra quinze jours. » → `WeekHolds`: la semaine encaisse (C7).
 *
 * ── CE QUE CETTE PAGE N'A PAS LE DROIT D'ÉCRIRE ────────────────────────────
 *  · UN GRAMME. La bifurcation est réelle en code (`SERVING_DIRECTION` sur 6
 *    objectifs, tronc commun = MIN, deltas calculés) mais ce qui atteint
 *    l'écran est une PHRASE, sur `/app/household` seulement: `member_deltas`
 *    n'a AUCUN écran (FF-043 §11 n°1). « 180 g pour l'un » montrerait un écran
 *    qu'on n'a pas.
 *  · « GARANTI ». `reconcilePortions` accepte quatre consignes identiques sans
 *    lever d'`issue`: rien ne vérifie que le modèle a différencié.
 *  · UNE DURÉE D'ESSAI OU UN BOUTON D'ACHAT (AUDIT §8 n°1). Le prix se dit, la
 *    date et le geste d'achat non.
 *  · « ÉCHANGER UN PLAT »: `REALIGNMENT_ACTIONS` n'a pas de « remplacer ».
 *  · « RIEN À OUVRIR / RIEN À INSTALLER » sous quelque forme que ce soit (S4).
 *  · « JAMAIS DE CALORIES »: faux depuis FF-059 (AUDIT §8 n°2).
 *  · UN RÔLE DE GENRE FIGÉ. La copie n'emploie aucun pronom personnel pour
 *    désigner le partenaire, et la figure étiquette les deux assiettes par
 *    l'OBJECTIF, jamais par la personne.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────
 * Charte « la fiche », déjà posée dans `tokens.css`. Aucune photographie: on
 * ne montre pas une assiette qu'on n'a pas cuisinée. Les trois figures sont
 * des concepts vus de dessus ou des fiches vues de face — jamais une maquette
 * d'écran, parce que `/app/household` rend ses libellés en ANGLAIS même à un
 * visiteur français (`household` n'est pas dans `PUBLIC_NAMESPACES`): une
 * maquette honnête y poserait une chaîne anglaise au milieu d'une page de
 * vente française, et une maquette traduite serait un écran qui n'existe pas.
 *
 * ⚠️ Le contrôle F8 de la charte (`grep -coE '(stroke|fill)="var\(--ill-fig'`)
 * rend **4** sur ce fichier, et c'est conforme: `FigCorner` est l'équerre
 * PARTAGÉE par les trois figures. Chaque figure RENDUE en porte donc deux —
 * son équerre et son unique objet chaud.
 */

const WRAP = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";
const SECTION = "pt-11 pb-10 sm:pt-21 sm:pb-19";

// Hoisté hors du rendu: `SEO` garde `structuredData` dans un tableau de
// dépendances de `useEffect`; un littéral inline reconstruirait les <script> à
// chaque rendu. Le nœud Organization vient de `lib/legalEntity`, jamais recopié.
const COUPLES_STRUCTURED_DATA = [
  organizationStructuredData(),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Sophia",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    url: `${LEGAL_ENTITY.siteUrl}/couples`,
    description: t("couples.seo_description"),
    publisher: organizationStructuredData(),
  },
];

/**
 * Le CTA. Un seul de toute la page, répété — jamais une seconde offre à côté.
 *
 * ⚠️ Local, et délibérément: `ui/Button.tsx` porte encore `bg-gray-900` pour
 * `variant="brand"`, d'avant la charte. Le jour où la primitive passe à
 * `fig-700`, ceci se remplace par `<ButtonLink to="/start" variant="brand">`
 * et disparaît. Aucune forme inventée: rayon, graisse et anneau de focus sont
 * ceux de `buttonClass`.
 */
function StartLink({ label }: { label: string }) {
  return (
    <Link
      to="/start"
      className="inline-flex items-center justify-center rounded-full bg-fig-700 px-5 py-3 text-[15px] font-medium text-paper transition-colors hover:bg-fig-800"
    >
      {label}
    </Link>
  );
}

/** L'équerre en SVG — même géométrie que la classe `.eq`, et jamais sans mot. */
function FigCorner() {
  return (
    <path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" fill="none" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinecap="round" />
  );
}

/** Le titre d'une figure. L'équerre ne flotte jamais seule: le mot est ici. */
function FigEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <text x="44" y="26" fontSize="11" fontWeight="600" letterSpacing="1.2" fill="var(--ill-ink-soft, #6A5A64)">{children}</text>
  );
}

/**
 * FIGURE A — une casserole, deux parts. La figure centrale du site.
 *
 * LES DEUX ASSIETTES SONT LE MÊME ÉLÉMENT, appelé deux fois par `<use>`. La
 * promesse « c'est le même plat » est tenue par la structure du fichier, pas
 * par la vigilance du relecteur — et des secteurs de tailles différentes
 * auraient affirmé par la géométrie une mesure qui n'atteint jamais l'écran.
 * Ce qui diffère est écrit en MOTS à côté, exactement comme le produit le rend.
 */
function FigPlates() {
  return (
    <svg viewBox="0 0 480 240" className="font-sans" role="img" aria-labelledby="cpl-plates-t cpl-plates-d">
      <title id="cpl-plates-t">{t("couples.fig.plates.title")}</title>
      <desc id="cpl-plates-d">{t("couples.fig.plates.desc")}</desc>
      <defs>
        {/* LA PART. Un seul élément, appelé deux fois. C'est la garde. */}
        <g id="cpl-part" fill="var(--ill-wash, #EFE0E9)" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" strokeLinejoin="round">
          <g transform="rotate(-30)"><rect x="-21" y="-17" width="26" height="12" rx="4" /></g>
          <g transform="rotate(30)"><rect x="-10" y="8" width="22" height="10" rx="5" /></g>
          <circle cx="16" cy="-5" r="7" />
          <circle cx="18" cy="9" r="5" />
          <circle cx="7" cy="-18" r="4" />
        </g>
      </defs>

      <FigCorner />
      <FigEyebrow>{t("couples.fig.plates.eyebrow")}</FigEyebrow>

      {/* LA CASSEROLE, vue de dessus. La seule pièce chaude du dessin. */}
      <g stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinejoin="round">
        <rect x="26" y="135" width="32" height="18" rx="9" fill="var(--ill-paper, #FBF8FA)" />
        <rect x="150" y="135" width="32" height="18" rx="9" fill="var(--ill-paper, #FBF8FA)" />
        <circle cx="104" cy="144" r="54" fill="var(--ill-paper, #FBF8FA)" />
      </g>
      <circle cx="104" cy="144" r="42" fill="var(--ill-wash, #EFE0E9)" />
      <text x="104" y="226" textAnchor="middle" fontSize="13" fill="var(--ill-ink-soft, #6A5A64)">{t("couples.fig.plates.pot")}</text>

      {/* LE SERVICE — deux traits d'annotation à 15° (75/20). */}
      <g fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" strokeLinecap="round">
        <path d="M 160 128 L 235 108" />
        <path d="M 160 160 L 235 180" />
      </g>

      {/* LES DEUX ASSIETTES — le même `<use>`, deux fois. */}
      <g>
        <circle cx="270" cy="99" r="36" fill="var(--ill-paper, #FBF8FA)" stroke="var(--ill-ink, #23191F)" strokeWidth="2" />
        <circle cx="270" cy="99" r="27" fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" />
        <use href="#cpl-part" x="270" y="99" />
      </g>
      <g>
        <circle cx="270" cy="189" r="36" fill="var(--ill-paper, #FBF8FA)" stroke="var(--ill-ink, #23191F)" strokeWidth="2" />
        <circle cx="270" cy="189" r="27" fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" />
        <use href="#cpl-part" x="270" y="189" />
      </g>

      {/* CE QUI DIFFÈRE: des MOTS. L'étiquette est l'OBJECTIF — jamais une
          personne, jamais un genre. Jamais un chiffre, jamais une taille. */}
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">
        <text x="322" y="83">{t("couples.fig.plates.goal_a")}</text>
        <text x="322" y="173">{t("couples.fig.plates.goal_b")}</text>
      </g>
      <g fontSize="13" fill="var(--ill-ink, #23191F)">
        <text x="322" y="102">{t("couples.fig.plates.note_a1")}<tspan x="322" dy="17">{t("couples.fig.plates.note_a2")}</tspan></text>
        <text x="322" y="192">{t("couples.fig.plates.note_b1")}<tspan x="322" dy="17">{t("couples.fig.plates.note_b2")}</tspan></text>
      </g>
    </svg>
  );
}

/**
 * FIGURE B — qui est dans le plan. Une FICHE vue de face, pas un écran.
 * Le filet vertical de 2 marque la colonne du profil réclamé: c'est l'idiome
 * `border-l-2` de l'app à l'échelle d'une figure, et c'est la seconde et
 * dernière pièce chaude.
 */
function FigWho() {
  return (
    <svg viewBox="0 0 480 240" className="font-sans" role="img" aria-labelledby="cpl-who-t cpl-who-d">
      <title id="cpl-who-t">{t("couples.fig.who.title")}</title>
      <desc id="cpl-who-d">{t("couples.fig.who.desc")}</desc>

      <FigCorner />
      <FigEyebrow>{t("couples.fig.who.eyebrow")}</FigEyebrow>

      {/* Les deux colonnes sont deux états du MÊME foyer: le trait qui les
          coiffe le dit avant qu'on ait lu un mot. */}
      <path d="M 24 60 L 24 52 L 456 52 L 456 60" fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M 248 64 L 248 186" fill="none" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinecap="round" />

      <g fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">
        <text x="24" y="80">{t("couples.fig.who.col_a")}</text>
        <text x="264" y="80">{t("couples.fig.who.col_b")}</text>
      </g>
      <g fontSize="13" fill="var(--ill-ink, #23191F)">
        <text x="24" y="110">{t("couples.fig.who.a1")}</text>
        <text x="24" y="142">{t("couples.fig.who.a2")}</text>
        <text x="24" y="174">{t("couples.fig.who.a3")}</text>
        <text x="264" y="110">{t("couples.fig.who.b1")}</text>
        <text x="264" y="142">{t("couples.fig.who.b2")}</text>
        <text x="264" y="174">{t("couples.fig.who.b3")}</text>
      </g>
      <g fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1">
        <path d="M 24 122 L 224 122" />
        <path d="M 24 154 L 224 154" />
        <path d="M 264 122 L 456 122" />
        <path d="M 264 154 L 456 154" />
        <path d="M 24 196 L 456 196" />
      </g>
      <text x="24" y="218" fontSize="13" fill="var(--ill-ink-soft, #6A5A64)">{t("couples.fig.who.foot")}</text>
    </svg>
  );
}

/**
 * FIGURE C — les quatre réponses quand la soirée tombe.
 *
 * Les quatre libellés sont les quatre `REALIGNMENT_ACTIONS`, et il n'y en a
 * pas de cinquième. Les rectangles sont à `rx 4` — la PETITE PIÈCE — et non à
 * `rx 8`, réservé aux pastilles d'état: ce sont des gestes, pas des états, et
 * la charte veut que la forme le dise.
 */
function FigChat() {
  const buttons = [
    { x: 24, y: 134, label: t("couples.fig.chat.b1") },
    { x: 246, y: 134, label: t("couples.fig.chat.b2") },
    { x: 24, y: 172, label: t("couples.fig.chat.b3") },
    { x: 246, y: 172, label: t("couples.fig.chat.b4") },
  ];
  return (
    <svg viewBox="0 0 480 240" className="font-sans" role="img" aria-labelledby="cpl-chat-t cpl-chat-d">
      <title id="cpl-chat-t">{t("couples.fig.chat.title")}</title>
      <desc id="cpl-chat-d">{t("couples.fig.chat.desc")}</desc>

      <FigCorner />
      <FigEyebrow>{t("couples.fig.chat.eyebrow")}</FigEyebrow>

      <rect x="24" y="52" width="432" height="64" rx="12" fill="var(--ill-wash, #EFE0E9)" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" />
      <path d="M 24 66 L 24 102" fill="none" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinecap="round" />
      <text x="44" y="76" fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">{t("couples.fig.chat.label")}</text>
      <text x="44" y="100" fontSize="13" fill="var(--ill-ink, #23191F)">{t("couples.fig.chat.said")}</text>

      {buttons.map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={b.y} width="210" height="30" rx="4" fill="var(--ill-paper, #FBF8FA)" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" />
          <text x={b.x + 14} y={b.y + 20} fontSize="11" fill="var(--ill-ink, #23191F)">{b.label}</text>
        </g>
      ))}

      <text x="24" y="226" fontSize="13" fill="var(--ill-ink-soft, #6A5A64)">{t("couples.fig.chat.foot")}</text>
    </svg>
  );
}

/** Un champ de la bande de faits: étiquette, valeur, de l'air. */
function Fact({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <li>
      <Kicker>{label}</Kicker>
      <h3 className="mt-2 font-display text-sub text-ink">{title}</h3>
      <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-ink-soft">{body}</p>
    </li>
  );
}

function Hero() {
  return (
    <section className={`${WRAP} ${SECTION}`}>
      <div className="grid grid-cols-1 items-center gap-11 lg:grid-cols-[1.02fr_1fr] lg:gap-16">
        <div>
          <Kicker>{t("couples.hero.kicker")}</Kicker>
          <h1 className="mt-4 max-w-[15ch] text-balance font-display text-hero text-ink">
            {t("couples.hero.title")}
          </h1>
          {/* fact: C3 — meal_generation.ts:518 `interface CookingSession`
              fact: C4 — household_portions.ts:125,480 (une PHRASE, pas un gramme) */}
          <p className="mt-5 max-w-[46ch] text-lede text-ink-soft">{t("couples.hero.lede")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <StartLink label={t("couples.hero.cta")} />
          </div>
          {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250
              (12,99 € + 2 €/profil réclamé, maître jamais compté) */}
          <p className="mt-5 max-w-[42ch] text-sm text-ink-soft">{t("couples.hero.price")}</p>
          {/* La réserve n'est pas optionnelle: `/start` interroge d'abord
              `keel_free_signup_available`, et si le programme du coach maison
              n'est pas publié, la porte est fermée (AUDIT §10). */}
          <p className="mt-3 max-w-[40ch] text-[13px] leading-normal text-ink-soft">{t("couples.hero.reserve")}</p>
        </div>

        {/* La légende est DANS la colonne de la figure, jamais sous l'autre:
            posée après la grille, elle tombait à 600 px de ce qu'elle annote
            et se lisait comme une ligne de corps de plus. Mesuré à 1280 px.
            Elle est hors du `fig-scroll` — sinon elle hériterait du plancher
            de 380 px et défilerait avec la figure. */}
        <div>
          <div className="fig-scroll">
            <FigPlates />
          </div>
          {/* fact: C4 — `SERVING_DIRECTION` sur 6 objectifs, household_portions.ts:125 */}
          <p className="mt-4 max-w-[46ch] text-[13px] text-ink-soft">{t("couples.hero.caption")}</p>
        </div>
      </div>

      <div className="mt-12 border-t border-line pt-8 sm:mt-19 sm:pt-11">
        <ul className="grid list-none grid-cols-1 gap-7 p-0 sm:grid-cols-3 sm:gap-10">
          {/* fact: C3 — CookingSessions.tsx:48, KitchenToday.tsx:281 */}
          <Fact label={t("couples.facts.unit.label")} title={t("couples.facts.unit.title")} body={t("couples.facts.unit.body")} />
          {/* fact: C4 — household_composition.ts:418 (tronc commun = MIN) et
              household_portions.ts:125-151, où `SERVING_DIRECTION` porte SIX
              chaînes DISTINCTES (fat_loss · muscle_gain · recomposition ·
              performance · health · maintenance). « Six directions » est donc
              exact, et non une bijection supposée: `health` a justement cessé
              de rendre la chaîne de `maintenance` le 2026-08-11. */}
          <Fact label={t("couples.facts.direction.label")} title={t("couples.facts.direction.title")} body={t("couples.facts.direction.body")} />
          {/* fact: C4 — HouseholdPage.tsx:1838-1855 ; trou nommé FF-043 §11 n°1:
              `member_deltas` (les grammes) n'a AUCUN écran */}
          <Fact label={t("couples.facts.words.label")} title={t("couples.facts.words.title")} body={t("couples.facts.words.body")} />
        </ul>
      </div>
    </section>
  );
}

function OtherProfile() {
  return (
    <section className="bg-paper-2">
      <div className={`${WRAP} ${SECTION}`}>
        <div className="grid grid-cols-1 items-center gap-11 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <Kicker>{t("couples.other.kicker")}</Kicker>
            <SectionTitle>{t("couples.other.title")}</SectionTitle>
            {/* fact: C8 — FF-044 🟢, 20260810260000:179-190 (`user_id = null`),
                household_portions.ts:63-72 (la part est clée sur `memberId`)
                fact: C1 — 2 €/profil réclamé, maître jamais compté */}
            <p className="mt-5 max-w-[46ch] text-lede text-ink-soft">{t("couples.other.lede")}</p>
            {/* fact: C14 — onboarding.ts:650-662. Ce qu'on DEMANDE, jamais
                combien de temps ça prend: aucune mesure n'existe (règle S8). */}
            <p className="mt-5 max-w-[46ch] text-sm text-ink-soft">{t("couples.other.asked")}</p>
          </div>
          <div className="fig-scroll">
            <FigWho />
          </div>
        </div>
      </div>
    </section>
  );
}

function WeekHolds() {
  return (
    <section className={`${WRAP} ${SECTION}`}>
      <div className="grid grid-cols-1 items-center gap-11 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="fig-scroll lg:order-2">
          <FigChat />
        </div>
        <div className="lg:order-1">
          <Kicker>{t("couples.week.kicker")}</Kicker>
          <SectionTitle>{t("couples.week.title")}</SectionTitle>
          {/* fact: C7 — accident.ts:995-1004 `REALIGNMENT_ACTIONS` = shift_dish
              · no_cook · shift_session · nothing_to_change, rendus par
              `_shared/chat/deterministic_buttons.ts`. Il n'y a PAS de
              « remplacer »: accident.ts:52-55 — « aucune fonction d'ici ne
              choisit un plat » (AUDIT §5.1, C6 = FAUX). */}
          <p className="mt-5 max-w-[46ch] text-lede text-ink-soft">{t("couples.week.lede")}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * LE BLOC SOMBRE — un seul par page, et il ne porte pas de figure: il n'y a
 * rien à dessiner de ce qu'on ne fait pas. C'est le seul endroit où la marque
 * parle d'elle-même, et elle en profite pour se retirer quelque chose.
 */
function NotThis() {
  return (
    <section className="on-dark bg-fig-950 py-13 sm:py-19">
      <div className={WRAP}>
        <Kicker onDark>{t("couples.dark.kicker")}</Kicker>
        {/* fact: C16 — 20260812220000:118. `household_member_bodies` est UNE
            ligne écrasée, ni date ni série: aucune courbe nulle part.
            `text-title` et non un `clamp()` maison: l'échelle a cinq crans et
            un agent en CHOISIT un. L'interligne est le seul écart — 1,06 est
            fait pour un titre de deux lignes, pas pour trois. */}
        <p className="mt-4 max-w-[26ch] font-display text-title leading-[1.16] text-paper">{t("couples.dark.say")}</p>
        {/* fact: C15 — `profiles.energy_display_enabled` default false
            (20260812230000:60) + chaîne de gardes energy_gate.ts:228-249.
            ⚠️ NE JAMAIS écrire « jamais de calories »: faux depuis FF-059,
            `plan/EnergyReadout.tsx:42-45` rend bien des kcal une fois les
            verrous levés. La formulation tenable est celle-ci, et elle seule. */}
        <p className="mt-5 max-w-[44ch] text-[15px] leading-relaxed text-fig-300">{t("couples.dark.note")}</p>
      </div>
    </section>
  );
}

function Price() {
  return (
    <section className="bg-paper-2">
      <div className={`${WRAP} ${SECTION}`}>
        <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <Kicker>{t("couples.price.kicker")}</Kicker>
            <SectionTitle>{t("couples.price.title")}</SectionTitle>
            {/* fact: C13 — onboarding.ts:84 `FunnelBranch` = solo | pair |
                family, route `/app/setup` (App.tsx:220). La branche `pair`
                existe: la promesse de cette page est honorée par l'étape
                suivante. */}
            <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">{t("couples.price.note")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StartLink label={t("couples.hero.cta")} />
            </div>
            <p className="mt-3 max-w-[40ch] text-[13px] leading-normal text-ink-soft">{t("couples.hero.reserve")}</p>
          </div>
          {/* fact: C1 — 20260810260000:101-105 (plafond 8 bouches), :235-250.
              Une seule carte, aucune liste de features: une carte faite pour
              être comparée invite à chercher le plan qui manque. */}
          <PriceCard price={t("couples.price.amount")} period={t("couples.price.period")} label={t("couples.price.label")} />
        </div>
      </div>
    </section>
  );
}

export function CouplesPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO
        title={t("couples.seo_title")}
        description={t("couples.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/couples`}
        structuredData={COUPLES_STRUCTURED_DATA}
      />

      {/* `audience="student"` retire les portes de vente B2B de l'en-tête: un
          couple qui cherche à dîner n'a rien à faire dans `/gyms`. */}
      <PublicHeader />

      <main>
        <Hero />
        <OtherProfile />
        <WeekHolds />
        {/* L'honnêteté AVANT le prix, jamais après: qui a lu ce qu'on ne fait
            pas et lit le prix ensuite achète en sachant. */}
        <NotThis />
        <Price />
      </main>

      <PublicFooter />
    </div>
  );
}

export default CouplesPage;
