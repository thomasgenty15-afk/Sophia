// KEEL — L'ENTONNOIR D'ENTRÉE (FF-060): décisions pures d'un côté, écran de
// l'autre. Même partage que `coachSeat.ts` et `household.ts`.
//
// Autorité produit: docs/fonctionnalites/acquisition-et-acces/FF-060-le-parcours-d-entree.md
//
// ── CE QUE CE MODULE EXISTE POUR EMPÊCHER ──────────────────────────────────
//
// Avant lui, tout le réglage d'un compte neuf vivait derrière un bouton
// « Set up » d'une fenêtre de `/app/plan`, et personne ne savait dans quel
// ordre répondre ni ce qui manquait encore pour obtenir un plan. Le mot
// « onboarding » n'existait nulle part dans `frontend/src/keel`.
//
// La tentation, en écrivant l'écran, est de laisser la question « est-ce qu'on
// peut générer maintenant ? » se répondre dans le JSX, à peu près, à côté du
// bouton. C'est le bug de six mois plus tard: deux vérités divergentes sur ce
// qui manque — celle qui active le bouton, et celle que le serveur applique —,
// et le jour où elles se séparent l'utilisateur voit un bouton actif qui rend
// une erreur, ou un bouton gris sans savoir pourquoi.
//
// `canGenerate` est donc la SEULE source qui active le bouton de fin, et
// `funnelSteps` la seule qui décide de ce qui s'affiche.
//
// ── LA RÈGLE QUI TRIE CHAQUE QUESTION ──────────────────────────────────────
//
//   Si la réponse manque, le premier plan est-il FAUX, ou seulement MOINS BON ?
//   FAUX      → `weight: "wrong"`, dans l'entonnoir.
//   MOINS BON → `weight: "better"`, après le plan, devant le plat que ça change.
//
// §6.1 de `docs/keel/PIVOT-FOYER.md` liste huit attributs par personne. Huit ×
// quatre personnes = 32 champs avant de voir quoi que ce soit: c'est ÇA qui tue
// l'activation, pas la famille. Le sous-ensemble « faux si absent » en fait
// trois par bouche — le prénom, l'âge et/ou l'objectif, les allergies.
//
// ── ET LA RÈGLE MÈRE DU DÉPÔT, DEVENUE DU CODE ─────────────────────────────
//
//   On ne collecte une donnée que si quelque chose en aval la consomme.
//
// Elle n'est tenable que si elle est écrite À CÔTÉ de la question: d'où
// `FunnelQuestion.consumer`, obligatoire, et un test qui RÉSOUT ce chemin sur
// le disque. Une question dont le consommateur a été supprimé fait rougir la
// suite le jour de la suppression, pas six mois plus tard quand quelqu'un se
// demande à quoi sert ce champ.

import {
  assessBirthDate,
  type BirthDateVerdict,
} from "../../../../supabase/functions/_shared/keel/student_age.ts";
import { type MemberGender, type MemberGoal, MEMBER_GOALS } from "./household";

// ───────────────────────────────────────────────────────────────────────────
// LE VOCABULAIRE
// ───────────────────────────────────────────────────────────────────────────

/**
 * LES TROIS BRANCHES, ET CE NE SONT PAS DES PERSONAS.
 *
 * L'étape 1 pose UNE question — « pour combien de personnes tu cuisines ? » —
 * et les trois réponses SONT les trois cibles du produit: le solo en meal prep,
 * le couple à objectifs divergents, la famille. Le nombre est aussi ce qui
 * dimensionne le plan, donc la question paie deux fois.
 *
 * ⚠️ `solo` NE CRÉE PAS DE FOYER. Le chemin individuel fonctionne déjà sans, et
 * un foyer d'une personne est un objet à maintenir pour zéro service rendu.
 * C'est §5 de `PIVOT-FOYER.md` pris au mot: « l'entrée est à 1, la famille est
 * l'upgrade ».
 */
export type FunnelBranch = "solo" | "pair" | "family";

