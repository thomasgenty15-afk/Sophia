export type EffectLedgerStatus =
  | "requested"
  | "allowed"
  | "blocked"
  | "committed"
  | "failed"
  | "proposed"
  | "delivered"
  | "cancelled"
  | "superseded"
  | "asked"
  | "resolved"
  | "topic_change";

export type EffectLedgerEntryKind =
  | "durable_effect"
  | "platform_handoff"
  | "clarification"
  | "memory"
  | "conversation";

export type EffectLedgerEntry = {
  effect_id: string;
  kind?: EffectLedgerEntryKind;
  effect_type: string;
  operation_type?: string | null;
  operation_id?: string | null;
  committed_id?: string | null;
  tool_id?: string | null;
  status: EffectLedgerStatus;
  reason_code?: string | null;
  source:
    | "dispatcher"
    | "router"
    | "bridge"
    | "recommendation_tool"
    | "tool_skill"
    | "executor"
    | "memory_runtime"
    | "guard"
    | "weekly_review"
    | "conversation_skill"
    | "status_projection";
  payload_summary?: Record<string, unknown> | null;
  db_ref?: {
    table: string;
    id?: string | null;
    key?: string | null;
  } | null;
  error_message?: string | null;
  surface_id?: string | null;
  no_chat_mutation?: true;
  committed?: false;
  executed_tool?: false;
  owner?: string | null;
  ambiguity_kind?: string | null;
  candidate_ids?: string[];
  selected_candidate_id?: string | null;
};

export type EffectLedger = {
  turn_id: string;
  entries: EffectLedgerEntry[];
};

export type PersistedEffectLedgerEntry = {
  turn_id: string;
  user_id: string;
  source_message_id: string | null;
  request_id: string | null;
  created_at: string;
  status: EffectLedgerStatus;
  kind?: EffectLedgerEntryKind;
  effect_type: string;
  operation_type: string | null;
  operation_id: string | null;
  committed_id: string | null;
  tool_id: string | null;
  source: EffectLedgerEntry["source"];
  reason_code: string | null;
  payload_summary: Record<string, unknown>;
  db_ref: {
    table?: string | null;
    id?: string | null;
    key?: string | null;
  } | null;
  error_message?: string | null;
  surface_id?: string | null;
  no_chat_mutation?: true;
  committed?: false;
  executed_tool?: false;
  owner?: string | null;
  ambiguity_kind?: string | null;
  candidate_ids?: string[];
  selected_candidate_id?: string | null;
};

export function createEffectLedger(turnId: string): EffectLedger {
  return {
    turn_id: String(turnId ?? "").trim() || "unknown_turn",
    entries: [],
  };
}

function compactPayloadSummary(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload).slice(0, 20)) {
    if (typeof value === "undefined") {
      continue;
    } else if (typeof value === "string") {
      output[key] = value.length > 180 ? `${value.slice(0, 177)}...` : value;
    } else if (
      value === null || typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key] = value;
    } else if (Array.isArray(value)) {
      output[key] = value.slice(0, 10).map((item) =>
        typeof item === "string" && item.length > 120
          ? `${item.slice(0, 117)}...`
          : item
      );
    } else {
      output[key] = "[object]";
    }
  }
  return output;
}

const PERSISTENCE_PAYLOAD_DENY_KEYS = new Set([
  "body",
  "content",
  "conversation",
  "draft",
  "emotional_content",
  "full_draft",
  "history",
  "message",
  "messages",
  "operation_draft",
  "raw_text",
  "text",
  "transcript",
  "user_message",
]);

function compactPayloadSummaryForPersistence(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const compact = compactPayloadSummary(payload);
  if (!compact) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(compact)) {
    const normalizedKey = key.toLowerCase();
    if (PERSISTENCE_PAYLOAD_DENY_KEYS.has(normalizedKey)) continue;
    if (typeof value === "undefined") continue;
    if (typeof value === "string") {
      output[key] = value.length > 160 ? `${value.slice(0, 157)}...` : value;
    } else if (Array.isArray(value)) {
      output[key] = value.slice(0, 6).map((item) =>
        typeof item === "string" && item.length > 100
          ? `${item.slice(0, 97)}...`
          : item
      );
    } else {
      output[key] = value;
    }
    if (Object.keys(output).length >= 12) break;
  }
  return output;
}

