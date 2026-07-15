import { assert, assertEquals } from "jsr:@std/assert@1";

import { buildPotionSupportContext } from "./potion-support-context.ts";
import type { PotionBaseContext } from "./potion-base-context.ts";

const baseContext: PotionBaseContext = {
  scope: {
    kind: "transformation",
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    resolved_from: "explicit_transformation",
  },
  transformation: {
    title: "Présenter mon projet",
    user_summary: "Je veux parler avec plus de calme.",
    internal_summary: "advisory internal",
    success_definition: "Faire la présentation vendredi.",
    main_constraint: "La peur du regard des autres.",
    deep_why_answers: [{
      question: "Pourquoi ?",
      answer: "Parce que ce projet compte pour moi.",
    }],
    questionnaire_answers: null,
  },
  plan_strategy: {
    identity_shift: "Parler même avec du trac.",
    core_principle: "Un pas à la fois.",
    success_definition: null,
    main_constraint: null,
  },
  plan_items: [{
    id: "item-1",
    title: "Répéter dix minutes",
    description: "Faire une répétition courte.",
    dimension: "missions",
    kind: "task",
    status: "active",
    tracking_type: "boolean",
    current_habit_state: null,
    support_mode: null,
    support_function: null,
    target_reps: null,
    current_reps: null,
    cadence_label: null,
    scheduled_days: null,
    time_of_day: null,
  }],
  prior_potions: [],
  active_potion_reminders: [],
  usage_guidance: [],
};

Deno.test("potion support activation snapshot keeps structured evidence and advisory memory separate", () => {
  const context = buildPotionSupportContext({
    nowIso: "2026-07-15T08:00:00.000Z",
    potionType: "apaisement",
    questionnaireAnswers: {
      pressure_source: "Ma présentation de vendredi me met à cran.",
    },
    freeText: "Je veux éviter de me remettre encore plus de pression.",
    content: {
      potion_name: "Souffle avant vendredi",
      instant_response: "On desserre.",
      suggested_next_step: null,
      follow_up_proposal: {
        title: "Soutien",
        description: "Aider sans augmenter la pression avant vendredi.",
        message_text: "Prendre des nouvelles sobrement.",
        cadence_hint: "7 jours",
      },
    },
    baseContext,
    recentContext: {
      conversation_block: "[user] texte récent non sourcé par id",
      thematic_memory_block: "mémoire narrative non sourcée par id",
      topic_id: "topic-1",
      topic_confidence: 0.82,
      user_named_theme: true,
    },
  });

  assertEquals(context.version, 1);
  assert(
    context.baseline_evidence.some((item) =>
      item.source.source_type === "potion_answer" &&
      item.source.source_field === "pressure_source"
    ),
  );
  assert(
    context.baseline_evidence.some((item) =>
      item.source.source_type === "plan_item" &&
      item.source.source_id === "item-1"
    ),
  );
  assertEquals(
    context.baseline_evidence.some((item) =>
      item.text.includes("texte récent non sourcé") ||
      item.text.includes("mémoire narrative")
    ),
    false,
  );
  assertEquals(context.advisory_context.recent_conversation_available, true);
  assertEquals(context.advisory_context.thematic_memory_available, true);
  assert(context.objective.evidence_refs.length > 0);
  assertEquals(context.rolling_evidence, []);
});