/** Les trois étapes du §3.2 de la fiche, dans l'ordre où elles se posent. */
export type FunnelStepId = "situate" | "people" | "plan";

export type FunnelQuestionId =
  // Étape 1
  | "household_size"
  // Étape 2 — moi
  | "own_first_name"
  | "own_birth_date"
  | "own_height_cm"
  | "own_gender"
  | "own_goal"
  | "own_allergies"
  // Étape 2b — les autres bouches
  | "member_first_name"
  | "member_birth_date"
  | "member_goal"
  | "member_allergies"
  // Étape 3 — le plan
  | "eating_rhythm"
  | "cook_days"
  | "cooking_time_min"
  | "budget_band"
  // ── LES `better`: DÉCLARÉES ICI, JAMAIS RENDUES PAR `funnelSteps` ────────
  // Elles ne sont pas du décor. Ce tableau est la LISTE DE CE QUI SE DEMANDERA
  // APRÈS le plan, et l'avoir écrite au même endroit que le reste est ce qui
  // empêche qu'une question « moins bon » se glisse dans l'entonnoir au
  // prochain ajustement — il faudrait changer son `weight`, ce qui se lit dans
  // une revue.
  | "own_weight_kg"
  | "member_body"
  | "food_preferences"
  | "away_days"
  | "situation"
  | "target_weight_kg"
  | "recipe_difficulty"
  | "variety"
  | "house_rules"
  | "medical_constraints";

/**
 * CE QUI MANQUE POUR COMPOSER — et ce n'est pas exactement « une question ».
 *
 * Deux motifs ne sont la faute d'AUCUNE question prise isolément, et les faire
 * passer pour telles rendrait le message d'écran faux:
 *
 *   · `adult_without_birth_date` — le défaut D1. Voir `canGenerate`.
 *   · `missing_mouths` / `too_many_mouths` — l'étape 1 a répondu « 3+ » et
 *     l'étape 2b n'a personne (ou en a neuf). La question qui manque n'est ni
 *     `household_size` (elle a une réponse) ni `member_first_name` (il n'y a
 *     pas de bouche à qui il manquerait un prénom): c'est le COMPTE.
 */
export type FunnelMissId =
  | FunnelQuestionId
  | "adult_without_birth_date"
  | "missing_mouths"
  | "too_many_mouths";

export interface FunnelQuestion {
  id: FunnelQuestionId;
  /**
   * OBLIGATOIRE, ET CE N'EST PAS DÉCORATIF: le module ou le chemin qui LIT la
   * réponse, en chemin RELATIF À LA RACINE DU DÉPÔT, éventuellement suivi de
   * `#symbole`.
   *
   * La règle mère du dépôt — on ne collecte que ce qu'un aval consomme — n'est
   * tenable que si elle est écrite à côté de la question. Et un chemin est
   * VÉRIFIABLE, contrairement à une phrase: `onboarding.int.test.ts` l'ouvre.
   */
  consumer: string;
  /**
   * `wrong`  = sans la réponse, le premier plan est FAUX      → dans l'entonnoir
   * `better` = sans la réponse, il est seulement MOINS BON     → après le plan
   */
  weight: "wrong" | "better";
  /**
   * Les branches où la question se POSE. Vide = jamais rendue.
   *
   * ⚠️ CE N'EST PAS UNE COMMODITÉ D'AFFICHAGE. `own_first_name` n'est pas dans
   * la branche `solo` parce que RIEN, dans le chemin individuel, ne lit le
   * prénom du mangeur: `generate-meal-v1` ne le nomme nulle part (vérifié le
   * 2026-08-12). Le demander là serait exactement ce que la règle mère
   * interdit. Il redevient « faux si absent » dès qu'il y a un foyer, parce que
   * `household_turn_context.ts` FILTRE EN SILENCE toute portion dont le prénom
   * est vide — la personne disparaît du plan sans un mot.
   */
  branches: readonly FunnelBranch[];
  /** L'étape qui la rend. `null` pour les `better`, qui n'en ont aucune. */
  step: FunnelStepId | null;
  /** Qui répond: le foyer entier, moi, ou chaque autre bouche une par une. */
  scope: "household" | "self" | "each_member";
}

