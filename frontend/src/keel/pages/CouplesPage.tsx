import React, { useState } from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";
import { PublicFooter, PublicHeader } from "../components/PublicHeader";
import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";
// ⚠️ LES DÉCISIONS DE LA DÉMONSTRATION SONT CALCULÉES PAR LE MOTEUR, PAS
// RÉÉCRITES ICI. Même motif que `demoTarget` sur `/meal-prep`: on importe des
// modules PURS de `_shared` (« no I/O, no clock, no randomness ») et on les
// appelle. Une seconde implémentation de l'échelle de fusion dans une page de
// vente est une divergence programmée.
import {
  mergeLadder,
} from "../../../../supabase/functions/_shared/keel/household_merge.ts";
import {
  DIETARY_REGIMES,
  type DietaryRegime,
} from "../../../../supabase/functions/_shared/keel/dietary_regime.ts";
import {
  dietServingConflicts,
  strictestRegimeAt,
} from "../../../../supabase/functions/_shared/keel/household_diet.ts";
import { AccidentsFigure } from "../components/ui/AccidentsFigure";
import { OfferLines } from "../components/ui/OfferLines";
import { StickyCta } from "../components/ui/StickyCta";
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { en } from "../i18n/en";
import { t } from "../i18n/t";
import type { MessageKey } from "../i18n/t";

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
export function readServingDemands(direction: string): Record<ServingAxis, AxisDemand> {
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

/**
 * Les TROIS valeurs de `MEMBER_GOALS`. ⚠️ Six jusqu'au 2026-09-01 — voir la
 * note de `MealPrepPage`: `recomposition`, `performance` et `health` ont été
 * retirés le 2026-08-18 et repliés sur `maintenance`.
 */
/* ⚠️ EXPORTÉS POUR ÊTRE TESTÉS, pas pour être réutilisés ailleurs.
   `couplesLadderDemo.int.test.ts` a besoin des mêmes entrées que la page pour
   la comparer au moteur; sans l'export, il devrait les recopier — et vérifier
   une copie contre une autre copie. */
export const GOAL_IDS = [
  "fat_loss",
  "muscle_gain",
  "maintenance",
] as const;
type GoalId = (typeof GOAL_IDS)[number];

/**
 * LES TROIS CHAÎNES ANGLAISES, PRISES DANS LE SEED — jamais retapées ici.
 *
 * `couples.dir.*` porte les valeurs de `SERVING_DIRECTION` mot pour mot, et
 * `i18n/servingDirections.int.test.ts` les épingle contre le module Deno. Lire
 * `en[...]` plutôt que `t(...)` est ce qui garantit que `readServingDemands`
 * parse toujours l'ANGLAIS, y compris sur une page rendue en français.
 *
 * Les clés sont écrites en toutes lettres: une clé construite par gabarit
 * compile et ne prouve plus rien.
 */
export const EN_DIRECTION: Record<GoalId, string> = {
  fat_loss: en["couples.dir.fat_loss"],
  muscle_gain: en["couples.dir.muscle_gain"],
  maintenance: en["couples.dir.maintenance"],
};

/** Le libellé du bouton d'objectif, dans la langue de la page. */
function goalLabel(id: GoalId): string {
  switch (id) {
    case "fat_loss": return t("couples.goal.fat_loss");
    case "muscle_gain": return t("couples.goal.muscle_gain");
    case "maintenance": return t("couples.goal.maintenance");
  }
}

/** La consigne de service rendue au lecteur — la MÊME que sur `/meal-prep`. */
function directionLabel(id: GoalId): string {
  switch (id) {
    case "fat_loss": return t("couples.dir.fat_loss");
    case "muscle_gain": return t("couples.dir.muscle_gain");
    case "maintenance": return t("couples.dir.maintenance");
  }
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
/**
 * ⚠️ `regime` EST UN QUATRIÈME CHOIX, PAS UN TROISIÈME OBJECTIF. Ce sont deux
 * axes indépendants: l'objectif décide de la DIRECTION DE SERVICE, le régime
 * décide de CE QUI PEUT ENTRER dans la casserole. C'est leur croisement qui
 * produit la forme de cuisson, et c'est tout le sujet de cette bande.
 *
 * `null` = « je mange de tout ». Ce n'est pas une quatrième valeur de
 * `DIETARY_REGIMES` (il n'en a que trois): l'omnivore est l'ABSENCE de régime,
 * et `strictestRegimeAt` l'ignore par construction.
 */
/**
 * LES QUATRE CHOIX DE RÉGIME, dans l'ordre du moins au plus restrictif.
 *
 * ⚠️ ON DÉRIVE DE `DIETARY_REGIMES`, on ne recopie pas la liste: un quatrième
 * régime ajouté au moteur doit faire échouer la compilation ici plutôt que
 * disparaître silencieusement de la page. `null` en tête est l'omnivore —
 * l'ABSENCE de régime, pas une valeur du jeton.
 */
const REGIME_CHOICES: ReadonlyArray<DietaryRegime | null> = [null, ...DIETARY_REGIMES];

const REGIME_LABEL: Record<DietaryRegime, MessageKey> = {
  vegetarian: "couples.diet.vegetarian",
  vegan: "couples.diet.vegan",
  pescatarian: "couples.diet.pescatarian",
};

function regimeLabel(regime: DietaryRegime | null): string {
  return regime === null ? t("couples.diet.omnivore") : t(REGIME_LABEL[regime]);
}

function PersonColumn({
  name,
  legend,
  goal,
  onPick,
  regime,
  onPickRegime,
}: {
  name: string;
  legend: string;
  goal: GoalId;
  onPick: (goal: GoalId) => void;
  regime: DietaryRegime | null;
  onPickRegime: (regime: DietaryRegime | null) => void;
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
              <span className="inline-block rounded border border-line-strong px-2.5 py-2 text-[13px] leading-none text-ink transition-colors hover:border-line peer-checked:border-fig-700 peer-checked:bg-fig-700 peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-fig-600">
                {goalLabel(id)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* LE RÉGIME — quatre choix, dont l'omnivore qui n'en est pas un.
          fact: `20260814110000_dietary_regime_per_mouth.sql` — le régime est
          PAR BOUCHE, donc il vaut aussi pour le conjoint sans compte. C'est ce
          qui rend cette démonstration honnête pour un couple. */}
      <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
        <legend className="eq p-0 text-label font-semibold uppercase text-ink-soft">
          {t("couples.demo.diet_legend")}
        </legend>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {REGIME_CHOICES.map((choice) => (
            <label key={choice ?? "omnivore"} className="cursor-pointer">
              <input
                type="radio"
                name={`${name}-diet`}
                value={choice ?? "omnivore"}
                checked={regime === choice}
                onChange={() => onPickRegime(choice)}
                className="peer sr-only"
              />
              <span className="inline-block rounded border border-line-strong px-2.5 py-2 text-[13px] leading-none text-ink transition-colors hover:border-line peer-checked:border-fig-700 peer-checked:bg-fig-700 peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-fig-600">
                {regimeLabel(choice)}
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
      <div className="mt-4 border-t border-line pt-3" role="status" aria-live="polite">
        {/* fact: C4 — `SERVING_DIRECTION`, household_portions.ts:125-151. Six
            chaînes DISTINCTES; `health` a cessé de rendre celle de
            `maintenance` le 2026-08-11.
            ⚠️ L'INTITULÉ EN CAPITALES ET LE `grow`/`mt-auto` ONT SAUTÉ LE
            2026-09-02. La console pesait 907 px — presque un écran — et sa
            VALEUR arrivait en dernier. Deux intitulés + deux phrases à 15 px
            coûtaient 220 px pour ANNOTER un geste qu'on vient de faire: la
            phrase se lit juste sous la puce cochée, elle n'a pas besoin qu'on
            la lui présente. ⛔ Ne pas lui rendre un titre. */}
        <p className="text-[13px] leading-5 text-ink-soft">{directionLabel(goal)}</p>
        {/* ⚠️ LE TABLEAU DES TROIS AXES A ÉTÉ RETIRÉ LE 2026-09-01, ET SA
            JUSTIFICATION D'ORIGINE EST BIEN MORTE — ce n'est pas un oubli.

            Elle disait: « c'est LIGNE PAR LIGNE qu'on les compare, et c'est
            tout l'objet de la fiche. » C'était vrai quand la démonstration
            n'avait PAS de sortie: comparer les deux colonnes était le seul
            travail que le lecteur pouvait faire. Depuis que la démonstration
            REND une forme de cuisson calculée (« un seul plat » / « deux plats,
            une seule cuisson », plus le pourquoi), l'objet de la fiche a
            changé: elle ne fait plus comparer, elle répond.

            Ce qui restait était un DOUBLON mesuré: `readServingDemands` PARSE
            la phrase juste au-dessus pour construire ce tableau — « les axes
            sont LUS dans la chaîne, jamais recopiés ». La phrase disait « part
            de protéine et de féculent plus grande, mêmes légumes » et le
            tableau redisait « Protéine · part plus grande / Féculent · part
            plus grande / Légumes · part équilibrée ». 110 px par colonne, 220
            au total, pour ne rien ajouter.

            ⚠️ `QUALIFIERS` ET `AXIS_WORDS` RESTENT: `demoLadder` en a besoin
            pour appeler `mergeLadder`, et `servingDirections.int.test.ts` LIT
            ces deux tables dans ce fichier. Les retirer ferait rougir la
            garde. Seuls les libellés d'AFFICHAGE sont partis. */}
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
/**
 * L'ÉCHELLE DE FUSION, POUR CE COUPLE — RENDUE PAR LE MOTEUR.
 *
 * ⚠️ EXPORTÉE POUR ÊTRE TESTÉE, pas pour être réutilisée ailleurs.
 * `couplesLadderDemo.int.test.ts` compare sa sortie à `mergeLadder` appelé
 * directement: sans l'export, le test devrait recopier l'appel, c'est-à-dire
 * vérifier une copie contre une autre copie.
 *
 * ⚠️ LES JOURS DE CUISINE SONT LES MÊMES DES DEUX CÔTÉS, ET C'EST DÉLIBÉRÉ.
 * Le troisième barreau (`separate_sessions`) n'existe que si AUCUN jour n'est
 * partagé — une question que cette page ne pose pas. En passant le même jour
 * aux deux, la démonstration ne peut pas produire un barreau qu'elle ne sait
 * pas expliquer; `couples.demo.outcome_rule` dit qu'il existe.
 */
export function demoLadder(left: GoalId, right: GoalId) {
  return mergeLadder({
    table: [readServingDemands(EN_DIRECTION[left])],
    incoming: readServingDemands(EN_DIRECTION[right]),
    householdCookingDays: ["sun"],
    personalCookingDays: ["sun"],
  });
}

/**
 * LE RÉGIME SÉPARE-T-IL LE PLAT ? — R4 puis R5 de `household_diet.ts`.
 *
 * R4: le plat commun descend au plus RESTRICTIF des deux (`strictestRegimeAt`).
 * R5: si cette descente retire à quelqu'un ce que sa direction de service
 * demande — `dietServingConflicts` le dit, et il ne parle que de la protéine —
 * cette personne reçoit son plat.
 *
 * ⚠️ ON TESTE LES DEUX DIRECTIONS, pas seulement celle de l'autre: un régime
 * peut aussi retirer à celui QUI LE PORTE ce que son propre objectif demande
 * (un végane en prise de muscle), et ce cas-là est le plus intéressant des deux.
 */
export function demoDietSplits(
  left: GoalId,
  right: GoalId,
  leftDiet: DietaryRegime | null,
  rightDiet: DietaryRegime | null,
): boolean {
  const strictest = strictestRegimeAt([leftDiet, rightDiet]);
  if (strictest === null) return false;
  return [left, right].some((goal) =>
    dietServingConflicts(strictest, readServingDemands(EN_DIRECTION[goal])).length > 0
  );
}

function ServingDemo() {
  const [left, setLeft] = useState<GoalId>("muscle_gain");
  const [right, setRight] = useState<GoalId>("fat_loss");
  const [leftDiet, setLeftDiet] = useState<DietaryRegime | null>(null);
  const [rightDiet, setRightDiet] = useState<DietaryRegime | null>(null);

  /**
   * LA FORME DE CUISSON — CALCULÉE PAR `mergeLadder`, PAS DÉCIDÉE ICI.
   *
   * La règle qu'il applique tient en une phrase, et c'est elle qu'on écrit sous
   * la démonstration: **une casserole peut toujours en donner moins, jamais
   * plus qu'elle n'en contient**. `servingConflicts` compare, axe par axe, ce
   * que demande l'un au PLAFOND déjà présent à table; il n'y a conflit que
   * quand quelqu'un veut une part plus grande que tout ce qui est dans le plat.
   *
   * ⚠️ LES JOURS DE CUISINE SONT LES MÊMES DES DEUX CÔTÉS, ET C'EST DÉLIBÉRÉ.
   * Le troisième barreau (`separate_sessions`) n'existe que si AUCUN jour n'est
   * partagé — une question que cette page ne pose pas. En passant le même jour
   * aux deux, la démonstration ne peut pas produire un barreau qu'elle ne sait
   * pas expliquer; une ligne de texte dit qu'il existe.
   */
  const ladder = demoLadder(left, right);

  /**
   * CE QUE LE RÉGIME DÉCIDE — R4 et R5 de `household_diet.ts`.
   *
   * R4: le plat commun descend au plus RESTRICTIF de la table. Un omnivore peut
   * manger un plat végétarien; l'inverse est faux, et c'est l'exacte symétrie
   * de l'union des allergies.
   * R5: si cette descente retire à quelqu'un sa direction de service — un
   * régime qui plafonne la protéine face à quelqu'un qui en demande une part
   * plus grande — cette personne reçoit SON plat, et seulement si le temps de
   * cuisine le permet (arbitrage de l'appelant, hors de cette page).
   */
  const strictest = strictestRegimeAt([leftDiet, rightDiet]);
  const dietSplits = demoDietSplits(left, right, leftDiet, rightDiet);

  return (
    <section
      aria-label={t("couples.demo.eyebrow")}
      className="min-w-0 rounded-lg border border-line bg-paper-2 p-4 sm:p-5"
    >
      <Kicker>{t("couples.demo.eyebrow")}</Kicker>
      <p className="mt-3 text-[13px] text-ink-soft">{t("couples.demo.hint")}</p>

      {/* ⚠️ L'ISSUE EST À CÔTÉ DES RÉGLAGES, PAS DESSOUS — 2026-09-02.
          Mesuré avant: la console faisait 563 × 907 px dans une bande de
          1414 px, avec 550 px de vide dans la colonne de texte d'à côté. On
          voyait, dans l'ordre: une casserole dessinée (155 px), les réglages
          (364 px), puis enfin la réponse (246 px). La VALEUR arrivait en
          troisième position, sous la ligne de flottaison du widget.
          La casserole décorative et sa légende sont parties avec `PotMark` et
          `couples.demo.pot`: l'équerre dit déjà « Une cuisson. Un plat, ou
          deux. », et un dessin n'ajoutait qu'un délai. ⛔ Ne pas la remettre. */}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.05fr_1fr] lg:gap-7">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <PersonColumn
          name="cpl-goal-left"
          legend={t("couples.demo.person_a")}
          goal={left}
          onPick={setLeft}
          regime={leftDiet}
          onPickRegime={setLeftDiet}
        />
        <PersonColumn
          name="cpl-goal-right"
          legend={t("couples.demo.person_b")}
          goal={right}
          onPick={setRight}
          regime={rightDiet}
          onPickRegime={setRightDiet}
        />
      </div>

      {/* ══ CE QUI SORT DE LA CASSEROLE ═══════════════════════════════════
          La sortie de la démonstration, et c'est elle qui la rend utile: on
          voit la forme CHANGER quand on bouge un objectif ou un régime.
          Elle est la SECONDE piste de la grille ci-dessus, donc elle est à
          l'écran EN MÊME TEMPS que les puces qui la font changer. */}
      <div className="min-w-0 rounded border border-line-strong bg-paper p-4" role="status" aria-live="polite">
        <p className="text-label font-semibold uppercase text-ink-soft">{t("couples.demo.outcome_label")}</p>
        <p className="mt-2 text-[15px] font-medium leading-relaxed text-ink">
          {ladder.shape === "one_dish" && !dietSplits
            ? t("couples.demo.outcome_one_dish")
            : t("couples.demo.outcome_one_session")}
        </p>
        {/* LE POURQUOI, et il n'est pas le même selon ce qui a tranché. */}
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {dietSplits
            ? t("couples.demo.outcome_why_diet", { regime: regimeLabel(strictest).toLowerCase() })
            : ladder.shape === "one_dish"
            ? t("couples.demo.outcome_why_one_dish")
            : t("couples.demo.outcome_why_goals")}
        </p>
        {/* LA RÈGLE, EN UNE PHRASE. C'est le critère D6, et c'est ce que
            `servingConflicts` applique littéralement. */}
        <p className="mt-3 border-t border-line pt-3 text-[13px] leading-5 text-ink-soft">
          {t("couples.demo.outcome_rule")}
        </p>
      </div>
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
        <text x="264" y="174">{t("couples.fig.who.b3", { amount: formatPrice(PRICES.claimedProfile) })}</text>
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
/**
 * BANDE 1, LE HÉROS — LA CHARGE MENTALE, À DEUX.
 *
 * ⚠️ CE N'ÉTAIT PAS LE HÉROS JUSQU'AU 2026-09-01. La page ouvrait sur « deux
 * objectifs, une seule cuisson » — une FONCTIONNALITÉ, et la plus spécifique
 * de la page. Elle est descendue en bande 3, sur l'ordre d'achat du segment:
 * on achète d'abord de ne plus avoir à décider, ensuite la certitude de bien
 * manger, et seulement ensuite la cohabitation des objectifs.
 *
 * ⚠️ ET CE HÉROS-CI N'EST PAS CELUI DE `/meal-prep`. À deux, la charge n'est
 * pas seulement lourde: elle se NÉGOCIE. « Qu'est-ce qu'on mange » est une
 * question posée à quelqu'un, tous les soirs, et c'est ça qu'on retire.
 */
function Hero() {
  return (
    <section className={`${WRAP} ${SECTION}`}>
      <div className="grid grid-cols-1 items-start gap-11 lg:grid-cols-[0.92fr_1fr] lg:gap-14">
        <div className="min-w-0">
          <Kicker>{t("couples.hero.kicker")}</Kicker>
          {/* ⚠️ CE TITRE EST RECOPIÉ MOT POUR MOT SUR LA PORTE DU HALL
              (`home.door.pair.label`). Une porte qui promet un autre titre que
              celui de la page derrière ne s'ouvre pas deux fois. */}
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
          {/* L'OFFRE, IDENTIQUE SUR LES CINQ SURFACES DU FOYER.
              ⚠️ `couples.hero.price` a été retirée le 2026-09-01: elle vendait le
              second accès 2 € pendant que `/families` le vendait 1,99 € sous un
              autre nom. Et elle ne disait rien de la semaine offerte, que seule
              `/families` annonçait — puis qui disparaissait sur `/start`.
              fact: C1 — 20260810260000_household_billable_profiles.sql:235-250
              (le maître n'est jamais facturé pour son propre accès). */}
          <OfferLines className="mt-5" />
          {/* La réserve n'est pas optionnelle: `/start` interroge d'abord
              `keel_free_signup_available`, et si le programme du coach maison
              n'est pas publié, la porte est fermée (AUDIT §10). */}
        </div>

        {/* CE QUE LA SEMAINE APPORTE, en deux champs — les sessions de cuisine
            et les courses. Ils étaient une bande à part (`Week`); ils montent
            ici parce qu'ils SONT la promesse du héros, pas un complément. */}
        <div className="min-w-0">
          <div className="rounded-fiche border border-line bg-paper-2 p-5 sm:p-6">
            {/* ⚠️ LES REPAS D'ABORD, ET C'EST L'ORDRE DU CHAPÔ: « les repas,
                les jours de cuisine, la liste ». La fiche n'en portait que
                deux — 303 px contre 635 px pour la colonne de gauche, donc
                332 px de vide. On remplit avec la pièce qui manquait, pas
                avec de l'espacement. */}
            <h2 className="font-medium text-ink">{t("couples.week.meals_title")}</h2>
            <p className="mt-2 max-w-[52ch] text-[15px] leading-6 text-ink-soft">{t("couples.week.meals_body")}</p>
            {/* fact: C3 — `interface CookingSession` (meal_generation.ts):
                l'unité du plan est la session, pas le plat. */}
            <h2 className="mt-6 border-t border-line pt-5 font-medium text-ink">{t("couples.week.sessions_title")}</h2>
            <p className="mt-2 max-w-[52ch] text-[15px] leading-6 text-ink-soft">{t("couples.week.sessions_body")}</p>
            {/* fact: C5 — `MAX_FRIDGE_DAYS = 3` (meal_generation.ts), appliqué
                en grocery_waves.ts. ⚠️ Le mot « vague » n'est pas employé: il
                n'est présenté nulle part sur cette page. */}
            <h2 className="mt-6 border-t border-line pt-5 font-medium text-ink">{t("couples.week.waves_title")}</h2>
            <p className="mt-2 max-w-[52ch] text-[15px] leading-6 text-ink-soft">{t("couples.week.waves_body")}</p>
          </div>
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
/**
 * BANDE 2 — « EST-CE QU'ON MANGE BIEN ? »
 *
 * ⚠️ C'ÉTAIT LE BLOC SOMBRE JUSQU'AU 2026-09-01, et il ne l'est plus: la charte
 * n'autorise qu'UN bloc sombre par page, et il est réattribué à la bande 3, qui
 * porte l'argument le plus dur de la page (le plat commun descend au plus
 * restrictif). Ici, le fond clair suffit.
 *
 * ⚠️ ET ELLE MÈNE PAR L'ÉQUILIBRE, PAS PAR LA TAILLE. Elle ne parlait que de la
 * taille d'une part — quatre champs de corps produisent une phrase. C'est vrai
 * et c'est la SECONDE moitié: la première est que les trois composantes sont
 * toujours là, et que l'objectif ne change que leur proportion.
 *
 * ⛔ LES TROIS ARGUMENTS QU'ON N'A PAS LE DROIT DE PRENDRE ICI, VÉRIFIÉS:
 *   · pas de plancher protéique — `PROTEIN_FLOOR_G_PER_KG` (Morton 2018) vit
 *     dans `meal_envelope.ts` et n'est PAS lu par `household_portions.ts`.
 *     C'est la lane INDIVIDUELLE;
 *   · pas d'ancre protéique par repas — c'est une POSITION DE DOCTRINE qu'un
 *     coach peut prendre (`composition_forks.ts`), pas une règle du foyer;
 *   · aucun taux de couverture, aucune garantie d'apports, aucun bilan.
 */
function Composed() {
  return (
    <section className={`${WRAP} ${SECTION} bg-paper-2`}>
      <div>
        <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div className="min-w-0">
            <Kicker>{t("couples.bodies.kicker")}</Kicker>
            {/* `text-title` et non un `clamp()` maison: l'échelle a cinq crans
                et un agent en CHOISIT un. L'interligne est le seul écart —
                1,06 est fait pour un titre de deux lignes, pas pour trois. */}
            <h2 className="mt-4 max-w-[22ch] font-display text-title leading-[1.16] text-ink">
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
            <p className="mt-5 max-w-[46ch] text-lede text-ink-soft">{t("couples.bodies.lede")}</p>
            {/* LA SECONDE MOITIÉ: la TAILLE. La première (l'équilibre) est dans
                le chapô ci-dessus, parce que c'est elle qu'on vient chercher. */}
            <p className="mt-4 max-w-[46ch] text-[15px] leading-7 text-ink-soft">{t("couples.bodies.size")}</p>
            {/* CLÔTURE EN BÉNÉFICE, jamais en démenti. Tournure déjà autorisée
                dans ce dépôt: `home.balance.body` et `families.doubt.answer`
                finissent toutes deux par « vous n'avez plus à vous demander si
                ça suffit ». Elle enlève l'inquiétude sans promettre un
                résultat, ce que `LEGAL.md` §6.1 interdit. */}
            <p className="mt-5 max-w-[46ch] border-t border-line pt-5 text-[15px] leading-7 text-ink">{t("couples.bodies.settled")}</p>
          </div>

          {/* LA FICHE — ce qui entre, ce qui sort. Elle dit d'un coup d'œil que
              quatre champs produisent UNE PHRASE, et c'est exactement la
              frontière que le produit tient.
              ⚠️ Les filets sont en `fig-600` et non en `fig-300`: sur ce fond,
              `fig-300` est à 8:1 — un séparateur qui crie plus fort que le
              texte qu'il sépare. C'est le jumeau sombre de `line`, décoratif,
              et il ne borde jamais un contrôle. */}
          <div className="min-w-0 rounded border border-line p-4 sm:p-5">
            <p className="text-label font-semibold uppercase text-ink-soft">
              {t("couples.bodies.in_label")}
            </p>
            <ul className="mt-3 list-none space-y-0 p-0">
              <li className="border-t border-line py-2 text-[15px] text-ink">{t("couples.bodies.in_1")}</li>
              <li className="border-t border-line py-2 text-[15px] text-ink">{t("couples.bodies.in_2")}</li>
              <li className="border-t border-line py-2 text-[15px] text-ink">{t("couples.bodies.in_3")}</li>
              <li className="border-t border-line py-2 text-[15px] text-ink">{t("couples.bodies.in_4")}</li>
            </ul>
            <p className="mt-5 text-label font-semibold uppercase text-ink-soft">
              {t("couples.bodies.out_label")}
            </p>
            {/* fact: C4 — `MemberPortion.portionNote`, une phrase et rien
                d'autre (household_portions.ts:99-109). Les grammes calculés
                (`member_deltas`) n'ont AUCUN écran: FF-043 §11 n°1. */}
            <p className="mt-3 border-t border-line pt-2 text-[15px] text-ink">
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
          <p className="mt-5 max-w-[46ch] text-lede text-ink-soft">{t("couples.other.lede", { amount: formatPrice(PRICES.claimedProfile) })}</p>
          {/* fact: C14 — onboarding.ts:97-103 et :211-290. Ce qu'on DEMANDE, jamais
              combien de temps ça prend: aucune mesure n'existe (règle S8). */}
        </div>
        <div className="fig-scroll">
          <FigWho />
        </div>
      </div>
    </section>
  );
}


/* ═══ BANDE 3 — DEUX OBJECTIFS, DEUX RÉGIMES, UNE CASSEROLE ════════════════
   Le cœur de la page, et le seul bloc qui lui soit propre. C'est ici qu'on
   répond à la question que se pose un couple avant d'acheter: « est-ce que ça
   tient, nous deux, sans que l'un renonce ? »

   ⚠️ LA DÉMONSTRATION EST LA BANDE, pas son illustration. Elle était dans la
   colonne droite du héros, où elle servait d'ornement à un titre; elle a
   maintenant sa bande, son titre et sa sortie — et cette sortie CHANGE quand on
   bouge un objectif ou un régime. */
function Together() {
  return (
    <section className={`${WRAP} ${SECTION}`}>
      {/* ⚠️ LA CONSOLE PREND LA LARGEUR DE LA BANDE — 2026-09-02. Elle était la
          piste droite d'une grille `[0.92fr_1fr]`: 563 px de large et 907 px de
          haut, contre 357 px pour la colonne de texte. 550 px de vide à gauche,
          et une console assez étroite pour devoir empiler ses réglages puis sa
          réponse. En pleine largeur elle pose les deux CÔTE À CÔTE.
          Le texte prend la disposition de `/families` bande 2 — titre, puis
          deux colonnes de prose, puis l'objet en pleine largeur. */}
      <Kicker>{t("couples.together.kicker")}</Kicker>
      <SectionTitle>{t("couples.together.title")}</SectionTitle>
      <div className="mt-7 grid gap-9 lg:grid-cols-2 lg:gap-16">
        <p className="max-w-[52ch] text-lede text-ink-soft">{t("couples.together.lede")}</p>
        {/* ⚠️ LES GOÛTS SE DISENT ICI, EN PROSE, ET SANS RÉGLAGE. Le parcours
            ne collecte QUE le régime et les allergies; « n'aime pas le
            poisson » vit dans la mémoire apprise en conversation
            (`20260812210000_food_preference_targeted_write.sql`). Un curseur
            pour ça vendrait un bouton qui n'existe pas. */}
        <p className="max-w-[52ch] text-[15px] leading-7 text-ink-soft">{t("couples.together.tastes")}</p>
      </div>

      <div className="mt-10 sm:mt-12">
        <ServingDemo />
      </div>

      {/* LE BLOC SOMBRE — le seul de la page (charte §5), et il est ici parce
          que c'est l'argument le plus dur à faire passer: on ne demande à
          personne de renoncer.
          ⛔ AUCUN LIEN NI BOUTON DEDANS: `fig-600` tombe à 2,3:1 sur `on-dark`.
          fact: `household_diet.ts` R4 — « un omnivore peut manger un plat
          végétarien; l'inverse est faux », l'exacte symétrie de l'union des
          allergies et du critère D6. */}
      <div className="on-dark mt-12 rounded-fiche bg-fig-950 p-6 sm:mt-14 sm:p-10">
        <Kicker onDark>{t("couples.give_up.kicker")}</Kicker>
        <h3 className="mt-4 max-w-[26ch] font-display text-sub leading-[1.2] text-paper">
          {t("couples.give_up.title")}
        </h3>
        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:gap-14">
          <p className="max-w-[52ch] text-[15px] leading-7 text-fig-300">{t("couples.give_up.body")}</p>
          <p className="max-w-[52ch] text-[15px] leading-7 text-fig-300">{t("couples.give_up.body_2")}</p>
        </div>
      </div>
    </section>
  );
}

/* ═══ BANDE 4 — QUAND LA VRAIE VIE PERCUTE LE PLAN ═════════════════════════
   La même figure que `/meal-prep` (`ui/AccidentsFigure.tsx`), avec les clés de
   CETTE page: à deux, un accident ne tombe pas sur la même personne selon ce
   qui a sauté, et c'est là que la charge se renégocie. */
function Moves() {
  return (
    <section className={`${WRAP} ${SECTION} bg-paper-2`}>
      <Kicker>{t("couples.moves.kicker")}</Kicker>
      <SectionTitle>{t("couples.moves.title")}</SectionTitle>
      <div className="mt-9">
        <div className="fig-scroll" tabIndex={0} role="group" aria-labelledby="cpl-acc-t">
          <AccidentsFigure
            idPrefix="cpl-acc"
            label={t("couples.fig.moves.label")}
            title={t("couples.fig.moves.title")}
            desc={t("couples.fig.moves.desc")}
            mealLabel={t("couples.fig.moves.dish")}
            sessionLabel={t("couples.fig.moves.session")}
            shoppingLabel={t("couples.fig.moves.shopping")}
          />
        </div>
        {/* Deux paragraphes de longueur voisine — ils sont rendus côte à côte. */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 sm:gap-12">
          <p className="max-w-[62ch] text-[15px] leading-7 text-ink-soft">{t("couples.moves.body")}</p>
          <p className="max-w-[62ch] text-[15px] leading-7 text-ink-soft">{t("couples.moves.body_2")}</p>
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
            </div>
          {/* fact: C1 — 20260810260000:101-105 (plafond 8 bouches), :235-250.
              Une seule carte, aucune liste de features: une carte faite pour
              être comparée invite à chercher le plan qui manque.
              ⛔ Ni durée d'essai ni bouton d'achat (AUDIT §8 n°1). */}
          <PriceCard
            price={formatPrice(PRICES.household)}
            period={t("couples.price.period")}
            label={t("couples.price.label", { amount: formatPrice(PRICES.claimedProfile) })}
          />
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
        {/* L'ORDRE EST L'ARGUMENT, ET IL A CHANGÉ LE 2026-09-01.
            1. la charge mentale À DEUX — ce dont on veut être débarrassé, et à
               deux elle se négocie tous les soirs;
            2. est-ce qu'on mange bien — la raison de ne pas prendre le gratuit;
            3. deux objectifs et deux régimes qui cohabitent — le seul bloc
               propre à cette page;
            4. le plan qui encaisse la vraie vie;
            5. le prix, avec le second accès contre lui.
            Avant, la page ouvrait sur « deux objectifs, une seule cuisson »:
            la fonctionnalité la plus spécifique, en première ligne. */}
        <Hero />
        <Composed />
        <Together />
        <Moves />
        <OtherProfile />
        <Price />
      </main>

      <PublicFooter />

      {/* LE GESTE, À PORTÉE SUR TÉLÉPHONE — voir `ui/StickyCta.tsx`.
          ⚠️ APRÈS `PublicFooter`, ET C'EST MESURÉ. Posé avant, sa réserve de
          hauteur s'insérait ENTRE le contenu et le pied de page: le pied
          descendait de 80 px et la barre, elle, continuait de recouvrir ses
          deux dernières lignes en bas de course — « Contact » et les mentions
          légales. La réserve ne protège que ce qui la SUIT. */}
      <StickyCta label={t("couples.hero.cta")} />
    </div>
  );
}

export default CouplesPage;
