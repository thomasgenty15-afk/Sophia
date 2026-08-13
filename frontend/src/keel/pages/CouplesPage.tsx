import React, { useState } from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { en } from "../i18n/en";
import { t } from "../i18n/t";

/**
 * `/couples` — LE COUPLE À OBJECTIFS DIVERGENTS. Namespace `couples`.
 * Registre: VOUS (`fr.ts`, en-tête « le registre, et là où il bascule »).
 *
 * ── POURQUOI C'EST LA PAGE QUI DOIT ÊTRE LA MEILLEURE ──────────────────────
 * Tout le voisinage met à l'échelle une QUANTITÉ pour N personnes. Aucun ne
 * réconcilie deux CIBLES opposées sortant de la même casserole — Eat This Much
 * le dit dans son aide (« This won't automatically handle multiple people's
 * different nutrition targets »). C'est le seul endroit du marché où ce
 * produit est seul.
 *
 * ── QUATRE BANDES, UNE PAR DOULEUR, DANS L'ORDRE QUI VEND ──────────────────
 * Refonte « par la douleur » du 2026-08-13 (`scratchpad/site/GRILLE-DOULEURS.md`,
 * section « À deux »). Une section = une ligne de la grille, et il n'y a pas de
 * cinquième bande.
 *
 *   1. `Hero` — « Deux objectifs = deux casseroles = abandon. » Le plat est le
 *      même; ce qui change est l'instruction de service. La DÉMONSTRATION porte
 *      l'argument à la place du paragraphe.
 *   2. `Bodies` — « Il mange deux fois plus que moi. » Même objectif, pas le
 *      même corps. C'est ici que se dépense LE BLOC SOMBRE (un seul par page),
 *      parce que c'est la seule bande où le produit dit ce qu'il sait d'un
 *      corps — et où il doit dire dans la foulée ce qu'il n'en fera jamais.
 *   3. `OtherProfile` — « Un seul des deux planifie. » Le profil réclamé donne
 *      à l'autre son accès et son objectif: la charge se partage.
 *   4. `Price` — le prix et la clôture, un seul CTA, le même qu'en haut.
 *
 * ── DEUX SECTIONS SONT MORTES À CETTE REFONTE, ET C'EST VOLONTAIRE ─────────
 *  · `WeekHolds` (« la semaine encaisse sans être refaite », C7). C'est la
 *    douleur 03 de `/meal-prep`, pas celle d'un couple. La garder faisait de
 *    `/couples` une seconde page solo. Sa figure (`FigChat`, les quatre
 *    `REALIGNMENT_ACTIONS`) part avec elle.
 *  · `NotThis` comme BANDE. Son honnêteté ne meurt pas: elle se replie en
 *    RÉSERVES dans les sections concernées — le « rien ne vérifie » sous la
 *    démonstration, l'absence de courbe sous la bande du corps.
 *  · La bande de trois faits sous le hero. « Six objectifs, six directions » et
 *    « une phrase, pas un chiffre » étaient RACONTÉS; la démonstration les
 *    MONTRE. Un fait montré et redit est un fait qu'on n'a pas cru montrer.
 *
 * ── CE QUE CETTE PAGE N'A PAS LE DROIT D'ÉCRIRE ────────────────────────────
 *  · UN GRAMME. La bifurcation est réelle en code (`SERVING_DIRECTION` sur 6
 *    objectifs, tronc commun = MIN, deltas calculés) mais ce qui atteint
 *    l'écran est une PHRASE, sur `/app/household` seulement: `member_deltas`
 *    n'a AUCUN écran (FF-043 §11 n°1). « 180 g pour l'un » montrerait un écran
 *    qu'on n'a pas.
 *  · « GARANTI ». `reconcilePortions` accepte quatre consignes identiques sans
 *    lever d'`issue`: rien ne vérifie que le modèle a différencié.
 *  · UNE COURBE, UNE TENDANCE, UN SUIVI DE POIDS (C16). `household_member_bodies`
 *    est UNE ligne écrasée, ni date ni série.
 *  · UNE DURÉE D'ESSAI OU UN BOUTON D'ACHAT (AUDIT §8 n°1). Le prix se dit, la
 *    date et le geste d'achat non.
 *  · « ÉCHANGER UN PLAT »: `REALIGNMENT_ACTIONS` n'a pas de « remplacer ».
 *  · « RIEN À OUVRIR / RIEN À INSTALLER » sous quelque forme que ce soit (S4),
 *    ni aucune application mobile (C17).
 *  · « JAMAIS DE CALORIES »: faux depuis FF-059 (AUDIT §8 n°2).
 *  · UN RÔLE DE GENRE FIGÉ. La copie n'emploie aucun pronom personnel pour
 *    désigner le partenaire, et la démonstration étiquette ses deux colonnes
 *    « l'un de vous » / « l'autre », jamais par une personne.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────
 * Charte « la fiche » (`docs/keel/CHARTE-VITRINE.md`). Aucune photographie: on
 * ne montre pas une assiette qu'on n'a pas cuisinée. Et aucune maquette
 * d'écran, ni ici ni dans la démonstration — `/app/household` rend ses libellés
 * en ANGLAIS même à un visiteur français (`household` n'est pas dans
 * `TRANSLATED_NAMESPACES`): une maquette honnête y poserait une chaîne anglaise
 * au milieu d'une page de vente française, et une maquette traduite serait un
 * écran qui n'existe pas. La démonstration est donc une FICHE, jamais une
 * capture (S10, AUDIT §8 n°12).
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

// ---------------------------------------------------------------------------
// LA DÉMONSTRATION — LA GRAMMAIRE DE SERVICE, LUE ET JAMAIS RECOPIÉE
// ---------------------------------------------------------------------------
//
// ⚠️ CE BLOC EST UN PORTAGE DE LECTEUR, PAS UNE SECONDE TABLE DE RÉSULTATS, ET
// LA DISTINCTION EST TOUT. `_shared/keel/household_portions.ts` écrit en toutes
// lettres pourquoi son propre tableau d'axes est LU dans les six chaînes plutôt
// qu'écrit à côté d'elles: `health` a rendu EXACTEMENT la chaîne de
// `maintenance` pendant des semaines sans que rien n'échoue. Une table
// `{ fat_loss: { protein: "full", … } }` recopiée ici raconterait ce que les
// chaînes disaient LE JOUR OÙ ON L'A ÉCRITE.
//
// Ce qui est porté est la GRAMMAIRE (sept qualificatifs, quatre noms d'axes, le
// raccourci `component`) — dix mots fermés que le module écrit lui-même. Ce qui
// n'est PAS porté, et ne le sera jamais, c'est le résultat de son application.
//
// ⚠️ ET C'EST L'ANGLAIS QU'ON LIT, TOUJOURS. La grammaire est anglaise; donner
// à ce lecteur la traduction française rendrait `unreadable` sur les trois axes
// — et un écran de vente vide en français que personne ne verrait en anglais.
// D'où l'import du seed `en` plutôt qu'un appel à `t()` (voir `EN_DIRECTION`).

const SERVING_AXES = ["protein", "starch", "vegetables"] as const;
type ServingAxis = (typeof SERVING_AXES)[number];

/** L'échelle, du moins au plus. L'ordre EST le sens dans le module. */
type ServingDemand = "smaller" | "moderate" | "balanced" | "full" | "larger";

