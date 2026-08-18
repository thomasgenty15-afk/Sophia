/**
 * CAMPAGNE FINALE — six générations réelles, entrées variées.
 *
 * Chaque scénario change UNE famille d'entrées, pour qu'un écart soit
 * attribuable. Tout est calculé contre le référentiel, préparations en lot
 * COMPRISES (le défaut de mesure du 2026-08-11: ne sommer que les ingrédients
 * propres aux plats faisait disparaître la protéine de la moitié des repas).
 *
 * Usage: deno run -A --env-file=supabase/.env scratchpad/qa_campagne_finale_20260811.ts
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  buildMealPrompt,
  parseAwayDays,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "../supabase/functions/_shared/keel/meal_generation.ts";
import { keelGenerationModel } from "../supabase/functions/_shared/keel/generation_model.ts";
import { envelopeFor } from "../supabase/functions/_shared/keel/meal_envelope.ts";
import { verdictFor } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  isFriedMethod,
  resolveIngredients,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { parseFixedIntakes } from "../supabase/functions/_shared/keel/fixed_intakes.ts";
import { parseDayProperties } from "../supabase/functions/_shared/keel/day_properties.ts";
import {
  excludedSurfaceFormsFor,
  isPlantAnalogue,
} from "../supabase/functions/_shared/keel/dietary_regime.ts";
import { findForbiddenMatches } from "../supabase/functions/_shared/keel/forbidden_matcher.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const OPENAI = Deno.env.get("OPENAI_API_KEY")!;
const index = await loadCompositionIndex(admin);
if (!index) throw new Error("référentiel indisponible");

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function bodyOf(kg: number, cm: number, g: "male" | "female", flag = false) {
  return {
    heightCm: cm,
    ageBand: "30_44" as const,
    gender: g,
    latestWeight: { weekStart: "2026-08-09", value: kg },
    latestWaist: null,
    restrictionFlag: flag,
  };
}

async function call(sys: string, usr: string) {
  const t0 = performance.now();
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
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  let t = "";
  for (const it of j.output ?? []) {
    for (const c of it.content ?? []) if (typeof c.text === "string") t += c.text;
  }
  return { text: t, ms: Math.round(performance.now() - t0) };
}

/** Les ingrédients d'un plat, PART DE LOT COMPRISE. */
function inputsOf(dish: Record<string, unknown>, preps: Map<string, Record<string, unknown>>) {
  const own = (dish.ingredients as Record<string, unknown>[]).map((i) => ({
    term: i.term, amount: i.amount ?? null, unit: i.unit ?? null, state: i.state ?? null,
  }));
  for (const u of (dish.uses ?? []) as { preparationId: string; servings?: number }[]) {
    const p = preps.get(String(u.preparationId));
    if (!p) continue;
    const made = Math.max(1, Number(p.servingsMade) || 1);
    const share = (Number(u.servings) || 1) / made;
    for (const i of (p.ingredients ?? []) as Record<string, unknown>[]) {
      own.push({
        term: i.term,
        amount: i.amount === null || i.amount === undefined ? null : Number(i.amount) * share,
        unit: i.unit ?? null,
        state: i.state ?? null,
      });
    }
  }
  return own;
}

