import React from "react";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { t } from "../i18n/t";

/**
 * `/meal-prep` — LA PAGE DU SOLO QUI FAIT DÉJÀ DU MEAL PREP.
 *
 * Son lecteur cuisine une fois pour plusieurs jours et veut perdre ou prendre du
 * poids. Ce comportement EST l'unité du produit (la session de cuisine): la page
 * ne lui apprend donc pas une méthode, elle lui montre que le produit est écrit
 * dans SA maille. `/couples` et `/families` existent pour les autres foyers.
 *
 * ── CE QUE CETTE PAGE N'A PAS LE DROIT DE PROMETTRE ────────────────────────
 * Chaque interdit a son ancre dans `scratchpad/site/AUDIT-SITE.md`, et chacun a
 * déjà été écrit quelque part dans ce dépôt avant d'en être retiré.
 *
 * · NI DURÉE D'ESSAI NI BOUTON D'ACHAT (§8 n°1). Le prix se DIT, c'est une
 *   décision produit; mais le tunnel rend 500 faute de prix Stripe et
 *   `free_until` gèle tout foyer neuf à J+31 sans chemin de dégel. D'où
 *   l'absence d'`Offer` dans les données structurées: déclarer une offre à un
 *   moteur, c'est promettre un achat qui n'existe pas.
 * · JAMAIS « jamais de calories » (C15, §8 n°2): le produit AFFICHE des kcal
 *   depuis FF-059. Ce qui est vrai: ils sont ÉTEINTS PAR DÉFAUT
 *   (`profiles.energy_display_enabled`) et une chaîne de gardes décide si on
 *   peut les allumer. Le NOMBRE de gardes n'est pas écrit: le brief en annonce
 *   quatre, l'audit en compte cinq, et un chiffre sans source unique n'entre
 *   pas sur une page (S8).
 * · JAMAIS « échanger un plat » (§5.1): `REALIGNMENT_ACTIONS` = `shift_dish`,
 *   `no_cook`, `shift_session`, `nothing_to_change`. Il n'y a pas de
 *   « remplacer », et `accident.ts` écrit qu'aucune fonction d'ici ne choisit
 *   un plat.
 * · AUCUN SUIVI DE POIDS, aucune courbe (C16, silence S6) — alors même que le
 *   lecteur vient AVEC un objectif de poids: il le pose à l'entrée, la page
 *   s'arrête là.
 * · AUCUNE APPLICATION MOBILE (C17): donc aucun cadre de téléphone dans les
 *   figures (F12), et aucun « rien à installer » pour compenser (S4) — cette
 *   phrase se retrouve toujours au-dessus de la chose qu'elle nierait.
 * · AUCUNE ENTRÉE PROMISE COMME IMMÉDIATE (§10): `/start` interroge d'abord
 *   `keel_free_signup_available`, et la porte est fermée si le programme du
 *   coach maison n'est pas publié. Le CTA dit « commencer », pas « en 2 min ».
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────
 * Direction « la fiche » (`scratchpad/site/design/CHARTE.md`): la page est faite
 * de CHAMPS et de PLANCHES — une étiquette, une figure, sa légende. Les trois
 * figures sont des illustrations de CONCEPT: la matière vue de dessus (la
 * casserole, les courses), l'écrit vu de face (le plan). Aucune photographie ici
 * ni ailleurs sur le site, et c'est un risque assumé: le produit ne fabrique
 * aucune image, une assiette photographiée serait une assiette que personne n'a
 * cuisinée (CHARTE §8).
 *
 * ⚠️ F8 (« une seule pièce chaude ») SE VÉRIFIE FIGURE PAR FIGURE, PAS PAR
 * FICHIER: l'équerre est factorisée dans `FigureHead` pour que les trois figures
 * ne divergent pas de géométrie, donc le grep de contrôle (`= 2`) rend 4 ici.
 * Chaque figure a bien son équerre partagée et UNE pièce chaude — la casserole,
 * le panier, le plat.
 */

// Hissé hors du render: `SEO` garde `structuredData` dans une dépendance de
// `useEffect`, et un littéral inline reconstruirait les balises à chaque rendu.
// L'entité légale vient de `lib/legalEntity` — c'est la MÊME déclaration que
// fait `/legal` à un humain, et deux copies manuscrites d'un numéro de TVA sont
// exactement la façon dont elles finissent par se contredire.
const MEALPREP_STRUCTURED_DATA = [organizationStructuredData()];

