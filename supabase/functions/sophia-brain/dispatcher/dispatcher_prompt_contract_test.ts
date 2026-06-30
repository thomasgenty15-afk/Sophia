import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";

Deno.test("dispatcher prompt contract is minimal V1", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Contrat effectif unique"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("skill_signals.product_help"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Daily/weekly ne sont pas routes"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "ancien champ de scoring est toujours present",
    ),
    false,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("opportunite de flow signale"),
    false,
  );
});

Deno.test("dispatcher prompt separates product help from coaching recommendation", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "product_help repond aux questions produit",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "coaching_recommendation n'est pas un clarificateur generique",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "follow-up immediat d'une explication/comparaison produit",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "blocage personnel identifiable",
    ),
    true,
  );
});

Deno.test("dispatcher prompt defines feature opportunity entry signals", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Axes coach_preferences supportes: coach.tone",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "des qu'il y a une frustration sur le style de Sophia",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "un soutien recurrent, un message regulier",
    ),
    true,
  );

  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      user_message: string;
      expected: {
        skill_signals?: {
          feature_opportunity?: {
            detected?: boolean;
            context?: {
              feature?: string;
              priority_reason?: string;
            };
          };
        };
      };
    }>;
  };
  const recurring = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("un truc recurrent de Sophia pourrait m'aider")
  );
  const tone = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("Sophia soit trop douce")
  );
  const challenge = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("challenges trop fort")
  );

  assertEquals(recurring?.expected.skill_signals?.feature_opportunity?.context
    ?.feature, "initiatives");
  assertEquals(tone?.expected.skill_signals?.feature_opportunity?.context
    ?.feature, "coach_preferences");
  assertEquals(challenge?.expected.skill_signals?.feature_opportunity?.context
    ?.feature, "coach_preferences");
});

Deno.test("dispatcher prompt preserves product help plus one-shot reminder multi-intent", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "question produit et une demande explicite de rappel ponctuel",
    ),
    true,
  );

  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as {
    doctrine_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: Array<Record<string, unknown>>;
        skill_signals?: Record<string, unknown>;
      };
    }>;
  };
  const example = parsed.doctrine_examples.find((item) =>
    item.user_message.includes("Question produit") &&
    item.user_message.includes("rappelle-moi demain a 9h")
  );

  assertEquals(Boolean(example), true);
  assertEquals(
    example?.expected.direct_effects?.[0]?.effect_type,
    "create_one_shot_reminder",
  );
  assertEquals(
    (example?.expected.skill_signals?.product_help as { detected?: boolean })
      ?.detected,
    true,
  );
});

Deno.test("dispatcher prompt uses canonical one-shot reminder rules", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "direct_effects.create_one_shot_reminder",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "payload_hint.instruction_hint doit contenir uniquement ce qu'il faut rappeler",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "la lane globale gere le direct effect",
    ),
    true,
  );
});

Deno.test("dispatcher prompt examples do not teach legacy routing", () => {
  const parsed = JSON.parse(buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
  })) as { doctrine_examples: Array<{ expected: Record<string, unknown> }> };

  for (const example of parsed.doctrine_examples) {
    assertEquals(
      ["tool", "skill", "intents"].join("_") in example.expected,
      false,
    );
    assertEquals(["flow", "opportunity"].join("_") in example.expected, false);
    assertEquals(
      ["normal", "reply", "fit", "score"].join("_") in example.expected,
      false,
    );
  }
});
