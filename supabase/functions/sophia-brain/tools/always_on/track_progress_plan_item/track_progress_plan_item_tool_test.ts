import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  applyTrackProgressDirectEffectRuntimeState,
  pendingTrackProgressClarificationForDispatcher,
  resolveExplicitTrackDayList,
  runTrackProgressPlanItemDirectEffect,
  runTrackProgressPlanItemFromWeeklyCorrection,
  TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY,
  trackMessageIsAdditive,
  trackTargetEvidenceVerified,
} from "./router.ts";
import { runTrackProgressPlanItemV2 } from "./track_progress_plan_item_tool.ts";
import { isTrackProgressStatusQuestion } from "./intake.ts";
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
      // P4-A: id hors plan ET rien qui nomme un item du plan → blocked (la
      // résolution par nommage ne devine jamais sans recouvrement).
      name: "target-not-in-plan",
      message: "j'ai fait un truc aujourd'hui",
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
      // P4-A (paul-p3verify R1-B01): id LLM corrompu mais action NOMMÉE →
      // la cible se résout déterministiquement contre le plan et le commit
      // passe (au lieu d'un blocked que le composeur maquillait en succès).
      name: "target-id-corrompu-resolu-par-nommage",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            target_item_id: "walj",
            target_title: "walj",
            status_hint: "completed",
            target_evidence: "ma marche",
          },
        }],
      }),
      expected: "logged",
    },
    {
      name: "no-signal",
      turn_frame: frame({ direct_effects: [] }),
      expected: "none",
    },
  ];
  assertEquals(cases.length, 15);
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
      // P5-B (paul-p4verify Y2): lecture de progression — zéro effet, zéro
      // clarify parasite, même quand le dispatcher a émis un track.
      name: "progress count question does not write (P5-B)",
      message: "mes marches de la semaine, j'en suis à combien de faites ?",
      turn_frame: frame(),
      expectedStatus: "ignored",
      expectedIntent: "status_question",
      expectedReason: "status_question",
    },
    {
      // P5-B (nina-global20 T14): vérification explicite — lecture DB, pas de
      // ré-écriture ni de réaffirmation du narratif.
      name: "explicit verification question does not write (P5-B)",
      message: "t'es sûre que les 3 sont bien enregistrés ? vérifie stp",
      turn_frame: frame(),
      expectedStatus: "ignored",
      expectedIntent: "status_question",
      expectedReason: "status_question",
    },
    {
      // P6-F (nina-untested21 R1-B05): vérification de compte avec report
      // IMPLICITE embarqué → lecture, jamais un commit sans marqueur d'action.
      name: "count verification with implicit report does not write (P6-F)",
      message:
        "attends du coup ça me fait bien 3 verres cette semaine avec celui que j'ai fait aussi aujourd'hui, c'est ça ?",
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

Deno.test("correction avec source NOMMÉE dans le message → retarget résolu et exécuté, pas de re-question (P4-A, alex-global19 R1-B04)", async () => {
  const writes: Array<Record<string, unknown>> = [];
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
        // retarget_from ABSENT: correction à moitié émise — mais « pas le
        // carnet » nomme la cible d'origine dans le message.
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
    same_day_evidence_check: async () => null,
    write_progress: async (input) => {
      writes.push(input as Record<string, unknown>);
      return { logged_progress_id: "retarget-write", retarget_invalidated: true };
    },
  });
  assertEquals(result.status, "logged");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].retarget_from_item_id, "carnet");
  assertEquals(writes[0].correction, true);
  // P4-A (rose-hard16 R1-B01): le retrait est VISIBLE — committed + ledger.
  assertEquals(result.committed_effects[0]?.retarget_invalidated, true);
  assertEquals(
    result.committed_effects[0]?.retarget_from_title,
    "sortir le carnet",
  );
  assertEquals(result.superseded_effects?.length, 1);
  assertEquals(String(result.reply ?? "").includes("retiré"), true);
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
        // retarget_from ABSENT et le message ne nomme AUCUN autre item.
      },
    }],
  });
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "en fait c'était pas ça, c'est les écrans que j'ai faits",
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

