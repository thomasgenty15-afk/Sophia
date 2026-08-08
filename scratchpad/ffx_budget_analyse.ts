/**
 * PASSE TRANSVERSE ① — L'ANALYSE, AVEC LE DÉTECTEUR CORRIGÉ.
 *
 * ⚠️ MON PREMIER DÉTECTEUR ÉTAIT FAUX, et il l'était dans le sens du confort:
 * il comparait `full_chars` à la valeur EXACTE 32 222. Or
 * `applyCompanionPromptBudget` fait `slice(0, keep).trimEnd()` — quand la coupe
 * tombe sur un blanc, `trimEnd` retire k caractères et le total vaut 32 222 − k.
 * Un tour à 32 221 était donc rendu « entier » alors qu'il était tronqué de
 * 5 178 caractères. Le détecteur correct est l'ÉCART: tronqué ⟺ la somme des
 * parties dépasse le total rendu.
 *
 * usage: deno run -A scratchpad/ffx_budget_analyse.ts
 */
const data = JSON.parse(
  await Deno.readTextFile(new URL("./ffx_budget_results.json", import.meta.url)),
);
const blocks = JSON.parse(
  await Deno.readTextFile(new URL("./ffx_blocks.json", import.meta.url)),
);
const MAX = 32_000;
const SUFFIX_LEN = "\n\n[... CONTEXTE TRONQUE POUR RESPECTER LE BUDGET PROMPT ...]\n".length;
const LABEL_LEN = "LIVING CONTEXT (what we know about them RIGHT NOW):".length;
const KEEL = blocks.keelBlocksTotalChars as number;
// L'offset du DERNIER bloc KEEL dans le contexte (label + "\n" + empilement).
const last = (blocks.blocks as Array<{ name: string; start: number; end: number }>)
  .slice(-1)[0];
const keelRegionEnd = LABEL_LEN + 1 + KEEL;

console.log(`blocs KEEL = ${KEEL} car. — dernier de la pile: ${last.name} [${last.start}..${last.end}]`);
console.log(`la région KEEL du contexte finit au caractère ${keelRegionEnd}\n`);

for (const [probe, runs] of Object.entries(data.results as Record<string, any[]>)) {
  for (const r of runs) {
    const parts = r.stable + r.semi + r.volatile + 226;
    const truncated = parts - r.full > 2;
    const cutChars = truncated ? parts - r.full : 0;
    const basePrompt = r.stable + 2 + r.semi;
    const keep = MAX - SUFFIX_LEN;
    const surviving = keep - basePrompt - 1;
    const loaderContext = r.volatile - keelRegionEnd - 2;
    console.log(
      `[${probe}] run ${r.run}: ` +
        `stable=${r.stable} semi=${r.semi} volatile=${r.volatile} full=${r.full}\n` +
        `   somme+226=${parts} → ${truncated ? `TRONQUÉ de ${cutChars} car.` : "ENTIER"}\n` +
        `   contexte survivant=${surviving} car. · fin région KEEL=${keelRegionEnd} · ` +
        `contexte du chargeur=${loaderContext} car.\n` +
        `   marge avant que le 1er bloc KEEL (${last.name}) ne soit entamé = ` +
        `${surviving - (LABEL_LEN + 1 + last.start)} car.`,
    );
  }
}
