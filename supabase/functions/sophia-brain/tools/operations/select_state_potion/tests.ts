import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import type { PotionType } from "../../../../_shared/v2-types.ts";
import { formatPotionBaseContextForPrompt } from "../../../../_shared/potion-base-context.ts";
import {
  buildStatePotionCatalogPrompt,
  STATE_POTION_TYPES,
} from "./catalog.ts";
import { executeActivateStatePotion } from "./executor.ts";
import { runSelectStatePotionIntake } from "./intake.ts";
import {
  chatDetailQuestionIds,
  POTION_DETAIL_SUBSKILLS,
} from "./subskills/potion_detail_intake.ts";
import {
  structuredStatePotionDraftGenerator,
  structuredStatePotionSlotFiller,
} from "./test_helpers.ts";

const SECRET = "s5-test-secret";

Deno.test("select_state_potion catalog gives AI rich potion context and question examples", () => {
  const catalog = buildStatePotionCatalogPrompt();
  assertStringIncludes(catalog, "Catalogue canonique des potions d'etat");
  assertStringIncludes(
    catalog,
    "Le suivi par defaut est un reminder court sur 7 jours",
  );
  assert(!/\b(vous|votre|vos)\b/i.test(catalog));
  for (const potionType of STATE_POTION_TYPES) {
    const definition = POTION_DEFINITIONS[potionType];
    assertStringIncludes(catalog, `${definition.type} - ${definition.title}`);
    assertStringIncludes(catalog, definition.short_description);
    assertStringIncludes(
      catalog,
      definition.default_follow_up_strategy.rationale ?? "",
    );
    for (const question of definition.questionnaire) {
      assertStringIncludes(catalog, question.label);
      assert(!/\b(vous|votre|vos)\b/i.test(question.label));
      assert(
        !/\b(slot|schema|operation|payload|diagnostic)\b/i.test(question.label),
      );
      assert(question.label.length <= 80);
    }
  }
});

Deno.test("state potion DB base context exposes shared front and chat material", () => {
  const promptBlock = formatPotionBaseContextForPrompt({
    scope: {
      kind: "transformation",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      resolved_from: "explicit_transformation",
    },
    transformation: {
      title: "Retrouver une direction simple",
      user_summary: "Le user veut clarifier son cap.",
      internal_summary: "Contexte interne de transformation.",
      success_definition: "Savoir quoi prioriser cette semaine.",
      main_constraint: "Trop de dispersion.",
      deep_why_answers: [{
        question: "Pourquoi est-ce important ?",
        answer: "Je veux retrouver une relation plus calme a mon quotidien.",
      }],
      questionnaire_answers: { rythme: "matin" },
    },
    plan_strategy: {
      identity_shift: "Je deviens quelqu'un qui avance simplement.",
      core_principle: "Moins mais mieux.",
      success_definition: "Une priorite nette.",
      main_constraint: "La surcharge.",
    },
    plan_items: [{
      id: "item-1",
      title: "Choisir la priorite du jour",
      description: "Une decision simple chaque matin.",
      dimension: "missions",
      kind: "task",
      status: "active",
      tracking_type: "boolean",
      current_habit_state: null,
      support_mode: null,
      support_function: null,
      target_reps: null,
      current_reps: null,
      cadence_label: "quotidien",
      scheduled_days: ["mon", "tue"],
      time_of_day: "09:00",
    }],
    prior_potions: [{
      id: "potion-1",
      potion_type: "clarte",
      title: "Clarte douce",
      generated_at: "2026-05-18T08:00:00.000Z",
      reminder_instruction: "Reviens a une priorite simple.",
    }],
    active_potion_reminders: [{
      id: "reminder-1",
      potion_type: "clarte",
      message_instruction: "Reviens a une priorite simple.",
      local_time_hhmm: "09:00",
      scheduled_days: ["mon", "tue", "wed"],
    }],
    usage_guidance: [
      "Priorite haute: pourquoi profond, resume de transformation, succes attendu, contrainte principale et strategie du plan.",
    ],
  });
  assertStringIncludes(promptBlock, '"source": "database"');
  assertStringIncludes(promptBlock, "deep_why_answers");
  assertStringIncludes(
    promptBlock,
    "Je veux retrouver une relation plus calme",
  );
  assertStringIncludes(promptBlock, "Choisir la priorite du jour");
  assertStringIncludes(promptBlock, "prior_potions_same_type");
  assertStringIncludes(promptBlock, "active_potion_reminders");
});

