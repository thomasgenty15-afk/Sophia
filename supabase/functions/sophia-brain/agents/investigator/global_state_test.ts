import { assertEquals } from "jsr:@std/assert@1"
import type { CheckupItem, InvestigationState } from "./types.ts"
import {
  buildBroadOpeningQuestion,
  buildGroupedFollowUpMessage,
  findFirstUnloggedIndex,
  getNextUncoveredItems,
  initializeGlobalCheckupState,
  mergeGlobalExtraction,
  spokenLabelForItem,
} from "./global_state.ts"

function makeItems(): CheckupItem[] {
  return [
    { id: "a1", type: "action", title: "Meditation matinale", tracking_type: "boolean" },
    { id: "a2", type: "action", title: "Lecture 30 min", tracking_type: "boolean" },
    { id: "v1", type: "vital", title: "Sommeil", tracking_type: "counter", unit: "heures" },
  ]
}

function makeState(): InvestigationState {
  const items = makeItems()
  return {
    status: "checking",
    pending_items: items,
    current_item_index: 0,
    temp_memory: {
      item_progress: {
        a1: { phase: "not_started", digression_count: 0 },
        a2: { phase: "not_started", digression_count: 0 },
        v1: { phase: "not_started", digression_count: 0 },
      },
      global_checkup_state: initializeGlobalCheckupState(items),
    },
  }
}

Deno.test("initializeGlobalCheckupState starts all items as not_addressed", () => {
  const state = initializeGlobalCheckupState(makeItems())
  assertEquals(state.opening_mode, "broad_open")
  assertEquals(state.items.a1.status, "not_addressed")
  assertEquals(state.items.a1.covered, false)
})

Deno.test("mergeGlobalExtraction marks clear statuses as covered", () => {
  const state = makeState()
  const next = mergeGlobalExtraction(state, {
    overall_tone: "mixed",
    items: [
      {
        item_id: "a1",
        covered: true,
        status: "completed",
        evidence: "j'ai médité ce matin",
        confidence: 0.93,
      },
      {
        item_id: "a2",
        covered: false,
        status: "unclear",
        evidence: "la lecture m'a saoulé",
        confidence: 0.41,
      },
    ],
  })

  assertEquals(next.temp_memory.global_checkup_state?.overall_tone, "mixed")
  assertEquals(next.temp_memory.global_checkup_state?.items.a1.covered, true)
  assertEquals(next.temp_memory.global_checkup_state?.items.a1.status, "completed")
  assertEquals(next.temp_memory.global_checkup_state?.items.a2.covered, false)
  assertEquals(next.temp_memory.global_checkup_state?.items.a2.status, "unclear")
})

Deno.test("getNextUncoveredItems prefers actions before vitals", () => {
  const state = makeState()
  const merged = mergeGlobalExtraction(state, {
    items: [
      { item_id: "a1", covered: true, status: "completed", confidence: 0.9 },
    ],
  })
  const next = getNextUncoveredItems(merged, 2)
  assertEquals(next.map((item) => item.id), ["a2", "v1"])
})

Deno.test("findFirstUnloggedIndex skips logged items", () => {
  const state = makeState()
  state.temp_memory.item_progress!.a1 = { phase: "logged", digression_count: 0 }
  state.temp_memory.item_progress!.a2 = { phase: "logged", digression_count: 0 }
  assertEquals(findFirstUnloggedIndex(state), 2)
})

Deno.test("helpers keep broad opening and grouped follow-up natural", () => {
  assertEquals(buildBroadOpeningQuestion(), "Comment ça s'est passé aujourd'hui ?")
  assertEquals(spokenLabelForItem(makeItems()[0]), "Meditation matinale")
  const msg = buildGroupedFollowUpMessage({
    coveredItems: [makeItems()[0]],
    nextItems: [makeItems()[1], makeItems()[2]],
  })
  assertEquals(
    msg,
    "Et pour Lecture 30 min et Sommeil, tu me dis ce qu'il en a été ?",
  )
})

Deno.test("spoken labels turn rigid dashboard wording into natural phrasing", () => {
  assertEquals(
    spokenLabelForItem({
      id: "f1",
      type: "framework",
      title: "Journal de Fin de Journée",
      tracking_type: "boolean",
    }),
    "Journal de Fin de Journée",
  )
  assertEquals(
    spokenLabelForItem({
      id: "a1",
      type: "action",
      title: "Couvre-feu Digital Renforcé",
      tracking_type: "boolean",
    }),
    "Couvre-feu Digital Renforcé",
  )
})

Deno.test("grouped follow-up keeps explicit item titles", () => {
  const msg = buildGroupedFollowUpMessage({
    coveredItems: [],
    nextItems: [
      {
        id: "a1",
        type: "action",
        title: "Couvre-feu Digital Renforcé",
        tracking_type: "boolean",
      },
      {
        id: "a2",
        type: "action",
        title: "Couvre-feu Digital Léger",
        tracking_type: "boolean",
      },
    ],
  })

  assertEquals(msg, "Et pour Couvre-feu Digital Renforcé et Couvre-feu Digital Léger, tu me dis ce qu'il en a été ?")
})

Deno.test("grouped follow-up names remaining items explicitly", () => {
  const msg = buildGroupedFollowUpMessage({
    coveredItems: [
      {
        id: "v1",
        type: "vital",
        title: "Temps d'écran avant le coucher",
        tracking_type: "counter",
        unit: "min",
      },
    ],
    nextItems: [
      {
        id: "a1",
        type: "action",
        title: "Couvre-feu Digital Léger",
        description: "Mets ton téléphone en mode ne pas déranger et pose-le hors de portée",
        tracking_type: "boolean",
      },
      {
        id: "a2",
        type: "action",
        title: "10 pompes",
        tracking_type: "boolean",
      },
    ],
  })

  assertEquals(
    msg,
    "Et pour Couvre-feu Digital Léger et 10 pompes, tu me dis ce qu'il en a été ?",
  )
})
