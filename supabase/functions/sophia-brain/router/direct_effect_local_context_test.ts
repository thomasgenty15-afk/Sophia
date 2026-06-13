import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "./direct_effect_local_context.ts";

Deno.test("direct effect local context requires reminder intent beyond duration", () => {
  const context = withDirectEffectLocalContext({});
  assertEquals(
    context.direct_effect_tool_policy.create_one_shot_reminder.includes(
      "A duration/time is not enough",
    ),
    true,
  );
  assertEquals(
    context.direct_effect_tool_policy.create_one_shot_reminder.includes(
      "talk for two minutes",
    ),
    true,
  );

  const prompt = directEffectLocalDispatcherPromptLines().join("\n");
  assertEquals(prompt.includes("Une duree/heure seule ne suffit pas"), true);
  assertEquals(prompt.includes("pas le rythme de la conversation"), true);
});
