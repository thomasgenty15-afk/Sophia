import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
import type { PotionSessionSelectorInput } from "../_shared/operation_payload_builder.ts";
import { formatPotionBaseContextForPrompt } from "../../../../_shared/potion-base-context.ts";
import {
  buildStatePotionCatalogPrompt,
  STATE_POTION_TYPES,
} from "./catalog.ts";
import {
  fillSelectStatePotionSlotsWithAi,
  runSelectStatePotionIntake,
} from "./intake.ts";
import { hasExplicitStatePotionActivationApproval } from "./draft_validation.ts";
import {
  buildPotionDetailSubskillPrompt,
  chatDetailQuestionIds,
  isActionAwarePotion,
  POTION_DETAIL_SUBSKILLS,
  SUPPORT_TIMING_SLOT,
} from "./subskills/potion_detail_intake.ts";
import { buildPotionFollowUpSchedulePlannerPrompt } from "./subskills/follow_up_schedule_planner.ts";
import { normalizePotionSessionDraft } from "./generator.ts";
import { maybeRunSelectStatePotionOperation } from "./router.ts";
import { renderSelectStatePotionSkillResult } from "./renderer.ts";
import { loadSelectStatePotionFrameFromTempMemory } from "./state.ts";
import {
  structuredStatePotionDraftGenerator,
  structuredStatePotionSlotFiller,
} from "./test_helpers.ts";

Deno.test("select_state_potion renderer blocks success language without committed effect", () => {
  const message = renderSelectStatePotionSkillResult({
    status: "blocked",
    user_intent: "activate",
    reply: "C'est fait, potion activée.",
    committed_effects: [],
  } as any);
  assertEquals(message.includes("C'est fait"), false);
  assertEquals(message.includes("activée"), false);
});

const fakeSafetyPregate = {
  risk_band: "none",
  reason_codes: [],
  evidence: [],
} as any;

const fakeSupabase = {} as any;

const selectPotionRouteDecision = {
  response_owner: "tool_skill",
  selected_handler: "select_state_potion",
  reason_code: "test",
  direct_effects_to_run: [],
  blocked_paths: [],
} as any;

function skippedOptionalFreeText(label = "Champ libre optionnel") {
  return {
    question_id: "optional_free_text",
    label,
    required: false,
    status: "skipped_optional" as const,
    proposed_value: null,
    locked_value: null,
    user_evidence: ["skip_optional"],
    needs_user_confirmation: false,
    evidence: ["skip_optional"],
  };
}

Deno.test("select_state_potion catalog gives AI rich potion context and question examples", () => {
  const catalog = buildStatePotionCatalogPrompt();
  assertStringIncludes(catalog, "Catalogue canonique des potions d'etat");
  assertStringIncludes(
    catalog,
    "Le suivi par defaut est un reminder court sur 7 jours",
  );
  assertEquals(catalog.includes("options:"), false);
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
      assert(question.label.length <= 120);
    }
  }
  assertStringIncludes(
    POTION_DETAIL_SUBSKILLS.rappel.extraction_rules.join(" "),
    "moment a proteger",
  );
});

Deno.test("select_state_potion prompts keep internal slots out of visible wording", () => {
  const detailPrompt = buildPotionDetailSubskillPrompt("courage");
  const schedulePrompt = buildPotionFollowUpSchedulePlannerPrompt("courage");
  assertEquals(detailPrompt.includes("Options:"), false);
  assertEquals(
    detailPrompt.includes("peur du résultat, du regard"),
    false,
  );
  assertEquals(
    schedulePrompt.includes(
      "est-ce un moment precis ou une situation qui revient ?",
    ),
    false,
  );
  assertStringIncludes(
    schedulePrompt,
    "Ne formule pas en categories ponctuel/recurrent",
  );
});

Deno.test("clarte detail prompt centers plan meaning and deep why", () => {
  const definition = POTION_DEFINITIONS.clarte;
  const detailPrompt = buildPotionDetailSubskillPrompt("clarte");
  assertEquals(
    definition.questionnaire.map((question) => question.id),
    ["plan_meaning_loss_reason"],
  );
  assertEquals(definition.free_text_label, null);
  assertEquals(definition.free_text_placeholder, null);
  assertEquals(definition.free_text_required, false);
  assertEquals(chatDetailQuestionIds("clarte"), ["plan_meaning_loss_reason"]);
  assertStringIncludes(detailPrompt, "plan");
  assertStringIncludes(detailPrompt, "pourquoi profond");
  assertStringIncludes(detailPrompt, "n'a plus de sens");
  assertStringIncludes(detailPrompt, "plan_meaning_loss_reason");
  assertEquals(detailPrompt.includes("output_style"), false);
  assertEquals(detailPrompt.includes("optional_free_text"), false);
});

