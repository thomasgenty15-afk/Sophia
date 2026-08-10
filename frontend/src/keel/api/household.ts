// KEEL — LE FOYER, côté écran: décisions pures d'un côté, appels de l'autre.
// Même partage que `coachSeat.ts` et `coachBroadcast.ts`.
//
// Autorité produit: docs/keel/PIVOT-FOYER.md §8.5, « les deux autorités ».
//
// ── CE QUI A DISPARU ICI LE 2026-08-10 (lots 1 et 2) ────────────────────────
// `restrictionBlock` anticipait le refus de la base pour griser un bouton, et
// `canSeeGoalOf` décidait si l'objectif d'un autre était affichable. Les deux
// dépendaient de règles qui n'existent plus: le consentement du majeur (le
// compte maître gouverne, et la contrepartie est que QUI a posé la règle reste
// affiché) et le mode colocation (sorti du produit).
//
// `isMinorBirthDate` part aussi. L'âge est DÉRIVÉ EN BASE, à trois états, et
// une seconde définition côté navigateur divergerait au premier ajustement —
// après quoi personne ne saurait laquelle ment.

import { supabase } from "../../lib/supabase";

export type HouseholdRole = "owner" | "member";
/** Jumeau de `keel_household_member_age` en base et de `household.ts` côté edge. */
export type MemberAgeState = "minor" | "adult" | "unknown";

/** ⚠️ COPIES DE CONFORT. L'autorité est la CHECK correspondante en base. */
export const HOUSEHOLD_NAME_MAX = 80;
export const RESTRICTION_LABEL_MAX = 120;
export const ENVY_MAX_CHARS = 500;

export interface HouseholdMemberView {
  /** L'identité d'une bouche. Ne change pas le jour où elle réclame son profil. */
  memberId: string;
  /** `null` = pas de compte. C'est le cas NOMINAL d'un enfant. */
  userId: string | null;
  displayName: string;
  role: HouseholdRole;
  ageState: MemberAgeState;
  /** Six jetons, ou `null` = part standard. */
  goal: string | null;
}

export interface HouseholdView {
  id: string;
  name: string;
  members: HouseholdMemberView[];
  /** Moi, retrouvé dans `members` PAR MON COMPTE. Jamais recalculé par l'écran. */
  me: HouseholdMemberView | null;
}

export interface RestrictionView {
  id: string;
  memberId: string;
  label: string;
  createdByUserId: string;
}

// ───────────────────────────────────────────────────────────────────────────
// LES DÉCISIONS PURES
// ───────────────────────────────────────────────────────────────────────────

/**
 * Ce que la personne restreinte doit lire.
 *
 * §8.5 règle 3 et 4: elle voit QU'ELLE l'est et PAR QUI, et la phrase attribue
 * la décision au foyer — jamais à une raison de santé. Rendre un identifiant
 * de libellé plutôt qu'une phrase: la traduction appartient à `en.ts`, et une
 * phrase écrite ici serait dans une seule langue (leçon
 * `optout-confirmation-hardcoded-french`).
 */
export type RestrictionNotice =
  | { kind: "set_by_owner"; ownerName: string }
  | { kind: "set_by_me" };

export function restrictionNotice(
  household: HouseholdView | null,
  restriction: RestrictionView,
): RestrictionNotice {
  const me = household?.me?.userId;
  if (me && restriction.createdByUserId === me) return { kind: "set_by_me" };
  const owner = household?.members.find((m) => m.userId === restriction.createdByUserId);
  return { kind: "set_by_owner", ownerName: owner?.displayName ?? "" };
}

/** Qui a parlé cette semaine — pour la carte du conseil de famille. */
export interface EnvyRoundView {
  spoken: string[];
  silent: string[];
}

export function envyRound(
  household: HouseholdView | null,
  submissions: ReadonlyArray<{ userId: string }>,
): EnvyRoundView {
  const said = new Set(submissions.map((s) => s.userId));
  const spoken: string[] = [];
  const silent: string[] = [];
  for (const m of household?.members ?? []) {
    // UNE BOUCHE SANS COMPTE NE PEUT PAS PARLER, et ne compte donc ni dans les
    // silencieux ni dans ceux qui ont parlé: la faire figurer comme « n'a rien
    // dit » reprocherait un silence à quelqu'un qui n'a pas de voix.
    if (!m.userId) continue;
    (said.has(m.userId) ? spoken : silent).push(m.userId);
  }
  return { spoken, silent };
}

// ───────────────────────────────────────────────────────────────────────────
// LES APPELS
// ───────────────────────────────────────────────────────────────────────────

interface RpcResult {
  ok: boolean;
  reason: string;
  [key: string]: unknown;
}

