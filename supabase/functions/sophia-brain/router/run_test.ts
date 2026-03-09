import { deterministicStaleBilanDecision } from "./run.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("deterministicStaleBilanDecision: resumes stale bilan on explicit resume", () => {
  assertEquals(deterministicStaleBilanDecision("ok on reprend"), "resume_bilan");
});

Deno.test("deterministicStaleBilanDecision: stops for today on defer language", () => {
  assertEquals(deterministicStaleBilanDecision("pas maintenant, on voit demain"), "stop_for_today");
});

Deno.test("deterministicStaleBilanDecision: leaves unrelated topic unresolved for fallback", () => {
  assertEquals(deterministicStaleBilanDecision("au fait j'ai une question sur mon plan"), null);
});
