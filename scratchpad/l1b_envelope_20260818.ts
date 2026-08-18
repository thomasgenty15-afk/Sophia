import { envelopeFor, maintenanceEnvelopeFromBody } from "../supabase/functions/_shared/keel/meal_envelope.ts";
import { ACTIVITY_LEVELS } from "../supabase/functions/_shared/keel/tokens.ts";
const body = { heightCm: 178, gender: "male", latestWeight: { value: 80, at: "2026-08-01" } } as never;
console.log("=== envelopeFor(fat_loss, corps reel, adulte) selon le 6e parametre ===");
const outs = new Set<string>();
for (const a of [null, ...ACTIVITY_LEVELS] as const) {
  const e = envelopeFor("fat_loss", body, "30_44", false, null, a as never);
  const s = JSON.stringify(e);
  outs.add(s);
  console.log(` ${String(a).padEnd(12)} -> ${s}`);
}
console.log(" enveloppes distinctes:", outs.size, "(attendu 5 : le cran DOIT changer la bande)");
console.log("\n=== muscle_gain ===");
const outs2 = new Set<string>();
for (const a of [null, ...ACTIVITY_LEVELS] as const) {
  const e = envelopeFor("muscle_gain", body, "30_44", false, null, a as never);
  outs2.add(JSON.stringify(e));
  console.log(` ${String(a).padEnd(12)} -> ${JSON.stringify(e)}`);
}
console.log(" distinctes:", outs2.size);
