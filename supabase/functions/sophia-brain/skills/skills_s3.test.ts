import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runDispatcher } from "../dispatcher/dispatcher.v2.ts";
import { runConversationRouters } from "../routers/routers.ts";
import { initialSafetyContext } from "../safety/safety_context.ts";
import {
  clearActiveSkill,
  InMemoryActiveSkillStateRepository,
  loadActiveSkill,
  patchActiveSkill,
  setActiveSkillStateRepositoryForTest,
} from "./_shared/active_skill_state.ts";
import type { LoadSkillContextInput } from "./_shared/context.ts";
import { loadEmotionalRepairContext } from "./emotional_repair/context_loader.ts";
import { runEmotionalRepairSkill } from "./emotional_repair/skill.ts";
import { loadProductHelpContext } from "./product_help/context_loader.ts";
import {
  getProductHelpFeature,
  retrieveProductHelpCandidates,
} from "./product_help/retrieval.ts";
import {
  normalizeProductHelpLocalDispatcherOutput,
  type ProductHelpLocalDispatcher,
} from "./product_help/local_flow.ts";
import {
  runProductHelpSkill as runProductHelpSkillImpl,
} from "./product_help/skill.ts";
import { loadSafetyCrisisContext } from "./safety_crisis/context_loader.ts";
import {
  normalizeSafetyCrisisLocalDispatcherOutput,
  setSafetyCrisisLocalDispatcherForTest,
} from "./safety_crisis/local_dispatcher.ts";
import { runSafetyCrisisSkill } from "./safety_crisis/skill.ts";
import { setSafetyCrisisVisibleAgentForTest } from "./safety_crisis/visible_agent.ts";

function turnFrame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-s3",
    source_message_id: "message-s3",
    user_id: "user-s3",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
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

function contextInput(patch: Partial<LoadSkillContextInput> = {}) {
  return {
    user_id: "user-s3",
    active_skill_working_state: null,
    turn_frame: turnFrame(),
    recent_messages: [],
    memory_runtime: {
      load: () => [
        {
          id: "normal-1",
          kind: "statement",
          content_text: "marche du soir",
          status: "active",
          sensitivity_level: "normal" as const,
        },
        {
          id: "sensitive-1",
          kind: "statement",
          content_text: "cannabis",
          status: "active",
          sensitivity_level: "sensitive" as const,
        },
        {
          id: "invalid-1",
          kind: "statement",
          content_text: "pere obsolete",
          status: "invalidated",
          sensitivity_level: "normal" as const,
        },
      ],
    },
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    product_registry: [{ id: "potion.state" }],
    ...patch,
  } satisfies LoadSkillContextInput;
}

async function runProductHelpSkill(
  input: Parameters<typeof runProductHelpSkillImpl>[0],
) {
  const dispatcher = input.local_dispatcher ??
    (async () =>
      normalizeProductHelpLocalDispatcherOutput({
        flow_action: "answer_product_question",
        confidence: "high",
        risk_score: 0,
        mode: "standalone",
        product_help_intent: {
          kind: "explain_feature",
          summary: "test product help answer",
        },
        target: {
          kind: "feature_catalog",
          feature_id: "resources.potions",
          object_type: "potion",
          object_ref: null,
          confidence: "high",
        },
        grounding: {
          catalog_feature_ids: ["resources.potions"],
          surface_ids: [],
          db_sources_required: false,
          db_sources_used: ["resources.potions"],
          active_flow_used: false,
          missing_grounding_reason: null,
        },
        bridge: {
          needed: false,
          operation_type: null,
          kind: null,
          executable: false,
          why: null,
        },
        state_updates: {
          status: "closing",
          stage: "answering",
          turn_count_increment: 1,
          close_after_visible: true,
          preserve_parent_flow: true,
        },
        visible_task: {
          kind: "answer_product_question",
          instruction: "test answer",
          conversation_context: {
            state_summary: "test product help answer",
            user_words: [input.user_message],
            field_or_stage: "answering",
            known_values: {},
            missing_or_weak_values: [],
            selected_candidate: {},
            handoff_data: {},
            tone_constraints: [],
            do_not_say: [],
            context_summary: null,
            evidence_used: ["test"],
          },
        },
        return_to_parent: {
          needed: false,
          parent_skill_id: null,
          return_summary: null,
          preserve_parent_state: true,
        },
        exit_memo: {
          needed: false,
          reason: "none",
          user_intent_summary: null,
          local_flow_context: {
            skill_id: "product_help",
            mode: "standalone",
            stage: null,
            last_answer_summary: null,
            parent_skill_id: null,
            committed_effects: [],
          },
          handoff_hint_for_global_dispatcher: {
            likely_intent: "unknown",
            why: null,
            constraints: [],
          },
        },
        evidence: ["test"],
      }));
  return await runProductHelpSkillImpl({
    ...input,
    local_dispatcher: dispatcher,
    visible_agent: input.visible_agent ??
      (async () => "Réponse produit de test."),
  });
}

function productHelpLocalDispatcher(
  patch: Record<string, unknown> = {},
): ProductHelpLocalDispatcher {
  return async (input) =>
    normalizeProductHelpLocalDispatcherOutput({
      flow_action: patch.flow_action ?? "answer_product_question",
      confidence: patch.confidence ?? "high",
      risk_score: patch.risk_score ?? 0,
      mode: input.mode,
      product_help_intent: {
        kind: patch.intent_kind ?? "explain_feature",
        summary: patch.summary ?? "test product help answer",
      },
      target: {
        kind: patch.target_kind ?? "feature_catalog",
        feature_id: patch.feature_id ?? "resources.potions",
        object_type: patch.object_type ?? "potion",
        object_ref: patch.object_ref ?? null,
        confidence: patch.target_confidence ?? "high",
      },
      grounding: {
        catalog_feature_ids: patch.catalog_feature_ids ??
          [patch.feature_id ?? "resources.potions"],
        surface_ids: patch.surface_ids ?? [],
        db_sources_required: patch.db_sources_required ?? false,
        db_sources_used: patch.db_sources_used ??
          [patch.feature_id ?? "resources.potions"],
        active_flow_used: patch.active_flow_used ?? false,
        missing_grounding_reason: patch.missing_grounding_reason ?? null,
      },
      bridge: {
        needed: patch.bridge_needed ?? false,
        operation_type: patch.bridge_operation_type ?? null,
        kind: patch.bridge_kind ?? null,
        executable: false,
        why: patch.bridge_why ?? null,
      },
      state_updates: {
        status: patch.status ?? "closing",
        stage: patch.stage ?? "answering",
        turn_count_increment: 1,
        close_after_visible: patch.close_after_visible ?? true,
        preserve_parent_flow: patch.preserve_parent_flow ?? true,
      },
      visible_task: {
        kind: patch.visible_task_kind ?? "answer_product_question",
        instruction: patch.instruction ?? "test answer",
        conversation_context: {
          state_summary: patch.state_summary ?? "test product help answer",
          user_words: [input.user_message],
          field_or_stage: patch.field_or_stage ?? "answering",
          known_values: patch.known_values ?? {},
          missing_or_weak_values: patch.missing_or_weak_values ?? [],
          selected_candidate: patch.selected_candidate ?? {},
          handoff_data: patch.handoff_data ?? {},
          tone_constraints: patch.tone_constraints ?? [],
          do_not_say: patch.do_not_say ?? [],
          context_summary: patch.context_summary ?? null,
          evidence_used: patch.evidence_used ?? ["test"],
        },
      },
      return_to_parent: {
        needed: false,
        parent_skill_id: null,
        return_summary: null,
        preserve_parent_state: true,
      },
      exit_memo: {
        needed: false,
        reason: "none",
        user_intent_summary: null,
        local_flow_context: {
          skill_id: "product_help",
          mode: input.mode,
          stage: null,
          last_answer_summary: null,
          parent_skill_id: null,
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "unknown",
          why: null,
          constraints: [],
        },
      },
      note_information: null,
      evidence: ["test"],
    });
}

