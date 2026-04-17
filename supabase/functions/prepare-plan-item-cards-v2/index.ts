import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import type { AttackCardContent, UserPlanItemRow } from "../_shared/v2-types.ts";
import { generateDefenseCardForTransformation } from "../generate-defense-card-v3/index.ts";
import { generateAttackCardForTransformation } from "../generate-attack-card-v1/index.ts";
import { generateAttackTechnique } from "../generate-attack-technique-v1/index.ts";

const REQUEST_SCHEMA = z.object({
  plan_item_id: z.string().uuid(),
});

class PreparePlanItemCardsError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PreparePlanItemCardsError";
    this.status = status;
    this.details = details;
  }
}

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment for prepare-plan-item-cards-v2");
  }
  return { url, anonKey, serviceRoleKey };
}

function cardsRequiredForItem(item: UserPlanItemRow): boolean {
  return item.dimension === "missions" || item.dimension === "habits";
}

function planItemDimensionLabel(dimension: UserPlanItemRow["dimension"]): string {
  if (dimension === "habits") return "Habitude";
  if (dimension === "missions") return "Mission";
  if (dimension === "clarifications") return "Clarification";
  return "Support";
}

function summarizePhaseItemForAttackContext(value: {
  title: string;
  description: string | null;
  dimension: UserPlanItemRow["dimension"];
}): string {
  const description = String(value.description ?? "").trim();
  return `${planItemDimensionLabel(value.dimension)}: ${value.title}${description ? ` — ${description}` : ""}`;
}

