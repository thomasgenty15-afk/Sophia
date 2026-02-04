import { resolveCheckupEntryConfirmation } from "./checkup_entry.ts"

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`Assertion failed.\nExpected: ${e}\nActual:   ${a}`)
  }
}

Deno.test("resolveCheckupEntryConfirmation: yes variants", () => {
  assertEquals(
    resolveCheckupEntryConfirmation({ userMessage: "Oui je veux bien !" }),
    { kind: "yes", via: "deterministic" },
  )
  assertEquals(
    resolveCheckupEntryConfirmation({ userMessage: "Yes fais le bilan stp" }),
    { kind: "yes", via: "deterministic" },
  )
  assertEquals(
    resolveCheckupEntryConfirmation({ userMessage: "D'accord" }),
    { kind: "yes", via: "deterministic" },
  )
  assertEquals(
    resolveCheckupEntryConfirmation({ userMessage: "OK vas-y" }),
    { kind: "yes", via: "deterministic" },
  )
})

Deno.test("resolveCheckupEntryConfirmation: no variants", () => {
  assertEquals(
    resolveCheckupEntryConfirmation({ userMessage: "Pas maintenant" }),
    { kind: "no", via: "deterministic" },
  )
  assertEquals(
    resolveCheckupEntryConfirmation({ userMessage: "Non, plus tard" }),
    { kind: "no", via: "deterministic" },
  )
})

Deno.test("resolveCheckupEntryConfirmation: dispatcher wins when present", () => {
  assertEquals(
    resolveCheckupEntryConfirmation({ userMessage: "je sais pas", wantsToCheckupFromDispatcher: true }),
    { kind: "yes", via: "dispatcher" },
  )
  assertEquals(
    resolveCheckupEntryConfirmation({ userMessage: "oui", wantsToCheckupFromDispatcher: false }),
    { kind: "no", via: "dispatcher" },
  )
})


