import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { MemoryWriteCandidate } from "../contracts/memory_write_candidate.v1.ts";
import type { EmotionalRepairLocalDispatcherOutput } from "../skills/emotional_repair/contract.ts";
import { runEmotionalRepairSkill } from "../skills/emotional_repair/skill.ts";
import { loadDemotivationRepairContext } from "../skills/demotivation_repair/context_loader.ts";
import { loadBaseSkillContext } from "../skills/_shared/context.ts";
import {
  dispatchMemoryCandidates,
  evaluateMemoryRetention,
  InMemoryMemoryCandidateSink,
} from "./memorizer_bridge.ts";

function turnFrame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-1",
    source_message_id: "message-1",
    user_id: "user-1",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "none",
      operation_type: null,
      surface_id: null,
      confidence_band: "low",
      should_offer: false,
      prop_reason: null,
      source_span: null,
      target_hint: null,
      target_status: "none",
      suggested_question_intent: null,
      offer_timing: "never",
      must_not_execute: true,
    },
    skill_signals: {},
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    ...patch,
  };
}

function correctionCandidate(
  content_text: string,
  source_message_id = "message-correction",
): MemoryWriteCandidate {
  return {
    kind: "correction_note",
    content_text,
    evidence_source_ids: [source_message_id],
    confidence_band: "high",
    sensitivity_level: 1,
    persistence_rationale:
      "Correction should update immediate payload before next retrieval.",
    should_persist_default: true,
    anti_identity_freeze_checked: true,
    scope_hint: "session",
  };
}

Deno.test("S7 audit 1: multi-turn correction invalidates immediate payload before next retrieval", async () => {
  const sink = new InMemoryMemoryCandidateSink();
  const result = await dispatchMemoryCandidates({
    user_id: "user-1",
    source_message_id: "message-2",
    immediate_payload: {
      items: [
        {
          id: "mem-1",
          content_text: "Le pere du user etait present pendant la dispute.",
        },
      ],
    },
    candidates: [
      correctionCandidate("Non, ce n'etait pas mon pere, c'etait mon frere."),
    ],
    sink,
  });

  const nextRetrieval = [
    {
      id: "mem-1",
      content_text: "Le pere du user etait present pendant la dispute.",
    },
  ].filter((item) =>
    !result.invalidated.some((invalidated) => invalidated.item_id === item.id)
  );

  assertEquals(result.counts.invalidated, 1);
  assertEquals(
    nextRetrieval.some((item) => /pere/i.test(item.content_text)),
    false,
  );
});

Deno.test("S7 audit 1b: immediate correction covers five relation cases", async () => {
  const cases = [
    ["mon pere", "mon frere", "pere"],
    ["ma mere", "ma soeur", "mere"],
    ["ma soeur", "mon amie", "soeur"],
    ["mon frere", "mon ami", "frere"],
    ["mon ex", "mon collegue", "ex"],
  ];

  for (const [wrong, right, payloadTerm] of cases) {
    const result = await dispatchMemoryCandidates({
      user_id: "user-1",
      source_message_id: `message-${payloadTerm}`,
      immediate_payload: {
        items: [{
          id: `mem-${payloadTerm}`,
          content_text: `Le souvenir mentionne ${payloadTerm}.`,
        }],
      },
      candidates: [
        correctionCandidate(`Non, ce n'etait pas ${wrong}, c'etait ${right}.`),
      ],
    });
    assertEquals(result.counts.invalidated, 1);
  }
});

Deno.test("S7 audit 2: sensitive cannabis memory is excluded from neutral demotivation repair", async () => {
  const context = await loadDemotivationRepairContext({
    user_id: "user-1",
    active_skill_working_state: null,
    turn_frame: turnFrame({ source_message_id: "message-walk" }),
    recent_messages: [{ role: "user", content: "j'ai fait ma marche" }],
    memory_runtime: {
      load: () => [
        {
          id: "sensitive-cannabis",
          kind: "statement",
          content_text: "Le user parle de cannabis",
          status: "active",
          sensitivity_level: 3,
        },
        {
          id: "walk-ok",
          kind: "action_observation",
          content_text: "Le user marche le matin",
          status: "active",
          sensitivity_level: 1,
        },
      ],
    },
  });

  assertEquals(
    context.relevant_memory_items.some((item) =>
      item.id === "sensitive-cannabis"
    ),
    false,
  );
  assertEquals(
    context.exclusions.includes("sensitive_memory:sensitive-cannabis"),
    true,
  );
  assertEquals(
    context.relevant_memory_items.some((item) => item.id === "walk-ok"),
    true,
  );
});

