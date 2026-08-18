// L8-B — LA CONTRE-PREUVE DE P4, SANS BRUIT DE MODELE.
// Meme casserole, meme texte de modele: on rejoue `sizeBoxesFromTarget` avec
// PLUSIEURS jeux de cibles et on lit l'ecart entre les boites d'une meme
// preparation. Si l'ecart ne bouge pas, le lot est decoratif.
const B = "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/";
const { memberTargetFactor, sizeBoxesFromTarget } = await import(B + "household_portions.ts");

const raw = JSON.parse(await Deno.readTextFile("scratchpad/l8b_raw_p4b_parsed_20260818.json"));
const PAUL = "30730edf-846c-4ea4-901d-39c9caaf7fee";
const NINA = "e3d77550-6f51-411e-9d0c-8bd36c3d07a2";
const TOM = "8183690c-96c2-4ded-a818-f1edc36862c0";
const LEA = "e62e2bbd-b675-4fe2-be7d-9dd98510ee98";
const BODIES: Record<string, unknown> = {
  [PAUL]: { heightCm: 162, weightKg: 55, gender: "female", ageYears: 38, activityLevel: null },
  [NINA]: { heightCm: 170, weightKg: 85, gender: "female", ageYears: 34, activityLevel: null },
  [TOM]: { heightCm: 145, weightKg: 36, gender: "male", ageYears: 11, activityLevel: null },
  [LEA]: { heightCm: 128, weightKg: 26, gender: "female", ageYears: 8, activityLevel: null },
};
// `restrictionFlag` REEL du run: les deux mineurs n'ont pas de compte, donc
// aucun contexte de corps, donc fail-closed (`body: null` chez l'appelant).
const HAS_CTX: Record<string, boolean> = { [PAUL]: true, [NINA]: true, [TOM]: false, [LEA]: false };
const AGE: Record<string, string> = { [PAUL]: "adult", [NINA]: "adult", [TOM]: "minor", [LEA]: "minor" };

function factors(spec: Record<string, { goal: string | null; pace: number | null }>) {
  const m = new Map<string, number>();
  const reasons: Record<string, string> = {};
  for (const id of [PAUL, NINA, TOM, LEA]) {
    const s = spec[id] ?? { goal: null, pace: null };
    const member = {
      memberId: id, displayName: id.slice(0, 4), goal: s.goal, ageState: AGE[id],
      body: HAS_CTX[id] ? { restrictionFlag: false } : null,
      eatingSlots: null, habits: [], habitNote: null,
    };
    const out = memberTargetFactor(member as never, {
      coachCounting: "no_position", paceKgPerWeek: s.pace, body: BODIES[id] as never,
    });
    reasons[id] = out.reason;
    if (out.factor !== 1) m.set(id, out.factor);
  }
  return { m, reasons };
}

const preps = raw.preparations.map((p: Record<string, unknown>) => ({
  id: p.id as string,
  boxes: (p.boxes as Array<Record<string, unknown>>).map((b) => ({
    id: b.id as string, memberIds: b.member_ids as string[], grams: b.grams as number,
  })),
  readyGrams: null, // non reconstructible ici: on isole l'effet de la CIBLE
}));

const SCENARIOS: Array<[string, Record<string, { goal: string | null; pace: number | null }>]> = [
  ["Ⓐ AUCUNE cible (la base entiere au 18/08)", {}],
  ["Ⓑ les cibles POSEES (Paul perte 0,5 · Nina prise 0,4)", {
    [PAUL]: { goal: "fat_loss", pace: 0.5 }, [NINA]: { goal: "muscle_gain", pace: 0.4 },
    [TOM]: { goal: "fat_loss", pace: 0.3 },
  }],
  ["Ⓒ cibles INVERSEES (Paul prise 0,5 · Nina perte 0,4)", {
    [PAUL]: { goal: "muscle_gain", pace: 0.5 }, [NINA]: { goal: "fat_loss", pace: 0.4 },
    [TOM]: { goal: "fat_loss", pace: 0.3 },
  }],
  ["Ⓓ crans MODESTES (0,1 kg/sem pour les deux)", {
    [PAUL]: { goal: "fat_loss", pace: 0.1 }, [NINA]: { goal: "muscle_gain", pace: 0.1 },
  }],
  ["Ⓔ seule Nina a une cible", { [NINA]: { goal: "muscle_gain", pace: 0.4 } }],
];

for (const [label, spec] of SCENARIOS) {
  const { m, reasons } = factors(spec);
  const res = sizeBoxesFromTarget(preps as never, m, 1.1);
  console.log(`\n${label}`);
  console.log(`   facteurs: ` + [PAUL, NINA, TOM, LEA].map((id) =>
    `${id.slice(0, 4)}=${(m.get(id) ?? 1).toFixed(3)}[${reasons[id]}]`).join("  "));
  console.log(`   compteurs: boxes=${res.counts.boxes} sized=${res.counts.sized} unchanged=${res.counts.unchanged} shared_mixed=${res.counts.shared_mixed}`);
  for (const p of preps) {
    const gs = p.boxes.map((b: { id: string; grams: number }) => res.grams.get(b.id) ?? b.grams);
    console.log(`   ${p.id.padEnd(20)} spread_g = ${String(Math.max(...gs) - Math.min(...gs)).padStart(4)}   [${gs.join(", ")}]`);
  }
}