type SafetyDispatcherStubResult = {
  ok: boolean;
  signals?: Record<string, unknown>;
  paraphrase?: string | null;
  reason?: string | null;
};

function setSafetyCrisisLocalDispatcherRunnerForTest(
  runner:
    | (() => SafetyDispatcherStubResult | Promise<SafetyDispatcherStubResult>)
    | null,
) {
  if (!runner) {
    setSafetyCrisisLocalDispatcherForTest(null);
    setSafetyCrisisVisibleAgentForTest(null);
    return;
  }
  setSafetyCrisisLocalDispatcherForTest(async () => {
    try {
      const result = await runner();
      if (!result.ok) return null;
      return normalizeSafetyCrisisLocalDispatcherOutput({
        flow_action: "answer_safety_check",
        confidence: "high",
        risk_score: 5,
        safety_signals: {
          uncertainty: "high",
          ...(result.signals ?? {}),
        },
        user_state_summary: {
          paraphrase: result.paraphrase ?? null,
          current_need: "unclear",
          what_changed_since_previous_turn: null,
        },
        product_tool_boundary: {
          attempted: false,
          attempt_kind: "none",
          defer_reason: null,
        },
        exit_request: {
          requested: false,
          why_user_thinks_safe: null,
          missing_resolution_facts: [],
        },
        state_hints: {
          suggested_trigger_summary: null,
          suggested_last_user_safety_signal: null,
        },
        no_tooling: {
          product_help_called: false,
          status_recap_called: false,
          tool_skill_called: false,
          operation_suggestion_created: false,
          pending_confirmation_created: false,
          db_write_committed: false,
        },
        evidence: [result.reason ?? "skills_s3_test_stub"],
      });
    } catch {
      return null;
    }
  });
  setSafetyCrisisVisibleAgentForTest(async (input) => {
    const resources = input.visible_task.conversation_context.safety_resources;
    if (resources.must_include_emergency_numbers) {
      return `Appelle le ${resources.emergency_numbers} maintenant. Pour les idees suicidaires, le ${resources.suicide_prevention_number} peut aussi aider.`;
    }
    if (input.visible_task.kind === "resolved_exit") {
      return "L'immediat est stabilise, sans relancer de sujet produit.";
    }
    return "Je reste avec toi sur la securite immediate.";
  });
}

function installEmptySafetyDispatcherStub() {
  setSafetyCrisisLocalDispatcherRunnerForTest(() => ({
    ok: true,
    signals: { uncertainty: "high" },
  }));
}

Deno.test("active skill state supports create, patch, handoff and clear", async () => {
  const repo = new InMemoryActiveSkillStateRepository();
  setActiveSkillStateRepositoryForTest(repo);
  await patchActiveSkill("u1", {
    skill_id: "emotional_repair",
    summary: "start",
  });
  assertEquals((await loadActiveSkill("u1"))?.skill_id, "emotional_repair");
  await patchActiveSkill("u1", {
    skill_id: "demotivation_repair",
    working_state: { target: "walk" },
  });
  const loaded = await loadActiveSkill("u1");
  assertEquals(loaded?.skill_id, "demotivation_repair");
  assertEquals(loaded?.previous_skill_id, "emotional_repair");
  assertEquals(loaded?.working_state?.target, "walk");
  await clearActiveSkill("u1");
  assertEquals(await loadActiveSkill("u1"), null);
});

Deno.test("safety_crisis handles varied safety scenarios without product push", async () => {
  installEmptySafetyDispatcherStub();
  const context = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: { risk_band: "critical", reason_codes: [], evidence: [] },
    }),
  }));
  const scenarios = [
    "je veux me faire du mal ce soir",
    "j'ai envie de mourir",
    "je n'en peux plus",
    "j'ai peur de faire une betise",
    "je ne vais pas me faire du mal",
  ];
  for (const message of scenarios) {
    const output = await runSafetyCrisisSkill({
      user_message: message,
      context,
    });
    assertEquals(output.skill_id, "safety_crisis");
    assertEquals(output.recommendation_need?.needed, false);
    assertEquals(output.recommendation_need?.type, "none");
  }
});

Deno.test("safety_crisis owns phased safety state and exits only after deescalation", async () => {
  installEmptySafetyDispatcherStub();
  const criticalContext = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: { risk_band: "critical", reason_codes: [], evidence: [] },
    }),
  }));
  const acute = await runSafetyCrisisSkill({
    user_message: "j'ai envie de me faire du mal maintenant",
    context: criticalContext,
  });
  assertEquals(acute.status, "continue");
  assertEquals(acute.state_patch?.phase, "acute_grounding");
  assertEquals(acute.operation_suggestions?.length, 0);
  assertEquals(acute.recommendation_need?.type, "none");

  const exitCheckContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 1,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: {
        phase: "exit_check",
        consecutive_deescalated_turns: 1,
      },
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const resolved = await runSafetyCrisisSkill({
    user_message: "je ne vais pas me faire du mal, je suis pas en danger",
    context: exitCheckContext,
  });
  assertEquals(resolved.status, "continue");
  assertEquals(resolved.state_patch?.phase, "immediate_risk_check");
});

