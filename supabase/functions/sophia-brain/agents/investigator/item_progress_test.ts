/**
 * Unit tests for Item Progress State Machine
 * 
 * Tests the monotone progression invariant: phases can only move forward, never backward.
 */

import { assertEquals, assertNotEquals } from "jsr:@std/assert@1"
import type { InvestigationState, ItemProgress, CheckupItem } from "./types.ts"
import { getItemProgress, updateItemProgress } from "./item_progress.ts"

// Helper to create a minimal investigation state
function createTestState(itemProgress?: Record<string, ItemProgress>): InvestigationState {
  return {
    status: "checking",
    pending_items: [
      { id: "item-1", type: "action", title: "Test Action 1", tracking_type: "boolean" },
      { id: "item-2", type: "vital", title: "Test Vital", tracking_type: "counter", unit: "heures" },
      { id: "item-3", type: "action", title: "Test Action 2", tracking_type: "boolean" },
    ],
    current_item_index: 0,
    temp_memory: {
      item_progress: itemProgress ?? {},
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// getItemProgress tests
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("getItemProgress returns default for unknown item", () => {
  const state = createTestState()
  const progress = getItemProgress(state, "unknown-item")
  
  assertEquals(progress.phase, "not_started")
  assertEquals(progress.digression_count, 0)
})

Deno.test("getItemProgress returns existing progress", () => {
  const state = createTestState({
    "item-1": { phase: "awaiting_answer", digression_count: 2 },
  })
  const progress = getItemProgress(state, "item-1")
  
  assertEquals(progress.phase, "awaiting_answer")
  assertEquals(progress.digression_count, 2)
})

// ═══════════════════════════════════════════════════════════════════════════════
// Forward transitions (allowed)
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("updateItemProgress: not_started -> awaiting_answer (allowed)", () => {
  const state = createTestState({
    "item-1": { phase: "not_started", digression_count: 0 },
  })
  
  const newState = updateItemProgress(state, "item-1", { phase: "awaiting_answer" })
  const progress = getItemProgress(newState, "item-1")
  
  assertEquals(progress.phase, "awaiting_answer")
})

Deno.test("updateItemProgress: awaiting_answer -> awaiting_reason (allowed)", () => {
  const state = createTestState({
    "item-1": { phase: "awaiting_answer", digression_count: 0 },
  })
  
  const newState = updateItemProgress(state, "item-1", { phase: "awaiting_reason" })
  const progress = getItemProgress(newState, "item-1")
  
  assertEquals(progress.phase, "awaiting_reason")
})

Deno.test("updateItemProgress: awaiting_answer -> logged (allowed - direct done)", () => {
  const state = createTestState({
    "item-1": { phase: "awaiting_answer", digression_count: 0 },
  })
  
  const newState = updateItemProgress(state, "item-1", { 
    phase: "logged",
    logged_at: new Date().toISOString(),
    logged_status: "completed",
  })
  const progress = getItemProgress(newState, "item-1")
  
  assertEquals(progress.phase, "logged")
  assertEquals(progress.logged_status, "completed")
})

Deno.test("updateItemProgress: awaiting_reason -> logged (allowed)", () => {
  const state = createTestState({
    "item-1": { phase: "awaiting_reason", digression_count: 0 },
  })
  
  const newState = updateItemProgress(state, "item-1", { 
    phase: "logged",
    logged_at: new Date().toISOString(),
    logged_status: "missed",
  })
  const progress = getItemProgress(newState, "item-1")
  
  assertEquals(progress.phase, "logged")
})

Deno.test("updateItemProgress: breakdown_offer_pending -> logged (allowed - decline)", () => {
  const state = createTestState({
    "item-1": { phase: "breakdown_offer_pending", digression_count: 0 },
  })
  
  const newState = updateItemProgress(state, "item-1", { 
    phase: "logged",
    logged_at: new Date().toISOString(),
    logged_status: "missed",
  })
  const progress = getItemProgress(newState, "item-1")
  
  assertEquals(progress.phase, "logged")
})

// ═══════════════════════════════════════════════════════════════════════════════
// Backward transitions (blocked)
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("updateItemProgress: awaiting_answer -> not_started (BLOCKED)", () => {
  const state = createTestState({
    "item-1": { phase: "awaiting_answer", digression_count: 1 },
  })
  
  const newState = updateItemProgress(state, "item-1", { phase: "not_started" })
  const progress = getItemProgress(newState, "item-1")
  
  // Should remain in awaiting_answer
  assertEquals(progress.phase, "awaiting_answer")
  assertEquals(progress.digression_count, 1)
})

Deno.test("updateItemProgress: logged -> awaiting_answer (BLOCKED)", () => {
  const state = createTestState({
    "item-1": { phase: "logged", digression_count: 0, logged_at: "2024-01-01T00:00:00Z" },
  })
  
  const newState = updateItemProgress(state, "item-1", { phase: "awaiting_answer" })
  const progress = getItemProgress(newState, "item-1")
  
  // Should remain in logged
  assertEquals(progress.phase, "logged")
})

Deno.test("updateItemProgress: logged -> not_started (BLOCKED)", () => {
  const state = createTestState({
    "item-1": { phase: "logged", digression_count: 0 },
  })
  
  const newState = updateItemProgress(state, "item-1", { phase: "not_started" })
  const progress = getItemProgress(newState, "item-1")
  
  // Should remain in logged
  assertEquals(progress.phase, "logged")
})

Deno.test("updateItemProgress: awaiting_reason -> awaiting_answer (BLOCKED)", () => {
  const state = createTestState({
    "item-1": { phase: "awaiting_reason", digression_count: 0 },
  })
  
  const newState = updateItemProgress(state, "item-1", { phase: "awaiting_answer" })
  const progress = getItemProgress(newState, "item-1")
  
  // Should remain in awaiting_reason
  assertEquals(progress.phase, "awaiting_reason")
})

// ═══════════════════════════════════════════════════════════════════════════════
// Digression handling (same phase, count increments)
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("updateItemProgress: digression increments count, keeps phase", () => {
  const state = createTestState({
    "item-1": { phase: "awaiting_answer", digression_count: 1 },
  })
  
  const newState = updateItemProgress(state, "item-1", { digression_count: 2 })
  const progress = getItemProgress(newState, "item-1")
  
  assertEquals(progress.phase, "awaiting_answer")
  assertEquals(progress.digression_count, 2)
})

Deno.test("updateItemProgress: multiple digressions accumulate", () => {
  let state = createTestState({
    "item-1": { phase: "awaiting_answer", digression_count: 0 },
  })
  
  // Simulate 3 digressions
  state = updateItemProgress(state, "item-1", { digression_count: 1 })
  state = updateItemProgress(state, "item-1", { digression_count: 2 })
  state = updateItemProgress(state, "item-1", { digression_count: 3 })
  
  const progress = getItemProgress(state, "item-1")
  
  assertEquals(progress.phase, "awaiting_answer") // Phase unchanged
  assertEquals(progress.digression_count, 3)
})

// ═══════════════════════════════════════════════════════════════════════════════
// Immutability tests
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("updateItemProgress returns new state object (immutable)", () => {
  const state = createTestState({
    "item-1": { phase: "awaiting_answer", digression_count: 0 },
  })
  
  const newState = updateItemProgress(state, "item-1", { phase: "logged" })
  
  // Original state unchanged
  assertEquals(getItemProgress(state, "item-1").phase, "awaiting_answer")
  // New state has update
  assertEquals(getItemProgress(newState, "item-1").phase, "logged")
  // Different objects
  assertNotEquals(state, newState)
})

Deno.test("updateItemProgress preserves other items", () => {
  const state = createTestState({
    "item-1": { phase: "logged", digression_count: 0 },
    "item-2": { phase: "awaiting_answer", digression_count: 1 },
  })
  
  const newState = updateItemProgress(state, "item-2", { phase: "logged" })
  
  // item-1 unchanged
  assertEquals(getItemProgress(newState, "item-1").phase, "logged")
  // item-2 updated
  assertEquals(getItemProgress(newState, "item-2").phase, "logged")
})

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

Deno.test("updateItemProgress handles missing temp_memory", () => {
  const state: InvestigationState = {
    status: "checking",
    pending_items: [],
    current_item_index: 0,
    temp_memory: {},
  }
  
  const newState = updateItemProgress(state, "new-item", { phase: "awaiting_answer" })
  const progress = getItemProgress(newState, "new-item")
  
  assertEquals(progress.phase, "awaiting_answer")
})

Deno.test("updateItemProgress handles null-ish state gracefully", () => {
  const state = createTestState()
  // Delete item_progress to simulate edge case
  delete (state.temp_memory as any).item_progress
  
  const newState = updateItemProgress(state, "item-1", { phase: "awaiting_answer" })
  const progress = getItemProgress(newState, "item-1")
  
  assertEquals(progress.phase, "awaiting_answer")
})

console.log("\n✅ All Item Progress State Machine tests passed!\n")

