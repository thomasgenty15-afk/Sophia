/**
 * KEEL W4.3 — tests for `declare_deviation`.
 *
 * The rule under test is a PRODUCT rule: flex is declared in advance. Its
 * three disarm conditions (advance_rule.ts D1/D2/D3) are each pinned, and so
 * is the case they exist to refuse — because a rule tested only on its refusal
 * becomes a wall, and a rule tested only on its happy path becomes decoration.
 *
 * Also pinned: write-through, safety blocking, and the fact that the coach
 * authorization is UNREACHABLE from the turn payload.
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import type { RiskBand, TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { evaluateAdvanceRule } from "./advance_rule.ts";
import type {
  PlannedDeviationRow,
  PlannedDeviationWrite,
  PlannedDeviationWriteInput,
} from "./contract.ts";
import { runDeclareDeviationDirectEffect } from "./router.ts";
import { runDeclareDeviation } from "./declare_deviation_tool.ts";
import { enforceDeclareDeviationReplyInvariant } from "./renderer.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const PLAN_VERSION = "99999999-9999-9999-9999-999999999999";

function turnFrame(overrides?: {
  risk_band?: RiskBand;
  payload?: Record<string, unknown>;
  source_message_id?: string;
  explicitness?: "explicit" | "implied" | "weak";
  local_datetime?: string;
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
      effect_type: "declare_deviation",
      explicitness: overrides?.explicitness ?? "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: overrides?.payload ??
        { local_date: "2026-07-31", kind: "restaurant", slot_key: "dinner" },
    }],
    direct_effect_time_context: {
      now_utc: "2026-07-27T06:12:00.000Z",
      user_timezone: "Europe/Paris",
      user_locale: "en-GB",
      user_local_datetime: overrides?.local_datetime ?? "2026-07-27T08:12:00",
      user_local_human: "Monday 27 July, 08:12",
    },
    skill_signals: {},
  } as unknown as TurnFrame;
}

function fakeDb() {
  const rows: PlannedDeviationRow[] = [];
  const calls: PlannedDeviationWriteInput[] = [];
  const write: PlannedDeviationWrite = (input) => {
    calls.push(input);
    const existing = rows.find((row) =>
      row.plan_version_id === input.plan_version_id &&
      row.local_date === input.local_date &&
      row.slot_key === input.slot_key &&
      row.kind === input.kind
    );
    if (existing) {
      return Promise.resolve({ outcome: "already_declared", row: existing });
    }
    const row: PlannedDeviationRow = {
      id: `pd-${rows.length + 1}`,
      user_id: input.user_id,
      plan_version_id: input.plan_version_id,
      local_date: input.local_date,
      slot_key: input.slot_key,
      kind: input.kind,
      declared_via: input.declared_via,
      consumed_flex: input.consumed_flex,
    };
    rows.push(row);
    return Promise.resolve({ outcome: "inserted", row });
  };
  return { rows, calls, write };
}

function run(args: Parameters<typeof runDeclareDeviationDirectEffect>[0]) {
  return runDeclareDeviationDirectEffect(args);
}

// ---------------------------------------------------------------------------
// La regle d'avance — les 4 branches nommees
// ---------------------------------------------------------------------------

Deno.test("advance rule D1 — declarer pour plus tard (le cas nominal) passe", () => {
  const verdict = evaluateAdvanceRule({
    local_date: "2026-07-31",
    today_local_date: "2026-07-27",
    day_resolution: null,
  });
  assertEquals(verdict.decision, "allow");
  assertEquals(verdict.retroactive, false);
});

Deno.test("advance rule D1-bis — declarer pour AUJOURD'HUI n'est pas retroactif", () => {
  // « je mange dehors ce soir » a 8h du matin: la journee n'est pas jugee.
  const verdict = evaluateAdvanceRule({
    local_date: "2026-07-27",
    today_local_date: "2026-07-27",
    day_resolution: { local_date: "2026-07-27", resolved: false },
  });
  assertEquals(verdict.decision, "allow");
  assertEquals(verdict.retroactive, false);
});

Deno.test("advance rule D2 — jour passe mais PAS ENCORE resolu: autorise", () => {
  // Le samedi soir declare le dimanche matin, avant le balayage: on ne punit
  // pas un decalage de cron, on protege une note deja donnee.
  const verdict = evaluateAdvanceRule({
    local_date: "2026-07-25",
    today_local_date: "2026-07-27",
    day_resolution: { local_date: "2026-07-25", resolved: false },
  });
  assertEquals(verdict.decision, "allow");
  assertEquals(verdict.retroactive, true);
  assertEquals(verdict.coach_authorized, false);
});

Deno.test("advance rule — REFUS: jour passe et deja resolu", () => {
  const verdict = evaluateAdvanceRule({
    local_date: "2026-07-25",
    today_local_date: "2026-07-27",
    day_resolution: {
      local_date: "2026-07-25",
      resolved: true,
      resolved_by: "day_close_sweep",
    },
  });
  assertEquals(verdict.decision, "refuse");
  assertEquals(
    verdict.decision === "refuse" && verdict.reason_code,
    "retroactive_on_resolved_day",
  );
});

Deno.test("advance rule D3 — le coach peut autoriser un backdate, et c'est trace", () => {
  const verdict = evaluateAdvanceRule({
    local_date: "2026-07-25",
    today_local_date: "2026-07-27",
    day_resolution: { local_date: "2026-07-25", resolved: true },
    coach_backdate_grant: { granted: true, granted_by_coach_id: "coach-1" },
  });
  assertEquals(verdict.decision, "allow");
  assertEquals(verdict.coach_authorized, true);
});

Deno.test("advance rule D3 — une autorisation portant sur un AUTRE jour ne s'applique pas", () => {
  const verdict = evaluateAdvanceRule({
    local_date: "2026-07-25",
    today_local_date: "2026-07-27",
    day_resolution: { local_date: "2026-07-25", resolved: true },
    coach_backdate_grant: { granted: true, local_date: "2026-07-24" },
  });
  assertEquals(verdict.decision, "refuse");
});

Deno.test("advance rule — une resolution portant sur un autre jour ne bloque rien", () => {
  // Detail qui compte: le lecteur du jour doit repondre SUR le jour demande.
  // Une reponse mal cadree bloquerait des declarations legitimes.
  const verdict = evaluateAdvanceRule({
    local_date: "2026-07-25",
    today_local_date: "2026-07-27",
    day_resolution: { local_date: "2026-07-26", resolved: true },
  });
  assertEquals(verdict.decision, "allow");
});

// ---------------------------------------------------------------------------
// La regle, de bout en bout
// ---------------------------------------------------------------------------

Deno.test("declaration en avance — committee, avec la ligne relue", async () => {
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame(),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  assertEquals(result.status, "declared");
  assertEquals(result.committed_effects[0].planned_deviation_id, "pd-1");
  assertEquals(result.committed_effects[0].local_date, "2026-07-31");
  assertEquals(result.committed_effects[0].slot_key, "dinner");
  assertEquals(result.committed_effects[0].coach_authorized_backdate, false);
  assertEquals(result.debug.retroactive, false);
  assertStringIncludes(result.reply ?? "", "2026-07-31");

  // Le flex n'est PAS consomme par le tour de chat: c'est la couche derivee
  // qui compte (zero compteur incremental, CONTRACT).
  assertEquals(db.calls[0].consumed_flex, false);
  assertEquals(db.calls[0].content_locale, "en-GB");
  assertEquals(db.calls[0].declared_via, "chat");
});

Deno.test("declaration retroactive sur jour RESOLU — refusee, message explicite, zero ecriture", async () => {
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame({
      payload: { local_date: "2026-07-20", kind: "social" },
    }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    read_day_resolution: (localDate) => ({
      local_date: localDate,
      resolved: true,
      resolved_by: "day_close_sweep",
    }),
    write_planned_deviation: db.write,
  });

  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "retroactive_on_resolved_day");
  assertEquals(result.debug.retroactive, true);
  assertEquals(result.debug.day_resolved, true);
  assertEquals(result.committed_effects, []);
  assertEquals(db.calls.length, 0, "rien n'atteint la base");
  // Le ledger montre que l'effet a bien ete AUTORISE par la safety puis
  // refuse par la regle produit: les deux refus ne se confondent pas.
  assertEquals(result.allowed_effects.length, 1);
  assertEquals(result.blocked_effects, [{
    type: "declare_deviation",
    reason_code: "retroactive_on_resolved_day",
  }]);

  // Le message dit QUOI, POURQUOI, et la seule voie ouverte.
  const reply = result.reply ?? "";
  assertStringIncludes(reply, "2026-07-20");
  assertStringIncludes(reply, "already been reviewed");
  assertStringIncludes(reply, "coach");
});

Deno.test("declaration retroactive sur jour NON resolu — acceptee (D2)", async () => {
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame({
      payload: { local_date: "2026-07-26", kind: "family" },
    }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    read_day_resolution: (localDate) => ({
      local_date: localDate,
      resolved: false,
    }),
    write_planned_deviation: db.write,
  });
  assertEquals(result.status, "declared");
  assertEquals(result.debug.retroactive, true);
  assertEquals(db.rows.length, 1);
});

Deno.test("backdate autorise par le coach — accepte ET signale dans le ledger", async () => {
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame({
      payload: { local_date: "2026-07-20", kind: "travel" },
    }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    read_day_resolution: (localDate) => ({
      local_date: localDate,
      resolved: true,
    }),
    coach_backdate_grant: { granted: true, granted_by_coach_id: "coach-1" },
    write_planned_deviation: db.write,
  });
  assertEquals(result.status, "declared");
  assertEquals(result.committed_effects[0].coach_authorized_backdate, true);
  assertEquals(result.debug.coach_authorized_backdate, true);
  assertStringIncludes(result.reply ?? "", "coach");
});

Deno.test("l'autorisation coach est INATTEIGNABLE depuis le payload du tour", async () => {
  // « The student never grades their own paper »: ni l'eleve ni le LLM ne
  // peuvent fabriquer l'autorisation en la posant dans le payload.
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame({
      payload: {
        local_date: "2026-07-20",
        kind: "restaurant",
        coach_override: true,
        coach_authorized_backdate: true,
        coach_backdate_grant: { granted: true },
      },
    }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    read_day_resolution: (localDate) => ({
      local_date: localDate,
      resolved: true,
    }),
    write_planned_deviation: db.write,
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "retroactive_on_resolved_day");
  assertEquals(db.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Write-through / idempotence / safety
// ---------------------------------------------------------------------------

Deno.test("write-through — pas de ligne relue => failed, aucun accuse", async () => {
  const write = (() =>
    Promise.resolve({ outcome: "inserted", row: { id: "" } })) as unknown as
      PlannedDeviationWrite;
  const result = await run({
    turn_frame: turnFrame(),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: write,
  });
  assertEquals(result.status, "failed");
  assertEquals(result.debug.reason_code, "missing_readback_row");
  assertEquals(result.committed_effects, []);
});

Deno.test("write-through — une ligne relue sur le MAUVAIS jour est refusee", async () => {
  // Retirer le mauvais jour du denominateur est pire que ne rien retirer.
  const write: PlannedDeviationWrite = (input) =>
    Promise.resolve({
      outcome: "inserted",
      row: {
        id: "pd-x",
        user_id: input.user_id,
        plan_version_id: input.plan_version_id,
        local_date: "2026-08-02",
        slot_key: input.slot_key,
        kind: input.kind,
        declared_via: input.declared_via,
        consumed_flex: input.consumed_flex,
      },
    });
  const result = await run({
    turn_frame: turnFrame(),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: write,
  });
  assertEquals(result.status, "failed");
  assertEquals(result.debug.reason_code, "readback_mismatch");
});

Deno.test("idempotence — redeclarer le meme jour/slot/kind n'ajoute pas de ligne", async () => {
  const db = fakeDb();
  const first = await run({
    turn_frame: turnFrame({ source_message_id: "m1" }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  const second = await run({
    turn_frame: turnFrame({ source_message_id: "m2" }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  assertEquals(first.status, "declared");
  assertEquals(second.status, "declared");
  assertEquals(db.rows.length, 1);
  assertEquals(second.committed_effects[0].already_declared, true);
  assertStringIncludes(second.reply ?? "", "Already noted");
});

Deno.test("safety — bande >= medium bloque, et rien n'atteint la base", async () => {
  for (const band of ["medium", "high", "critical"] as RiskBand[]) {
    const db = fakeDb();
    const result = await run({
      turn_frame: turnFrame({ risk_band: band }),
      plan_version_id: PLAN_VERSION,
      content_locale: "en-GB",
      write_planned_deviation: db.write,
    });
    assertEquals(result.status, "blocked", band);
    assertEquals(result.debug.reason_code, "safety_high", band);
    assertEquals(db.calls.length, 0, band);
  }
});

Deno.test("safety — en crise, le refus est celui de la safety, pas une lecon sur le flex", async () => {
  // Ordre du router: gate AVANT regle d'avance. Un eleve en crise qui parle
  // d'un jour deja resolu ne recoit pas un discours sur les regles du flex.
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame({
      risk_band: "high",
      payload: { local_date: "2026-07-20", kind: "other" },
    }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    read_day_resolution: (localDate) => ({
      local_date: localDate,
      resolved: true,
    }),
    write_planned_deviation: db.write,
  });
  assertEquals(result.debug.reason_code, "safety_high");
  assertEquals(db.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Intake: ce qui est refuse plutot que devine
// ---------------------------------------------------------------------------

Deno.test("intake — sans plan publie, il n'y a pas de flex a depenser", async () => {
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame(),
    plan_version_id: null,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.debug.reason_code, "missing_plan_version");
  assertEquals(db.calls.length, 0);
});

Deno.test("intake — un jour en langage naturel n'est PAS resolu ici", async () => {
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame({
      payload: { local_date: "friday", kind: "restaurant" },
    }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  assertEquals(result.status, "needs_clarify");
  assertEquals(result.debug.reason_code, "missing_local_date");
  assertEquals(db.calls.length, 0);
});

Deno.test("intake — sans date, la declaration porte sur AUJOURD'HUI", async () => {
  const db = fakeDb();
  const result = await run({
    turn_frame: turnFrame({ payload: { kind: "social" } }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  assertEquals(result.status, "declared");
  assertEquals(result.committed_effects[0].local_date, "2026-07-27");
});

Deno.test("intake — un kind inconnu echoue (R7); un kind absent tombe sur 'other'", async () => {
  const db = fakeDb();
  const unknown = await run({
    turn_frame: turnFrame({
      payload: { local_date: "2026-07-31", kind: "hangover" },
    }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  assertEquals(unknown.debug.reason_code, "unknown_token");
  assertEquals(db.calls.length, 0);

  const missing = await run({
    turn_frame: turnFrame({ payload: { local_date: "2026-07-31" } }),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  assertEquals(missing.status, "declared");
  assertEquals(missing.committed_effects[0].kind, "other");
});

Deno.test("ceinture anti-phantom — 'declared' sans ligne est retrograde", () => {
  const phantom = enforceDeclareDeviationReplyInvariant({
    detected: true,
    status: "declared",
    reply: "Noted.",
    executed_tools: ["declare_deviation"],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    debug: { reason_code: "declared" },
  });
  assertEquals(phantom.status, "failed");
  assertEquals(phantom.reply, null);
});

Deno.test("tool — surface publique", async () => {
  const db = fakeDb();
  const outcome = await runDeclareDeviation({
    turn_frame: turnFrame(),
    plan_version_id: PLAN_VERSION,
    content_locale: "en-GB",
    write_planned_deviation: db.write,
  });
  assert(outcome.detected && outcome.status === "declared");
  assertEquals(outcome.planned_deviation_id, "pd-1");
  assertEquals(outcome.local_date, "2026-07-31");
  assertEquals(outcome.coach_authorized_backdate, false);
});
