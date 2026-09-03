// KEEL — where does a signed-in user belong?
//
// One resolver, used by the landing page (a signed-in visitor on `/` is routed
// to their space) and by /auth after a plain sign-in. The order restates the
// two route guards' own facts, in guard order of authority:
//
//   1. an ACTIVE `coaches` row      -> /coach          (CoachRoute's fact)
//   2. profiles.keel_role='student' -> /app/today      (KeelStudentRoute's fact)
//   2bis. a row in a household      -> /app/household  (KeelHouseholdRoute's)
//   3. read, but neither of those   -> /account
//   4. NOTHING could be read        -> null, and the caller must not navigate
//
// ── POURQUOI 2bis EXISTE (chantier 4) ─────────────────────────────────────
// Quelqu'un qui a RÉCLAMÉ son profil de foyer n'est l'élève de personne:
// `profiles.keel_role` reste NULL, exprès (`student` ouvrirait /app/today,
// /app/chat et /app/progress, trois écrans vides pour qui n'a ni coach ni
// plan). Sans cette branche, il tombait sur `/account` — l'ancienne page grand
// public — à CHAQUE connexion suivant la première. L'écran de réclamation
// l'emmenait bien sur son foyer; la deuxième visite, elle, ne le savait pas.
//
// L'ORDRE compte et restitue celui du palier (20260811050000 §4): `student`
// AVANT `household_member`, parce qu'un élève qui rejoint le foyer de son
// conjoint garde le produit que son coach paie.
//
// LE FAIT LU EST LE MÊME QUE CELUI DE LA GARDE DE ROUTE: une ligne visible
// dans `household_members`. Aucun `.eq("user_id")` — la policy scope déjà au
// foyer de l'appelant, et une bouche SANS COMPTE du même foyer est une ligne
// légitime à compter. La question est « ai-je un foyer », pas « ai-je une
// ligne ». Toute autre lecture (le palier, par exemple) ferait diverger la
// destination et la garde qui l'accueille.
//
// FAIL SAFE, NOT CLOSED: branches 1-3 are navigation, not access control — the
// guards and RLS re-check on arrival. So an unreadable row degrades to a real
// page rather than stranding a legitimate user on an error screen.
//
// THE FALLBACK USED TO BE `/dashboard`, the legacy French app. That route was
// deleted with the consumer product, so the fallback was pointing at a 404 —
// and it is the branch a signed-in user lands on precisely when we could NOT
// read their role. `/account` is what still serves them: their profile, their
// subscription, and the export and deletion of their data.
//
// ── WHY BRANCH 4 EXISTS ───────────────────────────────────────────────────
// Branch 3 used to swallow the outage case too, and that was a real defect,
// observed: with the backend unreachable (every request ERR_CONNECTION_REFUSED)
// a `keel_role='student'` user reloading "/" was routed to `/account` — the
// LEGACY consumer page, which then rendered empty because it needs the same
// backend. The fallback was therefore guaranteed useless in the one situation
// that selected it, and the user was told nothing: no error, no retry, just an
// old product's shell with dead fields.
//
// The distinction that fixes it is not "which error is this" — sniffing
// supabase-js error strings to recognise a fetch failure is guesswork that
// rots, and it would have to be re-tuned every time the client changes its
// wording. The criterion is WHETHER WE HOLD A FACT ABOUT THIS USER. A row
// that comes back empty is a fact ("not a coach"). A transport failure is not,
// and neither is a PostgREST error — an RLS refusal and a broken schema cache
// both leave us knowing exactly nothing, whatever the server's mood. Routing
// on no facts is how someone lands in the wrong product. So: one fact in hand
// => branch 3 keeps the old fail-safe; no fact at all => `null`, say so,
// navigate nowhere.

import { supabase } from "../../lib/supabase";
import { loadKeelRole } from "./keelClient";
import { isProSurfaceHidden } from "../../security/proSurface";

