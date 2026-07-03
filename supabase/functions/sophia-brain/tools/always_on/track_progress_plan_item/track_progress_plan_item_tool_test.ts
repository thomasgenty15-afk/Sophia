import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  applyTrackProgressDirectEffectRuntimeState,
  runTrackProgressPlanItemDirectEffect,
  runTrackProgressPlanItemFromWeeklyCorrection,
  TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY,
} from "./router.ts";
import { runTrackProgressPlanItemV2 } from "./track_progress_plan_item_tool.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  const base: TurnFrame = {
    turn_id: "turn-progress",
    source_message_id: "message-progress",
    user_id: "user-progress",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "walk",
        target_title: "marche",
        status_hint: "completed",
      },
    }],
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
  };
  return {
    ...base,
    ...patch,
  };
}

Deno.test("track_progress_plan_item v2 covers success, clarify and blocked cases", async () => {
  const writes: unknown[] = [];
  const base = {
    message: "j'ai fait ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    write_progress: async (input: unknown) => {
      writes.push(input);
      return { logged_progress_id: `progress-${writes.length}` };
    },
  };
  const cases = [
    { name: "completed", turn_frame: frame(), expected: "logged" },
    {
      name: "missed",
      message: "j'ai rate ma marche",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk", status_hint: "missed" },
        }],
      }),
      expected: "logged",
      status: "missed",
    },
    {
      name: "partial",
      message: "j'ai fait la moitie de ma marche",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk", status_hint: "partial" },
        }],
      }),
      expected: "logged",
      status: "partial",
    },
    {
      name: "safety-medium",
      turn_frame: frame({
        safety: { risk_band: "medium", reason_codes: [], evidence: [] },
      }),
      expected: "blocked",
    },
    {
      name: "safety-critical",
      turn_frame: frame({
        safety: { risk_band: "critical", reason_codes: [], evidence: [] },
      }),
      expected: "blocked",
    },
    {
      name: "runtime-duplicate",
      turn_frame: frame(),
      recent_writes_idempotency: { source_message_ids: ["message-progress"] },
      expected: "blocked",
    },
    {
      name: "db-duplicate",
      turn_frame: frame(),
      db_idempotency_check: async () => true,
      expected: "blocked",
    },
    {
      name: "target-ambiguous",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "ambiguous",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "target-missing",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "missing",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "weak-intent",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "weak",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk" },
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "medium-confidence",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "medium",
          payload_hint: { target_item_id: "walk" },
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "future-intent",
      message: "je vais faire ma marche ce soir",
      turn_frame: frame(),
      expected: "blocked",
    },
    {
      name: "target-not-in-plan",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "missing", status_hint: "completed" },
        }],
      }),
      expected: "blocked",
    },
    {
      name: "no-signal",
      turn_frame: frame({ direct_effects: [] }),
      expected: "none",
    },
  ];
  assertEquals(cases.length, 14);
  for (const testCase of cases) {
    const outcome = await runTrackProgressPlanItemV2({
      ...base,
      message: testCase.message ?? base.message,
      turn_frame: testCase.turn_frame,
      recent_writes_idempotency: testCase.recent_writes_idempotency,
      db_idempotency_check: testCase.db_idempotency_check,
    });
    assertEquals(
      outcome.detected ? outcome.status : "none",
      testCase.expected,
      testCase.name,
    );
    if (outcome.detected && outcome.status === "logged" && testCase.status) {
      assertEquals(outcome.progress_status, testCase.status, testCase.name);
    }
  }
});

Deno.test("track_progress_plan_item v2 can coexist with product_help signal", async () => {
  const outcome = await runTrackProgressPlanItemV2({
    message: "j'ai rate ma marche, je suis nul",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    turn_frame: frame({
      skill_signals: {
        product_help: {
          detected: true,
          confidence_band: "high",
          reason: "product_question_near_progress",
        },
      },
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { target_item_id: "walk", status_hint: "missed" },
      }],
    }),
    write_progress: async () => ({ logged_progress_id: "progress-emotion" }),
  });
  assertEquals(outcome.detected && outcome.status, "logged");
});

