import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  buildPotionFollowUpFallbackSeries,
  generatePotionFollowUpSeries,
  type PotionFollowUpSeriesInput,
} from "./potion-follow-up-series.ts";
import type { PotionBaseContext } from "./potion-base-context.ts";

function clarteContext(): PotionBaseContext {
  return {
    scope: {
      kind: "transformation",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      resolved_from: "explicit_transformation",
    },
    transformation: {
      title: "Reprendre mon cap",
      user_summary:
        "Je veux retrouver une maniere de travailler qui me ressemble.",
      internal_summary: null,
      success_definition: "tenir un rythme qui protege mon energie",
      main_constraint: "je me disperse quand tout devient urgent",
      deep_why_answers: [{
        question: "Pourquoi profond",
        answer: "retrouver une vie ou je me respecte dans mes choix",
      }],
      questionnaire_answers: null,
    },
    plan_strategy: {
      identity_shift: "devenir quelqu'un qui avance sans se trahir",
      core_principle: "un pas juste vaut mieux qu'une liste parfaite",
      success_definition: "un plan qui soutient mon energie",
      main_constraint: "la surcharge me coupe du sens",
    },
    plan_items: [{
      id: "item-1",
      title: "Ecrire la premiere page",
      description: null,
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
}

function baseInput(
  overrides: Partial<PotionFollowUpSeriesInput> = {},
): PotionFollowUpSeriesInput {
  return {
    userId: "user-1",
    potionType: "clarte",
    reminderInstruction:
      "Rappelle-moi le lien entre mon plan et mon pourquoi profond.",
    rationale: "Aider a garder le sens du plan vivant.",
    durationDays: 7,
    timezone: "Europe/Paris",
    sessionContent: { potion_name: "Potion de clarte" },
    baseContext: clarteContext(),
    questionnaireAnswers: {
      plan_meaning_loss_reason:
        "Je ne vois plus le lien entre mes actions et mon pourquoi profond.",
    },
    followUpStrategy: {},
    ...overrides,
  };
}

Deno.test("clarte fallback series creates seven distinct plan why drafts", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput());

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(series.some((item) => item.draft_message.includes("pourquoi")));
  assert(series.some((item) => item.draft_message.includes("plan")));
  assert(series.some((item) => item.theme.includes("identite")));
  assert(series.some((item) => item.theme.includes("contrainte")));
});

Deno.test("potion follow-up series falls back when AI generation fails", async () => {
  const series = await generatePotionFollowUpSeries(baseInput(), {
    llmRunner: async () => {
      throw new Error("ai_down");
    },
  });

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
});

Deno.test("clarte fallback keeps future meaning loss field before legacy answers", () => {
  const context = clarteContext();
  context.transformation.deep_why_answers = [];
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    baseContext: context,
    questionnaireAnswers: {
      plan_meaning_loss_reason: "les actions sont devenues automatiques",
      clarity_problem: "legacy problem should not win",
      clarity_need: "legacy need should not win",
    },
  }));

  assert(
    series.some((item) =>
      item.draft_message.includes("les actions sont devenues automatiques")
    ),
  );
  assertEquals(
    series.some((item) => item.draft_message.includes("legacy problem")),
    false,
  );
});

Deno.test("clarte fallback still supports legacy clarity_problem", () => {
  const context = clarteContext();
  context.transformation.deep_why_answers = [];
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    baseContext: context,
    questionnaireAnswers: {
      clarity_problem: "je fais mon plan sans y croire",
    },
  }));

  assert(
    series.some((item) =>
      item.draft_message.includes("je fais mon plan sans y croire")
    ),
  );
});

Deno.test("rappel plan-linked fallback includes plan why context", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    potionType: "rappel",
    reminderInstruction: "Aide-moi a raccrocher a l'ecriture.",
    questionnaireAnswers: {
      drift_target: "l'ecriture du matin",
      drift_style: "repousse",
    },
    rappelScope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "item-1",
      target_label: "Ecrire la premiere page",
    },
    targetBinding: {
      kind: "plan_item",
      label: "Ecrire la premiere page",
      binding_policy: "live_action",
    },
  }));

  assertEquals(series.length, 7);
  assert(
    series.some((item) => item.draft_message.includes("retrouver une vie")),
  );
  assert(
    series.some((item) =>
      item.draft_message.includes("Ecrire la premiere page")
    ),
  );
});