export function MealPrepPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SEO
        title={t("mealprep.seo_title")}
        description={t("mealprep.seo_description")}
        canonical={`${LEGAL_ENTITY.siteUrl}/meal-prep`}
        structuredData={MEALPREP_STRUCTURED_DATA}
      />

      {/* `audience="student"`: l'en-tête coach porte les portes de vente B2B et
          le bouton d'essai coach — deux offres de plus sur une page qui en vend
          une seule, à un lecteur qui n'est pas un praticien. */}
      <PublicHeader />

      <main>
        <Hero />
        <Quiet />
        <Waves />
        <Moves />
        <Start />
      </main>

      <PublicFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les pièces de mise en page — la grammaire de la fiche
// ---------------------------------------------------------------------------

/** L'enveloppe d'une section. Padding vertical en `pt`/`pb` et JAMAIS en
 *  raccourci: `padding: 84px 0 76px` remet le padding HORIZONTAL à zéro, et le
 *  titre sort des deux côtés de l'écran à 320 px (CHARTE §4). */
function Band({ tone = "", children }: { tone?: string; children: React.ReactNode }) {
  return (
    <section className={tone}>
      <div className="mx-auto max-w-[1200px] px-5 pb-[40px] pt-[44px] sm:px-8 sm:pb-[76px] sm:pt-[84px]">{children}</div>
    </section>
  );
}

/** LA PLANCHE: une figure, puis sa légende sous un filet. Le lecteur qui ne lit
 *  que les titres et les figures doit comprendre l'offre entière, donc la figure
 *  vient AVANT le texte. `fig-scroll` lui donne une largeur plancher de 380 px et
 *  laisse le conteneur défiler dessous: à 320 px, un texte de figure ferait 5 px. */
function Plate({ figure, children }: { figure: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mt-8 overflow-hidden rounded-fiche border border-line bg-paper sm:mt-10">
      <div className="fig-scroll p-5 sm:p-8">{figure}</div>
      {children && <div className="border-t border-line p-5 sm:p-8">{children}</div>}
    </div>
  );
}

/** Un champ de fiche : l'étiquette au-dessus, la valeur en dessous. */
function Field(
  { label, children, onDark = false }: { label: string; children: React.ReactNode; onDark?: boolean },
) {
  return (
    <div>
      <dt className={`text-label font-semibold uppercase ${onDark ? "text-fig-300" : "text-ink-soft"}`}>{label}</dt>
      <dd className="mt-2 max-w-[62ch]">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les sections
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <Band>
      {/* fact: PIVOT-FOYER §5 + C1 — 20260810260000_household_billable_profiles.sql:235-250 */}
      <Kicker>{t("mealprep.hero.kicker")}</Kicker>
      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        {/* Le seul h1 de la page. Young Serif n'a qu'une graisse: la hiérarchie
            se fait à la taille et à l'espace, jamais au gras. */}
        <h1 className="max-w-[15ch] text-balance font-display text-hero">{t("mealprep.hero.title")}</h1>
        <div className="lg:border-l lg:border-line lg:pl-10">
          {/* fact: C3 — meal_generation.ts:518 · objectif posé à l'entrée: C14 */}
          <p className="max-w-[62ch] text-lede text-ink-soft">{t("mealprep.hero.lede")}</p>
          {/* CTA unique de la page, répété une fois en clôture et jamais mis en
              concurrence avec une seconde offre.
              fact: C13 — onboarding.ts:84 `FunnelBranch` (branche `solo`) */}
          <p className="mt-6"><ButtonLink to="/start" variant="brand">{t("mealprep.cta")}</ButtonLink></p>
          {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250 */}
          <p className="mt-4 max-w-[52ch] text-sm text-ink-soft">{t("mealprep.hero.price_note")}</p>
        </div>
      </div>
      <Plate figure={<SessionFigure />} />
    </Band>
  );
}

/**
 * LE BLOC SOMBRE — un seul par page, et il est dépensé ICI, en position 2.
 *
 * Ce lecteur arrive avec une objection avant d'avoir une question : il a déjà
 * désinstallé un compteur. La lever plus bas serait la lever après qu'il soit
 * parti. Ce que le bloc sombre porte sur une page foyer, c'est « ce qu'on ne
 * promet pas » (CHARTE §7) — ici, ce qu'on ne compte pas.
 */
