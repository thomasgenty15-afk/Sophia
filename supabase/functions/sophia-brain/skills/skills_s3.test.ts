import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runDispatcher } from "../dispatcher/dispatcher.v2.ts";
import { runConversationRouters } from "../routers/routers.ts";
import { runSafetyPregate } from "../safety/safety_pregate.ts";
import {
  clearActiveSkill,
  InMemoryActiveSkillStateRepository,
  loadActiveSkill,
  patchActiveSkill,
  setActiveSkillStateRepositoryForTest,
} from "./_shared/active_skill_state.ts";
import type { LoadSkillContextInput } from "./_shared/context.ts";
import { loadDemotivationRepairContext } from "./demotivation_repair/context_loader.ts";
import type {
  DemotivationRepairDecision,
  DemotivationRepairMotivationState,
} from "./demotivation_repair/contract.ts";
import {
  type DemotivationRepairStructuredIntakeInput,
  setDemotivationRepairIntakeRunnerForTest,
} from "./demotivation_repair/intake.ts";
import { DEMOTIVATION_REPAIR_PROMPT } from "./demotivation_repair/prompt.ts";
import { runDemotivationRepairSkill } from "./demotivation_repair/skill.ts";
import { loadEmotionalRepairContext } from "./emotional_repair/context_loader.ts";
import type { EmotionalRepairSkillDecision } from "./emotional_repair/contract.ts";
import { EMOTIONAL_REPAIR_PROMPT } from "./emotional_repair/prompt.ts";
import { runEmotionalRepairSkill } from "./emotional_repair/skill.ts";
import { loadExecutionBreakdownContext } from "./execution_breakdown/context_loader.ts";
import type { ExecutionDecision } from "./execution_breakdown/contract.ts";
import { EXECUTION_BREAKDOWN_PROMPT } from "./execution_breakdown/prompt.ts";
import { runExecutionBreakdownSkill } from "./execution_breakdown/skill.ts";
import { loadProductHelpContext } from "./product_help/context_loader.ts";
import { baseProductHelpDecision } from "./product_help/contract.ts";
import {
  legacyProductHelpHeuristicIntake,
  type ProductHelpStructuredIntakeInput,
} from "./product_help/intake.ts";
import { PRODUCT_HELP_PROMPT } from "./product_help/prompt.ts";
import { getProductHelpFeature } from "./product_help/retrieval.ts";
import {
  runProductHelpSkill as runProductHelpSkillImpl,
} from "./product_help/skill.ts";
import { loadSafetyCrisisContext } from "./safety_crisis/context_loader.ts";
import { setSafetyCrisisIntakeRunnerForTest } from "./safety_crisis/intake.ts";
import { SAFETY_CRISIS_PROMPT } from "./safety_crisis/prompt.ts";
import { runSafetyCrisisSkill } from "./safety_crisis/skill.ts";

function turnFrame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-s3",
    source_message_id: "message-s3",
    user_id: "user-s3",
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
  return await runProductHelpSkillImpl({
    ...input,
    intake_model: input.intake_model ??
      ((structured: ProductHelpStructuredIntakeInput) =>
        legacyProductHelpHeuristicIntake(structured)),
  });
}

function productHelpDecision(
  patch: Parameters<typeof baseProductHelpDecision>[0] = {},
) {
  return baseProductHelpDecision({
    intent: "explain_feature",
    target: {
      kind: "feature_catalog",
      feature_id: "resources.potions",
      confidence_band: "high",
    },
    grounding: {
      catalog_feature_ids: ["resources.potions"],
      db_sources_required: false,
      db_sources_used: [{
        source_type: "catalog",
        id: "resources.potions",
        label: "Potions",
      }],
    },
    response_contract: {
      max_questions: 0,
      allow_operation_suggestion: false,
      allow_status_projection: false,
      allow_generic_catalog_answer: true,
      must_include_location: false,
      must_include_limit: false,
    },
    ...patch,
  });
}

function installEmptySafetyIntakeStub() {
  setSafetyCrisisIntakeRunnerForTest(() => ({
    ok: true,
    signals: { uncertainty: "high" },
  }));
}

function demotivationDecision(
  patch: Partial<DemotivationRepairDecision> = {},
): DemotivationRepairDecision {
  return {
    skill_id: "demotivation_repair",
    intent: "unclear",
    phase: "diagnose",
    motivation_state: "unclear",
    action_readiness: "none",
    constraints: [
      "do_not_moralize",
      "do_not_modify_plan_yet",
      "prefer_smallest_action",
      "one_question_max",
    ],
    response_contract: {
      max_questions: 1,
      allow_plan_edit: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_attack_card_suggestion: false,
      allow_concrete_action: true,
      tone: "energy_preserving",
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    reply:
      "Je ne transforme pas ce decrochage en verdict sur toi. On garde juste le prochain appui minuscule.",
    state_patch: { summary: "Structured demotivation repair decision." },
    ...patch,
  };
}

async function withDemotivationDecision(
  decision: DemotivationRepairDecision,
  userMessage: string,
) {
  const context = await loadDemotivationRepairContext(contextInput());
  setDemotivationRepairIntakeRunnerForTest(() => ({
    ok: true,
    decision,
  }));
  try {
    return await runDemotivationRepairSkill({
      user_message: userMessage,
      context,
    });
  } finally {
    setDemotivationRepairIntakeRunnerForTest(null);
  }
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
    skill_id: "execution_breakdown",
    working_state: { target: "walk" },
  });
  const loaded = await loadActiveSkill("u1");
  assertEquals(loaded?.skill_id, "execution_breakdown");
  assertEquals(loaded?.previous_skill_id, "emotional_repair");
  assertEquals(loaded?.working_state?.target, "walk");
  await clearActiveSkill("u1");
  assertEquals(await loadActiveSkill("u1"), null);
});

