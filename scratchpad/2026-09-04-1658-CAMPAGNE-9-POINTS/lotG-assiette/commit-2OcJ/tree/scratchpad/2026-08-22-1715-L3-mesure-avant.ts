// L3 — MESURE AVANT. « Où la promesse de calendrier sort-elle RÉELLEMENT à
// l'écran, et que promet-elle ? »
//
// Ce probe ne lit pas le code: il APPELLE le module de décision du front
// (`mouthForm.ts`), puis il compose la phrase EXACTEMENT comme le composant la
// compose — en substituant `{weeks}` dans le gabarit i18n lu sur le disque.
//
// Il imprime aussi, pour chaque cas, l'intervalle que l'erreur d'estimation
// (±580 kcal/j, RMSE ~20 %) rend réellement possible, à comparer au nombre
// unique que l'écran affiche.
//
// Lancement:
//   deno run --allow-read scratchpad/2026-08-22-1715-L3-mesure-avant.ts

import {
  emptyMouthDraft,
  type MouthFormDraft,
  paceControlFor,
  targetWeightStateFor,
} from "../frontend/src/keel/lib/mouthForm.ts";
import { KCAL_PER_KG_BODY_MASS } from "../supabase/functions/_shared/keel/weight_pace.ts";
import { MAX_DAILY_DEFICIT_KCAL } from "../supabase/functions/_shared/keel/meal_envelope.ts";

/** La revue de littérature: RMSE ~20 %, exprimée en kcal/j sur le corpus. */
const ESTIMATE_ERROR_KCAL = 580;

const TODAY = "2026-08-22";

function draftOf(patch: Partial<MouthFormDraft>): MouthFormDraft {
  return { ...emptyMouthDraft(), ...patch };
}

const ADULT_BIRTH = "1990-05-04";

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

// --- LE GABARIT i18n, LU SUR LE DISQUE (c'est ce que `t()` rend) -----------
function template(file: string, key: string): string {
  const src = Deno.readTextFileSync(file);
  const m = src.match(
    new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)"`),
  );
  return m === null ? "(ABSENTE)" : m[1];
}

const EN = template("frontend/src/keel/i18n/en.ts", "household.mouth.arrival");
const FR = template("frontend/src/keel/i18n/fr.ts", "household.mouth.arrival");

console.log("=== L3 · MESURE AVANT ===");
console.log(new Date().toISOString(), "— HEAD + arbre de travail");
console.log("");
console.log("① LE GABARIT AFFICHÉ (clé `household.mouth.arrival`)");
console.log("   en :", JSON.stringify(EN));
console.log("   fr :", JSON.stringify(FR));
console.log("");
console.log(
  "② CE QUE L'ÉCRAN DIT, ET CE QUE L'ERREUR D'ESTIMATION AUTORISE VRAIMENT",
);
console.log(
  `   (erreur ±${ESTIMATE_ERROR_KCAL} kcal/j · plafond de déficit ${MAX_DAILY_DEFICIT_KCAL} kcal/j)`,
);
console.log("");

let surfacesExactes = 0;
for (const c of CASES) {
  const pace = paceControlFor(c.draft, TODAY);
  const state = targetWeightStateFor(c.draft, TODAY);
  console.log(`— ${c.nom}`);
  console.log(`  paceControl.kind = ${pace.kind}`);
  console.log(`  targetState      = ${JSON.stringify(state)}`);
  if (state.kind !== "accepted" || state.weeks === null) {
    console.log("  → rien d'affiché");
    console.log("");
    continue;
  }
  surfacesExactes += 1;
  console.log(`  → ÉCRAN en : ${EN.replace("{weeks}", String(state.weeks))}`);
  console.log(`  → ÉCRAN fr : ${FR.replace("{weeks}", String(state.weeks))}`);

  // L'intervalle réel. Le rythme affiché suppose que le déficit prescrit est
  // exécuté à l'identique. Il ne l'est pas: l'entretien estimé porte
  // ±ESTIMATE_ERROR_KCAL, donc le déficit RÉEL vaut prescrit ± cette erreur.
  const paceValue = pace.kind === "slider" ? pace.value : 0;
  const dailyKcal = (paceValue * KCAL_PER_KG_BODY_MASS) / 7;
  const bas = dailyKcal + ESTIMATE_ERROR_KCAL; // le corps consomme plus qu'estimé
  const haut = dailyKcal - ESTIMATE_ERROR_KCAL; // le corps consomme moins
  const gap = Math.abs(
    Number(c.draft.targetWeightKg) - Number(c.draft.weightKg),
  );
  const semaines = (kcalParJour: number) =>
    kcalParJour <= 0
      ? "JAMAIS (le déficit réel peut être nul ou négatif)"
      : String(Math.ceil((gap * KCAL_PER_KG_BODY_MASS) / (kcalParJour * 7)));
  console.log(
    `  écart quotidien prescrit : ${Math.round(dailyKcal)} kcal/j` +
      ` → intervalle réel [${Math.round(haut)} … ${Math.round(bas)}] kcal/j`,
  );
  console.log(
    `  semaines RÉELLEMENT possibles : de ${semaines(bas)} à ${
      semaines(haut)
    }`,
  );
  console.log("");
}

console.log(
  `③ SURFACES AFFICHANT UN NOMBRE DE SEMAINES EXACT : ${surfacesExactes} cas sur ${CASES.length}`,
);
