import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectsReminderAnaphora,
  extractQuotedReminderInstruction,
  extractReminderInstruction,
  isDegenerateReminderInstruction,
  loadLastReminderInstructionForUser,
} from "./instruction_parser.ts";
import {
  maybeCancelOneShotReminder,
  maybeCreateOneShotReminder,
  runCreateOneShotReminderV2,
} from "./executor.ts";
import {
  parseOneShotReminderRequest,
  parseReminderFromMessageDeterministic,
  parseScheduledForFromMessage,
} from "./time_parser.ts";
import {
  buildOneShotReminderAddon,
  summarizeOneShotReminderOutcome,
} from "./renderer.ts";
import {
  classifyOneShotReminderDirectIntent,
  localTextAddonForOneShotReminder,
  maybeRunOneShotReminderDirectEffect,
} from "./router.ts";
import { buildOneShotReminderIntake } from "./intake.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";

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

function frameWithDirectEffects(effectTypes: string[]): TurnFrame {
  return frame({
    direct_effects: effectTypes.map((effectType) => ({
      effect_type: effectType as any,
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    })),
  });
}

function frameWithStructuredCreate(payload: Record<string, unknown> = {}) {
  return frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        raw_text: "rappelle-moi demain à 9h. Texte exact : relire X",
        when_hint: "demain à 9h",
        UTC_time: "2026-05-30T07:00:00.000Z",
        local_label: "09:00",
        instruction_hint: "relire X",
        ...payload,
      },
    }],
  });
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

Deno.test("parseOneShotReminderRequest parses explicit new reminder with bare local time", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Oui, crée un nouveau rappel à 11h25 avec le même texte, et garde l'ancien actif.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-28T08:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.scheduledFor, "2026-05-28T09:25:00.000Z");
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

Deno.test("QA R1: parses explicit tomorrow HH:mm one-shot reminder", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Peux-tu me rappeler demain à 8h40 de sortir le tapis et faire le sas de décompression sans fumer ?",
    timezone: "Europe/Paris",
    nowIso: "2026-06-11T19:25:00.000Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "sortir le tapis et faire le sas de décompression sans fumer",
  );
  assertEquals(parsed.scheduledFor, "2026-06-12T06:40:00.000Z");
});

Deno.test("QA R1: parses absolute French date with Paris timezone", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Vendredi 12 juin 2026 à 08:40, rappelle-moi de sortir le tapis et faire le sas de décompression sans fumer.",
    timezone: "Europe/Paris",
    nowIso: "2026-06-11T19:27:00.000Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "sortir le tapis et faire le sas de décompression sans fumer",
  );
  assertEquals(parsed.scheduledFor, "2026-06-12T06:40:00.000Z");
});

Deno.test("QA R1: parses absolute French date even when instruction is contextual", () => {
  const scheduledFor = parseScheduledForFromMessage({
    message:
      "Demain vendredi 12 juin 2026 à 08:40, heure de Paris. Tu peux le programmer.",
    timezone: "Europe/Paris",
    nowIso: "2026-06-11T19:27:00.000Z",
  });

  assertEquals(scheduledFor, "2026-06-12T06:40:00.000Z");
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

Deno.test("extractReminderInstruction strips unquoted exact-text meta command", () => {
  assertEquals(
    extractReminderInstruction(
      "choisis 16h05. Texte exact : relis le brief avant l'appel",
    ),
    "relis le brief avant l'appel",
  );
  assertEquals(
    extractReminderInstruction(
      "rappelle-moi à 16h05 de relire X",
    ),
    "relire X",
  );
  assertEquals(
    extractReminderInstruction(
      "rappelle-moi demain à 9h : appeler Paul",
    ),
    "appeler Paul",
  );
});

Deno.test("I2: parseOneShotReminderRequest strips unquoted Texte exact meta-command after earlier colon", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Ignore la carte. Je parle d'un rappel ponctuel : choisis 16h05. Texte exact : relire l'ancre 'phrase imparfaite = brouillon ouvert'.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-29T08:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "relire l'ancre 'phrase imparfaite = brouillon ouvert'",
  );
  assertEquals(parsed.scheduledFor, "2026-05-29T14:05:00.000Z");
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

Deno.test("parseOneShotReminderRequest isolates reminder instruction before explicit next intent", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "J'aimerais que tu me rappelles dans 10 minutes de prendre mes médicaments, et là tout de suite j'aimerais qu'on crée une carte d'attaque",
    timezone: "Europe/Paris",
    nowIso: "2026-06-03T13:18:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "prendre mes médicaments");
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:prendre_mes_medicaments",
  );
  assertEquals(parsed.scheduledFor, "2026-06-03T13:28:00.000Z");
});

Deno.test("parseOneShotReminderRequest isolates reminder before puis juste apres continuation", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Mets-moi un rappel dans 10 minutes pour boire mon traitement, puis juste après je veux préparer une carte d'attaque pour mon action.",
    timezone: "Europe/Paris",
    nowIso: "2026-06-03T13:18:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "boire mon traitement");
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:boire_mon_traitement",
  );
  assertEquals(parsed.scheduledFor, "2026-06-03T13:28:00.000Z");
});

Deno.test("QA R1: parseOneShotReminderRequest keeps second topic out of reminder payload", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Ajoute un autre rappel dans 40 minutes pour relire mes notes sur ce dossier, et après ça j'aimerais comprendre pourquoi je me crispe dès que j'y pense.",
    timezone: "Europe/Paris",
    nowIso: "2026-06-13T08:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "relire mes notes sur ce dossier");
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:relire_mes_notes_sur_ce_dossier",
  );
  assertEquals(parsed.scheduledFor, "2026-06-13T08:40:00.000Z");
});

Deno.test("QA R1: parseOneShotReminderRequest preserves full emotional regulation instruction", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Je suis un peu tendu là. Rappelle-moi dans 20 minutes de respirer doucement et de boire un verre d'eau.",
    timezone: "Europe/Paris",
    nowIso: "2026-06-13T08:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "respirer doucement et boire un verre d'eau",
  );
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:respirer_doucement_et_boire_un_verre_d_eau",
  );
  assertEquals(parsed.scheduledFor, "2026-06-13T08:20:00.000Z");
});

Deno.test("QA R1: parseOneShotReminderRequest strips consumed correction time from instruction", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "D'accord. Pour vérifier le fichier, mets-le plutôt dans 30 minutes.",
    timezone: "Europe/Paris",
    nowIso: "2026-06-13T08:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "vérifier le fichier");
  assertEquals(parsed.eventContext, "one_shot_reminder:verifier_le_fichier");
  assertEquals(parsed.scheduledFor, "2026-06-13T08:30:00.000Z");
});

Deno.test("parseOneShotReminderRequest keeps attack verb when it belongs to reminder payload", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Rappelle-moi dans 10 minutes d'attaquer la pile de papiers administratifs.",
    timezone: "Europe/Paris",
    nowIso: "2026-06-03T13:18:00.000Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "attaquer la pile de papiers administratifs",
  );
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:attaquer_la_pile_de_papiers_administratifs",
  );
  assertEquals(parsed.scheduledFor, "2026-06-03T13:28:00.000Z");
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
  assertEquals(
    parsed.reminderInstruction,
    "envoyer les trois premieres lignes",
  );
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:envoyer_les_trois_premieres_lignes",
  );
  assertEquals(parsed.scheduledFor, "2026-05-07T07:00:00.000Z");
});

// CHANTIER D3 (2026-05-28) — Exclure une clause de gestion d'un AUTRE rappel
// du texte extrait. Anti-FP AVANT le test positif. Voir A4-r7 T6.
Deno.test("D3 anti-FP: une instruction qui contient juste 'actif' n'est PAS amputée", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Programme un rappel aujourd'hui a 14h20: rester actif sur le dossier Sam.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-28T08:00:00.000Z",
  });
  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "rester actif sur le dossier Sam");
});

Deno.test("D3: strips a trailing management clause about another reminder (A4-r7 T6)", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Programme le second rappel ponctuel aujourd'hui a 11h39: envoyer a Sam la fiche relue avec les deux captures rangees. Celui de 11h24 doit rester actif.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-28T08:00:00.000Z",
  });
  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "envoyer a Sam la fiche relue avec les deux captures rangees",
  );
  assertEquals(
    parsed.reminderInstruction.includes("actif"),
    false,
    "la clause de gestion ne doit pas polluer le texte du rappel",
  );
});

