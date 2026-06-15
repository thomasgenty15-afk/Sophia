import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { initialSafetyContext } from "../safety/safety_context.ts";
import {
  loadReplayFixtures,
  runReplayFixtures,
} from "../test_harness/conversation_route_replay/runner.ts";
import {
  buildDispatcherPrompt,
  DISPATCHER_V2_PROMPT_VERSION,
  DISPATCHER_V2_SYSTEM_PROMPT,
} from "./dispatcher.prompts.ts";
import { type DispatcherRunStats, runDispatcher } from "./dispatcher.v2.ts";

async function dispatch(message: string, extra: Record<string, unknown> = {}) {
  const safety = initialSafetyContext({ channel: "whatsapp" });
  const stats: DispatcherRunStats[] = [];
  const frame = await runDispatcher({
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "whatsapp",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    safety_context_output: safety,
    source_message_id: "m1",
    turn_id: "t1",
    on_stats: (entry) => stats.push(entry),
    ...extra,
  });
  return { frame, stats };
}

function hasLegacyOpportunityField(frame: unknown): boolean {
  const legacyKey = ["tool", "skill", "opportunity"].join("_");
  return Boolean(frame && typeof frame === "object" && legacyKey in frame);
}

function hasFlowOpportunityFor(
  frame: { flow_opportunity?: { target_flow?: string } | null },
  targetFlow: string,
): boolean {
  return frame.flow_opportunity?.target_flow === targetFlow;
}

Deno.test("dispatcher v2 returns valid TurnFrames for varied messages", async () => {
  const messages = [
    "je veux me faire du mal ce soir",
    "j'ai rate ma marche, je suis nul",
    "ca sert a rien j'ai plus envie",
    "j'arrive pas a faire ma marche",
    "c'est quoi une potion ?",
    "rappelle-moi de prendre mes medocs a 18h",
    "j'ai fait ma marche du soir",
    "fais-moi une carte d'attaque pour ma marche",
    "oui mais c'est toujours pareil",
    "je suis vraiment nul de bloquer la-dessus",
    "Oui",
    "Non",
    "ok fais-le",
    "tu te souviens de l'appel ?",
    "non c'etait mon frere",
  ];
  for (const message of messages) {
    const { frame, stats } = await dispatch(message, {
      pending_tool_skill_confirmation: /^(Oui|Non)$/i.test(message)
        ? { operation_type: "prepare_attack_card" }
        : undefined,
    });
    assertEquals(frame.user_id, "u1", message);
    assertEquals(frame.channel, "whatsapp", message);
    assertEquals(Array.isArray(frame.direct_effects), true, message);
    assertEquals(Array.isArray(frame.tool_skill_intents), true, message);
    assertEquals(hasLegacyOpportunityField(frame), false, message);
    assertEquals(typeof frame.memory_plan.memory_mode, "string", message);
    assertEquals(stats.length, 1, message);
    assertEquals(stats[0].prompt_version, DISPATCHER_V2_PROMPT_VERSION);
  }
});

Deno.test("dispatcher prompt injects only the active stable skill description", () => {
  const activePrompt = JSON.parse(buildDispatcherPrompt({
    user_message: "support dans Sophia pour garder cette douceur",
    recent_messages: [],
    safety_risk_band: "none",
    active_skill_state: { skill_id: "emotional_repair" },
    plan_snapshot: { items: [] },
  }));

  assertEquals(
    activePrompt.active_skill_stable_description.skill_id,
    "emotional_repair",
  );
  assertStringIncludes(
    activePrompt.active_skill_stable_description.instruction,
    "Cette description ne crée pas une intention à elle seule",
  );
  assertStringIncludes(
    activePrompt.active_skill_stable_description.description,
    "“support”, “aide dans Sophia”, “un truc pour m’aider” peut signaler une potion, pas product_help",
  );

  const inactivePrompt = JSON.parse(buildDispatcherPrompt({
    user_message: "c'est quoi les potions dans Sophia ?",
    recent_messages: [],
    safety_risk_band: "none",
    plan_snapshot: { items: [] },
  }));
  assertEquals(inactivePrompt.active_skill_stable_description, null);
});

Deno.test("dispatcher prompt documents demotivation courage and soft-support boundaries", () => {
  assertStringIncludes(
    DISPATCHER_V2_SYSTEM_PROMPT,
    "avoidance_loop / besoin durable courage_through_avoidance",
  );
  assertStringIncludes(
    DISPATCHER_V2_SYSTEM_PROMPT,
    "cette contrainte bloque adjust_plan_item",
  );
  assertStringIncludes(
    DISPATCHER_V2_SYSTEM_PROMPT,
    "Un besoin d'appui, soutien, support",
  );
});

