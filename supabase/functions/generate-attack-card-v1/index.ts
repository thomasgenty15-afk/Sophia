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
import { loadLabScopeContext } from "../_shared/v2-lab-context.ts";
import type { AttackCardContent, LabScopeKind } from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  attack_card_id: z.string().uuid().optional(),
  transformation_id: z.string().uuid().optional(),
  scope_kind: z.enum(["transformation", "out_of_plan"]).optional(),
  force_regenerate: z.boolean().optional(),
});

class GenerateAttackCardError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerateAttackCardError";
    this.status = status;
  }
}

function buildBaseAttackCardContent(args: {
  transformationTitle: string;
  scopeKind: LabScopeKind;
}): AttackCardContent {
  const summary = args.scopeKind === "out_of_plan"
    ? "Choisis la technique qui t'aidera le mieux a prendre de l'avance, puis suis son mini-parcours pour generer un objet concret."
    : `Pour ${args.transformationTitle}, choisis la technique qui t'aidera le mieux a prendre de l'avance, puis suis son mini-parcours.`;

  return {
    summary,
    techniques: [
      {
        technique_key: "texte_recadrage",
        title: "Le texte magique",
        pour_quoi: "Faire disparaitre le combat interieur quand tu commences a te trouver des excuses ou a negocier avec toi-meme.",
        objet_genere: "Un texte a ecrire jusqu'a ce que le combat baisse et que l'action redevienne evidente.",
        questions: [
          "Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?",
          "Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?",
          "Dans quel etat tu veux te remettre en ecrivant ce texte ?",
        ],
        mode_emploi: "Ecris-le au moment ou tu sens la resistance monter, jusqu'a ce que ce soit moins un combat.",
        generated_result: null,
      },
      {
        technique_key: "mantra_force",
        title: "Mantra de force",
        pour_quoi: "Installer doucement plus de force interieure face a ce que tu as a faire, au lieu d'attendre d'etre fort sur le moment.",
        objet_genere: "Une phrase a te repeter pour faire evoluer peu a peu ton rapport a l'action.",
        questions: [
          "Par rapport a quelle action ou quel effort tu veux devenir plus solide ?",
          "Pourquoi c'est important pour toi d'arreter de reculer la-dessus ?",
          "Tu veux un mantra plutot calme, noble ou percutant ?",
        ],
        mode_emploi: "Repete-le trois fois le matin, ou matin midi et soir si tu veux l'ancrer plus fort.",
        generated_result: null,
      },
      {
        technique_key: "ancre_visuelle",
        title: "Ancre visuelle",
        pour_quoi: "Utiliser ton environnement consciemment pour qu'il te rappelle les engagements que tu as pris envers toi-meme.",
        objet_genere: "Un repere visuel simple a utiliser, avec une phrase a te dire quand tu le vois.",
        questions: [
          "Quel engagement envers toi-meme tu veux garder vivant ?",
          "Dans quel lieu ou sur quel objet tu pourrais l'accrocher a ton quotidien ?",
          "Quelle phrase courte devrait revenir quand tu le vois ?",
        ],
        mode_emploi: "Place-la dans ton environnement pour qu'elle te recadre naturellement quand ton regard tombe dessus.",
        generated_result: null,
      },
      {
        technique_key: "visualisation_matinale",
        title: "Meditation de 5 minutes",
        pour_quoi: "Installer une image mentale claire et calme du bon comportement avant que la journee, les excuses ou la friction prennent toute la place.",
        objet_genere: "Une courte meditation guidee pour te visualiser en train de faire l'action de facon naturelle.",
        questions: [
          "Quelle action ou habitude tu veux te voir faire naturellement ?",
          "A quel moment du matin pourrais-tu prendre 5 minutes pour te projeter calmement ?",
          "Quelles sensations ou images t'aideraient a te voir deja en train de faire l'action ?",
        ],
        mode_emploi: "Prends 5 minutes le matin pour te visualiser en train de faire l'action de facon calme, concrete et deja normale pour toi.",
        generated_result: null,
      },
      {
        technique_key: "preparer_terrain",
        title: "Preparer le terrain",
        pour_quoi: "Installer les bonnes conditions avant que la friction n'arrive.",
        objet_genere: "Un environnement qui t'invite a faire la bonne chose quand le moment arrive.",
        questions: [
          "Par rapport a quelle action tu veux te rendre la vie plus simple ?",
          "Qu'est-ce que tu pourrais preparer en avance pour enlever de la friction ?",
          "Quand le moment arrive, qu'est-ce qui devrait deja etre pret autour de toi ?",
        ],
        mode_emploi: "Prepare le terrain suffisamment tot pour que le bon geste devienne plus simple.",
        generated_result: null,
      },
      {
        technique_key: "pre_engagement",
        title: "Mot de bascule",
        pour_quoi: "Avoir un mot simple a envoyer pour que Sophia comprenne tout de suite que tu es dans un moment ou tu peux craquer et t'aide a tenir.",
        objet_genere: "Un mot-cle memorisable et un mini protocole de bascule a envoyer seul quand la tension monte.",
        questions: [
          "Dans quelle situation precise tu sens que tu vas craquer ou perdre le controle ?",
          "Quand tu tiens bon dans ce moment-la, qu'est-ce que tu proteges de vraiment important chez toi ?",
        ],
        mode_emploi: "Des que tu sens que ca devient tendu, envoie seulement le mot-cle. Sophia recupere le contexte et t'aide immediatement a tenir.",
        generated_result: null,
      },
    ],
  };
}