Deno.test("select_state_potion detail orchestrator only accepts the current potion field", async () => {
  const output = await fillSelectStatePotionSlotsWithAi({
    user_id: "u-incremental",
    message:
      "Je suis en vrac, je veux savoir quoi faire et ressortir avec une priorité.",
    recent_messages: [],
    current_state: null,
    operation_input: null,
    timezone: "Europe/Paris",
    channel: "whatsapp",
  }, {
    router: async () => ({
      current_sub_skill: "detail_intake",
      state_patch: {
        state: {
          status: "identified",
          kind: "confusion_overload",
          intensity: "medium",
          confidence: "high",
          evidence: ["confusion"],
        },
        selected_potion: {
          status: "identified",
          value: "clarte",
          confidence: "high",
          evidence: ["clarte"],
        },
        missing_slots: ["potion_detail:plan_meaning_loss_reason"],
        confidence: "high",
      },
      missing_slots: ["potion_detail:plan_meaning_loss_reason"],
      confidence: "high",
      generated_user_message: null,
      evidence: ["router"],
    }),
    detail: async () => ({
      current_sub_skill: "draft_generation",
      state_patch: {
        details: {
          status: "identified",
          required_question_ids: ["plan_meaning_loss_reason"],
          answers: [
            {
              question_id: "plan_meaning_loss_reason",
              label:
                "Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ?",
              answer:
                "Je ne vois plus le lien entre mes actions et mon pourquoi profond.",
              evidence: ["field_1"],
            },
          ],
          evidence: ["detail_attempted_one_shot"],
        },
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["detail"],
    }),
  });

  const state = output?.state_patch as any;
  assert(output);
  assertEquals(state.details.answers.length, 1);
  assertEquals(
    state.details.answers[0].question_id,
    "plan_meaning_loss_reason",
  );
  assertEquals(state.current_sub_skill, "draft_generation");
});

Deno.test("select_state_potion preserves later user-provided detail as proposed only", async () => {
  const output = await fillSelectStatePotionSlotsWithAi({
    user_id: "u-opportunistic",
    message:
      "Je veux une potion de courage: j'evite d'envoyer un message a mon manager, et ce qui bloque c'est le regard des autres.",
    recent_messages: [],
    current_state: null,
    operation_input: null,
    timezone: "Europe/Paris",
    channel: "whatsapp",
  }, {
    router: async () => ({
      current_sub_skill: "detail_intake",
      state_patch: {
        state: {
          status: "identified",
          kind: "fear_avoidance",
          intensity: "medium",
          confidence: "high",
          evidence: ["fear"],
        },
        selected_potion: {
          status: "identified",
          value: "courage",
          confidence: "high",
          evidence: ["courage"],
        },
        details: {
          status: "missing",
          required_question_ids: ["avoidance_target", "blocker_kind"],
          fields: [],
          answers: [],
          evidence: ["router"],
        },
        missing_slots: ["potion_detail:avoidance_target"],
        confidence: "high",
      },
      missing_slots: ["potion_detail:avoidance_target"],
      confidence: "high",
      generated_user_message: null,
      evidence: ["router"],
    }),
    detail: async () => ({
      current_sub_skill: "detail_intake",
      state_patch: {
        details: {
          status: "missing",
          required_question_ids: ["avoidance_target", "blocker_kind"],
          answers: [
            {
              question_id: "avoidance_target",
              label: "Qu'est-ce que tu evites en ce moment ?",
              answer: "envoyer un message a mon manager",
              evidence: ["message manager"],
            },
            {
              question_id: "blocker_kind",
              label: "Qu'est-ce qui bloque le plus ?",
              answer: "La peur du regard des autres",
              evidence: ["regard des autres"],
            },
          ],
          fields: [{
            question_id: "avoidance_target",
            label: "Qu'est-ce que tu evites en ce moment ?",
            required: true,
            status: "locked",
            proposed_value: null,
            locked_value: "envoyer un message a mon manager",
            user_evidence: ["message manager"],
            needs_user_confirmation: false,
            evidence: ["message manager"],
          }, {
            question_id: "blocker_kind",
            label: "Qu'est-ce qui bloque le plus ?",
            required: true,
            status: "locked",
            proposed_value: null,
            locked_value: "La peur du regard des autres",
            user_evidence: ["regard des autres"],
            needs_user_confirmation: false,
            evidence: ["regard des autres"],
          }],
          evidence: ["detail_attempted_multi_field"],
        },
      },
      missing_slots: ["potion_detail:blocker_kind"],
      confidence: "high",
      generated_user_message:
        "Je garde ça. Et pour ce qui bloque, je comprends: la peur du regard des autres, c'est bien ça ?",
      evidence: ["detail"],
    }),
  });

  const state = output?.state_patch as any;
  assert(output);
  assertEquals(state.details.answers.map((answer: any) => answer.question_id), [
    "avoidance_target",
  ]);
  const avoidance = state.details.fields.find((field: any) =>
    field.question_id === "avoidance_target"
  );
  const blocker = state.details.fields.find((field: any) =>
    field.question_id === "blocker_kind"
  );
  assertEquals(avoidance.status, "locked");
  assertEquals(blocker.status, "proposed");
  assertEquals(blocker.locked_value, null);
  assertEquals(blocker.proposed_value, "La peur du regard des autres");
  assertEquals(blocker.needs_user_confirmation, true);
  assertEquals(state.missing_slots, ["potion_detail:blocker_kind"]);
  assertEquals(state.current_sub_skill, "detail_intake");
});

Deno.test("select_state_potion proposed field stays in detail intake and does not draft", async () => {
  let draftCalled = false;
  const result = await runSelectStatePotionIntake({
    user_id: "u-proposed",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Je suis en vrac.",
    trigger_message_id: "m-proposed",
    safety_pregate_risk_band: "none",
    slot_filler: async () => ({
      current_sub_skill: "detail_intake",
      state_patch: {
        state: {
          status: "identified",
          kind: "confusion_overload",
          intensity: "medium",
          confidence: "high",
          evidence: ["Je suis en vrac."],
        },
        selected_potion: {
          status: "identified",
          value: "clarte",
          confidence: "high",
          evidence: ["clarte"],
        },
        details: {
          status: "missing",
          required_question_ids: ["plan_meaning_loss_reason"],
          fields: [{
            question_id: "plan_meaning_loss_reason",
            label:
              "Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ?",
            required: true,
            status: "proposed",
            proposed_value:
              "Je ne vois plus bien le lien entre les actions de mon plan et mon pourquoi profond.",
            locked_value: null,
            user_evidence: ["Je suis en vrac."],
            needs_user_confirmation: true,
            evidence: ["state_is_too_vague"],
          }],
          answers: [],
          evidence: ["proposed_not_locked"],
        },
        missing_slots: ["potion_detail:plan_meaning_loss_reason"],
        generated_user_message:
          "Je te proposerais: “Je ne vois plus bien le lien entre les actions de mon plan et mon pourquoi profond.” Tu veux garder ça ou le dire autrement ?",
        confidence: "medium",
      },
      missing_slots: ["potion_detail:plan_meaning_loss_reason"],
      confidence: "medium",
      generated_user_message:
        "Je te proposerais: “Je ne vois plus bien le lien entre les actions de mon plan et mon pourquoi profond.” Tu veux garder ça ou le dire autrement ?",
      evidence: ["proposed_not_locked"],
    }),
    draft_generator: async () => {
      draftCalled = true;
      return null as any;
    },
  });

  assertEquals(result.status, "ask_question");
  assertEquals(result.phase, "detail_intake");
  assertEquals(draftCalled, false);
  assertStringIncludes(
    result.next_question?.question ?? "",
    "actions de mon plan",
  );
});

Deno.test("select_state_potion rejects robotic confirmation voice", () => {
  const baseDraft = {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    draft: {
      potion_type: "rappel",
      title: "Rappel doux",
      opening_prompt: "Respire.",
      instant_support_message: "On revient doucement.",
      potion_info_message: "Le suivi t'aide à garder le lien avec ta routine.",
      expected_duration: "short",
      why_this_potion: "Tu décroches de ta routine du soir.",
      target_binding: {
        kind: "none",
        label: null,
        related_plan_item_id: null,
        target_plan_item_id: null,
        target_action_family_key: null,
        target_generated_temp_id: null,
        recurrence_hint: null,
        date_or_window_hint: null,
        evidence: ["test"],
      },
      follow_up: {
        reminder_instruction: "Revenir à la marche du soir.",
        local_time_hhmm: "19:00",
        duration_days: 7,
        reason_for_time: "Avant la soirée.",
        schedule_plan: {
          mode: "daily_series",
          duration_days: 7,
          local_time_hhmm: "19:00",
          scheduled_days: [],
          local_dates: [],
          timing_relation: "daily",
          reason: "Soutien quotidien.",
        },
      },
    },
    confirmation_actions: ["yes", "no"],
  };
  const input = {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: { kind: "decrochage", intensity: "medium", evidence: ["test"] },
    potion_type: "rappel",
    context: {},
    constraints: [],
    forbidden: [],
  } satisfies PotionSessionSelectorInput;
  const badMessages = [
    "Je peux t'envoyer un petit signe chaque soir. On essaie ça ?",
    "Je te propose d'activer cette Potion de Rappel. Ça te convient ?",
    "Je t'enverrai un petit mot à 19h. On lance ça ?",
    "Je t'envoie un appui unique à 07h45. Dis-moi si ça te va pour qu'on avance.",
    "Je me manifesterai demain à 07h45. On se cale sur ce rendez-vous unique ?",
    "Je viendrai demain à 07h45. Dis-moi si on se retrouve à cette heure-là.",
  ];
  for (const confirmation_message of badMessages) {
    let failed = false;
    try {
      normalizePotionSessionDraft(
        { ...baseDraft, confirmation_message },
        input,
      );
    } catch (error) {
      failed = error instanceof Error &&
        error.message === "potion_confirmation_template_voice";
    }
    assertEquals(failed, true, confirmation_message);
  }
});

Deno.test("select_state_potion rejects internal placeholders in visible draft text", () => {
  const baseDraft = {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    draft: {
      potion_type: "rappel",
      title: "Rappel doux",
      opening_prompt: "Respire.",
      instant_support_message: "On revient doucement.",
      potion_info_message: "Le suivi t'aide à garder le lien avec ta routine.",
      expected_duration: "short",
      why_this_potion: "current_user_message: tu décroches de ta routine.",
      target_binding: {
        kind: "none",
        label: null,
        related_plan_item_id: null,
        target_plan_item_id: null,
        target_action_family_key: null,
        target_generated_temp_id: null,
        recurrence_hint: null,
        date_or_window_hint: null,
        evidence: ["test"],
      },
      follow_up: {
        reminder_instruction: "Revenir à la marche du soir.",
        local_time_hhmm: "19:00",
        duration_days: 7,
        reason_for_time: "Avant la soirée.",
        schedule_plan: {
          mode: "daily_series",
          duration_days: 7,
          local_time_hhmm: "19:00",
          scheduled_days: [],
          local_dates: [],
          timing_relation: "daily",
          reason: "Soutien quotidien.",
        },
      },
    },
    confirmation_message:
      "Tu décroches de ta routine du soir; garde ce rappel à 19h.",
    confirmation_actions: ["yes", "no"],
  };
  const input = {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: { kind: "decrochage", intensity: "medium", evidence: ["test"] },
    potion_type: "rappel",
    context: {},
    constraints: [],
    forbidden: [],
  } satisfies PotionSessionSelectorInput;

  let failed = false;
  try {
    normalizePotionSessionDraft(baseDraft, input);
  } catch (error) {
    failed = error instanceof Error &&
      error.message === "potion_visible_text_internal_why_this_potion";
  }
  assertEquals(failed, true);
});

Deno.test("select_state_potion draft approval requires explicit activation", () => {
  assertEquals(
    hasExplicitStatePotionActivationApproval(
      "Le probleme de clarte: j'ai trop de pistes ouvertes et je bloque demain matin.",
    ),
    false,
  );
  assertEquals(
    hasExplicitStatePotionActivationApproval(
      "Avant validation, je veux que le rappel reste doux.",
    ),
    false,
  );
  assertEquals(
    hasExplicitStatePotionActivationApproval(
      "Oui, active cette potion de clarte.",
    ),
    true,
  );
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

Deno.test("select_state_potion has one detail subskill per potion with all UI fields", () => {
  for (const potionType of STATE_POTION_TYPES) {
    const subskill = POTION_DETAIL_SUBSKILLS[potionType];
    assertEquals(subskill.potion_type, potionType);
    assertEquals(subskill.sub_skill, `${potionType}_intake`);
    assertEquals(
      subskill.required_question_ids.length,
      POTION_DEFINITIONS[potionType].questionnaire.length,
    );
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

Deno.test("rappel active intake has exactly two fields and no support/free-text slot", async () => {
  const definition = POTION_DEFINITIONS.rappel;
  assertEquals(
    definition.questionnaire.map((question) => question.id),
    ["drift_target", "drift_style"],
  );
  assertEquals(definition.free_text_label, null);
  assertEquals(definition.free_text_placeholder, null);
  assertEquals(definition.free_text_required, false);
  assertEquals(POTION_DETAIL_SUBSKILLS.rappel.required_question_ids, [
    "drift_target",
    "drift_style",
  ]);
  assertEquals(chatDetailQuestionIds("rappel"), [
    "drift_target",
    "drift_style",
  ]);
  assertEquals(isActionAwarePotion("rappel"), false);

  const detailPrompt = buildPotionDetailSubskillPrompt("rappel");
  assertEquals(detailPrompt.includes("support_need"), false);
  assertEquals(
    detailPrompt.includes("Qu'est-ce qui t'aiderait le plus"),
    false,
  );
  assertEquals(detailPrompt.includes("optional_free_text"), false);

  const output = await runSelectStatePotionIntake({
    user_id: "u-rappel-two-fields",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Je sens que je décroche de mon sport, je repousse tout le temps.",
    trigger_message_id: "m-rappel-two-fields",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "decrochage",
      selected_potion: "rappel",
      detail_answers: [{
        question_id: "drift_target",
        label: "Par rapport a quoi tu sens que tu decroches ?",
        answer: "mon sport",
        evidence: ["mon sport"],
      }, {
        question_id: "drift_style",
        label: "Tu decroches plutot comment ?",
        answer: "repousse",
        evidence: ["repousse"],
      }],
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.intake_state?.details.required_question_ids, [
    "drift_target",
    "drift_style",
  ]);
  assertEquals(
    output.state_patch.intake_state?.missing_slots.includes(
      "potion_detail:optional_free_text",
    ),
    false,
  );
  assertEquals(
    output.state_patch.intake_state?.details.answers.some((answer) =>
      answer.question_id === "support_need"
    ),
    false,
  );
});

Deno.test("courage active intake has exactly two fields and no plan scope in chat", () => {
  const definition = POTION_DEFINITIONS.courage;
  assertEquals(
    definition.questionnaire.map((question) => question.id),
    ["avoidance_target", "blocker_kind"],
  );
  assertEquals(definition.free_text_label, null);
  assertEquals(definition.free_text_placeholder, null);
  assertEquals(definition.free_text_required, false);
  assertEquals(POTION_DETAIL_SUBSKILLS.courage.required_question_ids, [
    "avoidance_target",
    "blocker_kind",
  ]);
  assertEquals(chatDetailQuestionIds("courage"), [
    "avoidance_target",
    "blocker_kind",
  ]);
  assertEquals(isActionAwarePotion("courage"), false);

  const detailPrompt = buildPotionDetailSubskillPrompt("courage");
  assertEquals(detailPrompt.includes("desired_help"), false);
});

Deno.test("guerison active intake has exactly two fields and no repair/free-text slot", () => {
  const definition = POTION_DEFINITIONS.guerison;
  assertEquals(
    definition.questionnaire.map((question) => question.id),
    ["recent_hurt", "dominant_feeling"],
  );
  assertEquals(definition.free_text_label, null);
  assertEquals(definition.free_text_placeholder, null);
  assertEquals(definition.free_text_required, false);
  assertEquals(POTION_DETAIL_SUBSKILLS.guerison.required_question_ids, [
    "recent_hurt",
    "dominant_feeling",
  ]);
  assertEquals(chatDetailQuestionIds("guerison"), [
    "recent_hurt",
    "dominant_feeling",
  ]);
  assertEquals(isActionAwarePotion("guerison"), false);

  const detailPrompt = buildPotionDetailSubskillPrompt("guerison");
  assertEquals(detailPrompt.includes("repair_need"), false);
  assertEquals(
    detailPrompt.includes("Tu as surtout besoin de quoi maintenant"),
    false,
  );
  assertStringIncludes(detailPrompt, "Ne demande jamais si c'est lie au plan");
});

Deno.test("amour active intake has exactly two fields and no need/free-text slot", async () => {
  const definition = POTION_DEFINITIONS.amour;
  assertEquals(
    definition.questionnaire.map((question) => question.id),
    ["love_lack_context", "love_state"],
  );
  assertEquals(definition.free_text_label, null);
  assertEquals(definition.free_text_placeholder, null);
  assertEquals(definition.free_text_required, false);
  assertEquals(POTION_DETAIL_SUBSKILLS.amour.required_question_ids, [
    "love_lack_context",
    "love_state",
  ]);
  assertEquals(chatDetailQuestionIds("amour"), [
    "love_lack_context",
    "love_state",
  ]);
  assertEquals(isActionAwarePotion("amour"), false);

  const detailPrompt = buildPotionDetailSubskillPrompt("amour");
  assertStringIncludes(
    detailPrompt,
    "Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?",
  );
  assertStringIncludes(detailPrompt, "love_lack_context");
  assertEquals(detailPrompt.includes(["love", "need"].join("_")), false);
  assertEquals(
    detailPrompt.includes("Tu as surtout besoin de quoi"),
    false,
  );
  assertEquals(
    detailPrompt.includes(
      "Comment est-ce " + "que tu te parles en ce moment ?",
    ),
    false,
  );
  assertEquals(detailPrompt.includes("optional_free_text"), false);
  assertStringIncludes(
    detailPrompt,
    "ne demande jamais lie au plan/hors plan",
  );

  const output = await runSelectStatePotionIntake({
    user_id: "u-amour-two-fields",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je manque d'amour autour de mon ecriture et je suis dur avec moi.",
    trigger_message_id: "m-amour-two-fields",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "self_harshness",
      selected_potion: "amour",
      detail_answers: [{
        question_id: "love_lack_context",
        label:
          "Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?",
        answer: "mon ecriture que je juge nulle",
        evidence: ["mon ecriture"],
      }, {
        question_id: "love_state",
        label: "Tu te sens surtout comment ?",
        answer: "dur",
        evidence: ["dur avec moi"],
      }],
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.intake_state?.details.required_question_ids, [
    "love_lack_context",
    "love_state",
  ]);
  assertEquals(
    output.state_patch.intake_state?.missing_slots.includes(
      "potion_detail:optional_free_text",
    ),
    false,
  );
  assertEquals(
    output.state_patch.intake_state?.details.answers.some((answer) =>
      answer.question_id === ["love", "need"].join("_")
    ),
    false,
  );
});

Deno.test("apaisement active intake has exactly two fields and leaves plan scope to platform", async () => {
  const definition = POTION_DEFINITIONS.apaisement;
  assertEquals(
    definition.questionnaire.map((question) => question.id),
    ["pressure_source", "pressure_state"],
  );
  assertEquals(definition.free_text_label, null);
  assertEquals(definition.free_text_placeholder, null);
  assertEquals(definition.free_text_required, false);
  assertEquals(POTION_DETAIL_SUBSKILLS.apaisement.required_question_ids, [
    "pressure_source",
    "pressure_state",
  ]);
  assertEquals(chatDetailQuestionIds("apaisement"), [
    "pressure_source",
    "pressure_state",
  ]);
  assertEquals(isActionAwarePotion("apaisement"), false);

  const detailPrompt = buildPotionDetailSubskillPrompt("apaisement");
  assertStringIncludes(detailPrompt, "pressure_source");
  assertStringIncludes(detailPrompt, "pressure_state");
  assertEquals(detailPrompt.includes("calm_need"), false);
  assertEquals(detailPrompt.includes("optional_free_text"), false);
  assertStringIncludes(
    detailPrompt,
    "ce choix appartient a la plateforme",
  );

  const output = await runSelectStatePotionIntake({
    user_id: "u-apaisement-two-fields",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je suis sous pression a cause d'une discussion et je me sens a cran.",
    trigger_message_id: "m-apaisement-two-fields",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: "apaisement",
      detail_answers: [{
        question_id: "pressure_source",
        label: "Qu'est-ce qui te met le plus sous pression la ?",
        answer: "une discussion qui me comprime",
        evidence: ["discussion"],
      }, {
        question_id: "pressure_state",
        label: "Tu te sens plutot comment ?",
        answer: "a_cran",
        evidence: ["a cran"],
      }],
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.intake_state?.details.required_question_ids, [
    "pressure_source",
    "pressure_state",
  ]);
  assertEquals(
    output.state_patch.intake_state?.missing_slots.includes(
      "potion_detail:optional_free_text",
    ),
    false,
  );
  assertEquals(
    output.state_patch.intake_state?.details.answers.some((answer) =>
      answer.question_id === "calm_need"
    ),
    false,
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

Deno.test("select_state_potion asks all potion UI detail fields before draft", async () => {
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

Deno.test("select_state_potion courage does not ask support timing before draft", async () => {
  const ready = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "C'est un message a mon associe, j'ai peur que ca parte en conflit.",
    trigger_message_id: "m-timing-1",
    safety_pregate_risk_band: "none",
    operation_input: {
      state: {
        kind: "fear_avoidance",
        intensity: "medium",
        evidence: ["peur conflit"],
      },
      potion_type: "courage",
    },
    slot_filler: async () => ({
      current_sub_skill: "detail_intake",
      state_patch: {
        state: {
          status: "identified",
          kind: "fear_avoidance",
          intensity: "medium",
          confidence: "high",
          evidence: ["peur conflit"],
        },
        selected_potion: {
          status: "identified",
          value: "courage",
          confidence: "high",
          evidence: ["courage"],
        },
        details: {
          status: "identified",
          required_question_ids: [
            "avoidance_target",
            "blocker_kind",
          ],
          answers: [{
            question_id: "avoidance_target",
            label: "Qu'est-ce que tu evites en ce moment ?",
            answer: "Envoyer le message a mon associe.",
            evidence: ["message associe"],
          }, {
            question_id: "blocker_kind",
            label: "Qu'est-ce qui bloque le plus ?",
            answer: "La peur du conflit.",
            evidence: ["conflit"],
          }],
          optional_free_text: skippedOptionalFreeText(),
          evidence: ["detail"],
        },
        missing_slots: [],
        generated_user_message: null,
        confidence: "high",
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["detail"],
    }),
    draft_generator: async (input) => {
      assertEquals(input.details?.required_question_ids, [
        "avoidance_target",
        "blocker_kind",
      ]);
      return await structuredStatePotionDraftGenerator()(input);
    },
  });

  assertEquals(ready.status, "pending_confirmation");
  assertEquals(
    ready.state_patch.missing_slots.includes(SUPPORT_TIMING_SLOT),
    false,
  );
});

Deno.test("select_state_potion clarte stops before legacy draft generation", async () => {
  let draftGeneratorCalled = false;
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Surtout savoir par ou commencer pour la reunion demain matin.",
    trigger_message_id: "m-vague-timing",
    safety_pregate_risk_band: "none",
    operation_input: {
      state: {
        kind: "confusion_overload",
        intensity: "medium",
        evidence: ["tout se melange"],
      },
      potion_type: "clarte",
    },
    slot_filler: async () => ({
      current_sub_skill: "draft_generation",
      state_patch: {
        state: {
          status: "identified",
          kind: "confusion_overload",
          intensity: "medium",
          confidence: "high",
          evidence: ["tout se melange"],
        },
        selected_potion: {
          status: "identified",
          value: "clarte",
          confidence: "high",
          evidence: ["potion de clarte"],
        },
        details: {
          status: "identified",
          required_question_ids: ["plan_meaning_loss_reason"],
          answers: [{
            question_id: "plan_meaning_loss_reason",
            label:
              "Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ?",
            answer:
              "Je ne vois plus le lien entre la reunion de demain et mon pourquoi profond.",
            evidence: ["reunion demain matin"],
          }],
          optional_free_text: skippedOptionalFreeText(),
          evidence: ["detail"],
        },
        missing_slots: [],
        generated_user_message: null,
        confidence: "high",
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["detail"],
    }),
    draft_generator: async (input) => {
      draftGeneratorCalled = true;
      const draft = await structuredStatePotionDraftGenerator()(input);
      if (!draft) throw new Error("missing_structured_draft");
      const adjusted = structuredClone(draft);
      adjusted.draft.target_binding = {
        ...adjusted.draft.target_binding,
        kind: "one_off_action",
        label: "reunion demain matin",
        date_or_window_hint: "demain matin",
        evidence: ["reunion demain matin"],
      };
      adjusted.draft.follow_up = {
        ...adjusted.draft.follow_up,
        local_time_hhmm: "08:30",
        schedule_plan: {
          mode: "single_before_event",
          duration_days: null,
          local_time_hhmm: "08:30",
          scheduled_days: [],
          local_dates: ["2026-05-23"],
          timing_relation: "before",
          reason: "Horaire deduit depuis une fenetre vague.",
        },
      };
      return adjusted;
    },
  });

  assertEquals(output.status, "handoff_ready");
  assertEquals(output.phase, "handoff_ready");
  assertEquals(
    output.state_patch.missing_slots.includes(SUPPORT_TIMING_SLOT),
    false,
  );
  assertEquals(output.draft, undefined);
  assertEquals(draftGeneratorCalled, false);
  assertEquals(
    output.state_patch.intake_state?.details.answers[0]?.question_id,
    "plan_meaning_loss_reason",
  );
});

Deno.test("F4: le router potion reçoit l'historique récent pour ne pas redemander un slot déjà donné (A3-r11 T4)", async () => {
  let capturedRecent:
    | Array<{ role: "user" | "assistant"; content: string }>
    | undefined;
  const recent: Array<{ role: "user" | "assistant"; content: string }> = [
    {
      role: "user",
      content: "Apaisement. Oui, lance-la maintenant, version courte.",
    },
    { role: "assistant", content: "Ok, apaisement en version courte." },
    { role: "user", content: "Objectif + première étape. Avant 18h." },
  ];
  await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Objectif + première étape. Avant 18h.",
    trigger_message_id: "m-f4",
    safety_pregate_risk_band: "none",
    recent_messages: recent,
    slot_filler: async (input) => {
      capturedRecent = input.recent_messages;
      return {
        current_sub_skill: "potion_choice",
        state_patch: {},
        missing_slots: ["potion_type"],
        confidence: "low",
        generated_user_message: "Quelle potion ?",
      } as any;
    },
  });
  // Le slot filler (router IA) DOIT recevoir l'historique récent contenant le
  // choix "Apaisement", pour pouvoir éviter de re-poser la question du type.
  assertEquals(capturedRecent, recent);
});

Deno.test("select_state_potion preserves selected potion when reminder wording appears during active flow", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux seulement ce rappel-la demain a 08h15 pour ma potion de courage.",
    trigger_message_id: "m-locked-potion",
    safety_pregate_risk_band: "none",
    operation_input: {
      intake_state: {
        skill_id: "select_state_potion",
        current_sub_skill: "detail_intake",
        state: {
          status: "identified",
          kind: "fear_avoidance",
          intensity: "medium",
          confidence: "high",
          evidence: ["peur conflit"],
        },
        explicit_potion_request: {
          status: "identified",
          potion_type: "courage",
          evidence: ["potion de courage"],
        },
        shortlist: { status: "missing", options: [], evidence: [] },
        selected_potion: {
          status: "identified",
          value: "courage",
          confidence: "high",
          evidence: ["potion de courage"],
        },
        details: {
          status: "missing",
          required_question_ids: [
            "avoidance_target",
            "blocker_kind",
          ],
          answers: [{
            question_id: "avoidance_target",
            label: "Qu'est-ce que tu evites en ce moment ?",
            answer: "Envoyer le message a mon associe.",
            evidence: ["message"],
          }, {
            question_id: "blocker_kind",
            label: "Qu'est-ce qui bloque le plus ?",
            answer: "La peur du conflit.",
            evidence: ["conflit"],
          }],
          optional_free_text: skippedOptionalFreeText(),
          evidence: ["detail"],
        },
        context: {},
        missing_slots: [],
        confidence: "high",
        generated_user_message: null,
      },
      potion_type: "courage",
      explicit_potion_type: "courage",
    },
    slot_filler: async () => ({
      current_sub_skill: "draft_generation",
      state_patch: {
        selected_potion: {
          status: "identified",
          value: "rappel",
          confidence: "medium",
          evidence: ["rappel-la"],
        },
        details: {
          status: "identified",
          required_question_ids: [
            "avoidance_target",
            "blocker_kind",
          ],
          answers: [{
            question_id: "avoidance_target",
            label: "Qu'est-ce que tu evites en ce moment ?",
            answer: "Envoyer le message a mon associe.",
            evidence: ["message"],
          }, {
            question_id: "blocker_kind",
            label: "Qu'est-ce qui bloque le plus ?",
            answer: "La peur du conflit.",
            evidence: ["conflit"],
          }],
          optional_free_text: skippedOptionalFreeText(),
          evidence: ["timing"],
        },
        missing_slots: [],
        generated_user_message: null,
        confidence: "high",
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["timing"],
    }),
    draft_generator: async (input) => {
      assertEquals(input.potion_type, "courage");
      return await structuredStatePotionDraftGenerator()(input);
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.potion_type, "courage");
});

Deno.test("select_state_potion detail fallback asks missing fields without technical wording", async () => {
  const askDetails = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux la potion de courage",
    trigger_message_id: "m-details-fallback-1",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "fear_avoidance",
      selected_potion: "courage",
      omit_detail_answers: true,
      generated_user_message:
        "Dis-moi ce que tu evites et ce qui bloque le plus.",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  const fallback = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "J'evite surtout d'envoyer ce message.",
    trigger_message_id: "m-details-fallback-2",
    safety_pregate_risk_band: "none",
    operation_input: askDetails.state_patch.operation_input,
    slot_filler: async () => null,
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(fallback.status, "ask_question");
  assertEquals(fallback.phase, "detail_intake");
  assertEquals(
    String(fallback.next_question?.question ?? "").includes("Je garde l'idee"),
    false,
  );
  assertStringIncludes(
    fallback.next_question?.question ?? "",
    "passage concret",
  );
  assertEquals(
    fallback.next_question?.question?.includes(
      "Je n'ai pas pu lire correctement",
    ),
    false,
  );
  const lastResort = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je suis a cran",
    trigger_message_id: "m-details-fallback-3",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(lastResort.status, "ask_question");
  assertEquals(lastResort.phase, "state_resolution");
  assertEquals(lastResort.state_patch.missing_slots, ["state", "potion_type"]);
  assertEquals(
    Boolean(lastResort.state_patch.operation_input?.intake_state),
    true,
  );
  assertEquals(
    String(lastResort.next_question?.question ?? "").includes(
      "Je n'ai pas pu lire correctement",
    ),
    false,
  );
  assertStringIncludes(
    lastResort.next_question?.question ?? "",
    "Qu'est-ce qui te pèse",
  );
});

Deno.test("select_state_potion revision keeps potion selected from previous draft", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Avant validation, je veux que le suivi m'aide a ralentir, pas a performer.",
    trigger_message_id: "m-revision-previous-draft-1",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: {
        draft: {
          potion_type: "apaisement",
          title: "Potion d'apaisement",
        },
      },
    },
    slot_filler: async (input) => {
      assertEquals(input.current_state?.selected_potion.value, "apaisement");
      return {
        current_sub_skill: "detail_intake",
        state_patch: {
          state: {
            status: "identified",
            kind: "stress_pressure",
            intensity: "high",
            confidence: "high",
            evidence: ["sous pression"],
          },
          selected_potion: {
            status: "missing",
            value: null,
            confidence: "low",
            evidence: [],
          },
          details: {
            status: "identified",
            required_question_ids: [
              "pressure_source",
              "pressure_state",
            ],
            answers: [{
              question_id: "pressure_source",
              label: "Qu'est-ce qui te met le plus sous pression ?",
              answer: "La reunion de cet apres-midi.",
              evidence: ["reunion"],
            }, {
              question_id: "pressure_state",
              label: "Tu te sens plutot comment dans ton corps ?",
              answer: "A cran et submerge.",
              evidence: ["a cran"],
            }],
            optional_free_text: null,
            evidence: ["revision_request"],
          },
        },
        missing_slots: [],
        confidence: "high",
      };
    },
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.potion_type, "apaisement");
});

Deno.test("select_state_potion revision reuses previous draft context instead of re-asking details", async () => {
  const previousDraft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: { kind: "stress_pressure", intensity: "high", evidence: ["test"] },
    potion_type: "apaisement",
    context: {},
    constraints: [],
    forbidden: [],
  });
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux juste que ça ne me pousse pas à performer, garde le matin.",
    trigger_message_id: "m-revision-previous-draft-context",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: previousDraft,
      revision_request:
        "Je veux juste que ça ne me pousse pas à performer, garde le matin.",
    },
    slot_filler: async (input) => {
      assertEquals(input.current_state?.selected_potion.value, "apaisement");
      assertEquals(input.current_state?.details.answers.length, 2);
      return {
        current_sub_skill: "draft_generation",
        state_patch: {
          details: input.current_state?.details,
        },
        missing_slots: [],
        confidence: "high",
        generated_user_message: null,
      };
    },
    draft_generator: async (input) => {
      assertEquals(input.previous_draft?.draft.potion_type, "apaisement");
      assertEquals(input.revision_request?.includes("performer"), true);
      return await structuredStatePotionDraftGenerator()(input);
    },
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.potion_type, "apaisement");
});

Deno.test("select_state_potion does not ask to reroute after explicit potion selection", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je suis submerge et a cran",
    trigger_message_id: "m-no-reroute-1",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: {
        draft: {
          potion_type: "apaisement",
          title: "Potion d'apaisement",
        },
      },
    },
    slot_filler: async () => ({
      current_sub_skill: "detail_intake",
      state_patch: {
        state: {
          status: "identified",
          kind: "stress_pressure",
          intensity: "high",
          confidence: "high",
          evidence: ["a cran"],
        },
        selected_potion: {
          status: "missing",
          value: null,
          confidence: "low",
          evidence: [],
        },
        details: {
          status: "missing",
          required_question_ids: ["pressure_source", "pressure_state"],
          answers: [],
          evidence: [],
        },
      },
      missing_slots: ["potion_detail:pressure_source"],
      confidence: "medium",
      generated_user_message:
        "Tu préfères qu'on parte sur de l'apaisement ou de la clarté ?",
      evidence: ["structured"],
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "ask_question");
  assertEquals(
    String(output.next_question?.question ?? "").includes("clarté"),
    false,
  );
  assertStringIncludes(output.next_question?.question ?? "", "pression");
});

Deno.test("select_state_potion default orchestrator forces router then detail subskill before draft", async () => {
  let routerCalls = 0;
  let detailCalls = 0;
  const output = await fillSelectStatePotionSlotsWithAi({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux une potion de courage pour envoyer ce message, je bloque surtout par peur du conflit.",
  }, {
    router: async () => {
      routerCalls += 1;
      return {
        current_sub_skill: "draft_generation",
        state_patch: {
          state: {
            status: "identified",
            kind: "fear_avoidance",
            intensity: "medium",
            confidence: "high",
            evidence: ["peur du conflit"],
          },
          selected_potion: {
            status: "identified",
            value: "courage",
            confidence: "high",
            evidence: ["potion de courage"],
          },
          details: {
            status: "identified",
            required_question_ids: [
              "avoidance_target",
              "blocker_kind",
            ],
            answers: [{
              question_id: "avoidance_target",
              label: "Qu'est-ce que tu evites en ce moment ?",
              answer: "Cette reponse ne doit pas venir du router.",
              evidence: ["router_overreach"],
            }, {
              question_id: "blocker_kind",
              label: "Qu'est-ce qui bloque le plus ?",
              answer: "Cette reponse ne doit pas venir du router.",
              evidence: ["router_overreach"],
            }],
            evidence: ["router_overreach"],
          },
        },
        missing_slots: [],
        confidence: "high",
        generated_user_message: null,
        evidence: ["router"],
      };
    },
    detail: async (input) => {
      detailCalls += 1;
      assertEquals(input.current_state?.current_sub_skill, "detail_intake");
      assertEquals(input.current_state?.details.answers, []);
      return {
        current_sub_skill: "draft_generation",
        state_patch: {
          details: {
            status: "identified",
            required_question_ids: [
              "avoidance_target",
              "blocker_kind",
            ],
            answers: [{
              question_id: "avoidance_target",
              label: "Qu'est-ce que tu evites en ce moment ?",
              answer: "Envoyer le message a mon associe.",
              evidence: ["message associe"],
            }, {
              question_id: "blocker_kind",
              label: "Qu'est-ce qui bloque le plus ?",
              answer: "La peur du conflit.",
              evidence: ["peur du conflit"],
            }],
            evidence: ["detail"],
          },
        },
        missing_slots: [],
        confidence: "high",
        generated_user_message: null,
        evidence: ["detail"],
      };
    },
  });
  assertEquals(routerCalls, 1);
  assertEquals(detailCalls, 1);
  assertEquals(output?.current_sub_skill, "detail_intake");
  assertEquals(output?.missing_slots, [
    "potion_detail:blocker_kind",
  ]);
  assertEquals(
    output?.state_patch.details?.answers.map((answer) => answer.answer),
    ["Envoyer le message a mon associe."],
  );
});

Deno.test("select_state_potion default orchestrator does not rerun router after potion is selected", async () => {
  let routerCalls = 0;
  let detailCalls = 0;
  const slotFiller = (
    input: Parameters<typeof fillSelectStatePotionSlotsWithAi>[0],
  ) =>
    fillSelectStatePotionSlotsWithAi(input, {
      router: async () => {
        routerCalls += 1;
        return {
          current_sub_skill: "detail_intake",
          state_patch: {
            state: {
              status: "identified",
              kind: "fear_avoidance",
              intensity: "medium",
              confidence: "high",
              evidence: ["peur"],
            },
            selected_potion: {
              status: "identified",
              value: "courage",
              confidence: "high",
              evidence: ["courage"],
            },
            generated_user_message:
              "Qu'est-ce que tu evites, et qu'est-ce qui bloque le plus ?",
          },
          missing_slots: [
            "potion_detail:avoidance_target",
            "potion_detail:blocker_kind",
          ],
          confidence: "high",
          generated_user_message:
            "Qu'est-ce que tu evites, et qu'est-ce qui bloque le plus ?",
          evidence: ["router"],
        };
      },
      detail: async (input) => {
        detailCalls += 1;
        if (input.message.includes("associe")) {
          return {
            current_sub_skill: "draft_generation",
            state_patch: {
              details: {
                status: "identified",
                required_question_ids: [
                  "avoidance_target",
                  "blocker_kind",
                ],
                answers: [{
                  question_id: "avoidance_target",
                  label: "Qu'est-ce que tu evites en ce moment ?",
                  answer: "Envoyer le message a mon associe.",
                  evidence: ["message associe"],
                }, {
                  question_id: "blocker_kind",
                  label: "Qu'est-ce qui bloque le plus ?",
                  answer: "La peur du conflit.",
                  evidence: ["peur du conflit"],
                }],
                evidence: ["detail"],
              },
            },
            missing_slots: [],
            confidence: "high",
            generated_user_message: null,
            evidence: ["detail"],
          };
        }
        return {
          current_sub_skill: "detail_intake",
          state_patch: {
            generated_user_message:
              "Qu'est-ce que tu evites, et qu'est-ce qui bloque le plus ?",
          },
          missing_slots: [
            "potion_detail:avoidance_target",
            "potion_detail:blocker_kind",
          ],
          confidence: "high",
          generated_user_message:
            "Qu'est-ce que tu evites, et qu'est-ce qui bloque le plus ?",
          evidence: ["detail"],
        };
      },
    });

  const askDetails = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Je veux une potion de courage",
    trigger_message_id: "m-architecture-1",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(askDetails.status, "ask_question");
  assertEquals(askDetails.phase, "detail_intake");

  const ready = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "J'evite d'envoyer le message a mon associe, surtout par peur du conflit.",
    trigger_message_id: "m-architecture-2",
    safety_pregate_risk_band: "none",
    operation_input: askDetails.state_patch.operation_input,
    slot_filler: slotFiller,
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(routerCalls, 1);
  assertEquals(detailCalls, 2);
  assertEquals(ready.status, "ask_question");
  assertEquals(ready.phase, "detail_intake");
  assertEquals(
    ready.state_patch.missing_slots.includes("potion_detail:blocker_kind"),
    true,
  );
});

Deno.test("select_state_potion blocks missing state and safety", async () => {
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
        required_question_ids: [
          "pressure_source",
          "pressure_state",
        ],
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
        optional_free_text: null,
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
  const mediumIntake = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux une potion de rappel",
    trigger_message_id: "m-medium-safety",
    safety_pregate_risk_band: "medium",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "decrochage",
      selected_potion: "rappel",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(mediumIntake.status, "pending_confirmation");
});

Deno.test("select_state_potion router: no_potion constraint cancels active intake", async () => {
  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "stop, pas de potion",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "select_state_potion",
        phase: "detail_intake",
        operation_input: { potion_type: "rappel" },
        turn_count: 1,
      },
      __potion_followup_consent: "refused",
    },
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-no-potion-active",
    requestId: "r-no-potion-active",
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "cancelled");
  assertEquals(result.toolSkillRun.user_intent, "forbid_potion");
  assertEquals((result.toolSkillRun as any).constraints, [{
    kind: "no_potion",
    evidence: ["stop, pas de potion"],
  }]);
  assertEquals((result.toolSkillRun as any).allowed_effects, []);
  assertEquals((result.toolSkillRun as any).blocked_effects, [{
    type: "activate_state_potion",
    reason_code: "no_potion",
  }]);
  assertEquals(
    (result.toolSkillRun as any).effect_ledger.blocked_effects,
    [{
      type: "activate_state_potion",
      reason_code: "no_potion",
    }],
  );
  const frame = loadSelectStatePotionFrameFromTempMemory(
    result.nextTempMemory,
  );
  assertEquals(frame.active, null);
  assertEquals(frame.pending, null);
  assertEquals(frame.recommendation, null);
  assertEquals(frame.followup_consent, null);
});

