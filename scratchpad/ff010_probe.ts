/**
 * FF-010 — LA SONDE STRUCTURELLE. Ce que le chargeur rend VRAIMENT, contre la
 * base locale réelle, pour chaque décor. Aucun modèle appelé: c'est la preuve
 * de ce qui ENTRE dans le prompt, avant de mesurer ce qui en sort.
 *
 * usage: deno run -A scratchpad/ff010_probe.ts
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import {
  householdContextBlock,
  loadHouseholdTurnContext,
} from "../supabase/functions/_shared/keel/household_turn_context.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff010_fixture.json", import.meta.url)),
);
const db = admin();

const CASES: Array<{ who: string; tz: string }> = [
  { who: "ana", tz: fixture.households.fam.timezone },
  { who: "marc", tz: fixture.households.fam.timezone },
  { who: "leo", tz: fixture.households.fam.timezone },
  { who: "rob", tz: fixture.households.shr.timezone },
  { who: "sam", tz: fixture.households.shr.timezone },
  { who: "solo", tz: fixture.households.shr.timezone },
  { who: "rich", tz: fixture.households.big.timezone },
];

function localDateIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const out: Record<string, unknown> = {};
for (const c of CASES) {
  const userId = fixture.students[c.who].userId;
  const localDate = localDateIn(c.tz);
  const ctx = await loadHouseholdTurnContext(db, { userId, localDate });
  console.log(`\n===== ${c.who} (${localDate}) =====`);
  if (!ctx) {
    console.log("contexte = null (aucun bloc injecté)");
    out[c.who] = null;
    continue;
  }
  const block = householdContextBlock(ctx);
  console.log(`kind=${ctx.kind} hasPlanToday=${ctx.hasPlanToday}`);
  console.log(`roster=${JSON.stringify(ctx.roster.map((r) => [r.firstName, r.visibility, r.isMinor]))}`);
  console.log(`dishes=${JSON.stringify(ctx.todayDishes)}`);
  console.log(`preparations=${JSON.stringify(ctx.preparations)}`);
  console.log(`portions=${JSON.stringify(ctx.portions)}`);
  console.log(`restrictions=${JSON.stringify(ctx.myRestrictions)}`);
  console.log(`BLOC (${block.length} car.):\n${block}`);
  out[c.who] = { ctx, blockChars: block.length, block };
}
await Deno.writeTextFile(
  new URL("./ff010_probe_results.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
