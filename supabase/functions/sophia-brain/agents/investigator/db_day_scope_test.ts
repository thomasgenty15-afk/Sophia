import { assertEquals } from "jsr:@std/assert@1"
import { computeActionDayScope, resolveBilanReferenceDay } from "./db.ts"

Deno.test("resolveBilanReferenceDay uses the fixed 20h local anchor", () => {
  assertEquals(resolveBilanReferenceDay(10), "yesterday")
  assertEquals(resolveBilanReferenceDay(19), "yesterday")
  assertEquals(resolveBilanReferenceDay(20), "today")
  assertEquals(resolveBilanReferenceDay(23), "today")
})

Deno.test("computeActionDayScope keeps evening and night items on yesterday at bilan time", () => {
  assertEquals(computeActionDayScope("morning", 20), "today")
  assertEquals(computeActionDayScope("afternoon", 20), "today")
  assertEquals(computeActionDayScope("evening", 20), "yesterday")
  assertEquals(computeActionDayScope("night", 21), "yesterday")
  assertEquals(computeActionDayScope("soir", 20), "yesterday")
})

Deno.test("computeActionDayScope stays on yesterday before the evening bilan slot", () => {
  assertEquals(computeActionDayScope("morning", 9), "yesterday")
  assertEquals(computeActionDayScope("night", 9), "yesterday")
  assertEquals(computeActionDayScope("any_time", 15), "yesterday")
})
