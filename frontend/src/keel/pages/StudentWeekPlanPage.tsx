import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
// `Field` n'est plus utilisé: les deux zones de texte qu'il habillait ont
// disparu de cet écran (« Your situation » retirée, l'aspiration passée dans
// l'option choisie, avec son propre `label`).
import { inputClass } from "../components/ui/Field";
import Modal from "../components/ui/Modal";
import SetupSection from "../components/ui/SetupSection";
import MealBuilder from "../components/MealBuilder";
import ReferenceMemberCard from "../components/plan/ReferenceMemberCard";
import TableCard from "../components/plan/TableCard";
import MyShareCard from "../components/plan/MyShareCard";
import {
  type HouseholdMealView,
  type HouseholdView,
  loadHousehold,
  loadHouseholdMeal,
  loadMyHouseholdPlace,
  setReferenceMember,
} from "../api/household";
import { browserLocalDate } from "../lib/useMealTicks";
import EatingRhythmCard from "../components/EatingRhythmCard";
import CookingCapacityCard from "../components/CookingCapacityCard";
import FoodPreferencesCard from "../components/FoodPreferencesCard";
import { type AwayDay, parseAwayDays, parseEatingRhythm } from "../api/mealGeneration";
import { dishDayLabel, mealCopy } from "../api/mealLabels";
import { keptFrom } from "../api/foodPreferences";
import { mergePracticalConstraints } from "../api/practicalConstraints";
import { sendChatMessage } from "../api/chat";
import { addDays } from "../api/dates";
import {
  axisReading,
  type BodyMeasureRow,
  type DatedMeasure,
  FOCUS_AXES,
  focusAxisLabel,
  type FocusAxis,
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  indicatorFor,
  lastMeasuredOn,
  latest,
  readIndicator,
  readMeasureInput,
  type ReviewRow,
  targetValueOf,
  WAIST_CM_MAX,
  WAIST_CM_MIN,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
  weeklyMeasures,
  weeksInsideBand,
} from "../api/bodyMeasures";
// ⚠️ `GoalToken` VIENT DU MODULE PARTAGÉ, ET PLUS D'`api/coachDoctrine`.
// C'était un import de TYPE seul, donc effacé à la compilation — et pourtant
// il tirait tout le namespace `coach.*` sur cet écran d'ÉLÈVE aux yeux du
// scanner de coutures, qui suit les imports et pas les appels. Il a raison de
// le faire: `coachDoctrine.ts` rend de la copie de coach (`goalLabel`,
// `variantLabel`), et rien n'empêchait quelqu'un d'en appeler une ici.
// `_shared/keel/tokens.ts` est l'AUTORITÉ du jeton — `api/bodyMeasures.ts`
// l'importait déjà de là.
import type { GoalToken } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import { formatDate } from "../i18n/format";
import { plural } from "../i18n/plural";
import { type MessageKey, t } from "../i18n/t";
import { buildMeasuresToken } from "../../../../supabase/functions/_shared/keel/weekly_flow.ts";

/**
 * PIVOT C1 — `/app/plan` : the week, and whose week it is.
 *
 * ---------------------------------------------------------------------------
 * THE MODEL, because the whole screen follows from it
 * ---------------------------------------------------------------------------
 *     THE COACH TEACHES A METHOD · THE STUDENT DECIDES · NOBODY GRADES
 *
 * So this screen never shows a score, a completion percentage, a streak or a
 * badge. It shows what the student set for themselves, and where each line came
 * from. Nothing here measures performance — that is what lets Sophia follow
 * "from a long way off" without creating resistance.
 *
 * ---------------------------------------------------------------------------
 * GENERATING IS NOT ADOPTING
 * ---------------------------------------------------------------------------
 * Generation produces a DRAFT. The student reads it and adopts it if they
 * recognise themselves in it. A plan applied automatically would be the
 * machine's plan carried by the student — the opposite of what we are building.
 *
 * ---------------------------------------------------------------------------
 * EVERY FOOD LINE SHOWS THE CONVICTION IT CAME FROM
 * ---------------------------------------------------------------------------
 * This changed with C1, and the reason matters. The coach does NOT write
 * per-student lines — they teach a method, and Sophia composes the lines from
 * it. So a badge reading "written by your coach" would be a lie.
 *
 * What is true, and what we show, is the derivation: the line, then the
 * coach's actual conviction underneath it. The code can guarantee that every
 * line NAMES a real conviction; it cannot guarantee the interpretation is
 * faithful. Showing the conviction is what makes that judgeable — by the
 * student, and by the coach reading over their shoulder.
 */


/**
 * LE NOM DE L'ÉCRAN, ET POURQUOI IL A CHANGÉ.
 *
 * « My week » ne disait pas ce qu'on y fait. Un élève qui arrivait ici lisait
 * un titre, un objectif et un bouton, sans jamais comprendre que c'est ICI
 * qu'on écrit ce qu'il va manger de la semaine. Le titre porte donc le mot
 * « plan », et le sous-titre dit ce que le bouton PRODUIT — pas ce qu'il est.
 *
 * ── LE SOUS-TITRE, CORRIGÉ LE 2026-08-12 (FF-059) ──────────────────────────
 * Il disait « Lines and rhythms, NEVER CALORIE COUNTS », et depuis FF-059 cette
 * phrase est fausse SUR LE MÊME ÉCRAN, à trois centimètres de trois chiffres:
 * mesuré en run réel, « 537 kcal » s'affiche sous elle. Une promesse
 * contredite par ce qu'on voit en même temps qu'elle ne coûte pas seulement sa
 * crédibilité — elle apprend au lecteur à ne pas lire les autres.
 *
 * Ce qui la remplace garde la promesse qui, elle, TIENT et qui était la vraie:
 * rien ici ne NOTE personne. Pas de cible, pas de budget, pas de pourcentage
 * d'adhérence — FF-059 n'affiche que des faits sur la nourriture (A et B), et
 * le niveau C (un chiffre contre une cible) est bloqué sur trois décisions
 * humaines.
 *
 * ⚠️ Et elle ne promet pas le chiffre non plus: il dépend de quatre portes
 * (plancher TCA, âge, doctrine du coach, interrupteur de l'élève), et il est
 * ABSENT pour la plupart des gens. Un sous-titre qui l'annoncerait serait faux
 * dans l'autre sens.
 *
 * `WEEK_PLAN_SYSTEM_PROMPT` refuse toujours toute calorie et tout macro DANS CE
 * QU'IL ÉCRIT, et un filtre en aval rejette les lignes qui en portent. Le
 * chiffre de FF-059 n'est pas écrit par un modèle: il est calculé après coup
 * depuis les quantités du plan.
 */
// ⚠️ DES FONCTIONS ET PAS DES CONSTANTES. `const PAGE_TITLE = t(…)` au niveau
// module se figerait à la langue du PREMIER chargement — or changer de langue
// recharge la page précisément pour ces constantes-là (`i18n-lint.mjs`, règle
// `MODULE_SCOPE_T`).
const pageTitle = () => t("plan.page.title");
// « plus one or two light habits » est TOMBÉ. L'écran ne compose plus de lignes
// de comportement — `MealBuilder` produit des plats, et rien d'autre. La
// promesse survivait au moteur qui la tenait, ce qui est la pire forme de copie
// morte: elle annonce une fonctionnalité qu'aucun code ne fournit.
const pageSubtitle = () => t("plan.page.subtitle");



interface GoalRow {
  goal: string;
  situation: string | null;
  aspiration: string | null;
  focus_axis: string | null;
  target_weight_kg: number | null;
  target_waist_cm: number | null;
  /**
   * Les contraintes pratiques STRUCTURÉES — celles sur lesquelles le générateur
   * branche, par opposition à `situation` qu'il ne fait que lire. Le rythme des
   * repas y vit sous `eating_rhythm`. Lu ici pour deux raisons: alimenter la
   * carte, et surtout ne pas écraser les autres clés en l'enregistrant.
   */
  practical_constraints: Record<string, unknown> | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };


/**
 * LES SIX DIRECTIONS, ET POURQUOI CHACUNE PORTE UNE PHRASE.
 *
 * Un mot seul ne se choisit pas. « Recomposition » est du jargon qu'un élève
 * n'a aucune raison de connaître, et « Performance » ressemble à un fourre-tout
 * où tombe quiconque s'entraîne — c'est très exactement là que la prise de
 * masse atterrissait avant d'avoir son propre jeton, alors que
 * `focusFor('performance')` parle de carburant de séance et jamais de surplus.
 *
 * Les trois premières descriptions sont écrites autour de LA MÊME CHOSE:
 * le sens de l'aiguille. C'est le seul critère qu'un élève peut appliquer à
 * lui-même sans se tromper (descendre / monter / ne pas bouger), et c'est
 * aussi, mot pour mot, ce que `directionIsWorking` mesure ensuite dans
 * `student_body.ts`. La phrase qui aide à choisir et la phrase qui sert de
 * repère sont donc la même — si l'une change, l'autre est fausse.
 *
 * L'ORDRE N'EST PAS ALPHABÉTIQUE ni celui de `GOAL_TOKENS`: il va du corps
 * (descendre, monter, changer de forme) vers le reste (s'entraîner, aller
 * mieux, tenir). Un élève trouve sa ligne dans les trois premières ou n'y est
 * pas du tout.
 */
// ⚠️ LES JETONS RESTENT ANGLAIS ET SNAKE_CASE (R1): ils sont écrits dans le
// CHECK de `student_goals.goal`, dans la doctrine du coach (`goalScope`) et dans
// les lignes déjà en base. Seuls les MOTS vivent dans le seed.
const GOAL_VALUES = [
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "performance",
  "health",
  "maintenance",
] as const;

/** Une FONCTION: une table de module se figerait à la langue du démarrage. */
function goalOptions(): Array<{ value: string; label: string; blurb: string }> {
  return GOAL_VALUES.map((value) => ({
    value,
    label: t(`plan.goal.${value}.label` as MessageKey),
    blurb: t(`plan.goal.${value}.blurb` as MessageKey),
  }));
}

/**
 * Server error codes, in the student's words.
 *
 * Kept as a map rather than shown raw: `coach_has_no_doctrine` on screen tells
 * a student nothing, and each of these calls for a different next move. An
 * unknown code still falls through to the raw string — a silent generic message
 * would hide a fault we need to see.
 */

/** Monday of the current week, in local date. */
/** Aujourd'hui, dans le fuseau du navigateur. Borne haute d'une naissance. */
function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function currentMonday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

/**
 * « week of 12 Aug » — une mesure sans sa date invite à la croire d'aujourd'hui.
 *
 * La date est rendue SÉPARÉMENT de la valeur, et pas concaténée avec elle: sur
 * une seule ligne, « 88 cm · week of 3 Aug » se lit comme un bloc où le chiffre
 * et sa fraîcheur ont le même poids. Ils ne l'ont pas — la valeur se lit d'un
 * coup d'œil, la date se lit quand on se demande si elle est encore vraie.
 */