Deno.test("D3: strips 'garde celui de X actif' trailing clause", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Programme un rappel aujourd'hui a 11h39: envoyer la fiche a Sam, et garde celui de 11h24 actif.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-28T08:00:00.000Z",
  });
  assertExists(parsed);
  assertEquals(parsed.reminderInstruction, "envoyer la fiche a Sam");
});

Deno.test("parseOneShotReminderRequest parses today HHhMM with client now", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Programme-moi un rappel aujourd'hui a 14h20: verifier si Lea a repondu, sans rouvrir tout le dossier.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-28T08:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "verifier si Lea a repondu, sans rouvrir tout le dossier",
  );
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:verifier_si_lea_a_repondu_sans_rouvrir_tout_le_dossier",
  );
  assertEquals(parsed.scheduledFor, "2026-05-28T12:20:00.000Z");
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

Deno.test("one-shot reminder parser strips single quote delimiters after colon", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Crée-moi un rappel ponctuel dans 25 minutes : 'relire seulement la première page du rapport'.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-22T08:00:00.000Z",
  });

  assertExists(parsed);
  assertEquals(
    parsed.reminderInstruction,
    "relire seulement la première page du rapport",
  );
  assertEquals(
    parsed.eventContext,
    "one_shot_reminder:relire_seulement_la_premiere_page_du_rapport",
  );
});

Deno.test("one-shot reminder cleanup preserves internal apostrophes", () => {
  const instruction = extractReminderInstruction(
    "Rappelle-moi dans 20 minutes : vérifier l'objectif du jour.",
  );

  assertEquals(instruction, "vérifier l'objectif du jour");
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
  assertEquals(
    addon.includes("Ne demande pas au user de confirmer le fuseau"),
    true,
  );
  assertEquals(
    addon.includes("Blend cette confirmation dans le message"),
    true,
  );
  assertEquals(
    addon.includes(
      "évite les formulations rigides comme 'je te rappellerai de ouvrir'",
    ),
    true,
  );
});

