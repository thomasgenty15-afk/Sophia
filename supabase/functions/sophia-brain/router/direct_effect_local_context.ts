import type {
  DirectEffectTimeContext,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import {
  oneShotReminderCanonicalLocalDispatcherPromptLines,
} from "./one_shot_reminder_prompt_contract.ts";

export type DirectEffectConfirmationContext = {
  has_committed_one_shot_reminder: boolean;
  has_requested_one_shot_reminder: boolean;
  one_shot_reminder: {
    committed: boolean;
    local_label: string | null;
    reminder_instruction: string | null;
  } | null;
  /** @deprecated Visible agents must use one_shot_reminder instead. */
  confirmation_text: string | null;
  /** @deprecated Kept empty for compatibility; do not expose raw effect rows. */
  committed_effects: unknown[];
  /** @deprecated Kept empty for compatibility; do not expose raw effect rows. */
  requested_effects: unknown[];
  /** @deprecated Kept empty for compatibility; do not expose raw effect rows. */
  blocked_effects: unknown[];
  do_not_recreate: true;
  do_not_reroute: true;
  do_not_redemand: true;
  do_not_confirm_without_commit: true;
  remaining_user_need_must_continue: true;
};

export type ActiveActionCandidateForDirectEffects = {
  plan_item_id: string;
  title: string;
  status: string;
  plan_id: string | null;
  tracking_type: string | null;
  dimension: string | null;
  aliases: string[];
  occurrence_id: string | null;
};

export function directEffectTimeContextFromUnknown(
  raw: unknown,
): DirectEffectTimeContext | null {
  const outer = isRecord(raw) ? raw : {};
  const root = isRecord(outer.direct_effect_time_context)
    ? outer.direct_effect_time_context
    : outer;
  const nowUtc = stringValue(root.now_utc);
  const timezone = stringValue(root.user_timezone);
  const locale = stringValue(root.user_locale);
  const localDateTime = stringValue(root.user_local_datetime);
  const localHuman = stringValue(root.user_local_human);
  if (!nowUtc || !timezone) return null;
  return {
    now_utc: nowUtc,
    user_timezone: timezone,
    user_locale: locale || "fr-FR",
    user_local_datetime: localDateTime,
    user_local_human: localHuman,
  };
}

export function directEffectTimeContextFromTurnFrame(
  turnFrame: unknown,
): DirectEffectTimeContext | null {
  const root = isRecord(turnFrame) ? turnFrame : {};
  return directEffectTimeContextFromUnknown(root.direct_effect_time_context);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown, max = 6): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function rawPlanItems(planSnapshot: unknown): unknown[] {
  if (Array.isArray(planSnapshot)) return planSnapshot;
  if (isRecord(planSnapshot) && Array.isArray(planSnapshot.items)) {
    return planSnapshot.items;
  }
  return [];
}

export function activeActionCandidatesForDirectEffects(
  planSnapshot: unknown,
  maxItems = 10,
): ActiveActionCandidateForDirectEffects[] {
  return rawPlanItems(planSnapshot)
    .map((raw): ActiveActionCandidateForDirectEffects | null => {
      if (!isRecord(raw)) return null;
      const planItemId = stringValue(
        raw.plan_item_id ?? raw.id ?? raw.item_id ?? raw.target_item_id,
      );
      const title = stringValue(raw.title ?? raw.label ?? raw.name);
      if (!planItemId || !title) return null;
      return {
        plan_item_id: planItemId,
        title,
        status: stringValue(raw.status) || "active",
        plan_id: stringValue(raw.plan_id) || null,
        tracking_type: stringValue(raw.tracking_type ?? raw.item_type) || null,
        dimension: stringValue(raw.dimension) || null,
        aliases: stringArray(raw.aliases ?? raw.user_facing_aliases),
        occurrence_id: stringValue(raw.occurrence_id) || null,
      };
    })
    .filter((item): item is ActiveActionCandidateForDirectEffects =>
      Boolean(item)
    )
    .filter((item) => item.status !== "archived" && item.status !== "deleted")
    .slice(0, maxItems);
}

export function dailyTargetsToActiveActionCandidates(
  targets: unknown,
  maxItems = 10,
): ActiveActionCandidateForDirectEffects[] {
  if (!Array.isArray(targets)) return [];
  return targets
    .map((raw): ActiveActionCandidateForDirectEffects | null => {
      if (!isRecord(raw)) return null;
      const planItemId = stringValue(
        raw.plan_item_id ?? raw.planItemId ?? raw.item_id,
      );
      const title = stringValue(raw.title ?? raw.label ?? raw.action_title);
      if (!planItemId || !title) return null;
      return {
        plan_item_id: planItemId,
        title,
        status: "active",
        plan_id: stringValue(raw.plan_id) || null,
        tracking_type: stringValue(raw.tracking_type ?? raw.item_type) || null,
        dimension: stringValue(raw.dimension) || null,
        aliases: stringArray(raw.aliases),
        occurrence_id: stringValue(raw.occurrence_id ?? raw.id) || null,
      };
    })
    .filter((item): item is ActiveActionCandidateForDirectEffects =>
      Boolean(item)
    )
    .slice(0, maxItems);
}

export function withDirectEffectLocalContext<T extends Record<string, unknown>>(
  context: T | null | undefined,
  planSnapshot?: unknown,
  extraCandidates?: ActiveActionCandidateForDirectEffects[],
  directEffectTimeContext?: DirectEffectTimeContext | null,
): T & {
  active_action_candidates_for_direct_effects:
    ActiveActionCandidateForDirectEffects[];
  direct_effect_time_context: DirectEffectTimeContext | null;
  direct_effect_tools: string[];
  direct_effect_tool_policy: Record<string, string>;
} {
  const base = context && typeof context === "object" && !Array.isArray(context)
    ? context
    : {} as T;
  const candidates = [
    ...(extraCandidates ?? []),
    ...activeActionCandidatesForDirectEffects(planSnapshot),
  ];
  const deduped = new Map<string, ActiveActionCandidateForDirectEffects>();
  for (const candidate of candidates) {
    if (!candidate.plan_item_id || deduped.has(candidate.plan_item_id)) {
      continue;
    }
    deduped.set(candidate.plan_item_id, candidate);
  }
  return {
    ...base,
    active_action_candidates_for_direct_effects: [...deduped.values()],
    direct_effect_time_context: directEffectTimeContext ?? null,
    direct_effect_tools: [
      "create_one_shot_reminder",
      "track_progress_plan_item",
    ],
    direct_effect_tool_policy: {
      track_progress_plan_item:
        "Use only when the user reports already-done/current progress. target_item_id must be copied from active_action_candidates_for_direct_effects.plan_item_id. Never invent ids; ambiguity or absent target means no direct effect.",
      create_one_shot_reminder:
        "Use for one-time reminder requests only. A duration/time is not enough: it must clearly refer to a wanted reminder/notification/programming request, not conversational pacing like 'talk for two minutes'. Use direct_effect_time_context.now_utc and direct_effect_time_context.user_timezone to compute payload_hint.UTC_time; never ask timezone when user_timezone is present. The owner validates date, time and instruction; do not treat recurring reminders as one-shot.",
    },
  };
}

export function directEffectLocalDispatcherPromptLines(): string[] {
  return [
    "Brique direct effects instantanes disponible pour les dispatchers locaux:",
    ...oneShotReminderCanonicalLocalDispatcherPromptLines(),
    "- Le contexte temporel canonique est dans platform_context.direct_effect_time_context. Ne calcule jamais UTC_time depuis l'horloge implicite du modele.",
    "- track_progress_plan_item: si le user rapporte un progres deja fait ou en cours sur une action active.",
    "- Pour track_progress_plan_item, target_item_id doit venir uniquement de platform_context.active_action_candidates_for_direct_effects[].plan_item_id ou du contexte direct equivalent. Ne jamais inventer un id.",
    "- Si plusieurs actions peuvent correspondre, si l'action est absente des candidates, si le user parle d'une intention future, ou si le statut n'est pas clair, ne cree pas de direct effect durable; demande/route une clarification.",
  ];
}

function directEffectLaneRecord(turnFrame: unknown): Record<string, unknown> {
  const root = isRecord(turnFrame) ? turnFrame : {};
  const lane = root.direct_effect_lane;
  return isRecord(lane) ? lane : {};
}

function effectsArray(
  lane: Record<string, unknown>,
  key: "committed_effects" | "requested_effects" | "blocked_effects",
): unknown[] {
  return Array.isArray(lane[key]) ? lane[key] as unknown[] : [];
}

function visibleConfirmationHint(lane: Record<string, unknown>): string | null {
  const text = stringValue(lane.visible_confirmation_hint);
  return text || null;
}

function hasEffect(effects: unknown[], type: string): boolean {
  return effects.some((effect) =>
    isRecord(effect) && String(effect.type ?? "") === type
  );
}

function oneShotReminderVisibleFact(
  committed: unknown[],
): DirectEffectConfirmationContext["one_shot_reminder"] {
  const effect = committed.find((candidate) =>
    isRecord(candidate) &&
    String(candidate.type ?? "") === "create_one_shot_reminder"
  );
  if (!isRecord(effect)) return null;
  return {
    committed: true,
    local_label: stringValue(effect.local_label) || null,
    reminder_instruction: stringValue(effect.reminder_instruction) || null,
  };
}

export function buildDirectEffectConfirmationContext(
  turnFrame: unknown,
): DirectEffectConfirmationContext | null {
  const root = isRecord(turnFrame) ? turnFrame : {};
  const directEffects = Array.isArray(root.direct_effects)
    ? root.direct_effects
    : [];
  const hasRequestedOneShot = directEffects.some((effect) =>
    isRecord(effect) &&
    String(effect.effect_type ?? "") === "create_one_shot_reminder"
  );
  const lane = directEffectLaneRecord(turnFrame);
  const committed = effectsArray(lane, "committed_effects");
  const requested = effectsArray(lane, "requested_effects");
  const blocked = effectsArray(lane, "blocked_effects");
  const hasCommittedOneShot = hasEffect(
    committed,
    "create_one_shot_reminder",
  );
  if (
    !hasRequestedOneShot && !hasCommittedOneShot && requested.length === 0 &&
    blocked.length === 0
  ) {
    return null;
  }
  return {
    has_committed_one_shot_reminder: hasCommittedOneShot,
    has_requested_one_shot_reminder: hasRequestedOneShot,
    one_shot_reminder: hasCommittedOneShot
      ? oneShotReminderVisibleFact(committed)
      : null,
    confirmation_text: null,
    committed_effects: [],
    requested_effects: [],
    blocked_effects: [],
    do_not_recreate: true,
    do_not_reroute: true,
    do_not_redemand: true,
    do_not_confirm_without_commit: true,
    remaining_user_need_must_continue: true,
  };
}

function hasCommittedOneShotReminderContext(context: unknown): boolean {
  if (!isRecord(context)) return false;
  if (context.has_committed_one_shot_reminder === true) return true;
  const oneShot = context.one_shot_reminder;
  return isRecord(oneShot) && oneShot.committed === true;
}

export function selectDirectEffectConfirmationContext(args: {
  turnFrame: unknown;
  reducedContext?: unknown;
  recentContext?: unknown;
}): DirectEffectConfirmationContext | Record<string, unknown> | null {
  const currentContext = isRecord(args.turnFrame)
    ? (args.turnFrame.direct_effect_confirmation_context ?? null)
    : null;
  const current = currentContext ?? buildDirectEffectConfirmationContext(
    args.turnFrame,
  );
  if (current) return current as DirectEffectConfirmationContext;

  if (hasCommittedOneShotReminderContext(args.recentContext)) {
    return args.recentContext as Record<string, unknown>;
  }
  if (hasCommittedOneShotReminderContext(args.reducedContext)) {
    return args.reducedContext as Record<string, unknown>;
  }
  return (args.reducedContext as Record<string, unknown> | null) ??
    (args.recentContext as Record<string, unknown> | null) ??
    null;
}

export function withDirectEffectConfirmationContext<
  T extends Record<string, unknown>,
>(
  turnFrame: T,
): T & {
  direct_effect_confirmation_context?: DirectEffectConfirmationContext;
} {
  const context = buildDirectEffectConfirmationContext(turnFrame);
  if (!context) return turnFrame;
  return {
    ...turnFrame,
    direct_effect_confirmation_context: context,
  };
}

export function directEffectConfirmationContextPrompt(
  turnFrame: unknown,
): string | null {
  const context = buildDirectEffectConfirmationContext(turnFrame);
  if (!context) return null;
  return [
    "DIRECT_EFFECT_CONFIRMATION_CONTEXT:",
    JSON.stringify(context),
    "Rules: if one_shot_reminder.committed=true, confirm the reminder naturally once; use one_shot_reminder.local_label for the time and one_shot_reminder.reminder_instruction for the reminder object; do not repeat reminder_instruction or an equivalent object twice; do not reformulate the reminder object before and after the time marker; never recreate, reroute, redemand, or claim the reminder without commit evidence; answer the remaining user need in the same response.",
  ].join("\n");
}

export function committedEffectsToConfirmFromToolSkillRun(
  toolSkillRun: unknown,
): Array<{
  effect_type: "track_progress_plan_item" | "create_one_shot_reminder";
  user_confirmation_fact: string;
  structured_fact: Record<string, unknown>;
}> {
  if (!isRecord(toolSkillRun)) return [];
  const effects = Array.isArray(toolSkillRun.committed_effects)
    ? toolSkillRun.committed_effects
    : [];
  return effects.flatMap((raw): Array<{
    effect_type: "track_progress_plan_item" | "create_one_shot_reminder";
    user_confirmation_fact: string;
    structured_fact: Record<string, unknown>;
  }> => {
    if (!isRecord(raw)) return [];
    const type = stringValue(raw.type);
    if (type === "track_progress_plan_item") {
      const title = stringValue(raw.target_title) || "l'action";
      const status = stringValue(raw.progress_status) || "completed";
      return [{
        effect_type: "track_progress_plan_item" as const,
        user_confirmation_fact:
          `Le progres sur "${title}" a ete enregistre avec le statut ${status}.`,
        structured_fact: { ...raw },
      }];
    }
    if (type === "create_one_shot_reminder") {
      const instruction = stringValue(raw.reminder_instruction) ||
        stringValue(raw.instruction) || "ce rappel";
      const localLabel = stringValue(raw.local_label);
      return [{
        effect_type: "create_one_shot_reminder" as const,
        user_confirmation_fact: localLabel
          ? `Le rappel ponctuel "${instruction}" a ete cree pour ${localLabel}.`
          : `Le rappel ponctuel "${instruction}" a ete cree.`,
        structured_fact: {
          one_shot_reminder: {
            committed: true,
            local_label: localLabel || null,
            reminder_instruction: instruction || null,
          },
        },
      }];
    }
    return [];
  });
}
