/**
 * KEEL W4.3 — tests for `log_protocol_event`.
 *
 * What is actually proven here (the four things the mission names):
 *   1. WRITE-THROUGH — no commit, no acknowledgement, without a row read back
 *      from the database. Proven from BOTH sides: the happy path quotes the
 *      read-back row (not the request), and a write that "succeeds" with no
 *      readable row produces `failed` + a null reply.
 *   2. IDEMPOTENCE — the schema's partial unique index, surfaced as
 *      `already_logged`, one acknowledgement, one row.
 *   3. SAFETY — band >= medium blocks the effect, through the real gate.
 *   4. R7 — an unknown token is named at the boundary, never coerced.
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  ProtocolEventRow,
  ProtocolEventWrite,
  ProtocolEventWriteInput,
} from "./contract.ts";
import { executeLogProtocolEventWrite } from "./executor.ts";
import { runLogProtocolEventIntake } from "./intake.ts";
import { runLogProtocolEventDirectEffect } from "./router.ts";
import { runLogProtocolEvent } from "./log_protocol_event_tool.ts";
import { enforceLogProtocolEventReplyInvariant } from "./renderer.ts";

const USER = "11111111-1111-1111-1111-111111111111";

function turnFrame(overrides?: {
  risk_band?: RiskBand;
  payload?: Record<string, unknown>;
  source_message_id?: string;
  explicitness?: "explicit" | "implied" | "weak";
  confidence_band?: "low" | "medium" | "high";
  with_time_context?: boolean;
}): TurnFrame {
  return {
    user_id: USER,
    source_message_id: overrides?.source_message_id ?? "msg-1",
    channel: "web",
    safety: {
      risk_band: overrides?.risk_band ?? "none",
      reason_codes: [],
      evidence: [],
    },
    direct_effects: [{
      effect_type: "log_protocol_event",
      explicitness: overrides?.explicitness ?? "explicit",
      target_status: "identified",
      confidence_band: overrides?.confidence_band ?? "high",
      payload_hint: overrides?.payload ??
        { slot_key: "breakfast", substance_ref: "vitamin_d3", quantity: 5000,
          unit: "IU" },
    }],
    direct_effect_time_context: overrides?.with_time_context === false
      ? undefined
      : {
        now_utc: "2026-07-27T06:12:00.000Z",
        user_timezone: "Europe/Paris",
        user_locale: "en-GB",
        user_local_datetime: "2026-07-27T08:12:00",
        user_local_human: "Monday 27 July, 08:12",
      },
    skill_signals: {},
  } as unknown as TurnFrame;
}

/** A fake database. Records what was inserted; returns rows, like the real one. */
function fakeDb(options?: { existingForMessageId?: string }) {
  const rows: ProtocolEventRow[] = [];
  const calls: ProtocolEventWriteInput[] = [];
  const write: ProtocolEventWrite = (input) => {
    calls.push(input);
    const existing = rows.find((row) =>
      row.source_message_id === input.source_message_id
    ) ??
      (options?.existingForMessageId === input.source_message_id
        ? {
          id: "pe-existing",
          user_id: input.user_id,
          local_date: input.local_date,
          occurred_at: input.occurred_at,
          slot_key: input.slot_key,
          source: input.source,
          source_message_id: input.source_message_id,
          bound_commitment_id: input.commitment_id,
          food_group_ref: input.food_group_ref,
          substance_ref: input.substance_ref,
        }
        : undefined);
    if (existing) {
      return Promise.resolve({ outcome: "already_logged", row: existing });
    }
    const row: ProtocolEventRow = {
      id: `pe-${rows.length + 1}`,
      user_id: input.user_id,
      local_date: input.local_date,
      occurred_at: input.occurred_at,
      slot_key: input.slot_key,
      source: input.source,
      source_message_id: input.source_message_id,
      // Le faux imite la base: `recognized.commitment_id` relu tel qu'ecrit.
      bound_commitment_id: input.commitment_id,
      food_group_ref: input.food_group_ref,
      substance_ref: input.substance_ref,
    };
    rows.push(row);
    return Promise.resolve({ outcome: "inserted", row });
  };
  return { rows, calls, write };
}

// ---------------------------------------------------------------------------
// 1. Write-through
// ---------------------------------------------------------------------------

Deno.test("write-through — le commit et l'accuse citent la ligne RELUE, pas la requete", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame(),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });

  assertEquals(result.status, "logged");
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.committed_effects[0].protocol_event_id, "pe-1");
  assertEquals(result.committed_effects[0].local_date, "2026-07-27");
  assertEquals(result.committed_effects[0].slot_key, "breakfast");
  assertEquals(result.committed_effects[0].already_logged, false);
  assertEquals(result.executed_tools, ["log_protocol_event"]);
  assertStringIncludes(result.reply ?? "", "2026-07-27");

  // Le fait est ecrit avec la date LOCALE resolue par le runtime, pas l'UTC:
  // 08:12 Paris le 27 est bien le 27 (et non le 26 comme un `new Date()`
  // cote serveur pourrait l'ecrire une heure du matin).
  assertEquals(db.calls[0].local_date, "2026-07-27");
  assertEquals(db.calls[0].content_locale, "en-GB");
  assertEquals(db.calls[0].evidence_weight, 0.8); // source 'chat'
});