function asResult(data: unknown): RpcResult {
  const row = (data ?? {}) as Record<string, unknown>;
  return { ...row, ok: row.ok === true, reason: String(row.reason ?? "") };
}

/**
 * LE FOYER ET SES MEMBRES.
 *
 * ── POURQUOI UNE RPC POUR LA LISTE ET PAS UN SELECT SUR `profiles` ────────
 * DÉFAUT VU AU NAVIGATEUR: la première rédaction lisait `profiles` avec un
 * `.in(ids)`. RLS sur `profiles` ne laisse lire QUE sa propre ligne — tous les
 * autres membres s'affichaient donc « — », sans nom ni étiquette « enfant »,
 * sans la moindre erreur. Un foyer à un seul habitant.
 *
 * Et on ne peut PAS ouvrir `profiles` par une policy: une policy RLS ne
 * restreint pas les COLONNES, donc la rendre lisible aux co-membres livrerait
 * téléphone, e-mail et identifiant Stripe pour afficher un prénom.
 * `keel_household_roster` rend quatre champs choisis un par un.
 */
export async function loadHousehold(myUserId: string): Promise<HouseholdView | null> {
  const { data: hh, error: hhErr } = await supabase
    .from("households").select("id, name").maybeSingle();
  if (hhErr) throw new Error(hhErr.message);
  if (!hh) return null;

  const { data: rows, error: rosterErr } = await supabase.rpc("keel_household_roster");
  if (rosterErr) throw new Error(rosterErr.message);

  const members: HouseholdMemberView[] = (rows ?? []).map((raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const age = String(r.age_state ?? "");
    return {
      memberId: String(r.member_id ?? ""),
      userId: typeof r.user_id === "string" && r.user_id ? r.user_id : null,
      // Un prénom vide rend le libellé de l'écran, JAMAIS l'e-mail en repli:
      // ça divulguerait une adresse à tout le foyer.
      displayName: String(r.first_name ?? "").trim() || "—",
      role: (String(r.role) === "owner" ? "owner" : "member") as HouseholdRole,
      // DÉRIVÉ EN BASE, à trois états. La date de naissance ne traverse jamais
      // le réseau: le foyer a besoin de savoir qu'il y a un enfant à table, pas
      // de sa date. Une valeur hors vocabulaire vaut `unknown`, jamais
      // `adult` — c'est la direction sûre, la même qu'en base.
      ageState: (age === "minor" || age === "adult" ? age : "unknown") as MemberAgeState,
      goal: typeof r.goal === "string" && r.goal ? r.goal : null,
    };
  }).filter((m: HouseholdMemberView) => m.memberId);

  const row = hh as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    members,
    // PAR LE COMPTE, et c'est le seul endroit où `userId` sert à identifier:
    // celui qui regarde l'écran en a forcément un.
    me: members.find((m) => m.userId && m.userId === myUserId) ?? null,
  };
}

export async function loadRestrictions(): Promise<RestrictionView[]> {
  const { data, error } = await supabase
    .from("household_food_restrictions")
    .select("id, member_id, label, created_by");
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      memberId: String(r.member_id),
      label: String(r.label ?? ""),
      createdByUserId: String(r.created_by),
    };
  });
}

