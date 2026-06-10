import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_PROMPT_VERSION,
} from "./dispatcher.prompts.ts";

Deno.test("dispatcher prompt includes status_recap factual-state entry examples", () => {
  assertEquals(
    DISPATCHER_V2_PROMPT_VERSION,
    "dispatcher_v2_prompt_2026_06_s29_status_recap_entry",
  );

  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message: string;
      expected: {
        skill_signals_entry?: Record<string, { detected: boolean }>;
      };
    }>;
  };

  const pointFactuel = parsed.critical_routing_examples.find((example) =>
    example.user_message.includes("point factuel") &&
    example.user_message.includes("existe vraiment")
  );
  const sources = parsed.critical_routing_examples.find((example) =>
    example.user_message.includes("sources de ce point factuel")
  );

  assertEquals(
    pointFactuel?.expected.skill_signals_entry?.status_recap?.detected,
    true,
  );
  assertEquals(
    sources?.expected.skill_signals_entry?.status_recap?.detected,
    true,
  );
});
