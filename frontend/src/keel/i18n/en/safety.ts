// Seed anglais — le namespace `safety`, et lui seul.
// Assemblé dans `../en.ts`; une clé `safety.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enSafety = {
  // Reference notes on molecule lines — COACH ONLY, and only facts.
  //
  // What used to live here was the provenance gate: "Shown to the student
  // without the dose", "What the student would read", and a button reading
  // "Mark as clinician-ordered" that bought the prescription back. All of it is
  // gone (2026-07-28) — the coach is the prescriber, the dose ships as written.
  // The title below is the whole tone of the surface, in three words: it hands
  // a professional something to know, and asks nothing of them.
  //
  // There is no separate "Upper limit: 4000 IU per day" key anymore either: the
  // limit is inside the note's own sentence, composed once in the render layer.
  // Two places saying the same number is how they stop agreeing.
  "safety.note_title": "For your information",
  "safety.stat_notes": "With a note",
} as const
