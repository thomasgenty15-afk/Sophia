// Integration test for fix #3 (parallel transformations) — REAL writes on a
// throwaway cycle, then narrowly-scoped cleanup of the exact rows created here.
// Scenario: cycle C with TWO active transformations (A=first/preserved, B) each
// with an ACTIVE plan. We run the EXACT sequence of the fixed
// clearServerDownstreamState (add-transformation flow, preserved = A) and assert
// that A + its plan survive active while only B is reset.
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
const MARKER = "QA_FIX3_PARALLEL_TEST";

const base = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function rest(method, path, body, prefer) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { ...base, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const get = (path) => rest("GET", path);
const insert = (table, row) => rest("POST", table, row, "return=representation");
const patch = (path, body) => rest("PATCH", path, body, "return=representation");
const del = (path) => rest("DELETE", path, undefined, "return=representation");

let cycleId, aId, bId, paId, pbId;

async function cleanup() {
  try {
    if (cycleId) {
      await del(`user_plans_v2?cycle_id=eq.${cycleId}`);
      // break FK from cycle -> active transformation before deleting transfos
      await patch(`user_cycles?id=eq.${cycleId}`, { active_transformation_id: null });
      await del(`user_transformations?cycle_id=eq.${cycleId}`);
      await del(`user_cycles?id=eq.${cycleId}`);
    }
  } catch (e) {
    console.error("cleanup error:", e.message);
  }
}

try {
  // --- SETUP ---
  const [cycle] = await insert("user_cycles", {
    user_id: USER,
    status: "draft", // avoid one-active-cycle-per-user unique index on throwaway cycle
    raw_intake_text: MARKER,
  });
  cycleId = cycle.id;

  const [a] = await insert("user_transformations", {
    cycle_id: cycleId, priority_order: 1, status: "active",
    title: `${MARKER}_A`, internal_summary: MARKER, user_summary: MARKER,
    activated_at: new Date().toISOString(),
  });
  aId = a.id;
  const [b] = await insert("user_transformations", {
    cycle_id: cycleId, priority_order: 2, status: "active",
    title: `${MARKER}_B`, internal_summary: MARKER, user_summary: MARKER,
    activated_at: new Date().toISOString(),
  });
  bId = b.id;

  const [pa] = await insert("user_plans_v2", {
    user_id: USER, cycle_id: cycleId, transformation_id: aId,
    status: "active", activated_at: new Date().toISOString(),
  });
  paId = pa.id;
  const [pb] = await insert("user_plans_v2", {
    user_id: USER, cycle_id: cycleId, transformation_id: bId,
    status: "active", activated_at: new Date().toISOString(),
  });
  pbId = pb.id;

  await patch(`user_cycles?id=eq.${cycleId}`, { active_transformation_id: aId });

  console.log("SETUP: cycle + A(active,plan) + B(active,plan), cycle.active=A");

  // --- ACT: exact fixed clearServerDownstreamState sequence, preserved = A ---
  const now = new Date().toISOString();
  const preserved = aId;

  await del(`user_plans_v2?cycle_id=eq.${cycleId}&transformation_id=neq.${preserved}`);
  await patch(
    `user_transformations?cycle_id=eq.${cycleId}&status=in.(draft,ready,pending,active)&id=neq.${preserved}`,
    { status: "pending", activated_at: null, completed_at: null, updated_at: now },
  );
  await patch(`user_cycles?id=eq.${cycleId}`, {
    status: "questionnaire_in_progress",
    active_transformation_id: preserved,
    updated_at: now,
  });

  // --- ASSERT step 1 (add-flow prep spares the first) ---
  const [aMid] = await get(`user_transformations?id=eq.${aId}&select=status`);
  const [bMid] = await get(`user_transformations?id=eq.${bId}&select=status`);
  const paMid = await get(`user_plans_v2?id=eq.${paId}&select=id,status`);
  const pbMid = await get(`user_plans_v2?id=eq.${pbId}&select=id,status`);
  const [cMid] = await get(`user_cycles?id=eq.${cycleId}&select=active_transformation_id`);

  console.log("\n=== STEP 1: after add-flow PREP (clearServerDownstreamState, preserved = A) ===");
  console.log("A (first) status:", aMid.status, "(expect active)");
  console.log("A plan present:", paMid.length === 1, "status:", paMid[0]?.status, "(expect active)");
  console.log("B (sibling) status:", bMid.status, "(expect pending)");
  console.log("B plan present:", pbMid.length === 1, "(expect false = deleted at prep)");
  console.log("cycle.active === A:", cMid.active_transformation_id === aId);

  const step1 =
    aMid.status === "active" &&
    paMid.length === 1 && paMid[0].status === "active" &&
    bMid.status === "pending" &&
    pbMid.length === 0 &&
    cMid.active_transformation_id === aId;

  // --- ACT step 2: user generates + CONFIRMS B's plan (activatePersistedPlan, preserve = A) ---
  // 2a) preview: a draft plan for B is created
  const [pbDraft] = await insert("user_plans_v2", {
    user_id: USER, cycle_id: cycleId, transformation_id: bId, status: "draft",
  });
  // 2b) confirm: exact activatePersistedPlan core writes, preserve = A
  const now2 = new Date().toISOString();
  // resolveCycleActiveTransformationId(preserve=A): A is active -> returns A
  const [aRow] = await get(`user_transformations?id=eq.${aId}&select=status`);
  const resolvedActive = aRow.status === "active" ? aId : bId;
  await patch(`user_plans_v2?id=eq.${pbDraft.id}`, { status: "active", activated_at: now2, updated_at: now2 });
  await patch(`user_transformations?id=eq.${bId}`, { status: "active", activated_at: now2, updated_at: now2 });
  // NB: activatePersistedPlan also sets cycle.status="active"; omitted here only to
  // avoid the one-active-cycle-per-user unique index on this throwaway cycle (the
  // real cycle is already active). The property under test is the preserved
  // active_transformation_id + both transformations active.
  await patch(`user_cycles?id=eq.${cycleId}`, { active_transformation_id: resolvedActive, updated_at: now2 });

  // --- ASSERT step 2 (both active in parallel, first preserved as cycle-active) ---
  const [aFin] = await get(`user_transformations?id=eq.${aId}&select=status`);
  const [bFin] = await get(`user_transformations?id=eq.${bId}&select=status`);
  const paFin = await get(`user_plans_v2?id=eq.${paId}&select=id,status`);
  const pbFin = await get(`user_plans_v2?transformation_id=eq.${bId}&status=eq.active&select=id`);
  const [cFin] = await get(`user_cycles?id=eq.${cycleId}&select=active_transformation_id`);

  console.log("\n=== STEP 2: after CONFIRM of B (activatePersistedPlan, preserve = A) ===");
  console.log("A (first) status:", aFin.status, "(expect active)");
  console.log("A plan still active:", paFin.length === 1 && paFin[0].status === "active");
  console.log("B (second) status:", bFin.status, "(expect active)");
  console.log("B has an active plan:", pbFin.length === 1);
  console.log("cycle.active === A (preserved):", cFin.active_transformation_id === aId);

  const step2 =
    aFin.status === "active" &&
    paFin.length === 1 && paFin[0].status === "active" &&
    bFin.status === "active" &&
    pbFin.length === 1 &&
    cFin.active_transformation_id === aId;

  const pass = step1 && step2;
  console.log(pass
    ? "\nPASS: 2 transformations ACTIVE in parallel; the first (+ its plan) is fully preserved and stays the cycle's active one."
    : "\nFAIL: unexpected state.");
} catch (e) {
  console.error("TEST ERROR:", e.message);
} finally {
  await cleanup();
  const leftover = await get(`user_cycles?raw_intake_text=eq.${MARKER}&select=id`).catch(() => []);
  console.log("\nCLEANUP done. Leftover test cycles:", Array.isArray(leftover) ? leftover.length : "?");
}
