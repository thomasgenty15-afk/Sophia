import React from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t } from "../i18n/t";

/**
 * KEEL — `/communities`. Le créateur d'une COMMUNAUTÉ PAYANTE, qui a déjà le récurrent.
 *
 * ── REFONTE « PAR LA DOULEUR », 2026-08-13 ────────────────────────────────────────────
 * Historique du poids : 1007 lignes et zéro figure (avant le 2026-08-12) → 491 lignes,
 * SEPT sections et UNE figure pour 2062 mots rendus (la page la plus bavarde du site) →
 * QUATRE BANDES et QUATRE FIGURES ici. La règle du chantier : **une section = une ligne
 * de la grille** (`scratchpad/site/GRILLE-DOULEURS.md`), et la figure porte l'argument à
 * la place du paragraphe. Rapport : `scratchpad/site/communities/RAPPORT-DOULEURS-20260813.md`.
 *
 *   BANDE 1  douleur 01 — « un fil n'a pas de destinataire »   (hero + le palier)
 *   BANDE 2  douleur 02 — « si un agent répond, plus personne ne se répond entre membres »
 *   BANDE 3  douleur 03 — « un modèle lisse ma voix »          (le bloc sombre, unique)
 *   BANDE 4  le prix et la clôture
 *
 * SA DOULEUR EST UNE ARCHITECTURE, PAS UNE CHARGE DE TRAVAIL : un fil ne répond pas à une
 * personne. « Tu es débordé » est faux, et vaguement insultant pour qui tient cinq cents
 * membres. Deux règles en découlent. (1) On ne dénigre pas sa communauté et on n'en est pas
 * le remplaçant : son objection n°1 est « si un bot répond, plus personne ne se répond entre
 * membres », et la réponse est une ABSENCE DE SURFACE (B33), pas une promesse. ⚠️ Ne jamais
 * élargir en « personne ne partage jamais d'espace » : `/app/household` en est un, mais
 * c'est la famille. (2) Le PALIER n'est pas une seconde douleur, c'est la forme commerciale
 * de la première — d'où son repli DANS la bande 1, sous le hero.
 *
 * ⛔ COUPÉ LE 2026-08-13, ET CE N'EST PAS UN OUBLI :
 * · `MondaySection` (« dans un fil vous ne voyez que les dix qui postent »), avec sa figure
 *   de la page du lundi. Vraie (B11, B12, B14, B17), mais la grille l'a donnée à `/gyms`
 *   (douleur 02) et au hall `/pro` (ligne 04), pas ici. Une bande sans ligne de grille meurt.
 * · La figure du TROISIÈME JOUR (relance à 72 h, B21) : même raison — c'est « je les perds
 *   sans les voir partir », la douleur d'une salle, pas celle d'un fil.
 * · La maquette des quatre champs de doctrine : repliée dans la figure du verrou, qui dit la
 *   même chose en montrant ce que le membre REÇOIT.
 * · Les quatre bornes en `dl` à quatre colonnes : repliées en une réserve d'une phrase.
 *
 * ⛔ SUPPRIMÉ AVANT CE CHANTIER, ET NE DOIT PAS REVENIR. Le bloc « no calories » : seul
 * claim FAUX du site DÉJÀ EN LIGNE — le produit affiche des kcal (`components/plan/EnergyReadout.tsx`)
 * depuis FF-059 (AUDIT §8 n°2, D4). Ce qui survit est C15 : chiffres éteints par défaut.
 * ⚠️ ON N'ÉCRIT PAS LE NOMBRE DE GARDES : le brief en annonce quatre, l'audit cinq selon ce
 * qu'on compte (C15b), et un chiffre sans source unique n'entre pas sur une page (S8).
 * · « aucun score d'adhérence » : vrai en pratique, VIVANT EN CODE (B15) — donc pas écrit.
 * · « la doctrine entre à chaque message » et « chaque message sortant est scanné » : faux
 *   tous les deux (B7, B8). C'est B8b qui est écrit, mot pour mot, dans `voice.lock`.
 * · « c'est votre nom sur les messages » (B18) et le white-label (B19) : jamais.
 *
 * SILENCES QUI MORDENT ICI : S1 aucune boîte de réception qui vous revient · S8 aucun
 * chiffre sans source · S9 aucune bande de risque, aucune tuile « on track » · S10 une
 * maquette reprend le vrai champ · S12 aucun SKU membre. Vocabulaire : ce créateur EST un
 * coach au sens de la grille, mais les gens qu'il accompagne sont des MEMBRES — « élève »
 * est le mot de `/coaches` seulement, et « suivi personnalisé » est interdit partout.
 * Registre VOUS. UN SEUL CTA : `/auth?role=coach`, 14 jours / 3 membres (B5).
 */
