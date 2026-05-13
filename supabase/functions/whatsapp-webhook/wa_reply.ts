import { processMessage } from "../sophia-brain/router.ts";
import { extractHiddenFilRougeNote } from "../sophia-brain/chat_text.ts";
import {
  getUserState,
  updateUserState,
} from "../sophia-brain/state-manager.ts";
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts";
import { loadHistory } from "./wa_db.ts";
export async function replyWithBrain(params: {
  admin: any;
  requestId: string;
  userId: string;
  inboundText: string;
  fromE164: string;
  contextOverride?: string | null;
  whatsappMode?: "onboarding" | "normal";
  forceMode?: any;
  forceOnboardingFlow?: boolean;
  purpose?: string | null;
  replyToWaMessageId?: string | null;
  requiredVisibleEnding?: string | null;
}) {
  const startedAtMs = Date.now();
  const scope = "whatsapp";
  console.log(`[whatsapp-webhook] trace ${
    JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_start",
      elapsed_ms: 0,
      user_id: params.userId,
    })
  }`);
  const historyStartedAtMs = Date.now();
  const history = await loadHistory(params.admin, params.userId, 20, scope);
  console.log(`[whatsapp-webhook] trace ${
    JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_after_load_history",
      elapsed_ms: Date.now() - startedAtMs,
      stage_elapsed_ms: Date.now() - historyStartedAtMs,
      history_len: history.length,
      user_id: params.userId,
    })
  }`);
  const contextOverride = [
    params.contextOverride,
  ].filter((s) => String(s ?? "").trim().length > 0).join("\n\n");
  const brainStartedAtMs = Date.now();
  const brain = await processMessage(
    params.admin,
    params.userId,
    params.inboundText,
    history,
    {
      requestId: params.requestId,
      channel: "whatsapp",
      scope,
      whatsappMode: params.whatsappMode ?? "normal",
    },
    {
      logMessages: false,
      contextOverride,
      forceMode: params.forceMode,
      forceOnboardingFlow: params.forceOnboardingFlow ?? false,
    },
  );
  console.log(`[whatsapp-webhook] trace ${
    JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_after_process_message",
      elapsed_ms: Date.now() - startedAtMs,
      stage_elapsed_ms: Date.now() - brainStartedAtMs,
      mode: brain.mode ?? null,
      user_id: params.userId,
    })
  }`);
  const parsed = extractHiddenFilRougeNote(brain.content);
  const rawVisibleReply = parsed.visibleText.trim() ||
    String(brain.content ?? "").trim();
  const visibleReply = polishWhatsAppVisibleReply(
    enforceRequiredVisibleEnding(
      rawVisibleReply,
      params.requiredVisibleEnding,
    ),
    params.inboundText,
  );
  if (parsed.note) {
    try {
      const state = await getUserState(
        params.admin as any,
        params.userId,
        scope,
      );
      const nextTempMemory = {
        ...(((state as any)?.temp_memory ?? {}) as Record<string, unknown>),
        __whatsapp_fil_rouge: {
          text: parsed.note,
          marker: parsed.marker,
          updated_at: new Date().toISOString(),
        },
      };
      await updateUserState(params.admin as any, params.userId, scope, {
        temp_memory: nextTempMemory,
      } as any);
    } catch (error) {
      console.warn(
        "[whatsapp-webhook] failed to persist whatsapp fil rouge",
        error,
      );
    }
  }
  const sendStartedAtMs = Date.now();
  const sendResp = await sendWhatsAppTextTracked({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    toE164: params.fromE164,
    body: visibleReply,
    purpose: params.purpose ?? "whatsapp_state_soft_brain_reply",
    isProactive: false,
    replyToWaMessageId: params.replyToWaMessageId ?? null,
  });
  console.log(`[whatsapp-webhook] trace ${
    JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_after_send_whatsapp",
      elapsed_ms: Date.now() - startedAtMs,
      stage_elapsed_ms: Date.now() - sendStartedAtMs,
      user_id: params.userId,
    })
  }`);
  const outId = sendResp?.messages?.[0]?.id ?? null;
  const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
  const insertAssistantStartedAtMs = Date.now();
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    scope,
    role: "assistant",
    content: visibleReply,
    agent_used: brain.mode,
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: outId,
      outbound_tracking_id: outboundTrackingId,
      is_proactive: false,
      reply_to_wa_message_id: params.replyToWaMessageId ?? null,
      purpose: params.purpose ?? "whatsapp_state_soft_brain_reply",
      has_hidden_fil_rouge: Boolean(parsed.note),
    },
  });
  console.log(`[whatsapp-webhook] trace ${
    JSON.stringify({
      request_id: params.requestId,
      phase: "reply_with_brain_done",
      elapsed_ms: Date.now() - startedAtMs,
      stage_elapsed_ms: Date.now() - insertAssistantStartedAtMs,
      user_id: params.userId,
      wa_outbound_message_id: outId,
      outbound_tracking_id: outboundTrackingId,
    })
  }`);
  return {
    brain,
    outId,
  };
}

