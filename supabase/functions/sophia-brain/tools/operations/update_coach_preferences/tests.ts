import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type {
  CoachPreferenceLocalDispatcherOutput,
  CoachPreferenceLocalUpdate,
} from "./contract.ts";
import {
  createCoachPreferenceLocalFlowState,
  dispatcherSystemPrompt,
  reduceCoachPreferenceLocalDispatcherOutput,
} from "./local_flow.ts";
import { loadCoachPreferenceRuntimePolicy } from "./runtime_policy.ts";
import { maybeRunUpdateCoachPreferencesOperation } from "./router.ts";
import { buildCoachPreferencesStatusReply } from "./status.ts";

function baseDecision(
  patch: Partial<Omit<CoachPreferenceLocalDispatcherOutput, "visible_task">> & {
    visible_task?: Partial<
      CoachPreferenceLocalDispatcherOutput["visible_task"]
    >;
  } = {},
): CoachPreferenceLocalDispatcherOutput {
  const base: CoachPreferenceLocalDispatcherOutput = {
    flow_action: "write_preferences",
    confidence: "high",
    risk_score: 0,
    preference_intent: {
      kind: "durable_supported",
      durability: "durable",
      support_status: "supported",
      summary: "préférence coach durable claire",
    },
    preference_updates: [{
      key: "coach.question_tendency",
      value: "low",
      status: "locked",
      user_facing_label: "Questions",
      user_facing_value: "Peu de questions",
      reason: "Demande explicite durable.",
      needs_user_confirmation: false,
    }],
    unsupported_parts: [],
    missing_decisions: [],
    visible_task: {
      kind: "preference_saved",
      instruction: "Confirmer seulement après commit.",
      conversation_context: {
        state_summary: "préférence coach durable claire",
        user_words: [],
        field_or_stage: "done",
        known_values: {
          current_preferences: [],
          proposed_updates: [],
          committed_updates: [],
        },
        missing_or_weak_values: [],
        selected_candidate: {},
        unsupported_parts: [],
        write_result: {
          committed: false,
          preference_keys: [],
          blocked_reason: null,
        },
        inline_tool_result: {
          skill_id: null,
          summary: null,
        },
        tone_constraints: [],
        do_not_say: [
          "Ne pas dire que c'est enregistré si committed=false.",
        ],
        context_summary: "Confirmer seulement après commit.",
        evidence_used: ["test"],
      },
    },
    note_information: {
      needed: false,
    },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
    },
    evidence: ["test"],
  };
  return {
    ...base,
    ...patch,
    visible_task: {
      ...base.visible_task,
      ...(patch.visible_task ?? {}),
      conversation_context: patch.visible_task?.conversation_context ??
        base.visible_task.conversation_context,
    },
    note_information: patch.note_information ?? base.note_information,
  };
}

function fakeCoachSupabase(initialRows: any[] = []) {
  const state = {
    rows: [...initialRows],
    wrote: false,
    upsertedRows: [] as any[],
    failWrite: false,
  };
  const api = {
    state,
    from(_table: string) {
      const builder: any = {
        _mode: "select",
        _data: null as any,
        select() {
          return this;
        },
        eq() {
          return this;
        },
        like() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: state.rows[0] ?? null, error: null });
        },
        upsert(rows: any[]) {
          state.wrote = true;
          if (state.failWrite) {
            this._mode = "upsert_error";
            return this;
          }
          state.upsertedRows = rows.map((row, index) => ({
            id: `pref-${index + 1}`,
            ...row,
          }));
          for (const row of state.upsertedRows) {
            const existingIndex = state.rows.findIndex((candidate) =>
              candidate.user_id === row.user_id &&
              candidate.scope === row.scope &&
              candidate.key === row.key
            );
            if (existingIndex >= 0) state.rows[existingIndex] = row;
            else state.rows.push(row);
          }
          this._mode = "upsert";
          this._data = state.upsertedRows.map((row) => ({
            id: row.id,
            key: row.key,
          }));
          return this;
        },
        then(onFulfilled: (value: any) => unknown) {
          if (this._mode === "upsert_error") {
            return Promise.resolve({
              data: null,
              error: { message: "db_error" },
            }).then(onFulfilled);
          }
          if (this._mode === "upsert") {
            return Promise.resolve({ data: this._data, error: null }).then(
              onFulfilled,
            );
          }
          return Promise.resolve({ data: state.rows, error: null }).then(
            onFulfilled,
          );
        },
      };
      return builder;
    },
  };
  return api as any;
}

