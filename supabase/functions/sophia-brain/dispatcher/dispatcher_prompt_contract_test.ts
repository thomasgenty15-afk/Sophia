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

Deno.test("dispatcher prompt reserves lite model tier for trivial interactions only", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "model_tier_hint=lite est reserve aux interactions vraiment triviales",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("salutations"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("quoi de beau ?"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Par defaut, utilise model_tier_hint=standard pour tout le reste",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "N'utilise pas lite simplement parce que reasoning_complexity semble low",
    ),
    true,
  );
});

Deno.test("dispatcher prompt keeps plan status questions out of lite reflection", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Questions planning/actions:"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "ce n'est pas une simple normal_reply/reflection",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "Route status_recap quand la reponse depend de donnees Sophia",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("ne mets jamais model_tier_hint=lite"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Utilise model_tier_hint=standard"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("j'ai quoi a faire aujourd'hui ?"),
    true,
  );
});

Deno.test("dispatcher prompt documents flow_opportunity as implicit opportunities", () => {
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "flow_opportunity signale une occasion implicite a verifier",
    ),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Ce champ ne lance rien"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("J'oublie tous les matins de boire de l'eau"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("Je tourne autour du dossier depuis trois jours"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("create_recurring_reminder"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes("prepare_attack_card"),
    true,
  );
  assertEquals(
    DISPATCHER_V2_SYSTEM_PROMPT.includes(
      "select_state_potion: pas d'opportunite implicite par defaut",
    ),
    true,
  );
});

Deno.test("dispatcher prompt examples keep Plan refinement product_help focused on plan.adjustment", () => {
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
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
    example.expected.tool_skill_intents?.map((intent) => intent.operation_type),
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