Deno.test("marqueur ADDITIF → jamais de retarget ni de clarify de bascule, commit en plus (P4-A, nina-p3reval R1-B01/B02)", async () => {
  // (a) « note aussi Y » avec retarget_from émis par le dispatcher (le
  // parasite observé nina T4): le retarget TOMBE, la complétion précédente
  // n'est jamais invalidée.
  const writes: Array<Record<string, unknown>> = [];
  const additiveFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "water",
        target_title: "boire un grand verre d'eau",
        status_hint: "completed",
        target_evidence: "l'eau",
        correction: true,
        retarget_from: "breakfast",
      },
    }],
  });
  const result = await runTrackProgressPlanItemDirectEffect({
    message:
      "oui oui les deux, c'est bien en plus l'un de l'autre : note aussi l'eau en plus stp",
    plan_snapshot: [
      { id: "water", title: "boire un grand verre d'eau" },
      { id: "breakfast", title: "prendre un petit-déjeuner posé" },
    ],
    turn_frame: additiveFrame,
    // Le commit du tour précédent (petit-déj) est frais: sans le marqueur
    // additif, la garde de bascule aurait clarifié / le retarget invalidé.
    last_track_commit: {
      target_item_id: "breakfast",
      target_title: "prendre un petit-déjeuner posé",
      progress_status: "completed",
    },
    same_day_evidence_check: async () => null,
    write_progress: async (input) => {
      writes.push(input as Record<string, unknown>);
      return { logged_progress_id: "additive-write" };
    },
  });
  assertEquals(result.status, "logged");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].retarget_from_item_id, null);
  assertEquals(writes[0].correction, false);

  // (b) anti-faux-positif: le MÊME shape sans marqueur additif garde la
  // garde de bascule (clarify « en plus ou à la place ? »).
  const plainWrites: unknown[] = [];
  const plainFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "water",
        target_title: "boire un grand verre d'eau",
        status_hint: "completed",
        target_evidence: "l'eau",
      },
    }],
  });
  const plainResult = await runTrackProgressPlanItemDirectEffect({
    message: "note l'eau, ça compte dans mon suivi",
    plan_snapshot: [
      { id: "water", title: "boire un grand verre d'eau" },
      { id: "breakfast", title: "prendre un petit-déjeuner posé" },
    ],
    turn_frame: plainFrame,
    last_track_commit: {
      target_item_id: "breakfast",
      target_title: "prendre un petit-déjeuner posé",
      progress_status: "completed",
    },
    same_day_evidence_check: async () => null,
    write_progress: async (input) => {
      plainWrites.push(input);
      return { logged_progress_id: "should-not-write" };
    },
  });
  assertEquals(plainResult.status, "needs_clarify");
  assertEquals(plainResult.debug.reason_code, "target_switch_ambiguous");
  assertEquals(plainWrites.length, 0);

  // (c) anti-faux-positif inverse: une SUBSTITUTION explicite (« à la
  // place ») garde le retarget même si « en plus » n'apparaît pas.
  const substitutionWrites: Array<Record<string, unknown>> = [];
  const substitutionFrame = frame({
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "water",
        target_title: "boire un grand verre d'eau",
        status_hint: "completed",
        target_evidence: "l'eau",
        correction: true,
        retarget_from: "breakfast",
      },
    }],
  });
  const substitutionResult = await runTrackProgressPlanItemDirectEffect({
    message: "mets l'eau à la place du petit-déjeuner, je me suis trompée",
    plan_snapshot: [
      { id: "water", title: "boire un grand verre d'eau" },
      { id: "breakfast", title: "prendre un petit-déjeuner posé" },
    ],
    turn_frame: substitutionFrame,
    same_day_evidence_check: async () => null,
    write_progress: async (input) => {
      substitutionWrites.push(input as Record<string, unknown>);
      return {
        logged_progress_id: "substitution-write",
        retarget_invalidated: true,
      };
    },
  });
  assertEquals(substitutionResult.status, "logged");
  assertEquals(substitutionWrites[0].retarget_from_item_id, "breakfast");
});

