import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  applyTrackProgressDirectEffectRuntimeState,
  pendingTrackProgressClarificationForDispatcher,
  runTrackProgressPlanItemDirectEffect,
  runTrackProgressPlanItemFromWeeklyCorrection,
  TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY,
  trackTargetEvidenceVerified,
} from "./router.ts";
import { runTrackProgressPlanItemV2 } from "./track_progress_plan_item_tool.ts";
import { binaryItemPartialClarifyQuestion } from "./db.ts";

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
        target_evidence: "ma marche",
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
          payload_hint: { target_item_id: "walk", status_hint: "missed", target_evidence: "ma marche" },
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
          payload_hint: { target_item_id: "walk", status_hint: "partial", target_evidence: "ma marche" },
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
        payload_hint: { target_item_id: "walk", status_hint: "missed", target_evidence: "ma marche" },
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
          payload_hint: { target_item_id: "walk", status_hint: "partial", target_evidence: "ma marche" },
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
          payload_hint: { target_item_id: "walk", status_hint: "missed", target_evidence: "ma marche" },
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
          target_evidence: "ma marche",
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
    "contradiction: outcome oppose deja committe le meme jour -> blocked honnete sans offre, aucun write",
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
      assertEquals(result.status, "blocked");
      assertEquals(
        result.debug.reason_code,
        "contradicts_same_day_evidence",
      );
      assertEquals(result.committed_effects.length, 0);
      assertEquals(writes.length, 0);
      assert(String(result.reply ?? "").includes("marche"));
      // Pas d'offre de bascule inexecutable (paul-r5 B02): la reply dit ou
      // ca se corrige, sans question de confirmation.
      assert(!String(result.reply ?? "").includes("Tu veux que je corrige"));
      assert(String(result.reply ?? "").includes("Dashboard > Plan"));
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

Deno.test("pending clarification re-arm window: exposed once to the dispatcher, with known slots (eva-r2 B01)", async () => {
  // needs_clarify stocke la question + les slots connus dans temp_memory.
  const tempMemory: Record<string, unknown> = {};
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "la coupure n'a pas tenu ce soir-la",
    plan_snapshot: [{ id: "walk", title: "marche" }],
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "ambiguous",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
    write_progress: async () => ({ logged_progress_id: "never" }),
  });
  assertEquals(result.status, "needs_clarify");
  applyTrackProgressDirectEffectRuntimeState({
    temp_memory: tempMemory,
    result,
    source_message_id: "msg-13",
  });

  // Tour suivant: la clarification est exposee UNE fois au dispatcher.
  const first = pendingTrackProgressClarificationForDispatcher(tempMemory);
  assertEquals(first?.effect_type, "track_progress_plan_item");
  assertEquals((first?.clarify_question ?? "").length > 0, true);
  // Fenetre unique: la deuxieme lecture ne re-expose pas.
  const second = pendingTrackProgressClarificationForDispatcher(tempMemory);
  assertEquals(second, null);

  // Anti-faux-positif: un etat logged n'expose jamais de clarification.
  const loggedMemory: Record<string, unknown> = {
    [TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]: {
      mode: "logged",
      source_message_id: "msg-1",
    },
  };
  assertEquals(
    pendingTrackProgressClarificationForDispatcher(loggedMemory),
    null,
  );
});

