/** C6 — rebuild PUIS audit, l'ordre de production, sur le premier jet du tir 1. */
import { loadCompositionIndex } from "../../../supabase/functions/_shared/keel/food_composition_io.ts";
import { shoppingIdentityAudit } from "../../../supabase/functions/_shared/keel/final_plan_audit.ts";
import {
  rebuildShoppingQuantities,
  shoppingNeedsOf,
} from "../../../supabase/functions/_shared/keel/shopping_rebuild.ts";
import { loadDotEnv } from "../../2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ROOT = decodeURIComponent(new URL("../../../", import.meta.url).pathname);
const env = loadDotEnv(`${ROOT}supabase/.env`);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const composition = await loadCompositionIndex(db as never, { lang: "fr" });

const sortie = JSON.parse(Deno.readTextFileSync(Deno.args[0])) as Record<string, unknown>;
const plan = JSON.parse((sortie.etapes as Record<string, string>).premier_jet) as
  Record<string, never>;

const { needs, identityByTerm } = shoppingNeedsOf({
  index: composition,
  dishes: plan.dishes,
  preparations: plan.preparations,
});
console.log(`besoins : ${needs.size}`);
console.log(`pont par terme : ${identityByTerm.size} entrée(s)`);
console.log(`  « champignons de paris » → ${identityByTerm.get("champignons de paris") ?? "AUCUN"}`);
const rebuilt = rebuildShoppingQuantities({
  index: composition,
  lines: plan.shopping_list,
  needs,
  identityByTerm,
  removed: new Set<string>(),
  locale: "fr",
});
console.log(`rebuild : ${JSON.stringify(rebuilt.counts)}`);
console.log(`non achetés : ${rebuilt.unbought.map((u) => u.term ?? "?").join(", ") || "(aucun)"}`);
for (const l of rebuilt.items as Record<string, unknown>[]) {
  if (String(l.term ?? "").toLowerCase().includes("champignon")) {
    console.log(`  ligne reconstruite : ${JSON.stringify(l)}`);
  }
}
const apres = { ...plan, shopping_list: rebuilt.items };
const audit = shoppingIdentityAudit({ index: composition, plan: apres as never, pantryTerms: [] });
console.log(`\naudit APRÈS rebuild — ${audit.rows.length} identités`);
for (const r of audit.rows) {
  if (r.state === "covered_measured") continue;
  console.log(
    `  ${r.state.padEnd(22)} ${r.identity.padEnd(40)} « ${r.displayTerm} » ` +
      `besoin ${r.neededRawG ?? "?"} / acheté ${r.boughtRawG ?? "?"} · lignes ${r.neededLines}/${r.boughtLines}`,
  );
}
