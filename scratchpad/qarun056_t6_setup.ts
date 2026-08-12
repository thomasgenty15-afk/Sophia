/**
 * Run 3 — LE CRITÈRE D'ACCEPTATION DE LA FICHE, celui que les runs 1 et 2 n'ont
 * jamais joué: « le matin je grignote en me levant » → directive durable relue
 * → la composition suivante porte un vrai petit-déjeuner.
 *
 * ⚠️ POURQUOI CE SCRIPT EXISTE, et c'est le piège du run précédent.
 * `qa056b_setup.ts` laisse `practical_constraints` vide. Or un rythme NON
 * DÉCLARÉ retombe sur le défaut à trois repas — petit-déjeuner compris — et
 * `buildActionSpace` retire les actions dont le créneau est déjà pris. Résultat:
 * `add_breakfast` n'est JAMAIS proposable à une telle persona, et le tap
 * `morning` finit à juste titre en `nothing_to_change`. Ce n'était pas un défaut
 * produit, c'était une fixture qui ne décrivait pas le scénario de la fiche.
 *
 * ⚠️ L'ORDRE COMPTE. Le rythme se pose AVANT que le moteur n'ouvre l'épisode:
 * l'empreinte (`rhythm=…|doctrine=…`) est gelée à l'ouverture, et le tap la
 * recalcule. Poser le rythme après ferait diverger les deux et le refus serait
 * légitime — on mesurerait notre propre erreur.
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import { runWeightDivergenceStep } from "../supabase/functions/_shared/keel/weight_divergence_engine.ts";

const db = admin();
const userId = Deno.args[0];
if (!userId) throw new Error("usage: qarun056_t6_setup.ts <user_id>");

// ── 1. UN RYTHME DÉCLARÉ SANS PETIT-DÉJEUNER ────────────────────────────────
const { error: rErr } = await db
  .from("student_goals")
  .update({ practical_constraints: { eating_rhythm: ["lunch", "dinner"] } })
  .eq("user_id", userId);
if (rErr) throw new Error(`rythme: ${rErr.message}`);

const { data: check, error: cErr } = await db
  .from("student_goals")
  .select("practical_constraints")
  .eq("user_id", userId)
  .maybeSingle();
if (cErr) throw new Error(`relecture: ${cErr.message}`);
console.log("rythme déclaré:", JSON.stringify(check?.practical_constraints));

// ── 2. L'ÉPISODE OUVERT PAR LA FIXTURE EST PÉRIMÉ — il porte l'ancienne
//      empreinte. On le retire et on rouvre AVEC le bon rythme.
const { error: dErr } = await db
  .from("student_weight_divergence_episodes")
  .delete()
  .eq("user_id", userId);
if (dErr) throw new Error(`purge épisode: ${dErr.message}`);

// ── 2 bis. LA PLACE DU JOUR EST DÉJÀ PRISE, et c'est le bon comportement.
// L'ouverture de la fixture a écrit `weight_divergence_question` dans le
// registre d'ask (`meal_precision_questions`, DAILY_ASK_BUDGET = 1). Rouvrir le
// même jour est donc refusé — le moteur rend `skipped`. On efface la ligne de
// CETTE persona pour pouvoir rejouer: c'est de la chirurgie de fixture, elle est
// scopée à un utilisateur jetable, et elle ne touche à aucune garde du produit.
const { error: aErr } = await db
  .from("meal_precision_questions")
  .delete()
  .eq("user_id", userId);
if (aErr) throw new Error(`registre d'ask: ${aErr.message}`);

// ── 3. LE MOTEUR RÉEL, SCOPÉ. Jamais le cron de flotte. ─────────────────────
const now = new Date();
now.setUTCHours(17, 30, 0, 0); // 19h30 Europe/Paris, la fenêtre du moteur
const out = await runWeightDivergenceStep(db, {
  userId,
  timezone: "Europe/Paris",
  optedOut: false,
  birthDate: "1990-05-04",
  locale: "fr-FR",
  now,
  dryRun: false,
  requestId: "qarun056-t6",
});
console.log("moteur:", out.outcome);

const { data: ep, error: eErr } = await db
  .from("student_weight_divergence_episodes")
  .select("id,state,plan_fingerprint")
  .eq("user_id", userId);
if (eErr) throw new Error(`épisode: ${eErr.message}`);
console.log("épisode:", JSON.stringify(ep));
