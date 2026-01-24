export type WaInbound = {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: any
    }>
  }>
}

export type ExtractedInboundMessage = {
  from: string
  wa_message_id: string
  type: string
  text: string
  interactive_id?: string
  interactive_title?: string
  profile_name?: string
}

export type ExtractedStatus = {
  provider_message_id: string
  status: string
  // Meta sends unix seconds as string; we convert to ISO when possible.
  status_timestamp_iso: string | null
  recipient_id: string | null
  raw: unknown
}

export function extractMessages(payload: WaInbound): ExtractedInboundMessage[] {
  const out: any[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}
      const contacts = value.contacts ?? []
      const profileName = contacts?.[0]?.profile?.name
      const messages = value.messages ?? []
      for (const m of messages) {
        const type = m.type ?? "unknown"
        let text = ""
        let interactive_id: string | undefined = undefined
        let interactive_title: string | undefined = undefined
        if (type === "text") text = m.text?.body ?? ""
        else if (type === "button") text = m.button?.text ?? m.button?.payload ?? ""
        else if (type === "interactive") {
          const br = m.interactive?.button_reply
          const lr = m.interactive?.list_reply
          interactive_id = br?.id ?? lr?.id
          interactive_title = br?.title ?? lr?.title
          text = interactive_title ?? interactive_id ?? ""
        } else {
          // ignore unsupported types for now
          continue
        }
        out.push({
          from: m.from,
          wa_message_id: m.id,
          type,
          text,
          interactive_id,
          interactive_title,
          profile_name: profileName,
        })
      }
    }
  }
  return out
}

export function extractStatuses(payload: WaInbound): ExtractedStatus[] {
  const out: ExtractedStatus[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}
      const statuses = value.statuses ?? []
      for (const s of statuses) {
        const provider_message_id = String(s?.id ?? "").trim()
        const status = String(s?.status ?? "").trim()
        if (!provider_message_id || !status) continue
        const tsRaw = String(s?.timestamp ?? "").trim()
        const tsIso = (() => {
          const n = Number(tsRaw)
          if (!Number.isFinite(n) || n <= 0) return null
          try {
            return new Date(n * 1000).toISOString()
          } catch {
            return null
          }
        })()
        const recipient_id = s?.recipient_id != null ? String(s.recipient_id) : null
        out.push({
          provider_message_id,
          status,
          status_timestamp_iso: tsIso,
          recipient_id,
          raw: s,
        })
      }
    }
  }
  return out
}




