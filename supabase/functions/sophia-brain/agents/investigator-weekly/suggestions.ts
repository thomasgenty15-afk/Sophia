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
  return `Vu ta semaine, je te proposerais de remplacer "${oldTitle}" par "${nextTitle}" pour la suite. Si ça te va, tu pourras l'ajuster dans le dashboard. Tu veux qu'on retienne ça ?`;
}

function toSinglePrompt(decision: WeeklySuggestionDecision): string {
  if (decision.recommendation === "activate") {
    return `Vu ta semaine, je te proposerais d'activer "${decision.action_title}" pour la suite. Si ça te va, tu pourras l'ajuster dans le dashboard. Tu veux qu'on retienne ça ?`;
  }
  return `Vu ta semaine, je te proposerais de mettre en pause "${decision.action_title}" pour alléger un peu. Si ça te va, tu pourras l'ajuster dans le dashboard. Tu veux qu'on retienne ça ?`;
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

export function describeSuggestionProposalForDashboard(
  proposal: WeeklySuggestionProposal,
): { summary: string; retained_changes: string[]; decision_note: string } {
  const titles = proposal.decisions.map((item) => String(item.action_title ?? "").trim()).filter(Boolean);
  const activate = proposal.decisions.find((item) => item.recommendation === "activate");
  const deactivate = proposal.decisions.find((item) => item.recommendation === "deactivate");

  if (proposal.recommendation === "swap") {
    const oldTitle = deactivate?.action_title ?? titles[0] ?? "l'action actuelle";
    const nextTitle = activate?.action_title ?? titles[1] ?? "la suivante";
    return {
      summary: `Ok, on retient l'idée de remplacer "${oldTitle}" par "${nextTitle}". Tu pourras l'ajuster dans le dashboard quand ce sera le bon moment.`,
      retained_changes: [`Remplacer "${oldTitle}" par "${nextTitle}" dans le dashboard`],
      decision_note: `Ajustement retenu pour le dashboard: remplacer "${oldTitle}" par "${nextTitle}"`,
    };
  }

  const title = String(proposal.decisions[0]?.action_title ?? "").trim() || "cette action";
  if (proposal.recommendation === "activate") {
    return {
      summary: `Ok, on retient l'idée d'activer "${title}" pour la suite. Tu pourras le faire dans le dashboard quand tu voudras valider ce réglage.`,
      retained_changes: [`Activer "${title}" dans le dashboard`],
      decision_note: `Ajustement retenu pour le dashboard: activer "${title}"`,
    };
  }

  return {
    summary: `Ok, on retient l'idée de mettre en pause "${title}" pour alléger un peu. Tu pourras le faire dans le dashboard si tu confirmes ce réglage.`,
    retained_changes: [`Mettre en pause "${title}" dans le dashboard`],
    decision_note: `Ajustement retenu pour le dashboard: mettre en pause "${title}"`,
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