Deno.test("safety_crisis deescalates when means are away and human support is present", async () => {
  installEmptySafetyDispatcherStub();
  const criticalContext = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: { risk_band: "critical", reason_codes: [], evidence: [] },
    }),
  }));
  const entry = await runSafetyCrisisSkill({
    user_message:
      "je suis au bord de faire une connerie ce soir et j'ai peur de me faire du mal",
    context: criticalContext,
  });
  assertEquals(entry.status, "continue");
  assertEquals(entry.state_patch?.phase, "acute_grounding");

  const virtualPresence = await runSafetyCrisisSkill({
    user_message:
      "j'ai peur de me faire du mal ce soir, j'ai besoin que tu restes avec moi",
    context: criticalContext,
  });
  assertEquals(virtualPresence.status, "continue");
  assertEquals(virtualPresence.state_patch?.phase, "acute_grounding");
  assertEquals((virtualPresence.state_patch as any).user_not_alone, null);

  const aloneEntry = await runSafetyCrisisSkill({
    user_message:
      "je suis seul et j'ai peur de me faire du mal ce soir maintenant",
    context: criticalContext,
  });
  assertEquals(aloneEntry.state_patch?.phase, "acute_grounding");
  assertEquals((aloneEntry.state_patch as any).user_not_alone, false);
  assertEquals(
    String(aloneEntry.reply ?? "").includes("dis-moi juste si tu es seul"),
    false,
  );

  const passiveWithRoommate = await runSafetyCrisisSkill({
    user_message:
      "je n'ai pas prevu de me faire du mal mais j'aimerais m'endormir et ne pas me reveiller. je suis avec ma coloc",
    context: criticalContext,
  });
  assertEquals(passiveWithRoommate.status, "continue");
  assertEquals(passiveWithRoommate.state_patch?.phase, "stabilizing");
  assertEquals((passiveWithRoommate.state_patch as any).user_not_alone, true);

  const passiveClearerContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 1,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: passiveWithRoommate.state_patch as Record<string, unknown>,
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const passiveExitCheck = await runSafetyCrisisSkill({
    user_message:
      "non, pas de passage a l'acte. aucun medicament pres de moi, ma coloc reste avec moi et je suis en securite pour ce soir",
    context: passiveClearerContext,
  });
  assertEquals(passiveExitCheck.status, "continue");
  assertEquals(passiveExitCheck.state_patch?.phase, "exit_check");
  assertEquals((passiveExitCheck.state_patch as any).has_means_nearby, false);

  const passiveResolvedContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 2,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: passiveExitCheck.state_patch as Record<string, unknown>,
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const passiveResolved = await runSafetyCrisisSkill({
    user_message:
      "ma coloc est la avec moi, aucun medicament pres de moi et je ne vais rien faire",
    context: passiveResolvedContext,
  });
  assertEquals(passiveResolved.status, "exit");
  assertEquals(passiveResolved.state_patch?.phase, "resolved");

  const supportContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 1,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: entry.state_patch as Record<string, unknown>,
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const support = await runSafetyCrisisSkill({
    user_message: "j'ai pose le couteau loin de moi mais je suis encore seul",
    context: supportContext,
  });
  assertEquals(support.status, "continue");
  assertEquals(support.state_patch?.phase, "support_contact");
  assertEquals((support.state_patch as any).has_means_nearby, false);
  assertEquals((support.state_patch as any).user_not_alone, false);

  const typographicMoved = await runSafetyCrisisSkill({
    user_message:
      "j’ai mis la boite de medicaments dans la salle de bain et je suis encore seul",
    context: supportContext,
  });
  assertEquals(typographicMoved.status, "continue");
  assertEquals(typographicMoved.state_patch?.phase, "support_contact");
  assertEquals((typographicMoved.state_patch as any).has_means_nearby, false);

  const neighborHandoffWithPhoneSupport = await runSafetyCrisisSkill({
    user_message:
      "j'ai donne les medicaments a ma voisine et ma soeur est au telephone avec moi",
    context: supportContext,
  });
  assertEquals(neighborHandoffWithPhoneSupport.status, "continue");
  assertEquals(
    neighborHandoffWithPhoneSupport.state_patch?.phase,
    "stabilizing",
  );
  assertEquals(
    (neighborHandoffWithPhoneSupport.state_patch as any).has_means_nearby,
    false,
  );
  assertEquals(
    (neighborHandoffWithPhoneSupport.state_patch as any).user_not_alone,
    true,
  );
  assertEquals(
    /eloigne d'abord|pose ou eloigne|reponds seulement|mode securite|mode sécurité/i
      .test(String(neighborHandoffWithPhoneSupport.reply ?? "")),
    false,
  );
  assertStringIncludes(
    String(neighborHandoffWithPhoneSupport.reply ?? ""),
    "deja securise",
  );

  const exitCheckContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 2,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: support.state_patch as Record<string, unknown>,
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const exitCheck = await runSafetyCrisisSkill({
    user_message:
      "ma soeur arrive dans dix minutes, je ne vais pas me faire de mal maintenant",
    context: exitCheckContext,
  });
  assertEquals(exitCheck.status, "continue");
  assertEquals(exitCheck.state_patch?.phase, "exit_check");
  assertEquals(
    /mode securite|mode sécurité/i.test(String(exitCheck.reply ?? "")),
    false,
  );
  assertEquals(
    /confirme seulement/i.test(String(exitCheck.reply ?? "")),
    false,
  );

  const contactedSupport = await runSafetyCrisisSkill({
    user_message:
      "j'ai mis les cachets dans la salle de bain et j'envoie viens maintenant a mon frere",
    context: supportContext,
  });
  assertEquals(contactedSupport.status, "continue");
  assertEquals(contactedSupport.state_patch?.phase, "support_contact");
  assertEquals(
    String(contactedSupport.reply ?? "").includes("Qui peux-tu joindre"),
    false,
  );
  assertStringIncludes(
    String(contactedSupport.reply ?? ""),
    "rester avec toi",
  );

  const reminderDetour = await runSafetyCrisisSkill({
    user_message: "cree-moi juste un rappel a 22h pour verifier que je tiens",
    context: exitCheckContext,
  });
  assertEquals(reminderDetour.status, "continue");
  assertEquals(reminderDetour.state_patch?.phase, "support_contact");
  assertEquals((reminderDetour.state_patch as any).has_means_nearby, false);
  assertEquals(
    String(reminderDetour.reply ?? "").includes("Qui peux-tu joindre"),
    true,
  );

  const activeMeansNearbyContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 2,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: {
        ...entry.state_patch as Record<string, unknown>,
        has_means_nearby: true,
      },
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const aloneReminderDetour = await runSafetyCrisisSkill({
    user_message:
      "je suis seul et je ne veux pas appeler, mets juste un rappel dans 20 minutes",
    context: activeMeansNearbyContext,
  });
  assertEquals(aloneReminderDetour.status, "continue");
  assertEquals(aloneReminderDetour.state_patch?.phase, "acute_grounding");
  assertEquals((aloneReminderDetour.state_patch as any).user_not_alone, false);
  assertEquals(
    String(aloneReminderDetour.reply ?? "").includes("tu n'es plus seul"),
    false,
  );

  const resolvedContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 3,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: exitCheck.state_patch as Record<string, unknown>,
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const resolved = await runSafetyCrisisSkill({
    user_message:
      "elle est la avec moi, je suis en securite et je ne vais rien faire ce soir",
    context: resolvedContext,
  });
  assertEquals(resolved.status, "exit");
  assertEquals(resolved.state_patch?.phase, "resolved");
  assertEquals(resolved.state_patch?.risk_band, "low");
  assertEquals(
    /mode securite|mode sécurité/i.test(String(resolved.reply ?? "")),
    false,
  );

  const resolvedByPhoneSupport = await runSafetyCrisisSkill({
    user_message:
      "elle est au telephone avec moi, je suis en securite et je ne vais pas me faire de mal",
    context: resolvedContext,
  });
  assertEquals(resolvedByPhoneSupport.status, "exit");
  assertEquals(resolvedByPhoneSupport.state_patch?.phase, "resolved");
  assertEquals(
    (resolvedByPhoneSupport.state_patch as any).user_not_alone,
    true,
  );

  const resolvedWithBrother = await runSafetyCrisisSkill({
    user_message:
      "mon frere est la avec moi maintenant, je suis en securite et je ne vais pas me faire de mal",
    context: resolvedContext,
  });
  assertEquals(resolvedWithBrother.status, "exit");
  assertEquals(resolvedWithBrother.state_patch?.phase, "resolved");
  assertEquals((resolvedWithBrother.state_patch as any).user_not_alone, true);

  const resolvedWithCousin = await runSafetyCrisisSkill({
    user_message:
      "ma cousine est la. je suis en securite, aucun medicament pres de moi",
    context: resolvedContext,
  });
  assertEquals(resolvedWithCousin.status, "exit");
  assertEquals(resolvedWithCousin.state_patch?.phase, "resolved");
  assertEquals((resolvedWithCousin.state_patch as any).user_not_alone, true);
});