Deno.test("parseOneShotReminderRequest survives burst-merged recurring context", () => {
  const mergedMessage = [
    "Je veux créer une action récurrente : marcher 10 minutes tous les jours à 18h.",
    "Sophia: tu préfères tous les jours ou jours ouvrés ?",
    "Tu peux me faire un rappel demain à 9h pour relire mon plan ?",
  ].join("\n");

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
      expected: "needs_clarify",
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
      expected: "needs_clarify",
    },
    {
      name: "safety-high",
      turn_frame: frame({
        safety: { risk_band: "high", reason_codes: [], evidence: [] },
      }),
      expected: "needs_clarify",
    },
    {
      name: "safety-critical",
      turn_frame: frame({
        safety: { risk_band: "critical", reason_codes: [], evidence: [] },
      }),
      expected: "needs_clarify",
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
  assertEquals(cases.length, 14);
  for (const testCase of cases) {
    const outcome = await runCreateOneShotReminderV2({
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

// ===========================================================================
// Chantier 7 (2026-05-28) — Résolution d'anaphore. Voir A4-r5 T7.
// ===========================================================================

Deno.test("detectsReminderAnaphora matches typical anaphoric expressions", () => {
  const positives = [
    "tu mets le même rappel à 10h22 ?",
    "remets le meme rappel demain",
    "même texte mais à 11h",
    "même note pour 14h",
    "tu programmes ce rappel à 9h",
    "comme tout à l'heure mais à 18h",
    "comme avant à 8h",
    "pareil que tout à l'heure à 12h",
    "fais-moi le même à 15h",
  ];
  for (const msg of positives) {
    assertEquals(detectsReminderAnaphora(msg), true, msg);
  }
});

Deno.test("detectsReminderAnaphora does NOT trigger on explicit instructions", () => {
  const negatives = [
    "rappelle-moi de payer la facture demain à 9h",
    "programme un rappel pour envoyer le PDF à Mina à 11h",
    "tu m'envoies une note à 14h pour appeler le dentiste",
    "rappelle-moi à 10h22",
  ];
  for (const msg of negatives) {
    assertEquals(detectsReminderAnaphora(msg), false, msg);
  }
});

function makeFakeSupabaseForReminders(rows: any[]) {
  return {
    from(_table: string) {
      const builder: any = {
        select(_cols: string) {
          return this;
        },
        eq(_col: string, _val: unknown) {
          return this;
        },
        order(_col: string, _opts?: any) {
          return this;
        },
        limit(_n: number) {
          return this;
        },
        then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
        },
      };
      return builder;
    },
  } as any;
}

Deno.test("loadLastReminderInstructionForUser returns last non-generic instruction", async () => {
  const supabase = makeFakeSupabaseForReminders([
    {
      created_at: "2026-05-28T10:00:00Z",
      message_payload: {
        reminder_instruction: "envoyer à Mina la note finie avec le PDF rangé",
      },
    },
    {
      created_at: "2026-05-27T10:00:00Z",
      message_payload: { reminder_instruction: "ce que tu as prévu" },
    },
  ]);
  const out = await loadLastReminderInstructionForUser(supabase, "u1");
  assertEquals(out, "envoyer à Mina la note finie avec le PDF rangé");
});

Deno.test("loadLastReminderInstructionForUser skips generic 'ce que tu as prévu' to find a real one", async () => {
  const supabase = makeFakeSupabaseForReminders([
    {
      created_at: "2026-05-28T10:00:00Z",
      message_payload: { reminder_instruction: "ce que tu as prévu" },
    },
    {
      created_at: "2026-05-27T10:00:00Z",
      message_payload: { reminder_instruction: "appeler le dentiste" },
    },
  ]);
  const out = await loadLastReminderInstructionForUser(supabase, "u1");
  assertEquals(out, "appeler le dentiste");
});

Deno.test("loadLastReminderInstructionForUser returns null on empty result", async () => {
  const supabase = makeFakeSupabaseForReminders([]);
  const out = await loadLastReminderInstructionForUser(supabase, "u1");
  assertEquals(out, null);
});

// ===========================================================================
// Chantier 13 (2026-05-28) — extractQuotedReminderInstruction. Voir A4-r6 T7.
// ===========================================================================

Deno.test("extractQuotedReminderInstruction prefers content quoted after 'texte exact' (A4-r6 T7)", () => {
  const msg =
    "rappel ponctuel aujourd'hui à 11h37, texte exact 'envoyer à Noa la page corrigée avec les trois fichiers classés'";
  assertEquals(
    extractQuotedReminderInstruction(msg),
    "envoyer à Noa la page corrigée avec les trois fichiers classés",
  );
});

Deno.test("extractQuotedReminderInstruction handles double quotes", () => {
  const msg =
    'programme un rappel à 14h, texte exact "appeler le dentiste demain"';
  assertEquals(
    extractQuotedReminderInstruction(msg),
    "appeler le dentiste demain",
  );
});

Deno.test("extractQuotedReminderInstruction handles 'instruction:' framing", () => {
  const msg = "rappel à 9h, instruction: 'arroser les plantes'";
  assertEquals(
    extractQuotedReminderInstruction(msg),
    "arroser les plantes",
  );
});

Deno.test("extractQuotedReminderInstruction returns empty when no quotes present", () => {
  const msg = "rappelle-moi de payer la facture demain à 9h";
  assertEquals(extractQuotedReminderInstruction(msg), "");
});

// ===========================================================================
// Chantier 18 (2026-05-28) — extractReminderInstruction priorise "pour X"
// sur "de X". Voir A3-r7 T2.
// ===========================================================================

Deno.test("parseOneShotReminderRequest captures full 'pour relire X avant de Y' (A3-r7 T2)", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "Mets-moi un rappel demain à 9h05 pour relire ce mail client avant de l'envoyer",
    timezone: "Europe/Paris",
    nowIso: "2026-05-27T15:00:00.000Z",
  });
  if (!parsed) throw new Error("expected parsed");
  // Avant chantier 18, l'extracteur retournait "l envoyer" (le trailing
  // "de" gagnait sur "pour"). Maintenant on capture la phrase complète.
  assertEquals(
    parsed.reminderInstruction.includes("relire"),
    true,
    `got: ${parsed.reminderInstruction}`,
  );
  assertEquals(
    parsed.reminderInstruction.includes("envoyer"),
    true,
    `got: ${parsed.reminderInstruction}`,
  );
});

Deno.test("parseOneShotReminderRequest still parses simple 'de X' phrasing", () => {
  // Anti-régression: si pas de "pour", on doit toujours capturer "de X".
  const parsed = parseOneShotReminderRequest({
    message: "rappelle-moi de payer la facture demain à 9h",
    timezone: "Europe/Paris",
    nowIso: "2026-05-27T15:00:00.000Z",
  });
  if (!parsed) throw new Error("expected parsed");
  assertEquals(
    parsed.reminderInstruction.includes("payer la facture"),
    true,
    `got: ${parsed.reminderInstruction}`,
  );
});

Deno.test("parseOneShotReminderRequest uses quoted content over greedy parse (A4-r6 T7)", () => {
  const parsed = parseOneShotReminderRequest({
    message:
      "rappel ponctuel aujourd'hui à 11h37, texte exact 'envoyer à Noa la page corrigée avec les trois fichiers classés'",
    timezone: "Europe/Paris",
    nowIso: "2026-05-28T08:00:00.000Z",
  });
  if (!parsed) throw new Error("expected parsed");
  assertEquals(
    parsed.reminderInstruction,
    "envoyer à Noa la page corrigée avec les trois fichiers classés",
  );
});

Deno.test("loadLastReminderInstructionForUser strips Rappel-ponctuel-prefix from instruction column", async () => {
  const supabase = makeFakeSupabaseForReminders([
    {
      created_at: "2026-05-28T10:00:00Z",
      message_payload: {
        instruction:
          "Rappel ponctuel demandé explicitement par l'utilisateur. Rappelle-lui de envoyer le PDF à Mina.",
      },
    },
  ]);
  const out = await loadLastReminderInstructionForUser(supabase, "u1");
  assertEquals(out, "envoyer le PDF à Mina");
});

// ===========================================================================
// CHANTIER E5 (2026-05-28) — Le créneau du tour précédent est récupéré quand
// le user confirme "rappel unique" sans redonner l'heure. Voir A11 T2/T3.
// ===========================================================================

Deno.test("E5: le créneau '16h40' donné au tour précédent est récupérable (A11 T2)", () => {
  // Message du tour précédent (T2) qui portait l'heure + le texte.
  const recovered = parseReminderFromMessageDeterministic({
    message:
      "Ok pour le rappel: programme-le aujourd'hui à 16h40 avec le texte 'reprendre le devis sans rouvrir toute la réunion'.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-28T08:00:00.000Z",
  });
  if (!recovered) throw new Error("expected recovered slot");
  // 16h40 Europe/Paris = 14:40 UTC.
  assertEquals(recovered.scheduledFor, "2026-05-28T14:40:00.000Z");
  assertEquals(
    recovered.reminderInstruction.includes("reprendre le devis"),
    true,
    `got: ${recovered.reminderInstruction}`,
  );
});

Deno.test("E5: la confirmation seule ('oui, unique') ne porte pas de créneau", () => {
  // Le message de confirmation ne doit PAS produire de slot à lui seul: c'est
  // exactement pourquoi la récupération depuis le tour précédent est requise.
  const fromConfirmation = parseReminderFromMessageDeterministic({
    message: "Oui, rappel unique, une seule fois aujourd'hui.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-28T08:00:00.000Z",
  });
  assertEquals(fromConfirmation, null);
});

// ===========================================================================
// CHANTIER F3 (2026-05-29) — Ordre d'exécution multi-tour. "programme-le
// maintenant" (sans heure dans le message) doit pouvoir exécuter en
// récupérant le créneau du contexte, au lieu de reboucler. Voir
// edgecases-r2 T9.
// ===========================================================================

Deno.test("F3: le créneau (15h30 + texte) donné au tour précédent reste récupérable (edgecases-r2 T8)", () => {
  const recovered = parseReminderFromMessageDeterministic({
    message:
      "Moment exact : aujourd'hui a 15h30. Texte exact : relire l'objectif du point client.",
    timezone: "Europe/Paris",
    nowIso: "2026-05-29T08:00:00.000Z",
  });
  if (!recovered) throw new Error("expected recovered slot");
  // 15h30 Europe/Paris = 13:30 UTC.
  assertEquals(recovered.scheduledFor, "2026-05-29T13:30:00.000Z");
  assertEquals(
    recovered.reminderInstruction.includes("relire l'objectif du point client"),
    true,
    `got: ${recovered.reminderInstruction}`,
  );
});

// ===========================================================================
// CHANTIER G2 (2026-05-29) — Préservation de l'instruction du tour précédent
// quand la confirmation ne porte que l'heure/le style. Voir edgecases-r3 T7.
// ===========================================================================

Deno.test("G2: une instruction qui n'est que de l'horaire/du style est dégénérée", () => {
  assertEquals(
    isDegenerateReminderInstruction("aujourd'hui à 16h10"),
    true,
  );
  assertEquals(isDegenerateReminderInstruction("14h20 ou 16h10"), true);
  assertEquals(isDegenerateReminderInstruction("rappel neutre"), true);
  assertEquals(isDegenerateReminderInstruction("à 16h10"), true);
  assertEquals(isDegenerateReminderInstruction(""), true);
  assertEquals(
    isDegenerateReminderInstruction("ce que tu as prévu"),
    true,
  );
});

Deno.test("G2: une vraie instruction n'est PAS dégénérée", () => {
  assertEquals(
    isDegenerateReminderInstruction("vérifier les 5 lignes du devis"),
    false,
  );
  assertEquals(
    isDegenerateReminderInstruction("appeler le dentiste"),
    false,
  );
});

Deno.test("G2: le message de confirmation T7 produit une instruction dégénérée (à récupérer)", () => {
  // T7: "Rappel neutre. Programme-le maintenant pour aujourd'hui à 16h10."
  const t7Instruction = extractReminderInstruction(
    "Rappel neutre. Programme-le maintenant pour aujourd'hui à 16h10.",
  );
  assertEquals(isDegenerateReminderInstruction(t7Instruction), true);
});

Deno.test("G2: le texte exact donné en T6 est récupérable et non dégénéré", () => {
  // T6: "Je choisis 16h10. Le texte exact du rappel : vérifier les 5 lignes du devis."
  const t6Instruction = extractReminderInstruction(
    "Je choisis 16h10. Le texte exact du rappel : vérifier les 5 lignes du devis.",
  );
  assertEquals(
    t6Instruction.includes("vérifier les 5 lignes du devis"),
    true,
    `got: ${t6Instruction}`,
  );
  assertEquals(isDegenerateReminderInstruction(t6Instruction), false);
});

function makeFakeSupabaseForCreate(opts: {
  profile?: { timezone?: string; locale?: string } | null;
  onUpsert?: (row: any) => void;
  pendingRows?: Array<{
    id: string;
    scheduled_for: string;
    message_payload?: Record<string, unknown>;
  }>;
}) {
  return {
    from(table: string) {
      if (table === "profiles") {
        const chain: any = {
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          maybeSingle() {
            return Promise.resolve({ data: opts.profile ?? null, error: null });
          },
        };
        return chain;
      }
      if (table === "scheduled_checkins") {
        const state: { row: any } = { row: null };
        const filters: Array<{ col: string; val: unknown }> = [];
        const chain: any = {
          upsert(row: any) {
            state.row = row;
            opts.onUpsert?.(row);
            return chain;
          },
          select() {
            return chain;
          },
          eq(col: string, val: unknown) {
            filters.push({ col, val });
            return chain;
          },
          like() {
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          // Awaité directement par readPendingOneShotReminderRows.
          then(resolve: any, reject: any) {
            return Promise.resolve({
              data: opts.pendingRows ?? [],
              error: null,
            }).then(resolve, reject);
          },
          // Chemin idempotent de createReminderFromEffect: lookup par
          // message_payload->>source_message_id.
          maybeSingle() {
            const sourceFilter = filters.find((f) =>
              f.col === "message_payload->>source_message_id"
            );
            const match = (opts.pendingRows ?? []).find((row) =>
              String(row.message_payload?.source_message_id ?? "") ===
                String(sourceFilter?.val ?? " ")
            );
            return Promise.resolve({ data: match ?? null, error: null });
          },
          single() {
            return Promise.resolve({
              data: {
                id: "checkin-qa-r1",
                scheduled_for: state.row?.scheduled_for,
                event_context: state.row?.event_context,
              },
              error: null,
            });
          },
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

Deno.test("QA R1: create runner does not parse context when payload is missing", async () => {
  let written: any = null;
  const supabase = makeFakeSupabaseForCreate({
    profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    onUpsert: (row) => {
      written = row;
    },
  });
  const outcome = await maybeCreateOneShotReminder({
    supabase,
    userId: "u1",
    message:
      "Demain vendredi 12 juin 2026 à 08:40, heure de Paris. Tu peux le programmer.",
    contextMessages: [
      "Peux-tu me rappeler demain à 8h40 de sortir le tapis et faire le sas de décompression sans fumer ?",
    ],
    now: new Date("2026-06-11T19:27:00.000Z"),
    forceCreate: true,
  });

  assertEquals(outcome.detected, true);
  if (!outcome.detected) throw new Error("expected detected outcome");
  assertEquals(outcome.status, "needs_clarify");
  assertEquals(written, null);
});

// ===========================================================================
// CHANTIER G3 (2026-05-29) — Annulation effective d'un rappel ponctuel. Voir
// edgecases-r3 T9/T10.
// ===========================================================================

function makeFakeSupabaseForCancel(opts: {
  profile?: { timezone?: string; locale?: string } | null;
  pending: any[];
  onUpdate?: (vals: { vals: unknown; ids: string[] }) => void;
}) {
  return {
    from(_table: string) {
      const state: {
        updateVals: unknown;
        updating: boolean;
        updateIds: string[];
      } = { updateVals: null, updating: false, updateIds: [] };
      const chain: any = {
        select() {
          return chain;
        },
        update(vals: unknown) {
          state.updateVals = vals;
          state.updating = true;
          return chain;
        },
        eq() {
          return chain;
        },
        like() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        in(_col: string, ids: string[]) {
          state.updateIds = ids;
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({ data: opts.profile ?? null, error: null });
        },
        then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
          if (state.updating) {
            opts.onUpdate?.({ vals: state.updateVals, ids: state.updateIds });
            const rows = opts.pending
              .filter((row: any) =>
                state.updateIds.includes(String(row?.id ?? "")) &&
                String(row?.status ?? "") === "pending"
              )
              .map((row: any) => ({
                id: row.id,
                scheduled_for: row.scheduled_for,
              }));
            return Promise.resolve({ data: rows, error: null }).then(
              onFulfilled,
            );
          }
          return Promise.resolve({ data: opts.pending, error: null }).then(
            onFulfilled,
          );
        },
      };
      return chain;
    },
  } as any;
}

Deno.test("G3: 'annule le rappel de 16h10' annule le checkin pending vise (F4)", async () => {
  let updatedIds: string[] = [];
  let updatedVals: any = null;
  const supabase = makeFakeSupabaseForCancel({
    profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    // 16h10 Europe/Paris = 14:10 UTC.
    pending: [
      {
        id: "checkin-1",
        scheduled_for: "2026-05-29T14:10:00.000Z",
        status: "pending",
        event_context: "one_shot_reminder:verifier_les_5_lignes_du_devis",
        message_payload: {
          reminder_instruction: "vérifier les 5 lignes du devis",
        },
      },
    ],
    onUpdate: ({ vals, ids }) => {
      updatedVals = vals;
      updatedIds = ids;
    },
  });
  const outcome = await maybeCancelOneShotReminder({
    supabase,
    userId: "u1",
    message: "Alors annule le rappel de 16h10. Je ne veux plus de ping.",
    now: new Date("2026-05-29T08:00:00.000Z"),
  });
  assertEquals(outcome.detected, true);
  // F4 (2026-07-03, paul-broadflow15 T14): la capacite cancel existe — le
  // pending vise passe en cancelled, cible par son heure locale.
  if (!outcome.detected || outcome.status !== "cancelled") {
    throw new Error(`expected cancelled, got ${JSON.stringify(outcome)}`);
  }
  assertEquals(outcome.cancelled_ids, ["checkin-1"]);
  assertEquals(updatedIds, ["checkin-1"]);
  assertEquals(updatedVals, { status: "cancelled" });
});

Deno.test("G3: annulation sans rappel pending -> dit clairement que rien n'est annulé", async () => {
  const supabase = makeFakeSupabaseForCancel({
    profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    pending: [],
  });
  const outcome = await maybeCancelOneShotReminder({
    supabase,
    userId: "u1",
    message: "annule le rappel stp",
    now: new Date("2026-05-29T08:00:00.000Z"),
  });
  assertEquals(outcome.detected, true);
  if (!outcome.detected) throw new Error("expected detected");
  assertEquals(outcome.status, "no_reminder");
});

Deno.test("G3: une heure ciblée ne coupe QUE le rappel visé (F4)", async () => {
  let updatedIds: string[] = [];
  const supabase = makeFakeSupabaseForCancel({
    profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    pending: [
      {
        id: "checkin-a",
        scheduled_for: "2026-05-29T14:10:00.000Z", // 16:10 local
        status: "pending",
        event_context: "one_shot_reminder:a",
        message_payload: { reminder_instruction: "tâche A" },
      },
      {
        id: "checkin-b",
        scheduled_for: "2026-05-29T07:40:00.000Z", // 09:40 local
        status: "pending",
        event_context: "one_shot_reminder:b",
        message_payload: { reminder_instruction: "tâche B" },
      },
    ],
    onUpdate: ({ ids }) => {
      updatedIds = ids;
    },
  });
  const outcome = await maybeCancelOneShotReminder({
    supabase,
    userId: "u1",
    message: "coupe le rappel de 16h10",
    now: new Date("2026-05-29T08:00:00.000Z"),
  });
  // F4: seul le rappel dont l'heure locale correspond est annule — jamais
  // les autres pendings.
  if (!outcome.detected || outcome.status !== "cancelled") {
    throw new Error(`expected cancelled, got ${JSON.stringify(outcome)}`);
  }
  assertEquals(outcome.cancelled_ids, ["checkin-a"]);
  assertEquals(updatedIds, ["checkin-a"]);
});

Deno.test("G3: une heure ciblée sans match n'annule aucun rappel", async () => {
  let updatedIds: string[] = [];
  const supabase = makeFakeSupabaseForCancel({
    profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    pending: [
      {
        id: "checkin-10",
        scheduled_for: "2026-05-29T08:00:00.000Z", // 10:00 local
        status: "pending",
        event_context: "one_shot_reminder:ten",
        message_payload: { reminder_instruction: "tâche 10" },
      },
      {
        id: "checkin-11",
        scheduled_for: "2026-05-29T09:00:00.000Z", // 11:00 local
        status: "pending",
        event_context: "one_shot_reminder:eleven",
        message_payload: { reminder_instruction: "tâche 11" },
      },
    ],
    onUpdate: ({ ids }) => {
      updatedIds = ids;
    },
  });
  const outcome = await maybeCancelOneShotReminder({
    supabase,
    userId: "u1",
    message: "annule celui de 16h10",
    now: new Date("2026-05-29T07:00:00.000Z"),
  });
  if (!outcome.detected) throw new Error("expected detected");
  assertEquals(outcome.status, "no_reminder");
  assertEquals(updatedIds, []);
});

Deno.test("router: product-help and status references do not mutate", async () => {
  let createCalls = 0;
  let cancelCalls = 0;
  const common = {
    supabase: {} as any,
    userId: "u1",
    createReminder: async () => {
      createCalls++;
      return { detected: false } as any;
    },
    cancelReminder: async () => {
      cancelCalls++;
      return { detected: false } as any;
    },
  };

  const productHelp = await maybeRunOneShotReminderDirectEffect({
    ...common,
    message: "où est-ce que j'annule le rappel dans l'app ?",
  });
  assertEquals(productHelp.detected, false);
  assertEquals(productHelp.intent, "off_topic");
  assertEquals(productHelp.reply, null);

  const status = await maybeRunOneShotReminderDirectEffect({
    ...common,
    message: "récap : le rappel a été annulé ou pas ? sans modifier",
  });
  assertEquals(status.detected, false);
  assertEquals(status.intent, "off_topic");
  assertEquals(status.reply, null);
  assertEquals(createCalls, 0);
  assertEquals(cancelCalls, 0);
});

Deno.test("router: recurring wording is not parsed by runtime direct-effect lane", async () => {
  let createCalls = 0;
  const outcome = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    }) as any,
    userId: "u1",
    message: "rappelle-moi tous les jours à 9h de boire de l'eau",
    turnFrame: frameWithDirectEffects(["create_one_shot_reminder"]),
    createReminder: async () => {
      createCalls++;
      return { detected: false } as any;
    },
    cancelReminder: async () => ({ detected: false } as any),
  });
  assertEquals(outcome.detected, true);
  assertEquals(outcome.intent, "create");
  assertEquals(outcome.status, "needs_clarify");
  assertEquals(outcome.blocked_effects, [{
    type: "create_one_shot_reminder",
    reason_code: "missing_time",
  }]);
  assertEquals(createCalls, 0);
});

Deno.test("router: replace text is not parsed into cancel+create side effects", async () => {
  let cancelCalls = 0;
  let createCalls = 0;
  const outcome = await maybeRunOneShotReminderDirectEffect({
    supabase: {} as any,
    userId: "u1",
    message:
      "annule le rappel de 16h10 et mets plutôt un rappel à 16h30. Texte exact : relire X",
    turnFrame: frameWithDirectEffects([
      "cancel_one_shot_reminder",
      "create_one_shot_reminder",
    ]),
    cancelReminder: async () => {
      cancelCalls++;
      return { detected: false } as any;
    },
    createReminder: async () => {
      createCalls++;
      return { detected: false } as any;
    },
  });
  assertEquals(outcome.intent, "create");
  assertEquals(outcome.status, "needs_clarify");
  assertEquals(outcome.executed_tools, []);
  assertEquals(outcome.attempted_effects, []);
  assertEquals(outcome.committed_effects, []);
  assertEquals(outcome.blocked_effects, [{
    type: "create_one_shot_reminder",
    reason_code: "missing_time",
  }]);
  assertEquals(cancelCalls, 0);
  assertEquals(createCalls, 0);
});

Deno.test("router: replace with missing new time remains non-mutating", async () => {
  let cancelCalls = 0;
  let createCalls = 0;
  const outcome = await maybeRunOneShotReminderDirectEffect({
    supabase: {} as any,
    userId: "u1",
    message:
      "annule le rappel de 16h10 et mets plutôt un rappel. Texte exact : relire X",
    turnFrame: frameWithDirectEffects([
      "cancel_one_shot_reminder",
      "create_one_shot_reminder",
    ]),
    cancelReminder: async () => {
      cancelCalls++;
      return { detected: false } as any;
    },
    createReminder: async () => {
      createCalls++;
      return { detected: false } as any;
    },
  });
  assertEquals(outcome.intent, "create");
  assertEquals(outcome.status, "needs_clarify");
  assertEquals(outcome.committed_effects, []);
  assertEquals(
    outcome.reply?.includes("moment exact"),
    true,
  );
  assertEquals(cancelCalls, 0);
  assertEquals(createCalls, 0);
});

Deno.test("router: create success exposes requested allowed attempted and committed effects", async () => {
  const outcome = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    }) as any,
    userId: "u1",
    message: "rappelle-moi demain à 9h. Texte exact : relire X",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: frameWithStructuredCreate(),
  });
  assertEquals(outcome.status, "success");
  assertEquals(outcome.requested_effects.map((effect) => effect.type), [
    "create_one_shot_reminder",
  ]);
  assertEquals(outcome.allowed_effects.map((effect) => effect.type), [
    "create_one_shot_reminder",
  ]);
  assertEquals(outcome.attempted_effects, ["create_one_shot_reminder"]);
  assertEquals(outcome.committed_effects, [{
    type: "create_one_shot_reminder",
    id: "checkin-qa-r1",
    scheduled_for: "2026-05-30T07:00:00.000Z",
    local_label: "09:00",
    reminder_instruction: "relire X",
  }]);
});

