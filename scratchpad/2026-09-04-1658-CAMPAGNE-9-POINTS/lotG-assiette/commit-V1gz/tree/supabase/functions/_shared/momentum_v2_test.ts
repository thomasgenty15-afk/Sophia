import { assertEquals } from "jsr:@std/assert@1";

import {
  buildMomentumSnapshotV2FromRows,
  selectMomentumIntervention,
} from "./momentum_v2.ts";

Deno.test("buildMomentumSnapshotV2FromRows detects healthy traction", () => {
  const snapshot = buildMomentumSnapshotV2FromRows({
    userId: "user-1",
    generatedAt: "2026-04-28T12:00:00.000Z",
    windowFrom: "2026-04-22",
    windowTo: "2026-04-28",
    activeTransformationIds: ["transformation-1", "transformation-2"],
    occurrences: [
      {
        id: "occ-1",
        plan_item_id: "item-1",
        week_start_date: "2026-04-27",
        planned_day: "mon",
        status: "done",
      },
      {
        id: "occ-2",
        plan_item_id: "item-2",
        week_start_date: "2026-04-27",
        planned_day: "tue",
        status: "planned",
      },
    ],
    entries: [
      {
        plan_item_id: "item-2",
        outcome: "completed",
        effective_at: "2026-04-28T18:30:00.000Z",
      },
    ],
    weekPlans: [{ status: "confirmed", week_start_date: "2026-04-27" }],
    chatMessages: [{ role: "user", created_at: "2026-04-28T09:00:00.000Z" }],
  });

  assertEquals(snapshot.state, "healthy");
  assertEquals(snapshot.risk_level, "low");
  assertEquals(snapshot.signals.active_transformations, 2);
  assertEquals(snapshot.signals.planned_actions, 2);
  assertEquals(snapshot.signals.done, 2);
  assertEquals(snapshot.signals.adherence_rate, 1);
  assertEquals(snapshot.recommended_intervention.kind, "encourage");
});

Deno.test("buildMomentumSnapshotV2FromRows detects slipping and planning modifications", () => {
  const snapshot = buildMomentumSnapshotV2FromRows({
    userId: "user-1",
    generatedAt: "2026-04-28T12:00:00.000Z",
    windowFrom: "2026-04-22",
    windowTo: "2026-04-28",
    occurrences: [
      {
        id: "occ-1",
        plan_item_id: "item-1",
        week_start_date: "2026-04-27",
        planned_day: "mon",
        status: "done",
      },
      {
        id: "occ-2",
        plan_item_id: "item-2",
        week_start_date: "2026-04-27",
        planned_day: "tue",
        status: "missed",
      },
      {
        id: "occ-3",
        plan_item_id: "item-3",
        week_start_date: "2026-04-27",
        planned_day: "tue",
        status: "partial",
      },
      {
        id: "occ-4",
        plan_item_id: "item-4",
        week_start_date: "2026-04-27",
        planned_day: "tue",
        status: "planned",
      },
    ],
    weekPlans: [{ status: "confirmed", week_start_date: "2026-04-27" }],
    checkins: [
      {
        event_context: "weekly_planning_confirmation_v2",
        status: "sent",
        message_payload: { confirmation_kind: "modification" },
      },
    ],
    chatMessages: [{ role: "user", created_at: "2026-04-27T20:00:00.000Z" }],
  });

  assertEquals(snapshot.state, "slipping");
  assertEquals(snapshot.risk_level, "medium");
  assertEquals(snapshot.signals.planning_modified_this_week, true);
  assertEquals(
    selectMomentumIntervention(snapshot)?.kind,
    "adjust_next_week_planning",
  );
});

Deno.test("buildMomentumSnapshotV2FromRows detects silent active plans", () => {
  const snapshot = buildMomentumSnapshotV2FromRows({
    userId: "user-1",
    generatedAt: "2026-04-28T12:00:00.000Z",
    windowFrom: "2026-04-22",
    windowTo: "2026-04-28",
    occurrences: [
      {
        id: "occ-1",
        plan_item_id: "item-1",
        week_start_date: "2026-04-27",
        planned_day: "mon",
        status: "planned",
      },
    ],
    chatMessages: [{ role: "user", created_at: "2026-04-18T09:00:00.000Z" }],
  });

  assertEquals(snapshot.state, "silent");
  assertEquals(snapshot.risk_level, "high");
  assertEquals(snapshot.recommended_intervention.kind, "winback");
});

Deno.test("buildMomentumSnapshotV2FromRows uses conversation pulse high risk", () => {
  const snapshot = buildMomentumSnapshotV2FromRows({
    userId: "user-1",
    generatedAt: "2026-04-28T12:00:00.000Z",
    windowFrom: "2026-04-22",
    windowTo: "2026-04-28",
    occurrences: [],
    conversationPulse: {
      payload: { signals: { proactive_risk: "high" } },
      created_at: "2026-04-28T08:00:00.000Z",
    },
  });

  assertEquals(snapshot.state, "at_risk");
  assertEquals(snapshot.risk_level, "high");
  assertEquals(snapshot.recommended_intervention.kind, "repair");
});
