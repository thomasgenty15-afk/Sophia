// Seed anglais — le namespace `tracking`, et lui seul.
// Assemblé dans `../en.ts`; une clé `tracking.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enTracking = {
  //
  // A7 — `/app/progress` DEVIENT LE SUIVI. Les mots de la page; les jetons
  // ASCII (bases, portées, états d'un plat) vivent dans `api/tracking.ts`.
  //
  // ⟳ RETRAITS de ce chantier, déjà faits en place (commit de35fadf): les 36
  //   clés `progress.*` de l'écran mort `pages/ProgressPage.tsx`. Aucune n'avait
  //   d'appelant vivant — 36 recherches de littéral, packs et page exclus, zéro
  //   fichier. La liste exacte est dans `REMOVED_KEYS` de
  //   `pages/trackingPage.int.test.ts`.
  // ⟳ VALEURS CHANGÉES, déjà faites en place (D7.1): `app.nav.progress`
  //   (Progress → Tracking), `app.nav.health` (Health → Safety), `health.title`
  //   (What you cannot eat → Safety).
  //
  // ⚠️ SIX CLÉS CI-DESSOUS ÉCRIVENT UN KCAL, ET ELLES SONT NOMMÉES PAR LEUR
  // BASE. C'est la garantie de `CALORIE_REVERSAL.md` §5: il n'existe aucun
  // chemin où le nombre s'affiche et la base non, parce que ce sont le MÊME
  // message. Les six sont inscrites dans `ENERGY_KEYS_WITH_A_BASIS`
  // (`i18n/energyBasis.int.test.ts`), dont l'inventaire est CLOS — une septième
  // qui écrirait un chiffre y tombera, et devra dire à quelle base elle
  // appartient.
  "tracking.permanent.label": "What has been done",
  "tracking.permanent.plans_done_one": "{count} plan carried through",
  "tracking.permanent.plans_done_other": "{count} plans carried through",
  "tracking.permanent.plans_changed_one": "{count} of them you changed on the way",
  "tracking.permanent.plans_changed_other":
    "{count} of them you changed on the way",
  "tracking.permanent.meals_decided_one": "{count} meal decided for you",
  "tracking.permanent.meals_decided_other": "{count} meals decided for you",
  "tracking.permanent.cooked": "cooked {sessions} times, for {meals} meals",
  // D7.4 — ⛔ AUCUN « TEMPS ÉCONOMISÉ ». Ce dépôt n'a aucune mesure de ce que
  // décider un repas coûte sans lui: le chiffre serait une invention avec une
  // décimale. On dit donc ce qu'on a compté, et on dit qu'on n'a pas compté le
  // reste — c'est la même règle qu'un kcal qui porte sa base.
  "tracking.permanent.no_minutes":
    "How many minutes that saved you, nobody here has measured. So nobody here tells you.",
  "tracking.permanent.leftovers_unknown":
    "Leftover boxes are not counted yet, so they are not shown as zero either.",
  "tracking.objective.label": "Your goal, day by day",
  "tracking.scope.day": "Today",
  "tracking.scope.week": "These seven days",
  "tracking.scope.plan": "This plan",
  "tracking.total.plan_quantities":
    "{kcal} kcal, from the quantities written into your plan.",
  "tracking.total.declared_quantities":
    "{kcal} kcal, estimated - its weakest part comes from quantities you wrote yourself.",
  "tracking.total.photo_estimate":
    "{kcal} kcal, estimated - part of it is read off photos, and a photo reads low.",
  "tracking.total.slot_estimate":
    "{kcal} kcal, estimated - one meal or more was never filled in and stands in as an average.",
  "tracking.total.assumed":
    "{kcal} kcal, estimated - dishes from your plan you said nothing about are counted as eaten.",
  "tracking.total.empty": "Nothing to add up on this day.",
  // ⛔ « PAS DE TOTAL » N'EST PAS « RIEN À ADDITIONNER ». Cette phrase-ci dit
  // qu'on avait quelque chose à compter et qu'on n'a PAS SU: un plat que le
  // référentiel n'a pas pesé, ou une part de plan de foyer irreconstituable.
  // Rendre la journée vide à la place ferait lire « tu n'as rien mangé ».
  // ⚠️ Elle n'écrit AUCUN chiffre — elle n'a donc pas de base à porter, et sa
  // place n'est pas dans `ENERGY_KEYS_WITH_A_BASIS`.
  // ⚠️ AUCUNE PORTÉE DANS CETTE PHRASE, et c'est un défaut mesuré: elle disait
  // « for this day » et s'affichait telle quelle sous « These seven days » et
  // « This plan ». La portée est écrite juste AU-DESSUS de la ligne
  // (`tracking.scope.*`), et le nom du jour au-dessus du bloc jour — la
  // répéter ici ne pouvait que la contredire deux fois sur trois.
  "tracking.total.abstained":
    "No total: one dish could not be weighed, and a partial sum would read low.",
  "tracking.day.planned": "From your plan",
  "tracking.day.photos": "Your photos",
  "tracking.day.missed": "Nothing recorded",
  "tracking.dish.ticked": "ticked",
  "tracking.dish.silent": "nothing said",
  "tracking.dish.unticked": "not eaten",
  "tracking.dish.off_plan": "something else",
  "tracking.energy.slot_estimate":
    "about {kcal} kcal - a stand-in, and you can change it during the day.",
  "tracking.missed.no_estimate":
    "One meal that day is not attached to any moment, so this one is left without a number.",
  "tracking.describe": "Describe",
  "tracking.weight.label": "Your weight",
  "tracking.weight.empty": "No weigh-in in this window.",
  "tracking.weight.point": "{value} kg on {date}",
  "tracking.weight.period.1w": "1w",
  "tracking.weight.period.1m": "1mo",
  "tracking.weight.period.3m": "3mo",
  "tracking.weight.period.6m": "6mo",
  "tracking.weight.period.12m": "12mo",
  "tracking.weight.period.all": "All",
  // « Décrire » un créneau loupé (D7.7). ⚠️ Aucune de ces phrases ne DEMANDE une
  // quantité — `meal_precision.ts` l'interdit, et il a raison. Le champ est
  // libre; si la personne écrit un nombre, c'est elle qui l'a écrit.
  "tracking.describe.title": "Describe this meal",
  "tracking.describe.subtitle":
    "In your own words. If you happened to weigh something, write it down - nobody is asking you to.",
  "tracking.describe.placeholder":
    "A bowl of pasta with tomato sauce and grated cheese",
  "tracking.describe.submit": "Record it",
  "tracking.describe.submitting": "Recording...",
  // ⛔ CETTE PHRASE DISAIT « It counts in that day now. » — L'INVERSE EXACT DE
  // CE QUE « DÉCRIRE » FAISAIT. Et elle était ORPHELINE: jamais rendue, donc
  // jamais démentie.
  // ⟳ 2026-09-09 — LE TROU EST BOUCHÉ, DONC LA PHRASE CHANGE ENCORE. Le chemin
  // rend maintenant un chiffre quand la description en porte un. Il reste deux
  // phrases parce qu'il reste deux issues, et la base du chiffre est DANS la
  // clé: `…done.estimated` ne peut pas s'afficher sans dire que c'est estimé.
  "tracking.describe.done":
    "Recorded. This meal no longer counts as missed. I could not read a figure out of it - your words are kept.",
  "tracking.describe.done.estimated":
    "Recorded - about {kcal} kcal, read from your words. This meal no longer counts as missed.",
  "tracking.describe.error": "That did not save - {message}",
  "tracking.describe.cancel": "Cancel",
} as const