function normalizeComparableText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function enforceRequiredVisibleEnding(
  text: string,
  requiredEnding?: string | null,
): string {
  const required = String(requiredEnding ?? "").trim();
  const original = String(text ?? "").trim();
  if (!required) return original;
  const exactRequiredIndex = original.indexOf(required);
  if (exactRequiredIndex >= 0) {
    return [
      removeQuestionSentences(original.slice(0, exactRequiredIndex).trim()),
      required,
    ].filter(Boolean).join("\n\n");
  }
  if (
    normalizeComparableText(original).includes(
      normalizeComparableText(required),
    )
  ) {
    return original;
  }

  const lastQuestionMark = original.lastIndexOf("?");
  if (lastQuestionMark < 0) {
    return [original, required].filter(Boolean).join("\n\n");
  }

  const beforeQuestion = original.slice(0, lastQuestionMark);
  const boundaryCandidates = [
    beforeQuestion.lastIndexOf("\n"),
    beforeQuestion.lastIndexOf(". "),
    beforeQuestion.lastIndexOf("! "),
    beforeQuestion.lastIndexOf("? "),
  ].filter((index) => index >= 0);
  const boundary = boundaryCandidates.length
    ? Math.max(...boundaryCandidates)
    : -1;
  const prefix = boundary >= 0 ? original.slice(0, boundary + 1).trim() : "";
  return [prefix, required].filter(Boolean).join("\n\n");
}

function removeQuestionSentences(text: string): string {
  let next = String(text ?? "").trim();
  while (next.includes("?")) {
    const questionMark = next.lastIndexOf("?");
    const beforeQuestion = next.slice(0, questionMark);
    const boundaryCandidates = [
      beforeQuestion.lastIndexOf("\n"),
      beforeQuestion.lastIndexOf(". "),
      beforeQuestion.lastIndexOf("! "),
      beforeQuestion.lastIndexOf("? "),
    ].filter((index) => index >= 0);
    const boundary = boundaryCandidates.length
      ? Math.max(...boundaryCandidates)
      : -1;
    next = (boundary >= 0 ? next.slice(0, boundary + 1) : "").trim();
  }
  return next;
}

function polishWhatsAppVisibleReply(text: string, inboundText: string): string {
  const normalizedInbound = normalizeComparableText(inboundText);
  let next = String(text ?? "").trim();

  next = next
    .replace(/\s*\(surface\s*:\s*Reduire une action\)/gi, "")
    .replace(/\s*\(surface\s*:\s*Réduire une action\)/gi, "")
    .replace(/\bReduire une action\b/g, "Réduire une action")
    .replace(/\bon reduce\b/gi, "on allège")
    .replace(/\breduce celle\b/gi, "allège celle");

  if (
    /supprim|effac/.test(normalizedInbound) &&
    /message/.test(normalizedInbound) &&
    /interface|chat|conversation/.test(normalizedInbound)
  ) {
    next = next.replace(
      /^ça ne change rien[^:]*:\s*/i,
      "Ça change l’historique visible : ",
    );
    next = next
      .replace(/\bpour Sophia\b/gi, "pour moi")
      .replace(/\bSophia\b/g, "moi");
  }

  if (/\bpsg\b|foot|football/.test(normalizedInbound)) {
    const bridge = "On garde ça en pause, ou on revient à ton plan ?";
    if (
      !normalizeComparableText(next).includes(normalizeComparableText(bridge))
    ) {
      next = enforceRequiredVisibleEnding(next, bridge);
    }
  }

  return next;
}
