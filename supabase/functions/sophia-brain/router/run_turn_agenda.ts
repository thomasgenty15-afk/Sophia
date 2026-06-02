/// <reference path="../../tsserver-shims.d.ts" />

import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { EffectLedger } from "./effect_ledger.ts";
import { recordAgendaEffectsInLedger } from "./effect_ledger_adapter.ts";
import {
  clearActiveToolFlow,
  clearPendingToolConfirmation,
} from "./active_flow_state.ts";
import {
  buildTurnAgenda,
  summarizeTurnAgenda,
  type TurnAgenda,
  type TurnAgendaSummary,
} from "./turn_agenda.ts";
import { resolveFlowInterruptions } from "./turn_interruption_policy.ts";
import { buildUserTurnSnapshot } from "./user_turn_snapshot.ts";

const NO_TOOL_SKILL_OPPORTUNITY: TurnFrame["tool_skill_opportunity"] = {
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

export type RunTurnAgendaIntegrationInput = {
  ledger: EffectLedger;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  timezone: string;
  tempMemory: any;
  turnFrame: TurnFrame;
  routeDecision: RouteDecision;
  activeOperationIntake: unknown | null;
  pendingOperationConfirmation: unknown | null;
  pendingOperationConfirmationForGlobalRouting: unknown | null;
};

export type RunTurnAgendaIntegrationResult = {
  tempMemory: any;
  turnFrame: TurnFrame;
  routeDecision: RouteDecision;
  activeOperationIntake: unknown | null;
  pendingOperationConfirmation: unknown | null;
  pendingOperationConfirmationForGlobalRouting: unknown | null;
  turnAgenda: TurnAgenda;
  turnAgendaSummary: TurnAgendaSummary;
  stateTempMemoryChanged: boolean;
  routeOrFrameChanged: boolean;
};

export function runTurnAgendaIntegration(
  input: RunTurnAgendaIntegrationInput,
): RunTurnAgendaIntegrationResult {
  let tempMemory = input.tempMemory;
  let turnFrame = input.turnFrame;
  let routeDecision = input.routeDecision;
  let activeOperationIntake = input.activeOperationIntake;
  let pendingOperationConfirmation = input.pendingOperationConfirmation;
  let pendingOperationConfirmationForGlobalRouting =
    input.pendingOperationConfirmationForGlobalRouting;
  let stateTempMemoryChanged = false;
  let routeOrFrameChanged = false;

  const userTurnSnapshot = buildUserTurnSnapshot({
    turn_id: turnFrame.turn_id,
    user_id: input.userId,
    source_message_id: turnFrame.source_message_id,
    message: input.userMessage,
    channel: input.channel,
    timezone: input.timezone,
    turn_frame: turnFrame,
    route_decision: routeDecision,
    temp_memory: tempMemory ?? {},
  });
  let turnAgenda = buildTurnAgenda(userTurnSnapshot);
  const agendaResolution = resolveFlowInterruptions({
    snapshot: userTurnSnapshot,
    agenda: turnAgenda,
  });
  turnAgenda = agendaResolution.agenda;

  const blockedAgendaOperations = new Set(
    turnAgenda.tasks
      .filter((task) =>
        (task.kind === "effect" || task.kind === "platform_handoff") &&
        task.status === "blocked" &&
        task.operation_type
      )
      .map((task) => String(task.operation_type)),
  );
  if (
    agendaResolution.reason_codes.length > 0 ||
    agendaResolution.clear_active_tool_flow ||
    agendaResolution.clear_pending_confirmation ||
    blockedAgendaOperations.size > 0
  ) {
    tempMemory = { ...(tempMemory ?? {}) };
    if (agendaResolution.clear_active_tool_flow) {
      tempMemory = clearActiveToolFlow(tempMemory);
      activeOperationIntake = null;
    }
    if (agendaResolution.clear_pending_confirmation) {
      tempMemory = clearPendingToolConfirmation(tempMemory);
      pendingOperationConfirmation = null;
      pendingOperationConfirmationForGlobalRouting = null;
    }
    if (
      agendaResolution.clear_active_tool_flow ||
      agendaResolution.clear_pending_confirmation
    ) {
      stateTempMemoryChanged = true;
    }
    const selectedOperation = routeDecision.response_owner === "tool_skill"
      ? String(routeDecision.selected_handler ?? "").trim()
      : "";
    const selectedOperationBlocked = selectedOperation &&
      blockedAgendaOperations.has(selectedOperation);
    const blockedPathsFromAgenda = [
      ...new Set([
        ...agendaResolution.reason_codes,
        ...turnAgenda.tasks
          .filter((task) => task.status === "blocked")
          .map((task) => task.reason_code)
          .filter(Boolean)
          .map(String),
      ]),
    ].map((reasonCode) => ({
      path: "turn_agenda",
      reason_code: reasonCode,
    }));
    routeDecision = {
      ...routeDecision,
      response_owner: selectedOperationBlocked
        ? "normal_reply"
        : routeDecision.response_owner,
      selected_handler: selectedOperationBlocked
        ? undefined
        : routeDecision.selected_handler,
      reason_code: selectedOperationBlocked
        ? "turn_agenda_blocked_selected_effect"
        : routeDecision.reason_code,
      direct_effects_to_run: routeDecision.direct_effects_to_run.filter((
        effect,
      ) => !blockedAgendaOperations.has(String(effect))),
      blocked_paths: [
        ...routeDecision.blocked_paths,
        ...blockedPathsFromAgenda,
      ],
    };
    turnFrame = {
      ...turnFrame,
      direct_effects: turnFrame.direct_effects.filter((effect) =>
        !blockedAgendaOperations.has(String(effect.effect_type))
      ),
      tool_skill_intents: turnFrame.tool_skill_intents.filter((intent) =>
        !blockedAgendaOperations.has(String(intent.operation_type))
      ),
      tool_skill_opportunity: selectedOperationBlocked
        ? NO_TOOL_SKILL_OPPORTUNITY
        : turnFrame.tool_skill_opportunity,
    };
    routeOrFrameChanged = true;
  }

  recordAgendaEffectsInLedger({ ledger: input.ledger, agenda: turnAgenda });
  const turnAgendaSummary = summarizeTurnAgenda(turnAgenda, userTurnSnapshot);

  return {
    tempMemory,
    turnFrame,
    routeDecision,
    activeOperationIntake,
    pendingOperationConfirmation,
    pendingOperationConfirmationForGlobalRouting,
    turnAgenda,
    turnAgendaSummary,
    stateTempMemoryChanged,
    routeOrFrameChanged,
  };
}
