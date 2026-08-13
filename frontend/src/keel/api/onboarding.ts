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

import { supabase } from "../../lib/supabase";
import {
  assessBirthDate,
  type BirthDateVerdict,
} from "../../../../supabase/functions/_shared/keel/student_age.ts";
import { normalizeAllergenInput } from "../copy/allergens";
import { browserLocalDate } from "../lib/useMealTicks";
import {
  addAllergy,
  loadAllergies,
  loadHousehold,
  loadMemberBodies,
  MEMBER_GENDERS,
  type MemberBodyView,
  setMemberBody,
  type MemberGender,
  type MemberGoal,
  MEMBER_GOALS,
} from "./household";
import { DAY_TOKENS, parseEatingRhythm } from "./mealGeneration";
import { mergePracticalConstraints } from "./practicalConstraints";
import {
  declareConstraint,
  DuplicateConstraintError,
  loadActiveConstraints,
} from "./safetyConstraints";

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
  | "own_weight_kg"
  | "own_goal"
  | "own_diet"
  | "own_allergies"
  // Étape 2b — les autres bouches
  | "member_first_name"
  | "member_birth_date"
  | "member_height_cm"
  | "member_weight_kg"
  | "member_gender"
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
    // ── LE POIDS, ET IL EST REVENU DE `better` LE 2026-08-13 ─────────────
    // Il était classé « moins bon » au motif qu'il ouvre la surface de mesure
    // et son plancher TCA, et que la première pesée a son moment sur
    // `/app/progress`. C'était FAUX, pour deux raisons mesurées:
    //
    //   · `keel_household_set_member_body` est TOUT-OU-RIEN (taille + poids +
    //     sexe). Sans le poids, on ne peut pas écrire la taille non plus —
    //     donc la taille collectée à côté ne servait à RIEN au foyer;
    //   · `restriction_guard.ts` détecte la perte rapide en comparant deux
    //     poids hebdomadaires. Sans un premier point, la ceinture n'a rien à
    //     quoi comparer le second.
    //
    // Un premier plan servi à un corps inconnu n'est pas « moins bon »: les
    // portions sont la promesse du produit, et elles sont fausses.
    id: "own_weight_kg",
    consumer: "supabase/functions/_shared/keel/student_body_io.ts#loadStudentBody",
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
    // ── LE RÉGIME, ET C'EST LE PLUS FORT `wrong` DU CATALOGUE ────────────
    //
    // Servir de la viande à un végétarien n'est pas « moins bon »: le plan
    // entier est inexécutable, et il l'est dès le premier soir. Aucune autre
    // question du parcours ne rend un plan aussi complètement inutilisable
    // par son absence.
    //
    // ⚠️ LE MOTEUR SAIT DÉJÀ LE FAIRE, ET PERSONNE NE POUVAIT LE DÉCLARER.
    // `dietary_regime.ts` étend le régime en groupes exclus, écrit sa ligne
    // de prompt et nomme ce qu'il rend incouvrable; `generate-meal-v1` le lit
    // à chaque composition. Il manquait la porte d'écriture — ni
    // `CONSTRAINT_KINDS` ni `refField` ne connaissaient `diet`.
    id: "own_diet",
    consumer: "supabase/functions/_shared/keel/dietary_regime.ts#dietaryRegimePromptLine",
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
    // ── LE CORPS DE CHAQUE BOUCHE (décision humaine du 2026-08-13) ────────
    //
    // ⚠️ LE MOTEUR DU FOYER NE LIT QUE `household_member_bodies`.
    // `keel_household_bodies_for` n'a AUCUN repli sur `profiles` — vérifié le
    // 2026-08-13 — et `generate-household-meal-v1` SAUTE toute bouche dont le
    // corps est incomplet (`if (height === null || weight === null ||
    // rawGender === "") continue;`). Un foyer sans corps est donc un foyer
    // dont le tronc n'est dimensionné sur rien et dont aucune bouche n'a
    // d'add-on: le plan sort, nominalement correct, et numériquement
    // indifférencié. « Un pot, deux directions » est muet.
    //
    // Les trois sont déclarées séparément et pas en un `member_body`: la
    // RPC est tout-ou-rien, mais l'ÉCRAN doit pouvoir dire lequel manque.
    id: "member_height_cm",
    consumer: "supabase/functions/generate-household-meal-v1/index.ts#keel_household_bodies_for",
    weight: "wrong",
    branches: WITH_OTHERS,
    step: "people",
    scope: "each_member",
  },
  {
    id: "member_weight_kg",
    consumer: "supabase/functions/generate-household-meal-v1/index.ts#keel_household_bodies_for",
    weight: "wrong",
    branches: WITH_OTHERS,
    step: "people",
    scope: "each_member",
  },
  {
    id: "member_gender",
    consumer: "supabase/functions/generate-household-meal-v1/index.ts#keel_household_bodies_for",
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
  /**
   * LE CORPS, ET IL EST SUR **CHAQUE** BOUCHE (décision humaine 2026-08-13).
   *
   * ⚠️ TOUT-OU-RIEN, PARCE QUE LA BASE L'EST. `keel_household_set_member_body`
   * refuse `body_incomplete` dès qu'un des trois manque, et le moteur SAUTE
   * une ligne partielle. Un demi-corps n'existe nulle part: ni en base, ni
   * ici.
   */
  heightCm: number | null;
  weightKg: number | null;
  gender: MemberGender | null;
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
  /**
   * LE RÉGIME DÉCLARÉ, ou `"omnivore"` — qui est une RÉPONSE, pas une absence.
   *
   * ⚠️ `null` VEUT DIRE « ON N'A PAS DEMANDÉ », et c'est pour ça qu'il existe
   * un jeton pour « je mange de tout ». Sans lui, la table ne distinguerait
   * pas quelqu'un qui n'a rien à déclarer de quelqu'un à qui on n'a jamais
   * posé la question — exactement le piège des allergies, et il coûte ici la
   * même chose: un plan de viande servi à un végétarien.
   *
   * `omnivore` n'est PAS écrit en base: il n'y a pas de ligne à poser pour
   * « aucune restriction ». Il vit dans `practical_constraints.diet_asked`,
   * comme l'accusé d'allergie, et pour la même raison.
   */
  diet: DietAnswer | null;
}

