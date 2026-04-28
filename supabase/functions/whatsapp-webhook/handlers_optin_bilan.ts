import { analyzeSignalsV2 } from "../sophia-brain/router/dispatcher.ts";
import { classifyWinbackReplyIntent } from "../_shared/whatsapp_winback.ts";
import { getActiveTransformationRuntime } from "../_shared/v2-runtime.ts";
import {
  loadOnboardingContext,
  setDeferredOnboardingSteps,
} from "./onboarding_helpers.ts";
import { buildAdaptiveOnboardingContext } from "./onboarding_context.ts";

declare const Deno: any;
export async function computeOptInAndBilanContext(params) {
  async function hasRecentOptInPrompt(admin, userId) {
    const since = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() // 30h window
    ;
    const { data, error } = await admin.from("chat_messages").select(
      "id, metadata, created_at",
    ).eq("user_id", userId).eq("role", "assistant").gte("created_at", since)
      .filter("metadata->>channel", "eq", "whatsapp").filter(
        "metadata->>purpose",
        "eq",
        "optin",
      ).order("created_at", {
        ascending: false,
      }).limit(1).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  const isOptInYes = params.actionId === "OPTIN_YES" ||
    (params.isOptInYesText
      ? await hasRecentOptInPrompt(params.admin, params.userId)
      : false);
  async function getRecentBilanPromptPurpose(admin, userId) {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() // 6h window
    ;
    const { data, error } = await admin
      .from("chat_messages")
      .select("id, content, metadata, created_at")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .gte("created_at", since)
      .filter("metadata->>channel", "eq", "whatsapp")
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    const purpose = String((data as any)?.metadata?.purpose ?? "").trim();
    return purpose === "daily_bilan_winback" ? purpose : null;
  }
  // Always check DB for recent bilan prompt — no longer gated by regex match.
  // This allows free-form responses ("non je suis pas dispo") to be recognized as bilan context.
  const recentBilanPurpose = await getRecentBilanPromptPurpose(
    params.admin,
    params.userId,
  );
  return {
    isOptInYes,
    recentBilanPurpose,
  };
}
async function analyzeSignalsForWhatsApp(text, requestId) {
  const raw = (text ?? "").trim();
  const result = await analyzeSignalsV2({
    userMessage: raw,
    lastAssistantMessage: "",
    last5Messages: [
      {
        role: "user",
        content: raw,
      },
    ],
    signalHistory: [],
    activeMachine: null,
    stateSnapshot: {
      current_mode: "companion",
    },
  }, {
    requestId,
  });
  return result.signals;
}
async function detectAdaptiveFlow(inboundText, requestId) {
  // Default: normal flow with all steps
  const defaultResult = {
    flow: "normal",
    deferredSteps: [],
    detectedTopic: undefined,
  };
  const text = (inboundText ?? "").trim();
  if (!text) return defaultResult;
  try {
    const signals = await analyzeSignalsForWhatsApp(inboundText, requestId);
    const topicDepth = (signals as any)?.topic_depth;
    // SCENARIO A: Urgency detected (safety or NEED_SUPPORT)
    const isUrgent = signals.safety.level !== "NONE" ||
      topicDepth?.value === "NEED_SUPPORT" &&
        (topicDepth?.confidence ?? 0) >= 0.7;
    if (isUrgent) {
      const forceMode = signals.safety.level === "SENTRY"
        ? "sentry"
        : "companion";
      return {
        flow: "urgent",
        deferredSteps: [
          "motivation",
          "personal_fact",
        ],
        forceMode,
        detectedTopic: undefined,
      };
    }
    // SCENARIO B: Serious topic (not urgent but deep)
    const isSerious = topicDepth?.value === "SERIOUS" &&
      (topicDepth?.confidence ?? 0) >= 0.6;
    if (isSerious) {
      return {
        flow: "serious_topic",
        deferredSteps: [
          "motivation",
        ],
        detectedTopic: undefined,
      };
    }
    // SCENARIO C: Normal (calm mood, no urgency)
    return defaultResult;
  } catch (e) {
    console.warn("[handlers_optin_bilan] detectAdaptiveFlow error:", e);
    return defaultResult;
  }
}
// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
export async function handleOptInAndDailyBilanActions(params) {
  const actionId = String(params.actionId ?? "").trim().toLowerCase();
  const textLower = String(params.textLower ?? params.inboundText ?? "").trim()
    .toLowerCase();
  const recentPurpose = String(params.recentBilanPurpose ?? "").trim();
  if (recentPurpose === "daily_bilan_winback") {
    const winbackIntent = classifyWinbackReplyIntent({
      actionId,
      text: params.inboundText,
    });
    const nowIso = new Date().toISOString();
    const patchBase: Record<string, any> = {
      whatsapp_bilan_opted_in: true,
      whatsapp_bilan_missed_streak: 0,
      whatsapp_bilan_winback_step: 0,
      whatsapp_bilan_last_winback_at: nowIso,
      whatsapp_bilan_paused_until: null,
    };
    if (winbackIntent === "pause_short") {
      patchBase.whatsapp_bilan_paused_until = new Date(
        Date.now() + 3 * 24 * 60 * 60 * 1000,
      ).toISOString();
    }
    if (winbackIntent === "pause_week") {
      patchBase.whatsapp_bilan_paused_until = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
    }
    if (winbackIntent === "wait_for_user") {
      patchBase.whatsapp_bilan_paused_until = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
    }
    await params.admin.from("profiles").update(patchBase).eq(
      "id",
      params.userId,
    );
    if (winbackIntent === "pause_short") {
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_winback_pause_ack",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride: `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur veut qu'on lui laisse un peu d'espace avant toute reprise.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Confirme simplement que tu lui laisses quelques jours.\n` +
          `- Pas de mention du bilan.\n` +
          `- Message court (1-2 phrases), chaleureux, sans question.\n`,
      });
      return true;
    }
    if (winbackIntent === "pause_week") {
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_winback_pause_week_ack",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride: `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur veut qu'on lui laisse de l'espace cette semaine.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Confirme calmement que tu lui laisses la semaine.\n` +
          `- Pas de mention du bilan.\n` +
          `- Message court (1-2 phrases), sans question.\n`,
      });
      return true;
    }
    if (winbackIntent === "wait_for_user") {
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_winback_wait_ack",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride: `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur prefere revenir de lui-meme plus tard.\n\n` +
          `CONSIGNE DE TOUR:\n` +
          `- Confirme simplement que tu lui laisses la main.\n` +
          `- Dis qu'il peut te recrire quand il veut.\n` +
          `- Pas de mention du bilan.\n` +
          `- Message court (1-2 phrases), sans question.\n`,
      });
      return true;
    }
    if (winbackIntent === "simplify") {
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_winback_simplify_ai",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride: `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur repond a un message de reprise et veut quelque chose de plus simple.\n\n` +
          `CONSIGNE DE TOUR:\n` + `- Tu ne lances PAS un bilan.\n` +
          `- Tu repars tres doucement, version simple et basse pression.\n` +
          `- Une seule question maximum.\n` +
          `- Ton message doit sonner humain, pas procedural.\n`,
      });
      return true;
    }
    if (winbackIntent === "resume") {
      await params.replyWithBrain({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        inboundText: params.inboundText,
        requestId: params.requestId,
        replyToWaMessageId: params.waMessageId,
        purpose: "daily_bilan_winback_resume_ai",
        whatsappMode: "normal",
        forceMode: "companion",
        contextOverride: `=== CONTEXTE WHATSAPP ===\n` +
          `L'utilisateur repond positivement a un message de reprise.\n\n` +
          `CONSIGNE DE TOUR:\n` + `- Tu ne lances PAS un bilan.\n` +
          `- Tu repars doucement dans la conversation, sans pression.\n` +
          `- Une seule question maximum, tres legere.\n` +
          `- Ton message doit sonner humain, pas procedural.\n`,
      });
      return true;
    }
    await params.replyWithBrain({
      admin: params.admin,
      userId: params.userId,
      fromE164: params.fromE164,
      inboundText: params.inboundText,
      requestId: params.requestId,
      replyToWaMessageId: params.waMessageId,
      purpose: "daily_bilan_winback_freeform_ai",
      whatsappMode: "normal",
      forceMode: "companion",
      contextOverride: `=== CONTEXTE WHATSAPP ===\n` +
        `L'utilisateur repond librement a un message de reprise.\n\n` +
        `CONSIGNE DE TOUR:\n` +
        `- Tu prends appui sur ce qu'il vient de dire.\n` +
        `- Tu ne lances PAS un bilan.\n` +
        `- Tu repars doucement dans l'echange, sans pression ni recap global.\n` +
        `- Une seule question maximum.\n`,
    });
    return true;
  }
  // If this is the opt-in "Oui", answer with a welcome message (adaptive flow)
  if (params.isOptInYes) {
    // Load onboarding context in parallel with other data
    const [onboardingCtx, planResult, adaptiveFlow] = await Promise.all([
      loadOnboardingContext(
        params.admin,
        params.userId,
        params.inboundText ?? "onboarding",
      ),
      getActiveTransformationRuntime(params.admin, params.userId),
      detectAdaptiveFlow(params.inboundText ?? "Oui", params.requestId),
    ]);
    const planTitle = String(planResult.plan?.title ?? "").trim();
    const prenom = (params.fullName ?? "").trim().split(" ")[0] || "";
    // Update profile: enable daily bilan opt-in
    await params.admin.from("profiles").update({
      whatsapp_bilan_opted_in: true,
    }).eq("id", params.userId);
    // Store deferred steps if any
    if (adaptiveFlow.deferredSteps.length > 0) {
      await setDeferredOnboardingSteps(
        params.admin,
        params.userId,
        adaptiveFlow.deferredSteps,
      );
    }
    // Build context with personalization
    const contextBase = buildAdaptiveOnboardingContext({
      flow: adaptiveFlow.flow,
      state: "optin_welcome",
      siteUrl: params.siteUrl,
      supportEmail:
        (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai")
          .trim(),
      planPolicy: planTitle ? "plan_active" : "no_plan",
      profileFacts: onboardingCtx.profileFacts,
      memories: onboardingCtx.memories,
      isReturningUser: onboardingCtx.isReturning,
      detectedTopic: adaptiveFlow.detectedTopic,
    });
    // Build turn instructions based on flow
    const turnInstructions = buildOptInTurnInstructions({
      flow: adaptiveFlow.flow,
      prenom,
      planTitle,
      siteUrl: params.siteUrl,
      isReturning: onboardingCtx.isReturning,
      detectedTopic: adaptiveFlow.detectedTopic,
    });
    // Determine next state based on flow and plan
    // IMPORTANT: set BEFORE replyWithBrain so that processMessage sees onboarding_q1
    // and the dispatcher Q1_ask add-on generates the first Q1 question.
    const nextState = determineNextState(adaptiveFlow.flow, Boolean(planTitle));
    await params.admin.from("profiles").update({
      whatsapp_state: nextState,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", params.userId);
    await params.replyWithBrain({
      admin: params.admin,
      userId: params.userId,
      fromE164: params.fromE164,
      inboundText: params.inboundText ?? "Oui",
      requestId: params.requestId,
      replyToWaMessageId: params.waMessageId,
      purpose: `optin_yes_welcome_ai_${adaptiveFlow.flow}`,
      whatsappMode: adaptiveFlow.flow === "normal" ? "onboarding" : "normal",
      forceMode: adaptiveFlow.forceMode ?? "companion",
      contextOverride: `${contextBase}\n\n${turnInstructions}`,
    });
    return true;
  }
  return false;
}
// ═══════════════════════════════════════════════════════════════════════════════
// TURN INSTRUCTIONS BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
function buildOptInTurnInstructions(opts) {
  const { flow, prenom, planTitle, siteUrl, isReturning, detectedTopic } = opts;
  const welcomeStyle = isReturning
    ? `- Welcome court: "Content de te retrouver ici${
      prenom ? `, ${prenom}` : ""
    } !"`
    : `- Welcome chaleureux mais pas trop long.`;
  // FLOW: URGENT
  if (flow === "urgent") {
    return [
      "CONSIGNE DE TOUR (URGENCE):",
      welcomeStyle,
      "- L'utilisateur arrive avec un besoin urgent.",
      "- Réponds d'abord à son besoin/souci avec empathie.",
      "- PAS de question onboarding maintenant.",
      "- 1 question max pour clarifier ou avancer.",
    ].join("\n");
  }
  // FLOW: SERIOUS TOPIC
  if (flow === "serious_topic") {
    return [
      "CONSIGNE DE TOUR (SUJET SÉRIEUX):",
      welcomeStyle,
      detectedTopic ? `- Sujet détecté: "${detectedTopic}"` : "",
      "- L'utilisateur a un sujet important à discuter.",
      "- Accueille, puis ouvre sur son sujet avec 1 question.",
      "- PAS de question onboarding maintenant.",
      "- Sois présent et à l'écoute.",
    ].filter(Boolean).join("\n");
  }
  // FLOW: NORMAL (with or without plan)
  // When a plan exists, the dispatcher's Q1_ask add-on handles the onboarding question.
  // The welcome just provides warm context — no need to duplicate Q1 here.
  if (planTitle) {
    return [
      "CONSIGNE DE TOUR (NORMAL + PLAN):",
      welcomeStyle,
      `- Prénom: "${prenom}".`,
      `- Plan actif: "${planTitle}".`,
      "- Message court, chaleureux, pro (WhatsApp).",
    ].join("\n");
  }
  return [
    "CONSIGNE DE TOUR (NORMAL SANS PLAN):",
    welcomeStyle,
    `- Prénom: "${prenom}".`,
    "- Aucun plan actif détecté.",
    "- Message court, chaleureux, pro (WhatsApp).",
    "- Explique que tu ne vois pas encore de plan actif.",
    `- Demande de finaliser sur le site: ${siteUrl}`,
    `- IMPORTANT: quand tu mentionnes le site, colle exactement ce lien (${siteUrl}). N'utilise aucun autre domaine.`,
    `- Termine par une question simple de confirmation (pas de phrase exacte).`,
    `- Exemple: "Dis-moi quand c'est fait et je continue ici."`,
    "- N'ajoute pas de markdown.",
  ].join("\n");
}
// ═══════════════════════════════════════════════════════════════════════════════
// STATE DETERMINATION
// ═══════════════════════════════════════════════════════════════════════════════
function determineNextState(flow, hasPlan) {
  // Urgent or serious: go to normal mode (no onboarding gating)
  if (flow === "urgent" || flow === "serious_topic") {
    return null;
  }
  // Normal flow: warm onboarding (Q1 experience) or plan finalization
  return hasPlan ? "onboarding_q1" : "awaiting_plan_finalization";
}
