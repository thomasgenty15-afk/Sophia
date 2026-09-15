// L8-B — C9: LE CONTOURNEMENT, EPROUVE POUR DE VRAI.
// On pose un etat de presence INVENTE par une ecriture PostgREST directe, sous
// le VRAI jeton de la personne, et on regarde ce qui en sort.
const URL_BASE = "http://127.0.0.1:54321";
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAUL_MAIL = "l2p-owner-1786493429016cdbc78@test.dev";

const tok = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { "content-type": "application/json", apikey: ANON },
  body: JSON.stringify({ email: PAUL_MAIL, password: "1234567" }),
}).then((r) => r.json());
const uid = tok.user.id as string;
console.log(`compte ${PAUL_MAIL} -> ${uid}`);

// L'etat AVANT, pour restaurer.
const before = await fetch(
  `${URL_BASE}/rest/v1/student_goals?user_id=eq.${uid}&select=practical_constraints`,
  { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
).then((r) => r.json());
const pc = before[0]?.practical_constraints ?? {};
await Deno.writeTextFile("scratchpad/l8b_c9_pc_snapshot_20260818.json", JSON.stringify(pc));

// ── L'ECRITURE INVENTEE, SOUS LE JETON DE LA PERSONNE ────────────────────
const forged = {
  ...pc,
  away_days: [
    { day: "wed", slots: ["lunch"], kind: "brunch_with_gran" },   // jeton INVENTE
    { day: "thu", slots: ["lunch"], kind: "EATING_OUT" },          // casse
    { day: "fri", slots: ["lunch"], kind: "eating_out" },          // legitime
  ],
};
const res = await fetch(`${URL_BASE}/rest/v1/student_goals?user_id=eq.${uid}`, {
  method: "PATCH",
  headers: {
    "content-type": "application/json", apikey: ANON,
    Authorization: `Bearer ${tok.access_token}`, Prefer: "return=representation",
  },
  body: JSON.stringify({ practical_constraints: forged }),
});
console.log(`PATCH student_goals (jeton de la personne) -> HTTP ${res.status}`);
const body = await res.json();
console.log("ecrit:", JSON.stringify((body?.[0]?.practical_constraints ?? {}).away_days));

// ── CE QUE LE ROSTER EN FAIT ─────────────────────────────────────────────
const roster = await fetch(`${URL_BASE}/rest/v1/rpc/keel_household_roster_for`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  body: JSON.stringify({ p_user: uid }),
}).then((r) => r.json());
for (const r of roster) {
  if (r.first_name === "Paul") console.log("roster away_days de Paul:", JSON.stringify(r.away_days));
}

// ── ET CE QUE LA GARDE C9.b EN FAIT ──────────────────────────────────────
const B = "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/";
const { eatingOutAdvice } = await import(B + "household_portions.ts");
const reader = { show: true, reason: "open" };
const slots = [{ slot: "breakfast", size: null }, { slot: "lunch", size: null }, { slot: "dinner", size: null }];
const executed = { kgPerWeek: 0.5, dailyDeltaKcal: 500, maintenanceKcal: 1817, clampedBy: "deficit_cap" };
console.log("\netat pose                 -> kcal   motif");
for (const state of ["brunch_with_gran", "EATING_OUT", "", "at_table", "away", "eating_out"]) {
  const out = eatingOutAdvice({
    presenceState: state, reader, mouthIsReader: true, mouthAgeState: "adult",
    slots, occasion: { slot: "lunch", size: null }, executed, direction: "down",
  });
  console.log(`${JSON.stringify(state).padEnd(22)} -> ${String(out.kcal).padEnd(6)} ${out.reason}`);
}
// Le meme jeton LEGITIME, mais sur un MINEUR (C9.a).
for (const age of ["minor", "unknown", "adult"]) {
  const out = eatingOutAdvice({
    presenceState: "eating_out", reader, mouthIsReader: true, mouthAgeState: age,
    slots, occasion: { slot: "lunch", size: null }, executed, direction: "down",
  });
  console.log(`"eating_out" + age=${age.padEnd(8)} -> ${String(out.kcal).padEnd(6)} ${out.reason}`);
}

// ── RESTAURATION (L8-B, 2e passe) ─────────────────────────────────────────
await fetch(`${URL_BASE}/rest/v1/student_goals?user_id=eq.${uid}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  body: JSON.stringify({ practical_constraints: pc }),
});
console.log("\npractical_constraints restaure a l'etat d'avant.");