Deno.test("liste explicite de jours → une entrée PAR jour aux bonnes dates (P4-B, rose-hard16 R1-B02 / paul-p3verify R1-B02)", async () => {
  const timeContext = {
    now_utc: "2026-07-13T16:30:00.000Z",
    user_timezone: "Europe/Paris",
    user_locale: "fr-FR",
    user_local_datetime: "2026-07-13T18:30",
    user_local_human: "dimanche 13 juillet, 18:30",
  };
  const runDayList = async (message: string) => {
    const writes: Array<Record<string, unknown>> = [];
    const result = await runTrackProgressPlanItemDirectEffect({
      message,
      plan_snapshot: [{ id: "pause", title: "micro-pause active" }],
      turn_frame: frame({
        direct_effect_time_context: timeContext,
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            target_item_id: "pause",
            target_title: "micro-pause active",
            status_hint: "completed",
            target_evidence: "micro-pause",
            date_hint: "2026-07-11",
          },
        }],
      } as Partial<TurnFrame>),
      same_day_evidence_check: async () => null,
      write_progress: async (input) => {
        writes.push(input as Record<string, unknown>);
        return { logged_progress_id: `entry-${writes.length}` };
      },
    });
    return { writes, result };
  };
  // Positif: « ces deux derniers soirs » → 2 entrées, J-1 puis J-2.
  const two = await runDayList(
    "ces deux derniers soirs j'ai bien tenu ma micro-pause, note ça",
  );
  assertEquals(two.result.status, "logged");
  assertEquals(two.writes.length, 2);
  assertEquals(two.writes[0].date_hint, "2026-07-12");
  assertEquals(two.writes[1].date_hint, "2026-07-11");
  assertEquals(two.result.committed_effects.length, 2);
  assertEquals(String(two.result.reply ?? "").includes("2 jours"), true);
  // Paraphrase: « hier et avant-hier » → mêmes 2 jours.
  const pair = await runDayList(
    "ma micro-pause je l'ai faite hier et avant-hier aussi, note ces deux jours-là",
  );
  assertEquals(pair.writes.length, 2);
  assertEquals(pair.writes[0].date_hint, "2026-07-12");
  assertEquals(pair.writes[1].date_hint, "2026-07-11");
  // Anti-faux-positif: « hier » seul → une seule entrée, confirmation
  // singulière (jamais « 2 jours »).
  const single = await runDayList(
    "j'ai fait ma micro-pause hier, note-le",
  );
  assertEquals(single.writes.length, 1);
  assertEquals(String(single.result.reply ?? "").includes("jours"), false);
  // P5-C (alex-untested20 R1-B01, nina-global20 B02): jours de semaine
  // NOMMÉS → une entrée par jour, résolus au plus récent passé (13/07 =
  // lundi → ve 10, sa 11, di 12).
  const weekdays = await runDayList(
    "j'ai tenu ma micro-pause vendredi, samedi et dimanche, compte-moi les trois",
  );
  assertEquals(weekdays.result.status, "logged");
  assertEquals(weekdays.writes.length, 3);
  assertEquals(
    weekdays.writes.map((write) => write.date_hint),
    ["2026-07-10", "2026-07-11", "2026-07-12"],
  );
  assertEquals(String(weekdays.result.reply ?? "").includes("3 jours"), true);
});

