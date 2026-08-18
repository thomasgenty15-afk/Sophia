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

const body = {
  heightCm: 175,
  ageBand: "30_44" as const,
  gender: "male" as const,
  latestWeight: { weekStart: "2026-08-09", value: 78 },
  latestWaist: null,
  restrictionFlag: false,
};

const SCENARIOS: Array<{
  label: string;
  preferences: string;
  locale: ReportLocale;
  restrictionFlag: boolean;
  doctrineForbidden: { ruleId: string; token: string }[];
}> = [
  {
    label: "1 · FR nominal — trois envies nettes",
    preferences: "des burgers, des pizzas et du poisson",
    locale: "fr",
    restrictionFlag: false,
    doctrineForbidden: [],
  },
  {
    label: "2 · EN nominal",
    preferences: "some pasta, chicken and fruit",
    locale: "en",
    restrictionFlag: false,
    doctrineForbidden: [],
  },
  {
    label: "3 · ⚠️ NÉGATION DANS LA DEMANDE",
    preferences: "des trucs rapides, mais pas de poisson",
    locale: "fr",
    restrictionFlag: false,
    doctrineForbidden: [],
  },
  {
    label: "4 · PROSE FLOUE — ce que le champ reçoit vraiment",
    preferences: "j'ai envie de manger quelque chose de reconfortant cette semaine",
    locale: "fr",
    restrictionFlag: false,
    doctrineForbidden: [],
  },
  {
    label: "5 · SOUS PLANCHER TCA — rien ne doit sortir",
    preferences: "des burgers et des pizzas",
    locale: "fr",
    restrictionFlag: true,
    doctrineForbidden: [],
  },
  {
    label: "6 · DOCTRINE qui interdit un terme demandé",
    preferences: "des burgers et du poisson",
    locale: "fr",
    restrictionFlag: false,
    doctrineForbidden: [{ ruleId: "doctrine", token: "burger" }],
  },
];

async function call(sys: string, usr: string) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${OPENAI}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: keelGenerationModel(),
      input: [{ role: "system", content: sys }, { role: "user", content: usr }],
      max_output_tokens: 32000,
    }),
  });
  const j = await r.json();
  let t = "";
  for (const it of j.output ?? []) {
    for (const c of it.content ?? []) if (typeof c.text === "string") t += c.text;
  }
  return t;
}

console.log("\n" + "═".repeat(78));
console.log("PASSE B — GÉNÉRATIONS RÉELLES, CHAÎNE COMPLÈTE");
console.log("═".repeat(78));

const DAYS = ["mon", "tue", "wed"];

for (const s of SCENARIOS) {
  const shared = {
    safetyConstraints: null,
    body,
    focusAxis: null,
    doctrineBlock: "== METHOD ==\n- Protein at every meal.\n- Vegetables carry the volume.",
    coachNoteBlock: null,
    protocolBlock: "",
    beliefKeys: ["b1"],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop" as const,
    scope: "several_days" as const,
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "mon",
    daysToFill: DAYS,
    eatingRhythm: parseEatingRhythm(["breakfast", "lunch", "dinner"]),
    awayDays: [],
    fixedIntakes: [],
    dayProperties: [],
    cookingTimeMin: 30,
    merge: null,
    preferences: s.preferences,
  };

  let parsed;
  try {
    const { systemPrompt, userMessage } = buildMealPrompt(shared as never);
    const raw = await call(systemPrompt, userMessage);
    parsed = parseGeneratedMeal(
      JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)),
      {
        doctrine: null,
        safetyConstraints: null,
        mode: "to_shop",
        scope: "several_days",
        pantry: [],
        beliefKeys: ["b1"],
        eatingRhythm: shared.eatingRhythm,
        daysToFill: DAYS,
        awayDays: [],
        cookingTimeMin: 30,
        composition: null,
        fixedIntakes: [],
        dayProperties: [],
        merge: null,
      } as never,
    );
  } catch (e) {
    console.log(`\n${s.label}\n   ❌ ${e instanceof Error ? e.message : e}`);
    continue;
  }

  const dishes = reportable(parsed.dishes as never);
  const rep = reportOnRequest({
    preferences: s.preferences,
    dishes,
    houseRuleTerms: [],
    previouslyReportedAbsent: [],
  });
  const gated = gateRequestReport({
    report: rep,
    locale: s.locale,
    restrictionFlag: s.restrictionFlag,
    doctrineForbidden: s.doctrineForbidden,
  });

  console.log(`\n${s.label}`);
  console.log(`   envie   : « ${s.preferences} »`);
  console.log(`   plan    : ${dishes.map((d) => `${d.day ?? "?"}/${d.title}`).join(" | ")}`);
  console.log(
    `   termes  : ${
      rep.terms.map((t) => `${t.term}=${t.status}`).join(" · ") || "(aucun)"
    }   illisibles: ${rep.unreadableCount}`,
  );
  console.log(`   refus   : ${gated.refusal ?? "aucun"}`);
  for (const l of gated.lines) console.log(`   ▸ ${l}`);
  if (gated.lines.length === 0) console.log("   ▸ (aucune ligne)");

  // ── LA GARDE DE TON SUR LE `why`, vérifiée sur du réel ─────────────────
  const whys = (parsed.dishes as { why?: string }[]).map((d) => d.why ?? "");
  const vides = whys.filter((w) => !w.trim()).length;
  const guilt = parsed.issues.filter((i: string) => i.includes("guilt_tripping"));
  console.log(`   why     : ${whys.length} plats, ${vides} vides, ${guilt.length} effacés pour ton`);
}
