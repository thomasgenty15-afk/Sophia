// Seed anglais — le namespace `start`, et lui seul.
// Assemblé dans `../en.ts`; une clé `start.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enStart = {
  // ── /start — l'inscription libre ────────────────────────────────────────
  //
  // Le registre est différent de `join.*` et ce n'est pas un accident. Sur
  // /join, quelqu'un a déjà choisi cette personne: le texte peut parler de
  // « votre coach ». Ici personne ne l'attend, et la page doit être honnête sur
  // ce qu'elle offre — un programme générique — sinon un testeur rend un avis
  // sur un produit qui n'existe pas.
  // ── /start — LA PORTE D'INSCRIPTION DU FOYER ──────────────────────────────
  //
  // ⚠️ CETTE PAGE NE VEND PLUS RIEN, ET C'EST LE POINT (2026-08-12).
  // Elle vendait « le programme de découverte KEEL »: un nom INTERNE affleurant
  // dans une surface utilisateur, la boucle quotidienne d'un ÉLÈVE (photographier
  // un repas, trois appuis le soir), et une section dont le titre disait
  // « Ce programme ne te connaît pas » — le contraire exact de ce que le hall
  // promet trois clics plus tôt, un produit qui décrit chaque bouche, ses
  // objectifs et ses allergies. Quelqu'un qui clique « Commencer » depuis `/`
  // atterrissait donc sur la page qu'un élève invité par un coach retrouve.
  //
  // La vente a eu lieu sur le hall et sur la page segment. Ici on demande un
  // compte, et c'est tout. Douze clés sont parties (`start.day.*`,
  // `start.limit.*`, `start.form.title`); le mot « KEEL » n'apparaît nulle part.
  //
  // ⚠️ CE QUI RESTE EST UN CHEMIN DE SÉCURITÉ: le champ PAYS et son aide. Voir
  // le commentaire du champ plus bas, et l'en-tête de la migration
  // `20260811060000_household_signup_door.sql`.
  "start.seo_title": "Create your account",
  "start.seo_description":
    "Open your Sophia account. Sophia composes the week around the people " +
    "who actually eat at your table.",
  "start.loading": "One moment…",

  // ⚠️ AUCUNE PROMESSE DE CALENDRIER ICI, ET C'EST MESURÉ. « Then » décrit la
  // FORME du produit (le compte, puis les bouches), pas l'écran suivant: un
  // inscrit de cette page atterrit sur `/app/chat`, et rien ne le conduit à
  // `/app/setup` dans cette session-là. Écrire « trois étapes vous attendent »
  // serait une promesse que le code ne tient pas. Voir l'en-tête de
  // `StartPage.tsx`, § « le trou mesuré ».
  "start.title": "Create your account.",
  "start.lead":
    "First the account. Then you describe who eats at your table and what each " +
    "of them needs — that is what Sophia builds the plan around.",

  // fact: le prix est celui du hall (`home.hero.price`), au mot près.
  // ⚠️ AUCUNE DURÉE D'ESSAI, AUCUN BOUTON D'ACHAT: le tunnel de paiement du
  // foyer rend 500 faute de prix Stripe, et `free_until` gèle un foyer neuf à
  // J+31 sans chemin pour se dégeler. Le prix se dit; la date, non.
  // ⚠️ `start.price` RETIRÉE LE 2026-09-01 — voir le pack FR. Le pack ANGLAIS
  // y écrivait « 11,99 € a month … plus 2 € »: virgule décimale et symbole à
  // droite, c'est-à-dire la convention FRANÇAISE servie à un lecteur
  // anglophone, sur la page où il ouvre son compte. Les montants passent
  // désormais par `formatPrice`, qui ne peut pas se tromper de convention.
  // La porte de quelqu'un qui a DÉJÀ un coach est l'invitation qu'il a reçue,
  // pas celle-ci. Une ligne, parce que c'est utile et que c'est vrai.
  "start.coach_line":
    "A coach invited you? Your door is the link in their email, not this one.",

  // Le fronton de la fiche — même idiome que `/auth`: l'écran est un document
  // qui se nomme, et la fiche est l'endroit où l'on écrit.
  "start.sheet.form": "Sign-up",
  "start.sheet.repair": "Attachment",

  "start.form.name": "Your first name",
  "start.form.email": "Email address",
  "start.form.password": "Password",
  "start.form.password_hint": "At least 8 characters.",
  // ⚠️ CE BLOC A REMPLACÉ LA QUESTION DU PAYS, ET LE REMPLACEMENT EST LA
  // DÉCISION. « Où vous vivez » se justifiait par le numéro d'urgence — un
  // sujet que le produit ne traite pas aujourd'hui — et occupait la place
  // de la seule réponse qui change quelque chose tous les jours. Le pays se
  // déduit désormais du fuseau (`api/countryFromTimezone.ts`).
  //
  // ⚠️ PAS D'INDICE SOUS CE CHAMP, ET C'EST DÉLIBÉRÉ (2026-09-01). Il disait
  // « votre coach vous répond dans cette langue, et écrit votre plan dedans »
  // — sur l'écran d'inscription LIBRE, à quelqu'un qui n'a précisément pas de
  // coach. Il annonçait un tiers absent au moment exact où la personne ouvre
  // son compte, et depuis le lancement B2C il n'y en a plus du tout à
  // rencontrer. Le libellé se suffit; ne rajoute pas d'indice ici sans avoir
  // quelque chose de VRAI à dire de plus que lui.
  "start.form.language":
    "The language you want to be spoken to in",
  "start.form.legal_prefix": "I accept the",
  "start.form.legal_terms": "Terms",
  "start.form.legal_and": "and the",
  "start.form.legal_privacy": "Privacy Policy",
  // « Create my account » et plus « Start the program »: le bouton dit ce qui
  // se passe quand on le presse, et une action garde son nom sur tout le
  // parcours — c'est le même geste que la fiche FOYER de `/auth`.
  "start.form.cta": "Create my account",
  "start.form.submitting": "Creating your account…",
  "start.form.have_account": "Already have an account?",
  "start.have_account_cta": "Sign in",

  "start.repair.title": "One field left.",
  "start.repair.body":
    "Your account exists but it is not attached yet. Tell us where you live and " +
    "it will be, in one click.",
  "start.repair.cta": "Attach my account",

  // ⚠️ LE TEXTE DIT QUE LE COMPTE EST CRÉÉ ET DÉJÀ RATTACHÉ, et ce n'est pas une
  // formule rassurante: `handle_new_user()` rattache DANS la transaction du
  // signup, pas à l'ouverture de la boîte mail. Écrire « on terminera quand vous
  // reviendrez » serait faux, et laisserait croire qu'un mail non ouvert coûte
  // le rattachement.
  // ⚠️ « already attached » EST ÉPINGLÉ PAR UN TEST (`startCheckEmail.int.test.ts`,
  // qui exige `/already attached/i` ici et `/déjà rattaché/i` en face). Ce n'est
  // pas une formule: le rattachement a lieu dans la transaction du signup, et
  // une phrase qui promettrait « on terminera quand vous reviendrez » ferait
  // croire qu'un mail non ouvert le coûte.
  "start.check_email.title": "Confirm your email address.",
  "start.check_email.body":
    "Your account is created and already attached — the email only opens your " +
    "session. Open the confirmation we just sent, and it takes you straight to " +
    "the three steps that build your first plan.",

  // ⚠️ LE BOUTON OUVRE L'ENTONNOIR, ET LE TEXTE DIT ÇA. `StartPage` navigue en
  // dur vers `/app/setup` (et `emailRedirectTo` y pointe aussi); décrire ici
  // une autre destination ferait mentir l'écran d'après.
  //
  // La copie promet TROIS ÉTAPES ET UN PLAN, ce que l'écran suivant tient
  // vraiment. Elle disait « la conversation est là où ça commence » quand le
  // bouton ouvrait la bulle — qui ne pousse rien et n'a rien à montrer avant
  // qu'un plan existe.
  "start.joined.title": "Your account is ready.",
  "start.joined.body":
    "Three short steps and your first plan is composed. Nothing is prepared for you in the background — you answer, and it gets built.",
  "start.joined.cta": "Set up your kitchen",
  "start.existing.title": "You already have an account.",
  "start.existing.body":
    "That address is already registered. Sign in and we will pick up right here.",
  "start.existing.cta": "Sign in",

  "start.unavailable.title": "Sign-up is paused.",
  "start.unavailable.body":
    "We are not creating accounts right now, because a new one would have nothing " +
    "to run on. Try again a little later — and if a coach invited you, use the " +
    "link in their email instead.",

  // Les refus. Chacun dit ce qui s'est passé ET l'état du compte: « rien n'a
  // changé » est la moitié qui manque presque toujours, et c'est celle qui évite
  // qu'on réessaie en craignant d'avoir créé un compte à moitié.
  // ⚠️ LES CINQ NOMS DE CLÉ SONT UN CONTRAT. `joinRefusalMessageKey`
  // (`api/freeSignup.ts:125`) les rend depuis le `reason` de la base: les
  // renommer casse le mapping en silence, et le repli `generic` avalerait tout.
  "start.error.legal":
    "Accept the Terms and the Privacy Policy to continue.",
  "start.error.already_coached":
    "Your account already follows a coach. You do not need to sign up here.",
  "start.error.caller_is_coach":
    "This is a coach account. Your space is the coach workspace, not this one.",
  "start.error.unavailable":
    "Sign-up is not available right now. Nothing was created — try again later.",
  "start.error.generic": "That did not go through. Nothing changed — try again.",
} as const