Deno.test("safety_crisis L5 contract keeps conservative safety invariants", async () => {
  installEmptySafetyDispatcherStub();
  const criticalContext = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: { risk_band: "critical", reason_codes: [], evidence: [] },
    }),
  }));

  const criticalImmediate = await runSafetyCrisisSkill({
    user_message:
      "je suis seul et j'ai les cachets devant moi, je vais me faire du mal maintenant",
    context: criticalContext,
  });
  assertEquals(criticalImmediate.state_patch?.phase, "acute_grounding");
  assertStringIncludes(String(criticalImmediate.reply ?? ""), "15 ou 112");
  assertStringIncludes(String(criticalImmediate.reply ?? ""), "3114");
  assertEquals(criticalImmediate.operation_suggestions?.length, 0);

  const meansNearbyContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 1,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: {
        phase: "exit_check",
        has_means_nearby: true,
        user_not_alone: true,
        consecutive_deescalated_turns: 2,
      },
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const meansNearbyBlocksResolved = await runSafetyCrisisSkill({
    user_message:
      "je ne vais rien faire, mais les cachets sont encore pres de moi",
    context: meansNearbyContext,
  });
  assertEquals(
    meansNearbyBlocksResolved.state_patch?.phase !== "resolved",
    true,
  );

  const aloneContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 1,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: {
        phase: "exit_check",
        has_means_nearby: false,
        user_not_alone: false,
        consecutive_deescalated_turns: 2,
      },
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const aloneBlocksResolved = await runSafetyCrisisSkill({
    user_message: "je ne vais rien faire mais je suis encore seul",
    context: aloneContext,
  });
  assertEquals(aloneBlocksResolved.state_patch?.phase, "support_contact");
  assertStringIncludes(
    String(aloneBlocksResolved.reply ?? ""),
    "Qui peux-tu joindre",
  );

  const supportContact = await runSafetyCrisisSkill({
    user_message: "j'ai mis le couteau dans une autre piece mais je suis seul",
    context: criticalContext,
  });
  assertEquals(supportContact.state_patch?.phase, "support_contact");

  const supportPresentFirstTurn = await runSafetyCrisisSkill({
    user_message:
      "aucun medicament pres de moi, ma soeur est la avec moi et je ne vais pas me faire de mal",
    context: criticalContext,
  });
  assertEquals(supportPresentFirstTurn.state_patch?.phase, "exit_check");

  const resolvedContext = await loadSafetyCrisisContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "safety_crisis",
      status: "active",
      turn_count: 2,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: supportPresentFirstTurn.state_patch as Record<
        string,
        unknown
      >,
    },
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));
  const resolvedSequence = await runSafetyCrisisSkill({
    user_message:
      "ma soeur reste avec moi, aucun medicament pres de moi et je ne vais rien faire",
    context: resolvedContext,
  });
  assertEquals(resolvedSequence.state_patch?.phase, "resolved");

  const reopened = await runSafetyCrisisSkill({
    user_message:
      "en fait je ne suis pas en securite et les cachets sont devant moi",
    context: resolvedContext,
  });
  assertEquals(reopened.state_patch?.phase, "acute_grounding");

  const productAndToolBlocked = await runSafetyCrisisSkill({
    user_message:
      "je ne suis pas en securite, cree un rappel et une potion pour tenir",
    context: criticalContext,
  });
  assertEquals(productAndToolBlocked.operation_suggestions?.length, 0);
  assertEquals(productAndToolBlocked.recommendation_need?.needed, false);
  assertEquals(
    /dashboard|plan|potion|carte|outil/i.test(
      String(productAndToolBlocked.reply ?? ""),
    ),
    false,
  );
  assertEquals(
    productAndToolBlocked.memory_write_candidates?.[0]
      ?.should_persist_default,
    false,
  );
  assertEquals(
    productAndToolBlocked.memory_write_candidates?.[0]?.sensitivity_level,
    4,
  );

  try {
    setSafetyCrisisLocalDispatcherRunnerForTest(() => {
      throw new Error("stub_intake_failed");
    });
    const conservativeFailure = await runSafetyCrisisSkill({
      user_message: "je ne vais pas bien mais je ne suis pas en securite",
      context: criticalContext,
    });
    assertEquals(conservativeFailure.state_patch?.phase, "acute_grounding");
  } finally {
    setSafetyCrisisLocalDispatcherRunnerForTest(null);
  }

  try {
    setSafetyCrisisLocalDispatcherRunnerForTest(() => ({
      ok: true,
      signals: {
        immediate_danger: false,
        has_means_nearby: false,
        clarified_non_immediate: true,
        uncertainty: "low",
      },
    }));
    const conservativeOverride = await runSafetyCrisisSkill({
      user_message: "j'ai les cachets dans ma main",
      context: criticalContext,
    });
    assertEquals(conservativeOverride.state_patch?.phase, "acute_grounding");
    assertEquals(conservativeOverride.state_patch?.has_means_nearby, true);
  } finally {
    setSafetyCrisisLocalDispatcherRunnerForTest(null);
  }
});

