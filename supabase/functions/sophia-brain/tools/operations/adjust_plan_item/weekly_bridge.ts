import type { AdjustPlanRouterPlanItemSnapshot } from "./contract.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import { isPendingAdjustPlanDraftReview } from "./state.ts";

type V2PlanItemSnapshotItem = AdjustPlanRouterPlanItemSnapshot;

function normalizeRouteText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function normalizePlanItemTitle(value: string): string {
  return normalizeRouteText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function ymdToUtcNoonDate(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isWeeklyAdaptiveReviewActive(
  activeSkillState: unknown,
): boolean {
  return String((activeSkillState as any)?.skill_id ?? "").trim() ===
    "weekly_adaptive_review_v1";
}

export function weeklyAdaptiveReviewStateForTurn(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
}): unknown {
  if (isWeeklyAdaptiveReviewActive(args.activeSkillState)) {
    return args.activeSkillState;
  }
  const memory = args.tempMemory && typeof args.tempMemory === "object"
    ? args.tempMemory as Record<string, unknown>
    : {};
  const stored = memory.__active_skill_state ?? memory.active_skill_state;
  if (isWeeklyAdaptiveReviewActive(stored)) return stored;
  const suspended = memory.__suspended_flow_v1 &&
      typeof memory.__suspended_flow_v1 === "object"
    ? memory.__suspended_flow_v1 as Record<string, unknown>
    : null;
  const suspendedSnapshot = suspended?.state_snapshot;
  return isWeeklyAdaptiveReviewActive(suspendedSnapshot)
    ? suspendedSnapshot
    : null;
}

export type WeeklyForgottenProgressCandidate = {
  detected: boolean;
  ready: boolean;
  reason_code: string;
  plan_item_id?: string;
  title?: string;
  count?: number;
  date_hint?: string | null;
  date_hints?: string[];
};

export function weeklyForgottenProgressMentioned(message: string): boolean {
  const text = normalizeRouteText(message);
  const mentionsForgotten =
    /\b(oublie|oubliee|oublier|pas coche|pas cochee|pas confirme|pas confirmee|pas dit|pas renseigne|pas renseignee|pas mis|pas note|pas notee|pas logue|pas loguee|manque)\b/
      .test(text);
  const mentionsDone =
    /\b(fait|faite|faites|realise|realisee|coche|cochee|cocher|confirme|confirmee|confirmer|valide|validee|valider|logue|loguee|loguer)\b/
      .test(text);
  return mentionsForgotten && mentionsDone;
}

function weeklyFrenchNumber(value: string): number | null {
  const normalized = normalizeRouteText(value).trim();
  const map: Record<string, number> = {
    un: 1,
    une: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
    six: 6,
    sept: 7,
    huit: 8,
    neuf: 9,
    dix: 10,
  };
  return map[normalized] ?? null;
}

function extractWeeklyForgottenCount(message: string): number {
  const text = normalizeRouteText(message);
  const numeric =
    /\b(\d{1,2})\s*(?:fois|repetitions?|repetition|seances?|seance|reps?)\b/
      .exec(text)?.[1];
  if (numeric) return Math.max(1, Math.min(20, Number(numeric)));
  const word =
    /\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:fois|repetitions?|repetition|seances?|seance|reps?)\b/
      .exec(text)?.[1];
  const parsed = word ? weeklyFrenchNumber(word) : null;
  return parsed ? Math.max(1, Math.min(20, parsed)) : 1;
}

function weeklyForgottenExplicitCountMentioned(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b\d{1,2}\s*(?:fois|repetitions?|repetition|seances?|seance|reps?)\b/
    .test(text) ||
    /\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:fois|repetitions?|repetition|seances?|seance|reps?)\b/
      .test(text);
}

