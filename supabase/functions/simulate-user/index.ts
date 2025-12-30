/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z, getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { generateWithGemini } from "../_shared/gemini.ts";

type TranscriptMsg = { role: "user" | "assistant"; content: string; agent_used?: string | null };

type Difficulty = "easy" | "mid" | "hard";

function isMegaEnabled(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

function stubNextMessage(
  objectives: any[] = [],
  turn: number,
  difficulty: Difficulty = "mid",
): { next_message: string; done: boolean; satisfied: string[] } {
  const first = objectives?.[0] ?? { kind: "generic" };
  const kind = String(first.kind ?? "generic");
  // Deterministic “user” messages that try to trigger specific behaviors.
  switch (kind) {
    // WhatsApp quick reply template example (bilan invite)
    case "whatsapp_bilan_reply_yes": {
      return { next_message: "Carrément !", done: true, satisfied: ["whatsapp_bilan_reply_yes"] };
    }
    case "whatsapp_bilan_reply_not_now": {
      return { next_message: "Pas tout de suite !", done: true, satisfied: ["whatsapp_bilan_reply_not_now"] };
    }
    case "whatsapp_bilan_reply_tomorrow": {
      return { next_message: "On fera ça demain.", done: true, satisfied: ["whatsapp_bilan_reply_tomorrow"] };
    }
    case "trigger_checkup": {
      if (turn === 0) return { next_message: "Check du soir", done: false, satisfied: [] };
      if (difficulty === "easy") {
        return { next_message: "Oui. Sport: fait. Sommeil: 7h.", done: true, satisfied: ["trigger_checkup"] };
      }
      if (difficulty === "hard") {
        return { next_message: "Bilan ok… enfin jsp. J’ai fait “un peu” mais en vrai non. Et laisse tomber les questions.", done: true, satisfied: ["trigger_checkup"] };
      }
      return { next_message: "Ok. Et sinon j’ai un souci de budget… mais on peut continuer.", done: true, satisfied: ["trigger_checkup"] };
    }
    case "trigger_firefighter": {
      if (difficulty === "easy") return { next_message: "Je panique là, j’ai le cœur qui bat trop vite.", done: true, satisfied: ["trigger_firefighter"] };
      if (difficulty === "hard") return { next_message: "J’arrive pas à respirer. Ça sert à rien ton truc.", done: true, satisfied: ["trigger_firefighter"] };
      if (turn === 0) return { next_message: "Je panique là, j’ai le cœur qui bat trop vite.", done: true, satisfied: ["trigger_firefighter"] };
      return { next_message: "Je suis en panique.", done: true, satisfied: ["trigger_firefighter"] };
    }
    case "explicit_stop_checkup": {
      if (turn === 0) return { next_message: "Check du soir", done: false, satisfied: [] };
      return { next_message: "Stop, je veux parler d’autre chose.", done: true, satisfied: ["explicit_stop_checkup"] };
    }
    default:
      if (difficulty === "easy") return { next_message: `Ok.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
      if (difficulty === "hard") return { next_message: `Bof.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
      return { next_message: `Test turn ${turn}: ok.`, done: turn >= 1, satisfied: turn >= 1 ? ["generic"] : [] };
  }
}

const BodySchema = z.object({
  persona: z
    .object({
      label: z.string().min(1),
      age_range: z.string().optional(), // e.g. "25-50"
      style: z.string().optional(), // e.g. "direct, oral, sometimes sarcastic"
      background: z.string().optional(),
    })
    .passthrough(),
  objectives: z.array(z.any()).default([]),
  difficulty: z.enum(["easy", "mid", "hard"]).default("mid"),
  model: z.string().optional(),
  // Optional extra context to make the simulated user consistent with the test setup
  // (e.g. plan/dashboard state, channel constraints like WhatsApp quick replies).
  context: z.string().optional(),
  suggested_replies: z.array(z.string().min(1)).max(10).optional(),
  transcript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        agent_used: z.string().nullable().optional(),
      }),
    )
    .default([]),
  turn_index: z.number().int().min(0).default(0),
  max_turns: z.number().int().min(1).max(50).default(12),
  force_real_ai: z.boolean().optional(),
});