Deno.test("track_progress_plan_item direct effect router returns canonical logged commits", async () => {
  const writes: unknown[] = [];
  const cases = [
    {
      name: "completed writes value=1",
      message: "j'ai fait ma marche",
      turn_frame: frame(),
      expectedIntent: "log_completed",
      expectedValue: 1,
    },
    {
      name: "partial writes value=0.5",
      message: "j'ai fait la moitie de ma marche",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk", status_hint: "partial" },
        }],
      }),
      expectedIntent: "log_partial",
      expectedValue: 0.5,
    },
    {
      name: "missed writes value=0",
      message: "j'ai rate ma marche",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk", status_hint: "missed" },
        }],
      }),
      expectedIntent: "log_missed",
      expectedValue: 0,
    },
  ] as const;

  for (const testCase of cases) {
    const result = await runTrackProgressPlanItemDirectEffect({
      message: testCase.message,
      plan_snapshot: [{ id: "walk", title: "marche" }],
      turn_frame: testCase.turn_frame,
      write_progress: async (input) => {
        writes.push(input);
        return { logged_progress_id: `progress-${writes.length}` };
      },
    });

    assertEquals(result.status, "logged", testCase.name);
    assertEquals(result.intent, testCase.expectedIntent, testCase.name);
    assertEquals(result.executed_tools, ["track_progress_plan_item"]);
    assertEquals(result.requested_effects.length, 1, testCase.name);
    assertEquals(result.allowed_effects.length, 1, testCase.name);
    assertEquals(
      result.requested_effects[0]?.value,
      testCase.expectedValue,
      testCase.name,
    );
    assertEquals(
      result.allowed_effects[0]?.value,
      testCase.expectedValue,
      testCase.name,
    );
    assertEquals(result.committed_effects.length, 1);
    assertEquals(
      result.committed_effects[0]?.logged_progress_id,
      `progress-${writes.length}`,
    );
    assertEquals(result.committed_effects[0]?.value, testCase.expectedValue);
    assert(result.reply?.toLowerCase().includes("noté"));
    assert(result.reply?.toLowerCase().includes("marqué"));
  }
});