Deno.test("select_state_potion has one detail subskill per potion with two canonical fields", () => {
  for (const potionType of STATE_POTION_TYPES) {
    const subskill = POTION_DETAIL_SUBSKILLS[potionType];
    assertEquals(subskill.potion_type, potionType);
    assertEquals(subskill.sub_skill, `${potionType}_intake`);
    assertEquals(subskill.required_question_ids.length, 2);
    assertEquals(chatDetailQuestionIds(potionType), [
      ...subskill.required_question_ids,
    ]);
    for (const questionId of subskill.required_question_ids) {
      assert(
        POTION_DEFINITIONS[potionType].questionnaire.some((question) =>
          question.id === questionId
        ),
      );
    }
  }
});

Deno.test("select_state_potion pipeline covers 6 potion types and default 7-day DB write contract", async () => {
  const cases = [
    ["je decroche, fais-moi une potion", "rappel"],
    ["je suis stresse, fais-moi une potion", "apaisement"],
    ["lance une potion de guerison", "guerison"],
    ["j'ai peur, lance une potion", "courage"],
    ["je suis dans le flou, fais une potion", "clarte"],
    ["je suis dur avec moi, potion", "amour"],
  ] as const satisfies ReadonlyArray<readonly [string, PotionType]>;
  for (const [message, potionType] of cases) {
    resetConsumedConfirmationTokensForTest();
    const output = await runSelectStatePotionIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message,
      trigger_message_id: `m-${potionType}`,
      safety_pregate_risk_band: "none",
      slot_filler: structuredStatePotionSlotFiller({
        state_kind: potionType === "rappel"
          ? "decrochage"
          : potionType === "apaisement"
          ? "stress_pressure"
          : potionType === "guerison"
          ? "shame_guilt"
          : potionType === "courage"
          ? "fear_avoidance"
          : potionType === "clarte"
          ? "confusion_overload"
          : "self_harshness",
        selected_potion: potionType,
      }),
      draft_generator: structuredStatePotionDraftGenerator(),
    });
    assertEquals(output.status, "pending_confirmation", message);
    assertEquals(output.draft?.draft.potion_type, potionType);
    const token = await createConfirmationToken({
      user_id: "u1",
      operation_id: String(output.pending_confirmation?.operation_id),
      operation_type: "select_state_potion",
      draft: output.draft,
      source_message_id: `yes-${potionType}`,
      pending_confirmation_id: `pending-${potionType}`,
      secret: SECRET,
    });
    let dbDraftPotionType: PotionType | null = null;
    let dbScheduledFollowups: Array<{
      local_date: string;
      local_time_hhmm: string;
      reminder_instruction: string;
    }> = [];
    const executed = await executeActivateStatePotion({
      operation_id: String(output.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: output.draft!,
      token,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_potion_activation: async ({ draft, scheduled_followups }) => {
        dbDraftPotionType = draft.potion_type;
        dbScheduledFollowups = scheduled_followups;
        return {
          potion_session_id: `potion-${potionType}`,
          recurring_reminder_id: `rr-${potionType}`,
          scheduled_checkin_ids: scheduled_followups.map((_, i) => `sc-${i}`),
        };
      },
      secret: SECRET,
      now_iso: "2026-05-04T08:00:00.000Z",
    });
    assertEquals(executed.status, "executed");
    if (executed.status === "executed") {
      assertEquals(dbDraftPotionType, potionType);
      assertEquals(dbScheduledFollowups.length, 7);
      assertEquals(
        dbScheduledFollowups.map((followup) => followup.local_date),
        [
          "2026-05-05",
          "2026-05-06",
          "2026-05-07",
          "2026-05-08",
          "2026-05-09",
          "2026-05-10",
          "2026-05-11",
        ],
      );
      assertEquals(
        dbScheduledFollowups.every((followup) =>
          followup.local_time_hhmm === "09:00" &&
          followup.reminder_instruction === `Reminder ${potionType}`
        ),
        true,
      );
      assertEquals(executed.scheduled_checkin_ids.length, 7);
      assertEquals(
        executed.messages.instant_support_message,
        `Instant support ${potionType}`,
      );
      assertEquals(
        executed.messages.potion_info_message.includes("suivi 7 jours"),
        true,
      );
    }
  }
});

