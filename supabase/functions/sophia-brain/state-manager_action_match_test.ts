import { scoreActionHintMatch } from "./state-manager.ts"

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed")
}

Deno.test("scoreActionHintMatch: handles typo and accents", () => {
  const typoScore = scoreActionHintMatch("medittion soir", "Méditation du soir")
  const accentScore = scoreActionHintMatch("etoile polaire", "Étoile Polaire")

  assert(typoScore >= 0.55, `expected typo score >= 0.55, got ${typoScore}`)
  assert(accentScore >= 0.8, `expected accent score >= 0.8, got ${accentScore}`)
})

Deno.test("scoreActionHintMatch: separates unrelated candidates", () => {
  const good = scoreActionHintMatch("routine soir", "Routine du soir")
  const bad = scoreActionHintMatch("routine soir", "Hydratation matin")

  assert(good > bad, `expected good (${good}) > bad (${bad})`)
  assert(bad < 0.45, `expected bad score < 0.45, got ${bad}`)
})
