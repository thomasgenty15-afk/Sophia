import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SWAP_SLOTS,
  swapPresence,
  swapRetryInstruction,
} from "./swap_presence.ts";

const LEA = "lea", MARC = "marc", TOM = "tom";
const days = ["mon", "tue", "wed"];
const cells = (slots: readonly string[]) =>
  days.flatMap((day) => slots.map((slot) => ({ day, slot })));
const mouth = (memberId: string, regime: "vegetarian" | "vegan" | "pescatarian" | null, slots = ["breakfast", "lunch", "dinner"]) =>
  ({ memberId, regime, cells: cells(slots) });
const dish = (day: string, slot: string, bites: ("vegetarian" | "vegan" | "pescatarian")[] = [], memberId: string | null = null) =>
  ({ day, slot, memberId, regimeBites: bites });
const allVeg = () => days.flatMap((d) => [dish(d, "breakfast"), dish(d, "lunch"), dish(d, "dinner")]);

Deno.test("LE FAIT MESURÉ (C06): tout végétarien, quatre omnivores — 6/6 cellules sans composant, flagrant", () => {
  const r = swapPresence({
    dishes: allVeg(),
    mouths: [mouth(LEA, "vegetarian"), mouth(MARC, null), mouth(TOM, null)],
    strictest: "vegetarian",
  });
  assertEquals(r.counters.cells_checked, 6);
  assertEquals(r.counters.cells_carrying, 0);
  assertEquals(r.counters.cells_swap_absent, 6);
  assertEquals(r.counters.flagrant, true);
  assertEquals(r.counters.free_mouths, 2);
  assertEquals(r.counters.bound_mouths, 1);
  assertEquals(r.absentCells.length, 6);
  assertEquals(r.freeMemberIds, [MARC, TOM]);
});

Deno.test("LE CAS QUI PASSE (C03): la casserole carnée est sur la surface du plat — la cellule porte", () => {
  const dishes = allVeg().map((d) => d.slot === "dinner" ? dish(d.day, d.slot, ["vegetarian"]) : d);
  const r = swapPresence({
    dishes,
    mouths: [mouth(LEA, "vegetarian"), mouth(MARC, null)],
    strictest: "vegetarian",
  });
  assertEquals(r.counters.cells_checked, 6);
  assertEquals(r.counters.cells_carrying, 3);
  assertEquals(r.counters.cells_swap_absent, 3);
  assertEquals(r.counters.flagrant, false);
  assertEquals(r.absentCells.map((c) => c.slot), ["lunch", "lunch", "lunch"]);
});

Deno.test("le petit-déjeuner ne compte pas: un skyr pour tous n'est pas la table au régime", () => {
  assertEquals(SWAP_SLOTS, ["lunch", "dinner"]);
  const r = swapPresence({
    dishes: allVeg(),
    mouths: [mouth(LEA, "vegetarian"), mouth(MARC, null, ["breakfast"])],
    strictest: "vegetarian",
  });
  assertEquals(r.counters.cells_checked, 0);
  assertEquals(r.counters.flagrant, false);
});

Deno.test("sans ligne stricte, ou sans bouche libre, ou sans bouche liée: rien à vérifier, jamais flagrant", () => {
  const veg = allVeg();
  assertEquals(swapPresence({ dishes: veg, mouths: [mouth(MARC, null)], strictest: null }).counters.flagrant, false);
  const allBound = swapPresence({ dishes: veg, mouths: [mouth(LEA, "vegetarian"), mouth(TOM, "vegetarian")], strictest: "vegetarian" });
  assertEquals(allBound.counters.cells_checked, 0);
  assertEquals(allBound.counters.bound_mouths, 2);
  const noBound = swapPresence({ dishes: veg, mouths: [mouth(MARC, null)], strictest: "vegetarian" });
  assertEquals(noBound.counters.cells_checked, 0);
});

