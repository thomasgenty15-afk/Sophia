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
import { getRequestContext } from "../_shared/request_context.ts";
import type { LabScopeKind } from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  stage: z.enum(["questionnaire", "draft"]),
  transformation_id: z.string().uuid().optional(),
  scope_kind: z.enum(["transformation", "out_of_plan"]).optional(),
  free_text: z.string().min(1).max(1500),
  answers: z.record(z.string()).optional().default({}),
});

const QUESTIONNAIRE_RESPONSE_SCHEMA = z.object({
  card_explanation: z.string().min(1).max(1400),
  questions: z.array(z.object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(220),
    helper_text: z.string().max(220).nullable().optional().default(null),
    placeholder: z.string().max(220).nullable().optional().default(null),
    required: z.boolean().optional().default(true),
  })).min(3).max(3),
});

const DRAFT_RESPONSE_SCHEMA = z.object({
  label: z.string().min(1).max(140),
  situation: z.string().min(1).max(500),
  signal: z.string().min(1).max(500),
  defense_response: z.string().min(1).max(500),
  plan_b: z.string().min(1).max(500),
});

const FALLBACK_QUESTIONNAIRE_QUESTIONS = [
  {
    id: "moment",
    label: "A quel moment precis ca arrive, et dans quel contexte ?",
    helper_text: "Decris la scene la plus concrete possible.",
    placeholder: "Ex: Le soir, dans mon lit, juste apres avoir pose mon livre.",
    required: true,
  },
  {
    id: "signal",
    label: "Quel est le premier signal qui montre que ca bascule ?",
    helper_text: "Pensee, geste, sensation, automatisme.",
    placeholder: "Ex: Je prends mon telephone sans y penser et je me dis juste 2 minutes.",
    required: true,
  },
  {
    id: "response",
    label: "Quel geste simple et realiste pourrait couper ca tout de suite ?",
    helper_text: "Le plus petit geste faisable sur le moment. Si tu n'as pas encore d'idee, ce n'est pas grave.",
    placeholder: "Ex: Poser le telephone hors du lit et reprendre 2 lignes de lecture.",
    required: true,
  },
] as const;

type DefenseScopeContext = {
  scope_kind: LabScopeKind;
  cycle_id: string;
  transformation_title: string;
  transformation_summary: string;
  free_cycle_text: string;
};

class DraftDefenseCardError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DraftDefenseCardError";
    this.status = status;
  }
}

const QUESTIONNAIRE_SYSTEM_PROMPT = `Tu aides a preparer une carte de defense.

Une carte de defense sert a reagir dans l'instant quand un moment fragile surgit.
Elle doit rester simple et tenir sur une seule fiche.
Elle contient 4 composantes:
- Le moment: ou et quand ca arrive
- Le piege: ce qui embarque la personne juste avant de basculer
- Mon geste: la reponse la plus simple et realiste a faire tout de suite
- Plan B: le filet de securite si le premier geste ne suffit pas

Ta mission:
1. Expliquer tres brievement l'utilite d'une carte de defense et ses composantes en langage simple.
2. A partir du texte libre du user, proposer EXACTEMENT 3 questions tres concretes pour fabriquer une bonne carte.

Regles:
- Pas de jargon psy.
- Les questions doivent etre courtes, naturelles, et orientees action.
- Chaque question doit servir a completer une composante differente ou complementaire de la carte.
- N'essaie pas de resoudre le probleme maintenant.
- Reponds UNIQUEMENT en JSON valide.`;

const DRAFT_SYSTEM_PROMPT = `Tu rediges un brouillon de carte de defense.

La carte finale doit etre tres concrete, memorisable et utilisable dans la vraie vie.
Elle doit correspondre a un seul moment principal, avec un seul piege principal.

Champs attendus:
- label: nom court de la carte
- situation: Le moment
- signal: Le piege
- defense_response: Mon geste
- plan_b: Plan B

Regles:
- Ecris en francais simple.
- Pas de jargon.
- Le moment doit etre precis et scene-based.
- Le piege doit decrire une pensee, sensation ou micro-comportement observable.
- Mon geste doit etre faisable vite, sans demander trop de volonte.
- Plan B doit etre un filet de securite concret si le geste principal ne part pas.
- Ne prefixe pas les champs avec "Le moment:", "Le piege:" etc.
- Reponds UNIQUEMENT en JSON valide.`;

