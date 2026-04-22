import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import type { UserCycleRow } from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  raw_text: z.string().trim().min(1).max(6000),
  cycle_id: z.string().uuid().nullable().optional(),
  existing_transformations: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().max(160).nullable().optional().default(null),
    internal_summary: z.string().trim().max(1200).optional().default(""),
    user_summary: z.string().trim().max(1200).optional().default(""),
    priority_order: z.number().int().nullable().optional().default(null),
    status: z.string().trim().min(1).max(32).optional().default("pending"),
  })).max(24).optional().default([]),
});

const DRAFT_SCHEMA = z.object({
  title: z.string().trim().min(1).max(120),
  internal_summary: z.string().trim().min(1).max(1200),
  user_summary: z.string().trim().min(1).max(1200),
  questionnaire_context: z.array(z.string().trim().min(1).max(160)).min(3).max(5),
});

const ANALYSIS_SCHEMA = z.object({
  updated_existing_transformations: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(120),
    internal_summary: z.string().trim().min(1).max(1200),
    user_summary: z.string().trim().min(1).max(1200),
    questionnaire_context: z.array(z.string().trim().min(1).max(160)).min(3).max(5),
  })).max(24),
  new_transformations: z.array(DRAFT_SCHEMA).max(8),
  recommended_selection: z.object({
    kind: z.enum(["existing", "new"]),
    existing_transformation_id: z.string().trim().min(1).max(120).nullable().optional().default(null),
    new_transformation_index: z.number().int().min(0).nullable().optional().default(null),
  }),
});

class DraftTransformationFromTextError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DraftTransformationFromTextError";
    this.status = status;
  }
}

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

  if (!url || !anonKey || !serviceRoleKey) {
    throw new DraftTransformationFromTextError(500, "Server misconfigured");
  }

  return { url, anonKey, serviceRoleKey };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const OPEN_TRANSFORMATION_STATUSES = ["pending", "ready", "active"] as const;

type ExistingTransformationContext = {
  id: string;
  title: string | null;
  internal_summary: string;
  user_summary: string;
  priority_order: number | null;
  status: string;
};

async function loadCycleContext(args: {
  admin: SupabaseClient<any>;
  cycleId: string | null;
  userId: string;
  clientExistingTransformations: ExistingTransformationContext[];
}): Promise<{ openTransformations: ExistingTransformationContext[] }> {
  if (!args.cycleId) {
    return { openTransformations: args.clientExistingTransformations };
  }

  const { data: cycleData, error: cycleError } = await args.admin
    .from("user_cycles")
    .select("id,user_id")
    .eq("id", args.cycleId)
    .maybeSingle();
  if (cycleError) {
    throw new DraftTransformationFromTextError(500, "Failed to load cycle", { cause: cycleError });
  }
  const cycle = cycleData as Pick<UserCycleRow, "id" | "user_id"> | null;
  if (!cycle || cycle.user_id !== args.userId) {
    throw new DraftTransformationFromTextError(403, "Forbidden");
  }

  // DB is the source of truth for which transformations are still open in this
  // cycle. Filter to open statuses (pending/ready/active) so the prompt never
  // reintroduces subjects that have already been completed/abandoned/archived.
  const { data: txRows, error: txError } = await args.admin
    .from("user_transformations")
    .select("id,title,internal_summary,user_summary,priority_order,status")
    .eq("cycle_id", args.cycleId)
    .in("status", OPEN_TRANSFORMATION_STATUSES as unknown as string[])
    .order("priority_order", { ascending: true });
  if (txError) {
    throw new DraftTransformationFromTextError(500, "Failed to load transformations", {
      cause: txError,
    });
  }

  const openTransformations: ExistingTransformationContext[] = (txRows ?? []).map((row: any) => ({
    id: String(row.id),
    title: cleanText(row.title, 160) || null,
    internal_summary: cleanText(row.internal_summary, 1200),
    user_summary: cleanText(row.user_summary, 1200),
    priority_order: typeof row.priority_order === "number" ? row.priority_order : null,
    status: cleanText(row.status, 32) || "pending",
  }));

  return { openTransformations };
}