Deno.test("le plat dédié à la bouche liée ne nourrit pas les libres: il ne fait pas porter la cellule", () => {
  const dishes = [...allVeg(), dish("mon", "dinner", ["vegetarian"], LEA)];
  const r = swapPresence({ dishes, mouths: [mouth(LEA, "vegetarian"), mouth(MARC, null)], strictest: "vegetarian" });
  assertEquals(r.counters.cells_carrying, 0);
  // …mais un plat dédié à une bouche LIBRE, oui.
  const r2 = swapPresence({ dishes: [...allVeg(), dish("mon", "dinner", ["vegetarian"], MARC)], mouths: [mouth(LEA, "vegetarian"), mouth(MARC, null)], strictest: "vegetarian" });
  assertEquals(r2.counters.cells_carrying, 1);
});

Deno.test("une cellule sans plat n'entre pas dans le dénominateur: c'est un trou, porté ailleurs", () => {
  const dishes = allVeg().filter((d) => !(d.day === "wed" && d.slot === "dinner"));
  const r = swapPresence({ dishes, mouths: [mouth(LEA, "vegetarian"), mouth(MARC, null)], strictest: "vegetarian" });
  assertEquals(r.counters.cells_checked, 5);
});

Deno.test("la bouche absente d'une cellule n'y compte pas: seule la présence d'une bouche libre ouvre la cellule", () => {
  const r = swapPresence({
    dishes: allVeg(),
    mouths: [mouth(LEA, "vegetarian"), { memberId: MARC, regime: null, cells: [{ day: "mon", slot: "dinner" }] }],
    strictest: "vegetarian",
  });
  assertEquals(r.counters.cells_checked, 1);
  assertEquals(r.absentCells, [{ day: "mon", slot: "dinner" }]);
});

Deno.test("propriété: checked = carrying + swap_absent, et flagrant ⇔ checked > 0 ∧ carrying = 0", () => {
  for (let k = 0; k <= 6; k++) {
    const dishes = allVeg().map((d, i) => (SWAP_SLOTS.includes(d.slot) && i % 7 < k) ? dish(d.day, d.slot, ["vegetarian"]) : d);
    const c = swapPresence({ dishes, mouths: [mouth(LEA, "vegetarian"), mouth(MARC, null)], strictest: "vegetarian" }).counters;
    assertEquals(c.cells_checked, c.cells_carrying + c.cells_swap_absent);
    assertEquals(c.flagrant, c.cells_checked > 0 && c.cells_carrying === 0);
  }
});

Deno.test("LA RELANCE décrit la sortie attendue: base gardée, UNE casserole de plus, citée par les seules boîtes libres", () => {
  const text = swapRetryInstruction({ strictest: "vegetarian", freeNames: ["Marc", "Tom"], boundNames: ["Léa"], cellsChecked: 10 });
  assert(text !== null);
  assert(text.includes("NOBODY IN THIS PLAN EATS MEAT, POULTRY AND FISH"), text);
  assert(text.includes("Marc, Tom are not bound by the vegetarian line"), text);
  assert(text.includes("only Léa is"), text);
  assert(text.includes("at least 5 of the 10"), text);
  assert(text.includes("keep the shared base exactly as it is"), text);
  assert(text.includes("ADD one more preparation"), text);
  assert(text.includes("cooked apart, with its own id"), text);
  assert(text.includes("Cite it ONLY from the boxes of Marc, Tom"), text);
  assert(text.includes("the box of Léa keeps the plant replacement"), text);
  assert(text.includes("Do NOT drop a dish"), text);
  assert(text.includes("do NOT mention any of this"), text);
  // Le régime change les mots: un pescatarien garde le poisson.
  const pesc = swapRetryInstruction({ strictest: "pescatarian", freeNames: ["Marc"], boundNames: ["Léa"], cellsChecked: 1 });
  assert(pesc !== null && pesc.includes("MEAT AND POULTRY") && !pesc.includes("AND FISH"), pesc ?? "");
  assert(pesc.includes("at least 1 of the 1"), pesc);
});