const ALL_BRANCHES: readonly FunnelBranch[] = ["solo", "pair", "family"];
const WITH_OTHERS: readonly FunnelBranch[] = ["pair", "family"];
const NEVER: readonly FunnelBranch[] = [];

/**
 * LE CATALOGUE. Une ligne par question, son consommateur, son poids.
 *
 * ── POURQUOI LES `better` SONT ICI ET PAS DANS UN AUTRE FICHIER ────────────
 * Parce que la question intéressante n'est pas « quelles questions pose-t-on »
 * mais « pourquoi celle-là n'est-elle pas posée maintenant ». Séparer les deux
 * listes ferait perdre la comparaison, et la prochaine personne qui ajoute un
 * champ à l'entonnoir n'aurait rien sous les yeux pour se demander s'il n'est
 * pas plutôt « moins bon ».
 */
export const FUNNEL_QUESTIONS: readonly FunnelQuestion[] = Object.freeze([
  {
    id: "household_size",
    // La réponse décide s'il y a un foyer et LEQUEL des deux générateurs part.
    // Sans elle, on ne sait même pas quoi appeler.
    consumer: "frontend/src/keel/api/household.ts#createHousehold",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "situate",
    scope: "household",
  },
  {
    id: "own_first_name",
    consumer: "supabase/functions/_shared/keel/household_turn_context.ts#firstName",
    weight: "wrong",
    branches: WITH_OTHERS,
    step: "people",
    scope: "self",
  },
  {
    id: "own_birth_date",
    consumer: "supabase/functions/_shared/keel/student_body_io.ts#loadStudentBody",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "people",
    scope: "self",
  },
  {
    // ── ARBITRAGE DU 2026-08-12, ET IL TRANCHE UNE TENSION DE LA FICHE ─────
    // §3.1 ne compte pas la taille dans les « trois par personne »; §3.2 la
    // demande explicitement au maître. Ce qui départage est le second membre
    // de la règle: « moins bon → APRÈS LE PLAN, au moment où on peut montrer
    // le plat que ça change ». Une taille ne change AUCUN plat en particulier;
    // elle change toutes les quantités, invisiblement. Il n'existe donc aucun
    // moment postérieur pour la demander — et « après » signifierait jamais.
    id: "own_height_cm",
    consumer: "supabase/functions/_shared/keel/student_body_io.ts#mealBodyContextFrom",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "people",
    scope: "self",
  },
  {
    id: "own_gender",
    consumer: "supabase/functions/_shared/keel/meal_body.ts#MEAL_BODY_GENDERS",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "people",
    scope: "self",
  },
  {
    // `goal_required`, 409, dans LES DEUX générateurs. C'est le seul refus que
    // l'entonnoir ne peut pas se permettre de laisser passer: il tombe après
    // que tout a été saisi.
    id: "own_goal",
    consumer: "supabase/functions/generate-meal-v1/index.ts#goal_required",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "people",
    scope: "self",
  },
  {
    // SÉCURITÉ. Une allergie manquante au premier plan n'est pas une
    // imprécision: c'est un danger, et une confiance perdue pour toujours.
    // La réponse « aucune » EST une réponse — voir `allergiesReviewed`.
    id: "own_allergies",
    consumer: "supabase/functions/_shared/keel/safety_constraints.ts#loadStudentSafetyConstraints",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "people",
    scope: "self",
  },
  {
    id: "member_first_name",
    consumer: "supabase/functions/_shared/keel/household_turn_context.ts#firstName",
    weight: "wrong",
    branches: WITH_OTHERS,
    step: "people",
    scope: "each_member",
  },
  {
    id: "member_birth_date",
    consumer: "supabase/functions/_shared/keel/household.ts#goalApplies",
    weight: "wrong",
    branches: WITH_OTHERS,
    step: "people",
    scope: "each_member",
  },
  {
    id: "member_goal",
    consumer: "supabase/functions/_shared/keel/household.ts#goalApplies",
    weight: "wrong",
    branches: WITH_OTHERS,
    step: "people",
    scope: "each_member",
  },
  {
    id: "member_allergies",
    consumer: "supabase/functions/_shared/keel/household_safety.ts#loadHouseholdAllergies",
    weight: "wrong",
    branches: WITH_OTHERS,
    step: "people",
    scope: "each_member",
  },
  {
    // Sans rythme, les deux côtés (consigne ET parseur) retombent sur trois
    // repas. Quelqu'un qui en fait cinq reçoit un plan qui en oublie deux — ce
    // n'est pas « moins bon », c'est faux.
    id: "eating_rhythm",
    consumer: "supabase/functions/_shared/keel/meal_generation.ts#parseEatingRhythm",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "plan",
    scope: "household",
  },
  {
    // ⚠️ LA CLÉ EST `cook_days`, PAS `cooking_days`. Mesuré dans
    // `readCookingCapacity` des deux générateurs et dans `CookingCapacityCard`.
    id: "cook_days",
    consumer: "supabase/functions/generate-meal-v1/index.ts#cook_days",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "plan",
    scope: "household",
  },
  {
    id: "cooking_time_min",
    consumer: "supabase/functions/generate-meal-v1/index.ts#cooking_time_min",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "plan",
    scope: "household",
  },
  {
    id: "budget_band",
    consumer: "supabase/functions/generate-meal-v1/index.ts#budget_band",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "plan",
    scope: "household",
  },

  // ── CE QUI SE DEMANDE APRÈS LE PLAN ───────────────────────────────────────
  {
    // Le poids ouvre la surface de mesure et son plancher TCA. Il a, LUI, un
    // moment: la première pesée, sur `/app/progress`.
    id: "own_weight_kg",
    consumer: "supabase/functions/_shared/keel/student_body_io.ts#loadStudentBody",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "self",
  },
  {
    // Taille + poids + sexe de CHAQUE bouche. La décision humaine du
    // 2026-08-12 les exige pour servir juste — mais quatre champs par bouche
    // est exactement le mur que cet entonnoir existe pour éviter. Sans eux le
    // moteur sert une part standard: moins bon, jamais faux.
    id: "member_body",
    consumer: "supabase/functions/generate-household-meal-v1/index.ts#keel_household_bodies_for",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "each_member",
  },
  {
    id: "food_preferences",
    consumer:
      "supabase/functions/_shared/keel/food_preference_promotion_io.ts#reconcileFoodPreferencesFor",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "self",
  },
  {
    id: "away_days",
    consumer: "supabase/functions/_shared/keel/household_presence.ts",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "each_member",
  },
  {
    id: "situation",
    consumer: "supabase/functions/generate-meal-v1/index.ts#situation",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "self",
  },
  {
    id: "target_weight_kg",
    consumer: "frontend/src/keel/api/bodyMeasures.ts#target_weight_kg",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "self",
  },
  {
    id: "recipe_difficulty",
    consumer: "supabase/functions/generate-meal-v1/index.ts#recipe_difficulty",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "household",
  },
  {
    id: "variety",
    consumer: "supabase/functions/generate-meal-v1/index.ts#variety",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "household",
  },
  {
    // ⚠️ UNE RÈGLE DE MAISON N'EST PAS UNE ALLERGIE, et l'entonnoir ne collecte
    // que la seconde (FF-046). L'allergie est médicale et rejoint l'union de
    // sécurité, fail-closed; la règle de maison est un pouvoir domestique dont
    // le verrou serveur TAIT le pourquoi. Les confondre à la saisie, c'est
    // promettre une garde de sécurité sur une préférence parentale.
    id: "house_rules",
    consumer: "supabase/functions/_shared/keel/household_safety.ts#householdHardConstraints",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "each_member",
  },
  {
    // Intolérances et médicaments. L'ALLERGIE est dans l'entonnoir; le reste de
    // `student_safety_constraints` se déclare sur `/app/health`.
    id: "medical_constraints",
    consumer: "supabase/functions/_shared/keel/safety_constraints.ts#loadStudentSafetyConstraints",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "self",
  },
]);

