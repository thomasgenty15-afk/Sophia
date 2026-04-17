import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  jsonResponse,
  parseJsonBody,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import type {
  CycleDraftStatus,
  UserCycleDraftRow,
  UserCycleRow,
  UserTransformationRow,
} from "../_shared/v2-types.ts";
import {
  materializeCycleTransformationsFromIntake,
  previewTransformationsFromIntake,
} from "../_shared/v2-intake-core.ts";
import { classifyPlanTypeForTransformation } from "../classify-plan-type-v1/index.ts";
import { generateQuestionnaireDraft } from "../generate-questionnaire-v2/index.ts";

const DRAFT_STAGE_VALUES = [
  "capture",
  "validation",
  "priorities",
  "questionnaire_setup",
  "questionnaire",
  "profile",
  "generating_plan",
  "completed",
] as const;

const CYCLE_STATUS_VALUES = [
  "draft",
  "clarification_needed",
  "structured",
  "prioritized",
  "questionnaire_in_progress",
  "signup_pending",
  "profile_pending",
  "ready_for_plan",
  "active",
  "completed",
  "abandoned",
] as const;

const INCOMPLETE_CYCLE_STATUSES = [
  "draft",
  "clarification_needed",
  "structured",
  "prioritized",
  "questionnaire_in_progress",
  "signup_pending",
  "profile_pending",
  "ready_for_plan",
  "active",
] as const;

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DRAFT_PAYLOAD_SCHEMA = z.object({
  version: z.literal(1),
  stage: z.enum(DRAFT_STAGE_VALUES),
  pending_auth_action: z.enum(["analyze"]).nullable().optional(),
  raw_intake_text: z.string(),
  cycle_id: z.string().uuid().nullable().optional(),
  cycle_status: z.enum(CYCLE_STATUS_VALUES).nullable().optional(),
  updated_at: z.string().optional(),
}).passthrough();

const UPSERT_REQUEST_SCHEMA = z.object({
  anonymous_session_id: z.string().uuid(),
  draft: DRAFT_PAYLOAD_SCHEMA,
});

const HYDRATE_REQUEST_SCHEMA = z.object({
  anonymous_session_id: z.string().uuid(),
  draft: DRAFT_PAYLOAD_SCHEMA.nullable().optional(),
});

const GUEST_INTAKE_REQUEST_SCHEMA = z.object({
  anonymous_session_id: z.string().uuid(),
  raw_intake_text: z.string().min(1),
});

const GUEST_QUESTIONNAIRE_REQUEST_SCHEMA = z.object({
  anonymous_session_id: z.string().uuid(),
  transformation: z.object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    internal_summary: z.string().min(1),
    user_summary: z.string().min(1),
    questionnaire_context: z.array(z.string().min(1)).min(1).max(5),
    questionnaire_answers: z.record(z.unknown()).optional(),
  }),
});

type StoredDraftPayload = z.infer<typeof DRAFT_PAYLOAD_SCHEMA>;

class CycleDraftError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CycleDraftError";
    this.status = status;
  }
}

function getCycleDraftCorsHeaders(req: Request): Record<string, string> {
  return {
    ...getCorsHeaders(req),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function cycleDraftResponse(
  req: Request,
  body: unknown,
  opts?: { status?: number; headers?: Record<string, string> },
): Response {
  return jsonResponse(req, body, {
    status: opts?.status,
    headers: {
      ...getCycleDraftCorsHeaders(req),
      ...(opts?.headers ?? {}),
    },
  });
}

function handleCycleDraftCorsOptions(req: Request): Response {
  const corsError = enforceCors(req);
  if (corsError) return corsError;
  return new Response("ok", { headers: getCycleDraftCorsHeaders(req) });
}

function isBaseDraftPath(pathname: string): boolean {
  return pathname.endsWith("/cycle-draft") || pathname.endsWith("/cycle-draft/");
}

function isHydratePath(pathname: string): boolean {
  return pathname.endsWith("/cycle-draft/hydrate") ||
    pathname.endsWith("/cycle-draft/hydrate/");
}

function isIntakePath(pathname: string): boolean {
  return pathname.endsWith("/cycle-draft/intake") ||
    pathname.endsWith("/cycle-draft/intake/");
}

function isQuestionnairePath(pathname: string): boolean {
  return pathname.endsWith("/cycle-draft/questionnaire") ||
    pathname.endsWith("/cycle-draft/questionnaire/");
}

function computeExpiresAt(now = Date.now()): string {
  return new Date(now + DRAFT_TTL_MS).toISOString();
}

export function deriveCycleDraftStatus(draft: StoredDraftPayload): CycleDraftStatus {
  switch (draft.cycle_status) {
    case "structured":
    case "clarification_needed":
      return "structured";
    case "prioritized":
    case "questionnaire_in_progress":
    case "signup_pending":
    case "profile_pending":
    case "ready_for_plan":
    case "active":
    case "completed":
      return "prioritized";
    default:
      break;
  }

  switch (draft.stage) {
    case "validation":
      return "structured";
    case "priorities":
    case "questionnaire_setup":
    case "questionnaire":
    case "profile":
    case "generating_plan":
    case "completed":
      return "prioritized";
    default:
      return "draft";
  }
}

export function resolveHydrationMode(args: {
  draft: StoredDraftPayload;
  existingCycleId: string | null;
  ownedCycleId: string | null;
}): "noop_existing_cycle" | "reuse_cycle" | "analyze_raw_text" {
  if (args.existingCycleId) return "noop_existing_cycle";
  if (args.ownedCycleId) return "reuse_cycle";
  if (String(args.draft.raw_intake_text ?? "").trim()) return "analyze_raw_text";
  throw new CycleDraftError(
    409,
    "Draft cannot be hydrated without an owned cycle or raw intake text",
  );
}

function draftHasTransformations(
  draft: StoredDraftPayload | (StoredDraftPayload & { anonymous_session_id?: string }),
): boolean {
  const candidate = (draft as Record<string, unknown>).transformations;
  return Array.isArray(candidate) && candidate.length > 0;
}

function draftHasQuestionnaireSchema(
  draft: StoredDraftPayload | (StoredDraftPayload & { anonymous_session_id?: string }),
): boolean {
  const candidate = (draft as Record<string, unknown>).questionnaire_schema;
  return Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate));
}

