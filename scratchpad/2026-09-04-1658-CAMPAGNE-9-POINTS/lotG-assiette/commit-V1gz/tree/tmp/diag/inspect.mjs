// Read-only diagnostic. Loads local supabase env, queries PostgREST with service role.
// Never prints secrets.
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

const USER = process.argv[2] || "92862ab2-13bf-4b42-afe0-c6c3f29d8514";

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) return { __error: res.status, __body: await res.text() };
  return res.json();
}

const cycles = await q(`user_cycles?user_id=eq.${USER}&select=id,status,active_transformation_id,created_at,updated_at&order=created_at.asc`);
console.log("=== CYCLES ===");
console.log(JSON.stringify(cycles, null, 2));

const transfos = await q(`user_transformations?user_id=eq.${USER}&select=id,cycle_id,priority_order,status,title,activated_at,created_at,updated_at&order=created_at.asc`);
console.log("=== TRANSFORMATIONS ===");
console.log(JSON.stringify(transfos, null, 2));

const plans = await q(`user_plans_v2?user_id=eq.${USER}&select=id,cycle_id,transformation_id,status,version,activated_at,created_at,updated_at&order=created_at.asc`);
console.log("=== PLANS ===");
console.log(JSON.stringify(plans, null, 2));

const psr = await q(`user_professional_support_recommendations?user_id=eq.${USER}&select=id,transformation_id,plan_id,professional_key,priority_rank,recommendation_level,status,is_active,target_level_order,generated_at,updated_at&order=updated_at.asc`);
console.log("=== PROFESSIONAL_SUPPORT_RECOMMENDATIONS ===");
console.log(JSON.stringify(psr, null, 2));

const ltr = await q(`user_level_tool_recommendations?user_id=eq.${USER}&select=id,transformation_id,plan_id,plan_version,target_level_order,priority_rank,display_name,confidence_score,status,is_active,superseded_reason,updated_at&order=updated_at.asc`);
console.log("=== LEVEL_TOOL_RECOMMENDATIONS ===");
console.log(JSON.stringify(ltr, null, 2));
