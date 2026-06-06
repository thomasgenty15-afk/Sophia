import type {
  AttackCardPlatformFieldId,
  AttackCardPlatformFieldProgress,
  AttackCardPlatformFieldState,
  AttackCardTechniqueKey,
} from "./contract.ts";

export type AttackCardPlatformAnswerKind =
  | "free_text"
  | "tone_choice"
  | "place_or_object"
  | "state_phrase";

export type AttackCardPlatformFieldDefinition = {
  field_id: AttackCardPlatformFieldId;
  technique_key: AttackCardTechniqueKey;
  question: string;
  required: true;
  answer_kind: AttackCardPlatformAnswerKind;
};

const FIELD_DEFINITIONS: Record<
  AttackCardTechniqueKey,
  AttackCardPlatformFieldDefinition[]
> = {
  texte_recadrage: [
    {
      field_id: "negotiated_action",
      technique_key: "texte_recadrage",
      question:
        "Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "recurring_excuse",
      technique_key: "texte_recadrage",
      question:
        "Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "desired_reframe_state",
      technique_key: "texte_recadrage",
      question: "Dans quel etat tu veux te remettre en ecrivant ce texte ?",
      required: true,
      answer_kind: "state_phrase",
    },
  ],
  mantra_force: [
    {
      field_id: "effort_target",
      technique_key: "mantra_force",
      question:
        "Par rapport a quelle action ou quel effort tu veux devenir plus solide ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "importance_reason",
      technique_key: "mantra_force",
      question:
        "Pourquoi c'est important pour toi d'arreter de reculer la-dessus ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "mantra_tone",
      technique_key: "mantra_force",
      question: "Tu veux un mantra plutot calme, noble ou percutant ?",
      required: true,
      answer_kind: "tone_choice",
    },
  ],
  ancre_visuelle: [
    {
      field_id: "commitment_to_keep_alive",
      technique_key: "ancre_visuelle",
      question: "Quel engagement envers toi-meme tu veux garder vivant ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "anchor_location",
      technique_key: "ancre_visuelle",
      question:
        "Dans quel lieu ou sur quel objet tu pourrais l'accrocher a ton quotidien ?",
      required: true,
      answer_kind: "place_or_object",
    },
    {
      field_id: "visual_phrase",
      technique_key: "ancre_visuelle",
      question: "Quelle phrase courte devrait revenir quand tu le vois ?",
      required: true,
      answer_kind: "state_phrase",
    },
  ],
  visualisation_matinale: [
    {
      field_id: "visualized_action",
      technique_key: "visualisation_matinale",
      question:
        "Quelle action ou habitude tu veux te voir faire naturellement ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "morning_window",
      technique_key: "visualisation_matinale",
      question:
        "A quel moment du matin pourrais-tu prendre 5 minutes pour te projeter calmement ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "helpful_sensations",
      technique_key: "visualisation_matinale",
      question:
        "Quelles sensations ou images t'aideraient a te voir deja en train de faire l'action ?",
      required: true,
      answer_kind: "state_phrase",
    },
  ],
  preparer_terrain: [
    {
      field_id: "action_to_simplify",
      technique_key: "preparer_terrain",
      question:
        "Par rapport a quelle action tu veux te rendre la vie plus simple ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "prep_in_advance",
      technique_key: "preparer_terrain",
      question:
        "Qu'est-ce que tu pourrais preparer en avance pour enlever de la friction ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "ready_environment",
      technique_key: "preparer_terrain",
      question:
        "Quand le moment arrive, qu'est-ce qui devrait deja etre pret autour de toi ?",
      required: true,
      answer_kind: "free_text",
    },
  ],
  pre_engagement: [
    {
      field_id: "risk_situation",
      technique_key: "pre_engagement",
      question:
        "Dans quelle situation precise tu sens que tu vas craquer ou perdre le controle ?",
      required: true,
      answer_kind: "free_text",
    },
    {
      field_id: "protected_value",
      technique_key: "pre_engagement",
      question:
        "Quand tu tiens bon dans ce moment-la, qu'est-ce que tu proteges de vraiment important chez toi ?",
      required: true,
      answer_kind: "free_text",
    },
  ],
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function fieldStatus(
  value: unknown,
): AttackCardPlatformFieldProgress["status"] {
  const raw = String(value ?? "").trim();
  return raw === "locked" || raw === "proposed" ? raw : "missing";
}

function definitionById(
  techniqueKey: AttackCardTechniqueKey,
  fieldId: AttackCardPlatformFieldId,
): AttackCardPlatformFieldDefinition | null {
  return FIELD_DEFINITIONS[techniqueKey].find((field) =>
    field.field_id === fieldId
  ) ?? null;
}

function fieldFromDefinition(
  definition: AttackCardPlatformFieldDefinition,
): AttackCardPlatformFieldProgress {
  return {
    field_id: definition.field_id,
    technique_key: definition.technique_key,
    question: definition.question,
    required: true,
    status: "missing",
    proposed_value: null,
    locked_value: null,
    user_evidence: [],
    needs_user_confirmation: false,
    evidence: [],
  };
}

function normalizeFieldProgress(
  value: unknown,
  techniqueKey: AttackCardTechniqueKey,
): AttackCardPlatformFieldProgress | null {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!root) return null;
  const fieldId = String(root.field_id ?? "")
    .trim() as AttackCardPlatformFieldId;
  const definition = definitionById(techniqueKey, fieldId);
  if (!definition) return null;
  const lockedValue = String(root.locked_value ?? root.value ?? "").trim();
  const proposedValue = String(root.proposed_value ?? "").trim();
  const userEvidence = stringArray(root.user_evidence);
  const evidence = stringArray(root.evidence);
  let status = fieldStatus(root.status);
  if (status === "locked" && (!lockedValue || userEvidence.length === 0)) {
    status = proposedValue || lockedValue ? "proposed" : "missing";
  }
  if (status === "proposed" && !proposedValue && lockedValue) {
    return {
      ...fieldFromDefinition(definition),
      status: "proposed",
      proposed_value: lockedValue,
      user_evidence: userEvidence,
      needs_user_confirmation: true,
      evidence,
    };
  }
  return {
    ...fieldFromDefinition(definition),
    status,
    proposed_value: proposedValue || null,
    locked_value: status === "locked" ? lockedValue || null : null,
    user_evidence: userEvidence,
    needs_user_confirmation: status === "proposed" ||
      Boolean(root.needs_user_confirmation),
    evidence,
  };
}

