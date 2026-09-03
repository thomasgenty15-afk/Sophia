import { parseAwayMarks } from "../lib/presenceMarks";
import React from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { edgeRefusalKey } from "../copy/planRefusals";
import { setupMissKey } from "../copy/setupMisses";
import { LocaleSwitch } from "../components/LocaleSwitch";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
// ⚠️ `tokens.ts`, PAS `activity_floor.ts`. Le dépôt porte deux listes
// `ACTIVITY_LEVELS`; celle-ci est celle que la contrainte CHECK des deux
// colonnes connaît (`20260818100000`). L'autre rendrait des jetons que la base
// refuse à l'écriture.
import {
  ACTIVITY_LEVELS,
  type AppetiteLevel,
  DAY_ACTIVITY_LEVELS,
  type DayActivityLevel,
  SPORT_FREQUENCIES,
  type SportFrequency,
  type ActivityLevel,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  addHouseholdMember,
  createHousehold,
  dissolveHousehold,
  loadMemberBirthDates,
  inviteToHousehold,
  MEMBER_GENDERS,
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
  type ComposeDraftInput,
  composeDraft,
  type PlanDraft,
  writeFromDraft,
} from "../api/planDraft";
// LOT B — le mode de cuisson demandé à la composition.
import {
  COOKING_SHAPES,
  cookingShapeApplies,
  type CookingShape,
} from "../api/cookingShape";
import CookingShapeField from "../components/CookingShapeField";
import CookingStyleField from "../components/CookingStyleField";
import GroceryRunsField from "../components/GroceryRunsField";
import GoalTiles from "../components/GoalTiles";
import PlanDraftDialog from "../components/plan/PlanDraftDialog";
import {
  EATING_OCCASIONS,
  type EatingOccasion,
  MEAL_SIZES,
  type MealSize,
} from "../api/mealGeneration";
import {
  BIRTH_DATE_ON_FILE,
  birthDateAnswer,
  branchForMouths,
  canGenerate,
  DIET_ANSWERS,
  type DietAnswer,
  DEFAULT_HOUSEHOLD_NAME,
  declaredHouseholdSize,
  type FunnelBranch,
  type FunnelFacts,
  type FunnelMissId,
  type FunnelMouth,
  type FunnelPlanAnswers,
  type FunnelState,
  funnelSteps,
  HOUSEHOLD_MAX_MOUTHS,
  maximumOthers,
  missesForStep,
  peopleStepBlockers,
  type StepBlocker,
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
import { mergePracticalConstraints } from "../api/practicalConstraints";
import { BUDGET_MAX } from "../api/planBudget";
// ── D6 (2026-08-18) — LE POIDS VISÉ ET LE RYTHME, DANS L'ENTONNOIR ─────────
// Le composant, la décision et l'écrivain viennent tous les trois d'ailleurs:
// cet écran n'en refait aucun. Une seconde lecture de `paceControlFor` ici
// divergerait de celle de `/app/household` au premier correctif.
import { type ExtrasDraft, habitEntriesToWrite } from "../lib/mealExtras";
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
  MouthCoreFields,
  MouthPreferencesButton,
  type ShakerPort,
  TargetAndPaceFields,
} from "../components/MouthFormDialog";
import {
  ageStateOfDraft,
  ageStateOfTypedDate,
  emptyMouthDraft as emptyMouthFormDraft,
  foldMinorGoal,
  type MouthAgeState,
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
import { chooseGenerator } from "../api/planRouting";
import {
  hasFreezerDeclared,
  readKitchenEquipment,
} from "../api/kitchenEquipment";
import { addDays, daysBetween, isIsoDate, weekStartFor } from "../api/dates";
import {
  lastNameableStart,
  MAX_WINDOW_DAYS,
  windowDayOrder,
} from "../api/mealWindow";
import { type AwayDay, type EatingOccasionSlot } from "../api/mealGeneration";
import {
  // LE MÊME ÉCRIVAIN QUE `MealBuilder`, appelé — jamais un second.
  ENVY_MAX_CHARS,
  loadEnvyLine,
  setMemberAway,
  submitEnvy,
} from "../api/household";
import MealPickerGrid from "../components/MealPickerGrid";
import KitchenEquipmentCard from "../components/KitchenEquipmentCard";
import OneCookingSessionField from "../components/OneCookingSessionField";
import { presenceRoster } from "../lib/presenceRoster";
import { browserLocalDate, catchUpWindowStart } from "../lib/useMealTicks";
import { t, type MessageKey } from "../i18n/t";
import { habitSlotsFor } from "../lib/habitSlots";
import { formatDate } from "../i18n/format";
// ⚠️ `HouseholdHabitsCard` N'EST PLUS MONTÉE ICI (2026-08-14). Elle reste le
// bon écran pour RELIRE ce qu'une bouche mange, sur `/app/household`; dans
// l'entonnoir, son dépliant et sa phrase « aucun moment de repas n'est encore
// posé » demandaient d'aller cocher ailleurs ce qui se coche juste au-dessus.
// Ce qui subsiste ici est sa ligne libre, dans la carte de chaque personne, sur
// la MÊME table et la MÊME RPC — donc rien de saisi n'est perdu.
import {
  DRAFT_NOTE_MAX_CHARS,
  type HabitSlot,
  loadMemberHabits,
  type MemberHabitsView,
  setMemberHabits,
} from "../api/householdHabits";

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

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

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
 */
function refusalMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const key = edgeRefusalKey(raw.split(":")[0]?.trim() ?? "");
  return key ? t(key) : raw;
}

/** Le brouillon de MA fiche. Séparé des faits: on ne réécrit qu'au Save. */
interface SelfDraft {
  firstName: string;
  /** Vide = pas encore saisie. Le champ est une `date`, donc `YYYY-MM-DD`. */
  birthDate: string;
  heightCm: string;
  weightKg: string;
  gender: MemberGender | "";
  /**
   * `null` = aucune tuile cochée, ET C'EST UNE RÉPONSE VALIDE — pas un champ
   * vide à remplir. Il n'y a donc pas de `""` ici comme sur les autres: le
   * vocabulaire n'a pas de jeton d'ignorance, exprès (`tokens.ts`).
   */
  activityLevel: ActivityLevel | null;
  /**
   * ② LES DEUX AXES (2026-08-20). `null` = pas répondu — le cran ci-dessus
   * reste alors le repli nommé, et il rend le nombre d'avant.
   */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
  /**
   * ① CE QU'IL Y A D'AUTRE DANS L'ASSIETTE · ⑤ L'APPÉTIT (2026-08-20).
   *
   * ⛔ ILS SE SAISISSENT DANS LA FENÊTRE DES PRÉFÉRENCES, ET ILS SONT DANS CE
   * BROUILLON-CI — pas dans un second. C'est la règle qui gouverne toute la
   * fenêtre: un seul brouillon, un seul écrivain. Deux états pour une même
   * personne, c'est la garantie qu'un jour l'un des deux cessera d'écrire ce
   * que l'autre écrit.
   *
   * ⚠️ TRI-ÉTAT sur les trois premiers: `false` est une RÉPONSE qui fait monter
   * la part du plat, `null` veut dire « pas répondu » et retombe sur la moyenne.
   */
  takesDessert: boolean | null;
  takesCheese: boolean | null;
  takesBread: boolean | null;
  appetite: AppetiteLevel | "";
  goal: MemberGoal | "";
  /** Vide = pas encore répondu. `omnivore` EST une réponse. */
  diet: DietAnswer | "";
  allergies: string[];
  /** « Rien à déclarer » — une RÉPONSE, pas une absence de réponse. */
  allergiesNone: boolean;
  // ── CE QUI SE SAISIT DERRIÈRE « RENSEIGNER SES PRÉFÉRENCES » (2026-08-18) ──
  // Ces trois-là ne sont PAS des champs de la carte: ils vivent dans la
  // fenêtre. Ils sont quand même dans CE brouillon, et pas dans un second, pour
  // la raison qui gouverne toute la fenêtre — un seul brouillon, un seul
  // écrivain. Deux états pour une même personne, c'est la garantie qu'un jour
  // l'un des deux cessera d'écrire ce que l'autre écrit.
  /** Une ligne libre par moment nommé. Clé = le moment. SEMÉE par `load`. */
  habits: Record<string, string>;
  /**
   * CE QU'IL PREND À CÔTÉ DU PLAT, par moment RÉPONDU. SEMÉE par `load`.
   *
   * ⛔ MÊME CICATRICE QUE `habits` JUSTE AU-DESSUS, et elle coûte plus cher
   * ici: une clé ABSENTE veut dire « pas demandé » et une clé VIDE veut dire
   * « rien à côté ». Un brouillon non semé écrirait la seconde à la place de
   * la première — c'est-à-dire une réponse que personne n'a donnée.
   */
  extras: ExtrasDraft;
  /** Ses dégoûts. JAMAIS une allergie — deux tables, deux natures (FF-046). */
  dislikes: string[];
  /** Son apport fixe déclaré, ou `null`. Clé sur `user_id` (`fixed_intakes`). */
  shaker: ShakerDraft | null;
  /**
   * SES MOMENTS — et, depuis le 2026-08-19, CEUX DE LA MAISON.
   *
   * La question a quitté l'étape 3 pour la fiche. Le titulaire étant la
   * première bouche, sa réponse écrit les DEUX: `practical_constraints`
   * (le repli de toute bouche muette) et sa ligne membre. Voir `saveSelf`.
   */
  rhythm: readonly EatingOccasionSlot[] | null;
}

/**
 * Le brouillon d'une bouche qu'on ajoute.
 *
 * ── ⛔ AUCUN CHAMP `kind`, ET C'EST LE POINT (2026-08-18) ─────────────────
 * Ce brouillon portait `kind: "adult" | "child"`, demandé par deux boutons
 * juste sous le prénom. Deux raisons de l'avoir retiré, et la seconde est un
 * défaut mesuré:
 *
 *   1. LA DATE DE NAISSANCE LE DIT DÉJÀ, et elle est collectée dans le même
 *      formulaire, trois champs plus bas. Deux sources pour un même fait
 *      finissent par se contredire — et c'est la réponse TAPÉE qui gagnerait,
 *      parce qu'elle est plus récente. Le moteur, lui, résout l'âge en TROIS
 *      états (mineur, majeur, INCONNU), où l'inconnu n'applique aucune
 *      direction: un booléen d'écran ne sait pas dire le troisième.
 *
 *   2. REPASSER EN « ENFANT » EFFAÇAIT L'OBJECTIF DU BROUILLON. C'est
 *      l'ancienne règle « un mineur n'a jamais d'objectif », RENVERSÉE le
 *      2026-08-18: un mineur porte les trois directions exactement comme un
 *      majeur (migration `20260818100000`, les deux portes RPC ouvertes,
 *      `servingDirectionFor` côté moteur, `goalsForAge` rend la même liste des
 *      deux côtés). Cet écran était le dernier endroit à l'appliquer.
 *
 *      ⟳ 2026-09-03 (chantier P3, D3.2): la liste n'est PLUS la même des deux
 *      côtés — `goalsForAge("minor")` ne rend que `maintenance` (« Manger
 *      normalement ») depuis que la base refuse `fat_loss` et `muscle_gain`
 *      sur un mineur (`20260822041500`, lot S4, quatre portes). Mais rien ici
 *      n'EFFACE une direction, et c'est ce que le point 2 garde: une date qui
 *      rend quelqu'un mineur PLIE sa direction à « Manger normalement » à la
 *      lecture et à l'écriture (`goalForAge`, `foldMinorGoal`), et l'écran le
 *      dit. Le brouillon garde ce qui a été tapé — corriger la date vers un
 *      âge adulte fait réapparaître la direction d'origine.
 *
 * ⛔ NE PAS LE RÉINTRODUIRE. Ce que `MouthFormDialog` dit déjà de son côté vaut
 * ici mot pour mot: « on ne demande jamais adulte ou enfant ».
 */
/**
 * ── ⚠️ C'EST `MouthFormDraft`, ET PLUS UNE FORME LOCALE (2026-08-18) ──────
 *
 * Ce brouillon portait ses neuf champs à lui. Il en manquait cinq — le poids
 * visé, le rythme, les habitudes, les dégoûts, le régime — et les cinq
 * existaient déjà, nommés et testés, dans `lib/mouthForm.ts`. Les recopier ici
 * aurait fait une SECONDE forme de la même personne: deux `emptyMouthDraft`,
 * deux parseurs, et le jour du premier correctif un seul des deux corrigé.
 *
 * ⚠️ `activityLevel` CHANGE DE VOCABULAIRE AU PASSAGE: `null` devient `""`.
 * Les deux disent « personne n'a répondu » — `tokens.ts` refuse un jeton
 * d'ignorance des deux côtés —, mais `ActivityTiles` parle en `null`, d'où les
 * deux traductions au point de montage. Une seule, ici, et pas une par champ.
 */
type MouthDraft = MouthFormDraft;

/**
 * CE BROUILLON PORTE-T-IL QUELQUE CHOSE ?
 *
 * ⚠️ NÉ D'UN DÉFAUT VU À L'ÉCRAN LE 2026-08-14. Le formulaire d'ajout a la même
 * forme qu'une fiche de personne — prénom, adulte/enfant, naissance, corps,
 * direction — et il n'avait AUCUN moyen d'être vidé. Quelqu'un tape deux
 * lettres par mégarde et se retrouve devant ce qu'il lit comme une personne de
 * plus, sans bouton pour la retirer. Ses mots: « j'ai fait ajouter une personne
 * sans faire exprès mais on peut pas la retirer ». En base il n'y avait
 * personne — mais ça, l'écran ne le disait pas non plus.
 *
 * `allergiesNone` compte: c'est une RÉPONSE (« aucune »), pas un défaut.
 */
function mouthDraftHasContent(d: MouthDraft): boolean {
  return d.firstName.trim() !== "" ||
    d.birthDate !== "" ||
    d.heightCm !== "" ||
    d.weightKg !== "" ||
    d.gender !== "" ||
    // Un cran coché EST du contenu: sans lui, quelqu'un qui n'a cliqué que sur
    // une tuile ne verrait pas le bouton « Effacer », et le brouillon
    // partirait en silence au geste d'à côté.
    d.activityLevel !== "" ||
    d.goal !== "" ||
    // ── ET CE QUI SE SAISIT DERRIÈRE LE BOUTON COMPTE AUTANT ────────────────
    // Les préférences vivent dans une fenêtre depuis le 2026-08-18. Les
    // oublier ici ferait disparaître « Effacer » sous une fiche où quelqu'un
    // vient de déclarer trois allergies — le brouillon partirait alors en
    // silence au geste d'à côté, ce que cette fonction existe pour empêcher.
    d.targetWeightKg !== "" ||
    d.paceKgPerWeek !== "" ||
    Object.values(d.habits).some((v) => v.trim() !== "") ||
    d.shaker !== null ||
    d.dislikes.length > 0 ||
    d.diet !== "" ||
    d.allergies.length > 0 ||
    d.allergiesNone;
}

/** Le vide vient de la SEULE source — voir `MouthDraft` juste au-dessus. */
function emptyMouthDraft(): MouthDraft {
  return emptyMouthFormDraft();
}

// ── LES TROIS TABLES DE LIBELLÉS, ET CE QUI A CHANGÉ ───────────────────────
//
// Elles portaient les DIX-NEUF PHRASES elles-mêmes, en dur. Le compilateur les
// gardait complètes (`Record<MemberGoal, string>` réclame un mot par objectif),
// et c'est justement ce qui les rendait invisibles: elles avaient l'air d'être
// tenues. Mais un `const` de module est figé à la langue du bundle — `t()` ne
// peut pas y être appelé, la règle MODULE_SCOPE_T du lint le refuse et elle a
// raison —, donc dix-neuf mots anglais survivaient au milieu d'un formulaire
// français.
//
// Les tables gardent leur complétude et changent de contenu: elles portent des
// CLÉS, et la résolution se fait à l'appel, dans les trois accesseurs
// ci-dessous. Un objectif ajouté sans son mot ne compile toujours pas.
const GOAL_KEYS: Record<MemberGoal, MessageKey> = {
  fat_loss: "setup.goal.fat_loss",
  muscle_gain: "setup.goal.muscle_gain",
  // Trois clés retirées le 2026-08-18 avec leurs jetons. Le `Record` est
  // COMPLET sur les trois qui restent — c'est lui qui refuse de compiler le
  // jour où un quatrième objectif arrive sans son mot.
  maintenance: "setup.goal.maintenance",
};

const OCCASION_KEYS: Record<string, MessageKey> = {
  breakfast: "setup.occasion.breakfast",
  snack_am: "setup.occasion.snack_am",
  lunch: "setup.occasion.lunch",
  snack_pm: "setup.occasion.snack_pm",
  dinner: "setup.occasion.dinner",
  before_bed: "setup.occasion.before_bed",
};

function goalLabel(goal: MemberGoal): string {
  return t(GOAL_KEYS[goal]);
}

/**
 * L'ÉTAT D'ÂGE D'UNE BOUCHE INSCRITE, VU DE SA LIGNE — trois valeurs, jamais
 * deux (chantier P3, 2026-09-03).
 *
 * `kind` n'en porte que deux, et `unknown` y devient `adult` DÉLIBÉRÉMENT
 * (voir `api/onboarding.ts`: ne pas savoir n'est pas savoir que c'est un
 * enfant). `birthDate`, lui, dit si une date EXISTE (`null` = âge inconnu).
 * Les deux ensemble rendent l'état à trois valeurs que `goalsForAge` réclame
 * — et une date TAPÉE dans la carte gagne sur les deux, parce que c'est elle
 * que le prochain blur va écrire.
 */
function funnelMouthAgeState(
  m: FunnelMouth,
  typedDate: string,
  todayLocalIso: string,
): MouthAgeState {
  const fromRoster: MouthAgeState = m.kind === "child"
    ? "minor"
    : m.birthDate === null
    ? "unknown"
    : "adult";
  return ageStateOfTypedDate(typedDate, fromRoster, todayLocalIso);
}

/**
 * Les deux suivants gardent le repli sur le JETON BRUT qu'avait le `??` des
 * tables d'origine, et c'est délibéré: les créneaux et les jours viennent de
 * `api/mealGeneration.ts`, et un jeton neuf ajouté là-bas doit se voir à
 * l'écran plutôt que faire tomber le formulaire d'inscription de quelqu'un.
 * C'est la même posture que `allergenLabel` — jamais un écran vide pour un mot
 * manquant.
 */