Deno.test("dispatcher prompt injects active handoff stable description", () => {
  const prompt = JSON.parse(buildDispatcherPrompt({
    user_message: "ok vas-y",
    recent_messages: [],
    safety_risk_band: "none",
    active_tool_skill_intake: { operation_type: "select_state_potion" },
    plan_snapshot: { items: [] },
  }));

  assertEquals(
    prompt.active_skill_stable_description.skill_id,
    "select_state_potion",
  );
  assertStringIncludes(
    prompt.active_skill_stable_description.description,
    "il ne lance pas la potion depuis le chat",
  );
});

Deno.test("dispatcher v2 never lowers safety context risk", async () => {
  const { frame } = await dispatch("je veux me faire du mal ce soir");
  assertEquals(frame.safety.risk_band, "critical");
});

Deno.test("dispatcher v2 computes independent conversation risk with matrix and history", async () => {
  const { frame } = await dispatch(
    "Non mais stop, tu comprends rien, je te l'ai deja dit, c'est n'importe quoi !!!",
    {
      conversation_risk_history: [4, 7.2],
      active_skill_state: { skill_id: "demotivation_repair" },
      active_tool_skill_intake: { operation_type: "prepare_attack_card" },
    },
  );

  assertEquals(frame.safety.risk_band, "none");
  const risk = frame.conversation_risk!;
  assertEquals(risk.previous_scores, [4, 7.2]);
  assertEquals(risk.should_exit_flows, true);
  assertEquals(risk.threshold, 8);
  assertEquals(
    risk.reason_codes.includes("system_misunderstanding"),
    true,
  );
  assertEquals(
    risk.matrix.some((row) =>
      row.signal === "previous_risk" && row.contribution > 0
    ),
    true,
  );
  assertEquals(risk.flow_exit_context?.interrupted_flow_type, "tool_skill");
  assertEquals(risk.flow_exit_context?.restart_scope, "tool_subskill");
  assertEquals(
    risk.flow_exit_context?.active_tool_skill_type,
    "prepare_attack_card",
  );
  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.flow_opportunity, null);
  assertEquals(frame.skill_signals, {});
});

Deno.test("dispatcher v2 lets previous conversation risk push a brittle turn over exit threshold", async () => {
  const { frame } = await dispatch(
    "Stop, encore une fois, ce n'est pas ce que j'ai dit.",
    {
      conversation_risk_history: [7.1, 7.4],
      active_skill_state: { skill_id: "emotional_repair" },
    },
  );

  const risk = frame.conversation_risk!;
  assertEquals(risk.should_exit_flows, true);
  assertEquals(
    risk.reason_codes.includes("previous_risk"),
    true,
  );
});

Deno.test("dispatcher v2 exits flows when conversation risk reaches threshold 8", async () => {
  const { frame } = await dispatch(
    "Stop, encore une fois, ce n'est pas ce que j'ai dit.",
    {
      conversation_risk_history: [0.9],
    },
  );

  const risk = frame.conversation_risk!;
  assertEquals(risk.score, 8);
  assertEquals(risk.should_exit_flows, true);
});

Deno.test("dispatcher v2 decays previous conversation risk after a calm repair turn", async () => {
  const { frame } = await dispatch("ok merci, on reprend simplement", {
    conversation_risk_history: [10],
  });

  const risk = frame.conversation_risk!;
  const previousRisk = risk.matrix.find((row) =>
    row.signal === "previous_risk"
  );
  assertEquals(previousRisk?.contribution, 4);
  assertEquals(risk.should_exit_flows, false);
});

Deno.test("dispatcher v2 detects shame as emotional repair", async () => {
  const { frame } = await dispatch(
    "j'ai passé deux heures à tourner en rond et je me sens un peu honteux",
  );
  assertEquals(
    frame.skill_signals.entry?.emotional_repair?.detected,
    true,
  );
});

Deno.test("dispatcher v2 preserves heuristic emotional repair when LLM omits it", async () => {
  const { frame } = await dispatch(
    "la je sens la honte monter: c'est ridicule d'etre bloque sur un dossier mutuelle",
    {
      active_skill_state: { skill_id: "demotivation_repair" },
      llm_runner: () => ({
        skill_signals: {
          lifecycle: {
            demotivation_repair: {
              detected: true,
              confidence_band: "high",
              reason: "active_skill_continue",
            },
          },
        },
      }),
    },
  );
  assertEquals(
    frame.skill_signals.entry?.emotional_repair?.detected,
    true,
  );
  assertEquals(
    frame.skill_signals.lifecycle?.demotivation_repair?.detected,
    true,
  );
});

