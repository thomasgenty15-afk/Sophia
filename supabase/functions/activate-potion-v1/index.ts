import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { schedulePotionFollowUpForSession } from "../_shared/potion-follow-up.ts";
import {
  buildPotionActivationPrompt,
  getPotionDefinition,
  POTION_SYSTEM_PROMPT,
  validatePotionActivationOutput,
  validatePotionAnswers,
} from "../_shared/v2-potions.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { loadLabScopeContext } from "../_shared/v2-lab-context.ts";
import { loadPotionBaseContext } from "../_shared/potion-base-context.ts";
import type {
  LabScopeKind,
  PotionScopeSelection,
  PotionType,
  UserPotionSessionRow,
} from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid().nullable().optional(),
  scope_kind: z.enum(["transformation", "out_of_plan"]).optional(),
  potion_type: z.enum([
    "rappel",
    "courage",
    "guerison",
    "clarte",
    "amour",
    "apaisement",
  ]),
  answers: z.record(z.string()).default({}),
  free_text: z.string().nullable().optional(),
  potion_scope: z.object({
    scope_kind: z.enum(["plan_linked", "out_of_plan"]),
    target_plan_item_id: z.string().uuid().nullable().optional(),
    target_scope: z.enum(["plan_item", "whole_plan", "unknown"]).nullable()
      .optional(),
    target_label: z.string().max(240).nullable().optional(),
  }).nullable().optional(),
  rappel_scope: z.object({
    scope_kind: z.enum(["plan_linked", "out_of_plan"]),
    target_plan_item_id: z.string().uuid().nullable().optional(),
    target_scope: z.enum(["plan_item", "whole_plan", "unknown"]).nullable()
      .optional(),
    target_label: z.string().max(240).nullable().optional(),
  }).nullable().optional(),
});

class ActivatePotionError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ActivatePotionError";
    this.status = status;
  }
}

type RappelBindingResolution = {
  potion_scope: PotionScopeSelection | null;
  activation_scope_kind: LabScopeKind | null;
  transformation_id: string | null;
  target_plan_item_id: string | null;
  target_binding: {
    kind: "none" | "transformation" | "plan_item";
    target_scope: "plan_item" | "whole_plan" | "unknown" | null;
    target_plan_item_id: string | null;
    label: string | null;
    binding_policy: "none" | "snapshot" | "live_action";
    lifecycle_policy: "independent" | "while_target_active";
  } | null;
};

function normalizeRappelScope(
  potionType: PotionType,
  raw: PotionScopeSelection | null,
): PotionScopeSelection | null {
  if (
    potionType !== "rappel" && potionType !== "courage" &&
    potionType !== "amour" && potionType !== "apaisement"
  ) return null;
  if (!raw) {
    return {
      scope_kind: "out_of_plan",
      target_scope: null,
      target_plan_item_id: null,
      target_label: null,
    };
  }
  if (raw.scope_kind === "out_of_plan") {
    return {
      scope_kind: "out_of_plan",
      target_scope: null,
      target_plan_item_id: null,
      target_label: raw.target_label ?? null,
    };
  }
  const targetScope = raw.target_scope ??
    (raw.target_plan_item_id ? "plan_item" : "unknown");
  return {
    scope_kind: "plan_linked",
    target_scope: targetScope,
    target_plan_item_id: targetScope === "plan_item"
      ? raw.target_plan_item_id ?? null
      : null,
    target_label: raw.target_label ?? null,
  };
}

async function resolveRappelBinding(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string | null;
  potionType: PotionType;
  potionScope: PotionScopeSelection | null;
}): Promise<RappelBindingResolution> {
  const scope = normalizeRappelScope(args.potionType, args.potionScope);
  if (!scope) {
    return {
      potion_scope: null,
      activation_scope_kind: null,
      transformation_id: null,
      target_plan_item_id: null,
      target_binding: null,
    };
  }
  if (scope.scope_kind === "out_of_plan") {
    return {
      potion_scope: scope,
      activation_scope_kind: "out_of_plan",
      transformation_id: null,
      target_plan_item_id: null,
      target_binding: {
        kind: "none",
        target_scope: null,
        target_plan_item_id: null,
        label: scope.target_label ?? null,
        binding_policy: "none",
        lifecycle_policy: "independent",
      },
    };
  }

  if (scope.target_scope === "plan_item") {
    const targetPlanItemId = String(scope.target_plan_item_id ?? "").trim();
    if (!targetPlanItemId) {
      throw new ActivatePotionError(
        400,
        "target_plan_item_id is required for plan-linked potion scope",
      );
    }
    const { data, error } = await args.admin
      .from("user_plan_items")
      .select("id, transformation_id, title, status")
      .eq("user_id", args.userId)
      .eq("id", targetPlanItemId)
      .maybeSingle();
    if (error) {
      throw new ActivatePotionError(
        500,
        `Plan item fetch failed: ${error.message}`,
        {
          cause: error,
        },
      );
    }
    if (!data) {
      throw new ActivatePotionError(400, "Plan item not found for this user");
    }
    const status = String((data as Record<string, unknown>).status ?? "");
    if (status !== "active" && status !== "in_maintenance") {
      throw new ActivatePotionError(
        400,
        "Plan-linked potion target must be an active plan item",
      );
    }
    const transformationId = String(
      (data as Record<string, unknown>).transformation_id ?? "",
    ).trim() || args.transformationId;
    const label =
      String((data as Record<string, unknown>).title ?? "").trim() ||
      scope.target_label || null;
    const normalizedScope = {
      ...scope,
      target_plan_item_id: targetPlanItemId,
      target_label: label,
    };
    return {
      potion_scope: normalizedScope,
      activation_scope_kind: "transformation",
      transformation_id: transformationId,
      target_plan_item_id: targetPlanItemId,
      target_binding: {
        kind: "plan_item",
        target_scope: "plan_item",
        target_plan_item_id: targetPlanItemId,
        label,
        binding_policy: "live_action",
        lifecycle_policy: "while_target_active",
      },
    };
  }

  if (!args.transformationId) {
    throw new ActivatePotionError(
      400,
      "transformation_id is required for plan-linked potion scope",
    );
  }

  return {
    potion_scope: scope,
    activation_scope_kind: "transformation",
    transformation_id: args.transformationId,
    target_plan_item_id: null,
    target_binding: {
      kind: "transformation",
      target_scope: scope.target_scope === "whole_plan"
        ? "whole_plan"
        : "unknown",
      target_plan_item_id: null,
      label: scope.target_scope === "whole_plan"
        ? scope.target_label ?? "Tout mon plan / mon cap general"
        : scope.target_label ?? null,
      binding_policy: "snapshot",
      lifecycle_policy: "independent",
    },
  };
}

