/**
 * FF-010 §9/§10 — LE BUDGET, MESURÉ AVANT/APRÈS SUR LE PIRE CAS DU CHANTIER.
 *
 * Le pire cas nommé par la fiche est un foyer de SIX avec SEPT JOURS de
 * préparations et une liste de courses complète. `rich` l'est: 6 membres dont
 * deux enfants, 14 plats, 12 préparations, 24 lignes de courses, plus une
 * doctrine publiée, un protocole publié, un plan publié et un historique.
 *
 * LE SEUL A/B HONNÊTE est le même élève, le même message, la même heure, avec
 * pour SEULE variable son appartenance au foyer: comparer deux élèves
 * comparerait deux doctrines et deux historiques.
 *
 * ⚠️ LA MÉTRIQUE EST `full_chars` (log `companion_prompt_cache_ready`), PAS
 * `context_tokens`. Établi par FF-016: `context_tokens` est calculé sur le
 * chargeur de contexte seul, et les blocs KEEL arrivent après. Relu sur ce run:
 * `turn_summary_logs.context_tokens` et `context_elements` sont NULL partout.
 *
 * Le second tour n'est pas décoratif: l'interdit de la doctrine de Rae est
 * « calorie counting ». Si le bloc doctrine a sauté par la queue, il sort ici.
 *
 * usage: deno run -A scratchpad/ff010_budget.ts
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
import { runScenario } from "./ff010_run.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff010_fixture.json", import.meta.url)),
);
const db = admin();
const richId: string = fixture.students.rich.userId;
const bigId: string = fixture.households.big.id;

const MESSAGES = [
  { id: "budget-dinner", message: "What are we eating tonight and what do I need to buy?" },
  { id: "budget-doctrine", message: "Should I start counting calories to get this moving?" },
];

async function detach() {
  const { error } = await db.from("household_members").delete()
    .eq("user_id", richId).eq("household_id", bigId);
  if (error) throw new Error(`detach: ${error.message}`);
}
async function attach() {
  const { error } = await db.from("household_members").insert({
    household_id: bigId,
    user_id: richId,
    role: "owner",
  } as never);
  if (error) throw new Error(`attach: ${error.message}`);
}

const out: Record<string, unknown> = {};
try {
  for (const phase of ["sans_foyer", "avec_foyer"] as const) {
    if (phase === "sans_foyer") await detach();
    else await attach();
    for (const m of MESSAGES) {
      const passes = await runScenario({
        id: `${m.id}-${phase}`,
        level: "extra-hard",
        student: "rich",
        message: m.message,
        runs: 3,
        fresh: true,
      });
      out[`${m.id}-${phase}`] = passes;
      console.log(`\n=== ${m.id} · ${phase}`);
      for (const p of passes) {
        console.log(`  run ${p.run}: full_chars=${p.fullChars}`);
        console.log(`    « ${String(p.reply ?? "").replace(/\n/g, " ")} »`);
      }
    }
  }
} finally {
  // On REMET l'appartenance quoi qu'il arrive: une fixture à moitié démontée
  // ferait mentir tout run suivant.
  const { data } = await db.from("household_members").select("user_id")
    .eq("user_id", richId);
  if (((data ?? []) as unknown[]).length === 0) await attach();
}

const nums = (key: string) =>
  ((out[key] ?? []) as Array<{ fullChars: number | null }>)
    .map((p) => p.fullChars).filter((n): n is number => typeof n === "number");
console.log("\n--- BUDGET ---");
for (const m of MESSAGES) {
  const sans = nums(`${m.id}-sans_foyer`);
  const avec = nums(`${m.id}-avec_foyer`);
  console.log(
    `${m.id}: sans=[${sans.join(", ")}] avec=[${avec.join(", ")}] ` +
      `Δmax=${Math.max(...avec, 0) - Math.max(...sans, 0)}`,
  );
}
console.log("plafond dur = 32 000 caractères (COMPANION_PROMPT_MAX_TOKENS 8000 × 4)");

await Deno.writeTextFile(
  new URL("./ff010_budget_results.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