Deno.test("rappel out-of-plan fallback stays centered on drift target", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    potionType: "rappel",
    reminderInstruction: "Aide-moi a raccrocher au coucher.",
    questionnaireAnswers: {
      drift_target: "mon coucher",
      drift_style: "oubli",
    },
    rappelScope: {
      scope_kind: "out_of_plan",
      target_scope: null,
      target_plan_item_id: null,
      target_label: "mon coucher",
    },
  }));

  assertEquals(series.length, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(series.some((item) => item.draft_message.includes("mon coucher")));
  assertEquals(
    series.some((item) => item.draft_message.includes("retrouver une vie")),
    false,
  );
});

Deno.test("amour plan-linked fallback uses plan context without performance pressure", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    potionType: "amour",
    reminderInstruction:
      "Aide-moi a me parler avec plus de douceur autour de mon ecriture.",
    questionnaireAnswers: {
      love_lack_context: "mon ecriture que je juge nulle",
      love_state: "dur",
    },
    potionScope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "item-1",
      target_label: "Ecrire la premiere page",
    },
    targetBinding: {
      kind: "plan_item",
      label: "Ecrire la premiere page",
      binding_policy: "live_action",
    },
  }));

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(
    series.some((item) =>
      item.draft_message.includes("Ecrire la premiere page")
    ),
  );
  assert(
    series.some((item) =>
      item.draft_message.includes("preuve contre toi") ||
      item.draft_message.includes("pas a meriter")
    ),
  );
});

Deno.test("amour out-of-plan fallback does not force plan context", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    potionType: "amour",
    reminderInstruction:
      "Aide-moi a me parler avec plus de douceur autour de ma solitude.",
    questionnaireAnswers: {
      love_lack_context: "ma solitude du soir",
      love_state: "seul",
    },
    potionScope: {
      scope_kind: "out_of_plan",
      target_scope: null,
      target_plan_item_id: null,
      target_label: "ma solitude du soir",
    },
  }));

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(
    series.some((item) => item.draft_message.includes("ma solitude du soir")),
  );
  assertEquals(
    series.some((item) => item.draft_message.includes("retrouver une vie")),
    false,
  );
  assertEquals(
    series.some((item) => item.draft_message.toLowerCase().includes("plan")),
    false,
  );
});

Deno.test("apaisement plan-linked fallback uses plan context without performance pressure", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    potionType: "apaisement",
    reminderInstruction:
      "Aide-moi a redescendre la pression autour de mon ecriture.",
    questionnaireAnswers: {
      pressure_source: "l'ecriture du matin qui me comprime",
      pressure_state: "a_cran",
    },
    potionScope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "item-1",
      target_label: "Ecrire la premiere page",
    },
    targetBinding: {
      kind: "plan_item",
      label: "Ecrire la premiere page",
      binding_policy: "live_action",
    },
  }));

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(
    series.some((item) =>
      item.draft_message.includes("Ecrire la premiere page")
    ),
  );
  assert(
    series.some((item) =>
      item.draft_message.includes("pression de plus") ||
      item.draft_message.includes("preuve de performance") ||
      item.draft_message.includes("rythme plus respirable")
    ),
  );
});

Deno.test("apaisement out-of-plan fallback stays on pressure source and does not force plan", async () => {
  const input = baseInput({
    potionType: "apaisement",
    reminderInstruction: "Aide-moi a redescendre la pression.",
    questionnaireAnswers: {
      pressure_source: "une discussion qui me comprime",
      pressure_state: "submerge",
    },
    potionScope: {
      scope_kind: "out_of_plan",
      target_scope: null,
      target_plan_item_id: null,
      target_label: "une discussion qui me comprime",
    },
  });
  const series = await generatePotionFollowUpSeries(input, {
    llmRunner: async () => {
      throw new Error("ai_down");
    },
  });

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(
    series.some((item) =>
      item.draft_message.includes("une discussion qui me comprime")
    ),
  );
  assertEquals(
    series.some((item) => item.draft_message.includes("retrouver une vie")),
    false,
  );
  assertEquals(
    series.some((item) => item.draft_message.toLowerCase().includes("plan")),
    false,
  );
});