Deno.test("write-through — la ligne relue FAIT AUTORITE si elle contredit la requete", async () => {
  // La base normalise le slot: c'est SA version qui remonte au ledger et au
  // rendu. Sinon on accuse reception d'un fait qui n'existe pas tel quel.
  const write: ProtocolEventWrite = (input) =>
    Promise.resolve({
      outcome: "inserted",
      row: {
        id: "pe-db",
        user_id: input.user_id,
        local_date: "2026-07-26",
        occurred_at: input.occurred_at,
        slot_key: null,
        source: "chat",
        source_message_id: input.source_message_id,
        bound_commitment_id: null,
        food_group_ref: input.food_group_ref,
        substance_ref: input.substance_ref,
      },
    });
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame(),
    content_locale: "en-GB",
    write_protocol_event: write,
  });
  assertEquals(result.status, "logged");
  assertEquals(result.committed_effects[0].local_date, "2026-07-26");
  assertEquals(result.committed_effects[0].slot_key, null);
  assertStringIncludes(result.reply ?? "", "2026-07-26");
});

Deno.test("write-through — write 'reussi' SANS ligne relue => failed, zero accuse", async () => {
  const write = (() =>
    Promise.resolve({
      outcome: "inserted",
      row: { id: "   " },
    })) as unknown as ProtocolEventWrite;
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame(),
    content_locale: "en-GB",
    write_protocol_event: write,
  });
  assertEquals(result.status, "failed");
  assertEquals(result.committed_effects, []);
  assertEquals(result.debug.reason_code, "missing_readback_row");
  // Le ledger montre le trou: demande + autorise, jamais committe.
  assertEquals(result.requested_effects.length, 1);
  assertEquals(result.allowed_effects.length, 1);
  assert(!(result.reply ?? "").includes("Recorded"));
});

Deno.test("write-through — une ligne relue appartenant a un AUTRE user est refusee", async () => {
  const write: ProtocolEventWrite = (input) =>
    Promise.resolve({
      outcome: "inserted",
      row: {
        id: "pe-x",
        user_id: "22222222-2222-2222-2222-222222222222",
        local_date: input.local_date,
        occurred_at: input.occurred_at,
        slot_key: input.slot_key,
        source: input.source,
        source_message_id: input.source_message_id,
        bound_commitment_id: input.commitment_id,
        food_group_ref: input.food_group_ref,
        substance_ref: input.substance_ref,
      },
    });
  const execution = await executeLogProtocolEventWrite({
    requested_effect: {
      type: "log_protocol_event",
      occurred_at: "2026-07-27T06:12:00.000Z",
      local_date: "2026-07-27",
      slot_key: "breakfast",
      source: "chat",
      media_path: null,
      quantity: null,
      unit: null,
      substance_ref: null,
      food_group_ref: null,
      commitment_id: null,
      student_note: "eggs",
      content_locale: "en-GB",
      evidence_weight: 0.8,
      source_message_id: "msg-1",
      precision_answer_to: null,
    },
    user_id: USER,
    write_protocol_event: write,
  });
  assertEquals(execution.status, "failed");
  assertEquals(
    execution.status === "failed" && execution.reason_code,
    "readback_mismatch",
  );
});

Deno.test("write-through — un throw de la base ne produit jamais de commit", async () => {
  const write: ProtocolEventWrite = () => {
    throw new Error("connection reset");
  };
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame(),
    content_locale: "en-GB",
    write_protocol_event: write,
  });
  assertEquals(result.status, "failed");
  assertEquals(result.debug.reason_code, "write_failed");
  assertEquals(result.committed_effects, []);
});

Deno.test("write-through — la ceinture anti-phantom rattrape un 'logged' sans ligne", () => {
  // Ceinture + condition de desarmement (P9): elle ne touche QUE `logged`, et
  // elle ne peut que RETIRER un accuse, jamais en ajouter.
  const phantom = enforceLogProtocolEventReplyInvariant({
    detected: true,
    status: "logged",
    reply: "Recorded for 2026-07-27.",
    executed_tools: ["log_protocol_event"],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    debug: { reason_code: "logged" },
  });
  assertEquals(phantom.status, "failed");
  assertEquals(phantom.reply, null);
  assertEquals(phantom.executed_tools, []);

  const untouched = enforceLogProtocolEventReplyInvariant({
    detected: true,
    status: "blocked",
    reply: "nope",
    executed_tools: [],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [{ type: "log_protocol_event", reason_code: "safety_high" }],
    debug: { reason_code: "safety_high" },
  });
  assertEquals(untouched.status, "blocked");
  assertEquals(untouched.reply, "nope");
});