function compactErrorMessage(error: string | null | undefined): string | null {
  const text = String(error ?? "").trim();
  return text ? text.slice(0, 240) : null;
}

/**
 * Cross-turn model of truth:
 * - business DB tables remain the current-state truth;
 * - persisted EffectLedger entries are an observed execution timeline;
 * - conversation logs remain the conversational truth.
 *
 * A committed ledger entry means Sophia observed/authorized a commit in that
 * turn. It must not be used alone to claim the object still exists now.
 *
 * Memory writes are still mostly queued by memory_runtime/memorizer_bridge.ts.
 * The ledger type can carry memory_runtime proof, but the full memory write
 * integration is intentionally left outside this architecture-boundary pass.
 */
export function serializeEffectLedgerForPersistence(args: {
  ledger: EffectLedger;
  userId: string;
  sourceMessageId?: string | null;
  requestId?: string | null;
  nowIso?: string | null;
}): PersistedEffectLedgerEntry[] {
  const createdAt = String(args.nowIso ?? "").trim() ||
    new Date().toISOString();
  const userId = String(args.userId ?? "").trim();
  const sourceMessageId = String(args.sourceMessageId ?? "").trim() || null;
  const requestId = String(args.requestId ?? "").trim() || null;
  return args.ledger.entries.map((entry) => ({
    turn_id: args.ledger.turn_id,
    user_id: userId,
    source_message_id: sourceMessageId,
    request_id: requestId,
    created_at: createdAt,
    status: entry.status,
    kind: entry.kind ?? "durable_effect",
    effect_type: String(entry.effect_type ?? "").trim() || "unknown_effect",
    operation_type: String(entry.operation_type ?? "").trim() || null,
    operation_id: String(entry.operation_id ?? "").trim() || null,
    committed_id: String(entry.committed_id ?? "").trim() || null,
    tool_id: String(entry.tool_id ?? "").trim() || null,
    source: entry.source,
    reason_code: String(entry.reason_code ?? "").trim() || null,
    payload_summary: compactPayloadSummaryForPersistence(
      entry.payload_summary,
    ),
    db_ref: entry.db_ref
      ? {
        table: entry.db_ref.table ?? null,
        id: entry.db_ref.id ?? null,
        key: entry.db_ref.key ?? null,
      }
      : null,
    error_message: compactErrorMessage(entry.error_message),
    surface_id: String(entry.surface_id ?? "").trim() || null,
    no_chat_mutation: entry.no_chat_mutation === true ? true : undefined,
    committed: entry.committed === false ? false : undefined,
    executed_tool: entry.executed_tool === false ? false : undefined,
    owner: String(entry.owner ?? "").trim() || null,
    ambiguity_kind: String(entry.ambiguity_kind ?? "").trim() || null,
    candidate_ids: Array.isArray(entry.candidate_ids)
      ? entry.candidate_ids.map((item) => String(item)).filter(Boolean).slice(
        0,
        20,
      )
      : undefined,
    selected_candidate_id: String(entry.selected_candidate_id ?? "").trim() ||
      null,
  }));
}

function recordEffect(
  ledger: EffectLedger,
  status: EffectLedgerStatus,
  entry: Omit<EffectLedgerEntry, "status">,
): EffectLedgerEntry {
  const stored: EffectLedgerEntry = {
    ...entry,
    effect_id: String(entry.effect_id ?? "").trim() || crypto.randomUUID(),
    kind: entry.kind ?? "durable_effect",
    effect_type: String(entry.effect_type ?? "").trim(),
    operation_type: entry.operation_type ?? null,
    operation_id: entry.operation_id ?? null,
    committed_id: entry.committed_id ?? null,
    tool_id: entry.tool_id ?? null,
    status,
    reason_code: entry.reason_code ?? null,
    payload_summary: compactPayloadSummary(entry.payload_summary),
    db_ref: entry.db_ref ?? null,
    error_message: entry.error_message ?? null,
    surface_id: entry.surface_id ?? null,
    no_chat_mutation: entry.no_chat_mutation === true ? true : undefined,
    committed: entry.committed === false ? false : undefined,
    executed_tool: entry.executed_tool === false ? false : undefined,
    owner: entry.owner ?? null,
    ambiguity_kind: entry.ambiguity_kind ?? null,
    candidate_ids: Array.isArray(entry.candidate_ids)
      ? entry.candidate_ids.map((item) => String(item)).filter(Boolean).slice(
        0,
        20,
      )
      : undefined,
    selected_candidate_id: entry.selected_candidate_id ?? null,
  };
  ledger.entries.push(stored);
  return stored;
}

