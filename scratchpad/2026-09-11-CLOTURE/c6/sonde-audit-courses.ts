/**
 * C6 — REPRODUIRE HORS LIGNE LE REFUS DU TIR RÉEL n° 1.
 * Le plan a été REFUSÉ sur `ingredient_not_bought « champignons de Paris »`
 * alors que la ligne est sur la liste, écrite au caractère près.
 * Lecture seule, aucun appel modèle.
 */
import { loadCompositionIndex } from "../../../supabase/functions/_shared/keel/food_composition_io.ts";
import { shoppingIdentityAudit } from "../../../supabase/functions/_shared/keel/final_plan_audit.ts";
import { loadDotEnv } from "../../2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ROOT = decodeURIComponent(new URL("../../../", import.meta.url).pathname);
const env = loadDotEnv(`${ROOT}supabase/.env`);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const index = await loadCompositionIndex(db as never, { lang: "fr" });

const chemin = Deno.args[0];
const sortie = JSON.parse(Deno.readTextFileSync(chemin)) as Record<string, unknown>;
const plan = JSON.parse(
  (sortie.etapes as Record<string, string>).premier_jet,
) as Record<string, unknown>;

const audit = shoppingIdentityAudit({
  index,
  plan: plan as never,
  pantryTerms: [],
});
console.log(`lignes de courses du plan : ${(plan.shopping_list as unknown[]).length}`);
console.log(`identités auditées        : ${audit.rows.length}`);
for (const r of audit.rows) {
  if (r.state === "covered_measured") continue;
  console.log(
    `  ${r.state.padEnd(22)} ${r.identity.padEnd(40)} « ${r.displayTerm} » ` +
      `(source ${r.identitySource}) — besoin ${r.neededRawG ?? "?"} g / acheté ${r.boughtRawG ?? "?"} g ` +
      `· lignes besoin ${r.neededLines} achat ${r.boughtLines}`,
  );
}
