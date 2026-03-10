import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import type {
  WeeklyReviewPayload,
  WeeklySuggestionDecision,
} from "../../../trigger-weekly-bilan/payload.ts";
import type {
  WeeklySuggestionOutcome,
  WeeklySuggestionProposal,
} from "./types.ts";

function uniqText(items: string[]): string[] {
  return [...new Set(items.map((x) => String(x ?? "").trim()).filter(Boolean))];
}

function proposalId(decisions: WeeklySuggestionDecision[]): string {
  return decisions
    .map((item) => `${item.recommendation}:${item.action_title}:${item.related_action_title ?? ""}`)
    .join("|")
    .slice(0, 200);
}

function toSwapPrompt(decisions: WeeklySuggestionDecision[]): string {
  const deactivate = decisions.find((item) => item.recommendation === "deactivate");
  const activate = decisions.find((item) => item.recommendation === "activate");
  const oldTitle = deactivate?.action_title ?? "l'action actuelle";
  const nextTitle = activate?.action_title ?? "la suivante";
  return `Vu ta semaine, je te proposerais de remplacer "${oldTitle}" par "${nextTitle}" pour la suite. Je le fais maintenant ?`;
}

function toSinglePrompt(decision: WeeklySuggestionDecision): string {
  if (decision.recommendation === "activate") {
    return `Vu ta semaine, je peux activer "${decision.action_title}" pour la suite. Je le fais maintenant ?`;
  }
  return `Vu ta semaine, je peux mettre en pause "${decision.action_title}" pour alléger un peu. Je le fais maintenant ?`;
}

function buildSnapshotStatusMap(payload: WeeklyReviewPayload): Map<string, string> {
  const out = new Map<string, string>();
  const rows = [
    ...(Array.isArray(payload?.plan_window?.current_actions) ? payload.plan_window.current_actions : []),
    ...(Array.isArray(payload?.plan_window?.next_actions) ? payload.plan_window.next_actions : []),
  ];
  for (const row of rows) {
    const title = String((row as any)?.title ?? "").trim().toLowerCase();
    const status = String((row as any)?.db_status ?? "").trim().toLowerCase();
    if (!title || !status) continue;
    out.set(title, status);
  }
  return out;
}

