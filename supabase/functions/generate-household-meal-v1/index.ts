/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import {
  doctrineBeliefsFor,
  doctrineBlockFor,
  loadPublishedDoctrine,
} from "../_shared/keel/doctrine_loader.ts";
import { coachNotePromptBlock, loadCoachNote } from "../_shared/keel/coach_note.ts";
import { loadPublishedProtocol, protocolBlockFor } from "../_shared/keel/protocol_loader.ts";
import {
  loadStudentSafetyConstraints,
  type StudentSafetyConstraint,
} from "../_shared/keel/safety_constraints.ts";
import { reconcileFoodPreferencesFor } from "../_shared/keel/food_preference_promotion_io.ts";
// ── D4/L6 · LES MOTS DE CHAQUE TITULAIRE ────────────────────────────────────
// `foodPreferencesForPrompt` N'EST PLUS IMPORTÉ ICI, et c'est le lot: sur la
// lane du foyer, les préférences de TOUT LE MONDE — le maître compris — passent
// désormais par `loadHouseholdVoices` puis `buildHouseholdVoices`, où vivent le
// plafond par membre et la garde de non-divulgation. Un second chemin, même
// pour une seule personne, serait un chemin SANS garde, et rien n'échouerait.
// La lane INDIVIDUELLE, elle, continue de l'appeler: elle n'a qu'un titulaire,
// et son plan n'est lu par personne d'autre.
import {
  loadHouseholdVoices,
  type VoiceMember,
} from "../_shared/keel/household_voices_io.ts";
import { dayTokenInZone, localDateInZone } from "../_shared/keel/local_date.ts";
import {
  countHungerDays,
  type HungerWindowSignal,
  hungerSignalProvenance,
  satietyUserSuffix,
} from "../_shared/keel/hunger_signal.ts";
import { loadHungerDays } from "../_shared/keel/hunger_signal_io.ts";
import {
  type MealWindowRequest,
  resolveRequestedWindow,
  windowDayOrder,
} from "../_shared/keel/meal_plan_window.ts";
import {
  buildMealPrompt,
  DEFAULT_EATING_RHYTHM,
  MEAL_PROMPT_VERSION,
  type MealScope,
  mealDishesPayload,
  mealPreparationsPayload,
  mealSessionsPayload,
  mealShoppingPayload,
  type MergedEater,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "../_shared/keel/meal_generation.ts";
import {
  type MemberAway,
  parseMemberAway,
  resolveWindowPresence,
} from "../_shared/keel/household_presence.ts";
import {
  type MemberOwnPlan,
  parseOwnPlans,
  plansOverlap,
  resolveHandOff,
} from "../_shared/keel/household_hand.ts";
import {
  bestMergePair,
  buildUnmergeBlock,
  MERGE_SHAPE_NOT_HONOURED,
  MERGE_WINDOW_ALL_PAST,
  MERGE_WINDOW_UNREADABLE,
  type MergeMaterialDish,
  type MergedFromEntry,
  type MergeWindow,
  mergedFromEntry,
  mergeLadder,
  mergeMaterialShown,
  observeMergeShape,
  type PlanSpan,
} from "../_shared/keel/household_merge.ts";
import {
  carryMergedFrom,
  heldMemberIds,
  mergeCarriers,
  mergeStandings,
} from "../_shared/keel/household_merge_notice.ts";
import {
  type LiveHouseholdPlan,
  loadLiveHouseholdPlans,
  storedCookingDays,
  storedDishes,
} from "../_shared/keel/household_merge_notice_io.ts";
// L7/D11 — LE PLAFOND. Ce module ne compte RIEN: `N`, le `+ 3` et le lundi ISO
// vivent en base (migration 20260812170000), et il n'en relit que le verdict.
import {
  MERGE_QUOTA_EXHAUSTED,
  type MergeQuotaState,
  mergeQuotaRefusalDetail,
  parseMergeQuota,
} from "../_shared/keel/household_merge_quota.ts";
import { proteinAnchorRetryInstruction } from "../_shared/keel/protein_anchor.ts";
import type { CompositionIndex } from "../_shared/keel/food_composition.ts";
import { loadCompositionIndex } from "../_shared/keel/food_composition_io.ts";
import {
  MEMBER_AGE_STATES,
  type MemberAgeState,
} from "../_shared/keel/household.ts";
import { applyHouseRuleLock } from "../_shared/keel/household_restriction_lock.ts";
import {
  type HouseholdAllergyRow,
  householdHardConstraints,
  loadHouseholdAllergies,
} from "../_shared/keel/household_safety.ts";
import {
  buildHouseholdPromptBlocks,
  extractMemberPortions,
  HOUSEHOLD_PROMPT_VERSION,
  type HouseholdRestriction,
} from "../_shared/keel/household_meal_generation.ts";
import {
  memberPortionsPayload,
  type MemberGoal,
  MEMBER_GOALS,
  type PortionMember,
  reconcilePortions,
  servingDemandsFor,
} from "../_shared/keel/household_portions.ts";
import { loadHouseholdMemberBodies } from "../_shared/keel/household_bodies.ts";
import {
  memberDeltasPayload,
  resolveHousehold,
  toHouseholdMember,
} from "../_shared/keel/household_composition.ts";
import { envelopeFor } from "../_shared/keel/meal_envelope.ts";
import { GOAL_TOKENS, type GoalToken } from "../_shared/keel/tokens.ts";
import { weekStartOf } from "../_shared/keel/weekly_flow_io.ts";

/**
 * `generate-household-meal-v1` — UNE cuisson, des portions qui divergent.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §3 (l'unité est la session de
 * cuisine). Le CONSEIL DE FAMILLE de §8 est mort le 2026-08-08: les envies
 * sont UNE ligne écrite par le compte maître pour tout le monde
 * (CHANTIER-FOYER-PROFILS.md, lot 5), et plus une récolte par membre.
 *
 * ── POURQUOI UNE FONCTION DE PLUS PLUTÔT QU'UN DRAPEAU SUR L'EXISTANTE ───
 * `generate-meal-v1` marche, il est couvert, et il sert le chemin MAJORITAIRE:
 * l'entrée du produit est à 1 (§5), donc la plupart des compositions n'ont pas
 * de foyer. Lui ajouter une branche « si foyer » ferait porter à chaque
 * composition individuelle le risque d'une régression de foyer — et ce dépôt a
 * déjà écrit la règle en toutes lettres pour `generate-plan-v2`: on ne mute pas
 * un générateur qui marche, on duplique et on le dit.
 *
 * Ce qui est PARTAGÉ (le moteur, le verrou, le parseur, l'écriture
 * transactionnelle) l'est par IMPORT, jamais par copie. Ce qui est propre au
 * foyer vit dans `_shared/keel/household_*.ts`.
 *
 * ── CE QU'ELLE ÉCRIT, ET CE QU'ELLE N'ÉCRIT PAS ─────────────────────────
 * Elle écrit UNE ligne `student_generated_meals`, par la même RPC que le
 * chemin individuel — donc avec le même verrou consultatif, le même
 * remplacement nommé et la même troncature. Elle n'envoie AUCUN message, ne
 * pose aucun rappel, ne notifie personne: la livraison proactive au foyer est
 * un autre chantier, et un générateur qui notifie est un générateur qu'on ne
 * peut plus appeler pour essayer.
 *
 * ── POUR QUI ELLE COMPOSE, DEPUIS L3 (D2/D7, 2026-08-12) ────────────────
 * CE PLAN EST LE PLAN DU MAÎTRE. Lui, toutes les bouches sans compte, et tout
 * compte secondaire qui n'a PAS pris la main. Un secondaire qui a généré et
 * VALIDÉ son propre plan couvrant cette fenêtre en est retiré: il mange le
 * sien. C'est `resolveHandOff` (`_shared/keel/household_hand.ts`) qui le dit,
 * et lui seul.
 *
 * Sans geste du maître, les deux plans COEXISTENT: le foyer cuisine sans lui,
 * il cuisine pour lui, et personne ne fusionne. C'est le REPLI du modèle
 * (D8: « dans tous les cas le user garde son plan »), et il tient seul.
 *
 * ── DEUX OPÉRATIONS, UNE SEULE PORTE (L4, D6/D10, 2026-08-12) ───────────
 * `operation: "compose"` (le DÉFAUT, et le comportement de toujours) écrit le
 * plan du foyer. `operation: "merge"` REPREND à cette table quelqu'un qui
 * mangeait son propre plan, et écrit un NOUVEAU plan du foyer.
 *
 * ELLES PARTAGENT CE FICHIER PARCE QU'ELLES PARTAGENT LEURS PRÉCONDITIONS: le
 * gel 402 (L1), la résolution du foyer et le droit du maître, l'union des
 * allergies, le plafond de bouches, les deux axes de version de prompt. Une
 * seconde fonction edge aurait dupliqué cinq gardes — et ce dépôt a déjà payé
 * plusieurs fois « deux définitions qui divergent au premier ajustement ».
 *
 * CE QUE LA FUSION N'ÉCRASE JAMAIS: le plan PERSONNEL du secondaire. Elle écrit
 * une ligne neuve sur le compte du MAÎTRE (`plan_kind = 'household'`); la RPC
 * d'écriture ne touche que les lignes de `p_user_id` ET de la même nature, donc
 * la ligne du secondaire est hors de portée par construction. C'est ce qui rend
 * la défusion de D8 possible: il y a toujours un plan à retrouver.
 *
 * ── LE MINEUR N'EST PAS UNE CIBLE (§8.4), ET « JE NE SAIS PAS » NON PLUS ─
 * L'objectif d'une bouche SANS COMPTE vit sur sa ligne de foyer depuis le
 * 2026-08-10 — sans quoi une personne sans compte n'en aurait aucun, et la
 * bifurcation des portions serait muette pour exactement les gens que le
 * produit veut servir.
 *
 * ⚠️ CORRIGÉ LE 2026-08-11 (D1): dès que la bouche A UN COMPTE, son objectif
 * vient de SON « about you » (`student_goals`), pas de sa ligne. Deux sources
 * qui divergent sans arbitre écrit, c'est le doublon qui produit un bug six
 * mois plus tard. La résolution est faite UNE SEULE FOIS, dans
 * `keel_household_roster_for`, donc ce fichier n'a pas à la connaître — mais
 * ce commentaire, lui, affirmait le contraire de ce que le code fait.
 *
 * La ceinture a donc changé de nature. Elle n'est plus « on ne LIT PAS la table
 * pour un mineur » (un filtre de requête); elle est `goalApplies` dans
 * `household.ts`, et elle refuse DEUX cas au lieu d'un: le mineur, et la bouche
 * dont l'âge est INCONNU. Le second est le cas neuf et le plus mordant — depuis
 * que le compte maître saisit des bouches à la main, une ligne peut n'avoir
 * aucune date, et l'ancienne garde SQL (`coalesce(is_minor, false)`) l'aurait
 * traitée comme un adulte.
 *
 * `student_goals` reste lu, pour le COMPTE MAÎTRE seul: sa `situation`, ses
 * contraintes pratiques et sa langue gouvernent la composition entière. Ce
 * n'est plus une source de portion.
 */

const FN_NAME = "generate-household-meal-v1";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Même lecture défensive que le chemin individuel. */
function readWindowRequest(raw: unknown): MealWindowRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;
  const kind = String(w.kind ?? "").trim();
  if (kind === "until_sunday") return { kind: "until_sunday" };
  if (kind === "days") {
    const count = Number(w.count);
    return Number.isFinite(count) ? { kind: "days", count } : null;
  }
  if (kind === "exact") {
    const startsOn = String(w.starts_on ?? "").trim();
    const durationDays = Number(w.duration_days);
    if (!startsOn || !Number.isFinite(durationDays)) return null;
    return { kind: "exact", startsOn, durationDays };
  }
  return null;
}

function readCookingCapacity(pc: Record<string, unknown> | null) {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const pick = (value: unknown, allowed: readonly string[]): string | null => {
    const raw = String(value ?? "").trim();
    return allowed.includes(raw) ? raw : null;
  };
  const time = Number(pc?.cooking_time_min);
  return {
    cookDays: Array.isArray(pc?.cook_days)
      ? (pc!.cook_days as unknown[]).map(String).filter((d) => DAYS.includes(d))
      : [],
    cookingTimeMin: Number.isFinite(time) && time > 0 ? Math.min(240, Math.round(time)) : null,
    recipeDifficulty: pick(pc?.recipe_difficulty, ["simple", "normal", "keen"]),
    variety: pick(pc?.variety, ["repeat", "some", "varied"]),
    budgetBand: pick(pc?.budget_band, ["tight", "normal", "comfortable"]),
  };
}

interface LoadedMember extends PortionMember {
  /**
   * `null` pour une bouche sans compte. Sert UNIQUEMENT à savoir où chercher
   * ses contraintes de sécurité et son corps, qui restent clés sur
   * `auth.users`. Ce n'est PAS son identité: `memberId` l'est.
   */
  userId: string | null;
  /** Pour l'union des contraintes de sécurité du foyer. */
  isOwner: boolean;
  /**
   * D14 — QUAND CETTE BOUCHE N'EST PAS LÀ, les deux sources résolues.
   *
   * `effective` est ce qui compte; `self` et `household` ne servent qu'à la
   * trace du plan — sans elles, « pourquoi manque-t-il une assiette ? » n'a
   * pas de réponse trois jours plus tard.
   */
  away: MemberAway;
  /**
   * D2/D7 — LES PLANS QUI POURRAIENT RETIRER CETTE BOUCHE DE LA TABLE.
   *
   * « Pourraient »: la base a filtré (personnel · vivant · validé · ce foyer),
   * la fenêtre n'est pas encore comparée. `resolveHandOff` s'en charge, et lui
   * seul.
   */
  ownPlans: MemberOwnPlan[];
}

/** Une ligne de `keel_household_roster_for`, telle que la base la rend. */
interface RosterRow {
  member_id: string;
  user_id: string | null;
  first_name: string;
  age_state: string;
  role: string;
  goal: string | null;
  // D14 — L'UNION DES DEUX SOURCES, DÉJÀ FAITE EN BASE. Chaque entrée porte
  // sa `source` (`self` | `household`); `parseMemberAway` la relit sans
  // jamais refaire la fusion (voir `household_presence.ts`).
  away_days: unknown;
  // D2/D7 — LES PLANS PERSONNELS VIVANTS ET VALIDÉS de cette bouche, DANS
  // CE FOYER. Déjà filtrés par la base sur tout ce qu'elle peut voir seule;
  // ce qui reste à décider est le RECOUVREMENT de la fenêtre, et il est
  // décidé dans `household_hand.ts`, jamais ici.
  own_plans: unknown;
}

// ===========================================================================
// L4 · D6 · D15 · D16 — LA FUSION, RÉSOLUE AVANT TOUTE DÉPENSE
//
// Tout ce bloc s'exécute AVANT le premier appel modèle, et c'est sa raison
// d'être autant que sa position: chacun de ses refus se tranche sur deux
// fenêtres, un roster et une date. L1 a mesuré 28,6 s et 225 s de génération
// brûlées sur des refus de cette nature; le test de POSITION est dans
// `_shared/keel/household_merge_test.ts` (« AUCUN REFUS DE FUSION NE SE PAIE AU
// PRIX D'UNE GÉNÉRATION »), et il garde la position PAR LA SOURCE parce qu'en
// HTTP un refus tardif est indiscernable d'un refus précoce.
//
// ⚠️ JUSQU'AU 2026-08-12, CE COMMENTAIRE NOMMAIT UN FICHIER DE TEST QUI N'A
// JAMAIS EXISTÉ. Un commentaire qui ment sur l'existence de sa propre garde est
// pire qu'une absence de commentaire: il fait croire la garde posée à qui vient
// vérifier, et c'est le seul lecteur qui compte. Le nom fautif n'est pas répété
// ici — un test (« AUCUN COMMENTAIRE DU GÉNÉRATEUR NE NOMME UN TEST QUI
// N'EXISTE PAS ») refuse désormais TOUT nom de fichier de test introuvable dans
// ce fichier, y compris cité en exemple.
// ===========================================================================

/**
 * Un plan déjà écrit, relu pour la fusion. Jamais le `why` d'un plat.
 *
 * ⚠️ LA LECTURE VIT DÉSORMAIS DANS `household_merge_notice_io.ts` (L5), et pas
 * ici. Le lecteur de propositions a besoin EXACTEMENT du même plan du foyer,
 * avec le même prédicat: deux `select` écrits séparément auraient divergé, et
 * ce dépôt a mesuré deux fois le 2026-08-12 ce que coûte un lecteur du plan du
 * foyer qui ne filtre pas comme les autres.
 */
type StoredPlan = LiveHouseholdPlan;

interface ResolvedMerge {
  member: RosterRow;
  /** Le plan personnel repris. UN seul par appel — voir plus bas. */
  personalPlan: StoredPlan;
  /** Le plan du foyer dans lequel on le reprend. */
  householdPlan: StoredPlan;
  window: MergeWindow;
  /**
   * O1 — LES AUTRES PLANS PERSONNELS QUI MORDENT SUR LA FENÊTRE FUSIONNÉE.
   *
   * Une fusion reprend UN plan. Deux plans personnels adjacents qui couvrent
   * ensemble la fenêtre demanderaient deux gestes du maître, et c'est l'option
   * la plus réversible: fusionner les deux d'un coup déciderait à la place de
   * D10 (« la fusion est manuelle, sur proposition »), et rien ne dit que la
   * proposition doit les grouper. Ce qui n'est PAS acceptable, c'est le
   * silence: les autres plans sont tracés en `issues`, donc visibles.
   */
  otherOverlappingPlanIds: string[];
}

