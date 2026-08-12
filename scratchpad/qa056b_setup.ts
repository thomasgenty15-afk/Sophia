/**
 * FF-056 · LOT BOUTONS — provisionne N personas AVEC un épisode ouvert.
 *
 * Même calibrage que `qa3_divergence_open.ts` (ses quatre pièges y sont
 * expliqués: seuil 1,2 % sur les trois derniers points, plan composé ET terminé
 * depuis >= 2 jours, `ends_on` GÉNÉRÉE, CHECK fermés sur `scope`/`mode`).
 *
 * ⚠️ ON N'APPELLE JAMAIS `keel-daily-recommendation-v1`: il balaie la flotte au
 * curseur et ouvrirait des épisodes chez les fixtures des autres sessions.
 * `runWeightDivergenceStep` est le moteur réel, scopé sur UNE persona.
 *
 * Plafond de 3 élèves par coach: un coach pour deux personas.
 *
 * Usage: deno run -A qa056b_setup.ts <n> [locale]
 */
import {
  admin,
  makeCoach,
  makeStudent,
  publishPlanFor,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { runWeightDivergenceStep } from "../supabase/functions/_shared/keel/weight_divergence_engine.ts";

const N = Number(Deno.args[0] ?? "1");
const LOCALE = Deno.args[1] ?? "fr-FR";
const TZ = LOCALE.startsWith("fr") ? "Europe/Paris" : "Europe/London";
const db = admin();

const iso = (d: Date) => d.toISOString().slice(0, 10);
const minus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const out: unknown[] = [];
let coach = await makeCoach({ displayName: "QA056B", country: "FR" });
for (let i = 0; i < N; i++) {
  if (i > 0 && i % 2 === 0) {
    coach = await makeCoach({ displayName: `QA056B-${i}`, country: "FR" });
  }
  const student = await makeStudent({
    coach,
    locale: LOCALE,
    country: LOCALE.startsWith("fr") ? "FR" : "GB",
    timezone: TZ,
  });
  await publishPlanFor(coach, student.userId, {
    timezone: TZ,
    contentLocale: LOCALE,
  });
  await db.auth.admin.updateUserById(student.userId, {
    user_metadata: { is_test_persona: true },
  });

  const g = await db.from("student_goals").insert({
    user_id: student.userId,
    goal: "fat_loss",
    situation: "QA FF-056 boutons",
    content_locale: LOCALE,
  } as never);
  if (g.error) throw new Error(`student_goals: ${g.error.message}`);

  for (const p of [
    { days: 21, kg: 80.0 },
    { days: 14, kg: 80.5 },
    { days: 7, kg: 81.2 },
    { days: 0, kg: 82.0 },
  ]) {
    const when = minus(p.days);
    const m = await db.from("student_body_measures").insert({
      user_id: student.userId,
      measured_at: new Date(when.setHours(8, 0, 0, 0)).toISOString(),
      local_date: iso(minus(p.days)),
      kind: "weight",
      value_si: p.kg,
      source: "chat",
      content_locale: LOCALE,
    } as never);
    if (m.error) throw new Error(`mesure: ${m.error.message}`);
  }

  const pl = await db.from("student_generated_meals").insert({
    user_id: student.userId,
    scope: "several_days",
    mode: "from_pantry",
    dishes: [],
    content_locale: LOCALE,
    starts_on: iso(minus(10)),
    duration_days: 7,
  } as never);
  if (pl.error) throw new Error(`student_generated_meals: ${pl.error.message}`);

  // 19 h 30 heure locale (fenêtre 19-20 du moteur).
  const now = new Date();
  now.setUTCHours(LOCALE.startsWith("fr") ? 17 : 18, 30, 0, 0);
  const step = await runWeightDivergenceStep(db, {
    userId: student.userId,
    timezone: TZ,
    optedOut: false,
    birthDate: "1990-05-04",
    locale: LOCALE,
    now,
    dryRun: false,
    requestId: `qa056b-${i}`,
  });

  const { data: ep, error: epErr } = await db
    .from("student_weight_divergence_episodes")
    .select("id,state,category,turn_count,opened_local_date")
    .eq("user_id", student.userId);
  if (epErr) throw new Error(`episodes: ${epErr.message}`);

  // LES BOUTONS SONT EN BASE, PAS DANS LA RÉPONSE DU MOTEUR.
  const { data: msg, error: msgErr } = await db
    .from("chat_messages")
    .select("id,content,metadata,created_at")
    .eq("user_id", student.userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1);
  if (msgErr) throw new Error(`chat_messages: ${msgErr.message}`);

  const tokRes = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify({ email: student.email, password: "1234567" }),
    },
  );
  const tok = await tokRes.json();

  out.push({
    idx: i,
    user_id: student.userId,
    locale: LOCALE,
    outcome: step.outcome,
    episode: ep,
    opening_content: (msg ?? [])[0]?.content ?? null,
    opening_buttons:
      ((msg ?? [])[0]?.metadata as Record<string, unknown> | null)?.buttons ?? null,
    access_token: tok.access_token,
  });
  console.log(
    `#${i} ${student.userId} outcome=${step.outcome} buttons=${
      ((((msg ?? [])[0]?.metadata as Record<string, unknown> | null)?.buttons ?? []) as unknown[]).length
    }`,
  );
}

await Deno.writeTextFile(
  new URL(`./qa056b_personas_${Deno.args[2] ?? LOCALE}.json`, import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(`\n${out.length} personas écrites (jetons non affichés).`);
console.log(
  JSON.stringify(
    out.map((o) => {
      const r = o as Record<string, unknown>;
      return {
        user_id: r.user_id,
        outcome: r.outcome,
        content: r.opening_content,
        buttons: r.opening_buttons,
      };
    }),
    null,
    2,
  ),
);