/**
 * `null` = l'axe n'est pas nommé par la direction, donc elle n'en demande RIEN.
 * `"unreadable"` = l'axe est nommé mais aucun qualificatif ne le gouverne.
 */
type AxisDemand = ServingDemand | "unreadable" | null;

const QUALIFIERS: Record<string, ServingDemand> = {
  generous: "larger",
  larger: "larger",
  full: "full",
  moderate: "moderate",
  balanced: "balanced",
  // « same vegetables » = la part de tout le monde, donc l'équilibre.
  same: "balanced",
  smaller: "smaller",
};

const AXIS_WORDS: Record<string, ServingAxis> = {
  protein: "protein",
  starch: "starch",
  vegetable: "vegetables",
  vegetables: "vegetables",
};

/** `share of every component` — le raccourci qui gouverne les trois axes. */
const EVERY_COMPONENT = "component";

/**
 * Un qualificatif gouverne les noms d'axes qui le SUIVENT, jusqu'au prochain
 * qualificatif. Un axe nommé sans qualificatif devant lui rend `"unreadable"`:
 * on ne devine pas. C'est mot pour mot `readServingDemands` du module.
 */
function readServingDemands(direction: string): Record<ServingAxis, AxisDemand> {
  const out: Record<ServingAxis, AxisDemand> = {
    protein: null,
    starch: null,
    vegetables: null,
  };
  let current: ServingDemand | null = null;
  for (const word of direction.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
    const qualifier = QUALIFIERS[word];
    if (qualifier) {
      current = qualifier;
      continue;
    }
    if (word === EVERY_COMPONENT) {
      for (const axis of SERVING_AXES) out[axis] = current ?? "unreadable";
      continue;
    }
    const axis = AXIS_WORDS[word];
    if (axis) out[axis] = current ?? "unreadable";
  }
  return out;
}

