import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildPlanTypeClassificationUserPrompt,
  normalizePlanTypeClassificationCandidate,
} from "./index.ts";

Deno.test("buildPlanTypeClassificationUserPrompt works from a minimal transformation-like input (guest path)", () => {
  const prompt = buildPlanTypeClassificationUserPrompt({
    transformationLike: {
      title: "Retrouver un sommeil stable",
      internal_summary: "Sommeil irregulier depuis des mois.",
      user_summary: "Tu veux retrouver des nuits stables.",
    },
    profileSnapshot: null,
    questionnaireAnswers: { q1: "Je me couche apres minuit." },
    questionnaireSchema: { questions: [{ id: "q1" }] },
  });

  assertStringIncludes(prompt, "Retrouver un sommeil stable");
  assertStringIncludes(prompt, "Sommeil irregulier depuis des mois.");
  // Optional fields fall back to explicit placeholders.
  assertStringIncludes(prompt, "Success definition: Not provided");
  assertStringIncludes(prompt, "Main constraint: Not provided");
  // No profile for a guest — the prompt must say so instead of breaking.
  assertStringIncludes(prompt, "- No profile snapshot");
  assertStringIncludes(prompt, "Je me couche apres minuit.");
});

Deno.test("buildPlanTypeClassificationUserPrompt includes the profile snapshot when provided", () => {
  const prompt = buildPlanTypeClassificationUserPrompt({
    transformationLike: {
      title: null,
      internal_summary: "Resume interne.",
      user_summary: "Resume user.",
      success_definition: "Dormir 7h",
      main_constraint: "Horaires de nuit",
    },
    profileSnapshot: { birth_date: "1995-04-12", gender: "female" },
    questionnaireAnswers: { q1: "reponse" },
    questionnaireSchema: {},
  });

  assertStringIncludes(prompt, "Birth date snapshot: 1995-04-12");
  assertStringIncludes(prompt, "Gender snapshot: female");
  assertStringIncludes(prompt, "Title: Untitled transformation");
  assertStringIncludes(prompt, "Success definition: Dormir 7h");
  assertStringIncludes(prompt, "Main constraint: Horaires de nuit");
});

Deno.test("normalizePlanTypeClassificationCandidate maps legacy split keys to canonical ones", () => {
  const normalized = normalizePlanTypeClassificationCandidate({
    type_key: "weight_loss",
    split_metric_guidance: {
      transformation_1: {
        metric: "Body weight",
        start_value: "105 kg",
        target_value: "95 kg",
        success_definition: "Atteindre 95 kg.",
      },
      transformation_2: {
        start_value: "95 kg",
        target_value: "80 kg",
        success_definition: "Atteindre 80 kg.",
      },
    },
  }) as {
    split_metric_guidance: {
      metric_label: unknown;
      transformation_1: { baseline_text: unknown; target_text: unknown };
      transformation_2: { baseline_text: unknown; target_text: unknown };
    };
  };

  assertEquals(normalized.split_metric_guidance.metric_label, "Body weight");
  assertEquals(
    normalized.split_metric_guidance.transformation_1.baseline_text,
    "105 kg",
  );
  assertEquals(
    normalized.split_metric_guidance.transformation_1.target_text,
    "95 kg",
  );
  assertEquals(
    normalized.split_metric_guidance.transformation_2.baseline_text,
    "95 kg",
  );
  assertEquals(
    normalized.split_metric_guidance.transformation_2.target_text,
    "80 kg",
  );
});

Deno.test("normalizePlanTypeClassificationCandidate leaves non-record values untouched", () => {
  assertEquals(normalizePlanTypeClassificationCandidate(null), null);
  assertEquals(normalizePlanTypeClassificationCandidate("raw"), "raw");
  const noSplit = { type_key: "sleep_recovery", split_metric_guidance: null };
  assertEquals(normalizePlanTypeClassificationCandidate(noSplit), noSplit);
});
