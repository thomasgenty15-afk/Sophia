import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { PlanAdjustmentDraftV1 } from "../tools/operations/adjust_plan_item/contract.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";

export function normalizePlanTargetText(text: unknown): string {
  const input = String(text ?? "").toLowerCase();
  let out = "";
  let previousSpace = true;
  for (const char of input) {
    const isAsciiLetter = char >= "a" && char <= "z";
    const isDigit = char >= "0" && char <= "9";
    if (isAsciiLetter || isDigit) {
      out += char;
      previousSpace = false;
    } else if (!previousSpace) {
      out += " ";
      previousSpace = true;
    }
  }
  return out.trim();
}

export function resolvePlanItemTargetFromText(
  text: unknown,
  planItems?: V2PlanItemSnapshotItem[] | null,
): V2PlanItemSnapshotItem | null {
  void text;
  void planItems;
  return null;
}

export function resolvePlanItemTargetFromToolSkillIntent(
  turnFrame: TurnFrame | null,
  operationType: string,
  planItems?: V2PlanItemSnapshotItem[] | null,
): V2PlanItemSnapshotItem | null {
  if (!turnFrame || !Array.isArray(planItems)) return null;
  const intents = (turnFrame.tool_skill_intents ?? []).filter((intent) =>
    intent.operation_type === operationType && intent.confidence_band !== "low"
  );
  for (const intent of intents) {
    const rawId = String((intent as any).target_item_id ?? "").trim();
    if (rawId) {
      const byId = planItems.find((item) => item.id === rawId);
      if (byId) return byId;
    }
    const hint = String(intent.target_hint ?? "").trim();
    const byHint = resolvePlanItemTargetFromText(hint, planItems);
    if (byHint) return byHint;
  }
  return null;
}

export function readLastResolvedPlanItem(
  tempMemory: any,
): Record<string, unknown> | null {
  const raw = (tempMemory as any)?.__last_resolved_plan_item;
  if (!raw || typeof raw !== "object") return null;
  if (!String((raw as any).id ?? "").trim()) return null;
  if (!String((raw as any).title ?? "").trim()) return null;
  return raw as Record<string, unknown>;
}

export function writeLastResolvedPlanItem(
  tempMemory: any,
  item: V2PlanItemSnapshotItem,
  source: string,
): any {
  return {
    ...(tempMemory ?? {}),
    __last_resolved_plan_item: {
      id: item.id,
      title: item.title,
      kind: item.item_type,
      dimension: item.dimension,
      status: item.status,
      available_this_week: item.available_this_week ?? false,
      availability_status: item.availability_status ?? null,
      item_nature: item.item_nature ?? null,
      cadence_label: item.cadence_label ?? null,
      target_reps: item.target_reps ?? null,
      week_scope: item.week_scope ?? null,
      source,
      updated_at: new Date().toISOString(),
    },
  };
}

export function operationInputFromLastPlanItem(
  tempMemory: any,
): Record<string, unknown> | null {
  const item = readLastResolvedPlanItem(tempMemory);
  if (!item) return null;
  return {
    target: {
      kind: "plan_item",
      plan_item_id: item.id,
      title: item.title,
    },
    scope: {
      kind: "specific_plan_item",
      plan_item_id: item.id,
      title: item.title,
      current_summary: item.title,
    },
  };
}

export function planItemTitleFromOperationInput(
  operationInput?: Record<string, unknown> | null,
): string | null {
  if (!operationInput || typeof operationInput !== "object") return null;
  const scope = (operationInput as any).scope;
  const target = (operationInput as any).target;
  const title = String(
    scope?.title ??
      scope?.current_summary ??
      target?.title ??
      (operationInput as any).title ??
      "",
  ).trim();
  return title || null;
}

export function planItemTitleFromAdjustmentDraft(
  draft?: PlanAdjustmentDraftV1 | null,
  operationInput?: Record<string, unknown> | null,
): string | null {
  const fromInput = planItemTitleFromOperationInput(operationInput);
  if (fromInput) return fromInput;
  const scopeLabel = String((draft as any)?.draft?.scope_label ?? "").trim();
  if (scopeLabel) return scopeLabel;
  const rawTitle = String((draft as any)?.draft?.title ?? "").trim();
  const lower = rawTitle.toLowerCase();
  if (lower.startsWith("ajustement -")) {
    return rawTitle.slice("ajustement -".length).trim() || null;
  }
  return rawTitle || null;
}

