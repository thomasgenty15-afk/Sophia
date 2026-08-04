// Chantier réengagement (2026-07-19) — construction du contexte d'armement du
// flow winback_reengagement_v1 (accès DB, appelé par process-checkins à
// l'envoi d'une touche winback et par la ceinture webhook au retour d'une
// réponse). Le grounding reste volontairement compact : la temp memory est
// clobber-prone et le budget du companion est serré.

import { getUserState, updateUserState } from "../../state-manager.ts";
import {
  getActiveTransformationRuntime,
  getScopedPlanItemRuntime,
} from "../../../_shared/v2-runtime.ts";
import {
  armWinbackReengagement,
  readWinbackReengagementLocalState,
  type WinbackPastEpisode,
  type WinbackStalledAction,
} from "./state.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../_shared/active_skill_state.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export const WINBACK_REENGAGEMENT_FLOW_FLAG =
  "WINBACK_REENGAGEMENT_FLOW_ENABLED";

export function isWinbackReengagementFlowEnabled(): boolean {
  try {
    return (Deno.env.get(WINBACK_REENGAGEMENT_FLOW_FLAG) ?? "")
      .trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

const RECENT_EPISODE_CONFIRMABLE_DAYS = 28;

/** Compose le « pourquoi » d'une action depuis les vraies sources du plan. */
function composeWhyItMatters(args: {
  itemDescription: string | null;
  phaseWhy: string | null;
  transformationWhy: string | null;
}): string | null {
  const parts = [
    args.itemDescription,
    args.phaseWhy,
    args.transformationWhy,
  ].filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length === 0) return null;
  return parts.join(" — ").slice(0, 320);
}

function phaseWhyFromPlanContent(
  planContent: unknown,
  phaseId: string | null,
): string | null {
  if (!isRecord(planContent)) return null;
  if (Number(planContent.version ?? 0) !== 3) return null;
  const phases = Array.isArray(planContent.phases) ? planContent.phases : [];
  const phase = phases.find((candidate) =>
    isRecord(candidate) && cleanText(candidate.phase_id, 120) === phaseId
  );
  if (isRecord(phase)) {
    const why = cleanText(phase.why_this_now, 300) ||
      cleanText(phase.what_this_phase_targets, 300) ||
      cleanText(phase.rationale, 300) ||
      cleanText(phase.phase_objective, 300);
    if (why) return why;
  }
  const runtime = isRecord(planContent.current_level_runtime)
    ? planContent.current_level_runtime
    : null;
  if (runtime) {
    return cleanText(runtime.why_this_now, 300) ||
      cleanText(runtime.rationale, 300) ||
      cleanText(runtime.phase_objective, 300) || null;
  }
  return null;
}

export async function loadWinbackStalledActions(
  admin: AdminClient,
  userId: string,
): Promise<WinbackStalledAction[]> {
  const runtime = await getActiveTransformationRuntime(admin, userId);
  if (!runtime.plan) return [];
  const { planItems } = await getScopedPlanItemRuntime(
    admin,
    String(runtime.plan.id),
    { scope: "current_phase", maxEntriesPerItem: 1 },
  );
  const staleCutoffMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const transformationWhy =
    cleanText(runtime.transformation?.success_definition, 240) ||
    cleanText(runtime.transformation?.user_summary, 240) || null;
  const candidates = planItems.filter((item) => {
    const status = cleanText(item.status, 40);
    if (status === "stalled") return true;
    if (status !== "active" && status !== "in_maintenance") return false;
    const dimension = cleanText(item.dimension, 40);
    if (dimension !== "missions" && dimension !== "habits") return false;
    const lastEntryMs = item.last_entry_at
      ? new Date(String(item.last_entry_at)).getTime()
      : NaN;
    return !Number.isFinite(lastEntryMs) || lastEntryMs < staleCutoffMs;
  });
  candidates.sort((a, b) =>
    (cleanText(a.status, 40) === "stalled" ? 0 : 1) -
    (cleanText(b.status, 40) === "stalled" ? 0 : 1)
  );
  return candidates.slice(0, 3).map((item) => ({
    plan_item_id: String(item.id),
    title: cleanText(item.title, 200) || "Action du plan",
    why_it_matters: composeWhyItMatters({
      itemDescription: cleanText(item.description, 240) || null,
      phaseWhy: phaseWhyFromPlanContent(
        runtime.plan?.content,
        cleanText((item as Record<string, unknown>).phase_id, 120) || null,
      ),
      transformationWhy,
    }),
  }));
}

export async function loadWinbackPastEpisodes(
  admin: AdminClient,
  userId: string,
): Promise<{
  past_episodes: WinbackPastEpisode[];
  recent_episode_confirmable: boolean;
}> {
  const { data, error } = await admin
    .from("reengagement_episodes")
    .select(
      "closed_at,reason_category,reason_confidence,episode_summary,solution_offered,solution_accepted",
    )
    .eq("user_id", userId)
    .not("closed_at", "is", null)
    // Un épisode clos en crise n'est jamais ré-servi comme grounding d'un
    // décrochage futur (doctrine zéro-effet-durable en crise).
    .neq("exit_status", "safety")
    .order("closed_at", { ascending: false })
    .limit(3);
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const episodes: WinbackPastEpisode[] = rows.map((row) => ({
    closed_at: cleanText(row.closed_at, 80),
    reason_category: cleanText(row.reason_category, 40) || null,
    episode_summary: cleanText(row.episode_summary, 800) || null,
    solution_offered: cleanText(row.solution_offered, 40) || null,
    solution_accepted: typeof row.solution_accepted === "boolean"
      ? row.solution_accepted
      : null,
  }));
  const latest = rows[0];
  const latestClosedMs = latest
    ? new Date(cleanText(latest.closed_at, 80)).getTime()
    : NaN;
  const confirmable = Boolean(
    latest &&
      Number.isFinite(latestClosedMs) &&
      Date.now() - latestClosedMs <=
        RECENT_EPISODE_CONFIRMABLE_DAYS * 24 * 60 * 60 * 1000 &&
      cleanText(latest.reason_category, 40) &&
      cleanText(latest.reason_category, 40) !== "other" &&
      cleanText(latest.reason_confidence, 20) !== "low",
  );
  return { past_episodes: episodes, recent_episode_confirmable: confirmable };
}

export async function buildWinbackReengagementArmingContext(
  admin: AdminClient,
  userId: string,
): Promise<{
  stalled_actions: WinbackStalledAction[];
  past_episodes: WinbackPastEpisode[];
  recent_episode_confirmable: boolean;
}> {
  const [stalledActions, pastEpisodes] = await Promise.all([
    loadWinbackStalledActions(admin, userId).catch((error) => {
      console.warn("[winback-reengagement] stalled actions load failed", error);
      return [] as WinbackStalledAction[];
    }),
    loadWinbackPastEpisodes(admin, userId).catch((error) => {
      console.warn("[winback-reengagement] past episodes load failed", error);
      return {
        past_episodes: [] as WinbackPastEpisode[],
        recent_episode_confirmable: false,
      };
    }),
  ]);
  return {
    stalled_actions: stalledActions,
    past_episodes: pastEpisodes.past_episodes,
    recent_episode_confirmable: pastEpisodes.recent_episode_confirmable,
  };
}

const OTHER_FLOW_FRESH_MS = 4 * 60 * 60 * 1000;

/**
 * Arme le flow dans la temp memory WhatsApp. No-clobber : un AUTRE flow
 * conversationnel actif, frais (<4h) et déjà engagé (turn_count>0) garde la
 * main — un utilisateur en pleine conversation n'est de toute façon pas un
 * décroché. Retourne true si le flow est armé (ou l'était déjà).
 */
export async function armWinbackReengagementForUser(args: {
  admin: AdminClient;
  userId: string;
  episodeId: string;
  winbackStep: 1 | 2 | 3;
  daysInactiveAtSend: number;
  nowIso: string;
  requestId: string;
}): Promise<boolean> {
  try {
    const state = await getUserState(args.admin, args.userId, "whatsapp");
    const rawState = state as unknown as Record<string, unknown> | null;
    const tempMemory = isRecord(rawState?.temp_memory)
      ? rawState.temp_memory as Record<string, unknown>
      : {};
    const active = tempMemory[ACTIVE_CONVERSATION_SKILL_KEY] ??
      tempMemory.__active_skill_state;
    const existingWinback = readWinbackReengagementLocalState(active);
    if (isRecord(active) && !existingWinback) {
      const turnCount = Number(active.turn_count ?? 0) || 0;
      const touchedMs = new Date(
        cleanText(active.updated_at, 80) || cleanText(active.started_at, 80),
      ).getTime();
      const fresh = Number.isFinite(touchedMs) &&
        Date.now() - touchedMs < OTHER_FLOW_FRESH_MS;
      if (turnCount > 0 && fresh) {
        console.log(
          `[winback-reengagement] request_id=${args.requestId} arming_skipped_active_flow user_id=${args.userId} skill_id=${
            cleanText(active.skill_id, 80)
          }`,
        );
        return false;
      }
    }
    const context = await buildWinbackReengagementArmingContext(
      args.admin,
      args.userId,
    );
    const next = armWinbackReengagement({
      tempMemory,
      nowIso: args.nowIso,
      context: {
        episode_id: args.episodeId,
        winback_step: args.winbackStep,
        days_inactive_at_send: args.daysInactiveAtSend,
        ...context,
      },
    });
    await updateUserState(args.admin, args.userId, "whatsapp", {
      temp_memory: next,
    });
    return true;
  } catch (error) {
    console.warn(
      `[winback-reengagement] request_id=${args.requestId} arming_failed user_id=${args.userId}`,
      error,
    );
    return false;
  }
}

/**
 * Ceinture webhook : un inbound arrive alors qu'une escalade winback est en
 * cours (profil pré-reset), mais la temp memory a pu être clobbée depuis
 * l'armement. Ré-arme depuis l'épisode DB (source de vérité) si nécessaire.
 */
export async function ensureWinbackReengagementArmedForReply(args: {
  admin: AdminClient;
  userId: string;
  requestId: string;
}): Promise<void> {
  try {
    const { data, error } = await args.admin
      .from("reengagement_episodes")
      .select("id,last_touch_step,days_inactive_at_open,first_reply_at")
      .eq("user_id", args.userId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;
    const state = await getUserState(args.admin, args.userId, "whatsapp");
    const rawState = state as unknown as Record<string, unknown> | null;
    const tempMemory = isRecord(rawState?.temp_memory)
      ? rawState.temp_memory as Record<string, unknown>
      : {};
    const active = tempMemory[ACTIVE_CONVERSATION_SKILL_KEY] ??
      tempMemory.__active_skill_state;
    if (readWinbackReengagementLocalState(active)) return;
    const step = Math.max(
      1,
      Math.min(3, Number((data as Record<string, unknown>).last_touch_step) || 1),
    ) as 1 | 2 | 3;
    await armWinbackReengagementForUser({
      admin: args.admin,
      userId: args.userId,
      episodeId: String((data as Record<string, unknown>).id),
      winbackStep: step,
      daysInactiveAtSend: Math.max(
        0,
        Number((data as Record<string, unknown>).days_inactive_at_open) || 0,
      ),
      nowIso: new Date().toISOString(),
      requestId: args.requestId,
    });
  } catch (error) {
    console.warn(
      `[winback-reengagement] request_id=${args.requestId} ensure_armed_failed user_id=${args.userId}`,
      error,
    );
  }
}

/** Désarmement webhook (fast-path bouton pause) : efface le state si winback. */
export async function disarmWinbackReengagementForUser(args: {
  admin: AdminClient;
  userId: string;
  requestId: string;
}): Promise<void> {
  try {
    const state = await getUserState(args.admin, args.userId, "whatsapp");
    const rawState = state as unknown as Record<string, unknown> | null;
    const tempMemory = isRecord(rawState?.temp_memory)
      ? rawState.temp_memory as Record<string, unknown>
      : {};
    const active = tempMemory[ACTIVE_CONVERSATION_SKILL_KEY] ??
      tempMemory.__active_skill_state;
    if (!readWinbackReengagementLocalState(active)) return;
    const next = { ...tempMemory };
    delete next[ACTIVE_CONVERSATION_SKILL_KEY];
    delete next.__active_skill_state;
    delete next.active_skill_state;
    await updateUserState(args.admin, args.userId, "whatsapp", {
      temp_memory: next,
    });
  } catch (error) {
    console.warn(
      `[winback-reengagement] request_id=${args.requestId} disarm_failed user_id=${args.userId}`,
      error,
    );
  }
}