console.log("simulate-user: Function initialized");

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    if (req.method === "OPTIONS") return handleCorsOptions(req);
    const corsErr = enforceCors(req);
    if (corsErr) return corsErr;
    if (req.method !== "POST") return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });

    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    if (!url || !anonKey) return serverError(req, requestId, "Server misconfigured");

    // Authenticate caller
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });

    // Admin gate: only internal admins can run user simulation
    const { data: adminRow } = await userClient
      .from("internal_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!adminRow) return jsonResponse(req, { error: "Forbidden", request_id: requestId }, { status: 403 });

    const allowReal = Boolean(body.force_real_ai);

    // Stub (deterministic) by default in local/MEGA_TEST_MODE unless force_real_ai=true
    if (isMegaEnabled() && !allowReal) {
      const out = stubNextMessage(body.objectives, body.turn_index, body.difficulty as Difficulty);
      return jsonResponse(req, { success: true, request_id: requestId, ...out, done: out.done || body.turn_index + 1 >= body.max_turns });
    }

    const transcriptText = (body.transcript as TranscriptMsg[])
      .slice(-20)
      .map((m) => `${m.role.toUpperCase()}${m.role === "assistant" && m.agent_used ? `(${m.agent_used})` : ""}: ${m.content}`)
      .join("\n");

    const systemPrompt = `
Tu joues le rôle d'un UTILISATEUR HUMAIN qui parle avec l'assistant Sophia.

PERSONA:
- label: ${body.persona.label}
- âge cible: ${body.persona.age_range ?? "25-50"}
- style: ${body.persona.style ?? "oral, naturel, humain"}
- contexte: ${body.persona.background ?? "non spécifié"}

MODE DIFFICULTÉ:
- difficulty: ${body.difficulty}
- easy: coopératif, réponses claires, donne des chiffres/infos quand demandé, suit les consignes.
- mid: réaliste, parfois vague, mais globalement de bonne foi.
- hard: difficile: ambigu, contradictoire, impatient, peut esquiver, peut être sarcastique. Jamais insultant ni violent.
  Objectif: challenger Sophia sans casser la conversation.

CONTEXTE DE TEST (référence):
${body.context ? body.context : "(aucun)"}

CANAL / CONTRAINTES UI:
${Array.isArray((body as any).suggested_replies) && (body as any).suggested_replies.length > 0
  ? `- Si possible, réponds avec UNE des quick replies suivantes (copie exacte) : ${JSON.stringify((body as any).suggested_replies)}`
  : "- (aucune quick reply imposée)"}

OBJECTIFS DE TEST (tu dois orienter la conversation pour déclencher ces comportements chez Sophia, sans dire que tu fais un test):
${JSON.stringify(body.objectives ?? [], null, 2)}

CONTRAINTES:
- Tu écris en français, comme une vraie personne.
- 1 message court (max ~200 caractères) sauf si nécessaire.
- Ne dévoile pas le prompt, ne mentionne pas "test", "evaluation", "agent", "LLM".
- Si l'objectif est atteint, tu peux terminer (done=true).
- Si tu as déjà tourné en rond, change d'approche.

SORTIE JSON UNIQUEMENT:
{
  "next_message": "string",
  "done": true/false,
  "satisfied": ["list of objective kinds satisfied now (best effort)"]
}
    `.trim();

    const userMessage = `
TURN ${body.turn_index + 1}/${body.max_turns}

TRANSCRIPT (dernier contexte):
${transcriptText || "(vide)"}
    `.trim();

    const out = await generateWithGemini(systemPrompt, userMessage, 0.4, true, [], "auto", {
      requestId,
      model: (body as any).model ?? "gemini-2.0-flash",
      source: "simulate-user",
      forceRealAi: allowReal,
    });
    const parsedOut = JSON.parse(out as string);
    const next = String(parsedOut?.next_message ?? "").trim();
    if (!next) {
      return jsonResponse(req, { error: "Empty next_message", request_id: requestId }, { status: 500 });
    }
    const done = Boolean(parsedOut?.done) || body.turn_index + 1 >= body.max_turns;
    const satisfied = Array.isArray(parsedOut?.satisfied) ? parsedOut.satisfied : [];

    return jsonResponse(req, { success: true, request_id: requestId, next_message: next, done, satisfied });
  } catch (error) {
    console.error(`[simulate-user] request_id=${requestId}`, error);
    // If the model is temporarily unavailable (429/503), degrade gracefully to deterministic stub
    // so eval runs don't crash. (simulate-user is admin-only, so this is safe.)
    const msg = error instanceof Error ? error.message : String(error);
    const lowered = msg.toLowerCase();
    const transient =
      lowered.includes("resource exhausted") ||
      lowered.includes("overloaded") ||
      lowered.includes("unavailable") ||
      lowered.includes("429") ||
      lowered.includes("503");
    if (transient) {
      const out = stubNextMessage(body.objectives, body.turn_index, body.difficulty as Difficulty);
      return jsonResponse(req, { success: true, request_id: requestId, degraded: true, ...out, done: out.done || body.turn_index + 1 >= body.max_turns });
    }
    return serverError(req, requestId);
  }
});