function buildUserPrompt(args: {
  rawText: string;
  openTransformations: ExistingTransformationContext[];
}): string {
  const existingTransformationsBlock = args.openTransformations.length > 0
    ? args.openTransformations.map((item, index) =>
      [
        `${index + 1}. ID: ${item.id}`,
        `Statut: ${item.status}`,
        `Priorité: ${item.priority_order ?? "inconnue"}`,
        `Titre: ${item.title ?? "Sans titre"}`,
        `Résumé user: ${item.user_summary || "Aucun résumé"}`,
        `Résumé interne: ${item.internal_summary || "Aucun résumé"}`,
      ].join("\n")
    ).join("\n\n")
    : "Aucune transformation encore ouverte dans ce cycle.";

  return `
Tu reçois un texte libre utilisateur à analyser dans le contexte d'un cycle Sophia déjà existant.

Ta tâche :
1. décortiquer le texte utilisateur, même s'il contient plusieurs sujets
2. comparer ces sujets UNIQUEMENT aux transformations encore ouvertes listées ci-dessous
3. décider si chaque élément doit :
   - enrichir une transformation ouverte existante
   - ou devenir une nouvelle transformation
4. recommander le meilleur focus à afficher ensuite

Contraintes :
- Réponds en JSON strict.
- Tu peux extraire plusieurs sujets distincts s'ils sont vraiment différents.
- Si un point du texte enrichit clairement une transformation ouverte existante, mets à jour cette transformation au lieu de créer un doublon.
- Ne modifie pas les transformations non concernées.
- La liste "Transformations encore ouvertes" est la seule base de comparaison autorisée. Ne fais jamais ressortir un sujet qui n'y figure pas, même s'il a déjà existé ailleurs dans l'historique du cycle : s'il n'est pas listé, il est considéré comme terminé et ne doit plus apparaître.
- Toutes les transformations listées sont modifiables (statut ready / pending / active).
- "updated_existing_transformations" ne doit contenir que les transformations existantes réellement enrichies, et uniquement avec un id présent dans la liste ci-dessous.
- "new_transformations" ne doit contenir que les sujets réellement nouveaux apportés par le texte libre.
- Il doit toujours y avoir au moins un résultat au total entre "updated_existing_transformations" et "new_transformations".
- Le "title" doit être court, concret, orienté transformation.
- "internal_summary" doit décrire précisément le sujet, les difficultés et l'objectif.
- "user_summary" doit être fluide, clair, directement compréhensible par l'utilisateur.
- "questionnaire_context" doit contenir 3 à 5 angles d'exploration utiles pour un futur questionnaire.
- "recommended_selection" doit pointer vers le meilleur focus à afficher juste après l'analyse.
- Si "recommended_selection.kind" vaut "existing", renseigne "existing_transformation_id".
- Si "recommended_selection.kind" vaut "new", renseigne "new_transformation_index" avec l'index zéro-based dans "new_transformations".

Transformations encore ouvertes dans ce cycle :
${existingTransformationsBlock}

Nouveau texte libre utilisateur :
${args.rawText}

Format JSON attendu :
{
  "updated_existing_transformations": [
    {
      "id": "transformation_existante_a_enrichir",
      "title": "...",
      "internal_summary": "...",
      "user_summary": "...",
      "questionnaire_context": ["...", "...", "..."]
    }
  ],
  "new_transformations": [
    {
      "title": "...",
      "internal_summary": "...",
      "user_summary": "...",
      "questionnaire_context": ["...", "...", "..."]
    }
  ],
  "recommended_selection": {
    "kind": "existing ou new",
    "existing_transformation_id": "si kind=existing",
    "new_transformation_index": 0
  }
}
`.trim();
}