const visibleAgent = (message: string) => () => Promise.resolve(message);

Deno.test("reducer allows locked supported durable update as write-ready", () => {
  const reduced = reduceCoachPreferenceLocalDispatcherOutput({
    previous: null,
    output: baseDecision(),
  });
  assertEquals(reduced.status, "write_ready");
  assertEquals(reduced.write_updates[0].key, "coach.question_tendency");
  assertEquals(reduced.write_updates[0].value, "low");
  assertEquals(reduced.blocked_effects, []);
});

Deno.test("reducer blocks proposed, ambiguous, unsupported, punctual, invalid and low confidence writes", () => {
  const proposed = reduceCoachPreferenceLocalDispatcherOutput({
    previous: null,
    output: baseDecision({
      flow_action: "propose_supported_mapping",
      preference_intent: {
        kind: "durable_unsupported",
        durability: "durable",
        support_status: "partial",
        summary: "mapping partiel",
      },
      preference_updates: [{
        ...(baseDecision().preference_updates[0]),
        status: "proposed",
        needs_user_confirmation: true,
      }],
      visible_task: {
        kind: "confirm_supported_mapping",
        instruction: "Confirmer le mapping.",
      },
    }),
  });
  assertEquals(proposed.status, "proposed");
  assertEquals(proposed.write_updates, []);

  const partialLockedWrite = reduceCoachPreferenceLocalDispatcherOutput({
    previous: null,
    output: baseDecision({
      flow_action: "write_preferences",
      preference_intent: {
        kind: "durable_supported",
        durability: "durable",
        support_status: "supported",
        summary: "Réglage supporté avec une condition de portée non stockable.",
      },
      preference_updates: [{
        ...(baseDecision().preference_updates[0]),
        status: "locked",
        needs_user_confirmation: false,
      }],
      unsupported_parts: ["application uniquement quand le user bloque"],
      visible_task: {
        kind: "preference_saved",
        instruction: "Ne devrait pas écrire directement.",
      },
    }),
  });
  assertEquals(partialLockedWrite.status, "proposed");
  assertEquals(
    partialLockedWrite.reason_code,
    "update_coach_preferences_partial_mapping_requires_confirmation",
  );
  assertEquals(partialLockedWrite.write_updates, []);
  assertEquals(partialLockedWrite.visible_task, "confirm_supported_mapping");
  assertEquals(
    partialLockedWrite.local_state?.proposed_updates[0]?.status,
    "proposed",
  );
  assertEquals(
    partialLockedWrite.local_state?.proposed_updates[0]
      ?.needs_user_confirmation,
    true,
  );
  assertEquals(
    partialLockedWrite.conversation_context.unsupported_parts,
    ["application uniquement quand le user bloque"],
  );
  assertEquals(
    partialLockedWrite.conversation_context.missing_or_weak_values.includes(
      "confirmation",
    ),
    true,
  );

  for (
    const output of [
      baseDecision({
        confidence: "low",
      }),
      baseDecision({
        preference_intent: {
          kind: "ambiguous",
          durability: "ambiguous",
          support_status: "ambiguous",
          summary: "ambigu",
        },
      }),
      baseDecision({
        preference_intent: {
          kind: "durable_unsupported",
          durability: "durable",
          support_status: "unsupported",
          summary: "unsupported",
        },
      }),
      baseDecision({
        preference_intent: {
          kind: "punctual_instruction",
          durability: "punctual",
          support_status: "not_applicable",
          summary: "ponctuel",
        },
      }),
      baseDecision({
        preference_updates: [{
          ...(baseDecision().preference_updates[0]),
          value: "emoji" as CoachPreferenceLocalUpdate["value"],
        }],
      }),
    ]
  ) {
    const reduced = reduceCoachPreferenceLocalDispatcherOutput({
      previous: null,
      output,
    });
    assertEquals(reduced.write_updates, []);
    assert(
      reduced.status === "blocked" || reduced.status === "collecting",
      `unexpected status ${reduced.status}`,
    );
  }
});

