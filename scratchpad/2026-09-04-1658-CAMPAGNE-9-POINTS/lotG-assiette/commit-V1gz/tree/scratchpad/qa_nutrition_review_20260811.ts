/**
 * REVUE NUTRITIONNELLE — les portions suivent-elles vraiment le gabarit ?
 *
 * ── LA QUESTION, POSÉE PAR LE PROPRIÉTAIRE ────────────────────────────────
 * « 200 g de yaourt le matin pour une personne qui fait 55 kg, c'est aberrant. »
 * Est-ce que le plan s'adapte réellement à la taille, au poids et à
 * l'objectif — ou est-ce qu'il sort les mêmes portions pour tout le monde ?
 *
 * ── POURQUOI ON NE JUGE PAS À L'ŒIL ───────────────────────────────────────
 * Lire un plan et le trouver « raisonnable » ne prouve rien. On a un
 * référentiel de composition en base: on CALCULE l'énergie et les protéines
 * réelles de chaque journée, et on les compare à l'enveloppe que le moteur a
 * lui-même calculée. C'est la seule façon de répondre à la question.
 *
 * Deux gabarits CONTRASTÉS, même objectif, même doctrine, même consigne — seul
 * le corps change. Si les portions ne bougent pas, le corps est décoratif.
 *
 * Usage:
 *   deno run -A --env-file=supabase/.env scratchpad/qa_nutrition_review_20260811.ts
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  buildMealPrompt,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "../supabase/functions/_shared/keel/meal_generation.ts";
import { keelGenerationModel } from "../supabase/functions/_shared/keel/generation_model.ts";
import { envelopeFor } from "../supabase/functions/_shared/keel/meal_envelope.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import { resolveIngredients } from "../supabase/functions/_shared/keel/food_composition.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const OPENAI = Deno.env.get("OPENAI_API_KEY")!;

// ---------------------------------------------------------------------------
// Les gabarits — même objectif, même doctrine. SEUL LE CORPS CHANGE.
// ---------------------------------------------------------------------------

interface Profile {
  label: string;
  heightCm: number;
  weightKg: number;
  gender: "male" | "female";
  ageBand: "18_29" | "30_44" | "45_59" | "60_plus";
  goal: string;
}

const PROFILES: Profile[] = [
  {
    label: "Femme 55 kg · 162 cm · 30-44 · fat_loss",
    heightCm: 162,
    weightKg: 55,
    gender: "female",
    ageBand: "30_44",
    goal: "fat_loss",
  },
  {
    label: "Homme 92 kg · 186 cm · 30-44 · fat_loss",
    heightCm: 186,
    weightKg: 92,
    gender: "male",
    ageBand: "30_44",
    goal: "fat_loss",
  },
  {
    label: "Homme 92 kg · 186 cm · 30-44 · muscle_gain",
    heightCm: 186,
    weightKg: 92,
    gender: "male",
    ageBand: "30_44",
    goal: "muscle_gain",
  },
];

const DAYS = ["mon", "tue", "wed"];

async function callModel(system: string, user: string) {
  const model = keelGenerationModel();
  const t0 = performance.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${OPENAI}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ role: "system", content: system }, { role: "user", content: user }],
      max_output_tokens: 32000,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  let text = "";
  for (const item of json.output ?? []) {
    for (const c of item.content ?? []) if (typeof c.text === "string") text += c.text;
  }
  return { text, ms: Math.round(performance.now() - t0) };
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const s = body.indexOf("{"), e = body.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("aucun JSON");
  return JSON.parse(body.slice(s, e + 1));
}

// ---------------------------------------------------------------------------

interface DayTotals {
  kcal: number;
  proteinG: number;
  resolved: number;
  total: number;
}

const FINDINGS: string[] = [];
const GAPS: string[] = [];
const UNRESOLVED = new Map<string, number>();
const UNWEIGHED = new Map<string, number>();

async function reviewProfile(p: Profile, index: unknown) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`▶ ${p.label}`);
  console.log("═".repeat(72));

  const body = {
    heightCm: p.heightCm,
    ageBand: p.ageBand,
    gender: p.gender,
    latestWeight: { weekStart: "2026-08-09", value: p.weightKg },
    latestWaist: null,
    restrictionFlag: false,
  };
  const env = envelopeFor(p.goal as never, body as never, p.ageBand as never, false);
  const band = "energy" in env ? env.energy : null;
  const floor = "proteinFloorG" in env ? env.proteinFloorG : null;
  console.log(
    `  ENVELOPPE  énergie ${band ? `${band.low}–${band.high} kcal/j` : "—"}` +
      `   protéines ≥ ${floor ?? "—"} g/j`,
  );

  const args = {
    safetyConstraints: null,
    body,
    focusAxis: null,
    doctrineBlock: "== METHOD ==\n- Protein at every meal.\n- Vegetables carry the volume.",
    coachNoteBlock: null,
    protocolBlock: "",
    beliefKeys: ["b1"],
    goal: p.goal,
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
  };

  const { systemPrompt, userMessage } = buildMealPrompt(args as never);
  const { text, ms } = await callModel(systemPrompt, userMessage);
  const parsed = parseGeneratedMeal(extractJson(text), {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: ["b1"],
    eatingRhythm: args.eatingRhythm,
    daysToFill: DAYS,
    awayDays: [],
    cookingTimeMin: 30,
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
  } as never);

  console.log(`  ${parsed.dishes.length} plats · ${(ms / 1000).toFixed(0)} s\n`);

  // ── LE CALCUL — on résout chaque ingrédient contre le référentiel ────────
  const byDay = new Map<string, DayTotals>();
  const dishRows: string[] = [];

  // ── LES PRÉPARATIONS COMPTENT, ET ELLES PORTENT LA PROTÉINE ─────────────
  //
  // ⚠️ DÉFAUT DE MESURE, TROUVÉ LE 2026-08-11 APRÈS TROIS CAMPAGNES FAUSSES.
  // Le générateur produit des CUISSONS EN LOT (`preparations`) que les plats
  // citent par `uses`. Un plat peut donc n'avoir que sa garniture en propre —
  // « Smoky chicken pitta » avec quatre ingrédients, et les 360 g de poulet
  // dans la préparation partagée.
  //
  // Ne sommer que `dish.ingredients` faisait donc DISPARAÎTRE la source de
  // protéine de la moitié des repas, et j'ai conclu trois fois de suite que
  // les plans étaient trois fois trop légers. C'était la mesure qui était
  // trois fois trop basse.
  const prepById = new Map<string, Record<string, unknown>>();
  for (const p of (parsed.preparations ?? []) as Record<string, unknown>[]) {
    prepById.set(String(p.id), p);
  }

  for (const d of parsed.dishes) {
    const own = d.ingredients.map((i: Record<string, unknown>) => ({
      term: i.term,
      amount: i.amount ?? null,
      unit: i.unit ?? null,
      state: i.state ?? null,
    }));
    // La part du lot qui revient à CE plat: les ingrédients de la préparation
    // sont donnés pour la TOTALITÉ de la cuisson, il faut donc les diviser par
    // le nombre de portions qu'elle produit.
    const fromPreps: typeof own = [];
    for (const u of (d.uses ?? []) as { preparationId: string; servings?: number }[]) {
      const prep = prepById.get(String(u.preparationId));
      if (!prep) continue;
      const made = Math.max(1, Number(prep.servingsMade) || 1);
      const share = (Number(u.servings) || 1) / made;
      for (const i of (prep.ingredients ?? []) as Record<string, unknown>[]) {
        const amt = i.amount === null || i.amount === undefined
          ? null
          : Number(i.amount) * share;
        fromPreps.push({
          term: i.term,
          amount: amt,
          unit: i.unit ?? null,
          state: i.state ?? null,
        });
      }
    }
    const inputs = [...own, ...fromPreps];
    const r = resolveIngredients(index as never, inputs as never);
    let kcal = 0, prot = 0;
    for (const x of r.resolved as { ref: Record<string, number>; gramsRaw: number }[]) {
      const g = x.gramsRaw ?? 0;
      kcal += ((x.ref.energyKcal ?? 0) * g) / 100;
      prot += ((x.ref.proteinG ?? 0) * g) / 100;
    }
    // ── CE QUI N'EST PAS COMPTÉ, ET POURQUOI ──────────────────────────────
    // Sans ça, un total bas se lit « le plan est trop léger » alors qu'il peut
    // dire « le référentiel ne connaît pas la moitié des aliments ». Deux
    // diagnostics opposés, et un seul chiffre pour les distinguer.
    const un = r.unresolvedTerms as string[];
    const uw = r.unweighedTerms as string[];
    if (un.length || uw.length) {
      GAPS.push(
        `${d.title}: non résolus [${un.join(", ")}] · sans poids [${uw.join(", ")}]`,
      );
    }
    for (const t of un) UNRESOLVED.set(t, (UNRESOLVED.get(t) ?? 0) + 1);
    for (const t of uw) UNWEIGHED.set(t, (UNWEIGHED.get(t) ?? 0) + 1);
    const day = d.day ?? "?";
    const cur = byDay.get(day) ?? { kcal: 0, proteinG: 0, resolved: 0, total: 0 };
    cur.kcal += kcal;
    cur.proteinG += prot;
    // ⚠️ LES CONNUS, PAS LES PESÉS. `resolved` n'est que le sous-ensemble
    // pesable; le sel et les légumes comptés à l'unité en sont absents tout en
    // étant connus. C'est `coverage` que la porte des 80 % regarde.
    cur.resolved += (r.total as number) - (r.unresolvedTerms as string[]).length;
    cur.total += inputs.length;
    byDay.set(day, cur);

    dishRows.push(
      `    ${day}/${String(d.slot ?? "?").padEnd(9)} ${
        String(Math.round(kcal)).padStart(4)
      } kcal ${String(Math.round(prot)).padStart(3)} g P — ${d.title}`,
    );
  }

  console.log("  PAR PLAT (calculé depuis le référentiel):");
  for (const row of dishRows) console.log(row);

  console.log("\n  PAR JOUR:");
  const dayKcals: number[] = [];
  for (const day of DAYS) {
    const t = byDay.get(day);
    if (!t) {
      console.log(`    ${day}: aucun plat`);
      continue;
    }
    dayKcals.push(t.kcal);
    const cov = t.total ? Math.round((t.resolved / t.total) * 100) : 0;
    const inBand = band ? t.kcal >= band.low * 0.85 && t.kcal <= band.high * 1.15 : null;
    const protOk = floor ? t.proteinG >= floor * 0.8 : null;
    console.log(
      `    ${day}: ${Math.round(t.kcal)} kcal ${inBand === null ? "" : inBand ? "✅" : "❌"}` +
        `   ${Math.round(t.proteinG)} g protéines ${protOk === null ? "" : protOk ? "✅" : "❌"}` +
        `   (résolution ${cov}%)`,
    );
  }

  const avg = dayKcals.length
    ? dayKcals.reduce((a, b) => a + b, 0) / dayKcals.length
    : 0;
  if (band) {
    const pct = Math.round((avg / ((band.low + band.high) / 2)) * 100);
    console.log(
      `\n  MOYENNE ${Math.round(avg)} kcal/j — ${pct} % du centre de bande` +
        ` (${Math.round((band.low + band.high) / 2)} kcal)`,
    );
    if (pct < 70) {
      FINDINGS.push(
        `${p.label}: ${Math.round(avg)} kcal/j servis contre ${
          Math.round((band.low + band.high) / 2)
        } visés — ${100 - pct} % SOUS la cible`,
      );
    } else if (pct > 130) {
      FINDINGS.push(
        `${p.label}: ${Math.round(avg)} kcal/j servis contre ${
          Math.round((band.low + band.high) / 2)
        } visés — ${pct - 100} % AU-DESSUS`,
      );
    }
  }
  return { avg, band, floor, label: p.label };
}

// ═══════════════════════════════════════════════════════════════════════════

const index = await loadCompositionIndex(admin);
if (!index) throw new Error("index de composition indisponible");
console.log(`Modèle: ${keelGenerationModel()} · référentiel chargé`);

const results = [];
for (const p of PROFILES) results.push(await reviewProfile(p, index));

console.log(`\n${"═".repeat(72)}`);
console.log("LE TEST QUI COMPTE — les portions suivent-elles le gabarit ?");
console.log("═".repeat(72));
for (const r of results) {
  console.log(
    `  ${r.label.padEnd(46)} ${String(Math.round(r.avg)).padStart(5)} kcal/j servis` +
      `   (cible ${r.band ? Math.round((r.band.low + r.band.high) / 2) : "—"})`,
  );
}
const small = results[0], big = results[1];
if (small && big) {
  const ratio = big.avg / (small.avg || 1);
  const targetRatio = big.band && small.band
    ? (big.band.low + big.band.high) / (small.band.low + small.band.high)
    : 1;
  console.log(
    `\n  Rapport 92 kg / 55 kg servi : ×${ratio.toFixed(2)}` +
      `   — attendu ×${targetRatio.toFixed(2)}`,
  );
  if (ratio < 1.1) {
    FINDINGS.push(
      `LES PORTIONS NE SUIVENT PAS LE GABARIT: 92 kg reçoit ×${
        ratio.toFixed(2)
      } ce que reçoit 55 kg (attendu ×${targetRatio.toFixed(2)})`,
    );
  }
}

// ── CE QUE LE CALCUL N'A PAS PU VOIR ──────────────────────────────────────
// À lire AVANT les constats: un total bas dit « plan trop léger » OU
// « référentiel trop pauvre », et seuls ces deux compteurs les distinguent.
console.log(`\n${"═".repeat(72)}`);
console.log("CE QUE LE CALCUL N'A PAS PU COMPTER");
console.log("═".repeat(72));
const top = (m: Map<string, number>) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([t, n]) => `${t}×${n}`).join(", ") || "aucun";
console.log(`  NON RÉSOLUS (absents du référentiel) : ${top(UNRESOLVED)}`);
console.log(`  SANS POIDS (quantité non convertible): ${top(UNWEIGHED)}`);

console.log(`\n${"═".repeat(72)}`);
console.log(FINDINGS.length === 0 ? "✅ aucun écart notable" : "⚠️ CONSTATS:");
for (const f of FINDINGS) console.log(`   - ${f}`);
