import { assertEquals } from "jsr:@std/assert@1";
import {
  enterPresenceFlow,
  isPresenceExpired,
  type PresenceFlowState,
  stepPresenceFlow,
  withThreadSummary,
} from "./state.ts";

const T0 = "2026-07-09T20:00:00.000Z";

function baseState(
  overrides: Partial<PresenceFlowState> = {},
): PresenceFlowState {
  return {
    version: 1,
    entered_at: T0,
    entry_reason: "presence_conversation_entry",
    turns_in_flow: 1,
    topic_hint: "anxiété de performance",
    last_activity_at: T0,
    local_date: "2026-07-09",
    thread_summary: null,
    thread_summary_folded_count: 0,
    ...overrides,
  };
}

Deno.test("enterPresenceFlow seeds a fresh sticky state", () => {
  const s = enterPresenceFlow({
    nowIso: T0,
    localDate: "2026-07-09",
    topicHint: "porno/anxiété",
    entryReason: "presence_conversation_entry",
  });
  assertEquals(s.turns_in_flow, 1);
  assertEquals(s.topic_hint, "porno/anxiété");
  assertEquals(s.local_date, "2026-07-09");
  assertEquals(s.thread_summary, null);
  assertEquals(s.thread_summary_folded_count, 0);
});

Deno.test("maintain keeps the flow and advances the turn count", () => {
  const step = stepPresenceFlow({
    state: baseState(),
    kind: "maintain",
    nowIso: "2026-07-09T20:05:00.000Z",
    localDate: "2026-07-09",
  });
  assertEquals(step.status, "continue");
  if (step.status === "continue") {
    assertEquals(step.next_state.turns_in_flow, 2);
  }
});

Deno.test("ambiguous or method-question turns (kind=maintain) never exit", () => {
  // « oui mais comment ? » / « ? » / « concrètement je fais quoi ? » sont
  // classés maintain: le flow tient, la méthode se donne en conversation.
  const step = stepPresenceFlow({
    state: baseState({ turns_in_flow: 5 }),
    kind: "maintain",
    nowIso: "2026-07-09T20:10:00.000Z",
    localDate: "2026-07-09",
  });
  assertEquals(step.status, "continue");
});

Deno.test("tool_pull exits (pull produit → dispatcher global)", () => {
  const step = stepPresenceFlow({
    state: baseState(),
    kind: "tool_pull",
    nowIso: T0,
    localDate: "2026-07-09",
  });
  assertEquals(step.status, "exit");
  if (step.status === "exit") assertEquals(step.exit_reason, "tool_pull");
});

Deno.test("topic_change and closure exit with their reason", () => {
  for (const kind of ["topic_change", "closure"] as const) {
    const step = stepPresenceFlow({
      state: baseState(),
      kind,
      nowIso: T0,
      localDate: "2026-07-09",
    });
    assertEquals(step.status, "exit");
    if (step.status === "exit") assertEquals(step.exit_reason, kind);
  }
});

Deno.test("expiration wins over everything: 6h inactivity", () => {
  const step = stepPresenceFlow({
    state: baseState({ last_activity_at: "2026-07-09T13:00:00.000Z" }),
    kind: "maintain",
    nowIso: "2026-07-09T20:00:00.000Z", // +7h
    localDate: "2026-07-09",
  });
  assertEquals(step.status, "exit");
  if (step.status === "exit") assertEquals(step.exit_reason, "expired");
});

Deno.test("expiration on local day change", () => {
  assertEquals(
    isPresenceExpired({
      state: baseState(),
      nowIso: "2026-07-10T07:00:00.000Z",
      localDate: "2026-07-10",
    }),
    true,
  );
  // Même jour, moins de 6h: pas d'expiration.
  assertEquals(
    isPresenceExpired({
      state: baseState(),
      nowIso: "2026-07-09T22:00:00.000Z",
      localDate: "2026-07-09",
    }),
    false,
  );
});

// W2.B will delete this: le door-opener potion (PotionSupportPresenceEntryContext)
// est supprimé en W2.A; la Présence n'est plus armée que par attack_keyword.
Deno.test({
  name:
    "potion door-opener waits for semantic first-reply classification beyond 6h",
  ignore: true,
}, () => {
  const state = baseState({
    entry_reason: "potion_support_door_opener",
    // W2.A: PotionSupportPresenceEntryContext n'existe plus (cast conservé
    // pour garder le corps lisible; le test est ignoré, W2.B le supprime).
    entry_context: {
      source: "potion_support",
      source_potion_session_id: "session-1",
      recurring_reminder_id: "reminder-1",
      scheduled_checkin_id: "checkin-1",
      anchor_evidence_refs: [],
      awaiting_first_reply: true,
    } as any,
  });
  const related = stepPresenceFlow({
    state,
    kind: "maintain",
    nowIso: "2026-07-10T08:00:00.000Z",
    localDate: "2026-07-10",
  });
  assertEquals(related.status, "continue");
  if (related.status === "continue") {
    assertEquals(
      related.next_state.entry_context?.awaiting_first_reply,
      false,
    );
  }

  const unrelated = stepPresenceFlow({
    state,
    kind: "topic_change",
    nowIso: "2026-07-10T08:00:00.000Z",
    localDate: "2026-07-10",
  });
  assertEquals(unrelated.status, "exit");
  if (unrelated.status === "exit") {
    assertEquals(unrelated.exit_reason, "topic_change");
  }
});

Deno.test("withThreadSummary folds monotonically", () => {
  let s = baseState();
  s = withThreadSummary(s, "résumé v1", 20);
  assertEquals(s.thread_summary, "résumé v1");
  assertEquals(s.thread_summary_folded_count, 20);
  // Le curseur ne recule jamais.
  s = withThreadSummary(s, "résumé v2", 10);
  assertEquals(s.thread_summary, "résumé v2");
  assertEquals(s.thread_summary_folded_count, 20);
  s = withThreadSummary(s, "résumé v3", 40);
  assertEquals(s.thread_summary_folded_count, 40);
});
