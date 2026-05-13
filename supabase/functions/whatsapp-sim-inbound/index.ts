/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { extractHiddenFilRougeNote } from "../sophia-brain/chat_text.ts";
import { processMessage } from "../sophia-brain/router/run.ts";
import { runUpdateCoachPreferencesIntake } from "../sophia-brain/tools/operations/update_coach_preferences/intake.ts";
import type { CoachPreferenceKey } from "../sophia-brain/tools/operations/_shared/operation_payload_builder.ts";

type Body = {
  text?: string;
  interactive_id?: string;
  interactive_title?: string;
};

type ProfileState = {
  whatsapp_state?: string | null;
  onboarding_completed?: boolean | null;
};

type BrainDirectOptions = {
  forceOnboardingFlow?: boolean;
  forceMode?: "companion";
  contextOverride?: string | null;
  purpose?: string | null;
  requiredQuestion?: string | null;
};

function env(name: string): string {
  return String(Deno.env.get(name) ?? "").trim();
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function isEnabled(): boolean {
  const raw = env("WHATSAPP_WEB_SIMULATION_ENABLED").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}_timeout_${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function readBody(req: Request): Promise<Body> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Body
    : {};
}

async function loadProfileState(
  client: ReturnType<typeof createClient>,
  userId: string,
): Promise<ProfileState> {
  const { data, error } = await client
    .from("profiles")
    .select("whatsapp_state,onboarding_completed")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn(JSON.stringify({
      tag: "whatsapp_sim_inbound_profile_state_failed",
      user_id: userId,
      error: error.message,
    }));
    return {};
  }
  return data ?? {};
}

