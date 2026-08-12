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
import {
  type AwayDay,
  DEFAULT_EATING_RHYTHM,
  type EatingOccasionSlot,
  parseAwayDays,
  parseEatingRhythm,
} from "./mealGeneration";
// ⚠️ LA GARDE D'ÉCRITURE D'UNE DATE DE NAISSANCE EST CELLE DU SERVEUR, IMPORTÉE
// TELLE QUELLE (D18, L9). Même geste que `groceryWaves.ts` et `coachProtocol.ts`
// avec leurs modules partagés: le front n'en écrit pas une seconde version, il
// lit la même. Voir `setOwnBirthDate`.
import {
  assessBirthDate,
  birthDateWritable,
} from "../../../../supabase/functions/_shared/keel/student_age.ts";
import {
  type HouseholdPlanTrace,
  readHouseholdPlanTrace,
} from "./householdPlanTrace";

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
  /**
   * CE QUE LE MAÎTRE A MARQUÉ (D14) — et c'est CELA que la grille modifie.
   *
   * ⚠️ NE PAS FUSIONNER LES DEUX CHAMPS AVANT DE LES RENDRE À LA GRILLE. Elle
   * réécrit ce qu'on lui donne: nourrie de l'union, elle RECOPIERAIT la
   * déclaration de la personne dans la colonne du maître, où elle survivrait
   * ensuite à sa rétractation. L'absence resterait alors marquée alors que son
   * auteur l'a retirée — et personne ne comprendrait d'où elle vient.
   */
  awayHousehold: AwayDay[];
  /**
   * CE QUE LA PERSONNE A DÉCLARÉ ELLE-MÊME, dans son « about you ». Toujours
   * vide pour une bouche sans compte. LECTURE SEULE ici: le maître la voit
   * (sinon il remarquerait la marque et pas le fait), il ne l'édite pas.
   */
  awaySelf: AwayDay[];
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
  /**
   * `null` = le compte de l'auteur a été EFFACÉ (purge RGPD). La règle, elle,
   * survit — l'effacer changerait le menu de quelqu'un en silence. C'est
   * l'attribution qui disparaît avec la personne, pas le fait.
   */
  createdByUserId: string | null;
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
  /** `null` = compte de l'auteur effacé. L'ALLERGIE, elle, ne s'efface jamais. */
  createdByUserId: string | null;
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
  const author = restriction.createdByUserId;
  if (me && author === me) return { kind: "set_by_me" };
  // ⚠️ `m.userId &&` N'EST PAS DÉFENSIF, C'EST LA GARDE. Depuis que
  // `created_by` peut être NULL (compte de l'auteur effacé), un `find` naïf
  // comparerait `null === null` et attribuerait la règle à la PREMIÈRE bouche
  // sans compte du foyer — c'est-à-dire, le plus souvent, à l'enfant qu'elle
  // restreint. Deux inconnues ne sont pas la même personne.
  const owner = author
    ? household?.members.find((m) => m.userId && m.userId === author)
    : undefined;
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

/**
 * OÙ VA UNE DATE DE NAISSANCE SAISIE SUR L'ÉCRAN DU FOYER (D18, L9) ?
 *
 * Deux colonnes existent, et depuis 20260812180000 elles n'ont plus le même
 * poids: pour une bouche AVEC COMPTE, `keel_household_member_age` lit
 * `profiles.birth_date` d'abord et ne retombe sur `household_members.birth_date`
 * qu'à défaut. Écrire ma propre date sur ma FICHE ferait donc un champ qui
 * enregistre et ne change rien dès que mon « about you » en porte une.
 *
 * La règle tient en une ligne, et elle est ICI plutôt que dans le JSX pour
 * qu'elle soit vérifiable sans monter un écran:
 *
 *   · MA ligne (j'ai un compte, et c'est le mien) → mon PROFIL
 *   · tout le reste → la fiche de foyer
 *
 * « Tout le reste » n'est pas un fourre-tout: c'est un enfant (aucun compte, la
 * fiche est sa seule source) ou un titulaire qui n'est jamais passé par son
 * écran (RLS m'interdit son profil, et le repli SQL fait compter ce que je
 * saisis). Les deux sont des cas nominaux, pas des restes.
 *
 * ⚠️ `meUserId: string` ET PAS `string | null`, ET C'EST LE TYPE QUI TIENT LA
 * GARDE. Une bouche sans compte porte `userId: null`; si l'appelant pouvait
 * passer `null` pour « personne n'est connecté », `null === null` renverrait
 * l'enfant du foyer écrire dans un profil. L'écran calcule `user?.id ?? ""` —
 * la chaîne vide n'est l'identité de personne, et aucune ligne ne la porte.
 * NE PAS élargir cette signature: aucun test ne pourrait attraper le retour de
 * ce cas, seul le type le rend impossible.
 */
