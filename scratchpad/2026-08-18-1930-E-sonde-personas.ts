// SONDE E — trouver un foyer utilisable pour le parcours de bout en bout.
//   $ cd frontend && SB_SR=... npx vite-node ../scratchpad/2026-08-18-1930-E-sonde-personas.ts
// Lecture SEULE. Aucun compte n'est fait avancer.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SB_URL ?? "http://127.0.0.1:54321";
const SR = process.env.SB_SR ?? "";
const db = createClient(URL, SR, { auth: { persistSession: false } });

const today = new Date().toISOString().slice(0, 10);
console.log("aujourd'hui:", today);

const { data: plans, error: pe } = await db
  .from("student_generated_meals")
  .select("id, user_id, plan_kind, household_id, starts_on, duration_days, created_at, retired_at")
  .is("retired_at", null)
  .eq("plan_kind", "household")
  .order("created_at", { ascending: false })
  .limit(15);
console.log("plans foyer vivants:", pe?.message ?? plans?.length);
for (const p of plans ?? []) {
  console.log("  ", p.id.slice(0, 8), "hh:", p.household_id?.slice(0, 8), p.starts_on, "+", p.duration_days, "j");
}

const hids = [...new Set((plans ?? []).map((p) => p.household_id).filter(Boolean))];
if (hids.length) {
  const { data: hh } = await db.from("households").select("id, name, owner_user_id, reference_member_id").in("id", hids);
  const { data: mem } = await db
    .from("household_members")
    .select("member_id, household_id, first_name, birth_date, user_id, away_days")
    .in("household_id", hids);
  for (const h of hh ?? []) {
    const { data: prof } = await db.from("profiles").select("id, email, locale, country").eq("id", h.owner_user_id).maybeSingle();
    const { data: goal } = await db.from("student_goals").select("goal, target_weight_kg, target_pace_kg_per_week, activity_level, content_locale").eq("user_id", h.owner_user_id).maybeSingle();
    console.log("\nFOYER", h.id.slice(0, 8), JSON.stringify(h.name), "maître:", prof?.email, "locale:", prof?.locale, "pays:", prof?.country);
    console.log("   objectif maître:", JSON.stringify(goal));
    for (const m of (mem ?? []).filter((m) => m.household_id === h.id)) {
      console.log("    bouche", m.member_id.slice(0, 8), JSON.stringify(m.first_name), "né:", m.birth_date, "compte:", m.user_id ? "OUI" : "—", "away:", JSON.stringify(m.away_days)?.slice(0, 80));
    }
  }
}
