/**
 * POINT 4 — LES TROIS DISQUALIFICATIONS, une par une, sur `own_plans`.
 * Chaque geste est suivi d'une RESTAURATION, pour que l'observation suivante
 * parte du meme etat: sans ca, « [] » pourrait venir du geste precedent.
 */
import { admin, rpcAs, signIn, pass, fail, info, FAILURES } from "./l3h_lib_20260812.ts";

const state = JSON.parse(await Deno.readTextFile(new URL("./l3h_state_20260812.json", import.meta.url)));
const PLAN = Deno.args[0];
const NINA_MEMBER = state.members.Nina;
const a = admin();

async function ownPlansOf(memberId: string): Promise<any[]> {
  const res = await rpcAs(null, "keel_household_roster_for", { p_user: state.owner.userId });
  const row = (res.body as any[]).find((r) => r.member_id === memberId);
  return row?.own_plans ?? null;
}

async function set(patch: Record<string, unknown>) {
  const r = await a.from("student_generated_meals").update(patch).eq("id", PLAN).select("id, plan_kind, validated_at, retired_at, household_id");
  if (r.error) throw r.error;
  return (r.data as any[])[0];
}

console.log("== POINT 4 — LES TROIS DISQUALIFICATIONS ==");
console.log("plan sous test:", PLAN, "| bouche:", NINA_MEMBER, "(Nina, secondaire)");

// Etat de reference: personnel + valide + vivant + ce foyer.
let row = await set({ plan_kind: "personal", retired_at: null, household_id: state.householdId });
info("etat de reference", JSON.stringify(row));
let op = await ownPlansOf(NINA_MEMBER);
if (Array.isArray(op) && op.length === 1) pass("REFERENCE: le plan remonte", JSON.stringify(op));
else fail("REFERENCE: le plan devrait remonter", JSON.stringify(op));

// --- (a) NON VALIDE -------------------------------------------------------
const keptValidatedAt = row.validated_at;
row = await set({ validated_at: null });
op = await ownPlansOf(NINA_MEMBER);
if (JSON.stringify(op) === "[]") pass("(a) validated_at IS NULL -> own_plans = []", JSON.stringify(row));
else fail("(a) un plan NON VALIDE remonte", JSON.stringify(op));
// restauration par la VRAIE RPC, sous le VRAI JWT de Nina.
const nina = await signIn(state.nina.email);
const v = await rpcAs(nina, "keel_validate_meal_plan", { p_plan: PLAN });
info("revalidation (JWT Nina)", `${v.status} ${JSON.stringify(v.body)}`);
op = await ownPlansOf(NINA_MEMBER);
if (Array.isArray(op) && op.length === 1) pass("(a) restaure: il remonte de nouveau");
else fail("(a) restauration ratee", JSON.stringify(op));

// --- (b) RETIRE -----------------------------------------------------------
row = await set({ retired_at: new Date().toISOString() });
op = await ownPlansOf(NINA_MEMBER);
if (JSON.stringify(op) === "[]") pass("(b) retired_at IS NOT NULL -> own_plans = []", JSON.stringify(row));
else fail("(b) un plan RETIRE remonte", JSON.stringify(op));
row = await set({ retired_at: null });
op = await ownPlansOf(NINA_MEMBER);
if (Array.isArray(op) && op.length === 1) pass("(b) restaure: il remonte de nouveau");
else fail("(b) restauration ratee", JSON.stringify(op));

// --- (c) plan_kind = 'household' -----------------------------------------
row = await set({ plan_kind: "household" });
op = await ownPlansOf(NINA_MEMBER);
if (JSON.stringify(op) === "[]") pass("(c) plan_kind='household' -> own_plans = []", JSON.stringify(row));
else fail("(c) un plan COMMUN remonte comme personnel", JSON.stringify(op));
row = await set({ plan_kind: "personal" });
op = await ownPlansOf(NINA_MEMBER);
if (Array.isArray(op) && op.length === 1) pass("(c) restaure: il remonte de nouveau");
else fail("(c) restauration ratee", JSON.stringify(op));

// --- (d) BONUS: plan ORPHELIN (household_id NULL) ------------------------
row = await set({ household_id: null });
op = await ownPlansOf(NINA_MEMBER);
if (JSON.stringify(op) === "[]") pass("(d) household_id NULL (plan orphelin) -> own_plans = []", JSON.stringify(row));
else fail("(d) un plan ORPHELIN remonte", JSON.stringify(op));
row = await set({ household_id: state.householdId });
op = await ownPlansOf(NINA_MEMBER);
if (Array.isArray(op) && op.length === 1) pass("(d) restaure: il remonte de nouveau");
else fail("(d) restauration ratee", JSON.stringify(op));

console.log(FAILURES.length === 0 ? "POINT 4: TOUT PASSE" : `POINT 4 ECHECS: ${FAILURES.join(" | ")}`);
