/**
 * KEEL W4.3 — the chain for `log_protocol_event`:
 *
 *   intake -> gate -> executor -> ledger -> renderer
 *
 * Non-negotiable ordering (CONTRACT, "execution truth"):
 *  - the GATE runs before the executor, always, and its safety verdict is not
 *    a suggestion. `p4-safety-deferred-gate-leak` in this repo is exactly the
 *    failure of a local branch that reached a write while the gate said
 *    blocked; there is no local branch here — one call site, one executor;
 *  - the LEDGER is filled from what actually happened at each stage
 *    (`requested` / `allowed` / `committed` / `blocked`), so the counts can be
 *    compared afterwards. A requested effect that is not in `committed` is
 *    visibly absent instead of quietly acknowledged;
 *  - the RENDERER is called with the committed effect only, and the reply
 *    invariant is re-asserted on the final object.
 */

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { SlotKey } from "../../../../_shared/keel/tokens.ts";
import { runDirectEffectGate } from "../../../routers/direct_effect_gate.ts";
import type {
  LogProtocolEventCommittedEffect,
  LogProtocolEventDirectEffectResult,
  LogProtocolEventRequestedEffect,
  ProtocolEventSource,
  ProtocolEventWrite,
} from "./contract.ts";
import { executeLogProtocolEventWrite } from "./executor.ts";
import { runLogProtocolEventIntake } from "./intake.ts";
import {
  enforceLogProtocolEventReplyInvariant,
  renderLogProtocolEventLoggedReply,
  renderLogProtocolEventRefusal,
} from "./renderer.ts";

export type LogProtocolEventRouterInput = {
  turn_frame: TurnFrame;
  /** R2/R3: persisted conversation_locale of the thread. */
  content_locale: string | null | undefined;
  default_source?: ProtocolEventSource;
  /**
   * Le créneau NOMMÉ par l'élève dans son message (repli déterministe quand le
   * modèle ne l'émet pas — mesuré 0/3). Voir `_shared/keel/slot_from_message.ts`.
   */
  slot_named_in_message?: SlotKey | null;
  /**
   * The day's plan line ids — the allow-list for an EXPLICIT binding. It must
   * be the same set the dispatcher was shown (`context/keel_plan_context.ts`),
   * otherwise the model can name a line the runtime then refuses. Omitted or
   * empty = no binding is verifiable this turn, and a payload carrying one is
   * refused (`unknown_commitment`) rather than written unchecked.
   */
  allowed_commitment_ids?: readonly string[] | null;
  /**
   * Les identités déjà écrites pour ce repas, quand ce tour RÉPOND à une
   * question de précision. Voir `intake.ts`: c'est le seul point où le doublon
   * « réponse qui re-cite le repas » peut encore être évité, l'index unique
   * étant dérivé du message et le message de réponse n'étant pas celui de la
   * déclaration.
   */
  suppress_component_keys?: readonly string[] | null;
  /** La ligne d'origine à laquelle rattacher un composant ajouté. */
  precision_answer_to?: string | null;
  recent_writes_idempotency?: { source_message_ids: string[] };
  db_idempotency_check?: (key: string) => Promise<boolean>;
  write_protocol_event: ProtocolEventWrite;
};

function emptyResult(
  reasonCode: string,
): LogProtocolEventDirectEffectResult {
  return {
    detected: false,
    status: "ignored",
    reply: null,
    executed_tools: [],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    debug: { reason_code: reasonCode },
  };
}

function refusal(args: {
  status: "needs_clarify" | "blocked" | "failed";
  reason_code: string;
  requested: LogProtocolEventRequestedEffect[];
  allowed?: LogProtocolEventRequestedEffect[];
  gate_reason?: string | null;
  token_issue?: string | null;
}): LogProtocolEventDirectEffectResult {
  return {
    detected: true,
    status: args.status,
    reply: renderLogProtocolEventRefusal(args.reason_code, args.token_issue),
    executed_tools: [],
    requested_effects: args.requested,
    allowed_effects: args.allowed ?? [],
    committed_effects: [],
    blocked_effects: [{
      type: "log_protocol_event",
      reason_code: args.reason_code,
    }],
    debug: {
      reason_code: args.reason_code,
      gate_reason: args.gate_reason ?? null,
      token_issue: args.token_issue ?? null,
    },
  };
}