function normalizePreferenceText(raw: unknown) {
  return String(raw ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function inferTonePreference(raw: unknown) {
  const s = normalizePreferenceText(raw);
  if (/mix|melange|entre les deux|les deux|equilibre/.test(s)) return "mix";
  if (/direct|franc|cash|secoue|challenge/.test(s)) return "tres_direct";
  if (/doux|douce|gentil|calme|soft|rassurant/.test(s)) return "doux";
  return "mix";
}

function inferChallengePreference(raw: unknown) {
  const s = normalizePreferenceText(raw);
  if (
    /fort|eleve|challenge|pousse|boost|secoue|direct|franc|cash|exige/.test(s)
  ) return "eleve";
  if (/leger|doucement|peu|low|pas trop|minimum/.test(s)) return "leger";
  return "modere";
}

function inferQuestionPreference(raw: unknown) {
  const s = normalizePreferenceText(raw);
  if (/\b(peu|moins|rare|minimum)\b|pas trop/.test(s)) {
    return "peu_de_questions";
  }
  if (/beaucoup|plus|questionne|creuse|approfond/.test(s)) {
    return "tres_questionnant";
  }
  return "normal";
}

function coachPreferenceLabel(key: string, value: string): string {
  if (key === "coach.tone") {
    return value === "mix"
      ? "Mix doux/direct"
      : value === "doux"
      ? "Doux"
      : "Très direct";
  }
  if (key === "coach.challenge_level") {
    return value === "eleve" ? "Élevé" : value === "leger" ? "Léger" : "Modéré";
  }
  if (key === "coach.question_tendency") {
    return value === "peu_de_questions"
      ? "Peu de questions"
      : value === "tres_questionnant"
      ? "Très questionnant"
      : "Normal";
  }
  return value;
}

async function persistCoachPreferenceViaOperation(params: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  key: CoachPreferenceKey;
  value: string;
  requestId: string;
}) {
  const requestedPatch = { [params.key]: params.value } as Partial<
    Record<CoachPreferenceKey, string>
  >;
  const operation = runUpdateCoachPreferencesIntake({
    user_id: params.userId,
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: `Réglage onboarding WhatsApp: ${params.key}=${params.value}`,
    source: "direct_user_request",
    trigger_message_id: params.requestId,
    safety_pregate_risk_band: "none",
    operation_input: { requested_patch: requestedPatch },
  });
  if (operation.status !== "pending_confirmation" || !operation.draft) {
    throw new Error(`coach_preference_operation_failed:${operation.status}`);
  }

  const draft = operation.draft;
  const nowIso = new Date().toISOString();
  const rows = Object.entries(draft.draft.patch).map(([key, raw]) => {
    const value = String(raw);
    return {
      user_id: params.userId,
      scope: "global",
      key,
      value: { value, label: coachPreferenceLabel(key, value) },
      status: "active",
      confidence: 1,
      source_type: "explicit_user",
      last_source_message_id: null,
      reason:
        `operation:update_coach_preferences:${draft.draft.summary}; source=whatsapp_web_sim`,
      updated_at: nowIso,
      last_confirmed_at: nowIso,
    };
  });

  const { error } = await params.admin
    .from("user_profile_facts")
    .upsert(rows as never, { onConflict: "user_id,scope,key" });
  if (error) throw error;
}

async function finishWhatsAppSimOnboarding(params: {
  admin: ReturnType<typeof createClient>;
  userId: string;
}) {
  const nowIso = new Date().toISOString();
  const { data: stateRow } = await params.admin
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", params.userId)
    .eq("scope", "whatsapp")
    .maybeSingle();
  const tempMemory = {
    ...(((stateRow as { temp_memory?: Record<string, unknown> } | null)
      ?.temp_memory ?? {}) as Record<string, unknown>),
    __whatsapp_onboarding_done: {
      completed_at: nowIso,
      source: "whatsapp_web_sim_topic_choice_received",
    },
  };
  delete (tempMemory as Record<string, unknown>).__onboarding_active;

  await params.admin
    .from("user_chat_states")
    .upsert({
      user_id: params.userId,
      scope: "whatsapp",
      current_mode: "companion",
      risk_level: 0,
      investigation_state: null,
      short_term_context: "",
      unprocessed_msg_count: 0,
      last_processed_at: nowIso,
      last_interaction_at: nowIso,
      temp_memory: tempMemory,
    } as never, { onConflict: "user_id,scope" });
}

function startsOptinOnboarding(body: Body, text: string) {
  const interactive = String(
    body.interactive_title ?? body.interactive_id ?? "",
  )
    .trim();
  if (!interactive) return false;
  const raw = normalizePreferenceText(interactive || text);
  return /absolument|je veux bien|avec plaisir|go|oui/.test(raw);
}

function onboardingContext(args: {
  previousStep: string;
  nextStep: string;
  requiredQuestion: string;
  savedPreferenceKey?: string;
  savedPreferenceValue?: string;
}) {
  return [
    "=== CONTEXTE WHATSAPP SIMULATION: ONBOARDING GUIDE ===",
    `Etape recue: ${args.previousStep}.`,
    args.savedPreferenceKey
      ? `Preference detectee et stockee: ${args.savedPreferenceKey}=${args.savedPreferenceValue}.`
      : null,
    `Etape suivante: ${args.nextStep}.`,
    "",
    "CONSIGNE DE TOUR:",
    "- Tu dois repondre via la conversation Sophia, pas comme un formulaire administratif.",
    args.savedPreferenceKey
      ? "- Accuse reception naturellement de la preference, en 1 phrase maximum."
      : "- Accuse reception naturellement du message utilisateur, en 1 phrase maximum.",
    "- Pose ensuite LA question de l'etape suivante, avec un ton WhatsApp naturel.",
    "- INTERDICTION de poser une autre question que la question imposee ci-dessous.",
    "- Ne redemande jamais l'etape precedente: le systeme a deja tranche et stocke ce qu'il fallait, meme si la reponse utilisateur etait imparfaite.",
    "- Ne lance aucune action du plan maintenant.",
    "- Ne parle pas de mission, habitude, sas, zone de dechargement, action du jour, exercice ou petit pas.",
    '- Quand tu parles d\'un decrochage, c\'est toujours l\'utilisateur qui decroche: ecris "quand tu decroches", jamais "quand je decroche".',
    "- Message court: 2-3 phrases maximum.",
    `Question imposee a poser exactement en fin de message: "${args.requiredQuestion}"`,
    "=== FIN CONTEXTE WHATSAPP SIMULATION ===",
  ].filter(Boolean).join("\n");
}

async function prepareWhatsAppSimOnboardingTurn(args: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  body: Body;
  text: string;
  profileState: ProfileState;
  requestId: string;
}): Promise<BrainDirectOptions> {
  const st = String(args.profileState.whatsapp_state ?? "").trim();
  const nowIso = new Date().toISOString();

  if (!st && startsOptinOnboarding(args.body, args.text)) {
    const requiredQuestion =
      "Tu préfères une Sophia plutôt douce, plutôt directe, ou un mix des deux ?";
    await args.admin.from("profiles").update({
      whatsapp_state: "onboarding_pref_tone",
      whatsapp_state_updated_at: nowIso,
    } as never).eq("id", args.userId);
    return {
      forceMode: "companion",
      forceOnboardingFlow: true,
      purpose: "onboarding_pref_tone_question",
      requiredQuestion,
      contextOverride: onboardingContext({
        previousStep: "optin_accept",
        nextStep: "preference_tone",
        requiredQuestion,
      }),
    };
  }

  if (st === "onboarding_pref_tone") {
    const value = inferTonePreference(args.text);
    await persistCoachPreferenceViaOperation({
      admin: args.admin,
      userId: args.userId,
      key: "coach.tone",
      value,
      requestId: args.requestId,
    });
    const requiredQuestion =
      "Tu préfères que je te challenge comment quand tu décroches : plutôt léger, normal, ou assez direct ?";
    await args.admin.from("profiles").update({
      whatsapp_state: "onboarding_pref_challenge",
      whatsapp_state_updated_at: nowIso,
    } as never).eq("id", args.userId);
    return {
      forceMode: "companion",
      forceOnboardingFlow: true,
      purpose: "onboarding_pref_challenge_question",
      requiredQuestion,
      contextOverride: onboardingContext({
        previousStep: "preference_tone",
        savedPreferenceKey: "coach.tone",
        savedPreferenceValue: value,
        nextStep: "preference_challenge_level",
        requiredQuestion,
      }),
    };
  }

  if (st === "onboarding_pref_challenge") {
    const value = inferChallengePreference(args.text);
    await persistCoachPreferenceViaOperation({
      admin: args.admin,
      userId: args.userId,
      key: "coach.challenge_level",
      value,
      requestId: args.requestId,
    });
    const requiredQuestion =
      "Dernier réglage : tu préfères que je pose peu de questions, que je creuse un peu, ou que je te questionne franchement quand ça aide ?";
    await args.admin.from("profiles").update({
      whatsapp_state: "onboarding_pref_questions",
      whatsapp_state_updated_at: nowIso,
    } as never).eq("id", args.userId);
    return {
      forceMode: "companion",
      forceOnboardingFlow: true,
      purpose: "onboarding_pref_questions_question",
      requiredQuestion,
      contextOverride: onboardingContext({
        previousStep: "preference_challenge_level",
        savedPreferenceKey: "coach.challenge_level",
        savedPreferenceValue: value,
        nextStep: "preference_question_tendency",
        requiredQuestion,
      }),
    };
  }

  if (st === "onboarding_pref_questions") {
    const value = inferQuestionPreference(args.text);
    await persistCoachPreferenceViaOperation({
      admin: args.admin,
      userId: args.userId,
      key: "coach.question_tendency",
      value,
      requestId: args.requestId,
    });
    const requiredQuestion =
      "Avant qu’on passe à la suite : la création de ton plan, ça s’est passé comment pour toi ? Tu es content du résultat ?";
    await args.admin.from("profiles").update({
      whatsapp_state: "onboarding_plan_creation_feedback",
      whatsapp_state_updated_at: nowIso,
    } as never).eq("id", args.userId);
    return {
      forceMode: "companion",
      forceOnboardingFlow: true,
      purpose: "onboarding_plan_creation_feedback_question",
      requiredQuestion,
      contextOverride: onboardingContext({
        previousStep: "preference_question_tendency",
        savedPreferenceKey: "coach.question_tendency",
        savedPreferenceValue: value,
        nextStep: "plan_creation_feedback",
        requiredQuestion,
      }),
    };
  }

  if (st === "onboarding_plan_creation_feedback") {
    const requiredQuestion =
      "Pour commencer maintenant, tu veux qu’on parle de ton plan, ou d’autre chose qui te paraît plus important ?";
    await args.admin.from("profiles").update({
      whatsapp_state: "onboarding_topic_choice",
      whatsapp_state_updated_at: nowIso,
    } as never).eq("id", args.userId);
    return {
      forceMode: "companion",
      forceOnboardingFlow: true,
      purpose: "onboarding_topic_choice_question",
      requiredQuestion,
      contextOverride: onboardingContext({
        previousStep: "plan_creation_feedback",
        nextStep: "topic_choice_then_normal_conversation",
        requiredQuestion,
      }),
    };
  }

  if (st === "onboarding_topic_choice") {
    await args.admin.from("profiles").update({
      whatsapp_state: null,
      whatsapp_state_updated_at: nowIso,
    } as never).eq("id", args.userId);
    await finishWhatsAppSimOnboarding({
      admin: args.admin,
      userId: args.userId,
    });
    return {
      purpose: "onboarding_completed_topic_choice",
      contextOverride:
        "L'onboarding WhatsApp vient de se terminer. Reponds maintenant normalement au choix de sujet de l'utilisateur, sans revenir aux questions de preference.",
    };
  }

  return {};
}