export function birthDateDoor(
  member: { userId: string | null },
  meUserId: string,
): "own_profile" | "member_row" {
  return member.userId === meUserId ? "own_profile" : "member_row";
}

/*
 * ── `envyRound` A ÉTÉ RETIRÉE (lot 5, 2026-08-10) ──────────────────────────
 *
 * Elle séparait ceux qui avaient déposé une envie de ceux qui s'étaient tus,
 * et l'écran en rendait le décompte. Les deux sont partis avec le conseil de
 * famille: un compteur « 3 personnes n'ont rien dit » se lit « il en reste 3 à
 * relancer », quoi qu'en dise la copie à côté — donc il recréait exactement la
 * charge mentale que le produit promet de supprimer.
 *
 * Ne pas le remettre sous une autre forme (« 2/5 ont répondu », une pastille,
 * une relance). Les envies sont UNE ligne, écrite par le compte maître pour
 * tout le monde.
 */

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
/**
 * Les absences d'UNE source, lues dans la colonne que le roster étiquette.
 *
 * Jumeau de `parseMemberAway` côté moteur (`household_presence.ts`), et
 * volontairement écrit de la même façon: un filtre par clé, puis LE parseur.
 * Ce qui ne doit pas exister deux fois, c'est la fusion — et elle est faite en
 * base, par concaténation.
 *
 * EXPORTÉ POUR ÊTRE TESTÉ, et c'est le seul endroit du navigateur où une
 * absence change de main: si ce filtre laissait passer la déclaration de la
 * personne dans la vue « marqué par le maître », la grille la RECOPIERAIT dans
 * la colonne du foyer au premier enregistrement.
 */
export function awayFrom(raw: unknown, source: "self" | "household"): AwayDay[] {
  if (!Array.isArray(raw)) return [];
  return parseAwayDays(
    raw.filter((e) => {
      if (!e || typeof e !== "object" || Array.isArray(e)) return false;
      const value = (e as Record<string, unknown>).source;
      return String(value ?? "").trim().toLowerCase() === source;
    }),
  );
}

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
      // D14 — LA COLONNE PORTE LES DEUX SOURCES, ÉTIQUETÉES. On les sépare
      // ici, avec le MÊME parseur que le moteur (`parseAwayDays`) sur le
      // sous-tableau filtré: une seconde lecture de la forme divergerait, et
      // c'est la grille qui montrerait autre chose que ce avec quoi on compose.
      awayHousehold: awayFrom(r.away_days, "household"),
      awaySelf: awayFrom(r.away_days, "self"),
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
      // `null` quand le compte de l'auteur a été effacé. `String(null)` rendrait
      // la chaîne « null », qui ne vaut aucun `userId` mais n'est pas non plus
      // une absence — et l'écran ne saurait plus laquelle des deux il lit.
      createdByUserId: r.created_by == null ? null : String(r.created_by),
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

/**
 * MON FOYER EST-IL EN PAUSE ? (chantier 3, D4)
 *
 * ── POURQUOI L'ÉCRAN DEMANDE, AU LIEU D'ATTENDRE LE REFUS ─────────────────
 * `supabase.functions.invoke` ne rend PAS le corps d'une réponse non-2xx: il
 * rend « Edge Function returned a non-2xx status code ». Le refus nommé de
 * `generate-household-meal-v1` (`household_frozen`, 402) arriverait donc à
 * l'écran comme une panne générique — et « un refus muet se lit comme une
 * panne » est exactement ce que ce chantier existe pour éviter. L'écran
 * demande donc son état, et le serveur refuse quand même: la garde est en
 * base, ceci n'est que la phrase.
 *
 * ── AUCUNE RÈGLE ICI ──────────────────────────────────────────────────────
 * `keel_household_my_coverage` est une dérivation de
 * `keel_household_is_covered`, la définition unique du dépôt. L'écran ne lit
 * NI `free_until` NI `subscriptions`: une seconde définition côté navigateur
 * afficherait « en pause » à quelqu'un qui compose très bien, ou l'inverse.
 *
 * En cas d'échec de lecture on rend `frozen: false` — ne pas savoir n'est pas
 * une raison d'annoncer une pause à quelqu'un qui paie.
 */