// ---------------------------------------------------------------------------
// 2. Idempotence
// ---------------------------------------------------------------------------

Deno.test("idempotence — deux tours sur le MEME source_message_id => une ligne", async () => {
  const db = fakeDb();
  const first = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ source_message_id: "msg-42" }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  const second = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ source_message_id: "msg-42" }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });

  assertEquals(first.status, "logged");
  assertEquals(second.status, "logged");
  assertEquals(db.rows.length, 1, "une seule ligne en base");
  assertEquals(
    first.committed_effects[0].protocol_event_id,
    second.committed_effects[0].protocol_event_id,
  );
  assertEquals(second.committed_effects[0].already_logged, true);
  // L'idempotence est LISIBLE: le student ne doit pas se demander si le retry
  // a cree un doublon.
  assertStringIncludes(second.reply ?? "", "Already recorded");
});

Deno.test("idempotence — le gate bloque en amont un source_message deja consomme", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ source_message_id: "msg-7" }),
    content_locale: "en-GB",
    recent_writes_idempotency: { source_message_ids: ["msg-7"] },
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "duplicate_source_message");
  assertEquals(db.calls.length, 0, "aucun appel a la base");
});

Deno.test("idempotence — sans source_message_id, on REFUSE d'ecrire une ligne non dedupable", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ source_message_id: "" }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "missing_source_message_id");
  assertEquals(db.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Safety
// ---------------------------------------------------------------------------

Deno.test("safety — bande >= medium bloque l'effet et n'atteint JAMAIS la base", async () => {
  for (const band of ["medium", "high", "critical"] as RiskBand[]) {
    const db = fakeDb();
    const result = await runLogProtocolEventDirectEffect({
      turn_frame: turnFrame({ risk_band: band }),
      content_locale: "en-GB",
      write_protocol_event: db.write,
    });
    assertEquals(result.status, "blocked", band);
    assertEquals(result.debug.reason_code, "safety_high", band);
    assertEquals(result.committed_effects, [], band);
    // Le point qui compte: pas « bloque au rendu », mais AUCUNE ecriture.
    // p4-safety-deferred-gate-leak = un commit passe malgre un gate bloque.
    assertEquals(db.calls.length, 0, band);
    assertEquals(db.rows.length, 0, band);
  }
});

Deno.test("safety — bandes none/low laissent passer", async () => {
  for (const band of ["none", "low"] as RiskBand[]) {
    const db = fakeDb();
    const result = await runLogProtocolEventDirectEffect({
      turn_frame: turnFrame({ risk_band: band }),
      content_locale: "en-GB",
      write_protocol_event: db.write,
    });
    assertEquals(result.status, "logged", band);
    assertEquals(db.rows.length, 1, band);
  }
});

Deno.test("safety — un effet implicite ou peu confiant se clarifie, il ne s'ecrit pas", async () => {
  const db = fakeDb();
  const implied = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ explicitness: "implied" }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(implied.status, "needs_clarify");
  assertEquals(implied.debug.reason_code, "intent_implied_weak");

  const lowConfidence = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ confidence_band: "low" }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(lowConfidence.status, "needs_clarify");
  assertEquals(lowConfidence.debug.reason_code, "ambiguity_present");
  assertEquals(db.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 4. R7 — les tokens echouent bruyamment
// ---------------------------------------------------------------------------

Deno.test("R7 — un slug de substance invente est NOMME, jamais coerce", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ payload: { substance_ref: "unobtainium_complex" } }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "unknown_token");
  assertStringIncludes(String(result.debug.token_issue), "unobtainium_complex");
  // Le message rendu porte l'issue exacte: R7 veut un echec VISIBLE, pas un
  // « je n'ai pas compris » qui perd l'information de diagnostic.
  assertStringIncludes(result.reply ?? "", "unobtainium_complex");
  assertEquals(db.calls.length, 0);
});

Deno.test("R7 — un alias connu se normalise (vague 0: le modele ecrit 'epa_dha')", () => {
  // La frontiere est nette: un alias documente normalise, un slug inconnu
  // echoue. Les deux moities sont testees pour que l'une ne derive pas en
  // fourre-tout permissif.
  const intake = runLogProtocolEventIntake({
    turn_frame: turnFrame({ payload: { substance_ref: "epa_dha" } }),
    content_locale: "en-GB",
  });
  assert(intake.detected && intake.ok);
  assertEquals(intake.requested_effects[0].substance_ref, "omega3_epa_dha");
});

Deno.test("R7 — slot, unite, groupe alimentaire et source inconnus echouent tous", async () => {
  const cases: Array<Record<string, unknown>> = [
    { slot_key: "brunch" },
    { slot_key: "breakfast", unit: "spoonfuls" },
    { food_group_ref: "unobtainium" },
    { slot_key: "breakfast", source: "telepathy" },
  ];
  for (const payload of cases) {
    const db = fakeDb();
    const result = await runLogProtocolEventDirectEffect({
      turn_frame: turnFrame({ payload }),
      content_locale: "en-GB",
      write_protocol_event: db.write,
    });
    assertEquals(result.debug.reason_code, "unknown_token", JSON.stringify(payload));
    assertEquals(db.calls.length, 0, JSON.stringify(payload));
  }
});

