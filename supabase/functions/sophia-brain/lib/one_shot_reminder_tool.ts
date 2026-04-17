import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import { getUserTimeContext } from "../../_shared/user_time_context.ts";

export type OneShotReminderToolOutcome =
  | {
    detected: false;
  }
  | {
    detected: true;
    status: "needs_clarify";
    reason: "missing_time" | "past_time" | "unsupported_time";
    user_message: string;
  }
  | {
    detected: true;
    status: "failed";
    reason: "insert_failed";
    user_message: string;
    error_message: string;
  }
  | {
    detected: true;
    status: "success";
    user_message: string;
    scheduled_for: string;
    scheduled_for_local_label: string;
    reminder_instruction: string;
    event_context: string;
    inserted_checkin_id: string;
  };

type ParsedReminderRequest = {
  scheduledFor: string;
  reminderInstruction: string;
  eventContext: string;
};

type AiReminderFallbackExtraction = {
  is_one_shot?: boolean;
  confidence?: number;
  normalized_request?: string | null;
  reminder_instruction?: string | null;
  scheduled_for_utc?: string | null;
};

const REMINDER_REQUEST_PREFIX_REGEX =
  /\b(?:rappelle(?:-|\s)?moi|tu\s+peux\s+me\s+rappeler|peux-tu\s+me\s+rappeler|peux\s+tu\s+me\s+rappeler|tu\s+peux\s+m['’]envoyer\s+un\s+rappel|peux-tu\s+m['’]envoyer\s+un\s+rappel|peux\s+tu\s+m['’]envoyer\s+un\s+rappel|tu\s+peux\s+me\s+faire\s+un\s+rappel|peux-tu\s+me\s+faire\s+un\s+rappel|peux\s+tu\s+me\s+faire\s+un\s+rappel|tu\s+pourrais\s+me\s+faire\s+un\s+rappel|tu\s+pourrais\s+m['’]envoyer\s+un\s+rappel|est(?:-|\s)?ce\s+que\s+tu\s+peux\s+me\s+faire\s+un\s+rappel|est(?:-|\s)?ce\s+que\s+tu\s+peux\s+m['’]envoyer\s+un\s+rappel|envoie(?:-|\s)?moi\s+un\s+rappel|fais(?:-|\s)?moi\s+un\s+rappel|mets(?:-|\s)?moi\s+un\s+rappel|remind\s+me)\b([\s\S]*)$/i;

function compactText(value: unknown, maxLen = 240): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen
    ? text
    : `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

function safeTrim(value: unknown): string {
  return String(value ?? "").trim();
}

function slugify(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function extractReminderClause(message: string): string {
  const match = message.match(REMINDER_REQUEST_PREFIX_REGEX);
  return compactText(match?.[1] ?? "");
}

function isRecurringReminderRequest(message: string): boolean {
  const text = String(message ?? "").toLowerCase();
  if (!/\brappel|rappelle|remind\b/.test(text)) return false;
  return /\b(tous?\s+les|toutes?\s+les|chaque|quotidien|quotidienne|tous?\s+les\s+jours|chaque\s+jour|hebdo|hebdomadaire)\b/i
    .test(text);
}

function hasResolvableOneShotTimeHint(message: string): boolean {
  const text = String(message ?? "");
  return /\bdans\s+un\s+quart\s+d['’]heure\b/i.test(text) ||
    /\bdans\s+une\s+demi(?:-|\s)heure\b/i.test(text) ||
    /\bdans\s+\d{1,3}\s*(?:minutes?|min|heures?|h|jours?)\b/i.test(text) ||
    /\b(aujourd['’]hui|ce\s+soir|cet\s+apr[eè]s-midi|demain|apr[eè]s-demain)\b/i
      .test(text);
}

export function isLikelyOneShotReminderRequest(message: string): boolean {
  const text = compactText(message, 500);
  if (!text || isRecurringReminderRequest(text)) return false;
  if (extractReminderClause(text)) return true;
  if (!/\brappel|rappelle|remind\b/i.test(text)) return false;
  return hasResolvableOneShotTimeHint(text);
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function localDateParts(timezone: string, now = new Date()): {
  year: string;
  month: string;
  day: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return { year, month, day };
}

function parseHHMM(rawHour: string, rawMinute?: string): string {
  const hh = Math.max(0, Math.min(23, Number(rawHour)));
  const mm = Math.max(0, Math.min(59, Number(rawMinute ?? "0")));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function computeScheduledForFromLocal(params: {
  timezone: string;
  dayOffset: number;
  localTimeHHMM: string;
  now?: Date;
}): string {
  const tz = safeTrim(params.timezone) || "Europe/Paris";
  const dayOffset = Number.isFinite(Number(params.dayOffset))
    ? Math.max(0, Math.floor(Number(params.dayOffset)))
    : 1;

  const match = safeTrim(params.localTimeHHMM).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("Invalid local_time_hhmm");
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2])));

  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const now = params.now ?? new Date();
  const nowParts = dtf.formatToParts(now);
  const year = Number(nowParts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(nowParts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(nowParts.find((p) => p.type === "day")?.value ?? "1");

  const targetUtcGuess = new Date(
    Date.UTC(year, month - 1, day + dayOffset, hh, mm, 0),
  );
  const localParts = dtf.formatToParts(targetUtcGuess);
  const localYear = Number(
    localParts.find((p) => p.type === "year")?.value ?? year,
  );
  const localMonth = Number(
    localParts.find((p) => p.type === "month")?.value ?? month,
  );
  const localDay = Number(
    localParts.find((p) => p.type === "day")?.value ?? day,
  );
  const localHour = Number(
    localParts.find((p) => p.type === "hour")?.value ?? "0",
  );
  const localMinute = Number(
    localParts.find((p) => p.type === "minute")?.value ?? "0",
  );

  const minuteDelta = (hh - localHour) * 60 + (mm - localMinute);
  const dayDelta = Date.UTC(year, month - 1, day + dayOffset) -
    Date.UTC(localYear, localMonth - 1, localDay);
  const corrected = new Date(
    targetUtcGuess.getTime() + minuteDelta * 60_000 + dayDelta,
  );
  return corrected.toISOString();
}

function parseScheduledForFromAbsoluteHint(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): string | null {
  const text = String(args.message ?? "");
  const match = text.match(
    /\b(aujourd['’]hui|ce\s+soir|cet\s+apr[eè]s-midi|demain|apr[eè]s-demain)\b(?:\s+(?:vers|à|a))?\s*(\d{1,2})(?:[:h](\d{2}))?/i,
  );
  if (!match) return null;

  const dayHint = match[1].toLowerCase();
  const hhmm = parseHHMM(match[2], match[3]);
  const dayOffset = /apr[eè]s-demain/i.test(dayHint)
    ? 2
    : /demain/i.test(dayHint)
    ? 1
    : 0;

  const scheduledFor = computeScheduledForFromLocal({
    timezone: args.timezone,
    dayOffset,
    localTimeHHMM: hhmm,
    now: new Date(args.nowIso),
  });
  return scheduledFor;
}

function parseScheduledForFromRelativeHint(args: {
  message: string;
  nowIso: string;
}): string | null {
  const text = String(args.message ?? "").toLowerCase();

  if (/\bdans\s+un\s+quart\s+d['’]heure\b/i.test(text)) {
    return addMinutes(args.nowIso, 15);
  }
  if (/\bdans\s+une\s+demi(?:-|\s)heure\b/i.test(text)) {
    return addMinutes(args.nowIso, 30);
  }

  const minuteMatch = text.match(/\bdans\s+(\d{1,3})\s*(?:minutes?|min)\b/i);
  if (minuteMatch) {
    return addMinutes(args.nowIso, Number(minuteMatch[1]));
  }

  const hourMatch = text.match(/\bdans\s+(\d{1,2})\s*(?:heures?|h)\b/i);
  if (hourMatch) {
    return addMinutes(args.nowIso, Number(hourMatch[1]) * 60);
  }

  const dayMatch = text.match(/\bdans\s+(\d{1,2})\s*jours?\b/i);
  if (dayMatch) {
    const target = new Date(
      new Date(args.nowIso).getTime() +
        Number(dayMatch[1]) * 24 * 60 * 60 * 1000,
    );
    return target.toISOString();
  }

  return null;
}

function extractReminderInstruction(message: string): string {
  const full = compactText(message, 500);
  const clause = extractReminderClause(full) || full;

  let explicitTarget = clause.match(
      /\b(?:de\s+manière\s+à\s+ce\s+que|de\s+maniere\s+à\s+ce\s+que|de\s+maniere\s+a\s+ce\s+que|de\s+façon\s+à\s+ce\s+que|de\s+facon\s+a\s+ce\s+que|pour\s+que)\s+je\s+fasse\s+(.+)$/i,
    )?.[1]
    ? `faire ${
      clause.match(
        /\b(?:de\s+manière\s+à\s+ce\s+que|de\s+maniere\s+à\s+ce\s+que|de\s+maniere\s+a\s+ce\s+que|de\s+façon\s+à\s+ce\s+que|de\s+facon\s+a\s+ce\s+que|pour\s+que)\s+je\s+fasse\s+(.+)$/i,
      )?.[1] ?? ""
    }`
    : undefined;
  explicitTarget = explicitTarget ??
    clause.match(
      /\bpour\s+me\s+(?:dire|rappeler|faire\s+penser)(?:\s+de)?\s+(.+)$/i,
    )?.[1] ??
    clause.match(/\bde\s+(.+)$/i)?.[1] ??
    clause.match(/\bpour\s+(.+)$/i)?.[1] ??
    "";

  const cleaned = compactText(
    explicitTarget
      .replace(/\bmanière\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bmaniere\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bmaniere\s+a\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bfaçon\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bfacon\s+a\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bpour\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\b(?:stp|s['’]il te plaît|s'il te plait|please)\b/gi, " ")
      .replace(/\s*(?:[?!.]+|[:;]-?[)(DPp/]+)+\s*$/g, "")
      .replace(/\s*(?:<3|xd|xD|XD)+\s*$/g, "")
      .replace(/[?!.]+$/g, ""),
    140,
  );
  if (cleaned) return cleaned;
  return "ce que tu as prévu";
}

export function parseOneShotReminderRequest(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  const message = compactText(args.message, 500);
  if (!message) return null;
  if (isRecurringReminderRequest(message)) return null;
  if (!extractReminderClause(message)) return null;

  const absoluteScheduledFor = parseScheduledForFromAbsoluteHint({
    message,
    timezone: args.timezone,
    nowIso: args.nowIso,
  });
  const relativeScheduledFor = parseScheduledForFromRelativeHint({
    message,
    nowIso: args.nowIso,
  });
  const scheduledFor = absoluteScheduledFor ?? relativeScheduledFor;
  if (!scheduledFor) return null;

  const reminderInstruction = extractReminderInstruction(message);
  const reminderSlug = slugify(reminderInstruction) || "generic";
  const eventContext = `one_shot_reminder:${reminderSlug}`;
  return {
    scheduledFor,
    reminderInstruction,
    eventContext,
  };
}

function parseAiReminderFallbackOutput(
  raw: unknown,
): AiReminderFallbackExtraction | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const jsonCandidate = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    const parsed = JSON.parse(jsonCandidate);
    return parsed && typeof parsed === "object"
      ? parsed as AiReminderFallbackExtraction
      : null;
  } catch {
    return null;
  }
}

async function inferOneShotReminderRequestWithAi(args: {
  message: string;
  timezone: string;
  nowIso: string;
  requestId?: string;
}): Promise<ParsedReminderRequest | null> {
  const systemPrompt = [
    "Tu es un extracteur ultra strict de rappels ponctuels.",
    "Tu dois detecter si le message utilisateur demande un rappel one-shot (non recurrent), puis normaliser la demande.",
    "Retourne uniquement du JSON valide.",
    'Schema: {"is_one_shot":true|false,"confidence":0..1,"normalized_request":"...","reminder_instruction":"...","scheduled_for_utc":"ISO8601|null"}',
    "Règles:",
    "- true uniquement si la demande est bien un rappel ponctuel demande a Sophia.",
    "- false si c'est recurrent, ambigu, ou si le user ne demande pas vraiment un rappel.",
    '- normalized_request doit reformuler en francais simple type: "Rappelle-moi dans 10 minutes de faire mes pompes".',
    "- reminder_instruction doit etre bref et actionnable.",
    "- scheduled_for_utc doit etre un ISO UTC seulement si l'heure est deduisible de facon fiable depuis le message + maintenant + timezone.",
    `- Maintenant UTC: ${args.nowIso}`,
    `- Timezone utilisateur: ${args.timezone}`,
  ].join("\n");

  try {
    const raw = await generateWithGemini(
      systemPrompt,
      compactText(args.message, 500),
      0.1,
      true,
      [],
      "auto",
      {
        requestId: args.requestId,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "one_shot_reminder_tool:fallback",
      },
    );
    const parsed = parseAiReminderFallbackOutput(raw);
    if (!parsed?.is_one_shot) return null;
    const confidence = Number(parsed.confidence ?? 0);
    if (!Number.isFinite(confidence) || confidence < 0.72) return null;

    const normalizedRequest = compactText(parsed.normalized_request ?? "", 240);
    if (normalizedRequest) {
      const reparsed = parseOneShotReminderRequest({
        message: normalizedRequest,
        timezone: args.timezone,
        nowIso: args.nowIso,
      });
      if (reparsed) return reparsed;
    }

    const reminderInstruction = compactText(
      parsed.reminder_instruction ?? "",
      140,
    );
    const scheduledForRaw = safeTrim(parsed.scheduled_for_utc ?? "");
    const scheduledMs = scheduledForRaw
      ? new Date(scheduledForRaw).getTime()
      : NaN;
    if (!reminderInstruction || !Number.isFinite(scheduledMs)) return null;

    return {
      scheduledFor: new Date(scheduledMs).toISOString(),
      reminderInstruction,
      eventContext: `one_shot_reminder:${
        slugify(reminderInstruction) || "generic"
      }`,
    };
  } catch {
    return null;
  }
}

function formatLocalReminderLabel(args: {
  scheduledFor: string;
  timezone: string;
  locale: string;
}): string {
  return new Intl.DateTimeFormat(args.locale || "fr-FR", {
    timeZone: args.timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(args.scheduledFor));
}

export async function maybeCreateOneShotReminder(params: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  requestId?: string;
}): Promise<OneShotReminderToolOutcome> {
  if (!isLikelyOneShotReminderRequest(params.message)) {
    return { detected: false };
  }

  const tctx = await getUserTimeContext({
    supabase: params.supabase,
    userId: params.userId,
  });
  const parsed = parseOneShotReminderRequest({
    message: params.message,
    timezone: tctx.user_timezone,
    nowIso: tctx.now_utc,
  }) ?? await inferOneShotReminderRequestWithAi({
    message: params.message,
    timezone: tctx.user_timezone,
    nowIso: tctx.now_utc,
    requestId: params.requestId,
  });
  if (!parsed) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "missing_time",
      user_message: compactText(params.message, 500),
    };
  }

  const scheduledMs = new Date(parsed.scheduledFor).getTime();
  const nowMs = new Date(tctx.now_utc).getTime();
  if (!Number.isFinite(scheduledMs) || scheduledMs <= nowMs + 30_000) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "past_time",
      user_message: compactText(params.message, 500),
    };
  }

  try {
    const { data, error } = await params.supabase
      .from("scheduled_checkins")
      .upsert({
        user_id: params.userId,
        origin: "initiative",
        event_context: parsed.eventContext,
        draft_message: null,
        message_mode: "dynamic",
        message_payload: {
          source: "companion_one_shot_reminder_tool",
          reminder_kind: "one_shot",
          reminder_instruction: parsed.reminderInstruction,
          instruction:
            `Rappel ponctuel demandé explicitement par l'utilisateur. Rappelle-lui de ${parsed.reminderInstruction}.`,
          event_grounding: compactText(
            `L'utilisateur a demandé explicitement un rappel ponctuel à propos de: ${parsed.reminderInstruction}.`,
            240,
          ),
          request_text: compactText(params.message, 500),
          user_timezone: tctx.user_timezone,
        },
        scheduled_for: parsed.scheduledFor,
        status: "pending",
      } as any, {
        onConflict: "user_id,event_context,scheduled_for",
      })
      .select("id,scheduled_for,event_context")
      .single();
    if (error) throw error;

    const actualScheduledFor = String(
      (data as any)?.scheduled_for ?? parsed.scheduledFor,
    );
    return {
      detected: true,
      status: "success",
      user_message: compactText(params.message, 500),
      scheduled_for: actualScheduledFor,
      scheduled_for_local_label: formatLocalReminderLabel({
        scheduledFor: actualScheduledFor,
        timezone: tctx.user_timezone,
        locale: tctx.user_locale,
      }),
      reminder_instruction: parsed.reminderInstruction,
      event_context: String(
        (data as any)?.event_context ?? parsed.eventContext,
      ),
      inserted_checkin_id: String((data as any)?.id ?? ""),
    };
  } catch (error) {
    return {
      detected: true,
      status: "failed",
      reason: "insert_failed",
      user_message: compactText(params.message, 500),
      error_message: compactText(
        error instanceof Error ? error.message : String(error),
        180,
      ) || "insert_failed",
    };
  }
}

