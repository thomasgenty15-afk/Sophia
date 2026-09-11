import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ⟳ 2026-09-05 — REGRAMMER APRÈS AVOIR GROSSI. `scaleIngredients` remet
// `gramsRaw` à null par contrat; mesuré sur C03: 13 lignes de casserole sur
// 16 sans grammes crus après la croissance des pots, et tout lecteur strict
// (`preparationReadyGrams`, plafond de pot) lisait du vide.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

Deno.test("CÂBLAGE — la lane foyer regramme ses casseroles APRÈS la croissance des pots, et le compte", async () => {
  const src = strip(await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url)));
  const growthAt = src.indexOf("const growth = { scaled: 0, capped: 0, shopping: 0, unrewritable: 0, regrammed: 0, passes: 0, short_after: 0 };");
  assert(growthAt > -1, "le compteur regrammed a disparu de pot_growth");
  const spliceAt = src.indexOf("prep.ingredients.splice(0, prep.ingredients.length, ...grown.items);", growthAt);
  const regramAt = src.indexOf("growth.regrammed += growth.scaled > 0 ? regramMeal(meal, composition) : 0;", growthAt);
  const sizingAt = src.indexOf("const boxSizing = sizeBoxesFromTarget(", growthAt);
  assert(spliceAt > -1 && regramAt > spliceAt && sizingAt > regramAt, "le regram ne suit pas la croissance, ou ne précède pas le dimensionnement des boîtes");
  // Le PREMIER regram (avant la croissance) est toujours là: ce n'est pas un déplacement.
  const firstAt = src.indexOf("const regrammed = regramMeal(meal, composition);");
  assert(firstAt > -1 && firstAt < growthAt, "le regram d'avant la croissance a disparu");
  assert(/pot_growth: growth,/.test(src), "pot_growth n'est plus archivé tel quel");
});

Deno.test("CÂBLAGE — la croissance des pots reçoit la MASSE de chaque casserole (regrammée avant)", async () => {
  const src = strip(await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url)));
  // ⟳ 2026-09-07 — UNE PASSE D'IDENTITÉ + un recalcul pour `short_after`.
  const calls = [...src.matchAll(/potGrowth = neededPotFactor\(/g)];
  assert(calls.length === 2, `attendu 2 appels (identité + recalcul), trouvé ${calls.length}`);
  const at = calls[0].index!;
  const call = src.slice(at, src.indexOf("\n      );", at));
  assert(/composition \? preparationReadyGrams\(prep\.ingredients, composition\) : null/.test(call), "la croissance ne lit plus la masse du pot");
  const firstRegram = src.indexOf("const regrammed = regramMeal(meal, composition);");
  assert(firstRegram > -1 && firstRegram < at, "la masse serait lue avant d'être regrammée");
});

Deno.test("⛔ CÂBLAGE — la casserole est l'IDENTITÉ Σ(tirages): ni marge, ni plafond, ni seconde passe, ni ancre", async () => {
  // Décision produit du 2026-09-07 (« il faut que ça matche »): la portion
  // servie est celle du modèle, et la casserole vaut la somme des boîtes.
  const src = strip(await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url)));
  assert(!src.includes("POT_GROWTH_MARGIN") && !src.includes("POT_GROWTH_PASSES"), "la marge ou les passes de croissance sont revenues");
  assert(src.includes("const POT_IDENTITY_MARGIN = 1;"), "le rétrécissement ne reçoit plus la marge d'identité");
  assert(/const factor = rawFactor;/.test(src), "un facteur de croissance est multiplié par autre chose que 1");
  // Les deux appels lisent des facteurs de boîte à 1: les boîtes ne sont plus ancrées.
  assertEquals((src.match(/neededPotFactor\(\n\s*potDrawsByItems\(sizableBoxes\),\n\s*IDENTITY_BOX_FACTORS,/g) ?? []).length, 2);
  // Le rétrécissement lit les tirages du modèle, pas des tirages ancrés.
  const shrink = src.slice(src.indexOf("const drawnByPot = new Map<string, number>();"));
  assert(/const factor = 1;/.test(shrink.slice(0, 600)), "le rétrécissement multiplie encore les tirages par le facteur d'ancre");
  // Et aucun plafond de casserole ne borne l'identité.
  const grow = src.slice(src.indexOf("IDENTITY_BOX_FACTORS,"), src.indexOf("growth.short_after"));
  assert(!grow.includes("MAX_SINGLE_INGREDIENT_G"), "un plafond de casserole rabote l'identité");
});

Deno.test("CÂBLAGE — la croissance des pots attribue les tirages PAR ITEM (une boîte, une casserole), plus par `uses.servings`", async () => {
  const src = await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url));
  // Le patron d'avant — la boîte entière répartie sur les `uses` du plat — a disparu.
  assert(!src.includes("shares: [{ key: box.boxId, grams: box.items.reduce("), "les tirages suivaient encore `uses.servings`");
  // Les deux appels (passes de croissance, puis `short_after`) lisent les items.
  assertEquals((src.match(/neededPotFactor\(\n\s*potDrawsByItems\(sizableBoxes\),/g) ?? []).length, 2);
  assert(src.includes("uses: [{ preparationId, servings: 1 }],"), "un tirage par (boîte, casserole)");
});
