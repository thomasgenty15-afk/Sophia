// L3 — MESURE APRÈS. Mêmes cas, même module de décision, même façon de
// composer la phrase que le composant.
//
//   deno run --sloppy-imports --allow-read scratchpad/2026-08-22-1730-L3-mesure-apres.ts

import {
  emptyMouthDraft,
  type MouthFormDraft,
  paceControlFor,
  targetWeightStateFor,
} from "../frontend/src/keel/lib/mouthForm.ts";
import {
  ARRIVAL_HORIZON_COPY,
  arrivalCopyIsCalendarFree,
  CALENDAR_FREE_COPY,
  TARGET_WEIGHT_HINT_COPY,
} from "../frontend/src/keel/lib/arrivalHorizon.ts";

const TODAY = "2026-08-22";
const ADULT_BIRTH = "1990-05-04";

function draftOf(patch: Partial<MouthFormDraft>): MouthFormDraft {
  return { ...emptyMouthDraft(), ...patch };
}

const CASES: Array<{ nom: string; draft: MouthFormDraft }> = [
  {
    nom: "femme 60 kg, perte vers 55 kg (le cas de design de weight_pace.ts)",
    draft: draftOf({
      firstName: "Zoe",
      birthDate: ADULT_BIRTH,
      heightCm: "165",
      weightKg: "60",
      gender: "female",
      activityLevel: "sedentary",
      goal: "fat_loss",
      targetWeightKg: "55",
    }),
  },
  {
    nom: "homme 95 kg, perte vers 80 kg",
    draft: draftOf({
      firstName: "Marc",
      birthDate: ADULT_BIRTH,
      heightCm: "180",
      weightKg: "95",
      gender: "male",
      activityLevel: "sedentary",
      goal: "fat_loss",
      targetWeightKg: "80",
    }),
  },
  {
    nom: "homme 65 kg, prise vers 72 kg",
    draft: draftOf({
      firstName: "Ali",
      birthDate: ADULT_BIRTH,
      heightCm: "175",
      weightKg: "65",
      gender: "male",
      activityLevel: "trains_some",
      goal: "muscle_gain",
      targetWeightKg: "72",
    }),
  },
];

const SEMAINE_EXACTE = /\d+\s*(weeks?|semaines?)/i;

console.log("=== L3 · MESURE APRÈS ===");
console.log(new Date().toISOString());
console.log("");

let surfacesExactes = 0;
let surfacesRendues = 0;
for (const c of CASES) {
  const pace = paceControlFor(c.draft, TODAY);
  const state = targetWeightStateFor(c.draft, TODAY);
  console.log(`— ${c.nom}`);
  console.log(`  paceControl.kind = ${pace.kind}`);
  console.log(`  targetState      = ${JSON.stringify(state)}`);
  console.log(
    `  champ 'weeks' dans l'état : ${
      Object.keys(state).includes("weeks") ? "PRÉSENT" : "ABSENT"
    }`,
  );
  if (state.kind !== "accepted" || state.horizon === null) {
    console.log("  → rien d'affiché");
    console.log("");
    continue;
  }
  surfacesRendues += 1;
  const en = ARRIVAL_HORIZON_COPY[state.horizon].en;
  const fr = ARRIVAL_HORIZON_COPY[state.horizon].fr;
  console.log(`  → ÉCRAN en : ${en}`);
  console.log(`  → ÉCRAN fr : ${fr}`);
  if (SEMAINE_EXACTE.test(en) || SEMAINE_EXACTE.test(fr)) surfacesExactes += 1;
  console.log("");
}

console.log("— LE `hint` DU CHAMP (rendu SANS condition, la 2ᵉ surface)");
console.log(`  → ÉCRAN en : ${TARGET_WEIGHT_HINT_COPY.en}`);
console.log(`  → ÉCRAN fr : ${TARGET_WEIGHT_HINT_COPY.fr}`);
if (
  SEMAINE_EXACTE.test(TARGET_WEIGHT_HINT_COPY.en) ||
  SEMAINE_EXACTE.test(TARGET_WEIGHT_HINT_COPY.fr)
) surfacesExactes += 1;
console.log("");

console.log("— LA GARDE, SUR TOUTE LA COPIE LIVRÉE");
for (const entry of CALENDAR_FREE_COPY) {
  const en = arrivalCopyIsCalendarFree(entry.en, "en");
  const fr = arrivalCopyIsCalendarFree(entry.fr, "fr");
  console.log(
    `  ${entry.label.padEnd(34)} en=${en === null ? "OK" : JSON.stringify(en)}` +
      ` fr=${fr === null ? "OK" : JSON.stringify(fr)}`,
  );
}
console.log("");
console.log(
  `③ SURFACES AFFICHANT UN NOMBRE DE SEMAINES EXACT : ${surfacesExactes}`,
);
console.log(
  `   (surfaces d'arrivée RENDUES, inchangées : ${surfacesRendues}/${CASES.length} + 1 hint)`,
);
