import { normalizePendingResolutionSignal } from "./pending_resolution.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`Assertion failed.\nExpected: ${e}\nActual:   ${a}`);
  }
}

Deno.test("normalizePendingResolutionSignal: accepts checkup_entry decision", () => {
  const got = normalizePendingResolutionSignal({
    status: "resolved",
    pending_type: "checkup_entry",
    decision_code: "checkup.accept",
    confidence: 0.91,
  });
  assertEquals(got?.pending_type, "checkup_entry");
  assertEquals(got?.decision_code, "checkup.accept");
});

Deno.test("normalizePendingResolutionSignal: accepts resume_prompt decision", () => {
  const got = normalizePendingResolutionSignal({
    status: "resolved",
    pending_type: "resume_prompt",
    decision_code: "resume.decline",
    confidence: 0.83,
  });
  assertEquals(got?.pending_type, "resume_prompt");
  assertEquals(got?.decision_code, "resume.decline");
});

Deno.test("normalizePendingResolutionSignal: rejects mismatched decision/pending_type", () => {
  const got = normalizePendingResolutionSignal({
    status: "resolved",
    pending_type: "checkup_entry",
    decision_code: "dual.confirm_both",
    confidence: 0.95,
  });
  assertEquals(got, undefined);
});
