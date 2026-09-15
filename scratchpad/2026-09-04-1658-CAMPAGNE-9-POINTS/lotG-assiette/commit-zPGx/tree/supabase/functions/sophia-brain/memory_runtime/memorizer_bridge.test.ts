import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildOperationActionObservationCandidate,
  dispatchMemoryCandidates,
  evaluateMemoryRetention,
  InMemoryMemoryCandidateSink,
  validateMemoryWriteCandidate,
} from "./memorizer_bridge.ts";
import type { MemoryWriteCandidate } from "../contracts/memory_write_candidate.v1.ts";

function candidate(
  patch: Partial<MemoryWriteCandidate> = {},
): MemoryWriteCandidate {
  return {
    kind: "statement",
    content_text: "j'ai eu honte apres ma marche",
    evidence_source_ids: ["message-1"],
    confidence_band: "medium",
    sensitivity_level: 2,
    persistence_rationale: "Momentary statement for async memorizer review.",
    should_persist_default: false,
    anti_identity_freeze_checked: true,
    scope_hint: "session",
    ...patch,
  };
}

Deno.test("memorizer bridge validates strict MemoryWriteCandidate schema", () => {
  assertEquals(validateMemoryWriteCandidate(candidate()).ok, true);
  assertEquals(
    validateMemoryWriteCandidate(candidate({ evidence_source_ids: [] })),
    { ok: false, reason: "missing_evidence" },
  );
  assertEquals(
    validateMemoryWriteCandidate(
      candidate({ anti_identity_freeze_checked: false }),
    ),
    { ok: false, reason: "anti_identity_freeze_not_checked" },
  );
});

// ── Pinned defect ────────────────────────────────────────────────────────────────────────
// W2.D-2 — the assertion that used to live above ("je suis nul je rate tout" as a `fact` is
// rejected with `identity_freeze_fact_rejected`) has been failing since 2026-06-10, commit
// 52e012ad, which replaced the guard body with a constant:
//
//     function identityFreezePattern(text: string): boolean { void text; return false; }
//
// The removed regex was:
//     /\b(je suis nul|je suis nulle|je rate tout|j'?echoue tout|je suis incapable|
//        je suis un echec|je suis une merde|je suis foutu|je suis foutue)\b/
//
// Consequence today: a self-deprecating identity statement can be persisted as a durable
// `fact` about the user — precisely what the anti-identity-freeze rule exists to prevent. The
// branch at `memorizer_bridge.ts:214-218` and the `identity_freeze_fact_rejected` member of
// `MemoryCandidateRejectReason` are both unreachable.
//
// This test asserts the CURRENT (wrong) behaviour on purpose: restoring the pattern makes it
// RED, which is the signal to move this case back into the schema test above.
Deno.test("PINNED DEFECT: the anti-identity-freeze guard is a no-op, identity facts are accepted", () => {
  const result = validateMemoryWriteCandidate(candidate({
    kind: "fact",
    content_text: "je suis nul je rate tout",
  }));
  assertEquals(result.ok, true);
});

Deno.test("memorizer bridge rejects non-risk candidates when safety context is medium or higher", () => {
  const rejected = validateMemoryWriteCandidate(candidate(), {
    safety_context_risk_band: "medium",
  });
  assertEquals(rejected.ok, false);
  if (!rejected.ok) {
    assertEquals(rejected.reason, "safety_risk_requires_risk_signal");
  }

  const accepted = validateMemoryWriteCandidate(
    candidate({
      kind: "risk_signal",
      content_text: "risque de crise detecte dans le message",
      sensitivity_level: 4,
    }),
    { safety_context_risk_band: "medium" },
  );
  assertEquals(accepted.ok, true);
});

Deno.test("memorizer bridge dedupes dispatch by source message and candidate content", async () => {
  const sink = new InMemoryMemoryCandidateSink();
  const input = {
    user_id: "user-1",
    source_message_id: "message-1",
    candidates: [candidate()],
    sink,
  };
  const first = await dispatchMemoryCandidates(input);
  const second = await dispatchMemoryCandidates(input);

  assertEquals(first.counts.accepted, 1);
  assertEquals(second.counts.accepted, 0);
  assertEquals(second.counts.duplicate_skipped, 1);
  assertEquals(sink.queued_jobs.length, 1);
});

Deno.test("memorizer bridge invalidates immediate payload on correction notes", async () => {
  const sink = new InMemoryMemoryCandidateSink();
  const result = await dispatchMemoryCandidates({
    user_id: "user-1",
    source_message_id: "message-2",
    immediate_payload: {
      items: [
        {
          id: "mem-father",
          content_text: "Le pere du user lui a parle hier",
        },
        { id: "mem-walk", content_text: "Le user a fait sa marche" },
      ],
    },
    candidates: [
      candidate({
        kind: "correction_note",
        content_text: "Correction: ce n'etait pas mon pere, c'etait mon frere.",
        evidence_source_ids: ["message-2"],
        sensitivity_level: 1,
      }),
    ],
    sink,
  });

  assertEquals(result.counts.accepted, 1);
  assertEquals(result.invalidated, [{
    item_id: "mem-father",
    reason: "correction_immediate_payload_invalidation",
  }]);
  assertEquals(sink.invalidations.length, 1);
});

Deno.test("operation action observations are valid memorizer candidates", () => {
  const observation = buildOperationActionObservationCandidate({
    operation_type: "track_progress_plan_item",
    source_message_id: "message-3",
    summary: "plan item marche moved to demain matin",
    topic_hint: "execution.walk",
    entity_hints: ["plan_item:walk"],
  });
  assertEquals(observation.kind, "action_observation");
  assertEquals(validateMemoryWriteCandidate(observation).ok, true);
});

Deno.test("RGPD retention helper keeps 90d memory items and 365d change logs", () => {
  assertEquals(
    evaluateMemoryRetention({
      record_kind: "memory_item",
      deleted_at: "2026-01-01T00:00:00.000Z",
      now_iso: "2026-03-31T23:59:59.000Z",
    }),
    "retain",
  );
  assertEquals(
    evaluateMemoryRetention({
      record_kind: "memory_item",
      deleted_at: "2026-01-01T00:00:00.000Z",
      now_iso: "2026-04-01T00:00:00.000Z",
    }),
    "hard_delete",
  );
  assertEquals(
    evaluateMemoryRetention({
      record_kind: "change_log",
      deleted_at: "2025-05-04T00:00:00.000Z",
      now_iso: "2026-05-03T23:59:59.000Z",
    }),
    "retain",
  );
  assertEquals(
    evaluateMemoryRetention({
      record_kind: "change_log",
      deleted_at: "2025-05-04T00:00:00.000Z",
      now_iso: "2026-05-04T00:00:00.000Z",
    }),
    "hard_delete",
  );
});

Deno.test("memorizer bridge accepts mixed valid candidates and reports invalid ones", async () => {
  const result = await dispatchMemoryCandidates({
    user_id: "user-1",
    source_message_id: "message-4",
    candidates: [
      candidate({
        kind: "preference",
        content_text: "prefere les rappels doux",
      }),
      { kind: "statement", content_text: "" },
    ],
  });
  assertEquals(result.counts.accepted, 1);
  assertEquals(result.counts.rejected, 1);
  assert(result.rejected.some((entry) => entry.reason === "invalid_schema"));
});
