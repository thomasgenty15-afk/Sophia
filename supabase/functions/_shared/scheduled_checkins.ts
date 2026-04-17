import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { generateWithGemini } from "./gemini.ts";
import {
  buildWatcherScopePromptBlock,
  fetchCheckinExclusionSnapshot,
  sanitizeWatcherGrounding,
  watcherGeneratedTextViolatesScope,
} from "./checkin_scope.ts";
import { buildUserTimeContextFromValues } from "./user_time_context.ts";
import { DEFAULT_TIMEZONE } from "./v2-constants.ts";
import {
  formatEventMemoriesForPrompt,
  retrieveEventMemories,
} from "../sophia-brain/event_memory.ts";
import {
  formatGlobalMemoriesForPrompt,
  retrieveGlobalMemories,
} from "../sophia-brain/global_memory.ts";
import {
  formatTopicMemoriesForPrompt,
  retrieveTopicMemories,
} from "../sophia-brain/topic_memory.ts";
import {
  buildRelationPreferencesPromptBlock,
  getUserRelationPreferences,
} from "../sophia-brain/relation_preferences_engine.ts";
const RDV_GENERATION_MODEL = "gpt-5.2";

function safeTrim(s: unknown): string {
  return String(s ?? "").trim();
}

function clampText(s: string, maxChars: number): string {
  const t = safeTrim(s);
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars - 1).trimEnd() + "…";
}

function stripLeadingGreeting(text: string): string {
  return String(text ?? "").trim().replace(
    /^(hello|bonjour|salut|coucou|hey)\s*[!,.:\-]?\s*/i,
    "",
  ).trim();
}