/** Les trois régimes de `student_safety_constraints_diet_ref_check`, plus la
 * réponse « je mange de tout ». Miroir de `DIETARY_REGIMES` côté moteur. */
export const DIET_ANSWERS = [
  "omnivore",
  "vegetarian",
  "vegan",
  "pescatarian",
] as const;
export type DietAnswer = (typeof DIET_ANSWERS)[number];

/**
 * Moi. Exactement les mêmes champs que n'importe quelle bouche.
 *
 * Le type ne se distingue plus depuis que le corps a rejoint `FunnelPerson`:
 * le maître EST la première bouche (décision du lot 4 du chantier foyer), et
 * un type à part faisait croire le contraire. Gardé comme alias nommé parce
 * que les signatures se lisent mieux avec.
 */
export type FunnelSelf = FunnelPerson;

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

/**
 * COMBIEN DE TEMPS ON PASSE À CUISINER, EN CHOIX FERMÉS.
 *
 * ── POURQUOI PAS UN NOMBRE LIBRE ──────────────────────────────────────────
 * Le champ était un `<input type="number">` de 5 à 240, et personne ne sait
 * quoi y écrire: « 37 » n'est pas une réponse qu'un humain a. Le moteur, lui,
 * n'en fait rien de précis — `meal_generation.ts` écrit littéralement
 * « time per cooking session: about ${n} minutes ». Un nombre exact y est donc
 * une FAUSSE PRÉCISION: on demande un chiffre au décimal près pour le rendre
 * flou une ligne plus loin.
 *
 * Six durées qu'on reconnaît, de la demi-heure de semaine aux trois heures du
 * dimanche. Le plafond du moteur est 240 (`Math.min(240, …)`), et le plus
 * grand choix reste dessous exprès: proposer une valeur que le lecteur rogne
 * ferait afficher un chiffre et en composer un autre.
 */
export const COOKING_SESSION_MINUTES: readonly number[] = [30, 45, 60, 90, 120, 180];

/**
 * UNE DURÉE, DÉCOUPÉE POUR ÊTRE DITE — pas formatée ici.
 *
 * Rend le NOMBRE et son UNITÉ séparément, parce que les mots appartiennent au
 * catalogue de langue et pas à ce module. Écrire « 1 hr » ici ferait une
 * étiquette anglaise qu'aucune traduction ne pourrait reprendre — la cicatrice
 * `optout-confirmation-hardcoded-french`, dans l'autre sens.
 *
 * Une valeur hors des choix (quelqu'un a saisi 37 sur `/app/plan`, dont la
 * carte garde son champ libre) rend ses minutes telles quelles: on préfère
 * afficher « 37 min » que faire semblant qu'elle n'existe pas.
 */