Deno.test("R7 — les alias legitimes d'unite passent (le parseur normalise, il ne devine pas)", () => {
  const intake = runLogProtocolEventIntake({
    turn_frame: turnFrame({ payload: { slot_key: "breakfast", unit: "grams" } }),
    content_locale: "en-GB",
  });
  assert(intake.detected && intake.ok);
  assertEquals(intake.requested_effects[0].unit, "g");
});

// ---------------------------------------------------------------------------
// R2 / determinisme temporel
// ---------------------------------------------------------------------------

Deno.test("R2 — sans conversation_locale, on refuse d'ecrire une ligne de prose", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame(),
    content_locale: null,
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "missing_content_locale");
  assertEquals(db.calls.length, 0);
});

Deno.test("temps — sans contexte temporel resolu, aucune date n'est devinee", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ with_time_context: false }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "missing_time_context");
  assertEquals(db.calls.length, 0);
});

Deno.test("intake — un payload vide ne fabrique pas un fait", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ payload: {} }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "empty_payload");
  assertEquals(db.calls.length, 0);
});

Deno.test("intake — sans candidat d'effet, le tool est inerte", async () => {
  const frame = turnFrame();
  (frame as unknown as { direct_effects: unknown[] }).direct_effects = [];
  const outcome = await runLogProtocolEvent({
    turn_frame: frame,
    content_locale: "en-GB",
    write_protocol_event: fakeDb().write,
  });
  assertEquals(outcome, { detected: false });
});