function Quiet() {
  return (
    <Band tone="on-dark bg-fig-950 text-paper">
      <Kicker onDark>{t("mealprep.quiet.kicker")}</Kicker>
      {/* fact: C15 — plan/EnergyReadout.tsx:42-45 + 20260812230000:60 (défaut false) */}
      <SectionTitle>{t("mealprep.quiet.title")}</SectionTitle>
      <dl className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-12">
        {/* fact: C15 — energy_gate.ts:228-249 (chaîne de gardes) */}
        <Field label={t("mealprep.quiet.numbers_label")} onDark>{t("mealprep.quiet.numbers_value")}</Field>
        {/* fact: S9 — l'évaluateur d'adhérence est déprogrammé en 1:N (20260803200000) */}
        <Field label={t("mealprep.quiet.ranking_label")} onDark>{t("mealprep.quiet.ranking_value")}</Field>
        {/* fact: C3 + C5 — meal_generation.ts:518, grocery_waves.ts:211 */}
        <Field label={t("mealprep.quiet.left_label")} onDark>{t("mealprep.quiet.left_value")}</Field>
      </dl>
    </Band>
  );
}

function Waves() {
  return (
    <Band>
      <Kicker>{t("mealprep.waves.kicker")}</Kicker>
      {/* fact: C5 — meal_generation.ts:693, grocery_waves.ts:211 (MAX_FRIDGE_DAYS = 3) */}
      <SectionTitle>{t("mealprep.waves.title")}</SectionTitle>
      <Plate figure={<WavesFigure />}>
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-12">
          <p className="max-w-[62ch]">{t("mealprep.waves.body")}</p>
          {/* La réserve honnête de C5, écrite plutôt que tue: le front MASQUE
              les vagues quand il n'y en a qu'une (ShoppingListPanel.tsx:137-149).
              Promettre « des vagues » à qui n'en verra qu'une ment pour rien. */}
          <p className="max-w-[62ch] text-ink-soft">{t("mealprep.waves.reserve")}</p>
        </div>
      </Plate>
    </Band>
  );
}

function Moves() {
  return (
    <Band tone="bg-paper-2">
      <Kicker>{t("mealprep.moves.kicker")}</Kicker>
      {/* fact: C7 — accident.ts:995-1004 `REALIGNMENT_ACTIONS` */}
      <SectionTitle>{t("mealprep.moves.title")}</SectionTitle>
      <Plate figure={<MovesFigure />}>
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-12">
          {/* fact: C7 — accident.ts:995-1004 + chat/deterministic_buttons.ts */}
          <p className="max-w-[62ch]">{t("mealprep.moves.body")}</p>
          {/* fact: §5.1 — accident.ts:52-55 « aucune fonction d'ici ne choisit un plat » */}
          <p className="max-w-[62ch] text-ink-soft">{t("mealprep.moves.note")}</p>
        </div>
      </Plate>
    </Band>
  );
}

function Start() {
  // Les quatre clés restent LITTÉRALES: écrites en gabarit, un grep « quelles
  // clés cette page consomme » ne les trouve plus, et le jour où l'une bouge
  // c'est le rendu qui échoue, pas la compilation.
  const asks = [t("mealprep.start.ask_name"), t("mealprep.start.ask_birthdate"),
    t("mealprep.start.ask_goal"), t("mealprep.start.ask_allergies")];
  return (
    <Band>
      <Kicker>{t("mealprep.start.kicker")}</Kicker>
      {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250 */}
      <SectionTitle>{t("mealprep.start.title")}</SectionTitle>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 sm:mt-10">
        {/* Une seule carte, pas de liste de fonctionnalités, pas de second
            palier: une carte faite pour être comparée invite le lecteur à
            chercher le plan qui lui manque (règle de `PriceCard`). */}
        <PriceCard
          price={t("mealprep.start.price")}
          period={t("mealprep.start.period")}
          label={t("mealprep.start.price_label")}
        />
        <div>
          {/* fact: PIVOT-FOYER §5 + C1 — le maître n'est jamais compté */}
          <p className="max-w-[62ch]">{t("mealprep.start.body")}</p>

          {/* LA FICHE VIERGE — ce qu'on demande à l'entrée, et rien de plus.
              Aucune durée annoncée: rien ne la mesure dans le dépôt (C14, D5),
              et « 90 secondes » serait un chiffre sans source. Des libellés en
              lecture, jamais un formulaire: le compte se crée sur `/start`. */}
          <div className="mt-8 rounded-fiche border border-line bg-paper p-5 sm:p-6">
            <p className="eq text-label font-semibold uppercase text-ink-soft">{t("mealprep.start.asks_label")}</p>
            {/* fact: C14 — onboarding.ts:650-662 */}
            <ul className="mt-4">
              {asks.map((ask) => (
                <li key={ask} className="border-t border-line py-3 text-sm first:border-t-0 first:pt-0">{ask}</li>
              ))}
            </ul>
          </div>

          {/* fact: §10 — `/start` est la seule porte d'inscription libre */}
          <p className="mt-8"><ButtonLink to="/start" variant="brand">{t("mealprep.cta")}</ButtonLink></p>
          <p className="mt-4 max-w-[52ch] text-sm text-ink-soft">{t("mealprep.start.note")}</p>
        </div>
      </div>
    </Band>
  );
}