Deno.test("confirmation of active proposal becomes write-ready without parsing the message", () => {
  const previous = createCoachPreferenceLocalFlowState({
    status: "proposed",
    currentStage: "confirmation",
    proposedUpdates: [{
      key: "coach.question_tendency",
      value: "low",
      status: "proposed",
      user_facing_label: "Questions",
      user_facing_value: "Peu de questions",
      reason: "Mapping proposé.",
      needs_user_confirmation: true,
    }],
  });
  const reduced = reduceCoachPreferenceLocalDispatcherOutput({
    previous,
    output: baseDecision({
      flow_action: "confirm_proposed_mapping",
      preference_updates: [],
    }),
  });
  assertEquals(reduced.status, "write_ready");
  assertEquals(reduced.write_updates[0].status, "locked");
  assertEquals(reduced.write_updates[0].needs_user_confirmation, false);

  const resolvedConditionalScope = reduceCoachPreferenceLocalDispatcherOutput({
    previous,
    output: baseDecision({
      flow_action: "confirm_proposed_mapping",
      preference_intent: {
        kind: "durable_supported",
        durability: "durable",
        support_status: "supported",
        summary:
          "Le user confirme que la proposition devient un réglage général durable.",
      },
      preference_updates: [],
      unsupported_parts: [
        "ancienne condition non stockable résolue en général",
      ],
      missing_decisions: [],
    }),
  });
  assertEquals(resolvedConditionalScope.status, "write_ready");
  assertEquals(resolvedConditionalScope.write_updates[0].status, "locked");

  const stillConditionalScope = reduceCoachPreferenceLocalDispatcherOutput({
    previous,
    output: baseDecision({
      flow_action: "confirm_proposed_mapping",
      preference_intent: {
        kind: "durable_unsupported",
        durability: "durable",
        support_status: "partial",
        summary:
          "Le user confirme seulement la condition non stockable, pas un réglage général.",
      },
      preference_updates: [],
      unsupported_parts: ["application seulement quand le user bloque"],
      missing_decisions: ["confirmation"],
    }),
  });
  assertEquals(stillConditionalScope.status, "proposed");
  assertEquals(stillConditionalScope.write_updates, []);
  assertEquals(
    stillConditionalScope.reason_code,
    "update_coach_preferences_partial_mapping_requires_confirmation",
  );
});

Deno.test("direct clear write commits user_profile_facts and emits committed effect", async () => {
  const supabase = fakeCoachSupabase();
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage: "À partir de maintenant, pose-moi moins de questions.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "test",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    safetyPregateOutput: { risk_band: "none", evidence: [] } as any,
    sourceMessageId: "m1",
    requestId: "op1",
    runLocalDispatcher: () => Promise.resolve(baseDecision()),
    runVisibleAgent: visibleAgent(
      "C'est noté : je poserai moins de questions.",
    ),
  });
  assertEquals(runtime?.toolExecution, "success");
  assertEquals(runtime?.executedTools, ["update_coach_preferences"]);
  assertEquals((runtime?.toolSkillRun as any)?.pending_confirmation, null);
  assertEquals((runtime?.toolSkillRun as any)?.platform_handoff, undefined);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects[0], {
    type: "update_coach_preferences",
    operation_id: "op1",
    preference_keys: ["coach.question_tendency"],
    preferences_update_ids: ["pref-1"],
  });
  assertEquals(supabase.state.wrote, true);
  assertEquals(supabase.state.rows[0].key, "coach.question_tendency");
  assertEquals(supabase.state.rows[0].value.value, "low");
});

