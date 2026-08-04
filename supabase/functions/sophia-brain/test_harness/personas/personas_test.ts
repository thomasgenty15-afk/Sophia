import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  PERSONA_IDS,
  PERSONAS,
  RISK_CLASSES,
  adversarialStudents,
  personaById,
  personasByRole,
} from "./personas.ts";
import { RESTRICTION_TRIGGER_CODES } from "../../../_shared/keel/restriction_guard.ts";
import { allGoldenCases } from "../golden_scenarios/scenarios.ts";

Deno.test("personas: the W11 composition — 2 coaches, 4 students, 3 of them adversarial", () => {
  assertEquals(PERSONAS.length, 6);
  assertEquals(personasByRole("coach").length, 2);
  assertEquals(personasByRole("student").length, 4);
  assertEquals(adversarialStudents().length, 3);
  assertEquals(
    adversarialStudents().map((p) => p.risk_class).sort(),
    ["binge_purge", "orthorexia", "restriction"],
  );
});

Deno.test("personas: ids are unique, snake_case ASCII (R1), and content is en-US", () => {
  assertEquals(new Set(PERSONA_IDS).size, PERSONA_IDS.length);
  for (const persona of PERSONAS) {
    assertEquals(
      /^[a-z][a-z0-9_]*$/.test(persona.persona_id),
      true,
      `persona_id not snake_case ASCII: ${persona.persona_id}`,
    );
    assertEquals(persona.content_locale, "en-US");
    // The whole point of the W11 lot: personas are English. A French sentence
    // slipping back in is the regression that made the old harness useless for
    // a US pilot.
    for (const sentence of [...persona.pressure_vectors, ...persona.must_never, persona.brief]) {
      assertEquals(
        /[àâçéèêëîïôùûüÿœæ]/i.test(sentence),
        false,
        `non-English content in ${persona.persona_id}: ${sentence}`,
      );
    }
  }
});

Deno.test("personas: every risk class in the vocabulary is used by someone", () => {
  const used = new Set(PERSONAS.map((p) => p.risk_class));
  for (const risk of RISK_CLASSES) {
    assertEquals(used.has(risk), true, `risk_class "${risk}" has no persona`);
  }
});

Deno.test("personas: every adversarial student carries pressure vectors and prohibitions", () => {
  for (const persona of adversarialStudents()) {
    assertEquals(
      persona.pressure_vectors.length >= 5,
      true,
      `${persona.persona_id} needs at least 5 pressure vectors, has ${persona.pressure_vectors.length}`,
    );
    assertEquals(persona.must_never.length >= 4, true, persona.persona_id);
  }
});

Deno.test("personas: declared restriction triggers exist in the deterministic guard (R7)", () => {
  const known = new Set<string>(RESTRICTION_TRIGGER_CODES);
  for (const persona of PERSONAS) {
    for (const code of persona.expected_restriction_triggers) {
      assertEquals(
        known.has(code),
        true,
        `${persona.persona_id} expects trigger "${code}" which restriction_guard.ts does not define`,
      );
    }
  }
});

/**
 * The orthorexic persona is the one the deterministic floor cannot see: stable
 * weight, perfect coverage, high adherence. Pinning "zero expected triggers"
 * keeps that limitation VISIBLE. If a future guard learns to see her, this test
 * goes red and someone comes back to write down what changed — which is the
 * point.
 */
Deno.test("personas: orthorexia is invisible to the deterministic guard, on the record", () => {
  const priya = personaById("student_orthorexic_raghunathan");
  assertEquals(priya.expected_restriction_triggers.length, 0);
  assertStringIncludes(priya.brief, "invisible to");
});

Deno.test("personas: R7 — an unknown persona id throws instead of returning undefined", () => {
  assertThrows(() => personaById("student_nobody"), Error, "unknown persona_id");
});

Deno.test("personas: every persona is exercised by at least one golden case", () => {
  const used = new Set(allGoldenCases().map((c) => c.persona_id));
  const studentsAndCoaches = PERSONAS.map((p) => p.persona_id);
  const unused = studentsAndCoaches.filter((id) => !used.has(id));
  assertEquals(
    unused,
    [],
    `personas with no golden case: ${unused.join(", ")} — an unexercised persona is documentation`,
  );
});

Deno.test("personas: every persona_id used by a golden case resolves", () => {
  for (const c of allGoldenCases()) personaById(c.persona_id);
});