Deno.test("router: create technical failure has no committed/executed effect and no success wording", async () => {
  const outcome = await maybeRunOneShotReminderDirectEffect({
    supabase: {
      from(table: string) {
        if (table === "profiles") {
          const chain: any = {
            select() {
              return chain;
            },
            eq() {
              return chain;
            },
            maybeSingle() {
              return Promise.resolve({
                data: { timezone: "Europe/Paris", locale: "fr-FR" },
                error: null,
              });
            },
          };
          return chain;
        }
        if (table === "scheduled_checkins") {
          throw new Error("boom");
        }
        throw new Error(`unexpected table: ${table}`);
      },
    } as any,
    userId: "u1",
    message: "rappelle-moi demain à 9h de relire X",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: frameWithStructuredCreate(),
    // Empty Supabase client makes the structured write fail without relying on
    // parser fallback.
    createReminder: async () => ({
      detected: false,
    }),
  });
  assertEquals(outcome.status, "failed");
  assertEquals(outcome.attempted_effects, ["create_one_shot_reminder"]);
  assertEquals(outcome.executed_tools, []);
  assertEquals(outcome.committed_effects, []);
  assertEquals(outcome.reply?.includes("programmé pour"), false);
});

Deno.test("router: no_mutation blocks effects before executor", async () => {
  let createCalls = 0;
  const outcome = await maybeRunOneShotReminderDirectEffect({
    supabase: {} as any,
    userId: "u1",
    message: "rappelle-moi demain à 9h de relire X",
    noMutationRequested: true,
    turnFrame: frameWithDirectEffects(["create_one_shot_reminder"]),
    createReminder: async () => {
      createCalls++;
      return { detected: false } as any;
    },
  });
  assertEquals(outcome.status, "blocked");
  assertEquals(createCalls, 0);
  assertEquals(outcome.allowed_effects, []);
  assertEquals(outcome.blocked_effects, [{
    type: "create_one_shot_reminder",
    reason_code: "no_mutation_requested",
  }]);
});