interface MergeRefusal {
  refusal: string;
  detail: string;
}

async function resolveMergeRequest(args: {
  admin: SupabaseClient;
  roster: readonly RosterRow[];
  memberId: string;
  todayDate: string;
  /**
   * Les plans du foyer vivants, déjà lus une fois pour tout ce fichier.
   *
   * ⚠️ PASSÉS PLUTÔT QUE RELUS (L5). Cette fonction faisait son propre `select`;
   * le lecteur de propositions en aurait fait un second, avec son propre
   * prédicat, et ce dépôt a mesuré deux fois le 2026-08-12 ce que coûte un
   * lecteur du plan du foyer qui ne filtre pas comme les autres. Le propriétaire
   * et le foyer ne sont donc plus des arguments d'ici: ils appartiennent à la
   * lecture, qui vit dans `household_merge_notice_io.ts`.
   */
  householdPlans: readonly StoredPlan[];
}): Promise<ResolvedMerge | MergeRefusal> {
  const member = args.roster.find((r) => r.member_id === args.memberId);
  if (!member) {
    return {
      refusal: "merge_member_not_in_household",
      detail: "That person is not in this household.",
    };
  }
  // D2 — LE MAÎTRE N'EST JAMAIS EXCLU, donc il n'y a jamais rien à reprendre
  // pour lui. Son plan du foyer EST son plan. Sans ce refus, une fusion sur
  // lui-même irait jusqu'à `merge_member_has_no_plan`, qui serait un
  // diagnostic faux.
  if (member.role === "owner") {
    return {
      refusal: "merge_member_is_owner",
      detail: "The household plan is already yours: there is nothing to bring back.",
    };
  }

  const ownPlans = parseOwnPlans(member.own_plans);
  if (ownPlans.length === 0) {
    return {
      refusal: "merge_member_has_no_plan",
      detail: "That person has no validated plan of their own, so they are " +
        "already being cooked for.",
    };
  }

  // LE PLAN DU FOYER, VIVANT. Lu UNE fois par requête, par le lecteur partagé
  // (`household_merge_notice_io.ts`), et passé ici: `plan_kind = 'household'`
  // y est obligatoire et ce n'est pas une précaution — un plan PERSONNEL porte
  // aussi `household_id`, et deux lecteurs indépendants sont déjà tombés dedans
  // le 2026-08-12.
  const householdPlans = args.householdPlans;
  if (householdPlans.length === 0) {
    return {
      refusal: "merge_no_household_plan",
      detail: "There is no live household plan to merge into. Compose one first.",
    };
  }

  // ── LA MEILLEURE PAIRE (plan du foyer, plan personnel) ──────────────────
  // Au plus deux plans du foyer sont vivants à la fois (la contrainte
  // d'exclusion le garantit: le courant et le suivant), et un membre peut
  // porter plusieurs plans personnels adjacents. On garde la paire dont la
  // fenêtre FUSIONNABLE — intersection coupée au pivot — est la plus longue:
  // c'est la seule mesure qui parle de jours réellement repris.
  //
  // ⚠️ LE CHOIX EST FAIT PAR `bestMergePair`, ET PAS ICI (L5). La PROPOSITION
  // de D10 doit annoncer exactement ce que cette fusion-ci fera; une seconde
  // arithmétique dans le lecteur aurait promis des jours que la fusion ne prend
  // pas, et les deux nombres auraient été plausibles.
  const best = bestMergePair({
    householdPlans,
    personalPlans: ownPlans,
    today: args.todayDate,
  });
  if (!best.ok) {
    return {
      refusal: best.refusal,
      detail: best.refusal === MERGE_WINDOW_ALL_PAST
        ? "Everything those two plans share is already behind us. A merge only " +
          "touches days nobody has eaten yet."
        : best.refusal === MERGE_WINDOW_UNREADABLE
        ? "One of those two plans does not carry a readable window."
        : "That person's plan and the household plan do not share a single day.",
    };
  }

  // LE PLAN PERSONNEL, EN ENTIER. Le roster n'en rend que la FENÊTRE (id,
  // dates, validation): il n'a jamais eu à porter des plats, et l'élargir pour
  // ce lot ferait grossir la lecture que le chat fait à chaque tour.
  const personalRes = await args.admin
    .from("student_generated_meals")
    .select("id, starts_on, duration_days, validated_at, cooking_sessions, dishes")
    .eq("id", best.personal.id)
    .maybeSingle();
  if (personalRes.error) throw personalRes.error;
  const personalRow = (personalRes.data ?? null) as Record<string, unknown> | null;
  if (!personalRow) {
    // La ligne était là quand le roster l'a vue, et elle ne l'est plus. On
    // refuse plutôt que de fusionner un plan qu'on n'a pas relu.
    return {
      refusal: "merge_plan_vanished",
      detail: "That plan is no longer readable. Try again.",
    };
  }

  const mergedSpan: PlanSpan = best.window.window;
  return {
    member,
    householdPlan: best.household,
    personalPlan: {
      id: String(personalRow.id),
      startsOn: String(personalRow.starts_on ?? best.personal.startsOn),
      durationDays: Number(personalRow.duration_days ?? best.personal.durationDays),
      validatedAt: personalRow.validated_at == null
        ? null
        : String(personalRow.validated_at),
      cookingDays: storedCookingDays(personalRow.cooking_sessions),
      dishes: storedDishes(personalRow.dishes),
      generatedFrom: null,
    },
    window: best.window,
    otherOverlappingPlanIds: ownPlans
      .filter((p) => p.id !== best.personal.id && plansOverlap(p, mergedSpan))
      .map((p) => p.id),
  };
}

// ===========================================================================
// L5 · D8 — LA DÉFUSION, RÉSOLUE AVANT TOUTE DÉPENSE ELLE AUSSI
//
// « Refaire le plan du foyer SANS user X » est la première des trois sorties de
// D8, et c'est celle qui préserve les courses déjà faites. Elle recompose la
// QUEUE du plan du foyer vivant — ce qu'il lui reste à partir d'aujourd'hui
// (D16) — sans la personne, et avec la consigne écrite mot pour mot dans le
// registre (`buildUnmergeBlock`).
//
// ⚠️ ON NE DÉFUSIONNE QUE CE QUI A ÉTÉ FUSIONNÉ. Le refus
// `unmerge_member_not_merged` n'est pas une formalité: sans lui, cette
// opération deviendrait « retire n'importe qui de la table », c'est-à-dire une
// exclusion permanente que rien dans ce chantier n'autorise — D8 parle d'une
// personne QUE LE MAÎTRE A REPRISE et qui vient de valider autre chose.
//
// ⚠️ ELLE N'ÉCRIT RIEN SUR LE COMPTE DU SECONDAIRE, exactement comme la fusion:
// « dans tous les cas, X garde son plan » est l'invariant du modèle, et il est
// STRUCTUREL — `write_student_meal_plan` ne touche que les lignes de
// `p_user_id` (le maître) et de la même nature.
// ===========================================================================

interface ResolvedUnmerge {
  member: RosterRow;
  /** Le plan du foyer qu'on recompose. C'est LUI, « le plan de base » (D8). */
  basePlan: StoredPlan;
  /** Ce qu'il reste de ce plan à partir d'aujourd'hui. */
  window: MergeWindow;
}

