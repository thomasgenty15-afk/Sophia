import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("run_ts_does_not_add_inline_business_success_blocks", async () => {
  const runText = await Deno.readTextFile(new URL("./run.ts", import.meta.url));
  const knownLegacy = [{
    name: "short technical fallback content strings",
    reason:
      "run.ts still has orchestration fallbacks, but durable success copy belongs in operation/sflow renderers.",
    removal_criteria:
      "Operation runtimes own durable success/failure user-facing text.",
  }];
  assertEquals(
    knownLegacy.every((item) => item.reason && item.removal_criteria),
    true,
  );

  const suspicious = [...runText.matchAll(/content\s*:\s*["'`](.*?)["'`]/gs)]
    .map((match) => match[1])
    .filter((content) =>
      /\b(carte créée|rappel programmé|préférence enregistrée|potion activée|plan ajusté)\b/i
        .test(content)
    );
  assertEquals(suspicious, []);
});

// W2.D-2 — both `router/turn_intent_arbitrator.ts` and
// `tools/operations/_shared/recommendation_renderer.ts` were deleted on 2026-06-30 (commit
// 3de0b9a2, −547 lines) and these two guards were never updated: they had been failing with
// NotFound ever since, which is documented doc drift, not a code defect.
//
// A guard whose subject no longer exists cannot assert anything about that subject. Both are
// therefore INVERTED, following the pattern W2 used on `ultimate.int.test.ts`: they now prove
// the modules stay deleted and that the copy they owned did not migrate back into `run.ts`.
// If either file is ever re-created, these tests go red and force whoever re-creates it to
// restore the original architectural assertions (kept below in the comments).
//
// Original assertions on turn_intent_arbitrator.ts, for restoration:
//   /\b(reply|content|ack)\s*:\s*[`"']/  → false
//   /\bconfirmation_message\s*:/          → false
//   /\bexecution_message\s*:/             → false
async function exists(url: URL): Promise<boolean> {
  try {
    await Deno.stat(url);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

Deno.test("turn_intent_arbitrator stays deleted (its visible-reply guard has no subject)", async () => {
  assertEquals(
    await exists(new URL("./turn_intent_arbitrator.ts", import.meta.url)),
    false,
  );
});

Deno.test("migrated_tool_recommendation_copy_is_owned_outside_run_ts", async () => {
  const runText = await Deno.readTextFile(new URL("./run.ts", import.meta.url));
  // The invariant that still has a subject: run.ts must not author this copy.
  assertEquals(runText.includes("Tu veux qu'on l'utilise pour alléger"), false);
  // The renderer that used to own it was deleted with the feature; the copy exists nowhere
  // in the repo today. Asserting the file is still gone keeps the pair consistent.
  assertEquals(
    await exists(
      new URL(
        "../tools/operations/_shared/recommendation_renderer.ts",
        import.meta.url,
      ),
    ),
    false,
  );
});
