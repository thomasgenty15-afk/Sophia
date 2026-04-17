import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildAssistantSummary,
  buildMegaTestReview,
  buildPlanReviewUserPrompt,
  normalizeReviewResult,
} from "./index.ts";
import type { PlanContentV3, UserTransformationRow } from "../_shared/v2-types.ts";

Deno.test("buildMegaTestReview returns minor adjustment for simplification asks", () => {
  const result = buildMegaTestReview("Le debut est trop ambitieux, je veux un premier pas plus simple.");

  assertEquals(result.review_kind, "preference_change");
  assertEquals(result.adjustment_scope, "current_level_only");
  assertEquals(result.decision, "minor_adjustment");
  assertEquals(result.control_mode, "adjust_current_level");
  assertEquals(result.offer_complete_level, false);
  assertStringIncludes(result.regeneration_feedback ?? "", "simplifie fortement");
});

Deno.test("buildMegaTestReview returns no_change for clarification asks", () => {
  const result = buildMegaTestReview("Peux-tu clarifier pourquoi cette phase vient en premier ?");

  assertEquals(result.review_kind, "clarification");
  assertEquals(result.adjustment_scope, "current_level_only");
  assertEquals(result.decision, "no_change");
  assertEquals(result.control_mode, "clarify_only");
  assertEquals(result.regeneration_feedback, null);
});

Deno.test("normalizeReviewResult clears regeneration feedback when no change is needed", () => {
  const result = normalizeReviewResult({
    review_kind: "clarification",
    adjustment_scope: "current_level_only",
    decision: "no_change",
    understanding: "Tu veux surtout comprendre la logique.",
    impact: "Le plan peut rester tel quel.",
    proposed_changes: ["Garder la structure actuelle"],
    control_mode: "clarify_only",
    resistance_note: "  ",
    principle_reminder: "  ",
    offer_complete_level: false,
    regeneration_feedback: "Ne devrait pas survivre",
    clarification_question: "  ",
  });

  assertEquals(result.resistance_note, null);
  assertEquals(result.principle_reminder, null);
  assertEquals(result.regeneration_feedback, null);
  assertEquals(result.clarification_question, null);
});

Deno.test("buildAssistantSummary composes the structured review", () => {
  const summary = buildAssistantSummary({
    review_kind: "preference_change",
    adjustment_scope: "current_level_only",
    decision: "minor_adjustment",
    understanding: "Tu veux un demarrage plus simple.",
    impact: "On garde la direction mais on allege le premier palier.",
    proposed_changes: ["Simplifier le premier pas", "Raccourcir la phase de depart"],
    control_mode: "adjust_current_level",
    resistance_note: null,
    principle_reminder: null,
    offer_complete_level: false,
    regeneration_feedback: "Simplifie le debut.",
    clarification_question: null,
  });

  assertStringIncludes(summary, "J'ai compris");
  assertStringIncludes(summary, "Impact");
  assertStringIncludes(summary, "Simplifier le premier pas");
});

Deno.test("buildMegaTestReview returns advance-ready control mode for fast-progress asks", () => {
  const result = buildMegaTestReview("En vrai j'ai fini ce niveau plus vite, je suis pret pour la suite.");

  assertEquals(result.review_kind, "preference_change");
  assertEquals(result.adjustment_scope, "current_plus_future");
  assertEquals(result.decision, "no_change");
  assertEquals(result.control_mode, "advance_ready");
  assertEquals(result.offer_complete_level, true);
  assertStringIncludes(result.resistance_note ?? "", "appui");
});

