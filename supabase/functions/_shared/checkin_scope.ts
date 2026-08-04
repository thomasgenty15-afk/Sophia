import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  getActiveTransformationRuntime,
  getPlanItemRuntime,
} from "./v2-runtime.ts";

export type CheckinExclusionSnapshot = {
  planActionTitles: string[];
  planActionDetails: string[];
  personalActionTitles: string[];
  frameworkTitles: string[];
  vitalSignTitles: string[];
  recurringReminderLabels: string[];
  ownedFollowUps: OwnedFollowUp[];
  ownedTitles: string[];
};

export type OwnedFollowUpSource =
  | "recurring_reminder"
  | "potion"
  | "one_shot"
  | "scheduled_checkin"
  | "watcher"
  | "daily"
  | "weekly"
  | "unknown";

export type OwnedFollowUp = {
  source: OwnedFollowUpSource;
  label: string;
  message_instruction: string | null;
  event_context: string | null;
  scheduled_for: string | null;
  created_at: string | null;
  updated_at: string | null;
  recurring_reminder_id: string | null;
  source_potion_session_id: string | null;
  target_kind: string | null;
  target_plan_item_id: string | null;
  target_action_family_key: string | null;
  initiative_kind: string | null;
  source_kind: string | null;
};

export type WatcherCandidateCoverageInput = {
  event_context: string;
  event_grounding?: string | null;
  scheduled_for?: string | null;
  target_plan_item_id?: string | null;
  target_action_family_key?: string | null;
  now_iso?: string | null;
};

export type WatcherCandidateCoverageResult = {
  covered: boolean;
  reason: string;
  matched_followup?: OwnedFollowUp;
};

export const WATCHER_OWNED_FOLLOWUP_COOLDOWN_HOURS = 4;

