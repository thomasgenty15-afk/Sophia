import {
  getActiveSupervisorSession,
  getCurrentFactToConfirm,
} from "../supervisor.ts"

export function normalizeLoose(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function pickToolflowSummary(tm: any): { active: boolean; kind?: string; stage?: string } {
  const flow = (tm as any)?.architect_tool_flow
  if (!flow || typeof flow !== "object") return { active: false }
  const kind = typeof (flow as any).kind === "string" ? String((flow as any).kind) : undefined
  const stage = typeof (flow as any).stage === "string" ? String((flow as any).stage) : undefined
  return { active: true, kind, stage }
}

export function pickSupervisorSummary(tm: any): {
  stack_top_type?: string
  stack_top_owner?: string
  stack_top_status?: string
  topic_exploration?: { topic?: string; phase?: string; focus_mode?: string; handoff_to?: string }
  queue_size?: number
  queue_reasons_tail?: string[]
  queue_pending_reasons?: string[]
} {
  const sess = getActiveSupervisorSession(tm)
  const rt = (tm as any)?.global_machine ?? (tm as any)?.supervisor
  const q = Array.isArray((rt as any)?.queue) ? (rt as any).queue : []
  const queueSize = q.length || undefined
  const reasons = q.map((x: any) => String(x?.reason ?? "")).filter((x: string) => x.trim())
  const tail = reasons.slice(-5)
  const pending = tail.filter((r: string) => r.startsWith("pending:"))
  const out: any = {
    stack_top_type: sess?.type ? String(sess.type) : undefined,
    stack_top_owner: sess?.owner_mode ? String(sess.owner_mode) : undefined,
    stack_top_status: sess?.status ? String(sess.status) : undefined,
    queue_size: queueSize,
    queue_reasons_tail: tail.length ? tail : undefined,
    queue_pending_reasons: pending.length ? pending : undefined,
  }
  if (sess?.type === "topic_exploration") {
    out.topic_exploration = {
      topic: sess.topic ? String(sess.topic).slice(0, 160) : undefined,
      phase: sess.phase ? String(sess.phase) : undefined,
      focus_mode: sess.focus_mode ? String(sess.focus_mode) : undefined,
      handoff_to: sess.handoff_to ? String(sess.handoff_to) : undefined,
    }
  }
  return out
}

export function pickDeferredSummary(tm: any): { has_items: boolean; last_topic?: string } {
  const st = (tm as any)?.global_deferred_topics
  const items = Array.isArray((st as any)?.items) ? (st as any).items : []
  const last = items.length ? items[items.length - 1] : null
  const topic = last && typeof last === "object" ? String((last as any).topic ?? "").trim() : ""
  return { has_items: items.length > 0, last_topic: topic ? topic.slice(0, 160) : undefined }
}

export function pickProfileConfirmSummary(tm: any): { pending: boolean; key?: string } {
  const pending = getCurrentFactToConfirm(tm)
  if (!pending || typeof pending !== "object") return { pending: false }
  const key = typeof pending.key === "string" ? String(pending.key).slice(0, 80) : undefined
  return { pending: true, key }
}


