import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";

Deno.test("dispatcher prompt keeps product_help notes from recommending attack card for Plan refinement", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Priorites de decision:"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Frontieres critiques:"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Rédaction des note_information vers product_help:",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("ne recommande pas Carte d'attaque"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Sans toucher au reste du Plan"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Regle stricte product_help/Plan:",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "N'ecris jamais Attack Card, Carte d'attaque ou prepare_attack_card",
    ),
    true,
  );
});

Deno.test("dispatcher prompt requires reminder intent beyond duration or time", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Une duree, une heure ou un delai ne suffit jamais",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("parler deux minutes"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("direct_effects doit rester vide"),
    true,
  );
});

Deno.test("dispatcher prompt requires two card intents for attack defense creation ambiguity", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Ne compresse pas ce cas en un seul intent target_ambiguous",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "prepare_attack_card et prepare_defense_card",
    ),
    true,
  );
});

Deno.test("dispatcher prompt examples keep Plan refinement product_help focused on plan.adjustment", () => {
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: unknown[];
        tool_skill_intents?: Array<{ operation_type?: string }>;
        flow_opportunity?: unknown;
        skill_signals?: {
          entry?: Record<string, { detected?: boolean }>;
        };
        note_information?: {
          target_dispatcher?: string;
          structured_context?: {
            product_feature_id?: string;
            related_tool_flow?: string;
            recommended_next_focus?: string;
          };
        };
      };
    }>;
  };

  const example = parsed.critical_routing_examples.find((candidate) =>
    candidate.user_message.includes("sans toucher au reste du Plan") &&
    candidate.user_message.includes("ranger mes papiers")
  );
  if (!example) {
    throw new Error("few-shot product_help plan.adjustment manquant");
  }

  assertEquals(example.expected.direct_effects?.length ?? 0, 0);
  assertEquals(example.expected.tool_skill_intents?.length ?? 0, 0);
  assertEquals(example.expected.flow_opportunity, null);
  assertEquals(
    example.expected.skill_signals?.entry?.product_help?.detected,
    true,
  );
  assertEquals(
    example.expected.note_information?.target_dispatcher,
    "product_help",
  );
  assertEquals(
    example.expected.note_information?.structured_context?.product_feature_id,
    "plan.adjustment",
  );
  assertEquals(
    example.expected.note_information?.structured_context?.related_tool_flow,
    "adjust_plan_item",
  );

  const recommendedNextFocus =
    example.expected.note_information?.structured_context
      ?.recommended_next_focus ?? "";
  assertEquals(recommendedNextFocus.includes("Ajustement du plan"), true);
  assertEquals(recommendedNextFocus.includes("attack"), false);
  assertEquals(recommendedNextFocus.includes("attaque"), false);
  assertEquals(recommendedNextFocus.includes("prepare_attack_card"), false);
});

Deno.test("dispatcher prompt examples keep natural attack defense card ambiguity as two tool intents", () => {
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: unknown[];
        tool_skill_intents?: Array<{
          operation_type?: string;
          ambiguity?: string;
          user_intent?: string;
          operation_input?: Record<string, unknown>;
        }>;
        skill_signals?: {
          entry?: Record<string, { detected?: boolean }>;
        };
      };
    }>;
  };

  const example = parsed.critical_routing_examples.find((candidate) =>
    candidate.user_message.includes("sortir du lit") &&
    candidate.user_message.includes("téléphone au réveil")
  );
  if (!example) {
    throw new Error("few-shot ambiguite carte attaque/defense manquant");
  }

  assertEquals(example.expected.direct_effects?.length ?? 0, 0);
  assertEquals(
    example.expected.tool_skill_intents?.map((intent) =>
      intent.operation_type
    ),
    ["prepare_attack_card", "prepare_defense_card"],
  );
  assertEquals(
    example.expected.tool_skill_intents?.every((intent) =>
      intent.ambiguity === "target_ambiguous" &&
      intent.user_intent === "create" &&
      Boolean(intent.operation_input)
    ),
    true,
  );
});