export function cookingTimeParts(
  minutes: number,
): { unit: "minutes" | "hours"; value: string } {
  if (minutes >= 60 && minutes % 60 === 0) {
    return { unit: "hours", value: String(minutes / 60) };
  }
  // La demi-heure se dit « 1½ », jamais « 1.5 »: c'est une durée lue par un
  // humain, pas une mesure.
  if (minutes > 60 && minutes % 30 === 0) {
    return { unit: "hours", value: `${Math.floor(minutes / 60)}½` };
  }
  return { unit: "minutes", value: String(minutes) };
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
  if (asks("own_weight_kg") && !isUsableWeight(state.self.weightKg)) {
    missing.push("own_weight_kg");
  }
  if (asks("own_gender") && state.self.gender === null) missing.push("own_gender");
  if (asks("own_diet") && state.self.diet === null) missing.push("own_diet");

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
      // LE CORPS, BOUCHE PAR BOUCHE. Les bornes sont celles de la RPC de foyer
      // (30–260 cm, 2–400 kg) et PAS celles de `profiles`: une bouche peut
      // être un enfant de trois ans, que les bornes adultes refuseraient.
      if (!isUsableMouthHeight(person.heightCm)) missing.push("member_height_cm");
      if (!isUsableMouthWeight(person.weightKg)) missing.push("member_weight_kg");
      if (person.gender === null) missing.push("member_gender");
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
 * `student_body_measures_value_in_range` borne un poids à [25, 400]. C'est la
 * table qui arme `restriction_guard`, donc la borne qui compte pour MOI.
 */
function isUsableWeight(kg: number | null): boolean {
  return kg !== null && Number.isFinite(kg) && kg >= 25 && kg <= 400;
}

/**
 * LES BORNES D'UNE AUTRE BOUCHE SONT PLUS LARGES, ET CE N'EST PAS UN OUBLI.
 * `keel_household_set_member_body` accepte 30–260 cm et 2–400 kg parce qu'une
 * bouche peut être un nourrisson. Appliquer les bornes adultes ici refuserait
 * un enfant de trois ans — c'est-à-dire exactement la population que le foyer
 * existe pour servir.
 */
function isUsableMouthHeight(cm: number | null): boolean {
  return cm !== null && Number.isFinite(cm) && cm >= 30 && cm <= 260;
}

function isUsableMouthWeight(kg: number | null): boolean {
  return kg !== null && Number.isFinite(kg) && kg >= 2 && kg <= 400;
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
      diet: null,
      heightCm: null,
      weightKg: null,
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
    diet: null,
    heightCm: null,
    weightKg: null,
    gender: null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// LES APPELS
// ───────────────────────────────────────────────────────────────────────────

/**
 * « IL Y A UNE DATE, ET JE NE PEUX PAS LA LIRE ».
 *
 * `keel_household_roster` NE REND JAMAIS la date de naissance d'une bouche —
 * le foyer doit savoir qu'il y a un enfant à table, pas son âge exact. La
 * reprise ne peut donc pas préremplir le champ; elle peut seulement savoir
 * qu'une date EST en base, parce que `age_state` vaut alors `minor` ou `adult`
 * plutôt que `unknown`.
 *
 * Ce jeton porte ce fait. `canGenerate` n'y voit qu'une chaîne non vide — donc
 * « répondu » —, et l'écran, lui, le reconnaît et affiche « déjà enregistrée,
 * laisse vide pour la garder » (`household.member.birth_date_kept`, déjà écrit
 * et déjà juste).
 *
 * ⚠️ IL NE PART JAMAIS EN BASE. `saveMouth` ne l'écrit pas: écrire « on-file »
 * dans une colonne `date` échouerait — bruyamment, heureusement — mais surtout
 * il n'y a rien à écrire, la date est déjà là.
 */
export const BIRTH_DATE_ON_FILE = "on-file";

/**
 * LE NOM DU FOYER, QUE L'ENTONNOIR NE DEMANDE PAS.
 *
 * Décision du chantier: au moment où on le demanderait, il n'a AUCUN
 * consommateur — le foyer n'a pas encore d'invitation à envoyer, et son nom
 * n'apparaît nulle part avant. Une question sans consommateur ne se pose pas,
 * même quand elle est facile. Il se renomme sur `/app/household`, où l'écran
 * l'affiche déjà.
 *
 * `Home` plutôt qu'un dérivé du prénom: à l'étape 1, le prénom n'a pas encore
 * été demandé (il vient à l'étape 2), et `profiles.full_name` peut être vide.
 * Un défaut qui dépend d'un champ facultatif est un défaut qui casse.
 */
export const DEFAULT_HOUSEHOLD_NAME = "Home";

/**
 * La clé où l'entonnoir se souvient d'AVOIR POSÉ la question des allergies.
 *
 * ⚠️ CE N'EST PAS UN DRAPEAU DE PROGRESSION, et la différence n'est pas
 * rhétorique. `profiles.onboarding_completed` prétend qu'un parcours est
 * terminé et ment dans les deux sens dès qu'un fait change derrière lui — c'est
 * pour ça que la reprise se DÉRIVE des faits ici, et pas de lui.
 *
 * Ceci est une RÉPONSE: « as-tu des allergies ? — aucune ». Elle n'a nulle part
 * ailleurs où vivre (une table d'allergies vide ne distingue pas « rien à
 * déclarer » de « on n'a jamais demandé »), et sur une question de sécurité ces
 * deux-là ne sont pas la même chose. Son consommateur est la reprise
 * elle-même — `readFunnelFacts` ci-dessous, et personne d'autre.
 */
const ALLERGY_CHECK_KEY = "allergy_check";

/**
 * « ON A DEMANDÉ LE RÉGIME, ET LA RÉPONSE ÉTAIT: JE MANGE DE TOUT. »
 *
 * Même nature que `allergy_check`, et pour la même raison: il n'y a AUCUNE
 * ligne à poser en base pour « aucune restriction », donc sans cet accusé la
 * reprise redemanderait éternellement — et `canGenerate` bloquerait sur une
 * question à laquelle on a déjà répondu.
 */
const DIET_ASKED_KEY = "diet_asked";

interface AllergyCheck {
  self: boolean;
  members: string[];
}

function readAllergyCheck(pc: Record<string, unknown> | null): AllergyCheck {
  const raw = (pc ?? {})[ALLERGY_CHECK_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { self: false, members: [] };
  }
  const row = raw as Record<string, unknown>;
  return {
    self: row.self === true,
    members: Array.isArray(row.members) ? row.members.map(String) : [],
  };
}

/** Une bouche de l'entonnoir, avec la ligne de base qu'elle porte (ou pas). */
export interface FunnelMouth extends FunnelPerson {
  /** `null` = pas encore écrite en base. */
  memberId: string | null;
  /** `true` quand cette bouche a déjà un compte: son objectif ne s'édite plus ici. */
  claimed: boolean;
}

export interface FunnelFacts {
  /** `null` quand l'étape 1 n'a pas de réponse dérivable. */
  branch: FunnelBranch | null;
  state: FunnelState;
  mouths: FunnelMouth[];
  householdId: string | null;
  ownMemberId: string | null;
  /**
   * JE GOUVERNE CE FOYER — ou j'y suis une bouche parmi d'autres.
   *
   * ⚠️ CE N'EST PAS UN CONFORT D'AFFICHAGE, C'EST LA MOITIÉ DU ROUTAGE. Un
   * SECONDAIRE (quelqu'un qui a réclamé son profil) ne peut ni ajouter ni
   * décrire personne — la base rend `not_owner` aux quatre gestes — et
   * `generate-household-meal-v1` lui rend 403 sur la composition. Son entonnoir
   * est donc celui d'UNE personne: sa date, sa taille, son sexe, sa direction,
   * ses allergies, et un plan PERSONNEL par `generate-meal-v1`. C'est
   * exactement D2 du modèle foyer — cette fonction-là ne sert que les comptes
   * secondaires qui prennent la main et les comptes sans foyer.
   *
   * `true` aussi quand il n'y a AUCUN foyer: on ne peut pas être secondaire de
   * rien, et la branche solo n'a de toute façon rien à gouverner.
   */
  isOwner: boolean;
  /**
   * UN PLAN VIVANT EXISTE DÉJÀ. L'entonnoir est fini — et c'est un FAIT, pas un
   * drapeau: il redevient faux si le plan expire, ce qui est exactement le
   * comportement voulu.
   */
  hasPlan: boolean;
  /** Ce qu'il faut repasser à `mergePracticalConstraints` pour ne rien écraser. */
  practicalConstraints: Record<string, unknown> | null;
}

/**
 * L'ÉTAT DE L'ENTONNOIR, DÉRIVÉ DES FAITS EN BASE.
 *
 * ── POURQUOI AUCUN DRAPEAU DE PROGRESSION ─────────────────────────────────
 * `profiles.onboarding_completed` existe, et n'est lu que par un chemin legacy
 * (`process-checkins/index.ts`). Le réutiliser ferait dire « terminé » à un
 * parcours dont les faits ont changé depuis — quelqu'un qui a retiré sa date de
 * naissance, ou dont le foyer a été vidé, resterait « fini » avec un entonnoir
 * qui ne se rouvre jamais. Et inversement: un compte réglé AVANT l'existence de
 * cet écran serait renvoyé dans un couloir qu'il n'a pas besoin de traverser.
 *
 * Tout ce qui est ci-dessous se relit à chaque montage. C'est plus de lectures,
 * et c'est le prix d'un état qui ne peut pas mentir.
 *
 * ── L'ÉTAPE 1 SE DÉRIVE AUSSI, ET C'EST LA PARTIE SUBTILE ─────────────────
 * Un foyer en base répond « au moins deux ». Pas de foyer, mais une ligne
 * `student_goals`: la personne est passée par l'étape 2, donc elle a répondu
 * « juste moi » — le solo NE CRÉE PAS de foyer, c'est sa signature. Ni l'un ni
 * l'autre: la question n'a pas encore été posée.
 */
export async function readFunnelFacts(userId: string): Promise<FunnelFacts> {
  const [profileRes, goalRes, household] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, birth_date, height_cm, gender")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("student_goals")
      .select("goal, practical_constraints")
      // `.eq` EXPLICITE malgré RLS: quelqu'un qui est à la fois coach et
      // mangeur lit aussi les lignes de ses élèves (`student_goals_select_coach`),
      // et une lecture non scopée lui rendrait la ligne de l'un d'eux. Le dépôt
      // a déjà payé ce défaut sur cette table.
      .eq("user_id", userId)
      .maybeSingle(),
    loadHousehold(userId),
  ]);
  if (profileRes.error) throw new Error(profileRes.error.message);
  if (goalRes.error) throw new Error(goalRes.error.message);

  const profile = (profileRes.data ?? {}) as Record<string, unknown>;
  const goalRow = goalRes.data as Record<string, unknown> | null;
  const pc = (goalRow?.practical_constraints ?? null) as
    | Record<string, unknown>
    | null;
  const check = readAllergyCheck(pc);

  const [ownAllergies, householdAllergies, bodies, ownWeight] = await Promise.all([
    loadActiveConstraints(userId),
    household ? loadAllergies() : Promise.resolve([]),
    // LES CORPS QUE LE MOTEUR LIRA. Réservé au compte maître par la RPC
    // elle-même: un non-maître reçoit zéro ligne, pas une erreur.
    household && household.me?.role === "owner"
      ? loadMemberBodies()
      : Promise.resolve(new Map<string, MemberBodyView>()),
    latestOwnWeightKg(userId),
  ]);

  const allergyByMember = new Set(householdAllergies.map((a) => a.memberId));
  const ownMemberId = household?.me?.memberId ?? null;
  // Pas de foyer ⇒ `true`: on n'est pas le secondaire de rien. Voir `isOwner`.
  const isOwner = household === null || household.me?.role === "owner";

  const mouths: FunnelMouth[] = (isOwner ? household?.members ?? [] : [])
    .filter((m) => m.memberId !== ownMemberId)
    .map((m) => ({
      memberId: m.memberId,
      claimed: m.userId !== null,
      // `loadHousehold` rend « — » pour un prénom vide (jamais l'e-mail: ça
      // divulguerait une adresse à tout le foyer). Ce libellé d'écran ne doit
      // pas repartir comme une RÉPONSE: l'entonnoir redemanderait alors un
      // prénom déjà « rempli » par un tiret.
      firstName: m.displayName === "—" ? "" : m.displayName,
      // `unknown` → `adult`, DÉLIBÉRÉMENT. Ne pas savoir n'est pas savoir que
      // c'est un enfant: traiter l'inconnu comme un mineur ferait disparaître
      // les deux questions (date, objectif) sur exactement la ligne où elles
      // manquent, et la génération partirait avec une bouche d'âge inconnu et
      // sans direction. `adult` fait poser les deux.
      kind: m.ageState === "minor" ? "child" : "adult",
      birthDate: m.ageState === "unknown" ? null : BIRTH_DATE_ON_FILE,
      goal: (MEMBER_GOALS as readonly string[]).includes(m.goal ?? "")
        ? (m.goal as MemberGoal)
        : null,
      allergiesReviewed:
        check.members.includes(m.memberId) || allergyByMember.has(m.memberId),
      // ⚠️ LU DEPUIS `household_member_bodies`, PAS DEPUIS `profiles`. C'est la
      // seule table que `keel_household_bodies_for` regarde — donc la seule
      // dont le moteur tienne compte. Lire ailleurs afficherait « rempli » sur
      // un corps que la composition ne verra jamais.
      // ⚠️ LE RÉGIME D'UNE AUTRE BOUCHE N'A PAS ENCORE DE MAISON. Les trois
      // jetons vivent sur `student_safety_constraints`, clée sur `user_id` —
      // une bouche sans compte n'a donc nulle part où le porter, exactement
      // comme les allergies avant `household_member_allergies`. Le lot suivant
      // ouvre la colonne; d'ici là, la question n'est pas posée par bouche et
      // ce champ reste `null` sans bloquer quoi que ce soit.
      diet: null,
      heightCm: bodies.get(m.memberId)?.heightCm ?? null,
      weightKg: bodies.get(m.memberId)?.weightKg ?? null,
      gender: bodies.get(m.memberId)?.gender ?? null,
    }));

  // Un foyer d'une seule bouche est un foyer qu'on a commencé et pas rempli:
  // la branche reste « au moins deux », sinon l'étape 2b disparaîtrait de
  // l'écran de la seule personne qui en a besoin.
  //
  // ⚠️ ET POUR UN SECONDAIRE, LA RÉPONSE EST 1, quel que soit le nombre de
  // bouches autour de la table. Ce n'est pas une erreur de comptage: la
  // question de l'étape 1 est « combien de personnes est-ce que TU nourris »,
  // et il n'en nourrit aucune — il ne compose ni n'ajoute personne (`not_owner`
  // aux quatre gestes). Son entonnoir est celui d'une personne seule, et son
  // plan est personnel.
  const declared = household && isOwner ? Math.max(2, household.members.length) : null;
  const derived = declared ?? (household !== null || goalRow ? 1 : null);

  const state: FunnelState = {
    mouths: derived,
    self: {
      firstName: household?.me
        ? household.me.displayName === "—"
          ? ""
          : household.me.displayName
        : String(profile.full_name ?? "").trim().split(" ")[0] ?? "",
      kind: "adult",
      birthDate: typeof profile.birth_date === "string" && profile.birth_date
        ? profile.birth_date
        : null,
      goal: (MEMBER_GOALS as readonly string[]).includes(String(goalRow?.goal ?? ""))
        ? (String(goalRow?.goal) as MemberGoal)
        : null,
      allergiesReviewed: check.self ||
        ownAllergies.some((c) => c.kind === "allergy"),
      // UNE LIGNE `kind='diet'` RÉPOND; sinon l'accusé « je mange de tout »,
      // qui est une réponse et pas une absence. Voir `FunnelPerson.diet`.
      diet: readDietAnswer(ownAllergies, pc),
      // `numeric` arrive en CHAÎNE par PostgREST: un `typeof === "number"`
      // rendrait `null` sur une taille pourtant enregistrée.
      //
      // ⚠️ ET LE `== null` EST LA MOITIÉ QUI COMPTE. `Number(null)` vaut `0`,
      // qui EST fini: sans ce test, une taille absente se lisait `0` et le
      // champ s'affichait pré-rempli à zéro sur un compte neuf. Vu à l'écran
      // le 2026-08-13. La garde refusait bien `0` (hors bornes), donc rien ne
      // partait en base — mais on demandait à quelqu'un de corriger une valeur
      // qu'il n'avait jamais saisie.
      heightCm: profile.height_cm == null || !Number.isFinite(Number(profile.height_cm))
        ? null
        : Number(profile.height_cm),
      gender: (MEMBER_GENDERS as readonly string[]).includes(String(profile.gender ?? ""))
        ? (String(profile.gender) as MemberGender)
        : null,
      // MON POIDS VIENT DE LA SÉRIE DE MESURES, pas d'une colonne de profil:
      // il n'y en a pas, et c'est voulu — un poids est une suite de points
      // datés, et c'est ce que `restriction_guard` compare. Dans un foyer, ma
      // ligne de corps porte le même nombre, pour le moteur.
      weightKg: ownWeight ?? (ownMemberId ? bodies.get(ownMemberId)?.weightKg ?? null : null),
    },
    others: mouths,
    plan: readPlanAnswers(pc),
  };

  return {
    branch: branchForMouths(derived),
    state,
    mouths,
    householdId: household?.id ?? null,
    ownMemberId,
    isOwner,
    hasPlan: await hasLivePlan(userId),
    practicalConstraints: pc,
  };
}

