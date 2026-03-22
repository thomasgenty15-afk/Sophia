import { assertEquals } from "jsr:@std/assert@1";
import { buildMemoryTraceWindow } from "./memory_trace.ts";
import {
  buildMemoryAnnotationTargetKey,
  buildMemoryTraceScorecard,
  type MemoryEvalAnnotation,
} from "./memory_scorecard.ts";

Deno.test("buildMemoryAnnotationTargetKey builds stable window and turn keys", () => {
  const windowKey = buildMemoryAnnotationTargetKey({
    userId: "00000000-0000-0000-0000-000000000001",
    scope: "web",
    windowFrom: "2026-03-19T00:00:00.000Z",
    windowTo: "2026-03-20T00:00:00.000Z",
    targetType: "window",
  });
  const turnKey = buildMemoryAnnotationTargetKey({
    userId: "00000000-0000-0000-0000-000000000001",
    scope: "web",
    windowFrom: "2026-03-19T00:00:00.000Z",
    windowTo: "2026-03-20T00:00:00.000Z",
    targetType: "turn",
    turnId: "turn-123",
  });

  assertEquals(
    windowKey,
    "window:00000000-0000-0000-0000-000000000001:web:2026-03-19T00:00:00.000Z:2026-03-20T00:00:00.000Z",
  );
  assertEquals(
    turnKey,
    "turn:00000000-0000-0000-0000-000000000001:web:2026-03-19T00:00:00.000Z:2026-03-20T00:00:00.000Z:turn-123",
  );
});