Deno.test("intake: exposes structured instruction and recurrence boundary", () => {
  const oneShot = buildOneShotReminderIntake({
    message: "choisis 16h05. Texte exact : relire X",
    directEffectsToRun: ["create_one_shot_reminder"],
  });
  assertEquals(oneShot.intent, "create");
  assertEquals(oneShot.recurrence_kind, "one_shot");
  assertEquals(oneShot.time_expression, "16h05");
  assertEquals(oneShot.instruction, "relire X");
  assertEquals(oneShot.instruction_source, "exact_text");

  const recurring = buildOneShotReminderIntake({
    message: "rappelle-moi tous les mardis à 9h de relire X",
    directEffectsToRun: ["create_one_shot_reminder"],
  });
  assertEquals(recurring.intent, "ignore");
  assertEquals(recurring.recurrence_kind, "recurring");
  assertEquals(recurring.constraints[0]?.kind, "one_shot_only");
});


Deno.test("router: classify explicit one-shot supersedes stale active flow shape", () => {
  const classified = classifyOneShotReminderDirectIntent(
    "Ignore la carte. Je parle d'un rappel ponctuel : choisis 16h05. Texte exact : relire X",
    ["create_one_shot_reminder"],
  );
  assertEquals(classified.detected, true);
  assertEquals(classified.intent, "create");
});

Deno.test("router: raw text alone never creates one-shot business intent", () => {
  const classified = classifyOneShotReminderDirectIntent(
    "Programme-moi un rappel demain à 8h30: relire une fois le brouillon.",
  );
  assertEquals(classified.detected, false);
  assertEquals(classified.intent, "off_topic");
});

Deno.test("router helpers: local text addon stays explicit", () => {
  assertEquals(
    localTextAddonForOneShotReminder(
      "Rappelle-moi à 16h05, formule une phrase courte pour Noa",
    ),
    "Phrase courte pour Noa : \"Je te confirme que je m'en occupe aujourd'hui, et je reviens vers toi dès que c'est fait.\"",
  );
});

Deno.test("router: create blocks duplicate_pending when an identical pending reminder exists", async () => {
  // Un one-shot pending existe deja au meme instant exact: la "creation"
  // (question de verification ou double envoi) est bloquee, rien de recree.
  const upserts: any[] = [];
  const duplicate = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [{
        id: "existing-1",
        scheduled_for: "2026-05-30T07:00:00.000Z",
      }],
    }) as any,
    userId: "u1",
    message: "tu me relances bien demain à 9h ?",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: frameWithStructuredCreate(),
  });
  assertEquals(duplicate.status, "needs_clarify");
  assertEquals((duplicate as any).debug?.reason_code, "duplicate_pending");
  assertEquals(duplicate.committed_effects, []);
  assertEquals(
    duplicate.blocked_effects.map((effect: any) => effect.reason_code),
    ["duplicate_pending"],
  );
  assertEquals(duplicate.missing_slots, []);
  // R-1 (BF-STATUS-01): la reponse duplicate_pending est devenue
  // existence-POSITIVE (« existe deja et il est bien en attente ») — un
  // doublon prouve l'existence, il ne la nie pas. Ancre mise a jour.
  assertEquals(
    duplicate.reply?.includes("existe déjà et il est bien en attente"),
    true,
  );
  assertEquals(upserts.length, 0);

  // Anti-faux-positif: un pending a un autre instant ne bloque pas la creation.
  const distinct = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      pendingRows: [{
        id: "existing-2",
        scheduled_for: "2026-05-30T18:00:00.000Z",
      }],
    }) as any,
    userId: "u1",
    message: "rappelle-moi demain à 9h. Texte exact : relire X",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: frameWithStructuredCreate(),
  });
  assertEquals(distinct.status, "success");
  assertEquals(
    distinct.committed_effects.map((effect: any) => effect.type),
    ["create_one_shot_reminder"],
  );
});