Deno.test("dispatcher v2 detects natural recurring ritual requests", async () => {
  const { frame } = await dispatch(
    "mets-moi un petit rituel quotidien : noter une idée chaque soir vers 21h",
    {
      llm_runner: async () => ({
        tool_skill_intents: [{
          operation_type: "create_recurring_reminder",
          user_intent: "create",
          explicitness: "explicit",
          target_hint: "noter une idée chaque soir vers 21h",
          confidence_band: "high",
          ambiguity: "none",
        }],
      }),
    },
  );
  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(frame.tool_skill_intents[0]?.user_intent, "create");
});

Deno.test("dispatcher v2 detects acute self-attack variants for emotional_repair", async () => {
  const messages = [
    "je me sens encore plus con, meme ca je n'arrive pas a le faire",
    "j'ai l'impression d'etre nul et immature",
    "je me degoute un peu de reagir comme ca",
    "franchement je me sens incapable d'etre fiable",
    "chaque solution prouve juste que je devrais deja savoir faire ca",
    "j'ai rate mon rituel du matin encore une fois et je me parle super mal depuis",
    "dans ma tete ca fait bravo t'es incapable de tenir trois jours",
    "je crois que je suis surtout degoute de moi",
    "non mais ca me confirme que je suis un adulte nul. les autres font ca sans reflechir, moi je bloque sur un bouton.",
    "arrete de me parler comme une incapable, je ne suis pas en manque de consigne.",
  ];
  for (const message of messages) {
    const { frame } = await dispatch(message);
    assertEquals(
      frame.skill_signals.entry?.emotional_repair?.detected,
      true,
      message,
    );
  }
});

Deno.test("dispatcher v2 keeps product questions out of tool skill intents", async () => {
  const messages = [
    "c'est quoi une carte d'attaque dans Sophia ?",
    "dans Sophia, le dashboard sert a quoi exactement quand j'ai deja un plan ?",
    "ok, et si je veux ajuster une action sans tout refaire, je dois passer par quelle partie ?",
  ];
  for (const message of messages) {
    const { frame } = await dispatch(message);
    assertEquals(
      frame.skill_signals.entry?.product_help?.detected,
      true,
      message,
    );
    assertEquals(frame.tool_skill_intents.length, 0, message);
  }
});