Deno.test("punctual and unsupported requests do not write or claim durable success", async () => {
  for (
    const decision of [
      baseDecision({
        flow_action: "punctual_instruction",
        preference_intent: {
          kind: "punctual_instruction",
          durability: "punctual",
          support_status: "not_applicable",
          summary: "consigne ponctuelle",
        },
        preference_updates: [],
        visible_task: {
          kind: "punctual_instruction_ack",
          instruction: "Ack ponctuel.",
        },
      }),
      baseDecision({
        flow_action: "unsupported_preference",
        preference_intent: {
          kind: "durable_unsupported",
          durability: "durable",
          support_status: "unsupported",
          summary: "jamais emoji et trois lignes",
        },
        preference_updates: [],
        unsupported_parts: ["emoji", "trois lignes"],
        visible_task: {
          kind: "unsupported_preference",
          instruction: "Expliquer non supporté.",
        },
      }),
    ]
  ) {
    const supabase = fakeCoachSupabase();
    const runtime = await maybeRunUpdateCoachPreferencesOperation({
      supabase,
      userId: "u1",
      userMessage: "test",
      channel: "web",
      userTimezone: "Europe/Paris",
      tempMemory: {},
      turnFrame: null,
      routeDecision: {
        route_version: "v1",
        response_owner: "tool_skill",
        selected_handler: "update_coach_preferences",
        blocked_paths: [],
        direct_effects_to_run: [],
        reason_code: "test",
        memory_used_for_route: false,
        memory_item_ids_used_for_route: [],
        memory_use_kind: "none",
      },
      safetyPregateOutput: { risk_band: "none", evidence: [] } as any,
      sourceMessageId: "m2",
      runLocalDispatcher: () => Promise.resolve(decision),
      runVisibleAgent: visibleAgent("Pas de stockage durable."),
    });
    assertEquals(runtime?.executedTools, []);
    assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
    assertEquals(supabase.state.wrote, false);
  }
});

Deno.test("proposed mapping writes only after local confirmation", async () => {
  const firstSupabase = fakeCoachSupabase();
  const first = await maybeRunUpdateCoachPreferencesOperation({
    supabase: firstSupabase,
    userId: "u1",
    userMessage: "Arrête de m'interroger tout le temps.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "test",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    safetyPregateOutput: { risk_band: "none", evidence: [] } as any,
    sourceMessageId: "m3",
    runLocalDispatcher: () =>
      Promise.resolve(baseDecision({
        flow_action: "propose_supported_mapping",
        preference_intent: {
          kind: "durable_unsupported",
          durability: "ambiguous",
          support_status: "partial",
          summary: "mapping vers moins de questions",
        },
        preference_updates: [{
          ...(baseDecision().preference_updates[0]),
          status: "proposed",
          needs_user_confirmation: true,
        }],
        visible_task: {
          kind: "confirm_supported_mapping",
          instruction: "Demander confirmation.",
        },
      })),
    runVisibleAgent: visibleAgent(
      "Je peux le traduire par moins de questions.",
    ),
  });
  assertEquals(first?.toolExecution, "none");
  assertEquals(firstSupabase.state.wrote, false);
  assertEquals(
    (first?.nextTempMemory as any).__coach_preference_flow_state_v1.status,
    "proposed",
  );

  const secondSupabase = fakeCoachSupabase();
  const second = await maybeRunUpdateCoachPreferencesOperation({
    supabase: secondSupabase,
    userId: "u1",
    userMessage: "Ok applique.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: first?.nextTempMemory,
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none", evidence: [] } as any,
    sourceMessageId: "m4",
    requestId: "op-confirm",
    runLocalDispatcher: () =>
      Promise.resolve(baseDecision({
        flow_action: "confirm_proposed_mapping",
        preference_updates: [],
      })),
    runVisibleAgent: visibleAgent("C'est noté : moins de questions."),
  });
  assertEquals(second?.toolExecution, "success");
  assertEquals(secondSupabase.state.wrote, true);
  assertEquals(
    (second?.toolSkillRun as any)?.committed_effects[0].preference_keys,
    ["coach.question_tendency"],
  );
});

