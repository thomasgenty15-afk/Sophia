import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  ALLOWED_RENDEZ_VOUS_TRANSITIONS,
  assertRendezVousCreationAllowed,
  assertRendezVousTransitionAllowed,
  buildRefusedRendezVousCooldownKey,
  buildRendezVousStateChangedPayload,
  resolveInitialRendezVousState,
} from "./v2-rendez-vous.ts";

Deno.test("resolveInitialRendezVousState defaults to draft without schedule", () => {
  assertEquals(
    resolveInitialRendezVousState({
      state: undefined,
      scheduled_for: null,
    }),
    "draft",
  );
});

Deno.test("resolveInitialRendezVousState defaults to scheduled when scheduled_for is present", () => {
  assertEquals(
    resolveInitialRendezVousState({
      state: undefined,
      scheduled_for: "2026-03-26T09:00:00.000Z",
    }),
    "scheduled",
  );
});

Deno.test("assertRendezVousCreationAllowed rejects missing trigger_reason", () => {
  assertThrows(() =>
    assertRendezVousCreationAllowed({
      user_id: "user-1",
      cycle_id: "cycle-1",
      kind: "pre_event_grounding",
      budget_class: "light",
      trigger_reason: "  ",
      confidence: "high",
      posture: "preparatory",
    })
  );
});

Deno.test("assertRendezVousCreationAllowed rejects confidence=low", () => {
  assertThrows(() =>
    assertRendezVousCreationAllowed({
      user_id: "user-1",
      cycle_id: "cycle-1",
      kind: "weekly_reset",
      budget_class: "notable",
      trigger_reason: "Weekly regrouping needed.",
      confidence: "low",
      posture: "supportive",
    })
  );
});

Deno.test("assertRendezVousCreationAllowed rejects scheduled state without date", () => {
  assertThrows(() =>
    assertRendezVousCreationAllowed({
      user_id: "user-1",
      cycle_id: "cycle-1",
      kind: "mission_preparation",
      state: "scheduled",
      budget_class: "light",
      trigger_reason: "Preparation needed before mission.",
      confidence: "medium",
      posture: "preparatory",
      scheduled_for: null,
    })
  );
});

Deno.test("assertRendezVousTransitionAllowed accepts lifecycle transitions", () => {
  for (
    const [currentState, nextStates] of Object.entries(
      ALLOWED_RENDEZ_VOUS_TRANSITIONS,
    )
  ) {
    for (const nextState of nextStates) {
      assertRendezVousTransitionAllowed(
        currentState as keyof typeof ALLOWED_RENDEZ_VOUS_TRANSITIONS,
        nextState,
      );
    }
  }
});

Deno.test("assertRendezVousTransitionAllowed rejects invalid transitions", () => {
  assertThrows(() => assertRendezVousTransitionAllowed("draft", "completed"));
  assertThrows(() => assertRendezVousTransitionAllowed("scheduled", "skipped"));
  assertThrows(() => assertRendezVousTransitionAllowed("completed", "draft"));
});

Deno.test("buildRefusedRendezVousCooldownKey scopes to transformation when present", () => {
  assertEquals(
    buildRefusedRendezVousCooldownKey({
      kind: "pre_event_grounding",
      cycle_id: "cycle-1",
      transformation_id: "transfo-1",
    }),
    "pre_event_grounding:transfo-1",
  );
});

Deno.test("buildRefusedRendezVousCooldownKey falls back to cycle scope", () => {
  assertEquals(
    buildRefusedRendezVousCooldownKey({
      kind: "weekly_reset",
      cycle_id: "cycle-1",
      transformation_id: null,
    }),
    "weekly_reset:cycle-1",
  );
});

Deno.test("buildRendezVousStateChangedPayload captures state transition details", () => {
  assertEquals(
    buildRendezVousStateChangedPayload({
      row: {
        id: "rdv-1",
        user_id: "user-1",
        cycle_id: "cycle-1",
        transformation_id: "transfo-1",
        kind: "mission_preparation",
        state: "scheduled",
        budget_class: "light",
        scheduled_for: "2026-03-27T10:00:00.000Z",
        trigger_reason: "Mission is due within 48h.",
        linked_checkin_id: "checkin-1",
      },
      previousState: "draft",
      metadata: { source: "unit-test" },
    }),
    {
      user_id: "user-1",
      cycle_id: "cycle-1",
      transformation_id: "transfo-1",
      rendez_vous_id: "rdv-1",
      kind: "mission_preparation",
      previous_state: "draft",
      new_state: "scheduled",
      budget_class: "light",
      scheduled_for: "2026-03-27T10:00:00.000Z",
      trigger_reason: "Mission is due within 48h.",
      linked_checkin_id: "checkin-1",
      metadata: { source: "unit-test" },
    },
  );
});