Deno.test("guerison plan-linked fallback returns seven distinct repair drafts tied to plan context", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    potionType: "guerison",
    reminderInstruction: "Aide-moi a reparer apres avoir craque.",
    questionnaireAnswers: {
      recent_hurt: "j'ai craque hier et abandonne l'ecriture",
      dominant_feeling: "honte",
    },
    potionScope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "item-1",
      target_label: "Ecrire la premiere page",
    },
    targetBinding: {
      kind: "plan_item",
      label: "Ecrire la premiere page",
      binding_policy: "live_action",
    },
  }));

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(
    series.some((item) => item.draft_message.includes("retrouver une vie")),
  );
  assert(
    series.some((item) =>
      item.draft_message.includes("Ecrire la premiere page")
    ),
  );
  assert(
    series.some((item) =>
      item.draft_message.includes("pas ajouter une pression") ||
      item.draft_message.includes("sans t'ecraser")
    ),
  );
});

Deno.test("guerison out-of-plan fallback does not force plan context", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    potionType: "guerison",
    reminderInstruction: "Aide-moi a reparer apres avoir craque.",
    questionnaireAnswers: {
      recent_hurt: "j'ai craque hier et je me suis parle violemment",
      dominant_feeling: "culpabilite",
    },
    potionScope: {
      scope_kind: "out_of_plan",
      target_scope: null,
      target_plan_item_id: null,
      target_label: null,
    },
  }));

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(
    series.some((item) => item.draft_message.includes("j'ai craque hier")),
  );
  assert(
    series.some((item) => item.draft_message.includes("culpabilite")),
  );
  assertEquals(
    series.some((item) => item.draft_message.includes("retrouver une vie")),
    false,
  );
  assertEquals(
    series.some((item) => item.draft_message.toLowerCase().includes("plan")),
    false,
  );
});

Deno.test("courage plan-linked fallback uses plan why context", () => {
  const series = buildPotionFollowUpFallbackSeries(baseInput({
    potionType: "courage",
    reminderInstruction: "Aide-moi a envoyer ce message sans me brutaliser.",
    questionnaireAnswers: {
      avoidance_target: "envoyer ce message difficile",
      blocker_kind: "conflit",
    },
    potionScope: {
      scope_kind: "plan_linked",
      target_scope: "plan_item",
      target_plan_item_id: "item-1",
      target_label: "Ecrire la premiere page",
    },
    targetBinding: {
      kind: "plan_item",
      label: "Ecrire la premiere page",
      binding_policy: "live_action",
    },
  }));

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(
    series.some((item) => item.draft_message.includes("retrouver une vie")),
  );
  assert(
    series.some((item) =>
      item.draft_message.includes("Ecrire la premiere page")
    ),
  );
  assert(
    series.some((item) =>
      item.draft_message.includes("envoyer ce message difficile")
    ),
  );
});

Deno.test("courage out-of-plan fallback does not force plan context", async () => {
  const input = baseInput({
    potionType: "courage",
    reminderInstruction: "Aide-moi a envoyer ce message sans me brutaliser.",
    questionnaireAnswers: {
      avoidance_target: "envoyer ce message difficile",
      blocker_kind: "conflit",
    },
    potionScope: {
      scope_kind: "out_of_plan",
      target_scope: null,
      target_plan_item_id: null,
      target_label: null,
    },
  });
  const series = await generatePotionFollowUpSeries(input, {
    llmRunner: async () => {
      throw new Error("ai_down");
    },
  });

  assertEquals(series.length, 7);
  assertEquals(new Set(series.map((item) => item.draft_message)).size, 7);
  assert(series.every((item) => item.draft_message.trim().length > 0));
  assert(
    series.some((item) =>
      item.draft_message.includes("envoyer ce message difficile")
    ),
  );
  assertEquals(
    series.some((item) => item.draft_message.includes("retrouver une vie")),
    false,
  );
  assertEquals(
    series.some((item) =>
      item.draft_message.includes("Ecrire la premiere page")
    ),
    false,
  );
});
