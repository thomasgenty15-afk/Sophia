import { denoEnv } from "./utils.ts";

export async function seedOptInPromptForWhatsApp(admin: any, userId: string) {
  // Used by whatsapp-webhook to disambiguate a plain "oui" as an opt-in acceptance.
  await admin.from("chat_messages").insert({
    user_id: userId,
    scope: "whatsapp",
    role: "assistant",
    content: "[TEMPLATE:sophia_optin_seed]",
    agent_used: "companion",
    metadata: {
      channel: "whatsapp",
      is_proactive: true,
      purpose: "optin",
      template_name: "sophia_optin_seed",
      wa_outbound_message_id: "wamid_SEEDED_OPTIN",
    },
  });
}

export function waPayloadForSingleMessage(msg: {
  from: string;
  wa_message_id: string;
  type: "text" | "interactive";
  text?: string;
  interactive_id?: string;
  interactive_title?: string;
  profile_name?: string;
}): any {
  const contactName = msg.profile_name ?? "Eval Runner";
  const m: any = { from: msg.from, id: msg.wa_message_id, type: msg.type };
  if (msg.type === "text") {
    m.text = { body: msg.text ?? "" };
  } else {
    m.interactive = {
      button_reply: {
        id: msg.interactive_id ?? "",
        title: msg.interactive_title ?? msg.interactive_id ?? "",
      },
    };
  }
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "wa_entry",
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ profile: { name: contactName } }],
              messages: [m],
            },
          },
        ],
      },
    ],
  };
}

export async function invokeWhatsAppWebhook(params: {
  url: string;
  requestId: string;
  payload: any;
}): Promise<{ ok: boolean; status: number; body: any }> {
  const endpoint = `${params.url}/functions/v1/whatsapp-webhook`;
  const raw = JSON.stringify(params.payload ?? {});
  const anonKey = (denoEnv("SUPABASE_ANON_KEY") ?? "").trim();
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(anonKey ? { "apikey": anonKey } : {}),
      "x-request-id": params.requestId,
    },
    body: raw,
  });
  const text = await resp.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, body: json };
}


