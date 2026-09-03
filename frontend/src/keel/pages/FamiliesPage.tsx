import React from "react";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { AccidentsFigure } from "../components/ui/AccidentsFigure";
import { OfferLines } from "../components/ui/OfferLines";
import { StickyCta } from "../components/ui/StickyCta";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t } from "../i18n/t";

/**
 * KEEL — `/families`, la porte de vente du FOYER. Namespace i18n: `families`.
 *
 * ── L'ACHETEUSE, PRÉCISÉE LE 2026-08-31 ────────────────────────────────────
 * Une personne de 35-45 ans qui cuisine tous les soirs et DÉCIDE SEULE de ce
 * que tout le monde mange. Le qualifieur est L'ENFANT, pas le nombre de têtes
 * (`docs/keel/POSITIONNEMENT.md` §2.3): un parent seul avec un enfant est le
 * foyer le plus qualifié du marché, et l'ancien accroche « Trois bouches à
 * table, ou plus » l'ÉCARTAIT en toutes lettres. C'est le premier défaut que
 * cette réécriture ferme.
 *
 * ⚠️ ELLE SAIT CUISINER. Rien ici ne suggère le contraire — ce qu'on lui
 * retire, ce n'est pas la cuisine, c'est LA DÉCISION. D'où le titre
 * (« Vous ne cuisinez pas trop. Vous décidez trop. ») et la phrase du chapô
 * « la cuisine reste à vous ».
 *
 * ⚠️ ON CIBLE LES MÈRES SANS JAMAIS L'ÉCRIRE. Le responsable des repas est un
 * RÔLE, pas un genre. Conséquence de composition, en français: aucun adjectif
 * accordé au lecteur (« seule », « fatiguée », « vue ») ne doit entrer dans une
 * chaîne. La charge se dit par des noms et des verbes — « toujours à la même
 * personne », « une seule personne cuisine » —, jamais par un accord.
 *
 * ── LES SIX BANDES, ET POURQUOI DANS CET ORDRE ─────────────────────────────
 * L'ordre suit la hiérarchie des arguments, pas celle des mécanismes.
 *
 *   1. HÉROS         — LA CHARGE MENTALE, accroche n°1. Et la figure qui EST
 *                      la thèse: une cuisson, quatre assiettes annotées de la
 *                      raison qui les sépare.
 *   2. LA RECONNAISSANCE — les TROIS formes de la divergence (servie /
 *                      absorbée / renoncée). ⚠️ La troisième est la plus
 *                      importante: une visiteuse dont « tout le monde mange
 *                      pareil » n'a pas moins besoin du produit, elle a
 *                      RENONCÉ (POSITIONNEMENT §2.3, le faux négatif). La
 *                      bande se ferme sur la réponse à « un planificateur
 *                      gratuit existe » — sans jamais nommer personne.
 *   3. LE DOUTE      — accroche n°2, et probablement la plus forte: elle fait
 *                      TOUT le travail et n'a AUCUNE preuve que ça suffit.
 *                      LE BLOC SOMBRE EST DÉPENSÉ ICI (voir plus bas).
 *   4. LE JEUDI      — l'effondrement de milieu de semaine et la réparation.
 *                      C'est le mécanisme qui la fait rester en semaine 2, et
 *                      il porte LA PREUVE de la page: une semaine montrée.
 *   5. COMMENT ÇA MARCHE — trois étapes, pas plus.
 *   6. LE PRIX       — et la sortie, `/start`.
 *
 * ⛔ LA LIGNE DU DOUTE, ET ELLE EST NETTE. On COMPOSE POUR chacun; on ne fait
 * JAMAIS DE BILAN SUR un enfant. Un tableau de bord qui montrerait un déficit
 * chez un enfant de 12 ans rendrait cette lectrice PLUS anxieuse, pas moins.
 * Le doute se RETIRE, il ne se MESURE pas — d'où `families.doubt.answer` (« le
 * plan est composé pour chacun ») et sa réserve, qui nomme les trois absences:
 * pas de bilan, pas de courbe, pas de journal d'apports.
 * fact: aucune série de corps en base (household_member_bodies, une ligne
 * écrasée, 20260812220000:118) · `energy_display_enabled` false par défaut
 * (20260812230000:60) · `energy_gate.ts:228-249`, dont le verrou mineur (:239).
 *
 * ⛔ LE GAIN DE TEMPS N'EST NULLE PART EN TITRE. C'est la promesse de tous les
 * concurrents (brief §9 n°6). Il n'apparaît qu'en soutien, jamais en manchette.
 *
 * ⛔ PAS DE PREUVE SOCIALE — zéro utilisateur, donc zéro témoignage, zéro
 * compteur, zéro note, zéro logo. Ce qui remplace: UN PLAN RÉEL, MONTRÉ
 * (bande 4). C'est la seule image que les concurrents ne peuvent pas produire.
 *
 * ── CE QUE LA PAGE NE PROMET PAS, ET OÙ C'EST DIT ──────────────────────────
 * L'honnêteté n'est pas une section, elle est une RÉSERVE posée LÀ OÙ ELLE
 * MORD: ni bilan ni chiffre sous la bande 3, avec « ni une étiquette, ni un
 * médecin »; le refus de décaler un périssable sous la bande 4; l'absence
 * d'application native sous la bande 6; la porte d'inscription sous le héros.
 * ⛔ Ni « halal » ni « casher » nulle part: la licéité dépend de l'abattage et
 * des ustensiles, pas seulement de l'espèce (`dietary_regime.ts`).
 * ⛔ Aucun chiffre de calories ni de macro en argument de vente.
 *
 * ⚠️ LA RÉSERVE D'INSCRIPTION A ÉTÉ RETIRÉE DES QUATRE PAGES le 2026-09-01.
 * Elle disait « l'inscription ouvre quand le programme du coach maison est
 * publié » — du jargon interne, collé au bouton, qui faisait dépendre l'entrée
 * d'un tiers dont le lecteur n'a jamais entendu parler. `/start` interroge
 * toujours `keel_free_signup_available`; c'est lui qui le dit, à sa place.
 *
 * ── LE BLOC SOMBRE — UN SEUL, ET IL EST DÉPENSÉ SUR LE DOUTE ───────────────
 * La charte §2 n'en autorise qu'un par page. Il portait « la charge » et il
 * porte maintenant « le doute », parce que c'est le seul endroit où le produit
 * gagne en NE FAISANT PAS quelque chose — et un refus a besoin du poids d'une
 * bande sombre pour ne pas se lire comme une excuse.
 *
 * ⚠️ ZÉRO FOCUSABLE, ET ZÉRO FIGURE, DANS CETTE BANDE. Les deux sont des
 * décisions, pas des oublis:
 *   · `.on-dark` (tokens.css) remonte `--ill-fig` ET `--ill-ink-soft` à
 *     `fig-300`: une figure y perd sa PIÈCE CHAUDE, donc sa hiérarchie, et il
 *     ne lui reste qu'un pixel d'épaisseur pour distinguer ses objets. La
 *     figure de l'ancienne bande 2 en souffrait; elle a été retirée plutôt que
 *     rafistolée.
 *   · aucun lien ni bouton: `tokens.css` §6 arme bien un anneau `fig-300`
 *     (8,06:1) pour ce cas, mais la bande n'a rien à y faire — le CTA est en
 *     haut et en bas de page, et deux boutons de marque de plus n'ajoutent pas
 *     un geste, ils en retirent un.
 *
 * ── LES FIGURES (CHARTE-VITRINE §5) ────────────────────────────────────────
 * TROIS, et non plus quatre. Grille de 480 unités, deux épaisseurs (2 pour le
 * contour d'une chose réelle, 1 pour l'annotation), coordonnées entières,
 * angles fermés, aucune couleur d'état, aucune photographie, aucun appareil.
 *
 * ⚠️ LE TEXTE D'UNE FIGURE NE DESCEND PLUS SOUS 12 UNITÉS. Mesuré: à 375 px le
 * SVG est à son plancher de 380, soit une échelle de 0,79 — 9 unités y rendent
 * **7,1 px**, exactement la bande « 5-7 px » que le plancher de `.fig-scroll`
 * existait pour éviter. Or 9 unités portait TOUS les mots qui vendent. Le
 * plancher est donc 12 (9,5 px) pour une annotation et 13 (10,3 px) pour une
 * valeur. Si une figure n'a pas la place, c'est qu'elle dit trop de choses.
 *
 * ⚠️ ET AUCUN CONTENU AU-DELÀ DE x=440. Toujours à 375 px: `.fig-scroll` rend
 * 355 px du SVG avant le bord de l'écran, soit **448 unités**. Une case
 * dessinée jusqu'à 458 est coupée, et l'ancienne figure du prix montrait sept
 * places et un bout là où sa légende en annonçait huit.
 *
 * ⚠️ AUCUNE PROPORTION QUE LE PRODUIT NE CALCULE PAS POUR L'ÉCRAN. Les quatre
 * assiettes du héros sont le MÊME élément appelé par `<use>`: en dessiner une
 * plus petite affirmerait une mesure qu'aucun écran ne rend, et ici ça
 * ressemblerait à un régime d'enfant. Ce que le produit dit d'un mineur est un
 * MOT, pas un ratio (`CHILD_DIRECTION`, `household_portions.ts:298`) — d'où
 * l'ANNOTATION sous chaque part. C'est la contrainte §5 lue jusqu'au bout:
 * elle interdit la taille, pas le mot.
 *
 * ⚠️ ET LES QUATRE ANNOTATIONS NE NOMMENT QUE DES CHAMPS QUI EXISTENT PAR
 * MEMBRE. Écrire « part d'ado » sous l'un et « part d'enfant » sous l'autre
 * était la première rédaction, et c'est FAUX: `MEMBER_AGE_STATES` n'a que
 * `minor | adult | unknown` (`household.ts:66`) et `CHILD_DIRECTION` est le
 * même mot pour un enfant de 9 ans et pour un ado de 14. Ce qui diffère
 * réellement entre eux est l'ENVELOPPE, et elle est lue sur l'âge et le corps.
 * D'où « il grandit » / « son âge » — deux formulations du même champ, qui est
 * exactement ce qui sépare ces deux assiettes-là. ⛔ Ne pas non plus écrire
 * « son activité »: le niveau d'activité est un champ de la voie individuelle,
 * `household_member_bodies` ne porte que taille, poids et sexe. ⛔ Ni un goût
 * par personne: `household_member_allergies` ne stocke QUE `kind='allergy'`,
 * `severity='medical'` (migration 20260810170000:67), et « ce que cette maison
 * ne sert pas » est une règle de FOYER, pas de membre.
 *
 * ⚠️ AUCUN IDENTIFIANT DE CODE RENDU. `safety_constraints_unreadable` et
 * `minor_student` étaient écrits en clair, à 7 px, sur une page grand public —
 * et le second nommait une garde MORTE (la lane `generate-week-plan-v1` a été
 * retirée le 2026-08-19, elle en était le seul producteur). Les deux chaînes
 * sont parties, et leurs deux exceptions dans `parity.int.test.ts` avec elles.
 *
 * ── LES DEUX AFFAIRES QUI DÉPASSENT CETTE PAGE ─────────────────────────────
 * 1. `--text-sub` vaut 1,2rem = 19,2 px, donc TOUT `font-display text-sub` est
 *    sous le plancher de 20 px de Young Serif (charte §3). Cinq occurrences
 *    vivent hors d'ici (`/gyms`, `/pro`, `/`). Cette page n'en rend plus
 *    aucune — le paragraphe qui la portait est passé en Public Sans —, mais le
 *    correctif propre est AU JETON, pas page par page.
 * 2. `.fig-scroll` n'a aucune affordance de défilement visible (les barres
 *    superposées de macOS/iOS n'en sont pas une). Les trois figures d'ici
 *    tiennent dans les 448 unités visibles à 375 px, donc rien n'y est caché;
 *    à 320 px il reste ~70 unités hors champ. `tabIndex` les rend au moins
 *    atteignables au clavier (WCAG 2.1.1); le voile de bord est un lot commun
 *    aux huit pages, pas une décoration à inventer ici.
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
        {/* L'ORDRE, ET CE QUI A CHANGÉ LE 2026-09-01: `Balanced` est neuve et
            se pose AVANT le doute — on nomme le mécanisme, puis on répond à la
            question qu'il ferme. Le doute garde le seul bloc sombre. */}
        {/* L'ORDRE, ET CE QUI A CHANGÉ LE 2026-09-01: la bande du DOUTE a été
            supprimée et son fond sombre est passé à « la table » — les trois
            façons dont ça se passe chez le lecteur. Sa clôture rassurante est
            repliée dans `Balanced`, et la casserole y a rejoint son sujet. */}
        <Hero />
        <Balanced />
        <Forms />
        <Thursday />
        <How />
        <Price />
      </main>
      <PublicFooter />

      {/* LE GESTE, À PORTÉE SUR TÉLÉPHONE — voir `ui/StickyCta.tsx`.
          ⚠️ APRÈS `PublicFooter`, ET C'EST MESURÉ. Posé avant, sa réserve de
          hauteur s'insérait ENTRE le contenu et le pied de page: le pied
          descendait de 80 px et la barre, elle, continuait de recouvrir ses
          deux dernières lignes en bas de course — « Contact » et les mentions
          légales. La réserve ne protège que ce qui la SUIT. */}
      <StickyCta label={t("families.hero.cta")} />
    </div>
  );
}

