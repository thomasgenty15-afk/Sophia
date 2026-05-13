import { buildWhatsAppOnboardingContext } from "./onboarding_context.ts";
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts";
import { analyzeSignalsV2 } from "../sophia-brain/router/dispatcher.ts";
import { getActiveTransformationRuntime } from "../_shared/v2-runtime.ts";
import { loadOnboardingContext } from "./onboarding_helpers.ts";
import { runUpdateCoachPreferencesIntake } from "../sophia-brain/tools/operations/update_coach_preferences/intake.ts";
import type { CoachPreferenceKey } from "../sophia-brain/tools/operations/_shared/operation_payload_builder.ts";

async function replyWithGuidedOnboardingBrain(params: any) {
  const onboardingCtx = await loadOnboardingContext(
    params.admin,
    params.userId,
    params.inboundText ?? "",
  ).catch(() => ({
    profileFacts: {},
    memories: [],
    isReturning: false,
    hasWebHistory: false,
    hasWhatsAppHistory: false,
  }));
  const personalization = buildWhatsAppOnboardingContext({
    siteUrl: params.siteUrl,
    profileFacts: onboardingCtx.profileFacts,
    memories: onboardingCtx.memories,
    isReturning: onboardingCtx.isReturning,
    hasWebHistory: onboardingCtx.hasWebHistory,
    hasWhatsAppHistory: onboardingCtx.hasWhatsAppHistory,
  });
  const contextOverride = [
    personalization,
    "=== CONTEXTE WHATSAPP SIMULATION: ONBOARDING GUIDE ===",
    `Etape recue: ${params.previousStep}.`,
    params.savedPreferenceKey
      ? `Preference detectee et stockee: ${params.savedPreferenceKey}=${params.savedPreferenceValue}.`
      : null,
    `Etape suivante: ${params.nextStep}.`,
    "",
    "CONSIGNE DE TOUR:",
    "- Tu dois repondre via la conversation Sophia, pas comme un formulaire administratif.",
    params.savedPreferenceKey
      ? "- Accuse reception naturellement de la preference, en 1 phrase maximum."
      : "- Accuse reception naturellement du message utilisateur, en 1 phrase maximum.",
    "- Pose ensuite LA question de l'etape suivante, avec un ton WhatsApp naturel.",
    "- INTERDICTION de poser une autre question que la question imposee ci-dessous.",
    "- Ne redemande jamais l'etape precedente: le systeme a deja tranche et stocke ce qu'il fallait, meme si la reponse utilisateur etait imparfaite.",
    "- Ne cite pas les options d'une etape precedente.",
    "- Ne lance aucune action du plan maintenant.",
    "- Ne parle pas de mission, habitude, sas, zone de dechargement, action du jour, exercice ou petit pas.",
    "- Ne dis pas que tu as un 'mode d'emploi' technique.",
    "- Message court: 2-3 phrases maximum.",
    `Question imposee a poser exactement en fin de message: "${params.requiredQuestion}"`,
    "=== FIN CONTEXTE WHATSAPP SIMULATION ===",
  ].filter(Boolean).join("\n");

  await params.replyWithBrain({
    admin: params.admin,
    userId: params.userId,
    fromE164: params.fromE164,
    inboundText: params.inboundText || "Ok",
    requestId: params.requestId,
    replyToWaMessageId: params.waMessageId,
    purpose: params.purpose,
    whatsappMode: "onboarding",
    forceMode: "companion",
    forceOnboardingFlow: true,
    contextOverride,
    requiredVisibleEnding: params.requiredQuestion,
  });
}

async function finishWhatsAppOnboarding(params: any) {
  const nowIso = new Date().toISOString();
  const { data: stateRow } = await params.admin
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", params.userId)
    .eq("scope", "whatsapp")
    .maybeSingle();
  const tempMemory = {
    ...(((stateRow as any)?.temp_memory ?? {}) as Record<string, unknown>),
    __whatsapp_onboarding_done: {
      completed_at: nowIso,
      source: "whatsapp_topic_choice_received",
    },
  };
  delete (tempMemory as Record<string, unknown>).__onboarding_active;
  const baseState = {
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
  };
  await params.admin
    .from("user_chat_states")
    .upsert(baseState, { onConflict: "user_id,scope" });
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
  ) {
    return "eleve";
  }
  if (/leger|doucement|peu|low|pas trop|minimum/.test(s)) return "leger";
  return "modere";
}

