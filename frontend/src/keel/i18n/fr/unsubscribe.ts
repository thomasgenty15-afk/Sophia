// Pack français — le namespace `unsubscribe`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `unsubscribe.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frUnsubscribe = {
  // ══ LA SORTIE DES E-MAILS DE CYCLE DE VIE (`unsubscribe.*`) ══════════════
  //
  // FF-063 lot 1. Le pack français est la voix du produit: on tutoie, et on
  // dit ce qui S'ARRÊTE avant ce qui CONTINUE.
  "unsubscribe.working.title": "Un instant",
  "unsubscribe.working.body": "On coupe tes e-mails de suivi.",
  "unsubscribe.done.title": "C’est fait — plus d’e-mails de suivi",
  "unsubscribe.done.body":
    "On ne t’écrira plus au sujet de ton plan, de tes sessions de cuisine ni de la fin d’un essai.",
  "unsubscribe.done.still":
    "Les reçus, les réinitialisations de mot de passe et tout ce que tu demandes toi-même continuent d’arriver. Ce ne sont pas des e-mails commerciaux, et les couper te laisserait sans trace écrite.",
  "unsubscribe.done.home_cta": "Retour à l’accueil",
  "unsubscribe.no_token.title": "Ce lien est incomplet",
  "unsubscribe.no_token.body":
    "Ouvre-le directement depuis l’e-mail que tu as reçu — il manque à l’adresse la partie qui dit quelle boîte arrêter.",
  "unsubscribe.unknown.title": "Ce lien ne désigne plus rien",
  "unsubscribe.unknown.body":
    "Rien n’a changé. Le dernier e-mail que tu as reçu porte un lien à jour ; utilise celui-là, et s’il fait pareil, réponds à n’importe lequel de nos e-mails et on arrête à la main.",
  "unsubscribe.unreachable.title": "On n’a pas joint le serveur",
  "unsubscribe.unreachable.body":
    "Rien n’a changé, et ton lien reste valable. C’est de notre côté, pas du tien.",
  "unsubscribe.unreachable.retry": "Réessayer",
} satisfies TranslatedMessagesOf<"unsubscribe">;
