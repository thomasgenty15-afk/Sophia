// Seed anglais — le namespace `part`, et lui seul.
// Assemblé dans `../en.ts`; une clé `part.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enPart = {
  // THE TWO PARTS OF A PLAN (+ what is only watched).
  // The titles a coach reads above their own plan, and the ones a student reads
  // above their day. Same words on both screens on purpose: the coach must be
  // able to picture what they are publishing.
  "part.food": "Food",
  "part.actions": "Actions",
  "part.observations": "Observations",
  "part.unsorted": "Not sorted yet",
  "part.hint.food": "What your client eats — meals, foods and their supplements.",
  "part.hint.actions": "What your client does — movement, sleep, light, recovery.",
  "part.hint.observations":
    "Tracked, not scored. What your client records for you — never a thing to hold, so never counted as one.",
  "part.hint.unsorted":
    "We could not tell what kind of thing these are. Open one and say which.",

  // The same three parts, said to the student.
  "part.student.food": "What I eat",
  "part.student.actions": "What I do",
  "part.student.observations": "What I record",
  "part.student.unsorted": "Not sorted yet",
  "part.student.hint.food": "In the order of your day.",
  "part.student.hint.actions": "Movement, sleep, light, recovery.",
  "part.student.hint.observations": "Tracked, not scored.",
  "part.student.hint.unsorted": "Your coach has not said what these are yet.",
} as const