export async function createHousehold(name: string) {
  const { data, error } = await supabase.rpc("keel_household_create", { p_name: name });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * AJOUTER UNE BOUCHE — sans compte, sans invitation, sans attendre personne.
 *
 * C'est le geste que tout le chantier existe pour permettre. `birthDate` est
 * FACULTATIVE (le flux ne se bloque pas) mais tant qu'elle manque, la personne
 * reçoit une part standard: l'objectif ne s'applique qu'à un âge connu.
 */
export async function addHouseholdMember(
  firstName: string,
  birthDate: string | null,
  goal: string | null,
) {
  const { data, error } = await supabase.rpc("keel_household_add_member", {
    p_first_name: firstName,
    p_birth_date: birthDate,
    p_goal: goal,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function removeHouseholdMember(memberId: string) {
  const { data, error } = await supabase.rpc("keel_household_remove_member", {
    p_member: memberId,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * DEUX ÉCRIVAINS, UN SEUL CHAMP. Le compte maître pose l'objectif de n'importe
 * quelle bouche; une personne qui a réclamé son profil pose le SIEN, et rien
 * d'autre. La base tranche (`not_your_line`), l'écran ne fait que demander.
 */
export async function setMemberGoal(memberId: string, goal: string | null) {
  const { data, error } = await supabase.rpc("keel_household_set_member_goal", {
    p_member: memberId,
    p_goal: goal,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function inviteToHousehold(email: string) {
  const { data, error } = await supabase.rpc("keel_household_invite", { p_email: email });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function joinHousehold(token: string) {
  const { data, error } = await supabase.rpc("keel_household_join", { p_token: token });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function addRestriction(memberId: string, label: string) {
  const { data, error } = await supabase.rpc("keel_household_add_restriction", {
    p_member: memberId,
    p_label: label,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function removeRestriction(id: string) {
  const { data, error } = await supabase.rpc("keel_household_remove_restriction", { p_id: id });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function submitEnvy(weekStart: string, body: string) {
  const { data, error } = await supabase.rpc("keel_household_submit_envy", {
    p_week_start: weekStart,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function loadEnvies(weekStart: string) {
  const { data, error } = await supabase
    .from("household_envy_submissions")
    .select("user_id, body")
    .eq("week_start", weekStart);
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    // ⚠️ UN IDENTIFIANT DE COMPTE, ET C'EST CORRECT ICI: seule une personne
    // qui a un compte peut avoir soumis une envie. La table entière change de
    // forme au lot 5 (une ligne écrite par le maître remplace la récolte).
    return { userId: String(r.user_id), body: String(r.body ?? "") };
  });
}

export interface HouseholdMealResult {
  ok: boolean;
  mealId: string | null;
  spoken: string[];
  silent: string[];
  issues: string[];
}

export async function generateHouseholdMeal(args: {
  window: { kind: "until_sunday" } | { kind: "days"; count: number };
  intent?: "replace_current" | "prepare_next";
  replaces?: string | null;
  context?: string | null;
}): Promise<HouseholdMealResult> {
  const { data, error } = await supabase.functions.invoke("generate-household-meal-v1", {
    body: {
      window: args.window,
      intent: args.intent ?? "replace_current",
      replaces: args.replaces ?? null,
      context: args.context ?? null,
    },
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const hh = (row.household ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    mealId: ((row.meal ?? null) as Record<string, unknown> | null)?.id as string ?? null,
    spoken: Array.isArray(hh.spoken) ? hh.spoken.map(String) : [],
    silent: Array.isArray(hh.silent) ? hh.silent.map(String) : [],
    issues: Array.isArray(row.issues) ? row.issues.map(String) : [],
  };
}

export interface MemberPortionView {
  memberId: string;
  displayName: string;
  /** `null` = part standard. L'écran rend son propre libellé. */
  portionNote: string | null;
  shares: Array<{ preparationId: string; note: string }>;
}

export interface HouseholdMealView {
  mealId: string;
  startsOn: string;
  durationDays: number;
  portions: MemberPortionView[];
}

/**
 * LA COMPOSITION VIVANTE DU FOYER, s'il y en a une.
 *
 * ── POURQUOI ELLE SE LIT ICI ET PAS SUR `/app/plan` ───────────────────────
 * `/app/plan` montre les PLATS et les courses — ce qu'on cuisine. Les portions
 * par membre sont l'objet du FOYER: « qui met quoi dans son assiette ». Les
 * mettre sur le plan obligerait le chemin individuel, qui est le majoritaire
 * (l'entrée du produit est à 1, §5), à porter un bloc vide en permanence.
 *
 * `retired_at is null` et `ends_on >= today`: la même définition de « vivant »
 * que `following_io.ts`. Une composition remplacée ou périmée ne décrit plus ce
 * qu'on mange ce soir.
 */
export async function loadHouseholdMeal(today: string): Promise<HouseholdMealView | null> {
  const { data, error } = await supabase
    .from("student_generated_meals")
    .select("id, starts_on, duration_days, member_portions")
    .not("household_id", "is", null)
    .is("retired_at", null)
    .gte("ends_on", today)
    .order("starts_on", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const raw = Array.isArray(row.member_portions) ? row.member_portions : [];
  return {
    mealId: String(row.id),
    startsOn: String(row.starts_on ?? ""),
    durationDays: Number(row.duration_days) || 1,
    portions: raw.map((entry) => {
      const p = (entry ?? {}) as Record<string, unknown>;
      const shares = Array.isArray(p.preparation_shares) ? p.preparation_shares : [];
      return {
        memberId: String(p.member_id ?? ""),
        displayName: String(p.display_name ?? ""),
        portionNote: typeof p.portion_note === "string" && p.portion_note.trim()
          ? p.portion_note
          : null,
        shares: shares.map((s) => {
          const share = (s ?? {}) as Record<string, unknown>;
          return {
            preparationId: String(share.preparation_id ?? ""),
            note: String(share.note ?? ""),
          };
        }).filter((s) => s.preparationId && s.note),
      };
    }).filter((p) => p.memberId),
  };
}
