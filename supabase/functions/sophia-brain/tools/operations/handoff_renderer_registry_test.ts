import {
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { getHandoffTargetForOperation } from "../../product_surface_registry/contract.ts";
import { renderAdjustPlanHandoffDraft } from "./adjust_plan_item/renderer.ts";
import { renderAttackCardPlatformHandoff } from "./prepare_attack_card/renderer.ts";
import { renderDefenseCardHandoff } from "./prepare_defense_card/renderer.ts";
import { renderSelectStatePotionHandoffDraft } from "./select_state_potion/renderer.ts";
import { renderRecurringReminderPlatformHandoff } from "./create_recurring_reminder/renderer.ts";
import { renderCoachPreferenceHandoffDraft } from "./update_coach_preferences/renderer.ts";

Deno.test("adjust_plan renderer includes registry Plan destination", () => {
  const target = getHandoffTargetForOperation("adjust_plan_item")!;
  const content = renderAdjustPlanHandoffDraft({
    operation_type: "adjust_plan_item",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    scope: { kind: "specific_plan_item", target_summary: "Action" },
    user_goal_summary: "alléger l'action",
    coaching_read: "ça réduit la charge",
    recommendation: {
      summary: "alléger",
      recommended_change: "version courte",
      preserve: ["objectif"],
      avoid: ["tout changer"],
      platform_destination: "legacy",
      platform_steps: ["legacy"],
    },
    missing_decisions: [],
  });
  assertStringIncludes(content, target.user_facing_destination);
});

Deno.test("attack card renderer includes registry Cards destination", () => {
  const target = getHandoffTargetForOperation("prepare_attack_card")!;
  const content = renderAttackCardPlatformHandoff({
    operation_type: "prepare_attack_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: "Action",
    blocker_summary: "Blocage",
    recommendation: {
      technique_label: "Mini départ",
      why_this_technique: "court",
      card_draft_summary: "Brouillon",
      preserve: ["geste court"],
      avoid: ["trop long"],
      platform_destination: "legacy",
      platform_steps: ["legacy"],
    },
    missing_decisions: [],
  });
  assertStringIncludes(content, target.user_facing_destination);
});

Deno.test("defense card renderer includes registry Defense Cards destination", () => {
  const target = getHandoffTargetForOperation("prepare_defense_card")!;
  const content = renderDefenseCardHandoff({
    handoff: {
      operation_type: "prepare_defense_card",
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      target_summary: "Situation",
      risk_summary: "Risque",
      platform_flow: {
        route_kind: "free_card",
        route_label: "Carte de défense libre",
        entry_need: "Risque",
        questionnaire_answers: [
          {
            field: "moment",
            question_label: "A quel moment précis ça arrive ?",
            answer: "Situation",
          },
          {
            field: "signal",
            question_label: "Quel est le premier signal ?",
            answer: "Signal",
          },
          {
            field: "response",
            question_label: "Quel geste simple ?",
            answer: "Geste",
          },
        ],
      },
      platform_fields: {
        label: "Carte test",
        situation: "Situation",
        signal: "Signal",
        defense_response: "Geste",
        plan_b: "Plan B",
      },
      recommendation: {
        defense_strategy_label: "Réponse",
        why_this_strategy: "prévenir",
        card_draft_summary: "Brouillon",
        preserve: ["signal"],
        avoid: ["flou"],
        platform_destination: "legacy",
        platform_steps: ["legacy"],
      },
      missing_decisions: [],
    },
  });
  assertStringIncludes(content, target.user_facing_destination);
});

Deno.test("potion renderer includes registry State/Potions destination", () => {
  const target = getHandoffTargetForOperation("select_state_potion")!;
  const content = renderSelectStatePotionHandoffDraft({
    operation_type: "select_state_potion",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_state_summary: "tension",
    desired_shift_summary: "vers plus calme",
    recommendation: {
      potion_label: "Pause",
      why_this_potion: "réguler",
      immediate_step: null,
      preserve: ["calme"],
      avoid: ["forcer"],
      platform_destination: "legacy",
      platform_steps: ["legacy"],
    },
    missing_decisions: [],
  });
  assertStringIncludes(content, target.user_facing_destination);
});

Deno.test("recurring renderer includes registry Reminders destination", () => {
  const target = getHandoffTargetForOperation("create_recurring_reminder")!;
  const content = renderRecurringReminderPlatformHandoff({
    handoffDraft: {
      operation_type: "create_recurring_reminder",
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      reminder_summary: "rappel hebdo",
      cadence_summary: "chaque lundi",
      time_summary: "09:00",
      content_summary: "faire le point",
      recommendation: {
        platform_destination: "legacy",
        platform_steps: ["legacy"],
        preserve: ["cadence"],
        avoid: ["ponctuel"],
      },
      missing_decisions: [],
    },
  });
  assertStringIncludes(content, target.user_facing_destination);
});

Deno.test("preferences renderer includes registry Preferences destination", () => {
  const target = getHandoffTargetForOperation("update_coach_preferences")!;
  const content = renderCoachPreferenceHandoffDraft({
    operation_type: "update_coach_preferences",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_request_summary: "moins de questions",
    preference_kind: "durable_supported",
    supported_settings: [{
      key: "coach.question_tendency",
      label: "Questions",
      recommended_value: "moins",
      explanation: "réduire les questions",
    }],
    unsupported_parts: [],
    recommendation: {
      platform_destination: "legacy",
      platform_steps: ["legacy"],
      preserve: ["utile"],
      avoid: ["rigide"],
    },
    missing_decisions: [],
  });
  assertStringIncludes(content, target.user_facing_destination);
});