Deno.test("select_state_potion router: no_potion constraint blocks new start", async () => {
  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "donne-moi juste une phrase, sans potion",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-no-potion-start",
    requestId: "r-no-potion-start",
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "cancelled");
  assertEquals(result.toolSkillRun.user_intent, "forbid_potion");
  assertEquals(String(result.content).includes("Phrase de réparation"), true);
  assertEquals(
    (result.toolSkillRun as any).debug.reason_code,
    "select_state_potion_no_potion_constraint",
  );
  assertEquals(result.executedTools, []);
  assertEquals(
    loadSelectStatePotionFrameFromTempMemory(result.nextTempMemory)
      .followup_consent,
    null,
  );
});

Deno.test("select_state_potion router: structured one-shot interrupt exits potion router", async () => {
  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "programme ce rappel ponctuel à 14h35, rien de récurrent",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "select_state_potion",
        phase: "detail_intake",
        operation_input: { potion_type: "apaisement" },
        turn_count: 2,
      },
    },
    turnFrame: null,
    routeDecision: {
      ...selectPotionRouteDecision,
      response_owner: "normal_reply",
      selected_handler: undefined,
      reason_code: "create_one_shot_reminder_interrupts_active_handoff",
      direct_effects_to_run: ["create_one_shot_reminder"],
    },
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-one-shot-handoff",
    requestId: "r-one-shot-handoff",
  });

  assertEquals(result, null);
});