/** Les six valeurs de `MEMBER_GOALS`, dans l'ordre du CHECK de la base. */
const GOAL_IDS = [
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "performance",
  "health",
  "maintenance",
] as const;
type GoalId = (typeof GOAL_IDS)[number];

/**
 * LES SIX CHAÎNES ANGLAISES, PRISES DANS LE SEED — jamais retapées ici.
 *
 * `couples.dir.*` porte les valeurs de `SERVING_DIRECTION` mot pour mot, et
 * `i18n/servingDirections.int.test.ts` les épingle contre le module Deno. Lire
 * `en[...]` plutôt que `t(...)` est ce qui garantit que le lecteur ci-dessus
 * voit toujours l'anglais, y compris sur une page rendue en français.
 *
 * Les six clés sont écrites en toutes lettres: une clé construite par gabarit
 * compile et ne prouve plus rien.
 */
const EN_DIRECTION: Record<GoalId, string> = {
  fat_loss: en["couples.dir.fat_loss"],
  muscle_gain: en["couples.dir.muscle_gain"],
  recomposition: en["couples.dir.recomposition"],
  performance: en["couples.dir.performance"],
  health: en["couples.dir.health"],
  maintenance: en["couples.dir.maintenance"],
};

// Les trois tables de libellés sont des `switch` et non des `Record` construits
// au module: `t()` doit être appelé PENDANT le rendu pour qu'un changement de
// langue se voie, et chaque clé doit rester écrite en toutes lettres.
function goalLabel(id: GoalId): string {
  switch (id) {
    case "fat_loss": return t("couples.goal.fat_loss");
    case "muscle_gain": return t("couples.goal.muscle_gain");
    case "recomposition": return t("couples.goal.recomposition");
    case "performance": return t("couples.goal.performance");
    case "health": return t("couples.goal.health");
    case "maintenance": return t("couples.goal.maintenance");
  }
}

function directionLabel(id: GoalId): string {
  switch (id) {
    case "fat_loss": return t("couples.dir.fat_loss");
    case "muscle_gain": return t("couples.dir.muscle_gain");
    case "recomposition": return t("couples.dir.recomposition");
    case "performance": return t("couples.dir.performance");
    case "health": return t("couples.dir.health");
    case "maintenance": return t("couples.dir.maintenance");
  }
}

function axisLabel(axis: ServingAxis): string {
  switch (axis) {
    case "protein": return t("couples.axis.protein");
    case "starch": return t("couples.axis.starch");
    case "vegetables": return t("couples.axis.vegetables");
  }
}

/**
 * ⚠️ `unreadable` est INATTEIGNABLE avec les six chaînes d'aujourd'hui, et il
 * a quand même son mot. C'est le contrat du module: le jour où une direction
 * sort du vocabulaire fermé, la lecture rend `unreadable` plutôt qu'une valeur
 * devinée — et une branche muette afficherait alors « rien de demandé », qui
 * est un fait FAUX plutôt qu'un aveu.
 */
function demandLabel(demand: AxisDemand): string {
  if (demand === null) return t("couples.demand.none");
  switch (demand) {
    case "smaller": return t("couples.demand.smaller");
    case "moderate": return t("couples.demand.moderate");
    case "balanced": return t("couples.demand.balanced");
    case "full": return t("couples.demand.full");
    case "larger": return t("couples.demand.larger");
    case "unreadable": return t("couples.demand.unreadable");
  }
}

/**
 * LA CASSEROLE, vue de dessus. La seule pièce chaude de la démonstration.
 *
 * Elle n'est PAS dans un `.fig-scroll`: elle ne porte aucun texte, donc le
 * plancher de 380px n'a rien à protéger, et l'imposer ferait défiler une fiche
 * qui tient à 320px. Son nom accessible est la légende qui la suit — l'équerre
 * de la fiche est portée par le `Kicker`, en HTML.
 */
