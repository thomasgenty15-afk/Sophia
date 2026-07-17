import { ACTIVE_CONVERSATION_SKILL_KEY } from "../_shared/active_skill_state.ts";

export const POTION_SUPPORT_ADMISSION_SKILL_ID =
  "potion_support_admission_v1" as const;

export type PotionSupportAdmissionContext = {
  source: "potion_support";
  source_potion_session_id: string;
  recurring_reminder_id: string;
  scheduled_checkin_id: string;
  day_index: number;
  topic_hint: string | null;
  opening_focus: string | null;
  anchor_evidence_refs: Array<{
    source_type: string;
    source_id: string;
    source_field: string | null;
  }>;
  awaiting_first_reply: true;
};

export type PotionSupportAdmissionState = {
  version: 1;
  skill_id: typeof POTION_SUPPORT_ADMISSION_SKILL_ID;
  status: "active";
  turn_count: 0;
  started_at: string;
  updated_at: string;
  working_state: {
    potion_support_admission: PotionSupportAdmissionContext;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function evidenceRefs(value: unknown): PotionSupportAdmissionContext[
  "anchor_evidence_refs"
] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (!isRecord(item)) return [];
    const sourceType = cleanText(item.source_type, 80);
    const sourceId = cleanText(item.source_id, 160);
    if (!sourceType || !sourceId) return [];
    return [{
      source_type: sourceType,
      source_id: sourceId,
      source_field: cleanText(item.source_field, 160) || null,
    }];
  });
}

export function armPotionSupportAdmission(input: {
  tempMemory: Record<string, unknown>;
  nowIso: string;
  context: Omit<PotionSupportAdmissionContext, "source" | "awaiting_first_reply">;
}): Record<string, unknown> {
  const state: PotionSupportAdmissionState = {
    version: 1,
    skill_id: POTION_SUPPORT_ADMISSION_SKILL_ID,
    status: "active",
    turn_count: 0,
    started_at: input.nowIso,
    updated_at: input.nowIso,
    working_state: {
      potion_support_admission: {
        source: "potion_support",
        ...input.context,
        awaiting_first_reply: true,
      },
    },
  };
  const next = { ...input.tempMemory };
  next[ACTIVE_CONVERSATION_SKILL_KEY] = state;
  next.__active_skill_state = state;
  delete next.active_skill_state;
  return next;
}

export function readPotionSupportAdmissionState(
  value: unknown,
): PotionSupportAdmissionState | null {
  if (!isRecord(value)) return null;
  if (cleanText(value.skill_id) !== POTION_SUPPORT_ADMISSION_SKILL_ID) {
    return null;
  }
  const working = isRecord(value.working_state) ? value.working_state : {};
  const raw = isRecord(working.potion_support_admission)
    ? working.potion_support_admission
    : null;
  if (!raw || raw.awaiting_first_reply !== true) return null;
  const sourcePotionSessionId = cleanText(raw.source_potion_session_id, 160);
  const recurringReminderId = cleanText(raw.recurring_reminder_id, 160);
  const scheduledCheckinId = cleanText(raw.scheduled_checkin_id, 160);
  if (!sourcePotionSessionId || !recurringReminderId || !scheduledCheckinId) {
    return null;
  }
  return {
    version: 1,
    skill_id: POTION_SUPPORT_ADMISSION_SKILL_ID,
    status: "active",
    turn_count: 0,
    started_at: cleanText(value.started_at, 80) || new Date(0).toISOString(),
    updated_at: cleanText(value.updated_at, 80) || new Date(0).toISOString(),
    working_state: {
      potion_support_admission: {
        source: "potion_support",
        source_potion_session_id: sourcePotionSessionId,
        recurring_reminder_id: recurringReminderId,
        scheduled_checkin_id: scheduledCheckinId,
        day_index: Math.max(1, Number(raw.day_index ?? 1) || 1),
        topic_hint: cleanText(raw.topic_hint) || null,
        opening_focus: cleanText(raw.opening_focus) || null,
        anchor_evidence_refs: evidenceRefs(raw.anchor_evidence_refs),
        awaiting_first_reply: true,
      },
    },
  };
}