export async function runLogProtocolEventDirectEffect(
  input: LogProtocolEventRouterInput,
): Promise<LogProtocolEventDirectEffectResult> {
  // --- intake -------------------------------------------------------------
  const intake = runLogProtocolEventIntake({
    turn_frame: input.turn_frame,
    content_locale: input.content_locale,
    default_source: input.default_source,
    slot_named_in_message: input.slot_named_in_message ?? null,
    allowed_commitment_ids: input.allowed_commitment_ids,
    suppress_component_keys: input.suppress_component_keys,
    precision_answer_to: input.precision_answer_to,
  });
  if (!intake.detected) return emptyResult(intake.reason_code);
  if (
    intake.detected && !intake.ok &&
    intake.reason_code === "components_already_logged"
  ) {
    // TOUT était déjà écrit: la réponse à la question de précision a re-cité le
    // repas qu'elle précisait. Ce n'est ni une erreur ni un refus — l'amendement
    // porte déjà la parole de l'élève, et il n'y a RIEN à lui dire.
    //
    // `status: "ignored"` et `reply: null`, donc: une phrase de refus ici
    // ferait passer un non-événement pour un problème. Le ledger, lui, le porte
    // en `blocked_effects` — la comptabilité reste vraie même quand la surface
    // se tait.
    return {
      detected: true,
      status: "ignored",
      reply: null,
      executed_tools: [],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "log_protocol_event",
        reason_code: "components_already_logged",
      }],
      debug: { reason_code: "components_already_logged" },
    };
  }
  if (!intake.ok) {
    // The refusal is NAMED and visible in the ledger. Note that a malformed
    // payload is refused BEFORE the gate: there is nothing coherent to gate,
    // and inventing a well-formed request to feed the gate would be the
    // silent-normalization bug R7 exists to forbid.
    return refusal({
      status: intake.reason_code === "unknown_token" ||
          intake.reason_code === "unknown_commitment" ||
          intake.reason_code === "too_many_components" ||
          intake.reason_code === "empty_payload"
        ? "needs_clarify"
        : "blocked",
      reason_code: intake.reason_code,
      requested: [],
      token_issue: intake.token_issue,
    });
  }
  const requestedEffects = intake.requested_effects;

  // --- gate ---------------------------------------------------------------
  const gate = await runDirectEffectGate({
    effect_type: "log_protocol_event",
    turn_frame: input.turn_frame,
    recent_writes_idempotency: input.recent_writes_idempotency ??
      { source_message_ids: [] },
    db_idempotency_check: input.db_idempotency_check ??
      ((_key: string) => Promise.resolve(false)),
  });
  if (gate.decision !== "allow") {
    return refusal({
      status: gate.decision === "needs_clarify" ? "needs_clarify" : "blocked",
      reason_code: gate.reason_code,
      requested: requestedEffects,
      gate_reason: gate.reason_code,
    });
  }

  // --- executor -----------------------------------------------------------
  // ONE GATE DECISION, N WRITES. The gate judges the TURN (safety band,
  // explicitness, idempotence of the message); the executor judges each ROW.
  // Calling the gate per component would ask the same question N times and
  // invite N different answers on one message — and the gate's own idempotence
  // key is the message, so the second call would report the first as a
  // duplicate of itself.
  const committed: LogProtocolEventCommittedEffect[] = [];
  const failures: Array<{ type: string; reason_code: string }> = [];
  for (const requested of requestedEffects) {
    const execution = await executeLogProtocolEventWrite({
      requested_effect: requested,
      user_id: input.turn_frame.user_id,
      write_protocol_event: input.write_protocol_event,
    });
    if (execution.status === "committed") {
      committed.push(execution.committed_effect);
    } else {
      failures.push({
        type: "log_protocol_event",
        reason_code: execution.reason_code,
      });
    }
  }

  if (committed.length === 0) {
    // Failed write: allowed but not committed. The ledger shows the gap; the
    // reply says nothing was recorded.
    return refusal({
      status: "failed",
      reason_code: failures[0]?.reason_code ?? "write_failed",
      requested: requestedEffects,
      allowed: requestedEffects,
    });
  }

  // R3 — la langue de l'accusé. `content_locale` porte ici la
  // `conversation_locale` du fil (voir son commentaire sur l'entrée), donc
  // c'est bien la langue de la RÉPONSE, pas celle d'une ligne stockée.
  const replyLocale = String(input.content_locale ?? "en-US").trim() || "en-US";

  // --- ledger + renderer --------------------------------------------------
  // PARTIAL FAN-OUT IS SAID, NOT SMOOTHED: the rows that failed stay in
  // `blocked_effects`, and the reply names only the rows that exist. A turn
  // that wrote 1 of 2 must not read like a turn that wrote 2 — that is the
  // whole `fanout-reminder-phantom-commit` lesson.
  return enforceLogProtocolEventReplyInvariant({
    detected: true,
    status: "logged",
    reply: renderLogProtocolEventLoggedReply(
      committed,
      replyLocale,
    ),
    executed_tools: ["log_protocol_event"],
    requested_effects: requestedEffects,
    allowed_effects: requestedEffects,
    committed_effects: committed,
    blocked_effects: failures,
    debug: {
      reason_code: failures.length > 0 ? "logged_partial" : "logged",
      gate_reason: null,
      token_issue: null,
    },
  }, replyLocale);
}
