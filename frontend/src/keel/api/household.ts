// KEEL — LE FOYER, côté écran: décisions pures d'un côté, appels de l'autre.
// Même partage que `coachSeat.ts` et `coachBroadcast.ts`.
//
// Autorité produit: docs/keel/PIVOT-FOYER.md §8.5, « les deux autorités ».
//
// ── LA DÉCISION QUI MÉRITE UN TEST ──────────────────────────────────────────
// `restrictionBlock` répond à « puis-je poser une restriction sur cette
// personne, et sinon POURQUOI ». Le motif est le sujet: la RPC en rend déjà un,
// mais l'écran doit pouvoir désactiver le bouton AVANT le clic et dire pourquoi
// — un bouton actif sur une action que la base refuse, c'est un utilisateur qui
// clique et ne comprend pas.
//
// ── LE MOTIF EST DUPLIQUÉ, ET C'EST ASSUMÉ ──────────────────────────────────
// La règle vit en base (`keel_household_add_restriction`), qui reste la seule
// AUTORITÉ: cette copie ne fait qu'anticiper le refus pour l'afficher. Elle ne
// peut donc pas ouvrir une porte que la base ferme — au pire elle grise un
// bouton que la base aurait accepté, ce qui est la direction inoffensive.

import { supabase } from "../../lib/supabase";

export type HouseholdKind = "family" | "shared";
export type HouseholdRole = "owner" | "member";

/** ⚠️ COPIES DE CONFORT. L'autorité est la CHECK correspondante en base. */
export const HOUSEHOLD_NAME_MAX = 80;
export const RESTRICTION_LABEL_MAX = 120;
export const ENVY_MAX_CHARS = 500;

export interface HouseholdMemberView {
  userId: string;
  displayName: string;
  role: HouseholdRole;
  isMinor: boolean;
  /** `null` = ce majeur n'a pas accepté d'être restreint. */
  restrictionConsentAt: string | null;
}

export interface HouseholdView {
  id: string;
  kind: HouseholdKind;
  name: string;
  members: HouseholdMemberView[];
  /** Moi, retrouvé dans `members`. Jamais recalculé par l'écran. */
  me: HouseholdMemberView | null;
}

export interface RestrictionView {
  id: string;
  memberUserId: string;
  label: string;
  createdByUserId: string;
}

// ───────────────────────────────────────────────────────────────────────────
// LES DÉCISIONS PURES
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pourquoi le bouton « restreindre » est fermé — ou `null` quand il est ouvert.
 *
 * L'ORDRE VA DU PLUS STRUCTUREL AU PLUS CORRIGEABLE, comme `broadcastGate`:
 * dans une colocation, la réponse est non quels que soient les rôles et les
 * consentements, et dire d'abord « tu n'es pas le compte maître » enverrait
 * l'utilisateur chercher un pouvoir qui n'existe pas dans son foyer.
 */
export type RestrictionBlock =
  | "not_a_family"
  | "not_owner"
  | "self"
  | "adult_without_consent";

export function restrictionBlock(
  household: HouseholdView | null,
  target: HouseholdMemberView | null,
): RestrictionBlock | null {
  if (!household || !target || !household.me) return "not_owner";
  if (household.kind !== "family") return "not_a_family";
  if (household.me.role !== "owner") return "not_owner";
  if (household.me.userId === target.userId) return "self";
  if (target.isMinor) return null;
  if (!target.restrictionConsentAt) return "adult_without_consent";
  return null;
}

/**
 * L'objectif de cette personne est-il affichable à ce lecteur ?
 *
 * Jumeau de `goalVisibility` dans `_shared/keel/household.ts`. Qu'un parent
 * voie l'objectif d'un enfant de sept ans est normal; qu'un colocataire
 * apprenne que l'autre est en sèche parce qu'ils partagent des courses ne l'est
 * pas. La vraie protection n'est pas ici — `student_goals` n'a gagné aucune
 * policy de foyer — mais l'écran ne doit pas non plus le DEMANDER.
 */