Deno.test("target evidence contract: no quote or fabricated quote clarifies, real quote commits (G1)", async () => {
  const planSnapshot = [{
    id: "walk",
    title: "Faire 10 min de mouvement en rentrant",
    aliases: ["marche"],
  }];
  const trackFrame = (payload: Record<string, unknown>) =>
    frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: payload,
      }],
    });

  // Citation ABSENTE (cible devinee, "un autre truc du plan"): clarify.
  const noQuote = await runTrackProgressPlanItemDirectEffect({
    message: "j'ai avance sur un autre truc du plan cette semaine",
    plan_snapshot: planSnapshot,
    turn_frame: trackFrame({ target_item_id: "walk", status_hint: "completed" }),
    write_progress: async () => ({ logged_progress_id: "never" }),
  });
  assertEquals(noQuote.status, "needs_clarify");
  assertEquals(noQuote.debug.reason_code, "target_not_evidenced");
  assertEquals(noQuote.committed_effects, []);

  // Citation FABRIQUEE (les mots n'existent pas dans le message): clarify.
  const fabricated = await runTrackProgressPlanItemDirectEffect({
    message: "voila c'est fait pour ce soir",
    plan_snapshot: planSnapshot,
    turn_frame: trackFrame({
      target_item_id: "walk",
      status_hint: "completed",
      target_evidence: "mes 10 min de mouvement",
    }),
    write_progress: async () => ({ logged_progress_id: "never" }),
  });
  assertEquals(fabricated.status, "needs_clarify");
  assertEquals(fabricated.debug.reason_code, "target_not_evidenced");

  // Citation REELLE dans le message courant: commit direct, zero friction.
  const attested = await runTrackProgressPlanItemDirectEffect({
    message: "j'ai fait mes 10 min de mouvement en rentrant ce soir",
    plan_snapshot: planSnapshot,
    turn_frame: trackFrame({
      target_item_id: "walk",
      status_hint: "completed",
      target_evidence: "mes 10 min de mouvement",
    }),
    write_progress: async () => ({ logged_progress_id: "p-1" }),
  });
  assertEquals(attested.status, "logged");

  // Citation prise dans la fenetre (tour precedent qui nommait l'action).
  const windowAttested = await runTrackProgressPlanItemDirectEffect({
    message: "oui c'est fait",
    plan_snapshot: planSnapshot,
    turn_frame: trackFrame({
      target_item_id: "walk",
      status_hint: "completed",
      target_evidence: "ta marche de ce soir",
    }),
    evidence_messages: ["Tu veux qu'on parle de ta marche de ce soir ?"],
    write_progress: async () => ({ logged_progress_id: "p-2" }),
  });
  assertEquals(windowAttested.status, "logged");
});

Deno.test("trackTargetEvidenceVerified: verbatim containment, accent/case tolerant, zero business knowledge", () => {
  // Accents et casse normalises, rien d'autre.
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: "ma journee sans ecran",
      target_title: "Journée sans écran après 22h30",
      texts: ["J'ai reussi ma journée sans écran hier !"],
    }),
    true,
  );
  // Citation vide = pas de preuve.
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: "",
      target_title: "Journée sans écran",
      texts: ["peu importe"],
    }),
    false,
  );
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: null,
      target_title: "Journée sans écran",
      texts: ["x"],
    }),
    false,
  );
  // Citation reelle mais qui ne partage aucun mot avec le titre NI les
  // aliases de l'item choisi: la reference vague citee comme evidence
  // (le cas observe en probe: "un autre truc du plan").
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: "un autre truc du plan",
      target_title: "Planifier mes soirees de la semaine",
      texts: ["j'ai avance sur un autre truc du plan cette semaine"],
    }),
    false,
  );
  // Alias structurel = nom user-facing valide.
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: "ma marche",
      target_title: "Faire 10 min de mouvement en rentrant",
      target_aliases: ["marche"],
      texts: ["j'ai fait ma marche ce soir"],
    }),
    true,
  );
  // Citation fabriquee: "mes soirees de la semaine" n'existe pas telle
  // quelle dans le message (regression T7 du run r5).
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: "mes soirees de la semaine",
      target_title: "Planifier mes soirees de la semaine",
      texts: ["j'ai avance sur un autre truc du plan cette semaine"],
    }),
    false,
  );
});

Deno.test("retarget correction: invalidates the wrong item entry then commits on the corrected target (G2)", async () => {
  const writes: any[] = [];
  const result = await runTrackProgressPlanItemDirectEffect({
    message:
      "non c'etait la cartographie de mes ruminations, pas les soirees. corrige stp",
    plan_snapshot: [
      { id: "cartographie", title: "Cartographier mes ruminations du soir" },
      { id: "soirees", title: "Planifier mes soirees de la semaine" },
    ],
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "cartographie",
          status_hint: "completed",
          correction: true,
          retarget_from: "soirees",
          target_evidence: "la cartographie de mes ruminations",
        },
      }],
    }),
    write_progress: async (input) => {
      writes.push(input);
      return { logged_progress_id: "p-corrected" };
    },
  });
  assertEquals(result.status, "logged");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].target_item_id, "cartographie");
  assertEquals(writes[0].retarget_from_item_id, "soirees");
  assertEquals(
    result.committed_effects[0]?.target_title,
    "Cartographier mes ruminations du soir",
  );
});