Deno.test("safety_crisis handles varied safety scenarios without product push", async () => {
  installEmptySafetyIntakeStub();
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
  installEmptySafetyIntakeStub();
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
  installEmptySafetyIntakeStub();
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
  assertEquals(
    String(contactedSupport.reply ?? "").includes(
      "Dis-moi quand quelqu'un est avec toi",
    ),
    true,
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
  installEmptySafetyIntakeStub();
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
    setSafetyCrisisIntakeRunnerForTest(() => {
      throw new Error("stub_intake_failed");
    });
    const conservativeFailure = await runSafetyCrisisSkill({
      user_message: "je ne vais pas bien mais je ne suis pas en securite",
      context: criticalContext,
    });
    assertEquals(conservativeFailure.state_patch?.phase, "acute_grounding");
  } finally {
    setSafetyCrisisIntakeRunnerForTest(null);
  }

  try {
    setSafetyCrisisIntakeRunnerForTest(() => ({
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
    setSafetyCrisisIntakeRunnerForTest(null);
  }
});

Deno.test("safety_crisis structured intake finalization cases", async () => {
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
    setSafetyCrisisIntakeRunnerForTest(() => ({
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
    assertEquals((paraphraseRisk.diagnosis as any)?.intake_ok, true);
  } finally {
    setSafetyCrisisIntakeRunnerForTest(null);
  }

  try {
    setSafetyCrisisIntakeRunnerForTest(() => ({
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
    setSafetyCrisisIntakeRunnerForTest(null);
  }

  try {
    setSafetyCrisisIntakeRunnerForTest(() => ({
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
    setSafetyCrisisIntakeRunnerForTest(null);
  }

  try {
    setSafetyCrisisIntakeRunnerForTest(() => ({
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
    setSafetyCrisisIntakeRunnerForTest(null);
  }

  try {
    setSafetyCrisisIntakeRunnerForTest(() => ({
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
    setSafetyCrisisIntakeRunnerForTest(null);
  }

  try {
    setSafetyCrisisIntakeRunnerForTest(() => {
      throw new Error("intake_failed_for_test");
    });
    const failedIntake = await runSafetyCrisisSkill({
      user_message: "je ne vais pas bien",
      context: mediumContext,
    });
    assertEquals(failedIntake.state_patch?.phase !== "resolved", true);
    assertEquals((failedIntake.diagnosis as any)?.intake_ok, false);
  } finally {
    setSafetyCrisisIntakeRunnerForTest(null);
  }

  const criticalContext = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: { risk_band: "critical", reason_codes: [], evidence: [] },
    }),
  }));
  installEmptySafetyIntakeStub();
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
  setSafetyCrisisIntakeRunnerForTest(null);

  assertEquals(/emoji/i.test(SAFETY_CRISIS_PROMPT), false);
  assertStringIncludes(SAFETY_CRISIS_PROMPT, "JSON strict");
});

function emotionalDecision(
  patch: Partial<EmotionalRepairSkillDecision>,
): EmotionalRepairSkillDecision {
  return {
    skill_id: "emotional_repair",
    intent: "acute_self_attack",
    phase: "de_shame",
    emotional_dominance: "high",
    context_domain: "unknown",
    constraints: ["no_plan", "do_not_persist_identity_attack"],
    response_contract: {
      max_questions: 0,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_concrete_action: false,
      tone: "soft",
    },
    memory_write_candidates: [
      {
        source_text: "identity attack in current turn",
        should_persist_default: false,
        anti_identity_freeze_checked: true,
        sensitivity_level: 3,
        reason: "acute self-attack must not be frozen as identity",
      },
    ],
    reply:
      "Là, ce n'est pas une information fiable sur toi; c'est une attaque qui parle depuis la honte.",
    state_patch: { summary: "Identity attack separated from fact." },
    ...patch,
  };
}

Deno.test("emotional_repair scenarios produce safe memory candidates and handoff when ready", async () => {
  const context = await loadEmotionalRepairContext(contextInput());
  const scenarios: Array<[string, EmotionalRepairSkillDecision]> = [
    ["je suis nul", emotionalDecision({ intent: "acute_self_attack" })],
    [
      "j'ai honte d'avoir rate",
      emotionalDecision({ intent: "shame_or_guilt" }),
    ],
    ["je culpabilise", emotionalDecision({ intent: "shame_or_guilt" })],
    ["je suis angoisse", emotionalDecision({ intent: "anxiety_or_panic" })],
    [
      "ca va mieux mais j'arrive pas a faire ma marche",
      emotionalDecision({
        intent: "emotion_lowered_action_blocked",
        phase: "handoff_to_execution",
        emotional_dominance: "low",
        context_domain: "plan_execution",
        constraints: [],
        response_contract: {
          max_questions: 0,
          allow_plan: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_concrete_action: true,
          tone: "grounded",
        },
        handoff_request: {
          target_skill_id: "execution_breakdown",
          reason: "emotion_lowered_action_remains_blocked",
          confidence_band: "high",
        },
        memory_write_candidates: [],
        reply:
          "Ok, l'émotion est descendue; on peut passer au blocage concret de la marche.",
      }),
    ],
  ];
  for (const [message, decision] of scenarios) {
    const output = await runEmotionalRepairSkill({
      user_message: message,
      context,
      intake_model: () => decision,
    });
    assertEquals(output.skill_id, "emotional_repair");
    if (output.memory_write_candidates?.[0]) {
      assertEquals(
        output.memory_write_candidates[0].anti_identity_freeze_checked,
        true,
      );
      assertEquals(
        output.memory_write_candidates[0].should_persist_default,
        false,
      );
    }
  }
  const handoff = await runEmotionalRepairSkill({
    user_message: scenarios[4][0],
    context,
    intake_model: () => scenarios[4][1],
  });
  assertEquals(handoff.status, "handoff");
  assertEquals(handoff.handoff_request?.target_skill_id, "execution_breakdown");

  const softenedDecision = emotionalDecision({
    intent: "handoff_ready",
    phase: "handoff_to_execution",
    emotional_dominance: "low",
    context_domain: "relationship",
    constraints: ["relationship_context"],
    response_contract: {
      max_questions: 0,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_concrete_action: true,
      tone: "grounded",
    },
    handoff_request: {
      target_skill_id: "execution_breakdown",
      reason: "user_ready_to_send_one_line",
      confidence_band: "high",
    },
    memory_write_candidates: [],
    reply:
      "Oui, on peut maintenant se concentrer sur la ligne à envoyer, sans revenir au verdict sur toi.",
  });
  const softenedConcreteAsk = await runEmotionalRepairSkill({
    user_message:
      "la phrase pas incapable m'aide un peu, je peux peut-etre envoyer une ligne",
    context,
    intake_model: () => softenedDecision,
  });
  assertEquals(softenedConcreteAsk.status, "handoff");
  assertEquals(
    softenedConcreteAsk.handoff_request?.target_skill_id,
    "execution_breakdown",
  );
});

Deno.test("emotional_repair contract covers no-potion, relation repair, recurring support and safety", async () => {
  const context = await loadEmotionalRepairContext(contextInput());

  const acute = await runEmotionalRepairSkill({
    user_message: "je suis incapable, j'ai honte",
    context,
    intake_model: () =>
      emotionalDecision({
        intent: "acute_self_attack",
        constraints: [
          "no_plan",
          "no_questions",
          "do_not_persist_identity_attack",
        ],
        response_contract: {
          max_questions: 0,
          allow_plan: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_concrete_action: false,
          tone: "soft",
        },
        memory_write_candidates: [
          {
            source_text: "je suis incapable, j'ai honte",
            should_persist_default: false,
            anti_identity_freeze_checked: true,
            sensitivity_level: 3,
            reason: "identity attack is not durable truth",
          },
        ],
        reply:
          "Je te crois sur la honte, pas sur le verdict. On garde le fait, sans te réduire à ça.",
      }),
  });
  assertEquals(acute.status, "continue");
  assertEquals(acute.handoff_request?.target_skill_id, undefined);
  assertEquals(acute.operation_suggestions?.length ?? 0, 0);
  assertEquals(
    acute.memory_write_candidates?.[0]?.should_persist_default,
    false,
  );
  assertEquals(
    acute.memory_write_candidates?.[0]?.anti_identity_freeze_checked,
    true,
  );
  assertEquals((acute.reply ?? "").includes("?"), false);
  assertEquals(/\bchrono|choix A\/B|plan\b/i.test(acute.reply ?? ""), false);

  const noPotion = await runEmotionalRepairSkill({
    user_message: "pas de potion, aide-moi juste à redescendre",
    context,
    intake_model: () =>
      emotionalDecision({
        intent: "asks_regulation_without_potion",
        phase: "stabilize",
        emotional_dominance: "medium",
        constraints: ["no_potion", "no_tool", "short_reply"],
        response_contract: {
          max_questions: 0,
          allow_plan: false,
          allow_tool_suggestion: true,
          allow_potion_suggestion: true,
          allow_concrete_action: true,
          tone: "soft",
        },
        operation_suggestions: [
          {
            operation_type: "select_state_potion",
            reason: "should_be_filtered_by_no_potion",
            requires_user_consent: true,
          },
        ],
        memory_write_candidates: [],
        reply:
          "D'accord. Pose juste les pieds au sol et reviens à une seule expiration lente.",
      }),
  });
  assertEquals(
    (noPotion.diagnosis?.constraints as string[]).includes("no_potion"),
    true,
  );
  assertEquals(noPotion.operation_suggestions?.length ?? 0, 0);
  assertEquals((noPotion.reply ?? "").toLowerCase().includes("potion"), false);

  const relation = await runEmotionalRepairSkill({
    user_message:
      "j'ai honte d'avoir parlé sèchement à mon frère, donne-moi une phrase",
    context,
    intake_model: () =>
      emotionalDecision({
        intent: "asks_concrete_phrase",
        phase: "repair_relationship",
        emotional_dominance: "medium",
        context_domain: "relationship",
        constraints: [
          "relationship_context",
          "concrete_before_question",
          "no_plan",
        ],
        response_contract: {
          max_questions: 0,
          allow_plan: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_concrete_action: true,
          tone: "direct_soft",
        },
        memory_write_candidates: [],
        reply:
          'Tu peux lui écrire : "Je suis désolé de t\'avoir parlé sèchement. Tu ne méritais pas ça, et je vais faire attention à te parler avec plus de respect."',
      }),
  });
  assertEquals(relation.diagnosis?.context_domain, "relationship");
  assertStringIncludes(relation.reply ?? "", "Je suis désolé");
  assertEquals(
    /\bproductiv|marche|dossier|plan\b/i.test(relation.reply ?? ""),
    false,
  );
  assertEquals(relation.operation_suggestions?.length ?? 0, 0);

  const recurring = await runEmotionalRepairSkill({
    user_message:
      "j'aimerais un soutien tous les soirs pour ne pas repartir en honte",
    context,
    intake_model: () =>
      emotionalDecision({
        intent: "asks_recurring_support",
        phase: "de_shame",
        emotional_dominance: "medium",
        constraints: ["one_question_max"],
        response_contract: {
          max_questions: 1,
          allow_plan: false,
          allow_tool_suggestion: true,
          allow_potion_suggestion: false,
          allow_concrete_action: true,
          tone: "grounded",
        },
        operation_suggestions: [
          {
            operation_type: "create_recurring_reminder",
            reason: "user_explicitly_asks_recurring_support",
            requires_user_consent: true,
            operation_input_hint: { frequency: "daily", time_hint: "evening" },
          },
        ],
        memory_write_candidates: [],
        reply:
          "Je peux te proposer un soutien récurrent du soir à valider, sans l'activer tant que tu ne confirmes pas.",
      }),
  });
  assertEquals(
    recurring.operation_suggestions?.[0]?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(
    recurring.operation_suggestions?.[0]?.requires_user_consent,
    true,
  );

  const shameOnly = await runEmotionalRepairSkill({
    user_message: "j'ai honte",
    context,
    intake_model: () =>
      emotionalDecision({
        intent: "shame_or_guilt",
        operation_suggestions: [],
      }),
  });
  assertEquals(shameOnly.operation_suggestions?.length ?? 0, 0);

  const noDoneLanguage = await runEmotionalRepairSkill({
    user_message: "aide-moi",
    context,
    intake_model: () =>
      emotionalDecision({
        reply: "J'ai créé le soutien, c'est programmé.",
      }),
  });
  assertEquals(noDoneLanguage.status, "continue");
  assertEquals(
    /c'est fait|créé|cree|programmé|programme|enregistré|enregistre/i.test(
      noDoneLanguage.reply ?? "",
    ),
    false,
  );

  const safetyContext = await loadEmotionalRepairContext(contextInput({
    turn_frame: turnFrame({
      safety: {
        risk_band: "critical",
        reason_codes: ["self_harm"],
        evidence: ["dispatcher"],
      },
    }),
  }));
  const safety = await runEmotionalRepairSkill({
    user_message: "je suis nul",
    context: safetyContext,
    intake_model: () => emotionalDecision({}),
  });
  assertEquals(safety.status, "handoff");
  assertEquals(safety.handoff_request?.target_skill_id, "safety_crisis");
});

Deno.test("emotional_repair safe renderer finalizes failures, memory and prompt invariants", async () => {
  const context = await loadEmotionalRepairContext(contextInput());

  const intakeFailure = await runEmotionalRepairSkill({
    user_message: "je suis nul",
    context,
    intake_model: () => {
      throw new Error("stub_intake_failed");
    },
  });
  assertEquals(intakeFailure.status, "continue");
  assertEquals(intakeFailure.reply, undefined);
  assertEquals(intakeFailure.operation_suggestions?.length ?? 0, 0);
  assertEquals(intakeFailure.memory_write_candidates?.length ?? 0, 0);
  assertEquals(intakeFailure.recommendation_need?.needed, false);
  assertEquals(intakeFailure.effects?.committed, []);

  const invalidDoneReply = await runEmotionalRepairSkill({
    user_message: "je suis incapable",
    context,
    intake_model: () =>
      emotionalDecision({
        reply: "J'ai créé un soutien, c'est programmé.",
      }),
  });
  assertEquals(invalidDoneReply.status, "continue");
  assertEquals(
    /c'est fait|créé|cree|programmé|programme|enregistré|enregistre/i.test(
      invalidDoneReply.reply ?? "",
    ),
    false,
  );

  const tooManyQuestions = await runEmotionalRepairSkill({
    user_message: "j'ai honte",
    context,
    intake_model: () =>
      emotionalDecision({
        response_contract: {
          max_questions: 0,
          allow_plan: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_concrete_action: false,
          tone: "soft",
        },
        reply: "Tu veux qu'on regarde ça ? Tu veux une question ?",
      }),
  });
  assertEquals((tooManyQuestions.reply ?? "").includes("?"), false);

  const noPotion = await runEmotionalRepairSkill({
    user_message: "pas de potion, juste aide-moi",
    context,
    intake_model: () =>
      emotionalDecision({
        intent: "asks_regulation_without_potion",
        phase: "stabilize",
        emotional_dominance: "medium",
        constraints: ["no_potion", "short_reply"],
        response_contract: {
          max_questions: 0,
          allow_plan: false,
          allow_tool_suggestion: true,
          allow_potion_suggestion: true,
          allow_concrete_action: true,
          tone: "soft",
        },
        operation_suggestions: [{
          operation_type: "select_state_potion",
          reason: "must_be_filtered",
          requires_user_consent: true,
        }],
        reply: "Je peux proposer une potion si tu veux.",
      }),
  });
  assertEquals(noPotion.operation_suggestions?.length ?? 0, 0);
  assertEquals(
    (noPotion.reply ?? "").toLowerCase().includes("potion"),
    false,
  );

  const identityMemory = await runEmotionalRepairSkill({
    user_message: "je suis nul",
    context,
    intake_model: () =>
      emotionalDecision({
        memory_write_candidates: [{
          source_text: "je suis nul",
          should_persist_default: false,
          anti_identity_freeze_checked: true,
          sensitivity_level: 3,
          reason: "raw_identity_attack_should_not_survive",
        }],
      }),
  });
  const identityContent = identityMemory.memory_write_candidates?.[0]
    ?.content_text ?? "";
  assertEquals(identityContent.includes("je suis nul"), false);
  assertStringIncludes(identityContent, "Episode de honte");
  assertEquals(
    identityMemory.memory_write_candidates?.[0]?.should_persist_default,
    false,
  );

  const relationMemory = await runEmotionalRepairSkill({
    user_message: "j'ai honte d'avoir parlé sèchement à mon frère",
    context,
    intake_model: () =>
      emotionalDecision({
        intent: "relational_repair",
        phase: "repair_relationship",
        context_domain: "relationship",
        constraints: [
          "relationship_context",
          "do_not_persist_identity_attack",
        ],
        memory_write_candidates: [{
          source_text: "je suis toxique d'avoir parlé sèchement",
          should_persist_default: false,
          anti_identity_freeze_checked: true,
          sensitivity_level: 3,
          reason: "relationship_context_should_be_contextualized",
        }],
        reply: "On peut reconnaître le tort sans te réduire à une identité.",
      }),
  });
  const relationContent = relationMemory.memory_write_candidates?.[0]
    ?.content_text ?? "";
  assertEquals(relationContent.includes("je suis toxique"), false);
  assertStringIncludes(relationContent, "réparation relationnelle sobre");

  assertEquals(
    EMOTIONAL_REPAIR_PROMPT.includes("doit contenir au moins 1 emoji"),
    false,
  );
  assertStringIncludes(EMOTIONAL_REPAIR_PROMPT, "ne jamais forcer un emoji");

  const handoff = await runEmotionalRepairSkill({
    user_message: "ça va mieux mais je bloque encore",
    context,
    intake_model: () =>
      emotionalDecision({
        intent: "emotion_lowered_action_blocked",
        phase: "handoff_to_execution",
        emotional_dominance: "low",
        context_domain: "plan_execution",
        constraints: [],
        response_contract: {
          max_questions: 0,
          allow_plan: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_concrete_action: true,
          tone: "grounded",
        },
        handoff_request: {
          target_skill_id: "execution_breakdown",
          reason: "emotion_lowered_action_blocked",
          confidence_band: "high",
        },
        memory_write_candidates: [],
        reply: "On passe au blocage concret.",
      }),
  });
  assertEquals(handoff.status, "handoff");
  assertEquals(handoff.handoff_request?.target_skill_id, "execution_breakdown");
});

function executionDecision(
  patch: Partial<ExecutionDecision>,
): ExecutionDecision {
  return {
    skill_id: "execution_breakdown",
    intent: "diagnose_blocker",
    phase: "diagnose",
    target: {
      kind: "message",
      title: "dossier",
      raw_label: "dossier",
      confidence_band: "medium",
    },
    blocker: "friction_demarrage",
    action_readiness: "none",
    emotional_dominance: "low",
    constraints: ["short_reply", "one_question_max"],
    response_contract: {
      max_questions: 1,
      allow_tool_suggestion: true,
      allow_plan_edit_suggestion: false,
      allow_card_suggestion: true,
      allow_exact_phrase: false,
      must_start_with_concrete_action: false,
      max_bullets: 2,
      tone: "practical",
    },
    operation_suggestions: [],
    memory_write_candidates: [{
      source_text: "execution blocker in current turn",
      should_persist_default: false,
      anti_identity_freeze_checked: true,
      sensitivity_level: 1,
      reason: "execution_breakdown_structured_observation",
    }],
    reply:
      "On garde la cible et on repère juste le point de blocage avant d'ajouter un outil.",
    state_patch: { summary: "Structured execution decision for test." },
    ...patch,
  };
}

async function withExecutionDecision(
  decision: ExecutionDecision,
  userMessage: string,
) {
  const context = await loadExecutionBreakdownContext(contextInput());
  return await runExecutionBreakdownSkill({
    user_message: userMessage,
    context,
    intake_model: () => decision,
  });
}

Deno.test("execution_breakdown uses structured intake model", async () => {
  const output = await withExecutionDecision(
    executionDecision({
      target: {
        kind: "plan_item",
        plan_item_id: "walk",
        title: "marche",
        raw_label: "marche",
        confidence_band: "high",
      },
      blocker: "flou",
      reply: "Pose tes chaussures devant la porte, puis ouvre la sortie.",
    }),
    "je bloque sur la marche",
  );
  assertEquals(output.skill_id, "execution_breakdown");
  assertEquals(output.diagnosis?.intake_status, "ok");
  assertEquals(
    (output.diagnosis?.execution_decision as any).target.title,
    "marche",
  );
  assertEquals((output.diagnosis?.execution_decision as any).blocker, "flou");
});

Deno.test("execution_breakdown model failure is conservative and non-mutating", async () => {
  const context = await loadExecutionBreakdownContext(contextInput());
  const output = await runExecutionBreakdownSkill({
    user_message: "je bloque sur ma marche",
    context,
    intake_model: () => {
      throw new Error("model_down");
    },
  });
  assertEquals(output.diagnosis?.intake_status, "technical_fallback");
  assertEquals(output.diagnosis?.execution_decision, null);
  assertEquals((output.diagnosis?.target as any).confidence_band, "low");
  assertEquals(
    (output.diagnosis?.response_contract as any).allow_tool_suggestion,
    false,
  );
  assertEquals(output.operation_suggestions?.length, 0);
  assertEquals(output.reply, undefined);
  assertEquals(output.effects?.committed, []);
});

Deno.test("execution_breakdown contract owns target blocker constraints and tool suggestions", async () => {
  const targetMissing = await withExecutionDecision(
    executionDecision({
      intent: "target_resolution",
      phase: "resolve_target",
      target: { kind: "unknown", confidence_band: "low" },
      blocker: "unknown",
      response_contract: {
        max_questions: 1,
        allow_tool_suggestion: true,
        allow_plan_edit_suggestion: true,
        allow_card_suggestion: true,
        allow_exact_phrase: false,
        must_start_with_concrete_action: false,
        max_bullets: 0,
        tone: "direct_soft",
      },
      operation_suggestions: [{
        operation_type: "prepare_attack_card",
        reason: "should_be_filtered_when_target_low",
        requires_user_consent: true,
      }],
      reply: "Quelle action précise bloque là, maintenant ?",
    }),
    "je bloque",
  );
  const targetMissingDecision = targetMissing.diagnosis
    ?.execution_decision as any;
  assertEquals(targetMissingDecision.target.confidence_band, "low");
  assertEquals(targetMissing.operation_suggestions?.length, 0);
  assertEquals(targetMissingDecision.response_contract.max_questions, 1);
  assertEquals((targetMissing.reply ?? "").split("?").length - 1, 1);

  const concrete = await withExecutionDecision(
    executionDecision({
      intent: "asks_micro_action",
      phase: "give_micro_action",
      action_readiness: "needs_first_step",
      constraints: ["concrete_before_question", "short_reply"],
      response_contract: {
        max_questions: 1,
        allow_tool_suggestion: false,
        allow_plan_edit_suggestion: false,
        allow_card_suggestion: false,
        allow_exact_phrase: false,
        must_start_with_concrete_action: true,
        max_bullets: 0,
        tone: "practical",
      },
      reply: "Ouvre le dossier et écris une première ligne imparfaite.",
    }),
    "donne-moi juste un premier pas concret",
  );
  const concreteDecision = concrete.diagnosis?.execution_decision as any;
  assertEquals(
    concreteDecision.response_contract.must_start_with_concrete_action,
    true,
  );
  assertEquals((concrete.reply ?? "").startsWith("Ouvre"), true);

  const noQuestions = await withExecutionDecision(
    executionDecision({
      intent: "asks_micro_action",
      phase: "give_micro_action",
      constraints: ["no_questions", "concrete_before_question"],
      response_contract: {
        max_questions: 1,
        allow_tool_suggestion: false,
        allow_plan_edit_suggestion: false,
        allow_card_suggestion: false,
        allow_exact_phrase: false,
        must_start_with_concrete_action: true,
        max_bullets: 0,
        tone: "practical",
      },
      reply: "Ouvre le dossier et écris une ligne.",
    }),
    "pas de questions, dis-moi quoi faire",
  );
  const noQuestionsDecision = noQuestions.diagnosis?.execution_decision as any;
  assertEquals(noQuestionsDecision.response_contract.max_questions, 0);
  assertEquals((noQuestions.reply ?? "").includes("?"), false);

  const exactPhrase = await withExecutionDecision(
    executionDecision({
      intent: "asks_exact_phrase",
      phase: "draft_phrase",
      target: {
        kind: "relationship",
        raw_label: "message à envoyer",
        confidence_band: "medium",
      },
      blocker: "relationnel",
      constraints: ["exact_phrase_requested", "short_reply"],
      response_contract: {
        max_questions: 0,
        allow_tool_suggestion: true,
        allow_plan_edit_suggestion: false,
        allow_card_suggestion: true,
        allow_exact_phrase: true,
        must_start_with_concrete_action: false,
        max_bullets: 0,
        tone: "relationship_repair",
      },
      operation_suggestions: [{
        operation_type: "prepare_attack_card",
        reason: "should_be_filtered_for_exact_phrase",
        requires_user_consent: true,
      }],
      reply:
        "Tu peux envoyer: « Je suis désolé pour mon ton. Je veux réparer simplement. »",
    }),
    "donne-moi une phrase exacte à envoyer",
  );
  const exactPhraseDecision = exactPhrase.diagnosis?.execution_decision as any;
  assertEquals(exactPhraseDecision.intent, "asks_exact_phrase");
  assertEquals(exactPhraseDecision.target.kind, "relationship");
  assertEquals(exactPhrase.operation_suggestions?.length, 0);
  assertStringIncludes(exactPhrase.reply ?? "", "Tu peux envoyer");

  const emotionHandoff = await withExecutionDecision(
    executionDecision({
      intent: "emotion_dominates",
      phase: "diagnose",
      emotional_dominance: "high",
      response_contract: {
        max_questions: 0,
        allow_tool_suggestion: true,
        allow_plan_edit_suggestion: true,
        allow_card_suggestion: true,
        allow_exact_phrase: false,
        must_start_with_concrete_action: false,
        max_bullets: 0,
        tone: "direct_soft",
      },
      operation_suggestions: [{
        operation_type: "adjust_plan_item",
        reason: "should_be_filtered_when_emotion_high",
        requires_user_consent: true,
      }],
      reply:
        "On enlève d'abord le verdict contre toi. Ensuite seulement on découpe l'action.",
    }),
    "je suis nul incapable, j'arrive pas",
  );
  const emotionHandoffDecision = emotionHandoff.diagnosis
    ?.execution_decision as any;
  assertEquals(emotionHandoff.status, "handoff");
  assertEquals(emotionHandoffDecision.emotional_dominance, "high");
  assertEquals(emotionHandoff.operation_suggestions?.length, 0);

  const emotionConcrete = await withExecutionDecision(
    executionDecision({
      intent: "asks_micro_action",
      phase: "give_micro_action",
      emotional_dominance: "medium",
      constraints: ["concrete_before_question", "short_reply"],
      response_contract: {
        max_questions: 0,
        allow_tool_suggestion: false,
        allow_plan_edit_suggestion: false,
        allow_card_suggestion: false,
        allow_exact_phrase: false,
        must_start_with_concrete_action: true,
        max_bullets: 0,
        tone: "direct_soft",
      },
      reply: "Ouvre le message et écris seulement la première ligne.",
    }),
    "j'ai honte mais donne-moi juste la première ligne",
  );
  const emotionConcreteDecision = emotionConcrete.diagnosis
    ?.execution_decision as any;
  assertEquals(emotionConcrete.status, "continue");
  assertEquals(emotionConcreteDecision.emotional_dominance, "medium");
  assertEquals((emotionConcrete.reply ?? "").startsWith("Ouvre"), true);

  const attack = await withExecutionDecision(
    executionDecision({
      operation_suggestions: [{
        operation_type: "prepare_attack_card",
        reason: "clear_punctual_execution_block_can_use_attack_card",
        requires_user_consent: true,
      }],
    }),
    "je bloque sur mon dossier",
  );
  assertEquals(
    attack.operation_suggestions?.[0]?.operation_type,
    "prepare_attack_card",
  );
  assertEquals(attack.operation_suggestions?.[0]?.requires_user_consent, true);

  const defense = await withExecutionDecision(
    executionDecision({
      intent: "recurrent_risk",
      blocker: "risque_rechute",
      operation_suggestions: [{
        operation_type: "prepare_defense_card",
        reason: "recurrent_risk_needs_prevention",
        requires_user_consent: true,
      }],
    }),
    "je risque de craquer ce soir",
  );
  assertEquals(
    defense.operation_suggestions?.[0]?.operation_type,
    "prepare_defense_card",
  );
  assertEquals(defense.operation_suggestions?.[0]?.requires_user_consent, true);

  const adjust = await withExecutionDecision(
    executionDecision({
      intent: "action_too_large",
      blocker: "trop_grand",
      response_contract: {
        max_questions: 1,
        allow_tool_suggestion: true,
        allow_plan_edit_suggestion: true,
        allow_card_suggestion: false,
        allow_exact_phrase: false,
        must_start_with_concrete_action: false,
        max_bullets: 2,
        tone: "practical",
      },
      operation_suggestions: [{
        operation_type: "adjust_plan_item",
        reason: "action_too_large_or_user_asks_to_reduce",
        requires_user_consent: true,
      }],
    }),
    "ma marche est trop lourde, allège",
  );
  assertEquals(
    adjust.operation_suggestions?.[0]?.operation_type,
    "adjust_plan_item",
  );
  assertEquals(adjust.operation_suggestions?.[0]?.requires_user_consent, true);

  const vagueBlock = await withExecutionDecision(
    executionDecision({
      target: { kind: "unknown", confidence_band: "low" },
      operation_suggestions: [{
        operation_type: "adjust_plan_item",
        reason: "should_be_filtered_when_target_low",
        requires_user_consent: true,
      }],
    }),
    "je bloque",
  );
  assertEquals(
    vagueBlock.operation_suggestions?.some((suggestion) =>
      suggestion.operation_type === "adjust_plan_item"
    ),
    false,
  );

  const noTool = await withExecutionDecision(
    executionDecision({
      constraints: ["no_tool"],
      operation_suggestions: [{
        operation_type: "prepare_attack_card",
        reason: "should_be_filtered_by_no_tool",
        requires_user_consent: true,
      }],
    }),
    "pas d'outil, je bloque sur mon dossier",
  );
  assertEquals(noTool.operation_suggestions?.length, 0);

  const noPlanEdit = await withExecutionDecision(
    executionDecision({
      constraints: ["do_not_edit_plan"],
      response_contract: {
        max_questions: 1,
        allow_tool_suggestion: true,
        allow_plan_edit_suggestion: true,
        allow_card_suggestion: true,
        allow_exact_phrase: false,
        must_start_with_concrete_action: false,
        max_bullets: 2,
        tone: "practical",
      },
      operation_suggestions: [{
        operation_type: "adjust_plan_item",
        reason: "should_be_filtered_by_no_plan_edit",
        requires_user_consent: true,
      }],
    }),
    "ne change pas mon plan, ma marche est trop lourde",
  );

  const lowTargetTool = await withExecutionDecision(
    executionDecision({
      target: { kind: "unknown", confidence_band: "low" },
      operation_suggestions: [{
        operation_type: "prepare_defense_card",
        reason: "should_be_filtered_when_target_low",
        requires_user_consent: true,
      }],
    }),
    "aide-moi",
  );
  assertEquals(lowTargetTool.operation_suggestions?.length, 0);

  const noDoneLanguage = await withExecutionDecision(
    executionDecision({
      reply: "C'est fait, j'ai créé la carte.",
    }),
    "aide-moi",
  );
  assertEquals(
    /(c'est fait|créé|programmé|enregistré)/i.test(
      noDoneLanguage.reply ?? "",
    ),
    false,
  );
  assertEquals(
    noPlanEdit.operation_suggestions?.some((suggestion) =>
      suggestion.operation_type === "adjust_plan_item"
    ),
    false,
  );

  for (
    const output of [
      targetMissing,
      concrete,
      noQuestions,
      exactPhrase,
      emotionHandoff,
      emotionConcrete,
      attack,
      defense,
      adjust,
      noTool,
      noPlanEdit,
      lowTargetTool,
      noDoneLanguage,
    ]
  ) {
    const reply = output.reply ?? "";
    assertEquals(reply.includes("c'est fait"), false);
    assertEquals(reply.includes("créé"), false);
    assertEquals(reply.includes("programmé"), false);
    assertEquals(reply.includes("enregistré"), false);
  }
});

Deno.test("execution_breakdown prompt contract includes priority rules", () => {
  assertStringIncludes(EXECUTION_BREAKDOWN_PROMPT, "cible avant diagnostic");
  assertStringIncludes(
    EXECUTION_BREAKDOWN_PROMPT,
    "geste concret avant question",
  );
  assertStringIncludes(EXECUTION_BREAKDOWN_PROMPT, "phrase exacte");
  assertStringIncludes(EXECUTION_BREAKDOWN_PROMPT, "handoff emotional_repair");
  assertStringIncludes(
    EXECUTION_BREAKDOWN_PROMPT,
    "suggestions tool consenties",
  );
});

Deno.test("demotivation_repair uses structured intake model", async () => {
  const context = await loadDemotivationRepairContext(contextInput());
  const seenInputs: DemotivationRepairStructuredIntakeInput[] = [];
  const output = await runDemotivationRepairSkill({
    user_message: "je suis vidé, j'ai plus d'élan",
    context,
    intake_model: (input) => {
      seenInputs.push(input);
      return demotivationDecision({
        intent: "fatigue_drop",
        phase: "stabilize_energy",
        motivation_state: "fatigue",
        action_readiness: "none",
        reply:
          "Je le prends comme une baisse d'énergie, pas comme un manque de volonté. On garde un geste minuscule.",
      });
    },
  });

  assertEquals(seenInputs.length, 1);
  const seenInput = seenInputs[0] as DemotivationRepairStructuredIntakeInput;
  assertEquals(seenInput.user_message, "je suis vidé, j'ai plus d'élan");
  assertEquals(output.diagnosis?.intake_status, "structured");
  assertEquals(output.diagnosis?.motivation_state, "fatigue");
});

Deno.test("demotivation_repair intake failure conservative no tool", async () => {
  const context = await loadDemotivationRepairContext(contextInput());
  const output = await runDemotivationRepairSkill({
    user_message: "je suis vidé",
    context,
    intake_model: () => {
      throw new Error("stub_demotivation_intake_failed");
    },
  });

  assertEquals(output.status, "continue");
  assertEquals(output.handoff_request, undefined);
  assertEquals(output.operation_suggestions?.length ?? 0, 0);
  assertEquals(output.recommendation_need?.needed, false);
  assertEquals(output.diagnosis?.intake_status, "technical_fallback");
  assertEquals(
    output.diagnosis?.intake_reason,
    "stub_demotivation_intake_failed",
  );
});

Deno.test("demotivation_repair no existing state uses model when available", async () => {
  const context = await loadDemotivationRepairContext(contextInput({
    active_skill_working_state: null,
  }));
  let calls = 0;
  const output = await runDemotivationRepairSkill({
    user_message: "ça sert à rien",
    context,
    intake_model: () => {
      calls++;
      return demotivationDecision({
        intent: "loss_of_meaning",
        phase: "restore_meaning",
        motivation_state: "loss_of_meaning",
        reply: "On reste avec la perte de sens avant de pousser l'action.",
      });
    },
  });

  assertEquals(calls, 1);
  assertEquals(output.diagnosis?.motivation_state, "loss_of_meaning");
  assertEquals(output.diagnosis?.intake_status, "structured");
});

Deno.test("demotivation_repair prompt does not force emoji", () => {
  assertEquals(
    DEMOTIVATION_REPAIR_PROMPT.includes("doit contenir au moins 1 emoji"),
    false,
  );
  assertStringIncludes(DEMOTIVATION_REPAIR_PROMPT, "ne force jamais un emoji");
});

Deno.test("demotivation_repair identity memory redacted", async () => {
  const output = await withDemotivationDecision(
    demotivationDecision({
      intent: "failure_accumulation",
      motivation_state: "failure_accumulation",
      memory_write_candidates: [{
        source_text: "je suis flemmard et je suis incapable de tenir",
        should_persist_default: false,
        anti_identity_freeze_checked: true,
        sensitivity_level: 2,
        reason: "raw_identity_negative_statement_should_not_survive",
      }],
    }),
    "je suis flemmard et je suis incapable de tenir",
  );

  const content = output.memory_write_candidates?.[0]?.content_text ?? "";
  assertEquals(content.includes("je suis flemmard"), false);
  assertEquals(content.includes("je suis incapable"), false);
  assertStringIncludes(content, "Episode de décrochage motivationnel");
  assertEquals(
    output.memory_write_candidates?.[0]?.should_persist_default,
    false,
  );
});

Deno.test("demotivation_repair fatigue_drop_no_moralizing", async () => {
  const output = await withDemotivationDecision(
    demotivationDecision({
      intent: "fatigue_drop",
      phase: "stabilize_energy",
      motivation_state: "fatigue",
      reply:
        "Je le prends comme une baisse d'energie, pas comme un manque de volonte. Le plus utile est de garder un geste tres petit.",
    }),
    "je suis vide, j'ai plus d'elan",
  );
  assertEquals(output.diagnosis?.motivation_state, "fatigue");
  assertEquals(
    output.operation_suggestions?.some((s) =>
      s.operation_type === "adjust_plan_item"
    ),
    false,
  );
  assertEquals(
    /discipline|forcer|il faut juste/i.test(output.reply ?? ""),
    false,
  );
});

Deno.test("demotivation_repair loss_of_meaning_stays_demotivation", async () => {
  const output = await withDemotivationDecision(
    demotivationDecision({
      intent: "loss_of_meaning",
      phase: "restore_meaning",
      motivation_state: "loss_of_meaning",
      reply:
        "Si ca parait inutile, on ne saute pas vers l'execution. On cherche d'abord ce qui a perdu son sens.",
    }),
    "ca sert a rien",
  );
  assertEquals(output.status, "continue");
  assertEquals(output.handoff_request, undefined);
});

Deno.test("demotivation_repair failure_accumulation_no_identity_freeze", async () => {
  const output = await withDemotivationDecision(
    demotivationDecision({
      intent: "failure_accumulation",
      phase: "reduce_friction",
      motivation_state: "failure_accumulation",
      memory_write_candidates: [{
        source_text: "j'ai encore rate, je suis incapable de tenir",
        should_persist_default: false,
        anti_identity_freeze_checked: true,
        sensitivity_level: 2,
        reason: "identity_negative_statement_kept_non_persistent",
      }],
      reply:
        "Je ne garde pas cette phrase comme une identite. On regarde seulement le moment ou la boucle casse.",
    }),
    "j'ai encore rate, je suis incapable de tenir",
  );
  const candidate = output.memory_write_candidates?.[0];
  assertEquals(candidate?.should_persist_default, false);
  assertEquals(candidate?.anti_identity_freeze_checked, true);
});

Deno.test("demotivation_repair concrete_action_ready_handoff", async () => {
  const output = await withDemotivationDecision(
    demotivationDecision({
      intent: "concrete_action_emerged",
      phase: "handoff_to_execution",
      motivation_state: "fatigue",
      action_readiness: "ready",
      handoff_request: {
        target_skill_id: "execution_breakdown",
        reason: "ready_action_can_be_reduced",
        confidence_band: "high",
      },
      reply:
        "La prochaine action est assez claire. Je bascule vers le decoupage pour reduire la friction.",
    }),
    "ok je vais mettre mes chaussures maintenant",
  );
  assertEquals(output.status, "handoff");
  assertEquals(output.response_intent, "handoff_to_execution");
  assertEquals(output.handoff_request?.target_skill_id, "execution_breakdown");
});

Deno.test("demotivation_repair hypothetical_action_no_handoff", async () => {
  const output = await withDemotivationDecision(
    demotivationDecision({
      intent: "concrete_action_emerged",
      motivation_state: "fatigue",
      action_readiness: "hypothetical",
      handoff_request: {
        target_skill_id: "execution_breakdown",
        reason: "hypothetical_action_only",
        confidence_band: "medium",
      },
      reply:
        "Comme c'est encore au conditionnel, je reste avec le decrochage et on garde l'action minuscule.",
    }),
    "je pourrais peut-etre marcher",
  );
  assertEquals(output.status, "continue");
  assertEquals(output.handoff_request, undefined);
});

Deno.test("demotivation_repair no_potion_blocks_potion", async () => {
  const output = await withDemotivationDecision(
    demotivationDecision({
      intent: "asks_no_tool_support",
      constraints: ["no_potion", "do_not_moralize", "short_reply"],
      response_contract: {
        max_questions: 0,
        allow_plan_edit: false,
        allow_tool_suggestion: true,
        allow_potion_suggestion: true,
        allow_attack_card_suggestion: false,
        allow_concrete_action: true,
        tone: "soft_direct",
      },
      operation_suggestions: [{
        operation_type: "select_state_potion",
        reason: "structured_decision_attempted_potion",
        requires_user_consent: true,
      }],
      reply:
        "D'accord, sans potion. Je reste simple: un seul geste respirable.",
    }),
    "pas de potion, parle-moi juste simplement",
  );
  assertEquals(
    output.operation_suggestions?.some((s) =>
      s.operation_type === "select_state_potion"
    ),
    false,
  );
});

Deno.test("demotivation_repair no_tool_blocks_all_suggestions", async () => {
  const output = await withDemotivationDecision(
    demotivationDecision({
      intent: "asks_no_tool_support",
      constraints: ["no_tool", "do_not_moralize", "short_reply"],
      response_contract: {
        max_questions: 0,
        allow_plan_edit: true,
        allow_tool_suggestion: true,
        allow_potion_suggestion: true,
        allow_attack_card_suggestion: true,
        allow_concrete_action: true,
        tone: "soft_direct",
      },
      operation_suggestions: [{
        operation_type: "prepare_attack_card",
        reason: "structured_decision_attempted_tool",
        requires_user_consent: true,
      }],
      reply: "Sans outil. On revient juste au plus petit mouvement possible.",
    }),
    "pas d'outil, aide-moi juste a reprendre",
  );
  assertEquals(output.operation_suggestions?.length, 0);
});

Deno.test("demotivation_repair recurring_support_only_when_explicit", async () => {
  const explicit = await withDemotivationDecision(
    demotivationDecision({
      intent: "asks_recurring_support",
      response_contract: {
        max_questions: 0,
        allow_plan_edit: false,
        allow_tool_suggestion: true,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: false,
        allow_concrete_action: true,
        tone: "grounded",
      },
      operation_suggestions: [{
        operation_type: "create_recurring_reminder",
        reason: "explicit_recurring_support_requested",
        requires_user_consent: true,
        operation_input_hint: {
          frequency: "daily_evening",
          message: "Revenir au plus petit geste.",
        },
      }],
      reply:
        "Je peux te proposer ce soutien regulier seulement si tu confirmes.",
    }),
    "rappelle-moi chaque soir de revenir au plus petit geste",
  );
  assertEquals(
    explicit.operation_suggestions?.[0]?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(
    explicit.operation_suggestions?.[0]?.requires_user_consent,
    true,
  );

  const implicit = await withDemotivationDecision(
    demotivationDecision({
      intent: "fatigue_drop",
      motivation_state: "fatigue",
      reply:
        "Je reste sur le decrochage maintenant, sans ajouter de rappel recurrent.",
    }),
    "je decroche",
  );
  assertEquals(
    implicit.operation_suggestions?.some((s) =>
      s.operation_type === "create_recurring_reminder"
    ),
    false,
  );
});

Deno.test("demotivation_repair plan_edit_only_when_explicit", async () => {
  const explicit = await withDemotivationDecision(
    demotivationDecision({
      intent: "asks_smaller_step",
      constraints: ["do_not_moralize", "prefer_smallest_action"],
      response_contract: {
        max_questions: 0,
        allow_plan_edit: true,
        allow_tool_suggestion: true,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: false,
        allow_concrete_action: true,
        tone: "grounded",
      },
      operation_suggestions: [{
        operation_type: "adjust_plan_item",
        reason: "explicit_plan_lightening_requested",
        requires_user_consent: true,
      }],
      reply: "Je peux proposer un allegement, mais seulement avec ton accord.",
    }),
    "allege mon plan",
  );
  assertEquals(
    explicit.operation_suggestions?.[0]?.operation_type,
    "adjust_plan_item",
  );
  assertEquals(
    explicit.operation_suggestions?.[0]?.requires_user_consent,
    true,
  );

  const tooEarly = await withDemotivationDecision(
    demotivationDecision({
      intent: "fatigue_drop",
      constraints: ["do_not_modify_plan_yet", "do_not_moralize"],
      response_contract: {
        max_questions: 1,
        allow_plan_edit: true,
        allow_tool_suggestion: true,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: false,
        allow_concrete_action: true,
        tone: "energy_preserving",
      },
      operation_suggestions: [{
        operation_type: "adjust_plan_item",
        reason: "structured_decision_attempted_plan_edit_too_early",
        requires_user_consent: true,
      }],
      reply:
        "Je ne modifie pas le plan juste parce que l'elan est bas. On commence par baisser la friction.",
    }),
    "j'ai plus envie",
  );
  assertEquals(
    tooEarly.operation_suggestions?.some((s) =>
      s.operation_type === "adjust_plan_item"
    ),
    false,
  );
});

Deno.test("demotivation_repair no_done_language", async () => {
  const outputs = await Promise.all(
    ([
      ["fatigue", "je suis vide"],
      ["loss_of_meaning", "ca sert a rien"],
      ["failure_accumulation", "j'ai encore rate"],
    ] as Array<[DemotivationRepairMotivationState, string]>).map((
      [state, message],
    ) =>
      withDemotivationDecision(
        demotivationDecision({
          motivation_state: state,
          reply:
            "Je reste dans une reponse courte, sans annoncer d'action durable.",
        }),
        message,
      )
    ),
  );
  for (const output of outputs) {
    assert(
      !/(créé|cree|programmé|programme|enregistré|enregistre|c'est fait)/i
        .test(output.reply ?? ""),
    );
  }
});

Deno.test("product_help uses structured intake model decision", async () => {
  const context = await loadProductHelpContext(contextInput());
  const seenInputs: ProductHelpStructuredIntakeInput[] = [];
  const output = await runProductHelpSkill({
    user_message: "où sont les potions ?",
    context,
    intake_model: (input) => {
      seenInputs.push(input);
      return productHelpDecision({
        intent: "where_is_it",
        target: {
          kind: "feature_catalog",
          feature_id: "resources.potions",
          confidence_band: "high",
        },
        response_contract: {
          max_questions: 0,
          allow_operation_suggestion: false,
          allow_status_projection: false,
          allow_generic_catalog_answer: true,
          must_include_location: true,
          must_include_limit: false,
        },
      });
    },
  });

  assertEquals(output.diagnosis?.feature_id, "resources.potions");
  assertEquals(output.response_intent, "where_is_it");
  assertEquals(output.operation_suggestions, []);
  assertEquals(seenInputs.length, 1);
  const seenInput = seenInputs[0] as ProductHelpStructuredIntakeInput;
  assert(
    seenInput.catalog_candidates.some((feature) =>
      feature.id === "resources.potions"
    ),
  );
});

Deno.test("product_help intake failure uses non-mutating conservative fallback", async () => {
  const context = await loadProductHelpContext(contextInput());
  const output = await runProductHelpSkill({
    user_message: "où je retrouve cet objet ?",
    context,
    intake_model: () => {
      throw new Error("model_down");
    },
  });

  assertEquals(output.operation_suggestions, []);
  assertEquals(output.diagnosis?.bridge, null);
  assertEquals(output.reply, undefined);
  assertEquals(output.effects?.committed, []);
  assertEquals(output.diagnosis?.intake_status, "technical_fallback");
});

Deno.test("product_help prompt does not force emoji", () => {
  assertEquals(
    /emoji naturel|au moins 1 emoji|doit contenir/i.test(PRODUCT_HELP_PROMPT),
    false,
  );
  assertStringIncludes(
    PRODUCT_HELP_PROMPT,
    "operation_suggestions doit toujours etre []",
  );
});

Deno.test("product_help legacy heuristic intake is not the default structured path", async () => {
  const context = await loadProductHelpContext(contextInput());
  let modelCalls = 0;
  const output = await runProductHelpSkill({
    user_message: "à quoi servent les potions ?",
    context,
    intake_model: () => {
      modelCalls += 1;
      return productHelpDecision({
        state_patch: { decision: "structured_model_stub" },
      });
    },
  });

  assertEquals(modelCalls, 1);
  assertEquals(
    (output.state_patch as Record<string, unknown>)?.decision,
    "structured_model_stub",
  );
  assertEquals(
    JSON.stringify(output.state_patch).includes(
      "legacy_product_help_heuristic_intake",
    ),
    false,
  );
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

  const safety = runSafetyPregate({
    user_message: "ok fais-le",
    recent_messages: [
      { role: "user", content: "comment je cree une carte d'attaque ?" },
      { role: "assistant", content: help.reply ?? "" },
    ],
    user_id: "user-s3",
    channel: "whatsapp",
  });
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
    safety_pregate_output: safety,
  });
  const route = runConversationRouters({
    turn_frame: frame,
    active_skill_state: { skill_id: "product_help" },
    safety_pregate_risk_band: safety.risk_band,
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
