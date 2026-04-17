import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import {
  loadPhase1GenerationContext,
  mergePhase1Payload,
} from "../_shared/v2-phase1.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
  card_kind: z.enum(["defense", "attack"]),
  card_id: z.string().uuid(),
});

class SelectPhase1LabCardError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SelectPhase1LabCardError";
    this.status = status;
  }
}

export async function selectPhase1LabCard(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
  cardKind: "defense" | "attack";
  cardId: string;
}) {
  const context = await loadPhase1GenerationContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
  });

  const phase1 = context.phase1;
  if (!phase1?.lab) {
    throw new SelectPhase1LabCardError(409, "Phase 1 lab is not prepared yet");
  }

  const candidates = args.cardKind === "defense"
    ? phase1.lab.defense_candidates ?? []
    : phase1.lab.attack_candidates ?? [];
  if (!candidates.some((candidate) => candidate.card_id === args.cardId)) {
    throw new SelectPhase1LabCardError(400, "Selected card is not part of the current phase 1 pack");
  }

  const now = new Date().toISOString();

  if (args.cardKind === "defense") {
    for (const candidate of candidates) {
      const selectionState = candidate.card_id === args.cardId ? "selected" : "not_selected";
      const { data: currentCard, error: loadError } = await args.admin
        .from("user_defense_cards")
        .select("metadata")
        .eq("id", candidate.card_id)
        .maybeSingle();
      if (loadError || !currentCard) {
        throw new SelectPhase1LabCardError(500, "Failed to load defense card metadata", {
          cause: loadError,
        });
      }
      const { error: updateError } = await args.admin
        .from("user_defense_cards")
        .update({
          metadata: {
            ...(((currentCard as { metadata?: Record<string, unknown> }).metadata) ?? {}),
            selection_state: selectionState,
            selected_at: selectionState === "selected" ? now : null,
          },
          last_updated_at: now,
        })
        .eq("id", candidate.card_id);
      if (updateError) {
        throw new SelectPhase1LabCardError(500, `Failed to update defense card: ${updateError.message}`, {
          cause: updateError,
        });
      }
    }
  } else {
    for (const candidate of candidates) {
      const selectionState = candidate.card_id === args.cardId ? "selected" : "not_selected";
      const { data: currentCard, error: loadError } = await args.admin
        .from("user_attack_cards")
        .select("metadata")
        .eq("id", candidate.card_id)
        .maybeSingle();
      if (loadError || !currentCard) {
        throw new SelectPhase1LabCardError(500, "Failed to load attack card metadata", {
          cause: loadError,
        });
      }
      const { error: updateError } = await args.admin
        .from("user_attack_cards")
        .update({
          status: candidate.card_id === args.cardId ? "active" : "archived",
          metadata: {
            ...(((currentCard as { metadata?: Record<string, unknown> }).metadata) ?? {}),
            selection_state: selectionState,
            selected_at: selectionState === "selected" ? now : null,
          },
          last_updated_at: now,
        })
        .eq("id", candidate.card_id);
      if (updateError) {
        throw new SelectPhase1LabCardError(500, `Failed to update attack card: ${updateError.message}`, {
          cause: updateError,
        });
      }
    }
  }

  const nextLab = {
    ...phase1.lab,
    defense_card_id: args.cardKind === "defense" ? args.cardId : phase1.lab.defense_card_id,
    attack_card_id: args.cardKind === "attack" ? args.cardId : phase1.lab.attack_card_id,
    defense_candidates: (phase1.lab.defense_candidates ?? []).map((candidate) => ({
      ...candidate,
      selection_state:
        args.cardKind === "defense"
          ? (candidate.card_id === args.cardId ? "selected" : "not_selected")
          : candidate.selection_state,
    })),
    attack_candidates: (phase1.lab.attack_candidates ?? []).map((candidate) => ({
      ...candidate,
      selection_state:
        args.cardKind === "attack"
          ? (candidate.card_id === args.cardId ? "selected" : "not_selected")
          : candidate.selection_state,
    })),
  };

  const handoffPayload = mergePhase1Payload({
    handoffPayload: context.transformation.handoff_payload,
    lab: nextLab,
    runtime: {
      defense_card_ready:
        args.cardKind === "defense" ? true : phase1.runtime.defense_card_ready,
      attack_card_ready:
        args.cardKind === "attack" ? true : phase1.runtime.attack_card_ready,
    },
    now,
  });

  const { data, error } = await args.admin
    .from("user_transformations")
    .update({
      handoff_payload: handoffPayload,
      updated_at: now,
    })
    .eq("id", args.transformationId)
    .select("handoff_payload")
    .single();

  if (error) {
    throw new SelectPhase1LabCardError(500, `Failed to persist phase 1 selection: ${error.message}`, {
      cause: error,
    });
  }

  return (data as { handoff_payload: Record<string, unknown> }).handoff_payload.phase_1;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(req, { error: "Missing Authorization header", request_id: requestId }, { status: 401 });
    }

    const env = getSupabaseEnv();
    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const phase1 = await selectPhase1LabCard({
      admin,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      cardKind: parsed.data.card_kind,
      cardId: parsed.data.card_id,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      phase_1: phase1,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "select-phase-1-lab-card-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "select-phase-1-lab-card-v1" },
    });

    if (error instanceof SelectPhase1LabCardError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to select phase 1 lab card");
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
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new SelectPhase1LabCardError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
