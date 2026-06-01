import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { ActiveTransformationRuntime } from "../../../_shared/v2-runtime.ts";
import { createTrackProgressPlanItemWrite } from "../../tools/always_on/track_progress_plan_item/db.ts";
import { runTrackProgressPlanItemFromWeeklyCorrection } from "../../tools/always_on/track_progress_plan_item/router.ts";
import {
  resolveWeeklyForgottenProgressCandidate
    as resolveWeeklyForgottenProgressCandidateFromBridge,
  resolveWeeklyForgottenProgressCandidates
    as resolveWeeklyForgottenProgressCandidatesFromBridge,
  weeklyAdaptiveReviewStateForTurn,
} from "../../tools/operations/adjust_plan_item/weekly_bridge.ts";

export const resolveWeeklyForgottenProgressCandidate =
  resolveWeeklyForgottenProgressCandidateFromBridge;
export const resolveWeeklyForgottenProgressCandidates =
  resolveWeeklyForgottenProgressCandidatesFromBridge;

export function weeklyForgottenProgressHasClearTarget(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
  userMessage: string;
}): boolean {
  const candidate = resolveWeeklyForgottenProgressCandidateFromBridge(args);
  return Boolean(
    candidate.detected && candidate.ready && candidate.plan_item_id,
  );
}