Deno.test("router: same-turn re-execution converges to committed, never self-duplicate", async () => {
  // La lane direct-effect peut s'executer plusieurs fois dans un meme tour
  // (pipeline, reexec post-flow, executor local d'un skill). La ligne pending
  // ecrite par la passe 1 porte le source_message_id du tour: la passe 2 ne
  // doit pas la traiter comme un duplicate mais retomber sur le chemin
  // idempotent et re-renvoyer le meme committed (Alex r3 T5 / Nina r1 T7).
  const upserts: any[] = [];
  const reexec = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [{
        id: "own-write-1",
        scheduled_for: "2026-05-30T07:00:00.000Z",
        message_payload: { source_message_id: "msg-turn-1" },
      }],
    }) as any,
    userId: "u1",
    message: "rappelle-moi demain à 9h. Texte exact : relire X",
    now: new Date("2026-05-29T10:00:00.000Z"),
    sourceMessageId: "msg-turn-1",
    turnFrame: frameWithStructuredCreate(),
  });
  assertEquals(reexec.status, "success");
  assertEquals(
    reexec.committed_effects.map((effect: any) => effect.type),
    ["create_one_shot_reminder"],
  );
  assertEquals(reexec.blocked_effects, []);
  // Aucune 2e ecriture: le commit existant du tour est reutilise tel quel.
  assertEquals(upserts.length, 0);

  // Anti-faux-positif: meme instant mais ecrit par un AUTRE message -> le
  // garde duplicate_pending continue de bloquer.
  const foreign = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [{
        id: "other-write-1",
        scheduled_for: "2026-05-30T07:00:00.000Z",
        message_payload: { source_message_id: "msg-earlier-turn" },
      }],
    }) as any,
    userId: "u1",
    message: "tu me relances bien demain à 9h ?",
    now: new Date("2026-05-29T10:00:00.000Z"),
    sourceMessageId: "msg-turn-2",
    turnFrame: frameWithStructuredCreate(),
  });
  assertEquals(foreign.status, "needs_clarify");
  assertEquals(
    foreign.blocked_effects.map((effect: any) => effect.reason_code),
    ["duplicate_pending"],
  );
  assertEquals(upserts.length, 0);
});

Deno.test("router: create blocked past_time yields an explicit no-creation reply", async () => {
  const pastTime = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    }) as any,
    userId: "u1",
    message: "fais moi un rappel ce soir à 19h stp",
    now: new Date("2026-05-29T21:45:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      UTC_time: "2026-05-29T17:00:00.000Z",
      when_hint: "ce soir à 19h",
      local_label: "19:00",
      // raw_text cohérent avec le scénario (le défaut du helper porte
      // « demain à 9h », ce qui déclencherait la réparation P0-5 légitime).
      raw_text: "fais moi un rappel ce soir à 19h stp",
      instruction_hint: "rappel de ce soir",
    }),
  });
  assertEquals(pastTime.status, "needs_clarify");
  assertEquals((pastTime as any).debug?.reason_code, "past_time");
  assertEquals(pastTime.committed_effects, []);
  assertEquals(pastTime.missing_slots, []);
  assertEquals(
    pastTime.reply?.includes("déjà passée"),
    true,
  );
  assertEquals(
    pastTime.reply?.includes("je n'ai rien programmé"),
    true,
  );
});

Deno.test("router: cardinality=recurring blocks the one-shot instead of committing a flattened reminder", async () => {
  const upserts: any[] = [];
  const recurring = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
    }) as any,
    userId: "u1",
    message: "colle-moi un rappel tous les soirs à 21h stp",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      cardinality: "recurring",
      when_hint: "tous les soirs à 21h",
    }),
  });
  assertEquals(recurring.status, "blocked");
  assertEquals(
    recurring.blocked_effects.map((effect: any) => effect.reason_code),
    ["recurring_not_supported"],
  );
  assertEquals(recurring.committed_effects, []);
  assertEquals(upserts.length, 0);
  assertEquals(recurring.reply?.includes("Initiatives"), true);

  // Anti-regression: cardinality=once (ou absente) laisse la creation normale.
  const once = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
    }) as any,
    userId: "u1",
    message: "rappelle-moi demain à 9h. Texte exact : relire X",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({ cardinality: "once" }),
  });
  assertEquals(once.status, "success");
});

Deno.test("cancel intent never touches the create path (F4, paul-broadflow15 T14)", async () => {
  const upserts: any[] = [];
  const makeSupabase = () =>
    makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
    }) as any;
  const cancelFrame = () =>
    frameWithStructuredCreate({
      intent: "cancel",
      when_hint: "le rappel de 19h",
    });

  // Cible unique annulee: commit cancel, zero creation.
  const cancelled = await maybeRunOneShotReminderDirectEffect({
    supabase: makeSupabase(),
    userId: "u1",
    message: "le rappel de 19h, finalement annule-le",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: cancelFrame(),
    cancelReminder: async () => ({
      detected: true,
      status: "cancelled",
      cancelled_count: 1,
      cancelled_local_labels: ["19:00"],
      cancelled_ids: ["ck-1"],
      user_message: "annule-le",
    }),
  });
  assertEquals(cancelled.status, "success");
  assertEquals(cancelled.intent, "cancel");
  assertEquals(
    cancelled.committed_effects.map((effect: any) => effect.type),
    ["cancel_one_shot_reminder"],
  );
  assertEquals(cancelled.reply?.includes("annulé"), true);
  assertEquals(upserts.length, 0);

  // Ambiguite: plusieurs pending, pas d'heure -> clarification, rien d'annule.
  const ambiguous = await maybeRunOneShotReminderDirectEffect({
    supabase: makeSupabase(),
    userId: "u1",
    message: "annule mon rappel stp",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: cancelFrame(),
    cancelReminder: async () => ({
      detected: true,
      status: "ambiguous_target",
      pending_count: 3,
      user_message: "annule mon rappel stp",
    }),
  });
  assertEquals(ambiguous.status, "needs_clarify");
  assertEquals(
    ambiguous.blocked_effects.map((effect: any) => effect.reason_code),
    ["cancel_target_ambiguous"],
  );
  assertEquals(ambiguous.committed_effects, []);
  assertEquals(upserts.length, 0);

  // Aucun pending: blocked honnete, jamais de creation inverse.
  const none = await maybeRunOneShotReminderDirectEffect({
    supabase: makeSupabase(),
    userId: "u1",
    message: "annule le rappel",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: cancelFrame(),
    cancelReminder: async () => ({
      detected: true,
      status: "no_reminder",
      user_message: "annule le rappel",
    }),
  });
  assertEquals(none.status, "blocked");
  assertEquals(
    none.blocked_effects.map((effect: any) => effect.reason_code),
    ["no_pending_reminder"],
  );
  assertEquals(upserts.length, 0);

  // Anti-faux-positif: intent absent -> chemin create intact.
  const create = await maybeRunOneShotReminderDirectEffect({
    supabase: makeSupabase(),
    userId: "u1",
    message: "rappelle-moi demain a 9h. Texte exact : relire X",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: frameWithStructuredCreate(),
  });
  assertEquals(create.status, "success");
  assertEquals(upserts.length, 1);
});