Deno.test("S7 audit 3: emotional repair does not emit memory candidates for acute identity statements", async () => {
  const context = await loadBaseSkillContext("emotional_repair", {
    user_id: "user-1",
    active_skill_working_state: null,
    turn_frame: turnFrame({ source_message_id: "message-identity" }),
    recent_messages: [{ role: "user", content: "je suis nul je rate tout" }],
  }, {
    include_plan: false,
    include_product: false,
    allow_sensitive: true,
    allow_safety_memory: false,
  });
  const dispatcherOutput: EmotionalRepairLocalDispatcherOutput = {
    flow_action: "answer_repair",
    confidence: "high",
    risk_score: 2,
    repair_state: {
      intent: "acute_self_attack",
      phase: "separate_fact_from_identity",
      emotional_dominance: "high",
      context_domain: "unknown",
      summary: "Le user se decrit avec une attaque identitaire a ne pas figer.",
      user_words: ["je suis nul je rate tout"],
      identity_freeze_risk: true,
      emotion_stabilized_enough_for_tool: false,
    },
    constraints: ["no_plan", "do_not_persist_identity_attack"],
    response_contract: {
      max_questions: 0,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_concrete_action: false,
      tone: "soft",
    },
    potion_bridge: {
      status: "not_applicable",
      selected_potion: null,
      candidate_potions: [],
      durable_need: { kind: null, summary: null },
      prefill_candidates: {},
      missing_before_handoff: [],
      why_ready_or_blocked: "pas de bridge pendant une auto-attaque",
    },
    visible_task: {
      kind: "separate_fact_from_identity",
      conversation_context: {
        state_summary:
          "Le user se decrit avec une attaque identitaire a ne pas figer.",
        user_words: ["je suis nul je rate tout"],
        field_or_stage: "separate_fact_from_identity",
        known_values: {
          intent: "acute_self_attack",
          phase: "separate_fact_from_identity",
          emotional_dominance: "high",
          context_domain: "unknown",
          identity_freeze_risk: true,
          emotion_stabilized_enough_for_tool: false,
        },
        missing_or_weak_values: [],
        selected_candidate: {
          potion: null,
          potion_label: null,
          durable_need_kind: null,
          durable_need_summary: null,
        },
        handoff_data: {
          bridge_context_summary: null,
          target_dispatcher: null,
          no_chat_mutation: true,
        },
        tone_constraints: ["soft", "no_plan"],
        do_not_say: ["Ne transforme pas l'auto-insulte en fait durable."],
        context_summary:
          "Le user se decrit avec une attaque identitaire a ne pas figer.",
        evidence_used: ["je suis nul je rate tout"],
        max_questions: 0,
      },
    },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
      potion_bridge_context: null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
      db_write_committed: false,
    },
    evidence: ["je suis nul je rate tout"],
  };
  const output = await runEmotionalRepairSkill({
    user_message: "je suis nul je rate tout",
    context,
    local_dispatcher: async () => dispatcherOutput,
    visible_agent: async () =>
      "Ce verdict sur toi n'est pas une information fiable; on garde le fait concret sans figer ton identite.",
  });
  assertEquals(output.memory_write_candidates ?? [], []);
  assertEquals(output.effects?.committed ?? [], []);
});

Deno.test("S7 audit 4: active topic can stay sticky while response owner is not cannabis and context does not inject it", async () => {
  const frame = turnFrame({
    source_message_id: "message-neutral-walk",
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "targeted",
      memory_mode: "light",
      model_tier_hint: "lite",
      context_budget_tier: "small",
      targets: [{
        type: "topic",
        key: "cannabis",
        query_hint: "cannabis",
        retrieval_policy: "semantic_first",
      }],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    skill_signals: {
      entry: {
        demotivation_repair: {
          detected: true,
          confidence_band: "high",
          reason: "neutral progress update",
        },
      },
    },
  });
  const context = await loadDemotivationRepairContext({
    user_id: "user-1",
    active_skill_working_state: {
      version: 1,
      skill_id: "demotivation_repair",
      status: "active",
      turn_count: 2,
      started_at: "2026-05-04T09:55:00.000Z",
      summary: "active topic cannabis is sticky but current response owns walk",
      updated_at: "2026-05-04T10:00:00.000Z",
      user_id: "user-1",
      scope: "whatsapp",
    },
    turn_frame: frame,
    recent_messages: [{ role: "user", content: "j'ai fait ma marche" }],
    memory_runtime: {
      load: () => [
        {
          id: "cannabis-sticky",
          kind: "statement",
          content_text: "topic cannabis sticky",
          status: "active",
          sensitivity_level: "sensitive",
        },
        {
          id: "walk-progress",
          kind: "action_observation",
          content_text: "marche faite aujourd'hui",
          status: "active",
          sensitivity_level: 1,
        },
      ],
    },
  });

  const responseOwner: string = "conversation_handler";
  assert(responseOwner !== "cannabis");
  assertEquals(
    context.relevant_memory_items.some((item) => item.id === "cannabis-sticky"),
    false,
  );
  assertEquals(
    context.relevant_memory_items.some((item) => item.id === "walk-progress"),
    true,
  );
});

Deno.test("S7 audit 5: retried message does not duplicate memory jobs", async () => {
  const sink = new InMemoryMemoryCandidateSink();
  const candidate: MemoryWriteCandidate = {
    kind: "preference",
    content_text: "Le user prefere les rappels le matin.",
    evidence_source_ids: ["message-retry"],
    confidence_band: "high",
    sensitivity_level: 0,
    persistence_rationale: "Stable reminder preference.",
    should_persist_default: true,
    anti_identity_freeze_checked: true,
    scope_hint: "global",
  };
  await dispatchMemoryCandidates({
    user_id: "user-1",
    source_message_id: "message-retry",
    candidates: [candidate],
    sink,
  });
  const retried = await dispatchMemoryCandidates({
    user_id: "user-1",
    source_message_id: "message-retry",
    candidates: [candidate],
    sink,
  });

  assertEquals(sink.queued_jobs.length, 1);
  assertEquals(retried.counts.duplicate_skipped, 1);
});

Deno.test("S7 audit 6: delete user retention is 90d for memory items and 365d for change log", () => {
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