function cleanText(value: unknown, maxLen = 180): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen
    ? text
    : `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function normalizeForMatch(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanNullable(value: unknown, maxLen = 180): string | null {
  const cleaned = cleanText(value, maxLen);
  return cleaned || null;
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isWithinCooldown(
  followup: OwnedFollowUp,
  nowIso?: string | null,
): boolean {
  const nowMs = timestampMs(nowIso) ?? Date.now();
  const threshold = nowMs -
    WATCHER_OWNED_FOLLOWUP_COOLDOWN_HOURS * 60 * 60 * 1000;
  const createdMs = timestampMs(followup.created_at);
  const updatedMs = timestampMs(followup.updated_at);
  return (createdMs !== null && createdMs >= threshold) ||
    (updatedMs !== null && updatedMs >= threshold);
}

function sameLocalDate(left: unknown, right: unknown): boolean {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  if (leftMs === null || rightMs === null) return false;
  return new Date(leftMs).toISOString().slice(0, 10) ===
    new Date(rightMs).toISOString().slice(0, 10);
}

const MATCH_STOP_WORDS = new Set([
  "avec",
  "dans",
  "pour",
  "plus",
  "cette",
  "cet",
  "ces",
  "mes",
  "mon",
  "ton",
  "tes",
  "des",
  "les",
  "une",
  "sur",
  "avant",
  "apres",
  "faire",
  "rappel",
  "relance",
  "petit",
  "message",
  "checkin",
  "check",
]);

function significantTokens(text: string): string[] {
  const tokens = normalizeForMatch(text)
    .split(" ")
    .filter((token) => token.length >= 4 && !MATCH_STOP_WORDS.has(token));
  return [...new Set(tokens)];
}

function tokenOverlapScore(left: string, right: string): {
  hits: number;
  ratio: number;
} {
  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return { hits: 0, ratio: 0 };
  }
  const rightSet = new Set(rightTokens);
  const hits = leftTokens.filter((token) => rightSet.has(token)).length;
  return {
    hits,
    ratio: hits / Math.min(leftTokens.length, rightTokens.length),
  };
}

function ownedFollowUpText(followup: OwnedFollowUp): string {
  return [
    followup.label,
    followup.message_instruction,
    followup.event_context,
    followup.initiative_kind,
    followup.source_kind,
  ].filter(Boolean).join(" ");
}

function sourceFromReminder(row: Record<string, unknown>): OwnedFollowUpSource {
  if (
    row.initiative_kind === "potion_follow_up" || row.source_potion_session_id
  ) {
    return "potion";
  }
  return "recurring_reminder";
}

function sourceFromCheckin(row: Record<string, unknown>): OwnedFollowUpSource {
  const payload = isRecord(row.message_payload) ? row.message_payload : {};
  const eventContext = String(row.event_context ?? "");
  const source = String(payload.source ?? "");
  const reminderKind = String(payload.reminder_kind ?? "");
  if (
    eventContext.startsWith("one_shot_reminder:") ||
    source === "companion_one_shot_reminder_tool" ||
    reminderKind === "one_shot"
  ) return "one_shot";
  if (row.origin === "watcher") return "watcher";
  if (eventContext.includes("daily")) return "daily";
  if (eventContext.includes("weekly")) return "weekly";
  return "scheduled_checkin";
}

function labelFromReminder(row: Record<string, unknown>): string {
  const metadata = isRecord(row.initiative_metadata)
    ? row.initiative_metadata
    : {};
  const targetBinding = isRecord(metadata.target_binding)
    ? metadata.target_binding
    : {};
  return cleanText(
    targetBinding.label ?? row.message_instruction ?? row.rationale ??
      row.initiative_kind ?? "rappel",
    160,
  );
}

function labelFromCheckin(row: Record<string, unknown>): string {
  const payload = isRecord(row.message_payload) ? row.message_payload : {};
  return cleanText(
    payload.reminder_instruction ?? payload.event_grounding ??
      row.draft_message ?? row.event_context ?? "checkin",
    160,
  );
}

function formatPromptList(items: string[], emptyLabel: string): string {
  if (items.length === 0) return emptyLabel;
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function titleMatchesText(text: string, title: string): boolean {
  const haystack = normalizeForMatch(text);
  const needle = normalizeForMatch(title);
  if (!haystack || !needle || needle.length < 4) return false;
  if (haystack.includes(needle) || needle.includes(haystack)) return true;
  const titleTokens = needle.split(" ").filter((token) => token.length >= 4);
  if (titleTokens.length === 0) return false;
  const hitCount =
    titleTokens.filter((token) => haystack.includes(token)).length;
  return hitCount >= Math.min(2, titleTokens.length);
}

function splitIntoClauses(text: string): string[] {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+|\s*[;\n]+\s*/)
    .map((part) => cleanText(part, 220))
    .filter(Boolean);
}

const WATCHER_FORBIDDEN_SCOPE_PATTERNS = [
  /\bplan\b/i,
  /\bobjectifs?\b/i,
  /\bactions?\s+du\s+plan\b/i,
  /\bactions?\s+perso(?:nnelles?)?\b/i,
  /\bframeworks?\b/i,
  /\bjournal\b/i,
  /\bjournaling\b/i,
  /\bvital\s*signs?\b/i,
  /\bsignes?\s+vitaux?\b/i,
  /\bstreaks?\b/i,
  /\bdiscipline\b/i,
  /\bgarder\s+le\s+cap\b/i,
];

const WATCHER_ACCOUNTABILITY_PATTERNS = [
  /\btu\s+l['’]as\s+fait\b/i,
  /\bil\s+te\s+reste\b/i,
  /\bon\s+fait\s+le\s+point\b/i,
  /\btenir\s+le\s+cap\b/i,
  /\bgarder\s+le\s+cap\b/i,
];

const WATCHER_SIMPLIFICATION_PATTERNS = [
  /\b2\s*minutes?\b/i,
  /\bultra\s+court\b/i,
  /\bversion\s+courte\b/i,
  /\bsimplifi(?:e|er|ee|ees|e?s?)\b/i,
  /\bon\s+peut\s+le\s+rendre\b/i,
];

export async function fetchCheckinExclusionSnapshot(params: {
  admin: SupabaseClient;
  userId: string;
}): Promise<CheckinExclusionSnapshot> {
  const runtime = await getActiveTransformationRuntime(
    params.admin,
    params.userId,
  );
  const [
    planItems,
    remindersRes,
    checkinsRes,
  ] = await Promise.all([
    runtime.plan
      ? getPlanItemRuntime(params.admin, runtime.plan.id, {
        maxEntriesPerItem: 1,
      })
      : Promise.resolve([]),
    params.admin
      .from("user_recurring_reminders")
      .select(
        "id,message_instruction,rationale,status,created_at,updated_at,initiative_kind,source_kind,source_potion_session_id,target_kind,target_plan_item_id,target_action_family_key,initiative_metadata",
      )
      .eq("user_id", params.userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(50),
    params.admin
      .from("scheduled_checkins")
      .select(
        "id,recurring_reminder_id,event_context,origin,status,draft_message,message_payload,scheduled_for,created_at",
      )
      .eq("user_id", params.userId)
      .in("status", ["pending", "awaiting_user", "sent"])
      .gte(
        "scheduled_for",
        new Date(
          Date.now() - WATCHER_OWNED_FOLLOWUP_COOLDOWN_HOURS * 60 * 60 *
              1000,
        ).toISOString(),
      )
      .order("scheduled_for", { ascending: true })
      .limit(100),
  ]);

  if (remindersRes.error) throw remindersRes.error;
  if (checkinsRes.error) throw checkinsRes.error;

  const planActionTitles = dedupeStrings(
    planItems
      .filter((row) =>
        row.dimension === "missions" || row.dimension === "habits"
      )
      .map((row) => cleanText(row.title)),
  );
  const planActionDetails = dedupeStrings(
    planItems
      .filter((row) =>
        row.dimension === "missions" || row.dimension === "habits"
      )
      .map((row) => {
        const parts = [
          cleanText(row.title),
          `dimension=${cleanText(row.dimension)}`,
          `kind=${cleanText(row.kind)}`,
          `status=${cleanText(row.status)}`,
          row.time_of_day ? `time_of_day=${cleanText(row.time_of_day)}` : "",
          row.cadence_label ? `cadence=${cleanText(row.cadence_label)}` : "",
          row.description
            ? `description=${cleanText(row.description, 120)}`
            : "",
        ].filter(Boolean);
        return parts.join(" | ");
      }),
  );
  const personalActionTitles: string[] = [];
  const frameworkTitles = dedupeStrings(
    planItems
      .filter((row) =>
        row.dimension === "support" || row.dimension === "clarifications"
      )
      .map((row) => cleanText(row.title)),
  );
  const vitalSignTitles = dedupeStrings(
    (runtime.progress_markers ?? []).map((row) => cleanText(row.title)),
  );
  const recurringReminderLabels = dedupeStrings(
    ((remindersRes.data ?? []) as Array<Record<string, unknown>>).map((row) =>
      cleanText(row?.message_instruction, 120)
    ),
  );
  const reminderFollowUps: OwnedFollowUp[] =
    ((remindersRes.data ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        source: sourceFromReminder(row),
        label: labelFromReminder(row),
        message_instruction: cleanNullable(row.message_instruction, 180),
        event_context: null,
        scheduled_for: null,
        created_at: cleanNullable(row.created_at),
        updated_at: cleanNullable(row.updated_at),
        recurring_reminder_id: cleanNullable(row.id),
        source_potion_session_id: cleanNullable(row.source_potion_session_id),
        target_kind: cleanNullable(row.target_kind),
        target_plan_item_id: cleanNullable(row.target_plan_item_id),
        target_action_family_key: cleanNullable(row.target_action_family_key),
        initiative_kind: cleanNullable(row.initiative_kind),
        source_kind: cleanNullable(row.source_kind),
      }),
    );
  const checkinFollowUps: OwnedFollowUp[] =
    ((checkinsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      source: sourceFromCheckin(row),
      label: labelFromCheckin(row),
      message_instruction: cleanNullable(
        isRecord(row.message_payload)
          ? row.message_payload.reminder_instruction
          : null,
        180,
      ) ?? cleanNullable(row.draft_message, 180),
      event_context: cleanNullable(row.event_context),
      scheduled_for: cleanNullable(row.scheduled_for),
      created_at: cleanNullable(row.created_at),
      updated_at: null,
      recurring_reminder_id: cleanNullable(row.recurring_reminder_id),
      source_potion_session_id: null,
      target_kind: null,
      target_plan_item_id: null,
      target_action_family_key: null,
      initiative_kind: null,
      source_kind: cleanNullable(row.origin),
    }));
  const ownedFollowUps = [...reminderFollowUps, ...checkinFollowUps]
    .filter((followup) => followup.label || followup.event_context);
  const ownedTitles = dedupeStrings([
    ...planActionTitles,
    ...personalActionTitles,
    ...frameworkTitles,
    ...vitalSignTitles,
    ...recurringReminderLabels,
    ...ownedFollowUps.flatMap((followup) => [
      followup.label,
      followup.message_instruction ?? "",
      followup.event_context ?? "",
    ]),
  ]);

  return {
    planActionTitles,
    planActionDetails,
    personalActionTitles,
    frameworkTitles,
    vitalSignTitles,
    recurringReminderLabels,
    ownedFollowUps,
    ownedTitles,
  };
}

function formatOwnedFollowUps(followups: OwnedFollowUp[]): string {
  if (followups.length === 0) return "(aucun)";
  return followups.slice(0, 40).map((followup, index) => {
    const parts = [
      `${index + 1}. source=${followup.source}`,
      followup.label ? `label=${followup.label}` : "",
      followup.message_instruction
        ? `instruction=${followup.message_instruction}`
        : "",
      followup.event_context ? `event_context=${followup.event_context}` : "",
      followup.scheduled_for ? `scheduled_for=${followup.scheduled_for}` : "",
      followup.created_at ? `created_at=${followup.created_at}` : "",
      followup.updated_at ? `updated_at=${followup.updated_at}` : "",
      followup.target_kind ? `target_kind=${followup.target_kind}` : "",
      followup.target_plan_item_id
        ? `target_plan_item_id=${followup.target_plan_item_id}`
        : "",
      followup.target_action_family_key
        ? `target_action_family_key=${followup.target_action_family_key}`
        : "",
    ].filter(Boolean);
    return parts.join(" | ");
  }).join("\n");
}

export function formatWatcherExclusionSnapshot(
  snapshot: CheckinExclusionSnapshot,
): string {
  return [
    "Actions du plan (hors-scope):",
    formatPromptList(
      snapshot.planActionDetails.length > 0
        ? snapshot.planActionDetails
        : snapshot.planActionTitles,
      "(aucune)",
    ),
    "Actions perso (hors-scope):",
    formatPromptList(snapshot.personalActionTitles, "(aucune)"),
    "Frameworks (hors-scope, jamais a simplifier):",
    formatPromptList(snapshot.frameworkTitles, "(aucun)"),
    "Vital signs (hors-scope):",
    formatPromptList(snapshot.vitalSignTitles, "(aucun)"),
    "Rappels recurrents deja geres ailleurs (hors-scope):",
    formatPromptList(snapshot.recurringReminderLabels, "(aucun)"),
    "Suivis deja pris en charge par d'autres flows (anti-doublon watcher):",
    formatOwnedFollowUps(snapshot.ownedFollowUps),
  ].join("\n");
}

export function buildWatcherScopePromptBlock(
  snapshot: CheckinExclusionSnapshot,
): string {
  return [
    "=== SUJETS HORS-SCOPE POUR CE CHECK-IN (CRITIQUE) ===",
    "Ces sujets appartiennent a d'autres pipelines. Tu peux les reconnaitre, mais tu ne dois ni les mentionner, ni les simplifier, ni les suivre.",
    "Processus obligatoire: avant de proposer un check-in watcher, compare le candidat aux suivis deja pris en charge ci-dessous. Si le besoin est deja handle par un one-shot reminder, un rappel recurrent, une potion ou un check-in existant, ne retourne aucun candidat pour cet element.",
    formatWatcherExclusionSnapshot(snapshot),
    "Interdictions strictes:",
    "- Ne parle jamais de plan, objectifs, actions, actions perso, frameworks, journal, vital signs, progression, streaks ou discipline.",
    "- N'adapte jamais un framework ou un journal: pas de version courte, pas de version allegee, pas de '2 minutes'.",
    "- Ne fais jamais d'accountability d'execution: pas de 'garder le cap', pas de 'tu l'as fait ?', pas de suivi de progression.",
    "- Si le transcript recent ou la memoire parlent de ces sujets, ignore-les ou abstrais-les en ressenti general sans citer l'item.",
    "- Si un evenement reel existe mais qu'une partie du contexte touche un sujet hors-scope, garde uniquement le noyau evenementiel et jette le reste.",
    "- Pour chaque candidat watcher, verifie d'abord les suivis deja pris en charge. S'il est couvert par un reminder, une potion, un one-shot reminder ou un check-in existant, ne cree rien.",
  ].join("\n");
}

export function watcherCandidateCoveredByExistingFollowUp(
  candidate: WatcherCandidateCoverageInput,
  snapshot: CheckinExclusionSnapshot,
): WatcherCandidateCoverageResult {
  const candidateText = cleanText(
    [candidate.event_context, candidate.event_grounding].filter(Boolean).join(
      " ",
    ),
    360,
  );
  const candidateEvent = normalizeForMatch(candidate.event_context);
  if (!candidateText && !candidateEvent) {
    return { covered: false, reason: "empty_candidate" };
  }

  for (const followup of snapshot.ownedFollowUps) {
    const followupEvent = normalizeForMatch(followup.event_context ?? "");
    if (candidateEvent && followupEvent && candidateEvent === followupEvent) {
      return {
        covered: true,
        reason: "exact_event_context",
        matched_followup: followup,
      };
    }

    if (
      candidate.target_plan_item_id && followup.target_plan_item_id &&
      candidate.target_plan_item_id === followup.target_plan_item_id
    ) {
      return {
        covered: true,
        reason: "same_target_plan_item",
        matched_followup: followup,
      };
    }
    if (
      candidate.target_action_family_key &&
      followup.target_action_family_key &&
      candidate.target_action_family_key === followup.target_action_family_key
    ) {
      return {
        covered: true,
        reason: "same_target_action_family",
        matched_followup: followup,
      };
    }

    const followupText = ownedFollowUpText(followup);
    if (!followupText) continue;
    if (
      titleMatchesText(candidateText, followupText) ||
      titleMatchesText(followupText, candidateText)
    ) {
      return {
        covered: true,
        reason: "strong_text_match",
        matched_followup: followup,
      };
    }

    const overlap = tokenOverlapScore(candidateText, followupText);
    const recent = isWithinCooldown(followup, candidate.now_iso);
    const sameDay = sameLocalDate(
      candidate.scheduled_for,
      followup.scheduled_for,
    );
    if (recent && (overlap.hits >= 2 || overlap.ratio >= 0.5)) {
      return {
        covered: true,
        reason: "recent_followup_overlap",
        matched_followup: followup,
      };
    }
    if (
      sameDay &&
      (followup.source === "one_shot" || followup.source === "potion") &&
      (overlap.hits >= 1 || overlap.ratio >= 0.4)
    ) {
      return {
        covered: true,
        reason: "same_day_owned_followup_overlap",
        matched_followup: followup,
      };
    }
    if (overlap.hits >= 3 || overlap.ratio >= 0.67) {
      return {
        covered: true,
        reason: "owned_followup_overlap",
        matched_followup: followup,
      };
    }
  }

  return { covered: false, reason: "not_covered" };
}

export function textMentionsOwnedTopic(
  text: string,
  snapshot: CheckinExclusionSnapshot,
): boolean {
  return snapshot.ownedTitles.some((title) => titleMatchesText(text, title));
}

export function hasWatcherForbiddenScope(text: string): boolean {
  const raw = String(text ?? "");
  return WATCHER_FORBIDDEN_SCOPE_PATTERNS.some((pattern) => pattern.test(raw));
}

export function sanitizeWatcherGrounding(
  text: string,
  snapshot: CheckinExclusionSnapshot,
): string {
  const cleaned = cleanText(text, 320);
  if (!cleaned) return "";
  const kept = splitIntoClauses(cleaned).filter((clause) =>
    !hasWatcherForbiddenScope(clause) &&
    !textMentionsOwnedTopic(clause, snapshot)
  );
  return cleanText(kept.join(" "), 320);
}

export function watcherEventContextTouchesExcludedScope(
  text: string,
  snapshot: CheckinExclusionSnapshot,
): boolean {
  return hasWatcherForbiddenScope(text) ||
    textMentionsOwnedTopic(text, snapshot);
}

export function watcherGeneratedTextViolatesScope(
  text: string,
  snapshot: CheckinExclusionSnapshot,
): boolean {
  const raw = String(text ?? "");
  if (!raw.trim()) return false;
  if (hasWatcherForbiddenScope(raw)) return true;
  if (textMentionsOwnedTopic(raw, snapshot)) return true;
  if (WATCHER_ACCOUNTABILITY_PATTERNS.some((pattern) => pattern.test(raw))) {
    return true;
  }
  if (WATCHER_SIMPLIFICATION_PATTERNS.some((pattern) => pattern.test(raw))) {
    return true;
  }
  return false;
}