// ───────────────────────────────────────────────────────────────────────────
// L'ÉTAT
// ───────────────────────────────────────────────────────────────────────────

/**
 * Ce qu'on a répondu pour UNE bouche autre que moi.
 *
 * ⚠️ `kind` EST DÉCLARÉ, PAS DÉRIVÉ DE `birthDate`. C'est ce qui rend le défaut
 * D1 détectable: une ligne peut porter un objectif et aucune date (le maître
 * l'a ajoutée depuis `/app/household`, ou il a effacé la date après coup), et
 * `goalApplies` la traite alors comme « âge inconnu » — donc part standard,
 * EN SILENCE. Si `kind` se déduisait de la date, cet état serait inexprimable
 * et la garde n'aurait aucun cas où mordre.
 */
export interface FunnelPerson {
  /** Vide = pas de prénom. */
  firstName: string;
  kind: "adult" | "child";
  /** ISO `YYYY-MM-DD`, ou `null`. */
  birthDate: string | null;
  /** `null` = aucune direction déclarée. Toujours `null` pour un enfant. */
  goal: MemberGoal | null;
  /**
   * LA QUESTION A ÉTÉ POSÉE ET RÉPONDUE — « aucune » EST une réponse.
   *
   * ⚠️ NE PAS REMPLACER PAR `allergies.length > 0`. La plupart des gens n'ont
   * aucune allergie: une garde qui exige une liste non vide bloquerait tout le
   * monde, et une garde qui accepte la liste vide ne distingue plus « rien à
   * déclarer » de « on n'a jamais demandé ». Sur une question de sécurité, ces
   * deux-là ne sont pas la même chose.
   */
  allergiesReviewed: boolean;
}

