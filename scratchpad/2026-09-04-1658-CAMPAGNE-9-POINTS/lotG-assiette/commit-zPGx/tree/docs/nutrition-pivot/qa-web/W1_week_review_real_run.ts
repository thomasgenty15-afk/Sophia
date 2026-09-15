// RUN RÉEL du bilan hebdomadaire contre la base LOCALE.
//
// Ce que ce script prouve et que les tests Deno ne peuvent pas voir: la
// JOINTURE entre le code et la base — la liste de colonnes SELECTionnées, le
// filtre `.not("week_facts_computed_at","is",null)` de PostgREST, l'écriture du
// jsonb, et sa relecture par le lecteur de contexte de tour.

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  composeWeekReviewBody,
  computeAndStoreWeekReview,
  loadLatestWeekReview,
  loadWeekFacts,
  readWeekReview,
} from "../../../supabase/functions/_shared/keel/week_review_io.ts";
import {
  renderDeterministicWeekReview,
  weekReviewPromptBlock,
} from "../../../supabase/functions/_shared/keel/week_review.ts";

const USER = Deno.args[0] ?? "834b36bc-5674-4c07-b12d-ec6070ba86fd";
const WEEK_START = Deno.args[1] ?? "2026-07-27";
const WEEK_END = Deno.args[2] ?? "2026-08-02";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

console.log("=== 1. LES FAITS BRUTS ===");
const facts = await loadWeekFacts(admin, {
  userId: USER,
  weekStart: WEEK_START,
  weekEnd: WEEK_END,
});
console.log(`faits: ${facts.facts.length}, taps: ${facts.pulses.length}`);
console.log(JSON.stringify(facts.facts.slice(0, 4), null, 2));

console.log("\n=== 2. CALCUL + GEL ===");
const result = await computeAndStoreWeekReview(admin, {
  userId: USER,
  weekStart: WEEK_START,
  weekEnd: WEEK_END,
  contentLocale: "en-GB",
  now: new Date("2026-08-02T18:40:00Z"),
});
console.log("outcome:", result.outcome);
console.log("branch:", result.reading?.branch);
console.log("coverage:", JSON.stringify(result.reading?.coverage));
console.log("alignment:", JSON.stringify(result.reading?.alignment, null, 2));
console.log("question:", JSON.stringify(result.reading?.question));
console.log("unevaluated:", result.reading?.unevaluatedRules);

console.log("\n=== 3. RELECTURE PAR SEMAINE (le débrief) ===");
const stored = await readWeekReview(admin, { userId: USER, weekStart: WEEK_START });
console.log("relu:", stored ? "oui" : "NON");
console.log("biofeedback:", JSON.stringify(stored?.biofeedback));

console.log("\n=== 4. RELECTURE PAR LE CONTEXTE DE TOUR ===");
const latest = await loadLatestWeekReview(admin, USER);
console.log("dernier bilan:", latest?.weekStart ?? "NON");

console.log("\n=== 5. LE TEXTE DÉTERMINISTE (le sol) ===");
if (stored) console.log(renderDeterministicWeekReview(stored.reading));

console.log("\n=== 6. LE BLOC INJECTÉ DANS CHAQUE TOUR ===");
if (stored) console.log(weekReviewPromptBlock(stored.reading, stored.biofeedback));

if (Deno.env.get("GEMINI_API_KEY")) {
  console.log("\n=== 7. LA COMPOSITION RÉELLE ===");
  // ⚠️ LA LOCALE VIENT DU PROFIL, comme en production (`studentVoiceContext`).
  // Une sonde qui code « en-GB » en dur sur un élève `fr-FR` fabrique un défaut
  // qui n'existe pas: le modèle reçoit une doctrine anglaise, un ordre d'écrire
  // en anglais, et un tutoiement à porter — il rend « for tu ». Mesuré le
  // 2026-08-06, et c'était la sonde qui avait tort.
  const { data: prof } = await admin
    .from("profiles")
    .select("full_name, locale")
    .eq("id", USER)
    .maybeSingle();
  const row = (prof ?? {}) as Record<string, unknown>;
  const locale = String(row.locale ?? "").trim() || "en-GB";
  console.log("locale du profil:", locale);
  const composed = await composeWeekReviewBody(admin, {
    userId: USER,
    firstName: String(row.full_name ?? "").trim().split(/\s+/)[0] ?? "",
    reading: stored!.reading,
    contentLocale: locale,
    requestId: "week-review-real-run",
  });
  console.log("source:", composed.source, "| reason:", composed.reason);
  console.log("BODY >>>", composed.body);
}