Deno.test("active emotional repair stable description keeps ambiguous support out of generic product_help", async () => {
  const { frame } = await dispatch(
    "support dans Sophia pour garder cette douceur",
    {
      active_skill_state: { skill_id: "emotional_repair" },
      llm_runner: async (input: { user_prompt: string }) => {
        const { user_prompt } = input;
        const prompt = JSON.parse(user_prompt);
        assertEquals(
          prompt.active_skill_stable_description.skill_id,
          "emotional_repair",
        );
        return {
          skill_signals: {
            lifecycle: {
              emotional_repair: {
                detected: true,
                confidence_band: "high",
                reason: "active_skill_description_weights_ambiguous_support",
              },
            },
          },
          tool_skill_intents: [],
          flow_opportunity: null,
        };
      },
    },
  );

  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
  assertEquals(frame.skill_signals.lifecycle?.emotional_repair?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("active demotivation repair stable description keeps ambiguous cap support out of generic product_help", async () => {
  const { frame } = await dispatch("support pour garder ce cap clair", {
    active_skill_state: { skill_id: "demotivation_repair" },
    llm_runner: async (input: { user_prompt: string }) => {
      const { user_prompt } = input;
      const prompt = JSON.parse(user_prompt);
      assertEquals(
        prompt.active_skill_stable_description.skill_id,
        "demotivation_repair",
      );
      return {
        skill_signals: {
          lifecycle: {
            demotivation_repair: {
              detected: true,
              confidence_band: "high",
              reason: "active_skill_description_weights_ambiguous_support",
            },
          },
        },
        tool_skill_intents: [],
        flow_opportunity: null,
      };
    },
  });

  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
  assertEquals(
    frame.skill_signals.lifecycle?.demotivation_repair?.detected,
    true,
  );
  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("without active skill potion explanation remains product_help", async () => {
  const { frame } = await dispatch("c'est quoi les potions dans Sophia ?", {
    llm_runner: async (input: { user_prompt: string }) => {
      const { user_prompt } = input;
      const prompt = JSON.parse(user_prompt);
      assertEquals(prompt.active_skill_stable_description, null);
      return {
        skill_signals: {
          entry: {
            product_help: {
              detected: true,
              confidence_band: "high",
              reason: "product_question",
            },
          },
        },
        tool_skill_intents: [],
      };
    },
  });

  assertEquals(frame.skill_signals.entry?.product_help?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("active skill still allows a true app location question to product_help", async () => {
  const { frame } = await dispatch(
    "où est-ce que je trouve les potions dans l'app ?",
    {
      active_skill_state: { skill_id: "emotional_repair" },
      llm_runner: async (input: { user_prompt: string }) => {
        const { user_prompt } = input;
        const prompt = JSON.parse(user_prompt);
        assertEquals(
          prompt.active_skill_stable_description.skill_id,
          "emotional_repair",
        );
        return {
          skill_signals: {
            entry: {
              product_help: {
                detected: true,
                confidence_band: "high",
                reason: "true_app_location_question",
              },
            },
          },
          tool_skill_intents: [],
        };
      },
    },
  );

  assertEquals(frame.skill_signals.entry?.product_help?.detected, true);
  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("safety still preempts active skill stable description", async () => {
  const { frame } = await dispatch(
    "je veux me faire du mal, est-ce qu'il y a un support Sophia ?",
    {
      active_skill_state: { skill_id: "demotivation_repair" },
      llm_runner: async (input: { user_prompt: string }) => {
        const { user_prompt } = input;
        const prompt = JSON.parse(user_prompt);
        assertEquals(
          prompt.active_skill_stable_description.skill_id,
          "demotivation_repair",
        );
        return {
          safety: {
            risk_band: "critical",
            reason_codes: ["self_harm"],
            evidence: ["je veux me faire du mal"],
          },
          skill_signals: {
            entry: {
              product_help: {
                detected: true,
                confidence_band: "high",
                reason: "generic_support_question",
              },
            },
          },
          tool_skill_intents: [{
            operation_type: "select_state_potion",
            user_intent: "select",
            explicitness: "explicit",
            confidence_band: "high",
            ambiguity: "none",
            operation_input: { potion_type: "apaisement" },
          }],
        };
      },
    },
  );

  assertEquals(frame.safety.risk_band, "critical");
  assertEquals(
    frame.skill_signals.entry?.product_help?.detected ?? false,
    false,
  );
  assertEquals(frame.tool_skill_intents.length, 0);
  assertEquals(frame.flow_opportunity, null);
});

Deno.test("dispatcher v2 routes light relationship regret to emotional_repair", async () => {
  const { frame } = await dispatch(
    "Je suis un peu mal depuis ce matin. J ai repondu sechement a quelqu un que j aime, et ca me reste dans la tete.",
  );
  assertEquals(
    frame.skill_signals.entry?.emotional_repair?.detected,
    true,
  );
  assertEquals(
    frame.skill_signals.entry?.emotional_repair?.reason,
    "relationship_regret_or_guilt",
  );
});

Deno.test("dispatcher v2 keeps local tone wording out of coach preference updates", async () => {
  const localDraft = await dispatch(
    "Plus doux, je crois. Donne-moi une version exacte en une ligne pour mon retard.",
  );
  assertEquals(
    localDraft.frame.tool_skill_intents.some((intent) =>
      intent.operation_type === "update_coach_preferences"
    ),
    false,
  );

  const preference = await dispatch("change ton style en plus doux avec moi");
  assertEquals(
    preference.frame.tool_skill_intents[0]?.operation_type,
    "update_coach_preferences",
  );
});

Deno.test("dispatcher v2 hands stabilized concrete asks to attack card", async () => {
  const messages = [
    "ok la phrase m'aide un peu, je peux peut-etre envoyer une ligne simple",
    "plus simple et doux oui, je veux une phrase exacte qui reconnait le tort sans me flageller",
    "pour finir, donne-moi une phrase simple a me dire avant de reprendre l'intro",
    "maintenant je suis devant la page, je vois trois boutons et je ne sais pas lequel prendre",
    "aide-moi a reprendre concretement: je clique ou je cherche quoi en premier ?",
  ];
  for (const message of messages) {
    const { frame } = await dispatch(message, {
      active_skill_state: { skill_id: "emotional_repair" },
    });
    assertEquals(
      frame.tool_skill_intents.some((intent) =>
        intent.operation_type === "prepare_attack_card"
      ) ||
        hasFlowOpportunityFor(frame, "prepare_attack_card"),
      true,
      message,
    );
    assertEquals(
      frame.skill_signals.entry?.emotional_repair?.detected ?? false,
      false,
      message,
    );
  }
});

Deno.test("dispatcher v2 does not keep emotional repair when shame is explicitly cleared", async () => {
  const { frame } = await dispatch(
    "La honte est ok maintenant. Je ne me traite pas de nul. Je suis juste demotive et rince: j'ai l'impression de revenir au meme point chaque semaine.",
    {
      active_skill_state: { skill_id: "emotional_repair" },
    },
  );
  assertEquals(
    frame.skill_signals.entry?.demotivation_repair?.detected,
    true,
  );
  assertEquals(
    frame.skill_signals.entry?.emotional_repair?.detected ?? false,
    false,
  );
});

Deno.test("dispatcher v2 suppresses sticky LLM emotional entry after stabilization", async () => {
  const { frame } = await dispatch(
    "Oui, je vois Ajouter un document. La honte est redescendue, je veux vraiment que tu repasses en mode concret: je clique quoi et je m'arrete ou ?",
    {
      active_skill_state: { skill_id: "emotional_repair" },
      llm_runner: () => ({
        skill_signals: {
          entry: {
            emotional_repair: {
              detected: true,
              confidence_band: "high",
              reason: "sticky_active_skill",
            },
          },
          lifecycle: {
            emotional_repair: {
              detected: true,
              confidence_band: "high",
              reason: "active_skill_continue",
            },
          },
        },
      }),
    },
  );
  assertEquals(
    frame.tool_skill_intents.some((intent) =>
      intent.operation_type === "prepare_attack_card"
    ) ||
      hasFlowOpportunityFor(frame, "prepare_attack_card"),
    true,
  );
  assertEquals(
    frame.skill_signals.entry?.emotional_repair?.detected ?? false,
    false,
  );
});

Deno.test("dispatcher v2 detects confirmation after option prefix", async () => {
  const { frame } = await dispatch(
    "A, tous les jours. Oui, valide-le pour 21h : noter une idée.",
    {
      pending_tool_skill_confirmation: {
        operation_type: "create_recurring_reminder",
      },
    },
  );
  assertEquals(frame.confirmation_response?.kind, "yes");
});

Deno.test("dispatcher v2 supports injectable LLM runner with sanitization", async () => {
  const safety = initialSafetyContext({ channel: "whatsapp" });
  const frame = await runDispatcher({
    user_message: "message neutre",
    recent_messages: [],
    user_id: "u1",
    channel: "whatsapp",
    plan_snapshot: {},
    safety_context_output: { ...safety, risk_band: "medium" },
    llm_runner: async () => ({
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      direct_effects: [],
      tool_skill_intents: [],
      skill_signals: {},
    }),
  });
  assertEquals(frame.safety.risk_band, "medium");
});

Deno.test("dispatcher v2 preserves explicit attack and defense card intents for clarification", async () => {
  const message =
    "J'aimerais créer une carte de défense et une carte d'attaque.";
  const safety = initialSafetyContext({ channel: "web" });
  const frame = await runDispatcher({
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "web",
    plan_snapshot: {},
    safety_context_output: safety,
    llm_runner: async () => ({
      safety: { risk_band: "low", reason_codes: [], evidence: [] },
      direct_effects: [],
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        target_hint: "moment de risque à clarifier",
        confidence_band: "high",
        ambiguity: "target_ambiguous",
        user_intent: "create",
        operation_input: {
          target_hint: "moment de risque à clarifier",
          evidence: ["créer une carte de défense"],
        },
      }, {
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        target_hint: "action à clarifier",
        confidence_band: "high",
        ambiguity: "target_ambiguous",
        user_intent: "create",
        operation_input: {
          target_hint: "action à clarifier",
          evidence: ["créer une carte d'attaque"],
        },
      }],
      flow_opportunity: null,
      skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    }),
  });

  assertEquals(
    frame.tool_skill_intents.map((intent) => intent.operation_type),
    ["prepare_defense_card", "prepare_attack_card"],
  );
});

Deno.test("dispatcher v2 repairs partial composite coverage with LLM, without keyword routing", async () => {
  const message =
    "J'aimerais que tous me rappelle dans 10 minutes de prendr mes médicaments, et là tout de suite j'aimerais qu'on crée une carte d'attaque";
  const safety = initialSafetyContext({ channel: "web" });
  let calls = 0;
  let repairPrompt = "";
  const frame = await runDispatcher({
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "web",
    plan_snapshot: {},
    safety_context_output: safety,
    llm_runner: async (llmInput) => {
      calls += 1;
      if (calls === 1) {
        return {
          safety: { risk_band: "low", reason_codes: [], evidence: [] },
          direct_effects: [{
            effect_type: "create_one_shot_reminder",
            explicitness: "explicit",
            target_status: "identified",
            confidence_band: "high",
            payload_hint: {
              raw_text: "rappelle dans 10 minutes de prendr mes médicaments",
              when_hint: "dans 10 minutes",
              instruction_hint: "prendre mes médicaments",
            },
          }],
          tool_skill_intents: [],
          flow_opportunity: null,
          skill_signals: { entry: {}, lifecycle: {}, exit: {} },
        };
      }
      repairPrompt = llmInput.user_prompt;
      return {
        safety: { risk_band: "low", reason_codes: [], evidence: [] },
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text: "rappelle dans 10 minutes de prendr mes médicaments",
            when_hint: "dans 10 minutes",
            instruction_hint: "prendre mes médicaments",
          },
        }],
        tool_skill_intents: [{
          operation_type: "prepare_attack_card",
          explicitness: "explicit",
          target_hint: "action à clarifier",
          confidence_band: "high",
          ambiguity: "target_ambiguous",
          user_intent: "create",
          evidence: ["crée une carte d'attaque"],
        }],
        flow_opportunity: null,
        skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      };
    },
  });
  assertEquals(calls, 2);
  assertStringIncludes(repairPrompt, "uncovered_after_direct_effect");
  assertStringIncludes(
    repairPrompt,
    "et là tout de suite j'aimerais qu'on crée une carte d'attaque",
  );
  assertEquals(
    frame.direct_effects[0]?.effect_type,
    "create_one_shot_reminder",
  );
  assertEquals(
    frame.tool_skill_intents[0]?.operation_type,
    "prepare_attack_card",
  );
  assertEquals(
    Boolean(frame.tool_skill_intents[0]?.operation_input),
    true,
  );
});

Deno.test("dispatcher v2 does not repair when the direct effect already covers the message", async () => {
  const message = "Rappelle-moi dans 10 minutes de prendre mes médicaments";
  const safety = initialSafetyContext({ channel: "web" });
  let calls = 0;
  const frame = await runDispatcher({
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "web",
    plan_snapshot: {},
    safety_context_output: safety,
    llm_runner: async () => {
      calls += 1;
      return {
        safety: { risk_band: "low", reason_codes: [], evidence: [] },
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text: message,
            when_hint: "dans 10 minutes",
            instruction_hint: "prendre mes médicaments",
          },
        }],
        tool_skill_intents: [],
        flow_opportunity: null,
        skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      };
    },
  });
  assertEquals(calls, 1);
  assertEquals(frame.tool_skill_intents.length, 0);
});

Deno.test("route replay 12 golden fixtures pass with S2 dispatcher and routers", async () => {
  const fixtures = (await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  )).filter((fixture) => /^G\d+$/.test(fixture.fixture_id));
  assertEquals(fixtures.length, 12);
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(results.filter((result) => result.passed).length, 12);
});

Deno.test("route replay passes all 25 fixtures with S2 runtime", async () => {
  const fixtures = (await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures",
  )).filter((fixture) => !fixture.fixture_id.startsWith("W"));
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(results.length, 25);
  assertEquals(results.every((result) => result.passed), true);
});