function weekLabel(weekStart: string): string {
  const day = formatDate(weekStart, { year: false });
  return day === weekStart ? weekStart : t("plan.measures.week_of", { date: day });
}

/**
 * LE JOUR D'UNE MESURE — « 7 Aug », et pas « week of 3 Aug ».
 *
 * FF-031: la granularité de stockage n'est plus la semaine, donc la date
 * affichée n'a plus de raison de l'être. Rend `null` quand on ne connaît pas le
 * jour, et l'appelant retombe alors sur le libellé de semaine — dire « lundi »
 * d'une pesée du vendredi était précisément le défaut.
 */
function dayLabel(localDate: string | null): string | null {
  if (!localDate) return null;
  const day = formatDate(localDate, { year: false });
  return day === localDate ? null : day;
}

/**
 * LES MESURES DE CETTE DIRECTION-LÀ.
 *
 * Trois blocs, et le premier est le seul obligatoire:
 *   1. ce que l'élève a saisi, DATÉ, avec la tendance quand il y a de quoi;
 *   2. la cible — seulement pour les dynamiques qui en ont une;
 *   3. la mise à jour, qui passe par le formulaire (voir `saveMeasures`).
 *
 * Ce composant ne DÉCIDE rien: `indicatorFor` et `readIndicator` décident, et
 * ils sont testés sans React (`bodyMeasures.int.test.ts`). Ici il n'y a que de
 * l'affichage — c'est ce qui permet à la règle « poids ↑ = victoire en prise
 * de masse » d'être la même à l'écran et dans le générateur.
 */
/**
 * CE QUE CETTE DYNAMIQUE VISE — un chiffre, ou un axe, jamais les deux.
 *
 * ── POURQUOI C'EST DANS L'OPTION ET PLUS DANS UN ENCADRÉ EN DESSOUS ───────
 * Ça vivait dans un bloc « What this goal tracks » posé sous la liste des six
 * dynamiques. Deux défauts, et le second est le vrai:
 *
 *   1. la question n'était pas rattachée visuellement à ce qui la déclenche —
 *      on choisit « perdre du poids » en haut, et le champ du poids visé
 *      apparaît ailleurs, dans un cadre qui a son propre titre;
 *   2. ce bloc CHANGEAIT DE CONTENU selon l'option cochée sans qu'on regarde
 *      au bon endroit. Cocher « Eat better » remplaçait le champ de poids par
 *      un menu d'axes, en dehors du champ de vision de qui vient de cliquer.
 *
 * La cible appartient à la dynamique: elle apparaît AVEC elle, à l'endroit
 * où on vient d'appuyer, et disparaît avec elle.
 */
