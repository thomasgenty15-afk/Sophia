// VÉRIFICATION L2 — le compte de séances est-il GELÉ dans weekly_reviews.week_facts ?
// Fixture existante (Kai). Aucun compte créé. Nettoyage en fin de course.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeAndStoreWeekReview } from "../supabase/functions/_shared/keel/week_review_io.ts";

const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const KAI = "08050000-0000-4000-8000-000000000031";
const EVA = "08050000-0000-4000-8000-000000000011";
const weekStart = "2026-08-10", weekEnd = "2026-08-16";

await admin.from("student_activity_sessions").delete().eq("user_id", KAI);
await admin.from("student_activity_sessions").delete().eq("user_id", EVA);
const { error } = await admin.from("student_activity_sessions").insert([
  { user_id: KAI, local_date: "2026-08-10", kind: "strength", duration_min: 45, intensity: "hard", source: "app" },
  { user_id: KAI, local_date: "2026-08-10", kind: "cardio", duration_min: 20, intensity: "easy", source: "app" },
  { user_id: KAI, local_date: "2026-08-12", kind: "mobility", duration_min: null, intensity: null, source: "chat" },
  { user_id: KAI, local_date: "2026-08-30", kind: "cardio", duration_min: 30, intensity: "easy", source: "app" }, // HORS fenêtre
  { user_id: EVA, local_date: "2026-08-11", kind: "cardio", duration_min: 99, intensity: "hard", source: "app" }, // AUTRE élève
]);
if (error) throw error;

try {
  const r = await computeAndStoreWeekReview(admin, {
    userId: KAI, weekStart, weekEnd, contentLocale: "en-GB", now: new Date("2026-08-16T19:30:00Z"),
  });
  console.log("outcome :", r.outcome);
  console.log("activity (en mémoire) :", JSON.stringify(r.reading?.activity));

  // ⚠️ RELU DEPUIS LA BASE, pas depuis l'objet rendu.
  const { data } = await admin.from("weekly_reviews")
    .select("week_facts").eq("user_id", KAI).eq("week_start_date", weekStart).single();
  const frozen = (data as { week_facts: Record<string, unknown> } | null)?.week_facts;
  console.log("activity GELÉ en base  :", JSON.stringify(frozen?.activity));
  const raw = JSON.stringify(frozen);
  console.log("« kcal/energy » dans le gel :", /kcal|calorie|energy|burn/i.test(raw) ? "PRÉSENT ⚠️" : "ABSENT ✅");
} finally {
  await admin.from("student_activity_sessions").delete().eq("user_id", KAI);
  await admin.from("student_activity_sessions").delete().eq("user_id", EVA);
  console.log("nettoyé.");
}