Deno.test("correction ADDITIVE de jours → dépliage quand même ; substitution de jour → jamais (P5-C, rose-hard17 R1-B02)", async () => {
  // Rose T11: « je l'ai pas fait qu'aujourd'hui, je l'ai aussi fait hier et
  // avant-hier » émis avec correction=true — le gate is_correction avalait
  // le dépliage (1 seule entrée + claim des deux jours).
  const writes: Array<Record<string, unknown>> = [];
  const result = await runTrackProgressPlanItemDirectEffect({
    message:
      "et en fait cartographier les envies je l'ai pas fait qu'aujourd'hui, je l'ai aussi fait hier et avant-hier. tu peux noter ces deux jours-là aussi stp ?",
    plan_snapshot: [{ id: "carto", title: "cartographier les envies" }],
    turn_frame: frame({
      direct_effect_time_context: {
        now_utc: "2026-07-13T20:00:00.000Z",
        user_timezone: "Europe/Paris",
        user_locale: "fr-FR",
        user_local_datetime: "2026-07-13T22:00",
        user_local_human: "lundi 13 juillet, 22:00",
      },
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "carto",
          target_title: "cartographier les envies",
          status_hint: "completed",
          target_evidence: "je l'ai aussi fait hier",
          date_hint: "2026-07-12",
          correction: true,
        },
      }],
    } as Partial<TurnFrame>),
    same_day_evidence_check: async () => null,
    write_progress: async (input) => {
      writes.push(input as Record<string, unknown>);
      return { logged_progress_id: `entry-${writes.length}` };
    },
  });
  assertEquals(result.status, "logged");
  assertEquals(writes.length, 2);
  assertEquals(writes.map((write) => write.date_hint), [
    "2026-07-12",
    "2026-07-11",
  ]);
  // Substitution (« pas hier, plutôt avant-hier ») → le resolver exclut le
  // jour nié : jamais de dépliage.
  assertEquals(
    resolveExplicitTrackDayList({
      message: "en fait c'était avant-hier, pas hier",
      user_local_date: "2026-07-13",
    }),
    null,
  );
  // Un seul jour de semaine nommé → chemin nominal (pas de liste).
  assertEquals(
    resolveExplicitTrackDayList({
      message: "j'ai fait ma marche vendredi",
      user_local_date: "2026-07-13",
    }),
    null,
  );
  // Jour de semaine nié exclu de la liste.
  assertEquals(
    resolveExplicitTrackDayList({
      message: "j'ai fait ma marche vendredi et samedi, mais pas dimanche",
      user_local_date: "2026-07-13",
    }),
    ["2026-07-10", "2026-07-11"],
  );
  // P6-D (eva-hard21 R1-B01): « hier soir ET ce soir, les deux » → J-1 + J0.
  assertEquals(
    resolveExplicitTrackDayList({
      message:
        "j'ai réussi à poser le téléphone en rentrant hier soir ET ce soir aussi, les deux soirs d'affilée. note-moi les deux",
      user_local_date: "2026-07-13",
    }),
    ["2026-07-12", "2026-07-13"],
  );
  // Anti-faux-positif: « hier » report + « ce soir » INTENTION future (aucun
  // marqueur d'affirmation double) → jamais de dépliage sur aujourd'hui.
  assertEquals(
    resolveExplicitTrackDayList({
      message: "j'ai posé le téléphone hier, et ce soir je vais essayer de lire",
      user_local_date: "2026-07-13",
    }),
    null,
  );
});

// ── P6-C (paul-hard21 R1-B01, eva-hard21 R1-B07) ────────────────────────────

Deno.test("cible track jamais résolue depuis le RAPPEL co-listé du même tour (P6-C, paul-hard21 R1-B01)", async () => {
  const runMultiEffect = async (args: {
    message: string;
    target_item_id: string;
    target_evidence: string;
  }) => {
    const writes: Array<Record<string, unknown>> = [];
    const result = await runTrackProgressPlanItemDirectEffect({
      message: args.message,
      plan_snapshot: [
        { id: "marche", title: "marcher 20 minutes" },
        { id: "affaires", title: "préparer ses affaires de sport" },
      ],
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            target_item_id: args.target_item_id,
            status_hint: "completed",
            target_evidence: args.target_evidence,
          },
        }, {
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            intent: "create",
            raw_text: args.message,
            when_hint: "ce soir à 20:00",
            UTC_time: "2026-07-13T18:00:00.000Z",
            local_label: "ce soir à 20:00",
            instruction_hint: "préparer mon sac de sport",
          },
        }],
      } as Partial<TurnFrame>),
      same_day_evidence_check: async () => null,
      write_progress: async (input) => {
        writes.push(input as Record<string, unknown>);
        return { logged_progress_id: "isolated-write" };
      },
    });
    return { writes, result };
  };
  // paul T1: le dispatcher a ciblé « affaires » (pollué par le texte du
  // rappel) alors que le report dit « j'ai marché 20 min ».
  const polluted = await runMultiEffect({
    message:
      "je viens de marcher 20 minutes à midi, c'était propre. et rappelle-moi ce soir de préparer mon sac de sport stp",
    target_item_id: "affaires",
    target_evidence: "préparer mon sac de sport",
  });
  assertEquals(polluted.result.status, "logged");
  assertEquals(polluted.writes.length, 1);
  assertEquals(polluted.writes[0].target_item_id, "marche");
  // Anti-faux-positif: la cible réellement rapportée (distincte du rappel)
  // reste intouchée.
  const clean = await runMultiEffect({
    message:
      "je viens de marcher 20 minutes à midi. et rappelle-moi ce soir de préparer mon sac de sport",
    target_item_id: "marche",
    target_evidence: "marcher 20 minutes",
  });
  assertEquals(clean.writes[0].target_item_id, "marche");
  // Aucun report hors du segment rappel → clarify, jamais un commit pollué.
  const unverifiable = await runMultiEffect({
    message: "rappelle-moi ce soir de préparer mon sac de sport",
    target_item_id: "affaires",
    target_evidence: "préparer mon sac de sport",
  });
  assertEquals(unverifiable.result.status, "needs_clarify");
  assertEquals(unverifiable.writes.length, 0);
});

