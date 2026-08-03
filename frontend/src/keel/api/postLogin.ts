// KEEL — where does a signed-in user belong?
//
// One resolver, used by the landing page (a signed-in visitor on `/` is routed
// to their space) and by /auth after a plain sign-in. The order restates the
// two route guards' own facts, in guard order of authority:
//
//   1. an ACTIVE `coaches` row      -> /coach      (CoachRoute's fact)
//   2. profiles.keel_role='student' -> /app/today  (KeelStudentRoute's fact)
//   3. anything else                -> /dashboard  (the legacy French app)
//
// FAIL SAFE, NOT CLOSED: this is navigation, not access control — the guards
// and RLS re-check on arrival. So an unreadable row degrades to /dashboard
// rather than stranding a legitimate legacy user on an error screen.

import { supabase } from "../../lib/supabase";
import { loadKeelRole } from "./keelClient";

export type HomePath = "/coach" | "/app/today" | "/dashboard";

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
    // fall through to the legacy default
  }
  return "/dashboard";
}

export default resolveHomePath;
