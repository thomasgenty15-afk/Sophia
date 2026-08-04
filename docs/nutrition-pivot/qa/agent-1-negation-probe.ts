/**
 * AGENT 1 — sonde des exceptions de négation du matcher partagé.
 *
 * Elle ne modifie rien. Elle répond à une seule question, celle qui décide si
 * une morsure de verrou est un défaut de prompt ou un défaut de matcher :
 * quelles formulations LÉGITIMES de la doctrine sont rejetées ?
 *
 *   npx deno run --allow-all docs/nutrition-pivot/qa/agent-1-negation-probe.ts
 */
import { findDoctrineViolations } from "../../../supabase/functions/_shared/keel/doctrine.ts";

const doctrine = {
  forbidden: [
    {
      token: "intermittent_fasting",
      surfaceForms: [
        "intermittent fasting", "16:8", "fasting window", "eating window",
        "time-restricted eating", "skip breakfast", "skipping breakfast",
      ],
    },
    {
      token: "detox_cleanse",
      surfaceForms: ["detox", "cleanse", "juice cleanse", "flush out toxins", "reset your system"],
    },
    {
      token: "cheat_day",
      surfaceForms: ["cheat day", "cheat meal", "treat day", "earn your food", "burn it off"],
    },
  ],
};

// Toutes ces phrases sont la doctrine EN TRAIN DE FONCTIONNER: elles refusent
// l'interdit. Celles qui mordent sont des faux positifs.
const samples = [
  "Marc doesn't do intermittent fasting.",
  "Marc does not do 16:8.",
  "Your coach doesn't run cheat days.",
  "He doesn't use detox weeks.",
  "Marc isn't a fan of intermittent fasting.",
  "That's not how Marc works - no cheat days here.",
  "Intermittent fasting is when you compress your eating into a window. Marc doesn't use it.",
  "Marc avoids intermittent fasting.",
  "No cheat days.",
  "We don't do the detox thing.",
  "Marc doesn't have you skip breakfast.",
  "Skipping breakfast isn't part of the method.",
  "A detox is not something Marc uses.",
  "Instead of intermittent fasting, keep the three meals.",
  "16:8 means eating inside an 8-hour window; it's not what we do.",
];

let bites = 0;
for (const s of samples) {
  const v = findDoctrineViolations(s, doctrine);
  if (v.length > 0) bites++;
  console.log(
    `${v.length ? "BITES " : "passes"} | ${
      v.map((x) => `${x.token}:"${x.matchedText}"`).join(", ").padEnd(34)
    } | ${s}`,
  );
}
console.log(`\n${bites}/${samples.length} legitimate doctrine sentences rejected.`);
