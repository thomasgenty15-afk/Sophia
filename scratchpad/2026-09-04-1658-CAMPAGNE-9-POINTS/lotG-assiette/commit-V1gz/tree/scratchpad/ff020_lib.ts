/**
 * FF-020 — outillage commun des runs réels de revalidation crise.
 * Fixtures préfixées ff020_. Aucune écriture hors profils/coach_clients/plans.
 */
import {
  admin,
  makeCoach,
  makeStudent,
  publishPlanFor,
  turn,
  type Coach,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

export { admin, makeCoach, makeStudent, publishPlanFor, turn };
export type { Coach, Student };

export type Trace = {
  turn_id: string;
  response_owner: string;
  risk_band: string | null;
  phase: string | null;
  visible_task_kind: string | null;
  visible_fallback_used: boolean | null;
  visible_generation_failed: boolean | null;
  visible_failure_reason: string | null;
  emergency_numbers: string | null;
  suicide_number: string | null;
  must_include: boolean | null;
  status: string | null;
  reducer_reason_code: string | null;
  direct_effects: unknown[];
  route_reason: string | null;
};

export async function lastTrace(userId: string): Promise<Trace | null> {
  const { data } = await admin()
    .from("conversation_turn_traces")
    .select(
      "turn_id,response_owner,turn_frame,route_decision,skill_run,direct_effects,ts",
    )
    .eq("user_id", userId)
    .order("ts", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as any;
  if (!row) return null;
  const diag = row.skill_run?.output?.diagnosis ?? row.skill_run?.diagnosis ??
    null;
  const ctx = diag?.visible_task?.conversation_context ?? null;
  return {
    turn_id: row.turn_id,
    response_owner: row.response_owner,
    risk_band: row.turn_frame?.safety?.risk_band ?? null,
    phase: diag?.phase ?? null,
    visible_task_kind: diag?.visible_task?.kind ?? null,
    visible_fallback_used: diag?.visible_fallback_used ?? null,
    visible_generation_failed: diag?.visible_generation_failed ?? null,
    visible_failure_reason: diag?.visible_failure_reason ?? null,
    emergency_numbers: ctx?.safety_resources?.emergency_numbers ?? null,
    suicide_number: ctx?.safety_resources?.suicide_prevention_number ?? null,
    must_include: ctx?.safety_resources?.must_include_emergency_numbers ?? null,
    status: row.skill_run?.output?.status ?? row.skill_run?.status ?? null,
    reducer_reason_code: diag?.reducer_reason_code ?? null,
    direct_effects: row.direct_effects ?? [],
    route_reason: row.route_decision?.reason ?? null,
  };
}

/**
 * Le working_state du flow safety, relu en base (temp_memory).
 *
 * ⚠️ LA CLÉ EST `__active_conversation_skill_v1` (skills/_shared/active_skill_state.ts).
 * La première version de cette sonde lisait `active_conversation_skill_state`,
 * une clé qui n'existe pas: elle rendait `null` sur TOUS les tours, y compris
 * en pleine crise — un faux vert de sonde, exactement T-15.
 */
export const ACTIVE_SKILL_KEY = "__active_conversation_skill_v1";

export async function safetyState(userId: string): Promise<any> {
  const { data } = await admin()
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", userId)
    .maybeSingle();
  const tm = (data as any)?.temp_memory ?? {};
  const raw = tm[ACTIVE_SKILL_KEY] ?? tm.__active_skill_state ??
    tm.active_skill_state ?? null;
  if (!raw) return null;
  return raw;
}

export async function tempMemory(userId: string): Promise<any> {
  const { data } = await admin()
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.temp_memory ?? null;
}

/** Un élève complet: coach + lien + plan publié + semaine adoptée. */
export async function provision(opts: {
  country?: string | null;
  locale?: string;
  coach?: Coach;
  timezone?: string;
}): Promise<{ coach: Coach; student: Student }> {
  const coach = opts.coach ?? await makeCoach({ displayName: "ff020 coach" });
  const student = await makeStudent({
    coach,
    country: opts.country as any,
    locale: opts.locale ?? "en-US",
    timezone: opts.timezone ?? "Europe/Paris",
    fullName: "ff020 student",
  });
  await publishPlanFor(coach, student.userId);
  return { coach, student };
}

export function say(label: string, value: unknown) {
  console.log(`  ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
}
