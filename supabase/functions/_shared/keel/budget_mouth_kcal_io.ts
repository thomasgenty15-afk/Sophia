// ═══════════════════════════════════════════════════════════════════════════
// KEEL · LE BESOIN DE CHAQUE BOUCHE, POUR LE PLANCHER DU BUDGET — 2026-09-25
// ═══════════════════════════════════════════════════════════════════════════
//
// Demandé: « le besoin calorique est déjà calculé par personne, pourquoi ne
// pas le prendre ». Le plancher du budget (`budget_floor.ts`) comptait chaque
// bouche comme une journée à 2 000 kcal; il prend maintenant le besoin que le
// moteur calcule.
//
// ── UN SEUL CHARGEUR, DEUX APPELANTS ──────────────────────────────────────
//   · `budget-rates-v1` — l'écran qui compose en reçoit le coût par jour de
//     chaque bouche, en ARGENT (`budgetDayRatesOf`). Aucun kcal ne traverse.
//   · `generate-household-meal-v1` — la porte qui décide si le budget entre
//     dans le prompt, avec le coût plafonné (`budgetGateDayRatesOf`).
// Les deux appellent `loadBudgetMouthKcal` avec les mêmes entrées: un second
// chargeur donnerait deux avis sur le besoin d'une personne, et c'est la porte
// du moteur qui retirerait en silence un budget que l'écran a proposé.
//
// ── LES SOURCES SONT CELLES DU MOTEUR ─────────────────────────────────────
// Le roster (`keel_household_roster_for`), le corps des comptes et leur
// plancher de restriction (`loadHouseholdMemberBodies`), la fiche saisie par
// le maître (`keel_household_bodies_for`), l'arbitrage entre les deux
// (`resolveMouth`), le rythme de perte ou de prise (ligne du foyer, puis
// « about you » du compte). Le chiffre est la cible du jour
// (`mouthTargetKcal`, le même calcul que le haut de Suivi), et l'entretien
// (`maintenanceKcalOf`) quand la cible est fermée — un plancher de
// restriction levé ferme l'objectif, pas le fait qu'on mange.
//
// ⛔ CE MODULE NE REND RIEN À UN ÉCRAN. Il rend des kcal à du code serveur;
// ce qui part vers le navigateur est converti en argent par l'appelant.
// ═══════════════════════════════════════════════════════════════════════════

import { loadHouseholdMemberBodies } from "./household_bodies.ts";
import { MEMBER_AGE_STATES, type MemberAgeState } from "./household.ts";
import type { MouthRestrictionState } from "./household_portions.ts";
import type { MouthBody } from "./meal_envelope.ts";
import { MEAL_BODY_GENDERS } from "./meal_body.ts";
import {
  type AnchorMouth,
  maintenanceKcalOf,
  mouthTargetKcal,
} from "./mouth_anchor.ts";
import { resolveMouth } from "./resolved_mouth.ts";
import {
  ACTIVITY_LEVELS,
  APPETITE_LEVELS,
  DAY_ACTIVITY_LEVELS,
  GOAL_TOKENS,
  type GoalToken,
  SPORT_FREQUENCIES,
} from "./tokens.ts";
import { scaleDirectionOf } from "./weight_pace.ts";

/** Une ligne de `keel_household_roster_for`, réduite à ce que le besoin lit. */
export interface BudgetRosterRow {
  member_id: string;
  user_id: string | null;
  age_state: string;
  goal: string | null;
}

// deno-lint-ignore no-explicit-any
type Db = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any };