const INK = "var(--ill-ink, #23191F)", SOFT = "var(--ill-ink-soft, #6A5A64)";
const PAPER = "var(--ill-paper, #FBF8FA)", WASH = "var(--ill-wash, #EFE0E9)";
const FIG = "var(--ill-fig, #632C4C)";

/* Le pointillé d'un emplacement VIDE. La charte §2 interdit de porter une
   distinction par la seule teinte: `--ill-wash` contre `--ill-paper` calcule à
   1,21:1 sur le papier — c'est-à-dire rien. Le vide se dit donc par la FORME,
   exactement comme `Card tone="dashed"` le fait en HTML. */
const DASH = "5 5";

/* Le gabarit d'une bande. Padding horizontal et vertical en classes SÉPARÉES:
   un raccourci `padding` remet l'horizontal à zéro et sort le titre de l'écran
   à 320 px (CHARTE §7, mesuré). */
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
   `aria-hidden`. L'équerre et son libellé sont ici: elle ne flotte jamais
   seule. Plancher 380 px et défilement borné au conteneur: `.fig-scroll`.
   Le plafond `max-w-[560px]` est explicite bien que `tokens.css` le pose
   aussi — sans lui un SVG monte à 1070 px et son libellé passe devant le
   chapô (CHARTE §9 écart n°1).

   ⚠️ `tabIndex` ET `role="group"` SONT LA CORRECTION D'UN DÉFAUT MESURÉ, PAS
   UNE PRÉCAUTION. `.fig-scroll` est un conteneur à défilement horizontal SANS
   aucun enfant focusable: hors des Chrome récents, qui rendent les scrollers
   focusables d'eux-mêmes, son contenu n'était atteignable par AUCUN moyen au
   clavier (WCAG 2.1.1). Le groupe emprunte son nom au `<title>` du SVG plutôt
   qu'à une clé de plus: c'est le même objet, il n'a pas deux noms.

   `h` existe parce que les figures n'ont pas la même hauteur: la LARGEUR est la
   grille commune du site (480 unités), pas la hauteur. */