Deno.test("track_progress_plan_item router surfaces already_tracked_today without recommitting", async () => {
  // Idempotence journaliere (Paul r1 T15): une entry identique (item, jour,
  // outcome) existe deja, ecrite par un autre message. Le writer signale
  // already_logged -> le router bloque avec raison structurelle, zero commit,
  // et garde la cible dans allowed_effects pour le contexte de confirmation.
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "je te confirme que j'ai fait ma marche",
    plan_snapshot: [{ id: "walk", title: "marche" }],
    turn_frame: frame(),
    write_progress: async () => ({
      logged_progress_id: "existing-entry-1",
      already_logged: true,
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "already_tracked_today");
  assertEquals(result.committed_effects, []);
  assertEquals(result.executed_tools, []);
  assertEquals(result.blocked_effects, [{
    type: "track_progress_plan_item",
    reason_code: "already_tracked_today",
  }]);
  assertEquals(result.allowed_effects[0]?.target_title, "marche");
});

Deno.test("track_progress_plan_item direct effect router blocks unsafe or ambiguous writes", async () => {
  const cases = [
    {
      name: "future intent blocks write",
      message: "je vais faire ma marche ce soir",
      turn_frame: frame(),
      expectedStatus: "blocked",
      expectedIntent: "future_intent",
      expectedReason: "future_intent",
    },
    {
      name: "target not in plan blocks",
      message: "j'ai fait ma marche",
      plan_snapshot: [{ id: "other", title: "autre" }],
      turn_frame: frame(),
      expectedStatus: "blocked",
      expectedIntent: "ignore",
      expectedReason: "target_not_in_plan",
    },
    {
      name: "duplicate source message blocks write",
      message: "j'ai fait ma marche",
      turn_frame: frame(),
      recent_writes_idempotency: { source_message_ids: ["message-progress"] },
      expectedStatus: "blocked",
      expectedIntent: "ignore",
      expectedReason: "duplicate_source_message",
    },
    {
      name: "duplicate DB blocks write",
      message: "j'ai fait ma marche",
      turn_frame: frame(),
      db_idempotency_check: async () => true,
      expectedStatus: "blocked",
      expectedIntent: "ignore",
      expectedReason: "duplicate_db",
    },
    {
      name: "ambiguous target needs clarify",
      message: "j'ai fait ma marche",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "ambiguous",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expectedStatus: "needs_clarify",
      expectedIntent: "clarify",
      expectedReason: "target_ambiguous",
    },
    {
      name: "missing target needs clarify",
      message: "j'ai fait",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "missing",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expectedStatus: "needs_clarify",
      expectedIntent: "clarify",
      expectedReason: "target_missing",
    },
    {
      name: "missing status needs clarify",
      message: "ma marche",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk" },
        }],
      }),
      expectedStatus: "needs_clarify",
      expectedIntent: "clarify",
      expectedReason: "status_missing",
    },
    {
      name: "status question does not write",
      message: "est ce que tu as note ma marche ?",
      turn_frame: frame(),
      expectedStatus: "ignored",
      expectedIntent: "status_question",
      expectedReason: "status_question",
    },
    {
      name: "global no-mutation context blocks write",
      message: "sans rien modifier, j'ai fait ma marche",
      turn_frame: frame(),
      no_mutation_requested: true,
      expectedStatus: "blocked",
      expectedIntent: "ignore",
      expectedReason: "global_no_mutation_context",
    },
    {
      name: "external blocked reason blocks write",
      message: "j'ai fait ma marche",
      turn_frame: frame(),
      blocked_reason_code: "attack_keyword_trigger_is_not_completion",
      expectedStatus: "blocked",
      expectedIntent: "ignore",
      expectedReason: "attack_keyword_trigger_is_not_completion",
    },
  ] as const;

  for (const testCase of cases) {
    const writes: unknown[] = [];
    const overrides = testCase as {
      plan_snapshot?: unknown;
      recent_writes_idempotency?: { source_message_ids: string[] };
      db_idempotency_check?: (key: string) => Promise<boolean>;
      no_mutation_requested?: boolean;
      blocked_reason_code?: string;
    };
    const result = await runTrackProgressPlanItemDirectEffect({
      message: testCase.message,
      plan_snapshot: overrides.plan_snapshot ??
        [{ id: "walk", title: "marche" }],
      turn_frame: testCase.turn_frame,
      recent_writes_idempotency: overrides.recent_writes_idempotency,
      db_idempotency_check: overrides.db_idempotency_check,
      no_mutation_requested: overrides.no_mutation_requested,
      blocked_reason_code: overrides.blocked_reason_code,
      write_progress: async (input) => {
        writes.push(input);
        return { logged_progress_id: "should-not-write" };
      },
    });

    assertEquals(result.status, testCase.expectedStatus, testCase.name);
    assertEquals(result.intent, testCase.expectedIntent, testCase.name);
    assertEquals(result.debug.reason_code, testCase.expectedReason);
    assertEquals(result.executed_tools, [], testCase.name);
    assertEquals(result.allowed_effects, [], testCase.name);
    assertEquals(result.committed_effects, [], testCase.name);
    assertEquals(writes.length, 0, testCase.name);
    assert(
      !/\b(not[eé]|valid[eé])\b/i.test(String(result.reply ?? "")),
      testCase.name,
    );
  }
});

