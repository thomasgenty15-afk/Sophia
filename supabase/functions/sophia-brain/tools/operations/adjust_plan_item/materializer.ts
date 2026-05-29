/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";

// Effects/materialization for adjust_plan_item. This module owns DB writes for confirmed plan patches.
const FRENCH_SMALL_NUMBERS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
};

function extractWeeklyTargetReps(text: string): number | null {
  const normalized = text.toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  const digitMatch = normalized.match(
    /\b([1-7])\s*(?:jours?|fois|x)\s*(?:\/|par|dans la)?\s*(?:semaine)?\b/,
  );
  if (digitMatch?.[1]) return Number(digitMatch[1]);
  const wordMatch = normalized.match(
    /\b(un|une|deux|trois|quatre|cinq|six|sept)\s*(?:jours?|fois|x)\s*(?:\/|par|dans la)?\s*(?:semaine)?\b/,
  );
  return wordMatch?.[1] ? FRENCH_SMALL_NUMBERS[wordMatch[1]] ?? null : null;
}

function extractSimpleInstruction(text: string): string | null {
  const normalizedWhitespace = text.replace(/\s+/g, " ").trim();
  const phraseMatch = normalizedWhitespace.match(
    /\bune\s+phrase\s+[^,.;]+/i,
  );
  if (phraseMatch?.[0]) return phraseMatch[0].trim();
  const barePhraseMatch = normalizedWhitespace.match(
    /\bphrase\s+(neutre|simple|courte|facile|tr[eè]s simple)\b/i,
  );
  if (barePhraseMatch?.[0]) return barePhraseMatch[0].trim();
  const merciMatch = normalizedWhitespace.match(/\bun\s+merci\s+[^,.;]+/i);
  return merciMatch?.[0] ? merciMatch[0].trim() : null;
}

const FRENCH_WEEKDAY_TO_CODE: Record<string, string> = {
  lundi: "mon",
  mardi: "tue",
  mercredi: "wed",
  jeudi: "thu",
  vendredi: "fri",
  samedi: "sat",
  dimanche: "sun",
};

function extractScheduledDaysFromFrenchText(text: string): string[] {
  const normalized = text.toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  return Object.entries(FRENCH_WEEKDAY_TO_CODE)
    .filter(([day]) => new RegExp(`\\b${day}\\b`).test(normalized))
    .map(([, code]) => code);
}

function extractConcreteActionTitle(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/deconnexion\s+de\s+7\s+minutes/i.test(normalized)) {
    return "Deconnexion de 7 minutes apres le diner";
  }
  if (/phrase\s+de\s+sortie/i.test(normalized)) return "Phrase de sortie";
  return null;
}

function asksForFreeTiming(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  return [
    "sans creneau",
    "sans creneau fixe",
    "sans creneau impose",
    "sans contrainte de creneau",
    "pas de creneau",
    "moment libre",
    "horaire libre",
    "sans horaire",
    "sans horaire fixe",
    "sans contrainte d'horaire",
    "sans contrainte horaire",
    "quand ca se presente",
    "naturellement",
  ].some((marker) => normalized.includes(marker));
}

