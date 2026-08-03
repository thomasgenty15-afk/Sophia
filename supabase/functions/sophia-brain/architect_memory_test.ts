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
});

// W2.D-2 — this test asserted a three-way classifier (creation / precision / contradiction).
// `classifyArchitectUpdateKind` no longer implements one: it is two lines
// (`architect_memory.ts:148-154`), explicitly discards `newText` via `void newText`, and
// returns `creation` on empty previous text, `correction` otherwise. The `precision` and
// `contradiction` members survive only in the `ArchitectUpdateKind` union.
//
// The test is re-pointed at the contract that exists. Note for a later wave: the whole
// `sophia-brain/architect_memory.ts` module is now ORPHANED — this test file is its only
// importer, the Architecte triggers were dropped in W2.A (migration 20260727150000) and the
// Architecte frontend tabs were deleted in W2.B. When the module goes, this file goes with it.
Deno.test("classifyArchitectUpdateKind: creation on first answer, correction on any rewrite", () => {
  assert(
    classifyArchitectUpdateKind("", "Je veux devenir plus discipliné.") ===
      "creation",
    "empty old text should be creation",
  );
  assert(
    classifyArchitectUpdateKind("   ", "Je veux devenir plus discipliné.") ===
      "creation",
    "whitespace-only old text should be creation",
  );
  assert(
    classifyArchitectUpdateKind(
        "Je veux devenir plus discipliné.",
        "Je veux devenir plus discipliné, surtout dans ma routine du soir.",
      ) === "correction",
    "an expanded answer over existing text is a correction",
  );
  assert(
    classifyArchitectUpdateKind(
        "Je me vois comme quelqu'un qui doit toujours tout contrôler.",
        "Je ne veux plus tout contrôler et j'essaie d'apprendre à lâcher prise.",
      ) === "correction",
    "a negation-heavy shift over existing text is also a correction",
  );
});
