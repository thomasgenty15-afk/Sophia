// Seed anglais — le namespace `billing`, et lui seul.
// Assemblé dans `../en.ts`; une clé `billing.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enBilling = {
  // ══ FF-064 · `/app/billing` — LA PAGE D'ABONNEMENT ═══════════════════════
  // ⚠️ AUCUN MONTANT N'EST ÉCRIT ICI. Les prix viennent de `PRICES`
  // (i18n/prices.ts) par `<OfferLines />`, la MÊME source que la vitrine. Une
  // phrase qui recopierait « 12,99 € » deviendrait fausse le jour où le tarif
  // bouge, et ce dépôt a déjà payé neuf phrases restées à 11,99.
  "billing.title": "Your subscription",
  "billing.badge.trial": "Free week",
  "billing.badge.active": "Active",
  "billing.badge.paused": "Paused",
  "billing.trial.left": "You have {days} left.",
  "billing.trial.ends_on": "Your free week runs through {date}.",
  // La phrase qui rend le geste anticipé possible: sans elle, donner sa carte
  // au 3e jour ressemble à renoncer aux quatre qui restent.
  "billing.trial.no_early_charge":
    "Subscribe whenever you like — nothing is charged before your free week is over.",
  "billing.active.body": "Everything is running.",
  "billing.active.renews": "Next payment on {date}.",
  "billing.active.cancels": "This subscription stops on {date}.",
  "billing.unknown.body":
    "Your household is running, and there is nothing to settle right now.",
  "billing.not_in_household.body":
    "You are not in a household yet, so there is nothing to pay for.",
  "billing.not_in_household.cta": "Set up my household",
  "billing.cta.subscribe": "Subscribe",
  "billing.cta.manage": "Manage my subscription",
  "billing.cta.working": "Opening...",
  "billing.cancelled": "Nothing was charged. You can come back to this whenever.",
  "billing.syncing": "Checking with the payment provider...",
} as const
