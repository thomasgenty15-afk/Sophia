import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  deriveCycleDraftStatus,
  extractDraftPlanTypeClassification,
  extractFullDraftTransformations,
  normalizeStoredDraftPayload,
  resolveHydrationMode,
} from "./index.ts";

Deno.test("deriveCycleDraftStatus prefers structured cycle states", () => {
  assertEquals(
    deriveCycleDraftStatus({
      version: 1,
      stage: "capture",
      raw_intake_text: "Je tourne en rond.",
      cycle_status: "clarification_needed",
    }),
    "structured",
  );
});

Deno.test("deriveCycleDraftStatus maps downstream stages to prioritized", () => {
  assertEquals(
    deriveCycleDraftStatus({
      version: 1,
      stage: "questionnaire",
      raw_intake_text: "J'ai deja avance.",
      cycle_status: null,
    }),
    "prioritized",
  );
});

Deno.test("normalizeStoredDraftPayload injects canonical session and updated_at", () => {
  const normalized = normalizeStoredDraftPayload({
    anonymous_session_id: "8d20f420-f785-4121-938e-c5dd65432680",
    draft_payload: {
      version: 1,
      stage: "capture",
      raw_intake_text: "Texte libre",
      cycle_status: null,
    },
    updated_at: "2026-03-25T16:00:00.000Z",
  });

  assertEquals(
    normalized.anonymous_session_id,
    "8d20f420-f785-4121-938e-c5dd65432680",
  );
  assertEquals(normalized.updated_at, "2026-03-25T16:00:00.000Z");
});

Deno.test("resolveHydrationMode covers reuse, analyze and invalid drafts", () => {
  assertEquals(
    resolveHydrationMode({
      draft: {
        version: 1,
        stage: "capture",
        raw_intake_text: "Je veux reprendre la main.",
        cycle_status: null,
      },
      existingCycleId: "cycle-existing",
      ownedCycleId: null,
    }),
    "noop_existing_cycle",
  );

  assertEquals(
    resolveHydrationMode({
      draft: {
        version: 1,
        stage: "profile",
        raw_intake_text: "",
        cycle_status: "profile_pending",
      },
      existingCycleId: null,
      ownedCycleId: "cycle-owned",
    }),
    "reuse_cycle",
  );

  assertEquals(
    resolveHydrationMode({
      draft: {
        version: 1,
        stage: "capture",
        raw_intake_text: "Je veux avancer.",
        cycle_status: null,
      },
      existingCycleId: null,
      ownedCycleId: null,
    }),
    "analyze_raw_text",
  );

  assertThrows(() =>
    resolveHydrationMode({
      draft: {
        version: 1,
        stage: "capture",
        raw_intake_text: "   ",
        cycle_status: null,
      },
      existingCycleId: null,
      ownedCycleId: null,
    })
  );
});

const VALID_GUEST_CLASSIFICATION = {
  type_key: "sleep_recovery",
  confidence: 0.9,
  duration_guidance: { min_months: 1, default_months: 2, max_months: 3 },
  journey_strategy: { mode: "single_transformation" },
  transformation_snapshot: {
    starting_point: "Tu pars fatigué.",
    arrival_point: "Tu veux des nuits stables.",
  },
};

Deno.test("extractDraftPlanTypeClassification accepts a minimally valid classification", () => {
  assertEquals(
    extractDraftPlanTypeClassification(VALID_GUEST_CLASSIFICATION),
    VALID_GUEST_CLASSIFICATION,
  );
});

Deno.test("extractDraftPlanTypeClassification rejects corrupted or missing payloads", () => {
  assertEquals(extractDraftPlanTypeClassification(null), null);
  assertEquals(extractDraftPlanTypeClassification(undefined), null);
  assertEquals(extractDraftPlanTypeClassification("classification"), null);
  assertEquals(extractDraftPlanTypeClassification([]), null);
  // Missing type_key.
  assertEquals(
    extractDraftPlanTypeClassification({
      duration_guidance: { min_months: 1 },
    }),
    null,
  );
  // Missing / malformed duration_guidance.
  assertEquals(
    extractDraftPlanTypeClassification({ type_key: "sleep_recovery" }),
    null,
  );
  assertEquals(
    extractDraftPlanTypeClassification({
      type_key: "sleep_recovery",
      duration_guidance: "2 months",
    }),
    null,
  );
});

Deno.test("extractFullDraftTransformations carries the guest classification through", () => {
  const transformations = extractFullDraftTransformations({
    version: 1,
    stage: "profile",
    raw_intake_text: "Je veux mieux dormir.",
    cycle_status: "signup_pending",
    transformations: [
      {
        id: "0c8f2f9e-95a4-4be0-9a20-6f6dd9c6d9f1",
        priority_order: 1,
        title: "Retrouver un sommeil stable",
        internal_summary: "Sommeil irregulier depuis des mois.",
        user_summary: "Tu veux retrouver des nuits stables.",
        plan_type_classification: VALID_GUEST_CLASSIFICATION,
      },
      {
        id: "5b7cf9e1-40cd-4b46-b1a4-1de1f6f5f0a2",
        priority_order: 2,
        title: "Reprendre le sport",
        internal_summary: "Activite physique en pause.",
        user_summary: "Tu veux te remettre en mouvement.",
        // Corrupted payload must be dropped, not copied.
        plan_type_classification: { random: true },
      },
    ],
  });

  assertEquals(transformations.length, 2);
  assertEquals(
    transformations[0].plan_type_classification,
    VALID_GUEST_CLASSIFICATION,
  );
  assertEquals(transformations[1].plan_type_classification, null);
});