/**
 * LE RÉGIME DÉCLARÉ, RELU DEPUIS LES DEUX ENDROITS QUI PEUVENT LE PORTER.
 *
 * Une ligne `kind='diet'` active fait foi. À défaut, l'accusé « on a demandé,
 * la réponse était: je mange de tout » — parce qu'« aucune ligne » ne
 * distingue pas l'omnivore de celui à qui on n'a rien demandé, et que la
 * différence coûte un plan de viande servi à un végétarien.
 */
function readDietAnswer(
  constraints: readonly { kind: string; diet_ref: string | null }[],
  pc: Record<string, unknown> | null,
): DietAnswer | null {
  const declared = constraints
    .filter((c) => c.kind === "diet")
    .map((c) => String(c.diet_ref ?? ""))
    .find((ref) => (DIET_ANSWERS as readonly string[]).includes(ref));
  if (declared) return declared as DietAnswer;
  return (pc ?? {})[DIET_ASKED_KEY] === true ? "omnivore" : null;
}

/** Les quatre réponses de l'étape 3, relues avec LES parseurs du moteur. */
function readPlanAnswers(pc: Record<string, unknown> | null): FunnelPlanAnswers {
  const budget = String(pc?.budget_band ?? "");
  const time = Number(pc?.cooking_time_min);
  return {
    // `parseEatingRhythm` et pas une seconde lecture: deux lectures de la même
    // colonne qui divergent produisent un écran qui montre autre chose que ce
    // avec quoi on compose.
    eatingRhythm: parseEatingRhythm(pc?.eating_rhythm).map((s) => s.slot),
    cookDays: Array.isArray(pc?.cook_days)
      ? (pc!.cook_days as unknown[])
        .map(String)
        .filter((d) => (DAY_TOKENS as readonly string[]).includes(d))
      : [],
    cookingTimeMin: Number.isFinite(time) && time > 0 ? time : null,
    budgetBand: budget === "tight" || budget === "normal" || budget === "comfortable"
      ? budget
      : null,
  };
}