export type HomePath =
  | "/coach"
  | "/app/setup"
  | "/app/today"
  | "/app/household"
  | "/account";

/**
 * A-T-IL DÉJÀ RÉPONDU À CE QUE L'ENTONNOIR DEMANDE ? (FF-060)
 *
 * ── POURQUOI CE FAIT-LÀ, ET PAS UN DRAPEAU ────────────────────────────────
 * `profiles.onboarding_completed` existe et n'est lu que par un chemin legacy.
 * Le réutiliser dirait « terminé » d'un parcours dont les faits ont changé
 * depuis, et « à faire » à un compte réglé avant que cet écran n'existe. La
 * ligne `student_goals` est le fait: sans elle, LES DEUX générateurs rendent
 * `goal_required` (409), donc rien ne peut être composé — c'est exactement la
 * définition de « il n'a encore rien ».
 *
 * @returns `null` quand on n'a PAS PU LIRE. Ne jamais router sur `null`: envoyer
 *          quelqu'un dans un couloir de réglage parce que le réseau a hoqueté
 *          lui ferait refaire ce qu'il a déjà fait.
 */
export async function hasAnsweredTheFunnel(userId: string): Promise<boolean | null> {
  try {
    const res = await supabase
      .from("student_goals")
      .select("user_id")
      // `.eq` EXPLICITE malgré RLS: quelqu'un qui est à la fois coach et
      // mangeur lit aussi les lignes de ses élèves (`student_goals_select_coach`),
      // et une lecture non scopée le déclarerait « déjà réglé » sur la ligne de
      // l'un d'eux. Le dépôt a déjà payé ce défaut sur cette table.
      .eq("user_id", userId)
      .limit(1);
    if (res.error) return null;
    return (res.data ?? []).length > 0;
  } catch {
    return null;
  }
}

/**
 * Resolve a signed-in user's home.
 *
 * Returns `null` when NEITHER role read succeeded — the backend is unreachable
 * or refusing everything. Callers must treat `null` as "unknown", show the
 * connection-lost state and let the user retry; navigating on `null` sends
 * people to a page that cannot load either.
 */
export async function resolveHomePath(userId: string): Promise<HomePath | null> {
  // Tracks a FACT, not a response: a coach row that comes back empty is a fact
  // ("not a coach"), an error is not. This is what tells branch 3 apart from
  // branch 4 when the profiles read then fails.
  let heldAFact = false;

  try {
    const coachRes = await supabase
      .from("coaches")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!coachRes.error) {
      heldAFact = true;
      const row = coachRes.data as { status: string } | null;
      if (row?.status === "active") return "/coach";
    }
  } catch {
    // Transport failure: `heldAFact` stays false.
  }

  try {
    const role = await loadKeelRole(userId);
    // The read succeeded, so we know their role — including when it is neither
    // coach nor student. That is a FACT, and it is what lets branch 2bis fall
    // back to /account below rather than to `null`.
    heldAFact = true;
    // BRANCHE 1bis — L'ENTONNOIR D'ENTRÉE (FF-060). Un élève qui n'a répondu à
    // rien atterrissait sur `/app/today`, VIDE, et devait deviner un bouton
    // « Set up » enfoui dans une fenêtre de `/app/plan`. Un écran élève vide
    // porte la sortie vers là où il compose: c'est déjà la règle du dépôt,
    // l'entonnoir en devient la destination.
    //
    // ⚠️ SEULEMENT SUR UN `false` EXPLICITE. `null` = on n'a pas pu lire, et
    // renvoyer quelqu'un régler ce qu'il a déjà réglé est pire que de le
    // laisser sur son écran habituel.
    if (role === "student") {
      return (await hasAnsweredTheFunnel(userId)) === false
        ? "/app/setup"
        : "/app/today";
    }
  } catch {
    // `loadKeelRole` throws on any error, transport included.
  }

  // BRANCHE 2bis — le foyer. Interrogée APRÈS le rôle et seulement quand il
  // n'est pas 'student': voir l'en-tête pour l'ordre, qui est celui du palier.
  //
  // Un échec ici n'est PAS une autorisation et n'est pas non plus un refus: on
  // retombe simplement sur la suite. La garde `KeelHouseholdRoute` re-pose la
  // même question à l'arrivée, et RLS reste la vraie frontière.
  try {
    const household = await supabase
      .from("household_members")
      .select("member_id")
      .limit(1);
    if (!household.error) {
      heldAFact = true;
      if ((household.data ?? []).length > 0) {
        // MÊME RÈGLE QU'EN 1bis, ET POUR LA MÊME POPULATION: quelqu'un qui
        // vient de réclamer son profil n'a AUCUNE ligne `student_goals` — c'est
        // la définition même du trou que FF-048 R8 laisse ouvert. L'envoyer sur
        // son foyer lui montre la table de quelqu'un d'autre; l'entonnoir lui
        // demande ce qui manque pour que SA part soit la sienne.
        return (await hasAnsweredTheFunnel(userId)) === false
          ? "/app/setup"
          : "/app/household";
      }
    }
  } catch {
    // Transport failure: `heldAFact` garde ce qu'il valait.
  }

  return heldAFact ? "/account" : null;
}

