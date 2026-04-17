import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import type { ConversationPulse } from "./v2-types.ts";

export type UnlockedPrinciples = {
  kaizen: boolean;
  ikigai?: boolean;
  hara_hachi_bu?: boolean;
  wabi_sabi?: boolean;
  gambaru?: boolean;
};

export type PrincipleUnlockEvent =
  | { type: "entry_logged"; entry_kind: string }
  | {
      type: "plan_item_transitioned";
      new_status: string;
      new_habit_state: string | null;
    }
  | { type: "conversation_pulse_generated"; pulse: ConversationPulse };

const IKIGAI_KEYWORDS = [
  "pourquoi",
  "sens",
  "motivation",
  "raison",
  "purpose",
  "meaning",
  "why",
  "raison profonde",
  "ce qui me pousse",
  "envie",
  "conviction",
  "valeur",
  "important pour moi",
  "besoin fondamental",
];

function shouldUnlockIkigai(pulse: ConversationPulse): boolean {
  const wins = pulse.highlights?.wins ?? [];
  const joined = wins.join(" ").toLowerCase();
  return IKIGAI_KEYWORDS.some((kw) => joined.includes(kw));
}

function determinePrincipleToUnlock(
  current: UnlockedPrinciples,
  event: PrincipleUnlockEvent,
): keyof UnlockedPrinciples | null {
  if (event.type === "entry_logged") {
    if (
      !current.wabi_sabi &&
      (event.entry_kind === "skip" || event.entry_kind === "blocker")
    ) {
      return "wabi_sabi";
    }
  }

  if (event.type === "plan_item_transitioned") {
    if (
      !current.hara_hachi_bu &&
      (event.new_status === "in_maintenance" ||
        event.new_habit_state === "in_maintenance")
    ) {
      return "hara_hachi_bu";
    }
    if (
      !current.gambaru &&
      (event.new_status === "stalled" || event.new_habit_state === "stalled")
    ) {
      return "gambaru";
    }
  }

  if (event.type === "conversation_pulse_generated") {
    if (!current.ikigai && shouldUnlockIkigai(event.pulse)) {
      return "ikigai";
    }
  }

  return null;
}

/**
 * Checks if the given event triggers a new principle unlock and persists it.
 * Returns the updated principles if a new one was unlocked, null otherwise.
 */
export async function checkAndUnlockPrinciples(
  supabase: SupabaseClient,
  userId: string,
  transformationId: string,
  event: PrincipleUnlockEvent,
): Promise<UnlockedPrinciples | null> {
  try {
    const { data, error } = await supabase
      .from("user_transformations")
      .select("unlocked_principles")
      .eq("id", transformationId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[checkAndUnlockPrinciples] failed to load transformation:",
        error.message,
      );
      return null;
    }
    if (!data) return null;

    const current: UnlockedPrinciples = {
      kaizen: true,
      ...((data as any).unlocked_principles ?? {}),
    };

    const toUnlock = determinePrincipleToUnlock(current, event);
    if (!toUnlock) return null;

    const updated: UnlockedPrinciples = { ...current, [toUnlock]: true };

    const { error: updateError } = await supabase
      .from("user_transformations")
      .update({
        unlocked_principles: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transformationId);

    if (updateError) {
      console.warn(
        "[checkAndUnlockPrinciples] failed to update:",
        updateError.message,
      );
      return null;
    }

    console.log(
      `[checkAndUnlockPrinciples] unlocked ${toUnlock} for transformation ${transformationId}`,
    );
    return updated;
  } catch (err) {
    console.warn(
      "[checkAndUnlockPrinciples] unexpected error:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
