import { compositionLinesFor, routeRetainedItems } from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/retained_items_routing.ts";
const items = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const HOUSEHOLD = "household";
const OWNER = "member:4fe72d31-5cc4-4818-b02b-e3607822cee6"; // Léa, au hasard
const routed = routeRetainedItems(items);
for (const [label, speaksFor] of [
  ["foyer seul          ", [HOUSEHOLD]],
  ["foyer + titulaire   ", [HOUSEHOLD, OWNER]],
] as const) {
  const c = compositionLinesFor({ items: routed.composition, speaksFor: [...speaksFor] });
  console.log(`\n── speaksFor = ${label} ──`);
  console.log("  APPLIQUÉ :", c.remembered.length ? c.remembered : "(rien)");
  console.log("  COMPTÉ, JAMAIS APPLIQUÉ :", c.otherSubjects.map((i) => `${i.subject.slice(0, 14)} · ${i.text.slice(0, 34)}`));
}
