export type DefenseCardPlatformRouteKind = "free_card" | "plan_item_card";

export type DefenseCardPlatformFieldId =
  | "support_need"
  | "entry_need"
  | "risk_moment"
  | "first_signal"
  | "defense_response"
  | "fallback_plan";

export type DefenseCardPlatformFieldDefinition = {
  field_id: DefenseCardPlatformFieldId;
  question_label: string;
  required: boolean;
  route_kinds: DefenseCardPlatformRouteKind[];
  answer_kind:
    | "situation_context_environment_pulsion"
    | "target_or_need"
    | "moment_context"
    | "signal"
    | "simple_response"
    | "fallback";
};

export type DefenseCardPlatformFieldStatus =
  | "missing"
  | "proposed"
  | "locked";

export type DefenseCardPlatformFieldProgress = {
  field_id: DefenseCardPlatformFieldId;
  question_label: string;
  required: boolean;
  status: DefenseCardPlatformFieldStatus;
  proposed_value?: string | null;
  locked_value?: string | null;
  user_evidence: string[];
  needs_user_confirmation: boolean;
  evidence: string[];
};

export type DefenseCardPlatformFieldState = {
  route_kind: DefenseCardPlatformRouteKind;
  status: "missing" | "partial" | "complete";
  fields: DefenseCardPlatformFieldProgress[];
  missing_field_ids: DefenseCardPlatformFieldId[];
};

export const DEFENSE_CARD_PLATFORM_FIELD_DEFINITIONS:
  DefenseCardPlatformFieldDefinition[] = [
    {
      field_id: "support_need",
      question_label:
        "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
      required: true,
      route_kinds: ["free_card", "plan_item_card"],
      answer_kind: "situation_context_environment_pulsion",
    },
  ];

export function getDefenseCardPlatformFieldDefinitions(
  routeKind: DefenseCardPlatformRouteKind,
): DefenseCardPlatformFieldDefinition[] {
  return DEFENSE_CARD_PLATFORM_FIELD_DEFINITIONS.filter((definition) =>
    definition.route_kinds.includes(routeKind)
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function text(value: unknown): string | null {
  const output = String(value ?? "").trim();
  return output || null;
}

function fieldId(value: unknown): DefenseCardPlatformFieldId | null {
  const raw = String(value ?? "").trim();
  return [
      "support_need",
      "entry_need",
      "risk_moment",
      "first_signal",
      "defense_response",
      "fallback_plan",
    ].includes(raw)
    ? raw as DefenseCardPlatformFieldId
    : null;
}

function fieldStatus(value: unknown): DefenseCardPlatformFieldStatus {
  const raw = String(value ?? "").trim();
  return raw === "locked" || raw === "proposed" ? raw : "missing";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function computeMissingFieldIds(
  fields: DefenseCardPlatformFieldProgress[],
): DefenseCardPlatformFieldId[] {
  return fields
    .filter((field) => field.required && field.status !== "locked")
    .map((field) => field.field_id);
}

function computeStateStatus(
  fields: DefenseCardPlatformFieldProgress[],
): DefenseCardPlatformFieldState["status"] {
  const missing = computeMissingFieldIds(fields);
  if (missing.length === 0) return "complete";
  return fields.some((field) => field.status !== "missing")
    ? "partial"
    : "missing";
}

export function createDefenseCardPlatformFieldState(
  routeKind: DefenseCardPlatformRouteKind,
): DefenseCardPlatformFieldState {
  const fields = getDefenseCardPlatformFieldDefinitions(routeKind).map((
    definition,
  ) => ({
    field_id: definition.field_id,
    question_label: definition.question_label,
    required: definition.required,
    status: "missing" as const,
    proposed_value: null,
    locked_value: null,
    user_evidence: [],
    needs_user_confirmation: definition.required,
    evidence: [],
  }));
  return {
    route_kind: routeKind,
    status: "missing",
    fields,
    missing_field_ids: computeMissingFieldIds(fields),
  };
}

export function normalizeDefenseCardPlatformFieldState(
  value: unknown,
  routeKind: DefenseCardPlatformRouteKind,
): DefenseCardPlatformFieldState | null {
  const root = objectValue(value);
  if (!root) return null;
  const definitions = getDefenseCardPlatformFieldDefinitions(routeKind);
  const byDefinition = new Map(definitions.map((definition) => [
    definition.field_id,
    definition,
  ]));
  const rawFields = Array.isArray(root.fields) ? root.fields : [];
  const normalizedById = new Map<
    DefenseCardPlatformFieldId,
    DefenseCardPlatformFieldProgress
  >();
  for (const rawField of rawFields) {
    const record = objectValue(rawField);
    const id = fieldId(record?.field_id);
    if (!record || !id || !byDefinition.has(id)) continue;
    const definition = byDefinition.get(id)!;
    const status = fieldStatus(record.status);
    const lockedValue = text(record.locked_value);
    const proposedValue = text(record.proposed_value);
    normalizedById.set(id, {
      field_id: id,
      question_label: text(record.question_label) ?? definition.question_label,
      required: definition.required,
      status: status === "locked" && lockedValue
        ? "locked"
        : status === "proposed" && proposedValue
        ? "proposed"
        : "missing",
      locked_value: lockedValue,
      proposed_value: proposedValue,
      user_evidence: stringArray(record.user_evidence),
      needs_user_confirmation: Boolean(record.needs_user_confirmation),
      evidence: stringArray(record.evidence),
    });
  }
  const fields = definitions.map((definition) =>
    normalizedById.get(definition.field_id) ?? {
      field_id: definition.field_id,
      question_label: definition.question_label,
      required: definition.required,
      status: "missing" as const,
      proposed_value: null,
      locked_value: null,
      user_evidence: [],
      needs_user_confirmation: definition.required,
      evidence: [],
    }
  );
  return {
    route_kind: routeKind,
    status: computeStateStatus(fields),
    fields,
    missing_field_ids: computeMissingFieldIds(fields),
  };
}

export function mergeDefenseCardPlatformFieldState(
  base: DefenseCardPlatformFieldState,
  patch: DefenseCardPlatformFieldState | null,
): DefenseCardPlatformFieldState {
  if (!patch) return base;
  const patchById = new Map(patch.fields.map((field) => [
    field.field_id,
    field,
  ]));
  const fields = base.fields.map((current) => {
    const incoming = patchById.get(current.field_id);
    if (!incoming) return current;
    if (incoming.status === "locked" && incoming.locked_value) {
      return {
        ...current,
        status: "locked" as const,
        locked_value: incoming.locked_value,
        proposed_value: null,
        user_evidence: incoming.user_evidence,
        needs_user_confirmation: false,
        evidence: incoming.evidence,
      };
    }
    if (current.status === "locked") return current;
    if (incoming.status === "proposed" && incoming.proposed_value) {
      return {
        ...current,
        status: "proposed" as const,
        proposed_value: incoming.proposed_value,
        locked_value: null,
        user_evidence: incoming.user_evidence,
        needs_user_confirmation: true,
        evidence: incoming.evidence,
      };
    }
    return current;
  });
  return {
    route_kind: base.route_kind,
    status: computeStateStatus(fields),
    fields,
    missing_field_ids: computeMissingFieldIds(fields),
  };
}

export function getDefenseCardPlatformField(
  state: DefenseCardPlatformFieldState | null | undefined,
  fieldId: DefenseCardPlatformFieldId,
): DefenseCardPlatformFieldProgress | null {
  return state?.fields.find((field) => field.field_id === fieldId) ?? null;
}