// ---------------------------------------------------------------------------
// Chantier 3 (2026-05-28): few-shots de migration L3 → L1.
// Vérifie que les 5 cas couverts par les détecteurs transitionnels du fichier
// router/turn_intent_arbitrator.ts sont bien embarqués dans le prompt généré
// par buildDispatcherPrompt, sous la forme attendue.
// ---------------------------------------------------------------------------

Deno.test("dispatcher prompt version reflects active skill stable description contract s26", () => {
  assertEquals(
    DISPATCHER_V2_PROMPT_VERSION,
    "dispatcher_v2_prompt_2026_06_s29_status_recap_entry",
  );
});

Deno.test("dispatcher prompt embeds the 5 L3-migration few-shots in critical_routing_examples", () => {
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message: string;
      expected: {
        note?: string;
      };
    }>;
  };
  const messages = parsed.critical_routing_examples.map((ex) =>
    ex.user_message
  );
  // Few-shot 1: detectsExplicitOneShotReminderCreate
  assertEquals(
    messages.some((m) => m.includes("rappel ponctuel") && m.includes("11h35")),
    true,
    "few-shot create_one_shot_reminder manquant",
  );
  // Few-shot 2: detectsActiveToolCancellation
  assertEquals(
    messages.some((m) =>
      m.includes("pas de carte") && m.includes("Annule ce flow")
    ),
    true,
    "few-shot active_tool_cancellation manquant",
  );
  // Few-shot 3: detectsDurableCoachPreference
  assertEquals(
    messages.some((m) =>
      m.includes("préférence durable") && m.includes("trois lignes")
    ),
    true,
    "few-shot update_coach_preferences manquant",
  );
  assertEquals(
    messages.some((m) =>
      m.includes("limite vraiment les questions") &&
      m.includes("réponds plus directement")
    ),
    true,
    "few-shot update_coach_preferences direct style manquant",
  );
  // Few-shot 4: detectsExplicitProductHelp
  assertEquals(
    messages.some((m) =>
      m.includes("retrouve cette carte d'attaque dans l'app")
    ),
    true,
    "few-shot product_help app_location manquant",
  );
  // Few-shot 5: detectsExactDurableStatus
  assertEquals(
    messages.some((m) =>
      m.includes("Sans rien modifier") &&
      m.includes("vraiment en place")
    ),
    true,
    "few-shot exact_durable_status manquant",
  );
  assertEquals(
    messages.some((m) =>
      m.includes("point factuel") && m.includes("existe vraiment")
    ),
    true,
    "few-shot status_recap point factuel manquant",
  );
  assertEquals(
    messages.some((m) => m.includes("sources de ce point factuel")),
    true,
    "few-shot status_recap sources manquant",
  );
});

