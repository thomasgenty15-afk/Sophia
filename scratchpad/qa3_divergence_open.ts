/**
 * FF-056 — ouvre UN épisode de divergence sur UNE persona, sans balayer la flotte.
 *
 * Pourquoi pas le cron `keel-daily-recommendation-v1` : il itère sur tous les
 * élèves avec un simple curseur `after_user_id`, sans filtre par utilisateur.
 * L'appeler ouvrirait des épisodes chez les fixtures des autres sessions —
 * l'incident « batch fantôme » que le cadre QA décrit explicitement.
 * On appelle donc `runWeightDivergenceStep`, qui EST le moteur réel appelé par
 * le cron (`keel-daily-recommendation-v1:231`), scopé sur la persona du run.
 * La question d'ouverture reste produite par le moteur ; toute la conversation
 * qui suit passe par le chemin IA réel (`test-send-message`, `force_full_ai`).
 */
import { admin, makeCoach, makeStudent, publishPlanFor } from "../docs/nutrition-pivot/qa-web/harness.ts";
import { runWeightDivergenceStep } from "../supabase/functions/_shared/keel/weight_divergence_engine.ts";

const TZ = "Europe/Paris";
const db = admin();

const coach = await makeCoach({ displayName: "QA3 divergence", country: "FR" });
const student = await makeStudent({ coach, locale: "fr-FR", country: "FR", timezone: TZ });
await publishPlanFor(coach, student.userId, { timezone: TZ, contentLocale: "fr-FR" });
await db.auth.admin.updateUserById(student.userId, {
  user_metadata: { is_test_persona: true },
});

// ── L'objectif porte une direction: `fat_loss` => "down" ────────────────────
const { error: goalErr } = await db.from("student_goals").insert({
  user_id: student.userId,
  goal: "fat_loss",
  situation: "QA FF-056",
  content_locale: "fr-FR",
} as never);
if (goalErr) throw new Error(`student_goals: ${goalErr.message}`);

// ── La série qui DIVERGE: objectif descendre, le poids monte ────────────────
// ⚠️ CALIBRAGE VÉRIFIÉ CONTRE LE DÉTECTEUR, PAS DEVINÉ. La règle porte sur les
// TROIS DERNIERS points (`run.slice(-DIVERGENCE_MIN_WEEKS_AWAY)`), pas sur toute
// la série: un premier essai 80,0/80,4/80,8/81,3 sortait `noisy` parce que
// 80,4 -> 81,3 ne fait que +1,119 %, sous le seuil de 1,2 %. Le détecteur avait
// raison. Ici 80,5 -> 82,0 = +1,86 %, chaque pas >= 0,1 % et contre le sens.
const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const minus = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
};
const serie = [
  { days: 21, kg: 80.0 },
  { days: 14, kg: 80.5 },
  { days: 7, kg: 81.2 },
  { days: 0, kg: 82.0 },
];
for (const p of serie) {
  const when = minus(p.days);
  const { error } = await db.from("student_body_measures").insert({
    user_id: student.userId,
    measured_at: new Date(when.setHours(8, 0, 0, 0)).toISOString(),
    local_date: iso(minus(p.days)),
    kind: "weight",
    value_si: p.kg,
    source: "chat",
    content_locale: "fr-FR",
  } as never);
  if (error) throw new Error(`mesure ${p.days}: ${error.message}`);
}

// ── UN PLAN COMPOSÉ ET TERMINÉ ─────────────────────────────────────────────
// Le moteur exige `lastElapsedPlanEnd` (student_generated_meals, ends_on < today,
// retired_at null) puis ≥ 2 jours écoulés depuis la fin: c'est la règle qui
// laisse le jour de fin de plan à FF-054. Sans lui: `no_completed_plan`.
const { error: planErr } = await db.from("student_generated_meals").insert({
  user_id: student.userId,
  scope: "several_days",
  mode: "from_pantry",
  dishes: [],
  content_locale: "fr-FR",
  // `ends_on` est GÉNÉRÉE (starts_on + duration_days) — ne pas l'insérer.
  starts_on: iso(minus(10)),
  duration_days: 7,
} as never);
if (planErr) throw new Error(`student_generated_meals: ${planErr.message}`);

// ── 19 h 30 heure locale de l'élève (fenêtre 19-20 du moteur) ───────────────
const now = new Date();
now.setUTCHours(17, 30, 0, 0); // Europe/Paris = UTC+2 en août
const out = await runWeightDivergenceStep(db, {
  userId: student.userId,
  timezone: TZ,
  optedOut: false,
  birthDate: "1990-05-04",
  locale: "fr-FR",
  now,
  dryRun: false,
  requestId: "qa3-divergence",
});

console.log("MOTEUR:", JSON.stringify(out));

const { data: ep } = await db.from("student_weight_divergence_episodes")
  .select("*").eq("user_id", student.userId);
console.log("ÉPISODE:", JSON.stringify(ep));

const { data: msg } = await db.from("chat_messages")
  .select("role,content,created_at").eq("user_id", student.userId)
  .order("created_at", { ascending: false }).limit(2);
console.log("MESSAGES:", JSON.stringify(msg));

const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anon },
  body: JSON.stringify({ email: student.email, password: "1234567" }),
});
const tok = await res.json();
await Deno.writeTextFile(
  new URL("./qa3_persona.json", import.meta.url),
  JSON.stringify({ user_id: student.userId, email: student.email, access_token: tok.access_token }),
);
console.log("persona écrite (token non affiché)");
