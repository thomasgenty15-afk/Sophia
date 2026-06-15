import { createClient } from "jsr:@supabase/supabase-js@2";
import type { MorningNudgePayloadV2 } from "../../supabase/functions/sophia-brain/morning_nudge_contract.ts";
import {
  createPostMorningNudgeActiveState,
  POST_MORNING_NUDGE_TEMP_MEMORY_KEY,
} from "../../supabase/functions/sophia-brain/post_morning_nudge.ts";

function loadEnvFile(path: string) {
  try {
    const raw = Deno.readTextFileSync(path);
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!Deno.env.get(key)) Deno.env.set(key, value);
    }
  } catch {
    // Env may already be present.
  }
}

loadEnvFile("supabase/.env");

const runId = Deno.args[0];
const scope = Deno.args[1];
if (!runId || !scope) throw new Error("usage: setup <run_id> <scope>");

const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const userConnection = JSON.parse(
  Deno.readTextFileSync("tests/real-personas/alex/connection.json"),
);
const userId = String(userConnection.user_id);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321",
  serviceRole,
  { auth: { persistSession: false } },
);

const sourceNudge: MorningNudgePayloadV2 = {
  event_context: "morning_nudge_v2",
  nudge_kind: "emotional_presence_nudge",
  posture: "support_softly",
  opens_local_flow: true,
  intended_followup_flow: "emotional_presence",
  coach_intent: "support_emotion",
  target_action_ids: [],
  target_action_titles: [],
  target_item_ids: [],
  target_item_titles: [],
  suppressed_action_ids: [],
  suppressed_action_titles: [],
  suppression_reason: null,
  morning_anchor: {
    kind: "recent_emotional_thread",
    label: "un sujet personnel recent",
    specificity: "soft",
    confidence: "high",
    sensitivity: "sensitive",
    user_consent_signal: "unknown",
    visible_hint:
      "Tu peux reconnaitre de facon voilee que quelque chose prenait de la place recemment, sans nommer le detail.",
    do_not_mention: [
      "Ne cite pas le topic emotionnel brut.",
      "Ne nomme pas de personne.",
    ],
    evidence_refs: { message_ids: [], event_ids: [] },
  },
  source_reason: "qa_post_morning_nudge_stateful_merge",
  source_grounding: "QA seeded emotional presence morning nudge.",
  sent_at: "2026-06-15T07:45:00.000+02:00",
};

const state = createPostMorningNudgeActiveState({
  sourceNudge,
  nowIso: "2026-06-15T07:46:00.000+02:00",
  maxTurns: 3,
});
if (!state) throw new Error("failed_to_create_post_morning_state");

const legacyState = { ...state } as Record<string, unknown>;
delete legacyState.activation_note_information;

const tempMemory = {
  [POST_MORNING_NUDGE_TEMP_MEMORY_KEY]: legacyState,
  __active_skill_state: legacyState,
  active_skill_state: legacyState,
  qa_run_id: runId,
};

const { error } = await supabase.from("user_chat_states").upsert({
  user_id: userId,
  scope,
  current_mode: "companion",
  risk_level: 0,
  temp_memory: tempMemory,
  short_term_context: `QA post morning nudge run ${runId}`,
  updated_at: new Date().toISOString(),
  last_interaction_at: new Date().toISOString(),
  last_processed_at: new Date().toISOString(),
  unprocessed_msg_count: 0,
}, { onConflict: "user_id,scope" });
if (error) throw error;

console.log(JSON.stringify({ ok: true, run_id: runId, scope, user_id: userId }));