export interface HouseholdCoverage {
  inHousehold: boolean;
  frozen: boolean;
  /** Le dernier jour couvert par l'essai, ou `null` (aucun essai posé). */
  freeUntil: string | null;
}

export async function loadMyHouseholdCoverage(): Promise<HouseholdCoverage> {
  const open: HouseholdCoverage = {
    inHousehold: false,
    frozen: false,
    freeUntil: null,
  };
  const { data, error } = await supabase.rpc("keel_household_my_coverage");
  if (error) return open;
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    inHousehold: row.in_household === true,
    frozen: row.frozen === true,
    freeUntil: typeof row.free_until === "string" ? row.free_until : null,
  };
}

/**
 * LE GESTE POUR REPRENDRE — le tunnel de paiement du foyer.
 *
 * Il existe côté serveur depuis le chantier 1 (`plan='keel_household'`, deux
 * articles) et n'avait AUCUN appelant. Un tunnel sans bouton est un tunnel que
 * personne ne prend: c'est le mode d'échec n°1 de ce dépôt, et un écran de
 * pause sans issue est sa version la plus chère — on annonce à quelqu'un qu'il
 * est coupé, et on ne lui montre pas comment revenir.
 *
 * ⚠️ IL PEUT REFUSER, ET C'EST NORMAL AUJOURD'HUI: tant qu'un humain n'a pas
 * créé les deux prix Stripe, la fonction edge échoue BRUYAMMENT plutôt que de
 * dégrader. L'appelant affiche le message; il ne le transforme pas en succès.
 */
export async function openHouseholdCheckout(): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    "stripe-create-checkout-session",
    { body: { plan: "keel_household", interval: "monthly" } },
  );
  if (error) throw error;
  const url = String((data as { url?: unknown } | null)?.url ?? "").trim();
  // R7: pas de no-op silencieux. Un bouton qui ne fait rien est indiscernable
  // d'un bouton qui a marché, et celui-ci déplace de l'argent.
  if (!url) throw new Error("no checkout url returned");
  return url;
}

