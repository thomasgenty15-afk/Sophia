import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { ensureToolOperationCycle } from "../_shared/operation_cycle.ts";
import type { DefenseCardDraftV1 } from "./generator.ts";

export type DefenseCardAttachment = {
  plan_item_id?: string | null;
  kind?:
    | "plan_item"
    | "personal_action"
    | "free_risk_context"
    | "recurring_context";
  title?: string | null;
};

export async function writeDefenseCardFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: DefenseCardDraftV1;
  operationId?: string | null;
  sourceMessageId?: string | null;
  requestId?: string | null;
  attachment?: DefenseCardAttachment | null;
  riskSituation?: { label?: string | null } | null;
}): Promise<{ defense_card_id: string }> {
  const cycleId = await ensureToolOperationCycle({
    supabase: args.supabase,
    userId: args.userId,
  });
  const planItemId = args.attachment?.kind === "plan_item"
    ? args.attachment?.plan_item_id ?? null
    : null;
  const triggerId = crypto.randomUUID();
  const impulseId = crypto.randomUUID();
  const payload = {
    user_id: args.userId,
    cycle_id: cycleId,
    transformation_id: null,
    plan_item_id: planItemId,
    phase_id: null,
    scope_kind: planItemId ? "transformation" : "out_of_plan",
    source: "system",
    status: "active",
    content: {
      impulses: [
        {
          impulse_id: impulseId,
          label: args.draft.draft.impulse_label || args.draft.draft.title,
          generic_defense: args.draft.draft.generic_defense ||
            args.draft.draft.defense_response,
          triggers: [
            {
              trigger_id: triggerId,
              label: args.draft.draft.title,
              difficulty_preview: args.draft.draft.why_it_helps || null,
              illustration: null,
              situation: args.draft.draft.situation,
              signal: args.draft.draft.signal,
              defense_response: args.draft.draft.defense_response,
              plan_b: args.draft.draft.plan_b,
            },
          ],
        },
      ],
      difficulty_map_summary: null,
    },
    metadata: {
      source: "sophia_brain_tool_skill",
      operation_type: "prepare_defense_card",
      operation_id: args.operationId ?? null,
      source_message_id: args.sourceMessageId ?? null,
      request_id: args.requestId ?? null,
      attachment: args.attachment ?? null,
      risk_situation: args.riskSituation ?? null,
      draft: args.draft,
    },
    generated_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
  } as any;

  const { data, error } = await args.supabase
    .from("user_defense_cards")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data?.id) throw error ?? new Error("missing_inserted_id");

  if (planItemId) {
    const { error: planItemUpdateError } = await args.supabase
      .from("user_plan_items")
      .update({
        defense_card_id: data.id,
        cards_status: "ready",
        cards_generated_at: new Date().toISOString(),
      } as any)
      .eq("id", planItemId)
      .eq("user_id", args.userId);
    if (planItemUpdateError) throw planItemUpdateError;
  }

  return { defense_card_id: String(data.id) };
}
