import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { DispatcherSignals } from "./dispatcher.ts";
import type { ActiveTransformationRuntime } from "../../_shared/v2-runtime.ts";
import type { DefenseCardContent } from "../../_shared/v2-types.ts";

export async function maybeLogDefenseCardWinParallel(args: {
  supabase: SupabaseClient;
  userId: string;
  dispatcherSignals: DispatcherSignals;
  v2Runtime?: ActiveTransformationRuntime | null;
  tempMemory: any;
}) {
  const { supabase, userId, dispatcherSignals, v2Runtime, tempMemory } = args;

  const signal = dispatcherSignals.defense_card_win;
  if (!signal?.detected || Number(signal.confidence ?? 0) < 0.6) return;

  const transformationId = v2Runtime?.transformation?.id ?? null;
  if (!transformationId) return;

  try {
    const { data: card } = await supabase
      .from("user_defense_cards")
      .select("id, content")
      .eq("user_id", userId)
      .eq("transformation_id", transformationId)
      .maybeSingle();

    if (!card) return;

    const content = card.content as DefenseCardContent;
    const situationHint = String(signal.situation_hint ?? "").toLowerCase()
      .trim();

    let bestImpulseId = content.impulses?.[0]?.impulse_id ?? "unknown";
    let bestTriggerId: string | null = null;

    if (situationHint && content.impulses?.length) {
      for (const imp of content.impulses) {
        if (
          imp.label.toLowerCase().includes(situationHint) ||
          situationHint.includes(imp.label.toLowerCase())
        ) {
          bestImpulseId = imp.impulse_id;
          break;
        }
        for (const trigger of imp.triggers ?? []) {
          if (
            trigger.situation.toLowerCase().includes(situationHint) ||
            situationHint.includes(trigger.situation.toLowerCase())
          ) {
            bestImpulseId = imp.impulse_id;
            bestTriggerId = trigger.trigger_id;
            break;
          }
        }
      }
    }

    const { error } = await supabase.from("user_defense_wins").insert({
      defense_card_id: card.id,
      impulse_id: bestImpulseId,
      trigger_id: bestTriggerId,
      source: "conversation",
      logged_at: new Date().toISOString(),
    });
    if (error) throw error;

    const cardSummary = content.impulses
      ?.map((impulse) =>
        `${impulse.label} (${impulse.impulse_id}): ${
          impulse.triggers?.length ?? 0
        } triggers`
      )
      .join("; ") ?? "";

    (tempMemory as any).__defense_card_win_addon = {
      ...((tempMemory as any).__defense_card_win_addon ?? {}),
      win_logged: true,
      impulse_id: bestImpulseId,
      trigger_id: bestTriggerId,
      card_summary: cardSummary.slice(0, 300),
    };
  } catch (err) {
    console.warn(
      "[Router] defense_card_win parallel log failed (non-blocking):",
      err,
    );
  }
}
