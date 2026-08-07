import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import MealBuilder from "../components/MealBuilder";
import EatingRhythmCard from "../components/EatingRhythmCard";
import CookingCapacityCard from "../components/CookingCapacityCard";
import FoodPreferencesCard from "../components/FoodPreferencesCard";
import { parseEatingRhythm } from "../api/mealGeneration";
import { sendChatMessage } from "../api/chat";
import {
  axisReading,
  datedMeasures,
  type DatedMeasure,
  FOCUS_AXES,
  FOCUS_AXIS_LABELS,
  type FocusAxis,
  indicatorFor,
  readIndicator,
  readMeasureInput,
  type ReviewRow,
  targetValueOf,
  WAIST_CM_MAX,
  WAIST_CM_MIN,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
  weeksInsideBand,
} from "../api/bodyMeasures";
import type { GoalToken } from "../api/coachDoctrine";
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
 * Le sous-titre est aussi une limite: des lignes et des cadences, jamais des
 * quantités. `WEEK_PLAN_SYSTEM_PROMPT` refuse toute calorie et tout macro, et
 * un filtre en aval rejette les lignes qui en portent. Promettre un menu chiffré
 * ici serait promettre ce que le serveur a le devoir de ne pas livrer.
 */
const PAGE_TITLE = "My week's plan";
// « plus one or two light habits » est TOMBÉ. L'écran ne compose plus de lignes
// de comportement — `MealBuilder` produit des plats, et rien d'autre. La
// promesse survivait au moteur qui la tenait, ce qui est la pire forme de copie
// morte: elle annonce une fonctionnalité qu'aucun code ne fournit.
const PAGE_SUBTITLE =
  "What you eat this week, written from your coach's method. Lines and rhythms, never calorie counts.";



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
const GOALS: Array<{ value: string; label: string; blurb: string }> = [
  {
    value: "fat_loss",
    label: "Lose fat",
    blurb: "You want the scale to come down — without the week becoming unlivable.",
  },
  {
    value: "muscle_gain",
    label: "Build muscle",
    blurb: "You want to gain, on purpose, and mostly as muscle.",
  },
  {
    value: "recomposition",
    label: "Same weight, different shape",
    blurb: "The scale barely moves. Your waist does.",
  },
  {
    value: "performance",
    label: "Train better",
    blurb: "Fuel your sessions and recover from them. Weight is a constraint, not the target.",
  },
  {
    value: "health",
    label: "Eat better",
    blurb: "Feel better day to day. Body weight is not the point here.",
  },
  {
    value: "maintenance",
    label: "Hold what I have",
    blurb: "You are where you want to be. Keep it, with the lightest possible load.",
  },
];

/**
 * Server error codes, in the student's words.
 *
 * Kept as a map rather than shown raw: `coach_has_no_doctrine` on screen tells
 * a student nothing, and each of these calls for a different next move. An
 * unknown code still falls through to the raw string — a silent generic message
 * would hide a fault we need to see.
 */

