import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ⟳ 2026-09-05 — REGRAMMER APRÈS AVOIR GROSSI. `scaleIngredients` remet
// `gramsRaw` à null par contrat; mesuré sur C03: 13 lignes de casserole sur
// 16 sans grammes crus après la croissance des pots, et tout lecteur strict
// (`preparationReadyGrams`, plafond de pot) lisait du vide.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

Deno.test("CÂBLAGE — la lane foyer regramme ses casseroles APRÈS la croissance des pots, et le compte", async () => {
  const src = strip(await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url)));
  const growthAt = src.indexOf("const growth = { scaled: 0, capped: 0, shopping: 0, unrewritable: 0, regrammed: 0 };");
  assert(growthAt > -1, "le compteur regrammed a disparu de pot_growth");
  const spliceAt = src.indexOf("prep.ingredients.splice(0, prep.ingredients.length, ...grown.items);", growthAt);
  const regramAt = src.indexOf("growth.regrammed = growth.scaled > 0 ? regramMeal(meal, composition) : 0;", growthAt);
  const sizingAt = src.indexOf("const boxSizing = sizeBoxesFromTarget(", growthAt);
  assert(spliceAt > -1 && regramAt > spliceAt && sizingAt > regramAt, "le regram ne suit pas la croissance, ou ne précède pas le dimensionnement des boîtes");
  // Le PREMIER regram (avant la croissance) est toujours là: ce n'est pas un déplacement.
  const firstAt = src.indexOf("const regrammed = regramMeal(meal, composition);");
  assert(firstAt > -1 && firstAt < growthAt, "le regram d'avant la croissance a disparu");
  assert(/pot_growth: growth,/.test(src), "pot_growth n'est plus archivé tel quel");
});

Deno.test("CÂBLAGE — la croissance des pots reçoit la MASSE de chaque casserole (regrammée avant)", async () => {
  const src = strip(await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url)));
  const at = src.indexOf("const potGrowth = neededPotFactor(");
  const call = src.slice(at, src.indexOf("\n    );", at));
  assert(/composition \? preparationReadyGrams\(prep\.ingredients, composition\) : null/.test(call), "la croissance ne lit plus la masse du pot");
  const firstRegram = src.indexOf("const regrammed = regramMeal(meal, composition);");
  assert(firstRegram > -1 && firstRegram < at, "la masse serait lue avant d'être regrammée");
});