Deno.test("tool — la surface publique n'annonce un succes qu'avec un id de ligne", async () => {
  const db = fakeDb();
  const outcome = await runLogProtocolEvent({
    turn_frame: turnFrame(),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assert(outcome.detected && outcome.status === "logged");
  assertEquals(outcome.protocol_event_id, "pe-1");
  assertEquals(outcome.local_date, "2026-07-27");
  assertEquals(outcome.already_logged, false);
});

Deno.test("evidence_weight — derive de la source, jamais d'un nombre libre du modele", () => {
  const cases: Array<[string, number]> = [
    ["photo", 1.0],
    ["quick_tap", 0.4],
    ["chat", 0.8],
    ["voice", 0.8],
  ];
  for (const [source, expected] of cases) {
    const intake = runLogProtocolEventIntake({
      turn_frame: turnFrame({
        payload: { slot_key: "lunch", source, evidence_weight: 0.99 },
      }),
      content_locale: "en-GB",
    });
    assert(intake.detected && intake.ok, source);
    assertEquals(intake.requested_effects[0].evidence_weight, expected, source);
  }
});

// ---------------------------------------------------------------------------
// 5. LE TEXTE CREDITE (MEGA_REVIEW G2)
//
// Le defaut repare ici n'etait pas un bug d'ecriture: la ligne partait bien en
// base, elle ne matchait RIEN. `matchEvent` n'attache un fait qu'a une ligne
// portant `substance_ref` ou `food_group_ref` — ou a la ligne DESIGNEE par un
// liage explicite. Le chat n'ecrivait ni l'un ni l'autre pour la nutrition et
// les 6 `activity_class` non-nutrition, et le renderer repondait « Recorded ».
//
// Ces tests traversent donc la chaine COMPLETE — intake -> ecriture -> ligne
// relue -> evaluateur — parce que c'est la seule facon de prouver un CREDIT.
// Un test qui s'arreterait a `db.calls[0].food_group_ref` prouverait qu'on a
// ecrit un champ, pas qu'une ligne du plan a ete creditee: exactement l'ecart
// que G2 nommait (« la preuve W4.7 portait sur la seule famille qui marche »).
// ---------------------------------------------------------------------------

import {
  type EvaluationSnapshot,
  evaluateSnapshot,
  type EvaluatorCommitment,
  type EvaluatorEvent,
} from "../../../../_shared/keel/evaluator.ts";
import {
  isTrackProgressFutureIntent,
} from "../track_progress_plan_item/intake.ts";

const PLAN = "33333333-3333-3333-3333-333333333333";
const C_POULTRY = "aaaaaaaa-0000-0000-0000-000000000001";
const C_GRAIN = "aaaaaaaa-0000-0000-0000-000000000002";
const C_DAYLIGHT = "aaaaaaaa-0000-0000-0000-000000000003";

/** Le seed `food_groups` de la migration P0, restreint a ce dont on se sert. */
const FOOD_GROUP_CLASSES: Record<string, string> = {
  poultry: "protein",
  lean_protein: "protein",
  whole_grain: "grain",
  refined_grain: "grain",
  cruciferous_veg: "vegetable",
  non_starchy_veg: "vegetable",
  leafy_greens: "vegetable",
};

function planLine(
  over: Partial<EvaluatorCommitment> & { id: string },
): EvaluatorCommitment {
  return {
    planVersionId: PLAN,
    userId: USER,
    polarity: "do",
    anchorKind: "free",
    slotKey: null,
    clockLocal: null,
    toleranceMinutes: null,
    windowStartLocal: null,
    windowEndLocal: null,
    measure: "count",
    unit: "none",
    targetOp: "any",
    targetMin: null,
    targetMax: null,
    tolerancePct: 10,
    substanceRef: null,
    foodGroupRef: null,
    evidenceKind: "self_report",
    evidenceRequired: false,
    autoSource: null,
    countsTowardAdherence: true,
    evaluationGrain: "day",
    slotKind: null,
    scheduledDays: null,
    requiredDaysPerWeek: null,
    expectedOccasionsPerDay: 1,
    priority: "core",
    autonomy: "strict",
    flexEligible: false,
    status: "active",
    swapPolicy: null,
    ...over,
  };
}

/**
 * La ligne ECRITE, relue comme l'evaluateur la lira. Cette fonction est le
 * joint du test: elle ne prend rien de l'intention du tour, seulement ce que
 * l'ecriture a porte (`db.calls[0]`) et ce que la base a rendu
 * (`committed_effects[0].commitment_id`, issu de `recognized`).
 */
function eventFromWrite(
  input: ProtocolEventWriteInput,
  boundCommitmentId: string | null,
): EvaluatorEvent {
  return {
    id: "pe-1",
    localDate: input.local_date,
    localTime: "12:30",
    slotKey: input.slot_key,
    source: input.source,
    quantity: input.quantity,
    unit: input.unit,
    substanceRef: input.substance_ref,
    foodGroupRef: input.food_group_ref,
    evidenceWeight: input.evidence_weight,
    portionBand: null,
    commitmentId: boundCommitmentId,
  };
}

function daySnapshot(
  commitments: EvaluatorCommitment[],
  events: EvaluatorEvent[],
): EvaluationSnapshot {
  return {
    userId: USER,
    planVersionId: PLAN,
    localDate: "2026-07-27",
    dayOfWeek: "mon",
    weekStartDate: "2026-07-27",
    dayIsClosed: false,
    weekIsClosed: false,
    evaluatedAt: "2026-07-27T23:59:00.000Z",
    commitments,
    events,
    weekEvents: events,
    plannedDeviations: [],
    foodGroupClasses: FOOD_GROUP_CLASSES,
  };
}

function statusOf(result: ReturnType<typeof evaluateSnapshot>, id: string) {
  return result.evaluations.find((e) => e.commitmentId === id)?.status ?? null;
}

Deno.test("G2 — « j'ai mange du poulet » CREDITE la ligne poulet du plan (bout en bout)", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: { slot_key: "lunch", food_group_ref: "poultry" },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "logged");
  assertEquals(db.calls[0].food_group_ref, "poultry");

  const evaluation = evaluateSnapshot(daySnapshot(
    [
      planLine({ id: C_POULTRY, foodGroupRef: "poultry" }),
      planLine({ id: C_GRAIN, foodGroupRef: "whole_grain" }),
    ],
    [eventFromWrite(db.calls[0], result.committed_effects[0].commitment_id)],
  ));
  // La ligne visee est creditee...
  assertEquals(statusOf(evaluation, C_POULTRY), "met");
  // ...et AUCUNE autre. Une seule portion nommee ne coche pas le riz: le fait
  // ne se diffuse pas par voisinage (doctrine matchEvent: ambigu => unknown).
  assertEquals(statusOf(evaluation, C_GRAIN), "unknown");
});

Deno.test("G2 — sans slug ET sans liage, RIEN n'est credite (le defaut, pin de non-regression)", async () => {
  // « j'ai marche 30 minutes » sans commitment_id: la ligne part en base
  // (student_note), l'evaluateur ne peut la rattacher a rien. C'est le
  // comportement CORRECT — un fait non identifiable ne doit pas cocher au
  // hasard — et c'est pourquoi le liage explicite (test suivant) est la seule
  // porte pour les lignes sans substance ni groupe alimentaire.
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: { student_note: "walked 30 minutes at lunchtime" },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "logged");
  assertEquals(db.calls[0].commitment_id, null);

  const evaluation = evaluateSnapshot(daySnapshot(
    [planLine({ id: C_DAYLIGHT, measure: "duration", unit: "min" })],
    [eventFromWrite(db.calls[0], null)],
  ));
  assertEquals(statusOf(evaluation, C_DAYLIGHT), "unknown");
});