Deno.test("C7: dispatcher embeds 3 precision few-shots with the right expected intents", () => {
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: Array<{ effect_type: string }>;
        tool_skill_intents?: Array<{ operation_type: string }>;
      };
    }>;
  };
  const examples = parsed.critical_routing_examples;

  // A4-r6 T5 — "crée le 2e rappel ... même texte" => create_one_shot_reminder,
  // surtout PAS prepare_attack_card.
  const reminder2 = examples.find((ex) =>
    ex.user_message.includes("crée le deuxième rappel") &&
    ex.user_message.includes("11h37")
  );
  if (!reminder2) throw new Error("C7 few-shot 'deuxième rappel' manquant");
  assertEquals(
    reminder2.expected.direct_effects?.[0]?.effect_type,
    "create_one_shot_reminder",
  );
  assertEquals(
    (reminder2.expected.tool_skill_intents ?? []).some((i) =>
      i.operation_type === "prepare_attack_card"
    ),
    false,
    "le 2e rappel ne doit JAMAIS être prepare_attack_card",
  );

  // A4-r6 T10 — "quelle préférence coach est appliquée ?" => status (lecture),
  // PAS update_coach_preferences.
  const statusPref = examples.find((ex) =>
    ex.user_message.includes("quelle préférence coach est appliquée")
  );
  if (!statusPref) {
    throw new Error("C7 few-shot status 'préférence coach' manquant");
  }
  assertEquals((statusPref.expected.tool_skill_intents ?? []).length, 0);
  assertEquals((statusPref.expected.direct_effects ?? []).length, 0);

  // A9-r1 T12 — "ajoute le repère conversationnel" => mémoire personnelle,
  // PAS update_coach_preferences.
  const repere = examples.find((ex) =>
    ex.user_message.includes("repère conversationnel") &&
    ex.user_message.includes("carnet bleu")
  );
  if (!repere) throw new Error("C7 few-shot 'repère conversationnel' manquant");
  assertEquals(
    (repere.expected.tool_skill_intents ?? []).some((i) =>
      i.operation_type === "update_coach_preferences"
    ),
    false,
    "un repère personnel ne doit JAMAIS être update_coach_preferences",
  );
});

