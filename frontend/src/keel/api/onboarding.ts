import {
  type CookingStyle,
  type GroceryRuns,
  readCookingStyle,
  readGroceryRuns,
} from "./cookingPlan";
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

import { isUsableBudgetAmount } from "./planBudget";
import { supabase } from "../../lib/supabase";
import {
  assessBirthDate,
  type BirthDateVerdict,
} from "../../../../supabase/functions/_shared/keel/student_age.ts";
// ⚠️ `tokens.ts` EST L'AUTORITÉ DU VOCABULAIRE D'ACTIVITÉ, et il y en a un
// SECOND dans le dépôt: `_shared/keel/activity_floor.ts` porte
// `lightly_active` / `active` / `very_active`. C'est celui-ci qui a la
// contrainte CHECK de `profiles.activity_level` et de
// `household_member_bodies.activity_level` avec lui (`20260818100000`), donc
// c'est celui-ci que l'entonnoir écrit. Collecter l'autre remplirait la colonne
// de valeurs que la base refuse — ou, pire si la contrainte tombait un jour,
// de valeurs que `ACTIVITY_FACTORS` rendrait `undefined`.
import {
  ACTIVITY_LEVELS,
  DAY_ACTIVITY_LEVELS,
  type AppetiteLevel,
  type DayActivityLevel,
  SPORT_FREQUENCIES,
  type SportFrequency,
  type ActivityLevel,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
// ⚠️ `./allergenSlug` ET SURTOUT PAS `../copy/allergens`, QUI RÉEXPORTE LE MÊME
// SYMBOLE. Ce module-ci est atteint par `api/household.ts`, donc par
// `/app/plan`, `/app/household` et `/join-household`; passer par `copy/` ferait
// entrer les treize littéraux `allergen.*` dans leur périmètre alors qu'aucune
// des trois n'en rend un seul. Le scanner de `i18n/pageSeams.int.test.ts` suit
// les IMPORTS, pas les appels — voir l'en-tête d'`api/planRouting.ts`, écrit
// contre exactement ce piège, et celui d'`api/allergenSlug.ts`.
import { normalizeAllergenInput } from "./allergenSlug";
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
// ⛔ `AwayMark` ET PLUS `AwayDay` SUR `FunnelMouth.away` — DÉFAUT P1 (L6,
// 2026-08-18). L'entonnoir est l'un des quatre points de montage de la grille
// de présence; un type qui perd le jeton `kind` laisse un écran le reconstruire
// à plat, et « dehors » ressort « absent » au premier enregistrement.
import { type AwayMark } from "../lib/presenceMarks";
import {
  DAY_TOKENS,
  EATING_OCCASIONS,
  type EatingOccasionSlot,
  parseEatingRhythm,
} from "./mealGeneration";
// ⚠️ LE TEMPS DE SESSION A DÉMÉNAGÉ DANS `planInputs`. Il est une entrée de
// PLAN, pas une question d'entonnoir: `MealBuilder` le pose aussi, et
// l'importer d'ici traînait tout le vocabulaire de l'entonnoir (allergènes,
// objectifs, motifs) dans /app/plan — la garde de coutures l'a attrapé.
export { COOKING_SESSION_MINUTES, cookingTimeParts } from "./planBudget";
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
/**
 * LES QUATRE ÉTAPES, ET LA QUATRIÈME EST NÉE LE 2026-08-13.
 *
 * ── CE QUI SE MÉLANGEAIT DANS L'ANCIENNE ÉTAPE 3 ──────────────────────────
 * Elle portait, dans la même carte: les moments où on mange, les jours où on
 * cuisine, la durée d'une session, le budget. Deux natures de question, et la
 * confusion était mesurée à l'usage — on lisait un bouton gris sans faire le
 * lien avec des rangées vides plus haut.
 *
 * `table` = LES FAITS DE LA MAISON. Qui mange, et à quels moments. Ça ne bouge
 * pas d'une semaine sur l'autre, et ça se demande une fois.
 *
 * `request` = LA DEMANDE DE CE PLAN-LÀ. Quand je peux cuisiner cette
 * semaine-ci, combien de temps j'ai, combien je veux dépenser, ce dont j'ai
 * envie. Ça change à chaque composition — et c'est pour ça que ces
 * questions-là vivent sur l'écran qui compose, ici comme dans la plateforme.
 */
export type FunnelStepId = "situate" | "people" | "table" | "request";

export type FunnelQuestionId =
  // Étape 1
  | "household_size"
  // Étape 2 — moi
  | "own_first_name"
  | "own_birth_date"
  | "own_height_cm"
  | "own_gender"
  | "own_weight_kg"
  | "own_activity_level"
  | "own_goal"
  | "own_diet"
  | "own_allergies"
  // Étape 2b — les autres bouches
  | "member_first_name"
  | "member_birth_date"
  | "member_height_cm"
  | "member_weight_kg"
  | "member_gender"
  | "member_activity_level"
  | "member_goal"
  | "member_allergies"
  // Étape 3 — la table
  | "eating_rhythm"
  | "member_eating_rhythm"
  // Étape 4 — la demande de plan
  | "cook_days"
  | "cooking_time_min"
  | "cooking_style"
  | "grocery_runs"
  | "budget_amount"
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
    // ── LE NIVEAU D'ACTIVITÉ (lot L0, 2026-08-18) ────────────────────────
    //
    // ⚠️ POURQUOI `wrong` ET PAS `better`, ALORS QUE LA RÈGLE LITTÉRALE DIRAIT
    // `better`. Sans réponse, le plan n'est pas FAUX: il retombe sur
    // l'hypothèse documentée (`ACTIVITY_FACTOR = 1.5`), qui est exactement le
    // comportement de toute la base d'avant ce lot. La lettre de la règle
    // classerait donc cette question « moins bon ».
    //
    // Ce qui départage est le SECOND MEMBRE de la règle: « moins bon → APRÈS le
    // plan, devant le plat que ça change ». Le dépôt a déjà écrit l'argument,
    // dix lignes plus haut, sur `own_height_cm`:
    //
    //     « Une taille ne change AUCUN plat en particulier; elle change toutes
    //       les quantités, invisiblement. Il n'existe donc aucun moment
    //       postérieur pour la demander — et "après" signifierait jamais. »
    //
    // L'activité est le MÊME OBJET. Elle ne se rattache à aucun plat, donc
    // aucune question `better` ne peut la porter: une `better` se pose devant
    // une assiette, et il n'y a pas d'assiette qui dise « celle-ci est plus
    // grande parce que tu cours ». Elle va donc dans l'entonnoir, à côté de
    // taille/poids/sexe, qui sont les autres entrées de la même équation.
    //
    // ⚠️ ET CE QU'ELLE PÈSE, MESURÉ: `ACTIVITY_FACTORS` va de 1,45
    // (`sedentary`) à 2,00 (`trains_hard`), soit **38 % d'enveloppe** entre les
    // deux extrêmes — le double de l'incertitude du calcul lui-même. Servir la
    // même hypothèse à quelqu'un assis huit heures et à quelqu'un qui court
    // quatre fois par semaine n'est pas une approximation, c'est la seule
    // erreur de dimensionnement que le produit puisse encore commettre sur un
    // corps entièrement décrit.
    //
    // ⚠️ `wrong` VEUT DIRE « DANS L'ENTONNOIR », PAS « BLOQUE LA COMPOSITION ».
    // `canGenerateMisses` ne l'émet PAS, délibérément — voir la note à
    // l'endroit où elle ne l'émet pas. Les deux sens de `weight` ne se
    // recouvrent qu'ici, et c'est parce que `null` est une réponse légitime
    // que la colonne accepte exprès (« l'absence reste une valeur »,
    // `tokens.ts`).
    id: "own_activity_level",
    consumer: "supabase/functions/_shared/keel/meal_envelope.ts#ACTIVITY_FACTORS",
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
    // ⚠️ ÉTAPE `people` DEPUIS LE 2026-08-19, ET C'EST OÙ ELLE EST POSÉE. Le
    // régime a rejoint la fiche de chaque bouche (première section, parce qu'il
    // écarte des familles entières d'aliments). Le laisser sur `table` — étape
    // supprimée le même jour — l'aurait rattaché à un écran qui ne se rend
    // plus: `missesForStep` n'aurait plus jamais rendu ce motif, et
    // `canGenerate` aurait refusé sans qu'aucune étape ne puisse le lever.
    id: "own_diet",
    consumer: "supabase/functions/_shared/keel/dietary_regime.ts#dietaryRegimePromptLine",
    weight: "wrong",
    branches: ALL_BRANCHES,
    // ── ÉTAPE 3, AVEC LE RESTE DE « COMMENT ON MANGE » ────────────────────
    // Elle a vécu à l'étape 2, parmi les faits d'IDENTITÉ (prénom, naissance,
    // corps, objectif). Signalé à l'écran le 2026-08-14: l'étape 2 dit qui
    // sont les gens, l'étape 3 dit comment ils mangent — et « Je mange de
    // tout / Végétarien / Végane / Pescatarien » est la seconde question, pas
    // la première. La laisser là posait la même question à deux endroits de
    // l'entonnoir selon qu'elle concerne le maître ou une autre bouche.
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
    // Le jumeau de `own_activity_level` pour une bouche SANS COMPTE — même
    // argument, même mesure (1,45 → 2,00 = 38 % d'enveloppe), et le même
    // `wrong` qui ne bloque pas.
    //
    // ⚠️ IL N'EST PAS DANS LE TOUT-OU-RIEN DU CORPS. Les trois lignes
    // au-dessus le sont parce que le moteur SAUTE une bouche dont le corps est
    // incomplet; celle-ci ne l'est pas, parce qu'une bouche sans cran compose
    // normalement sur l'hypothèse. La RPC applique la même coupure
    // (`20260818160000`): `body_incomplete` sur les trois, jamais sur celui-ci.
    //
    // ⚠️ ET SUR UN MINEUR, LE CRAN NE PEUT QUE FAIRE MONTER LE BESOIN
    // (`childActivityFactor`). C'est une garde du moteur, pas de l'écran:
    // la case est cochée par le compte maître, et laisser « assis toute la
    // journée » retirer 9 % du besoin d'un corps en croissance sur la foi
    // d'une case cochée par quelqu'un d'autre est la direction d'erreur qu'on
    // refuse.
    id: "member_activity_level",
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
    // ⚠️ ÉTAPE `people` DEPUIS LE 2026-08-19, même raison que `own_diet`. La
    // question « combien de fois elle mange » est dans la fiche, juste au-dessus
    // de « ce qu'elle mange déjà », qu'elle dimensionne. La réponse du TITULAIRE
    // écrit celle de la maison — voir `saveSelf`.
    id: "eating_rhythm",
    consumer: "supabase/functions/_shared/keel/meal_generation.ts#parseEatingRhythm",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "people",
    scope: "household",
  },
  {
    // ── LES MOMENTS D'UNE AUTRE BOUCHE — `better`, ET C'EST MESURÉ ────────
    // Sans réponse, cette bouche mange aux moments de la maison: le plan est
    // MOINS BON (on compose un déjeuner pour un ado qui n'en prend pas), il
    // n'est pas FAUX. C'est la définition de `better`, donc elle n'est jamais
    // rendue par `funnelSteps` et n'entre dans aucun refus.
    //
    // ⚠️ ELLE EST QUAND MÊME OFFERTE À L'ÉCRAN, sur l'étape `table`. Le
    // catalogue liste ce qui est EXIGÉ; un écran a le droit de proposer un
    // raffinement en plus — comme il propose déjà d'inviter une bouche ou de la
    // retirer. Ce qui est interdit est l'inverse: exiger sans consommateur.
    //
    // ⚠️ ET SURTOUT: AUCUN PRÉ-REMPLISSAGE. On serait tenté de cocher les
    // moments de la maison sur chaque bouche pour que l'écran ait l'air
    // complet. Ce serait écrire un fait que personne n'a énoncé — « coche
    // automatique = faits faux indémentables ».
    id: "member_eating_rhythm",
    consumer:
      "supabase/functions/_shared/keel/household_portions.ts#eatingSlots",
    weight: "better",
    branches: NEVER,
    step: null,
    scope: "each_member",
  },
  {
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ RETIRÉ DU PRODUIT LE 2026-09-01 — l'entrée reste, DÉSARMÉE.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Le champ « les jours où tu cuisines » n'existe plus sur aucun écran.
    // `weight: "wrong"` retenait l'étape; il passe à `"better"` et `step` à
    // `null`, donc plus aucune porte ne le réclame.
    //
    // ⚠️ L'ENTRÉE N'EST PAS SUPPRIMÉE, et c'est délibéré: le générateur LIT
    // toujours `practical_constraints.cook_days` (`readCookingCapacity` des
    // deux lanes). Retirer la ligne ferait disparaître du registre un champ qui
    // décide encore des plans des comptes d'avant — exactement l'inverse de ce
    // que ce registre existe pour montrer. Elle est écrite vide par
    // `savePlanInputs` et par `savePlanAnswers`.
    id: "cook_days",
    consumer: "supabase/functions/generate-meal-v1/index.ts#cook_days",
    weight: "better",
    // ⚠️ `NEVER`, ET LE TEST DU CATALOGUE L'EXIGE: une question `better` ne
    // vit sur AUCUNE branche, sinon `funnelSteps` la rendrait — c'est-à-dire
    // afficherait un champ qui n'existe plus.
    branches: NEVER,
    step: null,
    scope: "household",
  },
  // ⟳ P2 (2026-09-03) — `cooking_time_min` PASSE DE « wrong » À « better », ET
  // SORT DE L'ÉTAPE. L'entrée RESTE: le moteur lit toujours la clé, et cinq
  // lecteurs en dépendent. Ce qui change est qu'on ne la DEMANDE plus — elle se
  // dérive du style. La retirer du catalogue ferait disparaître du produit la
  // trace qu'elle est encore lue.
  {
    id: "cooking_time_min",
    consumer: "supabase/functions/generate-meal-v1/index.ts#cooking_time_min",
    weight: "better",
    // ⛔ `NEVER` ET PAS `ALL_BRANCHES`: le contrat de §3.1 est qu'une `better`
    // ne vit dans AUCUNE branche et n'a PAS d'étape — sinon `funnelSteps` la
    // rendrait, c'est-à-dire remettrait dans l'entonnoir la question qu'on
    // vient d'en sortir.
    branches: NEVER,
    step: null,
    scope: "household",
  },
  // ⟳ P2 — LES DEUX QUESTIONS QUI LA REMPLACENT, BLOQUANTES À SA PLACE.
  // `wrong` et pas `better`: sans elles, le moteur ne sait ni combien de fois
  // on cuisine ni combien de vagues de courses il a le droit de poser, et il
  // retombe sur un réglage que la personne n'a pas choisi.
  {
    id: "cooking_style",
    consumer: "supabase/functions/_shared/keel/cooking_plan.ts#readCookingStyle",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "request",
    scope: "household",
  },
  {
    id: "grocery_runs",
    consumer: "supabase/functions/_shared/keel/cooking_plan.ts#readGroceryRuns",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "request",
    scope: "household",
  },
  {
    id: "budget_amount",
    consumer: "supabase/functions/generate-meal-v1/index.ts#budget_amount",
    weight: "wrong",
    branches: ALL_BRANCHES,
    step: "request",
    scope: "household",
  },

  // ── CE QUI SE DEMANDE APRÈS LE PLAN ───────────────────────────────────────
  {
    id: "food_preferences",
    // ⟳ LOT C (2026-09-03) — LE CONSOMMATEUR A CHANGÉ DE MAGASIN, ET LE CHAMP
    // A CHANGÉ D'ÉCRAN. Cette ligne pointait
    // `food_preference_promotion_io.ts#reconcileFoodPreferencesFor`: la
    // réconciliation de la colonne PLATE `food_preferences`, lue par les deux
    // générateurs à chaque composition. Ce module est SUPPRIMÉ — le magasin
    // plat n'a plus ni écrivain ni lecteur (nomenclature §2.1, §2.6), et sa
    // colonne devient une archive lisible sur « Ce que Sophia sait ».
    //
    // ⛔ LA LIGNE N'EST PAS SUPPRIMÉE POUR AUTANT, et le choix est délibéré: ce
    // que la personne n'aime pas EST toujours collecté (le champ « Aliments
    // refusés » d'une fiche de bouche) et TOUJOURS consommé — par la ceinture
    // d'exclusion, par bouche, sur le magasin structuré. Retirer la ligne
    // dirait « on ne demande plus ça », ce qui est faux; c'est le lit qui a
    // changé, pas la question.
    consumer:
      "supabase/functions/_shared/keel/food_exclusion_belt.ts#exclusionTermsFor",
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
  /**
   * LE CRAN D'ACTIVITÉ, ET IL EST HORS DU TOUT-OU-RIEN CI-DESSUS.
   *
   * ⚠️ `null` N'EST PAS UN TROU, C'EST UNE RÉPONSE POSSIBLE. `tokens.ts`
   * l'écrit: « personne n'est obligé de répondre; `null` veut dire on ne sait
   * pas et retombe sur exactement le comportement d'avant ce lot (facteur 1,5,
   * fourchette 28-33) ». Il n'existe donc PAS de cinquième jeton « inconnu » —
   * un jeton d'ignorance deviendrait une réponse, et une réponse se met à peser
   * dans un calcul d'énergie.
   *
   * Il est dans `FunnelState` malgré ça — donc le compilateur le réclame à
   * chaque fixture — parce que l'ÉCRAN doit savoir quoi montrer comme déjà
   * coché. Un formulaire qui affiche du vide non lu finit toujours par le faire
   * écrire.
   */
  activityLevel: ActivityLevel | null;
  /**
   * ② LES DEUX AXES (2026-08-20). `null` = pas répondu — le cran ci-dessus
   * reste alors le repli nommé, et il rend le nombre d'avant.
   */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
  /** ① ce qu'il y a d'autre dans l'assiette · ⑤ l'appétit (2026-08-20). */
  takesDessert: boolean | null;
  takesCheese: boolean | null;
  takesBread: boolean | null;
  appetite: AppetiteLevel | null;
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
  /**
   * Les moments où LE TITULAIRE mange, avec leur taille. Vide = rien déclaré.
   *
   * ⚠️ AVEC LA TAILLE DEPUIS LE 2026-08-14, et c'était `readonly string[]`. La
   * colonne (`practical_constraints.eating_rhythm`) porte `{slot, size}` depuis
   * le 2026-08-07 et `rhythmLines` la met dans la consigne: la projeter sur le
   * seul `slot` ici faisait que `savePlanAnswers` RÉÉCRIVAIT `size: null` à
   * chaque passage de l'entonnoir — une taille posée dans « À propos de toi »
   * était effacée par un écran qui ne la montrait même pas.
   */
  eatingRhythm: readonly EatingOccasionSlot[];
  /** `mon`…`sun`. Vide = rien de déclaré. */
  cookDays: readonly string[];
  cookingTimeMin: number | null;
  /**
   * ⟳ P2 (2026-09-03) — LES DEUX RÉPONSES QUI REMPLACENT LA DURÉE.
   *
   * `null` = la question n'a pas encore de réponse, et surtout PAS « le
   * moins possible » ni « une course »: la cicatrice `20260818110000:48-51`
   * (payée sur `kitchen_equipment`) dit qu'une clé absente et une réponse
   * basse se ressemblent en JSON et ne veulent pas dire la même chose.
   *
   * ⚠️ REQUIS ET NULLABLES, jamais `?`: un champ optionnel ici ne ferait
   * remonter aucun site de montage au compilateur.
   */
  cookingStyle: CookingStyle | null;
  groceryRuns: GroceryRuns | null;
  /**
   * L'ARGENT DE CE PLAN-LÀ, EN CHIFFRE — pas une bande.
   *
   * ── CE QUE C'ÉTAIT, ET POURQUOI ÇA NE POUVAIT PAS MARCHER ────────────────
   * Trois cases: « serré / normal / confortable ». Le mot part au modèle tel
   * quel, et il ne veut rien dire: « serré » à Paris pour une personne et
   * « serré » pour une famille de cinq ne désignent pas la même semaine, ni le
   * même arbitrage. Un chiffre, lui, se compare à ce qu'il y a dans le panier —
   * c'est ce qui permet de RENONCER À LA VIANDE plutôt que de « faire un peu
   * attention ».
   *
   * ── ET C'EST UNE QUESTION DE GÉNÉRATION, PAS UNE PRÉFÉRENCE ──────────────
   * Décision humaine du 2026-08-13: elle se pose à chaque composition, jamais
   * dans « À propos de toi ». La valeur est conservée pour PRÉ-REMPLIR la
   * suivante — un défaut proposé, pas un réglage caché: le champ est sur
   * l'écran qui compose, et il est toujours modifiable avant de lancer.
   *
   * L'unité est la monnaie du pays de l'élève (`profiles.country`, déjà dans le
   * prompt). Aucune table de devises n'est tenue ici: elle serait une liste
   * fermée de plus, et `countries.ts` explique pourquoi ce dépôt n'en garde pas.
   */
  budgetAmount: number | null;
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
 * DEUX BOUCHES NE PORTENT PAS LE MÊME PRÉNOM — et ce n'est pas de la coquetterie
 * de données.
 *
 * ── LE DÉFAUT MESURÉ SUR UN COMPTE RÉEL, LE 2026-08-13 ────────────────────
 * La même personne saisie TROIS FOIS, à une seconde d'intervalle pour les deux
 * premières, dont deux sans corps ni allergie. L'écran les empilait dans une
 * liste sans séparation visible, il n'offrait aucun moyen d'en retirer une, et
 * le plan aurait composé pour cinq bouches là où trois mangent.
 *
 * ── POURQUOI LE PRÉNOM, ET PAS UN AUTRE CRITÈRE ───────────────────────────
 * Parce que c'est ce que le PLAN affiche. `first_name` nomme la part —
 * « Christèle: 140 g » — et deux lignes identiques rendent le plan illisible
 * pour la seule personne qui doit le lire à table. Refuser sur le prénom n'est
 * donc pas une contrainte technique déguisée: c'est la contrainte du produit.
 *
 * La comparaison ignore la casse, les espaces de bord et les ACCENTS
 * (`Chirstèle` / `chirstele`): une saisie au clavier d'un téléphone n'est pas
 * une clé primaire, et deux orthographes du même prénom sont le cas COURANT du
 * doublon, pas le cas tordu.
 *
 * ⚠️ CE N'EST PAS UNE GARDE DE SÉCURITÉ. La base accepte deux homonymes, et
 * c'est bien: un foyer a le droit d'avoir deux Camille. L'entonnoir, lui,
 * demande de les distinguer AVANT d'écrire, parce que c'est le seul moment où
 * quelqu'un peut encore répondre à la question.
 */
export function normalizedMouthName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    // NFD + suppression des diacritiques: `é` devient `e`. Sans ça, `Chirstèle`
    // et `Chirstele` sont deux personnes pour l'écran et une seule à table.
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function nameAlreadyEating(
  name: string,
  taken: readonly { firstName: string }[],
): boolean {
  const wanted = normalizedMouthName(name);
  if (wanted === "") return false;
  return taken.some((m) => normalizedMouthName(m.firstName) === wanted);
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
/**
 * ══════════════════════════════════════════════════════════════════════════
 * COMBIEN DE BOUCHES LA PERSONNE A DÉCLARÉ NOURRIR — LE FAIT, PAS LA DEDUCTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE LECTEUR EXISTE PARCE QUE LA BRANCHE NE PEUT PLUS SE DEVINER. Jusqu'au
 * 2026-09-01 elle se lisait `Math.max(2, household.members.length)`: un foyer
 * en base répondait « au moins deux », et le solo se reconnaissait à son
 * ABSENCE de foyer. Ça tenait tant que le solo n'avait pas de ligne membre.
 *
 * Il en a une désormais, et il en a besoin: ses dégoûts
 * (`household_food_restrictions`) et ses habitudes
 * (`household_member_habits`) sont clés sur `member_id`. Sans ligne, la fiche
 * de préférences lui cachait deux sections — c'est-à-dire que le produit
 * n'était pas le même selon le chemin d'entrée.
 *
 * ⚠️ LE REPLI EST L'ANCIENNE RÈGLE, MOT POUR MOT, ET IL N'EST PAS FACULTATIF.
 * Aucune ligne d'avant ce lot ne porte la clé; les lire à leur nombre de
 * membres ferait basculer en « solo » toute famille dont les bouches n'ont pas
 * encore été saisies — c'est-à-dire au moment précis où elle en a le plus
 * besoin. Le repli ne disparaîtra que le jour où la population entière porte
 * la clé, et ce jour se mesure, il ne se décrète pas.
 */
export function declaredHouseholdSize(
  pc: Record<string, unknown> | null | undefined,
): number | null {
  const raw = (pc ?? {})["household_size"];
  const n = typeof raw === "number" ? raw : Number.NaN;
  // ⛔ ON N'ACCEPTE QUE CE QUI EST UTILISABLE. `0`, un négatif ou un flottant
  // ne sont pas des réponses: ils retombent sur le repli, qui est l'ancienne
  // règle. Un `Number("2")` complaisant ferait entrer une chaîne écrite à la
  // main par une session de debug dans la branche d'un vrai compte.
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * COMBIEN DE BOUCHES L'ENTONNOIR CROIT QUE CETTE PERSONNE NOURRIT.
 *
 * `null` = on ne sait pas encore, et l'étape 1 le demande.
 *
 * ── LES QUATRE CAS, ET LE TROISIÈME EST CELUI DU LOT ─────────────────────
 *   ① pas de foyer, pas de ligne d'objectif ⇒ `null` — rien n'a commencé.
 *   ② pas de foyer mais une ligne d'objectif ⇒ `1`. C'est TOUTE la population
 *     d'avant le 2026-09-01 qui a répondu « juste moi »: elle n'a pas de ligne
 *     membre, et elle garde sa branche.
 *   ③ un foyer, et un nombre DÉCLARÉ ⇒ ce nombre, `1` compris. C'est ce qui
 *     rend le solo exprimable maintenant qu'il a un foyer d'une bouche.
 *   ④ un foyer sans nombre déclaré ⇒ `max(2, membres)`, l'ancienne règle.
 *
 * ⛔ ④ N'EST PAS DE LA DETTE, C'EST LA GARDE DE COMPATIBILITÉ. Aucune ligne
 * d'avant ce lot ne porte `household_size`; les lire à leur nombre de membres
 * ferait basculer en « solo » toute famille dont les bouches ne sont pas
 * encore saisies — c'est-à-dire au moment précis où elle a besoin de l'écran
 * qui les demande. Le repli ne se retire que le jour où la population entière
 * porte la clé, et ce jour se MESURE.
 *
 * ⚠️ ET POUR UN SECONDAIRE, LA RÉPONSE EST 1, quel que soit le nombre de
 * bouches autour de la table. Ce n'est pas une erreur de comptage: la question
 * de l'étape 1 est « combien de personnes est-ce que TU nourris », et il n'en
 * nourrit aucune — il ne compose ni n'ajoute personne (`not_owner` aux quatre
 * gestes). Son entonnoir est celui d'une personne seule, et son plan est
 * personnel.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function funnelMouths(input: {
  hasHousehold: boolean;
  isOwner: boolean;
  /** Toutes les bouches du foyer, MOI COMPRIS. */
  memberCount: number;
  /** `practical_constraints.household_size`, ou `null`. */
  declared: number | null;
  /** Une ligne `student_goals` existe-t-elle ? */
  hasGoalRow: boolean;
}): number | null {
  if (input.hasHousehold && input.isOwner) {
    return input.declared ?? Math.max(2, input.memberCount);
  }
  return input.hasHousehold || input.hasGoalRow ? 1 : null;
}

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

/**
 * COMBIEN D'AUTRES PERSONNES CETTE BRANCHE PEUT CONTENIR.
 *
 * Le couple signifie deux personnes au total, pas « au moins deux ». Sans ce
 * plafond, son formulaire restait ouvert après le conjoint et permettait de
 * fabriquer une famille tout en gardant la branche couple.
 */
export function maximumOthers(branch: FunnelBranch): number {
  if (branch === "solo") return 0;
  if (branch === "pair") return 1;
  return HOUSEHOLD_MAX_MOUTHS - 1;
}

/**
 * COMBIEN DE BOUCHES IL MANQUE ENCORE — le nombre, pas le fait.
 *
 * ⚠️ CE N'EST PAS DU CONFORT D'ÉCRAN, C'EST LA MOITIÉ MANQUANTE DU REFUS.
 * Mesuré sur un compte neuf le 2026-08-14: quelqu'un répond « Trois ou plus »,
 * inscrit UNE personne, et lit « Ajoute les autres personnes qui mangent ici ».
 * Il en a ajouté une. La phrase lui dit donc qu'il n'a rien fait, et rien à
 * l'écran ne dit ni **combien** il en manque, ni que le nombre vient de SA
 * réponse à l'étape 1. Le mot de l'utilisateur, cité: « je ne peux pas passer
 * à l'étape 3 ».
 *
 * Un refus qui ne dit pas ce qui le lèverait n'est pas un refus, c'est un mur.
 */
export function mouthsStillNeeded(
  branch: FunnelBranch,
  othersCount: number,
): number {
  return Math.max(0, minimumOthers(branch) - othersCount);
}

// ───────────────────────────────────────────────────────────────────────────
// LES DÉCISIONS
// ───────────────────────────────────────────────────────────────────────────

export interface FunnelStep {
  id: FunnelStepId;
  questions: readonly FunnelQuestion[];
}

/**
 * ── ⛔ `"table"` A ÉTÉ RETIRÉ LE 2026-08-19 ────────────────────────────────
 *
 * L'étape ne posait plus que deux questions bloquantes — le régime et les
 * moments —, et les deux ont rejoint la FICHE de chaque bouche, où elles ont un
 * sens: le régime écarte des familles d'aliments avant qu'on parle de dégoûts,
 * et les moments dimensionnent « ce qu'elle mange déjà » qui les suit
 * immédiatement. Les demander deux écrans plus loin faisait poser six repas à
 * quelqu'un sans lui avoir demandé combien il en fait.
 *
 * Ce qu'elle portait d'autre a suivi le même raisonnement, pas une symétrie:
 *   · le DÉJEUNER AU BOULOT et l'ÉQUIPEMENT DE CUISINE sont passés sur l'étape
 *     `request`, avec les jours où l'on cuisine, le temps et le budget — c'est
 *     la même famille: avec quoi, quand, combien.
 *
 * ⚠️ LE FICHIER `FunnelStepId` GARDE `"table"`. Le retirer du TYPE forcerait à
 * toucher tout ce qui l'a jamais nommé, et l'étape peut revenir; ce qui compte
 * est qu'aucune question ne s'y rattache — `funnelSteps` écarte de toute façon
 * une étape sans question, donc l'entrée serait inerte même si elle restait.
 * La ceinture est `missesForStep`: un motif rattaché à une étape non rendue
 * bloquerait l'entonnoir sans rien pour le lever, et `stepOfMiss` ne peut plus
 * en produire.
 */
const STEP_ORDER: readonly FunnelStepId[] = ["situate", "people", "request"];

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

/**
 * CE QUI MANQUE ENCORE **À CETTE ÉTAPE-CI**.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION EXISTE POUR FERMER ────────────────────────
 * Mesuré au navigateur le 2026-08-13, sur un compte neuf en branche « à
 * deux »: l'étape 2 se quittait par son bouton principal SANS que la question
 * des bouches ait été posée, et l'étape 3 refusait ensuite de composer avec
 * « ajoute les autres personnes qui mangent ici » — un motif dont le seul
 * champ est resté en arrière. On ne peut pas répondre à une question depuis
 * l'écran suivant.
 *
 * `nextIncomplete` dit où REPRENDRE une session; celle-ci dit si l'étape
 * courante a le droit de se laisser quitter. Les deux lisent le même verdict,
 * donc aucune des deux ne peut dériver de l'autre.
 */
export function missesForStep(
  state: FunnelState,
  branch: FunnelBranch,
  step: FunnelStepId,
): FunnelMissId[] {
  return canGenerateMisses(state, branch).filter((m) => stepOfMiss(m) === step);
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
      { skipFirstName: true, requireAllergies: false },
    ),
  );
  if (asks("own_height_cm") && !isUsableHeight(state.self.heightCm)) {
    missing.push("own_height_cm");
  }
  if (asks("own_weight_kg") && !isUsableWeight(state.self.weightKg)) {
    missing.push("own_weight_kg");
  }
  if (asks("own_gender") && state.self.gender === null) missing.push("own_gender");
  // ⛔ LE RÉGIME NE BLOQUE PLUS — même décision, même date, même raison. Il
  // est la PREMIÈRE section de la fiche (il écarte des familles entières
  // d'aliments), donc il est demandé tôt et bien; il n'a pas à retenir
  // quelqu'un qui n'a pas encore ouvert la fenêtre.
  // ── ⚠️ `own_activity_level` / `member_activity_level` NE SONT PAS ICI, ET
  //    C'EST UN ARBITRAGE ÉCRIT, PAS UN OUBLI ──────────────────────────────
  //
  // Les deux sont `wrong` dans le catalogue, donc POSÉES dans l'entonnoir
  // (`funnelSteps` les rend, à l'étape 2, à côté de taille/poids/sexe). Elles
  // ne REFUSENT rien pour autant, et c'est la seule paire du catalogue dont
  // les deux sens divergent.
  //
  // Ce qui l'impose est le vocabulaire lui-même. `tokens.ts` écrit, à propos
  // de cette liste: « personne n'est obligé de répondre; `null` veut dire on ne
  // sait pas », et refuse pour cette raison un cinquième jeton d'ignorance. La
  // colonne est nullable, sans défaut, exprès. Bloquer la composition
  // reviendrait à supprimer `null` du domaine des réponses possibles pour tout
  // compte neuf — c'est-à-dire à forcer un choix parmi quatre, dont on saurait
  // qu'une part est un pur devinement, et à faire entrer ce devinement dans un
  // calcul d'énergie avec l'autorité d'une réponse. C'est exactement ce que le
  // refus du cinquième jeton existe pour empêcher.
  //
  // La contrepartie est assumée: quelqu'un peut traverser l'entonnoir sans
  // répondre, et il obtient l'hypothèse 1,5 — soit très précisément ce que
  // TOUTE la base avait avant le 2026-08-18. On ne dégrade personne; on ouvre
  // une porte qui était fermée.
  //
  // ⚠️ CONSÉQUENCE À CONNAÎTRE AVANT DE « RÉPARER » CE TROU: leurs phrases dans
  // `SETUP_MISS_KEYS` sont donc INATTEIGNABLES, comme celle de
  // `member_eating_rhythm`. Le `Record` complet par type est ce qui garantit
  // qu'aucune question n'entre au catalogue sans ses mots; l'inatteignabilité
  // est le prix, et elle est écrite des deux côtés.

  // ── ÉTAPE 2b, LES AUTRES ───────────────────────────────────────────────
  if (branch !== "solo") {
    if (state.others.length < minimumOthers(branch)) missing.push("missing_mouths");
    // Le plafond suit aussi LA BRANCHE: un couple a exactement une autre
    // personne. La limite absolue de huit reste celle de la famille.
    if (state.others.length > maximumOthers(branch)) missing.push("too_many_mouths");
    for (const person of state.others) {
      missing.push(
        ...personMisses(
          person,
          "member_birth_date",
          "member_goal",
          "member_first_name",
          "member_allergies",
          { skipFirstName: false, requireAllergies: false },
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
  // ⛔ LES MOMENTS NE BLOQUENT PLUS (2026-08-19), même décision que les
  // allergies et le régime. Ils sont demandés dans la fiche, juste au-dessus de
  // « ce qu'elle mange déjà » qu'ils dimensionnent — et rien coché veut dire
  // « aux moments de la maison », qui est une réponse par défaut sûre. Retenir
  // quelqu'un dessus faisait un mur sur une question qui a un repli.
  // ⛔ `cook_days` NE RETIENT PLUS RIEN, ET IL LE FAUT: le champ a été retiré
  // des deux écrans le 2026-09-01. Laisser la porte armée aurait bloqué
  // l'entonnoir POUR TOUJOURS — une exigence sur une réponse que plus aucun
  // écran ne permet de donner. C'est le mode d'échec le plus cher de cette
  // liste, et il est muet: `nextIncomplete` renverrait indéfiniment à l'étape
  // « demande » devant un formulaire complet.
  // ⟳ P2 (2026-09-03) — CE QUI RETIENT L'ÉTAPE N'EST PLUS UN NOMBRE DE MINUTES.
  //
  // ⛔ ET LES DEUX SONT EXIGÉES, PAS UNE. Un style sans cadence de courses ne
  // dit pas combien de fois on cuisine, une cadence sans style ne dit pas
  // combien de temps: `resolveCookingCapacity` refuse de dériver sur une moitié
  // de réponse, et laisser passer l'une des deux ferait un entonnoir complet
  // devant un moteur qui retombe silencieusement sur l'ancien réglage.
  if (state.plan.cookingStyle === null) missing.push("cooking_style");
  if (state.plan.groceryRuns === null) missing.push("grocery_runs");
  // ⚠️ LE CHIFFRE, PAS LA PRÉSENCE DE LA CLÉ. `0` est un budget que personne
  // n'a, et un `NaN` venu d'un champ à moitié tapé passerait un `!== null`.
  if (!isUsableBudget(state.plan.budgetAmount)) missing.push("budget_amount");

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
  opts: { skipFirstName: boolean; requireAllergies: boolean },
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
  // ── ⛔ LES ALLERGIES NE BLOQUENT PLUS (2026-08-19) ───────────────────────
  //
  // ⚠️ CE N'EST PAS UN OUBLI, ET IL FAUT LIRE CE QUE ÇA COÛTE AVANT DE LE
  // « RÉPARER ». Cette ligne exigeait l'ACCUSÉ d'allergie — « aucune » compte
  // comme une réponse — parce que ce dépôt traite l'allergie comme MÉDICALE et
  // fail-closed: sans la question posée, un plan entier se compose sans jamais
  // avoir demandé. C'est la raison d'être de `allergy_check`.
  //
  // Décision humaine du 2026-08-19, demandée trois fois: le seul refus de
  // l'étape 2 est l'IDENTITÉ, LE CORPS ET LA DIRECTION d'une personne. Ses
  // mots: « le seul truc qui bloque continuer c'est nom, date de naissance,
  // taille, poids, objectif ».
  //
  // La question reste POSÉE (elle est en tête de la fiche de préférences); elle
  // ne RETIENT plus. La contrepartie est nommée: un foyer peut composer son
  // premier plan sans qu'on ait jamais su si quelqu'un est allergique.
  if (opts.requireAllergies && !person.allergiesReviewed) {
    missing.push(allergiesId);
  }
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
 * ⚠️ LES BORNES VIENNENT DE `planBudget.ts`, ET LEUR AUTORITÉ EST LE SERVEUR.
 *
 * Elles ne sont pas redéclarées ici — deux arithmétiques de la même borne
 * divergent au premier ajustement, et celle qui garde refuserait alors une
 * valeur que celle qui pré-remplit propose. Voir `planBudget.ts` pour ce que le
 * plafond attrape (le zéro de trop) et pourquoi il ne juge personne.
 */
function isUsableBudget(amount: number | null): boolean {
  return amount !== null && isUsableBudgetAmount(amount);
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
      activityLevel: null,
      dayActivity: null,
      sportFrequency: null,
      takesDessert: null,
      takesCheese: null,
      takesBread: null,
      appetite: null,
    },
    others: [],
    plan: {
      eatingRhythm: [],
      cookDays: [],
      cookingTimeMin: null,
      // ⟳ P2 — `null` = pas encore répondu. C'est l'état d'un compte tout
      // neuf, et l'entonnoir le retient (`missingForPlan`).
      cookingStyle: null,
      groceryRuns: null,
      budgetAmount: null,
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
    activityLevel: null,
    dayActivity: null,
    sportFrequency: null,
    takesDessert: null,
    takesCheese: null,
    takesBread: null,
    appetite: null,
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
  /**
   * LES MOMENTS OÙ CETTE BOUCHE MANGE — `null` = personne ne l'a dit, donc elle
   * mange aux moments de la maison.
   *
   * Déjà tranché par le roster entre son « about you » (si elle a un compte) et
   * sa ligne (sinon), exactement comme `goal`. L'écran ne refait pas la
   * résolution: deux avis sur qui mange quand, et le foyer sert un
   * petit-déjeuner à quelqu'un qui n'en prend pas.
   *
   * ⚠️ AVEC LA TAILLE DEPUIS LE 2026-08-14 — voir `HouseholdMemberView`.
   */
  eatingSlots: EatingOccasionSlot[] | null;
  /**
   * CE QUE LE MAÎTRE A DÉJÀ MARQUÉ COMME ABSENT POUR ELLE — `away_days`.
   *
   * ⚠️ C'EST `awayHousehold` ET JAMAIS L'UNION AVEC `awaySelf`. La grille
   * RÉÉCRIT ce qu'on lui donne: nourrie de l'union, elle recopierait la
   * déclaration de la personne dans la colonne du maître, où elle survivrait à
   * sa rétractation. Voir la note de `HouseholdMemberView.awayHousehold`.
   *
   * ⚠️ ET IL FAUT LE PASSER À LA GRILLE. `MealPickerGrid` s'en sert pour
   * REPRENDRE les jours hors fenêtre (`kept = away.filter(hors fenêtre)`):
   * nourrie de `[]`, elle n'a rien à reprendre et son enregistrement efface
   * toute absence posée en dehors des sept jours affichés.
   */
  away: AwayMark[];
  /**
   * SON RÉGIME — `null` = personne n'a demandé, et c'est distinct d'« elle
   * mange de tout » (`omnivore`), qui est une RÉPONSE.
   *
   * Déjà tranché par le roster entre son « about you » (si elle a un compte) et
   * sa ligne (sinon), exactement comme `goal` et `eatingSlots`. L'écran ne
   * refait pas la résolution.
   */
  diet: DietAnswer | null;
}

export interface FunnelFacts {
  /** `null` quand l'étape 1 n'a pas de réponse dérivable. */
  branch: FunnelBranch | null;
  state: FunnelState;
  mouths: FunnelMouth[];
  householdId: string | null;
  ownMemberId: string | null;
  /**
   * D4 ② — MA COLONNE DU FOYER, celle où l'étape 3 a écrit mon pré-remplissage.
   *
   * ⚠️ ELLE N'EST PAS DANS `mouths`, ET C'EST TOUT LE PROBLÈME QU'ELLE FERME.
   * `mouths` me RETIRE (je vis dans `state.self`), donc l'étape 4 ne me donnait
   * aucune grille — alors que la question du déjeuner m'est bien posée à
   * l'étape 3 et que ma réponse coche cinq de mes midis « dehors ». « Pré-remplir
   * n'est pas décider »: sans cette lecture, la réponse hebdomadaire ne pouvait
   * pas être contredite par celui-là même qui l'a donnée.
   *
   * `awayHousehold` SEUL, jamais l'union — même règle que `FunnelMouth.away`: la
   * grille RÉÉCRIT ce qu'on lui donne, et nourrie de l'union elle recopierait ma
   * déclaration dans la colonne du foyer, où elle survivrait à ma rétractation.
   */
  ownAway: AwayMark[];
  /**
   * LES MOMENTS OÙ JE MANGE — `null` = aux moments de la maison.
   *
   * Même champ et même repli que `FunnelMouth.eatingSlots`, et pour la même
   * raison: une grille montée sur le rythme de la MAISON afficherait sept
   * petits-déjeuners au nom de quelqu'un qui vient de dire qu'il n'en prend pas.
   */
  ownEatingSlots: EatingOccasionSlot[] | null;
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
 * Projette le choix de l'étape 1 pendant la courte fenêtre où le foyer existe
 * déjà mais où l'objectif — et donc la ligne `student_goals` — n'existe pas
 * encore. Aucune autre réponse n'est inventée ou remplacée.
 */
export function withPendingHouseholdSize(
  facts: FunnelFacts,
  mouths: number,
): FunnelFacts {
  return {
    ...facts,
    branch: branchForMouths(mouths),
    state: { ...facts.state, mouths },
  };
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
      .select("full_name, birth_date, height_cm, gender, activity_level, day_activity, sport_frequency")
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
      // TRANCHÉ EN BASE, recopié tel quel. `null` traverse: il veut dire
      // « personne ne l'a dit », et c'est l'écran qui le rend comme « aux
      // moments de la maison » — jamais en pré-cochant ces moments-là sur la
      // ligne de quelqu'un.
      eatingSlots: m.eatingSlots,
      // La colonne du MAÎTRE seule — voir la note du champ.
      away: m.awayHousehold,
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
      // ── LE RÉGIME A UNE MAISON DEPUIS LE 2026-08-14 ──────────────────────
      // Il n'en avait pas: les trois jetons vivaient sur
      // `student_safety_constraints`, clée sur `user_id`, donc une bouche sans
      // compte n'avait nulle part où le porter — un enfant végétarien était
      // INDÉCLARABLE, et c'est ce que l'utilisateur a vu et redemandé deux
      // fois. La colonne est `household_members.diet`.
      //
      // TRANCHÉ EN BASE, recopié tel quel. `null` traverse: il veut dire « on
      // n'a jamais posé la question », et l'écran ne doit surtout pas le rendre
      // comme « elle mange de tout » — ce serait écrire sur la ligne de
      // quelqu'un un fait que personne n'a énoncé.
      diet: (DIET_ANSWERS as readonly string[]).includes(m.diet ?? "")
        ? (m.diet as DietAnswer)
        : null,
      heightCm: bodies.get(m.memberId)?.heightCm ?? null,
      weightKg: bodies.get(m.memberId)?.weightKg ?? null,
      gender: bodies.get(m.memberId)?.gender ?? null,
      // ⚠️ MÊME TABLE QUE LE RESTE DU CORPS, et pour la même raison: c'est la
      // SEULE que `keel_household_bodies_for` regarde, donc la seule dont le
      // moteur tienne compte. Une bouche sans compte n'a pas de `profiles` où
      // le chercher.
      activityLevel: bodies.get(m.memberId)?.activityLevel ?? null,
      // ② LUS SUR LA MÊME LIGNE QUE LE CRAN, par la même RPC. Les lire ailleurs
      // ferait deux lectures d'un même corps, et c'est celle qu'on regarde le
      // moins qui rendrait une valeur périmée.
      dayActivity: bodies.get(m.memberId)?.dayActivity ?? null,
      sportFrequency: bodies.get(m.memberId)?.sportFrequency ?? null,
      takesDessert: bodies.get(m.memberId)?.takesDessert ?? null,
      takesCheese: bodies.get(m.memberId)?.takesCheese ?? null,
      takesBread: bodies.get(m.memberId)?.takesBread ?? null,
      appetite: bodies.get(m.memberId)?.appetite ?? null,
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
  // ⛔ LA RÈGLE EST DANS `funnelMouths`, ET PAS ICI. Elle décide la BRANCHE de
  // tout l'entonnoir; l'écrire en ligne dans une fonction qui fait six appels
  // réseau la rendait invérifiable — deux mutations l'ont prouvé le
  // 2026-09-01, aucune n'a fait rougir un seul test.
  const derived = funnelMouths({
    hasHousehold: household !== null,
    isOwner,
    memberCount: household?.members.length ?? 0,
    declared: declaredHouseholdSize(pc),
    hasGoalRow: Boolean(goalRow),
  });

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
      // ── MON CRAN VIENT DE `profiles`, ET C'EST LA BONNE SOURCE ──────────
      // Il est écrit AUX DEUX ENDROITS par `saveSelf` (mon profil pour la lane
      // individuelle, ma ligne de corps pour celle du foyer), parce que les
      // deux moteurs lisent deux tables différentes. La RELECTURE, elle, n'a
      // qu'une source: `profiles` est la seule qui existe hors foyer, donc la
      // seule qui réponde sur les trois branches. Lire la ligne de corps ici
      // rendrait `null` à tout compte solo — c'est-à-dire à la majorité.
      activityLevel: (ACTIVITY_LEVELS as readonly string[]).includes(
          String(profile.activity_level ?? "").trim(),
        )
        ? (String(profile.activity_level).trim() as ActivityLevel)
        : null,
      // ── ② LES DEUX AXES, MÊME SOURCE ET MÊME RAISON QUE LE CRAN ─────────
      // Ils vivent sur `profiles` (20260820200000) parce que la lane
      // individuelle ne lit QUE `profiles`. Lire la ligne de corps ici rendrait
      // `null` à tout compte solo, c'est-à-dire à la majorité.
      // Lecture fail-soft: hors vocabulaire ⇒ `null`, jamais un repli.
      dayActivity: (DAY_ACTIVITY_LEVELS as readonly string[]).includes(
          String(profile.day_activity ?? "").trim(),
        )
        ? (String(profile.day_activity).trim() as DayActivityLevel)
        : null,
      sportFrequency: (SPORT_FREQUENCIES as readonly string[]).includes(
          String(profile.sport_frequency ?? "").trim(),
        )
        ? (String(profile.sport_frequency).trim() as SportFrequency)
        : null,
      // ── ① ET ⑤ VIENNENT DE MA LIGNE DE CORPS, PAS DE `profiles` ─────────
      // ⛔ ET C'EST L'INVERSE DES DEUX AXES JUSTE AU-DESSUS. Les axes sont
      // écrits AUX DEUX ENDROITS (profil pour la lane solo, ligne de corps pour
      // le foyer) parce que deux moteurs les lisent. Ces quatre-là n'ont qu'UN
      // lecteur — `generate-household-meal-v1` — et il ne lit que la ligne de
      // corps. Les poser aussi sur `profiles` ferait une colonne que personne
      // n'interroge, c'est-à-dire un champ décoratif.
      takesDessert: ownMemberId ? bodies.get(ownMemberId)?.takesDessert ?? null : null,
      takesCheese: ownMemberId ? bodies.get(ownMemberId)?.takesCheese ?? null : null,
      takesBread: ownMemberId ? bodies.get(ownMemberId)?.takesBread ?? null : null,
      appetite: ownMemberId ? bodies.get(ownMemberId)?.appetite ?? null : null,
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
    // D4 ② — MA LIGNE, LUE COMME CELLE DES AUTRES. Même champ (`awayHousehold`),
    // même repli (`null` = les moments de la maison), même porte d'écriture
    // (`keel_household_set_member_away`): rien de neuf n'est inventé pour moi,
    // ma ligne était simplement la seule que personne ne rendait.
    ownAway: household?.me?.awayHousehold ?? [],
    ownEatingSlots: household?.me?.eatingSlots ?? null,
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
  const budget = Number(pc?.budget_amount);
  const time = Number(pc?.cooking_time_min);
  return {
    // ⟳ P2 — LES PARSEURS DU MOTEUR, réexportés, jamais une seconde
    // lecture: deux idées du vocabulaire des styles produiraient un écran
    // qui montre autre chose que ce avec quoi on compose.
    cookingStyle: readCookingStyle(pc),
    groceryRuns: readGroceryRuns(pc),
    // `parseEatingRhythm` et pas une seconde lecture: deux lectures de la même
    // colonne qui divergent produisent un écran qui montre autre chose que ce
    // avec quoi on compose.
    // ⚠️ SANS `.map((s) => s.slot)`: la taille traverse. Elle vit dans la même
    // colonne depuis le 2026-08-07, et la jeter ici la faisait réécrire `null`
    // au premier `savePlanAnswers`.
    eatingRhythm: parseEatingRhythm(pc?.eating_rhythm),
    cookDays: Array.isArray(pc?.cook_days)
      ? (pc!.cook_days as unknown[])
        .map(String)
        .filter((d) => (DAY_TOKENS as readonly string[]).includes(d))
      : [],
    cookingTimeMin: Number.isFinite(time) && time > 0 ? time : null,
    // RELU POUR PRÉ-REMPLIR, pas pour appliquer en silence: l'écran qui
    // compose repose la question avec cette valeur dedans.
    budgetAmount: isUsableBudget(budget) ? budget : null,
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
  /**
   * ⚠️ REQUIS, JAMAIS OPTIONNEL — la même règle que `maintenanceRange` s'est
   * écrite pour lui-même: « un champ facultatif aurait laissé les appelants
   * continuer de servir la fourchette de l'ignorance à quelqu'un qui a
   * répondu, sans qu'aucun compilateur ne les recense ».
   *
   * `null` = personne n'a coché, et la colonne le porte tel quel: pas de
   * défaut en base, pas de défaut ici.
   */
  activityLevel: ActivityLevel | null;
  /**
   * ② LES DEUX AXES (2026-08-20). `null` = pas répondu — le cran ci-dessus
   * reste alors le repli nommé, et il rend le nombre d'avant.
   */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    height_cm: args.heightCm,
    gender: args.gender,
  };
  // ⚠️ ON N'ÉCRIT PAS `null` PAR-DESSUS UNE RÉPONSE. La colonne n'a pas de
  // défaut et `null` y veut dire « jamais répondu »; le patch est construit à
  // partir d'un BROUILLON D'ÉCRAN, et un brouillon peut être vide parce que la
  // lecture qui l'a semé a échoué, pas parce que la personne a effacé sa
  // réponse. Sur `full_name` juste en dessous, la même précaution existe et
  // pour la même raison. Aucun écran ne propose de dé-répondre — il n'y a pas
  // de cinquième tuile —, donc l'absence dans le patch n'enlève rien à
  // personne.
  if (args.activityLevel !== null) patch.activity_level = args.activityLevel;
  // ── ② LES DEUX AXES, ÉCRITS PAR LE MÊME GESTE (2026-08-20) ───────────────
  // ⛔ ET ILS S'ÉCRIVENT MÊME À `null`, contrairement au cran juste au-dessus.
  // Le cran n'a aucune façon d'être dé-répondu (aucun écran ne le propose),
  // donc son `null` veut dire « ne touche pas ». Les axes, eux, sont posés par
  // des tuiles qu'on peut corriger, et `activity_axes_asked_at` sépare « pas
  // posé » de « pas répondu » — sans écrire les nulls, ce marqueur mentirait
  // dès la première correction.
  patch.day_activity = args.dayActivity;
  patch.sport_frequency = args.sportFrequency;
  patch.activity_axes_asked_at = new Date().toISOString();
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
 * `bad_weight`, `bad_gender`, `bad_activity_level`.
 *
 * ⚠️ LE CRAN D'ACTIVITÉ VOYAGE AVEC, ET IL N'EST PAS DANS LE TOUT-OU-RIEN. La
 * RPC refuse `body_incomplete` sur les trois du corps et jamais sur celui-ci:
 * une bouche sans cran compose sur l'hypothèse documentée, une bouche sans
 * taille est SAUTÉE. `null` côté base veut dire « ne touche pas », donc un
 * appelant qui ne sait pas n'efface pas ce qu'un autre a écrit.
 */
export async function saveMouthBody(args: {
  memberId: string;
  heightCm: number;
  weightKg: number;
  gender: MemberGender;
  activityLevel: ActivityLevel | null;
  /**
   * ② LES DEUX AXES (2026-08-20). `null` = pas répondu — le cran ci-dessus
   * reste alors le repli nommé, et il rend le nombre d'avant.
   */
  dayActivity: DayActivityLevel | null;
  sportFrequency: SportFrequency | null;
  /** ① ce qu'il y a d'autre dans l'assiette · ⑤ l'appétit (2026-08-20). */
  takesDessert: boolean | null;
  takesCheese: boolean | null;
  takesBread: boolean | null;
  appetite: AppetiteLevel | null;
}): Promise<void> {
  const result = await setMemberBody(
    args.memberId,
    args.heightCm,
    args.weightKg,
    args.gender,
    args.activityLevel,
    // ── ⛔ L'ENTONNOIR NE POSE PAS LES DEUX AXES NI LES TROIS CASES ───────
    //
    // Le lot du 2026-08-20 les pose dans la FICHE (`MouthFormDialog`), pas
    // ici: `FUNNEL_QUESTIONS` porte `own_activity_level` /
    // `member_activity_level`, c'est-à-dire le cran MÉLANGÉ, et rien d'autre.
    //
    // ⚠️ LES DEUX DRAPEAUX SONT DONC `false`, ET C'EST LA VÉRITÉ, PAS UN
    // OUBLI. `false` veut dire « cet écran n'a rien demandé », et la base ne
    // touche alors à AUCUNE des sept colonnes — ni pour écrire, ni pour
    // effacer. Les passer à `true` ferait horodater une question jamais posée:
    // toute la base basculerait de `not_asked` à `not_answered`, et le
    // compteur dirait « ils ont refusé de répondre » de gens à qui on n'a
    // jamais rien demandé.
    {
      // ── ⛔ LES TROIS DRAPEAUX SONT À `true` DEPUIS LE 2026-08-20 (soir) ────
      //
      // Ils valaient `false`, et c'était juste tant que l'entonnoir ne posait
      // AUCUNE de ces questions: `false` veut dire « cet écran n'a rien
      // demandé », donc la base ne touche à rien.
      //
      // L'entonnoir les pose maintenant toutes: les deux axes à l'étape 2, à la
      // place du cran mélangé, et les trois cases + l'appétit dans la fenêtre
      // des préférences. Laisser `false` aurait rendu ces champs DÉCORATIFS —
      // saisis à l'écran, jetés avant la base, sans un refus. C'est le mode
      // d'échec n°1 de ce dépôt, et c'est très exactement ce que ce lot répare.
      //
      // ⚠️ `true` NE VEUT PAS DIRE « ELLE A RÉPONDU », mais « on lui a
      // demandé ». C'est ce qui autorise l'écriture d'un `null` — donc une
      // correction — et ce qui sépare `not_answered` de `not_asked` dans les
      // compteurs de `generated_from`.
      dayActivity: args.dayActivity,
      sportFrequency: args.sportFrequency,
      axesAsked: true,
      takesDessert: args.takesDessert,
      takesCheese: args.takesCheese,
      takesBread: args.takesBread,
      structureAsked: true,
      appetite: args.appetite,
      appetiteAsked: true,
    },
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
  // ⚠️ LES TROIS CHECK ONT CHANGÉ LE 2026-08-18, ET CES TROIS LIGNES SONT
  // LEUR MIROIR. Avant, `target_waist_cm` n'était légal que sur
  // `recomposition` et `focus_axis` que sur `health`/`performance`. Ces trois
  // jetons ont disparu; la migration `20260818100000` a donc réécrit les deux
  // CHECK sur `maintenance`, faute de quoi les colonnes devenaient
  // INÉCRIVABLES pour tout le monde.
  //
  // Laisser les anciennes comparaisons ici n'aurait pas planté: elles seraient
  // devenues FAUSSES pour tout le monde, et les deux colonnes auraient été
  // remises à `null` à chaque enregistrement d'objectif — une perte silencieuse
  // sur des lignes que la base accepte toujours. Du code mort qui ressemble à
  // une garde, et le compilateur ne l'a nommé qu'une fois `MemberGoal` réduit
  // à trois.
  const keepsWeight = goal === "fat_loss" || goal === "muscle_gain" ||
    goal === "maintenance";
  const keepsWaist = goal === "maintenance";
  const keepsFocus = goal === "maintenance";
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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE RYTHME A SON PROPRE ÉCRIVAIN — ET IL EST LE SEUL.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ EN BASE LE 2026-08-19 ──────────────────────────────
 * L'utilisateur a retiré le goûter de l'après-midi, vérifié que le retrait
 * tenait, vérifié que la grille de l'étape 3 ne le montrait plus, puis composé
 * un plan — et le plan portait des créneaux d'après-midi. Relu en base juste
 * après: `eating_rhythm` valait de nouveau `[breakfast, lunch, snack_pm,
 * dinner]`. Ses mots: « il y a un bug à ce niveau-là pour sûr ».
 *
 * ── LA CAUSE ────────────────────────────────────────────────────────────
 * `savePlanAnswers` écrivait `eating_rhythm` À PARTIR DE `answers`, et son
 * appelant du bouton « composer » lui passe l'état REACT de l'étape 3
 * (`plan`). Or l'étape 3 NE POSE PLUS la question depuis le 2026-08-19 — elle
 * a déménagé dans la fiche de chaque personne, et `TableStep` a été retiré
 * précisément pour qu'il n'y ait pas « deux formulaires sur les mêmes
 * colonnes ». Le FORMULAIRE est parti; l'ÉCRIVAIN est resté.
 *
 * Composer réécrivait donc le rythme depuis une valeur que plus aucun écran ne
 * montrait et que plus aucun geste ne mettait à jour. Cette écriture-là ne
 * pouvait pas être plus juste que la base: au mieux elle la recopiait, au pire
 * — et c'est le cas mesuré — elle y remettait un moment retiré entre-temps.
 *
 * ⛔ NE PAS RÉINTRODUIRE `eating_rhythm` DANS `savePlanAnswers`. C'est la
 * cicatrice `stale-current-erases-the-previous-write` prise par l'autre bout:
 * là-bas c'était `current` qui était périmé, ici c'est `answers`. Un champ
 * n'appartient qu'au geste qui le montre.
 */
export async function saveEatingRhythm(args: {
  userId: string;
  current: Record<string, unknown> | null;
  rhythm: readonly EatingOccasionSlot[];
}): Promise<void> {
  await mergePracticalConstraints({
    userId: args.userId,
    current: args.current,
    patch: {
      // La forme que `parseEatingRhythm` attend, TAILLE COMPRISE. Elle reste
      // facultative — `null` veut dire « il n'a pas dit », et une taille exigée
      // serait une taille inventée, que le moteur traiterait comme une
      // contrainte.
      //
      // ⚠️ ET C'ÉTAIT ÉCRIT `size: null` EN DUR, POUR TOUT LE MONDE. La colonne
      // porte la taille depuis le 2026-08-07 et `EatingRhythmCard` (« À propos
      // de toi ») l'écrit; ce `null` l'effaçait à chaque passage de l'entonnoir,
      // sans qu'aucun écran ne le montre.
      //
      // L'ORDRE DE LA JOURNÉE, pas celui des clics — même règle que `cook_days`,
      // et que le parseur du moteur qui relit derrière.
      eating_rhythm: EATING_OCCASIONS
        .map((slot) => args.rhythm.find((o) => o.slot === slot))
        .filter((o): o is EatingOccasionSlot => o !== undefined)
        .map(({ slot, size }) => ({ slot, size })),
    },
    source: "onboarding/eating-rhythm",
  });
}

/**
 * Les réponses de l'étape 3, en une écriture fusionnée.
 *
 * ⛔ SANS LE RYTHME — voir `saveEatingRhythm` juste au-dessus. L'étape 3 ne pose
 * plus cette question; écrire un champ qu'on ne montre pas ne peut que restaurer
 * une valeur périmée.
 */
export async function savePlanAnswers(args: {
  userId: string;
  current: Record<string, unknown> | null;
  answers: FunnelPlanAnswers;
}): Promise<void> {
  await mergePracticalConstraints({
    userId: args.userId,
    current: args.current,
    patch: {
      // ⛔ ÉCRIT VIDE — voir le pavé de `api/planBudget.ts#savePlanInputs`.
      // Cesser de l'écrire aurait laissé une contrainte qui décide encore des
      // plans et que plus aucun écran ne peut lever.
      cook_days: [],
      cooking_time_min: args.answers.cookingTimeMin,
      // ⟳ P2 (2026-09-03) — LES DEUX RÉPONSES DURABLES.
      //
      // ⛔ `null` S'ÉCRIT, ET C'EST VOULU: il dit « pas encore répondu », et
      // le moteur retombe alors sur `cooking_time_min` tel quel. Omettre la
      // clé ferait la même chose côté lecteur, mais laisserait un compte qui
      // a EFFACÉ sa réponse avec l'ancienne — c'est-à-dire un réglage qu'on
      // ne peut plus retirer.
      cooking_style: args.answers.cookingStyle,
      grocery_runs: args.answers.groceryRuns,
      budget_amount: args.answers.budgetAmount,
    },
    source: "onboarding/plan",
  });
}

/**
 * CE QUI RETIENT L'ÉTAPE 2, **PERSONNE PAR PERSONNE**.
 *
 * ── LE DÉFAUT QUE ÇA FERME ────────────────────────────────────────────────
 * La liste « Avant de continuer » était PLATE: « Si tu as des allergies… »,
 * « Les moments où tu manges, sur ta carte ». Avec quatre personnes à table,
 * elle ne disait pas laquelle — donc on relisait quatre cartes pour trouver le
 * champ vide. Demandé le 2026-08-19: « ça doit signaler précisément chez qui
 * manque quoi ».
 *
 * ⚠️ ET LE SUJET EST NOMMÉ, PAS DÉDUIT. Le maître reçoit `null` (l'écran dira
 * « toi »), une bouche reçoit son prénom. Rendre l'index de la personne aurait
 * marché aussi — et se serait décalé au premier retrait.
 */
export interface StepBlocker {
  /** `null` = le titulaire. Sinon le prénom, ou `""` s'il n'est pas encore posé. */
  who: string | null;
  missing: FunnelMissId[];
}

export function peopleStepBlockers(
  state: FunnelState,
  branch: FunnelBranch,
): StepBlocker[] {
  const out: StepBlocker[] = [];
  const asks = (id: FunnelQuestionId) =>
    FUNNEL_QUESTIONS.some(
      (q) => q.id === id && q.weight === "wrong" && q.branches.includes(branch),
    );

  // ── MOI ─────────────────────────────────────────────────────────────────
  const mine: FunnelMissId[] = [];
  if (asks("own_first_name") && state.self.firstName.trim() === "") {
    mine.push("own_first_name");
  }
  if (state.self.birthDate === null || state.self.birthDate.trim() === "") {
    mine.push("own_birth_date");
  }
  if (asks("own_height_cm") && !isUsableHeight(state.self.heightCm)) {
    mine.push("own_height_cm");
  }
  if (asks("own_weight_kg") && !isUsableWeight(state.self.weightKg)) {
    mine.push("own_weight_kg");
  }
  if (asks("own_gender") && state.self.gender === null) mine.push("own_gender");
  if (!isKnownGoal(state.self.goal)) mine.push("own_goal");
  if (mine.length > 0) out.push({ who: null, missing: mine });

  // ── LES AUTRES ──────────────────────────────────────────────────────────
  if (branch !== "solo") {
    for (const person of state.others) {
      const hers: FunnelMissId[] = [];
      if (person.firstName.trim() === "") hers.push("member_first_name");
      if (person.birthDate === null || person.birthDate.trim() === "") {
        // ⚠️ LE MOTIF NOMMÉ GAGNE, comme dans `personMisses`: un adulte qui
        // porte une direction sans date reçoit `adult_without_birth_date`, qui
        // dit POURQUOI la date manque plutôt que de constater qu'elle manque.
        hers.push(
          person.kind === "adult" && isKnownGoal(person.goal)
            ? "adult_without_birth_date"
            : "member_birth_date",
        );
      }
      if (!isUsableMouthHeight(person.heightCm)) hers.push("member_height_cm");
      if (!isUsableMouthWeight(person.weightKg)) hers.push("member_weight_kg");
      if (person.gender === null) hers.push("member_gender");
      if (person.kind === "adult" && !isKnownGoal(person.goal)) {
        hers.push("member_goal");
      }
      if (hers.length > 0) out.push({ who: person.firstName, missing: hers });
    }
  }
  return out;
}