Deno.test("additif accolé au verbe de report PRIME sur « au lieu de » descriptif (P6-C, eva-hard21 R1-B07)", () => {
  // eva T10: « note aussi que j'ai choisi mon activité (j'ai lu au lieu de
  // scroller) » — « au lieu de » décrit le CONTENU, pas une substitution de
  // suivi ; l'additif doit tenir.
  assertEquals(
    trackMessageIsAdditive(
      "note aussi que j'ai choisi mon activité de soirée ce soir (j'ai lu au lieu de scroller)",
    ),
    true,
  );
  assertEquals(
    trackMessageIsAdditive("en plus j'ai aussi fait ma marche, garde les deux"),
    true,
  );
  // Anti-faux-positif: une vraie substitution sans verbe de report additif
  // reste une substitution.
  assertEquals(
    trackMessageIsAdditive(
      "en fait c'était pas la marche, c'est la sortie à la place",
    ),
    false,
  );
});

// ── P5-E (eva-p4verify R1-B03/B04, paul-p4verify Y1) ────────────────────────

Deno.test("cible track : l'évidence nommée PRIME sur l'id LLM récent (P5-E, eva T10/T12)", async () => {
  const runResolution = async (args: {
    message: string;
    target_item_id: string;
    target_evidence: string;
  }) => {
    const writes: Array<Record<string, unknown>> = [];
    const result = await runTrackProgressPlanItemDirectEffect({
      message: args.message,
      plan_snapshot: [
        { id: "soiree", title: "faire une soirée sans réseaux" },
        { id: "phone", title: "poser le téléphone en rentrant" },
        { id: "activite", title: "choisir une activité de soirée" },
      ],
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            target_item_id: args.target_item_id,
            status_hint: "completed",
            target_evidence: args.target_evidence,
          },
        }],
      } as Partial<TurnFrame>),
      same_day_evidence_check: async () => null,
      write_progress: async (input) => {
        writes.push(input as Record<string, unknown>);
        return { logged_progress_id: "resolved-write" };
      },
    });
    return { writes, result };
  };
  // eva T10: additif « garde les deux » — l'id LLM porte l'item du tour
  // précédent (soiree), l'évidence nomme « posé le téléphone ».
  const additive = await runResolution({
    message:
      "en plus j'ai aussi posé le téléphone en rentrant ce soir, garde bien les deux hein",
    target_item_id: "soiree",
    target_evidence: "posé le téléphone en rentrant",
  });
  assertEquals(additive.result.status, "logged");
  assertEquals(additive.writes.length, 1);
  assertEquals(additive.writes[0].target_item_id, "phone");
  // eva T12: multi-intent — track émis sur le dernier item tracké (phone)
  // alors que l'évidence nomme « choisi une activité ».
  const multiIntent = await runResolution({
    message:
      "ce soir j'ai choisi une vraie activité de soirée au lieu de scroller, note-le et rappelle-moi demain 19h30 de préparer le sac",
    target_item_id: "phone",
    target_evidence: "choisi une vraie activité de soirée",
  });
  assertEquals(multiIntent.result.status, "logged");
  assertEquals(multiIntent.writes[0].target_item_id, "activite");
  // Anti-faux-positif: évidence vague → l'id LLM valide est conservé.
  const vague = await runResolution({
    message: "ça y est c'est fait, tu peux noter",
    target_item_id: "phone",
    target_evidence: "c'est fait",
  });
  assertEquals(vague.writes.length ? vague.writes[0].target_item_id : "phone", "phone");
});

