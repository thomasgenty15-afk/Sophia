/**
 * Inbound media types WhatsApp can deliver. R1: ASCII snake_case tokens, they
 * are Meta's own wire values and code branches on them.
 */
export const WHATSAPP_MEDIA_TYPES = [
  "image",
  "audio",
  "video",
  "document",
  "sticker",
] as const;
export type WhatsAppMediaType = (typeof WHATSAPP_MEDIA_TYPES)[number];

function isMediaType(value: unknown): value is WhatsAppMediaType {
  return (WHATSAPP_MEDIA_TYPES as readonly string[]).includes(String(value));
}

/**
 * The media descriptor Meta puts on an inbound media message.
 *
 * WHY THIS TYPE EXISTS (KEEL W5.1): until now this object was DROPPED — the
 * parser set `text = ""` for every media type and pushed nothing else, so no
 * `media_id` existed anywhere downstream and a meal photo was structurally
 * unreadable. Nothing about the OTHER types changes here: `text` is still `""`
 * for media (the caption is exposed separately, so no existing branch that
 * reads `text` sees new content), and the unsupported-media fallback in
 * `index.ts` keeps firing for everything the photo handler declines.
 *
 * `id` is the ONLY field that is load-bearing: it is the handle for
 * `fetchWhatsAppMedia`. It is short-lived on Meta's side — see the same-invoke
 * note in `_shared/whatsapp_graph.ts`.
 */
export type WhatsAppInboundMedia = {
  /** Which of the five media envelopes carried it. */
  media_type: WhatsAppMediaType;
  /** Meta media id — the handle passed to `fetchWhatsAppMedia`. Never empty. */
  id: string;
  mime_type: string | null;
  sha256: string | null;
  /** Student prose attached to the photo. Content, not a token (R2 applies to the writer). */
  caption: string | null;
  /** Documents only. */
  filename: string | null;
};

export type WhatsAppInboundMessage = {
  from: string;
  wa_message_id: string;
  type: string;
  text: string;
  interactive_id: string | undefined;
  interactive_title: string | undefined;
  reply_to_wa_message_id: string | undefined;
  profile_name: string | undefined;
  sim_user_id: string | undefined;
  /**
   * Present only for the five media types AND only when Meta gave us a
   * non-empty media id. A media message without a usable id keeps behaving
   * exactly as before (fallback reply), because there is nothing to fetch.
   */
  media?: WhatsAppInboundMedia;
  /**
   * PIVOT C4 — la réponse d'un WhatsApp Flow (`interactive.nfm_reply`).
   *
   * Gardée BRUTE, en chaîne, telle que Meta l'a rendue. Le parsing appartient
   * au module qui connaît le formulaire (`_shared/keel/weekly_flow.ts`): ce
   * fichier ne sait pas ce qu'un Flow demande, et deviner ici la forme d'un
   * formulaire hébergé ailleurs est exactement la divergence qu'on veut éviter.
   */
  flow_response_json?: string;
  /** Le jeton de corrélation qu'on avait émis, rendu tel quel. */
  flow_token?: string;
};

function cleanOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Extract the media descriptor for a media-typed inbound message.
 * Returns `undefined` when the id is missing/empty: an unusable handle must not
 * masquerade as a fetchable photo (R7 spirit — no silent half-object).
 */
export function extractInboundMedia(
  m: any,
  type: string,
): WhatsAppInboundMedia | undefined {
  if (!isMediaType(type)) return undefined;
  const envelope = m?.[type];
  if (!envelope || typeof envelope !== "object") return undefined;
  const id = String(envelope.id ?? "").trim();
  if (!id) return undefined;
  return {
    media_type: type,
    id,
    mime_type: cleanOrNull(envelope.mime_type),
    sha256: cleanOrNull(envelope.sha256),
    caption: cleanOrNull(envelope.caption),
    filename: cleanOrNull(envelope.filename),
  };
}

