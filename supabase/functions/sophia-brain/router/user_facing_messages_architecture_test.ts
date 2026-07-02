import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/g, ""))
    .join("\n");
}

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

Deno.test("turn_intent_arbitrator_has_no_authored_visible_replies", async () => {
  const source = stripComments(
    await Deno.readTextFile(
      new URL("./turn_intent_arbitrator.ts", import.meta.url),
    ),
  );
  assertEquals(/\b(reply|content|ack)\s*:\s*[`"']/.test(source), false);
  assertEquals(/\bconfirmation_message\s*:/.test(source), false);
  assertEquals(/\bexecution_message\s*:/.test(source), false);
});

Deno.test("migrated_tool_recommendation_copy_is_owned_outside_run_ts", async () => {
  const runText = await Deno.readTextFile(new URL("./run.ts", import.meta.url));
  const rendererText = await Deno.readTextFile(
    new URL(
      "../tools/operations/_shared/recommendation_renderer.ts",
      import.meta.url,
    ),
  );
  assertEquals(runText.includes("Tu veux qu'on l'utilise pour alléger"), false);
  assertEquals(
    rendererText.includes("Tu veux qu'on l'utilise pour alléger"),
    true,
  );
});
