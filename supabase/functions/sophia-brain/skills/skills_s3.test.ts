import {
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
import { runDemotivationRepairSkill } from "./demotivation_repair/skill.ts";
import { loadEmotionalRepairContext } from "./emotional_repair/context_loader.ts";
import { runEmotionalRepairSkill } from "./emotional_repair/skill.ts";
import { loadExecutionBreakdownContext } from "./execution_breakdown/context_loader.ts";
import { runExecutionBreakdownSkill } from "./execution_breakdown/skill.ts";
import { loadProductHelpContext } from "./product_help/context_loader.ts";
import { runProductHelpSkill } from "./product_help/skill.ts";
import { loadSafetyCrisisContext } from "./safety_crisis/context_loader.ts";
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
    const output = runSafetyCrisisSkill({ user_message: message, context });
    assertEquals(output.skill_id, "safety_crisis");
    assertEquals(output.recommendation_need?.needed, false);
    assertEquals(output.recommendation_need?.type, "none");
  }
});

Deno.test("safety_crisis owns phased safety state and exits only after deescalation", async () => {
  const criticalContext = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: { risk_band: "critical", reason_codes: [], evidence: [] },
    }),
  }));
  const acute = runSafetyCrisisSkill({
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
  const resolved = runSafetyCrisisSkill({
    user_message: "je ne vais pas me faire du mal, je suis pas en danger",
    context: exitCheckContext,
  });
  assertEquals(resolved.status, "continue");
  assertEquals(resolved.state_patch?.phase, "exit_check");
});