/** Moi. Les mêmes champs, plus ce qui dimensionne mon assiette. */
export interface FunnelSelf extends FunnelPerson {
  heightCm: number | null;
  gender: MemberGender | null;
}

/**
 * Ce qui appartient à QUI CUISINE, et se pose donc UNE SEULE FOIS.
 *
 * C'est ce qui fait que la branche famille ne coûte qu'une minute de plus que
 * la branche solo, et pas quatre fois plus.
 */
export interface FunnelPlanAnswers {
  /** Les moments où on mange. Vide = rien de déclaré. */
  eatingRhythm: readonly string[];
  /** `mon`…`sun`. Vide = rien de déclaré. */
  cookDays: readonly string[];
  cookingTimeMin: number | null;
  budgetBand: "tight" | "normal" | "comfortable" | null;
}

export interface FunnelState {
  /** La réponse de l'étape 1. `null` = pas encore répondu. */
  mouths: number | null;
  self: FunnelSelf;
  /** Les AUTRES bouches. Moi n'y suis pas: je suis la première, dans `self`. */
  others: readonly FunnelPerson[];
  plan: FunnelPlanAnswers;
}

/** Le plafond de bouches, EN BASE (`keel_household_max_mouths()` rend 8). */
export const HOUSEHOLD_MAX_MOUTHS = 8;

/**
 * La branche que ce nombre de bouches désigne, ou `null` si l'étape 1 n'a pas
 * répondu.
 *
 * `3+` est une famille, et tout ce qui dépasse le plafond reste `family`: c'est
 * la BASE qui refuse la neuvième bouche (`household_full`), pas cette
 * projection — une limite d'UI n'est pas une limite.
 */
export function branchForMouths(mouths: number | null): FunnelBranch | null {
  if (mouths === null || !Number.isFinite(mouths) || mouths < 1) return null;
  if (mouths === 1) return "solo";
  if (mouths === 2) return "pair";
  return "family";
}

