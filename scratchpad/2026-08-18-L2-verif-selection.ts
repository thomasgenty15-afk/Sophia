// VÉRIFICATION L2 — la SÉLECTION du cron du dimanche, rejouée sur la base vivante.
// Aucune écriture. Lecture seule. Importe EXACTEMENT le code du cron.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decideWeeklyFlow } from "../supabase/functions/_shared/keel/weekly_flow.ts";
import { hasAnsweredWeek, hasAskedWeek, weekStartOf } from "../supabase/functions/_shared/keel/weekly_flow_io.ts";
import { resolveStudentFollowing } from "../supabase/functions/_shared/keel/following_io.ts";
import { localHourFor } from "../supabase/functions/_shared/keel/reengagement_io.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function localDateFor(now: Date, tz: string | null): string {
  const zone = String(tz ?? "").trim();
  if (!zone) return now.toISOString().slice(0, 10);
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now); } catch { return now.toISOString().slice(0, 10); }
}
function localDowFor(now: Date, tz: string | null): number {
  return new Date(`${localDateFor(now, tz)}T00:00:00Z`).getUTCDay();
}

const { data, error } = await admin.from("profiles")
  .select("id, timezone, proactive_muted_at, locale")
  .eq("keel_role", "student").order("id", { ascending: true });
if (error) throw error;
const rows = (data ?? []) as Array<Record<string, unknown>>;
console.log(`profiles keel_role=student : ${rows.length}`);

const bySkip: Record<string, number> = {};
const wouldSend = new Set<string>();
const inWindowEver = new Set<string>();

// Le cron tourne TOUTES LES HEURES. On rejoue les 24 passages du dimanche.
for (let h = 0; h < 24; h++) {
  const now = new Date(`2026-08-16T${String(h).padStart(2, "0")}:30:00Z`);
  for (const row of rows) {
    const uid = String(row.id ?? "");
    const tz = row.timezone ? String(row.timezone) : null;
    const localHour = localHourFor(now, tz);
    const localDow = localDowFor(now, tz);
    if (localHour === null || localDow !== 0 || localHour < 18 || localHour >= 21) {
      if (h === 19) bySkip.outside_window_at_1930Z = (bySkip.outside_window_at_1930Z ?? 0) + 1;
      continue;
    }
    inWindowEver.add(uid);
    if (wouldSend.has(uid)) continue;
    const localDate = localDateFor(now, tz);
    const weekStart = weekStartOf(localDate);
    const following = await resolveStudentFollowing(admin, uid, weekStart);
    const decision = decideWeeklyFlow({
      localDow, localHour,
      answeredThisWeek: await hasAnsweredWeek(admin, uid, weekStart),
      askedThisWeek: await hasAskedWeek(admin, uid, weekStart),
      safetyBand: null,
      restrictionFlagged: false,
      optedOut: Boolean(row.proactive_muted_at),
      hasActivePlan: following.following,
    });
    if (decision.decision === "skip") {
      bySkip[decision.reason] = (bySkip[decision.reason] ?? 0) + 1;
      continue;
    }
    wouldSend.add(uid);
  }
}
const noTz = rows.filter((r) => !r.timezone).length;
console.log(`sans timezone (jamais dans la fenêtre)      : ${noTz}`);
console.log(`atteignent la fenêtre dimanche 18-21 local  : ${inWindowEver.size}`);
console.log(`décision SEND (⇒ computeAndStoreWeekReview) : ${wouldSend.size}`);
console.log(`skips (dédupliqués par passage horaire)     :`, bySkip);