Deno.test("LA RELANCE se tait quand elle n'a personne à nommer", () => {
  assertEquals(swapRetryInstruction({ strictest: "vegetarian", freeNames: [], boundNames: ["Léa"], cellsChecked: 4 }), null);
  assertEquals(swapRetryInstruction({ strictest: "vegetarian", freeNames: ["Marc"], boundNames: [" "], cellsChecked: 4 }), null);
  assertEquals(swapRetryInstruction({ strictest: "vegetarian", freeNames: ["Marc"], boundNames: ["Léa"], cellsChecked: 0 }), null);
});

// ── CÂBLAGE ──────────────────────────────────────────────────────────────────
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = async (rel: string) => stripComments(await Deno.readTextFile(new URL(rel, import.meta.url)));

Deno.test("CÂBLAGE — la ceinture pose regimeBites sur le plat, au niveau PLAT, avant de sortir", async () => {
  const src = await read("./meal_generation.ts");
  assert(/regimeBites: DietaryRegime\[\];/.test(src), "le plat parsé ne porte plus ses morsures");
  assert(/breach\.matched !== null && !dishRegimeBites\.includes\(regime\)/.test(src), "la morsure au niveau plat n'est plus enregistrée");
  // Enregistrée AVANT le `continue` qui saute les plats sans morsure.
  const at = src.indexOf("dishRegimeBites.push(regime)");
  const cont = src.indexOf("if (breach.matched === null) continue;", at);
  assert(at > -1 && cont > at, "le dénominateur est posé après la sortie");
  assert(/regimeBites: dishRegimeBites,/.test(src), "le plat rendu ne porte pas dishRegimeBites");
});

