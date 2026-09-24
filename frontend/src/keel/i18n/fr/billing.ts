// Pack français — le namespace `billing`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `billing.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frBilling = {
  // ══ FF-064 · `/app/billing` ══════════════════════════════════════════════
  // ⚠️ Aucun montant écrit ici — voir le pavé de `en.ts`.
  "billing.title": "Ton abonnement",
  "billing.badge.trial": "Semaine offerte",
  "billing.badge.active": "En cours",
  "billing.badge.paused": "En pause",
  "billing.trial.left": "Il te reste {days}.",
  "billing.trial.ends_on": "Ta semaine offerte court jusqu’au {date} inclus.",
  "billing.trial.no_early_charge":
    "Tu peux t’abonner quand tu veux : rien n’est prélevé avant la fin de ta semaine offerte.",
  "billing.active.body": "Tout tourne.",
  "billing.active.renews": "Prochain prélèvement le {date}.",
  "billing.active.cancels": "Cet abonnement s’arrête le {date}.",
  "billing.unknown.body":
    "Ton foyer tourne, et il n’y a rien à régler pour le moment.",
  "billing.not_in_household.body":
    "Tu n’es encore dans aucun foyer, donc il n’y a rien à payer.",
  "billing.not_in_household.cta": "Créer mon foyer",
  "billing.cta.subscribe": "M’abonner",
  "billing.cta.manage": "Gérer mon abonnement",
  "billing.cta.working": "Ouverture…",
  "billing.cancelled": "Rien n’a été prélevé. Tu peux y revenir quand tu veux.",
  "billing.syncing": "Vérification auprès du prestataire de paiement…",
} satisfies TranslatedMessagesOf<"billing">;