function Fig(
  { id, label, title, desc, h = 240, children }: {
    id: string; label: string; title: string; desc: string; h?: number; children: React.ReactNode;
  },
) {
  return (
    <div className="fig-scroll" tabIndex={0} role="group" aria-labelledby={`${id}-t`}>
      <svg viewBox={`0 0 480 ${h}`} role="img" aria-labelledby={`${id}-t ${id}-d`}
        className="h-auto w-full max-w-[560px]">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        {/* L'équerre de figure, même géométrie pour les trois. ⚠️ Elle porte
            `--ill-fig`, donc le grep « une seule pièce chaude » (F8) rend 2 par
            figure: F8 se vérifie figure par figure, l'équerre est la signature
            et pas la pièce. */}
        <path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />
        <text x="44" y="27" fontSize="12" fontWeight="600" letterSpacing="1.2" fill={SOFT}>{label}</text>
        {children}
      </svg>
    </div>
  );
}

/** Le CTA de la page. Un seul geste, répété: `/start`. */
function StartLink() {
  // Mesuré: `text-base` PERD contre le `text-sm` de `buttonClass` (14 px rendu),
  // la valeur arbitraire passe, et le padding gagne sans artifice.
  return <ButtonLink to="/start" variant="brand" className="px-5 py-2.5 text-[1rem]">{t("families.hero.cta")}</ButtonLink>;
}

/* ═══ BANDE 1 — LA CHARGE MENTALE ════════════════════════════════════════════
   L'accroche n°1: ce qui se reconnaît en une phrase. Pas « je ne sais pas quoi
   cuisiner » — ça, vingt applications gratuites le résolvent (POSITIONNEMENT
   §4) —, mais l'ARBITRAGE: tenir N jeux de contraintes de tête, chaque semaine,
   et les réconcilier en une liste et une cuisson. */
