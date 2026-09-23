/**
 * LA LISTE « À ÉVITER » EST BRANCHÉE AU BON ENDROIT — 2026-09-23.
 *
 * `plan_avoid_list.ts` est pur et testé; ça ne dit RIEN de l'endroit où il
 * tourne. Ce fichier épingle les jonctions de `generate-household-meal-v1`,
 * et chaque épingle a sa moitié qui mord: la même lecture, sur la source
 * MUTÉE, doit nommer la jonction coupée — et elle seule.
 *
 *   ① la liste est calculée APRÈS le chargement du référentiel, sur lui, avec
 *      ce que la personne veut garder;
 *   ② la lecture des plans d'avant exclut le plan remplacé et s'arrête au
 *      début du plan demandé;
 *   ③ le garde-manger ne protège qu'en mode `from_pantry`;
 *   ④ la ligne entre dans l'entrée commune des DEUX constructeurs de consigne;
 *   ⑤ le compteur lit le plan ÉCRIT, est journalisé, et rangé dans
 *      `generated_from`.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE: un commentaire ne
 * câble rien.
 */
import { assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const SRC = stripComments(
  await Deno.readTextFile(new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR)),
);

/** Les `length` caractères qui commencent à `anchor`, ou `""` s'il est absent. */
function after(src: string, anchor: string, length = 600): string {
  const at = src.indexOf(anchor);
  return at < 0 ? "" : src.slice(at, at + length);
}

/** Les jonctions coupées, nommées. Vide = tout est branché. */
function broken(src: string): string[] {
  const out: string[] = [];

  // ① APRÈS LE RÉFÉRENTIEL, SUR LUI, AVEC CE QU'ON GARDE.
  const loaded = src.indexOf("composition = await loadCompositionIndex(");
  const computed = src.indexOf("avoidListFrom({");
  const call = after(src, "avoidListFrom({", 200);
  if (
    loaded < 0 || computed < loaded || !call.includes("index: composition") ||
    !call.includes("keepSlugs: avoidKeepSlugs") || !call.includes("previousPlans: avoidPreviousPlans")
  ) out.push("① liste");

  // ② LA LECTURE.
  const read = after(src, "loadPreviousHouseholdPlans(admin, {", 300);
  if (
    !read.includes("beforeStartsOn: startsOn") || !read.includes("excludeId: replaces") ||
    !read.includes("householdId") || !read.includes("ownerUserId: userId")
  ) out.push("② lecture");

  // ③ LE GARDE-MANGER, SEULEMENT EN MODE GARDE-MANGER.
  if (!/if \(askedMode === "from_pantry" && composition !== null\) \{\s*for \(const item of askedPantry\)/.test(src)) {
    out.push("③ garde-manger");
  }

  // ④ LA LIGNE DANS L'ENTRÉE DES DEUX CONSTRUCTEURS.
  const input = after(src, "const householdPromptInput = {", 40_000);
  const inputEnd = input.indexOf("\n    };");
  if (
    !src.includes("const avoidLine = avoidLineOf(avoid.list);") ||
    !/\n\s+avoidLine,\n/.test(input.slice(0, inputEnd)) ||
    !src.includes("...householdPromptInput,") ||
    !src.includes(": buildHouseholdPromptBlocks(householdPromptInput);")
  ) out.push("④ consigne");

  // ⑤ LE COMPTEUR, SUR LE PLAN ÉCRIT.
  if (
    !/avoidedCameBack\(\{\s*plan: readAvoidPlan\(writePayload\.dishes, writePayload\.preparations\)/
      .test(src) ||
    !src.includes('tag: "keel.household_meal.avoid_list"') ||
    !src.includes("(writePayload.generated_from as Record<string, unknown>).avoid_list = avoidTrace;") ||
    !src.includes("line_used: household.avoidLineUsed")
  ) out.push("⑤ compteur");

  return out;
}

Deno.test("la liste « à éviter » est branchée — toutes les jonctions", () => {
  assertEquals(broken(SRC), []);
});

Deno.test("chaque jonction coupée est nommée, et elle seule", () => {
  const cut = (from: string, to: string) => {
    const mutated = SRC.replace(from, to);
    if (mutated === SRC) throw new Error(`mutation sans effet: ${from}`);
    return broken(mutated);
  };
  assertEquals(cut("keepSlugs: avoidKeepSlugs", "keepSlugs: []"), ["① liste"]);
  assertEquals(cut("excludeId: replaces", "excludeId: null"), ["② lecture"]);
  assertEquals(
    cut('if (askedMode === "from_pantry" && composition !== null)', "if (composition !== null)"),
    ["③ garde-manger"],
  );
  assertEquals(cut("      avoidLine,\n", "\n"), ["④ consigne"]);
  assertEquals(
    cut('tag: "keel.household_meal.avoid_list"', 'tag: "keel.household_meal.other"'),
    ["⑤ compteur"],
  );
  assertEquals(
    cut("plan: readAvoidPlan(writePayload.dishes, writePayload.preparations)", "plan: readAvoidPlan([], [])"),
    ["⑤ compteur"],
  );
});
