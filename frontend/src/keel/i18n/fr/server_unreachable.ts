// Pack français — le namespace `server_unreachable`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `server_unreachable.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frServerUnreachable = {
  // ── L'ÉCRAN « ON NE JOINT PAS LE SERVEUR » ────────────────────────────────
  // ⚠️ VOUVOIEMENT ICI, ET C'EST DÉLIBÉRÉ. Ces quatre phrases ne sont rendues
  // que par `<ServerUnreachable />`, monté par `/start` — une page qui vouvoie —
  // et leur jumelle `auth.error.server_unreachable` dit déjà « Vous êtes bien
  // connecté ». Les tutoyer aurait créé la couture qu'on vient de fermer.
  "server_unreachable.title": "Le serveur ne répond pas.",
  "server_unreachable.body":
    "Votre compte et vos données sont intacts — c’est l’application qui n’arrive à rien lire pour l’instant. En général, ça dure quelques secondes.",
  "server_unreachable.retry": "Réessayer",
  "server_unreachable.after_signin":
    "Vous êtes bien connecté, mais le serveur ne répond pas pour ouvrir votre espace. Réessayez dans un instant.",
} satisfies TranslatedMessagesOf<"server_unreachable">;