async function buildActionContext(
  admin: SupabaseClient,
  userId: string,
  item: UserPlanItemRow,
) {
  const itemDescription = String(item.description ?? "").trim() || null;
  const activationHint = item.dimension === "habits"
    ? "Installer cette habitude concrètement dans le quotidien sans attendre une motivation parfaite."
    : "Passer à l'action sur cette mission au bon moment, sans contourner ni remettre à plus tard.";
  let phaseItemsSummary: string[] | null = null;

  if (item.phase_id) {
    const { data: siblingItems, error } = await admin
      .from("user_plan_items")
      .select("id, title, description, dimension")
      .eq("user_id", userId)
      .eq("transformation_id", item.transformation_id)
      .eq("phase_id", item.phase_id)
      .order("activation_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;

    phaseItemsSummary = ((siblingItems as Array<Record<string, unknown>> | null) ?? [])
      .filter((candidate) => String(candidate.id ?? "") !== item.id)
      .flatMap((candidate) => {
        const title = String(candidate.title ?? "").trim();
        const description = typeof candidate.description === "string"
          ? candidate.description.trim()
          : null;
        const dimension = candidate.dimension as UserPlanItemRow["dimension"] | undefined;
        if (!title || !dimension) return [];
        return [summarizePhaseItemForAttackContext({ title, description, dimension })];
      });
  }

  return {
    phase_label: item.phase_order != null ? `Etape ${item.phase_order}` : null,
    item_title: item.title,
    item_description: itemDescription,
    item_kind: item.dimension === "habits" ? "habitude" : "mission",
    time_of_day: item.time_of_day ?? null,
    cadence_label: item.cadence_label ?? null,
    activation_hint: itemDescription ?? activationHint,
    phase_items_summary: phaseItemsSummary,
  };
}

function pickAttackTechniqueKey(
  item: UserPlanItemRow,
): NonNullable<AttackCardContent["techniques"][number]["technique_key"]> {
  const haystack = [
    item.title,
    item.description ?? "",
    item.time_of_day ?? "",
    item.cadence_label ?? "",
  ].join(" ").toLowerCase();

  if (item.time_of_day === "morning") return "visualisation_matinale";
  if (
    /prepar|organis|mettre en place|sortir|poser|installer|terrain|veille|ranger|tri|nettoy|placard|bureau|frigo|cuisine|environnement|snack/.test(
      haystack,
    )
  ) {
    return "preparer_terrain";
  }
  if (/penser|oubl|rappel|voir|signal|repere/.test(haystack)) {
    return "ancre_visuelle";
  }
  if (/peur|appr[ée]hension|oser|verdict|balance|honte/.test(haystack)) {
    return "texte_recadrage";
  }
  return item.dimension === "habits" ? "preparer_terrain" : "ancre_visuelle";
}

function buildAutomaticAttackAnswers(item: UserPlanItemRow): string[] {
  const actionLine = `Action cible: ${item.title}${item.description ? ` - ${item.description}` : ""}`;
  const frictionLine = item.dimension === "habits"
    ? "Friction probable: je risque de repousser, oublier ou casser la repetition de cette habitude quand le moment arrive."
    : "Friction probable: je risque d'eviter cette mission, de la remettre a plus tard, ou de la juger trop lourde avant meme de commencer.";
  const anchorLine = item.phase_order != null
    ? `Ce que cette action protege: le bon demarrage de l'etape ${item.phase_order} du plan et la preuve que j'avance concretement.`
    : "Ce que cette action protege: une avance concrete sur mon plan, ici et maintenant.";
  return [actionLine, frictionLine, anchorLine];
}

async function loadPlanItem(
  admin: SupabaseClient,
  userId: string,
  planItemId: string,
): Promise<UserPlanItemRow> {
  const { data, error } = await admin
    .from("user_plan_items")
    .select("*")
    .eq("id", planItemId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new PreparePlanItemCardsError(500, "Failed to load V2 plan item", undefined, {
      cause: error,
    });
  }
  if (!data) {
    throw new PreparePlanItemCardsError(404, "Plan item not found");
  }

  return data as UserPlanItemRow;
}

export async function preparePlanItemCardsV2(args: {
  admin: SupabaseClient;
  userId: string;
  planItemId: string;
  requestId: string;
}): Promise<UserPlanItemRow> {
  const item = await loadPlanItem(args.admin, args.userId, args.planItemId);

  if (!cardsRequiredForItem(item)) {
    throw new PreparePlanItemCardsError(
      409,
      "Cet élément n'a pas besoin de cartes d'action.",
      { dimension: item.dimension },
    );
  }

  if (item.status === "pending") {
    throw new PreparePlanItemCardsError(
      409,
      "Cet élément se débloque automatiquement dès que ses prérequis sont validés.",
      { current_status: item.status },
    );
  }

  if (item.status === "deactivated" || item.status === "cancelled") {
    throw new PreparePlanItemCardsError(
      409,
      "Impossible de préparer des cartes pour un élément retiré du plan.",
      { current_status: item.status },
    );
  }

  if (
    item.cards_status === "ready" &&
    item.defense_card_id &&
    item.attack_card_id
  ) {
    return item;
  }

  const now = new Date().toISOString();
  const actionContext = await buildActionContext(args.admin, args.userId, item);

  const { error: markGeneratingError } = await args.admin
    .from("user_plan_items")
    .update({
      cards_status: "generating",
      updated_at: now,
    })
    .eq("id", item.id)
    .eq("user_id", args.userId);
  if (markGeneratingError) {
    throw new PreparePlanItemCardsError(500, "Failed to mark cards as generating", undefined, {
      cause: markGeneratingError,
    });
  }

  try {
    const defense = await generateDefenseCardForTransformation({
      admin: args.admin,
      userId: args.userId,
      defenseCardId: item.defense_card_id ?? null,
      transformationId: item.transformation_id,
      scopeKind: "transformation",
      planItemId: item.id,
      phaseId: item.phase_id ?? null,
      actionContext,
      requestId: `${args.requestId}:defense`,
      forceRegenerate: false,
    });

    const attack = await generateAttackCardForTransformation({
      admin: args.admin,
      userId: args.userId,
      attackCardId: item.attack_card_id ?? null,
      transformationId: item.transformation_id,
      scopeKind: "transformation",
      planItemId: item.id,
      phaseId: item.phase_id ?? null,
      actionContext,
      requestId: `${args.requestId}:attack`,
      forceRegenerate: false,
    });

    await generateAttackTechnique({
      admin: args.admin,
      userId: args.userId,
      attackCardId: attack.card_id,
      techniqueKey: pickAttackTechniqueKey(item),
      answers: buildAutomaticAttackAnswers(item),
      requestId: `${args.requestId}:attack-technique`,
    });

    const { data: updated, error: updateError } = await args.admin
      .from("user_plan_items")
      .update({
        defense_card_id: defense.card_id,
        attack_card_id: attack.card_id,
        cards_status: "ready",
        cards_generated_at: now,
        updated_at: now,
      })
      .eq("id", item.id)
      .eq("user_id", args.userId)
      .select("*")
      .single();
    if (updateError) {
      throw new PreparePlanItemCardsError(500, "Failed to link generated cards", undefined, {
        cause: updateError,
      });
    }

    return updated as UserPlanItemRow;
  } catch (error) {
    await args.admin
      .from("user_plan_items")
      .update({
        cards_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", args.userId);
    throw error;
  }
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

    const parsedBody = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsedBody.ok) return parsedBody.response;

    const env = getSupabaseEnv();
    const authHeader = String(
      req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "",
    ).trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const userClient = createClient(env.url, env.anonKey, {
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

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const item = await preparePlanItemCardsV2({
      admin,
      userId: authData.user.id,
      planItemId: parsedBody.data.plan_item_id,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      plan_item: item,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "prepare-plan-item-cards-v2",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "prepare-plan-item-cards-v2" },
    });

    if (error instanceof PreparePlanItemCardsError) {
      return jsonResponse(
        req,
        {
          error: error.message,
          details: error.details ?? null,
          request_id: requestId,
        },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to prepare plan item cards");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