// ---------------------------------------------------------------------------
// Les figures
//
// Grille 480×240 pour les trois (F1) — 480 est ce qui rend les figures
// comparables d'une page à l'autre du site, on ne change pas la largeur.
// Deux épaisseurs et deux seulement: 2 = le contour d'une chose réelle,
// 1 = une annotation ou un détail interne (F2). Coordonnées entières (F5).
// Aucun dégradé, aucun filtre, aucune ombre, aucune opacité (F7). Aucune
// couleur d'état: ni émeraude, ni ambre, ni rouge, ni bleu (F10).
//
// Le `font-family` n'est PAS déclaré: `<text>` hérite la famille du document,
// donc Public Sans, et une famille écrite ici serait un quatrième endroit où
// la typographie de la marque peut diverger.
//
// ⚠️ `max-w-[560px]` EST UN PLAFOND, ET IL MANQUAIT: `tokens.css` donne un
// PLANCHER de 380 px, rien au-dessus. Sur une planche de 1200 px le SVG
// s'étirait à 1070 (mesuré) et le libellé de figure passait à 25 px — plus
// gros que le chapô. 560 px le tient à ~13 px, sa taille de dessin.
// ---------------------------------------------------------------------------

/** L'équerre et le libellé de la figure, même géométrie pour les trois.
 *  Elle n'encadre pas, elle OUVRE — et elle ne flotte jamais seule: il y a
 *  toujours un mot à sa droite. Une équerre sans libellé est un défaut. */
function FigureHead({ label }: { label: string }) {
  return (
    <>
      <path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" fill="none" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinecap="round" />
      <text x="44" y="26" fontSize="11" fontWeight="600" letterSpacing="1.2" fill="var(--ill-ink-soft, #6A5A64)">{label}</text>
    </>
  );
}

/**
 * FIGURE 1 — une session de cuisine, et les repas qu'elle couvre.
 *
 * La matière est vue DE DESSUS, strictement orthogonale (F3). Le peigne qui
 * relie la casserole aux contenants est à 0° et 90° — aucun oblique, donc
 * aucune occasion de dériver (F4).
 *
 * ⚠️ LES CONTENANTS SONT LE MÊME ÉLÉMENT, APPELÉ TROIS FOIS. C'est la garde de
 * F9: « c'est la même cuisson » est tenu par la structure du fichier et pas par
 * la vigilance du relecteur, et aucun des trois ne peut prendre une taille qui
 * affirmerait une mesure que le produit ne calcule pas. Leurs deux compartiments
 * sont égaux pour la même raison — inégaux, ils auraient dessiné un ratio.
 * Le NOMBRE trois n'est pas une quantité promise: c'est le pluriel de « repas ».
 */