function Hero() {
  return (
    <Section>
      <div className="grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <div>
          <Kicker>{t("families.hero.kicker")}</Kicker>
          {/* ⚠️ `max-w-2xl` COMME LES `<h2>`. Sans borne, le `h1` n'était tenu
              que par la piste de grille: mesuré à 936 px de large sous `lg`,
              contre 42rem pour tous les titres de section. */}
          <h1 className="mt-3 max-w-2xl text-balance font-display text-hero">{t("families.hero.title")}</h1>
          {/* fact: la semaine est composée, pas suggérée — sessions de cuisine
              placées et vagues de courses (`grocery_waves.ts`); l'unité est la
              SESSION DE CUISINE, pas la recette. */}
          <p className="mt-5 max-w-[62ch] text-lede text-ink-soft">{t("families.hero.lede")}</p>
          {/* ⚠️ LE CTA EST SEUL DANS SA LIGNE. Il a porté trois enfants dans un
              `flex items-center`, dont une réserve avec `mt-2` qui ne
              descendait rien: mesuré à 1000 px, bouton, note de prix et
              réserve étaient sur la MÊME ligne, à 4 px sous l'axe. Le rendu
              correct à 1280 et à 375 était un accident de largeur. */}
          <div className="mt-8">
            <StartLink />
          </div>
          {/* L'OFFRE, IDENTIQUE SUR LES CINQ SURFACES DU FOYER.
              ⚠️ `families.hero.price_note` a été retirée le 2026-09-01. Cette page
              était la SEULE des quatre à annoncer une gratuité, et elle annonçait
              un MOIS que le produit ne tenait pas — `free_until` gelait le foyer
              à J+31 sans chemin de dégel. La durée annoncée est désormais celle
              que `HOUSEHOLD_TRIAL_DAYS` tient, et les trois autres pages la
              disent aussi.
              ⚠️ La réserve d'inscription a été retirée le 2026-09-01 — voir
              l'en-tête. */}
          <OfferLines className="mt-4" />
        </div>
        {/* ⚠️ C'EST LA SEMAINE QUI EST ICI DEPUIS LE 2026-09-01, PAS LA
            CASSEROLE. `BRIEF-LANDING-FOYER.md` §6 réclame « un plan réel,
            montré » comme CŒUR VISUEL de la page — « la seule image que les
            concurrents ne peuvent pas produire » — et il ajoute: « pas une
            capture d'écran en bas ». Elle était en bande 4.
            La casserole et ses quatre assiettes descendent en bande 3, où elles
            illustrent enfin ce qu'elles montrent: chacun sa part, et chacun
            pour une raison différente. */}
        <WeekFigure />
      </div>
    </Section>
  );
}

/* LA THÈSE, DESSINÉE. Une casserole, quatre parts — et sous chaque part LA
   RAISON qui la sépare de sa voisine. Les quatre parts sont le MÊME élément
   appelé par `<use>`: la taille n'affirme rien (charte §5), le MOT dit tout.
   C'est la correction du défaut central de l'ancienne figure, qui illustrait
   « des assiettes qui diffèrent » par quatre cercles rigoureusement
   identiques. La casserole est la pièce chaude. */
function TableFigure() {
  const mouths: Array<{ x: number; name: string; why: string }> = [
    { x: 66, name: t("families.fig_table.m1"), why: t("families.fig_table.why1") },
    { x: 174, name: t("families.fig_table.m2"), why: t("families.fig_table.why2") },
    { x: 282, name: t("families.fig_table.m3"), why: t("families.fig_table.why3") },
    { x: 390, name: t("families.fig_table.m4"), why: t("families.fig_table.why4") },
  ];
  return (
    <Fig id="fig_table" h={252} label={t("families.fig_table.label")}
      title={t("families.fig_table.a11y_title")} desc={t("families.fig_table.a11y_desc")}>
      <defs>
        <g id="fam-share">
          <circle r="20" fill={PAPER} stroke={INK} strokeWidth="2" />
          <circle r="12" fill={WASH} />
        </g>
      </defs>

      {/* LA CASSEROLE — une seule, et c'est la moitié de l'argument. */}
      <g stroke={FIG} strokeWidth="2" strokeLinejoin="round" fill={PAPER}>
        <rect x="190" y="82" width="24" height="13" rx="6" />
        <rect x="242" y="82" width="24" height="13" rx="6" />
        <circle cx="228" cy="92" r="26" />
      </g>
      <circle cx="228" cy="92" r="18" fill={WASH} />
      <text x="272" y="88" fontSize="12" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_table.pot")}</text>
      {/* Une phrase d'exemple, pas une citation d'écran: aucune chaîne du
          produit ne dit ça, et la page ne montre pas un écran qu'elle n'a pas. */}
      <text x="272" y="108" fontSize="12" fill={INK}>{t("families.fig_table.dish")}</text>

      <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
        <path d="M 228 118 L 228 140" />
        <path d="M 66 140 L 390 140" />
        {mouths.map((m) => <path key={m.x} d={`M ${m.x} 140 L ${m.x} 152`} />)}
      </g>

      {mouths.map((m) => <use key={m.x} href="#fam-share" x={m.x} y="176" />)}
      <g fontSize="13" fill={INK}>
        {mouths.map((m) => <text key={m.x} x={m.x} y="216" textAnchor="middle">{m.name}</text>)}
      </g>
      {/* L'ANNOTATION QUI FAIT LA FIGURE. Le produit ne rend pas un ratio, il
          rend un mot: c'est ce mot-là qui est dessiné. */}
      <g fontSize="12" fill={SOFT}>
        {mouths.map((m) => <text key={m.x} x={m.x} y="236" textAnchor="middle">{m.why}</text>)}
      </g>
    </Fig>
  );
}

/* ═══ BANDE 2 — LES TROIS FORMES DE LA DIVERGENCE ════════════════════════════
   La bande de RECONNAISSANCE. Trois cartes, et la troisième est celle qui
   compte: « tout le monde mange pareil » est un FAUX NÉGATIF (POSITIONNEMENT
   §2.3) — ce foyer a renoncé parce que servir la différence coûte trop cher à
   la main, pas parce qu'il n'a pas de différence.

   Et la bande se ferme sur la réponse à l'objection n°1 du brief (§5), sans
   jamais nommer un concurrent: un planificateur gratuit compose pour un NOMBRE
   DE COUVERTS. C'est le seul endroit de la page qui dise pourquoi on paie. */