/**
 * MON DERNIER POIDS CONNU, ou `null` si je n'ai jamais été pesé.
 *
 * `student_body_measures` est la table de FF-008: une suite de points datés,
 * celle que `restriction_guard.ts` compare à quatorze jours d'écart pour
 * détecter une perte rapide. C'est pour ça que le poids saisi à l'entrée doit
 * y atterrir et pas seulement dans le corps de foyer — sans premier point, la
 * ceinture n'a rien à quoi comparer le second.
 */
async function latestOwnWeightKg(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("student_body_measures")
    .select("value_si")
    .eq("user_id", userId)
    .eq("kind", "weight")
    .order("local_date", { ascending: false })
    .order("measured_at", { ascending: false })
    .limit(1);
  // NE PAS AVALER: rendre `null` sur une lecture ratée redemanderait un poids
  // déjà donné, et en écrirait un second point le même jour.
  if (error) throw new Error(error.message);
  const raw = (data ?? [])[0] as Record<string, unknown> | undefined;
  // `numeric` arrive en CHAÎNE par PostgREST.
  const value = Number(raw?.value_si);
  return Number.isFinite(value) ? value : null;
}

/**
 * UN PLAN VIVANT, quelle que soit sa nature.
 *
 * `plan_kind` n'est PAS filtré ici, contrairement aux lecteurs de `household.ts`
 * — et c'est voulu: la question est « cette personne a-t-elle déjà obtenu un
 * plan », pas « lequel ». Un secondaire qui a son plan personnel et un maître
 * qui a le plan du foyer sont tous les deux sortis de l'entonnoir.
 */