export function compactListText(values: unknown, fallback: string): string {
  const list = Array.isArray(values)
    ? values.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  if (list.length === 0) return fallback;
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join("; ")}; ${list[list.length - 1]}`;
}

export function defaultPlanItemForAdjustment(
  planItems?: V2PlanItemSnapshotItem[] | null,
): V2PlanItemSnapshotItem | null {
  if (!Array.isArray(planItems) || planItems.length === 0) return null;
  const generatedPlanItems = planItems.filter((item) =>
    item.source_kind !== "operation_bridge"
  );
  return generatedPlanItems.find((item) => item.available_this_week === true) ??
    planItems.find((item) => item.available_this_week === true) ??
    generatedPlanItems.find((item) => item.status === "active") ??
    planItems.find((item) => item.status === "active") ??
    generatedPlanItems[0] ?? planItems[0] ?? null;
}

function formatPlanSnapshotLine(item: V2PlanItemSnapshotItem): string {
  const parts = [
    item.dimension,
    item.item_type,
    item.item_nature,
    `status=${item.status}`,
  ];
  if (item.week_scope?.weekly_cadence_label) {
    parts.push(`cadence_cette_semaine=${item.week_scope.weekly_cadence_label}`);
  } else if (typeof item.week_scope?.weekly_reps === "number") {
    parts.push(`reps_cette_semaine=${item.week_scope.weekly_reps}`);
  }
  if (item.cadence_label) {
    parts.push(`cadence_base_item=${item.cadence_label}`);
  }
  if (typeof item.target_reps === "number") {
    parts.push(`target_reps_global=${item.target_reps}`);
  }
  if (item.week_scope?.week_order) {
    parts.push(`week_order=${item.week_scope.week_order}`);
  }
  if (item.week_scope?.week_status) {
    const weekStatus = item.week_scope.week_status === "completed"
      ? "calendar_week_past"
      : item.week_scope.week_status;
    parts.push(`week_status=${weekStatus}`);
  }
  return `- ${item.title} (${parts.filter(Boolean).join("; ")})`;
}

function formatCurrentWeekSummaryItem(item: V2PlanItemSnapshotItem): string {
  const weekly = item.week_scope?.weekly_cadence_label ??
    (typeof item.week_scope?.weekly_reps === "number"
      ? `${item.week_scope.weekly_reps} reps cette semaine`
      : null);
  return weekly ? `${item.title} [${weekly}]` : item.title;
}

function isAlwaysVisiblePlanItem(item: V2PlanItemSnapshotItem): boolean {
  return item.available_this_week === true ||
    item.status === "active" ||
    item.status === "in_maintenance" ||
    item.status === "stalled";
}

function rankAlwaysVisiblePlanItem(item: V2PlanItemSnapshotItem): number {
  if (item.available_this_week === true && item.status === "active") return 5;
  if (item.available_this_week === true) return 4;
  if (item.status === "active") return 3;
  if (item.status === "in_maintenance") return 2;
  if (item.status === "stalled") return 1;
  return 0;
}

function buildShortActivePlanSnapshotAddon(
  items: V2PlanItemSnapshotItem[],
): string | null {
  const visibleItems = items
    .filter(isAlwaysVisiblePlanItem)
    .sort((left, right) =>
      rankAlwaysVisiblePlanItem(right) - rankAlwaysVisiblePlanItem(left)
    )
    .slice(0, 8);
  if (visibleItems.length === 0) return null;
  return [
    "=== SNAPSHOT COURT PLAN / ACTIONS ACTIVES (TOUJOURS DISPONIBLE) ===",
    "Le backend te donne un court snapshot du plan actif. Ne dis pas que tu ne peux pas voir le plan si une action pertinente est listee ici.",
    "Utilise ce snapshot seulement si le user parle de son plan, de ses actions, de ce qu'il doit faire, ou si une action listee est directement pertinente. Ne force pas le sujet plan dans les autres reponses.",
    "Si le user demande le detail complet de la semaine, appuie-toi sur le contexte operationnel detaille quand il est present; sinon reste prudent et cite uniquement les items listes ici.",
    "Actions actives/disponibles:",
    ...visibleItems.map(formatPlanSnapshotLine),
  ].join("\n");
}

export function buildActivePlanSnapshotAddon(args: {
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
  routeDecision?: RouteDecision | null;
  userMessage: string;
}): string | null {
  const items = (args.planItemSnapshot ?? []).filter((item) =>
    item.source_kind !== "operation_bridge"
  );
  if (items.length === 0) return null;
  const shortSnapshot = buildShortActivePlanSnapshotAddon(items);
  const routeSuggestsPlanContext = [
    args.routeDecision?.response_owner,
    args.routeDecision?.selected_handler,
  ].some((value) =>
    value === "adjust_plan_item" || value === "track_progress_plan_item"
  );
  if (!routeSuggestsPlanContext) {
    void args.userMessage;
    return shortSnapshot;
  }

  const currentWeek = items.filter((item) => item.available_this_week === true);
  const pastWeek = items.filter((item) =>
    item.availability_status === "available_past_week"
  );
  const upcomingWeek = items.filter((item) =>
    item.availability_status === "available_upcoming_week"
  );
  const unassigned = items.filter((item) =>
    item.availability_status === "not_assigned_to_level_weeks" ||
    item.availability_status === "assigned_no_calendar"
  );

  const lines = [
    "=== CONTEXTE OPERATIONNEL PLAN ACTIF (A UTILISER POUR REPONDRE) ===",
    "Le backend te donne le plan actif: ne dis pas que tu ne peux pas le voir.",
    "Tu peux affirmer qu'un item est dans le plan si cette section le liste.",
    "Tu peux affirmer qu'un item est a faire cette semaine si cette section le liste dans 'Disponibles cette semaine', meme si son status runtime est pending.",
    "Si le user demande quoi faire cette semaine, cite uniquement les items du resume 'Cette semaine uniquement'. Ne cite pas les items passes ou a venir comme s'ils etaient de cette semaine.",
    "Quand tu reponds a 'quoi faire cette semaine', inclus toutes les categories disponibles cette semaine: habitudes recurrentes, missions ponctuelles et clarifications. Ne reduis pas la reponse aux seules missions ou clarifications.",
    "Quand un item disponible cette semaine a cadence_cette_semaine/reps_cette_semaine, cette cadence hebdomadaire prime sur cadence_base_item et target_reps_global.",
    "available_past_week ou week_status=calendar_week_past signifie seulement que la semaine calendrier est passee. Cela ne signifie PAS que l'item est complete. Ne dis qu'une action est completee si status=completed.",
    "Important: status=active/pending est un etat runtime en base, pas la disponibilite de la semaine. Pour repondre a 'cette semaine', utilise available_this_week et week_scope.",
    "Nature des items: recurring_habit = habitude repetee; one_shot_mission = mission ponctuelle; clarification = exercice/clarification.",
  ];
  if (currentWeek.length > 0) {
    lines.push(
      `Cette semaine uniquement: ${
        currentWeek.map(formatCurrentWeekSummaryItem).join(" ; ")
      }`,
    );
    lines.push("Disponibles cette semaine:");
    lines.push(...currentWeek.slice(0, 8).map(formatPlanSnapshotLine));
  }
  if (pastWeek.length > 0) {
    lines.push(
      `A ne pas presenter comme cette semaine car deja passe: ${
        pastWeek.map((item) => item.title).slice(0, 6).join(" ; ")
      }`,
    );
    lines.push("Deja assignes a une semaine passee du niveau:");
    lines.push(...pastWeek.slice(0, 6).map(formatPlanSnapshotLine));
  }
  if (upcomingWeek.length > 0) {
    lines.push(
      `A ne pas presenter comme cette semaine car a venir: ${
        upcomingWeek.map((item) => item.title).slice(0, 6).join(" ; ")
      }`,
    );
    lines.push("Assignes a une semaine a venir du niveau:");
    lines.push(...upcomingWeek.slice(0, 6).map(formatPlanSnapshotLine));
  }
  if (unassigned.length > 0) {
    lines.push("Autres items du plan sans semaine courante identifiable:");
    lines.push(...unassigned.slice(0, 4).map(formatPlanSnapshotLine));
  }
  lines.push(
    "Quand le user demande si une mission est quotidienne, verifie item_nature/cadence avant de repondre. Ne transforme pas une mission ponctuelle en habitude quotidienne.",
  );
  return [shortSnapshot, lines.join("\n")].filter(Boolean).join("\n\n");
}

export function buildResolvedPlanTargetAddon(tempMemory: any): string | null {
  const item = readLastResolvedPlanItem(tempMemory);
  if (!item) return null;
  return [
    "=== PLAN TARGET RESOLU (RUNTIME) ===",
    `Derniere action de plan identifiee: ${String(item.title)}`,
    `plan_item_id: ${String(item.id)}`,
    `dimension: ${String(item.dimension ?? "")}`,
    `kind: ${String(item.kind ?? "")}`,
    `status: ${String(item.status ?? "")}`,
    "Si le user dit cette action / celle-ci / fais-le / la presentation, reutilise cette cible sauf correction explicite.",
  ].join("\n");
}