/**
 * Combien de bouches AUTRES que moi cette branche attend au minimum.
 *
 * `family` en attend 2 et pas 3: le nombre de l'étape 1 est une intention, et
 * quelqu'un qui répond « 3+ » puis saisit deux personnes a un foyer valide.
 * Exiger le compte exact ferait échouer l'entonnoir sur une réponse qu'on lui a
 * demandé de donner AVANT de savoir.
 */
function minimumOthers(branch: FunnelBranch): number {
  if (branch === "solo") return 0;
  if (branch === "pair") return 1;
  return 2;
}

// ───────────────────────────────────────────────────────────────────────────
// LES DÉCISIONS
// ───────────────────────────────────────────────────────────────────────────

export interface FunnelStep {
  id: FunnelStepId;
  questions: readonly FunnelQuestion[];
}

const STEP_ORDER: readonly FunnelStepId[] = ["situate", "people", "plan"];

/**
 * LES ÉTAPES DE CETTE BRANCHE, DANS L'ORDRE.
 *
 * ⚠️ SEULES LES `wrong` SORTENT D'ICI. Les `better` sont déclarées dans le même
 * catalogue et ne sont JAMAIS rendues: c'est la seule chose qui garantit que
 * « on la demandera après » n'est pas un vœu pieux mais un fait de code.
 *
 * Une étape sans question ne sort pas non plus — l'étape 2b n'existe pas en
 * solo, et un écran vide numéroté « 2 sur 3 » est un mensonge sur ce qui reste.
 */
export function funnelSteps(branch: FunnelBranch): FunnelStep[] {
  return STEP_ORDER.map((id) => ({
    id,
    questions: FUNNEL_QUESTIONS.filter(
      (q) => q.weight === "wrong" && q.step === id && q.branches.includes(branch),
    ),
  })).filter((step) => step.questions.length > 0);
}

/**
 * LA PREMIÈRE ÉTAPE ENCORE INCOMPLÈTE, ou `null` si tout est répondu.
 *
 * C'est ce qui rend la REPRISE possible sans drapeau de progression: l'état se
 * dérive des faits en base, et cette fonction dit où reprendre. Un
 * `profiles.onboarding_completed` dirait « fini » d'un parcours dont la moitié
 * des faits ont été effacés depuis, et il ment dans les deux sens.
 */
export function nextIncomplete(
  state: FunnelState,
  branch: FunnelBranch,
): FunnelStep | null {
  const missing = new Set(canGenerateMisses(state, branch).map(stepOfMiss));
  return funnelSteps(branch).find((s) => missing.has(s.id)) ?? null;
}

/** À quelle étape un motif renvoie l'utilisateur. */
function stepOfMiss(miss: FunnelMissId): FunnelStepId {
  if (miss === "missing_mouths" || miss === "too_many_mouths") return "people";
  if (miss === "adult_without_birth_date") return "people";
  const question = FUNNEL_QUESTIONS.find((q) => q.id === miss);
  // Un motif sans étape ne peut pas exister — tous les `wrong` en ont une, et
  // les trois motifs nommés sont traités au-dessus. Le repli est l'étape 1
  // plutôt qu'un `throw`: on ne fait pas tomber l'écran de réglage de quelqu'un
  // pour une entrée de catalogue mal remplie, que le test attrape déjà.
  if (!question || question.step === null) return "situate";
  return question.step;
}

/**
 * PEUT-ON COMPOSER LE PREMIER PLAN ?
 *
 * ⚠️ AUCUN PARAMÈTRE OPTIONNEL, ET C'EST UNE CICATRICE DU DÉPÔT. `safetyBand`
 * a vécu des mois en paramètre facultatif d'une garde, n'a JAMAIS été passé par
 * aucun appelant, et personne ne l'a vu: un paramètre de garde optionnel est
 * une garde désarmée. Si cette fonction a besoin d'un fait de plus un jour, il
 * entre dans `FunnelState` — où le compilateur réclame qu'on le remplisse.
 *
 * ⚠️ PAS D'HORLOGE NON PLUS. La lisibilité d'une date de naissance (future,
 * aberrante, illisible) est tranchée par `birthDateAnswer` ci-dessous, qui
 * enveloppe LA garde du produit (`assessBirthDate`) — jamais une seconde
 * arithmétique de bornes écrite ici, qui divergerait au premier ajustement.
 */
