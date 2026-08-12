/**
 * Fixture du run « photo libre » — la preuve de bout en bout qui manquait.
 *
 * ⚠️ POURQUOI ON PASSE PAR LE TAP DE FF-057 ET PAS PAR UNE PHRASE.
 * La lane conversationnelle n'a pas produit de fait hors-plan sur ma fixture:
 * sans fait, `gatePhotoInvitation` refuse sur `no_committed_fact` — à juste
 * titre. Le tap « j'ai commandé », lui, écrit le fait LUI-MÊME
 * (`writeOffPlanTapFact`), donc il ne dépend pas du plancher de déclaration.
 * C'est le chemin le plus court vers la mesure qui compte.
 *
 * ⚠️ LE BUDGET SE CONSOMME PAR UNE LIGNE DE LEDGER, PAS PAR UN ÉPISODE.
 * Première tentative: ouvrir un épisode de divergence pour prendre la place du
 * jour. Raté — l'épisode ARME une question, et le tour suivant s'y faisait
 * rabattre (`armed_resolution`). La question armée vit sur le MESSAGE, pas sur
 * l'épisode: la refermer ne la désarme pas. On écrit donc directement la ligne
 * qui représente la sollicitation déjà partie.
 */
import { admin, makeCoach, makeStudent, publishPlanFor } from "../docs/nutrition-pivot/qa-web/harness.ts";

const db = admin();
const TZ = "Europe/Paris";
const today = new Date().toISOString().slice(0, 10);

const coach = await makeCoach({ displayName: "QA photo", country: "FR" });
const student = await makeStudent({
  coach,
  locale: "fr-FR",
  country: "FR",
  timezone: TZ,
});
await publishPlanFor(coach, student.userId, {
  timezone: TZ,
  contentLocale: "fr-FR",
});
await db.auth.admin.updateUserById(student.userId, {
  user_metadata: { is_test_persona: true },
});

// ── UN PLAN QUI COUVRE AUJOURD'HUI, AVEC UN PLAT ────────────────────────────
const plan = await db.from("student_generated_meals").insert({
  user_id: student.userId,
  scope: "several_days",
  mode: "from_pantry",
  content_locale: "fr-FR",
  starts_on: today,
  duration_days: 7,
  dishes: [{ day: today, slot: "dinner", title: "poulet-riz" }],
} as never).select("id").maybeSingle();
if (plan.error) throw new Error(`plan: ${plan.error.message}`);
const mealId = String((plan.data as { id?: string } | null)?.id ?? "");
if (!mealId) throw new Error("plan sans identifiant");

// ── LA PLACE DU JOUR EST DÉJÀ PRISE ─────────────────────────────────────────
// C'est LE cas que le lot corrige: avant, ce ledger fermait l'invitation photo.
const ask = await db.from("meal_precision_questions").insert({
  user_id: student.userId,
  local_date: today,
  source: "chat",
  axis: null,
  question: "Si tu manges ce qui est prévu, normalement ça devrait descendre.",
  asked_for_message_id: `qaphoto-divergence-${today}`,
  ask_kind: "weight_divergence_question",
} as never);
if (ask.error) throw new Error(`ledger: ${ask.error.message}`);

const tok = await fetch(
  `${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: JSON.stringify({ email: student.email, password: "1234567" }),
  },
).then((r) => r.json());

await Deno.writeTextFile(
  new URL("./qa056b_personas_qarun.json", import.meta.url),
  JSON.stringify([{
    user_id: student.userId,
    locale: "fr-FR",
    access_token: tok.access_token,
  }], null, 2),
);

console.log(`USER=${student.userId}`);
console.log(`MEAL=${mealId}`);
console.log(`ORDERED_PAYLOAD=KEEL_FIX_ORDERED|meal_tick:${mealId}:0`);
console.log("budget du jour: 1 ligne (weight_divergence_question) — déjà consommé");
