/// <reference path="../../tsserver-shims.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

type TrackProgressArgs = {
  target_name: string;
  value: number;
  operation: "add" | "set";
  status?: "completed" | "missed" | "partial";
  date?: string; // YYYY-MM-DD (optional)
};

/**
 * Shared tracking handler used by multiple agents.
 *
 * Writes:
 * - `user_action_entries` (+ updates `user_actions` aggregate when relevant)
 * - `user_vital_sign_entries` (+ updates `user_vital_signs` aggregate)
 *
 * Returns:
 * - Normal string for agent to use as a hint.
 * - A string prefixed with `INFO_POUR_AGENT:` when nothing could be matched (avoid claiming "c'est noté").
 */
export async function handleTracking(
  supabase: SupabaseClient,
  userId: string,
  args: TrackProgressArgs,
): Promise<string> {
  const { target_name, value, operation, status, date } = args;
  const searchTerm = target_name.trim();
  const entryStatus = status || "completed";
  const day = (date && date.trim()) || new Date().toISOString().split("T")[0];

  // 1) Actions (plan)
  const { data: actions, error: actionsError } = await supabase
    .from("user_actions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "pending"])
    .ilike("title", `%${searchTerm}%`)
    .limit(1);

  if (actionsError) {
    console.error("[Tracking] Error fetching actions:", actionsError);
  }

  if (actions && actions.length > 0) {
    const action = actions[0] as any;
    const lastPerformedDay = action.last_performed_at ? String(action.last_performed_at).split("T")[0] : null;

    let newReps = action.current_reps || 0;
    const trackingType = action.tracking_type || "boolean";

    // Update reps only when completed/partial
    if (entryStatus === "completed" || entryStatus === "partial") {
      if (trackingType === "boolean") {
        if (operation === "add" || operation === "set") {
          if (lastPerformedDay === day && operation === "add") {
            // Already done today -> avoid double-counting + duplicate history noise
            return `C'est noté, mais je vois que tu avais déjà validé "${action.title}" aujourd'hui. Je laisse validé ! ✅`;
          }
          newReps = Math.max(newReps + 1, 1);
        }
      } else {
        if (operation === "add") newReps += value;
        else if (operation === "set") newReps = value;
      }
    } else if (entryStatus === "missed") {
      // Avoid duplicate "missed" entries on the same day
      const { data: existingMissed, error: missedError } = await supabase
        .from("user_action_entries")
        .select("id")
        .eq("user_id", userId)
        .eq("action_id", action.id)
        .eq("status", "missed")
        .gte("performed_at", `${day}T00:00:00`)
        .limit(1);

      if (missedError) console.error("[Tracking] Error checking missed entries:", missedError);
      if (existingMissed && existingMissed.length > 0) {
        return `Je sais, c'est déjà noté comme raté pour aujourd'hui. T'inquiète pas. 📉`;
      }
    }

    // A) Update aggregate
    if (entryStatus === "completed") {
      const { error: updateError } = await supabase
        .from("user_actions")
        .update({
          current_reps: newReps,
          last_performed_at: new Date().toISOString(),
        })
        .eq("id", action.id);

      if (updateError) console.error("[Tracking] Error updating action aggregate:", updateError);
    }

    // B) Insert history entry
    const performedAt = new Date().toISOString();
    const { error: entryError } = await supabase.from("user_action_entries").insert({
      user_id: userId,
      action_id: action.id,
      action_title: action.title,
      status: entryStatus,
      value,
      performed_at: performedAt,
    });

    if (entryError) console.error("[Tracking] Error inserting action entry:", entryError);

    if (entryStatus === "missed") return `C'est noté (Pas fait). 📉\nAction : ${action.title}`;
    return `C'est noté ! ✅\nAction : ${action.title}`;
  }

  // 2) Vital signs
  const { data: vitalSigns, error: vitalsError } = await supabase
    .from("user_vital_signs")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .ilike("label", `%${searchTerm}%`)
    .limit(1);

  if (vitalsError) console.error("[Tracking] Error fetching vital signs:", vitalsError);

  if (vitalSigns && vitalSigns.length > 0) {
    const sign = vitalSigns[0] as any;
    let newValue = parseFloat(sign.current_value) || 0;
    if (operation === "add") newValue += value;
    else if (operation === "set") newValue = value;

    const { error: updateError } = await supabase
      .from("user_vital_signs")
      .update({
        current_value: String(newValue),
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", sign.id);
    if (updateError) console.error("[Tracking] Error updating vital aggregate:", updateError);

    const { error: insertError } = await supabase.from("user_vital_sign_entries").insert({
      user_id: userId,
      vital_sign_id: sign.id,
      plan_id: sign.plan_id,
      submission_id: sign.submission_id,
      value: String(newValue),
      recorded_at: new Date().toISOString(),
    });
    if (insertError) console.error("[Tracking] Error inserting vital entry:", insertError);

    return `C'est enregistré. 📊 (${sign.label} : ${newValue} ${sign.unit || ""})`;
  }

  return `INFO_POUR_AGENT: Je ne trouve pas "${target_name}" dans le plan actif (Actions ou Signes Vitaux). Contente-toi de féliciter ou discuter, sans dire "C'est noté".`;
}


