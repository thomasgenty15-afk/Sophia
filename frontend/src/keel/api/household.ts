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

/**
 * UNE ALLERGIE DE FOYER — et ce n'est PAS une `RestrictionView`.
 *
 * Deux tables, deux natures, et le type les sépare pour la même raison que la
 * base: `household_food_restrictions` est le POUVOIR DOMESTIQUE, dont le verrou
 * serveur EFFACE le « pourquoi » du plat; une allergie est MÉDICALE et rejoint
 * l'union de sécurité du générateur, fail-closed. Les fondre dans un seul type
 * ferait de la distinction une convention, c'est-à-dire quelque chose qu'un
 * écran peut oublier.
 */
export interface AllergyView {
  id: string;
  memberId: string;
  label: string;
  createdByUserId: string;
}

/** Les six jetons, dans l'ordre où l'écran les propose. Miroir du CHECK. */
export const MEMBER_GOALS = [
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "performance",
  "health",
  "maintenance",
] as const;
export type MemberGoal = (typeof MEMBER_GOALS)[number];

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

/**
 * LES BOUCHES QU'ON PEUT ENCORE INVITER À RÉCLAMER LEUR PROFIL (lot 6).
 *
 * Une seule règle, et c'est celle de la base: une ligne qui porte déjà un
 * compte n'a plus rien à réclamer (`already_claimed`). Proposer un choix que la
 * base refusera est une promesse qu'on ne tient pas — d'où ce filtre, ici et
 * pas dans le JSX, pour qu'il soit testable sans monter un écran.
 *
 * ⚠️ CE N'EST PAS « les gens sans e-mail »: le roster ne rend aucune adresse.
 * `userId === null` est l'état de la LIGNE, et c'est le seul fait disponible.
 */
