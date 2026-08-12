/**
 * FF-023 — RUN RÉEL: l'historique daté.
 *
 * Deux tours espacés chez un vrai élève, contre la vraie pile locale.
 * Le tour 1 est BACKDATÉ en base (3 h) pour qu'il survive à la fenêtre de
 * fraîcheur (12 h) tout en étant assez vieux pour que la marque de temps dise
 * autre chose que « à l'instant ». Le tour 2 demande explicitement l'âge du
 * tour 1: si le modèle sait répondre, c'est que le bloc daté l'a atteint.
 *
 * Tout verdict se lit en base (`chat_messages`, `turn_summary_logs`,
 * `llm_raw_response_events`), jamais dans la réponse HTTP.
 *
 * USAGE
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run -A docs/nutrition-pivot/qa-web/FF023_dated_history.ts <label>
 */
import {
  admin,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  transcript,
  turn,
} from "./harness.ts";

const LABEL = (Deno.args[0] ?? "run").replace(/[^a-z0-9_-]/gi, "");
const log = (...args: unknown[]) => console.log(`[ff023:${LABEL}]`, ...args);

async function main() {
  const coach = await makeCoach({ displayName: `FF023 ${LABEL}` });
  const student = await makeStudent({
    coach,
    timezone: "Europe/Paris",
    country: "FR",
    locale: "fr-FR",
    fullName: `FF023 ${LABEL}`,
  });
  await publishPlanFor(coach, student.userId, { timezone: "Europe/Paris" });
  log("élève", student.userId);

  // ── TOUR 1 ───────────────────────────────────────────────────────────────
  const t1 = await turn(student, "Mon frère déménage à Lisbonne ce week-end.");
  log("tour1 status", t1.status, "| réponse:", JSON.stringify(t1.reply?.slice(0, 160)));

  // Backdate: le tour 1 a maintenant 3 h. Dans la fenêtre de fraîcheur (12 h),
  // hors de « à l'instant ».
  await sql(
    `update chat_messages set created_at = now() - interval '3 hours' ` +
      `where user_id = '${student.userId}'`,
  );

  // ── TOUR 2 — la question qui ne se répond QUE si l'historique est daté ────
  const t2 = await turn(
    student,
    "Ça fait combien de temps que je t'ai parlé de mon frère ?",
  );
  log("tour2 status", t2.status, "| réponse:", JSON.stringify(t2.reply));

  // ── CE QUE LA BASE PORTE ─────────────────────────────────────────────────
  const fil = await transcript(student.userId);
  log("chat_messages:", fil.length, "lignes");
  for (const m of fil) log(`  ${m.created_at} ${m.role}: ${m.content.slice(0, 90)}`);

  const { data: turns, error: turnsErr } = await admin()
    .from("turn_summary_logs")
    .select("id,created_at,context_profile,context_elements,context_tokens,target_final,payload")
    .eq("user_id", student.userId)
    .order("id", { ascending: true });
  if (turnsErr) log("turn_summary_logs ERREUR:", turnsErr.message);
  else {
    log("turn_summary_logs:", (turns ?? []).length, "lignes");
    for (const row of (turns ?? []) as any[]) {
      log(
        `  #${row.id} profile=${row.context_profile} elements=${
          JSON.stringify(row.context_elements)
        } tokens=${row.context_tokens} target=${row.target_final} tag=${row.payload?.tag}`,
      );
    }
  }

  const { data: raws, error: rawsErr } = await admin()
    .from("llm_raw_response_events")
    .select("id,created_at,source,model,status,outcome")
    .eq("user_id", student.userId)
    .order("created_at", { ascending: true });
  if (rawsErr) log("llm_raw_response_events ERREUR:", rawsErr.message);
  else log("llm_raw_response_events:", (raws ?? []).length, "lignes");

  log("USER_ID", student.userId);
  if (Deno.env.get("FF023_KEEP") !== "1") {
    await cleanup(student.userId);
    await cleanup(coach.userId);
    log("nettoyé");
  } else {
    log("conservé (FF023_KEEP=1)");
  }
}

await main();
