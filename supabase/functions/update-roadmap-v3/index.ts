import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { UserTransformationRow } from "../_shared/v2-types.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ReorderPayload = z.object({
  action: z.literal("reorder"),
  cycle_id: z.string().uuid(),
  ordered_ids: z.array(z.string().uuid()).min(1).max(10),
});

const AddPayload = z.object({
  action: z.literal("add"),
  cycle_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  user_summary: z.string().max(1000).default(""),
  ordering_rationale: z.string().max(500).default(""),
});

const RemovePayload = z.object({
  action: z.literal("remove"),
  cycle_id: z.string().uuid(),
  transformation_id: z.string().uuid(),
});

const RenamePayload = z.object({
  action: z.literal("rename"),
  cycle_id: z.string().uuid(),
  transformation_id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

const RequestSchema = z.discriminatedUnion("action", [
  ReorderPayload,
  AddPayload,
  RemovePayload,
  RenamePayload,
]);

type RequestBody =
  | { action: "reorder"; cycle_id: string; ordered_ids: string[] }
  | {
    action: "add";
    cycle_id: string;
    title: string;
    user_summary?: string;
    ordering_rationale?: string;
  }
  | { action: "remove"; cycle_id: string; transformation_id: string }
  | { action: "rename"; cycle_id: string; transformation_id: string; title: string };

// ---------------------------------------------------------------------------
// Core logic — exported for use by sophia-brain
// ---------------------------------------------------------------------------

export type RoadmapActionResult = {
  success: boolean;
  updated_transformations: Array<{
    id: string;
    title: string | null;
    priority_order: number;
    status: string;
    user_summary: string;
    ordering_rationale: string | null;
  }>;
};

type VisibleTransformationRow = UserTransformationRow & {
  onboarding_v2: Record<string, unknown>;
};

const HIDDEN_STATUSES = new Set(["cancelled", "abandoned"]);
const LOCKED_STATUSES = new Set(["active", "completed", "abandoned", "archived"]);

function extractOnboardingV2Payload(
  handoffPayload: UserTransformationRow["handoff_payload"],
): Record<string, unknown> {
  const onboardingV2 = (handoffPayload as
    | { onboarding_v2?: unknown }
    | null
    | undefined)?.onboarding_v2;
  return onboardingV2 && typeof onboardingV2 === "object"
    ? onboardingV2 as Record<string, unknown>
    : {};
}

function toVisibleTransformation(row: UserTransformationRow): VisibleTransformationRow {
  return {
    ...row,
    onboarding_v2: extractOnboardingV2Payload(row.handoff_payload),
  };
}

async function loadCycleTransformations(
  admin: SupabaseClient,
  cycleId: string,
): Promise<VisibleTransformationRow[]> {
  const { data, error } = await admin
    .from("user_transformations")
    .select(
      "id, cycle_id, priority_order, status, title, internal_summary, user_summary, success_definition, main_constraint, questionnaire_schema, questionnaire_answers, completion_summary, handoff_payload, created_at, updated_at, activated_at, completed_at",
    )
    .eq("cycle_id", cycleId)
    .order("priority_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new RoadmapActionError(
      500,
      `Failed to load cycle transformations: ${error.message}`,
    );
  }

  return (data ?? []).map((row: unknown) =>
    toVisibleTransformation(row as UserTransformationRow)
  );
}

function buildAddedTransformationSeed(args: {
  title: string;
  user_summary?: string;
  ordering_rationale?: string;
}) {
  const title = args.title.trim();
  if (!title) {
    throw new RoadmapActionError(400, "Title is required");
  }
  const userSummary = args.user_summary?.trim() ||
    `Tu veux avancer sur "${title}" et l'intégrer dans ton parcours actuel.`;
  const orderingRationale = args.ordering_rationale?.trim() ||
    `Ajouté pendant la revue de roadmap pour compléter le parcours autour de "${title}".`;
  const internalSummary =
    `Transformation ajoutée pendant la revue de roadmap. Sujet: ${title}. Contexte utilisateur: ${userSummary}`;
  const questionnaireContext = [
    `Ce que l'utilisateur veut concrètement changer autour de "${title}".`,
    `Les freins, habitudes ou situations qui compliquent actuellement "${title}".`,
    `Les signes concrets qui montreront que "${title}" avance dans la bonne direction.`,
  ];

  return {
    title,
    userSummary,
    orderingRationale,
    internalSummary,
    questionnaireContext,
  };
}

function normalizeRoadmapTransformations(
  rows: VisibleTransformationRow[],
): Array<{ id: string; priority_order: number; status: string }> {
  const visible = rows.filter((row) => !HIDDEN_STATUSES.has(row.status));
  const hidden = rows.filter((row) => HIDDEN_STATUSES.has(row.status));
  const locked = visible.filter((row) => LOCKED_STATUSES.has(row.status));
  const editable = visible.filter((row) => !LOCKED_STATUSES.has(row.status));
  const hasActive = locked.some((row) => row.status === "active");

  return [
    ...locked.map((row, index) => ({
      id: row.id,
      priority_order: index + 1,
      status: row.status,
    })),
    ...editable.map((row, index) => ({
      id: row.id,
      priority_order: locked.length + index + 1,
      status: hasActive ? "pending" : index === 0 ? "ready" : "pending",
    })),
    ...hidden.map((row, index) => ({
      id: row.id,
      priority_order: visible.length + index + 1,
      status: row.status,
    })),
  ];
}

async function persistNormalizedRoadmap(args: {
  admin: SupabaseClient;
  cycleId: string;
  updates: Array<{ id: string; priority_order: number; status: string }>;
  now: string;
}) {
  const ids = args.updates.map((update) => update.id);
  const { data, error } = await args.admin
    .from("user_transformations")
    .select(
      "id, cycle_id, priority_order, status, title, internal_summary, user_summary, success_definition, main_constraint, questionnaire_schema, questionnaire_answers, completion_summary, handoff_payload",
    )
    .eq("cycle_id", args.cycleId)
    .in("id", ids);

  if (error) {
    throw new RoadmapActionError(
      500,
      `Failed to load transformations for normalization: ${error.message}`,
    );
  }

  const rowsById = new Map(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]),
  );
  const currentMaxPriority = Math.max(
    0,
    ...Array.from(rowsById.values()).map((row) => Number(row.priority_order ?? 0)),
  );

  for (const [index, update] of args.updates.entries()) {
    const { error: stageError } = await args.admin
      .from("user_transformations")
      .update({
        priority_order: currentMaxPriority + index + 1,
        updated_at: args.now,
      })
      .eq("id", update.id)
      .eq("cycle_id", args.cycleId);

    if (stageError) {
      throw new RoadmapActionError(
        500,
        `Failed to stage roadmap normalization: ${stageError.message}`,
      );
    }
  }

  for (const update of args.updates) {
    const row = rowsById.get(update.id);
    if (!row) {
      throw new RoadmapActionError(500, `Missing transformation ${update.id} during normalization`);
    }

    const { error: finalError } = await args.admin
      .from("user_transformations")
      .update({
        priority_order: update.priority_order,
        status: update.status,
        title: row.title ?? null,
        internal_summary: String(row.internal_summary ?? ""),
        user_summary: String(row.user_summary ?? ""),
        success_definition: row.success_definition ?? null,
        main_constraint: row.main_constraint ?? null,
        questionnaire_schema: row.questionnaire_schema ?? null,
        questionnaire_answers: row.questionnaire_answers ?? null,
        completion_summary: row.completion_summary ?? null,
        handoff_payload: row.handoff_payload ?? null,
        updated_at: args.now,
      })
      .eq("id", update.id)
      .eq("cycle_id", args.cycleId);

    if (finalError) {
      throw new RoadmapActionError(
        500,
        `Failed to normalize roadmap: ${finalError.message}`,
      );
    }
  }
}