// Hoisté hors du rendu : `SEO` garde `structuredData` dans un tableau de dépendances de
// `useEffect`, donc un littéral inline reconstruirait les <script> à chaque rendu.
const COMMUNITIES_STRUCTURED_DATA = [organizationStructuredData(), {
  "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Sophia",
  applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "en-GB",
  url: `${LEGAL_ENTITY.siteUrl}/communities`, description: t("communities.seo_description"),
  publisher: organizationStructuredData(),
}];

// Les cinq jetons d'illustration, pas un de plus (CHARTE §5), écrits avec leur repli : une
// figure copiée hors de la page reste lisible seule.
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
        <ThreadBand />
        <LayerBand />
        <VoiceBand />
        <PriceBand />
      </main>
      <PublicFooter />
    </div>
  );
}

/** ⚠️ PIÈGE MESURÉ (CHARTE §7) : un élément qui porte le conteneur de page ET une classe de
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
 * lui, étirée sur les 280 px utiles d'un 320, la figure rend son texte à 5-7 px. Le
 * `min-width: 0` de l'enveloppe est dans `tokens.css`, pas ici : six agents l'avaient
 * emballée de six façons différentes. */
function Figure({ caption, dark, className = "", children }: { caption?: string; dark?: boolean; className?: string; children: React.ReactNode }) {
  const cls = `mt-4 max-w-[62ch] text-sm leading-6 ${dark ? "text-fig-300" : "text-ink-soft"}`;
  return (
    <figure className={className}>
      <div className="fig-scroll">{children}</div>
      {caption ? <figcaption className={cls}>{caption}</figcaption> : null}
    </figure>
  );
}

/** Le cadre commun aux quatre figures. ⚠️ L'ÉQUERRE COMPTE POUR UNE DES DEUX OCCURRENCES DE
 * `--ill-fig` AUTORISÉES PAR FIGURE : chacune n'en a donc qu'UNE autre, son sujet. */
function FigSvg({ id, title, desc, label, children }: { id: string; title: string; desc: string; label?: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby={`${id}-t ${id}-d`} className="w-full max-w-[560px]" style={{ fontVariantNumeric: "tabular-nums" }}>
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      <path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
      {label ? <Tx x={44} y={26} s={11} ls={1.2} fill={SOFT}>{label}</Tx> : null}
      {children}
    </svg>
  );
}

/** Le texte d'une figure et ses trois seules tailles : 9 étiquette (`Key`, toujours
 * capitales et `SOFT`), 11 ligne, 13 valeur. */
function Tx({ x, y, s = 13, fill = INK, ls, anchor, children }: { x: number; y: number; s?: number; fill?: string; ls?: number; anchor?: "middle" | "end"; children: string }) {
  return <text x={x} y={y} fontSize={s} fontWeight={ls ? 600 : undefined} letterSpacing={ls} textAnchor={anchor} fill={fill}>{children}</text>;
}

function Key({ x, y, ls = 0.9, anchor, children }: { x: number; y: number; ls?: number; anchor?: "middle" | "end"; children: string }) {
  return <Tx x={x} y={y} s={9} ls={ls} anchor={anchor} fill={SOFT}>{children}</Tx>;
}