Deno.test("liage explicite — une ligne SANS substance ni groupe devient loggable par chat", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        commitment_id: C_DAYLIGHT,
        student_note: "did my 30-minute walk",
      },
    }),
    content_locale: "en-GB",
    // Le contexte plan du tour: exactement les lignes montrees au dispatcher.
    allowed_commitment_ids: [C_POULTRY, C_DAYLIGHT],
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "logged");
  // L'ecriture porte le liage, et le ledger cite la valeur RELUE.
  assertEquals(db.calls[0].commitment_id, C_DAYLIGHT);
  assertEquals(result.committed_effects[0].commitment_id, C_DAYLIGHT);

  const evaluation = evaluateSnapshot(daySnapshot(
    [
      planLine({ id: C_DAYLIGHT, measure: "duration", unit: "min" }),
      planLine({ id: C_POULTRY, foodGroupRef: "poultry" }),
    ],
    [eventFromWrite(db.calls[0], result.committed_effects[0].commitment_id)],
  ));
  assertEquals(statusOf(evaluation, C_DAYLIGHT), "met");
  // Le liage est EXCLUSIF: il ne deborde pas sur une autre ligne.
  assertEquals(statusOf(evaluation, C_POULTRY), "unknown");
});

Deno.test("liage — un commitment_id HORS du plan du jour est refuse, zero ecriture", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: { commitment_id: "99999999-9999-9999-9999-999999999999" },
    }),
    content_locale: "en-GB",
    allowed_commitment_ids: [C_POULTRY, C_DAYLIGHT],
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "unknown_commitment");
  assertStringIncludes(String(result.debug.token_issue), "999999");
  assertEquals(db.calls.length, 0);
  assert(!(result.reply ?? "").includes("Recorded"));
});

Deno.test("liage — FAIL-CLOSED: sans allow-list, un commitment_id n'est jamais ecrit sur parole", async () => {
  // La condition de desarmement de la garde est explicite: elle ne se declenche
  // QUE si le payload porte un commitment_id. Un tour sans liage passe.
  for (const allowed of [undefined, [] as string[], null]) {
    const db = fakeDb();
    const result = await runLogProtocolEventDirectEffect({
      turn_frame: turnFrame({ payload: { commitment_id: C_DAYLIGHT } }),
      content_locale: "en-GB",
      allowed_commitment_ids: allowed,
      write_protocol_event: db.write,
    });
    assertEquals(result.debug.reason_code, "unknown_commitment", String(allowed));
    assertEquals(db.calls.length, 0, String(allowed));
  }
  const db = fakeDb();
  const ok = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ payload: { food_group_ref: "poultry" } }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(ok.status, "logged");
});

Deno.test("liage — un id demande qui ne revient PAS de la base ne se commite jamais", async () => {
  // La base a avale l'insert mais `recognized` n'est pas revenu: le fait
  // existe, le credit non. Annoncer « c'est note » sur cette ligne serait un
  // phantom commit deplace du fait vers la CIBLE du fait.
  const write: ProtocolEventWrite = (input) =>
    Promise.resolve({
      outcome: "inserted",
      row: {
        id: "pe-nobind",
        user_id: input.user_id,
        local_date: input.local_date,
        occurred_at: input.occurred_at,
        slot_key: input.slot_key,
        source: input.source,
        source_message_id: input.source_message_id,
        bound_commitment_id: null,
        food_group_ref: input.food_group_ref,
        substance_ref: input.substance_ref,
      },
    });
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ payload: { commitment_id: C_DAYLIGHT } }),
    content_locale: "en-GB",
    allowed_commitment_ids: [C_DAYLIGHT],
    write_protocol_event: write,
  });
  assertEquals(result.status, "failed");
  assertEquals(result.debug.reason_code, "readback_mismatch");
  assertEquals(result.committed_effects, []);
});

Deno.test("intention future — « je vais manger du poulet » n'atteint jamais la lane", () => {
  // La ceinture est deterministe et porte sur le MESSAGE (run.ts la consulte
  // avant d'appeler ce router: `protocol_events` est append-only, une ligne
  // ecrite sur une intention ne se retire pas depuis le chat). Elle est testee
  // ici parce que c'est CETTE lane qu'elle protege.
  for (
    const future of [
      "je vais manger du poulet ce soir",
      "je compte prendre mon magnesium tout a l'heure",
      "on verra si ca tient demain",
    ]
  ) {
    assert(isTrackProgressFutureIntent(future), future);
  }
  for (
    const fact of [
      "j'ai mange du poulet et du riz",
      "j'ai pris mon magnesium ce matin",
      "petit dej pris, des oeufs et des myrtilles",
    ]
  ) {
    assert(!isTrackProgressFutureIntent(fact), fact);
  }
});

// ---------------------------------------------------------------------------
// 6. D2 — LA CARDINALITE DU TEXTE
//
// Le rouge mesure: « j'ai mange du poulet et des brocolis » n'ecrivait QU'UNE
// ligne (regle « l'entree la plus porteuse »), le modele choisissait `poultry`
// — celui qui ne comptait pas — et la reponse affirmait que les legumes
// comptaient. Deux mensonges pour un tour: un fait ampute, un accuse sans
// ligne.
//
// La reponse: N faits pour N aliments NOMMES. Les tests traversent la chaine
// complete jusqu'a l'evaluateur, parce que « deux lignes ecrites » ne prouve
// pas « deux lignes creditees ».
// ---------------------------------------------------------------------------

