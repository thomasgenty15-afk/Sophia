#!/usr/bin/env -S deno run --allow-read
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA SÉRIE T, SIMULÉE AVANT D'ÊTRE TIRÉE — point 8 de la campagne
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ AUCUN APPEL MODÈLE. On rejoue les fonctions PURES du produit — celles-là
 * mêmes que les deux lanes appellent — pour écrire, heure par heure, ce que le
 * produit fait AUJOURD'HUI. C'est le seul moyen honnête de dire « rouge » avant
 * d'avoir dépensé trois minutes de génération, et de choisir les heures qui
 * valent un tir réel.
 *
 * ⚠️ ON IMPORTE, ON NE RECOPIE PAS. Un instrument recopié mesure l'instrument.
 */
import {
  cookingAskedToday,
  leadDayFor,
  proposedWindowStart,
  SHOPPING_CUTOFF_HOUR,
  SLOT_PASSED_HOUR,
  slotsPassedToday,
} from "../../supabase/functions/_shared/keel/plan_hours.ts";
import { withoutSpentFirstDay } from "../../supabase/functions/_shared/keel/meal_plan_window.ts";
import type { EatingOccasion } from "../../supabase/functions/_shared/keel/meal_generation.ts";

const TODAY = "2026-09-10"; // un jeudi; la date exacte n'entre dans aucune règle
const TOMORROW = "2026-09-11";

type Rythme = { nom: string; slots: EatingOccasion[] };
const RYTHMES: Rythme[] = [
  { nom: "b/l/d", slots: ["breakfast", "lunch", "dinner"] },
  { nom: "b/l/goûter/d", slots: ["breakfast", "lunch", "snack_pm", "dinner"] },
  { nom: "b/l (sans dîner)", slots: ["breakfast", "lunch"] },
];
const HEURES = [7, 9, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, null];

console.log(`SHOPPING_CUTOFF_HOUR=${SHOPPING_CUTOFF_HOUR}`);
console.log(
  `SLOT_PASSED_HOUR=${JSON.stringify(SLOT_PASSED_HOUR)}\n`,
);

for (const r of RYTHMES) {
  console.log(`═══ rythme ${r.nom}`);
  console.log(
    "  h  | moments passés          | servis aujourd'hui      | fenêtre 3j        | fenêtre 1j | veille(demain+3j) | suggéré",
  );
  for (const h of HEURES) {
    const passed = slotsPassedToday({
      hourNow: h,
      rhythm: r.slots.map((slot) => ({ slot })),
      declaredHours: [],
    });
    const restants = r.slots.filter((s) => !passed.includes(s));
    const w3 = withoutSpentFirstDay({ startsOn: TODAY, durationDays: 3 }, {
      today: TODAY,
      cookOnlyDay: null,
      declaredSlots: r.slots,
      passedSlots: passed,
    });
    const w1 = withoutSpentFirstDay({ startsOn: TODAY, durationDays: 1 }, {
      today: TODAY,
      cookOnlyDay: null,
      declaredSlots: r.slots,
      passedSlots: passed,
    });
    // La veille d'un plan demandé pour DEMAIN: c'est elle qui ramène la fenêtre
    // sur aujourd'hui, et donc le seul chemin par lequel la garde `cook_day` tire.
    const lead = leadDayFor({ startsOn: TOMORROW, today: TODAY, hourNow: h });
    const sugg = proposedWindowStart({ todayLocalDate: TODAY, hourNow: h });
    const f = (s: string, n: number) => s.padEnd(n).slice(0, n);
    console.log(
      `  ${String(h ?? "null").padStart(4)} | ${f(passed.join(",") || "—", 23)} | ` +
        `${f(restants.join(",") || "AUCUN", 23)} | ` +
        `${f(w3.refused ?? `retiré ${w3.dropped} → ${w3.durationDays}j`, 17)} | ` +
        `${f(w1.refused ?? "retiré", 10)} | ` +
        `${f(`${lead.timing}/${lead.reason}`, 17)} | ` +
        `${sugg.shifted ?? "aujourd'hui"}` +
        `${cookingAskedToday({ hourNow: h }) ? "" : " ⛔courses fermées"}`,
    );
  }
  console.log();
}
