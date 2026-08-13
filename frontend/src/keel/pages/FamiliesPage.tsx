import React from "react";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { ButtonLink } from "../components/ui/Button";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { t } from "../i18n/t";

/**
 * KEEL — `/families`, la porte de vente du FOYER. Namespace i18n: `families`.
 *
 * L'ACHETEUR. Une personne qui nourrit trois bouches ou plus, aux besoins
 * différents. Elle porte la décision du soir ET la mémoire de ce que chacun ne
 * mange pas. Son objection réelle n'est pas le prix, c'est « je ne délègue pas
 * ça à une application » — et elle ne se lève pas avec un adjectif, elle se
 * lève avec un COMPORTEMENT.
 *
 * ── REFONTE « PAR LA DOULEUR » DU 2026-08-13 ───────────────────────────────
 * Huit sections sont devenues QUATRE BANDES, une par ligne de
 * `scratchpad/site/GRILLE-DOULEURS.md` (« En famille — /families »), plus le
 * prix. Chaque bande porte UNE figure, et c'est la figure qui porte
 * l'argument: 1043 mots rendus sont tombés à 564.
 *
 *   1. LA TABLE   — « on mange quoi ? », tous les soirs. Un plat pour tout le
 *                   monde, une cuisson, la part de chacun. L'ENVIE DE LA
 *                   SEMAINE (C12) n'a plus de bande à elle: elle sert ICI, en
 *                   une ligne, comme le mécanisme qui répond à la question.
 *   2. LA CHARGE  — écrit une FOIS (C8), et ce qu'une bouche ne peut pas
 *                   manger gouverne alors toute la casserole (C9). Le bloc
 *                   sombre, unique, est dépensé ici: c'est la seule bande où
 *                   « ce qu'on refuse de faire » est un argument de vente et
 *                   pas une excuse.
 *   3. LES ENFANTS— l'objectif s'arrête aux adultes (C10).
 *   4. LE PRIX    — le foyer, pas la bouche (C1). Et la sortie: `/start`.
 *
 * ⚠️ L'ORDRE EST L'ARBITRAGE CENTRAL, ET IL A CHANGÉ. L'allergie était en
 * position 2 avec le titre « The refusal »; elle est maintenant en
 * CONSÉQUENCE, dans la bande 2, jamais en ouverture et jamais en titre de
 * section. C'est une ceinture de sécurité, pas un moteur d'achat: la plupart
 * des familles n'en ont pas, et ouvrir dessus vend par la peur à une minorité.
 * Le refus reste — il devient la PREUVE que « écrit une fois » veut dire
 * quelque chose, au lieu d'être la manchette.
 *
 * LE MOT QUI N'APPARAÎT NULLE PART: « PARTOUT ». La garde couvre ce qui se
 * FABRIQUE (la semaine, le repas); une réponse écrite dans le chat ne recharge
 * pas l'union du foyer (`run.ts:2211`, FF-046 §7 trou n°8). Le trou est NOMMÉ
 * dans la réserve de la bande 2 plutôt que recouvert: sur un sujet d'allergie,
 * une promesse trop large fabrique un faux sentiment de sécurité — c'est le
 * reproche que le monde de l'allergie alimentaire fait au mot
 * « allergy-friendly ». Même raison: cette page n'écrit jamais « sûr », « sans
 * risque » ni « safe ». Elle décrit ce que le produit fait, et ce qu'il refuse.
 *
 * TROIS INTERDITS PROPRES À CETTE PAGE. (1) Aucune durée — « 90 secondes »
 * n'est mesuré nulle part (C14, D5), on dit les quatre CHAMPS. (2) Aucun
 * vocabulaire de régime autour d'un enfant: ni poids, ni chiffre, ni corps —
 * le produit tient la règle en structure (C10), la copie la tient en registre.
 * (3) Aucune promesse médicale, dite en toutes lettres dans la réserve sombre.
 *
 * CE QU'ON NE VEND PAS PARCE QUE C'EST MORT: le « conseil de famille ». FF-050
 * §3 — aucune récolte par membre, aucun arbitrage en code, `envy_line_used`
 * jamais rendu. Ce qui existe est UNE ligne, écrite par le maître, lue par le
 * générateur: c'est tout ce que la bande 1 promet. ⚠️ Et la page ne le NIE
 * même plus: démentir un mécanisme que personne n'a réclamé, c'est le
 * suggérer. L'ancien `families.limits.i4` est mort pour cette raison.
 *
 * L'HONNÊTETÉ N'EST PLUS UNE SECTION, ELLE EST UNE RÉSERVE. `NotPromised`
 * n'existe plus comme bande; ses six lignes se sont repliées LÀ OÙ ELLES
 * MORDENT — le trou de `plan_question` et l'absence de promesse médicale sous
 * la bande 2, l'absence de courbe de poids (C16/S6) et les chiffres éteints
 * par défaut (C15) sous la bande 3, l'absence d'application native (C17) sous
 * la bande 4. Aucune n'a été perdue en route, et aucune ne compense: on nomme
 * l'absence, on n'en fait jamais un argument (silence S4).
 *
 * LE PRIX. 12,99 € le foyer entier, le maître jamais compté, plafond 8 bouches.
 * Le prix est DIT (FF-049); la durée d'essai et le geste d'achat ne le sont pas
 * — le tunnel ne peut pas encaisser aujourd'hui (AUDIT §8 n°1). CTA unique et
 * répété: `/start`, dont la branche `family` attend cette page.
 *
 * ── LES FIGURES (CHARTE-VITRINE §5) ───────────────────────────────────────
 * Quatre, une par bande, grille de 480 unités, deux épaisseurs (2 = contour
 * d'une chose réelle, 1 = annotation), coordonnées entières, aucune couleur
 * d'état, aucune photographie, aucun cadre de téléphone.
 *
 * ⚠️ AUCUNE PROPORTION QUE LE PRODUIT NE CALCULE PAS POUR L'ÉCRAN. Les parts
 * des bandes 1 et 3 sont le MÊME élément SVG, appelé par `<use>`: dessiner
 * l'assiette d'un enfant plus petite affirmerait une mesure qu'aucun écran ne
 * rend, et sur cette page-ci ça ressemblerait à un régime d'enfant. Ce que le
 * produit dit d'un mineur est un MOT, pas un ratio: `CHILD_DIRECTION` =
 * « child-size share of the same dish » (`household_portions.ts:166`).
 *
 * ⚠️ LA FIGURE DE LA BANDE 2 EST SUR FOND SOMBRE, ET ELLE N'A DONC PAS LE
 * DROIT D'UTILISER `--ill-ink`: `.on-dark` (tokens.css) remonte `--ill-fig` et
 * `--ill-ink-soft` à `fig-300` (8,06:1) mais laisse l'encre à `#23191F`, qui
 * disparaît. Elle est donc monochrome, en deux épaisseurs — un bleu de plan
 * plutôt qu'une planche —, et sa hiérarchie se fait à la TAILLE. Même raison
 * pour les remplissages: `--ill-paper` et `--ill-wash` sont des clairs, ils
 * crieraient sur du `fig-950`; la figure n'a aucun aplat.
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
        <Table />
        <Load />
        <Age />
        <Price />
      </main>
      <PublicFooter />
    </div>
  );
}

const INK = "var(--ill-ink, #23191F)", SOFT = "var(--ill-ink-soft, #6A5A64)";
const PAPER = "var(--ill-paper, #FBF8FA)", WASH = "var(--ill-wash, #EFE0E9)";
const FIG = "var(--ill-fig, #632C4C)";

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

   `h` existe parce que les quatre figures n'ont pas la même hauteur: la
   LARGEUR est la grille commune du site (480 unités), pas la hauteur. */