Deno.test("partial sur item tout-ou-rien → needs_clarify, zero ecriture (nina-r7 B01, arbitrage 2026-07-08)", () => {
  // Positif: item framework sans compteur, report d'avancement → question.
  const clarify = binaryItemPartialClarifyQuestion({
    status: "partial",
    item: { dimension: "framework", target_reps: null, title: "Cartographier mes ruminations" },
    fallbackTitle: "item-id",
  });
  assertEquals(clarify !== null, true);
  assertEquals(clarify?.question.includes("encore en cours"), true);
  assertEquals(clarify?.target, "Cartographier mes ruminations");

  // Anti-faux-positifs: completed explicite → commit normal (pas de question);
  // item a compteur → partial garde son comportement (entry sans increment);
  // habitude → idem.
  assertEquals(
    binaryItemPartialClarifyQuestion({
      status: "completed",
      item: { dimension: "framework", target_reps: null, title: "X" },
      fallbackTitle: "id",
    }),
    null,
  );
  assertEquals(
    binaryItemPartialClarifyQuestion({
      status: "partial",
      item: { dimension: "framework", target_reps: 3, title: "X" },
      fallbackTitle: "id",
    }),
    null,
  );
  assertEquals(
    binaryItemPartialClarifyQuestion({
      status: "partial",
      item: { dimension: "habits", target_reps: null, title: "X" },
      fallbackTitle: "id",
    }),
    null,
  );
  // Fail-open: dimension inconnue (snapshot incomplet) → pas de blocage.
  assertEquals(
    binaryItemPartialClarifyQuestion({
      status: "partial",
      item: { dimension: "", target_reps: null, title: "X" },
      fallbackTitle: "id",
    }),
    null,
  );
});

Deno.test("partial sur une task a target_reps=1 → clarify: une task est tout-ou-rien (rejeu V6, probe nina)", () => {
  // Positif: le tour rouge de la probe — task boolean target_reps=1,
  // « j'ai avancé » n'a aucun etat intermediaire a ecrire.
  const clarify = binaryItemPartialClarifyQuestion({
    status: "partial",
    item: {
      kind: "task",
      dimension: "nutrition",
      target_reps: 1,
      tracking_type: "boolean",
      title: "Planifier deux dîners de la semaine",
    },
    fallbackTitle: "item-id",
  });
  assertEquals(clarify !== null, true);
  assertEquals(clarify?.target, "Planifier deux dîners de la semaine");

  // Task sans reps: binaire aussi.
  assertEquals(
    binaryItemPartialClarifyQuestion({
      status: "partial",
      item: { kind: "task", dimension: "sport", target_reps: null, title: "X" },
      fallbackTitle: "id",
    }) !== null,
    true,
  );
  // Anti-faux-positifs structurels:
  // task a repetitions reelles (>1) → etat intermediaire, pas de question.
  assertEquals(
    binaryItemPartialClarifyQuestion({
      status: "partial",
      item: { kind: "task", dimension: "sport", target_reps: 3, title: "X" },
      fallbackTitle: "id",
    }),
    null,
  );
  // habitude (meme boolean, meme reps=1): la cadence est l'etat intermediaire.
  assertEquals(
    binaryItemPartialClarifyQuestion({
      status: "partial",
      item: {
        kind: "habit",
        dimension: "nutrition",
        target_reps: 7,
        tracking_type: "boolean",
        title: "X",
      },
      fallbackTitle: "id",
    }),
    null,
  );
  // tracking quantifie (duree/quantite): un partial est reellement mesurable.
  assertEquals(
    binaryItemPartialClarifyQuestion({
      status: "partial",
      item: {
        kind: "task",
        dimension: "sport",
        target_reps: 1,
        tracking_type: "duration",
        title: "X",
      },
      fallbackTitle: "id",
    }),
    null,
  );
});