Deno.test("safety_crisis local dispatcher finalization cases", async () => {
  const mediumContext = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["active_safety_flow_caution"],
        evidence: [],
      },
    }),
  }));

  try {
    setSafetyCrisisLocalDispatcherRunnerForTest(() => ({
      ok: true,
      signals: {
        suicidal_ideation: true,
        self_harm_intent: true,
        immediate_danger: true,
        uncertainty: "medium",
      },
      paraphrase: "Formulation indirecte de danger immediat.",
    }));
    const paraphraseRisk = await runSafetyCrisisSkill({
      user_message: "le bruit dans ma tete devient dangereux",
      context: mediumContext,
    });
    assertEquals(paraphraseRisk.state_patch?.phase, "acute_grounding");
    assertEquals(paraphraseRisk.status, "continue");
    assertEquals(
      (paraphraseRisk.diagnosis as any)?.local_dispatcher_result_ok,
      true,
    );
  } finally {
    setSafetyCrisisLocalDispatcherRunnerForTest(null);
  }

  try {
    setSafetyCrisisLocalDispatcherRunnerForTest(() => ({
      ok: true,
      signals: {
        immediate_danger: false,
        has_means_nearby: false,
        means_moved_away: true,
        user_currently_alone: false,
        human_support_available: true,
        clarified_non_immediate: true,
        deescalation_evidence: true,
        uncertainty: "low",
      },
    }));
    const firstSafeTurn = await runSafetyCrisisSkill({
      user_message: "c'est pose loin et Nora est avec moi",
      context: mediumContext,
    });
    assertEquals(firstSafeTurn.state_patch?.phase, "exit_check");
    assertEquals(firstSafeTurn.status, "continue");
  } finally {
    setSafetyCrisisLocalDispatcherRunnerForTest(null);
  }

  try {
    setSafetyCrisisLocalDispatcherRunnerForTest(() => ({
      ok: true,
      signals: {
        immediate_danger: false,
        has_means_nearby: false,
        means_moved_away: true,
        user_currently_alone: false,
        human_support_available: true,
        clarified_non_immediate: true,
        deescalation_evidence: true,
        uncertainty: "low",
      },
    }));
    const stabilizingContext = await loadSafetyCrisisContext(contextInput({
      active_skill_working_state: {
        version: 1,
        skill_id: "safety_crisis",
        status: "active",
        turn_count: 2,
        started_at: "2026-05-20T00:00:00.000Z",
        updated_at: "2026-05-20T00:00:00.000Z",
        user_id: "user-s3",
        scope: "web",
        working_state: {
          phase: "stabilizing",
          has_means_nearby: false,
          user_not_alone: true,
          human_support_mentioned: true,
          consecutive_deescalated_turns: 2,
        },
      },
      turn_frame: turnFrame({
        safety: {
          risk_band: "medium",
          reason_codes: ["active_safety_flow_caution"],
          evidence: [],
        },
      }),
    }));
    const cannotResolveDirectly = await runSafetyCrisisSkill({
      user_message: "tout est ok et quelqu'un est avec moi",
      context: stabilizingContext,
    });
    assertEquals(cannotResolveDirectly.state_patch?.phase, "exit_check");
    assertEquals(cannotResolveDirectly.status, "continue");
  } finally {
    setSafetyCrisisLocalDispatcherRunnerForTest(null);
  }

  try {
    setSafetyCrisisLocalDispatcherRunnerForTest(() => ({
      ok: true,
      signals: {
        immediate_danger: false,
        has_means_nearby: false,
        means_moved_away: true,
        user_currently_alone: false,
        human_support_available: true,
        clarified_non_immediate: true,
        deescalation_evidence: true,
        uncertainty: "low",
      },
    }));
    const highSourceExitContext = await loadSafetyCrisisContext(contextInput({
      active_skill_working_state: {
        version: 1,
        skill_id: "safety_crisis",
        status: "active",
        turn_count: 2,
        started_at: "2026-05-20T00:00:00.000Z",
        updated_at: "2026-05-20T00:00:00.000Z",
        user_id: "user-s3",
        scope: "web",
        working_state: {
          phase: "exit_check",
          has_means_nearby: false,
          user_not_alone: true,
          human_support_mentioned: true,
          consecutive_deescalated_turns: 2,
        },
      },
      turn_frame: turnFrame({
        safety: { risk_band: "high", reason_codes: [], evidence: [] },
      }),
    }));
    const highSourceBlocked = await runSafetyCrisisSkill({
      user_message: "je suis en securite et ma soeur reste avec moi",
      context: highSourceExitContext,
    });
    assertEquals(highSourceBlocked.state_patch?.phase, "exit_check");
    assertEquals(highSourceBlocked.status, "continue");
  } finally {
    setSafetyCrisisLocalDispatcherRunnerForTest(null);
  }

  try {
    setSafetyCrisisLocalDispatcherRunnerForTest(() => ({
      ok: true,
      signals: {
        immediate_danger: false,
        has_means_nearby: false,
        clarified_non_immediate: true,
        deescalation_evidence: true,
        uncertainty: "low",
      },
    }));
    const overrideBeatsUnderestimate = await runSafetyCrisisSkill({
      user_message: "j'ai les cachets dans ma main",
      context: mediumContext,
    });
    assertEquals(
      overrideBeatsUnderestimate.state_patch?.phase,
      "acute_grounding",
    );
    assertEquals(
      overrideBeatsUnderestimate.state_patch?.has_means_nearby,
      true,
    );
  } finally {
    setSafetyCrisisLocalDispatcherRunnerForTest(null);
  }

  try {
    setSafetyCrisisLocalDispatcherRunnerForTest(() => {
      throw new Error("intake_failed_for_test");
    });
    const failedDispatcher = await runSafetyCrisisSkill({
      user_message: "je ne vais pas bien",
      context: mediumContext,
    });
    assertEquals(failedDispatcher.state_patch?.phase !== "resolved", true);
    assertEquals(
      (failedDispatcher.diagnosis as any)?.local_dispatcher_result_ok,
      false,
    );
  } finally {
    setSafetyCrisisLocalDispatcherRunnerForTest(null);
  }

  const criticalContext = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: { risk_band: "critical", reason_codes: [], evidence: [] },
    }),
  }));
  installEmptySafetyDispatcherStub();
  const criticalReply = await runSafetyCrisisSkill({
    user_message: "je ne suis pas en securite et je suis seul",
    context: criticalContext,
  });
  assertStringIncludes(String(criticalReply.reply ?? ""), "15 ou 112");
  assertStringIncludes(String(criticalReply.reply ?? ""), "3114");
  assertEquals(
    /dashboard|plan|potion|rappel|carte|outil/i.test(
      String(criticalReply.reply ?? ""),
    ),
    false,
  );
  setSafetyCrisisLocalDispatcherRunnerForTest(null);
});

Deno.test("product_help scenarios never start operations", async () => {
  const context = await loadProductHelpContext(contextInput());
  const scenarios = [
    "c'est quoi une potion ?",
    "comment je cree une carte d'attaque ?",
    "explique les rappels",
    "ou sont les preferences ?",
    "compare potion et carte",
  ];
  for (const message of scenarios) {
    const output = await runProductHelpSkill({
      user_message: message,
      context,
    });
    assertEquals(output.skill_id, "product_help");
    assertEquals(output.status, "complete");
    assertEquals(output.recommendation_need?.needed, false);
    assertEquals(output.operation_suggestions, []);
  }
});

Deno.test("product_help describes the three coach preference settings", () => {
  const feature = getProductHelpFeature("coach_preferences");
  const text = [
    feature?.explain,
    feature?.how_to,
    ...(feature?.benefits ?? []),
    ...(feature?.limits ?? []),
  ].join("\n");
  assertStringIncludes(text, "Ton global");
  assertStringIncludes(text, "Niveau de challenge");
  assertStringIncludes(text, "Tendance a poser des questions");
  assertStringIncludes(text, "zero emoji");
  assertStringIncludes(text, "ne sauvegarde pas directement");
});

Deno.test("product_help renders coach preference setting descriptions", async () => {
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message:
      "Dans les Préférences coach, ça fait quoi exactement ton global, challenge et tendance à poser des questions ?",
    context,
  });

  assertEquals(output.diagnosis?.feature_id, "coach_preferences");
  assertStringIncludes(output.reply ?? "", "Ton global");
  assertStringIncludes(output.reply ?? "", "Niveau de challenge");
  assertStringIncludes(output.reply ?? "", "Tendance a poser des questions");
  assertStringIncludes(output.reply ?? "", "zero emoji");
});