function makeReviewPlanFixture(): PlanContentV3 {
  return {
    version: 3,
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    duration_months: 2,
    title: "Réduire les boissons sucrées",
    global_objective: "Atteindre 95 kg avec une baisse stable.",
    user_summary: "Tu veux réduire les automatismes qui te tirent vers le sucre le soir.",
    internal_summary: "Le sujet central mêle automatismes du soir et fatigue décisionnelle.",
    situation_context: "Le soir, les boissons sucrées reviennent comme raccourci de réconfort.",
    mechanism_analysis: "Le sucre liquide soulage vite mais entretient le cycle de fatigue et de regret.",
    key_understanding: "Le premier levier utile est souvent environnemental avant d'être mental.",
    progression_logic: "On simplifie d'abord le terrain, puis on stabilise la nouvelle routine.",
    primary_metric: {
      label: "Poids corporel",
      unit: "kg",
      baseline_value: "105",
      success_target: "95",
      measurement_mode: "absolute_value",
    },
    strategy: {
      identity_shift: null,
      core_principle: null,
      success_definition: "Atteindre 95 kg sans frustration durable.",
      main_constraint: "Fatigue du soir.",
    },
    inspiration_narrative: "En reprenant le terrain du soir, la perte de poids redevient crédible.",
    phases: [
      {
        phase_id: "phase-1",
        phase_order: 1,
        title: "Casser les automatismes liquides",
        rationale: "On commence par le levier le plus accessible.",
        phase_objective: "Réduire les calories liquides et installer un remplacement simple.",
        duration_guidance: "3 semaines",
        what_this_phase_targets: "Le sucre liquide et les automatismes du soir.",
        why_this_now: "C'est le levier le plus simple à retirer sans faim.",
        how_this_phase_works: "On prépare le terrain et on remplace la boisson réflexe.",
        phase_metric_target:
          "Pas encore de cible directe sur les 95 kg ; ce niveau prépare le terrain en visant 5 jours sans boisson sucrée.",
        maintained_foundation: [],
        heartbeat: {
          title: "Jours sans boisson sucrée",
          unit: "jours/semaine",
          current: null,
          target: 5,
          tracking_mode: "manual",
        },
        items: [],
      },
    ],
    timeline_summary: "On retire d'abord le levier le plus facile puis on consolide.",
    journey_context: null,
    metadata: {
      plan_adjustment_context: {
        global_reasoning: {
          main_problem_model:
            "Le soir, la fatigue pousse vers la solution la plus visible et la plus sucrée.",
          sequencing_logic:
            "On commence par l'environnement et un remplacement simple avant d'élargir la suite du plan.",
          why_not_faster_initially:
            "Un démarrage trop agressif ferait remonter la frustration et l'abandon.",
          acceleration_signals: [
            "Le remplacement est déjà facile plusieurs jours de suite",
            "La personne demande explicitement d'aller plus vite",
          ],
          slowdown_signals: [
            "Le soir reste trop chargé pour tenir le remplacement",
            "Le niveau actuel crée de la frustration",
          ],
        },
        phase_reasoning: [
          {
            phase_id: "phase-1",
            phase_order: 1,
            role_in_plan: "Créer un premier appui très faisable sur le sujet du soir.",
            why_before_next:
              "Sans premier remplacement stable, accélérer le reste du plan ferait retomber les automatismes.",
            user_signals_used: [
              "Boissons sucrées",
              "Fatigue du soir",
            ],
            prerequisite_for_next_phase:
              "Avoir un remplacement simple qui tient plusieurs jours par semaine.",
            acceleration_signals: [
              "La routine est déjà facile",
            ],
            slowdown_signals: [
              "Le soir reste trop chaotique",
            ],
          },
        ],
      },
    },
  };
}

function makeTransformationFixture(): UserTransformationRow {
  return {
    id: "transfo-1",
    cycle_id: "cycle-1",
    title: "Réduire les boissons sucrées",
    user_summary: "Tu veux reprendre la main sur les automatismes du soir.",
    internal_summary: null,
    success_definition: "Atteindre 95 kg sans frustration durable.",
    main_constraint: "Fatigue du soir.",
    priority_order: 1,
    status: "pending",
    created_at: "2026-04-15T10:00:00.000Z",
    updated_at: "2026-04-15T10:00:00.000Z",
    started_at: null,
    completed_at: null,
    archived_at: null,
    questionnaire_schema: null,
    questionnaire_answers: {},
    professional_support:
      null,
    relationship_axis: null,
    initial_prompt: null,
    cycle_anchor: null,
    primary_dimension: null,
    effort_level: null,
    why_now: null,
    readiness_label: null,
    current_state_label: null,
    target_state_label: null,
    support_notes: null,
    deferred_reason: null,
    metadata: {},
  } as unknown as UserTransformationRow;
}

Deno.test("buildPlanReviewUserPrompt exposes the internal plan adjustment context", () => {
  const prompt = buildPlanReviewUserPrompt({
    transformation: makeTransformationFixture(),
    scope: "active_plan",
    userComment: "En vrai j'avance bien, je veux accélérer la suite.",
    priorThread: [],
    currentLevelContext: {
      phase_id: "phase-1",
      phase_order: 1,
      title: "Casser les automatismes liquides",
      objective: "Réduire les calories liquides",
    },
    plan: makeReviewPlanFixture(),
  });

  assertStringIncludes(prompt, "Logique interne du plan pour les futurs ajustements");
  assertStringIncludes(prompt, "signaux d'acceleration");
  assertStringIncludes(prompt, "determine explicitement si la demande vise seulement ce niveau, la suite, les deux, ou le plan entier");
});
