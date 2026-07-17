import { generateWithGemini } from "../_shared/gemini.ts";
import { renderWhatsAppTemplate } from "../_shared/whatsapp_templates.ts";

export type LastTemplateContext = {
  name: string;
  // The rendered question. It was computed and thrown away, so the classifier
  // had to decide whether a reply matched a floating button label without ever
  // seeing what had been asked — the same blindness that made the onboarding
  // flow answer nonsense to "[TEMPLATE:x]".
  content: string;
  purpose: string | null;
  buttons: string[];
  event_context: string | null;
  original_checkin_id: string | null;
  wamid: string | null;
  sent_at: string;
  // Inbound messages received since the template, excluding the current one.
  // Lets callers know they are on the last armed turn.
  inbound_turns_before: number;
};

export type TemplateReplyClassification = {
  choice: string | "unrelated" | "unknown";
  confidence: number;
};

export type TemplateReplyFlags = {
  isOptInYes: boolean;
  isCheckinYes: boolean;
  isCheckinLater: boolean;
};

type OutboundRow = {
  provider_message_id?: unknown;
  message_type?: unknown;
  status?: unknown;
  metadata?: unknown;
  graph_payload?: unknown;
  created_at?: unknown;
};

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

const DELIVERED_TEMPLATE_STATUSES = new Set(["sent", "delivered", "read"]);
const TEMPLATE_CONTEXT_WINDOW_MS = 24 * 60 * 60 * 1000;
// How many inbound messages a template stays armed for. Bursts are the norm on
// this audience ("Attend" … "C'est tout à fait moi"), so one shot is not enough;
// three bounds how long a stale question can keep capturing replies.
export const TEMPLATE_CONTEXT_MAX_TURNS = 3;

export function materializeTemplateContext(args: {
  row: OutboundRow | null | undefined;
  nowMs?: number;
  pendingExpiresAt?: unknown;
  inboundTurnsBefore?: number;
}): LastTemplateContext | null {
  const row = args.row;
  if (!row) return null;
  if (cleanText(row.message_type) !== "template") return null;
  if (!DELIVERED_TEMPLATE_STATUSES.has(cleanText(row.status))) return null;

  const sentAt = cleanText(row.created_at);
  const sentAtMs = Date.parse(sentAt);
  const nowMs = Number.isFinite(args.nowMs) ? Number(args.nowMs) : Date.now();
  if (
    !Number.isFinite(sentAtMs) || sentAtMs > nowMs ||
    nowMs - sentAtMs > TEMPLATE_CONTEXT_WINDOW_MS
  ) return null;

  const expiresAt = cleanText(args.pendingExpiresAt);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && nowMs > expiresAtMs) return null;

  const metadata = recordOrEmpty(row.metadata);
  const graphPayload = recordOrEmpty(row.graph_payload);
  const graphTemplate = recordOrEmpty(graphPayload.template);
  const name = cleanText(metadata.template_name ?? graphTemplate.name);
  if (!name) return null;
  const rendered = renderWhatsAppTemplate({
    name,
    components: graphTemplate.components,
  });
  if (!rendered.known || rendered.buttons.length === 0) return null;

  return {
    name,
    content: rendered.content,
    purpose: cleanText(metadata.purpose) || null,
    buttons: [...rendered.buttons],
    event_context: cleanText(metadata.event_context) || null,
    original_checkin_id: cleanText(metadata.original_checkin_id) || null,
    wamid: cleanText(row.provider_message_id) || null,
    sent_at: sentAt,
    inbound_turns_before: Number.isFinite(args.inboundTurnsBefore)
      ? Number(args.inboundTurnsBefore)
      : 0,
  };
}

async function loadPendingExpiry(
  admin: any,
  userId: string,
  context: LastTemplateContext,
): Promise<string | null> {
  if (!context.original_checkin_id && !context.event_context) return null;
  let query = admin.from("whatsapp_pending_actions")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("kind", "scheduled_checkin")
    .eq("status", "pending");
  if (context.original_checkin_id) {
    query = query.eq("scheduled_checkin_id", context.original_checkin_id);
  } else {
    query = query.filter(
      "payload->>event_context",
      "eq",
      context.event_context,
    );
  }
  const { data, error } = await query.order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  return cleanText(data?.expires_at) || null;
}

