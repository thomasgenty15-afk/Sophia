import { assert, assertEquals } from "jsr:@std/assert@1";
import { preferenceSplitRetryInstruction, SPLIT_RETRY_MIN_CELLS } from "./preference_split_retry.ts";

Deno.test("la relance nomme le mot, la bouche qui le veut, le plancher de repas, et interdit la boîte de l'autre", () => {
  const text = preferenceSplitRetryInstruction([{ term: "asperges", wanter: "Paul", refusers: ["Claire"] }], 13, "boxes") ?? "";
  assert(text.includes('"asperges"'), text);
  assert(text.includes("asked for Paul in a box of their own"), text);
  assert(text.includes(`At least ${SPLIT_RETRY_MIN_CELLS} lunches or dinners`), text);
  assert(text.includes("NEVER from the box of Claire"), text);
  assert(text.includes("Keep every dish, day and slot"), text);
  assert(text.includes("do NOT shorten the plan"), text);
  assert(text.includes("nobody's business"), "la relance ne protège plus le « why »");
});

Deno.test("épinglage — SPLIT_RETRY_MIN_CELLS vaut 2", () => assertEquals(SPLIT_RETRY_MIN_CELLS, 2));

Deno.test("sans demandeur privé, ou sans cellule, pas de relance", () => {
  assertEquals(preferenceSplitRetryInstruction([], 13, "boxes"), null);
  assertEquals(preferenceSplitRetryInstruction([{ term: "asperges", wanter: "Paul", refusers: [] }], 0, "boxes"), null);
  assertEquals(preferenceSplitRetryInstruction([{ term: "", wanter: "Paul", refusers: [] }], 13, "boxes"), null);
});

Deno.test("le plancher ne dépasse jamais les cellules vérifiées", () => {
  const text = preferenceSplitRetryInstruction([{ term: "asperges", wanter: "Paul", refusers: [] }], 1, "boxes") ?? "";
  assert(text.includes("At least 1 lunches"), text);
});

async function generatorSource(): Promise<string> {
  return await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url));
}

Deno.test("CÂBLAGE — la relance tourne après le flagrant, avant le relogement, et prend ses cellules par parties", async () => {
  const src = await generatorSource();
  const swapAt = src.indexOf("let swap = swapPresence(");
  const splitAt = src.indexOf("preferenceSplitRetryInstruction(");
  const rehomeAt = src.indexOf("rehomeHeldOff(");
  assert(splitAt > -1, "la lane foyer n'appelle plus la relance « préférence contre exclusion »");
  assert(swapAt < splitAt && splitAt < rehomeAt, "ordre attendu: flagrant → préférence contre exclusion → relogement");
  const block = src.slice(splitAt, rehomeAt);
  assert(/mergeRetryCells\(\{ base: meal, retry: retried, cells: repaired \}\)/.test(block), "la relance rejette encore le plan entier sans rien garder");
  assert(/preference_split_retry_rejected/.test(block), "un rejet n'est pas journalisé avec son motif");
  assert(/preference_split_retry_merged/.test(block), "une fusion n'est pas journalisée");
  assert(/!\(mergedDelivered\.missing <= delivered\.missing\)/.test(block), "la fusion peut acheter les asperges de l'un avec l'assiette de l'autre");
  // Le compte final (archive) porte la relance.
  assert(/retry_attempts: splitRetryAttempts,/.test(src) && /retry_merged_cells: splitRetryMergedCells,/.test(src) && /retry_rejected_by: splitRetryRejectedBy,/.test(src), "les compteurs de la relance n'atteignent pas `preference_split`");
  // Une seule mesure du « composé », partagée par la relance et l'archive.
  assertEquals((src.match(/const preferenceSplitCarriage = /g) || []).length, 1, "la mesure du composant par boîte n'est plus une seule fonction");
  assert((src.match(/preferenceSplitCarriage\(/g) || []).length >= 3, "l'archive et la relance ne lisent pas la même mesure");
});
