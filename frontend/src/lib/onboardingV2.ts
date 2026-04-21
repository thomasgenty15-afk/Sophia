import type {
  CycleStatus,
  DeferredReason,
  PlanContentV3,
  ProfessionalSupportV1,
  PlanTypeClassificationV1,
  TransformationStatus,
  UserTransformationRow,
} from "../types/v2";
import { extractProfessionalSupport } from "./professionalSupport";

export type IntakeAspectV2 = {
  label: string;
  raw_excerpt: string | null;
  source_rank: number;
  uncertainty_level: "low" | "medium" | "high";
  uncertainty_reason?: string | null;
  deferred_reason?: DeferredReason | null;
};

export type ProvisionalGroupV2 = {
  group_label: string;
  grouping_rationale: string;
  aspect_ranks: number[];
};

export type ValidatedGroupV2 = {
  group_label: string;
  aspects: Array<{
    label: string;
    raw_excerpt: string | null;
    source_rank: number;
  }>;
};

export type QuestionnaireOptionV2 = {
  id: string;
  label: string;
};

export type QuestionnaireVisibilityRuleV2 = {
  question_id: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq" | "neq";
  value: string | number;
};

export type QuestionnaireMeasurementHintsV2 = {
  metric_key: string;
  metric_label: string;
  unit: string | null;
  direction: "increase" | "decrease" | "reach_zero" | "stabilize";
  measurement_mode:
    | "absolute_value"
    | "count"
    | "frequency"
    | "duration"
    | "score";
  baseline_prompt: string;
  target_prompt: string;
  suggested_target_value: number | null;
  rationale: string;
  confidence: number;
};

export type QuestionnaireQuestionV2 = {
  id: string;
  kind: "single_choice" | "multiple_choice" | "number" | "text" | "time";
  question: string;
  helper_text: string | null;
  required: boolean;
  capture_goal: string;
  options: QuestionnaireOptionV2[];
  allow_other: boolean;
  placeholder: string | null;
  max_selections: number | null;
  unit?: string | null;
  suggested_value?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  visible_if?: QuestionnaireVisibilityRuleV2 | null;
};

export type QuestionnaireSchemaV2 = {
  version: 1;
  transformation_id: string;
  questions: QuestionnaireQuestionV2[];
  metadata: {
    design_principle: string;
    measurement_hints: QuestionnaireMeasurementHintsV2;
    [key: string]: unknown;
  };
};

export type TransformationPreviewV2 = {
  id: string;
  cycle_id: string;
  priority_order: number;
  recommended_order?: number | null;
  recommended_progress_indicator?: string | null;
  status: TransformationStatus;
  title: string | null;
  internal_summary: string;
  user_summary: string;
  questionnaire_context: string[];
  questionnaire_schema?: QuestionnaireSchemaV2 | null;
  questionnaire_answers?: Record<string, unknown> | null;
  source_group_index?: number | null;
  ordering_rationale?: string | null;
  selection_context?: string | null;
  is_manual?: boolean;
  plan_type_classification?: PlanTypeClassificationV1 | null;
  professional_support?: ProfessionalSupportV1 | null;
};

export type MinimalProfileDraft = {
  birthDate: string;
  gender: string;
  pace: "intense" | "normal" | "cool" | "";
};

export type JourneyTransitionPart = {
  transformation_id: string;
  title: string | null;
  part_number: number;
  estimated_duration_months: number | null;
  status: TransformationStatus | null;
};

export type JourneyContextTransition = {
  is_multi_part: boolean;
  part_number: number | null;
  estimated_total_parts: number | null;
  continuation_hint: string | null;
  estimated_total_duration_months: number | null;
  parts: JourneyTransitionPart[];
};

export type RoadmapTransitionDraft = {
  transformation_title: string | null;
  current_part_duration_months: number | null;
  journey_context: JourneyContextTransition;
};

export type PlanReviewDraft = {
  plan_preview: PlanContentV3;
  feedback: string;
};

export type OnboardingV2Draft = {
  version: 1;
  anonymous_session_id: string;
  entry_mode: "default" | "add_transformation";
  preserved_active_transformation_id: string | null;
  stage:
    | "capture"
    | "validation"
    | "priorities"
    | "questionnaire_setup"
    | "questionnaire"
    | "profile"
    | "generating_plan"
    | "plan_review"
    | "roadmap_transition"
    | "completed";
  pending_auth_action: "analyze" | null;
  raw_intake_text: string;
  cycle_id: string | null;
  cycle_status: CycleStatus | null;
  needs_clarification: boolean;
  clarification_prompt: string | null;
  aspects: IntakeAspectV2[];
  provisional_groups: ProvisionalGroupV2[];
  validated_groups: ValidatedGroupV2[];
  deferred_aspects: IntakeAspectV2[];
  transformations: TransformationPreviewV2[];
  active_transformation_id: string | null;
  questionnaire_schema: QuestionnaireSchemaV2 | null;
  questionnaire_answers: Record<string, unknown>;
  profile: MinimalProfileDraft;
  plan_review: PlanReviewDraft | null;
  roadmap_transition: RoadmapTransitionDraft | null;
  updated_at: string;
};