const C_VEG = "aaaaaaaa-0000-0000-0000-000000000004";

function eventsFromWrites(
  calls: readonly ProtocolEventWriteInput[],
): EvaluatorEvent[] {
  return calls.map((input, index) => ({
    ...eventFromWrite(input, null),
    id: `pe-${index + 1}`,
  }));
}

Deno.test("D2 — deux aliments nommes => DEUX faits, et les DEUX lignes sont creditees", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        slot_key: "lunch",
        food_group_ref: "poultry",
        components: [{ food_group_ref: "cruciferous_veg" }],
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });

  assertEquals(result.status, "logged");
  assertEquals(db.calls.length, 2);
  assertEquals(result.committed_effects.length, 2);
  assertEquals(
    db.calls.map((c) => c.food_group_ref),
    ["poultry", "cruciferous_veg"],
  );
  // Le discriminant d'idempotence: une cle par item, derivee de son identite.
  assertEquals(
    db.calls.map((c) => c.source_message_id),
    ["msg-1#food_group:poultry", "msg-1#food_group:cruciferous_veg"],
  );

  const evaluation = evaluateSnapshot(daySnapshot(
    [
      planLine({ id: C_POULTRY, foodGroupRef: "poultry" }),
      // La ligne legumes est atteinte par SWAP de classe (D1 + evaluateur):
      // brocolis contre `non_starchy_veg` en autonomy flexible.
      planLine({
        id: C_VEG,
        foodGroupRef: "non_starchy_veg",
        autonomy: "flexible",
      }),
    ],
    eventsFromWrites(db.calls),
  ));
  assertEquals(statusOf(evaluation, C_POULTRY), "met");
  assertEquals(statusOf(evaluation, C_VEG), "met");
});

Deno.test("D2 — l'accuse ne nomme QUE ce qui est reellement ecrit", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        slot_key: "lunch",
        food_group_ref: "poultry",
        components: [{ food_group_ref: "cruciferous_veg" }],
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  const reply = result.reply ?? "";
  assertStringIncludes(reply, "Poultry");
  assertStringIncludes(reply, "Cruciferous vegetables");
  assertStringIncludes(reply, "2026-07-27");
});

Deno.test("D2 — fan-out PARTIEL: la ligne qui echoue n'est jamais nommee", async () => {
  // LE defaut `fanout-reminder-phantom-commit`, applique ici: 2 demandes, 1
  // ligne, et l'accuse doit dire UNE chose. Le trou reste visible au ledger.
  let call = 0;
  const write: ProtocolEventWrite = (input) => {
    call += 1;
    if (call === 2) return Promise.reject(new Error("insert exploded"));
    return Promise.resolve({
      outcome: "inserted",
      row: {
        id: "pe-1",
        user_id: input.user_id,
        local_date: input.local_date,
        occurred_at: input.occurred_at,
        slot_key: input.slot_key,
        source: input.source,
        source_message_id: input.source_message_id,
        bound_commitment_id: input.commitment_id,
        food_group_ref: input.food_group_ref,
        substance_ref: input.substance_ref,
      },
    });
  };
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        slot_key: "lunch",
        food_group_ref: "poultry",
        components: [{ food_group_ref: "cruciferous_veg" }],
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: write,
  });

  assertEquals(result.status, "logged");
  assertEquals(result.requested_effects.length, 2);
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.blocked_effects.length, 1);
  assertEquals(result.debug.reason_code, "logged_partial");
  const reply = result.reply ?? "";
  assertStringIncludes(reply, "Poultry");
  assert(!reply.includes("Cruciferous"), reply);
});

Deno.test("D2 — deux aliments du MEME groupe ne font qu'un fait", async () => {
  // « brocolis et chou-fleur » = `cruciferous_veg` deux fois. Le vocabulaire
  // ferme ne sait pas les distinguer: le compte honnete est UN fait, pas deux.
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        slot_key: "dinner",
        components: [
          { food_group_ref: "cruciferous_veg" },
          { food_group_ref: "cruciferous_veg" },
        ],
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "logged");
  assertEquals(db.calls.length, 1);
  assertEquals(result.committed_effects.length, 1);
});

Deno.test("D2 — rejouer le MEME message multi-aliments n'ajoute aucune ligne", async () => {
  const db = fakeDb();
  const payload = {
    slot_key: "lunch",
    food_group_ref: "poultry",
    components: [{ food_group_ref: "cruciferous_veg" }],
  };
  const first = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ payload }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  const second = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({ payload }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(first.committed_effects.map((e) => e.already_logged), [
    false,
    false,
  ]);
  assertEquals(second.committed_effects.map((e) => e.already_logged), [
    true,
    true,
  ]);
  assertEquals(db.rows.length, 2);
  assertStringIncludes(second.reply ?? "", "Already recorded");
});