interface Scenario {
  label: string;
  goal: string;
  body: ReturnType<typeof bodyOf> | null;
  days: number;
  rhythm: string[];
  situation?: string | null;
  context?: string | null;
  away?: unknown;
  fixed?: unknown;
  dayProps?: unknown;
  locale?: "en" | "fr";
  vegan?: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    label: "1 · Femme 55 kg · fat_loss · 3 j",
    goal: "fat_loss", body: bodyOf(55, 162, "female"), days: 3,
    rhythm: ["breakfast", "lunch", "dinner"],
  },
  {
    label: "2 · Homme 92 kg · fat_loss · 3 j",
    goal: "fat_loss", body: bodyOf(92, 186, "male"), days: 3,
    rhythm: ["breakfast", "lunch", "dinner"],
  },
  {
    label: "3 · Homme 92 kg · muscle_gain · 7 j",
    goal: "muscle_gain", body: bodyOf(92, 186, "male"), days: 7,
    rhythm: ["breakfast", "lunch", "dinner"],
  },
  {
    label: "4 · Végan · health · 3 j · absences",
    goal: "health", body: bodyOf(68, 172, "female"), days: 3,
    rhythm: ["breakfast", "lunch", "dinner"],
    context: "I am vegan.", vegan: true,
    away: [{ day: "tue", slots: ["lunch"] }],
  },
  {
    label: "5 · Sous restriction_flag · 3 j",
    goal: "fat_loss", body: bodyOf(92, 186, "male", true), days: 3,
    rhythm: ["breakfast", "lunch", "dinner"],
  },
  {
    label: "6 · Apports fixes + jours + situation · 5 j",
    goal: "recomposition", body: bodyOf(78, 175, "male"), days: 5,
    rhythm: ["breakfast", "lunch", "dinner"],
    situation: "I eat at the office canteen at lunch on Tuesdays and work late.",
    fixed: [{
      food_ref: "whey_protein_powder", label: "shaker", amount: 30, unit: "g",
      slot: "breakfast", replaces_meal: true, days: ["mon", "tue", "wed", "thu", "fri"],
    }],
    dayProps: [{ day: "sun", properties: ["batch_cook"] }],
  },
];

const ROWS: string[][] = [];

