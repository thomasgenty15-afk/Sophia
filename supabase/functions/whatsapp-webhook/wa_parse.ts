export function extractMessages(payload) {
  const out = [];
  for (const entry of payload.entry ?? []){
    for (const change of entry.changes ?? []){
      const value = change.value ?? {};
      const contacts = value.contacts ?? [];
      const profileName = contacts?.[0]?.profile?.name;
      const messages = value.messages ?? [];
      for (const m of messages){
        const type = m.type ?? "unknown";
        let text = "";
        let interactive_id = undefined;
        let interactive_title = undefined;
        if (type === "text") text = m.text?.body ?? "";
        else if (type === "button") {
          // Normalize button payloads as interactive ids for consistent routing
          interactive_id = m.button?.payload ?? undefined;
          interactive_title = m.button?.text ?? undefined;
          text = interactive_title ?? interactive_id ?? "";
        } else if (type === "interactive") {
          const br = m.interactive?.button_reply;
          const lr = m.interactive?.list_reply;
          interactive_id = br?.id ?? lr?.id;
          interactive_title = br?.title ?? lr?.title;
          text = interactive_title ?? interactive_id ?? "";
        } else if (type === "audio" || type === "image" || type === "video" || type === "document" || type === "sticker") {
          // Keep media inbound messages so the webhook can answer with a friendly fallback.
          text = "";
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
          profile_name: profileName
        });
      }
    }
  }
  return out;
}
export function extractStatuses(payload) {
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