function positive(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function inVocabulary<T extends string>(list: readonly T[], v: unknown): T | null {
  const s = String(v ?? "").trim();
  return (list as readonly string[]).includes(s) ? (s as T) : null;
}

/**
 * LA FICHE D'UNE BOUCHE, telle que `keel_household_bodies_for` la rend.
 *
 * Même lecture que le générateur fait de la même RPC: TOUT-OU-RIEN sur taille,
 * poids et sexe (les trois colonnes sont `not null` en base), et hors
 * vocabulaire ⇒ `null`, jamais un repli sur un cran.
 */
export function sheetBodyFromRow(row: Record<string, unknown>): MouthBody | null {
  const heightCm = positive(row.height_cm);
  const weightKg = positive(row.weight_kg);
  const rawGender = String(row.gender ?? "").trim();
  if (heightCm === null || weightKg === null || rawGender === "") return null;
  return {
    heightCm,
    weightKg,
    gender: inVocabulary(MEAL_BODY_GENDERS, rawGender),
    ageYears: positive(row.age_years),
    activityLevel: inVocabulary(ACTIVITY_LEVELS, row.activity_level),
    activityAxes: {
      day: inVocabulary(DAY_ACTIVITY_LEVELS, row.day_activity),
      sport: inVocabulary(SPORT_FREQUENCIES, row.sport_frequency),
      asked: row.activity_axes_asked === true,
    },
    appetite: inVocabulary(APPETITE_LEVELS, row.appetite),
  } as MouthBody;
}

/**
 * LE BESOIN D'UNE BOUCHE, EN KCAL/JOUR, ou `null` sans corps utilisable.
 *
 * PURE. La cible du jour d'abord (entretien ± l'écart de son objectif, avec
 * les portes de sécurité de `mouthTargetKcal`), l'entretien ensuite.
 */
export function budgetMouthKcalOf(args: {
  memberId: string;
  ageState: MemberAgeState;
  restriction: MouthRestrictionState;
  /** Le corps résolu, déjà passé au tout-ou-rien — `null` sinon. */
  body: MouthBody | null;
  goal: GoalToken | null;
  paceKgPerWeek: number | null;
}): number | null {
  const mouth: AnchorMouth = {
    memberId: args.memberId,
    ageState: args.ageState,
    restriction: args.restriction,
    body: args.body,
    direction: args.goal === null ? null : scaleDirectionOf(args.goal),
    paceKgPerWeek: args.paceKgPerWeek,
    declaredSlots: [],
    conditionRefs: [],
    portionIndex: null,
  };
  const target = mouthTargetKcal(mouth, "no_position").kcal;
  if (target !== null && Number.isFinite(target) && target > 0) return target;
  const upkeep = maintenanceKcalOf(mouth).kcal;
  return upkeep !== null && Number.isFinite(upkeep) && upkeep > 0 ? upkeep : null;
}

/**
 * LE BESOIN DE CHAQUE BOUCHE DU FOYER. Clé: `member_id`; absente = pas de
 * corps utilisable, et le plancher garde alors la journée de référence.
 *
 * @param todayLocalDate le jour local du COMPTE MAÎTRE, comme partout où le
 *   foyer lit un corps (`loadHouseholdMemberBodies`).
 */
export async function loadBudgetMouthKcal(
  db: Db,
  params: {
    householdId: string;
    roster: readonly BudgetRosterRow[];
    todayLocalDate: string;
  },
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (params.roster.length === 0) return out;

  const accountIds = params.roster
    .map((r) => r.user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const [bodies, sheetRes, linePaceRes, goalPaceRes] = await Promise.all([
    loadHouseholdMemberBodies(db, {
      members: params.roster.map((r) => ({ memberId: r.member_id, userId: r.user_id })),
      todayLocalDate: params.todayLocalDate,
    }),
    db.rpc("keel_household_bodies_for", { p_household: params.householdId }),
    db.from("household_members")
      .select("member_id, target_pace_kg_per_week")
      .eq("household_id", params.householdId),
    accountIds.length === 0 ? Promise.resolve({ data: [], error: null }) : db
      .from("student_goals")
      .select("user_id, target_pace_kg_per_week")
      .in("user_id", accountIds),
  ]);
  if (sheetRes.error) throw sheetRes.error;

  const sheets = new Map<string, MouthBody>();
  for (const row of (sheetRes.data ?? []) as Array<Record<string, unknown>>) {
    const memberId = String(row.member_id ?? "").trim();
    const body = memberId ? sheetBodyFromRow(row) : null;
    if (body !== null) sheets.set(memberId, body);
  }

  // Le rythme: la ligne du foyer, puis le compte — une valeur utilisable du
  // compte gagne, un `null` côté compte n'efface pas la ligne (même règle que
  // le générateur). Une lecture en échec laisse le rythme par défaut.
  const pace = new Map<string, number>();
  for (const row of (linePaceRes.data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.member_id ?? "").trim();
    const p = positive(row.target_pace_kg_per_week);
    if (id && p !== null) pace.set(id, p);
  }
  for (const row of (goalPaceRes.data ?? []) as Array<Record<string, unknown>>) {
    const member = params.roster.find((r) => r.user_id === String(row.user_id ?? ""));
    const p = positive(row.target_pace_kg_per_week);
    if (member && p !== null) pace.set(member.member_id, p);
  }

  for (const r of params.roster) {
    const memberId = String(r.member_id ?? "").trim();
    if (!memberId) continue;
    const resolved = resolveMouth({
      memberId,
      userId: r.user_id ?? null,
      personal: bodies.personalByMember.get(memberId) ?? null,
      sheet: sheets.get(memberId) ?? null,
    }).body;
    const body = resolved.heightCm === null || resolved.weightKg === null ||
        resolved.gender === null
      ? null
      : resolved;
    const context = bodies.byMember.get(memberId) ?? null;
    const restriction: MouthRestrictionState = r.user_id === null
      ? "no_account"
      : context === null || context.restrictionFlag === null
      ? "unreadable"
      : context.restrictionFlag
      ? "raised"
      : "clear";
    const kcal = budgetMouthKcalOf({
      memberId,
      ageState: inVocabulary(MEMBER_AGE_STATES, r.age_state) ?? "unknown",
      restriction,
      body,
      goal: inVocabulary(GOAL_TOKENS, r.goal),
      paceKgPerWeek: pace.get(memberId) ?? null,
    });
    if (kcal !== null) out.set(memberId, kcal);
  }
  return out;
}
