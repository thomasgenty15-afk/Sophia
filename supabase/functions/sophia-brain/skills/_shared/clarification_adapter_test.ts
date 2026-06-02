import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type {
  ClarificationAmbiguityKind,
  ClarificationCandidate,
  ClarificationOwner,
} from "../../clarification/contract.ts";
import { runSkillClarification } from "./clarification_adapter.ts";

Deno.test("conversation skill clarification adapter runs shared clarification tool", async () => {
  const output = await runSkillClarification({
    owner: "product_help",
    ambiguity_kind: "intent",
    user_message: "j'hésite",
    recent_messages: [],
    candidates: [
      { id: "product_help", label: "une explication" },
      {
        id: "prepare_attack_card",
        label: "préparer une carte",
        operation_type: "prepare_attack_card",
      },
    ],
    llm_runner: async () => ({
      status: "ask",
      confidence: "medium",
      question:
        "Tu veux plutôt que je t'explique, ou qu'on prépare une carte ?",
    }),
  });

  assertEquals(output.status, "ask");
  assertEquals(
    output.question,
    "Tu veux plutôt que je t'explique, ou qu'on prépare une carte ?",
  );
});

async function runAskCase(args: {
  owner: ClarificationOwner;
  ambiguity_kind: ClarificationAmbiguityKind;
  candidates: ClarificationCandidate[];
}) {
  const output = await runSkillClarification({
    owner: args.owner,
    ambiguity_kind: args.ambiguity_kind,
    user_message: "j'hésite",
    recent_messages: [
      { role: "user", content: "je bloque un peu" },
      { role: "assistant", content: "On clarifie juste le prochain pas." },
    ],
    candidates: args.candidates,
    llm_runner: async (input) => {
      assertEquals(input.json_mode, true);
      assertEquals(input.model_name.length > 0, true);
      return {
        status: "ask",
        confidence: "medium",
        question: `Tu veux plutôt ${args.candidates[0].label}, ou ${
          args.candidates[1].label
        } ?`,
      };
    },
  });

  assertEquals(output.status, "ask");
  assertEquals(
    output.question,
    `Tu veux plutôt ${args.candidates[0].label}, ou ${
      args.candidates[1].label
    } ?`,
  );
  assertEquals(output.selected_candidate_id ?? null, null);
}

Deno.test("priority conversation skill owners can call shared clarification", async () => {
  const cases: Array<{
    owner: ClarificationOwner;
    ambiguity_kind: ClarificationAmbiguityKind;
    candidates: ClarificationCandidate[];
  }> = [
    {
      owner: "product_help",
      ambiguity_kind: "intent",
      candidates: [
        { id: "product_help", label: "une explication produit" },
        {
          id: "prepare_attack_card",
          label: "préparer une carte",
          operation_type: "prepare_attack_card",
        },
      ],
    },
    {
      owner: "execution_breakdown",
      ambiguity_kind: "handoff_readiness",
      candidates: [
        { id: "break_down_action", label: "découper l'action" },
        {
          id: "adjust_plan_handoff",
          label: "ajuster le plan",
          operation_type: "adjust_plan_handoff",
        },
      ],
    },
    {
      owner: "emotional_repair",
      ambiguity_kind: "target",
      candidates: [
        { id: "emotional_support", label: "être entendu maintenant" },
        {
          id: "state_potion_handoff",
          label: "changer d'état avec une potion",
          operation_type: "state_potion_handoff",
        },
      ],
    },
    {
      owner: "demotivation_repair",
      ambiguity_kind: "scope",
      candidates: [
        { id: "meaning_loss", label: "clarifier le sens" },
        { id: "action_too_big", label: "réduire l'action" },
      ],
    },
    {
      owner: "weekly_adaptive_review_v1",
      ambiguity_kind: "handoff_readiness",
      candidates: [
        { id: "weekly_recap", label: "faire un simple récap" },
        {
          id: "adjust_plan_handoff",
          label: "préparer un ajustement du plan",
          operation_type: "adjust_plan_handoff",
        },
      ],
    },
  ];

  for (const testCase of cases) {
    await runAskCase(testCase);
  }
});
