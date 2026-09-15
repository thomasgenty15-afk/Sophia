// L0bis — MESURE AVANT, exécutée. Zéro génération, zéro écriture.
//
// Ce que la sonde prouve, par le CHEMIN RÉEL (le chat écrit la ligne, le
// moteur la lit) : une bouche qui porte `pregnancy` reçoit aujourd'hui un
// déficit, et jusqu'où il descend.
//
// ⛔ Les modules sont IMPORTÉS, jamais recopiés.
const B = new URL("../supabase/functions/_shared/keel/", import.meta.url).href;

const { detectDeclaredMedicalCondition } = await import(B + "medical_condition_floor.ts");
const { safetyConstraintTokens, medicalConstraintTokens } = await import(
  B + "safety_constraints.ts"
);
const { mouthTargetKcal } = await import(B + "mouth_anchor.ts");
const { mouthTargetFactor } = await import(B + "household_portions.ts");
const {
  executedPaceFor,
  energyFloorFor,
  estimatedMaintenanceFor,
  ENERGY_FLOOR_KCAL,
} = await import(B + "weight_pace.ts");
const { envelopeFor, MAX_DAILY_DEFICIT_KCAL } = await import(B + "meal_envelope.ts");

const line = (s = "") => console.log(s);

line("══ ① LE CHAT EST LE SEUL ÉCRIVAIN — ce qu'il écrit ══");
for (
  const msg of [
    "je suis enceinte",
    "I'm pregnant",
    "j'ai une grossesse",
    "je suis enceinte de 5 mois et je veux perdre du poids",
    "I'm breastfeeding",
    "j'allaite",
    "je suis en plein allaitement",
    "I am diabetic",
  ]
) {
  const hit = detectDeclaredMedicalCondition(msg);
  line(
    `  ${JSON.stringify(msg).padEnd(52)} ⇒ ${
      hit ? `${hit.condition_ref} (matched="${hit.matched}")` : "null"
    }`,
  );
}

line();
line("══ ② LA CEINTURE DE SORTIE NE VOIT PAS conditionRef (justifié) ══");
const pregnancyRow = {
  id: "c_preg",
  userId: "u_preg",
  kind: "medical" as const,
  allergenRef: null,
  substanceRef: null,
  medicationClass: null,
  conditionRef: "pregnancy",
  dietRef: null,
  severity: "medical" as const,
  declaredBy: "student" as const,
  notes: "je suis enceinte",
  contentLocale: "fr-FR",
};
line(`  safetyConstraintTokens  ⇒ ${JSON.stringify(safetyConstraintTokens(pregnancyRow))}`);
line(`  medicalConstraintTokens ⇒ ${JSON.stringify(medicalConstraintTokens([pregnancyRow]))}`);

line();
line("══ ③ LE MOTEUR — un corps réel, féminin, adulte, objectif fat_loss ══");
const body = {
  heightCm: 165,
  weightKg: 68,
  gender: "female" as const,
  ageYears: 31,
  activityLevel: "sedentary" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
const subject = { body, isMinor: false };
const maintenance = estimatedMaintenanceFor(subject);
line(`  entretien estimé            = ${maintenance?.toFixed(1)} kcal/j`);
line(`  energyFloorFor("female")    = ${energyFloorFor("female")} kcal/j`);
line(`  ENERGY_FLOOR_KCAL           = ${JSON.stringify(ENERGY_FLOOR_KCAL)}`);
line(`  MAX_DAILY_DEFICIT_KCAL (A1) = ${MAX_DAILY_DEFICIT_KCAL} kcal/j`);

line();
line("  ── (a) L'ANCRE ABSOLUE — mouthTargetKcal (mouth_anchor.ts) ──");
for (const pace of [null, 0.25, 0.5, 1.0]) {
  const out = mouthTargetKcal(
    {
      memberId: "m_preg",
      ageState: "adult",
      restriction: "clear",
      body,
      direction: "down",
      paceKgPerWeek: pace,
      declaredSlots: [],
      structure: null,
    },
    "no_position",
  );
  const deficit = out.kcal === null ? null : (maintenance as number) - out.kcal;
  line(
    `    pace=${String(pace).padEnd(5)} ⇒ cible ${
      out.kcal === null ? "null" : out.kcal.toFixed(1)
    } kcal (reason=${out.reason})  ⇒ DÉFICIT ${
      deficit === null ? "—" : deficit.toFixed(1)
    } kcal/j`,
  );
}

line();
line("  ── (b) LE FACTEUR RELATIF — mouthTargetFactor (household_portions.ts) ──");
for (const pace of [null, 0.25, 0.5, 1.0]) {
  const out = mouthTargetFactor({
    ageState: "adult",
    restrictionFlag: false,
    coachCounting: "no_position",
    direction: "down",
    paceKgPerWeek: pace,
    subject,
  });
  line(
    `    pace=${String(pace).padEnd(5)} ⇒ facteur ${out.factor.toFixed(4)}  reason=${out.reason}`,
  );
}

line();
line("  ── (c) L'ENVELOPPE DU PROMPT — envelopeFor('fat_loss') ──");
const mealBody = {
  latestWeight: { value: 68, measuredAt: "2026-08-01" },
  heightCm: 165,
  gender: "female" as const,
  restrictionFlag: false,
};
for (const goal of ["maintenance", "fat_loss"] as const) {
  const env = envelopeFor(
    goal,
    mealBody as never,
    "30_44" as never,
    false,
    null,
    "sedentary" as never,
    { day: null, sport: null, asked: false },
    null,
    null,
  );
  line(
    `    goal=${goal.padEnd(12)} ⇒ energy=${JSON.stringify(env.energy)}  densityCeiling=${env.densityCeiling}`,
  );
}

line();
line("  ── (d) JUSQU'OÙ LE PLANCHER LAISSE DESCENDRE ──");
// Le plancher n'est atteint que si l'entretien est proche de lui: on balaie
// des corps réels et on montre la journée la plus basse que le moteur exécute.
let lowest = { weightKg: 0, maintenance: 0, served: Number.POSITIVE_INFINITY, clamp: "" };
for (let w = 40; w <= 110; w += 1) {
  const s = {
    body: { ...body, weightKg: w },
    isMinor: false,
  };
  const m = estimatedMaintenanceFor(s);
  if (m === null) continue;
  const ex = executedPaceFor("down", s, 1.0);
  if (ex === null) continue;
  const served = ex.maintenanceKcal - ex.dailyDeltaKcal;
  if (served < lowest.served) {
    lowest = { weightKg: w, maintenance: ex.maintenanceKcal, served, clamp: ex.clampedBy };
  }
}
line(
  `    journée la PLUS BASSE servie à une femme adulte enceinte: ${lowest.served} kcal/j ` +
    `(poids ${lowest.weightKg} kg, entretien ${lowest.maintenance}, clamp=${lowest.clamp})`,
);
line(
  `    ⇒ le plancher qui décide est energyFloorFor("female") = ${
    energyFloorFor("female")
  } kcal — il n'a jamais entendu parler de grossesse.`,
);