Deno.test("select_state_potion supports one-off action follow-up schedules", async () => {
  resetConsumedConfirmationTokensForTest();
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: { kind: "fear_avoidance", intensity: "medium", evidence: ["test"] },
    potion_type: "courage",
    context: { target_hint: "Appel client mardi" },
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_one_off_draft");
  draft.draft.target_binding = {
    kind: "one_off_action",
    label: "Appel client mardi",
    related_plan_item_id: null,
    target_plan_item_id: null,
    target_action_family_key: null,
    target_generated_temp_id: null,
    recurrence_hint: null,
    date_or_window_hint: "2026-05-05 matin",
    evidence: ["appel mardi"],
  };
  draft.draft.follow_up = {
    ...draft.draft.follow_up,
    duration_days: 1,
    schedule_plan: {
      mode: "single_before_event",
      duration_days: null,
      local_time_hhmm: "08:45",
      scheduled_days: [],
      local_dates: ["2026-05-05"],
      timing_relation: "before",
      reason: "Juste avant l'appel.",
    },
  };
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-one-off",
    operation_type: "select_state_potion",
    draft,
    source_message_id: "yes-one-off",
    pending_confirmation_id: "pending-one-off",
    secret: SECRET,
  });
  let scheduled: Array<{
    local_date: string;
    local_time_hhmm: string;
    reminder_instruction: string;
  }> = [];
  const executed = await executeActivateStatePotion({
    operation_id: "op-one-off",
    user_id: "u1",
    draft,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_potion_activation: async ({ scheduled_followups }) => {
      scheduled = scheduled_followups;
      return {
        potion_session_id: "p-one-off",
        recurring_reminder_id: "r-one-off",
        scheduled_checkin_ids: scheduled_followups.map((_, index) =>
          `s-one-off-${index}`
        ),
      };
    },
    secret: SECRET,
    now_iso: "2026-05-04T08:00:00.000Z",
  });
  assertEquals(executed.status, "executed");
  assertEquals(scheduled, [{
    local_date: "2026-05-05",
    local_time_hhmm: "08:45",
    reminder_instruction: "Reminder courage",
  }]);
});

Deno.test("select_state_potion supports recurring action weekday schedules", async () => {
  resetConsumedConfirmationTokensForTest();
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: {
      kind: "confusion_overload",
      intensity: "medium",
      evidence: ["test"],
    },
    potion_type: "clarte",
    context: { target_hint: "Reunions du mardi et jeudi" },
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_weekday_draft");
  draft.draft.target_binding = {
    kind: "recurring_action",
    label: "Reunions du mardi et jeudi",
    related_plan_item_id: null,
    target_plan_item_id: null,
    target_action_family_key: null,
    target_generated_temp_id: null,
    recurrence_hint: "mardi et jeudi",
    date_or_window_hint: null,
    evidence: ["mardi", "jeudi"],
  };
  draft.draft.follow_up = {
    ...draft.draft.follow_up,
    duration_days: 7,
    schedule_plan: {
      mode: "specific_weekdays",
      duration_days: 7,
      local_time_hhmm: "08:30",
      scheduled_days: ["tue", "thu"],
      local_dates: [],
      timing_relation: "before",
      reason: "Avant les reunions recurrentes.",
    },
  };
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-weekdays",
    operation_type: "select_state_potion",
    draft,
    source_message_id: "yes-weekdays",
    pending_confirmation_id: "pending-weekdays",
    secret: SECRET,
  });
  let scheduled: Array<{
    local_date: string;
    local_time_hhmm: string;
    reminder_instruction: string;
  }> = [];
  const executed = await executeActivateStatePotion({
    operation_id: "op-weekdays",
    user_id: "u1",
    draft,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_potion_activation: async ({ scheduled_followups }) => {
      scheduled = scheduled_followups;
      return {
        potion_session_id: "p-weekdays",
        recurring_reminder_id: "r-weekdays",
        scheduled_checkin_ids: scheduled_followups.map((_, index) =>
          `s-weekdays-${index}`
        ),
      };
    },
    secret: SECRET,
    now_iso: "2026-05-04T08:00:00.000Z",
  });
  assertEquals(executed.status, "executed");
  assertEquals(
    scheduled.map((followup) => followup.local_date),
    ["2026-05-05", "2026-05-07"],
  );
  assertEquals(
    scheduled.every((followup) => followup.local_time_hhmm === "08:30"),
    true,
  );
});

Deno.test("select_state_potion proposes two options before draft when potion is not explicit", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "j'ai besoin d'une potion",
    trigger_message_id: "m-choice",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      shortlist: [
        {
          potion_type: "apaisement",
          reason: "pression forte",
          fit_confidence: "high",
          evidence: ["stress"],
        },
        {
          potion_type: "clarte",
          reason: "mental charge",
          fit_confidence: "medium",
          evidence: ["flou"],
        },
      ],
      generated_user_message:
        "Je te propose apaisement si la pression domine, ou clarte si c'est surtout le flou. Tu choisis laquelle ?",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "ask_question");
  assertEquals(output.phase, "potion_choice");
  assertEquals(output.state_patch.intake_state?.shortlist.options.length, 2);

  const chosen = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "apaisement",
    trigger_message_id: "m-choice-2",
    safety_pregate_risk_band: "none",
    operation_input: output.state_patch.operation_input,
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: "apaisement",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(chosen.status, "pending_confirmation");
  assertEquals(chosen.draft?.draft.potion_type, "apaisement");
});

