/**
 * FF-018 · SONDE ADVERSARIALE DU FILTRE 1 — pure, sans base, sans modèle.
 *
 * T-2 (`PILOT_FORCED_LOCALE = "en-US"`) rend TOUTE copie française morte au
 * rendu : on ne peut donc PAS faire sortir une phrase française d'un run réel.
 * On soumet donc le texte DIRECTEMENT au filtre, comme FF-029 et FF-011.
 */
import {
  parseMealAnalysis,
  renderMealPhotoAck,
  stripMeasurementFacts,
} from "../../../supabase/functions/_shared/keel/meal_analysis.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

say("# FF-018 — sonde du FILTRE 1 (énergie/macro), FR et EN\n");

// ── 1. LA PROSE, soumise directement au filtre ──────────────────────────────
const PROSE: Array<[string, string, "doit tomber" | "doit survivre"]> = [
  ["EN chiffre + kcal", "Roughly 450 kcal on this plate.", "doit tomber"],
  ["EN chiffre + calories", "About 450 calories.", "doit tomber"],
  ["EN 'approximately' + calories", "approximately 620 calories", "doit tomber"],
  ["EN chiffre + g protein", "There are 32 g of protein here.", "doit tomber"],
  ["EN protein: 32 g", "protein: 32 g", "doit tomber"],
  ["EN LETTRES + calories", "This is about four hundred calories.", "doit tomber"],
  ["EN LETTRES + kcal", "roughly two hundred kcal", "doit tomber"],
  ["EN qualitatif seul", "A protein-rich plate, high in fiber.", "doit survivre"],
  ["FR chiffre + calories", "Environ 200 calories dans cette assiette.", "doit tomber"],
  ["FR chiffre + kcal", "à peu près 450 kcal", "doit tomber"],
  ["FR LETTRES + calories", "Environ deux cents calories.", "doit tomber"],
  ["FR chiffre + g de protéines", "Il y a 32 g de protéines.", "doit tomber"],
  ["FR chiffre + grammes de glucides", "45 grammes de glucides.", "doit tomber"],
  ["FR qualitatif seul", "Une assiette riche en protéines.", "doit survivre"],
];

say("## 1. Prose soumise à `stripMeasurementFacts`\n");
let proseFails = 0;
for (const [label, text, expectation] of PROSE) {
  const out = stripMeasurementFacts(text);
  const redacted = String(out.value) !== text;
  const ok = expectation === "doit tomber" ? redacted : !redacted;
  if (!ok) proseFails += 1;
  say(
    `  ${ok ? "✅" : "🔴"} ${label.padEnd(28)} | ${expectation.padEnd(13)} | ${
      redacted ? "REDACTÉ" : "intact "
    } | « ${String(out.value)} »`,
  );
}
say(`\n  → ${proseFails} écart(s) sur ${PROSE.length}\n`);

// ── 2. LES CLÉS ─────────────────────────────────────────────────────────────
const KEYS: Array<[string, Record<string, unknown>, boolean]> = [
  ["calories", { calories: 450 }, true],
  ["total_kcal", { total_kcal: 450 }, true],
  ["Calories (casse)", { Calories: 450 }, true],
  ["nutritionFacts", { nutritionFacts: { a: 1 } }, true],
  ["macro_protein_g", { macro_protein_g: 32 }, true],
  ["estimated_calories", { estimated_calories: 450 }, true],
  ["energy_kj", { energy_kj: 1880 }, false],
  ["calories_estimees (FR)", { calories_estimees: 450 }, false],
  ["energie (FR)", { energie: 450 }, false],
  ["apport_calorique (FR)", { apport_calorique: 450 }, false],
];
say("## 2. Clés soumises à `stripMeasurementFacts`\n");
let keyGaps = 0;
for (const [label, payload, expectDropped] of KEYS) {
  const out = stripMeasurementFacts(payload);
  const dropped = out.dropped.length > 0;
  const ok = dropped === expectDropped;
  if (!ok) keyGaps += 1;
  say(
    `  ${ok ? "✅" : "🟠"} ${label.padEnd(24)} | attendu ${
      expectDropped ? "retiré " : "survit "
    } | obtenu ${dropped ? "retiré " : "survit "} | reste=${JSON.stringify(out.value)}`,
  );
}
say(
  `\n  → ${keyGaps} surprise(s). NOTE: une clé inconnue qui survit au filtre ne rejoint PAS\n` +
    `    la base : \`buildRecognizedPayload\` ne recopie que des champs typés.\n`,
);

// ── 3. LE CHEMIN COMPLET : ce que l'ÉLÈVE lit ───────────────────────────────
say("## 3. Le chemin complet — une sortie modèle hostile jusqu'à l'accusé\n");
const hostile = {
  detected_foods: [
    { label: "grilled chicken (about 350 calories)", food_group_ref: "poultry", confidence: 0.9 },
    { label: "brown rice, roughly two hundred calories", food_group_ref: "whole_grain", confidence: 0.9 },
  ],
  food_groups_present: ["poultry", "whole_grain"],
  food_groups_absent: [],
  portion: { band: "moderate", rationale: "About 620 kcal in total, 45 g of protein." },
  commitment_matches: [],
  assumptions: [
    {
      subject: "cooking_fat",
      assumption: "Cooked in oil, which adds roughly 120 calories.",
      basis: "standard_default",
    },
  ],
  clarifying_question: "Was that about two hundred calories of rice, or more?",
  overall_confidence: 0.8,
  image_quality: "clear",
  subject_kind: "eaten_meal",
  calories: 620,
  macros: { protein_g: 45 },
};
const parsed = parseMealAnalysis(hostile, []);
say(`  dropped_measurement_fields : ${JSON.stringify(parsed.dropped_measurement_fields)}`);
say(`  detected_foods             : ${JSON.stringify(parsed.detected_foods.map((f) => f.label))}`);
say(`  portion_rationale          : « ${parsed.portion_rationale} »`);
say(`  assumptions                : ${JSON.stringify(parsed.assumptions.map((a) => a.assumption))}`);
say(`  clarifying_question        : « ${parsed.clarifying_question} »`);
const ack = renderMealPhotoAck({
  analysis: parsed,
  binding: { kind: "none" },
  credit: null,
  commitmentTitles: {},
  hasPrescription: false,
  tickedDish: null,
  locale: "en-US",
});
say(`\n  ACCUSÉ RENDU À L'ÉLÈVE :\n  « ${ack} »`);
const survivors = [
  ...String(ack).matchAll(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|cent|cents|mille)[\w\s-]{0,25}?(kcal|calories|calorie)\b/gi,
  ),
].map((m) => m[0]);
const numeric = [...String(ack).matchAll(/\b\d[\d.,]*\s*(kcal|calories?|g\s+of\s+protein)\b/gi)].map((m) => m[0]);
say(`\n  ${numeric.length === 0 ? "✅" : "🔴"} aucun chiffre d'énergie dans l'accusé — ${JSON.stringify(numeric)}`);
say(
  `  ${survivors.length === 0 ? "✅" : "🔴"} aucune énergie EN TOUTES LETTRES dans l'accusé — ${
    JSON.stringify(survivors)
  }`,
);

await Deno.writeTextFile(
  new URL("./FF018-filter-probe.txt", import.meta.url),
  lines.join("\n") + "\n",
);
console.log("\n→ écrit");