function SessionFigure() {
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="mp-f1-t mp-f1-d" className="mx-auto block w-full max-w-[560px]">
      <title id="mp-f1-t">{t("mealprep.fig.session.title")}</title>
      <desc id="mp-f1-d">{t("mealprep.fig.session.desc")}</desc>
      <defs>
        <g id="mp-box">
          <rect x="0" y="0" width="150" height="44" rx="12" fill="var(--ill-paper, #FBF8FA)" stroke="var(--ill-ink, #23191F)" strokeWidth="2" />
          <rect x="12" y="10" width="61" height="24" rx="4" fill="var(--ill-wash, #EFE0E9)" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" />
          <rect x="77" y="10" width="61" height="24" rx="4" fill="var(--ill-wash, #EFE0E9)" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" />
        </g>
      </defs>

      <FigureHead label={t("mealprep.fig.session.label")} />

      {/* LA CASSEROLE — la seule pièce chaude du dessin. Même géométrie que
          l'étalon: c'est la même casserole d'une page du site à l'autre. */}
      <g stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinejoin="round">
        <rect x="26" y="135" width="32" height="18" rx="9" fill="var(--ill-paper, #FBF8FA)" />
        <rect x="150" y="135" width="32" height="18" rx="9" fill="var(--ill-paper, #FBF8FA)" />
        <circle cx="104" cy="144" r="54" fill="var(--ill-paper, #FBF8FA)" />
      </g>
      <circle cx="104" cy="144" r="42" fill="var(--ill-wash, #EFE0E9)" />
      <text x="104" y="222" textAnchor="middle" fontSize="12" fill="var(--ill-ink-soft, #6A5A64)">{t("mealprep.fig.session.pot")}</text>

      {/* LE PEIGNE — annotation, donc épaisseur 1. */}
      <g fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" strokeLinecap="round">
        <path d="M 184 146 L 286 146" />
        <path d="M 252 86 L 252 206" />
        <path d="M 252 86 L 286 86" />
        <path d="M 252 206 L 286 206" />
      </g>

      <text x="286" y="52" fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">{t("mealprep.fig.session.covers")}</text>
      <use href="#mp-box" x="286" y="64" />
      <use href="#mp-box" x="286" y="124" />
      <use href="#mp-box" x="286" y="184" />
    </svg>
  );
}

/**
 * FIGURE 2 — les courses en vagues, le long des jours.
 *
 * Les deux paniers sont le même `<use>`: une vague est une vague, la seconde
 * n'est pas « plus petite ». Le premier empan couvre TROIS crans, et c'est la
 * seule longueur de cette page qui affirme une mesure — elle est au tableau
 * des faits (MAX_FRIDGE_DAYS = 3), donc elle a le droit d'être une géométrie.
 * Le second empan reste OUVERT à droite, exprès: fermé, il aurait affirmé que
 * la seconde vague couvre quatre jours, ce que rien ne calcule.
 */
function WavesFigure() {
  const days = [64, 126, 188, 250, 312, 374, 436];
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="mp-f2-t mp-f2-d" className="mx-auto block w-full max-w-[560px]">
      <title id="mp-f2-t">{t("mealprep.fig.waves.title")}</title>
      <desc id="mp-f2-d">{t("mealprep.fig.waves.desc")}</desc>
      <defs>
        {/* LE PANIER — la pièce chaude, déclarée une fois sur le groupe pour
            que les deux appels n'en fassent pas deux couleurs. */}
        <g id="mp-wave" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M 14 16 A 12 12 0 0 1 38 16" fill="none" />
          <rect x="0" y="16" width="52" height="36" rx="10" fill="var(--ill-wash, #EFE0E9)" />
        </g>
      </defs>

      <FigureHead label={t("mealprep.fig.waves.label")} />

      <g fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">
        <text x="100" y="60">{t("mealprep.fig.waves.first")}</text>
        <text x="317" y="60">{t("mealprep.fig.waves.next")}</text>
      </g>
      <use href="#mp-wave" x="100" y="66" />
      <use href="#mp-wave" x="317" y="66" />

      {/* LES DEUX EMPANS et leurs descentes — annotation, épaisseur 1, angles
          droits uniquement. Les retours verticaux ferment le premier empan;
          le second n'en a qu'un, à gauche. */}
      <g fill="none" stroke="var(--ill-ink-soft, #6A5A64)" strokeWidth="1" strokeLinecap="round">
        <path d="M 126 118 L 126 146" />
        <path d="M 343 118 L 343 146" />
        <path d="M 64 152 L 64 146 L 188 146 L 188 152" />
        <path d="M 250 152 L 250 146 L 436 146" />
        <path d="M 64 170 L 436 170" />
        {days.map((x) => <path key={x} d={`M ${x} 164 L ${x} 176`} />)}
      </g>

      <g fontSize="9" fontWeight="600" letterSpacing="1" fill="var(--ill-ink-soft, #6A5A64)">
        <text x="126" y="196" textAnchor="middle">{t("mealprep.fig.waves.fresh")}</text>
        <text x="436" y="196" textAnchor="end">{t("mealprep.fig.waves.week")}</text>
      </g>
    </svg>
  );
}