export function getAttackCardPlatformFieldDefinitions(
  techniqueKey: AttackCardTechniqueKey,
): AttackCardPlatformFieldDefinition[] {
  return FIELD_DEFINITIONS[techniqueKey].map((field) => ({ ...field }));
}

export function normalizeAttackCardPlatformFieldState(
  value: unknown,
  techniqueKey: AttackCardTechniqueKey,
): AttackCardPlatformFieldState {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const fieldsById = new Map<
    AttackCardPlatformFieldId,
    AttackCardPlatformFieldProgress
  >();
  for (
    const definition of getAttackCardPlatformFieldDefinitions(techniqueKey)
  ) {
    fieldsById.set(definition.field_id, fieldFromDefinition(definition));
  }
  for (const field of Array.isArray(root?.fields) ? root!.fields : []) {
    const normalized = normalizeFieldProgress(field, techniqueKey);
    if (normalized) fieldsById.set(normalized.field_id, normalized);
  }
  return finalizeAttackCardPlatformFieldState({
    technique_key: techniqueKey,
    status: "missing",
    fields: [...fieldsById.values()],
    missing_field_ids: [],
  });
}

function normalizeAttackCardPlatformFieldPatch(
  value: unknown,
  techniqueKey: AttackCardTechniqueKey,
): AttackCardPlatformFieldProgress[] {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const rawFields = Array.isArray(root?.fields) ? root!.fields : [];
  return rawFields.flatMap((field) => {
    const normalized = normalizeFieldProgress(field, techniqueKey);
    return normalized ? [normalized] : [];
  });
}

export function finalizeAttackCardPlatformFieldState(
  state: AttackCardPlatformFieldState,
): AttackCardPlatformFieldState {
  const definitions = getAttackCardPlatformFieldDefinitions(
    state.technique_key,
  );
  const byId = new Map(
    state.fields.map((field) => [field.field_id, field]),
  );
  const fields = definitions.map((definition) => {
    const existing = byId.get(definition.field_id);
    return existing
      ? {
        ...fieldFromDefinition(definition),
        ...existing,
        technique_key: state.technique_key,
        question: definition.question,
        required: true as const,
      }
      : fieldFromDefinition(definition);
  });
  const missing = fields
    .filter((field) =>
      field.required &&
      (field.status !== "locked" || !String(field.locked_value ?? "").trim())
    )
    .map((field) => field.field_id);
  return {
    technique_key: state.technique_key,
    fields,
    missing_field_ids: missing,
    status: missing.length === 0
      ? "complete"
      : fields.some((field) =>
          field.status === "locked" && String(field.locked_value ?? "").trim()
        )
      ? "partial"
      : "missing",
  };
}

export function mergeAttackCardPlatformFieldPatch(
  previous: AttackCardPlatformFieldState | null | undefined,
  patch: unknown,
  techniqueKey: AttackCardTechniqueKey,
): AttackCardPlatformFieldState {
  const base = previous?.technique_key === techniqueKey
    ? finalizeAttackCardPlatformFieldState(previous)
    : normalizeAttackCardPlatformFieldState(null, techniqueKey);
  const incoming = normalizeAttackCardPlatformFieldPatch(patch, techniqueKey);
  const byId = new Map(base.fields.map((field) => [field.field_id, field]));
  for (const field of incoming) {
    const current = byId.get(field.field_id);
    const hasIncomingUserEvidence = field.user_evidence.length > 0 ||
      field.evidence.some((entry) => /correction|validation|user/i.test(entry));
    const hasIncomingValue = Boolean(
      String(field.locked_value ?? field.proposed_value ?? "").trim(),
    );
    if (!current) {
      byId.set(field.field_id, field);
      continue;
    }
    if (current.status === "locked" && !hasIncomingUserEvidence) continue;
    if (!hasIncomingValue && current.status !== "missing") continue;
    byId.set(field.field_id, {
      ...current,
      ...field,
      question: current.question,
      technique_key: techniqueKey,
      required: true,
    });
  }
  return finalizeAttackCardPlatformFieldState({
    technique_key: techniqueKey,
    status: "missing",
    fields: [...byId.values()],
    missing_field_ids: [],
  });
}

export function attackCardPlatformInputsFromFields(
  state: AttackCardPlatformFieldState | null | undefined,
) {
  if (!state) return [];
  return finalizeAttackCardPlatformFieldState(state).fields
    .filter((field) =>
      field.status === "locked" && String(field.locked_value ?? "").trim()
    )
    .map((field) => ({
      field_id: field.field_id,
      question: field.question,
      suggested_answer: String(field.locked_value ?? "").trim(),
      value: String(field.locked_value ?? "").trim(),
      status: "locked" as const,
    }));
}
