import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOneShotReminderAddon,
  isLikelyOneShotReminderRequest,
  parseOneShotReminderRequest,
  runCreateOneShotReminderV2,
  summarizeOneShotReminderOutcome,
} from "./one_shot_reminder_tool.ts";
import type {
  ToolSkillOpportunity,
  TurnFrame,
} from "../../../contracts/turn_frame.v1.ts";

const noToolSkillOpportunity: ToolSkillOpportunity = {
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
};

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-reminder",
    source_message_id: "message-reminder",
    user_id: "user-reminder",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
    tool_skill_intents: [],
    tool_skill_opportunity: noToolSkillOpportunity,
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

Deno.test("parseOneShotReminderRequest parses quarter-hour reminder", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Tu peux m'envoyer un rappel dans un quart d'heure pour me dire de faire mes pompes stp ?",
    timezone: "Europe/Paris",
    nowIso: "2026-03-18T14:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "faire mes pompes");
  assertEquals(parsed.eventContext, "one_shot_reminder:faire_mes_pompes");
  assertEquals(parsed.scheduledFor, "2026-03-18T14:15:00.000Z");
});

Deno.test("parseOneShotReminderRequest parses tomorrow local hour", () => {
  const parsed = parseOneShotReminderRequest({
    message: "Rappelle-moi demain à 8h pour appeler Paul",
    timezone: "Europe/Paris",
    nowIso: "2026-03-18T14:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "appeler Paul");
  assertEquals(parsed.eventContext, "one_shot_reminder:appeler_paul");
  assertEquals(parsed.scheduledFor, "2026-03-19T07:00:00.000Z");
});

Deno.test("parseOneShotReminderRequest preserves colon instruction after programme-moi", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Programme-moi un rappel demain à 8h30: relire une fois, garder le brouillon, sortir trois puces telles quelles.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-20T18:20:11.075Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "relire une fois, garder le brouillon, sortir trois puces telles quelles",
  );
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:relire_une_fois_garder_le_brouillon_sortir_trois_puces_telle",
  );
  assertEquals(parsed.scheduledFor, "2026-05-21T06:30:00.000Z");
});

Deno.test("parseOneShotReminderRequest parses natural one-hour phrasing", () => {
  const parsed = parseOneShotReminderRequest({
    message: "Rappelle-moi dans une heure de fermer la fenetre du salon",
    timezone: "Europe/Paris",
    nowIso: "2026-05-19T12:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "fermer la fenetre du salon");
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:fermer_la_fenetre_du_salon",
  );
  assertEquals(parsed.scheduledFor, "2026-05-19T13:00:00.000Z");
});

Deno.test("parseOneShotReminderRequest parses dis-moi tomorrow reminder", () => {
  const parsed = parseOneShotReminderRequest({
    message: "Dis-moi demain à 6h30 qu'il faut que je me bouge les fesses",
    timezone: "Europe/Paris",
    nowIso: "2026-05-19T12:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "me bouger les fesses");
  assertEquals(parsed.eventContext, "one_shot_reminder:me_bouger_les_fesses");
  assertEquals(parsed.scheduledFor, "2026-05-20T04:30:00.000Z");
});

Deno.test("parseOneShotReminderRequest parses hyphenated summer local hour", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "rappelle-moi demain a 18h de reprendre l'intro pendant 20 minutes",
    timezone: "Europe/Paris",
    nowIso: "2026-05-06T07:19:31.000Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "reprendre l'intro pendant 20 minutes",
  );
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:reprendre_l_intro_pendant_20_minutes",
  );
  assertEquals(parsed.scheduledFor, "2026-05-07T16:00:00.000Z");
});

Deno.test("parseOneShotReminderRequest preserves d-apostrophe target before safety caveat", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "rappelle-moi demain a 9h d'ecrire a une amie, mais si ce n'est pas le bon moment parce que je suis encore secoue, dis-le moi",
    timezone: "Europe/Paris",
    nowIso: "2026-05-06T08:51:39.575Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "ecrire a une amie");
  assertEquals(parsed.eventContext, "one_shot_reminder:ecrire_a_une_amie");
  assertEquals(parsed.scheduledFor, "2026-05-07T07:00:00.000Z");
});

