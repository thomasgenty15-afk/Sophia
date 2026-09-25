import { type AwayMark, parseAwayMarks } from "../lib/presenceMarks";
import React from "react";
// ⚠️ `ChevronDown` EST PARTI AVEC LE `<details>` « qui est là, jour par jour »
// (2026-09-08): c'était son seul lecteur. `noUnusedLocals` est à `false` dans
// `tsconfig.app.json`, donc rien n'aurait signalé l'import orphelin.
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { planFailureKey } from "../copy/planRefusals";
import { setupMissKey } from "../copy/setupMisses";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
// ⚠️ `tokens.ts`, PAS `activity_floor.ts`. Le dépôt porte deux listes
// `ACTIVITY_LEVELS`; celle-ci est celle que la contrainte CHECK des deux
// colonnes connaît (`20260818100000`). L'autre rendrait des jetons que la base
// refuse à l'écriture.
import {
  type DayActivityLevel,
  type SportFrequency,
  type ActivityLevel,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  addHouseholdMember,
  createHousehold,
  dissolveHousehold,
  loadMemberBirthDates,
  type MemberGender,
  goalForAge,
  isDirectionalGoal,
  type MemberGoal,
  removeHouseholdMember,
  setMemberBirthDate,
  setMemberDiet,
  setMemberName,
  setMemberRhythm,
  setMemberGoal,
  setOwnBirthDate,
} from "../api/household";
import {
  answerNote,
  type ComposeDraftInput,
  composeDraft,
  discardDraft,
  editCells,
  editExclusions,
  matchDishes,
  type PlanDraft,
  readNote,
  readRejections,
  replaceDishes,
  DRAFT_ORIGIN_PATH,
  recoverLatestDraft,
  recoverPreviewBehind,
  waitForDraft,
  writeFromDraft,
  type DraftProgress,
} from "../api/planDraft";
import ComposingLabel from "../components/plan/ComposingLabel";
import DemoPlanTour from "../components/plan/demo/DemoPlanTour";
import { useDemoOpen, usePublishRealPlanReady } from "../components/plan/demo/demoGate";
import PlanDraftDialog from "../components/plan/PlanDraftDialog";
import {
  EATING_OCCASIONS,
} from "../api/mealGeneration";
import {
  birthDateAnswer,
  canGenerate,
  DIET_ANSWERS,
  type DietAnswer,
  DEFAULT_HOUSEHOLD_NAME,
  declaredHouseholdSize,
  type FunnelBranch,
  type FunnelFacts,
  type FunnelMouth,
  type FunnelPlanAnswers,
  type FunnelState,
  funnelSteps,
  maximumOthers,
  missesForStep,
  peopleStepBlockers,
  selfSheetIsHeld,
  mouthsStillNeeded,
  nextIncomplete,
  withPendingHouseholdSize,
  readFunnelFacts,
  nameAlreadyEating,
  saveMouthAllergies,
  saveMouthBody,
  saveOwnAllergies,
  saveOwnDiet,
  saveOwnGoal,
  saveOwnProfile,
  saveOwnWeight,
  saveEatingRhythm,
  savePlanAnswers,
} from "../api/onboarding";
import {
  mergePracticalConstraints,
} from "../api/practicalConstraints";
import {
  assessBudget,
  type BudgetDayRates,
  budgetMouthsFor,
  loadBudgetDayRates,
  readBudgetMarket,
} from "../api/planBudget";
// ── D6 (2026-08-18) — LE POIDS VISÉ ET LE RYTHME, DANS L'ENTONNOIR ─────────
// Le composant, la décision et l'écrivain viennent tous les trois d'ailleurs:
// cet écran n'en refait aucun. Une seconde lecture de `paceControlFor` ici
// divergerait de celle de `/app/household` au premier correctif.
import {
  habitEntriesToWrite,
} from "../lib/mealExtras";
// ── LE BROUILLON GARDÉ SUR CE NAVIGATEUR ───────────────────────────────────
// ⚠️ IL NE DEVIENT PAS UNE SECONDE SOURCE DE VÉRITÉ. Tout ce qu'il rend passe
// par `reconcileDraft`, qui laisse le serveur gagner dès qu'il a quelque chose
// à dire. Le pourquoi, les trois règles et ce qui n'est pas gardé sont dans
// l'en-tête du module — ils s'y lisent d'un bloc, ce qui est le seul endroit
// où cette décision reste vérifiable.
import {
  clearSetupDraft,
  readSetupDraft,
  reconcileDraft,
  type StoredSetupDraft,
  takeKnownShape,
  writeSetupDraft,
} from "../lib/setupDraftCache";
import MouthFormDialog, {
  type ShakerPort,
} from "../components/MouthFormDialog";
import {
  ageStateOfDraft,
  ageStateOfTypedDate,
  emptyMouthDraft as emptyMouthFormDraft,
  foldMinorGoal,
  type MouthFormDraft,
  type ShakerDraft,
  shakerCanBeSaved,
  shakerPartialToWrite,
  shakerToWrite,
  targetPayloadOf,
} from "../lib/mouthForm";
import {
  addShakerToMemberIntakes,
  addShakerToOwnIntakes,
  loadMemberFixedIntakes,
  loadMemberTargets,
  loadOwnMouth,
  type MemberTargetView,
  setMemberTarget,
  setOwnTarget,
  writtenDislikeWriter,
} from "../api/mouthProfile";
import { mayCompose } from "../api/planRouting";
import {
  mouthCardTargetPayload,
} from "../lib/mouthCardTarget";
import { addDays, daysBetween, weekStartFor } from "../api/dates";
import {
  MAX_WINDOW_DAYS,
  windowDayOrder,
} from "../api/mealWindow";
import { type EatingOccasionSlot } from "../api/mealGeneration";
import {
  // LE MÊME ÉCRIVAIN QUE `MealBuilder`, appelé — jamais un second.
  loadEnvyLine,
  setMemberAway,
  submitEnvy,
} from "../api/household";
import { presenceRoster } from "../lib/presenceRoster";
import { cookingAnswersVerdict, presenceMealsPerDay } from "../lib/cookingAnswers";
import {
  type CookingSessionCount,
  readSessionTimeBound,
} from "../api/cookingPlan";
import { hasFreezerDeclared, readKitchenEquipment } from "../api/kitchenEquipment";
import { browserLocalDate, catchUpWindowStart } from "../lib/useMealTicks";
import { t } from "../i18n/t";
import { habitSlotsFor } from "../lib/habitSlots";
import { useEatingStructure } from "../lib/useEatingStructure";
import { formatBudgetAmount } from "../i18n/format";
// ⚠️ `HouseholdHabitsCard` N'EST PLUS MONTÉE ICI (2026-08-14). Elle reste le
// bon écran pour RELIRE ce qu'une bouche mange, sur `/app/household`; dans
// l'entonnoir, son dépliant et sa phrase « aucun moment de repas n'est encore
// posé » demandaient d'aller cocher ailleurs ce qui se coche juste au-dessus.
// Ce qui subsiste ici est sa ligne libre, dans la carte de chaque personne, sur
// la MÊME table et la MÊME RPC — donc rien de saisi n'est perdu.
import {
  type HabitSlot,
  loadMemberHabits,
  type MemberHabitsView,
  setMemberHabits,
} from "../api/householdHabits";

// ── ⟳ 2026-09-24 (lot 4b) · LES ÉTAPES VIVENT DANS `setup/` ──────────────
// Les sous-composants de l'entonnoir, leurs libellés et leurs types ont été
// déplacés À L'IDENTIQUE dans `setup/`: `types.ts`, `mouthDraft.ts`,
// `labels.ts`, `FunnelShell.tsx`, `SituateStep.tsx`, `SelfStep.tsx`,
// `MouthsStep.tsx`, `MouthRowSummary.tsx`, `MouthRow.tsx`, `TableStep.tsx`,
// `RequestStep.tsx`, `MissCards.tsx`. Ce fichier garde la page elle-même, le
// refus d'un générateur et la semence de ma fiche. Il RÉ-EXPORTE les étapes
// qu'il exportait: les imports de `App.tsx` et des tests ne changent pas. Les
// modules font partie de la famille de ce fichier
// (`scripts/source-families.json`), que les tests lisent à la place du fichier
// seul.
import type { Load, SelfDraft } from "./setup/types.ts";
import { type MouthDraft, emptyMouthDraft } from "./setup/mouthDraft.ts";
import { FunnelShell } from "./setup/FunnelShell.tsx";
import { SituateStep } from "./setup/SituateStep.tsx";
import { SelfStep } from "./setup/SelfStep.tsx";
import { MouthsStep } from "./setup/MouthsStep.tsx";
import { RequestStep } from "./setup/RequestStep.tsx";
import { BlockersCard } from "./setup/MissCards.tsx";

export { SituateStep } from "./setup/SituateStep.tsx";
export { SelfStep } from "./setup/SelfStep.tsx";
export { MouthsStep } from "./setup/MouthsStep.tsx";
export { TableStep } from "./setup/TableStep.tsx";

// KEEL — FF-060, L'ENTONNOIR D'ENTRÉE.
//
// Fiche: docs/fonctionnalites/acquisition-et-acces/FF-060-le-parcours-d-entree.md
//
// ── CE QUE CET ÉCRAN REMPLACE ──────────────────────────────────────────────
// Un compte neuf atterrissait sur `/app/today` — vide — et tout son réglage
// vivait derrière un bouton « Set up » d'une fenêtre de `/app/plan`, qui
// empilait quatre sections dans un ordre que personne ne pouvait deviner. Il
// n'existait AUCUN chemin qui mène de « je viens de créer mon compte » à « voici
// mon premier plan ».
//
// ── TROIS RÈGLES QUI GOUVERNENT TOUT CE FICHIER ────────────────────────────
//
// 1. `canGenerate` EST LA SEULE SOURCE qui active le bouton de fin. Cet écran
//    ne refait jamais le calcul « à peu près »: deux vérités divergentes sur ce
//    qui manque, c'est un bouton actif qui rend une erreur.
//
// 2. RIEN N'EST RENDU AVANT D'AVOIR LU. Cicatrice du dépôt: un formulaire figé
//    au montage affiche du vide qu'il n'a pas encore lu, puis l'ÉCRASE au Save.
//    D'où la porte `state.kind === "loading"` — pas un spinner décoratif.
//
// 3. LA DERNIÈRE ACTION EST LA GÉNÉRATION. Pas de « merci », pas de « ton plan
//    arrive »: aucune copie de ce produit ne doit faire ATTENDRE quelqu'un, le
//    coach ne prépare rien pour personne (docs/keel/MODEL.md). Le bouton
//    compose, et l'écran suivant est le plan.

/**
 * UN REFUS DE GÉNÉRATEUR, DANS SES MOTS.
 *
 * ⚠️ LES DEUX APPELANTS ONT DÉJÀ LU LE CORPS, ET C'EST POURQUOI ON NE LE RELIT
 * PAS ICI. `supabase.functions.invoke` ne rend pas le corps d'une réponse
 * non-2xx (`error.message` vaut « Edge Function returned a non-2xx status
 * code »); `generateMeal` et `generateHouseholdMeal` vont donc chercher le
 * jeton eux-mêmes et lèvent `Error("<jeton>")` ou `Error("<jeton>: <détail>")`.
 * Ce qui arrive ici est déjà le jeton — il ne reste qu'à le traduire.
 *
 * Un jeton inconnu retombe sur le message brut, jamais sur une phrase
 * générique: un refus qu'on n'a pas prévu doit rester VISIBLE, sinon on le
 * découvre six mois plus tard dans un ticket.
 *
 * ⛔ `planFailureKey` ET PAS `edgeRefusalKey`. Mesuré le 2026-09-15 sur le
 * projet hébergé: la composition coupée par la passerelle a levé
 * `plan_still_composing`, et cet écran l'a rendu EN JETON BRUT sous le bouton
 * de fin — la phrase existait, mais `edgeRefusalKey` ne lit que les refus du
 * SERVEUR, et ce jeton-là est une issue décidée par le NAVIGATEUR
 * (`CLIENT_OUTCOME_KEYS`). Seul `planFailureKey` lit les deux tables.
 */
function refusalMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const key = planFailureKey(raw.split(":")[0]?.trim() ?? "");
  return key ? t(key) : raw;
}


/**
 * LA SEMENCE DE MA FICHE, DÉRIVÉE DE LA SEULE LECTURE.
 *
 * ⚠️ EXTRAITE DE `load` POUR ÊTRE APPELÉE DEUX FOIS, et la seconde n'a rien
 * d'un affichage. Elle sert d'ARBITRE au brouillon local
 * (`lib/setupDraftCache.ts`): réconcilier « ce qui est à l'écran » avec « ce
 * qu'il y a en base » demande un troisième terme — l'état serveur, DE LA MÊME
 * FORME que le brouillon. Une seconde semence recopiée ici aurait divergé de
 * celle-ci au premier correctif, et la divergence se serait vue comme un champ
 * qui s'efface tout seul: exactement le défaut qu'on ferme.
 */
function seedSelfFrom(
  read: FunnelFacts,
  habitsMap: Map<string, MemberHabitsView>,
): SelfDraft {
  return {
    firstName: read.state.self.firstName,
    // ② SEMÉS COMME LE CRAN. Un écran ouvert sur des tuiles vierges
    // au-dessus d'une réponse déjà donnée finit par l'écraser — c'est
    // « formulaire figé au montage », et `saveOwnProfile` écrit
    // désormais les nulls (voir son patch).
    dayActivity: read.state.self.dayActivity,
    sportFrequency: read.state.self.sportFrequency,
    // ⑤ SEMÉ DEPUIS LA LIGNE DE CORPS. Une fenêtre ouverte sur une
    // réponse vierge au-dessus d'une réponse déjà donnée finit par
    // l'écraser — « formulaire figé au montage ».
    appetite: read.state.self.appetite ?? "",
    // La date de MOI vient de `profiles`, donc elle est lisible telle
    // quelle — contrairement à celle d'une autre bouche, que le roster
    // ne rend jamais.
    birthDate: read.state.self.birthDate ?? "",
    heightCm: read.state.self.heightCm === null
      ? ""
      : String(read.state.self.heightCm),
    weightKg: read.state.self.weightKg === null
      ? ""
      : String(read.state.self.weightKg),
    gender: read.state.self.gender ?? "",
    // `null` TRAVERSE, et ne devient pas `""`: l'absence de réponse est
    // l'état légitime de toute la base d'avant ce lot, et aucune tuile
    // ne doit s'allumer dessus.
    activityLevel: read.state.self.activityLevel,
    diet: read.state.self.diet ?? "",
    goal: read.state.self.goal ?? "",
    allergies: [],
    allergiesNone: read.state.self.allergiesReviewed,
    // SES MOMENTS: les siens s'il en a, sinon ceux de la maison — la
    // même cascade que partout ailleurs. `null` traverse quand personne
    // n'a rien dit, et la fiche le rend comme « aux moments de la
    // maison » plutôt qu'en pré-cochant six cases.
    // ⚠️ `[]` REDEVIENT `null`: `plan.eatingRhythm` vaut un tableau
    // VIDE tant que la maison n'a rien dit, et le laisser passer se
    // lisait « zéro moment déclaré » — ce qui vidait la section des
    // habitudes sur la carte du maître, et sur la sienne seulement.
    rhythm: read.ownEatingSlots ??
      (read.state.plan.eatingRhythm.length > 0
        ? read.state.plan.eatingRhythm
        : null),
    // ⚠️ SEMÉES, JAMAIS VIDES: `keel_household_set_member_habits`
    // REMPLACE la liste entière. Un brouillon vide enregistré effacerait
    // « elle mange une pomme le matin » sans un mot — la cicatrice
    // `mount-snapshot-forms-need-a-loading-gate`, prise par l'autre bout.
    habits: Object.fromEntries(
      (habitsMap.get(read.ownMemberId ?? "")?.slots ?? []).map((
        h: HabitSlot,
      ) => [h.slot, h.usual]),
    ),
    // LA MÊME COLONNE, L'AUTRE MOITIÉ — et la même raison de la semer.
    light: { ...(habitsMap.get(read.ownMemberId ?? "")?.light ?? {}) },
    // ⟳ 2026-09-23 — ET SES À-CÔTÉS, TROISIÈME LECTURE DE LA MÊME COLONNE.
    sideCourses: {
      ...(habitsMap.get(read.ownMemberId ?? "")?.sideCourses ?? {}),
    },
    // ⛔ NI LES DÉGOÛTS NI LE SHAKER NE SE SÈMENT DEPUIS LA BASE, et ce n'est
    // pas un oubli: les dégoûts s'AJOUTENT (`add_*`, il n'existe pas de
    // « poser la liste »), donc les semer les rejouerait à chaque
    // enregistrement. Le shaker, lui, remplace la ligne de même
    // `food_ref` et garde les autres.
    //
    // ⚠️ LE BROUILLON LOCAL, LUI, LES REND — et il a le droit. Vides ici, ils
    // sont donc vides dans l'ARBITRE aussi: la règle 3 de `reconcileDraft` voit
    // « l'écran porte quelque chose, la base n'a rien changé » et restaure la
    // saisie. Ce qui rend ça sûr est que les deux portes sont IDEMPOTENTES —
    // `keel_household_add_restriction` et `keel_household_add_allergy` font
    // toutes deux `on conflict … do nothing` et rendent `ok`, et
    // `saveOwnAllergies` avale `DuplicateConstraintError`. Rejouer un dégoût
    // déjà écrit ne coûte donc qu'un aller-retour, pas un doublon ni un refus
    // qui bloquerait « Continuer ». ⛔ Si l'une des deux cessait d'être
    // idempotente, c'est ICI qu'il faudrait retirer les deux champs du
    // brouillon gardé — `writtenDislikes` est une `ref`, elle ne survit pas au
    // rechargement et ne peut donc pas tenir ce delta-là.
    dislikes: [],
    shaker: null,
  };
}