/** Monday of the current week, in local date. */
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
  const d = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return weekStart;
  return `week of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
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
function MeasuresBlock(props: {
  goal: GoalToken;
  reviews: ReviewRow[];
  target: string;
  onTargetChange: (v: string) => void;
  axis: string;
  onAxisChange: (v: string) => void;
  draft: { weight: string; waist: string };
  onDraftChange: (d: { weight: string; waist: string }) => void;
  onSaveMeasures: () => void;
  busy: string | null;
}) {
  const weights = datedMeasures(props.reviews, "weight");
  const waists = datedMeasures(props.reviews, "waist");
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
  const axis = props.axis && (FOCUS_AXES as readonly string[]).includes(props.axis)
    ? axisReading(props.reviews, props.axis as FocusAxis)
    : null;

  /** L'unité et le libellé de la cible, selon ce que cette dynamique vise. */
  const targetUnit = indicator.target === "waist" ? "cm" : "kg";
  const targetLabel = indicator.target === "band"
    ? "Weight I want to stay around"
    : indicator.target === "waist"
    ? "Waist I am aiming for"
    : "Weight I am aiming for";

  /**
   * LA MESURE QUI PORTE L'OBJECTIF PASSE EN PREMIER.
   *
   * Le poids était toujours affiché en tête, y compris en recomposition — où
   * c'est le tour de taille qui décide et où le poids n'est là que pour dire
   * « il tient ». Mettre en premier ce qui compte le moins, c'est enseigner
   * l'inverse de ce que la carte explique juste au-dessus.
   */
  const rows: Array<{ label: string; m: DatedMeasure | null; unit: string }> = [];
  const weightRow = { label: "Weight", m: reading.weight, unit: "kg" };
  const waistRow = { label: "Waist", m: reading.waist, unit: "cm" };
  if (indicator.primary === "waist") {
    rows.push(waistRow, weightRow);
  } else {
    rows.push(weightRow);
    if (showsWaist) rows.push(waistRow);
  }
  const recorded = rows.filter((r) => r.m !== null);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/*
        UN TITRE PAR IDÉE, ET LE TITRE DIT CE QUE LA CHOSE EST.

        La version d'avant empilait « What you are aiming for » puis, juste en
        dessous, « Waist you are aiming for (cm) » — deux fois la même phrase,
        dont une en étiquette de champ. Et la phrase de consigne (« ta taille
        qui descend pendant que le poids tient ») était rangée sous « Where you
        are now », où elle décrit tout sauf l'état actuel.

        Trois parties, séparées visuellement, chacune répondant à UNE question:
        qu'est-ce que je vise · où j'en suis · comment je mets à jour.
      */}
      <div className="border-b border-gray-200 px-3 py-2">
        <p className="text-sm font-medium text-gray-900">What this goal tracks</p>
        <p className="mt-0.5 text-xs leading-5 text-gray-600">{indicator.reading}</p>
      </div>

      {/* 1. LA CIBLE — un chiffre, ou un axe, jamais les deux */}
      <div className="border-b border-gray-200 px-3 py-3">
        {indicator.target !== null ? (
          <>
            <label
              htmlFor="goal-target"
              className="block text-xs font-medium text-gray-700"
            >
              {targetLabel}
            </label>
            {/* Un champ étroit avec son unité collée: trois chiffres dans une
                boîte pleine largeur donnent l'impression d'attendre une phrase. */}
            <div className="mt-1 flex items-center gap-2">
              <input
                id="goal-target"
                className={`${inputClass} w-24`}
                inputMode="decimal"
                value={props.target}
                placeholder="—"
                onChange={(e) => props.onTargetChange(e.target.value)}
              />
              <span className="text-sm text-gray-600">{targetUnit}</span>
              <span className="text-xs text-gray-400">optional</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-gray-500">
              Nothing counts down, and nobody is scored against it.
            </p>
          </>
        ) : (
          // L'AXE, pour les deux dynamiques qu'aucun chiffre ne porte. Les six
          // valeurs sont celles du point du dimanche: l'objectif est mesurable
          // sans une seule saisie de plus.
          <>
            <label htmlFor="goal-axis" className="block text-xs font-medium text-gray-700">
              The one thing I want to see improve
            </label>
            <select
              id="goal-axis"
              className={`${inputClass} mt-1`}
              value={props.axis}
              onChange={(e) => props.onAxisChange(e.target.value)}
            >
              <option value="">Nothing in particular</option>
              {FOCUS_AXES.map((a) => (
                <option key={a} value={a}>{FOCUS_AXIS_LABELS[a]}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-5 text-gray-500">
              One of the six you rate on Sunday — nothing extra to fill in.
            </p>
            {axis ? (
              <p className="mt-2 text-sm text-gray-700">
                {axis.latest === null
                  ? `Nothing rated yet — you set this at Sunday's check-in.`
                  : axis.trend === "unknown"
                  ? `Last Sunday: ${axis.latest.value} out of 5.`
                  : axis.improving
                  ? `${axis.label} is going up — that is the one you picked.`
                  : axis.trend === "falling"
                  ? `${axis.label} is going down.`
                  : `${axis.label} is holding steady.`}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* 2. OÙ J'EN SUIS */}
      <div className="border-b border-gray-200 px-3 py-3">
        <p className="text-xs font-medium text-gray-700">Where you are now</p>

        {recorded.length === 0 ? (
          // ÉTAT VIDE NON HONTEUX, ET QUI DIT D'OÙ VIENNENT LES CHIFFRES.
          // Deux tirets sous « Weight » et « Waist » ressemblent à une panne;
          // ils n'apprennent pas que la mesure se saisit juste en dessous.
          <p className="mt-1 text-sm text-gray-600">
            Nothing recorded yet. Add a measurement below, or at Sunday's
            check-in.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
              {recorded.map((r) => (
                <div key={r.label}>
                  <p className="text-xs text-gray-500">{r.label}</p>
                  <p className="text-lg font-semibold leading-tight text-gray-900">
                    {r.m!.value}
                    <span className="ml-1 text-sm font-normal text-gray-500">{r.unit}</span>
                  </p>
                  {/* La date sous la valeur, toujours: « 78 kg » ne dit rien,
                      « 78 kg il y a trois semaines » dit quelque chose. */}
                  <p className="text-xs text-gray-500">{weekLabel(r.m!.weekStart)}</p>
                </div>
              ))}
            </div>

            {reading.sentence ? (
              <p className="mt-3 text-sm text-gray-700">{reading.sentence}</p>
            ) : (
              <p className="mt-3 text-xs leading-5 text-gray-500">
                One more entry and this can start showing a direction — a single
                measurement on its own is just a number.
              </p>
            )}

            {/*
              TROIS ÉTATS, ET LE TROISIÈME MANQUAIT.

              « Tu es sorti de ta fourchette » suppose une fourchette. Sans
              référence saisie, `insideBand` vaut `null` et on ne conclut RIEN —
              on dit ce qui manque pour pouvoir conclure. Le cas est fréquent:
              c'est celui de tout élève qui vient de choisir « Hold what I
              have » et n'a pas encore posé son poids de référence.
            */}
            {indicator.target === "band" && targetNumber === null ? (
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Set the weight you want to stay around, above, and this will
                tell you when you drift.
              </p>
            ) : weeksHeld > 0 ? (
              <p className="mt-1 text-sm text-gray-700">
                {weeksHeld} week{weeksHeld > 1 ? "s" : ""} inside your range.
              </p>
            ) : reading.insideBand === false ? (
              <p className="mt-1 text-sm text-gray-700">
                You have drifted outside your range.
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* 3. METTRE À JOUR, SANS ATTENDRE DIMANCHE */}
      <div className="px-3 py-3">
        <p className="text-xs font-medium text-gray-700">Add a measurement</p>
        <p className="mt-0.5 text-xs leading-5 text-gray-500">
          Weighed yourself since Sunday? It goes to the same place as your
          Sunday check-in.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="measure-weight" className="block text-xs text-gray-500">
              Weight (kg)
            </label>
            <input
              id="measure-weight"
              className={`${inputClass} mt-1 w-24`}
              inputMode="decimal"
              value={props.draft.weight}
              onChange={(e) => props.onDraftChange({ ...props.draft, weight: e.target.value })}
            />
          </div>
          {showsWaist ? (
            <div>
              <label htmlFor="measure-waist" className="block text-xs text-gray-500">
                Waist (cm)
              </label>
              <input
                id="measure-waist"
                className={`${inputClass} mt-1 w-24`}
                inputMode="decimal"
                value={props.draft.waist}
                onChange={(e) => props.onDraftChange({ ...props.draft, waist: e.target.value })}
              />
            </div>
          ) : null}
          {/* « Save » tout court était ambigu: il y en a un second en bas de
              carte, pour l'objectif. Le bouton dit ce qu'il enregistre. */}
          <Button
            onClick={props.onSaveMeasures}
            disabled={props.busy !== null}
            variant="secondary"
          >
            {props.busy === "measures" ? "…" : "Save measurement"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function StudentWeekPlanPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [goal, setGoal] = React.useState<GoalRow | null>(null);
  const [goalDraft, setGoalDraft] = React.useState({
    goal: "health",
    situation: "",
    aspiration: "",
    target: "",
    axis: "",
  });
  /**
   * LA CARTE SE REPLIE — même règle que l'interview de doctrine côté coach.
   *
   * Ouverte quand il n'y a RIEN d'écrit (c'est alors la seule porte), repliée
   * dès qu'un objectif existe. Un formulaire de six cases déplié en permanence
   * au-dessus du plan donne l'impression qu'il reste quelque chose à remplir,
   * et repousse vers le bas la seule chose que l'élève vient voir: sa semaine.
   */
  const [goalOpen, setGoalOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [reviews, setReviews] = React.useState<ReviewRow[]>([]);
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

  const refresh = React.useCallback(async () => {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) throw new Error("not_signed_in");

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
    const [planRes, goalRes, reviewRes] = await Promise.all([
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
    ]);
    // Fail loud: "you have no plan yet" and "we could not read it" are two
    // different sentences, and showing the first for the second invites the
    // student to regenerate over the top of something that exists.
    if (planRes.error) throw new Error(planRes.error.message);
    if (goalRes.error) throw new Error(goalRes.error.message);
    if (reviewRes.error) throw new Error(reviewRes.error.message);

    const g = (goalRes.data ?? null) as GoalRow | null;
    setGoal(g);
    if (g) {
      const kind = indicatorFor(g.goal as GoalToken).target;
      const current = kind === "waist" ? g.target_waist_cm : g.target_weight_kg;
      setGoalDraft({
        goal: g.goal,
        situation: g.situation ?? "",
        aspiration: g.aspiration ?? "",
        target: current === null || current === undefined ? "" : String(current),
        axis: g.focus_axis ?? "",
      });
    }
    // Rien d'écrit => la carte s'ouvre d'elle-même: c'est le premier passage,
    // et un élève sans objectif ne peut rien générer.
    if (!g) setGoalOpen(true);

    const rows = (reviewRes.data ?? []) as Array<ReviewRow & { risk_band?: string }>;
    // La ligne la plus récente décide: la garde est un ÉTAT courant, pas un
    // antécédent. Un drapeau levé il y a deux mois et retombé depuis ne doit
    // pas retirer l'écran à quelqu'un qui va bien maintenant.
    setRestricted(rows[0]?.risk_band === "restriction_flag");
    setReviews(rows);
  }, [weekStart]);

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
    if (kind === "waist" && goal.target_waist_cm !== null) {
      parts.push(`aiming for ${goal.target_waist_cm} cm`);
    } else if (kind === "band" && goal.target_weight_kg !== null) {
      parts.push(`staying around ${goal.target_weight_kg} kg`);
    } else if (kind !== null && goal.target_weight_kg !== null) {
      parts.push(`aiming for ${goal.target_weight_kg} kg`);
    }
    if (goal.focus_axis && (FOCUS_AXES as readonly string[]).includes(goal.focus_axis)) {
      parts.push(`working on ${FOCUS_AXIS_LABELS[goal.focus_axis as FocusAxis].toLowerCase()}`);
    }
    if (goal.aspiration) parts.push(`“${goal.aspiration}”`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [goal]);

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
        "Target",
      );
      if (!parsed.ok) throw new Error(parsed.message);
      const value = kind === null ? null : parsed.value;

      // Même discipline que pour les cibles: l'axe n'existe que là où aucun
      // chiffre ne porte l'objectif, et on l'envoie explicitement à `null`
      // ailleurs plutôt que de laisser la ceinture SQL refuser l'écriture.
      const axis = indicatorFor(goalDraft.goal as GoalToken).axisObjective
        ? goalDraft.axis || null
        : null;

      const { error } = await supabase.from("student_goals").upsert({
        user_id: uid,
        goal: goalDraft.goal,
        situation: goalDraft.situation.trim() || null,
        aspiration: goalDraft.aspiration.trim() || null,
        focus_axis: axis,
        target_weight_kg: kind === "weight" || kind === "band" ? value : null,
        target_waist_cm: kind === "waist" ? value : null,
        content_locale: "en-GB",
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await refresh();
      // Enregistré => la carte se replie. Le geste suivant est de générer sa
      // semaine, pas de relire le formulaire qu'on vient de remplir.
      setGoalOpen(false);
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
      const w = readMeasureInput(measureDraft.weight, WEIGHT_KG_MIN, WEIGHT_KG_MAX, "Weight");
      if (!w.ok) throw new Error(w.message);
      const c = readMeasureInput(measureDraft.waist, WAIST_CM_MIN, WAIST_CM_MAX, "Waist");
      if (!c.ok) throw new Error(c.message);
      if (w.value === null && c.value === null) {
        throw new Error("Nothing to save — fill in a weight or a waist.");
      }

      const response: Record<string, unknown> = {};
      if (w.value !== null) response.weight_kg = w.value;
      if (c.value !== null) response.waist_cm = c.value;

      const result = await sendChatMessage(crypto.randomUUID(), {
        kind: "form",
        response,
        token: buildMeasuresToken(weekStart),
      });
      if (!result.ok) throw new Error(result.error ?? "could not save");

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
      <KeelAppShell variant="student" title={PAGE_TITLE} subtitle={PAGE_SUBTITLE}>
        <p className="text-sm text-gray-500">Loading…</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "error") {
    return (
      <KeelAppShell variant="student" title={PAGE_TITLE}>
        <Card tone="warning">
          <p className="text-sm text-gray-900">We could not load your week.</p>
          <p className="mt-1 text-xs text-gray-600">{state.message}</p>
        </Card>
      </KeelAppShell>
    );
  }

  return (
    <KeelAppShell variant="student" title={PAGE_TITLE} subtitle={PAGE_SUBTITLE}>
      <div className="space-y-6">
        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-gray-900">That did not go through.</p>
            <p className="mt-1 text-xs text-gray-600">{failure}</p>
          </Card>
        ) : null}

        <Card>
          <div className="flex items-start justify-between gap-3">
            <SectionLabel>Your goal</SectionLabel>
            {goal ? (
              <button
                type="button"
                onClick={() => setGoalOpen((o) => !o)}
                aria-expanded={goalOpen}
                aria-controls="goal-editor"
                className="shrink-0 text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
              >
                {goalOpen ? "Close" : "Change"}
              </button>
            ) : null}
          </div>

          {/*
            REPLIÉE, ELLE DOIT ENCORE DIRE CE QU'ELLE CONTIENT.

            Un bloc replié qui n'affiche qu'un titre oblige à l'ouvrir pour
            savoir ce qu'on avait mis. Le résumé porte donc les deux choses que
            l'élève vient vérifier: sa direction, et ce qu'il vise.
          */}
          {goal && !goalOpen ? (
            <div className="mt-2">
              <p className="text-sm text-gray-900">
                {GOALS.find((g) => g.value === goal.goal)?.label ?? goal.goal}
              </p>
              {goalSummary ? (
                <p className="mt-1 text-xs leading-5 text-gray-600">{goalSummary}</p>
              ) : null}
            </div>
          ) : null}

          {goal && !goalOpen ? null : (
          <>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            This is what decides which parts of your coach's method matter for
            you this week. Your coach stays the author of the method — your goal
            only changes what gets brought forward.
          </p>
          <div id="goal-editor" className="mt-4 space-y-4">
            {/*
              DES CARTES RADIO, PAS UN `<select>`.

              Un menu déroulant ne montre qu'une ligne à la fois: pour comparer
              six directions il faut les ouvrir une par une, et personne ne le
              fait — on prend la première qui ressemble. C'est le mécanisme par
              lequel « Performance » ramassait les élèves en prise de masse.
              Six options tiennent à l'écran; la description ne sert à choisir
              que si elle est lisible AVANT le clic.
            */}
            <fieldset>
              <legend className="mb-1 block text-sm font-medium text-gray-700">
                What you are after
              </legend>
              <div className="mt-2 space-y-2">
                {GOALS.map((g) => {
                  const selected = goalDraft.goal === g.value;
                  return (
                    <label
                      key={g.value}
                      className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                        selected
                          ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900"
                          : "border-gray-300 bg-white hover:border-gray-400"
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
                        className="mt-0.5 h-4 w-4 shrink-0 accent-gray-900"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">
                          {g.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-gray-600">
                          {g.blurb}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/*
              LES MESURES — celles que cette direction-là demande, et rien de
              plus. Deux dynamiques sur six n'ont pas d'indicateur chiffré, et
              leur en fabriquer un serait la mesure décorative que ce produit
              refuse: on affiche alors la phrase, pas un champ.

              Le bloc entier disparaît sous la garde restrictive. Voir l'état
              `restricted` plus haut pour ce que ça protège.
            */}
            {restricted ? null : (
              <MeasuresBlock
                goal={goalDraft.goal as GoalToken}
                reviews={reviews}
                target={goalDraft.target}
                onTargetChange={(v) => setGoalDraft((p) => ({ ...p, target: v }))}
                axis={goalDraft.axis}
                onAxisChange={(v) => setGoalDraft((p) => ({ ...p, axis: v }))}
                draft={measureDraft}
                onDraftChange={setMeasureDraft}
                onSaveMeasures={saveMeasures}
                busy={busy}
              />
            )}
            {/*
              CE QU'IL VEUT, PUIS CE QUI L'EMPÊCHE — et les deux sont deux
              champs, pas un.

              `situation` ne captait que les contraintes. Un élève décrivait sa
              cantine et ses horaires, et rien nulle part ne disait pourquoi il
              est là. C'est pourtant ce dont Sophia a besoin pour argumenter au
              lieu d'asséner, et ce qu'un coach lit en premier de sa cohorte.
              Le générateur reçoit l'aspiration AVANT les contraintes.
            */}
            <Field
              label="What you are actually after"
              htmlFor="aspiration"
              hint="In your words. « Play football with my kids without being wrecked » is a better answer than a number."
            >
              <textarea
                id="aspiration"
                rows={2}
                className={inputClass}
                value={goalDraft.aspiration}
                onChange={(e) => setGoalDraft((p) => ({ ...p, aspiration: e.target.value }))}
              />
            </Field>
            <Field
              label="Your situation"
              htmlFor="situation"
              hint="What makes a week possible or impossible: canteen, shifts, training, weekends."
            >
              <textarea
                id="situation"
                rows={3}
                className={inputClass}
                value={goalDraft.situation}
                onChange={(e) => setGoalDraft((p) => ({ ...p, situation: e.target.value }))}
              />
            </Field>
            <Button onClick={saveGoal} disabled={busy !== null} variant="secondary">
              {busy === "goal" ? "…" : "Save"}
            </Button>
          </div>
          </>
          )}
        </Card>

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
        {/* LA FORME DE SA JOURNÉE — juste au-dessus du constructeur, parce que
            c'est ce qui décide COMBIEN de plats il y aura et QUAND. Le moteur
            imposait trois repas à tout le monde, en dur; une faim de 17h n'avait
            aucun endroit où exister. La carte est ici et pas dans le formulaire
            de génération: le nombre de fois qu'on mange est une propriété d'une
            vie, pas d'une semaine. */}
        <EatingRhythmCard
          hasGoal={goal !== null}
          practicalConstraints={goal?.practical_constraints ?? {}}
          rhythm={parseEatingRhythm(goal?.practical_constraints?.eating_rhythm)}
          onSaved={refresh}
        />

        {/* CE QUE L'ÉLÈVE PEUT VRAIMENT FAIRE. Sous le rythme, et avant le
            constructeur: on dit d'abord quand on mange, puis ce qu'on peut
            cuisiner, et seulement ensuite on compose. `cooking_time_min` et
            `budget_band` existaient dans la colonne depuis le premier jour du
            pivot — lues par le générateur, remplies par personne. */}
        <CookingCapacityCard
          hasGoal={goal !== null}
          practicalConstraints={goal?.practical_constraints ?? {}}
          onSaved={refresh}
        />

        {/* CE QU'IL A DIT SUR SA BOUFFE, remonté de la conversation. En
            DERNIER des trois cartes et juste avant le constructeur, parce que
            c'est la couche la plus personnelle: le rythme dit quand il mange,
            la capacité ce qu'il peut cuisiner, et ceci ce qu'il aime — dans ses
            mots. C'est aussi la seule des trois qu'il n'a pas eu à remplir:
            elle se remplit toute seule à partir de ce qu'il a déjà raconté, et
            il n'a qu'à confirmer. */}
        <FoodPreferencesCard
          hasGoal={goal !== null}
          practicalConstraints={goal?.practical_constraints ?? {}}
          onSaved={refresh}
        />

        <MealBuilder />
      </div>
    </KeelAppShell>
  );
}
