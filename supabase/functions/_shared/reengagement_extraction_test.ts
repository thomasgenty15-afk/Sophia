import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildReengagementExtractionPrompt,
  formatReengagementTranscript,
  parseReengagementExtractionOutput,
} from "./reengagement_extraction.ts";

Deno.test("extraction parse accepts a clean payload", () => {
  const result = parseReengagementExtractionOutput(JSON.stringify({
    reason_category: "action_fit",
    reason_confidence: "high",
    reason_user_words: "« les actions me saoulent »",
    episode_summary: "Il a décroché parce que les actions ne lui parlaient plus.",
    solution_accepted: true,
  }));
  assertEquals(result.reason_category, "action_fit");
  assertEquals(result.reason_confidence, "high");
  assertEquals(result.solution_accepted, true);
});

Deno.test("extraction parse strips markdown fences", () => {
  const result = parseReengagementExtractionOutput(
    '```json\n{"reason_category": "time", "reason_confidence": "medium"}\n```',
  );
  assertEquals(result.reason_category, "time");
  assertEquals(result.reason_confidence, "medium");
});

Deno.test("extraction parse default-denies unknown categories to other/low", () => {
  const result = parseReengagementExtractionOutput(JSON.stringify({
    reason_category: "burnout_profond",
    reason_confidence: "high",
  }));
  assertEquals(result.reason_category, "other");
  assertEquals(result.reason_confidence, "low");
});

Deno.test("extraction parse survives invalid JSON and junk types", () => {
  assertEquals(
    parseReengagementExtractionOutput("pas du json").reason_category,
    "other",
  );
  const junk = parseReengagementExtractionOutput(JSON.stringify({
    reason_category: 42,
    reason_confidence: ["high"],
    reason_user_words: { nope: true },
    solution_accepted: "oui",
  }));
  assertEquals(junk.reason_category, "other");
  assertEquals(junk.reason_confidence, "low");
  assertEquals(junk.solution_accepted, null);
});

Deno.test("extraction parse extracts embedded JSON from prose", () => {
  const result = parseReengagementExtractionOutput(
    'Voici mon analyse : {"reason_category": "emotion", "reason_confidence": "medium", "solution_accepted": false} — bonne journée.',
  );
  assertEquals(result.reason_category, "emotion");
  assertEquals(result.solution_accepted, false);
});

Deno.test("transcript formatting labels speakers and bounds size", () => {
  const turns = Array.from({ length: 50 }, (_, index) => ({
    role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `message ${index}`,
    created_at: new Date(1700000000000 + index * 1000).toISOString(),
  }));
  const formatted = formatReengagementTranscript(turns, 10);
  assertEquals(formatted.split("\n").length, 10);
  assertStringIncludes(formatted, "USER: message 48");
  assertStringIncludes(formatted, "SOPHIA: message 49");
  assertEquals(formatted.includes("message 39"), false);
});

Deno.test("extraction prompt carries the taxonomy and the system facts", () => {
  const { system, user } = buildReengagementExtractionPrompt({
    transcript: "USER: désolé, grosse semaine\nSOPHIA: aucun souci",
    facts: {
      days_inactive_at_open: 3,
      replied_at_step: 2,
      exit_status: "reengaged",
      solution_offered: "adjust_plan",
    },
  });
  assertStringIncludes(system, "action_fit");
  assertStringIncludes(system, "reason_confidence");
  assertStringIncludes(user, "A répondu à la relance n° : 2");
  assertStringIncludes(user, "adjust_plan");
  assertStringIncludes(user, "grosse semaine");
});