async function draftTransformationFromText(args: {
  requestId: string;
  userId: string;
  rawText: string;
  cycleId: string | null;
  clientExistingTransformations: ExistingTransformationContext[];
}) {
  const env = getSupabaseEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cycleContext = await loadCycleContext({
    admin,
    cycleId: args.cycleId,
    userId: args.userId,
    clientExistingTransformations: args.clientExistingTransformations,
  });

  const raw = await generateWithGemini(
    [
      "Tu es un assistant produit Sophia spécialisé dans la reformulation de transformations utilisateur.",
      "Tu écris un JSON strict et valide, sans markdown.",
      "Tu clarifies le sujet sans le dénaturer.",
    ].join("\n"),
    buildUserPrompt({
      rawText: args.rawText,
      openTransformations: cycleContext.openTransformations,
    }),
    0.3,
    true,
    [],
    "auto",
    {
      requestId: `${args.requestId}:draft-transformation-from-text-v1`,
      source: "draft-transformation-from-text-v1",
      userId: args.userId,
      model: "gemini-3-flash-preview",
      fallbackModel: "gpt-5.4-mini",
      secondFallbackModel: "gpt-5.4-nano",
      maxRetries: 1,
      httpTimeoutMs: 45_000,
      forceInitialModel: true,
    },
  );

  if (typeof raw !== "string") {
    throw new DraftTransformationFromTextError(500, "LLM returned an unsupported response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new DraftTransformationFromTextError(500, "LLM returned invalid JSON", { cause: error });
  }

  const result = ANALYSIS_SCHEMA.safeParse(parsed);
  if (!result.success) {
    throw new DraftTransformationFromTextError(500, "LLM returned an invalid draft analysis");
  }

  const existingIds = new Set(cycleContext.openTransformations.map((item) => item.id));
  const updatedIds = new Set<string>();
  for (const transformation of result.data.updated_existing_transformations) {
    if (!existingIds.has(transformation.id)) {
      throw new DraftTransformationFromTextError(500, "LLM referenced an unknown existing transformation");
    }
    if (updatedIds.has(transformation.id)) {
      throw new DraftTransformationFromTextError(500, "LLM duplicated an existing transformation update");
    }
    updatedIds.add(transformation.id);
  }

  const totalResults =
    result.data.updated_existing_transformations.length + result.data.new_transformations.length;
  if (totalResults === 0) {
    throw new DraftTransformationFromTextError(500, "LLM returned no usable transformation result");
  }

  if (result.data.recommended_selection.kind === "existing") {
    const selectedId = result.data.recommended_selection.existing_transformation_id;
    if (!selectedId || !updatedIds.has(selectedId)) {
      throw new DraftTransformationFromTextError(
        500,
        "LLM selected an existing transformation that was not updated",
      );
    }
  } else {
    const selectedIndex = result.data.recommended_selection.new_transformation_index;
    if (
      selectedIndex == null ||
      selectedIndex < 0 ||
      selectedIndex >= result.data.new_transformations.length
    ) {
      throw new DraftTransformationFromTextError(500, "LLM selected an invalid new transformation index");
    }
  }

  return {
    analysis: result.data,
    openTransformations: cycleContext.openTransformations,
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

    const authHeader = String(
      req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "",
    ).trim();
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

    const draft = await draftTransformationFromText({
      requestId,
      userId: authData.user.id,
      rawText: parsed.data.raw_text,
      cycleId: parsed.data.cycle_id ?? null,
      clientExistingTransformations: (parsed.data.existing_transformations ?? []).map((item) => ({
        id: cleanText(item.id, 120),
        title: cleanText(item.title, 160) || null,
        internal_summary: cleanText(item.internal_summary, 1200),
        user_summary: cleanText(item.user_summary, 1200),
        priority_order: item.priority_order ?? null,
        status: cleanText(item.status, 32) || "pending",
      })),
    });

    return jsonResponse(req, {
      request_id: requestId,
      analysis: draft.analysis,
      open_transformations: draft.openTransformations,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "draft-transformation-from-text-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "draft-transformation-from-text-v1" },
    });

    if (error instanceof DraftTransformationFromTextError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to draft transformation from text");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