Deno.test("parseOneShotReminderRequest strips side coach preference from reminder text", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Programme juste un rappel demain a 9h pour envoyer les trois premieres lignes, et retiens aussi que je prefere les consignes tres courtes.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-06T08:51:39.575Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "envoyer les trois premieres lignes");
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:envoyer_les_trois_premieres_lignes",
  );
  assertEquals(parsed.scheduledFor, "2026-05-07T07:00:00.000Z");
});

Deno.test("parseOneShotReminderRequest ignores recurring reminder requests", () => {
  const parsed = parseOneShotReminderRequest({
    message: "Rappelle-moi tous les lundis à 8h d'appeler Paul",
    timezone: "Europe/Paris",
    nowIso: "2026-03-18T14:00:00.000Z",
  });

  assertEquals(parsed, null);
});

Deno.test("parseOneShotReminderRequest ignores weekday-list recurring requests", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Rappelle-moi lundi, mercredi et vendredi à 8h10 de faire Respiration 4-7-8",
    timezone: "Europe/Paris",
    nowIso: "2026-03-18T14:00:00.000Z",
  });

  assertEquals(parsed, null);
});

Deno.test("parseOneShotReminderRequest parses bundle phrasing with me faire un rappel", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Okok si tu veux ! Est ce que tu peux me faire un rappel dans 10 minutes de manière à ce que je fasse mes pompes ? :)",
    timezone: "Europe/Paris",
    nowIso: "2026-03-19T11:28:40.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "faire mes pompes");
  assertEquals(parsed.eventContext, "one_shot_reminder:faire_mes_pompes");
  assertEquals(parsed.scheduledFor, "2026-03-19T11:38:40.000Z");
});

Deno.test("isLikelyOneShotReminderRequest stays false for recurring requests", () => {
  assertEquals(
    isLikelyOneShotReminderRequest(
      "Est-ce que tu peux me faire un rappel tous les lundis à 8h pour appeler Paul ?",
    ),
    false,
  );
  assertEquals(
    isLikelyOneShotReminderRequest(
      "Rappelle-moi les jours de semaine à 12h30 de respirer deux minutes.",
    ),
    false,
  );
});

Deno.test("isLikelyOneShotReminderRequest matches natural me faire un rappel phrasing", () => {
  assertEquals(
    isLikelyOneShotReminderRequest(
      "Okok si tu veux ! Est ce que tu peux me faire un rappel dans 10 minutes de manière à ce que je fasse mes pompes ? :)",
    ),
    true,
  );
  assertEquals(
    isLikelyOneShotReminderRequest(
      "Programme-moi un rappel demain à 8h30: relire une fois le brouillon.",
    ),
    true,
  );
});

Deno.test("one-shot reminder addon forbids timezone confirmation after success", () => {
  const addon = buildOneShotReminderAddon({
    detected: true,
    status: "success",
    inserted_checkin_id: "checkin-1",
    scheduled_for_local_label: "jeudi 21 mai à 08:30",
    reminder_instruction: "relire le brouillon",
    parse_source: "strict_absolute",
  } as any);
  assertEquals(addon.includes("Ne demande pas au user de confirmer le fuseau"), true);
});

Deno.test("isLikelyOneShotReminderRequest ignores memory recall phrasing", () => {
  assertEquals(
    isLikelyOneShotReminderRequest(
      "Pour mon action Faire 12 pompes, rappelle-moi ce qui m'aide concretement.",
    ),
    false,
  );
  assertEquals(
    isLikelyOneShotReminderRequest(
      "Rappelle-moi ce que tu sais sur mes etirements.",
    ),
    false,
  );
});