Deno.test("additif avec évidence + cible haute-confiance COMMITTE (P5-E, paul-p4verify Y1)", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const result = await runTrackProgressPlanItemDirectEffect({
    message:
      "ah et note AUSSI que j'ai préparé mes affaires de sport ce matin, sac prêt dans l'entrée. les deux aujourd'hui du coup, la sortie ET les affaires, c'est bien en plus l'un de l'autre hein.",
    plan_snapshot: [
      { id: "sortie", title: "sortie active plus longue" },
      { id: "affaires", title: "préparer ses affaires de sport" },
    ],
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "affaires",
          target_title: "préparer ses affaires de sport",
          status_hint: "completed",
          target_evidence: "j'ai préparé mes affaires de sport",
        },
      }],
    } as Partial<TurnFrame>),
    same_day_evidence_check: async () => null,
    write_progress: async (input) => {
      writes.push(input as Record<string, unknown>);
      return { logged_progress_id: "affaires-write" };
    },
  });
  // Avant P5-E: blocked target_not_evidenced (« préparé » ≠ « preparer »,
  // « ses » diluait la couverture) → clarify parasite sur une action nommée
  // mot pour mot. Attendu: commit direct, zéro clarify.
  assertEquals(result.status, "logged");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].target_item_id, "affaires");
  // L'additif ne porte jamais correction/retarget (anti-destruction P4-A).
  assertEquals(writes[0].retarget_from_item_id ?? null, null);
});

Deno.test("retarget émis avec cible = SOURCE → l'arrivée se résout par nommage (P5-E, rose-hard17 R1-B03)", async () => {
  // « enlève-le du sas et mets-le sur cartographier » : le dispatcher fixait
  // target_item_id = retarget_from = sas (la source) — l'arrivée n'était pas
  // mappée et la clarify citait l'item à retirer.
  const writes: Array<Record<string, unknown>> = [];
  const result = await runTrackProgressPlanItemDirectEffect({
    message:
      "en fait enlève-le du sas de décompression et mets-le sur cartographier les envies stp",
    plan_snapshot: [
      { id: "sas", title: "faire un sas de décompression" },
      { id: "carto", title: "cartographier les envies" },
    ],
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "sas",
          status_hint: "completed",
          correction: true,
          retarget_from: "sas",
          target_evidence: "mets-le sur cartographier les envies",
        },
      }],
    } as Partial<TurnFrame>),
    same_day_evidence_check: async () => null,
    write_progress: async (input) => {
      writes.push(input as Record<string, unknown>);
      return { logged_progress_id: "carto-write", retarget_invalidated: true };
    },
  });
  assertEquals(result.status, "logged");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].target_item_id, "carto");
  assertEquals(writes[0].retarget_from_item_id, "sas");
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

// ── P8-A (eva-hard23 R1-B02): 3 soirs relatifs « hier, avant-hier et le soir
// d'avant » → dépliage J-1/J-2/J-3 (la 3e date était perdue: 2 entrées
// committées, rendu qui affirmait 3 dates dont une fantôme). ────────────────

