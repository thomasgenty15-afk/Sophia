/** Preuve directe: ce que le contexte foyer contient VRAIMENT, en base réelle. */
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  householdContextBlock,
  loadHouseholdTurnContext,
} from "../supabase/functions/_shared/keel/household_turn_context.ts";

const persona = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const admin = createClient(
  "http://127.0.0.1:54321",
  Deno.env.get("QA_SERVICE_KEY")!,
  { auth: { persistSession: false } },
);
const localDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const ctx = await loadHouseholdTurnContext(admin, {
  userId: persona.userId,
  localDate,
});
if (!ctx) {
  console.log("CONTEXTE FOYER: null");
  Deno.exit(0);
}
console.log("kind =", ctx.kind);
console.log("portions =", JSON.stringify(ctx.portions));
console.log("roster =", JSON.stringify(ctx.roster.map((r) => [r.firstName, r.visibility])));
const block = householdContextBlock(ctx);
console.log("bloc contient « féculents plus petite » ? ", block.includes("féculents plus petite"));
console.log("bloc, longueur =", block.length);
