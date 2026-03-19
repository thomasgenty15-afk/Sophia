import {
  classifyArchitectUpdateKind,
  deriveWeekNumFromModuleId,
} from "./architect_memory.ts";

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}

Deno.test("deriveWeekNumFromModuleId: extracts axis week from architect module ids", () => {
  assert(deriveWeekNumFromModuleId("a3_c2_m1") === 3, "should extract week 3");
  assert(
    deriveWeekNumFromModuleId("a1_c1_m1_174000") === 1,
    "should extract week 1 even with suffix",
  );
  assert(
    deriveWeekNumFromModuleId("round_table_1") === null,
    "round tables are not axis modules",
  );
});

Deno.test("classifyArchitectUpdateKind: distinguishes creation / precision / contradiction", () => {
  assert(
    classifyArchitectUpdateKind("", "Je veux devenir plus discipliné.") ===
      "creation",
    "empty old text should be creation",
  );
  assert(
    classifyArchitectUpdateKind(
        "Je veux devenir plus discipliné.",
        "Je veux devenir plus discipliné, surtout dans ma routine du soir.",
      ) === "precision",
    "expanded answer should be precision",
  );
  assert(
    classifyArchitectUpdateKind(
        "Je me vois comme quelqu'un qui doit toujours tout contrôler.",
        "Je ne veux plus tout contrôler et j'essaie d'apprendre à lâcher prise.",
      ) === "contradiction",
    "negation-heavy shift should be contradiction",
  );
});