function isActionableSuggestion(
  payload: WeeklyReviewPayload,
  decision: WeeklySuggestionDecision,
  statusByTitle: Map<string, string>,
): boolean {
  const title = String(decision.action_title ?? "").trim();
  if (!title) return false;

  const normalizedTitle = title.toLowerCase();
  const dbStatus = statusByTitle.get(normalizedTitle) ?? null;
  const activeTitles = new Set(
    (Array.isArray(payload?.plan_window?.active_action_titles) ? payload.plan_window.active_action_titles : [])
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  if (decision.recommendation === "activate") {
    if (dbStatus === "active" || dbStatus === "completed" || dbStatus === "deactivated") return false;
    if (activeTitles.has(normalizedTitle)) return false;
    return true;
  }

  if (decision.recommendation === "deactivate") {
    return dbStatus === "active";
  }

  return false;
}

export function buildSuggestionQueue(
  payload: WeeklyReviewPayload,
): WeeklySuggestionProposal[] {
  const suggestions = Array.isArray(payload?.suggestion_state?.suggestions)
    ? payload.suggestion_state.suggestions
    : [];
  const statusByTitle = buildSnapshotStatusMap(payload);

  const actionable = suggestions.filter((item) =>
    (item.recommendation === "activate" || item.recommendation === "deactivate") &&
    isActionableSuggestion(payload, item, statusByTitle)
  );

  const used = new Set<string>();
  const proposals: WeeklySuggestionProposal[] = [];

  for (const decision of actionable) {
    const key = `${decision.recommendation}:${decision.action_title}`;
    if (used.has(key)) continue;

    if (decision.recommendation === "activate" && decision.related_action_title) {
      const related = actionable.find((item) =>
        item.recommendation === "deactivate" &&
        item.action_title === decision.related_action_title &&
        item.related_action_title === decision.action_title
      );
      if (related) {
        used.add(key);
        used.add(`${related.recommendation}:${related.action_title}`);
        const decisions = [related, decision];
        proposals.push({
          id: proposalId(decisions),
          recommendation: "swap",
          prompt: toSwapPrompt(decisions),
          decisions,
        });
        continue;
      }
    }

    used.add(key);
    proposals.push({
      id: proposalId([decision]),
      recommendation: decision.recommendation === "activate" ? "activate" : "deactivate",
      prompt: toSinglePrompt(decision),
      decisions: [decision],
    });
  }

  return proposals.slice(0, 3);
}

async function fetchActivePlanRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<any | null> {
  const { data, error } = await supabase
    .from("user_plans")
    .select("id, submission_id, content")
    .eq("user_id", userId)
    .in("status", ["active", "in_progress", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function updatePlanContentStatus(
  supabase: SupabaseClient,
  planId: string,
  match: { actionId?: string | null; title?: string | null },
  nextStatus: "active" | "pending",
): Promise<void> {
  const { data: plan, error } = await supabase
    .from("user_plans")
    .select("content")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  const content = (plan as any)?.content;
  const phases = Array.isArray(content?.phases) ? content.phases : null;
  if (!phases) return;
  const matchId = String(match.actionId ?? "").trim();
  const matchTitle = String(match.title ?? "").trim().toLowerCase();
  const nextPhases = phases.map((phase: any) => ({
    ...phase,
    actions: Array.isArray(phase?.actions)
      ? phase.actions.map((action: any) =>
        (
          (matchId && String(action?.id ?? "").trim() === matchId) ||
          (matchTitle && String(action?.title ?? "").trim().toLowerCase() === matchTitle)
        )
          ? { ...action, status: nextStatus }
          : action
      )
      : [],
  }));
  await supabase.from("user_plans").update({ content: { ...content, phases: nextPhases } }).eq("id", planId);
}

async function setActionStatus(params: {
  supabase: SupabaseClient;
  userId: string;
  planId: string;
  decision: WeeklySuggestionDecision;
  nextStatus: "active" | "pending";
}): Promise<{ label: string; rollback: () => Promise<void> }> {
  const { supabase, userId, planId, decision, nextStatus } = params;
  const title = String(decision.action_title ?? "").trim();
  if (!title) throw new Error("missing_action_title");

  if (decision.recommendation === "deactivate" && decision.action_type !== "habitude") {
    throw new Error("deactivate_forbidden_for_non_habit");
  }

  if (decision.action_type === "framework") {
    const { data: rows, error } = await supabase
      .from("user_framework_tracking")
      .select("id, action_id, title, status")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("title", title)
      .limit(1);
    if (error || !rows || rows.length === 0) throw error ?? new Error("framework_not_found");
    const row = rows[0] as any;
    const previousStatus = String(row?.status ?? "").trim() || "pending";
    const actionId = String(row?.action_id ?? "").trim() || null;

    const { error: updateError } = await supabase
      .from("user_framework_tracking")
      .update({ status: nextStatus })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (updateError) throw updateError;

    await updatePlanContentStatus(supabase, planId, { actionId, title }, nextStatus);

    return {
      label: `${decision.recommendation === "activate" ? "Activée" : "Mise en pause"}: ${title}`,
      rollback: async () => {
        await supabase
          .from("user_framework_tracking")
          .update({ status: previousStatus })
          .eq("id", row.id)
          .eq("user_id", userId);
        await updatePlanContentStatus(supabase, planId, { actionId, title }, previousStatus === "active" ? "active" : "pending");
      },
    };
  }

  const { data: rows, error } = await supabase
    .from("user_actions")
    .select("id, title, status, type")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .eq("title", title)
    .limit(1);
  if (error || !rows || rows.length === 0) throw error ?? new Error("action_not_found");
  const row = rows[0] as any;
  const previousStatus = String(row?.status ?? "").trim() || "pending";
  const actionType = String(row?.type ?? "").trim();
  if (decision.recommendation === "deactivate" && actionType !== "habit") {
    throw new Error("deactivate_forbidden_for_non_habit");
  }

  const { error: updateError } = await supabase
    .from("user_actions")
    .update({ status: nextStatus })
    .eq("id", row.id)
    .eq("user_id", userId);
  if (updateError) throw updateError;

  await updatePlanContentStatus(supabase, planId, { title }, nextStatus);

  return {
    label: `${decision.recommendation === "activate" ? "Activée" : "Mise en pause"}: ${title}`,
    rollback: async () => {
      await supabase
        .from("user_actions")
        .update({ status: previousStatus })
        .eq("id", row.id)
        .eq("user_id", userId);
      await updatePlanContentStatus(supabase, planId, { title }, previousStatus === "active" ? "active" : "pending");
    },
  };
}

export async function applySuggestionProposal(params: {
  supabase: SupabaseClient;
  userId: string;
  proposal: WeeklySuggestionProposal;
}): Promise<{ summary: string; applied_changes: string[] }> {
  const planRow = await fetchActivePlanRow(params.supabase, params.userId);
  const planId = String((planRow as any)?.id ?? "").trim();
  if (!planId) throw new Error("missing_active_plan");

  const appliedChanges: string[] = [];
  const rollbacks: Array<() => Promise<void>> = [];
  try {
    for (const decision of params.proposal.decisions) {
      const nextStatus = decision.recommendation === "activate" ? "active" : "pending";
      const applied = await setActionStatus({
        supabase: params.supabase,
        userId: params.userId,
        planId,
        decision,
        nextStatus,
      });
      appliedChanges.push(applied.label);
      rollbacks.unshift(applied.rollback);
    }
  } catch (error) {
    for (const rollback of rollbacks) {
      await rollback().catch(() => null);
    }
    throw error;
  }

  const summary = params.proposal.recommendation === "swap"
    ? "J'ai fait le passage vers la version suivante."
    : params.proposal.recommendation === "activate"
    ? "C'est activé."
    : "C'est mis en pause.";

  return {
    summary,
    applied_changes: uniqText(appliedChanges),
  };
}

export async function logWeeklySuggestionOutcome(params: {
  supabase: SupabaseClient;
  userId: string;
  weekStart: string;
  proposal: WeeklySuggestionProposal;
  outcome: WeeklySuggestionOutcome["outcome"];
  summary: string;
  appliedChanges?: string[];
}): Promise<void> {
  const row = {
    user_id: params.userId,
    week_start: params.weekStart,
    proposal_id: params.proposal.id,
    recommendation: params.proposal.recommendation,
    primary_action_title: params.proposal.decisions[0]?.action_title ?? null,
    decisions: params.proposal.decisions,
    outcome: params.outcome,
    summary: String(params.summary ?? "").slice(0, 1000),
    applied_changes: params.appliedChanges ?? [],
  };
  await params.supabase.from("weekly_bilan_suggestion_events").insert(row as any);
}