Deno.test("select_state_potion asks two chat detail fields before draft", async () => {
  const askDetails = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux la potion de courage",
    trigger_message_id: "m-details-1",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "fear_avoidance",
      selected_potion: "courage",
      omit_detail_answers: true,
      generated_user_message:
        "Pour te faire une potion de courage juste, dis-moi ce que tu evites et ce qui bloque le plus.",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(askDetails.status, "ask_question");
  assertEquals(askDetails.phase, "detail_intake");
  assertEquals(askDetails.state_patch.missing_slots, [
    "potion_detail:avoidance_target",
    "potion_detail:blocker_kind",
  ]);
  assertEquals(
    askDetails.next_question?.question?.includes("ce que tu evites"),
    true,
  );

  const ready = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "J'evite d'envoyer le message a mon associe, surtout par peur du conflit.",
    trigger_message_id: "m-details-2",
    safety_pregate_risk_band: "none",
    operation_input: askDetails.state_patch.operation_input,
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "fear_avoidance",
      selected_potion: "courage",
      detail_answers: [
        {
          question_id: "avoidance_target",
          label: "Qu'est-ce que tu evites en ce moment ?",
          answer: "Envoyer le message a mon associe.",
          evidence: ["message associe"],
        },
        {
          question_id: "blocker_kind",
          label: "Qu'est-ce qui bloque le plus ?",
          answer: "La peur du conflit.",
          evidence: ["peur du conflit"],
        },
      ],
    }),
    draft_generator: async (input) => {
      assertEquals(input.details?.required_question_ids, [
        "avoidance_target",
        "blocker_kind",
      ]);
      assertEquals(input.details?.answers.length, 2);
      return await structuredStatePotionDraftGenerator()(input);
    },
  });
  assertEquals(ready.status, "pending_confirmation");
  assertEquals(ready.draft?.draft.potion_type, "courage");
});

Deno.test("select_state_potion blocks missing state, safety and writes without Oui", async () => {
  const ask = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "j'ai besoin d'une potion",
    trigger_message_id: "m1",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      generated_user_message:
        "C'est plutot stress, honte, peur, flou, durete envers toi, ou decrochage ?",
    }),
  });
  assertEquals(ask.status, "ask_question");
  const invalidRecommendation = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "recommendation",
    source: "recommendation_tool",
    operation_input: { potion_type: "apaisement" },
    trigger_message_id: "m2",
    safety_pregate_risk_band: "none",
  });
  assertEquals(invalidRecommendation.status, "invalid_recommendation_payload");
  const readyRecommendation = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "recommendation",
    source: "recommendation_tool",
    operation_input: {
      state: { kind: "stress_pressure", intensity: "medium" },
      potion_type: "apaisement",
      details: {
        required_question_ids: ["pressure_source", "pressure_state"],
        answers: [
          {
            question_id: "pressure_source",
            label: "Qu'est-ce qui te met le plus sous pression la ?",
            answer: "Une accumulation.",
            evidence: ["structured_recommendation"],
          },
          {
            question_id: "pressure_state",
            label: "Tu te sens plutot comment ?",
            answer: "Submerge.",
            evidence: ["structured_recommendation"],
          },
        ],
      },
    },
    trigger_message_id: "m2-ready",
    safety_pregate_risk_band: "none",
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(readyRecommendation.status, "pending_confirmation");
  const safety = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux me faire du mal, lance une potion",
    trigger_message_id: "m3",
    safety_pregate_risk_band: "critical",
  });
  assertEquals(safety.status, "blocked_by_safety");
  const ready = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je suis stresse, fais-moi une potion",
    trigger_message_id: "m4",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: "apaisement",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  if (ready.status !== "pending_confirmation") {
    throw new Error("expected_ready");
  }
  let writes = 0;
  const noToken = await executeActivateStatePotion({
    operation_id: String(ready.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: ready.draft!,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_potion_activation: async () => {
      writes++;
      return {
        potion_session_id: "p",
        recurring_reminder_id: "r",
        scheduled_checkin_ids: Array.from({ length: 7 }, (_, i) => `s${i}`),
      };
    },
    secret: SECRET,
  });
  assertEquals(noToken.status, "blocked");
  assertEquals(writes, 0);
});
