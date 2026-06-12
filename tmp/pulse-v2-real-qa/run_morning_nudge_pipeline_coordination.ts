import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildMorningNudgePayloadV2,
  resolveMorningNudgePlanV2,
} from "../../supabase/functions/sophia-brain/momentum_morning_nudge.ts";
import { computeScheduledForFromLocal } from "../../supabase/functions/_shared/scheduled_checkins.ts";

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
    // Local QA runner: env may already be provided by the shell.
  }
}

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function tempMemoryWithEmotionalMomentum(nowIso: string) {
  return {
    __momentum_state_v2: {
      version: 2,
      updated_at: nowIso,
      current_state: "soutien_emotionnel",
      state_reason: "qa_pipeline_recent_support_signal",
      dimensions: {
        engagement: { level: "medium" },
        execution_traction: { level: "flat" },
        emotional_load: { level: "medium" },
        consent: { level: "open" },
        plan_fit: { level: "uncertain" },
        load_balance: { level: "balanced" },
      },
      assessment: {
        top_blocker: null,
        top_risk: null,
        confidence: "high",
      },
      active_load: {
        current_load_score: 1,
        mission_slots_used: 0,
        support_slots_used: 1,
        habit_building_slots_used: 0,
        needs_reduce: false,
        needs_consolidate: false,
      },
      posture: {
        recommended_posture: "support",
        confidence: "high",
      },
      blockers: {
        blocker_kind: null,
        blocker_repeat_score: 0,
      },
      memory_links: {
        last_useful_support_ids: [],
        last_failed_technique_ids: [],
      },
      _internal: {
        signal_log: {
          emotional_turns: [{ at: nowIso, level: "medium" }],
          consent_events: [],
          response_quality_events: [],
        },
        stability: {},
        sources: {},
        metrics_cache: {},
      },
    },
  };
}

loadEnvFile("supabase/.env");

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
assertCondition(serviceRole, "Missing SUPABASE_SERVICE_ROLE_KEY");

const runId = `morning-nudge-pipeline-${Date.now()}`;
const userConnection = JSON.parse(
  Deno.readTextFileSync("tests/real-personas/alex/connection.json"),
);
const userId = String(userConnection.user_id);
const timezone = "Europe/Paris";
const qaNow = new Date("2026-06-11T10:00:00.000+02:00");
const morningNudgeScheduledFor = computeScheduledForFromLocal({
  timezone,
  dayOffset: 0,
  localTimeHHMM: "08:00",
  now: qaNow,
});
const neighboringCheckinScheduledFor = computeScheduledForFromLocal({
  timezone,
  dayOffset: 0,
  localTimeHHMM: "08:30",
  now: qaNow,
});

const supabase = createClient(supabaseUrl, serviceRole!, {
  auth: { persistSession: false },
});
const morningNudgeId = crypto.randomUUID();
const neighboringCheckinId = crypto.randomUUID();
const qaEventContext = `qa_support_checkin:${runId}`;

const summary: Record<string, unknown> = {
  run_id: runId,
  user_id: userId,
  morning_nudge_id: morningNudgeId,
  neighboring_checkin_id: neighboringCheckinId,
  scheduled_window_local: "07:00-12:00",
};