function draftHasQuestionnaireAnswers(
  draft: StoredDraftPayload | (StoredDraftPayload & { anonymous_session_id?: string }),
): boolean {
  const candidate = (draft as Record<string, unknown>).questionnaire_answers;
  return Boolean(
    candidate && typeof candidate === "object" && !Array.isArray(candidate) &&
      Object.keys(candidate as Record<string, unknown>).length > 0,
  );
}

function draftHasHydratableState(
  draft: StoredDraftPayload | (StoredDraftPayload & { anonymous_session_id?: string }),
): boolean {
  return draftHasTransformations(draft) || draftHasQuestionnaireSchema(draft) ||
    draftHasQuestionnaireAnswers(draft);
}

async function isBlankIncompleteCycle(
  admin: SupabaseClient,
  cycle: UserCycleRow,
): Promise<boolean> {
  if (cycle.active_transformation_id) return false;

  const { data, error } = await admin
    .from("user_transformations")
    .select("id")
    .eq("cycle_id", cycle.id)
    .limit(1);
  if (error) {
    throw new CycleDraftError(500, "Failed to inspect existing cycle", {
      cause: error,
    });
  }

  return !Array.isArray(data) || data.length === 0;
}

export function normalizeStoredDraftPayload(
  row: Pick<
    UserCycleDraftRow,
    "anonymous_session_id" | "draft_payload" | "updated_at"
  >,
): StoredDraftPayload & { anonymous_session_id: string } {
  const parsed = DRAFT_PAYLOAD_SCHEMA.safeParse(row.draft_payload ?? {});
  if (!parsed.success) {
    throw new CycleDraftError(500, "Stored cycle draft payload is invalid");
  }

  return {
    ...parsed.data,
    anonymous_session_id: row.anonymous_session_id,
    updated_at: parsed.data.updated_at ?? row.updated_at,
  };
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCycleDraftCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;
  const pathname = new URL(req.url).pathname;
  console.info("[cycle-draft][request]", {
    request_id: requestId,
    method: req.method,
    pathname,
  });

  try {
    const env = getSupabaseEnv();
    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (req.method === "GET" && isBaseDraftPath(pathname)) {
      return await handleGetDraft(req, admin, requestId);
    }

    if (req.method === "POST" && isBaseDraftPath(pathname)) {
      return await handleUpsertDraft(req, admin, requestId);
    }

    if (req.method === "POST" && isHydratePath(pathname)) {
      return await handleHydrateDraft(req, admin, env, requestId);
    }

    if (req.method === "POST" && isIntakePath(pathname)) {
      return await handleGuestIntake(req, requestId);
    }

    if (req.method === "POST" && isQuestionnairePath(pathname)) {
      return await handleGuestQuestionnaire(req, requestId);
    }

    return cycleDraftResponse(
      req,
      { error: "Method Not Allowed", request_id: requestId },
      { status: 405 },
    );
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "cycle-draft",
      error,
      requestId,
      userId: getRequestContext(req).userId,
      source: "edge",
      metadata: { route: pathname },
    });

    if (error instanceof CycleDraftError) {
      if (error.status >= 400 && error.status < 500) {
        return cycleDraftResponse(
          req,
          { error: error.message, request_id: requestId },
          { status: error.status },
        );
      }
    }

    return cycleDraftResponse(
      req,
      { error: "Failed to process cycle draft", request_id: requestId },
      { status: 500 },
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

async function handleGuestIntake(
  req: Request,
  requestId: string,
): Promise<Response> {
  const parsedBody = await parseJsonBody(
    req,
    GUEST_INTAKE_REQUEST_SCHEMA,
    requestId,
  );
  if (!parsedBody.ok) {
    return cycleDraftResponse(
      req,
      await parsedBody.response.json(),
      { status: parsedBody.response.status },
    );
  }

  const result = await previewTransformationsFromIntake({
    requestId: `${requestId}:guest-intake`,
    rawIntakeText: parsedBody.data.raw_intake_text,
  });

  return cycleDraftResponse(req, {
    request_id: requestId,
    cycle_status: result.cycle_status,
    needs_clarification: result.needs_clarification,
    clarification_prompt: result.clarification_prompt,
    transformations: result.transformations,
  });
}

async function handleGuestQuestionnaire(
  req: Request,
  requestId: string,
): Promise<Response> {
  const parsedBody = await parseJsonBody(
    req,
    GUEST_QUESTIONNAIRE_REQUEST_SCHEMA,
    requestId,
  );
  if (!parsedBody.ok) {
    return cycleDraftResponse(
      req,
      await parsedBody.response.json(),
      { status: parsedBody.response.status },
    );
  }

  const transformation = parsedBody.data.transformation;
  const schema = await generateQuestionnaireDraft({
    requestId: `${requestId}:guest-questionnaire`,
    transformationId: transformation.id,
    title: String(transformation.title ?? "").trim() || "Transformation",
    internalSummary: transformation.internal_summary,
    userSummary: transformation.user_summary,
    questionnaireContext: transformation.questionnaire_context,
    existingAnswers: transformation.questionnaire_answers ?? {},
  });

  return cycleDraftResponse(req, {
    request_id: requestId,
    schema,
    questions: schema.questions,
  });
}

async function handleUpsertDraft(
  req: Request,
  admin: SupabaseClient,
  requestId: string,
): Promise<Response> {
  const parsedBody = await parseJsonBody(req, UPSERT_REQUEST_SCHEMA, requestId);
  if (!parsedBody.ok) {
    return cycleDraftResponse(
      req,
      await parsedBody.response.json(),
      { status: parsedBody.response.status },
    );
  }

  const sessionId = parsedBody.data.anonymous_session_id;
  await cleanupExpiredDrafts(admin);

  const now = new Date().toISOString();
  const draftPayload = {
    ...parsedBody.data.draft,
    anonymous_session_id: sessionId,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("user_cycle_drafts")
    .upsert({
      anonymous_session_id: sessionId,
      status: deriveCycleDraftStatus(parsedBody.data.draft),
      raw_intake_text: parsedBody.data.draft.raw_intake_text,
      draft_payload: draftPayload,
      expires_at: computeExpiresAt(Date.parse(now)),
      updated_at: now,
    } as Partial<UserCycleDraftRow>, {
      onConflict: "anonymous_session_id",
    })
    .select("id, updated_at")
    .single();
  if (error || !data) {
    throw new CycleDraftError(500, "Failed to upsert cycle draft", {
      cause: error,
    });
  }

  return cycleDraftResponse(req, {
    request_id: requestId,
    id: data.id,
    updated_at: data.updated_at,
  });
}

async function handleGetDraft(
  req: Request,
  admin: SupabaseClient,
  requestId: string,
): Promise<Response> {
  const sessionId = String(
    new URL(req.url).searchParams.get("session_id") ?? "",
  ).trim();
  if (!sessionId) {
    return cycleDraftResponse(
      req,
      { error: "Missing required session_id", request_id: requestId },
      { status: 400 },
    );
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(sessionId)) {
    return cycleDraftResponse(
      req,
      { error: "Invalid session_id", request_id: requestId },
      { status: 400 },
    );
  }

  await cleanupExpiredDrafts(admin);
  const row = await loadActiveDraftRow(admin, sessionId);
  if (!row) {
    return cycleDraftResponse(req, {
      request_id: requestId,
      draft: null,
      updated_at: null,
    });
  }

  const draft = normalizeStoredDraftPayload(row);

  return cycleDraftResponse(req, {
    request_id: requestId,
    draft,
    updated_at: row.updated_at,
  });
}

async function handleHydrateDraft(
  req: Request,
  admin: SupabaseClient,
  env: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  },
  requestId: string,
): Promise<Response> {
  const parsedBody = await parseJsonBody(req, HYDRATE_REQUEST_SCHEMA, requestId);
  if (!parsedBody.ok) {
    return cycleDraftResponse(
      req,
      await parsedBody.response.json(),
      { status: parsedBody.response.status },
    );
  }

  const userId = await authenticateUser(req, env, requestId);
  const sessionId = parsedBody.data.anonymous_session_id;
  const clientDraft = parsedBody.data.draft
    ? {
      ...parsedBody.data.draft,
      anonymous_session_id: sessionId,
      updated_at: parsedBody.data.draft.updated_at ?? new Date().toISOString(),
    }
    : null;

  console.info("[cycle-draft][hydrate][start]", {
    request_id: requestId,
    user_id: userId,
    session_id: sessionId,
    has_client_draft: Boolean(clientDraft),
    client_stage: clientDraft?.stage ?? null,
    client_cycle_status: clientDraft?.cycle_status ?? null,
    client_cycle_id: clientDraft?.cycle_id ?? null,
    client_has_transformations: clientDraft ? draftHasTransformations(clientDraft) : false,
    client_has_questionnaire_schema: clientDraft
      ? draftHasQuestionnaireSchema(clientDraft)
      : false,
    client_has_questionnaire_answers: clientDraft
      ? draftHasQuestionnaireAnswers(clientDraft)
      : false,
  });

  await cleanupExpiredDrafts(admin);
  const row = await loadActiveDraftRow(admin, sessionId);
  console.info("[cycle-draft][hydrate][draft-row]", {
    request_id: requestId,
    has_server_row: Boolean(row),
    server_row_id: row?.id ?? null,
    server_updated_at: row?.updated_at ?? null,
  });
  if (!row && !clientDraft) {
    return cycleDraftResponse(req, {
      request_id: requestId,
      hydrated: false,
      cycle_id: null,
      reason: "not_found",
    });
  }

  let existingCycle = await loadExistingIncompleteCycle(admin, userId);
  console.info("[cycle-draft][hydrate][existing-cycle]", {
    request_id: requestId,
    existing_cycle_id: existingCycle?.id ?? null,
    existing_cycle_status: existingCycle?.status ?? null,
    existing_cycle_active_transformation_id: existingCycle?.active_transformation_id ?? null,
  });
  const draftPayloadForOwnedCycle = clientDraft ?? row?.draft_payload;
  const ownedCycle = draftPayloadForOwnedCycle &&
      typeof draftPayloadForOwnedCycle === "object" &&
      typeof (draftPayloadForOwnedCycle as { cycle_id?: unknown }).cycle_id === "string"
    ? await loadOwnedCycleById(
      admin,
      userId,
      (draftPayloadForOwnedCycle as { cycle_id: string }).cycle_id,
    )
    : null;

  const draft = clientDraft ?? normalizeStoredDraftPayload(row!);
  console.info("[cycle-draft][hydrate][effective-draft]", {
    request_id: requestId,
    source: clientDraft ? "client" : "server",
    stage: draft.stage ?? null,
    cycle_status: draft.cycle_status ?? null,
    cycle_id: draft.cycle_id ?? null,
    has_transformations: draftHasTransformations(draft),
    has_questionnaire_schema: draftHasQuestionnaireSchema(draft),
    has_questionnaire_answers: draftHasQuestionnaireAnswers(draft),
    active_transformation_id: String(
      (draft as Record<string, unknown>).active_transformation_id ?? "",
    ).trim() || null,
  });

  // If the guest draft already contains the meaningful onboarding state
  // (transformations, questionnaire schema or answers), a blank authenticated
  // cycle must not take precedence over it. Otherwise the user lands on a
  // "profile" or "questionnaire" UI backed by an empty DB cycle.
  if (existingCycle && draftHasHydratableState(draft)) {
    const existingCycleIsBlank = await isBlankIncompleteCycle(admin, existingCycle);
    console.info("[cycle-draft][hydrate][existing-cycle-blank-check]", {
      request_id: requestId,
      existing_cycle_id: existingCycle.id,
      existing_cycle_is_blank: existingCycleIsBlank,
    });
    if (existingCycleIsBlank) {
      const { error: deleteCycleError } = await admin
        .from("user_cycles")
        .delete()
        .eq("id", existingCycle.id)
        .eq("user_id", userId);
      if (deleteCycleError) {
        console.error("[cycle-draft][hydrate][delete-blank-cycle-error]", {
          request_id: requestId,
          cycle_id: existingCycle.id,
          message: deleteCycleError.message,
          details: deleteCycleError.details ?? null,
          hint: deleteCycleError.hint ?? null,
          code: deleteCycleError.code ?? null,
        });
        throw new CycleDraftError(500, "Failed to delete blank existing cycle", {
          cause: deleteCycleError,
        });
      }
      existingCycle = null;
    }
  }

  const mode = resolveHydrationMode({
    draft,
    existingCycleId: existingCycle?.id ?? null,
    ownedCycleId: ownedCycle?.id ?? null,
  });
  console.info("[cycle-draft][hydrate][mode]", {
    request_id: requestId,
    mode,
    existing_cycle_id: existingCycle?.id ?? null,
    owned_cycle_id: ownedCycle?.id ?? null,
  });

  if (mode === "noop_existing_cycle") {
    if (row) await deleteDraftRow(admin, row.id);
    return cycleDraftResponse(req, {
      request_id: requestId,
      hydrated: false,
      cycle_id: existingCycle?.id ?? null,
      reason: "existing_cycle",
    });
  }

  if (mode === "reuse_cycle") {
    if (row) await deleteDraftRow(admin, row.id);
    return cycleDraftResponse(req, {
      request_id: requestId,
      hydrated: true,
      cycle_id: ownedCycle?.id ?? null,
      reason: "reused_cycle",
    });
  }

  const result = await hydrateGuestDraftToCycle({
    admin,
    requestId: `${requestId}:hydrate`,
    userId,
    draft,
  });
  console.info("[cycle-draft][hydrate][result]", {
    request_id: requestId,
    cycle_id: result.cycle.id,
    cycle_status: result.cycle.status,
    active_transformation_id: result.cycle.active_transformation_id ?? null,
  });

  if (row) await deleteDraftRow(admin, row.id);

  await schedulePostHydrationPlanTypeClassification({
    admin,
    requestId,
    userId,
    transformationId: result.classifyTransformationId,
  });

  return cycleDraftResponse(req, {
    request_id: requestId,
    hydrated: true,
    cycle_id: result.cycle.id,
    reason: "analyzed_from_draft",
    status: result.cycle.status,
  });
}

async function hydrateGuestDraftToCycle(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  draft: StoredDraftPayload & { anonymous_session_id: string };
}): Promise<{ cycle: UserCycleRow; classifyTransformationId: string | null }> {
  const guestTransformations = extractFullDraftTransformations(params.draft);
  const draftSchema = extractDraftQuestionnaireSchema(params.draft);
  const draftAnswers = extractDraftQuestionnaireAnswers(params.draft);
  const hasAnswers = Object.keys(draftAnswers).length > 0;

  console.info("[cycle-draft][hydrateGuestDraftToCycle][start]", {
    request_id: params.requestId,
    stage: params.draft.stage ?? null,
    cycle_status: params.draft.cycle_status ?? null,
    guest_transformations_count: guestTransformations.length,
    has_draft_schema: Boolean(draftSchema),
    has_answers: hasAnswers,
    active_transformation_id: String(
      (params.draft as Record<string, unknown>).active_transformation_id ?? "",
    ).trim() || null,
  });

  // Fast path: the draft already contains transformations from the guest flow.
  // Create the cycle + transformations directly from the draft data — no IA
  // re-run needed. This is instant and deterministic.
  if (guestTransformations.length > 0) {
    console.info("[cycle-draft][hydrateGuestDraftToCycle][path]", {
      request_id: params.requestId,
      path: "hydrate_from_draft_data",
    });
    return hydrateFromDraftData({
      admin: params.admin,
      requestId: params.requestId,
      userId: params.userId,
      rawIntakeText: params.draft.raw_intake_text,
      draft: params.draft,
      guestTransformations,
      draftSchema,
      draftAnswers,
      hasAnswers,
    });
  }

  // Slow fallback: no transformations in draft — must run the full pipeline.
  console.info("[cycle-draft][hydrateGuestDraftToCycle][path]", {
    request_id: params.requestId,
    path: "rerun_intake_pipeline",
  });
  const result = await materializeCycleTransformationsFromIntake({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    rawIntakeText: params.draft.raw_intake_text,
    cycleId: null,
  });
  let cycle = result.cycle;
  if (result.needsClarification) {
    console.info("[cycle-draft][hydrateGuestDraftToCycle][clarification]", {
      request_id: params.requestId,
      cycle_id: cycle.id,
    });
    return { cycle, classifyTransformationId: null };
  }

  const now = new Date().toISOString();
  const activeTransformation = result.transformations[0] ?? null;

  const cyclePatch: Partial<UserCycleRow> = {
    active_transformation_id: activeTransformation?.id ?? null,
    updated_at: now,
  };

  if (activeTransformation && draftSchema && hasAnswers) {
    const schemaPatch = {
      ...draftSchema,
      transformation_id: activeTransformation.id,
    };
    const { error: updateTransformationError } = await params.admin
      .from("user_transformations")
      .update({
        questionnaire_schema: schemaPatch,
        questionnaire_answers: draftAnswers,
        updated_at: now,
      } as Partial<UserTransformationRow>)
      .eq("id", activeTransformation.id);
    if (updateTransformationError) {
      throw new CycleDraftError(
        500,
        "Failed to hydrate questionnaire state",
        { cause: updateTransformationError },
      );
    }
    cyclePatch.status = "profile_pending";
  }

  if (cyclePatch.active_transformation_id || cyclePatch.status) {
    const { error: updateCycleError } = await params.admin
      .from("user_cycles")
      .update(cyclePatch as Partial<UserCycleRow>)
      .eq("id", cycle.id);
    if (updateCycleError) {
      throw new CycleDraftError(500, "Failed to hydrate cycle state", {
        cause: updateCycleError,
      });
    }
    cycle = { ...cycle, ...cyclePatch };
  }

  console.info("[cycle-draft][hydrateGuestDraftToCycle][done]", {
    request_id: params.requestId,
    cycle_id: cycle.id,
    cycle_status: cycle.status,
    active_transformation_id: cycle.active_transformation_id ?? null,
  });

  return {
    cycle,
    classifyTransformationId: activeTransformation && draftSchema && hasAnswers
      ? activeTransformation.id
      : null,
  };
}