Deno.test("track_progress_plan_item direct effect router fails closed without logged_progress_id", async () => {
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "j'ai fait ma marche",
    plan_snapshot: [{ id: "walk", title: "marche" }],
    turn_frame: frame(),
    write_progress: async () => ({ logged_progress_id: "" }),
  });

  assertEquals(result.status, "failed");
  assertEquals(result.executed_tools, []);
  assertEquals(result.requested_effects.length, 1);
  assertEquals(result.allowed_effects.length, 1);
  assertEquals(result.committed_effects, []);
  assertEquals(result.reply, null);
});

Deno.test("track_progress_plan_item direct effect router fails closed when writer throws", async () => {
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "j'ai fait ma marche",
    plan_snapshot: [{ id: "walk", title: "marche" }],
    turn_frame: frame(),
    write_progress: async () => {
      throw new Error("boom");
    },
  });

  assertEquals(result.status, "failed");
  assertEquals(result.debug.reason_code, "write_failed");
  assertEquals(result.executed_tools, []);
  assertEquals(result.requested_effects.length, 1);
  assertEquals(result.allowed_effects.length, 1);
  assertEquals(result.committed_effects, []);
  assertEquals(result.reply, null);
});

Deno.test("weekly forgotten progress uses track_progress commit contract", async () => {
  const writes: unknown[] = [];
  const result = await runTrackProgressPlanItemFromWeeklyCorrection({
    user_id: "user-progress",
    target_item_id: "walk",
    target_title: "marche",
    progress_status: "completed",
    value: 2,
    date_hint: "2026-05-28",
    source_message_id: "weekly-message",
    write_progress: async (input) => {
      writes.push(input);
      return { logged_progress_id: "progress-weekly" };
    },
  });

  assertEquals(result.status, "logged");
  assertEquals(result.intent, "log_completed");
  assertEquals(result.executed_tools, []);
  assertEquals(result.requested_effects.length, 1);
  assertEquals(result.allowed_effects.length, 1);
  assertEquals(result.committed_effects.length, 1);
  assertEquals(
    result.committed_effects[0]?.logged_progress_id,
    "progress-weekly",
  );
  assertEquals(result.committed_effects[0]?.value, 2);
  assertEquals(writes.length, 1);
});

Deno.test("track_progress_plan_item runtime state uses canonical key only", async () => {
  const tempMemory: Record<string, unknown> = {};
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "j'ai fait ma marche",
    plan_snapshot: [{ id: "walk", title: "marche" }],
    turn_frame: frame(),
    write_progress: async () => ({ logged_progress_id: "progress-runtime" }),
  });

  const runtime = applyTrackProgressDirectEffectRuntimeState({
    temp_memory: tempMemory,
    result,
    source_message_id: "message-progress",
  });

  assertEquals(runtime.toolExecution, "success");
  assertEquals(
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]?.mode,
    "logged",
  );
  const legacyKey = "__track_progress_" + "parallel";
  assertEquals((tempMemory as any)[legacyKey], undefined);
});

Deno.test("track_progress_plan_item intake normalizes dispatcher payload aliases", async () => {
  const { runTrackProgressIntake } = await import("./intake.ts");

  // Alias historique du prompt dispatcher: status_hint="done" + plan_item_id
  // (le nom du champ dans active_action_candidates_for_direct_effects).
  const aliased = runTrackProgressIntake({
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          plan_item_id: "sas-item",
          status_hint: "done",
        },
      }],
    }),
    message: "marque comme fait mon sas de décompression sans fumer stp",
  });
  assertEquals(aliased.detected, true);
  assertEquals(aliased.progress_status, "completed");
  assertEquals(aliased.intent, "log_completed");
  assertEquals(aliased.target_item_id, "sas-item");
  assertEquals(aliased.reason_code, "dispatcher_status_hint");

  // Le payload canonique reste prioritaire sur l'alias.
  const canonical = runTrackProgressIntake({
    turn_frame: frame(),
    message: "j'ai fait ma marche",
  });
  assertEquals(canonical.progress_status, "completed");
  assertEquals(canonical.target_item_id, "walk");

  // Anti-faux-positif: un statut inconnu reste bloque en clarify.
  const unknown = runTrackProgressIntake({
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "walk",
          status_hint: "maybe_later",
        },
      }],
    }),
    message: "je verrai pour ma marche",
  });
  assertEquals(unknown.intent, "clarify");
  assertEquals(unknown.reason_code, "status_missing");

  // Anti-faux-positif: une question de statut ne log jamais.
  const question = runTrackProgressIntake({
    turn_frame: frame(),
    message: "est-ce que tu as noté ma marche ?",
  });
  assertEquals(question.intent, "status_question");
});