function Forms() {
  // ⚠️ L'ORDRE EST UN ARGUMENT, PAS UN RANGEMENT (2026-09-01). « Vous cuisinez
  // deux fois » était en tête et fermait la porte à la majorité des lectrices:
  // c'est la forme la plus RARE et la plus extrême, et celle qui ne parle
  // qu'à un foyer déjà résigné à doubler le travail. Les deux premières —
  // le plat unique introuvable, et l'alignement de tout le monde — sont les
  // cas les plus fréquents ET les moins conscients: une lectrice s'y reconnaît
  // avant d'avoir nommé son problème. On la met donc en dernier.
  const forms: Array<{ k: string; title: string; body: string }> = [
    { k: "absorbed", title: t("families.forms.absorbed_title"), body: t("families.forms.absorbed_body") },
    { k: "given_up", title: t("families.forms.given_up_title"), body: t("families.forms.given_up_body") },
    { k: "served", title: t("families.forms.served_title"), body: t("families.forms.served_body") },
  ];
  return (
    <Section tone="dark">
      <Kicker onDark>{t("families.forms.kicker")}</Kicker>
      <SectionTitle>{t("families.forms.title")}</SectionTitle>
      {/* ⚠️ PLUS DE `Card` ICI, ET C'EST LE FOND QUI L'IMPOSE. `Card` porte
          `bg-paper` (c'est sa seule combinaison lisible sur les deux grounds
          clairs du site): trois cartes sur `fig-950` seraient trois pavés
          blancs posés sur du noir, pas trois colonnes d'une même bande. Sur le
          sombre, une colonne se sépare par un FILET.
          ⚠️ LE FILET EST EN `fig-600` ET PAS EN `fig-300`: sur ce fond,
          `fig-300` est à 8:1 — un séparateur qui crierait plus fort que le
          texte qu'il sépare. */}
      <div className="mt-9 grid gap-9 md:grid-cols-3 md:gap-10">
        {forms.map((f) => (
          <div key={f.k} className="min-w-0 border-t border-fig-600 pt-4">
            {/* ⛔ PAS DE `font-display text-sub` ICI. Young Serif ne descend
                jamais sous 20 px (charte §3) et `--text-sub` vaut 19,2. Un
                titre de colonne se fait au poids en Public Sans. */}
            <h3 className="font-medium text-paper">{f.title}</h3>
            <p className="mt-2 text-[15px] leading-7 text-fig-300">{f.body}</p>
          </div>
        ))}
      </div>

    </Section>
  );
}

/* ═══ BANDE 2 — L'ÉQUILIBRE, DIT COMME UN MÉCANISME ═══════════════════════
   ⚠️ BANDE NEUVE (2026-09-01). La page POSAIT la question du doute et y
   répondait « composé pour chacun », sans jamais nommer CE QUI compose. Les
   deux autres pages du foyer le disent maintenant, et c'est la deuxième raison
   d'achat du segment.

   ⛔ CE QU'ON PROMET: la COMPOSITION. ⛔ CE QU'ON NE PROMET PAS: le résultat.
   Aucune garantie (« tous les apports », « à coup sûr »), aucun taux de
   couverture — `coverage` compte les aliments CONNUS et pas les PESÉS —, et
   surtout AUCUN BILAN SUR UN MINEUR. Pas de plancher protéique non plus: il
   vit dans `meal_envelope.ts`, la lane individuelle, et n'est pas lu par
   `household_portions.ts`. */
function Balanced() {
  return (
    <Section tone="paper-2">
      <Kicker>{t("families.balanced.kicker")}</Kicker>
      <SectionTitle>{t("families.balanced.title")}</SectionTitle>
      <div className="mt-9 grid gap-9 lg:grid-cols-2 lg:gap-16">
        {/* fact: `SERVING_DIRECTION` / `readServingDemands`
            (`household_portions.ts`): la direction règle la PART de chaque
            composante, jamais son existence. */}
        <p className="max-w-[62ch] text-[15px] leading-7 text-ink-soft">{t("families.balanced.body")}</p>
        {/* fact: `envelopeFor` compose sur l'âge, le corps et l'activité de
            CHAQUE bouche — le foyer n'a pas UNE enveloppe, il en a une par
            personne.
            ⚠️ C'EST ICI QUE VIT LA CLÔTURE RASSURANTE depuis la suppression de
            la bande du doute — voir la note juste en dessous. */}
        <p className="max-w-[62ch] text-[15px] leading-7 text-ink-soft">{t("families.balanced.body_2")}</p>
      </div>

      {/* ⚠️ LA RÈGLE DU PLAT ET LA CASSEROLE SONT CÔTE À CÔTE, ET C'EST LA
          CORRECTION D'UNE DISPOSITION RATÉE (2026-09-02). Les trois blocs
          étaient EMPILÉS à trois largeurs différentes — grille pleine largeur,
          puis un paragraphe à 78ch, puis une figure à 480: un bord droit en
          dents de scie et la moitié droite de la bande vide sous la grille.
          Ils vont ensemble pour une raison de FOND, pas de remplissage: la
          figure montre UNE casserole et quatre assiettes — le cas nominal — et
          sans cette phrase elle se lit comme une règle (« tout le monde mange
          forcément la même chose »), ce qui est faux: `mergeLadder` a trois
          barreaux et c'est la divergence qui tranche. La règle BORNE la figure,
          donc elle se lit à côté d'elle, pas trois écrans plus haut.
          ⚠️ `<TableFigure />` est l'enfant DIRECT de la grille: c'est son
          `.fig-scroll` qui porte `min-width: 0`, et l'emballer dans un `<div>`
          remonterait le plancher de 380px à la piste (tokens.css §.fig-scroll). */}
      <div className="mt-12 grid items-start gap-9 border-t border-line pt-9 lg:grid-cols-2 lg:gap-16">
        <p className="max-w-[62ch] text-[15px] leading-7 text-ink">
          {t("families.balanced.one_or_two")}
        </p>
        <TableFigure />
      </div>

    </Section>
  );
}