Deno.test("D2 — une reprise qui decompose AUTREMENT ne duplique jamais un item", async () => {
  // Le discriminant vient de l'IDENTITE de l'item, jamais de sa position: une
  // relance ou le modele inverse l'ordre, ou n'en retrouve qu'un, converge sur
  // les memes cles. `protocol_events` est APPEND-ONLY: un doublon ne se retire
  // pas depuis le chat, et il double-compterait une cible `serving`.
  const db = fakeDb();
  await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        food_group_ref: "poultry",
        components: [{ food_group_ref: "cruciferous_veg" }],
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  const retry = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        food_group_ref: "cruciferous_veg",
        components: [{ food_group_ref: "poultry" }],
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(db.rows.length, 2);
  assertEquals(retry.committed_effects.every((e) => e.already_logged), true);
});

Deno.test("D2 — R7: un slug invente dans le 2e item refuse TOUT le tour", async () => {
  // Jamais de tour a moitie ecrit sur un payload qu'on ne sait pas lire: on ne
  // committe pas le poulet en laissant tomber le reste en silence.
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        food_group_ref: "poultry",
        components: [{ food_group_ref: "unobtainium" }],
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "unknown_token");
  // Le message dit QUEL item a echoue, pas seulement que quelque chose a rate.
  assertStringIncludes(String(result.debug.token_issue), "components[0]");
  assertStringIncludes(String(result.debug.token_issue), "unobtainium");
  assertEquals(db.calls.length, 0);
});

Deno.test("D2 — un payload components malforme est refuse, jamais coerce", async () => {
  for (const components of ["poultry", [42]]) {
    const db = fakeDb();
    const result = await runLogProtocolEventDirectEffect({
      turn_frame: turnFrame({ payload: { slot_key: "lunch", components } }),
      content_locale: "en-GB",
      write_protocol_event: db.write,
    });
    assertEquals(result.debug.reason_code, "unknown_token");
    assertEquals(db.calls.length, 0);
  }
});

Deno.test("D2 — au-dela du plafond, le tour est refuse EN ENTIER, jamais tronque", async () => {
  const db = fakeDb();
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        slot_key: "dinner",
        components: [
          { food_group_ref: "poultry" },
          { food_group_ref: "cruciferous_veg" },
          { food_group_ref: "leafy_greens" },
          { food_group_ref: "whole_grain" },
          { food_group_ref: "berries" },
          { food_group_ref: "olive_oil" },
          { food_group_ref: "water" },
        ],
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "too_many_components");
  assertEquals(db.calls.length, 0);
});

Deno.test("D2 — aucune deduction: la note de l'eleve ne fabrique pas un 2e fait", async () => {
  // La regle produit: on n'ecrit que ce qui est explicitement dit. La note cite
  // deux aliments, le payload n'en structure qu'un: une seule ligne part.
  const db = fakeDb();
  await runLogProtocolEventDirectEffect({
    turn_frame: turnFrame({
      payload: {
        slot_key: "lunch",
        food_group_ref: "poultry",
        student_note: "chicken with broccoli and a bit of rice",
      },
    }),
    content_locale: "en-GB",
    write_protocol_event: db.write,
  });
  assertEquals(db.calls.length, 1);
  assertEquals(db.calls[0].food_group_ref, "poultry");
  // Chaque ligne porte la note ET sa langue (R2), sans decoupage de la prose.
  assertEquals(db.calls[0].content_locale, "en-GB");
});

Deno.test("D2 — la ceinture retire un doublon de ligne et RE-REND l'accuse", async () => {
  // Deux effets committes pointant sur UNE ligne: l'intake dedupe deja, donc
  // arriver ici signifie qu'un chemin d'ecriture a rendu deux fois la meme
  // ligne. La cardinalite dite doit rester celle qui existe.
  const committed = {
    type: "log_protocol_event" as const,
    protocol_event_id: "pe-1",
    local_date: "2026-07-27",
    slot_key: "lunch",
    source: "chat",
    already_logged: false,
    substance_ref: null,
    food_group_ref: "poultry",
    commitment_id: null,
    quantity: null,
    unit: null,
  };
  const enforced = enforceLogProtocolEventReplyInvariant({
    detected: true,
    status: "logged",
    reply: "Recorded for 2026-07-27 (lunch): Poultry and Poultry.",
    executed_tools: ["log_protocol_event"],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [committed, { ...committed }],
    blocked_effects: [],
    debug: { reason_code: "logged" },
  });
  assertEquals(enforced.status, "logged");
  assertEquals(enforced.committed_effects.length, 1);
  assertEquals(enforced.blocked_effects[0].reason_code, "duplicate_commit_dropped");
  assertEquals(enforced.reply, "Recorded for 2026-07-27 (lunch): Poultry.");
});
