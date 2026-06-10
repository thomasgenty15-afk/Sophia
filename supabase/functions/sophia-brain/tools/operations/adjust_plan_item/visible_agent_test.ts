import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { AdjustPlanConversationContext } from "./local_flow.ts";
import {
  adjustPlanVisibleContractIssues,
  visibleSystemPrompt,
} from "./visible_agent.ts";

function conversationContext(
  overrides: Partial<AdjustPlanConversationContext> = {},
): AdjustPlanConversationContext {
  const base: AdjustPlanConversationContext = {
    state_summary: "Action du soir a alleger cette semaine.",
    user_words: ["trop lourd", "version 5 minutes"],
    field_or_stage: "handoff",
    known_values: {
      scope: {
        kind: "specific_plan_item",
        confidence: "high",
        plan_id: "plan-1",
        plan_title: "Plan principal",
        level_id: "level-1",
        level_title: "Niveau actif",
        plan_item_ids: ["item-1"],
        target_summary: "Action du soir",
        needs_scope_clarification: false,
      },
      adjustment_need: {
        reason_change: "trop lourd cette semaine",
        requested_change: "passer en version 5 minutes",
        change_kind: "reduce",
        constraints: ["cette semaine"],
        preserve: ["garder le signal de pause"],
        avoid: ["abandonner"],
        missing: [],
      },
      constraints: ["cette semaine"],
      preserve: ["garder le signal de pause"],
      avoid: ["abandonner"],
    },
    missing_or_weak_values: [],
    selected_candidate: {
      plan_id: "plan-1",
      plan_item_ids: ["item-1"],
    },
    handoff_data: {
      destination: "Plan",
      suggested_platform_input:
        "Alleger l'action du soir en version 5 minutes, en gardant le signal de pause.",
      grouped_by_plan: [],
      previous_value: null,
      revised_value: null,
    },
    tone_constraints: [],
    do_not_say: ["Ne dis pas que le plan est applique."],
    context_summary: "Proposition non-mutante a reprendre dans Plan.",
    evidence_used: ["trop lourd", "version 5 minutes", "sans abandonner"],
  };
  return { ...base, ...overrides };
}

Deno.test("adjust_plan_item visible prompt anchors handoff on why, what and exact product location", () => {
  const prompt = visibleSystemPrompt({
    user_id: "user-1",
    stage: "plan_handoff_ready",
    conversation_context: conversationContext(),
  });

  assertStringIncludes(prompt, "reason_change");
  assertStringIncludes(prompt, "requested_change");
  assertStringIncludes(prompt, "change_kind");
  assertStringIncludes(prompt, "quoi modifier");
  assertStringIncludes(prompt, "nature de modification");
  assertStringIncludes(prompt, "sous le niveau actif");
  assertStringIncludes(prompt, "Ajuster mon plan");
  assertStringIncludes(prompt, "sans template fixe");
  assertStringIncludes(prompt, "VISIBLE_OUTPUT_STYLE_RULES");
  assertStringIncludes(prompt, "tutoiement");
  assertStringIncludes(prompt, "Format WhatsApp");
});

Deno.test("adjust_plan_item visible contract rejects handoff without target reason and change kind", () => {
  const incomplete = conversationContext({
    known_values: {
      ...conversationContext().known_values,
      adjustment_need: {
        ...conversationContext().known_values.adjustment_need,
        change_kind: null,
      },
    },
  });
  const issues = adjustPlanVisibleContractIssues(
    "Tu peux le reprendre dans Plan sous le niveau actif.",
    {
      user_id: "user-1",
      stage: "plan_handoff_ready",
      conversation_context: incomplete,
    },
  );

  assert(issues.includes("missing_handoff_core_context"));
});

Deno.test("adjust_plan_item visible contract rejects Plan redirect on cancel_close", () => {
  const issues = adjustPlanVisibleContractIssues(
    "D'accord, on laisse tomber. Tu peux retourner a ton Plan quand tu veux.",
    {
      user_id: "user-1",
      stage: "cancel_close",
      conversation_context: conversationContext(),
    },
  );

  assert(issues.includes("cancel_close_should_not_redirect_to_plan"));
});

Deno.test("adjust_plan_item visible contract accepts short local cancel without Plan redirect", () => {
  const issues = adjustPlanVisibleContractIssues(
    "D'accord, on met cet ajustement de cote.",
    {
      user_id: "user-1",
      stage: "cancel_close",
      conversation_context: conversationContext(),
    },
  );

  assertEquals(issues, []);
});

Deno.test("adjust_plan_item visible contract rejects vouvoiement", () => {
  const issues = adjustPlanVisibleContractIssues(
    "Souhaitez-vous garder votre version dans le Plan ?",
    {
      user_id: "user-1",
      stage: "plan_handoff_ready",
      conversation_context: conversationContext(),
    },
  );

  assert(issues.includes("forbidden_vouvoiement:votre"));
  assert(issues.includes("forbidden_vouvoiement:souhaitez-vous"));
});