for (const s of SCENARIOS) {
  console.log(`\n${"═".repeat(74)}\n▶ ${s.label}\n${"═".repeat(74)}`);
  const days = WEEK.slice(0, s.days);
  const env = envelopeFor(s.goal as never, s.body as never, s.body?.ageBand ?? null as never, s.body?.restrictionFlag ?? false, null);
  const band = "energy" in env ? env.energy : null;
  const floor = "proteinFloorG" in env ? env.proteinFloorG : null;
  const fi = parseFixedIntakes(s.fixed).intakes;
  const dp = parseDayProperties(s.dayProps);

  console.log(
    `  mode=${env.mode}  énergie=${band ? `${band.low}-${band.high}` : "—"}  ` +
      `prot≥${floor ?? "—"}  jours=${s.days}`,
  );

  const args = {
    safetyConstraints: null, body: s.body, focusAxis: null,
    doctrineBlock: "== METHOD ==\n- Protein at every meal.\n- Vegetables carry the volume.",
    coachNoteBlock: null, protocolBlock: "", beliefKeys: ["b1"],
    goal: s.goal, situation: s.situation ?? null, context: s.context ?? null,
    mode: "to_shop" as const, scope: "several_days" as const, slot: null,
    servings: 1, pantry: [], todayToken: "mon", daysToFill: days,
    eatingRhythm: parseEatingRhythm(s.rhythm), awayDays: parseAwayDays(s.away ?? []),
    fixedIntakes: fi, dayProperties: dp, cookingTimeMin: 30,
  };
  const { systemPrompt, userMessage } = buildMealPrompt(args as never);

  let out;
  try {
    out = await call(systemPrompt, userMessage);
  } catch (e) {
    console.log(`  ❌ appel échoué: ${e instanceof Error ? e.message : e}`);
    continue;
  }
  let parsed;
  try {
    const st = out.text.indexOf("{"), en = out.text.lastIndexOf("}");
    parsed = parseGeneratedMeal(JSON.parse(out.text.slice(st, en + 1)), {
      doctrine: null, safetyConstraints: null, mode: "to_shop", scope: "several_days",
      pantry: [], beliefKeys: ["b1"], eatingRhythm: args.eatingRhythm, daysToFill: days,
      awayDays: args.awayDays, cookingTimeMin: 30, composition: index,
      fixedIntakes: fi, dayProperties: dp,
    } as never);
  } catch (e) {
    console.log(`  ❌ JSON illisible (troncature ?): ${e instanceof Error ? e.message : e}`);
    continue;
  }

  const preps = new Map<string, Record<string, unknown>>();
  for (const p of (parsed.preparations ?? []) as Record<string, unknown>[]) {
    preps.set(String(p.id), p);
  }

  let kcal = 0, prot = 0, res = 0, tot = 0;
  const veganHits: string[] = [];
  const veganTerms = s.vegan
    ? excludedSurfaceFormsFor("vegan").map((t, i) => ({ ruleId: `v${i}`, token: t }))
    : [];
  for (const d of parsed.dishes as Record<string, unknown>[]) {
    const inp = inputsOf(d, preps);
    const r = resolveIngredients(index, inp as never);
    res += (r.resolved as unknown[]).length;
    tot += inp.length;
    for (const x of r.resolved as { ref: Record<string, number>; gramsRaw: number }[]) {
      kcal += ((x.ref.energyKcal ?? 0) * x.gramsRaw) / 100;
      prot += ((x.ref.proteinG ?? 0) * x.gramsRaw) / 100;
    }
    if (s.vegan) {
      for (const i of inp) {
        if (findForbiddenMatches(String(i.term), veganTerms).length && !isPlantAnalogue(String(i.term))) {
          veganHits.push(String(i.term));
        }
      }
    }
  }
  const perDay = kcal / s.days, protDay = prot / s.days;
  const v = verdictFor({
    dishes: parsed.dishes, envelope: env, index, daysCovered: s.days,
    friedMethod: isFriedMethod, uncoverableSentinels: [], fixedIntakeInputs: [],
  } as never);

  const served = new Set((parsed.dishes as { day?: string }[]).map((d) => d.day).filter(Boolean));
  const pct = band ? Math.round((perDay / ((band.low + band.high) / 2)) * 100) : null;

  console.log(`  ${parsed.dishes.length} plats · ${(parsed.preparations ?? []).length} préparations · ${(out.ms / 1000).toFixed(0)} s`);
  console.log(`  ÉNERGIE  ${Math.round(perDay)} kcal/j${pct !== null ? `  (${pct} % de la cible)` : ""}`);
  console.log(`  PROTÉINE ${Math.round(protDay)} g/j${floor ? `  (plancher ${floor})` : ""}`);
  console.log(`  résolution ${Math.round((res / Math.max(1, tot)) * 100)} %  ·  jours servis ${served.size}/${s.days}`);
  console.log(`  VERDICT  énergie=${v.energy} protéine=${v.protein} densité=${v.density} sentinelles=${v.sentinels.missing.length}`);
  if (s.vegan) {
    console.log(`  VÉGAN    ${veganHits.length === 0 ? "✅ aucune violation" : `❌ ${veganHits.join(", ")}`}`);
  }
  if (s.body?.restrictionFlag) {
    const whole = systemPrompt + userMessage;
    const leak = /186|92 kg|\b92\b/.test(whole);
    console.log(`  PLANCHER ${leak ? "❌ FUITE de mesure dans la consigne" : "✅ aucune mesure dans la consigne"}`);
  }
  if (parsed.issues.length) console.log(`  issues: ${parsed.issues.slice(0, 3).join(" | ")}`);

  ROWS.push([
    s.label,
    `${Math.round(perDay)}`,
    band ? `${Math.round((band.low + band.high) / 2)}` : "—",
    pct !== null ? `${pct}%` : "—",
    `${Math.round(protDay)}`,
    floor ? `${floor}` : "—",
    `${Math.round((res / Math.max(1, tot)) * 100)}%`,
    `${(out.ms / 1000).toFixed(0)}s`,
  ]);
}

console.log(`\n${"═".repeat(74)}\nSYNTHÈSE\n${"═".repeat(74)}`);
console.log(
  "scénario".padEnd(40) + "kcal/j".padStart(8) + "cible".padStart(8) +
    "%".padStart(6) + "prot".padStart(6) + "plchr".padStart(7) + "résol".padStart(7) + "durée".padStart(7),
);
for (const r of ROWS) {
  console.log(
    r[0].padEnd(40) + r[1].padStart(8) + r[2].padStart(8) + r[3].padStart(6) +
      r[4].padStart(6) + r[5].padStart(7) + r[6].padStart(7) + r[7].padStart(7),
  );
}