Deno.test("router: intent=status lit les pending et repond depuis la verite DB, zero write (R-1, BF-STATUS-01)", async () => {
  const upserts: any[] = [];
  // Positif: un pending existe → la lane status le confirme avec son heure.
  const withPending = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [{
        id: "existing-1",
        scheduled_for: "2026-05-30T05:30:00.000Z",
        message_payload: { reminder_instruction: "préparer mes affaires" },
      }],
    }) as any,
    userId: "u1",
    message: "mon rappel de demain à 7h30, il est bien enregistré ?",
    now: new Date("2026-05-29T19:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({ intent: "status" }),
  });
  assertEquals(withPending.status, "success");
  assertEquals((withPending as any).debug?.reason_code, "status_report");
  assertEquals(upserts.length, 0);
  const statusEffect = withPending.committed_effects.find((e: any) =>
    e.type === "one_shot_reminder_status"
  ) as any;
  assertExists(statusEffect);
  assertEquals(statusEffect.pending_count, 1);
  assertEquals(String(statusEffect.target_title).includes("07:30"), true);
  assertEquals(
    String(statusEffect.target_title).includes("préparer mes affaires"),
    true,
  );
  assertEquals(withPending.reply?.includes("07:30"), true);
  assertEquals(withPending.reply?.toLowerCase().includes("oui"), true);

  // Anti-faux-positif: aucun pending → dire "aucun", jamais inventer.
  const empty = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      pendingRows: [],
    }) as any,
    userId: "u1",
    message: "j'ai quoi comme rappels posés ?",
    now: new Date("2026-05-29T19:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({ intent: "status" }),
  });
  assertEquals(empty.status, "success");
  const emptyEffect = empty.committed_effects.find((e: any) =>
    e.type === "one_shot_reminder_status"
  ) as any;
  assertEquals(emptyEffect.pending_count, 0);
  assertEquals(
    empty.reply?.includes("aucun rappel ponctuel en attente"),
    true,
  );
});

Deno.test("router: intent=replace annule l'ancien puis cree le nouveau, atomique et jamais deux pending (R-2, eva-g16 B01)", async () => {
  const upserts: any[] = [];
  const cancelCalls: string[] = [];
  const replaced = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [],
    }) as any,
    userId: "u1",
    message: "annule-le et remets-le à 23h",
    now: new Date("2026-05-29T19:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({
      intent: "replace",
      replace_target_label: "22h30",
      when_hint: "ce soir à 23h",
      UTC_time: "2026-05-29T21:00:00.000Z",
      local_label: "23:00",
      instruction_hint: "poser le téléphone",
      raw_text: "annule-le et remets-le à 23h",
    }),
    cancelReminder: (async (params: any) => {
      cancelCalls.push(String(params.message ?? ""));
      return {
        detected: true,
        status: "cancelled",
        cancelled_ids: ["old-1"],
        cancelled_local_labels: ["22:30"],
      };
    }) as any,
  });
  assertEquals(replaced.status, "success");
  assertEquals(cancelCalls, ["22h30"]);
  const types = replaced.committed_effects.map((e: any) => e.type).sort();
  assertEquals(
    types.includes("cancel_one_shot_reminder") &&
      types.includes("create_one_shot_reminder"),
    true,
  );
  assertEquals(upserts.length, 1);
  assertEquals(replaced.reply?.includes("annulé"), true);

  // Ambiguité: plusieurs pendings sans cible → clarify, ZERO write.
  const ambiguous = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: () => {
        throw new Error("aucun write attendu sur replace ambigu");
      },
      pendingRows: [],
    }) as any,
    userId: "u1",
    message: "annule-le et remets-le à 23h",
    now: new Date("2026-05-29T19:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({
      intent: "replace",
      when_hint: "ce soir à 23h",
      UTC_time: "2026-05-29T21:00:00.000Z",
      local_label: "23:00",
      instruction_hint: "poser le téléphone",
    }),
    cancelReminder: (async () => ({
      detected: true,
      status: "ambiguous_target",
      pending_count: 2,
    })) as any,
  });
  assertEquals(ambiguous.status, "needs_clarify");
  assertEquals(
    (ambiguous as any).debug?.reason_code,
    "replace_target_ambiguous",
  );
  assertEquals(ambiguous.committed_effects, []);

  // Cancel en echec technique → RIEN n'est recree (anti-doublon).
  const failed = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: () => {
        throw new Error("aucun write attendu sur cancel failed");
      },
      pendingRows: [],
    }) as any,
    userId: "u1",
    message: "annule-le et remets-le à 23h",
    now: new Date("2026-05-29T19:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({
      intent: "replace",
      when_hint: "ce soir à 23h",
      UTC_time: "2026-05-29T21:00:00.000Z",
      local_label: "23:00",
      instruction_hint: "poser le téléphone",
    }),
    cancelReminder: (async () => ({
      detected: true,
      status: "failed",
      reason: "boom",
    })) as any,
  });
  assertEquals(failed.status, "failed");
  assertEquals((failed as any).debug?.reason_code, "replace_cancel_failed");
  assertEquals(failed.committed_effects, []);
});

Deno.test("router: cancel avec payload de creation COHERENT → clarify (jamais deviner replace ni cancel), cancel pur sur-rempli → cancel (round6 S2 / F4)", async () => {
  // Cas ambigu: intent=cancel mais payload complet coherent (when_hint 23h,
  // local_label 23:00) → needs_clarify, ZERO write.
  const ambiguous = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: () => {
        throw new Error("aucun write attendu");
      },
    }) as any,
    userId: "u1",
    message: "annule ce rappel, et mets-m'en un nouveau à 23h",
    now: new Date("2026-05-29T19:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      intent: "cancel",
      when_hint: "ce soir à 23h",
      UTC_time: "2026-05-29T21:00:00.000Z",
      local_label: "23:00",
      instruction_hint: "poser le téléphone",
    }),
    cancelReminder: (async () => {
      throw new Error("le cancel ne doit pas s'executer sur un cas ambigu");
    }) as any,
  });
  assertEquals(ambiguous.status, "needs_clarify");
  assertEquals(
    (ambiguous as any).debug?.reason_code,
    "cancel_or_replace_ambiguous",
  );
  assertEquals(ambiguous.committed_effects, []);
  assertEquals(ambiguous.reply?.includes("23:00"), true);

  // Cancel pur sur-rempli (leftover incoherent: cible 19h, label residuel
  // 09:00) → le cancel s'execute normalement (F4 preserve).
  const pure = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: () => {
        throw new Error("aucun write attendu");
      },
    }) as any,
    userId: "u1",
    message: "le rappel de 19h, finalement annule-le",
    now: new Date("2026-05-29T10:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      intent: "cancel",
      when_hint: "le rappel de 19h",
    }),
    cancelReminder: (async () => ({
      detected: true,
      status: "cancelled",
      cancelled_ids: ["ck-19"],
      cancelled_local_labels: ["19:00"],
    })) as any,
  });
  assertEquals(pure.status, "success");
  assertEquals(pure.intent, "cancel");
});

Deno.test("executor: create nu avec instruction identique a un pending a une autre heure → clarify deplacer/ajouter, zero write (round7 S2 T3)", async () => {
  const upserts: any[] = [];
  const moved = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [{
        id: "existing-1",
        scheduled_for: "2026-05-29T20:30:00.000Z",
        message_payload: {
          reminder_instruction: "poser le téléphone hors de la chambre",
        },
      }],
    }) as any,
    userId: "u1",
    message: "En fait mets-le plutôt à 23h",
    now: new Date("2026-05-29T18:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      when_hint: "ce soir à 23h",
      UTC_time: "2026-05-29T21:00:00.000Z",
      local_label: "23:00",
      instruction_hint: "poser le téléphone hors de la chambre",
    }),
  });
  assertEquals(moved.status, "needs_clarify");
  assertEquals((moved as any).debug?.reason_code, "same_instruction_pending");
  assertEquals(moved.committed_effects, []);
  assertEquals(upserts.length, 0);
  assertEquals(moved.reply?.includes("DÉPLACER"), true);

  // Anti-faux-positif: instruction differente a une autre heure → cree.
  const distinct = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [{
        id: "existing-1",
        scheduled_for: "2026-05-29T20:30:00.000Z",
        message_payload: { reminder_instruction: "sortir la poubelle" },
      }],
    }) as any,
    userId: "u1",
    message: "rappelle-moi à 23h de poser le téléphone hors de la chambre",
    now: new Date("2026-05-29T18:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      when_hint: "ce soir à 23h",
      UTC_time: "2026-05-29T21:00:00.000Z",
      local_label: "23:00",
      instruction_hint: "poser le téléphone hors de la chambre",
    }),
  });
  assertEquals(distinct.status, "success");
  assertEquals(upserts.length, 1);
});