export default function SetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [state, setState] = React.useState<Load>({ kind: "loading" });
  const [facts, setFacts] = React.useState<FunnelFacts | null>(null);
  /**
   * LE MARCHÉ DE CE COMPTE, POUR LE PLANCHER DU BUDGET — `null` hors de France
   * et des États-Unis, et c'est l'état NORMAL pour le reste du monde: la grille
   * de prix n'existe que sur deux marchés (`_shared/keel/budget_floor.ts`).
   *
   * ⚠️ `null` TANT QUE LA LECTURE N'A PAS RÉPONDU, donc aucun refus pendant ce
   * temps-là. Un plancher posé sur une lecture pas encore revenue refuserait
   * quelqu'un pour une raison qui ne le concerne pas.
   */
  const [budgetMarket, setBudgetMarket] = React.useState<"fr" | "us" | null>(null);
  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void readBudgetMarket(userId).then((market) => {
      if (!cancelled) setBudgetMarket(market);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const [stepIndex, setStepIndex] = React.useState(0);
  /**
   * ⟳ 2026-09-25 — LE COÛT PAR JOUR DE CHAQUE BOUCHE, AJUSTÉ À SON BESOIN
   * (`budget-rates-v1`), pour le minimum du curseur de budget.
   *
   * ⚠️ RELU À CHAQUE ARRIVÉE SUR L'ÉTAPE DE LA DEMANDE: les corps se saisissent
   * aux étapes d'avant, et une lecture faite au montage porterait le foyer
   * d'avant la saisie. Carte vide tant que rien n'est revenu = la table de
   * prix, le comportement d'avant.
   */
  const [budgetRates, setBudgetRates] = React.useState<
    ReadonlyMap<string, BudgetDayRates>
  >(() => new Map());
  const onRequestStep = React.useMemo(() => {
    if (facts === null) return false;
    const all = funnelSteps(facts.branch ?? "solo");
    return all[Math.min(stepIndex, all.length - 1)]?.id === "request";
  }, [facts, stepIndex]);
  React.useEffect(() => {
    if (!userId || !onRequestStep) return;
    let cancelled = false;
    void loadBudgetDayRates().then((rates) => {
      if (!cancelled) setBudgetRates(rates);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, onRequestStep]);
  const [pendingHouseholdSize, setPendingHouseholdSize] = React.useState<
    number | null
  >(null);
  const [busy, setBusy] = React.useState(false);
  /** ⟳ 2026-09-15 · LOT B — le stade réel de la composition, lu dans la ligne. */
  const [progress, setProgress] = React.useState<DraftProgress | null>(null);
  /**
   * ⟳ 2026-09-23 — UNE COMPOSITION EN VOL, RETROUVÉE AU MONTAGE ET SUIVIE.
   * `busy` seul ne la montrait que dans le libellé du bouton de fin, en bas de
   * la dernière étape : revenu sur l'entonnoir, on ne voyait plus l'attente.
   */
  const [resumingDraft, setResumingDraft] = React.useState(false);
  /**
   * ⟳ 2026-09-25 — UN AJUSTEMENT REPRIS DANS LA FENÊTRE. Signalé : un
   * rechargement pendant « Ajuster le plan » fermait la fenêtre d'aperçu et
   * montrait la carte « Ton plan se compose », qui n'a pas sa place dans
   * l'entonnoir. Quand un aperçu existe derrière la composition en vol, la
   * fenêtre se rouvre sur lui et « Ajuster le plan » tourne jusqu'au nouveau.
   */
  const [resumedAdjusting, setResumedAdjusting] = React.useState(false);
  const [resumedFailure, setResumedFailure] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  /** Le refus des gestes de la carte des bouches — rendu SUR la carte. */
  const [mouthFailure, setMouthFailure] = React.useState<string | null>(null);
  /** Le refus du DERNIER bouton, rendu à côté de lui. Voir `guardCompose`. */
  const [composeFailure, setComposeFailure] = React.useState<string | null>(null);
  /**
   * LES HABITUDES, PAR BOUCHE. `null` = LA LECTURE N'A PAS EU LIEU — c'est la
   * garde de chargement que `HouseholdHabitsCard` exige, et sans elle un
   * formulaire figé au montage sur du vide l'écraserait au premier Save.
   *
   * ⚠️ POURQUOI ELLES SONT ICI ET PLUS SEULEMENT SUR `/app/household`. Le
   * questionnaire a été livré sur la page du foyer, et c'est le bon endroit
   * pour le RELIRE. Mais l'entonnoir se termine par une composition: sans
   * cette carte ici, le TOUT PREMIER plan — celui qui fait la première
   * impression — est composé sans savoir que quelqu'un mange une pomme le
   * matin. C'est exactement le défaut que ce questionnaire existe pour fermer,
   * et je l'avais laissé ouvert sur le seul plan où il coûte le plus cher.
   * Même composant, même table, même garde: on le MONTRE plus tôt, on ne le
   * duplique pas.
   */
  const [habits, setHabits] = React.useState<Map<string, MemberHabitsView> | null>(
    null,
  );
  const [flash, setFlash] = React.useState<string | null>(null);
  /**
   * « ON A ESSAYÉ DE QUITTER CETTE ÉTAPE, ET ELLE A RETENU. »
   *
   * Un drapeau d'ÉCRAN, et volontairement pas un fait: la liste affichée est
   * toujours recalculée depuis les faits (elle rétrécit à mesure qu'on répond),
   * ce drapeau ne décide QUE du moment où on commence à la montrer. Sans lui,
   * un compte neuf arriverait à l'étape 2 avec la liste de tout ce qu'il n'a
   * pas encore rempli, juste sous le formulaire qui le demande.
   */
  const [heldBack, setHeldBack] = React.useState(false);
  /** La bouche dont le retrait attend un second clic. Voir `MouthRow`. */
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  /**
   * LA FICHE D'AJOUT EST-ELLE DÉPLIÉE ?
   *
   * ⚠️ FERMÉE PAR DÉFAUT, ET C'EST LE CORRECTIF. Elle était montée en
   * permanence sous la liste des bouches: un bloc en forme de personne, mêmes
   * champs, même bouton de préférences, même phrase « rien de renseigné » — et
   * pour seule différence d'avec une bouche inscrite un trait de bordure en
   * pointillé. Signalé capture à l'appui le 2026-08-19: « je peux toujours pas
   * supprimer le truc qui s'est ajouté tout seul ». Il cherchait un « Retirer »
   * sur un bloc qui n'en avait pas, parce que ce bloc n'était pas quelqu'un —
   * mais rien à l'écran ne le disait, et rien ne permettait de s'en défaire.
   */
  const [mouthFormOpen, setMouthFormOpen] = React.useState(false);
  /**
   * LA CARTE EN COURS D'ÉDITION — une seule à la fois, par `member_id`.
   *
   * ⚠️ UNE SEULE, ET C'EST VOULU: deux cartes ouvertes en même temps, c'est de
   * nouveau vingt contrôles armés à l'écran, c'est-à-dire le défaut que
   * « Modifier » ferme. Ouvrir la seconde referme la première.
   */
  const [editingMouth, setEditingMouth] = React.useState<string | null>(null);
  /**
   * LA CARTE DU TITULAIRE EST-ELLE OUVERTE — 2026-09-20.
   *
   * ── DEUX MOMENTS LA FERMENT, ET UN SEUL EST UN GESTE ─────────────────────
   *
   *   · LE BOUTON « Enregistrer » de la carte, après une écriture RÉUSSIE;
   *   · L'ARRIVÉE SUR LA PAGE, quand les faits disent que sa fiche est faite
   *     (`selfSheetIsHeld`, posé dans `load` à la semence).
   *
   * ⟳ LE SECOND A ÉTÉ AJOUTÉ APRÈS COUP, ET C'ÉTAIT UN OUBLI. Cet état
   * naissait à `true` et le redevenait à chaque montage: un rechargement, ou
   * un « Retour » depuis l'étape 3, rouvrait la fiche du maître en grand
   * pendant que les lignes des autres bouches, elles, restaient repliées —
   * parce que `editingMouth` naît à `null`. « Ça le fait pour les personnes en
   * plus, mais pas pour le compte maître. »
   *
   * ⛔ AUCUN AUTRE MOMENT NE REPLIE. La fenêtre des préférences enregistre en
   * se fermant (`onClose` appelle `saveSelf`), et replier là serait replier
   * sous les doigts de quelqu'un qui est en train de remplir sa fiche. Le
   * « Continuer » de l'étape enregistre lui aussi, mais il change d'écran:
   * replier n'y veut rien dire. Et `load(false)` — qui tourne après CHAQUE
   * écriture — ne touche à rien: seule la semence décide.
   */
  const [selfEditing, setSelfEditing] = React.useState(true);
  /**
   * LA CIBLE ET LE RYTHME DE CHAQUE BOUCHE — `null` = LA LECTURE N'A PAS EU
   * LIEU, et c'est une garde, pas un état d'affichage. Voir `loadMemberTargets`:
   * `setMemberTarget` REMPLACE la paire, donc une carte montée sur du vide non
   * lu effacerait la cible déjà posée au premier enregistrement.
   */
  const [memberTargets, setMemberTargets] = React.useState<
    Map<string, MemberTargetView> | null
  >(null);
  /**
   * LA DATE DE NAISSANCE DE CHAQUE BOUCHE — `null` = lecture pas faite.
   *
   * ⚠️ ELLE NE VIENT PAS DU ROSTER, qui ne rend qu'un état d'âge: « le foyer
   * doit savoir qu'il y a un enfant à table, pas son âge ». Cette règle protège
   * une bouche des AUTRES bouches; elle n'a jamais eu de raison de cacher la
   * date au maître, qui l'a tapée. Voir `loadMemberBirthDates`.
   */
  const [memberBirthDates, setMemberBirthDates] = React.useState<
    Map<string, string> | null
  >(null);
  /**
   * « JUSTE MOI » A ÉTÉ CHOISI ALORS QU'UN FOYER EXISTE — et ce geste-là DÉFAIT
   * le foyer, donc il attend un second clic comme « Retirer ».
   *
   * ⚠️ IL N'EST PAS UN CONFORT: c'était le seul cul-de-sac total de
   * l'entonnoir. La branche se dérive du nombre de bouches (`max(2, …)`), donc
   * répondre « on est deux » à la première question était SANS RETOUR — l'étape
   * 2 retenait ensuite sur `missing_mouths`, et la tuile « Juste moi » était
   * grisée sans un mot. Voir `dissolveHousehold`.
   */
  const [confirmDissolve, setConfirmDissolve] = React.useState(false);
  /**
   * LE PRÉNOM QUE « CONTINUER » VIENT D'ENREGISTRER, ou `null`.
   *
   * ⚠️ CECI EST LA MOITIÉ MANQUANTE DE LA DÉCISION DU 2026-08-15. « Continuer »
   * absorbe le brouillon de bouche — c'est voulu, une fiche remplie n'est pas
   * une fiche à jeter — mais il le faisait EN SILENCE. Signalé sur un compte
   * réel le 2026-08-19: « ça m'a rajouté une personne que je voulais pas ».
   * Un bouton d'avancement qui crée quelqu'un sans le dire est indiscernable
   * d'un bouton qui a mal compris.
   */
  const [mouthAdded, setMouthAdded] = React.useState<string | null>(null);
  /**
   * LA FENÊTRE DU PLAN — deux dates, et c'est la question qui manquait.
   *
   * ── CE QUI ÉTAIT CODÉ EN DUR ──────────────────────────────────────────
   * `compose()` envoyait `{kind:"until_sunday"}` sans jamais le demander. Un
   * premier plan tombait donc sur « d'ici dimanche », que le compte soit créé
   * un lundi (six jours) ou un samedi (un jour et demi) — et personne ne
   * pouvait dire « je pars jeudi, fais-moi trois jours ».
   *
   * ⚠️ ET SANS ELLE, LA GRILLE DE PRÉSENCE N'A PAS DE COLONNES. Le tableau par
   * personne est dimensionné par la fenêtre: pas de dates, pas de jours à
   * décocher. Les deux questions n'en font qu'une.
   */
  const [windowStart, setWindowStart] = React.useState(() => browserLocalDate());
  const [windowEnd, setWindowEnd] = React.useState(() =>
    addDays(browserLocalDate(), 6)
  );
  // Le début pousse la fin devant lui, et la borne de sept jours la retient.
  // Même garde que `MealBuilder`: une fin AVANT le début est refusée par
  // `resolveRequestedWindow`, et un refus qu'on peut rendre impossible à
  // composer ne doit pas exister.
  React.useEffect(() => {
    const maxEnd = addDays(windowStart, MAX_WINDOW_DAYS - 1);
    if (windowEnd < windowStart) setWindowEnd(windowStart);
    else if (windowEnd > maxEnd) setWindowEnd(maxEnd);
  }, [windowStart, windowEnd]);

  // ══════════════════════════════════════════════════════════════════════
  // MINUIT — le début de fenêtre est un INSTANTANÉ DE MONTAGE, et il périme
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT, MESURÉ SUR L'ÉCRAN DU PROPRIÉTAIRE LE 2026-08-20 À 00h03.
  // `windowStart` est initialisé par `browserLocalDate()` DANS un `useState`,
  // donc évalué une seule fois, au montage. Un onglet ouvert la veille tient
  // encore le 19 quand le serveur, qui lit le MÊME fuseau (`Europe/Paris`),
  // est déjà au 20. `resolveRequestedWindow` refuse alors un début dans le
  // passé, et l'écran rend « Ces jours n'ont pas pu être lus » — un message qui
  // parle des JOURS alors que le défaut est une HORLOGE.
  //
  // ⚠️ ON NE CORRIGE QUE LE PASSÉ, JAMAIS L'AVENIR. Une fenêtre que la personne
  // a délibérément posée plus loin (« je pars jeudi ») est sa décision et elle
  // est légitime; la déplacer au prétexte d'un rafraîchissement lui prendrait
  // son choix des mains. Seul un début DEVENU passé est corrigé.
  //
  // ⚠️ ET IL EST CORRIGÉ À L'ÉCRAN, PAS SEULEMENT À L'ENVOI. Rattraper la date
  // au moment du POST enverrait une fenêtre que la grille ne montre pas: la
  // personne verrait les colonnes d'hier et recevrait le plan de demain. Le
  // `setState` remonte donc dans `planWindow`, et les colonnes se réalignent.
  React.useEffect(() => {
    const catchUp = () => {
      const today = browserLocalDate();
      setWindowStart((current) => catchUpWindowStart(current, today));
    };
    // `visibilitychange` couvre l'onglet laissé ouvert toute la nuit;
    // `focus` couvre la fenêtre restée au premier plan sur un autre écran.
    document.addEventListener("visibilitychange", catchUp);
    globalThis.addEventListener("focus", catchUp);
    catchUp();
    return () => {
      document.removeEventListener("visibilitychange", catchUp);
      globalThis.removeEventListener("focus", catchUp);
    };
  }, []);

  /** Les jours de la fenêtre demandée — les colonnes de la grille. */
  const planWindow = React.useMemo(() => {
    const days = Math.max(
      1,
      Math.min(MAX_WINDOW_DAYS, daysBetween(windowStart, windowEnd) + 1),
    );
    return {
      startsOn: windowStart,
      durationDays: days,
      tokens: windowDayOrder(windowStart, days),
      dates: Array.from({ length: days }, (_, i) => addDays(windowStart, i)),
    };
  }, [windowStart, windowEnd]);

  const [self, setSelf] = React.useState<SelfDraft | null>(null);
  const [plan, setPlan] = React.useState<FunnelPlanAnswers | null>(null);
  const [mouth, setMouth] = React.useState<MouthDraft>(emptyMouthDraft);

  /**
   * LE BROUILLON GARDÉ, LU UNE SEULE FOIS PAR COMPTE.
   *
   * ⚠️ LA MÉMOÏSATION N'EST PAS UNE OPTIMISATION, c'est une garde d'ordre.
   * Deux endroits le lisent — `load` au montage, et l'effet de l'envie APRÈS
   * son `await` — pendant que le miroir, lui, écrit dès que la lecture est
   * finie. Sans cette mémoire, le second lecteur relirait ce que le miroir
   * vient d'écrire, c'est-à-dire un état où l'envie n'a pas encore été
   * restaurée: la phrase gardée s'effacerait avec elle-même.
   */
  const bootDraft = React.useRef<
    { userId: string; value: StoredSetupDraft | null } | null
  >(null);
  const bootDraftFor = React.useCallback(
    (id: string): StoredSetupDraft | null => {
      if (!id) return null;
      if (bootDraft.current?.userId !== id) {
        bootDraft.current = { userId: id, value: readSetupDraft(id, Date.now()) };
      }
      return bootDraft.current.value;
    },
    [],
  );
  // ⛔ ICI SE TENAIENT `invite`, `inviteEmail` ET `inviteFor` — les trois états
  // du panneau « Lui donner son propre accès ? », retiré de l'entonnoir le
  // 2026-09-20 avec son écrivain (`sendInvite`). L'invitation vit sur
  // `/app/household`. Voir la pierre tombale dans la ligne d'une bouche.

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * L'APERÇU — LOT A. LA SORTIE DE L'ENTONNOIR PASSE PAR LÀ, PLUS DIRECTEMENT
   * PAR L'ÉCRITURE.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ── CE QUE ÇA REMPLACE, ET POURQUOI C'EST ICI QUE ÇA COMPTE ──────────────
   * `compose()` appelait `generateMeal` / `generateHouseholdMeal` avec un
   * `intent: "prepare_next"`, c'est-à-dire qu'il ÉCRIVAIT. Le premier plan de
   * quelqu'un — le seul moment où il décide de rester — arrivait donc sans
   * qu'il l'ait vu, sans le CONSTAT qui explique pourquoi ces jours-là, et sans
   * aucun geste pour dire « pas comme ça ». La même fenêtre existait depuis le
   * 2026-08-13 sur `/app/plan`, montée nulle part ailleurs.
   *
   * ⛔ RIEN N'EST RECRÉÉ ICI. `PlanDraftDialog` monte `PlanResult`, le rendu
   * UNIQUE d'un plan; `composeDraft`/`writeFromDraft` sont les mêmes appels que
   * `/app/plan` fait. Un second dialogue d'aperçu divergerait au premier
   * correctif, et c'est celui qu'on regarde le moins qui garderait l'ancien
   * comportement.
   *
   * ⚠️ `draft === null` VEUT DIRE « RIEN À MONTRER », et la fenêtre ne s'ouvre
   * qu'après: composer prend de 100 à 200 secondes, et ouvrir un cadre vide
   * d'abord ferait regarder le vide pendant deux minutes. Le bouton dit qu'il
   * travaille là où on a cliqué.
   */
  const [draft, setDraft] = React.useState<PlanDraft | null>(null);
  // ⟳ 2026-09-25 — LE VRAI PLAN ET LA DÉMONSTRATION (`plan/demo/demoGate`):
  // on dit à la démonstration que le plan est là; l'aperçu se cache tant
  // que sa fenêtre est ouverte.
  usePublishRealPlanReady(draft !== null);
  const demoOpen = useDemoOpen();
  /**
   * UNE COMPOSITION EST EN VOL — et seulement elle. `busy` sert aussi aux
   * enregistrements de l'entonnoir (`guard`, `guardMouth`): la démonstration
   * du plan ne doit pas s'inviter pendant qu'on enregistre une allergie.
   */
  const [composeBusy, setComposeBusy] = React.useState(false);
  /**
   * ⛔ PLUS DE PHRASE RETENUE POUR L'ADOPTION (lot 4, 2026-09-08). Lire la
   * phrase c'est L'APPLIQUER (un cran d'appétit, un réglage, un goût); la
   * retenir et la relire à l'adoption appliquait le même cran DEUX fois. La
   * phrase fait son effet à la reprise, depuis le dialogue (`readNote`), et
   * l'adoption relit le magasin, qui porte déjà le plan final.
   */
  /**
   * ⟳ 2026-09-21 — PAS D'ÉTAT D'OUVERTURE: LA FENÊTRE EST OUVERTE TANT QUE LE
   * BROUILLON EXISTE. Même geste et même motif que sur `/app/plan`, où le
   * défaut a été signalé: « quand on a un plan en attente d'être validé ou
   * annulé, il faut que l'écran revienne à la pop-up du draft, sinon ça se
   * perd et on peut plus jamais y accéder ».
   *
   * « Laisser tomber » jette donc le brouillon au lieu de refermer une
   * fenêtre en le laissant derrière — un aperçu payé qu'aucun geste ne peut
   * plus atteindre.
   *
   * ⟳ 2026-09-23 — ET LA RÉPONSE EST RANGÉE EN BASE (`discardDraft`, ligne
   * `discarded`) : la ligne restait `done` et `recoverLatestDraft()` la
   * rouvrait au prochain passage. Même motif que sur `/app/plan`.
   */
  const recoveredDraftFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!userId || recoveredDraftFor.current === userId) return;
    // ⛔ LA GARDE SE POSE À L'ATTERRISSAGE, PAS AU DÉPART — même leçon que
    // `/app/plan` : `StrictMode` monte l'effet deux fois, et une garde posée
    // avant l'`await` laissait le premier passage annulé et le second refusé.
    let cancelled = false;
    void (async () => {
      try {
        const recoverable = await recoverLatestDraft();
        if (cancelled || recoverable === null) return;
        // ⟳ 2026-09-21 — demandé depuis la plateforme, l'aperçu se rouvre
        // sur la plateforme ; « Laisser tomber » y ramène là où on était.
        if (recoverable.origin === "plan") {
          navigate(DRAFT_ORIGIN_PATH.plan, { replace: true });
          return;
        }
        setBusy(true);
        // ⟳ 2026-09-25 — EN VOL : UN AJUSTEMENT (un aperçu derrière) se suit
        // DANS la fenêtre, rouverte sur l'aperçu d'avant; une PREMIÈRE
        // composition se suit comme sans rechargement (la démonstration du
        // plan, `(composeBusy || resumingDraft) && draft === null`). Plus de
        // carte d'attente ici.
        let behind: PlanDraft | null = null;
        if (recoverable.state === "in_flight") {
          behind = await recoverPreviewBehind(recoverable.draftId);
          if (cancelled) return;
          if (behind !== null) {
            setDraft(behind);
            setResumedFailure(null);
            setResumedAdjusting(true);
          } else {
            setResumingDraft(true);
          }
        }
        let recovered: PlanDraft;
        try {
          recovered = recoverable.state === "done"
            ? recoverable.draft
            : await waitForDraft(recoverable.draftId, { onProgress: setProgress });
        } catch (error) {
          // Un ajustement repris qui échoue laisse l'aperçu d'avant en place,
          // et l'échec se dit dans la fenêtre, à côté de « Ajuster le plan ».
          if (behind === null) throw error;
          if (!cancelled) setResumedFailure(refusalMessage(error));
          recovered = behind;
        }
        if (cancelled) return;
        setDraft(recovered);
        // ⟳ 2026-09-24 — LA FENÊTRE REVIENT AVEC L'APERÇU. La page repartait
        // de sa fenêtre par défaut (7 jours à partir d'aujourd'hui) pendant
        // que l'aperçu repris en montrait une autre: toute reprise était
        // refusée (`draft_mismatch`, mesuré sur un brouillon de 3 jours), et
        // « Ajuster » recomposait une autre semaine.
        // ⚠️ LA FENÊTRE DE SA DEMANDE, PAS CELLE QU'IL A RANGÉE: le serveur
        // ajoute lui-même la veille de cuisine à une demande (« je cuisine la
        // veille »), et la lui renvoyer déjà ajoutée décalerait la reprise
        // d'un jour. La fenêtre rangée ne sert que pour une ligne d'avant la
        // demande relue (`recoverable.input` nul). Un départ passé n'est pas
        // repris: le rattrapage du jour (`catchUpWindowStart`) le corrigerait.
        const asked = recoverable.input?.window;
        const { startsOn, durationDays } = asked && asked.kind === "exact"
          ? asked
          : recovered.plan;
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(startsOn) && startsOn >= browserLocalDate() &&
          Number.isInteger(durationDays) && durationDays >= 1
        ) {
          setWindowStart(startsOn);
          setWindowEnd(addDays(startsOn, durationDays - 1));
        }
        setComposeFailure(null);
      } catch (error) {
        if (!cancelled) {
          setComposeFailure(refusalMessage(error));
        }
      } finally {
        if (!cancelled) {
          recoveredDraftFor.current = userId;
          setBusy(false);
          setResumingDraft(false);
          setResumedAdjusting(false);
          setProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, navigate]);
  // ⟳ 2026-09-23 — LA COMPOSITION REPRISE SE SUIT DEPUIS LA DERNIÈRE ÉTAPE,
  // celle de son bouton : c'est là qu'elle a été lancée, et c'est là que son
  // issue (la fenêtre, ou le refus à côté du bouton) se lit.
  React.useEffect(() => {
    if (!(resumingDraft || resumedAdjusting) || state.kind !== "ready" || !facts) return;
    setStepIndex(funnelSteps(facts.branch ?? "solo").length - 1);
  }, [resumingDraft, resumedAdjusting, state.kind, facts]);
  /**
   * LOT B — COMMENT ON CUISINE CETTE SEMAINE. `null` = « laisse décider », et
   * c'est le DÉFAUT: le calcul du moteur gouverne alors seul, exactement comme
   * avant ce lot.
   *
   * ⚠️ IL N'EST PAS DANS `plan` (`FunnelPlanAnswers`), ET C'EST LE POINT. Tout
   * ce que porte cet objet-là est ÉCRIT par `savePlanAnswers` dans
   * `practical_constraints`, donc appliqué en silence à toutes les semaines
   * suivantes — « y compris celle où on reçoit du monde » (`CookingCapacityCard`,
   * 2026-08-13). Ce choix-ci se refait à chaque composition; il ne s'enregistre
   * nulle part et repart avec la demande.
   */
  /**
   * L'ENVIE DE LA MAISON, POUR LA SEMAINE DU DÉPART CHOISI.
   *
   * ⚠️ ANCRÉE SUR `planWindow.startsOn`, PAS SUR AUJOURD'HUI — même règle que
   * `MealBuilder` (`envyWeek`). Deux dates libres rendent l'écart atteignable:
   * écrire sur la semaine courante ferait disparaître l'envie d'un plan qui
   * commence lundi prochain.
   */
  const [envy, setEnvy] = React.useState("");
  /** La semaine LUE, pour ne pas écraser une saisie en cours par une relecture. */
  const [envyPrint, setEnvyPrint] = React.useState<string | null>(null);
  const envyWeek = React.useMemo(
    () => weekStartFor(planWindow.startsOn, "mon"),
    [planWindow.startsOn],
  );
  /**
   * ⚠️ LA PORTE DE CHARGEMENT EST `envyPrint`, ET ELLE EST OBLIGATOIRE — même
   * patron que `MealBuilder`. Sans elle, chaque rendu relirait la base et
   * écraserait ce qu'on est en train de taper. Ce qui est comparé est la
   * SEMAINE lue: tant qu'elle ne correspond pas à `envyWeek`, on relit.
   */
  React.useEffect(() => {
    if (envyPrint === envyWeek) return;
    let alive = true;
    void (async () => {
      try {
        const line = await loadEnvyLine(envyWeek);
        if (!alive) return;
        // ── ⚠️ LE BROUILLON NE PARLE QUE SUR UN SILENCE SERVEUR ───────────
        // La règle de la réconciliation, dans sa forme la plus simple: une
        // ligne déjà écrite pour CETTE semaine gagne toujours, et le cache ne
        // comble que le trou — la phrase tapée et jamais envoyée, qui est le
        // seul état que la base ne peut pas rendre.
        //
        // ⚠️ LA SEMAINE EST COMPARÉE, parce que l'envie est écrite PAR SEMAINE
        // (`household_envy_submissions`). Restaurer la phrase gardée pour la
        // semaine d'avant sur un plan qui commence lundi prochain la poserait
        // sur la mauvaise — c'est le piège que `envyWeek` existe pour éviter.
        const kept = bootDraftFor(userId);
        const keptLine = kept && kept.draft.envyWeek === envyWeek
          ? kept.draft.envy
          : "";
        setEnvy(line && line.trim() ? line : keptLine);
        setEnvyPrint(envyWeek);
      } catch {
        // ⚠️ MUET, ET C'EST VOULU: ne pas savoir ce qui a été écrit la semaine
        // dernière n'empêche pas de composer. Un refus ici bloquerait l'étape
        // entière pour un champ facultatif.
        if (alive) setEnvyPrint(envyWeek);
      }
    })();
    return () => {
      alive = false;
    };
  }, [envyWeek, envyPrint, userId, bootDraftFor]);
  /**
   * ⟳ 2026-09-25 — « COMBIEN DE FOIS TU VEUX CUISINER », 1 à 4, ou `null` =
   * pas encore répondu. Il remplace « tout cuisiner en une seule fois »
   * (2026-09-01): « une fois » est une réponse parmi les autres.
   *
   * ⚠️ IL VIT ICI ET PAS DANS `draft` (`FunnelPlanAnswers`), pour la raison
   * exacte écrite pour `cookingShape` juste au-dessus: tout ce que porte
   * `draft` est ÉCRIT dans `practical_constraints` par `savePlanAnswers`,
   * c'est-à-dire appliqué en silence à toutes les semaines suivantes. Le
   * nombre de sessions dépend de la longueur du plan: il se redemande à chaque
   * composition.
   */
  const [cookingSessions, setCookingSessions] = React.useState<CookingSessionCount | null>(null);
  /** Le bouton de fin a été refusé sur les réponses de cuisine: les champs le disent. */
  const [cookingMissesShown, setCookingMissesShown] = React.useState(false);
  // ⟳ A1 (2026-09-03) — L'ÉTAT « JE CUISINE LA VEILLE » A DISPARU AVEC SA
  // CASE. La veille est dérivée côté serveur (`leadDayFor`) de la date de
  // départ et de l'heure locale, coupure à 18 h; le navigateur ne connaît pas
  // l'heure et ne doit pas essayer de rejouer ce verdict.

  /**
   * SON POIDS VISÉ ET SON RYTHME — LES DEUX SEULES VALEURS GARDÉES ICI.
   *
   * ⚠️ `null` = LA LECTURE N'A PAS EU LIEU, et l'étape 3 ne rend alors aucun
   * champ. Ces deux valeurs existent peut-être DÉJÀ en base (`/app/household`
   * les écrit): un formulaire qui afficherait du vide non lu les écraserait au
   * « Continuer ».
   *
   * ⚠️ ON NE GARDE QUE CES DEUX-LÀ, PAS UN `MouthFormDraft` ENTIER. Le reste du
   * brouillon — direction, corps, date de naissance — vit déjà dans `self`, et
   * c'est LUI qui borne le curseur. Une seconde copie prendrait une photo à la
   * lecture et cesserait de suivre ce qui est tapé à l'étape 2: on choisirait un
   * rythme calculé sur un corps périmé.
   */
  const [selfTarget, setSelfTarget] = React.useState<
    { targetWeightKg: string; paceKgPerWeek: string } | null
  >(null);

  /**
   * QUI EST DEVANT LA FENÊTRE DES PRÉFÉRENCES — ou `null`, elle est fermée.
   *
   * ⚠️ UNE SEULE FENÊTRE POUR TROIS SURFACES (le titulaire, la fiche qu'on
   * ajoute, chaque bouche déjà inscrite), et c'est le point: les champs
   * d'allergies EN LIGNE ont disparu de l'étape 2 le 2026-08-18 — ils étaient
   * la moitié éclatée d'un formulaire dont l'autre moitié vivait déjà dans une
   * fenêtre. Trois copies de la fenêtre auraient rouvert la même plaie.
   */
  const [prefsFor, setPrefsFor] = React.useState<
    | { kind: "self" }
    | { kind: "new" }
    | { kind: "member"; memberId: string }
    | null
  >(null);
  /**
   * LE BROUILLON DE PRÉFÉRENCES D'UNE BOUCHE DÉJÀ INSCRITE.
   *
   * ⚠️ UN SEUL À LA FOIS, ET IL PORTE SON `memberId`. Une carte par bouche
   * aurait demandé une table d'états dont l'écran ne sait rien faire: on
   * n'édite qu'une personne à la fois, et le bouton d'enregistrement de sa
   * ligne est juste sous le sien.
   *
   * ⛔ SES ALLERGIES NE SONT PAS SEMÉES — la porte AJOUTE (`add_*`), et le
   * roster ne rend de toute façon que « la question a-t-elle été posée ». Ses
   * habitudes, elles, LE SONT: leur porte remplace la liste complète.
   */
  const [memberPrefs, setMemberPrefs] = React.useState<
    { memberId: string; draft: MouthFormDraft } | null
  >(null);
  /**
   * LES DÉGOÛTS DÉJÀ PARTIS EN BASE, PAR BOUCHE.
   *
   * ⚠️ `household_food_restrictions` n'a QUE `add` et `remove` — il n'existe
   * pas de « poser la liste ». Or « Continuer » peut être appuyé dix fois, et
   * `saveSelf` est rappelé par `addMouth`: sans ce registre, un dégoût saisi
   * une fois se réécrirait à chaque geste. On n'envoie donc que le DELTA.
   *
   * ⚠️ UNE `ref`, PAS UN ÉTAT: le rendu n'en dépend pas, et un `setState` dans
   * un écrivain relancerait un rendu au milieu d'une chaîne d'écritures.
   */
  const writtenDislikes = React.useRef<Map<string, Set<string>>>(new Map());

  /**
   * L'ÉTAT SERVEUR QUE LE BROUILLON À L'ÉCRAN A VU EN DERNIER — L'ARBITRE.
   *
   * ⚠️ UNE `ref`, PAS UN ÉTAT: aucun rendu n'en dépend, et un `setState` posé
   * dans `load` relancerait un tour de rendu au milieu d'une chaîne de
   * lectures. Même raison que `writtenDislikes` juste au-dessus.
   *
   * Il est réécrit à CHAQUE `load`, y compris les `load(false)` qui suivent une
   * écriture: « la dernière chose que le serveur nous a dite ». C'est ce qui
   * distingue, au rechargement suivant, une saisie jamais enregistrée d'une
   * valeur qu'un AUTRE écran a changée depuis. Voir `lib/setupDraftCache.ts`.
   */
  const serverBase = React.useRef<
    { self: SelfDraft; plan: FunnelPlanAnswers } | null
  >(null);

  /**
   * LA LECTURE, ET ELLE RESTE LA SEULE SOURCE DE L'ÉTAT.
   *
   * ⚠️ LE BROUILLON LOCAL NE LA REMPLACE PAS, il se glisse DESSOUS: la
   * réconciliation ne lui donne un champ que lorsque la base n'a rien de plus
   * récent à en dire. Les trois règles sont dans `lib/setupDraftCache.ts`, et
   * elles sont écrites contre la cicatrice « formulaire figé au montage » —
   * celle-là même que la porte de montage ci-dessous garde par l'autre bout.
   *
   * ⚠️ `seed` NE RESÈME LES BROUILLONS QU'AU PREMIER CHARGEMENT. Un `refresh`
   * après une écriture qui réécraserait les champs ferait perdre ce que la
   * personne est en train de taper dans la section d'à côté — le défaut exact
   * que la fenêtre de `/app/plan` a mis un chantier à refermer.
   */
  const load = React.useCallback(
    async (seed: boolean, chosenSize: number | null = null) => {
      if (!userId) return;
      try {
        let read = await readFunnelFacts(userId);
        // Une réponse HTTP peut se perdre APRES le commit (mesuré sur la toute
        // première adoption: la ligne existait, le bouton disait encore
        // « Enregistrement… »). Le plan vivant est l'accusé de réception
        // durable: au rechargement ou au retour de visibilité, on termine le
        // couloir au lieu de proposer un second plan sur la même fenêtre.
        if (read.hasPlan) {
          clearSetupDraft(userId);
          navigate("/app/plan", { replace: true });
          return;
        }
        const kept = seed ? bootDraftFor(userId) : null;
        const pendingSize = chosenSize ?? kept?.draft.householdSize ?? null;
        // `student_goals` porte aujourd'hui `household_size`, mais son champ
        // `goal` est NOT NULL. L'étape 1 ne connaît pas encore cet objectif:
        // le choix reste donc un brouillon jusqu'au Save de l'étape 2.
        if (
          pendingSize !== null && read.state.self.goal === null &&
          declaredHouseholdSize(read.practicalConstraints) === null
        ) {
          read = withPendingHouseholdSize(read, pendingSize);
          setPendingHouseholdSize(pendingSize);
        } else if (seed || chosenSize !== null) {
          setPendingHouseholdSize(null);
        }
        setFacts(read);
        // LES HABITUDES SUIVENT LA MÊME LECTURE. Un foyer absent rend une
        // carte vide plutôt qu'une erreur: le compte solo est le chemin
        // majoritaire et il n'a personne à décrire.
        // ⚠️ LA CARTE EST GARDÉE EN LOCAL, PAS SEULEMENT POSÉE DANS L'ÉTAT:
        // le brouillon du titulaire s'en SÈME quelques lignes plus bas, et
        // `setHabits` ne rend pas la valeur au tour de boucle courant.
        // Sans cette semence, ouvrir la fenêtre et enregistrer EFFACERAIT les
        // habitudes déjà déclarées — la porte remplace la liste COMPLÈTE.
        const habitsMap: Map<string, MemberHabitsView> = read.householdId
          ? await loadMemberHabits().catch(() =>
            new Map<string, MemberHabitsView>()
          )
          : new Map<string, MemberHabitsView>();
        setHabits(habitsMap);
        // MÊME LECTURE, MÊME GARDE QUE LES HABITUDES: sans foyer il n'y a pas
        // de ligne membre, donc pas de cible de bouche — une Map vide, pas une
        // erreur.
        setMemberBirthDates(
          read.householdId
            ? await loadMemberBirthDates(
              read.mouths.map((m) => m.memberId ?? "").filter(Boolean),
            ).catch(() => new Map<string, string>())
            : new Map<string, string>(),
        );
        setMemberTargets(
          read.householdId
            ? await loadMemberTargets(read.householdId).catch(() =>
              new Map<string, MemberTargetView>()
            )
            : new Map<string, MemberTargetView>(),
        );
        // SA CIBLE ET SON RYTHME, DEPUIS `student_goals`. Hors du `seed`: ces
        // deux valeurs ne sont pas un brouillon de saisie, ce sont des FAITS
        // qu'une autre surface a pu écrire entre-temps — et l'étape 3 doit les
        // relire après chaque écriture, comme le reste.
        const own = await loadOwnMouth(userId).catch(() => null);
        setSelfTarget({
          targetWeightKg: own?.targetWeightKg === null ||
              own?.targetWeightKg === undefined
            ? ""
            : String(own.targetWeightKg),
          paceKgPerWeek: own?.paceKgPerWeek === null ||
              own?.paceKgPerWeek === undefined
            ? ""
            : String(own.paceKgPerWeek),
        });
        // ── L'ARBITRE DU BROUILLON LOCAL ─────────────────────────────────
        // Calculée à CHAQUE lecture, semée ou non — et c'est ce qui la rend
        // juste. C'est le troisième terme de la réconciliation: « l'état
        // serveur que le brouillon à l'écran a vu pour la dernière fois ». La
        // tenir à jour après chaque écriture est ce qui permet de corriger un
        // champ, l'enregistrer, le recorriger, recharger — et retrouver la
        // SECONDE correction plutôt que la première.
        const seeded = seedSelfFrom(read, habitsMap);
        serverBase.current = { self: seeded, plan: read.state.plan };
        if (seed) {
          // ⚠️ LU AVANT QUE LE MIROIR N'ÉCRIVE, et `bootDraftFor` le mémorise:
          // l'effet de l'envie relit le même brouillon plus tard, après un
          // `await`, et il doit voir ce qui était là AU MONTAGE.
          setSelf(reconcileDraft({
            base: takeKnownShape(seeded, kept?.base.self),
            draft: takeKnownShape(seeded, kept?.draft.self),
            fresh: seeded,
          }));
          setPlan(reconcileDraft({
            base: takeKnownShape(read.state.plan, kept?.base.plan),
            draft: takeKnownShape(read.state.plan, kept?.draft.plan),
            fresh: read.state.plan,
          }));
          const branch = read.branch;
          const step = branch ? nextIncomplete(read.state, branch) : null;
          const steps = branch ? funnelSteps(branch) : [];
          if (kept) {
            // ── LA FICHE D'AJOUT EN COURS ──────────────────────────────────
            // Aucun pendant serveur: tant qu'on n'a pas cliqué « Ajouter »,
            // cette bouche n'existe nulle part. Rien à réconcilier, on la
            // reprend telle quelle.
            setMouth(takeKnownShape(emptyMouthDraft(), kept.draft.mouth));
            // ⚠️ LE CRAN EST RESTAURÉ, PAS RECALCULÉ. `nextIncomplete` tranche
            // sur ce qu'il y a EN BASE; les réponses qu'on vient de restaurer,
            // elles, n'y sont justement pas. Le recalculer renverrait à
            // l'étape 2 quelqu'un qui était à l'étape 4, devant des champs
            // déjà remplis à l'écran — un écran qui se contredit lui-même.
            // Borné à la branche du jour: elle a pu changer entre-temps.
            setStepIndex(
              Math.min(
                Math.max(0, kept.draft.stepIndex),
                Math.max(0, steps.length - 1),
              ),
            );
            // ⚠️ RELU CONTRE LE VOCABULAIRE, pas repris tel quel. C'est le
            // seul champ du brouillon dont la valeur est un JETON FERMÉ que
            // l'écran rend directement; les autres sont des chaînes libres ou
            // passent par une porte qui refuse. Voir `COOKING_SHAPES`.
            // ⟳ 2026-09-25 — `readSetupDraft` l'a déjà relu contre le
            // vocabulaire (`readCookingSessions`): 1 à 4, ou `null`.
            setCookingSessions(kept.draft.cookingSessions);
          } else {
            // ── LA REPRISE QUI TOMBAIT SUR UN MUR ────────────────────────
            //
            // ⟳ 2026-09-11 — SIGNALÉ SUR UN COMPTE RÉEL: « j'ai voulu faire un
            // test en mettant une seule personne, ça m'a bloqué en me disant
            // qu'il fallait en ajouter une autre », et « je suis tombé direct
            // sur l'étape 2 ».
            //
            // Le chemin, mesuré: l'étape 1 ne peut pas écrire sa réponse tout
            // de suite (`household_size` vit dans `student_goals`, qui n'existe
            // pas avant l'objectif de l'étape 2), donc « juste moi » ne vit
            // qu'en mémoire. Un rechargement le perd, `funnelMouths` applique
            // son repli `max(2, membres)` — donc « à deux » — et la reprise
            // ouvre à l'étape 2 en exigeant une bouche qui n'existera jamais.
            //
            // ⛔ LA SEULE ÉTAPE QUI LÈVE CE REFUS EST LA PREMIÈRE, et c'est
            // pour ça qu'on y retourne. Une branche qui attend des bouches
            // alors qu'AUCUNE n'est saisie est soit une réponse perdue, soit
            // une réponse qu'on veut changer: dans les deux cas la question à
            // reposer est « pour combien de personnes cuisinez-vous », pas
            // « ajoutez les autres personnes ». On ne peut pas répondre à la
            // première depuis l'écran de la seconde.
            //
            // ⚠️ ET SEULEMENT DANS CE CAS: dès qu'une bouche est saisie, la
            // reprise reste celle de `nextIncomplete` — un foyer à moitié
            // rempli se termine, il ne recommence pas.
            const stuckBeforeAnyMouth = branch !== null && branch !== "solo" &&
              read.mouths.length === 0;
            setStepIndex(
              stuckBeforeAnyMouth
                ? 0
                : step
                ? Math.max(0, steps.findIndex((s) => s.id === step.id))
                : Math.max(0, steps.length - 1),
            );
          }
          // ══════════════════════════════════════════════════════════════
          // LA CARTE DU TITULAIRE S'OUVRE REPLIÉE QUAND ELLE EST FAITE
          // ══════════════════════════════════════════════════════════════
          //
          // Signalé à l'écran: « une fois qu'il y a eu un clic sur
          // enregistrer, ça le fait pour les personnes en plus, mais pas pour
          // le compte maître ». Vrai, et l'asymétrie était dans l'état: une
          // ligne de bouche se replie parce que `editingMouth` naît à `null`,
          // alors que `selfEditing` naissait à `true` et le redevenait à
          // chaque montage.
          //
          // ⛔ ET ON NE POSE PAS DE DRAPEAU « déjà enregistré ». La question
          // est déjà répondue par les FAITS: `peopleStepBlockers` dit, par
          // personne, ce qui retient l'étape, et `who: null` est le
          // titulaire. Rien ne le retient ⇒ sa fiche est faite ⇒ elle
          // s'affiche en résumé. C'est la même posture que `nextIncomplete`,
          // qui refuse `profiles.onboarding_completed` parce qu'un drapeau
          // ment dans les deux sens — ici il mentirait en repliant une fiche
          // que quelqu'un vient de vider depuis un autre écran.
          //
          // ⚠️ SEULEMENT À LA SEMENCE. `load(false)` tourne après CHAQUE
          // écriture, y compris celle de la fenêtre des préférences: replier
          // là serait replier sous les doigts de quelqu'un en train de
          // remplir sa fiche.
          //
          // ⟳ 2026-09-24 — ET LE SOLO AUSSI: sa fiche a maintenant son
          // « Enregistrer », donc elle se replie comme les autres quand elle
          // est faite.
          if (branch !== null) {
            setSelfEditing(selfSheetIsHeld(read.state, branch));
          }
        }
        setState({ kind: "ready" });
      } catch (error) {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [userId, bootDraftFor, navigate],
  );

  React.useEffect(() => {
    void load(true);
  }, [load]);

  // L'étape finale ne garde jamais une branche calculée avant l'écriture de
  // `household_size`. C'est atteignable après une mise à jour à chaud: la base
  // dit déjà « solo », mais l'état React monté avant le correctif dit encore
  // « couple » et `missing_mouths` laisse le bouton gris. Une relecture unique
  // à l'entrée de l'étape 3 réaligne les deux sans toucher aux brouillons.
  React.useEffect(() => {
    if (state.kind !== "ready" || stepIndex !== 2) return;
    void load(false);
  }, [state.kind, stepIndex, load]);

  // ── LE MIROIR ────────────────────────────────────────────────────────────
  // Il écrit à chaque frappe, et c'est le point: un brouillon n'a de valeur que
  // s'il est à jour à la seconde où l'onglet meurt. `localStorage` est synchrone
  // et local — il n'y a pas d'arbitrage de coût à faire ici.
  //
  // ⚠️ GARDÉ SUR `state.kind === "ready"`, ET LA GARDE EST OBLIGATOIRE. Avant
  // la fin de la lecture, `self` et `plan` valent `null` et `serverBase` n'a pas
  // encore d'arbitre: écrire là écraserait le brouillon qu'on est justement en
  // train de restaurer, par le vide qui le précède. C'est la porte de montage
  // de l'écran, prise du côté de l'écriture.
  React.useEffect(() => {
    if (state.kind !== "ready") return;
    const base = serverBase.current;
    if (!userId || !self || !plan || !base) return;
    writeSetupDraft(
      userId,
      {
        base,
        draft: {
          self,
          plan,
          mouth,
          stepIndex,
          householdSize: pendingHouseholdSize,
          cookingSessions,
          envy,
          envyWeek,
        },
      },
      Date.now(),
    );
  }, [
    state.kind,
    userId,
    self,
    plan,
    mouth,
    stepIndex,
    pendingHouseholdSize,
    // ⛔ SANS CETTE LIGNE, LE MIROIR NE SE RÉVEILLE PAS. Cocher la case ne
    // changerait aucune autre dépendance: l'effet ne repartirait pas, et
    // l'onglet rechargé retrouverait la case décochée — un brouillon qui perd
    // la seule réponse qui n'existe nulle part ailleurs.
    cookingSessions,
    envy,
    envyWeek,
  ]);

  // ⟳ 2026-09-04 — `selfMouthDraft` EST REMONTÉ AVEC LE CROCHET QUI LE LIT.
  // C'est une valeur DÉRIVÉE de `self` et `selfTarget`, tous deux résolus bien
  // au-dessus: la remonter ne change aucune valeur, seulement le moment où elle
  // est connue. Elle devait suivre, parce qu'un crochet ne peut pas vivre plus
  // haut que ce qu'il lit.
  const selfMouthDraft: MouthFormDraft | null = self === null ||
      selfTarget === null
    ? null
    : {
      ...emptyMouthFormDraft(),
      firstName: self.firstName,
      birthDate: self.birthDate,
      goal: self.goal,
      heightCm: self.heightCm,
      weightKg: self.weightKg,
      gender: self.gender,
      // `null` (personne n'a répondu) devient `""` dans ce vocabulaire-ci:
      // les deux disent la même chose, et `tokens.ts` refuse un jeton
      // d'ignorance des deux côtés.
      activityLevel: self.activityLevel ?? "",
      targetWeightKg: selfTarget.targetWeightKg,
      paceKgPerWeek: selfTarget.paceKgPerWeek,
      // ── ET CE QUI SE SAISIT DERRIÈRE LE BOUTON (2026-08-18) ──────────────
      // Les blocs 4-6 de la fenêtre éditent CE brouillon-ci. Sans ces quatre
      // lignes ils recevraient le vide de `emptyMouthFormDraft()` à chaque
      // rendu, c'est-à-dire un formulaire qui oublie ce qu'on vient d'y taper.
      allergies: self.allergies,
      allergiesNone: self.allergiesNone,
      habits: self.habits,
      light: self.light,
      // ⟳ 2026-09-23 — sans elle, la fenêtre recevrait le `{}` de
      // `emptyMouthFormDraft()` à chaque rendu: le bouton cliqué se rallumerait
      // sur « Selon l'objectif » dans la même image.
      sideCourses: self.sideCourses,
      dislikes: self.dislikes,
      shaker: self.shaker,
      diet: self.diet,
      rhythm: self.rhythm,
      // ── ⑤ — IL MANQUAIT, ET SES TROIS CRANS ÉTAIENT INERTES ─────────────
      //
      // « J'arrive pas à cocher les choix » (2026-08-24). Sans cette ligne, la
      // fenêtre recevait le vide d'`emptyMouthFormDraft()` à chaque rendu: un
      // radio qu'on coche remonte dans `self`, `selfMouthDraft` se recalcule,
      // et il rend `""` — donc le radio se décoche dans la même image.
      // Exactement le défaut du RÉGIME, quatre jours plus tard.
      appetite: self.appetite,
    };

  // ⚠️ AU-DESSUS DE LA PORTE DE MONTAGE, ET C'EST UNE RÈGLE DE REACT, PAS UN
  // GOÛT. `useEatingStructure` est un crochet: appelé APRÈS le `return` de
  // chargement, il ne s'exécute pas au premier rendu et l'ordre des crochets
  // change d'un rendu à l'autre. `react-hooks/rules-of-hooks` l'a refusé au
  // commit — la garde a fait exactement son travail.
  //
  // ⛔ IL SUPPORTE `null` PARTOUT: `prefsFor`, `self` et `plan` peuvent ne pas
  // être lus ici. C'est la condition pour qu'il vive au-dessus de la porte.
  const prefsDraft: MouthFormDraft | null = prefsFor === null
    ? null
    : prefsFor.kind === "self"
    ? selfMouthDraft
    : prefsFor.kind === "new"
    ? mouth
    : (memberPrefs?.draft ?? null);
  const prefsStructure = useEatingStructure({
    draft: prefsDraft,
    active: prefsFor !== null,
    todayLocalIso: browserLocalDate(),
    // ⛔ CE CROCHET SERT LES TROIS SUJETS DE L'ÉCRAN, ET C'EST LUI QUI A
    // MORDU (2026-09-19): sans ce nom, la fiche d'une bouche s'ouvrait sur les
    // moments recommandés à la PRÉCÉDENTE, et la pré-coche les verrouillait.
    // Le détail est dans `lib/useEatingStructure.ts`.
    subject: prefsFor === null
      ? "none"
      : prefsFor.kind === "member"
      ? `member:${prefsFor.memberId}`
      : prefsFor.kind,
  });

  // ── LA PORTE DE MONTAGE ──────────────────────────────────────────────────
  // Aucun formulaire avant la fin de la lecture. Voir la règle 2 de l'en-tête:
  // un écran qui affiche du vide non lu finit toujours par le faire écrire.
  if (state.kind === "loading" || !facts || !self || !plan) {
    return (
      <FunnelShell>
        <p className="text-sm text-ink-soft">{t("setup.loading")}</p>
      </FunnelShell>
    );
  }

  if (state.kind === "error") {
    return (
      <FunnelShell>
        <Card tone="warning">
          <p className="text-sm text-ink">{t("setup.error.title")}</p>
          <p className="mt-1 text-xs text-ink-soft">{state.message}</p>
        </Card>
      </FunnelShell>
    );
  }

  // ── L'ÉTAT COURANT ───────────────────────────────────────────────────────
  // La branche vient des FAITS, jamais d'un état d'écran: quelqu'un qui revient
  // trois jours plus tard doit retrouver la sienne, et un foyer en base est ce
  // qui la porte.
  const branch: FunnelBranch = facts.branch ?? "solo";
  const steps = funnelSteps(branch);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  /**
   * L'ÉTAT SUR LEQUEL LE BOUTON DE FIN SE DÉCIDE.
   *
   * Les faits en base, PLUS le brouillon de l'étape 3 — qui sera écrit à la
   * milliseconde d'avant la génération, dans le même geste. Toutes les autres
   * réponses ont déjà été écrites par leur « Continue »: les prendre du
   * brouillon ferait s'allumer le bouton sur des champs remplis et jamais
   * enregistrés, ce qui est le mensonge que cet écran existe pour éviter.
   */
  const previewState: FunnelState = { ...facts.state, plan };
  const verdict = canGenerate(previewState, branch);
  const missing = verdict.ok ? [] : verdict.missing;

  /**
   * ⟳ 2026-09-10 · LOT 7 — L'ENTONNOIR D'UN MEMBRE SECONDAIRE NE COMPOSE PLUS.
   *
   * Il se terminait par un plan PERSONNEL, composé par la lane individuelle.
   * Cette lane n'existe plus: le moteur unique lui rend 403 `not_owner`, et le
   * bouton de fin l'aurait envoyé au refus APRÈS l'attente — la cicatrice
   * « refus loin du geste = bouton mort », payée trois fois sur cet écran.
   *
   * ⚠️ `facts.isOwner` VAUT `true` SANS FOYER, exprès (voir `FunnelFacts`): on
   * ne peut pas être secondaire de rien. La paire est donc lue telle quelle, et
   * `composeRight` porte la règle — pas un `if` recopié ici.
   */
  const canCompose = mayCompose({
    inHousehold: facts.householdId !== null,
    isOwner: facts.isOwner,
  });

  /**
   * CE QUI MANQUE ENCORE À L'ÉTAPE OÙ ON EST — la même arithmétique, filtrée.
   *
   * Une étape ne se laisse pas quitter tant qu'elle en a: on ne peut pas
   * répondre à une question depuis l'écran d'après, et c'est exactement ce que
   * l'entonnoir demandait pour les bouches jusqu'au 2026-08-13.
   */
  const stepMissing = missesForStep(previewState, branch, step.id);
  /**
   * CE QUI RETIENT L'ÉTAPE 2, PAR PERSONNE.
   *
   * ⚠️ CE N'EST PLUS `stepMissing` FILTRÉ: la liste plate ne portait pas de
   * sujet, donc elle ne pouvait pas dire chez qui. Les deux coexistent — l'une
   * décide, l'autre nomme — et c'est `peopleStepBlockers` qui décide pour
   * l'étape 2 depuis le 2026-08-19.
   */
  const stepBlockers = peopleStepBlockers(previewState, branch);

  /**
   * CE QUI RETIENT SUR LES BOUCHES, DIT SUR LE FORMULAIRE QUI LE LÈVE.
   *
   * Trois phrases, dans l'ordre où elles servent, et la première est celle qui
   * manquait vraiment: quelqu'un qui a TAPÉ un prénom sans appuyer sur
   * « Ajouter » lit sinon qu'il n'a ajouté personne, pendant que ce prénom est
   * à l'écran. Mesuré sur un compte neuf le 2026-08-14.
   *
   * On ne fabrique la phrase QUE si l'étape retient réellement là-dessus:
   * sinon on apprendrait à quelqu'un qu'il existe un mur qu'il n'a pas touché.
   */
  const mouthsHeld = ((): string | null => {
    if (!heldBack || !stepMissing.includes("missing_mouths")) return null;
    const typed = mouth.firstName.trim();
    const short = mouthsStillNeeded(branch, facts.mouths.length);
    const answer = branch === "pair"
      ? t("setup.situate.pair")
      : t("setup.situate.family");
    return [
      typed ? t("setup.mouths.held_typed", { name: typed }) : null,
      short === 1
        ? t("setup.mouths.held_one", { answer })
        : t("setup.mouths.held_many", { n: String(short), answer }),
      t("setup.mouths.held_exit"),
    ].filter(Boolean).join(" ");
  })();

  /**
   * LE BROUILLON DE BOUCHE DU TITULAIRE — DÉRIVÉ, JAMAIS STOCKÉ.
   *
   * ⚠️ IL SE RECALCULE À CHAQUE RENDU À PARTIR DE `self`, et c'est ce qui rend
   * le curseur juste: son plafond est borné par la TAILLE, le POIDS et l'ÂGE
   * saisis à l'étape 2. Une copie figée à la lecture proposerait un rythme
   * calculé sur un corps que la personne vient de corriger.
   *
   * `null` tant que la lecture de la cible n'a pas eu lieu — la carte ne rend
   * alors rien du tout.
   */

  /**
   * CE QUE LA FENÊTRE ÉCRIT DANS LE BROUILLON DU TITULAIRE — ET OÙ ÇA VA.
   *
   * ⚠️ DEUX DESTINATIONS, ET C'EST LA SEULE CHOSE QUI COMPTE ICI. Le poids visé
   * et le rythme sont des FAITS RELUS (`selfTarget`, posé par la lecture); tout
   * le reste est le brouillon de saisie (`self`). Tout ramener dans l'un ou
   * l'autre ferait, dans un sens, une seconde copie du corps qui se périme, et
   * dans l'autre, une cible écrasée à la prochaine relecture.
   */
  // ══════════════════════════════════════════════════════════════════════
  // FF-060 — CE QUE LE CORPS DE CETTE FICHE EXIGE
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ AUCUN CALCUL ICI. `useEatingStructure` APPELLE le serveur, qui appelle
  // le MÊME module pur que le générateur. Le jour où l'écran dériverait son
  // propre compte, l'écran et le plan diraient deux choses différentes — et le
  // désaccord serait invisible, parce que chacun aurait raison chez lui.

  const setSelfMouthDraft: React.Dispatch<
    React.SetStateAction<MouthFormDraft>
  > = (next) => {
    if (selfMouthDraft === null) return;
    const applied = typeof next === "function" ? next(selfMouthDraft) : next;
    setSelfTarget((prev) =>
      prev === null ? prev : {
        targetWeightKg: applied.targetWeightKg,
        paceKgPerWeek: applied.paceKgPerWeek,
      }
    );
    setSelf((prev) =>
      prev === null ? prev : {
        ...prev,
        allergies: [...applied.allergies],
        allergiesNone: applied.allergiesNone,
        habits: { ...applied.habits },
        light: { ...applied.light },
        // ⟳ 2026-09-23 — NOMMÉ DANS `SELF_SHEET_FIELDS`, et c'est la garde.
        sideCourses: { ...applied.sideCourses },
        dislikes: [...applied.dislikes],
        shaker: applied.shaker,
        rhythm: applied.rhythm,
        // ── ⛔ LE RÉGIME MANQUAIT ICI, ET LE CHAMP NE BOUGEAIT PAS ──────────
        //
        // Signalé le 2026-08-19: « comment elle mange, quand je sélectionne il
        // n'y a rien qui bouge ». Le champ du régime a été ouvert au TITULAIRE
        // le même jour (il était réservé aux bouches sans compte); son
        // remontage, lui, ne l'a pas suivi. Or `selfMouthDraft` est DÉRIVÉ de
        // `self` à chaque rendu: une valeur qui ne remonte pas dans `self` est
        // recalculée à l'ancienne au rendu suivant, donc le `select` revient
        // tout seul sur son option d'avant. Le geste avait l'air refusé alors
        // qu'il n'était même pas enregistré dans le brouillon.
        //
        // ⚠️ ET C'EST BIEN UN DÉFAUT DE REMONTÉE, PAS D'ENREGISTREMENT: la
        // fenêtre n'écrit jamais en base — elle édite le brouillon, et c'est
        // « Continuer » qui écrit (`saveSelf` → `saveOwnDiet`). Un champ qui ne
        // remonte pas ne peut donc pas non plus être enregistré: le défaut se
        // voyait à l'écran et se serait vu en base.
        //
        // ⛔ PAS DE `as` SEC SUR LA VALEUR. `MouthFormDraft.diet` est un
        // `string` (la fenêtre ne connaît pas le vocabulaire fermé), `SelfDraft`
        // porte `DietAnswer | ""`. Un cast direct désarmerait le typecheck sur
        // exactement le jeton qui décide si la ligne part en base — cicatrice
        // `as-cast-on-foreign-type-disarms-typecheck`. On VÉRIFIE, puis on
        // rétrécit.
        diet: (DIET_ANSWERS as readonly string[]).includes(applied.diet)
          ? (applied.diet as DietAnswer)
          : "",
        // ── ⑤ REMONTE, ET SON ÉCRIVAIN L'ATTENDAIT DÉJÀ ────────────────────
        //
        // `saveSelf` pose `draft.appetite` sur la ligne de corps depuis le
        // 2026-08-20 — l'écrivain existait, la REMONTÉE non. Le champ se voyait
        // mort à l'écran, et il l'était aussi en base: un champ qui ne remonte
        // pas ne peut pas non plus être enregistré.
        //
        // ⚠️ AUCUNE TRADUCTION ICI: les deux vocabulaires portent le même jeton
        // d'ignorance (`""`). C'est `saveSelf` qui le retraduit en `null` au
        // bord de la base.
        appetite: applied.appetite,
      }
    );
  };

  const isLast = stepIndex >= steps.length - 1;

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    setFlash(null);
    // L'accusé d'ajout ne survit pas au geste SUIVANT: il dit « ce clic-ci
    // vient de créer quelqu'un », et une phrase qui reste devient un décor.
    // Le « Continuer » de l'étape 2 le repose APRÈS ce nettoyage.
    setMouthAdded(null);
    try {
      await work();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  /**
   * LE MÊME GARDE, MAIS LE REFUS ATTERRIT SUR LE GESTE.
   *
   * ⚠️ CECI EST LE DÉFAUT QUI A BLOQUÉ UN VRAI COMPTE, ET IL ÉTAIT INVISIBLE.
   * `guard` écrit dans `failure`, rendu tout en haut de la page (juste sous le
   * fil de progression). Le bouton « Ajouter » est, lui, au bas du SECOND
   * formulaire de l'étape 2 — plusieurs centaines de pixels plus bas, et hors
   * écran sur un téléphone. Quand l'ajout d'une bouche échoue, l'utilisateur
   * appuie et **rien ne bouge devant lui**: il conclut que c'est fait, appuie
   * sur « Continuer », et l'étape le retient en réclamant la personne qu'il
   * croit avoir inscrite.
   *
   * Mesuré le 2026-08-14 sur un compte neuf: branche « On est deux », zéro
   * bouche en base, l'utilisateur certain d'en avoir ajouté une. Ses mots:
   * « je ne peux pas passer à l'étape 3 ».
   *
   * Un message d'erreur qui n'est pas dans le champ de vision du geste qui l'a
   * provoqué n'est pas un message: c'est une trace. On le pose donc À CÔTÉ DU
   * BOUTON, et le bandeau du haut reste pour tout ce qui n'a pas de place à
   * lui.
   */
  /**
   * LE MÊME GARDE ENCORE, POUR LE DERNIER BOUTON — ET C'EST LA TROISIÈME FOIS.
   *
   * ⚠️ « JE CLIQUE SUR CONSTRUIRE MON PLAN ET RIEN NE SE PASSE », signalé le
   * 2026-08-15. Il se passait quelque chose: `askForDraft` levait (le refus de
   * la fonction edge), `guard` l'écrivait dans `failure`, et `failure` est rendu
   * TOUT EN HAUT de la page — au-dessus du fil de progression. L'étape 4 fait
   * plusieurs écrans de haut: la personne qui appuie sur le bouton de fin ne
   * peut pas voir ce bandeau sans remonter, et rien à l'écran ne lui dit de
   * remonter. Un refus qu'on ne voit pas est un bouton mort.
   *
   * C'est le MÊME défaut que `guardMouth` a fermé pour « Ajouter ». Deux
   * occurrences valaient une règle: un geste qui peut échouer pose son refus
   * À CÔTÉ DE LUI, et le bandeau du haut ne sert qu'à ce qui n'a pas de geste.
   */
  async function guardCompose(work: () => Promise<void>) {
    setBusy(true);
    setComposeBusy(true);
    setComposeFailure(null);
    setFlash(null);
    try {
      await work();
    } catch (error) {
      setComposeFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setComposeBusy(false);
      setProgress(null);
    }
  }

  async function guardMouth(work: () => Promise<void>) {
    setBusy(true);
    setMouthFailure(null);
    setFlash(null);
    setMouthAdded(null);
    try {
      await work();
    } catch (error) {
      setMouthFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  // ── ÉTAPE 1 ──────────────────────────────────────────────────────────────

  /**
   * Le foyer est créé dès l'étape 1, mais sa taille n'est écrite dans
   * `student_goals` qu'après le choix de l'objectif à l'étape 2. Le champ
   * `student_goals.goal` est NOT NULL: essayer d'écrire la taille ici produit
   * exactement le no-op visible dans le signalement d'un compte neuf.
   */
  function chooseSize(mouths: number) {
    // ── « JUSTE MOI » QUAND IL Y A DÉJÀ DU MONDE À TABLE ────────────────
    //
    // ⚠️ LA CONDITION A CHANGÉ LE 2026-09-01, ET C'EST LE POINT DU LOT. Elle
    // lisait `facts.householdId`: un foyer, quel qu'il soit, armait la porte.
    // Un solo A MAINTENANT UN FOYER — d'une seule bouche, pour que sa ligne
    // membre existe et que sa fiche de préférences soit celle de tout le
    // monde. Ce qui arme la porte est donc la présence d'AUTRES bouches, pas
    // celle d'un foyer: sans ça, un solo qui reclique « juste moi » se verrait
    // proposer de défaire ce qu'il vient de choisir.
    if (mouths === 1 && facts!.mouths.length > 0) {
      setConfirmDissolve(true);
      return;
    }
    void guard(async () => {
      // Relire d'abord rend le geste récupérable après une tentative qui a
      // créé le foyer puis échoué sur l'ancienne écriture de taille.
      let current = await readFunnelFacts(userId);
      // ⛔ LE FOYER SE CRÉE AUSSI À UNE BOUCHE. C'est ce qui donne au solo sa
      // ligne membre — donc un endroit où ranger ses dégoûts
      // (`household_food_restrictions`) et ses habitudes
      // (`household_member_habits`), tous deux clés sur `member_id`. Sans elle,
      // la fiche lui cachait deux sections, et le produit n'était pas le même
      // selon le chemin d'entrée.
      //
      // ⚠️ ET ÇA NE CHANGE RIEN À SA GÉNÉRATION — LA RAISON A CHANGÉ LE
      // 2026-09-10. Elle disait que `chooseGenerator` routait sur le nombre de
      // bouches, jamais sur la présence d'un foyer. Il n'y a plus de routage:
      // le moteur est unique, et un foyer d'une bouche est très exactement ce
      // que le chantier appelle « une personne seule ». Créer sa ligne membre
      // reste ce qui lui donne ses dégoûts et ses habitudes; ça ne l'oblige à
      // aucun nom de foyer, aucune invitation, aucune facturation collective.
      if (!current.householdId) {
        const result = await createHousehold(DEFAULT_HOUSEHOLD_NAME);
        if (!result.ok && result.reason !== "already_in_household") {
          throw new Error(result.reason);
        }
        current = await readFunnelFacts(userId);
      }
      if (current.state.self.goal !== null) {
        // Une ligne existe déjà: la taille peut être persistée immédiatement.
        await declareHouseholdSize(mouths);
        setPendingHouseholdSize(null);
        await load(false);
      } else {
        // Compte neuf: l'étape 2 créera d'abord la ligne avec le vrai objectif.
        setPendingHouseholdSize(mouths);
        await load(false, mouths);
      }
      // La branche décidée ici est LOCALE jusqu'à la relecture: on avance
      // d'une étape, et la relecture a déjà remis les faits d'accord.
      setStepIndex(1);
    });
  }

  /**
   * ÉCRIRE LE NOMBRE DE BOUCHES DÉCLARÉ.
   *
   * ⚠️ `current` EST RELU JUSTE AVANT, jamais pris dans `facts`. Deux écritures
   * sur `practical_constraints` avec un `current` périmé s'effacent l'une
   * l'autre — la cicatrice `stale-current-erases-the-previous-write`, mesurée
   * sur cette page même, et dont le symptôme est « le bouton ne fait rien ».
   */
  /**
   * GARANTIR QUE LE TITULAIRE A UNE LIGNE MEMBRE — et rendre les faits FRAIS.
   *
   * ⚠️ IDEMPOTENT, ET IL DOIT LE RESTER: il est appelé à chaque « Continuer »
   * de l'étape 2. Un foyer déjà là ⇒ on relit et on rend, rien d'autre.
   *
   * ⛔ ET IL FIGE LA BRANCHE **AVANT** DE CRÉER LE FOYER. Mesuré au navigateur
   * le 2026-09-01, sur un solo déjà inscrit: sans cette ligne, créer sa ligne
   * membre le faisait passer COUPLE au rechargement suivant. Le repli de
   * `funnelMouths` rend `max(2, membres)` quand rien n'est déclaré — il vaut
   * `2` sur un foyer d'une bouche, et c'est exactement ce qu'il doit valoir
   * pour une famille dont les bouches ne sont pas saisies. Le foyer que l'on
   * crée ici, lui, n'est pas ça: c'est le siège d'un solo.
   *
   * ⚠️ ON ÉCRIT DONC CE QUE L'ENTONNOIR MONTRAIT DÉJÀ, jamais un défaut. `1`
   * pour un solo, `2` pour un couple à mi-chemin: la branche ne bouge pas d'un
   * cran, elle cesse seulement d'être devinée.
   */
  async function ensureOwnMemberLine(): Promise<FunnelFacts> {
    if (facts!.householdId && facts!.ownMemberId) return facts!;
    // ⛔ LU AVANT, PAS APRÈS. Après la création, `readFunnelFacts` rendrait
    // déjà la valeur du repli — c'est-à-dire celle qu'on cherche à ne pas
    // laisser s'installer.
    const before = facts!.state.mouths ?? 1;
    const created = await createHousehold(DEFAULT_HOUSEHOLD_NAME);
    if (!created.ok) throw new Error(created.reason);
    await declareHouseholdSize(before);
    return await readFunnelFacts(userId);
  }

  async function declareHouseholdSize(mouths: number): Promise<void> {
    const fresh = await readFunnelFacts(userId);
    await mergePracticalConstraints({
      userId,
      current: fresh.practicalConstraints,
      patch: { household_size: mouths },
      source: "setup.chooseSize",
    });
  }

  /**
   * CE QUE LE TITULAIRE DIT DE SA PROPRE SEMAINE — « Choisir les repas ».
   *
   * ⛔ LA MÊME COLONNE QUE `/app/plan`, JAMAIS UNE SECONDE.
   * `StudentWeekPlanPage#saveAwayDays` écrit exactement ceci
   * (`practical_constraints.away_days`, par `mergePracticalConstraints`), et le
   * générateur la relit là. Passer par `setMemberAway` aurait rangé la réponse
   * dans la colonne du FOYER — celle que le maître remplit POUR quelqu'un — et
   * un compte solo n'y a même pas de ligne.
   *
   * ⚠️ ET ELLE ATTEINT LES DEUX GÉNÉRATEURS, ce qui n'est pas évident et se
   * vérifie en SQL. `generate-meal-v1` la lit directement. Côté foyer,
   * `generate-household-meal-v1` ne lit PLUS `practical_constraints` (il a
   * cessé le jour de D14) — mais le roster la lui rend quand même: la vue
   * concatène `keel_away_tagged(sg.practical_constraints -> 'away_days',
   * 'self') || keel_away_tagged(hm.away_days, 'household')` sur la ligne
   * membre du titulaire (`20260812130000_household_presence.sql`, l. 209).
   * Sa déclaration compte donc pour LUI SEUL, jamais pour la table — ce que
   * FF-002 §9 exige.
   *
   * ⚠️ LA PHOTO EST PRISE ICI, JUSTE AVANT. `mergePracticalConstraints` réécrit
   * l'objet EN ENTIER: partir de `facts.practicalConstraints`, lu au montage de
   * la page, effacerait tout ce qu'une autre carte de l'entonnoir y a écrit
   * depuis — le régime, l'équipement, le rythme. Cicatrice « `current` périmé
   * efface l'écriture d'avant », payée deux fois sur cette colonne.
   */
  async function saveSelfAway(next: AwayMark[]): Promise<void> {
    const fresh = await readFunnelFacts(userId);
    await mergePracticalConstraints({
      userId,
      current: fresh.practicalConstraints,
      patch: { away_days: next },
      source: "setup.mealPicker",
    });
    await load(false);
  }

  /**
   * DÉFAIRE LE FOYER, ET REPARTIR EN SOLO.
   *
   * ⚠️ LA GARDE EST EN BASE, PAS ICI. `keel_household_dissolve` refuse
   * `not_alone` tant qu'il reste une bouche et `household_has_plans` dès qu'un
   * repas a été composé — une limite d'UI n'est pas une limite. L'écran ne
   * décide que de ce qu'il PROPOSE, et il traduit les deux refus qu'on peut
   * réellement atteindre depuis ce bouton.
   */
  function dissolveTheHousehold() {
    void guard(async () => {
      const result = await dissolveHousehold();
      if (!result.ok) {
        throw new Error(
          result.reason === "not_alone"
            ? t("setup.situate.dissolve_not_alone")
            : result.reason === "household_has_plans"
            ? t("setup.situate.dissolve_has_plans")
            : result.reason,
        );
      }
      setConfirmDissolve(false);
      // ── ET ON EN RECRÉE UN, D'UNE SEULE BOUCHE (2026-09-01) ─────────────
      //
      // ⛔ ÇA N'ANNULE PAS LA DISSOLUTION, ET L'ORDRE EST LA GARDE. Ce qui
      // vient d'être défait est un foyer AVEC DES PLANS et AVEC D'AUTRES
      // BOUCHES — `keel_household_dissolve` refuse `not_alone` et
      // `household_has_plans`, donc les deux protections ont bien tourné.
      // Ce qu'on repose est un foyer d'une bouche: LUI, et rien d'autre.
      //
      // ⚠️ IL FAUT LE REPOSER, sinon un solo se retrouve sans ligne membre —
      // donc sans endroit où ranger ses dégoûts ni ses habitudes, donc avec
      // une fiche de préférences amputée de deux sections. C'est le défaut
      // exact que ce lot ferme; le laisser ici en rouvrirait la moitié.
      const rebuilt = await createHousehold(DEFAULT_HOUSEHOLD_NAME);
      if (!rebuilt.ok) throw new Error(rebuilt.reason);
      await declareHouseholdSize(1);
      // LE FOYER D'AVANT N'EXISTE PLUS, DONC RIEN DE CE QUI LE VISAIT N'A D'OBJET.
      //
      // ⚠️ ET VIDER LE BROUILLON N'EST PAS DU MÉNAGE. En solo, `MouthsStep`
      // n'est pas rendu — mais le « Continuer » de l'étape 2, lui, absorbe
      // toujours le brouillon. Un prénom resté là partirait sur
      // `addHouseholdMember`, que la base refuse par `no_household`, et le
      // refus atterrirait sur `mouthFailure` — c'est-à-dire sur une carte que
      // cette branche ne rend pas. Un « Continuer » qui ne passe pas, sans un
      // mot pour dire pourquoi: exactement le mur qu'on vient de démonter.
      setMouth(emptyMouthDraft());
      setMemberPrefs(null);
      setMouthFailure(null);
      setConfirmRemove(null);
      setHeldBack(false);
      await load(false);
      setStepIndex(1);
    });
  }

  // ── ÉTAPE 2 ──────────────────────────────────────────────────────────────

  function saveSelf(): Promise<void> {
    return (async () => {
      const draft = self!;
      const height = Number(draft.heightCm);
      const weight = Number(draft.weightKg);
      // L'ORDRE COMPTE. Le profil et la date d'abord (ils ne dépendent de
      // rien), l'objectif ensuite — il CRÉE la ligne `student_goals` —, et les
      // allergies en dernier, parce que leur accusé (« rien à déclarer ») se
      // fusionne dans `practical_constraints`, donc a besoin de cette ligne.
      if (draft.gender && Number.isFinite(height)) {
        await saveOwnProfile({
          userId,
          firstName: draft.firstName,
          heightCm: height,
          gender: draft.gender,
          dayActivity: draft.dayActivity,
          sportFrequency: draft.sportFrequency,
          // LA LANE INDIVIDUELLE LIT `profiles.activity_level`
          // (`student_body_io.ts#loadStudentBody`). Celle du foyer lit la ligne
          // de corps, écrite quelques lignes plus bas — d'où les DEUX
          // écritures: deux moteurs, deux tables, un seul cran.
          activityLevel: draft.activityLevel,
        });
      }
      // ── ET MON PRÉNOM SUR MA LIGNE DE FOYER ────────────────────────────
      //
      // ⚠️ `profiles.full_name` NE NOMME AUCUNE PORTION. Le roster
      // (`keel_household_roster_for`) rend `household_members.first_name` et
      // rien d'autre; c'est ce prénom-là que le brief de portions, la liste
      // d'ids et les règles de maison citent au modèle. `keel_household_create`
      // n'y recopie le premier mot de `profiles.full_name` QU'UNE FOIS, et son
      // commentaire le dit: « s'il renomme son profil plus tard, son prénom au
      // foyer ne suit pas; il le change au foyer ».
      //
      // Sans cette écriture, le champ « Prénom — comment le plan nomme ta part »
      // de cette étape-ci écrit dans `profiles` et le plan continue de nommer
      // le maître « Student » (ou « Me »). Mesuré le 2026-08-18 sur un prompt
      // réel: « Sacha » tapé à l'écran, « Student » servi au modèle sur les
      // trois blocs qui le nomment.
      //
      // Muet quand il n'y a pas de foyer: la lane individuelle ne lit aucun
      // prénom (voir la garde `branch !== "solo"` sur le champ lui-même).
      if (facts!.householdId && facts!.ownMemberId && draft.firstName.trim()) {
        const named = await setMemberName(
          facts!.ownMemberId,
          draft.firstName.trim(),
        );
        // `reason` est TOUJOURS une chaîne (`asResult` la normalise), donc
        // `||` et pas `??`: un refus sans motif rendrait un message vide.
        if (!named.ok) throw new Error(named.reason || "member_name_refused");
      }
      // MON POIDS VA DANS LA SÉRIE — c'est elle qui arme `restriction_guard`.
      if (Number.isFinite(weight) && weight > 0) {
        await saveOwnWeight({ userId, weightKg: weight, localDate: browserLocalDate() });
      }
      // ── ET MA LIGNE DE CORPS, S'IL Y A UN FOYER ────────────────────────
      // `profiles` ne suffit pas: `keel_household_bodies_for` ne lit QUE
      // `household_member_bodies`, et le moteur saute une bouche sans corps.
      // Le maître est une bouche comme les autres — son profil ne la remplace
      // pas.
      if (
        facts!.householdId && facts!.ownMemberId && facts!.isOwner &&
        draft.gender && Number.isFinite(height) && Number.isFinite(weight)
      ) {
        await saveMouthBody({
          memberId: facts!.ownMemberId,
          heightCm: height,
          weightKg: weight,
          gender: draft.gender,
          // ② LES DEUX MOTEURS LISENT DEUX TABLES: `profiles` pour la lane
          // individuelle (juste au-dessus), la ligne de corps pour le foyer.
          // Les deux écritures partent du MÊME brouillon, dans le même geste.
          dayActivity: draft.dayActivity,
          sportFrequency: draft.sportFrequency,
          // ⚠️ ET PAS SEULEMENT DANS `profiles`. `generate-household-meal-v1`
          // ne charge PAS le profil des membres — il lit des corps par
          // `member_id` (`keel_household_bodies_for`), y compris le mien. Sans
          // cette seconde écriture, un maître qui a coché « je m'entraîne
          // quatre fois par semaine » compose son foyer sur l'hypothèse 1,5,
          // et rien ne le dit.
          activityLevel: draft.activityLevel,
          // ⑤ — SAISI DANS LA FENÊTRE DES PRÉFÉRENCES, ÉCRIT ICI. La fenêtre
          // n'a pas d'écrivain à elle: elle édite CE brouillon, et c'est ce
          // geste-ci qui le pose. Un second écrivain dans la fenêtre ferait
          // deux enregistrements sur une même porte, et c'est celui qu'on
          // regarde le moins qui écraserait l'autre.
          // `""` (personne n'a répondu) redevient `null`: x1,00, un neutre vrai.
          appetite: draft.appetite || null,
        });
      }
      if (draft.birthDate) {
        const answer = birthDateAnswer(draft.birthDate, browserLocalDate());
        if (!answer) throw new Error(t("setup.people.birth_date_error"));
        const written = await setOwnBirthDate(userId, answer.date);
        if (!written.ok) throw new Error(t("setup.people.birth_date_error"));
      }
      if (draft.goal) {
        // ⚠️ PLIÉE À L'ÂGE (chantier P3, 2026-09-03). `student_goals` ne porte
        // pas la garde S4 — elle vit sur les quatre portes de
        // `household_members` —, donc ce pli est la seule chose qui tienne
        // « un mineur ne porte que "Manger normalement" » sur la ligne du
        // titulaire. La même règle, au même endroit que pour une bouche.
        await saveOwnGoal(
          userId,
          goalForAge(
            draft.goal,
            ageStateOfTypedDate(draft.birthDate, "unknown", browserLocalDate()),
          ),
        );
        // L'objectif vient de créer la ligne sur un compte neuf. La taille peut
        // enfin rejoindre `practical_constraints`, dans l'ordre imposé par le
        // schéma. Le second terme récupère aussi les comptes restés entre les
        // deux étapes après l'ancienne version défectueuse.
        // ⛔ ON N'ÉCRIT QUE CE QUI A ÉTÉ RÉPONDU — ⟳ 2026-09-11.
        //
        // Le second terme lisait `facts.state.mouths`, qui n'est PAS une
        // réponse: sur un foyer d'une bouche sans taille déclarée, c'est le
        // repli `max(2, membres)` de `funnelMouths`, donc 2. Il gravait donc
        // « à deux » au nom de quelqu'un qui avait cliqué « juste moi » et dont
        // la réponse s'était perdue à un rechargement — et une fois gravée,
        // elle ne se devinait plus: elle se lisait. Le compte restait bloqué
        // sur « ajoutez les autres personnes qui mangent ici », et recliquer
        // « juste moi » lui proposait de dissoudre son foyer.
        //
        // Sans réponse en mémoire, on n'écrit rien: la reprise ci-dessus
        // ramène à l'étape 1, qui est le seul endroit où cette question se
        // pose. Un clic de plus vaut mieux qu'un fait faux indémentable.
        const sizeToPersist = pendingHouseholdSize;
        if (sizeToPersist !== null) {
          await declareHouseholdSize(sizeToPersist);
          setPendingHouseholdSize(null);
        }
      }
      // ── SA CIBLE ET SON RYTHME, ÉCRITS PAR LE MÊME GESTE QUE SA DIRECTION ──
      //
      // ⚠️ APRÈS `saveOwnGoal`, ET C'EST UN ORDRE D'ÉCRITURE, PAS UNE
      // PRÉFÉRENCE: la ligne `student_goals` n'existe qu'une fois la direction
      // posée, et `student_goals_target_pace_direction_check` refuse une cible
      // sans direction. Écrire avant, c'est `no_goal_row` sur le compte le plus
      // neuf — celui pour qui ce champ compte le plus.
      //
      // ⚠️ ET C'EST ICI, PAS À L'ÉTAPE DU PLANNING. Les deux champs y ont vécu
      // du 2026-08-18 au même jour: leur écriture était sur le « Continuer » de
      // l'étape 3, à deux écrans du choix qui les débloque. Un champ et son
      // écrivain se tiennent sur le même geste.
      //
      // `targetPayloadOf` EST LA SEULE DÉCISION, miroir exact du CHECK: rien ne
      // part sur une direction qui ne bouge pas, rien ne part à moitié.
      //
      // ⚠️ `no_goal_row` NE REMONTE PAS QUAND IL N'Y A RIEN À ÉCRIRE: effacer
      // une cible qui n'a jamais existé est un succès, et le refuser ferait
      // échouer « Continuer » exactement une fois, sur le premier passage.
      if (selfMouthDraft !== null) {
        // Pliée à l'âge, comme la direction juste au-dessus: une cible ne part
        // jamais sur une direction que le pli vient de replier.
        const payload = targetPayloadOf(
          foldMinorGoal(selfMouthDraft, browserLocalDate()).draft,
          browserLocalDate(),
        );
        const written = await setOwnTarget(
          userId,
          payload.targetWeightKg,
          payload.paceKgPerWeek,
        );
        if (
          !written.ok &&
          !(written.reason === "no_goal_row" && payload.targetWeightKg === null)
        ) {
          throw new Error(written.reason);
        }
      }
      // LE RÉGIME AVANT LES ALLERGIES, et APRÈS l'objectif: son accusé se
      // fusionne dans `practical_constraints`, donc il a besoin de la ligne
      // `student_goals` que `saveOwnGoal` vient de créer.
      if (draft.goal && draft.diet) {
        const fresh = await readFunnelFacts(userId);
        await saveOwnDiet({ userId, diet: draft.diet, current: fresh.practicalConstraints });
      }
      if (draft.goal && (draft.allergiesNone || draft.allergies.length > 0)) {
        const fresh = await readFunnelFacts(userId);
        await saveOwnAllergies({
          userId,
          labels: draft.allergies,
          current: fresh.practicalConstraints,
        });
      }
      // ── CE QUI A ÉTÉ SAISI DERRIÈRE « RENSEIGNER SES PRÉFÉRENCES » ────────
      //
      // ⛔ LA LIGNE MEMBRE EST GARANTIE ICI, PAS SUPPOSÉE (2026-09-01).
      //
      // La fenêtre ne cache plus ni les dégoûts ni les moments à personne —
      // c'est le lot. Mais une population n'était pas couverte par le seul
      // `chooseSize`: LE SOLO DÉJÀ INSCRIT. Sa branche se dérive de sa ligne
      // `student_goals`, donc l'étape 1 ne se rejoue pas et il ne repasse
      // jamais par le clic qui crée le foyer. Sans cet appel, il voyait deux
      // sections nouvelles… qui n'écrivaient nulle part — « un champ qui
      // promet », très exactement ce que l'ancienne garde évitait.
      //
      // ⚠️ ET C'EST UNE ÉCRITURE SUR LE CHEMIN D'ENREGISTREMENT, jamais à la
      // lecture. Créer un foyer en ouvrant un écran poserait un fait que
      // personne n'a demandé, sur toute personne qui passe.
      const seat = await ensureOwnMemberLine();
      if (seat.householdId && seat.ownMemberId && seat.isOwner) {
        const memberId = seat.ownMemberId;
        // LA LISTE COMPLÈTE REMPLACE — d'où la semence de `load`. Et la ligne
        // libre est REPASSÉE telle quelle: la porte écrit les deux d'un coup,
        // et envoyer `null` effacerait la note posée à l'étape 3.
        // ⛔ `habitEntriesToWrite` ET PAS UN `map` À LA MAIN. Il existait ici
        // DEUX sérialiseurs recopiés, et ils jetaient tous deux l'entrée sans
        // prose — c'est-à-dire exactement celle qui porte la bulle. Un
        // troisième vit dans `mouthToPersist`; les trois appellent désormais
        // la même fonction, et un test refuse qu'un quatrième réapparaisse.
        // ⟳ 2026-09-23 — ET SES À-CÔTÉS, DANS LA MÊME LISTE: omis, la porte
        // qui remplace les effacerait à chaque « Continuer ».
        await setMemberHabits(
          memberId,
          habitEntriesToWrite({
            habits: draft.habits,
            light: draft.light,
            sideCourses: draft.sideCourses,
            occasions: EATING_OCCASIONS,
          }),
          habits?.get(memberId)?.note ?? null,
        );
        // ⚠️ LE DELTA, PAS LA LISTE. La porte n'a que `add` — « Continuer »
        // appuyé deux fois écrirait deux fois le même dégoût.
        // ⟳ LOT C — UNE PRÉFÉRENCE, PLUS UNE RÈGLE DE MAISON, et une seule
        // écriture au lieu d'une par mot: la porte fait maintenant une
        // lecture-modification-écriture du magasin avec `expected`, où N
        // appels se disputeraient l'attente les uns des autres.
        const already = writtenDislikes.current.get(memberId) ?? new Set();
        const fresh = draft.dislikes.filter((label) => !already.has(label));
        if (fresh.length > 0) {
          const res = await writtenDislikeWriter(userId, browserLocalDate())(
            memberId,
            fresh,
          );
          if (!res.ok) throw new Error(res.reason);
          for (const label of fresh) already.add(label);
        }
        writtenDislikes.current.set(memberId, already);
      }
      // ── SES MOMENTS À LUI, ET CEUX DE LA MAISON, DANS LE MÊME GESTE ──────
      //
      // ⚠️ ARBITRAGE DU 2026-08-19: LA FICHE DU TITULAIRE PORTE LA RÉFÉRENCE DE
      // LA MAISON. La question a quitté l'étape 3, où elle était posée UNE fois
      // pour le foyer; posée par personne, il fallait décider qui porte le
      // repli — celui sur lequel toute bouche muette est servie. C'est lui: il
      // est la première bouche, et c'est déjà sa ligne `practical_constraints`
      // qui dimensionne la grille du plan.
      //
      // Les deux écritures sont donc voulues, et elles ne font pas doublon:
      //   · `practical_constraints.eating_rhythm` = LA MAISON (le repli des
      //     autres bouches, lu par les deux générateurs);
      //   · sa ligne membre = LUI (ce que la lane foyer sert dans son assiette).
      // N'en écrire qu'une ferait diverger « ce que la maison mange » et « ce
      // que le maître mange », sans que rien ne le dise.
      //
      // ⚠️ LECTURE FRAÎCHE, comme partout où deux écritures visent ce jsonb:
      // `mergePracticalConstraints` le réécrit en entier, et repartir de la
      // photo d'écran effacerait ce que les lignes ci-dessus viennent d'y
      // poser. Cicatrice `stale-current-erases-the-previous-write`.
      if (draft.rhythm !== null && draft.rhythm.length > 0) {
        const beforeRhythm = await readFunnelFacts(userId);
        // ⛔ `saveEatingRhythm`, ET PLUS `savePlanAnswers`. Le second écrivait
        // le rythme depuis `answers`, et le bouton « composer » lui passait
        // l'état React de l'étape 3 — un écran qui ne pose plus la question.
        // Composer remettait donc le moment qu'on venait de retirer. Mesuré en
        // base le 2026-08-19; voir la note sur `saveEatingRhythm`.
        await saveEatingRhythm({
          userId,
          current: beforeRhythm.practicalConstraints,
          rhythm: draft.rhythm,
        });
        // ── ⛔ ET SURTOUT PAS SUR MA LIGNE MEMBRE ────────────────────────
        //
        // Il y avait ici un second appel, `setMemberRhythm(ownMemberId, …)`,
        // ajouté le 2026-08-19 « pour que les deux soient d'accord ». Il
        // ÉCHOUE À TOUS LES COUPS: `keel_household_set_member_rhythm` refuse
        // `has_account` — « la bouche a un compte: son rythme vit dans SON
        // about you » (D1) — et le maître a un compte par définition.
        //
        // Le refus remontait en jaune en haut de l'étape 2 et bloquait
        // « Continuer » sans dire de quel champ il parlait. Signalé le jour
        // même: « ça veut pas continuer et j'ai has_account qui s'affiche ».
        //
        // Il n'y a donc RIEN à réconcilier: pour un compte, le rythme EST
        // `practical_constraints.eating_rhythm`, que la ligne au-dessus vient
        // d'écrire. La ligne membre n'est le domicile du rythme que pour une
        // bouche SANS compte.
      }
      // LE SHAKER, LUI, VIT SUR `user_id` — donc il part même sans foyer.
      // `shakerToWrite` rend `null` tant que la quantité manque: un apport sans
      // ses trois nombres serait contourné au lieu d'être compté.
      const shaker = selfMouthDraft === null
        ? null
        : shakerToWrite(selfMouthDraft);
      if (shaker !== null) {
        // LECTURE FRAÎCHE: `fixed_intakes` vit dans le MÊME jsonb que le régime
        // et les allergies qu'on vient d'écrire. Repartir d'une photo périmée
        // effacerait ce qui vient d'y être posé.
        const fresh = await readFunnelFacts(userId);
        await addShakerToOwnIntakes({
          userId,
          current: fresh.practicalConstraints,
          shaker,
        });
      }
      await load(false);
    })();
  }

  /**
   * AJOUTER UNE BOUCHE — et c'est le geste que tout ce chantier existe pour
   * rendre rapide. En rafale, pas une modale par personne.
   *
   * ⚠️ L'ALLERGIE SEULE. Les trois natures sont distinctes (FF-046): allergie
   * (médicale → union de sécurité, fail-closed), règle de maison (parentale →
   * verrou qui tait le pourquoi), aversion (goût → préférence). L'entonnoir ne
   * collecte que la première, et son écran le dit.
   */
  function addMouth(): Promise<void> {
    return (async () => {
      const draft = mouth;
      const name = draft.firstName.trim();
      if (!name) throw new Error(t("setup.missing.member_first_name"));
      // La branche est aussi un plafond. « On est deux » autorise UNE autre
      // bouche, et le solo aucune; sans cette garde, un double geste ou un
      // brouillon restauré pouvait contourner le bouton caché.
      if (facts!.mouths.length >= maximumOthers(branch)) {
        throw new Error(t("setup.mouths.branch_full"));
      }
      // ── LE DOUBLON EST REFUSÉ AVANT D'ÊTRE ÉCRIT ───────────────────────
      // Mesuré sur un compte réel le 2026-08-13: la même personne saisie trois
      // fois. Le plan nomme les parts par prénom — deux lignes identiques le
      // rendent illisible pour la seule personne qui doit le lire à table.
      if (nameAlreadyEating(name, facts!.mouths)) {
        throw new Error(t("setup.mouths.duplicate", { name }));
      }
      // ── LE MAÎTRE D'ABORD, ET C'EST UNE CONTRAINTE D'ÉCRITURE ──────────
      // L'accusé « on a demandé les allergies de cette bouche » se fusionne
      // dans `student_goals.practical_constraints` DU MAÎTRE, et cette ligne
      // n'existe qu'une fois sa direction posée.
      //
      // ⚠️ CETTE CONTRAINTE A LONGTEMPS ÉTÉ UNE RÈGLE DE MISE EN PAGE: le
      // formulaire d'ajout n'apparaissait qu'une fois l'objectif ENREGISTRÉ.
      // Or le bouton principal de l'étape 2 enregistre ET avance — donc sur le
      // chemin nominal (je remplis, je continue) la question des bouches
      // n'était JAMAIS montrée, et l'étape 3 la réclamait ensuite sans offrir
      // le champ. Mesuré au navigateur le 2026-08-13 sur un compte neuf.
      // L'ordre d'écriture se tient ici, où il est vrai; le formulaire, lui,
      // est visible dès qu'il y a un foyer.
      if (facts!.state.self.goal === null) {
        if (!self!.goal) throw new Error(t("setup.missing.own_goal"));
        await saveSelf();
      }
      let birth: string | null = null;
      if (draft.birthDate) {
        const answer = birthDateAnswer(draft.birthDate, browserLocalDate());
        if (!answer) throw new Error(t("setup.people.birth_date_error"));
        birth = answer.date;
      }
      const result = await addHouseholdMember(
        name,
        birth,
        // ⟳ UN MINEUR NE PORTE PLUS `fat_loss` NI `muscle_gain` DEPUIS LE
        // 2026-08-22 (`20260822041500`, lot S4): cette porte — date et
        // direction dans le MÊME appel, c'est celle que la migration cite —
        // refuse `goal_not_for_minor`. Ce qu'on envoie est ce qui est COCHÉ:
        // les tuiles ne proposent que « Manger normalement » à un mineur, et
        // une direction héritée est pliée par la même règle (`goalForAge`).
        goalForAge(draft.goal, ageStateOfDraft(draft, browserLocalDate())) || null,
      );
      if (!result.ok) throw new Error(result.reason);
      const memberId = String(result.member_id ?? "");
      // ── CE QUI SUIT EST RATTRAPÉ, ET LA LIGNE EST RETIRÉE SI ÇA CASSE ───
      // ⚠️ LE GESTE N'EST PAS ATOMIQUE, ET IL DOIT LE PARAÎTRE. La bouche est
      // créée par une RPC, son corps par une deuxième, son accusé d'allergie
      // par une troisième. Si l'une des deux dernières échoue, la ligne existe
      // DÉJÀ — incomplète, et le brouillon est encore rempli. L'utilisateur
      // voit une erreur, corrige, recommence: une deuxième ligne. C'est
      // exactement ce qu'on a mesuré sur un compte réel le 2026-08-13, à une
      // seconde d'intervalle.
      //
      // On rembobine donc jusqu'à l'état d'AVANT le geste. La suppression ne
      // peut rien détruire d'autre: cette bouche vient d'être créée à la ligne
      // du dessus, elle n'a ni compte, ni historique, ni rien que l'écran n'ait
      // envoyé lui-même.
      try {
        // LE CORPS, DANS LA FOULÉE ET DANS LA MÊME TRANSACTION LOGIQUE. Sans
        // lui, la bouche existe et le moteur l'ignore: elle mange la part de
        // tout le monde. Tout-ou-rien, comme la RPC.
        const mHeight = Number(draft.heightCm);
        const mWeight = Number(draft.weightKg);
        if (draft.gender && Number.isFinite(mHeight) && Number.isFinite(mWeight)) {
          await saveMouthBody({
            memberId,
            heightCm: mHeight,
            weightKg: mWeight,
            gender: draft.gender,
            dayActivity: draft.dayActivity || null,
            sportFrequency: draft.sportFrequency || null,
            appetite: draft.appetite || null,
            // `""` (personne n'a répondu) redevient `null` ici: la RPC lit
            // `null` comme « ne touche pas », et le brouillon parle le
            // vocabulaire de `MouthFormDraft`. Voir `MouthDraft`.
            activityLevel: draft.activityLevel || null,
          });
        }
        // ── SA CIBLE ET SON RYTHME, JUSTE APRÈS SON CORPS ─────────────────
        //
        // ⚠️ APRÈS LE CORPS, ET C'EST L'ORDRE DE `persistMouth`: le plafond du
        // curseur se calcule sur ce corps-là, et la ligne membre doit le porter
        // avant qu'on y pose une cible qui en dépend.
        //
        // ⚠️ AUTRE PORTE QUE CELLE DU TITULAIRE. `setMemberTarget` écrit sur la
        // LIGNE MEMBRE; `setOwnTarget` écrit dans `student_goals`. Les deux
        // colonnes portent le même CHECK « pas de cible sans direction », et
        // `targetPayloadOf` est le miroir des deux: rien ne part sur une
        // direction qui ne bouge pas, rien ne part à moitié.
        //
        // ⛔ ON NE SAUTE PAS L'APPEL QUAND LE PAYLOAD EST VIDE, et ce n'est pas
        // du zèle: c'est ce qui distingue « on ne m'a rien demandé » de « j'ai
        // effacé ». La bouche vient d'être créée, la colonne est propre —
        // `(null, null)` est donc un no-op qui coûte un aller-retour et évite
        // une branche qui, elle, se périmerait le jour où cette fonction
        // servira aussi à REPRENDRE une fiche.
        const targetPayload = targetPayloadOf(
          // Pliée à l'âge: rien ne part sur une direction que le pli replie
          // (`target_not_for_minor` sinon, loin du geste).
          foldMinorGoal(draft, browserLocalDate()).draft,
          browserLocalDate(),
        );
        const aimed = await setMemberTarget(
          memberId,
          targetPayload.targetWeightKg,
          targetPayload.paceKgPerWeek,
        );
        if (!aimed.ok) throw new Error(aimed.reason);
      // ⚠️ L'ACCUSÉ EST ÉCRIT MÊME QUAND LA LISTE EST VIDE. « Aucune » est une
      // réponse: sans elle, la reprise relit « jamais demandé » et l'entonnoir
      // se bloque sur une question à laquelle la ligne n'offre pas de champ.
      //
      // ET IL PART D'UNE LECTURE FRAÎCHE, pas de `facts`: le `saveSelf` juste
      // au-dessus vient peut-être de CRÉER la ligne `student_goals`, et l'état
      // d'écran est encore celui d'avant. Fusionner sur une photo périmée
      // effacerait ce qui a été écrit entre les deux.
        const fresh = await readFunnelFacts(userId);
        await saveMouthAllergies({
          userId,
          memberId,
          labels: [...draft.allergies],
          current: fresh.practicalConstraints,
        });
        // ── ET LE RESTE DE CE QUI A ÉTÉ SAISI DANS LA FENÊTRE ──────────────
        // Même ordre que `persistMouth`: les habitudes, puis les dégoûts, puis
        // le régime. Les trois sont clés sur la ligne qu'on vient de créer.
        //
        // `claimed: false` — une bouche qu'on AJOUTE n'a jamais de compte:
        // `keel_household_add_member` ne pose pas de `user_id`, et la
        // réclamation est un geste ultérieur de la personne elle-même.
        await writeMouthPreferences(memberId, draft, false);
      } catch (error) {
        // On retire la ligne à moitié écrite, PUIS on relaie le motif d'origine.
        // Si le retrait échoue lui aussi, on ne le cache pas: la relecture
        // montrera la ligne incomplète, et le bouton « Retirer » de sa carte est
        // là pour ça.
        await removeHouseholdMember(memberId).catch(() => undefined);
        await load(false);
        throw error;
      }
      setMouth(emptyMouthDraft());
      // ET LA FICHE SE REFERME. Elle restait ouverte et vide sous la personne
      // qu'on venait d'inscrire — c'est-à-dire un second bloc en forme de
      // quelqu'un, juste sous le premier, à la seconde exacte où l'utilisateur
      // cherche à comprendre ce que son clic a produit. Rouvrir coûte un clic;
      // se demander qui est ce bloc-là coûte le signalement du 2026-08-19.
      setMouthFormOpen(false);
      await load(false);
    })();
  }

  /**
   * CE QUE LA FENÊTRE A COLLECTÉ POUR UNE BOUCHE, ÉCRIT EN BASE.
   *
   * ⚠️ UN SEUL ÉCRIVAIN POUR LES DEUX CHEMINS — la bouche qu'on vient de créer
   * et celle qu'on reprend. Deux copies divergeraient au premier correctif, et
   * c'est précisément la plaie que ce lot referme.
   *
   * L'ORDRE EST CELUI DE `persistMouth`: les habitudes (la porte REMPLACE la
   * liste), les dégoûts (elle AJOUTE — d'où le delta), le régime en dernier
   * (`null` n'est pas envoyé: effacer ce que personne n'a posé n'apporte rien,
   * et la base refuse `has_account`).
   */
  async function writeMouthPreferences(
    memberId: string,
    draft: MouthFormDraft,
    /**
     * CETTE BOUCHE A-T-ELLE UN COMPTE ? REQUIS.
     *
     * ⚠️ DEUX PORTES REFUSENT `has_account` — le régime et le rythme —, et la
     * raison est la même (D1): les deux vivent dans le « about you » de qui a
     * un compte. Les appeler quand même fait échouer TOUT l'enregistrement des
     * préférences sur un motif qui ne parle d'aucun champ visible. C'est ce qui
     * vient de bloquer « Continuer » sur la carte du maître.
     */
    claimed: boolean,
  ): Promise<void> {
    // ⛔ LA MÊME FONCTION QUE LES DEUX AUTRES ÉCRIVAINS. Voir `saveSelf`.
    const slots = habitEntriesToWrite({
      habits: draft.habits,
      light: draft.light,
      // ⟳ 2026-09-23 — les à-côtés, pour la même raison que le léger.
      sideCourses: draft.sideCourses,
      occasions: EATING_OCCASIONS,
    });
    const written = await setMemberHabits(
      memberId,
      slots,
      habits?.get(memberId)?.note ?? null,
    );
    if (!written.ok) throw new Error(written.reason);
    // ⟳ LOT C — voir `saveSelf`: un `food.exclude` sur cette bouche, écrit sur
    // la ligne de la personne qui compose, en une seule écriture.
    const already = writtenDislikes.current.get(memberId) ?? new Set<string>();
    const fresh = draft.dislikes.filter((label) => !already.has(label));
    if (fresh.length > 0) {
      const res = await writtenDislikeWriter(userId, browserLocalDate())(
        memberId,
        fresh,
      );
      if (!res.ok) throw new Error(res.reason);
      for (const label of fresh) already.add(label);
    }
    writtenDislikes.current.set(memberId, already);
    // ⛔ LES DEUX PORTES QUI REFUSENT `has_account` SONT SAUTÉES, PAS TENTÉES.
    // Sauter n'est pas perdre: le régime et le rythme d'une bouche qui a un
    // compte se règlent chez elle, et l'écran le DIT déjà (« ça se règle dans
    // son about you »).
    if (draft.diet && !claimed) {
      const res = await setMemberDiet(memberId, draft.diet as DietAnswer);
      if (!res.ok) throw new Error(res.reason);
    }
    // ── SES MOMENTS, DEPUIS LA FICHE (2026-08-19) ────────────────────────────
    //
    // ⚠️ ON ENVOIE `null` QUAND LE BROUILLON EST `null`, ET C'EST UNE ÉCRITURE,
    // pas un saut: `null` veut dire « comme la maison », et c'est la seule
    // façon de REVENIR à ce repli après avoir coché quelque chose. Sauter
    // l'appel rendrait ce retour impossible — le champ deviendrait un
    // aller simple.
    //
    // ⛔ ET JAMAIS UN TABLEAU VIDE: la base refuse `empty_rhythm`, et
    // `MouthPreferencesFields` a déjà retraduit le vide en `null`. La ceinture
    // est ici quand même, parce qu'un second appelant l'oublierait.
    if (!claimed) {
      const rhythm = draft.rhythm && draft.rhythm.length > 0 ? draft.rhythm : null;
      const res = await setMemberRhythm(memberId, rhythm);
      if (!res.ok) throw new Error(res.reason);
    }
    // ── SON SHAKER, SUR SA LIGNE (2026-09-01) ────────────────────────────────
    //
    // ⛔ C'EST L'ÉCRIVAIN QUI MANQUAIT, ET SANS LUI LE CHAMP EST DÉCORATIF. La
    // fiche d'ajout COLLECTE désormais la déclaration (`ShakerPort` vaut
    // `with_the_card` là-bas, parce que la ligne membre n'existe pas encore);
    // si personne ne l'écrit ici, on aura rendu visible un champ qu'on jette —
    // ce qui est strictement pire que l'avoir caché.
    //
    // ⚠️ `claimed` LE SAUTE, MÊME RAISON QUE LE RÉGIME ET LE RYTHME JUSTE
    // AU-DESSUS. Le lecteur du moteur choisit sa source par `userId`: pour une
    // bouche AVEC compte il lit `student_goals`, jamais sa ligne membre. Écrire
    // ici la poserait dans une colonne que rien ne relit.
    //
    // ⚠️ `shakerCanBeSaved` EST LA MÊME GARDE QUE LE BOUTON — un nom et au
    // moins une des trois mesures. Deux seuils pour la même déclaration
    // feraient qu'un shaker refusé par le bouton passe par « Ajouter ».
    //
    // ⚠️ LECTURE FRAÎCHE: la porte REMPLACE le tableau entier, et cette
    // fonction sert AUSSI à reprendre une fiche — écrire sans relire y
    // effacerait un second apport.
    if (!claimed && draft.shaker !== null && shakerCanBeSaved(draft.shaker)) {
      const current = await loadMemberFixedIntakes(memberId);
      const res = await addShakerToMemberIntakes({
        memberId,
        current,
        shaker: shakerPartialToWrite(draft.shaker),
      });
      if (!res.ok) throw new Error(res.reason);
    }
  }

  /**
   * LES PRÉFÉRENCES D'UNE BOUCHE DÉJÀ INSCRITE — le bouton de SA ligne.
   *
   * ⚠️ LES ALLERGIES PASSENT PAR LEUR PORTE À ELLES (`saveMouthAllergies`), et
   * pas par `writeMouthPreferences`: leur accusé se fusionne dans la ligne
   * `student_goals` DU MAÎTRE, donc l'écriture a besoin d'une lecture fraîche
   * de sa colonne — pas de la photo d'écran, qui a pu vieillir de plusieurs
   * gestes.
   */
  function saveMouthPreferences(
    target: FunnelMouth,
    draft: MouthFormDraft,
  ): Promise<void> {
    return (async () => {
      const memberId = target.memberId;
      // ── ⛔ LE BROUILLON EST PASSÉ, PLUS RELU DEPUIS L'ÉTAT ────────────────
      //
      // Cette fonction commençait par:
      //     if (!memberId || memberPrefs?.memberId !== memberId) return;
      //     const draft = memberPrefs.draft;
      //
      // Deux `return` silencieux sur un écrivain, et c'est ce qui a coûté une
      // matinée le 2026-08-19: les préférences du TITULAIRE partaient, celles
      // d'une bouche non — sans un mot, sans un refus, sans rien à l'écran.
      // Un écrivain qui ne fait rien est indiscernable d'un écrivain qui a
      // marché, et c'est le mode d'échec n°1 de ce dépôt.
      //
      // L'appelant SAIT quel brouillon il ferme: il le passe. Il ne reste
      // qu'une garde, sur le seul cas qui n'a rien à écrire — une bouche sans
      // ligne —, et elle LÈVE au lieu de se taire.
      if (!memberId) throw new Error("no_member_id");
      if (draft.allergiesNone || draft.allergies.length > 0) {
        const fresh = await readFunnelFacts(userId);
        await saveMouthAllergies({
          userId,
          memberId,
          labels: [...draft.allergies],
          current: fresh.practicalConstraints,
        });
      }
      await writeMouthPreferences(memberId, draft, target.claimed);
      // ── ① ET ⑤ — LA FENÊTRE LES DEMANDE, DONC ELLE LES ÉCRIT ────────────
      //
      // ⛔ IL N'Y AVAIT AUCUN ÉCRIVAIN POUR CES QUATRE CHAMPS SUR UNE BOUCHE.
      // L'appétit se saisissait dans cette fenêtre depuis le 2026-08-20 et
      // `writeMouthPreferences` ne le connaît pas (il ne touche qu'aux quatre
      // portes clées sur `member_id`); les deux écrivains de la CARTE, eux,
      // relaient ①/⑤ depuis la base au motif que « cette carte ne les demande
      // PAS: ils vivent dans la fenêtre des préférences ». Personne ne les
      // écrivait donc — saisis à l'écran, jetés avant la base, sans un refus.
      //
      // ⚠️ ILS VOYAGENT PAR LA PORTE DU CORPS, parce que c'est là qu'ils
      // vivent (`keel_household_member_bodies`), et elle est TOUT-OU-RIEN: on
      // relaie taille, poids, sexe et les deux axes tels que la base les
      // porte, et on ne pose QUE ce que la fenêtre vient de collecter.
      //
      // ⛔ ET ON NE TENTE RIEN SANS CORPS COMPLET: la RPC refuserait la ligne
      // entière, donc les habitudes et le régime qu'on vient d'écrire
      // partiraient avec un message qui ne parle d'aucun champ visible. Une
      // bouche sans corps n'a de toute façon aucun effet sur la composition
      // (`mouthTargetKcal` rend `no_body`), et sa carte réclame déjà les trois
      // champs juste à côté du bouton qui ouvre cette fenêtre.
      if (
        target.gender !== null && target.heightCm !== null &&
        target.weightKg !== null
      ) {
        await saveMouthBody({
          memberId,
          heightCm: target.heightCm,
          weightKg: target.weightKg,
          gender: target.gender,
          activityLevel: target.activityLevel,
          dayActivity: target.dayActivity,
          sportFrequency: target.sportFrequency,
          // `""` (personne n'a répondu) redevient `null`: ×1,00, un neutre vrai.
          appetite: draft.appetite || null,
        });
      }
      setMemberPrefs(null);
      setPrefsFor(null);
      await load(false);
      // ── UN ACCUSÉ, PARCE QUE L'ÉCRIT EST INVISIBLE ─────────────────────
      // Cette écriture part à la FERMETURE de la fenêtre: il n'y a pas de
      // bouton à regarder devenir gris, et le récapitulatif de la carte ne
      // change que si la personne a rempli un bloc que cet écran relit. Sans
      // un mot, « enregistré » et « perdu » se ressemblent — c'est très
      // exactement ce qu'on vient de passer une matinée à démêler.
      setFlash(t("household.mouth.preferences_saved", {
        name: target.firstName.trim() || t("household.mouth.who_fallback"),
      }));
    })();
  }

  /**
   * RETIRER UNE BOUCHE — le contrôle que `setup.mouths.remove` attendait.
   *
   * La phrase existait dans le catalogue depuis la livraison de l'étape 2b, et
   * aucun bouton ne l'affichait: une fonctionnalité qu'on croit livrée parce
   * qu'on en a écrit les mots. Ce qui l'a rendue urgente est un compte réel où
   * la même personne s'était inscrite trois fois, sans aucun moyen d'en retirer
   * deux — l'entonnoir est un couloir, donc `/app/household` n'était pas
   * atteignable pour réparer.
   */
  function removeMouth(target: FunnelMouth): Promise<void> {
    return (async () => {
      const result = await removeHouseholdMember(target.memberId!);
      if (!result.ok) throw new Error(result.reason);
      setConfirmRemove(null);
      await load(false);
    })();
  }

  /**
   * LES MOMENTS D'UNE BOUCHE — et `null` quand on décoche tout.
   *
   * ⚠️ ON N'ENVOIE JAMAIS UN TABLEAU VIDE. La base le refuse
   * (`empty_rhythm`), et elle a raison: « elle ne mange jamais » n'est pas une
   * réponse. Décocher le dernier moment veut dire « finalement, comme la
   * maison » — c'est `null`, et c'est ce que l'écran envoie.
   */
  /**
   * LE SHAKER, ENREGISTRÉ TOUT DE SUITE — LE SEUL ÉCRIVAIN DE LA FENÊTRE.
   *
   * ⚠️ IL S'ÉCRIT DÈS QU'IL Y A UN NOM ET **UNE** DES TROIS MESURES
   * (`shakerCanBeSaved`), pas trois. Règle demandée le 2026-08-19, et elle est
   * juste: refuser d'enregistrer une saisie à moitié faite la fait perdre au
   * premier rechargement.
   *
   * ⛔ MAIS LE MOTEUR, LUI, EN EXIGE TROIS. `parseFixedIntakes` est
   * tout-ou-rien, et il JETTE une déclaration incomplète — « ferait perdre la
   * protéine en silence ». La ligne part donc en base et n'est PAS comptée tant
   * qu'il manque un nombre. L'écran le dit, mot pour mot, sous le bouton: c'est
   * la seule chose qui empêche « Enregistrer » de mentir.
   *
   * ⚠️ ET IL N'ÉCRIT QUE POUR UN COMPTE. `fixed_intakes` vit dans
   * `student_goals.practical_constraints`, donc sur `user_id`: seule la fiche
   * du TITULAIRE reçoit ce geste (`prefsFor.kind === "self"`), les autres
   * reçoivent `null` et ne rendent pas le bloc.
   */
  function saveOwnShaker(
    shaker: ShakerDraft,
    rhythm: readonly EatingOccasionSlot[] | null,
  ): Promise<void> {
    return (async () => {
      // LECTURE FRAÎCHE: `fixed_intakes` partage le jsonb avec le régime et les
      // allergies. Repartir de la photo d'écran effacerait ce qui vient d'y
      // être posé — cicatrice `stale-current-erases-the-previous-write`.
      const fresh = await readFunnelFacts(userId);
      await addShakerToOwnIntakes({
        userId,
        current: fresh.practicalConstraints,
        // ⚠️ `shakerPartialToWrite` ET PAS `shakerToWrite`: le second rend
        // `null` tant que les trois nombres ne sont pas là, ce qui ferait de ce
        // bouton un geste qui ne fait rien — le mode d'échec n°1 du dépôt.
        shaker: shakerPartialToWrite(shaker),
      });

      // ══════════════════════════════════════════════════════════════════
      // ET LE RYTHME, PARCE QUE CE BOUTON A PU L'ÉTENDRE (2026-09-01)
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ CHOISIR UN MOMENT NON COCHÉ L'AJOUTE. Sans cette écriture-ci, le
      // shaker partait en base et la case ajoutée restait dans le brouillon:
      // un apport posé sur un moment où la personne ne mange pas. Le rythme et
      // le shaker ont deux chemins différents, et c'est CE bouton qui les
      // franchit tous les deux.
      //
      // ⛔ RELECTURE ENTRE LES DEUX, ET ELLE N'EST PAS DU ZÈLE. `fixed_intakes`
      // et `eating_rhythm` vivent dans le MÊME jsonb: réutiliser `fresh`
      // écraserait le shaker qu'on vient d'écrire trois lignes plus haut. La
      // cicatrice que le commentaire du dessus nomme déjà, à quatre lignes
      // d'intervalle.
      //
      // ⛔ CE BOUTON N'ÉCRIT LE RYTHME QUE S'IL A QUELQUE CHOSE À Y AJOUTER,
      // ET JAMAIS POUR LE REMETTRE À ZÉRO. Il n'est pas le propriétaire de ce
      // champ — le bouton de la FICHE l'est. Sa seule raison d'y toucher est
      // qu'un moment choisi ici a PU s'y ajouter, et cet ajout produit
      // toujours une liste non vide.
      //
      // Écrire `[]` sur un rythme vide effacerait `eating_rhythm` chez un
      // titulaire qui ne l'a jamais rempli DANS CETTE FENÊTRE — c'est-à-dire
      // supprimer une déclaration faite ailleurs, pour un geste qui parlait
      // d'un shaker.
      if (rhythm && rhythm.length > 0) {
        const after = await readFunnelFacts(userId);
        await saveEatingRhythm({
          userId,
          current: after.practicalConstraints,
          rhythm,
        });
      }
      await load(false);
    })();
  }

  /**
   * OÙ VA LE SHAKER DU SUJET QUE LA FENÊTRE MONTRE — 2026-09-01.
   *
   * ⚠️ TROIS SUJETS, TROIS RÉPONSES, ET AUCUNE N'EST « cache le bloc » PAR
   * DÉFAUT. C'est la correction du signalement: « dans les préférences
   * alimentaires des personnes ajoutées, il n'y a pas le shaker ». Le bloc
   * entier était retiré dès qu'aucun bouton ne pouvait écrire TOUT DE SUITE —
   * donc la déclaration n'était même pas COLLECTABLE sur la fiche d'ajout.
   *
   * ⛔ ET LE CAS `member` CLAIMÉ EST UN DÉFAUT QUE CE LOT FERME AU PASSAGE.
   * Cet écran branchait `saveMemberShaker` sur TOUTE bouche inscrite, compte
   * ou pas. Or le lecteur du moteur choisit sa source par `userId`
   * (`household_fixed_intakes.ts`): pour une bouche AVEC compte il lit
   * `student_goals`, jamais sa ligne membre. Le shaker d'une personne qui a
   * réclamé sa place partait donc dans une colonne que rien ne relit — écrit,
   * accusé « compté », et invisible à la composition. C'est `none`: son stock
   * à elle se règle chez elle, et cet écran ne peut pas y écrire.
   */
  function shakerPortFor(
    target:
      | { kind: "self" }
      | { kind: "new" }
      | { kind: "member"; memberId: string },
    /**
     * ⚠️ LES BOUCHES SONT PASSÉES, PAS RELUES DEPUIS `facts`. TypeScript ne
     * propage pas le rétrécissement de `facts` (non nul depuis la garde de
     * chargement) à l'intérieur d'une fonction déclarée: un `facts?.` ici
     * rendrait `undefined` — donc « pas de compte » — sur un état que la
     * garde a déjà exclu, et le refus serait décidé par un `?.` au lieu de la
     * base. L'appelant a le narrowing; il donne la liste.
     */
    mouths: readonly FunnelMouth[],
  ): ShakerPort {
    if (target.kind === "self") {
      return {
        kind: "now",
        save: (shaker, rhythm) => guard(() => saveOwnShaker(shaker, rhythm)),
      };
    }
    // LA FICHE D'AJOUT: la ligne membre n'existe qu'après « Ajouter à la
    // table ». On collecte, et `writeMouthPreferences` l'écrit avec le reste.
    if (target.kind === "new") return { kind: "with_the_card" };
    const mouth = mouths.find((m) => m.memberId === target.memberId);
    if (mouth?.claimed) return { kind: "none" };
    return {
      kind: "now",
      save: (shaker, rhythm) =>
        guardMouth(() => saveMemberShaker(target.memberId, shaker, rhythm)),
    };
  }

  /**
   * LE SHAKER D'UNE BOUCHE — SUR SA LIGNE, PAS SUR LA MIENNE.
   *
   * ⚠️ AUTRE PORTE QUE `saveOwnShaker`, et c'est tout l'objet du lot: les
   * apports d'un compte vivent dans `student_goals.practical_constraints`, ceux
   * d'une bouche sur `household_members.fixed_intakes`. Une bouche sans compte
   * n'a pas de ligne `student_goals` — c'est pour ça que le bloc lui était
   * caché, et pourquoi l'afficher SANS cette porte aurait écrit son shaker sur
   * la ligne du maître.
   */
  function saveMemberShaker(
    memberId: string,
    shaker: ShakerDraft,
    rhythm: readonly EatingOccasionSlot[] | null,
  ): Promise<void> {
    return (async () => {
      // LECTURE FRAÎCHE de ce que la ligne porte déjà: la porte REMPLACE le
      // tableau entier, donc écrire sans relire effacerait un second apport.
      const current = await loadMemberFixedIntakes(memberId);
      const res = await addShakerToMemberIntakes({
        memberId,
        current,
        shaker: shakerPartialToWrite(shaker),
      });
      if (!res.ok) throw new Error(res.reason);

      // ── ET LE RYTHME, MÊME RAISON QUE CHEZ LE TITULAIRE ────────────────
      // ⚠️ MAIS SANS LE PIÈGE DU JSONB PARTAGÉ: ici les deux faits vivent dans
      // deux colonnes distinctes (`household_members.fixed_intakes` et la
      // porte `keel_household_set_member_rhythm`). Aucune relecture à
      // intercaler — et l'écrire quand même ferait croire, en relecture, que
      // le danger existe des deux côtés.
      //
      // ⛔ MÊME RETENUE QUE CHEZ LE TITULAIRE: on n'écrit que ce qu'on a PU
      // ajouter. Envoyer `null` ici serait écrire « comme la maison » depuis un
      // bouton qui parlait d'un shaker — une décision qui appartient au bouton
      // de la fiche, pas à celui-ci.
      if (rhythm && rhythm.length > 0) {
        const rhythmRes = await setMemberRhythm(memberId, rhythm);
        if (!rhythmRes.ok) throw new Error(rhythmRes.reason);
      }

      await load(false);
      setFlash(t("household.mouth.shaker_counted"));
    })();
  }

  /**
   * LA CIBLE ET LE RYTHME D'UNE BOUCHE, DEPUIS SA CARTE.
   *
   * ⚠️ MÊME PORTE QU'À L'AJOUT (`keel_household_set_member_target`), et surtout
   * PAS celle du titulaire: la cible d'une bouche vit sur SA LIGNE, celle du
   * maître dans `student_goals`. Les deux colonnes portent le même CHECK « pas
   * de cible sans direction ».
   *
   * ⚠️ `targetPayloadOf` EST LA SEULE DÉCISION, miroir exact du CHECK: rien ne
   * part sur une direction qui ne bouge pas, rien ne part à moitié. Le
   * reconstruire ici en ferait une seconde arithmétique qui divergerait de
   * celle de l'ajout au premier ajustement.
   */
  function saveMouthTarget(
    target: FunnelMouth,
    targetWeightKg: string,
    paceKgPerWeek: string,
  ): Promise<void> {
    return (async () => {
      const payload = targetPayloadOf(
        { ...emptyMouthFormDraft(), goal: target.goal ?? "", targetWeightKg, paceKgPerWeek },
        browserLocalDate(),
      );
      const result = await setMemberTarget(
        target.memberId!,
        payload.targetWeightKg,
        payload.paceKgPerWeek,
      );
      if (!result.ok) throw new Error(result.reason);
      await load(false);
    })();
  }

  /**
   * TOUT CE QUI EST PRÊT SUR CETTE CARTE, PUIS ON REFERME.
   *
   * ── ⚠️ CE QUI N'EST PAS PRÊT EST SAUTÉ, PAS REFUSÉ ───────────────────────
   * Les trois portes n'ont pas les mêmes exigences: le corps est tout-ou-rien
   * pour la base (`body_incomplete`), la cible n'est légale que sous une
   * direction qui bouge (`target_needs_direction_check`), et la date n'existe
   * que si on en a tapé une (le roster ne la rend jamais, donc le champ est
   * toujours vide au départ). Un bouton unique qui LÈVERAIT sur l'une ferait
   * perdre les deux autres — et c'est le bouton qui remplace quatre boutons,
   * donc celui qu'on presse en croyant tout sauver.
   *
   * ⛔ L'ORDRE N'EST PAS LIBRE: le corps AVANT la cible. Le plafond du curseur
   * se calcule sur ce corps-là, et la ligne membre doit le porter avant qu'on y
   * pose une cible qui en dépend. C'est le même ordre que `persistMouth` et que
   * `addMouth`.
   */
  function saveMouthCard(
    target: FunnelMouth,
    fields: {
      birthDate: string;
      heightCm: string;
      weightKg: string;
      gender: MemberGender | "";
      activityLevel: ActivityLevel | null;
      dayActivity: DayActivityLevel | null;
      sportFrequency: SportFrequency | null;
      targetWeightKg: string;
      paceKgPerWeek: string;
    },
  ): Promise<void> {
    return (async () => {
      if (fields.birthDate.trim() !== "") {
        const answer = birthDateAnswer(fields.birthDate, browserLocalDate());
        if (!answer) throw new Error(t("setup.people.birth_date_error"));
        await writeMouthBirthDate(target, answer.date);
      }
      const h = Number(fields.heightCm);
      const w = Number(fields.weightKg);
      if (fields.gender && Number.isFinite(h) && Number.isFinite(w)) {
        await saveMouthBody({
          memberId: target.memberId!,
          heightCm: h,
          weightKg: w,
          gender: fields.gender,
          // ── ⛔ ⑤ EST RELAYÉ, PAS RÉÉCRIT À `null` ─────────────────────
          // Cette carte ne le demande PAS: il vit dans la fenêtre des
          // préférences. Or `appetiteAsked` vaut désormais `true` dans
          // `saveMouthBody` — donc un `null` ici EFFACERAIT ce que la fenêtre
          // vient d'écrire, en cliquant sur un champ d'à côté. C'est la
          // cicatrice « `current` périmé efface l'écriture d'avant », et elle
          // mord ici plus fort qu'ailleurs parce que le drapeau autorise
          // maintenant l'effacement. On renvoie donc ce que la base porte.
          appetite: target.appetite,
          dayActivity: fields.dayActivity,
          sportFrequency: fields.sportFrequency,
          // `null` = « ne touche pas », jamais « efface ».
          activityLevel: fields.activityLevel,
        });
      }
      // ── ⛔ LE CORPS ET LA DATE TRAVERSENT — CORRIGÉ LE 2026-09-20 ───────
      // Ce bloc construisait son brouillon sur `emptyMouthFormDraft()` PLUS
      // les deux nombres, en laissant `fields.heightCm`, `fields.weightKg`,
      // `fields.gender` et `fields.birthDate` de côté — ils sont pourtant
      // juste là. `targetPayloadOf` s'abstient sans corps ni bande d'âge, donc
      // la paire valait `{ null, null }` À TOUS LES COUPS, et la porte
      // REMPLACE: chaque enregistrement de carte effaçait la cible.
      // « J'ai bien mis le poids visé mais il ne remonte pas. » La décision
      // vit maintenant dans `lib/mouthCardTarget.ts`, avec ses trois mesures.
      const payload = mouthCardTargetPayload(
        target,
        fields,
        browserLocalDate(),
      );
      const aimed = await setMemberTarget(
        target.memberId!,
        payload.targetWeightKg,
        payload.paceKgPerWeek,
      );
      if (!aimed.ok) throw new Error(aimed.reason);
      // LES PRÉFÉRENCES SUIVENT, quand la fenêtre en a collecté: c'est le
      // quatrième bouton que ce geste remplace.
      if (memberPrefs?.memberId === target.memberId) {
        await saveMouthPreferences(target, memberPrefs.draft);
      }
      // ⛔ ON NE REFERME PAS. C'est un AUTOSAVE, pas un « Terminé »: refermer
      // la carte sous les doigts de quelqu'un qui quitte un champ pour aller au
      // suivant serait un geste qu'il n'a pas demandé.
      await load(false);
    })();
  }

  /* ⛔ ICI SE TENAIENT `saveMouthRhythm` ET `saveMouthDiet` — les deux
     écrivains que cette page passait à `TableStep`. Retirés avec son montage
     le 2026-08-19 (voir le bloc « ICI SE TENAIT `TableStep` » plus bas): les
     deux questions sont posées dans la FICHE de chaque personne, à l'étape 2,
     et c'est `saveMouthPreferences` qui écrit `setMemberRhythm` /
     `setMemberDiet` désormais. `TableStep` reste exporté pour son harnais, qui
     lui passe ses propres bouchons. */

  function saveMouthGoal(target: FunnelMouth, goal: MemberGoal): Promise<void> {
    return (async () => {
      const result = await setMemberGoal(target.memberId!, goal);
      if (!result.ok) throw new Error(result.reason);
      await load(false);
    })();
  }

  /**
   * RÉPONDRE À LA QUESTION DES ALLERGIES SUR UNE BOUCHE DÉJÀ AJOUTÉE.
   *
   * Le cas nominal est la REPRISE: une bouche saisie sur `/app/household`, ou
   * avant que l'accusé n'existe, arrive ici sans réponse. Sans ce geste, la
   * ligne serait un blocage sans champ — un bouton gris et rien à faire.
   */
  function saveMouthAllergyAnswer(
    target: FunnelMouth,
    labels: string[],
  ): Promise<void> {
    return (async () => {
      await saveMouthAllergies({
        userId,
        memberId: target.memberId!,
        labels,
        current: facts!.practicalConstraints,
      });
      await load(false);
    })();
  }

  /**
   * LE CORPS D'UNE BOUCHE DÉJÀ EN BASE.
   *
   * Cas nominal: la REPRISE, ou une bouche saisie sur `/app/household` avant
   * que l'entonnoir n'existe. Sans ce geste, sa ligne serait un blocage sans
   * champ — `canGenerate` réclame le corps et rien ne permettrait de le donner.
   */
  function saveRowBody(
    target: FunnelMouth,
    heightCm: string,
    weightKg: string,
    gender: MemberGender | "",
    activityLevel: ActivityLevel | null,
    // ② Positionnels comme le cran, et pour la même raison: la casse de
    // compilation est le mécanisme qui recense les appelants.
    dayActivity: DayActivityLevel | null,
    sportFrequency: SportFrequency | null,
  ): Promise<void> {
    return (async () => {
      const h = Number(heightCm);
      const w = Number(weightKg);
      if (!gender || !Number.isFinite(h) || !Number.isFinite(w)) {
        throw new Error(t("setup.missing.member_body"));
      }
      await saveMouthBody({
        memberId: target.memberId!,
        heightCm: h,
        weightKg: w,
        gender,
        // ── ⛔ ⑤ EST RELAYÉ, PAS RÉÉCRIT À `null` ─────────────────────
        // Cette carte ne le demande PAS: il vit dans la fenêtre des
        // préférences. Or `appetiteAsked` vaut désormais `true` dans
        // `saveMouthBody` — donc un `null` ici EFFACERAIT ce que la fenêtre
        // vient d'écrire, en cliquant sur un champ d'à côté. C'est la
        // cicatrice « `current` périmé efface l'écriture d'avant », et elle
        // mord ici plus fort qu'ailleurs parce que le drapeau autorise
        // maintenant l'effacement. On renvoie donc ce que la base porte.
        appetite: target.appetite,
        // ⚠️ LE CRAN NE FAIT PAS PARTIE DE LA GARDE AU-DESSUS, et il ne doit
        // pas: les trois du corps sont exigés (le moteur saute une ligne
        // partielle), celui-ci ne l'est pas (il a un repli sûr). Un `null`
        // n'efface rien en base — la RPC le lit « ne touche pas ».
        activityLevel,
        dayActivity,
        sportFrequency,
      });
      await load(false);
    })();
  }

  /**
   * LA DATE D'UNE BOUCHE INSCRITE — ET LA DIRECTION AVANT ELLE QUAND IL LE
   * FAUT (chantier P3, 2026-09-03).
   *
   * Depuis `20260822041500` (lot S4), `keel_household_set_member_birth_date`
   * refuse `goal_not_for_minor` quand la date rend la bouche mineure PENDANT
   * que sa ligne porte `fat_loss` ou `muscle_gain` — « le détour temporel »,
   * la garde qui arme les trois autres. La migration nomme le remède: retirer
   * la direction, puis poser la date. L'écran l'applique dans le sens de
   * D3.2: la direction devient `maintenance` (« Manger normalement »), ce que
   * les tuiles montrent déjà pour cette date-là, et la date s'écrit ensuite.
   * Même règle que `persistMouth` et `saveMember`, au même endroit du geste.
   *
   * ⚠️ UN SEUL ÉCRIVAIN pour les deux chemins qui posent une date (le champ
   * seul, et la carte « tout ce qui est prêt »): deux copies divergeraient au
   * premier ajustement, et c'est celle qu'on regarde le moins qui refuserait.
   */
  async function writeMouthBirthDate(target: FunnelMouth, isoDate: string): Promise<void> {
    const becomesMinor =
      ageStateOfTypedDate(isoDate, "unknown", browserLocalDate()) === "minor";
    if (becomesMinor && isDirectionalGoal(target.goal)) {
      const folded = await setMemberGoal(target.memberId!, "maintenance");
      if (!folded.ok) throw new Error(folded.reason);
    }
    const dated = await setMemberBirthDate(target.memberId!, isoDate);
    if (!dated.ok) throw new Error(dated.reason);
  }

  function saveMouthBirthDate(target: FunnelMouth, raw: string): Promise<void> {
    return (async () => {
      const answer = birthDateAnswer(raw, browserLocalDate());
      if (!answer) throw new Error(t("setup.people.birth_date_error"));
      await writeMouthBirthDate(target, answer.date);
      await load(false);
    })();
  }

  /**
   * ⛔ ICI SE TENAIT `sendInvite` — RETIRÉ DE L'ENTONNOIR LE 2026-09-20.
   *
   * Il appelait `inviteToHousehold` depuis le panneau « Lui donner son propre
   * accès ? », retiré le même jour. `/app/household` porte le même appel avec
   * son propre écrivain; cette page n'a plus d'appelant, et un écrivain sans
   * geste qui l'atteint est du code mort qui a l'air vivant.
   *
   * Ce que sa note disait et qui reste vrai là-bas: l'invitation NE BLOQUE
   * JAMAIS la génération (R1), et en local aucun e-mail ne part — l'écran rend
   * le lien, dont le `{name}` est load-bearing (plusieurs liens dans la même
   * minute, un lien anonyme part à la mauvaise personne).
   */

  // ── ÉTAPE 3 — LA SORTIE ──────────────────────────────────────────────────

  /**
   * LES ENTRÉES DE LA DEMANDE, POUR LES TROIS GESTES — LA SOURCE UNIQUE.
   *
   * L'aperçu, la reprise et l'adoption l'appellent tous les trois. Deux corps
   * écrits séparément divergeraient, et la divergence se paierait dans le sens
   * le plus cher: un plan composé pour une vie que la personne n'a pas, parce
   * que l'adoption aurait « oublié » la fenêtre ou le mode.
   *
   * ── ⟳ 2026-09-10 · LOT 7 — IL N'Y A PLUS DE ROUTAGE À FAIRE ────────────
   * Ce bloc décrivait le choix du moteur (« au moins deux bouches ⇒ foyer,
   * sinon individuel »). Il n'y a plus qu'un moteur:
   * `generate-household-meal-v1` sert une bouche comme il en sert six, et le
   * périmètre est résolu SERVEUR depuis le foyer rattaché au compte. Rien à
   * décider ici, donc rien à se tromper — et pas de sélecteur « pour moi / pour
   * le foyer », qui serait une seconde autorité sur un fait de base.
   *
   * ⚠️ CE QUI RESTE DE `isOwner` EST AILLEURS: un membre SECONDAIRE ne doit pas
   * voir le geste (le serveur lui rend 403 `not_owner`). L'entonnoir d'un
   * secondaire ne va pas jusqu'ici — voir `secondaryRefusal`, plus bas, qui
   * ferme la sortie AVANT le bouton et dit pourquoi à l'endroit du clic.
   *
   * ── ET LA DEMANDE NE PEUT PAS ÉCHOUER SUR UN REFUS QUE L'ENTONNOIR FERME ─
   * `goal_required` est fermé par `own_goal`, `not_owner` par la garde
   * ci-dessus, `window_required` / `unknown_intent` / `replaces_required` par
   * les constantes ci-dessous. Le tableau complet est dans la fiche.
   */
  // ⟳ 2026-09-11 · LOT 7 — LE PARAMÈTRE EST PARTI AVEC LE CHOIX DE MOTEUR.
  // `draftInput` lisait les faits de l'entonnoir pour décider quelle lane
  // viser. Il n'y a plus qu'une lane: la fonction ne lit plus rien d'eux,
  // et le garder rendrait un paramètre que personne n'honore.
  function draftInput(): ComposeDraftInput {
    return {
      origin: "setup",
      // LA FENÊTRE DEMANDÉE, et plus « d'ici dimanche » codé en dur. Un compte
      // créé un samedi recevait un plan d'un jour et demi sans avoir rien
      // choisi.
      window: {
        kind: "exact",
        startsOn: planWindow.startsOn,
        durationDays: planWindow.durationDays,
      },
      // ⛔ TOUJOURS `null` DEPUIS LE 2026-09-06 — la question « comment tu
      // cuisines cette semaine » a été retirée de l'écran, jugée en double avec
      // « Comment voulez-vous cuisiner ? ». Le champ reste dans le transport:
      // c'est par lui que le serveur applique encore un plafond de forme, et il
      // le fait à partir du STYLE (`styleCappedShape`). `null` est très
      // exactement ce que rendait la réponse par défaut, « laisse le plan
      // décider ». Voir la pierre tombale du champ, plus bas dans ce fichier.
      cookingShape: null,
      // ⛔ SUR LES TROIS GESTES. Le nombre de sessions se pose pareil à qui
      // mange seul, et sans lui à l'adoption, le plan ÉCRIT ne serait pas celui
      // qu'on vient de montrer. (⟳ 2026-09-25 — il remplace « tout dans une
      // session ».)
      cookingSessions,
      // ⟳ 2026-09-10 · LOT 7 — `mode`, `slot`, `servings` et `pantry` ONT
      // QUITTÉ `ComposeDraftInput` avec l'ancienne lane individuelle. Ils
      // étaient déjà des constantes ici (« to_shop », null, 1, []): l'écran
      // n'a plus posé aucune de ces questions depuis le 2026-09-03.
      //
      // `context` et `preferences` restent `null` sur les trois gestes de
      // l'entonnoir: il n'a ni champ « ce qui se passe cette semaine », ni
      // second champ d'envie — l'envie part par `submitEnvy` juste avant la
      // composition (voir `askForDraft`). Envoyer les deux mettrait la même
      // phrase deux fois dans la consigne.
      context: null,
      preferences: null,
    };
  }

  /**
   * LE BOUTON DE FIN — IL DEMANDE UN APERÇU, IL N'ÉCRIT PLUS.
   *
   * ⚠️ LES RÉPONSES DE L'ÉTAPE 3 SONT ÉCRITES D'ABORD, comme avant: elles sont
   * lues par le générateur dans `practical_constraints`, et un aperçu composé
   * sans elles montrerait un plan pour une semaine que personne n'a décrite.
   *
   * ON RELIT AVANT DE COMPOSER. Le verdict qui a allumé le bouton portait sur
   * un brouillon; celui-ci porte sur ce qui est vraiment en base.
   */
  function askForDraft(): Promise<void> {
    return (async () => {
      // ⟳ 2026-09-25 — « COMBIEN DE FOIS » ET UNE PLAGE QUI SUFFIT, AVANT
      // TOUTE ÉCRITURE. Les mêmes offres que les champs (`cookingAnswersVerdict`):
      // les lignes rouges se lisent sous les champs, le motif sous le bouton,
      // et le clic emmène au champ qui le lève.
      const cooking = cookingAnswersVerdict({
        sessions: cookingSessions,
        sessionTime: readSessionTimeBound({ cooking_time_min: plan!.cookingTimeMin }),
        daysToEat: planWindow.tokens.length,
        freezer: hasFreezerDeclared(readKitchenEquipment(facts!.practicalConstraints)),
        mealsPerDay: presenceMealsPerDay(
          presenceRoster({
            self: {
              ownMemberId: facts!.ownMemberId,
              firstName: facts!.state.self.firstName,
              away: facts!.ownAway,
              eatingSlots: facts!.ownEatingSlots,
            },
            mouths: facts!.mouths,
          }).map((m) => ({ slots: m.eatingSlots ?? plan!.eatingRhythm })),
        ),
      });
      if (cooking.sessions !== "ok" || cooking.time !== "ok") {
        setCookingMissesShown(true);
        document.getElementById(
          cooking.sessions !== "ok" ? "setup-cooking-sessions" : "setup-session-time",
        )?.focus();
        throw new Error(
          t(cooking.sessions !== "ok" ? "plan.cooking.sessions_required" : "plan.cooking.time_required"),
        );
      }
      // ⚠️ LECTURE FRAÎCHE — MÊME PIÈGE QU'À L'ÉTAPE 3, MÊME COLONNE.
      // C'était `facts!.practicalConstraints`, la photo prise au MONTAGE de la
      // page. Le « Continuer » de l'étape 3 a écrit `diet_asked` depuis, et
      // `mergePracticalConstraints` réécrit l'objet en entier: partir de la
      // photo effaçait ce régime, la relecture deux lignes plus bas le trouvait
      // manquant, et la composition était refusée pour une question à laquelle
      // on venait de répondre.
      const before = await readFunnelFacts(userId);
      await savePlanAnswers({
        userId,
        current: before.practicalConstraints,
        answers: plan!,
      });
      // ── L'ENVIE PART AVEC LA DEMANDE, comme dans `MealBuilder` ──────────
      // ⚠️ AVANT `composeDraft`, ET C'EST L'ORDRE QUI COMPTE: le générateur
      // relit `household_envy_submissions` PAR SEMAINE, côté serveur. Écrire
      // après composerait le plan sans l'envie qu'on vient de saisir.
      //
      // ⚠️ UNE PHRASE VIDE N'ÉCRASE RIEN. Même règle que `MealBuilder`: ne rien
      // avoir envie de dire est un état normal, et il ne doit pas effacer ce
      // qui a été écrit ailleurs pour cette semaine-là.
      const envyLine = envy.trim();
      if (envyLine) {
        // ⛔ LE RÉSULTAT EST LU, ET UN REFUS ARRÊTE TOUT (lot 7). Il était
        // IGNORÉ: `keel_household_submit_envy` rend `{ok:false, reason}` — elle
        // ne lève PAS — donc un `no_household` ou un `not_owner` partait en
        // silence, et le plan se composait sans la phrase qu'on venait
        // d'écrire. `guardCompose` affiche le motif SOUS le bouton de fin, à
        // l'endroit du geste.
        // ⚠️ `refusalMessage` ET PAS UN `t()` ÉCRIT ICI: c'est le MÊME
        // traducteur que le refus de la composition, deux lignes plus bas, et
        // les deux refus partagent le vocabulaire (`no_household`,
        // `not_owner`). Un jeton inconnu ressort tel quel, jamais sous une
        // phrase passe-partout — la règle de `copy/planRefusals.ts`.
        const wrote = await submitEnvy(envyWeek, envyLine);
        if (!wrote.ok) throw new Error(refusalMessage(wrote.reason));
      }
      const fresh = await readFunnelFacts(userId);
      const freshBranch = fresh.branch ?? "solo";
      const last = canGenerate(fresh.state, freshBranch);
      if (!last.ok) {
        setFacts(fresh);
        throw new Error(t(setupMissKey(last.missing[0])));
      }
      // ⛔ LE PLANCHER DU BUDGET, SUR LES FAITS FRAIS ET PAS SUR LA PHOTO.
      // C'est ICI que le parcours retient, parce que c'est ici que le plan
      // part: l'étape a pu être quittée il y a trois écrans, et la fenêtre, les
      // bouches ou les absences ont pu bouger depuis. Le message est le MÊME
      // que celui rendu sous le champ, et il porte le montant qui le lève.
      //
      // ⚠️ `budgetMarket === null` NE RETIENT RIEN: hors de France et des
      // États-Unis il n'y a pas de grille de prix, donc pas de plancher — et
      // pas de conversion inventée (`_shared/keel/budget_floor.ts`).
      const floorVerdict = assessBudget({
        amount: plan!.budgetAmount,
        market: budgetMarket,
        mouths: budgetMouthsFor({
          dayTokens: planWindow.tokens,
          houseSlots: plan!.eatingRhythm,
          mouths: presenceRoster({
            self: {
              ownMemberId: fresh.ownMemberId,
              firstName: fresh.state.self.firstName,
              away: fresh.ownAway,
              eatingSlots: fresh.ownEatingSlots,
            },
            mouths: fresh.mouths,
          }).map((m) => ({
            memberId: m.memberId,
            diet: m.diet,
            eatingSlots: m.eatingSlots,
            away: m.away,
          })),
          selfMemberId: fresh.ownMemberId,
          selfAway: parseAwayMarks(fresh.practicalConstraints?.away_days),
          // ⟳ 2026-09-25 — LES COÛTS RELUS EUX AUSSI, comme les faits: un
          // corps a pu changer depuis l'étape.
          rates: await loadBudgetDayRates(),
        }),
      });
      if (floorVerdict.kind === "below_floor") {
        setFacts(fresh);
        throw new Error(
          t("plan.cooking.budget_below_floor").replace(
            "{amount}",
            formatBudgetAmount(floorVerdict.floor),
          ),
        );
      }
      // LES FAITS FRAIS SONT RETENUS: l'adoption et la reprise routent sur eux,
      // pas sur la photo d'écran d'avant l'enregistrement.
      setFacts(fresh);
      let composed: PlanDraft;
      try {
        composed = await composeDraft(draftInput(), { onProgress: setProgress });
      } catch (error) {
        throw new Error(refusalMessage(error));
      }
      setDraft(composed);
    })();
  }

  // ── LE RENDU ─────────────────────────────────────────────────────────────

  return (
    <FunnelShell>
      <div className="space-y-6">
        {/* ── ⚠️ « RETOUR » EST EN HAUT, ET C'EST SA PLACE ────────────────────
            Il vivait dans la barre d'action du bas, à côté de « Continuer ».
            Deux défauts, et le second est celui qui compte:

              · il se lisait comme une variante de l'avance — même barre, même
                taille, même bord;
              · et il fallait DESCENDRE tout un formulaire pour revenir en
                arrière. Sur l'étape 2 d'un foyer de quatre, c'est plusieurs
                écrans de défilement pour un geste qui veut dire « je me suis
                trompé plus tôt ».

            En tête, il est là où on le cherche: au-dessus de ce qu'on veut
            quitter, et à côté du fil qui dit où on en est. Demandé le
            2026-08-19.

            ⚠️ IL NE PERD RIEN. Les brouillons vivent dans l'état de la PAGE et
            chaque champ écrit tout seul depuis le même jour — revenir n'a aucun
            coût, et c'est ce qui rend ce bouton sûr à mettre en évidence. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-label font-semibold uppercase text-ink-soft">
            {t("setup.progress", { n: stepIndex + 1, total: steps.length })}
          </p>
          {stepIndex > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={busy}
            >
              {t("setup.back")}
            </Button>
          ) : null}
        </div>

        {failure ? (
          <Card tone="warning">
            <p className="text-sm text-ink">{failure}</p>
          </Card>
        ) : null}
        {flash ? <p className="text-xs text-ink-soft">{flash}</p> : null}

        {/* ⟳ 2026-09-25 — PLUS DE CARTE « TON PLAN SE COMPOSE » DANS
            L'ENTONNOIR (demandé : elle est pour la plateforme). Une première
            composition reprise montre la démonstration du plan, comme sans
            rechargement; un ajustement repris se suit dans la fenêtre. */}

        {step.id === "situate" ? (
          <SituateStep
            current={facts.state.mouths}
            hasHousehold={facts.householdId !== null}
            // ⚠️ `facts.mouths` EST LA LISTE SANS LE MAÎTRE (`readFunnelFacts`
            // le retire — il vit dans `state.self`). « Vide » veut donc bien
            // dire « il est seul à table », et c'est ce que la base vérifie de
            // son côté par `not_alone`.
            hasOtherMouths={facts.mouths.length > 0}
            isOwner={facts.isOwner}
            busy={busy}
            onChoose={chooseSize}
            dissolve={{
              armed: confirmDissolve,
              onConfirm: dissolveTheHousehold,
              onCancel: () => setConfirmDissolve(false),
            }}
          />
        ) : null}

        {step.id === "people" ? (
          <>
            <SelfStep
              draft={self}
              onChange={setSelf}
              branch={branch}
              // ⟳ 2026-09-24 — « ENREGISTRER » SUR LA FICHE, DANS TOUTES LES
              // BRANCHES. Il n'existait pas en solo (« Continue » enregistre et
              // avance, un second bouton en ferait la moitié). Demandé à
              // l'écran: « il y a un bouton enregistrer par fiche ». Le solo
              // suit donc la règle des deux autres branches: la fiche se ferme
              // sur son résumé, « Modifier » la rouvre, et « Continuer »
              // enregistre toujours de son côté.
              // ⚠️ LE REPLI EST **APRÈS** L'`await`, DONC APRÈS LE SUCCÈS.
              // `guard` avale le refus et l'affiche en haut de page; si
              // `saveSelf` lève, cette ligne n'est jamais atteinte et la carte
              // reste ouverte sur les champs que le refus concerne.
              onSave={() =>
                guard(async () => {
                  await saveSelf();
                  setSelfEditing(false);
                })}
              busy={busy}
              // ⚠️ ON NE REMONTE QUE LES DEUX CHAMPS QUI SONT À LUI. La carte
              // reçoit un brouillon COMPLET (il lui faut le corps et l'âge pour
              // BORNER le curseur) mais n'a le droit d'en écrire que deux: tout
              // ramener dans `self` ferait de ce bloc un second formulaire sur
              // les colonnes que le reste de la carte tient déjà.
              target={selfMouthDraft === null ? null : {
                draft: selfMouthDraft,
                onChange: setSelfMouthDraft,
                todayLocalIso: browserLocalDate(),
              }}
              // LA PORTE DES PRÉFÉRENCES. `null` tant que la lecture n'a pas eu
              // lieu: un bouton qui ouvrirait une fenêtre sur du vide non lu
              // l'écrirait au Save.
              onOpenPreferences={selfMouthDraft === null ? null : () => {
                setPrefsFor({ kind: "self" });
              }}
              editing={selfEditing}
              onToggleEdit={() => setSelfEditing(true)}
              // LES FAITS RELUS, JAMAIS LE BROUILLON — voir la prop `saved`.
              // `selfTarget` porte des CHAÎNES (c'est un brouillon de saisie);
              // le résumé attend des nombres, et `""` doit rester « rien »
              // plutôt que devenir `0` par `Number("")`.
              saved={{
                person: facts.state.self,
                target: selfTarget === null ? null : {
                  targetWeightKg: selfTarget.targetWeightKg.trim() === ""
                    ? null
                    : Number(selfTarget.targetWeightKg),
                  paceKgPerWeek: selfTarget.paceKgPerWeek.trim() === ""
                    ? null
                    : Number(selfTarget.paceKgPerWeek),
                },
              }}
            />
            {/*
              ── LA QUESTION EST POSÉE SUR L'ÉCRAN QUI LA PORTE ──────────────
              Il y avait ici une porte: tant que la direction du maître n'était
              pas ENREGISTRÉE, cette carte n'était qu'un encart gris renvoyant
              vers le formulaire du dessus. L'intention était bonne — l'accusé
              d'allergie d'une bouche se fusionne dans la ligne `student_goals`
              du maître, qui n'existe qu'une fois sa direction posée — mais le
              geste était faux: le bouton principal de cette étape enregistre
              ET avance, donc sur le chemin nominal on ne voyait jamais la
              porte s'ouvrir. On arrivait à l'étape 3, elle réclamait des
              bouches, et le seul champ pour en ajouter était resté derrière.

              L'ordre d'écriture n'a pas bougé d'un pouce: il est tenu dans
              `addMouth`, qui enregistre le maître avant la première bouche et
              refuse par un motif nommé s'il n'y a pas encore de direction à
              enregistrer.
            */}
            {branch !== "solo" ? (
              <MouthsStep
                mouths={facts.mouths}
                maxOthers={maximumOthers(branch)}
                draft={mouth}
                onDraftChange={setMouth}
                onAdd={() => guardMouth(addMouth)}
                held={mouthsHeld}
                failure={mouthFailure}
                added={mouthAdded}
                formOpen={mouthFormOpen}
                onOpenForm={() => setMouthFormOpen(true)}
                // « RETIRER » VIDE **ET** REFERME. Vider sans refermer
                // laisserait exactement le bloc dont on veut se défaire.
                onDiscard={() => {
                  setMouth(emptyMouthDraft());
                  setMouthFailure(null);
                  setMouthFormOpen(false);
                }}
                onGoal={(m, g) => guardMouth(() => saveMouthGoal(m, g))}
                onBirthDate={(m, d) => guardMouth(() => saveMouthBirthDate(m, d))}
                onAllergyAnswer={(m, labels) =>
                  guardMouth(() => saveMouthAllergyAnswer(m, labels))}
                onOpenDraftPreferences={() => {
                  setPrefsFor({ kind: "new" });
                }}
                // ⚠️ ON SÈME LES HABITUDES DE CETTE BOUCHE, ET RIEN D'AUTRE.
                // Leur porte REMPLACE la liste complète: ouvrir sur du vide et
                // enregistrer effacerait « une pomme le matin » sans un mot.
                // Les allergies et les dégoûts, eux, s'AJOUTENT — les semer les
                // rejouerait à chaque enregistrement.
                onOpenMouthPreferences={(m) => {
                  const known = habits?.get(m.memberId ?? "");
                  const aimed = memberTargets?.get(m.memberId ?? "") ?? null;
                  setMemberPrefs({
                    memberId: m.memberId ?? "",
                    draft: {
                      ...emptyMouthFormDraft(),
                      firstName: m.firstName,
                      goal: m.goal ?? "",
                      diet: m.diet ?? "",
                      // ══════════════════════════════════════════════════════
                      // SON CORPS — EN LECTURE SEULE, ET C'EST CE QUI REND LA
                      // RECOMMANDATION INDIVIDUELLE (2026-09-19)
                      // ══════════════════════════════════════════════════════
                      //
                      // Sans ces six lignes, `useEatingStructure` n'avait AUCUN
                      // poids pour cette bouche: il ne demandait rien, et la
                      // fenêtre n'avait donc aucun moment à proposer POUR ELLE.
                      // C'est la seconde moitié de « les recommandations
                      // devraient être faites individuellement » — la première
                      // (ne pas hériter de celles d'à côté) vit dans
                      // `lib/useEatingStructure.ts`.
                      //
                      // ⛔ RIEN ICI N'EST RÉÉCRIT EN BASE, et il faut le savoir
                      // avant d'y toucher: `saveMouthPreferences` écrit le
                      // corps depuis `target` (la ligne du roster), jamais
                      // depuis ce brouillon. Ces champs ne sont donc pas un
                      // second formulaire sur les mêmes colonnes — ils sont ce
                      // que la fiche a besoin de LIRE pour calculer.
                      heightCm: m.heightCm === null ? "" : String(m.heightCm),
                      weightKg: m.weightKg === null ? "" : String(m.weightKg),
                      gender: m.gender ?? "",
                      activityLevel: m.activityLevel ?? "",
                      dayActivity: m.dayActivity ?? "",
                      sportFrequency: m.sportFrequency ?? "",
                      // ⚠️ LA DATE VIENT DE LA PORTE SCOPÉE AU MAÎTRE, PAS DU
                      // ROSTER (qui ne la rend jamais). Sans elle, pas de bande
                      // d'âge, donc pas d'entretien estimé, donc AUCUNE
                      // structure — le même chaînon qui privait la ligne de son
                      // curseur de rythme.
                      birthDate: memberBirthDates?.get(m.memberId ?? "") ?? "",
                      // ⚠️ SON RYTHME DE PERTE OU DE PRISE: il déplace la
                      // cible, donc le nombre de moments que le corps réclame.
                      // Le laisser vide ferait proposer la journée d'un rythme
                      // par défaut à quelqu'un qui en a réglé un autre.
                      paceKgPerWeek: aimed?.paceKgPerWeek == null
                        ? ""
                        : String(aimed.paceKgPerWeek),
                      // ⛔ LE RYTHME MANQUAIT ICI, ET C'EST TOUT LE DÉFAUT.
                      // Le régime et les habitudes étaient semés, lui non: on
                      // cochait « déjeuner, dîner », on fermait, on rouvrait —
                      // et les six cases étaient vides. La valeur ÉTAIT en base
                      // (vérifié: `[{"slot":"lunch"},{"slot":"dinner"}]`);
                      // c'est la fenêtre qui repartait de zéro.
                      //
                      // ⚠️ ET C'EST PIRE QU'UN AFFICHAGE: `setMemberRhythm`
                      // REMPLACE la ligne. Rouvrir puis refermer aurait donc
                      // ÉCRASÉ le rythme par un `null` — la cicatrice
                      // `mount-snapshot-forms-need-a-loading-gate`, prise par
                      // le bout qui coûte la donnée.
                      rhythm: m.eatingSlots,
                      habits: Object.fromEntries(
                        (known?.slots ?? []).map((h) => [h.slot, h.usual]),
                      ),
                      // ⛔ SEMÉE POUR LA MÊME RAISON QUE LE RYTHME ci-dessus:
                      // la porte REMPLACE la liste d'entrées. Ouvrir puis
                      // refermer sans cette ligne effacerait sa bulle.
                      light: { ...(known?.light ?? {}) },
                      // ⟳ 2026-09-23 — SES À-CÔTÉS, SEMÉS POUR LA MÊME
                      // RAISON: `emptyMouthFormDraft()` les met à `{}`, et
                      // refermer la fenêtre écrit la liste entière.
                      sideCourses: { ...(known?.sideCourses ?? {}) },
                      // ── ⑤ SEMÉ DEPUIS SA LIGNE DE CORPS ──────────────────
                      // Il s'ÉCRIT à la fermeture (voir
                      // `saveMouthPreferences`), et `appetiteAsked` vaut
                      // `true`: une fenêtre ouverte sur du vide non lu ne se
                      // contenterait donc pas de ne rien dire, elle EFFACERAIT.
                      // C'est la cicatrice
                      // `mount-snapshot-forms-need-a-loading-gate`, prise par
                      // le bout qui coûte la donnée — la même que le rythme
                      // juste au-dessus.
                      appetite: m.appetite ?? "",
                    },
                  });
                  setPrefsFor({ kind: "member", memberId: m.memberId ?? "" });
                }}
                mouthPrefs={memberPrefs}
                onSaveMouthPreferences={(m) => {
                  const d = memberPrefs?.draft;
                  if (d) guardMouth(() => saveMouthPreferences(m, d));
                }}
                onBody={(m, h, w, g, a, day, sport) =>
                  guardMouth(() => saveRowBody(m, h, w, g, a, day, sport))}
                editingMemberId={editingMouth}
                // OUVRIR UNE CARTE REFERME L'AUTRE — voir `editingMouth`.
                onToggleEdit={(m) =>
                  setEditingMouth((prev) =>
                    prev === m.memberId ? null : m.memberId ?? null
                  )}
                onSaveAndClose={(m, fields) =>
                  guardMouth(() => saveMouthCard(m, fields))}
                targets={memberTargets}
                birthDates={memberBirthDates}
                onTarget={(m, w, p) => guardMouth(() => saveMouthTarget(m, w, p))}
                onRemove={(m) => guardMouth(() => removeMouth(m))}
                confirmRemove={confirmRemove}
                onConfirmRemove={setConfirmRemove}
                busy={busy}
              />
            ) : null}
            {/* CE QUI RETIENT, DIT PAR SON MOTIF — et seulement après avoir
                essayé de partir. La liste est celle des faits, donc elle
                rétrécit à chaque réponse et disparaît d'elle-même. */}
            {heldBack && stepMissing.length > 0 ? (
              <BlockersCard blockers={stepBlockers} />
            ) : null}
          </>
        ) : null}

        {/* ── ⟳ 2026-09-23 — L'ÉTAPE 3 EST LE FORMULAIRE DE PLAN, ET RIEN D'AUTRE ─
            La carte « Avec quoi tu cuisines » se montait ici, AU-DESSUS du
            formulaire. Demandé: « la partie supérieure de l'étape 3 est enlevée
            et mise directement dans le générateur de plan ». Elle est
            maintenant repliée DANS `PlanRequestFields`, au-dessus de « tout
            cuisiner en une seule fois » qu'elle conditionne — comme sur
            `/app/plan`. C'est toujours la même carte (`KitchenEquipmentCard`):
            elle lit, écrit et relit la colonne elle-même.

            ⛔ LES TRADITIONS NE REVIENNENT PAS ICI: elles vivent dans la fiche
            du foyer (`/app/household`).

            ⛔ ICI SE TENAIT AUSSI `TableStep` (le régime et les moments, par
            bouche), retiré le 2026-08-19: les deux questions sont dans la FICHE
            de chaque personne, à l'étape 2. */}
        {step.id === "request" ? (
          <RequestStep
            draft={plan}
            onChange={setPlan}
            missing={missing}
            windowStart={windowStart}
            windowEnd={windowEnd}
            onWindowStart={setWindowStart}
            onWindowEnd={setWindowEnd}
            // ── D4 ② · LE TITULAIRE A UNE GRILLE, LUI AUSSI ──────────────
            // `facts.mouths` le RETIRE (il vit dans `state.self`);
            // `presenceRoster` le remet en tête quand sa ligne membre est lue.
            // Le motif complet est dans `lib/presenceRoster.ts`.
            mouths={presenceRoster({
              self: {
                ownMemberId: facts.ownMemberId,
                firstName: facts.state.self.firstName,
                away: facts.ownAway,
                eatingSlots: facts.ownEatingSlots,
              },
              mouths: facts.mouths,
            })}
            planWindow={planWindow}
            // LE PLANCHER DU BUDGET. `selfMemberId` sert à retrouver, dans le
            // roster, la ligne sur laquelle `selfAway` s'ajoute: sans lui, les
            // absences du titulaire ne compteraient pas, et le plancher serait
            // trop HAUT.
            budgetMarket={budgetMarket}
            budgetRates={budgetRates}
            selfMemberId={facts.ownMemberId}
            selfName={facts.state.self.firstName.trim() || t("plan.request.presence_you")}
            // ⚠️ LU DANS LA COLONNE QU'IL ÉCRIT (`practical_constraints.
            // away_days`), pas dans le roster.
            selfAway={parseAwayMarks(facts.practicalConstraints?.away_days)}
            onSelfAwaySave={saveSelfAway}
            onMouthAwaySave={async (m, next) => {
              const result = await setMemberAway(m.memberId!, parseAwayMarks(next));
              if (!result.ok) throw new Error(result.reason);
              await load(false);
            }}
            // LA PHOTO DE LA COLONNE, JAMAIS DE QUOI ÉCRIRE. `null` = pas
            // encore lu, et c'est la porte de rendu de la carte d'équipement.
            practicalConstraints={facts.practicalConstraints}
            hasGoal={facts.state.self.goal !== null}
            onEquipmentSaved={() => load(false)}
            rhythm={plan.eatingRhythm}
            cookingSessions={cookingSessions}
            onCookingSessions={setCookingSessions}
            showCookingMisses={cookingMissesShown}
            envy={envy}
            onEnvy={setEnvy}
            // LA MÊME QUESTION QUE LE ROUTAGE: le champ n'existe que si la
            // demande part sur la lane foyer.
            askEnvy={facts.householdId !== null && facts.isOwner}
          />
        ) : null}

        {/* LA BARRE D'ACTION, ET ELLE NE PORTE AUCUNE SORTIE.
            ── CE QUI A ÉTÉ RETIRÉ LE 2026-08-13, ET POURQUOI ──────────────
            Il y avait ici un « Skip for now » vers `/app/today`, sous la
            bannière « personne n'est retenu dans un couloir ». Décision
            humaine renversée: pendant l'entrée, il n'y a rien d'autre à
            faire, et un lien qui mène ailleurs est un lien qu'on prend —
            après quoi on atterrit sur des écrans vides, on juge le produit
            là-dessus, et on ne revient pas.
            Le « skip » était de toute façon en grande partie une illusion:
            `resolveHomePath` renvoie ici tant qu'il n'y a pas de ligne
            `student_goals`, et la garde de route le rejoue maintenant à
            chaque écran de l'app. Ce qui reste comme échappatoire est la
            seule qui soit honnête: se déconnecter. */}
        {/* ── ⚠️ « RETOUR » À GAUCHE, L'AVANCE À DROITE ─────────────────────
            La barre entière était en `justify-end`: les deux gestes se
            touchaient au bord droit, et « Retour » se lisait comme une variante
            de « Continuer ». Demandé le 2026-08-19 — « à chaque étape il faut
            une étape retour »: il EXISTAIT, mais collé à l'avance, donc
            invisible en tant que sortie.

            ⚠️ ET IL NE PERD RIEN. Les brouillons de l'écran (le titulaire, la
            fiche d'ajout, les réponses de plan, les préférences ouvertes) vivent
            dans l'état de la PAGE, pas de l'étape: revenir en arrière ne
            démonte rien. Depuis le 2026-08-19 chaque champ écrit en plus tout
            seul, donc même un rechargement complet retrouve la saisie. */}
        {/* ⛔ « RETOUR » N'EST PLUS ICI — il est monté en tête d'écran. Le
            laisser aux deux endroits aurait fait deux sorties pour un seul
            geste, et celle du bas restait à des écrans de défilement.

            ⚠️ ET LA BARRE REPASSE À DROITE: avec un seul groupe restant,
            `justify-between` l'aurait collée à gauche, où rien ne l'attend. */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap gap-2">
            {step.id === "people" ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  guard(async () => {
                    await saveSelf();
                    // ── UNE FICHE REMPLIE N'EST PAS UNE FICHE À JETER ──────
                    //
                    // ⚠️ « CONTINUER » IGNORAIT LE BROUILLON, ET L'ÉCRAN S'EN
                    // VANTAIT. On lisait « {name} n'est pas encore ajouté·e :
                    // appuie sur "Ajouter". "Continuer" ne l'enregistre pas »
                    // — au-dessous d'une fiche entièrement renseignée (prénom,
                    // âge, corps, direction, allergies). Dire à quelqu'un que
                    // le bouton principal va perdre son travail n'est pas un
                    // avertissement, c'est l'aveu que le geste est mal placé:
                    // il n'existe aucune raison de saisir une fiche pour ne pas
                    // l'enregistrer. Signalé à l'écran le 2026-08-15.
                    //
                    // « Continuer » absorbe donc l'ajout. « Ajouter » reste, et
                    // reste utile — c'est lui qui permet la RAFALE (enregistrer
                    // et repartir sur une fiche vide sans quitter l'étape).
                    //
                    // Le refus atterrit sur `mouthFailure` et pas sur le
                    // bandeau du haut: c'est la leçon de `guardMouth`, et elle
                    // vaut pour ce chemin-ci exactement pour la même raison —
                    // la fiche fautive est à l'écran, le bandeau est à des
                    // centaines de pixels de là.
                    const typed = mouth.firstName.trim();
                    if (typed) {
                      try {
                        await addMouth();
                        // ── ET IL LE DIT ────────────────────────────────────
                        // L'absorption reste voulue; son SILENCE ne l'était
                        // pas. Posé APRÈS le `setMouthAdded(null)` de `guard`,
                        // donc il survit à ce tour et à lui seul. Voir
                        // `mouthAdded`.
                        setMouthAdded(typed);
                      } catch (error) {
                        setMouthFailure(
                          error instanceof Error ? error.message : String(error),
                        );
                        // La fiche est encore là, non enregistrée: c'est
                        // exactement ce que `heldBack` fait dire à l'étape.
                        setHeldBack(true);
                        return;
                      }
                    }
                    // ── UNE ÉTAPE NE SE LAISSE PAS QUITTER INCOMPLÈTE ───────
                    // Et la relecture est FRAÎCHE, pas `facts`: `saveSelf`
                    // vient d'écrire, l'état d'écran ne le sait pas encore, et
                    // trancher sur la photo d'avant retiendrait quelqu'un qui
                    // vient exactement de répondre.
                    const fresh = await readFunnelFacts(userId);
                    // ⛔ `peopleStepBlockers` ET PAS `missesForStep`: le seul
                    // refus de cette étape est l'identité, le corps et la
                    // direction d'une personne. Les allergies, le régime et les
                    // moments sont DEMANDÉS et ne retiennent plus — décision du
                    // 2026-08-19, et sa contrepartie est écrite dans
                    // `personMisses`.
                    const held = peopleStepBlockers(
                      { ...fresh.state, plan },
                      fresh.branch ?? branch,
                    );
                    if (held.length > 0) {
                      setHeldBack(true);
                      return;
                    }
                    setHeldBack(false);
                    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
                  })}
              >
                {t("setup.next")}
              </Button>
            ) : null}
            {/* ── L'ÉTAPE DE LA TABLE A SON « SUIVANT », ET C'ÉTAIT UN
                DÉFAUT BLOQUANT ────────────────────────────────────────────
                Le bouton d'avance n'existait que pour l'étape 2, parce qu'il
                n'y avait alors que trois étapes et que la dernière composait.
                La coupure du 2026-08-13 en a créé une quatrième: l'étape 3 se
                retrouvait avec « Retour » pour seul geste — un cul-de-sac, vu
                à l'écran avant d'être vu dans le code.

                Elle retient comme l'étape 2, par le même verdict: on
                n'avance pas tant que les moments de la maison ne sont pas
                posés, et on le DIT plutôt que de griser. */}
            {/* ⛔ ET SON BOUTON « CONTINUER » AVEC ELLE. Ce qu'il écrivait est
                repris ailleurs, sans perte: le régime part avec `saveSelf`
                (étape 2), les moments aussi, et `savePlanAnswers` est de toute
                façon rejoué par le bouton de composition. */}
            {/* ⟳ 2026-09-10 · LOT 7 — LE BOUTON DE FIN, OU LA PHRASE QUI DIT
                POURQUOI IL N'Y EST PAS. Un membre secondaire n'a jamais le
                bouton: le moteur unique lui rend 403 `not_owner`, et son
                entonnoir s'arrête sur ce qu'il vient de renseigner — sa
                direction, son corps, ses allergies — qui SERVENT, eux: le
                maître compose avec.

                ⛔ ON NE GRISE PAS, ON DIT. Un bouton désactivé sans motif est
                le même mur muet qu'un refus qui arrive après l'attente. */}
            {isLast && canCompose ? (
              <Button
                variant="primary"
                // LA SEULE SOURCE. Voir `previewState`: rien d'autre ne décide.
                disabled={busy || !verdict.ok}
                onClick={() => guardCompose(askForDraft)}
              >
                {busy ? <ComposingLabel progress={progress} /> : t("setup.plan.compose")}
              </Button>
            ) : null}
            {/* ⟳ 2026-09-21 — CE QUE ÇA COÛTE EN TEMPS, dit sous le geste,
                comme sous les deux boutons du composeur. */}
            {isLast && canCompose ? (
              /* ⟳ 2026-09-21 — PLUS PETITE, SUR DEMANDE, ET AUX TROIS SITES.
                 `text-label` (11 px) avec `tracking-normal`: son interlettrage
                 est dessiné pour des capitales. Laisser ce site en `text-xs`
                 aurait fait deux tailles pour la même phrase, à deux écrans
                 d'intervalle. */
              <p className="text-label leading-5 tracking-normal text-ink-soft">
                {t("meals.eta")}
              </p>
            ) : null}
            {isLast && !canCompose ? (
              <p className="text-sm leading-6 text-ink-soft">
                {t("plan.draft.owner_composes")}
              </p>
            ) : null}
          </div>

          {/* LE REFUS DU BOUTON DE FIN, SOUS LE BOUTON DE FIN — voir
              `guardCompose`. Il ne remplace pas le bandeau du haut: celui-ci
              reste pour ce qui n'a pas de geste à qui se rattacher. */}
          {composeFailure ? (
            <p className="mt-3 text-sm text-red-700">{composeFailure}</p>
          ) : null}
          {/* ⟳ 2026-09-25 — LE PLAN DE DÉMONSTRATION ET SA VISITE, le temps que
              le vrai se compose. Démonté dès que le brouillon arrive: la
              fenêtre d'aperçu s'ouvre alors, comme avant. */}
          {((composeBusy || resumingDraft) && draft === null) || demoOpen ? (
            <div className="mt-6">
              <DemoPlanTour
                progress={progress}
                householdSize={facts?.mouths.length ?? 1}
                composing={composeBusy || resumingDraft}
              />
            </div>
          ) : null}
        </div>

        {/* ── LA FENÊTRE DES PRÉFÉRENCES — UNE SEULE, POUR TROIS SURFACES ──
            Décision de l'utilisateur (2026-08-18): « le reste — allergies,
            habitudes, ce qu'on n'aime pas, le shaker — dans une pop-up
            accessible depuis "Renseigner ses préférences alimentaires" », et
            « bien sûr qu'il y ait le bouton pour l'ouvrir ».

            ⚠️ ELLE N'ENREGISTRE RIEN PAR ELLE-MÊME. Elle édite le brouillon de
            la fiche qui l'a ouverte, et c'est le geste d'enregistrement de
            cette fiche qui écrit — « Continuer » pour le titulaire, « Ajouter »
            pour la fiche neuve, le bouton de sa rangée pour une bouche déjà
            inscrite. Deux boutons d'enregistrement sur un même brouillon, c'est
            la garantie qu'un jour l'un des deux cessera d'écrire ce que l'autre
            écrit — mesuré sur `MeCard`.

            ⚠️ `Modal` REND `null` FERMÉ SANS DÉMONTER SES ENFANTS: on la monte
            une fois, et le bloc déplié survit à une fermeture. */}
        {/* ⚠️ FF-060 — LE BROUILLON EST NOMMÉ UNE FOIS. Il servait dans deux
            expressions ternaires identiques (le `draft` et le calcul de
            structure); deux copies auraient divergé au premier `kind` ajouté,
            et le verrou aurait alors porté sur un autre corps que celui qu'on
            édite. */}
        {prefsFor !== null && (
          prefsFor.kind === "self"
            ? selfMouthDraft !== null
            : prefsFor.kind === "new" ||
              memberPrefs?.memberId === prefsFor.memberId
        ) ? (
          <MouthFormDialog
            open
            // ── ⛔ FERMER ÉCRIT. C'EST LA CORRECTION D'UNE PERTE RÉELLE ──
            //
            // Mesuré en base le 2026-08-19 après un passage complet: habitudes
            // `[]`, aucun régime, aucun rythme, aucun dégoût, aucune allergie.
            // Rien de ce que la fenêtre avait collecté n'était parti.
            //
            // La cause est un enchaînement de deux décisions justes prises
            // séparément: la fenêtre édite un BROUILLON que la fiche
            // enregistrait, et le bouton d'enregistrement de la fiche a été
            // retiré le même jour (« le seul bouton enregistrer c'est pour le
            // shaker »). Le brouillon n'avait donc plus d'écrivain.
            //
            // ⚠️ ON ÉCRIT SUR LE `onClose`, PAS SUR LE BOUTON « Terminé »: la
            // fenêtre se ferme aussi par la croix et par Échap, et ces deux
            // chemins-là auraient continué de jeter la saisie en silence. C'est
            // la même leçon que « un geste qui ne fait rien est indiscernable
            // d'un geste qui a marché », prise par le bout qui coûte la donnée.
            //
            // ⚠️ LA BOUCHE QU'ON AJOUTE N'A RIEN OÙ ÉCRIRE: sa ligne n'existe
            // pas encore. Son brouillon part avec « Ajouter à la table », qui
            // le pose en même temps que la personne — il n'est pas perdu, il
            // attend.
            onClose={() => {
              const target = prefsFor;
              setPrefsFor(null);
              if (target.kind === "self") {
                void guard(saveSelf);
              } else if (target.kind === "member") {
                const m = facts.mouths.find((x) =>
                  x.memberId === target.memberId
                );
                // ⚠️ LE BROUILLON EST PRIS ICI, dans le rendu où la fenêtre
                // était encore ouverte — pas relu plus tard dans l'écrivain.
                const d = memberPrefs?.draft;
                if (m && d) void guardMouth(() => saveMouthPreferences(m, d));
              }
            }}
            draft={prefsDraft!}
            // ⚠️ FF-060 — CE QUE LE CORPS EXIGE, calculé sur le BROUILLON.
            // Pas sur la ligne en base: au moment où on remplit, rien n'y est
            // encore, et attendre l'enregistrement montrerait le verrou au
            // RETOUR sur la fiche — trop tard pour expliquer ce qui vient
            // d'être décidé.
            structure={prefsStructure}
            onChange={prefsFor.kind === "self"
              ? setSelfMouthDraft
              : prefsFor.kind === "new"
              ? setMouth
              : ((next) =>
                setMemberPrefs((prev) =>
                  prev === null ? prev : {
                    ...prev,
                    draft: typeof next === "function" ? next(prev.draft) : next,
                  }
                ))}
            // ⚠️ `hasAccount` DÉCIDE DE DEUX BLOCS, DANS DES SENS OPPOSÉS: le
            // shaker n'existe que pour un compte (`fixed_intakes` est clé sur
            // `user_id`), le régime que pour une bouche sans compte (la base
            // refuse `has_account`). Le titulaire en a un; une bouche qu'on
            // ajoute n'en a jamais; une bouche inscrite, ça dépend d'elle.
            subject={{
              // LA VOIX: « tu » sur ma propre fiche, le PRÉNOM sur celle des
              // autres. Voir `lib/mouthVoice.ts` — et pourquoi la troisième
              // personne nomme plutôt qu'elle ne genre.
              isSelf: prefsFor.kind === "self",
              existing: prefsFor.kind !== "new",
              hasAccount: prefsFor.kind === "self" ||
                (prefsFor.kind === "member" &&
                  (facts.mouths.find((m) => m.memberId === prefsFor.memberId)
                    ?.claimed ?? false)),
            }}
            busy={busy}
            // ── LES MOMENTS SUR LESQUELS LA FICHE INTERROGE ────────────────
            // ⚠️ LA CASCADE EST CELLE DU MOTEUR, PAS UNE RÈGLE D'ÉCRAN: les
            // siens s'il en a, sinon ceux de la maison, sinon les six. Voir
            // `habitSlotsFor` — et le défaut qu'elle ferme, signalé capture à
            // l'appui le 2026-08-19: six créneaux proposés à quelqu'un qui
            // venait de dire qu'il mange deux fois par jour.
            //
            // La bouche qu'on AJOUTE n'a encore rien dit d'elle: elle tombe
            // donc sur le rythme de la maison, qui est très exactement ce sur
            // quoi elle sera servie tant qu'elle se tait.
            // ── OÙ VA LE SHAKER DE CE SUJET — voir `shakerPortFor` ────────
            shakerPort={shakerPortFor(prefsFor, facts.mouths)}
            slots={habitSlotsFor(
              prefsFor.kind === "member"
                ? facts.mouths.find((m) => m.memberId === prefsFor.memberId)
                  ?.eatingSlots ?? null
                : prefsFor.kind === "self"
                ? facts.ownEatingSlots
                : null,
              plan?.eatingRhythm ?? facts.state.plan.eatingRhythm,
            )}
          />
        ) : null}

        {/* ── L'APERÇU, MONTÉ EN PERMANENCE ET NOURRI PAR LE BROUILLON ──────
            `Modal` rend `null` fermé — il ne démonte pas ses enfants — donc
            l'état de la fenêtre survit à une fermeture, et c'est
            `PlanDraftDialog` qui remet son compteur de tours à zéro à chaque
            OUVERTURE.

            ⛔ AUCUNE CONSTANTE EN DUR ICI: chaque prop vient du brouillon
            réellement composé. Un `rationale={[]}` posé à la main aurait rendu
            muet le CONSTAT, c'est-à-dire la moitié de ce lot.

            FERMER, C'EST RENONCER — et on reste dans l'entonnoir. Aucun plan
            n'a été écrit (`intent: "draft"`), donc `/app/plan` n'aurait rien à
            montrer: y envoyer quelqu'un serait le poser devant un écran vide
            en lui ayant fait croire qu'il venait de finir. */}
        <PlanDraftDialog
          // ⟳ 2026-09-25 — ELLE SE CACHE D'ELLE-MÊME TANT QUE LA
          // DÉMONSTRATION EST OUVERTE (`PlanDraftDialog`, `plan/demo/demoGate`):
          // une visite commencée va jusqu'au bout, et une visite rouverte
          // depuis l'aperçu le rend tel qu'on l'a laissé.
          open={draft !== null}
          /* ⛔ « LAISSER TOMBER » JETTE LE BROUILLON. Fermer en le gardant en
             mémoire le rendait inatteignable jusqu'au rechargement. */
          onClose={() => {
            void discardDraft(draft?.envelope.draftId ?? null);
            setDraft(null);
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
          busy={busy}
          resumedAdjusting={resumedAdjusting}
          resumedFailure={resumedFailure}
          // ⟳ 2026-09-08 (lot 4) — TROIS GESTES AU LIEU D'UN. Le dialogue lit
          // la phrase (`readNote`), pose la question du serveur s'il y en a
          // une, la répond (`answerNote`), PUIS compose — sans la phrase:
          // `draftInput` est la source unique des entrées, et le magasin porte
          // déjà l'effet de la phrase. Les `throw` sont conservés: c'est ce qui
          // fait qu'un refus d'entrée ne compte pas un tour.
          onReadNote={async (note) => {
            try {
              return await readNote(note, draftInput().window);
            } catch (e) {
              throw new Error(refusalMessage(e));
            }
          }}
          onAnswerNote={async (answer) => {
            try {
              return await answerNote(answer);
            } catch (e) {
              throw new Error(refusalMessage(e));
            }
          }}
          /* ⟳ 2026-09-21 — LE STADE RÉEL REMONTE AU BOUTON QUI TRAVAILLE.
             `progress` et `onProgress` vont ensemble: sans le second, le
             premier resterait `null` et « Ajuster le plan » retomberait sur
             les seules phrases minutées pendant deux minutes. */
          progress={progress}
          onCompose={async () => {
            try {
              setDraft(await composeDraft(draftInput(), { onProgress: setProgress }));
            } catch (e) {
              throw new Error(refusalMessage(e));
            } finally {
              setProgress(null);
            }
          }}
          // ⟳ 2026-09-09 — LA REPRISE LOCALE : la case seule, sur le brouillon
          // que le dialogue nomme (son `draftId`, jamais un état de page qui
          // pourrait être en retard d'une composition).
          onEditCells={async (id, cells) => {
            try {
              setDraft(await editCells(draftInput(), id, cells));
            } catch (e) {
              throw new Error(refusalMessage(e));
            }
          }}
          // ⟳ 2026-09-24 — la note n'est qu'une exclusion : seuls les plats
          // qui contiennent l'aliment sont refaits (`editExclusions`).
          onEditExclusions={async (id, swaps) => {
            try {
              setDraft(await editExclusions(draftInput(), id, {}, swaps));
            } catch (e) {
              throw new Error(refusalMessage(e));
            }
          }}
          // ⟳ 2026-09-24 — « REMPLACER »: lire les raisons des plats barrés
          // (la liste des plats refusés est rangée, chaque raison classée),
          // puis refaire ces plats-là seulement.
          onReadRejections={async (id, rejections) => {
            try {
              return await readRejections(id, rejections, draftInput().window);
            } catch (e) {
              throw new Error(refusalMessage(e));
            }
          }}
          onReplaceDishes={async (id, rejections) => {
            try {
              setDraft(await replaceDishes(draftInput(), id, rejections));
            } catch (e) {
              throw new Error(refusalMessage(e));
            }
          }}
          // ⟳ 2026-09-24 — « ÇA VAUT AUSSI POUR… »: une proposition, qui ne
          // jette jamais (une panne rend `[]`).
          onMatchDishes={(id, target) => matchDishes(id, target, draftInput().window)}
          edit={draft?.envelope.edit ?? null}
          onAdopt={async () => {
            // Le serveur relit et revalide ce brouillon par son identifiant,
            // puis l'écrit et le marque adopté dans une transaction unique.
            //
            // `prepare_next` et `replaces: null`: un compte qui sort de
            // l'entonnoir n'a aucun plan vivant, donc rien à remplacer — et
            // `replace_current` sans cible rend `replaces_required`.
            //
            // ⛔ SANS PHRASE (lot 4): elle a déjà fait son effet à la reprise,
            // et la relire ici l'appliquerait une seconde fois.
            let written: { ok: boolean; mealId: string | null };
            try {
              const reviewedDraftId = draft?.envelope.draftId ?? null;
              if (reviewedDraftId === null) throw new Error("draft_not_ready");
              written = await writeFromDraft(
                draftInput(),
                reviewedDraftId,
                "prepare_next",
                null,
              );
            } catch (e) {
              throw new Error(refusalMessage(e));
            }
            // Un 200 qui dit `ok: false` n'est pas une panne de transport, et
            // il ne doit pas non plus atterrir comme un succès.
            if (!written.ok) {
              throw new Error(refusalMessage(new Error("plan_not_written")));
            }
            // ── LE BROUILLON LOCAL A FINI SON OFFICE ────────────────────
            // Le plan est ÉCRIT: tout ce que le cache portait est en base, et
            // le garder ferait rouvrir l'entonnoir sur des réponses restaurées
            // au prochain passage par `/app/setup` — au-dessus d'une base qui
            // les a déjà toutes. Voir `lib/setupDraftCache.ts`.
            clearSetupDraft(userId);
            setDraft(null);
            // L'ATTERRISSAGE EST LE PLAN, jamais `/app/today`.
            navigate("/app/plan", { replace: true });
          }}
        />
      </div>
    </FunnelShell>
  );
}

/* ⛔ `ComposingLabel` A DÉMÉNAGÉ — ⟳ 2026-09-21, dans
   `components/plan/ComposingLabel.tsx`. L'aperçu de brouillon en a besoin
   aussi: son bouton « Ajuster le plan » tourne deux minutes, et il tournait
   sans rien dire. Une seconde copie aurait donné deux vocabulaires d'attente
   pour la même composition. */