function stripLeadingCheckinAnnouncement(text: string): string {
  return String(text ?? "").trim().replace(
    /^(petit|mini)?\s*check-?in(?:\s+(du|de la|de l[’'])\s+\w+)?\s*[:!,. -]*\s*/i,
    "",
  ).trim();
}

function stripLeadingAcknowledgementStarter(text: string): string {
  let value = String(text ?? "").trim();
  const patterns = [
    /^(?:ok(?:ay)?|d['’]accord|ça marche|ca marche|c['’]est parti|parfait)\b\s*[,!:. -]*/i,
  ];
  for (let i = 0; i < 3; i++) {
    const before = value;
    for (const pattern of patterns) value = value.replace(pattern, "").trim();
    if (value === before) break;
  }
  return value;
}

function stripLeadingContinuationStarter(text: string): string {
  let value = String(text ?? "").trim();
  const patterns = [
    /^(toi|et toi)\b\s*[,!:. -]*/i,
    /^(et|d['’]ailleurs|du coup|alors|bon|bah|eh bien|sinon)\b\s*[,!:. -]*/i,
  ];
  for (let i = 0; i < 3; i++) {
    const before = value;
    for (const pattern of patterns) value = value.replace(pattern, "").trim();
    if (value === before) break;
  }
  return value;
}

function uppercaseFirstLetter(text: string): string {
  const value = String(text ?? "").trim();
  const match = value.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/);
  if (!match || match.index == null) return value;
  const idx = match.index;
  return value.slice(0, idx) + value.charAt(idx).toUpperCase() +
    value.slice(idx + 1);
}

function pickColdOpenGreeting(): string {
  const greetings = ["Hello!", "Salut !", "Hey !", "Coucou !"];
  const idx = Math.floor(Math.random() * greetings.length);
  return greetings[idx] ?? "Hello!";
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function buildWatcherScopedFallbackMessage(): string {
  return "Je pense a ce moment important qui approche. Tu te sens comment a l'idee de le vivre ?";
}

export function allowRelaunchGreetingFromLastMessage(params: {
  lastInboundAt?: unknown;
  lastOutboundAt?: unknown;
  thresholdHours?: number;
}): boolean {
  const inboundMs = parseTimestampMs(params.lastInboundAt);
  const outboundMs = parseTimestampMs(params.lastOutboundAt);
  const lastMessageMs = Math.max(
    inboundMs ?? -Infinity,
    outboundMs ?? -Infinity,
  );
  if (!Number.isFinite(lastMessageMs)) return true;
  const thresholdHours = Number.isFinite(Number(params.thresholdHours))
    ? Math.max(0, Number(params.thresholdHours))
    : 10;
  const deltaHours = Math.max(0, Date.now() - lastMessageMs) / (60 * 60 * 1000);
  return deltaHours >= thresholdHours;
}

export function applyWhatsappProactiveOpeningPolicy(params: {
  text: string;
  allowRelaunchGreeting: boolean;
  fallback?: string;
}): string {
  const fallback = String(params.fallback ?? "Comment ça va ?").trim() ||
    "Comment ça va ?";
  const noGreeting = stripLeadingGreeting(params.text);
  const noAnnouncement = stripLeadingCheckinAnnouncement(noGreeting);
  const noAcknowledgementStarter = stripLeadingAcknowledgementStarter(
    noAnnouncement,
  );
  const noContinuationStarter = stripLeadingContinuationStarter(
    noAcknowledgementStarter,
  );
  const normalized = uppercaseFirstLetter(noContinuationStarter || fallback);
  if (!params.allowRelaunchGreeting) return normalized;
  return `${pickColdOpenGreeting()} ${normalized}`;
}

export function applyScheduledCheckinGreetingPolicy(
  params: { text: string; allowRelaunchGreeting: boolean },
): string {
  return applyWhatsappProactiveOpeningPolicy({
    text: params.text,
    allowRelaunchGreeting: params.allowRelaunchGreeting,
    fallback: "Comment ça va depuis tout à l'heure ?",
  });
}

export async function hasAnyWhatsappMessagesInLocalDay(params: {
  admin: SupabaseClient;
  userId: string;
  timezone: string;
  now?: Date;
}): Promise<boolean> {
  const startIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 0,
    localTimeHHMM: "00:00",
    now: params.now ?? new Date(),
  });
  const endIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 1,
    localTimeHHMM: "00:00",
    now: params.now ?? new Date(),
  });

  const { data, error } = await params.admin
    .from("chat_messages")
    .select("id")
    .eq("user_id", params.userId)
    .eq("scope", "whatsapp")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function generateDynamicWhatsAppCheckinMessage(params: {
  admin: SupabaseClient;
  userId: string;
  eventContext: string;
  scheduledFor?: string;
  instruction?: string;
  eventGrounding?: string;
  source?: string;
  requestId?: string;
}): Promise<string> {
  const { admin, userId } = params;
  const source = safeTrim(params.source);
  const isWatcherCheckin = source === "trigger-watcher-batch";
  const eventContext = clampText(params.eventContext, 180);
  const instruction = clampText(params.instruction ?? "", 500);
  const watcherScopeSnapshot = isWatcherCheckin
    ? await fetchCheckinExclusionSnapshot({ admin, userId })
    : null;
  const eventGrounding = clampText(
    isWatcherCheckin && watcherScopeSnapshot
      ? sanitizeWatcherGrounding(
        params.eventGrounding ?? "",
        watcherScopeSnapshot,
      )
      : (params.eventGrounding ?? ""),
    320,
  );

  const { data: prof } = await admin
    .from("profiles")
    .select("timezone, locale")
    .eq("id", userId)
    .maybeSingle();
  const tctx = buildUserTimeContextFromValues({
    timezone: (prof as any)?.timezone ?? null,
    locale: (prof as any)?.locale ?? null,
  });
  const relationPreferences = await getUserRelationPreferences(admin, userId)
    .catch(() => null);
  const relationPreferenceBlock = buildRelationPreferencesPromptBlock(
    relationPreferences,
  );

  // Pull a compact WhatsApp history for local continuity.
  const { data: msgs, error } = await admin
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw error;

  const transcript = (msgs ?? [])
    .slice()
    .reverse()
    .map((m: any) =>
      `${m.created_at} ${m.role.toUpperCase()}: ${String(m.content ?? "")}`
    )
    .join("\n");
  const retrievalQuery = (
    isWatcherCheckin
      ? [
        eventContext,
        eventGrounding,
      ]
      : [
        eventContext,
        eventGrounding,
        instruction,
        transcript
          .split("\n")
          .slice(-4)
          .join("\n"),
      ]
  ).filter(Boolean).join("\n");
  let memoryContextBlock = "";
  try {
    const [events, topics, globals] = await Promise.all([
      retrieveEventMemories({
        supabase: admin as any,
        userId,
        message: retrievalQuery || eventContext,
        maxResults: 2,
        requestId: params.requestId,
      }),
      retrieveTopicMemories({
        supabase: admin as any,
        userId,
        message: retrievalQuery || eventContext,
        maxResults: 2,
        meta: params.requestId ? { requestId: params.requestId } : undefined,
      }),
      retrieveGlobalMemories({
        supabase: admin as any,
        userId,
        message: retrievalQuery || eventContext,
        maxResults: 2,
      }),
    ]);
    memoryContextBlock = [
      formatEventMemoriesForPrompt(events),
      formatTopicMemoriesForPrompt(topics),
      formatGlobalMemoriesForPrompt(globals),
    ].filter(Boolean).join("\n");
  } catch (e) {
    console.warn(
      "[scheduled_checkins] semantic retrieval failed (non-blocking):",
      e,
    );
  }

  const systemPrompt = [
    "Tu es Sophia (mode Companion) et tu vas envoyer un message WhatsApp de relance (check-in).",
    "",
    "Contraintes WhatsApp (strict):",
    "- 1 message court (2–6 lignes), texte brut, pas de markdown.",
    "- 1 question MAX.",
    "- Naturel, chaleureux, tutoiement.",
    "- N'annonce jamais que c'est un 'check-in' et ne commence jamais par 'Petit check-in', 'Mini check-in' ou équivalent.",
    "- Le corps du message doit rester naturel MEME si une courte salutation type 'Hello !' est ajoutée juste avant au moment de l'envoi.",
    "- Donc le message doit fonctionner aussi SANS salutation: commence par une phrase autonome, jamais par 'Toi,', 'Et', 'D'ailleurs', 'Du coup', ou un simple connecteur.",
    "- La première vraie lettre du message doit être en majuscule.",
    "- Ne promets pas d'autres relances automatiques.",
    "- N'invente pas de contexte non présent dans le transcript.",
    "- Si un vieux contexte contient une durée relative ('dans deux semaines', 'demain', etc.), ne la répète pas mécaniquement.",
    "- Si tu mentionnes le timing de l'événement, base-toi d'abord sur le repère absolu 'scheduled_for_local' ci-dessous.",
    "- Si la mémoire DB et le transcript récent ne racontent pas exactement la même chose, fais confiance d'abord au transcript le plus récent, puis aux dates/heures absolues.",
    isWatcherCheckin && watcherScopeSnapshot
      ? buildWatcherScopePromptBlock(watcherScopeSnapshot)
      : "",
    "",
    "Repères temporels (critiques):",
    tctx.prompt_block,
    "",
    `Contexte de relance (event_context): ${eventContext}`,
    params.scheduledFor
      ? `scheduled_for_local: ${
        new Intl.DateTimeFormat((prof as any)?.locale || "fr-FR", {
          timeZone: tctx.user_timezone,
          weekday: "long",
          day: "2-digit",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(params.scheduledFor))
      }`
      : "",
    eventGrounding
      ? `Contexte figé de l'événement (watcher): ${eventGrounding}`
      : "",
    relationPreferenceBlock,
    instruction ? `Instruction additionnelle: ${instruction}` : "",
    memoryContextBlock
      ? `Mémoire DB pertinente pour ce sujet:\n${memoryContextBlock}`
      : "",
    "",
    "Tu dois prendre en compte la conversation récente ci-dessous (si elle est vide, reste générique).",
  ]
    .filter(Boolean)
    .join("\n");

  const out = await generateWithGemini(
    systemPrompt,
    transcript || "(pas d'historique)",
    0.4,
    false,
    [],
    "auto",
    {
      requestId: params.requestId,
      model: RDV_GENERATION_MODEL,
      source: "scheduled_checkins:dynamic_whatsapp",
      forceRealAi: true,
      userId,
    },
  );

  const text = typeof out === "string"
    ? out
    : safeTrim((out as any)?.text ?? "");
  const cleaned = clampText(text.replace(/\*\*/g, ""), 900);

  if (
    isWatcherCheckin &&
    watcherScopeSnapshot &&
    watcherGeneratedTextViolatesScope(cleaned, watcherScopeSnapshot)
  ) {
    return buildWatcherScopedFallbackMessage();
  }

  return cleaned || "Comment ça va depuis tout à l'heure ?";
}

// Convert a target local time in an IANA timezone to an ISO UTC timestamp.
// This avoids adding a dependency and is robust enough for typical DST transitions.
export function computeScheduledForFromLocal(params: {
  timezone: string;
  dayOffset: number;
  localTimeHHMM: string;
  now?: Date;
}): string {
  const tz = safeTrim(params.timezone) || DEFAULT_TIMEZONE;
  const dayOffset = Number.isFinite(Number(params.dayOffset))
    ? Math.max(0, Math.floor(Number(params.dayOffset)))
    : 1;

  const m = safeTrim(params.localTimeHHMM).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error("Invalid local_time_hhmm (expected HH:MM)");
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));

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
  const parts = dtf.formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const y0 = get("year");
  const mo0 = get("month");
  const d0 = get("day");

  // Add dayOffset in calendar terms.
  const base = new Date(Date.UTC(y0, mo0 - 1, d0));
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const y = base.getUTCFullYear();
  const mo = base.getUTCMonth() + 1;
  const d = base.getUTCDate();

  const target = { y, mo, d, hh, mm };

  const fmtParts = (ms: number) => {
    const ps = dtf.formatToParts(new Date(ms));
    const g = (type: string) =>
      Number(ps.find((p) => p.type === type)?.value ?? "0");
    return {
      y: g("year"),
      mo: g("month"),
      d: g("day"),
      hh: g("hour"),
      mm: g("minute"),
    };
  };

  // Initial guess: treat local as UTC, then refine by comparing formatted parts.
  let guess = Date.UTC(
    target.y,
    target.mo - 1,
    target.d,
    target.hh,
    target.mm,
    0,
    0,
  );
  for (let i = 0; i < 3; i++) {
    const got = fmtParts(guess);
    const desiredAsUtc = Date.UTC(
      target.y,
      target.mo - 1,
      target.d,
      target.hh,
      target.mm,
      0,
      0,
    );
    const gotAsUtc = Date.UTC(got.y, got.mo - 1, got.d, got.hh, got.mm, 0, 0);
    const deltaMin = Math.round((gotAsUtc - desiredAsUtc) / 60000);
    if (deltaMin === 0) break;
    guess -= deltaMin * 60000;
  }

  return new Date(guess).toISOString();
}