export async function resolveLastTemplateContext(params: {
  admin: any;
  userId: string;
  replyToWamid?: string | null;
}): Promise<LastTemplateContext | null> {
  const nowMs = Date.now();
  const sinceIso = new Date(nowMs - TEMPLATE_CONTEXT_WINDOW_MS).toISOString();
  const columns =
    "provider_message_id,message_type,status,metadata,graph_payload,created_at";
  const replyWamid = cleanText(params.replyToWamid);
  let row: OutboundRow | null = null;
  let inboundTurnsBefore = 0;

  if (replyWamid) {
    const { data, error } = await params.admin
      .from("whatsapp_outbound_messages")
      .select(columns)
      .eq("user_id", params.userId)
      .eq("provider_message_id", replyWamid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = data ?? null;
  }

  if (!row) {
    const { data, error } = await params.admin
      .from("whatsapp_outbound_messages")
      .select(columns)
      .eq("user_id", params.userId)
      .eq("message_type", "template")
      .in("status", [...DELIVERED_TEMPLATE_STATUSES])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = data ?? null;

    // A template stays armed until it is answered, capped at TEMPLATE_CONTEXT_MAX_TURNS
    // inbound messages. Two rules that did NOT work, for the record:
    //  - "closed once Sophia speaks again": she answers every inbound, so it was
    //    always true → the template died on the user's first word ("Attend" →
    //    Sophia replies → "C'est tout à fait moi" hit a dead template).
    //  - "any template within 24h": too loose → a stale template captured a "oui"
    //    that was answering something else entirely.
    // The turn cap keeps bursts working (ADHD users write in several messages)
    // while bounding staleness. A newer template always supersedes this one.
    if (row) {
      const sentAtIso = cleanText((row as OutboundRow).created_at);
      const { data: newerTemplate } = await params.admin
        .from("whatsapp_outbound_messages")
        .select("created_at")
        .eq("user_id", params.userId)
        .eq("message_type", "template")
        .gt("created_at", sentAtIso)
        .in("status", [...DELIVERED_TEMPLATE_STATUSES])
        .limit(1)
        .maybeSingle();
      if (newerTemplate) {
        row = null;
      } else {
        // The current inbound is not logged yet when this runs, so previous
        // replies + this one must stay within the cap.
        const { count } = await params.admin
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", params.userId)
          .eq("role", "user")
          .filter("metadata->>channel", "eq", "whatsapp")
          .gt("created_at", sentAtIso);
        inboundTurnsBefore = count ?? 0;
        if (inboundTurnsBefore >= TEMPLATE_CONTEXT_MAX_TURNS) row = null;
      }
    }
  }

  const provisional = materializeTemplateContext({
    row,
    nowMs,
    inboundTurnsBefore,
  });
  if (!provisional) return null;
  const pendingExpiresAt = await loadPendingExpiry(
    params.admin,
    params.userId,
    provisional,
  );
  return materializeTemplateContext({
    row,
    nowMs,
    pendingExpiresAt,
    inboundTurnsBefore,
  });
}

function normalizedButtonText(value: unknown): string {
  return cleanText(value).toLowerCase().replace(/[!?.…,:;]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function findExactTemplateButton(
  buttons: string[],
  inboundText: unknown,
): string | null {
  const normalized = normalizedButtonText(inboundText);
  if (!normalized) return null;
  return buttons.find((button) =>
    normalizedButtonText(button) === normalized
  ) ??
    null;
}

const OPTIN_TEMPLATE_NAMES = new Set([
  "sophia_optin_v2",
  "sophia_optin_winback_v2",
]);

const CHECKIN_BUTTON_FLAGS: Record<string, Record<string, "yes" | "later">> = {
  global_reach_template: { "Oui!": "yes", "Plus tard!": "later" },
  auto_validation_v1: { "Oui!": "yes", "Non merci!": "later" },
  sophia_reminder_consent_v1_: {
    "Avec plaisir !": "yes",
    "Pas maintenant": "later",
  },
  end_subscription_v1: {
    "Avec plaisir!": "yes",
    "Pas pour le moment!": "later",
  },
  end_trial_v1: {
    "C'est parti !": "yes",
    "Pas pour le moment": "later",
  },
  sophia_bilan_weekly_v1: {
    "Go !": "yes",
    "La semaine prochaine!": "later",
  },
  sophia_bilan_v2: {
    "Carrément!": "yes",
    "On le fait demain!": "later",
  },
  sophia_checkin_v2: {
    "Oui !": "yes",
    "Une prochaine fois !": "later",
  },
  morning_nudge_v1: { "Go !": "yes" },
  sophia_potion_reminder_v1: { "Oui !": "yes" },
};

export function mapTemplateChoiceToFlags(
  templateName: string,
  choice: unknown,
): TemplateReplyFlags {
  const empty = {
    isOptInYes: false,
    isCheckinYes: false,
    isCheckinLater: false,
  };
  const exactChoice = cleanText(choice);
  if (
    !exactChoice || exactChoice === "unknown" || exactChoice === "unrelated"
  ) {
    return empty;
  }
  if (OPTIN_TEMPLATE_NAMES.has(templateName)) {
    const positive = templateName === "sophia_optin_v2"
      ? "Absolument !"
      : "C'est bien moi !";
    return exactChoice === positive ? { ...empty, isOptInYes: true } : empty;
  }
  const flag = CHECKIN_BUTTON_FLAGS[templateName]?.[exactChoice];
  if (flag === "yes") return { ...empty, isCheckinYes: true };
  if (flag === "later") return { ...empty, isCheckinLater: true };
  return empty;
}

export function findTemplateButtonForFlag(
  template: LastTemplateContext,
  flag: "yes" | "later",
): string | null {
  return template.buttons.find((button) => {
    const flags = mapTemplateChoiceToFlags(template.name, button);
    return flag === "yes" ? flags.isCheckinYes : flags.isCheckinLater;
  }) ?? null;
}

function isDestructiveButton(button: string): boolean {
  return /mauvais\s*num[ée]ro|wrong\s*number/i.test(button) ||
    /^stop\s*[!.…]*$/i.test(button.trim());
}

function parseClassification(raw: unknown): TemplateReplyClassification {
  if (typeof raw !== "string") return { choice: "unknown", confidence: 0 };
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(
    /```$/i,
    "",
  )
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const choice = cleanText(parsed?.choice) || "unknown";
    const confidence = Number(parsed?.confidence);
    return {
      choice,
      confidence: Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : 0,
    };
  } catch {
    return { choice: "unknown", confidence: 0 };
  }
}

export async function classifyTemplateReplyChoice(params: {
  template: LastTemplateContext;
  inboundText: string;
  requestId?: string;
  userId?: string;
  llmRunner?: (systemPrompt: string, userPrompt: string) => Promise<unknown>;
}): Promise<TemplateReplyClassification> {
  const safeButtons = params.template.buttons.filter((button) =>
    !isDestructiveButton(button)
  );
  if (!cleanText(params.inboundText) || safeButtons.length === 0) {
    return { choice: "unrelated", confidence: 0 };
  }
  if (
    /^stop\b/i.test(params.inboundText.trim()) ||
    /mauvais\s*num[ée]ro|wrong\s*number/i.test(params.inboundText)
  ) {
    return { choice: "unrelated", confidence: 1 };
  }
  if (
    ["sophia_optin_v2", "sophia_optin_winback_v2"].includes(
      params.template.name,
    ) && /\b(?:non|pas|plus\s+tard|demain)\b/i.test(params.inboundText)
  ) {
    return { choice: "unrelated", confidence: 1 };
  }
  if (/\bmais\b[\s\S]*\b(?:pas|non)\b/i.test(params.inboundText)) {
    return { choice: "unrelated", confidence: 1 };
  }

  const systemPrompt =
    "Sophia a posé la question ci-dessous sur WhatsApp, avec des boutons de réponse. " +
    "L'utilisateur a répondu librement, avec ses mots. Dis à quel bouton sa réponse correspond. " +
    "Un accord clair reste un accord même s'il est long, familier, mal orthographié ou reformulé " +
    "(ex. \"oui c'est tout à fait ça\", \"t'es à la bonne adresse\", \"carrément\"). " +
    "Réponds unrelated seulement si la réponse ne répond pas à la question, " +
    "ou si elle contient une vraie réserve ou un refus. " +
    'Réponds uniquement en JSON: {"choice": <libellé exact d\'un bouton|"unrelated"|"unknown">, "confidence": <0..1>}.';
  const userPrompt = JSON.stringify({
    question_posee: params.template.content,
    boutons_possibles: safeButtons,
    reponse_utilisateur: params.inboundText,
  });

  try {
    const raw = params.llmRunner
      ? await params.llmRunner(systemPrompt, userPrompt)
      : await generateWithGemini(
        systemPrompt,
        userPrompt,
        0,
        true,
        [],
        "auto",
        {
          requestId: params.requestId,
          userId: params.userId,
          source: "whatsapp-template-reply-classifier",
          model: "gpt-5.4-nano",
          forceInitialModel: true,
          disableFallbackChain: true,
          reasoningEffort: "none",
          httpTimeoutMs: 5_000,
          maxRetries: 1,
        },
      );
    const parsed = parseClassification(raw);
    if (parsed.choice === "unknown" || parsed.choice === "unrelated") {
      return parsed;
    }
    // Match on the normalized label, not on a strict string compare: the model
    // answering "Absolument!" instead of "Absolument !" used to silently become
    // unrelated. Return the canonical button so callers map it reliably.
    const matched = safeButtons.find((button) =>
      normalizedButtonText(button) === normalizedButtonText(parsed.choice)
    );
    if (parsed.confidence < 0.8 || !matched) {
      return { choice: "unrelated", confidence: parsed.confidence };
    }
    return { choice: matched, confidence: parsed.confidence };
  } catch (error) {
    console.warn("[WhatsApp] template reply classifier failed", error);
    return { choice: "unknown", confidence: 0 };
  }
}