export async function executeRoadmapAction(
  admin: SupabaseClient,
  userId: string,
  body: RequestBody,
): Promise<RoadmapActionResult> {
  const now = new Date().toISOString();

  // Verify cycle ownership
  const { data: cycle, error: cycleErr } = await admin
    .from("user_cycles")
    .select("id")
    .eq("id", body.cycle_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (cycleErr || !cycle) {
    throw new RoadmapActionError(404, "Cycle not found for this user");
  }

  switch (body.action) {
    case "reorder": {
      const rows = await loadCycleTransformations(admin, body.cycle_id);
      const visible = rows.filter((row) => !HIDDEN_STATUSES.has(row.status));
      const locked = visible.filter((row) => LOCKED_STATUSES.has(row.status));
      const editable = visible.filter((row) => !LOCKED_STATUSES.has(row.status));
      const providedIds = body.ordered_ids.map((id) => id.trim());
      const uniqueProvidedIds = new Set(providedIds);

      if (editable.length === 0) {
        throw new RoadmapActionError(400, "No editable transformations to reorder");
      }
      if (uniqueProvidedIds.size !== providedIds.length) {
        throw new RoadmapActionError(400, "ordered_ids contains duplicate IDs");
      }
      if (providedIds.length !== editable.length) {
        throw new RoadmapActionError(
          400,
          "ordered_ids must include all editable transformations exactly once",
        );
      }

      const editableIds = new Set(editable.map((row) => row.id));
      const hasUnknownId = providedIds.some((id) => !editableIds.has(id));
      if (hasUnknownId) {
        throw new RoadmapActionError(
          400,
          "ordered_ids contains a transformation that cannot be reordered",
        );
      }

      const orderMap = new Map(providedIds.map((id, index) => [id, index]));
      const reorderedEditable = [...editable].sort(
        (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
      );
      const updates = normalizeRoadmapTransformations([
        ...locked,
        ...reorderedEditable,
      ]);
      await persistNormalizedRoadmap({
        admin,
        cycleId: body.cycle_id,
        updates,
        now,
      });
      break;
    }

    case "add": {
      const rows = await loadCycleTransformations(admin, body.cycle_id);
      const maxOrder = rows.reduce(
        (max, row) => Math.max(max, row.priority_order ?? 0),
        0,
      );
      const seed = buildAddedTransformationSeed(body);

      const { error } = await admin
        .from("user_transformations")
        .insert({
          id: crypto.randomUUID(),
          cycle_id: body.cycle_id,
          priority_order: maxOrder + 1,
          status: "pending",
          title: seed.title,
          user_summary: seed.userSummary,
          internal_summary: seed.internalSummary,
          success_definition: null,
          main_constraint: null,
          questionnaire_schema: null,
          questionnaire_answers: null,
          completion_summary: null,
          handoff_payload: {
            onboarding_v2: {
              ordering_rationale: seed.orderingRationale,
              questionnaire_context: seed.questionnaireContext,
              source: "roadmap_review_add",
            },
          },
          created_at: now,
          updated_at: now,
          activated_at: null,
          completed_at: null,
        } as any);
      if (error) {
        throw new RoadmapActionError(
          500,
          `Failed to add transformation: ${error.message}`,
        );
      }

      const refreshedRows = await loadCycleTransformations(admin, body.cycle_id);
      await persistNormalizedRoadmap({
        admin,
        cycleId: body.cycle_id,
        updates: normalizeRoadmapTransformations(refreshedRows),
        now,
      });
      break;
    }

    case "remove": {
      const rows = await loadCycleTransformations(admin, body.cycle_id);
      const visible = rows.filter((row) => !HIDDEN_STATUSES.has(row.status));
      const editable = visible.filter((row) => !LOCKED_STATUSES.has(row.status));
      const target = editable.find((row) => row.id === body.transformation_id);

      if (!target) {
        throw new RoadmapActionError(
          404,
          "Transformation not found or cannot be removed",
        );
      }
      if (editable.length <= 1) {
        throw new RoadmapActionError(
          400,
          "Cannot remove the last editable transformation",
        );
      }

      const { error } = await admin
        .from("user_transformations")
        .update({ status: "cancelled", updated_at: now })
        .eq("id", body.transformation_id)
        .eq("cycle_id", body.cycle_id);
      if (error) {
        throw new RoadmapActionError(
          500,
          `Failed to remove transformation: ${error.message}`,
        );
      }

      await persistNormalizedRoadmap({
        admin,
        cycleId: body.cycle_id,
        updates: normalizeRoadmapTransformations(
          rows.filter((row) => row.id !== body.transformation_id),
        ),
        now,
      });
      break;
    }

    case "rename": {
      const rows = await loadCycleTransformations(admin, body.cycle_id);
      const target = rows.find((row) =>
        row.id === body.transformation_id && !HIDDEN_STATUSES.has(row.status)
      );

      if (!target) {
        throw new RoadmapActionError(404, "Transformation not found");
      }

      const { error } = await admin
        .from("user_transformations")
        .update({ title: body.title, updated_at: now })
        .eq("id", body.transformation_id)
        .eq("cycle_id", body.cycle_id);
      if (error) {
        throw new RoadmapActionError(
          500,
          `Failed to rename transformation: ${error.message}`,
        );
      }
      break;
    }
  }

  // Return the updated list
  const { data: rows, error: fetchErr } = await admin
    .from("user_transformations")
    .select("id, title, priority_order, status, user_summary, handoff_payload")
    .eq("cycle_id", body.cycle_id)
    .neq("status", "cancelled")
    .order("priority_order", { ascending: true });

  if (fetchErr) {
    throw new RoadmapActionError(500, "Failed to fetch updated transformations");
  }

  return {
    success: true,
    updated_transformations: (rows ?? []).map((row: any) => {
      const onboardingV2 = (row.handoff_payload?.onboarding_v2 as
        | Record<string, unknown>
        | undefined) ?? {};
      return {
        id: row.id,
        title: row.title,
        priority_order: row.priority_order,
        status: row.status,
        user_summary: row.user_summary ?? "",
        ordering_rationale:
          typeof onboardingV2.ordering_rationale === "string"
            ? onboardingV2.ordering_rationale
            : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

class RoadmapActionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RoadmapActionError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
//
// IMPORTANT: `Deno.serve(...)` must NEVER run when this file is imported from
// elsewhere (e.g. sophia-brain/agents/roadmap_review.ts imports
// `executeRoadmapAction` from here). Otherwise two `Deno.serve` handlers get
// registered inside the importing worker and requests addressed to the host
// function (e.g. /sophia-brain) can be intercepted by this handler,
// producing bogus "Invalid request body" 400s with this file's Zod schema.
// Gate with `import.meta.main`: true only when this module is the entrypoint.

const httpHandler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const ctx = getRequestContext(req);
  const requestId = ctx.requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        req,
        { error: "Method Not Allowed", request_id: requestId },
        { status: 405 },
      );
    }

    const authHeader = String(
      req.headers.get("Authorization") ?? "",
    ).trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    if (!url || !anonKey || !serviceRoleKey) {
      return serverError(req, requestId, "Server misconfigured");
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }

    const parsed = await parseJsonBody(req, RequestSchema, requestId);
    if (!parsed.ok) return parsed.response;

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await executeRoadmapAction(
      admin,
      authData.user.id,
      parsed.data,
    );

    return jsonResponse(req, { ...result, request_id: requestId });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "update-roadmap-v3",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: {},
    });

    if (error instanceof RoadmapActionError) {
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to update roadmap");
  }
};

if (import.meta.main) {
  Deno.serve(httpHandler);
}
