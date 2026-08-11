import { cleanup } from "../docs/nutrition-pivot/qa-web/harness.ts";
for (const f of ["qa2_T1.json","qa2_T2.json","qa2_T3.json","qa2_T4.json"]) {
  const d = JSON.parse(await Deno.readTextFile(new URL(`./${f}`, import.meta.url)));
  try { await cleanup(d.user_id); console.log(`${f}: nettoye`); } catch (e) { console.log(`${f}: ${e}`); }
}