Deno.test("dispatcher prompt one_shot_reminder few-shot includes raw_text in payload_hint", () => {
  // Régression A4-r4 T8/T9: sans raw_text, le runtime aval ne créait
  // jamais le rappel. Le few-shot doit montrer payload_hint correctement
  // rempli.
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message: string;
      expected: {
        direct_effects?: Array<{
          effect_type: string;
          payload_hint?: { raw_text?: string };
        }>;
      };
    }>;
  };
  const reminderExample = parsed.critical_routing_examples.find((ex) =>
    ex.user_message.includes("rappel ponctuel")
  );
  if (!reminderExample) throw new Error("few-shot manquant");
  const directEffect = reminderExample.expected.direct_effects?.[0];
  assertEquals(directEffect?.effect_type, "create_one_shot_reminder");
  assertEquals(
    typeof directEffect?.payload_hint?.raw_text,
    "string",
  );
  assertStringIncludes(
    String(directEffect?.payload_hint?.raw_text ?? ""),
    "rappel ponctuel",
  );
});

Deno.test("dispatcher prompt keeps explicit composite reminder plus attack-card intents", () => {
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message?: string;
      expected: {
        direct_effects?: Array<{ effect_type?: string }>;
        tool_skill_intents?: Array<{
          operation_type?: string;
          operation_input?: Record<string, unknown>;
        }>;
        note?: string;
      };
    }>;
  };
  assertStringIncludes(
    promptJson,
    "J'aimerais que tu me rappelles dans 10 minutes de prendre mes médicaments",
  );
  assertStringIncludes(
    DISPATCHER_V2_SYSTEM_PROMPT,
    "rappelle-moi dans 10 minutes de prendre mes medicaments",
  );
  assertStringIncludes(
    DISPATCHER_V2_SYSTEM_PROMPT,
    "tool_skill_intents prepare_attack_card pour la carte",
  );
  assertEquals(
    promptJson.includes(
      "Ne mets PAS tool_skill_intents prepare_attack_card même si le message mentionne une action concrète",
    ),
    false,
  );
  const reminderExample = parsed.critical_routing_examples.find((ex) =>
    String(ex.expected.note ?? "").includes("simple instruction de rappel")
  );
  if (!reminderExample) throw new Error("few-shot rappel ponctuel manquant");
  assertStringIncludes(
    String(reminderExample.expected.note ?? ""),
    "si le même message contient aussi une demande explicite distincte",
  );
  const compositeExample = parsed.critical_routing_examples.find((ex) =>
    String(ex.user_message ?? "").includes("crée une carte d'attaque")
  );
  if (!compositeExample) {
    throw new Error("few-shot composite rappel + carte manquant");
  }
  assertEquals(
    compositeExample.expected.direct_effects?.some((effect) =>
      effect.effect_type === "create_one_shot_reminder"
    ),
    true,
  );
  const attackIntent = compositeExample.expected.tool_skill_intents?.find((
    intent,
  ) => intent.operation_type === "prepare_attack_card");
  assertEquals(Boolean(attackIntent?.operation_input), true);
});