function inferQuestionPreference(raw: unknown) {
  const s = normalizePreferenceText(raw);
  if (/peu|moins|rare|minimum|pas trop/.test(s)) return "peu_de_questions";
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

function uuidOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(text)
    ? text
    : null;
}

async function persistCoachPreferenceViaOperation(params: {
  admin: any;
  userId: string;
  key: CoachPreferenceKey;
  value: string;
  requestId: string;
  sourceMessageId?: string | null;
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
    trigger_message_id: params.sourceMessageId ?? params.requestId,
    safety_pregate_risk_band: "none",
    operation_input: { requested_patch: requestedPatch },
  });
  if (operation.status !== "pending_confirmation" || !operation.draft) {
    throw new Error(`coach_preference_operation_failed:${operation.status}`);
  }
  const draft = operation.draft;
  const nowIso = new Date().toISOString();
  const sourceMessageUuid = uuidOrNull(params.sourceMessageId);
  const rows = Object.entries(draft.draft.patch).map(([key, raw]) => {
    const value = String(raw);
    return {
      user_id: params.userId,
      scope: "global",
      key,
      value: {
        value,
        label: coachPreferenceLabel(key, value),
      },
      status: "active",
      confidence: 1,
      source_type: "explicit_user",
      last_source_message_id: sourceMessageUuid,
      reason:
        `operation:update_coach_preferences:${draft.draft.summary}; wa_message_id=${
          params.sourceMessageId ?? "unknown"
        }`,
      updated_at: nowIso,
      last_confirmed_at: nowIso,
    };
  });
  const { error } = await params.admin
    .from("user_profile_facts")
    .upsert(rows as any, { onConflict: "user_id,scope,key" });
  if (error) throw error;
  return operation;
}