export function claimableMembers(
  household: HouseholdView | null,
): HouseholdMemberView[] {
  return (household?.members ?? []).filter((m) => !m.userId);
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

/**
 * LE PRÉNOM SE CORRIGE — et ce n'est pas cosmétique.
 *
 * `household_turn_context.ts` filtre en silence toute portion dont le prénom
 * est vide, et le brief de portions le cite tel quel. `keel_household_create`
 * retombe sur « Me » quand `profiles.full_name` est vide: sans cette porte, le
 * compte maître part au modèle sous le nom « Me », définitivement.
 */
export async function setMemberName(memberId: string, firstName: string) {
  const { data, error } = await supabase.rpc("keel_household_set_member_name", {
    p_member: memberId,
    p_first_name: firstName,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * LA DATE DE NAISSANCE — séparée du prénom, et l'appelant doit le savoir.
 *
 * ⚠️ LE ROSTER NE REND JAMAIS LA DATE (le foyer doit savoir qu'il y a un enfant
 * à table, pas son âge exact). Un écran ne peut donc pas la préremplir, et une
 * RPC qui prendrait prénom+date recevrait `null` à chaque correction de prénom
 * — c'est-à-dire EFFACERAIT la date sans que personne ne l'ait demandé. D'où
 * deux portes, une par champ.
 *
 * `null` est légitime côté base (« je retire la date que j'avais mise ») et
 * remet l'âge à `unknown`, donc RETIRE la direction d'objectif.
 */
export async function setMemberBirthDate(memberId: string, birthDate: string | null) {
  const { data, error } = await supabase.rpc("keel_household_set_member_birth_date", {
    p_member: memberId,
    p_birth_date: birthDate,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * INVITER QUELQU'UN À RÉCLAMER UNE BOUCHE PRÉCISE (lot 6).
 *
 * ⚠️ `memberId` N'EST PAS UN CONFORT D'AFFICHAGE. L'invitation porte sa cible
 * parce que sinon la personne qui arrive CHOISIRAIT quelle bouche elle devient
 * — et un lien qui fuite deviendrait le droit de se déclarer n'importe qui du
 * foyer. La base l'exige (`keel_household_invite(text, uuid)`), l'écran demande
 * donc « qui invites-tu ? » avant de créer le lien.
 *
 * La réponse porte `first_name`: le maître invite plusieurs personnes dans la
 * même minute, et un jeton anonyme est un jeton envoyé à la mauvaise personne.
 */
export async function inviteToHousehold(email: string, memberId: string) {
  const { data, error } = await supabase.rpc("keel_household_invite", {
    p_email: email,
    p_member: memberId,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * CE QU'UN LIEN DIT AVANT TOUTE AUTHENTIFICATION.
 *
 * La personne qui ouvre le lien n'a le plus souvent aucun compte: elle ne peut
 * RIEN lire du foyer (toutes les policies passent par `keel_household_of`).
 * Sans cet aperçu, l'écran de réclamation demanderait de se connecter pour une
 * raison qu'il ne saurait pas nommer — et la personne devinerait l'adresse à
 * employer, alors que se tromper d'adresse coûte un compte inutile.
 *
 * Trois champs, et rien d'autre: le foyer, le prénom de la bouche, l'adresse
 * invitée. Tous déjà entre les mains de qui détient le lien.
 */
export interface HouseholdInvitationPreview {
  valid: boolean;
  reason: string;
  householdName: string;
  firstName: string;
  email: string;
}

export async function previewHouseholdInvitation(
  token: string,
): Promise<HouseholdInvitationPreview> {
  const { data, error } = await supabase.rpc("keel_household_preview_invitation", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    valid: row.valid === true,
    reason: String(row.reason ?? ""),
    householdName: String(row.household_name ?? ""),
    firstName: String(row.first_name ?? ""),
    email: String(row.email ?? ""),
  };
}

/**
 * RÉCLAMER SON PROFIL — attacher son compte à une ligne qui existe déjà.
 *
 * ⚠️ CE N'EST PLUS « rejoindre » au sens d'entrer dans le produit. `member_id`
 * ne change pas, `user_id` passe de NULL à une valeur, et les portions, les
 * contraintes, les allergies et l'objectif de cette bouche lui restent. Le
 * prénom saisi par le maître n'est PAS écrasé par `profiles.full_name`.
 *
 * Ce que la réclamation donne: lire le foyer, et poser SON objectif. Rien
 * d'autre — composer, ajouter, retirer et restreindre restent au compte maître,
 * et la base rend `not_owner` à qui essaie.
 */
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

/**
 * LES ALLERGIES DU FOYER — la table que le lot 4 ajoute, et le trou qu'elle
 * ferme.
 *
 * `student_safety_constraints` est clée sur `user_id`: une bouche sans compte
 * n'avait nulle part où porter son allergie, alors que l'écran la réclamait.
 * Ces lignes-ci rejoignent l'union de sécurité du générateur avec le MÊME
 * fail-closed — lecture impossible, aucune composition.
 */
export async function loadAllergies(): Promise<AllergyView[]> {
  const { data, error } = await supabase
    .from("household_member_allergies")
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

export async function addAllergy(memberId: string, label: string) {
  const { data, error } = await supabase.rpc("keel_household_add_allergy", {
    p_member: memberId,
    p_label: label,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

export async function removeAllergy(id: string) {
  const { data, error } = await supabase.rpc("keel_household_remove_allergy", { p_id: id });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * LA FALAISE QUE LE LOT 4 SUPPRIME.
 *
 * `generate-household-meal-v1` refuse de démarrer si le compte maître n'a pas
 * de ligne `student_goals` (`goal_required`, 409) — et jusqu'ici on se prenait
 * ce mur APRÈS avoir saisi trois personnes. Cette ligne ne dimensionne aucune
 * portion: elle porte la SITUATION, les contraintes pratiques et la langue,
 * c'est-à-dire ce qui gouverne la composition entière.
 *
 * @returns `true` si la ligne existe déjà.
 */
export async function hasOwnerGoalRow(userId: string): Promise<boolean> {
  // `.eq("user_id", …)` EXPLICITE, et pas seulement RLS: quelqu'un qui est à la
  // fois coach et mangeur lit aussi les lignes de ses élèves
  // (`student_goals_select_coach`), et une lecture non scopée lui rendrait la
  // ligne de l'un d'eux. Le dépôt a déjà payé ce défaut sur cette table.
  const { data, error } = await supabase
    .from("student_goals")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Écrit la ligne `student_goals` du compte maître SI ELLE N'EXISTE PAS.
 *
 * ⚠️ `ignoreDuplicates` N'EST PAS UNE PRÉCAUTION DE CONFORT. La table porte des
 * CHECK croisés (`target_weight_kg` n'est légal que sur trois objectifs,
 * `focus_axis` que sur deux): écraser `goal` sur une ligne existante ferait
 * échouer l'écriture chez exactement les gens qui ont déjà rempli une cible —
 * et personne ne l'aurait demandé depuis cet écran. Changer son objectif se
 * fait là où vivent ses cibles, sur `/app/plan`.
 *
 * @returns `true` si une ligne a VRAIMENT été écrite.
 */
export async function createOwnerGoalRow(userId: string, goal: MemberGoal): Promise<boolean> {
  const { data, error } = await supabase
    .from("student_goals")
    .upsert({
      user_id: userId,
      goal,
      // La langue DÉCLARÉE de l'app authentifiée (voir i18n/catalog.ts: la
      // vitrine est bilingue, le produit connecté est en anglais). Même valeur
      // que l'autre écrivain de cette colonne, `StudentWeekPlanPage`.
      content_locale: "en-GB",
    }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("user_id");
  if (error) throw new Error(error.message);
  return Boolean(data && data.length > 0);
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