/* ⚠️ LA BANDE DES CONTRAINTES (`Limits`) A ÉTÉ SUPPRIMÉE LE 2026-09-02, sur
   décision du propriétaire, avec ses quatre clés `families.limits.*`.
   Ce qui part avec elle est écrit au-dessus des clés retirées, dans `fr.ts`:
   le FAIL-CLOSED des allergies ne se dit plus nulle part en vitrine, et
   l'interdit parental sans compte quitte le site. La règle du régime, elle,
   survit dans `families.balanced.one_or_two`.
   ⛔ Ne pas la rétablir par symétrie — c'est une décision produit. */

/* ⚠️ LA BANDE `Doubt` A ÉTÉ SUPPRIMÉE LE 2026-09-01, sur décision du
   propriétaire, avec ses quatre clés (`families.doubt.*`). Le fond sombre
   qu'elle portait est passé à `Forms` — « la table », les trois façons dont ça
   se passe chez le lecteur.

   ⚠️ CE QU'ELLE PORTAIT ET QUI N'A PAS DISPARU: sa clôture, « vous n'avez plus
   à vous demander si ça suffit ». C'est la tournure autorisée du dépôt
   (`home.balance.body`, `families.doubt.answer` d'alors) — elle enlève
   l'inquiétude sans promettre un résultat, ce que `LEGAL.md` §6.1 interdit — et
   c'est celle que le propriétaire a lui-même demandée sur `/meal-prep`. Elle
   est repliée dans `families.balanced.body_2`. La retirer de là aussi ferait
   perdre à la page sa seule réponse à la question qu'elle pose. */


/* ═══ BANDE 4 — LE JEUDI, ET LA PREUVE ═══════════════════════════════════════
   Le trou de milieu de semaine: le mode d'échec du batch cooking fait maison,
   que personne ne nomme jamais. C'est le mécanisme qui décide de la semaine 2.
   fact: `_shared/keel/accident.ts` (FF-057) — un plat sauté DÉCALE, une cuisson
   sautée SUPPRIME EN CASCADE, et quatre refus sont calculés sur le plan réel,
   dont `perishables_at_risk`. */
function Thursday() {
  return (
    <Section>
      <Kicker>{t("families.thursday.kicker")}</Kicker>
      <SectionTitle>{t("families.thursday.title")}</SectionTitle>
      <div className="mt-9 grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <div>
          {/* Deux paragraphes de longueur voisine — voir les clés. */}
          <p className="max-w-[62ch]">{t("families.thursday.body")}</p>
          <p className="mt-6 max-w-[62ch]">{t("families.thursday.repair")}</p>
        </div>
        {/* ⚠️ LES TROIS ACCIDENTS, ET PLUS LA SEMAINE. La figure de la semaine
            ne montrait qu'UN accident — la cuisson qui saute — alors que le
            produit en encaisse trois, d'amplitude croissante: un repas, une
            cuisson, des courses (`FF-057` §« les quatre entrées »). C'est la
            même figure que `/meal-prep` et `/couples`
            (`ui/AccidentsFigure.tsx`), avec les clés de CETTE page. */}
        <div className="fig-scroll" tabIndex={0} role="group" aria-labelledby="fam-acc-t">
          <AccidentsFigure
            idPrefix="fam-acc"
            label={t("families.fig.moves.label")}
            title={t("families.fig.moves.title")}
            desc={t("families.fig.moves.desc")}
            mealLabel={t("families.fig.moves.dish")}
            sessionLabel={t("families.fig.moves.session")}
            shoppingLabel={t("families.fig.moves.shopping")}
          />
        </div>
      </div>
    </Section>
  );
}

/* LA PREUVE QUE LE BRIEF §6 RÉCLAME, ET QUE LA PAGE N'AVAIT NULLE PART: une
   SEMAINE montrée. Sept jours, les vagues de courses, la session de cuisine
   placée — puis la même semaine après que la cuisson a sauté.

   ⚠️ LA PIÈCE CHAUDE EST LA RÉPARATION, pas la cuisson. La session prévue est
   un contour d'encre (une chose réelle, épaisseur 2); ce qui porte `--ill-fig`
   est la flèche et la case où la cuisson reprend — c'est-à-dire exactement le
   seul argument de la figure. Une figure dont la pièce chaude n'est pas son
   argument est une figure décorée.

   ⚠️ Le vide se dit en POINTILLÉ et jamais en teinte: `--ill-wash` contre
   `--ill-paper` est à 1,21:1 sur le papier. */
