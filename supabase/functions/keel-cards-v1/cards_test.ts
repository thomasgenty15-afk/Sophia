import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  assertBodyTemplateIsRenderable,
  bodySlots,
  type CardVariable,
  normalizeCardKeyword,
  parseCardKind,
  parseCardTemplate,
  parseCardVariables,
  RENDER_PARITY_CASES,
  renderCard,
} from "./cards.ts";

/**
 * KEEL W8 — card renderer tests.
 *
 * The suite is organised around ONE question: can a card ever display text that
 * the human did not type? Every case below is an answer to that question, and
 * the negative cases outnumber the happy paths on purpose.
 */

// ---------------------------------------------------------------------------
// The parity fixture. This is the important one: the same cases are asserted
// against the SQL renderer in supabase/tests/keel/card_render.sql, so a drift
// between the two implementations turns a suite red instead of silently
// producing two different cards for the same student.
// ---------------------------------------------------------------------------

Deno.test("renderCard matches the shared parity fixture", () => {
  for (const testCase of RENDER_PARITY_CASES) {
    assertEquals(
      renderCard(
        { body_template: testCase.body_template, variables: testCase.variables },
        testCase.values,
      ),
      testCase.expected,
      `parity case ${testCase.name}`,
    );
  }
});

Deno.test("renderCard is deterministic: same inputs, same output, always", () => {
  const testCase = RENDER_PARITY_CASES[0];
  const first = renderCard(testCase, testCase.values);
  for (let i = 0; i < 20; i++) {
    assertEquals(renderCard(testCase, testCase.values), first);
  }
});

Deno.test("renderCard does not depend on variable declaration order", () => {
  const testCase = RENDER_PARITY_CASES[0];
  const reversed = {
    body_template: testCase.body_template,
    variables: [...testCase.variables].reverse(),
  };
  assertEquals(renderCard(reversed, testCase.values), testCase.expected);
});

// ---------------------------------------------------------------------------
// The rules that stop a card from lying
// ---------------------------------------------------------------------------

const SIMPLE: { body_template: string; variables: CardVariable[] } = {
  body_template: "I order {{dish}} at {{place}}.",
  variables: [
    { key: "dish", label: "Dish", type: "text" },
    { key: "place", label: "Place", type: "text" },
  ],
};

Deno.test("a missing value throws instead of leaving a hole", () => {
  assertThrows(
    () => renderCard(SIMPLE, { dish: "salmon" }),
    Error,
    'missing value for variable "place"',
  );
});

Deno.test("a blank value throws instead of rendering a gap", () => {
  assertThrows(
    () => renderCard(SIMPLE, { dish: "salmon", place: "   " }),
    Error,
    'empty value for variable "place"',
  );
});

Deno.test("an undeclared key throws instead of being silently dropped", () => {
  assertThrows(
    () => renderCard(SIMPLE, { dish: "salmon", place: "home", extra: "x" }),
    Error,
    'undeclared variable key "extra"',
  );
});

Deno.test("a choice value outside its options throws", () => {
  const template = {
    body_template: "Signal: {{signal}}",
    variables: [{
      key: "signal",
      label: "Signal",
      type: "choice" as const,
      options: [
        { value: "menu_arrives", label: "the menu arrives" },
        { value: "first_drink", label: "the first drink is served" },
      ],
    }],
  };
  assertEquals(
    renderCard(template, { signal: "first_drink" }),
    "Signal: the first drink is served",
  );
  assertThrows(
    () => renderCard(template, { signal: "dessert" }),
    Error,
    'not an option of variable "signal"',
  );
});

Deno.test("a choice stores the token and renders the label (R1)", () => {
  const template = {
    body_template: "{{tone}}",
    variables: [{
      key: "tone",
      label: "Tone",
      type: "choice" as const,
      options: [
        { value: "calm", label: "calmly" },
        { value: "sharp", label: "sharply" },
      ],
    }],
  };
  // The stored value is an ASCII token; only the prose is translated at render.
  assertEquals(renderCard(template, { tone: "calm" }), "calmly");
});

Deno.test("a value carrying template markers throws (order-independence)", () => {
  // Without this rule the substitution order would decide the output, and
  // "deterministic" would silently depend on how the coach ordered variables.
  assertThrows(
    () => renderCard(SIMPLE, { dish: "{{place}}", place: "home" }),
    Error,
    "contains template markers",
  );
});