export async function maybeLogWeeklyForgottenProgressParallel(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: any;
  activeSkillState?: unknown;
  v2Runtime?: ActiveTransformationRuntime | null;
  loggedMessageId: string | null;
  userMessage: string;
}): Promise<{
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
  toolSkillRun?: Record<string, unknown>;
}> {
  const multiCandidates = resolveWeeklyForgottenProgressCandidatesFromBridge({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
    userMessage: args.userMessage,
  });
  const candidate = resolveWeeklyForgottenProgressCandidateFromBridge({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
    userMessage: args.userMessage,
  });
  if (!candidate.detected) {
    return { toolExecution: "none", executedTools: [] };
  }

  const alreadyLogged =
    (args.tempMemory as any)?.__weekly_forgotten_progress?.source_message_id &&
    args.loggedMessageId &&
    (args.tempMemory as any).__weekly_forgotten_progress.source_message_id ===
      args.loggedMessageId;
  if (alreadyLogged) return { toolExecution: "none", executedTools: [] };
  const weeklyProgressWrite = createTrackProgressPlanItemWrite({
    supabase: args.supabase,
    userId: args.userId,
    source: "weekly_adaptive_review_v1",
    sourceMessageId: args.loggedMessageId ?? null,
    runtime: args.v2Runtime,
  });

  const readyMultiCandidates = multiCandidates.filter((item) =>
    item.ready && item.plan_item_id && item.count
  );
  if (multiCandidates.length >= 2 && readyMultiCandidates.length < 2) {
    (args.tempMemory as any).__weekly_forgotten_progress = {
      mode: "incomplete",
      reason_code: "ambiguous_multi_action_dates",
      items: multiCandidates.map((item) => ({
        title: item.title ?? null,
        count: item.count ?? null,
        reason_code: item.reason_code,
      })),
      source_message_id: args.loggedMessageId ?? null,
      updated_at: new Date().toISOString(),
    };
    return { toolExecution: "none", executedTools: [] };
  }
  if (readyMultiCandidates.length >= 2) {
    try {
      const loggedItems: Array<{
        plan_item_id: string;
        title: string;
        count: number;
        date_hint: string | null;
        date_hints?: string[];
      }> = [];
      const committedEffects: unknown[] = [];
      const requestedEffects: unknown[] = [];
      const allowedEffects: unknown[] = [];
      for (const item of readyMultiCandidates) {
        const dateHints = Array.isArray(item.date_hints) ? item.date_hints : [];
        const effectiveCount = dateHints.length > 1 &&
            (!item.count || item.count < dateHints.length)
          ? dateHints.length
          : item.count ?? 1;
        let resultTarget = item.title ?? item.plan_item_id!;
        if (dateHints.length > 1 && dateHints.length === effectiveCount) {
          for (const dateHint of dateHints) {
            const result = await runTrackProgressPlanItemFromWeeklyCorrection({
              user_id: args.userId,
              target_item_id: item.plan_item_id!,
              target_title: item.title ?? item.plan_item_id!,
              progress_status: "completed",
              value: 1,
              date_hint: dateHint,
              source_message_id: args.loggedMessageId ??
                "weekly_forgotten_progress",
              write_progress: weeklyProgressWrite,
            });
            if (result.status === "logged") {
              requestedEffects.push(...result.requested_effects);
              allowedEffects.push(...result.allowed_effects);
              committedEffects.push(...result.committed_effects);
              resultTarget = result.committed_effects[0]?.target_title ??
                resultTarget;
            }
          }
        } else {
          const result = await runTrackProgressPlanItemFromWeeklyCorrection({
            user_id: args.userId,
            target_item_id: item.plan_item_id!,
            target_title: item.title ?? item.plan_item_id!,
            progress_status: "completed",
            value: effectiveCount,
            date_hint: item.date_hint ?? null,
            source_message_id: args.loggedMessageId ??
              "weekly_forgotten_progress",
            write_progress: weeklyProgressWrite,
          });
          if (result.status !== "logged") continue;
          requestedEffects.push(...result.requested_effects);
          allowedEffects.push(...result.allowed_effects);
          committedEffects.push(...result.committed_effects);
          resultTarget = result.committed_effects[0]?.target_title ??
            resultTarget;
        }
        loggedItems.push({
          plan_item_id: item.plan_item_id!,
          title: item.title ?? resultTarget,
          count: effectiveCount,
          date_hint: item.date_hint ?? null,
          date_hints: dateHints,
        });
      }
      if (loggedItems.length >= 2) {
        (args.tempMemory as any).__weekly_forgotten_progress = {
          mode: "logged_multi",
          items: loggedItems,
          source_message_id: args.loggedMessageId ?? null,
          updated_at: new Date().toISOString(),
        };
        const activeWeeklyState = weeklyAdaptiveReviewStateForTurn({
          activeSkillState: args.activeSkillState,
          tempMemory: args.tempMemory,
        });
        if (activeWeeklyState && typeof activeWeeklyState === "object") {
          (activeWeeklyState as any).forgotten_progress_slots = {
            status: "logged_multi",
            items: loggedItems,
            source_message_id: args.loggedMessageId ?? null,
            updated_at: new Date().toISOString(),
          };
        }
        return {
          toolExecution: "success",
          executedTools: committedEffects.length > 0
            ? ["track_progress_plan_item"]
            : [],
          toolSkillRun: {
            selected_handler: "track_progress_plan_item",
            status: "logged",
            reason_code: "weekly_forgotten_progress_logged_multi",
            requested_effects: requestedEffects,
            allowed_effects: allowedEffects,
            committed_effects: committedEffects,
            blocked_effects: [],
          },
        };
      }
    } catch (error) {
      console.warn(
        "[Router] weekly forgotten progress multi-log failed (non-blocking):",
        error,
      );
    }
  }

  if (!candidate.ready || !candidate.plan_item_id || !candidate.count) {
    (args.tempMemory as any).__weekly_forgotten_progress = {
      mode: "incomplete",
      reason_code: candidate.reason_code,
      title: candidate.title ?? null,
      source_message_id: args.loggedMessageId ?? null,
      updated_at: new Date().toISOString(),
    };
    return { toolExecution: "none", executedTools: [] };
  }

  try {
    const result = await runTrackProgressPlanItemFromWeeklyCorrection({
      user_id: args.userId,
      target_item_id: candidate.plan_item_id,
      target_title: candidate.title ?? candidate.plan_item_id,
      progress_status: "completed",
      value: candidate.count,
      date_hint: candidate.date_hint ?? null,
      source_message_id: args.loggedMessageId ?? "weekly_forgotten_progress",
      write_progress: weeklyProgressWrite,
    });

    if (result.status !== "logged") {
      (args.tempMemory as any).__weekly_forgotten_progress = {
        mode: "needs_clarify",
        reason_code: result.debug.reason_code,
        plan_item_id: candidate.plan_item_id,
        title: candidate.title ?? candidate.plan_item_id,
        count: candidate.count,
        source_message_id: args.loggedMessageId ?? null,
        updated_at: new Date().toISOString(),
      };
      return {
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "track_progress_plan_item",
          status: result.status,
          reason_code: result.debug.reason_code,
          requested_effects: result.requested_effects,
          allowed_effects: result.allowed_effects,
          committed_effects: [],
          blocked_effects: result.blocked_effects,
        },
      };
    }

    (args.tempMemory as any).__weekly_forgotten_progress = {
      mode: "logged",
      plan_item_id: candidate.plan_item_id,
      title: candidate.title ?? result.committed_effects[0]?.target_title ??
        candidate.plan_item_id,
      count: candidate.count,
      date_hint: candidate.date_hint ?? null,
      source_message_id: args.loggedMessageId ?? null,
      updated_at: new Date().toISOString(),
    };
    const activeWeeklyState = weeklyAdaptiveReviewStateForTurn({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
    });
    if (activeWeeklyState && typeof activeWeeklyState === "object") {
      (activeWeeklyState as any).forgotten_progress_slots = {
        status: "logged",
        plan_item_id: candidate.plan_item_id,
        title: candidate.title ?? result.committed_effects[0]?.target_title ??
          candidate.plan_item_id,
        repetitions_to_add: candidate.count,
        date_hint: candidate.date_hint ?? null,
        source_message_id: args.loggedMessageId ?? null,
        updated_at: new Date().toISOString(),
      };
    }
    return {
      toolExecution: "success",
      executedTools: result.committed_effects.length > 0
        ? ["track_progress_plan_item"]
        : [],
      toolSkillRun: {
        selected_handler: "track_progress_plan_item",
        status: "logged",
        reason_code: result.debug.reason_code,
        requested_effects: result.requested_effects,
        allowed_effects: result.allowed_effects,
        committed_effects: result.committed_effects,
        blocked_effects: result.blocked_effects,
      },
    };
  } catch (error) {
    console.warn(
      "[Router] weekly forgotten progress log failed (non-blocking):",
      error,
    );
    (args.tempMemory as any).__weekly_forgotten_progress = {
      mode: "failed",
      reason_code: error instanceof Error ? error.message : String(error),
      plan_item_id: candidate.plan_item_id,
      title: candidate.title ?? null,
      count: candidate.count,
      source_message_id: args.loggedMessageId ?? null,
      updated_at: new Date().toISOString(),
    };
    return {
      toolExecution: "failed",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "track_progress_plan_item",
        status: "failed",
        reason_code: error instanceof Error ? error.message : String(error),
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        failed_effects: [{
          type: "track_progress_plan_item",
          reason_code: error instanceof Error ? error.message : String(error),
        }],
      },
    };
  }
}
