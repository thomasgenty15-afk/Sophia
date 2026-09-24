// Seed anglais — le namespace `auth`, et lui seul.
// Assemblé dans `../en.ts`; une clé `auth.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enAuth = {
  // ── /auth — LA PORTE UNIQUE DU PRODUIT ────────────────────────────────────
  //
  // Ces quatre-là existaient seules: le reste de l'écran était en dur, en
  // anglais, sur 1 297 lignes. Un visiteur qui lisait le site en français
  // cliquait « Se connecter » et tombait sur « Good to see you again. » — la
  // couture exacte que `pageFrontier.int.test.ts` existe pour interdire, sur la
  // seule page que TOUT LE MONDE traverse.
  //
  // ⚠️ LE NAMESPACE EST DÉSORMAIS TOUT-OU-RIEN. `/auth` est déclarée dans
  // `PAGE_NAMESPACES`: une seule chaîne laissée en dur ici rouvre la
  // couture, et aucun type ne la voit — le compilateur garde les clés, pas les
  // littéraux qu'on oublie de passer par `t()`.
  //
  // Ce qui N'EST PAS traduit, et c'est délibéré: les messages d'erreur rendus
  // par Supabase Auth (`err.message`). Ils viennent du serveur, ils ne sont pas
  // nos chaînes, et les mapper un par un serait une table qui rouille à chaque
  // version du service. Les nôtres sont tous ci-dessous.

  // Le titre de l'onglet. `/auth` n'est pas dans le sitemap (porte
  // fonctionnelle, pas page de vente): l'écran se déclare `noindex`.
  "auth.seo.title": "Sign in",
  "auth.seo.title_coach": "Coach account",
  "auth.seo.description":
    "Sign in to Sophia, or create the account that gets you in.",

  // ── LE FRONTON DE LA FICHE ────────────────────────────────────────────────
  // L'écran est UN document qui se reconfigure, pas quatre écrans. Son fronton
  // le nomme, et c'est la seule chose qui change entre ses quatre états.
  "auth.sheet.signin": "Sign in",
  "auth.sheet.coach": "Coach account",
  "auth.sheet.reset": "Password",
  "auth.sheet.confirm": "Email verification",

  // ── LES QUATRE ÉTATS, EN TÊTE ─────────────────────────────────────────────
  "auth.signin.title": "Welcome back.",
  "auth.signin.lede": "The same door, whichever account you have.",
  // ⚠️ « the method it follows », et PAS « the prescription tools ». La copie
  // d'avant vendait un outil de prescription 1:1, que ce produit n'a pas: le
  // coach écrit une doctrine et un programme pour sa COHORTE, et c'est l'élève
  // qui compose sa semaine avec (docs/keel/MODEL.md).
  "auth.coach.signup_title": "Create your coach account.",
  "auth.coach.signup_lede":
    "Your students get the app. You write the method it answers with. No phone number needed.",
  "auth.coach.signin_title": "Back to your workspace.",
  "auth.coach.signin_lede": "Sign in to the coach workspace.",
  "auth.reset.title": "Reset your password.",
  "auth.reset.lede":
    "Enter your address. We send a link that opens the page where you choose a new password.",

  // ── LES CHAMPS ────────────────────────────────────────────────────────────
  // Pas de `placeholder`: l'étiquette dit déjà ce qu'on attend, et un exemple
  // gris dans le champ disparaît à la première frappe — c'est-à-dire au moment
  // où on en aurait besoin.
  "auth.field.email": "Email address",
  "auth.field.password": "Password",
  "auth.field.password_show": "Show password",
  "auth.field.password_hide": "Hide password",
  "auth.field.name": "Your name",
  "auth.field.name_hint": "How your students see you.",
  "auth.field.language":
    "The language you want to work in",
  "auth.field.language_hint":
    "Your workspace and your students' coaching happen in this language. You can change it later.",
  "auth.field.forgot": "Forgotten your password?",

  // ── LES GESTES ────────────────────────────────────────────────────────────
  "auth.action.signin": "Sign in",
  "auth.action.coach_signup": "Create my coach account",
  "auth.action.working": "Working…",
  "auth.action.send_link": "Send the link",
  "auth.action.sending": "Sending…",
  "auth.action.back_to_signin": "Back to sign-in",

  "auth.legal.prefix": "I accept the",
  "auth.legal.terms": "Terms",
  "auth.legal.and": "and the",
  "auth.legal.privacy": "Privacy Policy",

  // ── LES PRÉFÉRENCES D'INSCRIPTION ─────────────────────────────────────────
  "auth.prefs.title": "Preferences",
  "auth.prefs.language": "Language",
  "auth.prefs.language_value": "English",
  "auth.prefs.language_hint": "The coach workspace ships in English.",
  "auth.prefs.timezone": "Time zone",
  "auth.prefs.tz_device": "{timezone} (device)",
  "auth.prefs.tz_profile": "{timezone} (profile)",
  "auth.prefs.roaming": "Roaming",
  "auth.prefs.roaming_hint": "Follow the device time zone automatically.",
  "auth.prefs.roaming_toggle": "Follow the device time zone",

  // ── L'ÉTAT « VÉRIFIEZ VOS MAILS » ─────────────────────────────────────────
  "auth.confirm.title": "Check your inbox.",
  "auth.confirm.body":
    "A confirmation link is on its way to {email}. Click it, then come back here — this page updates on its own.",
  "auth.confirm.spam": "Nothing there? The spam folder is the next place to look.",
  "auth.confirm.waiting": "Waiting for the verification…",
  "auth.confirm.checking": "Checking…",
  "auth.confirm.check_cta": "I clicked the link",
  "auth.confirm.resend": "Resend the confirmation email",
  "auth.confirm.resend_wait": "Resend in {seconds}s",
  "auth.confirm.change_email": "Use a different address",
  "auth.confirm.not_verified":
    "Not verified yet. Click the link in your email, then come back here.",
  "auth.confirm.check_failed": "The check could not run. Try again.",
  "auth.confirm.verified_title": "Email verified.",
  "auth.confirm.verified_body": "Setting up your space…",
  "auth.confirm.retry": "Try again",

  // ── LES DEUX DESTINATIONS ─────────────────────────────────────────────────
  // Le site a deux mondes qui n'ont ni le même acheteur ni la même inscription.
  // `?w=household` / `?w=pro` décide lequel est MIS EN AVANT ici; sans le
  // paramètre, les deux sont proposés à égalité.
  "auth.doors.divider": "No account yet?",
  // ⚠️ NE REMETS PAS « Household » / « Foyer » ICI. Deux raisons, et la
  // seconde survit à la réouverture du monde pro:
  //
  // 1. Un libellé d'AUDIENCE n'a de sens qu'en face de son contraire. Tant que
  //    `VITE_B2C_ONLY` est levé, la carte « Professional » est retirée et
  //    celle-ci est la SEULE: « Foyer » ne distingue alors plus rien, il
  //    demande juste au visiteur de se ranger dans une catégorie avant de
  //    pouvoir créer un compte.
  // 2. « Foyer » est le mot du MODÈLE (`household_members`, `/app/household`,
  //    docs/keel/PIVOT-FOYER.md), pas un mot que quelqu'un s'applique à
  //    lui-même au moment de s'inscrire. Décision humaine du 2026-09-01: il
  //    porte à confusion sur le couloir d'entrée, et il en est retiré. Il reste
  //    partout ailleurs — c'est du vocabulaire interne, et il est juste.
  //
  // Le mot du produit pour la même chose, côté visiteur, est « votre table »
  // (le corps juste en dessous, `start.lead`, `start.price`).
  "auth.doors.household.label": "Your Sophia account",
  // ⚠️ PAS « sans coach ». L'absence d'un coach ne définit pas le produit du
  // foyer — elle le décrit comme une version amputée de l'autre monde, ce que
  // `/start` disait aussi (« Try it without a coach first ») et qui vient d'en
  // être retiré. Ce que le foyer achète est POSITIF: la semaine composée autour
  // des gens qui mangent vraiment à cette table.
  "auth.doors.household.body":
    "Open your account and compose your week around who eats at your table.",
  "auth.doors.household.cta": "Create a free account",
  "auth.doors.household.prompt": "Cooking at home?",
  "auth.doors.pro.label": "Professional",
  "auth.doors.pro.body":
    "Write your method once. Your students compose their week inside it.",
  "auth.doors.coach_divider_signup": "Already have a coach account?",
  "auth.doors.coach_divider_signin": "No coach account yet?",

  // ── LES REFUS, ET ILS DISENT TOUS QUOI FAIRE ENSUITE ──────────────────────
  "auth.error.legal": "Accept the Terms and the Privacy Policy to continue.",
  "auth.error.student_signup_moved":
    "Student sign-up has moved. Open /start to create your account, or use the link your coach emailed you.",
  "auth.error.prelaunch_signup":
    "Sign-up is closed (pre-launch). Sign in with the master_admin account.",
  "auth.error.prelaunch_forbidden":
    "Access is restricted (pre-launch). Only the master_admin account can sign in.",
  "auth.error.coach_profile":
    "Your account exists, but the coach profile could not be created. Sign in again to retry.",
  // LANCEMENT B2C — le refus de porte. Il dit les DEUX choses dont la
  // personne a besoin: pourquoi elle ne rentre pas, et que son compte est
  // toujours là. Sans la seconde, la seule lecture possible est « mon compte a
  // été supprimé », et on écrit au support.
  "auth.error.pro_closed":
    "The coach workspace is closed for now. Your account is intact — we will write to you when it reopens.",
  // Le sign-in a RÉUSSI et seule la lecture de rôle a échoué: sans cette
  // phrase, la seule lecture possible est « mon mot de passe est faux », et on
  // réinitialise un compte qui va très bien.
  "auth.error.server_unreachable":
    "You're signed in, but we can't reach the server to open your space. Try again in a moment.",
  "auth.error.generic": "Something went wrong.",
  "auth.error.reset_failed": "The email could not be sent.",
  // Diagnostic d'exploitation, pas de visiteur: Supabase Auth rend une erreur
  // générique quand le SMTP est mal configuré, et sans ces deux endroits à
  // regarder personne ne sait par où commencer.
  // ⚠️ Aucune flèche « → »: elle n'a de glyphe dans AUCUNE des deux familles
  // du site (CHARTE §0 ④), et tomberait en repli système au milieu du mot.
  "auth.error.reset_smtp":
    "The password reset email could not be sent.\n\nSupabase Dashboard / Auth / SMTP: custom SMTP enabled but incomplete, wrong credentials, or an unverified sender domain.\nAuth / URL Configuration: the redirect allowlist must contain {origin}/reset-password.\n\nDetail: {detail}",
  "auth.reset.sent": "If an account exists for {email}, a reset email is on its way.",
  "auth.reset.sent_local": "Local stack: open http://127.0.0.1:54324 to read it.",

  "auth.prelaunch.badge": "Restricted access (pre-launch) · master_admin only",


  // Auth page cross-links (the two doors reference each other)
  "auth.coach_link.prompt": "Are you a coach?",
  "auth.coach_link.cta": "Create a coach account",
  "auth.coach_link.back_prompt": "Not a coach?",
  "auth.coach_link.back_cta": "Go to the standard sign-in",

  // ═════════════════════════════════════════════════════════════════════════
  // /email-verified — LE RETOUR DU LIEN DE CONFIRMATION
  //
  // Écran du chemin heureux coach: `emailRedirectTo` d'`Auth.tsx` y renvoie.
  // Il portait cinq phrases en dur et pas un seul `t()` — donc un coach qui
  // s'inscrivait en français recevait un e-mail français et atterrissait sur
  // un écran anglais, sur la seule page qui confirme que son compte existe.
  //
  // Deux phrases de clôture et pas une, parce que les deux situations ne se
  // ressemblent pas: avec `?code`, la session est déjà échangée dans l'onglet
  // d'origine et celui-ci ne sert plus à rien; sans, on ne peut que supposer
  // que le lien vient d'être cliqué. Dire « c'est fait » dans les deux cas
  // affirmerait quelque chose qu'on ne sait pas.
  // ═════════════════════════════════════════════════════════════════════════
  "auth.verified.title": "Email confirmed!",
  "auth.verified.body": "Thank you for taking the time to confirm your address.",
  "auth.verified.back_to_tab": "You can go back to the original tab",
  "auth.verified.carry_on": "to carry on.",
  "auth.verified.close_tab": "You can close this tab.",
  "auth.verified.close_tab_maybe":
    "If you have just clicked the link, you can close this tab.",
} as const