Deno.test("safety_crisis deescalates when means are away and human support is present", async () => {
  const criticalContext = await loadSafetyCrisisContext(contextInput({
    turn_frame: turnFrame({
      safety: { risk_band: "critical", reason_codes: [], evidence: [] },
    }),
  }));
  const entry = runSafetyCrisisSkill({
    user_message:
      "je suis au bord de faire une connerie ce soir et j'ai peur de me faire du mal",
    context: criticalContext,
  });
  assertEquals(entry.status, "continue");
  assertEquals(entry.state_patch?.phase, "acute_grounding");

  const virtualPresence = runSafetyCrisisSkill({
    user_message:
      "j'ai peur de me faire du mal ce soir, j'ai besoin que tu restes avec moi",
    context: criticalContext,
  });
  assertEquals(virtualPresence.status, "continue");
  assertEquals(virtualPresence.state_patch?.phase, "acute_grounding");
  assertEquals((virtualPresence.state_patch as any).user_not_alone, null);

  const aloneEntry = runSafetyCrisisSkill({
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

  const passiveWithRoommate = runSafetyCrisisSkill({
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
  const passiveExitCheck = runSafetyCrisisSkill({
    user_message:
      "non, pas de passage a l'acte. aucun medicament pres de moi, ma coloc reste avec moi et je suis en securite pour ce soir",
    context: passiveClearerContext,
  });
  assertEquals(passiveExitCheck.status, "exit");
  assertEquals(passiveExitCheck.state_patch?.phase, "resolved");
  assertEquals((passiveExitCheck.state_patch as any).has_means_nearby, false);

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
  const support = runSafetyCrisisSkill({
    user_message: "j'ai pose le couteau loin de moi mais je suis encore seul",
    context: supportContext,
  });
  assertEquals(support.status, "continue");
  assertEquals(support.state_patch?.phase, "support_contact");
  assertEquals((support.state_patch as any).has_means_nearby, false);
  assertEquals((support.state_patch as any).user_not_alone, false);

  const typographicMoved = runSafetyCrisisSkill({
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
  const exitCheck = runSafetyCrisisSkill({
    user_message:
      "ma soeur arrive dans dix minutes, je ne vais pas me faire de mal maintenant",
    context: exitCheckContext,
  });
  assertEquals(exitCheck.status, "continue");
  assertEquals(exitCheck.state_patch?.phase, "exit_check");

  const contactedSupport = runSafetyCrisisSkill({
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

  const reminderDetour = runSafetyCrisisSkill({
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
  const aloneReminderDetour = runSafetyCrisisSkill({
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
  const resolved = runSafetyCrisisSkill({
    user_message:
      "elle est la avec moi, je suis en securite et je ne vais rien faire ce soir",
    context: resolvedContext,
  });
  assertEquals(resolved.status, "exit");
  assertEquals(resolved.state_patch?.phase, "resolved");
  assertEquals(resolved.state_patch?.risk_band, "low");

  const resolvedByPhoneSupport = runSafetyCrisisSkill({
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

  const resolvedWithBrother = runSafetyCrisisSkill({
    user_message:
      "mon frere est la avec moi maintenant, je suis en securite et je ne vais pas me faire de mal",
    context: resolvedContext,
  });
  assertEquals(resolvedWithBrother.status, "exit");
  assertEquals(resolvedWithBrother.state_patch?.phase, "resolved");
  assertEquals((resolvedWithBrother.state_patch as any).user_not_alone, true);

  const resolvedWithCousin = runSafetyCrisisSkill({
    user_message:
      "ma cousine est la. je suis en securite, aucun medicament pres de moi",
    context: resolvedContext,
  });
  assertEquals(resolvedWithCousin.status, "exit");
  assertEquals(resolvedWithCousin.state_patch?.phase, "resolved");
  assertEquals((resolvedWithCousin.state_patch as any).user_not_alone, true);
});

Deno.test("emotional_repair scenarios produce safe memory candidates and handoff when ready", async () => {
  const context = await loadEmotionalRepairContext(contextInput());
  const scenarios = [
    "je suis nul",
    "j'ai honte d'avoir rate",
    "je culpabilise",
    "je suis angoisse",
    "ca va mieux mais j'arrive pas a faire ma marche",
  ];
  for (const message of scenarios) {
    const output = runEmotionalRepairSkill({ user_message: message, context });
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
  const handoff = runEmotionalRepairSkill({
    user_message: scenarios[4],
    context,
  });
  assertEquals(handoff.status, "handoff");
  assertEquals(handoff.handoff_request?.target_skill_id, "execution_breakdown");

  const softenedConcreteAsk = runEmotionalRepairSkill({
    user_message:
      "la phrase pas incapable m'aide un peu, je peux peut-etre envoyer une ligne",
    context,
  });
  assertEquals(softenedConcreteAsk.status, "handoff");
  assertEquals(
    softenedConcreteAsk.handoff_request?.target_skill_id,
    "execution_breakdown",
  );
});

Deno.test("execution_breakdown scenarios cover narrowing and emotional handoff", async () => {
  const context = await loadExecutionBreakdownContext(contextInput());
  const outputs = [
    runExecutionBreakdownSkill({
      user_message: "j'arrive pas a faire ma marche",
      context,
    }),
    runExecutionBreakdownSkill({
      user_message: "je bloque sur mon dossier",
      context,
    }),
    runExecutionBreakdownSkill({
      user_message: "je ne sais pas quoi faire",
      context,
    }),
    runExecutionBreakdownSkill({
      user_message: "ma routine est trop floue",
      context,
    }),
    runExecutionBreakdownSkill({
      user_message: "je suis nul de bloquer",
      context,
    }),
  ];
  assertEquals(outputs[0].diagnosis?.stage, "diagnosis");
  assertEquals(outputs[2].diagnosis?.stage, "diagnosis");
  assertEquals(outputs[4].status, "handoff");
  assertEquals(outputs[4].handoff_request?.target_skill_id, "emotional_repair");
});

Deno.test("demotivation_repair scenarios distinguish causes and handoff", async () => {
  const context = await loadDemotivationRepairContext(contextInput());
  const fatigue = runDemotivationRepairSkill({
    user_message: "je suis fatigue et vide",
    context,
  });
  const meaning = runDemotivationRepairSkill({
    user_message: "ca sert a rien",
    context,
  });
  const failure = runDemotivationRepairSkill({
    user_message: "j'ai encore rate",
    context,
  });
  const unclear = runDemotivationRepairSkill({
    user_message: "j'ai plus envie",
    context,
  });
  const handoff = runDemotivationRepairSkill({
    user_message: "je peux faire ma marche",
    context,
  });
  assertEquals(fatigue.diagnosis?.motivation_state, "fatigue");
  assertEquals(meaning.diagnosis?.motivation_state, "loss_of_meaning");
  assertEquals(failure.diagnosis?.motivation_state, "failure_accumulation");
  assertEquals(unclear.diagnosis?.motivation_state, "unclear");
  assertEquals(handoff.handoff_request?.target_skill_id, "execution_breakdown");
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
    const output = runProductHelpSkill({ user_message: message, context });
    assertEquals(output.skill_id, "product_help");
    assertEquals(output.status, "complete");
    assertEquals(output.recommendation_need?.needed, false);
  }
});

Deno.test("product_help catalog covers defense free creation and potion follow-up", async () => {
  const context = await loadProductHelpContext(contextInput());
  const defense = runProductHelpSkill({
    user_message: "comment je cree une carte de defense libre ?",
    context,
  });
  assertEquals(defense.diagnosis?.feature_id, "resources.defense_card");
  assertStringIncludes(defense.reply ?? "", "generee librement");
  assertStringIncludes(defense.reply ?? "", "Ressources");

  const potion = runProductHelpSkill({
    user_message: "a quoi sert une potion ?",
    context,
  });
  assertEquals(potion.diagnosis?.feature_id, "resources.potions");
  assertStringIncludes(potion.reply ?? "", "7 jours");
  assertStringIncludes(potion.reply ?? "", "initiative");

  const linkedCards = runProductHelpSkill({
    user_message:
      "si une carte est liee a une mission, je la retrouve ou apres generation ?",
    context,
  });
  assertEquals(linkedCards.diagnosis?.feature_id, "resources.plan_cards");

  const levelCompletion = runProductHelpSkill({
    user_message: "quand je finis un niveau, Sophia attend quoi de moi ?",
    context,
  });
  assertEquals(levelCompletion.diagnosis?.feature_id, "plan.level_completion");
});

Deno.test("product_help catalog reflects dashboard action corrections", async () => {
  const context = await loadProductHelpContext(contextInput());

  const bilans = runProductHelpSkill({
    user_message:
      "je peux rentrer mes propres bilans ou ajouter une action dans le dashboard ?",
    context,
  });
  assertEquals(bilans.diagnosis?.feature_id, "dashboard.plan");
  assertStringIncludes(bilans.reply ?? "", "WhatsApp");
  assertStringIncludes(bilans.reply ?? "", "dimanche");
  assertStringIncludes(bilans.reply ?? "", "ajouter librement une action");

  const tooLarge = runProductHelpSkill({
    user_message: "si l'action est trop grosse je fais quoi ?",
    context,
  });
  assertEquals(tooLarge.diagnosis?.feature_id, "plan.adjustment");
  assertStringIncludes(tooLarge.reply ?? "", "Ajuster le plan");
  assertStringIncludes(
    tooLarge.reply ?? "",
    "pas directement au niveau de la carte",
  );

  const attack = runProductHelpSkill({
    user_message: "quelles sont les techniques d'une carte d'attaque ?",
    context,
  });
  assertEquals(attack.diagnosis?.feature_id, "resources.attack_card");
  assertStringIncludes(attack.reply ?? "", "Le texte magique");
  assertStringIncludes(attack.reply ?? "", "Mot de bascule");

  const attackLocation = runProductHelpSkill({
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

  const oneShotReminder = runProductHelpSkill({
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

  const pronounAttackLocation = runProductHelpSkill({
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

  const defense = runProductHelpSkill({
    user_message: "comment une carte de defense est construite ?",
    context,
  });
  assertEquals(defense.diagnosis?.feature_id, "resources.defense_card");
  assertStringIncludes(defense.reply ?? "", "moment concret");
  assertStringIncludes(defense.reply ?? "", "plan B");

  const defenseEdit = runProductHelpSkill({
    user_message: "je peux modifier une carte de defense apres creation ?",
    context,
  });
  assertEquals(defenseEdit.diagnosis?.feature_id, "resources.defense_card");
  assertStringIncludes(
    defenseEdit.reply ?? "",
    "plateforme",
  );
  assertStringIncludes(defenseEdit.reply ?? "", "Depuis le chat");

  const initiative = runProductHelpSkill({
    user_message:
      "si je veux une initiative recurrente sans potion, je vais ou ?",
    context,
  });
  assertEquals(initiative.diagnosis?.feature_id, "initiatives");
  assertStringIncludes(initiative.reply ?? "", "onglet Initiatives");

  const base = runProductHelpSkill({
    user_message: "la Base de vie garde les ressources et lignes rouge verte ?",
    context,
  });
  assertEquals(base.diagnosis?.feature_id, "base_de_vie");
  assertStringIncludes(base.reply ?? "", "historique de la transformation");
  assertStringIncludes(base.reply ?? "", "lignes verte et rouge");

  const transition = runProductHelpSkill({
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
  const help = runProductHelpSkill({
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