function occasionLabel(slot: string): string {
  const key = OCCASION_KEYS[slot];
  return key ? t(key) : slot;
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
    // ① ET ⑤ SEMÉS DEPUIS LA LIGNE DE CORPS. Une fenêtre ouverte sur
    // des réponses vierges au-dessus d'une réponse déjà donnée finit
    // par l'écraser — « formulaire figé au montage ».
    takesDessert: read.state.self.takesDessert,
    takesCheese: read.state.self.takesCheese,
    takesBread: read.state.self.takesBread,
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
    extras: { ...(habitsMap.get(read.ownMemberId ?? "")?.extras ?? {}) },
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
  const [stepIndex, setStepIndex] = React.useState(0);
  const [pendingHouseholdSize, setPendingHouseholdSize] = React.useState<
    number | null
  >(null);
  const [busy, setBusy] = React.useState(false);
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
  /** La bouche dont la grille de présence est ouverte. */
  const [awayFor, setAwayFor] = React.useState<string | null>(null);
  const [awayBusy, setAwayBusy] = React.useState(false);

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
  const [invite, setInvite] = React.useState<
    { memberId: string; token: string; firstName: string } | null
  >(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteFor, setInviteFor] = React.useState<string | null>(null);

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
  /**
   * LA PHRASE DU DERNIER TOUR, RETENUE POUR L'ADOPTION.
   *
   * ⛔ ELLE PART AVEC L'ADOPTION. Adopter RECOMPOSE (voir `writeFromDraft`):
   * sans la phrase, le plan écrit ne serait pas celui qu'on vient de montrer,
   * et personne ne saurait pourquoi ce qu'on avait demandé a disparu.
   */
  const [draftNote, setDraftNote] = React.useState<string | null>(null);
  const [draftOpen, setDraftOpen] = React.useState(false);
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
  const [cookingShape, setCookingShape] = React.useState<CookingShape | null>(
    null,
  );
  /**
   * « TOUT CUISINER EN UNE SEULE FOIS » — 2026-09-01. `false` par défaut, et
   * c'est le comportement d'avant ce lot au caractère près.
   *
   * ⚠️ IL VIT ICI ET PAS DANS `draft` (`FunnelPlanAnswers`), pour la raison
   * exacte écrite pour `cookingShape` juste au-dessus: tout ce que porte
   * `draft` est ÉCRIT dans `practical_constraints` par `savePlanAnswers`,
   * c'est-à-dire appliqué en silence à toutes les semaines suivantes. Celui-ci
   * se redemande à chaque composition.
   */
  const [oneCookingSession, setOneCookingSession] = React.useState(false);
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
            setCookingShape(
              (COOKING_SHAPES as readonly string[]).includes(
                  kept.draft.cookingShape ?? "",
                )
                ? kept.draft.cookingShape as CookingShape
                : null,
            );
            // ⚠️ PAS DE RELECTURE CONTRE UN VOCABULAIRE: c'est un booléen, et
            // `readSetupDraft` l'a déjà ramené à `true`/`false` par `=== true`.
            setOneCookingSession(kept.draft.oneCookingSession);
          } else {
            setStepIndex(
              step ? Math.max(0, steps.findIndex((s) => s.id === step.id)) : Math.max(0, steps.length - 1),
            );
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
          cookingShape,
          oneCookingSession,
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
    cookingShape,
    // ⛔ SANS CETTE LIGNE, LE MIROIR NE SE RÉVEILLE PAS. Cocher la case ne
    // changerait aucune autre dépendance: l'effet ne repartirait pas, et
    // l'onglet rechargé retrouverait la case décochée — un brouillon qui perd
    // la seule réponse qui n'existe nulle part ailleurs.
    oneCookingSession,
    envy,
    envyWeek,
  ]);

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
      extras: self.extras,
      dislikes: self.dislikes,
      shaker: self.shaker,
      diet: self.diet,
      rhythm: self.rhythm,
      // ── ① ET ⑤ — ILS MANQUAIENT, ET LES SIX CONTRÔLES ÉTAIENT INERTES ────
      //
      // « J'arrive pas à cocher les choix » (2026-08-24). Sans ces quatre
      // lignes, la fenêtre recevait le vide d'`emptyMouthFormDraft()` à chaque
      // rendu: un radio qu'on coche remonte dans `self`, `selfMouthDraft` se
      // recalcule, et il rend `null`/`""` — donc le radio se décoche dans la
      // même image. Exactement le défaut du RÉGIME, quatre jours plus tard.
      //
      // ⚠️ `null` ET `""` DISENT « PAS RÉPONDU » DANS LES DEUX VOCABULAIRES.
      // On ne les traduit pas en « non »: `false` est une RÉPONSE qui fait
      // monter la part du plat, et l'inventer écrirait un fait que personne
      // n'a donné — cicatrice `auto-tick-writes-undeniable-false-facts`.
      takesDessert: self.takesDessert,
      takesCheese: self.takesCheese,
      takesBread: self.takesBread,
      appetite: self.appetite,
    };

  /**
   * CE QUE LA FENÊTRE ÉCRIT DANS LE BROUILLON DU TITULAIRE — ET OÙ ÇA VA.
   *
   * ⚠️ DEUX DESTINATIONS, ET C'EST LA SEULE CHOSE QUI COMPTE ICI. Le poids visé
   * et le rythme sont des FAITS RELUS (`selfTarget`, posé par la lecture); tout
   * le reste est le brouillon de saisie (`self`). Tout ramener dans l'un ou
   * l'autre ferait, dans un sens, une seconde copie du corps qui se périme, et
   * dans l'autre, une cible écrasée à la prochaine relecture.
   */
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
        extras: { ...applied.extras },
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
        // ── ① ET ⑤ REMONTENT, ET LEUR ÉCRIVAIN LES ATTENDAIT DÉJÀ ──────────
        //
        // `saveSelf` pose `draft.takes*` et `draft.appetite` sur la ligne de
        // corps depuis le 2026-08-20 — l'écrivain existait, la REMONTÉE non.
        // Le champ se voyait mort à l'écran, et il l'était aussi en base: un
        // champ qui ne remonte pas ne peut pas non plus être enregistré.
        //
        // ⚠️ AUCUNE TRADUCTION ICI: les deux vocabulaires portent le même
        // tri-état (`boolean | null`) et le même jeton d'ignorance (`""`).
        // C'est `saveSelf` qui retraduit `""` en `null` au bord de la base.
        takesDessert: applied.takesDessert,
        takesCheese: applied.takesCheese,
        takesBread: applied.takesBread,
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
    setComposeFailure(null);
    setFlash(null);
    try {
      await work();
    } catch (error) {
      setComposeFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
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
      // ⚠️ ET ÇA NE CHANGE PAS SA LANE DE GÉNÉRATION: `chooseGenerator` route
      // sur `otherMouths >= 1`, jamais sur la présence d'un foyer — « un foyer
      // laissé à une seule bouche compose comme un solo ». Mesuré avant
      // d'écrire cette ligne.
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
          // ① ET ⑤ — SAISIS DANS LA FENÊTRE DES PRÉFÉRENCES, ÉCRITS ICI. La
          // fenêtre n'a pas d'écrivain à elle: elle édite CE brouillon, et
          // c'est ce geste-ci qui le pose. Un second écrivain dans la fenêtre
          // ferait deux enregistrements sur une même porte, et c'est celui
          // qu'on regarde le moins qui écraserait l'autre.
          takesDessert: draft.takesDessert,
          takesCheese: draft.takesCheese,
          takesBread: draft.takesBread,
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
        const sizeToPersist = pendingHouseholdSize ??
          (declaredHouseholdSize(facts!.practicalConstraints) === null
            ? facts!.state.mouths
            : null);
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
        // prose — c'est-à-dire exactement celle qui porte les bulles. Un
        // troisième vit dans `mouthToPersist`; les trois appellent désormais
        // la même fonction, et un test refuse qu'un quatrième réapparaisse.
        await setMemberHabits(
          memberId,
          habitEntriesToWrite({
            habits: draft.habits,
            extras: draft.extras,
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
            takesDessert: draft.takesDessert,
            takesCheese: draft.takesCheese,
            takesBread: draft.takesBread,
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
      extras: draft.extras,
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
          takesDessert: draft.takesDessert,
          takesCheese: draft.takesCheese,
          takesBread: draft.takesBread,
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
          // ── ⛔ ① ET ⑤ SONT RELAYÉS, PAS RÉÉCRITS À `null` ──────────────
          // Cette carte ne les demande PAS: ils vivent dans la fenêtre des
          // préférences. Or `structureAsked` / `appetiteAsked` valent désormais
          // `true` dans `saveMouthBody` — donc un `null` ici EFFACERAIT ce que
          // la fenêtre vient d'écrire, en cliquant sur un champ d'à côté. C'est
          // la cicatrice « `current` périmé efface l'écriture d'avant », et
          // elle mord ici plus fort qu'ailleurs parce que le drapeau autorise
          // maintenant l'effacement. On renvoie donc ce que la base porte.
          takesDessert: target.takesDessert,
          takesCheese: target.takesCheese,
          takesBread: target.takesBread,
          appetite: target.appetite,
          dayActivity: fields.dayActivity,
          sportFrequency: fields.sportFrequency,
          // `null` = « ne touche pas », jamais « efface ».
          activityLevel: fields.activityLevel,
        });
      }
      const payload = targetPayloadOf(
        {
          ...emptyMouthFormDraft(),
          // PLIÉE À L'ÂGE DE LA LIGNE, date tapée comprise: une cible ne part
          // jamais sur une direction que les tuiles viennent de replier
          // (`target_not_for_minor` sinon, loin du geste).
          goal: goalForAge(
            target.goal ?? "",
            funnelMouthAgeState(target, fields.birthDate, browserLocalDate()),
          ),
          targetWeightKg: fields.targetWeightKg,
          paceKgPerWeek: fields.paceKgPerWeek,
        },
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
        // ── ⛔ ① ET ⑤ SONT RELAYÉS, PAS RÉÉCRITS À `null` ──────────────
        // Cette carte ne les demande PAS: ils vivent dans la fenêtre des
        // préférences. Or `structureAsked` / `appetiteAsked` valent désormais
        // `true` dans `saveMouthBody` — donc un `null` ici EFFACERAIT ce que
        // la fenêtre vient d'écrire, en cliquant sur un champ d'à côté. C'est
        // la cicatrice « `current` périmé efface l'écriture d'avant », et
        // elle mord ici plus fort qu'ailleurs parce que le drapeau autorise
        // maintenant l'effacement. On renvoie donc ce que la base porte.
        takesDessert: target.takesDessert,
        takesCheese: target.takesCheese,
        takesBread: target.takesBread,
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
   * L'INVITATION NE BLOQUE JAMAIS LA GÉNÉRATION (R1). Un plan se compose avec
   * les bouches saisies, invitation envoyée ou non, acceptée ou non.
   *
   * ⚠️ EN LOCAL, AUCUN E-MAIL NE PART, et c'est voulu: `EMAIL_DELIVERY_ENABLED`
   * est un pistolet chargé sur un poste de dev. L'écran REND le lien, et son
   * `{name}` est load-bearing — le maître émet plusieurs liens dans la même
   * minute, et un lien anonyme part à la mauvaise personne.
   */
  function sendInvite(target: FunnelMouth): Promise<void> {
    return (async () => {
      const email = inviteEmail.trim();
      if (!email) throw new Error(t("household.invite.error.bad_email"));
      const result = await inviteToHousehold(email, target.memberId!);
      if (!result.ok) throw new Error(result.reason);
      setInvite({
        memberId: target.memberId!,
        token: String(result.token ?? ""),
        firstName: String(result.first_name ?? target.firstName),
      });
      setInviteEmail("");
    })();
  }

  // ── ÉTAPE 3 — LA SORTIE ──────────────────────────────────────────────────

  /**
   * LES ENTRÉES DE LA DEMANDE, POUR LES TROIS GESTES — LA SOURCE UNIQUE.
   *
   * L'aperçu, la reprise et l'adoption l'appellent tous les trois. Deux corps
   * écrits séparément divergeraient, et la divergence se paierait dans le sens
   * le plus cher: un plan composé pour une vie que la personne n'a pas, parce
   * que l'adoption aurait « oublié » la fenêtre ou le mode.
   *
   * ── LE ROUTAGE EST UN FAIT, PAS LA BRANCHE ─────────────────────────────
   * `generate-household-meal-v1` si le foyer a AU MOINS DEUX bouches, sinon
   * `generate-meal-v1`. On lit le roster, pas la réponse de l'étape 1: un foyer
   * commencé et laissé à une seule bouche recevrait sinon `empty_household` sur
   * un chemin où le générateur individuel marche très bien.
   *
   * ⚠️ `isOwner` EST LA MOITIÉ DU ROUTAGE, pas une précaution.
   * `generate-household-meal-v1` rend 403 `not_owner` à un secondaire — et
   * c'est voulu: son plan à lui est PERSONNEL (D2 du modèle foyer). Router sur
   * le seul nombre de bouches enverrait toute personne ayant réclamé son profil
   * droit dans un refus que rien ne peut fermer.
   *
   * ⚠️ LA RÈGLE A DEUX APPELANTS DEPUIS QUE `/app/plan` ACCUEILLE LA DEMANDE.
   * `chooseGenerator` la porte, et deux copies auraient divergé: celle qui se
   * trompe envoie un maître sur le générateur individuel — trente secondes
   * d'attente, un appel modèle payé, et rien à l'écran.
   *
   * ⚠️ `otherMouths` EST LA LISTE SANS LE MAÎTRE. `facts.mouths` ne contient pas
   * sa ligne; le module prend le compte des AUTRES et fait l'addition lui-même.
   *
   * ── ET LA DEMANDE NE PEUT PAS ÉCHOUER SUR UN REFUS QUE L'ENTONNOIR FERME ─
   * `goal_required` est fermé par `own_goal`, `no_household` et
   * `empty_household` par l'étape 1 et le routage ci-dessus, `mode_required` /
   * `window_required` / `unknown_intent` / `replaces_required` par les
   * constantes ci-dessous. Le tableau complet est dans la fiche.
   */
  function draftInput(
    from: FunnelFacts,
    note: string | null,
  ): ComposeDraftInput {
    const lane = chooseGenerator({
      inHousehold: from.householdId !== null,
      isOwner: from.isOwner,
      otherMouths: from.mouths.length,
    });
    return {
      lane,
      // LA FENÊTRE DEMANDÉE, et plus « d'ici dimanche » codé en dur. Un compte
      // créé un samedi recevait un plan d'un jour et demi sans avoir rien
      // choisi.
      window: {
        kind: "exact",
        startsOn: planWindow.startsOn,
        durationDays: planWindow.durationDays,
      },
      note,
      // LOT B — LE MODE DE CUISSON DEMANDÉ, TEL QUEL. Il part sur les TROIS
      // gestes (aperçu, reprise, adoption), parce que `draftInput` est la
      // source unique: sans lui à l'adoption, le plan ÉCRIT ne serait pas celui
      // qu'on vient de montrer. La lane individuelle l'ignore.
      cookingShape,
      // ⛔ SUR LES DEUX LANES, ET SUR LES TROIS GESTES. « Tout dans une session »
      // est une question de CONSERVATION, pas de nombre d'assiettes: elle se
      // pose pareil à qui mange seul. Et sans lui à l'adoption, le plan ÉCRIT ne
      // serait pas celui qu'on vient de montrer.
      oneCookingSession,
      // Les entrées de la lane individuelle, ignorées sur la lane foyer.
      // `to_shop` et pas `from_pantry`: un premier plan n'a pas de garde-manger
      // déclaré, et `from_pantry` sans articles rend `pantry_required`.
      mode: "to_shop",
      slot: null,
      servings: 1,
      context: null,
      preferences: null,
      pantry: [],
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
      if (envyLine) await submitEnvy(envyWeek, envyLine);
      const fresh = await readFunnelFacts(userId);
      const freshBranch = fresh.branch ?? "solo";
      const last = canGenerate(fresh.state, freshBranch);
      if (!last.ok) {
        setFacts(fresh);
        throw new Error(t(setupMissKey(last.missing[0])));
      }
      // LES FAITS FRAIS SONT RETENUS: l'adoption et la reprise routent sur eux,
      // pas sur la photo d'écran d'avant l'enregistrement.
      setFacts(fresh);
      let composed: PlanDraft;
      try {
        composed = await composeDraft(draftInput(fresh, null));
      } catch (error) {
        throw new Error(refusalMessage(error));
      }
      setDraft(composed);
      // LA PHRASE EST RETENUE APRÈS L'APPEL, jamais avant: une phrase refusée
      // (`note_unusable`) ne doit ni rester collée à l'aperçu précédent, ni
      // partir à l'adoption alors que le serveur l'a écartée.
      setDraftNote(null);
      setDraftOpen(true);
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
              // LE BOUTON D'ENREGISTREMENT N'EXISTE QUE QUAND IL Y A UNE SUITE
              // DANS LA MÊME ÉTAPE. En solo, « Continue » enregistre et avance:
              // un second bouton qui fait la moitié du premier ne se distingue
              // de lui que par ce qu'il ne fait pas.
              onSave={branch === "solo" ? null : () => guard(saveSelf)}
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
                  setMemberPrefs({
                    memberId: m.memberId ?? "",
                    draft: {
                      ...emptyMouthFormDraft(),
                      firstName: m.firstName,
                      goal: m.goal ?? "",
                      diet: m.diet ?? "",
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
                      // refermer sans cette ligne effacerait ses bulles.
                      extras: { ...(known?.extras ?? {}) },
                      // ── ① ET ⑤ SEMÉS DEPUIS SA LIGNE DE CORPS ────────────
                      // Ils s'ÉCRIVENT à la fermeture (voir
                      // `saveMouthPreferences`), et `structureAsked` /
                      // `appetiteAsked` valent `true`: une fenêtre ouverte sur
                      // du vide non lu ne se contenterait donc pas de ne rien
                      // dire, elle EFFACERAIT. C'est la cicatrice
                      // `mount-snapshot-forms-need-a-loading-gate`, prise par
                      // le bout qui coûte la donnée — la même que le rythme
                      // juste au-dessus.
                      takesDessert: m.takesDessert,
                      takesCheese: m.takesCheese,
                      takesBread: m.takesBread,
                      appetite: m.appetite ?? "",
                    },
                  });
                  setPrefsFor({ kind: "member", memberId: m.memberId ?? "" });
                }}
                mouthPrefs={memberPrefs}
                // ── CE QUE LA BASE SAIT DÉJÀ D'ELLE ────────────────────────
                // ⚠️ ON NE SÈME PAS LES DÉGOÛTS: ils ne sont pas relus par cet
                // écran (leur porte n'a qu'`add`/`remove`), donc les compter
                // ici dirait « renseignés » sur une lecture qui n'a pas eu
                // lieu. Un récapitulatif qui invente est pire qu'un
                // récapitulatif court.
                knownPrefs={(m) => ({
                  ...emptyMouthFormDraft(),
                  firstName: m.firstName,
                  goal: m.goal ?? "",
                  diet: m.diet ?? "",
                  rhythm: m.eatingSlots,
                  allergiesNone: m.allergiesReviewed,
                  habits: Object.fromEntries(
                    (habits?.get(m.memberId ?? "")?.slots ?? []).map((h) => [
                      h.slot,
                      h.usual,
                    ]),
                  ),
                  extras: { ...(habits?.get(m.memberId ?? "")?.extras ?? {}) },
                })}
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
                inviteFor={inviteFor}
                onInviteFor={(id) => {
                  setInviteFor(id);
                  setInvite(null);
                }}
                inviteEmail={inviteEmail}
                onInviteEmail={setInviteEmail}
                onInvite={(m) => guard(() => sendInvite(m))}
                invite={invite}
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

        {/* ── L'ÉTAPE `request` COMMENCE PAR LES MOYENS, PAS PAR LES MOMENTS ─
            On demande AVEC QUOI on cuisine avant de demander QUAND. L'ordre
            inverse planifie une cuisson qu'aucun appareil de la maison ne peut
            faire, puis demande à quelqu'un de trouver le temps de la faire.
            L'ordre se mesure sur le HTML rendu (`householdSettings.int.test.ts`
            depuis A5): un ordre qui ne tient que par la lecture d'un fichier se
            défait au premier déplacement de bloc.

            ⚠️ UN BLOC À PART, PAS UN FRAGMENT AUTOUR DE `TableStep`. Ce
            fichier est partagé par trois lanes aujourd'hui; ré-indenter les
            quarante lignes de `TableStep` pour les envelopper aurait fait un
            diff illisible à côté du leur. Deux blocs sur la même condition
            rendent la même chose, dans le même ordre. */}
        {/* ── LES MOYENS, SUR L'ÉTAPE QUI LES DEMANDE (2026-08-19) ─────────
            Cette carte vivait sur l'étape `table`, supprimée le même jour. Elle
            rejoint `request`, avec les jours où l'on cuisine, le temps et le
            budget: c'est la même famille de question — AVEC QUOI, QUAND,
            COMBIEN —, et elle garde son ordre interne (les moyens de cuisson
            AVANT les disponibilités, sinon on planifie une cuisson qu'aucun
            appareil de la maison ne peut faire).

            ⛔ ET ELLE NE POUVAIT PAS ALLER DANS LA FICHE D'UNE PERSONNE:
            l'équipement est un fait de MAISON. Le poser par bouche le ferait
            demander quatre fois, et rien ne dirait laquelle des quatre réponses
            compte. Le déjeuner au boulot, lui, est per-personne — et depuis
            le 2026-09-03 (A6, P6) il vit DANS la fiche de chaque personne, sur
            `/app/household` (`MemberWorkLunchCard`), juste au-dessus de la
            grille que sa réponse pré-remplit. L'étape 3 ne le pose plus: la
            question décrit une SEMAINE ORDINAIRE, pas cette demande-ci, et
            deux écrans la séparaient de la case où la démentir. */}
        {/* ── ⟳ A5, 2026-09-03 — `TableStepPlanning` A DISPARU ──────────────
            Il ne portait plus que deux cartes (le déjeuner en semaine en est
            parti avec A6), et l'une des deux — « les jours que le foyer ne
            déplace pas » — a REJOINT `/app/household`, section « Paramètres du
            foyer ». Un composant pour envelopper une seule carte n'enveloppe
            rien: l'équipement se monte donc ici, directement.

            ⚠️ L'ÉQUIPEMENT RESTE, ET IL EST LE SEUL À RESTER. Le congélateur
            décide du nombre de courses (lane CUISINE): la question doit être
            posée AVANT le premier plan, donc dans l'entonnoir. C'est la MÊME
            carte que celle du Foyer — elle lit et écrit elle-même, et relit la
            colonne avant de fusionner —, pas une copie.

            ⛔ ET LES TRADITIONS NE REVIENNENT PAS ICI. Elles ne gouvernent rien
            avant le premier plan, et l'entonnoir ne se rejoue jamais: les
            laisser ici, c'était n'avoir aucun écran pour les changer ensuite. */}
        {step.id === "request" ? (
          <KitchenEquipmentCard
            // LA PHOTO DE LA COLONNE, JAMAIS DE QUOI ÉCRIRE. `null` = pas
            // encore lu, et c'est la porte de rendu de la carte: sept cases
            // décochées pendant la lecture partiraient telles quelles au
            // premier Enregistrer. L'écrivain, lui, relit la colonne.
            practicalConstraints={facts.practicalConstraints}
            hasGoal={facts.state.self.goal !== null}
            onSaved={() => load(false)}
          />
        ) : null}

        {/* ⛔ ICI SE TENAIT `TableStep` — LE RÉGIME ET LES MOMENTS, PAR BOUCHE.
            Retiré le 2026-08-19: les deux questions sont dans la FICHE de
            chaque personne, à l'étape 2, où elles sont posées à côté de ce
            qu'elles commandent. Les garder ici aurait fait DEUX formulaires sur
            les mêmes colonnes — « la garantie qu'un jour l'un des deux cessera
            d'écrire ce que l'autre écrit ». Le composant reste exporté pour son
            harnais; plus rien ne le monte. */}
        {step.id === "request" ? (
          <RequestStep
            draft={plan}
            onChange={setPlan}
            missing={missing}
            // ⚠️ LU DEPUIS LA MÊME COLONNE QUE LE MOTEUR, et par le miroir de
            // SA fonction. L'entonnoir doit pouvoir annoncer ce que la
            // composition fera — pas une seconde idée de ce qu'est « avoir un
            // congélateur ». La carte qui pose la question est plus haut sur
            // CETTE étape (`KitchenEquipmentCard`) — et aussi sur
            // `/app/household`, section « Paramètres du foyer », qui est le
            // seul endroit où on peut la changer une fois inscrit.
            hasFreezer={hasFreezerDeclared(
              readKitchenEquipment(facts.practicalConstraints),
            )}
            windowStart={windowStart}
            windowEnd={windowEnd}
            onWindowStart={setWindowStart}
            onWindowEnd={setWindowEnd}
            maxEnd={addDays(windowStart, MAX_WINDOW_DAYS - 1)}
            // ── D4 ② · LE TITULAIRE A UNE GRILLE, LUI AUSSI ──────────────
            // `facts.mouths` le RETIRE (il vit dans `state.self`), et la fiche
            // du foyer lui pose pourtant la question du déjeuner (A6; l'étape 3
            // avant): sa réponse coche cinq de SES midis « dehors ». Sans cette
            // ligne, il ne trouvait nulle
            // part dans le tunnel de quoi en contredire un seul — alors que la
            // règle est « pré-remplir n'est pas décider, la grille gagne ».
            // Le motif complet, et pourquoi on ne retire PAS la question à la
            // place, sont dans `lib/presenceRoster.ts`.
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
            awayFor={awayFor}
            onAwayFor={setAwayFor}
            awayBusy={awayBusy}
            rhythm={plan.eatingRhythm}
            cookingShape={cookingShape}
            onCookingShape={setCookingShape}
            oneCookingSession={oneCookingSession}
            onOneCookingSession={setOneCookingSession}
            envy={envy}
            onEnvy={setEnvy}
            // LA MÊME QUESTION QUE LE ROUTAGE, POSÉE AU MÊME ENDROIT que la
            // forme de cuisine: le champ n'existe que si la demande part sur
            // la lane foyer.
            askEnvy={facts.householdId !== null && facts.isOwner}
            // LA MÊME QUESTION QUE LE ROUTAGE, POSÉE AU MÊME ENDROIT: le champ
            // n'existe que si la demande part sur la lane foyer. `facts.mouths`
            // ne contient pas la ligne du maître, d'où le `+ 1` — et c'est le
            // seul endroit de ce fichier qui fait cette addition à la main,
            // parce que `chooseGenerator` la fait pour le reste.
            askCookingShape={cookingShapeApplies(facts.mouths.length + 1)}
            onAwaySaved={(m, next) =>
              guard(async () => {
                setAwayBusy(true);
                try {
                  const result = await setMemberAway(m.memberId!, parseAwayMarks(next));
                  if (!result.ok) throw new Error(result.reason);
                  setAwayFor(null);
                  await load(false);
                } finally {
                  setAwayBusy(false);
                }
              })}
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
            {isLast ? (
              <Button
                variant="primary"
                // LA SEULE SOURCE. Voir `previewState`: rien d'autre ne décide.
                disabled={busy || !verdict.ok}
                onClick={() => guardCompose(askForDraft)}
              >
                {busy ? <ComposingLabel /> : t("setup.plan.compose")}
              </Button>
            ) : null}
          </div>

          {/* LE REFUS DU BOUTON DE FIN, SOUS LE BOUTON DE FIN — voir
              `guardCompose`. Il ne remplace pas le bandeau du haut: celui-ci
              reste pour ce qui n'a pas de geste à qui se rattacher. */}
          {composeFailure ? (
            <p className="mt-3 text-sm text-red-700">{composeFailure}</p>
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
            draft={prefsFor.kind === "self"
              ? selfMouthDraft!
              : prefsFor.kind === "new"
              ? mouth
              : memberPrefs!.draft}
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
          open={draftOpen}
          onClose={() => setDraftOpen(false)}
          draft={draft?.plan ?? null}
          // LES PHRASES DU SERVEUR, TELLES QU'IL LES REND. Assemblées côté
          // serveur, dans la langue du contenu: cet écran les affiche, il ne
          // les décide pas.
          rationale={draft?.envelope.rationale ?? []}
          // 🔴 TOUJOURS `0` AUJOURD'HUI, et ce n'est pas une constante posée
          // ici: c'est ce que le serveur rend, parce qu'il journalise `dropped`
          // sans le publier. Voir `DraftEnvelope.droppedClauses`.
          droppedClauses={draft?.envelope.droppedClauses ?? 0}
          busy={busy}
          onRemix={async (note) => {
            // ⚠️ LA MÊME DEMANDE, PLUS LA PHRASE. `draftInput` est la source
            // unique des entrées: le tour N porte les mêmes blocs que le tour
            // 1, et la note s'AJOUTE. Elle ne remplace rien.
            // Le `throw` est conservé: c'est lui qui fait qu'une reprise
            // refusée à l'entrée ne compte PAS un tour, puisque rien n'a été
            // composé.
            try {
              const composed = await composeDraft(draftInput(facts!, note));
              setDraft(composed);
              setDraftNote(note);
            } catch (e) {
              throw new Error(refusalMessage(e));
            }
          }}
          onAdopt={async () => {
            // ⚠️ CECI RECOMPOSE, ET C'EST DIT DANS LA FENÊTRE AVANT LE CLIC.
            // Aucun chemin ne permet d'écrire l'aperçu tel quel:
            // `write_student_meal_plan` est révoquée à `authenticated`, et
            // aucune fonction edge n'accepte un plan déjà composé. Voir
            // `writeFromDraft`.
            //
            // `prepare_next` et `replaces: null`: un compte qui sort de
            // l'entonnoir n'a aucun plan vivant, donc rien à remplacer — et
            // `replace_current` sans cible rend `replaces_required`.
            //
            // ⛔ `draftNote` ET PAS `null`. La phrase part AVEC l'adoption:
            // sans elle, le plan écrit ne serait pas celui qu'on vient de
            // montrer.
            let written: { ok: boolean; mealId: string | null };
            try {
              written = await writeFromDraft(
                draftInput(facts!, draftNote),
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
            setDraftOpen(false);
            setDraft(null);
            setDraftNote(null);
            // L'ATTERRISSAGE EST LE PLAN, jamais `/app/today`.
            navigate("/app/plan", { replace: true });
          }}
        />
      </div>
    </FunnelShell>
  );
}

/**
 * LE CHROME DE L'ENTRÉE — ET IL N'A PAS DE NAVIGATION.
 *
 * ── POURQUOI PAS `KeelAppShell` ────────────────────────────────────────────
 * Elle rend les huit onglets de l'app élève et la barre du bas sur téléphone.
 * Sur cet écran-là, chacun est une porte vers un écran VIDE: quelqu'un qui n'a
 * pas encore de plan n'a rien à voir sur `/app/today`, `/app/plan` ou
 * `/app/progress`. Mesuré en vrai: on quitte l'entrée par curiosité, on tombe
 * sur du vide, et on juge le produit là-dessus.
 *
 * ── LA MARQUE N'EST PAS UN LIEN ────────────────────────────────────────────
 * Partout ailleurs le mot-symbole ramène à l'accueil. Ici il ne ramène nulle
 * part: c'est le dernier lien qui restait, et un couloir avec une porte est un
 * couloir qu'on quitte.
 *
 * ── CE QUI RESTE CLIQUABLE, ET C'EST DÉLIBÉRÉ ──────────────────────────────
 * Le sélecteur de langue. Il ne fait pas sortir (il recharge la même page), et
 * quelqu'un qui ne lit pas l'anglais doit pouvoir répondre à des questions dont
 * dépend ce qu'il va manger. La vraie sortie — se déconnecter — reste
 * disponible sur `/account`, et elle ne s'atteint pas par accident.
 */
function FunnelShell({ children }: { children: React.ReactNode }) {
  return (
    // ── LE FOND EST `paper`, ET C'ÉTAIT `bg-white`: UN DÉFAUT MESURÉ ───────
    // Le blanc pur est le seul neutre que la charte refuse (aucune
    // température). Sous les cartes du kit, qui sont en `paper` (#FBF8FA), il
    // inversait le rapport: mesuré au navigateur le 2026-08-13, l'INTÉRIEUR
    // des cartes était plus chaud que la page qui les portait, donc chaque
    // carte se lisait comme un creux et non comme une pièce posée.
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4">
          {/* L'ÉQUERRE SUR LE MOT-SYMBOLE, comme dans `PublicHeader`: elle
              « marque l'origine de ce qui est spécifié » (charte §4), et le nom
              de la marque en est une. Il y a un mot à sa droite — c'est la
              condition, et elle est tenue.
              ⚠️ PAS de `px-*` sur ce nœud: `.eq` pose `padding-left: 1.125rem`
              hors de toute couche CSS et bat un utilitaire de même
              spécificité. Le `px-4` vit sur le parent.
              `text-xl` = 20px, le PLANCHER de Young Serif — en dessous, c'est
              Public Sans (charte §3). `PublicHeader` la pose à 18px et
              `PublicFooter` à 14px: les deux sont sous le plancher, signalé. */}
          <span className="eq shrink-0 font-display text-lg leading-none text-ink">
            {t("brand.wordmark")}
          </span>
          <LocaleSwitch />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {/* LE MÊME `h1` QUE LE KIT, ET C'EST LE POINT: `font-display text-title`
            est ce que rend `ui/Page.tsx#PageHeader` sur les seize écrans, et ce
            que rendent `/start` et `/auth`. Cet écran-ci ne peut pas employer
            `PageHeader` — il n'a ni la coque ni la nav de l'app — mais le
            premier écran du produit ne doit pas être le seul dont le titre
            n'est pas de la maison.
            ⛔ AUCUNE GRAISSE ICI (c'était `text-2xl font-semibold`): Young Serif
            n'a qu'une graisse, le navigateur la simulerait en épaississant les
            contours. La hiérarchie se fait à la taille et à l'espace. */}
        <h1 className="text-balance font-display text-title text-ink">{t("setup.title")}</h1>
        <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-ink-soft">
          {t("setup.subtitle")}
        </p>
        {/* LE TRAIT QUI FERME LE BLOC D'IDENTITÉ. La direction est « la fiche
            technique » (charte §1): une fiche a une tête — qui elle concerne —
            puis un trait, puis ses champs. Le compte d'étapes se lit juste en
            dessous, au cran `text-label`, comme la référence d'un document. */}
        <div className="mt-8 border-t border-line pt-8">{children}</div>
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 1
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ EXPORTÉ POUR ÊTRE RENDU, pas pour être réutilisé ailleurs — même raison
 * que `MouthsStep`: `SetupPage` entier ne se monte pas sous
 * `renderToStaticMarkup`, et ce qui doit être prouvé ici est ce que la tuile
 * « Juste moi » DIT et FAIT selon qu'il reste ou non quelqu'un à table. Voir
 * `pages/setupSituateStep.int.test.ts`.
 */
export function SituateStep({
  current,
  hasHousehold,
  hasOtherMouths,
  isOwner,
  busy,
  onChoose,
  dissolve,
}: {
  current: number | null;
  hasHousehold: boolean;
  /**
   * RESTE-T-IL QUELQU'UN D'AUTRE À TABLE ? REQUIS — jamais optionnel: c'est
   * cette réponse-là qui décide si « Juste moi » est un choix ou une
   * destruction, et un paramètre de garde facultatif est une garde désarmée.
   */
  hasOtherMouths: boolean;
  isOwner: boolean;
  busy: boolean;
  onChoose: (mouths: number) => void;
  /** La défaite du foyer, armée ou non. REQUIS, même raison. */
  dissolve: { armed: boolean; onConfirm: () => void; onCancel: () => void };
}) {
  // UN SECONDAIRE N'A PAS CETTE QUESTION À RÉPONDRE. Quelqu'un d'autre gouverne
  // la table, et lui proposer trois cartes serait promettre un geste que la
  // base refusera (`not_owner`). On dit l'état, on ne demande rien.
  if (!isOwner) {
    return (
      <Card>
        <SectionLabel>{t("setup.situate.title")}</SectionLabel>
        <p className="mt-2 text-sm text-ink-soft">{t("setup.situate.member")}</p>
      </Card>
    );
  }
  const branch = branchForMouths(current);
  const options: Array<{ mouths: number; key: FunnelBranch; title: string; hint: string }> = [
    { mouths: 1, key: "solo", title: t("setup.situate.solo"), hint: t("setup.situate.solo_hint") },
    { mouths: 2, key: "pair", title: t("setup.situate.pair"), hint: t("setup.situate.pair_hint") },
    { mouths: 3, key: "family", title: t("setup.situate.family"), hint: t("setup.situate.family_hint") },
  ];
  return (
    <Card>
      <SectionLabel>{t("setup.situate.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.situate.hint")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          // ── ⚠️ « JUSTE MOI » NE SE DÉSARME PLUS QUE S'IL RESTE QUELQU'UN ──
          //
          // Cette ligne disait `option.mouths === 1 && hasHousehold`, et son
          // commentaire justifiait le verrou ainsi: « cet écran ne supprime pas
          // un foyer — ce serait effacer des bouches, leurs allergies et leurs
          // portions sur un clic d'entonnoir. Le geste existe, il vit sur
          // /app/household, où il porte son avertissement. »
          //
          // ⛔ LA SECONDE PHRASE ÉTAIT FAUSSE, ET C'EST ELLE QUI A FAIT LE MUR.
          // `/app/household` ne sait retirer que des MEMBRES;
          // `keel_household_remove_member` refuse le maître
          // (`cannot_remove_owner`); rien nulle part ne défaisait un foyer.
          // Répondre « on est deux » à cette question était donc irréversible
          // dans tout le produit — et l'étape 2 retient ensuite sur
          // `missing_mouths`. Signalé sur un compte réel le 2026-08-19:
          // « je ne peux même pas la retirer et faire continuer ».
          //
          // La PREMIÈRE phrase, elle, est juste — et elle porte exactement sa
          // condition: on efface des bouches QUAND IL Y EN A. Le verrou tient
          // donc tant qu'il en reste une, et il le DIT sous la grille; quand le
          // maître est seul, il n'y a plus rien à effacer que sa propre ligne,
          // et le geste s'ouvre derrière une confirmation qui la nomme.
          const locked = option.mouths === 1 && hasHousehold && hasOtherMouths;
          const chosen = branch === option.key;
          return (
            <button
              key={option.key}
              type="button"
              disabled={busy || locked}
              // LE CHOIX COURANT EST DIT AUTREMENT QUE PAR LA COULEUR. Sans
              // ceci, « laquelle des trois est la mienne » ne passait que par
              // une bordure teintée: invisible à un lecteur d'écran, et seule
              // porteuse de l'information au sens de WCAG 1.4.1.
              aria-pressed={chosen}
              onClick={() => onChoose(option.mouths)}
              className={[
                // `rounded-card` (12px) et pas `rounded-xl`: le rayon RENDU est
                // le même, il porte enfin son nom — le vocabulaire du kit est
                // `part` (4px) · `card` (12px) · `fiche` (16px) · `full`
                // (boutons et pastilles), et rien d'autre.
                "rounded-card border p-4 text-left transition-colors",
                // ── POURQUOI LE LAVIS ET PAS L'APLAT DE MARQUE ──────────────
                // Une pastille choisie prend l'aplat plein (`bg-fig-700`), et
                // c'est l'idiome de la maison — voir `MealPrepPage.tsx:325`.
                // Ici la surface est une TUILE de 200px: un aplat de marque à
                // cette taille devient le bloc dominant de l'écran, et il
                // faudrait remonter le sous-titre à `fig-300` pour qu'il se
                // lise. `fig-100` est le lavis, « un remplissage qui doit se
                // lire PLEIN » (charte §5), fermé par un trait `fig-700`:
                // `ink` dessus = 13,42:1, `ink-soft` = 5,07:1.
                chosen
                  ? "border-fig-700 bg-fig-100"
                  // Le non-choisi est le geste secondaire du kit, et c'est mot
                  // pour mot la grande commande de `/auth` (`Auth.tsx:1340`) —
                  // la porte que le visiteur vient de franchir: un contour de
                  // CONTRÔLE (`line-strong`, 3,84:1 — WCAG 1.4.11 exige 3:1)
                  // sur le même papier que tout le reste. Le survol emprunte le
                  // lavis clair `fig-50`, donc il ne peut pas se confondre avec
                  // le lavis plein `fig-100` du choix retenu.
                  : "border-line-strong bg-paper",
                locked ? "cursor-not-allowed opacity-50" : "hover:bg-fig-50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-ink">
                {option.title}
              </span>
              {/* `min-w-0` n'est pas nécessaire ici (pas de flex), mais le texte
                  doit se replier à 320 px: pas de `whitespace-nowrap`. */}
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── UN REFUS QUI NE DIT PAS CE QUI LE LÈVERAIT N'EST PAS UN REFUS ────
          La tuile grisée ne portait RIEN: ni pourquoi, ni par où. C'est le mot
          d'ordre du dépôt, et c'était le seul endroit de l'entonnoir où il
          était violé sur un chemin sans issue. */}
      {hasHousehold && hasOtherMouths ? (
        <p className="mt-4 text-xs leading-5 text-ink-soft">
          {t("setup.situate.solo_locked")}
        </p>
      ) : null}

      {/* LA DÉFAITE DU FOYER, EN DEUX CLICS ET AVEC SA LISTE. Même idiome que
          « Retirer » sur une bouche: un clic arme, le second exécute, et le
          libellé change entre les deux. Ce qui part est NOMMÉ — la ligne de
          bouche du maître et ce qui y est clé —, et ce qui reste aussi: son
          profil et sa direction ne bougent pas, c'est ce qui rend le retour au
          solo non destructeur pour la personne elle-même. */}
      {dissolve.armed ? (
        <div className="mt-4 rounded-card border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs leading-5 text-amber-900">
            {t("setup.situate.dissolve_confirm")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={dissolve.onConfirm}
            >
              {t("setup.situate.dissolve_do")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={dissolve.onCancel}
            >
              {t("setup.situate.dissolve_cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ② L'ACTIVITÉ EN DEUX AXES — DEUX GRILLES, TROIS ENDROITS, UN SEUL RENDU
// ───────────────────────────────────────────────────────────────────────────
//
// ⛔ CE QUI A REMPLACÉ QUOI, ET POURQUOI (2026-08-20, soir). Les quatre crans
// d'`ACTIVITY_KEYS` — gardés juste en dessous, et NON rendus — mélangeaient
// deux axes: les deux premiers décrivent une JOURNÉE, les deux derniers un
// SPORT. Quelqu'un d'assis qui court deux fois par semaine ne pouvait dire que
// l'un des deux: il cochait « Sport 2 à 3 fois » et héritait de PAL 1,80, quand
// le croisement vaut ~1,60. **239 kcal/jour fabriqués par la forme de la
// question**, et ils traversaient toute la chaîne avec l'autorité d'une mesure.
//
// ⚠️ `ACTIVITY_KEYS` ET `ActivityTiles` RESTENT DANS CE FICHIER, SANS APPELANT
// D'ÉCRAN, ET C'EST DÉLIBÉRÉ — mais ce n'est pas gratuit non plus. Le cran
// d'avant reste le REPLI NOMMÉ de toute fiche qui n'a répondu qu'à lui
// (`activityFactorOf`, source `legacy`), donc son vocabulaire doit rester lisible
// à côté du neuf. Le jour où plus aucune fiche ne porte de `legacy`, les deux
// partent ensemble.

/**
 * ② LE PREMIER AXE — la journée, sport EXCLU. `Record` complet: un cran ajouté
 * sans ses mots ne compile pas.
 */
const DAY_ACTIVITY_KEYS: Record<
  DayActivityLevel,
  { label: MessageKey; hint: MessageKey }
> = {
  seated: {
    label: "setup.day_activity.seated",
    hint: "setup.day_activity.seated_hint",
  },
  on_feet: {
    label: "setup.day_activity.on_feet",
    hint: "setup.day_activity.on_feet_hint",
  },
  physical_job: {
    label: "setup.day_activity.physical_job",
    hint: "setup.day_activity.physical_job_hint",
  },
};

/**
 * ② LE SECOND AXE — les séances par semaine, journée EXCLUE.
 *
 * ⚠️ `none` EST UNE TUILE, ET CE N'EST PAS UN « JE NE SAIS PAS ». « Je ne fais
 * pas de sport » est une RÉPONSE, et elle pèse: elle fait descendre le PAL au
 * bas de la bande sédentaire. C'est `null` — aucune tuile cochée — qui veut
 * dire « pas répondu », et il n'a pas de tuile, exprès.
 */
const SPORT_KEYS: Record<
  SportFrequency,
  { label: MessageKey; hint: MessageKey }
> = {
  none: { label: "setup.sport.none", hint: "setup.sport.none_hint" },
  "1_2": { label: "setup.sport.1_2", hint: "setup.sport.1_2_hint" },
  "3_4": { label: "setup.sport.3_4", hint: "setup.sport.3_4_hint" },
  "5_plus": { label: "setup.sport.5_plus", hint: "setup.sport.5_plus_hint" },
};

/**
 * LES DEUX GRILLES, RENDUES PAR LE MÊME COMPOSANT.
 *
 * ⛔ UN SEUL RENDU POUR LES DEUX AXES, ET POUR LES TROIS ENDROITS. Deux grilles
 * de tuiles recopiées divergeraient au premier ajustement, et c'est celle qu'on
 * regarde le moins qui garderait l'ancienne. C'est mot pour mot la raison
 * écrite au-dessus d'`ActivityTiles`, appliquée à son remplaçant.
 */
function TokenTiles<T extends string>(props: {
  label: MessageKey;
  /** `null` = aucune aide sous la grille. Voir `ActivityTiles`. */
  hint: MessageKey | null;
  tokens: readonly T[];
  keys: Record<T, { label: MessageKey; hint: MessageKey }>;
  /** `null` = personne n'a répondu. Aucune tuile n'est alors marquée. */
  value: T | null;
  onChange: (next: T) => void;
  busy: boolean;
  /** Préfixe d'`id` — plusieurs grilles coexistent sur le même écran. */
  idPrefix: string;
}) {
  return (
    <Field
      label={t(props.label)}
      hint={props.hint === null ? undefined : t(props.hint)}
    >
      {/* Deux colonnes et pas quatre: à quatre, chaque tuile tombe sous 80 px
          au format de la carte et l'aide se casse en cinq lignes. Une seule
          colonne à 320 px — pas de `whitespace-nowrap`, le texte se replie. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {props.tokens.map((token) => {
          const chosen = props.value === token;
          return (
            <button
              key={token}
              id={`${props.idPrefix}-${token}`}
              type="button"
              disabled={props.busy}
              aria-pressed={chosen}
              onClick={() => props.onChange(token)}
              className={[
                "rounded-card border p-3 text-left transition-colors",
                chosen
                  ? "border-fig-700 bg-fig-100"
                  : "border-line-strong bg-paper hover:bg-fig-50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-ink">
                {t(props.keys[token].label)}
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {t(props.keys[token].hint)}
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/**
 * LES DEUX AXES, ENSEMBLE — parce qu'ils se répondent ensemble ou pas du tout.
 *
 * ⛔ `activityFactorOf` N'APPLIQUE LE CROISEMENT QUE SI LES DEUX SONT LÀ. Un
 * seul axe retombe sur le cran d'avant (`partial`), parce qu'une journée sans
 * sport déclaré n'est PAS une journée sans sport — compléter l'axe manquant
 * serait inventer une réponse que personne n'a donnée. Les rendre côte à côte,
 * dans un seul composant, est ce qui rend improbable qu'un écran n'en pose
 * qu'un.
 */
function ActivityAxesTiles(props: {
  ownVoice: boolean;
  day: DayActivityLevel | null;
  sport: SportFrequency | null;
  onDay: (next: DayActivityLevel) => void;
  onSport: (next: SportFrequency) => void;
  busy: boolean;
  idPrefix: string;
}) {
  return (
    <>
      <TokenTiles
        label={props.ownVoice
          ? "setup.day_activity.label"
          : "setup.day_activity.member_label"}
        // ⟳ 2026-09-01 — LA PROP `hint` A ÉTÉ RETIRÉE, PAS MISE À `null`.
        // Les trois sites de montage passaient déjà `null` (deux depuis le
        // 2026-08-19, le troisième depuis aujourd'hui): un paramètre dont
        // aucun appelant ne fait varier la valeur est un paramètre qui ment
        // sur ce qui est réglable. Les clés `setup.day_activity.hint` et
        // `setup.sport.hint` sont parties avec — un catalogue mort se traduit
        // et se relit comme un catalogue vivant.
        hint={null}
        tokens={DAY_ACTIVITY_LEVELS}
        keys={DAY_ACTIVITY_KEYS}
        value={props.day}
        onChange={props.onDay}
        busy={props.busy}
        idPrefix={`${props.idPrefix}-day`}
      />
      <TokenTiles
        label={props.ownVoice ? "setup.sport.label" : "setup.sport.member_label"}
        hint={null}
        tokens={SPORT_FREQUENCIES}
        keys={SPORT_KEYS}
        value={props.sport}
        onChange={props.onSport}
        busy={props.busy}
        idPrefix={`${props.idPrefix}-sport`}
      />
    </>
  );
}

/** Le libellé court et l'aide d'un cran. `Record` complet: un cran ajouté sans
 *  ses mots ne compile pas — la même garde que `GOAL_KEYS` au-dessus. */
const ACTIVITY_KEYS: Record<ActivityLevel, { label: MessageKey; hint: MessageKey }> = {
  sedentary: { label: "setup.activity.sedentary", hint: "setup.activity.sedentary_hint" },
  on_feet: { label: "setup.activity.on_feet", hint: "setup.activity.on_feet_hint" },
  trains_some: {
    label: "setup.activity.trains_some",
    hint: "setup.activity.trains_some_hint",
  },
  trains_hard: {
    label: "setup.activity.trains_hard",
    hint: "setup.activity.trains_hard_hint",
  },
};

/**
 * LES QUATRE CRANS D'ACTIVITÉ — ET IL N'Y EN A QUE QUATRE.
 *
 * ⛔ NE PAS AJOUTER UNE CINQUIÈME TUILE « JE NE SAIS PAS ». Ne rien cocher EST
 * la non-réponse: `null` traverse jusqu'à `meal_envelope.ts`, qui rend alors
 * l'hypothèse 1,5 — exactement le comportement d'avant ce lot. Un jeton
 * d'ignorance ferait de l'ignorance une RÉPONSE, et une réponse se met à peser
 * dans un calcul d'énergie (`tokens.ts`, le paragraphe qui refuse ce jeton).
 *
 * ⛔ ET JAMAIS UN CHAMP NUMÉRIQUE. Ni PAL, ni heures de sport par semaine: « un
 * nombre demandé à l'utilisateur est un nombre qu'il invente, et l'inventé
 * entre ensuite dans un calcul avec l'autorité d'une mesure ». Un cran se
 * reconnaît, et il porte sa propre imprécision.
 *
 * ── POURQUOI UN SEUL COMPOSANT POUR TROIS ENDROITS ────────────────────────
 * Il est monté par `SelfStep` (moi), par le formulaire d'ajout de `MouthsStep`
 * (une bouche neuve) et par `MouthRow` (une bouche déjà en base, à la reprise).
 * Les trois écrivent la MÊME colonne à travers la MÊME RPC tout-ou-rien: trois
 * grilles de tuiles recopiées divergeraient au premier ajustement, et c'est
 * celle qu'on regarde le moins qui garderait l'ancienne liste.
 *
 * Le rendu est celui des cartes de l'étape 1 (`SituateStep`), au mot près —
 * lavis `fig-100` fermé par `fig-700` pour le choix retenu, contour de contrôle
 * `line-strong` pour les autres, `aria-pressed` parce que la couleur ne peut
 * pas être la seule porteuse de l'information (WCAG 1.4.1).
 */
// ⚠️ SANS APPELANT D'ÉCRAN, ET C'EST DÉLIBÉRÉ: voir le bloc au-dessus
// d'`ACTIVITY_KEYS`. Le cran d'avant reste le repli NOMMÉ de toute fiche qui
// n'a répondu qu'à lui (`activityFactorOf`, source `legacy`), donc son
// vocabulaire doit rester lisible à côté du neuf. Le jour où plus aucune fiche
// ne porte de `legacy`, `ACTIVITY_KEYS`, ce composant et cette dérogation
// partent ENSEMBLE.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ActivityTiles(props: {
  label: MessageKey;
  /**
   * L'AIDE SOUS LES TUILES, ou `null` pour ne rien mettre.
   *
   * ⚠️ `null` EXPLICITE, JAMAIS UNE CHAÎNE VIDE. Vider la clé dans le catalogue
   * a été essayé le 2026-08-19 et la garde de parité l'a refusé, à raison: deux
   * catalogues avec la même valeur vide sont indiscernables d'une traduction
   * oubliée. L'absence d'aide est une décision d'ÉCRAN, elle se dit ici.
   */
  hint: MessageKey | null;
  /** `null` = personne n'a répondu. Aucune tuile n'est alors marquée. */
  value: ActivityLevel | null;
  onChange: (next: ActivityLevel) => void;
  busy: boolean;
  /** Préfixe d'`id` — trois grilles peuvent coexister sur le même écran. */
  idPrefix: string;
}) {
  return (
    <Field
      label={t(props.label)}
      hint={props.hint === null ? undefined : t(props.hint)}
    >
      {/* Deux colonnes et pas quatre: à quatre, chaque tuile tombe sous 80 px
          au format de la carte et l'aide se casse en cinq lignes. Une seule
          colonne à 320 px — pas de `whitespace-nowrap`, le texte se replie. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIVITY_LEVELS.map((level) => {
          const chosen = props.value === level;
          return (
            <button
              key={level}
              id={`${props.idPrefix}-activity-${level}`}
              type="button"
              disabled={props.busy}
              aria-pressed={chosen}
              onClick={() => props.onChange(level)}
              className={[
                "rounded-card border p-3 text-left transition-colors",
                chosen
                  ? "border-fig-700 bg-fig-100"
                  : "border-line-strong bg-paper hover:bg-fig-50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-ink">
                {t(ACTIVITY_KEYS[level].label)}
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {t(ACTIVITY_KEYS[level].hint)}
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 2 — MOI
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ EXPORTÉ POUR ÊTRE RENDU PAR UN TEST, pas pour être réutilisé ailleurs —
 * même raison que `MouthsStep` juste en dessous. C'est ICI que se joue le
 * défaut rapporté le 2026-08-18 (« je choisis Perdre du poids et rien
 * n'apparaît »), et un test de SOURCE serait resté vert dessus: le montage
 * fautif se trouvait deux écrans plus loin, dans un fichier qui contenait bien
 * le mot `TargetAndPaceFields`. Voir `pages/setupSelfStepTarget.int.test.ts`.
 */
export function SelfStep(props: {
  draft: SelfDraft;
  onChange: React.Dispatch<React.SetStateAction<SelfDraft | null>>;
  branch: FunnelBranch;
  /** `null` en solo: « Continue » fait déjà tout, et deux boutons mentiraient. */
  onSave: (() => void) | null;
  busy: boolean;
  /**
   * SON POIDS VISÉ ET SON RYTHME — `null` = LA LECTURE N'A PAS EU LIEU.
   *
   * ⚠️ REQUIS, JAMAIS OPTIONNEL. Ces deux valeurs existent peut-être déjà en
   * base (`/app/household` et `/app/plan` les écrivent): un formulaire figé sur
   * du vide NON LU les écraserait au « Continuer ». Et un `?` en ferait une
   * prop qu'on oublie de passer — c'est exactement ce qui vient d'arriver à ces
   * deux champs, montés sur l'étape du planning au lieu de celle-ci.
   */
  target: null | {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
  };
  /**
   * LE GESTE QUI OUVRE LES PRÉFÉRENCES — `null` tant que la lecture n'a pas eu
   * lieu, et REQUIS dans les deux cas.
   *
   * ⚠️ C'EST LA SEULE PORTE VERS LES ALLERGIES depuis le 2026-08-18. Les rendre
   * inatteignables serait pire que de les avoir laissées en ligne: `canGenerate`
   * réclame la réponse, et l'écran n'offrirait aucun champ pour la donner.
   */
  onOpenPreferences: (() => void) | null;
}) {
  const { draft, onChange, branch, onSave, busy, target } = props;
  // ⚠️ MISE À JOUR FONCTIONNELLE, ET CE N'EST PAS UN TIC DE STYLE. Un
  // `onChange({ ...draft, ...patch })` fusionne depuis le `draft` de LA
  // FERMETURE, c'est-à-dire l'état du dernier rendu. React groupe les mises à
  // jour d'un même tick: deux réponses cochées coup sur coup partent alors du
  // MÊME état de départ, et la seconde efface la première. Mesuré sur cet
  // écran le 2026-08-12 — trois moments de repas cochés d'affilée n'en
  // laissaient qu'un, et rien ne le signalait.
  const set = (patch: Partial<SelfDraft>) =>
    onChange((prev) => (prev === null ? prev : { ...prev, ...patch }));
  return (
    <Card>
      <SectionLabel>{t("setup.people.title")}</SectionLabel>
      {/* ⛔ « Toi aussi, tu manges ici. Tu es la première place à table, pas
          la personne qui la tient. » RETIRÉ LE 2026-08-19. Elle expliquait
          le MODÈLE (le titulaire est une bouche comme les autres) à
          quelqu'un qui remplit un formulaire. Le modèle est déjà rendu par
          la structure de l'écran — sa carte est la première d'une liste de
          cartes identiques —, et une phrase qui explique ce que la mise en
          page dit déjà est du bruit. */}

      <div className="mt-4 space-y-4">
        {/* LE PRÉNOM N'EST DEMANDÉ QUE S'IL Y A UN FOYER — rien, dans le chemin
            individuel, ne lit le prénom du mangeur. Voir `FUNNEL_QUESTIONS`. */}
        {branch !== "solo" ? (
          <Field
            label={t("setup.people.first_name")}
            htmlFor="setup-first-name"
          >
            <input
              id="setup-first-name"
              type="text"
              maxLength={40}
              value={draft.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              className={inputClass}
            />
          </Field>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════
            LA DISPOSITION DE CETTE CARTE — 2026-09-01
            ══════════════════════════════════════════════════════════════

            Deux paires, puis l'objectif, puis les journées. Demandé à l'écran,
            et l'ordre raconte quelque chose: d'abord CE QU'EST ce corps
            (naissance, sexe, taille, poids), ensuite CE QU'IL VISE, ensuite CE
            QU'IL FAIT de ses journées.

            ⟳ CE QUI A BOUGÉ, ET CE QUE ÇA COÛTE ──────────────────────────
            Le sexe était seul, sous les journées: il rejoint la naissance. Le
            poids était seul, sous la taille: ils font paire. Et
            `ActivityAxesTiles` DESCEND sous l'objectif.

            ⛔ CETTE DERNIÈRE ROMPT UNE ADJACENCE QUI ÉTAIT ARGUMENTÉE, et son
            commentaire est réécrit plutôt que laissé à contredire le code.
            L'activité était « à côté de la taille et du poids parce que c'est
            la TROISIÈME ENTRÉE DE LA MÊME ÉQUATION »: le corps dit combien on
            pèse, l'activité ce qu'on en fait, et `meal_envelope.ts` multiplie
            les deux. C'est toujours vrai du CALCUL — ce n'est plus l'ordre de
            la LECTURE, et l'écart entre les deux extrêmes de l'activité
            (38 % de l'enveloppe) n'a pas bougé d'un point pour autant.

            ⚠️ CE QUI NE CHANGE PAS, ET IL NE FAUT PAS Y TOUCHER:
              · le corps reste AU-DESSUS de la direction — le curseur de
                `TargetAndPaceFields` est borné par lui, et sans corps il ne
                rend qu'un `needs_body`;
              · le poids visé reste COLLÉ à la direction qui le débloque.
                Décision du 2026-08-18, mesurée à l'écran: « je choisis Perdre
                du poids et rien n'apparaît ». */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("setup.people.birth_date")}
            htmlFor="setup-birth-date"
          >
            <input
              id="setup-birth-date"
              type="date"
              value={draft.birthDate}
              max={browserLocalDate()}
              onChange={(e) => set({ birthDate: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={t("setup.people.gender")} htmlFor="setup-gender">
            <select
              id="setup-gender"
              value={draft.gender}
              onChange={(e) => set({ gender: e.target.value as MemberGender })}
              className={inputClass}
            >
              <option value="">—</option>
              {MEMBER_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {t(`household.body.gender_${g}` as "household.body.gender_female")}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("setup.people.height")}
            htmlFor="setup-height"
          >
            <input
              id="setup-height"
              type="number"
              inputMode="numeric"
              min={90}
              max={250}
              value={draft.heightCm}
              onChange={(e) => set({ heightCm: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("setup.people.weight")}
            htmlFor="setup-weight"
          >
            <input
              id="setup-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={25}
              max={400}
              value={draft.weightKg}
              onChange={(e) => set({ weightKg: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        {/* ── TROIS TUILES, AUCUNE PRÉ-SÉLECTION (chantier P3, 2026-09-03) ──
            L'option vide « — » est partie avec les quatre autres `<select>`
            du dépôt: elle se lisait comme une quatrième direction. L'`id` du
            groupe garde le nom du champ d'avant, parce que c'est lui que le
            harnais de cette carte mesure pour l'ORDRE (corps, puis direction,
            puis cible). */}
        <Field label={t("setup.people.goal")} htmlFor="setup-goal">
          <GoalTiles
            id="setup-goal"
            name="setup-goal"
            ariaLabel={t("setup.people.goal")}
            value={draft.goal}
            ageState={ageStateOfTypedDate(draft.birthDate, "unknown", browserLocalDate())}
            labelOf={goalLabel}
            onChange={(g) => set({ goal: g })}
          />
        </Field>

        {/* ── OÙ VA LA BALANCE, ET À QUELLE VITESSE — JUSTE SOUS LA DIRECTION
            Décision de l'utilisateur, mot pour mot (2026-08-18): « quand
            quelqu'un renseigne qu'il veut perdre ou gagner du poids, alors se
            débloquent deux choses: le poids visé, et le curseur pour dire
            combien par semaine ».

            ⚠️ ILS ÉTAIENT MONTÉS DEUX ÉCRANS PLUS LOIN, sur l'étape du
            planning, et cet écran-ci — celui où l'on choisit justement sa
            direction — n'en portait AUCUN. Mesuré à l'écran par l'utilisateur:
            « je choisis Perdre du poids et rien n'apparaît ». Un champ qui
            n'est pas sous la question qui le débloque est un champ absent.

            ⚠️ ET LE CORPS EST DEMANDÉ AU-DESSUS, dans cette même carte: taille,
            poids et sexe précèdent la direction. C'est ce qui rend le curseur
            possible — son plafond est BORNÉ par ce corps —, et quand il manque
            quand même, `TargetAndPaceFields` le DIT (`needs_body`) plutôt que
            de laisser un blanc. Ne pas redescendre le corps sous la direction:
            un curseur muet se lit comme une fonctionnalité absente, et c'est le
            défaut que `MOUTH_FORM_BLOCKS` a déjà payé une fois.

            `null` = la cible n'a pas encore été lue ⇒ AUCUN champ. Voir la
            prop. */}
        {target !== null ? (
          <TargetAndPaceFields
            // Pliée à l'âge: sous une direction repliée, rien ne se déplie.
            draft={foldMinorGoal(target.draft, target.todayLocalIso).draft}
            onChange={target.onChange}
            todayLocalIso={target.todayLocalIso}
            // ⚠️ PRÉFIXE PROPRE À CETTE CARTE. La bouche qu'on ajoute porte les
            // deux mêmes contrôles PLUS BAS SUR LA MÊME PAGE: sans préfixes
            // distincts, deux `id` identiques feraient qu'un libellé désigne le
            // contrôle de quelqu'un d'autre.
            idPrefix="setup-self"
            // C'EST MA CARTE: la voix est « tu », et `who` ne sert donc jamais.
            voice="self"
            who=""
          />
        ) : null}

        {/* L'ACTIVITÉ, À CÔTÉ DE LA TAILLE ET DU POIDS — parce que c'est la
            TROISIÈME ENTRÉE DE LA MÊME ÉQUATION, pas une préférence. Le corps
            dit combien on pèse, l'activité dit ce qu'on en fait, et
            `meal_envelope.ts` multiplie les deux. La ranger ailleurs (ou
            « plus tard ») en ferait une option, et l'écart entre ses deux
            extrêmes est de 38 % de l'enveloppe.

            ⛔ DEUX GRILLES DEPUIS LE 2026-08-20, ET PLUS UNE. Les quatre crans
            mélangeaient la journée et le sport, et forçaient à n'en dire qu'un:
            239 kcal/jour fabriqués par la forme de la question. Voir
            `ActivityAxesTiles`. */}
        <ActivityAxesTiles
          ownVoice
          day={draft.dayActivity}
          sport={draft.sportFrequency}
          onDay={(next) => set({ dayActivity: next })}
          onSport={(next) => set({ sportFrequency: next })}
          busy={busy}
          idPrefix="setup-self"
        />

        {/* ⚠️ LE RÉGIME A DÉMÉNAGÉ À L'ÉTAPE 3 (« comment on mange »), et
            l'ordre d'origine EST CASSÉ PAR CE DÉPLACEMENT. Le commentaire
            d'ici disait: « le régime avant les allergies — l'ordre évite de
            cocher poisson sous allergie quand la vraie réponse est je suis
            végétarien ». Les allergies restent sur CETTE étape, le régime est
            désormais sur la suivante: quelqu'un peut donc déclarer une
            allergie au poisson avant d'avoir pu dire qu'il est végétarien.
            Arbitrage assumé, demandé à l'écran le 2026-08-14 — l'étape 2 dit
            QUI sont les gens, l'étape 3 dit COMMENT ils mangent, et poser la
            même question à deux endroits selon la personne était pire. */}

        {/* ── ⛔ ICI SE TENAIENT LES ALLERGIES, EN LIGNE ────────────────────
            Retirées le 2026-08-18, sur la décision de l'utilisateur: « le
            reste — allergies, habitudes, ce qu'on n'aime pas, le shaker —
            dans une pop-up accessible depuis "Renseigner ses préférences
            alimentaires" ».

            ⚠️ ET IL N'EN RESTE AUCUN AILLEURS SUR CET ÉCRAN. Le formulaire
            d'ajout et chaque ligne de bouche portaient le leur; les trois
            passent par la MÊME fenêtre. Un champ d'allergie resté en ligne
            pendant que la fenêtre en porte un autre, ce sont deux formulaires
            sur la même colonne — le défaut qu'on vient de refermer, pas un
            détail de mise en page.

            ⚠️ CE QUI STRUCTURE LE PLAN RESTE EN LIGNE, ce qui l'affine passe
            derrière le bouton. Une allergie affine: elle écarte des aliments
            d'un plan dont la FORME est déjà décidée par le corps, la direction
            et le rythme — tous au-dessus, sans clic. */}
        {props.onOpenPreferences !== null && target !== null ? (
          <MouthPreferencesButton
            draft={target.draft}
            busy={busy}
            onOpen={props.onOpenPreferences}
            voice="self"
            who=""
          />
        ) : null}

        {onSave ? (
          <Button variant="secondary" disabled={busy} onClick={onSave}>
            {t("household.member.save")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 2b — LES AUTRES BOUCHES
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ EXPORTÉ POUR ÊTRE RENDU, pas pour être réutilisé ailleurs.
 *
 * `SetupPage` entier ne se monte pas sous `renderToStaticMarkup` (session,
 * routeur, deux appels modèle), et ce qui doit être prouvé ici est le CONTENU
 * du formulaire d'ajout — qu'il ne demande plus « adulte ou enfant », et qu'il
 * propose les trois directions. Un test de source aurait dit la même chose sur
 * du texte; ce dépôt a déjà vu des tests de source rester verts sur du code
 * mort. Voir `pages/setupMouthsStep.int.test.ts`.
 */
export function MouthsStep(props: {
  mouths: FunnelMouth[];
  /** Plafond de LA BRANCHE: solo 0, couple 1, famille 7. */
  maxOthers: number;
  draft: MouthDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<MouthDraft>>;
  onAdd: () => void;
  /**
   * La phrase qui retient, ou `null`. REQUISE — jamais optionnelle: un
   * paramètre de garde facultatif est une garde désarmée, et celle-ci est la
   * seule chose qui relie le refus au bouton qui le lève.
   */
  held: string | null;
  /** Le refus d'un geste de cette carte, ou `null`. REQUIS, même raison. */
  failure: string | null;
  /**
   * LE PRÉNOM QUE « CONTINUER » VIENT D'ENREGISTRER, ou `null`. REQUIS — et
   * pour la même raison que les deux au-dessus: c'est la seule chose qui dise
   * qu'un bouton d'AVANCEMENT a créé quelqu'un. Le rendre facultatif le
   * laisserait non passé, et l'ajout redeviendrait muet sans que rien ne casse.
   */
  added: string | null;
  /**
   * Vide le brouillon ET REFERME la fiche. REQUIS: sans lui, une fiche ouverte
   * est un cul-de-sac — c'est le « Retirer » demandé le 2026-08-19.
   */
  onDiscard: () => void;
  /**
   * LA FICHE D'AJOUT EST-ELLE DÉPLIÉE ? REQUIS — jamais optionnel: non passé,
   * il vaudrait `undefined`, la fiche serait toujours repliée, et le bouton
   * d'ajout n'ouvrirait rien. Une garde facultative est une garde désarmée.
   */
  formOpen: boolean;
  /** La déplie. REQUIS, même raison: c'est la seule porte d'entrée. */
  onOpenForm: () => void;
  onGoal: (mouth: FunnelMouth, goal: MemberGoal) => void;
  onBirthDate: (mouth: FunnelMouth, date: string) => void;
  onAllergyAnswer: (mouth: FunnelMouth, labels: string[]) => void;
  /** Ouvre la fenêtre sur le brouillon d'AJOUT. REQUIS — seule porte. */
  onOpenDraftPreferences: () => void;
  /** Ouvre la fenêtre sur une bouche DÉJÀ inscrite. REQUIS, même raison. */
  onOpenMouthPreferences: (mouth: FunnelMouth) => void;
  /**
   * LE BROUILLON DE PRÉFÉRENCES D'UNE BOUCHE INSCRITE — celui qui est ouvert,
   * ou `null`. C'est lui que le récapitulatif de sa ligne rend.
   */
  mouthPrefs: { memberId: string; draft: MouthFormDraft } | null;
  /**
   * CE QUE LA BASE PORTE POUR CETTE BOUCHE, en vocabulaire de brouillon.
   *
   * ⚠️ REQUISE: sans elle, le récapitulatif retombe sur un brouillon vide et
   * annonce « rien de renseigné » à quelqu'un qui vient de tout remplir.
   */
  knownPrefs: (mouth: FunnelMouth) => MouthFormDraft;
  /** Enregistre ce brouillon-là. REQUIS: sans lui la fenêtre ne promet rien. */
  onSaveMouthPreferences: (mouth: FunnelMouth) => void;
  onBody: (
    mouth: FunnelMouth,
    heightCm: string,
    weightKg: string,
    gender: MemberGender | "",
    activityLevel: ActivityLevel | null,
    // ② Les deux axes voyagent avec le corps: une seule porte, un seul geste.
    dayActivity: DayActivityLevel | null,
    sportFrequency: SportFrequency | null,
  ) => void;
  onRemove: (mouth: FunnelMouth) => void;
  /**
   * LA CARTE EN ÉDITION, ou `null`. REQUIS — jamais optionnel: non passé, il
   * vaudrait `undefined`, aucune carte ne s'ouvrirait, et « Modifier » serait
   * un bouton mort. Une garde facultative est une garde désarmée.
   */
  editingMemberId: string | null;
  onToggleEdit: (mouth: FunnelMouth) => void;
  /** Voir `MouthRow`: un seul geste écrit tout ce qui est prêt, puis referme. */
  onSaveAndClose: (
    mouth: FunnelMouth,
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
  ) => void;
  /**
   * LES CIBLES LUES, ou `null` tant que la lecture n'a pas eu lieu. REQUIS, et
   * la garde compte double ici: `setMemberTarget` REMPLACE la paire.
   */
  targets: Map<string, MemberTargetView> | null;
  /**
   * LES DATES LUES, ou `null` tant que la lecture n'a pas eu lieu. REQUIS —
   * `undefined` ferait taire la garde et le champ repartirait vide.
   */
  birthDates: Map<string, string> | null;
  onTarget: (
    mouth: FunnelMouth,
    targetWeightKg: string,
    paceKgPerWeek: string,
  ) => void;
  confirmRemove: string | null;
  onConfirmRemove: (memberId: string | null) => void;
  inviteFor: string | null;
  onInviteFor: (memberId: string | null) => void;
  inviteEmail: string;
  onInviteEmail: (value: string) => void;
  onInvite: (mouth: FunnelMouth) => void;
  invite: { memberId: string; token: string; firstName: string } | null;
  busy: boolean;
}) {
  const draft = props.draft;
  // ── ⛔ ICI SE TENAIT `set`, LE POSEUR DE CHAMP DE CETTE CARTE ─────────────
  // Il écrivait le brouillon champ par champ pour les dix contrôles recopiés
  // à la main. `MouthCoreFields` reçoit maintenant `onDraftChange` DIRECTEMENT
  // et pose ses propres champs — avec sa propre mise à jour fonctionnelle, pour
  // la même raison qu'ici: React groupe les mises à jour d'un même tick, et deux
  // champs touchés coup sur coup partiraient sinon du même état de départ.
  const householdFull = props.mouths.length + 1 >= HOUSEHOLD_MAX_MOUTHS;
  const branchFull = props.mouths.length >= props.maxOthers;
  /**
   * LA FICHE EST-ELLE DÉPLIÉE ?
   *
   * ⚠️ « OU LE BROUILLON A DU CONTENU » N'EST PAS UNE COMMODITÉ, C'EST LA
   * GARDE. Le brouillon survit à des gestes qui ne passent pas par ce
   * composant (« Continuer » qui échoue, une reprise d'étape, un refus
   * d'ajout): sans ce second membre, une fiche déjà remplie pourrait se
   * retrouver REPLIÉE, donc invisible — et « Continuer » l'enregistrerait
   * quand même, ce qui est très exactement le défaut qu'on referme.
   */
  const formOpen = props.formOpen || mouthDraftHasContent(draft);

  return (
    <Card>
      <SectionLabel>{t("setup.mouths.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.mouths.intro")}</p>

      {/* ── ⛔ LE REFUS EST RENDU ICI, DEHORS, ET C'EST UNE CORRECTION ───────
          Il ne vivait QUE dans l'encadré pointillé du formulaire d'ajout. Or ce
          formulaire est REPLIÉ par défaut depuis le 2026-08-19 — donc tout
          refus d'un geste de cette carte (enregistrer les préférences d'une
          bouche, retirer quelqu'un, poser un corps) tombait dans un bloc que
          personne ne voyait.
          
          C'est le mode d'échec n°1 de ce dépôt, et il a coûté une matinée: on a
          cherché pourquoi les préférences « ne s'enregistraient pas » alors que
          l'écran avait peut-être déjà dit pourquoi, dans un cadre fermé.

          ⚠️ IL RESTE AUSSI À CÔTÉ DU FORMULAIRE D'AJOUT quand celui-ci est
          ouvert: un refus d'ajout doit se lire à côté de la fiche fautive. Deux
          rendus, deux portées, pas de doublon — celui-ci ne sort que hors
          formulaire. */}
      {props.failure !== null && !formOpen ? (
        <p className="mt-4 rounded-card border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">
          {props.failure}
        </p>
      ) : null}

      {/* ── « CONTINUER » VIENT DE CRÉER QUELQU'UN, ET IL LE DIT ────────────
          L'absorption du brouillon par le bouton principal date du 2026-08-15
          et reste voulue. Ce qui manquait est l'accusé: on appuyait sur un
          bouton d'AVANCEMENT et une personne apparaissait, sans un mot.
          Signalé le 2026-08-19 — « ça m'a rajouté une personne que je voulais
          pas ». La phrase nomme la personne ET la sortie, parce qu'un accusé
          qui ne dit pas comment le défaire est un fait accompli. */}
      {props.added !== null ? (
        <p className="mt-4 rounded-card border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
          {t("setup.mouths.added_by_next", { name: props.added })}
        </p>
      ) : null}

      {props.mouths.length > 0 ? (
        // ── UNE PERSONNE, UNE SECTION ENCADRÉE ──────────────────────────────
        // C'était `divide-y divide-line`: un filet à 1,30:1 entre des blocs de
        // dix champs chacun. Mesuré sur un compte réel le 2026-08-13 — trois
        // personnes empilées, et l'écran se lisait comme UN formulaire de
        // trente champs dont on ne voyait pas où l'un finissait. Le prénom
        // n'était qu'un mot de plus dans le flux.
        //
        // Chaque bouche prend donc un cadre (`line-strong`, 3,84:1 — le
        // contour qui borde un CONTRÔLE), un fond légèrement décollé du papier,
        // et son prénom en tête de section. On voit trois blocs avant de lire
        // un seul champ.
        <ul className="mt-4 space-y-4">
          {props.mouths.map((m) => (
            <li
              key={m.memberId ?? m.firstName}
              className="rounded-card border border-line-strong bg-fig-50/40 p-4"
            >
              <MouthRow
                mouth={m}
                onGoal={(goal) => props.onGoal(m, goal)}
                onBirthDate={(date) => props.onBirthDate(m, date)}
                onAllergyAnswer={(labels) => props.onAllergyAnswer(m, labels)}
                // ── ⛔ LA BASE, PAS LE BROUILLON EN COURS D'ÉDITION ─────
                // Cette ligne rendait `emptyMouthDraft()` pour toute bouche
                // dont la fenêtre n'était PAS ouverte — donc le récapitulatif
                // disait « Rien de renseigné pour l'instant » sur tout le
                // monde, tout le temps, quoi qu'on ait saisi. Signalé le
                // 2026-08-19: « toutes les préférences alimentaires de tout le
                // monde ont sauté ». Elles avaient bien sauté en base (autre
                // défaut, corrigé sur `onClose`), mais même remplies l'écran
                // n'en aurait rien montré.
                //
                // Le brouillon ouvert gagne quand il existe: c'est ce qu'on est
                // en train de taper, et il est plus frais que la lecture.
                prefsDraft={props.mouthPrefs?.memberId === m.memberId
                  ? props.mouthPrefs.draft
                  : props.knownPrefs(m)}
                onOpenPreferences={() => props.onOpenMouthPreferences(m)}
                onSavePreferences={() => props.onSaveMouthPreferences(m)}
                onBody={(h, w, g, a, day, sport) =>
                  props.onBody(m, h, w, g, a, day, sport)}
                editing={props.editingMemberId === m.memberId}
                onToggleEdit={() => props.onToggleEdit(m)}
                onSaveAndClose={(fields) => props.onSaveAndClose(m, fields)}
                birthDate={props.birthDates === null
                  ? null
                  : props.birthDates.get(m.memberId ?? "") ?? ""}
                target={props.targets === null
                  ? null
                  : props.targets.get(m.memberId ?? "") ??
                    { targetWeightKg: null, paceKgPerWeek: null }}
                onTarget={(w, p) => props.onTarget(m, w, p)}
                onRemove={() => props.onRemove(m)}
                confirmRemove={props.confirmRemove === m.memberId}
                onConfirmRemove={() =>
                  props.onConfirmRemove(
                    props.confirmRemove === m.memberId ? null : m.memberId ?? null,
                  )}
                inviteOpen={props.inviteFor === m.memberId}
                onInviteOpen={() =>
                  props.onInviteFor(props.inviteFor === m.memberId ? null : m.memberId)}
                inviteEmail={props.inviteEmail}
                onInviteEmail={props.onInviteEmail}
                onInvite={() => props.onInvite(m)}
                invite={props.invite?.memberId === m.memberId ? props.invite : null}
                busy={props.busy}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {householdFull ? (
        // LE PLAFOND EST EN BASE (`household_full`). Cet écran ne fait que le
        // DIRE — « une limite d'UI n'est pas une limite ».
        <p className="mt-4 text-xs text-ink-soft">{t("setup.mouths.full")}</p>
      ) : branchFull ? null : formOpen ? (
        // LE FORMULAIRE D'AJOUT EST ENCADRÉ EN POINTILLÉ, et les personnes déjà
        // là en trait plein: le pointillé dit « pas encore quelqu'un ». Sans
        // cadre, il se lisait comme la suite de la dernière carte — donc comme
        // des champs vides SUR une personne existante.
        <div className="mt-4 space-y-4 rounded-card border border-dashed border-line-strong p-4">
          {/* ══════════════════════════════════════════════════════════════
              UN SEUL FORMULAIRE DE PERSONNE DANS LE DÉPÔT — A5, 2026-09-03
              ══════════════════════════════════════════════════════════════

              ⛔ ICI VIVAIENT DIX CHAMPS RECOPIÉS À LA MAIN, et c'est le mode
              d'échec n°1 de ce dépôt appliqué à un formulaire: prénom, date de
              naissance, sexe, taille, poids, la ligne du tout-ou-rien du corps,
              les tuiles de direction, la cible et son curseur, les deux axes
              d'activité — puis le bouton des préférences, le refus, la retenue
              et le bouton d'ajout. `/app/household` montait `MouthCoreFields`
              pour EXACTEMENT la même personne, avec les mêmes colonnes et les
              mêmes portes SQL derrière.

              DEUX FORMULAIRES POUR LA MÊME PERSONNE, ET ILS AVAIENT DÉJÀ
              DIVERGÉ. Trois écarts mesurés le 2026-09-03, avant ce lot:
                · la fiche du foyer NOMME ce qui retient l'enregistrement
                  (`household.mouth.held` + `missingRequiredBlocks`, bloc par
                  bloc); celle-ci ne disait rien — le bouton partait, et la
                  base refusait plus loin;
                · la fiche du foyer groupe en TROIS blocs obligatoires nommés
                  (`RequiredBlock`: qui c'est · son corps · sa direction);
                  celle-ci empilait dix champs à plat, sans dire lesquels vont
                  ensemble;
                · l'appétit et les trois cases du repas (`MouthAppetiteFields`,
                  dans le bloc du corps) n'étaient PAS collectables ici — une
                  bouche ajoutée depuis l'entonnoir naissait sans eux, et le
                  moteur retombait sur ses conventions sans que rien ne le dise.

              ⚠️ CE QUI NE CHANGE PAS, ET QUI EST LA MOITIÉ DU LOT: les bornes
              du corps (30–260 cm, 2–400 kg) sont celles de
              `keel_household_set_member_body`, pas celles de `profiles` — une
              bouche peut être un enfant de trois ans. `MouthCoreFields` porte
              DÉJÀ ces bornes-là, parce qu'il a toujours servi des bouches.
              L'unification ne les élargit ni ne les resserre.

              ⚠️ LA VOIX RESTE « IL OU ELLE ». `subject.isSelf: false` fait
              parler la fiche à la troisième personne, et `whoOf` NOMME la
              personne au lieu de deviner son genre (`lib/mouthVoice.ts`). La
              carte du titulaire, juste au-dessus, garde `voice="self"`.

              ⚠️ ET LES `id` NE SE COGNENT PAS. `MouthCoreFields` porte les
              `id` `mouth-*` (il était seul sur `/app/household`); sur cette
              page, la carte du titulaire est en `setup-self-*` et chaque
              bouche inscrite en `setup-row-<memberId>-*`. Vérifié: aucun
              `mouth-*` ailleurs dans ce fichier. */}
          <MouthCoreFields
            draft={draft}
            onChange={props.onDraftChange}
            // `existing: false` — on l'AJOUTE, donc le bouton dit « Ajouter »
            // et non « Enregistrer ». `hasAccount: false` — une bouche qu'on
            // saisit n'a jamais de compte au moment où on la saisit.
            // `isSelf: false` — la carte du titulaire est une autre carte.
            subject={{ existing: false, hasAccount: false, isSelf: false }}
            todayLocalIso={browserLocalDate()}
            busy={props.busy}
            // ⚠️ LE REFUS DESCEND DANS LA FICHE, et il n'est pas rendu deux
            // fois: le rendu du haut de carte est explicitement gardé par
            // `!formOpen`. Un refus d'ajout se lit à côté de la fiche fautive.
            failure={props.failure}
            onOpenPreferences={props.onOpenDraftPreferences}
            onSubmit={props.onAdd}
          />

          {/* ── CE QUI RETIENT LA BRANCHE, ET CE N'EST PAS CE QUI RETIENT LA
              FICHE ────────────────────────────────────────────────────────
              `MouthCoreFields` rend déjà sa propre retenue: « il manque son
              corps », bloc par bloc, à côté du bouton qui les lève. CELLE-CI
              est d'une autre nature — « il manque encore une personne », et
              elle vient de la réponse à l'étape 1. Les deux se lisent ensemble
              sans se répéter, et fondre l'une dans l'autre ferait disparaître
              la sortie: pour qui n'est finalement que deux, elle passe par la
              PREMIÈRE question, pas par ce formulaire.

              ⚠️ REQUISE, JAMAIS OPTIONNELLE (voir la prop): un paramètre de
              garde facultatif est une garde désarmée. */}
          {props.held !== null ? (
            <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {props.held}
            </p>
          ) : null}

          {/* ── CE QUE LE BOUTON PRINCIPAL FERA DE CETTE FICHE, DIT AVANT ────
              Il y avait ici, avant le 2026-08-15, un avertissement qui disait
              l'inverse: « "Continuer" ne l'enregistre pas ». Il est parti avec
              le défaut qu'il avouait — le bouton absorbe désormais la fiche.
              Mais la phrase est partie SANS ÊTRE REMPLACÉE, et c'est ce trou
              qu'un compte réel a payé le 2026-08-19: « Continuer » a inscrit
              quelqu'un que la personne ne voulait pas.

              ⚠️ ELLE PARLE DE « CONTINUER », PAS DU BOUTON « AJOUTER » DE LA
              FICHE. Les deux inscrivent la même personne — c'est justement ce
              qu'elle existe pour dire: même si on ne touche pas « Ajouter »,
              le bouton d'AVANCEMENT en bas de page le fera. Elle reste donc
              sous la fiche, juste au-dessus de l'échappatoire qu'elle nomme. */}
          {draft.firstName.trim() !== "" ? (
            <p className="text-xs leading-5 text-ink-soft">
              {t("setup.mouths.next_will_save", { name: draft.firstName.trim() })}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {/* ── « RETIRER », ET IL EST LÀ QUOI QU'IL ARRIVE ────────────────
                ⚠️ IL ÉTAIT CONDITIONNÉ À `mouthDraftHasContent(draft)`, sous
                le libellé « Effacer cette fiche », au motif qu'un effacement
                posé sous un formulaire vide « invite à se demander ce qu'il
                effacerait ». L'argument tenait quand la fiche était toujours à
                l'écran; il tombe dès qu'elle s'OUVRE sur un geste — parce
                qu'alors elle a quelque chose à défaire même vide: elle-même.
                Demandé mot pour mot après le signalement du 2026-08-19 —
                « quand une personne clique sur ajouter sans faire exprès, ça
                se déplie et il peut vouloir le supprimer tout simplement ».
                Un geste qui s'ouvre sans se refermer est un piège.

                Et il porte « Retirer », le MÊME mot que sur la carte d'une
                personne inscrite. Les conséquences diffèrent (ici on referme
                une fiche, là on retire quelqu'un de la base) mais l'intention
                que l'utilisateur exprime est la même — « que ce bloc ne soit
                plus là » —, et c'est elle qu'un libellé doit nommer. Le trait
                plein contre le pointillé, et la confirmation en deux temps
                côté personne, portent la différence. */}
            <Button variant="ghost" disabled={props.busy} onClick={props.onDiscard}>
              {t("setup.mouths.remove")}
            </Button>
          </div>
        </div>
      ) : (
        // ── REPLIÉ: RIEN QU'UN BOUTON ──────────────────────────────────────
        // Le formulaire était monté EN PERMANENCE sous la liste des bouches,
        // et c'est ce qui a produit le signalement: un bloc en forme de
        // personne, avec les mêmes champs et le même bouton de préférences
        // qu'une bouche inscrite, posé là sans que personne l'ait demandé.
        // « Je peux toujours pas supprimer le truc qui s'est ajouté tout
        // seul » — et il avait raison de chercher: on ne pouvait pas.
        // Maintenant il n'existe que si on l'a ouvert, et « Retirer » le
        // referme.
        <div className="mt-4">
          <Button variant="secondary" disabled={props.busy} onClick={props.onOpenForm}>
            {t("setup.mouths.add")}
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * CE QU'ON SAIT D'UNE BOUCHE, HORS ÉDITION.
 *
 * ⚠️ IL DIT AUSSI CE QU'ON NE SAIT PAS, ET C'EST LA MOITIÉ QUI COMPTE. Une
 * carte qui n'énumère que les champs remplis laisse croire que le reste n'est
 * pas demandé — alors que c'est très exactement ce qui manque au plan. Chaque
 * ligne absente porte donc son « — », et le bouton « Modifier » est à trois
 * centimètres au-dessus.
 */
function MouthRowSummary(
  { mouth, target, birthDate }: {
    mouth: FunnelMouth;
    target: MemberTargetView | null;
    /** `""` = pas de date, `null` = lecture pas faite. */
    birthDate: string | null;
  },
) {
  const dash = "—";
  const rows: Array<{ label: string; value: string }> = [
    {
      label: t("setup.people.birth_date"),
      // ⚠️ LA DATE, PAS « Renseignée ». Le résumé disait un ÉTAT là où il
      // pouvait dire un FAIT — et l'état était la seule chose que l'écran
      // savait, faute de porte de lecture. Elle existe depuis le 2026-08-19.
      // Le repli reste l'état pour la seule fenêtre où il est vrai: la lecture
      // n'a pas encore rendu.
      value: birthDate
        ? formatDate(birthDate)
        : mouth.birthDate === BIRTH_DATE_ON_FILE
        ? t("setup.mouths.summary_on_file")
        : dash,
    },
    {
      label: t("setup.mouths.goal"),
      // « — » ET PLUS « Aucune direction particulière » (2026-09-03): un
      // résumé qui nomme une quatrième direction en fabrique une.
      value: mouth.goal ? goalLabel(mouth.goal) : dash,
    },
    {
      label: t("setup.mouths.body"),
      // LES TROIS OU RIEN, comme la RPC: une taille seule ne dimensionne
      // aucune part, et l'afficher laisserait croire que le corps est posé.
      value: mouth.heightCm !== null && mouth.weightKg !== null && mouth.gender
        ? `${mouth.heightCm} cm · ${mouth.weightKg} kg`
        : dash,
    },
    {
      label: t("setup.activity.member_label"),
      value: mouth.activityLevel
        ? t(ACTIVITY_KEYS[mouth.activityLevel].label)
        : dash,
    },
  ];
  // LA CIBLE N'APPARAÎT QUE SOUS UNE DIRECTION QUI BOUGE — même règle que les
  // champs qu'elle résume: sur `maintenance`, elle n'a pas de sens et la base
  // la refuse (`target_needs_direction_check`).
  if (mouth.goal === "fat_loss" || mouth.goal === "muscle_gain") {
    rows.push({
      label: t("household.mouth.target_weight"),
      value: target?.targetWeightKg == null
        ? dash
        : `${target.targetWeightKg} kg`,
    });
  }
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map((r) => (
        <React.Fragment key={r.label}>
          <dt className="text-xs uppercase tracking-wide text-ink-soft">
            {r.label}
          </dt>
          <dd className="text-ink">{r.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/**
 * LA FICHE D'UNE BOUCHE INSCRITE, DANS LE VOCABULAIRE DE `MouthFormDraft`.
 *
 * ⚠️ ELLE PORTE LE CORPS ET L'ÂGE, PAS SEULEMENT LES DEUX NOMBRES DE LA CIBLE,
 * et ce n'est pas du zèle: `paceControlFor` borne le curseur SUR CE CORPS-LÀ.
 * Un brouillon réduit à `{goal, targetWeightKg}` proposerait un rythme calculé
 * sur un corps inexistant — c'est-à-dire un nombre inventé qui entrerait dans
 * un calcul d'énergie avec l'autorité d'une mesure.
 *
 * ⚠️ LA DATE DE NAISSANCE NE TRAVERSE PAS, ET LE ROSTER EN EST LA CAUSE: il ne
 * rend JAMAIS la date d'une bouche (le foyer doit savoir qu'il y a un enfant à
 * table, pas son âge). `BIRTH_DATE_ON_FILE` est une MARQUE de présence, pas une
 * date — la laisser passer ferait calculer un âge sur une chaîne sentinelle.
 * Une bouche dont l'âge n'est pas lisible ici reçoit donc le plancher adulte,
 * qui est le comportement documenté de `targetWeightStateFor` sans date.
 */
function mouthDraftFromRow(
  m: FunnelMouth,
  target: MemberTargetView | null,
): MouthFormDraft {
  return {
    ...emptyMouthFormDraft(),
    firstName: m.firstName,
    goal: m.goal ?? "",
    heightCm: m.heightCm === null ? "" : String(m.heightCm),
    weightKg: m.weightKg === null ? "" : String(m.weightKg),
    gender: m.gender ?? "",
    activityLevel: m.activityLevel ?? "",
    targetWeightKg: target?.targetWeightKg == null
      ? ""
      : String(target.targetWeightKg),
    paceKgPerWeek: target?.paceKgPerWeek == null
      ? ""
      : String(target.paceKgPerWeek),
  };
}

function MouthRow(props: {
  mouth: FunnelMouth;
  onGoal: (goal: MemberGoal) => void;
  onBirthDate: (date: string) => void;
  onAllergyAnswer: (labels: string[]) => void;
  /** Le brouillon de préférences de CETTE ligne — vide si elle n'est pas celle
   * qui est ouverte. REQUIS: c'est ce que le récapitulatif rend. */
  prefsDraft: MouthFormDraft;
  onOpenPreferences: () => void;
  onSavePreferences: () => void;
  onBody: (
    heightCm: string,
    weightKg: string,
    gender: MemberGender | "",
    activityLevel: ActivityLevel | null,
    // ② Les deux axes voyagent avec le corps: une seule porte, un seul geste.
    dayActivity: DayActivityLevel | null,
    sportFrequency: SportFrequency | null,
  ) => void;
  onRemove: () => void;
  confirmRemove: boolean;
  onConfirmRemove: () => void;
  /**
   * CETTE CARTE EST-ELLE EN ÉDITION ? REQUIS — jamais optionnel.
   *
   * ── LE DÉFAUT QUE CE MODE FERME ─────────────────────────────────────────
   * La carte d'une personne inscrite était un formulaire OUVERT en permanence:
   * dix contrôles qui écrivent en base au moindre clic, empilés sous chaque
   * prénom. Trois personnes, trente contrôles armés — et rien pour dire lequel
   * on est en train de changer. Demandé le 2026-08-19: « si on clique pas sur
   * modifier on peut rien modifier (à part "renseigner ses préférences
   * alimentaires") ».
   *
   * ⚠️ LA FENÊTRE DES PRÉFÉRENCES RESTE OUVERTE HORS ÉDITION, et c'est une
   * exception NOMMÉE, pas un oubli: elle a son propre bouton d'enregistrement,
   * donc elle ne peut rien écrire par mégarde.
   */
  editing: boolean;
  onToggleEdit: () => void;
  /** Écrit ce qui est prêt — appelé à la SORTIE d'un champ, pas par un bouton. */
  onSaveAndClose: (fields: {
    birthDate: string;
    heightCm: string;
    weightKg: string;
    gender: MemberGender | "";
    activityLevel: ActivityLevel | null;
  /**
   * ② LES DEUX AXES (2026-08-20). `null` = pas répondu — le cran ci-dessus
   * reste alors le repli nommé, et il rend le nombre d'avant.
   */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
    targetWeightKg: string;
    paceKgPerWeek: string;
  }) => void;
  /**
   * SA CIBLE ET SON RYTHME, TELS QU'ILS SONT EN BASE — `null` = pas encore lu.
   *
   * ⛔ LA GARDE DE LECTURE EST OBLIGATOIRE ICI, et elle ne protège pas un
   * affichage: `keel_household_set_member_target` REMPLACE la paire. Un
   * formulaire monté sur du vide non lu EFFACERAIT la cible déjà posée au
   * premier enregistrement. Voir `loadMemberTargets`.
   */
  target: MemberTargetView | null;
  /**
   * SA DATE DE NAISSANCE — `""` quand il n'y en a pas, `null` quand la lecture
   * n'a pas eu lieu. REQUIS, et les deux cas sont distincts: sur `null` on ne
   * sème rien plutôt que d'écrire un vide par-dessus une date en base.
   */
  birthDate: string | null;
  onTarget: (targetWeightKg: string, paceKgPerWeek: string) => void;
  inviteOpen: boolean;
  onInviteOpen: () => void;
  inviteEmail: string;
  onInviteEmail: (value: string) => void;
  onInvite: () => void;
  invite: { token: string; firstName: string } | null;
  busy: boolean;
}) {
  const m = props.mouth;
  /**
   * LA DATE AFFICHÉE — SEMÉE DEPUIS LA BASE DEPUIS LE 2026-08-19.
   *
   * Elle partait vide, et le champ restait vide même sur une date enregistrée:
   * « autant l'afficher — parce que quand je déplie, elle ne s'affiche pas non
   * plus ». La cause n'était pas ici, elle était en base — le roster ne rend
   * jamais la date d'une bouche. Une porte scopée au maître la rend maintenant
   * (`keel_household_member_birth_date_for_owner`).
   */
  const [date, setDate] = React.useState(props.birthDate ?? "");
  // ⚠️ UN `useState`, PAS UN `useRef`. C'est le motif « ajuster l'état pendant
  // le rendu »: la clé de semence doit elle-même être un état, sinon elle ne
  // participe pas au rendu qui la compare (`react-hooks/refs`).
  const [dateSeededFrom, setDateSeededFrom] = React.useState(props.birthDate);
  if (dateSeededFrom !== props.birthDate) {
    setDateSeededFrom(props.birthDate);
    setDate(props.birthDate ?? "");
  }
  // ── ⛔ SEMÉS DEPUIS LA BASE, ET C'EST LA MOITIÉ QUI MANQUAIT ─────────────
  // Ces trois champs partaient VIDES, et le bloc qui les portait ne se rendait
  // que si le corps était INCONNU. Conséquence, signalée le 2026-08-19 sur la
  // capture d'une carte en édition: « on n'a pas accès à date de naissance,
  // poids etc. » — une fois le corps saisi, plus aucun écran de l'entonnoir ne
  // permettait de le CORRIGER. Une faute de frappe sur un poids était
  // définitive.
  //
  // ⚠️ ET LA SEMENCE EST OBLIGATOIRE POUR OUVRIR LE BLOC:
  // `keel_household_set_member_body` est tout-ou-rien. Rendre les champs vides
  // sur un corps connu ferait qu'un « Enregistrer » les repose à vide — la
  // cicatrice `mount-snapshot-forms-need-a-loading-gate`, prise par le bout qui
  // coûte une donnée.
  const [bodyHeight, setBodyHeight] = React.useState(
    m.heightCm === null ? "" : String(m.heightCm),
  );
  const [bodyWeight, setBodyWeight] = React.useState(
    m.weightKg === null ? "" : String(m.weightKg),
  );
  const [bodyGender, setBodyGender] = React.useState<MemberGender | "">(
    m.gender ?? "",
  );
  /**
   * LE CRAN, SEMÉ DEPUIS LA BASE.
   *
   * ── ⛔ IL PARTAIT DE `null`, ET C'EST CE QUI A FAIT CROIRE À UNE PERTE ────
   * Ce brouillon ne servait QUE tant que le corps manquait; quand il était
   * connu, une AUTRE branche rendait les tuiles sur `m.activityLevel`, donc la
   * valeur enregistrée s'affichait. Cette branche a disparu le 2026-08-19 avec
   * la réouverture du corps en édition — et les tuiles sont restées sur ce
   * brouillon vide.
   *
   * Résultat, signalé le jour même: « j'ai l'impression que ses journées
   * comment elles sont ne s'enregistre pas ». Vérifié en base: `trains_some`
   * y était. Rien n'était perdu — l'écran ne relisait plus ce qu'il avait
   * écrit, ce qui est la même chose du point de vue de qui remplit.
   */
  const [bodyActivity, setBodyActivity] = React.useState<ActivityLevel | null>(
    m.activityLevel,
  );
  // ② LES DEUX AXES — même état, même re-semence, même écrivain que le cran
  // au-dessus. Les séparer ferait deux gestes d'enregistrement sur une seule
  // porte, et c'est celui qu'on regarde le moins qui écraserait l'autre.
  const [bodyDayActivity, setBodyDayActivity] = React.useState<
    DayActivityLevel | null
  >(m.dayActivity);
  const [bodySportFrequency, setBodySportFrequency] = React.useState<
    SportFrequency | null
  >(m.sportFrequency);
  /**
   * ── ⚠️ ET IL SE RE-SÈME APRÈS CHAQUE ÉCRITURE ────────────────────────────
   * `load(false)` relit la base et rend une nouvelle valeur; un `useState`
   * initialisé une fois garderait la photo d'avant l'enregistrement. Le
   * symptôme serait le même que celui qu'on referme, décalé d'un geste.
   */
  const bodySeed = `${m.heightCm ?? ""}|${m.weightKg ?? ""}|${m.gender ?? ""}|` +
    `${m.activityLevel ?? ""}|${m.dayActivity ?? ""}|${m.sportFrequency ?? ""}`;
  const [bodySeededFrom, setBodySeededFrom] = React.useState(bodySeed);
  if (bodySeededFrom !== bodySeed) {
    setBodySeededFrom(bodySeed);
    setBodyHeight(m.heightCm === null ? "" : String(m.heightCm));
    setBodyWeight(m.weightKg === null ? "" : String(m.weightKg));
    setBodyGender(m.gender ?? "");
    setBodyActivity(m.activityLevel);
    setBodyDayActivity(m.dayActivity);
    setBodySportFrequency(m.sportFrequency);
  }
  const onFile = m.birthDate === BIRTH_DATE_ON_FILE;
  /**
   * ÉCRIT CE QUI EST PRÊT — appelé à la SORTIE d'un champ, jamais par un bouton.
   *
   * ⚠️ `onBlur` ET PAS `onChange`, ET C'EST UNE MESURE, PAS UN GOÛT. Sur un
   * champ numérique, `onChange` part à chaque frappe: taper « 169 » écrirait
   * 1, puis 16, puis 169 — trois allers-retours, dont deux valeurs que personne
   * n'a voulues et que la relecture pourrait rendre entre-temps. À la sortie du
   * champ, la valeur est celle que la personne a fini d'écrire.
   *
   * ⚠️ ET IL PASSE TOUJOURS TOUT L'ÉTAT DE LA CARTE. Les trois du corps partent
   * ensemble (la RPC est tout-ou-rien) et la cible a besoin du corps: envoyer
   * seulement le champ qu'on vient de quitter ferait écrire une ligne partielle
   * que la base refuse — ou pire, qu'elle accepte à moitié.
   */
  const saveNow = () =>
    props.onSaveAndClose({
      birthDate: date,
      heightCm: bodyHeight,
      weightKg: bodyWeight,
      gender: bodyGender,
      activityLevel: bodyActivity,
      dayActivity: bodyDayActivity,
      sportFrequency: bodySportFrequency,
      targetWeightKg: targetDraft.targetWeightKg,
      paceKgPerWeek: targetDraft.paceKgPerWeek,
    });
  /**
   * LE BROUILLON DE SA CIBLE — SEMÉ SUR LA LECTURE, PAS SUR DU VIDE.
   *
   * ⚠️ `TargetAndPaceFields` parle le vocabulaire de `MouthFormDraft`: il lui
   * faut le CORPS et l'ÂGE pour borner le curseur, pas seulement les deux
   * nombres. On lui construit donc une fiche complète à partir de ce que la
   * base a rendu pour cette bouche — jamais un brouillon vide, qui ferait
   * proposer un rythme calculé sur un corps inexistant.
   *
   * ⚠️ ET IL SE RE-SÈME QUAND LA LECTURE CHANGE. Sans la clé, changer la
   * direction dans le sélecteur juste au-dessus (qui écrit et relit) laisserait
   * le brouillon sur l'ancienne, et les deux champs resteraient repliés sur une
   * direction qui, elle, vient de bouger.
   */
  const [targetDraft, setTargetDraft] = React.useState<MouthFormDraft>(() =>
    mouthDraftFromRow(m, props.target)
  );
  const targetSeed = `${m.goal ?? ""}|${props.target?.targetWeightKg ?? ""}|${
    props.target?.paceKgPerWeek ?? ""
  }|${m.heightCm ?? ""}|${m.weightKg ?? ""}|${m.gender ?? ""}`;
  const [seededFrom, setSeededFrom] = React.useState(targetSeed);
  if (seededFrom !== targetSeed) {
    setSeededFrom(targetSeed);
    setTargetDraft(mouthDraftFromRow(m, props.target));
  }
  // ── L'ÂGE DE CETTE LIGNE, DATE TAPÉE COMPRISE (chantier P3) ──────────────
  // C'est lui qui filtre les tuiles et qui replie la cible: le brouillon de
  // cible ne porte PAS la date (le roster ne la rend jamais, voir
  // `mouthDraftFromRow`), donc `foldMinorGoal` y serait aveugle — on plie ici,
  // sur l'état d'âge que la ligne connaît, avec la même règle (`goalForAge`).
  const rowAge = funnelMouthAgeState(m, date, browserLocalDate());
  const rowShownGoal = goalForAge(m.goal ?? "", rowAge);
  const rowTargetDraft: MouthFormDraft = rowShownGoal === targetDraft.goal
    ? targetDraft
    : { ...targetDraft, goal: rowShownGoal, targetWeightKg: "", paceKgPerWeek: "" };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* LE PRÉNOM EN TÊTE DE SECTION, et pas une ligne de texte parmi
            d'autres: c'est ce qui dit « ici commence quelqu'un d'autre ». */}
        <span className="min-w-0 text-base font-semibold text-ink">
          {m.firstName || "—"}
        </span>
        {/* LA NATURE DE LA BOUCHE PASSE DANS UNE PASTILLE `neutral`, ET C'EST
            LE KIT QUI LE DEMANDE: `Badge` a un ton pour « tout ce qui n'est
            qu'une étiquette », et « adulte / enfant » en est une — pas un état
            du système, donc ni émeraude, ni ambre, ni rouge, ni bleu, et
            surtout pas la figue (elle n'entre jamais dans une pastille).
            Elle paie aussi une lisibilité mesurée: en `text-xs text-gray-500`
            au bout d'une ligne, la nature se confondait avec les phrases
            d'aide en dessous, et trois lignes de bouches se lisaient comme un
            seul formulaire. La pastille rend le début de chaque ligne. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {m.kind === "child" ? t("setup.mouths.kind_child") : t("setup.mouths.kind_adult")}
          </Badge>
          {/* ── RETIRER, EN DEUX CLICS ────────────────────────────────────
              Un clic arme, le second exécute — et le libellé CHANGE entre les
              deux, donc on ne confirme pas en cliquant deux fois au même
              endroit sans lire. Pas de modale: on est dans un couloir, et une
              boîte de dialogue qui se ferme mal y devient une impasse.

              ⚠️ `danger` ET PAS `primary`: dans tout le produit le rouge dit
              l'échec ou le refus, et un geste destructeur emprunte ce sens. La
              figue est réservée à l'action principale de l'écran — ici,
              « Continue ».

              Le maître n'a pas ce bouton (`m.claimed` est vrai pour lui et sa
              ligne ne descend pas ici), et la base refuserait de toute façon:
              `cannot_remove_owner`. */}
          {/* ── « MODIFIER », ET IL EST LA PORTE DE TOUT LE RESTE ─────────
              Hors édition, cette carte ne montre que ce qu'on SAIT d'elle.
              Le bouton est ce qui arme les contrôles — sinon dix champs
              écrivant en base au moindre clic restaient ouverts en permanence
              sous chaque prénom. */}
          {/* ── ⛔ UN SEUL ENREGISTREMENT PAR CARTE (2026-08-19) ────────────
              Il y en avait QUATRE — un sous la date, un sous le corps, un sous
              la cible, un sous les préférences —, et deux d'entre eux sont
              apparus le jour même en rouvrant ces blocs en édition. Réaction
              immédiate: « je comprends pas pourquoi d'un coup j'ai des
              enregistrer pour l'activité et la date de naissance ».

              Quatre boutons du même nom sur une carte, c'est quatre fois la
              question « qu'est-ce que celui-là enregistre, au juste » — et
              trois occasions d'en oublier un.

              ⛔ ET LA RÉPONSE N'EST PAS « UN SEUL BOUTON » NON PLUS. Premier
              essai le même jour: « Terminé » écrivait tout. Tranché dans la
              foulée — « le seul bouton enregistrer c'est pour le shaker, le
              reste s'enregistre automatiquement ». C'est juste: un formulaire
              qui garde des réponses en mémoire jusqu'à un clic final est un
              formulaire qui les perd au premier rechargement, et ce couloir en
              a déjà fait perdre.

              CHAQUE CHAMP ÉCRIT DONC TOUT SEUL — à la sortie du champ pour ce
              qui se tape, au clic pour ce qui se choisit. « Terminé » ne fait
              plus que REFERMER la carte, et il le dit.

              ⚠️ SEUL LE SHAKER GARDE SON BOUTON: il n'est pas un champ de la
              personne mais un OBJET qu'on ajoute, et il ne part qu'entier. */}
          <Button
            variant={props.editing ? "primary" : "secondary"}
            size="sm"
            disabled={props.busy}
            onClick={props.onToggleEdit}
          >
            {props.editing
              ? t("setup.mouths.edit_done")
              : t("setup.mouths.edit")}
          </Button>
          {props.confirmRemove ? (
            <Button
              variant="danger"
              size="sm"
              disabled={props.busy}
              onClick={props.onRemove}
            >
              {t("setup.mouths.remove_confirm")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={props.busy}
              onClick={props.onConfirmRemove}
            >
              {t("setup.mouths.remove")}
            </Button>
          )}
        </div>
      </div>

      {/* ═══ CE QUI SUIT NE S'OUVRE QU'AU BOUTON « MODIFIER » ═══════════════
          Hors édition, la carte rend un RÉSUMÉ de ce qu'on sait — pas dix
          champs armés. Voir la prop `editing`. */}
      {props.editing ? (
        <>
      {/* LA DATE NE SE PRÉREMPLIT PAS, ET C'EST LA BASE QUI LE DÉCIDE: le
          roster NE REND JAMAIS la date d'une bouche (le foyer doit savoir qu'il
          y a un enfant à table, pas son âge). On sait seulement qu'elle EXISTE,
          parce que l'âge n'est plus `unknown`. */}
      {/* ── ⛔ LE CHAMP EXISTE MÊME QUAND UNE DATE EST DÉJÀ EN BASE ──────────
          Il n'était rendu que si la date MANQUAIT — et à la place, une phrase
          disait « laisse ce champ vide pour la garder, ou choisis une nouvelle
          date pour la remplacer ». Elle parlait d'un champ qui n'était PAS à
          l'écran. On ne pouvait donc pas corriger une date de naissance, et la
          phrase promettait le contraire.

          ⚠️ IL RESTE VIDE, ET C'EST LA BASE QUI LE DÉCIDE: le roster ne rend
          JAMAIS la date d'une bouche (le foyer doit savoir qu'il y a un enfant
          à table, pas son âge). On ne peut donc pas la préremplir — d'où la
          phrase, qui est maintenant vraie. */}
      {/* ⚠️ L'AIDE DU CHAMP CHANGE SELON CE QUE LA BASE PORTE, et ce n'est pas
          cosmétique: le champ reste VIDE même quand une date est enregistrée
          (le roster ne rend jamais la date d'une bouche — le foyer doit savoir
          qu'il y a un enfant à table, pas son âge). Un champ vide sous une aide
          générique se lit donc comme « ça ne s'est pas enregistré », ce qui a
          été signalé le 2026-08-19 alors que la date ÉTAIT en base. La phrase
          « déjà enregistrée » était bien là — mais en paragraphe séparé
          au-dessus, où elle ne se rattachait à rien. */}
      <Field
        label={t("setup.people.birth_date")}
        hint={onFile
          ? t("household.member.birth_date_kept")
          : t("setup.people.birth_date_hint")}
        htmlFor={`setup-mouth-date-${m.memberId}`}
      >
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`setup-mouth-date-${m.memberId}`}
              type="date"
              value={date}
              max={browserLocalDate()}
              onChange={(e) => setDate(e.target.value)}
              onBlur={saveNow}
              // `min-w-0` EST LA CORRECTION, pas du confort: `min-width: auto`
              // sur un enfant flex l'empêche de rétrécir, et la ligne déborde à
              // 320 px.
              className={`${inputClass} min-w-0 flex-1`}
            />
          </div>
      </Field>

      {/* ⚠️ UN ENFANT QUI A UN COMPTE VOIT LA MÊME CHOSE QUE LES AUTRES.
          Cette ligne portait `m.claimed && m.kind === "child" ? null : …`: sur
          un mineur déjà inscrit, l'écran ne rendait RIEN — ni le champ, ni la
          phrase qui dit où il vit. C'est l'ancienne règle « un mineur n'a pas
          d'objectif », renversée le 2026-08-18, et c'était en plus le pire des
          deux mondes: un blanc ne dit pas « ça se règle ailleurs ».

          ⟳ 2026-09-03 (chantier P3): les tuiles remplacent le `<select>` et son
          option vide. Un mineur SANS compte ne voit qu'une tuile, « Manger
          normalement » (`goalsForAge` — la base refuse le reste depuis
          `20260822041500`); son âge vient de `funnelMouthAgeState`, date tapée
          comprise, et une direction héritée est pliée et DITE. Un clic écrit
          tout de suite (`onGoal`), donc il n'y a plus rien à « dé-choisir ». */}
      {(
        m.claimed ? (
          // ⚠️ D1 DU CHANTIER FOYER: dès qu'une bouche a un compte, son objectif
          // vit dans SON « about you ». Le champ n'est donc pas ici — et le dire
          // évite qu'on cherche un réglage qui n'existe plus à cet endroit.
          <p className="text-xs text-ink-soft">{t("setup.mouths.goal_from_profile")}</p>
        ) : (
          <Field label={t("setup.mouths.goal")} htmlFor={`setup-mouth-g-${m.memberId}`}>
            <GoalTiles
              id={`setup-mouth-g-${m.memberId}`}
              name={`setup-mouth-g-${m.memberId}`}
              ariaLabel={t("setup.mouths.goal")}
              value={m.goal ?? ""}
              ageState={rowAge}
              disabled={props.busy}
              labelOf={goalLabel}
              onChange={(g) => props.onGoal(g)}
            />
          </Field>
        )
      )}

      {/* LE CORPS, QUAND IL MANQUE. Même raison que le bloc d'allergies
          ci-dessous: sans champ sur la ligne, `canGenerate` réclamerait un
          corps que rien ne permettrait de donner — un bouton gris et rien à
          faire. C'est le cas nominal d'une bouche saisie sur
          `/app/household`, ou d'une reprise. */}
      {/* ── ⛔ LE CORPS SE RÉÉDITE, MÊME QUAND IL EST DÉJÀ LÀ ────────────────
          Cette condition était `heightCm === null || weightKg === null ||
          gender === null`: le bloc DISPARAISSAIT dès que les trois étaient
          saisis. L'intention était bonne (ne pas redemander ce qu'on sait), le
          résultat ne l'était pas — plus aucun écran de l'entonnoir ne
          permettait de corriger un poids, et « Modifier » ouvrait une carte où
          justement les faits qu'on veut modifier étaient absents. Signalé le
          2026-08-19, capture à l'appui.

          Ce qui reste vrai de l'intention est porté par la SEMENCE: les champs
          arrivent remplis, donc on ne redemande rien — on montre, et on laisse
          corriger. */}
              <Field label={t("setup.mouths.body")} hint={t("setup.mouths.body_hint")}>
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="number"
                inputMode="numeric"
                min={30}
                max={260}
                placeholder={t("setup.people.height")}
                aria-label={t("setup.people.height")}
                value={bodyHeight}
                onChange={(e) => setBodyHeight(e.target.value)}
                onBlur={saveNow}
                className={`${inputClass} min-w-0`}
              />
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={2}
                max={400}
                placeholder={t("setup.people.weight")}
                aria-label={t("setup.people.weight")}
                value={bodyWeight}
                onChange={(e) => setBodyWeight(e.target.value)}
                onBlur={saveNow}
                className={`${inputClass} min-w-0`}
              />
              <select
                aria-label={t("setup.people.gender")}
                value={bodyGender}
                // UN `select` SE VALIDE AU CHOIX, pas à la sortie: il n'y a
                // pas de frappe intermédiaire à attendre.
                onChange={(e) => {
                  setBodyGender(e.target.value as MemberGender);
                  props.onSaveAndClose({
                    birthDate: date,
                    heightCm: bodyHeight,
                    weightKg: bodyWeight,
                    gender: e.target.value as MemberGender,
                    activityLevel: bodyActivity,
                    dayActivity: bodyDayActivity,
                    sportFrequency: bodySportFrequency,
                    targetWeightKg: targetDraft.targetWeightKg,
                    paceKgPerWeek: targetDraft.paceKgPerWeek,
                  });
                }}
                className={`${inputClass} min-w-0`}
              >
                <option value="">{t("setup.people.gender")}</option>
                {MEMBER_GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {t(`household.body.gender_${g}` as "household.body.gender_female")}
                  </option>
                ))}
              </select>
            </div>
            {/* LE CRAN VOYAGE AVEC LE BOUTON D'À CÔTÉ, ET IL LE DOIT. La RPC
                refuse `body_incomplete` tant que les trois ne sont pas là:
                une tuile qui écrirait toute seule ici rendrait un refus
                incompréhensible sur un geste qui a l'air d'avoir marché. */}
            <ActivityAxesTiles
              ownVoice={false}
              day={bodyDayActivity}
              sport={bodySportFrequency}
              onDay={setBodyDayActivity}
              onSport={setBodySportFrequency}
              busy={props.busy}
              idPrefix={`setup-row-${m.memberId}`}
            />
          </div>
        </Field>


          {/* ── OÙ VA SA BALANCE, ET À QUELLE VITESSE ──────────────────────
              ⛔ CES DEUX CHAMPS N'EXISTAIENT PAS SUR CETTE CARTE, ET C'EST LA
              DONNÉE QUI ÉTAIT INATTEIGNABLE. Ils ne vivaient que sur la fiche
              d'AJOUT: une bouche inscrite sans direction, puis passée à
              « Perdre du poids » depuis le sélecteur juste au-dessus, ne
              pouvait JAMAIS recevoir de cible depuis cet écran — et rien ne le
              disait. Signalé le 2026-08-19.

              ⚠️ ILS SE REPLIENT TOUT SEULS SUR UNE DIRECTION QUI NE BOUGE PAS
              (`TargetAndPaceFields` rend `null`), donc la carte ne pose la
              question que quand elle a un sens.

              ⚠️ ET LA GARDE DE LECTURE EST AU-DESSUS, pas ici: `props.target`
              à `null` veut dire « pas encore lu », et on ne monte alors aucun
              champ — `setMemberTarget` REMPLACE la paire, un formulaire ouvert
              sur du vide non lu effacerait la cible déjà posée. */}
          {props.target !== null ? (
            <>
              <div onBlur={saveNow}>
              <TargetAndPaceFields
                voice="other"
                who={m.firstName.trim() || t("household.mouth.who_fallback")}
                // Pliée à l'âge de la ligne — voir `rowTargetDraft`.
                draft={rowTargetDraft}
                onChange={setTargetDraft}
                todayLocalIso={browserLocalDate()}
                // ⚠️ PRÉFIXE PAR MEMBRE. Trois cartes peuvent être à l'écran,
                // et deux `id` identiques feraient qu'un libellé désigne le
                // curseur de quelqu'un d'autre.
                idPrefix={`setup-row-${m.memberId}`}
              />
              </div>
            </>
          ) : null}
        </>
      ) : (
        // ── HORS ÉDITION: CE QU'ON SAIT, ET RIEN QU'ON PUISSE TOUCHER ──────
        // ⚠️ UN RÉSUMÉ, PAS UN BLANC. « Il n'y a rien ici » et « ça se règle
        // derrière Modifier » ne sont pas la même phrase — c'est la règle que
        // cette page applique déjà à une bouche qui a un compte.
        <MouthRowSummary
          mouth={m}
          target={props.target}
          birthDate={props.birthDate}
        />
      )}

      {/* ── LA MÊME PORTE QUE POUR LES DEUX AUTRES FICHES ────────────────
          ⛔ ICI SE TENAIT UN TROISIÈME CHAMP D'ALLERGIES EN LIGNE, rendu
          seulement quand la question n'avait pas de réponse. Il est passé dans
          la fenêtre le 2026-08-18, avec les deux autres.

          ⚠️ ET IL EST MONTRÉ MÊME QUAND LES ALLERGIES SONT DÉJÀ RÉPONDUES,
          contrairement à ce qu'il remplace: la fenêtre ne porte plus seulement
          la question de sécurité — elle porte aussi ce que cette bouche mange
          déjà, ce qu'elle n'aime pas, et son régime. Le garder conditionné à
          `allergiesReviewed` rendrait ces trois blocs-là inatteignables pour
          toute bouche dont on a déjà déclaré les allergies.

          ⚠️ SA FENÊTRE A UN BOUTON D'ENREGISTREMENT, ET LES DEUX AUTRES NON.
          Ce n'est pas une incohérence: la fiche du titulaire et le formulaire
          d'ajout ont chacun leur geste d'enregistrement en bas (« Continuer »,
          « Ajouter »), qui emporte le brouillon entier. Une ligne déjà
          inscrite, elle, écrit champ par champ — chaque contrôle de cette
          rangée a le sien. Sans ce bouton, la fenêtre serait la seule surface
          de l'écran à ne rien promettre. */}
      <div className="space-y-2">
        <MouthPreferencesButton
          draft={props.prefsDraft}
          busy={props.busy}
          onOpen={props.onOpenPreferences}
          voice="other"
          who={m.firstName.trim() || t("household.mouth.who_fallback")}
        />
        {/* ⛔ ET LE QUATRIÈME S'EN VA AUSSI. Il enregistrait ce qui avait été
            saisi derrière le bouton des préférences — donc encore un
            « Enregistrer » de plus, à côté d'un autre. « Terminé » le couvre. */}
      </div>

      {/* L'ACCÈS — UN AJOUT PAR-DESSUS, JAMAIS UNE ALTERNATIVE. On a déjà
          ajouté la bouche; ceci ne fait que permettre à quelqu'un de la
          reprendre. D'où l'absence totale de fourche à la saisie. */}
      {!m.claimed ? (
        <div>
          {/* ── `secondary` ET PLUS `ghost`, ET C'EST UN DÉFAUT MESURÉ ────────
              `ghost` ne rend que du texte `ink-soft` sans contour. Ce bouton
              vit au milieu de trois phrases d'aide qui sont, elles aussi, en
              `ink-soft`: vu au navigateur le 2026-08-13, il ne se distinguait
              pas d'une ligne de prose, sur la seule ligne de cette liste qui
              OUVRE quelque chose. Le geste reste facultatif — c'est le rôle de
              `ghost` — mais un geste facultatif doit rester reconnaissable
              comme geste. */}
          <Button variant="secondary" size="sm" onClick={props.onInviteOpen}>
            {t("setup.access.title")}
          </Button>
          {props.inviteOpen ? (
            // LE PANNEAU IMBRIQUÉ SE DIT PAR `paper-2` + UN TRAIT, pas par un
            // gris froid: c'est l'idiome du fronton de `ui/SetupSection.tsx`,
            // et c'est le seul remplissage disponible sous une carte `paper`
            // (`ink-soft` sur `paper-2` = 5,67:1).
            <div className="mt-2 space-y-2 rounded-card border border-line bg-paper-2 p-3">
              <p className="text-xs leading-5 text-ink-soft">
                {t("setup.access.waiting")}
              </p>
              <p className="text-xs leading-5 text-ink-soft">
                {t("setup.access.grants")}
              </p>
              <p className="text-xs leading-5 text-ink-soft">
                {t("setup.access.goal_carries")}
              </p>
              {/* ── UNE COLONNE SOUS `sm`, ET C'EST UN DÉFAUT MESURÉ ─────────
                  C'était `flex flex-wrap items-center gap-2` avec le champ en
                  `flex-1`. `flex-wrap` ne sauve rien ici: le champ, étant
                  élastique, se laisse comprimer plutôt que de pousser le bouton
                  à la ligne. Mesuré à 320 px le 2026-08-13: le champ tombait à
                  **84 px** à côté d'un bouton dont le libellé fait toute la
                  largeur — on ne saisit pas une adresse e-mail dans 84 px.
                  `items-start` empêche le bouton de s'étirer sur toute la
                  largeur en colonne (`align-items` vaut `stretch` par défaut,
                  et `Button` est un `inline-flex`). */}
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  placeholder={t("setup.access.email")}
                  value={props.inviteEmail}
                  onChange={(e) => props.onInviteEmail(e.target.value)}
                  className={`${inputClass} min-w-0 sm:flex-1`}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={props.busy}
                  onClick={props.onInvite}
                >
                  {t("setup.access.submit")}
                </Button>
              </div>
              {props.invite ? (
                <div className="space-y-1">
                  <p className="text-xs text-ink-soft">
                    {t("household.invite.link_ready", { name: props.invite.firstName })}
                  </p>
                  {/* LE LIEN EST RENDU, PAS ENVOYÉ. En local, aucun e-mail ne
                      part — et l'écran doit donc donner de quoi le
                      transmettre à la main. */}
                  {/* `text-xs` remplace un `text-[0.6875rem]` hors échelle. Le
                      cran de la charte à cette taille est `text-label`, mais il
                      met en CAPITALES et ouvre l'approche à +0,1em: un jeton
                      d'invitation à recopier ne survit ni à l'un ni à l'autre.
                      12 px sur l'échelle valent mieux que 11 px hors d'elle. */}
                  <code className="block break-all rounded-card border border-line bg-paper p-2 text-xs text-ink">
                    {`${window.location.origin}/join-household?token=${props.invite.token}`}
                  </code>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ÉTAPE 3
// ───────────────────────────────────────────────────────────────────────────

/**
 * ÉTAPE 3 — LA TABLE: UNE CARTE PAR PERSONNE, LE TITULAIRE COMPRIS.
 *
 * ── CE QUE CETTE ÉTAPE EXISTE POUR RENDRE POSSIBLE ────────────────────────
 * Le rythme était UNE valeur pour toute la maison, et l'écran l'assumait:
 * « demandé une fois, pour toute la maison — ça appartient à qui cuisine ».
 * C'était vrai du code et faux de la vie: un ado qui saute le petit-déjeuner et
 * un petit qui goûte à 16 h ne mangent pas aux mêmes moments.
 *
 * ── LA REFONTE DU 2026-08-14, ET ELLE A ÉTÉ DEMANDÉE QUATRE FOIS ──────────
 * L'étape portait DEUX cadres qui ne se ressemblaient pas: en tête, le régime
 * du titulaire et « les moments de LA MAISON »; en dessous, une carte par autre
 * bouche, avec ses moments, son régime, et un dépliant « ce qu'elle mange
 * d'habitude ». Le titulaire n'avait donc ni ses moments à lui (les siens
 * s'appelaient « la maison »), ni sa ligne de préférences; et les autres
 * n'avaient pas la même carte que lui. Ses mots: « c'est la même disposition
 * pour le maître et les autres personnes du foyer, il y a aucune information
 * différente. »
 *
 * Il n'y a donc plus qu'UN composant, `PersonTableCard`, monté une fois par
 * bouche, avec TROIS blocs dans le MÊME ordre pour tout le monde:
 *
 *   1. LE RÉGIME — les quatre réponses de `DIET_ANSWERS`.
 *   2. LES MOMENTS, AVEC LEUR TAILLE — `MEAL_SIZES` sur chaque moment coché.
 *   3. UNE LIGNE LIBRE — ce que cette personne mange d'habitude, en toutes
 *      lettres.
 *
 * ⚠️ LE MAÎTRE EST UNE LIGNE `household_members` COMME LES AUTRES, et c'est ce
 * qui rend cette uniformité possible sans inventer un second modèle. Ce qui
 * DIFFÈRE est le chemin d'écriture, pas la carte, et c'est la base qui le
 * décide (D1: « pour une bouche avec compte, son about-you fait autorité »):
 *
 *   · le régime et les moments d'un COMPTE vivent dans son « about you »
 *     (`student_safety_constraints` + `practical_constraints`), et les deux RPC
 *     par-bouche refusent `has_account` — la carte du maître écrit donc par
 *     `saveOwnDiet` / `savePlanAnswers`, au « Continuer », comme avant;
 *   · une bouche SANS compte écrit sur sa ligne, tout de suite, par
 *     `keel_household_set_member_diet` et `keel_household_set_member_rhythm`;
 *   · la LIGNE LIBRE, elle, passe par la MÊME RPC pour tout le monde
 *     (`keel_household_set_member_habits`, qui n'a pas de refus `has_account`
 *     — une habitude n'a pas de second domicile).
 *
 * Le roster tranche ensuite, une fois, pour tout le monde: l'écran ne refait
 * jamais cette résolution.
 *
 * ── CE QUI A ÉTÉ RETIRÉ, ET POURQUOI ─────────────────────────────────────
 * `HouseholdHabitsCard` ne vit plus ici. Elle portait un titre (« Ce qu'elle
 * mange d'habitude »), un dépliant « Fermer », un couple de boutons radio par
 * moment, et la phrase « Aucun moment de repas n'est encore posé pour cette
 * personne » quand le rythme était vide — c'est-à-dire, sur un entonnoir où le
 * rythme se coche À CÔTÉ, un cadre qui demandait d'aller cocher ailleurs avant
 * de pouvoir répondre. La zone de texte libre la remplace, sur la même table et
 * la même RPC: `household_member_habits.note` n'est pas perdue, elle est ce que
 * le champ affiche et réécrit. La carte complète reste sur `/app/household`,
 * qui est le bon endroit pour la RELIRE.
 *
 * ⚠️ ET LES `slots` DÉJÀ SAISIS SONT REPASSÉS TELS QUELS. La RPC REMPLACE la
 * ligne entière: enregistrer la note avec `[]` effacerait en silence les
 * habitudes par moment posées sur `/app/household`. L'écran renvoie donc ce
 * qu'il a lu.
 *
 * ⚠️ RIEN N'EST PRÉ-COCHÉ, NULLE PART. Ni le régime (`null` ≠ « mange de
 * tout »), ni les moments d'une bouche (`null` = « aux moments de la maison »),
 * ni la taille (`null` = « il n'a pas dit »). « Coche automatique = faits faux
 * indémentables » est une cicatrice de ce dépôt, et sur une question de régime
 * c'est une question de sécurité.
 *
 * ⚠️ AUCUN DÉCOMPTE de qui a rempli quoi. Pas de pastille « à compléter », pas
 * de total. « 2 personnes n'ont rien dit » se lit « il en reste 2 à relancer »,
 * et c'est la corvée que ce produit promet de supprimer (FF-050 §1).
 */
/**
 * ⚠️ EXPORTÉ POUR ÊTRE RENDU, comme `MouthsStep` — voir
 * `pages/setupTableStepTarget.int.test.ts`. Ce qui doit être prouvé est que
 * l'étape 3 PORTE le poids visé et le curseur de rythme, et un test de source
 * dirait la même chose sur du texte.
 */
export function TableStep({
  draft,
  onChange,
  mouths,
  onMouthRhythm,
  onMouthDiet,
  busy,
  missing,
  selfDiet,
  onSelfDiet,
  selfFirstName,
  selfMemberId,
  habits,
  onSaveNote,
}: {
  draft: FunnelPlanAnswers;
  onChange: React.Dispatch<React.SetStateAction<FunnelPlanAnswers | null>>;
  mouths: readonly FunnelMouth[];
  onMouthRhythm: (mouth: FunnelMouth, rhythm: readonly EatingOccasionSlot[]) => void;
  /** Le régime d'une bouche. Re-cliquer la réponse posée l'efface. */
  onMouthDiet: (mouth: FunnelMouth, diet: DietAnswer) => void;
  busy: boolean;
  missing: readonly FunnelMissId[];
  /** Le régime du maître — REQUIS, `""` = pas encore répondu. */
  selfDiet: DietAnswer | "";
  onSelfDiet: (diet: DietAnswer) => void;
  selfFirstName: string;
  /**
   * MA LIGNE DE FOYER — `null` quand il n'y a pas de foyer du tout (le compte
   * solo). C'est la SEULE différence de carte qui subsiste, et elle n'est pas
   * une différence entre les gens: `household_member_habits` est clée sur un
   * `member_id`, donc un compte sans foyer n'a nulle part où ranger sa ligne
   * libre. Il n'y a alors qu'UNE carte à l'écran, donc rien à côté de quoi
   * elle pourrait paraître amputée.
   */
  selfMemberId: string | null;
  /** `null` = la lecture n'a pas eu lieu. La carte s'en sert comme garde. */
  habits: Map<string, MemberHabitsView> | null;
  onSaveNote: (memberId: string, note: string | null) => Promise<boolean>;
  /*
   * ⛔ PAS DE `selfTarget` ICI, ET C'EST UNE CORRECTION DE PLACEMENT.
   *
   * Le poids visé et le curseur de rythme ont été montés sur cette étape le
   * 2026-08-18, sur une lecture trop littérale de « dans le cadre de l'étape
   * 3 ». L'utilisateur a mesuré le résultat le jour même: il choisit « Perdre
   * du poids » à l'étape 2 et RIEN n'apparaît — les deux champs vivaient deux
   * écrans plus loin, sur la carte du planning, sous une question à laquelle il
   * n'était pas encore arrivé. Ils sont désormais sous la direction qui les
   * débloque (`SelfStep`), et leur écrivain avec eux (`saveSelf`).
   *
   * ⛔ NE PAS LES REMETTRE ICI. Cette étape dit QUAND et COMMENT on mange; où
   * va la balance est une question de personne, pas de planning.
   */
}) {
  /**
   * LE REFUS DES MOMENTS TOMBE SUR LA CARTE DU TITULAIRE, ET C'EST EXACT.
   *
   * `eating_rhythm` (`wrong`) porte sur `practical_constraints`, c'est-à-dire
   * sur SA ligne à lui — celle qui dimensionne la grille du plan, et sur
   * laquelle les autres bouches se replient quand elles n'ont rien dit. Le
   * poser sur le champ qui le lève est la règle de cet écran: un motif affiché
   * ailleurs que sur son contrôle est une trace, pas un message.
   */
  const rhythmError = missing.includes("eating_rhythm")
    ? t("setup.missing.eating_rhythm")
    : undefined;

  /**
   * ⚠️ LE RÉGIME RETENAIT L'ÉTAPE SANS QUE RIEN NE LE DISE, ET C'EST LE PIRE
   * DES DEUX MONDES: un bouton principal qui ne fait RIEN.
   *
   * L'étape 3 ne retient que sur deux motifs — `eating_rhythm` et `own_diet`.
   * Le premier avait son message sur son champ; le second était calculé,
   * transmis à ce composant dans `missing`… et jamais lu. Quelqu'un qui avait
   * coché ses moments mais pas répondu au régime appuyait sur « Continuer »,
   * l'écran ne bougeait pas, et AUCUN mot n'apparaissait nulle part.
   *
   * Mesuré le 2026-08-15 sur un compte réel (`tho@gmail.com`):
   * `practical_constraints` portait `eating_rhythm`, pas `diet`.
   *
   * ⚠️ SEULEMENT SUR LA CARTE DU TITULAIRE. `own_diet` est le motif de SON
   * régime; les autres bouches ne retiennent l'étape sur rien (leur régime est
   * un `better`), donc leur poser un message rouge accuserait quelqu'un qui n'a
   * rien à corriger — la faute exacte que `rhythmError` évite déjà.
   */
  const dietError = missing.includes("own_diet")
    ? t("setup.missing.own_diet")
    : undefined;

  return (
    <Card>
      <SectionLabel>{t("setup.table.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.table.intro")}</p>

      <ul className="mt-4 space-y-4">
        {/* ── LE TITULAIRE, PREMIER ET PAREIL ─────────────────────────────
            Premier parce que c'est lui qui remplit, et que sa carte donne la
            forme de toutes les autres. Pareil parce que c'est exactement ce
            qui a été demandé. */}
        <li className="rounded-card border border-line-strong bg-fig-50/40 p-4">
          <PersonTableCard
            firstName={selfFirstName}
            memberId={selfMemberId}
            diet={selfDiet === "" ? null : selfDiet}
            onDiet={onSelfDiet}
            rhythm={draft.eatingRhythm}
            onRhythm={(next) =>
              onChange((prev) => (prev === null ? prev : { ...prev, eatingRhythm: next }))}
            rhythmError={rhythmError}
            dietError={dietError}
            fallsBackToHouse={false}
            readOnly={false}
            busy={busy}
            habits={habits}
            onSaveNote={onSaveNote}
          />
        </li>

        {mouths.map((m) => (
          <li
            key={m.memberId ?? m.firstName}
            className="rounded-card border border-line-strong bg-fig-50/40 p-4"
          >
            <PersonTableCard
              firstName={m.firstName}
              memberId={m.memberId}
              diet={m.diet}
              onDiet={(diet) => onMouthDiet(m, diet)}
              rhythm={m.eatingSlots ?? []}
              onRhythm={(next) => onMouthRhythm(m, next)}
              rhythmError={undefined}
              // Le régime d'une autre bouche ne retient l'étape sur rien.
              dietError={undefined}
              // `null` = personne ne l'a dit ⇒ elle mange aux moments de la
              // maison. On le DIT sous la rangée décochée plutôt que de
              // pré-cocher les moments du foyer sur sa ligne.
              fallsBackToHouse={m.eatingSlots === null}
              // ── UNE BOUCHE QUI A UN COMPTE N'EST PAS ÉDITABLE ICI ───────
              // La base refuse (`has_account`) sur le régime comme sur les
              // moments: ils vivent dans SON « about you ». On garde les trois
              // mêmes blocs, dans le même ordre, en lecture — « il n'y a rien
              // ici » et « ça se règle ailleurs » ne sont pas la même phrase.
              // Sa ligne libre, elle, reste écrivable: la RPC des habitudes n'a
              // pas de refus `has_account`, une habitude n'a pas de second
              // domicile.
              readOnly={m.claimed}
              busy={busy}
              habits={habits}
              onSaveNote={onSaveNote}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * UNE PERSONNE À TABLE — LA MÊME CARTE POUR TOUT LE MONDE.
 *
 * Trois blocs, toujours dans cet ordre: le régime, puis les moments avec leur
 * taille, puis la ligne libre. L'ordre n'est pas un goût — c'est celui de ce
 * qui ÉCARTE le plus: un régime rend un plat entier inexécutable, un moment
 * absent en rend un de trop, une préférence rend le plat moins juste.
 */
function PersonTableCard({
  firstName,
  memberId,
  diet,
  onDiet,
  rhythm,
  onRhythm,
  rhythmError,
  dietError,
  fallsBackToHouse,
  readOnly,
  busy,
  habits,
  onSaveNote,
}: {
  firstName: string;
  memberId: string | null;
  /** `null` = personne n'a demandé. JAMAIS rendu comme « mange de tout ». */
  diet: DietAnswer | null;
  onDiet: (diet: DietAnswer) => void;
  rhythm: readonly EatingOccasionSlot[];
  onRhythm: (next: readonly EatingOccasionSlot[]) => void;
  /** Le motif de l'étape, rendu SUR le champ qui le lève. */
  rhythmError: string | undefined;
  /** Idem pour le régime. `undefined` sur toute carte qui ne retient rien. */
  dietError: string | undefined;
  fallsBackToHouse: boolean;
  readOnly: boolean;
  busy: boolean;
  habits: Map<string, MemberHabitsView> | null;
  onSaveNote: (memberId: string, note: string | null) => Promise<boolean>;
  /* ⛔ AUCUNE CIBLE SUR CETTE CARTE — voir `TableStep` juste au-dessus. */
}) {
  const picked = new Map(rhythm.map((o) => [o.slot, o.size]));

  /**
   * COCHER / DÉCOCHER UN MOMENT — et l'ordre de sortie est celui de LA JOURNÉE.
   *
   * ⚠️ DÉCOCHER EMPORTE LA TAILLE, ET C'EST VOULU. On pourrait garder la taille
   * de côté pour la restituer si on recoche (c'est ce que fait
   * `EatingRhythmCard`, qui a un brouillon local et un bouton « Enregistrer »).
   * Ici, chaque clic EST l'écriture: garder une taille qu'aucun contrôle
   * n'affiche plus, pour la réécrire plus tard sur la ligne de quelqu'un, c'est
   * exactement le fait indémentable qu'on refuse partout ailleurs. Ce qui est à
   * l'écran est ce qui sera écrit.
   */
  const toggleSlot = (slot: EatingOccasion) => {
    const next = new Map(picked);
    if (next.has(slot)) next.delete(slot);
    else next.set(slot, null);
    onRhythm(
      EATING_OCCASIONS.filter((s) => next.has(s)).map((s) => ({
        slot: s,
        size: next.get(s) ?? null,
      })),
    );
  };

  /** Re-cliquer la taille active la retire: « il n'a pas dit » reste joignable. */
  const setSize = (slot: EatingOccasion, size: MealSize) => {
    const next = new Map(picked);
    next.set(slot, next.get(slot) === size ? null : size);
    onRhythm(
      EATING_OCCASIONS.filter((s) => next.has(s)).map((s) => ({
        slot: s,
        size: next.get(s) ?? null,
      })),
    );
  };

  return (
    <>
      <span className="text-base font-semibold text-ink">{firstName || "—"}</span>

      {/* ── ① LE RÉGIME ────────────────────────────────────────────────────
          RIEN N'EST PRÉ-ALLUMÉ. `null` veut dire « on n'a pas demandé », et
          c'est distinct d'« elle mange de tout »: allumer `omnivore` par défaut
          écrirait à l'écran une réponse que personne n'a donnée — et sur une
          question de sécurité alimentaire, ces deux-là ne sont pas la même
          chose.

          MÊMES BOUTONS, MÊME LISTE, MÊMES MOTS pour tout le monde
          (`DIET_ANSWERS` + `setup.people.diet_*`): deux jeux de libellés
          divergeraient, et l'écran offrirait à l'un une case que le moteur
          n'honore pas chez l'autre. */}
      <div className="mt-3">
        <Field
          label={t("setup.table.diet_label")}
          hint={t("setup.table.diet_hint")}
          error={dietError}
        >
          <div className="flex flex-wrap gap-2">
            {DIET_ANSWERS.map((answer) => (
              <Button
                key={answer}
                size="sm"
                variant={diet === answer ? "primary" : "secondary"}
                disabled={busy || readOnly}
                onClick={() => onDiet(answer)}
              >
                {t(`setup.people.diet_${answer}` as "setup.people.diet_omnivore")}
              </Button>
            ))}
          </div>
        </Field>
      </div>

      {/* ── ② LES MOMENTS, AVEC LEUR TAILLE ────────────────────────────────
          LA TAILLE N'APPARAÎT QUE SUR UN MOMENT COCHÉ: une taille à côté d'un
          moment qu'on ne prend pas est une question sans objet, et six d'entre
          elles font une carte illisible. Même règle et même vocabulaire que
          `EatingRhythmCard`, qui pose la même question dans « À propos de toi »
          — et le même `MEAL_SIZES`, parce que la base refuse un quatrième
          jeton (`bad_rhythm`) et que le moteur ne saurait pas le lire. */}
      <div className="mt-3">
        <Field
          label={t("setup.table.moments_label")}
          hint={t("setup.table.moments_hint")}
          error={rhythmError}
        >
          <ul className="space-y-2">
            {EATING_OCCASIONS.map((slot) => {
              const on = picked.has(slot);
              // ⛔ EMPILÉ, ET PAS UNE LIGNE — C'EST UNE MESURE, PAS UN GOÛT.
              // `EatingRhythmCard` met le moment et sa taille côte à côte; elle
              // vit dans une carte de premier niveau. Ici la rangée est au fond
              // de trois cadres (`Card`, la fiche de la personne `p-4`, la
              // rangée `px-3`): mesuré au navigateur à 320 px, « Gros » sortait
              // du cadre par la droite. Empilés, ils tiennent à toute largeur et
              // l'ordre de lecture reste celui de la décision — je mange à ce
              // moment, puis c'est gros.
              return (
                <li
                  key={slot}
                  className={`rounded-card border px-3 py-2 ${
                    on ? "border-ink bg-fig-50" : "border-line"
                  }`}
                >
                  {/* `accent-ink`, ET CE N'EST PAS DÉCORATIF: sans lui, une case
                      cochée prend la couleur d'accent du SYSTÈME — bleue sur
                      les réglages par défaut de macOS et de Windows. */}
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-ink"
                      checked={on}
                      disabled={busy || readOnly}
                      onChange={() => toggleSlot(slot)}
                    />
                    <span className="text-sm font-medium text-ink">
                      {occasionLabel(slot)}
                    </span>
                  </label>
                  {on ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-soft">
                        {t("meals.rhythm.size_label")}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {MEAL_SIZES.map((size) => {
                          const active = picked.get(slot) === size;
                          return (
                            <button
                              key={size}
                              type="button"
                              aria-pressed={active}
                              disabled={busy || readOnly}
                              onClick={() => setSize(slot, size)}
                              // MÊME VOCABULAIRE QUE `EatingRhythmCard`: une
                              // valeur retenue est un fait saisi, donc l'encre
                              // pleine et jamais la marque. `line-strong`
                              // (3,84:1) sur l'inactive parce que c'est la
                              // bordure d'un CONTRÔLE (WCAG 1.4.11).
                              className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                                active
                                  ? "border-ink bg-ink text-paper"
                                  : "border-line-strong text-ink hover:bg-fig-50"
                              }`}
                            >
                              {t(`setup.table.size_${size}` as "setup.table.size_small")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Field>
        {fallsBackToHouse ? (
          <p className="mt-2 text-xs text-ink-soft">{t("setup.table.same_as_house")}</p>
        ) : null}
        {readOnly ? (
          <p className="mt-2 text-xs text-ink-soft">{t("setup.table.from_profile")}</p>
        ) : null}
      </div>

      {/* ── ③ LA LIGNE LIBRE ───────────────────────────────────────────────
          Ce que cette personne mange VRAIMENT, en toutes lettres: « le matin je
          mange des fruits, une pizza le vendredi soir ». Les deux blocs
          au-dessus disent ce qu'on ne franchit pas et QUAND on mange; celui-ci
          dit ce qu'il y a dans l'assiette quand ce n'est pas le plat de la
          maison.

          ⚠️ SANS FOYER, PAS DE LIGNE — et on n'affiche donc pas le champ.
          `household_member_habits` est clée sur un `member_id`: rendre un
          champ qui ne peut pas s'enregistrer serait pire que son absence,
          parce qu'il promet. */}
      {memberId !== null ? (
        <div className="mt-3">
          <PersonNoteField
            memberId={memberId}
            habits={habits}
            busy={busy}
            onSave={onSaveNote}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * LA LIGNE LIBRE D'UNE PERSONNE — et sa garde de chargement.
 *
 * ⚠️ LE CHAMP N'EXISTE PAS AVANT LA LECTURE, et c'est la seule forme qui
 * tienne: le `useState` ci-dessous est initialisé depuis ce qui a été LU, et il
 * ne s'initialise qu'une fois. Un formulaire figé au montage sur du vide
 * affiche ce vide, puis l'ÉCRASE au premier Save — cicatrice
 * `mount-snapshot-forms-need-a-loading-gate`. `habits === null` veut dire « la
 * lecture n'a pas eu lieu »; une Map vide veut dire « lu, personne n'a rien
 * dit », et ce sont deux états différents.
 */
function PersonNoteField({
  memberId,
  habits,
  busy,
  onSave,
}: {
  memberId: string;
  habits: Map<string, MemberHabitsView> | null;
  busy: boolean;
  onSave: (memberId: string, note: string | null) => Promise<boolean>;
}) {
  if (habits === null) {
    return (
      <Field label={t("setup.table.note_label")} hint={t("setup.table.note_hint")}>
        <p className="text-sm text-ink-soft">{t("household.habits.loading")}</p>
      </Field>
    );
  }
  return (
    <NoteEditor
      // LA SIGNATURE DE CE QUI A ÉTÉ LU. Un rafraîchissement qui rapporte autre
      // chose que ce qu'on a tapé REMONTE le champ: c'est la vérité du serveur
      // qui gagne, et elle s'affiche au lieu de rester cachée sous un brouillon.
      // Une lecture identique ne change pas la clé, donc la saisie en cours
      // survit à un rafraîchissement de fond.
      key={`${memberId}:${habits.get(memberId)?.note ?? ""}`}
      note={habits.get(memberId)?.note ?? ""}
      busy={busy}
      onSave={(note) => onSave(memberId, note)}
    />
  );
}

/** Le champ lui-même — monté SEULEMENT une fois la lecture faite. */
function NoteEditor({
  note: initial,
  busy,
  onSave,
}: {
  note: string;
  busy: boolean;
  onSave: (note: string | null) => Promise<boolean>;
}) {
  const [note, setNote] = React.useState(initial);
  const [saved, setSaved] = React.useState(false);

  return (
    <Field label={t("setup.table.note_label")} hint={t("setup.table.note_hint")}>
      {/* `break-words` NON: c'est un `textarea`, il enroule tout seul. Le
          `maxLength` est celui du SERVEUR, importé (`DRAFT_NOTE_MAX_CHARS`):
          une seconde constante ici divergerait au premier ajustement, et
          l'écran aurait tort contre la base — donc un refus que personne ne
          peut anticiper. */}
      <textarea
        className={inputClass}
        rows={3}
        maxLength={DRAFT_NOTE_MAX_CHARS}
        placeholder={t("setup.table.note_placeholder")}
        value={note}
        disabled={busy}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={async () => {
            // `null` EFFACE, la chaîne vide n'est pas exprimable: la base
            // refuse le vide (`bad_note`, 1..280), et « j'ai effacé ce que
            // j'avais écrit » arrive donc comme `null`. Même forme que
            // `setMemberRhythm` avec son `empty_rhythm`.
            const ok = await onSave(note.trim() || null);
            if (ok) setSaved(true);
          }}
        >
          {t("household.habits.save")}
        </Button>
        {saved ? (
          <span className="text-xs text-emerald-700">{t("household.habits.saved")}</span>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * ÉTAPE 4 — LA DEMANDE DE CE PLAN-LÀ.
 *
 * ── LA COUPURE DU 2026-08-13, ET CE QU'ELLE SÉPARE ────────────────────────
 * Cette carte portait AUSSI les moments où on mange. Deux natures de question
 * dans le même cadre: « à quels moments cette maison mange » ne change pas
 * d'une semaine sur l'autre, « quels jours je peux cuisiner CETTE semaine,
 * combien de temps j'ai, combien je veux dépenser » change à chaque fois.
 *
 * Les mélanger avait un coût mesuré: on lisait un bouton gris et une liste de
 * ce qui manque, sans faire le lien avec des rangées vides plus haut dans la
 * même carte. Et surtout, ça rangeait des entrées de PLAN dans les réglages
 * d'une PERSONNE — d'où « À propos de toi » qui décidait des jours de cuisine
 * de toutes les semaines à venir.
 *
 * Ce qui est ici est donc, et seulement, ce qu'on redemande à chaque
 * composition. La plateforme pose les mêmes trois questions au même moment
 * (`MealBuilder`, la carte de composition du foyer).
 */
function RequestStep({
  draft,
  onChange,
  missing,
  windowStart,
  windowEnd,
  onWindowStart,
  onWindowEnd,
  maxEnd,
  mouths,
  planWindow,
  awayFor,
  onAwayFor,
  awayBusy,
  rhythm,
  onAwaySaved,
  cookingShape,
  onCookingShape,
  oneCookingSession,
  onOneCookingSession,
  askCookingShape,
  envy,
  onEnvy,
  askEnvy,
  hasFreezer,
}: {
  draft: FunnelPlanAnswers;
  onChange: React.Dispatch<React.SetStateAction<FunnelPlanAnswers | null>>;
  missing: readonly FunnelMissId[];
  windowStart: string;
  windowEnd: string;
  onWindowStart: (value: string) => void;
  onWindowEnd: (value: string) => void;
  maxEnd: string;
  mouths: readonly FunnelMouth[];
  planWindow: {
    startsOn: string;
    durationDays: number;
    tokens: readonly string[];
    dates: readonly string[];
  };
  awayFor: string | null;
  onAwayFor: (memberId: string | null) => void;
  awayBusy: boolean;
  rhythm: readonly EatingOccasionSlot[];
  onAwaySaved: (mouth: FunnelMouth, next: AwayDay[]) => void;
  /**
   * LOT B — LE MODE DE CUISSON DEMANDÉ. `null` = « laisse décider », le défaut.
   *
   * ⚠️ IL N'EST PAS DANS `draft` (`FunnelPlanAnswers`), ET C'EST LE POINT. Tout
   * ce que porte `draft` est ÉCRIT dans `practical_constraints` par
   * `savePlanAnswers` — c'est-à-dire appliqué en silence à toutes les semaines
   * suivantes. Ce choix-ci se refait à chaque composition: l'y ranger en aurait
   * fait le réglage de profil que ce lot a refusé d'écrire.
   */
  cookingShape: CookingShape | null;
  /**
   * L'ENVIE DE LA MAISON POUR CETTE SEMAINE-CI.
   *
   * ⚠️ REQUISE, jamais optionnelle: un `?` ferait de la question un champ mort
   * chez l'appelant qui l'oublie, et le premier plan se composerait sans envie
   * — exactement l'état d'avant ce lot, sans un seul rouge.
   */
  envy: string;
  onEnvy: (value: string) => void;
  /**
   * ⛔ SEULEMENT SUR LA LANE FOYER. La table est clé sur un foyer; un solo
   * porte son envie dans `preferences`, un autre canal. La question posée à
   * quelqu'un dont la réponse ne va nulle part est pire que pas de question.
   */
  askEnvy: boolean;
  onCookingShape: (next: CookingShape | null) => void;
  /**
   * « TOUT CUISINER EN UNE SEULE FOIS » — 2026-09-01.
   *
   * ⚠️ REQUIS, jamais `?`, et pas dans `draft`: comme `cookingShape`, il ne
   * s'écrit nulle part. Il part avec la demande, et la semaine d'après repose
   * la question. Un `?` ici aurait laissé le champ se monter sans être branché.
   */
  oneCookingSession: boolean;
  onOneCookingSession: (next: boolean) => void;
  /**
   * LA QUESTION A-T-ELLE UN SUJET ? Décidé par l'appelant, qui connaît le
   * roster: « un seul plat pour tout le monde » n'a pas de sens à une bouche,
   * et la lane individuelle n'accepte pas le champ. REQUIS, jamais optionnel.
   */
  askCookingShape: boolean;
  /**
   * CE FOYER A-T-IL DÉCLARÉ UN CONGÉLATEUR ? — 2026-09-01.
   *
   * ⚠️ REQUIS, jamais `?`. Un défaut à `false` annoncerait des journées hors de
   * portée à un foyer équipé — c'est-à-dire promettre à l'écran l'inverse de ce
   * que le moteur fera; un défaut à `true` ferait taire la phrase pour tout le
   * monde, et le lot serait construit sans être branché.
   *
   * Lu par l'appelant, dans la MÊME colonne que le moteur.
   */
  hasFreezer: boolean;
}) {
  // ══════════════════════════════════════════════════════════════════════
  // CE QUI EST TAPÉ N'EST PAS ENCORE UNE DATE — et sans ce brouillon, la
  // page entière tombe.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT, ET IL EST ATTEIGNABLE EN DEUX GESTES. Ces deux champs
  // écrivaient `e.target.value` DIRECTEMENT dans l'état de la fenêtre. Or un
  // `<input type="date">` rend `""` dès qu'on le vide, et `""` traverse
  // `planWindow` jusqu'à `daysBetween` → `assertIsoDate`, qui JETTE (R7: une
  // date malformée est un throw, jamais un jour décalé en silence). Le throw
  // part PENDANT LE RENDU, donc l'ErrorBoundary emporte l'écran d'entonnoir —
  // sur un compte neuf, au moment où il compose son premier plan.
  //
  // C'est le défaut que `MealBuilder` a réparé le 2026-08-18; l'entonnoir ne
  // l'avait jamais reçu. La garde n'est pas touchée: le BROUILLON porte ce qui
  // est tapé, l'ÉTAT porte ce qui est valide, et une date incomplète ne bouge
  // simplement pas encore la fenêtre.
  //
  // Les deux effets rendent au champ ce que le bornage a corrigé — sans eux,
  // l'écran afficherait une date que le calcul n'utilise pas.
  const [startDraft, setStartDraft] = React.useState(windowStart);
  const [endDraft, setEndDraft] = React.useState(windowEnd);
  React.useEffect(() => setStartDraft(windowStart), [windowStart]);
  React.useEffect(() => setEndDraft(windowEnd), [windowEnd]);

  return (
    <>
      <Card>
        <SectionLabel>{t("setup.request.title")}</SectionLabel>
        <p className="mt-2 text-sm text-ink-soft">{t("setup.request.intro")}</p>

        <div className="mt-4 space-y-4">
          {/* ── LES DATES, ET C'EST LA QUESTION QUI MANQUAIT ────────────────
              `compose()` envoyait « d'ici dimanche » sans jamais le demander:
              un compte créé un samedi recevait un plan d'un jour et demi, et
              personne ne pouvait dire « je pars jeudi, fais-moi trois jours ».

              Deux dates plutôt qu'une durée: on choisit une semaine dans un
              calendrier, pas un nombre. Le plafond de sept jours est celui de
              la base (`duration_days between 1 and 7`), et il est porté par le
              `max` du second champ — un refus qu'on peut rendre inexprimable
              ne doit pas exister. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("setup.request.from")} htmlFor="setup-window-start">
              <input
                id="setup-window-start"
                type="date"
                // ── LES DEUX BORNES, PORTÉES DE `MealBuilder` ────────────
                // Elles y vivent depuis le 2026-08-12 et l'entonnoir ne les
                // a jamais reçues, alors que c'est LUI qui compose le premier
                // plan d'un compte. Un refus qu'on peut rendre inexprimable
                // ne doit pas exister.
                //
                // `min`: un départ dans le passé est refusé par
                // `resolveRequestedWindow` (400 `bad_window`), après un
                // aller-retour, sous un motif qui parle des JOURS.
                //
                // `max`: un plan est écrit en NOMS DE JOURS, et sept jetons
                // ne nomment pas plus loin que ce dimanche-ci. Le serveur
                // reste l'autorité (`window_beyond_this_week`, avec le vrai
                // fuseau de l'élève); ces bornes évitent de PROPOSER le geste.
                min={browserLocalDate()}
                max={lastNameableStart(browserLocalDate())}
                value={startDraft}
                onChange={(e) => {
                  const typed = e.target.value;
                  // Une demi-date ne bouge pas encore la fenêtre — voir le
                  // pavé du brouillon plus haut.
                  if (!isIsoDate(typed)) {
                    setStartDraft(typed);
                    return;
                  }
                  // ⚠️ LE RATTRAPAGE EST LA MÊME RÈGLE QUE CELLE DE MINUIT,
                  // APPELÉE — jamais une seconde. `catchUpWindowStart` ne
                  // corrige QUE le passé: une date posée plus loin
                  // volontairement reste où la personne l'a mise.
                  //
                  // ⚠️ ET LE CHAMP MONTRE LE DÉPLACEMENT. Ramener la fenêtre
                  // dans l'état sans ramener le brouillon afficherait le 29
                  // au-dessus d'un plan qui part du 31 — un formulaire qui
                  // dit autre chose que ce qu'il enverra.
                  const clamped = catchUpWindowStart(typed, browserLocalDate());
                  setStartDraft(clamped);
                  onWindowStart(clamped);
                }}
                className={inputClass}
              />
            </Field>
            <Field
              label={t("setup.request.to")}
              hint={t("setup.request.window_hint")}
              htmlFor="setup-window-end"
            >
              <input
                id="setup-window-end"
                type="date"
                value={endDraft}
                min={windowStart}
                max={maxEnd}
                onChange={(e) => {
                  const typed = e.target.value;
                  setEndDraft(typed);
                  if (isIsoDate(typed)) onWindowEnd(typed);
                }}
                className={inputClass}
              />
            </Field>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              QUAND LA CUISINE A LIEU — LES DEUX SEULES QUESTIONS QUI RESTENT,
              ET ELLES VIVENT AVEC LES DATES.
              ══════════════════════════════════════════════════════════════

              ⛔ ELLES ONT REMPLACÉ « LES JOURS OÙ TU CUISINES » (retiré le
              2026-09-01). Le plan ne demande plus QUELS jours on cuisine — il
              pose ses sessions lui-même — et il ne reste que deux choses que
              la personne seule peut savoir: est-ce que tout tient en une fois,
              et est-ce qu'elle peut s'y mettre la veille.

              ⚠️ LEUR PLACE EST ICI PARCE QU'ELLES PARLENT DE CALENDRIER.
              « Je cuisine la veille » RECULE la date de début juste au-dessus:
              les séparer ferait lire un décalage de date sans le geste qui le
              cause. Et l'ordre compte — d'abord QUAND commence la cuisine,
              ensuite si elle tient en une fois. */}
          <OneCookingSessionField
            id="setup-one-cooking-session"
            value={oneCookingSession}
            onChange={onOneCookingSession}
            disabled={false}
            hasFreezer={hasFreezer}
          />

          {/* ── QUI EST LÀ, JOUR PAR JOUR — CONTRE LES DATES, ET REPLIÉ ─────
              L'étape 3 dit l'HABITUDE; ceci dit LA SEMAINE. C'est le tableau
              de présence dimensionné par les deux dates du dessus: une colonne
              par jour demandé, une ligne par moment de la maison.

              ⚠️ C'ÉTAIT UNE CARTE À PART, TOUT EN BAS DE L'ÉTAPE — et c'est le
              défaut corrigé le 2026-09-01. Il ne peut PAS exister sans les
              dates (sans fenêtre, il n'a pas de colonnes), et il vivait
              pourtant à quatre champs de distance, sous le budget et l'envie.
              Les deux questions n'en font qu'une: elles sont maintenant
              adjacentes, dans le même cadre.

              ⚠️ REPLIÉ, ET C'EST LA NATURE DU CHAMP. La plupart des semaines
              n'ont aucune absence — « tout le monde est là » est déjà juste, et
              déplier ne sert qu'à celui qui a quelque chose à RETIRER. Un
              `<details>` natif, pas un état React: il n'y a rien à se rappeler
              d'un rendu à l'autre, et le repli ne démonte pas les grilles (le
              navigateur les cache, React les garde montées).

              La grille est celle de `/app/plan` et `/app/household`
              (`MealPickerGrid`), pas une seconde: elle écrit `away_days` par
              bouche, elle reprend les jours HORS fenêtre tels quels, et une
              deuxième implémentation aurait fini par en effacer la moitié. */}
          {mouths.length > 0 && rhythm.length > 0
            ? (
              <details className="group rounded-card border border-line-strong bg-paper p-4">
                {/* `list-none` retire le triangle natif — remplacé par un
                    chevron qui tourne à l'ouverture. Le résumé porte le rôle
                    d'étiquette (`text-label`), comme les `Field` d'à côté: c'est
                    une entrée du même formulaire, pas une carte invitée. */}
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="text-label font-semibold uppercase text-ink-soft">
                    {t("setup.request.presence_title")}
                    {" "}
                    <span className="font-normal normal-case">
                      ({t("setup.request.presence_optional")})
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  {t("setup.request.presence_intro")}
                </p>
                <ul className="mt-4 space-y-3">
                  {mouths.map((m) => (
                    <li
                      key={m.memberId ?? m.firstName}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-strong bg-fig-50/40 p-4"
                    >
                      <span className="text-base font-semibold text-ink">
                        {m.firstName || "—"}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={awayBusy}
                        onClick={() =>
                          onAwayFor(awayFor === m.memberId ? null : m.memberId)}
                      >
                        {t("setup.request.presence_open")}
                      </Button>
                      {/* MONTÉE MÊME FERMÉE — `Modal` rend `null` sans démonter
                          — donc une grille modifiée survit à une fermeture
                          accidentelle. Même posture que sur la page du foyer. */}
                      <MealPickerGrid
                        open={awayFor === m.memberId}
                        onClose={() => onAwayFor(null)}
                        days={planWindow.tokens}
                        dates={planWindow.dates}
                        // La taille voyage avec le moment depuis le 2026-08-14:
                        // plus de `size: null` fabriqué, plus de `as` — un `as`
                        // sur un type étranger désarme le typecheck.
                        //
                        // ⚠️ SON RYTHME À ELLE, PAS CELUI DE LA MAISON. C'était
                        // `rhythm={rhythm}` — les moments du TITULAIRE — pour
                        // chaque bouche. Quelqu'un qui vient de déclarer à
                        // l'étape 3 que Christèle ne prend pas de petit-déjeuner
                        // ouvrait cette grille et y trouvait sept petits-
                        // déjeuners cochés à son nom: la réponse qu'il venait de
                        // donner, contredite à l'écran, et à recocher sept fois
                        // pour la redire. Signalé le 2026-08-15.
                        //
                        // `null` = personne ne l'a dit ⇒ elle mange aux moments
                        // de la maison, et c'est LÀ que le repli est légitime —
                        // il est la règle du produit, pas un remplissage par
                        // défaut.
                        rhythm={m.eatingSlots ?? rhythm}
                        // Ce qui est déjà marqué pour elle. `[]` était écrit en
                        // dur, et la grille n'avait donc AUCUN jour hors fenêtre
                        // à reprendre: enregistrer effaçait en silence toute
                        // absence posée en dehors des sept colonnes affichées.
                        away={m.away}
                        busy={awayBusy}
                        onSave={(next) => onAwaySaved(m, next)}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )
            : null}

          {/* ══════════════════════════════════════════════════════════════
              ⛔ « LES JOURS OÙ TU CUISINES » A ÉTÉ RETIRÉ — 2026-09-01
              ══════════════════════════════════════════════════════════════

              Décision produit. La rangée des sept jours vivait ici, et
              l'avertissement « ces jours-là seraient à cuisiner sur le moment »
              en découlait. Les deux partent ensemble: l'avertissement se
              CALCULAIT sur les jours déclarés (`daysOutOfBatchReach`), et sans
              eux il ne peut plus rien annoncer — le garder aurait été une ligne
              qui ne sort jamais, c'est-à-dire un lot désarmé qui ressemble à un
              lot qui marche.

              Ce qui reste de la question — QUAND tombe la cuisine — est posé
              plus haut, avec les dates: « tout cuisiner en une seule fois » et
              « je cuisine la veille ».

              ⚠️ CÔTÉ MOTEUR RIEN N'EST RETIRÉ. `daysOutOfBatchReach` reste
              appelé par les deux lanes et par l'explication; il se tait
              simplement, parce qu'aucun jour n'est déclaré — « le silence est
              la seule affirmation vraie » (en-tête de `plan_feasibility.ts`).
              Il reparle pour tout compte dont `cook_days` n'a pas encore été
              réécrit vide. */}

          {/* ── DES DURÉES, PAS UN NOMBRE À INVENTER ──────────────────────
              Le champ était libre (5 à 240) et ne voulait rien dire: « 37 »
              n'est pas une réponse qu'un humain a. Le moteur écrit de toute
              façon « about ${n} minutes » — un nombre exact y est une fausse
              précision.

              ⚠️ UNE VALEUR HORS LISTE GARDE SA PLACE. La carte de `/app/plan`
              conserve son champ libre: quelqu'un qui y a saisi 37 doit
              retrouver « 37 min » sélectionné ici, et pas une rangée où rien
              n'est coché au-dessus d'une valeur pourtant enregistrée. */}
          {/* ══════════════════════════════════════════════════════════════
              ⟳ P2 (2026-09-03) — DEUX QUESTIONS REMPLACENT « COMBIEN DE TEMPS
              DURE UNE SESSION DE CUISINE ».
              ══════════════════════════════════════════════════════════════

              ⛔ CE QUI PARTAIT D'ICI, ET POURQUOI. Six pastilles de durée
              (30 min → 3 h), BLOQUANTES dans l'entonnoir. C'est une question
              d'ingénieur: personne ne sait répondre « 45 » avant d'avoir vu le
              plan, et la réponse ne dit rien de ce qu'on veut savoir — est-ce
              que cette personne aime cuisiner, et combien de fois par semaine
              elle accepte de passer au magasin.

              `cooking_time_min` n'est PAS supprimée pour autant: cinq lecteurs
              la lisent, et elle est maintenant DÉRIVÉE du style
              (`_shared/keel/cooking_plan.ts`). Les comptes qui l'ont déjà
              gardent leur valeur tant qu'ils n'ont pas répondu aux deux
              questions ci-dessous.

              ⚠️ L'ORDRE COMPTE, ET IL EST L'INVERSE DE L'ÉVIDENCE. Le style
              d'abord, la cadence de courses ensuite: c'est le style qui
              PLAFONNE le nombre de sessions, donc lire « trois courses » avant
              de savoir qu'on cuisine le moins possible ferait attendre trois
              séances de cuisine que le plan ne fera pas. */}
          <CookingStyleField
            id="setup-cooking-style"
            value={draft.cookingStyle}
            onChange={(next) =>
              onChange((prev) => prev === null ? prev : { ...prev, cookingStyle: next })}
            disabled={false}
          />

          <GroceryRunsField
            id="setup-grocery-runs"
            value={draft.groceryRuns}
            onChange={(next) =>
              onChange((prev) => prev === null ? prev : { ...prev, groceryRuns: next })}
            disabled={false}
          />

          {/* ── UN CHIFFRE, ET PLUS TROIS PASTILLES ────────────────────────
              « Serré / normal / confortable » partait au modèle tel quel, et
              ces trois mots ne désignent pas la même semaine selon la table.
              Un montant se compare au panier: c'est ce qui permet de RENONCER
              À LA VIANDE plutôt que de « faire attention ».

              Pas de symbole monétaire: il faudrait une table pays → devise,
              c'est-à-dire une liste fermée qui refuserait un pays légitime le
              jour où quelqu'un s'y inscrit. Le prompt, lui, porte déjà le
              pays. */}
          <Field
            label={t("setup.plan.budget")}
            hint={t("setup.plan.budget_hint")}
            htmlFor="setup-budget"
          >
            <input
              id="setup-budget"
              type="number"
              inputMode="decimal"
              min={1}
              max={BUDGET_MAX}
              step="1"
              value={draft.budgetAmount === null ? "" : String(draft.budgetAmount)}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const amount = raw === "" ? null : Number(raw);
                onChange((prev) =>
                  prev === null ? prev : {
                    ...prev,
                    // `Number("")` vaut 0 et EST fini — le piège qui avait déjà
                    // affiché une taille pré-remplie à 0 sur un compte neuf.
                    budgetAmount: amount === null || !Number.isFinite(amount)
                      ? null
                      : amount,
                  }
                );
              }}
              className={inputClass}
            />
          </Field>

          {/* ── LOT B · COMMENT ON CUISINE CETTE SEMAINE ──────────────────
              À CÔTÉ DES TROIS AUTRES ENTRÉES DE PLAN, et pour la même raison
              qu'elles sont ici: c'est une propriété de la SEMAINE qu'on
              commande, pas de la personne. Le MÊME champ que `MealBuilder`,
              jamais un second — deux champs écrits séparément divergeraient au
              premier libellé retouché.

              ⛔ SEULEMENT À PLUSIEURS BOUCHES. « Un seul plat pour tout le
              monde » n'a pas de sujet quand on mange seul, et la lane
              individuelle n'accepte pas le champ: le poser quand même ferait
              une question dont la réponse ne va nulle part. */}
          {askCookingShape
            ? (
              <CookingShapeField
                id="setup-cooking-shape"
                value={cookingShape}
                onChange={onCookingShape}
                disabled={false}
              />
            )
            : null}

          {/* ══════════════════════════════════════════════════════════════
              CE DONT LA MAISON A ENVIE — le champ qui manquait à l'étape 3.
              ══════════════════════════════════════════════════════════════

              ── LE DÉFAUT (2026-08-20) ──────────────────────────────────
              La doctrine de l'entonnoir décrit `request` comme « quand je peux
              cuisiner, combien de temps, combien je veux dépenser, ET CE DONT
              J'AI ENVIE ». Les trois premières y étaient; la quatrième non.
              Le premier plan d'un foyer se composait donc sans qu'on ait
              jamais demandé ce qu'il avait envie de manger.

              ⚠️ LE CANAL EXISTAIT DÉJÀ, ENTIER. `household_envy_submissions`
              est lue par le générateur PAR SEMAINE (`envyLine`), et le même
              champ vit dans `MealBuilder`. Il ne manquait que la question, ici.

              ⛔ LE MÊME CHAMP, PAS UN SECOND. Même clé i18n, même écrivain
              (`submitEnvy`), même ancre de semaine. Deux champs écrits
              séparément divergeraient au premier libellé retouché — et ici la
              divergence se lirait comme une envie qui disparaît d'un écran à
              l'autre.

              ⛔ SEULEMENT SUR LA LANE FOYER. `household_envy_submissions` est
              clé sur un foyer; la lane individuelle porte son envie dans
              `preferences`, un autre canal. Poser la question à un solo ferait
              une réponse qui ne va nulle part. */}
          {askEnvy
            ? (
              <Field
                label={t("plan.envy.title")}
                hint={t("plan.envy.body")}
                htmlFor="setup-envy"
              >
                <textarea
                  id="setup-envy"
                  className={`${inputClass} min-h-16`}
                  value={envy}
                  maxLength={ENVY_MAX_CHARS}
                  placeholder={t("plan.envy.placeholder")}
                  onChange={(e) => onEnvy(e.target.value)}
                />
              </Field>
            )
            : null}
        </div>
      </Card>

      {missing.length > 0 ? <MissingCard missing={missing} title="setup.missing.title" /> : (
        <p className="text-xs text-ink-soft">{t("setup.plan.compose_hint")}</p>
      )}
    </>
  );
}

/**
 * L'ATTENTE DE LA COMPOSITION, DITE PENDANT QU'ELLE DURE.
 *
 * ── POURQUOI HUIT PHRASES ET PAS UN SABLIER ────────────────────────────────
 * Composer une semaine prend des dizaines de secondes: le modèle écrit, le
 * serveur vérifie, la liste de courses se construit. Un libellé figé
 * (« Construction en cours… ») pendant deux minutes se lit comme un écran
 * planté — la personne appuie une deuxième fois, ou quitte. Ce qui distingue
 * « ça travaille » de « c'est mort » n'est pas une animation, c'est du TEXTE
 * QUI CHANGE: il prouve que quelque chose avance encore.
 *
 * ⚠️ CE QUE CES PHRASES NE FONT PAS: elles ne prétendent PAS lire l'avancement
 * réel. La fonction edge ne rend rien avant d'avoir fini, donc une barre à
 * pourcentage serait inventée de bout en bout — un fait indémentable de plus.
 * Elles disent ce que la composition FAIT, dans l'ordre où elle le fait, et
 * c'est vrai sans être mesuré.
 *
 * ── LA CADENCE ────────────────────────────────────────────────────────────
 * Huit messages, quinze secondes chacun: deux minutes, la durée demandée. Au
 * bout, le dernier RESTE affiché — on ne reboucle pas sur « on démarre », qui
 * ferait croire que tout recommence, ni sur une phrase de fin, qui promettrait
 * une réponse qui n'est pas arrivée.
 *
 * Le composant est monté par `busy` et démonté avec lui: chaque composition
 * repart donc du premier message, sans qu'aucun `useEffect` de remise à zéro
 * ait à exister.
 */
const COMPOSING_MESSAGES = 8;
const COMPOSING_TICK_MS = 15_000;

function ComposingLabel() {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (index >= COMPOSING_MESSAGES - 1) return;
    const id = globalThis.setTimeout(
      () => setIndex((n) => n + 1),
      COMPOSING_TICK_MS,
    );
    return () => globalThis.clearTimeout(id);
  }, [index]);

  return (
    <>
      <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
      {/* `aria-live` et pas seulement du texte: le bouton est désactivé
          pendant l'attente, donc son libellé n'est plus annoncé au focus. Sans
          région vivante, un lecteur d'écran n'apprendrait jamais que ça
          avance. */}
      <span aria-live="polite">
        {t(
          `setup.plan.composing_${index + 1}` as "setup.plan.composing_1",
        )}
      </span>
    </>
  );
}

/**
 * CE QUI MANQUE, DIT PAR SON MOTIF.
 *
 * Un bouton gris sans explication est la moitié d'un refus — et le motif de D1
 * dit ce que l'absence COÛTE, pas seulement qu'un champ est vide.
 *
 * Le même bloc sert aux deux étapes qui peuvent retenir. Deux rendus, ce serait
 * deux vocabulaires pour un seul verdict: `canGenerateMisses`.
 */
/**
 * CE QUI RETIENT L'ÉTAPE 2, RANGÉ PAR PERSONNE.
 *
 * ⚠️ ELLE REMPLACE UNE LISTE PLATE, et c'est la demande du 2026-08-19: « ça
 * doit signaler précisément chez qui manque quoi ». Avec quatre personnes à
 * table, « il manque une date de naissance » envoyait relire quatre cartes.
 *
 * ⚠️ LE TITULAIRE EST NOMMÉ « toi », pas par son prénom: c'est la voix de tout
 * l'écran depuis le même jour, et lire son propre prénom dans une liste de
 * reproches se lit comme si l'écran parlait de quelqu'un d'autre.
 */
function BlockersCard({ blockers }: { blockers: readonly StepBlocker[] }) {
  return (
    <Card tone="dashed">
      <SectionLabel>{t("setup.missing.before_next")}</SectionLabel>
      <ul className="mt-2 space-y-3">
        {blockers.map((b) => (
          <li key={b.who ?? "\u0000self"}>
            <span className="block text-sm font-semibold text-ink">
              {b.who === null
                ? t("setup.missing.for_you")
                : b.who.trim() || t("household.mouth.who_fallback")}
            </span>
            <ul className="mt-1 space-y-1">
              {b.missing.map((miss) => (
                <li key={miss} className="text-sm leading-6 text-ink-soft">
                  {t(setupMissKey(miss))}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MissingCard(
  { missing, title }: {
    missing: readonly FunnelMissId[];
    /**
     * ⚠️ REQUIS, ET C'EST UN DÉFAUT VU À L'ÉCRAN. Le titre était en dur:
     * « avant de pouvoir le construire ». Juste, sur la dernière étape — elle
     * construit. Absurde sur les autres: on lisait « avant de pouvoir le
     * construire — quand tu manges » sous un formulaire qui pose cette
     * question et qui ne construit rien. Une phrase par étape, et le
     * compilateur réclame laquelle.
     */
    title: MessageKey;
  },
) {
  return (
    <Card tone="dashed">
      <SectionLabel>{t(title)}</SectionLabel>
      <ul className="mt-2 space-y-1">
        {missing.map((miss) => (
          <li key={miss} className="text-sm leading-6 text-ink">
            {t(setupMissKey(miss))}
          </li>
        ))}
      </ul>
    </Card>
  );
}