Deno.test("track NEGATIF: la description ne suffit pas à nommer la cible (P1-1, nina R1-B04)", async () => {
  const snapshotItem = {
    id: "option-saine",
    title: "Préparer une option saine à portée",
    description:
      "Vider les placards de ce qui est trop tentant et mettre une option saine visible",
  };
  // Rouge rejoué: « je vide mes placards » matche la DESCRIPTION mais ne
  // nomme pas l'action — un missed là-dessus est un échec non consenti.
  const writes: unknown[] = [];
  const blocked = await runTrackProgressPlanItemDirectEffect({
    message: "Je repousse depuis des jours, je devais vider mes placards.",
    plan_snapshot: [snapshotItem],
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "option-saine",
          target_title: "Préparer une option saine à portée",
          status_hint: "missed",
          target_evidence: "vider mes placards",
        },
      }] as any,
    }),
    write_progress: async (input) => {
      writes.push(input);
      return { logged_progress_id: "never" };
    },
  });
  assertEquals(blocked.status, "needs_clarify");
  assertEquals(blocked.debug.reason_code, "target_not_evidenced");
  assertEquals(blocked.committed_effects, []);
  assertEquals(writes.length, 0);

  // Positif: un raté explicitement rapporté qui NOMME l'action (token du
  // titre) s'écrit normalement.
  const committed = await runTrackProgressPlanItemDirectEffect({
    message: "J'ai zappé mon option saine hier, rien préparé.",
    plan_snapshot: [snapshotItem],
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "option-saine",
          target_title: "Préparer une option saine à portée",
          status_hint: "missed",
          target_evidence: "mon option saine",
        },
      }] as any,
    }),
    write_progress: async (input) => {
      writes.push(input);
      return { logged_progress_id: "progress-ok" };
    },
  });
  assertEquals(committed.status, "logged");
  assertEquals(writes.length, 1);

  // Anti-faux-positif: un report POSITIF garde la tolérance description
  // (friction basse, aucun échec écrit).
  const positive = await runTrackProgressPlanItemDirectEffect({
    message: "C'est bon, j'ai vidé mes placards de ce qui est trop tentant !",
    plan_snapshot: [snapshotItem],
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "option-saine",
          target_title: "Préparer une option saine à portée",
          status_hint: "completed",
          target_evidence: "vidé mes placards",
        },
      }] as any,
    }),
    write_progress: async (input) => {
      writes.push(input);
      return { logged_progress_id: "progress-ok-2" };
    },
  });
  assertEquals(positive.status, "logged");
  assertEquals(writes.length, 2);
});

// ── P2-4 (vague untested-surfaces 12/07) ────────────────────────────────────

Deno.test("G1: la cible nommée par Sophia au tour précédent + confirmation user vaut evidence pour un POSITIF (P2-4b, nina-untested R1-B03)", () => {
  // Le user confirme sans retaper le titre — le titre vit dans la fenêtre
  // d'évidence (message de Sophia du tour précédent).
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: "bah si je te confirme",
      target_title: "préparer une option saine à portée",
      target_aliases: [],
      texts: [
        "bah si je te confirme que c'est ça, à 100%, note-la",
        'Tu parles de quelle action exactement ? Je pensais à "préparer une option saine à portée" mais je préfère que tu me la nommes.',
      ],
      allow_window_title_match: true,
    }),
    true,
  );
  // MISSED: le nommage strict par le USER reste obligatoire (P1-1) — même
  // fenêtre, pas de fallback.
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: "bah si je te confirme",
      target_title: "préparer une option saine à portée",
      target_aliases: [],
      texts: [
        "bah si je te confirme que c'est raté, note-le",
        'Je pensais à "préparer une option saine à portée".',
      ],
      allow_window_title_match: false,
    }),
    false,
  );
  // Anti-faux-positif: titre absent de la fenêtre → le fallback ne sauve pas
  // une cible devinée.
  assertEquals(
    trackTargetEvidenceVerified({
      target_evidence: "un autre truc du plan",
      target_title: "préparer une option saine à portée",
      target_aliases: [],
      texts: ["j'ai fait un autre truc du plan"],
      allow_window_title_match: true,
    }),
    false,
  );
});