async function runSophiaBrainDirect(args: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  requestId: string;
  text: string;
  options?: BrainDirectOptions;
}) {
  const useProcessMessage = ["1", "true", "yes", "on"].includes(
    env("WHATSAPP_WEB_SIM_USE_PROCESS_MESSAGE").toLowerCase(),
  );
  if (!useProcessMessage) {
    const content = buildTimeoutFallbackReply(args.text, args.options);
    const nowMs = Date.now();
    await args.admin.from("chat_messages").insert({
      user_id: args.userId,
      scope: "whatsapp",
      role: "user",
      content: args.text,
      created_at: new Date(nowMs).toISOString(),
      metadata: {
        channel: "whatsapp",
        simulated_whatsapp: true,
        simulator_transport: "manual_fallback",
        request_id: args.requestId,
        purpose: args.options?.purpose ?? null,
      },
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await args.admin.from("chat_messages").insert({
      user_id: args.userId,
      scope: "whatsapp",
      role: "assistant",
      content,
      agent_used: "companion",
      created_at: new Date(nowMs + 10).toISOString(),
      metadata: {
        channel: "whatsapp",
        simulated_whatsapp: true,
        simulator_transport: "manual_fallback",
        request_id: args.requestId,
        purpose: args.options?.purpose ?? null,
      },
    } as never);
    return;
  }

  const processPromise = processMessage(
    args.admin,
    args.userId,
    args.text,
    [],
    {
      requestId: args.requestId,
      channel: "whatsapp",
      scope: "whatsapp",
      whatsappMode: args.options?.forceOnboardingFlow ? "onboarding" : "normal",
      forceBrainTrace: true,
    },
    {
      forceMode: args.options?.forceMode,
      contextOverride: args.options?.contextOverride ?? undefined,
      forceOnboardingFlow: args.options?.forceOnboardingFlow,
      messageMetadata: {
        channel: "whatsapp",
        simulated_whatsapp: true,
        simulator_transport: "direct_process_message",
        request_id: args.requestId,
        purpose: args.options?.purpose ?? null,
      },
      disableDebounce: true,
    },
  );
  const response = await withTimeout(
    processPromise,
    envInt("WHATSAPP_WEB_SIM_BRAIN_TIMEOUT_MS", 60_000),
    "whatsapp_web_sim_brain",
  );
  const parsed = extractHiddenFilRougeNote(response.content);
  const requiredQuestion = String(args.options?.requiredQuestion ?? "").trim();
  let patchedContent = String(parsed.visibleText ?? "").trim();
  if (requiredQuestion) {
    const normalizedContent = normalizePreferenceText(patchedContent);
    const normalizedQuestion = normalizePreferenceText(requiredQuestion);
    if (patchedContent && !normalizedContent.includes(normalizedQuestion)) {
      patchedContent = `${patchedContent}\n\n${requiredQuestion}`;
    }
  }
  if (
    patchedContent && patchedContent !== String(response.content ?? "").trim()
  ) {
    const { data: latest } = await args.admin
      .from("chat_messages")
      .select("id,metadata")
      .eq("user_id", args.userId)
      .eq("scope", "whatsapp")
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id) {
      await args.admin
        .from("chat_messages")
        .update({
          content: patchedContent,
          metadata: {
            ...((latest as { metadata?: Record<string, unknown> } | null)
              ?.metadata ?? {}),
            channel: "whatsapp",
            simulated_whatsapp: true,
            simulator_transport: "direct_process_message",
            request_id: args.requestId,
            purpose: args.options?.purpose ?? null,
            hidden_fil_rouge_stripped: Boolean(parsed.note),
          },
        } as never)
        .eq("id", latest.id);
    }
  }
}

function buildTimeoutFallbackReply(
  text: string,
  options?: BrainDirectOptions,
): string {
  const requiredQuestion = String(options?.requiredQuestion ?? "").trim();
  if (requiredQuestion) {
    if (options?.purpose === "onboarding_pref_tone_question") {
      return `Yes, contente de te retrouver ici. Je vais d'abord régler ma façon de t'accompagner pour que ce soit utile sans être lourd.\n\n${requiredQuestion}`;
    }
    return `Parfait, je note.\n\n${requiredQuestion}`;
  }
  if (/outil|aide simple|qu.?est-ce que je peux utiliser/i.test(text)) {
    return "Le plus simple ici, c'est l'outil \"Réduire une action\" : on prend l'action la plus lourde et on la transforme en version 5 minutes, difficulté basse. Tu veux qu'on l'utilise pour ce soir ?";
  }
  if (/oui|vas-y|utilise/i.test(text)) {
    return "Ok, je garde le cap simple pour ce soir : version 5 minutes, difficulté basse. L'objectif, c'est juste de rester dans le mouvement.";
  }
  return "Je te suis. On garde ça simple et concret : dis-moi ce qui bloque le plus maintenant, et on ajuste à partir de là.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, { status: 405 });
  }
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const requestId = getRequestId(req);
  try {
    if (!isEnabled()) {
      return jsonResponse(
        req,
        { error: "WhatsApp web simulation is disabled", request_id: requestId },
        { status: 403 },
      );
    }

    const authHeader = String(req.headers.get("authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const userClient = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_ANON_KEY"),
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const admin = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: authData, error: authError } = await userClient.auth
      .getUser();
    const user = authData.user;
    if (authError || !user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }

    const body = await readBody(req);
    const text = String(body.text ?? body.interactive_title ?? "").trim();
    if (!text) {
      return jsonResponse(
        req,
        { error: "Missing text", request_id: requestId },
        { status: 400 },
      );
    }

    const profileState = await loadProfileState(admin, user.id);
    const options = await prepareWhatsAppSimOnboardingTurn({
      admin,
      userId: user.id,
      body,
      text,
      profileState,
      requestId,
    });
    await runSophiaBrainDirect({
      admin,
      userId: user.id,
      requestId,
      text,
      options,
    });
    return jsonResponse(
      req,
      {
        ok: true,
        queued: false,
        transport: ["1", "true", "yes", "on"].includes(
            env("WHATSAPP_WEB_SIM_USE_PROCESS_MESSAGE").toLowerCase(),
          )
          ? "direct_brain"
          : "manual_fallback",
        purpose: options.purpose ?? null,
        request_id: requestId,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(
      req,
      { error: message, request_id: requestId },
      { status: 500 },
    );
  }
});
