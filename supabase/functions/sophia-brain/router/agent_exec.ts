/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AgentMode } from "../state-manager.ts";
import { updateUserState } from "../state-manager.ts";
import { runSentry, type SentryFlowContext } from "../agents/sentry.ts";
import { runFirefighter, type FirefighterFlowContext } from "../agents/firefighter.ts";
import { getActiveSafetyFirefighterFlow, getActiveSafetySentryFlow } from "../supervisor.ts";
import { runInvestigator } from "../agents/investigator.ts";
import { logCheckupCompletion } from "../agents/investigator/db.ts";
import { computeCheckupStatsFromInvestigationState } from "../agents/investigator/checkup_stats.ts";
import { runCompanion } from "../agents/companion.ts";
import {
  buildToolAckContract,
  type ToolAckContract,
  type ToolExecutionStatus,
} from "../tool_ack.ts";

type ExecMeta = {
  requestId?: string;
  forceRealAi?: boolean;
  channel?: "web" | "whatsapp";
  model?: string;
  evalRunId?: string | null;
  forceBrainTrace?: boolean;
};

function normalizeAgentText(text: unknown): string {
  return String(text ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\*\*/g, "")
    .trim();
}

function toSentryContext(tempMemory: any): SentryFlowContext {
  const flow = getActiveSafetySentryFlow(tempMemory);
  const phaseRaw = String(flow?.phase ?? "acute");
  const phase: SentryFlowContext["phase"] =
    phaseRaw === "confirming" || phaseRaw === "resolved" ? phaseRaw : "acute";
  return {
    phase,
    turnCount: Number(flow?.turn_count ?? 0),
    safetyConfirmed: Boolean(flow?.safety_confirmed),
    externalHelpMentioned: Boolean(flow?.external_help_mentioned),
  };
}

function toFirefighterContext(tempMemory: any): FirefighterFlowContext {
  const flow = getActiveSafetyFirefighterFlow(tempMemory);
  const phaseRaw = String(flow?.phase ?? "acute");
  const phase: FirefighterFlowContext["phase"] =
    phaseRaw === "stabilizing" || phaseRaw === "confirming" || phaseRaw === "resolved"
      ? phaseRaw
      : "acute";
  return {
    phase,
    turnCount: Number(flow?.turn_count ?? 0),
    stabilizationSignals: Number(flow?.stabilization_signals ?? 0),
    distressSignals: Number(flow?.distress_signals ?? 0),
    lastTechnique: flow?.technique_used ? String(flow.technique_used) : undefined,
  };
}

