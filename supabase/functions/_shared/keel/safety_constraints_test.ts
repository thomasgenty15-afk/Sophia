// KEEL W3.3 — student safety constraints: every-turn load OUTSIDE the memory
// path, and the deterministic medical validator.
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  assertNoMedicalConstraintViolation,
  findMedicalConstraintViolations,
  loadStudentSafetyConstraints,
  medicalConstraintTokens,
  MedicalConstraintViolationError,
  SafetyConstraintsLoadError,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";

function constraint(
  patch: Partial<StudentSafetyConstraint> = {},
): StudentSafetyConstraint {
  return {
    id: "c1",
    userId: "u1",
    kind: "allergy",
    allergenRef: "peanut",
    substanceRef: null,
    medicationClass: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "en",
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// Loading — every turn, no cache, no memory
// ---------------------------------------------------------------------------

function fakeDb(outcome: {
  rows?: Record<string, unknown>[] | null;
  error?: unknown;
  throws?: boolean;
}) {
  const calls: Array<{ table: string; userId: string }> = [];
  const db = {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            // deno-lint-ignore require-await
            async eq(_column: string, value: string) {
              calls.push({ table, userId: value });
              if (outcome.throws) throw new Error("connection reset");
              return {
                data: (outcome.rows ?? null) as never,
                error: outcome.error ?? null,
              };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

const ROW = {
  id: "c9",
  user_id: "u1",
  kind: "allergy",
  allergen_ref: "peanut",
  substance_ref: null,
  medication_class: null,
  severity: "medical",
  declared_by: "student",
  notes: "anaphylaxis",
  content_locale: "en",
};

Deno.test("loadStudentSafetyConstraints — reads the constraints table, mapped", async () => {
  const { db, calls } = fakeDb({ rows: [ROW] });
  const rows = await loadStudentSafetyConstraints(db, "u1");
  assertEquals(calls, [{ table: "student_safety_constraints", userId: "u1" }]);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].allergenRef, "peanut");
  assertEquals(rows[0].severity, "medical");
});

Deno.test("loadStudentSafetyConstraints — NO cache: every turn hits the table", async () => {
  // The whole point of this module: an allergy declared at 14:02 protects at
  // 14:03. A memoized loader would reintroduce exactly the staleness the
  // memory path has.
  const { db, calls } = fakeDb({ rows: [ROW] });
  await loadStudentSafetyConstraints(db, "u1");
  await loadStudentSafetyConstraints(db, "u1");
  await loadStudentSafetyConstraints(db, "u1");
  assertEquals(calls.length, 3);
});

Deno.test("loadStudentSafetyConstraints — a query error THROWS, never 'no allergies'", async () => {
  await assertRejects(
    () => loadStudentSafetyConstraints(fakeDb({ error: { message: "boom" } }).db, "u1"),
    SafetyConstraintsLoadError,
  );
  await assertRejects(
    () => loadStudentSafetyConstraints(fakeDb({ throws: true }).db, "u1"),
    SafetyConstraintsLoadError,
  );
  await assertRejects(
    () => loadStudentSafetyConstraints(fakeDb({ rows: [] }).db, ""),
    SafetyConstraintsLoadError,
  );
});

Deno.test("loadStudentSafetyConstraints — an empty set is a legitimate answer", async () => {
  const rows = await loadStudentSafetyConstraints(fakeDb({ rows: [] }).db, "u1");
  assertEquals(rows, []);
});

Deno.test("safety constraints are loaded OUTSIDE the LLM memory path", async () => {
  // Structural, not aspirational: this module must not reach the memorizer,
  // the embedding runtime, or anything that produces 'candidate' items.
  const source = await Deno.readTextFile(
    new URL("./safety_constraints.ts", import.meta.url),
  );
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  assertEquals(imports, [], "this module must have zero imports");
  for (const forbidden of ["memory", "memorizer", "embedding", "pgvector"]) {
    assertEquals(
      source.toLowerCase().includes(`/${forbidden}`),
      false,
      `must not reference the ${forbidden} path`,
    );
  }
});

// ---------------------------------------------------------------------------
// Deterministic medical validator
// ---------------------------------------------------------------------------

Deno.test("medicalConstraintTokens — only severity='medical', identifiers only", () => {
  const tokens = medicalConstraintTokens([
    constraint({ id: "a", allergenRef: "peanut" }),
    constraint({ id: "b", allergenRef: "shellfish", severity: "strict" }),
    constraint({
      id: "c",
      allergenRef: null,
      substanceRef: "st_johns_wort",
      medicationClass: "ssri",
      notes: "gluten is fine actually",
    }),
  ]);
  assertEquals(tokens.sort(), ["peanut", "ssri", "st_johns_wort"]);
});

Deno.test("assertNoMedicalConstraintViolation — rejects a medical token", () => {
  const error = assertThrows(
    () =>
      assertNoMedicalConstraintViolation(
        "Add a spoon of peanut butter to your morning oats.",
        [constraint()],
      ),
    MedicalConstraintViolationError,
  ) as MedicalConstraintViolationError;
  assertEquals(error.violations.length, 1);
  assertEquals(error.violations[0].token, "peanut");
  assertEquals(error.violations[0].constraintId, "c1");
});

Deno.test("assertNoMedicalConstraintViolation — non-medical severities pass through", () => {
  assertNoMedicalConstraintViolation("Some peanut butter.", [
    constraint({ severity: "strict" }),
    constraint({ severity: "preference" }),
  ]);
});

Deno.test("validator — slug shapes: multiword, plural, hyphen, accents", () => {
  const c = constraint({ allergenRef: "tree_nut" });
  for (const text of ["tree nuts on top", "a TREE-NUT crumble", "tree_nut mix"]) {
    assertEquals(findMedicalConstraintViolations(text, [c]).length, 1, text);
  }
  const substance = constraint({
    allergenRef: null,
    substanceRef: "vitamin_d3",
  });
  assertEquals(
    findMedicalConstraintViolations("take vitamin d3 at breakfast", [substance])
      .length,
    1,
  );
  // Diacritics in the generated text do not hide a token.
  const proteine = constraint({ allergenRef: "proteine" });
  assertEquals(
    findMedicalConstraintViolations("ajoute de la proteine", [proteine]).length,
    1,
  );
});

Deno.test("validator — does not match inside an unrelated word", () => {
  const c = constraint({ allergenRef: "soy" });
  assertEquals(findMedicalConstraintViolations("soylent green", [c]).length, 0);
  assertEquals(findMedicalConstraintViolations("add soy sauce", [c]).length, 1);
});

Deno.test("validator — negated mentions are safe (the coeliac plan case)", () => {
  const gluten = constraint({ allergenRef: "gluten", kind: "medical" });
  const safe = [
    "gluten-free bread at breakfast",
    "choose a gluten free option",
    "no gluten this week",
    "without gluten",
    "avoid gluten entirely",
    "sans gluten",
    "pas de gluten ce soir",
    "you have a gluten allergy, so we skip it",
    "instead of gluten, use rice",
  ];
  for (const text of safe) {
    assertEquals(findMedicalConstraintViolations(text, [gluten]), [], text);
  }
  const unsafe = [
    "add gluten to the mix",
    "a slice of gluten bread",
    "try seitan, it is pure gluten",
  ];
  for (const text of unsafe) {
    assertEquals(
      findMedicalConstraintViolations(text, [gluten]).length > 0,
      true,
      text,
    );
  }
});

Deno.test("validator — audit mode: allowNegatedMentions=false rejects everything", () => {
  const gluten = constraint({ allergenRef: "gluten" });
  assertEquals(
    findMedicalConstraintViolations("gluten-free bread", [gluten], {
      allowNegatedMentions: false,
    }).length,
    1,
  );
});

Deno.test("validator — empty text and empty constraints are no-ops", () => {
  assertEquals(findMedicalConstraintViolations("", [constraint()]), []);
  assertEquals(findMedicalConstraintViolations("anything", []), []);
});

Deno.test("validator — reports every occurrence, from every constraint", () => {
  const violations = findMedicalConstraintViolations(
    "peanut sauce, then more peanut, plus shellfish",
    [
      constraint({ id: "a", allergenRef: "peanut" }),
      constraint({ id: "b", allergenRef: "shellfish" }),
    ],
  );
  assertEquals(violations.length, 3);
  assertEquals(violations.map((v) => v.constraintId).sort(), ["a", "a", "b"]);
});
