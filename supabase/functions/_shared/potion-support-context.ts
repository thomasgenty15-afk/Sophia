import type { PotionBaseContext } from "./potion-base-context.ts";
import type { PotionRecentContext } from "./potion-recent-context.ts";
import type { PotionActivationContent, PotionType } from "./v2-types.ts";

export const POTION_SUPPORT_CONTEXT_VERSION = 1 as const;
export const POTION_SUPPORT_SOURCE = "potion_support_opening_v1";

export type PotionSupportEvidenceSourceType =
  | "potion_answer"
  | "potion_free_text"
  | "transformation"
  | "plan_item"
  | "prior_potion"
  | "chat_message";

export type PotionSupportEvidenceRef = {
  source_type: PotionSupportEvidenceSourceType;
  source_id: string;
  source_field: string | null;
};

export type PotionSupportEvidence = {
  evidence_id: string;
  text: string;
  source: PotionSupportEvidenceRef;
  observed_at: string | null;
};

export type PotionSupportGroundedItem = {
  text: string;
  evidence_refs: PotionSupportEvidenceRef[];
  last_observed_at: string | null;
};

export type PotionSupportLedger = {
  grounded_facts: PotionSupportGroundedItem[];
  open_threads: PotionSupportGroundedItem[];
  user_boundaries: PotionSupportGroundedItem[];
  /** Advisory only: never eligible for verbatim surfacing. */
  advisory_summary: string | null;
};

export type PotionSupportMessageCursor = {
  created_at: string;
  ids_at_boundary: string[];
};

export type PotionSupportOpeningHistoryItem = {
  day_index: number;
  scheduled_checkin_id: string;
  sent_at: string | null;
  opening_text: string | null;
  anchor_evidence_refs: PotionSupportEvidenceRef[];
  question_evidence_refs: PotionSupportEvidenceRef[];
  outcome: "sent" | "template_waiting" | "skipped" | "failed";
};

export type PotionSupportContextV1 = {
  version: typeof POTION_SUPPORT_CONTEXT_VERSION;
  created_at: string;
  potion_type: PotionType;
  objective: {
    text: string;
    evidence_refs: PotionSupportEvidenceRef[];
  };
  baseline_evidence: PotionSupportEvidence[];
  /** Exact, bounded excerpts of messages integrated after activation. */
  rolling_evidence: PotionSupportEvidence[];
  cumulative_ledger: PotionSupportLedger;
  message_cursor: PotionSupportMessageCursor;
  opening_history: PotionSupportOpeningHistoryItem[];
  /** Context useful for choosing a direction, but forbidden as visible proof. */
  advisory_context: {
    topic_id: string | null;
    topic_confidence: number | null;
    user_named_theme: boolean;
    recent_conversation_available: boolean;
    thematic_memory_available: boolean;
  };
};

function cleanText(value: unknown, max = 600): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function evidenceId(ref: PotionSupportEvidenceRef, index: number): string {
  return [
    ref.source_type,
    ref.source_id,
    ref.source_field ?? "value",
    String(index),
  ].join(":");
}

function refKey(ref: PotionSupportEvidenceRef): string {
  return `${ref.source_type}:${ref.source_id}:${ref.source_field ?? ""}`;
}

function pushEvidence(
  target: PotionSupportEvidence[],
  input: {
    text: unknown;
    source: PotionSupportEvidenceRef;
    observedAt?: string | null;
    max?: number;
  },
) {
  const text = cleanText(input.text, input.max ?? 600);
  if (!text) return;
  if (
    target.some((item) =>
      item.text.toLowerCase() === text.toLowerCase() &&
      refKey(item.source) === refKey(input.source)
    )
  ) return;
  target.push({
    evidence_id: evidenceId(input.source, target.length + 1),
    text,
    source: input.source,
    observed_at: input.observedAt ?? null,
  });
}

/**
 * Builds the durable, bounded evidence snapshot while all expensive potion
 * activation loaders are already warm. Recent conversation/memory blocks are
 * deliberately kept advisory because their formatted form carries no stable
 * row ids; only structured DB fields and the user's potion input may surface.
 */
