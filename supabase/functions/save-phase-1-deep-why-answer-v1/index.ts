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
  answers: z.array(
    z.object({
      question_id: z.string().trim().min(1).max(120),
      question: z.string().trim().min(1).max(400),
      answer: z.string().trim().max(4000),
    }),
  ).min(1).optional(),
  question_id: z.string().trim().min(1).max(120).optional(),
  question: z.string().trim().min(1).max(400).optional(),
  answer: z.string().trim().max(4000).optional(),
});

class SavePhase1DeepWhyAnswerError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SavePhase1DeepWhyAnswerError";
    this.status = status;
  }
}

export async function savePhase1DeepWhyAnswer(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
  answers: Array<{
    questionId: string;
    question: string;
    answer: string;
  }>;
}) {
  const context = await loadPhase1GenerationContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
  });

  if (!context.phase1?.deep_why) {
    throw new SavePhase1DeepWhyAnswerError(409, "Phase 1 deep why is not prepared yet");
  }

  const now = new Date().toISOString();
  const questionOrder = new Map(
    (context.phase1.deep_why.questions ?? []).map((item, index) => [item.id, index]),
  );
  const answerMap = new Map(
    (context.phase1.deep_why.answers ?? []).map((item) => [item.question_id, item]),
  );

  for (const payload of args.answers) {
    if (!questionOrder.has(payload.questionId)) continue;
    if (!payload.answer.trim()) {
      answerMap.delete(payload.questionId);
      continue;
    }
    answerMap.set(payload.questionId, {
      question_id: payload.questionId,
      question: payload.question,
      answer: payload.answer.trim(),
      answered_at: now,
    });
  }

  const answers = Array.from(answerMap.values()).sort((left, right) => {
    const leftOrder = questionOrder.get(left.question_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = questionOrder.get(right.question_id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
  const allQuestionsAnswered =
    context.phase1.deep_why.questions.length > 0 &&
    context.phase1.deep_why.questions.every((item) => {
      const saved = answerMap.get(item.id);
      return Boolean(saved?.answer?.trim());
    });

  const handoffPayload = mergePhase1Payload({
    handoffPayload: context.transformation.handoff_payload,
    deepWhy: {
      prepared_at: context.phase1.deep_why.prepared_at,
      questions: context.phase1.deep_why.questions,
      answers,
    },
    runtime: {
      deep_why_answered: allQuestionsAnswered,
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
    throw new SavePhase1DeepWhyAnswerError(500, `Failed to persist deep why answer: ${error.message}`, {
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

    const answers = Array.isArray(parsed.data.answers) && parsed.data.answers.length > 0
      ? parsed.data.answers.map((item) => ({
        questionId: item.question_id,
        question: item.question,
        answer: item.answer,
      }))
      : parsed.data.question_id && parsed.data.question && typeof parsed.data.answer === "string"
      ? [{
        questionId: parsed.data.question_id,
        question: parsed.data.question,
        answer: parsed.data.answer,
      }]
      : null;

    if (!answers || answers.length === 0) {
      return badRequest(req, requestId, "At least one deep why answer is required");
    }

    const phase1 = await savePhase1DeepWhyAnswer({
      admin,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      answers,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      phase_1: phase1,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "save-phase-1-deep-why-answer-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "save-phase-1-deep-why-answer-v1" },
    });

    if (error instanceof SavePhase1DeepWhyAnswerError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to save phase 1 deep why answer");
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
    throw new SavePhase1DeepWhyAnswerError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