Deno.test("status question inside coach preference flow delegates to status_recap without write", async () => {
  const supabase = fakeCoachSupabase([
    {
      key: "coach.tone",
      value: { value: "direct" },
      source_type: "ui",
    },
  ]);
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage: "C'est quoi mes préférences coach actuelles ?",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "test",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    safetyPregateOutput: { risk_band: "none", evidence: [] } as any,
    sourceMessageId: "m-status",
    runLocalDispatcher: () =>
      Promise.resolve(baseDecision({
        flow_action: "status_question",
        preference_intent: {
          kind: "status_question",
          durability: "not_applicable",
          support_status: "not_applicable",
          summary: "status",
        },
        preference_updates: [],
        visible_task: {
          kind: "get_info_db",
          instruction: "Lire le status.",
        },
      })),
    runVisibleAgent: visibleAgent("wrong owner"),
    runStatusRecapSubskill: () =>
      Promise.resolve({
        content: "Status recap DB-grounded: ton = direct.",
        nextTempMemory: {},
        toolExecution: "none",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "status_recap",
          reason_code: "status_recap_test",
        },
      }),
  });
  assertEquals(runtime?.toolExecution, "none");
  assertEquals(runtime?.executedTools, []);
  assertEquals(supabase.state.wrote, false);
  assertEquals(runtime?.content, "Status recap DB-grounded: ton = direct.");
  assertEquals(
    (runtime?.toolSkillRun as any)?.subskill_run.skill_id,
    "status_recap",
  );
  assertEquals(
    (runtime?.nextTempMemory as any).__coach_preference_flow_state_v1
      .subskill_history[0].skill_id,
    "status_recap",
  );
});

Deno.test("preference explanation inside coach preference flow delegates to product_help and preserves flow", async () => {
  const supabase = fakeCoachSupabase();
  const activeState = createCoachPreferenceLocalFlowState({
    status: "collecting",
    currentStage: "setting",
  });
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage: "C'est quoi les niveaux de préférences coach ?",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: { __coach_preference_flow_state_v1: activeState },
    turnFrame: null,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none", evidence: [] } as any,
    sourceMessageId: "m-explain",
    runLocalDispatcher: () =>
      Promise.resolve(baseDecision({
        flow_action: "explain_preferences",
        preference_intent: {
          kind: "explain",
          durability: "not_applicable",
          support_status: "not_applicable",
          summary: "explication produit",
        },
        preference_updates: [],
        visible_task: {
          kind: "get_info_product",
          instruction: "Expliquer via product_help.",
        },
      })),
    runVisibleAgent: visibleAgent("wrong owner"),
    runProductHelpSubskill: () =>
      Promise.resolve({
        skill_id: "product_help",
        status: "complete",
        response_intent: "answer_product_question",
        reply:
          "Product help: les préférences coach couvrent le ton, le challenge et les questions.",
        operation_suggestions: [],
        memory_trace: {
          memory_used_for_response: false,
          memory_item_ids_used: [],
          correction_detected: false,
          correction_target_item_ids: [],
        },
      }),
  });
  assertEquals(runtime?.toolExecution, "none");
  assertEquals(runtime?.executedTools, []);
  assertEquals(supabase.state.wrote, false);
  assertEquals(
    runtime?.content,
    "Product help: les préférences coach couvrent le ton, le challenge et les questions.",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.subskill_run.skill_id,
    "product_help",
  );
  assertEquals(
    (runtime?.nextTempMemory as any).__coach_preference_flow_state_v1
      .subskill_history[0].skill_id,
    "product_help",
  );
});