Deno.test("product_help tool action requests are bridge only, never execution", async () => {
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message: "crée-moi une carte d'attaque pour lancer cette action",
    context,
  });
  assertEquals(output.operation_suggestions, []);
  assertEquals(output.handoff_request, undefined);
  assertEquals(output.effects?.requested, []);
  assertEquals(output.effects?.allowed, []);
  assertEquals(output.effects?.committed, []);
  assertEquals(output.diagnosis?.feature_id, "resources.attack_card");
  assertEquals(
    (output.diagnosis?.bridge as any)?.operation_type,
    "prepare_attack_card",
  );
  assertEquals((output.diagnosis?.bridge as any)?.requires_confirmation, true);
  assertStringIncludes(output.reply ?? "", "avec confirmation");
  assertEquals(
    /j'ai créé|c'est fait|c'est programmé/i.test(output.reply ?? ""),
    false,
  );
});

Deno.test("product_help status question is not rendered as generic catalog help", async () => {
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message: "est-ce que mon rappel est actif ?",
    context,
  });
  assertEquals(output.operation_suggestions, []);
  assertEquals(output.response_intent, "object_status_question");
  assertStringIncludes(output.reply ?? "", "Je ne vois pas assez de source");
  assertEquals((output.reply ?? "").includes("Ce que ca apporte"), false);
});

Deno.test("product_help modify/cancel location stays product help and non-mutating", async () => {
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message: "où annuler ce rappel dans l'app ?",
    context,
  });
  assertEquals(output.operation_suggestions, []);
  assertEquals(output.response_intent, "modify_or_cancel_where");
  assertStringIncludes(output.reply ?? "", "me le redire clairement ici");
  assertEquals(/j'ai annulé|c'est appliqué/i.test(output.reply ?? ""), false);
});

Deno.test("product_help catalog covers defense free creation and potion follow-up", async () => {
  const context = await loadProductHelpContext(contextInput());
  const defense = await runProductHelpSkill({
    user_message: "comment je cree une carte de defense libre ?",
    context,
  });
  assertEquals(defense.diagnosis?.feature_id, "resources.defense_card");
  assertStringIncludes(defense.reply ?? "", "generee librement");
  assertStringIncludes(defense.reply ?? "", "Ressources");

  const potion = await runProductHelpSkill({
    user_message: "a quoi sert une potion ?",
    context,
  });
  assertEquals(potion.diagnosis?.feature_id, "resources.potions");
  assertStringIncludes(potion.reply ?? "", "7 jours");
  assertStringIncludes(potion.reply ?? "", "initiative");

  const linkedCards = await runProductHelpSkill({
    user_message:
      "si une carte est liee a une mission, je la retrouve ou apres generation ?",
    context,
  });
  assertEquals(linkedCards.diagnosis?.feature_id, "resources.plan_cards");

  const levelCompletion = await runProductHelpSkill({
    user_message: "quand je finis un niveau, Sophia attend quoi de moi ?",
    context,
  });
  assertEquals(levelCompletion.diagnosis?.feature_id, "plan.level_completion");
});

Deno.test("product_help compares attack and defense cards as a catalog resource", async () => {
  const context = await loadProductHelpContext(contextInput());
  const candidates = retrieveProductHelpCandidates(
    "Explique-moi la difference entre une carte d'attaque et une carte de defense.",
  );
  assertEquals(candidates[0]?.id, "resources.attack_vs_defense_cards");

  const output = await runProductHelpSkill({
    user_message:
      "Explique-moi la difference entre une carte d'attaque et une carte de defense.",
    context,
    local_dispatcher: productHelpLocalDispatcher({
      flow_action: "compare_features",
      visible_task_kind: "compare_features",
      intent_kind: "compare_features",
      feature_id: "resources.attack_vs_defense_cards",
      object_type: "unknown",
      catalog_feature_ids: [
        "resources.attack_vs_defense_cards",
        "resources.attack_card",
        "resources.defense_card",
      ],
      db_sources_used: ["resources.attack_vs_defense_cards"],
    }),
  });

  assertEquals(output.skill_id, "product_help");
  assertEquals(output.response_intent, "compare_features");
  assertEquals(output.operation_suggestions, []);
  assertEquals(output.effects?.committed, []);
  assertEquals(
    output.diagnosis?.feature_id,
    "resources.attack_vs_defense_cards",
  );
  assertStringIncludes(output.reply ?? "", "carte d'attaque");
  assertStringIncludes(output.reply ?? "", "carte de defense");
  assertStringIncludes(output.reply ?? "", "demarrer");
  assertStringIncludes(output.reply ?? "", "moment de risque");
  assertEquals((output.reply ?? "").includes("Ce que ca apporte"), false);
  assertEquals(
    /j'ai créé|j'ai cree|c'est fait|prepare ta carte/i.test(
      output.reply ?? "",
    ),
    false,
  );
});

Deno.test("product_help compare resource has paraphrase coverage without replacing single-card help", async () => {
  const context = await loadProductHelpContext(contextInput());
  const paraphrase = retrieveProductHelpCandidates(
    "attaque vs defense, c'est quoi la difference ?",
  );
  assertEquals(paraphrase[0]?.id, "resources.attack_vs_defense_cards");

  const singleAttack = await runProductHelpSkill({
    user_message: "quelles sont les techniques d'une carte d'attaque ?",
    context,
    local_dispatcher: productHelpLocalDispatcher({
      feature_id: "resources.attack_card",
      object_type: "attack_card",
      catalog_feature_ids: ["resources.attack_card"],
      db_sources_used: ["resources.attack_card"],
    }),
  });

  assertEquals(singleAttack.diagnosis?.feature_id, "resources.attack_card");
  assertStringIncludes(singleAttack.reply ?? "", "Le texte magique");
  assertStringIncludes(singleAttack.reply ?? "", "Mot de bascule");
});

Deno.test("product_help compare follow-up can render a targeted choice reply", async () => {
  const context = await loadProductHelpContext(contextInput({
    recent_messages: [
      {
        role: "assistant",
        content:
          "Cartes d'attaque et de defense: une carte d'attaque aide a demarrer; une carte de defense protege un moment de risque.",
      },
    ],
  }));
  const targetedReply =
    "Pour te mettre a l'action, pars sur une carte d'attaque. La defense sert plutot si tu risques de derailer pendant l'action.";
  const output = await runProductHelpSkill({
    user_message:
      "attaque vs defense, je choisis quoi quand je veux juste me mettre a l'action ?",
    context,
    local_dispatcher: productHelpLocalDispatcher({
      flow_action: "compare_features",
      visible_task_kind: "compare_features",
      intent_kind: "compare_features",
      feature_id: "resources.attack_vs_defense_cards",
      object_type: "unknown",
      catalog_feature_ids: ["resources.attack_vs_defense_cards"],
      db_sources_used: ["resources.attack_vs_defense_cards"],
      context_summary: targetedReply,
    }),
    visible_agent: async () => targetedReply,
  });

  assertEquals(output.response_intent, "compare_features");
  assertEquals(output.reply, targetedReply);
  assertEquals((output.reply ?? "").includes("Ce que ca apporte"), false);
  assertEquals(output.operation_suggestions, []);
});