export function canGenerate(
  state: FunnelState,
  branch: FunnelBranch,
): { ok: true } | { ok: false; missing: FunnelMissId[] } {
  const missing = canGenerateMisses(state, branch);
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function canGenerateMisses(
  state: FunnelState,
  branch: FunnelBranch,
): FunnelMissId[] {
  const missing: FunnelMissId[] = [];
  const asks = (id: FunnelQuestionId) =>
    FUNNEL_QUESTIONS.some(
      (q) => q.id === id && q.weight === "wrong" && q.branches.includes(branch),
    );

  // ── ÉTAPE 1 ────────────────────────────────────────────────────────────
  if (branchForMouths(state.mouths) === null) missing.push("household_size");

  // ── ÉTAPE 2, MOI ───────────────────────────────────────────────────────
  if (asks("own_first_name") && state.self.firstName.trim() === "") {
    missing.push("own_first_name");
  }
  // Le maître est TOUJOURS un adulte porteur d'objectif — c'est son compte, et
  // les deux générateurs exigent sa ligne `student_goals`. D1 s'applique donc à
  // lui comme aux autres, et par la même fonction.
  missing.push(
    ...personMisses(
      { ...state.self, kind: "adult" },
      "own_birth_date",
      "own_goal",
      "own_first_name",
      "own_allergies",
      { skipFirstName: true },
    ),
  );
  if (asks("own_height_cm") && !isUsableHeight(state.self.heightCm)) {
    missing.push("own_height_cm");
  }
  if (asks("own_gender") && state.self.gender === null) missing.push("own_gender");

  // ── ÉTAPE 2b, LES AUTRES ───────────────────────────────────────────────
  if (branch !== "solo") {
    if (state.others.length < minimumOthers(branch)) missing.push("missing_mouths");
    // MOI COMPRIS dans le plafond: la base compte les BOUCHES, et ma ligne en
    // est une (`keel_household_create` l'insère).
    if (state.others.length + 1 > HOUSEHOLD_MAX_MOUTHS) missing.push("too_many_mouths");
    for (const person of state.others) {
      missing.push(
        ...personMisses(
          person,
          "member_birth_date",
          "member_goal",
          "member_first_name",
          "member_allergies",
          { skipFirstName: false },
        ),
      );
    }
  }

  // ── ÉTAPE 3 ────────────────────────────────────────────────────────────
  if (state.plan.eatingRhythm.length === 0) missing.push("eating_rhythm");
  if (state.plan.cookDays.length === 0) missing.push("cook_days");
  if (
    state.plan.cookingTimeMin === null ||
    !Number.isFinite(state.plan.cookingTimeMin) ||
    state.plan.cookingTimeMin <= 0
  ) {
    missing.push("cooking_time_min");
  }
  if (state.plan.budgetBand === null) missing.push("budget_band");

  // Dédoublonné en gardant l'ORDRE: N bouches sans prénom rendent un seul
  // `member_first_name`. L'écran renvoie vers une étape, pas vers une ligne, et
  // sept fois le même motif ne dit rien de plus que la première.
  return [...new Set(missing)];
}

/**
 * LES MOTIFS D'UNE BOUCHE — et c'est ici que vit le défaut D1.
 *
 * ── D1, EN UNE PHRASE ──────────────────────────────────────────────────────
 * `goalApplies` (`_shared/keel/household.ts`) exige `ageState === "adult"`, et
 * `ageState` DÉRIVE de `birth_date`. Une bouche sans date n'est donc pas
 * « adulte »: son objectif est ignoré, SANS AUCUN MESSAGE. Si l'entonnoir
 * demandait l'objectif du conjoint sans demander sa date, la bifurcation des
 * portions — la démonstration entière de la cible « couple à objectifs
 * divergents » — serait muette au premier plan, et l'utilisateur en conclurait
 * que le produit ne fait pas ce qu'il promet.
 *
 * D'où le motif NOMMÉ, et pas un simple `member_birth_date`: les deux se
 * réparent par le même champ, mais ils ne coûtent pas la même chose, et
 * l'écran doit pouvoir dire « sans sa date, sa direction ne s'appliquera pas »
 * au lieu de « il manque une date ».
 */
function personMisses(
  person: FunnelPerson,
  birthDateId: FunnelMissId,
  goalId: FunnelMissId,
  firstNameId: FunnelMissId,
  allergiesId: FunnelMissId,
  opts: { skipFirstName: boolean },
): FunnelMissId[] {
  const missing: FunnelMissId[] = [];
  if (!opts.skipFirstName && person.firstName.trim() === "") {
    missing.push(firstNameId);
  }
  const carriesGoal = person.kind === "adult" && isKnownGoal(person.goal);
  if (person.birthDate === null || person.birthDate.trim() === "") {
    // ⚠️ L'ORDRE DE CE `if` EST LA GARDE, PAS UNE PRÉFÉRENCE DE MESSAGE. Un
    // motif générique émis EN PLUS du motif nommé rendrait la garde D1
    // intestable: on pourrait la supprimer et `ok` resterait `false`, donc un
    // test qui n'assert que `ok` resterait vert. Le motif nommé REMPLACE.
    missing.push(carriesGoal ? "adult_without_birth_date" : birthDateId);
  }
  if (person.kind === "adult" && !isKnownGoal(person.goal)) missing.push(goalId);
  if (!person.allergiesReviewed) missing.push(allergiesId);
  return missing;
}

function isKnownGoal(goal: string | null): goal is MemberGoal {
  return goal !== null && (MEMBER_GOALS as readonly string[]).includes(goal);
}

/**
 * `profiles_height_cm_check` en base borne à [90, 250]. La copie est de
 * confort — l'autorité est la CHECK —, et elle est ici parce qu'un bouton actif
 * qui rend une erreur de contrainte est pire qu'un bouton gris.
 */
function isUsableHeight(cm: number | null): boolean {
  return cm !== null && Number.isFinite(cm) && cm >= 90 && cm <= 250;
}

/**
 * UNE DATE SAISIE, LUE PAR LA GARDE DU PRODUIT.
 *
 * Enveloppe `assessBirthDate` (`_shared/keel/student_age.ts`), déjà testée, et
 * déjà celle des deux lanes. Rendre `null` sur une date inutilisable est ce qui
 * permet à `canGenerate` de rester sans horloge: l'appelant convertit une fois,
 * à la saisie, et l'état ne porte que des dates lisibles.
 *
 * ⚠️ UN MINEUR EST UNE DATE VALIDE, et c'est tout le point. La garde refuse
 * `unreadable | future | implausible`, jamais `minor` — savoir qu'un enfant est
 * à table est exactement ce que le foyer a besoin de savoir.
 */
export function birthDateAnswer(
  raw: string,
  todayIso: string,
): { date: string; verdict: BirthDateVerdict } | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const verdict = assessBirthDate(trimmed, todayIso);
  if (verdict.status !== "minor" && verdict.status !== "adult") return null;
  return { date: trimmed, verdict };
}

/** Un état vide, celui d'un compte qui vient d'être créé. */
export function emptyFunnelState(): FunnelState {
  return {
    mouths: null,
    self: {
      firstName: "",
      kind: "adult",
      birthDate: null,
      goal: null,
      allergiesReviewed: false,
      heightCm: null,
      gender: null,
    },
    others: [],
    plan: {
      eatingRhythm: [],
      cookDays: [],
      cookingTimeMin: null,
      budgetBand: null,
    },
  };
}

/** Une bouche vide, telle que l'étape 2b l'ajoute. */
export function emptyFunnelPerson(): FunnelPerson {
  return {
    firstName: "",
    kind: "adult",
    birthDate: null,
    goal: null,
    allergiesReviewed: false,
  };
}