function PotMark() {
  return (
    <svg
      viewBox="0 0 200 94"
      role="img"
      aria-labelledby="cpl-pot-caption"
      className="h-auto w-full max-w-[172px]"
    >
      <g
        fill="var(--ill-paper, #FBF8FA)"
        stroke="var(--ill-fig, #632C4C)"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <rect x="18" y="39" width="26" height="16" rx="8" />
        <rect x="156" y="39" width="26" height="16" rx="8" />
        <circle cx="100" cy="47" r="40" />
      </g>
      <circle cx="100" cy="47" r="30" fill="var(--ill-wash, #EFE0E9)" />
    </svg>
  );
}

/**
 * UNE COLONNE = UNE PERSONNE. Objectif choisi, direction de service rendue,
 * et ce que cette direction demande axe par axe.
 *
 * ── LES SIX CHOIX SONT DE VRAIS `<input type="radio">` ────────────────────
 * Pas un `role="radiogroup"` à la main: les flèches du clavier, l'annonce de
 * l'état coché et l'unicité du choix sont alors du navigateur, pas de nous. Le
 * champ est `sr-only` et la puce visible est son `<label>`, ce qui laisse
 * l'anneau de focus au `peer-focus-visible` — `tokens.css` ne cible que
 * `a, button, [tabindex]`, donc un `<input>` n'en hérite pas.
 *
 * ⚠️ LA PUCE COCHÉE EST FIGUE, ET CE N'EST PAS UNE PASTILLE D'ÉTAT. La charte
 * interdit la figue dans une pastille parce que la pastille appartient aux
 * états de l'app. Ceci est un CONTRÔLE: `rx 4` (la petite pièce, celle des
 * gestes) et non le rond des pastilles, et exactement la teinte du bouton
 * plein juste à côté.
 */