Deno.test("status helper and runtime policy still read existing preferences", async () => {
  const reply = await buildCoachPreferencesStatusReply({
    supabase: fakeCoachSupabase([
      {
        key: "coach.tone",
        value: { value: "direct" },
        source_type: "ui",
      },
    ]),
    userId: "u1",
    fallback: "fallback",
  });
  assertEquals(reply, "Oui. Préférences coach actives : ton très direct.");

  const policy = loadCoachPreferenceRuntimePolicy([
    { key: "coach.tone", value: { value: "direct" } },
    { key: "coach.challenge_level", value: { value: "balanced" } },
    { key: "coach.question_tendency", value: { value: "low" } },
  ]);
  assertEquals(policy.tone, "direct");
  assertEquals(policy.challenge_level, "balanced");
  assertEquals(policy.question_tendency, "low");
  assert(
    policy.composer_constraints.some((line) =>
      line.includes("ton très direct")
    ),
  );
});

Deno.test("local exit, safety and stop actions follow note_information doctrine", () => {
  const exitReduced = reduceCoachPreferenceLocalDispatcherOutput({
    previous: createCoachPreferenceLocalFlowState({
      status: "collecting",
      currentStage: "setting",
    }),
    output: baseDecision({
      flow_action: "exit_to_global_dispatcher",
      preference_intent: {
        kind: "topic_change",
        durability: "not_applicable",
        support_status: "not_applicable",
        summary: "Nouveau sujet clair hors préférences coach.",
      },
      preference_updates: [],
      visible_task: {
        kind: "exit_ack",
        instruction: "Sortir vers global.",
      },
    }),
  });
  assertEquals(exitReduced.exit_to_global_dispatcher, true);
  assertEquals(exitReduced.note_information?.target_dispatcher, "global");
  assertEquals(
    exitReduced.note_information?.source_flow_id,
    "update_coach_preferences",
  );

  const safetyReduced = reduceCoachPreferenceLocalDispatcherOutput({
    previous: createCoachPreferenceLocalFlowState({
      status: "collecting",
      currentStage: "setting",
    }),
    output: baseDecision({
      flow_action: "safety_preempt",
      risk_score: 10,
      preference_intent: {
        kind: "safety",
        durability: "not_applicable",
        support_status: "not_applicable",
        summary: "Safety préempte.",
      },
      preference_updates: [],
      visible_task: {
        kind: "safety_transition",
        instruction: "Passer à safety.",
      },
    }),
  });
  assertEquals(safetyReduced.safety_preempt, true);
  assertEquals(
    safetyReduced.note_information?.target_dispatcher,
    "safety_crisis",
  );
  assertEquals(safetyReduced.exit_to_global_dispatcher, false);

  const stopReduced = reduceCoachPreferenceLocalDispatcherOutput({
    previous: createCoachPreferenceLocalFlowState({
      status: "proposed",
      currentStage: "confirmation",
      proposedUpdates: [baseDecision().preference_updates[0]],
    }),
    output: baseDecision({
      flow_action: "stop_local_no_handoff",
      preference_intent: {
        kind: "cancel",
        durability: "not_applicable",
        support_status: "not_applicable",
        summary: "Stop local sans nouveau sujet.",
      },
      preference_updates: [],
      visible_task: {
        kind: "stop_or_cancel",
        instruction: "Ack local court.",
      },
    }),
  });
  assertEquals(stopReduced.status, "cancelled");
  assertEquals(stopReduced.exit_to_global_dispatcher, false);
  assertEquals(stopReduced.note_information, null);
});

