import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import {
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import type {
  DefenseCardContent,
  DominantImpulse,
  ImpulseTrigger,
  LabScopeKind,
} from "../_shared/v2-types.ts";
import { reviewAndEnrichDefenseCard } from "../_shared/v2-defense-card-enrichment.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TriggerDraftSchema = z.object({
  situation: z.string().min(1).max(500),
  signal: z.string().min(1).max(500),
  defense_response: z.string().min(1).max(500),
  plan_b: z.string().min(1).max(500).optional(),
});

const AddTriggerPayload = z.object({
  action: z.literal("add_trigger"),
  defense_card_id: z.string().uuid(),
  impulse_id: z.string().min(1).optional(),
  label_hint: z.string().min(1).max(200).optional(),
  situation: z.string().min(1).max(500),
  signal: z.string().min(1).max(500),
  defense_response: z.string().min(1).max(500),
  plan_b: z.string().min(1).max(500).optional(),
});

const UpdateCardPayload = z.object({
  action: z.literal("update_card"),
  defense_card_id: z.string().uuid(),
  impulse_id: z.string().min(1),
  trigger_id: z.string().min(1),
  situation: z.string().min(1).max(500),
  signal: z.string().min(1).max(500),
  defense_response: z.string().min(1).max(500),
  generic_defense: z.string().min(1).max(500),
  plan_b: z.string().min(1).max(500).optional(),
});

const UpdateTriggerPayload = z.object({
  action: z.literal("update_trigger"),
  defense_card_id: z.string().uuid(),
  impulse_id: z.string().min(1),
  trigger_id: z.string().min(1),
  situation: z.string().max(500).optional(),
  signal: z.string().max(500).optional(),
  defense_response: z.string().max(500).optional(),
  plan_b: z.string().max(500).optional(),
});

const RemoveTriggerPayload = z.object({
  action: z.literal("remove_trigger"),
  defense_card_id: z.string().uuid(),
  impulse_id: z.string().min(1),
  trigger_id: z.string().min(1),
});

const AddImpulsePayload = z.object({
  action: z.literal("add_impulse"),
  defense_card_id: z.string().uuid(),
  label: z.string().min(1).max(200),
  generic_defense: z.string().min(1).max(500),
  triggers: z.array(TriggerDraftSchema).min(1).max(6),
});

const CreateCardWithImpulsePayload = z.object({
  action: z.literal("create_card_with_impulse"),
  cycle_id: z.string().uuid(),
  scope_kind: z.enum(["transformation", "out_of_plan"]),
  transformation_id: z.string().uuid().optional(),
  label: z.string().min(1).max(200),
  generic_defense: z.string().min(1).max(500),
  triggers: z.array(TriggerDraftSchema).min(1).max(6),
});

const UpdateDefensePayload = z.object({
  action: z.literal("update_defense"),
  defense_card_id: z.string().uuid(),
  impulse_id: z.string().min(1),
  generic_defense: z.string().min(1).max(500),
});

const RequestSchema = z.discriminatedUnion("action", [
  AddTriggerPayload,
  UpdateCardPayload,
  UpdateTriggerPayload,
  RemoveTriggerPayload,
  AddImpulsePayload,
  CreateCardWithImpulsePayload,
  UpdateDefensePayload,
]);

type RequestBody = z.infer<typeof RequestSchema>;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

class DefenseCardActionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DefenseCardActionError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Core logic — exported for use by sophia-brain
// ---------------------------------------------------------------------------

export type DefenseCardActionResult = {
  success: boolean;
  updated_card: DefenseCardContent;
};

async function loadCard(
  admin: SupabaseClient,
  cardId: string,
): Promise<{
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  content: DefenseCardContent;
}> {
  const { data, error } = await admin
    .from("user_defense_cards")
    .select("id, user_id, cycle_id, scope_kind, transformation_id, content")
    .eq("id", cardId)
    .maybeSingle();

  if (error) throw new DefenseCardActionError(500, `DB error: ${error.message}`);
  if (!data) throw new DefenseCardActionError(404, "Defense card not found");

  return {
    id: data.id,
    user_id: data.user_id,
    cycle_id: data.cycle_id,
    scope_kind: data.scope_kind,
    transformation_id: data.transformation_id,
    content: data.content as DefenseCardContent,
  };
}

