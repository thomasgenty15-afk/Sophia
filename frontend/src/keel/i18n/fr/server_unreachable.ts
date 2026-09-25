// Pack français — le namespace `server_unreachable`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `server_unreachable.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frServerUnreachable = {
  // ── L'ÉCRAN « ON NE JOINT PAS LE SERVEUR » ────────────────────────────────
  // ⚠️ TUTOIEMENT, comme `/start` qui monte `<ServerUnreachable />`, et comme
  // leur jumelle `auth.error.server_unreachable` (« Tu es bien connecté »).
  // Les deux changent de registre ensemble, ou la couture revient.
  "server_unreachable.title": "Le serveur ne répond pas.",
  "server_unreachable.body":
    "Ton compte et tes données sont intacts — c’est l’application qui n’arrive à rien lire pour l’instant. En général, ça dure quelques secondes.",
  "server_unreachable.retry": "Réessayer",
  "server_unreachable.after_signin":
    "Tu es bien connecté, mais le serveur ne répond pas pour ouvrir ton espace. Réessaie dans un instant.",
} satisfies TranslatedMessagesOf<"server_unreachable">;