type FullDraftTransformation = {
  id: string;
  priority_order: number;
  title: string | null;
  internal_summary: string;
  user_summary: string;
  source_group_index: number | null;
  questionnaire_context: string[];
  recommended_order: number | null;
  recommended_progress_indicator: string | null;
  ordering_rationale: string | null;
};

function extractFullDraftTransformations(
  draft: StoredDraftPayload,
): FullDraftTransformation[] {
  const candidate = (draft as Record<string, unknown>).transformations;
  if (!Array.isArray(candidate)) return [];

  return candidate.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const priorityOrder = Number(row.priority_order);
    const internalSummary = typeof row.internal_summary === "string"
      ? row.internal_summary
      : "";
    const userSummary = typeof row.user_summary === "string"
      ? row.user_summary
      : "";
    if (!id || !Number.isFinite(priorityOrder) || !internalSummary) return [];

    const sourceGroupIndex = Number(row.source_group_index);
    const recommendedOrder = Number(row.recommended_order);
    return [{
      id,
      priority_order: priorityOrder,
      title: typeof row.title === "string" ? row.title : null,
      internal_summary: internalSummary,
      user_summary: userSummary,
      source_group_index: Number.isFinite(sourceGroupIndex)
        ? sourceGroupIndex
        : null,
      questionnaire_context: Array.isArray(row.questionnaire_context)
        ? row.questionnaire_context.filter(
          (s: unknown): s is string => typeof s === "string",
        )
        : [],
      recommended_order: Number.isFinite(recommendedOrder)
        ? recommendedOrder
        : null,
      recommended_progress_indicator:
        typeof row.recommended_progress_indicator === "string"
          ? row.recommended_progress_indicator
          : null,
      ordering_rationale: typeof row.ordering_rationale === "string"
        ? row.ordering_rationale
        : null,
    }];
  });
}