function ymdPlusDays(ymd: string, days: number): string | null {
  const date = ymdToUtcNoonDate(ymd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weeklyForgottenDateHint(message: string, weeklyState: unknown) {
  return weeklyForgottenDateHints(message, weeklyState)[0] ??
    weeklyForgottenFallbackDateHint(weeklyState);
}

function weeklyForgottenFallbackDateHint(weeklyState: unknown) {
  const progressReview = (weeklyState as any)?.weekly_progress_review ?? {};
  const weekStart = String(progressReview?.week_start_date ?? "").trim();
  const weekEnd = String(progressReview?.week_end_date ?? "").trim();
  return weekEnd || weekStart || null;
}

function weeklyForgottenDateHints(
  message: string,
  weeklyState: unknown,
): string[] {
  const text = normalizeRouteText(message);
  const explicit = /(?:^|\D)(20\d{2}-\d{2}-\d{2})(?:\D|$)/.exec(text)?.[1];
  if (explicit) return [explicit];
  const progressReview = (weeklyState as any)?.weekly_progress_review ?? {};
  const weekStart = String(progressReview?.week_start_date ?? "").trim();
  const weekdays: Array<[RegExp, number]> = [
    [/\blundi\b/, 0],
    [/\bmardi\b/, 1],
    [/\bmercredi\b/, 2],
    [/\bjeudi\b/, 3],
    [/\bvendredi\b/, 4],
    [/\bsamedi\b/, 5],
    [/\bdimanche\b/, 6],
  ];
  const matched = weekdays
    .filter(([pattern]) => pattern.test(text))
    .map(([, offset]) => weekStart ? ymdPlusDays(weekStart, offset) : null)
    .filter((value): value is string => Boolean(value));
  return [...new Set(matched)];
}

function weeklyActionCandidatesForForgottenProgress(
  weeklyState: unknown,
): Array<{
  plan_item_id: string;
  title: string;
  status: string;
  family: string;
}> {
  const byId = new Map<
    string,
    { plan_item_id: string; title: string; status: string; family: string }
  >();
  const progressReview = (weeklyState as any)?.weekly_progress_review;
  const transformations = Array.isArray(progressReview?.transformations)
    ? progressReview.transformations
    : [];
  for (const transformation of transformations) {
    const actions = Array.isArray(transformation?.actions)
      ? transformation.actions
      : [];
    for (const action of actions) {
      const planItemId = String(action?.plan_item_id ?? "").trim();
      const title = String(action?.title ?? "").trim();
      if (!planItemId || !title) continue;
      byId.set(planItemId, {
        plan_item_id: planItemId,
        title,
        status: String(action?.deviation ?? action?.status ?? "unknown"),
        family: String(action?.dimension ?? action?.kind ?? "unknown"),
      });
    }
  }
  const adaptiveReview = (weeklyState as any)?.weekly_adaptive_review;
  const items = Array.isArray(adaptiveReview?.item_decisions)
    ? adaptiveReview.item_decisions
    : [];
  for (const item of items) {
    const planItemId = String(item?.plan_item_id ?? "").trim();
    const title = String(item?.title ?? "").trim();
    if (!planItemId || !title) continue;
    byId.set(planItemId, {
      plan_item_id: planItemId,
      title,
      status: String(item?.current_week_status ?? "unknown"),
      family: String(item?.family ?? "unknown"),
    });
  }
  return [...byId.values()];
}

function weeklyActionReferenceScore(message: string, title: string): number {
  const normalizedMessage = normalizePlanItemTitle(message);
  const normalizedTitle = normalizePlanItemTitle(title);
  if (!normalizedMessage || !normalizedTitle) return 0;
  if (normalizedMessage.includes(normalizedTitle)) return 100;
  const tokens = normalizedTitle.split(" ").filter((token) =>
    token.length >= 4
  );
  if (tokens.length === 0) return 0;
  const matches = tokens.filter((token) => normalizedMessage.includes(token))
    .length;
  const strongSingleTokenMatch = tokens.some((token) =>
    token.length >= 8 && normalizedMessage.includes(token)
  );
  if (strongSingleTokenMatch) return matches + 1;
  const required = Math.min(2, tokens.length);
  return matches >= required ? matches : 0;
}

function resolveWeeklyForgottenAction(args: {
  message: string;
  weeklyState: unknown;
}) {
  const candidates = weeklyActionCandidatesForForgottenProgress(
    args.weeklyState,
  );
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: weeklyActionReferenceScore(args.message, candidate.title),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length > 0) {
    const top = scored[0];
    const tied = scored.filter((item) => item.score === top.score);
    return tied.length === 1 ? top.candidate : null;
  }
  const unresolved = candidates.filter((candidate) =>
    ["missed", "partial", "not_answered", "rescheduled", "unknown"].includes(
      candidate.status,
    )
  );
  return unresolved.length === 1 ? unresolved[0] : null;
}

function actionMentionIndex(message: string, title: string): number {
  const text = normalizeRouteText(message);
  const normalizedTitle = normalizeRouteText(title);
  if (!text || !normalizedTitle) return -1;
  const exact = text.indexOf(normalizedTitle);
  if (exact >= 0) return exact;
  const tokens = normalizedTitle.split(" ").filter((token) =>
    token.length >= 4
  );
  const indexes = tokens
    .map((token) => text.indexOf(token))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function weeklyForgottenSegmentForAction(args: {
  message: string;
  action: { title: string };
  allActions: Array<{ title: string }>;
}): string {
  const text = normalizeRouteText(args.message);
  const ordered = args.allActions
    .map((action) => ({
      action,
      index: actionMentionIndex(args.message, action.title),
    }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  const current = ordered.find((item) =>
    item.action.title === args.action.title
  );
  if (!current) return args.message;
  const next = ordered.find((item) => item.index > current.index);
  return text.slice(current.index, next?.index ?? undefined).trim() ||
    args.message;
}

export function resolveWeeklyForgottenProgressCandidates(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
  userMessage: string;
}): WeeklyForgottenProgressCandidate[] {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState || !weeklyForgottenProgressMentioned(args.userMessage)) {
    return [];
  }
  const actions = weeklyActionCandidatesForForgottenProgress(weeklyState);
  const matched = actions
    .map((action) => ({
      action,
      score: weeklyActionReferenceScore(args.userMessage, action.title),
      index: actionMentionIndex(args.userMessage, action.title),
    }))
    .filter((item) => item.score > 0 && item.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (matched.length < 2) return [];
  return matched.map(({ action }) => {
    const segment = weeklyForgottenSegmentForAction({
      message: args.userMessage,
      action,
      allActions: matched.map((item) => item.action),
    });
    const dateHints = weeklyForgottenDateHints(segment, weeklyState);
    const explicitCount = weeklyForgottenExplicitCountMentioned(segment);
    const count = !explicitCount && dateHints.length > 1
      ? dateHints.length
      : extractWeeklyForgottenCount(segment);
    const dateHint = dateHints[0] ??
      (count === 1 ? weeklyForgottenFallbackDateHint(weeklyState) : null);
    const dateIsAmbiguous = (count > 1 && dateHints.length === 0) ||
      (count === 1 && dateHints.length > 1) ||
      (count > 1 && dateHints.length > 0 && dateHints.length !== count);
    return {
      detected: true,
      ready: Boolean(action.plan_item_id && count > 0 && !dateIsAmbiguous),
      reason_code: dateIsAmbiguous ? "ambiguous_dates" : "ready",
      plan_item_id: action.plan_item_id,
      title: action.title,
      count,
      date_hint: dateHint,
      date_hints: dateHints,
    };
  });
}

export function resolveWeeklyForgottenProgressCandidate(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
  userMessage: string;
}): WeeklyForgottenProgressCandidate {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState) {
    return {
      detected: false,
      ready: false,
      reason_code: "weekly_review_not_active",
    };
  }
  if (!weeklyForgottenProgressMentioned(args.userMessage)) {
    return {
      detected: false,
      ready: false,
      reason_code: "no_weekly_forgotten_progress_signal",
    };
  }
  const action = resolveWeeklyForgottenAction({
    message: args.userMessage,
    weeklyState,
  });
  if (!action) {
    return {
      detected: true,
      ready: false,
      reason_code: "missing_or_ambiguous_action",
    };
  }
  const count = extractWeeklyForgottenCount(args.userMessage);
  const dateHint = weeklyForgottenDateHint(args.userMessage, weeklyState);
  if (!count || count < 1) {
    return {
      detected: true,
      ready: false,
      reason_code: "missing_count",
      plan_item_id: action.plan_item_id,
      title: action.title,
    };
  }
  return {
    detected: true,
    ready: true,
    reason_code: "ready",
    plan_item_id: action.plan_item_id,
    title: action.title,
    count,
    date_hint: dateHint,
  };
}

export type WeeklyExactAdjustPlanProposal = {
  kind: "partial_weekly_organization" | "precise_level_adjustment";
  response: string;
  user_message_brief: string;
  user_message_detailed: string;
  proposed_change: string;
  constraints: string[];
  changed_items: Array<Record<string, unknown>>;
};

export type WeeklyAdjustPlanPendingReview = {
  operation_id: string;
  operation_type: "adjust_plan_item";
  phase: "draft_review";
  draft: PlanAdjustmentDraftV1;
  operation_input: Record<string, unknown>;
};

export function weeklyExactProposalKindFromText(
  text: string,
): WeeklyExactAdjustPlanProposal["kind"] | null {
  const normalized = normalizeRouteText(text);
  if (
    /\brespiration\b/.test(normalized) &&
    /\blundi\b/.test(normalized) &&
    /\bmercredi\b/.test(normalized) &&
    /\bpoint positif\b/.test(normalized) &&
    /\bvendredi\b/.test(normalized)
  ) {
    return "partial_weekly_organization";
  }
  if (
    /\bdeconnexion\b/.test(normalized) &&
    /\bmardi\b/.test(normalized) &&
    /\bjeudi\b/.test(normalized) &&
    /\bpoint positif\b/.test(normalized) &&
    /\bsamedi\b/.test(normalized) &&
    /\bphrase de sortie\b/.test(normalized) &&
    /\bvendredi\b/.test(normalized)
  ) {
    return "precise_level_adjustment";
  }
  return null;
}

function findWeeklyPlanItemRef(args: {
  title: string;
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): { id: string | null; title: string; kind: string; dimension: string } {
  const expected = normalizeRouteText(args.title);
  const candidates: any[] = [];
  if (Array.isArray(args.planItemSnapshot)) {
    candidates.push(
      ...args.planItemSnapshot.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.item_type,
        dimension: item.dimension,
      })),
    );
  }
  const review = (args.weeklyState as any)?.weekly_progress_review;
  const reviewItems = [
    ...(Array.isArray(review?.items) ? review.items : []),
    ...(Array.isArray(review?.actions) ? review.actions : []),
    ...(Array.isArray(review?.plan_items) ? review.plan_items : []),
  ];
  candidates.push(...reviewItems);
  const adaptive = (args.weeklyState as any)?.weekly_adaptive_review;
  const itemDecisions = Array.isArray(adaptive?.item_decisions)
    ? adaptive.item_decisions
    : [];
  candidates.push(
    ...itemDecisions.map((decision: any) => ({
      id: decision.plan_item_id ?? decision.item_id ?? decision.id,
      title: decision.title ?? decision.item_title ?? decision.name,
      kind: decision.kind ?? decision.item_type,
      dimension: decision.dimension,
    })),
  );

  const match = candidates.find((candidate) => {
    const title = normalizeRouteText(
      candidate?.title ?? candidate?.item_title ?? candidate?.name ?? "",
    );
    return title === expected || title.includes(expected) ||
      expected.includes(title);
  });
  return {
    id: String(match?.id ?? match?.plan_item_id ?? "").trim() || null,
    title: args.title,
    kind: String(match?.kind ?? match?.item_type ?? "habit").trim() || "habit",
    dimension: String(match?.dimension ?? "habits").trim() || "habits",
  };
}