async function activatePotion(args: {
  userId: string;
  transformationId: string | null;
  scopeKind: LabScopeKind;
  potionType: PotionType;
  answers: Record<string, string>;
  freeText: string | null;
  potionScope?: PotionScopeSelection | null;
  requestId?: string;
}): Promise<{ session: UserPotionSessionRow; scheduledCount: number }> {
  const env = getSupabaseEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rappelBinding = await resolveRappelBinding({
    admin,
    userId: args.userId,
    transformationId: args.transformationId,
    potionType: args.potionType,
    potionScope: args.potionScope ?? null,
  });
  const effectiveScopeKind = rappelBinding.activation_scope_kind ??
    args.scopeKind;
  const effectiveTransformationId = rappelBinding.transformation_id ??
    args.transformationId;

  const context = await loadLabScopeContext({
    admin,
    userId: args.userId,
    transformationId: effectiveTransformationId,
    scopeKind: effectiveScopeKind,
  });
  const baseContext = await loadPotionBaseContext({
    admin,
    userId: args.userId,
    potionType: args.potionType,
    transformationId: effectiveTransformationId,
    scopeKind: effectiveScopeKind,
    relatedPlanItemId: rappelBinding.target_plan_item_id,
  });
  const definition = getPotionDefinition(args.potionType);
  const issues = validatePotionAnswers(definition, args.answers, args.freeText);
  if (issues.length > 0) {
    throw new ActivatePotionError(
      400,
      `Invalid potion activation: ${issues.join(", ")}`,
    );
  }

  const raw = await generateWithGemini(
    POTION_SYSTEM_PROMPT,
    buildPotionActivationPrompt({
      context,
      baseContext,
      definition,
      answers: args.answers,
      freeText: args.freeText,
      potionScope: rappelBinding.potion_scope,
      targetBinding: rappelBinding.target_binding,
    }),
    0.45,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "activate-potion-v1",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new ActivatePotionError(
      500,
      "LLM returned tool call instead of JSON",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim(),
    );
  } catch (error) {
    throw new ActivatePotionError(500, "LLM returned invalid JSON", {
      cause: error,
    });
  }

  const validation = validatePotionActivationOutput(parsed);
  if (!validation.valid || !validation.content) {
    throw new ActivatePotionError(
      500,
      `Validation failed: ${validation.issues.join(", ")}`,
    );
  }

  const now = new Date().toISOString();
  const row = {
    user_id: args.userId,
    cycle_id: context.cycle_id,
    scope_kind: context.scope_kind,
    transformation_id: context.transformation_id,
    phase_id: null,
    potion_type: args.potionType,
    source: "manual",
    status: "completed",
    questionnaire_schema: definition.questionnaire,
    questionnaire_answers: args.answers,
    free_text: args.freeText?.trim() || null,
    content: validation.content,
    follow_up_strategy: definition.default_follow_up_strategy,
    metadata: {
      classification_type_key: context.classification?.type_key ?? null,
      potion_title: definition.title,
      ...(rappelBinding.potion_scope
        ? {
          potion_scope: rappelBinding.potion_scope,
          ...(args.potionType === "rappel"
            ? { rappel_scope: rappelBinding.potion_scope }
            : {}),
          target_binding: rappelBinding.target_binding,
        }
        : {}),
    },
    generated_at: now,
    last_updated_at: now,
  };

  const { data, error } = await admin
    .from("user_potion_sessions")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    throw new ActivatePotionError(500, `Insert failed: ${error.message}`, {
      cause: error,
    });
  }

  const scheduled = await schedulePotionFollowUpForSession({
    admin,
    userId: args.userId,
    sessionId: String((data as UserPotionSessionRow).id),
    localTimeHHMM: "09:00",
    durationDays: 7,
  });

  return scheduled;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        req,
        { error: "Method Not Allowed", request_id: requestId },
        { status: 405 },
      );
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const env = getSupabaseEnv();
    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth
      .getUser();
    if (authError || !authData?.user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }

    const result = await activatePotion({
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id ?? null,
      scopeKind: parsed.data.scope_kind ?? "transformation",
      potionType: parsed.data.potion_type,
      answers: parsed.data.answers ?? {},
      freeText: parsed.data.free_text ?? null,
      potionScope: parsed.data.potion_scope ?? parsed.data.rappel_scope ?? null,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      potion_type: parsed.data.potion_type,
      session: result.session,
      scheduled_count: result.scheduledCount,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "activate-potion-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "activate-potion-v1" },
    });

    if (error instanceof ActivatePotionError) {
      if (error.status === 400) {
        return badRequest(req, requestId, error.message);
      }
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to activate potion");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
    .trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new ActivatePotionError(
      500,
      "Supabase environment variables are not configured",
    );
  }
  return { url, anonKey, serviceRoleKey };
}
