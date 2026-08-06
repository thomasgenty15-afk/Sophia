// KEEL — where does a signed-in user belong?
//
// One resolver, used by the landing page (a signed-in visitor on `/` is routed
// to their space) and by /auth after a plain sign-in. The order restates the
// two route guards' own facts, in guard order of authority:
//
//   1. an ACTIVE `coaches` row      -> /coach      (CoachRoute's fact)
//   2. profiles.keel_role='student' -> /app/today  (KeelStudentRoute's fact)
//   3. read, but neither of those   -> /account
//   4. NOTHING could be read        -> null, and the caller must not navigate
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

export type HomePath = "/coach" | "/app/today" | "/account";

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
    // coach nor student. That is branch 3, and it is a legitimate destination.
    return role === "student" ? "/app/today" : "/account";
  } catch {
    // `loadKeelRole` throws on any error, transport included.
  }

  return heldAFact ? "/account" : null;
}

export default resolveHomePath;