export function extractMessages(payload: any): WhatsAppInboundMessage[] {
  const out: WhatsAppInboundMessage[] = [];
  for (const entry of payload.entry ?? []){
    for (const change of entry.changes ?? []){
      const value = change.value ?? {};
      const contacts = value.contacts ?? [];
      const profileName = contacts?.[0]?.profile?.name;
      const messages = value.messages ?? [];
      for (const m of messages){
        const type = String(m.type ?? "unknown");
        let text = "";
        let interactive_id: string | undefined = undefined;
        let interactive_title: string | undefined = undefined;
        let media: WhatsAppInboundMedia | undefined = undefined;
        let flow_response_json: string | undefined = undefined;
        let flow_token: string | undefined = undefined;
        if (type === "text") text = m.text?.body ?? "";
        else if (type === "button") {
          // Normalize button payloads as interactive ids for consistent routing
          interactive_id = m.button?.payload ?? undefined;
          interactive_title = m.button?.text ?? undefined;
          text = interactive_title ?? interactive_id ?? "";
        } else if (type === "interactive") {
          const br = m.interactive?.button_reply;
          const lr = m.interactive?.list_reply;
          const nfm = m.interactive?.nfm_reply;
          if (nfm) {
            // C4: une réponse de Flow. `text` reste vide DÉLIBÉRÉMENT — le
            // `response_json` est un objet de formulaire, pas une phrase, et le
            // laisser couler dans `text` le ferait traiter comme un message de
            // l'élève par la déduplication, le stockage et le classifieur.
            const rawResponse: string = typeof nfm.response_json === "string"
              ? nfm.response_json
              : JSON.stringify(nfm.response_json ?? {});
            flow_response_json = rawResponse;
            // Meta range le `flow_token` DANS le response_json. On le remonte
            // ici parce que c'est de la corrélation de transport, pas de la
            // donnée de formulaire — et parce qu'un routeur doit pouvoir dire
            // « ce Flow-ci » sans avoir à comprendre le formulaire.
            try {
              const parsed = JSON.parse(rawResponse);
              const t = parsed?.flow_token;
              if (typeof t === "string" && t.trim()) flow_token = t.trim();
            } catch {
              // Illisible: on garde la chaîne brute, le module métier le dira.
            }
            text = "";
          } else {
            interactive_id = br?.id ?? lr?.id;
            interactive_title = br?.title ?? lr?.title;
            text = interactive_title ?? interactive_id ?? "";
          }
        } else if (isMediaType(type)) {
          // Keep media inbound messages so the webhook can answer with a friendly fallback.
          // W5.1: ALSO keep the media descriptor. `text` stays "" on purpose —
          // the caption travels on `media.caption`, so no branch that reads
          // `text` (dedup, chat_messages.content, intent matching) changes.
          text = "";
          media = extractInboundMedia(m, type);
        } else {
          continue;
        }
        out.push({
          from: m.from,
          wa_message_id: m.id,
          type,
          text,
          interactive_id,
          interactive_title,
          // wamid of the message this one replies to (present on quick-reply
          // button taps). Lets us route the reply to the exact pending it
          // answers instead of guessing with the most-recent one.
          reply_to_wa_message_id: m.context?.id ?? undefined,
          profile_name: profileName,
          sim_user_id: m.sophia_user_id ?? m.metadata?.sophia_user_id ?? undefined,
          media,
          flow_response_json,
          flow_token
        });
      }
    }
  }
  return out;
}
export function extractStatuses(payload: any) {
  const out = [];
  for (const entry of payload.entry ?? []){
    for (const change of entry.changes ?? []){
      const value = change.value ?? {};
      const statuses = value.statuses ?? [];
      for (const s of statuses){
        const provider_message_id = String(s?.id ?? "").trim();
        const status = String(s?.status ?? "").trim();
        if (!provider_message_id || !status) continue;
        const tsRaw = String(s?.timestamp ?? "").trim();
        const tsIso = (()=>{
          const n = Number(tsRaw);
          if (!Number.isFinite(n) || n <= 0) return null;
          try {
            return new Date(n * 1000).toISOString();
          } catch  {
            return null;
          }
        })();
        const recipient_id = s?.recipient_id != null ? String(s.recipient_id) : null;
        out.push({
          provider_message_id,
          status,
          status_timestamp_iso: tsIso,
          recipient_id,
          raw: s
        });
      }
    }
  }
  return out;
}
