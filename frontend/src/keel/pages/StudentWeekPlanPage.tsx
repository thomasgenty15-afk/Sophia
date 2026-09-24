import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
// `Field` n'est plus utilisé: les deux zones de texte qu'il habillait ont
// disparu de cet écran (« Your situation » retirée, l'aspiration passée dans
// l'option choisie, avec son propre `label`).
import { inputClass } from "../components/ui/Field";
import Modal from "../components/ui/Modal";
import SetupSection from "../components/ui/SetupSection";
import MealBuilder from "../components/MealBuilder";
import MyShareCard from "../components/plan/MyShareCard";
import PlanDraftDialog from "../components/plan/PlanDraftDialog";
// LOT D — le retour de fin de plan. Les questions viennent du module serveur,
// jamais d'une seconde table écrite ici.
import PlanFeedbackDialog from "../components/plan/PlanFeedbackDialog";
import {
  dismissPlanFeedback,
  loadPlanAwaitingFeedback,
  newEnvyIsAsked,
  type PlanAwaitingFeedback,
  questionsFor,
  submitPlanFeedback,
} from "../api/planFeedback";
import { windowDayOrder } from "../api/mealWindow";
import { selectMyShare } from "../api/myShare";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  answerNote,
  type ComposeDraftInput,
  composeDraft,
  discardDraft,
  editCells,
  editExclusions,
  type PlanDraft,
  readNote,
  readRejections,
  replaceDishes,
  DRAFT_ORIGIN_PATH,
  recoverLatestDraft,
  windowFromToday,
  waitForDraft,
  writeFromDraft,
  type DraftProgress,
} from "../api/planDraft";
import { loadMealPlans } from "../api/mealGeneration";
// LA TABLE DES REFUS EST FERMÉE ET PARTAGÉE. Un jeton inconnu ressort tel quel,
// jamais sous une phrase passe-partout: `note_unusable` est le seul refus que la
// personne peut réparer elle-même, et il doit arriver lisible.
import { planFailureKey } from "../copy/planRefusals";
import {
  type HouseholdMealView,
  type HouseholdView,
  loadHousehold,
  loadHouseholdMeal,
  loadMyHouseholdPlace,
  // LOT D — l'envie apparue en cours de plan part dans le canal QUI EXISTE.
  // Pas de second canal d'envies: ce wrapper est le seul écrivain de la ligne
  // que le générateur lit à chaque composition.
  submitEnvy,
} from "../api/household";
import { browserLocalDate } from "../lib/useMealTicks";
import CookingCapacityCard from "../components/CookingCapacityCard";
import { parseEatingRhythm } from "../api/mealGeneration";
// ⛔ `parseAwayMarks` ET SURTOUT PLUS `parseAwayDays` — DÉFAUT P1 (L6,
// 2026-08-18). Cette page était le QUATRIÈME point de montage de la grille de
// présence, et le dernier à lire la colonne d'absences sans son jeton `kind`:
// `parseAwayDays` ne garde que `day` et `slots`, donc « dehors » ressortait
// « absent » au premier enregistrement de la grille — même sans toucher une
// case. Les quatre écrans lisent maintenant pareil, et `MealPickerGridProps.away`
// refuse désormais un tableau sans jeton, à la compilation.
import { type AwayMark, parseAwayMarks } from "../lib/presenceMarks";
// ⛔ `mealCopy` EST PARTI AVEC `rhythmSummary` (2026-09-21): il ne servait
// qu'à nommer les moments de la ligne « Ta journée » de la carte retirée.
import { dishDayLabel } from "../api/mealLabels";
import { mergePracticalConstraints } from "../api/practicalConstraints";
import { sendChatMessage } from "../api/chat";
// `weekStartFor` — LOT D: la ligne d'envies est ancrée sur un LUNDI ISO, et la
// table n'en accepte pas d'autre. Recaler ici plutôt qu'envoyer un mardi:
// l'écriture le corrigerait, la relecture filtre en SQL, et « rien écrit »
// s'afficherait juste après avoir écrit.
import { addDays, weekStartFor } from "../api/dates";
import {
  type BodyMeasureRow,
  FOCUS_AXES,
  focusAxisLabel,
  type FocusAxis,
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  indicatorFor,
  latest,
  readMeasureInput,
  type ReviewRow,
  WAIST_CM_MAX,
  WAIST_CM_MIN,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
  weeklyMeasures,
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
import { t } from "../i18n/t";
// ⚠️ `goalOptions` VIT DANS `lib/`, PAS ICI. Un fichier qui exporte des
// composants ne peut rien exporter d'autre sans désarmer le rafraîchissement
// à chaud (`react-refresh/only-export-components`).
import { goalOptions } from "../lib/goalOptions";
// ⟳ LOT 5 — LES DEUX INTERRUPTEURS DU CHIFFRE, DANS LA FENÊTRE OÙ L'ON VIENT
// RÉGLER QUELQUE CHOSE. Le composant et le hook sont ceux de `MealBuilder`,
// importés et pas réécrits: la règle d'affichage vient du serveur, et deux
// écritures de « qui a le droit de voir ce bouton » finiraient par diverger sur
// la garde la plus sensible du produit.
import { buildMeasuresToken } from "../../../../supabase/functions/_shared/keel/weekly_flow.ts";
// ⟳ 2026-09-24 (lot 4a) — QUATRE MODULES SORTIS DE CE FICHIER, À L'IDENTIQUE,
// dans `weekPlan/`: les dates (`dates.ts`), la cible d'une dynamique
// (`GoalTargetField.tsx`), le duo enregistrer/annuler (`CellActions.tsx`), et
// les infos de base avec les mesures (`PersonalNumbers.tsx`). Ils font partie
// de la famille de ce fichier (`scripts/source-families.json`), que les tests
// lisent à la place du fichier seul. `CellActions` ne sert plus qu'à
// `PersonalNumbers`: son import sans nom ci-dessous est là parce que
// `source_family_registry_test.ts` exige que chaque module de la famille soit
// importé directement par ce fichier. Il ne change rien au rendu.
import type { Basics } from "./weekPlan/types.ts";
import { ageFrom, currentMonday, todayIso } from "./weekPlan/dates.ts";
import { GoalTargetField } from "./weekPlan/GoalTargetField.tsx";
import "./weekPlan/CellActions.tsx";
import { PersonalNumbers } from "./weekPlan/PersonalNumbers.tsx";

export type { Basics } from "./weekPlan/types.ts";

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
// ⟳ 2026-09-09 — LE SOUS-TITRE EST RETIRÉ, sur demande, et sa clé avec lui.
// Il disait ce que la page montre juste en dessous: des plats, un rythme, et
// une carte « À propos de toi » qui nomme déjà l'objectif et la méthode. Une
// phrase qui paraphrase l'écran qu'elle surplombe coûte une hauteur de lecture
// et ne rend rien.
//
// ⛔ LA CLÉ EST SUPPRIMÉE DES DEUX PACKS, pas laissée en place « au cas où ».
// Une clé traduite que rien ne rend est de la copie morte — et ce dépôt a déjà
// payé l'inverse exact (`tracking.describe.done`, déclarée dans les deux packs,
// jamais rendue, et qui affirmait le contraire de ce que son chemin faisait).
// Le seul reste de la promesse qui TENAIT — « rien ici ne te note » — vit
// toujours dans le corps de l'écran, là où le chiffre s'affiche.



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
 * Server error codes, in the student's words.
 *
 * Kept as a map rather than shown raw: `coach_has_no_doctrine` on screen tells
 * a student nothing, and each of these calls for a different next move. An
 * unknown code still falls through to the raw string — a silent generic message
 * would hide a fault we need to see.
 */


export default function StudentWeekPlanPage() {
  // A8.1 — LE COMPTE QUI REGARDE. Il servait déjà six fois dans ce fichier,
  // mais toujours relu au coup par coup (`supabase.auth.getUser()` dans un
  // gestionnaire). `MyShareCard` en a besoin AU RENDU, pour lier ses coches:
  // une lecture asynchrone dans un handler ne peut pas alimenter une case.
  //
  // ⚠️ EN COMMENTAIRE DE LIGNE, ET PAS EN BLOC `/** */`. Un bloc placé JUSTE
  // après l'accolade ouvrante de la fonction fait matcher le motif de
  // dépouillement `{ /* … */ }` que plusieurs tests appliquent à ce fichier
  // (`mealTicks.int.test.ts`, `dishListByDay.int.test.ts`): la source lue par
  // le test perdait alors TOUT jusqu'au prochain `*/}`, des centaines de
  // lignes plus bas, et les épreuves échouaient sur du code bien présent.
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
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

  /**
   * ══════════════════════════════════════════════════════════════════════
   * LE BROUILLON (Lot C) — L'APERÇU QUI N'ÉCRIT RIEN.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⚠️ `draft === null` VEUT DIRE « rien à montrer », ET LA FENÊTRE NE
   * S'OUVRE PAS SUR DU VIDE. Un placeholder qui rend une constante est un
   * lecteur mort — c'est l'erreur mesurée juste au-dessus, sur `MyShareCard`,
   * dont le site de montage passait `mine={null}` en dur pendant que la carte,
   * ses neuf tests et sa garde d'identité étaient verts.
   */
  const [draft, setDraft] = React.useState<PlanDraft | null>(null);
  /**
   * LA PHRASE QUI A PRODUIT L'APERÇU QU'ON REGARDE. `null` = aucune.
   *
   * ⚠️ ELLE DOIT SURVIVRE JUSQU'À L'ADOPTION, ET C'EST TOUT SON INTÉRÊT. Le
   * serveur relit `draft_note` sur TOUS les `intent`, exprès: « une adoption
   * qui perdrait la phrase écrirait un plan qui n'est pas celui qu'on a
   * montré ». Adopter en la laissant tomber composerait un plan sans les pizzas
   * du midi, juste après en avoir montré un qui les portait.
   *
   * C'est la DERNIÈRE phrase, pas leur concaténation: chaque reprise repart de
   * la demande d'origine plus une phrase, jamais de l'empilement des trois.
   */
  // ⛔ PLUS DE `draftNote` (lot 4, 2026-09-08): lire la phrase c'est
  // l'appliquer, et la retenir pour l'adoption la faisait relire — un cran
  // d'appétit appliqué deux fois. Voir `composeDraft`.
  /**
   * ⟳ 2026-09-21 — UN BROUILLON EN ATTENTE NE SE PERD PLUS: LA FENÊTRE EST
   * OUVERTE **TANT QU'IL EXISTE**.
   *
   * ── LE DÉFAUT, SIGNALÉ ────────────────────────────────────────────────
   * « Quand on a un plan en attente d'être validé ou annulé, il faut que
   * l'écran revienne à la pop-up du draft, sinon ça se perd et on peut plus
   * jamais y accéder. » C'était exact DANS LA SESSION: « Laisser tomber »
   * fermait la fenêtre (`setDraftOpen(false)`) et laissait `draft` en
   * mémoire. Plus rien ne le montrait, et plus aucun geste ne le rouvrait —
   * la seule issue était de recomposer, c'est-à-dire un tour de modèle de
   * plus pour un brouillon déjà payé.
   *
   * ── LA RÈGLE ──────────────────────────────────────────────────────────
   * Il n'y a plus d'état d'ouverture. La fenêtre est ouverte si et seulement
   * si un brouillon existe; « Laisser tomber » le jette (`setDraft(null)`),
   * l'adoption aussi. Deux états qui pouvaient diverger n'en font plus qu'un.
   *
   * ⚠️ ET ÇA REJOINT LA GARDE DU 2026-09-07 (`closeOnlyByButton`): on ne sort
   * de cette fenêtre que par un de ses boutons. Un état « fermé mais
   * existant » était le dernier chemin qui la contournait.
   *
   * ⟳ 2026-09-23 — « LAISSER TOMBER » EST UNE RÉPONSE, RANGÉE EN BASE.
   * La ligne restait `done` jusqu'à son `expires_at`, et `recoverLatestDraft()`
   * la rouvrait à chaque retour sur l'onglet. Signalé : « je viens de cliquer
   * sur Laisser tomber, et ça me redemande de valider ». Un brouillon n'a que
   * deux fins, « Valider » (`adopted`) ou « Laisser tomber » (`discarded`,
   * `discardDraft`). Et un nouveau brouillon prêt refuse ceux qui n'ont pas eu
   * de réponse (déclencheur en base, 20260923130000) : c'est le sens de « ça
   * permet de pas faire 25k plans ».
   */
  const [draftBusy, setDraftBusy] = React.useState(false);
  /** ⟳ 2026-09-15 · LOT B — le stade réel de la composition, lu dans la ligne. */
  const [draftProgress, setDraftProgress] = React.useState<DraftProgress | null>(null);
  const [draftFailure, setDraftFailure] = React.useState<string | null>(null);
  /**
   * ⟳ 2026-09-23 — UNE COMPOSITION EN VOL, RETROUVÉE AU MONTAGE ET SUIVIE.
   * Distinct de `draftBusy`, qui couvre aussi l'adoption et la reprise depuis
   * la fenêtre : seul ce cas-ci remet l'écran d'attente de `MealBuilder`.
   */
  const [resumingDraft, setResumingDraft] = React.useState(false);
  /**
   * ⟳ 2026-09-21 — D'OÙ VIENT L'APERÇU OUVERT, ET COMMENT IL S'ADOPTE.
   *
   * `null` = la carte « Prévisualiser » (première fenêtre libre,
   * `prepare_next`). Sinon « Composer un autre plan » l'a remis à la page avec
   * SON entrée (fenêtre, mode de cuisson) et SON intention: `replace_current`
   * nomme le plan que l'adoption retirera. Un seul dialogue pour les deux
   * gestes — reprise, cases refaites, adoption — et c'est ce champ qui dit
   * lequel écrit quoi.
   */
  const [draftSource, setDraftSource] = React.useState<{
    input: ComposeDraftInput;
    intent: "replace_current" | "prepare_next";
    replaces: string | null;
  } | null>(null);
  /**
   * ⟳ 2026-09-21 — « COMPOSER UN AUTRE PLAN » PASSE PAR L'APERÇU. Vu à
   * l'écran: le bouton écrivait le plan en un seul geste, sans la fenêtre
   * d'aperçu ni « Ajuster le plan ». La page compose le brouillon (avec
   * `replaces`, sinon la garde de chevauchement le refuse), l'ouvre, et
   * l'adoption écrit avec la même intention.
   */
  const previewPlan = React.useCallback(async (args: {
    input: ComposeDraftInput;
    intent: "replace_current" | "prepare_next";
    replaces: string | null;
    onProgress: (progress: DraftProgress) => void;
  }) => {
    setDraftBusy(true);
    setDraftFailure(null);
    try {
      const composed = await composeDraft(args.input, {
        onProgress: args.onProgress,
        replaces: args.intent === "replace_current" ? args.replaces : null,
      });
      setDraftSource({ input: args.input, intent: args.intent, replaces: args.replaces });
      setDraft(composed);
    } finally {
      setDraftBusy(false);
      setDraftProgress(null);
    }
  }, []);
  /**
   * LOT D — LE PLAN ÉCOULÉ QUI ATTEND SON RETOUR. `null` = il n'y en a pas, et
   * c'est le cas nominal.
   *
   * ⚠️ `feedbackOpenedOnce` EST UNE `ref`, PAS UN ÉTAT: `refresh()` est rappelé
   * après chaque enregistrement de la page, et un état ferait resurgir le
   * questionnaire que la personne vient de fermer. Même patron que
   * `openedOnce` pour la fenêtre de réglage.
   */
  const [feedbackPlan, setFeedbackPlan] = React.useState<
    PlanAwaitingFeedback | null
  >(null);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const feedbackOpenedOnce = React.useRef(false);
  /**
   * LES PLANS VIVANTS, lus par `loadMealPlans` — la MÊME fonction que
   * `MealBuilder`, pas une seconde requête écrite ici.
   *
   * ⚠️ ILS NE SERVENT QU'À UNE CHOSE: SAVOIR OÙ IL Y A DE LA PLACE. La garde
   * de chevauchement mord BIEN AVANT le seam du brouillon (mesuré côté
   * serveur: « toute demande sur ces jours rend `plan_overlaps_existing` sans
   * jamais atteindre le seam »), et `intent: "draft"` REFUSE `replaces`. Un
   * aperçu ne peut donc jamais porter sur une fenêtre déjà occupée: il porte
   * sur la première fenêtre LIBRE, c'est-à-dire sur la semaine qu'on prépare.
   */
  const [livePlans, setLivePlans] = React.useState<{
    /**
     * ⟳ LOT 5 — `mealId` S'AJOUTE, ET IL NE SERT QU'AUX INTERRUPTEURS.
     *
     * ⚠️ PAS UNE SECONDE REQUÊTE. `loadMealPlans` rendait déjà le plan entier
     * et cet état n'en gardait que les dates; on retient l'identifiant qu'il
     * portait, rien de plus. Une lecture de plus ici pour un bouton serait le
     * second point de vérité que `refreshLivePlans` existe pour éviter.
     *
     * `null` quand il n'y a pas de plan vivant — et il n'y a alors aucun
     * chiffre à éteindre ni à rallumer, donc rien à proposer.
     */
    current: { startsOn: string; durationDays: number; mealId: string | null } | null;
    next: { startsOn: string; durationDays: number } | null;
  }>({ current: null, next: null });
  /** ⟳ 2026-09-16 — monte à chaque relecture des plans ; `MealBuilder` relit dessus. */
  const [plansVersion, setPlansVersion] = React.useState(0);
  // `situation` a disparu du formulaire — voir le commentaire de `saveGoal`.
  const [goalDraft, setGoalDraft] = React.useState({
    // Repli du 2026-08-18: valait `"health"`, retiré du vocabulaire. Un
    // jeton mort ici n'est pas cosmétique — `indicatorFor` est un `switch`
    // sans `default` sur les TROIS survivants, et le `as GoalToken` des
    // appelants désarme l'exhaustivité qui l'aurait attrapé: tant que la
    // lecture n'a pas remplacé cet état (aucune ligne `student_goals`), le
    // formulaire déréférençait `undefined.target`.
    goal: "maintenance",
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
  // ⟳ 2026-09-23 · FF-066 LOT 4 — L'ÉTAT DES DEUX INTERRUPTEURS EST PARTI D'ICI,
  // avec leur section. Ils vivaient dans la fenêtre « À propos de toi », que
  // plus rien n'ouvrait depuis le 2026-09-21: un réglage de calories qu'on ne
  // peut plus atteindre, c'est un chiffre qu'on ne peut plus faire taire. Leur
  // seule adresse est maintenant `/app/about-you` (`StudentKnownPage`,
  // `PlanNumbersSection`).
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

  /**
   * OÙ IL Y A DE LA PLACE — lu à part, et tolérant à l'échec.
   *
   * Un aperçu est un CONFORT: si cette lecture rate, le geste se propose quand
   * même sur la fenêtre d'aujourd'hui, et c'est alors le serveur qui dira
   * `plan_overlaps_existing`, nommément. Faire tomber la page entière pour un
   * bouton d'aperçu serait le mauvais côté de l'arbitrage.
   */
  const refreshLivePlans = React.useCallback(async (uid: string) => {
    try {
      const loaded = await loadMealPlans(uid, browserLocalDate());
      setLivePlans({
        current: loaded.current
          ? {
            startsOn: loaded.current.startsOn,
            durationDays: loaded.current.durationDays,
            mealId: loaded.current.mealId,
          }
          : null,
        next: loaded.next
          ? { startsOn: loaded.next.startsOn, durationDays: loaded.next.durationDays }
          : null,
      });
    } catch {
      setLivePlans({ current: null, next: null });
    }
    // « Tes repas » (MealBuilder) charge ses plans lui-même : on lui dit qu'ils ont bougé.
    setPlansVersion((v) => v + 1);
  }, []);

  const refresh = React.useCallback(async () => {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) throw new Error("not_signed_in");
    void refreshHousehold(uid);
    void refreshLivePlans(uid);

    // ── `user_id` SUR CHAQUE LECTURE, ET RLS N'EN DISPENSE PAS ──────────────
    // Deux de ces tables portent une policy COACH en plus de celle du
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
    // ⚠️ `student_week_plans` A ÉTÉ RETIRÉE DE CETTE LECTURE LE 2026-08-19, ET
    // ELLE N'Y REVIENT PAS PAR SYMÉTRIE. La ligne était lue, son `.error`
    // pouvait faire tomber la page entière — et sa `data` n'était JAMAIS
    // utilisée: aucune des deux occurrences de `planRes` n'en lisait le
    // contenu. Un aller-retour réseau et un mode de panne, pour rien. La lane
    // qui écrivait cette table est partie le même jour (voir
    // `api/weekPlan.ts`); la table, elle, reste.
    const [goalRes, reviewRes, measureRes, profileRes] = await Promise.all([
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

    // ══════════════════════════════════════════════════════════════════════
    // LOT D — LE PLAN QUI S'EST ACHEVÉ ET QUI ATTEND SON RETOUR.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⚠️ IL S'OUVRE DE LUI-MÊME, ET UNE SEULE FOIS PAR CHARGEMENT. Personne ne
    // clique sur un bouton pour découvrir une question qu'il ignore — même
    // raisonnement que la fenêtre de réglage juste au-dessus, et même garde
    // (`openedOnce`-like): un enregistrement dans la page rappelle `refresh`,
    // et rouvrir sur cette relecture ferait resurgir le questionnaire que la
    // personne vient de fermer.
    //
    // ⚠️ UNE LECTURE QUI ÉCHOUE NE COÛTE PAS LA PAGE. Ce questionnaire est un
    // BONUS: `/app/plan` doit s'ouvrir même si `meal_plan_feedback` est
    // injoignable. D'où le `catch` silencieux — et il est silencieux ici
    // seulement, parce que rien de ce qu'il porte n'est nécessaire à lire son
    // plan.
    try {
      const awaiting = await loadPlanAwaitingFeedback(uid, browserLocalDate());
      setFeedbackPlan(awaiting);
      if (awaiting && !feedbackOpenedOnce.current) {
        feedbackOpenedOnce.current = true;
        setFeedbackOpen(true);
      }
    } catch {
      setFeedbackPlan(null);
    }
  }, [weekStart, refreshHousehold, refreshLivePlans]);

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

  /* ⛔ ICI SE TENAIT `rhythmSummary` — la ligne « Ta journée » de la carte
     « À propos de toi », retirée le 2026-09-21. Son SEUL lecteur était cette
     carte: la fenêtre de réglages, elle, résume le rythme par sa propre
     section. `personalSummary` et `cookingSummary` survivent pour cette
     raison — ils sont passés en `summary` à deux `SetupSection`. */

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

  /**
   * ══════════════════════════════════════════════════════════════════════
   * LA DEMANDE D'APERÇU — LES MÊMES ENTRÉES À CHAQUE TOUR.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE COMMENTAIRE NE REMPLACE JAMAIS LE RESTE. Le tour N part avec
   * EXACTEMENT les mêmes entrées que le tour 1 — seule la phrase s'ajoute. Un
   * sous-ensemble au second tour ferait composer un plan pour une vie que la
   * personne n'a pas, et c'est le commentaire qui aurait gagné contre son
   * objectif. Cette fonction est donc la source UNIQUE des entrées: l'aperçu,
   * la reprise et l'adoption l'appellent tous les trois.
   *
   * ⚠️ ⟳ 2026-09-10 · LOT 7 — PLUS DE LANE. `generate-household-meal-v1` est
   * le seul moteur; le compte de bouches ne décide plus de rien, et `isOwner`
   * ne sert plus ici mais UN CRAN PLUS HAUT: `mayCompose` décide si la carte
   * d'aperçu est rendue du tout. Un secondaire ne doit pas voir le bouton — le
   * serveur lui rend 403 `not_owner`, et un geste dont la seule issue est un
   * refus est un bouton mort.
   */
  const draftInput = React.useCallback((): ComposeDraftInput => {
    // LA PREMIÈRE FENÊTRE LIBRE. `next` d'abord: s'il existe, c'est lui qui
    // occupe le plus loin. Aucun plan vivant ⇒ aujourd'hui.
    const anchor = livePlans.next ?? livePlans.current;
    const startsOn = anchor
      ? addDays(anchor.startsOn, anchor.durationDays)
      : todayIso();
    return {
      origin: "plan",
      // `exact` et pas `until_sunday`: la fenêtre libre commence là où le
      // dernier plan finit, ce qui n'est pas un dimanche en général. Demander
      // « jusqu'à dimanche » rendrait une fenêtre qui chevauche.
      window: { kind: "exact", startsOn, durationDays: 7 },
      // ── LOT B · LE MODE DE CUISSON — `null` ICI, ET C'EST UNE DÉCISION ──
      // Cette carte-ci est un APERÇU SANS FORMULAIRE: un seul bouton, aucune
      // entrée. Le champ des trois modes vit sur l'écran qui COMPOSE
      // (`MealBuilder`, juste au-dessus sur cette même page, et l'entonnoir), à
      // côté du budget et des jours de cuisine — c'est là que la question a un
      // sens, et c'est là qu'elle est posée.
      //
      // `null` dit « je ne demande rien », donc le calcul du moteur gouverne
      // seul: la sortie de cette carte est byte-identique à celle d'avant ce
      // lot. Y glisser un défaut en dur reproduirait très exactement le
      // `mine={null}` qui a rendu muet un lot entier.
      cookingShape: null,
      // ── `false` ICI, ET POUR LA MÊME RAISON QUE LA LIGNE DU DESSUS ─────
      // Cette carte est un APERÇU SANS FORMULAIRE: un seul bouton, aucune
      // entrée. La case « tout cuisiner en une seule fois » vit sur l'écran qui
      // COMPOSE (`MealBuilder`, juste au-dessus sur cette même page, et
      // l'entonnoir), sous les jours de cuisine qu'elle réduit — c'est là
      // qu'elle a un sujet.
      //
      // `false` dit « je ne demande rien », donc la sortie de cette carte est
      // byte-identique à celle d'avant ce lot. Y glisser `true` en dur
      // reproduirait le `mine={null}` qui a rendu muet un lot entier.
      oneCookingSession: false,
      // ⟳ 2026-09-10 · LOT 7 — `mode`, `slot`, `servings` et `pantry` ONT
      // QUITTÉ `ComposeDraftInput` avec l'ancienne lane individuelle; ils
      // étaient déjà des constantes ici. Le budget, les jours de cuisine et le
      // temps disponible ne sont PAS ici non plus, et pour une autre raison: le
      // générateur les relit dans `practical_constraints`, et les passer dans
      // le corps ferait deux sources pour un seul chiffre — c'est toujours
      // celle que l'écran ne montre pas qui gagne.
      context: null,
      preferences: null,
    };
  }, [livePlans]);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * LE MOTIF NOMMÉ, EN PHRASE — ET IL PASSE PAR ICI OU IL NE PASSE PAS.
   * ══════════════════════════════════════════════════════════════════════
   *
   * 🔴 MESURÉ DANS LE NAVIGATEUR LE 2026-08-14: sans cette fonction, la
   * fenêtre de brouillon affichait le JETON BRUT — « note_unusable », en
   * rouge, sous le champ. La traduction ne vivait que dans le chemin
   * d'ouverture (`askForDraft`); la REPRISE et l'ADOPTION, elles, laissaient
   * remonter `Error.message` tel quel jusqu'au `catch` du composant.
   *
   * C'est le défaut classique de ce dépôt sous une autre forme: une table de
   * refus fermée, traduite à UN endroit du chemin et pas aux deux autres. Un
   * jeton nu à l'écran n'apprend rien à la personne, et `note_unusable` est
   * précisément le seul refus qu'elle peut réparer elle-même — en reformulant.
   *
   * ⚠️ UN JETON INCONNU RESSORT TEL QUEL, jamais sous une phrase
   * passe-partout: « une erreur est survenue » ferait perdre la seule
   * information utile, et masquerait un jeton qu'on aurait dû voir arriver.
   */
  const draftRefusal = React.useCallback((e: unknown): string => {
    const raw = e instanceof Error ? e.message : String(e);
    // `planFailureKey` ET PAS `edgeRefusalKey`: `plan_still_composing` et
    // `plan_expired` sont des issues du NAVIGATEUR (`CLIENT_OUTCOME_KEYS`),
    // et l'autre traducteur les rendait en jeton brut (mesuré le 2026-09-15).
    const key = planFailureKey(raw.split(":")[0]);
    return key ? t(key) : raw;
  }, []);

  const recoveredDraftFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!userId || recoveredDraftFor.current === userId) return;
    // ⛔ LA GARDE SE POSE À L'ATTERRISSAGE, PAS AU DÉPART. Posée ici, avant
    // l'`await`, elle tuait la reprise en développement : `StrictMode` monte
    // l'effet deux fois, le premier passage était annulé par son nettoyage
    // et le second refusé par la garde — la ligne `done` était lue (une
    // requête, 200) et jetée. Mesuré le 2026-09-21 sur `a74f96af`.
    let cancelled = false;
    void (async () => {
      try {
        const recoverable = await recoverLatestDraft();
        if (cancelled || recoverable === null) return;
        // ⟳ 2026-09-21 — L'APERÇU ROUVRE SUR SA SURFACE D'ORIGINE. Demandé
        // depuis l'entonnoir, il se rouvre dans l'entonnoir : « Laisser
        // tomber » y ramène là où on était. Sans origine (ligne d'avant ce
        // lot), il s'ouvre ici.
        if (recoverable.origin === "setup") {
          navigate(DRAFT_ORIGIN_PATH.setup, { replace: true });
          return;
        }
        setDraftBusy(true);
        // ⟳ 2026-09-23 — L'ÉCRAN D'ATTENTE REVIENT AVEC L'ATTENTE. Sans ça, la
        // page suivait la ligne en silence et la fenêtre surgissait à la fin :
        // « je suis revenu sur le plan, le chargement avait disparu ».
        if (recoverable.state === "in_flight") setResumingDraft(true);
        const recovered = recoverable.state === "done"
          ? recoverable.draft
          : await waitForDraft(recoverable.draftId, { onProgress: setDraftProgress });
        if (cancelled) return;
        // ⟳ 2026-09-21 — LA SOURCE REVIENT AVEC L'APERÇU. Sans elle, le
        // bouton adoptait en `prepare_next` un brouillon qui remplaçait le
        // plan courant, et le serveur refusait le chevauchement.
        setDraftSource({
          // ⟳ 2026-09-22 — SA demande, relue dans la ligne ; la devinette de
          // la page seulement pour une ligne d'avant ce lot.
          input: recoverable.input ?? draftInput(),
          intent: recoverable.replaces === null ? "prepare_next" : "replace_current",
          replaces: recoverable.replaces,
        });
        setDraft(recovered);
        setDraftFailure(null);
      } catch (error) {
        if (!cancelled) setDraftFailure(draftRefusal(error));
      } finally {
        if (!cancelled) {
          recoveredDraftFor.current = userId;
          setDraftBusy(false);
          setResumingDraft(false);
          setDraftProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, draftRefusal, navigate, draftInput]);

  /**
   * COMPOSER UN APERÇU, ET OUVRIR LA FENÊTRE SUR CE QU'IL A RENDU.
   *
   * ⚠️ LA FENÊTRE NE S'OUVRE QU'APRÈS: `PlanDraftDialog` ne montre rien tant
   * que `draft` est nul, et l'ouvrir d'abord ferait regarder un cadre vide
   * pendant deux minutes. Le geste dit qu'il travaille là où on a cliqué.
   */
  // ⟳ 2026-09-23 — SANS APPELANT depuis le retrait de la carte d'aperçu
  // (section 10, 2026-09-21), GARDÉE EXPRÈS: c'est le chemin `prepare_next`
  // de l'aperçu, et des tests de câblage lisent sa définition dans la source
  // (`setupDraftWiring`, `eatingRhythm`). Dérogation qui part avec elle.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const askForDraft = React.useCallback(async () => {
    setDraftBusy(true);
    setDraftFailure(null);
    try {
      // ⟳ 2026-09-10 · LOT 7 — LE PARAMÈTRE `note` A DISPARU D'ICI. Son seul
      // appelant avec une phrase était « Demander une modif » (la carte de part
      // d'un membre secondaire), et ce bouton n'existe plus: un secondaire ne
      // compose rien. Le laisser aurait gardé un `readNote` dont la question
      // TOMBE — aucun dialogue n'est ouvert à ce moment pour la poser.
      //
      // ⚠️ LE CHEMIN DE LA PHRASE N'EST PAS PERDU: il vit dans le dialogue
      // d'aperçu (`onReadNote`, plus bas), qui LUI peut afficher la question et
      // attendre la réponse avant de recomposer.
      const composed = await composeDraft(draftInput(), { onProgress: setDraftProgress });
      setDraftSource({ input: draftInput(), intent: "prepare_next", replaces: null });
      setDraft(composed);
      // (voir `draftRefusal` pour la traduction du motif)
    } catch (e) {
      setDraftFailure(draftRefusal(e));
    } finally {
      setDraftBusy(false);
      setDraftProgress(null);
    }
  }, [draftInput, draftRefusal]);

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
  const saveAwayDays = async (next: AwayMark[]) => {
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
      <KeelAppShell variant="student" title={pageTitle()}>
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
    <KeelAppShell variant="student" title={pageTitle()}>
      <div className="space-y-6">
        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-ink">{t("plan.error.failed")}</p>
            <p className="mt-1 text-xs text-ink-soft">{failure}</p>
          </Card>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════
            ⛔ ICI SE TENAIT LA CARTE « À PROPOS DE TOI » — RETIRÉE 2026-09-21
            ══════════════════════════════════════════════════════════════

            Un en-tête, un bouton « Modifier », et quatre lignes de résumé:
            Chiffres · Objectif · Ta journée · Dernier plan demandé. Elle était
            l'INDEX de la fenêtre de réglages juste en dessous — « une carte,
            un bouton, et les quatre réponses lisibles sans rien ouvrir ».

            Retirée sur demande: « supprime la partie UI du "à propos de toi"
            dans Le plan de ma semaine ». Ce que ça ne coûte pas, vérifié avec
            l'utilisateur avant le geste: **les mêmes réglages s'atteignent par
            le foyer** (`/app/household`, la fiche d'une bouche) et par
            l'entonnoir (`/app/setup`). Aucun champ ne devient inaccessible.

            ⚠️ CE QUE ÇA LAISSE OUVERT, ET IL FAUT LE SAVOIR: son bouton était
            le SEUL ouvreur de la fenêtre pour quelqu'un qui a déjà un
            objectif. Le second (`setSetupOpen(true)`, à la relecture) ne tire
            qu'au tout premier passage, `!g && !openedOnce` — et la garde de
            route envoie de toute façon un compte sans objectif sur
            `/app/setup`. La fenêtre et ses quatre sections sont donc
            probablement injoignables depuis cette page. Elles ne sont PAS
            retirées ici: c'est trois cents lignes et quatre formulaires, et ce
            lot-ci n'était pas ça. */}

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
                            // ⚠️ PAS DE `as GoalToken` SUR `g.value`: il vient
                            // de `GOAL_TOKENS`, donc il EST un `GoalToken`, et
                            // l'exhaustivité de `indicatorFor` reste armée. Le
                            // cast survit sur `p.goal`, qui vient d'une ligne
                            // de base et n'est qu'une chaîne.
                            target:
                              indicatorFor(p.goal as GoalToken).target ===
                                  indicatorFor(g.value).target
                                ? p.target
                                : "",
                            // L'axe ne survit qu'entre dynamiques qui en ont
                            // un. L'aspiration, elle, survit toujours: elle ne
                            // dépend d'aucune dynamique.
                            axis: indicatorFor(g.value).axisObjective
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

        {/* ⟳ 2026-09-23 · FF-066 LOT 4 — LA SECTION « CE QUE TON PLAN AFFICHE »
            EST PARTIE D'ICI: cette fenêtre n'a plus d'ouvreur depuis le
            2026-09-21 (voir plus haut). Elle vit sur `/app/about-you`, un écran
            où l'on vient pour régler — ses gardes avec elle. */}

        {/* ══ 2026-09-19 · « COMMENT SE PASSE TA JOURNÉE » EST DÉMONTÉE ════
            ══════════════════════════════════════════════════════════════════

            Elle rendait `EatingRhythmCard`: les six moments à cocher, avec une
            TAILLE par moment, écrits dans `practical_constraints.eating_rhythm`.

            ⛔ ELLE POSAIT LA MÊME QUESTION QUE LA FICHE DU FOYER. « Quand tu
            manges, et quoi » (`MouthPreferencesFields`, sur `/app/household`)
            coche les six mêmes moments et écrit la MÊME colonne. Deux
            formulaires sur une colonne, sur deux écrans — et c'est celui qu'on
            ne relit pas qui finit par gagner. Décision du propriétaire,
            2026-09-19: « on ne pose plus jamais ces questions ».

            ⚠️ IL RESTE DONC UN SEUL ÉCRIVAIN, et c'est celui de la fiche:
            `ownFiche.setRhythm` → `saveEatingRhythm`. L'entonnoir écrit la même
            colonne par le même écrivain. Vérifié bout en bout le 2026-09-19:
            cocher « Après-midi » dans la fiche du foyer change le résumé
            « Ta journée » de cette page ET les moments que le plan compose.

            ⚠️ CE QUE LE RETRAIT COÛTE, ÉCRIT POUR QUE PERSONNE NE LE
            REDÉCOUVRE: la TAILLE par moment (`small` / `medium` / `large`)
            n'avait de contrôle QUE là. La colonne la porte toujours et le
            moteur la relit (`buildPortionBrief`); plus aucun écran ne la règle.
            C'est assumé — c'est la moitié de ce que le propriétaire a demandé
            de faire disparaître.

            `rhythmSummary` VIT TOUJOURS: il est le résumé « Ta journée » du
            cadre « À propos de toi », en haut de cette page. */}

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

        {/* ══ LOT C (2026-09-03) · LA SECTION « CE QUE TU M'AS DIT » EST
            DÉMONTÉE, ET CE N'EST PAS UN DÉPLACEMENT ══════════════════════════

            Elle rendait `FoodPreferencesCard`: les souvenirs que le memorizer
            avait tirés de la CONVERSATION, à confirmer d'un bouton « Keep »,
            écrits dans `practical_constraints.food_preferences` — le magasin
            PLAT. C'était une TROISIÈME SOURCE déguisée en bouton, à côté des
            deux que le produit reconnaît: le retour sur un brouillon, et le
            bilan de fin de plan (nomenclature §2.1).

            ⚠️ CE QUI LA REND INUTILE N'EST PAS SON ERGONOMIE, C'EST QUE SON
            MAGASIN N'ATTEINT PLUS LE PROMPT. Les deux générateurs ont cessé de
            lire `food_preferences` dans ce même lot. Garder la carte aurait
            laissé un bouton qui range quelque chose que plus personne ne lit —
            le mode d'échec n°1 de ce dépôt, et cette fois on l'aurait construit
            exprès.

            ⚠️ CE QUI EST ÉCRIT EN BASE N'EST NI EFFACÉ NI MIGRÉ: il reste
            LISIBLE sur « Ce que Sophia sait de toi », en « Anciennes notes »,
            pour que la personne le RANGE (en préférence, avec un sujet) ou
            l'ENLÈVE. On ne reclasse pas rétroactivement des phrases sans
            `kind` — ce serait deviner à la place de quelqu'un qui a écrit pour
            de vrai.

            ⛔ `api/foodPreferences.ts` N'EST PAS SUPPRIMÉ: c'est le lecteur de
            cette archive, et le lot D s'en sert. */}
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
            citer. Les IDÉES que le coach dépose ne sont plus montrées à l'élève
            (`/app/meals` retiré le 2026-09-03, P4); elles restent sur `/coach/meals`. */}
        {/* LE RYTHME ET LES ABSENCES DESCENDENT D'ICI. Cette page lit déjà
            `student_goals`; les relire dans le constructeur ferait un second
            lecteur de la même colonne, et la grille montrerait alors autre
            chose que ce que le générateur reçoit. */}
        {/* ── 3 · « QUELLE FAÇON DE MANGER LE PLAT COMMUN SUIT » EST PARTIE
            LE 2026-08-14 ───────────────────────────────────────────────────
            La carte demandait au maître d'arbitrer entre deux méthodes en
            annonçant que ça changeait « ce qu'on cuisine » — SANS JAMAIS
            MONTRER L'AUTRE VERSION. Personne ne peut choisir entre deux plans
            dont un seul existe. Verdict du propriétaire, écran en main: « je
            comprends vraiment pas ce que ça fait, pour moi c'est inutile ».

            ⛔ LA CARTE PART, LE MOTEUR RESTE, ET IL A DÉJÀ SON REPLI.
            `households.reference_member_id` décide toujours quelle doctrine
            gouverne le tronc commun, et `generate-household-meal-v1` la lit
            toujours (`household_composition.ts::referenceMemberId`). La
            résolution est une CASCADE déjà écrite: `null` = le membre qui
            COMPOSE la session. Sans écran pour l'écrire, la colonne reste à
            NULL et le moteur retombe sur le composeur — le maître, qui est le
            cas courant et le bon défaut. C'est ce qui rend ce retrait sûr, et
            c'est prouvé par test (`householdReference.int.test.ts`), pas par
            intention. Ni la colonne, ni la RPC
            `keel_household_set_reference_member`, ni la cascade ne sont
            touchées. */}

        {/* ⟳ 2026-09-10 · LOT 7 — LE COMPOSANT RESTE MONTÉ POUR TOUT LE MONDE,
            ET C'EST DÉLIBÉRÉ. Il ne fait pas que composer: il RELIT les plans
            de la personne (`loadMealPlans`, filtré sur son `user_id`). Le
            démonter pour un membre secondaire lui retirerait la lecture de ses
            propres plans PERSONNELS d'avant le lot — et « les anciens plans
            restent lisibles » est une exigence de ce lot, pas un effet de bord.

            ⚠️ CE QUI SE FERME EST LE GESTE, PAS L'ÉCRAN. `MealBuilder` porte sa
            propre garde (`canCompose`, la même règle, le même module): un
            secondaire y voit ses plats et ses courses, sans formulaire ni
            bouton de recomposition. */}
        <MealBuilder
          rhythm={parseEatingRhythm(pc.eating_rhythm)}
          awayDays={parseAwayMarks(pc.away_days)}
          onAwaySaved={saveAwayDays}
          plansVersion={plansVersion}
          onPreviewPlan={previewPlan}
          resumedComposition={resumingDraft ? { progress: draftProgress } : null}
          resumeFailure={draftFailure}
          onHouseholdComposed={async () => {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (uid) await refreshHousehold(uid);
          }}
        />

        {/* ── 7 · MA PART (Lot E) ─────────────────────────────────────────
            Montée AVANT d'avoir un corps: le mode d'échec n°1 de ce dépôt est
            de livrer un composant complet, testé, vert — et branché nulle
            part. Elle rend `null` quand il n'y a pas de part à montrer.

            ⚠️ `mine` A ÉTÉ CÂBLÉ APRÈS COUP, ET L'OUBLI EST INSTRUCTIF. Le
            placeholder passait `mine={null}` EN DUR; Lot E a livré la carte,
            ses neuf tests et sa garde d'identité, tout était vert — et la
            carte se taisait sur chaque écran, parce que le site de montage
            n'avait jamais cessé de lui répondre « rien ». C'est exactement le
            défaut que le commentaire ci-dessus dit vouloir éviter, déplacé
            d'un cran: le composant ÉTAIT monté, c'est sa DONNÉE qui ne l'était
            pas. Un placeholder qui rend une constante est un lecteur mort.

            `selectMyShare` porte les deux moitiés de la règle et les porte
            SEUL: `isOwner` (le maître n'a pas une part, il a le plan) et
            l'identité (jamais la part d'un autre). Ne pas les récrire ici. */}
        <MyShareCard
          mine={selectMyShare({
            portions: householdMeal?.portions ?? [],
            meMemberId: household?.me?.memberId ?? null,
            isOwner,
          })}
          householdDishes={householdMeal?.dishes ?? []}
          // LOT 1 — l'ordre des jours du plan du foyer, pour que « ce que la
          // maison cuisine » se lise par jour dans l'ordre du PLAN. Même
          // source que la vue « qui mange quoi » plus bas.
          dishDayOrder={householdMeal
            ? windowDayOrder(householdMeal.startsOn, householdMeal.durationDays)
            : []}
          meMemberId={household?.me?.memberId ?? null}
          /**
           * A8.1 — SES COCHES SUR LE PLAN DU FOYER.
           *
           * ⚠️ `userId` EST LE SIEN. La coche est un fait de PERSONNE
           * (FF-058 R10): elle s'écrit sous SON compte, jamais sous celui du
           * maître qui a composé le plan. `householdMealId` ne sert qu'à
           * NOMMER le plat dans la clé — deux comptes portent la même clé
           * sans se marcher dessus (`protocol_events` est unique sur
           * `(user_id, source_message_id)`, RLS owner-only).
           *
           * ⚠️ ET LA CARTE NE S'OUVRE PAS AU MAÎTRE POUR AUTANT:
           * `selectMyShare` refuse déjà `isOwner` juste au-dessus, et c'est
           * la même règle qui décide de la carte et de ses cases.
           */
          userId={userId}
          householdMealId={householdMeal?.mealId ?? null}
          planStartsOn={householdMeal?.startsOn ?? null}
          // ⛔ `onApprove` et `busy` SONT PARTIS LE 2026-09-23 (FF-066 lot 4)
          // avec « Je valide », qui n'enregistrait rien: cet appelant passait
          // `async () => {}` et la carte affichait « Validé. ».
          // ⛔ `onRequestChange` A ÉTÉ RETIRÉ LE 2026-09-10 (lot 7). Il
          // composait un aperçu de SA propre semaine par la lane individuelle;
          // il n'y a plus qu'un moteur, et il refuse un secondaire par 403
          // `not_owner` — c'est-à-dire exactement la personne à qui cette carte
          // s'affiche. Voir le bloc qui remplace le bouton dans `MyShareCard`.
        />

        {/* ── 9 · « À TABLE » EST PARTI LE 2026-08-14 ─────────────────────
            La carte listait, sous le plan, une instruction de service par
            bouche (`portion_note`) et le détail de ses parts de préparation.
            Verdict du propriétaire, écran en main: illisible, et sans usage.
            Une part mal calibrée s'ajuste à table en trois secondes; personne
            n'a besoin de la lire d'avance sur un écran.

            ⚠️ CE QUI RESTE, ET QUI N'EST PAS LA MÊME CHOSE: `MyShareCard`
            juste au-dessus. Elle dit à UNE personne ce qu'elle mange, elle;
            « à table » récitait la table entière à quelqu'un qui n'a rien à
            en faire.

            ⛔ LE MOTEUR N'EST PAS TOUCHÉ. `_shared/keel/household_portions.ts`
            produit toujours ces notes, et `member_portions` est toujours
            écrit: c'est la bifurcation des portions (le même plat servi
            différemment selon l'objectif de chacun), nommée dans
            `docs/keel/PIVOT-FOYER.md` §7.1 comme l'intersection vide du
            produit. Ce retrait est celui d'un AFFICHAGE. La question « on la
            montre autrement, ou on l'abandonne » est ouverte et appartient à
            l'humain. */}

        {/* ── 9bis · « QUI MANGE QUOI » — RETIRÉE LE 2026-09-16 ─────────────
            La grille par personne (`PlanByPerson`) doublait la lecture des
            parts : le plan par jour porte déjà la part de chacun sur chaque
            plat, et « ta part » (`MyShareCard`) dit à une personne ce qu'elle
            mange. Décision du propriétaire, à la lecture du plan sur staging :
            « il faut supprimer entièrement la section ». Le moteur n'est pas
            touché — `member_portions` est toujours écrit et toujours lu par
            les plats. */}

        {/* ── 10 · « CE QUE ÇA DONNERAIT » — RETIRÉE LE 2026-09-21 ──────────
            La carte d'aperçu (bouton « Prévisualiser ») doublait le geste des
            deux boutons du composeur, qui ouvrent désormais TOUS l'aperçu
            avant d'écrire (confirmation, puis `PlanDraftDialog`, puis
            adoption). Décision du propriétaire, à la lecture du plan : « il
            faut supprimer cette section ». `askForDraft` reste : c'est le
            chemin `prepare_next` de l'aperçu, et un test de câblage le lit. */}

        {/* ⚠️ LA FENÊTRE EST MONTÉE EN PERMANENCE ET REÇOIT SA DONNÉE. `Modal`
            rend `null` fermé — il ne démonte pas ses enfants — donc l'état de
            la fenêtre survit à une fermeture, et c'est `PlanDraftDialog` qui
            remet son compteur de tours à zéro à chaque OUVERTURE.

            ⛔ AUCUNE CONSTANTE EN DUR ICI. `mine={null}` était exactement ça
            une carte plus haut, et il a rendu muet un lot entier: chaque prop
            ci-dessous vient du brouillon réellement composé. */}
        <PlanDraftDialog
          open={draft !== null}
          /* ⛔ « LAISSER TOMBER » JETTE LE BROUILLON, il ne referme pas
             une fenêtre en laissant l'objet derrière: c'était le seul chemin
             par lequel un aperçu payé devenait inatteignable. */
          onClose={() => {
            // ⟳ 2026-09-23 — et la réponse est rangée en base : sans elle,
            // la ligne restait `done` et revenait au retour sur l'onglet.
            void discardDraft(draft?.envelope.draftId ?? null);
            setDraft(null);
            setDraftSource(null);
          }}
          draft={draft?.plan ?? null}
          // LES PHRASES DU SERVEUR, TELLES QU'IL LES REND. Assemblées côté
          // serveur, dans la langue du contenu: cet écran les affiche, il ne
          // les décide pas.
          // LA PROSE DU MODÈLE, à côté des phrases fixes et jamais à leur
          // place. `[]` quand il n'avait rien à arbitrer OU quand la garde a
          // refusé le bloc — l'écran rend les deux pareil, le serveur les
          // compte séparément.
          explanation={draft?.envelope.explanation ?? []}
          // 🔴 TOUJOURS `0` AUJOURD'HUI, et ce n'est pas une constante posée
          // ici: c'est ce que le serveur rend, parce qu'il journalise `dropped`
          // sans le publier. Voir `DraftEnvelope.droppedClauses`.
          droppedClauses={draft?.envelope.droppedClauses ?? 0}
          // ⟳ 2026-09-08 — L'IDENTIFIANT DE L'APERÇU RANGÉ, sans lequel il n'y
          // a aucun chiffre sur ce qu'on relit. `null` quand le serveur n'a
          // rien rangé: l'aperçu s'affiche alors comme hier, sans ses kcal.
          draftId={draft?.envelope.draftId ?? null}
          busy={draftBusy}
          adoptLabel={draftSource?.intent === "replace_current"
            ? t("plan.draft.adopt_replace")
            : undefined}
          // ⟳ 2026-09-08 (lot 4) — TROIS GESTES AU LIEU D'UN. Le dialogue lit
          // la phrase (`readNote`), pose la question du serveur s'il y en a
          // une, la répond (`answerNote`), PUIS compose — sans la phrase:
          // `draftInput` est la source unique des entrées, et le magasin porte
          // déjà l'effet de la phrase.
          // ⚠️ LE MOTIF EST TRADUIT ICI, PAS DANS LE COMPOSANT. Sans ce
          // `catch`, `note_unusable` remontait en JETON BRUT jusqu'au rouge
          // de la fenêtre — mesuré dans le navigateur. Les `throw` sont
          // conservés: c'est ce qui fait qu'un refus d'entrée ne compte PAS
          // un tour, puisque rien n'a été composé.
          onReadNote={async (note) => {
            try {
              return await readNote(note, (draftSource?.input ?? draftInput()).window);
            } catch (e) {
              throw new Error(draftRefusal(e));
            }
          }}
          onAnswerNote={async (answer) => {
            try {
              return await answerNote(answer);
            } catch (e) {
              throw new Error(draftRefusal(e));
            }
          }}
          /* ⟳ 2026-09-21 — `progress` ET `onProgress`, LES DEUX MOITIÉS D'UN
             MÊME LOT. Une recomposition depuis l'aperçu dure autant qu'une
             composition (deux minutes), et le bouton « Ajuster le plan »
             restait muet pendant ce temps. Sans `onProgress`, la prop
             `progress` resterait à `null` et le bouton retomberait sur les
             seules phrases minutées — vraies, mais aveugles au stade réel. */
          progress={draftProgress}
          onCompose={async () => {
            try {
              // ⟳ 2026-09-22 — une recomposition part d'aujourd'hui : la
              // fenêtre d'un brouillon d'hier commence hier, et le serveur
              // refuse un départ passé.
              setDraft(await composeDraft(windowFromToday(draftSource?.input ?? draftInput(), todayIso()), {
                onProgress: setDraftProgress,
                replaces: draftSource?.intent === "replace_current" ? draftSource.replaces : null,
              }));
            } catch (e) {
              throw new Error(draftRefusal(e));
            } finally {
              setDraftProgress(null);
            }
          }}
          // ⟳ 2026-09-09 — LA REPRISE LOCALE : la case seule, sur le brouillon
          // que le dialogue nomme (son `draftId`, jamais un état de page qui
          // pourrait être en retard d'une composition).
          onEditCells={async (id, cells) => {
            try {
              setDraft(await editCells(windowFromToday(draftSource?.input ?? draftInput(), todayIso()), id, cells, {
                // ⟳ 2026-09-21 — même plan remplacé que la composition du
                // brouillon, sinon la garde de chevauchement refuse la case.
                replaces: draftSource?.intent === "replace_current"
                  ? draftSource.replaces
                  : null,
              }));
            } catch (e) {
              throw new Error(draftRefusal(e));
            }
          }}
          // ⟳ 2026-09-24 — la note n'est qu'une exclusion : seuls les plats
          // qui contiennent l'aliment sont refaits, même plan remplacé.
          onEditExclusions={async (id) => {
            try {
              setDraft(await editExclusions(windowFromToday(draftSource?.input ?? draftInput(), todayIso()), id, {
                replaces: draftSource?.intent === "replace_current"
                  ? draftSource.replaces
                  : null,
              }));
            } catch (e) {
              throw new Error(draftRefusal(e));
            }
          }}
          // ⟳ 2026-09-24 — « REMPLACER »: même fenêtre et même plan remplacé
          // que les deux reprises locales juste au-dessus.
          onReadRejections={async (id, rejections) => {
            try {
              return await readRejections(id, rejections, (draftSource?.input ?? draftInput()).window);
            } catch (e) {
              throw new Error(draftRefusal(e));
            }
          }}
          onReplaceDishes={async (id, rejections) => {
            try {
              setDraft(await replaceDishes(windowFromToday(draftSource?.input ?? draftInput(), todayIso()), id, rejections, {
                replaces: draftSource?.intent === "replace_current"
                  ? draftSource.replaces
                  : null,
              }));
            } catch (e) {
              throw new Error(draftRefusal(e));
            }
          }}
          edit={draft?.envelope.edit ?? null}
          onAdopt={async () => {
            // Le serveur relit et revalide le brouillon par son identifiant;
            // aucun plan n'est recomposé au moment de l'adoption.
            //
            // `prepare_next` et `replaces: null`: la fenêtre visée est LIBRE
            // par construction, donc il n'y a rien à remplacer.
            //
            // ⛔ SANS PHRASE (lot 4): elle a déjà fait son effet à la reprise,
            // et la relire ici l'appliquerait une seconde fois.
            let written: { ok: boolean; mealId: string | null };
            try {
              const reviewedDraftId = draft?.envelope.draftId ?? null;
              if (reviewedDraftId === null) throw new Error("draft_not_ready");
              // ⟳ 2026-09-21 — l'intention est celle de la source de l'aperçu:
              // `replace_current` retire le plan nommé, `prepare_next` n'en
              // touche aucun.
              written = await writeFromDraft(
                draftSource?.input ?? draftInput(),
                reviewedDraftId,
                draftSource?.intent ?? "prepare_next",
                draftSource?.intent === "replace_current" ? draftSource.replaces : null,
              );
            } catch (e) {
              // Même règle que la reprise: un jeton nu n'apprend rien.
              throw new Error(draftRefusal(e));
            }
            // Un 200 qui dit `ok: false` n'est pas une panne de transport, et
            // il ne doit pas non plus atterrir comme un succès: il rejoint la
            // même table de refus que tout le reste.
            if (!written.ok) throw new Error(draftRefusal(new Error("plan_not_written")));
            setDraft(null);
            setDraftSource(null);
            // ⟳ 2026-09-21 — le composeur relit ses plans: c'est lui qui
            // affiche le plan courant, et il vient peut-être de changer.
            setPlansVersion((v) => v + 1);
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (uid) {
              await refreshLivePlans(uid);
              await refreshHousehold(uid);
            }
          }}
        />

        {/* ══════════════════════════════════════════════════════════════════
            LOT D — LE RETOUR DE FIN DE PLAN.

            ⛔ FERMER EST UNE RÉPONSE, ET ELLE S'ÉCRIT. Sans `onDismiss`, le
            questionnaire reviendrait à chaque ouverture de l'app: un « non
            merci » transformé en harcèlement. C'est la ligne la moins
            spectaculaire de ce montage et celle dont l'absence se paierait le
            plus vite.

            ⛔ LES QUESTIONS VIENNENT DE `questionsFor`, PAS D'ICI. C'est elle
            qui retire `portions` et `hunger_between_meals` sous plancher TCA,
            ET qui rend la sortie INDISCERNABLE de celle d'une dynamique
            inconnue — sinon le questionnaire devient lui-même un oracle
            (« on ne m'a pas demandé les portions, donc je suis marqué »). Un
            second calcul ici serait la première chose à diverger.

            ⚠️ `restricted` EST LE DRAPEAU COURANT, lu plus haut sur la ligne
            de bilan la plus récente. Une lecture EN ÉCHEC vaudrait `true`
            (fail-closed) — se fermer rend un questionnaire plus court,
            s'ouvrir met une question de portion sous les yeux de quelqu'un
            qu'on n'a pas su évaluer.
            ══════════════════════════════════════════════════════════════════ */}
        {feedbackPlan
          ? (
            <PlanFeedbackDialog
              open={feedbackOpen}
              // ⚠️ PLUS D'OBJECTIF — lot B. Les questions ne dépendent plus
              // de la dynamique: la quatrième question la suivait, et deux de
              // ses trois axes n'avaient aucun lecteur. Le plancher TCA reste
              // le seul filtre, et il ne retire plus que `portions`.
              questions={questionsFor(restricted)}
              // ⚠️ DES ALIMENTS, PLUS DES TITRES — lot B. Un titre ne dit pas
              // ce qu'on ne veut plus; ni le générateur ni la ceinture par
              // bouche ne peuvent filtrer avec.
              foodTerms={feedbackPlan.foodTerms}
              // ⛔ SEUL LE MAÎTRE D'UN FOYER VOIT LA QUESTION D'ENVIE: c'est le
              // seul compte qui puisse l'écrire dans le canal qui la lit
              // (`keel_household_submit_envy` refuse tout autre membre par
              // `not_owner`). Une question sans lecteur ne se pose pas.
              askEnvy={newEnvyIsAsked({ isHouseholdOwner: isOwner })}
              // ⚠️ LES BOUCHES DE LA TABLE, POUR « POUR QUI ? ». Un solo n'a
              // PAS de foyer (`SetupPage.tsx`: « le solo ne crée pas de
              // foyer »), donc pas une ligne `household_members`, donc aucun
              // `member_id` à nommer: il reçoit `[]`, la question ne se pose
              // pas, et l'ajustement vaut « tout le monde à table » — c'est-
              // à-dire lui.
              mouths={(household?.members ?? []).map((m) => ({
                memberId: m.memberId,
                displayName: m.displayName,
              }))}
              onDismiss={async () => {
                // On ferme d'abord: le refus est déjà pris, et une erreur
                // d'écriture ne doit pas retenir quelqu'un devant un
                // questionnaire qu'il vient de refuser.
                setFeedbackOpen(false);
                try {
                  await dismissPlanFeedback(feedbackPlan.mealId);
                  setFeedbackPlan(null);
                } catch {
                  // Silencieux: le refus est un geste de sortie. Le
                  // questionnaire reviendra au prochain chargement, ce qui est
                  // le comportement d'avant ce lot — jamais pire.
                }
              }}
              onSubmit={async (answers) => {
                const written = await submitPlanFeedback(
                  feedbackPlan.mealId,
                  {
                    cooked: answers.cooked,
                    portions: answers.portions,
                    // ⛔ `member:<uuid>` OU `household`, JAMAIS UN PRÉNOM.
                    // C'est ce qui rend `portion.adjust` attribuable — et le
                    // questionnaire est son SEUL producteur pour cette raison
                    // exacte: la conversation ne sait pas l'attribuer.
                    portionsSubject: answers.portionsSubject,
                    // ── LOT B · LES QUATRE RÉPONSES NEUVES ─────────────────
                    // ⛔ `neverAgainFoods` PORTE SON SUJET, et c'est ce qui
                    // rend la préférence attribuable — donc la ceinture par
                    // bouche capable de mordre chez la bonne personne.
                    difficulty: answers.difficulty,
                    speed: answers.speed,
                    variety: answers.variety,
                    neverAgainFoods: answers.neverAgainFoods,
                    makeAgainFoods: answers.makeAgainFoods,
                    anythingElse: answers.anythingElse,
                  },
                  // ⚠️ LE JOUR DE LA PERSONNE, PAS CELUI DU SERVEUR. C'est le
                  // `at` de ce qui sera retenu (« je l'ai retenu de mardi »),
                  // et l'horloge du serveur est en UTC: un mardi soir à Paris
                  // y ressort mercredi.
                  browserLocalDate(),
                );
                // `already_answered` n'est PAS une panne: « une seule fois par
                // fenêtre » est une contrainte de BASE, et deux surfaces
                // peuvent proposer ce questionnaire. On referme.
                if (!written.ok && written.reason !== "already_answered") {
                  throw new Error(written.reason ?? "feedback_not_written");
                }
                // ── L'ENVIE PART DANS LE CANAL QUI EXISTE ──────────────────
                // ⛔ PAS DE SECOND CANAL D'ENVIES. `keel_household_submit_envy`
                // est le seul écrivain de la ligne que le générateur lit, et
                // elle vise la semaine PROCHAINE: l'écrire sur celle qui vient
                // de s'achever serait l'écrire dans le passé — recueillie,
                // rangée, et jamais servie.
                if (answers.envy) {
                  try {
                    await submitEnvy(
                      // `"mon"` EN DUR, ET C'EST LA TABLE QUI L'EXIGE: la
                      // ligne d'envies n'ancre QUE des lundis ISO depuis le lot
                      // 5, et la RPC recale de son côté. Un autre jeton ferait
                      // écrire un lundi et relire autre chose.
                      weekStartFor(addDays(browserLocalDate(), 7), "mon"),
                      answers.envy,
                    );
                  } catch {
                    // L'envie est un bonus sur un retour déjà écrit: son échec
                    // ne doit pas faire relire tout le questionnaire.
                  }
                }
                setFeedbackOpen(false);
                setFeedbackPlan(null);
              }}
            />
          )
          : null}
      </div>
    </KeelAppShell>
  );
}
