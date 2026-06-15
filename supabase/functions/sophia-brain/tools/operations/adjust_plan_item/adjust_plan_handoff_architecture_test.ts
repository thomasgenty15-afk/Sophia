import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildAdjustPlanHandoffDraft } from "./handoff.ts";

Deno.test("adjust_plan handoff draft contract is no-mutation and not executable from chat", () => {
  const handoff = buildAdjustPlanHandoffDraft({
    fallbackSummary: "Alléger le plan cette semaine.",
  });

  assertEquals(handoff.operation_type, "adjust_plan_item");
  assertEquals(handoff.mode, "platform_handoff");
  assertEquals(handoff.executable_from_chat, true);
  assertEquals(handoff.executable_from_chat, false);
  assertEquals((handoff as any).scope, undefined);
  assertEquals((handoff as any).patch, undefined);
  assertStringIncludes(handoff.destination.instruction, "Plan");
});

Deno.test("adjust_plan local runtime has no legacy generator or renderer", async () => {
  const dir = new URL("./", import.meta.url);
  await Deno.stat(new URL("generator.ts", dir)).then(
    () => {
      throw new Error("adjust_plan_generator_legacy_should_not_exist");
    },
    () => undefined,
  );
  await Deno.stat(new URL("renderer.ts", dir)).then(
    () => {
      throw new Error("adjust_plan_renderer_legacy_should_not_exist");
    },
    () => undefined,
  );
});
