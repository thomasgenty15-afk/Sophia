import { assertEquals } from "jsr:@std/assert@1";

import type { PotionSupportContextV1 } from "./potion-support-context.ts";
import {
  advancePotionSupportCursor,
  evaluatePotionSupportQuietGate,
  preparePotionSupportOpening,
} from "./potion-support-runtime.ts";

const T0 = "2026-07-15T08:00:00.000Z";

function context(): PotionSupportContextV1 {
  return {
    version: 1,
    created_at: T0,
    potion_type: "apaisement",
    objective: {
      text: "Soutenir avant la présentation.",
      evidence_refs: [{
        source_type: "potion_answer",
        source_id: "potion_session:self",
        source_field: "pressure_source",
      }],
    },
    baseline_evidence: [{
      evidence_id: "potion_answer:potion_session:self:pressure_source:1",
      text: "Ma présentation de vendredi me met à cran.",
      source: {
        source_type: "potion_answer",
        source_id: "potion_session:self",
        source_field: "pressure_source",
      },
      observed_at: T0,
    }],
    rolling_evidence: [],
    cumulative_ledger: {
      grounded_facts: [],
      open_threads: [],
      user_boundaries: [],
      advisory_summary: null,
    },
    message_cursor: { created_at: T0, ids_at_boundary: ["already-read"] },
    opening_history: [],
    advisory_context: {
      topic_id: null,
      topic_confidence: null,
      user_named_theme: false,
      recent_conversation_available: false,
      thematic_memory_available: false,
    },
  };
}

class FakeQuery {
  constructor(
    private table: string,
    private supportContext: PotionSupportContextV1,
  ) {}
  select(_columns?: string) {
    return this;
  }
  eq(_column: string, _value: unknown) {
    return this;
  }
  in(_column: string, _value: unknown[]) {
    return this;
  }
  gte(_column: string, _value: unknown) {
    return this;
  }
  lte(_column: string, _value: unknown) {
    return this;
  }
  order(_column: string, _options?: unknown) {
    return this;
  }
  limit(_value: number) {
    return this;
  }
  maybeSingle() {
    return Promise.resolve({
      data: this.table === "user_potion_sessions"
        ? {
          id: "session-1",
          metadata: { potion_support_v1: this.supportContext },
        }
        : null,
      error: null,
    });
  }
  then(
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    const value = this.table === "chat_messages"
      ? {
        data: [{
          id: "already-read",
          role: "user",
          content: "ancien",
          scope: "whatsapp",
          created_at: T0,
        }, {
          id: "new-user-message",
          role: "user",
          content:
            "J'ai fait une répétition et la pression est un peu redescendue.",
          scope: "web",
          created_at: "2026-07-15T09:00:00.000Z",
        }],
        error: null,
      }
      : { data: null, error: null };
    return Promise.resolve(value).then(resolve, reject);
  }
}

function fakeAdmin(supportContext: PotionSupportContextV1) {
  return {
    from(table: string) {
      return new FakeQuery(table, supportContext);
    },
  } as any;
}

Deno.test("potion support quiet gate allows exactly at two hours", () => {
  const last = "2026-07-15T08:00:00.000Z";
  assertEquals(
    evaluatePotionSupportQuietGate({
      nowMs: new Date("2026-07-15T09:59:59.999Z").getTime(),
      lastExchangeAt: last,
    }).allowed,
    false,
  );
  assertEquals(
    evaluatePotionSupportQuietGate({
      nowMs: new Date("2026-07-15T10:00:00.000Z").getTime(),
      lastExchangeAt: last,
    }).allowed,
    true,
  );
});

Deno.test("potion support cursor keeps every id at the timestamp boundary", () => {
  const next = advancePotionSupportCursor({
    previous: { created_at: T0, ids_at_boundary: [] },
    messages: [{
      id: "a",
      role: "user",
      content: "A",
      scope: "web",
      created_at: "2026-07-15T09:00:00.000Z",
    }, {
      id: "b",
      role: "assistant",
      content: "B",
      scope: "whatsapp",
      created_at: "2026-07-15T09:00:00.000Z",
    }],
  });
  assertEquals(next.created_at, "2026-07-15T09:00:00.000Z");
  assertEquals(next.ids_at_boundary, ["a", "b"]);
});

Deno.test("potion support preparation accepts only known evidence ids", async () => {
  const validId = context().baseline_evidence[0].evidence_id;
  const result = await preparePotionSupportOpening({
    admin: fakeAdmin(context()),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      advisory_summary:
        "La pression semble avoir diminué après une répétition.",
      grounded_facts: [{
        text: "La présentation de vendredi créait de la pression.",
        evidence_ids: [validId],
      }],
      open_threads: [],
      user_boundaries: [],
      anchor_fact: {
        text: "Tu m'avais parlé de la pression autour de vendredi.",
        evidence_ids: [validId],
      },
      question_candidate: {
        text: "Est-ce que la répétition a changé quelque chose ?",
        evidence_ids: ["chat_message:new-user-message"],
      },
      opening_text:
        "Tu m'avais parlé de la pression autour de vendredi. La répétition a changé quelque chose pour toi ?",
    }),
  });
  assertEquals(result.decision, "send");
  assertEquals(result.integrated_message_ids, ["new-user-message"]);
  assertEquals(result.context_after.message_cursor.ids_at_boundary, [
    "new-user-message",
  ]);
  assertEquals(result.context_after.rolling_evidence.length, 1);

  const invalid = await preparePotionSupportOpening({
    admin: fakeAdmin(context()),
    userId: "user-1",
    sessionId: "session-1",
    dayIndex: 2,
    nowIso: "2026-07-15T10:00:00.000Z",
    llmRunner: async () => ({
      decision: "send",
      anchor_fact: { text: "Fait inventé", evidence_ids: ["missing-id"] },
      question_candidate: null,
      opening_text: "Je sais que tout va beaucoup mieux.",
    }),
  });
  assertEquals(invalid.decision, "skip_no_grounding");
  assertEquals(invalid.opening_text, null);
});
