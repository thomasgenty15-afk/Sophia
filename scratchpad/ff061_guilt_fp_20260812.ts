/**
 * FF-061 — LE TAUX DE FAUX POSITIFS DE `findGuiltTripping` SUR LES `why` RÉELS.
 *
 * Le brief demande de MESURER avant de brancher: une garde qui rejette des
 * plats corrects se fait désarmer dans la semaine. On lit donc tous les `why`
 * déjà en base et on regarde ce que la garde y trouverait.
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { findGuiltTripping } from "../supabase/functions/_shared/keel/reengagement.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await admin
  .from("student_generated_meals")
  .select("id, dishes, content_locale")
  .order("created_at", { ascending: false })
  .limit(200);
if (error) throw new Error(error.message);

type Dish = { title?: string; why?: string };

let whyCount = 0;
let hitCount = 0;
const samples: string[] = [];
const byPattern = new Map<string, number>();

for (const row of (data ?? []) as { dishes: Dish[]; content_locale: string }[]) {
  for (const d of row.dishes ?? []) {
    const why = String(d?.why ?? "").trim();
    if (!why) continue;
    whyCount++;
    const findings = findGuiltTripping(why);
    if (findings.length === 0) continue;
    hitCount++;
    for (const f of findings) {
      byPattern.set(f.pattern, (byPattern.get(f.pattern) ?? 0) + 1);
    }
    if (samples.length < 20) {
      samples.push(
        `[${row.content_locale}] « ${why} »\n    → ${
          findings.map((f) => `"${f.matchedText}"`).join(", ")
        }`,
      );
    }
  }
}

const pct = whyCount === 0 ? 0 : (hitCount / whyCount) * 100;
console.log(`\`why\` lus            : ${whyCount}`);
console.log(`déclenchements        : ${hitCount}  (${pct.toFixed(2)} %)`);
console.log(`\n── PAR MOTIF ──`);
for (const [p, n] of [...byPattern.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(4)}×  ${p}`);
}
console.log(`\n── ÉCHANTILLONS (à juger à la main) ──`);
for (const s of samples) console.log(s);
if (samples.length === 0) console.log("(aucun)");
