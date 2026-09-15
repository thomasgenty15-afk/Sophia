// L8-B (2e passe) — LA CONTRE-PREUVE DE P4, SUR UNE CASSEROLE REELLE ET FIXE.
// On lit le plan TEMOIN b2eecc78 (sized=0 : les grammes y sont EXACTEMENT ceux
// que le modele a ecrits), et on rejoue `sizeBoxesFromTarget` avec plusieurs
// jeux de cibles. Meme texte de modele, memes boites, seules les CIBLES bougent.
const B = "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/";
const { memberTargetFactor, sizeBoxesFromTarget } = await import(B + "household_portions.ts");

const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CTRL = "b2eecc78-cff4-4e45-b52d-df333fa59c4d";
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const row = await fetch(
  `http://127.0.0.1:54321/rest/v1/student_generated_meals?id=eq.${CTRL}&select=preparations`,
  { headers: H },
).then((r) => r.json());
const preparations = row[0].preparations as Array<Record<string, unknown>>;

const PAUL = "30730edf-846c-4ea4-901d-39c9caaf7fee";
const NINA = "e3d77550-6f51-411e-9d0c-8bd36c3d07a2";
const TOM = "8183690c-96c2-4ded-a818-f1edc36862c0";
const LEA = "e62e2bbd-b675-4fe2-be7d-9dd98510ee98";
const NAME: Record<string, string> = { [PAUL]: "Paul", [NINA]: "Nina", [TOM]: "Tom", [LEA]: "Lea" };
// Les corps REELS de `household_member_bodies`, releves en base ce jour.
const BODIES: Record<string, unknown> = {
  [PAUL]: { heightCm: 162, weightKg: 55, gender: "female", ageYears: 38, activityLevel: null },
  [NINA]: { heightCm: 170, weightKg: 85, gender: "female", ageYears: 34, activityLevel: null },
  [TOM]: { heightCm: 145, weightKg: 36, gender: "male", ageYears: 11, activityLevel: null },
  [LEA]: { heightCm: 128, weightKg: 26, gender: "female", ageYears: 8, activityLevel: null },
};
// `restrictionFlag` REEL: fail-closed pour une bouche sans compte (Tom, Lea).
const HAS_CTX: Record<string, boolean> = { [PAUL]: true, [NINA]: true, [TOM]: false, [LEA]: false };
const AGE: Record<string, string> = { [PAUL]: "adult", [NINA]: "adult", [TOM]: "minor", [LEA]: "minor" };

function factors(spec: Record<string, { goal: string | null; pace: number | null }>) {
  const m = new Map<string, number>();
  const reasons: Record<string, string> = {};
  for (const id of [PAUL, NINA, TOM, LEA]) {
    const s = spec[id] ?? { goal: null, pace: null };
    const member = {
      memberId: id, displayName: NAME[id], goal: s.goal, ageState: AGE[id],
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

const preps = preparations.map((p) => ({
  id: String(p.id ?? p.title),
  title: String(p.title ?? ""),
  boxes: (p.boxes as Array<Record<string, unknown>>).map((b) => ({
    id: String(b.id), memberIds: b.member_ids as string[], grams: Number(b.grams),
  })),
  readyGrams: null,
}));

const SC: Array<[string, Record<string, { goal: string | null; pace: number | null }>]> = [
  ["Ⓐ AUCUNE cible (l'etat de la base au 18/08 : 0 rythme sur 66 bouches)", {}],
  ["Ⓑ LA FIXTURE POSEE (Paul perte 0,5 · Nina prise 0,4 · Tom perte 0,3)", {
    [PAUL]: { goal: "fat_loss", pace: 0.5 }, [NINA]: { goal: "muscle_gain", pace: 0.4 },
    [TOM]: { goal: "fat_loss", pace: 0.3 },
  }],
  ["Ⓒ cibles INVERSEES (Paul prise 0,5 · Nina perte 0,4)", {
    [PAUL]: { goal: "muscle_gain", pace: 0.5 }, [NINA]: { goal: "fat_loss", pace: 0.4 },
    [TOM]: { goal: "fat_loss", pace: 0.3 },
  }],
  ["Ⓓ crans MODESTES (0,1 kg/sem pour les deux adultes)", {
    [PAUL]: { goal: "fat_loss", pace: 0.1 }, [NINA]: { goal: "muscle_gain", pace: 0.1 },
  }],
  ["Ⓔ seule Nina a une cible", { [NINA]: { goal: "muscle_gain", pace: 0.4 } }],
];

for (const [label, spec] of SC) {
  const { m, reasons } = factors(spec);
  const res = sizeBoxesFromTarget(preps as never, m, 1.1);
  console.log(`\n${label}`);
  console.log("   facteurs: " + [PAUL, NINA, TOM, LEA].map((id) =>
    `${NAME[id]}=${(m.get(id) ?? 1).toFixed(3)}[${reasons[id]}]`).join("  "));
  console.log(`   compteurs: boxes=${res.counts.boxes} sized=${res.counts.sized} unchanged=${res.counts.unchanged} shared_mixed=${res.counts.shared_mixed}`);
  for (const p of preps) {
    const gs = p.boxes.map((b) => res.grams.get(b.id) ?? b.grams);
    const per = p.boxes.map((b, i) =>
      `${NAME[b.memberIds[0]] ?? "?"}:${gs[i]}`).join(" ");
    console.log(`   ${p.title.padEnd(30)} spread_g = ${String(Math.max(...gs) - Math.min(...gs)).padStart(4)}   [${per}]`);
  }
}