async function hydrateFromDraftData(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  rawIntakeText: string;
  draft: StoredDraftPayload;
  guestTransformations: FullDraftTransformation[];
  draftSchema: Record<string, unknown> | null;
  draftAnswers: Record<string, unknown>;
  hasAnswers: boolean;
}): Promise<{ cycle: UserCycleRow; classifyTransformationId: string | null }> {
  const now = new Date().toISOString();

  const draftActiveId = String(
    (params.draft as Record<string, unknown>).active_transformation_id ?? "",
  ).trim();
  const activeGuest = params.guestTransformations.find(
    (t) => t.id === draftActiveId,
  ) ?? params.guestTransformations.find(
    (t) => t.priority_order === 1,
  ) ?? params.guestTransformations[0] ?? null;

  const cycleStatus = params.hasAnswers
    ? "profile_pending"
    : "questionnaire_in_progress";

  console.info("[cycle-draft][hydrateFromDraftData][start]", {
    request_id: params.requestId,
    user_id: params.userId,
    raw_intake_length: params.rawIntakeText.length,
    transformations_count: params.guestTransformations.length,
    has_answers: params.hasAnswers,
    has_schema: Boolean(params.draftSchema),
    draft_active_id: draftActiveId || null,
    active_guest_title: activeGuest?.title ?? null,
    cycle_status: cycleStatus,
  });

  // 1. Create cycle
  const { data: cycleData, error: cycleError } = await params.admin
    .from("user_cycles")
    .insert({
      user_id: params.userId,
      status: cycleStatus,
      raw_intake_text: params.rawIntakeText,
      intake_language: null,
      validated_structure: null,
      duration_months: null,
      birth_date_snapshot: null,
      gender_snapshot: null,
      requested_pace: null,
      active_transformation_id: null,
      version: 1,
      completed_at: null,
      archived_at: null,
      created_at: now,
      updated_at: now,
    } as any)
    .select("*")
    .single();
  if (cycleError) {
    console.error("[cycle-draft][hydrateFromDraftData][create-cycle-error]", {
      request_id: params.requestId,
      message: cycleError.message,
      details: cycleError.details ?? null,
      hint: cycleError.hint ?? null,
      code: cycleError.code ?? null,
    });
    throw new CycleDraftError(500, "Failed to create cycle from draft", {
      cause: cycleError,
    });
  }
  let cycle = cycleData as UserCycleRow;
  console.info("[cycle-draft][hydrateFromDraftData][cycle-created]", {
    request_id: params.requestId,
    cycle_id: cycle.id,
    cycle_status: cycle.status,
  });

  // 2. Create transformations
  const transformationRows = params.guestTransformations.map(
    (guest) => ({
      id: crypto.randomUUID(),
      cycle_id: cycle.id,
      priority_order: guest.priority_order,
      status: guest.priority_order === 1 ? "ready" : "pending",
      title: guest.title,
      internal_summary: guest.internal_summary,
      user_summary: guest.user_summary,
      success_definition: null,
      main_constraint: null,
      questionnaire_schema: null,
      questionnaire_answers: null,
      completion_summary: null,
      unlocked_principles: { kaizen: true },
      handoff_payload: {
        onboarding_v2: {
          source_group_index: guest.source_group_index,
          questionnaire_context: guest.questionnaire_context,
          recommended_order: guest.recommended_order ?? guest.priority_order,
          recommended_progress_indicator:
            guest.recommended_progress_indicator,
          ordering_rationale: guest.ordering_rationale,
        },
      },
      created_at: now,
      updated_at: now,
      activated_at: null,
      completed_at: null,
    }),
  );

  const { data: insertedRows, error: insertError } = await params.admin
    .from("user_transformations")
    .insert(transformationRows as any)
    .select("*");
  if (insertError) {
    await params.admin
      .from("user_cycles")
      .delete()
      .eq("id", cycle.id)
      .eq("user_id", params.userId);
    console.error("[cycle-draft][hydrateFromDraftData][insert-transformations-error]", {
      request_id: params.requestId,
      message: insertError.message,
      details: insertError.details ?? null,
      hint: insertError.hint ?? null,
      code: insertError.code ?? null,
    });
    throw new CycleDraftError(500, "Failed to insert transformations from draft", {
      cause: insertError,
    });
  }
  const inserted = (insertedRows ?? []) as UserTransformationRow[];
  console.info("[cycle-draft][hydrateFromDraftData][transformations-inserted]", {
    request_id: params.requestId,
    inserted_count: inserted.length,
  });

  // 3. Resolve active transformation (match by source_group_index)
  const activeTransformation = activeGuest
    ? inserted.find((row) => {
      const idx = (row.handoff_payload?.onboarding_v2 as
        | { source_group_index?: unknown }
        | undefined)?.source_group_index;
      return idx === activeGuest.source_group_index;
    }) ?? inserted.find((row) => row.priority_order === 1) ?? inserted[0]
    : inserted[0] ?? null;

  // 4. Patch questionnaire schema + answers onto the active transformation
  if (activeTransformation && params.draftSchema) {
    const schemaPatch = {
      ...params.draftSchema,
      transformation_id: activeTransformation.id,
    };
    const { error: patchError } = await params.admin
      .from("user_transformations")
      .update({
        questionnaire_schema: schemaPatch,
        questionnaire_answers: params.hasAnswers ? params.draftAnswers : null,
        updated_at: now,
      } as Partial<UserTransformationRow>)
      .eq("id", activeTransformation.id);
    if (patchError) {
      console.error("[cycle-draft][hydrateFromDraftData][patch-questionnaire-error]", {
        request_id: params.requestId,
        message: patchError.message,
        details: patchError.details ?? null,
        hint: patchError.hint ?? null,
        code: patchError.code ?? null,
      });
      throw new CycleDraftError(
        500,
        "Failed to set questionnaire on transformation",
        { cause: patchError },
      );
    }
  }

  // 5. Set active_transformation_id on cycle
  if (activeTransformation) {
    const { error: updateError } = await params.admin
      .from("user_cycles")
      .update({
        active_transformation_id: activeTransformation.id,
        updated_at: now,
      })
      .eq("id", cycle.id);
    if (updateError) {
      console.error("[cycle-draft][hydrateFromDraftData][set-active-error]", {
        request_id: params.requestId,
        message: updateError.message,
        details: updateError.details ?? null,
        hint: updateError.hint ?? null,
        code: updateError.code ?? null,
      });
      throw new CycleDraftError(500, "Failed to set active transformation", {
        cause: updateError,
      });
    }
    cycle = {
      ...cycle,
      active_transformation_id: activeTransformation.id,
    };
  }

  console.info("[cycle-draft][hydrateFromDraftData][done]", {
    request_id: params.requestId,
    cycle_id: cycle.id,
    cycle_status: cycle.status,
    active_transformation_id: cycle.active_transformation_id ?? null,
  });

  return {
    cycle,
    classifyTransformationId: activeTransformation && params.draftSchema && params.hasAnswers
      ? activeTransformation.id
      : null,
  };
}