const KEY = "sophia:onboarding_v2_draft:v1";
const SESSION_KEY = "sophia:onboarding_v2_draft_session:v1";
const DRAFT_SYNC_DEBOUNCE_MS = 500;

let draftSyncTimeout: number | null = null;
let queuedDraftForSync: OnboardingV2Draft | null = null;

export type CycleDraftServerSnapshot = {
  draft: OnboardingV2Draft;
  updated_at: string;
};

export type CycleDraftHydrateResponse = {
  hydrated: boolean;
  cycle_id: string | null;
  reason: string;
  status?: CycleStatus | null;
};

export type GuestIntakeResponse = {
  cycle_status: CycleStatus;
  needs_clarification: boolean;
  clarification_prompt: string | null;
  transformations: TransformationPreviewV2[];
};

export type GuestQuestionnaireResponse = {
  schema?: QuestionnaireSchemaV2;
  questions: QuestionnaireSchemaV2["questions"];
};

function uuidv4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const segment = () =>
    Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);

  return `${segment()}${segment()}-${segment()}-${segment()}-${
    segment()
  }-${segment()}${segment()}${segment()}`;
}

function getCycleDraftBaseUrl(): string | null {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/cycle-draft`;
}

function getCycleDraftAnonKey(): string | null {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? null;
}

function persistAnonymousSessionId(sessionId: string): string {
  try {
    localStorage.setItem(SESSION_KEY, sessionId);
  } catch {
    // ignore private mode / quota failures
  }
  return sessionId;
}

export function getStoredAnonymousSessionId(): string | null {
  try {
    const value = localStorage.getItem(SESSION_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function ensureAnonymousSessionId(sessionId?: string | null): string {
  const resolved = String(sessionId ?? getStoredAnonymousSessionId() ?? uuidv4())
    .trim();
  return persistAnonymousSessionId(resolved || uuidv4());
}

export function normalizeOnboardingV2Draft(
  draft?: Partial<OnboardingV2Draft> | null,
): OnboardingV2Draft {
  const anonymousSessionId = ensureAnonymousSessionId(
    draft?.anonymous_session_id,
  );

  const baseDraft: OnboardingV2Draft = {
    version: 1,
    anonymous_session_id: anonymousSessionId,
    entry_mode: "default",
    preserved_active_transformation_id: null,
    stage: "capture",
    pending_auth_action: null,
    raw_intake_text: "",
    cycle_id: null,
    cycle_status: null,
    needs_clarification: false,
    clarification_prompt: null,
    aspects: [],
    provisional_groups: [],
    validated_groups: [],
    deferred_aspects: [],
    transformations: [],
    active_transformation_id: null,
    questionnaire_schema: null,
    questionnaire_answers: {},
    profile: {
      birthDate: "",
      gender: "",
      pace: "",
    },
    plan_review: null,
    roadmap_transition: null,
    updated_at: new Date().toISOString(),
  };

  return {
    ...baseDraft,
    ...draft,
    anonymous_session_id: anonymousSessionId,
    profile: {
      ...baseDraft.profile,
      ...(draft?.profile ?? {}),
    },
    updated_at: typeof draft?.updated_at === "string" && draft.updated_at.trim()
      ? draft.updated_at
      : new Date().toISOString(),
  };
}

export function persistOnboardingV2DraftLocally(
  draft: Partial<OnboardingV2Draft>,
): OnboardingV2Draft {
  const normalized = normalizeOnboardingV2Draft(draft);
  try {
    localStorage.setItem(KEY, JSON.stringify(normalized));
    persistAnonymousSessionId(normalized.anonymous_session_id);
  } catch {
    // ignore quota/private mode failures
  }
  return normalized;
}

export function createEmptyOnboardingV2Draft(): OnboardingV2Draft {
  return normalizeOnboardingV2Draft();
}

export function loadOnboardingV2Draft(): OnboardingV2Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingV2Draft>;
    if (!parsed || parsed.version !== 1) return null;
    return normalizeOnboardingV2Draft(parsed);
  } catch {
    return null;
  }
}

function scheduleDraftSync(draft: OnboardingV2Draft): void {
  if (typeof window === "undefined") return;

  // Once a real cycle exists in the DB, the draft is no longer the source of
  // truth. Keep the local copy, but stop syncing it to the anonymous draft
  // endpoint to avoid overwriting a valid hydrated state with partial UI state.
  if (draft.cycle_id) {
    queuedDraftForSync = null;
    if (draftSyncTimeout !== null) {
      window.clearTimeout(draftSyncTimeout);
      draftSyncTimeout = null;
    }
    return;
  }

  queuedDraftForSync = draft;
  if (draftSyncTimeout !== null) {
    window.clearTimeout(draftSyncTimeout);
  }

  draftSyncTimeout = window.setTimeout(() => {
    const nextDraft = queuedDraftForSync;
    queuedDraftForSync = null;
    draftSyncTimeout = null;

    if (nextDraft) {
      void syncDraftToServer(nextDraft);
    }
  }, DRAFT_SYNC_DEBOUNCE_MS);
}

/**
 * Cancel any pending debounced sync and immediately fire the queued draft to
 * the server (fire-and-forget). Call this before navigating away to guarantee
 * the server has the latest state even when the debounce hasn't fired yet.
 */
export function flushDraftSync(): void {
  if (typeof window === "undefined") return;

  if (draftSyncTimeout !== null) {
    window.clearTimeout(draftSyncTimeout);
    draftSyncTimeout = null;
  }

  const draft = queuedDraftForSync;
  queuedDraftForSync = null;

  if (draft) {
    void syncDraftToServer(draft);
  }
}

export async function syncDraftToServer(draft: OnboardingV2Draft): Promise<void> {
  const baseUrl = getCycleDraftBaseUrl();
  const anonKey = getCycleDraftAnonKey();
  if (!baseUrl || !anonKey) return;

  try {
    await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({
        anonymous_session_id: draft.anonymous_session_id,
        draft,
      }),
    });
  } catch {
    // Best-effort sync only.
  }
}

export async function loadDraftFromServer(
  sessionId: string,
): Promise<CycleDraftServerSnapshot | null> {
  const baseUrl = getCycleDraftBaseUrl();
  const anonKey = getCycleDraftAnonKey();
  if (!baseUrl || !anonKey) return null;

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("session_id", sessionId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: anonKey,
      },
    });
    if (!response.ok) return null;

    const payload = await response.json() as {
      draft?: Partial<OnboardingV2Draft> | null;
      updated_at?: string | null;
    };
    if (!payload.draft || typeof payload.updated_at !== "string") return null;

    // Prefer the client-side updated_at stored inside the draft payload for
    // comparison purposes. The row updated_at is a server timestamp and may be
    // ahead of the client clock, causing the server draft to incorrectly win
    // over a freshly updated local draft (e.g. after clicking "← Retour").
    const draftPayloadUpdatedAt =
      typeof payload.draft.updated_at === "string" && payload.draft.updated_at.trim()
        ? payload.draft.updated_at
        : payload.updated_at;

    const draft = normalizeOnboardingV2Draft({
      ...payload.draft,
      anonymous_session_id: sessionId,
      updated_at: draftPayloadUpdatedAt,
    });

    return {
      draft,
      updated_at: draftPayloadUpdatedAt,
    };
  } catch {
    return null;
  }
}

export async function hydrateDraftAfterAuth(params: {
  anonymousSessionId: string;
  accessToken: string;
  draft?: OnboardingV2Draft | null;
}): Promise<CycleDraftHydrateResponse | null> {
  const baseUrl = getCycleDraftBaseUrl();
  const anonKey = getCycleDraftAnonKey();
  if (!baseUrl || !anonKey) return null;

  try {
    const response = await fetch(`${baseUrl}/hydrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        anonymous_session_id: params.anonymousSessionId,
        draft: params.draft ?? null,
      }),
    });
    if (!response.ok) return null;

    const payload = await response.json() as Partial<CycleDraftHydrateResponse>;
    if (typeof payload.hydrated !== "boolean") return null;

    return {
      hydrated: payload.hydrated,
      cycle_id: typeof payload.cycle_id === "string" ? payload.cycle_id : null,
      reason: typeof payload.reason === "string" ? payload.reason : "unknown",
      status: payload.status ?? null,
    };
  } catch {
    return null;
  }
}