Deno.test("buildMemoryTraceScorecard aggregates memorizer, retrieval, injection, surface and annotations", () => {
  const trace = buildMemoryTraceWindow({
    userId: "00000000-0000-0000-0000-000000000001",
    from: "2026-03-19T00:00:00.000Z",
    to: "2026-03-20T00:00:00.000Z",
    scope: "web",
    messages: [
      {
        id: "msg-user-1",
        role: "user",
        content: "Je galère avec mes relations au travail",
        scope: "web",
        created_at: "2026-03-19T10:00:00.000Z",
        metadata: {},
      },
      {
        id: "msg-assistant-1",
        role: "assistant",
        content: "On peut regarder ça ensemble.",
        scope: "web",
        created_at: "2026-03-19T10:00:03.000Z",
        metadata: { request_id: "req-1" },
      },
    ],
    observabilityEvents: [
      {
        id: 1,
        created_at: "2026-03-19T03:00:00.000Z",
        request_id: null,
        turn_id: null,
        channel: null,
        scope: "web",
        source_component: "topic_memory",
        event_name: "memorizer.extraction_completed",
        payload: {
          source_type: "chat",
          extracted_counts: {
            durable_topics: 2,
            event_candidates: 1,
            global_memory_candidates: 1,
          },
        },
      },
      {
        id: 2,
        created_at: "2026-03-19T03:00:01.000Z",
        request_id: null,
        turn_id: null,
        channel: null,
        scope: "web",
        source_component: "topic_memory",
        event_name: "memorizer.validation_completed",
        payload: {
          accepted_counts: {
            topics: 1,
            events: 1,
            globals: 1,
          },
        },
      },
      {
        id: 3,
        created_at: "2026-03-19T03:00:02.000Z",
        request_id: null,
        turn_id: null,
        channel: null,
        scope: "web",
        source_component: "topic_memory",
        event_name: "memorizer.persistence_completed",
        payload: {
          counts: {
            topics_created: 1,
            topics_enriched: 0,
            topics_noop: 0,
            events_created: 1,
            events_updated: 0,
            events_noop: 0,
            global_memories_created: 1,
            global_memories_updated: 0,
            global_memories_noop: 0,
            global_memories_pending_compaction: 1,
          },
          outcomes: {
            topics: [{ slug: "topic-relations-travail", outcome: "created" }],
            events: [{ event_key: "event-001", outcome: "created" }],
            globals: [{
              full_key: "travail.relations_professionnelles",
              outcome: "created",
            }],
          },
        },
      },
      {
        id: 10,
        created_at: "2026-03-19T10:00:00.200Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "router",
        event_name: "dispatcher.memory_plan_generated",
        payload: {
          memory_plan: {
            memory_mode: "targeted",
          },
        },
      },
      {
        id: 11,
        created_at: "2026-03-19T10:00:00.300Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "router",
        event_name: "dispatcher.surface_plan_generated",
        payload: {
          surface_plan: {
            surface_mode: "guided",
            candidates: [{ surface_id: "dashboard.north_star" }],
          },
        },
      },
      {
        id: 12,
        created_at: "2026-03-19T10:00:01.000Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "context_loader",
        event_name: "retrieval.global_completed",
        payload: {
          results: [{ full_key: "travail.relations_professionnelles" }],
        },
      },
      {
        id: 13,
        created_at: "2026-03-19T10:00:01.100Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "context_loader",
        event_name: "retrieval.topic_completed",
        payload: {
          results: [{ slug: "topic-relations-travail" }],
        },
      },
      {
        id: 14,
        created_at: "2026-03-19T10:00:01.200Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "context_loader",
        event_name: "retrieval.event_completed",
        payload: {
          results: [{ event_key: "event-001" }],
        },
      },
      {
        id: 15,
        created_at: "2026-03-19T10:00:01.600Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "surface_state",
        event_name: "surface.state_transition",
        payload: {
          before: {
            entries: {
              "dashboard.north_star": { accepted_count: 0, ignored_count: 0 },
            },
          },
          after: {
            entries: {
              "dashboard.north_star": { accepted_count: 1, ignored_count: 0 },
            },
          },
          addon: {
            surface_id: "dashboard.north_star",
            level: 3,
          },
        },
      },
      {
        id: 16,
        created_at: "2026-03-19T10:00:01.800Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "context_loader",
        event_name: "context.memory_injected",
        payload: {
          estimated_tokens: 240,
          memory_blocks: {
            identity: { loaded: false, chars: 0 },
            events: { loaded: true, chars: 80 },
            globals: { loaded: true, chars: 150 },
            topics: { loaded: true, chars: 110 },
          },
        },
      },
      {
        id: 17,
        created_at: "2026-03-19T10:00:02.000Z",
        request_id: "req-1",
        turn_id: "msg-user-1",
        channel: "web",
        scope: "web",
        source_component: "router",
        event_name: "router.model_selected",
        payload: {
          model: "gemini-3-flash-preview",
          model_tier: "standard",
        },
      },
    ],
    turnSummaries: [
      {
        created_at: "2026-03-19T10:00:03.200Z",
        request_id: "req-1",
        channel: "web",
        scope: "web",
        context_profile: "companion",
        context_elements: ["global_memories_planned", "topic_memories_planned"],
        context_tokens: 240,
        target_final: "companion",
        agent_model: "gemini-3-flash-preview",
      },
    ],
  });

  const annotations: MemoryEvalAnnotation[] = [
    {
      reviewer_user_id: "00000000-0000-0000-0000-000000000099",
      user_id: "00000000-0000-0000-0000-000000000001",
      scope: "web",
      window_from: trace.window.from,
      window_to: trace.window.to,
      target_type: "window",
      target_key: buildMemoryAnnotationTargetKey({
        userId: trace.user_id,
        scope: trace.window.scope,
        windowFrom: trace.window.from,
        windowTo: trace.window.to,
        targetType: "window",
      }),
      dimension: "overall",
      label: "good",
    },
    {
      reviewer_user_id: "00000000-0000-0000-0000-000000000099",
      user_id: "00000000-0000-0000-0000-000000000001",
      scope: "web",
      window_from: trace.window.from,
      window_to: trace.window.to,
      target_type: "turn",
      target_key: buildMemoryAnnotationTargetKey({
        userId: trace.user_id,
        scope: trace.window.scope,
        windowFrom: trace.window.from,
        windowTo: trace.window.to,
        targetType: "turn",
        turnId: "msg-user-1",
      }),
      turn_id: "msg-user-1",
      request_id: "req-1",
      dimension: "retrieval",
      label: "partial",
    },
  ];

  const scorecard = buildMemoryTraceScorecard({ trace, annotations });

  assertEquals(scorecard.coverage.turns_total, 1);
  assertEquals(scorecard.identification.extracted.topics, 2);
  assertEquals(scorecard.identification.accepted.globals, 1);
  assertEquals(scorecard.identification.acceptance_rate.globals, 1);
  assertEquals(scorecard.persistence.topics.created, 1);
  assertEquals(scorecard.persistence.events.created, 1);
  assertEquals(scorecard.persistence.globals.pending_compaction, 1);
  assertEquals(scorecard.retrieval.turns_requesting_memory, 1);
  assertEquals(scorecard.retrieval.turns_with_any_retrieval_hit, 1);
  assertEquals(scorecard.retrieval.by_type.globals.hit_rate, 1);
  assertEquals(scorecard.injection.turns_with_any_memory_injected, 1);
  assertEquals(scorecard.injection.average_estimated_tokens, 240);
  assertEquals(scorecard.injection.average_memory_chars, 340);
  assertEquals(scorecard.injection.block_usage.globals, 1);
  assertEquals(scorecard.surface.turns_with_surface_plan, 1);
  assertEquals(scorecard.surface.turns_with_surface_addon, 1);
  assertEquals(scorecard.surface.average_level, 3);
  assertEquals(scorecard.surface.accepted_events, 1);
  assertEquals(scorecard.surface.by_surface["dashboard.north_star"]?.shown, 1);
  assertEquals(scorecard.reuse.topics.count, 1);
  assertEquals(scorecard.reuse.events.count, 1);
  assertEquals(scorecard.reuse.globals.count, 1);
  assertEquals(scorecard.annotations.total, 2);
  assertEquals(scorecard.annotations.by_label.good, 1);
  assertEquals(scorecard.annotations.by_dimension.retrieval, 1);
});