async function schedulePostHydrationPlanTypeClassification(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string | null;
}): Promise<void> {
  if (!params.transformationId) return;

  const task = classifyPlanTypeForTransformation({
    admin: params.admin,
    requestId: `${params.requestId}:post_auth_hydrate`,
    userId: params.userId,
    transformationId: params.transformationId,
  }).then(() => {
    console.info("[cycle-draft][hydrate][classification][done]", {
      request_id: params.requestId,
      user_id: params.userId,
      transformation_id: params.transformationId,
    });
  }).catch((error) => {
    console.warn("[cycle-draft][hydrate][classification][failed]", {
      request_id: params.requestId,
      user_id: params.userId,
      transformation_id: params.transformationId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const edgeRuntime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }
  ).EdgeRuntime;

  if (typeof edgeRuntime?.waitUntil === "function") {
    edgeRuntime.waitUntil(task);
    return;
  }

  await task;
}

type DraftTransformationSnapshot = {
  id: string;
  priority_order: number;
  title: string | null;
  source_group_index: number | null;
};

function extractDraftTransformations(
  draft: StoredDraftPayload,
): DraftTransformationSnapshot[] {
  const candidate = (draft as Record<string, unknown>).transformations;
  if (!Array.isArray(candidate)) return [];

  return candidate.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const priorityOrder = Number(row.priority_order);
    const sourceGroupIndex = Number(row.source_group_index);
    if (!id || !Number.isFinite(priorityOrder)) return [];

    return [{
      id,
      priority_order: priorityOrder,
      title: typeof row.title === "string" ? row.title : null,
      source_group_index: Number.isFinite(sourceGroupIndex)
        ? sourceGroupIndex
        : null,
    }];
  });
}

