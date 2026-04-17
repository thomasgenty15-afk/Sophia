import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  getActiveTransformationRuntime,
  getPlanItemRuntime,
} from "./v2-runtime.ts";

export type CheckinExclusionSnapshot = {
  planActionTitles: string[];
  personalActionTitles: string[];
  frameworkTitles: string[];
  vitalSignTitles: string[];
  recurringReminderLabels: string[];
  ownedTitles: string[];
};

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
  const runtime = await getActiveTransformationRuntime(params.admin, params.userId);
  const [
    planItems,
    remindersRes,
  ] = await Promise.all([
    runtime.plan
      ? getPlanItemRuntime(params.admin, runtime.plan.id, { maxEntriesPerItem: 1 })
      : Promise.resolve([]),
    params.admin
      .from("user_recurring_reminders")
      .select("message_instruction")
      .eq("user_id", params.userId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  if (remindersRes.error) throw remindersRes.error;

  const planActionTitles = dedupeStrings(
    planItems
      .filter((row) => row.dimension === "missions" || row.dimension === "habits")
      .map((row) => cleanText(row.title)),
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
    [
      cleanText(runtime.north_star?.title),
      ...((runtime.progress_markers ?? []).map((row) => cleanText(row.title))),
    ],
  );
  const recurringReminderLabels = dedupeStrings(
    ((remindersRes.data ?? []) as Array<Record<string, unknown>>).map((row) =>
      cleanText(row?.message_instruction, 120)
    ),
  );
  const ownedTitles = dedupeStrings([
    ...planActionTitles,
    ...personalActionTitles,
    ...frameworkTitles,
    ...vitalSignTitles,
    ...recurringReminderLabels,
  ]);

  return {
    planActionTitles,
    personalActionTitles,
    frameworkTitles,
    vitalSignTitles,
    recurringReminderLabels,
    ownedTitles,
  };
}

export function formatWatcherExclusionSnapshot(
  snapshot: CheckinExclusionSnapshot,
): string {
  return [
    "Actions du plan (hors-scope):",
    formatPromptList(snapshot.planActionTitles, "(aucune)"),
    "Actions perso (hors-scope):",
    formatPromptList(snapshot.personalActionTitles, "(aucune)"),
    "Frameworks (hors-scope, jamais a simplifier):",
    formatPromptList(snapshot.frameworkTitles, "(aucun)"),
    "Vital signs (hors-scope):",
    formatPromptList(snapshot.vitalSignTitles, "(aucun)"),
    "Rappels recurrents deja geres ailleurs (hors-scope):",
    formatPromptList(snapshot.recurringReminderLabels, "(aucun)"),
  ].join("\n");
}

export function buildWatcherScopePromptBlock(
  snapshot: CheckinExclusionSnapshot,
): string {
  return [
    "=== SUJETS HORS-SCOPE POUR CE CHECK-IN (CRITIQUE) ===",
    "Ces sujets appartiennent a d'autres pipelines. Tu peux les reconnaitre, mais tu ne dois ni les mentionner, ni les simplifier, ni les suivre.",
    formatWatcherExclusionSnapshot(snapshot),
    "Interdictions strictes:",
    "- Ne parle jamais de plan, objectifs, actions, actions perso, frameworks, journal, vital signs, progression, streaks ou discipline.",
    "- N'adapte jamais un framework ou un journal: pas de version courte, pas de version allegee, pas de '2 minutes'.",
    "- Ne fais jamais d'accountability d'execution: pas de 'garder le cap', pas de 'tu l'as fait ?', pas de suivi de progression.",
    "- Si le transcript recent ou la memoire parlent de ces sujets, ignore-les ou abstrais-les en ressenti general sans citer l'item.",
    "- Si un evenement reel existe mais qu'une partie du contexte touche un sujet hors-scope, garde uniquement le noyau evenementiel et jette le reste.",
  ].join("\n");
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