Deno.test("« hier soir, avant-hier soir et le soir d'avant » → 3 jours J-1/J-2/J-3 (P8-A, eva-hard23 R1-B02)", () => {
  // Positif: la queue « d'avant » étend la combinaison hier+avant-hier à J-3.
  assertEquals(
    resolveExplicitTrackDayList({
      message:
        "j'ai bien fait ma routine hier soir, avant-hier soir et le soir d'avant, note les trois",
      user_local_date: "2026-07-14",
    }),
    ["2026-07-13", "2026-07-12", "2026-07-11"],
  );
  // Paraphrase: « le jour d'avant » (variante jour/soir).
  assertEquals(
    resolveExplicitTrackDayList({
      message: "hier, avant-hier et le jour d'avant aussi",
      user_local_date: "2026-07-14",
    }),
    ["2026-07-13", "2026-07-12", "2026-07-11"],
  );
  // Anti-faux-positif: « d'avant » NIÉ → la liste reste J-1/J-2.
  assertEquals(
    resolveExplicitTrackDayList({
      message: "hier et avant-hier, mais pas le soir d'avant",
      user_local_date: "2026-07-14",
    }),
    ["2026-07-13", "2026-07-12"],
  );
  // Anti-faux-positif: « le soir d'avant » SEUL (sans hier+avant-hier
  // affirmés) ne produit jamais de liste.
  assertEquals(
    resolveExplicitTrackDayList({
      message: "j'avais fait ma routine le soir d'avant",
      user_local_date: "2026-07-14",
    }),
    null,
  );
});

// ── P8-D (nina-hard23 T15, probe P8-4 passe 6): interrogative de vérif en
// 1re personne = LECTURE, jamais une écriture. ───────────────────────────────

Deno.test("« j'ai bien coché mon eau aujourd'hui ? » → status_question, zéro write (P8-D, probe P8-4 passe 6)", async () => {
  let writes = 0;
  // Positif: la question de vérif ne committe jamais, même avec un effet
  // armé par le dispatcher (variance de classification observée en live).
  const result = await runTrackProgressPlanItemDirectEffect({
    message: "et sinon j'ai bien coché mon eau aujourd'hui ?",
    plan_snapshot: [{ id: "water", title: "boire un grand verre d'eau" }],
    turn_frame: frame({
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          target_item_id: "water",
          status_hint: "completed",
          target_evidence: "mon eau",
        },
      }],
    } as any),
    write_progress: async () => {
      writes++;
      return { logged_progress_id: "never" };
    },
  });
  assertEquals(writes, 0);
  assertEquals(result.committed_effects, []);
  assertEquals(result.debug.reason_code, "status_question");

  // Paraphrase: cadre « c'est ça ? » sans point d'interrogation final direct.
  const paraphrase = await runTrackProgressPlanItemDirectEffect({
    message: "j'ai bien noté ma marche aujourd'hui, c'est ça",
    plan_snapshot: [{ id: "walk", title: "marche" }],
    turn_frame: frame(),
    write_progress: async () => {
      writes++;
      return { logged_progress_id: "never" };
    },
  });
  assertEquals(writes, 0);
  assertEquals(paraphrase.committed_effects, []);

  // Anti-faux-positif: le marqueur d'écriture IMPÉRATIF ré-ouvre l'écriture.
  const imperative = await runTrackProgressPlanItemDirectEffect({
    message: "j'ai bien coché mon eau ? sinon note-la moi stp",
    plan_snapshot: [{ id: "water", title: "boire un grand verre d'eau" }],
    turn_frame: frame(),
    write_progress: async () => {
      writes++;
      return { logged_progress_id: "p-1" };
    },
  });
  assertEquals(imperative.debug.reason_code !== "status_question", true);
});

Deno.test("P10-C: « ma cartographie, je L'ai bien cochée aujourd'hui ? il me semble » → status_question, zéro write (rose-p8reval T8)", () => {
  // Clitique objet + accord féminin + doute exprimé (sans « ? » final strict).
  const emptyFrame = { direct_effects: [] } as any;
  const question = isTrackProgressStatusQuestion(
    "dis-moi juste un truc: ma cartographie des envies, je l'ai bien cochée aujourd'hui? il me semble l'avoir faite ce matin mais je suis plus sûre.",
    emptyFrame,
  );
  assertEquals(question, true);
  // Paraphrase pluriel.
  assertEquals(
    isTrackProgressStatusQuestion(
      "mes deux marches, je les ai bien notées cette semaine ?",
      emptyFrame,
    ),
    true,
  );
  // Anti-faux-positif: l'impératif d'écriture ré-ouvre.
  assertEquals(
    isTrackProgressStatusQuestion(
      "je l'ai bien cochée ? sinon note-la moi maintenant",
      emptyFrame,
    ),
    false,
  );
});