Deno.test("correction sans cible d'origine résoluble → clarify, jamais d'append silencieux (P2-4a, alex-untested R1-B01)", async () => {
  const writes: unknown[] = [];
  const correctionFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "screens",
        target_title: "réduire les écrans",
        status_hint: "completed",
        target_evidence: "les écrans",
        correction: true,
        // retarget_from ABSENT: correction à moitié émise (le bug observé).
      },
    }],
  });
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "c'était pas le carnet en fait, c'est les écrans que j'ai faits",
    plan_snapshot: [
      { id: "walk", title: "marche" },
      { id: "screens", title: "réduire les écrans" },
      { id: "carnet", title: "sortir le carnet" },
    ],
    turn_frame: correctionFrame,
    // Aucune entrée du jour sur la cible corrigée (écrans) → ce n'est PAS une
    // correction de statut → clarify.
    same_day_evidence_check: async () => null,
    write_progress: async (input) => {
      writes.push(input);
      return { logged_progress_id: "should-not-write" };
    },
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "correction_retarget_missing");
  assertEquals(writes.length, 0);
  assertEquals(String(result.reply ?? "").includes("?"), true);
});

Deno.test("correction de STATUT même item (retarget légitimement absent) écrit toujours (P2-4a anti-FP)", async () => {
  const writes: unknown[] = [];
  const statusCorrectionFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "walk",
        target_title: "marche",
        status_hint: "completed",
        target_evidence: "ma marche",
        correction: true,
      },
    }],
  });
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "finalement je l'ai faite ma marche, corrige",
    plan_snapshot: [{ id: "walk", title: "marche" }],
    turn_frame: statusCorrectionFrame,
    // Une entrée opposée du jour EXISTE sur la même cible → correction de
    // statut nominale (3h), la garde ne tire pas.
    same_day_evidence_check: async () => ({ outcome: "missed" }),
    write_progress: async (input) => {
      writes.push(input);
      return { logged_progress_id: "progress-corrected" };
    },
  });
  assertEquals(result.status, "logged");
  assertEquals(writes.length, 1);
});

// ── P3-C (paul-untested16 R1-B01) ───────────────────────────────────────────

Deno.test("correction avec last_track_commit frais → retarget auto-complété et EXÉCUTÉ (P3-C)", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const correctionFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "sortie",
        target_title: "sortie active",
        status_hint: "completed",
        target_evidence: "la sortie",
        correction: true,
        // retarget_from ABSENT — la moitié d'émission observée chez paul.
      },
    }],
  });
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "corrige : c'est la sortie que j'ai faite, pas les affaires",
    plan_snapshot: [
      { id: "affaires", title: "préparer ses affaires" },
      { id: "sortie", title: "sortie active" },
    ],
    turn_frame: correctionFrame,
    last_track_commit: {
      target_item_id: "affaires",
      target_title: "préparer ses affaires",
      progress_status: "completed",
    },
    write_progress: async (input) => {
      writes.push(input as Record<string, unknown>);
      return { logged_progress_id: "progress-retargeted" };
    },
  });
  assertEquals(result.status, "logged");
  assertEquals(writes.length, 1);
  // Le write porte la cible d'origine à invalider — le chemin retarget.
  assertEquals(writes[0].retarget_from_item_id, "affaires");
});

Deno.test("bascule de cible: date_hint = aujourd'hui ne contourne plus la garde (P3-C anti-trou)", async () => {
  const writes: unknown[] = [];
  const switchFrame = frame({
    direct_effect_time_context: {
      now_utc: "2026-07-13T10:00:00.000Z",
      user_timezone: "Europe/Paris",
      user_locale: "fr-FR",
      user_local_datetime: "2026-07-13T12:00",
      user_local_human: "lundi 13 juillet, 12:00",
    },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "sortie",
        target_title: "sortie active",
        status_hint: "completed",
        target_evidence: "la sortie",
        date_hint: "2026-07-13",
      },
    }],
  });
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "en fait c'est la sortie",
    plan_snapshot: [
      { id: "affaires", title: "préparer ses affaires" },
      { id: "sortie", title: "sortie active" },
    ],
    turn_frame: switchFrame,
    last_track_commit: {
      target_item_id: "affaires",
      target_title: "préparer ses affaires",
      progress_status: "completed",
    },
    write_progress: async (input) => {
      writes.push(input);
      return { logged_progress_id: "should-not-write" };
    },
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "target_switch_ambiguous");
  assertEquals(writes.length, 0);
});
