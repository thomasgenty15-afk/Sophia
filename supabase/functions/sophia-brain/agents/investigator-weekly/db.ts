import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import type { WeeklyInvestigationState } from "./types.ts";

function uniqText(items: string[]): string[] {
  return [...new Set(items.map((x) => String(x ?? "").trim()).filter(Boolean))];
}

function extractDecisionBullets(text: string): string[] {
  const out: string[] = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(?:[-•\d\).]+)\s+(.{4,200})$/);
    if (!m) continue;
    out.push(m[1].trim());
  }
  return uniqText(out).slice(0, 6);
}

export async function persistWeeklyRecap(params: {
  supabase: SupabaseClient;
  userId: string;
  state: WeeklyInvestigationState;
  closingMessage?: string;
}): Promise<{ weekStart: string; decisions: string[] }> {
  const { supabase, userId, state } = params;
  const payload = state.weekly_payload;

  const weekStart = String(payload?.week_start ?? "").trim();
  if (!weekStart) {
    throw new Error("persistWeeklyRecap: missing week_start");
  }

  const draftDecisions = Array.isArray(state?.weekly_recap_draft?.decisions_next_week)
    ? state.weekly_recap_draft.decisions_next_week
    : [];
  const msgDecisions = extractDecisionBullets(String(params.closingMessage ?? ""));
  const decisions = uniqText([...draftDecisions, ...msgDecisions]).slice(0, 6);

  const coachNoteRaw = String(state?.weekly_recap_draft?.coach_note ?? "").trim();
  const coachNote = coachNoteRaw.length > 0 ? coachNoteRaw.slice(0, 1200) : null;

  const row = {
    user_id: userId,
    week_start: weekStart,
    execution: payload.execution ?? {},
    etoile_polaire: payload.etoile_polaire ?? {},
    action_load: payload.action_load ?? {},
    decisions_next_week: decisions,
    coach_note: coachNote,
    raw_summary: String(params.closingMessage ?? "").trim() || null,
  };

  const { error } = await supabase
    .from("weekly_bilan_recaps")
    .upsert(row as any, { onConflict: "user_id,week_start" });

  if (error) throw error;
  return { weekStart, decisions };
}
