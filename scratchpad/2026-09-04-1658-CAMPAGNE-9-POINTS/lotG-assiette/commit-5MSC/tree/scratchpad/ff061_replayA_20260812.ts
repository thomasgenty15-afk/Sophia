/**
 * FF-061 — LE COMPTE-RENDU EN CONDITIONS RÉELLES.
 *
 * Deux passes:
 *
 *   A. REJEU sur les `preferences` déjà en base — ce que le champ contient
 *      VRAIMENT, par opposition à la prose que les tests ont inventée;
 *   B. GÉNÉRATIONS RÉELLES — vraie consigne, vrai modèle, vrai parseur, puis
 *      la chaîne complète jusqu'aux phrases affichées.
 *
 * Ce qu'on cherche, dans l'ordre du coût:
 *   1. un `absent` FAUX — le produit annonce un refus qu'il n'a pas fait;
 *   2. un `served` FAUX — il annonce servi ce qui ne l'est pas;
 *   3. une phrase qui sort alors qu'une porte aurait dû la retenir.
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  buildMealPrompt,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "../supabase/functions/_shared/keel/meal_generation.ts";
import { keelGenerationModel } from "../supabase/functions/_shared/keel/generation_model.ts";
import {
  type ReportableDish,
  reportOnRequest,
} from "../supabase/functions/_shared/keel/request_report.ts";
import {
  gateRequestReport,
  type ReportLocale,
} from "../supabase/functions/_shared/keel/request_report_gate.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const OPENAI = Deno.env.get("OPENAI_API_KEY")!;

/** Un plat du parseur devient un plat lisible par le compte-rendu. */
function reportable(dishes: readonly Record<string, unknown>[]): ReportableDish[] {
  return dishes.map((d, i) => ({
    id: String(d.id ?? `dish_${i}`),
    title: String(d.title ?? ""),
    method: String(d.method ?? ""),
    day: d.day === null || d.day === undefined ? null : String(d.day),
    ingredients: ((d.ingredients ?? []) as Record<string, unknown>[]).map((x) => ({
      term: String(x?.term ?? ""),
    })),
  }));
}

// ===========================================================================
// PASSE A — LE REJEU SUR LE RÉEL
// ===========================================================================

console.log("═".repeat(78));
console.log("PASSE A — REJEU SUR LES `preferences` DÉJÀ EN BASE");
console.log("═".repeat(78));

const { data: rows, error } = await admin
  .from("student_generated_meals")
  .select("id, preferences, dishes, content_locale")
  .not("preferences", "is", null)
  .order("created_at", { ascending: false })
  .limit(200);
if (error) throw new Error(error.message);

let replayed = 0;
for (const row of (rows ?? []) as Record<string, unknown>[]) {
  const prefs = String(row.preferences ?? "").trim();
  if (!prefs) continue;
  replayed++;
  const dishes = reportable((row.dishes ?? []) as Record<string, unknown>[]);
  const rep = reportOnRequest({
    preferences: prefs,
    dishes,
    houseRuleTerms: [],
    previouslyReportedAbsent: [],
  });
  const locale: ReportLocale = String(row.content_locale ?? "fr").startsWith("en")
    ? "en"
    : "fr";
  const gated = gateRequestReport({
    report: rep,
    locale,
    restrictionFlag: false,
    doctrineForbidden: [],
  });
  console.log(`\n── « ${prefs} »   [${locale}, ${dishes.length} plats]`);
  console.log(
    `   termes: ${
      rep.terms.map((t) => `${t.term}=${t.status}`).join(" · ") || "(aucun)"
    }   illisibles: ${rep.unreadableCount}`,
  );
  for (const l of gated.lines) console.log(`   ▸ ${l}`);
  if (gated.lines.length === 0) console.log(`   ▸ (rien — refus: ${gated.refusal})`);
}
console.log(`\nlignes rejouées: ${replayed}`);

// ===========================================================================
// PASSE B — GÉNÉRATIONS RÉELLES
// ===========================================================================