function WeekFigure() {
  const days: Array<{ x: number; label: string }> = [
    { x: 24, label: t("families.fig_week.d1") },
    { x: 84, label: t("families.fig_week.d2") },
    { x: 144, label: t("families.fig_week.d3") },
    { x: 204, label: t("families.fig_week.d4") },
    { x: 264, label: t("families.fig_week.d5") },
    { x: 324, label: t("families.fig_week.d6") },
    { x: 384, label: t("families.fig_week.d7") },
  ];
  const cx = (x: number) => x + 26;
  return (
    <Fig id="fig_week" h={262} label={t("families.fig_week.label")}
      title={t("families.fig_week.a11y_title")} desc={t("families.fig_week.a11y_desc")}>
      {/* LES VAGUES DE COURSES — une barre, deux marques, un seul libellé.
          Deux libellés pour deux marques identiques ne diraient rien de plus.
          ⚠️ LES MARQUES TRAVERSENT LA BARRE (59 → 77 pour une barre à 66), et
          c'est une correction mesurée: posées SOUS la barre, celle du lundi
          tombait à 26 unités de son extrémité gauche et se lisait comme le bout
          du trait. La figure annonçait deux vagues et n'en montrait qu'une. */}
      <text x="24" y="56" fontSize="12" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_week.waves")}</text>
      <path d="M 24 66 L 436 66" fill="none" stroke={SOFT} strokeWidth="1" />
      <g fill="none" stroke={SOFT} strokeWidth="2" strokeLinecap="round">
        <path d="M 50 59 L 50 77" />
        <path d="M 290 59 L 290 77" />
      </g>

      <g fontSize="12" fontWeight="600" letterSpacing="1" fill={SOFT}>
        {days.map((d) => <text key={d.x} x={cx(d.x)} y="92" textAnchor="middle">{d.label}</text>)}
      </g>

      {/* RANGÉE 1 — la semaine composée. Chaque jour porte un repas; mercredi
          porte en plus la session de cuisine. */}
      <text x="24" y="114" fontSize="12" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_week.planned")}</text>
      <g fill={WASH} stroke={SOFT} strokeWidth="1">
        {days.map((d) => <rect key={d.x} x={d.x} y="122" width="52" height="42" rx="10" />)}
      </g>
      {/* ⚠️ LES DEUX CUISSONS TOMBENT SUR LES DEUX MARQUES DE COURSES (x=50 et
          x=290), ET C'EST LA CORRECTION DU 2026-09-02. La cuisson était seule,
          au mercredi, sans rapport avec les vagues dessinées juste au-dessus:
          la figure montrait deux vagues et une cuisson qui n'en suivait
          aucune. Elle cuisine maintenant le jour où les courses arrivent. */}
      {[24, 264].map((x) => (
        <rect key={x} x={x} y="122" width="52" height="42" rx="10" fill={WASH} stroke={INK} strokeWidth="2" />
      ))}
      <g fontSize="12" fontWeight="600" letterSpacing="1" fill={SOFT} textAnchor="middle">
        <text x="50" y="180">{t("families.fig_week.cooking")}</text>
        <text x="290" y="180">{t("families.fig_week.cooking")}</text>
      </g>

      {/* ⚠️ CE QUE LA CUISSON PRODUIT, ET SUR COMBIEN DE SOIRS — AJOUTÉ LE
          2026-09-01. Sans cette accolade, les sept cases étaient VIDES: la
          figure montrait le squelette d'un plan et jamais un plan. Or c'est
          exactement ce que `BRIEF-LANDING-FOYER.md` §6 réclame comme cœur
          visuel — « un plan réel, montré » —, et c'est la seule image que les
          concurrents ne peuvent pas produire. Une case de 52 unités ne peut
          pas porter un nom de plat à 13 unités (quatre signes); l'accolade,
          elle, a toute la largeur, et elle dit en plus le mécanisme: UNE
          cuisson couvre PLUSIEURS soirs.
          ⚠️ LE NOM DU PLAT VIENT DE `families.fig_table.dish`, la clé de la
          figure du héros, et c'est voulu: le haut de la page montre la
          casserole et les quatre assiettes de CE plat, cette figure-ci dit
          quand il se cuisine. Deux clés se seraient contredites le premier
          jour où quelqu'un en éditerait une. */}
      {/* ⚠️ DEUX ACCOLADES DE TROIS SOIRS, ET JEUDI SOUS AUCUNE DES DEUX.
          Ce n'est pas un trou de dessin: `MAX_FRIDGE_DAYS = 3` et
          `fridge_window.ts` compare en `>=` — « cuit dimanche, mangé
          mercredi » est REJETÉ. Une cuisson couvre le jour même + 2.
          ⛔ Ne pas rallonger l'accolade du lundi jusqu'à jeudi: on dessinerait
          ce que le moteur refuse d'exécuter. La légende dit le jeudi. */}
      <g fill="none" stroke={SOFT} strokeWidth="1">
        <path d="M 24 194 L 24 200 L 196 200 L 196 194" />
        <path d="M 264 194 L 264 200 L 436 200 L 436 194" />
      </g>
      <g fontSize="12" fill={INK} textAnchor="middle">
        <text x="110" y="220">{t("families.fig_table.dish")}</text>
        <text x="350" y="220">{t("families.fig_week.dish2")}</text>
      </g>
      <text x="230" y="246" fontSize="13" fill={SOFT} textAnchor="middle">
        {t("families.fig_week.covers")}
      </text>

      {/* ⚠️ LA SECONDE RANGÉE A ÉTÉ RETIRÉE LE 2026-09-01, avec la flèche, le
          report et la légende (`families.fig_week.skipped`, `.moved`,
          `.caption`). Elle montrait la cuisson qui saute — c'est-à-dire UN des
          trois accidents que le produit encaisse, et cet argument a maintenant
          sa bande à lui avec sa propre figure (`ui/AccidentsFigure.tsx`).
          Cette figure-ci est montée dans le HÉROS, où son travail est de
          montrer un plan réel: sept jours, deux vagues, une cuisson, et ce
          qu'elle produit. Une figure de héros qui montre aussi un accident
          vole son sujet à la bande 4 et dit deux choses à la fois. */}
    </Fig>
  );
}

/* ═══ BANDE 5 — COMMENT ÇA MARCHE ════════════════════════════════════════════
   Trois étapes, pas plus. ⚠️ Aucune durée n'est promise: « dix minutes » n'est
   mesuré nulle part, et l'entonnoir est long. Ce qu'on dit est ce qui est VRAI
   et vérifiable — les CHAMPS demandés, et le fait que la première étape ne se
   refait pas.
   fact: `onboarding.ts:97-103` et :211-290 (prénom, date de naissance,
   objectif, allergies) · `household_portions.ts:63-72` (la clé est `memberId`,
   pas un compte: un enfant n'a ni écran ni mot de passe). */