Deno.test("dispatcher prompt keeps attack and defense card pair as two tool intents", () => {
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message?: string;
      expected: {
        tool_skill_intents?: Array<{
          operation_type?: string;
          operation_input?: Record<string, unknown>;
        }>;
      };
    }>;
  };
  const cardPairExample = parsed.critical_routing_examples.find((ex) =>
    String(ex.user_message ?? "").includes("carte de défense") &&
    String(ex.user_message ?? "").includes("carte d'attaque")
  );
  if (!cardPairExample) {
    throw new Error("few-shot carte défense + carte attaque manquant");
  }
  assertEquals(
    cardPairExample.expected.tool_skill_intents?.map((intent) =>
      intent.operation_type
    ),
    ["prepare_defense_card", "prepare_attack_card"],
  );
  assertEquals(
    cardPairExample.expected.tool_skill_intents?.every((intent) =>
      Boolean(intent.operation_input)
    ),
    true,
  );
});

Deno.test("dispatcher prompt cancellation few-shot uses skill_signals_exit, not tool_skill_intents", () => {
  // Garde anti-régression: le user qui dit "pas de carte" ne doit pas
  // produire de tool_skill_intent (ni prepare_attack_card ni autre). Le
  // signal doit être skill_signals_exit pour le tool actif.
  const promptJson = buildDispatcherPrompt({
    user_message: "test",
    recent_messages: [],
    safety_risk_band: "low",
  });
  const parsed = JSON.parse(promptJson) as {
    critical_routing_examples: Array<{
      user_message: string;
      expected: {
        tool_skill_intents?: unknown[];
        skill_signals_exit?: Record<string, unknown>;
      };
    }>;
  };
  const cancelExample = parsed.critical_routing_examples.find((ex) =>
    ex.user_message.includes("Annule ce flow")
  );
  if (!cancelExample) throw new Error("few-shot cancellation manquant");
  assertEquals((cancelExample.expected.tool_skill_intents ?? []).length, 0);
  assertEquals(
    Boolean(cancelExample.expected.skill_signals_exit?.prepare_attack_card),
    true,
  );
});

Deno.test("route replay passes 10 S8 WhatsApp realism fixtures with S2 runtime", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures/whatsapp_realism",
  );
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(results.length, 10);
  assertEquals(results.every((result) => result.passed), true);
});