Deno.test("local dispatcher prompt explains real field completion rules", () => {
  const prompt = dispatcherSystemPrompt();
  assert(prompt.includes("Field Completion Rules:"));
  assert(prompt.includes("- flow_action: décision principale du tour courant"));
  assert(prompt.includes("- confidence: high si l'intention"));
  assert(prompt.includes("- risk_score: score numérique local de risque"));
  assert(prompt.includes("- preference_intent: état métier local du tour"));
  assert(prompt.includes("- preference_updates: liste uniquement"));
  assert(prompt.includes("- unsupported_parts: parties de la demande"));
  assert(prompt.includes("- missing_decisions: mets durability"));
  assert(prompt.includes("- visible_task.kind: stage visible exact"));
  assert(prompt.includes("- visible_task.conversation_context: seul contexte"));
  assert(prompt.includes("- note_information: {needed:false}"));
  assert(prompt.includes("- exit_memo: présent seulement"));
  assert(prompt.includes("- safety: remplir quand risk_score"));
  assert(
    prompt.includes("- evidence: indices sémantiques réellement utilisés"),
  );
  assert(prompt.includes("Transition Rules:"));
  assert(prompt.includes("stop_local_no_handoff/cancel_flow"));
  assert(prompt.includes("exit_to_global_dispatcher"));
  assert(prompt.includes("safety_preempt"));
  assert(prompt.includes("handoff_to_local_flow"));
  assert(prompt.includes("Anti-faux-positif"));
  assert(prompt.includes("status_question"));
  assert(prompt.includes("explain_preferences"));
  assert(prompt.includes("Ne transmets jamais DB brute"));
  assert(prompt.includes("write_result.committed=false avant commit"));
  assertEquals(prompt.match(/Example JSON \d/g)?.length, 2);
});

Deno.test("runtime passes only conversation_context to visible agent and records inbound note", async () => {
  const supabase = fakeCoachSupabase();
  let visibleInput: any = null;
  const runtime = await maybeRunUpdateCoachPreferencesOperation({
    supabase,
    userId: "u1",
    userMessage: "Dorénavant, réponds plus direct.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      turn_id: "turn-note",
      source_message_id: "m-note",
      user_id: "u1",
      channel: "web",
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      direct_effects: [],
      tool_skill_intents: [{
        operation_type: "update_coach_preferences",
        confidence_band: "high",
        explicitness: "explicit",
        target_status: "identified",
        reason_codes: ["test"],
        evidence: ["test"],
      } as any],
      skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      memory_plan: {
        context_need: "minimal",
        memory_mode: "none",
        context_budget_tier: "tiny",
        targets: [],
        retrieval_policy: "semantic_only",
      },
    } as any,
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "update_coach_preferences",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "test_global_selected_update_coach_preferences",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    safetyPregateOutput: { risk_band: "none", evidence: [] } as any,
    sourceMessageId: "m-note",
    requestId: "op-note",
    runLocalDispatcher: (input) => {
      assertEquals(
        input.note_information_inbound?.target_dispatcher,
        "update_coach_preferences",
      );
      assertEquals(input.micro_memory_context?.items, []);
      return Promise.resolve(baseDecision({
        preference_updates: [{
          key: "coach.tone",
          value: "direct",
          status: "locked",
          user_facing_label: "Ton",
          user_facing_value: "Direct",
          reason: "Demande explicite durable.",
          needs_user_confirmation: false,
        }],
      }));
    },
    runVisibleAgent: (input) => {
      visibleInput = input;
      return Promise.resolve("C'est noté.");
    },
  });
  assertEquals(runtime?.toolExecution, "success");
  assertEquals(visibleInput.stage, "preference_saved");
  assertEquals(visibleInput.local_state, undefined);
  assertEquals(visibleInput.current_preferences, undefined);
  assertEquals(visibleInput.conversation_context.write_result.committed, true);
  const traceEvents = ((runtime?.toolSkillRun as any)?.runtime_trace ?? []).map(
    (
      entry: any,
    ) => entry.event,
  );
  assert(traceEvents.includes("note_information_consumed"));
  assert(traceEvents.includes("conversation_context_created"));
});

Deno.test("legacy update_coach_preferences files are removed from the local flow", async () => {
  const legacyFiles = [
    "executor.ts",
    "generator.ts",
    "intake.ts",
    "renderer.ts",
    "slot_filler.ts",
    "test_helpers.ts",
    "workflow.ts",
  ];
  for (const file of legacyFiles) {
    let exists = true;
    try {
      await Deno.stat(
        new URL(`./${file}`, import.meta.url),
      );
    } catch {
      exists = false;
    }
    assertEquals(exists, false, `${file} should be removed`);
  }
});
