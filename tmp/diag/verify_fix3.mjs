// READ-ONLY verification of fix #3 (parallel transformations).
// Reproduces the EXACT PostgREST filters used by clearServerDownstreamState
// BEFORE and AFTER the fix, as SELECTs, to prove the preserved (first) active
// transformation and its plan are now spared. No mutation is performed.
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../../supabase/.env", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("missing env"); process.exit(2); }

const CYCLE = "f45401a4-14c1-42e9-9205-3417364cd777";
const PRESERVED = "7688f403-be6c-44fd-9f0f-569aa6b305ae"; // first active transformation

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) return { __error: res.status, __body: await res.text() };
  return res.json();
}

const statusIn = "status=in.(draft,ready,pending,active)";

// ---- PLANS that a DELETE would remove ----
const plansOld = await q(
  `user_plans_v2?cycle_id=eq.${CYCLE}&select=id,transformation_id,status`,
);
const plansNew = await q(
  `user_plans_v2?cycle_id=eq.${CYCLE}&transformation_id=neq.${PRESERVED}&select=id,transformation_id,status`,
);

// ---- TRANSFORMATIONS that an UPDATE (reset to pending) would touch ----
const transfoOld = await q(
  `user_transformations?cycle_id=eq.${CYCLE}&${statusIn}&select=id,status,title`,
);
const transfoNew = await q(
  `user_transformations?cycle_id=eq.${CYCLE}&${statusIn}&id=neq.${PRESERVED}&select=id,status,title`,
);

const brief = (rows) =>
  Array.isArray(rows) ? rows.map((r) => ({ id: r.id.slice(0, 8), status: r.status, ...(r.title ? { title: r.title } : {}) })) : rows;

console.log("PRESERVED (first active transformation):", PRESERVED.slice(0, 8));
console.log("\n=== PLANS a DELETE would remove ===");
console.log("BEFORE fix (cycle-wide):", JSON.stringify(brief(plansOld)));
console.log("AFTER  fix (neq preserved):", JSON.stringify(brief(plansNew)));

console.log("\n=== TRANSFORMATIONS an UPDATE would reset to 'pending' ===");
console.log("BEFORE fix (cycle-wide):", JSON.stringify(brief(transfoOld)));
console.log("AFTER  fix (neq preserved):", JSON.stringify(brief(transfoNew)));

const preservedPlanHitBefore = (plansOld ?? []).some((p) => p.transformation_id === PRESERVED);
const preservedPlanHitAfter = (plansNew ?? []).some((p) => p.transformation_id === PRESERVED);
const preservedTransfoHitBefore = (transfoOld ?? []).some((t) => t.id === PRESERVED);
const preservedTransfoHitAfter = (transfoNew ?? []).some((t) => t.id === PRESERVED);

console.log("\n=== VERDICT ===");
console.log("Preserved plan would be DELETED  -> before:", preservedPlanHitBefore, "| after:", preservedPlanHitAfter);
console.log("Preserved transfo would be RESET -> before:", preservedTransfoHitBefore, "| after:", preservedTransfoHitAfter);
console.log(
  !preservedPlanHitAfter && !preservedTransfoHitAfter
    ? "\nPASS: the first transformation and its plan are now spared."
    : "\nFAIL: the first transformation is still affected.",
);