export function canSeeGoalOf(
  household: HouseholdView | null,
  target: HouseholdMemberView,
): boolean {
  if (!household?.me) return false;
  if (household.me.userId === target.userId) return true;
  return household.kind === "family";
}

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

export async function loadHousehold(myUserId: string): Promise<HouseholdView | null> {
  const { data: hh, error: hhErr } = await supabase
    .from("households").select("id, kind, name").maybeSingle();
  if (hhErr) throw new Error(hhErr.message);
  if (!hh) return null;

  const { data: rows, error: memErr } = await supabase
    .from("household_members")
    .select("user_id, role, restriction_consent_at");
  if (memErr) throw new Error(memErr.message);

  const ids = (rows ?? []).map((r) => String((r as Record<string, unknown>).user_id));
  const { data: profiles, error: pErr } = await supabase
    .from("profiles").select("id, full_name, birth_date").in("id", ids);
  if (pErr) throw new Error(pErr.message);
  const byId = new Map(
    (profiles ?? []).map((p) => [String((p as Record<string, unknown>).id), p as Record<string, unknown>]),
  );

  const members: HouseholdMemberView[] = (rows ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const userId = String(r.user_id);
    const p = byId.get(userId) ?? {};
    return {
      userId,
      // Le prénom seul. Le nom complet d'un enfant n'a pas à s'afficher sur un
      // écran partagé par le foyer.
      displayName: String(p.full_name ?? "").trim().split(/\s+/)[0] || "—",
      role: (String(r.role) === "owner" ? "owner" : "member") as HouseholdRole,
      isMinor: isMinorBirthDate(p.birth_date),
      restrictionConsentAt: typeof r.restriction_consent_at === "string"
        ? r.restriction_consent_at
        : null,
    };
  });

  const row = hh as Record<string, unknown>;
  return {
    id: String(row.id),
    kind: String(row.kind) === "shared" ? "shared" : "family",
    name: String(row.name ?? ""),
    members,
    me: members.find((m) => m.userId === myUserId) ?? null,
  };
}

/**
 * L'ÂGE SE RELIT, IL NE SE FIGE PAS. Même règle que `keel_household_is_minor`
 * en base et `student_age.ts` côté serveur: une date ABSENTE ou aberrante vaut
 * MAJEUR, donc non restreignable sans accord. La direction est
 * contre-intuitive et c'est la sûre — voir l'en-tête de `household.ts`.
 */
export function isMinorBirthDate(raw: unknown, today: Date = new Date()): boolean {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const born = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return false;
  const eighteenth = new Date(born);
  eighteenth.setUTCFullYear(eighteenth.getUTCFullYear() + 18);
  return eighteenth.getTime() > today.getTime();
}

export async function loadRestrictions(): Promise<RestrictionView[]> {
  const { data, error } = await supabase
    .from("household_food_restrictions")
    .select("id, member_user_id, label, created_by");
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      memberUserId: String(r.member_user_id),
      label: String(r.label ?? ""),
      createdByUserId: String(r.created_by),
    };
  });
}

export async function createHousehold(name: string, kind: HouseholdKind) {
  const { data, error } = await supabase.rpc("keel_household_create", {
    p_name: name,
    p_kind: kind,
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

export async function addRestriction(memberUserId: string, label: string) {
  const { data, error } = await supabase.rpc("keel_household_add_restriction", {
    p_member: memberUserId,
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

/**
 * Le consentement se pose et se retire PAR SOI. Aucune de ces deux fonctions ne
 * prend d'identifiant, exactement comme les RPC: un paramètre serait la porte
 * par laquelle le compte maître consentirait à la place de l'autre.
 */
export async function grantRestrictionConsent() {
  const { data, error } = await supabase.rpc("keel_household_grant_consent");
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function revokeRestrictionConsent() {
  const { data, error } = await supabase.rpc("keel_household_revoke_consent");
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