async function resolveScopeForNewCard(
  admin: SupabaseClient,
  userId: string,
  args: {
    cycleId: string;
    scopeKind: LabScopeKind;
    transformationId?: string;
  },
): Promise<{
  cycleId: string;
  scopeKind: LabScopeKind;
  transformationId: string | null;
}> {
  if (args.scopeKind === "out_of_plan") {
    const { data, error } = await admin
      .from("user_cycles")
      .select("id")
      .eq("id", args.cycleId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new DefenseCardActionError(500, `DB error: ${error.message}`);
    if (!data) throw new DefenseCardActionError(404, "Cycle not found");

    return {
      cycleId: String((data as any).id),
      scopeKind: "out_of_plan",
      transformationId: null,
    };
  }

  const transformationId = String(args.transformationId ?? "").trim();
  if (!transformationId) {
    throw new DefenseCardActionError(400, "transformation_id is required");
  }

  const { data, error } = await admin
    .from("user_transformations")
    .select("id, cycle_id")
    .eq("id", transformationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new DefenseCardActionError(500, `DB error: ${error.message}`);
  if (!data) throw new DefenseCardActionError(404, "Transformation not found");
  if (String((data as any).cycle_id) !== args.cycleId) {
    throw new DefenseCardActionError(400, "Transformation does not belong to the provided cycle");
  }

  return {
    cycleId: String((data as any).cycle_id),
    scopeKind: "transformation",
    transformationId: String((data as any).id),
  };
}

async function loadOrCreateFreeCard(
  admin: SupabaseClient,
  userId: string,
  args: {
    cycleId: string;
    scopeKind: LabScopeKind;
    transformationId?: string;
  },
): Promise<{
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  content: DefenseCardContent;
}> {
  const scope = await resolveScopeForNewCard(admin, userId, args);
  let query = admin
    .from("user_defense_cards")
    .select("id, user_id, cycle_id, scope_kind, transformation_id, content")
    .eq("user_id", userId)
    .eq("cycle_id", scope.cycleId)
    .eq("scope_kind", scope.scopeKind)
    .is("plan_item_id", null)
    .order("generated_at", { ascending: false })
    .limit(1);

  query = scope.scopeKind === "transformation"
    ? query.eq("transformation_id", scope.transformationId)
    : query.is("transformation_id", null);

  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) throw new DefenseCardActionError(500, `DB error: ${existingError.message}`);
  if (existing) {
    return {
      id: String((existing as any).id),
      user_id: String((existing as any).user_id),
      cycle_id: String((existing as any).cycle_id),
      scope_kind: (existing as any).scope_kind as LabScopeKind,
      transformation_id: ((existing as any).transformation_id as string | null) ?? null,
      content: ((existing as any).content as DefenseCardContent) ?? { impulses: [] },
    };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await admin
    .from("user_defense_cards")
    .insert({
      user_id: userId,
      cycle_id: scope.cycleId,
      scope_kind: scope.scopeKind,
      transformation_id: scope.transformationId,
      plan_item_id: null,
      phase_id: null,
      source: "manual",
      status: "active",
      content: { impulses: [] },
      metadata: {},
      generated_at: now,
      last_updated_at: now,
    })
    .select("id, user_id, cycle_id, scope_kind, transformation_id, content")
    .single();

  if (insertError) {
    throw new DefenseCardActionError(500, `Insert failed: ${insertError.message}`);
  }

  return {
    id: String((inserted as any).id),
    user_id: String((inserted as any).user_id),
    cycle_id: String((inserted as any).cycle_id),
    scope_kind: (inserted as any).scope_kind as LabScopeKind,
    transformation_id: ((inserted as any).transformation_id as string | null) ?? null,
    content: ((inserted as any).content as DefenseCardContent) ?? { impulses: [] },
  };
}

async function loadCardScopeSummary(
  admin: SupabaseClient,
  args: {
    cycleId: string;
    scopeKind: LabScopeKind;
    transformationId: string | null;
  },
) {
  if (args.scopeKind === "out_of_plan" || !args.transformationId) {
    const { data: transformations } = await admin
      .from("user_transformations")
      .select("title, user_summary, status")
      .eq("cycle_id", args.cycleId)
      .order("priority_order", { ascending: true });

    const visible = ((transformations ?? []) as any[]).filter((row) =>
      row.status !== "abandoned" && row.status !== "cancelled" && row.status !== "archived"
    );

    return {
      transformation_title: "Hors transformations",
      transformation_summary: visible
        .map((row) => String(row.user_summary ?? "").trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(" ") || "Contexte general hors transformation.",
    };
  }

  const { data } = await admin
    .from("user_transformations")
    .select("title, user_summary")
    .eq("id", args.transformationId)
    .maybeSingle();

  return {
    transformation_title: String((data as any)?.title ?? "").trim() || null,
    transformation_summary: String((data as any)?.user_summary ?? "").trim() || null,
  };
}

function findImpulse(impulses: DominantImpulse[], impulseId: string): DominantImpulse {
  const impulse = impulses.find((i) => i.impulse_id === impulseId);
  if (!impulse) throw new DefenseCardActionError(404, `Impulse ${impulseId} not found`);
  return impulse;
}

function nextTriggerIndex(impulse: DominantImpulse): number {
  const prefix = `trigger-${impulse.impulse_id.replace("impulse-", "")}-`;
  const max = impulse.triggers.reduce((currentMax, trigger) => {
    const raw = String(trigger.trigger_id ?? "");
    if (!raw.startsWith(prefix)) return currentMax;
    const parsed = Number.parseInt(raw.slice(prefix.length), 10);
    return Number.isFinite(parsed) ? Math.max(currentMax, parsed) : currentMax;
  }, 0);
  return max + 1;
}

function pickImplicitImpulse(content: DefenseCardContent): DominantImpulse {
  const existingCatchAll = content.impulses.find((impulse) =>
    String(impulse.label ?? "").trim().toLowerCase() === "situations en plus"
  );
  if (existingCatchAll) return existingCatchAll;

  if (content.impulses.length < 3) {
    const nextImpulseIndex = content.impulses.length + 1;
    const created: DominantImpulse = {
      impulse_id: `impulse-${nextImpulseIndex}`,
      label: "Situations en plus",
      generic_defense: "Pause, respire, note ce qui se passe, puis choisis le plus petit geste qui coupe l'automatisme.",
      triggers: [],
    };
    content.impulses.push(created);
    return created;
  }

  return [...content.impulses].sort((a, b) => a.triggers.length - b.triggers.length)[0];
}

export async function executeDefenseCardAction(
  admin: SupabaseClient,
  userId: string,
  body: RequestBody,
): Promise<DefenseCardActionResult> {
  const card = body.action === "create_card_with_impulse"
    ? await loadOrCreateFreeCard(admin, userId, {
      cycleId: body.cycle_id,
      scopeKind: body.scope_kind,
      transformationId: body.transformation_id,
    })
    : await loadCard(admin, body.defense_card_id);

  if (card.user_id !== userId) {
    throw new DefenseCardActionError(403, "Not authorized to modify this card");
  }

  const content: DefenseCardContent = JSON.parse(JSON.stringify(card.content));
  const transformationSummary = await loadCardScopeSummary(admin, {
    cycleId: card.cycle_id,
    scopeKind: card.scope_kind,
    transformationId: card.transformation_id,
  });
  const now = new Date().toISOString();

  switch (body.action) {
    case "add_trigger": {
      const impulse = body.impulse_id
        ? findImpulse(content.impulses, body.impulse_id)
        : pickImplicitImpulse(content);
      const nextIndex = nextTriggerIndex(impulse);
      impulse.triggers.push({
        trigger_id: `trigger-${impulse.impulse_id.replace("impulse-", "")}-${nextIndex}`,
        label: body.label_hint?.trim() || undefined,
        situation: body.situation,
        signal: body.signal,
        defense_response: body.defense_response,
        plan_b: body.plan_b?.trim() || impulse.generic_defense,
      });
      break;
    }

    case "update_card": {
      const impulse = findImpulse(content.impulses, body.impulse_id);
      const trigger = impulse.triggers.find((t) => t.trigger_id === body.trigger_id);
      if (!trigger) throw new DefenseCardActionError(404, `Trigger ${body.trigger_id} not found`);
      trigger.situation = body.situation;
      trigger.signal = body.signal;
      trigger.defense_response = body.defense_response;
      trigger.plan_b = body.plan_b?.trim() || body.generic_defense;
      impulse.generic_defense = body.generic_defense;
      break;
    }

    case "update_trigger": {
      const impulse = findImpulse(content.impulses, body.impulse_id);
      const trigger = impulse.triggers.find((t) => t.trigger_id === body.trigger_id);
      if (!trigger) throw new DefenseCardActionError(404, `Trigger ${body.trigger_id} not found`);
      if (body.situation) trigger.situation = body.situation;
      if (body.signal) trigger.signal = body.signal;
      if (body.defense_response) trigger.defense_response = body.defense_response;
      if (body.plan_b) trigger.plan_b = body.plan_b;
      break;
    }

    case "remove_trigger": {
      const impulse = findImpulse(content.impulses, body.impulse_id);
      const idx = impulse.triggers.findIndex((t) => t.trigger_id === body.trigger_id);
      if (idx === -1) throw new DefenseCardActionError(404, `Trigger ${body.trigger_id} not found`);
      if (impulse.triggers.length <= 1) {
        content.impulses = content.impulses.filter((item) => item.impulse_id !== body.impulse_id);
        break;
      }
      impulse.triggers.splice(idx, 1);
      break;
    }

    case "add_impulse":
    case "create_card_with_impulse": {
      if (content.impulses.length >= 3) {
        throw new DefenseCardActionError(400, "Maximum 3 impulses allowed");
      }
      const nextImpulseIndex = content.impulses.length + 1;
      const newImpulse: DominantImpulse = {
        impulse_id: `impulse-${nextImpulseIndex}`,
        label: body.label,
        generic_defense: body.generic_defense,
        triggers: body.triggers.map((t, i) => ({
          trigger_id: `trigger-${nextImpulseIndex}-${i + 1}`,
          situation: t.situation,
          signal: t.signal,
          defense_response: t.defense_response,
          plan_b: t.plan_b?.trim() || body.generic_defense,
        })),
      };
      content.impulses.push(newImpulse);
      break;
    }

    case "update_defense": {
      const impulse = findImpulse(content.impulses, body.impulse_id);
      impulse.generic_defense = body.generic_defense;
      break;
    }
  }

  const enrichedContent = content.impulses.length > 0
    ? await reviewAndEnrichDefenseCard(content, {
      transformation_title: transformationSummary.transformation_title,
      transformation_summary: transformationSummary.transformation_summary,
    })
    : content;

  const { error: updateError } = await admin
    .from("user_defense_cards")
    .update({ content: enrichedContent, last_updated_at: now })
    .eq("id", card.id);

  if (updateError) {
    throw new DefenseCardActionError(500, `Update failed: ${updateError.message}`);
  }

  return { success: true, updated_card: enrichedContent };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const ctx = getRequestContext(req);
  const requestId = ctx.requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
    }

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(req, { error: "Missing Authorization header", request_id: requestId }, { status: 401 });
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
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const parsed = await parseJsonBody(req, RequestSchema, requestId);
    if (!parsed.ok) return parsed.response;

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await executeDefenseCardAction(admin, authData.user.id, parsed.data);

    return jsonResponse(req, { ...result, request_id: requestId });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "update-defense-card-v3",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: {},
    });

    if (error instanceof DefenseCardActionError) {
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to update defense card");
  }
});