function GoalTargetField(props: {
  goal: GoalToken;
  reviews: ReviewRow[];
  target: string;
  onTargetChange: (v: string) => void;
  axis: string;
  onAxisChange: (v: string) => void;
  /** Le plancher TCA: aucun chiffre à VISER pour un élève signalé. */
  restricted: boolean;
}) {
  const indicator = indicatorFor(props.goal);
  const targetUnit: MessageKey = indicator.target === "waist" ? "unit.cm" : "unit.kg";
  const targetLabel = t(
    indicator.target === "band"
      ? "plan.goal.target_band"
      : indicator.target === "waist"
      ? "plan.goal.target_waist"
      : "plan.goal.target_weight",
  );
  const axis = props.axis && (FOCUS_AXES as readonly string[]).includes(props.axis)
    ? axisReading(props.reviews, props.axis as FocusAxis)
    : null;

  // LE PLANCHER MORD ICI AUSSI, et pas seulement sur les mesures.
  // Il couvrait l'encadré entier; en éclatant l'encadré, la cible se serait
  // retrouvée dehors — c'est-à-dire un champ « poids que je vise » remis sous
  // les yeux de la personne que la garde protège. L'AXE, lui, reste: ce n'est
  // pas un nombre à atteindre, c'est ce qu'on veut voir s'améliorer.
  if (indicator.target !== null && props.restricted) return null;

  if (indicator.target !== null) {
    return (
      <div className="mt-3">
        <label htmlFor="goal-target" className="block text-label font-semibold uppercase text-ink-soft">
          {targetLabel}
        </label>
        {/* Un champ étroit avec son unité collée: trois chiffres dans une
            boîte pleine largeur donnent l'impression d'attendre une phrase. */}
        {/* LA LARGEUR EST SUR UN CONTENEUR, PAS SUR L'INPUT.
            `inputClass` porte `w-full`, et `w-full` gagne contre `w-24` quel
            que soit l'ordre dans l'attribut `class` — c'est l'ordre du CSS
            généré par Tailwind qui tranche, pas celui qu'on écrit. Le
            `${inputClass} w-24` d'avant était donc un no-op: mesuré, ce champ
            faisait 606 px au lieu de 96. */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="w-24">
            <input
              id="goal-target"
              className={inputClass}
              inputMode="decimal"
              value={props.target}
              placeholder="—"
              onChange={(e) => props.onTargetChange(e.target.value)}
            />
          </div>
          <span className="text-sm text-ink-soft">{t(targetUnit)}</span>
          <span className="text-xs text-ink-soft">{t("plan.goal.optional")}</span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-ink-soft">
          {t("plan.goal.target_hint")}
        </p>
      </div>
    );
  }

  // L'AXE, pour les deux dynamiques qu'aucun chiffre ne porte. Les six valeurs
  // sont celles du point du dimanche: l'objectif est mesurable sans une seule
  // saisie de plus.
  return (
    <div className="mt-3">
      <label htmlFor="goal-axis" className="block text-label font-semibold uppercase text-ink-soft">
        {t("plan.goal.axis_label")}
      </label>
      <select
        id="goal-axis"
        className={`${inputClass} mt-1`}
        value={props.axis}
        onChange={(e) => props.onAxisChange(e.target.value)}
      >
        <option value="">{t("plan.goal.axis_none")}</option>
        {FOCUS_AXES.map((a) => (
          <option key={a} value={a}>{focusAxisLabel(a)}</option>
        ))}
      </select>
      <p className="mt-1.5 text-xs leading-5 text-ink-soft">
        {t("plan.goal.axis_hint")}
      </p>
      {axis ? (
        <p className="mt-2 text-sm text-ink">
          {axis.latest === null
            ? t("plan.goal.axis_unrated")
            : axis.trend === "unknown"
            ? t("plan.goal.axis_last_sunday", { value: axis.latest.value })
            : t(
              axis.improving
                ? "plan.goal.axis_rising"
                : axis.trend === "falling"
                ? "plan.goal.axis_falling"
                : "plan.goal.axis_steady",
              { axis: axis.label },
            )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * LES TROIS FAITS QUI NE BOUGENT PAS. Vides = jamais renseignés.
 *
 * `birthDate` et pas `age`: l'âge se déduit et se périme, la date non. Stocker
 * l'âge obligerait à le corriger chaque année, ce que personne ne fait — après
 * quoi le générateur compose pour quelqu'un qui a trois ans de moins.
 */
export interface Basics {
  height: string;
  birthDate: string;
  gender: string;
}

/** L'âge en années révolues, ou `null`. Dérivé, jamais stocké. */
function ageFrom(birthDate: string): number | null {
  const b = birthDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const d = new Date(`${b}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years -= 1;
  return years >= 0 && years < 130 ? years : null;
}

/**
 * LE DUO SAVE/CANCEL D'UNE CELLULE — écrit une fois pour les cinq.
 *
 * Cinq copies du même couple de boutons, c'est cinq endroits où l'un peut
 * cesser d'être désactivé pendant une écriture. Le composant porte la règle:
 * on n'enregistre pas deux cellules à la fois.
 */
function CellActions(
  { busy, disabled, onSave, onCancel }: {
    busy: boolean;
    disabled: boolean;
    onSave: () => void;
    onCancel: () => void;
  },
) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button onClick={onSave} disabled={disabled} variant="secondary">
        {busy ? t("plan.busy") : t("plan.save")}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-fig-700 underline underline-offset-2 hover:text-fig-800"
      >
        {t("plan.cancel")}
      </button>
    </div>
  );
}

/** Les trois valeurs que la base accepte (`profiles_gender_check`). */
const GENDER_VALUES = ["female", "male", "other"] as const;

/** Une FONCTION: une table de module se figerait à la langue du démarrage. */
function genderOptions(): Array<{ value: string; label: string }> {
  return GENDER_VALUES.map((value) => ({
    value,
    label: t(`plan.gender.${value}` as MessageKey),
  }));
}

/**
 * TES INFOS DE BASE — la section qui n'existait pas, et la taille qui
 * n'existait nulle part.
 *
 * ── POURQUOI ELLE EST À PART, ET EN HAUT ──────────────────────────────────
 * La taille et le poids ne sont pas des propriétés d'un OBJECTIF: ce sont des
 * propriétés d'un CORPS. Elles ne changent pas quand on passe de « perdre du
 * poids » à « mieux manger », et elles servent à la même chose dans les deux
 * cas — poser les portions. Les ranger sous l'objectif faisait croire le
 * contraire, et les faisait disparaître pour les deux dynamiques qui n'ont pas
 * de cible chiffrée.
 *
 * ── LE PLANCHER TCA COUVRE CETTE SECTION, PAS LA TAILLE ───────────────────
 * `restriction_flag` retire le poids, le tour de taille et toute lecture de
 * tendance: c'est la garde de `CONTRACT.md`, et cet écran est le seul qui
 * propose de VISER un nombre. La taille reste: elle ne se vise pas, elle ne
 * bouge pas, et elle est nécessaire aux portions de quelqu'un qu'on continue
 * de nourrir.
 */
function PersonalNumbers(props: {
  goal: GoalToken;
  reviews: ReviewRow[];
  /**
   * FF-031 — les pesées DATÉES, source de vérité depuis ce chantier.
   * `reviews` reste passé: son `biofeedback` comble les semaines antérieures à
   * la reprise, et il porte les six axes, qui ne sont pas des mesures.
   */
  measures: BodyMeasureRow[];
  target: string;
  /**
   * LES TROIS FAITS DURABLES DE LA PERSONNE — taille, naissance, sexe.
   *
   * `draft` est ce qui est TAPÉ, `saved` ce qui est EN BASE. Le récapitulatif
   * ne lit que `saved`: un résumé qui afficherait « 180 cm » parce qu'on vient
   * de le taper dirait que le générateur connaît un chiffre que personne ne lui
   * a donné.
   */
  basics: Basics;
  savedBasics: Basics;
  onBasicsChange: (next: Basics) => void;
  /** Enregistre UN champ. Les trois ne se saisissent jamais ensemble. */
  onSaveBasic: (field: keyof Basics) => void;
  draft: { weight: string; waist: string };
  onDraftChange: (d: { weight: string; waist: string }) => void;
  onSaveMeasures: () => void;
  busy: string | null;
  restricted: boolean;
}) {
  const weights = weeklyMeasures({
    reviews: props.reviews,
    measures: props.measures,
    kind: "weight",
  });
  const waists = weeklyMeasures({
    reviews: props.reviews,
    measures: props.measures,
    kind: "waist",
  });
  // LE JOUR de la dernière pesée, quand on le connaît. L'écran affichait
  // « week of 3 Aug » sous une mesure du vendredi, parce que la case de
  // stockage était la semaine et que la date affichée l'était devenue aussi.
  const lastOn: Record<"weight" | "waist", string | null> = {
    weight: lastMeasuredOn(props.measures, "weight"),
    waist: lastMeasuredOn(props.measures, "waist"),
  };
  const indicator = indicatorFor(props.goal);
  // La conversion vit dans `targetValueOf`, PAS ici: `Number("")` vaut 0, et
  // un champ vide devenait une fourchette centrée sur zéro kilo.
  const targetNumber = targetValueOf(props.target, indicator.target);
  const reading = readIndicator({
    goal: props.goal,
    weights,
    waists,
    targetWeightKg: targetNumber,
  });
  const showsWaist = indicator.primary === "waist" || indicator.secondary === "waist";

  const weeksHeld = indicator.target === "band"
    ? weeksInsideBand(weights, targetNumber)
    : 0;

  /**
   * LA MESURE QUI PORTE L'OBJECTIF PASSE EN PREMIER.
   *
   * Le poids était toujours affiché en tête, y compris en recomposition — où
   * c'est le tour de taille qui décide et où le poids n'est là que pour dire
   * « il tient ». Mettre en premier ce qui compte le moins, c'est enseigner
   * l'inverse de ce que la carte explique juste au-dessus.
   */
  type MeasureCell = {
    which: "weight" | "waist";
    label: string;
    m: DatedMeasure | null;
    unit: string;
  };
  const measureCells: MeasureCell[] = [];
  const weightCell: MeasureCell = {
    which: "weight",
    label: t("plan.measures.weight"),
    m: reading.weight,
    unit: t("unit.kg"),
  };
  const waistCell: MeasureCell = {
    which: "waist",
    label: t("plan.measures.waist"),
    m: reading.waist,
    unit: t("unit.cm"),
  };
  if (indicator.primary === "waist") {
    measureCells.push(waistCell, weightCell);
  } else {
    measureCells.push(weightCell);
    if (showsWaist) measureCells.push(waistCell);
  }
  const recorded = measureCells.filter((r) => r.m !== null);

  /**
   * L'HISTORIQUE, DU PLUS RÉCENT AU PLUS ANCIEN.
   *
   * `weeklyMeasures` rend l'inverse (du plus ancien au plus récent) parce que
   * c'est ce dont les calculs de tendance ont besoin. Un tableau se lit dans
   * l'autre sens: la ligne du haut est celle d'aujourd'hui.
   *
   * L'écart est calculé contre la semaine PESÉE précédente, pas contre la ligne
   * du dessus: une semaine où seul le tour de taille a été saisi ne doit pas
   * faire un écart de poids de zéro.
   */
  const weekKeys = new Set<string>(weights.map((m) => m.weekStart));
  if (showsWaist) waists.forEach((m) => weekKeys.add(m.weekStart));
  const weeksDesc = [...weekKeys].sort().reverse();
  const weightByWeek = new Map(weights.map((m) => [m.weekStart, m.value]));
  const waistByWeek = new Map(waists.map((m) => [m.weekStart, m.value]));
  const history = weeksDesc.map((week, i) => {
    const w = weightByWeek.get(week) ?? null;
    let delta: number | null = null;
    if (w !== null) {
      for (let j = i + 1; j < weeksDesc.length; j += 1) {
        const older = weightByWeek.get(weeksDesc[j]);
        if (older !== undefined) {
          delta = Math.round((w - older) * 10) / 10;
          break;
        }
      }
    }
    return { week, weight: w, waist: waistByWeek.get(week) ?? null, delta };
  });

  /**
   * QUELLE MESURE EST EN COURS D'ÉDITION — une seule à la fois.
   *
   * ── LE DÉFAUT QUE ÇA CORRIGE ───────────────────────────────────────────
   * La section portait un bloc « Update » permanent avec deux à trois champs
   * VIDES en bas, sous le récapitulatif. Des cases vides en permanence sous des
   * chiffres déjà renseignés, ça occupe la moitié de la section pour un geste
   * qu'on fait une fois par semaine — et ça donne l'impression qu'il reste
   * quelque chose à remplir alors que tout est rempli.
   *
   * Chaque mesure porte donc son propre lien, et le champ n'existe que pendant
   * qu'on s'en sert.
   */
  const [editing, setEditing] = React.useState<
    null | "height" | "birthDate" | "gender" | "weight" | "waist"
  >(null);

  /**
   * L'ÉDITEUR SE FERME QUAND LA VALEUR ENREGISTRÉE A CHANGÉ SOUS LUI.
   *
   * Et pas au clic sur « Save »: `run()` avale les erreurs dans la bannière de
   * la page et ne rejette jamais, donc fermer sur le clic fermerait AUSSI sur
   * un échec — l'élève verrait sa saisie disparaître en croyant qu'elle est
   * passée. Ici, ce qui ferme est la preuve que l'écriture a eu lieu: la
   * relecture a rapporté autre chose. Même posture que `EatingRhythmCard`.
   */
  const savedPrint = [
    props.savedBasics.height.trim(),
    props.savedBasics.birthDate.trim(),
    props.savedBasics.gender.trim(),
    reading.weight?.value ?? "",
    reading.waist?.value ?? "",
  ].join("|");
  const [syncedFrom, setSyncedFrom] = React.useState(savedPrint);
  if (syncedFrom !== savedPrint) {
    setSyncedFrom(savedPrint);
    setEditing(null);
  }

  /** Le lien discret qui ouvre une cellule. Même forme pour les cinq. */
  const editLink = (
    which: "height" | "birthDate" | "gender" | "weight" | "waist",
    hasValue: boolean,
  ) => (
    <button
      type="button"
      onClick={() => {
        setEditing(which);
        // Rouvrir sur un brouillon abandonné ferait réenregistrer une valeur
        // que l'élève avait renoncé à poser.
        if (which === "weight" || which === "waist") {
          props.onDraftChange({ ...props.draft, [which]: "" });
        } else {
          props.onBasicsChange({ ...props.savedBasics });
        }
      }}
      className="mt-1 block text-xs font-medium text-fig-700 underline underline-offset-2 hover:text-fig-800"
    >
      {t(hasValue ? "plan.change" : "plan.add")}
    </button>
  );

  return (
    <div className="space-y-4">
      {/*
        ── CINQ CELLULES, UN SEUL GROUPE ──────────────────────────────────
        Taille, naissance, sexe, poids, tour de taille: cinq faits que l'élève
        donne sur lui-même. Les séparer ferait plusieurs blocs là où il n'y a
        qu'une question.

        Que les trois premiers vivent sur `profiles` et les deux derniers dans
        `weekly_reviews` est une différence de PLOMBERIE. Elle n'a aucune raison
        de se voir à l'écran.

        LES TROIS PREMIERS SURVIVENT AU PLANCHER TCA: ils ne se visent pas, ils
        ne bougent pas, et ils sont nécessaires aux portions de quelqu'un qu'on
        continue de nourrir. Les deux derniers montent et descendent, et cet
        écran est le seul qui propose d'en viser un.
      */}
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {/* LA TAILLE */}
        <div className="min-w-[7rem]">
          <p className="text-label font-semibold uppercase text-ink-soft">{t("plan.measures.height")}</p>
          {editing === "height" ? (
            <div className="mt-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* Largeur sur le conteneur — voir `GoalTargetField`. */}
                <div className="w-20">
                  <input
                    id="profile-height"
                    className={inputClass}
                    inputMode="decimal"
                    autoFocus
                    value={props.basics.height}
                    placeholder="—"
                    onChange={(e) =>
                      props.onBasicsChange({ ...props.basics, height: e.target.value })}
                  />
                </div>
                <span className="text-sm text-ink-soft">{t("unit.cm")}</span>
              </div>
              <CellActions
                busy={props.busy === "basics"}
                disabled={props.busy !== null}
                onSave={() => props.onSaveBasic("height")}
                onCancel={() => {
                  props.onBasicsChange({ ...props.savedBasics });
                  setEditing(null);
                }}
              />
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold leading-tight text-ink">
                {props.savedBasics.height.trim()
                  ? (
                    <>
                      {props.savedBasics.height.trim()}
                      <span className="ml-1 text-sm font-normal text-ink-soft">
                        {t("unit.cm")}
                      </span>
                    </>
                  )
                  : <span className="text-ink-soft">—</span>}
              </p>
              {editLink("height", props.savedBasics.height.trim() !== "")}
            </>
          )}
        </div>

        {/* L'ÂGE, DÉRIVÉ DE LA DATE. On AFFICHE l'âge — c'est ce qui parle et
            ce dont la composition a besoin — et on SAISIT la date, qui ne se
            périme pas. Stocker l'âge obligerait à le corriger chaque année. */}
        <div className="min-w-[7rem]">
          <p className="text-label font-semibold uppercase text-ink-soft">{t("plan.measures.age")}</p>
          {editing === "birthDate" ? (
            <div className="mt-1">
              <input
                id="profile-birth-date"
                type="date"
                className={inputClass}
                autoFocus
                max={todayIso()}
                value={props.basics.birthDate}
                onChange={(e) =>
                  props.onBasicsChange({ ...props.basics, birthDate: e.target.value })}
              />
              <CellActions
                busy={props.busy === "basics"}
                disabled={props.busy !== null}
                onSave={() => props.onSaveBasic("birthDate")}
                onCancel={() => {
                  props.onBasicsChange({ ...props.savedBasics });
                  setEditing(null);
                }}
              />
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold leading-tight text-ink">
                {ageFrom(props.savedBasics.birthDate) !== null
                  ? ageFrom(props.savedBasics.birthDate)
                  : <span className="text-ink-soft">—</span>}
              </p>
              {props.savedBasics.birthDate.trim() && (
                <p className="text-xs text-ink-soft">
                  {props.savedBasics.birthDate.trim()}
                </p>
              )}
              {editLink("birthDate", props.savedBasics.birthDate.trim() !== "")}
            </>
          )}
        </div>

        {/* LE SEXE — liste fermée, celle que la base accepte
            (`profiles_gender_check`). Un champ libre ici produirait des valeurs
            que le CHECK refuse, donc une erreur SQL que personne ne sait lire. */}
        <div className="min-w-[7rem]">
          <p className="text-label font-semibold uppercase text-ink-soft">{t("plan.measures.sex")}</p>
          {editing === "gender" ? (
            <div className="mt-1">
              <select
                id="profile-gender"
                className={inputClass}
                autoFocus
                value={props.basics.gender}
                onChange={(e) =>
                  props.onBasicsChange({ ...props.basics, gender: e.target.value })}
              >
                <option value="">—</option>
                {genderOptions().map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
              <CellActions
                busy={props.busy === "basics"}
                disabled={props.busy !== null}
                onSave={() => props.onSaveBasic("gender")}
                onCancel={() => {
                  props.onBasicsChange({ ...props.savedBasics });
                  setEditing(null);
                }}
              />
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold leading-tight text-ink">
                {genderOptions().find((g) => g.value === props.savedBasics.gender)?.label ??
                  <span className="text-ink-soft">—</span>}
              </p>
              {editLink("gender", props.savedBasics.gender.trim() !== "")}
            </>
          )}
        </div>

        {/* LE PLANCHER TCA — ces deux-là sont des nombres qui montent et
            descendent, et cet écran est le seul qui propose d'en viser un. */}
        {props.restricted ? null : measureCells.map((cell) => (
          <div key={cell.which} className="min-w-[7rem]">
            <p className="text-label font-semibold uppercase text-ink-soft">{cell.label}</p>
            {editing === cell.which ? (
              <div className="mt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-20">
                    <input
                      id={`measure-${cell.which}`}
                      className={inputClass}
                      inputMode="decimal"
                      autoFocus
                      value={props.draft[cell.which]}
                      placeholder="—"
                      onChange={(e) =>
                        props.onDraftChange({ ...props.draft, [cell.which]: e.target.value })}
                    />
                  </div>
                  <span className="text-sm text-ink-soft">{cell.unit}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={props.onSaveMeasures}
                    disabled={props.busy !== null}
                    variant="secondary"
                  >
                    {props.busy === "measures" ? t("plan.busy") : t("plan.save")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      props.onDraftChange({ ...props.draft, [cell.which]: "" });
                      setEditing(null);
                    }}
                    className="text-xs text-fig-700 underline underline-offset-2 hover:text-fig-800"
                  >
                    {t("plan.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-lg font-semibold leading-tight text-ink">
                  {cell.m === null
                    ? <span className="text-ink-soft">—</span>
                    : (
                      <>
                        {cell.m.value}
                        <span className="ml-1 text-sm font-normal text-ink-soft">
                          {cell.unit}
                        </span>
                      </>
                    )}
                </p>
                {/* La date sous la valeur, toujours: « 78 kg » ne dit rien,
                    « 78 kg il y a trois semaines » dit quelque chose. */}
                {cell.m ? (
                  <p className="text-xs text-ink-soft">
                    {/* Le JOUR quand la table datée le connaît, le libellé de
                        semaine sinon — pour une mesure d'avant la reprise, la
                        semaine est la seule chose vraie qu'on puisse dire. */}
                    {dayLabel(lastOn[cell.which]) ?? weekLabel(cell.m.weekStart)}
                  </p>
                ) : null}
                {editLink(cell.which, cell.m !== null)}
              </>
            )}
          </div>
        ))}
      </div>

      {/* La phrase n'apparaît QUE pendant la saisie: elle explique où va le
          chiffre, ce qui n'intéresse personne le reste du temps. */}
      {!props.restricted && (editing === "weight" || editing === "waist") ? (
        <p className="text-xs leading-5 text-ink-soft">
          {t("plan.measures.since_sunday")}
        </p>
      ) : null}

      {props.restricted ? null : (
      <>
      {recorded.length === 0 ? (
        // ÉTAT VIDE NON HONTEUX, ET QUI DIT D'OÙ VIENNENT LES CHIFFRES.
        <p className="text-sm text-ink-soft">
          {t("plan.measures.none_yet")}
        </p>
      ) : (
        <div>
          {reading.sentence ? (
            <p className="text-sm text-ink">{reading.sentence}</p>
          ) : (
            <p className="text-xs leading-5 text-ink-soft">
              {t("plan.measures.one_more")}
            </p>
          )}

          {/*
            TROIS ÉTATS, ET LE TROISIÈME MANQUAIT.

            « Tu es sorti de ta fourchette » suppose une fourchette. Sans
            référence saisie, `insideBand` vaut `null` et on ne conclut RIEN —
            on dit ce qui manque pour pouvoir conclure. Le cas est fréquent:
            c'est celui de tout élève qui vient de choisir « Hold what I have »
            et n'a pas encore posé son poids de référence.
          */}
          {indicator.target === "band" && targetNumber === null ? (
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              {t("plan.measures.band_unset")}
            </p>
          ) : weeksHeld > 0 ? (
            <p className="mt-1 text-sm text-ink">
              {plural(
                weeksHeld,
                t("plan.measures.weeks_in_range_one", { count: weeksHeld }),
                t("plan.measures.weeks_in_range_many", { count: weeksHeld }),
              )}
            </p>
          ) : reading.insideBand === false ? (
            <p className="mt-1 text-sm text-ink">
              {t("plan.measures.drifted")}
            </p>
          ) : null}
        </div>
      )}

      {/*
        ── L'HISTORIQUE ────────────────────────────────────────────────────
        Une phrase de tendance dit une direction; elle ne montre pas le chemin.
        « Tu as perdu du poids » et douze semaines de chiffres ne se lisent pas
        pareil, et c'est le second qu'on vient chercher quand on doute.

        À PARTIR DE DEUX LIGNES: un tableau d'une ligne est un chiffre déjà
        affiché juste au-dessus, avec une bordure autour.

        AUCUNE COULEUR SUR L'ÉCART, et c'est une règle produit, pas un oubli.
        Du vert sur −0,4 kg et du rouge sur +0,4 serait une NOTE — exactement ce
        que « nothing counts down, and nobody is scored against it » refuse deux
        sections plus haut. Le signe suffit à lire le sens.
      */}
      {history.length >= 2 ? (
        <div>
          <p className="text-label font-semibold uppercase text-ink-soft">
            {t("plan.measures.week_by_week")}
          </p>
          {/* Le tableau défile DANS son conteneur: à 320 px, trois colonnes
              chiffrées débordent, et c'est la page entière qui partirait de
              travers. */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[18rem] text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left text-xs text-ink-soft">
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    {t("plan.measures.col_week")}
                  </th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    {t("plan.measures.weight")}
                  </th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    {t("plan.measures.col_change")}
                  </th>
                  {showsWaist ? (
                    <th scope="col" className="py-1.5 font-medium">
                      {t("plan.measures.waist")}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.week} className="border-b border-line last:border-0">
                    <th
                      scope="row"
                      className="whitespace-nowrap py-1.5 pr-3 text-left font-normal text-ink-soft"
                    >
                      {formatDate(h.week, { year: false })}
                    </th>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-ink">
                      {h.weight === null
                        ? <span className="text-ink-soft">—</span>
                        : `${h.weight} ${t("unit.kg")}`}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-ink-soft">
                      {h.delta === null
                        ? <span className="text-ink-soft">—</span>
                        : h.delta === 0
                        ? "="
                        : `${h.delta > 0 ? "+" : ""}${h.delta.toFixed(1)}`}
                    </td>
                    {showsWaist ? (
                      <td className="whitespace-nowrap py-1.5 text-ink">
                        {h.waist === null
                          ? <span className="text-ink-soft">—</span>
                          : `${h.waist} ${t("unit.cm")}`}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      </>
      )}
    </div>
  );
}

export default function StudentWeekPlanPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [goal, setGoal] = React.useState<GoalRow | null>(null);
  /**
   * LE FOYER, ET CE QUE LA MAISON SERT — les trois blocs venus de `/app/household`.
   *
   * ⚠️ ILS SONT LUS À PART, ET UNE PANNE ICI NE DOIT PAS EMPORTER LE PLAN.
   * Un foyer illisible laisse ces trois états à `null`, donc trois cartes qui
   * se taisent; la semaine, elle, s'affiche. L'inverse — jeter la page entière
   * parce qu'une carte annexe n'a pas pu se lire — ferait payer au chemin
   * MAJORITAIRE (le compte individuel, qui n'a pas de foyer du tout) le prix
   * d'une lecture qui ne le concerne pas.
   */
  const [household, setHousehold] = React.useState<HouseholdView | null>(null);
  const [householdMeal, setHouseholdMeal] = React.useState<
    HouseholdMealView | null
  >(null);
  const [isOwner, setIsOwner] = React.useState(false);
  const [referenceBusy, setReferenceBusy] = React.useState(false);
  // `situation` a disparu du formulaire — voir le commentaire de `saveGoal`.
  const [goalDraft, setGoalDraft] = React.useState({
    goal: "health",
    aspiration: "",
    target: "",
    axis: "",
  });
  /**
   * La taille, lue et écrite sur `profiles` — pas sur `student_goals`.
   *
   * DEUX ÉTATS, ET C'EST LA RÈGLE DE LA MAISON. `height` est ce qui est TAPÉ,
   * `heightSaved` ce qui est EN BASE. Le récapitulatif et la carte de la page
   * lisent le second: un résumé qui afficherait « 180 cm » parce qu'on vient de
   * le taper — sans avoir enregistré — dirait que le générateur connaît un
   * chiffre que personne ne lui a donné. `EatingRhythmCard` tient déjà cette
   * distinction, avec son avertissement « changed but not saved ».
   */
  const [basics, setBasics] = React.useState<Basics>({
    height: "",
    birthDate: "",
    gender: "",
  });
  const [savedBasics, setSavedBasics] = React.useState<Basics>({
    height: "",
    birthDate: "",
    gender: "",
  });
  /**
   * LA CARTE SE REPLIE — même règle que l'interview de doctrine côté coach.
   *
   * Ouverte quand il n'y a RIEN d'écrit (c'est alors la seule porte), repliée
   * dès qu'un objectif existe. Un formulaire de six cases déplié en permanence
   * au-dessus du plan donne l'impression qu'il reste quelque chose à remplir,
   * et repousse vers le bas la seule chose que l'élève vient voir: sa semaine.
   */
  /**
   * LA FENÊTRE DE RÉGLAGES — les quatre questions au même endroit.
   *
   * ── LE DÉFAUT QUE ÇA CORRIGE ──────────────────────────────────────────
   * Quatre cartes empilées entre le titre de la page et les repas: l'objectif,
   * le rythme, la cuisine, ce qu'on a retenu de la conversation. Chacune avec
   * son propre lien « Change », son propre repli, son propre « Save ». Quatre
   * endroits pour une seule chose — se décrire — et il fallait faire défiler
   * l'écran entier avant d'atteindre ce qu'on venait voir: sa semaine.
   *
   * Mesuré en vrai: quelqu'un est arrivé sur cette page et n'a pas compris ce
   * qu'on lui demandait. Ce n'est pas un défaut de copie dans une carte, c'est
   * la dispersion elle-même.
   *
   * La page ne garde donc plus qu'UN résumé et UN bouton. Le reste est dans une
   * fenêtre, en quatre sections colorées.
   */
  const [setupOpen, setSetupOpen] = React.useState(false);
  /** L'ouverture automatique n'a lieu qu'une fois — voir `refresh`. */
  const openedOnce = React.useRef(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [reviews, setReviews] = React.useState<ReviewRow[]>([]);
  // FF-031 — les pesées datées. Séparées de `reviews` et pas fusionnées dedans:
  // `reviews` porte aussi les six axes de vivabilité, qui ne sont pas des
  // mesures corporelles et n'ont rien à faire dans la même liste.
  const [measures, setMeasures] = React.useState<BodyMeasureRow[]>([]);
  /**
   * LE PLANCHER TCA. `weekly_reviews.risk_band = 'restriction_flag'` ⇒ la carte
   * des mesures n'existe pas pour cet élève cette semaine.
   *
   * Ce n'est pas une préférence d'affichage. `/app/progress` masque déjà tous
   * ses chiffres et le point du dimanche ne lui demande même pas son poids
   * (`decideWeeklyFlow`, garde n°3). Laisser CET écran-ci lui mettre un poids
   * cible sous les yeux rouvrirait par la fenêtre ce que deux autres surfaces
   * ferment — et c'est la surface la plus dangereuse des trois, puisque c'est
   * la seule qui propose de VISER un nombre.
   */
  const [restricted, setRestricted] = React.useState(false);
  const [measureDraft, setMeasureDraft] = React.useState({ weight: "", waist: "" });

  const weekStart = currentMonday();

  /**
   * CE QUE LA MAISON SERT — relu à part du plan, et à part de `refresh()`.
   *
   * ⚠️ IL EST APPELÉ APRÈS UNE COMPOSITION DU FOYER, pas seulement au montage.
   * « À table » est écrit par la MÊME génération que le plan mais se lit par
   * une autre requête: sans ce rappel, le maître verrait son plan neuf au-dessus
   * de parts périmées, et rien ne dirait lesquelles sont fausses.
   *
   * ⚠️ `loadHouseholdMeal` FILTRE `plan_kind='household'`. Sans ce filtre, le
   * plan PERSONNEL d'un secondaire — qui porte pourtant un `household_id`, et
   * exprès, pour que la fusion le retrouve — viderait cette carte dès qu'il
   * commence plus tard. C'est mesuré, et c'est le piège n°1 de ce domaine:
   * `household_id is not null` ne veut PAS dire « plan du foyer ».
   */
  const refreshHousehold = React.useCallback(async (uid: string) => {
    try {
      const place = await loadMyHouseholdPlace(uid);
      setIsOwner(place.isOwner);
      if (!place.inHousehold) {
        setHousehold(null);
        setHouseholdMeal(null);
        return;
      }
      setHousehold(await loadHousehold(uid));
      setHouseholdMeal(await loadHouseholdMeal(browserLocalDate()));
    } catch {
      // Trois cartes qui se taisent, et une semaine qui s'affiche quand même.
      setHousehold(null);
      setHouseholdMeal(null);
    }
  }, []);

  const refresh = React.useCallback(async () => {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) throw new Error("not_signed_in");
    void refreshHousehold(uid);

    // ── `user_id` SUR CHAQUE LECTURE, ET RLS N'EN DISPENSE PAS ──────────────
    // Deux de ces trois tables portent une policy COACH en plus de celle du
    // propriétaire (`student_goals_select_coach`, `weekly_reviews_select_coach`),
    // et les policies s'additionnent. Sans `user_id`, cette page rendait donc à
    // quelqu'un qui est À LA FOIS coach et mangeur — le parent qui pilote le
    // foyer — les lignes de ses élèves mélangées aux siennes:
    //
    //   · `student_goals` — un coach avec UN élève et pas de ligne à lui
    //     recevait la ligne de l'élève. Les trois cartes affichaient le rythme
    //     de quelqu'un d'autre, `hasGoal` passait à vrai, et le Save d'à côté
    //     écrivait sur `user_id = <lui>`: zéro ligne touchée, 204, « Saved ».
    //     Avec deux élèves ou plus, `maybeSingle()` renvoyait PGRST116 et la
    //     page ne s'ouvrait plus du tout.
    //   · `weekly_reviews` — le tri par date mélangeait les corps, et `rows[0]`
    //     pouvait être la revue d'un élève. Le PLANCHER TCA juste au-dessus se
    //     calcule là-dessus: mesuré, un coach dont le drapeau courant est
    //     `restriction_flag` lisait le `watch` de son élève et retrouvait sous
    //     les yeux la carte qui propose de VISER un poids.
    //
    // `student_week_plans` n'a pas de policy coach aujourd'hui. Elle est scopée
    // pareil: ce qui protège cette page ne doit pas dépendre de la liste des
    // policies d'une table voisine, qui change sans que ce fichier soit relu.
    const [planRes, goalRes, reviewRes, measureRes, profileRes] = await Promise.all([
      supabase
        .from("student_week_plans")
        .select("id, week_start, items, status, adopted_at")
        .eq("user_id", uid)
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase
        .from("student_goals")
        .select(
          "goal, situation, aspiration, focus_axis, target_weight_kg, " +
            "target_waist_cm, practical_constraints",
        )
        .eq("user_id", uid)
        .maybeSingle(),
      // Douze semaines: assez pour une tendance lisible, assez court pour que
      // « les dernières semaines » veuille encore dire quelque chose.
      supabase
        .from("weekly_reviews")
        .select("week_start_date, biofeedback, outcomes, risk_band")
        .eq("user_id", uid)
        .order("week_start_date", { ascending: false })
        .limit(12),
      // FF-031 — les pesées DATÉES. Scopées sur `user_id` pour la même raison
      // que leurs voisines: la policy coach s'additionne à celle du
      // propriétaire, et sans ce filtre un parent qui pilote le foyer lirait la
      // courbe de son élève à la place de la sienne.
      //
      // La même fenêtre que les bilans: douze semaines, bornées sur le LUNDI
      // pour que les deux requêtes couvrent exactement les mêmes semaines. Une
      // fenêtre plus large ici ferait apparaître dans le tableau des semaines
      // que la tendance juste au-dessus ne regarde pas.
      supabase
        .from("student_body_measures")
        .select("local_date, kind, value_si, measured_at")
        .eq("user_id", uid)
        .gte("local_date", addDays(weekStart, -7 * 11))
        .order("local_date", { ascending: true })
        .order("measured_at", { ascending: true })
        .order("id", { ascending: true }),
      // LA TAILLE VIT SUR `profiles`, pas sur `student_goals`: c'est une
      // propriété de la personne, à côté de `birth_date` et `gender`.
      supabase.from("profiles").select("height_cm, birth_date, gender").eq("id", uid)
        .maybeSingle(),
    ]);
    // Fail loud: "you have no plan yet" and "we could not read it" are two
    // different sentences, and showing the first for the second invites the
    // student to regenerate over the top of something that exists.
    if (planRes.error) throw new Error(planRes.error.message);
    if (goalRes.error) throw new Error(goalRes.error.message);
    if (reviewRes.error) throw new Error(reviewRes.error.message);
    if (measureRes.error) throw new Error(measureRes.error.message);
    if (profileRes.error) throw new Error(profileRes.error.message);

    const g = (goalRes.data ?? null) as GoalRow | null;
    setGoal(g);
    if (g) {
      const kind = indicatorFor(g.goal as GoalToken).target;
      const current = kind === "waist" ? g.target_waist_cm : g.target_weight_kg;
      setGoalDraft({
        goal: g.goal,
        aspiration: g.aspiration ?? "",
        target: current === null || current === undefined ? "" : String(current),
        axis: g.focus_axis ?? "",
      });
    }
    const prof = (profileRes.data ?? {}) as {
      height_cm?: number | null;
      birth_date?: string | null;
      gender?: string | null;
    };
    const loaded: Basics = {
      height: prof.height_cm === null || prof.height_cm === undefined
        ? ""
        : String(prof.height_cm),
      birthDate: (prof.birth_date ?? "").slice(0, 10),
      gender: prof.gender ?? "",
    };
    setSavedBasics(loaded);
    // Le brouillon suit ce qui est relu: après un enregistrement, les deux
    // coïncident et l'éditeur de la cellule se referme (voir `savedPrint`).
    setBasics(loaded);
    // RIEN D'ÉCRIT => LA FENÊTRE S'OUVRE D'ELLE-MÊME. C'est le premier passage,
    // un élève sans objectif ne peut rien générer, et personne ne clique sur un
    // bouton pour découvrir une question qu'il ignore.
    //
    // À l'ouverture SEULEMENT, et pas à chaque `refresh()`: une sauvegarde dans
    // la fenêtre rappelle `refresh`, et rouvrir sur cette relecture ferait
    // resurgir la fenêtre que l'élève vient de fermer.
    if (!g && !openedOnce.current) {
      openedOnce.current = true;
      setSetupOpen(true);
    }

    const rows = (reviewRes.data ?? []) as Array<ReviewRow & { risk_band?: string }>;
    // La ligne la plus récente décide: la garde est un ÉTAT courant, pas un
    // antécédent. Un drapeau levé il y a deux mois et retombé depuis ne doit
    // pas retirer l'écran à quelqu'un qui va bien maintenant.
    setRestricted(rows[0]?.risk_band === "restriction_flag");
    setReviews(rows);
    setMeasures((measureRes.data ?? []) as BodyMeasureRow[]);
  }, [weekStart, refreshHousehold]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setState({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  /**
   * CE QUE LA CARTE REPLIÉE DIT, en une ligne.
   *
   * Ce qu'il VISE d'abord (une cible, un axe), son aspiration ensuite. Pas les
   * mesures: elles vivent dans le bloc dépliable, et les résumer ici mettrait
   * un poids sous les yeux d'un élève à chaque chargement de la page — c'est
   * précisément ce que la garde restrictive existe pour éviter, et elle ne
   * couvrirait pas ce résumé-ci.
   */
  const goalSummary = React.useMemo(() => {
    if (!goal) return null;
    const parts: string[] = [];
    const kind = indicatorFor(goal.goal as GoalToken).target;
    // ── LE PLANCHER TCA COUVRE AUSSI CE RÉSUMÉ ────────────────────────────
    // Trou mesuré le 2026-08-07: la garde retirait le CHAMP « poids que je
    // vise », et ce résumé continuait d'afficher « aiming for 95 kg » juste
    // au-dessus. Le nombre restait donc sous les yeux de la personne que la
    // garde protège — sans même le moyen de l'effacer, puisque le champ pour
    // le changer avait disparu.
    //
    // L'axe et l'aspiration restent: ni l'un ni l'autre n'est un poids.
    if (!restricted) {
      if (kind === "waist" && goal.target_waist_cm !== null) {
        parts.push(
          t("plan.summary.aiming_waist", { value: goal.target_waist_cm }),
        );
      } else if (kind === "band" && goal.target_weight_kg !== null) {
        parts.push(
          t("plan.summary.staying_around", { value: goal.target_weight_kg }),
        );
      } else if (kind !== null && goal.target_weight_kg !== null) {
        parts.push(
          t("plan.summary.aiming_weight", { value: goal.target_weight_kg }),
        );
      }
    }
    if (goal.focus_axis && (FOCUS_AXES as readonly string[]).includes(goal.focus_axis)) {
      // ⚠️ PLUS DE `.toLowerCase()` ICI, ET C'EST LA COUTURE QUE LE LOT RETIRE.
      // La phrase était « working on ${label.toLowerCase()} » — un gabarit
      // anglais autour d'une étiquette d'une TROISIÈME table locale. Baisser la
      // casse d'un mot ne le traduit pas, et « travailler sur la qualité du
      // sommeil » ne se compose pas comme son équivalent anglais. La phrase a sa
      // clé, l'étiquette vient du seed.
      parts.push(
        t("plan.goal.working_on", {
          axis: focusAxisLabel(goal.focus_axis as FocusAxis),
        }),
      );
    }
    if (goal.aspiration) parts.push(t("plan.summary.quoted", { text: goal.aspiration }));
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [goal, restricted]);

  /**
   * LES QUATRE RÉSUMÉS D'UNE LIGNE — ce que la page montre à la place des
   * quatre cartes.
   *
   * Ils sont calculés ICI et pas dans les cartes: la page doit pouvoir dire ce
   * qui est réglé SANS monter les formulaires, sinon on n'a rien gagné. Chacun
   * rend `null` quand rien n'est écrit, et c'est un état à afficher — pas un
   * vide à masquer: « pas encore réglé » est précisément ce que l'élève doit
   * lire pour savoir qu'il reste quelque chose à faire.
   */
  // `useMemo` et pas une expression nue: `?? {}` fabrique un objet neuf à
  // chaque rendu, donc `preferencesSummary` (qui dépend de `pc` entier) se
  // recalculerait à chaque frappe de clavier de la page.
  const pc = React.useMemo(
    () => (goal?.practical_constraints ?? {}) as Record<string, unknown>,
    [goal],
  );

  const rhythmSummary = React.useMemo(() => {
    const slots = parseEatingRhythm(pc.eating_rhythm);
    if (slots.length === 0) return null;
    return slots
      .map((o) => {
        const label = mealCopy(`meals.slot.${o.slot}` as Parameters<typeof mealCopy>[0]);
        return o.size ? `${label} (${o.size})` : label;
      })
      .join(" · ");
  }, [pc.eating_rhythm]);

  /**
   * CE QUE LE DERNIER PLAN A DEMANDÉ — et plus « ce que tu peux cuisiner ».
   *
   * ⚠️ LA NUANCE EST TOUT, ET ELLE A CHANGÉ LE 2026-08-13. Les jours de cuisine
   * et la durée d'une session ne sont plus un réglage de profil: ce sont des
   * entrées de PLAN, posées sur l'écran qui compose. Ce qui s'affiche ici est
   * donc un RAPPEL de la dernière demande, pas un champ modifiable — et le
   * libellé le dit, sinon on cherche à l'éditer dans une carte qui ne le porte
   * plus.
   */
  const cookingSummary = React.useMemo(() => {
    const days = Array.isArray(pc.cook_days)
      ? (pc.cook_days as unknown[]).map(String)
      : [];
    if (days.length === 0) return null;
    const named = days.map((d) => dishDayLabel(d) ?? d).join(" · ");
    const minutes = Number(pc.cooking_time_min);
    return Number.isFinite(minutes) && minutes > 0
      ? `${named} · ${minutes} ${t("unit.min")}`
      : named;
  }, [pc.cook_days, pc.cooking_time_min]);

  const preferencesSummary = React.useMemo(() => {
    const kept = keptFrom(pc);
    if (kept.length === 0) return null;
    return plural(
      kept.length,
      t("plan.summary.kept_one", { count: kept.length }),
      t("plan.summary.kept_many", { count: kept.length }),
    );
  }, [pc]);

  /**
   * TES CHIFFRES, EN UNE LIGNE — la taille, puis le dernier poids.
   *
   * LE PLANCHER TCA VAUT AUSSI POUR LE RÉSUMÉ. Il est affiché sur la PAGE, hors
   * de la fenêtre: y laisser passer un poids remettrait sous les yeux d'un
   * élève signalé, à chaque chargement, exactement le nombre que la garde
   * retire à l'intérieur. La taille, elle, reste — elle ne se vise pas.
   */
  const personalSummary = React.useMemo(() => {
    const parts: string[] = [];
    if (savedBasics.height.trim()) {
      parts.push(`${savedBasics.height.trim()} ${t("unit.cm")}`);
    }
    if (!restricted) {
      // `latest()` et PAS `[0]`: `weeklyMeasures` rend du plus ANCIEN au plus
      // récent. Le `[0]` d'ici affichait donc le premier poids jamais saisi,
      // pendant que la section, elle, montrait le dernier — deux chiffres
      // différents pour la même chose, sur le même écran.
      const last = latest(
        weeklyMeasures({ reviews, measures, kind: "weight" }),
      );
      if (last) parts.push(`${last.value} ${t("unit.kg")}`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [savedBasics, reviews, measures, restricted]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /**
   * LA TAILLE — sur `profiles`, et seule de son espèce sur cet écran.
   *
   * `update` et pas `upsert`: la ligne `profiles` existe pour tout compte
   * authentifié (créée à l'inscription). `select()` derrière, pour la même
   * raison que `mergePracticalConstraints`: un update qui ne matche aucune
   * ligne répond 204 sans erreur, et l'écran dirait « enregistré » sur une
   * saisie partie nulle part.
   */
  /**
   * UN FAIT DURABLE, ÉCRIT SUR `profiles`.
   *
   * UN CHAMP À LA FOIS, et c'est le sens du paramètre: les trois cellules ne se
   * saisissent jamais ensemble, et écrire les trois à chaque Save renverrait en
   * base deux valeurs que l'élève n'a pas touchées — dont un brouillon
   * abandonné dans une cellule qu'il avait ouverte puis annulée.
   *
   * `update` et pas `upsert`: la ligne `profiles` existe pour tout compte
   * authentifié. `select()` derrière, pour la même raison que
   * `mergePracticalConstraints`: un update qui ne matche aucune ligne répond
   * 204 sans erreur, et l'écran dirait « enregistré » sur une saisie partie
   * nulle part.
   */
  const saveBasic = (field: keyof Basics) =>
    run("basics", async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("not_signed_in");

      // VIDER UN CHAMP L'EFFACE — c'est un geste légitime (on s'est trompé),
      // et le seul moyen de le faire sans un bouton de plus.
      const patch: Record<string, unknown> = {};
      if (field === "height") {
        const raw = basics.height.trim();
        if (raw === "") patch.height_cm = null;
        else {
          const parsed = readMeasureInput(
            raw,
            HEIGHT_CM_MIN,
            HEIGHT_CM_MAX,
            t("plan.measures.height"),
          );
          if (!parsed.ok) throw new Error(parsed.message);
          patch.height_cm = parsed.value;
        }
      } else if (field === "birthDate") {
        const raw = basics.birthDate.trim();
        // BORNES LARGES, ET ELLES EXISTENT QUAND MÊME: elles n'attrapent pas
        // une erreur d'un an, elles attrapent le doigt qui glisse sur le siècle
        // — après quoi l'âge dérivé est absurde et personne ne voit d'où il
        // vient.
        if (raw === "") patch.birth_date = null;
        else {
          const age = ageFrom(raw);
          if (age === null || age < 10 || age > 110) {
            throw new Error(t("plan.error.birth_date"));
          }
          patch.birth_date = raw;
        }
      } else {
        const raw = basics.gender.trim();
        // LISTE FERMÉE, celle du CHECK `profiles_gender_check`. Envoyer autre
        // chose produirait une violation de contrainte que personne ne sait
        // lire — et l'écran ne propose que ces trois valeurs, donc y arriver
        // signifierait que quelqu'un a contourné le `<select>`.
        if (raw !== "" && !["male", "female", "other"].includes(raw)) {
          throw new Error(t("plan.error.unknown_value"));
        }
        patch.gender = raw === "" ? null : raw;
      }

      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", uid)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error(t("plan.error.no_profile"));
      }
      await refresh();
    });

  /**
   * LES MOMENTS ÉCARTÉS — écrits par la grille du constructeur.
   *
   * Passe par le même propriétaire que les trois cartes de réglages
   * (`mergePracticalConstraints`): la fusion des autres clés et la garantie
   * qu'une ligne a bougé valent ici aussi, et les dupliquer ferait une
   * quatrième écriture à tenir d'accord avec les trois autres.
   */
  const saveAwayDays = async (next: AwayDay[]) => {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) throw new Error("not_signed_in");
    await mergePracticalConstraints({
      userId: uid,
      current: goal?.practical_constraints ?? {},
      patch: { away_days: next },
      source: "MealPickerGrid",
    });
    await refresh();
  };

  const saveGoal = () =>
    run("goal", async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) throw new Error("not_signed_in");

      // LES DEUX CIBLES SONT ÉCRITES À CHAQUE FOIS, dont celle qui ne
      // s'applique pas — à `null`. C'est ce qui rend un changement de
      // direction sûr: un élève qui passe de « perdre du gras » à « mieux
      // manger » emporterait sinon son poids cible dans une dynamique qui n'en
      // a pas, et la ceinture SQL refuserait l'écriture. Envoyer les deux
      // colonnes, c'est faire tenir au client l'invariant que la base vérifie.
      const kind = indicatorFor(goalDraft.goal as GoalToken).target;
      const parsed = readMeasureInput(
        goalDraft.target,
        kind === "waist" ? WAIST_CM_MIN : WEIGHT_KG_MIN,
        kind === "waist" ? WAIST_CM_MAX : WEIGHT_KG_MAX,
        t("plan.measures.target"),
      );
      if (!parsed.ok) throw new Error(parsed.message);
      const value = kind === null ? null : parsed.value;

      // Même discipline que pour les cibles: l'axe n'existe que là où aucun
      // chiffre ne porte l'objectif, et on l'envoie explicitement à `null`
      // ailleurs plutôt que de laisser la ceinture SQL refuser l'écriture.
      const axis = indicatorFor(goalDraft.goal as GoalToken).axisObjective
        ? goalDraft.axis || null
        : null;

      // ── `situation` N'EST PLUS DANS CE PAYLOAD, ET C'EST DÉLIBÉRÉ ────────
      // Le champ « Your situation » a été retiré de l'écran (doublon assumé
      // avec « Anything going on this week » du constructeur). La COLONNE
      // reste, et elle est toujours lue par les deux générateurs — voir
      // `buildMealPrompt`, qui l'injecte comme entrée STABLE, séparée du
      // contexte daté.
      //
      // Elle est absente du payload plutôt qu'envoyée à `null`: PostgREST ne
      // touche pas, sur conflit, les colonnes qu'on ne lui donne pas (vérifié
      // le 2026-08-07 sur cette table). Les élèves qui avaient écrit une
      // situation la gardent donc, et leurs plans continuent d'en tenir compte.
      // Les nouveaux n'en auront pas — c'est la conséquence à assumer.
      const { error } = await supabase.from("student_goals").upsert({
        user_id: uid,
        goal: goalDraft.goal,
        aspiration: goalDraft.aspiration.trim() || null,
        focus_axis: axis,
        target_weight_kg: kind === "weight" || kind === "band" ? value : null,
        target_waist_cm: kind === "waist" ? value : null,
        // ⚠️ CE `en-GB` EST LA LOCALE DE CONTENU (R2), PAS CELLE DE L'INTERFACE
        // (R3), ET IL EST LAISSÉ EN DUR EXPRÈS. Il décrit la langue de
        // `aspiration` — ce que l'élève vient de TAPER —, et il part au
        // générateur: le passer à la langue de l'écran changerait ce que le
        // modèle écrit et ce qui atterrit en base, donc ce que l'élève lit dans
        // son plan. Ce n'est pas un geste de pack de langue.
        //
        // ⚠️ ET IL N'EST PAS SEUL: `api/household.ts:984` et `api/onboarding.ts`
        // (×2) écrivent le même littéral, et `CommitmentEditor.tsx:232` écrit
        // `en-US`. C'est un axe entier à câbler, pas une ligne à corriger ici —
        // SIGNALÉ, avec les quatre sites, plutôt que réparé à moitié.
        content_locale: "en-GB",
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await refresh();
      // LA FENÊTRE NE SE FERME PAS ICI, et c'est le contraire de ce que la
      // carte faisait. Les trois sections d'en dessous ne sont remplissables
      // qu'une fois l'objectif écrit (`hasGoal`); refermer sur ce Save
      // renverrait l'élève à la page juste au moment où le reste devient
      // disponible. Il ferme quand il a fini, avec « Done ».
    });

  /**
   * La mesure du jour, écrite PAR LE MÊME CHEMIN que le point du dimanche.
   *
   * `weekly_reviews` est en lecture seule pour l'élève — il n'existe aucune
   * policy d'écriture — donc il n'y a pas d'écriture directe possible d'ici, et
   * c'est tant mieux: le point du dimanche resterait le seul écrivain qu'on
   * peut raisonner. On passe donc par le formulaire, avec un jeton qui DIT d'où
   * la mesure vient, et le serveur fusionne dans la ligne de la semaine.
   */
  const saveMeasures = () =>
    run("measures", async () => {
      const w = readMeasureInput(
        measureDraft.weight,
        WEIGHT_KG_MIN,
        WEIGHT_KG_MAX,
        t("plan.measures.weight"),
      );
      if (!w.ok) throw new Error(w.message);
      const c = readMeasureInput(
        measureDraft.waist,
        WAIST_CM_MIN,
        WAIST_CM_MAX,
        t("plan.measures.waist"),
      );
      if (!c.ok) throw new Error(c.message);
      if (w.value === null && c.value === null) {
        throw new Error(t("plan.error.nothing_to_save"));
      }

      const response: Record<string, unknown> = {};
      if (w.value !== null) response.weight_kg = w.value;
      if (c.value !== null) response.waist_cm = c.value;

      const result = await sendChatMessage(crypto.randomUUID(), {
        kind: "form",
        response,
        token: buildMeasuresToken(weekStart),
      });
      if (!result.ok) throw new Error(result.error ?? t("plan.error.could_not_save"));

      setMeasureDraft({ weight: "", waist: "" });
      // L'écriture est faite par le serveur APRÈS la réponse: on relit, sinon
      // la carte afficherait encore l'ancienne mesure et l'élève ressaisirait.
      await refresh();
    });

  /**
   * Build the week — and ASK FIRST when it would throw away an adopted one.
   *
   * Regenerating replaces the lines and drops the plan back to a draft, which
   * also stops the evening tap and the weekly point (both read
   * `status='adopted'`). That is a real loss, so it is a decision the student
   * makes on purpose rather than one they discover afterwards.
   *
   * The confirmation is the courtesy; the refusal is the guarantee. The server
   * rejects an unconfirmed overwrite on its own (`plan_already_adopted`), so
   * this dialog is not what makes the plan safe — it is what makes saying yes
   * possible.
   */
  // RIEN NE S'AFFICHE AVANT D'AVOIR LU, et ce n'était pas cosmétique.
  //
  // Cette page était la seule des pages élève sans ce garde-fou: elle rendait
  // ses cartes DÈS LE PREMIER RENDU, donc avec `goal === null`. Or chacune de
  // ces cartes fige son brouillon à son MONTAGE (`useState(() => ...)`). Le
  // rythme et la capacité de cuisine se montaient donc sur du vide, et rien ne
  // les resynchronisait quand la lecture arrivait: un rythme enregistré en base
  // s'affichait décoché, avec « Nothing ticked » sous les yeux de l'élève.
  //
  // Le vrai dégât n'est pas l'affichage: c'est qu'un « Save » posé sur cet
  // écran-là ÉCRASE ce qui était enregistré, avec un formulaire que personne
  // n'a rempli. Un écran qui affiche du vide qu'il n'a pas encore lu finit
  // toujours par le faire écrire.
  if (state.kind === "loading") {
    return (
      <KeelAppShell variant="student" title={pageTitle()} subtitle={pageSubtitle()}>
        <p className="text-sm text-ink-soft">{t("meals.loading")}</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "error") {
    return (
      <KeelAppShell variant="student" title={pageTitle()}>
        <Card tone="warning">
          <p className="text-sm text-ink">{t("plan.error.load")}</p>
          <p className="mt-1 text-xs text-ink-soft">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell variant="student" title={pageTitle()} subtitle={pageSubtitle()}>
      <div className="space-y-6">
        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-ink">{t("plan.error.failed")}</p>
            <p className="mt-1 text-xs text-ink-soft">{failure}</p>
          </Card>
        ) : null}

        {/*
          UNE CARTE, UN BOUTON — et les quatre réponses lisibles sans rien
          ouvrir.

          Ce que la page montrait avant: quatre encadrés, quatre liens
          « Change », quatre « Save », et les repas repoussés sous la ligne de
          flottaison. Ce qu'elle montre maintenant: où on en est, et une porte.
        */}
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionLabel className="mb-0">{t("plan.about.title")}</SectionLabel>
            <Button variant="secondary" onClick={() => setSetupOpen(true)}>
              {t(goal ? "plan.change" : "plan.about.setup")}
            </Button>
          </div>

          {/* SANS OBJECTIF, RIEN NE PEUT ÊTRE COMPOSÉ — et c'est la seule
              phrase de la carte, parce que c'est le seul geste qui compte
              tant qu'il n'est pas fait. */}
          {!goal ? (
            <p className="mt-3 max-w-[62ch] text-sm text-ink-soft">
              {t("plan.about.empty")}
            </p>
          ) : (
            <dl className="mt-3 space-y-2">
              {/* UNE LIGNE PAR SECTION DE LA FENÊTRE, DANS LE MÊME ORDRE.
                  Cette carte est l'index du dialogue: une section qui n'y a pas
                  sa ligne est une section qu'on ne sait pas avoir oublié de
                  remplir. */}
              {([
                [t("plan.about.numbers"), personalSummary],
                [
                  t("plan.about.goal"),
                  goalOptions().find((g) => g.value === goal.goal)?.label ?? goal.goal,
                ],
                [t("plan.about.day"), rhythmSummary],
                [t("plan.about.last_request"), cookingSummary],
                [t("plan.about.told"), preferencesSummary],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex flex-wrap gap-x-2 text-sm">
                  <dt className="w-20 shrink-0 text-ink-soft">{label}</dt>
                  {/* `min-w-0` sur l'enfant flex: sans lui, `min-width:auto`
                      empêche le texte long de se replier et la carte déborde
                      à 320 px. */}
                  <dd className="min-w-0 flex-1 text-ink">
                    {value ??
                      <span className="text-ink-soft">{t("plan.about.not_set")}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        {/* LA FENÊTRE. Montée en permanence (voir `Modal`: `open === false`
            rend `null` mais l'appelant garde son état), donc un brouillon de
            saisie survit à une fermeture accidentelle. */}
        <Modal
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          title={t("plan.about.title")}
          closeLabel={t("plan.about.done")}
          size="lg"
        >
        <div className="space-y-4">
        {/* TES CHIFFRES, EN PREMIER — parce que ce sont des propriétés du
            CORPS, pas de l'objectif. Elles ne changent pas quand l'objectif
            change, et elles servent aux portions dans les six cas. */}
        <SetupSection
          title={t("plan.section.basics.title")}
          intro={t("plan.section.basics.intro")}
          summary={personalSummary}
        >
          <PersonalNumbers
            goal={goalDraft.goal as GoalToken}
            reviews={reviews}
            measures={measures}
            target={goalDraft.target}
            basics={basics}
            savedBasics={savedBasics}
            onBasicsChange={setBasics}
            onSaveBasic={saveBasic}
            draft={measureDraft}
            onDraftChange={setMeasureDraft}
            onSaveMeasures={saveMeasures}
            busy={busy}
            restricted={restricted}
          />
        </SetupSection>

        <SetupSection
          title={t("plan.section.goal.title")}
          intro={t("plan.section.goal.intro")}
          summary={goal ? goalSummary : null}
        >
          <div id="goal-editor" className="space-y-4">
            {/*
              DES CARTES RADIO, PAS UN `<select>`. Un menu déroulant ne montre
              qu'une ligne à la fois: pour comparer six directions il faut les
              ouvrir une par une, et personne ne le fait — on prend la première
              qui ressemble. C'est le mécanisme par lequel « Performance »
              ramassait les élèves en prise de masse. Les six titres restent
              donc visibles ensemble, et c'est ce qui compte ici.

              ── LA LÉGENDE NE S'AFFICHE QUE SUR LA DYNAMIQUE CHOISIE ────────
              Décision du propriétaire, 2026-08-07, et elle RENVERSE ce que ce
              commentaire disait avant: « la description ne sert à choisir que
              si elle est lisible AVANT le clic ».

              Ce qui l'a emporté: six titres suivis chacun de deux lignes font
              une section de quinze lignes en tête d'une fenêtre qui en compte
              quatre — et c'est cette section-là que quelqu'un a eue sous les
              yeux sans rien y comprendre. Une liste qu'on ne peut pas parcourir
              du regard ne se lit pas non plus.

              CE QU'ON ACCEPTE EN ÉCHANGE, et il faut le savoir: le premier clic
              se fait sur le titre seul. Le garde-fou est que la légende arrive
              AVANT l'enregistrement — l'élève lit ce qu'il vient de choisir et
              peut encore en changer, ce qu'un `<select>` ne permettait pas. Si
              une dynamique se remet à ramasser des élèves qui n'y ont rien à
              faire, c'est ici qu'il faut revenir, et les titres doivent alors
              porter seuls la distinction.
            */}
            <fieldset>
              <legend className="mb-1 block text-label font-semibold uppercase text-ink-soft">
                {t("plan.goal.legend")}
              </legend>
              <div className="mt-2 space-y-2">
                {goalOptions().map((g) => {
                  const selected = goalDraft.goal === g.value;
                  return (
                    <label
                      key={g.value}
                      // SIX FICHES, UNE COCHÉE — et la distinction est une
                      // FORME, pas une teinte: trait à l'encre pleine doublé
                      // d'un anneau, contre un trait de contrôle. Le fond passe
                      // au lavis de la marque (`fig-50`, `ink` dessus =
                      // 15,39:1) parce que `bg-gray-50` n'avait plus rien de
                      // plus clair à être — la fenêtre est en `paper`, et
                      // `bg-white` n'est pas dans la palette (le blanc pur est
                      // le neutre sans température que la charte refuse).
                      // `line-strong` (3,84:1) sur l'inactive: c'est la bordure
                      // d'un CONTRÔLE, et `line` est à 1,30:1 (WCAG 1.4.11).
                      className={`flex cursor-pointer gap-3 rounded-card border p-3 transition-colors ${
                        selected
                          ? "border-ink bg-fig-50 ring-1 ring-ink"
                          : "border-line-strong bg-paper hover:bg-fig-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="goal"
                        value={g.value}
                        checked={selected}
                        onChange={() =>
                          setGoalDraft((p) => ({
                            ...p,
                            goal: g.value,
                            // La cible change de NATURE avec la direction: 72
                            // tapé pour un poids ne veut rien dire une seconde
                            // plus tard sur un tour de taille. On la garde
                            // seulement si les deux dynamiques attendent la
                            // même chose (perte de gras ↔ prise de masse).
                            target:
                              indicatorFor(p.goal as GoalToken).target ===
                                  indicatorFor(g.value as GoalToken).target
                                ? p.target
                                : "",
                            // L'axe ne survit qu'entre dynamiques qui en ont
                            // un. L'aspiration, elle, survit toujours: elle ne
                            // dépend d'aucune dynamique.
                            axis: indicatorFor(g.value as GoalToken).axisObjective
                              ? p.axis
                              : "",
                          }))}
                        // `accent-*` COMPTE COMME DU GRIS, et sans lui la
                        // pastille cochée sort dans la couleur d'accent du
                        // SYSTÈME — bleue par défaut sur macOS et Windows,
                        // c'est-à-dire la teinte que `Badge tone="info"`
                        // occupe. `ink` la range dans la palette.
                        className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                          {g.label}
                        </span>
                        {/* La légende de la dynamique CHOISIE — voir l'arbitrage
                            au-dessus du `fieldset`. Rendue conditionnellement et
                            pas masquée en CSS: une description présente dans le
                            DOM serait annoncée par un lecteur d'écran pour les
                            six, et l'élève au clavier entendrait un écran qui ne
                            ressemble à rien de ce qui est affiché. */}
                        {/* TOUT CE QUE LA DYNAMIQUE CHOISIE ENTRAÎNE, ICI —
                            sa légende, sa cible, et les mots de l'élève.
                            Rendu conditionnellement et pas masqué en CSS: un
                            contenu présent dans le DOM pour les six serait
                            annoncé six fois par un lecteur d'écran, et il y
                            aurait six champs `goal-target` de même `id`. */}
                        {selected ? (
                          <>
                            <span className="mt-0.5 block max-w-[62ch] text-xs leading-5 text-ink-soft">
                              {g.blurb}
                            </span>
                            {/* Un `div` serait invalide ici: le parent est un
                                `span` dans un `label`. */}
                            <span className="block">
                              <GoalTargetField
                                goal={goalDraft.goal as GoalToken}
                                reviews={reviews}
                                target={goalDraft.target}
                                onTargetChange={(v) =>
                                  setGoalDraft((p) => ({ ...p, target: v }))}
                                axis={goalDraft.axis}
                                onAxisChange={(v) =>
                                  setGoalDraft((p) => ({ ...p, axis: v }))}
                                restricted={restricted}
                              />
                            </span>
                            {/*
                              SES MOTS, RATTACHÉS À LA DYNAMIQUE QU'IL VIENT DE
                              CHOISIR.

                              C'était un champ « What you are actually after »
                              posé plus bas, sous les mesures, sans lien visible
                              avec le choix — et à côté d'un second champ « Your
                              situation ». Les deux se remplissaient avec les
                              mêmes phrases, et le constructeur en demande
                              encore une troisième (« Anything going on this
                              week »). Il n'en reste qu'un, et il arrive au
                              moment où on a quelque chose à dire.
                            */}
                            <span className="mt-3 block">
                              <label
                                htmlFor="aspiration"
                                className="block text-label font-semibold uppercase text-ink-soft"
                              >
                                {t("plan.goal.own_words")}
                              </label>
                              <textarea
                                id="aspiration"
                                rows={2}
                                className={`${inputClass} mt-1`}
                                placeholder={t("plan.goal.own_words_placeholder")}
                                value={goalDraft.aspiration}
                                onChange={(e) =>
                                  setGoalDraft((p) => ({ ...p, aspiration: e.target.value }))}
                                // Le `label` parent transmet le clic à la radio;
                                // sans ça, cliquer dans la zone de texte
                                // rebasculerait la sélection.
                                onClick={(e) => e.preventDefault()}
                              />
                              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                                {t("plan.goal.own_words_hint")}
                              </span>
                            </span>
                          </>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Button onClick={saveGoal} disabled={busy !== null} variant="secondary">
              {busy === "goal" ? t("plan.busy") : t("plan.save")}
            </Button>
          </div>
        </SetupSection>

        {/* LA FORME DE SA JOURNÉE — ce qui décide COMBIEN de plats il y aura et
            QUAND. Le moteur imposait trois repas à tout le monde, en dur; une
            faim de 17h n'avait aucun endroit où exister. */}
        <SetupSection
          title={t("plan.section.day.title")}
          intro={t("plan.section.day.intro")}
          summary={rhythmSummary}
        >
          <EatingRhythmCard
            embedded
            hasGoal={goal !== null}
            practicalConstraints={goal?.practical_constraints ?? {}}
            rhythm={parseEatingRhythm(goal?.practical_constraints?.eating_rhythm)}
            onSaved={refresh}
          />
        </SetupSection>

        {/* CE QUE L'ÉLÈVE PEUT VRAIMENT FAIRE. Après le rythme: on dit d'abord
            quand on mange, puis ce qu'on peut cuisiner. `cooking_time_min` et
            `budget_band` existaient dans la colonne depuis le premier jour du
            pivot — lues par le générateur, remplies par personne. */}
        <SetupSection
          title={t("plan.section.cooking.title")}
          intro={t("plan.section.cooking.intro")}
          summary={cookingSummary}
        >
          <CookingCapacityCard
            embedded
            hasGoal={goal !== null}
            practicalConstraints={goal?.practical_constraints ?? {}}
            onSaved={refresh}
          />
        </SetupSection>

        {/* CE QU'IL A DIT SUR SA BOUFFE, remonté de la conversation. En DERNIER
            parce que c'est la couche la plus personnelle — et la seule qu'il
            n'a pas eu à remplir: elle se remplit à partir de ce qu'il a déjà
            raconté, et il n'a qu'à confirmer. */}
        <SetupSection
          title={t("plan.section.told.title")}
          intro={t("plan.section.told.intro")}
          summary={preferencesSummary}
        >
          <FoodPreferencesCard
            embedded
            hasGoal={goal !== null}
            practicalConstraints={goal?.practical_constraints ?? {}}
            onSaved={refresh}
          />
        </SetupSection>
        </div>
        </Modal>

        {/*
          LA CARTE OÙ ON NE COMPRENAIT RIEN.

          Elle n'affichait qu'une date (« WEEK OF 2026-08-03 »), une phrase
          creuse (« No plan yet this week ») et un bouton (« Build my week »).
          Trois éléments dont aucun ne dit ce qu'on obtient en cliquant. Un
          élève ne pouvait pas deviner qu'il repartirait avec ses repas de la
          semaine.

          La date reste — c'est bien la semaine en cours — mais elle passe en
          second: le titre nomme la CHOSE, et le vide décrit ce que le bouton
          fabrique plutôt que de constater son absence.
        */}
        {/* LA SEMAINE, EN PLATS — et plus en principes.
            Cette carte affichait le plan de MÉTHODE: trois à cinq lignes de
            comportement, chacune avec le badge « From your coach's method » et
            la conviction du coach citée en italique. Deux défauts, et le second
            est une règle produit:
              1. ce n'est pas ce que l'élève vient chercher. « Build every meal
                 around a clear protein anchor » ne dit pas quoi faire à manger
                 mardi soir;
              2. LA DOCTRINE DU COACH ÉTAIT AFFICHÉE. Elle doit servir à
                 composer les repas, pas être montrée — c'est sa méthode, son
                 matériel privé, et un élève n'a pas à lire la recette de son
                 coach pour manger.
            Le constructeur ci-dessous produit des plats avec leurs ingrédients,
            jour par jour, à partir de cette même doctrine — sans jamais la
            citer. Les IDÉES que le coach dépose vivent sur `/app/meals`. */}
        {/* LE RYTHME ET LES ABSENCES DESCENDENT D'ICI. Cette page lit déjà
            `student_goals`; les relire dans le constructeur ferait un second
            lecteur de la même colonne, et la grille montrerait alors autre
            chose que ce que le générateur reçoit. */}
        {/* ── 3 · QUELLE FAÇON DE MANGER LE PLAT COMMUN SUIT ──────────────
            AU-DESSUS du formulaire, et sous « À propos de toi ». C'est une
            ENTRÉE de la composition, pas un résultat: la lire après le bouton,
            c'est la lire trop tard. Et c'est un fait de FOYER, pas un fait de
            personne — d'où sa place entre les deux. */}
        <ReferenceMemberCard
          household={household}
          isOwner={isOwner}
          busy={referenceBusy}
          onPick={async (memberId) => {
            if (!household) return false;
            setReferenceBusy(true);
            try {
              await setReferenceMember(household.id, memberId);
              const uid = (await supabase.auth.getUser()).data.user?.id;
              if (uid) await refreshHousehold(uid);
              return true;
            } catch {
              return false;
            } finally {
              setReferenceBusy(false);
            }
          }}
        />

        <MealBuilder
          rhythm={parseEatingRhythm(pc.eating_rhythm)}
          awayDays={parseAwayDays(pc.away_days)}
          onAwaySaved={saveAwayDays}
          onHouseholdComposed={async () => {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (uid) await refreshHousehold(uid);
          }}
        />

        {/* ── 7 · MA PART (Lot E) ─────────────────────────────────────────
            Montée AVANT d'avoir un corps: le mode d'échec n°1 de ce dépôt est
            de livrer un composant complet, testé, vert — et branché nulle
            part. Elle rend `null` tant que Lot E ne l'a pas écrite, ce qui est
            aussi son comportement définitif quand il n'y a pas de part. */}
        <MyShareCard
          mine={null}
          householdDishes={householdMeal?.dishes ?? []}
          meMemberId={household?.me?.memberId ?? null}
          busy={false}
          onApprove={async () => {}}
          onRequestChange={async () => {}}
        />

        {/* ── 9 · « À TABLE » ─────────────────────────────────────────────
            SOUS le plan, jamais au-dessus: il dit comment on SERT ce que le
            plan dit qu'on CUISINE. L'inverse ferait lire des parts avant de
            savoir de quel plat. */}
        <TableCard meal={householdMeal} />
      </div>
    </KeelAppShell>
  );
}