async function applyGuestPriorityOrder(params: {
  admin: SupabaseClient;
  cycleId: string;
  realTransformations: UserTransformationRow[];
  guestTransformations: DraftTransformationSnapshot[];
}): Promise<UserTransformationRow[]> {
  const guestBySourceIndex = new Map<number, DraftTransformationSnapshot>();
  for (const transformation of params.guestTransformations) {
    if (transformation.source_group_index != null) {
      guestBySourceIndex.set(
        transformation.source_group_index,
        transformation,
      );
    }
  }

  if (
    guestBySourceIndex.size === 0 ||
    guestBySourceIndex.size !== params.realTransformations.length
  ) {
    return params.realTransformations;
  }

  const now = new Date().toISOString();
  const reordered = params.realTransformations.map((transformation) => {
    const sourceGroupIndex = extractSourceGroupIndex(transformation);
    const guest = sourceGroupIndex == null
      ? null
      : guestBySourceIndex.get(sourceGroupIndex) ?? null;
    if (!guest) return transformation;
    const nextStatus: UserTransformationRow["status"] = guest.priority_order === 1
      ? "ready"
      : "pending";

    return {
      ...transformation,
      priority_order: guest.priority_order,
      status: nextStatus,
      updated_at: now,
    };
  });

  const { error } = await params.admin
    .from("user_transformations")
    .upsert(
      reordered.map((transformation) => ({
        id: transformation.id,
        priority_order: transformation.priority_order,
        status: transformation.status,
        updated_at: now,
      })),
    );
  if (error) {
    throw new CycleDraftError(500, "Failed to hydrate guest priorities", {
      cause: error,
    });
  }

  return reordered.sort((a, b) => a.priority_order - b.priority_order);
}