async function loadDefenseScopeContext(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId?: string | null;
  scopeKind: LabScopeKind;
}): Promise<DefenseScopeContext> {
  const { admin, userId, scopeKind } = args;

  if (scopeKind === "out_of_plan") {
    const { data: cycle, error: cycleError } = await admin
      .from("user_cycles")
      .select("id, raw_intake_text")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cycleError) throw new DraftDefenseCardError(500, `DB error: ${cycleError.message}`);
    if (!cycle) throw new DraftDefenseCardError(404, "Active cycle not found");

    const { data: transformations, error: transformationsError } = await admin
      .from("user_transformations")
      .select("title, user_summary, status")
      .eq("cycle_id", cycle.id)
      .order("priority_order", { ascending: true });

    if (transformationsError) {
      throw new DraftDefenseCardError(500, `DB error: ${transformationsError.message}`);
    }

    const visible = (transformations ?? []).filter((row: any) =>
      row.status !== "abandoned" && row.status !== "cancelled" && row.status !== "archived"
    );

    return {
      scope_kind: "out_of_plan",
      cycle_id: cycle.id,
      transformation_title: "Hors transformations",
      transformation_summary: visible
        .map((row: any) => String(row.user_summary ?? "").trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(" ") || "Contexte general hors transformation.",
      free_cycle_text: String(cycle.raw_intake_text ?? "").trim(),
    };
  }

  const transformationId = String(args.transformationId ?? "").trim();
  if (!transformationId) {
    throw new DraftDefenseCardError(400, "transformation_id is required");
  }

  const { data: transformation, error: transformationError } = await admin
    .from("user_transformations")
    .select("id, cycle_id, title, user_summary")
    .eq("id", transformationId)
    .maybeSingle();

  if (transformationError) {
    throw new DraftDefenseCardError(500, `DB error: ${transformationError.message}`);
  }
  if (!transformation) {
    throw new DraftDefenseCardError(404, "Transformation not found");
  }

  const { data: cycle, error: cycleError } = await admin
    .from("user_cycles")
    .select("id, user_id, raw_intake_text")
    .eq("id", transformation.cycle_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (cycleError || !cycle) {
    throw new DraftDefenseCardError(403, "Cycle not found or not owned by user");
  }

  return {
    scope_kind: "transformation",
    cycle_id: transformation.cycle_id,
    transformation_title: String(transformation.title ?? "Transformation"),
    transformation_summary: String(transformation.user_summary ?? "").trim(),
    free_cycle_text: String(cycle.raw_intake_text ?? "").trim(),
  };
}

function buildQuestionnairePrompt(args: {
  context: DefenseScopeContext;
  freeText: string;
}) {
  return [
    `## Scope`,
    `Titre: ${args.context.transformation_title}`,
    `Resume: ${args.context.transformation_summary || "Aucun resume fourni."}`,
    args.context.free_cycle_text
      ? `\n## Contexte cycle\n${args.context.free_cycle_text}`
      : "",
    `\n## Ce que dit l'utilisateur`,
    args.freeText,
    `\nConstruit maintenant l'explication courte puis EXACTEMENT 3 questions.`,
  ].join("\n");
}

function buildDraftPrompt(args: {
  context: DefenseScopeContext;
  freeText: string;
  answers: Record<string, string>;
}) {
  const answersBlock = Object.entries(args.answers)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return [
    `## Scope`,
    `Titre: ${args.context.transformation_title}`,
    `Resume: ${args.context.transformation_summary || "Aucun resume fourni."}`,
    args.context.free_cycle_text
      ? `\n## Contexte cycle\n${args.context.free_cycle_text}`
      : "",
    `\n## Besoin libre`,
    args.freeText,
    `\n## Reponses aux 3 questions`,
    answersBlock || "- Aucune reponse",
    `\nGenere un brouillon de carte de defense tres concret.`,
  ].join("\n");
}

async function runJsonGeneration<T>(args: {
  systemPrompt: string;
  userPrompt: string;
  requestId?: string;
  userId: string;
  source: string;
  schema: z.ZodSchema<T>;
}): Promise<T> {
  const raw = await generateWithGemini(
    args.systemPrompt,
    args.userPrompt,
    0.4,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: args.source,
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new DraftDefenseCardError(500, "LLM returned tool call instead of JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new DraftDefenseCardError(500, "LLM returned invalid JSON", { cause: error });
  }

  const result = args.schema.safeParse(parsed);
  if (!result.success) {
    throw new DraftDefenseCardError(500, "LLM returned invalid payload");
  }

  return result.data;
}

function readString(candidate: unknown, maxLength: number): string {
  if (typeof candidate !== "string") return "";
  return candidate.trim().slice(0, maxLength);
}

function normalizeQuestionnairePayload(raw: unknown) {
  const candidate = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const explanation =
    readString(candidate.card_explanation, 1400) ||
    readString(candidate.cardExplanation, 1400) ||
    readString(candidate.explanation, 1400) ||
    "Cette carte te sert a preparer une reponse simple pour un moment fragile precis.";

  const rawQuestions = Array.isArray(candidate.questions) ? candidate.questions : [];
  const normalizedQuestions = rawQuestions
    .map((entry, index) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const label =
        readString(item.label, 220) ||
        readString(item.question, 220) ||
        readString(item.title, 220);
      if (!label) return null;

      const fallback = FALLBACK_QUESTIONNAIRE_QUESTIONS[index] ?? FALLBACK_QUESTIONNAIRE_QUESTIONS[0];
      return {
        id: readString(item.id, 40) || fallback.id,
        label,
        helper_text:
          readString(item.helper_text, 220) ||
          readString(item.helperText, 220) ||
          fallback.helper_text,
        placeholder: readString(item.placeholder, 220) || fallback.placeholder,
        required: typeof item.required === "boolean" ? item.required : true,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 3);

  while (normalizedQuestions.length < 3) {
    const fallback = FALLBACK_QUESTIONNAIRE_QUESTIONS[normalizedQuestions.length];
    normalizedQuestions.push({ ...fallback });
  }

  return {
    card_explanation: explanation,
    questions: normalizedQuestions,
  };
}

function normalizeDraftPayload(raw: unknown) {
  const candidate = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    label: readString(candidate.label, 140),
    situation: readString(candidate.situation, 500) || readString(candidate.moment, 500),
    signal: readString(candidate.signal, 500) || readString(candidate.trap, 500),
    defense_response:
      readString(candidate.defense_response, 500) ||
      readString(candidate.defenseResponse, 500) ||
      readString(candidate.response, 500),
    plan_b:
      readString(candidate.plan_b, 500) ||
      readString(candidate.planB, 500),
  };
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new DraftDefenseCardError(500, "Server misconfigured");
  }
  return { url, anonKey, serviceRoleKey };
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
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const scopeKind = parsed.data.scope_kind ?? "transformation";
    const context = await loadDefenseScopeContext({
      admin,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      scopeKind,
    });

    if (parsed.data.stage === "questionnaire") {
      const rawPayload = await runJsonGeneration({
        systemPrompt: QUESTIONNAIRE_SYSTEM_PROMPT,
        userPrompt: buildQuestionnairePrompt({
          context,
          freeText: parsed.data.free_text.trim(),
        }),
        requestId,
        userId: authData.user.id,
        source: "draft-defense-card-v1:questionnaire",
        schema: z.unknown(),
      });
      const payloadResult = QUESTIONNAIRE_RESPONSE_SCHEMA.safeParse(
        normalizeQuestionnairePayload(rawPayload),
      );
      if (!payloadResult.success) {
        throw new DraftDefenseCardError(500, "LLM returned invalid questionnaire payload");
      }
      const payload = payloadResult.data;

      return jsonResponse(req, {
        request_id: requestId,
        scope_kind: scopeKind,
        transformation_id: parsed.data.transformation_id ?? null,
        ...payload,
      });
    }

    const answers = Object.fromEntries(
      Object.entries(parsed.data.answers ?? {})
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0),
    );
    if (Object.keys(answers).length === 0) {
      return badRequest(req, requestId, "answers are required for draft stage");
    }

    const rawPayload = await runJsonGeneration({
      systemPrompt: DRAFT_SYSTEM_PROMPT,
      userPrompt: buildDraftPrompt({
        context,
        freeText: parsed.data.free_text.trim(),
        answers,
      }),
      requestId,
      userId: authData.user.id,
      source: "draft-defense-card-v1:draft",
      schema: z.unknown(),
    });
    const payloadResult = DRAFT_RESPONSE_SCHEMA.safeParse(
      normalizeDraftPayload(rawPayload),
    );
    if (!payloadResult.success) {
      throw new DraftDefenseCardError(500, "LLM returned invalid draft payload");
    }
    const payload = payloadResult.data;

    return jsonResponse(req, {
      request_id: requestId,
      scope_kind: scopeKind,
      transformation_id: parsed.data.transformation_id ?? null,
      ...payload,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "draft-defense-card-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "draft-defense-card-v1" },
    });

    if (error instanceof DraftDefenseCardError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to draft defense card");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
