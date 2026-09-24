// Seed anglais — le namespace `unsubscribe`, et lui seul.
// Assemblé dans `../en.ts`; une clé `unsubscribe.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enUnsubscribe = {
  // ══ LA SORTIE DES E-MAILS DE CYCLE DE VIE (`unsubscribe.*`) ══════════════
  //
  // FF-063 lot 1. Cinq écrans, un seul gabarit, aucun bouton de confirmation.
  //
  // ⚠️ CE QUE CES CLÉS NE DISENT JAMAIS: ni prénom, ni adresse, ni « ton lien
  // a expiré ». La RPC rend un booléen et rien d'autre, donc un jeton inconnu
  // et un jeton révoqué se lisent pareil. C'est le prix assumé pour qu'une
  // page publique ne devienne pas un oracle sur les comptes.
  //
  // ⚠️ `done.still` N'EST PAS DU CONFORT. Sans cette phrase, quelqu'un qui
  // attend un reçu Stripe croit l'avoir coupé lui-même — et c'est la
  // réclamation qui suit qui coûte cher.
  "unsubscribe.working.title": "One moment",
  "unsubscribe.working.body": "We are switching off your follow-up emails.",
  "unsubscribe.done.title": "Done — no more follow-up emails",
  "unsubscribe.done.body":
    "We will not write to you again about your plan, your cooking sessions or the end of a trial.",
  "unsubscribe.done.still":
    "Receipts, password resets and anything you ask for yourself still reach you. Those are not marketing, and switching them off would leave you with no written record.",
  "unsubscribe.done.home_cta": "Back to the home page",
  "unsubscribe.no_token.title": "This link is incomplete",
  "unsubscribe.no_token.body":
    "Open it straight from the email you received — the address is missing the part that says which mailbox to stop.",
  "unsubscribe.unknown.title": "This link no longer points to anything",
  "unsubscribe.unknown.body":
    "Nothing changed. The most recent email you received carries an up-to-date link; use that one, and if it does the same, reply to any of our emails and we will stop them by hand.",
  "unsubscribe.unreachable.title": "We could not reach the server",
  "unsubscribe.unreachable.body":
    "Nothing changed, and your link is still good. This one is on us, not on you.",
  "unsubscribe.unreachable.retry": "Try again",
} as const
