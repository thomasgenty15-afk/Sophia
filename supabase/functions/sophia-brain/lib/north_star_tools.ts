import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { validateEthicalTextWithAI } from "./ethical_text_validator.ts";

export const UPDATE_ETOILE_POLAIRE_TOOL = {
  name: "update_etoile_polaire",
  description: "Met a jour la valeur actuelle de l'etoile polaire du user.",
  parameters: {
    type: "OBJECT",
    properties: {
      new_value: { type: "NUMBER", description: "Nouvelle valeur actuelle" },
      note: { type: "STRING", description: "Note optionnelle (contexte)" },
    },
    required: ["new_value"],
  },
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeProgressionPct(start: number, current: number, target: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(current) || !Number.isFinite(target)) {
    return 0;
  }
  if (target === start) return current >= target ? 100 : 0;
  const pct = ((current - start) / (target - start)) * 100;
  return Math.max(-100, Math.min(300, Math.round(pct)));
}

export async function updateEtoilePolaire(
  supabase: SupabaseClient,
  userId: string,
  args: { new_value: number; note?: string },
): Promise<{
  success: boolean;
  title: string;
  unit: string;
  old_value: number;
  new_value: number;
  delta: number;
  progression_pct: number;
  start_value: number;
  target_value: number;
}> {
  const newValue = Number(args?.new_value);
  if (!Number.isFinite(newValue)) {
    throw new Error("updateEtoilePolaire: invalid new_value");
  }

  const { data: row, error } = await supabase
    .from("user_north_stars")
    .select("id,title,unit,start_value,current_value,target_value,history")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!row) {
    throw new Error("Aucune Etoile Polaire active.");
  }

  const oldValue = toNum((row as any).current_value);
  const startValue = toNum((row as any).start_value);
  const targetValue = toNum((row as any).target_value);
  const unit = String((row as any).unit ?? "").trim();
  const title = String((row as any).title ?? "Etoile Polaire").trim() || "Etoile Polaire";

  const history = Array.isArray((row as any).history) ? (row as any).history.slice(-79) : [];
  const nowIso = new Date().toISOString();
  const note = String(args?.note ?? "").trim().slice(0, 300);
  if (note) {
    const validation = await validateEthicalTextWithAI({
      entity_type: "north_star",
      operation: "update",
      text_fields: { note },
      context: { source: "tool:update_etoile_polaire" },
      user_id: userId,
    });
    if (validation.decision === "block") {
      throw new Error(validation.reason_short || "Note bloquée par la vérification éthique.");
    }
  }
  history.push({
    at: nowIso,
    value: newValue,
    previous_value: oldValue,
    note: note || null,
    source: "tool:update_etoile_polaire",
  });

  const { error: updateErr } = await supabase
    .from("user_north_stars")
    .update({
      current_value: newValue,
      history,
      updated_at: nowIso,
    } as any)
    .eq("id", (row as any).id)
    .eq("user_id", userId);

  if (updateErr) throw updateErr;

  const delta = Math.round((newValue - oldValue) * 100) / 100;
  const progression = computeProgressionPct(startValue, newValue, targetValue);

  return {
    success: true,
    title,
    unit,
    old_value: oldValue,
    new_value: newValue,
    delta,
    progression_pct: progression,
    start_value: startValue,
    target_value: targetValue,
  };
}