export function buildOneShotReminderAddon(
  outcome: OneShotReminderToolOutcome,
): string {
  if (!outcome.detected) return "";

  if (outcome.status === "success") {
    return [
      "",
      "=== ADDON ONE-SHOT REMINDER TOOL ===",
      "- Le reminder tool a deja reussi.",
      `- Confirmation DB: scheduled_checkin_id=${
        outcome.inserted_checkin_id || "ok"
      }.`,
      `- Heure locale programmee: ${outcome.scheduled_for_local_label}.`,
      `- Objet du rappel: ${outcome.reminder_instruction}.`,
      "- Tu peux confirmer clairement que le rappel est programme.",
      "- IMPORTANT: confirme seulement la programmation en base / dans le systeme. Ne promets rien de plus que ce succes confirme.",
      "- Si le message user contenait un autre sujet, reponds aussi a ce sujet.",
      "",
    ].join("\n");
  }

  if (outcome.status === "needs_clarify") {
    return [
      "",
      "=== ADDON ONE-SHOT REMINDER TOOL ===",
      "- Le user demande bien un rappel ponctuel, mais l'horaire exact n'a pas pu etre resolu de facon fiable.",
      `- Raison: ${outcome.reason}.`,
      "- N'annonce PAS que le rappel est programme.",
      "- Demande une seule precision courte sur l'heure / le moment exact.",
      "",
    ].join("\n");
  }

  return [
    "",
    "=== ADDON ONE-SHOT REMINDER TOOL ===",
    "- Une tentative de programmation de rappel ponctuel a echoue.",
    `- Erreur technique: ${outcome.error_message}.`,
    "- N'annonce PAS que le rappel est programme.",
    "- Dis simplement qu'il y a eu un souci technique pour le programmer maintenant.",
    "",
  ].join("\n");
}

export function summarizeOneShotReminderOutcome(
  outcome: OneShotReminderToolOutcome,
): {
  executedTools: string[];
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
} {
  if (!outcome.detected) {
    return { executedTools: [], toolExecution: "none" };
  }
  if (outcome.status === "success") {
    return {
      executedTools: ["create_one_shot_reminder"],
      toolExecution: "success",
    };
  }
  if (outcome.status === "needs_clarify") {
    return {
      executedTools: ["create_one_shot_reminder"],
      toolExecution: "blocked",
    };
  }
  return {
    executedTools: ["create_one_shot_reminder"],
    toolExecution: "failed",
  };
}