export function recordPlatformHandoffInLedger(
  ledger: EffectLedger,
  entry: Omit<EffectLedgerEntry, "kind" | "status" | "effect_type"> & {
    operation_type: string;
    status:
      | "requested"
      | "proposed"
      | "delivered"
      | "blocked"
      | "cancelled"
      | "superseded";
  },
): EffectLedgerEntry {
  return recordEffect(ledger, entry.status, {
    ...entry,
    kind: "platform_handoff",
    effect_type: `platform_handoff.${String(entry.operation_type).trim()}`,
    committed_id: null,
    db_ref: null,
    no_chat_mutation: true,
    committed: false,
    executed_tool: false,
  });
}

export function recordClarificationInLedger(
  ledger: EffectLedger,
  entry: Omit<EffectLedgerEntry, "kind" | "status" | "effect_type"> & {
    status:
      | "requested"
      | "asked"
      | "resolved"
      | "cancelled"
      | "topic_change";
    owner: string;
    ambiguity_kind: string;
  },
): EffectLedgerEntry {
  return recordEffect(ledger, entry.status, {
    ...entry,
    kind: "clarification",
    effect_type: `clarification.${String(entry.ambiguity_kind).trim()}`,
    operation_type: entry.operation_type ?? null,
    committed_id: null,
    db_ref: null,
    no_chat_mutation: true,
    committed: false,
    executed_tool: false,
  });
}

export function recordRequestedEffect(
  ledger: EffectLedger,
  entry: Omit<EffectLedgerEntry, "status">,
): EffectLedgerEntry {
  return recordEffect(ledger, "requested", entry);
}

export function recordAllowedEffect(
  ledger: EffectLedger,
  entry: Omit<EffectLedgerEntry, "status">,
): EffectLedgerEntry {
  return recordEffect(ledger, "allowed", entry);
}

export function recordBlockedEffect(
  ledger: EffectLedger,
  entry: Omit<EffectLedgerEntry, "status">,
): EffectLedgerEntry {
  return recordEffect(ledger, "blocked", entry);
}

export function recordCommittedEffect(
  ledger: EffectLedger,
  entry: Omit<EffectLedgerEntry, "status">,
): EffectLedgerEntry {
  return recordEffect(ledger, "committed", entry);
}

export function recordFailedEffect(
  ledger: EffectLedger,
  entry: Omit<EffectLedgerEntry, "status">,
): EffectLedgerEntry {
  return recordEffect(ledger, "failed", entry);
}

export function hasCommittedEffect(
  ledger: EffectLedger,
  predicate: (entry: EffectLedgerEntry) => boolean,
): boolean {
  return ledger.entries.some((entry) =>
    entry.status === "committed" && predicate(entry)
  );
}

export function summarizeEffectLedgerForTrace(
  ledger: EffectLedger,
): Record<string, unknown> {
  const byStatus = ledger.entries.reduce<Record<string, number>>(
    (acc, entry) => {
      acc[entry.status] = (acc[entry.status] ?? 0) + 1;
      return acc;
    },
    {
      requested: 0,
      allowed: 0,
      blocked: 0,
      committed: 0,
      failed: 0,
      proposed: 0,
      delivered: 0,
      cancelled: 0,
      superseded: 0,
      asked: 0,
      resolved: 0,
      topic_change: 0,
    },
  );
  return {
    turn_id: ledger.turn_id,
    counts: byStatus,
    entries: ledger.entries.map((entry) => ({
      effect_id: entry.effect_id,
      kind: entry.kind ?? "durable_effect",
      effect_type: entry.effect_type,
      operation_type: entry.operation_type ?? null,
      operation_id: entry.operation_id ?? null,
      committed_id: entry.committed_id ?? null,
      tool_id: entry.tool_id ?? null,
      status: entry.status,
      reason_code: entry.reason_code ?? null,
      source: entry.source,
      payload_summary: compactPayloadSummary(entry.payload_summary),
      db_ref: entry.db_ref ?? null,
      error_message: entry.error_message
        ? String(entry.error_message).slice(0, 240)
        : null,
      surface_id: entry.surface_id ?? null,
      no_chat_mutation: entry.no_chat_mutation === true ? true : undefined,
      committed: entry.committed === false ? false : undefined,
      executed_tool: entry.executed_tool === false ? false : undefined,
      owner: entry.owner ?? null,
      ambiguity_kind: entry.ambiguity_kind ?? null,
      candidate_ids: entry.candidate_ids ?? undefined,
      selected_candidate_id: entry.selected_candidate_id ?? null,
    })),
  };
}

