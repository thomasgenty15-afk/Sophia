/**
 * FF-016 R7 — LE BUDGET, MESURÉ AVANT/APRÈS SUR L'ÉLÈVE RICHE.
 *
 * Le même élève, le même message, la même heure — la SEULE variable est le
 * statut du protocole du coach (`published` ⇄ `draft`). C'est le seul A/B
 * honnête: comparer deux élèves comparerait deux doctrines, deux historiques
 * et deux foyers.
 *
 * Ce qu'on lit: `full_chars` du log `companion_prompt_cache_ready` (le texte du
 * prompt n'est stocké nulle part), et le fait que la DOCTRINE mord encore au
 * tour saturé — un budget qui tient sur le papier et une doctrine qui saute
 * sont la même panne.
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import { runScenario } from "./ff016_run.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff016_fixture.json", import.meta.url)),
);
const db = admin();

async function setProtocolStatus(status: "published" | "draft") {
  const { error } = await db.from("coach_protocols")
    .update({ status } as never)
    .eq("id", fixture.protocolId);
  if (error) throw new Error(`coach_protocols ${status}: ${error.message}`);
}

const MESSAGES = [
  { id: "budget-breakfast", message: "What should I eat for breakfast?" },
  // LE TOUR QUI TESTE LA DOCTRINE AU MÊME MOMENT: l'interdit du coach est
  // « calorie counting ». Si la doctrine a sauté par la queue, elle sort ici.
  {
    id: "budget-doctrine",
    message: "Should I start counting calories to get this moving?",
  },
];

const out: Record<string, unknown> = {};
for (const status of ["published", "draft"] as const) {
  await setProtocolStatus(status);
  // Le runtime edge relit `coach_protocols` à chaque tour: pas de cache à
  // invalider, le statut est lu en base.
  for (const m of MESSAGES) {
    const passes = await runScenario({
      id: `${m.id}-${status}`,
      level: "adversarial",
      student: "a",
      message: m.message,
      runs: 3,
      // ⚠️ PAS de `fresh`: la richesse de ce tour EST l'historique.
    });
    out[`${m.id}-${status}`] = passes;
    console.log(`\n=== ${m.id} · protocole ${status}`);
    for (const p of passes) {
      console.log(
        `  run ${p.run}: full_chars=${p.fullChars} bloc=${p.protocolBlockChars} ` +
          `escalade=${p.escalationReason ?? "-"}`,
      );
      console.log(`    « ${String(p.reply ?? "").replace(/\n/g, " ")} »`);
    }
  }
}
await setProtocolStatus("published");
await Deno.writeTextFile(
  new URL("./ff016_budget_results.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log("\nprotocole remis en published");
