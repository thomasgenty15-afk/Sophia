import { readFileSync } from "node:fs";
const envText = readFileSync(new URL("../../supabase/.env", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) return { __error: res.status, __body: await res.text() };
  return res.json();
}
const cycles = ["4556d7d1-0ef3-48b9-b345-d89f94f99bf8", "f45401a4-14c1-42e9-9205-3417364cd777"];
for (const c of cycles) {
  const t = await q(`user_transformations?cycle_id=eq.${c}&select=id,cycle_id,priority_order,status,title,activated_at,created_at,updated_at&order=created_at.asc`);
  console.log(`=== TRANSFORMATIONS for cycle ${c} ===`);
  console.log(JSON.stringify(t, null, 2));
}
// All plans by cycle to see if any plan exists for d80b967c
const plans = await q(`user_plans_v2?cycle_id=eq.f45401a4-14c1-42e9-9205-3417364cd777&select=id,transformation_id,status,version,activated_at,created_at&order=created_at.asc`);
console.log("=== ALL PLANS in active cycle ===");
console.log(JSON.stringify(plans, null, 2));