Deno.test("select_state_potion router: followup refusal stays no-mutation on activation attempt", async () => {
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: {
      kind: "stress_pressure",
      intensity: "medium",
      evidence: ["pression"],
    },
    potion_type: "apaisement",
    context: {},
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_draft");

  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "oui active cette potion, juste maintenant sans suivi",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-followup",
        operation_type: "select_state_potion",
        draft,
        turn_count: 1,
      },
      __potion_followup_consent: "refused",
    },
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-activate-no-followup",
    requestId: "r-activate-no-followup",
    draftReviewOverride: async () => ({
      decision: "approve",
      confidence: "high",
      evidence: ["oui active cette potion"],
      generated_user_message: null,
    }),
  });

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals((result.toolSkillRun as any).user_intent, "activate");
  assertEquals((result.toolSkillRun as any).allowed_effects, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
  assertEquals(
    (result.toolSkillRun as any).platform_handoff?.no_chat_mutation,
    true,
  );
  assertEquals(
    String(result.content).includes(
      "Je ne peux pas le créer/lancer depuis le chat.",
    ),
    true,
  );
});

Deno.test("select_state_potion router: activation attempt stays platform handoff", async () => {
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: {
      kind: "stress_pressure",
      intensity: "medium",
      evidence: ["pression"],
    },
    potion_type: "apaisement",
    context: {},
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_draft");

  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "oui active cette potion",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-blocked",
        operation_type: "select_state_potion",
        draft,
        turn_count: 1,
      },
    },
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-activate-blocked",
    requestId: "r-activate-blocked",
    draftReviewOverride: async () => ({
      decision: "approve",
      confidence: "high",
      evidence: ["oui active cette potion"],
      generated_user_message: null,
    }),
  });

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(
    String(result.content).includes(
      "Je ne peux pas le créer/lancer depuis le chat.",
    ),
    true,
  );
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals((result.toolSkillRun as any).allowed_effects, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
});
