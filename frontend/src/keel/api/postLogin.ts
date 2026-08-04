// KEEL — where does a signed-in user belong?
//
// One resolver, used by the landing page (a signed-in visitor on `/` is routed
// to their space) and by /auth after a plain sign-in. The order restates the
// two route guards' own facts, in guard order of authority:
//
//   1. an ACTIVE `coaches` row      -> /coach      (CoachRoute's fact)
//   2. profiles.keel_role='student' -> /app/today  (KeelStudentRoute's fact)
//   3. anything else                -> /account
//
// FAIL SAFE, NOT CLOSED: this is navigation, not access control — the guards
// and RLS re-check on arrival. So an unreadable row degrades to a real page
// rather than stranding a legitimate user on an error screen.
//
// THE FALLBACK USED TO BE `/dashboard`, the legacy French app. That route was
// deleted with the consumer product, so the fallback was pointing at a 404 —
// and it is the branch a signed-in user lands on precisely when we could NOT
// read their role, which is the worst moment to show them nothing. `/account`
// is what still serves them: their profile, their subscription, and the export
// and deletion of their data.

import { supabase } from "../../lib/supabase";
import { loadKeelRole } from "./keelClient";

export type HomePath = "/coach" | "/app/today" | "/account";

export async function resolveHomePath(userId: string): Promise<HomePath> {
  try {
    const coachRes = await supabase
      .from("coaches")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!coachRes.error) {
      const row = coachRes.data as { status: string } | null;
      if (row?.status === "active") return "/coach";
    }
    const role = await loadKeelRole(userId);
    if (role === "student") return "/app/today";
  } catch {
    // fall through to the default
  }
  return "/account";
}

export default resolveHomePath;
