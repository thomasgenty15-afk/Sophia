// Pack français — le namespace `event`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `event.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frEvent = {
  // ── D'où vient le fait (protocol_events.source) ──────────────────────────
  "event.source.photo": "Photo",
  "event.source.text": "Écrit",
  "event.source.voice": "Voix",
  // « Conversation » et pas « Chat »: en français le mot désigne un animal.
  "event.source.chat": "Conversation",
  "event.source.quick_tap": "Tapé dans l’app",
  "event.source.integration": "Appareil",
  "event.source.coach_entry": "Saisi par le coach",
} satisfies TranslatedMessagesOf<"event">;
