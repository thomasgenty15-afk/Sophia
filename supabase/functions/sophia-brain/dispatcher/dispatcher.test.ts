import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runSafetyPregate } from "../safety/safety_pregate.ts";
import {
  loadReplayFixtures,
  runReplayFixtures,
} from "../test_harness/conversation_route_replay/runner.ts";
import { DISPATCHER_V2_PROMPT_VERSION } from "./dispatcher.prompts.ts";
import { type DispatcherRunStats, runDispatcher } from "./dispatcher.v2.ts";

async function dispatch(message: string, extra: Record<string, unknown> = {}) {
  const safety = runSafetyPregate({
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "whatsapp",
  });
  const stats: DispatcherRunStats[] = [];
  const frame = await runDispatcher({
    user_message: message,
    recent_messages: [],
    user_id: "u1",
    channel: "whatsapp",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    safety_pregate_output: safety,
    source_message_id: "m1",
    turn_id: "t1",
    on_stats: (entry) => stats.push(entry),
    ...extra,
  });
  return { frame, stats };
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
    assertEquals(typeof frame.tool_skill_opportunity.type, "string", message);
    assertEquals(frame.tool_skill_opportunity.must_not_execute, true, message);
    assertEquals(typeof frame.memory_plan.memory_mode, "string", message);
    assertEquals(stats.length, 1, message);
    assertEquals(stats[0].prompt_version, DISPATCHER_V2_PROMPT_VERSION);
  }
});

Deno.test("dispatcher v2 never lowers safety pregate risk", async () => {
  const { frame } = await dispatch("je veux me faire du mal ce soir");
  assertEquals(frame.safety.risk_band, "critical");
});

Deno.test("dispatcher v2 computes independent conversation risk with matrix and history", async () => {
  const { frame } = await dispatch(
    "Non mais stop, tu comprends rien, je te l'ai deja dit, c'est n'importe quoi !!!",
    {
      conversation_risk_history: [4, 7.2],
      active_skill_state: { skill_id: "execution_breakdown" },
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
  assertEquals(frame.tool_skill_opportunity.type, "none");
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
      active_skill_state: { skill_id: "execution_breakdown" },
      llm_runner: () => ({
        skill_signals: {
          lifecycle: {
            execution_breakdown: {
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
    frame.skill_signals.lifecycle?.execution_breakdown?.detected,
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

Deno.test("dispatcher v2 hands stabilized concrete asks to execution_breakdown", async () => {
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
      frame.skill_signals.entry?.execution_breakdown?.detected,
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
    frame.skill_signals.entry?.execution_breakdown?.detected,
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
  const safety = runSafetyPregate({
    user_message: "message neutre",
    recent_messages: [],
    user_id: "u1",
    channel: "whatsapp",
  });
  const frame = await runDispatcher({
    user_message: "message neutre",
    recent_messages: [],
    user_id: "u1",
    channel: "whatsapp",
    plan_snapshot: {},
    safety_pregate_output: { ...safety, risk_band: "medium" },
    llm_runner: async () => ({
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      direct_effects: [],
      tool_skill_intents: [],
      skill_signals: {},
    }),
  });
  assertEquals(frame.safety.risk_band, "medium");
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

Deno.test("route replay passes 10 S8 WhatsApp realism fixtures with S2 runtime", async () => {
  const fixtures = await loadReplayFixtures(
    "supabase/functions/sophia-brain/test_harness/conversation_route_replay/fixtures/whatsapp_realism",
  );
  const results = await runReplayFixtures(fixtures, { mode: "s2" });
  assertEquals(results.length, 10);
  assertEquals(results.every((result) => result.passed), true);
});
