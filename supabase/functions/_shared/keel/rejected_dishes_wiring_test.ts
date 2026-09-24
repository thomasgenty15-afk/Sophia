/**
 * « REMPLACER » ET LA LISTE DES PLATS REFUSÉS SONT BRANCHÉS AU BON ENDROIT —
 * 2026-09-24.
 *
 * `rejected_dishes.ts` et `dish_replace.ts` sont purs et testés; ça ne dit
 * RIEN de l'endroit où ils tournent. Ce fichier épingle les jonctions de
 * `generate-household-meal-v1`, et chaque épingle a sa moitié qui mord: la
 * même lecture, sur la source MUTÉE, doit nommer la jonction coupée.
 *
 *   ① la liste est lue dans la ligne `student_goals`, et sa ligne entre dans
 *      l'entrée commune des DEUX constructeurs de consigne;
 *   ② son compteur lit le plan ÉCRIT, est journalisé, et rangé dans
 *      `generated_from`;
 *   ③ le mode `cells_from: "rejections"` étend aux plats que LA garde
 *      viderait (`judgeDishEaters`, `servedExclusionBites`), jamais à un
 *      matcher d'ici;
 *   ④ le modèle ne rend que ses cases (`cells_only`), et la fusion prend des
 *      PLATS (`mergeRejectionEdit`);
 *   ⑤ chaque raison passe la garde de la note (`readDraftNote`: plancher
 *      TCA, interdits de doctrine) AVANT d'être citée au modèle.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE: un commentaire ne
 * câble rien.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const SRC = stripComments(
  await sourceFamily(new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR)),
);

function after(src: string, anchor: string, length = 600): string {
  const at = src.indexOf(anchor);
  return at < 0 ? "" : src.slice(at, at + length);
}

function broken(src: string): string[] {
  const out: string[] = [];

  // ① LA LISTE ET SA LIGNE, DANS L'ENTRÉE DES DEUX CONSTRUCTEURS.
  const input = after(src, "const householdPromptInput = {", 40_000);
  const inputEnd = input.indexOf("\n    };");
  if (
    !src.includes("const rejectedEntries = readRejectedDishes(goalRow.practical_constraints);") ||
    !after(src, "const rejectedLine = rejectedDishesLine({", 200).includes("entries: rejectedEntries") ||
    !/\n\s+rejectedDishesLine: rejectedLine,\n/.test(input.slice(0, inputEnd))
  ) out.push("① consigne");

  // ② LE COMPTEUR, SUR LE PLAN ÉCRIT.
  const trace = after(src, "const rejectedTrace = {", 900);
  if (
    !trace.includes("line_used: household.rejectedLineUsed") ||
    !trace.includes("writePayload.dishes") ||
    !src.includes('tag: "keel.household_meal.rejected_dishes"') ||
    !src.includes("(writePayload.generated_from as Record<string, unknown>).rejected_dishes = rejectedTrace;")
  ) out.push("② compteur");

  // ③ L'EXTENSION PAR LA GARDE ELLE-MÊME.
  const block = after(src, 'if (editCellsFrom === "rejections") {', 4_000);
  if (
    !block.includes("judgeDishEaters({") || !block.includes("servedExclusionBites({") ||
    !block.includes("rejectionEditPlan({") || !block.includes('error: "dish_unknown"')
  ) out.push("③ extension");

  // ④ SES CASES SEULEMENT, ET UNE FUSION PAR PLAT.
  if (
    !src.includes('returns: editCellsFrom !== null ? "cells_only" : "full_plan",') ||
    !after(src, "const replaced = mergeRejectionEdit({", 300).includes("dishKeys: editDishKeys") ||
    !src.includes('error: "dish_not_rendered"')
  ) out.push("④ fusion");

  // ⑤ LA RAISON PASSE LA GARDE DE LA NOTE AVANT D'ATTEINDRE LE MODÈLE.
  // Trouvé par les tests complémentaires du 2026-09-24: « 800 kcal par jour »
  // écrit comme raison partait tel quel dans « they said: … ».
  const head = src.indexOf('if (editCellsFrom === "rejections") {');
  const guardAt = src.indexOf("const guardedTargets = editRejections.targets.map(");
  const planAt = src.indexOf("const plan = rejectionEditPlan({");
  const guard = after(src, "const guardedTargets = editRejections.targets.map(", 700);
  if (
    head < 0 || guardAt < head || planAt < guardAt ||
    !guard.includes("readDraftNote({") || !guard.includes("doctrineForbidden,") ||
    !guard.includes("restrictionFlag ?? true") ||
    !after(src, "const plan = rejectionEditPlan({", 200).includes("targets: guardedTargets,")
  ) out.push("⑤ garde");

  return out;
}

Deno.test("les jonctions de « Remplacer » et des plats refusés sont branchées", () => {
  assertEquals(broken(SRC), []);
});

Deno.test("chaque épingle mord sur sa jonction, et sur elle seule", () => {
  const cut = (from: string, to: string) => {
    if (!SRC.includes(from)) throw new Error(`ancre absente: ${from}`);
    return SRC.replace(from, to);
  };
  assertEquals(broken(cut("      rejectedDishesLine: rejectedLine,\n", "")), ["① consigne"]);
  assertEquals(
    broken(cut("line_used: household.rejectedLineUsed", "line_used: false")),
    ["② compteur"],
  );
  assertEquals(broken(cut("const judged = judgeDishEaters({", "const judged = ({")), ["③ extension"]);
  assertEquals(
    broken(cut('returns: editCellsFrom !== null ? "cells_only" : "full_plan",', 'returns: "full_plan",')),
    ["④ fusion"],
  );
  assertEquals(
    broken(cut("targets: guardedTargets,", "targets: editRejections.targets,")),
    ["⑤ garde"],
  );
});