try {
  const { error: insertError } = await supabase.from("scheduled_checkins")
    .insert([
      {
        id: morningNudgeId,
        user_id: userId,
        event_context: "morning_nudge_v2",
        draft_message: "QA morning nudge placeholder",
        scheduled_for: morningNudgeScheduledFor,
        status: "pending",
        message_mode: "dynamic",
        origin: "unknown",
        message_payload: {
          source: "qa_pipeline",
          qa_run_id: runId,
        },
      },
      {
        id: neighboringCheckinId,
        user_id: userId,
        event_context: qaEventContext,
        draft_message:
          "Je te remets juste un peu de force ce matin, sans rouvrir les details.",
        scheduled_for: neighboringCheckinScheduledFor,
        status: "pending",
        message_mode: "dynamic",
        origin: "unknown",
        message_payload: {
          source: "qa_pipeline_neighbor",
          qa_run_id: runId,
          instruction:
            "Message de soutien matinal. Redonner doucement de la force sans citer les details.",
          event_grounding:
            "L'utilisateur a demande un soutien doux demain matin sans remettre le sujet sur la table.",
        },
      },
    ]);
  if (insertError) throw insertError;

  const resolved = await resolveMorningNudgePlanV2({
    supabase,
    userId,
    tempMemory: tempMemoryWithEmotionalMomentum(morningNudgeScheduledFor),
    scheduledForIso: morningNudgeScheduledFor,
    scheduledCheckinId: morningNudgeId,
    timezone,
  });
  const payload = buildMorningNudgePayloadV2({
    plan: resolved.plan,
    sentAtIso: morningNudgeScheduledFor,
  });
  assertCondition(payload, "Expected a morning_nudge_v2 payload");

  const processLikePayload = {
    source: "qa_process_checkins_pipeline",
    conversation_pulse_id: resolved.conversationPulseId,
    momentum_state: resolved.plan.state ?? null,
    morning_nudge_posture: resolved.plan.posture ?? null,
    morning_nudge_v2: payload,
    relevance: resolved.plan.relevance,
    instruction: resolved.plan.instruction ?? "",
    event_grounding: resolved.plan.event_grounding ?? "",
    confidence: resolved.plan.confidence,
    plan_item_ids_targeted: resolved.plan.target_plan_item_ids,
    plan_item_titles_targeted: resolved.plan.target_plan_item_titles,
    chat_capability: "track_progress_only",
    qa_run_id: runId,
  };

  const { error: updateError } = await supabase.from("scheduled_checkins")
    .update({ message_payload: processLikePayload })
    .eq("id", morningNudgeId)
    .eq("user_id", userId);
  if (updateError) throw updateError;

  const { data: row, error: readError } = await supabase
    .from("scheduled_checkins")
    .select("id,event_context,message_payload")
    .eq("id", morningNudgeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  assertCondition(row, "Expected updated morning nudge row");

  const storedPayload = row!.message_payload as Record<string, unknown>;
  const storedNudge = storedPayload.morning_nudge_v2 as Record<
    string,
    unknown
  >;
  const commitments = Array.isArray(
      storedNudge?.morning_scheduled_commitments,
    )
    ? storedNudge.morning_scheduled_commitments as Array<
      Record<string, unknown>
    >
    : [];
  const coordinationNotes = Array.isArray(storedNudge?.coordination_notes)
    ? storedNudge.coordination_notes as unknown[]
    : [];
  const instruction = String(storedPayload.instruction ?? "");
  const grounding = String(storedPayload.event_grounding ?? "");

  assertCondition(commitments.length === 1, "Expected exactly one commitment");
  assertCondition(
    String(commitments[0]?.id) === neighboringCheckinId,
    "Expected neighboring checkin id in commitments",
  );
  assertCondition(
    !commitments.some((item) => String(item.id) === morningNudgeId),
    "Morning nudge must not include itself as commitment",
  );
  assertCondition(
    coordinationNotes.length === 1,
    "Expected one coordination note",
  );
  assertCondition(
    instruction.includes("N'en fais pas doublon"),
    "Instruction missing anti-redundancy rule",
  );
  assertCondition(
    grounding.includes("morning_scheduled_commitments="),
    "Grounding missing morning commitments",
  );

  Object.assign(summary, {
    status: "green",
    decision: resolved.plan.decision,
    posture: resolved.plan.posture,
    nudge_kind: storedNudge.nudge_kind,
    commitments_count: commitments.length,
    commitment_ids: commitments.map((item) => item.id),
    includes_self: commitments.some((item) => String(item.id) === morningNudgeId),
    coordination_notes_count: coordinationNotes.length,
    instruction_has_anti_redundancy: instruction.includes(
      "N'en fais pas doublon",
    ),
    grounding_has_commitments: grounding.includes(
      "morning_scheduled_commitments=",
    ),
    payload_source: storedPayload.source,
  });
} catch (error) {
  Object.assign(summary, {
    status: "red",
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
} finally {
  const { data: deleted, error: cleanupError } = await supabase
    .from("scheduled_checkins")
    .delete()
    .eq("user_id", userId)
    .in("id", [morningNudgeId, neighboringCheckinId])
    .select("id");
  Object.assign(summary, {
    cleanup_error: cleanupError ? cleanupError.message : null,
    cleanup_deleted_ids: Array.isArray(deleted)
      ? deleted.map((row: { id: string }) => row.id)
      : [],
  });
  console.log(JSON.stringify(summary, null, 2));
}