function resolveActiveTransformation(
  draft: StoredDraftPayload,
  guestTransformations: DraftTransformationSnapshot[],
  realTransformations: UserTransformationRow[],
): UserTransformationRow | null {
  const draftActiveId = String(
    (draft as Record<string, unknown>).active_transformation_id ?? "",
  ).trim();
  const guestActive = guestTransformations.find((item) => item.id === draftActiveId) ??
    guestTransformations.find((item) => item.priority_order === 1) ??
    null;
  if (!guestActive) {
    return realTransformations[0] ?? null;
  }

  if (guestActive.source_group_index != null) {
    const bySourceIndex = realTransformations.find((item) =>
      extractSourceGroupIndex(item) === guestActive.source_group_index
    );
    if (bySourceIndex) return bySourceIndex;
  }

  return realTransformations.find((item) =>
    item.priority_order === guestActive.priority_order
  ) ?? realTransformations[0] ?? null;
}

function extractDraftQuestionnaireSchema(
  draft: StoredDraftPayload,
): Record<string, unknown> | null {
  const candidate = (draft as Record<string, unknown>).questionnaire_schema;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  return candidate as Record<string, unknown>;
}

function extractDraftQuestionnaireAnswers(
  draft: StoredDraftPayload,
): Record<string, unknown> {
  const candidate = (draft as Record<string, unknown>).questionnaire_answers;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }

  return candidate as Record<string, unknown>;
}