export async function removeHouseholdMember(memberId: string) {
  const { data, error } = await supabase.rpc("keel_household_remove_member", {
    p_member: memberId,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * MA PLACE DANS UN FOYER — ce que le tunnel de suppression de compte doit
 * savoir AVANT de poser sa question (chantier 2, D3).
 *
 * Trois faits, et pas un de plus: est-ce que j'ai une place, est-ce que je la
 * gouverne, et comment s'appelle la maison. Sans eux, la case « retirer aussi
 * ma place dans ce foyer » s'afficherait pour tout le monde — y compris les
 * comptes sans foyer, à qui elle ne veut rien dire, et le compte maître, à qui
 * la base la refusera (`cannot_remove_owner`).
 *
 * ⚠️ CE N'EST PAS LA GARDE. Elle est en base, dans
 * `keel_household_set_departure`. Ceci ne décide que de ce qu'on AFFICHE — et
 * en cas d'échec de lecture on n'affiche rien plutôt que de deviner.
 */
export async function loadMyHouseholdPlace(userId: string): Promise<
  { inHousehold: boolean; isOwner: boolean; householdName: string | null }
> {
  const none = { inHousehold: false, isOwner: false, householdName: null };
  if (!userId) return none;
  const { data, error } = await supabase
    .from("household_members")
    // ⚠️ LA CLÉ EST NOMMÉE, ET C'EST OBLIGATOIRE. `households(name)` tout court
    // rend PGRST201 « ambiguous embedding »: il existe DEUX relations entre ces
    // deux tables depuis que `households.reference_member_id` pointe sur
    // `household_members` (chantier 1). Mesuré contre la pile locale — et le
    // symptôme aurait été muet, parce que cette fonction retombe sur « pas de
    // foyer » quand la lecture échoue: la case ne se serait jamais affichée.
    .select("role, households!household_members_household_id_fkey(name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return none;
  const row = data as Record<string, unknown>;
  const nested = row.households as { name?: unknown } | { name?: unknown }[] | null;
  const named = Array.isArray(nested) ? nested[0] : nested;
  const name = named?.name;
  return {
    inHousehold: true,
    isOwner: String(row.role ?? "") === "owner",
    householdName: name ? String(name) : null,
  };
}

/**
 * RETIRER L'ACCÈS — et ce n'est PAS retirer du foyer (chantier 2, D2).
 *
 * `user_id` repasse à NULL, la ligne RESTE: la personne continue de manger là,
 * avec sa portion, ses allergies et ses contraintes, et `member_id` ne bouge
 * pas. Ce qu'elle perd, c'est la lecture du foyer et le droit de poser SON
 * objectif — pas sa place à table.
 *
 * Les deux gestes vivent côte à côte à l'écran, avec deux libellés, parce
 * qu'un seul bouton « retirer » signifierait deux choses irréversibles
 * différentes selon la ligne. Refus nommés de la base: `not_owner`,
 * `not_a_member`, `cannot_detach_owner`, `not_claimed`.
 */
export async function detachHouseholdMember(memberId: string) {
  const { data, error } = await supabase.rpc("keel_household_detach_member", {
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
 * MARQUER QUAND QUELQU'UN N'EST PAS LÀ (D14, 2026-08-12).
 *
 * ⚠️ CE N'EST PAS LE JUMEAU DE `setMemberGoal`, ET LA DIFFÉRENCE EST LE
 * PRODUIT. La base REFUSE de poser l'objectif d'une bouche qui a un compte
 * (`has_account`), et elle ACCEPTE de marquer son absence: un objectif est une
 * opinion, dont il n'y a qu'un porteur légitime; une absence est un fait, que
 * deux personnes peuvent connaître. Le maître qui sait que sa fille part en
 * camp doit pouvoir le dire même si elle a oublié.
 *
 * Ce que la personne a déclaré de son côté n'est PAS écrasé: le roster rend
 * l'union des deux. D'où `member.awayHousehold` en entrée de la grille, jamais
 * l'union — voir `HouseholdMemberView`.
 *
 * @param away la liste COMPLÈTE à écrire, jours hors fenêtre compris. La grille
 *        s'en charge (`MealPickerGrid` refusionne), parce qu'écraser avec ce
 *        qu'elle montre effacerait « jeudi midi » parce qu'on a composé un
 *        week-end.
 */
export async function setMemberAway(memberId: string, away: AwayDay[]) {
  const { data, error } = await supabase.rpc("keel_household_set_member_away", {
    p_member: memberId,
    p_away: away,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * LE RYTHME DU FOYER — celui du compte maître, comme tout ce qui gouverne la
 * composition (`generate-household-meal-v1` lit SA ligne `student_goals`).
 *
 * Sert les LIGNES de la grille de présence. Sans lui, la grille afficherait
 * trois repas par défaut à un foyer qui en déclare cinq, et le maître ne
 * pourrait marquer une absence que sur les moments qu'on aurait devinés.
 *
 * ⚠️ LE REPLI EST CELUI DU MOTEUR, pas une liste de confort. `buildMealPrompt`
 * retombe sur `DEFAULT_EATING_RHYTHM` quand rien n'est déclaré: une grille qui
 * n'afficherait rien dans ce cas — le cas le plus fréquent, un maître qui n'a
 * jamais rempli sa carte de rythme — rendrait la fonctionnalité inatteignable.
 */
export async function loadHouseholdRhythm(
  ownerUserId: string,
): Promise<EatingOccasionSlot[]> {
  const { data, error } = await supabase
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const pc = (data as Record<string, unknown> | null)?.practical_constraints;
  const rhythm = parseEatingRhythm(
    (pc as Record<string, unknown> | null)?.eating_rhythm,
  );
  return rhythm.length > 0 ? rhythm : [...DEFAULT_EATING_RHYTHM];
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
 * MA DATE À MOI — `profiles.birth_date`, la même colonne que « about you ».
 *
 * ── POURQUOI UNE SECONDE PORTE, ET PAS `setMemberBirthDate` (D18, L9) ──────
 *
 * Depuis 20260812180000, l'âge d'une bouche QUI A UN COMPTE se résout sur
 * `profiles.birth_date` d'abord, et seulement à défaut sur la date de sa fiche
 * de foyer. Écrire ma propre date sur ma FICHE la rendrait donc muette dès que
 * mon profil en porte une — le champ aurait l'air de marcher et ne changerait
 * rien à mon assiette. C'est le défaut exact que ce chantier passe son temps à
 * réparer, et il se referme en écrivant au bon endroit.
 *
 * Bénéfice second, et il n'est pas accessoire: la même date sert la lane
 * INDIVIDUELLE (`student_body_io.ts` lit `profiles.birth_date`). Une date
 * saisie ici active l'objectif au foyer ET dimensionne le plan personnel.
 *
 * ⚠️ RÉSERVÉ À SA PROPRE LIGNE. RLS (`rls_profiles_update_self`) refuse le
 * profil d'autrui — l'appeler pour quelqu'un d'autre ne lèverait pas, il
 * mettrait à jour ZÉRO ligne et rendrait 204 en silence. D'où le `.select()`
 * derrière et le refus nommé quand rien n'a bougé (cicatrice `RLS ne remplace
 * pas un .eq(user_id)`).
 *
 * ⚠️ LA VALIDATION EST ICI PARCE QU'IL N'Y A PAS DE CHECK EN BASE. Vérifié le
 * 2026-08-12: `profiles` porte neuf contraintes CHECK, AUCUNE sur cette
 * colonne. La RPC de foyer, elle, refuse `bad_birth_date` — écrire en direct
 * sans garde échangerait donc un refus lisible contre une date future acceptée
 * en silence, que `keel_age_state` traduirait ensuite en `unknown`. La personne
 * verrait « enregistré » et perdrait sa direction d'objectif.
 *
 * LA RÈGLE N'EST PAS RÉÉCRITE ICI. `assessBirthDate` + `birthDateWritable`
 * (`_shared/keel/student_age.ts`) sont LA garde d'écriture du produit, déjà
 * testées, et déjà celle de la lane individuelle. Une seconde arithmétique de
 * bornes au navigateur divergerait au premier ajustement, et personne ne
 * saurait laquelle ment.
 */
export async function setOwnBirthDate(userId: string, birthDate: string | null) {
  if (birthDate !== null) {
    const verdict = assessBirthDate(birthDate, new Date().toISOString().slice(0, 10));
    // `absent` ne peut pas sortir d'ici (on a testé `!== null`), et un MINEUR
    // s'enregistre — c'est justement ce qu'on veut savoir. Seuls
    // `unreadable | future | implausible` sont refusés.
    if (!birthDateWritable(verdict).ok) {
      return { ok: false, reason: "bad_birth_date" };
    }
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({ birth_date: birthDate })
    .eq("id", userId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { ok: false, reason: "not_your_line" };
  return { ok: true, reason: "" };
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
 *
 * ⚠️ LE PAYS EST UN PARAMÈTRE OBLIGATOIRE depuis le chantier 4, et la 1-arité
 * a été DROPPÉE en base: un paramètre de garde optionnel est une garde
 * désarmée, et deux arités seraient deux portes dont une n'exige rien.
 *
 * `country` peut être la chaîne vide QUAND le compte a déjà un pays déclaré —
 * c'est la base qui tranche (`country_required`), pas cet appelant, parce que
 * `profiles.country` peut avoir été posé par une autre porte entre-temps. Un
 * pays déjà déclaré n'est JAMAIS écrasé par celui qu'on passe ici.
 */
export async function joinHousehold(token: string, country: string) {
  const { data, error } = await supabase.rpc("keel_household_join", {
    p_token: token,
    p_country: country,
  });
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
      // `null` quand le compte de l'auteur a été effacé. `String(null)` rendrait
      // la chaîne « null », qui ne vaut aucun `userId` mais n'est pas non plus
      // une absence — et l'écran ne saurait plus laquelle des deux il lit.
      createdByUserId: r.created_by == null ? null : String(r.created_by),
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

/**
 * LA LIGNE D'ENVIES DE LA SEMAINE. Compte maître uniquement — la RPC refuse
 * tout autre membre par `not_owner`, et c'est la base qui le dit, pas l'écran.
 *
 * `weekStart` est recalée sur le lundi ISO PAR LA BASE. On la passe quand même
 * déjà normalisée (voir `HouseholdPage`) parce que la relecture, elle, filtre
 * en SQL: envoyer un mardi à l'écriture et relire un lundi rendrait « rien
 * écrit » juste après avoir écrit.
 */
export async function submitEnvy(weekStart: string, body: string) {
  const { data, error } = await supabase.rpc("keel_household_submit_envy", {
    p_week_start: weekStart,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * @param weekStart LUNDI ISO de la semaine. Une autre date rend `null` — la
 *        table n'ancre que des lundis depuis le lot 5.
 * @returns la phrase du maître, ou `null` s'il n'a rien écrit cette semaine.
 *          `null` est un état NORMAL, jamais une attente: la composition sort
 *          quand même, depuis les profils seuls.
 */
export async function loadEnvyLine(weekStart: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("household_envy_submissions")
    .select("body")
    .eq("week_start", weekStart)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  const body = String(row?.body ?? "").trim();
  return body ? body : null;
}

export interface HouseholdMealResult {
  ok: boolean;
  mealId: string | null;
  issues: string[];
}

/**
 * LE MOTIF NOMMÉ D'UN REFUS DE FONCTION EDGE, quand il y en a un.
 *
 * ⚠️ `supabase.functions.invoke` NE REND PAS LE CORPS d'une réponse non-2xx:
 * `error.message` vaut « Edge Function returned a non-2xx status code », et
 * c'est tout. Un refus soigneusement nommé côté serveur (`household_frozen`,
 * `goal_required`, `no_coach`…) arrive donc à l'écran comme une panne
 * générique — après quoi l'utilisateur ouvre un ticket au lieu de faire le
 * geste qu'on attend de lui.
 *
 * `FunctionsHttpError` porte la `Response` dans `context`. On la lit, une
 * fois, et on rend le jeton. `null` quand il n'y a rien à lire: on ne
 * fabrique pas un motif à partir d'une panne réelle.
 *
 * ⚠️ EXPORTÉE POUR `householdMerge.ts` (L8), et pas recopiée là-bas: les
 * gestes de fusion et de défusion passent par la MÊME fonction edge que la
 * composition, donc par les mêmes refus nommés. Une seconde lecture du corps
 * aurait divergé le jour où la forme de la réponse bouge, et la divergence
 * aurait été muette — on afficherait « non-2xx » à la place d'un refus qui a
 * un nom.
 */
export async function namedEdgeRefusal(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (!ctx || typeof (ctx as Response).json !== "function") return null;
  try {
    const body = await (ctx as Response).json();
    const named = String((body as { error?: unknown } | null)?.error ?? "").trim();
    return named || null;
  } catch {
    return null;
  }
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
  if (error) throw new Error(await namedEdgeRefusal(error) ?? error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  // `household.spoken` / `household.silent` ne sont plus rendus par la fonction
  // edge (lot 5). On ne les lit plus non plus: garder un lecteur tolérant
  // laisserait croire que le champ peut revenir.
  return {
    ok: row.ok === true,
    mealId: ((row.meal ?? null) as Record<string, unknown> | null)?.id as string ?? null,
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

/**
 * UN PLAT DU PLAN DU FOYER, RÉDUIT À CE QUI SE DIT À TABLE (L8, D9).
 *
 * ⚠️ NI `why` NI `ingredients`. Le « pourquoi » d'un plat est écrit pour la
 * personne qu'il sert et le plan du foyer est lu à voix haute par tout le
 * foyer: c'est la même famille de risque que L4 refuse d'envoyer au prompt de
 * fusion, et que la garde de non-divulgation de L6 tient à l'entrée. Un écran
 * qui l'affiche annule les deux.
 *
 * Le titre, le jour et le moment suffisent à « ce que la maison cuisine ».
 */
export interface HouseholdDishView {
  title: string;
  day: string | null;
  slot: string | null;
}

export interface HouseholdMealView {
  mealId: string;
  startsOn: string;
  durationDays: number;
  portions: MemberPortionView[];
  /** Ce que la maison cuisine — la moitié qu'un secondaire n'avait nulle part. */
  dishes: HouseholdDishView[];
  /** Ce qui n'a pas fusionné, et pourquoi (D9). Voir `householdPlanTrace.ts`. */
  trace: HouseholdPlanTrace;
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
    // `dishes` et `generated_from` sont arrivés avec L8: le premier parce qu'un
    // secondaire n'avait NULLE PART où voir ce que la maison cuisine (D9), le
    // second parce que « ce qui n'a pas fusionné » n'est lisible que là.
    .select("id, starts_on, duration_days, member_portions, dishes, generated_from")
    .not("household_id", "is", null)
    // ⚠️ `plan_kind` EST LA MOITIÉ DU FILTRE — mesuré le 2026-08-12 sous un vrai
    // jeton. `household_id is not null` ne dit PAS « plan du foyer »: un plan
    // personnel le porte aussi, `generate-meal-v1` l'estampant pour que la
    // fusion le retrouve. Sans ce filtre, la carte se vidait dès qu'un
    // secondaire générait un plan personnel commençant après celui du foyer —
    // elle rendait sa ligne, qui n'a aucune `member_portions`.
    //
    // Le jumeau de ce défaut vivait dans `household_turn_context.ts`, où le
    // chat décrivait les plats d'un membre comme le dîner de la maison.
    .eq("plan_kind", "household")
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
    dishes: readHouseholdDishes(row.dishes),
    trace: readHouseholdPlanTrace(row.generated_from),
  };
}

/**
 * Les plats d'un plan, réduits à ce qui se dit à table. Voir `HouseholdDishView`
 * pour ce qui est délibérément laissé de côté, et pourquoi.
 */
function readHouseholdDishes(raw: unknown): HouseholdDishView[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = (entry ?? {}) as Record<string, unknown>;
    return {
      title: String(d.title ?? "").trim(),
      day: typeof d.day === "string" && d.day.trim() ? d.day.trim() : null,
      slot: typeof d.slot === "string" && d.slot.trim() ? d.slot.trim() : null,
    };
  }).filter((d) => d.title !== "");
}

/**
 * LE MAÎTRE ACCÈDE À TOUS LES PLANS — et sa surface de cuisine n'en affiche
 * qu'un (D9, mot pour mot).
 *
 * ── « ACCÉDER » ET « AFFICHER » NE SONT PAS LA MÊME CHOSE ─────────────────
 * C'est tout l'arbitrage du lot. Sa cuisine ne montre QUE le plan qu'il
 * cuisine — un plan validé non fusionné n'y apparaît pas, parce que le but est
 * de simplifier sa cuisine et non de lui faire suivre N plans. Mais il doit
 * pouvoir REGARDER celui d'un secondaire, sur un geste explicite, pour décider
 * s'il le fusionne. D'où: derrière un dépliant, jamais sur une carte.
 *
 * ⚠️ `.eq("user_id", …)` EXPLICITE, ET RLS N'EN DISPENSE PAS. La policy
 * `student_generated_meals_household_read` rend TOUTE ligne portant le foyer —
 * y compris le plan personnel d'un AUTRE secondaire. Ce dépôt a déjà rendu la
 * ligne d'un élève à son coach faute d'un `.eq(user_id)`; ici la même
 * négligence ferait lire à un secondaire le plan d'un autre secondaire.
 *
 * ⚠️ `plan_kind = 'personal'` EST L'AUTRE MOITIÉ. `household_id is not null` ne
 * veut pas dire « plan du foyer », et sa réciproque est vraie aussi: sans ce
 * filtre, demander « le plan de Zoé » sur le compte du maître rendrait le plan
 * DU FOYER. Voir `household_plan_kind_readers_test.ts`.
 */
export async function loadMemberPersonalPlan(
  userId: string,
  today: string,
): Promise<HouseholdDishView[] | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("student_generated_meals")
    .select("id, dishes")
    .eq("user_id", userId)
    .eq("plan_kind", "personal")
    .is("retired_at", null)
    .gte("ends_on", today)
    .order("starts_on", { ascending: true })
    .limit(1);
  // ÉCHOUE FORT. « Son plan ne contient rien » et « on n'a pas pu le lire »
  // sont deux phrases différentes, et l'appelant en rend deux.
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return readHouseholdDishes(row.dishes);
}