function resolveUnmergeRequest(args: {
  roster: readonly RosterRow[];
  memberId: string;
  todayDate: string;
  householdPlans: readonly StoredPlan[];
}): ResolvedUnmerge | MergeRefusal {
  const member = args.roster.find((r) => r.member_id === args.memberId);
  if (!member) {
    return {
      refusal: "unmerge_member_not_in_household",
      detail: "That person is not in this household.",
    };
  }
  if (member.role === "owner") {
    return {
      refusal: "unmerge_member_is_owner",
      detail: "The household plan is theirs: there is nobody to take out of it.",
    };
  }

  // LE PLAN DE BASE EST LE PLAN VIVANT QUI PORTE LA REPRISE. Pas le plan
  // d'avant la fusion: les courses se font sur le plan que l'écran montre, et
  // c'est celui-là. Voir le long commentaire de `buildUnmergeBlock`.
  //
  // ⚠️ ET « LE PLAN VIVANT » N'EST PAS « LE PREMIER DE LA LISTE ». Jusqu'au
  // 2026-08-12 cette ligne était un `.find(...)` sur une liste triée par
  // `starts_on` CROISSANT: elle prenait donc le plan du foyer le PLUS ANCIEN,
  // alors que deux sont vivants en même temps par contrat (le courant et le
  // suivant, ce que `prepare_next` produit). Mesuré en HTTP: un plan 08-05/4 j
  // périmé portant la reprise à côté du plan courant 08-12/5 j qui la portait
  // aussi, et `operation: "unmerge"` rendait 409 `unmerge_window_all_past`
  // pendant que le lecteur offrait le bouton — le maître n'avait alors AUCUN
  // moyen de défaire la reprise sur le plan qu'il est en train de manger.
  //
  // `mergeCarriers` est la même fonction que celle du lecteur de propositions,
  // exactement comme `bestMergePair` l'est pour la fusion: la proposition et le
  // geste choisissent la même ligne, ou ils divergent.
  const carrier = mergeCarriers({
    householdPlans: args.householdPlans,
    today: args.todayDate,
  }).get(args.memberId) ?? null;
  if (!carrier) {
    return {
      refusal: "unmerge_member_not_merged",
      detail: "No live household plan has brought that person back to this " +
        "table, so there is nothing to undo.",
    };
  }
  if (carrier.tail === null) {
    return {
      refusal: carrier.tailRefusal === MERGE_WINDOW_UNREADABLE
        ? "unmerge_window_unreadable"
        : "unmerge_window_all_past",
      detail: "That household plan has no day left ahead of it. There is " +
        "nothing left to cook differently.",
    };
  }

  return { member, basePlan: carrier.plan, window: carrier.tail };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    // --- identité: le JWT, jamais un user_id du client --------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const issues: string[] = [];

    // ── LE FOYER, ET LE DROIT DE COMPOSER POUR LUI ──────────────────────
    // SEUL LE COMPTE MAÎTRE compose. Ce n'est pas une hiérarchie de confort:
    // la composition RETIRE le plan courant de la personne pour qui elle est
    // écrite (voir la RPC), donc laisser n'importe quel membre la déclencher
    // laisserait un colocataire effacer la semaine d'un autre.
    const meRes = await admin
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (meRes.error) throw meRes.error;
    const me = meRes.data as { household_id?: string; role?: string } | null;
    if (!me?.household_id) {
      return jsonResponse(req, { error: "no_household", request_id: requestId }, { status: 409 });
    }
    if (me.role !== "owner") {
      return jsonResponse(req, { error: "not_owner", request_id: requestId }, { status: 403 });
    }
    const householdId = me.household_id;

    // ── LE GEL À L'IMPAYÉ (chantier 3, D4) ──────────────────────────────
    //
    // ON GÈLE LA PRODUCTION, PAS LA CONSULTATION. Cette porte-ci est la
    // production: elle écrit un plan et RETIRE le plan courant. Le plan déjà
    // écrit, l'écran du foyer et le chat restent ouverts — geler, ce n'est pas
    // effacer, et un foyer qui revient dans trois mois doit retrouver
    // exactement ce qu'il a laissé.
    //
    // ⚠️ AUCUNE RÈGLE N'EST ÉCRITE ICI. `keel_household_is_covered` est LA
    // définition unique du dépôt (migration 20260811050000): abonnement du
    // maître vivant, ou essai qui couvre encore. La réécrire en TypeScript —
    // « si free_until < aujourd'hui » — ferait deux définitions qui
    // divergeraient au premier ajustement, et personne ne saurait laquelle
    // ment. C'est le piège n°1 de ce lot, nommé dans le chantier.
    //
    // LE REFUS EST NOMMÉ, ET C'EST LA MOITIÉ DU TRAVAIL. Un 500 ou un silence
    // se lit comme une panne et fait ouvrir un ticket au lieu d'un paiement.
    // 402 plutôt qu'un 409 de plus: le statut dit déjà de quoi il s'agit, et
    // l'écran lit `error` pour choisir sa phrase.
    //
    // FAIL-OPEN, ET C'EST L'ARBITRAGE INVERSE DE CELUI DES ALLERGIES.
    // Une lecture de sécurité en panne doit REFUSER de cuisiner (plus bas, en
    // toutes lettres). Une lecture de FACTURATION en panne doit laisser
    // passer: se tromper de sens ici coupe un client qui paie, ce qu'aucun
    // nouvel essai ne répare — c'est le même arbitrage que
    // `stripe-create-checkout-session`, qui démarre à zéro profil plutôt que
    // de sur-facturer sur une lecture ratée. L'échec est journalisé BRUYAMMENT
    // pour qu'une garde muette ne passe pas pour une garde qui ne mord jamais.
    const coverRes = await admin.rpc("keel_household_is_covered", {
      p_household: householdId,
    });
    if (coverRes.error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error: coverRes.error,
        metadata: { source: "household_coverage", household: householdId },
      });
      issues.push("household_coverage_unreadable");
    } else if (coverRes.data === false) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.frozen",
        user_id: userId,
        household_id: householdId,
      }));
      // `skipErrorLog`: UN IMPAYÉ N'EST PAS UN INCIDENT. Voir le jumeau dans
      // `generate-meal-v1`. La trace utile est juste au-dessus
      // (`keel.household_meal.frozen`); ce qui partait en plus dans
      // `system_error_logs`, au niveau `error`, était du bruit qu'un foyer
      // gelé produit à chaque appui.
      return jsonResponse(req, {
        error: "household_frozen",
        detail: "This household is paused. Nothing has been deleted - the " +
          "current plan stays readable, and composing resumes as soon as the " +
          "subscription does.",
        request_id: requestId,
      }, { status: 402, skipErrorLog: true });
    }

    // ── CE QUI EST DÉCIDABLE ICI NE SE PAIE PAS AU PRIX D'UN APPEL MODÈLE ──
    // Ces deux valeurs ne dépendent QUE du corps de la requête. Elles étaient
    // lues et validées juste avant l'écriture, c'est-à-dire APRÈS la
    // génération: mesuré le 2026-08-11, 28,6 s de modèle brûlées pour finir sur
    // `replaces_required`. Le refus remonte donc ici, avant toute dépense.
    //
    // `replace_current` reste le défaut — le changer modifierait le
    // comportement d'un appelant qui omet `intent` mais fournit `replaces` —
    // mais il échoue désormais immédiatement, et en le nommant.
    //
    // ── L4/D6 — DEUX OPÉRATIONS, UNE SEULE PORTE ────────────────────────
    //
    // `compose` est ce que cette fonction fait depuis toujours, et c'est le
    // DÉFAUT: un appelant qui n'envoie pas `operation` reçoit exactement le
    // comportement d'avant ce lot, y compris le front, qui n'en envoie pas.
    //
    // `merge` reprend à la table quelqu'un qui mangeait son propre plan (D6,
    // D10). Elle vit ICI plutôt que dans une fonction à elle parce qu'elle
    // exige EXACTEMENT les mêmes préconditions: le gel 402 (L1), la résolution
    // du foyer, l'union des allergies, le plafond de bouches, la version de
    // prompt. Une seconde fonction dupliquerait cinq gardes, et ce dépôt a
    // déjà payé plusieurs fois « deux définitions qui divergent au premier
    // ajustement ». Les cinq gardes sont donc franchies une seule fois, plus
    // haut, par le même chemin, pour les deux opérations.
    //
    // ⚠️ LA FUSION NE PREND NI `window` NI `intent` DU CLIENT, ET C'EST LE
    // POINT. Sa fenêtre est l'INTERSECTION des deux plans coupée au premier
    // jour non consommé (D15/D16): elle se DÉDUIT, elle ne se demande pas. Un
    // client qui pourrait la choisir pourrait refusionner hier.
    const operation = String(body.operation ?? "compose").trim();
    if (
      operation !== "compose" && operation !== "merge" && operation !== "unmerge"
    ) {
      return jsonResponse(req, {
        error: "unknown_operation",
        detail: "operation must be compose, merge or unmerge",
        request_id: requestId,
      }, { status: 400 });
    }
    const mergeMemberId = String(body.merge_member_id ?? "").trim() || null;
    if (operation === "merge" && !mergeMemberId) {
      return jsonResponse(req, {
        error: "merge_member_required",
        detail: "operation=merge must name the person it brings back " +
          "(`merge_member_id`).",
        request_id: requestId,
      }, { status: 400 });
    }
    // ── L5/D8 — LA DÉFUSION ────────────────────────────────────────────────
    // Son paramètre porte un autre nom que celui de la fusion, exprès: les deux
    // opérations désignent une personne, et un `member_id` unique aurait rendu
    // « je fusionne Zoé » et « je sors Zoé » indiscernables dans un journal, un
    // rejeu ou un rapport de bug. Le nom dit le geste.
    const unmergeMemberId = String(body.unmerge_member_id ?? "").trim() || null;
    if (operation === "unmerge" && !unmergeMemberId) {
      return jsonResponse(req, {
        error: "unmerge_member_required",
        detail: "operation=unmerge must name the person it takes back out " +
          "(`unmerge_member_id`).",
        request_id: requestId,
      }, { status: 400 });
    }
    // `intent` et `replaces` restent des ENTRÉES pour la composition, et
    // deviennent des SORTIES pour la fusion (voir plus bas): d'où le `let`.
    let intent = String(body.intent ?? "replace_current").trim();
    let replaces = String(body.replaces ?? "").trim() || null;
    if (operation === "compose") {
      if (intent !== "replace_current" && intent !== "prepare_next") {
        return jsonResponse(req, {
          error: "unknown_intent",
          detail: "intent must be replace_current or prepare_next",
          request_id: requestId,
        }, { status: 400 });
      }
      if (intent === "replace_current" && replaces === null) {
        return jsonResponse(req, {
          error: "replaces_required",
          detail:
            "intent=replace_current must name the plan it replaces (`replaces`).",
          request_id: requestId,
        }, { status: 400 });
      }
    }

    // ── LES MEMBRES, PAR LA MÊME PORTE QUE LE CHAT ──────────────────────
    // `keel_household_roster_for` et pas une lecture de table: c'est le SEUL
    // lecteur du roster, partagé avec `household_turn_context`. Deux SELECT sur
    // `household_members` divergeraient au premier ajustement, et la divergence
    // serait silencieuse — le générateur composerait pour un foyer que le chat
    // décrit autrement.
    //
    // Il rend `member_id` (l'identité d'une bouche), `user_id` (NULL tant que
    // la personne n'a pas réclamé son profil), le prénom, l'état d'âge à trois
    // valeurs et l'objectif — tout ce dont la bifurcation a besoin, et rien qui
    // exige un compte.
    const rosterRes = await admin.rpc("keel_household_roster_for", { p_user: userId });
    if (rosterRes.error) throw rosterRes.error;
    const roster = (rosterRes.data ?? []) as RosterRow[];
    if (roster.length === 0) {
      return jsonResponse(req, { error: "empty_household", request_id: requestId }, { status: 409 });
    }
    // LES COMPTES DU FOYER — un sous-ensemble, désormais. Sert l'union des
    // contraintes de sécurité, qui reste clée sur `auth.users`.
    const accountIds = roster
      .map((r) => r.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    // --- LE JOUR DU COMPTE MAÎTRE, dans SON fuseau ------------------------
    // Le foyer cuisine ensemble: il n'a qu'un seul calendrier, et c'est celui
    // de la personne qui compose. Faire la moyenne de quatre fuseaux
    // produirait une date que personne n'habite.
    const ownerProfileRes = await admin
      .from("profiles")
      .select("id, timezone, country, locale")
      .eq("id", userId)
      .maybeSingle();
    if (ownerProfileRes.error) throw ownerProfileRes.error;
    const ownerProfile = (ownerProfileRes.data ?? {}) as Record<string, unknown>;
    const timezone = String(ownerProfile.timezone ?? "").trim();
    if (!timezone) {
      return jsonResponse(req, {
        error: "local_day_unresolved",
        detail: "We could not tell what day it is where you are, and a meal " +
          "plan has to carry real dates.",
        request_id: requestId,
      }, { status: 409 });
    }
    const todayToken = dayTokenInZone(timezone, new Date());
    const todayDate = localDateInZone(timezone, new Date());
    const country = String(ownerProfile.country ?? "").trim() || null;

    // ── LA FENÊTRE, REMONTÉE ICI (L3, 2026-08-12) ───────────────────────
    //
    // ELLE ÉTAIT RÉSOLUE 180 LIGNES PLUS BAS, et elle est remontée pour DEUX
    // raisons qui vont dans le même sens.
    //
    //   1. C'EST LE MÊME GESTE QUE `intent`/`replaces` PLUS HAUT: ce qui ne
    //      dépend que du corps de la requête se refuse avant toute dépense.
    //      Un `window_required` se payait jusqu'ici d'une lecture d'objectif,
    //      d'un roster et de N lectures de corps.
    //   2. LA PRISE DE MAIN A BESOIN DE LA FENÊTRE (D2/D7). Savoir qui mange
    //      son propre plan, c'est comparer sa fenêtre à CELLE-CI — et cette
    //      réponse doit être connue AVANT qu'on dimensionne quoi que ce soit
    //      pour la tablée.
    //
    // ⚠️ UN SEUL EFFET DE BORD, ET IL EST ASSUMÉ: un appel qui n'a NI fenêtre
    // NI objectif reçoit désormais `window_required` (400) là où il recevait
    // `goal_required` (409). C'est l'ordre qu'a déjà `generate-meal-v1`, où la
    // fenêtre est validée bien avant l'objectif; les deux lanes disaient deux
    // choses différentes du même appel mal formé.
    let startsOn: string;
    let durationDays: number;
    /**
     * L4 — TOUT CE QUE LA FUSION A RÉSOLU AVANT LE MODÈLE.
     *
     * `null` sur une composition ordinaire, et c'est ce qui rend le reste de ce
     * fichier lisible: chaque endroit qui doit se comporter autrement le dit en
     * une ligne (`merge === null ? … : …`) au lieu de porter une branche.
     */
    let merge: ResolvedMerge | null = null;
    /**
     * L5/D8 — CE QUE LA DÉFUSION A RÉSOLU AVANT LE MODÈLE. `null` partout
     * ailleurs, même règle que `merge` juste au-dessus.
     */
    let unmerge: ResolvedUnmerge | null = null;

    // ── LES PLANS DU FOYER VIVANTS, LUS UNE FOIS POUR LES TROIS OPÉRATIONS ──
    //
    // La fusion en a besoin pour choisir sa paire, la défusion pour retrouver
    // le plan qui porte la reprise, et la COMPOSITION ORDINAIRE pour relire
    // `merged_from` — c'est-à-dire pour ne pas ré-exclure en silence quelqu'un
    // que le maître venait de reprendre (L4, trou n°2). Une lecture par
    // opération aurait fait trois prédicats à tenir alignés.
    const householdPlans = await loadLiveHouseholdPlans(admin, {
      ownerUserId: userId,
      householdId,
    });

    if (operation === "merge") {
      const resolvedMerge = await resolveMergeRequest({
        admin,
        roster,
        memberId: mergeMemberId!,
        todayDate,
        householdPlans,
      });
      if ("refusal" in resolvedMerge) {
        // ⚠️ AUCUN DE CES REFUS NE COÛTE UN APPEL MODÈLE, et c'est la moitié
        // qui compte. Ils ne dépendent que de deux fenêtres, d'un roster et
        // d'une date — L1 a mesuré 28,6 s et 225 s brûlées sur des refus de
        // cette nature, et un test de position garde celui-ci.
        console.log(JSON.stringify({
          tag: "keel.household_meal.merge_refused",
          user_id: userId,
          household_id: householdId,
          member_id: mergeMemberId,
          reason: resolvedMerge.refusal,
        }));
        return jsonResponse(req, {
          error: resolvedMerge.refusal,
          detail: resolvedMerge.detail,
          request_id: requestId,
        }, { status: 409 });
      }
      // ── L7/D11 — LE PLAFOND, REFUSÉ ICI EN MILLISECONDES ───────────────
      //
      // ⚠️ CE N'EST PAS LA GARDE. La garde est le prédicat de
      // `keel_household_claim_merge_quota`, juste avant l'appel modèle: deux
      // fusions lancées en même temps liraient TOUTES LES DEUX un compteur non
      // plein ici, et c'est très exactement le défaut que ce dépôt a payé sur
      // `keel_validate_meal_plan`. Ce refus-ci est un refus RAPIDE — il évite
      // au foyer déjà plein de traverser une doctrine, un roster, des voix et
      // huit lectures pour finir sur le même mot.
      //
      // IL EST ICI, ET PAS PLUS HAUT, parce que les onze refus de L4 sont plus
      // précis que lui: « cette personne n'est pas dans ce foyer » vaut mieux
      // que « le foyer a fini sa semaine », même quand les deux sont vrais.
      //
      // FAIL-OPEN, comme la lecture de facturation deux gardes plus haut et
      // pour la même raison: se tromper de sens couperait un foyer qui paie
      // sur une lecture ratée. Le vrai plafond, lui, ne peut pas rater — il est
      // dans le prédicat de l'écriture.
      const quotaPeek = await admin.rpc("keel_household_merge_quota_state", {
        p_household: householdId,
        p_local_date: todayDate,
      });
      if (quotaPeek.error) {
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error: quotaPeek.error,
          metadata: { source: "merge_quota_state", household: householdId },
        });
        issues.push("merge_quota_unreadable");
      } else {
        const state = parseMergeQuota(quotaPeek.data);
        if (state?.exhausted) {
          console.log(JSON.stringify({
            tag: "keel.household_meal.merge_quota_exhausted",
            user_id: userId,
            household_id: householdId,
            member_id: mergeMemberId,
            used: state.used,
            limit: state.limit,
            week_start: state.weekStart,
            stage: "peek",
          }));
          // 429 ET PAS 409: le statut dit déjà de quoi il s'agit, comme le 402
          // du gel. `skipErrorLog` pour la même raison qu'au gel — UN PLAFOND
          // ATTEINT N'EST PAS UN INCIDENT. L1 a mesuré 15 lignes de
          // `system_error_logs`, au niveau `error`, pour des refus de paiement
          // en une seule session de test.
          return jsonResponse(req, {
            error: MERGE_QUOTA_EXHAUSTED,
            detail: mergeQuotaRefusalDetail(state),
            merge_quota: {
              used: state.used,
              limit: state.limit,
              remaining: state.remaining,
              week_start: state.weekStart,
              resets_on: state.resetsOn,
            },
            request_id: requestId,
          }, { status: 429, skipErrorLog: true });
        }
      }
      merge = resolvedMerge;
      startsOn = merge.window.window.startsOn;
      durationDays = merge.window.window.durationDays;
      // ── L'INTENTION SE DÉDUIT, ELLE NE SE DEMANDE PAS ─────────────────
      // Deux cas, et un seul est un remplacement.
      //   · La fusion commence LE MÊME JOUR que le plan du foyer ⇒ elle le
      //     REMPLACE, et la RPC retire l'ancien.
      //   · Elle commence PLUS TARD (des jours déjà consommés, D16) ⇒ le plan
      //     du foyer doit SURVIVRE, tronqué à ces jours-là. C'est exactement ce
      //     que fait la boucle de chevauchement de `write_student_meal_plan`,
      //     et c'est ce qui réalise « hors intersection, chacun garde ce qu'il
      //     avait » sans une ligne de code de plus.
      intent = startsOn === merge.householdPlan.startsOn
        ? "replace_current"
        : "prepare_next";
      replaces = intent === "replace_current" ? merge.householdPlan.id : null;
    } else if (operation === "unmerge") {
      const resolvedUnmerge = resolveUnmergeRequest({
        roster,
        memberId: unmergeMemberId!,
        todayDate,
        householdPlans,
      });
      if ("refusal" in resolvedUnmerge) {
        // MÊME `tag` QUE LES REFUS DE FUSION, à un mot près. Un décompte de
        // refus doit pouvoir se lire par opération; deux formes de log pour le
        // même fait rendraient tout décompte faux, et personne ne le verrait
        // (mesuré sur `merge_member_away_all_window`, 2026-08-12).
        console.log(JSON.stringify({
          tag: "keel.household_meal.unmerge_refused",
          user_id: userId,
          household_id: householdId,
          member_id: unmergeMemberId,
          reason: resolvedUnmerge.refusal,
        }));
        return jsonResponse(req, {
          error: resolvedUnmerge.refusal,
          detail: resolvedUnmerge.detail,
          request_id: requestId,
        }, { status: 409 });
      }
      unmerge = resolvedUnmerge;
      // ⚠️ LA FENÊTRE SE DÉDUIT ICI AUSSI, ET POUR LA MÊME RAISON QUE LA FUSION.
      // C'est la QUEUE du plan de base — ce qu'il lui reste à partir
      // d'aujourd'hui (D16). Un client qui pourrait la choisir pourrait refaire
      // hier, ou refaire une semaine que ce plan ne couvre pas.
      startsOn = unmerge.window.window.startsOn;
      durationDays = unmerge.window.window.durationDays;
      intent = startsOn === unmerge.basePlan.startsOn
        ? "replace_current"
        : "prepare_next";
      replaces = intent === "replace_current" ? unmerge.basePlan.id : null;
    } else {
      const windowRequest = readWindowRequest(body.window);
      if (!windowRequest) {
        return jsonResponse(req, {
          error: "window_required",
          detail: "window must be {kind:'until_sunday'} | {kind:'days',count} | " +
            "{kind:'exact',starts_on,duration_days}",
          request_id: requestId,
        }, { status: 400 });
      }
      try {
        const resolved = resolveRequestedWindow(windowRequest, todayDate);
        startsOn = resolved.startsOn;
        durationDays = resolved.durationDays;
      } catch (error) {
        return jsonResponse(req, {
          error: "bad_window",
          detail: error instanceof Error ? error.message : String(error),
          request_id: requestId,
        }, { status: 400 });
      }
    }

    // ── L'OBJECTIF DU MAÎTRE: LA DOCTRINE DU REPAS ──────────────────────
    // `student_goals` du compte maître SEUL, et pour une raison qui n'est plus
    // celle d'avant: cette ligne ne sert plus à dimensionner des portions, elle
    // porte la SITUATION, les contraintes pratiques et la langue — c'est-à-dire
    // ce qui gouverne la composition entière. Les objectifs des membres, eux,
    // vivent désormais sur leur ligne de foyer.
    const ownerGoalRes = await admin
      .from("student_goals")
      .select("user_id, goal, situation, practical_constraints, content_locale")
      .eq("user_id", userId)
      .maybeSingle();
    if (ownerGoalRes.error) throw ownerGoalRes.error;
    const ownerGoal = ownerGoalRes.data as Record<string, unknown> | null;
    if (!ownerGoal) {
      return jsonResponse(req, {
        error: "goal_required",
        detail: "Set a goal and situation before we cook for your household.",
        request_id: requestId,
      }, { status: 409 });
    }

    // ── LES BOUCHES ─────────────────────────────────────────────────────
    // L'objectif vient de la ligne membre pour une bouche SANS compte, et de
    // son « about you » dès qu'elle en a un — arbitré le 2026-08-11 (D1) et
    // résolu dans `keel_household_roster_for`, jamais ici. La
    // ceinture n'est plus « on ne lit pas la table pour un mineur » — elle est
    // `goalApplies`, dans `household.ts`, et elle refuse DEUX cas: le mineur,
    // et la bouche dont l'âge est inconnu. Le second est neuf, et c'est celui
    // qui mordait: une bouche saisie sans date aurait reçu la direction de son
    // objectif comme si on savait qu'elle est adulte.
    //
    // ── LE CORPS, PAR BOUCHE QUI EN A UN (lot 3B) ───────────────────────
    // Avant ce lot, réclamer son profil ne changeait RIEN à la portion servie
    // par le foyer: `body: null` partait au prompt (et y reste, plus bas — un
    // repas de foyer n'a pas UN corps), et la ligne de brief d'un membre ne
    // portait qu'un jeton d'objectif. Le corps entre maintenant PAR MEMBRE,
    // dans le brief de portions, où il a un sens: c'est la taille d'une
    // assiette qu'il dimensionne, pas la composition du plat.
    //
    // Le jour local passé est celui du COMPTE MAÎTRE, comme partout ici.
    const bodies = await loadHouseholdMemberBodies(admin, {
      members: roster.map((r) => ({ memberId: r.member_id, userId: r.user_id })),
      todayLocalDate: todayDate,
    });
    issues.push(...bodies.issues);
    // LE COÛT, OBSERVABLE EN PRODUCTION ET PAS SEULEMENT DANS UN RAPPORT. Ce
    // lot fait passer la lecture de corps de 1 à N par génération; un nombre
    // qu'on ne journalise pas est un nombre que personne ne verra doubler.
    console.log(JSON.stringify({
      tag: "keel.household_meal.member_bodies",
      user_id: userId,
      household_id: householdId,
      members: roster.length,
      accounts: accountIds.length,
      with_body: bodies.byMember.size,
      reads: bodies.reads,
    }));

    const members: LoadedMember[] = roster.map((r) => {
      const rawGoal = String(r.goal ?? "").trim();
      const goal = (MEMBER_GOALS as readonly string[]).includes(rawGoal)
        ? (rawGoal as MemberGoal)
        : null;
      const ageState = (MEMBER_AGE_STATES as readonly string[]).includes(r.age_state)
        ? (r.age_state as MemberAgeState)
        // Un état inconnu du vocabulaire vaut `unknown`, jamais `adult`: c'est
        // la même direction sûre que la fonction SQL, et elle doit survivre à
        // un désalignement entre les deux.
        : "unknown";
      return {
        memberId: r.member_id,
        userId: r.user_id,
        // Le prénom vient de la LIGNE, plus de `profiles`. Une seule source,
        // donc aucune branche entre une bouche avec compte et une sans.
        displayName: String(r.first_name ?? "").trim() || "Member",
        goal,
        ageState,
        // APPARIÉ SUR `member_id`, jamais sur `user_id`. C'est le même
        // re-clavetage que les portions, et pour la même raison: une bouche qui
        // réclame son profil ne change pas d'identité ce jour-là.
        body: bodies.byMember.get(r.member_id) ?? null,
        isOwner: r.role === "owner",
        // D14. AUCUNE FUSION ICI: le roster a déjà concaténé les deux sources,
        // et `parseAwayDays` est l'opérateur d'union. Refaire la résolution
        // dans ce fichier ferait un second avis sur qui est là.
        away: parseMemberAway(r.away_days),
        // D2/D7. AUCUN JUGEMENT ICI NON PLUS: on lit la forme, on ne compare
        // aucune fenêtre. `resolveHandOff`, juste en dessous, est le seul
        // endroit du produit qui décide qu'une bouche a pris la main.
        ownPlans: parseOwnPlans(r.own_plans),
      };
    });

    // ── D2 · D7 — QUI A PRIS LA MAIN (L3, 2026-08-12) ────────────────────
    //
    // LA BASCULE DU MODÈLE, ET ELLE TIENT EN UNE PHRASE: le plan du maître EST
    // le plan du foyer — lui, plus toutes les bouches sans compte, plus tout
    // compte secondaire qui n'a PAS pris la main. Celui qui a pris la main
    // mange SON plan, donc il ne mange pas celui-ci, donc on ne le compose pas.
    //
    // LA POSTURE PAR DÉFAUT EST « NE RIEN FAIRE » (D7). Un secondaire sans plan
    // validé est composé ici comme une bouche ordinaire; ce n'est pas un cas
    // dégradé, c'est le cas nominal — « la composition n'attend jamais
    // personne ».
    //
    // ⚠️ CE FILTRE ET CELUI DE LA PRÉSENCE NE S'IGNORENT PAS, ILS SE COMPOSENT.
    // `platedMembers` (plus bas, D14) retire les bouches absentes à CHAQUE
    // moment de la fenêtre; il part désormais de `composedMembers`, pas de
    // `members`. Une même personne peut très bien avoir pris la main ET être
    // partie toute la semaine, et deux filtres qui se croiseraient sans se
    // connaître finiraient par diverger. L'ordre est celui-ci parce que la
    // prise de main ne dépend pas de la présence, alors que l'absence totale
    // est CALCULÉE sur la tablée qu'on compose.
    //
    // CE QUI NE SUIT PAS L'EXCLUSION, ET POURQUOI:
    //   · L'UNION DES ALLERGIES (`accountIds`, `loadHouseholdAllergies`) reste
    //     sur le foyer ENTIER. Une allergie gouverne la casserole; la retirer
    //     parce que son porteur mange ailleurs cette semaine ferait dépendre
    //     une ceinture de sécurité d'une décision de calendrier. C'est le sens
    //     fail-closed de tout ce fichier.
    //   · LES RÈGLES DE MAISON (`restrictions`) restent entières, parce que le
    //     VERROU (`applyHouseRuleLock`) applique leurs libellés au plat, sans
    //     regarder pour qui. Filtrer la consigne sans filtrer le verrou ferait
    //     diverger ce qu'on demande et ce qu'on impose.
    //   · LES DÉCOMPTES DE `generated_from.household` décrivent LE FOYER
    //     (combien de bouches, combien de mineurs). Le nombre de bouches
    //     réellement servies se lit sur `servings`, et qui a été retiré sur
    //     `hand` juste à côté.
    //
    // ⚠️ L4 — LA FUSION PASSE PAR ICI, ET SEULEMENT PAR ICI. Reprendre
    // quelqu'un à la table, c'est annuler ce que son plan personnel aurait
    // fait; le faire APRÈS coup, dans ce fichier, ferait DEUX endroits qui
    // décident qui est à table, et celui qui a raison ne serait plus lisible.
    // `reclaimed` est un paramètre REQUIS de `resolveHandOff` pour cette raison
    // exacte — une fusion qui oublie de le passer composerait sans la personne
    // qu'elle fusionne, sans qu'une ligne échoue.
    //
    // ── L5 · D8 — CE QUE LE PLAN VIVANT DIT DÉJÀ DES REPRISES ────────────
    //
    // `merged_from` est relu sur les plans du foyer QUI MORDENT SUR LA FENÊTRE
    // qu'on recompose, et sur eux seuls: la provenance d'un plan de la semaine
    // prochaine ne dit rien de la table de cette semaine-ci. C'est aussi la
    // PORTÉE que le lecteur annonce avec chaque `held` — il rend la fenêtre du
    // plan porteur, précisément pour que « la prochaine composition la
    // re-reprendra » ne soit vrai que là où cette ligne-ci le rend vrai.
    //
    // ⚠️ ET C'EST `mergeCarriers` QUI CHOISIT, pas un `find` sur la liste. Deux
    // plans vivants peuvent porter la même reprise (le report la recopie d'un
    // plan à l'autre); garder « la première entrée trouvée » revenait à garder
    // celle du plan le PLUS ANCIEN, donc à comparer la date D8 d'un geste
    // périmé. Même fonction que la défusion et que le lecteur: si les trois ne
    // désignent pas la même ligne, ils se contredisent sans jamais échouer.
    //
    // ⚠️ AUCUN ÉTAT N'EST STOCKÉ, ET C'EST LA DÉCISION. « Untel est fusionné »
    // aurait été une colonne de plus, donc un écrivain de plus à ne jamais
    // oublier; ici la donnée est celle que L4 écrit déjà, datée, sur la ligne
    // même du plan qu'elle décrit.
    const carriedFromPlans = householdPlans.filter((plan) =>
      plansOverlap(plan, { startsOn, durationDays })
    );
    const priorMergedFrom: MergedFromEntry[] = [
      ...mergeCarriers({ householdPlans: carriedFromPlans, today: todayDate })
        .values(),
    ].map((c) => c.entry);
    const standings = mergeStandings({
      mergedFrom: priorMergedFrom,
      plansByMember: new Map(members.map((m) => [m.memberId, m.ownPlans])),
    });
    // LA FUSION QU'ON VIENT DE DEMANDER N'EST PAS « COLLANTE », ELLE EST
    // DEMANDÉE: on la retire d'ici pour qu'elle ne soit pas comptée deux fois,
    // et la défusion retire la sienne pour que le mécanisme collant n'annule
    // pas le geste qui l'annule.
    const stickyReclaimed = heldMemberIds(standings).filter((id) =>
      id !== merge?.member.member_id && id !== unmerge?.member.member_id
    );
    if (priorMergedFrom.length > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.merge_standing",
        user_id: userId,
        household_id: householdId,
        operation,
        carried: priorMergedFrom.length,
        held: stickyReclaimed.length,
        revalidated: standings.filter((s) => s.warn).map((s) => s.memberId),
      }));
    }
    //
    // ⚠️ L5 — LA FUSION EST COLLANTE, ET C'EST ICI QUE ÇA SE JOUE. Avant ce
    // lot, recomposer la même fenêtre en `compose` RÉ-EXCLUAIT la personne
    // qu'on venait de reprendre: son plan personnel couvre toujours la fenêtre,
    // donc la règle de L3 la retirait, et le maître perdait sa fusion sans
    // l'avoir demandé. `stickyReclaimed` relit `merged_from` sur le plan VIVANT
    // et re-reprend qui n'a pas revalidé depuis (voir juste au-dessus).
    //
    // ⚠️ ET UNE RÉ-VALIDATION NE SE RATTRAPE PAS EN SILENCE: qui a validé un
    // plan APRÈS la fusion n'est PAS re-repris (`hold: false`), parce que c'est
    // très exactement le cas que D8 fait remonter au maître avec trois sorties.
    // Le reprendre d'office déciderait à sa place — l'inverse de D10.
    const handOff = resolveHandOff({
      members,
      window: { startsOn, durationDays },
      reclaimed: merge === null
        ? stickyReclaimed
        : [merge.member.member_id, ...stickyReclaimed],
      // L5/D8 — LA DÉFUSION. Elle gagne sur la reprise collante juste au-dessus:
      // c'est le geste qui annule le geste.
      excluded: unmerge === null ? [] : [unmerge.member.member_id],
    });
    const composedMembers = handOff.composed;
    for (const t of handOff.taken) {
      issues.push(`member_took_the_hand:${t.member_id}`);
    }
    for (const r of handOff.reclaimed) {
      issues.push(`member_reclaimed_by_merge:${r.member_id}`);
    }
    for (const u of handOff.unmerged) {
      // ⚠️ `covers_window` EST DANS L'`issue`, PAS SEULEMENT DANS L'ARCHIVE.
      // Une défusion peut retirer quelqu'un dont le plan ne couvre pas tous les
      // jours: c'est le droit du maître (D8), mais « il n'a rien à manger
      // jeudi » doit se lire sans ouvrir `generated_from`.
      issues.push(
        `member_unmerged:${u.member_id}${u.covers_window ? "" : ":uncovered"}`,
      );
    }
    for (const s of standings) {
      // D8 — LE PLAN QU'ON ÉCRIT PORTE-T-IL UNE REPRISE PÉRIMÉE ? Tracé sur la
      // ligne elle-même: sans ça, « pourquoi ce plan cuisine-t-il encore les
      // plats d'un plan que l'intéressé a remplacé » n'a pas de réponse trois
      // jours plus tard.
      if (s.warn) issues.push(`merge_revalidated_since:${s.memberId}`);
    }
    for (const id of merge?.otherOverlappingPlanIds ?? []) {
      // O1, rendu VISIBLE plutôt que tranché en silence: cette personne porte
      // un AUTRE plan personnel qui mord sur la fenêtre fusionnée, et cette
      // fusion-ci ne l'a pas repris.
      issues.push(`merge_other_overlapping_plan:${id}`);
    }
    if (
      handOff.taken.length > 0 || handOff.partial.length > 0 ||
      handOff.reclaimed.length > 0 || handOff.unmerged.length > 0
    ) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.hand",
        user_id: userId,
        household_id: householdId,
        taken: handOff.taken.length,
        partial: handOff.partial.length,
        reclaimed: handOff.reclaimed.length,
        unmerged: handOff.unmerged.length,
        composed: composedMembers.length,
        window: [startsOn, durationDays],
      }));
    }

    // ── LE FOYER N'A PLUS RIEN À COMPOSER — UN REFUS À LUI ───────────────
    //
    // ⚠️ SANS CE REFUS, LE CAS NE TOMBERAIT PAS SUR `window_fully_away`: il
    // tomberait BIEN PLUS BAS et BIEN PLUS MAL. `resolveWindowPresence` rend un
    // échec OUVERT quand la liste est vide (`fullyAway: false`, tout le monde à
    // table), donc la composition continuerait — pour zéro bouche, avec une
    // liste d'ids vide, jusqu'à un appel modèle payé pour un plan que personne
    // ne mange. Le refus doit donc être ICI, et porter sa propre cause: dire
    // « personne n'est là » quand tout le monde est là mais cuisine pour soi
    // serait un diagnostic faux.
    //
    // ⚠️ AUJOURD'HUI IL NE PEUT PAS SE DÉCLENCHER, ET C'EST ÉCRIT EXPRÈS. Le
    // maître n'est JAMAIS exclu (D2), et il est toujours dans son roster —
    // `composedMembers` porte donc au moins une bouche. Cette garde tient
    // l'invariant plutôt que le symptôme: le jour où un non-maître pourra
    // composer, ou où le maître pourra prendre la main, elle est déjà juste.
    // Son cas passant, lui, est réel et testé sur le module pur
    // (`household_hand_test.ts`: un roster sans maître rend `composed: []`).
    if (composedMembers.length === 0) {
      return jsonResponse(req, {
        error: "all_members_have_own_plan",
        detail: "Everyone in this household is already cooking from their own " +
          "plan over that stretch, so there is nothing left for the household " +
          "to compose.",
        request_id: requestId,
      }, { status: 409 });
    }

    // ── FF-043 · LA RÉSOLUTION FOYER ────────────────────────────────────
    // L'ordre est l'algorithme du design §4.1, et il n'est pas négociable: le
    // VERROU DE LANE d'abord, avant tout calcul. Évalué après le
    // dimensionnement, il faudrait défaire des enveloppes déjà posées — et un
    // défaisage se rate en silence.
    //
    // ⚠️ LE CORPS RESTE `null` DANS LE PROMPT (plus bas, et le commentaire y
    // est). Ce qui suit dimensionne dans le MOTEUR: le modèle ne reçoit jamais
    // une enveloppe, il reçoit un plat et des directions de service.
    const refRes = await admin
      .from("households")
      .select("reference_member_id")
      .eq("id", householdId)
      .maybeSingle();
    if (refRes.error) throw refRes.error;
    // ⚠️ `composedMembers`, PAS `members` (L3). Cette résolution décide la
    // DIRECTION DE SERVICE du tronc commun et les add-ons par bouche: y laisser
    // quelqu'un qui mange son propre plan tirerait la casserole vers un
    // objectif que personne à cette table ne porte, et promettrait des grammes
    // à un absent dans `member_deltas`.
    const composerMemberId =
      composedMembers.find((m) => m.userId === userId)?.memberId ?? null;
    const resolution = resolveHousehold({
      members: composedMembers.map((m) =>
        toHouseholdMember(
          m,
          // L'enveloppe PAR MEMBRE. `goalApplies` a déjà mis `goal` à `null`
          // pour un mineur et pour une bouche d'âge inconnu, donc aucune
          // enveloppe n'en dérive — la garde vit là-bas, pas ici.
          m.goal === null || m.body === null ? null : envelopeFor(
            (GOAL_TOKENS as readonly string[]).includes(m.goal)
              ? (m.goal as GoalToken)
              : "health",
            m.body,
            m.body.ageBand,
            // FAIL-CLOSED, comme sur la lane individuelle.
            m.body.restrictionFlag ?? true,
            // Le pilotage du coach du foyer n'entre pas ici: le tronc est
            // commun, et la doctrine qui le gouverne est celle du RÉFÉRENT,
            // pas celle de chaque membre. À instruire avec FF-043 §11.
            null,
          ),
        )
      ),
      declaredReferenceMemberId: refRes.data?.reference_member_id ?? null,
      composerMemberId,
      daysCovered: 7,
    });
    issues.push(...resolution.issues);
    console.log(JSON.stringify({
      tag: "keel.household_meal.composition",
      user_id: userId,
      household_id: householdId,
      // LE MODE MÉLANGE les deux populations (un membre protégé, ou aucune
      // enveloppe calculable): il ne désigne personne. C'est la raison pour
      // laquelle il est journalisable.
      mode: resolution.mode,
      deltas: resolution.deltas.length,
      family_service: resolution.familyService,
      // L'INSTRUMENTATION D'A3: sans elle, la décision d'armer le slot de
      // dressage se prendrait à l'aveugle.
      residual_gaps: resolution.residualGaps.map((g) => g.gapKcalPerDay),
    }));

    // ── LES RESTRICTIONS DE MAISON ──────────────────────────────────────
    // Lues telles quelles. Le fait qu'elles soient LÉGITIMES a déjà été tranché
    // à l'écriture (`keel_household_add_restriction`: compte maître, membre de
    // ce foyer). Les rejuger ici ferait une seconde définition de la règle, qui
    // divergerait.
    //
    // ⚠️ CETTE TABLE NE CONTIENT QUE DU POUVOIR DOMESTIQUE. Les allergies du
    // foyer vivent dans `household_member_allergies`, lue plus bas avec l'union
    // de sécurité — voir l'en-tête de `household_safety.ts` pour la raison, qui
    // est que le verrou d'en dessous EFFACE le « pourquoi » du plat.
    const restrRes = await admin
      .from("household_food_restrictions")
      .select("member_id, label")
      .eq("household_id", householdId);
    if (restrRes.error) throw restrRes.error;
    const nameOf = new Map(members.map((m) => [m.memberId, m.displayName]));
    const restrictions: HouseholdRestriction[] =
      ((restrRes.data ?? []) as Array<{ member_id: string; label: string }>)
        .filter((r) => nameOf.has(r.member_id))
        .map((r) => ({
          memberId: r.member_id,
          memberDisplayName: nameOf.get(r.member_id)!,
          label: r.label,
        }));

    // ── LES ENVIES DE LA SEMAINE ────────────────────────────────────────
    // ── L'ANCRE EST LE LUNDI, PAS LE JOUR DE DÉPART (lot 5) ─────────────
    // La lecture filtrait sur `week_start = startsOn`. Une ligne écrite lundi
    // n'était alors PAS trouvée par une composition lancée mercredi: le foyer
    // recevait un plan qui ignorait ce qu'il avait demandé, sans une seule
    // erreur nulle part. `keel_household_submit_envy` recale à l'écriture sur
    // le lundi ISO; on recale ici à la lecture, avec la même arithmétique.
    // Une semaine PASSÉE ne remonte donc jamais — c'est toute la raison pour
    // laquelle cette table garde une ancre plutôt qu'une colonne éternelle.
    const envyWeek = weekStartOf(startsOn);
    const envyRes = await admin
      .from("household_envy_submissions")
      .select("body")
      .eq("household_id", householdId)
      .eq("week_start", envyWeek)
      .maybeSingle();
    if (envyRes.error) throw envyRes.error;
    // UNE LIGNE, ÉCRITE PAR LE COMPTE MAÎTRE POUR TOUT LE MONDE. La récolte
    // par membre est morte au lot 5 (elle faisait relancer tout le monde), et
    // avec elle le pont user_id → member_id: le bloc n'a plus de nom à porter.
    const envyLine = ((envyRes.data ?? null) as { body: string } | null)?.body ?? null;

    // ── LA MÉTHODE: CELLE DU COMPTE MAÎTRE ──────────────────────────────
    // Un foyer suit UNE méthode. Mélanger celles de deux coachs produirait un
    // plan qu'aucun des deux n'a écrit, signé des deux — exactement ce que le
    // verrou existe pour empêcher.
    const doctrine = await loadPublishedDoctrine(admin, userId);
    if (!doctrine.coachId) {
      return jsonResponse(req, { error: "no_coach", request_id: requestId }, { status: 409 });
    }
    const beliefKeys = doctrineBeliefsFor(doctrine)
      .map((b) => String(b.key ?? "").trim())
      .filter(Boolean);
    const coachNote = await loadCoachNote(admin, userId);

    let protocolBlock = "";
    try {
      const protocol = await loadPublishedProtocol(admin, userId);
      protocolBlock = protocolBlockFor(protocol, doctrine.doctrine?.coachDisplayName ?? null);
    } catch (error) {
      console.warn(`[${FN_NAME}] coach food mapping unavailable`, error);
    }

    // ── LES CONTRAINTES DURES: L'UNION DU FOYER ─────────────────────────
    // Une allergie d'un seul membre gouverne TOUTE la casserole. C'est la
    // seule lecture de ce fichier qui s'applique aussi aux mineurs, et c'est
    // délibéré: refuser un objectif à un enfant n'a rien à voir avec ignorer
    // son allergie.
    //
    // ⚠️ LA PREMIÈRE RÉDACTION DE CE BLOC ÉTAIT FAUSSE, et le typecheck ne
    // l'a pas vue: elle traitait le retour comme un objet portant un champ
    // `.constraints`, derrière un `as any` posé pour faire passer le client.
    // `loadStudentSafetyConstraints` rend un TABLEAU. Le cast désarmait
    // exactement le contrôle qui l'aurait dit — la leçon
    // `as-cast-on-foreign-type-disarms-typecheck` du dépôt, commise à
    // nouveau. Le type est donc explicite ici, et l'union est une
    // concaténation.
    //
    // ET UNE LECTURE CASSÉE NE DOIT PAS DÉGRADER EN « AUCUNE CONTRAINTE ».
    // Sur le chemin individuel, un `catch` qui avale l'erreur laisse l'élève
    // sans son verrou d'allergène pour un repas. Ici il l'enlèverait à TOUT LE
    // FOYER, y compris aux enfants. On refuse la composition plutôt que de la
    // rendre sans ceinture.
    const constraints: StudentSafetyConstraint[] = [];
    for (const id of accountIds) {
      try {
        constraints.push(...await loadStudentSafetyConstraints(admin as never, id));
      } catch (error) {
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error,
          metadata: { source: "safety_constraints", member: id },
        });
        return jsonResponse(req, {
          error: "safety_constraints_unreadable",
          detail: "We could not read this household's hard constraints, and we " +
            "will not cook without them.",
          request_id: requestId,
        }, { status: 503 });
      }
    }

    // ── LES ALLERGIES DES BOUCHES SANS COMPTE (lot 4) ───────────────────
    //
    // La boucle du dessus ne parcourt que `accountIds`, et c'était le trou:
    // `student_safety_constraints` est clée sur `user_id`, donc l'allergie
    // d'un enfant de six ans n'entrait dans AUCUNE union — alors que l'écran
    // du foyer la réclamait. Le produit promettait ce qu'il ne tenait pas, et
    // le silence tombait du côté dangereux.
    //
    // MÊME FAIL-CLOSED, ET C'EST NON NÉGOCIABLE. Un `catch` qui avale l'erreur
    // ici retirerait sa ceinture à la seule population qui ne peut pas la
    // redéclarer elle-même. `loadHouseholdAllergies` lève; on refuse la
    // composition, exactement comme au-dessus.
    let householdAllergies: HouseholdAllergyRow[];
    try {
      householdAllergies = await loadHouseholdAllergies(admin as never, householdId);
    } catch (error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error,
        metadata: { source: "household_allergies", household: householdId },
      });
      return jsonResponse(req, {
        error: "safety_constraints_unreadable",
        detail: "We could not read this household's hard constraints, and we " +
          "will not cook without them.",
        request_id: requestId,
      }, { status: 503 });
    }

    // ── LE PROMPT ───────────────────────────────────────────────────────
    const goalRow = ownerGoal as Record<string, unknown>;

    // LA SÉPARATION DES DEUX NATURES, décidée en UN endroit et pas ici.
    // `householdHardConstraints` rend l'union de sécurité d'un côté et les
    // libellés du verrou de l'autre; les calculer séparément aux deux points
    // d'appel remettrait la question « et si on mélangeait ? » à chaque
    // lecture. Une allergie qui passerait par le verrou verrait sa raison
    // MÉDICALE effacée du plat, au même rang qu'un Nutella interdit.
    const householdSplit = householdHardConstraints({
      allergies: householdAllergies,
      houseRules: restrictions,
      // La langue du foyer est celle de la ligne du compte maître, comme le
      // reste de ce qui gouverne la composition.
      contentLocale: String(goalRow.content_locale ?? "").trim() || "en-GB",
    });
    constraints.push(...householdSplit.safetyConstraints);
    if (householdSplit.safetyConstraints.length > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.member_allergies",
        user_id: userId,
        household_id: householdId,
        rows: householdAllergies.length,
        refs: householdSplit.safetyConstraints.length,
      }));
    }

    // ── CE QUE L'ÉLÈVE A DÉMENTI DEPUIS — LE TROISIÈME CHEMIN ─────────────
    // `generate-meal-v1` porte ce raccord avec cette raison écrite: « Une garde
    // qui ne couvre qu'un des deux chemins d'un même jsonb est une garde qu'on
    // croit posée. » Il y a TROIS chemins, et celui-ci était le découvert:
    // vérifié le 2026-08-08, ce fichier n'importait que le module PUR
    // (`food_preference_promotion.ts`) et jamais son module d'I/O, donc il
    // servait `practical_constraints` tel quel.
    //
    // Ce que ça coûtait, et c'est exactement FF-026 R3 (« la rétractation est
    // honorée »): un foyer qui ne compose QUE des repas de foyer ne
    // réconciliait jamais. La préférence que l'élève a rétractée dans la
    // conversation — proprement enregistrée par le memorizer en `superseded` —
    // continuait d'être servie au modèle, sans limite de temps, puisque rien
    // sur ce chemin ne relit la mémoire. La réconciliation PERSISTE en plus de
    // corriger, donc poser le raccord ici répare aussi les deux autres.
    goalRow.practical_constraints = await reconcileFoodPreferencesFor({
      admin,
      userId,
      constraints: (goalRow.practical_constraints ?? {}) as Record<string, unknown>,
      source: FN_NAME,
    });

    const pc = goalRow.practical_constraints as Record<string, unknown> | null;
    const eatingRhythm = parseEatingRhythm(pc?.eating_rhythm);
    const capacity = readCookingCapacity(pc);
    const scope: MealScope = durationDays === 1 ? "day" : "several_days";
    const daysToFill = windowDayOrder(startsOn, durationDays);

    // ── D14 · QUI EST LÀ, ET QUAND ────────────────────────────────────────
    //
    // CE QUE CE BLOC REMPLACE, ET POURQUOI L'ANCIEN COMMENTAIRE MENTAIT.
    // Une seule ligne vivait ici: `parseAwayDays(pc?.away_days)`, lue sur la
    // ligne `student_goals` du PROPRIÉTAIRE, et un commentaire disait que
    // l'absence individuelle d'un membre « est une autre question ». Elle ne
    // l'est plus, et elle ne l'a jamais été: cette lecture avait DEUX défauts
    // opposés.
    //
    //   · Une bouche SANS COMPTE n'a aucune ligne `student_goals`. L'absence
    //     d'un enfant parti en camp n'existait donc nulle part, et le foyer
    //     cuisinait pour lui toute la semaine.
    //   · L'absence du MAÎTRE supprimait le repas de TOUT LE MONDE — l'exact
    //     contraire de FF-002 §9: « si le père n'est pas là samedi, la session
    //     de cuisson du foyer ne disparaît pas, seules ses portions changent ».
    //
    // Sa déclaration à lui n'est pas perdue pour autant: elle arrive
    // désormais par le roster, sur SA ligne de membre, avec la source `self`
    // (D14). Elle compte comme celle de n'importe qui — pour lui seul.
    //
    // LE RYTHME PASSÉ EST LE RYTHME RÉSOLU. `buildMealPrompt` retombe sur
    // `DEFAULT_EATING_RHYTHM` quand la liste est vide; compter la présence sur
    // le brut ferait raisonner sur des moments que la consigne ne nomme pas —
    // et un rythme vide ferait de chaque jour un jour désert.
    //
    // ⚠️ `composedMembers`, PAS `members` (L3). La présence dimensionne la
    // CASSEROLE: compter l'absence de quelqu'un qui mange son propre plan
    // ferait descendre `servings` deux fois pour une seule bouche, et sa
    // déclaration d'absence n'a rien à dire de ce dîner-ci. Le cas
    // « personne ne reste » a déjà été refusé plus haut, nommément — cette
    // liste n'est donc jamais vide, et `fullyAway` garde le sens que FF-002 lui
    // donne: personne n'est LÀ, et non personne n'est CONCERNÉ.
    const presence = resolveWindowPresence({
      members: composedMembers.map((m) => ({
        memberId: m.memberId,
        displayName: m.displayName,
        away: m.away,
      })),
      rhythm: eatingRhythm.length > 0 ? eatingRhythm : DEFAULT_EATING_RHYTHM,
      windowDays: daysToFill,
    });

    // LE SEUL MOMENT QUI SORT DE LA COMPOSITION EST CELUI QUE PERSONNE NE
    // PARTAGE. Il part par le même chemin que sur la lane individuelle — la
    // consigne ET le parseur (FF-002 R3): une consigne seule n'est pas une
    // garantie, le modèle recompose ce qu'on lui a dit d'éviter.
    const awayDays = presence.householdAway;

    // ── FF-002 §7 · LA FENÊTRE ENTIÈREMENT DÉSERTÉE ──────────────────────
    // Refus NOMMÉ, et pas un plan de zéro plat: « un plan de zéro plat est un
    // écran cassé » (R6). Le nom est celui que la fiche a posé — la lane
    // individuelle ne l'implémente toujours pas, et c'est écrit dans le rapport
    // de ce lot plutôt que corrigé ici en passant.
    if (presence.fullyAway) {
      return jsonResponse(req, {
        error: "window_fully_away",
        detail: "Nobody in this household is eating here over that stretch. " +
          "Shorten the window, or take an absence back.",
        request_id: requestId,
      }, { status: 409 });
    }
    // ── L4 · FUSIONNER QUELQU'UN QUI N'EST LÀ AUCUN MOMENT N'A PAS DE SENS ──
    // Il n'aurait pas d'assiette (`platedMembers` le filtre plus bas), et le
    // plan porterait `merged_from` pour une personne absente de sa propre
    // fusion. Le refus est ICI, avant le modèle: la présence est déjà résolue,
    // et rien de ce qui suit ne changerait la réponse.
    if (
      merge !== null &&
      presence.absentAllWindow.includes(merge.member.member_id)
    ) {
      // ⚠️ IL ÉTAIT LE SEUL REFUS DE FUSION MUET, ET ÇA S'EST VU EN PRODUCTION.
      // Vérifié dans les logs du runtime le 2026-08-12: trois lignes
      // `merge_refused` pour les autres motifs, aucune pour celui-ci. Un refus
      // qu'on ne compte pas est un refus dont on ne saura jamais s'il tombe
      // souvent — et celui-ci tombe sur une personne QUE LE MAÎTRE VENAIT DE
      // DÉSIGNER, ce qui en fait le plus intéressant des onze.
      //
      // MÊME `tag` ET MÊME FORME que les dix autres (`resolveMergeRequest`
      // plus haut): deux formes de log pour le même fait rendraient tout
      // décompte faux, et personne ne le verrait.
      console.log(JSON.stringify({
        tag: "keel.household_meal.merge_refused",
        user_id: userId,
        household_id: householdId,
        member_id: merge.member.member_id,
        reason: "merge_member_away_all_window",
      }));
      return jsonResponse(req, {
        error: "merge_member_away_all_window",
        detail: "That person is marked away for every meal of those days, so " +
          "there is nothing to bring them back to. Take the absence back first.",
        request_id: requestId,
      }, { status: 409 });
    }
    if (presence.trace.length > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.presence",
        user_id: userId,
        household_id: householdId,
        members_away: presence.trace.length,
        deserted_slots: presence.householdAway.length,
        servings: presence.servings,
      }));
    }

    // ── QUI A UNE ASSIETTE DANS CE PLAN ──────────────────────────────────
    //
    // MESURÉ EN RUN RÉEL LE 2026-08-12: un plan cuisiné pour UNE personne
    // portait QUATRE `member_portions`, dont trois pour des bouches absentes à
    // chaque moment de la fenêtre. `TableCard` les affichait telles quelles —
    // « une portion adulte pleine » servie d'une casserole dimensionnée sans
    // eux. `servings` était juste, l'assiette mentait.
    //
    // On filtre ICI, en amont, et pas seulement à la réconciliation: si le
    // prompt continuait de nommer ces ids, le modèle continuerait de rendre
    // leurs portions et `reconcilePortions` les compterait en
    // `portion_for_unknown_member`. Une bouche absente toute la fenêtre ne doit
    // simplement pas exister pour ce plan-là.
    //
    // QUI MANQUE UN SEUL DÎNER RESTE ICI: il mange les autres jours. Le détail
    // par jour vit dans le bloc de présence, pas dans cette liste.
    //
    // Jamais vide: `fullyAway` a déjà refusé plus haut le cas où personne n'est
    // là à aucun moment, donc au moins une bouche survit à ce filtre.
    //
    // ⚠️ IL PART DE `composedMembers`, PAS DE `members` (L3). Il y a DEUX
    // raisons de ne pas avoir d'assiette dans ce plan, et elles s'empilent sur
    // la même personne: avoir pris la main (elle mange son plan) et être
    // absente toute la fenêtre (elle ne mange nulle part ici). Les deux filtres
    // se composent en cascade au lieu de se croiser — deux listes calculées
    // chacune sur `members` finiraient par se contredire, et l'une des deux
    // gagnerait en silence.
    const platedMembers = presence.absentAllWindow.length === 0
      ? composedMembers
      : composedMembers.filter((m) =>
        !presence.absentAllWindow.includes(m.memberId)
      );
    for (const id of presence.absentAllWindow) {
      issues.push(`member_away_all_window:${id}`);
    }

    // ── D6 · L'ÉCHELLE DE FUSION, DÉCIDÉE ICI ET PAS PAR LE MODÈLE ────────
    //
    // Le critère est VÉRIFIABLE, et c'est tout l'objet de D6: on ne demande pas
    // au modèle si un plat commun conviendrait, on le SAIT — une casserole déjà
    // composée peut toujours en donner moins, jamais plus qu'elle n'en
    // contient. La comparaison porte sur les directions de service, qui sont
    // des constantes du produit (`SERVING_DIRECTION`), lues et non recopiées.
    //
    // LA TABLE, C'EST QUI ? Les bouches qui ont une assiette dans ce plan-là,
    // SANS l'entrant: ce sont elles qui ont dimensionné la casserole. L'y
    // inclure ferait comparer sa demande à elle-même, et le niveau ① tiendrait
    // toujours — une garde qui ne mord jamais.
    //
    // ⚠️ CE N'EST PAS UN REFUS, DONC SA POSITION NE COÛTE RIEN. Le barreau
    // choisi change la CONSIGNE (`CookingShape`), pas le droit de composer.
    //
    // ── POURQUOI CE BLOC EST REMONTÉ AVANT `buildMealPrompt` (2026-08-12) ──
    // Il vivait APRÈS, entre la consigne et les blocs de foyer, et c'était
    // tenable tant que le barreau ne changeait QUE le suffixe du foyer. Il
    // change aussi le PLAFOND DE PLATS du tronc (`dishBudgetFor`): un plafond
    // calculé avant que le barreau soit connu est le plafond d'une table sans
    // la bouche qu'on lui ajoute — c'est le défaut mesuré, où le seizième plat
    // rendu était le dîner du dimanche du foyer. Rien d'autre n'a bougé:
    // `platedMembers` ne dépend que de `presence` et `composedMembers`, tous
    // deux résolus au-dessus.
    const mergedMember = merge === null
      ? null
      : platedMembers.find((m) => m.memberId === merge!.member.member_id) ?? null;
    // LES JETONS DE JOUR DE LA FENÊTRE RECOMPOSÉE. Partagés par la fusion et
    // par la défusion: les deux ramènent la matière d'un plan déjà écrit aux
    // seuls jours qu'on refait.
    const windowDayTokens = new Set<string>(windowDayOrder(startsOn, durationDays));
    const ladder = merge === null || mergedMember === null ? null : mergeLadder({
      table: platedMembers
        .filter((m) => m.memberId !== mergedMember.memberId)
        .map(servingDemandsFor),
      incoming: servingDemandsFor(mergedMember),
      // LES JOURS DE CUISSON, RAMENÉS À LA FENÊTRE FUSIONNÉE. Une session que
      // le plan tenait en dehors de ces jours-là ne dit rien de ce qu'on
      // recompose: la garder ferait croire à un jour partagé qui n'existe pas.
      householdCookingDays: merge.householdPlan.cookingDays.filter((d) =>
        windowDayTokens.has(d)
      ),
      personalCookingDays: merge.personalPlan.cookingDays.filter((d) =>
        windowDayTokens.has(d)
      ),
    });
    if (merge !== null && ladder !== null && mergedMember !== null) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.merge",
        user_id: userId,
        household_id: householdId,
        member_id: merge.member.member_id,
        shape: ladder.shape,
        reason: ladder.reason,
        conflicts: ladder.conflicts,
        window: [startsOn, durationDays],
        intersection: [
          merge.window.intersection.startsOn,
          merge.window.intersection.durationDays,
        ],
        pivot: merge.window.pivot,
        days_already_past: merge.window.daysAlreadyPast,
      }));
    }

    // ── LA MATIÈRE DE LA FUSION, CALCULÉE UNE FOIS ────────────────────────
    //
    // Elle sert à DEUX choses qui doivent voir exactement la même liste: le
    // bloc de consigne (`buildMergeBlock`, plus bas) et le BUDGET DE PLATS
    // (`dishBudgetFor`, dans le tronc). La calculer deux fois rouvrirait la
    // porte que ce lot ferme — annoncer un budget pour des plats qu'on ne
    // montre pas, ou montrer des plats hors budget.
    //
    // RAMENÉE À LA FENÊTRE FUSIONNÉE: un plat d'un jour que la fusion ne touche
    // pas ferait recomposer un jour que le plan personnel garde. Puis passée
    // par `mergeMaterialShown`, qui applique `MERGE_MATERIAL_CAP` — le budget
    // compte ce que le modèle VOIT, pas ce qu'on avait sous la main.
    const mergeMaterial = merge === null ? [] : mergeMaterialShown(
      merge.personalPlan.dishes.filter((d) =>
        d.day === null || windowDayTokens.has(d.day)
      ),
    );
    // CE QUE LE TRONC A BESOIN DE SAVOIR DE LA FUSION, et rien de plus: un
    // barreau et un nombre. Le tronc n'a pas à connaître un foyer.
    const mergeBudget: MergedEater | null = ladder === null ? null : {
      shape: ladder.shape,
      ownDishesShown: mergeMaterial.length,
    };

    // ── L5/D8 · LA MATIÈRE DE LA DÉFUSION — LE PLAN DE BASE ────────────────
    //
    // Les plats du plan du foyer VIVANT, ramenés à la fenêtre recomposée. C'est
    // ce que « rester au plus près du plan de base » désigne, et c'est ce qui
    // préserve les courses déjà faites: sans cette liste, la consigne dirait au
    // modèle de rester près d'un plan qu'il n'a jamais vu.
    //
    // ⚠️ LE BUDGET DE PLATS NE BOUGE PAS (`merge: null` plus bas). Une défusion
    // RETIRE une bouche: elle n'a aucune raison de demander un plat de plus, et
    // lui ouvrir le bonus de fusion ferait cuisiner un plat dédié à une
    // personne qu'on vient de sortir de la table.
    const unmergeMaterial = unmerge === null ? [] : mergeMaterialShown(
      unmerge.basePlan.dishes.filter((d) =>
        d.day === null || windowDayTokens.has(d.day)
      ),
    );

    // ── FF-027 · LE SIGNAL DE FAIM DE LA FENÊTRE ──────────────────────────
    //
    // LU SUR LE PROPRIÉTAIRE DU FOYER, comme le rythme, les absences et la
    // capacité de cuisine juste au-dessus: c'est sa ligne `student_goals` qui
    // gouverne la composition. La faim d'un autre membre n'a pas de chemin de
    // collecte aujourd'hui — le tap du soir et le plancher de conversation sont
    // tous deux individuels — et inventer une agrégation ici ferait grossir le
    // dîner de quatre personnes sur le signal d'une seule, sans que personne
    // puisse relire pourquoi.
    //
    // Best-effort: un hoquet compose comme avant cette fiche.
    let hungerSignal: HungerWindowSignal = {
      days: 0,
      recurrent: false,
      windowStart: todayDate,
      windowEnd: todayDate,
    };
    try {
      hungerSignal = countHungerDays(
        await loadHungerDays(admin, { userId, todayLocalDate: todayDate }),
        todayDate,
      );
    } catch (error) {
      console.warn(`[${FN_NAME}] hunger signal unavailable`, error);
    }
    const hungerSuffix = satietyUserSuffix(hungerSignal);
    if (hungerSuffix) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.satiety_priority",
        user_id: userId,
        hunger_days: hungerSignal.days,
        window: [hungerSignal.windowStart, hungerSignal.windowEnd],
      }));
    }

    // ── D4/L6 · CE QUE CHAQUE TITULAIRE A DIT DE SA BOUFFE ────────────────
    //
    // LE TROU QUE ÇA FERME, ET IL SE MESURE EN EUROS. La réconciliation des
    // préférences est paramétrée PAR UTILISATEUR depuis toujours, et cette
    // fonction ne l'appelait que pour le maître (le « troisième chemin » plus
    // haut).
    // Les préférences durables d'un conjoint, d'un colocataire, d'un enfant
    // majeur — tout ce qu'ils avaient CONFIRMÉ sur leur propre écran — ne sont
    // jamais arrivées dans l'assiette. Un siège payé dont le « about you »
    // n'atteint pas la casserole n'achète rien.
    //
    // ⚠️ `platedMembers`, PAS `members` NI `composedMembers`. Les deux filtres du
    // chantier se composent déjà en cascade (L3 puis L2): qui n'est pas à cette
    // table n'a pas à être lu — ni sa mémoire, ni son goût. Lire quelqu'un qui
    // mange son propre plan ferait pencher la casserole du foyer vers une bouche
    // qui n'y mange pas.
    //
    // ⚠️ UNE BOUCHE SANS COMPTE N'A RIEN À LIRE, et ce n'est pas un manque (D3):
    // pas de `student_goals`, pas de mémoire. Le `filter` sur `userId` est donc
    // la règle, pas une précaution.
    //
    // LE MAÎTRE PASSE SES CONTRAINTES DÉJÀ RÉCONCILIÉES (`pc`): sa ligne est lue
    // bien plus haut pour le rythme et la capacité, et la re-réconcilier ici
    // coûterait un second aller-retour vers `memory_items` pour un résultat
    // identique. `constraints` est REQUIS et nullable côté module, donc aucun
    // appelant ne peut l'oublier en silence.
    const voiceMembers: VoiceMember[] = platedMembers
      .filter((m) => m.userId)
      .map((m) => ({
        memberId: m.memberId,
        userId: m.userId as string,
        displayName: m.displayName,
        constraints: m.userId === userId
          ? ((pc ?? {}) as Record<string, unknown>)
          : null,
      }));
    const voices = await loadHouseholdVoices(admin, {
      members: voiceMembers,
      source: FN_NAME,
    });
    issues.push(...voices.issues);
    // LE COÛT, OBSERVABLE EN PRODUCTION. Même raison que le log des corps juste
    // au-dessus: ce lot fait passer la lecture de préférences de 1 à N par
    // génération, et un nombre qu'on ne journalise pas est un nombre que
    // personne ne verra doubler.
    console.log(JSON.stringify({
      tag: "keel.household_meal.member_voices",
      user_id: userId,
      household_id: householdId,
      accounts_at_table: voiceMembers.length,
      with_lines: voices.voices.length,
      // ⚠️ `lines_raw`, ET LE NOM EST LE SUJET. Ce nombre est celui des lignes
      // AVANT les deux gardes — il ne dit PAS ce que le modèle a vu, et il
      // s'appelait `lines`, ce qui laissait croire l'inverse. Ce que le modèle
      // a vu est compté après la construction du prompt
      // (`voiceCounts.linesUsed`), et journalisé juste après elle.
      lines_raw: voices.voices.reduce((n, v) => n + v.lines.length, 0),
      reads: voices.reads,
    }));

    // ── FF-038 · LE RÉFÉRENTIEL DE COMPOSITION ────────────────────────────
    // EN OMBRE: il ne change aucune assiette. Il sert à RECALCULER les grammes
    // que le modèle déclare, pour que la mesure du chantier porte sur des
    // chiffres que le produit a faits lui-même — l'arithmétique du modèle
    // n'est jamais une preuve (garantie 2 de `meal_generation.ts`).
    //
    // FAIL-OPEN NOMMÉ: une lecture en panne rend `null`, le parseur le COMPTE,
    // et la génération continue. L'instrumentation ne doit jamais coûter un
    // dîner à un élève — et l'échec est journalisé pour qu'un référentiel
    // indisponible en boucle ne ressemble pas à un modèle qui n'écrit pas ses
    // quantités.
    let composition: CompositionIndex | null = null;
    try {
      composition = await loadCompositionIndex(admin);
    } catch (error) {
      console.warn(`[${FN_NAME}] composition index unavailable`, error);
    }

    const { systemPrompt, userMessage } = buildMealPrompt({
      // ── FF-030 · LES CONTRAINTES DURES, ICI AUSSI ──────────────────────
      // Cette lane portait exactement le même trou que `generate-meal-v1`:
      // l'UNION des contraintes de tous les membres était chargée (et son
      // échec est BLOQUANT ici, ce qui est le bon arbitrage pour un foyer),
      // puis passée au seul `parseGeneratedMeal`. Le modèle composait le dîner
      // d'une tablée sans savoir qui y est allergique.
      //
      // C'est le paramètre REQUIS qui a rendu cet appelant visible: le
      // compilateur l'a listé. Optionnel, il aurait gardé son trou.
      // ── FF-051 · LES APPORTS FIXES NE SONT PAS ENCORE UNE DONNÉE DE FOYER
      // Le shaker d'un membre n'est pas celui de la table: il appartient au
      // canal des DELTAS (FF-043), que `DELTA_CHANNELS` ne porte pas encore.
      // Lire ici `practical_constraints` du seul titulaire ferait sauter le
      // petit-déjeuner de TOUTE la tablée parce qu'UNE personne prend un
      // shaker — un substitut à une dépendance manquante, exactement ce que
      // ce paramètre requis existe pour rendre visible.
      //
      // `[]` est donc le comportement d'AVANT, assumé et nommé. Le trou est
      // écrit en toutes lettres dans FF-051 §11 Q1.
      fixedIntakes: [],
      // ── FF-052 · LES PROPRIÉTÉS DE JOUR NE SONT PAS ENCORE UNE DONNÉE DE
      // FOYER. Le dimanche batch d'un membre n'est pas celui de la table, et
      // la question est la même que pour l'apport fixe juste au-dessus: le
      // canal des deltas ne la porte pas. `[]` est le comportement d'AVANT,
      // assumé et nommé (FF-052 §11 Q3).
      dayProperties: [],
      safetyConstraints: constraints,
      // ── TOUJOURS AUCUN CORPS *ICI*, ET C'EST TOUJOURS UNE DÉCISION ─────
      // (FF-030 R7, inchangé par le lot 3B.)
      //
      // Un repas de foyer nourrit plusieurs personnes. Il n'y a pas UN corps à
      // passer à la consigne de COMPOSITION, et prendre celui du titulaire
      // dimensionnerait l'assiette de tout le monde sur lui — un adulte de
      // 1,90 m ferait servir des portions d'adulte de 1,90 m à ses enfants.
      //
      // `null` plutôt qu'un corps moyen: une moyenne serait une personne qui
      // n'existe pas, présentée au modèle comme une mesure. Le nombre de parts
      // (`servings`, ci-dessous) reste la seule chose qu'on sait vraiment de
      // cette tablée.
      //
      // ⚠️ CE `null` NE VEUT PLUS DIRE « le foyer ignore les corps ». Depuis le
      // lot 3B ils entrent PAR MEMBRE, dans le brief de portions
      // (`buildPortionBrief`, greffé par `household.userSuffix` ci-dessous):
      // c'est la seule place où un corps s'adresse à UNE assiette et non au
      // plat commun. Le remplacer par un corps ici recréerait exactement le
      // défaut que ce commentaire décrit.
      body: null,
      // L'axe est une propriété de l'objectif d'UNE personne, pour la même
      // raison. Le foyer n'en a pas.
      focusAxis: null,
      doctrineBlock: doctrineBlockFor(doctrine),
      coachNoteBlock: coachNotePromptBlock(coachNote),
      protocolBlock,
      beliefKeys,
      goal: String(goalRow.goal ?? "health"),
      situation: goalRow.situation ? String(goalRow.situation) : null,
      context: String(body.context ?? "").trim().slice(0, 2000) || null,
      preferences: String(body.preferences ?? "").trim().slice(0, 2000) || null,
      mode: "to_shop",
      scope,
      slot: null,
      // LE NOMBRE DE PARTS EST CELUI DU FOYER, pas une entrée du client. Un
      // client qui enverrait 2 pour un foyer de quatre ferait cuisiner la
      // moitié du dîner, sans erreur.
      //
      // D14 — CE N'EST PLUS `members.length`, C'EST LE MOMENT LE PLUS PEUPLÉ.
      // `servings` est un SCALAIRE dans la consigne (« people at the table »)
      // et il dimensionne les COURSES; le détail par jour est écrit juste en
      // dessous, dans le bloc de présence. Le maximum plutôt qu'une moyenne:
      // une moyenne ferait manquer de quoi manger le jour où tout le monde est
      // là, le maximum fait au pire un reste. Sans absence déclarée, il vaut
      // exactement `members.length` — le comportement d'avant ce lot.
      servings: Math.min(12, Math.max(1, presence.servings)),
      pantry: [],
      todayToken,
      today: todayDate,
      country,
      daysToFill,
      eatingRhythm,
      awayDays,
      ...capacity,
      // ── D4/L6 · LE TRONC N'ENTEND PLUS PERSONNE SUR CETTE LANE ───────────
      //
      // `[]`, et ce n'est PAS une perte: les mots du maître n'ont pas disparu,
      // ils ont changé de bloc. Ils partent désormais dans le bloc DES VOIX
      // (`buildHouseholdPromptBlocks`, juste en dessous), sous son prénom, avec
      // ceux de tous les autres titulaires à cette table.
      //
      // POURQUOI DÉPLACER CE QUI MARCHAIT DÉJÀ. Le plafond par membre et la
      // garde de non-divulgation vivent dans `household_voices.ts`. Laisser le
      // maître passer par le tronc aurait fait DEUX chemins pour la même donnée,
      // dont un seul gardé — et le jour où quelqu'un aurait déplacé la garde,
      // rien n'aurait échoué. Il n'y a donc qu'une porte, et elle garde.
      //
      // ⚠️ CE `[]` NE VAUT QUE POUR LA LANE FOYER. `generate-meal-v1` continue
      // de passer `foodPreferencesForPrompt(pc)` au tronc: son plan n'a qu'un
      // titulaire et n'est lu par personne d'autre, donc ni le plafond par
      // membre ni la garde de table n'ont d'objet là-bas.
      foodPreferences: [],
      // ── L4/D6 · LA BOUCHE REPRISE ENTRE DANS LE BUDGET DE PLATS ────────
      //
      // MESURÉ LE 2026-08-12: sans elle, ce prompt annonçait « at most 15
      // dishes » et, quinze lignes plus bas, « give them a SECOND dish ». Deux
      // consignes contradictoires dans le même message. Le modèle a rendu
      // seize plats, le parseur a jeté le dernier — le DÎNER DU DIMANCHE DU
      // FOYER, pas le plat de la personne reprise.
      //
      // `null` sur une composition ordinaire: le plafond est alors celui
      // d'avant ce lot, au plat près, et un test le tient.
      merge: mergeBudget,
    });

    const household = buildHouseholdPromptBlocks({
      members: platedMembers,
      envyLine,
      restrictions,
      presence,
      merge: merge === null || ladder === null || mergedMember === null
        ? null
        : {
          displayName: mergedMember.displayName,
          window: { startsOn, durationDays },
          shape: ladder.shape,
          // LA MÊME LISTE QUE CELLE QUI A OUVERT LE BUDGET, et c'est le point:
          // elle est calculée une seule fois, plus haut (`mergeMaterial`).
          dishes: mergeMaterial,
        },
      // L5/D8 — LA DÉFUSION. `unmergedName` est lu sur le ROSTER et non sur
      // `platedMembers`: la personne vient précisément d'être retirée de cette
      // liste, donc l'y chercher rendrait toujours `undefined` et la consigne
      // dirait « sans undefined ».
      unmerge: unmerge === null ? null : {
        displayName: String(unmerge.member.first_name ?? "").trim() || "Member",
        window: { startsOn, durationDays },
        dishes: unmergeMaterial,
      },
      // D4/L6 — LES LIGNES BRUTES. Le plafond par membre et la garde de
      // non-divulgation sont appliqués DANS `buildHouseholdPromptBlocks`, pas
      // ici: filtrer de ce côté-ci ferait une garde qu'un appelant applique,
      // c'est-à-dire une garde que le prochain appelant oublie.
      voices: voices.voices,
    });
    // CE QUI A ÉTÉ COUPÉ, DANS LES `issues` DU PLAN. Une troncature muette est
    // un mensonge sur ce que le modèle a vu — et « pourquoi ce plan ignore-t-il
    // ce que j'ai dit ? » n'a aucune réponse trois jours plus tard sans ça.
    issues.push(...household.voiceIssues);
    // ── CE QUE LE MODÈLE VA VOIR, EN CLAIR ────────────────────────────────
    // `generated_from` porte les mêmes nombres, mais il n'est écrit QUE si la
    // génération aboutit: un 422 `empty_meal` ou un échec modèle laissait la
    // question sans réponse. Ce log-ci part avant l'appel, donc toujours.
    console.log(JSON.stringify({
      tag: "keel.household_meal.voices_used",
      user_id: userId,
      household_id: householdId,
      heard: household.voicesHeard,
      ...household.voiceCounts,
    }));

    // ══ L7/D11 — LA RÉCLAMATION. LA DERNIÈRE CHOSE AVANT L'ARGENT ═══════════
    //
    // ⚠️ C'EST ICI QU'EST LA GARDE, ET NULLE PART AILLEURS. Le refus rapide
    // posé plus haut est une politesse; celui-ci est le plafond. L'incrément et
    // la condition sont le MÊME énoncé SQL (`insert … on conflict do update …
    // where used < limit`), donc deux fusions lancées en même temps ne peuvent
    // pas passer toutes les deux: la seconde attend le verrou de ligne, relit
    // la version validée, et n'écrit rien. Mesuré à deux connexions le
    // 2026-08-12 — la seconde a bloqué 2,9 s puis refusé.
    //
    // POURQUOI ICI ET PAS DANS LA BRANCHE `merge`, 1 200 LIGNES PLUS HAUT.
    // Entre les deux il y a huit portes qui rendent encore (`no_coach`,
    // `doctrine_unreadable`, `local_day_unresolved`…) et AUCUN appel modèle.
    // Réclamer là-haut ferait payer une unité de quota à un foyer qui n'a même
    // pas de doctrine publiée — un plafond qui se consomme sans rien produire.
    // Ici, il ne reste plus rien entre la réclamation et la dépense.
    //
    // CE QUI EST COMPTÉ, ET CE QUI NE L'EST PAS — la question de D11, tranchée:
    //   · UNE FUSION qui atteint le modèle: comptée. C'est le geste du maître,
    //     et c'est ce qui coûte 20 à 67 secondes de génération.
    //   · LA DÉFUSION (`operation: "unmerge"`): JAMAIS. Elle répare une fusion;
    //     taxer la réparation ferait payer deux fois une erreur, et D8 offre la
    //     défusion précisément comme une SORTIE. C'est structurel: ce bloc vit
    //     sous `merge !== null`.
    //   · LA REPRISE COLLANTE (une composition qui re-reprend d'office
    //     quelqu'un déjà fusionné, L5): JAMAIS. Ce n'est pas un geste du
    //     maître — la compter lui facturerait une décision qu'il n'a pas prise.
    //     Structurel aussi: `compose` ne passe pas ici.
    //   · UN REFUS AVANT LE MODÈLE (les onze de L4, le gel, le plafond
    //     lui-même): rien. Il n'a rien coûté.
    //   · UN ÉCHEC APRÈS LE MODÈLE (`meal_unparseable`, `empty_meal`,
    //     `house_rule_violated`): COMPTÉ, et c'est la décision la moins
    //     confortable du lot. Le plafond borne un COÛT, et le coût est déjà
    //     payé quand ces refus tombent. Une remise demanderait un
    //     décrément à ne jamais oublier sur six sites de retour — un oubli
    //     facture, un doublon offre des fusions, et aucun test honnête ne
    //     distingue les deux. Retour arrière: une RPC de relâche, et ces six
    //     sites.
    //
    // FAIL-OPEN SI LA RÉCLAMATION ÉCHOUE (erreur de transport, pas refus). Même
    // sens que la lecture de facturation: une panne de comptage ne doit pas
    // couper un foyer qui paie. Le fait est journalisé et rendu dans `issues`,
    // parce qu'une garde muette ressemble trait pour trait à une garde qui ne
    // mord jamais.
    let mergeQuota: MergeQuotaState | null = null;
    if (merge !== null) {
      const claim = await admin.rpc("keel_household_claim_merge_quota", {
        p_household: householdId,
        p_local_date: todayDate,
        p_member: merge.member.member_id,
      });
      if (claim.error) {
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error: claim.error,
          metadata: { source: "merge_quota_claim", household: householdId },
        });
        issues.push("merge_quota_unreadable");
      } else {
        const claimed = claim.data as Record<string, unknown> | null;
        if (claimed?.ok === true) {
          // ⚠️ `exhausted` N'EST PAS FORCÉ. La réclamation ne rend pas cette
          // clé, et le parseur la déduit de `used >= limit`: la fusion qui
          // prend la DERNIÈRE place doit se lire comme telle. L'écrire
          // `false` ici serait un mensonge tranquille dans une trace.
          mergeQuota = parseMergeQuota(claimed);
        } else if (claimed?.reason === MERGE_QUOTA_EXHAUSTED) {
          // LA COURSE PERDUE. Le refus rapide plus haut avait vu de la place;
          // une autre fusion l'a prise entre-temps. Le mot est le même, le
          // statut aussi — et le modèle n'a toujours pas été appelé.
          // `ok: true` FORCÉ, et lui seul: le refus porte les mêmes nombres
          // que l'état, mais sous `ok: false`. `exhausted` reste DÉDUIT.
          const state = parseMergeQuota({ ...claimed, ok: true });
          console.log(JSON.stringify({
            tag: "keel.household_meal.merge_quota_exhausted",
            user_id: userId,
            household_id: householdId,
            member_id: merge.member.member_id,
            used: state?.used ?? null,
            limit: state?.limit ?? null,
            week_start: state?.weekStart ?? null,
            stage: "claim",
          }));
          return jsonResponse(req, {
            error: MERGE_QUOTA_EXHAUSTED,
            detail: mergeQuotaRefusalDetail(state),
            merge_quota: state === null ? null : {
              used: state.used,
              limit: state.limit,
              remaining: state.remaining,
              week_start: state.weekStart,
              resets_on: state.resetsOn,
            },
            request_id: requestId,
          }, { status: 429, skipErrorLog: true });
        } else {
          // Un refus NOMMÉ mais inattendu (`local_date_required`,
          // `household_required`) est un défaut de ce fichier, pas du foyer:
          // on le journalise et on laisse passer. Le taire ferait un plafond
          // qui ne compte plus rien sans que personne ne l'apprenne.
          issues.push(`merge_quota_unclaimed:${String(claimed?.reason ?? "unknown")}`);
        }
      }
    }

    const result = await generateWithGemini(
      systemPrompt + household.systemSuffix,
      // FF-027 AVANT les règles de maison, et l'ordre est le sujet: le bloc de
      // `household_meal_generation.ts` doit rester le DERNIER, parce que c'est
      // lui qui doit survivre à une envie contradictoire. La satiété est une
      // priorité de composition, pas une règle de maison.
      userMessage + hungerSuffix + household.userSuffix,
      0.6,
      true,
      [],
      "auto",
      { source: FN_NAME, requestId, userId },
    );
    if (typeof result !== "string") {
      return jsonResponse(req, {
        error: "model_returned_tool_call",
        request_id: requestId,
      }, { status: 502 });
    }

    // Hissés en `const` pour la même raison que sur la lane individuelle: la
    // relance FF-037 doit repasser par EXACTEMENT les mêmes verrous, et deux
    // objets d'arguments écrits à la main divergent au premier paramètre
    // ajouté.
    const parseArgs = {
      doctrine: doctrine.doctrine,
      safetyConstraints: constraints,
      // FF-051 — la MÊME valeur que la consigne, et pour la même raison
      // qu'elle est vide: voir le bloc au-dessus de `buildMealPrompt`.
      fixedIntakes: [],
      dayProperties: [],
      mode: "to_shop",
      scope,
      pantry: [],
      beliefKeys,
      eatingRhythm,
      daysToFill,
      awayDays,
      cookingTimeMin: capacity.cookingTimeMin,
      // FF-038 — LE RÉFÉRENTIEL DE COMPOSITION.
      // Chargé plus haut dans un try/catch: `null` quand la lecture a
      // échoué. L'instrumentation ne doit jamais coûter un dîner, et le
      // parseur compte l'indisponibilité nommément plutôt que de la
      // laisser ressembler à un modèle qui n'écrit pas ses quantités.
      composition,
      // L4/D6 — LA MÊME VALEUR QUE LA CONSIGNE, et les DEUX BOUTS: elle ouvre
      // le budget de plats annoncé plus haut, et elle autorise la préparation
      // d'UNE portion que les barreaux ② et ③ demandent. Passer `null` ici
      // pendant que la consigne dit ② ferait exactement ce que le run réel a
      // mesuré: le plat dédié parsé, puis jeté, et son titre resté nu en base.
      merge: mergeBudget,
    } as const;

    let meal;
    try {
      meal = parseGeneratedMeal(result, parseArgs);
    } catch (error) {
      return jsonResponse(req, {
        error: "meal_unparseable",
        detail: error instanceof Error ? error.message : String(error),
        request_id: requestId,
      }, { status: 502 });
    }

    // ── FF-037 · LA MÊME RELANCE, ET C'EST DÉLIBÉRÉ ───────────────────────
    // L'ancre protéique est une propriété de l'ASSIETTE, pas de la personne:
    // rien en elle ne dépend d'un corps, d'un objectif ni d'un plancher — ce
    // qui est précisément la raison pour laquelle `body` et `focusAxis` sont
    // `null` sur cette lane et que l'ancre, elle, y survit. Ne pas la relancer
    // ici ferait des foyers la seule population à qui le produit livre des
    // dîners sans protéine, sans qu'aucune décision ne l'ait dit.
    //
    // Les règles de maison et les envies (`household.userSuffix`) sont
    // rejouées telles quelles: une relance qui les perdrait rendrait un dîner
    // qui contredit ce que le foyer a écrit.
    let proteinAnchorRetry = false;
    const anchorMissingBefore = meal.protein_anchor_missing.length;
    if (anchorMissingBefore > 0) {
      const retryInstruction = proteinAnchorRetryInstruction(meal.protein_anchor_missing);
      try {
        const retryResult = await generateWithGemini(
          systemPrompt + household.systemSuffix,
          `${userMessage}${hungerSuffix}${household.userSuffix}\n\n${retryInstruction}`,
          0.6,
          true,
          [],
          "auto",
          { source: `${FN_NAME}.protein_anchor_retry`, requestId, userId },
        );
        if (typeof retryResult === "string") {
          const retried = parseGeneratedMeal(retryResult, parseArgs);
          if (
            retried.dishes.length >= meal.dishes.length &&
            retried.protein_anchor_missing.length < anchorMissingBefore
          ) {
            meal = retried;
            proteinAnchorRetry = true;
          }
        }
      } catch (error) {
        console.warn(`[${FN_NAME}] protein anchor retry failed`, error);
      }
      console.log(JSON.stringify({
        tag: "keel.household_meal.protein_anchor",
        user_id: userId,
        missing_before: anchorMissingBefore,
        missing_after: meal.protein_anchor_missing.length,
        retried: proteinAnchorRetry,
      }));
    }

    // ── D6 · LE BARREAU DEMANDÉ EST-IL DANS LE PLAN RENDU ? ───────────────
    //
    // ⚠️ MESURÉ SUR UNE FUSION SUR DEUX LE 2026-08-12. Barreau ③ demandé, et
    // le modèle a rendu quinze plats, aucun second plat, aucune session dédiée,
    // en servant la personne depuis la casserole commune (« Serve a larger
    // portion of the protein and starch »). L'archive disait
    // `separate_sessions`, le plan disait le contraire, et les deux étaient
    // dans la MÊME ligne — parce que rien ne comparait l'un à l'autre.
    //
    // ON CONSTATE, ON NE CORRIGE PAS. Refuser le plan ou relancer le modèle
    // serait un choix de produit que personne n'a pris; un plan servi depuis la
    // casserole commune reste mangeable, il est seulement moins juste que
    // promis. L'`issue` est nommée, et `generated_from` porte désormais la
    // forme DEMANDÉE à côté de la forme OBTENUE.
    //
    // APRÈS LA RELANCE D'ANCRE, exprès: c'est le plan qu'on va ÉCRIRE qu'on
    // observe, pas un intermédiaire que la relance a peut-être remplacé.
    const mergeShape = ladder === null ? null : observeMergeShape({
      shape: ladder.shape,
      dishes: meal.dishes,
      preparations: meal.preparations,
    });
    if (mergeShape !== null && !mergeShape.honoured) {
      issues.push(`${MERGE_SHAPE_NOT_HONOURED}:${mergeShape.requested}`);
      console.log(JSON.stringify({
        tag: "keel.household_meal.merge_shape_not_honoured",
        user_id: userId,
        household_id: householdId,
        member_id: merge?.member.member_id ?? null,
        requested: mergeShape.requested,
        observed: mergeShape.observed,
        dishes: meal.dishes.length,
        preparations: meal.preparations.length,
      }));
    }

    if (meal.dishes.length === 0) {
      return jsonResponse(req, {
        error: "empty_meal",
        lock: meal.lock.reason,
        issues: [...issues, ...meal.issues],
        request_id: requestId,
      }, { status: 422 });
    }

    // ── LE VERROU DES RÈGLES DE MAISON ──────────────────────────────────
    //
    // AJOUTÉ APRÈS UN RUN RÉEL, pas par précaution. Le prompt interdit déjà de
    // commenter une règle de maison, en toutes lettres; le premier run réel a
    // produit un plat parfaitement conforme justifié par « …avec une sauce
    // protéinée, SANS NUTELLA », c'est-à-dire une phrase qui annonce à
    // l'enfant que sa demande a été refusée et l'attribue au plan plutôt qu'à
    // son parent. Une consigne de prompt régresse en réel; le verrou est
    // déterministe.
    // LES LIBELLÉS VIENNENT DU SPLIT, pas de `restrictions.map(...)`. La
    // différence n'est pas cosmétique: c'est la seule ligne du fichier qui
    // décide ce que ce verrou a le droit de taire, et la faire passer par
    // `householdHardConstraints` est ce qui rend structurellement impossible
    // qu'une allergie y entre un jour par distraction.
    const lock = applyHouseRuleLock(
      mealDishesPayload(meal),
      householdSplit.houseRuleLabels,
    );
    if (lock.violations.length > 0) {
      // SERVIR l'aliment exclu est autre chose que le nommer: là, le fond est
      // faux. On n'écrit rien.
      return jsonResponse(req, {
        error: "house_rule_violated",
        detail: lock.violations,
        request_id: requestId,
      }, { status: 422 });
    }
    const dishes = lock.dishes;
    for (const s of lock.scrubbed) issues.push(`house_rule_commented:${s}`);

    // ── LES PORTIONS, RÉCONCILIÉES AVEC LE FOYER RÉEL ───────────────────
    // `platedMembers`, PAS `members`: la boucle de réconciliation réattribue
    // une portion standard à toute bouche que le modèle a omise
    // (`portion_missing:<id>`). Lui passer la liste complète annulerait donc le
    // bon comportement du modèle s'il avait, lui, compris l'absence.
    const { portions, issues: portionIssues } = reconcilePortions(
      platedMembers,
      extractMemberPortions(result),
    );

    // ── L5/D8 · TOUTES LES REPRISES QUE CE PLAN PORTE ─────────────────────
    //
    // La fusion du jour, s'il y en a une, PUIS celles qu'on reporte. L'ordre
    // n'est pas décoratif: la première entrée est le geste qui a produit cette
    // ligne, les suivantes sont l'héritage — et une trace où les deux se
    // mélangeraient ne dirait plus lequel des deux a coûté un appel modèle.
    //
    // ⚠️ CETTE LISTE EST CE QUE LA PROCHAINE COMPOSITION RELIRA. Une entrée
    // oubliée ici, c'est une personne ré-exclue au tour suivant sans que
    // personne n'ait rien demandé — le trou n°2 de L4, décalé d'un tour.
    const mergedFromAll: MergedFromEntry[] = [
      ...(merge === null || ladder === null ? [] : [
        mergedFromEntry({
          memberId: merge.member.member_id,
          userId: merge.member.user_id,
          plan: {
            id: merge.personalPlan.id,
            startsOn: merge.personalPlan.startsOn,
            durationDays: merge.personalPlan.durationDays,
            validatedAt: merge.personalPlan.validatedAt,
          },
          window: { startsOn, durationDays },
        }),
      ]),
      ...carryMergedFrom({
        mergedFrom: priorMergedFrom,
        heldMemberIds: stickyReclaimed,
        window: { startsOn, durationDays },
      }),
    ];

    // ── L'ÉCRITURE: LA MÊME RPC QUE LE CHEMIN INDIVIDUEL ────────────────
    // `intent` et `replaces` sont validés TOUT EN HAUT, avant le modèle — ils
    // ne dépendent que du corps de la requête. Les relire ici en ferait deux
    // sources qui divergeraient au premier ajustement.
    const { data: writtenRows, error: writeErr } = await admin.rpc(
      "write_student_meal_plan",
      {
        p_user_id: userId,
        p_intent: intent,
        p_starts_on: startsOn,
        p_duration_days: durationDays,
        p_replaces: replaces,
        p_payload: {
          mode: "to_shop",
          meal_slot: null,
          // D14 — CE QUI A ÉTÉ CUISINÉ, donc le même nombre que celui donné au
          // modèle. `members.length` décrivait le foyer; ce champ décrit une
          // CASSEROLE, et une casserole ne sait pas qui est parti en camp.
          servings: Math.min(12, Math.max(1, presence.servings)),
          context: String(body.context ?? "").trim().slice(0, 2000) || null,
          preferences: String(body.preferences ?? "").trim().slice(0, 2000) || null,
          pantry: [],
          dishes,
          preparations: mealPreparationsPayload(meal),
          cooking_sessions: mealSessionsPayload(meal),
          shopping_list: mealShoppingPayload(meal),
          content_locale: String(goalRow.content_locale ?? "en"),
          household_id: householdId,
          // LA NATURE EST EXIGÉE DÈS QU'IL Y A UN FOYER (lot 3, 2026-08-11).
          // `write_student_meal_plan` refuse `plan_kind_required` sans elle: un
          // plan commun rangé comme personnel écraserait la fenêtre du plan
          // perso du maître au lieu de vivre à côté.
          plan_kind: "household",
          member_portions: memberPortionsPayload(portions),
          // FF-043 — LES ADD-ONS, EN GRAMMES D'ALIMENT.
          //
          // ⚠️ NE SORTENT JAMAIS: la raison d'un delta, l'objectif d'un
          // membre, un différentiel lisible, toute mention de corps ou de
          // flag. Ce payload porte un aliment et des grammes, comme n'importe
          // quelle ligne de recette — et il n'y a AUCUNE prose à assainir.
          // `member_deltas` NE PART PLUS ICI (2026-08-12). La clé était envoyée
          // à `write_student_meal_plan`, qui ne la nomme jamais, vers une
          // colonne qui n'existe pas: un chemin d'écriture structurellement
          // mort, et un appelant qui se croyait écrivain. Les deltas restent
          // dans la RÉPONSE HTTP plus bas — leur seule destination réelle
          // aujourd'hui. Leur persistance appartient à FF-043, dont la
          // conception n'est pas finie: l'y ajouter serait décider à sa place.
          generated_from: {
            coach_id: doctrine.coachId,
            doctrine_version: doctrine.doctrine?.version ?? null,
            doctrine_reason: doctrine.reason,
            belief_keys: beliefKeys,
            goal: String(goalRow.goal ?? "health"),
            // DEUX AXES: le tronc partagé, puis la lane foyer. Les lignes
            // écrites avant le 2026-08-12 portent `+household` tout court —
            // c'est la v1 implicite. Voir HOUSEHOLD_PROMPT_VERSION.
            prompt_version:
              `${MEAL_PROMPT_VERSION}+household.${HOUSEHOLD_PROMPT_VERSION}`,
            intent,
            // FF-037 — même trace que sur la lane individuelle. La mesure du
            // §10 se lit sur les deux lanes ou sur aucune: un chiffre calculé
            // sur la moitié de la population est un chiffre faux.
            protein_anchor_retry: proteinAnchorRetry,
            protein_anchor_missing: meal.protein_anchor_missing,
            household: {
              id: householdId,
              member_count: members.length,
              // TROIS COMPTES, PAS UN. « combien de mineurs » ne suffit plus a
              // relire une composition: une bouche dont l'age est INCONNU recoit
              // la meme part standard qu'un mineur, pour une raison toute
              // differente. Sans `unknown_age_count`, « pourquoi Marc a-t-il eu
              // une part standard ? » n'a pas de reponse trois jours plus tard.
              minor_count: members.filter((m) => m.ageState === "minor").length,
              unknown_age_count:
                members.filter((m) => m.ageState === "unknown").length,
              accountless_count: members.filter((m) => !m.userId).length,
              // LA LIGNE D'ENVIES A-T-ELLE ÉTÉ LUE, ET POUR QUELLE SEMAINE.
              // Sans ça, « pourquoi ce plan ignore-t-il ce que j'ai demandé ? »
              // n'a pas de réponse trois jours plus tard: on ne saurait pas
              // distinguer « rien n'a été écrit » de « la demande a été lue et
              // arbitrée ». (`spoken`/`silent` sont partis avec le conseil de
              // famille au lot 5: un décompte de silencieux se lit « il en
              // reste 3 à relancer ».)
              envy_line_used: household.envyLineUsed,
              envy_week: envyWeek,
              restriction_count: restrictions.length,
              // ── D4 · QUI A ÉTÉ ENTENDU, ET CE QUI A ÉTÉ COUPÉ ───────────
              // `accounts_at_table` dit combien de titulaires POUVAIENT parler;
              // `heard` combien ont vraiment eu une ligne dans le prompt;
              // `lines_in`/`lines_used`/`withheld`/`over_cap` où sont passées
              // les LIGNES. Sans ça, « son about-you n'a servi à rien » et « il
              // n'avait rien confirmé » laissent la même trace — et c'est
              // exactement la question que D4 existe pour trancher.
              //
              // ⚠️ LES NOMBRES VIENNENT DU MODULE, PAS DES `issues`, ET C'EST
              // UNE CORRECTION MESURÉE. Ils étaient dérivés en comptant des
              // CHAÎNES: une ligne retenue par la garde sur trois formes de
              // surface rendait `withheld: 3`, et deux lignes tombées au
              // plafond rendaient `over_cap: 1` (une seule `issue`, qui portait
              // `:2` dans son texte). Les deux nombres du même objet étaient
              // gonflé et dégonflé, en sens inverses. Un compteur dérivé d'un
              // format de trace ment dès que le format bouge.
              //
              // ⚠️ `lines_used` EST LE NOMBRE QUI MANQUAIT. `heard` compte des
              // MEMBRES, et le log `member_voices` compte les lignes BRUTES,
              // avant toute garde: aucune trace ne disait combien de lignes le
              // modèle avait réellement vues, qui est pourtant la seule
              // question pour relire une composition.
              //
              // ÉCRIT MÊME À ZÉRO, exprès: une clé absente ne se distingue pas
              // d'un lot débranché, et ce dépôt paie en boucle la garde
              // construite puis silencieusement débranchée.
              voices: {
                accounts_at_table: voiceMembers.length,
                heard: household.voicesHeard,
                lines_in: household.voiceCounts.linesIn,
                lines_used: household.voiceCounts.linesUsed,
                withheld: household.voiceCounts.linesWithheld,
                over_cap: household.voiceCounts.linesOverCap,
                // PAR BOUCHE, parce que c'est bon marché (un objet de quatre
                // entiers par titulaire qui a parlé) et parce que c'est la
                // maille de la question: « pourquoi le plan ignore-t-il ce que
                // MOI j'ai dit ? ». Il porte les bouches dont TOUT est tombé —
                // `heard` ne les porte pas.
                per_member: household.voiceCounts.perMember,
              },
              // ── D14 · QUI A ÉTÉ COMPTÉ ABSENT, ET PAR QUI ──────────────
              // Sans ce bloc, une absence marquée par erreur est SILENCIEUSE:
              // il manque une assiette, et personne — ni le maître, ni la
              // personne concernée, ni nous — ne peut dire pourquoi. C'est la
              // moitié relisible de l'arbitrage B: puisque DEUX sources
              // peuvent retirer quelqu'un de la table, il faut pouvoir dire
              // laquelle l'a fait.
              //
              // `members` ne porte QUE les bouches qui manquent au moins une
              // fois: une trace où tout le monde figure avec des tableaux
              // vides ne se lit plus, et le cas nominal (personne n'est
              // absent) doit rester un objet vide.
              presence: {
                members: presence.trace,
                deserted: presence.householdAway,
                servings: presence.servings,
              },
              // ── D2 · D7 · QUI A PRIS LA MAIN, ET AVEC QUEL PLAN ────────
              // Sans ce bloc, le maître voit qu'il cuisine pour un de moins et
              // n'a AUCUN moyen de savoir pourquoi: ni l'écran, ni le plan, ni
              // nous ne pourraient dire si quelqu'un a été retiré, par quelle
              // règle, ni sur la foi de quel plan. C'est le pendant exact de la
              // trace de présence juste au-dessus — la même raison, une autre
              // cause.
              //
              // `partial` N'EST PAS DU DÉCOR: il porte ceux dont le plan MORD
              // sur la fenêtre sans la recouvrir, et qui restent donc composés.
              // C'est la seule preuve relisible que l'arbitrage « recouvrement
              // TOTAL » a été appliqué et pas oublié — sans elle, un plan
              // partiel et l'absence de plan laissent la même trace. C'est
              // aussi ce que L4 lira pour savoir qu'il y a une intersection à
              // fusionner (D15).
              //
              // ÉCRIT MÊME VIDE, exprès: une clé absente ne se distingue pas
              // d'un lot débranché, et ce dépôt paie en boucle la garde
              // construite puis silencieusement débranchée.
              hand: {
                taken: handOff.taken,
                partial: handOff.partial,
                // L4 — QUI A ÉTÉ REPRIS. Absent de `taken` comme quelqu'un qui
                // n'a jamais rien validé: sans cette liste, les deux cas
                // laissent la même trace.
                reclaimed: handOff.reclaimed,
                // L5/D8 — QUI A ÉTÉ SORTI DE LA TABLE PAR UNE DÉFUSION, et
                // surtout: son plan à lui couvrait-il tous ces jours-là.
                // « Le maître l'a retiré » et « il n'a rien à manger jeudi »
                // sont deux faits différents, et le second ne se déduit pas du
                // premier.
                unmerged: handOff.unmerged,
              },
              // ── D6 · D15 · D16 — LA FUSION, RELISIBLE ────────────────────
              //
              // ⚠️ SANS CE BLOC, L'AVERTISSEMENT DE D8 EST INCALCULABLE. L5
              // doit pouvoir dire « le plan de X a été fusionné le … ; il vient
              // d'en valider un NOUVEAU » — c'est-à-dire comparer la
              // `validated_at` archivée ici à celle que porte la ligne
              // aujourd'hui. Un id de plan ne suffit pas: c'est une comparaison
              // de DATES.
              //
              // ÉCRIT QUAND CE PLAN PORTE AU MOINS UNE REPRISE, contrairement
              // à `hand` juste au-dessus. La raison de la différence: `hand`
              // décrit une décision prise à CHAQUE composition (« qui a pris la
              // main »), dont l'absence de résultat est un fait; `merge` décrit
              // des GESTES du maître, et l'écrire vide sur une composition
              // ordinaire ferait croire à une fusion jamais demandée.
              //
              // ⚠️ « AU MOINS UNE REPRISE » ET PAS « UNE FUSION AUJOURD'HUI »
              // (L5). Une composition ordinaire qui RE-REPREND quelqu'un doit
              // écrire ce qu'elle a repris, sinon la chaîne casse au tour
              // suivant: le plan neuf remplace le vivant, donc sa provenance
              // aussi, et la composition d'après ré-excluerait tout le monde
              // sans que personne n'ait rien demandé. Le GESTE du jour, lui,
              // reste dans les clés qui suivent `merged_from`, et elles sont
              // absentes quand ce plan ne fait que reporter.
              // ── L5/D8 — LA DÉFUSION, RELISIBLE ───────────────────────────
              //
              // ⚠️ SANS CE BLOC, « pourquoi ce plan ne contient-il plus rien
              // pour Zoé ? » n'a pas de réponse trois jours plus tard. La
              // trace de `hand.unmerged` dit QUI a été sorti; celle-ci dit
              // DEPUIS QUEL PLAN, et sur quels jours — c'est-à-dire ce à quoi
              // la consigne « rester au plus près du plan de base » se
              // référait. Sans `base_plan_id`, l'arbitrage « le plan de base
              // est le plan VIVANT, pas celui d'avant la fusion » n'est pas
              // vérifiable après coup, et les lignes écrites avant et après un
              // changement d'avis seraient indiscernables.
              ...(unmerge === null ? {} : {
                unmerge: {
                  member_id: unmerge.member.member_id,
                  user_id: unmerge.member.user_id,
                  base_plan_id: unmerge.basePlan.id,
                  base_plan_starts_on: unmerge.basePlan.startsOn,
                  base_plan_duration_days: unmerge.basePlan.durationDays,
                  base_dishes_shown: unmergeMaterial.length,
                  pivot: unmerge.window.pivot,
                  days_already_past: unmerge.window.daysAlreadyPast,
                },
              }),
              ...(mergedFromAll.length === 0 ? {} : {
                merge: {
                  merged_from: mergedFromAll,
                  // ── CE QUI SUIT DÉCRIT LE GESTE DU JOUR, ET RIEN D'AUTRE ──
                  // Absent quand ce plan ne fait que REPORTER des reprises
                  // antérieures: il n'a alors ni barreau, ni intersection, ni
                  // pivot — les écrire recopierait la décision d'un autre plan
                  // sur celui-ci, et personne ne saurait plus quel geste a
                  // vraiment eu lieu quel jour.
                  ...(merge === null || ladder === null ? {} : {
                  // LE PLAN DU FOYER DANS LEQUEL ON A REPRIS. C'est l'autre
                  // moitié de « fusionner A avec B »; sans lui, la trace ne dit
                  // que la moitié de ce qui a été mélangé.
                  into_plan_id: merge.householdPlan.id,
                  // D6 — LE BARREAU, ET POURQUOI CELUI-LÀ.
                  shape: ladder.shape,
                  reason: ladder.reason,
                  conflicts: ladder.conflicts,
                  shared_cooking_days: ladder.sharedCookingDays,
                  // ── LA FORME DEMANDÉE ET LA FORME OBTENUE, CÔTE À CÔTE ──
                  //
                  // ⚠️ SANS `observed`, `shape` SE LIT COMME UN FAIT ALORS QUE
                  // C'EST UNE DEMANDE. Le run du 2026-08-12 a écrit
                  // `separate_sessions` sur un plan servi depuis la casserole
                  // commune: l'archive et le plan se contredisaient dans la
                  // même ligne, et rien ne permettait de le voir après coup.
                  //
                  // ÉCRIT MÊME QUAND C'EST HONORÉ: une clé absente ne se
                  // distingue pas d'un lot débranché, et ce dépôt paie en
                  // boucle la garde construite puis silencieusement débranchée.
                  ...(mergeShape === null ? {} : {
                    honoured: {
                      requested: mergeShape.requested,
                      observed: mergeShape.observed,
                      marks: mergeShape.marks,
                      ok: mergeShape.honoured,
                    },
                  }),
                  // D15 — CE QUE LES DEUX FENÊTRES PARTAGEAIENT.
                  intersection: {
                    starts_on: merge.window.intersection.startsOn,
                    duration_days: merge.window.intersection.durationDays,
                  },
                  // D16 — OÙ ON A COUPÉ, ET COMBIEN DE JOURS SONT TOMBÉS.
                  pivot: merge.window.pivot,
                  days_already_past: merge.window.daysAlreadyPast,
                  other_overlapping_plan_ids: merge.otherOverlappingPlanIds,
                  // ── L7/D11 — L'UNITÉ DE QUOTA QUE CE PLAN A CONSOMMÉE ──
                  //
                  // Le compteur, lui, n'abrège pas: il dit « 4 sur 5 » et rien
                  // de plus. Cette ligne-ci est la seule qui rattache une
                  // fusion PRÉCISE à l'unité qu'elle a prise — sans elle,
                  // « pourquoi ma semaine est-elle pleine ? » n'a de réponse
                  // qu'en recoupant des horodatages. `null` si la réclamation
                  // a échoué (fail-open, tracé dans `issues`).
                  quota: mergeQuota === null ? null : {
                    used: mergeQuota.used,
                    limit: mergeQuota.limit,
                    week_start: mergeQuota.weekStart,
                  },
                  }),
                },
              }),
            },
            issues: [...issues, ...meal.issues, ...portionIssues],
            // FF-027 — la provenance de l'adaptation, archivée avec la
            // composition (voir `hungerSignalProvenance`). Le décompte est
            // archivé ici; il n'est pas entré dans le prompt.
            ...hungerSignalProvenance(hungerSignal),
          },
        },
      },
    );
    if (writeErr) {
      return jsonResponse(req, {
        error: "plan_not_written",
        detail: writeErr.message,
        request_id: requestId,
      }, { status: 409 });
    }
    const writtenRow = (Array.isArray(writtenRows) ? writtenRows[0] : writtenRows) as
      | { meal_id: string; retired_plan_id: string | null }
      | null;

    return jsonResponse(req, {
      ok: true,
      meal: writtenRow ? { id: writtenRow.meal_id } : null,
      window: { starts_on: startsOn, duration_days: durationDays },
      household: {
        id: householdId,
        // `kind` a disparu avec la colocation (lot 2). L'ecran ne le lisait que
        // pour choisir un libelle; le retirer de la reponse evite qu'un client
        // continue de brancher dessus une distinction qui n'existe plus.
        member_count: members.length,
        // `spoken`/`silent` sont partis avec le conseil de famille (lot 5).
        // Rien ne les remplace DANS LA RÉPONSE: l'écran n'a plus rien à rendre
        // sur qui a parlé, et rendre `envy_line_used` inviterait à réafficher
        // « personne n'a rien demandé cette semaine » — c'est-à-dire à
        // remettre le reproche de silence que ce lot retire.
      },
      dishes,
      preparations: mealPreparationsPayload(meal),
      cooking_sessions: mealSessionsPayload(meal),
      shopping_list: mealShoppingPayload(meal),
      member_portions: memberPortionsPayload(portions),
      member_deltas: memberDeltasPayload(resolution.deltas),
      // ── L4 — CE QUE LA FUSION A FAIT, DANS LA RÉPONSE ────────────────────
      // Rendu parce que l'appelant ne peut le déduire de RIEN d'autre: la
      // fenêtre fusionnée n'est pas celle qu'il a demandée (il n'en demande
      // pas), le barreau est une décision du moteur, et « 2 jours déjà passés »
      // est exactement la phrase que D16 met dans la proposition. Le recalculer
      // côté écran ferait un second avis sur des dates.
      ...(merge === null || ladder === null ? {} : {
        merge: {
          member_id: merge.member.member_id,
          plan_id: merge.personalPlan.id,
          into_plan_id: merge.householdPlan.id,
          shape: ladder.shape,
          reason: ladder.reason,
          conflicts: ladder.conflicts,
          window: { starts_on: startsOn, duration_days: durationDays },
          intersection: {
            starts_on: merge.window.intersection.startsOn,
            duration_days: merge.window.intersection.durationDays,
          },
          pivot: merge.window.pivot,
          days_already_past: merge.window.daysAlreadyPast,
        },
      }),
      // ── L5/D8 — CE QUE LA DÉFUSION A FAIT, DANS LA RÉPONSE ───────────────
      // Même raison que pour la fusion: l'appelant ne peut le déduire de rien
      // d'autre. Il n'a pas demandé cette fenêtre — elle est la QUEUE du plan
      // de base — et « le plan de Zoé ne couvrait pas tous ces jours » est
      // exactement ce que l'écran doit pouvoir dire avant de laisser le maître
      // fermer la fenêtre.
      ...(unmerge === null ? {} : {
        unmerge: {
          member_id: unmerge.member.member_id,
          base_plan_id: unmerge.basePlan.id,
          window: { starts_on: startsOn, duration_days: durationDays },
          pivot: unmerge.window.pivot,
          days_already_past: unmerge.window.daysAlreadyPast,
          covers_window:
            handOff.unmerged.find((u) => u.member_id === unmerge!.member.member_id)
              ?.covers_window ?? false,
        },
      }),
      // ── L5 — LES REPRISES QUE CE PLAN PORTE, TOUTES ──────────────────────
      // Rendu sur les TROIS opérations, y compris une composition ordinaire:
      // c'est la seule façon pour l'écran de dire « ce plan cuisine aussi pour
      // Tom, que vous aviez repris » sans relire `generated_from`.
      merged_members: mergedFromAll.map((e) => e.member_id),
      issues: [...issues, ...meal.issues, ...portionIssues],
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