async function hasLivePlan(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("student_generated_meals")
    .select("id")
    .eq("user_id", userId)
    .is("retired_at", null)
    .gte("ends_on", browserLocalDate())
    .limit(1);
  // NE PAS AVALER. Rendre `false` sur une lecture ratée renverrait dans
  // l'entonnoir quelqu'un qui a déjà tout réglé.
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * MON PROFIL — prénom, date, taille, sexe, en une écriture.
 *
 * ⚠️ LA DATE PASSE PAR `setOwnBirthDate`, PAS PAR CE `update`. Elle porte la
 * garde du produit (`assessBirthDate` + `birthDateWritable`) et son refus nommé,
 * parce qu'il n'y a AUCUN CHECK sur `profiles.birth_date`: l'écrire en direct
 * échangerait un refus lisible contre une date future acceptée en silence, que
 * `keel_age_state` traduirait ensuite en `unknown`. La personne verrait
 * « enregistré » et perdrait sa direction d'objectif.
 *
 * ⚠️ `.select()` DERRIÈRE L'UPDATE. RLS refuse le profil d'autrui sans lever:
 * l'update toucherait ZÉRO ligne et PostgREST rendrait 204 en silence.
 */
export async function saveOwnProfile(args: {
  userId: string;
  firstName: string;
  heightCm: number;
  gender: MemberGender;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    height_cm: args.heightCm,
    gender: args.gender,
  };
  const name = args.firstName.trim();
  if (name) patch.full_name = name;
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", args.userId)
    .select("id");
  if (error) throw new Error(`[keel/onboarding] profile: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("[keel/onboarding] profile: nothing was saved");
  }
}

/**
 * MON POIDS — DANS LA SÉRIE DE MESURES, et nulle part ailleurs.
 *
 * ⚠️ IL N'Y A PAS DE COLONNE `profiles.weight_kg`, et c'est une décision, pas
 * un manque: un poids est une SUITE DE POINTS DATÉS. `restriction_guard.ts`
 * détecte la perte rapide en comparant deux points hebdomadaires contre
 * `max_weekly_loss_pct = 1.2`; une colonne écrasée à chaque saisie n'aurait
 * jamais de second point à comparer, et la ceinture serait désarmée en
 * silence.
 *
 * ⚠️ IDEMPOTENT SUR LA JOURNÉE. L'entonnoir se reprend, et une reprise ne doit
 * pas empiler trois poids le même jour: la série s'en trouverait faussée, et
 * c'est elle qui arme la garde. On écrit donc un point par jour local, relu.
 *
 * `source: 'setup'` — quatrième valeur du vocabulaire fermé, ajoutée par
 * `20260813090000`. Réutiliser `plan_card` aurait fait dire à l'audit « la
 * carte de /app/plan » d'un nombre saisi le jour de l'inscription.
 */
export async function saveOwnWeight(args: {
  userId: string;
  weightKg: number;
  localDate: string;
}): Promise<void> {
  const existing = await supabase
    .from("student_body_measures")
    .select("id")
    .eq("user_id", args.userId)
    .eq("kind", "weight")
    .eq("local_date", args.localDate)
    .eq("source", "setup")
    .limit(1);
  if (existing.error) {
    throw new Error(`[keel/onboarding] weight: ${existing.error.message}`);
  }

  const row = (existing.data ?? [])[0] as { id?: unknown } | undefined;
  const written = row?.id
    ? await supabase
      .from("student_body_measures")
      .update({ value_si: args.weightKg, measured_at: new Date().toISOString() })
      .eq("id", String(row.id))
      .select("id")
    : await supabase
      .from("student_body_measures")
      .insert({
        user_id: args.userId,
        kind: "weight",
        value_si: args.weightKg,
        local_date: args.localDate,
        measured_at: new Date().toISOString(),
        source: "setup",
        // La langue DÉCLARÉE de l'app authentifiée, comme les autres
        // écrivains de contenu de ce dépôt.
        content_locale: "en-GB",
      })
      .select("id");

  if (written.error) {
    throw new Error(`[keel/onboarding] weight: ${written.error.message}`);
  }
  // RLS refuse la ligne d'autrui SANS LEVER: zéro ligne touchée rendrait 204
  // en silence, et l'écran dirait « enregistré » sur un poids parti nulle part.
  if (!written.data || written.data.length === 0) {
    throw new Error("[keel/onboarding] weight: nothing was saved");
  }
}

/**
 * MON RÉGIME — une ligne `kind='diet'`, ou l'accusé qu'on a demandé.
 *
 * ⚠️ `severity: 'strict'` ET PAS `'medical'`, ET LA NUANCE EST TENUE PAR LA
 * BASE (`student_safety_constraints_diet_severity_check` n'accepte que ces
 * deux-là pour un régime). `medical` est l'INTERRUPTEUR qui arme le verrou de
 * sortie et remplace un message entier; un régime est une conviction, pas un
 * danger vital. Ce qui l'applique est l'expansion en groupes exclus
 * (`excludedGroupsFor`), au moment de composer — pas un verrou de parole.
 *
 * ⚠️ ON NE RETIRE PAS L'ANCIENNE LIGNE. La table est en rétractation seule
 * (trigger `student_safety_constraints_retraction_only`): une contrainte ne
 * s'édite pas, elle se remplace. Changer de régime depuis cet écran écrirait
 * donc une seconde ligne, et le moteur prendrait la PREMIÈRE qu'il trouve —
 * d'où le refus explicite plutôt qu'un silence. L'entonnoir n'est pas le
 * bon endroit pour changer d'avis; `/app/health` l'est.
 */
export async function saveOwnDiet(args: {
  userId: string;
  diet: DietAnswer;
  current: Record<string, unknown> | null;
}): Promise<void> {
  if (args.diet !== "omnivore") {
    try {
      await declareConstraint({
        userId: args.userId,
        kind: "diet",
        severity: "strict",
        ref: args.diet,
        refField: "diet_ref",
        notes: null,
        contentLocale: "en-GB",
      });
    } catch (error) {
      // Déjà déclaré: un double clic, ou une reprise. Ce n'est pas un échec.
      if (!(error instanceof DuplicateConstraintError)) throw error;
    }
  }
  // L'ACCUSÉ VAUT POUR LES QUATRE RÉPONSES, y compris les trois qui ont écrit
  // une ligne: la reprise lit l'un OU l'autre, et deux chemins de lecture qui
  // ne s'accordent pas sont une question qui revient sans raison.
  await mergePracticalConstraints({
    userId: args.userId,
    current: args.current,
    patch: { [DIET_ASKED_KEY]: true },
    source: "onboarding/diet",
  });
}

/**
 * LE CORPS D'UNE BOUCHE — LA SEULE ÉCRITURE QUE LE MOTEUR DU FOYER LIRA.
 *
 * ⚠️ `profiles.height_cm` ET `profiles.gender` NE SUFFISENT PAS, et c'est le
 * défaut mesuré le 2026-08-13. `keel_household_bodies_for` lit UNIQUEMENT
 * `household_member_bodies`, sans aucun repli sur `profiles`; et
 * `generate-household-meal-v1` saute toute bouche dont le corps est incomplet.
 * Un foyer dont personne n'a de ligne de corps compose donc un tronc
 * dimensionné sur rien, et zéro add-on par bouche — le plan sort, et les
 * portions sont indifférenciées.
 *
 * Vaut pour LE MAÎTRE AUSSI: sa ligne de foyer est une bouche comme les autres,
 * et son profil ne la remplace pas.
 *
 * Refus nommés: `not_owner`, `not_a_member`, `body_incomplete`, `bad_height`,
 * `bad_weight`, `bad_gender`.
 */
export async function saveMouthBody(args: {
  memberId: string;
  heightCm: number;
  weightKg: number;
  gender: MemberGender;
}): Promise<void> {
  const result = await setMemberBody(
    args.memberId,
    args.heightCm,
    args.weightKg,
    args.gender,
  );
  if (!result.ok) throw new Error(String(result.reason));
}

/**
 * MON OBJECTIF — et ce n'est PAS `createOwnerGoalRow`.
 *
 * Celle-là passe `ignoreDuplicates` exprès: appelée depuis l'écran du foyer,
 * elle DOIT laisser tranquille la ligne de quelqu'un qui a déjà rempli une
 * cible. Ici, l'objectif est la RÉPONSE À UNE QUESTION DE L'ENTONNOIR, et une
 * réponse qui n'écrit rien est un no-op silencieux — le mode d'échec n°1 de ce
 * dépôt.
 *
 * ⚠️ TROIS COLONNES REMISES À NULL, ET C'EST OBLIGATOIRE, PAS PRUDENT.
 * `student_goals` porte des CHECK CROISÉS: `target_weight_kg` n'est légal que
 * sur trois objectifs, `target_waist_cm` que sur `recomposition`, `focus_axis`
 * que sur deux. Changer `goal` sans les nettoyer fait échouer l'écriture chez
 * exactement les gens qui ont déjà posé une cible — et le message serait une
 * violation de contrainte PostgreSQL affichée dans un entonnoir d'accueil.
 */
export async function saveOwnGoal(userId: string, goal: MemberGoal): Promise<void> {
  const { data: current, error: readErr } = await supabase
    .from("student_goals")
    .select("goal, target_weight_kg, target_waist_cm, focus_axis")
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(`[keel/onboarding] goal: ${readErr.message}`);

  if (!current) {
    const { error } = await supabase.from("student_goals").insert({
      user_id: userId,
      goal,
      // La langue DÉCLARÉE de l'app authentifiée (i18n/catalog.ts: la vitrine
      // est bilingue, le produit connecté est en anglais). Même valeur que les
      // deux autres écrivains de cette colonne.
      content_locale: "en-GB",
    });
    if (error) throw new Error(`[keel/onboarding] goal: ${error.message}`);
    return;
  }

  const row = current as Record<string, unknown>;
  const keepsWeight = goal === "fat_loss" || goal === "muscle_gain" ||
    goal === "maintenance";
  const keepsWaist = goal === "recomposition";
  const keepsFocus = goal === "health" || goal === "performance";
  const { data, error } = await supabase
    .from("student_goals")
    .update({
      goal,
      target_weight_kg: keepsWeight ? row.target_weight_kg ?? null : null,
      target_waist_cm: keepsWaist ? row.target_waist_cm ?? null : null,
      focus_axis: keepsFocus ? row.focus_axis ?? null : null,
    })
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw new Error(`[keel/onboarding] goal: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("[keel/onboarding] goal: nothing was saved");
  }
}

/**
 * MES ALLERGIES, ET LE FAIT QU'ON A DEMANDÉ.
 *
 * ⚠️ « AUCUNE » EST UNE RÉPONSE, et elle s'enregistre. Sans elle, une table
 * vide ne distingue pas « rien à déclarer » de « on n'a jamais demandé », et la
 * reprise redemanderait éternellement — sur la seule question du parcours dont
 * la mauvaise réponse est dangereuse.
 *
 * Un doublon n'est PAS un échec: c'est un double clic, ou une allergie déjà
 * déclarée sur `/app/health`. On le laisse passer.
 */
export async function saveOwnAllergies(args: {
  userId: string;
  labels: readonly string[];
  current: Record<string, unknown> | null;
}): Promise<void> {
  for (const label of args.labels) {
    const ref = normalizeAllergenInput(label);
    if (!ref) continue;
    try {
      await declareConstraint({
        userId: args.userId,
        kind: "allergy",
        // `medical` n'est PAS une nuance de gravité, c'est l'INTERRUPTEUR qui
        // arme le verrou de sortie. Une allergie déclarée dans l'entonnoir est
        // une allergie: elle doit tenir le générateur ET le chat.
        severity: "medical",
        ref,
        refField: "allergen_ref",
        notes: null,
        contentLocale: "en-GB",
      });
    } catch (error) {
      if (!(error instanceof DuplicateConstraintError)) throw error;
    }
  }
  const check = readAllergyCheck(args.current);
  await mergePracticalConstraints({
    userId: args.userId,
    current: args.current,
    patch: { [ALLERGY_CHECK_KEY]: { ...check, self: true } },
    source: "onboarding/allergies",
  });
}

/**
 * LES ALLERGIES D'UNE BOUCHE, ET LE FAIT QU'ON A DEMANDÉ.
 *
 * ⚠️ LE SECOND MEMBRE N'EST PAS DÉCORATIF, ET SON ABSENCE BLOQUAIT L'ENTONNOIR.
 * Mesuré au navigateur le 2026-08-12: une bouche ajoutée avec « rien à
 * déclarer » n'écrivait RIEN — la table d'allergies reste vide, ce qui est
 * juste, et rien d'autre ne gardait trace de la question. Au rechargement
 * suivant, `readFunnelFacts` la relisait donc comme « jamais demandé »,
 * `canGenerate` réclamait `member_allergies`, et la ligne n'offrait aucun
 * champ pour y répondre. Le parcours était mort, sans message.
 *
 * L'accusé vit sur la ligne `student_goals` DU MAÎTRE et pas sur la bouche:
 * `household_members` n'a pas de colonne libre, et en ajouter une pour un fait
 * d'interface serait payer une migration pour une trace d'entonnoir.
 */
export async function saveMouthAllergies(args: {
  userId: string;
  memberId: string;
  labels: readonly string[];
  current: Record<string, unknown> | null;
}): Promise<void> {
  for (const label of args.labels) {
    const clean = label.trim();
    if (!clean) continue;
    const added = await addAllergy(args.memberId, clean);
    if (!added.ok) throw new Error(String(added.reason));
  }
  const check = readAllergyCheck(args.current);
  if (check.members.includes(args.memberId)) return;
  await mergePracticalConstraints({
    userId: args.userId,
    current: args.current,
    patch: {
      [ALLERGY_CHECK_KEY]: { ...check, members: [...check.members, args.memberId] },
    },
    source: "onboarding/mouth-allergies",
  });
}

/** Les quatre réponses de l'étape 3, en une écriture fusionnée. */
export async function savePlanAnswers(args: {
  userId: string;
  current: Record<string, unknown> | null;
  answers: FunnelPlanAnswers;
}): Promise<void> {
  await mergePracticalConstraints({
    userId: args.userId,
    current: args.current,
    patch: {
      // La forme que `parseEatingRhythm` attend, avec la taille laissée
      // ouverte: elle est facultative, et une taille exigée serait une taille
      // inventée — que le moteur traiterait comme une contrainte.
      eating_rhythm: args.answers.eatingRhythm.map((slot) => ({ slot, size: null })),
      // L'ORDRE DE LA SEMAINE, pas celui des clics.
      cook_days: DAY_TOKENS.filter((d) => args.answers.cookDays.includes(d)),
      cooking_time_min: args.answers.cookingTimeMin,
      budget_band: args.answers.budgetBand,
    },
    source: "onboarding/plan",
  });
}