Deno.test("parseOneShotReminderRequest survives burst-merged recurring context", () => {
  const mergedMessage = [
    "Je veux créer une action récurrente : marcher 10 minutes tous les jours à 18h.",
    "Sophia: tu préfères tous les jours ou jours ouvrés ?",
    "Tu peux me faire un rappel demain à 9h pour relire mon plan ?",
  ].join("\n");

  assertEquals(isLikelyOneShotReminderRequest(mergedMessage), true);
  const parsed = parseOneShotReminderRequest({
    message: mergedMessage,
    timezone: "Europe/Paris",
    nowIso: "2026-05-05T12:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "relire mon plan");
  assertEquals(parsed.eventContext, "one_shot_reminder:relire_mon_plan");
  assertEquals(parsed.scheduledFor, "2026-05-06T07:00:00.000Z");
});

Deno.test("create_one_shot_reminder v2 covers success, needs_clarify and blocked cases", async () => {
  const writes: unknown[] = [];
  const base = {
    message: "Rappelle-moi dans 30 minutes de faire une pause",
    timezone: "Europe/Paris",
    locale: "fr-FR",
    nowIso: "2026-03-18T14:00:00.000Z",
    write_reminder: async (input: unknown) => {
      writes.push(input);
      return { inserted_checkin_id: `checkin-${writes.length}` };
    },
  };
  const cases = [
    {
      name: "success-from-message",
      turn_frame: frame(),
      expected: "success",
    },
    {
      name: "success-from-payload",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            scheduled_for: "2026-03-18T15:00:00.000Z",
            reminder_instruction: "respirer",
            event_context: "one_shot_reminder:respirer",
          },
        }],
      }),
      message: "rappel",
      expected: "success",
    },
    {
      name: "missing-time",
      turn_frame: frame(),
      message: "Rappelle-moi de faire une pause",
      expected: "needs_clarify",
    },
    {
      name: "past-time",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            scheduled_for: "2026-03-18T14:00:10.000Z",
            reminder_instruction: "respirer",
          },
        }],
      }),
      message: "rappel",
      expected: "needs_clarify",
    },
    {
      name: "safety-medium",
      turn_frame: frame({
        safety: { risk_band: "medium", reason_codes: [], evidence: [] },
      }),
      expected: "blocked",
    },
    {
      name: "safety-high",
      turn_frame: frame({
        safety: { risk_band: "high", reason_codes: [], evidence: [] },
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
      name: "pending-confirmation",
      turn_frame: frame(),
      pending_tool_skill_confirmation: { id: "pending" },
      expected: "blocked",
    },
    {
      name: "duplicate-runtime",
      turn_frame: frame(),
      recent_writes_idempotency: { source_message_ids: ["message-reminder"] },
      expected: "blocked",
    },
    {
      name: "duplicate-db",
      turn_frame: frame(),
      db_idempotency_check: async () => true,
      expected: "blocked",
    },
    {
      name: "weak-intent",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "weak",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "ambiguous-target",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "ambiguous",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "missing-target",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "missing",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "medium-confidence",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "medium",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "no-signal-no-fallback",
      turn_frame: frame({ direct_effects: [] }),
      message: "bonjour",
      expected: "none",
    },
  ];
  assertEquals(cases.length, 15);
  for (const testCase of cases) {
    const outcome = await runCreateOneShotReminderV2({
      ...base,
      message: testCase.message ?? base.message,
      turn_frame: testCase.turn_frame,
      pending_tool_skill_confirmation: testCase.pending_tool_skill_confirmation,
      recent_writes_idempotency: testCase.recent_writes_idempotency,
      db_idempotency_check: testCase.db_idempotency_check,
    });
    assertEquals(
      outcome.detected ? outcome.status : "none",
      testCase.expected,
      testCase.name,
    );
  }
});

Deno.test("one_shot reminder summary does not mark clarify as executed", () => {
  assertEquals(
    summarizeOneShotReminderOutcome({
      detected: true,
      status: "needs_clarify",
      reason: "missing_time",
    } as any),
    { executedTools: [], toolExecution: "blocked" },
  );
});