async function getLastAssistantMessage(admin: any, userId: string) {
  const { data } = await admin.from("chat_messages").select(
    "content, created_at",
  ).eq("user_id", userId).eq("scope", "whatsapp").eq("role", "assistant").order(
    "created_at",
    {
      ascending: false,
    },
  ).limit(1).maybeSingle();
  return String(data?.content ?? "");
}
async function countRecentAssistantPurpose(params: any) {
  const sinceIso = new Date(Date.now() - params.withinMs).toISOString();
  const { count } = await params.admin.from("chat_messages").select("id", {
    count: "exact",
    head: true,
  }).eq("user_id", params.userId).eq("scope", "whatsapp").eq(
    "role",
    "assistant",
  ).gte("created_at", sinceIso).filter(
    "metadata->>purpose",
    "eq",
    params.purpose,
  );
  return Number(count ?? 0) || 0;
}
async function analyzeSignalsForWhatsApp(params: any) {
  const raw = (params.text ?? "").trim();
  const lastAssistant = params.lastAssistantMessage ?? "";
  const last5Messages = lastAssistant
    ? [
      {
        role: "assistant",
        content: lastAssistant,
      },
      {
        role: "user",
        content: raw,
      },
    ]
    : [
      {
        role: "user",
        content: raw,
      },
    ];
  const result = await analyzeSignalsV2({
    userMessage: raw,
    lastAssistantMessage: lastAssistant,
    last5Messages,
    signalHistory: [],
    activeMachine: null,
    stateSnapshot: params.stateSnapshot ?? {
      current_mode: "companion",
    },
  }, {
    requestId: params.requestId,
  });
  return result.signals;
}
export async function handleOnboardingState(params: any) {
  const {
    admin,
    userId,
    whatsappState,
    fromE164,
    requestId,
    waMessageId,
    text,
    siteUrl,
    replyWithBrain,
    sendWhatsAppText,
  } = params;
  const st = String(whatsappState || "").trim();
  if (st === "onboarding_pref_tone") {
    const tone = inferTonePreference(text);
    await persistCoachPreferenceViaOperation({
      admin,
      userId,
      key: "coach.tone",
      value: tone,
      requestId,
      sourceMessageId: waMessageId,
    });
    await admin.from("profiles").update({
      whatsapp_state: "onboarding_pref_challenge",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId);
    await replyWithGuidedOnboardingBrain({
      admin,
      userId,
      fromE164,
      requestId,
      waMessageId,
      siteUrl,
      replyWithBrain,
      inboundText: text,
      purpose: "onboarding_pref_challenge_question",
      previousStep: "preference_tone",
      savedPreferenceKey: "coach.tone",
      savedPreferenceValue: tone,
      nextStep: "preference_challenge_level",
      requiredQuestion:
        "Tu préfères que je te challenge comment quand tu décroches : plutôt léger, normal, ou assez direct ?",
    });
    return true;
  }
  if (st === "onboarding_pref_challenge") {
    const challenge = inferChallengePreference(text);
    await persistCoachPreferenceViaOperation({
      admin,
      userId,
      key: "coach.challenge_level",
      value: challenge,
      requestId,
      sourceMessageId: waMessageId,
    });
    await admin.from("profiles").update({
      whatsapp_state: "onboarding_pref_questions",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId);
    await replyWithGuidedOnboardingBrain({
      admin,
      userId,
      fromE164,
      requestId,
      waMessageId,
      siteUrl,
      replyWithBrain,
      inboundText: text,
      purpose: "onboarding_pref_questions_question",
      previousStep: "preference_challenge_level",
      savedPreferenceKey: "coach.challenge_level",
      savedPreferenceValue: challenge,
      nextStep: "preference_question_tendency",
      requiredQuestion:
        "Dernier réglage : tu préfères que je pose peu de questions, que je creuse un peu, ou que je te questionne franchement quand ça aide ?",
    });
    return true;
  }
  if (st === "onboarding_pref_questions") {
    const questionTendency = inferQuestionPreference(text);
    await persistCoachPreferenceViaOperation({
      admin,
      userId,
      key: "coach.question_tendency",
      value: questionTendency,
      requestId,
      sourceMessageId: waMessageId,
    });
    await admin.from("profiles").update({
      whatsapp_state: "onboarding_plan_creation_feedback",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId);
    await replyWithGuidedOnboardingBrain({
      admin,
      userId,
      fromE164,
      requestId,
      waMessageId,
      siteUrl,
      replyWithBrain,
      inboundText: text,
      purpose: "onboarding_plan_creation_feedback_question",
      previousStep: "preference_question_tendency",
      savedPreferenceKey: "coach.question_tendency",
      savedPreferenceValue: questionTendency,
      nextStep: "plan_creation_feedback",
      requiredQuestion:
        "Avant qu’on passe à la suite : la création de ton plan, ça s’est passé comment pour toi ? Tu es content du résultat ?",
    });
    return true;
  }
  if (st === "onboarding_plan_creation_feedback") {
    await admin.from("profiles").update({
      whatsapp_state: "onboarding_topic_choice",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId);
    await replyWithGuidedOnboardingBrain({
      admin,
      userId,
      fromE164,
      requestId,
      waMessageId,
      siteUrl,
      replyWithBrain,
      inboundText: text,
      purpose: "onboarding_topic_choice_question",
      previousStep: "plan_creation_feedback",
      nextStep: "topic_choice_then_normal_conversation",
      requiredQuestion:
        "Pour commencer maintenant, tu veux qu’on parle de ton plan, ou d’autre chose qui te paraît plus important ?",
    });
    return true;
  }
  if (st === "onboarding_topic_choice") {
    await admin.from("profiles").update({
      whatsapp_state: null,
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId);
    await finishWhatsAppOnboarding({
      admin,
      userId,
    });
    return false;
  }
  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE: awaiting_plan_finalization
  // ═══════════════════════════════════════════════════════════════════════════════
  if (st === "awaiting_plan_finalization") {
    const raw = String(text ?? "").trim();
    const saysDoneFast = params.isDonePhrase(raw);
    let decision = saysDoneFast ? "done" : "not_done";
    let signals = null;
    if (!saysDoneFast && raw) {
      const lastAssistant = await getLastAssistantMessage(admin, userId).catch(
        () => "",
      );
      signals = await analyzeSignalsForWhatsApp({
        text: raw,
        lastAssistantMessage: lastAssistant,
        requestId,
        stateSnapshot: {
          current_mode: "companion",
          plan_confirm_pending: true,
        },
      });
      const signalAny = signals as any;
      const ack = Number(signalAny?.flow_resolution?.confidence ?? 0);
      const isAck =
        String(signalAny?.flow_resolution?.kind ?? "NONE") === "ACK_DONE";
      const planConf = Number(signalAny?.user_intent_confidence ?? 0);
      const isPlan = Boolean(signalAny?.topic_depth?.plan_focus);
      if (isAck && ack >= 0.7) {
        decision = "done";
      } else if (isAck && ack >= 0.45) {
        decision = "uncertain";
      } else if (isPlan && planConf >= 0.75) {
        decision = "uncertain";
      } else {
        decision = "not_done";
      }
      // Safety bail-out: if user is in distress, exit onboarding immediately
      const isSafetySignal =
        signals?.safety?.level && signals.safety.level !== "NONE" ||
        signalAny?.topic_depth?.value === "NEED_SUPPORT" &&
          (signalAny.topic_depth?.confidence ?? 0) >= 0.7;
      if (isSafetySignal) {
        await admin.from("profiles").update({
          whatsapp_state: null,
          whatsapp_state_updated_at: new Date().toISOString(),
        }).eq("id", userId);
        return false // fall through to normal brain pipeline (handles safety routing)
        ;
      }
    }
    // Load context for personalization
    const onboardingCtx = await loadOnboardingContext(admin, userId, raw).catch(
      () => ({
        profileFacts: {},
        memories: [],
        isReturning: false,
        hasWebHistory: false,
        hasWhatsAppHistory: false,
      }),
    );
    if (decision === "uncertain") {
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Ok",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_finalization_confirm_intent",
        whatsappMode: "onboarding",
        forceMode: "companion",
        contextOverride: buildWhatsAppOnboardingContext({
          state: "awaiting_plan_finalization",
          siteUrl,
          supportEmail:
            (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai")
              .trim(),
          planPolicy: "no_plan",
          phase: "onboarding",
          profileFacts: onboardingCtx.profileFacts,
          memories: onboardingCtx.memories,
          isReturningUser: onboardingCtx.isReturning,
        }) + `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user a répondu de façon ambigüe.\n` +
          `- Priorité: confirmer si le user veut dire "j'ai bien activé/finalisé mon plan sur le site".\n` +
          `- Pose UNE seule question fermée (oui/non), très simple.\n` +
          `- Exemple: "Tu veux dire que ton plan est bien activé sur le site (dashboard) ? (Oui / Pas encore)"\n`,
      });
      return true;
    }
    if (decision !== "done") {
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Salut",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_finalization_soft_reply",
        whatsappMode: "onboarding",
        contextOverride: buildWhatsAppOnboardingContext({
          state: "awaiting_plan_finalization",
          siteUrl,
          supportEmail:
            (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai")
              .trim(),
          planPolicy: "no_plan",
          phase: "onboarding",
          profileFacts: onboardingCtx.profileFacts,
          memories: onboardingCtx.memories,
          isReturningUser: onboardingCtx.isReturning,
        }) + `\n\nCONSIGNE DE TOUR:\n` +
          `- Réponds au message de l'utilisateur.\n` +
          `- Puis rappelle en 1 phrase: finaliser/activer le plan sur le site.\n` +
          `- Termine par une question courte de confirmation (pas de phrase exacte).\n` +
          `- Exemple: "Dis-moi quand c'est fait et je continue ici."\n`,
      });
      return true;
    }
    // They say "done": re-check if an active plan exists now.
    const maybeFact = params.extractAfterDonePhrase(raw);
    void maybeFact;
    const runtime = await getActiveTransformationRuntime(admin, userId);
    const planTitle = String(runtime.plan?.title ?? "").trim();
    if (!planTitle) {
      const priorStillMissing = await countRecentAssistantPurpose({
        admin,
        userId,
        purpose: "awaiting_plan_finalization_still_missing_soft",
        withinMs: 6 * 60 * 60 * 1000,
      });
      if (priorStillMissing >= 1) {
        const SUPPORT_ESCALATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
        const alreadyEscalatedRecently = await countRecentAssistantPurpose({
          admin,
          userId,
          purpose: "awaiting_plan_finalization_support_escalation",
          withinMs: SUPPORT_ESCALATION_COOLDOWN_MS,
        });
        const supportEmail =
          (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai")
            .trim();
        if (alreadyEscalatedRecently === 0) {
          const txt =
            "Ok, je te crois — là ça ressemble à un souci de synchro/bug.\n\n" +
            `Pour ne pas tourner en rond: écris à ${supportEmail} avec:\n` +
            "- l'email de ton compte\n" + "- une capture de ton dashboard\n" +
            "- ton téléphone + navigateur (ex: iPhone/Safari)\n\n" +
            "En attendant: dis-moi ton objectif #1 en 1 phrase et je te propose un premier pas simple aujourd'hui.";
          const sendResp = await sendWhatsAppTextTracked({
            admin,
            requestId,
            userId,
            toE164: fromE164,
            body: txt,
            purpose: "awaiting_plan_finalization_support_escalation",
            isProactive: false,
            replyToWaMessageId: waMessageId,
          });
          const outId = sendResp?.messages?.[0]?.id ?? null;
          const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
          await admin.from("chat_messages").insert({
            user_id: userId,
            scope: "whatsapp",
            role: "assistant",
            content: txt,
            agent_used: "companion",
            metadata: {
              channel: "whatsapp",
              wa_outbound_message_id: outId,
              outbound_tracking_id: outboundTrackingId,
              is_proactive: false,
              purpose: "awaiting_plan_finalization_support_escalation",
            },
          });
        }
        await admin.from("profiles").update({
          whatsapp_state: "awaiting_plan_finalization_support",
          whatsapp_state_updated_at: new Date().toISOString(),
        }).eq("id", userId);
        if (alreadyEscalatedRecently > 0) {
          await replyWithBrain({
            admin,
            userId,
            fromE164,
            inboundText: raw || "Ok",
            requestId,
            replyToWaMessageId: waMessageId,
            purpose: "awaiting_plan_support_coach_off_app",
            whatsappMode: "onboarding",
            contextOverride: buildWhatsAppOnboardingContext({
              state: "awaiting_plan_finalization_support",
              siteUrl,
              supportEmail,
              planPolicy: "no_plan",
              phase: "support_fallback",
              profileFacts: onboardingCtx.profileFacts,
              memories: onboardingCtx.memories,
              isReturningUser: onboardingCtx.isReturning,
            }) + `\n\nCONSIGNE DE TOUR:\n` +
              `- L'utilisateur est bloqué. Ne répète pas le support/email/capture (déjà envoyé récemment).\n` +
              `- Avance hors-app: propose 1 petit pas aujourd'hui, basé sur son objectif/problème.\n` +
              `- 1 question max.\n`,
          });
        }
        return true;
      }
      await replyWithBrain({
        admin,
        userId,
        fromE164,
        inboundText: raw || "Ok",
        requestId,
        replyToWaMessageId: waMessageId,
        purpose: "awaiting_plan_finalization_still_missing_soft",
        whatsappMode: "onboarding",
        contextOverride: buildWhatsAppOnboardingContext({
          state: "awaiting_plan_finalization",
          siteUrl,
          supportEmail:
            (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai")
              .trim(),
          planPolicy: "no_plan",
          phase: "onboarding",
          profileFacts: onboardingCtx.profileFacts,
          memories: onboardingCtx.memories,
          isReturningUser: onboardingCtx.isReturning,
        }) + `\n\nCONSIGNE DE TOUR:\n` +
          `- Le user dit "c'est bon" mais aucun plan n'est visible.\n` +
          `- Réponds gentiment (sans contredire agressivement).\n` +
          `- Propose 1 explication simple: délai de synchro.\n` +
          `- Propose 1 seul essai (recharger/attendre 2 min).\n` +
          `- Termine par une question courte de confirmation après cet essai (pas de phrase exacte).\n`,
      });
      return true;
    }
    // Plan is active: transition to onboarding Q1 (managed by dispatcher/router).
    // Set whatsapp_state = "onboarding_q1" and return false so the message falls through
    // to the default brain call, where processMessage picks up the onboarding machine.
    await admin.from("profiles").update({
      whatsapp_state: "onboarding_q1",
      whatsapp_state_updated_at: new Date().toISOString(),
    }).eq("id", userId);
    return false // fall through to brain → dispatcher handles Q1
    ;
  }
  // ═══════════════════════════════════════════════════════════════════════════════
  // STATES: onboarding_q1, onboarding_q2, onboarding_q3
  // These are now managed by the dispatcher/router (not intercepted here).
  // The webhook falls through to the default brain call, which runs processMessage.
  // ═══════════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE: awaiting_plan_finalization_support
  // ═══════════════════════════════════════════════════════════════════════════════
  if (st === "awaiting_plan_finalization_support") {
    const raw = String(text ?? "").trim();
    const supportEmail =
      (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai")
        .trim();
    const escalatedRecently = await countRecentAssistantPurpose({
      admin,
      userId,
      purpose: "awaiting_plan_finalization_support_escalation",
      withinMs: 24 * 60 * 60 * 1000,
    });
    const runtime = await getActiveTransformationRuntime(admin, userId);
    // Load context for personalization
    const onboardingCtx = await loadOnboardingContext(admin, userId, raw).catch(
      () => ({
        profileFacts: {},
        memories: [],
        isReturning: false,
        hasWebHistory: false,
        hasWhatsAppHistory: false,
      }),
    );
    const planTitle = String(runtime.plan?.title ?? "").trim();
    if (planTitle) {
      // Plan detected — check if user already completed onboarding before transitioning to Q1.
      const { data: obCheck } = await admin.from("profiles").select(
        "onboarding_completed",
      ).eq("id", userId).maybeSingle();
      if (obCheck?.onboarding_completed) {
        // Already onboarded — clear stale state and fall through to normal brain pipeline.
        await admin.from("profiles").update({
          whatsapp_state: null,
          whatsapp_state_updated_at: new Date().toISOString(),
        }).eq("id", userId);
        return false;
      }
      // Transition to onboarding Q1 (managed by dispatcher/router)
      await admin.from("profiles").update({
        whatsapp_state: "onboarding_q1",
        whatsapp_state_updated_at: new Date().toISOString(),
      }).eq("id", userId);
      return false // fall through to brain → dispatcher handles Q1
      ;
    }
    await replyWithBrain({
      admin,
      userId,
      fromE164,
      inboundText: raw || "Ok",
      requestId,
      replyToWaMessageId: waMessageId,
      purpose: "awaiting_plan_support_coach_off_app",
      whatsappMode: "onboarding",
      contextOverride: buildWhatsAppOnboardingContext({
        state: "awaiting_plan_finalization_support",
        siteUrl,
        supportEmail,
        planPolicy: "no_plan",
        phase: "support_fallback",
        profileFacts: onboardingCtx.profileFacts,
        memories: onboardingCtx.memories,
        isReturningUser: onboardingCtx.isReturning,
      }) + `\n\nCONSIGNE DE TOUR:\n` +
        `- L'utilisateur est bloqué. Ne répète pas "finalise ton plan" en boucle.\n` +
        `${
          escalatedRecently > 0
            ? `- Ne répète pas le support/email/capture (déjà envoyé récemment).\n`
            : `- Si nécessaire, donne le contact support: ${supportEmail} (1 fois).\n`
        }` +
        `- Avance hors-app: propose 1 petit pas aujourd'hui, basé sur son objectif/problème.\n` +
        `- 1 question max.\n`,
    });
    return true;
  }
  return false;
}
