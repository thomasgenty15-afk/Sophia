// SONDE E — les quatre états du curseur, le plafond, l'avertissement, la saturation.
//   $ cd frontend && npx vite-node ../scratchpad/2026-08-18-1930-E-sonde-curseur.ts
// Pure lecture de modèle. Aucune écriture, aucun réseau.

import { emptyMouthDraft, paceControlFor, targetWeightStateFor, activityIsRequired } from "../frontend/src/keel/lib/mouthForm";

const TODAY = "2026-08-18";

function draft(over: Record<string, unknown>) {
  return { ...emptyMouthDraft(), ...over } as never;
}

const bodies = [
  { nom: "homme 85 kg / 178 / adulte", birthDate: "1988-03-10", heightCm: "178", weightKg: "85", gender: "male" },
  { nom: "femme 60 kg / 165 / adulte", birthDate: "1990-01-01", heightCm: "165", weightKg: "60", gender: "female" },
  { nom: "homme 110 kg / 185 / adulte", birthDate: "1985-01-01", heightCm: "185", weightKg: "110", gender: "male" },
  { nom: "femme 42 kg / 160 / adulte (tres leger)", birthDate: "1990-01-01", heightCm: "160", weightKg: "42", gender: "female" },
  { nom: "femme 38 kg / 158 / adulte (extreme)", birthDate: "1990-01-01", heightCm: "158", weightKg: "38", gender: "female" },
  { nom: "enfant 10 ans 32 kg", birthDate: "2016-04-02", heightCm: "138", weightKg: "32", gender: "female" },
  { nom: "corps ABSENT", birthDate: "1988-03-10", heightCm: "", weightKg: "", gender: "" },
];

console.log("== LES QUATRE ÉTATS, PAR DIRECTION ET PAR CORPS ==");
let maxSeen = 0;
for (const b of bodies) {
  for (const goal of ["fat_loss", "maintenance", "muscle_gain"] as const) {
    const c = paceControlFor(draft({ ...b, goal, activityLevel: "on_feet" }), TODAY) as Record<string, unknown>;
    const extra = c.kind === "slider"
      ? ` min=${c.min} max=${c.max} step=${c.step} val=${c.value} bound=${c.bound} warn=${c.warning ? JSON.stringify(c.warning) : "—"} sat=${c.saturation ? JSON.stringify(c.saturation) : "—"}`
      : "";
    if (c.kind === "slider") maxSeen = Math.max(maxSeen, Number(c.max));
    console.log(`  ${b.nom.padEnd(40)} ${goal.padEnd(12)} → ${String(c.kind).padEnd(11)}${extra}`);
  }
}
console.log(`\n  MAXIMUM LE PLUS HAUT VU SUR TOUS LES CORPS : ${maxSeen} kg/semaine  (doit être ≤ 1)`);

console.log("\n== L'AVERTISSEMENT AU-DELÀ DE 0,5 EN PRISE ==");
for (const pace of ["0.30", "0.45", "0.50", "0.55", "0.60", "0.80", "1.00"]) {
  const c = paceControlFor(draft({ ...bodies[2], goal: "muscle_gain", activityLevel: "trains_hard", paceKgPerWeek: pace }), TODAY) as Record<string, unknown>;
  console.log(`  prise ${pace} → val=${c.value} warning=${c.warning ? JSON.stringify(c.warning) : "—"} saturation=${c.saturation ? JSON.stringify(c.saturation) : "—"}`);
}

console.log("\n== LA SATURATION (le grammage ne bouge plus) ==");
for (const b of [bodies[1], bodies[2]]) {
  for (const pace of ["0.10", "0.15", "0.20", "0.25", "0.30", "0.40", "0.50", "0.60", "0.80", "1.00"]) {
    const c = paceControlFor(draft({ ...b, goal: "muscle_gain", activityLevel: "sedentary", paceKgPerWeek: pace }), TODAY) as Record<string, unknown>;
    if (c.kind !== "slider") { console.log(`  ${b.nom} ${pace} → ${c.kind}`); continue; }
    console.log(`  ${b.nom.padEnd(32)} demandé ${pace} → affiché ${c.value} sat=${c.saturation ? "OUI " + JSON.stringify(c.saturation) : "—"}`);
  }
  console.log("");
}

console.log("== PERTE : jamais de saturation (contrôle) ==");
for (const pace of ["0.20", "0.45", "0.70", "1.00"]) {
  const c = paceControlFor(draft({ ...bodies[2], goal: "fat_loss", activityLevel: "trains_hard", paceKgPerWeek: pace }), TODAY) as Record<string, unknown>;
  console.log(`  perte ${pace} → val=${c.value} max=${c.max} sat=${c.saturation ? JSON.stringify(c.saturation) : "—"} warn=${c.warning ? JSON.stringify(c.warning) : "—"}`);
}

console.log("\n== LE CRAN D'ACTIVITÉ EST-IL OBLIGATOIRE ? ==");
for (const g of ["", "fat_loss", "maintenance", "muscle_gain"] as const) {
  console.log(`  goal=${JSON.stringify(g).padEnd(14)} → activityIsRequired = ${activityIsRequired(g as never)}`);
}

console.log("\n== LE POIDS VISÉ ==");
for (const [goal, target] of [["fat_loss", "78"], ["fat_loss", "95"], ["fat_loss", ""], ["maintenance", "78"], ["muscle_gain", "92"]] as const) {
  const s = targetWeightStateFor(draft({ ...bodies[0], goal, targetWeightKg: target, activityLevel: "on_feet" }), TODAY) as Record<string, unknown>;
  console.log(`  ${goal.padEnd(12)} cible=${String(target).padEnd(4)} → ${JSON.stringify(s)}`);
}