function materializationTextForChangedItem(args: {
  draft: PlanAdjustmentDraftV1;
  change: any;
  patch: Record<string, unknown>;
}): string {
  return [
    args.change?.after,
    args.draft.draft.proposed_change,
    args.patch.instruction,
    args.patch.cadence_label,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function buildLevelMaterializedItemUpdate(args: {
  item: { kind?: string | null; dimension?: string | null };
  change: {
    capability?: unknown;
    after?: unknown;
  };
}): Record<string, unknown> {
  const capability = String(args.change?.capability ?? "").trim();
  const after = String(args.change?.after ?? "").trim();
  const update: Record<string, unknown> = {};
  if (capability === "modify_existing_action") {
    if (!after) throw new Error("level_action_after_missing");
    const title = extractConcreteActionTitle(after);
    if (title) update.title = title;
    update.description = after;
    const scheduledDays = extractScheduledDaysFromFrenchText(after);
    if (scheduledDays.length > 0) update.scheduled_days = scheduledDays;
    if (asksForFreeTiming(after)) update.time_of_day = "anytime";
    return update;
  }
  if (capability !== "change_action_frequency") return update;

  const targetReps = extractWeeklyTargetReps(after);
  if (targetReps == null) {
    throw new Error("level_frequency_target_reps_missing");
  }
  update.target_reps = targetReps;
  update.cadence_label = `${targetReps} jours / semaine`;

  const instruction = extractSimpleInstruction(after);
  if (instruction) update.description = instruction;
  const scheduledDays = extractScheduledDaysFromFrenchText(after);
  if (scheduledDays.length > 0) update.scheduled_days = scheduledDays;
  if (asksForFreeTiming(after)) update.time_of_day = "anytime";
  return update;
}

function planAdjustmentRegenerationFeedback(
  draft: PlanAdjustmentDraftV1,
): string {
  const result = draft.draft.adjust_plan_result;
  const changedItems = result?.applied_change?.changed_items ?? [];
  const preservedItems = result?.applied_change?.preserved_items ?? [];
  const trajectory = result?.applied_change?.trajectory_change ?? null;
  return [
    result?.user_message_detailed
      ? `Résumé pour le user de ce qui change: ${result.user_message_detailed}`
      : null,
    trajectory
      ? `Trajectoire confirmée:\n- Avant: ${
        String((trajectory as any).before ?? "").trim()
      }\n- Après: ${
        String((trajectory as any).after ?? "").trim()
      }\n- Étape ajoutée ou réordonnée: ${
        String((trajectory as any).inserted_step ?? "").trim() ||
        ((trajectory as any).reordered_steps ?? []).join(", ")
      }\n- Direction préservée: ${
        String((trajectory as any).preserved_direction ?? "").trim()
      }\n- Raison coaching: ${
        String((trajectory as any).coaching_reason ?? "").trim()
      }`
      : null,
    draft.draft.decision_basis?.user_problem
      ? `Problème identifié: ${draft.draft.decision_basis.user_problem}`
      : null,
    draft.draft.change_rationale?.why_this_change
      ? `Raison de l'ajustement: ${draft.draft.change_rationale.why_this_change}`
      : null,
    changedItems.length
      ? `Changements confirmés:\n${
        changedItems.map((item: any) =>
          `- ${String(item.title ?? "item").trim()}: ${
            String(item.before ?? "").trim() || "avant non précisé"
          } -> ${String(item.after ?? "").trim()}`
        ).join("\n")
      }`
      : null,
    preservedItems.length
      ? `À préserver:\n${
        preservedItems.map((item: any) =>
          `- ${String(item.title ?? "item").trim()}: ${
            String(item.reason ?? "").trim()
          }`
        ).join("\n")
      }`
      : null,
  ].filter((entry): entry is string => Boolean(entry?.trim())).join("\n\n");
}

export type AdjustedPlanRegenerationResult = {
  plan_id: string;
  roadmap_changed: boolean;
};

export async function writePlanAdjustmentPatch(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: PlanAdjustmentDraftV1;
  operationInput?: Record<string, unknown> | null;
  operationId?: string | null;
  requestId?: string | null;
  sourceMessageId?: string | null;
  regenerateAdjustedPlan?: (input: {
    transformationId: string;
    scopeKind: "current_level" | "whole_plan";
    feedback: string;
    reason: string;
    userChangeSummary: string | null;
    assistantMessage: string | null;
  }) => Promise<AdjustedPlanRegenerationResult>;
}): Promise<{
  plan_patch_id: string;
  bridge_plan_item_id?: string | null;
  adjusted_plan_id?: string | null;
  roadmap_changed?: boolean;
}> {
  const scope = (args.operationInput?.scope as any) ?? null;
  const planItemId = String(scope?.plan_item_id ?? "").trim();
  const patchId = crypto.randomUUID();
  const patch = args.draft.draft.patch;
  const nowIso = new Date().toISOString();
  const materializedPlanItemIds = [
    ...new Set(
      (args.draft.draft.adjust_plan_result?.applied_change?.changed_items ?? [])
        .filter((item: any) =>
          (item?.kind === "action" || item?.kind === "habit" ||
            item?.kind === "task") &&
          typeof item?.id === "string" &&
          item.id.trim().length > 0
        )
        .map((item: any) => String(item.id).trim()),
    ),
  ];
  const materializedChangedItems =
    args.draft.draft.adjust_plan_result?.applied_change?.changed_items ?? [];
  const materializedChangeById = new Map(
    materializedChangedItems
      .filter((item: any) =>
        typeof item?.id === "string" && item.id.trim().length > 0
      )
      .map((item: any) => [String(item.id).trim(), item]),
  );
  const materializedChangesById = new Map<string, any[]>();
  for (const item of materializedChangedItems as any[]) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    materializedChangesById.set(id, [
      ...(materializedChangesById.get(id) ?? []),
      item,
    ]);
  }

  const insertAdjustmentSnapshot = async (
    payload: Record<string, unknown>,
  ): Promise<void> => {
    const row = {
      user_id: args.userId,
      snapshot_type: "plan_adjustment_patch",
      payload: {
        kind: "plan_adjustment_patch",
        ...payload,
      },
    };
    const { error } = await args.supabase
      .from("system_runtime_snapshots")
      .insert(row as any);
    if (!error) return;

    const message = JSON.stringify(error).toLowerCase();
    const code = String((error as any)?.code ?? "").trim();
    if (code !== "23514" && !message.includes("snapshot_type")) {
      throw new Error(`plan_adjustment_snapshot_insert_failed:${message}`);
    }

    const { error: fallbackError } = await args.supabase
      .from("system_runtime_snapshots")
      .insert({
        ...row,
        snapshot_type: "plan_generated_v2",
        payload: {
          ...row.payload,
          storage_fallback: "plan_generated_v2",
        },
      } as any);
    if (fallbackError) {
      throw new Error(
        `plan_adjustment_snapshot_fallback_failed:${
          JSON.stringify(fallbackError)
        }`,
      );
    }
  };

  if (!planItemId) {
    const scopeKind = String(scope?.kind ?? "").trim();
    if (scopeKind && scopeKind !== "specific_plan_item") {
      const patchConstraints = Array.isArray((patch as any)?.constraints)
        ? (patch as any).constraints.map((constraint: unknown) =>
          String(constraint ?? "").trim()
        ).filter(Boolean)
        : [];
      const singleAffectedLevelAdjustment = scopeKind === "current_level" &&
        patchConstraints.includes("strict_affected_items_only") &&
        (patchConstraints.filter((constraint: string) =>
              constraint.startsWith("affected_item:")
            ).length === 1 || materializedPlanItemIds.length === 1);
      const copyForwardLevelAdjustment = scopeKind === "current_level" &&
        (
          patchConstraints.includes("extend_current_level_same_plan") ||
          patchConstraints.includes("copy_forward_level_one_week") ||
          patchConstraints.includes("preserve_action_content") ||
          patchConstraints.includes("preserve_cadence")
        );
      const requiredMaterializedItems = singleAffectedLevelAdjustment ? 1 : 2;
      if (materializedPlanItemIds.length < requiredMaterializedItems) {
        throw new Error(`${scopeKind}_materialized_items_missing`);
      }
      const { data: materializedItems, error: materializedSelectError } =
        await args.supabase
          .from("user_plan_items")
          .select(
            "id,user_id,cycle_id,transformation_id,plan_id,dimension,kind,status,title,description,tracking_type,activation_order,activation_condition,current_habit_state,support_mode,support_function,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,start_after_item_id,phase_id,phase_order,cards_status,payload",
          )
          .eq("user_id", args.userId)
          .in("id", materializedPlanItemIds);
      if (materializedSelectError) throw materializedSelectError;
      if (
        !Array.isArray(materializedItems) ||
        materializedItems.length !== materializedPlanItemIds.length
      ) {
        throw new Error(`${scopeKind}_materialized_items_not_found`);
      }
      if (
        (materializedItems as Array<{ dimension?: string | null }>).some((
          item,
        ) => String(item.dimension ?? "").trim() === "clarifications")
      ) {
        throw new Error("clarification_items_read_only");
      }
      const adjustmentRecord = {
        plan_patch_id: patchId,
        operation_id: args.operationId ?? null,
        request_id: args.requestId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        applied_at: nowIso,
        affected_scope: scopeKind,
        draft: args.draft.draft,
        patch,
      };
      const supportedLevelCapabilities = new Set([
        "modify_existing_action",
        "change_action_frequency",
        "pause_action",
        "remove_action_from_level",
        "create_bridge_action",
      ]);
      for (const itemId of materializedPlanItemIds) {
        const changes = materializedChangesById.get(itemId) ?? [];
        for (const change of changes) {
          const capability = String(change?.capability ?? "").trim();
          if (!supportedLevelCapabilities.has(capability)) {
            throw new Error(
              `level_capability_not_materializable:${capability}`,
            );
          }
        }
      }
      type MaterializedPlanItem = {
        id: string;
        user_id?: string;
        cycle_id?: string | null;
        transformation_id?: string | null;
        plan_id?: string | null;
        dimension?: string | null;
        kind?: string | null;
        status?: string | null;
        title?: string | null;
        description?: string | null;
        tracking_type?: string | null;
        activation_order?: number | null;
        activation_condition?: unknown;
        current_habit_state?: string | null;
        support_mode?: string | null;
        support_function?: string | null;
        target_reps?: number | null;
        current_reps?: number | null;
        cadence_label?: string | null;
        scheduled_days?: unknown;
        time_of_day?: string | null;
        start_after_item_id?: string | null;
        phase_id?: string | null;
        phase_order?: number | null;
        cards_status?: string | null;
        payload?: unknown;
      };
      const rollbackPlanItem = async (item: MaterializedPlanItem) => {
        const rollbackPatch = {
          dimension: item.dimension,
          kind: item.kind,
          status: item.status,
          title: item.title,
          description: item.description,
          tracking_type: item.tracking_type,
          activation_order: item.activation_order,
          activation_condition: item.activation_condition,
          current_habit_state: item.current_habit_state,
          support_mode: item.support_mode,
          support_function: item.support_function,
          target_reps: item.target_reps,
          current_reps: item.current_reps,
          cadence_label: item.cadence_label,
          scheduled_days: item.scheduled_days,
          time_of_day: item.time_of_day,
          start_after_item_id: item.start_after_item_id,
          phase_id: item.phase_id,
          phase_order: item.phase_order,
          cards_status: item.cards_status,
          payload: item.payload,
        };
        await args.supabase
          .from("user_plan_items")
          .update(rollbackPatch as any)
          .eq("id", item.id)
          .eq("user_id", args.userId);
      };
      const createdBridgeIds: string[] = [];
      let adjustedPlanResult: AdjustedPlanRegenerationResult | null = null;
      try {
        for (const item of materializedItems as MaterializedPlanItem[]) {
          const changes = materializedChangesById.get(item.id) ?? [];
          const capabilities = changes.map((change) =>
            String(change?.capability ?? "").trim()
          ).filter(Boolean);
          const currentPayload = item.payload &&
              typeof item.payload === "object"
            ? item.payload as Record<string, unknown>
            : {};
          const previousAdjustments = Array.isArray(
              (currentPayload as any).operation_adjustments,
            )
            ? (currentPayload as any).operation_adjustments
            : [];
          const itemUpdate: Record<string, unknown> = {
            payload: {
              ...currentPayload,
              active_operation_adjustment: adjustmentRecord,
              operation_adjustments: [
                ...previousAdjustments,
                adjustmentRecord,
              ].slice(-10),
            },
            updated_at: nowIso,
          };
          for (const change of changes) {
            const capability = String(change?.capability ?? "").trim();
            if (
              !copyForwardLevelAdjustment &&
              (capability === "modify_existing_action" ||
                capability === "change_action_frequency")
            ) {
              Object.assign(
                itemUpdate,
                buildLevelMaterializedItemUpdate({ item, change }),
              );
            }
          }
          if (
            capabilities.includes("pause_action") ||
            capabilities.includes("remove_action_from_level")
          ) {
            itemUpdate.status = capabilities.includes("pause_action")
              ? "in_maintenance"
              : "deactivated";
          }
          if (capabilities.includes("create_bridge_action")) {
            const change = changes.find((candidate) =>
              String(candidate?.capability ?? "").trim() ===
                "create_bridge_action"
            );
            const bridgeId = crypto.randomUUID();
            const bridgeTitle = `Version mini - ${
              String(item.title ?? "action").trim() || "action"
            }`;
            const bridgeDescription = String(change?.after ?? "").trim() ||
              `Action pont vers "${
                String(item.title ?? "l'action initiale")
              }".`;
            const bridgePayload = {
              ...currentPayload,
              operation_bridge: {
                kind: "level_reduction_bridge",
                source_plan_item_id: item.id,
                plan_patch_id: patchId,
                operation_id: args.operationId ?? null,
                request_id: args.requestId ?? null,
                source_message_id: args.sourceMessageId ?? null,
                created_at: nowIso,
                patch,
                resume_original_after_completion: true,
              },
              active_operation_adjustment: adjustmentRecord,
            };
            const { error: bridgeInsertError } = await args.supabase
              .from("user_plan_items")
              .insert({
                id: bridgeId,
                user_id: args.userId,
                cycle_id: item.cycle_id,
                transformation_id: item.transformation_id,
                plan_id: item.plan_id,
                dimension: item.dimension,
                kind: item.kind,
                status: "active",
                title: bridgeTitle,
                description: bridgeDescription,
                tracking_type: item.tracking_type,
                activation_order: item.activation_order,
                activation_condition: item.activation_condition,
                current_habit_state: item.current_habit_state,
                support_mode: item.support_mode,
                support_function: item.support_function,
                target_reps: item.kind === "habit" ? 1 : null,
                current_reps: item.kind === "habit" ? 0 : null,
                cadence_label: item.kind === "habit" ? "1 fois" : null,
                scheduled_days: null,
                time_of_day: item.time_of_day,
                start_after_item_id: item.start_after_item_id,
                phase_id: item.phase_id,
                phase_order: item.phase_order,
                cards_status: ["missions", "habits"].includes(
                    String(item.dimension),
                  )
                  ? "not_started"
                  : "not_required",
                payload: bridgePayload,
                activated_at: nowIso,
                updated_at: nowIso,
              } as any);
            if (bridgeInsertError) {
              throw new Error(
                `plan_adjustment_bridge_insert_failed:${
                  JSON.stringify(bridgeInsertError)
                }`,
              );
            }
            createdBridgeIds.push(bridgeId);
            itemUpdate.status = "pending";
            itemUpdate.start_after_item_id = bridgeId;
            itemUpdate.payload = {
              ...currentPayload,
              deferred_by_operation_bridge: {
                plan_patch_id: patchId,
                operation_id: args.operationId ?? null,
                request_id: args.requestId ?? null,
                source_message_id: args.sourceMessageId ?? null,
                deferred_at: nowIso,
                bridge_plan_item_id: bridgeId,
                reason: "level_adjustment_bridge_created",
                patch,
              },
              operation_adjustments: [
                ...previousAdjustments,
                adjustmentRecord,
              ].slice(-10),
            };
          }
          const { error: itemUpdateError } = await args.supabase
            .from("user_plan_items")
            .update(itemUpdate as any)
            .eq("id", item.id)
            .eq("user_id", args.userId);
          if (itemUpdateError) {
            throw new Error(
              `plan_adjustment_item_update_failed:${
                JSON.stringify(itemUpdateError)
              }`,
            );
          }
        }
        const transformationId = String(
          (materializedItems as MaterializedPlanItem[]).find((item) =>
            String(item.transformation_id ?? "").trim()
          )?.transformation_id ?? "",
        ).trim();
        if (
          args.regenerateAdjustedPlan &&
          !copyForwardLevelAdjustment &&
          !singleAffectedLevelAdjustment &&
          (scopeKind === "current_level" || scopeKind === "whole_plan") &&
          transformationId
        ) {
          adjustedPlanResult = await args.regenerateAdjustedPlan({
            transformationId,
            scopeKind,
            feedback: planAdjustmentRegenerationFeedback(args.draft),
            reason: String(
              args.draft.draft.decision_basis?.user_problem ??
                args.draft.draft.change_rationale?.why_this_change ??
                args.draft.draft.proposed_change ??
                "Ajustement confirmé depuis le chat.",
            ).trim(),
            userChangeSummary:
              args.draft.draft.adjust_plan_result?.user_message_brief ??
                args.draft.draft.proposed_change ?? null,
            assistantMessage: args.draft.confirmation_message ?? null,
          });
        }
        await insertAdjustmentSnapshot({
          plan_patch_id: patchId,
          operation_id: args.operationId ?? null,
          request_id: args.requestId ?? null,
          source_message_id: args.sourceMessageId ?? null,
          draft: args.draft,
          patch,
          scope,
          applied: true,
          affected_scope: scopeKind,
          materialized_plan_item_ids: materializedPlanItemIds,
          adjusted_plan_id: adjustedPlanResult?.plan_id ?? null,
          roadmap_changed: adjustedPlanResult?.roadmap_changed ?? null,
          reason: "non_item_scope_plan_adjustment",
          created_at: nowIso,
        });
      } catch (error) {
        for (const bridgeId of createdBridgeIds) {
          await args.supabase
            .from("user_plan_items")
            .delete()
            .eq("id", bridgeId)
            .eq("user_id", args.userId);
        }
        for (const item of materializedItems as MaterializedPlanItem[]) {
          await rollbackPlanItem(item);
        }
        throw error;
      }
      return {
        plan_patch_id: patchId,
        adjusted_plan_id: adjustedPlanResult?.plan_id ?? null,
        roadmap_changed: adjustedPlanResult?.roadmap_changed ?? false,
      };
    }
    await insertAdjustmentSnapshot({
      plan_patch_id: patchId,
      operation_id: args.operationId ?? null,
      request_id: args.requestId ?? null,
      source_message_id: args.sourceMessageId ?? null,
      draft: args.draft,
      patch,
      scope,
      applied: false,
      reason: "missing_plan_item_id",
      created_at: nowIso,
    });
    return { plan_patch_id: patchId };
  }

  const { data: item, error: selectError } = await args.supabase
    .from("user_plan_items")
    .select(
      "id,user_id,cycle_id,transformation_id,plan_id,dimension,kind,status,title,description,tracking_type,activation_order,activation_condition,current_habit_state,support_mode,support_function,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,start_after_item_id,phase_id,phase_order,cards_status,payload",
    )
    .eq("id", planItemId)
    .eq("user_id", args.userId)
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!item?.id) throw new Error("plan_item_not_found_for_adjustment");
  if (String((item as any).dimension ?? "").trim() === "clarifications") {
    throw new Error("clarification_items_read_only");
  }

  const currentPayload = item.payload && typeof item.payload === "object"
    ? item.payload as Record<string, unknown>
    : {};
  const previousAdjustments = Array.isArray(
      (currentPayload as any).operation_adjustments,
    )
    ? (currentPayload as any).operation_adjustments
    : [];
  const adjustmentRecord = {
    plan_patch_id: patchId,
    operation_id: args.operationId ?? null,
    request_id: args.requestId ?? null,
    source_message_id: args.sourceMessageId ?? null,
    applied_at: nowIso,
    draft: args.draft.draft,
    patch,
  };
  if (
    args.draft.draft.adjustment_type === "reduce" &&
    args.draft.draft.execution_strategy === "bridge_action"
  ) {
    const bridgeId = crypto.randomUUID();
    const bridgeAction = args.draft.draft.bridge_action;
    const bridgeTitle = String(bridgeAction?.title ?? "").trim() ||
      `Version mini - ${String((item as any).title ?? "action")}`;
    const bridgeDescription = String(bridgeAction?.description ?? "").trim() ||
      `Action pont vers "${
        String((item as any).title ?? "l'action initiale")
      }" : faire une version de 5 minutes avant de reprendre l'action initiale.`;
    const sourcePayload = currentPayload;
    const bridgePayload = {
      ...sourcePayload,
      operation_bridge: {
        kind: "reduction_bridge",
        source_plan_item_id: planItemId,
        plan_patch_id: patchId,
        operation_id: args.operationId ?? null,
        request_id: args.requestId ?? null,
        source_message_id: args.sourceMessageId ?? null,
        created_at: nowIso,
        patch,
        resume_original_after_completion:
          bridgeAction?.resume_original_after_completion ?? true,
      },
      active_operation_adjustment: adjustmentRecord,
    };
    const bridgeInsert: Record<string, unknown> = {
      id: bridgeId,
      user_id: args.userId,
      cycle_id: (item as any).cycle_id,
      transformation_id: (item as any).transformation_id,
      plan_id: (item as any).plan_id,
      dimension: (item as any).dimension,
      kind: (item as any).kind,
      status: "active",
      title: bridgeTitle,
      description: bridgeDescription,
      tracking_type: (item as any).tracking_type,
      activation_order: (item as any).activation_order,
      activation_condition: (item as any).activation_condition,
      current_habit_state: (item as any).current_habit_state,
      support_mode: (item as any).support_mode,
      support_function: (item as any).support_function,
      target_reps: (item as any).kind === "habit" ? 1 : null,
      current_reps: (item as any).kind === "habit" ? 0 : null,
      cadence_label: (item as any).kind === "habit" ? "1 fois" : null,
      scheduled_days: null,
      time_of_day: (item as any).time_of_day,
      start_after_item_id: (item as any).start_after_item_id,
      phase_id: (item as any).phase_id,
      phase_order: (item as any).phase_order,
      cards_status:
        ["missions", "habits"].includes(String((item as any).dimension))
          ? "not_started"
          : "not_required",
      payload: bridgePayload,
      activated_at: nowIso,
      updated_at: nowIso,
    };
    const { error: insertError } = await args.supabase
      .from("user_plan_items")
      .insert(bridgeInsert as any);
    if (insertError) throw insertError;

    const deferredRecord = {
      plan_patch_id: patchId,
      operation_id: args.operationId ?? null,
      request_id: args.requestId ?? null,
      source_message_id: args.sourceMessageId ?? null,
      deferred_at: nowIso,
      bridge_plan_item_id: bridgeId,
      reason: "reduced_action_bridge_created",
      patch,
    };
    const { error: sourceUpdateError } = await args.supabase
      .from("user_plan_items")
      .update({
        status: "pending",
        start_after_item_id: bridgeId,
        payload: {
          ...currentPayload,
          deferred_by_operation_bridge: deferredRecord,
          operation_adjustments: [...previousAdjustments, adjustmentRecord]
            .slice(
              -10,
            ),
        },
        updated_at: nowIso,
      } as any)
      .eq("id", planItemId)
      .eq("user_id", args.userId);
    if (sourceUpdateError) throw sourceUpdateError;
    return { plan_patch_id: patchId, bridge_plan_item_id: bridgeId };
  }
  const updatePayload: Record<string, unknown> = {
    payload: {
      ...currentPayload,
      active_operation_adjustment: adjustmentRecord,
      operation_adjustments: [...previousAdjustments, adjustmentRecord].slice(
        -10,
      ),
    },
    updated_at: nowIso,
  };
  if (patch.paused === true) {
    updatePayload.status = "in_maintenance";
  }
  if (
    typeof patch.target_reps === "number" && Number.isFinite(patch.target_reps)
  ) {
    updatePayload.target_reps = patch.target_reps;
  }
  if (typeof patch.cadence_label === "string" && patch.cadence_label.trim()) {
    updatePayload.cadence_label = patch.cadence_label.trim();
  }
  if (typeof patch.instruction === "string" && patch.instruction.trim()) {
    updatePayload.description = patch.instruction.trim();
  }
  const materializedChangeForItem = materializedChangeById.get(planItemId) ??
    (materializedChangedItems.length === 1
      ? materializedChangedItems[0]
      : null);
  if (materializedChangeForItem) {
    const materializationText = materializationTextForChangedItem({
      draft: args.draft,
      change: materializedChangeForItem,
      patch: patch as Record<string, unknown>,
    });
    if (
      updatePayload.target_reps == null &&
      String((item as any).kind ?? "") === "habit"
    ) {
      const targetReps = extractWeeklyTargetReps(materializationText);
      if (targetReps != null) {
        updatePayload.target_reps = targetReps;
        updatePayload.cadence_label = `${targetReps} jours / semaine`;
      }
    }
    if (typeof updatePayload.description !== "string") {
      const instruction = extractSimpleInstruction(materializationText);
      if (instruction) updatePayload.description = instruction;
    }
    if (asksForFreeTiming(materializationText)) {
      updatePayload.time_of_day = "anytime";
    }
  }

  const { error: updateError } = await args.supabase
    .from("user_plan_items")
    .update(updatePayload as any)
    .eq("id", planItemId)
    .eq("user_id", args.userId);
  if (updateError) throw updateError;

  return { plan_patch_id: patchId };
}