export default resolveHomePath;

// ── LANCEMENT B2C — LE MONDE PRO EST FERMÉ, Y COMPRIS AUX COMPTES EXISTANTS ─
//
// `isProSurfaceHidden()` retire les pages de vente pro et l'inscription coach.
// Ça ne suffit PAS à tenir la phrase « un professionnel ne peut pas se
// connecter »: `/auth` est la porte des DEUX mondes, et un compte `coaches`
// déjà créé s'y connecte par le formulaire ordinaire. Ce prédicat est la
// seconde moitié, et il est lu à deux endroits — la porte (`/auth`, qui
// déconnecte) et la garde (`CoachRoute`, pour une session déjà ouverte avant
// le lancement, qu'aucun refus de porte n'atteint).
//
// ⚠️ L'ADMIN INTERNE EST EXCLU, ET CE N'EST PAS UNE FAVEUR. Le refus de porte
// DÉCONNECTE. Sans ce carve-out, un compte à la fois admin et coach perdrait
// tout le produit — `/admin`, `/admin/usage`, le journal de production — pour
// une raison qui ne concerne que l'espace pro. C'est une non-régression.
//
// FAIL OPEN, ET C'EST L'INVERSE DE `CoachRoute`. Cette garde-ci n'est pas une
// frontière (RLS l'est, et elle n'a pas bougé): elle retire une surface
// commerciale. Une lecture qui échoue doit donc laisser passer, pas verrouiller
// — sinon une base momentanément injoignable déconnecte tout le monde à la
// porte, foyers compris, puisqu'on ne sait alors de personne s'il est coach.

/**
 * Ce compte doit-il se voir refuser le monde pro ?
 *
 * `true` seulement quand les TROIS conditions tiennent: le drapeau est levé,
 * le compte porte une ligne `coaches` ACTIVE, et il n'est pas admin interne.
 * Toute lecture en échec rend `false` — voir « fail open » ci-dessus.
 */
export async function isProAccessRefused(userId: string): Promise<boolean> {
  if (!isProSurfaceHidden()) return false;
  try {
    const coachRes = await supabase
      .from("coaches")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (coachRes.error) return false;
    const coach = coachRes.data as { status: string } | null;
    if (coach?.status !== "active") return false;

    // L'admin n'est demandé QUE si le refus est par ailleurs acquis: une
    // requête de moins sur le chemin de connexion de tous les autres comptes.
    const adminRes = await supabase
      .from("internal_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (adminRes.error) return false;
    return !adminRes.data;
  } catch {
    return false;
  }
}