function PersonColumn({
  name,
  legend,
  goal,
  onPick,
}: {
  name: string;
  legend: string;
  goal: GoalId;
  onPick: (goal: GoalId) => void;
}) {
  const demands = readServingDemands(EN_DIRECTION[goal]);
  return (
    <div className="flex min-w-0 flex-col rounded border border-line bg-paper p-4">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="eq p-0 text-label font-semibold uppercase text-ink-soft">
          {legend}
        </legend>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {GOAL_IDS.map((id) => (
            <label key={id} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={id}
                checked={goal === id}
                onChange={() => onPick(id)}
                className="peer sr-only"
              />
              {/* `py-2` et pas moins: la puce fait alors ~31px de haut, au-dessus
                  du minimum de 24×24 de WCAG 2.2 pour une cible de pointage. */}
              <span className="inline-block rounded border border-line-strong px-2.5 py-2 text-[13px] leading-none text-ink transition-colors hover:border-fig-600 peer-checked:border-fig-700 peer-checked:bg-fig-700 peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-fig-600">
                {goalLabel(id)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* L'état courant est ANNONCÉ, pas seulement coloré: la radio dit ce
          qu'elle coche, et cette région dit ce que ça change.

          ⚠️ `grow` + `mt-auto` SUR LA LISTE D'AXES, ET C'EST UNE CORRECTION
          MESURÉE. Les deux consignes ne font pas le même nombre de lignes (une
          en français, quatre pour `performance`), donc les deux tableaux
          d'axes démarraient à 30px l'un de l'autre — or c'est LIGNE PAR LIGNE
          qu'on les compare, et c'est tout l'objet de la fiche. Les deux
          cartes étant déjà de même hauteur (`stretch` de la grille), coller
          les tableaux EN BAS les aligne quel que soit le couple d'objectifs
          choisi. Un `min-height` calculé sur le pire cas laissait, lui, un
          trou de trois lignes sous « part équilibrée de chaque composant ». */}
      {/* `role="status"` EN PLUS de `aria-live`: la région n'est pas seulement
          « vivante », elle EST le résultat du geste. Les trois démonstrations du
          site s'annoncent de la même façon — voir `CoachesPage.tsx:384`. */}
      <div className="mt-4 flex grow flex-col border-t border-line pt-4" role="status" aria-live="polite">
        <p className="text-label font-semibold uppercase text-ink-soft">
          {t("couples.demo.direction_label")}
        </p>
        {/* fact: C4 — `SERVING_DIRECTION`, household_portions.ts:125-151. Six
            chaînes DISTINCTES; `health` a cessé de rendre celle de
            `maintenance` le 2026-08-11. */}
        <p className="mt-2 text-[15px] leading-relaxed text-ink">{directionLabel(goal)}</p>
        {/* fact: C4 — `readServingDemands`, household_portions.ts:264-283. Les
            axes sont LUS dans la chaîne ci-dessus, jamais recopiés. */}
        <dl className="mt-auto pt-3">
          {SERVING_AXES.map((axis) => (
            <div
              key={axis}
              className="flex items-baseline justify-between gap-3 border-t border-line py-1.5"
            >
              <dt className="text-[13px] text-ink-soft">{axisLabel(axis)}</dt>
              <dd className="m-0 text-[13px] font-medium text-ink">
                {demandLabel(demands[axis])}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/**
 * LA FICHE DES DEUX PARTS — la démonstration de la page.
 *
 * ── ELLE EST DÉJÀ JUSTE SANS UN GESTE ─────────────────────────────────────
 * Deux objectifs par défaut, deux directions rendues, six axes lisibles: un
 * lecteur qui ne touche à rien voit déjà l'argument entier. L'interaction ne
 * révèle rien, elle laisse vérifier.
 *
 * Les deux défauts sont `muscle_gain` et `fat_loss` parce que ce sont les deux
 * directions qui divergent le plus (protéine et féculent en sens contraire): le
 * premier coup d'œil doit tomber sur la démonstration, pas sur deux colonnes
 * qui se ressemblent.
 *
 * ⚠️ CE N'EST PAS UNE CAPTURE D'ÉCRAN. Ni barre d'app, ni cadre d'appareil, ni
 * bouton du produit: la consigne de service que le foyer lit sur
 * `/app/household` est RÉDIGÉE par le modèle à partir de la direction montrée
 * ici, dans la langue de l'élève. Montrer la direction pour la consigne serait
 * montrer un écran qu'on n'a pas — d'où le libellé, qui dit « envoyée en
 * cuisine », et la légende, qui dit ce que l'écran rend à la place.
 */
function ServingDemo() {
  const [left, setLeft] = useState<GoalId>("muscle_gain");
  const [right, setRight] = useState<GoalId>("fat_loss");
  return (
    <section
      aria-label={t("couples.demo.eyebrow")}
      className="min-w-0 rounded-lg border border-line bg-paper-2 p-4 sm:p-5"
    >
      <Kicker>{t("couples.demo.eyebrow")}</Kicker>

      <div className="mt-5 flex flex-col items-center">
        <PotMark />
        {/* fact: C4 — `COOKING_SHAPE_LINES.one_dish`, household_portions.ts:339
            « Cook ONE set of preparations for everyone. » */}
        <p id="cpl-pot-caption" className="mt-2 text-[13px] text-ink-soft">
          {t("couples.demo.pot")}
        </p>
      </div>

      <p className="mt-5 text-[13px] text-ink-soft">{t("couples.demo.hint")}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PersonColumn
          name="cpl-goal-left"
          legend={t("couples.demo.person_a")}
          goal={left}
          onPick={setLeft}
        />
        <PersonColumn
          name="cpl-goal-right"
          legend={t("couples.demo.person_b")}
          goal={right}
          onPick={setRight}
        />
      </div>
    </section>
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
 * FIGURE — qui est dans le plan. Une FICHE vue de face, pas un écran.
 * Le filet vertical de 2 marque la colonne du profil réclamé: c'est l'idiome
 * `border-l-2` de l'app à l'échelle d'une figure, et c'est sa seule pièce
 * chaude avec l'équerre qui la nomme.
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

/** BANDE 1 — « Deux objectifs = deux casseroles = abandon. » */
function Hero() {
  return (
    <section className={`${WRAP} ${SECTION}`}>
      <div className="grid grid-cols-1 items-start gap-11 lg:grid-cols-[0.92fr_1fr] lg:gap-14">
        <div className="min-w-0">
          <Kicker>{t("couples.hero.kicker")}</Kicker>
          <h1 className="mt-4 max-w-[15ch] text-balance font-display text-hero text-ink">
            {t("couples.hero.title")}
          </h1>
          {/* fact: C4 — household_portions.ts:125-151 `SERVING_DIRECTION` +
              :339 `one_dish` (« Do NOT propose separate dishes »). Le plat est
              le même; ce qui change est l'instruction de service. */}
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

        {/* La légende et la réserve sont DANS la colonne de la démonstration,
            jamais sous l'autre: posées après la grille, elles tombaient à 600px
            de ce qu'elles annotent et se lisaient comme du corps de texte.
            Mesuré à 1280px sur la version précédente de cette page. */}
        <div className="min-w-0">
          <ServingDemo />
          <p className="mt-4 max-w-[54ch] text-[13px] leading-normal text-ink-soft">
            {t("couples.demo.caption")}
          </p>
          {/* RÉSERVE — l'honnêteté de l'ancien bloc « ce qu'on ne fait pas »,
              repliée dans la section qu'elle concerne.
              fact: `reconcilePortions` (household_portions.ts:877-930) accepte
              N consignes identiques sans lever une seule `issue`: rien ne
              vérifie que le modèle a différencié. Donc jamais « garanti ». */}
          <p className="mt-2 max-w-[54ch] text-[13px] leading-normal text-ink-soft">
            {t("couples.demo.reserve")}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * BANDE 2 — « Il mange deux fois plus que moi. »
 *
 * LE BLOC SOMBRE, ET IL SE DÉPENSE ICI. Un seul par page, et c'est la seule
 * bande où le produit annonce qu'il connaît un corps. Le même bloc doit donc
 * porter, sans changer de fond ni de ton, ce qu'il n'en fera jamais — la
 * réserve n'est pas une note de bas de page, c'est la moitié de l'argument.
 *
 * Pas de figure: `.on-dark` ne remonte que `--ill-fig` et `--ill-ink-soft`
 * (tokens.css:199-202). `--ill-ink`, qui porte le contour de 2 d'une chose
 * réelle, y resterait à `#23191F` — invisible. Une figure sur ce fond est donc
 * une figure amputée de son trait principal, et la fiche ci-dessous est en
 * HTML pour cette raison-là, pas par commodité.
 */
function Bodies() {
  return (
    <section className="on-dark bg-fig-950 py-13 sm:py-19">
      <div className={WRAP}>
        <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div className="min-w-0">
            <Kicker onDark>{t("couples.bodies.kicker")}</Kicker>
            {/* `text-title` et non un `clamp()` maison: l'échelle a cinq crans
                et un agent en CHOISIT un. L'interligne est le seul écart —
                1,06 est fait pour un titre de deux lignes, pas pour trois. */}
            <h2 className="mt-4 max-w-[22ch] font-display text-title leading-[1.16] text-paper">
              {t("couples.bodies.title")}
            </h2>
            {/* fact: C4 — `household_member_bodies` (20260812220000:118, taille
                + poids + sexe) et l'âge dérivé de la date de naissance
                (`keel_household_bodies_for`, :420-455) entrent par
                `generate-household-meal-v1/index.ts:1234-1273` dans
                `PortionMember.body`, où ils DIMENSIONNENT la part:
                `maintenanceEnvelopeFromBody` (meal_envelope.ts:448-461) lit
                poids, taille, bande d'âge et sexe.
                fact: le brief le borne lui-même — BODY_FACTS_CAVEAT
                (household_portions.ts:529-538): « there for ONE thing: the
                SIZE of a portion […] no daily energy need, no calorie figure,
                no BMI, no category, no target. » */}
            <p className="mt-5 max-w-[46ch] text-lede text-fig-300">{t("couples.bodies.lede")}</p>
          </div>

          {/* LA FICHE — ce qui entre, ce qui sort. Elle dit d'un coup d'œil que
              quatre champs produisent UNE PHRASE, et c'est exactement la
              frontière que le produit tient.
              ⚠️ Les filets sont en `fig-600` et non en `fig-300`: sur ce fond,
              `fig-300` est à 8:1 — un séparateur qui crie plus fort que le
              texte qu'il sépare. C'est le jumeau sombre de `line`, décoratif,
              et il ne borde jamais un contrôle. */}
          <div className="min-w-0 rounded border border-fig-600 p-4 sm:p-5">
            <p className="text-label font-semibold uppercase text-fig-300">
              {t("couples.bodies.in_label")}
            </p>
            <ul className="mt-3 list-none space-y-0 p-0">
              <li className="border-t border-fig-600 py-2 text-[15px] text-paper">{t("couples.bodies.in_1")}</li>
              <li className="border-t border-fig-600 py-2 text-[15px] text-paper">{t("couples.bodies.in_2")}</li>
              <li className="border-t border-fig-600 py-2 text-[15px] text-paper">{t("couples.bodies.in_3")}</li>
              <li className="border-t border-fig-600 py-2 text-[15px] text-paper">{t("couples.bodies.in_4")}</li>
            </ul>
            <p className="mt-5 text-label font-semibold uppercase text-fig-300">
              {t("couples.bodies.out_label")}
            </p>
            {/* fact: C4 — `MemberPortion.portionNote`, une phrase et rien
                d'autre (household_portions.ts:99-109). Les grammes calculés
                (`member_deltas`) n'ont AUCUN écran: FF-043 §11 n°1. */}
            <p className="mt-3 border-t border-fig-600 pt-2 text-[15px] text-paper">
              {t("couples.bodies.out")}
            </p>
          </div>
        </div>

        {/* RÉSERVE — le reste de l'ancien bloc « ce qu'on ne fait pas ».
            fact: C16 — `household_member_bodies` (20260812220000:118) est UNE
            ligne écrasée, ni date ni série: aucune courbe nulle part.
            fact: C15/C15b — `profiles.energy_display_enabled` default false
            (20260812230000:60) et QUATRE portes d'affichage dans
            `energy_gate.ts:232-250` (plancher TCA, mineur, méthode du coach,
            interrupteur élève). La cinquième ne garde que la cible.
            ⚠️ NE JAMAIS écrire « jamais de calories »: faux depuis FF-059,
            `components/plan/EnergyReadout.tsx:42-45` rend bien des kcal une fois les
            verrous levés. La formulation tenable est celle-ci, et elle seule. */}
        <p className="mt-9 max-w-[62ch] text-[15px] leading-relaxed text-fig-300">
          {t("couples.bodies.reserve")}
        </p>
      </div>
    </section>
  );
}

/** BANDE 3 — « Un seul des deux planifie. » */
function OtherProfile() {
  return (
    <section className={`${WRAP} ${SECTION}`}>
      <div className="grid grid-cols-1 items-center gap-11 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="min-w-0">
          <Kicker>{t("couples.other.kicker")}</Kicker>
          <SectionTitle>{t("couples.other.title")}</SectionTitle>
          {/* fact: C8 — FF-044 🟢, 20260810260000:179-190 (`user_id = null`),
              household_portions.ts:63-72 (la part est clée sur `memberId`)
              fact: C1 — 2 €/profil réclamé, maître jamais compté */}
          <p className="mt-5 max-w-[46ch] text-lede text-ink-soft">{t("couples.other.lede")}</p>
          {/* fact: C14 — onboarding.ts:97-103 et :211-290. Ce qu'on DEMANDE, jamais
              combien de temps ça prend: aucune mesure n'existe (règle S8). */}
          <p className="mt-5 max-w-[46ch] text-sm text-ink-soft">{t("couples.other.asked")}</p>
        </div>
        <div className="fig-scroll">
          <FigWho />
        </div>
      </div>
    </section>
  );
}

/** BANDE 4 — le prix et la clôture. */
function Price() {
  return (
    <section className="bg-paper-2">
      <div className={`${WRAP} ${SECTION}`}>
        <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="min-w-0">
            <Kicker>{t("couples.price.kicker")}</Kicker>
            <SectionTitle>{t("couples.price.title")}</SectionTitle>
            {/* fact: C13 — onboarding.ts:88 `FunnelBranch` = solo | pair |
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
              être comparée invite à chercher le plan qui manque.
              ⛔ Ni durée d'essai ni bouton d'achat (AUDIT §8 n°1). */}
          <PriceCard price={formatPrice(PRICES.household)} period={t("couples.price.period")} label={t("couples.price.label")} />
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

      {/* `audience` reste au défaut `"coach"`, qui NE VEUT PAS DIRE « page de
          coach »: il veut dire « page de vente », donc les mondes, les six
          portes et le geste du monde courant. Les trois pages foyer se sont
          déjà posées en `audience="student"` pour éviter un bouton d'essai
          coach, et y ont perdu toute la navigation du site
          (`PublicHeader.tsx:128-147`). */}
      <PublicHeader />

      <main>
        <Hero />
        <Bodies />
        <OtherProfile />
        <Price />
      </main>

      <PublicFooter />
    </div>
  );
}

export default CouplesPage;