async function callCycleDraftJson<T>(params: {
  path?: string;
  body?: Record<string, unknown>;
  accessToken?: string;
  method?: "GET" | "POST";
}): Promise<T> {
  const baseUrl = getCycleDraftBaseUrl();
  const anonKey = getCycleDraftAnonKey();
  if (!baseUrl || !anonKey) {
    throw new Error("Cycle draft endpoint is not configured");
  }

  const response = await fetch(`${baseUrl}${params.path ?? ""}`, {
    method: params.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      ...(params.accessToken
        ? { Authorization: `Bearer ${params.accessToken}` }
        : {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.error === "string"
      ? payload.error
      : "Cycle draft request failed";
    throw new Error(message);
  }

  return payload as T;
}

export async function intakeToTransformationsGuest(params: {
  anonymousSessionId: string;
  rawIntakeText: string;
}): Promise<GuestIntakeResponse> {
  return callCycleDraftJson<GuestIntakeResponse>({
    path: "/intake",
    body: {
      anonymous_session_id: params.anonymousSessionId,
      raw_intake_text: params.rawIntakeText,
    },
  });
}

export async function generateCycleDraftQuestionnaireGuest(params: {
  anonymousSessionId: string;
  transformation: TransformationPreviewV2;
}): Promise<GuestQuestionnaireResponse> {
  return callCycleDraftJson<GuestQuestionnaireResponse>({
    path: "/questionnaire",
    body: {
      anonymous_session_id: params.anonymousSessionId,
      transformation: {
        id: params.transformation.id,
        title: params.transformation.title,
        internal_summary: params.transformation.internal_summary,
        user_summary: params.transformation.user_summary,
        questionnaire_context: params.transformation.questionnaire_context,
        questionnaire_answers: params.transformation.questionnaire_answers ??
          {},
      },
    },
  });
}

export function saveOnboardingV2Draft(
  draft: OnboardingV2Draft,
  options?: { sync?: boolean },
): OnboardingV2Draft {
  const nextDraft = persistOnboardingV2DraftLocally({
    ...draft,
    updated_at: new Date().toISOString(),
  });
  if (options?.sync !== false) {
    scheduleDraftSync(nextDraft);
  }
  return nextDraft;
}

export function clearOnboardingV2Draft(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }

  queuedDraftForSync = null;
  if (draftSyncTimeout !== null && typeof window !== "undefined") {
    window.clearTimeout(draftSyncTimeout);
    draftSyncTimeout = null;
  }
}

export function toTransformationPreview(
  transformation: UserTransformationRow,
): TransformationPreviewV2 {
  const onboardingV2 = (transformation.handoff_payload?.onboarding_v2 as
    | Record<string, unknown>
    | undefined) ?? null;

  return {
    id: transformation.id,
    cycle_id: transformation.cycle_id,
    priority_order: transformation.priority_order,
    recommended_order: typeof onboardingV2?.recommended_order === "number"
      ? onboardingV2.recommended_order
      : transformation.priority_order,
    recommended_progress_indicator:
      typeof onboardingV2?.recommended_progress_indicator === "string"
        ? onboardingV2.recommended_progress_indicator
        : null,
    status: transformation.status,
    title: transformation.title,
    internal_summary: transformation.internal_summary,
    user_summary: transformation.user_summary,
    questionnaire_context: extractQuestionnaireContext(
      transformation.handoff_payload,
    ),
    questionnaire_schema: parseQuestionnaireSchema(
      transformation.questionnaire_schema,
    ),
    questionnaire_answers: transformation.questionnaire_answers ?? null,
    source_group_index: typeof onboardingV2?.source_group_index === "number"
      ? onboardingV2.source_group_index
      : null,
    ordering_rationale: typeof onboardingV2?.ordering_rationale === "string"
      ? onboardingV2.ordering_rationale
      : null,
    selection_context: typeof onboardingV2?.selection_context === "string"
      ? onboardingV2.selection_context
      : null,
    is_manual: onboardingV2?.is_manual === true,
    plan_type_classification:
      onboardingV2?.plan_type_classification &&
        typeof onboardingV2.plan_type_classification === "object" &&
        !Array.isArray(onboardingV2.plan_type_classification)
        ? onboardingV2.plan_type_classification as PlanTypeClassificationV1
        : null,
    professional_support: extractProfessionalSupport(
      transformation.handoff_payload,
    ),
  };
}

export function extractQuestionnaireContext(
  handoffPayload: Record<string, unknown> | null,
): string[] {
  const raw = (
    handoffPayload?.onboarding_v2 as
      | { questionnaire_context?: unknown }
      | undefined
  )?.questionnaire_context;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

export function parseQuestionnaireSchema(
  value: Record<string, unknown> | null,
): QuestionnaireSchemaV2 | null {
  if (!value || value.version !== 1) return null;
  if (!Array.isArray(value.questions)) return null;
  return value as unknown as QuestionnaireSchemaV2;
}
