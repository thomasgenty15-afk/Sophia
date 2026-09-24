// Seed anglais — le namespace `event`, et lui seul.
// Assemblé dans `../en.ts`; une clé `event.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enEvent = {
  // Fact source (protocol_events.source) - reached through messageKey(), so an
  // unrecognised source is a loud error, never a raw slug on screen (R7).
  "event.source.photo": "Photo",
  "event.source.text": "Written",
  "event.source.voice": "Voice",
  "event.source.chat": "Chat",
  "event.source.quick_tap": "Tapped in the app",
  "event.source.integration": "Device",
  "event.source.coach_entry": "Entered by the coach",
} as const