function mergeExistingTechniqueResults(
  existingContent: AttackCardContent | null,
  nextContent: AttackCardContent,
): AttackCardContent {
  if (!existingContent) return nextContent;

  const previousResults = new Map(
    existingContent.techniques.map((technique) => [
      technique.technique_key,
      technique.generated_result ?? null,
    ]),
  );

  return {
    ...nextContent,
    techniques: nextContent.techniques.map((technique) => ({
      ...technique,
      generated_result: previousResults.get(technique.technique_key) ?? technique.generated_result ?? null,
    })),
  };
}

export async function generateAttackCardForTransformation(args: {
  admin: SupabaseClient;
  userId: string;
  attackCardId?: string | null;
  transformationId?: string | null;
  scopeKind?: LabScopeKind;
  planItemId?: string | null;
  phaseId?: string | null;
  actionContext?: {
    phase_label: string | null;
    item_title: string;
    item_description: string | null;
    item_kind: string;
    time_of_day: string | null;
    cadence_label: string | null;
    activation_hint: string | null;
  } | null;
  requestId?: string;
  forceRegenerate?: boolean;
}): Promise<{ card_id: string; content: AttackCardContent }> {
  const scopeKind = args.scopeKind ?? "transformation";
  const context = await loadLabScopeContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
    scopeKind,
  });

  let existing:
    | { id: string; content: AttackCardContent; metadata: Record<string, unknown> }
    | null = null;
  if (args.attackCardId) {
    const { data, error } = await args.admin
      .from("user_attack_cards")
      .select("id, content, metadata, user_id")
      .eq("id", args.attackCardId)
      .maybeSingle();
    if (error) {
      throw new GenerateAttackCardError(500, `DB error: ${error.message}`, { cause: error });
    }
    if (data) {
      if ((data as any).user_id !== args.userId) {
        throw new GenerateAttackCardError(403, "Not authorized for this attack card");
      }
      existing = {
        id: String((data as any).id),
        content: (data as any).content as AttackCardContent,
        metadata: (((data as any).metadata) ?? {}) as Record<string, unknown>,
      };
    }
  } else {
    let existingQuery = args.admin
      .from("user_attack_cards")
      .select("id, content, metadata")
      .eq("user_id", args.userId)
      .eq("cycle_id", context.cycle_id)
      .order("generated_at", { ascending: false })
      .limit(1);
    if (args.planItemId) {
      existingQuery = existingQuery.eq("plan_item_id", args.planItemId);
    } else {
      existingQuery = existingQuery.eq("scope_kind", scopeKind);
      existingQuery = existingQuery.is("plan_item_id", null);
      existingQuery = scopeKind === "transformation"
        ? existingQuery.eq("transformation_id", String(args.transformationId))
        : existingQuery.is("transformation_id", null);
    }
    const { data } = await existingQuery.maybeSingle();
    existing = data
      ? {
        id: String((data as any).id),
        content: (data as any).content as AttackCardContent,
        metadata: (((data as any).metadata) ?? {}) as Record<string, unknown>,
      }
      : null;
  }

  if (existing && !args.forceRegenerate) {
    return {
      card_id: String(existing.id),
      content: existing.content as AttackCardContent,
    };
  }

  const mergedContent = mergeExistingTechniqueResults(
    (existing?.content as AttackCardContent | null) ?? null,
    buildBaseAttackCardContent({
      transformationTitle: context.transformation_title,
      scopeKind,
    }),
  );

  const now = new Date().toISOString();
  const payload = {
    cycle_id: context.cycle_id,
    scope_kind: scopeKind,
    transformation_id: context.transformation_id,
    phase_id: args.phaseId ?? null,
    plan_item_id: args.planItemId ?? null,
    source: "prefill_plan",
    status: "suggested",
    content: mergedContent,
    metadata: {
      ...(existing?.metadata ?? {}),
      classification_type_key: context.classification?.type_key ?? null,
      plan_item_id: args.planItemId ?? null,
      phase_id: args.phaseId ?? null,
      action_context: args.actionContext ?? null,
    },
    generated_at: now,
    last_updated_at: now,
  };

  if (existing?.id) {
    const { data, error } = await args.admin
      .from("user_attack_cards")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) {
      throw new GenerateAttackCardError(500, `Update failed: ${error.message}`, {
        cause: error,
      });
    }

    return {
      card_id: String((data as { id: string }).id),
      content: mergedContent,
    };
  }

  const { data, error } = await args.admin
    .from("user_attack_cards")
    .insert({
      user_id: args.userId,
      ...payload,
    })
    .select("id")
    .single();

  if (error) {
    throw new GenerateAttackCardError(500, `Insert failed: ${error.message}`, {
      cause: error,
    });
  }

  return {
    card_id: String((data as { id: string }).id),
    content: mergedContent,
  };
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

    const scopeKind = parsed.data.scope_kind ?? "transformation";
    if (scopeKind === "transformation" && !parsed.data.transformation_id) {
      throw new GenerateAttackCardError(400, "transformation_id is required");
    }

    const result = await generateAttackCardForTransformation({
      admin,
      userId: authData.user.id,
      attackCardId: parsed.data.attack_card_id ?? null,
      transformationId: parsed.data.transformation_id,
      scopeKind,
      requestId,
      forceRegenerate: parsed.data.force_regenerate ?? false,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      scope_kind: scopeKind,
      card_id: result.card_id,
      content: result.content,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "generate-attack-card-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "generate-attack-card-v1" },
    });

    if (error instanceof GenerateAttackCardError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to generate attack card");
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
    throw new GenerateAttackCardError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