function normalizeClaimText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function alreadyHonest(normalized: string): boolean {
  return /\b(je n ai pas|je ne l ai pas|je ne le modifie pas|je ne la modifie pas|je ne modifie pas|je ne le cree pas|je ne la cree pas|je ne le programme pas|je ne la programme pas|je n ai rien|pas encore|pas reussi|pas réussi|souci technique|je ne peux pas|je ne vais pas|si tu confirmes|besoin de ta confirmation|rien n est applique|rien n est confirme|je propose|proposition|je recommande|ma recommandation|je te conseille|tu peux le faire dans|tu peux la creer dans|tu peux le creer dans|ou le faire dans plan|dans la section plan|dans la plateforme|depuis la plateforme|depuis le chat)\b/
    .test(normalized);
}

export function rewriteUncommittedEffectClaims(args: {
  reply: string;
  ledger: EffectLedger;
}): {
  reply: string;
  changed: boolean;
  reason_codes: string[];
} {
  const reply = String(args.reply ?? "");
  const normalized = normalizeClaimText(reply);
  if (!reply.trim() || alreadyHonest(normalized)) {
    return { reply, changed: false, reason_codes: [] };
  }

  const reasonCodes: string[] = [];
  const hasCommit = (types: string[]) =>
    hasCommittedEffect(
      args.ledger,
      (entry) => types.includes(entry.effect_type),
    );
  const hasAnyCommit = hasCommittedEffect(args.ledger, () => true);
  const claimsPreference = /\b(preference|preferences)\b/.test(normalized) &&
    /\b(c est fait|enregistre|enregistree|gardee|garde|applique|appliquee|mis a jour|mise a jour)\b/
      .test(normalized);
  if (claimsPreference && !hasCommit(["coach_preferences.update"])) {
    reasonCodes.push("uncommitted_coach_preferences_update_claim");
  }

  const claimsReminderCreate =
    /\b(rappel|rappelle|reminder)\b/.test(normalized) &&
    /\b(programme|programmee|planifie|planifiee|cree|cree|prevu|c est prevu|en place)\b/
      .test(normalized);
  if (
    claimsReminderCreate &&
    !hasCommit(["one_shot_reminder.create", "recurring_reminder.create"])
  ) {
    reasonCodes.push("uncommitted_reminder_create_claim");
  }

  const claimsReminderCancel =
    /\b(rappel|rappelle|reminder)\b/.test(normalized) &&
    /\b(j ai (annule|supprime|coupe)|c est (annule|supprime|coupe)|rappel (annule|supprime|coupe))\b/
      .test(normalized);
  if (
    claimsReminderCancel && !hasCommit(["one_shot_reminder.cancel"])
  ) {
    reasonCodes.push("uncommitted_reminder_cancel_claim");
  }

  const claimsCardCreate = /\b(carte|card)\b/.test(normalized) &&
    /\b(carte (creee|cree|preparee|prepare)|je l ai (creee|cree|preparee|prepare)|c est (cree|creee|prepare|preparee))\b/
      .test(normalized);
  if (
    claimsCardCreate &&
    !hasCommit(["attack_card.create", "defense_card.create"])
  ) {
    reasonCodes.push("uncommitted_card_create_claim");
  }

  const claimsPotionActivate =
    /\b(potion|reset|protocole|clarte|apaisement|guerison|amour|courage)\b/
      .test(normalized) &&
    /\b(active|activee|lance|lancee|demarre|demarree|en place|c est parti)\b/
      .test(normalized);
  if (claimsPotionActivate && !hasCommit(["state_potion.activate"])) {
    reasonCodes.push("uncommitted_state_potion_activate_claim");
  }

  const claimsPlanAdjust =
    /\b(plan|action|mission|semaine)\b/.test(normalized) &&
    /\b(modifie|modifiee|ajuste|ajustee|allege|allegee|corrige|corrigee|reporte|reportee|applique|appliquee)\b/
      .test(normalized);
  if (claimsPlanAdjust && !hasCommit(["plan_item.adjust"])) {
    reasonCodes.push("uncommitted_plan_adjust_claim");
  }

  const claimsProgressTrack =
    /\b(progres|progression|avancee|avancement|action|mission|habitude|partiel|rate|manque)\b/
      .test(normalized) &&
    /\b(note|notee|enregistre|enregistree|coche|cochee|marque|marquee)\b/
      .test(normalized);
  if (claimsProgressTrack && !hasCommit(["plan_item_progress.track"])) {
    reasonCodes.push("uncommitted_progress_track_claim");
  }

  const claimsMemoryWrite =
    /\b(memoire|souvenir|souviens|retiens|memorise|memorisee|garde en memoire|garde en tete)\b/
      .test(normalized) &&
    /\b(enregistre|enregistree|note|notee|memorise|memorisee|je m en souviens|je retiens|je le garde|je garde ca)\b/
      .test(normalized);
  if (claimsMemoryWrite && !hasCommit(["memory.write", "memory.item.write"])) {
    reasonCodes.push("uncommitted_memory_write_claim");
  }

  const claimsGenericSuccess =
    /\b(c est fait|c est bon|ca y est|voila c est|j ai (bien )?(applique|cree|creee|enregistre|active|activee|note|memorise|mis en place)|c est (bien )?(cree|creee|applique|appliquee|enregistre|enregistree|active|activee|note|notee|memorise|memorisee))\b/
      .test(normalized);
  if (claimsGenericSuccess && !hasAnyCommit && reasonCodes.length === 0) {
    reasonCodes.push("uncommitted_generic_success_claim");
  }

  if (reasonCodes.length === 0) {
    return { reply, changed: false, reason_codes: [] };
  }
  if (reasonCodes.includes("uncommitted_coach_preferences_update_claim")) {
    return {
      reply: "Je ne l'ai pas enregistré.",
      changed: true,
      reason_codes: reasonCodes,
    };
  }
  if (reasonCodes.includes("uncommitted_card_create_claim")) {
    return {
      reply:
        "Je l'ai préparé, mais pas encore créé. Je peux le faire si tu confirmes.",
      changed: true,
      reason_codes: reasonCodes,
    };
  }
  if (reasonCodes.includes("uncommitted_state_potion_activate_claim")) {
    return {
      reply:
        "Je ne l'active pas depuis le chat. Reprends cette recommandation dans la section État / Potions.",
      changed: true,
      reason_codes: reasonCodes,
    };
  }
  if (reasonCodes.includes("uncommitted_plan_adjust_claim")) {
    return {
      reply: "Je ne l'ai pas modifié.",
      changed: true,
      reason_codes: reasonCodes,
    };
  }
  if (reasonCodes.includes("uncommitted_progress_track_claim")) {
    return {
      reply: "Je ne l'ai pas noté.",
      changed: true,
      reason_codes: reasonCodes,
    };
  }
  if (reasonCodes.includes("uncommitted_memory_write_claim")) {
    return {
      reply: "Je ne l'ai pas enregistré en mémoire.",
      changed: true,
      reason_codes: reasonCodes,
    };
  }
  if (reasonCodes.includes("uncommitted_generic_success_claim")) {
    return {
      reply: "Je ne confirme aucun changement durable sans effet confirmé.",
      changed: true,
      reason_codes: reasonCodes,
    };
  }
  return {
    reply: "Je n'ai pas réussi à le faire.",
    changed: true,
    reason_codes: reasonCodes,
  };
}
