/**
 * L1 — outillage des runs réels du lot « désarmement de l'épingle de locale ».
 *
 * Fixtures préfixées `l1_`. La vérité est en base: chaque verdict cite
 * `user_chat_states.temp_memory->>'conversation_locale'` et le texte rendu.
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

export { languageOf } from "./l1_lang.ts";
export type { LangVerdict } from "./l1_lang.ts";

export type Trace = {
  turn_id: string;
  response_owner: string;
  risk_band: string | null;
  phase: string | null;
  visible_task_kind: string | null;
  visible_fallback_used: boolean | null;
  visible_generation_failed: boolean | null;
  emergency_numbers: string | null;
  suicide_number: string | null;
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
    emergency_numbers: ctx?.safety_resources?.emergency_numbers ?? null,
    suicide_number: ctx?.safety_resources?.suicide_prevention_number ?? null,
    direct_effects: row.direct_effects ?? [],
    route_reason: row.route_decision?.reason ?? null,
  };
}

/** L'ANCRE, relue en base — la vérité du lot, pas la réponse HTTP. */
export async function anchoredLocale(userId: string): Promise<string | null> {
  const { data } = await admin()
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", userId)
    .maybeSingle();
  return ((data as any)?.temp_memory ?? {})["conversation_locale"] ?? null;
}

/**
 * ⚠️ La clé primaire est `(user_id, scope)`, PAS `user_id`. Un `upsert` sur
 * `user_id` seul échoue (« no unique or exclusion constraint »), et un
 * `.eq('user_id')` sans `scope` toucherait plusieurs lignes — la cicatrice
 * `rls-is-not-a-substitute-for-eq-user-id` dans sa version « clé composite ».
 * On cible donc la ligne relue, scope compris, et on VÉRIFIE l'écriture.
 */
export async function setAnchor(userId: string, locale: string | null) {
  const db = admin();
  const { data } = await db.from("user_chat_states")
    .select("temp_memory,scope").eq("user_id", userId);
  const rows = (data ?? []) as Array<{ temp_memory: any; scope: string }>;
  if (rows.length === 0) throw new Error("setAnchor: aucune ligne user_chat_states");
  for (const row of rows) {
    const tm = { ...(row.temp_memory ?? {}) };
    if (locale === null) delete tm["conversation_locale"];
    else tm["conversation_locale"] = locale;
    const { error } = await db.from("user_chat_states")
      .update({ temp_memory: tm } as never)
      .eq("user_id", userId).eq("scope", row.scope);
    if (error) throw new Error(`setAnchor: ${error.message}`);
  }
  const readBack = await anchoredLocale(userId);
  if (readBack !== locale) {
    throw new Error(`setAnchor: relecture=${readBack}, attendu=${locale}`);
  }
}

/** Un élève complet: coach + lien + plan publié + semaine adoptée. */
export async function provision(opts: {
  country?: string | null;
  locale?: string;
  coach?: Coach;
  timezone?: string;
  label?: string;
}): Promise<{ coach: Coach; student: Student }> {
  const coach = opts.coach ?? await makeCoach({ displayName: "l1 coach" });
  const student = await makeStudent({
    coach,
    country: opts.country as any,
    locale: opts.locale ?? "en-US",
    timezone: opts.timezone ?? "Europe/Paris",
    fullName: `l1_${opts.label ?? "student"}`,
  });
  await publishPlanFor(coach, student.userId);
  return { coach, student };
}
