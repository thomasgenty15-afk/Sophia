/**
 * VÉRIFICATION DE LA MISE À L'ÉCHELLE — sur de vraies générations.
 *
 * Une génération par scénario, puis: énergie AVANT, facteur, énergie APRÈS.
 * Le verdict est recalculé sur les ingrédients mis à l'échelle, exactement
 * comme le ferait le parseur une fois le module câblé.
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  buildMealPrompt,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "../supabase/functions/_shared/keel/meal_generation.ts";
import { keelGenerationModel } from "../supabase/functions/_shared/keel/generation_model.ts";
import { envelopeFor } from "../supabase/functions/_shared/keel/meal_envelope.ts";
import { foldPreparationsIntoDishes, verdictFor } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  isFriedMethod,
  resolveIngredients,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import {
  isScalableUnit,
  scaleFactorsFor,
  scaleIngredients,
} from "../supabase/functions/_shared/keel/portion_scaling.ts";
import { PROTEIN_SOURCES } from "../supabase/functions/_shared/keel/tokens.ts";
import { resolveIngredient } from "../supabase/functions/_shared/keel/food_composition.ts";

/** Cet aliment appartient-il à un groupe protéique du référentiel ? */
const PROTEIN_SET = new Set<string>(PROTEIN_SOURCES);
function isProteinFood(term: string): boolean {
  const ref = resolveIngredient(index!, term);
  return ref ? PROTEIN_SET.has(String(ref.foodGroupRef)) : false;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const OPENAI = Deno.env.get("OPENAI_API_KEY")!;
const index = await loadCompositionIndex(admin);
if (!index) throw new Error("référentiel indisponible");

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const b = (kg: number, cm: number, g: "male" | "female", flag = false) => ({
  heightCm: cm, ageBand: "30_44" as const, gender: g,
  latestWeight: { weekStart: "2026-08-09", value: kg },
  latestWaist: null, restrictionFlag: flag,
});

const SCENARIOS = [
  { label: "1 · Femme 55 kg · fat_loss · 3 j", goal: "fat_loss", body: b(55, 162, "female"), days: 3 },
  { label: "2 · Homme 92 kg · fat_loss · 3 j", goal: "fat_loss", body: b(92, 186, "male"), days: 3 },
  { label: "3 · Homme 92 kg · muscle_gain · 3 j", goal: "muscle_gain", body: b(92, 186, "male"), days: 3 },
  { label: "4 · Homme 78 kg · recomposition · 5 j", goal: "recomposition", body: b(78, 175, "male"), days: 5 },
  { label: "5 · Femme 68 kg · health · 3 j", goal: "health", body: b(68, 172, "female"), days: 3 },
  { label: "6 · Sous restriction_flag · 3 j", goal: "fat_loss", body: b(92, 186, "male", true), days: 3 },
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

/** L'énergie de la fenêtre, préparations comprises. */
function energyOf(
  dishes: Record<string, unknown>[],
  preps: Map<string, Record<string, unknown>>,
): { kcal: number; prot: number; resolved: number; total: number; scalableKcal: number; proteinFoodKcal: number; otherScalableKcal: number; proteinFoodProteinG: number; unweighedDense: boolean } {
  let kcal = 0, prot = 0, resolved = 0, total = 0, scalableKcal = 0;
  let proteinFoodKcal = 0, otherScalableKcal = 0, proteinFoodProteinG = 0;
  let unweighedDense = false;
  for (const d of dishes) {
    const own = (d.ingredients as Record<string, unknown>[]).map((i) => ({
      term: i.term, amount: i.amount ?? null, unit: i.unit ?? null, state: i.state ?? null,
    }));
    for (const u of (d.uses ?? []) as { preparationId: string; servings?: number }[]) {
      const p = preps.get(String(u.preparationId));
      if (!p) continue;
      const share = (Number(u.servings) || 1) / Math.max(1, Number(p.servingsMade) || 1);
      for (const i of (p.ingredients ?? []) as Record<string, unknown>[]) {
        own.push({
          term: i.term,
          amount: i.amount === null || i.amount === undefined ? null : Number(i.amount) * share,
          unit: i.unit ?? null, state: i.state ?? null,
        });
      }
    }
    // `ResolvedIngredient` ne porte que `ref` et `gramsRaw` — pas le terme. On
    // résout donc les DEUX SOUS-ENSEMBLES séparément pour attribuer l'énergie
    // à la part que la mise à l'échelle peut réellement déplacer (g et ml).
    // ⚠️ LE MÊME PRÉDICAT QUE `scaleIngredients`, importé et non recopié. Deux
    // listes d'unités divergent au premier élargissement, et le facteur se
    // remet alors à porter sur une assiette qui n'est pas celle qu'on déplace.
    const isScalable = (i: { unit?: unknown; amount?: unknown }) =>
      isScalableUnit(i.unit as string | null) && typeof i.amount === "number";
    const sum = (list: typeof own) => {
      const rr = resolveIngredients(index!, list as never);
      let e = 0, pr = 0;
      for (const x of rr.resolved as { ref: Record<string, number>; gramsRaw: number }[]) {
        e += ((x.ref.energyKcal ?? 0) * x.gramsRaw) / 100;
        pr += ((x.ref.proteinG ?? 0) * x.gramsRaw) / 100;
      }
      // ⚠️ LE COMPTEUR EST `coverage`, PAS `resolved.length`. Le tableau
      // `resolved` ne contient que les termes PESÉS: le sel, le poivre et « 2
      // poivrons » sans poids d'unité en sont absents tout en étant connus.
      // Compter le tableau donnait 69 % là où la couverture donne 96 %, et la
      // mise à l'échelle s'abstenait sur des condiments.
      const known = rr.total - rr.unresolvedTerms.length;
      return { e, pr, n: known, dense: rr.unweighedEnergyDense };
    };
    const scalableList = own.filter(isScalable);
    const protList = scalableList.filter((i) => isProteinFood(String(i.term)));
    const otherList = scalableList.filter((i) => !isProteinFood(String(i.term)));
    const p = sum(protList);
    const o = sum(otherList);
    const fixed = sum(own.filter((i) => !isScalable(i)));
    resolved += p.n + o.n + fixed.n;
    if (p.dense || o.dense || fixed.dense) unweighedDense = true;
    total += own.length;
    kcal += p.e + o.e + fixed.e;
    prot += p.pr + o.pr + fixed.pr;
    scalableKcal += p.e + o.e;
    proteinFoodKcal += p.e;
    otherScalableKcal += o.e;
    proteinFoodProteinG += p.pr;
  }
  return { kcal, prot, resolved, total, scalableKcal, proteinFoodKcal, otherScalableKcal, proteinFoodProteinG, unweighedDense };
}

const ROWS: string[][] = [];

for (const s of SCENARIOS) {
  const days = WEEK.slice(0, s.days);
  const env = envelopeFor(s.goal as never, s.body as never, "30_44" as never, s.body.restrictionFlag, null);
  const band = "energy" in env ? env.energy : null;
  const floor = "proteinFloorG" in env ? env.proteinFloorG : null;
  const args = {
    safetyConstraints: null, body: s.body, focusAxis: null,
    doctrineBlock: "== METHOD ==\n- Protein at every meal.\n- Vegetables carry the volume.",
    coachNoteBlock: null, protocolBlock: "", beliefKeys: ["b1"],
    goal: s.goal, situation: null, context: null,
    mode: "to_shop" as const, scope: "several_days" as const, slot: null,
    servings: 1, pantry: [], todayToken: "mon", daysToFill: days,
    eatingRhythm: parseEatingRhythm(["breakfast", "lunch", "dinner"]),
    awayDays: [], fixedIntakes: [], dayProperties: [], cookingTimeMin: 30,
    // Lane individuelle: pas de foyer fusionné. REQUIS, jamais omis.
    merge: null,
  };
  const { systemPrompt, userMessage } = buildMealPrompt(args as never);

  let parsed;
  try {
    const t = await call(systemPrompt, userMessage);
    parsed = parseGeneratedMeal(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)), {
      doctrine: null, safetyConstraints: null, mode: "to_shop", scope: "several_days",
      pantry: [], beliefKeys: ["b1"], eatingRhythm: args.eatingRhythm, daysToFill: days,
      awayDays: [], cookingTimeMin: 30, composition: index, fixedIntakes: [], dayProperties: [],
      // LA MÊME VALEUR QUE `buildMealPrompt`, sinon la consigne demande un plat
      // que le parseur jette. Les deux bouts, toujours.
      merge: null,
    } as never);
  } catch (e) {
    console.log(`${s.label}: ❌ ${e instanceof Error ? e.message : e}`);
    continue;
  }

  const preps = new Map<string, Record<string, unknown>>();
  for (const p of (parsed.preparations ?? []) as Record<string, unknown>[]) preps.set(String(p.id), p);

  const before = energyOf(parsed.dishes as never, preps);
  const factor = scaleFactorsFor({
    computedKcal: before.kcal,
    computedProteinG: before.prot,
    proteinFoodKcal: before.proteinFoodKcal,
    otherScalableKcal: before.otherScalableKcal,
    proteinFoodProteinG: before.proteinFoodProteinG,
    envelope: env,
    daysCovered: s.days,
    resolvedShare: before.resolved / Math.max(1, before.total),
  });

  // ── LA MISE À L'ÉCHELLE, appliquée comme le parseur le ferait ───────────
  let after = before;
  let changed = 0;
  if (factor !== null) {
    const scaledDishes = (parsed.dishes as Record<string, unknown>[]).map((d) => {
      const r = scaleIngredients(d.ingredients as never, factor, isProteinFood);
      changed += r.changed;
      return { ...d, ingredients: r.items };
    });
    const scaledPreps = new Map<string, Record<string, unknown>>();
    for (const [id, p] of preps) {
      const r = scaleIngredients(p.ingredients as never, factor, isProteinFood);
      changed += r.changed;
      scaledPreps.set(id, { ...p, ingredients: r.items });
    }
    after = energyOf(scaledDishes as never, scaledPreps);
  }

  // ── UN PLAN INCOMPLET SE LIT COMME UN PLAN SOUS-PORTÉ ───────────────────
  // `kcal / s.days` divise par les jours DEMANDÉS. Si le modèle n'a rempli que
  // deux jours sur trois, le quotient tombe d'un tiers sans qu'aucune portion
  // n'ait rétréci — et on conclurait « la génération sous-porte » sur un plan
  // qui, jour par jour, est peut-être juste. Les deux défauts appellent des
  // réparations opposées, donc on les sépare AVANT de conclure.
  const jours = new Set(
    (parsed.dishes as { day?: string | null }[]).map((d) => d.day ?? "?"),
  );
  const repasParJour = (parsed.dishes as unknown[]).length / Math.max(1, jours.size);
  const kcalParJourRempli = before.kcal / Math.max(1, jours.size);

  const target = band ? (band.low + band.high) / 2 : null;
  const pctBefore = target ? Math.round((before.kcal / s.days / target) * 100) : null;
  const pctAfter = target ? Math.round((after.kcal / s.days / target) * 100) : null;
  // ⚠️ LES PRÉPARATIONS SONT PLIÉES DANS LES PLATS. Sans ça, le verdict lit
  // 41 % d'énergie et 51 % de protéine en moins — le défaut mesuré le
  // 2026-08-12, qui faisait rendre « below/under » sur des plans à 99 % de
  // leur cible.
  const v = verdictFor({
    dishes: foldPreparationsIntoDishes({
      dishes: parsed.dishes as never,
      preparations: (parsed.preparations ?? []) as never,
    }),
    envelope: env, index, daysCovered: s.days,
    friedMethod: isFriedMethod, uncoverableSentinels: [], fixedIntakeInputs: [],
  } as never);

  console.log(
    `${s.label}\n` +
      `   AVANT ${Math.round(before.kcal / s.days)} kcal/j${pctBefore ? ` (${pctBefore} %)` : ""}` +
      `  prot ${Math.round(before.prot / s.days)}${floor ? `/${floor}` : ""}` +
      `  résol ${Math.round((before.resolved / Math.max(1, before.total)) * 100)} %\n` +
      `   PLAN ${jours.size}/${s.days} jours remplis · ${(parsed.dishes as unknown[]).length} plats ` +
      `(${repasParJour.toFixed(1)}/jour)` +
      `${target ? ` · ${Math.round(kcalParJourRempli)} kcal par jour REMPLI (${Math.round((kcalParJourRempli / target) * 100)} %)` : ""}\n` +
      `   FACTEUR ${factor === null ? "aucun (abstention)" : `protéine ×${factor.protein.toFixed(2)} · reste ×${factor.other.toFixed(2)} — ${changed} ingr.`}\n` +
      `   APRÈS ${Math.round(after.kcal / s.days)} kcal/j${pctAfter ? ` (${pctAfter} %)` : ""}` +
      `  prot ${Math.round(after.prot / s.days)}${floor ? `/${floor}` : ""}` +
      `  [verdict initial: ${v.energy}/${v.protein}` +
      `${v.resolution.unweighedEnergyDense ? " · DENSE NON PESÉ" : ""}` +
      `${v.resolution.unresolvedEnergyDense ? " · DENSE INCONNU" : ""}]\n`,
  );

  ROWS.push([
    s.label,
    `${Math.round(before.kcal / s.days)}`,
    pctBefore ? `${pctBefore}%` : "—",
    factor === null ? "—" : `${factor.protein.toFixed(2)}/${factor.other.toFixed(2)}`,
    `${Math.round(after.kcal / s.days)}`,
    pctAfter ? `${pctAfter}%` : "—",
    `${Math.round(before.prot / s.days)}→${Math.round(after.prot / s.days)}`,
    floor ? `${floor}` : "—",
  ]);
}

console.log("═".repeat(96));
console.log(
  "scénario".padEnd(38) + "avant".padStart(7) + "%".padStart(6) + "facteur".padStart(9) +
    "après".padStart(7) + "%".padStart(6) + "protéines".padStart(12) + "plancher".padStart(10),
);
for (const r of ROWS) {
  console.log(
    r[0].padEnd(38) + r[1].padStart(7) + r[2].padStart(6) + r[3].padStart(9) +
      r[4].padStart(7) + r[5].padStart(6) + r[6].padStart(12) + r[7].padStart(10),
  );
}
