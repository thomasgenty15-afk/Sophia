import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  deriveCycleDraftStatus,
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
