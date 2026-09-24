// Seed anglais — le namespace `day`, et lui seul.
// Assemblé dans `../en.ts`; une clé `day.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enDay = {
  // Weekday tokens, long form (used inside "Every Monday and Friday")
  "day.long.mon": "Monday",
  "day.long.tue": "Tuesday",
  "day.long.wed": "Wednesday",
  "day.long.thu": "Thursday",
  "day.long.fri": "Friday",
  "day.long.sat": "Saturday",
  "day.long.sun": "Sunday",

  // Weekday tokens (R1: mon..sun are data; these are the display labels)
  "day.mon": "Mon",
  "day.tue": "Tue",
  "day.wed": "Wed",
  "day.thu": "Thu",
  "day.fri": "Fri",
  "day.sat": "Sat",
  "day.sun": "Sun",
} as const