export async function runAgentAndVerify(opts: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  channel: "web" | "whatsapp";
  userMessage: string;
  history: any[];
  state: any;
  context: string;
  meta?: ExecMeta;
  targetMode: AgentMode;
  nCandidates?: 1 | 3;
  checkupActive: boolean;
  stopCheckup: boolean;
  isPostCheckup: boolean;
  outageTemplate: string;
  sophiaChatModel: string;
  tempMemory?: any;
  dispatcherDeferredTopic?: string | null;
  toolResultStatusHook?: (args: {
    payload: Record<string, unknown>;
    level: "debug" | "info" | "warn" | "error";
  }) => Promise<void> | void;
}): Promise<{
  responseContent: string;
  nextMode: AgentMode;
  tempMemory?: any;
  toolExecution: ToolExecutionStatus;
  executedTools: string[];
  toolAck: ToolAckContract;
}> {
  const {
    supabase,
    userId,
    scope,
    channel,
    userMessage,
    history,
    state,
    context,
    meta,
    targetMode,
    checkupActive,
    stopCheckup,
    isPostCheckup,
    outageTemplate,
    sophiaChatModel,
  } = opts;

  let responseContent = "";
  let nextMode: AgentMode = targetMode;
  let tempMemory = opts.tempMemory ?? {};
  let executedTools: string[] = [];
  let toolExecution: ToolExecutionStatus = "none";

  const computeToolAck = (): ToolAckContract =>
    buildToolAckContract({ status: toolExecution, executedTools });

  // Forced bilan stop on explicit stop / boredom.
  {
    const activeSentryFlow = getActiveSafetySentryFlow(tempMemory);
    const activeFirefighterFlow = getActiveSafetyFirefighterFlow(tempMemory);
    const shouldForceStop = checkupActive && stopCheckup && !activeSentryFlow && !activeFirefighterFlow;
    if (shouldForceStop) {
      const invState = (state as any)?.investigation_state;
      const stats = computeCheckupStatsFromInvestigationState(invState, {
        fillUnloggedAsMissed: true,
      });

      try {
        await logCheckupCompletion(
          supabase,
          userId,
          { items: stats.items, completed: stats.completed, missed: stats.missed },
          "chat_stop",
          "partial",
        );
      } catch {
        // non-blocking
      }

      const tm0 = (state as any)?.temp_memory ?? tempMemory ?? {};
      const tm1: any = {
        ...(tm0 ?? {}),
        __flow_just_closed_aborted: true,
        __flow_just_closed_normally: false,
        __bilan_just_stopped: {
          stopped_at: new Date().toISOString(),
          reason: "interrupt_stop_or_bored",
        },
      };
      try {
        delete tm1.__flow_just_closed_normally;
      } catch {
        // best effort
      }

      await updateUserState(supabase, userId, scope, {
        investigation_state: null,
        temp_memory: tm1,
      } as any);

      return {
        responseContent: "Pas de souci, on fera le bilan demain soir.",
        nextMode: "companion",
        tempMemory: tm1,
        toolExecution,
        executedTools,
        toolAck: computeToolAck(),
      };
    }
  }

  // If an active bilan exists, investigator remains owner unless safety took over.
  const effectiveMode: AgentMode =
    checkupActive && !stopCheckup && targetMode !== "sentry" && targetMode !== "firefighter"
      ? "investigator"
      : targetMode;

  switch (effectiveMode) {
    case "sentry": {
      try {
        const flowContext = toSentryContext(tempMemory);
        responseContent = await runSentry(userMessage, { ...(meta ?? {}), model: sophiaChatModel }, flowContext);
        nextMode = "sentry";
      } catch (e) {
        console.error("[Router] sentry failed:", e);
        responseContent = outageTemplate;
        nextMode = "companion";
      }
      break;
    }

    case "firefighter": {
      try {
        const flowContext = toFirefighterContext(tempMemory);
        const firefighterResult = await runFirefighter(
          userMessage,
          history,
          context,
          { ...(meta ?? {}), model: sophiaChatModel },
          flowContext,
        );
        responseContent = firefighterResult.content;
        nextMode = "firefighter";
      } catch (e) {
        console.error("[Router] firefighter failed:", e);
        responseContent = outageTemplate;
        nextMode = "companion";
      }
      break;
    }

    case "investigator": {
      try {
        const invResult = await runInvestigator(
          supabase,
          userId,
          userMessage,
          history,
          (state as any)?.investigation_state,
          meta,
        );

        if (invResult.investigationComplete) {
          const invState = (state as any)?.investigation_state;
          const stats = computeCheckupStatsFromInvestigationState(invState, {
            fillUnloggedAsMissed: true,
          });
          try {
            await logCheckupCompletion(
              supabase,
              userId,
              {
                items: stats.items,
                completed: stats.completed,
                missed: stats.missed,
              },
              "chat",
              "full",
            );
          } catch {
            // non-blocking
          }

          const tm0 = (state as any)?.temp_memory ?? tempMemory ?? {};
          const tm1: any = {
            ...(tm0 ?? {}),
            __flow_just_closed_normally: true,
            __flow_just_closed_aborted: false,
          };

          await updateUserState(supabase, userId, scope, {
            investigation_state: null,
            temp_memory: tm1,
          } as any);

          tempMemory = tm1;
          responseContent = invResult.content;
          nextMode = "companion";
        } else {
          await updateUserState(supabase, userId, scope, {
            investigation_state: invResult.newState,
          } as any);
          responseContent = invResult.content;
          nextMode = "investigator";
        }
      } catch (e) {
        console.error("[Router] investigator failed:", e);
        responseContent = outageTemplate;
        nextMode = "companion";
      }
      break;
    }

    case "companion":
    default: {
      // Simplified runtime: everything non-safety/non-bilan goes through Companion.
      try {
        const out = await runCompanion(
          supabase,
          userId,
          scope,
          userMessage,
          history,
          state,
          context,
          { ...(meta ?? {}), model: sophiaChatModel },
        );
        responseContent = out.text;
        executedTools = out.executed_tools ?? [];
        toolExecution = out.tool_execution ?? "none";
      } catch (e) {
        console.error("[Router] companion failed:", e);
        responseContent = outageTemplate;
      }
      nextMode = "companion";
      break;
    }
  }

  // During post-checkup assistant turns, enforce phrasing consistency.
  if (isPostCheckup && responseContent) {
    responseContent = responseContent.replace(/\bbilan\s+d['’]hier\b/gi, "bilan du jour");
  }

  return {
    responseContent: normalizeAgentText(responseContent),
    nextMode,
    tempMemory,
    toolExecution,
    executedTools,
    toolAck: computeToolAck(),
  };
}