Deno.test("no LLM, no clock, no network: the renderer is a pure function", async () => {
  const source = await Deno.readTextFile(new URL("./cards.ts", import.meta.url));
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of ["fetch(", "Date.now", "new Date", "generateWith", "Math.random"]) {
    assert(
      !code.includes(forbidden),
      `cards.ts must not contain ${forbidden} — the write path is deterministic (W8.3)`,
    );
  }
});

// ---------------------------------------------------------------------------
// Template-level invariants (mirrors of the SQL CHECKs)
// ---------------------------------------------------------------------------

Deno.test("bodySlots lists each slot once, in order", () => {
  assertEquals(bodySlots("{{a}} {{b}} {{a}} {{c}}"), ["a", "b", "c"]);
});

Deno.test("a body referencing an undeclared variable is refused", () => {
  assertThrows(
    () =>
      assertBodyTemplateIsRenderable("hello {{nope}}", [
        { key: "x", label: "X", type: "text" },
      ]),
    Error,
    'undeclared variable "nope"',
  );
});

Deno.test("a stray marker is refused", () => {
  assertThrows(
    () =>
      assertBodyTemplateIsRenderable("hello {{ x }} {{x}}", [
        { key: "x", label: "X", type: "text" },
      ]),
    Error,
    "malformed slot marker",
  );
});

Deno.test("parseCardVariables enforces the descriptor contract", () => {
  assertThrows(() => parseCardVariables([]), Error, "1..8 variables");
  assertThrows(
    () => parseCardVariables([{ key: "Bad Key", label: "l", type: "text" }]),
    Error,
    "invalid key",
  );
  assertThrows(
    () =>
      parseCardVariables([
        { key: "a", label: "l", type: "text" },
        { key: "a", label: "l2", type: "text" },
      ]),
    Error,
    "duplicate variable key",
  );
  assertThrows(
    () => parseCardVariables([{ key: "a", label: "l", type: "dropdown" }]),
    Error,
    "unknown variable type",
  );
  assertThrows(
    () =>
      parseCardVariables([
        { key: "a", label: "l", type: "choice", options: [{ value: "x", label: "X" }] },
      ]),
    Error,
    "at least 2 options",
  );
  assertThrows(
    () =>
      parseCardVariables([
        { key: "a", label: "l", type: "text", options: [{ value: "x", label: "X" }] },
      ]),
    Error,
    "carries options",
  );
});

Deno.test("parseCardKind throws on an unknown token (R7)", () => {
  assertEquals(parseCardKind("attack"), "attack");
  assertThrows(() => parseCardKind("shield"), Error, "unknown card_kind");
});

Deno.test("parseCardTemplate rejects an out-of-range arming lead", () => {
  const base = {
    id: "id",
    owner_scope: "global",
    coach_id: null,
    template_key: "t",
    card_kind: "defense",
    trigger_contexts: [],
    trigger_time_bucket: "any",
    title: "t",
    purpose: "p",
    produces: "pr",
    usage: "u",
    body_template: "hi {{x}}",
    variables: [{ key: "x", label: "X", type: "text" }],
    content_locale: "en",
  };
  assertThrows(
    () => parseCardTemplate({ ...base, arm_lead_minutes: 0 }),
    Error,
    "arm_lead_minutes out of range",
  );
  assertThrows(
    () => parseCardTemplate({ ...base, arm_lead_minutes: 5000 }),
    Error,
    "arm_lead_minutes out of range",
  );
  assertEquals(
    parseCardTemplate({ ...base, arm_lead_minutes: 180 }).arm_lead_minutes,
    180,
  );
});

// ---------------------------------------------------------------------------
// The switch word
// ---------------------------------------------------------------------------

Deno.test("normalizeCardKeyword lowercases, trims, and refuses the rest", () => {
  assertEquals(normalizeCardKeyword("  Anchor  "), "anchor");
  assertEquals(normalizeCardKeyword(""), null);
  assertEquals(normalizeCardKeyword(null), null);
  assertThrows(() => normalizeCardKeyword("two words"), Error, "invalid keyword");
  assertThrows(() => normalizeCardKeyword("a"), Error, "invalid keyword");
  assertThrows(() => normalizeCardKeyword("x".repeat(33)), Error, "invalid keyword");
});