Deno.test("CÂBLAGE — le générateur compte, relance le flagrant seulement, archive, journalise", async () => {
  const src = await read("../../generate-household-meal-v1/index.ts");
  assert(/regime: m\.diet,/.test(src), "les cellules ne portent plus le régime de la bouche");
  assert(/regimeBites: d\.regimeBites,/.test(src), "la vue swap ne porte plus regimeBites");
  assert(/swap\.counters\.flagrant && !adoptingDraft && strictestRegime !== null/.test(src), "la relance ne se déclenche plus sur le seul cas flagrant");
  assert(/source: `\$\{FN_NAME\}\.swap_retry`/.test(src), "la relance swap n'a plus sa source");
  assert(/after\.counters\.cells_carrying > swap\.counters\.cells_carrying/.test(src), "l'acceptation n'exige plus des cellules qui portent");
  // ⟳ 2026-09-06: le manque n'est plus une condition d'acceptation — la boucle qui suit
  // le répare, et le retour en arrière (`preSwap`) garantit qu'un plan carné avec des
  // repas manquants n'est jamais livré (voir le test ci-dessus).
  assert(/retried\.regime_belt\.refused <= meal\.regime_belt\.refused/.test(src), "l'acceptation laisse la ceinture refuser davantage");
  assert(/retried\.regime_belt\.refused <= meal\.regime_belt\.refused/.test(src), "l'acceptation laisse la ceinture refuser davantage");
  assert(/tag: "keel\.household_meal\.swap_presence"/.test(src), "le journal swap_presence a disparu");
  // ⟳ 2026-09-06: une relance refusée dit laquelle des quatre conditions l'a refusée.
  assert(/tag: "keel\.household_meal\.swap_retry_rejected"/.test(src), "le rejet de la relance du flagrant est muet");
  assert(/retry_rejected_by: swapRetryRejectedBy,/.test(src), "le motif de rejet n'est pas archivé");
  assert(/swap: \{\s*\.\.\.swap\.counters,/.test(src), "generated_from.household.swap n'est plus archivé");
  // ⟳ 2026-09-06 (M07 r2): la relance du flagrant tourne AVANT la boucle « personne
  // sans repas » (qui répare ce qu'elle casse), et on revient au plan d'avant si la
  // boucle n'y arrive pas. Le manque ne la refuse plus en bloc.
  const swapAt = src.indexOf("let swap = swapPresence(");
  const loopAt = src.indexOf("const UNFED_RETRIES_MAX = 3;");
  const restorableAt = src.indexOf("const restorable = delivered.mouths");
  assert(swapAt > -1 && loopAt > swapAt && restorableAt > loopAt, "ordre attendu: relance du flagrant → boucle personne sans repas → dernier recours");
  assert(!/\? "missing"/.test(src.slice(swapAt, loopAt)), "le manque refuse encore la relance du flagrant en bloc");
  assert(/preSwap = \{ meal, mealSourceText, delivered, swap \};/.test(src), "l'instantané d'avant la relance a disparu");
  assert(/if \(preSwap !== null && delivered\.missing > preSwap\.delivered\.missing\) \{/.test(src.slice(loopAt, restorableAt)), "le retour en arrière ne suit plus la boucle");
  assert((src.match(/retry_reverted: swapReverted,/g) || []).length === 2, "retry_reverted absent du journal ou de l'archive");
  // ⟳ 2026-09-06 (M07 r3, rejetée par `carrying` en entier) — par parties: les cellules
  // qui portent ENFIN le composant sont prises, le reste du plan ne bouge pas.
  const swapBlock = src.slice(swapAt, loopAt);
  assert(/const repaired = \[\.\.\.absentBefore\]\.filter\(\(c\) => !absentAfter\.has\(c\)\);/.test(swapBlock), "les cellules réparées ne sont plus « absentes avant, portées après »");
  assert(/mergeRetryCells\(\{ base: meal, retry: retried, cells: repaired \}\)/.test(swapBlock), "la relance du flagrant rejette encore le plan entier sans rien garder");
  assert(/mergedSwap\.counters\.cells_carrying > swap\.counters\.cells_carrying/.test(swapBlock), "la fusion partielle n'exige plus de porter davantage");
  assert(/swap_retry_merged/.test(swapBlock), "la fusion partielle du flagrant n'est pas journalisée");
  assert(/preSwap = \{ meal, mealSourceText, delivered, swap \};/.test(swapBlock.slice(swapBlock.indexOf("swap_retry_merged") - 1200, swapBlock.indexOf("swap_retry_merged"))), "la fusion partielle ne garde pas l'instantané: le retour en arrière ne la couvre pas");
  assert((src.match(/retry_merged_cells: swapRetryMergedCells,/g) || []).length === 2, "retry_merged_cells absent du journal ou de l'archive");
});

Deno.test("CÂBLAGE — v28: l'échappatoire « nothing clashes » nomme la sortie, à côté de la clé \"boxes\"", async () => {
  const src = await Deno.readTextFile(new URL("./household_meal_generation.ts", import.meta.url));
  const version = src.match(/HOUSEHOLD_PROMPT_VERSION = "v(\d+)_/);
  assert(version !== null && Number(version[1]) >= 28, "version");
  assert(src.includes("That preparation is NEVER cited by the box of the person that line binds"), "v29: à qui ne PAS servir le composant");
  const at = src.indexOf("If nothing clashes, everyone shares the same one -- but nothing clashing");
  assert(at > -1, "la phrase v28 a disparu");
  assert(src.includes("BECAUSE THE WHOLE PLAN AVOIDS what one line refuses is not sharing"), src.slice(at, at + 400));
  assert(src.includes("the component it refuses is ONE MORE preparation, cited"), "la sortie attendue n'est plus décrite");
  assert(src.includes("A week without it for them is a mistake."), "la conséquence pour les bouches libres n'est plus nommée");
  // Adjacente à la clé qu'elle promet (promesse et clé de schéma doivent se
  // toucher): dans le MÊME tableau de lignes que la mention de "boxes", sans
  // qu'un `];` les sépare — mesuré sur la source sans ses commentaires, qui
  // sont ce que le modèle ne voit pas.
  const bare = stripComments(src);
  const at2 = bare.indexOf("If nothing clashes, everyone shares the same one -- but nothing clashing");
  const boxesKey = bare.lastIndexOf('"boxes"', at2);
  assert(at2 > -1 && boxesKey > -1, "phrase ou clé absente de la source nue");
  assert(!bare.slice(boxesKey, at2).includes("];"), "la promesse v28 n'est plus dans le bloc qui nomme \"boxes\"");
  assert(at2 - boxesKey < 2500, `la clé "boxes" est à ${at2 - boxesKey} caractères de la promesse, hors commentaires`);
});