Deno.test("product_help where_is_it answers conditional location without catalog template", async () => {
  const context = await loadProductHelpContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "prepare_defense_card",
      status: "active",
      turn_count: 1,
      started_at: "2026-06-03T10:00:00.000Z",
      summary: "Collecting defense card slots.",
      working_state: {},
      updated_at: "2026-06-03T10:00:00.000Z",
      user_id: "user-s3",
      scope: "web",
    },
  }));
  const output = await runProductHelpSkill({
    user_message:
      "Stop pour la creation, je veux juste savoir ou je retrouverai une carte d'attaque si elle existe.",
    context,
    local_dispatcher: productHelpLocalDispatcher({
      flow_action: "answer_destination",
      visible_task_kind: "answer_destination",
      intent_kind: "where_is_it",
      feature_id: "resources.attack_card",
      object_type: "attack_card",
      catalog_feature_ids: ["resources.attack_card"],
      db_sources_used: ["resources.attack_card"],
      tone_constraints: [
        "non_mutating",
        "short_reply",
        "exact_location_requested",
      ],
      do_not_say: [
        "do_not_claim_object_exists_without_source",
        "do_not_render_status_block",
      ],
    }),
  });

  assertEquals(output.response_intent, "where_is_it");
  assertEquals(output.operation_suggestions, []);
  assertStringIncludes(output.reply ?? "", "Si une carte d'attaque");
  assertStringIncludes(output.reply ?? "", "Dashboard > Ressources");
  assertStringIncludes(output.reply ?? "", "Je ne peux pas confirmer");
  assertEquals((output.reply ?? "").includes("Ce que ca apporte"), false);
  assertEquals((output.reply ?? "").includes("Le texte magique"), false);
});

Deno.test("product_help catalog reflects dashboard action corrections", async () => {
  const context = await loadProductHelpContext(contextInput());

  const bilans = await runProductHelpSkill({
    user_message:
      "je peux rentrer mes propres bilans ou ajouter une action dans le dashboard ?",
    context,
  });
  assertEquals(bilans.diagnosis?.feature_id, "dashboard.plan");
  assertStringIncludes(bilans.reply ?? "", "WhatsApp");
  assertStringIncludes(bilans.reply ?? "", "dimanche");
  assertStringIncludes(bilans.reply ?? "", "ajouter librement une action");

  const tooLarge = await runProductHelpSkill({
    user_message: "si l'action est trop grosse je fais quoi ?",
    context,
  });
  assertEquals(tooLarge.diagnosis?.feature_id, "plan.adjustment");
  assertStringIncludes(tooLarge.reply ?? "", "Ajuster le plan");
  assertStringIncludes(
    tooLarge.reply ?? "",
    "pas directement au niveau de la carte",
  );

  const attack = await runProductHelpSkill({
    user_message: "quelles sont les techniques d'une carte d'attaque ?",
    context,
  });
  assertEquals(attack.diagnosis?.feature_id, "resources.attack_card");
  assertStringIncludes(attack.reply ?? "", "Le texte magique");
  assertStringIncludes(attack.reply ?? "", "Mot de bascule");

  const attackLocation = await runProductHelpSkill({
    user_message:
      "ou je retrouve la carte d'attaque du sas de dechargement pour la modifier ?",
    context,
  });
  assertEquals(attackLocation.diagnosis?.feature_id, "resources.attack_card");
  assertStringIncludes(
    attackLocation.reply ?? "",
    "Dashboard > Ressources > Cartes d'attaque du plan",
  );
  assertStringIncludes(
    attackLocation.reply ?? "",
    "seul le mot peut etre remplace",
  );
  assertEquals(
    (attackLocation.reply ?? "").includes("Dashboard > Plan"),
    false,
  );
  assertEquals((attackLocation.reply ?? "").includes("modifier ou"), false);

  const oneShotReminder = await runProductHelpSkill({
    user_message:
      "ce rappel ponctuel que tu viens de programmer, je le retrouve ou je le modifie ou ?",
    context: {
      ...context,
      recent_messages: [
        {
          role: "assistant",
          content:
            "C'est programmé pour jeudi 21 mai à 08:30 : reprendre le dossier client par trois puces moches.",
        },
      ],
    },
  });
  assertEquals(
    oneShotReminder.diagnosis?.feature_id,
    "one_shot_reminder.chat",
  );
  assertStringIncludes(
    oneShotReminder.reply ?? "",
    "me le redire ici clairement",
  );
  assertStringIncludes(
    oneShotReminder.reply ?? "",
    "côté Initiatives",
  );
  assertEquals(
    /Tu veux le modifier|quelle date|quelle heure/i.test(
      oneShotReminder.reply ?? "",
    ),
    false,
  );

  const pronounAttackLocation = await runProductHelpSkill({
    user_message: "je la retrouve ou pour la modifier ou l'imprimer ?",
    context: {
      ...context,
      recent_messages: [
        {
          role: "assistant",
          content:
            "C'est fait. J'ai cree cette carte d'attaque pour Faire le sas de dechargement.",
        },
      ],
    },
  });
  assertEquals(
    pronounAttackLocation.diagnosis?.feature_id,
    "resources.attack_card",
  );
  assertStringIncludes(
    pronounAttackLocation.reply ?? "",
    "Dashboard > Ressources > Cartes d'attaque du plan",
  );
  assertStringIncludes(
    pronounAttackLocation.reply ?? "",
    "seul le mot peut etre remplace",
  );
  assertEquals(
    (pronounAttackLocation.reply ?? "").includes("Dashboard > Plan"),
    false,
  );
  assertEquals(
    (pronounAttackLocation.reply ?? "").includes("modifier ou"),
    false,
  );

  const defense = await runProductHelpSkill({
    user_message: "comment une carte de defense est construite ?",
    context,
  });
  assertEquals(defense.diagnosis?.feature_id, "resources.defense_card");
  assertStringIncludes(defense.reply ?? "", "moment concret");
  assertStringIncludes(defense.reply ?? "", "plan B");

  const defenseEdit = await runProductHelpSkill({
    user_message: "je peux modifier une carte de defense apres creation ?",
    context,
  });
  assertEquals(defenseEdit.diagnosis?.feature_id, "resources.defense_card");
  assertStringIncludes(
    defenseEdit.reply ?? "",
    "plateforme",
  );
  assertStringIncludes(defenseEdit.reply ?? "", "Depuis le chat");

  const initiative = await runProductHelpSkill({
    user_message:
      "si je veux une initiative recurrente sans potion, je vais ou ?",
    context,
  });
  assertEquals(initiative.diagnosis?.feature_id, "initiatives");
  assertStringIncludes(initiative.reply ?? "", "onglet Initiatives");

  const base = await runProductHelpSkill({
    user_message: "la Base de vie garde les ressources et lignes rouge verte ?",
    context,
  });
  assertEquals(base.diagnosis?.feature_id, "base_de_vie");
  assertStringIncludes(base.reply ?? "", "historique de la transformation");
  assertStringIncludes(base.reply ?? "", "lignes verte et rouge");

  const transition = await runProductHelpSkill({
    user_message:
      "ou est la suite du parcours verrouillee pour lancer une prochaine transformation ?",
    context,
  });
  assertEquals(transition.diagnosis?.feature_id, "transformation.transition");
  assertStringIncludes(transition.reply ?? "", "s'ouvre automatiquement");
  assertStringIncludes(transition.reply ?? "", "2 transformations actives");
  assertEquals(
    (transition.reply ?? "").includes("Dashboard > Plan > Suite du parcours"),
    false,
  );
  assertEquals(
    (transition.reply ?? "").includes("suite du parcours verrouillee"),
    false,
  );
});

