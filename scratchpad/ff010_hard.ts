/**
 * FF-010 — LES MODES DE DÉFAILLANCE DE §7, JOUÉS EN VRAI.
 *
 * Chacun MUTE la base, joue trois tours, et REMET l'état. Aucun n'est simulé:
 * un plan retiré est retiré, une fenêtre périmée l'est vraiment, et la panne de
 * chargement est une VRAIE révocation de droit sur la RPC du roster — pas un
 * faux client qui rend une erreur.
 *
 * usage: deno run -A scratchpad/ff010_hard.ts
 */
import { admin, sql } from "../docs/nutrition-pivot/qa-web/harness.ts";
import { runScenario } from "./ff010_run.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff010_fixture.json", import.meta.url)),
);
const db = admin();
const out: Record<string, unknown> = {};

function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const londonToday: string = fixture.today.london;
const shrPlanId: string = fixture.households.shr.planId;

async function play(id: string, student: string, message: string) {
  const passes = await runScenario({
    id,
    level: "hard",
    student,
    message,
    runs: 3,
    fresh: true,
  });
  out[id] = passes;
  console.log(`\n=== ${id} — ${student} « ${message} »`);
  for (const p of passes) {
    console.log(`  run ${p.run}: http=${p.http} full_chars=${p.fullChars}`);
    console.log(`    « ${String(p.reply ?? "").replace(/\n/g, " ")} »`);
  }
}

// ── H2 · FOYER SANS PLAN COMPOSÉ ───────────────────────────────────────────
{
  const { error } = await db.from("student_generated_meals")
    .update({ retired_at: new Date().toISOString() } as never)
    .eq("id", shrPlanId);
  if (error) throw new Error(`retire: ${error.message}`);
  console.log("état: plan SHR retiré →", await sql(
    `select id, retired_at is not null as retired from student_generated_meals where id='${shrPlanId}';`,
  ));
  await play("H2-no-composed-plan", "rob", "What are we eating tonight?");
  const { error: back } = await db.from("student_generated_meals")
    .update({ retired_at: null } as never).eq("id", shrPlanId);
  if (back) throw new Error(`restore: ${back.message}`);
}

// ── H3 · FENÊTRE FINIE HIER ────────────────────────────────────────────────
{
  const original = await sql(
    `select starts_on, duration_days, ends_on from student_generated_meals where id='${shrPlanId}';`,
  );
  console.log("fenêtre d'origine:", original);
  const expiredStart = shift(londonToday, -3); // +3 jours ⇒ ends_on = hier
  const { error } = await db.from("student_generated_meals")
    .update({ starts_on: expiredStart } as never).eq("id", shrPlanId);
  if (error) throw new Error(`expire: ${error.message}`);
  console.log("fenêtre périmée:", await sql(
    `select starts_on, ends_on from student_generated_meals where id='${shrPlanId}';`,
  ));
  await play("H3-window-ended-yesterday", "rob", "What are we eating tonight?");
  const { error: back } = await db.from("student_generated_meals")
    .update({ starts_on: shift(londonToday, -1) } as never).eq("id", shrPlanId);
  if (back) throw new Error(`restore window: ${back.message}`);
  console.log("fenêtre remise:", await sql(
    `select starts_on, ends_on from student_generated_meals where id='${shrPlanId}';`,
  ));
}

// ── H4 · LE CHARGEMENT DU FOYER ÉCHOUE ─────────────────────────────────────
// Une VRAIE panne: on retire le droit d'exécution de la RPC du roster au rôle
// serveur. Le chargeur doit rendre `null`, journaliser, et l'agent ne doit
// RIEN prétendre savoir du plan du foyer.
{
  await sql(
    "revoke execute on function public.keel_household_roster_for(uuid) from service_role;",
  );
  console.log("droits après révocation:", await sql(
    "select proacl::text from pg_proc where proname='keel_household_roster_for';",
  ));
  await play("H4-loader-failure", "ana", "What are we eating tonight?");
  await sql(
    "grant execute on function public.keel_household_roster_for(uuid) to service_role;",
  );
  console.log("droits remis:", await sql(
    "select proacl::text from pg_proc where proname='keel_household_roster_for';",
  ));
}

await Deno.writeTextFile(
  new URL("./ff010_hard_results.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