function extractSourceGroupIndex(
  transformation: UserTransformationRow,
): number | null {
  const sourceGroupIndex = (transformation.handoff_payload?.onboarding_v2 as
    | { source_group_index?: unknown }
    | undefined)?.source_group_index;
  return typeof sourceGroupIndex === "number" && Number.isFinite(sourceGroupIndex)
    ? sourceGroupIndex
    : null;
}

async function authenticateUser(
  req: Request,
  env: { url: string; anonKey: string },
  requestId: string,
): Promise<string> {
  const authHeader = String(
    req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "",
  ).trim();
  if (!authHeader) {
    throw new CycleDraftError(401, `Missing Authorization header (${requestId})`);
  }

  const userClient = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user?.id) {
    throw new CycleDraftError(401, "Unauthorized");
  }

  return data.user.id;
}

async function cleanupExpiredDrafts(
  admin: SupabaseClient,
): Promise<void> {
  try {
    await admin
      .from("user_cycle_drafts")
      .delete()
      .lt("expires_at", new Date().toISOString());
  } catch {
    // Best-effort global cleanup — never block the request on failure.
  }
}

async function loadActiveDraftRow(
  admin: SupabaseClient,
  sessionId: string,
): Promise<UserCycleDraftRow | null> {
  const { data, error } = await admin
    .from("user_cycle_drafts")
    .select("*")
    .eq("anonymous_session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    throw new CycleDraftError(500, "Failed to load cycle draft", { cause: error });
  }

  return (data as UserCycleDraftRow | null) ?? null;
}

async function loadExistingIncompleteCycle(
  admin: SupabaseClient,
  userId: string,
): Promise<UserCycleRow | null> {
  const { data, error } = await admin
    .from("user_cycles")
    .select("*")
    .eq("user_id", userId)
    .in("status", [...INCOMPLETE_CYCLE_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new CycleDraftError(500, "Failed to load existing cycle", {
      cause: error,
    });
  }

  return (data as UserCycleRow | null) ?? null;
}

async function loadOwnedCycleById(
  admin: SupabaseClient,
  userId: string,
  cycleId: string,
): Promise<UserCycleRow | null> {
  const { data, error } = await admin
    .from("user_cycles")
    .select("*")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new CycleDraftError(500, "Failed to load owned cycle", { cause: error });
  }

  return (data as UserCycleRow | null) ?? null;
}

async function deleteDraftRow(
  admin: SupabaseClient,
  draftId: string,
): Promise<void> {
  const { error } = await admin
    .from("user_cycle_drafts")
    .delete()
    .eq("id", draftId);
  if (error) {
    throw new CycleDraftError(500, "Failed to delete hydrated cycle draft", {
      cause: error,
    });
  }
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();

  if (!url || !anonKey || !serviceRoleKey) {
    throw new CycleDraftError(500, "Server misconfigured");
  }

  return { url, anonKey, serviceRoleKey };
}
