type GlobalDeferredItem = {
  topic: string
  created_at: string
  last_mentioned_at: string
  hits: number
}

type GlobalDeferredState = {
  items: GlobalDeferredItem[]
  last_nudge_at?: string | null
}

const KEY = "global_deferred_topics"

function nowIso(now: Date): string {
  return now.toISOString()
}

function normTopic(s: string): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function coerceState(tempMemory: any): GlobalDeferredState {
  const raw = (tempMemory ?? {})?.[KEY]
  const items = Array.isArray(raw?.items) ? raw.items : []
  return {
    items,
    last_nudge_at: raw?.last_nudge_at ?? null,
  }
}

function writeState(tempMemory: any, st: GlobalDeferredState): any {
  return { ...(tempMemory ?? {}), [KEY]: st }
}

export function pruneGlobalDeferredTopics(tempMemory: any, now: Date = new Date()): { tempMemory: any; changed: boolean } {
  const st = coerceState(tempMemory)
  const beforeLen = st.items.length
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000 // 7 days

  const pruned = st.items.filter((it) => {
    const t = Date.parse(String(it?.last_mentioned_at ?? it?.created_at ?? ""))
    if (!Number.isFinite(t)) return false
    return t >= cutoff
  })

  const bounded = pruned.slice(-3)
  const changed = beforeLen !== bounded.length
  if (!changed) return { tempMemory, changed: false }
  return { tempMemory: writeState(tempMemory, { ...st, items: bounded }), changed: true }
}

export function shouldStoreGlobalDeferredFromUserMessage(userMsg: string): boolean {
  const s = (userMsg ?? "").toString().toLowerCase().trim()
  if (!s) return false
  // Explicit "later" / reminder signals (keep conservative).
  if (/\brappelle[-\s]*moi\b/i.test(s)) return true
  if (/\bnote\s+(?:ça|cela)\b/i.test(s)) return true
  if (/\bon\s+(?:en\s+)?(?:reparl\w*|parl\w*|discut\w*|y\s+revien\w*|revien\w*)\b/i.test(s) && /\b(apr[èe]s|plus\s+tard)\b/i.test(s)) {
    return true
  }
  return false
}

export function storeGlobalDeferredTopic(opts: {
  tempMemory: any
  topic: string
  now?: Date
}): { tempMemory: any; changed: boolean } {
  const now = opts.now ?? new Date()
  const topicRaw = String(opts.topic ?? "").trim()
  if (!topicRaw) return { tempMemory: opts.tempMemory, changed: false }

  const st = coerceState(opts.tempMemory)
  const n = normTopic(topicRaw)
  if (!n || n.length < 4) return { tempMemory: opts.tempMemory, changed: false }

  const iso = nowIso(now)
  let changed = false

  const items = Array.isArray(st.items) ? [...st.items] : []
  const idx = items.findIndex((it) => normTopic(String(it?.topic ?? "")) === n)
  if (idx >= 0) {
    const prev = items[idx]
    items[idx] = {
      topic: String(prev?.topic ?? topicRaw).slice(0, 160),
      created_at: String(prev?.created_at ?? iso),
      last_mentioned_at: iso,
      hits: Number(prev?.hits ?? 0) + 1,
    }
    changed = true
  } else {
    items.push({ topic: topicRaw.slice(0, 160), created_at: iso, last_mentioned_at: iso, hits: 1 })
    changed = true
  }

  const bounded = items.slice(-3)
  return { tempMemory: writeState(opts.tempMemory, { ...st, items: bounded }), changed }
}

function seemsLikeLowStakesTurn(userMsg: string): boolean {
  const s = (userMsg ?? "").toString().trim().toLowerCase()
  if (!s) return false
  if (s.length > 24) return false
  return /\b(ok|ok\s+merci|merci|super|top|d['’]?accord|dac|cool|yes|oui)\b/i.test(s)
}

function hasQuestion(text: string): boolean {
  return ((text ?? "").match(/\?/g) ?? []).length > 0
}

export function maybeInjectGlobalDeferredNudge(opts: {
  tempMemory: any
  userMessage: string
  responseText: string
  now?: Date
}): { tempMemory: any; responseText: string; changed: boolean } {
  const now = opts.now ?? new Date()
  const st = coerceState(opts.tempMemory)

  if (!Array.isArray(st.items) || st.items.length === 0) {
    return { tempMemory: opts.tempMemory, responseText: opts.responseText, changed: false }
  }
  if (!seemsLikeLowStakesTurn(opts.userMessage)) {
    return { tempMemory: opts.tempMemory, responseText: opts.responseText, changed: false }
  }
  if (hasQuestion(opts.responseText)) {
    return { tempMemory: opts.tempMemory, responseText: opts.responseText, changed: false }
  }

  const last = st.last_nudge_at ? Date.parse(String(st.last_nudge_at)) : NaN
  if (Number.isFinite(last)) {
    const elapsed = now.getTime() - last
    if (elapsed < 24 * 60 * 60 * 1000) {
      return { tempMemory: opts.tempMemory, responseText: opts.responseText, changed: false }
    }
  }

  const item = st.items[st.items.length - 1]
  const topic = String(item?.topic ?? "").trim()
  if (!topic) return { tempMemory: opts.tempMemory, responseText: opts.responseText, changed: false }

  const appended =
    `${String(opts.responseText ?? "").trim()}\n\n` +
    `Au fait, tu voulais qu’on reparle de "${topic}". On le fait maintenant ?`

  const nextState: GlobalDeferredState = { ...st, last_nudge_at: nowIso(now) }
  return { tempMemory: writeState(opts.tempMemory, nextState), responseText: appended, changed: true }
}




