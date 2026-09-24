// Seed anglais — le namespace `shell`, et lui seul.
// Assemblé dans `../en.ts`; une clé `shell.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enShell = {
  // App shell (connected chrome, coach + student)
  "shell.nav.students": "Students",
  "shell.nav.templates": "Templates",
  // « Recommended food » et pas « Method »: l'écran ne demande plus une
  // posture sur des groupes abstraits, il demande les ALIMENTS avec lesquels le
  // coach construit. Le mot qu'il emploie pour ça n'est pas « protocole ».
  "shell.nav.protocol": "Recommended food",
  "shell.nav.doctrine": "Doctrine",
  // La bibliothèque de recettes. Elle existait en base, en fonction edge et en
  // API cliente depuis le 04/08 — sans un seul écran pour l'atteindre. « UNE
  // ROUTE SANS LIEN EST UNE FONCTIONNALITÉ QUE PERSONNE N'A »; ici il n'y avait
  // même pas de route.
  "shell.nav.meals": "Meals",
  "shell.nav.weekly": "This week",
  "shell.nav.account": "Account",
  "shell.nav.billing": "Subscription",
  // Le guide `/installer-app` (ajouter Sophia à l'écran d'accueil). Sous le
  // séparateur du menu, avec le compte: ce qu'on consulte, pas ce qu'on habite.
  "shell.nav.install_app": "Install the app",
  // FF-064 — le compte à rebours de la semaine offerte, dans la coquille.
  // `{days}` est déjà pluralisé par `plural()` au site d'appel: les deux formes
  // sont des clés à part, parce que le français dit « 0 jour » et l'anglais
  // « 0 days ».
  "shell.trial.ending": "Your free week ends in {days}.",
  // ⚠️ SOUS `shell` ET PAS SOUS `billing`, ET C'EST MESURÉ. Le bandeau est
  // monté dans la coquille, donc il rend ces deux formes sur CHAQUE écran de
  // l'app — `pageSeams` a rougi sur sept pages qui « atteignaient billing.* »
  // sans rien avoir à voir avec l'abonnement. La page d'abonnement les lit
  // aussi: elle déclare `shell`, comme tout écran qui monte la coquille.
  "shell.trial.days_one": "{count} day",
  "shell.trial.days_many": "{count} days",
  "shell.trial.cta": "See my subscription",
  "shell.trial.dismiss": "Hide until tomorrow",
  "shell.nav.legal": "Legal",
  "shell.nav.sign_out": "Sign out",
  // Le menu du téléphone. « Menu » et pas une icône hamburger seule: rien
  // d'autre dans ce produit n'est une icône, et un glyphe isolé au milieu de
  // libellés en toutes lettres se lit comme un bouton décoratif.
  "shell.nav.menu": "Menu",
  "shell.nav.menu_close": "Close",
  "shell.nav.primary": "Main sections",
  // ── LA LÉGENDE DU « + », ET POURQUOI ELLE EST COURTE ────────────────────
  // Le signe seul ne dit pas ce qu'il ouvre. Les onglets autour portent un mot;
  // celui-ci aussi. La forme visible tient dans ~60 px (cinq colonnes à 320 px)
  // et s'autorise deux lignes. L'`aria` porte la raison qu'une colonne ne peut
  // pas écrire: pour que le plat hors du plan soit pris en compte.
  "shell.quick_add.caption": "Off the plan",
  "shell.quick_add.aria":
    "Add a meal that isn't on the plan, so it is counted",
} as const
