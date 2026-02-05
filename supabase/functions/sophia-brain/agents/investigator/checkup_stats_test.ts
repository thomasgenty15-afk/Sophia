import { assertEquals } from "jsr:@std/assert@1"
import type { InvestigationState } from "./types.ts"
import { computeCheckupStatsFromInvestigationState } from "./checkup_stats.ts"

function baseState(): InvestigationState {
  return {
    status: "checking",
    pending_items: [
      { id: "a1", type: "action", title: "A1", tracking_type: "boolean" },
      { id: "v1", type: "vital", title: "V1", tracking_type: "counter", unit: "h" },
      { id: "f1", type: "framework", title: "F1", tracking_type: "boolean" },
    ],
    current_item_index: 0,
    temp_memory: { item_progress: {} },
  }
}

Deno.test("computeCheckupStatsFromInvestigationState counts from item_progress", () => {
  const st = baseState()
  ;(st.temp_memory as any).item_progress = {
    a1: { phase: "logged", digression_count: 0, logged_at: "2026-01-01T00:00:00Z", logged_status: "completed" },
    v1: { phase: "logged", digression_count: 0, logged_at: "2026-01-01T00:00:01Z", logged_status: "completed" },
    f1: { phase: "logged", digression_count: 0, logged_at: "2026-01-01T00:00:02Z", logged_status: "missed" },
  }
  const stats = computeCheckupStatsFromInvestigationState(st)
  assertEquals(stats.items, 3)
  assertEquals(stats.completed, 2)
  assertEquals(stats.missed, 1)
  assertEquals(stats.logged, 3)
})

Deno.test("computeCheckupStatsFromInvestigationState fillUnloggedAsMissed marks remaining as missed", () => {
  const st = baseState()
  ;(st.temp_memory as any).item_progress = {
    a1: { phase: "logged", digression_count: 0, logged_at: "2026-01-01T00:00:00Z", logged_status: "completed" },
  }
  const stats = computeCheckupStatsFromInvestigationState(st, { fillUnloggedAsMissed: true })
  assertEquals(stats.items, 3)
  assertEquals(stats.completed, 1)
  assertEquals(stats.missed, 2) // 2 unlogged
  assertEquals(stats.logged, 1)
})