function Cta({ label }: { label: string }) {
  return <ButtonLink to="/auth?role=coach" variant="brand" className="px-6 py-3 text-[1rem]">{label}</ButtonLink>;
}

function SignIn({ prompt, link }: { prompt: string; link: string }) {
  const cls = "font-medium text-fig-700 underline underline-offset-2";
  return <p className="mt-6 text-sm text-ink-soft">{prompt} <Link to="/auth" className={cls}>{link}</Link></p>;
}

/**
 * BANDE 1 — DOULEUR 01, « un fil n'a pas de destinataire ». Deux mouvements dans une seule
 * bande : ce que le fil ne peut pas faire (le hero, FIGURE A), puis la forme commerciale de
 * la même réponse (le palier, FIGURE B). Le palier n'est PAS une douleur de plus : c'est
 * « une réponse individuelle sans repasser au un-à-un », vue depuis la page de vente.
 *
 * FIGURE A — le motif dont le reste hérite : LE TRAIT DE 2 À GAUCHE D'UNE RANGÉE = quelque
 * chose qui s'adresse à cette rangée-là. C'est l'idiome de l'app promu au rang de signature
 * (`CoachWeeklyPage.tsx:306`), l'équerre à l'échelle d'une ligne. Les quatre rangées sont
 * IDENTIQUES des deux côtés : rien n'affirme une mesure, seule la relation change.
 *
 * FIGURE B — sa garde est dans la STRUCTURE DU FICHIER : les deux offres sont le même
 * `<g id="offer">`, appelé deux fois. On ne PEUT donc pas dessiner « le palier est plus
 * gros ». Les hauteurs n'encodent aucun prix ; l'écart se lit dans les valeurs écrites.
 */
