/// <reference path="../../tsserver-shims.d.ts" />
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

type TrackProgressArgs = {
  target_name: string;
  value: number;
  operation: "add" | "set";
  status?: "completed" | "missed" | "partial";
  date?: string; // YYYY-MM-DD (optional)
};

type TrackProgressOpts = {
  // Where the tracking signal originated (helps for debugging downstream).
  // Examples: "chat" | "whatsapp" | "web".
  source?: string;
};

/**
 * Shared tracking handler used by multiple agents.
 *
 * Writes:
 * - `user_action_entries` (+ updates `user_actions` aggregate when relevant)
 * - `user_framework_entries` (+ updates `user_framework_tracking` aggregate when relevant)
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
  opts?: TrackProgressOpts,
): Promise<string> {
  const { target_name, value, operation, status, date } = args;
  const searchTerm = target_name.trim();
  const entryStatus = status || "completed";
  const day = (date && date.trim()) || new Date().toISOString().split("T")[0];
  const src = (opts?.source ?? "").trim() || "chat";

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
    const isHabit = String(action.type ?? "") === "habit";

    let prevReps = Number(action.current_reps || 0);
    const trackingType = action.tracking_type || "boolean";

    // Weekly semantics for habits: target_reps = frequency per ISO week (in user's timezone).
    if (isHabit) {
      try {
        const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
        const tz = String((profile as any)?.timezone ?? "").trim() || "Europe/Paris";
        const ymdInTz = (d: Date) =>
          new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        const isoWeekStartYmd = (d: Date) => {
          const [y, m, dd] = ymdInTz(d).split("-").map(Number);
          const dt = new Date(Date.UTC(y, (m ?? 1) - 1, dd ?? 1));
          const isoDayIndex = (dt.getUTCDay() + 6) % 7;
          dt.setUTCDate(dt.getUTCDate() - isoDayIndex);
          return dt.toISOString().split("T")[0];
        };
        const now = new Date();
        const weekNow = isoWeekStartYmd(now);
        const weekLast = action.last_performed_at ? isoWeekStartYmd(new Date(action.last_performed_at)) : null;
        if (!weekLast || weekLast !== weekNow) prevReps = 0;
      } catch (e) {
        console.error("[Tracking] weekly habit reset check failed:", e);
      }
    }

    let newReps = prevReps;

    // Update reps only when completed/partial
    if (entryStatus === "completed" || entryStatus === "partial") {
      if (trackingType === "boolean") {
        if (operation === "add" || operation === "set") {
          // Missions: avoid double-counting if already done today.
          // Habits: allow multiple in the same day (they are weekly frequency, not "once per day").
          if (!isHabit && lastPerformedDay === day && (operation === "add" || operation === "set")) {
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
    if (isHabit) {
      const target = Number(action.target_reps ?? 1);
      if (target > 0 && prevReps < target && newReps >= target) {
        return `Bravo ! Tu viens d'atteindre ton objectif hebdo (${target}×/semaine) pour : ${action.title} ✅`;
      }
      return `C'est noté ! ✅\nHabitude : ${action.title} (${newReps}/${target} cette semaine)`;
    }
    return `C'est noté ! ✅\nAction : ${action.title}`;
  }

  // 2) Frameworks (exercices / journaling) — stored separately in DB
  const { data: frameworks, error: frameworksError } = await supabase
    .from("user_framework_tracking")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "pending"])
    .ilike("title", `%${searchTerm}%`)
    .limit(1);

  if (frameworksError) console.error("[Tracking] Error fetching frameworks:", frameworksError);

  if (frameworks && frameworks.length > 0) {
    const fw = frameworks[0] as any;
    const lastPerformedDay = fw.last_performed_at ? String(fw.last_performed_at).split("T")[0] : null;
    const nowIso = new Date().toISOString();

    // Avoid double-counting "completed" when already logged today (best effort).
    if ((entryStatus === "completed" || entryStatus === "partial") && lastPerformedDay === day && operation === "add") {
      return `C'est noté, mais je vois que tu avais déjà validé "${fw.title}" aujourd'hui. Je laisse validé ! ✅`;
    }

    // Update aggregate (best effort)
    if (entryStatus === "completed" || entryStatus === "partial") {
      const curr = Number(fw.current_reps ?? 0);
      const next = operation === "set" ? Math.max(curr, 1) : (curr + 1);
      const { error: updateFwErr } = await supabase
        .from("user_framework_tracking")
        .update({ current_reps: next, last_performed_at: nowIso })
        .eq("id", fw.id);
      if (updateFwErr) console.error("[Tracking] Error updating framework aggregate:", updateFwErr);
    }

    // Insert entry (best effort)
    const { error: fwEntryErr } = await supabase.from("user_framework_entries").insert({
      user_id: userId,
      plan_id: fw.plan_id ?? null,
      action_id: fw.action_id,
      framework_title: fw.title,
      framework_type: fw.type ?? "unknown",
      content: { status: entryStatus, note: null, from: src },
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (fwEntryErr) console.error("[Tracking] Error inserting framework entry:", fwEntryErr);

    if (entryStatus === "missed") return `Je note (pas fait). 📉\nExercice : ${fw.title}`;
    return `C'est noté ! ✅\nExercice : ${fw.title}`;
  }

  // 3) Vital signs
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

  return `INFO_POUR_AGENT: Je ne trouve pas "${target_name}" dans le plan actif (Actions / Frameworks / Signes Vitaux). Contente-toi de féliciter ou discuter, sans dire "C'est noté".`;
}


