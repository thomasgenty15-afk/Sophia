import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts";

type PersonalizationLevel = 1 | 2 | 3;
type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function weekdayKeyInTimezone(params: { timezone: string; dayOffset: number; now?: Date }): WeekdayKey {
  const tz = str(params.timezone) || "Europe/Paris";
  const base = params.now ?? new Date();
  const target = new Date(base.getTime() + Math.max(0, params.dayOffset) * 24 * 60 * 60 * 1000);
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(target).toLowerCase();
  const map: Record<string, WeekdayKey> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };
  return map[short.slice(0, 3)] ?? "mon";
}

function localTimeHHMMInTimezone(params: { timezone: string; now?: Date }): string {
  const tz = str(params.timezone) || "Europe/Paris";
  const now = params.now ?? new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

function normalizeHHMM(raw: string): string {
  const m = str(raw).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function daysUntilNextSunday(timezone: string): number {
  const key = weekdayKeyInTimezone({ timezone, dayOffset: 0, now: new Date() });
  const idx: Record<WeekdayKey, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const current = idx[key];
  const delta = (7 - current) % 7;
  return delta === 0 ? 7 : delta;
}

async function seedReminderUntilNextSunday(params: {
  admin: ReturnType<typeof createClient>;
  reminder: {
    id: string;
    user_id: string;
    message_instruction: string;
    rationale: string | null;
    local_time_hhmm: string;
    scheduled_days: string[];
    status: string;
  };
  level: PersonalizationLevel;
}): Promise<number> {
  const reminder = params.reminder;
  if (reminder.status !== "active") return 0;

  const { data: profile } = await params.admin
    .from("profiles")
    .select("timezone")
    .eq("id", reminder.user_id)
    .maybeSingle();
  const timezone = str((profile as any)?.timezone) || "Europe/Paris";
  const eventContext = `recurring_reminder:${reminder.id}`;
  const localTime = normalizeHHMM(reminder.local_time_hhmm);
  const scheduledDays = (Array.isArray(reminder.scheduled_days) ? reminder.scheduled_days : [])
    .map((d) => str(d).toLowerCase())
    .filter(Boolean) as WeekdayKey[];

  if (scheduledDays.length === 0) return 0;

  const untilSunday = daysUntilNextSunday(timezone);
  const maxOffset = Math.max(0, untilSunday - 1); // stop before next Sunday cron window
  const nowIso = new Date().toISOString();
  const horizonEndIso = computeScheduledForFromLocal({
    timezone,
    dayOffset: untilSunday,
    localTimeHHMM: "00:00",
  });

  // Refresh near-term future plan for this reminder so updates/reactivation take effect immediately.
  await params.admin
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: new Date().toISOString(),
    } as any)
    .eq("user_id", reminder.user_id)
    .eq("event_context", eventContext)
    .in("status", ["pending", "awaiting_user"])
    .gte("scheduled_for", nowIso)
    .lt("scheduled_for", horizonEndIso);

  const nowLocalHHMM = localTimeHHMMInTimezone({ timezone });
  let inserted = 0;
  for (let dayOffset = 0; dayOffset <= maxOffset; dayOffset++) {
    const weekday = weekdayKeyInTimezone({ timezone, dayOffset, now: new Date() });
    if (!scheduledDays.includes(weekday)) continue;
    if (dayOffset === 0 && nowLocalHHMM >= localTime) continue;

    const scheduledFor = computeScheduledForFromLocal({
      timezone,
      dayOffset,
      localTimeHHMM: localTime,
    });
    const draft = `Petit rappel: ${str(reminder.message_instruction).slice(0, 180)}`;
    const payload = {
      source: "recurring_reminder_seed_until_sunday",
      recurring_reminder_id: reminder.id,
      reminder_instruction: reminder.message_instruction,
      reminder_rationale: reminder.rationale ?? null,
      personalization_level_configured: params.level,
      personalization_level_effective: params.level,
      generated_at: new Date().toISOString(),
      slot_day_offset: dayOffset,
      slot_weekday: weekday,
      seed_mode: "until_next_sunday_cron",
    };

    const { error } = await params.admin
      .from("scheduled_checkins")
      .upsert(
        {
          user_id: reminder.user_id,
          event_context: eventContext,
          draft_message: draft,
          message_mode: "static",
          message_payload: payload,
          scheduled_for: scheduledFor,
          status: "pending",
        } as any,
        { onConflict: "user_id,event_context,scheduled_for" },
      );
    if (!error) inserted++;
  }

  await params.admin
    .from("user_recurring_reminders")
    .update({
      last_drafted_at: new Date().toISOString(),
      last_draft_message: `Petit rappel: ${str(reminder.message_instruction).slice(0, 180)}`,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", reminder.id)
    .eq("user_id", reminder.user_id);

  return inserted;
}

function buildContextPolicy(level: PersonalizationLevel): Record<string, unknown> {
  if (level === 1) {
    return {
      include_creation_instruction: true,
      include_creation_rationale: true,
      include_plan_why: false,
      include_plan_blockers: false,
      include_north_star: false,
      include_topic_memories_last_week: false,
      include_topic_metadata: false,
    };
  }
  if (level === 2) {
    return {
      include_creation_instruction: true,
      include_creation_rationale: true,
      include_plan_why: true,
      include_plan_blockers: true,
      include_north_star: true,
      include_topic_memories_last_week: false,
      include_topic_metadata: false,
    };
  }
  return {
    include_creation_instruction: true,
    include_creation_rationale: true,
    include_plan_why: true,
    include_plan_blockers: true,
    include_north_star: true,
    include_topic_memories_last_week: true,
    include_topic_metadata: true,
  };
}

function heuristicLevel(instruction: string, rationale: string): PersonalizationLevel {
  const text = `${instruction}\n${rationale}`.toLowerCase();
  const needsTopicMemory =
    /ce qu'?on s'?est dit|nos discussions|mes conversations|topic|mémoire|memory|semaine derni[èe]re|historique/.test(text);
  if (needsTopicMemory) return 3;

  const needsPlanContext =
    /pourquoi|je continue|blocage|objectif|cap|progression|progr[eè]s|doute|rechute|north star|[ée]toile polaire/.test(text);
  if (needsPlanContext) return 2;

  return 1;
}

async function classifyWithAI(params: {
  instruction: string;
  rationale: string;
  requestId: string;
}): Promise<{ level: PersonalizationLevel; reason: string }> {
  const { instruction, rationale, requestId } = params;
  const systemPrompt = `
Tu classes une initiative WhatsApp de Sophia en niveau de personnalisation.

Règles strictes:
- Retourne uniquement un JSON valide.
- Schéma:
{
  "level": 1 | 2 | 3,
  "reason": "string courte (<= 180 chars)"
}

Définition des niveaux:
- Niveau 1: aucun contexte personnel externe requis. Message générique possible.
- Niveau 2: nécessite le contexte plan (pourquoi profond, blocages, north star).
- Niveau 3: niveau 2 + nécessite aussi des topic memories récentes et leur metadata.

Choisis le niveau minimum nécessaire pour produire un message fidèle à l'intention.
`;

  const userPrompt = `
Initiative:
- Instruction: ${instruction || "n/a"}
- Rationale: ${rationale || "n/a"}
`;

  const raw = await generateWithGemini(
    systemPrompt.trim(),
    userPrompt.trim(),
    0.1,
    true,
    [],
    "auto",
    {
      requestId,
      source: "classify-recurring-reminder",
      model: "gemini-2.5-flash",
      maxRetries: 2,
      forceRealAi: true,
    },
  );

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const levelRaw = Number((parsed as any)?.level);
  const reason = str((parsed as any)?.reason).slice(0, 180);
  const level: PersonalizationLevel = levelRaw === 3 ? 3 : levelRaw === 2 ? 2 : 1;
  return { level, reason: reason || "Classification automatique par intention utilisateur." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const reminderId = str((body as any)?.reminder_id);
    if (!reminderId) {
      return new Response(JSON.stringify({ error: "Missing reminder_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = str(Deno.env.get("SUPABASE_URL"));
    const anonKey = str(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceKey = str(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authData.user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: reminder, error: reminderErr } = await admin
      .from("user_recurring_reminders")
      .select("id,user_id,message_instruction,rationale,local_time_hhmm,scheduled_days,status")
      .eq("id", reminderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (reminderErr) throw reminderErr;
    if (!reminder) {
      return new Response(JSON.stringify({ error: "Reminder not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instruction = str((reminder as any).message_instruction);
    const rationale = str((reminder as any).rationale);

    const requestId = `${crypto.randomUUID()}:classify-recurring-reminder`;
    let level: PersonalizationLevel = heuristicLevel(instruction, rationale);
    let reason = "Classification heuristique.";
    try {
      const ai = await classifyWithAI({ instruction, rationale, requestId });
      level = ai.level;
      reason = ai.reason || reason;
    } catch (e) {
      console.warn("[classify-recurring-reminder] ai_fallback_heuristic", e);
    }

    const contextPolicy = buildContextPolicy(level);
    const { error: updateErr } = await admin
      .from("user_recurring_reminders")
      .update({
        personalization_level: level,
        context_policy: contextPolicy,
        classification_reason: reason,
        last_classified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", reminderId)
      .eq("user_id", userId);
    if (updateErr) throw updateErr;

    const seededCheckins = await seedReminderUntilNextSunday({
      admin,
      reminder: reminder as any,
      level,
    });

    return new Response(
      JSON.stringify({
        success: true,
        reminder_id: reminderId,
        personalization_level: level,
        context_policy: contextPolicy,
        classification_reason: reason,
        seeded_checkins: seededCheckins,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[classify-recurring-reminder] error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