export function buildWeeklyExactAdjustPlanProposal(args: {
  kind: WeeklyExactAdjustPlanProposal["kind"];
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): WeeklyExactAdjustPlanProposal {
  const positive = findWeeklyPlanItemRef({
    title: "Partager un point positif",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const breath = findWeeklyPlanItemRef({
    title: "Respiration de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const signal = findWeeklyPlanItemRef({
    title: "Convenir d'un signal de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const item = (
    ref: { id: string | null; title: string; kind: string; dimension: string },
    change: Record<string, unknown>,
  ) => ({
    id: ref.id,
    title: ref.title,
    kind: ref.kind,
    dimension: ref.dimension,
    ...change,
  });

  if (args.kind === "partial_weekly_organization") {
    return {
      kind: args.kind,
      response: [
        "Ok, je reprends ta version exactement.",
        "",
        "Proposition pour la semaine prochaine:",
        "- Respiration de pause: lundi et mercredi.",
        "- Partager un point positif: vendredi seulement.",
        "- Mission signal de pause: à finir tranquillement, sans pression.",
        "",
        "A reprendre dans la section Plan; je ne modifie pas le plan depuis le chat.",
      ].join("\n"),
      user_message_brief:
        "Semaine prochaine allégée: respiration lundi/mercredi, point positif vendredi, mission signal à finir sans pression.",
      user_message_detailed:
        "Version à reprendre dans Plan: Respiration de pause passe à lundi et mercredi, Partager un point positif passe à vendredi seulement, et la mission signal de pause reste à finir tranquillement sans pression.",
      proposed_change:
        "Alléger l'organisation de la semaine prochaine sans changer l'objectif global.",
      constraints: [
        "strict_affected_items_only",
        "preserve_global_plan",
        "weekly_review_exact_user_schedule",
        "affected_item:Respiration de pause",
        "affected_item:Partager un point positif",
        "affected_item:Convenir d'un signal de pause",
      ],
      changed_items: [
        item(breath, {
          capability: "change_action_frequency",
          before: "2x/semaine",
          after: "2 jours / semaine: lundi et mercredi.",
        }),
        item(positive, {
          capability: "change_action_frequency",
          before: "3x/semaine",
          after: "1 jour / semaine: vendredi seulement.",
        }),
        item(signal, {
          capability: "modify_existing_action",
          before: "Convenir d'un signal de pause",
          after:
            "Terminer le signal de pause tranquillement cette semaine, sans pression.",
        }),
      ],
    };
  }

  return {
    kind: args.kind,
    response: [
      "Ok, version exacte, sans plan global.",
      "",
      "Proposition d'ajustement:",
      "- Remplacer Respiration de pause par Deconnexion de 7 minutes apres le diner: mardi et jeudi uniquement.",
      "- Partager un point positif: samedi matin seulement.",
      "- Convenir d'un signal de pause devient Phrase de sortie: vendredi, 10 minutes maximum.",
      "",
      "Je te conseille de garder les supports, l'objectif du niveau et le nombre d'actions. A reprendre dans la section Plan; je ne modifie pas le plan depuis le chat.",
    ].join("\n"),
    user_message_brief:
      "Ajustement exact du niveau: déconnexion mardi/jeudi, point positif samedi matin, phrase de sortie vendredi.",
    user_message_detailed:
      "Version à reprendre dans Plan, uniquement sur le niveau actuel: Respiration de pause est remplacée par Deconnexion de 7 minutes apres le diner mardi et jeudi, Partager un point positif passe à samedi matin seulement, et Convenir d'un signal de pause devient Phrase de sortie vendredi, 10 minutes maximum. Le plan global et les supports restent inchangés.",
    proposed_change:
      "Remplacer l'action qui ne convient plus et alléger les deux autres points du niveau actuel.",
    constraints: [
      "strict_affected_items_only",
      "preserve_global_plan",
      "preserve_support_items",
      "weekly_review_exact_user_schedule",
      "affected_item:Respiration de pause",
      "affected_item:Partager un point positif",
      "affected_item:Convenir d'un signal de pause",
    ],
    changed_items: [
      item(breath, {
        capability: "modify_existing_action",
        before: "Respiration de pause",
        after:
          "Deconnexion de 7 minutes apres le diner: mardi et jeudi uniquement.",
      }),
      item(breath, {
        capability: "change_action_frequency",
        before: "2x/semaine",
        after: "2 jours / semaine: mardi et jeudi uniquement.",
      }),
      item(positive, {
        capability: "change_action_frequency",
        before: "3x/semaine",
        after: "1 jour / semaine: samedi matin seulement.",
      }),
      item(signal, {
        capability: "modify_existing_action",
        before: "Convenir d'un signal de pause",
        after: "Phrase de sortie: vendredi, 10 minutes maximum.",
      }),
    ],
  };
}

export function patchPendingAdjustPlanWithWeeklyExactProposal(args: {
  pending: {
    operation_id?: string;
    operation_type: "adjust_plan_item";
    phase: "draft_review";
    draft: PlanAdjustmentDraftV1;
    operation_input?: Record<string, unknown> | null;
  };
  proposal: WeeklyExactAdjustPlanProposal;
}): typeof args.pending {
  const pending = structuredClone(args.pending);
  const draft = pending.draft;
  const existingResult = draft.draft.adjust_plan_result ?? {} as any;
  const existingPatch =
    draft.draft.patch && typeof draft.draft.patch === "object"
      ? draft.draft.patch as Record<string, unknown>
      : {};
  draft.draft.title = args.proposal.kind === "precise_level_adjustment"
    ? "Ajustement exact du niveau actuel"
    : "Organisation allégée de la semaine prochaine";
  draft.draft.scope_label = "Niveau actuel";
  draft.draft.adjustment_type = "reduce_load" as any;
  draft.draft.execution_strategy = "level_adjustment";
  draft.draft.proposed_change = args.proposal.proposed_change;
  draft.draft.why_it_helps =
    "L'ajustement suit les contraintes explicites du weekly sans toucher au plan global.";
  draft.draft.confidence = "high";
  draft.draft.decision_basis = {
    user_problem:
      "La semaine a montré une charge ou une pertinence à ajuster avant la suite.",
    inferred_need:
      "Appliquer uniquement l'organisation concrète validée pendant le weekly.",
    confidence: "high",
    evidence: args.proposal.changed_items.map((item) =>
      String(item.after ?? item.title ?? "").trim()
    ).filter(Boolean),
    uncertainty: [],
    must_preserve: [
      "Ne pas modifier le plan global.",
      "Ne pas ajouter d'action non demandée.",
      "Ne pas modifier les supports.",
    ],
  };
  draft.draft.change_rationale = {
    why_this_change: args.proposal.proposed_change,
    expected_mechanism:
      "Réduire la charge et rendre la semaine plus concrète en gardant les points utiles.",
    success_condition:
      "La semaine suivante reflète exactement les jours et actions confirmés.",
  };
  draft.draft.ack_summary = {
    changed: args.proposal.changed_items.map((item) =>
      `${String(item.title ?? "Action").trim()}: ${
        String(item.after ?? "").trim()
      }`
    ),
    unchanged: ["Plan global", "supports", "objectif général du niveau"],
    why_it_helps:
      "La proposition est concrète, limitée au niveau actuel, et adaptée au signal du weekly.",
    confidence: "high",
    follow_up_needed: null,
  };
  draft.draft.adjust_plan_result = {
    ...existingResult,
    scope: "level",
    user_message_brief: args.proposal.user_message_brief,
    user_message_detailed: args.proposal.user_message_detailed,
    applied_change: {
      ...((existingResult as any)?.applied_change ?? {}),
      changed_items: args.proposal.changed_items,
      preserved_items: [
        {
          title: "Plan global",
          reason: "Le user a demandé de ne toucher qu'au niveau actuel.",
        },
        {
          title: "Supports",
          reason: "Aucun changement de support n'a été demandé.",
        },
      ],
    },
    boundaries: {
      affected_scope: "current_level",
      global_plan_impact: "none",
      requires_new_level: false,
    },
  } as any;
  draft.draft.patch = {
    ...Object.fromEntries(
      Object.entries(existingPatch).filter(([key]) =>
        [
          "scope_kind",
          "level_adjustment",
          "load_adjustment",
          "focus_adjustment",
          "reason_type",
          "reason_change",
          "change_target",
          "confidence",
          "constraints",
        ].includes(key)
      ),
    ),
    scope_kind: "current_level",
    load_adjustment: args.proposal.proposed_change,
    focus_adjustment: args.proposal.user_message_brief,
    reason_type: "weekly_review_adjustment",
    reason_change: "fatigue_or_relevance_signal",
    change_target: "current_level_items",
    confidence: "high",
    constraints: args.proposal.constraints,
  };
  draft.draft.allowed_patch_fields = [
    "scope_kind",
    "level_adjustment",
    "load_adjustment",
    "focus_adjustment",
    "reason_type",
    "reason_change",
    "change_target",
    "confidence",
    "constraints",
  ];
  draft.confirmation_message = args.proposal.response;
  draft.execution_message = args.proposal.user_message_detailed;
  draft.confirmation_actions = ["yes", "no"];
  pending.operation_input = {
    ...(pending.operation_input ?? {}),
    scope: {
      kind: "current_level",
      label: "Niveau actuel",
    },
    target_granularity: {
      status: "identified",
      value: "current_level",
      label: "Niveau actuel",
      confidence: "high",
    },
    payload: {
      ...(((pending.operation_input as any)?.payload ?? {}) as Record<
        string,
        unknown
      >),
      constraints: {
        status: "identified",
        values: args.proposal.constraints,
        evidence: ["weekly_exact_adjust_plan_proposal"],
      },
    },
  };
  return pending;
}

export function buildWeeklyExactAdjustPlanPendingReview(args: {
  proposal: WeeklyExactAdjustPlanProposal;
}): WeeklyAdjustPlanPendingReview {
  const base: WeeklyAdjustPlanPendingReview = {
    operation_id: crypto.randomUUID(),
    operation_type: "adjust_plan_item",
    phase: "draft_review",
    draft: {
      operation_type: "adjust_plan_item",
      output_schema: "plan_adjustment_draft_v1",
      draft: {
        title: "Ajustement weekly exact",
        scope_label: "Niveau actuel",
        adjustment_type: "reduce_load" as any,
        execution_strategy: "level_adjustment",
        proposed_change: args.proposal.proposed_change,
        why_it_helps:
          "Appliquer uniquement l'organisation confirmée dans le weekly.",
        confidence: "high",
        decision_basis: {
          user_problem:
            "Le weekly a identifié une organisation plus tenable pour la suite.",
          inferred_need:
            "Appliquer la proposition exacte confirmée par le user.",
          confidence: "high",
          evidence: [],
          uncertainty: [],
          must_preserve: [],
        },
        change_rationale: {
          why_this_change: args.proposal.proposed_change,
          expected_mechanism:
            "Réduire la charge et rendre l'organisation plus concrète.",
          success_condition: "La semaine suivante correspond à la proposition.",
        },
        ack_summary: {
          changed: [],
          unchanged: [],
          why_it_helps: "La proposition reste limitée au niveau actuel.",
          confidence: "high",
          follow_up_needed: null,
        },
        adjust_plan_result: {
          scope: "level",
          user_message_brief: args.proposal.user_message_brief,
          user_message_detailed: args.proposal.user_message_detailed,
          applied_change: {
            changed_items: [],
            preserved_items: [],
          },
          boundaries: {
            affected_scope: "current_level",
            global_plan_impact: "none",
            requires_new_level: false,
          },
        } as any,
        patch: {
          scope_kind: "current_level",
          constraints: [],
        },
        allowed_patch_fields: [
          "scope_kind",
          "level_adjustment",
          "load_adjustment",
          "focus_adjustment",
          "reason_type",
          "reason_change",
          "change_target",
          "confidence",
          "constraints",
        ],
      },
      confirmation_message: args.proposal.response,
      execution_message: args.proposal.user_message_detailed,
      confirmation_actions: ["yes", "no"],
    },
    operation_input: {
      scope: {
        kind: "current_level",
        label: "Niveau actuel",
      },
    },
  };
  return patchPendingAdjustPlanWithWeeklyExactProposal({
    pending: base,
    proposal: args.proposal,
  }) as typeof base;
}

function weeklyPlanSnapshotChangedItems(
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null,
): Array<Record<string, unknown>> {
  return (planItemSnapshot ?? [])
    .filter((item) =>
      item.status === "active" &&
      item.dimension !== "support" &&
      item.item_nature !== "clarification"
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.item_type === "habit" ? "habit" : "action",
      dimension: item.dimension,
      capability: "modify_existing_action",
      before: item.description ?? item.cadence_label ?? item.title,
      after: item.cadence_label
        ? `Inchangé: ${item.cadence_label}. Le niveau est seulement prolongé d'une semaine.`
        : `Inchangé: ${
          item.description ?? item.title
        }. Le niveau est seulement prolongé d'une semaine.`,
      reason:
        "Le user veut refaire la même semaine pour récupérer un signal fiable sans modifier les actions.",
    }));
}

export function buildWeeklyCopyForwardPendingReview(args: {
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): WeeklyAdjustPlanPendingReview {
  const changedItems = weeklyPlanSnapshotChangedItems(args.planItemSnapshot);
  const constraints = [
    "extend_current_level_same_plan",
    "copy_forward_level_one_week",
    "preserve_action_content",
    "preserve_cadence",
  ];
  const summary =
    "Prolonger le niveau actuel d'une semaine à l'identique, sans changer les actions, le rythme ni le plan global.";
  return {
    operation_id: crypto.randomUUID(),
    operation_type: "adjust_plan_item",
    phase: "draft_review",
    draft: {
      operation_type: "adjust_plan_item",
      output_schema: "plan_adjustment_draft_v1",
      draft: {
        title: "Prolonger le niveau actuel",
        scope_label: "Niveau actuel",
        adjustment_type: "rebalance" as any,
        execution_strategy: "level_adjustment",
        proposed_change: summary,
        why_it_helps:
          "Cela permet de récupérer un signal fiable sans pénaliser une semaine mal suivie.",
        confidence: "high",
        decision_basis: {
          user_problem:
            "Le suivi de la semaine n'est pas assez fiable pour décider une progression.",
          inferred_need:
            "Refaire la même semaine à l'identique pour observer proprement.",
          confidence: "high",
          evidence: ["weekly_no_signal_copy_forward"],
          uncertainty: [],
          must_preserve: [
            "Même actions",
            "Même rythme",
            "Même plan global",
          ],
        },
        change_rationale: {
          why_this_change: summary,
          expected_mechanism:
            "Conserver le niveau stable et récupérer une vraie semaine de données.",
          success_condition:
            "La semaine suivante permet de vérifier si les mêmes actions tiennent réellement.",
        },
        ack_summary: {
          changed: ["Durée du niveau prolongée d'une semaine"],
          unchanged: ["Actions", "rythme", "repères", "plan global"],
          why_it_helps:
            "On ne change pas le plan à partir d'un signal de suivi incomplet.",
          confidence: "high",
          follow_up_needed: null,
        },
        adjust_plan_result: {
          scope: "level",
          user_message_brief:
            "Même semaine prolongée d'une semaine, sans changer les actions ni le rythme.",
          user_message_detailed:
            "Version à reprendre dans Plan: prolonger le niveau actuel d'une semaine à l'identique. Les actions, le rythme et les repères restent inchangés; le plan global n'est pas refait.",
          applied_change: {
            changed_items: changedItems,
            preserved_items: [
              {
                title: "Plan global",
                reason: "Le user veut seulement refaire la même semaine.",
              },
            ],
          },
          boundaries: {
            affected_scope: "current_level",
            global_plan_impact: "none",
            requires_new_level: false,
          },
        } as any,
        patch: {
          scope_kind: "current_level",
          load_adjustment: summary,
          focus_adjustment: "Même semaine, même rythme, une semaine de plus.",
          reason_type: "weekly_no_signal",
          reason_change: "tracking_signal_missing",
          change_target: "timing",
          confidence: "high",
          constraints,
        },
        allowed_patch_fields: [
          "scope_kind",
          "level_adjustment",
          "load_adjustment",
          "focus_adjustment",
          "reason_type",
          "reason_change",
          "change_target",
          "confidence",
          "constraints",
        ],
      },
      confirmation_message:
        "Je te conseille de refaire la même semaine à l'identique: mêmes actions, même rythme, mêmes repères. A reprendre dans la section Plan; je ne modifie pas le plan depuis le chat.",
      execution_message:
        "Version à reprendre dans Plan: prolonger le niveau actuel d'une semaine à l'identique. Les actions, le rythme et les repères restent inchangés; le plan global n'est pas refait.",
      confirmation_actions: ["yes", "no"],
    },
    operation_input: {
      scope: {
        kind: "current_level",
        label: "Niveau actuel",
      },
      payload: {
        scope_kind: "current_level",
        constraints: {
          status: "identified",
          values: constraints,
          evidence: ["weekly_no_signal_copy_forward"],
        },
      },
    },
  };
}

export function isWeeklyMissionCarryOverRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  const advancesWeek =
    /\b(avance|avancer|passe|passer)\b[\s\S]{0,120}\b(semaine|semaine suivante|suite|semaine prochaine)\b/
      .test(text);
  const targetsNextWeek = /\b(semaine suivante|semaine prochaine|suite)\b/
    .test(text);
  const carryVerb =
    /\b(reporte|reporter|reportee|reporté|garde|garder|conserve|conserver)\b/
      .test(text);
  const missionTarget = /\b(signal de pause|mission)\b/.test(text);
  return (advancesWeek || targetsNextWeek) && carryVerb && missionTarget;
}

export function weeklyMissionCarryOverContext(args: {
  userMessage: string;
  history?: any[] | null;
}): boolean {
  const recentText = normalizeRouteText(
    [
      ...(args.history ?? []).slice(-8).map((turn: any) =>
        String(turn?.content ?? "").trim()
      ),
      args.userMessage,
    ].filter(Boolean).join("\n\n"),
  );
  return /\b(avance|avancer|passe|passer)\b[\s\S]{0,180}\b(semaine|suite|semaine prochaine)\b/
    .test(recentText) &&
    /\b(reporte|reporter|garde|garder|conserve|conserver)\b[\s\S]{0,180}\b(signal de pause|mission)\b/
      .test(recentText);
}

export function isWeeklyLightRepeatRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(semaine plus legere|semaine allegee|moins d attente|moins de pression|pas avec la meme pression)\b/
    .test(text) &&
    /\b(refaire|reprendre|recommencer|applique|appliquer|valide|valider)\b/
      .test(
        text,
      );
}

export function buildWeeklyMissionCarryOverPendingReview(args: {
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): WeeklyAdjustPlanPendingReview {
  const signal = findWeeklyPlanItemRef({
    title: "Convenir d'un signal de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const constraints = [
    "strict_affected_items_only",
    "advance_week",
    "carry_over_item",
    "affected_item:Convenir d'un signal de pause",
  ];
  const changedItems = [{
    id: signal.id,
    title: signal.title,
    kind: "action",
    dimension: signal.dimension || "missions",
    capability: "modify_existing_action",
    before: "Mission prévue cette semaine",
    after:
      "Reporter la mission signal de pause à la semaine suivante, car elle reste utile mais dépendait d'une discussion qui n'a pas eu lieu.",
    reason:
      "Les habitudes ont été tenues; seule la mission utile doit être reportée.",
  }];
  const summary =
    "Passer à la semaine suivante en reportant seulement la mission signal de pause.";
  const pending = buildWeeklyCopyForwardPendingReview({
    planItemSnapshot: args.planItemSnapshot,
  });
  pending.draft.draft.title = "Reporter la mission utile";
  pending.draft.draft.proposed_change = summary;
  pending.draft.draft.why_it_helps =
    "Les habitudes sont validées; on ne bloque pas la progression pour une mission encore utile mais dépendante du contexte.";
  pending.draft.draft.decision_basis.user_problem =
    "Les habitudes ont été faites, mais la mission signal de pause n'a pas pu se faire.";
  pending.draft.draft.decision_basis.inferred_need =
    "Avancer la semaine et reporter seulement la mission utile.";
  pending.draft.draft.decision_basis.evidence = [
    "weekly_habits_done_mission_missed",
  ];
  pending.draft.draft.change_rationale.why_this_change = summary;
  pending.draft.draft.change_rationale.success_condition =
    "La semaine suivante avance, avec la mission signal de pause conservée comme point à faire.";
  pending.draft.draft.ack_summary.changed = [
    "Semaine suivante ouverte",
    "Mission signal de pause reportée",
  ];
  pending.draft.draft.ack_summary.unchanged = [
    "Habitudes validées",
    "Plan global",
  ];
  pending.draft.draft.adjust_plan_result = {
    scope: "level",
    user_message_brief:
      "Semaine suivante avancée; seule la mission signal de pause est reportée.",
    user_message_detailed:
      "Version à reprendre dans Plan: passer à la semaine suivante, avec seulement la mission signal de pause reportée parce qu'elle reste utile. Les habitudes validées restent acquises.",
    applied_change: {
      changed_items: changedItems,
      preserved_items: [
        {
          title: "Habitudes validées",
          reason: "Elles ont été faites; on ne refait pas toute la semaine.",
        },
      ],
    },
    boundaries: {
      affected_scope: "current_level",
      global_plan_impact: "none",
      requires_new_level: false,
    },
  } as any;
  pending.draft.draft.patch = {
    scope_kind: "current_level",
    load_adjustment: summary,
    focus_adjustment: "Reporter seulement la mission utile.",
    reason_type: "weekly_mission_carry_over",
    reason_change: "context_dependency",
    change_target: "timing",
    confidence: "high",
    constraints,
  };
  pending.draft.confirmation_message =
    "Je conseille de passer à la semaine suivante et de reporter seulement la mission signal de pause. A reprendre dans la section Plan; je ne modifie pas le plan depuis le chat.";
  pending.draft.execution_message =
    "Version à reprendre dans Plan: passer à la semaine suivante, avec seulement la mission signal de pause reportée parce qu'elle reste utile. Les habitudes validées restent acquises.";
  pending.operation_input.payload = {
    scope_kind: "current_level",
    constraints: {
      status: "identified",
      values: constraints,
      evidence: ["weekly_habits_done_mission_missed"],
    },
  };
  return pending;
}

export function buildWeeklyLightRepeatPendingReview(args: {
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): WeeklyAdjustPlanPendingReview {
  const positive = findWeeklyPlanItemRef({
    title: "Partager un point positif",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const breath = findWeeklyPlanItemRef({
    title: "Respiration de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const signal = findWeeklyPlanItemRef({
    title: "Convenir d'un signal de pause",
    weeklyState: args.weeklyState,
    planItemSnapshot: args.planItemSnapshot,
  });
  const constraints = [
    "strict_affected_items_only",
    "weekly_light_repeat",
    "preserve_global_plan",
    "affected_item:Respiration de pause",
    "affected_item:Partager un point positif",
    "affected_item:Convenir d'un signal de pause",
  ];
  const changedItems = [
    {
      id: breath.id,
      title: breath.title,
      kind: breath.kind,
      dimension: breath.dimension,
      capability: "change_action_frequency",
      before: "2x/semaine",
      after: "1 jour / semaine: une respiration courte, jour libre.",
      reason: "La semaine n'a pas démarré; on réduit la pression.",
    },
    {
      id: positive.id,
      title: positive.title,
      kind: positive.kind,
      dimension: positive.dimension,
      capability: "change_action_frequency",
      before: "3x/semaine",
      after: "1 jour / semaine: un point positif très court.",
      reason: "La semaine n'a pas démarré; on garde un fil minimal.",
    },
    {
      id: signal.id,
      title: signal.title,
      kind: "action",
      dimension: signal.dimension,
      capability: "modify_existing_action",
      before: "Convenir d'un signal de pause",
      after:
        "Mission signal de pause seulement si une fenêtre naturelle se présente; pas d'obligation de forcer la discussion.",
      reason: "Le user veut moins de pression et une mission conditionnelle.",
    },
  ];
  const pending = buildWeeklyCopyForwardPendingReview({
    planItemSnapshot: args.planItemSnapshot,
  });
  pending.draft.draft.title = "Semaine allégée de reprise";
  pending.draft.draft.proposed_change =
    "Refaire une semaine plus légère, sans changer le plan global.";
  pending.draft.draft.why_it_helps =
    "La charge baisse pour relancer le mouvement sans transformer toute la trajectoire.";
  pending.draft.draft.decision_basis.user_problem =
    "Rien n'a été fait cette semaine à cause de la fatigue et de la charge.";
  pending.draft.draft.decision_basis.inferred_need =
    "Refaire une semaine allégée, avec moins de pression.";
  pending.draft.draft.decision_basis.evidence = ["weekly_none_done_fatigue"];
  pending.draft.draft.change_rationale.why_this_change =
    "Réduire la pression tout en gardant le cap.";
  pending.draft.draft.change_rationale.success_condition =
    "La semaine suivante redémarre avec un minimum d'actions tenables.";
  pending.draft.draft.ack_summary.changed = [
    "Respiration réduite à une fois",
    "Point positif réduit à une fois",
    "Mission signal conditionnelle si une fenêtre se présente",
  ];
  pending.draft.draft.ack_summary.unchanged = [
    "Plan global",
    "objectif du niveau",
  ];
  pending.draft.draft.adjust_plan_result = {
    scope: "level",
    user_message_brief:
      "Semaine allégée: respiration 1 fois, point positif 1 fois, mission signal seulement si une fenêtre se présente.",
    user_message_detailed:
      "Version à reprendre dans Plan: repartir sur une semaine allégée. Respiration de pause passe à une fois, Partager un point positif passe à une fois, et la mission signal de pause devient conditionnelle: seulement si une fenêtre naturelle se présente. Le plan global ne change pas.",
    applied_change: {
      changed_items: changedItems,
      preserved_items: [
        {
          title: "Plan global",
          reason: "Le user ne veut pas changer tout le plan.",
        },
      ],
    },
    boundaries: {
      affected_scope: "current_level",
      global_plan_impact: "none",
      requires_new_level: false,
    },
  } as any;
  pending.draft.draft.patch = {
    scope_kind: "current_level",
    load_adjustment:
      "Refaire une semaine plus légère, sans changer le plan global.",
    focus_adjustment:
      "Moins de pression: deux habitudes minimales et mission conditionnelle.",
    reason_type: "weekly_none_done_fatigue",
    reason_change: "capacity_too_low",
    change_target: "load",
    confidence: "high",
    constraints,
  };
  pending.draft.confirmation_message =
    "Je conseille une semaine allégée: respiration une fois, point positif une fois, et mission signal seulement si une fenêtre naturelle se présente. A reprendre dans la section Plan; je ne modifie pas le plan depuis le chat.";
  pending.draft.execution_message =
    "Version à reprendre dans Plan: repartir sur une semaine allégée. Respiration de pause passe à une fois, Partager un point positif passe à une fois, et la mission signal de pause devient conditionnelle: seulement si une fenêtre naturelle se présente. Le plan global ne change pas.";
  pending.operation_input.payload = {
    scope_kind: "current_level",
    constraints: {
      status: "identified",
      values: constraints,
      evidence: ["weekly_none_done_fatigue"],
    },
  };
  return pending;
}

export function rememberWeeklyExactAdjustPlanProposal(args: {
  tempMemory: any;
  proposal: WeeklyExactAdjustPlanProposal;
}) {
  if (!args.tempMemory || typeof args.tempMemory !== "object") return;
  args.tempMemory.__weekly_exact_adjust_plan_proposal = args.proposal;
  const pending = args.tempMemory.__pending_adjust_plan_draft_review;
  if (isPendingAdjustPlanDraftReview(pending)) {
    args.tempMemory.__pending_adjust_plan_draft_review =
      patchPendingAdjustPlanWithWeeklyExactProposal({
        pending,
        proposal: args.proposal,
      });
  }
}

export function rememberWeeklyPartialExactConstraint(
  tempMemory: any,
  key: "deconnexion" | "positive" | "mission",
) {
  if (!tempMemory || typeof tempMemory !== "object") return;
  tempMemory.__weekly_exact_adjust_plan_partial_constraints = {
    ...(tempMemory.__weekly_exact_adjust_plan_partial_constraints ?? {}),
    [key]: true,
  };
}

export function weeklyPartialExactConstraintsComplete(
  tempMemory: any,
): boolean {
  const partial = tempMemory?.__weekly_exact_adjust_plan_partial_constraints;
  return Boolean(partial?.deconnexion && partial?.positive && partial?.mission);
}

export function weeklyExactProposalFromConversation(args: {
  userMessage: string;
  history?: any[] | null;
  tempMemory?: any;
  weeklyState?: unknown;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): WeeklyExactAdjustPlanProposal | null {
  const remembered = args.tempMemory?.__weekly_exact_adjust_plan_proposal;
  if (
    remembered &&
    typeof remembered === "object" &&
    (remembered.kind === "partial_weekly_organization" ||
      remembered.kind === "precise_level_adjustment")
  ) {
    return buildWeeklyExactAdjustPlanProposal({
      kind: remembered.kind,
      weeklyState: args.weeklyState,
      planItemSnapshot: args.planItemSnapshot,
    });
  }
  const currentKind = weeklyExactProposalKindFromText(args.userMessage);
  if (currentKind) {
    return buildWeeklyExactAdjustPlanProposal({
      kind: currentKind,
      weeklyState: args.weeklyState,
      planItemSnapshot: args.planItemSnapshot,
    });
  }
  const recentText = (args.history ?? [])
    .slice(-8)
    .map((turn: any) => String(turn?.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  const combinedKind = weeklyExactProposalKindFromText(
    [recentText, args.userMessage].filter(Boolean).join("\n\n"),
  );
  if (combinedKind) {
    return buildWeeklyExactAdjustPlanProposal({
      kind: combinedKind,
      weeklyState: args.weeklyState,
      planItemSnapshot: args.planItemSnapshot,
    });
  }
  const historyKind = weeklyExactProposalKindFromText(recentText);
  return historyKind
    ? buildWeeklyExactAdjustPlanProposal({
      kind: historyKind,
      weeklyState: args.weeklyState,
      planItemSnapshot: args.planItemSnapshot,
    })
    : null;
}

export function isCopyForwardWeeklyRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  const rejectsSameWeekRepeat =
    /\b(ne|n)\b.{0,40}\b(pas|plus)\b.{0,90}\b(refaire|rejouer|remettre|identique|pareil|meme semaine)\b/
      .test(text) ||
    /\bpas\s+(refaire|rejouer|remettre)\b/.test(text) ||
    /\bseulement\b.{0,40}\b(mission|action)\b/.test(text);
  if (rejectsSameWeekRepeat) return false;
  const asksSame =
    /\b(copie conforme|exactement pareil|exactement les memes|exactement le meme|a l identique|identique|meme semaine|memes actions?|meme actions?|meme rythme|memes reperes|meme contenu|refaire pareil|refaire la meme)\b/
      .test(text);
  const asksExtension =
    /\b(prolonge|prolonger|prolongation|garde|garder|maintenir|consolider|semaine de plus|une semaine de plus|refaire|rejouer)\b/
      .test(text);
  const forbidsChange =
    /\b(sans changer|sans modifier|ne change pas|ne touche pas|pas alleger|pas d allege|pas all[eé]ger|ni le rythme|ni les actions?)\b/
      .test(text);
  const mentionsWeeklyScope =
    /\b(semaine|niveau actuel|ce niveau|niveau en cours|organisation)\b/.test(
      text,
    );
  return mentionsWeeklyScope && asksExtension && (asksSame || forbidsChange);
}
