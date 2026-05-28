/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AgentMode } from "../state-manager.ts";
import { updateUserState } from "../state-manager.ts";
import { runSentry, type SentryFlowContext } from "../agents/sentry.ts";
import { getActiveSafetySentryFlow } from "../supervisor.ts";
import { runCompanion } from "../agents/companion.ts";
import { runRoadmapReview } from "../agents/roadmap_review.ts";
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
  blockSideEffects?: boolean;
  clientNowIso?: string | null;
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
  outageFallback: boolean;
  outageFailedMode: AgentMode | null;
  outageErrorMessage: string | null;
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
  let outageFallback = false;
  let outageFailedMode: AgentMode | null = null;
  let outageErrorMessage: string | null = null;

  const computeToolAck = (): ToolAckContract =>
    buildToolAckContract({ status: toolExecution, executedTools });

  // Forced bilan stop on explicit stop / boredom.
  {
    const activeSentryFlow = getActiveSafetySentryFlow(tempMemory);
    const shouldForceStop = checkupActive && stopCheckup && !activeSentryFlow;
    if (shouldForceStop) {
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
        responseContent: "Pas de souci, on reprend avec le fil principal.",
        nextMode: "companion",
        tempMemory: tm1,
        toolExecution,
        executedTools,
        toolAck: computeToolAck(),
        outageFallback,
        outageFailedMode,
        outageErrorMessage,
      };
    }
  }

  const effectiveMode: AgentMode = targetMode;

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
        outageFallback = true;
        outageFailedMode = "sentry";
        outageErrorMessage = String((e as any)?.message ?? e ?? "unknown").slice(0, 240);
      }
      break;
    }

    case "roadmap_review": {
      try {
        const roadmapMeta = (opts as any)?.roadmapContext ?? null;
        if (roadmapMeta?.cycleId) {
          const out = await runRoadmapReview(
            supabase,
            userId,
            userMessage,
            history,
            context,
            {
              cycleId: roadmapMeta.cycleId,
              transformations: roadmapMeta.transformations ?? [],
              isFirstOnboarding: roadmapMeta.isFirstOnboarding ?? true,
              previousTransformation: roadmapMeta.previousTransformation ?? null,
            },
            { ...(meta ?? {}), model: sophiaChatModel },
          );
          responseContent = out.text;
          executedTools = out.executed_tools ?? [];
          toolExecution = out.tool_execution === "success"
            ? "success"
            : out.tool_execution === "error"
              ? "failed"
              : "none";
        } else {
          console.warn("[Router] roadmap_review: no cycleId in context, falling back to companion");
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
          nextMode = "companion";
        }
      } catch (e) {
        console.error("[Router] roadmap_review failed:", e);
        responseContent = outageTemplate;
        outageFallback = true;
        outageFailedMode = "roadmap_review";
        outageErrorMessage = String((e as any)?.message ?? e ?? "unknown").slice(0, 240);
      }
      if (nextMode !== "companion") nextMode = "roadmap_review";
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
        tempMemory = out.temp_memory ?? tempMemory;
        executedTools = out.executed_tools ?? [];
        toolExecution = out.tool_execution ?? "none";
      } catch (e) {
        console.error("[Router] companion failed:", e);
        responseContent = outageTemplate;
        outageFallback = true;
        outageFailedMode = "companion";
        outageErrorMessage = String((e as any)?.message ?? e ?? "unknown").slice(0, 240);
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
    outageFallback,
    outageFailedMode,
    outageErrorMessage,
  };
}
