export type WhatsAppBurstMessage = {
  wa_message_id: string;
  user_id: string;
  from_e164: string;
  text: string;
  received_at_ms: number;
};

export type WhatsAppCoalescedBurst = {
  user_id: string;
  from_e164: string;
  message_ids: string[];
  text: string;
  started_at_ms: number;
  ended_at_ms: number;
};

export type WhatsAppReadinessCheck = {
  id:
    | "webhook_receiver"
    | "outbound_send"
    | "typing_indicator"
    | "timeout_fallback"
    | "message_burst";
  status: "pass" | "pending" | "fail";
  detail: string;
};

export const WHATSAPP_BURST_WINDOW_MS = 3_000;
export const WHATSAPP_TIMEOUT_FALLBACK_MS = 8_000;
export const WHATSAPP_TYPING_TEXT = "Je regarde ca et je te reponds.";

export function buildWhatsAppTypingIndicatorPayload(input: {
  to_e164: string;
  wa_message_id?: string | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: input.to_e164.replace("+", ""),
    type: "text",
    text: { preview_url: false, body: WHATSAPP_TYPING_TEXT },
    metadata: {
      purpose: "typing_indicator_fallback",
      s8_readiness: true,
    },
  };
  if (input.wa_message_id) {
    payload.context = { message_id: input.wa_message_id };
  }
  return payload;
}

export function shouldSendTypingIndicator(input: {
  channel: "web" | "whatsapp";
  elapsed_ms: number;
  already_sent?: boolean;
}): boolean {
  return input.channel === "whatsapp" &&
    !input.already_sent &&
    input.elapsed_ms >= 500 &&
    input.elapsed_ms < WHATSAPP_TIMEOUT_FALLBACK_MS;
}

export function shouldSendTimeoutFallback(input: {
  channel: "web" | "whatsapp";
  elapsed_ms: number;
  already_sent?: boolean;
}): boolean {
  return input.channel === "whatsapp" &&
    !input.already_sent &&
    input.elapsed_ms >= WHATSAPP_TIMEOUT_FALLBACK_MS;
}

export function buildWhatsAppTimeoutFallbackText(
  elapsedMs = WHATSAPP_TIMEOUT_FALLBACK_MS,
): string {
  const seconds = Math.max(8, Math.round(elapsedMs / 1000));
  return `Je prends un peu plus de temps que prevu (${seconds}s). Je continue et je t'envoie la reponse juste apres.`;
}

export async function runWithWhatsAppTimeoutFallback<T>(input: {
  work: () => Promise<T>;
  send_waiting_message: () => Promise<void> | void;
  timeout_ms?: number;
}): Promise<{ result: T; fallback_sent: boolean }> {
  const timeoutMs = input.timeout_ms ?? WHATSAPP_TIMEOUT_FALLBACK_MS;
  let done = false;
  let fallbackSent = false;
  const timer = setTimeout(async () => {
    if (done) return;
    fallbackSent = true;
    await input.send_waiting_message();
  }, timeoutMs);
  try {
    const result = await input.work();
    done = true;
    return { result, fallback_sent: fallbackSent };
  } finally {
    done = true;
    clearTimeout(timer);
  }
}

export function coalesceWhatsAppBursts(
  messages: WhatsAppBurstMessage[],
  windowMs = WHATSAPP_BURST_WINDOW_MS,
): WhatsAppCoalescedBurst[] {
  const sorted = [...messages].sort((a, b) =>
    a.user_id.localeCompare(b.user_id) ||
    a.from_e164.localeCompare(b.from_e164) ||
    a.received_at_ms - b.received_at_ms
  );
  const bursts: WhatsAppCoalescedBurst[] = [];
  for (const message of sorted) {
    const previous = bursts[bursts.length - 1];
    const canAppend = previous &&
      previous.user_id === message.user_id &&
      previous.from_e164 === message.from_e164 &&
      message.received_at_ms - previous.ended_at_ms <= windowMs;
    if (!canAppend) {
      bursts.push({
        user_id: message.user_id,
        from_e164: message.from_e164,
        message_ids: [message.wa_message_id],
        text: message.text.trim(),
        started_at_ms: message.received_at_ms,
        ended_at_ms: message.received_at_ms,
      });
      continue;
    }
    previous.message_ids.push(message.wa_message_id);
    previous.text = [previous.text, message.text.trim()].filter(Boolean).join(
      "\n",
    );
    previous.ended_at_ms = message.received_at_ms;
  }
  return bursts;
}

export function buildWhatsAppReadinessChecklist(input: {
  webhook_receiver_ok: boolean;
  outbound_send_ok: boolean;
  typing_indicator_ok: boolean;
  timeout_fallback_ok: boolean;
  message_burst_ok: boolean;
}): WhatsAppReadinessCheck[] {
  return [
    {
      id: "webhook_receiver",
      status: input.webhook_receiver_ok ? "pass" : "pending",
      detail: input.webhook_receiver_ok
        ? "Webhook verification and inbound parsing available."
        : "Needs pilot-number webhook validation.",
    },
    {
      id: "outbound_send",
      status: input.outbound_send_ok ? "pass" : "pending",
      detail: input.outbound_send_ok
        ? "Outbound send path is available through WhatsApp Graph transport."
        : "Needs pilot-number outbound validation.",
    },
    {
      id: "typing_indicator",
      status: input.typing_indicator_ok ? "pass" : "pending",
      detail: input.typing_indicator_ok
        ? "Typing/waiting indicator fallback is available."
        : "Needs visual validation in WhatsApp client.",
    },
    {
      id: "timeout_fallback",
      status: input.timeout_fallback_ok ? "pass" : "pending",
      detail: input.timeout_fallback_ok
        ? "Processing over 8s sends a waiting message."
        : "Needs timeout simulation.",
    },
    {
      id: "message_burst",
      status: input.message_burst_ok ? "pass" : "pending",
      detail: input.message_burst_ok
        ? "Inbound messages within 3s can be coalesced."
        : "Needs burst replay.",
    },
  ];
}

export function renderWhatsAppReadinessMarkdown(
  checks: WhatsAppReadinessCheck[],
): string {
  const lines = [
    "# WhatsApp readiness",
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
  ];
  for (const check of checks) {
    lines.push(`| ${check.id} | ${check.status} | ${check.detail} |`);
  }
  return `${lines.join("\n")}\n`;
}