/**
 * FIGURE 3 — les trois gestes qu'une semaine accepte.
 *
 * L'écrit (le plan, un soir, une session) est vu DE FACE, strictement plat
 * (F3). Ce n'est PAS une maquette de produit: aucune de ces chaînes n'est
 * citée du code, donc rien ici ne se donne pour une capture d'écran (S10, et
 * l'interdit §8 n°12 — une paraphrase présentée comme un écran).
 *
 * Le plat est un `<use>` unique: c'est le même objet qui se décale au premier
 * geste et qui part avec sa session au deuxième. Au troisième, il n'est pas
 * là — et c'est le MOT qui porte l'absence, pas une couleur (F10).
 */
function MovesFigure() {
  const soft = "var(--ill-ink-soft, #6A5A64)";
  const cards: Array<{ x: number; label: string; kind: "dish" | "session" | "none" }> = [
    { x: 24, label: t("mealprep.fig.moves.dish"), kind: "dish" },
    { x: 176, label: t("mealprep.fig.moves.session"), kind: "session" },
    { x: 328, label: t("mealprep.fig.moves.tonight"), kind: "none" },
  ];
  return (
    <svg viewBox="0 0 480 240" role="img" aria-labelledby="mp-f3-t mp-f3-d" className="mx-auto block w-full max-w-[560px]">
      <title id="mp-f3-t">{t("mealprep.fig.moves.title")}</title>
      <desc id="mp-f3-d">{t("mealprep.fig.moves.desc")}</desc>
      <defs>
        <g id="mp-dish"><rect x="0" y="0" width="32" height="20" rx="4" fill="var(--ill-wash, #EFE0E9)" stroke="var(--ill-fig, #632C4C)" strokeWidth="2" /></g>
      </defs>

      <FigureHead label={t("mealprep.fig.moves.label")} />

      {cards.map((card) => (
        <g key={card.x} fill="none" stroke={soft} strokeWidth="1">
          <rect x={card.x} y="52" width="128" height="128" rx="12" fill="var(--ill-paper, #FBF8FA)" />
          {card.kind === "none"
            ? (
              // UN SEUL SOIR, et rien dedans. La carte n'a pas de destination
              // parce que rien ne se déplace: c'est la STRUCTURE qui porte le
              // geste, le mot en dessous le nomme, la couleur ne le porte pas.
              <>
                <rect x={card.x + 40} y="72" width="48" height="76" rx="4" />
                <rect x={card.x + 48} y="100" width="32" height="20" rx="4" />
              </>
            )
            : (
              // DEUX SOIRS: celui qu'on quitte, celui où l'on va. Sans la case
              // d'arrivée, la flèche pointait hors de la carte, vers rien.
              <>
                <rect x={card.x + 12} y="72" width="48" height="76" rx="4" />
                <rect x={card.x + 68} y="72" width="48" height="76" rx="4" />
                {card.kind === "session"
                  ? (
                    <>
                      <rect x={card.x + 16} y="92" width="40" height="36" rx="4" />
                      <rect x={card.x + 72} y="92" width="40" height="36" rx="4" />
                    </>
                  )
                  : <rect x={card.x + 76} y="100" width="32" height="20" rx="4" />}
                <use href="#mp-dish" x={card.x + 20} y="100" />
                {/* La flèche est DESSINÉE et non tapée: U+2192 n'a de glyphe
                    dans aucune des deux familles de la marque (CHARTE §0 ④). */}
                <g strokeLinecap="round" strokeLinejoin="round">
                  <path d={`M ${card.x + 40} 164 L ${card.x + 88} 164`} />
                  <path d={`M ${card.x + 83} 160 L ${card.x + 88} 164 L ${card.x + 83} 168`} />
                </g>
              </>
            )}
          <text x={card.x + 64} y="206" textAnchor="middle" stroke="none" fontSize="9" fontWeight="600" letterSpacing="1" fill={soft}>{card.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default MealPrepPage;
