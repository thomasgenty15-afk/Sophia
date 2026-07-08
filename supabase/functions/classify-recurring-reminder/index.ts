import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  enforceCors,
  getCorsHeaders,
  handleCorsOptions,
} from "../_shared/cors.ts";
import { enforceRateLimit, RATE_PRESETS } from "../_shared/rate-limit.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import { buildActionFamilyKey } from "../_shared/memory/action_family.ts";
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts";

type PersonalizationLevel = 1 | 2 | 3;
type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const RDV_GENERATION_MODEL = "gpt-5.2";
const LIVE_TARGET_STATUSES = ["active", "in_maintenance"];
type SupabaseAdminClient = ReturnType<typeof createClient>;

type RecurringReminderRow = {
  id: string;
  user_id: string;
  transformation_id?: string | null;
  initiative_kind?: string | null;
  source_potion_session_id?: string | null;
  message_instruction: string;
  rationale: string | null;
  local_time_hhmm: string;
  scheduled_days: string[];
  status: string;
  target_kind?: string | null;
  target_plan_item_id?: string | null;
  target_action_family_key?: string | null;
  target_generated_temp_id?: string | null;
  target_binding_policy?: string | null;
  target_lifecycle_policy?: string | null;
  initiative_metadata?: Record<string, unknown> | null;
};

type LiveReminderTarget = {
  available: boolean;
  item: Record<string, unknown> | null;
  grounding: string;
  unavailableReason: string | null;
};

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function clampText(v: string, maxChars: number): string {
  if (v.length <= maxChars) return v;
  return v.slice(0, maxChars - 1).trimEnd() + "…";
}

function isWhatsappSchedulingTierEligible(accessTierRaw: unknown): boolean {
  const tier = str(accessTierRaw).toLowerCase();
  return tier === "trial" || tier === "alliance" || tier === "architecte";
}

function normalizeDraftMessage(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (!v || typeof v !== "object") return "";
  const o = v as Record<string, unknown>;
  const candidates = [
    o.text,
    o.message,
    o.content,
    (o.data && typeof o.data === "object")
      ? (o.data as Record<string, unknown>).text
      : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

function fallbackDraftFromInstruction(instruction: string): string {
  return `Petit rappel: ${str(instruction).slice(0, 180)}`;
}

function parseMessages(raw: unknown, maxCount: number): string[] {
  let parsed: any = null;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    parsed = null;
  }
  const list = Array.isArray(parsed?.messages) ? parsed.messages : [];
  return list
    .map((m: any) => normalizeDraftMessage(m))
    .filter(Boolean)
    .slice(0, maxCount);
}

async function generateDraftsWithExactCount(params: {
  systemPrompt: string;
  slotList: string;
  expectedCount: number;
  reminderInstruction: string;
  requestId: string;
  userId?: string | null;
}): Promise<
  {
    drafts: string[];
    generatedCount: number;
    missingCount: number;
    repairAttempts: number;
  }
> {
  const missingFallback = Array.from({ length: params.expectedCount }).map(() =>
    fallbackDraftFromInstruction(params.reminderInstruction)
  );
  let repairAttempts = 0;
  let drafts: string[] = [];

  try {
    const firstRaw = await generateWithGemini(
      params.systemPrompt,
      "Génère les messages maintenant.",
      0.5,
      true,
      [],
      "auto",
      {
        requestId: params.requestId,
        userId: params.userId ?? undefined,
        source: "classify-recurring-reminder",
        model: RDV_GENERATION_MODEL,
        maxRetries: 2,
        forceRealAi: true,
      },
    );
    drafts = parseMessages(firstRaw, params.expectedCount);
  } catch {
    drafts = [];
  }

  if (drafts.length !== params.expectedCount) {
    repairAttempts++;
    try {
      const missing = Math.max(0, params.expectedCount - drafts.length);
      const repairPrompt = [
        "La sortie précédente n'avait pas le bon nombre de messages.",
        `Tu dois corriger et retourner EXACTEMENT ${params.expectedCount} messages.`,
        "- Priorité absolue: respecter l'instruction utilisateur.",
        "- Les variantes de style ne doivent jamais déformer le besoin.",
        "Slots (dans l'ordre):",
        params.slotList,
      ].join("\n");
      const repairRaw = await generateWithGemini(
        params.systemPrompt,
        repairPrompt,
        0.4,
        true,
        [],
        "auto",
        {
          requestId: `${params.requestId}:repair`,
          userId: params.userId ?? undefined,
          source: "classify-recurring-reminder",
          model: RDV_GENERATION_MODEL,
          maxRetries: 2,
          forceRealAi: true,
        },
      );
      const repaired = parseMessages(repairRaw, params.expectedCount);
      if (repaired.length > 0) drafts = repaired;
      if (drafts.length < params.expectedCount) {
        drafts = [
          ...drafts,
          ...Array.from({ length: missing }).map(() =>
            fallbackDraftFromInstruction(params.reminderInstruction)
          ),
        ]
          .slice(0, params.expectedCount);
      }
    } catch {
      drafts = [...drafts, ...missingFallback].slice(0, params.expectedCount);
    }
  }

  return {
    drafts,
    generatedCount: drafts.length,
    missingCount: Math.max(0, params.expectedCount - drafts.length),
    repairAttempts,
  };
}

function weekdayKeyInTimezone(
  params: { timezone: string; dayOffset: number; now?: Date },
): WeekdayKey {
  const tz = str(params.timezone) || "Europe/Paris";
  const base = params.now ?? new Date();
  const target = new Date(
    base.getTime() + Math.max(0, params.dayOffset) * 24 * 60 * 60 * 1000,
  );
  const short = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: tz,
  }).format(target).toLowerCase();
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

