import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { normalizeAttackKeyword } from "../../../../_shared/attack_keyword.ts";
import {
  ATTACK_TECHNIQUES,
  type AttackCardDraftV1,
} from "./generator.ts";

async function ensureOperationCycle(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string> {
  const { data: existing, error: selectError } = await args.supabase
    .from("user_cycles")
    .select("id")
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return String(existing.id);

  const { data: inserted, error: insertError } = await args.supabase
    .from("user_cycles")
    .insert({
      user_id: args.userId,
      status: "draft",
      raw_intake_text: "Conversation web Sophia - operation hors plan",
      intake_language: "fr",
      duration_months: null,
    } as any)
    .select("id")
    .single();
  if (insertError) throw insertError;
  return String(inserted.id);
}

export type InsertAttackCardCommit = {
  attack_card_id: string;
};

export async function insertAttackCardFromDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  draft: AttackCardDraftV1;
  operationId?: string | null;
  sourceMessageId?: string | null;
  requestId?: string | null;
  target?: {
    plan_item_id?: string | null;
    kind?: "plan_item" | "personal_action";
    title?: string | null;
  } | null;
}): Promise<{ data: InsertAttackCardCommit | null; error: any | null }> {
  const cycleId = await ensureOperationCycle({
    supabase: args.supabase,
    userId: args.userId,
  });
  const targetTitle = args.target?.title ?? args.draft.draft.target_label;
  const planItemId = args.target?.plan_item_id ?? null;
  const techniqueDefinition = ATTACK_TECHNIQUES[args.draft.draft.technique];
  const generatedResult = {
    output_title: args.draft.draft.title,
    generated_asset: args.draft.draft.generated_asset ??
      args.draft.draft.instruction,
    supporting_points: args.draft.draft.supporting_points ?? [],
    mode_emploi: args.draft.draft.mode_emploi ??
      techniqueDefinition.mode_emploi,
    generated_at: new Date().toISOString(),
    keyword_trigger: args.draft.draft.technique === "pre_engagement"
      ? {
        activation_keyword: args.draft.draft.activation_keyword ?? "",
        activation_keyword_normalized: normalizeAttackKeyword(
          args.draft.draft.activation_keyword ?? "",
        ),
        risk_situation: targetTitle,
        strength_anchor: args.draft.draft.why_it_helps,
        first_response_intent: args.draft.draft.instruction,
        assistant_prompt:
          `L'utilisateur a envoye le mot de bascule pour ${targetTitle}. Aide-le a revenir au premier geste.`,
      }
      : null,
  };
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
      summary: `Carte d'attaque pour ${targetTitle}.`,
      operation_draft: args.draft.draft,
      techniques: [{
        technique_key: args.draft.draft.technique,
        title: args.draft.draft.technique_title ?? techniqueDefinition.title,
        pour_quoi: args.draft.draft.why_it_helps ??
          techniqueDefinition.pour_quoi,
        objet_genere: techniqueDefinition.objet_genere,
        questions: [],
        mode_emploi: args.draft.draft.mode_emploi ??
          techniqueDefinition.mode_emploi,
        generated_result: generatedResult,
      }],
    },
    metadata: {
      source: "sophia_brain_tool_skill",
      operation_type: "prepare_attack_card",
      operation_id: args.operationId ?? null,
      source_message_id: args.sourceMessageId ?? null,
      request_id: args.requestId ?? null,
      target: args.target ?? null,
      draft: args.draft,
    },
    generated_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
  } as any;

  const { data, error } = await args.supabase
    .from("user_attack_cards")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data?.id) return { data: null, error };

  if (planItemId) {
    const { error: planItemUpdateError } = await args.supabase
      .from("user_plan_items")
      .update({
        attack_card_id: data.id,
        cards_status: "ready",
        cards_generated_at: new Date().toISOString(),
      } as any)
      .eq("id", planItemId)
      .eq("user_id", args.userId);
    if (planItemUpdateError) return { data: null, error: planItemUpdateError };
  }

  return { data: { attack_card_id: String(data.id) }, error: null };
}