function How() {
  const steps: Array<{ k: string; step: string; title: string; body: string }> = [
    {
      k: "s1",
      step: t("families.how.s1_step"),
      title: t("families.how.s1_title"),
      body: t("families.how.s1_body"),
    },
    {
      k: "s2",
      step: t("families.how.s2_step"),
      title: t("families.how.s2_title"),
      body: t("families.how.s2_body"),
    },
    {
      k: "s3",
      step: t("families.how.s3_step"),
      title: t("families.how.s3_title"),
      body: t("families.how.s3_body"),
    },
  ];
  return (
    <Section tone="paper-2">
      <Kicker>{t("families.how.kicker")}</Kicker>
      <SectionTitle>{t("families.how.title")}</SectionTitle>
      <div className="mt-9 grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <Card key={s.k}>
            {/* Le rang se dit en MOTS. Un « 1 » rendu serait un littéral
                identique dans les deux packs — donc soit une chaîne à
                blanchir dans le test de parité, soit du texte en dur. */}
            <p className="text-label font-semibold uppercase text-ink-soft">{s.step}</p>
            <h3 className="mt-3 font-medium text-ink">{s.title}</h3>
            <p className="mt-2 text-ink-soft">{s.body}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* ═══ BANDE 6 — LE PRIX, ET LA SORTIE ════════════════════════════════════════
   Le prix se DIT. ⚠️ Le montant vient de `PRICES.household` par `formatPrice`,
   jamais d'un littéral de composant. Depuis le 2026-09-01 `price.body` ne porte
   plus AUCUN chiffre: les faits d'offre (le tarif, l'accès en plus, la semaine
   offerte, l'absence d'engagement) sont partis dans le namespace partagé
   `offer` et se rendent par `ui/OfferLines.tsx`. Ne les réécris pas ici — c'est
   exactement comme ça que cette page a fini par vendre « un accompagnement à
   1,99 € » pendant que `/couples` vendait « un profil réclamé à 2 € ».
   Il ne reste ici que l'ARGUMENT propre à la page: pourquoi le prix ne suit pas
   la tablée. Seule `seo_description` garde le chiffre en dur, parce qu'une
   balise `<meta>` n'a pas de composant pour l'interpoler.

   La SEMAINE OFFERTE est vraie pour tout le monde et sans code:
   `HOUSEHOLD_TRIAL_DAYS = 7` (`_shared/billing-tier.ts`), aligné en SQL par
   `keel_household_trial_days()` (`20260901200000_the_trial_is_a_week.sql`).

   La sortie est `/start`, dont la branche foyer attend cette page — et rien ne
   promet une entrée immédiate: la réserve du héros porte la porte
   `keel_free_signup_available`. */
function Price() {
  return (
    <Section>
      <div className="grid gap-11 lg:grid-cols-2 lg:gap-16">
        <div>
          <Kicker>{t("families.price.kicker")}</Kicker>
          {/* fact: 20260810260000_household_billable_profiles.sql:235-250 ·
              :101-105 (plafond de huit bouches, le maître jamais compté) */}
          <SectionTitle>{t("families.price.title")}</SectionTitle>
          <p className="mt-5 max-w-[62ch]">{t("families.price.body")}</p>
          {/* LA RÉSERVE de cette bande.
              fact: aucune app native dans le dépôt (ni capacitor.config, ni
              app.json, ni android/). ⛔ Aucun « rien à installer » pour
              compenser: on nomme l'absence, on n'en fait pas un argument. */}
          <div className="mt-8"><StartLink /></div>
        </div>
        <div className="grid gap-6">
          {/* Une seule carte, pas de liste de fonctionnalités, pas de second
              palier: une carte faite pour être comparée invite le lecteur à
              chercher le plan qui lui manque (règle de `PriceCard`). */}
          <PriceCard price={formatPrice(PRICES.household)} period={t("families.price.period")}
            label={t("families.price.label")} />
          <PriceFigure />
        </div>
      </div>
    </Section>
  );
}

/* Huit places, un seul prix. La première est la vôtre et n'est jamais comptée:
   c'est la pièce chaude, parce que c'est la seule case de la rangée qui ne se
   facture pas.

   ⚠️ CE QUE CETTE FIGURE DIT ET QUE LA CARTE NE PEUT PAS DIRE: ce qui change
   quand une bouche s'ajoute, c'est-à-dire RIEN. Elle ne redit plus le montant —
   il était rendu à 10,3 px, cent pixels sous le même montant en Young Serif
   36 px — et elle légende enfin son remplissage: sans la légende, quatre cases
   teintées et quatre cases claires n'expliquaient à personne ce que « teinté »
   voulait dire.

   ⚠️ LA RANGÉE TIENT DANS 428 UNITÉS. Elle courait jusqu'à 458, donc la
   huitième case était coupée à 375 px sur la figure qui dit « huit places ».
   Le libellé avait été déplacé pour cette raison exacte, l'objet non. */
function PriceFigure() {
  const taken = [76, 128, 180];
  const open = [232, 284, 336, 388];
  return (
    <Fig id="fig_price" h={232} label={t("families.fig_price.label")}
      title={t("families.fig_price.a11y_title")} desc={t("families.fig_price.a11y_desc")}>
      <rect x="24" y="56" width="40" height="40" rx="12" fill={WASH} stroke={FIG} strokeWidth="2" />
      <g fill={WASH} stroke={SOFT} strokeWidth="1">
        {taken.map((x) => <rect key={x} x={x} y="56" width="40" height="40" rx="12" />)}
      </g>
      <g fill="none" stroke={SOFT} strokeWidth="1" strokeDasharray={DASH}>
        {open.map((x) => <rect key={x} x={x} y="56" width="40" height="40" rx="12" />)}
      </g>

      <g fontSize="12" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="24" y="116">{t("families.fig_price.you")}</text>
        <text x="24" y="134">{t("families.fig_price.not_counted")}</text>
        <text x="428" y="116" textAnchor="end">{t("families.fig_price.cap")}</text>
      </g>

      {/* LA LÉGENDE DU REMPLISSAGE. Sans elle, la seule idée de la figure —
          quelles places comptent — repose sur un écart de 1,21:1. */}
      <rect x="24" y="156" width="22" height="14" rx="5" fill={WASH} stroke={SOFT} strokeWidth="1" />
      <rect x="152" y="156" width="22" height="14" rx="5" fill="none" stroke={SOFT} strokeWidth="1" strokeDasharray={DASH} />
      <g fontSize="12" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="54" y="167">{t("families.fig_price.taken")}</text>
        <text x="182" y="167">{t("families.fig_price.free")}</text>
      </g>

      <path d="M 24 190 L 428 190" fill="none" stroke={SOFT} strokeWidth="1" />
      <text x="24" y="214" fontSize="13" fill={INK}>{t("families.fig_price.steady")}</text>
    </Fig>
  );
}

export default FamiliesPage;