Deno.test("product_help explanation then ok fais-le routes through dispatcher tool skill intent", async () => {
  const context = await loadProductHelpContext(contextInput());
  const help = await runProductHelpSkill({
    user_message: "comment je cree une carte d'attaque ?",
    context,
  });
  assertEquals(help.status, "complete");
  assertEquals(help.recommendation_need?.needed, false);

  const safety = initialSafetyContext({ channel: "whatsapp" });
  const frame = await runDispatcher({
    user_message: "ok fais-le",
    recent_messages: [
      { role: "user", content: "comment je cree une carte d'attaque ?" },
      { role: "assistant", content: help.reply ?? "" },
    ],
    user_id: "user-s3",
    channel: "whatsapp",
    active_skill_state: { skill_id: "product_help" },
    plan_snapshot: {},
    safety_context_output: safety,
  });
  const route = runConversationRouters({
    turn_frame: frame,
    active_skill_state: { skill_id: "product_help" },
    safety_context_risk_band: safety.risk_band,
  });
  assertEquals(route.response_owner, "tool_skill");
  assertEquals(route.selected_handler, "prepare_attack_card");
});

// ---------------------------------------------------------------------------
// Régression chantier 2 phase A (2026-05-28): product_help direct replies
// disambiguation entre carte et rappel quand les deux topics sont dans le
// contexte récent. Voir A2-r4 Tour 7.
// ---------------------------------------------------------------------------

Deno.test("product_help: user asks about the card when context has a recent reminder → card reply (A2-r4 T7)", async () => {
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message:
      "Où est-ce que je retrouve cette carte d'attaque dans l'app ? Juste l'emplacement, pas d'action.",
    context: {
      ...context,
      recent_messages: [
        {
          role: "assistant",
          content: "C'est programmé pour 11:35 : payer la facture.",
        },
        {
          role: "assistant",
          content:
            "C'est fait. J'ai cree cette carte d'attaque Payer la facture une fois pour toutes.",
        },
      ],
    },
  });
  assertEquals(output.diagnosis?.feature_id, "resources.attack_card");
  assertStringIncludes(
    output.reply ?? "",
    "Dashboard > Ressources > Cartes d'attaque du plan",
  );
  // Régression: avant le fix, le contexte contenant "programmé" + "rappel" en
  // implicite faisait basculer vers le directOneShotReminderReply.
  assertEquals(
    (output.reply ?? "").includes("côté Initiatives"),
    false,
  );
});

Deno.test("product_help: user asks about the reminder only → reminder reply (negative control)", async () => {
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message: "Ce rappel que tu viens de programmer, je le retrouve où ?",
    context: {
      ...context,
      recent_messages: [
        {
          role: "assistant",
          content: "C'est programmé pour 11:35 : payer la facture.",
        },
        {
          role: "assistant",
          content:
            "C'est fait. J'ai cree cette carte d'attaque Payer la facture une fois pour toutes.",
        },
      ],
    },
  });
  assertEquals(output.diagnosis?.feature_id, "one_shot_reminder.chat");
  assertStringIncludes(output.reply ?? "", "côté Initiatives");
});

Deno.test("product_help: current reminder mention wins over recent card", async () => {
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message: "où je retrouve ce rappel dans l'app ?",
    context: {
      ...context,
      recent_messages: [
        {
          role: "assistant",
          content:
            "C'est fait. J'ai cree cette carte d'attaque Payer la facture une fois pour toutes.",
        },
      ],
    },
  });
  assertEquals(output.diagnosis?.feature_id, "one_shot_reminder.chat");
  assertStringIncludes(output.reply ?? "", "rappel ponctuel");
  assertEquals((output.reply ?? "").includes("Cartes d'attaque"), false);
});

Deno.test("product_help: user pronoun 'la' for the recently created card still resolves to card", async () => {
  // Régression de l'ancien comportement: la garde de disambiguation ne doit
  // PAS casser le cas pronominal où le user ne nomme pas explicitement le
  // sujet et le contexte tranche.
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message: "je la retrouve ou pour la modifier ou l'imprimer ?",
    context: {
      ...context,
      recent_messages: [
        {
          role: "assistant",
          content:
            "C'est fait. J'ai cree cette carte d'attaque pour Faire le sas de dechargement.",
        },
      ],
    },
  });
  assertEquals(output.diagnosis?.feature_id, "resources.attack_card");
});

Deno.test("product_help active flow is preserved for inline product question", async () => {
  const context = await loadProductHelpContext(contextInput({
    active_skill_working_state: {
      version: 1,
      skill_id: "prepare_attack_card",
      status: "active",
      turn_count: 2,
      started_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:01:00.000Z",
      user_id: "user-s3",
      scope: "web",
      working_state: {
        pending_confirmation: {
          draft: "ne doit pas etre recopie",
        },
      },
    },
  }));
  const output = await runProductHelpSkill({
    user_message: "où je retrouverai la carte d'attaque dans l'app ?",
    context,
  });
  assertEquals(output.operation_suggestions, []);
  assertEquals(
    (output.diagnosis?.constraints as string[]).includes(
      "preserve_active_flow",
    ),
    true,
  );
  assertEquals(
    (output.reply ?? "").includes("ne doit pas etre recopie"),
    false,
  );
});

Deno.test("product_help no done language without committed source", async () => {
  const context = await loadProductHelpContext(contextInput());
  const outputs = [
    await runProductHelpSkill({
      user_message: "crée-moi une carte d'attaque pour ce truc",
      context,
    }),
    await runProductHelpSkill({
      user_message: "programme un rappel demain a 9h",
      context,
    }),
    await runProductHelpSkill({
      user_message: "active une potion de clarté",
      context,
    }),
  ];
  for (const output of outputs) {
    assertEquals(output.operation_suggestions, []);
    assertEquals(
      /j'ai créé|j'ai annulé|c'est programmé|j'ai modifié|j'ai enregistré|c'est appliqué/i
        .test(output.reply ?? ""),
      false,
    );
  }
});

Deno.test("context loaders enforce profile exclusions", async () => {
  const safety = await loadSafetyCrisisContext(contextInput());
  assertEquals(safety.plan_items.length, 0);
  assertEquals(safety.product_surfaces.length, 0);
  assertEquals(
    safety.relevant_memory_items.some((item) => item.id === "sensitive-1"),
    false,
  );
  const emotional = await loadEmotionalRepairContext(contextInput());
  assertEquals(emotional.plan_items.length, 1);
  assertEquals(emotional.product_surfaces.length, 0);
  assertEquals(
    emotional.relevant_memory_items.some((item) => item.id === "invalid-1"),
    false,
  );
  assertEquals(
    emotional.relevant_memory_items.some((item) => item.id === "sensitive-1"),
    false,
  );
  const product = await loadProductHelpContext(contextInput());
  assertEquals(product.plan_items.length, 0);
  assertEquals(product.product_surfaces.length, 1);
});