function localTimeHHMMInTimezone(
  params: { timezone: string; now?: Date },
): string {
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

function reminderHasLiveLifecycle(reminder: RecurringReminderRow): boolean {
  const lifecycle = str(reminder.target_lifecycle_policy);
  return lifecycle === "while_target_active" ||
    lifecycle === "while_family_in_current_plan";
}

function planItemFamilyKey(item: Record<string, unknown>): string {
  return buildActionFamilyKey({
    id: str(item.id),
    title: str(item.title),
    kind: str(item.kind),
    dimension: str(item.dimension),
    start_after_item_id: str(item.start_after_item_id),
    payload: item.payload && typeof item.payload === "object"
      ? item.payload as Record<string, unknown>
      : null,
  });
}

function formatLiveTargetGrounding(
  reminder: RecurringReminderRow,
  item: Record<string, unknown> | null,
): string {
  if (!item) {
    return [
      "Rappel lié à une action du plan.",
      `Statut cible: indisponible (${
        str(reminder.target_lifecycle_policy) || "n/a"
      }).`,
      "Ne pas envoyer un message qui suppose que l'action existe encore.",
    ].join("\n");
  }
  const lines = [
    "Rappel lié à une action active du plan.",
    `Action actuelle: ${str(item.title) || "Action sans titre"}`,
    str(item.description)
      ? `Description actuelle: ${clampText(str(item.description), 500)}`
      : "",
    `Type: ${str(item.kind) || "n/a"} | Dimension: ${
      str(item.dimension) || "n/a"
    } | Statut: ${str(item.status) || "n/a"}`,
    str(item.cadence_label)
      ? `Cadence actuelle: ${str(item.cadence_label)}`
      : "",
    Array.isArray(item.scheduled_days) && item.scheduled_days.length
      ? `Jours prévus actuellement: ${
        (item.scheduled_days as unknown[]).map(str).filter(Boolean).join(", ")
      }`
      : "",
    str(item.time_of_day)
      ? `Horaire plan actuel: ${str(item.time_of_day)}`
      : "",
    Number.isFinite(Number(item.target_reps))
      ? `Objectif actuel: ${Number(item.target_reps)} répétition(s)`
      : "",
    `Famille d'action: ${planItemFamilyKey(item)}`,
    "Rédige le rappel avec ces détails actuels, pas avec une ancienne version stockée.",
  ].filter(Boolean);
  return lines.join("\n");
}

async function resolveLiveReminderTarget(params: {
  admin: SupabaseAdminClient;
  reminder: RecurringReminderRow;
}): Promise<LiveReminderTarget> {
  const reminder = params.reminder;
  if (!reminderHasLiveLifecycle(reminder)) {
    return {
      available: true,
      item: null,
      grounding: "",
      unavailableReason: null,
    };
  }

  const targetKind = str(reminder.target_kind);
  const targetPlanItemId = str(reminder.target_plan_item_id);
  const targetFamilyKey = str(reminder.target_action_family_key);
  const targetGeneratedTempId = str(reminder.target_generated_temp_id);
  const selectColumns =
    "id,user_id,cycle_id,transformation_id,plan_id,dimension,kind,status,title,description,current_habit_state,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,start_after_item_id,payload,updated_at";

  if (targetKind === "plan_item" && targetPlanItemId) {
    const { data: item } = await params.admin
      .from("user_plan_items")
      .select(selectColumns)
      .eq("id", targetPlanItemId)
      .eq("user_id", reminder.user_id)
      .in("status", LIVE_TARGET_STATUSES)
      .maybeSingle();
    const resolved = (item as Record<string, unknown> | null) ?? null;
    return {
      available: Boolean(resolved),
      item: resolved,
      grounding: formatLiveTargetGrounding(reminder, resolved),
      unavailableReason: resolved
        ? null
        : "target_plan_item_inactive_or_missing",
    };
  }

  if (
    targetKind === "action_family" &&
    (targetFamilyKey || targetGeneratedTempId || targetPlanItemId)
  ) {
    let query = params.admin
      .from("user_plan_items")
      .select(selectColumns)
      .eq("user_id", reminder.user_id)
      .in("status", LIVE_TARGET_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(50);
    const transformationId = str(reminder.transformation_id);
    if (transformationId) {
      query = query.eq("transformation_id", transformationId);
    }
    const { data: items } = await query;
    const resolved =
      ((items ?? []) as Array<Record<string, unknown>>).find((item) => {
        const payload = item.payload && typeof item.payload === "object"
          ? item.payload as Record<string, unknown>
          : {};
        const generatedTempId = str(payload.generated_temp_id) ||
          str(payload.generatedTempId);
        return (targetFamilyKey &&
          planItemFamilyKey(item) === targetFamilyKey) ||
          (targetGeneratedTempId &&
            generatedTempId === targetGeneratedTempId) ||
          (targetPlanItemId && str(item.id) === targetPlanItemId);
      }) ?? null;
    return {
      available: Boolean(resolved),
      item: resolved,
      grounding: formatLiveTargetGrounding(reminder, resolved),
      unavailableReason: resolved
        ? null
        : "target_action_family_inactive_or_missing",
    };
  }

  return {
    available: false,
    item: null,
    grounding: formatLiveTargetGrounding(reminder, null),
    unavailableReason: "target_binding_missing",
  };
}

async function seedReminderUntilNextSunday(params: {
  admin: SupabaseAdminClient;
  reminder: RecurringReminderRow;
  level: PersonalizationLevel;
}): Promise<number> {
  const reminder = params.reminder;
  if (reminder.status !== "active") return 0;

  const { data: profile } = await params.admin
    .from("profiles")
    .select("timezone,locale")
    .eq("id", reminder.user_id)
    .maybeSingle();
  const timezone = str((profile as any)?.timezone) || "Europe/Paris";
  const locale = str((profile as any)?.locale) || "fr-FR";
  const eventContext = `recurring_reminder:${reminder.id}`;
  const localTime = normalizeHHMM(reminder.local_time_hhmm);
  const scheduledDays =
    (Array.isArray(reminder.scheduled_days) ? reminder.scheduled_days : [])
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
    .in("status", ["pending", "retrying", "awaiting_user"])
    .gte("scheduled_for", nowIso)
    .lt("scheduled_for", horizonEndIso);

  const liveTarget = await resolveLiveReminderTarget({
    admin: params.admin,
    reminder,
  });
  if (!liveTarget.available) {
    await params.admin
      .from("user_recurring_reminders")
      .update({
        status: "expired",
        ended_reason: liveTarget.unavailableReason ?? "target_inactive",
        deactivated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", reminder.id)
      .eq("user_id", reminder.user_id);
    return 0;
  }

  const nowLocalHHMM = localTimeHHMMInTimezone({ timezone });
  const slots: Array<{
    dayOffset: number;
    weekday: WeekdayKey;
    scheduledFor: string;
    slotLabel: string;
  }> = [];
  for (let dayOffset = 0; dayOffset <= maxOffset; dayOffset++) {
    const weekday = weekdayKeyInTimezone({
      timezone,
      dayOffset,
      now: new Date(),
    });
    if (!scheduledDays.includes(weekday)) continue;
    if (dayOffset === 0 && nowLocalHHMM >= localTime) continue;

    const scheduledFor = computeScheduledForFromLocal({
      timezone,
      dayOffset,
      localTimeHHMM: localTime,
    });
    slots.push({
      dayOffset,
      weekday,
      scheduledFor,
      slotLabel: `J+${dayOffset} (${weekday})`,
    });
  }

  if (slots.length === 0) return 0;

  const slotList = slots
    .map((s, i) => `${i + 1}. ${s.slotLabel} | scheduled_for=${s.scheduledFor}`)
    .join("\n");
  const systemPrompt = [
    "Tu es Sophia (mode Companion). Tu rédiges des messages de rendez-vous WhatsApp.",
    "",
    "Contraintes strictes:",
    "- Retourne uniquement un JSON valide.",
    `- Schéma exact: {"messages":[...]} avec exactement ${slots.length} messages.`,
    "- Chaque message: 2 à 5 lignes, texte brut, chaleureux, naturel, tutoiement.",
    "- N'ouvre pas avec Bonjour/Salut/Coucou/Hello.",
    "- Le message doit refléter fidèlement l'instruction utilisateur (thème, ton, intention).",
    "- Priorité absolue: l'instruction utilisateur. Ne la déforme jamais pour varier le style.",
    "- Interdit de recopier mot-à-mot la consigne utilisateur.",
    "- Interdit de répondre avec une simple reformulation du type 'Petit rappel: ...'.",
    "- Ne transforme pas automatiquement le rappel en bilan de journée ou en check-in si ce n'est pas demandé.",
    "- Si l'instruction demande une citation, une pensée, un recadrage ou un rappel de cap, livre cela directement.",
    "- Variations réelles entre les messages, mais sans changer le besoin utilisateur.",
    "- Interdiction de répéter la même idée dans deux formulations voisines au sein d'un même message.",
    "- Interdiction des doublons sémantiques du type 'point sur ta journée' + 'comment s'est passée ta journée'. Une seule formulation, une seule idée principale.",
    liveTarget.grounding
      ? "- Si le rappel est lié à une action, respecte le contexte live de cette action."
      : "",
    "",
    "Contexte rendez-vous:",
    `- Instruction: ${clampText(str(reminder.message_instruction), 1000)}`,
    reminder.rationale
      ? `- Pourquoi c'est important: ${clampText(str(reminder.rationale), 420)}`
      : "",
    liveTarget.grounding
      ? `- Contexte action live:\n${liveTarget.grounding}`
      : "",
    `- Timezone: ${timezone}`,
    `- Locale: ${locale}`,
    "",
    "Slots à couvrir (dans l'ordre):",
    slotList,
  ]
    .filter(Boolean)
    .join("\n");

  const generationRequestId = `${crypto.randomUUID()}:seed-recurring-reminder`;
  const generated = await generateDraftsWithExactCount({
    systemPrompt,
    slotList,
    expectedCount: slots.length,
    reminderInstruction: reminder.message_instruction,
    requestId: generationRequestId,
    userId: reminder.user_id,
  });
  const drafts = generated.drafts;

  for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx];
    const draft = drafts[idx] ||
      fallbackDraftFromInstruction(reminder.message_instruction);
    const payload = {
      source: "recurring_reminder_seed_until_sunday",
      recurring_reminder_id: reminder.id,
      reminder_instruction: reminder.message_instruction,
      reminder_rationale: reminder.rationale ?? null,
      instruction: reminder.message_instruction,
      event_grounding: liveTarget.grounding || "",
      target_kind: reminder.target_kind ?? "none",
      target_plan_item_id: reminder.target_plan_item_id ?? null,
      target_action_family_key: reminder.target_action_family_key ?? null,
      target_generated_temp_id: reminder.target_generated_temp_id ?? null,
      target_binding_policy: reminder.target_binding_policy ?? "none",
      target_lifecycle_policy: reminder.target_lifecycle_policy ??
        "independent",
      live_target_item_id: liveTarget.item ? str(liveTarget.item.id) : null,
      personalization_level_configured: params.level,
      personalization_level_effective: params.level,
      generated_at: new Date().toISOString(),
      slot_day_offset: slot.dayOffset,
      slot_weekday: slot.weekday,
      slot_local_time_hhmm: localTime,
      slot_timezone: timezone,
      slot_intended_scheduled_for: slot.scheduledFor,
      seed_mode: "until_next_sunday_cron",
      generated_by_ai: Boolean(drafts[idx]),
    };

    const { error: upsertError } = await params.admin
      .from("scheduled_checkins")
      .upsert(
        {
          user_id: reminder.user_id,
          origin: "rendez_vous",
          recurring_reminder_id: reminder.id,
          event_context: eventContext,
          draft_message: draft,
          message_mode: reminderHasLiveLifecycle(reminder)
            ? "dynamic"
            : "static",
          message_payload: payload,
          scheduled_for: slot.scheduledFor,
          status: "pending",
        } as any,
        { onConflict: "user_id,event_context,scheduled_for" },
      );
    if (upsertError) throw upsertError;
  }

  let repairDbAttempts = 0;
  const expectedScheduledFor = new Set(slots.map((s) => s.scheduledFor));
  const { data: existingRows } = await params.admin
    .from("scheduled_checkins")
    .select("scheduled_for")
    .eq("user_id", reminder.user_id)
    .eq("event_context", eventContext)
    .in("scheduled_for", [...expectedScheduledFor]);

  const existingSet = new Set(
    (existingRows ?? []).map((r: any) => {
      const ms = new Date(String(r.scheduled_for ?? "")).getTime();
      return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
    }).filter(Boolean),
  );
  const missingSlots = slots.filter((s) => !existingSet.has(s.scheduledFor));
  if (missingSlots.length > 0) {
    repairDbAttempts++;
    for (const slot of missingSlots) {
      const payload = {
        source: "recurring_reminder_seed_until_sunday_repair",
        recurring_reminder_id: reminder.id,
        reminder_instruction: reminder.message_instruction,
        reminder_rationale: reminder.rationale ?? null,
        instruction: reminder.message_instruction,
        event_grounding: liveTarget.grounding || "",
        target_kind: reminder.target_kind ?? "none",
        target_plan_item_id: reminder.target_plan_item_id ?? null,
        target_action_family_key: reminder.target_action_family_key ?? null,
        target_generated_temp_id: reminder.target_generated_temp_id ?? null,
        target_binding_policy: reminder.target_binding_policy ?? "none",
        target_lifecycle_policy: reminder.target_lifecycle_policy ??
          "independent",
        live_target_item_id: liveTarget.item ? str(liveTarget.item.id) : null,
        personalization_level_configured: params.level,
        personalization_level_effective: params.level,
        generated_at: new Date().toISOString(),
        slot_day_offset: slot.dayOffset,
        slot_weekday: slot.weekday,
        slot_local_time_hhmm: localTime,
        slot_timezone: timezone,
        slot_intended_scheduled_for: slot.scheduledFor,
        seed_mode: "until_next_sunday_cron",
        generated_by_ai: false,
      };
      const { error: repairUpsertError } = await params.admin
        .from("scheduled_checkins")
        .upsert(
          {
            user_id: reminder.user_id,
            origin: "rendez_vous",
            recurring_reminder_id: reminder.id,
            event_context: eventContext,
            draft_message: fallbackDraftFromInstruction(
              reminder.message_instruction,
            ),
            message_mode: reminderHasLiveLifecycle(reminder)
              ? "dynamic"
              : "static",
            message_payload: payload,
            scheduled_for: slot.scheduledFor,
            status: "pending",
          } as any,
          { onConflict: "user_id,event_context,scheduled_for" },
        );
      if (repairUpsertError) throw repairUpsertError;
    }
  }

  const { data: finalRows } = await params.admin
    .from("scheduled_checkins")
    .select("scheduled_for")
    .eq("user_id", reminder.user_id)
    .eq("event_context", eventContext)
    .in("scheduled_for", [...expectedScheduledFor]);
  const finalInserted = (finalRows ?? []).length;
  console.log(
    JSON.stringify({
      tag: "recurring_seed_cardinality",
      reminder_id: reminder.id,
      expected_slots: slots.length,
      generated_messages: generated.generatedCount,
      missing_count: Math.max(0, slots.length - finalInserted),
      repair_attempts: generated.repairAttempts + repairDbAttempts,
      final_inserted: finalInserted,
      model: RDV_GENERATION_MODEL,
      source: "classify-recurring-reminder",
      request_id: generationRequestId,
    }),
  );

  await params.admin
    .from("user_recurring_reminders")
    .update({
      last_drafted_at: new Date().toISOString(),
      last_draft_message: drafts[0] ||
        fallbackDraftFromInstruction(reminder.message_instruction),
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", reminder.id)
    .eq("user_id", reminder.user_id);

  return finalInserted;
}

function buildContextPolicy(
  level: PersonalizationLevel,
): Record<string, unknown> {
  if (level === 1) {
    return {
      include_creation_instruction: true,
      include_creation_rationale: true,
      include_plan_why: false,
      include_plan_blockers: false,
      include_cycle_context: false,
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
      include_cycle_context: false,
      include_topic_memories_last_week: false,
      include_topic_metadata: false,
    };
  }
  return {
    include_creation_instruction: true,
    include_creation_rationale: true,
    include_plan_why: true,
    include_plan_blockers: true,
    include_cycle_context: false,
    include_topic_memories_last_week: true,
    include_topic_metadata: true,
  };
}

function heuristicLevel(
  instruction: string,
  rationale: string,
): PersonalizationLevel {
  const text = `${instruction}\n${rationale}`.toLowerCase();
  const needsTopicMemory =
    /ce qu'?on s'?est dit|nos discussions|mes conversations|topic|mémoire|memory|semaine derni[èe]re|historique/
      .test(text);
  if (needsTopicMemory) return 3;

  const needsPlanContext =
    /pourquoi|je continue|blocage|objectif|cap|progression|progr[eè]s|doute|rechute|north star|[ée]toile polaire/
      .test(text);
  if (needsPlanContext) return 2;

  return 1;
}

async function classifyWithAI(params: {
  instruction: string;
  rationale: string;
  requestId: string;
  userId?: string | null;
}): Promise<{ level: PersonalizationLevel; reason: string }> {
  const { instruction, rationale, requestId, userId } = params;
  const systemPrompt = `
Tu classes un rendez-vous WhatsApp de Sophia en niveau de personnalisation.

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
Rendez-vous:
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
      userId: userId ?? undefined,
      source: "classify-recurring-reminder",
      model: getGlobalAiModel("gpt-5.2"),
      maxRetries: 2,
      forceRealAi: true,
    },
  );

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const levelRaw = Number((parsed as any)?.level);
  const reason = str((parsed as any)?.reason).slice(0, 180);
  const level: PersonalizationLevel = levelRaw === 3
    ? 3
    : levelRaw === 2
    ? 2
    : 1;
  return {
    level,
    reason: reason || "Classification automatique par intention utilisateur.",
  };
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
    const fullReset = Boolean((body as any)?.full_reset);
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

    const serviceAuthorized = authHeader === `Bearer ${serviceKey}` ||
      req.headers.get("apikey") === serviceKey;
    let userId = "";
    if (serviceAuthorized) {
      userId = str((body as any)?.user_id);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: authData, error: authErr } = await userClient.auth
        .getUser();
      if (authErr || !authData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = authData.user.id;
    }

    const requestId = `${crypto.randomUUID()}:classify-recurring-reminder`;
    const rateLimited = await enforceRateLimit(req, requestId, {
      key: `classify-recurring-reminder:${userId}`,
      windows: RATE_PRESETS.llmStandard,
    });
    if (rateLimited) return rateLimited;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: reminder, error: reminderErr } = await admin
      .from("user_recurring_reminders")
      .select(
        "id,user_id,transformation_id,initiative_kind,source_potion_session_id,message_instruction,rationale,local_time_hhmm,scheduled_days,status,target_kind,target_plan_item_id,target_action_family_key,target_generated_temp_id,target_binding_policy,target_lifecycle_policy,initiative_metadata",
      )
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

    let level: PersonalizationLevel = heuristicLevel(instruction, rationale);
    let reason = "Classification heuristique.";
    try {
      const ai = await classifyWithAI({ instruction, rationale, requestId, userId });
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

    if (str((reminder as any).initiative_kind) === "potion_follow_up") {
      return new Response(
        JSON.stringify({
          success: true,
          reminder_id: reminderId,
          personalization_level: level,
          context_policy: contextPolicy,
          classification_reason: reason,
          seeded_checkins: 0,
          skipped_seed_reason: "potion_follow_up_prescheduled",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (fullReset) {
      const eventContext = `recurring_reminder:${reminderId}`;
      const { error: purgeErr } = await admin
        .from("scheduled_checkins")
        .delete()
        .eq("user_id", userId)
        .eq("event_context", eventContext);
      if (purgeErr) throw purgeErr;
    }

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("access_tier")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const seededCheckins =
      isWhatsappSchedulingTierEligible((profile as any)?.access_tier)
        ? await seedReminderUntilNextSunday({
          admin,
          reminder: reminder as any,
          level,
        })
        : 0;

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