Deno.test("router: replace au payload incomplet ne touche a RIEN (tout-ou-rien, round12 S2)", async () => {
  const noWrite = () => {
    throw new Error("aucun write attendu");
  };
  const incomplete = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: noWrite,
    }) as any,
    userId: "u1",
    message: "annule-le et remets-le plus tard",
    now: new Date("2026-05-29T18:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      intent: "replace",
      // raw_text cohérent avec le scénario: aucun moment exploitable — la
      // complétion structurelle (V6) ne doit rien résoudre ici (le défaut du
      // helper porte « demain à 9h », qui contredirait le « plus tard » testé).
      raw_text: "annule-le et remets-le plus tard",
      when_hint: "plus tard",
      UTC_time: null,
      local_label: null,
      instruction_hint: "poser le téléphone",
    }),
    cancelReminder: (async () => {
      throw new Error("le cancel ne doit JAMAIS courir avant validation du create");
    }) as any,
  });
  assertEquals(incomplete.status, "needs_clarify");
  assertEquals(
    (incomplete as any).debug?.reason_code,
    "replace_payload_incomplete",
  );
  assertEquals(incomplete.committed_effects, []);
  assertEquals(incomplete.reply?.includes("rien n'a été annulé"), true);
});

Deno.test("router: replace avec UTC_time vide mais moment exploitable dans le payload → complétion structurelle, replace exécuté (V6, harness S2 T4)", async () => {
  const upserts: any[] = [];
  const cancelCalls: string[] = [];
  const replaced = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [],
    }) as any,
    userId: "u1",
    message:
      "Ok alors fais simple : annule ce rappel, et mets-m'en un nouveau à 23h pour poser le téléphone hors de la chambre.",
    now: new Date("2026-05-29T19:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({
      intent: "replace",
      replace_target_label: "22h30",
      // Le tour raté du harness: le dispatcher a émis le replace SANS
      // résoudre UTC_time, alors que « à 23h » est dans ses propres champs.
      raw_text: "mets-m'en un nouveau à 23h pour poser le téléphone hors de la chambre",
      when_hint: "à 23h",
      UTC_time: null,
      local_label: null,
      instruction_hint: "poser le téléphone hors de la chambre",
    }),
    cancelReminder: (async (params: any) => {
      cancelCalls.push(String(params.message ?? ""));
      return {
        detected: true,
        status: "cancelled",
        cancelled_ids: ["old-1"],
        cancelled_local_labels: ["22:30"],
      };
    }) as any,
  });
  assertEquals(replaced.status, "success");
  assertEquals(cancelCalls, ["22h30"]);
  const types = replaced.committed_effects.map((e: any) => e.type).sort();
  assertEquals(
    types.includes("cancel_one_shot_reminder") &&
      types.includes("create_one_shot_reminder"),
    true,
  );
  // 23h Paris (CEST) le 2026-05-29 = 21:00Z — résolu par le parseur, ancré
  // sur l'horloge client, jamais deviné.
  assertEquals(upserts.length, 1);
  assertEquals(String(upserts[0]?.scheduled_for ?? ""), "2026-05-29T21:00:00.000Z");
});

Deno.test("router: reschedule sans AUCUN pending → dégrade en create (P0-4, nina R1-B02)", async () => {
  // Positif: « remets-le à 21h30 » avec zéro rappel en attente = rien à
  // déplacer, l'intention réelle est de (re)poser le rappel → create.
  const upserts: any[] = [];
  const recreated = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [],
    }) as any,
    userId: "u1",
    message: "Remets-moi le rappel de 21h30 pour éteindre les écrans.",
    now: new Date("2026-05-29T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({
      intent: "reschedule",
      raw_text: "Remets-moi le rappel de 21h30 pour éteindre les écrans.",
      when_hint: "à 21h30",
      UTC_time: "2026-05-29T19:30:00.000Z",
      local_label: "21:30",
      instruction_hint: "éteindre les écrans",
    }),
  });
  assertEquals(recreated.status, "success");
  assertEquals(upserts.length, 1);
  assertEquals(
    recreated.committed_effects.some((e: any) =>
      e.type === "create_one_shot_reminder"
    ),
    true,
  );

  // Payload sans heure exploitable → clarify honnête SANS proposer le
  // replace (aucune cible): reason reschedule_no_target.
  const noTime = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: () => {
        throw new Error("aucun write attendu");
      },
      pendingRows: [],
    }) as any,
    userId: "u1",
    message: "Remets-le moi ce soir.",
    now: new Date("2026-05-29T18:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      intent: "reschedule",
      raw_text: "Remets-le moi ce soir.",
      when_hint: "ce soir",
      UTC_time: null,
      local_label: null,
      instruction_hint: "éteindre les écrans",
    }),
  });
  assertEquals(noTime.status, "needs_clarify");
  assertEquals((noTime as any).debug?.reason_code, "reschedule_no_target");
  assertEquals(noTime.reply?.includes("annule-le et remets-le"), false);

  // Anti-faux-positif (non-régression eva-r5 B01): un pending EXISTE → le
  // reschedule implicite reste bloqué honnête, zéro write.
  const blocked = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: () => {
        throw new Error("aucun write attendu");
      },
      pendingRows: [{
        id: "p1",
        scheduled_for: "2026-05-29T20:30:00.000Z",
        message_payload: { reminder_instruction: "poser le téléphone" },
      }],
    }) as any,
    userId: "u1",
    message: "Mets-le plutôt à 23h.",
    now: new Date("2026-05-29T18:00:00.000Z"),
    turnFrame: frameWithStructuredCreate({
      intent: "reschedule",
      raw_text: "Mets-le plutôt à 23h.",
      when_hint: "à 23h",
      UTC_time: "2026-05-29T21:00:00.000Z",
      local_label: "23:00",
      instruction_hint: "poser le téléphone",
    }),
  });
  assertEquals(blocked.status, "blocked");
  assertEquals((blocked as any).debug?.reason_code, "reschedule_not_supported");
  assertEquals(blocked.committed_effects, []);
});

Deno.test("router: UTC_time passé mais payload explicitement 'demain' → réparation déterministe (P0-5, rose RMR-B01)", async () => {
  // Positif: le dispatcher a résolu 'demain 19h15' à la date du jour (passée);
  // le parseur (day_offset=1) répare vers demain — le rappel se crée au bon
  // jour au lieu d'un clarify past_time désinformant.
  const upserts: any[] = [];
  const repaired = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: (row) => upserts.push(row),
      pendingRows: [],
    }) as any,
    userId: "u1",
    message: "Remets-moi un rappel demain à 19h15 pour arroser les plantes.",
    now: new Date("2026-05-29T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({
      intent: null,
      raw_text: "un rappel demain à 19h15 pour arroser les plantes",
      when_hint: "demain à 19h15",
      // 19h15 Paris AUJOURD'HUI = 17:15Z — déjà passé (now=18:00Z).
      UTC_time: "2026-05-29T17:15:00.000Z",
      local_label: "demain à 19h15",
      instruction_hint: "arroser les plantes",
    }),
  });
  assertEquals(repaired.status, "success");
  assertEquals(upserts.length, 1);
  assertEquals(
    String(upserts[0]?.scheduled_for ?? ""),
    "2026-05-30T17:15:00.000Z",
  );

  // Anti-faux-positif (décision V2-A): un horaire passé SANS futur explicite
  // ('à 8h' dit à 18h) reste un clarify past_time — aucune devinette.
  const stillPast = await maybeRunOneShotReminderDirectEffect({
    supabase: makeFakeSupabaseForCreate({
      profile: { timezone: "Europe/Paris", locale: "fr-FR" },
      onUpsert: () => {
        throw new Error("aucun write attendu");
      },
      pendingRows: [],
    }) as any,
    userId: "u1",
    message: "Rappelle-moi à 8h de sortir la poubelle.",
    now: new Date("2026-05-29T18:00:00.000Z"),
    userTimezone: "Europe/Paris",
    turnFrame: frameWithStructuredCreate({
      intent: null,
      raw_text: "Rappelle-moi à 8h de sortir la poubelle.",
      when_hint: "à 8h",
      UTC_time: "2026-05-29T06:00:00.000Z",
      local_label: "08:00",
      instruction_hint: "sortir la poubelle",
    }),
  });
  assertEquals(stillPast.status, "needs_clarify");
  assertEquals((stillPast as any).debug?.reason_code, "past_time");
  assertEquals(stillPast.committed_effects, []);
});
