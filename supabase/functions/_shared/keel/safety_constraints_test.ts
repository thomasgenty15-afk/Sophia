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
  //
  // This assertion used to be "zero imports", which was the correct enforcement
  // while the module had no dependencies. It now has exactly one -- the shared
  // token matcher, extracted so that the coach-doctrine lock could not become a
  // second, divergent copy of these matching rules (see forbidden_matcher.ts).
  //
  // "Zero imports" is therefore replaced by the invariant it was standing in
  // for, checked TRANSITIVELY: every module reachable from this one is on a
  // closed allowlist, is itself import-free, and none of them names the memory
  // path. That is strictly stronger than the original -- the original only ever
  // looked at one file, and would have said nothing about what a dependency
  // dragged in.
  const ALLOWED_DEPS = ["./forbidden_matcher.ts"];

  const readImports = async (file: string): Promise<[string, string[]]> => {
    const source = await Deno.readTextFile(new URL(file, import.meta.url));
    return [source, [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])];
  };

  const [rootSource, rootImports] = await readImports("./safety_constraints.ts");
  assertEquals(
    rootImports,
    ALLOWED_DEPS,
    "this module may only import the shared token matcher",
  );

  const sources: Array<[string, string]> = [["safety_constraints.ts", rootSource]];
  for (const dep of ALLOWED_DEPS) {
    const [depSource, depImports] = await readImports(dep);
    assertEquals(depImports, [], `${dep} must itself have zero imports`);
    sources.push([dep, depSource]);
  }

  for (const [name, source] of sources) {
    for (const forbidden of ["memory", "memorizer", "embedding", "pgvector"]) {
      assertEquals(
        source.toLowerCase().includes(`/${forbidden}`),
        false,
        `${name} must not reference the ${forbidden} path`,
      );
    }
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

Deno.test("validator — French determiners after a negation are safe (regression)", () => {
  // FOUND WHILE BUILDING THE COACH-DOCTRINE LOCK, and it was live here first.
  // The shared negation list stopped at `de`/`du`/`des`/`d'`, so the commonest
  // French determiners were missing and these sentences were all REJECTED:
  // a validator that rejects "évite les cacahuètes" is a validator that gets
  // switched off. Fixed once in forbidden_matcher.ts, which is why the fix
  // reaches this lock without anyone porting it.
  for (const safe of [
    "Évite les cacahuètes dans ce plat.",
    "Supprime le beurre de cacahuète du petit-déjeuner.",
    "On ne met jamais la cacahuète dans cette recette.",
    "Remplace les cacahuètes par des graines de courge.",
    "Avoid your peanut butter here.",
  ]) {
    assertEquals(
      findMedicalConstraintViolations(safe, [constraint()]).length,
      0,
      safe,
    );
  }

  // And the endorsement is still caught — the fix widened the negation list,
  // it did not open the gate.
  assertEquals(
    findMedicalConstraintViolations(
      "Ajoute des cacahuètes sur ton yaourt.",
      [constraint({ allergenRef: "cacahuete" })],
    ).length,
    1,
  );
});
