/**
 * QA EN CONDITIONS RÉELLES — la chaîne de composition, scénario par scénario.
 *
 * ── POURQUOI CE HARNAIS N'APPELLE PAS L'EDGE FUNCTION ──────────────────────
 * `supabase functions serve` RECRÉE le conteneur du runtime à chaque
 * sauvegarde de fichier. Mesuré le 2026-08-11: le conteneur ne tient jamais
 * plus de 11 secondes pendant qu'une autre session écrit dans le dépôt. Une
 * génération prend 30-120 s: elle ne peut donc jamais aboutir, et Kong rend un
 * 502 qu'on prendrait à tort pour un défaut du produit (le dépôt a déjà payé
 * « Kong 502 = faux tours perdus »).
 *
 * On teste donc la MÊME chaîne, sans la couche HTTP: vraies données de la base
 * locale, vrai `buildMealPrompt`, vrai appel modèle, vrai `parseGeneratedMeal`.
 * Ce qui n'est pas couvert est nommé dans le rapport — l'authentification,
 * le routage, et les écritures en base de l'edge function.
 *
 * Usage:
 *   deno run -A --env-file=supabase/.env scratchpad/qa_real_generation_20260811.ts [scenario]
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  buildMealPrompt,
  MEAL_PROMPT_VERSION,
  parseAwayDays,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "../supabase/functions/_shared/keel/meal_generation.ts";
import { keelGenerationModel } from "../supabase/functions/_shared/keel/generation_model.ts";
import { mealBodyBlocks } from "../supabase/functions/_shared/keel/meal_body.ts";
import {
  activitySectionFor,
} from "../supabase/functions/_shared/keel/activity_floor.ts";
import { parseActivityStance } from "../supabase/functions/_shared/keel/activity_stance.ts";
import { questionsFor } from "../supabase/functions/_shared/keel/plan_feedback.ts";
import {
  excludedSurfaceFormsFor,
  isPlantAnalogue,
  parseDietaryRegime,
} from "../supabase/functions/_shared/keel/dietary_regime.ts";
import { findForbiddenMatches } from "../supabase/functions/_shared/keel/forbidden_matcher.ts";
import { envelopeFor } from "../supabase/functions/_shared/keel/meal_envelope.ts";
import { parseFixedIntakes } from "../supabase/functions/_shared/keel/fixed_intakes.ts";
import { parseDayProperties } from "../supabase/functions/_shared/keel/day_properties.ts";

const URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI = Deno.env.get("OPENAI_API_KEY")!;
const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FIXTURE_EMAIL = "meals-demo@test.dev";

// ---------------------------------------------------------------------------

function pass(label: string, detail = "") {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail = "") {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  FAILURES.push(label);
}
function info(label: string, detail = "") {
  console.log(`  ·  ${label}${detail ? ` — ${detail}` : ""}`);
}
const FAILURES: string[] = [];

/** L'appel modèle, sans la plomberie de `gemini.ts` — même modèle, même clé. */
async function callModel(
  system: string,
  user: string,
): Promise<{ text: string; ms: number; model: string }> {
  const model = keelGenerationModel();
  const t0 = performance.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // 8000 tronquait un plan de 3 jours au milieu du JSON — mesuré.
      max_output_tokens: 32000,
    }),
  });
  const ms = Math.round(performance.now() - t0);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`model ${model} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  // La forme `responses`: on concatène tout ce qui est du texte de sortie.
  let text = "";
  for (const item of json.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") text += c.text;
    }
  }
  return { text, ms, model };
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("aucun JSON dans la sortie");
  return JSON.parse(body.slice(start, end + 1));
}

// ---------------------------------------------------------------------------

interface Fixture {
  userId: string;
  goal: string;
  rhythm: unknown;
  practical: Record<string, unknown>;
  situation: string | null;
}

/** L'id de `meals-demo@test.dev`, relevé en base. `auth.users` n'est pas
 * exposé par PostgREST et `listUsers` pagine — un id figé est plus honnête
 * qu'une recherche qui peut silencieusement ne rien trouver. */
const FIXTURE_ID = "3e5f4256-7060-4fc7-a0c5-28476eb02a65";

async function loadFixture(): Promise<Fixture> {
  const u = { id: FIXTURE_ID };
  const { data: g } = await admin
    .from("student_goals")
    .select("goal, situation, practical_constraints")
    .eq("user_id", u.id)
    .maybeSingle();
  if (!g) throw new Error("la fixture n'a pas d'objectif");
  const pc = (g.practical_constraints ?? {}) as Record<string, unknown>;
  return {
    userId: u.id,
    goal: g.goal,
    rhythm: pc.eating_rhythm ?? ["breakfast", "lunch", "dinner"],
    practical: pc,
    situation: g.situation,
  };
}

/** Le socle commun d'un appel de composition. */
function baseArgs(f: Fixture, over: Record<string, unknown> = {}) {
  return {
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== METHOD ==\n- Protein at every meal.",
    coachNoteBlock: null,
    protocolBlock: "",
    beliefKeys: ["b1"],
    goal: f.goal,
    situation: f.situation,
    context: null,
    mode: "to_shop" as const,
    scope: "several_days" as const,
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "mon",
    daysToFill: ["mon", "tue", "wed"],
    eatingRhythm: parseEatingRhythm(f.rhythm),
    awayDays: [],
    fixedIntakes: [],
    dayProperties: [],
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCÉNARIOS
// ═══════════════════════════════════════════════════════════════════════════

async function scenarioNominal(f: Fixture) {
  console.log("\n▶ SCÉNARIO 1 — génération nominale (fat_loss, 3 jours, coach)");
  const args = baseArgs(f);
  const { systemPrompt, userMessage } = buildMealPrompt(args as never);

  info("version de consigne", MEAL_PROMPT_VERSION);
  info("taille du prompt", `${systemPrompt.length + userMessage.length} caractères`);

  const { text, ms, model } = await callModel(systemPrompt, userMessage);
  info("modèle réellement appelé", model);
  info("latence", `${ms} ms`);

  const parsed = parseGeneratedMeal(extractJson(text), {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: ["b1"],
    eatingRhythm: args.eatingRhythm,
    daysToFill: args.daysToFill,
    awayDays: [],
    cookingTimeMin: null,
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
  } as never);

  if (parsed.dishes.length > 0) {
    pass("des plats sont composés", `${parsed.dishes.length} plats`);
  } else {
    fail("aucun plat composé");
  }
  if (parsed.shopping_list.length > 0) {
    pass("liste de courses", `${parsed.shopping_list.length} lignes`);
  } else fail("liste de courses vide");

  // LES GRAMMAGES — la promesse produit.
  const withQty = parsed.dishes.flatMap((d: { ingredients: { quantity?: string | null }[] }) =>
    d.ingredients.filter((i) => (i.quantity ?? "").trim() !== "")
  ).length;
  const totalIng = parsed.dishes.flatMap((d: { ingredients: unknown[] }) => d.ingredients).length;
  if (totalIng > 0 && withQty / totalIng > 0.8) {
    pass("les ingrédients portent des quantités", `${withQty}/${totalIng}`);
  } else {
    fail("quantités manquantes", `${withQty}/${totalIng}`);
  }

  if (parsed.issues.length) info("issues du parseur", parsed.issues.slice(0, 5).join(" | "));
  console.log("\n  Exemple de plat:");
  const d0 = parsed.dishes[0];
  if (d0) {
    console.log(`    « ${d0.title} » (${d0.day ?? "?"} / ${d0.slot ?? "?"})`);
    for (const i of d0.ingredients.slice(0, 5)) {
      console.log(`      - ${i.term}${i.quantity ? ` (${i.quantity})` : " ⚠️ sans quantité"}`);
    }
  }
  return parsed;
}

async function scenarioVegan(f: Fixture) {
  console.log("\n▶ SCÉNARIO 2 — régime végan (le verrou est-il câblé ?)");
  const regime = parseDietaryRegime("vegan")!;
  const forms = excludedSurfaceFormsFor(regime);
  info("formes exclues connues du module", `${forms.length} termes`);

  // On passe le contexte comme un élève le ferait AUJOURD'HUI: en prose, parce
  // que le verrou n'est pas câblé dans la consigne.
  const args = baseArgs(f, { context: "I am vegan." });
  const { systemPrompt, userMessage } = buildMealPrompt(args as never);

  const wired = /vegan|vegetarian|no meat|no dairy/i.test(systemPrompt + userMessage);
  if (wired) pass("le régime atteint la consigne");
  else fail("le régime N'ATTEINT PAS la consigne (hors le contexte libre)");

  const { text } = await callModel(systemPrompt, userMessage);
  const parsed = parseGeneratedMeal(extractJson(text), {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: ["b1"],
    eatingRhythm: args.eatingRhythm,
    daysToFill: args.daysToFill,
    awayDays: [],
    cookingTimeMin: null,
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
  } as never);

  // LA VÉRIFICATION QUI COMPTE: le parseur laisse-t-il passer un ingrédient
  // interdit par le régime ?
  const terms = forms.map((t, i) => ({ ruleId: `v${i}`, token: t }));
  const violations: string[] = [];
  const exempted: string[] = [];
  for (const d of parsed.dishes) {
    for (const ing of d.ingredients) {
      const hits = findForbiddenMatches(ing.term, terms);
      if (!hits.length) continue;
      // L'exemption des analogues végétaux: « soy yogurt » porte « yogurt »
      // et n'est pas laitier. Défaut trouvé en run réel le 2026-08-11.
      if (isPlantAnalogue(ing.term)) {
        exempted.push(ing.term);
        continue;
      }
      violations.push(`${d.title}: ${ing.term}`);
    }
  }
  if (exempted.length) {
    info("analogues végétaux correctement exemptés", [...new Set(exempted)].join(", "));
  }
  if (violations.length === 0) {
    pass("aucun ingrédient non végan dans la sortie", `${parsed.dishes.length} plats`);
  } else {
    fail(
      "des ingrédients non végans sont passés",
      `${violations.length} — ex: ${violations.slice(0, 3).join(", ")}`,
    );
  }
  info(
    "état du câblage",
    "le parseur ne REJETTE pas encore sur régime (FF-042 §3) — ci-dessus est une vérification externe",
  );
  return violations;
}

function scenarioBodyAndGuards(f: Fixture) {
  console.log("\n▶ SCÉNARIO 3 — le corps et le plancher TCA (pur, sans modèle)");

  const body = {
    heightCm: 178,
    ageBand: "30_44" as const,
    gender: "male" as const,
    latestWeight: { weekStart: "2026-08-03", value: 92 },
    latestWaist: null,
    restrictionFlag: false,
  };
  const open = mealBodyBlocks(body);
  const closed = mealBodyBlocks({ ...body, restrictionFlag: true });

  if (open.whoTheyAre.some((l) => l.includes("178"))) pass("la taille entre dans la consigne");
  else fail("la taille n'entre pas");
  if (open.whereTheyAreNow.some((l) => l.includes("92"))) pass("le poids daté entre");
  else fail("le poids n'entre pas");

  const leaks = [...closed.whoTheyAre, ...closed.whereTheyAreNow].filter((l) =>
    /178|92\b/.test(l)
  );
  if (leaks.length === 0) pass("sous restriction_flag, aucune mesure ne fuit");
  else fail("FUITE sous restriction_flag", leaks.join(" | "));

  const argsOpen = baseArgs(f, { body });
  const argsClosed = baseArgs(f, { body: { ...body, restrictionFlag: true } });
  const pOpen = buildMealPrompt(argsOpen as never).userMessage;
  const pClosed = buildMealPrompt(argsClosed as never).userMessage;
  if (/178/.test(pOpen)) pass("la consigne complète porte la taille");
  else fail("la consigne ne porte pas la taille");
  if (!/178|92 kg/.test(pClosed)) pass("la consigne sous plancher ne porte rien du corps");
  else fail("FUITE dans la consigne sous plancher");
}

function scenarioMyModules(f: Fixture) {
  console.log("\n▶ SCÉNARIO 4 — mes deux modules: sont-ils atteignables ?");

  // Le retour de fin de plan
  const qs = questionsFor(f.goal as never, false);
  const qsFlag = questionsFor(f.goal as never, true);
  pass("questionsFor rend un questionnaire", `${qs.length} questions: ${qs.join(", ")}`);
  pass("sous plancher, il dégrade", `${qsFlag.length} questions: ${qsFlag.join(", ")}`);

  // L'activité
  const stance = parseActivityStance({}).stance;
  const section = activitySectionFor({
    goal: f.goal as never,
    stance,
    level: "sedentary",
    restrictionFlag: false,
    hasDeclaredCondition: false,
    isMinor: false,
    locale: "fr",
  });
  if (section) {
    pass("activitySectionFor rend une section", `${section.lines.length} lignes`);
    for (const l of section.lines) console.log(`      « ${l} »`);
  } else fail("aucune section d'activité");

  const blocked = activitySectionFor({
    goal: f.goal as never,
    stance,
    level: "sedentary",
    restrictionFlag: true,
    hasDeclaredCondition: false,
    isMinor: false,
    locale: "fr",
  });
  if (blocked === null) pass("sous plancher TCA, la section est ABSENTE");
  else fail("la section survit au plancher TCA");

  // ── ET LE POINT QUI COMPTE: est-ce branché quelque part ? ──
  info(
    "câblage",
    "AUCUN appelant en production — vérifié ci-dessous",
  );
}

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** SCÉNARIO 6 — TOUT renseigné, de la base jusqu'à l'assiette. */
async function scenarioFullProfile(f: Fixture, dayCount = 3) {
  const days = WEEK.slice(0, dayCount);
  console.log(
    `\n▶ SCÉNARIO 6 — profil COMPLET, chaîne entière (${dayCount} jours)`,
  );

  // ── 1. Le corps, lu comme la vraie fonction le lit ──────────────────────
  const { data: prof } = await admin
    .from("profiles")
    .select("height_cm, birth_date, gender")
    .eq("id", f.userId)
    .maybeSingle();
  const { data: measures } = await admin
    .from("student_body_measures")
    .select("kind, value_si, local_date")
    .eq("user_id", f.userId)
    .order("local_date", { ascending: true });

  const weights = (measures ?? []).filter((m) => m.kind === "weight");
  const waists = (measures ?? []).filter((m) => m.kind === "waist");
  const last = <T>(a: T[]) => (a.length ? a[a.length - 1] : null);
  const lw = last(weights), lwa = last(waists);

  if (prof?.height_cm) pass("taille lue en base", `${prof.height_cm} cm`);
  else fail("pas de taille");
  if (prof?.gender) pass("sexe lu", prof.gender);
  else fail("pas de sexe");
  if (prof?.birth_date) pass("naissance lue", prof.birth_date);
  else fail("pas de naissance");
  if (lw) pass("poids le plus récent", `${lw.value_si} kg (${lw.local_date})`);
  else fail("aucun poids");
  info("série de poids", weights.map((w) => `${w.value_si}`).join(" → "));

  const ageBand = ageBandFrom(prof!.birth_date as string);
  const body = {
    heightCm: prof!.height_cm as number,
    ageBand,
    gender: prof!.gender as "male",
    latestWeight: lw ? { weekStart: lw.local_date as string, value: lw.value_si as number } : null,
    latestWaist: lwa ? { weekStart: lwa.local_date as string, value: lwa.value_si as number } : null,
    restrictionFlag: false,
  };

  // ── 2. L'ENVELOPPE — le cœur du moteur ─────────────────────────────────
  const env = envelopeFor(f.goal as never, body as never, ageBand as never, false);
  console.log(`\n  ENVELOPPE: ${JSON.stringify(env)}`);
  if (env.mode === "per_kg") pass("mode per_kg (le corps est exploité)");
  else fail("mode dégradé malgré un corps complet");
  if ("energy" in env && env.energy) {
    pass("bande d'énergie calculée", `${env.energy.low}–${env.energy.high} kcal`);
  } else fail("PAS de bande d'énergie");
  if ("proteinFloorG" in env && env.proteinFloorG > 0) {
    pass("plancher protéique", `${env.proteinFloorG} g/j`);
  } else fail("pas de plancher protéique");

  // ── 3. Apports fixes et propriétés de jour, lus depuis la base ─────────
  // `parseFixedIntakes` rend `{intakes, discarded}` — pas un tableau.
  const fiParse = parseFixedIntakes(f.practical.fixed_intakes);
  const fi = fiParse.intakes;
  const dp = parseDayProperties(f.practical.day_properties);
  if (fi.length) pass("apports fixes lus", `${fi.length} (écartés: ${fiParse.discarded})`);
  else fail("apports fixes non lus", `écartés: ${fiParse.discarded}`);
  if (dp.length) pass("propriétés de jour lues", `${dp.length}`);
  else fail("propriétés de jour non lues");

  // ── 4. La consigne complète ────────────────────────────────────────────
  const args = baseArgs(f, {
    body,
    fixedIntakes: fi,
    dayProperties: dp,
    cookingTimeMin: 30,
    daysToFill: days,
  });
  const { systemPrompt, userMessage } = buildMealPrompt(args as never);
  const whole = systemPrompt + userMessage;

  const checks: [string, boolean][] = [
    ["la taille est dans la consigne", /178/.test(whole)],
    ["le poids daté est dans la consigne", /92/.test(whole)],
    ["la bande d'âge est dans la consigne", /30 to 44|30_44/.test(whole)],
    ["le sexe est dans la consigne", /male/i.test(whole)],
    ["l'apport fixe est dans la consigne", /shaker|whey|protein powder/i.test(whole)],
    ["la propriété de jour est dans la consigne", /batch|leftover/i.test(whole)],
    ["la situation est dans la consigne", /canteen/i.test(whole)],
    ["la doctrine est dans la consigne", /== METHOD ==/.test(whole)],
    ["AUCUN chiffre d'énergie sur la personne", !/\d{3,4}\s*(kcal|calories)/i.test(whole)],
  ];
  console.log("");
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);

  // ── 5. La génération réelle ────────────────────────────────────────────
  const { text, ms, model } = await callModel(systemPrompt, userMessage);
  info("modèle", model);
  info("latence", `${ms} ms (${(ms / 1000).toFixed(0)} s)`);
  info("sortie brute", `${text.length} caractères`);

  // La troncature est le mode de défaillance d'une longue fenêtre: le JSON
  // s'arrête au milieu et le parseur ne voit qu'un plan amputé.
  let raw: unknown;
  try {
    raw = extractJson(text);
    pass("JSON complet (aucune troncature)");
  } catch (e) {
    fail("JSON TRONQUÉ", e instanceof Error ? e.message : String(e));
    return;
  }

  const parsed = parseGeneratedMeal(raw, {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: ["b1"],
    eatingRhythm: args.eatingRhythm,
    daysToFill: days,
    awayDays: [],
    cookingTimeMin: 30,
    composition: null,
    fixedIntakes: fi,
    dayProperties: dp,
  } as never);

  if (parsed.dishes.length > 0) pass("plats composés", `${parsed.dishes.length}`);
  else fail("aucun plat");

  // Chaque jour demandé doit être servi — une fenêtre longue se dégrade
  // d'abord par la fin.
  const served = new Set(
    parsed.dishes.map((d: { day?: string | null }) => d.day).filter(Boolean),
  );
  const missing = days.filter((d) => !served.has(d));
  if (missing.length === 0) pass("tous les jours sont servis", days.join(", "));
  else fail("jours manquants", missing.join(", "));

  // L'apport fixe ne doit PAS être dupliqué: pas de petit-déjeuner en semaine.
  const weekdayBreakfasts = parsed.dishes.filter((d: { slot?: string | null; day?: string | null }) =>
    d.slot === "breakfast" && ["mon", "tue", "wed", "thu", "fri"].includes(d.day ?? "")
  );
  if (weekdayBreakfasts.length === 0) {
    pass("l'apport fixe n'est pas dupliqué", "aucun petit-déjeuner en semaine");
  } else {
    fail(
      "petit-déjeuner composé malgré le shaker",
      weekdayBreakfasts.map((d: { title: string }) => d.title).join(", "),
    );
  }

  if (parsed.issues.length) info("issues", parsed.issues.slice(0, 6).join(" | "));
  console.log("\n  Plats:");
  for (const d of parsed.dishes.slice(0, 6)) {
    console.log(`    ${d.day ?? "?"}/${d.slot ?? "?"} — ${d.title}`);
  }
}

function ageBandFrom(birth: string): "18_29" | "30_44" | "45_59" | "60_plus" {
  const age = Math.floor(
    (Date.parse("2026-08-11") - Date.parse(birth)) / (365.25 * 24 * 3600 * 1000),
  );
  if (age < 30) return "18_29";
  if (age < 45) return "30_44";
  if (age < 60) return "45_59";
  return "60_plus";
}

async function scenarioWiringAudit() {
  console.log("\n▶ SCÉNARIO 5 — audit de câblage (qui importe quoi, en production)");
  const modules = [
    "plan_feedback",
    "activity_floor",
    "activity_stance",
    "dietary_regime",
    "generation_model",
    "fixed_intakes",
    "day_properties",
    "meal_verdict",
    "composition_steering",
  ];
  for (const m of modules) {
    const cmd = new Deno.Command("rg", {
      args: [
        "-l",
        `from ".*/${m}\\.ts"`,
        "supabase/functions/",
        "frontend/src/",
      ],
      stdout: "piped",
      stderr: "null",
    });
    const out = new TextDecoder().decode((await cmd.output()).stdout);
    const callers = out.split("\n").filter((l) =>
      l.trim() && !l.includes("_test.ts") && !l.includes(`/${m}.ts`)
    );
    if (callers.length > 0) {
      pass(`${m}`, `${callers.length} appelant(s): ${callers.map((c) => c.split("/").pop()).join(", ")}`);
    } else {
      fail(`${m}`, "AUCUN appelant en production — module inerte");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════

const only = Deno.args[0];
const f = await loadFixture();
console.log(`Fixture: ${FIXTURE_EMAIL} — goal=${f.goal}`);
console.log(`Modèle configuré: ${keelGenerationModel()}`);

try {
  if (!only || only === "1") await scenarioNominal(f);
  if (!only || only === "2") await scenarioVegan(f);
  if (!only || only === "3") scenarioBodyAndGuards(f);
  if (!only || only === "4") scenarioMyModules(f);
  if (!only || only === "5") await scenarioWiringAudit();
  if (!only || only === "6") await scenarioFullProfile(f, 3);
  if (only === "7") await scenarioFullProfile(f, 7);
} catch (e) {
  console.error("\n💥 ARRÊT:", e instanceof Error ? e.message : String(e));
}

console.log(`\n${"═".repeat(70)}`);
console.log(FAILURES.length === 0 ? "✅ aucun échec" : `❌ ${FAILURES.length} échec(s):`);
for (const x of FAILURES) console.log(`   - ${x}`);
