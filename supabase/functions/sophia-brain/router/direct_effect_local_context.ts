import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

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
): T & {
  active_action_candidates_for_direct_effects: ActiveActionCandidateForDirectEffects[];
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
    direct_effect_tools: [
      "create_one_shot_reminder",
      "track_progress_plan_item",
    ],
    direct_effect_tool_policy: {
      track_progress_plan_item:
        "Use only when the user reports already-done/current progress. target_item_id must be copied from active_action_candidates_for_direct_effects.plan_item_id. Never invent ids; ambiguity or absent target means no direct effect.",
      create_one_shot_reminder:
        "Use for one-time reminder requests only. The owner validates date, time and instruction; do not treat recurring reminders as one-shot.",
    },
  };
}

export function directEffectLocalDispatcherPromptLines(): string[] {
  return [
    "Direct effects instantanes disponibles dans tous les dispatchers locaux sauf safety:",
    "- create_one_shot_reminder: si le user demande un rappel ponctuel. Le dispatcher signale l'intention; l'owner valide date, heure, instruction et frontiere one-shot vs recurrent.",
    "- track_progress_plan_item: si le user rapporte un progres deja fait ou en cours sur une action active.",
    "- Pour track_progress_plan_item, target_item_id doit venir uniquement de platform_context.active_action_candidates_for_direct_effects[].plan_item_id ou du contexte direct equivalent. Ne jamais inventer un id.",
    "- Si plusieurs actions peuvent correspondre, si l'action est absente des candidates, si le user parle d'une intention future, ou si le statut n'est pas clair, ne cree pas de direct effect durable; demande/route une clarification.",
    "- Si un direct effect est repere pendant un flow local, rends la main au dispatcher global ou handoff au direct effect cible avec note_information structuree; ne confirme jamais un effet avant le commit runtime.",
  ];
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
      const scheduledFor = stringValue(raw.scheduled_for);
      return [{
        effect_type: "create_one_shot_reminder" as const,
        user_confirmation_fact: scheduledFor
          ? `Le rappel ponctuel "${instruction}" a ete cree pour ${scheduledFor}.`
          : `Le rappel ponctuel "${instruction}" a ete cree.`,
        structured_fact: { ...raw },
      }];
    }
    return [];
  });
}
