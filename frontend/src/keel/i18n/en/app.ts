// Seed anglais — le namespace `app`, et lui seul.
// Assemblé dans `../en.ts`; une clé `app.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enApp = {
  // Student app chrome
  "app.nav.today": "Today",
  // ⟳ chantier-0903/SUIVI (A7, D7.1) — « Progress » → « Tracking », « Health »
  // → « Safety ». `/app/progress` n'est plus une avancée qu'on note, c'est le
  // SUIVI de ce qui a été fait; et `/app/health` ne porte que les allergies,
  // intolérances et médicaments — c'est une page de sécurité, pas de santé.
  // Les CHEMINS ne bougent pas (`mealIdeasRemoved.int.test.ts` les verrouille).
  "app.nav.progress": "Tracking",
  "app.nav.chat": "Sophia",
  "app.nav.household": "Household",
  // `app.nav.cards` a été retirée avec l'onglet « Cards »: la page exigeait un
  // plan publié que le modèle 1:N ne produit jamais. Rien ne la lit plus.
  // Libellés courts: la barre d'onglets du téléphone donne 75 px par colonne,
  // et « My week's plan » y tiendrait sur trois lignes.
  //
  // ⟳ DEUX DE PLUS LE 2026-09-09, ET C'EST LE « + » QUI LES A RENDUS
  // NÉCESSAIRES. La barre est passée de quatre colonnes à cinq: 93 px sont
  // devenus 75 px à 375 px de large, et 64 px à 320 px (iPhone SE). MESURÉ à
  // 320 px, en français: « Aujourd'hui » réclame 75 px et « Conversation »
  // 84 px pour 48 px de texte disponibles — les deux se coupaient à l'ellipse,
  // dont l'onglet ACTIF. L'anglais tenait: « Today » et « Chat » sont deux fois
  // plus courts, et c'est exactement le piège de la garde vérifiée dans une
  // seule langue que ce dépôt a déjà payé — la forme courte est donc écrite
  // dans les deux packs, même là où elle ne change rien.
  "app.nav.today.short": "Today",
  "app.nav.chat.short": "Sophia",
  "app.nav.plan.short": "Plan",
  "app.plan_untitled": "Your plan",
  "app.guard.checking": "Checking your access...",
  // ── FF-064 · LE MUR DE PAIEMENT ─────────────────────────────────────────
  // Six phrases venues de `household.paused.*` (2026-09-09), inchangées.
  // ⛔ NI DATE, NI MONTANT, NI DÉCOMPTE ICI, et ce n'est pas un oubli: une fois
  // le foyer gelé, la date de reprise est derrière le tunnel Stripe, qui en est
  // la source. L'écrire ici en ferait une seconde — celle qui se trompe le jour
  // où quelqu'un prolonge un essai à la main. Le décompte AVANT le gel, lui,
  // est légitime: sa source est `households.free_until`, notre colonne.
  "app.paywall.title": "Your household is paused",
  "app.paywall.body":
    "New weeks are not being composed right now. Nothing you set up has moved.",
  "app.paywall.kept":
    "Nothing has been deleted. Everyone here, their ages, their allergies and their directions are exactly where you left them, and they come straight back.",
  "app.paywall.resume_cta": "Start it again",
  "app.paywall.working": "Opening...",
  "app.paywall.owner_only":
    "Whoever set this household up can start it again from their own account.",
  "app.paywall.cta_billing": "See my subscription",
  "app.paywall.account": "My account",
  "app.guard.not_student_title": "This space is for students",
  "app.guard.not_student_body":
    "Your account is not following a coach's plan. Ask your coach for an invitation.",
  // « My week » ne disait pas ce qu'on y fait. L'écran est celui où l'élève
  // CONSTRUIT sa semaine alimentaire; le nom doit porter le mot « plan ».
  "app.nav.plan": "My plan",
  "app.nav.about_you": "What Sophia knows",
} as const