export function buildPotionSupportContext(input: {
  nowIso: string;
  potionType: PotionType;
  questionnaireAnswers: Record<string, string>;
  freeText: string | null;
  content: PotionActivationContent;
  baseContext: PotionBaseContext;
  recentContext: PotionRecentContext;
}): PotionSupportContextV1 {
  const evidence: PotionSupportEvidence[] = [];
  const selfId = "potion_session:self";

  for (const [field, value] of Object.entries(input.questionnaireAnswers)) {
    pushEvidence(evidence, {
      text: value,
      source: {
        source_type: "potion_answer",
        source_id: selfId,
        source_field: field,
      },
      observedAt: input.nowIso,
    });
  }
  pushEvidence(evidence, {
    text: input.freeText,
    source: {
      source_type: "potion_free_text",
      source_id: selfId,
      source_field: "free_text",
    },
    observedAt: input.nowIso,
  });

  const transformationId = input.baseContext.scope.transformation_id;
  if (transformationId) {
    const transformationFields: Array<[string, unknown]> = [
      ["title", input.baseContext.transformation.title],
      ["user_summary", input.baseContext.transformation.user_summary],
      [
        "success_definition",
        input.baseContext.transformation.success_definition,
      ],
      ["main_constraint", input.baseContext.transformation.main_constraint],
      ["identity_shift", input.baseContext.plan_strategy.identity_shift],
      ["core_principle", input.baseContext.plan_strategy.core_principle],
    ];
    for (const [field, value] of transformationFields) {
      pushEvidence(evidence, {
        text: value,
        source: {
          source_type: "transformation",
          source_id: transformationId,
          source_field: field,
        },
      });
    }
    input.baseContext.transformation.deep_why_answers.slice(0, 6).forEach(
      (answer, index) => {
        pushEvidence(evidence, {
          text: answer.answer,
          source: {
            source_type: "transformation",
            source_id: transformationId,
            source_field: `deep_why.${index + 1}`,
          },
        });
      },
    );
  }

  for (const item of input.baseContext.plan_items.slice(0, 10)) {
    pushEvidence(evidence, {
      text: item.title,
      source: {
        source_type: "plan_item",
        source_id: item.id,
        source_field: "title",
      },
    });
    pushEvidence(evidence, {
      text: item.description,
      source: {
        source_type: "plan_item",
        source_id: item.id,
        source_field: "description",
      },
    });
  }

  for (const prior of input.baseContext.prior_potions.slice(0, 4)) {
    pushEvidence(evidence, {
      text: prior.reminder_instruction ?? prior.title,
      source: {
        source_type: "prior_potion",
        source_id: prior.id,
        source_field: prior.reminder_instruction
          ? "reminder_instruction"
          : "title",
      },
      observedAt: prior.generated_at,
    });
  }

  // Keep the snapshot compact. User-authored potion input is inserted first,
  // therefore it survives the cap before broader plan context.
  const baselineEvidence = evidence.slice(0, 32);
  const objectiveRefs = baselineEvidence
    .filter((item) =>
      item.source.source_type === "potion_answer" ||
      item.source.source_type === "potion_free_text"
    )
    .slice(0, 4)
    .map((item) => item.source);
  const objectiveText = cleanText(
    input.content.follow_up_proposal?.description ??
      input.content.follow_up_proposal?.message_text ??
      "Apporter un soutien sobre et contextualisé pendant les prochains jours.",
    420,
  );

  return {
    version: POTION_SUPPORT_CONTEXT_VERSION,
    created_at: input.nowIso,
    potion_type: input.potionType,
    objective: {
      text: objectiveText,
      evidence_refs: objectiveRefs,
    },
    baseline_evidence: baselineEvidence,
    rolling_evidence: [],
    cumulative_ledger: {
      grounded_facts: [],
      open_threads: [],
      user_boundaries: [],
      advisory_summary: null,
    },
    message_cursor: {
      created_at: input.nowIso,
      ids_at_boundary: [],
    },
    opening_history: [],
    advisory_context: {
      topic_id: input.recentContext.topic_id,
      topic_confidence: input.recentContext.topic_confidence,
      user_named_theme: input.recentContext.user_named_theme,
      recent_conversation_available: Boolean(
        input.recentContext.conversation_block,
      ),
      thematic_memory_available: Boolean(
        input.recentContext.thematic_memory_block,
      ),
    },
  };
}

export function readPotionSupportContext(
  metadata: unknown,
): PotionSupportContextV1 | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const raw = (metadata as Record<string, unknown>).potion_support_v1;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (Number(record.version) !== POTION_SUPPORT_CONTEXT_VERSION) return null;
  if (!Array.isArray(record.baseline_evidence)) return null;
  return raw as PotionSupportContextV1;
}