function Fig(
  { id, label, title, desc, h = 240, children }: {
    id: string; label: string; title: string; desc: string; h?: number; children: React.ReactNode;
  },
) {
  return (
    <div className="fig-scroll">
      <svg viewBox={`0 0 480 ${h}`} role="img" aria-labelledby={`${id}-t ${id}-d`}
        className="h-auto w-full max-w-[560px]">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        {/* L'équerre de figure, même géométrie pour les quatre. ⚠️ Elle porte
            `--ill-fig`, donc le grep « une seule pièce chaude » (F8) rend 2 par
            figure: F8 se vérifie figure par figure, l'équerre est la signature
            et pas la pièce. */}
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
  return <ButtonLink to="/start" variant="brand" className="px-5 py-2.5 text-[1rem]">{t("families.hero.cta")}</ButtonLink>;
}

/* ═══ BANDE 1 — « ON MANGE QUOI ? », TOUS LES SOIRS ══════════════════════════
   La douleur qui fait dire « c'est moi » en cinq secondes, et elle n'est pas
   l'allergie: c'est la question du soir, pour des gens qui ne veulent pas la
   même chose. La réponse tient en une image — une ligne écrite par vous, une
   seule cuisson, la part de chacun. */
function Table() {
  return (
    <Section>
      <div className="grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <div>
          <Kicker>{t("families.hero.kicker")}</Kicker>
          <h1 className="mt-3 text-balance font-display text-hero">{t("families.hero.title")}</h1>
          {/* fact: C4 — household_portions.ts:125,563 · household_composition.ts:191-240
              (un plat, des parts qui divergent) · unité = la session de cuisine, C3 */}
          <p className="mt-5 max-w-[62ch] text-lede text-ink-soft">{t("families.hero.lede")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <StartLink />
            {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250 */}
            <p className="text-sm text-ink-soft">{t("families.hero.price_note")}</p>
            {/* fact: §10 — `/start` interroge `keel_free_signup_available`: la porte est
                fermée tant que le programme du coach maison n'est pas publié. */}
            <p className="mt-2 text-[13px] leading-5 text-ink-soft">{t("families.hero.reserve")}</p>
          </div>
        </div>
        <TableFigure />
      </div>
      {/* L'ENVIE DE LA SEMAINE, EN UNE LIGNE — plus une section, une phrase.
          fact: C12 — keel_household_submit_envy (refus `not_owner`) ·
          generate-household-meal-v1:1579-1589. ⛔ Rien sur un arbitrage rendu:
          `index.ts:3088-3092` ne rend délibérément pas `envy_line_used`.
          fact: C4 réserve — FF-043 §11 n°1: les grammes n'atteignent aucun écran. */}
      <p className="mt-9 max-w-[62ch] text-ink-soft">{t("families.hero.note")}</p>
    </Section>
  );
}

/* Une ligne, une cuisson, quatre parts. Les quatre parts sont le MÊME élément
   appelé par `<use>`: aucune ne peut prendre une taille qui affirmerait un
   ratio (CHARTE §5). La casserole est la pièce chaude. */
function TableFigure() {
  const mouths: Array<{ x: number; name: string }> = [
    { x: 60, name: t("families.fig_table.m1") },
    { x: 180, name: t("families.fig_table.m2") },
    { x: 300, name: t("families.fig_table.m3") },
    { x: 420, name: t("families.fig_table.m4") },
  ];
  return (
    <Fig id="fig_table" h={264} label={t("families.fig_table.label")}
      title={t("families.fig_table.a11y_title")} desc={t("families.fig_table.a11y_desc")}>
      <defs>
        <g id="fam-share">
          <circle r="18" fill={PAPER} stroke={INK} strokeWidth="2" />
          <circle r="11" fill={WASH} />
        </g>
      </defs>

      {/* Le champ d'une ligne — la seule chose que le foyer écrit pour la
          semaine. Ce n'est pas une maquette: la chaîne n'est citée d'aucun
          écran (S10), c'est une phrase d'exemple. */}
      <rect x="24" y="44" width="432" height="48" rx="12" fill={PAPER} stroke={SOFT} strokeWidth="1" />
      <text x="40" y="64" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_table.field")}</text>
      <text x="40" y="84" fontSize="13" fill={INK}>{t("families.fig_table.line")}</text>

      <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
        <path d="M 240 92 L 240 118" />
        <path d="M 240 176 L 240 194" />
        <path d="M 60 194 L 420 194" />
        {mouths.map((m) => <path key={m.x} d={`M ${m.x} 194 L ${m.x} 206`} />)}
      </g>

      {/* LA CASSEROLE — une seule, et c'est tout l'argument de la bande. */}
      <g stroke={FIG} strokeWidth="2" strokeLinejoin="round" fill={PAPER}>
        <rect x="196" y="141" width="26" height="14" rx="7" />
        <rect x="258" y="141" width="26" height="14" rx="7" />
        <circle cx="240" cy="148" r="28" />
      </g>
      <circle cx="240" cy="148" r="20" fill={WASH} />
      <text x="296" y="152" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_table.pot")}</text>

      {mouths.map((m) => <use key={m.x} href="#fam-share" x={m.x} y="224" />)}
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        {mouths.map((m) => <text key={m.x} x={m.x} y="256" textAnchor="middle">{m.name}</text>)}
      </g>
    </Fig>
  );
}

/* ═══ BANDE 2 — LA CHARGE EST TOUJOURS SUR LA MÊME PERSONNE ══════════════════
   LE SEUL BLOC SOMBRE DE LA PAGE, et il est dépensé ici. Ce que porte un bloc
   sombre sur une page foyer, c'est « ce qu'on refuse de faire » — et c'est la
   seule bande où le refus est un argument de vente plutôt qu'une excuse.

   L'allergie arrive ICI, et en TROISIÈME phrase: la promesse est « vous ne
   l'écrivez qu'une fois », et le fait qu'une seule bouche gouverne alors toute
   la casserole en est la CONSÉQUENCE. Ouvrir dessus vendrait par la peur à la
   minorité des foyers qui en ont une. */
function Load() {
  return (
    <Section tone="dark">
      <Kicker onDark>{t("families.load.kicker")}</Kicker>
      {/* fact: C8 — FF-044 · 20260810260000_household_billable_profiles.sql:179-190 (user_id = null) */}
      <SectionTitle>{t("families.load.title")}</SectionTitle>
      <div className="mt-9 grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <UnionFigure />
        <div>
          {/* fact: C14 — onboarding.ts:97-103 et :211-290 (prénom, date de naissance, objectif, allergies)
              fact: C8 — household_portions.ts:63-72 (la clé est `memberId`, pas un compte) */}
          <p className="max-w-[62ch]">{t("families.load.body")}</p>
          {/* fact: C9 — generate-household-meal-v1:1643-1648,1674-1680 (503
              safety_constraints_unreadable) · union household_safety.ts:201 */}
          <p className="mt-6 max-w-[62ch] border-l-2 border-fig-300 pl-4 font-display text-sub">
            {t("families.load.consequence")}
          </p>
          {/* LA RÉSERVE — l'ancienne section « ce qu'on ne promet pas » ne meurt
              pas, elle se replie là où elle mord.
              fact: C9 trou nommé — run.ts:2211 (`plan_question` recharge sans
              l'union foyer), FF-046 §7 n°8.
              non-claim délibéré: aucune promesse médicale, la lecture d'étiquette
              reste au foyer. */}
          <p className="mt-6 max-w-[62ch] text-fig-300">{t("families.load.reserve")}</p>
        </div>
      </div>
    </Section>
  );
}

/* Écrit une fois, puis l'union, puis les deux sorties. ⚠️ MONOCHROME: sur `fig-950`,
   `.on-dark` remonte `--ill-fig` et `--ill-ink-soft` à `fig-300` mais laisse
   `--ill-ink` à l'encre, invisible. Rien ici n'utilise l'encre ni un aplat
   clair; la hiérarchie se fait à la taille et à l'épaisseur. */
function UnionFigure() {
  // ⚠️ Les rangées s'arrêtent à y=174 et la fourche part à y=190: mesuré au
  // navigateur, une fourche posée plus haut TRAVERSE la dernière rangée.
  const rows: Array<{ y: number; name: string; avoid: string }> = [
    { y: 50, name: t("families.fig_union.m1"), avoid: t("families.fig_union.none") },
    { y: 82, name: t("families.fig_union.m2"), avoid: t("families.fig_union.peanut") },
    { y: 114, name: t("families.fig_union.m3"), avoid: t("families.fig_union.none") },
    { y: 146, name: t("families.fig_union.m4"), avoid: t("families.fig_union.none") },
  ];
  const week = [40, 66, 92, 118, 144, 170, 196];
  return (
    <Fig id="fig_union" h={300} label={t("families.fig_union.label")}
      title={t("families.fig_union.a11y_title")} desc={t("families.fig_union.a11y_desc")}>
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="44" y="44">{t("families.fig_union.col_mouth")}</text>
        <text x="200" y="44">{t("families.fig_union.col_avoid")}</text>
      </g>
      <g fill="none" stroke={SOFT} strokeWidth="1">
        {rows.map((r) => <rect key={r.y} x="24" y={r.y} width="276" height="28" rx="8" />)}
      </g>
      <g fontSize="11" fill={SOFT}>
        {rows.map((r) => <text key={r.y} x="44" y={r.y + 19}>{r.name}</text>)}
        {rows.map((r) => <text key={r.y} x="200" y={r.y + 19}>{r.avoid}</text>)}
      </g>

      {/* Quatre lignes, un seul trait: l'union est DESSINÉE, pas écrite. */}
      <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
        {rows.map((r) => <path key={r.y} d={`M 300 ${r.y + 14} L 316 ${r.y + 14}`} />)}
        <path d="M 316 64 L 316 160" />
        <path d="M 316 112 L 340 112" />
        <path d="M 390 132 L 390 190" />
        <path d="M 130 190 L 390 190" />
        <path d="M 130 190 L 130 202" />
        <path d="M 354 190 L 354 202" />
      </g>
      <rect x="340" y="92" width="100" height="40" rx="10" fill="none" stroke={FIG} strokeWidth="2" />
      <text x="390" y="116" textAnchor="middle" fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>{t("families.fig_union.set")}</text>

      {/* Les deux sorties. Celle de gauche CONTIENT une semaine — sept traits;
          celle de droite ne contient que la raison du refus. C'est la structure
          qui porte « rien n'est composé », pas une couleur (aucune couleur
          d'état sur ce site). */}
      <g fill="none" stroke={SOFT} strokeWidth="1">
        <rect x="24" y="202" width="212" height="88" rx="12" />
        <rect x="250" y="202" width="208" height="88" rx="12" />
        {week.map((x) => <path key={x} d={`M ${x} 262 L ${x} 276`} />)}
      </g>
      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="40" y="224">{t("families.fig_union.ok_label")}</text>
        <text x="266" y="224">{t("families.fig_union.no_label")}</text>
      </g>
      <g fontSize="11" fill={SOFT}>
        <text x="40" y="246">{t("families.fig_union.ok_value")}</text>
        <text x="266" y="246">{t("families.fig_union.no_value")}</text>
      </g>
      <text x="266" y="268" fontSize="9" fill={SOFT}>{t("families.fig_union.code")}</text>
    </Fig>
  );
}

/* ═══ BANDE 3 — « JE NE VAIS PAS METTRE MES ENFANTS AU RÉGIME » ══════════════
   Ceinture STRUCTURELLE, pas un réglage: le refus tombe à la génération, pas
   au filtrage de l'affichage. Aucun vocabulaire de régime autour d'un enfant
   ici — ni poids, ni chiffre, ni corps. */
function Age() {
  return (
    <Section>
      <div className="grid items-center gap-11 lg:grid-cols-2 lg:gap-16">
        <AgeFigure />
        <div>
          <Kicker>{t("families.age.kicker")}</Kicker>
          {/* fact: C10 — household.ts:115-121 `goalApplies` */}
          <SectionTitle>{t("families.age.title")}</SectionTitle>
          {/* fact: C10 — student_age.ts:199-202 `weekPlanAgeGate` ·
              generate-week-plan-v1:435-457 (409 `minor_student`) */}
          <p className="mt-5 max-w-[62ch]">{t("families.age.body")}</p>
          {/* LA RÉSERVE de cette bande.
              fact: C16 / silence S6 — household_member_bodies, 20260812220000:118
              (une ligne écrasée, ni date ni série; aucune courbe nulle part).
              fact: C15 — energy_display_enabled default false (20260812230000:60)
              · energy_gate.ts:228-249, dont le verrou « mineur » (:239).
              ⛔ Jamais « jamais de calories » (§8 n°2): le produit en affiche. */}
          <p className="mt-6 max-w-[62ch] text-ink-soft">{t("families.age.reserve")}</p>
        </div>
      </div>
    </Section>
  );
}

/* L'objectif atteint l'adulte, et s'ARRÊTE devant le mineur. La barre est la
   pièce chaude: c'est le seul objet de la figure qui soit une garde.
   ⚠️ Les deux assiettes sont le MÊME élément, appelé deux fois par `<use>`. En
   dessiner une plus petite pour l'enfant affirmerait une mesure qui n'atteint
   aucun écran — ici, ça ressemblerait à un régime d'enfant. Ce que le produit
   dit d'un mineur est un mot, `CHILD_DIRECTION` (household_portions.ts:166),
   pas un ratio. */
function AgeFigure() {
  return (
    <Fig id="fig_age" label={t("families.fig_age.label")}
      title={t("families.fig_age.a11y_title")} desc={t("families.fig_age.a11y_desc")}>
      <defs>
        <g id="fam-plate">
          <circle r="24" fill={PAPER} stroke={INK} strokeWidth="2" />
          <circle r="15" fill={WASH} />
        </g>
      </defs>

      <rect x="24" y="100" width="132" height="44" rx="12" fill={PAPER} stroke={INK} strokeWidth="2" />
      <text x="40" y="128" fontSize="11" fill={INK}>{t("families.fig_age.goal")}</text>

      {/* Deux branches à 45° — angles fermés. Celle du bas n'atteint pas
          l'assiette: elle s'interrompt, et l'écart est la démonstration. */}
      <g fill="none" stroke={SOFT} strokeWidth="1" strokeLinecap="round">
        <path d="M 156 122 L 176 122" />
        <path d="M 176 122 L 218 80 L 248 80" />
        <path d="M 176 122 L 218 164 L 224 164" />
      </g>
      {/* LA BARRE. Plus haute que l'assiette qu'elle protège (48 unités contre
          68): un trait de la taille de l'objet se lit comme un bord, un trait
          plus grand se lit comme un arrêt. */}
      <path d="M 232 142 L 232 210" fill="none" stroke={FIG} strokeWidth="2" strokeLinecap="round" />

      <use href="#fam-plate" x="272" y="80" />
      <use href="#fam-plate" x="272" y="176" />

      <g fontSize="9" fontWeight="600" letterSpacing="1" fill={SOFT}>
        <text x="308" y="68">{t("families.fig_age.adult_label")}</text>
        <text x="308" y="164">{t("families.fig_age.minor_label")}</text>
      </g>
      <g fontSize="11" fill={INK}>
        <text x="308" y="88">{t("families.fig_age.adult_value")}</text>
        <text x="308" y="184">{t("families.fig_age.minor_value")}</text>
      </g>
      <g fontSize="9" fill={SOFT}>
        <text x="308" y="202">{t("families.fig_age.minor_note")}</text>
        <text x="308" y="218">{t("families.fig_age.code")}</text>
      </g>
    </Fig>
  );
}

/* ═══ BANDE 4 — LE PRIX, ET LA SORTIE ════════════════════════════════════════
   Le prix se DIT; ni durée d'essai ni bouton d'achat (§8 n°1). La sortie est
   `/start`, dont la branche `family` attend cette page (C13, onboarding.ts:88)
   — et rien ne promet une entrée immédiate: `/start` interroge d'abord
   `keel_free_signup_available` (§10). */
function Price() {
  return (
    <Section tone="paper-2">
      <div className="grid gap-11 lg:grid-cols-2 lg:gap-16">
        <div>
          <Kicker>{t("families.price.kicker")}</Kicker>
          {/* fact: C1 — 20260810260000_household_billable_profiles.sql:235-250 · :101-105 (plafond 8) */}
          <SectionTitle>{t("families.price.title")}</SectionTitle>
          {/* fact: C1 / FF-048 — le profil réclamé est le seul supplément */}
          <p className="mt-5 max-w-[62ch]">{t("families.price.body")}</p>
          {/* LA RÉSERVE de cette bande.
              fact: C17 — aucune app native dans le dépôt (ni capacitor.config,
              ni app.json, ni android/). ⛔ Aucun « rien à installer » pour
              compenser: le silence S4 interdit d'en faire un argument. */}
          <p className="mt-6 max-w-[62ch] text-ink-soft">{t("families.price.reserve")}</p>
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
   facture pas. */
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
        {/* ⚠️ x=440 ET PAS 458. `.fig-scroll` DÉFILE (`overflow-x: auto`), donc rien
            n'est perdu — mais à 375 px le SVG est rendu à son plancher de 380 et
            458/480 tombait à 383 px, 8 px hors de l'écran: il fallait DÉFILER pour
            lire « jusqu'à 8 bouches », qui est un argument de vente. Mesuré. */}
        <text x="440" y="152" textAnchor="end">{t("families.fig_price.cap")}</text>
      </g>
      <path d="M 22 170 L 458 170" fill="none" stroke={SOFT} strokeWidth="1" />
      <text x="22" y="198" fontSize="13" fill={INK}>{formatPrice(PRICES.household)}</text>
      <text x="22" y="222" fontSize="11" fill={SOFT}>{t("families.fig_price.note")}</text>
    </Fig>
  );
}

export default FamiliesPage;