Deno.test("track_progress same-day contradiction guard (BF-EFFECT-01 R2-B01)", async (t) => {
  const makeBase = () => {
    const writes: unknown[] = [];
    return {
      writes,
      base: {
        message: "j'ai rate ma marche",
        plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
        write_progress: async (input: unknown) => {
          writes.push(input);
          return { logged_progress_id: `progress-${writes.length}` };
        },
      },
    };
  };
  const missedFrame = (extraPayload: Record<string, unknown> = {}) =>
    frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "walk",
          status_hint: "missed",
          ...extraPayload,
        },
      }],
    });

  await t.step("positif: aucune evidence opposee -> commit", async () => {
    const { writes, base } = makeBase();
    const result = await runTrackProgressPlanItemDirectEffect({
      ...base,
      turn_frame: missedFrame(),
      same_day_evidence_check: async () => null,
    });
    assertEquals(result.status, "logged");
    assertEquals(result.committed_effects.length, 1);
    assertEquals(writes.length, 1);
  });

  await t.step(
    "contradiction: outcome oppose deja committe le meme jour -> needs_clarify, aucun write",
    async () => {
      const { writes, base } = makeBase();
      const result = await runTrackProgressPlanItemDirectEffect({
        ...base,
        turn_frame: missedFrame(),
        same_day_evidence_check: async () => ({
          entry_id: "entry-daily",
          outcome: "completed",
          source: "daily_action_review_v1",
        }),
      });
      assertEquals(result.status, "needs_clarify");
      assertEquals(
        result.debug.reason_code,
        "contradicts_same_day_evidence",
      );
      assertEquals(result.committed_effects.length, 0);
      assertEquals(writes.length, 0);
      assert(String(result.reply ?? "").includes("marche"));
      assert(
        result.blocked_effects.some((effect) =>
          effect.reason_code === "contradicts_same_day_evidence"
        ),
      );
    },
  );

  await t.step(
    "anti-faux-positif: correction explicite (payload_hint.correction) -> commit",
    async () => {
      const { writes, base } = makeBase();
      const result = await runTrackProgressPlanItemDirectEffect({
        ...base,
        message: "en fait non, je l'ai pas faite ma marche",
        turn_frame: missedFrame({ correction: true }),
        same_day_evidence_check: async () => ({
          entry_id: "entry-daily",
          outcome: "completed",
          source: "daily_action_review_v1",
        }),
      });
      assertEquals(result.status, "logged");
      assertEquals(result.committed_effects.length, 1);
      assertEquals(writes.length, 1);
    },
  );

  await t.step(
    "meme outcome deja committe: pas une contradiction, le guard laisse passer",
    async () => {
      const { writes, base } = makeBase();
      // Le check renvoie null pour un meme outcome (idempotence geree par
      // logPlanItemProgressV2/already_logged, pas par ce guard).
      const result = await runTrackProgressPlanItemDirectEffect({
        ...base,
        turn_frame: missedFrame(),
        same_day_evidence_check: async () => null,
      });
      assertEquals(result.status, "logged");
      assertEquals(writes.length, 1);
    },
  );
});
