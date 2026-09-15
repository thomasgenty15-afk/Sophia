import { assertEquals } from "jsr:@std/assert@1";
import { buildMemoryTraceWindow } from "./memory_trace.ts";

Deno.test("buildMemoryTraceWindow groups router events, retrievals and injection under a turn", () => {
  const trace = buildMemoryTraceWindow({
    userId: "00000000-0000-0000-0000-000000000001",
    from: "2026-03-19T00:00:00.000Z",
    to: "2026-03-20T00:00:00.000Z",
    scope: "web",
    messages: [
      {
        id: "msg-user-1",
        role: "user",
        content: "Qu'est-ce que tu sais sur ma psychologie ?",
        scope: "web",
        created_at: "2026-03-19T10:00:00.000Z",
        metadata: {},
      },
      {
        id: "msg-assistant-1",
        role: "assistant",
        content: "Je vois surtout...",
        scope: "web",
        created_at: "2026-03-19T10:00:04.000Z",
        metadata: { request_id: "req-1" },
      },
    ],
    observabilityEvents: [
      {
        id: 1,
        created_at: "2026-03-19T10:00:01.000Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "router",
        event_name: "dispatcher.memory_plan_generated",
        payload: { memory_plan: { memory_mode: "dossier" } },
      },
      {
        id: 2,
        created_at: "2026-03-19T10:00:02.000Z",
        request_id: "req-1",
        channel: "web",
        scope: "web",
        source_component: "context_loader",
        event_name: "retrieval.global_completed",
        payload: { results: [{ full_key: "psychologie.identite" }] },
      },
      {
        id: 3,
        created_at: "2026-03-19T10:00:03.000Z",
        request_id: "req-1",
        channel: "web",
        scope: "web",
        source_component: "context_loader",
        event_name: "context.memory_injected",
        payload: { memory_blocks: { globals: { loaded: true } } },
      },
      {
        id: 4,
        created_at: "2026-03-19T10:00:03.500Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "router",
        event_name: "router.model_selected",
        payload: { model: "gemini-3-flash-preview" },
      },
    ],
    turnSummaries: [
      {
        created_at: "2026-03-19T10:00:05.000Z",
        request_id: "req-1",
        scope: "web",
        context_elements: ["global_memories_planned"],
        context_tokens: 1200,
        target_final: "companion",
        agent_model: "gemini-3-flash-preview",
      },
    ],
  });

  assertEquals(trace.summary.turns_total, 1);
  assertEquals(trace.turns[0]?.turn_id, "msg-user-1");
  assertEquals(
    (trace.turns[0]?.dispatcher.memory_plan as any)?.memory_mode,
    "dossier",
  );
  assertEquals(
    ((trace.turns[0]?.retrieval.globals as any)?.results?.[0] as any)?.full_key,
    "psychologie.identite",
  );
  assertEquals(
    ((trace.turns[0]?.injection as any)?.memory_blocks?.globals as any)?.loaded,
    true,
  );
  assertEquals(trace.turns[0]?.assistant_messages.length, 1);
});

Deno.test("buildMemoryTraceWindow groups memorizer events into sequential runs", () => {
  const trace = buildMemoryTraceWindow({
    userId: "00000000-0000-0000-0000-000000000001",
    from: "2026-03-19T00:00:00.000Z",
    to: "2026-03-20T00:00:00.000Z",
    scope: null,
    messages: [],
    observabilityEvents: [
      {
        id: 10,
        created_at: "2026-03-19T03:00:00.000Z",
        request_id: null,
        turn_id: null,
        channel: null,
        scope: null,
        source_component: "topic_memory",
        event_name: "memorizer.extraction_completed",
        payload: { source_type: "chat", extracted_counts: { durable_topics: 2 } },
      },
      {
        id: 11,
        created_at: "2026-03-19T03:00:01.000Z",
        request_id: null,
        turn_id: null,
        channel: null,
        scope: null,
        source_component: "topic_memory",
        event_name: "memorizer.validation_completed",
        payload: { accepted_counts: { topics: 1 } },
      },
      {
        id: 12,
        created_at: "2026-03-19T03:00:02.000Z",
        request_id: null,
        turn_id: null,
        channel: null,
        scope: null,
        source_component: "topic_memory",
        event_name: "memorizer.persistence_completed",
        payload: { counts: { topics_created: 1 } },
      },
    ],
    turnSummaries: [],
  });

  assertEquals(trace.memorizer_runs.length, 1);
  assertEquals(trace.memorizer_runs[0]?.source_type, "chat");
  assertEquals(
    ((trace.memorizer_runs[0]?.stages.extraction as any)?.extracted_counts as any)
      ?.durable_topics,
    2,
  );
  assertEquals(
    ((trace.memorizer_runs[0]?.stages.persistence as any)?.counts as any)
      ?.topics_created,
    1,
  );
});