function ThreadBand() {
  const rows = [84, 112, 140, 168];
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[1200px] px-5 pt-11 pb-10 sm:px-8 sm:pt-[84px] sm:pb-[76px]">
        <div className="grid gap-11 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <Kicker>{t("communities.hero.kicker")}</Kicker>
            <h1 className="mt-4 max-w-[18ch] text-balance font-display text-hero">{t("communities.hero.title")}</h1>
            <p className="mt-5 max-w-[62ch] text-lede text-ink-soft">{t("communities.hero.lede")}</p>
            <div className="mt-8"><Cta label={t("communities.hero.cta")} /></div>
            {/* fact: B5 — essai 14 jours, 3 membres · B32 — invitation e-mail, aucun lien à copier · S1 — aucune boîte de réception en retour. */}
            <p className="mt-4 max-w-[52ch] text-sm leading-6 text-ink-soft">{t("communities.hero.note")}</p>
            <SignIn prompt={t("communities.hero.signin_prompt")} link={t("communities.hero.signin_link")} />
          </div>
          <Figure>
            <FigSvg id="fig-lane" title={t("communities.fig_lane.alt_title")} desc={t("communities.fig_lane.alt_desc")} label={t("communities.fig_lane.label")}>
              {/* fact: B33 — dans un fil, une seule réponse ouvre tout le monde à la fois ; il n'existe aucune surface où répondre à une personne. */}
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

        <div className="mt-14 border-t border-line pt-12 sm:mt-16 sm:pt-14">
          <SectionTitle>{t("communities.tier.title")}</SectionTitle>
          <div className={SPLIT}>
            <div>
              <p className={BODY}>{t("communities.tier.body")}</p>
              {/* fact: B30 — 500 membres, 3 sur 10 : 150 × 12 € − 150 × 7 € = 750 €/mois. L'arithmétique est juste, et la ligne suivante l'étiquette « exemple ». */}
              <p className={`mt-6 ${CLOSE}`}>{t("communities.tier.example")}</p>
              <p className="mt-4 max-w-[62ch] text-sm leading-6 text-ink-soft">{t("communities.tier.example_caption")}</p>
              {/* fact: C17/B1bis — aucune intégration Skool/Circle/Discord/Kajabi · S12 — aucun SKU membre dans `stripe-create-checkout-session` · C15 — chiffres d'énergie éteints par défaut (le NOMBRE de gardes ne s'écrit pas : S8). */}
              <p className="mt-6 max-w-[62ch] border-t border-line pt-6 text-sm leading-6 text-ink-soft">{t("communities.tier.reserve")}</p>
            </div>
            <Figure>
              <FigSvg id="fig-tier" title={t("communities.fig_tier.alt_title")} desc={t("communities.fig_tier.alt_desc")} label={t("communities.fig_tier.label")}>
                {/* ⚠️ LA GOUTTIÈRE DE GAUCHE FAIT 152, ET C'EST MESURÉ EN FRANÇAIS. À 200 de
                    large, la carte commençait à 140 et « VOTRE COMMUNAUTÉ » (143 unités) lui
                    rentrait dedans — l'étiquette tient en anglais et déborde en français, le
                    piège que la charte nomme au §7. */}
                <defs>
                  <g id="offer">
                    <rect x="0" y="0" width="180" height="68" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
                    <g fill={WASH}>
                      {[[150, 16], [126, 32], [96, 48]].map(([w, y]) => <rect key={y} x="16" y={y} width={w} height="8" rx="4" />)}
                    </g>
                  </g>
                </defs>
                {/* La bande ajoutée : seule pièce chaude, et seule différence entre les deux appels. */}
                <rect x="152" y="38" width="180" height="22" rx="4" fill={WASH} stroke={FIG} strokeWidth="1" />
                <use href="#offer" x="152" y="60" />
                <use href="#offer" x="152" y="152" />
                <Tx x={166} y={53} s={11}>{t("communities.fig_tier.band")}</Tx>
                <Key x={24} y={52} ls={1}>{t("communities.fig_tier.tier_label")}</Key>
                <Tx x={24} y={74}>{t("communities.fig_tier.tier_value")}</Tx>
                <Key x={24} y={166} ls={1}>{t("communities.fig_tier.base_label")}</Key>
                <Tx x={24} y={188}>{t("communities.fig_tier.base_value")}</Tx>
                <Key x={344} y={52} ls={1}>{t("communities.fig_tier.cost_label")}</Key>
                <Tx x={344} y={74}>{t("communities.fig_tier.cost_value")}</Tx>
              </FigSvg>
            </Figure>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * BANDE 2 — DOULEUR 02, « si un agent répond, plus personne ne se répond entre membres ».
 * Le besoin est « une couche qui s'ajoute sans remplacer », et la réponse n'est pas une
 * promesse : c'est une ABSENCE DE SURFACE (B33). ⚠️ Ne jamais élargir en « personne ne
 * partage jamais d'espace » : `/app/household` EST un espace partagé multi-personnes.
 *
 * FIGURE C — un CONCEPT, et la seule figure de la page qui dessine une STRUCTURE plutôt
 * qu'une surface. Le maillage complet des quatre membres (K4 : chacun avec chacun) est la
 * pièce chaude, parce que c'est la chose qui reste et qui appartient au lecteur. Sous la
 * ligne, quatre lignes descendent sans que RIEN ne les joigne : l'absence est dessinée par
 * un vide, ce qui est la seule façon honnête de la dessiner.
 */
function LayerBand() {
  const nodes = [96, 192, 288, 384];
  return (
    <Section tone="paper-2">
      <Kicker>{t("communities.layer.kicker")}</Kicker>
      <SectionTitle>{t("communities.layer.title")}</SectionTitle>
      <div className={SPLIT}>
        {/* fact: B33 — pas de fil, pas de salon, pas de commentaire : aucune surface sociale n'existe, donc il n'y a nulle part où emmener celle du lecteur. */}
        <p className={BODY}>{t("communities.layer.body")}</p>
        {/* La figure PASSE DEVANT à partir de `lg`, et c'est la seule bande où elle le fait :
            ici l'argument EST le dessin — le texte ne fait que nommer ce que la structure
            montre. Sur téléphone l'ordre du DOM tient, donc la phrase reste lue en premier. */}
        <Figure className="lg:order-first" caption={t("communities.layer.figure_caption")}>
          <FigSvg id="fig-layer" title={t("communities.fig_layer.alt_title")} desc={t("communities.fig_layer.alt_desc")} label={t("communities.fig_layer.label")}>
            <Key x={24} y={52} ls={1}>{t("communities.fig_layer.community_label")}</Key>
            {/* Le maillage complet : chacun répond à chacun. C'est ce qui reste au lecteur, donc c'est la pièce chaude. */}
            <g fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round">
              <path d="M 96 112 A 48 20 0 0 1 192 112" />
              <path d="M 192 112 A 48 20 0 0 1 288 112" />
              <path d="M 288 112 A 48 20 0 0 1 384 112" />
              <path d="M 96 112 A 96 34 0 0 1 288 112" />
              <path d="M 192 112 A 96 34 0 0 1 384 112" />
              <path d="M 96 112 A 144 48 0 0 1 384 112" />
            </g>
            <g fill={PAPER} stroke={FIG} strokeWidth="2">
              {nodes.map((x) => <circle key={x} cx={x} cy="112" r="5" />)}
            </g>
            {/* La frontière est une ANNOTATION (épaisseur 1) : la couche a un nom, pas un contour.
                Le trait S'ARRÊTE à 372 et l'étiquette occupe la césure, à la hauteur du trait —
                posée au-dessus de sa queue, elle se lisait collée dans les deux langues. */}
            <path d="M 24 142 L 372 142" fill="none" stroke={SOFT} strokeWidth="1" />
            <Key x={456} y={145} ls={1} anchor="end">{t("communities.fig_layer.sophia_label")}</Key>
            <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
              {nodes.map((x) => <path key={x} d={`M ${x} 118 L ${x} 196`} />)}
            </g>
            <g fill={PAPER} stroke={SOFT} strokeWidth="1">
              {nodes.map((x) => <rect key={x} x={x - 32} y="196" width="64" height="20" rx="4" />)}
            </g>
            <Tx x={24} y={232} s={11}>{t("communities.fig_layer.absence")}</Tx>
          </FigSvg>
        </Figure>
      </div>
    </Section>
  );
}

/**
 * BANDE 3 — DOULEUR 03, « un modèle lisse ma voix ». Besoin : que MES FORMULATIONS tiennent,
 * pas seulement mes principes. La voix est la manchette ; le double verrou est ce qui la
 * protège, et il entre EN RÉSERVE sous la figure. Deux sections d'avant fusionnent ici.
 *
 * L'UNIQUE BLOC SOMBRE de la page est dépensé là : c'est le seul signal fort dont dispose
 * une page de fiche, et il va sur l'argument qui en a besoin. ⚠️ `.on-dark` remonte
 * `--ill-fig` ET `--ill-ink-soft` à `fig-300`, mais NE touche pas `--ill-ink`, qui serait
 * invisible — d'où l'absence totale de `INK` dans la figure D.
 *
 * FIGURE D — un CONCEPT, jamais une maquette : `tokens.css` interdit de poser une surface de
 * produit sur du sombre. Elle porte les DEUX moitiés de la bande d'un seul dessin : le
 * brouillon retenu (le verrou) et la phrase qui part (la voix). Et la pastille « retenu » est
 * CREUSE : le mot porte l'état, la couleur ne le porte pas (S9).
 *
 * ⚠️ FORMULATION B8b, IMPOSÉE. « La doctrine entre à chaque message » est FAUX (B7 : un seul
 * appelant) et « chaque message sortant est vérifié » est FAUX pour « chaque » (B8 : quatre
 * surfaces scannées, quatre non — relance, récap du soir, bilan du dimanche, broadcast).
 */
function VoiceBand() {
  return (
    <Section tone="dark">
      <Kicker onDark>{t("communities.voice.kicker")}</Kicker>
      <SectionTitle>{t("communities.voice.title")}</SectionTitle>
      <div className={SPLIT}>
        <div>
          <p className="max-w-[62ch] leading-relaxed text-fig-300">{t("communities.voice.body")}</p>
          {/* fact: B8b — la doctrine atteint quatre points d'injection (B10 : chat, semaine, repas individuel, repas foyer) et c'est le CHAT qui est relu contre les lignes rouges avant envoi, sans modèle dans cette boucle (`sophia-brain/skills/_shared/keel_output_locks.ts:307`). */}
          <p className="mt-6 max-w-[62ch] border-t border-fig-300/30 pt-6 text-sm leading-6 text-fig-300">{t("communities.voice.lock")}</p>
          <p className={`mt-6 max-w-[42ch] text-balance text-lede font-medium`}>{t("communities.voice.close")}</p>
        </div>
        {/* fact: B9 — chaque ligne rouge porte son `instead`, dans les mots du coach, et il part signé de son nom (`keel_output_locks.ts:191-200`, `signAsCoach`) · doctrine.ts:194 le documente comme le champ que l'élève lit littéralement. ⚠️ B18 : pas « votre nom sur les messages », l'agent s'appelle Sophia partout. */}
        <Figure dark caption={t("communities.voice.figure_caption")}>
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
            {/* Le trait ouvre la seule fiche que le membre reçoit. */}
            <path d="M 24 168 L 24 208" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
          </FigSvg>
        </Figure>
      </div>
    </Section>
  );
}

/**
 * BANDE 4 — LE PRIX ET LA CLÔTURE. UNE SEULE CARTE : deux cartes obligent à faire une
 * addition, et une addition sur une page de vente est un endroit où se tromper.
 * ⚠️ « 6 € pour un SIÈGE payé à l'année », jamais « quand votre membre a payé son année » :
 * l'intervalle est celui du COACH. Cette page est la seule des trois anciennes à le dire
 * correctement (B3) ; `/gyms` porte l'erreur (B2). NE PAS CASSER CETTE FORMULATION.
 */
function PriceBand() {
  return (
    <Section>
      <Kicker>{t("communities.pricing.kicker")}</Kicker>
      <SectionTitle>{t("communities.pricing.title")}</SectionTitle>
      <div className="mt-8 grid gap-11 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-16">
        <div className="w-full sm:max-w-xs">
          {/* fact: B1 — 7 €/membre/mois, aucun forfait plateforme · B3 — 6 € pour un siège payé à l'année · B4 — on arrête de payer le mois où on éteint un siège (`stripe-reconcile-seats:18-35`, recalcul et jamais incrément). */}
          <PriceCard price={formatPrice(PRICES.seat)} period={t("communities.pricing.seat_period")} label={t("communities.pricing.seat_label")} />
          <p className="mt-3 text-sm leading-6 text-ink-soft">{t("communities.pricing.annual")}</p>
        </div>
        <div>
          <p className={BODY}>{t("communities.pricing.why")}</p>
          {/* fact: B31 — rien dans ce dépôt ne mesure le churn contre un témoin, et les taux qui circulent dans son écosystème sont des chiffres de blogs d'éditeurs. Jugée la meilleure ligne des trois anciennes pages : conservée VERBATIM. */}
          <p className={`mt-6 ${CLOSE}`}>{t("communities.pricing.no_number")}</p>
        </div>
      </div>
      <div className="mt-12 border-t border-line pt-10">
        <h2 className="max-w-[28ch] text-balance font-display text-title">{t("communities.closing.title")}</h2>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Cta label={t("communities.closing.cta")} />
          {/* fact: B5 — 14 jours, 3 membres, puis ça s'arrête tout seul. */}
          <span className="text-sm text-ink-soft">{t("communities.pricing.trial_note")}</span>
        </div>
        <SignIn prompt={t("communities.closing.signin_prompt")} link={t("communities.closing.signin_link")} />
      </div>
    </Section>
  );
}

export default CommunitiesPage;
