/**
 * ⟳ 2026-09-24 — L'IDENTIFICATION EST BRANCHÉE, ET AVANT LE SAS.
 *
 * Le banc du module (`composition_identify_test.ts`) ne dit rien de l'endroit
 * où il tourne, et l'endroit EST le lot : après le sas, une ligne au code
 * refusé est déjà perdue — le sas ne la regarde pas, et le plat part sans
 * portion (brouillon `377e91ad`).
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE
 * (`caller-audit-must-strip-comments`).
 */
import { assert } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const HANDLER = stripComments(
  await Deno.readTextFile(new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR)),
);
const CATALOG = stripComments(
  await Deno.readTextFile(new URL("_shared/keel/composition_contract.ts", FUNCTIONS_DIR)),
);

Deno.test("l'identification du premier jet tourne AVANT le registre des à-côtés et AVANT le sas", () => {
  const identify = HANDLER.indexOf(
    'identifyFoods({ withPlanLines: true, source: "composition_identify" })',
  );
  const ledger = HANDLER.indexOf("buildSideLedgerFor(meal, NO_BOUNDARY_DEFICIT)");
  const fill = HANDLER.indexOf("const filledComposition = await fillPlanComposition({");
  assert(identify > 0, "l'identification du premier jet n'a plus d'appelant");
  assert(identify < ledger, "le registre des à-côtés pèse avant l'identification");
  assert(identify < fill, "l'identification tourne après le sas : les codes refusés sont perdus");
  const regram = HANDLER.indexOf("const regrammed = regramMeal(meal, composition);");
  assert(regram > fill, "le plan n'est plus repesé après le sas");
});

Deno.test("en tête de chaque tour, les à-côtés relus sont identifiés avant leur registre", () => {
  const at = HANDLER.indexOf(
    'await identifyFoods({ withPlanLines: false, source: "side_course_identify" });',
  );
  assert(at > 0, "les à-côtés d'une candidate réparée ne sont plus identifiés");
  const next = HANDLER.indexOf("sideLedger = buildSideLedgerFor(meal, NO_BOUNDARY_DEFICIT);", at);
  const read = HANDLER.lastIndexOf("readSideCourses(mealSourceText);", at);
  assert(read > 0 && next > at && next - at < 200, "l'ordre lecture → identification → registre est rompu");
});

Deno.test("les aliments écrits par la réparation passent aussi par l'identification, avant le sas", () => {
  const identify = HANDLER.indexOf("source: `${FN_NAME}.final_repair_identify`");
  const fill = HANDLER.indexOf("source: `${FN_NAME}.final_repair_fill`");
  assert(identify > 0, "l'identification après réparation n'a plus d'appelant");
  assert(identify < fill, "l'identification après réparation tourne après son sas");
});

Deno.test("la vérification des codes lit le nom avant de déclarer un code manquant", () => {
  const at = HANDLER.indexOf("const outputContractOf = (m: typeof meal) =>");
  assert(at > 0);
  const bloc = HANDLER.slice(at, at + 800);
  assert(bloc.includes("resolveCompositionLine(composition, {"), "le nom n'est plus lu");
});

Deno.test("la consigne du catalogue fait nommer, jamais coder", () => {
  assert(CATALOG.includes('Do not write "ref"'));
  assert(!CATALOG.includes("pick the closest listed id"), "l'ancienne consigne du voisin est revenue");
  assert(!CATALOG.includes('add \\"ref\\"') && !CATALOG.includes('add "ref"'));
});

Deno.test("les deux identifications oublient l'identifiant du modèle", () => {
  for (const anchor of ["const identifyFoods = async (args: {", "source: `${FN_NAME}.final_repair_identify`"]) {
    const at = HANDLER.indexOf(anchor);
    assert(at > 0, anchor);
    const bloc = anchor.startsWith("const")
      ? HANDLER.slice(at, at + 1400)
      : HANDLER.slice(Math.max(0, at - 700), at);
    assert(bloc.includes("forgetModelRefs: true,"), `${anchor} garde les identifiants du modèle`);
  }
});
